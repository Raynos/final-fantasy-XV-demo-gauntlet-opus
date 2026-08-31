#!/usr/bin/env node
/**
 * Is this surface WOVEN? — periodicity in a region of a frame.
 *
 *   node src/tools/weavestat.mts a.png                       # the checked-in ROIs
 *   node src/tools/weavestat.mts a.png b.png --roi 500,490,110,90
 *   node src/tools/weavestat.mts a.png --json tmp/weave.json
 *
 * Round 17's blind judge named "one rock albedo that repeats in an unmistakable
 * diagonal weave across the entire massif" as the second-strongest tell in the
 * whole corpus. A weave is not a brightness, a contrast or a hue, so no
 * existing instrument here can see it: `imagestats` reports means, `edgestat`
 * reports crossing widths, `reliefstat` reports a band pyramid. All three are
 * blind to the difference between a rock face and a tartan.
 *
 * ## The statistic
 *
 * A weave is a **repeat**, so measure recurrence. The ROI's luma is
 * high-passed (subtract a 9-px box blur, which removes shading and leaves
 * texture), Hann-windowed, and decomposed onto a polar grid of plane waves —
 * 36 directions by 24 periods from 4 to 40 px. `peak` is the **fraction of the
 * region's variance carried by the single strongest plane wave**.
 *
 *   peak < 0.05   no preferred wave: broadband texture, which is what rock is.
 *   peak > 0.15   a real periodicity — one wave carries a sixth of everything
 *                 the surface does, which is what the eye reads as printed.
 *
 * `lag` and `deg` name that wave's period in pixels and its direction, and
 * `n2` is the strongest wave at least 20 degrees away from it. **`n2` is
 * the weave column**: one strong direction is corduroy, or fluting, or
 * bedding, and can be entirely legitimate — a sedimentary stack is supposed to
 * band. Two strong directions crossing is a plaid, and nothing in a landscape
 * looks like that.
 *
 * ## Calibration — printed every run, never skipped
 *
 * Three synthetic ROIs with known answers go through the identical code path:
 *
 *   plaid     two crossing gratings at 13 and 8 px.  peak and n2 both high
 *   stripe    one grating at 13 px.                  peak high, n2 LOW
 *   noise     white noise, box-blurred to match.     peak and n2 both ~0
 *
 * If `stripe` does not separate from `plaid` on `n2`, the run prints VOID and
 * exits non-zero: an instrument that cannot tell one direction from two cannot
 * see this defect, and would score a correct bedded cliff as a fault.
 *
 * ## READ THIS BEFORE QUOTING A NUMBER: it did not move across a fix that works
 *
 * `04aacc9` replaced the runnel albedo's three fixed world azimuths with a
 * warped projection, and the plaid on `vista_noon`'s left peak visibly goes:
 * `?post=runnelflat` against shipped is 2.71/255 mean with 9.8 % of the frame
 * past 8/255, and side by side at 3x the tartan is a tartan in one and fluting
 * in the other. **This statistic reads 0.12 against 0.11.** On the tightest
 * box (`520,500,60,50`) both arms report the same wave: period 12 px, 85 deg,
 * and `n2` under 0.04 in both.
 *
 * That is not the instrument failing to see a change; it is the instrument
 * answering a different question from the judge's. LOCAL periodicity is not
 * what was wrong. Both arms are locally a 12 px near-vertical band family,
 * because runnels ARE a band family and are supposed to be. What was wrong is
 * that the family was the SAME family everywhere — one world azimuth ruled
 * across every face on the planet — and "repeats across the entire massif" is a
 * statement about coherence between distant regions, which no single-ROI
 * statistic can hold. The next version of this wants the *spread of `deg`
 * across many separated boxes on unrelated faces*, not the peak inside one.
 *
 * So: `peak` and `n2` are honest and calibrated, and a high `n2` is still real
 * evidence of a crossing plaid. A LOW pair is not evidence of absence, and a
 * lane that grades a global-repeat fix on this column will file a false null.
 *
 * ## Also blind to
 *
 * - **Aperiodic repetition.** A field that repeats its *statistics* without
 *   repeating its phase — the stochastic-tiling case — scores zero here and can
 *   still read as one texture. That is the `nostoch` axis, a different defect.
 * - **Everything outside the ROI.** The boxes below are hand-placed on faces.
 *   A capture reframed by a shot edit voids them, exactly as `cloudstat`'s do.
 * - **Perspective.** A receding face changes its band spacing across the box,
 *   which spreads one wave over several period bins and lowers `peak`. Smaller
 *   boxes read higher: the same face scores 0.05 at 110x90 and 0.12 at 60x50.
 * - **Scale.** 4-40 px at 1600x900 is the band the judge was looking at; a
 *   weave coarser than that is off the top of this pyramid, and a units check
 *   belongs before any claim about a band (`project/LANDMINES.md`).
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { decodePng } from './imgdiff.mts';

/** Hand-placed boxes on rock faces, x,y,w,h at 1600x900. */
const ROIS: Record<string, [number, number, number, number][]> = {
  vista_noon: [[500, 490, 110, 90], [860, 360, 150, 120], [1180, 430, 140, 110]],
  windpump_flats: [[900, 180, 200, 130], [1180, 200, 180, 140]],
  zone_longwythe: [[900, 120, 180, 160], [250, 320, 200, 90]],
  mesa_landmark: [[600, 300, 220, 150]],
  zone_ravatogh: [[600, 300, 220, 150]],
};

