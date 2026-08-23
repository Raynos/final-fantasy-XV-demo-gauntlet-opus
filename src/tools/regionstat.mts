#!/usr/bin/env node
/**
 * Per-channel percentiles over a rectangle of a capture — the instrument for
 * `docs/reference/ART-DIRECTION.md` §12.
 *
 *   node src/tools/regionstat.mts shot.png 0.42 0.05 0.66 0.24
 *   node src/tools/regionstat.mts shot.png 0.42 0.05 0.66 0.24 --label noctis-hair
 *
 * Coordinates are FRACTIONS of width/height — `x0 y0 x1 y1` — because that is
 * how §12's tables are written, so a region can be copied straight across from
 * the plate row to the command line and back.
 *
 * **Why this exists.** §12.1 (skin), §12.3 (hair) and §12.4 (cloth) each state
 * a measured p10/p50/p90/p99 in hex plus a Y p5→p99.5 span for shipped FFXV,
 * and until now nothing in the harness could produce those five numbers for our
 * own frames. `imagestats.mts` measures a whole frame and reports luma
 * percentiles and a warm/cool split; it cannot answer "is our hair's median the
 * `#1f2630` the plate says it is", because a hair region is 3% of a frame and
 * its statistic is per-channel, not luma. Those are the tables the character
 * work is graded against, so they need an instrument or they are decoration.
 *
 * It reads PNG (via `imgdiff.mts`'s decoder), which is what `framecam.mts`
 * writes — so measure before converting to JPEG, not after.
 */
import { readFile } from 'node:fs/promises';
import { decodePng } from './imgdiff.mts';

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** Rec.709 luma, on sRGB samples — the same Y the §12 tables quote. */
const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

const pct = (sorted: number[], p: number) => {
  if (sorted.length === 0) return 0;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo);
};

const [, , file, ...rest] = process.argv;
const nums = rest.filter((a) => !a.startsWith('--')).map(Number);
const labelAt = rest.indexOf('--label');
const label = labelAt >= 0 ? rest[labelAt + 1] ?? '' : '';

if (!file || nums.length < 4) {
  console.error('usage: regionstat.mts <shot.png> <x0> <y0> <x1> <y1> [--label name]');
  process.exit(2);
}

const img = decodePng(await readFile(file));
const [fx0, fy0, fx1, fy1] = nums as [number, number, number, number];
const x0 = Math.max(0, Math.round(fx0 * img.w));
const x1 = Math.min(img.w, Math.round(fx1 * img.w));
const y0 = Math.max(0, Math.round(fy0 * img.h));
const y1 = Math.min(img.h, Math.round(fy1 * img.h));

const R: number[] = [];
const G: number[] = [];
const B: number[] = [];
const Y: number[] = [];
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
  console.error('empty region');
  process.exit(2);
}
R.sort((a, b) => a - b); G.sort((a, b) => a - b);
B.sort((a, b) => a - b); Y.sort((a, b) => a - b);

// Per-channel percentiles are what §12 tabulates: the p50 hex is the median of
// each channel independently, not the colour of the median pixel. That is how
// the plate numbers were produced, so it is how ours must be.
const at = (p: number) => hex(pct(R, p), pct(G, p), pct(B, p));

const name = label || file;
console.log(`${name}  ${x1 - x0}x${y1 - y0} px  (${R.length} samples)`);
console.log(`  p10 ${at(0.10)}   p50 ${at(0.50)}   p90 ${at(0.90)}   p99 ${at(0.99)}`);
console.log(`  Y   p5 ${pct(Y, 0.05).toFixed(0)} -> p50 ${pct(Y, 0.50).toFixed(0)} -> p99.5 ${pct(Y, 0.995).toFixed(0)}`);
// Sign of R-B at the median is the cool/warm call §12.3 turns on: hair must be
// negative (blue-black), skin positive.
const rb = pct(R, 0.5) - pct(B, 0.5);
console.log(`  R-B at p50 ${rb >= 0 ? '+' : ''}${rb.toFixed(1)}  (${rb < 0 ? 'cool' : 'warm'})`);
