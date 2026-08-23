// Inside `post.render`, which is the whole frame: what does each composer pass
// cost, steady and on the periodic spike?
//
// `perfsystems.mts` accounted 5.1 ms of a 5.4 ms median frame and put 4.2 ms of
// it in `post.render`, with every game system at 0.1-0.4 ms. It also put the
// 20-60 ms periodic stall there. So the whole of both the steady cost and the
// hitch is inside the composer chain, and this walks it pass by pass.
//
// Timing is `performance.now()` around each pass's `render`, with a
// `gl.finish()` before and after, because ANGLE on Metal submits synchronously
// -- `perfhitch.mts` measured the finish after a whole frame at 0.0 ms, so a
// pass's own call already contains its GPU time. That makes the per-pass
// numbers directly comparable and additive.
const g = window.GAME;
const gl = g.renderer.getContext();
const shot = window.__SHOT || 'party_walk';

g.resetClock(); g.applyShot(shot); g.settle(40); g.applyShot(shot); g.settle(8);
await new Promise((r) => setTimeout(r, 400));

const passes = g.post.composer.passes;
const samples = {};
const add = (k, ms) => { (samples[k] || (samples[k] = [])).push(ms); };
const restore = [];

passes.forEach((p, i) => {
  const name = i + '.' + (p.constructor && p.constructor.name || 'Pass') +
    (p.name ? '(' + p.name + ')' : '');
  const orig = p.render;
  restore.push(() => { p.render = orig; });
  p.render = function (...a) {
    if (!this.enabled) return orig.apply(this, a);
    gl.finish();
    const t0 = performance.now();
    const r = orig.apply(this, a);
    gl.finish();
    add(name, performance.now() - t0);
    return r;
  };
});

const frames = [];
for (let i = 0; i < 160; i++) {
  gl.finish();
  const t0 = performance.now();
  g.frame(1 / 60);
  gl.finish();
  frames.push(performance.now() - t0);
  const spare = 16.7 - (performance.now() - t0);
  await new Promise((r) => setTimeout(r, spare > 0 ? spare : 0));
}
restore.forEach((f) => f());

const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const spikeIx = frames.map((m, i) => (m > 16.7 ? i : -1)).filter((i) => i >= 0);
const rows = Object.keys(samples).map((k) => {
  const xs = samples[k];
  const onSpike = spikeIx.map((i) => xs[i]).filter((v) => v != null);
  const calm = xs.filter((_, i) => spikeIx.indexOf(i) < 0);
  return {
    pass: k,
    calmMs: +q(calm.length ? calm : xs, 0.5).toFixed(2),
    spikeMs: onSpike.length ? +q(onSpike, 0.5).toFixed(2) : 0,
    worstMs: +Math.max.apply(null, xs).toFixed(2),
    calls: xs.length,
  };
}).sort((a, b) => (b.spikeMs - b.calmMs) - (a.spikeMs - a.calmMs) || b.calmMs - a.calmMs);

return {
  shot,
  frame: { calmMs: +q(frames.filter((m) => m <= 16.7), 0.5).toFixed(2), spikes: spikeIx.length, of: frames.length },
  accounted: {
    calmMs: +rows.reduce((a, r) => a + r.calmMs, 0).toFixed(2),
    spikeMs: +rows.reduce((a, r) => a + r.spikeMs, 0).toFixed(2),
  },
  rows,
};
