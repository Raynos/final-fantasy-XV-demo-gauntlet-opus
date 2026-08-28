import * as THREE from 'three';
import { assertAttributes } from './geo.ts';
import { assertUpward, downFacing, assertConsistentWinding } from '../../util/GeoAssert.ts';
import type { ErosionSample } from '../terrain/Field.ts';

/**
 * Channel-fitted river strips — plan §6.2.
 *
 * `docs/SCOPE.md` has wanted rivers for as long as it has existed and we have
 * never had one. What made it possible now is §4.2: the bake cuts real channels
 * into the heightfield off the droplet accumulation field — 800 266 cells, 18.6%
 * of the grid, mean 2.10 m and up to 9.0 m deep — so there is somewhere for a
 * river to *be*. A strip laid on the pre-incision terrain was a blue ribbon
 * pasted across a hillside.
 *
 * ### The strip is fitted to the channel, not stamped over it
 *
 * The source's own post-mortem on its first attempt: a constant-width slab
 * *"spent most of its lanes on ground metres above the water"*. So every station
 * bisects the heightfield for its own two waterlines and its own two bank tops,
 * and the lanes are then budgeted across what it found — a fixed count across
 * the water and a fixed count across each bank, whatever those widths turn out
 * to be. A four-metre creek and a thirty-metre reach get the same number of
 * lanes and both spend all of them on water.
 *
 * ### Two surfaces, and the bank is a decal
 *
 * The water surface sits at the reach's water level and is displaced by the
 * shared wave field. The banks are a **lifted terrain decal** — the bed plus six
 * centimetres, following the ground exactly. The source tried a flat sheet
 * across the bank and had **43% of the wet band depth-clipped** by the terrain
 * it was supposed to be lying on. Ours follows the ground and is biased in the
 * depth buffer instead; the clipmap's drawn envelope is the wrong lift for a
 * thin band viewed edge-on and `emitBank` says why.
 *
 * ### Routing follows the drainage, so tributaries merge where the water does
 *
 * `Terrain.erosionAt` gives `accum` as a **percentile** of the cells that carry
 * any water, and `flowX/flowZ` as the unit steepest descent taken live off the
 * 4 m height gradient. A reach is traced by walking that field downhill from a
 * high-accumulation source; when one trace comes within a channel width of
 * another it is truncated there. Confluences are therefore where the drainage
 * says they are, not where a spline author put them.
 *
 * `sampleMaterial().flow` is the wrong channel for this and the mistake is
 * documented on `Terrain.erosionAt`: it is blurred and log-normalised for a
 * shader, and reads above 0.2 on 46.4% of the world where the raw field is
 * exactly zero on 31.5%.
 */

/** What a river builder needs of the ground. */
export interface RiverGround {
  heightAt(x: number, z: number): number;
  erosionAt(x: number, z: number, out?: ErosionSample): ErosionSample;
  drawnEnvelope?(x: number, z: number, size?: number, viewCell?: number): number;
}

/** One traced reach, before it becomes geometry. */
export interface Reach {
  /** Flat xz pairs, uniform arc length. */
  pts: number[];
  /** Water surface height per station. */
  wsl: number[];
  /** Bed height at the thalweg per station. */
  bed: number[];
  /** Discharge proxy 0..1 per station. */
  q: number[];
  /** Froude number per station. */
  froude: number[];
  /** Half-widths: left/right waterline and left/right bank top, metres. */
  wl: number[];
  wr: number[];
  bl: number[];
  br: number[];
  /** Where this reach joined another, or -1. */
  joinedInto: number;
}

/**
 * One confluence, in the numbers that say whether it reads as one.
 *
 * A junction that is topologically correct and visually a T of two equal
 * ribbons is not a confluence, so what this records is the SIZE on both sides
 * of it: the trunk above, the tributary arriving, and the trunk below.
 */
export interface RiverJoin {
  /** Where, in world xz. */
  x: number;
  z: number;
  /** Angle the tributary arrives at, degrees; 0 would be running alongside. */
  angleDeg: number;
  /** Trunk surface width above the junction, the tributary's, and below. */
  widthAbove: number;
  widthTrib: number;
  widthBelow: number;
  /** Trunk depth above the junction and below, metres. */
  depthAbove: number;
  depthBelow: number;
  /** Metres of unique channel the tributary contributed before it landed. */
  tribMetres: number;
  /** Metres of trunk left below the junction. */
  belowMetres: number;
  /** The discharge proxy on each arm: trunk above, tributary, trunk below. */
  qAbove: number;
  qTrib: number;
  qBelow: number;
}

/** What the build measured. */
export interface RiverStats {
  sources: number;
  reaches: number;
  /** Reaches dropped for being too short to read as a river. */
  dropped: number;
  stations: number;
  /** Total channel length, metres. */
  metres: number;
  confluences: number;
  /** Meander loops spliced out because the line came back inside its own width. */
  oxbows: number;
  /** Channel metres those loops were carrying. */
  oxbowMetres: number;
  meanWidth: number;
  maxWidth: number;
  meanDepth: number;
  maxDepth: number;
  waterTris: number;
  bankTris: number;
  folded: number;
  degenerate: number;
  downFacing: number;
  ms: number;
}

/** Station spacing along the channel, metres. Also sets the Nyquist floor. */
export const STATION = 3.0;
/** Lanes across the water, waterline to waterline. */
export const WATER_LANES = 11;
/** Lanes across each bank, waterline to bank top. */
export const BANK_LANES = 5;
/** Shortest reach worth drawing. */
const MIN_REACH = 180;
/** Longest a single trace may run before it is cut. */
const MAX_REACH = 2600;
/** Half-width the waterline search will walk before giving up. */
const MAX_HALF = 32;
/** Extra metres past the waterline the bank-top search will walk. */
const MAX_BANK = 13;
/** Bound on how fast a lane may move per metre of channel; see `Shore.ts`. */
const LIPSCHITZ = 0.6;
/**
 * Stations a loop must span before `cutOxbows` will call it a loop.
 *
 * 20 stations is 60 m of channel. Below that a line coming back inside its own
 * width is a tight meander, which is a river; above it, it is a spiral.
 */
