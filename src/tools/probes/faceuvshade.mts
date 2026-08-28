/**
 * Draw the face's `vMapUv` itself, with no texture in the path.
 *
 *   node src/tools/framecam.mts --probe src/tools/probes/faceuvshade.mts \
 *     --out tmp/shots/<round> --settle 8
 *
 * `facebar.mts` finds the map's `u` axis renders about eleven times faster
 * across the front of the face than `faceattr.mts` says the vertex buffer holds.
 * Three candidates were named. `faceocclude.mts` closed the third — the
 * `*_shadow` proxy has `colorWrite = false` and cannot reach the frame. This is
 * the second: is the discrepancy in the *attribute reaching the shader*, or in
 * the texture object a probe hands the material?
 *
 * It replaces the fragment output with `fract(vMapUv * 8.0)` — the same eight
 * bands `facebar` paints, but generated in the shader, with no sampler, no
 * mip chain, no colour space and no canvas. If the bands come out evenly spread
 * across the face, the attribute is fine at the fragment and the fault is in the
 * texture path. If they come out crushed at the front the same way, the fault is
 * upstream of both and `facebar`'s reading stands.
 *
 * `patchSkin` already owns `onBeforeCompile` on this material, so this wraps it
 * rather than replacing it, and bumps `customProgramCacheKey` so three does not
 * serve the cached program.
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

const info = [];
for (const [key, m] of subjects) {
  const mat = m.character.faceMat;
  if (!mat) continue;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    // `dithering_fragment` is the last chunk in the fragment main, so this wins
    // over everything `patchSkin` adds and over the tonemap/encode pair.
    shader.fragmentShader = shader.fragmentShader.replace('#include <dithering_fragment>',
      '#include <dithering_fragment>\n'
      + '\tgl_FragColor = vec4( fract( vMapUv.x * 8.0 ), fract( vMapUv.y * 8.0 ), 0.25, 1.0 );');
  };
  mat.customProgramCacheKey = () => 'faceuvshade';
  mat.needsUpdate = true;
  info.push(`${key}: patched`);
}

const pinned = [];
for (const [, m] of subjects) {
  const ch = m.character;
  if (m.root) pinned.push({ o: m.root, p: m.root.position.clone(), r: m.root.rotation.y });
  if (ch.hair) ch.hair.visible = false;
  if (ch.anim && !ch.anim.__faceuvshade) {
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
    ch.anim.__faceuvshade = true;
  }
}
g.settle(4);
for (const q of pinned) { q.o.position.copy(q.p); q.o.rotation.y = q.r; }

const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const SPECS = subjects.map(([key, m]) => {
  const ch = m.character;
  const root = m.root;
  root.updateWorldMatrix(true, false);
  const hb = ch.rig.byName.head;
  hb.updateWorldMatrix(true, false);
  const he = hb.matrixWorld.elements;
  const fwd = nrm([he[8], 0, he[10]]);
  const s = ch.rig.dims.headScale;
  const rp = [root.position.x, root.position.y, root.position.z];
  const aim = [he[12] + fwd[0] * 0.02 - rp[0], he[13] + s * 0.045 - rp[1], he[14] + fwd[2] * 0.02 - rp[2]];
  const dir = nrm([fwd[0], 0.10, fwd[2]]);
  return {
    name: `${key}_uvshade`, fov: 30, time: HOUR, weather: 'clear', hud: false,
    follow: key === 'noctis' ? 'player' : key,
    offset: [aim[0] + dir[0] * 0.55, aim[1] + dir[1] * 0.55, aim[2] + dir[2] * 0.55],
    lookOffset: aim,
  };
});
return { specs: SPECS, info };
