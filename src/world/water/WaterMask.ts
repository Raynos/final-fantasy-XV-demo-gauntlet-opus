import type * as THREE from 'three';

/**
 * WHERE THE WATER SURFACE IS, per point, for everything that is rooted in the
 * ground — plants, boulders, forage.
 *
 * `Tarns.ts` opens with the reason this file exists: the world used to have one
 * water level, `Water.level` at −6.5 m, and every system that wanted to know
 * "is this wet?" compared a ground height against it. That is right for a sea
 * and wrong for everything else, and it had already produced the same bug in
 * `Water.ts`, `Fishing.ts` and `Chart.ts` before it produced this one —
 * **shrubs, grass and trees growing straight up through the rivers and the
 * tarns**, because `Ecology.waterDepth` was `WORLD.seaLevel - height` and a
 * river at +180 m is not within two hundred metres of the sea plane.
 *
 * ### It is derived from what is drawn, not re-derived beside it
 *
 * The obvious implementation is a second copy of the channel arithmetic: trace
 * the reaches, size them from discharge, work out the waterlines, and test a
 * point against that. That is a fourth copy of the predicate `Tarns.ts` exists
 * to have exactly one of, and it goes stale the first time somebody changes how
 * a reach is sized — which, while this was being written, somebody was doing.
 *
 * So the mask reads the **built river sheet itself**: the triangles `River.ts`
 * emitted, indexed into a uniform grid, queried by barycentric interpolation of
 * their own vertex heights. Three properties fall out of that and none of them
 * are available to a re-derivation:
 *
 * - **The rim ramp is free.** `emitWater` ramps the outer 38% of the sheet down
 *   onto the bed so the waterline's alpha goes to zero, which means the drawn
 *   surface at the rim *is* the ground and the depth there *is* zero. A mask
 *   built on `wsl` would strip a bald ring along every bank, out to the p50
 *   0.50 m of edge depth the discharge cap leaves under the rim, in a band
 *   where the water is drawn transparent. This one cannot, by construction.
 * - **The plan is the plan.** No assumption that a reach is straight, that a
 *   tarn is a circle (its bowl radius is warped per azimuth, so it is not), or
 *   that either is convex.
 * - **It cannot disagree with the frame.** If the sheet moves, the mask moves.
 *
 * Standing water comes from `Water.bodies` for the same reason: that array is
 * what `_makeSurface` drew a quad for, at the level `_findTarns` measured.
 */

/** Grid pitch, metres. A water triangle is at most ~6.4 x 3 m, so this holds a few. */
const CELL = 8;
/** Half-span of the hash in cells. 8 m x 4096 is 32 km each way — the world is 8. */
const SPAN = 1 << 12;

/** One body of standing water, as `Water.bodies` has it. */
export interface MaskBasin { cx: number, cz: number, w: number, d: number, level: number }

/**
 * The water surface over a point, or `-Infinity` where there is none.
 *
 * Built once per world and read per plant, so the query is one hash lookup and
 * a handful of point-in-triangle tests; the build is one pass over the sheet.
 */
export class WaterMask {
  /** Flat basin bounds, four per body: minX, maxX, minZ, maxZ. */
  _bb: Float64Array;
  /** Level per body, same order. */
  _bl: Float64Array;
  /** Sheet vertices, three floats each, in the sheet's own order. */
  _pos: Float32Array | null;
  /** Sheet triangles, three vertex indices each. */
  _tri: Int32Array | null;
  /** Cell key -> triangle indices in that cell. */
  _grid: Map<number, number[]>;
  /** What the build cost and covered, for the probes. */
  stats: { bodies: number, tris: number, cells: number, ms: number };

