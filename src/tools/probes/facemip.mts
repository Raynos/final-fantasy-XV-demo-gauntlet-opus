/**
 * Is the painted face map being sampled from a mip level that has no face left
 * in it?
 *
 *   node src/tools/framecam.mts --probe src/tools/probes/facemip.mts \
 *     --out tmp/shots/<round> --settle 8 --dirty
 *   node src/tools/framecam.mts --probe src/tools/probes/facemip.mts \
 *     --out tmp/shots/<round>-lin --settle 8 --dirty --set __MIP_MODE=linear
 *
 * `faceuv.mts` put a 24-band hue wheel in u and a 12-step ramp in v on the face
 * map. Every hard band edge came back as a **smooth gradient** at 0.55 m, which
 * a magnified mip 0 cannot produce. The suspect is the cylindrical projection's
 * pole: `uvOf` is `atan2(x, z)`, and the head shell converges toward the axis at
 * the menton, so du/dscreen explodes over the whole lower face — exactly where
 * the mouth is — and the hardware picks a level where the mouth is gone.
 *
 * `__MIP_MODE`:
 *   `mip`    (default) — as it ships.
 *   `linear` — `minFilter = LinearFilter`, no mip chain at all. If the mouth
 *              appears, the mip selection is the defect and the paint is fine.
 *   `aniso`  — keep the chain, ask for maximum anisotropy, which is the fix for
 *              a derivative that is large in one axis and small in the other.
 *
 * Everything below the control block is `facecam.mts`'s pins and framings.
 */
const HOUR = 16.2;
const MODE = String(window.__MIP_MODE || 'mip');

const g = window.GAME;
g.settle(90);
if (g.post && g.post.dof) g.post.dof.enabled = false;
const hud = g.get('HUD');
if (hud && hud.hints) { hud.hints.update = () => {}; hud.hints.root.remove(); }

const party = g.get('Party');
const player = g.get('Player');
const who = { noctis: null, gladio: 'gladio', ignis: 'ignis', prompto: 'prompto' };
const subjects = [];
for (const [key, id] of Object.entries(who)) {
  const m = id ? (party && party.get && party.get(id)) : player;
  if (m && m.character) subjects.push([key, m]);
}

const info = [];
const caps = g.renderer.capabilities;
const maxAniso = caps.getMaxAnisotropy ? caps.getMaxAnisotropy() : 1;
for (const [key, m] of subjects) {
  const mat = m.character.faceMat;
  const map = mat && mat.map;
  if (!map) continue;
  info.push(`${key}: mips=${map.mipmaps ? map.mipmaps.length : 0} minFilter=${map.minFilter} `
    + `magFilter=${map.magFilter} aniso=${map.anisotropy} generateMipmaps=${map.generateMipmaps}`);
  if (MODE === 'linear') {
    map.minFilter = 1006; // THREE.LinearFilter
    map.generateMipmaps = false;
    map.mipmaps = [];
    map.needsUpdate = true;
  } else if (MODE === 'aniso') {
    map.anisotropy = maxAniso;
    map.needsUpdate = true;
  }
  mat.needsUpdate = true;
}
info.push(`mode=${MODE} maxAnisotropy=${maxAniso}`);

// ---- facecam's pins --------------------------------------------------------
const pinned = [];
for (const [, m] of subjects) {
  const ch = m.character;
  if (m.root) pinned.push({ o: m.root, p: m.root.position.clone(), r: m.root.rotation.y });
  if (ch.anim && !ch.anim.__facemip) {
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
    ch.anim.__facemip = true;
  }
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
    name: `${key}_mip`, fov: 30, time: HOUR, weather: 'clear', hud: false,
    follow: key === 'noctis' ? 'player' : key,
    offset: [aim[0] + dir[0] * 0.55, aim[1] + dir[1] * 0.55, aim[2] + dir[2] * 0.55],
    lookOffset: aim,
  });
}
return { specs: SPECS, info };
