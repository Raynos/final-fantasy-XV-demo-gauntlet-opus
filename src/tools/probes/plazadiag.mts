/* Measure the plaza the way the CORPUS approaches it: camera only, no player.
 *
 * `cityfeet.mts` teleports the player onto the pin and waits 200 frames, and by
 * that route every body stands on the deck to the millimetre and the feet
 * photograph correctly (`tmp/shots/l19-tele`). `framecam` and `shoot` never
 * move the player -- they apply a framing and let the site stream in under the
 * camera -- and by THAT route the corpus comes back with every body cut at the
 * shin. So this is the same measurement taken down the other approach, in the
 * same page as the photograph that shows the defect.
 */
const g = window.GAME;
const out = [];
const { SHOTS } = await import('/game/Shots.ts');
const terr = g.get('Terrain');
const npcs = g.get('Npcs');
const props = g.get('Props');
const kits = props && props.poiKits;
const wm = (await import('/world/map/WorldMap.ts')).worldMap;
const V3 = g.camera.position.constructor;
const _p = new V3();

/** The surface a person at (x, z) stands on, by the triangle containing it. */
const surfaceUnder = (x, z, yTop) => {
  let best = -1e9, who = '';
  const a = new V3(), b = new V3(), c = new V3();
  g.scene.updateMatrixWorld(true);
  g.scene.traverse((o) => {
    if (!o.visible || !o.isMesh || !o.geometry || o.isSkinnedMesh || o.isInstancedMesh) return;
    const n = `${o.name} ${(o.parent && o.parent.name) || ''}`;
    if (/water|grass|veg|sky|cloud|npc|player|party|rain|fx|noctis|ignis|gladio|prompto|regalia|umbra/i.test(n)) return;
    const pa = o.geometry.getAttribute('position');
    if (!pa) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    const bs = o.geometry.boundingSphere;
    if (bs) {
      _p.copy(bs.center).applyMatrix4(o.matrixWorld);
      if (Math.hypot(_p.x - x, _p.z - z) > bs.radius * Math.max(o.scale.x, o.scale.z) + 2) return;
    }
    const idx = o.geometry.getIndex();
    const tri = idx ? idx.count / 3 : pa.count / 3;
    for (let t = 0; t < tri; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3;
      const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      a.set(pa.getX(i0), pa.getY(i0), pa.getZ(i0)).applyMatrix4(o.matrixWorld);
      b.set(pa.getX(i1), pa.getY(i1), pa.getZ(i1)).applyMatrix4(o.matrixWorld);
      c.set(pa.getX(i2), pa.getY(i2), pa.getZ(i2)).applyMatrix4(o.matrixWorld);
      const lo = Math.min(a.y, b.y, c.y), hi = Math.max(a.y, b.y, c.y);
      if (lo > yTop + 0.25 || hi < yTop - 3) continue;
      if (x < Math.min(a.x, b.x, c.x) || x > Math.max(a.x, b.x, c.x)) continue;
      if (z < Math.min(a.z, b.z, c.z) || z > Math.max(a.z, b.z, c.z)) continue;
      const d = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(d) < 1e-9) continue;
      const u = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / d;
      const v = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / d;
      const w = 1 - u - v;
      if (u < -1e-4 || v < -1e-4 || w < -1e-4) continue;
      const y = u * a.y + v * b.y + w * c.y;
      if (y > yTop + 0.25) continue;
      if (y > best) { best = y; who = n.trim(); }
    }
  });
  return { y: best, who };
};

const poi = wm.poiById('lestallum');
out.push(`terrain.heightAt(pin) BEFORE any approach: ${terr.heightAt(poi.x, poi.z).toFixed(3)}`);

SHOTS.__probe = {
  name: '__probe',
  pos: [-2956.8, 123.615, -696.8],
  target: [-2961.5, 121.215, -701.5],
  fov: 55,
  time: 10.5,
};
g.applyShot('__probe');
g.settle(140);
g.applyShot('__probe');
g.settle(40);
await window.__shot('frame');

out.push(`terrain.heightAt(pin) AFTER the shot:     ${terr.heightAt(poi.x, poi.z).toFixed(3)}`);
const site = kits && kits.built.find((s) => s.poi.id === 'lestallum');
out.push(`site group.position.y ${site ? site.group.position.y.toFixed(3) : 'NOT BUILT'}`);
const plaza = kits && kits.anchorAt('lestallum', 'plaza');
out.push(`plaza anchor y ${plaza ? plaza.y.toFixed(3) : 'NULL'}`);
const pad = plaza && npcs._pads.find((q) => Math.abs(q.x - plaza.x) < 0.01 && Math.abs(q.z - plaza.z) < 0.01);
out.push(`pad ${pad ? `y ${pad.y.toFixed(3)} r ${pad.r}` : 'NOT REGISTERED'}`);
const deck = plaza && surfaceUnder(plaza.x + 3, plaza.z + 3, plaza.y + 1.5);
out.push(`deck 3 m off centre: ${deck ? `${deck.y.toFixed(3)} (${deck.who})` : '--'}`);

const near = npcs.list.filter((n) => plaza && Math.hypot(n.pos.x - plaza.x, n.pos.z - plaza.z) < 14);
out.push(`${near.length} bodies on the square`);
for (const n of near) {
  const d = surfaceUnder(n.pos.x, n.pos.z, n.pos.y + 1.5);
  out.push(`  ${n.id.padEnd(12)} lod ${n.body._lod} pos.y ${n.pos.y.toFixed(3)} groundY ${n.groundY.toFixed(3)} `
    + `_groundAt ${npcs._groundAt(n.pos.x, n.pos.z).toFixed(3)} deck ${d.y > -1e8 ? d.y.toFixed(3) : ' none '} `
    + `sink ${d.y > -1e8 ? (d.y - n.pos.y).toFixed(3) : '--'} (${d.who})`);
}
// Same camera, same page, same approach -- a 12 degree lens on the feet of
// each of the three nearest bodies. This is the image the corpus defect has to
// survive: if the boots are on the flags here, the corpus frames that show
// them cut were taken of a different tree.
const rank = near.map((n) => ({ n, d: Math.hypot(n.pos.x + 2956.8, n.pos.z + 696.8) }))
  .sort((a, b) => a.d - b.d).slice(0, 3);
for (const { n, d } of rank) {
  SHOTS.__probe = {
    name: '__probe',
    pos: [-2956.8, 123.615, -696.8],
    target: [n.pos.x, n.pos.y + 0.35, n.pos.z],
    fov: 12,
    time: 10.5,
  };
  g.applyShot('__probe');
  g.settle(60);
  out.push(`tele ${n.id} at ${d.toFixed(1)} m, lod ${n.body._lod}`);
  await window.__shot(`tele-${n.id}`);
}

return out.join('\n');