  /**
   * @param bodies standing water — `Water.bodies`, bbox and measured level
   * @param sheet the river water mesh's geometry, or null if nothing traced
   */
  constructor(bodies: MaskBasin[], sheet: THREE.BufferGeometry | null) {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    this._bb = new Float64Array(bodies.length * 4);
    this._bl = new Float64Array(bodies.length);
    for (let i = 0; i < bodies.length; i++) {
      const b = bodies[i];
      this._bb[i * 4] = b.cx - b.w * 0.5; this._bb[i * 4 + 1] = b.cx + b.w * 0.5;
      this._bb[i * 4 + 2] = b.cz - b.d * 0.5; this._bb[i * 4 + 3] = b.cz + b.d * 0.5;
      this._bl[i] = b.level;
    }
    this._pos = null; this._tri = null;
    this._grid = new Map();
    let tris = 0;
    const posAttr = sheet ? sheet.getAttribute('position') : null;
    const idx = sheet ? sheet.getIndex() : null;
    if (posAttr && idx) {
      this._pos = posAttr.array as Float32Array;
      this._tri = Int32Array.from(idx.array as ArrayLike<number>);
      tris = this._tri.length / 3;
      for (let t = 0; t < tris; t++) this._index(t);
    }
    this.stats = {
      bodies: bodies.length, tris, cells: this._grid.size,
      ms: Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0),
    };
  }

  /** Put triangle `t` in every cell its xz bounding box touches. */
  _index(t: number) {
    const p = this._pos!, v = this._tri!;
    const a = v[t * 3] * 3, b = v[t * 3 + 1] * 3, c = v[t * 3 + 2] * 3;
    const i0 = Math.floor(Math.min(p[a], p[b], p[c]) / CELL);
    const i1 = Math.floor(Math.max(p[a], p[b], p[c]) / CELL);
    const j0 = Math.floor(Math.min(p[a + 2], p[b + 2], p[c + 2]) / CELL);
    const j1 = Math.floor(Math.max(p[a + 2], p[b + 2], p[c + 2]) / CELL);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = (j + SPAN) * (SPAN * 2) + (i + SPAN);
        const cell = this._grid.get(k);
        if (cell) cell.push(t); else this._grid.set(k, [t]);
      }
    }
  }

  /**
   * The drawn river surface over this point, or `-Infinity` off the sheet.
   *
   * The sheet folds over itself where a reach braids or doubles back, so this
   * takes the **highest** surface it finds rather than the first: a plant under
   * the lower of two stacked panels is still under water.
   */
  sheetAt(x: number, z: number): number {
    const p = this._pos, v = this._tri;
    if (!p || !v) return -Infinity;
    const k = (Math.floor(z / CELL) + SPAN) * (SPAN * 2) + (Math.floor(x / CELL) + SPAN);
    const cell = this._grid.get(k);
    if (!cell) return -Infinity;
    let best = -Infinity;
    for (let n = 0; n < cell.length; n++) {
      const t = cell[n];
      const a = v[t * 3] * 3, b = v[t * 3 + 1] * 3, c = v[t * 3 + 2] * 3;
      const ax = p[a], az = p[a + 2];
      const v0x = p[b] - ax, v0z = p[b + 2] - az;
      const v1x = p[c] - ax, v1z = p[c + 2] - az;
      const den = v0x * v1z - v1x * v0z;
      if (den === 0) continue;
      const px = x - ax, pz = z - az;
      const s = (px * v1z - v1x * pz) / den;
      if (s < 0 || s > 1) continue;
      const u = (v0x * pz - px * v0z) / den;
      if (u < 0 || s + u > 1) continue;
      const y = p[a + 1] + (p[b + 1] - p[a + 1]) * s + (p[c + 1] - p[a + 1]) * u;
      if (y > best) best = y;
    }
    return best;
  }

  /**
   * The water surface over this point, or `-Infinity` on ground that no body
   * and no river covers. Callers floor it at the sea plane themselves — this
   * deals only in the water it can actually name.
   */
  levelAt(x: number, z: number): number {
    let best = -Infinity;
    const bb = this._bb, bl = this._bl;
    for (let i = 0; i < bl.length; i++) {
      const o = i * 4;
      if (x < bb[o] || x > bb[o + 1] || z < bb[o + 2] || z > bb[o + 3]) continue;
      if (bl[i] > best) best = bl[i];
    }
    const s = this.sheetAt(x, z);
    return s > best ? s : best;
  }
}
