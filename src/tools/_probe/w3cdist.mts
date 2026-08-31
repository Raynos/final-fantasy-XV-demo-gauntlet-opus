// Lane W3-C — the party at the distance the PLAYER judged them at.
//
// Five previous lanes measured this head at 0.4-0.6 m with `framecam` and a
// narrowed fov. The blind playtester has now twice described something
// different at walking distance ("a bright orange band across the eyes, like
// they're all wearing blindfolds", "the same blond model twice"). So this
// probe emits **native-fov** framings — fov 50, the game's own lens — at 3 / 5
// / 8 m, which puts a head at roughly 70 / 42 / 26 px in a 1600x900 frame.
// That is the pixel budget a defect actually has to survive.
//
// Pinning is copied from `_probe/heads.mts` and is load-bearing for the same
// reason: `framecam` settles the sim between captures, the offsets are
// world-space, and a companion that keeps steering to a wandering formation
// slot turns a front framing into a picture of a hillside by the tenth spec.
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
const out = { heads: {}, specs: [] };
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const r3 = (v) => v.map((x) => +x.toFixed(3));
const wp = (o) => { o.updateWorldMatrix(true, false); const e = o.matrixWorld.elements; return [e[12], e[13], e[14]]; };

for (const [key, id] of Object.entries(who)) {
  const m = id ? (party && party.get && party.get(id)) : player;
  if (!m) { out.heads[key] = null; continue; }
  m.root.updateWorldMatrix(true, false);
  const rp = [m.root.position.x, m.root.position.y, m.root.position.z];
  const e = m.root.matrixWorld.elements;
  const fwd = norm([e[8], 0, e[10]]);
  const ep = m.character && m.character.eyes ? wp(m.character.eyes) : null;
  const eyeH = ep ? ep[1] - rp[1] : 1.60;
  out.heads[key] = { root: r3(rp), fwd: r3(fwd), eyeH: +eyeH.toFixed(3) };
  const aim = [fwd[0] * 0.045, 0, fwd[2] * 0.045];
  const shot = (name, dist, aimH, lift, fov) => out.specs.push({
    name, fov: fov || 50, time: 14.0, weather: 'clear', follow: id || 'player',
    offset: r3([aim[0] + fwd[0] * dist, aimH + (lift || 0), aim[2] + fwd[2] * dist]),
    lookOffset: r3([aim[0], aimH, aim[2]]),
  });
  // head-centred, native lens, at the three distances a player walks at
  shot(`${key}_h3`, 3.0, eyeH, 0.0);
  shot(`${key}_h5`, 5.0, eyeH, 0.0);
  shot(`${key}_h8`, 8.0, eyeH, 0.0);
  // full body front-on: the silhouette read ("bust plate, puff sleeves, skirt")
  shot(`${key}_body`, 4.2, 0.95, 0.10);
}
return out;
