/**
 * A driving-oriented view of the carved highway spline.
 *
 * `Terrain.road` knows how to answer "how far is this point from the road",
 * which is all the scatterers need. Driving needs more: where you are *along*
 * the road, which side of it you are on, which way it is pointing, and how
 * hard it bends a hundred metres ahead so the driver can lift off in time.
 *
 * This wraps the spline read-only (it never mutates Terrain) and adds a coarse
 * spatial hash so `nearest()` is a handful of squared-distance tests rather
 * than a walk of ~1400 points. Every query writes into a caller-owned result
 * object so the hot path allocates nothing.
 */

const CELL = 48;

/** @typedef {{i:number, s:number, lat:number, dist:number,
 *             x:number, y:number, z:number, tx:number, tz:number}} RoadHit */

export class RoadPath {
  /** @param {{points:Array, length:number, width:number, shoulder:number}} road */
  constructor(road) {
    this.road = road;
    this.pts = road && road.points ? road.points : [];
    this.length = road ? road.length : 0;
    /** Half-width of the sealed driving surface. */
    this.width = road ? road.width : 4.6;
    /** Half-width of the disturbed shoulder beyond it. */
    this.shoulder = road ? road.shoulder : 8.0;
    this._grid = new Map();
    this._build();
    this._hit = this.makeHit();
    this._lastI = 0;
  }

  /** A reusable result record for `nearest`. @returns {RoadHit} */
  makeHit() {
    return { i: 0, s: 0, lat: 0, dist: 0, x: 0, y: 0, z: 0, tx: 0, tz: 1 };
  }

  _build() {
    for (let i = 0; i < this.pts.length; i++) {
      const p = this.pts[i];
      const key = this._key(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
      let a = this._grid.get(key);
      if (!a) { a = []; this._grid.set(key, a); }
      a.push(i);
    }
  }

  _key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }

