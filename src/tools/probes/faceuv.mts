/**
 * Where does the painted face map actually land on the face?
 *
 *   node src/tools/framecam.mts --probe src/tools/probes/faceuv.mts \
 *     --out tmp/shots/<round> --settle 8 --dirty
 *
 * `facemap.mts` shows the canvas contains a strong mouth, real nostril shadows
 * and lash lines. Nothing of it reads in a 0.5 m frontal frame. Two worlds:
 * the map is sampled where we think it is and the paint is being eaten, or it
 * is not sampled there at all.
 *
 * `facemark.mts` was meant to decide that and **cannot**: it draws into
 * `map.mipmaps[i].getContext('2d')`, and the mip chain here is not canvases —
 * every level fails the `getContext` guard and the loop `continue`s, so the
 * probe stamps nothing and reports success. Its frames show no magenta because
 * none was ever drawn. (17 magenta pixels in one profile of sixteen frames;
 * zero in the frontal.)
 *
 * This replaces the map outright with a *generated* one that cannot be skipped:
 * a lat/long grid over the same cylindrical projection `paintFace` uses, with
 * filled discs at the mouth, nose tip and eye anchors and a bar down the u = 0.5
 * midline. Where those land in the frame is the answer, in one capture.
 *
 * Everything below the control block is `facecam.mts`, unchanged.
 */
const HOUR = 16.2;
const HIDE_HAIR = String(window.__UV_HIDE_HAIR || '') === '1';
const HIDE_HEAD = false;
const FRONT_SIDE = false;
const ZERO_GAZE = true;
const NO_BLINK = true;
const PIN_HEAD = true;
const NO_HATCH = false;

const g = window.GAME;
g.settle(90);
if (g.post && g.post.dof) g.post.dof.enabled = false;
const hud = g.get('HUD');
if (hud && hud.hints) { hud.hints.update = () => {}; hud.hints.root.remove(); }

const party = g.get('Party');
const player = g.get('Player');

const pinned = [];
const who = { noctis: null, gladio: 'gladio', ignis: 'ignis', prompto: 'prompto' };
const subjects = [];
for (const [key, id] of Object.entries(who)) {
  const m = id ? (party && party.get && party.get(id)) : player;
  if (m && m.character) subjects.push([key, m]);
}

// ---- the control map -------------------------------------------------------
// `paintFace`'s projection, restated: u wraps atan2(x, z) over the full turn and
// v is canonical y over [Y_MIN, Y_MAX]. Both constants are copied from
// `Face.ts`'s `faceUV`; if they drift, this probe draws the wrong grid and says
// so by disagreeing with `facemap.mts`.
const Y_MIN = -0.122, Y_MAX = 0.116;
const ANCHORS = {
  mouth: { p: [0, -0.079, 0.084], c: '#ff00ff' },
  noseTip: { p: [0, -0.046, 0.104], c: '#00ff00' },
  eye: { p: [0.0335, -0.006, 0.0646], c: '#ffff00' },
  chin: { p: [0, -0.108, 0.074], c: '#00ffff' },
};
const uvOf = (p) => [0.5 + Math.atan2(p[0], p[2]) / (Math.PI * 2),
  Math.min(1, Math.max(0, (p[1] - Y_MIN) / (Y_MAX - Y_MIN)))];

const S = 1024;
const cv = document.createElement('canvas');
cv.width = S; cv.height = S;
const cx = cv.getContext('2d');
// 24 hue bands in u across the full turn (15 degrees each) and 12 value steps
// in v: a face that samples the map the way `paintFace` assumes shows a regular
// grid, and any compression, mirroring or offset is visible without hunting for
// a 12 mm disc.
for (let i = 0; i < 24; i++) {
  for (let j = 0; j < 12; j++) {
    const hue = (i * 360) / 24;
    const lig = 30 + (j % 2) * 26;
    cx.fillStyle = `hsl(${hue}, 85%, ${lig}%)`;
    cx.fillRect((i / 24) * S, (j / 12) * S, S / 24 + 1, S / 12 + 1);
  }
}
// the u = 0.5 midline and the v of each face anchor, in white
cx.fillStyle = '#ffffff';
cx.fillRect(0.5 * S - 4, 0, 8, S);
for (const [, a] of Object.entries(ANCHORS)) {
  const [u, v] = uvOf(a.p);
  cx.fillStyle = a.c;
  cx.fillRect(0, (1 - v) * S - 3, S, 6);
  cx.beginPath();
  cx.ellipse(u * S, (1 - v) * S, 26, 26, 0, 0, Math.PI * 2);
  cx.fill();
  cx.strokeStyle = '#000'; cx.lineWidth = 3; cx.stroke();
}

