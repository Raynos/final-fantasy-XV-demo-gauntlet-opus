import * as THREE from 'three';
import { Noise } from '../../util/Noise.ts';
import { Rng } from '../../util/Rng.ts';
import { RoadNetwork } from './Road.ts';
import { worldMap, LANDFORMS, WORLD } from '../map/WorldMap.ts';

// packed biome vector slots, see WorldMap.BIOME_KEYS
const B_BASE = 0, B_RELIEF = 1, B_RIDGE = 2, B_RIDGEIN = 3, B_TERRACE = 4, B_STYLE = 9, B_WARP = 6;
const B_MOIST = 7;

/**
 * The CPU heightfield — **driven by `world/map/WorldMap.js`, not by taste.**
 *
 * The pipeline is:
 *   1. a *corridor field*: distance to the nearest road or settlement. Every
 *      mountain range in the world is masked by it, so the land opens out
 *      wherever the design says people travel and closes in between,
 *   2. a macro pass whose amplitude, roughness, terracing and warp come from
 *      the zone biome parameters blended at that point,
 *   3. the authored landforms from `WorldMap.LANDFORMS` — mesas, fins, craters,
 *      lake basins, gorges, terraces, a volcano — stamped where the map says,
 *   4. hydraulic erosion, thermal talus and scattered outcrops,
 *   5. settlement pads,
 *   6. the road network carved from the graph.
 *
 * Grid layout (8.2 km of playable world):
 *   near grid : 2048^2 over +/-4096 m   (4 m cells)
 *   far grid  : 1024^2 over +/-16384 m  (32 m cells) — the frontier ranges
 *
 * The 4 m macro cell is topped up by an analytic micro-relief term evaluated
 * identically on the CPU (`microDetail`) and in the vertex shader (`tf_micro`),
 * which is what puts the 6-25 m surface detail back that a 4 m grid cannot
 * carry. `heightAt()` therefore still matches the rendered surface exactly.
 */

export const N = 2048;
export const HALF = 4096;
export const CELL = (HALF * 2) / N;            // 4 m
export const FAR_N = 1024;
export const FAR_HALF = 16384;
export const FAR_CELL = (FAR_HALF * 2) / FAR_N;   // 32 m
/** Beyond this Chebyshev radius the far grid takes over completely. */
export const BLEND_OUT = 4020;
const BLEND_IN = 3560;

const COARSE = 512;                             // macro pass resolution (16 m)
const COARSE_CELL = (HALF * 2) / COARSE;
const SEA = WORLD.seaLevel;

/**
 * Hero landmark anchors, world space — the same names the shot list and the
 * prop scatter have always used, now resolved out of the map instead of being
 * a second, independent set of coordinates.
 */
export const LANDMARKS = buildLandmarks();

function buildLandmarks() {
  const byId = new Map(LANDFORMS.map((l) => [l.id, l]));
  const L: any = {};
  const put = (key: any, id: any, kind?: any) => {
    const f = byId.get(id);
    if (f) L[key as keyof typeof L] = { x: f.x, z: f.z, r: f.r || f.rx || 200, h: f.h || 0, kind: kind || f.kind, id };
  };
  put('blackrockMesa', 'blackrockMesa');
  put('northMesa', 'northMesa');
  put('eastButtes', 'eastButtes', 'buttes');
  put('westScarp', 'westScarp');
  put('spireRidge', 'spireRidge', 'spires');
  put('longwythePeak', 'longwythePeak', 'peak');
  put('discCauthess', 'discCrater', 'crater');
  put('ravatogh', 'ravatoghCone', 'volcano');
  put('vesperpool', 'vesperBasin', 'lake');
  put('alstorSlough', 'alstorBasin', 'lake');
  put('lestallum', 'lestallumTerrace', 'terrace');
  put('crownScarp', 'crownScarp');
  L.canyon = { x: -2318, z: -1180, r: 700, h: -235, kind: 'canyon', id: 'taelparCanyon' };
  L.basin = { x: 60, z: 40, r: 460, h: 9, kind: 'basin', id: 'hammerheadPan' };
  for (const id of ['hammerhead', 'galdin_quay', 'lestallum', 'wiz_chocobo', 'meldacio_hq']) {
    const p = worldMap.poiById(id);
    if (p) L[id.replace(/_(\w)/g, (m, c) => c.toUpperCase()) as keyof typeof L] = { x: p.x, z: p.z, r: p.r, h: 0, kind: 'settlement', id };
  }
  return L;
}

/**
 * Analytic micro-relief, 6-25 m wavelength, +/-2 m. Must stay byte-for-byte
 * equivalent to `tf_micro` in `TerrainMaterial.js`.
 * @returns metres to add to the grid height
 */
export function microDetail(x: any, z: any): number {
  // Two octaves, not three. `heightAt()` is called tens of thousands of times a
  // frame by the grass streamer alone, so this is a hot path: the third octave
  // that used to modulate the amplitude cost 33% of the whole function and was
  // worth about a decimetre of variety.
  return (0.62 * gnoise2(x * 0.0930, z * 0.0930)
    + 0.30 * gnoise2(x * 0.2650 + 5.0, z * 0.2650 - 3.0)) * 0.95;
}

export class Field {
  clear!: any;
  CELL!: any;
  HALF!: any;
  N!: any;
  _b!: any;
  _coarse!: any;
  _farMs!: any;
  _terr!: any;
  corr!: any;
  ctrl!: Uint8Array;
  far!: Float32Array;
  farCtrl!: Uint8Array;
  farNrm!: Uint16Array;
  flow!: Float32Array | null;
  h!: Float32Array;
  lastTerrace!: number;
  map!: any;
  massRaise!: Float32Array;
  n!: Noise;
  n2!: Noise;
  n3!: Noise;
  network!: RoadNetwork;
  nrm!: Uint16Array;
  road!: any;
  roadLat!: Float32Array | null;
  roadMask!: Float32Array | null;
  roadSpline!: any;
  sed!: Float32Array | null;
  slope0!: any;
  stats!: any;
  constructor(seed = 1337) {
    this.N = N; this.HALF = HALF; this.CELL = CELL;
    this.n = new Noise(seed);
    this.n2 = new Noise(seed ^ 0x5f3a);
    this.n3 = new Noise(seed ^ 0x9e17);
    this.map = worldMap;
    this.road = null;
    this.stats = {};
    this._b = {};
  }

  /** Build every grid. Synchronous. */
  build() {
    const t0 = performance.now();
    this.h = new Float32Array(N * N);
    this.far = new Float32Array(FAR_N * FAR_N);
    this.flow = new Float32Array(N * N);
    this.sed = new Float32Array(N * N);
    this.roadMask = new Float32Array(N * N);
    this.roadLat = new Float32Array(N * N);

    this.network = new RoadNetwork(this.map.roadGraph);
    this._buildCorridor();
    const t1 = performance.now();
    this._buildFar();
    const tFar = performance.now();
    this._buildMacro();
    const t2 = performance.now();
    this._farMs = Math.round(tFar - t1);
    this._applyLandforms();
    this._addDetail();
    this._stitchFar();
    const t3 = performance.now();
    this._erode();
    this._talus();
    this._outcrops();
    this._stitchFar();
    const t4 = performance.now();

    this._settlementPads();
    this.network.carve({
      N, HALF, CELL, h: this.h, road: this.roadMask, roadLat: this.roadLat,
      rawHeightAt: (x: any, z: any) => this.rawHeightAt(x, z),
      micro: microDetail,
    });
    /** Legacy single-spline handle: the main highway. */
    this.roadSpline = this.network.spine;

    this._derive();
    this.stats = {
      buildMs: Math.round(performance.now() - t0),
      corridorMs: Math.round(t1 - t0),
      farMs: this._farMs,
      macroMs: Math.round(t2 - t1) - this._farMs,
      landformMs: Math.round(t3 - t2),
      erodeMs: Math.round(t4 - t3),
      roadKm: +(this.map.roadGraph.totalLength / 1000).toFixed(2),
    };
  }

  // ------------------------------------------------------------- corridor

