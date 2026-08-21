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
const who = { noctis: null, gladio: 'gladio', ignis: 'ignis', prompto: 'prompto' };
const out = { heads: {}, specs: [] };

const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const r3 = (v) => v.map((x) => +x.toFixed(3));

// Framings are emitted as `follow` shots, not absolute positions: framecam
// settles the sim between captures, so an absolute framing measured once drifts
// further out of frame with every later shot in the list. A follow shot has the
// camera rig re-anchor on the live root every frame instead.
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

  // eye height above the feet, straight off the rig rather than guessed as an
  // offset from the head bone (which sits at the base of the skull)
  const dims = m.character && m.character.rig && m.character.rig.dims;
  const eyeH = dims ? dims.eyeY : hp[1] - rp[1] + 0.045;
  const right = norm([-fwd[2], 0, fwd[0]]);
  const shot = (name, dir, dist, fov, aimH, lift) => out.specs.push({
    name, fov, time: 16.2, weather: 'clear', follow: id || 'player',
    offset: r3([dir[0] * dist, aimH + (lift || 0), dir[2] * dist]),
    lookOffset: r3([0, aimH, 0]),
  });
  shot(`${key}_front`, fwd, 0.60, 24, eyeH, 0.015);
  shot(`${key}_eyes`, fwd, 0.40, 13, eyeH, 0.0);
  shot(`${key}_tq`, norm([fwd[0] * 0.72 + right[0] * 0.70, 0, fwd[2] * 0.72 + right[2] * 0.70]), 0.60, 24, eyeH, 0.015);
  shot(`${key}_profile`, right, 0.60, 24, eyeH, 0.010);
  shot(`${key}_back`, [-fwd[0], 0, -fwd[2]], 0.70, 26, eyeH, 0.02);
  shot(`${key}_torso`, norm([fwd[0] * 0.8 + right[0] * 0.6, 0, fwd[2] * 0.8 + right[2] * 0.6]), 1.25, 30, eyeH - 0.45, 0.10);
  if (hd) shot(`${key}_hand`, norm([fwd[0] * 0.6 + right[0] * 0.8, 0, fwd[2] * 0.6 + right[2] * 0.8]), 0.42, 24, hd[1] - rp[1], 0.10);
}
return out;
