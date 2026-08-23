// Where does `streaming-traverse` spend 17.3 ms?
//
// It is the one segment under target on the fixed ruler -- 58 fps, 60% of
// frames over one 60 Hz budget, against 189 fps for `walk` on the same run.
// `perfsystems.mts` produced the ranked breakdown for a *held* shot and found
// `post.render` owning 78% of it with no system above 0.4 ms, but a held shot
// is exactly the case that does no streaming, so that answer cannot transfer.
//
// This is the same instrument pointed at the moving case: it replays
// `gameplay.mts`'s own `streaming-traverse` script -- teleporting the player in
// long hops every 12th frame, which is what forces grass tile refill, clipmap
// rebuild and prop LOD swaps -- and times every system's `update` and
// `lateUpdate` around it.
const g = window.GAME;
const gl = g.renderer.getContext();
const dt = 1 / 60;

g.get('Director') && g.get('Director').setScenario && g.get('Director').setScenario('field');
const player = g.get('Player');
const input = g.input;
const hold = (...keys) => keys.forEach((k) => input.keys && (input.keys[k] = true));
hold('KeyW', 'ShiftLeft');

const samples = {};
const add = (k, ms) => { (samples[k] || (samples[k] = [])).push(ms); };
const restore = [];
const names = g.systems.map((s, i) => (s.constructor && s.constructor.name) || ('system' + i));
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

// Warm the way the segment does, then let the throttle go before timing.
for (let i = 0; i < 6; i++) g.frame(dt);
await new Promise((r) => setTimeout(r, 400));
Object.keys(samples).forEach((k) => { samples[k].length = 0; });

const frames = [], draws = [];
for (let i = 0; i < 180; i++) {
  if (i % 12 === 0 && player) {
    const a = i * 0.7;
    player.root.position.x = Math.cos(a) * (120 + i * 3);
    player.root.position.z = Math.sin(a) * (120 + i * 3);
  }
  gl.finish();
  const t0 = performance.now();
  g.frame(dt);
  gl.finish();
  frames.push(performance.now() - t0);
  draws.push(g.renderer.info.render.calls);
  await new Promise((r) => setTimeout(r, 0));
}
restore.forEach((f) => f());

const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
// A hop frame is `i % 12 === 0`; everything else is steady traverse. Splitting
// on it is the whole point -- if the cost is the hop, it is streaming; if it is
// spread evenly, it is just a busier scene.
const hopIx = frames.map((_, i) => (i % 12 === 0 ? i : -1)).filter((i) => i >= 0);
const rows = Object.keys(samples).map((k) => {
  const xs = samples[k];
  const hop = hopIx.map((i) => xs[i]).filter((v) => v != null);
  const rest = xs.filter((_, i) => i % 12 !== 0);
  return {
    system: k,
    steadyMs: +q(rest.length ? rest : xs, 0.5).toFixed(2),
    hopMs: hop.length ? +q(hop, 0.5).toFixed(2) : 0,
    worstMs: +Math.max.apply(null, xs).toFixed(2),
  };
}).sort((a, b) => (b.hopMs + b.steadyMs) - (a.hopMs + a.steadyMs));

return {
  frame: {
    medianMs: +q(frames, 0.5).toFixed(2),
    steadyMs: +q(frames.filter((_, i) => i % 12 !== 0), 0.5).toFixed(2),
    hopMs: +q(hopIx.map((i) => frames[i]), 0.5).toFixed(2),
    over16: Math.round(frames.filter((x) => x > 16.7).length / frames.length * 100) + '%',
  },
  draws: { min: Math.min.apply(null, draws), median: q(draws, 0.5), max: Math.max.apply(null, draws) },
  accountedSteadyMs: +rows.reduce((a, r) => a + r.steadyMs, 0).toFixed(2),
  rows: rows.filter((r) => r.steadyMs >= 0.05 || r.hopMs >= 0.5 || r.worstMs >= 5),
};
