#!/usr/bin/env node
/**
 * Frame statistics — the same nine numbers on our captures and on shipped FFXV.
 *
 *   node src/tools/imagestats.mts "docs/reference/plates/*.jpg" --label FFXV --save
 *   node src/tools/imagestats.mts "tmp/shots/x/*.png" --against FFXV
 *   node src/tools/imagestats.mts "tmp/shots/x/*.png" --json tmp/x.json
 *
 * **Why this exists.** `BRIEF.md` says "grade against shipped FFXV, every
 * time", and until now that was a request to remember what FFXV looks like.
 * Comparing against memory is how the sibling repo shipped a measurable sepia
 * filter out of nine individually-reasonable warm nudges; moving to nine
 * measured frames reversed three of their own grading targets. So: measure the
 * reference corpus once, store the medians, and diff every capture against them.
 *
 * Ported by translation from `metal-gear-solid-5-opus-demo/tools/reference/
 * imagestats.py`, with one addition that the original could not make and this
 * project needs (see `sh(R-B)` / `hi(R-B)` below).
 *
 * ## The columns
 *
 * | column   | what it measures | why it is here |
 * |----------|------------------|----------------|
 * | `R-B`    | mean R minus mean B, 0-255 | overall warm/cool cast |
 * | `sh(R-B)`| the same, over pixels below the 25th luma percentile | **the split-tone's shadow arm.** FFXV pushes shadows teal, so this must be NEGATIVE |
 * | `hi(R-B)`| the same, above the 75th percentile | the highlight arm. FFXV pushes highlights warm, so this must be POSITIVE and larger than `sh` |
 * | `meanL`  | mean sRGB luma | overall exposure |
 * | `blk`    | darkest luma in the frame | FFXV's darkest pixel across 53 plates is 1. Zero here means we crush |
 * | `p0.1`   | 0.1st-percentile luma | the real black point; robust where `blk` is one pixel |
 * | `p50`    | median luma | where the mass of the image sits |
 * | `p99.9`  | 99.9th-percentile luma | the real white point |
 * | `hi230%` | percent of pixels with any channel >= 230 | how much of the frame is genuinely bright |
 * | `clip%`  | percent with any channel >= 254 | **whether anything clips at all.** The sibling's grade read "veiled" because nothing in their game ever reached 255 |
 * | `sat%`   | mean HSV saturation | FFXV is desaturated; a punchy render shows here |
 * | `stops`  | log2 of linear p99.9 over linear p0.1 | dynamic range actually used |
 *
 * `sh(R-B)` and `hi(R-B)` are the addition. A single mean `R-B` cannot see a
 * split-tone at all: teal shadows and warm highlights cancel, and a frame that
 * is correctly graded and one that is flat both read near zero. Since the
 * split-tone's direction is the single most-repeated fact in
 * `docs/reference/ART-DIRECTION.md` §1, the instrument has to be able to see it.
 *
 * ## How it decodes
 *
 * In Chromium, via `createImageBitmap(blob, { colorSpaceConversion: 'none' })`
 * onto a 2D canvas. The repo has no image library and the reference corpus is
 * JPEG while our captures are PNG; one decoder that handles both, ships with
 * playwright (already a dependency), and is the same decoder a judge's eye
 * effectively goes through, beats writing a baseline JPEG decoder to compare
 * against a hand-rolled PNG one. `colorSpaceConversion: 'none'` and
 * `--force-color-profile=srgb` together mean the numbers do not move with the
 * display profile.
 *
 * Each frame is cropped to x 5-95%, y 5-90% before sampling, matching the
 * source tool: it keeps letterboxing, a DOM HUD strip and capture edges out of
 * a statistic that is meant to describe the *grade*.
 */
import { chromium } from 'playwright';
import type { Browser } from 'playwright';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROMIUM_ARGS } from './chromium.mts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
/** Where `--save` writes and `--against` reads. Checked in beside the plates. */
const CORPUS = path.join(ROOT, 'docs/reference/corpus-stats.json');

/** The twelve numbers, in print order. */
export interface Stats {
  RmB: number; shRmB: number; hiRmB: number;
  meanL: number; blk: number; p01: number; p50: number; p999: number;
  hi230: number; clip: number; sat: number; stops: number;
}
/** One row of the table: a file plus its statistics. */
export interface Row extends Stats { file: string }
/** A saved corpus: per-file rows plus the median row that `--against` diffs. */
interface Corpus { label: string; n: number; files: string[]; median: Stats }

