/**
 * Marching squares over a height function, chained into polylines and re-snapped
 * onto the exact iso-level.
 *
 * Plan §6.1, first half. The lesson that makes this worth its own file: **an
 * arc-length resample of a marching-squares chain walks the contour inland.**
 * Resampling is a chord across each little arc, smoothing is an average of
 * neighbours, and both move a point toward the inside of every convexity — on a
 * scalloped bay that is decimetres, which is the whole width of a swash band. So
 * every resampled point is re-snapped by bisection along its own normal until
 * the height function says it is back on the line. Nothing downstream can
 * recover a waterline that is in the wrong place; the water plane draws the real
 * one, and a ribbon a metre inland of it is a stripe of wet sand with dry beach
 * on the seaward side.
 */

/** A height field sampled in world xz. */
export type HeightFn = (x: number, z: number) => number;

/** One chained contour: world-space points, and whether it closes on itself. */
export interface Contour {
  /** Flat xz pairs, in order. */
  pts: number[];
  closed: boolean;
  /** Total length in metres after resampling. */
  length: number;
}

/**
 * Trace the `level` iso-contour of `h` over an axis-aligned rectangle.
 *
 * @param h height function
 * @param x0 rectangle min x
 * @param z0 rectangle min z
 * @param nx cells in x
 * @param nz cells in z
 * @param cell cell size, metres
 * @param level the iso value
 */
export function marchSquares(h: HeightFn, x0: number, z0: number, nx: number, nz: number, cell: number, level: number): number[] {
  // One row of samples at a time; the grid is up to a third of a million cells
  // on a sea basin and holding all of it costs more than re-walking it.
  const w = nx + 1;
  let prev = new Float32Array(w);
  let cur = new Float32Array(w);
  for (let i = 0; i <= nx; i++) prev[i] = h(x0 + i * cell, z0) - level;

  /** Segment endpoints, flat: ax, az, bx, bz. */
  const segs: number[] = [];
  // Edge crossing points of one cell, by edge index 0=bottom 1=right 2=top 3=left.
  const ex = [0, 0, 0, 0], ez = [0, 0, 0, 0];

  for (let j = 0; j < nz; j++) {
    const zA = z0 + j * cell, zB = zA + cell;
    for (let i = 0; i <= nx; i++) cur[i] = h(x0 + i * cell, zB) - level;
    for (let i = 0; i < nx; i++) {
      const xA = x0 + i * cell, xB = xA + cell;
      // Corner values, counter-clockwise from (xA,zA).
      const v0 = prev[i], v1 = prev[i + 1], v2 = cur[i + 1], v3 = cur[i];
      let code = 0;
      if (v0 > 0) code |= 1;
      if (v1 > 0) code |= 2;
      if (v2 > 0) code |= 4;
      if (v3 > 0) code |= 8;
      if (code === 0 || code === 15) continue;

      // Linear crossing along each edge that has one.
      if ((v0 > 0) !== (v1 > 0)) { ex[0] = xA + cell * (-v0 / (v1 - v0)); ez[0] = zA; }
      if ((v1 > 0) !== (v2 > 0)) { ex[1] = xB; ez[1] = zA + cell * (-v1 / (v2 - v1)); }
      if ((v3 > 0) !== (v2 > 0)) { ex[2] = xA + cell * (-v3 / (v2 - v3)); ez[2] = zB; }
      if ((v0 > 0) !== (v3 > 0)) { ex[3] = xA; ez[3] = zA + cell * (-v0 / (v3 - v0)); }

      const push = (a: number, b: number) => { segs.push(ex[a], ez[a], ex[b], ez[b]); };
      switch (code) {
        case 1: case 14: push(3, 0); break;
        case 2: case 13: push(0, 1); break;
        case 3: case 12: push(3, 1); break;
        case 4: case 11: push(1, 2); break;
        case 6: case 9: push(0, 2); break;
        case 7: case 8: push(3, 2); break;
        // The two saddles. Resolved by the cell centre rather than by a fixed
        // convention: guessing splits a headland the wrong way and leaves two
        // chains that each run the wrong side of a spit.
        case 5: {
          const c = h(xA + cell * 0.5, zA + cell * 0.5) - level;
          if (c > 0) { push(3, 0); push(1, 2); } else { push(3, 2); push(0, 1); }
          break;
        }
        case 10: {
          const c = h(xA + cell * 0.5, zA + cell * 0.5) - level;
          if (c > 0) { push(0, 1); push(3, 2); } else { push(0, 2); push(3, 1); }
          break;
        }
      }
    }
    const t = prev; prev = cur; cur = t;
  }
  return segs;
}

