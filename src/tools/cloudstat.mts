#!/usr/bin/env node
/**
 * The cloud deck, as five numbers.
 *
 *   node src/tools/cloudstat.mts tmp/shots/l4-base [--roi x,y,w,h] [--label base]
 *   node src/tools/cloudstat.mts a.png b.png --roi 20,10,1560,200
 *
 * **Why this exists.** The blind judge's cloud complaint is three separate
 * defects and the harness could measure none of them directly:
 *
 * 1. *"no internal dynamic range"* — `imagestats` reports `stops` over a whole
 *    frame or a hand-cut crop, so the number is dominated by the blue sky
 *    behind the deck and by whatever terrain leaked into the box. What the
 *    judge is looking at is the range **inside the cloud body**, crown to
 *    self-shadowed base, and that needs the sky masked out first.
 * 2. *"reads defocused"* — the interesting statistic is not `edgestat`'s
 *    hard/speck (those measure an alpha-cutout, the opposite defect) but the
 *    **width of the luminance ramp** from sky to body across the silhouette,
 *    in pixels. A cauliflower boundary crosses in 2-5 px; ours took 15-20.
 * 3. *"a grid-ish scatter of identical white puff sprites"* — cell-size
 *    variance and directionality, which live in the **mask**, not in the
 *    pixels: the spread of connected-component areas, and the ratio of
 *    horizontal to vertical cloud run lengths (streets are runs that are long
 *    in one direction).
 *
 * All three are computed off one Otsu split of the ROI into sky and cloud on
 * **saturation** — see the comment on the split itself for why brightness is
 * the wrong axis and cost a whole sweep to find out.
 *
 * ## Columns
 *
 * | column | meaning | want |
 * |---|---|---|
 * | `cov%`   | fraction of ROI classified cloud | context; a mask under ~4% makes the rest noise |
 * | `stops`  | log2 linear Y p99.9/p0.1 over the WHOLE roi | context, comparable to `imagestats` |
 * | `bStops` | linear Y p99/p1 over CLOUD pixels only, pooled | context |
 * | `cStops` | the median of that p95/p5 range taken WITHIN one cloud — **the judge's dynamic range** | ≥ 2.0 |
 * | `bP50`   | median cloud-body luminance, 0-255 | not clipping toward 255 |
 * | `clip%`  | cloud pixels with any channel ≥ 254 | ≤ 2x the reference arm |
 * | `ramp`   | median sky→body 10-90% crossing width, px | small = crisp |
 * | `rampT`  | the same for **top** edges only (sky above, cloud below) | T16's number |
 * | `cells`  | connected cloud components ≥ 40 px | > 1 or the rest is meaningless |
 * | `aVar`   | log2 of component-area p85 / p15 — **cell-size variance** | ≥ 2.5 |
 * | `aniso`  | median horizontal run / median vertical run — **streets** | ≥ 1.5 for a directional field |
 *
 * Absolute values only mean something against the same ROI on the same shot,
 * which is why the ROI table below is fixed per shot and checked in. Change a
 * box and every recorded number in `project/handoff/lane4-clouds.md` is void.
 */
import { readFile, readdir } from 'node:fs/promises';
import { statSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { decodePng } from './imgdiff.mts';

interface Roi { x: number, y: number, w: number, h: number }

/**
 * Fixed sky boxes, one per shot, chosen to hold cloud and blue sky and no
 * terrain at 1600x900. Terrain in the box moves Otsu's threshold, which moves
 * every column at once, so these are deliberately conservative.
 */
const ROIS: Record<string, Roi> = {
  vista_noon:         { x: 20, y: 8, w: 1560, h: 292 },
  zone_vannath:       { x: 20, y: 8, w: 1560, h: 200 },
  zone_three_valleys: { x: 20, y: 8, w: 1560, h: 200 },
  vista_dusk:         { x: 20, y: 8, w: 1560, h: 200 },
  zone_longwythe:     { x: 20, y: 8, w: 1560, h: 200 },
  zone_lestallum:     { x: 20, y: 8, w: 1560, h: 180 },
};
const DEFAULT_ROI: Roi = { x: 20, y: 8, w: 1560, h: 200 };

const files: string[] = [];
let roiOverride: Roi | null = null;
let label = '';
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]!;
  if (a === '--roi') {
    const [x, y, w, h] = argv[++i]!.split(',').map(Number);
    roiOverride = { x: x!, y: y!, w: w!, h: h! };
  } else if (a === '--label') label = argv[++i]!;
  else files.push(a);
}
if (!files.length) {
  console.error('usage: cloudstat.mts <dir|png...> [--roi x,y,w,h] [--label NAME]');
  process.exit(2);
}

