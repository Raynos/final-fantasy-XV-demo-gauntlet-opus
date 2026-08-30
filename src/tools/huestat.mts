#!/usr/bin/env node
/**
 * How many hues is a frame actually made of?
 *
 *   node src/tools/huestat.mts tmp/shots/x/zone_three_valleys.png
 *   node src/tools/huestat.mts "tmp/shots/x/*.png" --slice 0.45
 *   node src/tools/huestat.mts --plates FFXV-field            # the reference slice
 *
 * **Why this exists.** The tell is "one hue per frame — `zone_three_valleys` is
 * brown, entirely", and nothing in the harness could measure it.
 * `imagestats.mts` reports `sat%`, which is *how far from grey* the frame is,
 * not *how many directions from grey it goes*: a frame that is one saturated
 * ochre from corner to corner and a frame carrying ochre sand, olive scrub and
 * cool grey rock can post the same `sat%`. And `imagestats.mts:418` warns in
 * its own output that its chroma columns are "confounded by sky fraction; only
 * read this against a scene-matched slice", which is the caveat that makes a
 * naive whole-frame hue reading worthless: sky is the largest, bluest, most
 * uniform object in an outdoor frame, so any frame with more of it looks like
 * it has more hue range while its *ground* is exactly as monochrome.
 *
 * ## The slice
 *
 * So this measures a **slice, not a frame**: by default the bottom 45 % of the
 * image, which is ground in our vistas and ground-plus-actor in the field
 * plates, and which contains no sky in either. `--slice 1.0` measures the whole
 * frame and is what you use to show the confound rather than to grade.
 *
 * Within the slice a pixel votes only if it has a hue worth reading: luma in
 * 12..245 (crushed black and clipped white have no reliable hue) and chroma
 * `max−min` ≥ 8 levels. Each voting pixel is weighted by its chroma, because a
 * barely-tinted grey should not count as much as a saturated one.
 *
 * ## The columns
 *
 * - **`arc90`** — the width in degrees of the *narrowest contiguous arc of hue*
 *   that holds 90 % of the slice's chroma mass. This is the headline. A frame
 *   that is one colour has a small number; a frame with sand, scrub and cool
 *   rock has a large one. It is contiguous on purpose: three hues 20° apart are
 *   one hue with noise, and this says so.
 * - **`dom`** — the share of chroma mass inside the single busiest 30° window,
 *   and the hue at its centre. "Brown, entirely" is a `dom` near 100 %.
 * - **`2nd`** — the share in the busiest 30° window that is at least 45° away
 *   from `dom`. **This is the number the plan's task 22 turns on**: a second hue
 *   that survives the slice, rather than a second hue that was the sky.
 * - **`chroma`** — mean `max−min` over the voting pixels, for scale. A big
 *   `arc90` on a slice with a chroma of 3 is measuring noise.
 *
 * blind to: WHERE the hues are, and therefore to the difference between a
 *           second hue that reads as a distinct material and the same second
 *           hue dusted evenly over every pixel. Look at the frame.
 *
 * Decodes PNG directly; anything else goes through `sips`, as `shrink.mts` does.
 */
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { decodePng } from './imgdiff.mts';

const exec = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');

/** The reference sets, kept in step with `imagestats.mts`'s own SUBSETS. */
const PLATES: Record<string, string[]> = {
  'FFXV-field': [
    'beast-party-plains-03', 'behemoth-deadeye-duscae-02', 'camp-cooking-01',
    'duscae-plains-lake-01', 'duscae-plains-noon-05', 'duscae-wilderness-04',
    'party-roadtrip-galdin-01', 'party-three-field-02', 'town-daytime-altissia-01',
    'water-lake-01',
  ],
};

const BINS = 72;                 // 5 degrees each
const DEG = 360 / BINS;
const WIN = Math.round(30 / DEG); // the 30-degree window `dom` and `2nd` use

/** A coarse name for a hue angle, so a row reads without a colour picker. */
function hueName(h: number): string {
  const names: [number, string][] = [
    [15, 'red'], [40, 'ochre'], [55, 'amber'], [70, 'yellow'], [100, 'olive'],
    [150, 'green'], [190, 'teal'], [230, 'blue'], [280, 'violet'], [330, 'magenta'],
    [360, 'red'],
  ];
  for (const [lim, n] of names) if (h < lim) return n;
  return 'red';
}