const KEYS: (keyof Stats)[] = ['RmB', 'shRmB', 'hiRmB', 'meanL', 'blk', 'p01', 'p50', 'p999', 'hi230', 'clip', 'sat', 'stops'];
const HEAD: Record<keyof Stats, string> = {
  RmB: 'R-B', shRmB: 'sh(R-B)', hiRmB: 'hi(R-B)', meanL: 'meanL', blk: 'blk',
  p01: 'p0.1', p50: 'p50', p999: 'p99.9', hi230: 'hi230%', clip: 'clip%', sat: 'sat%', stops: 'stops',
};
/** Per-column print width and decimals, so the table lines up. */
const FMT: Record<keyof Stats, [number, number]> = {
  RmB: [8, 1], shRmB: [9, 1], hiRmB: [9, 1], meanL: [8, 1], blk: [6, 0], p01: [7, 1],
  p50: [7, 1], p999: [8, 1], hi230: [8, 2], clip: [7, 2], sat: [7, 1], stops: [7, 2],
};

/**
 * Compute the statistics for one decoded frame.
 *
 * Runs inside the page (it is stringified into `page.evaluate`), so it may not
 * close over anything in this module.
 */
async function pageStats(url: string): Promise<Stats> {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none' });
  const x0 = Math.round(bmp.width * 0.05), x1 = Math.round(bmp.width * 0.95);
  const y0 = Math.round(bmp.height * 0.05), y1 = Math.round(bmp.height * 0.90);
  const w = x1 - x0, h = y1 - y0;
  const cv = new OffscreenCanvas(w, h);
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, x0, y0, w, h, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  bmp.close();

  // Every 7th pixel, as the source tool does: the statistics are stable to
  // well under a level at this density and it is 7x less work.
  const step = 7 * 4;
  const n = Math.floor(d.length / step);
  const lum = new Float64Array(n);
  const rmb = new Float64Array(n);
  let R = 0, B = 0, sat = 0, hi230 = 0, clip = 0;
  for (let i = 0, k = 0; k < n; i += step, k++) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    R += r; B += b;
    lum[k] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    rmb[k] = r - b;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    sat += (mx - mn) / Math.max(mx, 1);
    if (mx >= 230) hi230++;
    if (mx >= 254) clip++;
  }

  // Rank-order once; the percentile bands below index into the same order.
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) => lum[a] - lum[b]);
  const at = (v: number): number => lum[order[Math.min(n - 1, Math.floor(n * v))]];
  const band = (lo: number, hi: number): number => {
    let s = 0, c = 0;
    for (let k = Math.floor(n * lo); k < Math.floor(n * hi); k++) { s += rmb[order[k]]; c++; }
    return c ? s / c : 0;
  };
  const s2l = (v: number): number => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  // Linear luma is monotone in sRGB luma only channel-wise, not for a weighted
  // sum -- so re-rank rather than reusing "order" for the stops figure.
  const ylin = new Float64Array(n);
  for (let i = 0, k = 0; k < n; i += step, k++) {
    ylin[k] = 0.2126 * s2l(d[i]) + 0.7152 * s2l(d[i + 1]) + 0.0722 * s2l(d[i + 2]);
  }
  ylin.sort();
  // Floor at ONE CODE LEVEL, not at 1e-6. With a 1e-6 floor every frame that
  // contains a single literal-black pixel reports the same saturated 19.93
  // stops, which is what the source tool does and it makes the column useless
  // on exactly the frames a grading pass cares about. One level is the real
  // resolution of an 8-bit capture, so the column now tops out at 11.69.
  const ONE_LEVEL = s2l(1);
  const ql = (v: number): number => Math.max(ylin[Math.min(n - 1, Math.floor(n * v))], ONE_LEVEL);

  let lsum = 0;
  for (let k = 0; k < n; k++) lsum += lum[k];

  return {
    RmB: (R - B) / n, shRmB: band(0, 0.25), hiRmB: band(0.75, 1),
    meanL: lsum / n,
    blk: lum[order[0]], p01: at(0.001), p50: at(0.5), p999: at(0.999),
    hi230: 100 * hi230 / n, clip: 100 * clip / n, sat: 100 * sat / n,
    stops: Math.log2(ql(0.999) / ql(0.001)),
  };
}

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