/** Expand a directory argument into the PNGs it holds, in ROI-table order. */
async function expand(paths: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const p of paths) {
    let isDir = false;
    try { isDir = statSync(p).isDirectory(); } catch { /* a missing file reports itself below */ }
    if (!isDir) { out.push(p); continue; }
    const names = (await readdir(p)).filter((n) => extname(n) === '.png');
    const known = Object.keys(ROIS);
    names.sort((a, b) => {
      const ia = known.indexOf(basename(a, '.png')), ib = known.indexOf(basename(b, '.png'));
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    for (const n of names) out.push(join(p, n));
  }
  return out;
}

/** Otsu's threshold over a 256-bin luminance histogram. */
function otsu(hist: Float64Array, n: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i]!;
  let sumB = 0, wB = 0, best = 0, bestVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (wB === 0) continue;
    const wF = n - wB;
    if (wF === 0) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > bestVar) { bestVar = v; best = t; }
  }
  return best;
}

const s2l = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const ONE_LEVEL = s2l(1);

const pct = (sorted: ArrayLike<number>, p: number): number =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]! : 0;

const stopsOf = (lin: number[]): number => {
  if (lin.length < 16) return 0;
  lin.sort((a, b) => a - b);
  return Math.log2(Math.max(pct(lin, 0.999), ONE_LEVEL) / Math.max(pct(lin, 0.001), ONE_LEVEL));
};

interface Row { name: string, cov: number, stops: number, bStops: number, cStops: number,
  bP50: number, clip: number, ramp: number, rampT: number, cells: number, aVar: number,
  aniso: number }