  /**
   * Distance in metres from the nearest road centreline or settlement centre,
   * on the 16 m macro grid. Every mountain belt in the world is faded out
   * against this, which is what makes the ranges sit *between* the places the
   * design says people go instead of on top of them.
   */
  _buildCorridor() {
    const c = new Float32Array(COARSE * COARSE).fill(1e6);
    const g = this.map.roadGraph;

    const stamp = (x: any, z: any, extra: any) => {
      const R = 520 + extra;
      const i0 = Math.max(0, Math.floor((x - R + HALF) / COARSE_CELL));
      const i1 = Math.min(COARSE - 1, Math.ceil((x + R + HALF) / COARSE_CELL));
      const j0 = Math.max(0, Math.floor((z - R + HALF) / COARSE_CELL));
      const j1 = Math.min(COARSE - 1, Math.ceil((z + R + HALF) / COARSE_CELL));
      for (let j = j0; j <= j1; j++) {
        const pz = -HALF + j * COARSE_CELL;
        for (let i = i0; i <= i1; i++) {
          const px = -HALF + i * COARSE_CELL;
          const d = Math.max(0, Math.hypot(px - x, pz - z) - extra);
          const idx = j * COARSE + i;
          if (d < c[idx]) c[idx] = d;
        }
      }
    };

    // Roads: every fourth sample, i.e. one stamp per 24 m. The field is only
    // ever read through a 150-900 m smoothstep, so finer stamping buys nothing
    // and costs a second of build time.
    for (const e of g.edges) for (let i = 0; i < e.pts.length; i += 4) stamp(e.pts[i].x, e.pts[i].z, 0);
    for (const e of g.edges) stamp(e.pts[e.pts.length - 1].x, e.pts[e.pts.length - 1].z, 0);
    // settlements and campsites open out a wider clearing
    for (const p of this.map.pois) {
      const w = p.type === 'town' ? 170 : p.type === 'outpost' || p.type === 'reststop' ? 110
        : p.type === 'chocobo' ? 130 : p.type === 'parking' ? 40
          : p.type === 'haven' ? 40 : p.type === 'imperial' ? 100 : 0;
      if (w > 0) stamp(p.x, p.z, w);
    }
    this.corr = c;

    // A second field: distance from the nearest *authored* landform. The
    // procedural ridge belt is faded out against it, so a hero mesa is never
    // buried under a generic range that happened to grow on the same spot.
    const cl = new Float32Array(COARSE * COARSE).fill(1e6);
    const stampClear = (x: any, z: any, extra: any) => {
      const R = 700 + extra;
      const i0 = Math.max(0, Math.floor((x - R + HALF) / COARSE_CELL));
      const i1 = Math.min(COARSE - 1, Math.ceil((x + R + HALF) / COARSE_CELL));
      const j0 = Math.max(0, Math.floor((z - R + HALF) / COARSE_CELL));
      const j1 = Math.min(COARSE - 1, Math.ceil((z + R + HALF) / COARSE_CELL));
      for (let j = j0; j <= j1; j++) {
        const pz = -HALF + j * COARSE_CELL;
        for (let i = i0; i <= i1; i++) {
          const px = -HALF + i * COARSE_CELL;
          const d = Math.max(0, Math.hypot(px - x, pz - z) - extra);
          const idx = j * COARSE + i;
          if (d < cl[idx]) cl[idx] = d;
        }
      }
    };
    for (const f of LANDFORMS) {
      if (f.kind === 'mesa' || f.kind === 'butte' || f.kind === 'peak'
        || f.kind === 'volcano' || f.kind === 'crater') {
        stampClear(f.x, f.z, (f.r || 200) * 0.85);
      } else if (f.kind === 'terrace') {
        stampClear(f.x, f.z, Math.max(f.rx, f.rz) * 0.9);
      } else if (f.kind === 'fin') {
        const steps = 6;
        for (let k = 0; k <= steps; k++) {
          const t = k / steps;
          stampClear(f.x0 + (f.x1 - f.x0) * t, f.z0 + (f.z1 - f.z0) * t, f.halfW * 1.6);
        }
      }
    }
    this.clear = cl;
  }

  /** Bilinear distance to the nearest authored landform, metres. */
  clearAt(x: any, z: any) {
    const fx = (x + HALF) / COARSE_CELL, fz = (z + HALF) / COARSE_CELL;
    let i0 = Math.floor(fx), j0 = Math.floor(fz);
    const tx = fx - i0, tz = fz - j0;
    if (i0 < 0) i0 = 0; else if (i0 > COARSE - 2) i0 = COARSE - 2;
    if (j0 < 0) j0 = 0; else if (j0 > COARSE - 2) j0 = COARSE - 2;
    const c = this.clear, b = j0 * COARSE + i0;
    const a0 = c[b], a1 = c[b + 1], a2 = c[b + COARSE], a3 = c[b + COARSE + 1];
    return (a0 + (a1 - a0) * tx) * (1 - tz) + (a2 + (a3 - a2) * tx) * tz;
  }

  /** Bilinear corridor distance, metres. */
  corridorAt(x: any, z: any) {
    const fx = (x + HALF) / COARSE_CELL, fz = (z + HALF) / COARSE_CELL;
    let i0 = Math.floor(fx), j0 = Math.floor(fz);
    const tx = fx - i0, tz = fz - j0;
    if (i0 < 0) i0 = 0; else if (i0 > COARSE - 2) i0 = COARSE - 2;
    if (j0 < 0) j0 = 0; else if (j0 > COARSE - 2) j0 = COARSE - 2;
    const c = this.corr, b = j0 * COARSE + i0;
    const a0 = c[b], a1 = c[b + 1], a2 = c[b + COARSE], a3 = c[b + COARSE + 1];
    return (a0 + (a1 - a0) * tx) * (1 - tz) + (a2 + (a3 - a2) * tx) * tz;
  }

  /**
   * Rebuild the cheap derived grids from `h` / `far` alone.
   *
   * Used by the baked-field path: normals are a two-tap finite difference over
   * a grid we already have, ~50 ms for both resolutions, so they are recomputed
   * rather than stored — baking them would cost 16 MB of payload to save a
   * twentieth of a second.
   */
  deriveNormals() {
    const toHalf = THREE.DataUtils.toHalfFloat;
    const h = this.h;
    this.nrm = new Uint16Array(N * N * 2);
    for (let j = 0; j < N; j++) {
      const jc = j * N, jm = (j > 0 ? j - 1 : 0) * N, jp = (j < N - 1 ? j + 1 : N - 1) * N;
      for (let i = 0; i < N; i++) {
        const im = i > 0 ? i - 1 : 0, ip = i < N - 1 ? i + 1 : N - 1;
        let nx = (h[jc + im] - h[jc + ip]) / (2 * CELL);
        let nz = (h[jm + i] - h[jp + i]) / (2 * CELL);
        const inv = 1 / Math.sqrt(nx * nx + nz * nz + 1);
        this.nrm[(jc + i) * 2] = toHalf(nx * inv);
        this.nrm[(jc + i) * 2 + 1] = toHalf(nz * inv);
      }
    }
    this.farNrm = new Uint16Array(FAR_N * FAR_N * 2);
    for (let j = 0; j < FAR_N; j++) {
      for (let i = 0; i < FAR_N; i++) {
        const idx = j * FAR_N + i;
        let nx = (this._farAt(i - 1, j) - this._farAt(i + 1, j)) / (2 * FAR_CELL);
        let nz = (this._farAt(i, j - 1) - this._farAt(i, j + 1)) / (2 * FAR_CELL);
        const inv = 1 / Math.sqrt(nx * nx + nz * nz + 1);
        this.farNrm[idx * 2] = toHalf(nx * inv);
        this.farNrm[idx * 2 + 1] = toHalf(nz * inv);
      }
    }
  }

  // ---------------------------------------------------------------- far field

  /**
   * The frontier: ranges beyond the playable field. Pure procedural, but the
   * silhouette variety machinery (per-massif axis, aspect, crest notches, mesa
   * capping, benching, talus aprons) is kept — it is what stops a horizon
   * reading as N copies of one cone.
   */
  farHeight(x: any, z: any) {
    const n = this.n, n2 = this.n2, n3 = this.n3;
    const wx = x * 0.000158, wz = z * 0.000158;
    const q1 = n2.fbm2(wx * 0.62 + 11.3, wz * 0.62 - 4.1, 3);
    const q2 = n2.fbm2(wx * 0.62 - 7.7, wz * 0.62 + 9.4, 3);

    const th = 3.14159 * n3.fbm2(x * 0.000071 + 71.3, z * 0.000071 - 12.7, 2);
    const ca = Math.cos(th), sa = Math.sin(th);
    const elong = clamp01(0.5 + 0.72 * n3.fbm2(x * 0.0000975 - 44.1, z * 0.0000975 + 18.9, 2));
    const uu = (wx * ca + wz * sa) / (0.50 + 1.20 * elong) + 0.85 * q1;
    const vv = (-wx * sa + wz * ca) * (0.62 + 1.05 * elong) + 0.85 * q2;
    let rg = n.ridged2(uu, vv, 5, 2.03, 0.44);
    rg *= 1 - 0.44 * smoothstep(0.28, 0.86,
      0.5 + 0.62 * n3.fbm2(uu * 4.7 + 3.3, vv * 4.7 - 7.1, 3));

    const r = Math.hypot(x, z) / 2670;
    // the northern (-Z) wall is the tallest: it backs the hero and vista shots
    const dir = 0.62 + 0.38 * (-z / Math.max(1, Math.hypot(x, z)));
    const massif = 0.35 + 0.75 * Math.max(0, n2.fbm2(x * 0.000128 - 8.2, z * 0.000128 + 3.5, 3));
    const mask = smoothstep(1.05, 2.45, r)
      * (0.5 + 0.5 * n.fbm2(x * 0.000071 + 31, z * 0.000071 - 17, 3) + 0.001) * dir * massif;
    const plain = 14 + 40 * n.fbm2(x * 0.000195 + 3.3, z * 0.000195 + 8.1, 4);

    const ch = clamp01(0.5 + 0.62 * n2.fbm2(x * 0.0000788 + 55.7, z * 0.0000788 - 22.3, 2));
    const sharp = 1.12 + 0.78 * ch;
    const amp = 1180 - 340 * ch;

    let h = plain + Math.pow(Math.max(0, rg - 0.10), sharp) * amp * Math.max(0, mask);
    h += smoothstep(1.2, 2.6, r) * 160 * Math.max(0, n.fbm2(wx * 0.8 + 2.4, wz * 0.8 - 6.1, 4)) * dir;
    h += smoothstep(2.3, 4.0, r) * 380 * Math.pow(n.ridged2(wx * 0.52 + 5.5, wz * 0.52 - 2.2, 4, 2.0, 0.46), 1.4);

    const capAmt = smoothstep(0.58, 0.14, ch);
    if (capAmt > 0.001) {
      const capH = 210 + 380 * (0.5 + 0.5 * n.fbm2(x * 0.0000975 - 13.1, z * 0.0000975 + 6.7, 2));
      if (h > capH) h -= (h - capH) * capAmt * 0.96;
    }
    const stepAmt = smoothstep(0.24, 0.72, 1 - ch) * smoothstep(85, 200, h);
    if (stepAmt > 0.002) {
      const stepH = 52 + 66 * (0.5 + 0.5 * n2.fbm2(x * 0.000116 + 27.7, z * 0.000116 - 5.5, 2));
      const t = h / stepH, fl = Math.floor(t), fr = t - fl;
      h += ((fl + smoothstep(0.50, 0.94, fr)) * stepH - h) * 0.60 * stepAmt;
    }
    const above = h - plain;
    if (above > 0) h = plain + above * (0.60 + 0.40 * Math.min(1, above / 180));
    // The frontier is never below the water plane. Its plain term is an fbm
    // that can go negative, and a puddle out at 4 km costs one of the four
    // water bodies `Water` is willing to build — which is how the Galdin sea
    // ended up not being drawn.
    return Math.max(SEA + 14, h);
  }

