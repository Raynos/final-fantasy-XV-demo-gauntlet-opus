import * as THREE from 'three';
import type { Terrain } from './Terrain.ts';
import { worldMap } from './map/WorldMap.ts';
import {
  N as FIELD_N, HALF as FIELD_HALF, CELL as FIELD_CELL, BLEND_OUT as FIELD_BLEND_OUT,
  FAR_N as FIELD_FAR_N, FAR_HALF as FIELD_FAR_HALF, FAR_CELL as FIELD_FAR_CELL,
} from './terrain/Field.ts';
import { Noise } from '../util/Noise.ts';
import { makeTexture, normalFromHeight } from '../util/TextureGen.ts';
import { buildShoreRibbon, type ShoreStats } from './water/Shore.ts';
import { makeShoreMaterial, type ShoreUniforms } from './water/ShoreMaterial.ts';
import { buildRivers, type RiverStats } from './water/River.ts';
import { makeRiverWaterMaterial, makeRiverBankMaterial, type RiverUniforms } from './water/RiverMaterial.ts';
import type { Game } from '../game/Game.ts';
import { bootPhase } from '../engine/BootProfile.ts';

/**
 * Lakes and pools.
 *
 * Planar reflection (half-res, sky + terrain only) + a Beer-Lambert depth model
 * sampled against the real terrain bed + two scrolling procedural normal maps +
 * depth-derived shore foam + sun glint. Water bodies are discovered from the
 * terrain: any basin below `level` that is large enough gets a surface.
 *
 * ### Depth is metric, and that is the whole design
 *
 * The surface is a flat quad at `level`, so the fragment's own `y` carries no
 * information at all — the previous body colour was
 * `mix(uShallow, uDeep, clamp((uLevel - vWorld.y + 6.0) / 9.0))`, which on a
 * plane where `vWorld.y == uLevel` is the constant 0.667. Every lake in the
 * world was therefore one flat colour with no shore, no shallows and no bed,
 * which is exactly how they read: a blue band pasted over the beach.
 *
 * So the shader samples the terrain heightfield itself, through the same
 * `texelFetch` bilinear the terrain material uses, and gets **metres of water**
 * under each fragment. Everything else keys off that number:
 *
 * - **Transmittance** is `exp(-sigma * pathLength)` per channel, with
 *   `sigma.r >> sigma.b`, which is why real water goes green then blue-black
 *   with depth instead of interpolating between two picked colours.
 * - **Path length** follows the *refracted* view ray, not the vertical, so
 *   grazing views through a shallow margin correctly see more water than a
 *   plan view of the same spot. One Snell step; no scene copy.
 * - **Alpha** is the complement of transmittance, so a centimetre of water at
 *   the shoreline is genuinely transparent and the beach reads through it. The
 *   silhouette of the waterline then comes from the bed, for free.
 * - **Foam** is a function of depth broken up by the wave field, rather than a
 *   contour stamped at a fixed offset.
 */
/**
 * Layer the mirrored pass draws. Nothing is on it until `Water` opts the sky
 * dome and the terrain clipmap in, so the reflection is *only* those two.
 */
const REFLECT_LAYER = 3;

/** One body of standing water, as the basin scan found it. */
export interface WaterBasin {
  /** Centre, world metres. */
  cx: number;
  cz: number;
  /** Extent in x and z, world metres. */
  w: number;
  d: number;
  /**
   * World Y of this body's surface.
   *
   * Not a constant, and that is the point. `level` used to be one number for
   * the whole planet, which meant the only water that could exist was the sea:
   * every inland tarn the map advertises sits tens of metres above it, so seven
   * of the ten authored fishing spots were a jetty on a dry hillside. A basin
   * owns its own surface height now.
   */
  level: number;
  /** For the map and for debugging: what the body is. */
  name?: string;
  /**
   * How many metres of depth count as "shore", for the foam margin.
   *
   * A fixed band is wrong for anything but the sea. The first inland tarn was
   * 0.5 m deep against a 1.35 m band, so *every* fragment of it qualified as
   * shore and the whole pond came back foaming — a mouldy puddle rather than
   * water. The margin has to be a fraction of the body it is on.
   */
  foamBand?: number;
}

/** A basin once it has a surface in the scene. */
export interface WaterBody extends WaterBasin {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  /** World slab with headroom, so a lake below the horizon still culls right. */
  bounds: THREE.Box3;
}