const marks = {};
for (const [key, m] of subjects) {
  const ch = m.character;
  if (!ch.faceMat) continue;
  const tex = new (ch.faceMat.map.constructor)(cv);
  tex.colorSpace = ch.faceMat.map.colorSpace;
  tex.wrapS = ch.faceMat.map.wrapS;
  tex.wrapT = ch.faceMat.map.wrapT;
  tex.flipY = ch.faceMat.map.flipY;
  // Match the shipped sampler exactly, or this probe measures its own texture's
  // filtering instead of the face's: the painted map ships with anisotropy 16
  // and a hand-built 11-level chain (`generateMipmaps = false`).
  tex.anisotropy = ch.faceMat.map.anisotropy;
  tex.minFilter = ch.faceMat.map.minFilter;
  tex.magFilter = ch.faceMat.map.magFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  ch.faceMat.map = tex;
  if (String(window.__UV_EMISSIVE || '1') === '1') {
    // Unlit readout: the question is which texel a pixel samples, and a
    // terminator across the face makes half the bands unreadable otherwise.
    ch.faceMat.emissiveMap = tex;
    ch.faceMat.emissive.setRGB(1, 1, 1);
    ch.faceMat.emissiveIntensity = 1;
    ch.faceMat.color.setRGB(0, 0, 0);
  }
  ch.faceMat.needsUpdate = true;
  marks[key] = Object.fromEntries(Object.entries(ANCHORS).map(([k, a]) => [k, uvOf(a.p).map((x) => +x.toFixed(4))]));
}

// ---- facecam's pins --------------------------------------------------------
for (const [, m] of subjects) {
  const ch = m.character;
  if (m.root) { pinned.push({ o: m.root, p: m.root.position.clone(), r: m.root.rotation.y }); }
  if (PIN_HEAD && ch.anim && !ch.anim.__faceuv) {
    const orig = ch.anim.update.bind(ch.anim);
    const bn = ch.rig.byName;
    ch.anim.update = (dt, st) => {
      orig(dt, st);
      if (NO_BLINK) ch.anim.blink = 0;
      for (const b of [bn.neck, bn.head]) if (b) { b.rotation.set(0, 0, 0); b.updateMatrix(); }
      if (ZERO_GAZE) {
        const zero = (o) => { o.rotation.set(0, 0, 0); o.updateMatrix(); };
        if (ch.eyes) zero(ch.eyes);
        if (ch.eyeGlobes) for (const gp of ch.eyeGlobes) zero(gp);
      }
    };
    ch.anim.__faceuv = true;
  }
  if (HIDE_HAIR && ch.hair) ch.hair.visible = false;
}
g.settle(4);
for (const q of pinned) { q.o.position.copy(q.p); q.o.rotation.y = q.r; }

const SPECS = [];
for (const [key, m] of subjects) {
  const ch = m.character;
  const root = m.root;
  root.updateWorldMatrix(true, false);
  const e = root.matrixWorld.elements;
  const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const fwd = nrm([e[8], 0, e[10]]);
  const hb = ch.rig.byName.head;
  hb.updateWorldMatrix(true, false);
  const he = hb.matrixWorld.elements;
  const s = ch.rig.dims.headScale;
  const rp = [root.position.x, root.position.y, root.position.z];
  const aim = [he[12] + fwd[0] * 0.02 - rp[0], he[13] + s * 0.045 - rp[1], he[14] + fwd[2] * 0.02 - rp[2]];
  const dir = nrm([fwd[0], 0.10, fwd[2]]);
  SPECS.push({
    name: `${key}_uv`, fov: 30, time: HOUR, weather: 'clear', hud: false,
    follow: key === 'noctis' ? 'player' : key,
    offset: [aim[0] + dir[0] * 0.55, aim[1] + dir[1] * 0.55, aim[2] + dir[2] * 0.55],
    lookOffset: aim,
  });
}
return { specs: SPECS, marks, note: 'u=0.5 white bar is the face midline; magenta=mouth green=noseTip yellow=eye cyan=chin' };
