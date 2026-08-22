/* Do the quest markers, haven pins and deposits now land in the world? */
const g = window.GAME;
const out = [];
const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
const rpg = g.get('Rpg'), player = g.get('Player');
g.get('Story')?.applyShot?.(null);
g.get('Cinematics')?.stop?.({ skipped: true });
g.get('Director').play();
g.get('Menus').setScreen(null); step(20);

const mod = await import('/ui/GameData.ts');
const q = mod.readQuest(g);
out.push(`tracked: "${q.title}" — ${q.step} · ${q.dist} m · waypoint ${JSON.stringify(q.waypoint)}`);

const wps = rpg.quests.waypoints();
out.push(`${wps.length} active waypoints:`);
for (const w of wps) out.push(`  ${w.questId} "${w.objective}" -> (${Math.round(w.pos[0])},${Math.round(w.pos[2])})`);

const markers = mod.readMarkers(g);
const WORLD = 4096;
const outside = markers.filter((m) => Math.abs(m.x) > WORLD || Math.abs(m.z) > WORLD);
out.push(`${markers.length} map markers, ${outside.length} outside the 8 km field`);
const kinds = {};
for (const m of markers) kinds[m.kind] = (kinds[m.kind] || 0) + 1;
out.push(`by kind: ${JSON.stringify(kinds)}`);

// deposits: are they where the map says, and does a draw work standing on one?
const dep = rpg.tables.deposits[0];
out.push(`deposit[0] ${dep.name} at (${Math.round(dep.pos[0])},${Math.round(dep.pos[2])})`);
const before = rpg.elemancy.energy[dep.element];
const drew = rpg.drawNearby({ x: dep.pos[0], z: dep.pos[2] }, 12);
out.push(`draw standing on it: ${drew.ok ? 'ok' : drew.reason} ${dep.element} ${before} -> ${rpg.elemancy.energy[dep.element]}`);

// and a reach objective: teleport to the tracked waypoint and see it tick
if (q.waypoint) {
  const y = g.get('Terrain').heightAt(q.waypoint[0], q.waypoint[2]);
  player.root.position.set(q.waypoint[0], y, q.waypoint[2]);
  step(10);
  out.push(`standing on the tracked waypoint: dist now ${mod.readQuest(g).dist} m, step "${mod.readQuest(g).step}"`);
}
return out.join('\n');
