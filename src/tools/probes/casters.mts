// What is actually in the shadow pass for this frame, and how far away is it?
// A cascade can only shadow what was drawn into its depth map, and three draws
// an object into it only when `castShadow` is true, the object is visible, and
// its bounds survive the shadow frustum cull.
const g = window.GAME;
const SHOT = 'zone_fallgrove';
g.applyShot(SHOT);
g.settle(60);
g.applyShot(SHOT);
g.settle(8);

const cam = g.camera;
const out = { shot: SHOT, cam: [+cam.position.x.toFixed(1), +cam.position.y.toFixed(1), +cam.position.z.toFixed(1)] };

const groups = {};
g.scene.traverse((o) => {
  if (!o.isMesh && !o.isInstancedMesh) return;
  if (!o.visible) return;
  let p = o.parent, vis = true;
  while (p) { if (!p.visible) { vis = false; break; } p = p.parent; }
  if (!vis) return;
  const n = o.name || o.type;
  const key = n.replace(/_\d+(_wood|_leaf|_impostor)?$/, '$1').replace(/-\d\d$/, '');
  const cnt = o.isInstancedMesh ? o.count : 1;
  if (!cnt) return;
  const e = groups[key] || (groups[key] = { nodes: 0, instances: 0, cast: 0, castInstances: 0 });
  e.nodes++; e.instances += cnt;
  if (o.castShadow) { e.cast++; e.castInstances += cnt; }
});
out.groups = Object.fromEntries(
  Object.entries(groups).filter(([, v]) => v.instances > 0)
    .sort((a, b) => b[1].instances - a[1].instances).slice(0, 40)
);

// Tree system's own LOD census, if it publishes one
const trees = g.get('Trees');
if (trees && trees.stats) out.treeStats = trees.stats();

// distance to each visible tree-bearing instanced mesh's bounding sphere centre
const near = [];
g.scene.traverse((o) => {
  if (!o.isInstancedMesh || !o.visible || !o.castShadow) return;
  if (!/tree|bush|rock/i.test(o.name || '')) return;
  const bs = o.boundingSphere;
  if (!bs) return;
  near.push({ name: o.name, count: o.count, d: +cam.position.distanceTo(bs.center).toFixed(1), r: +bs.radius.toFixed(1) });
});
out.castingInstanced = near.sort((a, b) => a.d - b.d).slice(0, 25);
return out;
