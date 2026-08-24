#!/usr/bin/env node
/**
 * Is the scatter CLUSTERED, or is it a lattice we keep calling a forest?
 *
 *   node src/tools/scatterstat.mts                 # every class, grid vs matern
 *   node src/tools/scatterstat.mts --calibrate     # the three anchors alone
 *   node src/tools/scatterstat.mts --set trees
 *   node src/tools/scatterstat.mts --json tmp/scatter.json
 *
 * Plan `docs/plans/2026-08-21-fable-procedural-modeling.md` §2.3. The sibling
 * repo's measured move on the same defect was **Clark–Evans R 0.890 -> 0.531**,
 * and the item is explicit that the verification is R and a nearest-neighbour
 * histogram, *not* a screenshot. A frame of a grove and a frame of a lawn with
 * a density mask over it look far more alike than they measure.
 *
 * ## The statistic
 *
 * Clark–Evans R is the mean nearest-neighbour distance divided by what complete
 * spatial randomness (a homogeneous Poisson process) would give at the same
 * intensity:
 *
 *     R = mean(d_nn) / (0.5 / sqrt(lambda)),   lambda = n / A
 *
 *   R = 1   Poisson — no structure at any scale.
 *   R > 1   regular / dispersed. **A jittered grid lives here**, which is the
 *           finding: stratified sampling is what you use when you want spacing
 *           MORE even than random.
 *   R < 1   clustered. Groves.
 *
 * Edges are handled by **buffering, not by a correction formula**: points are
 * gathered over a window, but only points in an inner window are scored, while
 * their nearest neighbour may be any point in the whole window. A point near
 * the boundary of a scored region otherwise has its true neighbour cut off and
 * reports as more isolated than it is, which biases R upward — i.e. it biases
 * in exactly the direction that would make a lattice look innocent.
 *
 * ## Calibration — printed every run, never skipped
 *
 * This repo has caught seven instruments measuring themselves. Three synthetic
 * anchors with known answers are generated and scored by the same code as the
 * real classes on every invocation:
 *
 *   poisson      uniform random points.        true answer R = 1.00
 *   lattice      jittered regular grid.        true answer R > 1 (dispersed)
 *   matern       a synthetic cluster process.  true answer R << 1
 *
 * If the Poisson anchor does not land near 1, or the two structured anchors do
 * not straddle it, the run prints VOID and exits non-zero — nothing else it
 * says means anything. The lattice anchor is the important one: our shipped
 * scatter IS a jittered lattice, so an instrument that cannot tell a lattice
 * from Poisson cannot see this defect at all.
 *
 * ## What this check is BLIND to (plan §9.3)
 *
 * R is one number off one summary of one point pattern, and a great many
 * patterns pass it. It is printed at the foot of every run and it is not
 * decoration:
 *
 *   - **Cluster size and count.** Many tight small clusters and few large loose
 *     ones can share an R. The NN histogram separates them; read it.
 *   - **Where the clusters are.** A perfect grove pattern in the wrong half of
 *     the map scores identically. That is `suitability`, and it is checked by a
 *     capture and by `hydrocheck`, not here.
 *   - **Anisotropy.** Points strung along lines are "clustered" to R. A boulder
 *     train down a gully and a round grove are the same number.
 *   - **What anything looks like.** Silhouette is `silhouette.mts`; float above
 *     the drawn ground is `floatcheck.mts`; density and colour are
 *     `reliefstat`/`imagestats`. This tool measures POSITIONS and nothing else.
 *   - **The third dimension.** Everything here is the XZ plane.
 *   - **Whether the sampler is wired in.** `reachcheck.mts` is that. This tool
 *     calls the generators directly and would happily grade dead code — as it
 *     did on its first run: `Ecology.scatterClustered` had zero callers.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { Field } from '../world/terrain/Field.ts';
import { applyBakedField } from '../world/terrain/FieldBake.ts';
import { Terrain } from '../world/Terrain.ts';
import { Ecology } from '../world/veg/Ecology.ts';
import { maternScatter } from '../world/veg/Cluster.ts';
import type { ClusterPoint } from '../world/veg/Cluster.ts';
import { Trees } from '../world/veg/Trees.ts';
import { Bushes } from '../world/veg/Bushes.ts';
import { Noise } from '../util/Noise.ts';
import type { Game } from '../game/Game.ts';

const argv = process.argv.slice(2);
const has = (f: string) => argv.includes(f);
const arg = (f: string, d: string) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

/* --------------------------------------------------------------- statistics */