  _buildFar() {
    const f = this.far;
    // Evaluate on a half-resolution lattice and interpolate up: the field is
    // low-pass filtered twice below anyway, and the frontier is 4-16 km away.
    const M = FAR_N >> 1, MC = FAR_CELL * 2;
    const c = new Float32Array(M * M);
    for (let j = 0; j < M; j++) {
      const z = -FAR_HALF + j * MC;
      for (let i = 0; i < M; i++) c[j * M + i] = this.farHeight(-FAR_HALF + i * MC, z);
    }
    const cAt = (i: any, j: any) => c[Math.min(M - 1, Math.max(0, j)) * M + Math.min(M - 1, Math.max(0, i))];
    for (let j = 0; j < FAR_N; j++) {
      const fj = j * 0.5, j0 = Math.floor(fj), tz = fj - j0;
      for (let i = 0; i < FAR_N; i++) {
        const fi = i * 0.5, i0 = Math.floor(fi), tx = fi - i0;
        const a = cAt(i0, j0), b = cAt(i0 + 1, j0), d = cAt(i0, j0 + 1), e = cAt(i0 + 1, j0 + 1);
        f[j * FAR_N + i] = (a + (b - a) * tx) * (1 - tz) + (d + (e - d) * tx) * tz;
      }
    }
    const tmp = new Float32Array(f.length);
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < FAR_N; j++) {
        for (let i = 0; i < FAR_N; i++) {
          const a = this._farAt(i - 1, j), b = this._farAt(i + 1, j);
          const c = this._farAt(i, j - 1), d = this._farAt(i, j + 1);
          tmp[j * FAR_N + i] = f[j * FAR_N + i] * 0.5 + (a + b + c + d) * 0.125;
        }
      }
      f.set(tmp);
    }
  }

  _farAt(i: any, j: any) {
    const ii = i < 0 ? 0 : i > FAR_N - 1 ? FAR_N - 1 : i;
    const jj = j < 0 ? 0 : j > FAR_N - 1 ? FAR_N - 1 : j;
    return this.far[jj * FAR_N + ii];
  }

  // --------------------------------------------------------------- near field

  /**
   * Macro landscape from the map's blended biome parameters. Evaluated on the
   * 16 m grid, then bicubically upsampled.
   */
  macroHeight(x: any, z: any) {
    const n = this.n, n2 = this.n2;
    const b = this.map.biomeVec(x, z);
    const bRelief = b[B_RELIEF], bRidge = b[B_RIDGE], bTerrace = b[B_TERRACE];
    // Benching is a *badland* landform: bare bedded rock shedding its cover in
    // steps. Under a soil and root mat there is no bench — the slope creeps
    // smooth — so a humid region keeps only a trace of the map's terrace value.
    //
    // This is the fix for the horizontal "wood grain" that ran up every Duscae
    // and Cleigne valley wall. It was diagnosed twice as strata and it is not:
    // forcing every strata term to zero leaves it untouched, but a flat albedo
    // removes it, which rules out both. What it actually is: `terrace` 0.68 at
    // Taelpar pulls the ground 56 % of the way onto a 22 m staircase, and the
    // splat then reads the tread as dirt and the riser as rock. A step barely
    // visible in the geometry comes out as a hard alternating colour band.
    //
    // Leide is where terracing belongs and is untouched: `moist` runs
    // 0.18-0.24 there, so the gate never opens.
    this.lastTerrace = bTerrace * (1 - 0.88 * smoothstep(0.28, 0.60, b[B_MOIST]));

    // large domain warp — kills the "obviously procedural" grid feel
    const q1 = n2.fbm2(x * 0.00032 + 3.1, z * 0.00032 + 7.7, 3);
    const q2 = n2.fbm2(x * 0.00032 - 5.3, z * 0.00032 + 1.9, 3);
    const wx = x + b[B_WARP] * q1, wz = z + b[B_WARP] * q2;

    let h = b[B_BASE];
    h += bRelief * (0.62 * n.fbm2(wx * 0.00022, wz * 0.00022, 4)
      + 0.30 * n.fbm2(wx * 0.00080 + 12.4, wz * 0.00080 - 5.6, 4)
      + 0.20 * n2.fbm2(wx * 0.00218 - 2.2, wz * 0.00218 + 6.3, 4));

    // low benched ridges — mid-ground structure at 150-600 m
    const bench = n.ridged2(wx * 0.00158 + 3.7, wz * 0.00158 - 9.1, 4, 2.05, 0.55);
    h += Math.pow(Math.max(0, bench - 0.30) / 0.70, 1.6) * bRelief * 1.15;

    // ------- the ridge belt, held off the travel corridors -------
    const corr = this.corridorAt(x, z);
    const belt = smoothstep(120, 240 + b[B_RIDGEIN] * 0.55, corr)
      * (0.16 + 0.84 * smoothstep(30, 340, this.clearAt(x, z)));
    if (belt > 0.002 && bRidge > 1) {
      const th = 3.14159 * n2.fbm2(x * 0.000165 + 12.9, z * 0.000165 - 31.5, 2);
      const ca = Math.cos(th), sa = Math.sin(th);
      const elong = clamp01(0.5 + 0.75 * n2.fbm2(x * 0.000229 - 7.7, z * 0.000229 + 22.1, 2));
      const bu = (wx * ca + wz * sa) * 0.000506 / (0.55 + 1.05 * elong) + 21.5;
      const bv = (-wx * sa + wz * ca) * 0.000506 * (0.62 + 1.00 * elong) + 4.2;
      let rg = n.ridged2(bu, bv, 5, 2.11, 0.5);
      rg *= 1 - 0.40 * smoothstep(0.30, 0.86,
        0.5 + 0.60 * n2.fbm2(bu * 4.3 - 9.4, bv * 4.3 + 2.8, 3));

      const style = clamp01(b[B_STYLE] + 0.34 * n2.fbm2(x * 0.000195 + 61.3, z * 0.000195 - 37.1, 2));
      let beltH = Math.pow(Math.max(0, rg - 0.16) / 0.84, 1.30 + 1.05 * style)
        * bRidge * belt;
      const capA = smoothstep(0.58, 0.10, style) * bTerrace;
      if (capA > 0.002 && beltH > 20) {
        const capH = 46 + 130 * (0.5 + 0.5 * n2.fbm2(x * 0.000262 - 5.5, z * 0.000262 + 9.1, 2));
        if (beltH > capH) beltH -= (beltH - capH) * capA * 0.94;
      }
      // concave foot: scree apron rather than a hard cone base
      if (beltH > 0) beltH *= 0.58 + 0.42 * Math.min(1, beltH / 60);
      h += beltH;
    }
    return h;
  }

  _buildMacro() {
    const c = new Float32Array(COARSE * COARSE);
    const terr = new Float32Array(COARSE * COARSE);
    for (let j = 0; j < COARSE; j++) {
      const z = -HALF + j * COARSE_CELL;
      for (let i = 0; i < COARSE; i++) {
        c[j * COARSE + i] = this.macroHeight(-HALF + i * COARSE_CELL, z);
        terr[j * COARSE + i] = this.lastTerrace;
      }
    }
    this._coarse = c;
    this._terr = terr;

    const at = (i: any, j: any) => {
      const ii = i < 0 ? 0 : i > COARSE - 1 ? COARSE - 1 : i;
      const jj = j < 0 ? 0 : j > COARSE - 1 ? COARSE - 1 : j;
      return c[jj * COARSE + ii];
    };
    const cr = (p0: any, p1: any, p2: any, p3: any, t: any) => {
      const t2 = t * t, t3 = t2 * t;
      return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    };

    const h = this.h;
    const scale = CELL / COARSE_CELL;   // 0.25
    const col = new Float32Array(4);
    for (let j = 0; j < N; j++) {
      const fz = j * scale, jz = Math.floor(fz), tz = fz - jz;
      for (let i = 0; i < N; i++) {
        const fx = i * scale, ix = Math.floor(fx), tx = fx - ix;
        for (let k = 0; k < 4; k++) {
          col[k] = cr(at(ix - 1, jz - 1 + k), at(ix, jz - 1 + k), at(ix + 1, jz - 1 + k), at(ix + 2, jz - 1 + k), tx);
        }
        h[j * N + i] = cr(col[0], col[1], col[2], col[3], tz);
      }
    }

    // terracing + valley flattening at full resolution: crisp mesa risers and
    // genuinely flat basin floors, which is what sells "badlands".
    const n2 = this.n2;

    for (let j = 0; j < N; j++) {
      const z = -HALF + j * CELL;
      for (let i = 0; i < N; i++) {
        const idx = j * N + i;
        const x = -HALF + i * CELL;
        let v = h[idx];
        const tw = terr[Math.min(COARSE - 1, (j >> 2)) * COARSE + Math.min(COARSE - 1, (i >> 2))];

        if (v > 26 && tw > 0.05) {
          // Two pitches, not one. The 2.4 km field alone gives a whole massif a
          // single riser spacing, and one spacing repeated up a face is what
          // reads as corduroy rather than as bedrock; the 260 m field breaks it
          // into packages the way a real stratigraphic column does.
          const step = 22 + 11 * n2.simplex2(x * 0.00041 + 4.4, z * 0.00041 - 2.1)
            + 6 * n2.simplex2(x * 0.0038 - 6.1, z * 0.0038 + 3.7);
          const t = v / step, fl = Math.floor(t), fr = t - fl;
          const k = smoothstep(0.46, 0.9, fr);
          const terraced = (fl + k) * step;
          const amount = tw * (0.32 + 0.50 * (0.5 + 0.5 * n2.fbm2(x * 0.0006 + 9, z * 0.0006 + 3, 3)));
          v += (terraced - v) * amount * smoothstep(26, 56, v);
        }
        h[idx] = v;
      }
    }
  }

  /** High-frequency relief, stronger on slopes than on pans. */
  _addDetail() {
    const h = this.h, n2 = this.n2, n3 = this.n3;
    const grad = new Float32Array(N * N);
    for (let j = 1; j < N - 1; j++) {
      for (let i = 1; i < N - 1; i++) {
        const idx = j * N + i;
        const gx = (h[idx + 1] - h[idx - 1]) / (2 * CELL);
        const gz = (h[idx + N] - h[idx - N]) / (2 * CELL);
        grad[idx] = Math.min(1, Math.hypot(gx, gz));
      }
    }
    this.slope0 = grad;

    for (let j = 0; j < N; j++) {
      const z = -HALF + j * CELL;
      for (let i = 0; i < N; i++) {
        const idx = j * N + i;
        const x = -HALF + i * CELL;
        const s = grad[idx];
        const rough = 0.45 + 1.25 * s;
        // eroded dry-wash texture: ridged noise reads as gullies, not as bumps
        // These are *world-space* wavelengths — 140 m washes, 75 m rolls, 19 m
        // rubble — so they do not scale with the grid. Rescaling them for the
        // 4 m cell was what turned the badlands into dough.
        const gully = n2.ridged2(x * 0.0072 + 2.2, z * 0.0072 - 4.4, 3, 2.1, 0.55);
        let d = -3.7 * Math.pow(Math.max(0, gully - 0.34) / 0.66, 1.5) * (0.4 + 0.9 * s);
        d += 2.9 * n2.fbm2(x * 0.0135, z * 0.0135, 3) * (0.6 + 0.95 * s);
        d += 1.45 * n3.fbm2(x * 0.038 + 4.1, z * 0.038 - 2.7, 3) * rough;
        if (s > 0.34) {
          const w = n3.worley2(x * 0.055, z * 0.055);
          d += Math.max(0, 0.58 - w.f1) * 4.6 * (s - 0.34);
        }
        h[idx] += d;
      }
    }
  }

  // -------------------------------------------------------------- landforms

  /**
   * Stamp every entry in `WorldMap.LANDFORMS`.
   *
   * Mesas, buttes and peaks are stamped through `_mass`, which records how much
   * rock each one added. `_basin` reads that back so a sea can lower the ground
   * a hero massif stands on without planing the massif itself off — see
   * `_basin` for the Cape Caem case that made this necessary.
   */
  _applyLandforms() {
    const rng = new Rng(9931);
    this.massRaise = new Float32Array(N * N);
    const mass = (x: any, z: any, r: any, fn: any) => this._mass(x, z, r, fn);
    for (const f of LANDFORMS) {
      switch (f.kind) {
        case 'mesa':
        case 'butte':
          mass(f.x, f.z, f.r * 1.3, () => this._mesa(f.x, f.z, f.r, f.h, f.kind === 'butte' ? 0.48 : 0.30, f));
          break;
        case 'fin':
          this._fin(f.x0, f.z0, f.x1, f.z1, f.halfW, f.h, f);
          break;
        case 'spire':
          this._spireRidge(f.x, f.z, f.spanX, f.spanZ, f.count, rng);
          break;
        case 'peak': mass(f.x, f.z, f.r, () => this._peak(f.x, f.z, f.r, f.h)); break;
        case 'crater': this._crater(f); break;
        case 'volcano': mass(f.x, f.z, f.r, () => this._volcano(f)); break;
        case 'basin': this._basin(f); break;
        case 'terrace': this._terrace(f); break;
        case 'canyon': this._canyon(f); break;
        default: break;
      }
    }
  }

  /**
   * Run one landform stamp and record the rock it added into `massRaise`.
   *
   * Deliberately bounded to the landform's *core* radius rather than its full
   * stamped extent: the apron of a big mesa feathers out for a kilometre, and
   * treating that skirt as protected mass is what stopped `nebulaFloor` from
   * levelling the Nebulawood and drained half of Alstor Slough when this was
   * first written as a blanket rule.
   *
   * @param r core radius in metres
   * @param fn the stamp
   */
  _mass(cx: any, cz: any, r: number, fn: (() => void)) {
    const box = this._box(cx, cz, r);
    const w = box.i1 - box.i0 + 1, hgt = box.j1 - box.j0 + 1;
    const before = new Float32Array(w * hgt);
    for (let j = box.j0; j <= box.j1; j++) {
      for (let i = box.i0; i <= box.i1; i++) before[(j - box.j0) * w + (i - box.i0)] = this.h[j * N + i];
    }
    fn();
    const mr = this.massRaise;
    for (let j = box.j0; j <= box.j1; j++) {
      const z = -HALF + j * CELL;
      for (let i = box.i0; i <= box.i1; i++) {
        const x = -HALF + i * CELL;
        if (Math.hypot(x - cx, z - cz) > r) continue;
        const idx = j * N + i;
        const d = this.h[idx] - before[(j - box.j0) * w + (i - box.i0)];
        if (d > mr[idx]) mr[idx] = d;
      }
    }
  }

  _spireRidge(cx: any, cz: any, spanX: any, spanZ: any, count: any, rng: any) {
    for (let k = 0; k < count; k++) {
      const t = k / (count - 1) - 0.5;
      const sx = cx + t * spanX + rng.range(-40, 40);
      const sz = cz + t * spanZ + rng.range(-46, 46);
      this._spire(sx, sz, rng.range(16, 38), rng.range(34, 108));
    }
    for (let k = 0; k < 4; k++) {
      const a = rng.range(0, 6.283), d = rng.range(140, 360);
      this._spire(cx + Math.cos(a) * d, cz + Math.sin(a) * d, rng.range(11, 24), rng.range(18, 46));
    }
  }

  /**
   * A big mountain: conical bulk with ridged flanks and a laid-back foot.
   * Used for Longwythe Peak — the one landform in Leide with real prominence.
   */
  _peak(cx: any, cz: any, radius: any, height: any) {
    const h = this.h, n = this.n2, n3 = this.n3;
    const box = this._box(cx, cz, radius);
    for (let j = box.j0; j <= box.j1; j++) {
      const z = -HALF + j * CELL;
      for (let i = box.i0; i <= box.i1; i++) {
        const x = -HALF + i * CELL;
        const dx = x - cx, dz = z - cz;
        const ang = Math.atan2(dz, dx);
        // ridge/gully spokes so the cone reads as a mountain, not a tent
        const spoke = 0.80 + 0.34 * n.fbm2(Math.cos(ang) * 3.1 + cx * 0.004,
          Math.sin(ang) * 3.1 + cz * 0.004, 3);
        const warp = 1 + 0.20 * n3.fbm2(x * 0.0016 + 3, z * 0.0016 - 5, 3);
        const d = Math.hypot(dx, dz) / warp;
        if (d > radius) continue;
        const t = 1 - d / radius;
        let v = height * Math.pow(t, 2.15) * spoke;
        // a summit crag and a broad shoulder
        v += height * 0.16 * Math.pow(Math.max(0, 1 - d / (radius * 0.24)), 1.4);
        v *= 0.62 + 0.38 * Math.min(1, v / 60);
        if (v > 0.4) h[j * N + i] += v;
      }
    }
  }

  /**
   * Impact crater: a raised rim ring, a sunken floor, and a central mass.
   * The Disc of Cauthess.
   */
  _crater(f: any) {
    const h = this.h, n = this.n2;
    const { x: cx, z: cz, r, rim, depth, core } = f;
    const box = this._box(cx, cz, r * 1.15);
    for (let j = box.j0; j <= box.j1; j++) {
      const z = -HALF + j * CELL;
      for (let i = box.i0; i <= box.i1; i++) {
        const x = -HALF + i * CELL;
        const dx = x - cx, dz = z - cz;
        const ang = Math.atan2(dz, dx);
        const lobe = 1 + 0.13 * n.fbm2(Math.cos(ang) * 2.2, Math.sin(ang) * 2.2, 3);
        const d = Math.hypot(dx, dz) / lobe;
        if (d > r * 1.15) continue;
        const rr = (d - r * 0.80) / (r * 0.17);
        let v = rim * Math.exp(-rr * rr);
        // the access road runs out onto a spur of the rim: hold the sunken
        // crust back from the corridor so the overlook is not in a hole
        const guard = smoothstep(20, 130, this.corridorAt(x, z));
        v -= depth * (1 - smoothstep(r * 0.46, r * 0.88, d)) * guard;
        v += core * Math.pow(Math.max(0, 1 - d / (r * 0.30)), 1.5);
        // shock-fractured plates on the crust
        v += 9 * n.fbm2(x * 0.0031 + 71, z * 0.0031 - 12, 3) * (1 - smoothstep(r * 0.5, r * 0.95, d));
        const idx = j * N + i;
        h[idx] = Math.max(SEA + 10, h[idx] + v);
      }
    }
  }

  /** Stratovolcano: steep cone, crater bowl, rim lip, ash apron. */
  _volcano(f: any) {
    const h = this.h, n = this.n2;
    const { x: cx, z: cz, r, h: height } = f;
    const cr = (f.crater || 0.25) * r;
    const box = this._box(cx, cz, r);
    for (let j = box.j0; j <= box.j1; j++) {
      const z = -HALF + j * CELL;
      for (let i = box.i0; i <= box.i1; i++) {
        const x = -HALF + i * CELL;
        const dx = x - cx, dz = z - cz;
        const ang = Math.atan2(dz, dx);
        const flute = 0.86 + 0.22 * n.fbm2(Math.cos(ang) * 5.5 + 3, Math.sin(ang) * 5.5 - 7, 3);
        const d = Math.hypot(dx, dz);
        if (d > r) continue;
        const t = 1 - d / r;
        let v = height * Math.pow(t, 1.55) * flute;
        if (d < cr) {
          const u = d / cr;
          v -= height * 0.20 * (1 - u * u);      // crater bowl
        }
        // rim lip
        v += height * 0.045 * Math.exp(-Math.pow((d - cr) / (cr * 0.22), 2));
        if (v > 0.4) h[j * N + i] += v;
      }
    }
  }

  /**
   * A basin: pull the ground toward `h`. Where `h` is below sea level the
   * result is a lake — and roads are protected, so the highway crosses on a
   * causeway instead of drowning.
   */
  _basin(f: any) {
    const h = this.h, n = this.n2, mr = this.massRaise;
    const { x: cx, z: cz, r } = f;
    const target = f.h;
    const wet = target < SEA + 6;
    const box = this._box(cx, cz, r);
    for (let j = box.j0; j <= box.j1; j++) {
      const z = -HALF + j * CELL;
      for (let i = box.i0; i <= box.i1; i++) {
        const x = -HALF + i * CELL;
        const d = Math.hypot(x - cx, z - cz)
          * (1 - 0.14 * n.fbm2(x * 0.0012 + 5, z * 0.0012 - 3, 3));
        if (d > r) continue;
        let k = 1 - smoothstep(r * 0.42, r, d);
        if (wet) {
          // hold the water back from the roads: a raised bank, not a ford
          k *= smoothstep(24, 105, this.corridorAt(x, z));
        }
        if (k < 0.002) continue;
        const idx = j * N + i;
        const jitter = (wet ? 2.2 : 5.0) * n.fbm2(x * 0.0026 - 8, z * 0.0026 + 4, 3);
        // Water finds a level; it does not saw the top off a headland.
        //
        // `caemSea` is 1050 m across and centred 780 m from Cape Caem, so its
        // falloff was still pulling at k = 0.41 directly over `caemHeadland` —
        // and being listed *after* it in the map, it dragged a 140 m
        // flat-topped headland 40% of the way down to -44 m. No cap, no rim, no
        // cliff, and the ground the party stands on 7 m *below* the plain
        // behind it. That is the "flat untextured slabs" every camera inside
        // 700 m of Cape Caem was reporting.
        //
        // So lift the massif's own rock out of the way, lower the base surface
        // under it, and set the rock back down on top. `massRaise` is only
        // written by mesa / butte / peak / volcano stamps and only inside their
        // core radius, so away from a hero massif it is 0 and this line is
        // arithmetically identical to the plain interpolation it replaces.
        // Wet only: a dry basin is a levelling pad — a garage apron, a chocobo
        // prairie — and planing a hillside flat is the whole point of one.
        const raised = wet ? Math.min(mr[idx], Math.max(0, h[idx] - target)) : 0;
        const base = h[idx] - raised;
        h[idx] = base + ((target + jitter) - base) * k + raised;
      }
    }
  }

  /**
   * A structural terrace: a level bench at elevation `h` inside a rotated
   * ellipse, edged by a cliff. Lestallum stands on one of these.
   */
  _terrace(f: any) {
    const h = this.h, n = this.n2, n3 = this.n3;
    const { x: cx, z: cz, rx, rz, rot } = f;
    const ca = Math.cos(rot || 0), sa = Math.sin(rot || 0);
    const R = Math.max(rx, rz) * 1.55;
    const box = this._box(cx, cz, R);
    for (let j = box.j0; j <= box.j1; j++) {
      const z = -HALF + j * CELL;
      for (let i = box.i0; i <= box.i1; i++) {
        const x = -HALF + i * CELL;
        const dx = x - cx, dz = z - cz;
        const u = (dx * ca + dz * sa) / rx;
        const v = (-dx * sa + dz * ca) / rz;
        const lobe = 1 + 0.16 * n.fbm2(u * 2.4 + cx * 0.003, v * 2.4 + cz * 0.003, 3);
        const d = Math.hypot(u, v) / lobe;
        if (d > 1.5) continue;
        const idx = j * N + i;
        const top = f.h + 2.4 * n3.fbm2(x * 0.0025 + 11, z * 0.0025 - 6, 3);
        if (d <= 0.94) {
          h[idx] += (top - h[idx]) * 0.95;
        } else {
          // the scarp: a steep face falling from the bench to the local ground
          const t = (d - 0.94) / 0.56;
          const y = top - (top - h[idx]) * Math.pow(t, 0.55);
          if (y > h[idx]) h[idx] = h[idx] + (y - h[idx]) * (1 - smoothstep(0, 1, t)) * 0.9;
        }
      }
    }
  }

  /**
   * Scattered boulders and rock ribs.
   *
   * **Every candidate draws the same nine numbers in the same order whether it
   * is placed or not.** It used to draw two, three or eight depending on the
   * local slope and on whether the boulder came out big — so any change to the
   * heightfield anywhere re-phased the stream from that point on and reshuffled
   * every boulder downstream of it. That made a one-line height experiment
   * indistinguishable from a scatter regression in an A/B, and it is why the
   * terrain gates could never be read as "only the thing I touched moved".
   * Draw first, decide after; it costs nine `next()` calls per candidate
   * instead of an average of about four, on nine thousand candidates, once, at
   * bake time.
   */
  _outcrops() {
    const rng = new Rng(4242);
    for (let k = 0; k < 9000; k++) {
      const cx = rng.range(-HALF + 40, HALF - 40);
      const cz = rng.range(-HALF + 40, HALF - 40);
      const accept = rng.next();
      const big = rng.next() < 0.12;
      const rBig = rng.range(16, 40), rSmall = rng.range(3.5, 16);
      const hBig = rng.range(4, 13), hSmall = rng.range(0.9, 4.4);
      const ph = rng.range(0, 6.283);
      const ecc = rng.range(0.6, 1.0);

      const i = Math.round((cx + HALF) / CELL), j = Math.round((cz + HALF) / CELL);
      if (i < 4 || j < 4 || i > N - 5 || j > N - 5) continue;
      const s = this.slope0 ? this.slope0[j * N + i] : 0.2;
      if (accept > 0.24 + s * 1.5) continue;
      const r = (big ? rBig : rSmall) * (0.75 + s);
      const hh = (big ? hBig : hSmall) * (0.6 + s * 2.0);
      this._outcrop(cx, cz, r, hh, ph, ecc);
    }
  }

  /**
   * @param ph rotation, radians — drawn by the caller, see `_outcrops`
   * @param ecc 0.6-1.0 cross-axis squash
   */
  _outcrop(cx: any, cz: any, radius: any, height: any, ph: number, ecc: number) {
    const h = this.h, n = this.n3;
    const R = radius * 2.2;
    const box = this._box(cx, cz, R);
    const ca = Math.cos(ph), sa = Math.sin(ph);
    for (let j = box.j0; j <= box.j1; j++) {
      const z = -HALF + j * CELL;
      for (let i = box.i0; i <= box.i1; i++) {
        const x = -HALF + i * CELL;
        const dx = x - cx, dz = z - cz;
        const rx = dx * ca + dz * sa, rz = (-dx * sa + dz * ca) / ecc;
        const ang = Math.atan2(rz, rx);
        const warp = 1 + 0.34 * n.fbm2(Math.cos(ang) * 2.4 + cx * 0.02, Math.sin(ang) * 2.4 + cz * 0.02, 3);
        const d = Math.hypot(rx, rz) / warp;
        if (d > R) continue;
        const t = Math.max(0, Math.min(1, 1 - d / radius));
        h[j * N + i] += height * Math.pow(t, 0.34);
      }
    }
  }

  /**
   * Flat-topped mesa / butte.
   *
   * This *imposes* a landform rather than adding a bump: the cap is genuinely
   * level (with a slight structural dip), the wall drops as a near-vertical
   * cliff off a hard rim, optional benches step down from it, and a concave
   * scree apron lays the foot back into the surrounding ground.
   *
   * @param wallFrac 0..1 — how much of the radius the cliff occupies
   */
  _mesa(cx: any, cz: any, radius: any, height: any, wallFrac: number, opt: any = {}) {
    const h = this.h, n = this.n2, n3 = this.n3;
    const benches = opt.benches === undefined ? 1 : opt.benches;
    const tiltAmt = opt.tilt === undefined ? 0.045 : opt.tilt;
    const dipDir = opt.dipDir === undefined ? Math.atan2(cz, cx) + 2.1 : opt.dipDir;
    const apronF = opt.apron === undefined ? 0.90 : opt.apron;
    const cliffFrac = opt.cliff === undefined
      ? Math.max(0.07, Math.min(0.26, wallFrac * 0.42)) : opt.cliff;
    const cliffShare = 0.30 + 0.34 * (1 - Math.min(1, benches * 0.3));

    const base = this.rawHeightAt(cx, cz);
    const capY = base + height;
    const rimH = height * 0.022 + 1.2;
    const R = radius * (1.45 + cliffFrac + 0.20 * benches + apronF);
    const box = this._box(cx, cz, R);
    const cdx = Math.cos(dipDir), cdz = Math.sin(dipDir);

    for (let j = box.j0; j <= box.j1; j++) {
      const z = -HALF + j * CELL;
      for (let i = box.i0; i <= box.i1; i++) {
        const x = -HALF + i * CELL;
        const dx = x - cx, dz = z - cz;
        const d = Math.hypot(dx, dz);
        if (d > R) continue;
        const ang = Math.atan2(dz, dx);
        const warp = Math.max(0.72, Math.min(1.18, 1
          + 0.26 * n.fbm2(Math.cos(ang) * 1.7 + cx * 0.004, Math.sin(ang) * 1.7 + cz * 0.004, 3)
          + 0.12 * n.fbm2(Math.cos(ang) * 4.3 + cz * 0.008, Math.sin(ang) * 4.3 - cx * 0.008, 2)
          + 0.09 * n.fbm2(x * 0.0022 + 3, z * 0.0022 - 1, 3)));
        const rr = radius * warp * 0.80;
        const s = d - rr;
        const asym = d < 1 ? 0.5 : 0.5 + 0.5 * (dx * cdx + dz * cdz) / d;
        const capTop = capY - tiltAmt * (dx * cdx + dz * cdz)
          + 1.8 * n3.fbm2(x * 0.0041 + 5, z * 0.0041 - 2, 3);

        let y;
        if (s <= 0) {
          y = capTop + rimH * Math.max(0, 1 - Math.abs(s + 0.035 * radius) / (0.075 * radius));
        } else {
          const gully = 0.5 + 0.5 * n3.fbm2(Math.cos(ang) * 7.1 + cx * 0.011,
            Math.sin(ang) * 7.1 + cz * 0.011, 3);
          const cliffW = radius * cliffFrac * (0.40 + 1.40 * asym) * (0.7 + 0.6 * gully);
          const apronW = radius * apronF * (0.50 + 1.30 * asym);
          let t = s, drop = height;
          y = capTop;

          const cd = height * cliffShare * (0.85 + 0.30 * gully);
          if (t < cliffW) {
            y -= cd * Math.pow(t / cliffW, 0.45);
            t = -1;
          } else { y -= cd; t -= cliffW; drop -= cd; }

          for (let b = 0; b < benches && t >= 0; b++) {
            const lw = radius * 0.105 * (0.55 + 0.95 * asym) * (0.65 + 0.7 * gully);
            if (t < lw) { y -= drop * 0.03 * (t / lw); t = -1; break; }
            t -= lw;
            const rd = Math.min(drop * 0.6, height * 0.135);
            const rw = radius * 0.055 * (0.7 + 0.6 * gully);
            if (t < rw) { y -= rd * Math.pow(t / rw, 0.55); t = -1; break; }
            y -= rd; t -= rw; drop -= rd;
          }

          if (t >= 0) {
            if (t > apronW) continue;
            const u = t / Math.max(1, apronW);
            const foot = Math.min(y - drop, h[j * N + i]);
            y -= (y - foot) * (1 - Math.pow(1 - u, 2.0));
            y += drop * 0.14 * Math.sin(ang * (9 + 6 * gully)) * u * (1 - u);
          }
        }

        const idx = j * N + i;
        const k = s <= 0 ? 0.94
          : 0.94 * (1 - smoothstep(0, radius * cliffFrac * 1.6, s));
        const cut = h[idx] + (y - h[idx]) * k;
        h[idx] = y > cut ? y : cut;
      }
    }
  }

  /**
   * Hogback / fin: a long narrow ridge with a steep scarp on one flank and a
   * long dip slope on the other, notched along its crest and tapered at both
   * ends.
   */
  _fin(x0: any, z0: any, x1: any, z1: any, halfW: any, height: any, opt: any = {}) {
    const h = this.h, n = this.n2, n3 = this.n3;
    const flip = opt.flip ? -1 : 1;
    const dipRun = opt.dip === undefined ? 3.2 : opt.dip;
    const ex = x1 - x0, ez = z1 - z0;
    const len = Math.hypot(ex, ez) || 1;
    const ux = ex / len, uz = ez / len;
    const R = halfW * (dipRun + 1.4);
    const box = this._box((x0 + x1) / 2, (z0 + z1) / 2, R + len * 0.5 + 20);

    for (let j = box.j0; j <= box.j1; j++) {
      const z = -HALF + j * CELL;
      for (let i = box.i0; i <= box.i1; i++) {
        const x = -HALF + i * CELL;
        const px = x - x0, pz = z - z0;
        const t = (px * ux + pz * uz) / len;
        const q = (px * -uz + pz * ux) * flip;
        const tc = t < 0 ? 0 : t > 1 ? 1 : t;
        const over = Math.hypot(px - ux * len * tc, pz - uz * len * tc);
        if (Math.abs(q) > R && over > R) continue;

        const taper = Math.pow(Math.max(0, Math.sin(Math.PI * tc)), 0.42);
        const notch = 0.52 + 0.48 * (0.5 + 0.5 * n.fbm2(t * 3.3 + x0 * 0.004, z0 * 0.004, 3));
        const spikes = 0.72 + 0.44 * Math.max(0, n3.fbm2(t * 7.7 + z0 * 0.008, x0 * 0.008, 2));
        const crest = height * taper * notch * spikes;
        if (crest < 0.6) continue;

        const wob = 1 + 0.30 * n3.fbm2(t * 5.1 + 3.7, q * 0.005, 3);
        let v;
        if (q < 0) {
          const u = Math.min(1, -q / (halfW * 0.85 * wob));
          v = crest * (1 - Math.pow(u, 0.62));
        } else {
          const u = Math.min(1, q / (halfW * dipRun * wob));
          v = crest * Math.pow(1 - u, 1.55);
        }
        if (q < 0) {
          const sk = Math.max(0, 1 - (-q - halfW * 0.85 * wob) / (halfW * 1.5));
          if (sk > 0 && sk < 1) v = Math.max(v, crest * 0.22 * sk * sk);
        }
        if (v > 0) h[j * N + i] += v;
      }
    }
  }

  _spire(cx: any, cz: any, radius: any, height: any) {
    const h = this.h, n = this.n3;
    const R = radius * 3.2;
    const box = this._box(cx, cz, R);
    for (let j = box.j0; j <= box.j1; j++) {
      const z = -HALF + j * CELL;
      for (let i = box.i0; i <= box.i1; i++) {
        const x = -HALF + i * CELL;
        const dx = x - cx, dz = z - cz;
        const ang = Math.atan2(dz, dx);
        const warp = 1 + 0.3 * n.fbm2(Math.cos(ang) * 2.3 + cx * 0.008, Math.sin(ang) * 2.3 + cz * 0.008, 3);
        const d = Math.hypot(dx, dz) / warp;
        if (d > R) continue;
        const t = Math.max(0, 1 - d / radius);
        let v = height * Math.pow(t, 1.7);
        v += height * 0.26 * Math.pow(Math.max(0, 1 - d / (radius * 2.6)), 2.2);
        h[j * N + i] += v;
      }
    }
  }

  /**
   * A gorge cut along a polyline, with terraced walls and a flat floor. The
   * cut is held back from the road corridor, so where the highway meets the
   * gorge the walls close into a narrow neck the bridge can stand on.
   */
  _canyon(f: any) {
    const h = this.h, n = this.n2;
    const halfW = f.halfW, depth = f.depth;
    const R = halfW * 3.2;
    const spine = [];
    const pts = f.pts;
    for (let s = 0; s < pts.length - 1; s++) {
      const a = pts[s], b = pts[s + 1];
      const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steps = Math.max(2, Math.ceil(segLen / 24));
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        spine.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    spine.push(pts[pts.length - 1]);

    // one min-distance field over the polyline's bounding box, so overlapping
    // segments cannot stack their cuts
    let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
    for (const q of spine) {
      if (q[0] < bx0) bx0 = q[0];
      if (q[0] > bx1) bx1 = q[0];
      if (q[1] < bz0) bz0 = q[1];
      if (q[1] > bz1) bz1 = q[1];
    }
    const box = {
      i0: Math.max(0, Math.floor((bx0 - R + HALF) / CELL)),
      i1: Math.min(N - 1, Math.ceil((bx1 + R + HALF) / CELL)),
      j0: Math.max(0, Math.floor((bz0 - R + HALF) / CELL)),
      j1: Math.min(N - 1, Math.ceil((bz1 + R + HALF) / CELL)),
    };
    const bw = box.i1 - box.i0 + 1, bh = box.j1 - box.j0 + 1;
    const dist = new Float32Array(bw * bh).fill(1e9);
    for (let s = 0; s < spine.length - 1; s++) {
      const a = spine[s], b = spine[s + 1];
      const ex = b[0] - a[0], ez = b[1] - a[1];
      const len2 = ex * ex + ez * ez || 1;
      const si0 = Math.max(box.i0, Math.floor((Math.min(a[0], b[0]) - R + HALF) / CELL));
      const si1 = Math.min(box.i1, Math.ceil((Math.max(a[0], b[0]) + R + HALF) / CELL));
      const sj0 = Math.max(box.j0, Math.floor((Math.min(a[1], b[1]) - R + HALF) / CELL));
      const sj1 = Math.min(box.j1, Math.ceil((Math.max(a[1], b[1]) + R + HALF) / CELL));
      for (let j = sj0; j <= sj1; j++) {
        const z = -HALF + j * CELL;
        for (let i = si0; i <= si1; i++) {
          const x = -HALF + i * CELL;
          let t = ((x - a[0]) * ex + (z - a[1]) * ez) / len2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const d = Math.hypot(a[0] + ex * t - x, a[1] + ez * t - z);
          const k = (j - box.j0) * bw + (i - box.i0);
          if (d < dist[k]) dist[k] = d;
        }
      }
    }

    for (let j = box.j0; j <= box.j1; j++) {
      const z = -HALF + j * CELL;
      for (let i = box.i0; i <= box.i1; i++) {
        const d0 = dist[(j - box.j0) * bw + (i - box.i0)];
        if (d0 > R) continue;
        const x = -HALF + i * CELL;
        const d = d0 + 34 * n.fbm2(x * 0.0013 + 1.7, z * 0.0013 - 3.3, 3)
          + 10 * n.simplex2(x * 0.0052, z * 0.0052);
        const u = Math.max(0, Math.min(1, d / halfW));
        const wall = u < 1 ? 1 - Math.pow(u, 2.4) : 0;
        const stepped = Math.round(wall * 5) / 5 * 0.5 + wall * 0.5;
        const rim = 9 * Math.max(0, 1 - Math.abs(d - halfW * 1.3) / 78);
        // the bridge neck: the gorge shallows where a road crosses it
        const guard = smoothstep(14, 78, this.corridorAt(x, z));
        const idx = j * N + i;
        // A gorge is dry: never cut below the water plane, or `Water` finds a
        // basin in it and spends one of its four bodies on a flooded canyon
        // that the sea should have had.
        h[idx] = Math.max(SEA + 10, h[idx] - depth * stepped * guard + rim);
      }
    }
  }

  _box(cx: any, cz: any, R: any) {
    return {
      i0: Math.max(0, Math.floor((cx - R + HALF) / CELL)),
      i1: Math.min(N - 1, Math.ceil((cx + R + HALF) / CELL)),
      j0: Math.max(0, Math.floor((cz - R + HALF) / CELL)),
      j1: Math.min(N - 1, Math.ceil((cz + R + HALF) / CELL)),
    };
  }

  // ----------------------------------------------------------- settlements

  /**
   * Level pads under everything that is built. A town needs somewhere flat to
   * stand and the road has to arrive at grade; this runs after erosion and
   * before the road carve so the two agree.
   */
  _settlementPads() {
    const h = this.h;
    const PAD = {
      town: 190, outpost: 120, reststop: 100, chocobo: 130,
      imperial: 110, parking: 42, haven: 26,
    };
    for (const p of this.map.pois) {
      const rad = PAD[p.type as keyof typeof PAD];
      if (!rad) continue;
      // median-ish target: average the ground over a ring so a pad on a slope
      // cuts as much as it fills
      let sum = 0, cnt = 0;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        sum += this.rawHeightAt(p.x + Math.cos(a) * rad * 0.7, p.z + Math.sin(a) * rad * 0.7);
        cnt++;
      }
      const target = (sum / cnt) * 0.65 + this.rawHeightAt(p.x, p.z) * 0.35;
      const R = rad * 1.9;
      const box = this._box(p.x, p.z, R);
      for (let j = box.j0; j <= box.j1; j++) {
        const z = -HALF + j * CELL;
        for (let i = box.i0; i <= box.i1; i++) {
          const x = -HALF + i * CELL;
          const d = Math.hypot(x - p.x, z - p.z);
          if (d > R) continue;
          const k = 1 - smoothstep(rad * 0.55, R, d);
          if (k < 0.002) continue;
          const idx = j * N + i;
          h[idx] += (target - h[idx]) * k * 0.94;
        }
      }
    }
  }

  // --------------------------------------------------------------- stitching

  /** Blend the near grid into the far grid so the domain edge is invisible. */
  _stitchFar() {
    const h = this.h;
    for (let j = 0; j < N; j++) {
      const z = -HALF + j * CELL;
      for (let i = 0; i < N; i++) {
        const x = -HALF + i * CELL;
        const q = Math.max(Math.abs(x), Math.abs(z));
        if (q < BLEND_IN) continue;
        const w = smoothstep(BLEND_IN, BLEND_OUT, q);
        const f = this.sampleFar(x, z);
        const idx = j * N + i;
        h[idx] = h[idx] + (f - h[idx]) * w;
      }
    }
  }

  // ----------------------------------------------------------------- erosion

  /** Droplet hydraulic erosion: carves drainage networks and deposits fans. */
  _erode() {
    const h = this.h, flow = this.flow, sed = this.sed;
    const rng = new Rng(778899);
    const DROPS = 620000, STEPS = 44;
    const inertia = 0.055, capacityF = 5.2, minSlope = 0.012;
    const erodeSpeed = 0.34, depositSpeed = 0.28, evaporate = 0.017, gravity = 5.0;

    const br = 2;
    const bo = [], bw = [];
    let bsum = 0;
    for (let dy = -br; dy <= br; dy++) {
      for (let dx = -br; dx <= br; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > br) continue;
        const w = 1 - d / (br + 0.5);
        bo.push(dy * N + dx); bw.push(w); bsum += w;
      }
    }
    for (let k = 0; k < bw.length; k++) bw[k] /= bsum;

    const lo = 8, hi = N - 9;
    for (let d = 0; d < DROPS; d++) {
      let px = rng.range(lo, hi), pz = rng.range(lo, hi);
      let dx = 0, dz = 0, speed = 1, water = 1, carried = 0;

      for (let s = 0; s < STEPS; s++) {
        const ix = px | 0, iz = pz | 0;
        if (ix < br + 1 || iz < br + 1 || ix >= N - br - 2 || iz >= N - br - 2) break;
        const fx = px - ix, fz = pz - iz;
        const idx = iz * N + ix;
        const h00 = h[idx], h10 = h[idx + 1], h01 = h[idx + N], h11 = h[idx + N + 1];
        const gx = (h10 - h00) * (1 - fz) + (h11 - h01) * fz;
        const gz = (h01 - h00) * (1 - fx) + (h11 - h10) * fx;
        const hOld = (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;

        dx = dx * inertia - gx * (1 - inertia);
        dz = dz * inertia - gz * (1 - inertia);
        const dl = Math.hypot(dx, dz);
        if (dl < 1e-6) break;
        dx /= dl; dz /= dl;
        px += dx; pz += dz;

        const nx = px | 0, nz = pz | 0;
        if (nx < br + 1 || nz < br + 1 || nx >= N - br - 2 || nz >= N - br - 2) break;
        const nfx = px - nx, nfz = pz - nz;
        const nidx = nz * N + nx;
        const n00 = h[nidx], n10 = h[nidx + 1], n01 = h[nidx + N], n11 = h[nidx + N + 1];
        const hNew = (n00 * (1 - nfx) + n10 * nfx) * (1 - nfz) + (n01 * (1 - nfx) + n11 * nfx) * nfz;
        const dh = hNew - hOld;

        flow![idx] += water;
        const cap = Math.max(-dh, minSlope) * speed * water * capacityF;

        if (carried > cap || dh > 0) {
          const amount = dh > 0 ? Math.min(dh, carried) : (carried - cap) * depositSpeed;
          carried -= amount;
          h[idx] += amount * (1 - fx) * (1 - fz);
          h[idx + 1] += amount * fx * (1 - fz);
          h[idx + N] += amount * (1 - fx) * fz;
          h[idx + N + 1] += amount * fx * fz;
          sed![idx] += amount;
        } else {
          const amount = Math.min((cap - carried) * erodeSpeed, -dh);
          for (let k = 0; k < bo.length; k++) {
            h[idx + bo[k]] -= amount * bw[k];
          }
          carried += amount;
        }

        speed = Math.sqrt(Math.max(0, speed * speed - dh * gravity));
        water *= (1 - evaporate);
        if (water < 0.02) break;
      }
    }

    const tmp = new Float32Array(h.length);
    tmp.set(h);
    for (let j = 1; j < N - 1; j++) {
      for (let i = 1; i < N - 1; i++) {
        const idx = j * N + i;
        const avg = (tmp[idx - 1] + tmp[idx + 1] + tmp[idx - N] + tmp[idx + N]) * 0.25;
        h[idx] = tmp[idx] * 0.72 + avg * 0.28;
      }
    }
  }

  /**
   * Thermal / talus relaxation: scree cones under cliffs, no impossible spikes.
   * The repose angle is not uniform — competent rock stands far steeper than
   * the loose material that falls off it, so the limit opens out with altitude.
   */
  _talus() {
    const h = this.h;
    for (let pass = 0; pass < 5; pass++) {
      for (let j = 1; j < N - 1; j++) {
        for (let i = 1; i < N - 1; i++) {
          const idx = j * N + i;
          const c = h[idx];
          // 3.6 m/cell = 42 deg on the flats, 11 m/cell = 70 deg on the walls
          const maxDelta = 3.6 + 7.4 * smoothstep(16, 62, c);
          let move = 0;
          for (let k = 0; k < 4; k++) {
            const t = k === 0 ? idx - 1 : k === 1 ? idx + 1 : k === 2 ? idx - N : idx + N;
            const d = c - h[t];
            if (d > maxDelta) {
              const amt = (d - maxDelta) * 0.22;
              h[t] += amt; move += amt;
            }
          }
          h[idx] = c - move;
        }
      }
    }
  }

  // ------------------------------------------------------------------ derive

  /** Normals, slope, curvature and material control channels. */
  _derive() {
    const h = this.h;
    this.nrm = new Uint16Array(N * N * 2);
    this.ctrl = new Uint8Array(N * N * 4);
    const toHalf = THREE.DataUtils.toHalfFloat;
    const n2 = this.n2, n3 = this.n3;

    let flowMax = 0;
    const flow = this.flow, sed = this.sed;
    for (let k = 0; k < flow!.length; k++) if (flow![k] > flowMax) flowMax = flow![k];
    const flowScale = 1 / Math.log(1 + flowMax * 0.35 + 1e-6);
    let sedMax = 1e-6;
    for (let k = 0; k < sed!.length; k++) if (sed![k] > sedMax) sedMax = sed![k];

    const at = (i: any, j: any) => {
      const ii = i < 0 ? 0 : i > N - 1 ? N - 1 : i;
      const jj = j < 0 ? 0 : j > N - 1 ? N - 1 : j;
      return h[jj * N + ii];
    };

    const fb = new Float32Array(flow!.length);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const idx = j * N + i;
        const a = flow![idx];
        const l = flow![j * N + Math.max(0, i - 1)], r = flow![j * N + Math.min(N - 1, i + 1)];
        const u = flow![Math.max(0, j - 1) * N + i], d = flow![Math.min(N - 1, j + 1) * N + i];
        fb[idx] = a * 0.44 + (l + r + u + d) * 0.14;
      }
    }

    for (let j = 0; j < N; j++) {
      const z = -HALF + j * CELL;
      for (let i = 0; i < N; i++) {
        const idx = j * N + i;
        const x = -HALF + i * CELL;
        const hl = at(i - 1, j), hr = at(i + 1, j);
        const hd = at(i, j - 1), hu = at(i, j + 1);
        const c = h[idx];
        let nx = (hl - hr) / (2 * CELL);
        let nz = (hd - hu) / (2 * CELL);
        const inv = 1 / Math.sqrt(nx * nx + nz * nz + 1);
        nx *= inv; nz *= inv;
        this.nrm[idx * 2] = toHalf(nx);
        this.nrm[idx * 2 + 1] = toHalf(nz);

        const slope = Math.min(1, Math.hypot((hl - hr) / (2 * CELL), (hd - hu) / (2 * CELL)));
        const curv = (hl + hr + hd + hu) * 0.25 - c;

        const fl = Math.min(1, Math.log(1 + fb[idx] * 0.35) * flowScale);
        const sd = Math.min(1, Math.pow(sed![idx] / sedMax, 0.32));

        let rocky = smoothstep(0.35, 0.95, slope) * 0.85;
        rocky += Math.max(0, -curv) * 0.5;
        rocky += 0.28 * Math.max(0, n2.fbm2(x * 0.0012 + 17, z * 0.0012 - 8, 3));
        rocky += 0.35 * smoothstep(70, 175, c);
        rocky = Math.max(0, Math.min(1, rocky - 0.12 * fl));

        const o = idx * 4;
        const rm = this.roadMask![idx];
        this.ctrl[o] = rm > 0.02
          ? (Math.max(0, Math.min(1, this.roadLat![idx])) * 255) | 0
          : (Math.max(0, Math.min(1, fl)) * 255) | 0;
        this.ctrl[o + 1] = (Math.max(0, Math.min(1, sd * (1 - slope * 0.8))) * 255) | 0;
        this.ctrl[o + 2] = (Math.max(0, Math.min(1, rm)) * 255) | 0;
        this.ctrl[o + 3] = (rocky * 255) | 0;
      }
    }

    this.farNrm = new Uint16Array(FAR_N * FAR_N * 2);
    this.farCtrl = new Uint8Array(FAR_N * FAR_N * 4);
    for (let j = 0; j < FAR_N; j++) {
      const z = -FAR_HALF + j * FAR_CELL;
      for (let i = 0; i < FAR_N; i++) {
        const idx = j * FAR_N + i;
        const x = -FAR_HALF + i * FAR_CELL;
        const hl = this._farAt(i - 1, j), hr = this._farAt(i + 1, j);
        const hd = this._farAt(i, j - 1), hu = this._farAt(i, j + 1);
        let nx = (hl - hr) / (2 * FAR_CELL);
        let nz = (hd - hu) / (2 * FAR_CELL);
        const inv = 1 / Math.sqrt(nx * nx + nz * nz + 1);
        nx *= inv; nz *= inv;
        this.farNrm[idx * 2] = toHalf(nx);
        this.farNrm[idx * 2 + 1] = toHalf(nz);
        const slope = Math.min(1, Math.hypot((hl - hr) / (2 * FAR_CELL), (hd - hu) / (2 * FAR_CELL)));
        const rocky = Math.max(0, Math.min(1,
          smoothstep(0.30, 0.85, slope) + 0.4 * smoothstep(110, 300, this.far[idx]) +
          0.22 * n3.fbm2(x * 0.00034, z * 0.00034, 3)));
        const o = idx * 4;
        this.farCtrl[o] = 0;
        this.farCtrl[o + 1] = ((1 - rocky) * 190) | 0;
        this.farCtrl[o + 2] = 0;
        this.farCtrl[o + 3] = (rocky * 255) | 0;
      }
    }

    this.flow = null; this.sed = null; this._coarse = null;
    this.roadLat = null; this.roadMask = null; this.slope0 = null;
  }

  // -------------------------------------------------------------- public API

  /** Bilinear sample of the near grid (no far-field switch, no micro relief). */
  rawHeightAt(x: any, z: any) {
    const fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
    let i0 = Math.floor(fx), j0 = Math.floor(fz);
    const tx = fx - i0, tz = fz - j0;
    if (i0 < 0) i0 = 0; else if (i0 > N - 2) i0 = N - 2;
    if (j0 < 0) j0 = 0; else if (j0 > N - 2) j0 = N - 2;
    const h = this.h, b = j0 * N + i0;
    const a0 = h[b], a1 = h[b + 1], a2 = h[b + N], a3 = h[b + N + 1];
    return (a0 + (a1 - a0) * tx) * (1 - tz) + (a2 + (a3 - a2) * tx) * tz;
  }

  sampleFar(x: any, z: any) {
    const fx = (x + FAR_HALF) / FAR_CELL, fz = (z + FAR_HALF) / FAR_CELL;
    let i0 = Math.floor(fx), j0 = Math.floor(fz);
    const tx = fx - i0, tz = fz - j0;
    if (i0 < 0) i0 = 0; else if (i0 > FAR_N - 2) i0 = FAR_N - 2;
    if (j0 < 0) j0 = 0; else if (j0 > FAR_N - 2) j0 = FAR_N - 2;
    const f = this.far, b = j0 * FAR_N + i0;
    const a0 = f[b], a1 = f[b + 1], a2 = f[b + FAR_N], a3 = f[b + FAR_N + 1];
    return (a0 + (a1 - a0) * tx) * (1 - tz) + (a2 + (a3 - a2) * tx) * tz;
  }

  /** Exactly what the GPU draws: grid + analytic micro-relief. */
  heightAt(x: any, z: any) {
    const q = Math.abs(x) > Math.abs(z) ? Math.abs(x) : Math.abs(z);
    const base = q >= BLEND_OUT ? this.sampleFar(x, z) : this.rawHeightAt(x, z);
    return base + microDetail(x, z);
  }

  /** Bilinear control sample: { flow, sediment, road, rocky }. */
  ctrlAt(x: any, z: any, out: any = {}) {
    const q = Math.abs(x) > Math.abs(z) ? Math.abs(x) : Math.abs(z);
    const arr = q >= BLEND_OUT ? this.farCtrl : this.ctrl;
    const n = q >= BLEND_OUT ? FAR_N : N;
    const half = q >= BLEND_OUT ? FAR_HALF : HALF;
    const cell = q >= BLEND_OUT ? FAR_CELL : CELL;
    let i = Math.round((x + half) / cell), j = Math.round((z + half) / cell);
    i = i < 0 ? 0 : i > n - 1 ? n - 1 : i;
    j = j < 0 ? 0 : j > n - 1 ? n - 1 : j;
    const o = (j * n + i) * 4;
    out.flow = arr[o] / 255;
    out.sediment = arr[o + 1] / 255;
    out.road = arr[o + 2] / 255;
    out.rocky = arr[o + 3] / 255;
    return out;
  }
}

