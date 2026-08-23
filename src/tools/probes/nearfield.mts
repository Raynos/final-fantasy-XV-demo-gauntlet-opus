// What is actually growing in the near field of a graded shot, and what does
// the ecology *think* should be growing there?
//
// The frame says Leide's foreground is bare dirt. Two very different things
// produce that: the ecology returning a density of zero, or the ecology asking
// for cover that no ring ever writes. This prints both sides -- the sampled
// density functions along the camera's own view ray, and the instance census by
// distance band -- so the next step is chosen from a measurement.
const g = window.GAME;
const SHOT = window.__SHOT || 'zone_longwythe';
g.applyShot(SHOT);
g.settle(60);
g.applyShot(SHOT);
g.settle(8);

const V3 = g.camera.position.constructor;
const cam = g.camera;
const out = { shot: SHOT, cam: [+cam.position.x.toFixed(1), +cam.position.y.toFixed(1), +cam.position.z.toFixed(1)] };

const veg = g.get('Vegetation');
const eco = veg && veg.ecology;
const terrain = g.get('Terrain');

// March the real centre ray onto the heightfield, then sample the ecology at
// the points the camera can actually see.
const dir = new V3(0, 0, -1).applyQuaternion(cam.quaternion).normalize();
const p = new V3();
const hits = [];
for (const target of [0.985, 0.95, 0.90, 0.82, 0.7, 0.55, 0.4]) {
  // walk down the frame: a ray through screen y = -target (near the bottom)
  const d = new V3(0, -target, -1).applyQuaternion(cam.quaternion).normalize();
  p.copy(cam.position);
  let t = 0, hit = null;
  for (let i = 0; i < 900; i++) {
    t += 1.0;
    p.copy(cam.position).addScaledVector(d, t);
    const h = terrain.heightAt(p.x, p.z);
    if (p.y <= h) { hit = { x: p.x, z: p.z, d: t }; break; }
  }
  if (!hit) continue;
  const row = { screenY: target, dist: +hit.d.toFixed(0) };
  if (eco) {
    const b = eco.veg(hit.x, hit.z);
    row.biome = b.id;
    if (eco.grassDensity) row.grassD = +eco.grassDensity(hit.x, hit.z).toFixed(3);
    if (eco.scrubDensity) row.scrubD = +eco.scrubDensity(hit.x, hit.z).toFixed(3);
    if (eco.treeDensity) row.treeD = +eco.treeDensity(hit.x, hit.z).toFixed(3);
    row.biomeGrassD = b.grassD; row.biomeScrubD = b.scrubD; row.biomeTreeD = b.treeD;
  }
  hits.push(row);
}
out.viewRay = hits;

// Instance census by distance band, for everything that grows.
const bands = [0, 60, 120, 200, 340, 600, 1e9];
const census = {};
g.scene.traverse((o) => {
  if (!(o.isMesh || o.isInstancedMesh) || !o.visible) return;
  if (o.isInstancedMesh && !o.count) return;
  let par = o.parent, vis = true;
  while (par) { if (!par.visible) { vis = false; break; } par = par.parent; }
  if (!vis) return;
  const n = o.name || o.type;
  if (!/tree|leaf|impostor|canopy|grass|scrub|bush|fern|reed|rock|sage|thorn|shrub/i.test(n)) return;
  const key = n.replace(/_?\d+/g, '#');
  const e = census[key] || (census[key] = { total: 0, byBand: new Array(bands.length - 1).fill(0) });
  const cnt = o.isInstancedMesh ? o.count : 1;
  e.total += cnt;
  if (o.isInstancedMesh) {
    const m = o.instanceMatrix.array;
    for (let i = 0; i < o.count; i++) {
      const dx = m[i * 16 + 12] - cam.position.x, dz = m[i * 16 + 14] - cam.position.z;
      const d = Math.hypot(dx, dz);
      for (let k = 0; k < bands.length - 1; k++) {
        if (d >= bands[k] && d < bands[k + 1]) { e.byBand[k]++; break; }
      }
    }
  }
});
out.bands = bands.slice(0, -1).map((b, i) => `${b}-${bands[i + 1] > 1e8 ? '+' : bands[i + 1]}m`);
out.census = Object.fromEntries(
  Object.entries(census).sort((a, b) => b[1].total - a[1].total).slice(0, 24)
    .map(([k, v]) => [k, v.byBand.join(' / ')]));
// GrassField's own view of itself: rings, budgets and what it wrote this frame
const grass = veg && veg.grass;
if (grass) {
  out.grass = {
    stats: typeof grass.stats === 'function' ? grass.stats() : grass.stats,
    groupVisible: grass.group ? grass.group.visible : null,
    children: grass.group ? grass.group.children.map((c) => ({
      name: c.name, visible: c.visible,
      kids: c.children ? c.children.length : 0,
      inst: c.children ? c.children.reduce((s2, k) => s2 + (k.count || 0), 0) : 0,
    })) : null,
  };
}
return out;