/**
 * Join marching-squares segments into ordered polylines.
 *
 * Endpoints are exact duplicates between neighbouring cells only up to floating
 * point, so they are keyed on a quantised grid. `q` has to be coarse enough to
 * absorb the interpolation's last bit and fine enough that two genuinely
 * different crossings on one cell edge do not collide; a thousandth of a metre
 * satisfies both for any cell size we use.
 */
export function chainSegments(segs: number[], q = 1000): Contour[] {
  const key = (x: number, z: number) => `${Math.round(x * q)},${Math.round(z * q)}`;
  const n = segs.length / 4;
  /** For each endpoint key, the segments touching it. */
  const at = new Map<string, number[]>();
  const used = new Uint8Array(n);
  for (let s = 0; s < n; s++) {
    for (let e = 0; e < 2; e++) {
      const k = key(segs[s * 4 + e * 2], segs[s * 4 + e * 2 + 1]);
      const list = at.get(k);
      if (list) list.push(s); else at.set(k, [s]);
    }
  }

  const out: Contour[] = [];
  /** Walk from one end of segment `s`, consuming segments as we go. */
  const walk = (s0: number, fromEnd: number, pts: number[]) => {
    let s = s0, end = fromEnd;
    for (;;) {
      used[s] = 1;
      const ox = segs[s * 4 + (1 - end) * 2], oz = segs[s * 4 + (1 - end) * 2 + 1];
      pts.push(ox, oz);
      const list = at.get(key(ox, oz));
      if (!list) return false;
      let next = -1;
      for (const c of list) if (!used[c]) { next = c; break; }
      if (next < 0) {
        // Closed if the far end came back to where the walk started.
        return Math.abs(ox - pts[0]) < 1 / q && Math.abs(oz - pts[1]) < 1 / q;
      }
      const sameStart = Math.abs(segs[next * 4] - ox) < 1 / q && Math.abs(segs[next * 4 + 1] - oz) < 1 / q;
      s = next; end = sameStart ? 0 : 1;
    }
  };

  for (let s = 0; s < n; s++) {
    if (used[s]) continue;
    // Walk one way, then reverse and walk the other, so an open chain started
    // in its middle still comes out as one polyline instead of two.
    const fwd: number[] = [segs[s * 4], segs[s * 4 + 1]];
    const closed = walk(s, 0, fwd);
    if (!closed) {
      const back: number[] = [];
      const list = at.get(key(fwd[0], fwd[1]));
      if (list) for (const c of list) if (!used[c]) { walk(c, Math.abs(segs[c * 4] - fwd[0]) < 1 / q && Math.abs(segs[c * 4 + 1] - fwd[1]) < 1 / q ? 0 : 1, back); break; }
      for (let i = back.length - 2; i >= 0; i -= 2) fwd.unshift(back[i], back[i + 1]);
    }
    out.push({ pts: fwd, closed, length: polyLength(fwd, closed) });
  }
  return out;
}

/** Total length of a flat xz polyline. */
export function polyLength(pts: number[], closed: boolean): number {
  let L = 0;
  for (let i = 2; i < pts.length; i += 2) L += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
  if (closed && pts.length >= 4) L += Math.hypot(pts[0] - pts[pts.length - 2], pts[1] - pts[pts.length - 1]);
  return L;
}

