/* Find dry, flat ground near a POI for a den anchor. */
const g = window.GAME;
const terr = g.get('Terrain');
const wm = (await import('/world/map/WorldMap.ts')).worldMap;
const out = [];
for (const id of ['alstor_slough', 'coernix_alstor', 'three_valleys']) {
  const p = wm.poiById(id);
  out.push(`${id} (${p.x},${p.z}) h=${terr.heightAt(p.x, p.z).toFixed(1)}`);
  const rows = [];
  for (let dz = -300; dz <= 300; dz += 100) {
    const cells = [];
    for (let dx = -300; dx <= 300; dx += 100) {
      const h = terr.heightAt(p.x + dx, p.z + dz);
      cells.push(`${String(Math.round(h)).padStart(5)}`);
    }
    rows.push(`  dz=${String(dz).padStart(4)}  ${cells.join(' ')}`);
  }
  out.push('  dx =        -300  -200  -100     0   100   200   300');
  out.push(rows.join('\n'));
}
return out.join('\n');