interface Pt {
  x: number;
  z: number;
  /** Species / stone kind, as the SAMPLER chose it. Drives `same-sp`. */
  kind?: string;
  /**
   * The literal drawn MESH — `species_variant`, `kind_variant`.
   *
   * Distinct from `kind` on purpose, and the distinction is the whole of round
   * 13's fourth item: *"reject any placement within N metres of another copy of
   * the same asset"*. A grove is deliberately one species, so `kind` coherence
   * being high is the sampler working; whether two instances of the SAME MESH
   * end up next to each other is a different question and nothing measured it.
   */
  id?: string;
}

/**
 * Clark–Evans R over a buffered window.
 *
 * @param pts every point in the window (the search set)
 * @param x0,z0,w,h the SCORED sub-window; neighbours may lie outside it
 */
function clarkEvans(pts: Pt[], x0: number, z0: number, w: number, h: number) {
  // Bucket at roughly the mean spacing so the neighbour search is local.
  const lambdaAll = pts.length / (w * h);
  const cell = Math.max(1, lambdaAll > 0 ? 1 / Math.sqrt(lambdaAll) : 10);
  const grid = new Map<number, number[]>();
  const key = (i: number, j: number) => i * 1048576 + j;
  for (let i = 0; i < pts.length; i++) {
    const k = key(Math.floor(pts[i].x / cell), Math.floor(pts[i].z / cell));
    let a = grid.get(k);
    if (!a) { a = []; grid.set(k, a); }
    a.push(i);
  }
  const nn: number[] = [];
  const same: number[] = [];
  // Same-ASSET nearest neighbour: the nearest instance of the identical mesh.
  // A separate brute-force pass rather than a second grid, because the same-id
  // subset is 1/k of the points and the grid's cell is sized for all of them —
  // a bucketed search would walk most of the map per query anyway.
  const idIdx = new Map<string, number[]>();
  for (let i = 0; i < pts.length; i++) {
    const id = pts[i].id;
    if (id === undefined) continue;
    let a = idIdx.get(id);
    if (!a) { a = []; idIdx.set(id, a); }
    a.push(i);
  }
  const sameAsset: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.x < x0 || p.x >= x0 + w || p.z < z0 || p.z >= z0 + h) continue;
    const ci = Math.floor(p.x / cell), cj = Math.floor(p.z / cell);
    let best = Infinity, bestJ = -1;
    for (let ring = 0; ring <= 24; ring++) {
      for (let dj = -ring; dj <= ring; dj++) {
        for (let di = -ring; di <= ring; di++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
          const a = grid.get(key(ci + di, cj + dj));
          if (!a) continue;
          for (const j of a) {
            if (j === i) continue;
            const d = Math.hypot(p.x - pts[j].x, p.z - pts[j].z);
            if (d < best) { best = d; bestJ = j; }
          }
        }
      }
      // After scanning Chebyshev rings 0..r, anything unscanned is at least
      // `r * cell` away, so this is the first ring at which the best-so-far is
      // provably the nearest. Two grid-search bugs live here and the Poisson
      // anchor caught both: starting at ring 1 skips the point's OWN cell,
      // where the nearest neighbour usually is (that read R = 1.281 on uniform
      // random points), and stopping at the first ring with any hit takes a
      // point across a cell boundary over a nearer one inside it.
      if (best <= ring * cell) break;
    }
    if (bestJ < 0) continue;
    nn.push(best);
    if (p.kind !== undefined) same.push(pts[bestJ].kind === p.kind ? 1 : 0);
    const peers = p.id !== undefined ? idIdx.get(p.id) : undefined;
    if (peers && peers.length > 1) {
      let bs = Infinity;
      for (const j of peers) {
        if (j === i) continue;
        const d = Math.hypot(p.x - pts[j].x, p.z - pts[j].z);
        if (d < bs) bs = d;
      }
      if (Number.isFinite(bs)) sameAsset.push(bs);
    }
  }
  const n = nn.length;
  if (n < 8) {
    return {
      n, R: NaN, mean: NaN, expected: NaN, lambda: 0, nn, coherence: NaN,
      sameAssetMean: NaN, sameAssetRatio: NaN, touch: NaN,
    };
  }
  // Intensity from the SCORED region, which is where the counted points live.
  let inside = 0;
  for (const p of pts) if (p.x >= x0 && p.x < x0 + w && p.z >= z0 && p.z < z0 + h) inside++;
  const lambda = inside / (w * h);
  const expected = 0.5 / Math.sqrt(lambda);
  const mean = nn.reduce((a, b) => a + b, 0) / n;
  const coherence = same.length ? same.reduce((a, b) => a + b, 0) / same.length : NaN;
  const sa = sameAsset.slice().sort((a, b) => a - b);
  const saMean = sa.length ? sa.reduce((a, b) => a + b, 0) / sa.length : NaN;
  // Fraction of instances with ANY neighbour inside 1.5 m — two trunks in one
  // hole. Reported beside the ratio because the two answer different halves of
  // the round-13 item and they do not move together.
  const touch = nn.filter((d) => d < 1.5).length / Math.max(1, nn.length);
  return {
    n, R: mean / expected, mean, expected, lambda, nn, coherence,
    sameAssetMean: saMean, sameAssetRatio: saMean / mean, touch,
  };
}

