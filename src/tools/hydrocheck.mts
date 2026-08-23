#!/usr/bin/env node
/**
 * Is the hydrology map a channel NETWORK, or a haze that happens to correlate?
 *
 *   node src/tools/hydrocheck.mts
 *   node src/tools/hydrocheck.mts --controls   # the three control cases alone
 *
 * `Terrain.erosionAt` publishes `{accum, deposit, scree, wet, ...}` at 16 m, and
 * every channel is a **percentile among the cells that have any of it at all**,
 * so `accum > 0.97` means *wetter than 97% of the wet cells* at any resolution.
 * Two separate claims live in that sentence and only one of them was checked.
 *
 *   1. **It is a percentile.** `Field._hydrology` throws at build time if a
 *      channel's median among nonzero cells leaves [0.35, 0.65]. That assert
 *      caught the first encoding, whose `wet` sat at p90 = 0.965 because two
 *      clamped terms were added and then clamped again. Re-checked here so the
 *      claim is gated by something that runs in `pnpm run check` rather than
 *      only by a throw inside a build nobody re-runs.
 *   2. **It is a network.** That one was only ever checked in a scratchpad
 *      probe, and a scratchpad probe is not a gate. This is that gate.
 *
 * ## What "a network" means as a number
 *
 * If the hot cells form channels, a hot cell's *neighbour* is far more likely
 * to be hot than a cell picked at random. So for a threshold `p`:
 *
 *     lift(p) = P(neighbour hot | cell hot) / P(cell hot)
 *
 * A network gives a large lift. A haze — the low-pass that turned a network
 * covering 68.5% of cells into a smear covering 89.7% — gives a lift too, but
 * it also destroys the percentile shape, which is why both halves are checked
 * together. What a lift near 1.0 means is that hotness carries no spatial
 * information at all, which is the failure this gate exists to catch.
 *
 * ## Three controls, because a lift on its own is not evidence
 *
 * Plan section 9.6: *a positive control is the thing that tells a saturated
 * instrument from a real negative.* All three are computed from the same code
 * path as the real channels, every run:
 *
 *   shuffled     the real channel's values, permuted. Identical histogram,
 *                zero spatial structure. This is the NULL: lift must be ~1.0.
 *   checkerboard alternating cells. Perfectly ANTI-correlated, so the lift must
 *                come back near **zero**. An instrument that reports a big lift
 *                here is saturated and nothing else it says means anything —
 *                this is OGL's checkerboard rule, which the plan asks for
 *                before any tiling read.
 *   channels     synthetic one-cell-wide lines. Known structure: the lift must
 *                be large. This is the positive control that separates "the
 *                terrain has no network" from "the instrument cannot see one".
 *
 * The gate on the real channels is stated against the controls rather than
 * against a number somebody liked: the measured lift must clear the shuffled
 * control by {@link MIN_LIFT_RATIO}x.
 *
 * ## What this check is blind to
 *
 *   - **Whether the channels are in the right PLACE.** A perfect network in the
 *     wrong valley scores identically. `roadcheck.mts` and a capture are that.
 *   - **Connectivity.** Lift is a two-cell statistic; a field of disconnected
 *     three-cell dashes would pass. Measuring real connectivity wants a
 *     flood-fill on the thresholded field and is not built.
 *   - **The 4 m grid.** This reads the 16 m reduction that ships, which is the
 *     one every placer actually calls, and is blind to what the reduction threw
 *     away.
 *   - **Depth and discharge.** Only rank, never metres.
 */
import { Field, HYD_N } from '../world/terrain/Field.ts';

/** How far the real lift must clear the shuffled null before it means anything. */
const MIN_LIFT_RATIO = 2.0;
/** Percentiles the lift is measured at. */
const PCTS = [0.90, 0.95, 0.99];
const CHANNELS = ['accum', 'deposit', 'scree', 'wet'];

/**
 * `P(neighbour hot | cell hot) / P(cell hot)` over the 4-neighbourhood.
 *
 * Cells with no value at all are excluded from both terms, because the channels
 * are percentiles *among the cells that have any*: a third of the world has no
 * droplet accumulation whatever, and counting those as "cold" would inflate
 * every lift by the size of the dry half of the map rather than by structure.
 */
function lift(v: Uint8Array | Float64Array, n: number, pct: number): number {
  // Hot is defined by RANK, not by a value threshold. The channels are bytes,
  // so a value threshold ties heavily: on the checkerboard control the p90
  // value IS the high value, `> t` selected nothing and the whole thing came
  // back NaN. Taking the top (1 - pct) of the nonzero cells by rank gives the
  // hot set the same size whatever the distribution looks like.
  const idx: number[] = [];
  for (let k = 0; k < n * n; k++) if (v[k] > 0) idx.push(k);
  if (idx.length < 100) return NaN;
  idx.sort((a, b) => (v[b] - v[a]) || (a - b));
  const hotN = Math.max(1, Math.round(idx.length * (1 - pct)));
  const hot = new Uint8Array(n * n);
  for (let i = 0; i < hotN; i++) hot[idx[i]] = 1;
  const pHot = hotN / idx.length;
  if (pHot <= 0 || pHot >= 1) return NaN;
  let pairs = 0, hotPairs = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      if (!hot[k]) continue;
      const nb = [
        i > 0 ? k - 1 : -1, i < n - 1 ? k + 1 : -1,
        j > 0 ? k - n : -1, j < n - 1 ? k + n : -1,
      ];
      for (const m of nb) {
        if (m < 0 || v[m] === 0) continue;
        pairs++;
        if (hot[m]) hotPairs++;
      }
    }
  }
  if (!pairs) return NaN;
  return (hotPairs / pairs) / pHot;
}

