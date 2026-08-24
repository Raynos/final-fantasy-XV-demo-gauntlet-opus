// perf-r2: where does `streaming-traverse` spend 19 ms, and what are the
// hitches in `sprint+turn` and `menu-open`?
//
// Replays `gameplay.mts`'s own scripts *exactly* (its `hold()` uses the real
// `Set` API -- `perfstream.mts` wrote `input.keys[k] = true` onto a Set, so it
// never actually sprinted) and times every system's `update`/`lateUpdate`
// around each frame, keeping the PER-FRAME series so a hitch can be attributed
// to the system that owned it rather than averaged away.
const g = window.GAME;
const gl = g.renderer.getContext();
const dt = 1 / 60;
const inp = g.input;
const hold = (...codes) => { inp.keys.clear(); for (const c of codes) inp.keys.add(c); };
const look = (x, y) => inp.look.set(x, y);

const player = g.get('Player');
const combat = g.get('Combat');
const menus = g.get('Menus');
const rig = g.get('CameraRig');
g.applyShot('hud_field');
rig && rig.clearShot && rig.clearShot();
g.resetClock();

const names = g.systems.map((s, i) => (s.constructor && s.constructor.name) || ('system' + i));
let cur = null;                      // {} for the frame being timed
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
      if (cur) cur[key] = (cur[key] || 0) + (performance.now() - t0);
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
    if (cur) cur['post.' + hook] = (cur['post.' + hook] || 0) + (performance.now() - t0);
    return r;
  };
}

const SEGMENTS = {
  'streaming-traverse': {
    frames: 180,
    setup: () => { g.get('Director') && g.get('Director').setScenario('field'); hold('KeyW', 'ShiftLeft'); },
    each: (i) => {
      if (i % 12 === 0 && player) {
        const a = i * 0.7;
        player.root.position.x = Math.cos(a) * (120 + i * 3);
        player.root.position.z = Math.sin(a) * (120 + i * 3);
      }
    },
  },
  'sprint+turn': {
    frames: 150,
    setup: () => hold('KeyW', 'ShiftLeft'),
    each: (i) => look(Math.sin(i * 0.06) * 22, Math.sin(i * 0.021) * 5),
  },
  'menu-open': {
    frames: 90,
    setup: () => hold(),
    each: (i) => {
      if (i === 5) menus && menus.setScreen('main');
      if (i === 30) menus && menus.setScreen('ascension');
      if (i === 55) menus && menus.setScreen('inventory');
      if (i === 80) menus && menus.setScreen(null);
    },
  },
  'day-night-sweep': {
    frames: 150,
    setup: () => hold('KeyW'),
    each: (i) => { const s = g.get('Sky'); s && s.setTimeOfDay((i * 0.16) % 24); },
  },
};

const want = 'menu-open'; // SEGNAME
const seg = SEGMENTS[want];
seg.setup();
cur = null;
for (let i = 0; i < 6; i++) { seg.each && seg.each(i); g.frame(dt); }
gl.finish();
await new Promise((r) => setTimeout(r, 400));

const frames = [], per = [], draws = [], tris = [];
for (let i = 0; i < seg.frames; i++) {
  seg.each && seg.each(i);
  gl.finish();
  cur = {};
  const t0 = performance.now();
  g.frame(dt);
  gl.finish();
  const ms = performance.now() - t0;
  frames.push(ms); per.push(cur); cur = null;
  draws.push(g.renderer.info.render.calls);
  tris.push(g.renderer.info.render.triangles);
  await new Promise((r) => setTimeout(r, 0));
}
restore.forEach((f) => f());

const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const keys = [...new Set(per.flatMap((p) => Object.keys(p)))];
const med = {}; keys.forEach((k) => { med[k] = +q(per.map((p) => p[k] || 0), 0.5).toFixed(2); });
const ranked = keys.map((k) => ({
  k, medianMs: med[k],
  maxMs: +Math.max(...per.map((p) => p[k] || 0)).toFixed(2),
})).sort((a, b) => b.medianMs - a.medianMs).filter((r) => r.medianMs >= 0.05 || r.maxMs >= 4);

// Every frame over 33 ms, with its three biggest contributors named.
const hitches = [];
frames.forEach((ms, i) => {
  if (ms <= 25) return;
  const top = Object.entries(per[i]).sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([k, v]) => `${k} ${v.toFixed(1)}`);
  const acc = Object.values(per[i]).reduce((a, b) => a + b, 0);
  hitches.push({ frame: i, ms: +ms.toFixed(1), accounted: +acc.toFixed(1), top });
});

return {
  segment: want,
  frame: { medianMs: +q(frames, 0.5).toFixed(2), p95: +q(frames, 0.95).toFixed(2), maxMs: +Math.max(...frames).toFixed(2),
           over16: Math.round(frames.filter((x) => x > 16.7).length / frames.length * 100) + '%',
           over33: frames.filter((x) => x > 33).length },
  draws: { min: Math.min(...draws), median: q(draws, 0.5), max: Math.max(...draws) },
  trisM: { median: +(q(tris, 0.5) / 1e6).toFixed(2), max: +(Math.max(...tris) / 1e6).toFixed(2) },
  accountedMedianMs: +ranked.reduce((a, r) => a + r.medianMs, 0).toFixed(2),
  ranked,
  hitches,
};