/** Nearest-neighbour histogram in units of the CSR expected distance. */
const BINS = [0, 0.125, 0.25, 0.375, 0.5, 0.75, 1.0, 1.5, 2.0, Infinity];
function histogram(nn: number[], expected: number) {
  const c = new Array(BINS.length - 1).fill(0);
  for (const d of nn) {
    const t = d / expected;
    for (let i = 0; i < c.length; i++) if (t >= BINS[i] && t < BINS[i + 1]) { c[i]++; break; }
  }
  return c.map((v) => v / Math.max(1, nn.length));
}
function histLine(c: number[]) {
  const glyph = ' ▁▂▃▄▅▆▇█';
  return c.map((v) => glyph[Math.min(8, Math.round(v * 8 / 0.35))]).join('');
}

/* ------------------------------------------------------------- calibration */

function synthPoisson(n: number, w: number, h: number, seed: number): Pt[] {
  let s = seed >>> 0;
  const u = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) out.push({ x: u() * w, z: u() * h });
  return out;
}

/** The shipped pattern, in miniature: one point per cell, jittered inside it. */
function synthLattice(n: number, w: number, h: number, seed: number): Pt[] {
  const cells = Math.round(Math.sqrt(n));
  const cw = w / cells, ch = h / cells;
  const r = synthPoisson(cells * cells * 2, 1, 1, seed);
  const out: Pt[] = [];
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const k = j * cells + i;
      out.push({ x: (i + r[k].x) * cw, z: (j + r[k].z) * ch });
    }
  }
  return out;
}

function synthMatern(w: number, h: number, seed: number): Pt[] {
  return maternScatter({
    seed, x0: 0, z0: 0, w, h, parentMin: 46, spread: 9, mean: 11,
    suitability: () => 1,
  }).map((p) => ({ x: p.x, z: p.z }));
}

