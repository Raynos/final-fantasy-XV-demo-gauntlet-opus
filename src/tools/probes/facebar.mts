/**
 * Put the face map's own coordinates on the rendered face.
 *
 *   node src/tools/framecam.mts --probe src/tools/probes/facebar.mts \
 *     --out tmp/shots/<round> --settle 8 --dirty
 *
 * `facemap.mts` shows the painted canvas carries a strong mouth — a saturated
 * vermilion lens with a hard black line under it, plus nostril shadows and lash
 * lines. At 0.55 m frontal **none of it reads**: the lower face is a blank
 * balloon. Either the paint lands somewhere other than the mouth, or it lands
 * there and something eats it. Nothing in this repo had ever asked the frame.
 *
 * So: rebuild a canvas from the shipped map's mip 0, replace its contents with a
 * pattern whose coordinates are known — eight 45-degree stripes in u, one of
 * them blue so `u = 0.5` is identifiable, and a red latitude at the mouth's own
 * v — and hand it back as the material's `map` with the *shipped* sampler state
 * (anisotropy 16, the hand-built chain's filters). Everything the frame then
 * shows is a statement about where the map is.
 *
 * ## What it found, and the contradiction it leaves open
 *
 * - The **v axis registers**. The red latitude at the mouth's v crosses the face
 *   at mouth height, and the same at the nose. `paintFace` is not drawing the
 *   mouth at the wrong height.
 * - The **u axis does not**. Measured across the head at eye height, hair
 *   hidden, camera on the head bone's own forward axis: the band `theta` in
 *   [-45, +45] — which on this shell covers **89% of the head's width**, both
 *   eyes included — renders as **45 px of a 580 px head, 7.8%**. The bands at
 *   the silhouette render widest and the band facing the camera narrowest,
 *   which is the opposite of what a convex head under a frontal camera does.
 * - And **the vertex buffer disagrees with both**. `faceattr.mts` reads the
 *   attribute directly: the front-most vertex (the nose tip, z = +0.115) has
 *   `uv = (0.5000, 0.3821)`; the back-most has `u = 1.0`; the mean position of
 *   every vertex with `u` in [0.46, 0.54] is z = +0.083 and of every vertex near
 *   the seam z = -0.034. The mesh's UVs are correct, unmirrored, and the seam is
 *   at the back where `buildHead` puts it.
 *
 * So the attribute says one thing and the pixels another, by a factor of about
 * eleven. That is the open thread. It is not the sculpt, not the exposure and
 * not the paint's contrast, and it is the first hard evidence for *why* four
 * rounds of mouth work have moved the rendered mouth by 1 of 255. Do not spend
 * another lane re-tinting a lip until it is closed.
 *
 * ## Two instruments this replaces
 *
 * `facemark.mts` was written to answer exactly this and **cannot**: it stamps
 * through `map.mipmaps[i].getContext('2d')`, and the shipped chain's levels are
 * not canvases, so every level fails the guard, the loop `continue`s, and the
 * probe reports success having drawn nothing. Its frames carry 17 magenta pixels
 * across sixteen captures and zero on any frontal one. `drawImage` does work on
 * those levels, which is how this one gets at mip 0.
 *
 * A first version of this probe read (u, v) off a colour ramp through
 * `emissiveMap`, unlit. Do not: `patchSkin` rewrites this material and the
 * emissive path does not agree with `map` — it read (u, v) = (0, 1) on one half
 * of the face and (1, 0) on the other, which is two opposite corners of the map
 * and not any projection. Flat stripes through `map` need no decoding.
 */
const HOUR = 16.2;
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

// `Face.ts`'s own constants and anchors.
const Y_MIN = -0.122, Y_MAX = 0.116;
const MOUTH = [0, -0.064, 0.084];
const uvOf = (p) => [0.5 + Math.atan2(p[0], p[2]) / (Math.PI * 2),
  Math.min(1, Math.max(0, (p[1] - Y_MIN) / (Y_MAX - Y_MIN)))];