export class Water {
  _box!: THREE.Box3;
  _e!: THREE.Euler;
  _frustum!: THREE.Frustum;
  _q!: THREE.Quaternion;
  _reflMatrix!: THREE.Matrix4;
  /** The scene roots the reflection pass re-renders. */
  _reflectRoots!: THREE.Object3D[] | null;
  _reflecting!: boolean;
  _sinceReflect!: number;
  _vp!: THREE.Matrix4;
  /** The lakes and seas the basin scan found. */
  bodies!: WaterBody[];
  caustics!: THREE.DataTexture;
  enabled!: boolean;
  game!: Game;
  level!: number;
  noise!: Noise;
  normalA!: THREE.DataTexture;
  normalB!: THREE.DataTexture;
  reflectCam!: THREE.PerspectiveCamera;
  reflectTarget!: THREE.WebGLRenderTarget;
  /** The terrain field textures and their grid params, for the bed sampler. */
  _bed!: {
    height: THREE.Texture, farHeight: THREE.Texture,
    field: THREE.Vector4, farP: THREE.Vector4,
  } | null;
  reflectionRes!: number;
  stride!: number;
  /**
   * The merged shoreline ribbon (plan 6.1) — one mesh, one draw call, every
   * body in the world. Null when nothing crossed a water level anywhere.
   */
  shore!: THREE.Mesh | null;
  shoreMat!: THREE.ShaderMaterial | null;
  /** What the ribbon build measured. Read by the handoff and by probes. */
  shoreStats!: ShoreStats | null;
  /** Tiling two-channel noise the swash reads. */
  shoreNoise!: THREE.DataTexture;
  /** The rivers (plan 6.2): one mesh for the water, one for both banks. */
  riverWater!: THREE.Mesh | null;
  riverBank!: THREE.Mesh | null;
  riverMats!: THREE.ShaderMaterial[];
  riverStats!: RiverStats | null;
  constructor() {
    this.level = -6.5;          // world Y of the water plane
    this.bodies = [];
    this.reflectionRes = 192;
    /** Frames between reflection refreshes. */
    this.stride = 2;
    this._frustum = new THREE.Frustum();
    this._vp = new THREE.Matrix4();
    this._box = new THREE.Box3();
    this._reflecting = false;
    this._reflectRoots = null;
    this._bed = null;
    this._sinceReflect = 1e9;
    this.shore = null;
    this.shoreMat = null;
    this.shoreStats = null;
    this.riverWater = null;
    this.riverBank = null;
    this.riverMats = [];
    this.riverStats = null;
  }

  async init(game: Game) {
    this.game = game;
    const terrain = game.get('Terrain');
    if (!terrain) return;

    this.noise = new Noise(4242);
    bootPhase('Water.textures', () => this._buildTextures());
    bootPhase('Water.reflection', () => this._buildReflection(game));
    bootPhase('Water.bed', () => this._bindBed(terrain));

    // Find basins on a coarse grid; group them into a few lake surfaces.
    const bodies = bootPhase('Water.basins', () => {
      const found = this._findBasins(terrain);
      for (const t of this._findTarns(terrain, found)) found.push(t);
      return found;
    });
    bootPhase('Water.surfaces', () => { for (const b of bodies) this._makeSurface(game, b); });

    this.enabled = this.bodies.length > 0;
    if (this.enabled) this._collectReflectRoots(game);
    // Both generators hard-error on a winding or attribute defect, which is the
    // whole point of them — but a throw inside `init` never sets `GAME.ready`,
    // so the entire game hangs at boot and every other lane's capture times out
    // with no message. `console.error` is the right loudness: `shoot.mts` exits
    // non-zero on any page error, so nothing can ship green, and the world still
    // boots so the defect can be photographed.
    try { bootPhase('Water.shore', () => { if (this.enabled) this._buildShore(game, terrain); }); } catch (err) { console.error('[Water] shore ribbon:', err); }
    try { bootPhase('Water.rivers', () => this._buildRivers(game, terrain)); } catch (err) { console.error('[Water] rivers:', err); }
  }

  /**
   * Trace the drainage and lay river strips in the channels 4.2 cut (plan 6.2).
   *
   * Two meshes and two draw calls for every river in the world: the water
   * surface, and both banks merged into one decal. Neither casts a shadow --
   * a river's shadow is the gorge it is in.
   */
  _buildRivers(game: Game, terrain: Terrain) {
    const built = buildRivers(terrain, { level: this.level, half: (terrain.size || 8192) * 0.5 });
    this.riverStats = built.stats;
    if (built.water) {
      const mat = makeRiverWaterMaterial(this.shoreNoise);
      const mesh = new THREE.Mesh(built.water, mat);
      mesh.name = 'riverWater';
      mesh.renderOrder = 4;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      game.scene.add(mesh);
      this.riverWater = mesh;
      this.riverMats.push(mat);
    }
    if (built.bank) {
      const mat = makeRiverBankMaterial(this.shoreNoise);
      const mesh = new THREE.Mesh(built.bank, mat);
      mesh.name = 'riverBank';
      mesh.renderOrder = 3;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      game.scene.add(mesh);
      this.riverBank = mesh;
      this.riverMats.push(mat);
    }
  }

