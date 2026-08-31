/* How far can you see out of a city square, and can Galdin see the sea?
 *
 * Lane 21 reports nine of twenty-six candidate framings at the two squares
 * coming back as walls, and no sea on any of sixteen bearings at Galdin Quay.
 * Both are questions about the town kit's block plan rather than about a
 * camera, so this measures them from the middle of the square outward.
 *
 * **It cannot ask `CollisionWorld`, and finding that out is half of what this
 * probe found.** The city POI compounds are not in the collision world at all:
 * `groundDisc` at every one of the twenty-nine city bodies returns `onProp
 * false` and a height 0.7-1.1 m BELOW the pavement they are standing on. So
 * this walks the scene geometry, exactly as `cityanchors.mts` does, and asks
 * whether there is a surface between knee and head height.
 */
const g = window.GAME;
const out = [];
const terr = g.get('Terrain');
const player = g.get('Player');
const props = g.get('Props');
const water = g.get('Water');
const kits = props && props.poiKits;
const wm = (await import('/world/map/WorldMap.ts')).worldMap;
const V3 = g.camera.position.constructor;
const _p = new V3();
const _m = g.camera.matrixWorld.clone();

const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
g.get('Director').play();
g.get('Cinematics')?.stop?.({ skipped: true });
g.get('Menus').setScreen(null); step(10);

/** Every solid vertex near (cx, cz), flattened. Persons and scatter excluded. */
const cloud = (cx, cz, range) => {
  const pts = [];
  g.scene.updateMatrixWorld(true);
  g.scene.traverse((o) => {
    if (!o.visible || !o.isMesh || !o.geometry || o.isSkinnedMesh) return;
    const n = `${o.name} ${(o.parent && o.parent.name) || ''}`;
    if (/terrain|clipmap|water|grass|veg|sky|cloud|shadow|decal|npc|player|party|rain|fx|apron|pad|noctis|ignis|gladio|prompto|regalia|umbra/i.test(n)) return;
    const pa = o.geometry.getAttribute('position');
    if (!pa) return;
    if (o.isInstancedMesh) {
      const bb = o.geometry.boundingBox || (o.geometry.computeBoundingBox(), o.geometry.boundingBox);
      const hi = bb ? bb.max.y : 0.4;
      for (let m = 0; m < o.count; m++) {
        o.getMatrixAt(m, _m);
        _p.set(_m.elements[12], _m.elements[13], _m.elements[14]).applyMatrix4(o.matrixWorld);
        if (Math.abs(_p.x - cx) > range || Math.abs(_p.z - cz) > range) continue;
        pts.push(_p.x, _p.y, _p.z, _p.x, _p.y + hi, _p.z);
      }
      return;
    }
    for (let i = 0; i < pa.count; i++) {
      _p.set(pa.getX(i), pa.getY(i), pa.getZ(i)).applyMatrix4(o.matrixWorld);
      if (Math.abs(_p.x - cx) > range || Math.abs(_p.z - cz) > range) continue;
      pts.push(_p.x, _p.y, _p.z);
    }
  });
  return pts;
};

/** Surfaces between knee and head at (x, z), standing on `y`. */
const solidAt = (pts, x, y, z, r) => {
  let hits = 0;
  for (let i = 0; i < pts.length; i += 3) {
    const dy = pts[i + 1] - y;
    if (dy < 0.35 || dy > 1.85) continue;
    if (Math.hypot(pts[i] - x, pts[i + 2] - z) > r) continue;
    hits++;
  }
  return hits;
};

for (const id of ['lestallum', 'galdin_quay']) {
  const poi = wm.poiById(id);
  const px = poi.x, pz = poi.z, py = terr.heightAt(px, pz);
  player.root.position.set(px, py, pz);
  g.camera.position.set(px, py + 4, pz + 8);
  g.camera.lookAt(px, py + 1, pz);
  for (let i = 0; i < 200; i++) { player.root.position.set(px, py, pz); step(1); }
  player.root.position.set(px + 300, terr.heightAt(px + 300, pz), pz);
  step(4);

  const plaza = kits && kits.anchorAt(id, 'plaza');
  out.push('');
  out.push(`== ${poi.name} ==`);
  if (!plaza) { out.push('  no plaza anchor'); continue; }
  const pts = cloud(plaza.x, plaza.z, 60);
  out.push(`  ${pts.length / 3} surface points within 60 m`);

  const reach = [];
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    let d = 1;
    for (; d < 55; d += 0.5) {
      const x = plaza.x + Math.cos(a) * d, z = plaza.z + Math.sin(a) * d;
      if (solidAt(pts, x, plaza.y, z, 0.6) > 0) break;
    }
    reach.push({ deg: Math.round((a * 180) / Math.PI), d, a });
  }
  const sorted = reach.slice().sort((p, q) => p.d - q.d);
  out.push(`  camera reach on 16 bearings: min ${sorted[0].d.toFixed(1)}  median ${sorted[8].d.toFixed(1)}  max ${sorted[15].d.toFixed(1)} m`);
  out.push(`  ${sorted.filter((r) => r.d < 14).length}/16 block inside 14 m, ${sorted.filter((r) => r.d < 20).length}/16 inside 20 m`);
  out.push('  ' + reach.map((r) => `${r.deg}deg:${r.d.toFixed(0)}m`).join('  '));

  if (water && water.bodies && water.bodies.length) {
    let best = null, bd = 1e9;
    for (const b of water.bodies) {
      const d = Math.hypot(b.cx - plaza.x, b.cz - plaza.z);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) {
      const a = Math.atan2(best.cz - plaza.z, best.cx - plaza.x);
      const deg = Math.round((a * 180) / Math.PI);
      // Nearest bearing sample to the water, and how far the eye gets that way.
      let near = reach[0];
      for (const r of reach) {
        const da = Math.abs(((r.a - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        const db = Math.abs(((near.a - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (da < db) near = r;
      }
      out.push(`  nearest water body: ${bd.toFixed(0)} m at ${deg} deg, level ${best.level.toFixed(1)}, `
        + `size ${best.w.toFixed(0)}x${best.d.toFixed(0)}; plaza deck ${plaza.y.toFixed(1)}`);
      out.push(`  the bearing toward it (${near.deg} deg) is clear for ${near.d.toFixed(1)} m`);
    }
  }
}
return out.join('\n');
