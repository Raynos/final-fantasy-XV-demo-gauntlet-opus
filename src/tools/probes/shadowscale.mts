/**
 * How big is a cloud shadow patch on the ground, against the cloud that casts it?
 *
 *   node src/tools/probe.mts src/tools/probes/shadowscale.mts
 *   node src/tools/probe.mts src/tools/probes/shadowscale.mts --set __SS_PRESETS=clear,overcast,storm
 *   node src/tools/probe.mts src/tools/probes/shadowscale.mts --set __SS_SET=ushadowtile:8100,ushadowfieldscale:2.0
 *
 * Plan item 21's second half asks for "shadow patches within 2x of their
 * clouds", and until this existed the only evidence for either side was a
 * reading of the shader. Both fields are textures, so measure them.
 *
 * ## The two fields
 *
 * `Clouds.shadowRT` (512^2, R = transmittance) is baked over
 * `uShadowTile * uShadowFieldScale` metres of cloud field and then sampled by
 * `sky/MaterialPatch.ts` over `uShadowTile` metres of ground. So one texel is
 * `uShadowTile / 512` metres **on the ground** and `uShadowTile *
 * uShadowFieldScale / 512` metres **in the sky**, and everything the ground
 * shows is the cloud field divided by `uShadowFieldScale`.
 *
 * `uCloudWeather` (512^2, R = coverage) is the cloud field's own dominant
 * scale, over `uWeatherTile` = 27 km. `CloudTextures.ts` authors its blobs at
 * 27000/9 = 3.0 km and 27000/20 = 1.35 km.
 *
 * ## The estimator, and why a ratio and not a size
 *
 * Feature width is `2 * r`, where `r` is the first lag at which the field's
 * normalised autocorrelation falls below 0.5, averaged over rows and columns.
 * That constant is arbitrary: a blob of diameter D does not decorrelate at
 * exactly D/2, and the bias depends on the field's own shape. **The bias
 * cancels in a ratio**, and the ratio is the claim, so the same estimator runs
 * on both fields and `ratio` is what plan item 21 is graded on.
 *
 * ## Calibration, printed every run
 *
 * Two synthetic fields whose true sizes differ by a known 3.5x are measured by
 * the same code. If the recovered ratio is not 3.5 +/- 0.35 the run prints VOID
 * and nothing else it says means anything. 3.5 rather than 2 on purpose: it is
 * the shipped `shadowScale`, so the anchor sits exactly where the answer does.
 *
 * ## Settle first, always
 *
 * A leased probe page has not necessarily stepped a frame, and every weather
 * uniform is written by `Sky._pushWeatherUniforms`, which runs from `update()`.
 * Read one before a `settle()` and you get the *constructor defaults* —
 * `uShadowFieldScale` 30 against a clear preset's 3.5, `uCovRange` (0.30,0.62)
 * against (0.42,0.92) — and conclude the preset system is dead. It is not.
 */
const g = window.GAME;
const sky = g.get('Sky');
const r = g.renderer;
g.applyShot(String(window.__SS_SHOT || 'vista_noon'));
g.settle(40);

/** First lag where the normalised autocorrelation of a 512^2 field drops below 0.5. */
function corrHalf(f, N, maxLag) {
  let mean = 0;
  for (let i = 0; i < N * N; i++) mean += f[i];
  mean /= N * N;
  let v0 = 0;
  for (let i = 0; i < N * N; i++) { const d = f[i] - mean; v0 += d * d; }
  v0 /= N * N;
  if (v0 < 1e-9) return NaN;         // a flat field has no feature size
  let prev = 1.0;
  for (let lag = 1; lag <= maxLag; lag++) {
    let acc = 0;
    // rows and columns both, with wrap: the field is a tiling texture, so a
    // wrapped lag is the honest one and there is no edge to correct for.
    for (let y = 0; y < N; y++) {
      const row = y * N;
      for (let x = 0; x < N; x++) {
        acc += (f[row + x] - mean) * (f[row + ((x + lag) % N)] - mean);
        acc += (f[row + x] - mean) * (f[((y + lag) % N) * N + x] - mean);
      }
    }
    const c = acc / (2 * N * N * v0);
    if (c < 0.5) return lag - 1 + (prev - 0.5) / Math.max(prev - c, 1e-6);
    prev = c;
  }
  return maxLag;
}

const N = 512;
const MAXLAG = 200;

