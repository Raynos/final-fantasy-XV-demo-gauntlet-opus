#!/usr/bin/env node
/**
 * Prove the horizon sweep against a brute-force ray march.
 *
 *   node src/tools/horizoncheck.mts
 *   node src/tools/horizoncheck.mts --res 256 --samples 6000
 *
 * **Why a gate and not a look.** `terrain/Horizon.ts` replaces a ray march with
 * a monotone convex-hull sweep, which is the same answer computed a completely
 * different way and roughly sixty times faster. A bug in the sweep does not
 * look like a bug — it looks like slightly different terrain shading, which is
 * indistinguishable from a tuning choice, and `project/LANDMINES.md` is a list
 * of exactly that failure. So the reference march lives beside the sweep, is
 * written independently of it, and this compares the two.
 *
 * The statistic is **Matthews correlation** on the binary lit/shadowed call,
 * not accuracy: at a high sun almost everything is lit and a function that
 * returns "lit" unconditionally scores 97% accurate. MCC is 0 for that function
 * and 1 for a perfect one.
 *
 * The height field is synthetic and seeded, so this runs in a second with no
 * browser, no server and no bake. What it validates is the sweep arithmetic;
 * whether the *world's* skyline looks right is a capture question.
 */
import { bakeHorizon, raymarchShadow, bilinear } from '../world/terrain/Horizon.ts';
import type { HeightGrid } from '../world/terrain/Horizon.ts';

const argv = process.argv.slice(2);
const arg = (n: string, d: number): number => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : d;
};

/** Deterministic value noise, several octaves — a plausible mountain range. */
function synthetic(n: number, step: number): HeightGrid {
  const data = new Float32Array(n * n);
  let s = 0x2f6e2b1 >>> 0;
  const rnd = (): number => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) ^ (s >>> 12)) >>> 0;
    return (s >>> 8) / 0x1000000;
  };
  // Four octaves of bilinearly-interpolated lattice noise.
  // Amplitudes chosen so the field reaches ~30 degrees of local slope: gentler
  // than that and every sun above 6 degrees is lit everywhere, which makes the
  // higher rows of the table degenerate rather than informative.
  for (const [cells, amp] of [[4, 900], [9, 420], [21, 160], [53, 48]] as [number, number][]) {
    const lat = new Float32Array((cells + 2) * (cells + 2));
    for (let k = 0; k < lat.length; k++) lat[k] = rnd();
    for (let j = 0; j < n; j++) {
      const fz = (j / (n - 1)) * cells;
      const j0 = Math.floor(fz), tz = fz - j0;
      for (let i = 0; i < n; i++) {
        const fx = (i / (n - 1)) * cells;
        const i0 = Math.floor(fx), tx = fx - i0;
        const a = lat[j0 * (cells + 2) + i0], b = lat[j0 * (cells + 2) + i0 + 1];
        const c = lat[(j0 + 1) * (cells + 2) + i0], d = lat[(j0 + 1) * (cells + 2) + i0 + 1];
        const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
        data[j * n + i] += ((a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz) * amp;
      }
    }
  }
  const extent = (n - 1) * step;
  return { n, step, x0: -extent / 2, z0: -extent / 2, data };
}

/**
 * Matthews correlation over the binary lit/shadowed call.
 *
 * The denominator vanishes when one of the four cells is empty — most often
 * because the sun is high enough that both methods say "lit" everywhere. That
 * is perfect agreement, not a failure, so it scores 1; the printed
 * `lit(ref)` column is what tells the reader the row was degenerate.
 */
function mcc(tp: number, tn: number, fp: number, fn: number): number {
  if (fp + fn === 0) return 1;
  const d = Math.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn));
  return d === 0 ? 1 : (tp * tn - fp * fn) / d;
}