/**
 * Scene-matched slices of the reference corpus, for `--subsets`.
 *
 * **These exist because the whole-corpus median is not a grading target.** The
 * 53 plates span midday plains, night VFX, menu screens and studio character
 * portraits; their median describes no frame anyone would ever render. Worse,
 * two of the columns are dominated by *scene content* rather than by grade:
 * `hi(R-B)` on an outdoor frame is mostly SKY, because sky is the brightest
 * thing in it and sky is very blue. FFXV's whole-corpus `hi(R-B)` is -19.8,
 * which reads as "highlights are cool" and flatly contradicts the split-tone
 * `ART-DIRECTION.md` §1 measured by eyedropper — the eyedropper was sampling
 * lit *surfaces*, this column is sampling sky.
 *
 * A shared confound cancels only between corpora that share it. So compare a
 * vista against `FFXV-field`, a golden-hour shot against `FFXV-golden`, and a
 * character capture against `FFXV-actor`, and never anything against `FFXV`
 * except as a sanity bound.
 */
const SUBSETS: Record<string, string[]> = {
  // Outdoor, daylight, environment-dominant, no HUD and no VFX flare.
  'FFXV-field': [
    'beast-party-plains-03', 'behemoth-deadeye-duscae-02', 'camp-cooking-01',
    'duscae-plains-lake-01', 'duscae-plains-noon-05', 'duscae-wilderness-04',
    'party-roadtrip-galdin-01', 'party-three-field-02', 'town-daytime-altissia-01',
    'water-lake-01',
  ],
  // Low sun in frame. The signature look, and the one our vista shots pose for.
  'FFXV-golden': ['duscae-plains-chocobo-02', 'golden-hour-godrays-01', 'golden-hour-water-02'],
  // Dark and blue, per BRIEF. Two carry heavy VFX; there are only four.
  'FFXV-night': ['night-campfire-haven-01', 'night-insomnia-party-02', 'vfx-armiger-night-08', 'vfx-royalarm-night-09'],
  // Faces and figures at portrait framing -- the target for character captures.
  'FFXV-actor': [
    'character-gladiolus-face-01', 'character-gladiolus-sunlit-02', 'character-ignis-face-01',
    'character-noctis-face-01', 'character-noctis-mastershot-04', 'character-prompto-daylight-01',
    'party-four-casual-01',
  ],
  // Weather. Ours has rain, wetness and lightning and nothing has ever graded them.
  'FFXV-wet': ['character-noctis-rain-03', 'duscae-thunderstorm-03', 'rain-combat-closeup-02', 'rain-fog-prompto-03', 'rain-storm-leviathan-01'],
};

/** Expand a `dir/*.ext` pattern, a directory, or a plain file into file paths. */
async function expand(pattern: string): Promise<string[]> {
  const abs = path.resolve(pattern);
  if (!abs.includes('*')) {
    try {
      const names = await readdir(abs);
      return names.filter((f) => MIME[path.extname(f).toLowerCase()]).sort().map((f) => path.join(abs, f));
    } catch { return [abs]; }
  }
  const dir = path.dirname(abs);
  const re = new RegExp(`^${path.basename(abs).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`);
  const names = await readdir(dir);
  return names.filter((f) => re.test(f) && MIME[path.extname(f).toLowerCase()]).sort().map((f) => path.join(dir, f));
}

/** Median of a sample; the even case averages the two middles. */
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function medianRow(rows: Row[]): Stats {
  const out = {} as Stats;
  for (const k of KEYS) out[k] = median(rows.map((r) => r[k]));
  return out;
}

function fmtRow(label: string, s: Stats, width: number): string {
  let line = label.slice(0, width).padEnd(width);
  for (const k of KEYS) {
    const [w, d] = FMT[k];
    const sign = (k === 'RmB' || k === 'shRmB' || k === 'hiRmB') && s[k] >= 0 ? '+' : '';
    line += (sign + s[k].toFixed(d)).padStart(w);
  }
  return line;
}

/** Decode and measure every file, in one Chromium page. */
async function measure(files: string[]): Promise<Row[]> {
  const browser: Browser = await chromium.launch({ headless: true, args: CHROMIUM_ARGS });
  const rows: Row[] = [];
  try {
    const page = await browser.newPage();
    // Serve the bytes as data URIs rather than file:// so the page needs no
    // filesystem access and the tool works from any cwd.
    for (const f of files) {
      const buf = await readFile(f);
      const mime = MIME[path.extname(f).toLowerCase()] ?? 'image/png';
      const uri = `data:${mime};base64,${buf.toString('base64')}`;
      const s = await page.evaluate(pageStats, uri);
      rows.push({ file: path.basename(f), ...s });
    }
  } finally {
    await browser.close();
  }
  return rows;
}