  /**
   * Lay the shoreline ribbon along every body's waterline (plan 6.1).
   *
   * One merged mesh for the whole world. A body's water level rides in the
   * `aShore` attribute rather than in a uniform, which is the only reason a sea
   * at -6.5 m and a tarn at +53 m can share a draw call.
   *
   * Built from `Terrain.heightAt` — the *eroded* field, so the contour follows
   * the drainage the bake cut rather than the smooth basin it started as.
   */
  _buildShore(game: Game, terrain: Terrain) {
    const specs = this.bodies.map((b) => ({ cx: b.cx, cz: b.cz, w: b.w, d: b.d, level: b.level, name: b.name }));
    const built = buildShoreRibbon(terrain, specs);
    this.shoreStats = built.stats;
    if (!built.geometry) return;
    this.shoreMat = makeShoreMaterial(this.shoreNoise);
    const mesh = new THREE.Mesh(built.geometry, this.shoreMat);
    mesh.name = 'shoreRibbon';
    // Before the water surface (renderOrder 5) so the submerged rows are
    // already in the buffer when the water reads the frame behind it.
    mesh.renderOrder = 3;
    mesh.frustumCulled = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    game.scene.add(mesh);
    this.shore = mesh;
  }

  /**
   * Point the depth model at the terrain's own height field.
   *
   * Read-only, and deliberately the *same* textures and grid parameters the
   * terrain material samples (`uField` = half, cell, N, blendOut) rather than a
   * copy — a water bed that disagreed with the drawn ground by even a metre
   * would put the waterline in the wrong place, and the disagreement would only
   * show up as art nobody could explain.
   */
  _bindBed(terrain: Terrain) {
    const tex = terrain.textures;
    if (!tex || !tex.height || !tex.farHeight) { this._bed = null; return; }
    this._bed = {
      height: tex.height,
      farHeight: tex.farHeight,
      field: new THREE.Vector4(FIELD_HALF, FIELD_CELL, FIELD_N, FIELD_BLEND_OUT),
      farP: new THREE.Vector4(FIELD_FAR_HALF, FIELD_FAR_CELL, FIELD_FAR_N, 0),
    };
  }

  // ---------------------------------------------------------------- textures

  _buildTextures() {
    const n = this.noise;
    // Two octave sets at different scales so the normals never visibly repeat.
    const wave = (u: number, v: number, sx: number, sy: number) =>
      n.fbm2(u * sx, v * sy, 4, 2.1, 0.55) * 0.6 +
      n.fbm2(u * sx * 3.7 + 11, v * sy * 3.7 + 3, 3, 2.3, 0.5) * 0.4;

    this.normalA = normalFromHeight(256, (u: number, v: number) => wave(u, v, 6, 6), 1.6, { repeat: 14 });
    this.normalB = normalFromHeight(256, (u: number, v: number) => wave(u + 0.37, v + 0.71, 11, 11), 1.1, { repeat: 31 });

    // Two independent noise channels for the shoreline swash: .x is the slow
    // group envelope that decides which wave trains run furthest, .y is the
    // lace of foam sliding back down the sand. Independent on purpose -- one
    // channel driving both correlates the envelope with the foam and the beach
    // comes out banded.
    this.shoreNoise = makeTexture(256, (u: number, v: number, c: number[]) => {
      c[0] = 0.5 + 0.5 * n.fbm2(u * 5 + 31, v * 5 + 17, 4, 2.1, 0.55);
      c[1] = 0.5 + 0.5 * n.fbm2(u * 13 - 5, v * 13 + 41, 3, 2.4, 0.5);
      c[2] = 0;
    }, { colorSpace: THREE.NoColorSpace, repeat: 1 });

    // Subtle caustic-ish sub-surface texture for shallow water.
    this.caustics = makeTexture(256, (u: number, v: number, c: number[]) => {
      const w = n.worley2(u * 7, v * 7);
      const g = Math.pow(1 - Math.min(1, w.f2 - w.f1), 6);
      c[0] = c[1] = c[2] = g;
    }, { colorSpace: THREE.NoColorSpace, repeat: 9 });
  }

  _buildReflection(game: Game) {
    this.reflectTarget = new THREE.WebGLRenderTarget(this.reflectionRes * 2, this.reflectionRes, {
      type: THREE.HalfFloatType,
      colorSpace: THREE.LinearSRGBColorSpace,
      depthBuffer: true,
    });
    this.reflectCam = new THREE.PerspectiveCamera();
    // Layer 3 = "reflected by water", and *only* layer 3: the camera used to
    // enable layer 0 as well, which is the default layer of every object in
    // the scene, so the "sky + terrain only" reflection was in fact a second
    // full render of the world — 500 draw calls and six million triangles to
    // fill a 384x192 buffer that a wave normal then smears beyond recognition.
    this.reflectCam.layers.set(REFLECT_LAYER);
    this._reflMatrix = new THREE.Matrix4();
  }

  /**
   * Opt the sky dome and the terrain clipmap into the reflection layer.
   *
   * Done from here rather than from those systems because the contract is
   * Water's: it is the only thing that reads layer 3, and what belongs in a
   * mirrored view is a decision about the reflection, not about the sky.
   */
  _collectReflectRoots(game: Game) {
    const roots = [];
    const sky = game.get('Sky');
    if (sky && sky.dome) roots.push(sky.dome);
    const terrain = game.get('Terrain');
    if (terrain && terrain.clipmap && terrain.clipmap.group) roots.push(terrain.clipmap.group);
    for (const r of roots) r.traverse((o) => o.layers.enable(REFLECT_LAYER));
    this._reflectRoots = roots;
  }

