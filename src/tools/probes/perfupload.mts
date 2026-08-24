// perf-r3: the one remaining >33 ms gameplay frame is a BUFFER UPLOAD.
//
// `perfsprint.mts` under rAF pacing puts the whole of it inside `post.render`
// (82.0 of 84.3 ms) on frame 34 of `sprint+turn`, with ZERO new programs and
// ZERO texture uploads -- so it is not a compile and not `Warmup`'s old bug.
// What it does have is `dGeo 1` and one new object. Construction is budgeted
// by `TileStream.budgetMs`; the upload of what was constructed is not, and it
// happens on the first frame the thing is drawn.
//
// This names the object and weighs its geometry, and reports every geometry
// that first renders on a frame over 20 ms.
const g = window.GAME;
const gl = g.renderer.getContext();
const dt = 1 / 60;
const inp = g.input;
const rig = g.get('CameraRig');
const hold = (...c) => { inp.keys.clear(); for (const k of c) inp.keys.add(k); };
const look = (x, y) => inp.look.set(x, y);
g.applyShot('hud_field'); rig && rig.clearShot && rig.clearShot(); g.resetClock();

const warm = (setup, each, n) => { setup(); for (let i = 0; i < 6; i++) { each && each(i); g.frame(dt); } for (let i = 0; i < n; i++) { each && each(i); g.frame(dt); } };
warm(() => hold(), null, 60);
warm(() => hold('KeyW'), null, 120);
warm(() => hold('KeyW', 'ShiftLeft'), null, 150);
hold('KeyW', 'ShiftLeft');
const each = (i) => look(Math.sin(i * 0.06) * 22, Math.sin(i * 0.021) * 5);
for (let i = 0; i < 6; i++) { each(i); g.frame(dt); }
gl.finish();
await new Promise((r) => setTimeout(r, 400));

const bytes = (geo) => {
  let n = 0;
  if (!geo) return 0;
  for (const k in geo.attributes) { const a = geo.attributes[k]; n += (a.array && a.array.byteLength) || 0; }
  if (geo.index && geo.index.array) n += geo.index.array.byteLength;
  return n;
};
// Every geometry the renderer has already uploaded, by uuid. `renderer.render`
// uploads on first use, so a uuid absent here has never touched the GPU.
const seen = new Set();
const snapshot = () => { g.scene.traverse((o) => { if (o.geometry && o.visible) seen.add(o.geometry.uuid); }); };
snapshot();

const rows = [];
for (let i = 0; i < 150; i++) {
  each(i);
  // Which visible geometries are new *this* frame, before it is drawn.
  const fresh = [];
  g.scene.traverse((o) => {
    if (!o.geometry || !o.visible) return;
    if (seen.has(o.geometry.uuid)) return;
    fresh.push({ name: o.name || o.type, kind: o.constructor && o.constructor.name, count: o.count || 1,
      tris: (o.geometry.index ? o.geometry.index.count : (o.geometry.attributes.position || { count: 0 }).count) / 3,
      kb: +(bytes(o.geometry) / 1024).toFixed(0) });
    seen.add(o.geometry.uuid);
  });
  gl.finish();
  const t0 = performance.now();
  g.frame(dt);
  gl.finish();
  const ms = performance.now() - t0;
  if (ms > 18 || fresh.length) {
    rows.push({ i, ms: +ms.toFixed(1), freshCount: fresh.length,
      freshKb: fresh.reduce((s, f) => s + f.kb, 0),
      fresh: fresh.sort((a, b) => b.kb - a.kb).slice(0, 8) });
  }
  await new Promise((r) => requestAnimationFrame(r));
}
return rows;