const MIN_LOOP = 20;
/**
 * Stations a tributary's water is ramped into its trunk over — 12 is 36 m.
 *
 * The junction is a real step in discharge and it should show, but the water
 * surface is monotone-clamped downstream and a single-station step in `q` is
 * simply erased by that clamp. Over a dozen stations the bed has fallen enough
 * to carry it.
 */
const JOIN_RAMP = 12;
/**
 * Ceiling on the summed discharge proxy.
 *
 * 1.6 is `halfWidthCap` 24.9 m, a 50 m channel, against the widest unmerged
 * reach on this map at 28.3 m. Above that the sheet is a lake, and the map does
 * not have the catchment for one.
 */
const Q_MAX = 1.6;
/** Fraction of the lateral offset to the wettest cell the walk takes per step. */
const NET_PULL = 0.55;
/** Metres either side the walk looks for that cell. */
const NET_REACH = 14;
/** Metres of fall per 120 m below which the walk is called stalled. */
const STALL_DROP = 0.3;
/** …unless `accum` here is at least this, in which case there is still a channel. */
const STALL_ON_NET = 0.90;
const AREA_FLOOR = 1e-7;

/** Options; `level` is the sea surface, where a reach stops. */
export interface RiverOpts {
  level: number;
  /** World half-extent to search for sources. */
  half: number;
  /** How many reaches to trace at most. Default 10. */
  maxReaches?: number;
  /** Accumulation percentile a source must beat. */
  sourceAccum?: number;
  /**
   * Metres two sources must be kept apart.
   *
   * It is the knob that decides whether this world can have a confluence at
   * all, so it is an option rather than a literal. At the original 700 m the
   * seven traces' *closest* approach to one another was **782 m** — no two of
   * them came within thirty times the truncation radius, so the join logic
   * below was unreachable code from the day it was written. Default 260, with
   * `maxReaches` 10: the smallest pair of numbers on this map that gives two
   * confluences, both of which come out wider below than either arm above.
   */
  sourceSep?: number;
  /**
   * Ablation control: set false to route confluences but NOT sum their
   * discharge, so a probe can price the summation on its own. Default true.
   */
  sumDischarge?: boolean;
  /**
   * Metres of trunk that must survive below a junction for it to count as a
   * confluence. Default 90.
   */
  minJoinRun?: number;
  debug?: boolean;
}

/**
 * Trace the drainage into a set of reaches.
 *
 * Sources are the highest-accumulation cells on a coarse scan, kept apart so two
 * of them are not the same river twice. From each, the walk follows the unit
 * steepest descent in 10 m steps and stops at the sea, at the world edge, or
 * where the ground has stopped falling — a pit, which on an eroded heightfield
 * means a basin, and a basin is a lake's job rather than a river's.
 */
export function traceReaches(ground: RiverGround, opts: RiverOpts): { reaches: Reach[], stats: Partial<RiverStats> } {
  const half = opts.half;
  const maxR = opts.maxReaches ?? 10;
  const minAccum = opts.sourceAccum ?? 0.93;
  const sep2 = (opts.sourceSep ?? 260) ** 2;
  const e: ErosionSample = { accum: 0, deposit: 0, scree: 0, wet: 0, rock: 0, flowX: 0, flowZ: 0 };

  // Coarse scan for candidate sources.
  const GRID = 56;
  const n = Math.floor((half * 2) / GRID);
  const cands: { x: number, z: number, a: number, h: number }[] = [];
  for (let j = 1; j < n - 1; j++) {
    for (let i = 1; i < n - 1; i++) {
      const x = -half + (i + 0.5) * GRID, z = -half + (j + 0.5) * GRID;
      const h = ground.heightAt(x, z);
      // Upland only. A high-accumulation cell at sea level is the mouth of
      // somebody else's river, and tracing from it produces a two-step stub.
      if (h < 70) continue;
      ground.erosionAt(x, z, e);
      if (e.accum < minAccum) continue;
      cands.push({ x, z, a: e.accum, h });
    }
  }
  cands.sort((a, b) => (b.a * 40 + b.h * 0.01) - (a.a * 40 + a.h * 0.01));

  const sources: { x: number, z: number }[] = [];
  for (const c of cands) {
    if (sources.length >= maxR) break;
    let ok = true;
    for (const s of sources) if ((s.x - c.x) ** 2 + (s.z - c.z) ** 2 < sep2) { ok = false; break; }
    if (ok) sources.push({ x: c.x, z: c.z });
  }

  /**
   * The walk. Three things it needs that a naive one does not, all measured on
   * this map with five real sources:
   *
   * - **Inertia.** Steepest descent alone wanders: 3200 m of walking for 21 m
   *   of fall, because in an incised channel the 4 m gradient points at the
   *   *thalweg*, not downstream, so the step crosses the channel, is turned
   *   round, and crosses back. Blending 65% of the previous direction in takes
   *   the same five sources to 928 m for 173 m of fall.
   * - **Thalweg recentring**, half a step toward the lowest ground across the
   *   channel each step. On top of inertia: 1018 m for 236 m.
   * - **A stall window of fifteen steps.** Judged over five it fires on the
   *   flat inside of a meander, which is not a stall, it is a bend.
   */
  const STEP = 8;
  const INERTIA = 0.65;
  const raw: number[][] = [];
  for (const s of sources) {
    const path: number[] = [];
    let x = s.x, z = s.z, dx = 0, dz = 0;
    let lastDrop = ground.heightAt(x, z);
    let stale = 0;
    for (let k = 0; k < MAX_REACH / STEP; k++) {
      path.push(x, z);
      const h = ground.heightAt(x, z);
      if (h < opts.level + 0.8) break;                    // reached the sea
      if (Math.max(Math.abs(x), Math.abs(z)) > half - 60) break;
      ground.erosionAt(x, z, e);
      const m = Math.hypot(e.flowX, e.flowZ);
      if (m < 1e-6) break;                                // flat: nothing to follow
      let ndx = e.flowX / m, ndz = e.flowZ / m;
      if (k > 0) {
        ndx = dx * INERTIA + ndx * (1 - INERTIA);
        ndz = dz * INERTIA + ndz * (1 - INERTIA);
        const l = Math.hypot(ndx, ndz) || 1; ndx /= l; ndz /= l;
      }
      dx = ndx; dz = ndz;
      x += dx * STEP; z += dz * STEP;
      const px = -dz, pz = dx;
      let best = Infinity, bestT = 0;
      for (let t = -7; t <= 7; t += 1) {
        const hh = ground.heightAt(x + px * t, z + pz * t);
        if (hh < best) { best = hh; bestT = t; }
      }
      x += px * bestT * 0.55; z += pz * bestT * 0.55;
      // **And half a step toward the drainage network**, which is not the same
      // place as the lowest ground across the channel and is the thing a
      // tributary has to stay on to find its trunk. Measured over 24 sources:
      // 17 of them stalled, and they stalled with a mean `accum` of 0.78 and
      // individual ends at 0.24, 0.40 and 0.47 — the walk had left the network
      // and was on an open hillside, where of course the ground stops falling.
      // With this term: stalls 17 -> 13, mean trace 814 -> 1 230 m, and pairs of
      // traces that come within a channel width of each other 6 -> 8.
      if (NET_PULL > 0) {
        let bA = -1, bT = 0;
        for (let t = -NET_REACH; t <= NET_REACH; t += 1) {
          ground.erosionAt(x + px * t, z + pz * t, e);
          if (e.accum > bA) { bA = e.accum; bT = t; }
        }
        x += px * bT * NET_PULL; z += pz * bT * NET_PULL;
      }
      if (k % 15 === 14) {
        // A reach on a floodplain falls slowly and is still a reach. The stall
        // test is there to catch a walk that has wandered off into a hollow, so
        // it asks whether the walk is still ON the network before it fires.
        ground.erosionAt(x, z, e);
        if (lastDrop - h < STALL_DROP && e.accum < STALL_ON_NET) {
          stale++; if (stale >= 2) break;
        } else stale = 0;
        lastDrop = h;
      }
    }
    raw.push(path);
  }
  return { reaches: raw.map(toReach), stats: { sources: sources.length } };

  function toReach(p: number[]): Reach {
    return { pts: p, wsl: [], bed: [], q: [], froude: [], wl: [], wr: [], bl: [], br: [], joinedInto: -1 };
  }
}

