/**
 * Is something drawn *over* the face?
 *
 *   node src/tools/framecam.mts --probe src/tools/probes/faceocclude.mts \
 *     --out tmp/shots/<round> --settle 8 --dirty
 *
 * `facebar.mts` finds that the map's `u` axis renders about eleven times faster
 * across the front of the face than the vertex buffer says it should, while `v`
 * registers correctly. One of the three candidates for that is the simplest:
 * the pixels on the front of the face belong to a different surface.
 *
 * `faceattr.mts` lists what a character carries. Besides the head shell there is
 * **`<name>_shadow`, 40 385 vertices of `MeshBasicMaterial` with
 * `depthWrite = false` and `visible = true`** — nominally a shadow-caster proxy.
 * A basic material has no features in it by construction, which is exactly what
 * the front of this face looks like.
 *
 * So: capture the face twice at the same framing, once as it ships and once with
 * every `*_shadow` mesh hidden, and diff. `--out` gets both; the pair is the
 * verdict. It also reports each mesh's `colorWrite`, `blending`, `opacity` and
 * `renderOrder`, which is what decides whether such a proxy can reach the frame
 * at all.
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
const proxies = [];
for (const [key, m] of subjects) {
  m.character.root.traverse((o) => {
    if (!o.isMesh && !o.isSkinnedMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const mt of mats) {
      if (!mt) continue;
      info.push(`${key}/${o.name || '-'}: ${mt.type} colorWrite=${mt.colorWrite} depthWrite=${mt.depthWrite} `
        + `depthTest=${mt.depthTest} blending=${mt.blending} opacity=${mt.opacity} transparent=${mt.transparent} `
        + `renderOrder=${o.renderOrder} visible=${o.visible && mt.visible}`);
    }
    if (/_shadow$/.test(o.name || '')) proxies.push(o);
  });
}

// ---- pins, as facecam ------------------------------------------------------
const pinned = [];
for (const [, m] of subjects) {
  const ch = m.character;
  if (m.root) pinned.push({ o: m.root, p: m.root.position.clone(), r: m.root.rotation.y });
  if (ch.anim && !ch.anim.__faceocc) {
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
    ch.anim.__faceocc = true;
  }
}
g.settle(4);
for (const q of pinned) { q.o.position.copy(q.p); q.o.rotation.y = q.r; }

// Hide the proxies for the *second* half of the capture set. `framecam` renders
// the specs after this body returns, so both states cannot be in one run --
// instead take the "hidden" frame here, by hand, and leave the shipped state for
// the specs.
const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const specOf = (key, m, name) => {
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
    name, fov: 30, time: HOUR, weather: 'clear', hud: false,
    follow: key === 'noctis' ? 'player' : key,
    offset: [aim[0] + dir[0] * 0.55, aim[1] + dir[1] * 0.55, aim[2] + dir[2] * 0.55],
    lookOffset: aim,
  };
};

for (const o of proxies) o.visible = false;
info.push(`hid ${proxies.length} *_shadow mesh(es)`);

return { specs: subjects.map(([key, m]) => specOf(key, m, `${key}_noshadow`)), info };
