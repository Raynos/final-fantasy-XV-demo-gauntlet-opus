#!/usr/bin/env node
/**
 * How hard is an alpha-tested silhouette?
 *
 *   node src/tools/edgestat.mts a.png [b.png ...] [--roi x,y,w,h] [--roi ...]
 *
 * The blind judge's round-5 number one was *"aggressive alpha-cutout with
 * speckled, dithered edges eating the silhouette"*, and at 8x that is exactly
 * what a treeline is: every leaf boundary resolves to one full-contrast step
 * from canopy to sky with no partial coverage anywhere, plus isolated single
 * texels flicked off into the sky.
 *
 * `reliefstat.mts` cannot see this -- it measures RMS contrast per octave, and
 * a binary edge and a coverage-antialiased edge carry nearly the same energy.
 * What separates them is how that energy is *distributed across neighbouring
 * pixels*: antialiasing turns one 100/255 step into two 50/255 steps, and it
 * cannot leave a texel that disagrees with all four of its neighbours.
 *
 * So, over an ROI, on luminance:
 *
 *   edge px   fraction of pixels whose largest 4-neighbour difference is >= 8.
 *             Goes *up* under AA: the same silhouette occupies more pixels.
 *   hard      of those, the fraction stepping >= 48/255 in one hop. This is
 *             the statistic the defect lives in. A binary cut is ~all hard.
 *   p50 p90   the step-size distribution of the edge pixels themselves.
 *   speck     per 10k px, texels differing from *all four* neighbours by >= 24
 *             in the same direction -- the "speckled, dithered" half, and the
 *             one thing a coverage-resolved edge structurally cannot produce.
 *   mid       fraction of ROI pixels sitting between the two Otsu classes
 *             (within the middle 50% of the gap between the class means).
 *             Partial coverage *is* this band; a binary cut has almost none.
 *
 * Compare captures pairwise; the absolute numbers only mean something against
 * the same ROI on the same shot.
 */
import { readFile } from 'node:fs/promises';
import { decodePng } from './imgdiff.mts';

interface Roi { x: number, y: number, w: number, h: number }

const files: string[] = [];
const rois: Roi[] = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--roi') {
    const [x, y, w, h] = argv[++i].split(',').map(Number);
    rois.push({ x, y, w, h });
  } else files.push(argv[i]);
}
if (!files.length) {
  console.error('usage: edgestat.mts a.png [b.png ...] [--roi x,y,w,h]');
  process.exit(2);
}

/** Otsu's threshold over a 256-bin luminance histogram. */
function otsu(hist: Float64Array, n: number) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, bestVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = n - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > bestVar) { bestVar = v; best = t; }
  }
  return best;
}

interface Stats {
  edgeFrac: number, hardFrac: number, p50: number, p90: number,
  speck: number, mid: number, n: number,
}

function measure(lum: Float64Array, W: number, roi: Roi): Stats {
  const { x: x0, y: y0, w, h } = roi;
  const hist = new Float64Array(256);
  let n = 0;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      hist[Math.max(0, Math.min(255, Math.round(lum[y * W + x])))]++;
      n++;
    }
  }
  const t = otsu(hist, n);
  // class means either side of the threshold
  let sLo = 0, cLo = 0, sHi = 0, cHi = 0;
  for (let i = 0; i <= t; i++) { sLo += i * hist[i]; cLo += hist[i]; }
  for (let i = t + 1; i < 256; i++) { sHi += i * hist[i]; cHi += hist[i]; }
  const mLo = cLo ? sLo / cLo : 0, mHi = cHi ? sHi / cHi : 255;
  const gap = mHi - mLo;
  const midLo = mLo + gap * 0.25, midHi = mHi - gap * 0.25;

  const steps: number[] = [];
  let edge = 0, hard = 0, speck = 0, mid = 0, tot = 0;
  // one-pixel margin so every sampled pixel has all four neighbours
  for (let y = y0 + 1; y < y0 + h - 1; y++) {
    for (let x = x0 + 1; x < x0 + w - 1; x++) {
      const c = lum[y * W + x];
      tot++;
      if (c > midLo && c < midHi) mid++;
      const d = [
        c - lum[y * W + x - 1], c - lum[y * W + x + 1],
        c - lum[(y - 1) * W + x], c - lum[(y + 1) * W + x],
      ];
      let mx = 0;
      for (const v of d) mx = Math.max(mx, Math.abs(v));
      if (mx >= 8) {
        edge++;
        steps.push(mx);
        if (mx >= 48) hard++;
      }
      if ((d[0] >= 24 && d[1] >= 24 && d[2] >= 24 && d[3] >= 24)
        || (d[0] <= -24 && d[1] <= -24 && d[2] <= -24 && d[3] <= -24)) speck++;
    }
  }
  steps.sort((a, b) => a - b);
  const q = (p: number) => steps.length ? steps[Math.min(steps.length - 1, Math.floor(p * steps.length))] : 0;
  return {
    edgeFrac: edge / tot, hardFrac: edge ? hard / edge : 0,
    p50: q(0.5), p90: q(0.9), speck: (speck / tot) * 1e4, mid: mid / tot, n: tot,
  };
}

const rows: string[] = [];
for (const f of files) {
  const img = decodePng(await readFile(f));
  const ch = img.data.length / (img.w * img.h);
  const lum = new Float64Array(img.w * img.h);
  for (let i = 0, p = 0; i < lum.length; i++, p += ch) {
    lum[i] = 0.2126 * img.data[p] + 0.7152 * img.data[p + 1] + 0.0722 * img.data[p + 2];
  }
  const list = rois.length ? rois : [{ x: 0, y: 0, w: img.w, h: img.h }];
  for (const roi of list) {
    const s = measure(lum, img.w, roi);
    rows.push([
      f.padEnd(42),
      `${roi.x},${roi.y},${roi.w},${roi.h}`.padEnd(18),
      (s.edgeFrac * 100).toFixed(2).padStart(6),
      (s.hardFrac * 100).toFixed(1).padStart(6),
      s.p50.toFixed(1).padStart(5),
      s.p90.toFixed(1).padStart(5),
      s.speck.toFixed(1).padStart(6),
      (s.mid * 100).toFixed(2).padStart(6),
    ].join(' '));
  }
}
console.log(['file'.padEnd(42), 'roi'.padEnd(18), 'edge%', ' hard%', '  p50', '  p90', ' speck', '  mid%'].join(' '));
for (const r of rows) console.log(r);
