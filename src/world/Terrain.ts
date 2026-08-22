import * as THREE from 'three';
import {
  Field, LANDMARKS, gnoise2, N, HALF, CELL, FAR_N, FAR_HALF, FAR_CELL, BLEND_OUT,
} from './terrain/Field.ts';
import { Clipmap } from './terrain/Clipmap.ts';
import { loadBaked } from './terrain/FieldBake.ts';
import { bootPhase } from '../engine/BootProfile.ts';
import { buildLayerTextures, LAYER_NAMES, LAYER_AVG } from './terrain/Layers.ts';
import { buildBiomeLut, surfaceAt } from './terrain/Biome.ts';
import {
  createTerrainMaterial, createTerrainDepthMaterial, makeTerrainUniforms, patchGBufferMaterial,
} from './terrain/TerrainMaterial.ts';
import { worldMap, WORLD } from './map/WorldMap.ts';
import type { WorldMap } from './map/WorldMap.ts';

/**
 * The land of Lucis: an 8.2 km field covering Leide, Duscae and Cleigne, drawn
 * with a camera-centred geometry clipmap and a six-layer height-blended,
 * triplanar splat shader.
 *
 * The shape of the world is **not** authored here. `world/map/WorldMap.js` owns
 * the zones, the points of interest, the required landforms and the road graph;
 * `terrain/Field.js` realises them. Change the map and the ground follows.
 *
 * Cross-system contract:
 *   heightAt(x, z)      -> number      exact surface height, bilinear cached
 *   normalAt(x, z, out) -> Vector3     surface normal
 *   sampleMaterial(x,z) -> {...}       dominant material + weights
 *   roadDistance(x, z)  -> number      metres to the dirt road centreline
 *   road                               spline: points / pointAt(s) / width
 *   landmarks                          named hero features for shot framing
 */
export class Terrain {
  /**
   * The originals, while `Dungeons` has ground queries redirected to a dungeon
   * floor. Set by `Dungeons._patchTerrain` and cleared on the way out --
   * declared here because a monkey patch that nothing declares is a monkey
   * patch nobody can find.
   */
  __dungeonPatch?: {
    origH: (x: number, z: number) => number,
    origN: (x: number, z: number, out?: THREE.Vector3) => THREE.Vector3,
  } | null;
  _bio!: any;
  _biome!: any;
  _ctrl!: any;
  _gbufferPatched!: boolean;
  _roadIdx!: any;
  _v!: THREE.Vector3;
  clipmap!: any;
  field!: Field;
  game!: any;
  landmarks!: any;
  layerNames!: string[];
  map!: WorldMap;
  res!: any;
  road!: any;
  size!: number;
  stats!: any;
  textures!: any;
  constructor() {
    /** Full span of the detailed heightfield, metres. */
    this.size = HALF * 2;
    /** Hero landmark anchors, world space (resolved out of the map). */
    this.landmarks = LANDMARKS;
    /** The authoritative world definition. */
    this.map = worldMap;
    this.layerNames = LAYER_NAMES;
    this._v = new THREE.Vector3();
    this._ctrl = {};
  }

  async init(game: any) {
    this.game = game;

    this.field = new Field(game.seed || 1337);
    // A baked heightfield is just the cached output of `Field.build()` — same
    // generator, same seed, run in the build step instead of on every page
    // load. Missing or stale artifacts fall through to generating in place.
    const baked = await bootPhase('Terrain.bake', () => loadBaked());
    if (baked) bootPhase('Terrain.apply', () => baked.applyTo(this.field));
    else bootPhase('Terrain.field', () => this.field.build());
    this.road = this.field.roadSpline;

    const quality = game.rnd ? game.rnd.quality : 'high';
    const layerSize = quality === 'low' ? 256 : 512;
    // The regional palette rides in two extra layers of the detail array rather
    // than a sampler of its own — see `terrain/Biome.js`. It is not baked: it
    // costs a few milliseconds and depends on the cartography, not on the layer
    // recipes, so baking it would only add a second staleness dependency.
    const detailSize = Math.min(512, layerSize);
    const lut = bootPhase('Terrain.biome', () => buildBiomeLut(detailSize));
    const layers = bootPhase('Terrain.layers',
      () => buildLayerTextures(layerSize, baked && baked.layers(), lut));
    this.textures = { ...layers, ...bootPhase('Terrain.upload', () => this._uploadFieldTextures()) };

    this.res = {
      uniforms: makeTerrainUniforms(this.textures, {
        HALF, CELL, N, BLEND_OUT, FAR_HALF, FAR_CELL, FAR_N,
      }, WORLD),
      finestCell: 1.5,
    };

    this.clipmap = bootPhase('Terrain.clipmap', () => new Clipmap({
      levels: 7,
      n: 48,
      cell0: 1.5,
      castShadow: true,
      makeMaterial: (cell, level) => ({
        surface: createTerrainMaterial(this.res, cell, level),
        depth: level <= 1 ? createTerrainDepthMaterial(this.res, cell) : null,
      }),
    }));
    game.scene.add(this.clipmap.group);
    this.clipmap.update(game.camera.position.x, game.camera.position.z);

    this.stats = {
      triangles: this.clipmap.triangles,
      drawCalls: this.clipmap.group.children.length,
      buildMs: this.field.stats.buildMs,
    };
    if (game.debug) console.log('[Terrain]', JSON.stringify(this.stats));
  }

