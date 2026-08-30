#!/usr/bin/env node
/**
 * Does a region of a capture carry **posterised** tone, or continuous tone?
 *
 *   node src/tools/bandstat.mts shot.png 0.02 0.80 0.20 0.98 --label vannath-fg
 *   node src/tools/bandstat.mts a.png b.png 0.02 0.80 0.20 0.98      # two files, same box
 *
 * Coordinates are FRACTIONS of width/height, `x0 y0 x1 y1`, exactly as
 * `regionstat.mts` takes them, so a box can be moved between the two tools
 * without arithmetic.
 *
 * **Why this exists.** Nothing in the harness could say whether a dark band
 * reads as steps or as a gradient. `regionstat` reports percentiles, and
 * percentiles are blind to it: a smoothly dithered ramp from 4 to 30 and a
 * five-step staircase over the same range have the *same* p10/p50/p90. So a
 * "posterised darks" finding could only ever be an impression, and an
 * impression of a dark region is exactly what a JPEG, a downscale to 1568 px,
 * or a monitor's own gamma will happily manufacture. This turns it into three
 * numbers per channel.
 *
 * The three numbers, over the closed span between the region's p1 and p99:
 *
 * - **`occ`** — of the integer levels in that span, the fraction that any pixel
 *   actually lands on. A dithered gradient occupies essentially all of them;
 *   quantisation to every Nth level occupies 1/N. This is the headline.
 * - **`gap`** — the longest run of *consecutive* unoccupied levels inside the
 *   span. One empty level is a small region; a run of four is a visible edge,
 *   because the pixels either side of it differ by five.
 *   `--min-gap` (default 2) is the run length counted as a gap edge, and
 *   `edges` counts how many such runs there are — the number of visible
 *   contours a viewer could pick out.
 * - **`top`** — the fraction of the region sitting on its single most popular
 *   level. A continuous surface spreads; a quantised one piles up.
 *
 * **The floor is the region, not the tool.** A region small enough that its
 * pixel count is near its level span cannot occupy every level however good the
 * dither is, so `occ` is printed beside `n/span` and a warning fires under 20
 * samples per level. Measure a box of a few thousand pixels or the number is
 * about the box.
 *
 * **PNG only** — it reads through `imgdiff.mts`'s decoder. Measuring this on a
 * JPEG measures the JPEG: q82 chroma subsampling and an 8x8 DCT quantiser
 * remove and *invent* levels in exactly this range, which is the first thing to
 * rule out before authoring any dither.
 *
 * blind to: WHERE the bands are and what shape they are. A staircase across a
 *           sky and a mottle of quantised noise on gravel give the same three
 *           numbers. It also cannot tell a band the renderer produced from one
 *           a grade *expanded* into visibility — for that, run it either side
 *           of `?post=nolut` on the same box.
 */
import { readFile } from 'node:fs/promises';
import { decodePng } from './imgdiff.mts';

/** Rec.709 luma, on sRGB samples — the same Y `regionstat.mts` quotes. */
const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const pct = (sorted: number[], p: number) => {
  if (sorted.length === 0) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo);
};

const argv = process.argv.slice(2);
// Every flag here takes a value, so a positional scan has to skip the word
// after a `--flag` as well as the flag itself — otherwise `--label vannath-fg`
// donates `vannath-fg` to the file list and the tool tries to open it.
const positional: string[] = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i]!.startsWith('--')) { i++; continue; }
  positional.push(argv[i]!);
}
const files = positional.filter((a) => Number.isNaN(Number(a)));
const nums = positional.filter((a) => !Number.isNaN(Number(a))).map(Number);
const flag = (name: string, dflt: number) => {
  const i = argv.indexOf(name);
  return i >= 0 ? Number(argv[i + 1]) : dflt;
};
const labelAt = argv.indexOf('--label');
const label = labelAt >= 0 ? argv[labelAt + 1] ?? '' : '';
const minGap = flag('--min-gap', 2);

if (files.length === 0 || nums.length < 4) {
  console.error('usage: bandstat.mts <shot.png> [more.png ...] <x0> <y0> <x1> <y1> [--label name] [--min-gap 2]');
  process.exit(2);
}
const [fx0, fy0, fx1, fy1] = nums as [number, number, number, number];

/** One channel's three numbers over its own p1..p99 span. */
function band(vals: number[]) {
  const sorted = vals.slice().sort((a, b) => a - b);
  const lo = Math.round(pct(sorted, 0.01));
  const hi = Math.round(pct(sorted, 0.99));
  const span = Math.max(1, hi - lo + 1);
  const hist = new Float64Array(256);
  for (const v of vals) {
    const k = Math.max(0, Math.min(255, Math.round(v)));
    hist[k] = hist[k]! + 1;
  }
  let occupied = 0;
  let run = 0;
  let longest = 0;
  let edges = 0;
  let top = 0;
  for (let v = lo; v <= hi; v++) {
    const c = hist[v]!;
    if (c > 0) {
      occupied++;
      if (run >= minGap) edges++;
      if (run > longest) longest = run;
      run = 0;
    } else run++;
    if (c > top) top = c;
  }
  if (run >= minGap) edges++;
  if (run > longest) longest = run;
  return {
    lo, hi, span, occupied,
    occ: occupied / span,
    gap: longest,
    edges,
    top: top / Math.max(1, vals.length),
    perLevel: vals.length / span,
  };
}

const rows: string[] = [];
for (const file of files) {
  const img = decodePng(await readFile(file));
  const x0 = Math.max(0, Math.round(fx0 * img.w));
  const x1 = Math.min(img.w, Math.round(fx1 * img.w));
  const y0 = Math.max(0, Math.round(fy0 * img.h));
  const y1 = Math.min(img.h, Math.round(fy1 * img.h));
  const R: number[] = [], G: number[] = [], B: number[] = [], Y: number[] = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const s = (y * img.w + x) * img.ch;
      const r = img.data[s]!;
      const g = img.data[s + 1] ?? r;
      const b = img.data[s + 2] ?? r;
      R.push(r); G.push(g); B.push(b); Y.push(luma(r, g, b));
    }
  }
  if (R.length === 0) {
    console.error(`empty region in ${file}`);
    process.exit(2);
  }
  const name = (label ? `${label} ` : '') + file.split('/').slice(-2).join('/');
  rows.push(`${name}  ${x1 - x0}x${y1 - y0} px  (${R.length} samples)`);
  for (const [ch, vals] of [['Y', Y], ['R', R], ['G', G], ['B', B]] as const) {
    const s = band(vals as number[]);
    rows.push(
      `  ${ch}  span ${String(s.lo).padStart(3)}..${String(s.hi).padStart(3)}` +
      `  occ ${(100 * s.occ).toFixed(1).padStart(5)}% (${s.occupied}/${s.span})` +
      `  gap ${String(s.gap).padStart(2)}  edges ${String(s.edges).padStart(3)}` +
      `  top ${(100 * s.top).toFixed(2).padStart(5)}%` +
      (s.perLevel < 20 ? `  [thin: ${s.perLevel.toFixed(0)} px/level]` : ''));
  }
}
console.log(rows.join('\n'));
console.log(
  '\nocc = fraction of the p1..p99 levels any pixel lands on (continuous tone ~100%),' +
  '\ngap = longest run of empty levels, edges = runs of >= ' + minGap + ' empty levels,' +
  '\ntop = share of the region on its single most popular level.' +
  '\nPNG only: a JPEG measures the JPEG.');
