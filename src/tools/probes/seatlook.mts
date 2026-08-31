/*
 * What the player actually sees of the people the game seats.
 *
 *   node src/tools/probe.mts src/tools/probes/seatlook.mts --dirty \
 *     --shot tmp/shots/seatlook/x.jpg
 *
 * Playtest complaint #2: everyone the game seats is a T-pose with bare arms
 * through the bodywork, and the chocobo party are "three crucifixes on birds".
 * The framing that matters is the DEFAULT CHASE CAMERA, which is the one the
 * drive and the ride already install.
 *
 * **`applyShot` is not usable here.** It runs a Director scenario that tears the
 * drive down — the first version of this probe orbited an empty parked car and
 * looked like it had worked. So the extra angles are taken by writing the lens
 * directly and calling `g.post.render()` before the grab, which is the only way
 * to photograph a live driven car from anywhere but behind it.
 */
const g = window.GAME;
const inp = g.input;
const out = [];
const shot = async (n) => { if (window.__shot) await window.__shot(n); };

/** Photograph a live scene from an arbitrary lens without disturbing it. */
const freelook = async (name, cx, cy, cz, ax, ay, az, dist, fov) => {
  const L = Math.hypot(ax, ay, az);
  const cam = g.camera;
  const sp = cam.position.clone(), sq = cam.quaternion.clone(), sf = cam.fov;
  cam.position.set(cx + ax / L * dist, cy + ay / L * dist, cz + az / L * dist);
  cam.lookAt(cx, cy, cz);
  cam.fov = fov || 40;
  cam.updateProjectionMatrix();
  cam.updateMatrixWorld(true);
  // Motion blur / TAA reproject against the PREVIOUS view matrix, so one render
  // from a teleported lens is a 30 m/s smear even on a parked car. Render a few
  // times so the history is of this lens, then grab.
  for (let i = 0; i < 6; i++) g.post.render();
  await shot(name);
  cam.position.copy(sp); cam.quaternion.copy(sq); cam.fov = sf;
  cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
};

/* ------------------------------------------------------------------ drive */
const reg = g.get('Regalia');
const player = g.get('Player');
if (reg) {
  const b = reg.body;
  player.root.position.set(b.pos.x + 3, b.pos.y, b.pos.z);
  player.position.copy(player.root.position);
  reg.enter(false);
  inp.keys.clear(); inp.keys.add('KeyW');
  for (let i = 0; i < 420; i++) g.frame(1 / 60);
  out.push(`driving at ${b.speed.toFixed(1)} m/s`);
  await shot('drive-chase-fast');
  // Motion blur at 30 m/s smears the passengers into a stripe. Coast down to a
  // walking pace: the pose does not depend on speed, and the frame is legible.
  inp.keys.delete('KeyW'); inp.keys.add('KeyS');
  for (let i = 0; i < 900 && b.speed > 0.4; i++) g.frame(1 / 60);
  inp.keys.clear();
  for (let i = 0; i < 60; i++) g.frame(1 / 60);
  const hud = g.get('HUD'); if (hud && hud.setVisible) hud.setVisible(false);
  for (let i = 0; i < 4; i++) g.frame(1 / 60);
  out.push(`slow at ${b.speed.toFixed(1)} m/s`);
  await shot('drive-chase');
  const cx = b.pos.x, cy = b.pos.y + 1.15, cz = b.pos.z;
  const f = b.forward();
  const rx = f.z, rz = -f.x;
  await freelook('drive-flank', cx, cy, cz, rx, 0.16, rz, 5.2, 38);
  await freelook('drive-front34', cx, cy, cz, f.x * 0.9 + rx * 0.7, 0.30, f.z * 0.9 + rz * 0.7, 5.8, 38);
  await freelook('drive-above', cx, cy + 0.2, cz, -f.x * 0.5 + rx * 0.45, 0.80, -f.z * 0.5 + rz * 0.45, 4.6, 44);
  await freelook('drive-rear', cx, cy, cz, -f.x, 0.30, -f.z, 5.4, 40);
  inp.keys.clear();
  reg.exit();
  for (let i = 0; i < 30; i++) g.frame(1 / 60);
}

/* ------------------------------------------------------------------- ride */
const cb = g.get('Chocobo');
if (cb) {
  cb.summon();
  for (let i = 0; i < 900 && cb.state !== 'waiting'; i++) g.frame(1 / 60);
  out.push(`mount ${cb.mount()}, state ${cb.state}`);
  inp.keys.clear(); inp.keys.add('KeyW');
  for (let i = 0; i < 420; i++) g.frame(1 / 60);
  const bd = cb.body;
  out.push(`riding at ${bd ? bd.speed.toFixed(1) : '?'} m/s`);
  await shot('ride-chase-fast');
  inp.keys.delete('KeyW');
  for (let i = 0; i < 900 && bd && bd.speed > 0.3; i++) g.frame(1 / 60);
  for (let i = 0; i < 60; i++) g.frame(1 / 60);
  const hud2 = g.get('HUD'); if (hud2 && hud2.setVisible) hud2.setVisible(false);
  for (let i = 0; i < 4; i++) g.frame(1 / 60);
  await shot('ride-chase');
  const bp = cb.bird.root.position;
  const h = cb.bird.heading ?? 0;
  const fx = Math.sin(h), fz = Math.cos(h);
  const rx = fz, rz = -fx;
  const cx = bp.x, cy = bp.y + 1.5, cz = bp.z;
  await freelook('ride-flank', cx, cy, cz, rx, 0.12, rz, 4.4, 38);
  await freelook('ride-front34', cx, cy, cz, fx * 0.9 + rx * 0.7, 0.22, fz * 0.9 + rz * 0.7, 4.8, 38);
  await freelook('ride-rear34', cx, cy, cz, -fx * 0.9 + rx * 0.6, 0.30, -fz * 0.9 + rz * 0.6, 4.8, 38);
  await freelook('ride-above', cx, cy, cz, -fx * 0.4 + rx * 0.5, 0.75, -fz * 0.4 + rz * 0.5, 4.0, 44);
  inp.keys.clear();
}
return out.join('\n');
