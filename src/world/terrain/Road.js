import { Noise } from '../../util/Noise.js';

/**
 * The dirt highway that threads the Leide basin. Owns its own spline, carves a
 * flattened profile with wheel ruts into the heightfield, and exposes a cheap
 * point/segment distance query so props, vegetation and characters can align to
 * it.
 */
export class Road {
  constructor() {
    /** Control points in world XZ. The route sweeps SW -> NE past the spawn. */
    this.ctrl = [
      [-1340, 470], [-1050, 355], [-800, 252], [-520, 158], [-262, 86],
      [-30, 28], [250, -22], [520, -96], [790, -232], [1040, -430],
      [1250, -690], [1380, -930],
    ];
    /** Half-width of the packed driving surface, metres. */
    this.width = 4.6;
    /** Half-width of the disturbed shoulder beyond the surface. */
    this.shoulder = 8.0;
    this.step = 3.0;
    this.points = [];      // [{ x, z, y, s, tx, tz }]
    this.length = 0;
    this._noise = new Noise(551133);
    this._cell = 64;
    this._grid = null;
  }

  /** Catmull-Rom through the control points, resampled at ~`step` metres. */
  _sampleSpline() {
    const c = this.ctrl;
    const raw = [];
    for (let i = 0; i < c.length - 1; i++) {
      const p0 = c[Math.max(0, i - 1)], p1 = c[i], p2 = c[i + 1], p3 = c[Math.min(c.length - 1, i + 2)];
      const seg = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const n = Math.max(2, Math.ceil(seg / this.step));
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t +
          (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
          (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
        const z = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t +
          (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
          (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
        raw.push({ x, z, y: 0, s: 0, tx: 0, tz: 1 });
      }
    }
    raw.push({ x: c[c.length - 1][0], z: c[c.length - 1][1], y: 0, s: 0, tx: 0, tz: 1 });

    let s = 0;
    for (let i = 0; i < raw.length; i++) {
      if (i > 0) s += Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z);
      raw[i].s = s;
      const a = raw[Math.max(0, i - 1)], b = raw[Math.min(raw.length - 1, i + 1)];
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      raw[i].tx = dx / l; raw[i].tz = dz / l;
    }
    this.length = s;
    this.points = raw;
  }

  /**
   * Smoothed, grade-limited centreline elevation. Every iteration re-clamps the
   * profile to within a few metres of the real ground, so a climb at one end of
   * the route can never lift the road (and with it the terrain) somewhere else.
   */
  _fitElevation(field) {
    const p = this.points;
    const ground = new Float32Array(p.length);
    for (let i = 0; i < p.length; i++) {
      ground[i] = field.rawHeightAt(p[i].x, p[i].z);
      p[i].y = ground[i];
    }

    const tmp = new Float32Array(p.length);
    const maxGrade = 0.09, maxCut = 6.5;
    for (let pass = 0; pass < 7; pass++) {
      const win = 9;
      for (let i = 0; i < p.length; i++) {
        let sum = 0, n = 0;
        for (let k = -win; k <= win; k++) {
          const j = Math.min(p.length - 1, Math.max(0, i + k));
          sum += p[j].y; n++;
        }
        tmp[i] = sum / n;
      }
      for (let i = 0; i < p.length; i++) p[i].y = tmp[i];

      for (let i = 1; i < p.length; i++) {
        const d = Math.max(0.001, p[i].s - p[i - 1].s);
        const g = (p[i].y - p[i - 1].y) / d;
        if (g > maxGrade) p[i].y = p[i - 1].y + maxGrade * d;
      }
      for (let i = p.length - 2; i >= 0; i--) {
        const d = Math.max(0.001, p[i + 1].s - p[i].s);
        const g = (p[i].y - p[i + 1].y) / d;
        if (g > maxGrade) p[i].y = p[i + 1].y + maxGrade * d;
      }
      // never stray far from the real ground — cut and fill, not a viaduct
      for (let i = 0; i < p.length; i++) {
        p[i].y = Math.max(ground[i] - maxCut, Math.min(ground[i] + maxCut, p[i].y));
      }
    }
  }

  _buildAccel() {
    const cell = this._cell;
    const grid = new Map();
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      const cx = Math.floor(p.x / cell), cz = Math.floor(p.z / cell);
      const key = cx * 73856093 ^ cz * 19349663;
      let a = grid.get(key);
      if (!a) { a = []; grid.set(key, a); }
      a.push(i);
    }
    this._grid = grid;
  }

  /**
   * Distance in metres from `(x, z)` to the road centreline. Accurate to a few
   * centimetres inside ~200 m, saturating beyond that.
   * @returns {number}
   */
  distance(x, z) {
    if (!this._grid) return 1e5;
    const cell = this._cell;
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    let best = 1e10, bestI = -1;
    for (let ring = 0; ring <= 4; ring++) {
      for (let dz = -ring; dz <= ring; dz++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (ring > 0 && Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const key = (cx + dx) * 73856093 ^ (cz + dz) * 19349663;
          const arr = this._grid.get(key);
          if (!arr) continue;
          for (let k = 0; k < arr.length; k++) {
            const p = this.points[arr[k]];
            const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
            if (d < best) { best = d; bestI = arr[k]; }
          }
        }
      }
      if (bestI >= 0 && Math.sqrt(best) < cell * ring) break;
    }
    if (bestI < 0) return 1e5;
    // refine against the two adjacent segments
    let d = Math.sqrt(best);
    for (let k = -1; k <= 0; k++) {
      const a = this.points[Math.max(0, Math.min(this.points.length - 2, bestI + k))];
      const b = this.points[Math.max(1, Math.min(this.points.length - 1, bestI + k + 1))];
      const ex = b.x - a.x, ez = b.z - a.z;
      const len2 = ex * ex + ez * ez || 1;
      let t = ((x - a.x) * ex + (z - a.z) * ez) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = a.x + ex * t, pz = a.z + ez * t;
      d = Math.min(d, Math.hypot(px - x, pz - z));
    }
    return d;
  }

  /**
   * Point on the centreline at arc-length `s` metres.
   * @returns {{x:number, y:number, z:number, tx:number, tz:number}}
   */
  pointAt(s) {
    const p = this.points;
    if (!p.length) return { x: 0, y: 0, z: 0, tx: 0, tz: 1 };
    const t = Math.max(0, Math.min(this.length, s));
    let lo = 0, hi = p.length - 1;
    while (lo < hi - 1) { const m = (lo + hi) >> 1; if (p[m].s <= t) lo = m; else hi = m; }
    const a = p[lo], b = p[hi];
    const f = (t - a.s) / Math.max(0.001, b.s - a.s);
    return {
      x: a.x + (b.x - a.x) * f,
      y: a.y + (b.y - a.y) * f,
      z: a.z + (b.z - a.z) * f,
      tx: a.tx + (b.tx - a.tx) * f,
      tz: a.tz + (b.tz - a.tz) * f,
    };
  }

  /**
   * Build the spline, fit it to the terrain and carve it into `field`.
   * Must run after erosion so the surface stays flat.
   */
  carve(field) {
    this._sampleSpline();
    this._fitElevation(field);
    this._buildAccel();

    const { N, HALF, CELL, h, road, roadLat } = field;
    const n = this._noise;
    const R = this.shoulder + 9.0;
    const pts = this.points;

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const minX = Math.min(a.x, b.x) - R, maxX = Math.max(a.x, b.x) + R;
      const minZ = Math.min(a.z, b.z) - R, maxZ = Math.max(a.z, b.z) + R;
      let i0 = Math.floor((minX + HALF) / CELL), i1 = Math.ceil((maxX + HALF) / CELL);
      let j0 = Math.floor((minZ + HALF) / CELL), j1 = Math.ceil((maxZ + HALF) / CELL);
      if (i1 < 0 || j1 < 0 || i0 >= N || j0 >= N) continue;
      i0 = Math.max(0, i0); j0 = Math.max(0, j0);
      i1 = Math.min(N - 1, i1); j1 = Math.min(N - 1, j1);
      const ex = b.x - a.x, ez = b.z - a.z;
      const len2 = ex * ex + ez * ez || 1;

      for (let j = j0; j <= j1; j++) {
        const z = -HALF + j * CELL;
        for (let ii = i0; ii <= i1; ii++) {
          const x = -HALF + ii * CELL;
          let t = ((x - a.x) * ex + (z - a.z) * ez) / len2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const px = a.x + ex * t, pz = a.z + ez * t;
          const raw = Math.hypot(px - x, pz - z);
          // signed side, so the shader can put wheel ruts at fixed offsets
          const side = ((x - px) * ez - (z - pz) * ex) >= 0 ? 1 : -1;
          // wobble the edge so the ribbon never reads as a CAD extrusion
          let d = raw + 2.3 * n.fbm2(x * 0.028, z * 0.028, 3)
            + 0.9 * n.fbm2(x * 0.11, z * 0.11, 2) + 0.35 * n.simplex2(x * 0.34, z * 0.34);
          if (d > this.shoulder + 6.0) continue;

          const y = a.y + (b.y - a.y) * t;
          const idx = j * N + ii;

          // flatten: full on the surface, feathering out through the shoulder
          const core = 1 - smoothstep(this.width * 0.72, this.width + 1.6, d);
          const feather = 1 - smoothstep(this.width, this.shoulder + 5.5, d);
          const blend = Math.max(core, feather * feather * 0.92);
          let target = y;
          // camber + berm
          const dn = d / this.width;
          target -= 0.11 * Math.min(1, dn * dn);
          if (d > this.width && d < this.shoulder) {
            target += 0.34 * Math.sin(Math.PI * (d - this.width) / (this.shoulder - this.width));
          }
          // twin wheel ruts with a raised crown between them
          const rr = (d - 1.85) / 0.55;
          target -= 0.20 * Math.exp(-rr * rr) * core;
          const rr2 = (d - 0.25) / 0.55;
          target += 0.075 * Math.exp(-rr2 * rr2) * core;
          const rr3 = (d - 3.5) / 0.5;
          target -= 0.05 * Math.exp(-rr3 * rr3) * core;

          h[idx] = h[idx] + (target - h[idx]) * blend;
          const m = Math.max(core, 1 - smoothstep(this.width * 0.9, this.shoulder + 2.5, d));
          if (m > road[idx]) {
            road[idx] = m;
            // signed lateral position remapped to 0..1 for the control texture
            roadLat[idx] = Math.max(0, Math.min(1, 0.5 + (side * raw) / (2 * this.shoulder)));
          }
        }
      }
    }
  }
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
