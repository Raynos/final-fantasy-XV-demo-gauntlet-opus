// perf-r2: cost per streamed TILE, and how many the traverse asks for.
//
// The three veg streamers are budgeted in wall clock and all three sit pegged
// at their budget while traversing, which tells you they are saturated and
// nothing about why. This times each `_makeTile` individually and counts them,
// so `ms/tile x tiles/frame` can be compared against the same probe run on the
// certified baseline with `--build acdcebb`.
const g = window.GAME;
const gl = g.renderer.getContext();
const dt = 1 / 60;
const inp = g.input;
const player = g.get('Player');
const veg = g.get('Vegetation');
const props = g.get('Props');
const rig = g.get('CameraRig');
g.applyShot('hud_field'); rig && rig.clearShot && rig.clearShot(); g.resetClock();

const tiles = {};
const restore = [];
const wrapTile = (obj, method, label) => {
  if (!obj || typeof obj[method] !== 'function') return;
  const orig = obj[method];
  restore.push(() => { obj[method] = orig; });
  obj[method] = function (...a) {
    const t0 = performance.now();
    const r = orig.apply(this, a);
    (tiles[label] || (tiles[label] = [])).push(performance.now() - t0);
    return r;
  };
};
wrapTile(veg && veg.grass, '_makeTile', 'grass');
wrapTile(veg && veg.bushes, '_makeTile', 'bushes');
wrapTile(veg && veg.trees, '_makeTile', 'trees');
wrapTile(props && props.rocks, '_genCell', 'rock');
wrapTile(props && props.rocks, '_genOutcrop', 'outcrop');
wrapTile(props && props.debris, '_genCell', 'debris');

inp.keys.clear(); inp.keys.add('KeyW'); inp.keys.add('ShiftLeft');
g.get('Director') && g.get('Director').setScenario('field');
for (let i = 0; i < 6; i++) g.frame(dt);
gl.finish();
await new Promise((r) => setTimeout(r, 400));
Object.keys(tiles).forEach((k) => { tiles[k].length = 0; });

const frames = [];
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
  await new Promise((r) => setTimeout(r, 0));
}
restore.forEach((f) => f());
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
const rows = Object.keys(tiles).map((k) => ({
  layer: k, tiles: tiles[k].length,
  medianMs: +q(tiles[k], 0.5).toFixed(3),
  p95Ms: +q(tiles[k], 0.95).toFixed(3),
  maxMs: +Math.max(...tiles[k]).toFixed(2),
  totalMs: +tiles[k].reduce((a, b) => a + b, 0).toFixed(1),
})).sort((a, b) => b.totalMs - a.totalMs);
return {
  frameMedianMs: +q(frames, 0.5).toFixed(2),
  frames: frames.length,
  totalTileMs: +rows.reduce((a, r) => a + r.totalMs, 0).toFixed(1),
  tileMsPerFrame: +(rows.reduce((a, r) => a + r.totalMs, 0) / frames.length).toFixed(2),
  rows,
};