/** Move each point to the lowest ground across the channel — the thalweg. */
function snapThalweg(pts: number[], ground: RiverGround, reach: number) {
  const m = pts.length / 2;
  const out = pts.slice();
  for (let i = 0; i < m; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(m - 1, i + 1);
    let tx = pts[i1 * 2] - pts[i0 * 2], tz = pts[i1 * 2 + 1] - pts[i0 * 2 + 1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    const nx = -tz, nz = tx;
    let best = Infinity, bestT = 0;
    for (let t = -reach; t <= reach; t += 1) {
      const h = ground.heightAt(pts[i * 2] + nx * t, pts[i * 2 + 1] + nz * t);
      if (h < best) { best = h; bestT = t; }
    }
    out[i * 2] = pts[i * 2] + nx * bestT;
    out[i * 2 + 1] = pts[i * 2 + 1] + nz * bestT;
  }
  return out;
}

/** Three-tap smoothing of a flat xz polyline, endpoints pinned. */
function smoothLine(pts: number[], passes: number) {
  const out = pts.slice();
  const m = pts.length / 2;
  for (let p = 0; p < passes; p++) {
    const src = out.slice();
    for (let i = 1; i < m - 1; i++) {
      out[i * 2] = src[(i - 1) * 2] * 0.25 + src[i * 2] * 0.5 + src[(i + 1) * 2] * 0.25;
      out[i * 2 + 1] = src[(i - 1) * 2 + 1] * 0.25 + src[i * 2 + 1] * 0.5 + src[(i + 1) * 2 + 1] * 0.25;
    }
  }
  return out;
}

/** Resample a polyline at a uniform arc-length step. */
function resample(pts: number[], step: number): number[] {
  const out: number[] = [];
  let acc = 0, want = 0;
  for (let i = 0; i + 3 < pts.length; i += 2) {
    const ax = pts[i], az = pts[i + 1], bx = pts[i + 2], bz = pts[i + 3];
    const L = Math.hypot(bx - ax, bz - az);
    while (want <= acc + L + 1e-9) {
      const t = L < 1e-9 ? 0 : (want - acc) / L;
      out.push(ax + (bx - ax) * t, az + (bz - az) * t);
      want += step;
    }
    acc += L;
  }
  return out;
}

/**
 * Discharge proxy per station, the one number the whole channel is sized from.
 *
 * `accum` is a percentile of the cells that carry water, so this reads "wetter
 * than 88% of them" rather than any absolute discharge — the property that
 * makes it survive a change of resolution or of erosion tuning. It is a proxy
 * and it is named one.
 *
 * Discharge also GROWS downstream, and leaving that out was visible: the
 * percentile is already high at the source of a traced reach, so every river
 * came out full width from its first metre and a headwater looked like an
 * estuary. A river gathers its catchment as it runs.
 *
 * Smoothed, because the percentile field is noisy at 3 m and a river that
 * changes width every station reads as a rope, not as water.
 */
function dischargeAlong(p: number[], ground: RiverGround, e: ErosionSample): Float64Array {
  const m = p.length / 2;
  const q = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    ground.erosionAt(p[i * 2], p[i * 2 + 1], e);
    const grow = 0.12 + 0.88 * Math.min(1, (i * STATION) / 850);
    q[i] = Math.min(grow, Math.max(0, Math.min(1, (e.accum - 0.88) / 0.115)));
  }
  for (let pass = 0; pass < 6; pass++) {
    const s = Float64Array.from(q);
    for (let i = 1; i < m - 1; i++) q[i] = s[i - 1] * 0.25 + s[i] * 0.5 + s[i + 1] * 0.25;
  }
  return q;
}

/**
 * The widest half-width this station's discharge can pay for.
 *
 * The bound `emitWater` actually draws to — `firstCrossing` is capped by it on
 * four stations in five — so it is also the right radius for asking whether two
 * pieces of channel are the *same* piece of channel.
 */
function halfWidthCap(q: number): number { return Math.min(MAX_HALF, 2.5 + 14.0 * q); }

