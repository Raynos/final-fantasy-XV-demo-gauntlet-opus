import { Noise } from '../../util/Noise.ts';

/**
 * Carves the whole road network of Lucis into the heightfield.
 *
 * This is the geological half of `world/map/RoadGraph.js`. The graph owns the
 * plan geometry; this owns the elevation and the cut:
 *
 *   1. every junction node gets **one** elevation, relaxed until no edge
 *      between two nodes exceeds its class grade limit,
 *   2. each edge's profile is smoothed and grade-limited between those fixed
 *      endpoints and clamped to within a few metres of the real ground, so a
 *      road is cut and filled rather than flown on a viaduct,
 *   3. the surface is stamped with camber, a berm and wheel ruts, feathering
 *      out through the shoulder.
 *
 * `spine` exposes the main highway through the old single-`Road` interface
 * (`points` / `pointAt` / `distance` / `width`) so vegetation, props and the
 * driving system keep working unchanged.
 */
export class RoadNetwork {
  constructor(graph: import('../map/RoadGraph.ts').RoadGraph) {
    this.graph = graph;
    this._noise = new Noise(551133);
    /** Half-width of the widest running surface, metres (legacy field). */
    this.width = 5.2;
    this.shoulder = 10.5;
    this.spine = null;
  }

  // ------------------------------------------------------------- elevation

