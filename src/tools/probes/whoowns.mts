// Which system owns the object at a given world position?
//
// `probes/thesixty.mts` narrowed drawcheck's self-disagreement to a handful of
// unnamed meshes sharing one world position, and an unnamed `Group < Group <
// Group < Scene` names nothing anybody can go and fix. Every system hangs its
// content off a root it registered with `Game`, so the owner is recoverable:
// ask each system whether the object is under one of its roots.
//
// Run: node src/tools/probe.mts src/tools/probes/whoowns.mts --dirty
//      node src/tools/probe.mts src/tools/probes/whoowns.mts --set __WO_AT=-0.3,8.6,0.2
const g = window.GAME;
const AT = String(window.__WO_AT || '-0.3,8.6,0.2').split(',').map(Number);
const R = Number(window.__WO_R || 1.5);
const SHOT = String(window.__WO_SHOT || 'town_forecourt');

g.resetClock();
g.applyShot(SHOT); g.settle(60);
g.applyShot(SHOT); g.settle(8);

const scene = g.scene || (g.post && g.post.rnd && g.post.rnd.scene);

/** Every system's roots, so an anonymous group can be traced back to an owner. */
const roots = [];
for (const s of g.systems || []) {
  const name = s.constructor ? s.constructor.name : '?';
  for (const k of ['root', 'group', 'scene', 'container']) {
    if (s[k] && s[k].isObject3D) roots.push({ name: `${name}.${k}`, node: s[k] });
  }
}

const ownerOf = (o) => {
  for (let p = o; p; p = p.parent) {
    for (const r of roots) if (r.node === p) return r.name;
  }
  return null;
};

const V = Object.getPrototypeOf(g.camera.position).constructor;
const wp = new V();
const hits = [];
scene.traverse((o) => {
  if (!o.isMesh) return;
  o.getWorldPosition(wp);
  const d = Math.hypot(wp.x - AT[0], wp.y - AT[1], wp.z - AT[2]);
  if (d > R) return;
  const chain = [];
  for (let p = o, i = 0; p && i < 8; p = p.parent, i++) {
    chain.push({
      type: p.type,
      name: p.name || null,
      children: p.children ? p.children.length : 0,
      userData: p.userData ? Object.keys(p.userData) : [],
      visible: p.visible,
      pos: [+p.position.x.toFixed(2), +p.position.y.toFixed(2), +p.position.z.toFixed(2)],
    });
  }
  hits.push({
    owner: ownerOf(o),
    verts: (o.geometry && o.geometry.attributes && o.geometry.attributes.position && o.geometry.attributes.position.count) || 0,
    material: o.material ? `${o.material.type}${o.material.name ? `:${o.material.name}` : ''}` : null,
    chain,
  });
});

return { at: AT, radius: R, systems: roots.map((r) => r.name), hits: hits.slice(0, 8), hitCount: hits.length };