function analyse(name: string, img: { w: number, h: number, data: Uint8Array | Uint8ClampedArray }, roi: Roi): Row {
  const W = img.w, chn = img.data.length / (img.w * img.h);
  const x0 = Math.max(0, roi.x), y0 = Math.max(0, roi.y);
  const x1 = Math.min(img.w, roi.x + roi.w), y1 = Math.min(img.h, roi.y + roi.h);
  const rw = x1 - x0, rh = y1 - y0;

  // luminance, linear luminance and SATURATION over the ROI, ROI-local.
  //
  // Cloud is classified on saturation, not on brightness, and that is the
  // whole reason this tool can answer task 17 when a luminance split cannot.
  // The statistic under test is "how dark does the self-shadowed side of a
  // cumulus get", and every lever that darkens it also pushes those pixels
  // below a luminance threshold -- so they leave the class, the surviving
  // body gets a higher p5, and the range reads as UNCHANGED or WORSE for a
  // change that did exactly what was asked. Measured, on vista_noon:
  // `uCloudMS` 0.62 -> 0.34 took the luminance-classified mask from 27.0 % of
  // the box to 24.5 % and `cStops` from 1.39 to 1.29, which is the classifier
  // reporting on itself. Sky here is deeply blue (S ~ 0.8) and cloud is near
  // neutral whatever its value (S ~ 0.05 lit, ~ 0.2 in shade), so a
  // saturation split holds still while the deck's exposure moves under it.
  const lum = new Float64Array(rw * rh);
  const lin = new Float64Array(rw * rh);
  const clipPx = new Uint8Array(rw * rh);
  const hist = new Float64Array(256);
  const sat = new Float64Array(rw * rh);
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const s = ((y0 + y) * W + (x0 + x)) * chn;
      const r = img.data[s]!, g = img.data[s + 1]!, b = img.data[s + 2]!;
      const k = y * rw + x;
      lum[k] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lin[k] = 0.2126 * s2l(r) + 0.7152 * s2l(g) + 0.0722 * s2l(b);
      clipPx[k] = (r >= 254 || g >= 254 || b >= 254) ? 1 : 0;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      sat[k] = 255 * (mx - mn) / Math.max(mx, 1);
      hist[Math.max(0, Math.min(255, Math.round(sat[k]!)))]++;
    }
  }
  const n = rw * rh;
  // low saturation == cloud, so the class below the threshold is the body
  const t = otsu(hist, n);

  // class means IN LUMINANCE either side of the saturation split -- the ramp
  // is a luminance crossing between the two classes the mask actually names.
  let sLo = 0, cLo = 0, sHi = 0, cHi = 0;
  for (let k = 0; k < n; k++) {
    if (sat[k]! <= t) { sHi += lum[k]!; cHi++; } else { sLo += lum[k]!; cLo++; }
  }
  const mLo = cLo ? sLo / cLo : 0, mHi = cHi ? sHi / cHi : 255;
  const gap = Math.max(1, mHi - mLo);
  const lo10 = mLo + gap * 0.10, hi90 = mLo + gap * 0.90;

  // --- body statistics: cloud pixels only ---------------------------------
  const bodyLin: number[] = [];
  const bodyLum: number[] = [];
  let clipN = 0;
  const mask = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    if (sat[k]! <= t) {
      mask[k] = 1;
      bodyLin.push(lin[k]!);
      bodyLum.push(lum[k]!);
      if (clipPx[k]) clipN++;
    }
  }
  const allLin: number[] = Array.from(lin);
  bodyLum.sort((a, b) => a - b);
  bodyLin.sort((a, b) => a - b);

  // --- ramp width ----------------------------------------------------------
  // Walk each row and each column; wherever the signal crosses from below lo10
  // to above hi90 (or back) monotonically, record how many pixels it took.
  const ramps: number[] = [];
  const rampsTop: number[] = [];
  const scan = (get: (i: number) => number, len: number, topward: boolean) => {
    let i = 0;
    while (i < len) {
      if (get(i) <= lo10) {
        let j = i;
        while (j + 1 < len && get(j + 1) > get(j) && get(j) < hi90) j++;
        if (j < len && get(j) >= hi90 && j - i <= 60 && j > i) {
          ramps.push(j - i);
          if (topward) rampsTop.push(j - i);
        }
        i = Math.max(i + 1, j);
      } else i++;
    }
  };
  for (let y = 0; y < rh; y += 2) scan((x) => lum[y * rw + x]!, rw, false);
  // vertical, downward only: sky above, cloud below == the sunlit TOP edge
  for (let x = 0; x < rw; x += 2) scan((y) => lum[y * rw + x]!, rh, true);
  ramps.sort((a, b) => a - b);
  rampsTop.sort((a, b) => a - b);

  // --- mask morphology: cells and anisotropy -------------------------------
  // connected components, 4-connected, iterative flood so a big deck cannot
  // blow the stack.
  const seen = new Uint8Array(n);
  const areas: number[] = [];
  const cellStops: number[] = [];
  const stack: number[] = [];
  for (let k = 0; k < n; k++) {
    if (!mask[k] || seen[k]) continue;
    let area = 0;
    stack.length = 0;
    stack.push(k);
    seen[k] = 1;
    const cellLin: number[] = [];
    while (stack.length) {
      const c = stack.pop()!;
      area++;
      cellLin.push(lin[c]!);
      const cx = c % rw, cy = (c / rw) | 0;
      if (cx > 0 && mask[c - 1] && !seen[c - 1]) { seen[c - 1] = 1; stack.push(c - 1); }
      if (cx < rw - 1 && mask[c + 1] && !seen[c + 1]) { seen[c + 1] = 1; stack.push(c + 1); }
      if (cy > 0 && mask[c - rw] && !seen[c - rw]) { seen[c - rw] = 1; stack.push(c - rw); }
      if (cy < rh - 1 && mask[c + rw] && !seen[c + rw]) { seen[c + rw] = 1; stack.push(c + rw); }
    }
    if (area >= 40) areas.push(area);
    // The judge's sentence is "the crown and the self-shadowed base of ONE
    // cumulus differ by well under a stop", so the statistic has to be
    // within-component. Pooling the whole mask instead measures the spread
    // between a near cloud and a hazed-out distant one, which is aerial
    // perspective and moves for reasons that have nothing to do with the
    // lighting march. p5..p95 rather than p0.1..p99.9 because a component's
    // outermost ring straddles the classifier and would otherwise set the
    // low end by construction.
    if (area >= 2000) {
      cellLin.sort((a, b) => a - b);
      cellStops.push(Math.log2(
        Math.max(pct(cellLin, 0.95), ONE_LEVEL) / Math.max(pct(cellLin, 0.05), ONE_LEVEL)));
    }
  }
  areas.sort((a, b) => a - b);
  cellStops.sort((a, b) => a - b);
  const aVar = areas.length >= 4
    ? Math.log2(Math.max(1, pct(areas, 0.85)) / Math.max(1, pct(areas, 0.15))) : 0;

  // run lengths of the mask, horizontal against vertical. A run that touches
  // the ROI border is dropped: it is a truncated measurement, and on a wide
  // shallow box that is exactly the vertical runs that matter.
  const runsH: number[] = [], runsV: number[] = [];
  for (let y = 0; y < rh; y++) {
    let run = 0;
    for (let x = 0; x < rw; x++) {
      if (mask[y * rw + x]) run++;
      else { if (run > 0 && x - run > 0) runsH.push(run); run = 0; }
    }
  }
  for (let x = 0; x < rw; x++) {
    let run = 0;
    for (let y = 0; y < rh; y++) {
      if (mask[y * rw + x]) run++;
      else { if (run > 0 && y - run > 0) runsV.push(run); run = 0; }
    }
  }
  runsH.sort((a, b) => a - b);
  runsV.sort((a, b) => a - b);
  const aniso = runsV.length && runsH.length
    ? pct(runsH, 0.75) / Math.max(1, pct(runsV, 0.75)) : 0;

  return {
    name,
    cov: 100 * bodyLin.length / n,
    stops: stopsOf(allLin),
    bStops: bodyLin.length >= 16
      ? Math.log2(Math.max(pct(bodyLin, 0.99), ONE_LEVEL) / Math.max(pct(bodyLin, 0.01), ONE_LEVEL))
      : 0,
    cStops: pct(cellStops, 0.5),
    bP50: pct(bodyLum, 0.5),
    clip: bodyLum.length ? 100 * clipN / bodyLum.length : 0,
    ramp: pct(ramps, 0.5),
    rampT: pct(rampsTop, 0.5),
    cells: areas.length,
    aVar,
    aniso,
  };
}

