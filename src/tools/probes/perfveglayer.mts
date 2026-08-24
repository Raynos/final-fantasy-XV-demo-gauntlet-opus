// perf-r3: is `Vegetation.update` the sum of three layers that all fire on the
// same frame, and does rotating them pay?
//
// In `streaming-traverse` the segment teleports the player 660 m every twelfth
// frame. Grass re-gathers past 5 m of movement, bushes past 10 m, trees past
// 12 m -- so a hop makes ALL THREE do their full gather-and-upload on the same
// frame, every twelfth frame. Under real motion (10 m/s sprint, 0.17 m/frame)
// they fire every 30, 60 and 72 frames respectively and almost never coincide.
//
// Arm `rot` allows at most one layer to run per frame, round-robin; `base` is
// the shipped behaviour. Interleaved on one page, one build.
const g = window.GAME;
const gl = g.renderer.getContext();
const dt = 1 / 60;
const inp = g.input;
const player = g.get('Player');
const rig = g.get('CameraRig');
const veg = g.get('Vegetation');
const hold = (...c) => { inp.keys.clear(); for (const k of c) inp.keys.add(k); };

const layers = [veg.grass, veg.bushes, veg.trees];
const orig = layers.map((l) => l.update.bind(l));
let mode = 'base';
let phase = 0;
let frameTick = 0;
layers.forEach((l, i) => {
  l.update = function (camPos) {
    if (mode === 'rot' && (frameTick % 3) !== i) return;
    return orig[i](camPos);
  };
});

const each = (i) => {
  if (i % 12 === 0 && player) {
    const a = i * 0.7;
    player.root.position.x = Math.cos(a) * (120 + i * 3);
    player.root.position.z = Math.sin(a) * (120 + i * 3);
  }
};

g.applyShot('hud_field'); rig && rig.clearShot && rig.clearShot(); g.resetClock();
const home = player ? player.position.clone() : null;

let vegMs = 0;
const vOrig = veg.update.bind(veg);
veg.update = function (...a) {
  const t0 = performance.now(); const r = vOrig(...a); vegMs += performance.now() - t0; return r;
};

const run = async (m, n) => {
  mode = m;
  g.get('Director') && g.get('Director').setScenario && g.get('Director').setScenario('field');
  hold('KeyW', 'ShiftLeft');
  if (home && player) player.root.position.copy(home);
  for (let i = 0; i < 6; i++) { each(i); frameTick++; g.frame(dt); }
  gl.finish();
  await new Promise((r) => setTimeout(r, 300));
  const s = [];
  vegMs = 0;
  for (let i = 0; i < n; i++) {
    each(i);
    frameTick++;
    gl.finish();
    const t0 = performance.now();
    g.frame(dt);
    gl.finish();
    s.push(performance.now() - t0);
    await new Promise((r) => requestAnimationFrame(r));
  }
  const so = [...s].sort((a, b) => a - b);
  return {
    mode: m,
    median: +so[n >> 1].toFixed(2),
    p95: +so[Math.floor(n * 0.95)].toFixed(2),
    max: +so[n - 1].toFixed(2),
    over16pct: +(100 * s.filter((x) => x > 16.7).length / n).toFixed(0),
    over33: s.filter((x) => x > 33).length,
    vegPerFrame: +(vegMs / n).toFixed(2),
    draws: g.renderer.info.render.calls,
    triM: +(g.renderer.info.render.triangles / 1e6).toFixed(2),
  };
};

const rows = [];
for (const m of ['base', 'rot', 'rot', 'base', 'base', 'rot']) rows.push(await run(m, 180));
mode = 'base';
layers.forEach((l, i) => { l.update = orig[i]; });
veg.update = vOrig;
if (home && player) player.root.position.copy(home);
hold();
const med = (k) => rows.filter((r) => r.mode === k).map((r) => r.median).sort((a, b) => a - b)[1];
return { rows, medianOf3: { base: med('base'), rot: med('rot') } };
