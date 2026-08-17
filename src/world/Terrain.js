import * as THREE from 'three';
import {
  Field, LANDMARKS, gnoise2, N, HALF, CELL, FAR_N, FAR_HALF, FAR_CELL, BLEND_OUT,
} from './terrain/Field.js';
import { Clipmap } from './terrain/Clipmap.js';
import { loadBakedField } from './terrain/FieldBake.js';
import { bootPhase } from '../engine/BootProfile.js';
import { buildLayerTextures, LAYER_NAMES } from './terrain/Layers.js';
import {
  createTerrainMaterial, createTerrainDepthMaterial, makeTerrainUniforms, patchGBufferMaterial,
} from './terrain/TerrainMaterial.js';

/**
 * Leide badlands: a 3 km eroded basin ringed by ridged mountain ranges, drawn
 * with a camera-centred geometry clipmap and a six-layer height-blended,
 * triplanar splat shader.
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
  constructor() {
    /** Full span of the detailed heightfield, metres. */
    this.size = HALF * 2;
    /** Hero landmark anchors, world space. */
    this.landmarks = LANDMARKS;
    this.layerNames = LAYER_NAMES;
    this._v = new THREE.Vector3();
    this._ctrl = {};
  }

  async init(game) {
    this.game = game;

    this.field = new Field(game.seed || 1337);
    // A baked heightfield is just the cached output of `Field.build()` — same
    // generator, same seed, run in the build step instead of on every page
    // load. Missing or stale artifacts fall through to generating in place.
    const baked = await bootPhase('Terrain.bake', () => loadBakedField(this.field));
    if (!baked) bootPhase('Terrain.field', () => this.field.build());
    this.road = this.field.roadSpline;

    const quality = game.rnd ? game.rnd.quality : 'high';
    const layerSize = quality === 'low' ? 256 : 512;
    const layers = bootPhase('Terrain.layers', () => buildLayerTextures(layerSize));
    this.textures = { ...layers, ...bootPhase('Terrain.upload', () => this._uploadFieldTextures()) };

    this.res = {
      uniforms: makeTerrainUniforms(this.textures, {
        HALF, CELL, N, BLEND_OUT, FAR_HALF, FAR_CELL, FAR_N,
      }),
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
   * @returns {number}
   */
  heightAt(x, z) { return this.field.heightAt(x, z); }

  /**
   * Surface normal at a world position.
   * @returns {THREE.Vector3}
   */
  normalAt(x, z, out = new THREE.Vector3()) {
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
   * @param {number} w 0..1
   */
  setWetness(w) {
    if (!this.res) return;
    this.res.uniforms.uWet.value.x = Math.max(0, Math.min(1, w));
  }

  /** Steepness in 0..1 (0 = flat, 1 = vertical). */
  slopeAt(x, z) {
    const n = this.normalAt(x, z, this._v);
    return 1 - n.y;
  }

  /**
   * Distance in metres from the road centreline. Cheap enough for scattering.
   * @returns {number}
   */
  roadDistance(x, z) { return this.road ? this.road.distance(x, z) : 1e5; }

  /**
   * X of the road centreline at a given Z.
   *
   * Vegetation/Props (`veg/Ecology.js`) probe for this and fall back to their
   * own approximate curve when it is missing — which would scatter grass and
   * roadside props along a line the terrain never carved. Exposing it keeps
   * every system agreeing on where the road actually is.
   * @param {number} z
   * @returns {number}
   */
  roadCenterX(z) {
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

  _bracketsZ(pts, i, z) {
    const a = pts[i].z, b = pts[i + 1].z;
    return z >= Math.min(a, b) && z <= Math.max(a, b);
  }

  /** Nearest segment in Z; falls back to the closest endpoint off the ends. */
  _findRoadSegment(pts, z) {
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
   * @returns {{id:number, name:string, weights:object, slope:number, height:number,
   *            flow:number, sediment:number, rocky:number, road:number, roadDist:number}}
   */
  sampleMaterial(x, z) {
    const f = this.field;
    const c = f.ctrlAt(x, z, this._ctrl);
    const h = f.heightAt(x, z);
    const slope = this.slopeAt(x, z);
    // identical fields to the ones the splat shader evaluates
    const m1 = gnoise2(x * 0.0017, z * 0.0017);
    const m2 = gnoise2(x * 0.0072 + 21, z * 0.0072 + 21);
    const p1 = gnoise2(x * 0.0125 + 3.3, z * 0.0125 + 3.3);
    const p2 = gnoise2(x * 0.043 - 9.1, z * 0.043 - 9.1);
    const patchN = 0.62 * p1 + 0.38 * p2;
    const dryness = Math.max(0, Math.min(1, 0.5 + 0.45 * m1 + 0.55 * patchN));
    const flatAmt = 1 - ss(0.06, 0.28, slope);
    const lowAlt = 1 - ss(48, 120, h);

    // ctrl.r doubles as the road lateral offset where the mask is set
    const flow = c.road > 0.02 ? 0 : c.flow;
    const w = {
      sand: flatAmt * lowAlt * (0.14 + 1.05 * c.sediment + 1.70 * ss(0.60, 0.95, dryness)),
      dirt: 0.72 + 0.55 * (0.5 + 0.5 * p2) - 1.35 * ss(0.10, 0.44, slope),
      gravel: ss(0.14, 0.42, slope) * (0.5 + 0.8 * (0.5 + 0.5 * m2))
        + 1.20 * flow + 0.40 * c.rocky + 0.62 * ss(0.34, 0.04, dryness) * flatAmt,
      rock: ss(0.20, 0.48, slope) * 1.80 + 1.10 * c.rocky + 0.65 * ss(80, 175, h),
      grass: flatAmt * lowAlt * 1.30
        * ss(0.12, 0.66, 0.42 * flow + 0.36 * patchN + 0.22 * m1 + 0.17 + 0.14 * c.sediment),
      road: c.road * 5.5 * (1 - ss(0.30, 0.55, slope)),
    };
    // talus / scree band under the cliffs — mirrors the shader exactly
    const scree = ss(0.15, 0.31, slope) * (1 - ss(0.33, 0.52, slope)) * ss(0.30, 0.70, c.rocky)
      * (0.55 + 0.45 * (0.5 + 0.5 * gnoise2(x * 0.021 - 3, z * 0.021 - 3)));
    w.gravel += 0.55 * scree;
    w.rock -= 0.22 * scree;
    let sum = 0;
    for (const k in w) { w[k] = Math.pow(Math.max(w[k], 0), 1.7); sum += w[k]; }
    sum = Math.max(sum, 1e-4);
    let best = 'dirt', bestV = -1;
    for (const k in w) { w[k] /= sum; if (w[k] > bestV) { bestV = w[k]; best = k; } }

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
    };
  }

  // ------------------------------------------------------------------ update

  lateUpdate(dt, game) {
    const p = game.camera.position;
    this.clipmap.update(p.x, p.z);
    if (!this._gbufferPatched && game.post && game.post.gtao) {
      patchGBufferMaterial(game.post.gtao.normalMaterial, this.res);
      this._gbufferPatched = true;
    }
  }

  update() {}
}

function ss(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
