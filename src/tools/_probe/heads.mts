const g = window.GAME;
g.settle(90);
// The corpus closeups are all defocused because PostFX snaps focus to the
// player's head; kill DOF outright so this probe judges the model, not the lens.
if (g.post && g.post.dof) g.post.dof.enabled = false;
// the tutorial hint card parks itself over the subject's forehead
const hud = g.get('HUD');
if (hud && hud.hints) { hud.hints.update = () => {}; hud.hints.root.remove(); }

const party = g.get('Party');
const player = g.get('Player');

// ---- pin the cast -------------------------------------------------------
// framecam settles the sim between captures, so a framing derived once here is
// aimed at where the subject *was*: companions keep steering to a wandering
// formation slot and the player keeps walking, so by the tenth spec the head is
// out of frame and the tenth spec is a picture of a hillside. Follow shots fix
// the translation but not the *facing* — the offsets are world-space, so a
// subject that turns 90 degrees turns a front framing into a profile.
//
// Freezing the root transform after each update solves both and costs nothing:
// `character.update` still runs, so the rig is posed and skinned exactly as it
// would be, only the body no longer travels. Portraits do not need locomotion.
const pinned = [];
const pin = (o, holder) => {
  pinned.push({ o, holder, p: o.position.clone(), r: o.rotation.y });
};
const restore = () => {
  for (const q of pinned) {
    q.o.position.copy(q.p);
    q.o.rotation.y = q.r;
    // zero the velocity too, or the locomotion blend keeps a walk cycle
    // running on the spot for a body that is not going anywhere
    if (q.holder && q.holder.velocity) q.holder.velocity.set(0, 0, 0);
    if (q.holder) q.holder.speed = 0;
  }
};
const wrap = (sys) => {
  if (!sys || sys.__pinned) return;
  const orig = sys.update.bind(sys);
  sys.update = (dt, game) => { orig(dt, game); restore(); };
  sys.__pinned = true;
};
if (player && player.root) pin(player.root, player);
if (party) for (const m of party.members) pin(m.root, m);
wrap(player); wrap(party);

const who = { noctis: null, gladio: 'gladio', ignis: 'ignis', prompto: 'prompto' };
const out = { heads: {}, specs: [] };

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const r3 = (v) => v.map((x) => +x.toFixed(3));

for (const [key, id] of Object.entries(who)) {
  const m = id ? (party && party.get && party.get(id)) : player;
  if (!m) { out.heads[key] = null; continue; }
  const rig = m.character && m.character.rig;
  const byName = rig && rig.byName;
  const wp = (o) => { o.updateWorldMatrix(true, false); const e = o.matrixWorld.elements; return [e[12], e[13], e[14]]; };
  const hp = byName && byName.head ? wp(byName.head) : null;
  const hd = byName && (byName.handR || byName.handL) ? wp(byName.handR || byName.handL) : null;
  m.root.updateWorldMatrix(true, false);
  const rp = [m.root.position.x, m.root.position.y, m.root.position.z];
  const e = m.root.matrixWorld.elements;
  const fwd = norm([e[8], 0, e[10]]);
  out.heads[key] = { head: hp && r3(hp), hand: hd && r3(hd), root: r3(rp), fwd: r3(fwd) };
  if (!hp) continue;

  // Aim at the *eyes*, read off the live gaze pivot (`character.eyes` sits
  // exactly at `dims.eyeY/eyeZ` under the head bone). Guessing it as an offset
  // from the root put the head low-left of frame whenever the pose leaned,
  // because `dims.eyeY` is a rest-pose number and the spine is animated.
  const ep = m.character && m.character.eyes ? wp(m.character.eyes) : null;
  const eyeH = ep ? ep[1] - rp[1] : (rig ? rig.dims.eyeY : hp[1] - rp[1] + 0.045);
  // the gaze pivot sits ~65 mm behind the corneas; push the aim point forward
  // so a 0.4 m framing is centred on the eye surface, not the skull interior
  const aimZ = [fwd[0] * 0.045, 0, fwd[2] * 0.045];
  const right = norm([-fwd[2], 0, fwd[0]]);
  const shot = (name, dir, dist, fov, aimH, lift) => out.specs.push({
    name, fov, time: 16.2, weather: 'clear', follow: id || 'player',
    offset: r3([aimZ[0] + dir[0] * dist, aimH + (lift || 0), aimZ[2] + dir[2] * dist]),
    lookOffset: r3([aimZ[0], aimH, aimZ[2]]),
  });
  shot(`${key}_front`, fwd, 0.62, 24, eyeH, 0.012);
  shot(`${key}_eyes`, fwd, 0.42, 13, eyeH, 0.0);
  shot(`${key}_tq`, norm([fwd[0] * 0.72 + right[0] * 0.70, 0, fwd[2] * 0.72 + right[2] * 0.70]), 0.62, 24, eyeH, 0.012);
  shot(`${key}_profile`, right, 0.62, 24, eyeH, 0.008);
  shot(`${key}_back`, [-fwd[0], 0, -fwd[2]], 0.72, 26, eyeH, 0.02);
  shot(`${key}_torso`, norm([fwd[0] * 0.8 + right[0] * 0.6, 0, fwd[2] * 0.8 + right[2] * 0.6]), 1.25, 30, eyeH - 0.45, 0.10);
  if (hd) shot(`${key}_hand`, norm([fwd[0] * 0.6 + right[0] * 0.8, 0, fwd[2] * 0.6 + right[2] * 0.8]), 0.42, 24, hd[1] - rp[1], 0.10);
}
return out;
