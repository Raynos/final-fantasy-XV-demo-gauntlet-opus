import * as THREE from 'three';
import { marchSquares, chainSegments, resampleAndSnap, type HeightFn } from './contour.ts';
import { assertCardOrientation, assertAttributes } from './geo.ts';
import { assertUpward, downFacing } from '../../util/GeoAssert.ts';

/**
 * Shoreline contour ribbon — plan §6.1.
 *
 * A strip of geometry that follows the exact waterline of every body of standing
 * water and carries the swash: the damp band, the run-up edge, the lace of
 * broken foam sliding back down the sand. We had no shore geometry at all. Land
 * met sea along a hard analytic cut, which is the single loudest tell in any of
 * our coastal frames.
 *
 * ### Three decisions, all of them measured by the source this is ported from
 *
 * **Re-snap after resampling.** {@link resampleAndSnap} does it and the comment
 * there says why: smoothing alone walks the line inland.
 *
 * **Rows are placed by elevation target, not by metres inland.** Each row asks
 * "where does the ground first reach +0.35 m above the water", not "where is the
 * ground 3 m inland". A beach berm is *non-monotone* — walk inland from the
 * water and the ground rises to the berm crest, falls into the runnel behind it,
 * and rises again. "1.4 m inland" and "1.4 m up" are two different places and
 * only one of them is the beach. **First** crossing, so the runnel behind the
 * berm is outside the ribbon rather than folded into it.
 *
 * **21 rows.** The source swept rows against columns and found rows buy
 * everything and columns buy nothing, which is the shape you would predict: the
 * interesting gradient is entirely across the band and the along-shore direction
 * is nearly constant over any 4 m. The rows are biased toward the waterline by a
 * signed power curve, because that is where the run-up edge lives and a linear
 * spread puts most of its resolution on dry sand.
 *
 * ### Blending, and why it is not an ordinary alpha decal
 *
 * The ribbon lies on ground the terrain shader has already lit, shadowed and
 * fogged. An alpha-blended decal has to *reproduce* all of that or it reads as a
 * flat sticker, and reproducing it is how a wet band ends up as a grey stripe
 * under raking golden light. So the ribbon does not paint a colour: it is
 * blended `dst * a + c`, with `a` the wet-sand albedo drop and `c` the foam and
 * the sky sheen. Every bit of the lighting underneath survives by construction.
 * `blendSrc = One`, `blendDst = SrcAlpha` is exactly that equation.
 *
 * ### Cost
 *
 * One `Mesh`, one draw call, no shadow cast. Every body in the world is merged
 * into it — a body's own water level rides in a vertex attribute rather than in
 * a uniform, which is the only reason one mesh can serve a sea at -6.5 m and a
 * tarn at +53 m.
 */

/** Build knobs. `debug` turns the fold gate into a report, for a bench. */
export interface ShoreOpts {
  cell?: number;
  debug?: boolean;
}

/** One chain's build, only collected under `debug`. */
export interface ShoreChainRow {
  x: number; z: number; m: number; closed: boolean; vote: number; folded: number; degenerate: number; kept: number;
}

/** A body of standing water to draw a shore for. */
export interface ShoreSpec {
  cx: number;
  cz: number;
  w: number;
  d: number;
  level: number;
  name?: string;
}

/** What the build did, for the handoff and for the gate. */
export interface ShoreStats {
  bodies: number;
  chains: number;
  /** Chains rejected as too short to be a shoreline. */
  dropped: number;
  points: number;
  vertices: number;
  triangles: number;
  /** Metres of waterline drawn. */
  metres: number;
  /** Median distance the bisection moved a resampled point back onto the line. */
  snapMedian: number;
  snapMax: number;
  downFacing: number;
  /** Chains whose handedness came out reversed — islands, and inland shores. */
  flippedChains: number;
  /** Triangles dropped because they came out face-down. See the note at emit. */
  folded: number;
  /** Quads whose two rows landed on the same clamp — zero area, not backwards. */
  degenerate: number;
  kept: number;
  /** Per-chain detail, only under `debug`. */
  chainRows?: ShoreChainRow[];
  ms: number;
}