/**
 * Cut the oxbows out of one traced line.
 *
 * **This, not two rivers crossing, is what the overlapping translucent panels
 * in `tmp/shots/t3riv-f2/r-pmax.jpg` are.** Measured on the built sheet before
 * this existed: the seven reaches' *closest approach to one another* was 782 m,
 * so no two of them so much as saw each other — but four of the seven crossed
 * **themselves**, 3 060 station pairs at least 60 m apart in arc length yet
 * inside their own combined half-widths, the tightest of them overlapping by
 * 25 m. Reach 1 ran 1 389 m of channel between points 425 m apart (sinuosity
 * 3.27) and reach 3 ran 303 m between points **32 m** apart (sinuosity 9.37):
 * an inertial walk spiralling in a hollow, laying its own ribbon over itself
 * three and four deep.
 *
 * A real river in that situation does not stack. It **cuts the neck** and
 * abandons the loop, which is where oxbow lakes come from. So do we: take the
 * earliest station that comes back inside its own channel, find the LAST
 * station that does, and splice the loop out. Repeated, because one line can
 * hold several.
 *
 * The radius is the discharge cap rather than a constant, because that is the
 * width the sheet is actually drawn to.
 */
function cutOxbows(pts: number[], hw: Float64Array): { pts: number[], cuts: number, removed: number } {
  let p = pts, w = hw, cuts = 0, removed = 0;
  for (let guard = 0; guard < 12; guard++) {
    const m = p.length / 2;
    let ci = -1, cj = -1;
    scan:
    for (let i = 0; i < m; i++) {
      for (let j = m - 1; j > i + MIN_LOOP; j--) {
        const dx = p[i * 2] - p[j * 2], dz = p[i * 2 + 1] - p[j * 2 + 1];
        const r = w[i] + w[j];
        if (dx * dx + dz * dz < r * r) { ci = i; cj = j; break scan; }
      }
    }
    if (ci < 0) break;
    const np: number[] = [];
    const nw: number[] = [];
    for (let k = 0; k <= ci; k++) { np.push(p[k * 2], p[k * 2 + 1]); nw.push(w[k]); }
    for (let k = cj + 1; k < m; k++) { np.push(p[k * 2], p[k * 2 + 1]); nw.push(w[k]); }
    cuts++; removed += cj - ci;
    p = np; w = Float64Array.from(nw);
  }
  // The neck is a chord of up to two channel widths, so the spliced line has one
  // long segment in it; put the uniform arc length back before anything measures
  // a station spacing.
  return { pts: cuts ? resample(p, STATION) : p, cuts, removed };
}

/** First crossing of `h == target` walking out along `n`, then bisected. */
function firstCrossing(ground: RiverGround, x: number, z: number, nx: number, nz: number, target: number, maxD: number, step = 0.5): number {
  let prev = 0;
  for (let t = step; t <= maxD; t += step) {
    if (ground.heightAt(x + nx * t, z + nz * t) >= target) {
      let lo = prev, hi = t;
      for (let k = 0; k < 8; k++) {
        const mid = (lo + hi) * 0.5;
        if (ground.heightAt(x + nx * mid, z + nz * mid) >= target) hi = mid; else lo = mid;
      }
      return (lo + hi) * 0.5;
    }
    prev = t;
  }
  return maxD;
}

/** Bound how fast a per-station width may change, both directions. */
function limitSlope(a: number[], ds: number) {
  const cap = LIPSCHITZ * ds;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < a.length; i++) a[i] = Math.max(a[i - 1] - cap, Math.min(a[i - 1] + cap, a[i]));
    for (let i = a.length - 2; i >= 0; i--) a[i] = Math.max(a[i + 1] - cap, Math.min(a[i + 1] + cap, a[i]));
  }
}

/**
 * Build every river in the world as two merged meshes: water and bank.
 *
 * @returns geometries and the measured build, or nulls when nothing traced
 */
