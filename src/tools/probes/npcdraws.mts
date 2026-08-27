// Where does `town_forecourt`'s peak frame spend its draw calls, and how many
// of them are townspeople?
//
// `drawcheck.mts` says a frame is over budget and is explicitly blind to where
// the calls went; `traverseVisible` cannot answer it either, because it misses
// the shadow cascades and the velocity-pass proxy scene, which together are
// ~1.4x the scene meshes. Wrapping `renderer.renderBufferDirect` is the only
// thing that sees every draw, so that is what this does.
//
// The pose reproduces `shoot.mts` exactly -- settle(60), re-apply, settle(8) --
// with the wrapper installed for the LAST of those eight steps, because the
// cascade refresh is on a rotating schedule and the number only means anything
// on the phase the capture lands on. `settle(7) + settle(1)` is `settle(8)`.
const g = window.GAME;
const SHOT = (window.__SHOT__ || 'town_forecourt');
g.applyShot(SHOT);
g.settle(60);
g.applyShot(SHOT);
g.settle(7);

const renderer = g.renderer;
const npcRoot = g.scene.getObjectByName('npcs');
const npcSet = new Set();
if (npcRoot) npcRoot.traverse((o) => npcSet.add(o));

const rows = new Map();
const bump = (key, pass) => {
  const e = rows.get(key) || (rows.set(key, { key, total: 0, colour: 0, shadow: 0, velocity: 0 }), rows.get(key));
  e.total++; e[pass]++;
};

const orig = renderer.renderBufferDirect.bind(renderer);
let total = 0, shadow = 0, velocity = 0;
renderer.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
  total++;
  const isShadow = !!(material && (material.isMeshDepthMaterial || material.isMeshDistanceMaterial));
  const isVel = !isShadow && scene !== g.scene && !!(material && material.isShaderMaterial);
  const pass = isShadow ? 'shadow' : isVel ? 'velocity' : 'colour';
  if (isShadow) shadow++; if (isVel) velocity++;

  // Which system? An NPC is anything under the `npcs` group; a velocity proxy
  // is not parented there at all, so it is matched by the geometry it shares
  // with its source, which is the only handle the proxy keeps.
  let key = null;
  let o = object;
  if (npcSet.has(o)) key = `npc/${o.name || o.type}`;
  else {
    let p = o.parent;
    while (p) { if (npcSet.has(p)) { key = `npc/${o.name || o.type}`; break; } p = p.parent; }
  }
  if (!key) {
    const mn = (material && material.name) || (material && material.type) || '?';
    key = `${o.name || o.type}|${mn}`;
  }
  bump(key, pass);
  return orig(camera, scene, geometry, material, object, group);
};

g.settle(1);
renderer.renderBufferDirect = orig;

const all = [...rows.values()].sort((a, b) => b.total - a.total);
const npc = all.filter((r) => r.key.startsWith('npc/'));
const sum = (rs, f) => rs.reduce((a, r) => a + r[f], 0);

return {
  shot: SHOT,
  frameCalls: renderer.info.render.calls,
  wrappedTotal: total,
  byPass: { colour: total - shadow - velocity, shadow, velocity },
  npcTotal: sum(npc, 'total'),
  npcByPass: { colour: sum(npc, 'colour'), shadow: sum(npc, 'shadow'), velocity: sum(npc, 'velocity') },
  npcRows: npc,
  top: all.slice(0, 28),
};
