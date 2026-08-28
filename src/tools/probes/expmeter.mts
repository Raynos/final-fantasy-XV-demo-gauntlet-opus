/*
 * What the auto-exposure meter is doing, per shot, across the corpus.
 *
 * `faceclip` established on one portrait that the centre-weighted meter opens
 * up 33% for a black jacket in the middle of the frame. That is a number about
 * one shot, and the claim it was used to support -- "this is most of the
 * corpus's median-luma gap" -- is a claim about all of them. So ask all of
 * them.
 *
 * Reports, per shot: the scene exposure the Sky publishes (`base`, physically
 * motivated from sun and sky irradiance), the multiplier the integrator
 * actually settles on (`adapted`), their ratio, and the band the integrator was
 * allowed to roam inside. `ratio` is the whole question: 1.000 means eye
 * adaptation added nothing to the Sky's physics, and anything else is the meter
 * disagreeing with the lighting model.
 *
 * A ratio pinned at the band's top edge across many shots means the band is
 * doing the work, not the meter, and narrowing it is the lever. A ratio that
 * scatters means the meter is responding to content -- and then WHAT content
 * is the next question.
 */
const g = window.GAME;
const fx = g.post;
const r = g.renderer;
const shots = String(window.__EM_SHOTS || 'hero_portrait').split(',');

/* The 1x1 adapt target is HalfFloatType, so readRenderTargetPixels wants a
 * Uint16Array and hands back raw IEEE-754 binary16 bits. Passing a Float32Array
 * -- which is what probes/faceclip.mts does -- reads back zero on this backend
 * and reports the exposure as 0.0000 for every shot in the corpus. */
function half(h) {
  const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, f = h & 0x3ff;
  if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * Math.pow(2, e - 15) * (1 + f / 1024);
}
function readAdapted() {
  const a = fx.exposure.adapt[fx.exposure.pingpong];
  const b = new Uint16Array(4);
  try { r.readRenderTargetPixels(a, 0, 0, 1, 1, b); } catch (e) { return NaN; }
  return half(b[0]);
}

const lines = ['shot                    base   adapted   ratio   band            atTop'];
const ratios = [];
for (const shot of shots) {
  g.applyShot(shot);
  g.settle(30);
  g.frame(1 / 60);
  const ex = fx.exposure;
  const E = readAdapted();
  const ratio = E / ex.base;
  ratios.push(ratio);
  const [lo, hi] = ex.bounds;
  const atTop = E >= hi * 0.995 ? 'TOP' : E <= lo * 1.005 ? 'bot' : '';
  lines.push(`${shot.padEnd(22)} ${ex.base.toFixed(4)}  ${E.toFixed(4)}  ${ratio.toFixed(3)}   `
    + `[${lo.toFixed(3)}, ${hi.toFixed(3)}]  ${atTop}`);
}
ratios.sort((a, b) => a - b);
const med = ratios[Math.floor(ratios.length / 2)];
lines.push(`\nmedian ratio ${med.toFixed(3)}   min ${ratios[0].toFixed(3)}   max ${ratios[ratios.length - 1].toFixed(3)}   n=${ratios.length}`);
return lines.join('\n');