const CAL_W = 900, CAL_INSET = 90;
function calibrate() {
  const rows: Array<{ name: string, R: number, n: number, nn: number[], expected: number }> = [];
  const inner = { x0: CAL_INSET, z0: CAL_INSET, w: CAL_W - 2 * CAL_INSET, h: CAL_W - 2 * CAL_INSET };
  const mat = synthMatern(CAL_W, CAL_W, 20260823);
  // Match the anchors' counts so R is compared at one intensity — R is a ratio
  // and is meant to be scale-free, but making the three differ in n as well as
  // in structure would leave that as an assumption rather than a control.
  const n = mat.length;
  for (const [name, pts] of [
    ['poisson', synthPoisson(n, CAL_W, CAL_W, 4242)],
    ['lattice', synthLattice(n, CAL_W, CAL_W, 4243)],
    ['matern', mat],
  ] as Array<[string, Pt[]]>) {
    const s = clarkEvans(pts, inner.x0, inner.z0, inner.w, inner.h);
    rows.push({ name, R: s.R, n: s.n, nn: s.nn, expected: s.expected });
  }
  return rows;
}

/* ------------------------------------------------------------------ harness */

function loadField(): Field {
  const f = new Field(1337);
  const baked = resolve('src/public/baked/terrain.bin.gz');
  if (existsSync(baked)) {
    try {
      applyBakedField(f, new Uint8Array(gunzipSync(readFileSync(baked))));
      console.log('field: from the bake (src/public/baked/terrain.bin.gz)');
      return f;
    } catch (e) {
      // A stale bake must never be fatal and must never be silent either: the
      // generator is the source of truth, so say which path ran.
      console.log(`field: bake unusable (${(e as Error).message}), generating`);
    }
  }
  const t0 = Date.now();
  f.build();
  console.log(`field: generated in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return f;
}

/**
 * A `Terrain` with a field in it and no renderer.
 *
 * `Terrain.init` builds textures and a clipmap and needs a GPU; the placement
 * API — `heightAt`, `erosionAt`, `roadCenterX`, `zoneAt` — needs neither, and
 * everything it does need is set by the constructor or is the field itself. So
 * this constructs the real class and hands it the real field rather than
 * standing up a double whose divergence from `Terrain` nothing would report.
 */
function bareTerrain(field: Field): Terrain {
  const t = new Terrain();
  t.field = field;
  t.road = field.roadSpline;
  return t;
}

function makeEco(t: Terrain) {
  return new Ecology({ get: () => t } as unknown as Game, 1337);
}

/* -------------------------------------------------------------- the classes */

const ZONES: Array<[string, number, number]> = [
  ['fallgrove', -800, 1560],
  ['nebulawood', -1560, -1180],
  ['alstor', -1180, 620],
  ['longwythe', 380, -260],
  ['three_valleys', 1360, 1160],
];

/** Window: 768 m gathered, scored on the inner 512 m. */
const WIN = 768, INSET = 128;

/** The shipped tree scatter, by calling the real `Trees._makeTile`. */
function shippedTrees(eco: Ecology, cx: number, cz: number): Pt[] {
  const t = Object.create(Trees.prototype) as Trees;
  t.eco = eco;
  t._nClump = new Noise(0x4c17);
  // `_makeTile` only reads `variant.height` off this, to record the instance's
  // world height. Nothing here measures height.
  // The stub answers every `${sp}_${vi}` key, so `pickTier`'s three tiers all
  // resolve and the `id` column sees the real variant spread. Nothing here
  // measures height.
  t.byKey = { get: () => ({ height: 12 }) } as unknown as Trees['byKey'];
  const out: Pt[] = [];
  const TILE = 64;
  const i0 = Math.floor((cx - WIN / 2) / TILE), i1 = Math.floor((cx + WIN / 2) / TILE);
  const j0 = Math.floor((cz - WIN / 2) / TILE), j1 = Math.floor((cz + WIN / 2) / TILE);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      for (const p of t._makeTile(i, j)) out.push({ x: p.x, z: p.z, kind: p.sp, id: `${p.sp}_${p.vi}` });
    }
  }
  return out;
}

/** The shipped scrub scatter, by calling the real `Bushes._makeTile`. */
function shippedBushes(eco: Ecology, cx: number, cz: number): Pt[] {
  const b = Object.create(Bushes.prototype) as Bushes;
  b.eco = eco;
  b._nClump = new Noise(0x9d31);
  // **Two variants, because that is what `SCRUB_SPECIES` declares.** The stub
  // used to say one, which made every bush report as variant 0 and would have
  // let the same-asset column below print a number about the stub. `_makeTile`
  // reads `spec.variants.length` and nothing else off this.
  b.kinds = {
    get: () => ({ variants: [0, 1], scale: [1, 2], tint: [1, 1, 1] }),
  } as unknown as Bushes['kinds'];
  const out: Pt[] = [];
  const TILE = 32;
  const i0 = Math.floor((cx - WIN / 2) / TILE), i1 = Math.floor((cx + WIN / 2) / TILE);
  const j0 = Math.floor((cz - WIN / 2) / TILE), j1 = Math.floor((cz + WIN / 2) / TILE);
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      for (const p of b._makeTile(i, j)) out.push({ x: p.x, z: p.z, kind: p.kind, id: `${p.kind}_${p.vi}` });
    }
  }
  return out;
}

/** The proposed replacement, over the same window and the same fields. */
function maternTrees(eco: Ecology, cx: number, cz: number): Pt[] {
  return eco.groveScatter(cx - WIN / 2, cz - WIN / 2, WIN, WIN)
    .map((p: ClusterPoint) => ({ x: p.x, z: p.z, kind: p.kind }));
}
function maternBushes(eco: Ecology, cx: number, cz: number): Pt[] {
  return eco.scrubScatter(cx - WIN / 2, cz - WIN / 2, WIN, WIN)
    .map((p: ClusterPoint) => ({ x: p.x, z: p.z, kind: p.kind }));
}
/**
 * The raw boulder sampler. **Its `kind` is empty and that is not a bug here:**
 * `rockScatter` passes no `kind` callback, because `Rocks` draws its own stone
 * from the zone's weight table and has never consumed the sampler's species
 * field. The `same-sp` column therefore reads `--` on this row rather than the
 * **100%** it used to print, which is what a set of identical `undefined`s
 * scores and is the most flattering wrong number the tool could produce.
 */
function maternRocks(eco: Ecology, cx: number, cz: number): Pt[] {
  return eco.rockScatter(cx - WIN / 2, cz - WIN / 2, WIN, WIN)
    .map((p: ClusterPoint) => ({ x: p.x, z: p.z }));
}

/* ------------------------------------------------------------------- report */

function fmt(v: number, d = 3) { return Number.isFinite(v) ? v.toFixed(d) : ' -- '; }

const cal = calibrate();
console.log('calibration — three synthetic anchors, scored by the code below\n');
console.log('  anchor        n      R    true answer');
for (const r of cal) {
  const truth = r.name === 'poisson' ? '1.00 (Poisson)'
    : r.name === 'lattice' ? '> 1 (a jittered grid is DISPERSED)'
      : '<< 1 (a cluster process)';
  console.log(`  ${r.name.padEnd(10)} ${String(r.n).padStart(5)}  ${fmt(r.R)}   ${truth}`);
}
const poi = cal.find((r) => r.name === 'poisson')!.R;
const lat = cal.find((r) => r.name === 'lattice')!.R;
const clu = cal.find((r) => r.name === 'matern')!.R;
let void_ = 0;
if (!(poi > 0.95 && poi < 1.05)) { console.log('  VOID: the Poisson anchor is not 1. The estimator is wrong.'); void_++; }
if (!(lat > poi + 0.15)) { console.log('  VOID: it cannot tell a jittered lattice from Poisson — the defect is invisible to it.'); void_++; }
if (!(clu < poi - 0.25)) { console.log('  VOID: it cannot see a cluster process it generated itself.'); void_++; }
if (void_) process.exit(2);
console.log(`  dynamic range ${fmt(lat / clu, 2)}x between the two structured anchors — ok\n`);
if (has('--calibrate')) process.exit(0);

const field = loadField();
const terrain = bareTerrain(field);
const eco = makeEco(terrain);

const set = arg('--set', 'all');
const CLASSES: Array<[string, (e: Ecology, x: number, z: number) => Pt[], boolean]> = [];
if (set === 'all' || set === 'trees') {
  // **The labels used to say `grid` and `matern` and both were stale.** The
  // call sites landed, so `_makeTile` IS the Matern sampler now: what these two
  // rows compare is the shipped path — the sampler plus the caller's own bias
  // and, for bushes, its water-line branch — against the sampler on its own.
  CLASSES.push(['trees   shipped', shippedTrees, false], ['trees   sampler', maternTrees, true]);
}
if (set === 'all' || set === 'bushes') {
  CLASSES.push(['bushes  shipped', shippedBushes, false], ['bushes  sampler', maternBushes, true]);
}
if (set === 'all' || set === 'rocks') {
  CLASSES.push(['rocks   sampler', maternRocks, true]);
}

console.log(`nearest-neighbour statistics — ${WIN} m gathered, inner ${WIN - 2 * INSET} m scored\n`);
console.log('  zone           class             n      R   mean m   csr m  same-sp  same-asset  <1.5m   histogram, d/E in bins '
  + BINS.slice(0, -1).join('/'));

const json: Record<string, unknown> = { calibration: cal.map((r) => ({ name: r.name, R: r.R, n: r.n })), zones: {} };
for (const [zname, cx, cz] of ZONES) {
  const zrows: Record<string, unknown> = {};
  for (const [cname, fn] of CLASSES) {
    const pts = fn(eco, cx, cz);
    const s = clarkEvans(pts, cx - WIN / 2 + INSET, cz - WIN / 2 + INSET, WIN - 2 * INSET, WIN - 2 * INSET);
    const hist = Number.isFinite(s.expected) ? histogram(s.nn, s.expected) : [];
    console.log(
      `  ${zname.padEnd(14)} ${cname.padEnd(15)} ${String(s.n).padStart(5)}  ${fmt(s.R, 3)}  `
      + `${fmt(s.mean, 2).padStart(6)}  ${fmt(s.expected, 2).padStart(6)}  `
      + `${Number.isFinite(s.coherence) ? (s.coherence * 100).toFixed(0).padStart(4) + '%' : '   --'}  `
      + `${Number.isFinite(s.sameAssetRatio) ? (fmt(s.sameAssetMean, 1) + ' ' + fmt(s.sameAssetRatio, 2) + 'x').padStart(10) : '        --'}  `
      + `${Number.isFinite(s.touch) ? (s.touch * 100).toFixed(1).padStart(5) + '%' : '     --'}  `
      + `|${histLine(hist)}|`,
    );
    zrows[cname.trim().replace(/\s+/g, '-')] = {
      n: s.n, R: s.R, mean: s.mean, csr: s.expected, coherence: s.coherence,
      sameAssetMean: s.sameAssetMean, sameAssetRatio: s.sameAssetRatio, touch: s.touch, hist,
    };
  }
  (json.zones as Record<string, unknown>)[zname] = zrows;
}

console.log('\nsame-asset = mean distance to the nearest instance of the IDENTICAL mesh, and');
console.log('  that distance over the all-asset mean. **Round 13 asked for a rule that rejects');
console.log('  a placement within N m of another copy of the same asset. This column is what');
console.log('  says whether such a rule can buy anything**, and the answer here is no: with k');
console.log('  meshes assigned independently the ratio is sqrt(k), and a grove carries 3');
console.log('  variants, so 1.7x IS the ceiling. Identity is already maximally decorrelated;');
console.log('  what was broken is the ALL-asset spacing in the <1.5m column.');
console.log('\nblind to: cluster SIZE and count (read the histogram); WHERE the clusters are');
console.log('  (that is suitability — a capture and hydrocheck); anisotropy (a boulder train down');
console.log('  a gully scores like a round grove); everything about how anything LOOKS');
console.log('  (silhouette.mts / floatcheck.mts / imagestats); the Y axis entirely; and whether');
console.log('  the sampler is WIRED IN (reachcheck.mts) — it grades whatever it is handed.');

const out = arg('--json', '');
if (out) {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(json, null, 2));
  console.log(`\nwrote ${out}`);
}
