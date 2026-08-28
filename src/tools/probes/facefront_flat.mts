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

// --- ablate the painted map: a flat texture with the shipped sampler state, so
// the shader path is identical and anything left in the frame is GEOMETRY.
for (const [, m] of subjects) {
  const mat = m.character.faceMat; const map = mat && mat.map;
  if (!map) continue;
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
  const cx = cv.getContext('2d'); cx.fillStyle = '#b08a70'; cx.fillRect(0, 0, 64, 64);
  const tex = new map.constructor(cv);
  tex.colorSpace = map.colorSpace; tex.wrapS = map.wrapS; tex.wrapT = map.wrapT;
  tex.flipY = map.flipY; tex.anisotropy = map.anisotropy;
  tex.minFilter = map.minFilter; tex.magFilter = map.magFilter;
  tex.generateMipmaps = true; tex.needsUpdate = true;
  mat.map = tex; if (mat.normalMap) mat.normalMap = null; mat.needsUpdate = true;
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
      name: `${key}_${tag}_flat`, fov: 30, time: HOUR, weather: 'clear', hud: false,
      follow: key === 'noctis' ? 'player' : key,
      offset: [aim[0] + d[0] * R, aim[1] + d[1] * R, aim[2] + d[2] * R],
      lookOffset: aim,
    });
  }
  info.push(`${key}: headScale ${s.toFixed(4)}`);
}
return { specs: SPECS, info };
