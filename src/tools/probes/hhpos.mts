/* Where is Hammerhead, actually? Town vs POI vs road. */
const g = window.GAME;
const out = [];
const wm = (await import('/world/map/WorldMap.ts')).worldMap;
const terr = g.get('Terrain');
const town = g.get('Town');
const poi = wm.poiById('hammerhead');
out.push(`POI hammerhead -> (${poi.x}, ${poi.z})  r=${poi.r}`);
const layby = wm.poiById('hammerhead_layby');
out.push(`POI hammerhead_layby -> (${layby.x}, ${layby.z})`);
out.push(`town.site -> ${town && town.site ? `(${Math.round(town.site.x)}, ${Math.round(town.site.z)}) r=${town.site.r}` : 'none'}`);
out.push(`town.root pos -> ${town && town.root ? `(${Math.round(town.root.position.x)}, ${Math.round(town.root.position.z)})` : 'none'}`);
// terrain's own road
if (typeof terr.roadCenterX === 'function') {
  out.push('terrain.roadCenterX: ' + [-100, 0, 44, 100, 200].map((z) => `z=${z}->x=${terr.roadCenterX(z).toFixed(1)}`).join('  '));
}
// nearest RoadGraph point to each
const near = (x, z) => {
  let best = 1e9, bid = '';
  for (const r of wm.roads || []) {
    const pts = r.points || r.pts || [];
    for (const p of pts) {
      const d = Math.hypot((p.x ?? p[0]) - x, (p.z ?? p[1]) - z);
      if (d < best) { best = d; bid = r.id; }
    }
  }
  return `${best.toFixed(1)} m from road ${bid}`;
};
out.push(`roads available: ${(wm.roads || []).length}`);
out.push(`town -> ${near(576, 10)}`);
out.push(`poi  -> ${near(poi.x, poi.z)}`);
// terrain shape
const slope = (x, z) => {
  const h0 = terr.heightAt(x, z);
  const dx = terr.heightAt(x + 8, z) - terr.heightAt(x - 8, z);
  const dz = terr.heightAt(x, z + 8) - terr.heightAt(x, z - 8);
  return `h=${h0.toFixed(2)} grad=${(Math.hypot(dx, dz) / 16).toFixed(3)}`;
};
out.push(`terrain at town (576,10): ${slope(576, 10)}`);
out.push(`terrain at poi (${poi.x},${poi.z}): ${slope(poi.x, poi.z)}`);
// what is at the POI position visually? interactables near each
const ix = g.get('Interaction');
const list = [...ix.items.values()];
const dTown = list.map((i) => Math.hypot(i.pos.x - 576, i.pos.z - 10)).sort((a, b) => a - b)[0];
const dPoi = list.map((i) => Math.hypot(i.pos.x - poi.x, i.pos.z - poi.z)).sort((a, b) => a - b)[0];
out.push(`nearest interactable to town: ${dTown.toFixed(1)} m; to poi: ${dPoi.toFixed(1)} m`);
return out.join('\n');