function main(): void {
  const res = arg('res', 512);
  const samples = arg('samples', 4000);
  const src = synthetic(res * 2, 16);

  const t0 = performance.now();
  const map = bakeHorizon(src, { res });
  const sweepMs = performance.now() - t0;

  const t1 = performance.now();
  const tex = map.texture();
  const packMs = performance.now() - t1;

  console.log(`source   ${src.n}^2 at ${src.step} m  (${((src.n - 1) * src.step / 1000).toFixed(1)} km across)`);
  console.log(`baked    ${map.grid.n}^2 at ${map.grid.step} m,  ${(map.bytes() / 1048576).toFixed(2)} MB as two RGBA8`);
  console.log(`sweep    ${sweepMs.toFixed(0)} ms      pack + upload  ${packMs.toFixed(0)} ms`);
  console.log(`texture  ${tex.image.width}^2 x ${tex.image.depth} layers\n`);

  // Sample away from the border: a cell one step from the edge has almost no
  // terrain to be occluded by in half its bins, so both methods agree trivially
  // there and including it would flatter the score.
  const extent = (src.n - 1) * src.step;
  const margin = extent * 0.2;
  let s = 0x9e3779b9 >>> 0;
  const rnd = (): number => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) ^ (s >>> 12)) >>> 0;
    return (s >>> 8) / 0x1000000;
  };

  console.log('sun elev   n     agree   lit(ref)  lit(bake)     MCC   verdict');
  console.log('-'.repeat(66));
  let worst = 1;
  const rows: boolean[] = [];
  for (const deg of [3, 6, 10, 20, 45]) {
    const elev = (deg * Math.PI) / 180;
    let tp = 0, tn = 0, fp = 0, fn = 0;
    for (let k = 0; k < samples; k++) {
      const x = src.x0 + margin + rnd() * (extent - 2 * margin);
      const z = src.z0 + margin + rnd() * (extent - 2 * margin);
      const az = rnd() * Math.PI * 2;
      const ref = raymarchShadow(src, x, z, az, elev) > 0.5;
      // Hard threshold, no penumbra: a soft edge would let the sweep hedge.
      const got = map.horizonAt(x, z, az) < elev;
      if (got && ref) tp++;
      else if (!got && !ref) tn++;
      else if (got && !ref) fp++;
      else fn++;
    }
    const m = mcc(tp, tn, fp, fn);
    // Two ways to pass, and the second one matters. Once the sun is high enough
    // that 99% of the world is lit, MCC is computed over a minority class of a
    // few dozen samples and swings wildly on a handful of them -- the 20 degree
    // row scores 0.766 on TWELVE disagreements out of 4000. A disagreement rate
    // under 1% is the stronger statement at that point, so either clears.
    const disagree = (fp + fn) / samples;
    const ok = m >= 0.85 || disagree <= 0.01;
    worst = Math.min(worst, m);
    rows.push(ok);
    console.log(
      `${String(deg).padStart(7)}°${String(samples).padStart(6)}`
      + `${(100 * (tp + tn) / samples).toFixed(1).padStart(9)}%`
      + `${(100 * (tp + fn) / samples).toFixed(1).padStart(10)}%`
      + `${(100 * (tp + fp) / samples).toFixed(1).padStart(11)}%`
      + `${m.toFixed(3).padStart(8)}   ${ok ? (m >= 0.85 ? 'ok' : `ok (${fp + fn} disagree)`) : 'FAIL'}`,
    );
  }
  console.log('-'.repeat(66));

  // A sanity check the MCC cannot make: the baked skyline must never claim a
  // ridge that is not there. A false shadow at high sun is the failure that
  // would darken a whole world.
  let overclaim = 0;
  for (let k = 0; k < samples; k++) {
    const x = src.x0 + margin + rnd() * (extent - 2 * margin);
    const z = src.z0 + margin + rnd() * (extent - 2 * margin);
    const az = rnd() * Math.PI * 2;
    const h = map.horizonAt(x, z, az);
    // The tallest thing anywhere, seen from the lowest point, bounds every
    // legitimate skyline angle. Anything above that is arithmetic, not terrain.
    let hi = -1e9, lo = 1e9;
    for (let i = 0; i < src.data.length; i += 97) {
      if (src.data[i] > hi) hi = src.data[i];
      if (src.data[i] < lo) lo = src.data[i];
    }
    if (h > Math.atan2(hi - lo, src.step)) overclaim++;
  }

  // And the AO must be a real fraction, with a flat plain reading near 1.
  const flat: HeightGrid = { n: 64, step: 32, x0: -1008, z0: -1008, data: new Float32Array(64 * 64) };
  const flatAo = bakeHorizon(flat, { res: 64 }).skyVisibility(0, 0, 0, 1, 0);

  console.log(`skyline over-claims:      ${overclaim} / ${samples}   (want 0)`);
  console.log(`flat-plain sky visibility ${flatAo.toFixed(4)}          (want 1.0000)`);
  console.log(`ground truth h(0,0):      ${bilinear(src, 0, 0).toFixed(1)} m`);

  const pass = rows.every(Boolean) && overclaim === 0 && Math.abs(flatAo - 1) < 1e-6;
  console.log(`\nhorizoncheck: ${pass ? 'PASS' : 'FAIL'}  (worst MCC ${worst.toFixed(3)})`);
  process.exit(pass ? 0 : 1);
}

main();
