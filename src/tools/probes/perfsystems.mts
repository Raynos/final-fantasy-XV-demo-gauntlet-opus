// Ranked attribution of the open-world frame, by system.
//
// `Game.frame()` is a flat loop: every system's `update`, then every system's
// `lateUpdate`, then `post.update` and `post.render`. Wrapping each of those
// and timing it gives the breakdown directly, with no ablation and no
// inference. That is worth doing rather than trusting `attrib.mts`, whose
// numbers were taken inside the throttle and summed to 300% of the frame.
//
// Two totals per system, because the shape of this frame is that a normal
// frame is 5.6 ms and roughly one in four costs 20-60 ms:
//   medianMs -- the steady cost, what the frame is made of
//   worstMs / spikeShare -- who owns the periodic stall
const g = window.GAME;
const gl = g.renderer.getContext();
const shot = window.__SHOT || 'party_walk';

g.resetClock(); g.applyShot(shot); g.settle(40); g.applyShot(shot); g.settle(8);
await new Promise((r) => setTimeout(r, 400));

const names = g.systems.map((s, i) => s.constructor && s.constructor.name || ('system' + i));
const samples = {};
const add = (k, ms) => { (samples[k] || (samples[k] = [])).push(ms); };

const restore = [];
g.systems.forEach((s, i) => {
  for (const hook of ['update', 'lateUpdate']) {
    if (typeof s[hook] !== 'function') continue;
    const orig = s[hook];
    const key = names[i] + '.' + hook;
    restore.push(() => { s[hook] = orig; });
    s[hook] = function (...a) {
      const t0 = performance.now();
      const r = orig.apply(this, a);
      add(key, performance.now() - t0);
      return r;
    };
  }
});
for (const hook of ['update', 'render']) {
  const orig = g.post[hook];
  restore.push(() => { g.post[hook] = orig; });
  g.post[hook] = function (...a) {
    const t0 = performance.now();
    const r = orig.apply(this, a);
    add('post.' + hook, performance.now() - t0);
    return r;
  };
}

const frames = [];
for (let i = 0; i < 200; i++) {
  gl.finish();
  const t0 = performance.now();
  g.frame(1 / 60);
  gl.finish();
  const ms = performance.now() - t0;
  frames.push(ms);
  add('__frame', ms);
  const spare = 16.7 - (performance.now() - t0);
  if (spare > 0) await new Promise((r) => setTimeout(r, spare));
  else await new Promise((r) => setTimeout(r, 0));
}
restore.forEach((f) => f());

const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const spikeIx = frames.map((m, i) => (m > 16.7 ? i : -1)).filter((i) => i >= 0);

const rows = Object.keys(samples)
  .filter((k) => k !== '__frame')
  .map((k) => {
    const xs = samples[k];
    const onSpikes = spikeIx.map((i) => xs[i]).filter((v) => v != null);
    return {
      system: k,
      medianMs: +q(xs, 0.5).toFixed(2),
      p95Ms: +q(xs, 0.95).toFixed(2),
      worstMs: +Math.max.apply(null, xs).toFixed(2),
      spikeMedianMs: onSpikes.length ? +q(onSpikes, 0.5).toFixed(2) : 0,
    };
  })
  .sort((a, b) => b.spikeMedianMs - a.spikeMedianMs || b.medianMs - a.medianMs);

const sumMed = rows.reduce((a, r) => a + r.medianMs, 0);
return {
  shot,
  frame: { medianMs: +q(frames, 0.5).toFixed(2), p95Ms: +q(frames, 0.95).toFixed(2), spikes: spikeIx.length, of: frames.length },
  accountedMedianMs: +sumMed.toFixed(2),
  rows: rows.filter((r) => r.medianMs >= 0.05 || r.spikeMedianMs >= 0.5),
};