/** Median of the nonzero values, 0..1. A percentile channel's must be ~0.5. */
function medianNonZero(v: Uint8Array, n: number, stride: number, off: number): number {
  const nz: number[] = [];
  for (let k = 0; k < n * n; k++) { const x = v[k * stride + off]; if (x > 0) nz.push(x); }
  if (!nz.length) return NaN;
  nz.sort((a, b) => a - b);
  return nz[nz.length >> 1] / 255;
}

const controlsOnly = process.argv.includes('--controls');

const n = HYD_N;
const size = n * n;

/* ------------------------------------------------------------------ controls */

// Deterministic permutation — a fixed LCG, so the null is the same every run
// and a lift that moves is the terrain moving, not the shuffle.
function shuffled(src: Float64Array): Float64Array {
  const out = src.slice();
  let s = 0x9e3779b9;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = out[i]; out[i] = out[j]; out[j] = t;
  }
  return out;
}

const checker = new Float64Array(size);
for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) checker[j * n + i] = ((i + j) & 1) ? 255 : 1;

// Synthetic one-cell-wide channels: verticals every 17 cells plus a diagonal.
const lines = new Float64Array(size).fill(1);
for (let j = 0; j < n; j++) {
  for (let i = 0; i < n; i++) {
    if (i % 17 === 0 || ((i + j) % 23) === 0) lines[j * n + i] = 255;
  }
}

console.log('hydrocheck — is Terrain.erosionAt a channel network or a haze?\n');
console.log('controls, computed by the same code as the real channels:');
const checkerLift = lift(checker, n, 0.90);
const linesLift = lift(lines, n, 0.90);
console.log(`  checkerboard  lift ${checkerLift.toFixed(3)}  (true answer ~0 — perfectly anti-correlated)`);
console.log(`  lines         lift ${linesLift.toFixed(3)}  (true answer >> 1 — known structure)`);

let broken = 0;
if (!(checkerLift < 0.2)) {
  console.log('  VOID: the instrument reports structure in a checkerboard. It is saturated.');
  broken++;
}
if (!(linesLift > 3)) {
  console.log('  VOID: the instrument cannot see one-cell channels it was handed.');
  broken++;
}
if (broken) process.exit(2);
if (controlsOnly) process.exit(0);

/* ------------------------------------------------------------------- the field */

console.log('\nbuilding the field...');
const t0 = Date.now();
const field = new Field(1337);
field.build();
console.log(`built in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

let fails = 0;
console.log('\n1. every channel is a percentile — median of its nonzero cells');
for (let c = 0; c < CHANNELS.length; c++) {
  const med = medianNonZero(field.hydro, n, 4, c);
  const ok = med >= 0.35 && med <= 0.65;
  console.log(`   ${CHANNELS[c].padEnd(9)} median ${med.toFixed(3)}   ${ok ? 'ok' : 'FAIL (not a percentile)'}`);
  if (!ok) fails++;
}

console.log('\n2. every channel is a network — neighbour-is-also-hot lift vs the shuffled null');
console.log('   channel     pct    lift   null    ratio');
for (let c = 0; c < CHANNELS.length; c++) {
  const v = new Float64Array(size);
  for (let k = 0; k < size; k++) v[k] = field.hydro[k * 4 + c];
  const nullV = shuffled(v);
  for (const p of PCTS) {
    const l = lift(v, n, p);
    const nl = lift(nullV, n, p);
    // A sparse channel at p99 can leave the shuffled null with no hot pairs at
    // all, and `l / 0` is Infinity -- a number that looks like a triumphant
    // pass and is really a division by nothing. `scree` at p99 does exactly
    // that. When the null cannot produce a hot neighbour, the honest statement
    // is that any lift is structure, so the test becomes an absolute one.
    const nullDead = !(nl > 0.05);
    const ratio = nullDead ? NaN : l / nl;
    const ok = nullDead ? l > MIN_LIFT_RATIO : ratio >= MIN_LIFT_RATIO;
    console.log(
      `   ${CHANNELS[c].padEnd(9)} ${(p * 100).toFixed(0).padStart(4)}  ${l.toFixed(2).padStart(6)}  `
      + `${nl.toFixed(2).padStart(5)}  ${nullDead ? '  null~0' : `${ratio.toFixed(2).padStart(6)}x`}${ok ? '' : ' FAIL'}`,
    );
    if (!ok) fails++;
  }
}

console.log('\nblind to: whether the channels are in the right PLACE (that is roadcheck and a');
console.log('          capture); connectivity — a field of disconnected three-cell dashes');
console.log('          would pass; the 4 m grid, since this reads the 16 m reduction that');
console.log('          ships; depth and discharge — rank only, never metres.');

if (fails) {
  console.log(`\nFAIL — ${fails} checks failed. The hydrology is not what erosionAt's contract says.`);
  process.exit(1);
}
console.log(`\nPASS — 4 channels are percentiles and every lift clears the null by ${MIN_LIFT_RATIO}x.`);