const args = process.argv.slice(2);
const files = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--roi'
  && args[i - 1] !== '--lag' && args[i - 1] !== '--json');
const flag = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
/** Longest period the plane-wave grid reaches, in pixels. */
const MAXLAG = Number(flag('--lag') || 40);
const roiArg = flag('--roi');
const jsonOut = flag('--json');

interface Row { peak: number; lag: number; deg: number; n2: number; deg2: number; rms: number }

/** High-pass: subtract a box blur of radius `r`, so shading goes and texture stays. */
function highpass(v: Float64Array, w: number, h: number, r: number) {
  const tmp = new Float64Array(w * h), out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let d = -r; d <= r; d++) { const q = x + d; if (q < 0 || q >= w) continue; s += v[y * w + q]; n++; }
    tmp[y * w + x] = s / n;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0, n = 0;
    for (let d = -r; d <= r; d++) { const q = y + d; if (q < 0 || q >= h) continue; s += tmp[q * w + x]; n++; }
    out[y * w + x] = v[y * w + x] - s / n;
  }
  return out;
}

/**
 * Directional power spectrum, and why NOT an autocorrelation peak.
 *
 * The first version of this measured the autocorrelation and looked for a
 * second peak at least 20 degrees off the first. It reported the synthetic
 * one-direction anchor at n2 = 0.93 against the plaid's 0.98 — VOID, correctly,
 * on its own calibration, and the reason is geometry rather than a bug: the
 * autocorrelation of a single grating is 1.0 for **every** displacement along
 * the stripes, so "a second strong direction" is free for any striped field.
 * An instrument built that way would have scored a correct bedded cliff and a
 * tartan the same, which is the exact failure this project keeps recording.
 *
 * A plane-wave decomposition does not have that degeneracy: one grating is one
 * wave vector, two crossing gratings are two. So this is a direct DFT on a
 * polar grid of candidate wave vectors — 36 directions by 24 periods from 4 to
 * 40 px — reporting the fraction of the ROI's variance each one carries.
 *
 * Hann-windowed in both axes, and that is load bearing: an unwindowed patch has
 * a step at every edge, whose spectrum is a cross of energy along the two axes,
 * and every ROI would report a horizontal and a vertical family it does not
 * have.
 */
function spectrum(f: Float64Array, w: number, h: number, maxPeriod: number): Row {
  const win = new Float64Array(w * h);
  let mean = 0;
  for (let i = 0; i < w * h; i++) mean += f[i];
  mean /= w * h;
  for (let y = 0; y < h; y++) {
    const wy = 0.5 - 0.5 * Math.cos((2 * Math.PI * y) / (h - 1));
    for (let x = 0; x < w; x++) {
      const wx = 0.5 - 0.5 * Math.cos((2 * Math.PI * x) / (w - 1));
      win[y * w + x] = (f[y * w + x] - mean) * wx * wy;
    }
  }
  let v0 = 0;
  for (let i = 0; i < w * h; i++) v0 += win[i] * win[i];
  const rms = Math.sqrt(v0 / (w * h));
  if (v0 < 1e-12) return { peak: 0, lag: 0, deg: 0, n2: 0, deg2: 0, rms: 0 };

  const cand: { c: number; lag: number; deg: number }[] = [];
  for (let ai = 0; ai < 36; ai++) {
    const a = (ai * Math.PI) / 36;
    const ca = Math.cos(a), sa = Math.sin(a);
    for (let pi = 0; pi < 24; pi++) {
      const period = 4 * Math.pow(maxPeriod / 4, pi / 23);  // 4 .. --lag px, log spaced
      const k = (2 * Math.PI) / period;
      let re = 0, im = 0;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const ph = k * (x * ca + y * sa);
          const v = win[y * w + x];
          re += v * Math.cos(ph); im -= v * Math.sin(ph);
        }
      }
      // Fraction of the windowed variance carried by this plane wave. The 2
      // is the pair (+k, -k), which a real field always carries together.
      cand.push({ c: (2 * (re * re + im * im)) / (v0 * w * h), lag: period, deg: (a * 180) / Math.PI });
    }
  }
  cand.sort((a, b) => b.c - a.c);
  const first = cand[0] || { c: 0, lag: 0, deg: 0 };
  const sep = (a: number, b: number) => { const d = Math.abs(a - b) % 180; return d > 90 ? 180 - d : d; };
  const second = cand.find((q) => sep(q.deg, first.deg) >= 20) || { c: 0, lag: 0, deg: 0 };
  return { peak: first.c, lag: first.lag, deg: first.deg, n2: second.c, deg2: second.deg, rms };
}

