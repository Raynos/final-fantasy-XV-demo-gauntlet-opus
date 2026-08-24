// perf-r2: the 162 ms `sprint+turn` frame, in its real context.
//
// A probe that starts `sprint+turn` from a fresh `applyShot` is NOT measuring
// what `gameplay.mts` measures: by the time the gate reaches that segment the
// player has already walked and sprinted 330 frames from spawn, so the frame-35
// spike happens somewhere else entirely on the map. This replays the gate's own
// preceding segments first — idle, walk, sprint — and only then times
// `sprint+turn`, with `renderer.info` diffed per frame and every system timed.
const g = window.GAME;
const gl = g.renderer.getContext();
const dt = 1 / 60;
const inp = g.input;
const rig = g.get('CameraRig');
const hold = (...c) => { inp.keys.clear(); for (const k of c) inp.keys.add(k); };
const look = (x, y) => inp.look.set(x, y);
g.applyShot('hud_field'); rig && rig.clearShot && rig.clearShot(); g.resetClock();

let cur = null;
const restore = [];
const names = g.systems.map((s, i) => (s.constructor && s.constructor.name) || ('system' + i));
g.systems.forEach((s, i) => {
  for (const hook of ['update', 'lateUpdate']) {
    if (typeof s[hook] !== 'function') continue;
    const orig = s[hook]; const key = names[i] + '.' + hook;
    restore.push(() => { s[hook] = orig; });
    s[hook] = function (...a) {
      const t0 = performance.now(); const r = orig.apply(this, a);
      if (cur) cur[key] = (cur[key] || 0) + (performance.now() - t0); return r;
    };
  }
});
for (const hook of ['update', 'render']) {
  const orig = g.post[hook];
  restore.push(() => { g.post[hook] = orig; });
  g.post[hook] = function (...a) {
    const t0 = performance.now(); const r = orig.apply(this, a);
    if (cur) cur['post.' + hook] = (cur['post.' + hook] || 0) + (performance.now() - t0); return r;
  };
}

// exactly `gameplay.mts`'s first three segments, warm frames included
const warm = (setup, each, n) => { setup(); for (let i = 0; i < 6; i++) { each && each(i); g.frame(dt); } for (let i = 0; i < n; i++) { each && each(i); g.frame(dt); } };
warm(() => hold(), null, 60);
warm(() => hold('KeyW'), null, 120);
warm(() => hold('KeyW', 'ShiftLeft'), null, 150);

hold('KeyW', 'ShiftLeft');
const each = (i) => look(Math.sin(i * 0.06) * 22, Math.sin(i * 0.021) * 5);
for (let i = 0; i < 6; i++) { each(i); g.frame(dt); }
gl.finish();
await new Promise((r) => setTimeout(r, 400));

const progs = () => g.renderer.info.programs.map((p) => p.name + '|' + (p.cacheKey || '').length);
let prev = progs();
let prevObjs = new Set();
g.scene.traverse((o) => { if (o.isMesh || o.isInstancedMesh) prevObjs.add((o.name || o.type) + '#' + o.id); });
const inf = () => ({ geo: g.renderer.info.memory.geometries, tex: g.renderer.info.memory.textures });
let pm = inf();
const rows = [];
for (let i = 0; i < 150; i++) {
  each(i);
  gl.finish();
  cur = {};
  const t0 = performance.now();
  g.frame(dt);
  gl.finish();
  const ms = performance.now() - t0;
  const now = progs(), m = inf();
  const added = now.filter((p) => !prev.includes(p));
  // What actually appeared in the scene this frame -- the program list says a
  // material linked, not who built it.
  const objs = new Set();
  g.scene.traverse((o) => { if (o.isMesh || o.isInstancedMesh) objs.add((o.name || o.type) + '#' + o.id); });
  const newObjs = [...objs].filter((k) => !prevObjs.has(k));
  if (ms > 20 || added.length || m.geo !== pm.geo || m.tex !== pm.tex) {
    rows.push({ i, ms: +ms.toFixed(1), dGeo: m.geo - pm.geo, dTex: m.tex - pm.tex,
      progTotal: now.length, newPrograms: added,
      newObjects: newObjs.slice(0, 14), newObjectCount: newObjs.length,
      top: Object.entries(cur).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v.toFixed(1)}`) });
  }
  prev = now; pm = m; cur = null; prevObjs = objs;
  // perf-r3: rAF, not setTimeout(0) -- see the header of `ruler.mts`. Under a
  // task-queue yield this loop's own tail was the compositor, not the game.
  await new Promise((r) => requestAnimationFrame(r));
}
restore.forEach((f) => f());
return { events: rows };
