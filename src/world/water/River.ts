import * as THREE from 'three';
import { assertAttributes } from './geo.ts';
import { assertUpward, downFacing } from '../../util/GeoAssert.ts';
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
 * it was supposed to be lying on. Ours takes the same lesson twice over: the
 * lift is measured against the clipmap's *upper* drawn envelope, not against the
 * field, because those two differ by metres once the rings coarsen.
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
const AREA_FLOOR = 1e-7;

/** Options; `level` is the sea surface, where a reach stops. */
export interface RiverOpts {
  level: number;
  /** World half-extent to search for sources. */
  half: number;
  /** How many reaches to trace at most. */
  maxReaches?: number;
  /** Accumulation percentile a source must beat. */
  sourceAccum?: number;
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
  const maxR = opts.maxReaches ?? 7;
  const minAccum = opts.sourceAccum ?? 0.93;
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
    for (const s of sources) if ((s.x - c.x) ** 2 + (s.z - c.z) ** 2 < 700 * 700) { ok = false; break; }
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
      if (k % 15 === 14) {
        if (lastDrop - h < 0.8) { stale++; if (stale >= 2) break; } else stale = 0;
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
    lines.push(p);
  }

  // Confluences: truncate a reach where it meets one already accepted, so a
  // tributary stops at the trunk instead of running down it as a second river.
  const accepted: number[][] = [];
  for (const p of lines) {
    let cut = p.length / 2;
    for (const q of accepted) {
      for (let i = 0; i < p.length / 2; i++) {
        let hit = false;
        for (let j = 0; j < q.length / 2; j += 2) {
          const dx = p[i * 2] - q[j * 2], dz = p[i * 2 + 1] - q[j * 2 + 1];
          if (dx * dx + dz * dz < 26 * 26) { hit = true; break; }
        }
        if (hit) { if (i < cut) { cut = i; } break; }
      }
    }
    if (cut < p.length / 2) stats.confluences++;
    const t = p.slice(0, Math.max(0, cut) * 2);
    if (t.length / 2 < MIN_REACH / STATION) { stats.dropped++; continue; }
    accepted.push(t);
  }

  const wPos: number[] = [], wUv: number[] = [], wRiver: number[] = [], wFlow: number[] = [], wIdx: number[] = [];
  const bPos: number[] = [], bUv: number[] = [], bRiver: number[] = [], bIdx: number[] = [];
  /** [folded, degenerate, kept] per mesh, so the gate can be per mesh. */
  const wFold = [0, 0, 0], bFold = [0, 0, 0];
  let widthSum = 0, depthSum = 0, widthN = 0;

  for (const p of accepted) {
    const m = p.length / 2;
    stats.reaches++;
    stats.stations += m;
    stats.metres += (m - 1) * STATION;

    const nx = new Float64Array(m), nz = new Float64Array(m);
    const tx = new Float64Array(m), tz = new Float64Array(m);
    const bed = new Float64Array(m), q = new Float64Array(m), wsl = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(m - 1, i + 1);
      let ax = p[i1 * 2] - p[i0 * 2], az = p[i1 * 2 + 1] - p[i0 * 2 + 1];
      const l = Math.hypot(ax, az) || 1;
      tx[i] = ax / l; tz[i] = az / l;
      nx[i] = -tz[i]; nz[i] = tx[i];
      bed[i] = ground.heightAt(p[i * 2], p[i * 2 + 1]);
      ground.erosionAt(p[i * 2], p[i * 2 + 1], e);
      // `accum` is a percentile of the cells that carry water, so this reads
      // "wetter than 88% of them" rather than any absolute discharge — which is
      // the property that makes it survive a change of resolution or of erosion
      // tuning. It is a proxy for discharge and it is named one.
      q[i] = Math.max(0, Math.min(1, (e.accum - 0.88) / 0.115));
    }
    // Smooth the discharge: the percentile field is noisy at 3 m and a river
    // that changes width every station reads as a rope, not as water.
    for (let pass = 0; pass < 6; pass++) {
      const s = Float64Array.from(q);
      for (let i = 1; i < m - 1; i++) q[i] = s[i - 1] * 0.25 + s[i] * 0.5 + s[i + 1] * 0.25;
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
    for (let i = 0; i < m; i++) wsl[i] = bedMono[i] + 0.35 + 1.70 * q[i];
    for (let i = 1; i < m; i++) wsl[i] = Math.min(wsl[i], wsl[i - 1]);
    // The surface may never sit under the ground it is drawn on.
    for (let i = 0; i < m; i++) wsl[i] = Math.max(wsl[i], bed[i] + 0.06);

    // Waterlines and bank tops, per station, by first crossing.
    const wl = new Array<number>(m), wr = new Array<number>(m);
    const bl = new Array<number>(m), br = new Array<number>(m);
    for (let i = 0; i < m; i++) {
      const x = p[i * 2], z = p[i * 2 + 1];
      // A river's width comes from its discharge, not from how far the ground
      // happens to stay flat. Without the cap a reach crossing a pan bisects
      // its way to the full 32 m search limit on both sides and draws a
      // sixty-four metre sheet of standing water where there is a stream.
      const cap = Math.min(MAX_HALF, 2.6 + 17.0 * q[i]);
      wl[i] = firstCrossing(ground, x, z, -nx[i], -nz[i], wsl[i], cap);
      wr[i] = firstCrossing(ground, x, z, nx[i], nz[i], wsl[i], cap);
      const bankH = wsl[i] + 0.75 + 0.85 * q[i];
      bl[i] = wl[i] + firstCrossing(ground, x - nx[i] * wl[i], z - nz[i] * wl[i], -nx[i], -nz[i], bankH, MAX_BANK);
      br[i] = wr[i] + firstCrossing(ground, x + nx[i] * wr[i], z + nz[i] * wr[i], nx[i], nz[i], bankH, MAX_BANK);
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

    emitWater(p, m, tx, tz, nx, nz, wsl, wl, wr, froude, q);
    emitBank(p, m, nx, nz, wsl, wl, wr, bl, br, froude, -1);
    emitBank(p, m, nx, nz, wsl, wl, wr, bl, br, froude, 1);
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
  return { water, bank, stats };

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
        wPos.push(px, wsl[i], pz);
        // uv.y is signed bed depth in METRES, which is what the Beer-Lambert
        // body colour needs and what a normalised 0..1 cannot give: the same
        // 0.5 would mean twenty centimetres on a creek and two metres on a
        // reach, and the water would read the same colour on both.
        wUv.push(1.0 - Math.abs(u * 2 - 1), wsl[i] - ground.heightAt(px, pz));
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
      // One clipmap-envelope probe per station, not per lane: the whole bank is
      // inside one ring cell and the answer does not vary across it. Same
      // measurement as the shore ribbon, same reason.
      let lift = 0;
      if (ground.drawnEnvelope) lift = Math.max(0, Math.min(0.9, ground.drawnEnvelope(x, z, 0, 6) - ground.heightAt(x, z)));
      for (let j = 0; j < BANK_LANES; j++) {
        const u = j / (BANK_LANES - 1);                  // 0 = waterline
        const lat = sideSign * (inner[i] + (outer[i] - inner[i]) * u);
        const px = x + nx[i] * lat, pz = z + nz[i] * lat;
        const hh = ground.heightAt(px, pz);
        bPos.push(px, hh + lift + 0.06, pz);
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
    return g;
  }
}
