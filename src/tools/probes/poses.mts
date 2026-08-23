/* Does the station posture actually reach the bones, for Hammerhead and for the outposts? */
const g = window.GAME;
const out = [];
const npcs = g.get('Npcs');
const player = g.get('Player');
const terr = g.get('Terrain');
const wm = (await import('/world/map/WorldMap.ts')).worldMap;

const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
g.get('Director').play();
g.get('Cinematics')?.stop?.({ skipped: true });
g.get('Menus').setScreen(null); step(20);

const report = (npc) => {
  const b = npc.body.rig.byName;
  const f = (n) => {
    const o = b[n];
    return o ? `${o.rotation.x.toFixed(2)},${o.rotation.y.toFixed(2)},${o.rotation.z.toFixed(2)}` : '-';
  };
  out.push(`  ${npc.id.padEnd(12)} posture=${npc.postureName ?? 'none'} task=${npc.task ?? 'none'} speed=${npc.moveSpeed.toFixed(2)} lod=${npc.body.lod ?? '?'}`);
  out.push(`     upperArmL ${f('upperArmL')}   lowerArmL ${f('lowerArmL')}`);
  out.push(`     upperArmR ${f('upperArmR')}   lowerArmR ${f('lowerArmR')}`);
};

// Hammerhead first: stand in the middle of town so everyone is at LOD 0.
const town = g.get('Town');
const tx = town.origin.x, tz = town.origin.z, ty = terr.heightAt(tx, tz);
for (let i = 0; i < 60; i++) { player.root.position.set(tx, ty, tz); g.camera.position.set(tx, ty + 3, tz); step(1); }
out.push('-- Hammerhead, camera in the middle of town --');
for (const n of npcs.list) if (n.talkRadius) report(n);

// Then each outpost.
for (const r of npcs._pending.slice()) {
  const poi = wm.poiById(r.at);
  const x = poi.x + (r.dx || 0), z = poi.z + (r.dz || 0), y = terr.heightAt(x, z);
  for (let i = 0; i < 60; i++) {
    player.root.position.set(x + 3, y, z);
    g.camera.position.set(x + 3, y + 2, z);
    g.camera.lookAt(x, y + 1.2, z);
    step(1);
  }
}
out.push('');
out.push('-- the outposts, camera 3 m away --');
for (const n of npcs.list) if (n.talkRadius && !['cindy', 'cid', 'takka', 'dave'].includes(n.id)) report(n);

return out.join('\n');