/**
 * Measure all 53 plates once, then save `FFXV` plus every slice in `SUBSETS`.
 *
 * One decode pass for all of them: the slices are re-medians of the same rows,
 * so re-running the browser per slice would cost six times as much for
 * identical numbers.
 */
async function rebuildCorpus(): Promise<void> {
  const files = await expand(path.join(ROOT, 'docs/reference/plates/*.jpg'));
  const rows = await measure(files);
  const byName = new Map(rows.map((r) => [r.file.replace(/\.[^.]+$/, ''), r]));
  const corpus: Record<string, Corpus> = {
    FFXV: { label: 'FFXV', n: rows.length, files: rows.map((r) => r.file), median: medianRow(rows) },
  };
  for (const [label, names] of Object.entries(SUBSETS)) {
    const sel = names.map((n) => {
      const r = byName.get(n);
      if (!r) throw new Error(`subset ${label} names a plate that is not in docs/reference/plates: ${n}`);
      return r;
    });
    corpus[label] = { label, n: sel.length, files: sel.map((r) => r.file), median: medianRow(sel) };
  }
  await writeFile(CORPUS, JSON.stringify(corpus, null, 2));

  const nameW = 18;
  let head = 'corpus'.padEnd(nameW);
  for (const k of KEYS) head += HEAD[k].padStart(FMT[k][0]);
  console.log(head);
  console.log('-'.repeat(head.length));
  for (const c of Object.values(corpus)) console.log(fmtRow(`${c.label} (${c.n})`, c.median, nameW));
  console.log(`\nwrote ${Object.keys(corpus).length} corpora to ${path.relative(ROOT, CORPUS)}`);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const arg = (n: string, d?: string): string | undefined => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
  };
  const patterns = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && arg(argv[i - 1].slice(2)) === a));
  if (argv.includes('--subsets')) { await rebuildCorpus(); return; }
  if (!patterns.length) {
    console.error('usage: imagestats.mts "<glob|dir|file>" [--label NAME] [--save] [--against LABEL] [--json out.json]');
    console.error('       imagestats.mts --subsets      # rebuild the whole reference corpus, all slices');
    process.exit(1);
  }

  const files = (await Promise.all(patterns.map(expand))).flat();
  if (!files.length) { console.error(`no images matched ${patterns.join(' ')}`); process.exit(1); }

  const rows = await measure(files);

  const nameW = Math.max(16, ...rows.map((r) => r.file.length)) + 2;
  let head = 'file'.padEnd(nameW);
  for (const k of KEYS) head += HEAD[k].padStart(FMT[k][0]);
  console.log(head);
  console.log('-'.repeat(head.length));
  for (const r of rows) console.log(fmtRow(r.file, r, nameW));
  console.log('-'.repeat(head.length));

  const med = medianRow(rows);
  const label = arg('label', 'MEDIAN')!;
  console.log(fmtRow(`${label} (n=${rows.length})`, med, nameW));

  const against = arg('against');
  if (against) {
    const corpus: Record<string, Corpus> = JSON.parse(await readFile(CORPUS, 'utf8'));
    const ref = corpus[against];
    if (!ref) {
      console.error(`\nno corpus labelled "${against}" in ${path.relative(ROOT, CORPUS)} — have: ${Object.keys(corpus).join(', ')}`);
      process.exit(1);
    }
    console.log(fmtRow(`${against} (n=${ref.n})`, ref.median, nameW));
    const delta = {} as Stats;
    for (const k of KEYS) delta[k] = med[k] - ref.median[k];
    console.log(fmtRow('DELTA', delta, nameW));
    console.log('');
    console.log(verdict(med, ref.median));
  }

  if (arg('json')) await writeFile(path.resolve(arg('json')!), JSON.stringify({ label, rows, median: med }, null, 2));
  if (argv.includes('--save')) {
    let corpus: Record<string, Corpus> = {};
    try { corpus = JSON.parse(await readFile(CORPUS, 'utf8')); } catch { /* first save */ }
    corpus[label] = { label, n: rows.length, files: rows.map((r) => r.file), median: med };
    await writeFile(CORPUS, JSON.stringify(corpus, null, 2));
    console.log(`\nsaved corpus "${label}" (n=${rows.length}) to ${path.relative(ROOT, CORPUS)}`);
  }
}

