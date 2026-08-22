// Framing probe for hands, outfit panels and hair — the three named character
// gaps. `_probe/heads.mts` already covers faces; its `_hand` framing aims at the
// *root's* forward axis at the hand's *height*, which is the hip, not the hand,
// so every `*_hand.png` it has ever produced is a picture of a black trouser
// leg. This probe aims at the bone's actual world position.
//
//   PORT=<vite> node src/tools/framecam.mts --probe src/tools/_probe/hands.mts \
//     --out tmp/shots/<round> --settle 8
const g = window.GAME;
g.settle(90);
if (g.post && g.post.dof) g.post.dof.enabled = false;
const hud = g.get('HUD');
if (hud && hud.hints) { hud.hints.update = () => {}; hud.hints.root.remove(); }

const party = g.get('Party');
const player = g.get('Player');

// same pinning trick as heads.mts — framecam settles between captures, so an
// unpinned subject has walked out of frame by the tenth spec
const pinned = [];
const pin = (o, holder) => pinned.push({ o, holder, p: o.position.clone(), r: o.rotation.y });
const restore = () => {
  for (const q of pinned) {
    q.o.position.copy(q.p);
    q.o.rotation.y = q.r;
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
const out = { bones: {}, specs: [] };
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const r3 = (v) => v.map((x) => +x.toFixed(3));

for (const [key, id] of Object.entries(who)) {
  const m = id ? (party && party.get && party.get(id)) : player;
  if (!m) continue;
  const rig = m.character && m.character.rig;
  const byName = rig && rig.byName;
  if (!byName) continue;
  const wp = (o) => { o.updateWorldMatrix(true, false); const e = o.matrixWorld.elements; return [e[12], e[13], e[14]]; };
  m.root.updateWorldMatrix(true, false);
  const rp = [m.root.position.x, m.root.position.y, m.root.position.z];
  const e = m.root.matrixWorld.elements;
  const fwd = norm([e[8], 0, e[10]]);
  const right = norm([-fwd[2], 0, fwd[0]]);

  // aim point is a *bone*, expressed as an offset from the root, so the follow
  // shot re-anchors it every frame
  const bone = (n) => (byName[n] ? wp(byName[n]) : null);
  const off = (p, dx, dy, dz) => r3([p[0] - rp[0] + dx, p[1] - rp[1] + dy, p[2] - rp[2] + dz]);

  const shot = (name, aim, dir, dist, fov) => out.specs.push({
    name, fov, time: 16.2, weather: 'clear', follow: id || 'player',
    offset: r3([aim[0] + dir[0] * dist, aim[1] + dir[1] * dist, aim[2] + dir[2] * dist]),
    lookOffset: r3(aim),
  });

  // ---- hands ------------------------------------------------------------
  // aim between wrist and knuckles so the whole hand fills the frame, and view
  // it from outboard/front/above: that is the angle a player sees in combat and
  // the one where finger separation either reads or does not
  for (const s of ['L', 'R']) {
    const wr = bone(`hand${s}`); const kn = bone(`fingers${s}`);
    if (!wr) continue;
    const c = kn ? [(wr[0] + kn[0]) * 0.5, (wr[1] + kn[1]) * 0.5, (wr[2] + kn[2]) * 0.5] : wr;
    const sg = s === 'L' ? 1 : -1;
    const aim = off(c, 0, 0, 0);
    out.bones[`${key}_hand${s}`] = r3(c);
    // Back of the hand, from outboard-forward and only slightly above. The
    // first version of this looked steeply down and the fingers were seen
    // end-on, which reads as four dark pits whatever the geometry is doing.
    shot(`${key}_hand${s}`, aim,
      norm([fwd[0] * 0.80 + right[0] * 0.62 * sg, 0.30, fwd[2] * 0.80 + right[2] * 0.62 * sg]), 0.30, 22);
    // and the palm side, from outboard-behind-below: the only view that shows
    // the thenar mound, the palm hollow and whether the thumb is opposed
    shot(`${key}_palm${s}`, aim,
      norm([-fwd[0] * 0.62 + right[0] * 0.72 * sg, -0.32, -fwd[2] * 0.62 + right[2] * 0.72 * sg]), 0.30, 22);
  }

  // ---- outfit -----------------------------------------------------------
  // the chest at 1.1 m is where a jacket either has panels and a sheen break or
  // is a black hole; the hip carries the belt and the jacket hem
  const ch = bone('spine03') || bone('spine02');
  if (ch) {
    shot(`${key}_chest`, off(ch, 0, 0.02, 0),
      norm([fwd[0] * 0.94 + right[0] * 0.34, 0.12, fwd[2] * 0.94 + right[2] * 0.34]), 0.95, 26);
    shot(`${key}_shoulder`, off(ch, 0, 0.10, 0),
      norm([fwd[0] * 0.30 + right[0] * 0.95, 0.28, fwd[2] * 0.30 + right[2] * 0.95]), 0.70, 26);
  }
  const hips = bone('hips') || bone('root');
  if (hips) {
    shot(`${key}_hip`, off(hips, 0, 0.05, 0),
      norm([fwd[0] * 0.86 + right[0] * 0.51, 0.20, fwd[2] * 0.86 + right[2] * 0.51]), 0.85, 26);
  }

  // ---- hair -------------------------------------------------------------
  // three-quarter from above is the angle that shows whether the crown is a
  // groom or a hedgehog; the nape shows whether the shell is bare underneath
  const hd = bone('head');
  if (hd) {
    shot(`${key}_crown`, off(hd, 0, 0.09, 0),
      norm([fwd[0] * 0.52 + right[0] * 0.42, 0.75, fwd[2] * 0.52 + right[2] * 0.42]), 0.50, 24);
    shot(`${key}_nape`, off(hd, 0, 0.05, 0),
      norm([-fwd[0] * 0.90 - right[0] * 0.20, 0.42, -fwd[2] * 0.90 - right[2] * 0.20]), 0.52, 24);
  }
}
return out;