const info = [];
for (const [key, m] of subjects) {
  const mat = m.character.faceMat;
  const map = mat && mat.map;
  const src = map && map.mipmaps && map.mipmaps[0];
  if (!src) { info.push(`${key}: no mip 0`); continue; }
  const S = src.width;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = src.height;
  const cx = cv.getContext('2d');
  cx.drawImage(src, 0, 0);
  // Eight black/white stripes across the whole u range — 45 degrees of the
  // head each. A face that samples u the way the vertex buffer says it does
  // must show about three of them; one stripe means u is collapsed over the
  // face and every feature `paintFace` draws in u is smeared to nothing.
  for (let k = 0; k < 8; k++) {
    cx.fillStyle = k % 2 ? '#ffffff' : '#101010';
    cx.fillRect((k / 8) * S, 0, S / 8 + 1, cv.height);
  }
  // one blue stripe so u = 0.5 is identifiable among the eight
  cx.fillStyle = '#0000ff';
  cx.fillRect(0.5 * S, 0, S / 8, cv.height);
  cx.fillStyle = '#ff0000';
  cx.fillRect(0, (1 - uvOf(MOUTH)[1]) * cv.height - 5, S, 10);
  const tex = new map.constructor(cv);
  tex.colorSpace = map.colorSpace;
  tex.wrapS = map.wrapS; tex.wrapT = map.wrapT; tex.flipY = map.flipY;
  tex.anisotropy = map.anisotropy;
  tex.minFilter = map.minFilter; tex.magFilter = map.magFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  mat.map = tex;
  // NOT emissive. `patchSkin` rewrites this material's shader and an
  // `emissiveMap` there does not sample the same way `map` does — the first run
  // of this probe read (u, v) = (0, 1) on one half of the face and (1, 0) on
  // the other, which is two opposite corners of the map and not any projection.
  // Lit is enough: lighting scales R and G together, so the *direction* of the
  // ramp still reads.
  mat.needsUpdate = true;
  info.push(`${key}: mouth uv ${uvOf(MOUTH).map((x) => x.toFixed(4)).join(',')} on a ${S}x${cv.height} map`);
}

// ---- facecam's pins --------------------------------------------------------
const pinned = [];
for (const [, m] of subjects) {
  const ch = m.character;
  if (m.root) pinned.push({ o: m.root, p: m.root.position.clone(), r: m.root.rotation.y });
  if (ch.hair) ch.hair.visible = false;
  if (ch.anim && !ch.anim.__facebar) {
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
    ch.anim.__facebar = true;
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
  const hb = ch.rig.byName.head;
  hb.updateWorldMatrix(true, false);
  const he = hb.matrixWorld.elements;
  // The HEAD's own forward, not the root's. `facecam` frames along the root and
  // pins the head to bind, but the spine still carries yaw (`chestYaw`, and
  // `look.idle`'s spine terms), so a "front" framing is off by that much and a
  // midline readout taken in it cannot be trusted about which side is which.
  const fwd = nrm([he[8], 0, he[10]]);
  const s = ch.rig.dims.headScale;
  const rp = [root.position.x, root.position.y, root.position.z];
  const aim = [he[12] + fwd[0] * 0.02 - rp[0], he[13] + s * 0.045 - rp[1], he[14] + fwd[2] * 0.02 - rp[2]];
  const dir = nrm([fwd[0], 0.10, fwd[2]]);
  SPECS.push({
    name: `${key}_bar`, fov: 30, time: HOUR, weather: 'clear', hud: false,
    follow: key === 'noctis' ? 'player' : key,
    offset: [aim[0] + dir[0] * 0.55, aim[1] + dir[1] * 0.55, aim[2] + dir[2] * 0.55],
    lookOffset: aim,
  });
}
return { specs: SPECS, info };
