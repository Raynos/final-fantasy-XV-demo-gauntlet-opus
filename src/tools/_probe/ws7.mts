// WS-7 framings: hands, boots and the whole figure — the three things this
// lane is judged on, at the ranges the game actually shows them.
//
// `_probe/hands.mts` frames a hand at 0.30 m, which is a macro shot no player
// ever sees: at that range any four-tube hand looks like four tubes, and the
// thing that is actually wrong (the read at 30-60 px) is invisible. These
// framings are 0.55 m (a combat closeup) and 1.6 m (a field camera), plus the
// lower leg, which no probe in this repo has ever framed and which is where
// `party-three-field-02.jpg` puts most of its per-character value structure.
//
//   node src/tools/framecam.mts --probe src/tools/_probe/ws7.mts \
//     --out tmp/shots/<round> --settle 8
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

  const bone = (n) => (byName[n] ? wp(byName[n]) : null);
  const off = (p, dx, dy, dz) => r3([p[0] - rp[0] + dx, p[1] - rp[1] + dy, p[2] - rp[2] + dz]);

  const shot = (name, aim, dir, dist, fov) => out.specs.push({
    name, fov, time: 16.2, weather: 'clear', follow: id || 'player',
    offset: r3([aim[0] + dir[0] * dist, aim[1] + dir[1] * dist, aim[2] + dir[2] * dist]),
    lookOffset: r3(aim),
  });

  // ---- hands, at the two ranges the game shows them ----------------------
  for (const s of ['L']) {
    const wr = bone(`hand${s}`); const kn = bone(`fingers${s}`);
    if (!wr) continue;
    const c = kn ? [(wr[0] + kn[0]) * 0.5, (wr[1] + kn[1]) * 0.5, (wr[2] + kn[2]) * 0.5] : wr;
    const sg = s === 'L' ? 1 : -1;
    const aim = off(c, 0, -0.02, 0);
    out.bones[`${key}_hand${s}`] = r3(c);
    const d = norm([fwd[0] * 0.74 + right[0] * 0.66 * sg, 0.22, fwd[2] * 0.74 + right[2] * 0.66 * sg]);
    shot(`${key}_hand`, aim, d, 0.55, 26);
    shot(`${key}_handfar`, aim, d, 1.60, 26);
  }

  // ---- lower leg and boot ------------------------------------------------
  // `party-three-field-02.jpg` gives every character a hard terminator at the
  // boot: shaft, cuff, sole and a value break against the trouser. Nothing in
  // this repo has ever looked at ours.
  const ft = bone('footL') || bone('foot');
  if (ft) {
    const aim = off(ft, 0, 0.16, 0);
    shot(`${key}_boot`, aim,
      norm([fwd[0] * 0.80 + right[0] * 0.58, 0.22, fwd[2] * 0.80 + right[2] * 0.58]), 0.95, 26);
  }

  // ---- the whole figure, at party_formation's range ----------------------
  const hips = bone('hips') || bone('root');
  if (hips) {
    const aim = off(hips, 0, 0.10, 0);
    shot(`${key}_figure`, aim,
      norm([fwd[0] * 0.90 + right[0] * 0.42, 0.16, fwd[2] * 0.90 + right[2] * 0.42]), 3.30, 30);
    shot(`${key}_torso`, aim,
      norm([fwd[0] * 0.90 + right[0] * 0.42, 0.14, fwd[2] * 0.90 + right[2] * 0.42]), 1.50, 30);
  }
}
return out;
