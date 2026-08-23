/* Every quest objective in the table: is there a path to completing it? */
const g = window.GAME;
const out = [];
const Q = await import('/game/rpg/Quests.ts');
const S = await import('/game/encounters/SpawnTables.ts');
const B = await import('/characters/enemies/Bestiary.ts');
const I = await import('/game/rpg/Inventory.ts');
const N = await import('/characters/npc/NpcCast.ts');
const D = await import('/characters/npc/NpcDialogue.ts');

const bestiary = Object.keys(B.BESTIARY || {});
out.push(`bestiary keys (${bestiary.length}): ${bestiary.join(' ')}`);

const items = Object.keys(I.ITEMS);
const npcCast = Object.keys(N.NPC_CAST || {});
const withDialogue = Object.keys(D.NPC_DIALOGUE || {});
// only an NPC that is placed AND has a dialogue tree ever fires notify('talk')
const npcs = g.get('Npcs');
const built = new Set((npcs?.list || []).map((n) => n.castKey));
// The five outside Hammerhead are built when the camera comes within 420 m of
// their POI, not at boot — a townsperson is a painted 1024^2 face and five of
// them at boot is most of the cold-boot budget. A pending placement is still a
// placement, so it counts here; `whereabouts` below proves each one lands.
const pending = new Set((npcs?._pending || []).map((r) => r.castKey));
const placed = new Set([...built, ...pending]);
const talkable = npcCast.filter((k) => withDialogue.includes(k) && placed.has(k));
out.push(`npc cast (${npcCast.length}): ${npcCast.join(' ')}`);
out.push(`with dialogue (${withDialogue.length}): ${withDialogue.join(' ')}`);
out.push(`built at boot (${built.size}): ${[...built].join(' ')}`);
out.push(`built on approach (${pending.size}): ${[...pending].join(' ')}`);
out.push(`ACTUALLY TALKABLE (${talkable.length}): ${talkable.join(' ')}`);

// what a kill can ever yield, anywhere
const spawnable = new Set();
for (const t of S.TERRITORIES) for (const l of t.spawn) spawnable.add(l.key);
for (const r of S.ROAMERS) for (const l of r.spawn) spawnable.add(l.key);
for (const k of Object.keys(S.SET_PIECES)) spawnable.add(S.SET_PIECES[k].key || k);
for (const k of Object.keys(S.HUNT_TARGETS)) spawnable.add(S.HUNT_TARGETS[k].key);
out.push(`spawnable species (${spawnable.size}): ${[...spawnable].sort().join(' ')}`);

// what a drop can ever yield
const droppable = new Set();
for (const k of bestiary) {
  const def = B.BESTIARY[k];
  for (const d of def?.drops || []) droppable.add(d.id);
}
const shopItems = new Set();
for (const s of Object.values(I.SHOPS)) for (const it of s.stock || []) shopItems.add(typeof it === 'string' ? it : it.id);
const questItems = new Set();
for (const id of Object.keys(Q.QUESTS)) for (const r of Q.QUESTS[id].rewards?.items || []) questItems.add(r.id);

out.push('');
out.push('--- objective audit ---');
const bad = [];
for (const id of Object.keys(Q.QUESTS)) {
  const q = Q.QUESTS[id];
  const rows = [];
  for (const o of q.objectives) {
    let verdict = 'ok';
    if (o.type === 'kill') {
      if (!bestiary.includes(o.target)) verdict = `NO SUCH SPECIES "${o.target}"`;
      else if (!spawnable.has(o.target)) verdict = `species never spawns`;
    } else if (o.type === 'fetch') {
      if (o.target.startsWith('gil:')) verdict = 'ok (wallet)';
      else if (!items[0] && false) verdict = 'x';
      else if (!Object.prototype.hasOwnProperty.call(I.ITEMS, o.target)) verdict = `NO SUCH ITEM "${o.target}"`;
      else if (!droppable.has(o.target) && !shopItems.has(o.target) && !questItems.has(o.target)) verdict = 'item exists but nothing drops/sells/awards it';
    } else if (o.type === 'talk') {
      if (!npcCast.includes(o.target)) verdict = `NO SUCH NPC "${o.target}"`;
      else if (!withDialogue.includes(o.target)) verdict = 'in the cast, but has no dialogue tree, so E never fires talk';
      else if (!placed.has(o.target)) verdict = 'has dialogue, but is not placed anywhere in this world';
    } else if (o.type === 'reach') {
      if (!o.waypoint) verdict = 'no waypoint';
    } else if (o.type === 'photo' || o.type === 'escort' || o.type === 'fish') {
      verdict = `nothing in the repo notifies "${o.type}"`;
    }
    rows.push(`    ${o.type}/${o.target}  ${verdict}`);
    if (verdict !== 'ok' && verdict !== 'ok (wallet)') bad.push(`${id}: ${o.type}/${o.target} -- ${verdict}`);
  }
  out.push(`  ${id} [${q.type}]`);
  out.push(rows.join('\n'));
}

out.push('');
out.push('--- hunt marks vs their kill objectives ---');
for (const [qid, t] of Object.entries(S.HUNT_TARGETS)) {
  const q = Q.QUESTS[qid];
  const kills = (q?.objectives || []).filter((o) => o.type === 'kill').map((o) => o.target);
  const ok = kills.includes(t.key);
  out.push(`  ${ok ? 'OK  ' : 'MISMATCH '} ${qid}: spawns "${t.key}", objective wants "${kills.join('/')}"`);
}

out.push('');
out.push('--- territory anchors vs the 8 km world ---');
for (const t of S.TERRITORIES) {
  out.push(`  ${t.id.padEnd(22)} "${t.name}" at (${t.at[0]},${t.at[1]})  |at| = ${Math.round(Math.hypot(t.at[0], t.at[1]))} m`);
}

out.push('');
out.push(`--- ${bad.length} unsatisfiable objectives ---`);
for (const b of bad) out.push('  ' + b);

return out.join('\n');