function score(v: Float64Array, w: number, h: number) {
  return spectrum(highpass(v, w, h, 8), w, h, MAXLAG);
}

function synth(kind: 'plaid' | 'stripe' | 'noise', w = 110, h = 90) {
  const f = new Float64Array(w * h);
  let s = 12345;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff - 0.5; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 0.35 * rnd();
    if (kind !== 'noise') v += Math.sin((2 * Math.PI * (x * 0.92 + y * 0.39)) / 13);
    if (kind === 'plaid') v += Math.sin((2 * Math.PI * (x * 0.42 - y * 0.91)) / 8);
    f[y * w + x] = v;
  }
  return { f, w, h };
}

const CAL: Record<string, Row> = {};
for (const k of ['plaid', 'stripe', 'noise'] as const) {
  const { f, w, h } = synth(k);
  CAL[k] = score(f, w, h);
}
// Separation, not an absolute level. The box high-pass rolls a 13 px wave off
// harder than an 8 px one, so the plaid's weaker family lands near 0.09 and a
// fixed 0.25 bar would VOID a working instrument. What has to hold is that one
// direction and two are distinguishable at all, and 0.09 against 0.00 is.
const calOK = CAL.plaid.n2 > 0.06 && CAL.stripe.n2 < 0.03 && CAL.noise.peak < 0.05;
const fmt = (r: Row) => `peak ${r.peak.toFixed(2)} @${r.lag.toFixed(0)}px/${r.deg.toFixed(0)}deg`
  + `  n2 ${r.n2.toFixed(2)} @${r.deg2.toFixed(0)}deg`;
console.log(`[cal] plaid  ${fmt(CAL.plaid)}`);
console.log(`[cal] stripe ${fmt(CAL.stripe)}`);
console.log(`[cal] noise  ${fmt(CAL.noise)}`);
console.log(`[cal] ${calOK ? 'OK — n2 separates one direction from two' : 'VOID — nothing below means anything'}`);

const out: Record<string, unknown> = { cal: CAL, calOK, rois: {} };
console.log('\nfile / shot                     roi              peak  lag  deg    n2  deg2   rms');
for (const file of files) {
  const shot = path.basename(file).replace(/\.(png|jpg|jpeg)$/i, '');
  const boxes = roiArg
    ? [roiArg.split(',').map(Number) as [number, number, number, number]]
    : ROIS[shot];
  if (!boxes) { console.log(`${shot.padEnd(30)} no ROI — pass --roi x,y,w,h`); continue; }
  const img = decodePng(await readFile(file));
  const ch = img.data.length / (img.w * img.h);
  const tag = `${path.basename(path.dirname(file))}/${shot}`;
  for (const [bx, by, bw, bh] of boxes) {
    const v = new Float64Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const i = ((by + y) * img.w + (bx + x)) * ch;
      v[y * bw + x] = 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
    }
    const r = score(v, bw, bh);
    console.log(`${tag.padEnd(30)} ${`${bx},${by},${bw},${bh}`.padEnd(16)}`
      + ` ${r.peak.toFixed(2).padStart(5)} ${r.lag.toFixed(0).padStart(4)}`
      + ` ${r.deg.toFixed(0).padStart(4)} ${r.n2.toFixed(2).padStart(5)}`
      + ` ${r.deg2.toFixed(0).padStart(5)} ${r.rms.toFixed(2).padStart(5)}`);
    (out.rois as Record<string, Row>)[`${tag}@${bx},${by}`] = r;
  }
}
if (jsonOut) await writeFile(jsonOut, JSON.stringify(out, null, 2));
if (!calOK) process.exit(1);