/** The surface the ribbon is laid on. */
export interface ShoreGround {
  heightAt(x: number, z: number): number;
  normalAt(x: number, z: number, out?: THREE.Vector3): THREE.Vector3;
  groundColorAt?(x: number, z: number, out?: THREE.Color): THREE.Color;
  drawnEnvelope?(x: number, z: number, size?: number, viewCell?: number): number;
}

/** Rows across the band, and the elevations they target. */
export const SHORE_ROWS = 21;
/** Metres above the waterline the top row aims for. */
export const SHORE_UP = 0.60;
/** Metres below the waterline the bottom row aims for. */
export const SHORE_DOWN = -1.45;
/** Bias exponent: >1 concentrates rows on the waterline. */
const ROW_BIAS = 1.75;

/** Elevation target of row `r`, relative to the water level. */
export function rowElevation(r: number): number {
  const t = (r / (SHORE_ROWS - 1)) * 2 - 1;         // -1 seaward .. +1 inland
  const s = Math.sign(t) * Math.pow(Math.abs(t), ROW_BIAS);
  return s >= 0 ? s * SHORE_UP : s * -SHORE_DOWN;
}

/** How far the row search walks inland and seaward before giving up, metres. */
const MARCH_IN = 15;
const MARCH_OUT = 17;
/**
 * Fraction of the local radius of curvature a row may march toward the centre.
 *
 * Without this the ribbon self-intersects, and it does so on every real
 * coastline: rows marching inland out of a 15 m bay converge on its centre and
 * cross, which is a fan of inside-out triangles wearing a correct vertex count.
 * The rows on the *convex* side of the same bend diverge and need no clamp,
 * which is why the limit is signed rather than symmetric.
 */
const CURVE_SAFETY = 0.80;
/**
 * Bound on how far a row may move in or out per metre of shoreline.
 *
 * Below 1.0 the along-shore edge of every quad still points forward, which is
 * the condition for the strip not to fold back on itself. 0.65 leaves headroom
 * for the curvature clamp acting on the same quad from the other axis.
 */
const LIPSCHITZ = 0.65;
/** Twice-area below which a triangle is called degenerate rather than folded. */
const AREA_FLOOR = 1e-7;
/** Profile step for the first-crossing scan. */
const MARCH_STEP = 0.55;
/** Along-shore resample step. */
const SHORE_DS = 4.0;
/**
 * Chains shorter than this are specks, not shorelines.
 *
 * 100 m is a 32 m pond. Below that a 21-row band marching fifteen metres either
 * way has nowhere to go: the three smallest loops on this map came out with
 * *more* degenerate quads than live ones (596 against 558 on one of them), which
 * is the geometry saying it has been asked for a band wider than the water.
 */
const MIN_CHAIN = 100;
/** The three along-shore swash wavelengths, metres. Detuned, never harmonic. */
const SWASH_LAMBDA = [43.0, 71.0, 113.0];

/**
 * Build one merged ribbon over every body given.
 *
 * @returns `null` geometry when nothing crossed the level anywhere
 */