/**
 * Resample a polyline at a fixed arc-length step, then **re-snap every sample
 * back onto the iso-line** by bisection along the local normal.
 *
 * The re-snap is the whole point of the function. Without it a 4 m resample of a
 * 6 m marching grid sits measurably inland of the contour it came from, and a
 * ribbon built off it hangs its waterline row over dry ground.
 *
 * @param search how far either way to hunt for the crossing, metres
 * @param moved optional sink for the distance each point was moved by the snap
 */
export function resampleAndSnap(c: Contour, ds: number, h: HeightFn, level: number, search = 4, moved?: number[]): number[] {
  const src = c.pts;
  const total = c.length;
  if (!(total > ds * 2)) return [];
  const count = Math.max(3, Math.round(total / ds));
  const step = total / count;
  const out: number[] = [];

  // Walk the source polyline accumulating arc length, emitting at each step.
  let seg = 0, acc = 0, want = 0;
  const lastIx = c.closed ? src.length : src.length - 2;
  const px = (i: number) => src[(i * 2) % src.length];
  const pz = (i: number) => src[(i * 2 + 1) % src.length];
  const nSeg = lastIx / 2 - (c.closed ? 0 : 1);
  const emit = count + (c.closed ? 0 : 1);
  while (out.length / 2 < emit && seg < nSeg) {
    const ax = px(seg), az = pz(seg), bx = px(seg + 1), bz = pz(seg + 1);
    const L = Math.hypot(bx - ax, bz - az);
    while (want <= acc + L + 1e-9 && out.length / 2 < emit) {
      const t = L < 1e-9 ? 0 : (want - acc) / L;
      out.push(ax + (bx - ax) * t, az + (bz - az) * t);
      want += step;
    }
    acc += L; seg++;
  }
  if (out.length < 6) return [];

  // Normal at each sample, from its two neighbours, then bisect along it.
  const m = out.length / 2;
  const snapped = new Array<number>(out.length);
  for (let i = 0; i < m; i++) {
    const i0 = (i - 1 + m) % m, i1 = (i + 1) % m;
    let tx = out[i1 * 2] - out[i0 * 2], tz = out[i1 * 2 + 1] - out[i0 * 2 + 1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    // xz normal, either side; the sign does not matter to a bisection.
    const nx = -tz, nz = tx;
    const x = out[i * 2], z = out[i * 2 + 1];
    const [sx, sz] = bisectIso(h, level, x, z, nx, nz, search);
    snapped[i * 2] = sx; snapped[i * 2 + 1] = sz;
    // How far the re-snap had to move the point is the measurement that says
    // whether it earns its place. It is reported, not assumed.
    if (moved) moved.push(Math.hypot(sx - x, sz - z));
  }
  return snapped;
}

/**
 * Find where `h` crosses `level` along the ray `p + n*t`, `t` in `[-search, search]`.
 *
 * Returns `p` unchanged when no crossing brackets — which is the honest answer
 * for a point already on a plateau, and better than the alternative of pushing
 * it to the end of the search and inventing a shoreline there.
 */
export function bisectIso(h: HeightFn, level: number, x: number, z: number, nx: number, nz: number, search: number, iters = 14): [number, number] {
  let lo = -search, hi = search;
  const f = (t: number) => h(x + nx * t, z + nz * t) - level;
  let flo = f(lo), fhi = f(hi);
  if (flo === 0) return [x + nx * lo, z + nz * lo];
  if (fhi === 0) return [x + nx * hi, z + nz * hi];
  if ((flo > 0) === (fhi > 0)) {
    // No bracket over the full span. Shrink toward the sample: the contour is
    // usually within a fraction of a cell and the wide span can straddle a spit.
    const f0 = f(0);
    if ((f0 > 0) !== (flo > 0)) { hi = 0; fhi = f0; } else if ((f0 > 0) !== (fhi > 0)) { lo = 0; flo = f0; } else return [x, z];
  }
  for (let k = 0; k < iters; k++) {
    const mid = (lo + hi) * 0.5;
    const fm = f(mid);
    if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else { hi = mid; fhi = fm; }
  }
  const t = (lo + hi) * 0.5;
  return [x + nx * t, z + nz * t];
}