export function buildRivers(ground: RiverGround, opts: RiverOpts) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const stats: RiverStats = {
    sources: 0, reaches: 0, dropped: 0, stations: 0, metres: 0, confluences: 0,
    oxbows: 0, oxbowMetres: 0,
    meanWidth: 0, maxWidth: 0, meanDepth: 0, maxDepth: 0,
    waterTris: 0, bankTris: 0, folded: 0, degenerate: 0, downFacing: 0, ms: 0,
  };
  const traced = traceReaches(ground, opts);
  stats.sources = traced.stats.sources ?? 0;
  const e: ErosionSample = { accum: 0, deposit: 0, scree: 0, wet: 0, rock: 0, flowX: 0, flowZ: 0 };

  // Centre, smooth, re-centre, resample. Smoothing alone slides the line up the
  // bank; re-snapping to the lowest ground puts it back in the channel. It is
  // the same argument as the shoreline's bisection re-snap, one dimension over.
  const lines: number[][] = [];
  for (const r of traced.reaches) {
    if (r.pts.length < 8) { stats.dropped++; continue; }
    let p = snapThalweg(r.pts, ground, 14);
    p = smoothLine(p, 3);
    p = snapThalweg(p, ground, 6);
    p = smoothLine(p, 2);
    p = resample(p, STATION);
    if (p.length / 2 < MIN_REACH / STATION) { stats.dropped++; continue; }
    // A river does not run over itself. See `cutOxbows`.
    const cut = cutOxbows(p, Float64Array.from(dischargeAlong(p, ground, e), halfWidthCap));
    stats.oxbows += cut.cuts;
    stats.oxbowMetres += Math.round(cut.removed * STATION);
    p = cut.pts;
    if (p.length / 2 < MIN_REACH / STATION) { stats.dropped++; continue; }
    lines.push(p);
  }

  /**
   * Confluences: a tributary stops where it reaches the trunk's waterline, and
   * hands the trunk its water.
   *
   * **Longest first, and that ordering is the whole rule about which one
   * survives.** Whichever line is accepted first keeps running past the
   * junction; the other is truncated at it. Accepting in trace order picks by
   * source accumulation, which on this map put a 300 m stub ahead of a 1.3 km
   * trunk and would have cut the trunk in half at its own tributary's mouth.
   * Channel length is the available proxy for catchment.
   *
   * **The meeting radius is the two channels' own half-widths, not a constant.**
   * A fixed 26 m left the tributary's mouth up to twenty metres short of water
   * it was supposed to be flowing into. Tangent edges make one wetted surface.
   */
  lines.sort((a, b) => b.length - a.length);
  const accepted: number[][] = [];
  const hwOf: Float64Array[] = [];
  /** For each accepted reach: which reach it flows into, and at which station. */
  const trunkOf: number[] = [];
  const trunkStation: number[] = [];
  for (const p of lines) {
    const hw = Float64Array.from(dischargeAlong(p, ground, e), halfWidthCap);
    let cut = p.length / 2, tk = -1, ts = -1;
    for (let a = 0; a < accepted.length; a++) {
      const t = accepted[a], th = hwOf[a], tn = t.length / 2;
      for (let i = 0; i < cut; i++) {
        let bj = -1, bd = Infinity;
        for (let j = 0; j < tn; j++) {
          const dx = p[i * 2] - t[j * 2], dz = p[i * 2 + 1] - t[j * 2 + 1];
          const d = dx * dx + dz * dz;
          if (d < bd) { bd = d; bj = j; }
        }
        const r = hw[i] + th[bj];
        if (bd < r * r) { cut = i; tk = a; ts = bj; break; }
      }
    }
    const t = p.slice(0, Math.max(0, cut) * 2);
    // A tributary that contributes less than a reach of its own channel before
    // it lands is not a tributary, it is the same channel traced twice from two
    // sources on it. Dropping it is deduplication, and it must not be counted
    // as a confluence.
    if (t.length / 2 < MIN_REACH / STATION) { stats.dropped++; continue; }
    // A tributary landing on the last stations of its trunk is two reaches
    // meeting end to end at the sea, not a confluence: there is no downstream
    // channel left for the summed water to be bigger in. It still truncates --
    // the sheets must not overlap -- it is just not counted, and not fed.
    if (tk >= 0 && ts >= accepted[tk].length / 2 - (opts.minJoinRun ?? 90) / STATION) { tk = -1; ts = -1; }
    if (tk >= 0) stats.confluences++;
    accepted.push(t);
    hwOf.push(hw.subarray(0, Math.max(0, cut)));
    trunkOf.push(tk);
    trunkStation.push(ts);
  }

  /**
   * Discharge is what makes a confluence mean anything, so it is summed here,
   * before any width or stage is derived from it.
   *
   * Channel width goes as the **square root** of discharge (Leopold's hydraulic
   * geometry), so the quantity that adds at a junction is width², and two equal
   * arms make a trunk 1.41× wider rather than 2×. That is what a confluence
   * looks like, and it is why summing `q` itself would have been wrong.
   *
   * **And the sum is taken in CHANNEL WIDTH, not in `q`, and that is a measured
   * choice rather than a stylistic one.** `q` is
   * `clamp((accum - 0.88) / 0.115)`, which is zero on everything below the 88th
   * percentile of wet cells — measured on the built sheet, the `accum` term is
   * what binds the discharge on **85.8%** of stations, and at both real
   * confluences on this map it is **0.00 on the arriving tributary**. Summing
   * `q²` there is arithmetically a no-op, and was: the ablation
   * (`sumDischarge: false`) produced byte-identical widths. `halfWidthCap`'s
   * 2.5 m floor is the channel a reach has when the percentile says nothing,
   * and two of those joining still make a bigger one.
   *
   * Reverse acceptance order, because a trunk is always accepted before its own
   * tributaries: by the time a reach hands its mouth discharge upward, every
   * tributary of its own has already been folded into it.
   */
  const qOf = accepted.map((p) => dischargeAlong(p, ground, e));
  for (let a = accepted.length - 1; a >= 0; a--) {
    const tk = trunkOf[a];
    if (tk < 0 || opts.sumDischarge === false) continue;
    const qa = qOf[a];
    // The mean of the last five stations, NOT `qa[qa.length - 1]`. The smoother
    // in `dischargeAlong` runs `1 .. m-2`, so the final station is the only raw
    // sample in the array; on the tributary at (-1369, -2594) it read 0 against
    // a 0.11 mean over its mouth, and the confluence added exactly nothing.
    let mouth = 0;
    for (let i = Math.max(0, qa.length - 5); i < qa.length; i++) mouth += qa[i] / Math.min(5, qa.length);
    const addW2 = halfWidthCap(mouth) ** 2;
    const qt = qOf[tk];
    // Ramped in over a few stations rather than stepped: the junction should
    // read as the channel opening out, not as one quad twice the width of its
    // neighbour. `limitSlope` bounds the drawn width anyway; this keeps the
    // WATER SURFACE, which is monotone-clamped and cannot step up, smooth too.
    for (let i = trunkStation[a]; i < qt.length; i++) {
      const ramp = Math.min(1, (i - trunkStation[a]) / JOIN_RAMP);
      const w = Math.sqrt(halfWidthCap(qt[i]) ** 2 + addW2 * ramp);
      qt[i] = Math.min(Q_MAX, Math.max(qt[i], (w - 2.5) / 14.0));
    }
  }

  const wPos: number[] = [], wUv: number[] = [], wRiver: number[] = [], wFlow: number[] = [], wIdx: number[] = [];
  const bPos: number[] = [], bUv: number[] = [], bRiver: number[] = [], bIdx: number[] = [];
  /** [folded, degenerate, kept] per mesh, so the gate can be per mesh. */
  const wFold = [0, 0, 0], bFold = [0, 0, 0];
  let widthSum = 0, depthSum = 0, widthN = 0;
  type Built = { wl: number[], wr: number[], wsl: Float64Array, bed: Float64Array, tx: Float64Array, tz: Float64Array, m: number };
  const built: (Built | undefined)[] = new Array(accepted.length);
  const joins: RiverJoin[] = [];

  for (let a = 0; a < accepted.length; a++) {
    const p = accepted[a];
    const m = p.length / 2;
    stats.reaches++;
    stats.stations += m;
    stats.metres += (m - 1) * STATION;

    const nx = new Float64Array(m), nz = new Float64Array(m);
    const tx = new Float64Array(m), tz = new Float64Array(m);
    const bed = new Float64Array(m), wsl = new Float64Array(m);
    // Already computed, and already carries every tributary's water — see the
    // confluence pass above. Recomputing it here would silently throw the
    // summed discharge away, which is the one thing a confluence is.
    const q = qOf[a];
    for (let i = 0; i < m; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(m - 1, i + 1);
      let ax = p[i1 * 2] - p[i0 * 2], az = p[i1 * 2 + 1] - p[i0 * 2 + 1];
      const l = Math.hypot(ax, az) || 1;
      tx[i] = ax / l; tz[i] = az / l;
      nx[i] = -tz[i]; nz[i] = tx[i];
      bed[i] = ground.heightAt(p[i * 2], p[i * 2 + 1]);
    }

    // Water surface.
    //
    // Built on a monotone, smoothed **bed profile** rather than by clamping the
    // surface itself. Doing it the other way round -- surface from the raw bed,
    // then a running minimum -- pins the surface to every local bump the traced
    // line crosses and the mean depth of the whole river system came out at
    // 0.34 m: a wet stain rather than water. A river bed falls downstream by
    // definition, so the running minimum belongs on the bed, and what is left
    // over is a real pool wherever the bed dips below the profile and a real
    // riffle wherever it rises through it.
    const bedMono = Float64Array.from(bed);
    for (let i = 1; i < m; i++) bedMono[i] = Math.min(bedMono[i], bedMono[i - 1]);
    for (let pass = 0; pass < 12; pass++) {
      const s = Float64Array.from(bedMono);
      for (let i = 1; i < m - 1; i++) bedMono[i] = s[i - 1] * 0.25 + s[i] * 0.5 + s[i + 1] * 0.25;
      for (let i = 1; i < m; i++) bedMono[i] = Math.min(bedMono[i], bedMono[i - 1]);
    }
    for (let i = 0; i < m; i++) wsl[i] = bedMono[i] + 0.45 + 2.20 * q[i];
    for (let i = 1; i < m; i++) wsl[i] = Math.min(wsl[i], wsl[i - 1]);
    // The surface may never sit under the ground it is drawn on.
    for (let i = 0; i < m; i++) wsl[i] = Math.max(wsl[i], bed[i] + 0.06);
    // **...and it may never rise downstream, which the line above was doing.**
    // The monotone clamp two lines up is undone by the bed clamp on every bump
    // the traced thalweg crosses, and on ground with no channel it crosses one
    // constantly. Measured on the built sheet over 1 931 consecutive in-reach
    // station pairs (`tmp/t3-river/uphill.mts`): **497 of them climbed --
    // 25.7% -- for 356 m of total ascent, with a single step of 8.17 m.** Two
    // stations in eight, water flowing up a hill.
    //
    // A bed bump does not make water run uphill. It **ponds the reach behind
    // it**, so the raise is carried back upstream instead of left as a step.
    // Bounded to a metre and a bit of backwater above the reach's own nominal
    // stage, because one bad sill must not turn a river into a lake: where the
    // bound binds, the step survives and is honest about it.
    const POND = 1.15;
    for (let i = m - 2; i >= 0; i--) {
      wsl[i] = Math.max(wsl[i],
        Math.min(wsl[i + 1], bedMono[i] + 0.45 + POND + 2.20 * q[i]));
    }

    // Waterlines and bank tops, per station, by first crossing.
    const wl = new Array<number>(m), wr = new Array<number>(m);
    const bl = new Array<number>(m), br = new Array<number>(m);
    for (let i = 0; i < m; i++) {
      const x = p[i * 2], z = p[i * 2 + 1];
      // A river's width comes from its discharge, not from how far the ground
      // happens to stay flat. Without the cap a reach crossing a pan bisects
      // its way to the full 32 m search limit on both sides and draws a
      // sixty-four metre sheet of standing water where there is a stream.
      const cap = Math.min(MAX_HALF, 2.5 + 14.0 * q[i]);
      wl[i] = firstCrossing(ground, x, z, -nx[i], -nz[i], wsl[i], cap);
      wr[i] = firstCrossing(ground, x, z, nx[i], nz[i], wsl[i], cap);
      const bankH = wsl[i] + 0.75 + 0.85 * q[i];
      // **The bank needs the same discharge cap the water has, and for exactly
      // the same reason.** `firstCrossing` walks until the ground reaches
      // `bankH`; on a valley floor it never does, so it returned the full
      // `MAX_BANK` on both sides and painted a 26 m wet apron around a 3 m
      // stream — re-introducing, in the decal, the sixty-four-metre sheet the
      // water's own cap exists to prevent. Measured on the widest reach: bank
      // half-width mean **8.08 m** against a water half-width mean of 1.75, and
      // from 13 m up it reads as a sprawl of pale angular plates with the
      // stream lost inside it. A bank is the wetted margin of a channel, so it
      // scales with the channel.
      const bankCap = Math.min(MAX_BANK, 1.2 + 5.0 * q[i]);
      bl[i] = wl[i] + firstCrossing(ground, x - nx[i] * wl[i], z - nz[i] * wl[i], -nx[i], -nz[i], bankH, bankCap);
      br[i] = wr[i] + firstCrossing(ground, x + nx[i] * wr[i], z + nz[i] * wr[i], nx[i], nz[i], bankH, bankCap);
    }
    limitSlope(wl, STATION); limitSlope(wr, STATION);
    limitSlope(bl, STATION); limitSlope(br, STATION);
    for (let i = 0; i < m; i++) { bl[i] = Math.max(bl[i], wl[i] + 0.4); br[i] = Math.max(br[i], wr[i] + 0.4); }

    // Froude number, per station. Manning gives the velocity from depth and
    // slope; Froude then says whether the reach is a pool or a rapid, and it is
    // the thing that decides where white water can exist at all.
    const froude = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      const i0 = Math.max(0, i - 3), i1 = Math.min(m - 1, i + 3);
      const slope = Math.max(1e-4, (wsl[i0] - wsl[i1]) / Math.max(1e-3, (i1 - i0) * STATION));
      const d = Math.max(0.08, wsl[i] - bed[i]);
      const v = (1 / 0.042) * Math.pow(d, 2 / 3) * Math.sqrt(slope);
      froude[i] = v / Math.sqrt(9.81 * d);
      widthSum += wl[i] + wr[i]; depthSum += d; widthN++;
      stats.maxWidth = Math.max(stats.maxWidth, wl[i] + wr[i]);
      stats.maxDepth = Math.max(stats.maxDepth, d);
    }

    built[a] = { wl, wr, wsl, bed, tx, tz, m };
    emitWater(p, m, tx, tz, nx, nz, wsl, wl, wr, froude, q);
    emitBank(p, m, nx, nz, wsl, wl, wr, bl, br, froude, -1);
    emitBank(p, m, nx, nz, wsl, wl, wr, bl, br, froude, 1);
  }

  // The confluence report. Written after the geometry so every number in it is
  // the number the sheet was actually built from, not the one it was asked for.
  for (let a = 0; a < accepted.length; a++) {
    const tk = trunkOf[a], ts = trunkStation[a];
    if (tk < 0) continue;
    const T = built[tk], A = built[a];
    if (!T || !A) continue;
    // Averaged over a 75 m window on each side rather than read off one
    // station. A single station is the local bed bump, not the reach: the first
    // version of this report sampled ts+24 and made a junction look like it
    // NARROWED the river because that one station happened to sit on a riffle.
    const win = (lo: number, hi: number) => {
      let w = 0, d = 0, n = 0;
      for (let i = Math.max(0, lo); i <= Math.min(T.m - 1, hi); i++) {
        w += T.wl[i] + T.wr[i]; d += T.wsl[i] - T.bed[i]; n++;
      }
      return n ? { w: w / n, d: d / n } : { w: 0, d: 0 };
    };
    const up = win(ts - 30, ts - 3), dn = win(ts + 3, ts + 30);
    const dot = Math.abs(A.tx[A.m - 1] * T.tx[ts] + A.tz[A.m - 1] * T.tz[ts]);
    let tw = 0;
    for (let i = Math.max(0, A.m - 10); i < A.m; i++) tw += (A.wl[i] + A.wr[i]) / Math.min(10, A.m);
    const qm = (arr: Float64Array, lo: number, hi: number) => {
      let v = 0, n = 0;
      for (let i = Math.max(0, lo); i <= Math.min(arr.length - 1, hi); i++) { v += arr[i]; n++; }
      return n ? v / n : 0;
    };
    joins.push({
      belowMetres: Math.round((T.m - 1 - ts) * STATION),
      qAbove: +qm(qOf[tk], ts - 30, ts - 3).toFixed(3),
      qTrib: +qm(qOf[a], A.m - 10, A.m - 1).toFixed(3),
      qBelow: +qm(qOf[tk], ts + 3, ts + 30).toFixed(3),
      x: +accepted[tk][ts * 2].toFixed(1),
      z: +accepted[tk][ts * 2 + 1].toFixed(1),
      angleDeg: +(Math.acos(Math.min(1, dot)) * 180 / Math.PI).toFixed(1),
      widthAbove: +up.w.toFixed(2),
      widthTrib: +tw.toFixed(2),
      widthBelow: +dn.w.toFixed(2),
      depthAbove: +up.d.toFixed(2),
      depthBelow: +dn.d.toFixed(2),
      tribMetres: Math.round((A.m - 1) * STATION),
    });
  }

  if (widthN) { stats.meanWidth = +(widthSum / widthN).toFixed(2); stats.meanDepth = +(depthSum / widthN).toFixed(2); }
  stats.maxWidth = +stats.maxWidth.toFixed(2);
  stats.maxDepth = +stats.maxDepth.toFixed(2);
  stats.metres = Math.round(stats.metres);

  const water = finish(wPos, wIdx, [['uv', wUv, 2], ['aRiver', wRiver, 3], ['aFlow', wFlow, 2]], 'river water', wFold);
  const bank = finish(bPos, bIdx, [['uv', bUv, 2], ['aRiver', bRiver, 3]], 'river bank', bFold);
  stats.waterTris = wIdx.length / 3;
  stats.bankTris = bIdx.length / 3;
  stats.downFacing = (water ? downFacing(water).downFacing : 0) + (bank ? downFacing(bank).downFacing : 0);
  stats.ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
  return { water, bank, stats, joins };

  /** Shared triangle emitter: drops folds, counts them, keeps the buffer clean. */
  function pushTri(pos: number[], idx: number[], i0: number, i1: number, i2: number) {
    const acc = pos === wPos ? wFold : bFold;
    const f = Math.fround;
    const ax = f(pos[i0 * 3]), az = f(pos[i0 * 3 + 2]);
    const ux = f(pos[i1 * 3]) - ax, uz = f(pos[i1 * 3 + 2]) - az;
    const vx = f(pos[i2 * 3]) - ax, vz = f(pos[i2 * 3 + 2]) - az;
    const ny = uz * vx - ux * vz;
    if (ny < -AREA_FLOOR) { stats.folded++; acc[0]++; return; }
    if (ny <= AREA_FLOOR) { stats.degenerate++; acc[1]++; return; }
    idx.push(i0, i1, i2); acc[2]++;
  }

  function emitWater(p: number[], m: number, tx: Float64Array, tz: Float64Array, nx: Float64Array, nz: Float64Array,
    wsl: Float64Array, wl: number[], wr: number[], froude: Float64Array, q: Float64Array) {
    const base = wPos.length / 3;
    for (let i = 0; i < m; i++) {
      const x = p[i * 2], z = p[i * 2 + 1];
      const station = i * STATION;
      for (let j = 0; j < WATER_LANES; j++) {
        const u = j / (WATER_LANES - 1);                 // 0 = left bank
        const lat = -wl[i] + (wl[i] + wr[i]) * u;
        const px = x + nx[i] * lat, pz = z + nz[i] * lat;
        const gh = ground.heightAt(px, pz);
        // **The rim, and why it is not flat.** `firstCrossing` is bounded by
        // the discharge cap, not by the terrain, and measured over all 1 744
        // stations the cap is what stops the search on **80.9%** of them. So
        // four stations in five put their outermost vertex down with the
        // ground still under the water surface -- edge depth p50 **0.50 m**,
        // p90 1.88, max 10.3, and 89.7% of the widest decile over 5 cm -- and
        // the sheet ends in a vertical wall of water with a dead straight top
        // edge. That is the "p99 hard polygonal edge", and it is not a p99: it
        // is three quarters of the river.
        //
        // Ramping the outer fifth of the sheet down onto the bed closes it.
        // The rim vertex sits ON the ground, so its `uv.y` -- signed bed depth
        // in metres, which is what the Beer-Lambert body colour reads -- is
        // zero there, and `RiverMaterial`'s alpha goes with it. Where the
        // terrain really did stop the search (the other 19%) `gh >= wsl` and
        // this is exactly a no-op.
        const rim = Math.abs(u * 2 - 1);
        const k = rim <= 0.62 ? 0 : Math.pow((rim - 0.62) / 0.38, 1.4);
        const y = k > 0 ? wsl[i] + (Math.min(gh, wsl[i]) - wsl[i]) * k : wsl[i];
        wPos.push(px, y, pz);
        // uv.y is signed bed depth in METRES, which is what the Beer-Lambert
        // body colour needs and what a normalised 0..1 cannot give: the same
        // 0.5 would mean twenty centimetres on a creek and two metres on a
        // reach, and the water would read the same colour on both.
        wUv.push(1.0 - rim, y - gh);
        wRiver.push(station, lat, froude[i]);
        wFlow.push(tx[i], tz[i]);
      }
    }
    for (let i = 0; i + 1 < m; i++) {
      for (let j = 0; j + 1 < WATER_LANES; j++) {
        const a = base + i * WATER_LANES + j, b = base + (i + 1) * WATER_LANES + j;
        // Station is +u and lane is +v, and lanes run left bank to right, so
        // (t x n)·up is -1 and the standard order would be face-down. Stated
        // here rather than discovered per triangle: a strip generator that
        // guesses its own winding is precisely the construction the plan says
        // nothing downstream can report on. The fold gate below checks it.
        pushTri(wPos, wIdx, a, b + 1, b);
        pushTri(wPos, wIdx, a, a + 1, b + 1);
      }
    }
  }

  function emitBank(p: number[], m: number, nx: Float64Array, nz: Float64Array, wsl: Float64Array,
    wl: number[], wr: number[], bl: number[], br: number[], froude: Float64Array, sideSign: number) {
    const base = bPos.length / 3;
    const inner = sideSign < 0 ? wl : wr;
    const outer = sideSign < 0 ? bl : br;
    for (let i = 0; i < m; i++) {
      const x = p[i * 2], z = p[i * 2 + 1];
      const station = i * STATION;
      // A flat six-centimetre lift and `polygonOffset`, and NOT the clipmap's
      // drawn envelope. The shore ribbon reached this conclusion on the same
      // night and this file did not get the memo: the envelope is a *per-ring*
      // quantity, it jumps by up to its own 0.9 m clamp between one station and
      // its neighbour, and a strip built on it comes back as a scatter of pale
      // plates hovering over the ground with hard straight silhouettes and
      // their own shadows under them. That is exactly what a bank decal looks
      // like from 13 m up at the widest station today. `Shore.ts` carries the
      // long form of the argument; the envelope stays right for aprons.
      for (let j = 0; j < BANK_LANES; j++) {
        const u = j / (BANK_LANES - 1);                  // 0 = waterline
        const lat = sideSign * (inner[i] + (outer[i] - inner[i]) * u);
        const px = x + nx[i] * lat, pz = z + nz[i] * lat;
        const hh = ground.heightAt(px, pz);
        bPos.push(px, hh + 0.06, pz);
        bUv.push(u, hh - wsl[i]);
        bRiver.push(station, lat, froude[i]);
      }
    }
    for (let i = 0; i + 1 < m; i++) {
      for (let j = 0; j + 1 < BANK_LANES; j++) {
        const a = base + i * BANK_LANES + j, b = base + (i + 1) * BANK_LANES + j;
        // The two banks mirror, so their windings do too: the left bank's lanes
        // run along -n and the right bank's along +n.
        if (sideSign < 0) { pushTri(bPos, bIdx, a, b, b + 1); pushTri(bPos, bIdx, a, b + 1, a + 1); }
        else { pushTri(bPos, bIdx, a, b + 1, b); pushTri(bPos, bIdx, a, a + 1, b + 1); }
      }
    }
  }

  function finish(pos: number[], idx: number[], attrs: [string, number[], number][], what: string, fold: number[]): THREE.BufferGeometry | null {
    // The gate that actually catches a reversed strip. `assertUpward` cannot:
    // the emitter DROPS face-down triangles, so a wholly reversed lattice comes
    // out as an empty buffer that passes every winding check there is. Measured
    // the hard way -- the first build of this file wound both the water and one
    // bank backwards and reported 61 474 folds against 331 kept triangles,
    // silently, with a clean assert.
    // 35%, for the reason written out on the shore ribbon's gate: a reversal
    // folds essentially everything (this very file, wound backwards, gave
    // 61 474 against 331) while real pinching runs at a couple of per cent.
    // Blind to a single reversed reach among several, because the count is per
    // mesh and every reach in a mesh shares one winding rule.
    const total = fold[0] + fold[2];
    if (total > 0 && fold[0] > total * 0.35) {
      throw new Error(`${what}: ${fold[0]} of ${total} triangles came out face-down. The lattice is wound backwards -- swap the two triangle orders for this strip, do not make the material DoubleSide.`);
    }
    if (!idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    for (const [name, arr, size] of attrs) g.setAttribute(name, new THREE.Float32BufferAttribute(arr, size));
    g.setIndex(idx);
    g.computeBoundingSphere();
    assertAttributes(what, g, ['position', ...attrs.map((a) => a[0])]);
    // On the final float32 buffer, after every clamp and rejection above.
    assertUpward(g, what);
    // The half-edge test: a patch wound inside out relative to its neighbours,
    // which a per-triangle world-up predicate cannot see and the emit-time fold
    // counter runs too early to see. Caught, never thrown -- a throw on an
    // init() path never sets GAME.ready and every tool on the machine then
    // times out with no message. console.error is still red.
    try { assertConsistentWinding(g, what); } catch (err) { console.error('[River]', err); }
    return g;
  }
}
