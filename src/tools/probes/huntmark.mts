/* Does killing a hunt's own mark credit that hunt, whatever it is called? */
const g = window.GAME;
const out = [];
const rpg = g.get('Rpg');
const q = rpg.quests;
const S = await import('/game/encounters/SpawnTables.ts');

const show = (id) => {
  const v = q.view(id);
  return v ? `${id} [${v.status}] ` + v.objectives.map((o) => `${o.type}/${o.target}=${o.progress}/${o.count}${o.done ? '*' : ''}`).join(' ') : `${id}: none`;
};

// Force every hunt available and take it, so all twelve can be tested.
for (const id of Object.keys(S.HUNT_TARGETS)) {
  const st = q.states[id];
  if (st.status === 'complete' || st.status === 'active') continue;
  st.status = 'available';
  q.accept(id);
}

out.push('--- a mark dies; does its own hunt notice? ---');
for (const [qid, t] of Object.entries(S.HUNT_TARGETS)) {
  const st = q.states[qid];
  if (st.status !== 'active') { out.push(`  SKIP ${qid} (${st.status})`); continue; }
  const before = show(qid);
  // exactly the call `EncounterDirector._onDeath` makes for a hunt's mark
  rpg.enemyKilled({ id: t.key, level: t.level, expClass: t.boss ? 'boss' : undefined, drops: [] },
    { byWarpStrike: false, hunt: qid });
  const after = show(qid);
  const moved = before !== after;
  out.push(`  ${moved ? 'CREDITED' : 'LOST    '} ${qid}  spawns "${t.key}"`);
  if (!moved) out.push(`      ${before}`);
}

out.push('');
out.push('--- and it is credited exactly once (no double pay) ---');
// hunt_sabertusks: species and objective agree, so both paths could fire
const sab = 'hunt_sabertusks';
if (q.states[sab].status === 'active') {
  const p0 = q.view(sab).objectives[0].progress;
  rpg.enemyKilled({ id: 'sabertusk', level: 6, drops: [] }, { hunt: sab });
  const p1 = q.view(sab).objectives[0].progress;
  out.push(`  ${sab}: ${p0} -> ${p1} for one kill (want +1)`);
}
// a kill with no hunt still credits by species
const p2 = q.view(sab) ? q.view(sab).objectives[0].progress : -1;
rpg.enemyKilled({ id: 'sabertusk', level: 6, drops: [] }, {});
out.push(`  loose sabertusk, no hunt tag: ${p2} -> ${q.view(sab).objectives[0].progress}`);

return out.join('\n');
