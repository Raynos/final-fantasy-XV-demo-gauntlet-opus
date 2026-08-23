// EYE framings, and the numbers behind them.
//
// The eyes were ungradeable until `hero_portrait` existed, and the first grade
// they got — "flat saturated disc, no catchlight, no limbal ring, no pupil" —
// was taken from a 20 px aperture two-thirds covered by a fringe. That is the
// same mistake as the hand probe framed at the hip: it may be the right verdict
// but the frame could not have shown otherwise.
//
// So this emits, per hero: the eye at macro range with the groom in place (the
// honest one — it is what the game shows), the same frame with the hair mesh
// hidden (the diagnostic one — what the eye assembly actually looks like), and
// a straight-on both-eyes frame. It also dumps the eye's own geometry: globe
// radius, iris half-angle, lid opening, and the aperture's height as a fraction
// of the globe, so a claim about "no sclera" is a number and not an eyeball.
//
//   PORT=<vite> node src/tools/framecam.mts tmp/eyes.json --out tmp/shots/<r> \
//     --probe src/tools/_probe/eyes.mts --settle 8
//
// 16.2 is the corpus's golden hour, which is what `hero_portrait` is shot at;
// 12.0 is the noon control for any colour claim (see the §12 rows).
const HOUR = 16.2;
/** Hide the groom so the frame can show the eye assembly it is judging. */
const HIDE_HAIR = true;
/** Pin the gaze dead ahead. Ablation: does the iris centre in the aperture? */
const ZERO_GAZE = false;
/** Hide the head shell too: is the thing covering the globe the skull, or a lid? */
const HIDE_HEAD = false;

const g = window.GAME;
g.settle(90);
if (g.post && g.post.dof) g.post.dof.enabled = false;
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
  if (!sys || sys.__pinned) return;
  const orig = sys.update.bind(sys);
  sys.update = (dt, game) => { orig(dt, game); restore(); };
  sys.__pinned = true;
};
if (player && player.root) pin(player.root, player);
if (party) for (const m of party.members) pin(m.root, m);
wrap(player); wrap(party);

const who = { noctis: null, gladio: 'gladio', ignis: 'ignis', prompto: 'prompto' };
const out = { eyes: {}, specs: [] };
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const r3 = (v) => v.map((x) => +x.toFixed(4));

for (const [key, id] of Object.entries(who)) {
  const m = id ? (party && party.get && party.get(id)) : player;
  if (!m) continue;
  const ch = m.character;
  const rig = ch && ch.rig;
  const byName = rig && rig.byName;
  if (!byName || !ch.eyes) continue;

  const wp = (o) => { o.updateWorldMatrix(true, false); const e = o.matrixWorld.elements; return [e[12], e[13], e[14]]; };
  m.root.updateWorldMatrix(true, false);
  const rp = [m.root.position.x, m.root.position.y, m.root.position.z];
  const e = m.root.matrixWorld.elements;
  const fwd = norm([e[8], 0, e[10]]);
  const right = norm([-fwd[2], 0, fwd[0]]);
  const off = (p, dx, dy, dz) => r3([p[0] - rp[0] + dx, p[1] - rp[1] + dy, p[2] - rp[2] + dz]);
  const shot = (name, aim, dir, dist, fov) => out.specs.push({
    name, fov, time: HOUR, weather: 'clear', follow: id || 'player',
    offset: r3([aim[0] + dir[0] * dist, aim[1] + dir[1] * dist, aim[2] + dir[2] * dist]),
    lookOffset: r3(aim),
  });

  // ---- the eye assembly, measured ---------------------------------------
  // The eyeball mesh rides a gaze pivot under the head bone. Its geometry is
  // authored around that pivot's origin, so the globe radius is the bounding
  // sphere's own radius and the two globes' separation is twice the |x| of the
  // farthest vertex. Read off the buffer, not off a constant in a comment.
  const eyeMesh = ch.meshes.find((q) => q.geometry && q.geometry.attributes.position
    && q.material && q.material.userData && q.material.userData.isEye);
  const em = eyeMesh || ch.eyes.children.find((c) => c.geometry);
  const rows = { radius: null, sep: null, apertureY: null, globeSpanY: null };
  if (em && em.geometry) {
    const pos = em.geometry.attributes.position.array;
    let maxX = 0, minY = 1e9, maxY = -1e9, maxR = 0, cx = 0, n = 0;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i], y = pos[i + 1], z = pos[i + 2];
      if (Math.abs(x) > maxX) maxX = Math.abs(x);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      cx += Math.abs(x); n++;
    }
    const bx = cx / Math.max(1, n);
    for (let i = 0; i < pos.length; i += 3) {
      const dx = Math.abs(pos[i]) - bx, dy = pos[i + 1], dz = pos[i + 2];
      const r = Math.hypot(dx, dy, dz);
      if (r > maxR) maxR = r;
    }
    rows.radius = +maxR.toFixed(5);
    rows.sep = +(bx * 2).toFixed(5);
    rows.globeSpanY = +(maxY - minY).toFixed(5);
  }
  // The lid aperture: the gap between the two lid margins at the fissure's
  // centre, in the same units, taken from the head mesh is not reachable from
  // here — so report the `eyeOpen` the look asked for alongside the globe, and
  // let the frame settle the rest.
  rows.eyeOpen = ch.look && ch.look.eyeOpen;
  rows.iris = ch.look && ch.look.iris;
  out.eyes[key] = rows;

  const hd = byName.head;
  if (!hd) continue;
  ch.eyes.updateWorldMatrix(true, false);
  const ee = ch.eyes.matrixWorld.elements;
  const eyeC = [ee[12], ee[13], ee[14]];
  // The near eye, off the pivot by the measured half-separation along the
  // head's own right axis — not by a guessed constant.
  const half = (rows.sep || 0.062) * 0.5;
  const near = [eyeC[0] + right[0] * half, eyeC[1], eyeC[2] + right[2] * half];

  // Macro on the near eye: 0.26 m on a long lens, three-quarter from the front
  // so the globe's curvature reads and the catchlight has somewhere to be.
  const dir = norm([fwd[0] * 0.86 + right[0] * 0.50, 0.14, fwd[2] * 0.86 + right[2] * 0.50]);
  shot(`${key}_eye`, off(near, 0, 0, 0), dir, 0.26, 14);
  // Both eyes, straight on, at the range §12.6 calls a close-up. Dead on the
  // face's own forward axis and level with the eye: a 14-degree offset here is
  // enough for the nose bridge to eat the medial half of the far eye, and that
  // is a property of the framing, not of the eye.
  shot(`${key}_eyes`, off(eyeC, 0, 0, 0), norm([fwd[0], 0.0, fwd[2]]), 0.42, 18);
}