export function buildShoreRibbon(ground: ShoreGround, specs: ShoreSpec[], opts: ShoreOpts = {}) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const stats: ShoreStats = {
    bodies: 0, chains: 0, dropped: 0, points: 0, vertices: 0, triangles: 0, metres: 0,
    snapMedian: 0, snapMax: 0, downFacing: 0, flippedChains: 0, folded: 0, degenerate: 0, kept: 0, ms: 0,
  };

  const pos: number[] = [];
  const phase: number[] = [];
  const shore: number[] = [];
  const idx: number[] = [];
  const snapDists: number[] = [];

  const col = new THREE.Color();
  const rowElev: number[] = [];
  for (let r = 0; r < SHORE_ROWS; r++) rowElev.push(rowElevation(r));
  // The waterline row: the one whose target is exactly zero.
  const midRow = (SHORE_ROWS - 1) / 2;

  const profIn = new Float64Array(Math.ceil(MARCH_IN / MARCH_STEP) + 1);
  const profOut = new Float64Array(Math.ceil(MARCH_OUT / MARCH_STEP) + 1);

  const WORLD_UP = new THREE.Vector3(0, 1, 0);
  let flipped = 0;

  for (const b of specs) {
    const L = b.level;
    const h: HeightFn = (x, z) => ground.heightAt(x, z);
    // A cell fine enough to resolve a spit, coarse enough that a 2 km basin is
    // not a million samples. Scaled off the body so a 60 m tarn is not traced
    // on a 6 m grid it has no detail for.
    const cell = opts.cell ?? Math.max(2.0, Math.min(4.5, Math.max(b.w, b.d) / 320));
    const pad = 26;
    const x0 = b.cx - b.w * 0.5 - pad, z0 = b.cz - b.d * 0.5 - pad;
    const nx = Math.ceil((b.w + pad * 2) / cell), nz = Math.ceil((b.d + pad * 2) / cell);
    if (nx < 3 || nz < 3) continue;

    const segs = marchSquares(h, x0, z0, nx, nz, cell, L);
    if (!segs.length) continue;
    const chains = chainSegments(segs);
    stats.bodies++;

    // Trace every chain of this body first, then build. The row marches need to
    // know how close the *other* side of the water is, and on this map that is
    // not a detail: the drainage incision cuts inlets four to ten metres wide
    // into the coast, and a row marching eighteen metres inland from one bank of
    // one of those crosses the far bank, the far bank's rows, and comes out the
    // other side. Local curvature cannot see it — the banks of a straight creek
    // are straight. It is a local-thickness constraint and it needs the whole
    // contour set in hand.
    const traced: { c: typeof chains[number], line: number[] }[] = [];
    for (const c of chains) {
      if (c.length < MIN_CHAIN) { stats.dropped++; continue; }
      const line = resampleAndSnap(c, SHORE_DS, h, L, Math.max(3, cell * 1.2), snapDists);
      if (line.length / 2 < 4) { stats.dropped++; continue; }
      traced.push({ c, line });
    }
    if (!traced.length) continue;

    // Uniform-grid hash of every traced point in this body, keyed at the search
    // radius so a query touches nine buckets.
    const GRID = MARCH_OUT;
    const hash = new Map<number, number[]>();
    const allX: number[] = [], allZ: number[] = [], allChain: number[] = [], allI: number[] = [];
    for (let ci = 0; ci < traced.length; ci++) {
      const line = traced[ci].line;
      for (let i = 0; i < line.length / 2; i++) {
        const k = (Math.floor(line[i * 2] / GRID) + 4096) * 16384 + (Math.floor(line[i * 2 + 1] / GRID) + 4096);
        const list = hash.get(k);
        const id = allX.length;
        allX.push(line[i * 2]); allZ.push(line[i * 2 + 1]); allChain.push(ci); allI.push(i);
        if (list) list.push(id); else hash.set(k, [id]);
      }
    }

    for (let ci = 0; ci < traced.length; ci++) {
      const c = traced[ci].c;
      const line = traced[ci].line;
      const m = line.length / 2;
      stats.chains++;
      stats.metres += c.length;

      // Loop-exact wave phases. A closed shoreline that carries raw arc length
      // has a seam where the loop rejoins: the sine sets restart mid-cycle and
      // one wave in the world is cut in half by a line nothing else explains.
      // Quantising each wavelength to divide the loop makes the phase continuous
      // by construction, and costs three floats a vertex.
      const total = c.length;
      const lam = SWASH_LAMBDA.map((l) => (c.closed ? total / Math.max(1, Math.round(total / l)) : l));
      const dsHere = total / m;

      // ---- phase 1: the frame and the row offsets, nothing emitted yet ----
      //
      // Which side of the chain is inland is decided **once, by a vote over the
      // whole chain**, not per point. Per point it is one height comparison
      // three metres either way, and across a spit narrower than six metres
      // that probe lands in the water on the far side and answers backwards.
      // One point answering backwards reverses the handedness of its own quad
      // column and nothing else, which is a two-triangle hole in the middle of
      // a correct ribbon — the exact defect class the plan says nothing
      // downstream can report. The vote is over every point and weighted by how
      // decisive each one is, so a handful of narrow necks cannot outvote a
      // kilometre of unambiguous beach.
      const tanX = new Float64Array(m), tanZ = new Float64Array(m);
      for (let i = 0; i < m; i++) {
        const i0 = c.closed ? (i - 1 + m) % m : Math.max(0, i - 1);
        const i1 = c.closed ? (i + 1) % m : Math.min(m - 1, i + 1);
        const tx = line[i1 * 2] - line[i0 * 2], tz = line[i1 * 2 + 1] - line[i0 * 2 + 1];
        const tl = Math.hypot(tx, tz) || 1;
        tanX[i] = tx / tl; tanZ[i] = tz / tl;
      }
      // Smooth the tangent field, not the positions. The contour of an eroded
      // coast wiggles at the scale of the marching grid, so a raw three-point
      // tangent swings by tens of degrees between neighbours and the rows built
      // off it fan and cross. Smoothing the *positions* instead would walk the
      // line inland, which is the mistake the re-snap exists to undo.
      for (let pass = 0; pass < 3; pass++) {
        const sx = Float64Array.from(tanX), sz = Float64Array.from(tanZ);
        for (let i = 0; i < m; i++) {
          const a = c.closed ? (i - 1 + m) % m : Math.max(0, i - 1);
          const b = c.closed ? (i + 1) % m : Math.min(m - 1, i + 1);
          let x = sx[a] * 0.25 + sx[i] * 0.5 + sx[b] * 0.25;
          let z = sz[a] * 0.25 + sz[i] * 0.5 + sz[b] * 0.25;
          const l = Math.hypot(x, z) || 1;
          tanX[i] = x / l; tanZ[i] = z / l;
        }
      }
      let vote = 0;
      for (let i = 0; i < m; i++) {
        const nx2 = -tanZ[i], nz2 = tanX[i];
        const x = line[i * 2], z = line[i * 2 + 1];
        vote += h(x + nx2 * 3, z + nz2 * 3) - h(x - nx2 * 3, z - nz2 * 3);
      }
      const side = vote >= 0 ? 1 : -1;
      // A small closed loop converges globally, not locally. The per-point
      // curvature is read over one 4 m step and cannot see that a 190 m pond has
      // a 30 m radius, so the seaward rows of a tarn all march past its centre
      // and out the far side. The loop's own centroid is the cheap global bound.
      let ccx = 0, ccz = 0;
      if (c.closed) { for (let i = 0; i < m; i++) { ccx += line[i * 2]; ccz += line[i * 2 + 1]; } ccx /= m; ccz /= m; }
      // With n = side * (-tz, tx), (t x n)·up is exactly -side. So the winding
      // follows from the vote and needs no geometry of its own; the assert
      // below then checks that claim against the vertices actually written.
      const flip = side > 0;

      const nrmX = new Float64Array(m), nrmZ = new Float64Array(m);
      const off = new Float64Array(m * SHORE_ROWS);
      /**
       * Paleness, per point rather than per vertex.
       *
       * `groundColorAt` runs a nineteen-zone biome blend and was being asked for
       * it at every one of the 21 rows, which is the same answer 21 times and
       * was a third of a 1.5 s boot-time build. It resolves nothing across
       * fifteen metres of beach that one sample at the waterline does not.
       */
      const pale = new Float64Array(m);
      for (let i = 0; i < m; i++) {
        const x = line[i * 2], z = line[i * 2 + 1];
        const tx = tanX[i], tz = tanZ[i];
        const i0 = c.closed ? (i - 1 + m) % m : Math.max(0, i - 1);
        const i1 = c.closed ? (i + 1) % m : Math.min(m - 1, i + 1);
        const nx2 = side * -tz, nz2 = side * tx;
        nrmX[i] = nx2; nrmZ[i] = nz2;
        if (ground.groundColorAt) { ground.groundColorAt(x, z, col); pale[i] = col.r + col.g + col.b; }
        else pale[i] = 0.25;

        // Signed radius of curvature, and the marches it will allow. The bend
        // direction is the change in tangent; when it points inland the centre
        // of curvature is inland and the inland rows are the ones that converge.
        let capIn = MARCH_IN, capOut = MARCH_OUT;
        if (c.closed) {
          const rr = Math.hypot(x - ccx, z - ccz) * CURVE_SAFETY;
          if ((ccx - x) * nx2 + (ccz - z) * nz2 > 0) capIn = Math.min(capIn, rr);
          else capOut = Math.min(capOut, rr);
        }
        // Local thickness: how far is the nearest other piece of waterline, and
        // on which side. Two shores facing each other across a creek get half
        // the gap each, which is exactly the medial axis and exactly where a row
        // has to stop. Chain-adjacent points are excluded — a point's own
        // neighbours are always the nearest thing to it and would cap every
        // march at the resample step.
        {
          const gx = Math.floor(x / GRID), gz = Math.floor(z / GRID);
          for (let dgx = -1; dgx <= 1; dgx++) for (let dgz = -1; dgz <= 1; dgz++) {
            const list = hash.get((gx + dgx + 4096) * 16384 + (gz + dgz + 4096));
            if (!list) continue;
            for (const id of list) {
              if (allChain[id] === ci) {
                const d = Math.abs(allI[id] - i);
                if (Math.min(d, m - d) <= 6) continue;
              }
              const qx = allX[id] - x, qz = allZ[id] - z;
              if (qx * qx + qz * qz > MARCH_OUT * MARCH_OUT) continue;
              const t = qx * nx2 + qz * nz2;
              if (t > 0) capIn = Math.min(capIn, t * 0.42);
              else capOut = Math.min(capOut, -t * 0.42);
            }
          }
        }
        {
          // Curvature of the frame the rows are actually built on, which is the
          // SMOOTHED tangent field — not of the raw polyline. Measuring one and
          // marching along the other is how a clamp comes out too generous
          // exactly where it is needed: the smoothing removed the wiggle the raw
          // curvature was reporting, and left the long bend it was not.
          const dtx = tanX[i1] - tanX[i0], dtz = tanZ[i1] - tanZ[i0];
          const dm = Math.hypot(dtx, dtz);
          const arc = Math.hypot(line[i1 * 2] - line[i0 * 2], line[i1 * 2 + 1] - line[i0 * 2 + 1]) || 1;
          if (dm > 1e-4) {
            const radius = arc / dm;
            if (dtx * nx2 + dtz * nz2 > 0) capIn = Math.min(capIn, radius * CURVE_SAFETY);
            else capOut = Math.min(capOut, radius * CURVE_SAFETY);
          }
        }

        // One profile each way serves all 21 rows. Marching per row instead is
        // 21 independent walks over ground that has not changed.
        for (let k = 0; k < profIn.length; k++) profIn[k] = h(x + nx2 * (k * MARCH_STEP), z + nz2 * (k * MARCH_STEP)) - L;
        for (let k = 0; k < profOut.length; k++) profOut[k] = h(x - nx2 * (k * MARCH_STEP), z - nz2 * (k * MARCH_STEP)) - L;

        for (let r = 0; r < SHORE_ROWS; r++) {
          const target = rowElev[r];
          let o = 0;
          if (r !== midRow) {
            const up = target > 0;
            const prof = up ? profIn : profOut;
            const dir = up ? 1 : -1;
            let k = 1;
            for (; k < prof.length; k++) if (up ? prof[k] >= target : prof[k] <= target) break;
            if (k >= prof.length) {
              o = dir * (prof.length - 1) * MARCH_STEP;           // never got there
            } else {
              let lo = (k - 1) * MARCH_STEP, hi = k * MARCH_STEP;
              for (let it = 0; it < 8; it++) {
                const mid = (lo + hi) * 0.5;
                const v = h(x + nx2 * dir * mid, z + nz2 * dir * mid) - L;
                if (up ? v >= target : v <= target) hi = mid; else lo = mid;
              }
              o = dir * (lo + hi) * 0.5;
            }
            o = Math.max(-capOut, Math.min(capIn, o));
          }
          off[i * SHORE_ROWS + r] = o;
        }
        stats.points++;
      }

      // ---- phase 2: bound how fast a row may move in or out along the shore --
      //
      // Measured, and it is the one thing between this and a ribbon that folds:
      // a berm that appears over one 4 m step moves a row nine metres inland in
      // that step, and the quad it makes is inside-out. The elevation target is
      // still what *chooses* the offset; this only refuses to let two
      // neighbouring choices be further apart than the step between them, which
      // is exactly the Lipschitz condition that keeps the strip's along-shore
      // edge pointing forward. Sweeping both ways makes the bound symmetric —
      // one sweep drags every discontinuity in the direction it happened to run.
      const maxSlope = LIPSCHITZ * dsHere;
      for (let pass = 0; pass < 2; pass++) {
        for (let r = 0; r < SHORE_ROWS; r++) {
          for (let k = 1; k < m + (c.closed ? 1 : 0); k++) {
            const i = k % m, j = (k - 1 + m) % m;
            const d = off[i * SHORE_ROWS + r] - off[j * SHORE_ROWS + r];
            if (d > maxSlope) off[i * SHORE_ROWS + r] = off[j * SHORE_ROWS + r] + maxSlope;
            else if (d < -maxSlope) off[i * SHORE_ROWS + r] = off[j * SHORE_ROWS + r] - maxSlope;
          }
          for (let k = m - 2 + (c.closed ? 0 : 0); k >= (c.closed ? -1 : 0); k--) {
            const i = (k + m) % m, j = (k + 1) % m;
            const d = off[i * SHORE_ROWS + r] - off[j * SHORE_ROWS + r];
            if (d > maxSlope) off[i * SHORE_ROWS + r] = off[j * SHORE_ROWS + r] + maxSlope;
            else if (d < -maxSlope) off[i * SHORE_ROWS + r] = off[j * SHORE_ROWS + r] - maxSlope;
          }
        }
      }

      // ---- phase 3: emit ----------------------------------------------------
      const base = pos.length / 3;
      for (let i = 0; i < m; i++) {
        const x = line[i * 2], z = line[i * 2 + 1];
        const nx2 = nrmX[i], nz2 = nrmZ[i];
        const arc = i * dsHere;
        for (let r = 0; r < SHORE_ROWS; r++) {
          const o = off[i * SHORE_ROWS + r];
          const px = x + nx2 * o, pz = z + nz2 * o;
          const hh = h(px, pz);
          // A flat five-centimetre lift and `polygonOffset`, and NOT the
          // clipmap's drawn envelope.
          //
          // The envelope is the right idea and it was measurably the wrong
          // answer here. It lifts a decal onto the highest surface the clipmap
          // can rasterise, which is what an apron or a graded pad wants — but it
          // is a *per-ring* quantity, it jumped by up to the 0.9 m clamp between
          // one shore point and its neighbour, and the ribbon came back as a
          // scatter of white plates hovering over the beach with their own
          // shadows under them. A shoreline is a thin band viewed edge-on; five
          // centimetres and a depth bias is all it can afford, and past the
          // range where the rings coarsen enough to swallow it the band has
          // already faded out.
          pos.push(px, hh + 0.05, pz);
          phase.push(arc / lam[0], arc / lam[1], arc / lam[2]);
          // The elevation attribute is read back at the offset that survived the
          // slope bound, not at the one the target asked for. A shader told the
          // ground is at +0.35 m when it is at +0.9 m paints the swash on dry
          // sand, and no capture would say which of the two lied.
          shore.push(hh - L, o, pale[i]);
        }
      }

      // Index. The inner loop steps a row (+v, seaward -> inland), the outer
      // steps along the shore (+u).
      //
      // The handedness cannot be a constant, and finding that out is what the
      // orientation assert is for. Marching squares winds every chain with the
      // same side "inside", but "inland" is decided by which side the ground is
      // higher on — so a lake's outer shore and an island *inside* that lake
      // come out with opposite handedness, from one trace, in one basin.
      const cols = c.closed ? m : m - 1;
      if (flip) flipped++;
      // Verify the vote against the geometry, at the place the geometry is
      // least ambiguous: the widest quad in the chain. Not the first one — the
      // first is as likely as any to be a pinch, where the frame is collapsed
      // and carries no sign at all. The two sides of this check come from
      // different data (the vote from heights either side of the line, the quad
      // from the positions actually written), so it is a real test of the claim
      // `flip = side > 0` and not a restatement of it.
      const gv = (i: number) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      let bestA = 0, bestI = -1, bestR = 0;
      for (let i = 0; i + 1 < m; i++) {
        for (let r = 0; r + 1 < SHORE_ROWS; r++) {
          const k = base + i * SHORE_ROWS + r;
          const ux = pos[(base + (i + 1) * SHORE_ROWS + r) * 3] - pos[k * 3];
          const uz = pos[(base + (i + 1) * SHORE_ROWS + r) * 3 + 2] - pos[k * 3 + 2];
          const vx = pos[(k + 1) * 3] - pos[k * 3], vz = pos[(k + 1) * 3 + 2] - pos[k * 3 + 2];
          const a = Math.abs(uz * vx - ux * vz);
          if (a > bestA) { bestA = a; bestI = i; bestR = r; }
        }
      }
      if (bestI >= 0) {
        const o = gv(base + bestI * SHORE_ROWS + bestR);
        const du = gv(base + (bestI + 1) * SHORE_ROWS + bestR).sub(o);
        const dv = gv(base + bestI * SHORE_ROWS + bestR + 1).sub(o);
        assertCardOrientation('shore ribbon chain', o, flip ? dv : du, flip ? du : dv, WORLD_UP);
      }

      // Emit, rejecting any triangle that comes out face-down.
      //
      // This is not a tolerance and it is not a way of quieting the assert. A
      // ribbon that follows a real coastline pinches: a berm that vanishes over
      // one 4 m step, two headlands whose inland marches meet, a tarn whose
      // seaward rows converge on its middle. Every clamp above pushes that rate
      // down and none of them can take it to zero, because the constraint is
      // global (no two marched rays may cross anywhere) and the clamps are
      // local. Two triangles missing from a 21-row band is invisible; two
      // triangles inside-out is a black flap. So the fold is DROPPED and
      // COUNTED, `assertUpward` still demands a clean buffer at the end, and a
      // chain that loses a quarter of itself is a handedness bug rather than a
      // pinch and throws.
      let folded = 0, degenerate = 0, kept = 0;
      // Rounded to float32 first, because that is what the attribute will hold.
      // Measured: without the rounding one triangle in 197 550 flipped sign
      // between the float64 test here and the float32 buffer the assert reads,
      // and `assertUpward` caught exactly that one. A test run at a different
      // precision from the data is not a test of the data.
      const f = Math.fround;
      const tri = (i0: number, i1: number, i2: number) => {
        const ax = f(pos[i0 * 3]), az = f(pos[i0 * 3 + 2]);
        const ux = f(pos[i1 * 3]) - ax, uz = f(pos[i1 * 3 + 2]) - az;
        const vx = f(pos[i2 * 3]) - ax, vz = f(pos[i2 * 3 + 2]) - az;
        const ny = uz * vx - ux * vz;                     // the +Y component only
        // Two very different things live under "not front-facing", and lumping
        // them was hiding the answer: a quad whose two rows both hit the same
        // clamp has ZERO area and is not wound backwards at all, while a quad
        // that folded has negative area and would render as a flap. The first is
        // the normal, expected consequence of a march that ran out of room in a
        // creek; the second is the defect. Counting them together reported 16%
        // "folding" on a ribbon that had almost none.
        if (ny < -AREA_FLOOR) { folded++; return; }
        if (ny <= AREA_FLOOR) { degenerate++; return; }
        idx.push(i0, i1, i2); kept++;
      };
      for (let i = 0; i < cols; i++) {
        const a0 = base + i * SHORE_ROWS;
        const b0 = base + ((i + 1) % m) * SHORE_ROWS;
        for (let r = 0; r < SHORE_ROWS - 1; r++) {
          if (flip) {
            tri(a0 + r, b0 + r + 1, b0 + r);
            tri(a0 + r, a0 + r + 1, b0 + r + 1);
          } else {
            tri(a0 + r, b0 + r, b0 + r + 1);
            tri(a0 + r, b0 + r + 1, a0 + r + 1);
          }
        }
      }
      stats.folded += folded;
      stats.degenerate += degenerate;
      stats.kept += kept;
      if (opts.debug) {
        (stats.chainRows || (stats.chainRows = [])).push({
          x: +line[0].toFixed(0), z: +line[1].toFixed(0), m, closed: c.closed, vote: +vote.toFixed(0), folded, degenerate, kept,
        });
      }
      // The chain-level gate: is this chain built backwards?
      //
      // The rate had to be measured rather than picked, and my first guess of 3%
      // was wrong in the direction that matters. A **reversed** chain folds
      // essentially all of itself — the river strip, wound backwards, came out
      // at 61 474 folds against 331 kept — while a real coastline pinches at a
      // few tenths of a per cent globally and, on a nineteen-point pond, at
      // 4.4%. Three per cent failed the pond and would still have failed at ten.
      // 35% cannot be reached by pinching and cannot be missed by a reversal.
      //
      // Blind to: a chain that is *half* reversed. Nothing here produces one —
      // handedness is decided once per chain from a vote over the whole chain —
      // but if that ever changes this gate will not see it.
      //
      // Degenerate quads are deliberately not counted: a creek narrow enough to
      // collapse every row is a real thing and it is not a bug.
      if (!opts.debug && folded > (folded + kept) * 0.35) {
        throw new Error(`shore ribbon: chain at (${line[0].toFixed(0)}, ${line[1].toFixed(0)}) folded ${folded} of ${folded + kept} triangles. That is a handedness bug, not a pinch — check the inland vote (${vote.toFixed(1)}) and the row order.`);
      }
    }
  }

  if (!idx.length) { stats.ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0; return { geometry: null, stats }; }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 3));
  geo.setAttribute('aShore', new THREE.Float32BufferAttribute(shore, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  assertAttributes('shore ribbon', geo, ['position', 'aPhase', 'aShore']);

  // The gate, on the final index buffer, every triangle, after every clamp,
  // rejection and merge above.
  //
  // World up is the right reference: the ribbon is cut from a heightfield and a
  // heightfield cannot overhang, so a correctly wound triangle always has a
  // positive Y component. A per-vertex terrain normal would be *weaker* here —
  // it forgives a fan that has folded back on itself on a steep bank.
  //
  // Nor is this a restatement of the per-triangle test at emit. That one runs on
  // float64 working values; this one runs on the float32 the attribute actually
  // holds, and the first time the two were run at different precisions this
  // found one triangle in 197 550 that had changed sign between them.
  stats.downFacing = downFacing(geo).downFacing;
  stats.flippedChains = flipped;
  assertUpward(geo, 'shore ribbon');
  stats.vertices = pos.length / 3;
  stats.triangles = idx.length / 3;
  snapDists.sort((a, b) => a - b);
  if (snapDists.length) {
    stats.snapMedian = +snapDists[snapDists.length >> 1].toFixed(4);
    stats.snapMax = +snapDists[snapDists.length - 1].toFixed(4);
  }
  stats.metres = Math.round(stats.metres);
  stats.ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
  return { geometry: geo, stats };
}