// --- calibration ------------------------------------------------------------
// Two isotropic sine gratings whose periods differ by exactly 3.5x. Recovering
// that 3.5 is the only thing that licenses the ratio below.
function grating(period) {
  const f = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    f[y * N + x] = Math.sin(2 * Math.PI * x / period) + Math.sin(2 * Math.PI * y / period);
  }
  return f;
}
const calA = corrHalf(grating(140), N, MAXLAG);
const calB = corrHalf(grating(40), N, MAXLAG);
const calRatio = calA / calB;
const calOK = Math.abs(calRatio - 3.5) <= 0.35;
console.log(`[cal] grating 140 -> r ${calA.toFixed(2)}   grating 40 -> r ${calB.toFixed(2)}`
  + `   recovered ratio ${calRatio.toFixed(2)} (true 3.50)  ${calOK ? 'OK' : 'VOID'}`);
if (!calOK) console.log('[cal] VOID — nothing below this line means anything');

// --- the weather map: the cloud field's own scale ----------------------------
const wtex = sky.u.uCloudWeather.value;
const wimg = wtex.image;
const wd = wimg.data;
const wch = wd.length / (wimg.width * wimg.height);
const wf = new Float32Array(N * N);
for (let i = 0; i < N * N; i++) wf[i] = wd[i * wch] / 255;   // R = coverage
const rW = corrHalf(wf, N, MAXLAG);
const weatherTile = sky.u.uWeatherTile.value;
const cloudM = 2 * rW * (weatherTile / N);

const presets = String(window.__SS_PRESETS || 'clear').split(',');
const setStr = String(window.__SS_SET || '');

console.log(`weatherTile ${weatherTile} m   coverage r ${rW.toFixed(2)} texels`
  + `   cloud feature ${cloudM.toFixed(0)} m`);
console.log('preset      tile   fscale  fieldSpan  r(tex)  patch(m)  cloud/patch  m/texel  tiles/10km');

const buf = new Uint8Array(N * N * 4);
const sf = new Float32Array(N * N);

for (const p of presets) {
  sky.setWeather(p);
  // The preset is a lerp, not an assignment: settle it before reading.
  g.settle(40);
  // Overrides last: `_pushWeatherUniforms` rewrites `uShadowFieldScale` from
  // the preset every frame, so anything set before a settle is gone.
  for (const kv of setStr.split(',')) {
    if (!kv) continue;
    const [k, v] = kv.split(':');
    const bag = sky.u;
    const key = Object.keys(bag).find((q) => q.toLowerCase() === k.toLowerCase());
    if (key) bag[key].value = Number(v);
  }
  sky._shadowDirty = true;
  // Bake it now rather than waiting for the frame stride to come round.
  sky.clouds.renderShadow();

  r.readRenderTargetPixels(sky.clouds.shadowRT, 0, 0, N, N, buf);
  for (let i = 0; i < N * N; i++) sf[i] = buf[i * 4] / 255;
  const rS = corrHalf(sf, N, MAXLAG);
  // The other half of "no shadow on the terrain": a field whose transmittance
  // never leaves 1.0 has no patches to size. Histogram it.
  const srt = Array.from(sf).sort((a, b) => a - b);
  const q = (f) => srt[Math.min(srt.length - 1, Math.floor(srt.length * f))];
  let dark = 0;
  for (let i = 0; i < N * N; i++) if (sf[i] < 0.8) dark++;
  const tile = sky.u.uShadowTile.value;
  const fscale = sky.u.uShadowFieldScale.value;
  const patchM = 2 * rS * (tile / N);
  console.log(
    `${p.padEnd(10)} ${String(tile).padStart(6)} ${fscale.toFixed(2).padStart(7)}`
    + ` ${String(Math.round(tile * fscale)).padStart(10)}`
    + ` ${rS.toFixed(2).padStart(7)} ${patchM.toFixed(0).padStart(9)}`
    + ` ${(cloudM / patchM).toFixed(2).padStart(12)}`
    + ` ${(tile / N).toFixed(1).padStart(8)} ${(10000 / tile).toFixed(1).padStart(10)}`
    + `   T p05 ${q(0.05).toFixed(2)} p50 ${q(0.5).toFixed(2)} p95 ${q(0.95).toFixed(2)}`
    + `  T<0.8 ${(100 * dark / (N * N)).toFixed(1)}%  strength ${sky.u.uCloudShadowStrength.value.toFixed(2)}`);
}
return 'ok';
