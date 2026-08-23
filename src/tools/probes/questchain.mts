/* Can a player follow the quest chain from the boot state? */
const g = window.GAME;
const out = [];
const rpg = g.get('Rpg');
const q = rpg.quests;
const QUESTS = (await import('/game/rpg/Quests.ts')).QUESTS;

const show = (id) => {
  const v = q.view(id);
  if (!v) return `${id}: NO VIEW`;
  return `${id} [${v.status}] ` + v.objectives.map((o, i) => `${i}:${o.type}/${o.target}=${o.progress}/${o.count}${o.done ? '*' : ''}`).join(' ');
};

out.push('--- boot state ---');
out.push(`chapter ${rpg.chapter}  level ${rpg.noctis.level}  gil ${rpg.inventory.gil}  hunterPoints ${q.hunterPoints}`);
out.push(`tracked: ${q.tracked}`);
for (const v of q.active) out.push('ACTIVE  ' + show(v.id));
out.push(`available: ${q.available.map((v) => v.id).join(', ') || '(none)'}`);
out.push(`complete: ${Object.keys(q.states).filter((k) => q.states[k].status === 'complete').join(', ')}`);

out.push('');
out.push('--- objective kinds in the whole table ---');
const kinds = {};
for (const id of Object.keys(q.states)) {
  for (const o of QUESTS[id].objectives) kinds[o.type] = (kinds[o.type] || 0) + 1;
}
out.push(Object.entries(kinds).map(([k, n]) => `${k}:${n}`).join('  '));

out.push('');
out.push('--- probe 1: fetch by actually acquiring the item ---');
out.push(`before: ${show('side_engine_blade')}`);
rpg.inventory.add('rusted_bit', 5, 'probe');
out.push(`after +5 rusted_bit: ${show('side_engine_blade')}`);

out.push('');
out.push('--- probe 2: gil objective on main_ch1_pauper ---');
out.push(`before: ${show('main_ch1_pauper')}`);
rpg.inventory.addGil(5000, 'probe');
out.push(`after +5000 gil: ${show('main_ch1_pauper')}`);

out.push('');
out.push('--- probe 3: talk to Takka for real ---');
const ix = g.get('Interaction');
const takka = [...ix.items.values()].find((i) => i.id === 'npc_takka' || (i.label || '').includes('Takka'));
out.push(`takka interactable: ${takka ? takka.id + ' "' + takka.label + '"' : 'NOT FOUND'}`);
if (takka) { takka.handler(); g.frame(1 / 60); }
out.push(`after talk: ${show('main_ch1_pauper')}`);

out.push('');
out.push('--- probe 4: can objective 2 (complete hunt_killer_wasps) ever fire? ---');
out.push(`hunt_killer_wasps status: ${q.states.hunt_killer_wasps.status}`);
out.push(`re-complete returns: ${q.complete('hunt_killer_wasps')}`);
out.push(`after: ${show('main_ch1_pauper')}`);

out.push('');
out.push('--- probe 5: kill objectives on the live hunts ---');
out.push(show('hunt_sabertusks'));
rpg.enemyKilled({ id: 'sabertusk', name: 'Sabertusk', level: 8 });
out.push('after 1 sabertusk kill: ' + show('hunt_sabertusks'));

out.push('');
out.push('--- probe 6: waypoints ---');
for (const w of q.waypoints()) out.push(`  ${w.questId} "${w.objective}" -> (${Math.round(w.pos[0])},${Math.round(w.pos[2])}) r=${w.radius}${w.tracked ? '  TRACKED' : ''}`);

out.push('');
out.push('--- probe 7: is the player anywhere near the tracked waypoint? ---');
const p = g.get('Player').position;
out.push(`player at (${Math.round(p.x)},${Math.round(p.z)})`);
for (const w of q.waypoints()) out.push(`  ${w.questId}: ${Math.round(Math.hypot(p.x - w.pos[0], p.z - w.pos[2]))} m away`);

return out.join('\n');
