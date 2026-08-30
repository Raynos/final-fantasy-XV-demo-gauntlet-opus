/* Frame lane 18's landmark sites off their own built geometry, not off the map pin. */
const g = window.GAME;
const log = [];
const terr = g.get('Terrain');
const player = g.get('Player');
const wm = (await import('/world/map/WorldMap.ts')).worldMap;
const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
g.get('Director').play();
g.get('Cinematics')?.stop?.({ skipped: true });
g.get('Menus').setScreen(null); step(10);
const specs = [];
const SITES = [
  ['threshold_stones', 8.2, 'clear'],
  ['peak_overlook', 17.6, 'clear'],
  ['northwatch_ruin', 13.2, 'storm'],
  ['mencemoor_obelisks', 21.5, 'clear'],
  ['washes_lookout', 16.4, 'clear'],
  ['saxham_ghost', 21.8, 'clear'],
  ['southwatch_haven', 21.0, 'clear'],
  ['saltgrass_flats', 18.4, 'clear'],
  ['pilgrims_rest', 15.0, 'clear'],
];
const V = g.camera.position.constructor;
for (const [id, time, weather] of SITES) {
  const poi = wm.poiById(id);
  if (!poi) { log.push(`${id}: NO SUCH POI`); continue; }
  const px = poi.x, pz = poi.z;
  player.root.position.set(px, terr.heightAt(px, pz), pz);
  g.camera.position.set(px + 40, terr.heightAt(px, pz) + 12, pz + 40);
  g.camera.lookAt(px, terr.heightAt(px, pz) + 4, pz);
  for (let i = 0; i < 150; i++) { player.root.position.set(px, terr.heightAt(px, pz), pz); step(1); }
  const gh = terr.heightAt(px, pz);
  // world-space extent of built props near the pin
  let minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9, maxy = -1e9, n = 0;
  const p = new V();
  g.scene.updateMatrixWorld(true);
  g.scene.traverse((o) => {
    if (!o.isMesh || !o.visible || o.isSkinnedMesh) return;
    const nm = `${o.name} ${(o.parent && o.parent.name) || ''}`;
    if (/terrain|clipmap|water|grass|veg|sky|cloud|shadow|decal|rain|fx|player|party|regalia|noctis|ignis|gladio|prompto/i.test(nm)) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    if (!bb) return;
    for (const c of [[bb.min.x, bb.min.y, bb.min.z], [bb.max.x, bb.max.y, bb.max.z]]) {
      p.set(c[0], c[1], c[2]).applyMatrix4(o.matrixWorld);
      if (Math.hypot(p.x - px, p.z - pz) > 130) continue;
      minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x);
      minz = Math.min(minz, p.z); maxz = Math.max(maxz, p.z);
      maxy = Math.max(maxy, p.y); n++;
    }
  });
  if (!n) { log.push(`${id}: pin (${px}, ${pz}) h=${gh.toFixed(1)} -- NO BUILT PROPS within 130 m`); continue; }
  const cx = (minx + maxx) / 2, cz = (minz + maxz) / 2;
  const w = Math.max(maxx - minx, maxz - minz);
  const top = maxy - gh;
  log.push(`${id}: pin (${px}, ${pz}) h=${gh.toFixed(1)} props ${n} centre (${cx.toFixed(0)}, ${cz.toFixed(0)}) span ${w.toFixed(0)} m top +${top.toFixed(0)} m`);
  const d = Math.max(w * 1.5, 34);
  for (const [i, brg] of [2.2, 4.0].entries()) {          // two bearings
    const ex = cx + Math.cos(brg) * d, ez = cz + Math.sin(brg) * d;
    const eh = terr.heightAt(ex, ez) + Math.max(2.4, top * 0.35);
    specs.push({
      name: `H_${id}_${i}`, doc: 'c', time, weather, fov: 44,
      pos: [+ex.toFixed(1), +eh.toFixed(1), +ez.toFixed(1)],
      target: [+cx.toFixed(1), +(gh + top * 0.55).toFixed(1), +cz.toFixed(1)],
    });
  }
}
return { log: log.join('\n'), specs };
