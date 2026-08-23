// Head-and-shoulders PORTRAIT framings, plus a profile and the two hair ranges.
//
// This probe exists to answer, as a measurement, one thing the `heroart` handoff
// left as a diagnosis: is a portrait framing impossible because character meshes
// are culled on their bind-pose bounding sphere?
//
// It emits specs in exactly the form `src/game/Shots.ts` uses — `follow` plus
// `offset` plus `lookOffset` — at portrait range, so whatever it produces here is
// what a `hero_portrait` entry in the shot corpus would produce. It also dumps
// each mesh's `frustumCulled` flag and bounding sphere, which is the actual
// evidence for or against the claim.
//
//   PORT=<vite> node src/tools/framecam.mts --probe src/tools/_probe/portrait.mts \
//     --out tmp/shots/<round> --settle 8
// The hour every framing is shot at. `docs/reference/ART-DIRECTION.md` §12.3's
// plate rows were shot under different keys — Prompto's in full midday sun,
// Gladiolus's in a warm low one — so comparing our hair statistics to theirs
// means being able to move the clock and control for it. `framecam.mts` reads
// this file as text and has no way to pass a parameter in, so edit it: 16.2 is
// the corpus's golden hour, 12.0 is the noon control.
const HOUR = 16.2;

const g = window.GAME;
g.settle(90);
if (g.post && g.post.dof) g.post.dof.enabled = false;
const hud = g.get('HUD');
if (hud && hud.hints) { hud.hints.update = () => {}; hud.hints.root.remove(); }

const party = g.get('Party');
const player = g.get('Player');

// framecam settles between captures, so an unpinned subject walks out of frame
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
const out = { culling: {}, specs: [] };
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const r3 = (v) => v.map((x) => +x.toFixed(3));

for (const [key, id] of Object.entries(who)) {
  const m = id ? (party && party.get && party.get(id)) : player;
  if (!m) continue;
  const rig = m.character && m.character.rig;
  const byName = rig && rig.byName;
  if (!byName) continue;

  // ---- the culling claim, measured --------------------------------------
  // Per mesh: is it frustum-culled at all, and what is its bounding sphere? If
  // `frustumCulled` is false the renderer never tests the sphere, and the
  // bind-pose-sphere story cannot be the cause of anything.
  if (!out.culling[key]) {
    const rows = [];
    for (const mesh of m.character.meshes) {
      const bs = mesh.geometry && mesh.geometry.boundingSphere;
      rows.push({
        name: mesh.name,
        culled: mesh.frustumCulled,
        sphere: bs ? { c: r3([bs.center.x, bs.center.y, bs.center.z]), r: +bs.radius.toFixed(3) } : null,
      });
    }
    out.culling[key] = rows;
  }

  const wp = (o) => { o.updateWorldMatrix(true, false); const e = o.matrixWorld.elements; return [e[12], e[13], e[14]]; };
  m.root.updateWorldMatrix(true, false);
  const rp = [m.root.position.x, m.root.position.y, m.root.position.z];
  const e = m.root.matrixWorld.elements;
  const fwd = norm([e[8], 0, e[10]]);
  const right = norm([-fwd[2], 0, fwd[0]]);
  const bone = (n) => (byName[n] ? wp(byName[n]) : null);
  const off = (p, dx, dy, dz) => r3([p[0] - rp[0] + dx, p[1] - rp[1] + dy, p[2] - rp[2] + dz]);
  const shot = (name, aim, dir, dist, fov) => out.specs.push({
    name, fov, time: HOUR, weather: 'clear', follow: id || 'player',
    offset: r3([aim[0] + dir[0] * dist, aim[1] + dir[1] * dist, aim[2] + dir[2] * dist]),
    lookOffset: r3(aim),
  });

  // ---- the back of the hand, framed off the hand bone's own axes ---------
  // `_probe/hands.mts`'s `_hand` framing builds its direction from the *root's*
  // forward and right, which is not where the back of a hand faces: the hand
  // rolls with the forearm, and in the rest pose the dorsum ends up nearly
  // edge-on to a camera aimed that way. Ablating the dorsal tendons to six
  // times their amplitude produced no visible change in that framing at all,
  // which is the measurement that says it is not looking at the dorsum. (Its
  // `_palm` framing is worse — it sits inside the forearm.)
  //
  // `Body.ts` builds the palm sweep with `ref: front`, and `front` is the
  // dorsal normal, so the axis to look down is the hand bone's own. Reading it
  // off `matrixWorld` is what makes this framing correct for any pose.
  // Which of the bone's three axes is dorsal was settled by emitting all six
  // and looking: it is **minus the bone's x column**, the view with the knuckle
  // row across it. The other five are a palm, two edge-on profiles and two
  // views up the forearm — which is the class the old framing kept landing in.
  for (const sd of ['L', 'R']) {
    const hb = byName[`hand${sd}`];
    const kb = byName[`fingers${sd}`];
    if (!hb || !kb) continue;
    hb.updateWorldMatrix(true, false);
    const he = hb.matrixWorld.elements;
    const dorsal = norm([-he[0], -he[1], -he[2]]);
    const w = wp(hb); const k = wp(kb);
    const c = [(w[0] + k[0]) * 0.5, (w[1] + k[1]) * 0.5, (w[2] + k[2]) * 0.5];
    // pulled a little toward the sun so the relief has a key to catch; straight
    // down the dorsal axis in the rest pose the hand sits in its own shadow
    shot(`${key}_dorsum${sd}`, off(c, 0, 0, 0),
      norm([dorsal[0], dorsal[1] + 0.45, dorsal[2]]), 0.24, 20);
  }

  // The chest at 0.95 m: the range that decides whether a jacket has pockets,
  // stitching and hardware on it or is a black shell with panels.
  const ch = bone('spine03') || bone('spine02');
  if (ch) {
    shot(`${key}_chest`, off(ch, 0, 0.02, 0),
      norm([fwd[0] * 0.94 + right[0] * 0.34, 0.12, fwd[2] * 0.94 + right[2] * 0.34]), 0.95, 26);
  }

  const hd = bone('head');
  if (!hd) continue;
  // A portrait: near eye level, three-quarter, 1.15 m on a ~40 mm-equivalent
  // lens. Aimed slightly below the head bone so the shoulders are in frame —
  // that is what makes it a portrait rather than a floating head.
  shot(`${key}_portrait`, off(hd, 0, -0.055, 0),
    norm([fwd[0] * 0.88 + right[0] * 0.47, 0.10, fwd[2] * 0.88 + right[2] * 0.47]), 1.15, 30);
  // Dead-on profile: the head-shape frame the previous lane never reached.
  shot(`${key}_profile`, off(hd, 0, -0.03, 0),
    norm([right[0], 0.05, right[2]]), 1.05, 30);
  // The two hair ranges, matching `_probe/hands.mts` so shots compare directly.
  shot(`${key}_crown`, off(hd, 0, 0.06, 0),
    norm([fwd[0] * 0.52 + right[0] * 0.42, 0.62, fwd[2] * 0.52 + right[2] * 0.42]), 0.86, 24);
  shot(`${key}_hairfield`, off(hd, 0, 0.0, 0),
    norm([fwd[0] * 0.86 + right[0] * 0.50, 0.16, fwd[2] * 0.86 + right[2] * 0.50]), 2.60, 20);
}
return out;
