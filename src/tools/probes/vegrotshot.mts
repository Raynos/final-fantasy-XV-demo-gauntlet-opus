// perf-r3: does the layer rotation leave holes in the field?
//
// The rotation only affects LIVE frames -- `converge()` runs all three layers
// unbounded before any posed capture -- so a posed shot cannot show it. This
// drives the `streaming-traverse` script and photographs the frame right
// after a 660 m teleport, with the rotation on and forced off, from the same
// page and the same position.
const g = window.GAME;
const dt = 1 / 60;
const inp = g.input;
const player = g.get('Player');
const rig = g.get('CameraRig');
const veg = g.get('Vegetation');
const hold = (...c) => { inp.keys.clear(); for (const k of c) inp.keys.add(k); };

const rot = veg._stream.bind(veg);
const flat = (camPos) => { veg.grass.update(camPos); veg.bushes.update(camPos); veg.trees.update(camPos); };

const each = (i) => {
  if (i % 12 === 0 && player) {
    const a = i * 0.7;
    player.root.position.x = Math.cos(a) * (120 + i * 3);
    player.root.position.z = Math.sin(a) * (120 + i * 3);
  }
};

g.applyShot('hud_field'); rig && rig.clearShot && rig.clearShot(); g.resetClock();
const home = player ? player.position.clone() : null;

const pass = async (label, fn) => {
  veg._stream = fn;
  g.get('Director') && g.get('Director').setScenario && g.get('Director').setScenario('field');
  hold('KeyW', 'ShiftLeft');
  if (home && player) player.root.position.copy(home);
  veg._phase = 0;
  // 96 frames of hopping, then stop three frames after the eighth hop --
  // the worst moment the rotation can produce: two layers still owed a frame.
  for (let i = 0; i < 99; i++) { each(i); g.frame(dt); }
  // Stop moving for four frames so motion blur clears -- at 660 m per hop the
  // blurred frame shows nothing but streaks, and the question is whether the
  // FIELD is dressed, not what it looks like at 200 m/s.
  hold();
  for (let i = 0; i < 4; i++) g.frame(dt);
  await window.__shot(label);
  return { label, draws: g.renderer.info.render.calls, triM: +(g.renderer.info.render.triangles / 1e6).toFixed(2) };
};

const out = [await pass('rot', rot), await pass('flat', flat), await pass('rot2', rot)];
veg._stream = rot;
if (home && player) player.root.position.copy(home);
hold();
return out;