const rows: Row[] = [];
for (const f of await expand(files)) {
  const img = decodePng(await readFile(f));
  const key = basename(f, extname(f));
  const roi = roiOverride ?? ROIS[key] ?? DEFAULT_ROI;
  rows.push(analyse(key, img, roi));
}

const COLS: [keyof Row, string, number, number][] = [
  ['cov', 'cov%', 7, 1], ['stops', 'stops', 7, 2], ['bStops', 'bStops', 7, 2],
  ['cStops', 'cStops', 7, 2], ['bP50', 'bP50', 6, 0], ['clip', 'clip%', 7, 2], ['ramp', 'ramp', 5, 0],
  ['rampT', 'rampT', 6, 0], ['cells', 'cells', 6, 0], ['aVar', 'aVar', 6, 2],
  ['aniso', 'aniso', 6, 2],
];
const nameW = Math.max(18, ...rows.map((r) => r.name.length + 1));
console.log(`${label ? label + '  ' : ''}${'shot'.padEnd(nameW)}${COLS.map(([, h, w]) => h.padStart(w)).join('')}`);
for (const r of rows) {
  console.log(`${label ? ' '.repeat(label.length + 2) : ''}${r.name.padEnd(nameW)}${
    COLS.map(([k, , w, d]) => (r[k] as number).toFixed(d).padStart(w)).join('')}`);
}