async function decode(file: string) {
  if (file.toLowerCase().endsWith('.png')) return decodePng(await readFile(file));
  const dir = await mkdtemp(path.join(tmpdir(), 'huestat-'));
  const out = path.join(dir, 'x.png');
  try {
    await exec('sips', ['-s', 'format', 'png', file, '--out', out]);
    return decodePng(await readFile(out));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

interface Row { file: string; arc90: number; dom: number; domH: number; second: number; secondH: number; chroma: number; n: number }

async function measure(file: string, slice: number): Promise<Row> {
  const img = await decode(file);
  const y0 = Math.round(img.h * (1 - slice));
  const hist = new Float64Array(BINS);
  let chroma = 0, n = 0;
  for (let y = y0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const s = (y * img.w + x) * img.ch;
      const r = img.data[s]!, g = img.data[s + 1] ?? r, b = img.data[s + 2] ?? r;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const c = mx - mn;
      if (c < 8) continue;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum < 12 || lum > 245) continue;
      let h: number;
      if (mx === r) h = 60 * (((g - b) / c) % 6);
      else if (mx === g) h = 60 * ((b - r) / c + 2);
      else h = 60 * ((r - g) / c + 4);
      if (h < 0) h += 360;
      hist[Math.min(BINS - 1, Math.floor(h / DEG))] += c;
      chroma += c; n++;
    }
  }
  const total = hist.reduce((a, v) => a + v, 0) || 1;

  // Narrowest contiguous arc holding 90% of the chroma mass. Contiguous on a
  // circle, so every start bin is tried; a hue distribution is not a line.
  let arc = BINS;
  for (let start = 0; start < BINS; start++) {
    let acc = 0;
    for (let k = 0; k < BINS; k++) {
      acc += hist[(start + k) % BINS]!;
      if (acc >= 0.90 * total) { if (k + 1 < arc) arc = k + 1; break; }
    }
  }

  // Busiest 30-degree window, then the busiest one at least 45 degrees off it.
  const win = (i: number) => {
    let s = 0;
    for (let k = 0; k < WIN; k++) s += hist[(i + k) % BINS]!;
    return s;
  };
  let best = 0, bestI = 0;
  for (let i = 0; i < BINS; i++) { const s = win(i); if (s > best) { best = s; bestI = i; } }
  const domH = ((bestI + WIN / 2) * DEG) % 360;
  let sec = 0, secI = bestI;
  for (let i = 0; i < BINS; i++) {
    const centre = ((i + WIN / 2) * DEG) % 360;
    let d = Math.abs(centre - domH); if (d > 180) d = 360 - d;
    if (d < 45) continue;
    const s = win(i); if (s > sec) { sec = s; secI = i; }
  }
  return {
    file: file.split('/').slice(-1)[0]!,
    arc90: arc * DEG, dom: 100 * best / total, domH,
    second: 100 * sec / total, secondH: ((secI + WIN / 2) * DEG) % 360,
    chroma: n ? chroma / n : 0, n,
  };
}

const argv = process.argv.slice(2);
const num = (name: string, d: number) => { const i = argv.indexOf(name); return i >= 0 ? Number(argv[i + 1]) : d; };
const str = (name: string) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] ?? '' : ''; };
const slice = num('--slice', 0.45);
const plates = str('--plates');
const positional: string[] = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i]!.startsWith('--')) { i++; continue; }
  positional.push(argv[i]!);
}
const files = plates
  ? (PLATES[plates] ?? []).map((f) => path.join(ROOT, 'docs/reference/plates', `${f}.jpg`))
  : positional;

if (files.length === 0) {
  console.error('usage: huestat.mts <img ...> [--slice 0.45]   |   huestat.mts --plates FFXV-field');
  process.exit(2);
}

const rows: Row[] = [];
for (const f of files) rows.push(await measure(f, slice));

const w = Math.max(12, ...rows.map((r) => r.file.length));
console.log(`slice: bottom ${(100 * slice).toFixed(0)}% of frame`);
console.log(`${'file'.padEnd(w)}  arc90   dom  dom hue        2nd  2nd hue      chroma`);
console.log('-'.repeat(w + 58));
const line = (r: Row) => `${r.file.padEnd(w)}  ${r.arc90.toFixed(0).padStart(4)}°  ` +
  `${r.dom.toFixed(1).padStart(5)}%  ${r.domH.toFixed(0).padStart(3)}° ${hueName(r.domH).padEnd(8)}  ` +
  `${r.second.toFixed(1).padStart(5)}%  ${r.secondH.toFixed(0).padStart(3)}° ${hueName(r.secondH).padEnd(8)}  ` +
  `${r.chroma.toFixed(1).padStart(5)}`;
for (const r of rows) console.log(line(r));
if (rows.length > 1) {
  const med = (k: keyof Row) => {
    const v = rows.map((r) => r[k] as number).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)]!;
  };
  console.log('-'.repeat(w + 58));
  console.log(line({
    file: `MEDIAN (n=${rows.length})`, arc90: med('arc90'), dom: med('dom'), domH: med('domH'),
    second: med('second'), secondH: med('secondH'), chroma: med('chroma'), n: 0,
  }));
}
console.log('\narc90 = narrowest contiguous hue arc holding 90% of the slice\'s chroma mass.');
console.log('dom = share in the busiest 30° window; 2nd = busiest window >=45° away from it.');
console.log('blind to WHERE the hues are: a second hue dusted evenly over every pixel');
console.log('scores the same as one that reads as a distinct material. Look at the frame.');
