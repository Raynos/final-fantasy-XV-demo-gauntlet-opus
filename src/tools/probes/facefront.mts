/**
 * `facebar`'s framing with nothing stamped on it: the head at 0.55 m, hair
 * hidden, head and eyes pinned to bind, on the **head bone's** own forward
 * axis. Three framings per subject — front, 30 degrees off, and profile —
 * because a nose is read frontally by its relief against the cheek and that is
 * only judgeable next to the profile that has one.
 *
 *   node src/tools/framecam.mts --probe src/tools/probes/facefront.mts \
 *     --out tmp/shots/x --jpeg
 *
 * Set `FF_WHO` in the page (or leave it) to pick subjects; default is Noctis
 * only, because four heads is four images and images are 95% of a transcript.
 *
 * ## The ablation ladder this framing was built for
 *
 * The hard vertical hairline down the midline of every front view in this
 * repo's history survives all of these, and each is a two-line edit to a copy
 * of this file — pass 5 ran every one and none of them is the cause:
 *
 * - **the hour.** `time: hr` in the spec below, 9 / 12 / 14.5 / 16.2. At 16.2
 *   the line is also a terminator (the key is raking and the frame is ~1.3x
 *   over, so a Lambert ramp binarises); at 12 and 14.5 the terminator is gone
 *   and the hairline is still there.
 * - **the painted map** — `facefront_flat.mts`, which swaps a flat 64 px canvas
 *   in with the shipped sampler state.
 * - **the pore normal map alone** — `mt.normalMap = null`.
 * - **the shell's normals negated**, and **the shell's normals replaced by the
 *   outward radial direction**. The radial run also counts the sign
 *   disagreement: it is how "the head's normals are inverted" was ruled out
 *   after `facewind.mts` suggested it.
 */
const HOUR = 16.2;
const g = window.GAME;
g.settle(90);
if (g.post && g.post.dof) g.post.dof.enabled = false;
const hud = g.get('HUD');
if (hud && hud.hints) { hud.hints.update = () => {}; hud.hints.root.remove(); }

const party = g.get('Party');
const player = g.get('Player');
const who = (window.FF_WHO || 'noctis').split(',');
const all = { noctis: null, gladio: 'gladio', ignis: 'ignis', prompto: 'prompto' };
const subjects = [];
for (const key of who) {
  const id = all[key];
  const m = id ? (party && party.get && party.get(id)) : player;
  if (m && m.character) subjects.push([key, m]);
}

const pinned = [];
for (const [, m] of subjects) {
  const ch = m.character;
  if (m.root) pinned.push({ o: m.root, p: m.root.position.clone(), r: m.root.rotation.y });
  if (ch.hair) ch.hair.visible = false;
  if (ch.anim && !ch.anim.__ff) {
    const orig = ch.anim.update.bind(ch.anim);
    const bn = ch.rig.byName;
    ch.anim.update = (dt, st) => {
      orig(dt, st);
      ch.anim.blink = 0;
      for (const b of [bn.neck, bn.head]) if (b) { b.rotation.set(0, 0, 0); b.updateMatrix(); }
      const zero = (o) => { o.rotation.set(0, 0, 0); o.updateMatrix(); };
      if (ch.eyes) zero(ch.eyes);
      if (ch.eyeGlobes) for (const gp of ch.eyeGlobes) zero(gp);
    };
    ch.anim.__ff = true;
  }
}
g.settle(4);
for (const q of pinned) { q.o.position.copy(q.p); q.o.rotation.y = q.r; }

const SPECS = [];
const info = [];
for (const [key, m] of subjects) {
  const ch = m.character;
  const root = m.root;
  root.updateWorldMatrix(true, false);
  const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const hb = ch.rig.byName.head;
  hb.updateWorldMatrix(true, false);
  const he = hb.matrixWorld.elements;
  const fwd = nrm([he[8], 0, he[10]]);
  const rgt = [fwd[2], 0, -fwd[0]];
  const s = ch.rig.dims.headScale;
  const rp = [root.position.x, root.position.y, root.position.z];
  const aim = [he[12] + fwd[0] * 0.02 - rp[0], he[13] + s * 0.045 - rp[1], he[14] + fwd[2] * 0.02 - rp[2]];
  const R = 0.55;
  for (const [tag, yaw] of [['front', 0], ['q30', 30], ['side', 82]]) {
    const a = yaw * Math.PI / 180;
    const d = nrm([fwd[0] * Math.cos(a) + rgt[0] * Math.sin(a), 0.10,
      fwd[2] * Math.cos(a) + rgt[2] * Math.sin(a)]);
    SPECS.push({
      name: `${key}_${tag}`, fov: 30, time: HOUR, weather: 'clear', hud: false,
      follow: key === 'noctis' ? 'player' : key,
      offset: [aim[0] + d[0] * R, aim[1] + d[1] * R, aim[2] + d[2] * R],
      lookOffset: aim,
    });
  }
  info.push(`${key}: headScale ${s.toFixed(4)}`);
}
return { specs: SPECS, info };