  /**
   * One elevation per junction, relaxed so no edge between two junctions is
   * steeper than its class allows. Without this a junction sitting on a slope
   * makes both roads that meet there jump.
   */
  _fitNodes(field) {
    const g = this.graph;
    const y = new Map();
    const ground = new Map();
    for (const [id, n] of g.nodes) {
      // average a small disc so a node never lands in a one-cell pothole
      let s = 0;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        s += field.rawHeightAt(n.x + Math.cos(a) * 14, n.z + Math.sin(a) * 14);
      }
      y.set(id, s / 8 * 0.6 + field.rawHeightAt(n.x, n.z) * 0.4);
      ground.set(id, field.rawHeightAt(n.x, n.z));
    }
    for (let pass = 0; pass < 60; pass++) {
      let worst = 0;
      for (const e of g.edges) {
        const ya = y.get(e.a), yb = y.get(e.b);
        const lim = e.clsDef.maxGrade * e.length * 0.92;
        const d = yb - ya;
        if (Math.abs(d) > lim) {
          const over = (Math.abs(d) - lim) * 0.5 * Math.sign(d);
          y.set(e.a, ya + over * 0.6);
          y.set(e.b, yb - over * 0.6);
          worst = Math.max(worst, Math.abs(d) - lim);
        }
      }
      // A junction is a place, not a free variable: never let the relaxation
      // lift or sink it more than a cutting's worth away from the real ground.
      for (const [id, gy] of ground) {
        y.set(id, Math.max(gy - 11, Math.min(gy + 11, y.get(id))));
      }
      if (worst < 0.05) break;
    }
    for (const [id, gy] of ground) {
      y.set(id, Math.max(gy - 11, Math.min(gy + 11, y.get(id))));
    }
    this.nodeY = y;
    return y;
  }

  /**
   * Smoothed, grade-limited centreline elevation for one edge, with the two
   * junction elevations pinned.
   */
  _fitEdge(edge, field) {
    const p = edge.pts;
    const ground = new Float32Array(p.length);
    for (let i = 0; i < p.length; i++) {
      ground[i] = field.rawHeightAt(p[i].x, p[i].z);
      p[i].y = ground[i];
    }
    const ya = this.nodeY.get(edge.a), yb = this.nodeY.get(edge.b);
    const maxGrade = edge.clsDef.maxGrade;
    const maxCut = edge.clsDef.sealed ? 9.0 : 6.5;
    const tmp = new Float32Array(p.length);
    const win = Math.max(4, Math.round(60 / 6));

    // Order matters: pin, smooth, clamp to the ground, then grade-limit
    // *outward from the pinned ends*. Clamping last is what used to leave a
    // cliff in the first metre of every edge — the junction was pinned to one
    // elevation and its neighbour clamped to another.
    for (let pass = 0; pass < 10; pass++) {
      p[0].y = ya; p[p.length - 1].y = yb;
      for (let i = 0; i < p.length; i++) {
        let sum = 0, n = 0;
        for (let k = -win; k <= win; k++) {
          const j = Math.min(p.length - 1, Math.max(0, i + k));
          sum += p[j].y; n++;
        }
        tmp[i] = sum / n;
      }
      for (let i = 0; i < p.length; i++) p[i].y = tmp[i];
      p[0].y = ya; p[p.length - 1].y = yb;

      // cut and fill, not a viaduct — but let the approach to a junction ramp
      // over 30 samples (~180 m) rather than one cell
      for (let i = 1; i < p.length - 1; i++) {
        const pin = Math.min(1, Math.min(i, p.length - 1 - i) / 30);
        const cut = maxCut + (1 - pin) * 26;
        p[i].y = Math.max(ground[i] - cut, Math.min(ground[i] + cut, p[i].y));
      }

      for (let i = 1; i < p.length; i++) {
        const d = Math.max(0.001, p[i].s - p[i - 1].s);
        if ((p[i].y - p[i - 1].y) / d > maxGrade) p[i].y = p[i - 1].y + maxGrade * d;
      }
      for (let i = p.length - 2; i >= 1; i--) {
        const d = Math.max(0.001, p[i + 1].s - p[i].s);
        if ((p[i].y - p[i + 1].y) / d > maxGrade) p[i].y = p[i + 1].y + maxGrade * d;
      }
      for (let i = p.length - 2; i >= 1; i--) {
        const d = Math.max(0.001, p[i + 1].s - p[i].s);
        if ((p[i + 1].y - p[i].y) / d > maxGrade) p[i].y = p[i + 1].y - maxGrade * d;
      }
      for (let i = 1; i < p.length - 1; i++) {
        const d = Math.max(0.001, p[i].s - p[i - 1].s);
        if ((p[i - 1].y - p[i].y) / d > maxGrade) p[i].y = p[i - 1].y - maxGrade * d;
      }
    }
  }

  // ---------------------------------------------------------------- queries

  /** Metres to the nearest road centreline. */
  distance(x, z) { return this.graph.distance(x, z, 320); }

  // -------------------------------------------------------- bake / restore

  /**
   * The fitted centreline elevations — the only part of `carve()` that cannot
   * be recomputed from a baked heightfield, because grade solving reads the
   * ground *before* the road flattened it.
   */
  captureElevations(): Float32Array {
    let n = 0;
    for (const e of this.graph.edges) n += e.pts.length;
    const out = new Float32Array(n);
    let k = 0;
    for (const e of this.graph.edges) for (const p of e.pts) out[k++] = p.y;
    return out;
  }

  /**
   * Put a `captureElevations()` snapshot back and rebuild everything `carve()`
   * derives from it, without touching the heightfield (which is already baked).
   */
  restoreElevations(ys: Float32Array) {
    const g = this.graph;
    let k = 0;
    for (const e of g.edges) for (const p of e.pts) p.y = ys[k++];
    for (const r of g.routes) {
      let i = 0;
      for (const ei of r.edges) {
        const e = g.edges[ei];
        for (let n = (i ? 1 : 0); n < e.pts.length; n++, i++) {
          if (r.pts[i]) r.pts[i].y = e.pts[n].y;
        }
      }
    }
    this.spine = this._makeSpine();
  }

  // ------------------------------------------------------------------ carve

  /**
   * Fit every edge to the terrain and cut it in.
   * Must run after erosion so the surface stays flat.
   */
  carve(field: any) {
    const g = this.graph;
    this._fitNodes(field);
    for (const e of g.edges) this._fitEdge(e, field);

    // Copy the fitted elevations onto the per-route polylines so anything that
    // walks a route (props, the driving line) gets the road surface, not the
    // raw ground.
    for (const r of g.routes) {
      let k = 0;
      for (const ei of r.edges) {
        const e = g.edges[ei];
        for (let i = (k ? 1 : 0); i < e.pts.length; i++, k++) {
          if (r.pts[k]) r.pts[k].y = e.pts[i].y;
        }
      }
    }

    for (const e of g.edges) this._carveEdge(e, field);
    // parking bays and turning circles get a level apron
    this._carveBays(field);
    this._compensateMicro(field);

    this.spine = this._makeSpine();
  }

  _carveEdge(edge, field) {
    const { N, HALF, CELL, h, road, roadLat } = field;
    const n = this._noise;
    const cls = edge.clsDef;
    const halfW = cls.half, shoulder = cls.shoulder;
    const R = shoulder + 10;
    const pts = edge.pts;

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
          const side = ((x - px) * ez - (z - pz) * ex) >= 0 ? 1 : -1;
          // wobble the edge so the ribbon never reads as a CAD extrusion
          let d = raw + 2.3 * n.fbm2(x * 0.028, z * 0.028, 3)
            + 0.9 * n.fbm2(x * 0.11, z * 0.11, 2) + 0.35 * n.simplex2(x * 0.34, z * 0.34);
          if (d > shoulder + 7.0) continue;

          const y = a.y + (b.y - a.y) * t;
          const idx = j * N + ii;

          const core = 1 - smoothstep(halfW * 0.72, halfW + 1.6, d);
          const feather = 1 - smoothstep(halfW, shoulder + 6.5, d);
          const blend = Math.max(core, feather * feather * 0.92);
          let target = y;
          const dn = d / halfW;
          target -= 0.12 * Math.min(1, dn * dn);
          if (d > halfW && d < shoulder) {
            target += 0.38 * Math.sin(Math.PI * (d - halfW) / (shoulder - halfW));
          }
          // twin wheel ruts with a raised crown between them
          const rr = (d - 1.85) / 0.55;
          target -= 0.20 * Math.exp(-rr * rr) * core;
          const rr2 = (d - 0.25) / 0.55;
          target += 0.075 * Math.exp(-rr2 * rr2) * core;
          const rr3 = (d - 3.5) / 0.5;
          target -= 0.05 * Math.exp(-rr3 * rr3) * core;

          h[idx] = h[idx] + (target - h[idx]) * blend;
          const m = Math.max(core, 1 - smoothstep(halfW * 0.9, shoulder + 2.5, d));
          if (m > road[idx]) {
            road[idx] = m;
            // signed lateral position on a fixed +/-16 m scale, which is what
            // the fragment shader decodes to place the ruts
            roadLat[idx] = Math.max(0, Math.min(1, 0.5 + (side * raw) / 32));
          }
        }
      }
    }
  }

  /**
   * Level aprons at parking spots, turning circles and station forecourts, so
   * a car can stop, turn and be parked without hanging off a slope.
   */
  _carveBays(field) {
    const { N, HALF, CELL, h, road } = field;
    const g = this.graph;
    for (const [id, node] of g.nodes) {
      if (node.edges.length > 1) continue;      // only dead ends need one
      const e = g.edges[node.edges[0]];
      const y = this.nodeY.get(id);
      const R = Math.max(16, e.clsDef.half * 3.4);
      const i0 = Math.max(0, Math.floor((node.x - R * 1.6 + HALF) / CELL));
      const i1 = Math.min(N - 1, Math.ceil((node.x + R * 1.6 + HALF) / CELL));
      const j0 = Math.max(0, Math.floor((node.z - R * 1.6 + HALF) / CELL));
      const j1 = Math.min(N - 1, Math.ceil((node.z + R * 1.6 + HALF) / CELL));
      for (let j = j0; j <= j1; j++) {
        const z = -HALF + j * CELL;
        for (let i = i0; i <= i1; i++) {
          const x = -HALF + i * CELL;
          const d = Math.hypot(x - node.x, z - node.z);
          if (d > R * 1.6) continue;
          const k = 1 - smoothstep(R * 0.7, R * 1.6, d);
          const idx = j * N + i;
          h[idx] += (y - 0.08 - h[idx]) * k * 0.96;
          const m = 1 - smoothstep(R * 0.75, R * 1.15, d);
          if (m > road[idx]) road[idx] = m;
        }
      }
    }
  }

  /**
   * The analytic micro-relief is added to every height query, on and off the
   * road alike. Pre-subtracting it from the carved cells is what keeps a
   * highway smooth without the vertex shader having to sample a road mask.
   */
  _compensateMicro(field) {
    const { N, HALF, CELL, h, road, micro } = field;
    if (!micro) return;
    for (let j = 0; j < N; j++) {
      const z = -HALF + j * CELL;
      const row = j * N;
      for (let i = 0; i < N; i++) {
        const m = road[row + i];
        if (m > 0.01) h[row + i] -= micro(-HALF + i * CELL, z) * m;
      }
    }
  }

  /**
   * A single-spline facade over the main highway, matching the interface the
   * rest of the codebase has always used.
   */
  _makeSpine(): any {
    const g = this.graph;
    const route = g.routeById.get('route1');
    const pts = route.pts;
    const self = this;
    return {
      points: pts,
      length: route.length,
      width: g.classes.highway.half,
      shoulder: g.classes.highway.shoulder,
      /** Point on the highway centreline at arc-length `s` metres. */
      pointAt(s) {
        if (!pts.length) return { x: 0, y: 0, z: 0, tx: 0, tz: 1 };
        const t = Math.max(0, Math.min(this.length, s));
        let lo = 0, hi = pts.length - 1;
        while (lo < hi - 1) { const m = (lo + hi) >> 1; if (pts[m].s <= t) lo = m; else hi = m; }
        const a = pts[lo], b = pts[hi];
        const f = (t - a.s) / Math.max(0.001, b.s - a.s);
        return {
          x: a.x + (b.x - a.x) * f,
          y: a.y + (b.y - a.y) * f,
          z: a.z + (b.z - a.z) * f,
          tx: a.tx + (b.tx - a.tx) * f,
          tz: a.tz + (b.tz - a.tz) * f,
        };
      },
      /** Distance to the nearest road of any class, metres. */
      distance(x, z) { return self.distance(x, z); },
    };
  }
}

function smoothstep(a, b, x) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