  // ------------------------------------------------------------------ basins

  _findBasins(terrain: Terrain): WaterBasin[] {
    const step = 12, half = (terrain.size || 1400) * 0.5;
    const seen = new Set<string>();
    const key = (i: number, j: number) => `${i},${j}`;
    const cells = new Map<string, { i: number, j: number, x: number, z: number }>();
    const n = Math.floor((half * 2) / step);

    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = -half + i * step, z = -half + j * step;
        if (terrain.heightAt(x, z) < this.level) cells.set(key(i, j), { i, j, x, z });
      }
    }

    // Flood fill into connected bodies, keeping the sizeable ones.
    const bodies: WaterBasin[] = [];
    for (const [k, cell] of cells) {
      if (seen.has(k)) continue;
      const stack = [cell]; seen.add(k);
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, count = 0;
      while (stack.length) {
        const c = stack.pop();
        if (!c) break;
        count++;
        minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
        minZ = Math.min(minZ, c.z); maxZ = Math.max(maxZ, c.z);
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nk = key(c.i + di, c.j + dj);
          const nc = cells.get(nk);
          if (nc && !seen.has(nk)) { seen.add(nk); stack.push(nc); }
        }
      }
      if (count >= 12) {
        bodies.push({
          cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2,
          w: maxX - minX + step * 4, d: maxZ - minZ + step * 4,
          level: this.level, name: 'sea', foamBand: 1.35,
        });
      }
    }
    return bodies.slice(0, 4);
  }

  /**
   * Inland water, one body per authored fishing pin that the sea does not reach.
   *
   * The map advertises ten fishing spots and only three of them had water,
   * because `level` was a single global number: a pin at 68 m elevation cannot
   * be under a sea surface at -6.5 m, so the other seven were a jetty on dry
   * rock. Fast-travelling to one on the strength of the map is the worst kind
   * of broken promise a world map can make.
   *
   * The level is measured rather than authored. Sample a disc around the pin,
   * take a low quantile of the heights as the surface, and then **check it does
   * not spill**: if any point on the rim is below that surface, the water would
   * run out of the basin, so the level drops to the rim. A tarn that leaks down
   * a hillside is worse than no tarn.
   *
   * @param exclude bodies already found, so a pin the sea reaches is skipped
   */
  _findTarns(terrain: Terrain, exclude: WaterBasin[]): WaterBasin[] {
    const out: WaterBasin[] = [];
    const covered = (x: number, z: number) => exclude.some((b) =>
      Math.abs(x - b.cx) < b.w * 0.5 && Math.abs(z - b.cz) < b.d * 0.5);

    for (const poi of worldMap.poisOfType('fishing')) {
      if (covered(poi.x, poi.z)) continue;
      // Sea-adjacent pins have no business being a tarn even if the coarse
      // basin scan missed them by a cell.
      if (terrain.heightAt(poi.x, poi.z) < this.level + 4) continue;

      const R = 105, N = 22;
      const hs: number[] = [];
      let rim = -Infinity;
      for (let j = -N; j <= N; j++) {
        for (let i = -N; i <= N; i++) {
          const dx = (i / N) * R, dz = (j / N) * R;
          const r = Math.hypot(dx, dz);
          if (r > R) continue;
          const h = terrain.heightAt(poi.x + dx, poi.z + dz);
          hs.push(h);
          if (r > R * 0.86) rim = Math.max(rim, -h);   // lowest point on the rim
        }
      }
      if (hs.length < 64) continue;
      hs.sort((a, b) => a - b);
      // A quarter of the disc under water reads as a pond rather than a puddle.
      const wanted = hs[Math.floor(hs.length * 0.26)];
      const spill = -rim;                               // the rim's lowest height
      const level = Math.min(wanted, spill - 0.35);
      // Below the basin floor means there is no hollow here at all.
      if (level <= hs[0] + 0.4) continue;

      // Extent: how far the water actually reaches, not the sample disc.
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let j = -N; j <= N; j++) {
        for (let i = -N; i <= N; i++) {
          const dx = (i / N) * R, dz = (j / N) * R;
          if (Math.hypot(dx, dz) > R) continue;
          if (terrain.heightAt(poi.x + dx, poi.z + dz) >= level) continue;
          minX = Math.min(minX, dx); maxX = Math.max(maxX, dx);
          minZ = Math.min(minZ, dz); maxZ = Math.max(maxZ, dz);
        }
      }
      if (!(maxX > minX)) continue;
      const pad = 8;
      out.push({
        cx: poi.x + (minX + maxX) / 2, cz: poi.z + (minZ + maxZ) / 2,
        w: (maxX - minX) + pad, d: (maxZ - minZ) + pad,
        level, name: poi.id,
        // A third of the deepest point, so a shallow tarn gets a narrow rim
        // rather than foaming from bank to bank.
        foamBand: Math.max(0.12, Math.min(1.35, (level - hs[0]) * 0.34)),
      });
    }
    return out;
  }

  _makeSurface(game: Game, b: WaterBasin) {
    const geo = new THREE.PlaneGeometry(b.w, b.d, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = this._makeMaterial(b.level, b.foamBand ?? 1.35);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(b.cx, b.level, b.cz);
    mesh.renderOrder = 5;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    game.scene.add(mesh);
    // World bounds with headroom above the plane: a lake below the horizon is
    // still visible through its own reflection, so test a slab, not a plane.
    const bounds = new THREE.Box3(
      new THREE.Vector3(b.cx - b.w * 0.5, b.level - 2, b.cz - b.d * 0.5),
      new THREE.Vector3(b.cx + b.w * 0.5, b.level + 40, b.cz + b.d * 0.5)
    );
    this.bodies.push({ mesh, mat, bounds, ...b });
  }

  /**
   * @param level this body's surface height — the depth model measures from it
   * @param foamBand metres of depth that count as shore on *this* body
   */
  _makeMaterial(level: number, foamBand: number) {
    const bed = this._bed;
    const uniforms = {
      uTime: { value: 0 },
      uNormalA: { value: this.normalA },
      uNormalB: { value: this.normalB },
      uCaustics: { value: this.caustics },
      uReflect: { value: this.reflectTarget.texture },
      uReflectMatrix: { value: new THREE.Matrix4() },
      /**
       * Per-metre extinction, one coefficient per channel.
       *
       * This is the number that makes water look like water. Red is absorbed an
       * order of magnitude faster than blue — a metre of clear water has already
       * taken a third of the red out and almost none of the blue — which is why
       * a shallow margin reads warm and sandy and the same body reads green at
       * three metres and blue-black at fifteen. Two picked colours interpolated
       * by depth cannot produce that curve, and the interpolation is what makes
       * a lake read as painted.
       */
      uSigma: { value: new THREE.Vector3(0.46, 0.10, 0.045) },
      /**
       * Single-scattering albedo of the body — the colour deep water keeps.
       *
       * Kept dark on purpose. The scattered term saturates as depth grows, so
       * whatever this is, is exactly what an infinitely deep lake looks like;
       * pick it bright and every lake in the world becomes a swimming pool.
       */
      uScatter: { value: new THREE.Color(0x12363c) },
      /** Bed albedo where no terrain albedo is available: damp silt. */
      uBed: { value: new THREE.Color(0x6b6047) },
      /**
       * Sky irradiance reaching the surface, from the hemisphere light.
       *
       * Without this the body colour is a constant, and a constant body colour
       * is how a storm-lit lake came back reading as tropical shallows: the
       * scene around it went grey and overcast and the water did not move at
       * all. Absorption tells you what *fraction* of light returns; it cannot
       * tell you how much light there was.
       */
      uAmbient: { value: new THREE.Color(0x9fc0ee).multiplyScalar(0.18) },
      uSunDir: { value: new THREE.Vector3(0.4, 0.6, 0.3) },
      uSunColor: { value: new THREE.Color(0xfff0d8) },
      uCameraPos: { value: new THREE.Vector3() },
      uLevel: { value: level },
      uFoamBand: { value: foamBand },
      uWindDir: { value: new THREE.Vector2(0.8, 0.6) },
      uRoughness: { value: 0.06 },
      uHeightTex: { value: bed ? bed.height : null },
      uFarHeightTex: { value: bed ? bed.farHeight : null },
      uField: { value: bed ? bed.field : new THREE.Vector4(1, 1, 1, 1) },
      uFarP: { value: bed ? bed.farP : new THREE.Vector4(1, 1, 1, 0) },
      /** 0 disables the depth model, for the no-terrain fallback and ablation. */
      uHasBed: { value: bed ? 1 : 0 },
    };

    return new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */`
        varying vec3 vWorld;
        varying vec4 vClip;
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vClip = projectionMatrix * viewMatrix * wp;
          gl_Position = vClip;
        }
      `,
      fragmentShader: /* glsl */`
        precision highp float;
        uniform float uTime, uLevel, uRoughness, uHasBed, uFoamBand;
        uniform sampler2D uNormalA, uNormalB, uCaustics, uReflect;
        uniform sampler2D uHeightTex, uFarHeightTex;
        uniform vec4 uField;   // half, cell, N, blendOut
        uniform vec4 uFarP;    // half, cell, N, -
        uniform vec3 uSigma, uScatter, uBed, uAmbient, uSunDir, uSunColor, uCameraPos;
        uniform vec2 uWindDir;
        varying vec3 vWorld;
        varying vec4 vClip;

        vec3 sampleNormal(sampler2D t, vec2 uv){
          return normalize(texture2D(t, uv).xyz * 2.0 - 1.0);
        }

        // Bilinear fetch of the height grid. This is tf_grid() from
        // TerrainMaterial.ts, verbatim: the bed the water measures against has
        // to be the surface the terrain actually draws, or the waterline lands
        // somewhere the ground is not.
        float wf_grid(sampler2D tex, vec2 p, vec4 P){
          vec2 f = (p + P.x) / P.y;
          vec2 i0 = floor(f);
          vec2 t = f - i0;
          i0 = clamp(i0, vec2(0.0), vec2(P.z - 2.0));
          ivec2 c = ivec2(i0);
          float a = texelFetch(tex, c, 0).r;
          float b = texelFetch(tex, c + ivec2(1, 0), 0).r;
          float d = texelFetch(tex, c + ivec2(0, 1), 0).r;
          float e = texelFetch(tex, c + ivec2(1, 1), 0).r;
          return mix(mix(a, b, t.x), mix(d, e, t.x), t.y);
        }

        /**
         * Bed height under a world xz.
         *
         * The macro grid only — deliberately *without* the terrain's tf_micro()
         * relief term. That term is a 6-25 m analytic band, and adding it here
         * would put decimetre noise into the depth, which the exponential turns
         * into visible mottling across an otherwise calm lake. Under water,
         * where nothing is sharp anyway, the grid is the right level of detail.
         */
        float wf_bed(vec2 p){
          if (max(abs(p.x), abs(p.y)) >= uField.w) return wf_grid(uFarHeightTex, p, uFarP);
          return wf_grid(uHeightTex, p, uField);
        }

        void main(){
          vec2 w = uWindDir * uTime;
          float dist = length(uCameraPos - vWorld);

          // Three scales, because water is a spectrum and one normal map is a
          // texture. There used to be two, both short — 0.021 and 0.052 in world
          // units — which is why every lake read as a flat sheet of sandpaper:
          // no swell to carry the surface at distance, and a finest octave that
          // is sub-pixel past a hundred metres and can only alias.
          //
          // The swell is always present and does the distance read. The ripple
          // fades out with range rather than being minified into noise; this is
          // the same argument as dropping a grass LOD that has become smaller
          // than a texel, and it costs one smoothstep.
          float fine = 1.0 - smoothstep(70.0, 300.0, dist);
          // The swell reads the *other* map, on a rotated axis. Scaling one
          // texture three times looks exactly like what it is: the octaves
          // correlate with themselves and the surface comes out as regular
          // corduroy rather than as water. A different map at 31 deg breaks it.
          // Named swellRot, not R: R is the refracted view ray further down in
          // this same function, and redeclaring it is a GLSL compile error that
          // arrives as "VALIDATE_STATUS false" and nothing else.
          mat2 swellRot = mat2(0.857, -0.515, 0.515, 0.857);
          vec3 nS = sampleNormal(uNormalB, (swellRot * vWorld.xz) * 0.0047 + w * 0.0031);
          vec3 nA = sampleNormal(uNormalA, vWorld.xz * 0.021 + w * 0.012);
          vec3 nB = sampleNormal(uNormalB, vWorld.xz * 0.052 - w * 0.021);
          // blend in tangent space, then lift into world (plane normal is +Y)
          vec3 nt = normalize(vec3(
            nS.xy * 0.78 + nA.xy * (0.42 + 0.38 * fine) + nB.xy * (0.5 * fine),
            nS.z * nA.z * nB.z));
          vec3 N = normalize(vec3(nt.x, nt.z * 2.2, nt.y));

          vec3 V = normalize(uCameraPos - vWorld);
          float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 5.0);
          fres = mix(0.02, 1.0, fres);

          // planar reflection, distorted by the wave normal
          vec2 sUv = (vClip.xy / vClip.w) * 0.5 + 0.5;
          sUv += N.xz * 0.045;
          vec3 refl = texture2D(uReflect, clamp(sUv, 0.001, 0.999)).rgb;

          // --- metric depth ------------------------------------------------
          // Straight down first, to know how far the bed is at all.
          float bedY = wf_bed(vWorld.xz);
          float dropDown = max(uLevel - bedY, 0.0);

          // Then follow the refracted ray. One Snell step, air into water:
          // eta = 1.0 / 1.333. This is what makes a grazing view across a
          // shallow margin correctly darker than a plan view of the same spot —
          // it is travelling through more water to reach the same bed.
          vec3 R = refract(-V, N, 0.7502);
          float down = max(-R.y, 0.10);
          vec2 hit = vWorld.xz + R.xz * (dropDown / down);
          float path = max(uLevel - wf_bed(hit), 0.0) / down;

          // No terrain bound (or ablated): fall back to a fixed mid depth so the
          // surface still renders as water rather than as a black hole.
          path = mix(3.0, path, uHasBed);
          dropDown = mix(3.0, dropDown, uHasBed);

          // --- Beer-Lambert -------------------------------------------------
          vec3 T = exp(-uSigma * path);

          // Caustics belong on the bed, and only where light still reaches it.
          float caust = texture2D(uCaustics, hit * 0.06 + w * 0.004).r;
          vec3 bed = uBed * (1.0 + caust * 0.55 * T.g);

          // Downwelling light at the surface: direct sun weighted by its own
          // elevation, plus sky. Both terms below are fractions of *this*, so a
          // storm-grey scene gets storm-grey water without any special case.
          vec3 downwelling = uSunColor * max(uSunDir.y, 0.0) * 0.42 + uAmbient * 1.9;

          // What comes back out: light off the bed, attenuated by the water it
          // crossed, plus light scattered by the body before it ever got there.
          // The scattered term carries its own attenuation as well — photons
          // have to travel down and back up again — which is what stops deep
          // water converging on a bright flat tint.
          vec3 scatterOut = uScatter * (1.0 - T) * mix(1.0, 0.42, clamp(path / 14.0, 0.0, 1.0));
          vec3 body = (bed * T + scatterOut) * downwelling;

          // --- foam ------------------------------------------------------------
          // Depth-derived, then broken up by the wave field so it is a margin
          // rather than a contour line. A clean band at a fixed offset is the
          // single clearest tell that a shoreline was stamped, not simulated —
          // so two noise scales beat on each other and the band is required to
          // clear both. One scale alone still reads as a piped edge.
          float edge = 1.0 - smoothstep(0.0, uFoamBand, dropDown);
          float churn = texture2D(uNormalB, vWorld.xz * 0.085 + w * 0.03).x;
          float churn2 = texture2D(uNormalA, vWorld.xz * 0.022 - w * 0.011).y;
          float foam = smoothstep(0.34, 0.92, edge * (0.35 + 0.8 * churn + 0.5 * churn2));

          // Fade the margin out with distance. A shore band narrower than a
          // pixel cannot be drawn, only aliased, and an aliased white line along
          // every far shore is exactly the confetti tell that costs a blind test.
          foam *= 1.0 - smoothstep(220.0, 620.0, dist);

          vec3 col = mix(body, refl, fres);
          // Foam is scattering, so it is bright *for the light it is under* —
          // pure white here made an overcast lake look sunlit along its edge.
          col = mix(col, vec3(0.90, 0.93, 0.95) * (downwelling * 0.75 + 0.10), foam * 0.85);

          // sun glint — sharp specular on the wave normals
          vec3 H = normalize(uSunDir + V);
          float spec = pow(max(dot(N, H), 0.0), mix(2000.0, 60.0, uRoughness * 6.0));
          col += uSunColor * spec * 2.4 * (1.0 - foam * 0.6);

          // --- alpha ------------------------------------------------------------
          // The complement of transmittance, so a centimetre of water at the
          // shoreline is genuinely see-through and the beach reads under it.
          // The waterline silhouette then comes from the bed for nothing, which
          // is the part a stamped contour can never get right. Fresnel keeps
          // grazing angles reflective however shallow they are, and foam is
          // opaque because it is scattering, not absorption.
          float alpha = 1.0 - max(max(T.r, T.g), T.b);
          alpha = clamp(max(max(alpha, fres * 0.92), foam * 0.9), 0.0, 1.0);

          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
        }
      `,
    });
  }

  // ------------------------------------------------------------------ update

  update(dt: number, game: Game) {
    if (!this.enabled) return;
    const cam = game.camera;
    const sky = game.get('Sky');
    for (const b of this.bodies) {
      const u = b.mat.uniforms;
      u.uTime.value = game.time.now;
      u.uCameraPos.value.copy(cam.position);
      if (sky && sky.sun) {
        u.uSunDir.value.copy(sky.sun.position).normalize();
        u.uSunColor.value.copy(sky.sun.color).multiplyScalar(Math.min(2, sky.sun.intensity));
      }
      // The hemisphere light is the scene's own answer to "how bright is the
      // sky right now", and it is already weather- and time-driven. Reading it
      // rather than re-deriving one keeps the water in step with the terrain
      // beside it under every preset.
      if (sky && sky.ambient) {
        u.uAmbient.value.copy(sky.ambient.color).multiplyScalar(sky.ambient.intensity);
      }
    }
    if (this.shoreMat) {
      const s = this.shoreMat.uniforms as ShoreUniforms;
      s.uTime.value = game.time.now;
      s.uCameraPos.value.copy(cam.position);
      if (sky && sky.sun) {
        s.uSunDir.value.copy(sky.sun.position).normalize();
        s.uSunColor.value.copy(sky.sun.color).multiplyScalar(Math.min(2, sky.sun.intensity));
      }
      if (sky && sky.ambient) s.uAmbient.value.copy(sky.ambient.color).multiplyScalar(sky.ambient.intensity);
    }
    for (const m of this.riverMats) {
      const r = m.uniforms as RiverUniforms;
      r.uTime.value = game.time.now;
      r.uCameraPos.value.copy(cam.position);
      if (sky && sky.sun) {
        r.uSunDir.value.copy(sky.sun.position).normalize();
        r.uSunColor.value.copy(sky.sun.color).multiplyScalar(Math.min(2, sky.sun.intensity));
      }
      if (sky && sky.ambient) r.uAmbient.value.copy(sky.ambient.color).multiplyScalar(sky.ambient.intensity);
    }
  }

  /**
   * Is any water body inside the camera frustum?
   *
   * This mattered more than anything else in the system: the reflection is a
   * second full render of the world — its own draw list, its own shadow pass —
   * and it was running every frame of every shot, including the twelve of the
   * fifteen capture shots that contain no water at all.
   *
   */
  _visible(cam: THREE.Camera): boolean {
    this._vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._vp);
    for (const b of this.bodies) {
      if (b.mesh.visible && this._frustum.intersectsBox(b.bounds)) return true;
    }
    return false;
  }

  /**
   * Does the reflection need re-rendering this frame?
   *
   * Four cheap rejections, in increasing order of cost. The first three are the
   * common case: most of the map, and most of the capture shots, contain no
   * water at all, and a menu or a cutscene is looking at a frozen or occluded
   * world where last frame's mirror is still exactly right.
   */
  _shouldReflect(dt: number, game: Game) {
    if (!this.enabled) return false;
    const cam = game.camera;
    if (cam.position.y < this.level) return false;      // underwater
    if (game.state === 'menu' || game.state === 'cutscene') return false;
    const menus = game.get('Menus');
    // A menu is a scrim over a still world: nothing behind it moves enough for
    // a wave-distorted mirror to disagree with the one already in the buffer.
    if (menus && menus.name && menus.name !== 'photo') return false;
    cam.updateMatrixWorld();
    if (!this._visible(cam)) return false;
    // Refresh on a stride once it has been drawn at least once. The surface is
    // 1-2% of the frame, moving, and read through a distorting normal; a
    // half-rate mirror is not resolvable, and this is a whole extra scene pass.
    this._sinceReflect += 1;
    if (this._sinceReflect < this.stride) return false;
    this._sinceReflect = 0;
    return true;
  }

  /** Render the mirrored view. Called from lateUpdate so transforms are final. */
  lateUpdate(dt: number, game: Game) {
    if (!this._shouldReflect(dt, game)) return;
    const cam = game.camera;

    const rc = this.reflectCam;
    rc.copy(cam);
    // Mirror about the body the camera is actually looking at, not about the
    // sea. One reflection target serves every body, so the plane has to be the
    // one that matters this frame — reflecting a hillside tarn about a surface
    // sixty metres below it puts the sky in at the wrong angle, and on a small
    // pond viewed from its bank that is the whole image.
    rc.position.y = 2 * this._nearestLevel(cam.position) - cam.position.y;
    rc.layers.set(REFLECT_LAYER);

    // mirror the orientation about the water plane
    const q = this._q || (this._q = new THREE.Quaternion());
    const e = this._e || (this._e = new THREE.Euler());
    cam.getWorldQuaternion(q);
    e.setFromQuaternion(q, 'YXZ');
    e.x = -e.x; e.z = -e.z;
    rc.quaternion.setFromEuler(e);
    rc.updateMatrixWorld(true);
    rc.updateProjectionMatrix();

    const renderer = game.renderer;
    const prevTarget = renderer.getRenderTarget();
    // No need to hide the surfaces: they are not on the reflection layer.

    // The cascades were being re-rendered for this pass — three re-runs the
    // whole shadow map on every top-level `render()` — so a mirrored view at a
    // quarter of the screen area was paying full price for three 2048² depth
    // passes. Nothing in a wave-distorted reflection resolves a shadow edge, so
    // it reuses the maps the beauty pass already has.
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    this._reflecting = true;

    renderer.setRenderTarget(this.reflectTarget);
    renderer.clear();
    renderer.render(game.scene, rc);
    renderer.setRenderTarget(prevTarget);

    this._reflecting = false;
    renderer.shadowMap.autoUpdate = prevShadow;
  }

  /**
   * The surface height of the body nearest the camera.
   *
   * Nearest by centre distance, which is right for the reflection because the
   * body filling the frame is the one you are standing at. Falls back to the
   * sea when there is nothing else, so a world with no tarns behaves exactly
   * as it did.
   */
  _nearestLevel(p: THREE.Vector3): number {
    let best = this.level, bestD = Infinity;
    for (const b of this.bodies) {
      const d = (p.x - b.cx) ** 2 + (p.z - b.cz) ** 2;
      if (d < bestD) { bestD = d; best = b.level; }
    }
    return best;
  }

  /** Height of the water surface, or null if this point isn't over water. */
  surfaceAt(x: number, z: number) {
    for (const b of this.bodies) {
      if (Math.abs(x - b.cx) < b.w * 0.5 && Math.abs(z - b.cz) < b.d * 0.5) return b.level;
    }
    return null;
  }
}