// `framecam` reads this file as text and has no way to pass a parameter in, so
// the groom toggle is a constant here, the same way HOUR is: run it once as
// authored for the honest frame, once with HIDE_HAIR true for the diagnostic
// one. Nothing about the eye changes between them; what changes is whether the
// frame can show it. Two runs, two directories, one comparison.
let hidden = 0;
if (HIDE_HAIR) {
  for (const [, id] of Object.entries(who)) {
    const m = id ? (party && party.get && party.get(id)) : player;
    if (m && m.character && m.character.hair) { m.character.hair.visible = false; hidden++; }
    if (HIDE_HEAD && m && m.character && m.character.head) m.character.head.visible = false;
  }
}
out.hairHidden = hidden;

// What the gaze actually is at capture time, and where each globe points
// relative to the head. A claim about "the iris is at the limb" is a rotation,
// so read the rotation rather than the pixels.
out.gaze = {};
for (const [key, id] of Object.entries(who)) {
  const m = id ? (party && party.get && party.get(id)) : player;
  const ch = m && m.character;
  if (!ch || !ch.eyes) continue;
  if (ZERO_GAZE) {
    const zero = (o) => { o.rotation.set(0, 0, 0); o.updateMatrix(); };
    zero(ch.eyes);
    if (ch.eyeGlobes) for (const gp of ch.eyeGlobes) zero(gp);
    // and stop the animator putting it back
    if (ch.anim && !ch.anim.__gazePinned) {
      const orig = ch.anim.update.bind(ch.anim);
      ch.anim.update = (dt, st) => {
        orig(dt, st);
        zero(ch.eyes);
        if (ch.eyeGlobes) for (const gp of ch.eyeGlobes) zero(gp);
      };
      ch.anim.__gazePinned = true;
    }
  }
  const r = ch.eyes.rotation;
  out.gaze[key] = {
    pitch: +r.x.toFixed(4), yaw: +r.y.toFixed(4),
    eyePitch: +(ch.anim && ch.anim.eyePitch || 0).toFixed(4),
    eyeYaw: +(ch.anim && ch.anim.eyeYaw || 0).toFixed(4),
    globes: (ch.eyeGlobes || []).map((gp) => [+gp.position.x.toFixed(5), +gp.position.y.toFixed(5), +gp.position.z.toFixed(5)]),
  };
}

return out;
