/* Where do the named dens sit now, relative to the places they are named after? */
const g = window.GAME;
const out = [];
const S = await import('/game/encounters/SpawnTables.ts');
const wm = (await import('/world/map/WorldMap.ts')).worldMap;
const terr = g.get('Terrain');
const Q = await import('/game/rpg/Quests.ts');
const WORLD_R = 4000;

const spawn = g.get('Player').position;
out.push(`player spawn (${Math.round(spawn.x)}, ${Math.round(spawn.z)})`);
out.push('');
out.push('id                     name                          anchor            |from spawn|  nearest POI');
for (const t of S.TERRITORIES) {
  let best = null, bd = 1e9;
  for (const p of wm.pois) {
    const d = Math.hypot(p.x - t.at[0], p.z - t.at[1]);
    if (d < bd) { bd = d; best = p; }
  }
  const off = Math.max(Math.abs(t.at[0]), Math.abs(t.at[1])) > WORLD_R ? '  OUTSIDE THE FIELD' : '';
  const h = terr.heightAt(t.at[0], t.at[1]);
  out.push(`${t.id.padEnd(22)} ${t.name.padEnd(29)} (${String(Math.round(t.at[0])).padStart(5)},${String(Math.round(t.at[1])).padStart(5)})  ${String(Math.round(Math.hypot(t.at[0] - spawn.x, t.at[1] - spawn.z))).padStart(5)} m   ${best.name} ${bd.toFixed(0)} m  h=${h.toFixed(1)}${off}`);
}

out.push('');
out.push('--- every hunt: is its species actually resident where the marker points? ---');
for (const [qid, ht] of Object.entries(S.HUNT_TARGETS)) {
  const q = Q.QUESTS[qid];
  const o = (q?.objectives || []).find((v) => v.type === 'kill');
  if (!o?.waypoint) { out.push(`  ${qid}: no kill waypoint`); continue; }
  const [wx, , wz] = o.waypoint;
  const homes = S.TERRITORIES.filter((t) => t.spawn.some((l) => l.key === ht.key));
  const d = homes.length ? Math.min(...homes.map((t) => Math.hypot(t.at[0] - wx, t.at[1] - wz))) : Infinity;
  out.push(`  ${qid.padEnd(20)} "${ht.key}" waypoint (${Math.round(wx)},${Math.round(wz)}) -> nearest resident den ${homes.length ? Math.round(d) + ' m' : 'none in the table'}`);
}

out.push('');
out.push('--- every quest waypoint: is it dry, and is it flat enough to fight on? ---');
const sea = -6.5;
for (const id of Object.keys(Q.QUESTS)) {
  for (const o of Q.QUESTS[id].objectives) {
    if (!o.waypoint) continue;
    const [x, , z] = o.waypoint;
    const h = terr.heightAt(x, z);
    const dx = terr.heightAt(x + 12, z) - terr.heightAt(x - 12, z);
    const dz = terr.heightAt(x, z + 12) - terr.heightAt(x, z - 12);
    const grad = Math.hypot(dx, dz) / 24;
    const bad = [];
    if (h < sea + 1) bad.push('UNDER WATER');
    if (grad > 0.42) bad.push('TOO STEEP');
    if (Math.abs(x) > WORLD_R || Math.abs(z) > WORLD_R) bad.push('OUTSIDE THE FIELD');
    if (bad.length) out.push(`  ${id.padEnd(22)} ${o.type}/${o.id.padEnd(10)} (${Math.round(x)},${Math.round(z)}) h=${h.toFixed(1)} grad=${grad.toFixed(2)}  ${bad.join(' + ')}`);
  }
}

return out.join('\n');
