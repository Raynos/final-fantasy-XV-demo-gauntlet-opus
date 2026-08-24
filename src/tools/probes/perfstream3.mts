// perf-r2: sub-attribution of `streaming-traverse`.
//
// `perfstream2.mts` ranked the frame at system granularity and found
// Vegetation.update / Props.update / post.render. This goes one level down --
// into each veg streamer and each prop layer, and into the TileStreams
// underneath them -- because the two streaming systems are budgeted (a
// wall-clock budget in veg, a CELL COUNT in TileStream) and a budget that is
// pegged every frame tells you nothing about how much work is actually queued.
const g = window.GAME;
const gl = g.renderer.getContext();
const dt = 1 / 60;
const inp = g.input;
const hold = (...codes) => { inp.keys.clear(); for (const c of codes) inp.keys.add(c); };
const player = g.get('Player');
const veg = g.get('Vegetation');
const props = g.get('Props');
const rig = g.get('CameraRig');
g.applyShot('hud_field'); rig && rig.clearShot && rig.clearShot(); g.resetClock();

let cur = null;
const restore = [];
const wrap = (obj, key, label, method = 'update') => {
  if (!obj || typeof obj[method] !== 'function') return;
  const orig = obj[method];
  restore.push(() => { obj[method] = orig; });
  obj[method] = function (...a) {
    const t0 = performance.now();
    const r = orig.apply(this, a);
    if (cur) cur[label] = (cur[label] || 0) + (performance.now() - t0);
    return r;
  };
};
wrap(veg && veg.grass, 'u', 'veg.grass');
wrap(veg && veg.bushes, 'u', 'veg.bushes');
wrap(veg && veg.trees, 'u', 'veg.trees');
for (const k of ['landmarks', 'mega', 'rocks', 'debris', 'outposts', 'roadKit', 'wildlife', 'poiKits']) {
  wrap(props && props[k], 'u', 'props.' + k);
}
if (props && props.rocks) {
  wrap(props.rocks.stream, 'u', 'props.rocks:boulderStream');
  wrap(props.rocks.outcrops, 'u', 'props.rocks:outcropStream');
}
if (props && props.debris) wrap(props.debris.stream, 'u', 'props.debris:stream');

// how much work is queued, per frame
const pend = () => ({
  rockPend: props && props.rocks && props.rocks.stream ? props.rocks.stream._pending.length : -1,
  outPend: props && props.rocks && props.rocks.outcrops ? props.rocks.outcrops._pending.length : -1,
  debPend: props && props.debris && props.debris.stream ? props.debris.stream._pending.length : -1,
});

g.get('Director') && g.get('Director').setScenario('field');
hold('KeyW', 'ShiftLeft');
for (let i = 0; i < 6; i++) g.frame(dt);
gl.finish();
await new Promise((r) => setTimeout(r, 400));

const frames = [], per = [], q0 = [];
for (let i = 0; i < 180; i++) {
  if (i % 12 === 0 && player) {
    const a = i * 0.7;
    player.root.position.x = Math.cos(a) * (120 + i * 3);
    player.root.position.z = Math.sin(a) * (120 + i * 3);
  }
  gl.finish();
  cur = {};
  const t0 = performance.now();
  g.frame(dt);
  gl.finish();
  frames.push(performance.now() - t0);
  per.push(cur); cur = null;
  q0.push(pend());
  await new Promise((r) => setTimeout(r, 0));
}
restore.forEach((f) => f());

const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const keys = [...new Set(per.flatMap((p) => Object.keys(p)))];
const ranked = keys.map((k) => ({
  k,
  medianMs: +q(per.map((p) => p[k] || 0), 0.5).toFixed(2),
  p95Ms: +q(per.map((p) => p[k] || 0), 0.95).toFixed(2),
  maxMs: +Math.max(...per.map((p) => p[k] || 0)).toFixed(2),
  framesActive: per.filter((p) => (p[k] || 0) > 0.3).length,
})).sort((a, b) => b.medianMs - a.medianMs);

return {
  frame: { medianMs: +q(frames, 0.5).toFixed(2), p95: +q(frames, 0.95).toFixed(2), maxMs: +Math.max(...frames).toFixed(2), over33: frames.filter((x) => x > 33).length },
  ranked,
  backlog: {
    rockPend: { median: q(q0.map((x) => x.rockPend), 0.5), max: Math.max(...q0.map((x) => x.rockPend)) },
    outPend: { median: q(q0.map((x) => x.outPend), 0.5), max: Math.max(...q0.map((x) => x.outPend)) },
    debPend: { median: q(q0.map((x) => x.debPend), 0.5), max: Math.max(...q0.map((x) => x.debPend)) },
  },
};