/**
 * Turn the delta into sentences, because a twelve-column table does not tell a
 * grading agent what to change.
 *
 * **Every line is a comparison to the named reference slice, never to an
 * absolute.** The first draft of this function asserted "highlights should be
 * warm, shadows cool" straight out of `ART-DIRECTION.md` §1 and then measured
 * FFXV itself failing its own rule: whole-corpus `hi(R-B)` is -19.8, and on
 * `FFXV-field` it is -13.5 against a shadow arm of +5.8. The rule is not wrong
 * — the metric is confounded. Outdoors the brightest quartile of a frame is
 * mostly SKY, which is strongly blue, and the darkest quartile is mostly
 * ground, which is warm; that swamps a split-tone worth a few levels on lit
 * surfaces. Indoors it inverts: `FFXV-actor`, which has no sky in it, reads
 * sh -2.5 / hi +15.6, which is exactly the eyedropper's answer.
 *
 * So the direction of `hi - sh` is a fact about how much sky is in the shot,
 * and it is only informative between two corpora that have comparable amounts
 * of it. Hence `SUBSETS`, and hence: judge a vista against `FFXV-field`, not
 * against `FFXV`.
 *
 * Thresholds are tolerances on the reference, not targets of their own, and
 * they are deliberately loose. A shot list that is not scene-matched cannot be
 * judged tightly and this function will happily lie if you ask it to.
 */
function verdict(ours: Stats, ref: Stats): string {
  const out: string[] = [];
  const say = (bad: boolean, msg: string) => out.push(`${bad ? 'OFF ' : 'ok  '} ${msg}`);
  const d = (k: keyof Stats): string => `${ours[k].toFixed(1)} vs ${ref[k].toFixed(1)}`;

  say(Math.abs(ours.shRmB - ref.shRmB) > 8,
    `shadow warmth  R-B ${d('shRmB')}${ours.shRmB > ref.shRmB ? ' — our shadows are warmer than the reference' : ' — our shadows are cooler than the reference'}`);
  say(Math.abs(ours.hiRmB - ref.hiRmB) > 8,
    `highlight warmth R-B ${d('hiRmB')}${ours.hiRmB > ref.hiRmB ? ' — our highlights are warmer' : ' — our highlights are cooler'}`);
  say(Math.abs((ours.hiRmB - ours.shRmB) - (ref.hiRmB - ref.shRmB)) > 12,
    `split-tone SPREAD hi-sh ${(ours.hiRmB - ours.shRmB).toFixed(1)} vs ${(ref.hiRmB - ref.shRmB).toFixed(1)} — confounded by sky fraction; only read this against a scene-matched slice`);
  say(ours.clip < ref.clip * 0.25,
    `clipping ${ours.clip.toFixed(2)}% vs ${ref.clip.toFixed(2)}% — nothing in the frame reaches white. Zero clipping is what makes a grade read veiled`);
  say(ours.clip > ref.clip * 4 + 1,
    `clipping ${ours.clip.toFixed(2)}% vs ${ref.clip.toFixed(2)}% — blowing out far more of the frame than the reference does`);
  say(ours.p01 > ref.p01 + 8,
    `black point ${d('p01')} — lifted further than the reference; the frame will read hazy`);
  say(ours.p50 < ref.p50 - 20 || ours.p50 > ref.p50 + 20,
    `median luma ${d('p50')} — where the mass of the image sits`);
  say(ours.sat > ref.sat + 6,
    `saturation ${ours.sat.toFixed(1)}% vs ${ref.sat.toFixed(1)}% — FFXV is a desaturated grade; sunlit grass medians olive #6f753b`);
  say(ours.sat < ref.sat - 8,
    `saturation ${ours.sat.toFixed(1)}% vs ${ref.sat.toFixed(1)}% — flatter than the reference, which is a different failure from being too punchy`);
  say(Math.abs(ours.meanL - ref.meanL) > 25,
    `exposure, mean luma ${d('meanL')}`);
  say(ours.stops < ref.stops - 1.5,
    `range ${ours.stops.toFixed(2)} stops vs ${ref.stops.toFixed(2)} — using less of the display than the reference does`);
  return out.join('\n');
}

main().catch((e: unknown) => { console.error(e); process.exit(1); });