  /** Upload the CPU grids as the textures the vertex/fragment shaders sample. */
  _uploadFieldTextures() {
    const f = this.field;

    // Linear filtering costs nothing here — the terrain shader reads these
    // through texelFetch and does its own bilinear — but it lets the weather
    // volume sample the ground height smoothly with a single fetch.
    const height = new THREE.DataTexture(f.h, N, N, THREE.RedFormat, THREE.FloatType);
    height.magFilter = height.minFilter = THREE.LinearFilter;
    height.wrapS = height.wrapT = THREE.ClampToEdgeWrapping;
    height.generateMipmaps = false;
    height.needsUpdate = true;

    const farHeight = new THREE.DataTexture(f.far, FAR_N, FAR_N, THREE.RedFormat, THREE.FloatType);
    farHeight.magFilter = farHeight.minFilter = THREE.LinearFilter;
    farHeight.wrapS = farHeight.wrapT = THREE.ClampToEdgeWrapping;
    farHeight.generateMipmaps = false;
    farHeight.needsUpdate = true;

    // Mipmaps on the normal fields. Without them a distant range minifies a
    // 12 m normal grid into a single pixel and the ridge lines crawl with
    // high-frequency zigzag aliasing — the "shimmering wallpaper" horizon.
    const normal = new THREE.DataTexture(f.nrm, N, N, THREE.RGFormat, THREE.HalfFloatType);
    normal.magFilter = THREE.LinearFilter;
    normal.minFilter = THREE.LinearMipmapLinearFilter;
    normal.wrapS = normal.wrapT = THREE.ClampToEdgeWrapping;
    normal.generateMipmaps = true;
    normal.anisotropy = 8;
    normal.needsUpdate = true;

    const farNormal = new THREE.DataTexture(f.farNrm, FAR_N, FAR_N, THREE.RGFormat, THREE.HalfFloatType);
    farNormal.magFilter = THREE.LinearFilter;
    farNormal.minFilter = THREE.LinearMipmapLinearFilter;
    farNormal.wrapS = farNormal.wrapT = THREE.ClampToEdgeWrapping;
    farNormal.generateMipmaps = true;
    farNormal.anisotropy = 8;
    farNormal.needsUpdate = true;

    const ctrl = new THREE.DataTexture(f.ctrl, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
    ctrl.magFilter = THREE.LinearFilter;
    ctrl.minFilter = THREE.LinearMipmapLinearFilter;
    ctrl.wrapS = ctrl.wrapT = THREE.ClampToEdgeWrapping;
    ctrl.colorSpace = THREE.NoColorSpace;
    ctrl.generateMipmaps = true;
    ctrl.needsUpdate = true;

    const farCtrl = new THREE.DataTexture(f.farCtrl, FAR_N, FAR_N, THREE.RGBAFormat, THREE.UnsignedByteType);
    farCtrl.magFilter = THREE.LinearFilter;
    farCtrl.minFilter = THREE.LinearMipmapLinearFilter;
    farCtrl.wrapS = farCtrl.wrapT = THREE.ClampToEdgeWrapping;
    farCtrl.colorSpace = THREE.NoColorSpace;
    farCtrl.generateMipmaps = true;
    farCtrl.needsUpdate = true;

    return { height, farHeight, normal, farNormal, ctrl, farCtrl };
  }

  // ------------------------------------------------------------------- query

  /**
   * Surface height at a world position — exactly what the GPU renders.
   */
  heightAt(x: number, z: number): number { return this.field.heightAt(x, z); }

  /**
   * Surface normal at a world position.
   */
  normalAt(x: number, z: number, out: THREE.Vector3 = new THREE.Vector3()): THREE.Vector3 {
    const e = CELL;
    const f = this.field;
    const hL = f.heightAt(x - e, z), hR = f.heightAt(x + e, z);
    const hD = f.heightAt(x, z - e), hU = f.heightAt(x, z + e);
    return out.set(hL - hR, 2 * e, hD - hU).normalize();
  }

  /**
   * How wet the ground is, 0..1. Damp ground darkens and smooths; above about
   * 0.15 standing water starts to gather in the erosion flow channels, the
   * sediment pans and the wheel ruts. Driven by `Weather`.
   * @param w 0..1
   */
  setWetness(w: number) {
    if (!this.res) return;
    this.res.uniforms.uWet.value.x = Math.max(0, Math.min(1, w));
  }

  /** Steepness in 0..1 (0 = flat, 1 = vertical). */
  slopeAt(x: number, z: number) {
    const n = this.normalAt(x, z, this._v);
    return 1 - n.y;
  }

  /**
   * Distance in metres from the road centreline. Cheap enough for scattering.
   */
  roadDistance(x: number, z: number): number {
    return this.field && this.field.network ? this.field.network.distance(x, z) : 1e5;
  }

  /**
   * The zone record covering this point, or null on the frontier.
   */
  zoneAt(x: any, z: any): any | null { return this.map.zoneAt(x, z); }

  /** Blended biome humidity, 0 = Leide badlands, 1 = the Vesperpool. */
  moistureAt(x: any, z: any) { return this.map.biomeAt(x, z, this._biome || (this._biome = {})).moist; }

  /**
   * X of the road centreline at a given Z.
   *
   * Vegetation/Props (`veg/Ecology.js`) probe for this and fall back to their
   * own approximate curve when it is missing — which would scatter grass and
   * roadside props along a line the terrain never carved. Exposing it keeps
   * every system agreeing on where the road actually is.
   */
  roadCenterX(z: number): number {
    const road = this.road;
    if (!road || !road.points || road.points.length < 2) return 0;
    const pts = road.points;

    // The highway runs broadly north-south, so bracket by Z and lerp. Scan
    // from a cached index since callers sweep Z coherently while scattering.
    let i = this._roadIdx || 0;
    if (i >= pts.length - 1 || !this._bracketsZ(pts, i, z)) {
      i = this._findRoadSegment(pts, z);
      this._roadIdx = i;
    }
    const a = pts[i], b = pts[i + 1];
    const dz = b.z - a.z;
    const t = Math.abs(dz) < 1e-6 ? 0 : (z - a.z) / dz;
    return a.x + (b.x - a.x) * Math.max(0, Math.min(1, t));
  }

  _bracketsZ(pts: any, i: number, z: number) {
    const a = pts[i].z, b = pts[i + 1].z;
    return z >= Math.min(a, b) && z <= Math.max(a, b);
  }

  /** Nearest segment in Z; falls back to the closest endpoint off the ends. */
  _findRoadSegment(pts: any, z: number) {
    let best = 0, bestD = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      if (this._bracketsZ(pts, i, z)) return i;
      const d = Math.min(Math.abs(pts[i].z - z), Math.abs(pts[i + 1].z - z));
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /**
   * Rough surface classification, mirroring the splat weights the shader uses.
   * Vegetation should look at `weights.grass` and `sediment`.
   */
  sampleMaterial(x: number, z: number): any {
    const f = this.field;
    const c: any = f.ctrlAt(x, z, this._ctrl);
    const h = f.heightAt(x, z);
    const slope = this.slopeAt(x, z);
    // identical fields to the ones the splat shader evaluates
    const m1 = gnoise2(x * 0.0017, z * 0.0017);
    const m2 = gnoise2(x * 0.0072 + 21, z * 0.0072 + 21);
    const p1 = gnoise2(x * 0.0125 + 3.3, z * 0.0125 + 3.3);
    const p2 = gnoise2(x * 0.043 - 9.1, z * 0.043 - 9.1);
    const patchN = 0.62 * p1 + 0.38 * p2;
    // Regional palette — the CPU twin of the shader's two biome-LUT fetches.
    // Only `green` reaches the weights; the tints are colour-only.
    const bio = surfaceAt(x, z, this._bio || (this._bio = {
      ground: [0, 0, 0], rock: [0, 0, 0], green: 0, damp: 0,
    }));
    const green = bio.green;
    const dryness = Math.max(0, Math.min(1, 0.5 + 0.45 * m1 + 0.55 * patchN - 0.40 * green));
    const flatAmt = 1 - ss(0.06, 0.28, slope);
    // A humid basin's grassland sits at 66-120 m and Cleigne's shelf at 100 m,
    // so a fixed 48-120 m gate switched the grass off in exactly the regions
    // that are defined as green. The gate now rises with the region itself.
    const lowAlt = 1 - ss(48 + 190 * green, 120 + 320 * green, h);

    // ctrl.r doubles as the road lateral offset where the mask is set
    const flow = c.road > 0.02 ? 0 : c.flow;
    const w = {
      sand: flatAmt * lowAlt * (0.14 + 1.05 * c.sediment + 1.70 * ss(0.60, 0.95, dryness))
        * (1 - 0.80 * green),
      dirt: 0.72 + 0.55 * (0.5 + 0.5 * p2) - 1.35 * ss(0.10, 0.44, slope),
      gravel: ss(0.14, 0.42, slope) * (0.5 + 0.8 * (0.5 + 0.5 * m2))
        + 1.20 * flow + 0.40 * c.rocky
        + 0.62 * ss(0.34, 0.04, dryness) * flatAmt * (1 - 0.70 * green),
      rock: ss(0.20, 0.48, slope) * 1.80 + 1.10 * c.rocky + 0.65 * ss(80, 175, h),
      grass: flatAmt * lowAlt * (1.30 + 3.20 * green)
        * ss(0.12 - 0.26 * green, 0.66 - 0.44 * green,
          0.42 * flow + 0.36 * patchN + 0.22 * m1 + 0.17 + 0.14 * c.sediment),
      road: c.road * 5.5 * (1 - ss(0.30, 0.55, slope)),
    };
    // talus / scree band under the cliffs — mirrors the shader exactly
    const scree = ss(0.15, 0.31, slope) * (1 - ss(0.33, 0.52, slope)) * ss(0.30, 0.70, c.rocky)
      * (0.55 + 0.45 * (0.5 + 0.5 * gnoise2(x * 0.021 - 3, z * 0.021 - 3)));
    w.gravel += 0.70 * scree;
    w.rock -= 0.26 * scree;
    let sum = 0;
    for (const k in w) { w[k as keyof typeof w] = Math.pow(Math.max(w[k as keyof typeof w], 0), 1.7); sum += w[k as keyof typeof w]; }
    sum = Math.max(sum, 1e-4);
    let best = 'dirt', bestV = -1;
    for (const k in w) { w[k as keyof typeof w] /= sum; if (w[k as keyof typeof w] > bestV) { bestV = w[k as keyof typeof w]; best = k; } }

    return {
      id: LAYER_NAMES.indexOf(best),
      name: best,
      weights: w,
      slope,
      height: h,
      flow,
      sediment: c.sediment,
      rocky: c.rocky,
      road: c.road,
      roadDist: this.roadDistance(x, z),
      // The two macro noise fields and the blended palette entry, handed back
      // rather than recomputed: `groundColorAt` needs exactly these and
      // `surfaceAt` is a nineteen-zone Gaussian blend, not a free call.
      // `bio` is the shared scratch object — read it before the next call.
      m1,
      m2,
      bio,
    };
  }

  /**
   * Linear albedo of the ground as the terrain shader actually draws it.
   *
   * **This function is why every plant in the world was the wrong colour.**
   * `veg/Ecology.js` `groundColor()` calls `Terrain.groundColorAt` if it
   * exists and `Terrain.colorAt` if that does not — and neither existed, so
   * for the whole life of the project every blade, bush and tree tinted itself
   * from Ecology's own fallback ramp: a hard-coded `C_SOIL_RED` → `C_SOIL_DRY`
   * → `C_SOIL_WET` lerp driven by moisture. That ramp is a warm brown
   * everywhere. Measured at the Fallgrove it returns linear luminance 0.090 at
   * r/g 1.34 while the ground under it renders a pale desaturated grey-green,
   * so grass read as dark dots scattered on a light mat. It is the same class
   * of bug `agent/splat` found in the shader — a second source of truth that
   * had never heard of the cartography — one level further out.
   *
   * The recipe below is the shader's own far-LOD path (`tf_shade`'s `farCol`
   * plus the macro tint block), evaluated from the weights `sampleMaterial`
   * has already blended, so the two cannot drift by construction. What it
   * deliberately leaves out is everything that only exists inside 420 m: the
   * layer textures themselves, the strata, the grit and the wet response.
   * Vegetation wants the *average* colour of the ground it stands on, not the
   * pebble under one blade.
   *
   * @returns linear-space albedo
   */
  groundColorAt(x: number, z: number, out: THREE.Color = new THREE.Color()): THREE.Color {
    const m = this.sampleMaterial(x, z);
    const w = m.weights, bio = m.bio;
    const green = bio.green, damp = bio.damp;
    const cool = Math.min(1, green * 0.90 + damp * 0.40);

    let r = 0, g = 0, b = 0;
    for (let i = 0; i < LAYER_NAMES.length; i++) {
      const a = LAYER_AVG[i], k = w[LAYER_NAMES[i]];
      r += a[0] * k; g += a[1] * k; b += a[2] * k;
    }
    // On a steep face the soft layers are a veneer and the rock reads through,
    // so the region's rock tint takes over from its ground tint.
    const rockShare = Math.min(1, w.rock * 1.25 + w.gravel * 0.35);
    // chlorophyll only where the grass layer is actually winning
    const chl = green * Math.min(1, w.grass * 1.6);
    const gt = bio.ground, rt = bio.rock;
    r *= mix(gt[0] * mix(1, 0.80, chl), 1, rockShare) * mix(1, rt[0], rockShare);
    g *= mix(gt[1] * mix(1, 1.12, chl), 1, rockShare) * mix(1, rt[1], rockShare);
    b *= mix(gt[2] * mix(1, 0.60, chl), 1, rockShare) * mix(1, rt[2], rockShare);

    // the three overlapping colour fields, 600 m / 140 m / 40 m
    const m3 = gnoise2(x * 0.027 + 7, z * 0.027 + 7);
    const t1 = Math.max(0, Math.min(1, 0.5 + 0.72 * m.m1 + 0.30 * m.m2));
    const t2 = Math.max(0, Math.min(1, 0.5 + 0.9 * m.m2 - 0.4 * m.m1)) * 0.45;
    const k3 = 0.76 + 0.48 * (0.5 + 0.5 * m3);
    r *= mix(mix(0.84, 0.86, cool), mix(1.20, 1.02, cool), t1) * mix(1, mix(1.02, 0.90, green), t2) * k3;
    g *= mix(mix(0.90, 0.95, cool), mix(0.96, 1.06, cool), t1) * mix(1, mix(1.03, 1.07, green), t2) * k3;
    b *= mix(mix(1.00, 1.02, cool), mix(0.74, 0.88, cool), t1) * mix(1, 0.80, t2) * k3;

    const wetK = mix(1, 0.78, m.flow * 0.75);
    const alt = mix(1, 1.12, ss(90, 210, m.height)) * mix(1, 0.94, ss(0.35, 0.75, m.slope));
    r *= wetK * alt; g *= wetK * alt; b *= wetK * alt;
    // sun-bleached naturalism, not candy
    const lum = r * 0.2126 + g * 0.7152 + b * 0.0722;
    r = lum + (r - lum) * 0.86; g = lum + (g - lum) * 0.86; b = lum + (b - lum) * 0.86;
    // standing humidity: only the flats hold it, water runs off a face
    const wetGround = Math.min(1, damp * (1 - ss(0.16, 0.44, m.slope)));
    const dk = mix(1, 0.66, wetGround);
    r *= dk * mix(1, 0.90, wetGround * 0.85);
    g *= dk * mix(1, 0.97, wetGround * 0.85);
    b *= dk * mix(1, 1.05, wetGround * 0.85);

    return out.setRGB(Math.max(0, r), Math.max(0, g), Math.max(0, b));
  }

  // ------------------------------------------------------------------ update

  lateUpdate(dt: any, game: any) {
    const p = game.camera.position;
    this.clipmap.update(p.x, p.z);
    if (!this._gbufferPatched && game.post && game.post.gtao) {
      patchGBufferMaterial(game.post.gtao.normalMaterial, this.res);
      this._gbufferPatched = true;
    }
  }

  update() {}
}

function ss(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function mix(a: number, b: number, t: number) { return a + (b - a) * t; }