  /**
   * Closest point on the centreline, with signed lateral offset.
   *
   * `lat` is positive to the driver's left of the direction of travel (the
   * spline tangent), which is what the rail force and the shoulder rumble both
   * key off. Starts from the previously returned index, so a car that moves a
   * metre a frame usually resolves in the first local scan.
   *
   * @param {number} x
   * @param {number} z
   * @param {RoadHit} [out]
   * @returns {RoadHit}
   */
  nearest(x, z, out = this._hit) {
    const pts = this.pts;
    if (pts.length < 2) { out.dist = 1e5; out.lat = 1e5; return out; }

    // local scan around the cached index first — coherent motion hits here
    let best = Infinity, bi = -1;
    const lo = Math.max(0, this._lastI - 12), hi = Math.min(pts.length - 1, this._lastI + 12);
    for (let i = lo; i <= hi; i++) {
      const p = pts[i];
      const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      if (d < best) { best = d; bi = i; }
    }
    // if the local scan did not land comfortably inside its window, go wide
    if (bi < 0 || bi === lo || bi === hi || best > CELL * CELL) {
      const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
      for (let ring = 0; ring <= 5; ring++) {
        for (let dz = -ring; dz <= ring; dz++) {
          for (let dx = -ring; dx <= ring; dx++) {
            if (ring > 0 && Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
            const arr = this._grid.get(this._key(cx + dx, cz + dz));
            if (!arr) continue;
            for (let k = 0; k < arr.length; k++) {
              const p = pts[arr[k]];
              const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
              if (d < best) { best = d; bi = arr[k]; }
            }
          }
        }
        if (bi >= 0 && Math.sqrt(best) < CELL * ring) break;
      }
    }
    if (bi < 0) { out.dist = 1e5; out.lat = 1e5; return out; }
    this._lastI = bi;

    // refine against the two adjacent segments so `s` is continuous
    let bs = 0, bx = 0, bz = 0, by = 0, btx = 0, btz = 1, bd = Infinity;
    for (let k = -1; k <= 0; k++) {
      const ia = Math.max(0, Math.min(pts.length - 2, bi + k));
      const a = pts[ia], b = pts[ia + 1];
      const ex = b.x - a.x, ez = b.z - a.z;
      const len2 = ex * ex + ez * ez || 1;
      let t = ((x - a.x) * ex + (z - a.z) * ez) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = a.x + ex * t, pz = a.z + ez * t;
      const d = Math.hypot(px - x, pz - z);
      if (d < bd) {
        bd = d; bx = px; bz = pz;
        by = a.y + (b.y - a.y) * t;
        bs = a.s + (b.s - a.s) * t;
        btx = a.tx + (b.tx - a.tx) * t;
        btz = a.tz + (b.tz - a.tz) * t;
        const tl = Math.hypot(btx, btz) || 1;
        btx /= tl; btz /= tl;
      }
    }
    out.i = bi; out.s = bs; out.dist = bd;
    out.x = bx; out.y = by; out.z = bz; out.tx = btx; out.tz = btz;
    // signed side: cross(tangent, toPoint).y
    out.lat = btx * (z - bz) - btz * (x - bx);
    return out;
  }

  /**
   * Centreline point at arc-length `s`, clamped to the ends.
   * @param {number} s metres
   * @param {{x:number,y:number,z:number,tx:number,tz:number}} out
   */
  at(s, out) {
    const pts = this.pts;
    if (!pts.length) { out.x = 0; out.y = 0; out.z = 0; out.tx = 0; out.tz = 1; return out; }
    const t = Math.max(0, Math.min(this.length, s));
    let lo = 0, hi = pts.length - 1;
    while (lo < hi - 1) { const m = (lo + hi) >> 1; if (pts[m].s <= t) lo = m; else hi = m; }
    const a = pts[lo], b = pts[hi];
    const f = (t - a.s) / Math.max(0.001, b.s - a.s);
    out.x = a.x + (b.x - a.x) * f;
    out.y = a.y + (b.y - a.y) * f;
    out.z = a.z + (b.z - a.z) * f;
    out.tx = a.tx + (b.tx - a.tx) * f;
    out.tz = a.tz + (b.tz - a.tz) * f;
    const l = Math.hypot(out.tx, out.tz) || 1;
    out.tx /= l; out.tz /= l;
    return out;
  }

  /**
   * Worst |curvature| (1/m) over the next `ahead` metres from `s`, sampled
   * every ~12 m. Used by the auto-driver to pick a corner entry speed.
   * @param {number} s
   * @param {number} ahead metres to look
   * @returns {number} 1/radius, 0 on a straight
   */
  curvature(s, ahead = 90) {
    const pts = this.pts;
    if (pts.length < 5) return 0;
    let worst = 0;
    const step = 12;
    for (let d = step; d <= ahead; d += step) {
      const k = this._curvatureAt(s + d, step);
      if (k > worst) worst = k;
    }
    return worst;
  }

  _curvatureAt(s, h) {
    const a = this._t0 || (this._t0 = { x: 0, y: 0, z: 0, tx: 0, tz: 1 });
    const b = this._t1 || (this._t1 = { x: 0, y: 0, z: 0, tx: 0, tz: 1 });
    this.at(s - h, a);
    this.at(s + h, b);
    // angle between tangents over the arc length between them
    let dot = a.tx * b.tx + a.tz * b.tz;
    dot = dot > 1 ? 1 : dot < -1 ? -1 : dot;
    return Math.acos(dot) / (2 * h);
  }

  /**
   * Signed heading of the centreline at arc-length `s`, in the same convention
   * the rest of the game uses (atan2(dx, dz)).
   * @param {number} s
   */
  headingAt(s) {
    const p = this._h || (this._h = { x: 0, y: 0, z: 0, tx: 0, tz: 1 });
    this.at(s, p);
    return Math.atan2(p.tx, p.tz);
  }
}
