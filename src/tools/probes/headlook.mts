/**
 * A **studio front view of the head model**, with nothing in the frame that is
 * not the model.
 *
 *   node src/tools/framecam.mts --probe src/tools/probes/headlook.mts \
 *     --out tmp/shots/<round> --settle 8
 *
 * Why this and not `facecam.mts`, which already pins the head:
 *
 * 1. **`PIN_HEAD` is not enough.** It zeroes `neck` and `head`, and the subject
 *    still arrives 20-30 degrees off frontal, because the *spine* carries a
 *    twist of its own — `hips`, `spine01..03` and `clavicleL/R` are all
 *    animated and none of them was pinned. Every bone from the hips up is
 *    pinned here, so a "front" framing is a front view.
 * 2. **The contact-shadow pass paints a lobed blob over the whole mid-face at
 *    portrait range** and it is the loudest thing in any face frame — see
 *    `project/handoff/head-r2.md` §3. Judging a *sculpt* through it is judging
 *    the pass. It is off here, and **on** in every `shoot.mts` frame, which is
 *    where the shipped verdict is taken.
 * 3. The groom is off by default, because a fringe covering the forehead and
 *    both eyes is a different question from whether the skull under it is a
 *    head.
 *
 * **This is a diagnosis rig, not a verdict rig.** Nothing photographed here is
 * what ships. Every change judged here has to be re-checked in `hero_portrait`.
 */
const HIDE_HAIR = true;
/** The contact-shadow blob. Off, so the sculpt is visible; see the header. */
const NO_CONTACT = true;
/** 16.2 is the corpus hour: a low raking key from the subject's left. */
const HOUR = 16.2;

const g = window.GAME;
g.settle(90);
if (g.post && g.post.dof) g.post.dof.enabled = false;
if (NO_CONTACT && g.post && g.post.contact) g.post.contact.enabled = false;
const hud = g.get('HUD');
if (hud && hud.hints) { hud.hints.update = () => {}; hud.hints.root.remove(); }

const party = g.get('Party');
const player = g.get('Player');

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
  if (!sys || sys.__pinnedLook) return;
  const orig = sys.update.bind(sys);
  sys.update = (dt, game) => { orig(dt, game); restore(); };
  sys.__pinnedLook = true;
};
if (player && player.root) pin(player.root, player);
if (party) for (const m of party.members) pin(m.root, m);
wrap(player); wrap(party);

/** Every bone between the hips and the head. Miss one and the head turns. */
const SPINE = ['hips', 'spine01', 'spine02', 'spine03', 'clavicleL', 'clavicleR', 'neck', 'head', 'jaw'];

const who = { noctis: null, gladio: 'gladio', ignis: 'ignis', prompto: 'prompto' };
const out = { ablation: { HIDE_HAIR, NO_CONTACT }, heads: {}, specs: [] };
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const r3 = (v) => v.map((x) => +x.toFixed(4));

for (const [key, id] of Object.entries(who)) {
  const m = id ? (party && party.get && party.get(id)) : player;
  const ch = m && m.character;
  if (!ch || !ch.rig) continue;
  const byName = ch.rig.byName;

  if (HIDE_HAIR && ch.hair) ch.hair.visible = false;
  if (ch.anim && !ch.anim.__lookPinned) {
    const bind = new Map();
    for (const n of SPINE) if (byName[n]) bind.set(n, byName[n].rotation.clone());
    const orig = ch.anim.update.bind(ch.anim);
    ch.anim.update = (dt, st) => {
      orig(dt, st);
      ch.anim.blink = 0;
      for (const n of SPINE) {
        const b = byName[n];
        if (!b) continue;
        b.rotation.set(0, 0, 0);
        b.updateMatrix();
      }
      // gaze last: `Anim` writes it onto the eye pivots after the bones
      const zero = (o) => { if (o) { o.rotation.set(0, 0, 0); o.updateMatrix(); } };
      zero(ch.eyes);
      if (ch.eyeGlobes) for (const gp of ch.eyeGlobes) zero(gp);
    };
    ch.anim.__lookPinned = true;
    out.heads[key] = { pinnedBones: [...bind.keys()] };
  }

  m.root.updateWorldMatrix(true, false);
  const rp = [m.root.position.x, m.root.position.y, m.root.position.z];
  const e = m.root.matrixWorld.elements;
  const fwd = norm([e[8], 0, e[10]]);
  const right = norm([-fwd[2], 0, fwd[0]]);

  const hb = byName.head;
  hb.updateWorldMatrix(true, false);
  const he = hb.matrixWorld.elements;
  const aimW = [he[12] + fwd[0] * 0.02, he[13] + ch.rig.dims.headScale * 0.045, he[14] + fwd[2] * 0.02];
  const aim = r3([aimW[0] - rp[0], aimW[1] - rp[1], aimW[2] - rp[2]]);
  const shot = (name, dir, dist, fov) => out.specs.push({
    name, fov, time: HOUR, weather: 'clear', follow: id || 'player', hud: false,
    offset: r3([aim[0] + dir[0] * dist, aim[1] + dir[1] * dist, aim[2] + dir[2] * dist]),
    lookOffset: aim,
  });

  // dead ahead and level: the framing every proportion argument is made in
  shot(`${key}_front`, norm([fwd[0], 0.02, fwd[2]]), 0.52, 30);
  // straight side-on: the profile the landmark bench measures
  shot(`${key}_side`, norm([right[0], 0.02, right[2]]), 0.52, 30);
  shot(`${key}_q`, norm([fwd[0] * 0.66 + right[0] * 0.75, 0.06, fwd[2] * 0.66 + right[2] * 0.75]), 0.50, 30);
}

return out;
