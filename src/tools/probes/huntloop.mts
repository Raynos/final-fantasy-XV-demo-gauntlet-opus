/* Does the loop close? kill the hunt through the real kill path -> get paid ->
 * rank up -> a locked bounty opens. And do havens now agree with the world? */
const g = window.GAME;
const out = [];
const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
const rpg = g.get('Rpg'), menus = g.get('Menus'), player = g.get('Player');
g.get('Story')?.applyShot?.(null);
g.get('Cinematics')?.stop?.({ skipped: true });
g.get('Director').play();
menus.setScreen(null); step(20);

/* ---- havens now agree with the map ---------------------------------- */
const hv = rpg.day.havens();
out.push(`${hv.length} havens; first=${hv[0].id} "${hv[0].name}" at (${Math.round(hv[0].pos[0])},${Math.round(hv[0].pos[2])}) discovered=${hv[0].discovered}`);
const near = rpg.day.nearestHaven({ x: player.position.x, z: player.position.z });
out.push(`nearest to the player (${Math.round(player.position.x)},${Math.round(player.position.z)}): ${near && near.id} at ${near ? Math.round(near.dist ?? -1) : '-'} m`);
const h0 = hv[0];
const camp = rpg.camp({ lodging: 'haven', pos: { x: h0.pos[0], z: h0.pos[2] } });
out.push(`camp standing on ${h0.id}: ${JSON.stringify(camp).slice(0, 180)}`);
const campFar = rpg.camp({ lodging: 'haven', pos: { x: h0.pos[0] + 400, z: h0.pos[2] } });
out.push(`camp 400 m away: ${JSON.stringify(campFar).slice(0, 100)}`);

/* ---- the hunt, through the path a real kill takes -------------------- */
const before = rpg.quests.view('hunt_sabertusks');
out.push(`hunt "${before.name}" ${before.status} ${JSON.stringify(before.objectives.map((o) => `${o.progress}/${o.count}`))}`);
const gil0 = rpg.inventory.gil, pts0 = rpg.quests.hunterPoints, bank0 = rpg.expBank.banked;
for (let i = 0; i < 12; i++) {
  rpg.enemyKilled({ id: 'sabertusk', level: 14, expClass: 'trash', drops: [{ id: 'sabertusk_fang', chance: 1, count: 1 }] }, {});
}
const after = rpg.quests.view('hunt_sabertusks');
out.push(`after 12 kills: ${after.status} ${JSON.stringify(after.objectives.map((o) => `${o.progress}/${o.count}`))}`);
out.push(`gil ${gil0}->${rpg.inventory.gil}  points ${pts0}->${rpg.quests.hunterPoints}  banked ${Math.round(bank0)}->${Math.round(rpg.expBank.banked)}  fangs=${rpg.inventory.count('sabertusk_fang')}`);

menus.setScreen('hunts'); step(16);
const s = menus.screens.hunts;
s.tab = 0; s.i = 0; step(4);
out.push('board: ' + (s._rows || []).map((r) => `${r.h.id}[${r.status}${r.locked ? ' LOCKED' : ''}]`).join(' , '));
menus.setScreen(null); step(4);
return out.join('\n');