function smoothstep(a: any, b: any, x: any) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function clamp01(x: any) { return x < 0 ? 0 : x > 1 ? 1 : x; }

/**
 * The exact JS twin of `tf_snoise` in TerrainMaterial.js (Ashima simplex).
 * `Terrain.sampleMaterial()` and `microDetail()` have to agree with the pixels
 * the shader draws, so the CPU cannot use a differently-seeded noise here.
 * @returns roughly -1..1
 */
export function gnoise2(xin: any, yin: any): number {
  const C0 = 0.211324865405187, C1 = 0.366025403784439;
  const C2 = -0.577350269189626, C3 = 0.024390243902439;
  const s = (xin + yin) * C1;
  let ix = Math.floor(xin + s), iy = Math.floor(yin + s);
  const t0 = (ix + iy) * C0;
  const x0 = xin - ix + t0, y0 = yin - iy + t0;
  const i1x = x0 > y0 ? 1 : 0, i1y = x0 > y0 ? 0 : 1;
  const x1 = x0 + C0 - i1x, y1 = y0 + C0 - i1y;
  const x2 = x0 + C2, y2 = y0 + C2;
  ix = mod289(ix); iy = mod289(iy);

  const p0 = perm(perm(iy) + ix);
  const p1 = perm(perm(iy + i1y) + ix + i1x);
  const p2 = perm(perm(iy + 1) + ix + 1);

  let g = 0;
  g += grad(p0, x0, y0, C3);
  g += grad(p1, x1, y1, C3);
  g += grad(p2, x2, y2, C3);
  return 130 * g;
}

function mod289(x: any) { return x - Math.floor(x / 289) * 289; }
function perm(x: any) { return mod289(((x * 34) + 1) * x); }
function grad(p: any, x: any, y: any, C3: any) {
  let m = Math.max(0.5 - (x * x + y * y), 0);
  m *= m; m *= m;
  const v = 2 * fract(p * C3) - 1;
  const h = Math.abs(v) - 0.5;
  const a0 = v - Math.floor(v + 0.5);
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  return m * (a0 * x + h * y);
}
function fract(v: any) { return v - Math.floor(v); }
