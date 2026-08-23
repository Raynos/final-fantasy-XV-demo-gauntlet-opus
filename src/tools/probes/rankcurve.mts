/* Can the hunter ladder actually be climbed, rung by rung, from a fresh save? */
const g = window.GAME;
const out = [];
const Q = await import('/game/rpg/Quests.ts');
const rpg = g.get('Rpg');

const hunts = Q.HUNTS.slice().sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0) || a.level - b.level);
out.push('the board, in ladder order:');
out.push('  quest                 rank  pays  gate  requires');
for (const h of hunts) {
  out.push(`  ${h.id.padEnd(22)} ${String(h.rank).padStart(2)}  ${String(Q.HUNT_RANKS[h.rank].hunterPoints).padStart(4)}  ${String(Q.RANK_GATE[h.rank]).padStart(4)}  ${(h.requires || []).join(', ') || '-'}`);
}
out.push('');
out.push('the ladder:');
for (let i = 0; i < Q.HUNTER_RANKS.length; i++) {
  const r = Q.HUNTER_RANKS[i];
  out.push(`  ${String(r.at).padStart(4)} pts  ${r.name.padEnd(11)} opens rank ${r.unlocks}  ${r.reward ? `pays ${r.reward}` : ''}`);
}
out.push('');

// Walk the board the way a player would: take everything you are allowed to
// take, in ladder order, and see whether the ceiling ever stops rising.
let pts = 0;
const done = new Set();
const order = [];
let progress = true;
while (progress) {
  progress = false;
  for (const h of hunts) {
    if (done.has(h.id)) continue;
    if (pts < Q.RANK_GATE[h.rank]) continue;
    if ((h.requires || []).some((r) => !done.has(r))) continue;
    done.add(h.id);
    pts += Q.HUNT_RANKS[h.rank].hunterPoints;
    order.push({ id: h.id, rank: h.rank, pts });
    progress = true;
  }
}
out.push('walking the board from a fresh save, taking whatever is takeable:');
let rung = -1;
for (const o of order) {
  let top = -1;
  for (let i = 0; i < Q.HUNTER_RANKS.length; i++) if (o.pts >= Q.HUNTER_RANKS[i].at) top = i;
  const up = top > rung ? `   -> ${Q.HUNTER_RANKS[top].name}, opens rank ${Q.HUNTER_RANKS[top].unlocks} (${Q.HUNTER_RANKS[top].reward ?? 'no reward'})` : '';
  rung = Math.max(rung, top);
  out.push(`  ${o.id.padEnd(22)} rank ${o.rank}  -> ${String(o.pts).padStart(3)} pts${up}`);
}
const stuck = hunts.filter((h) => !done.has(h.id));
out.push('');
out.push(stuck.length
  ? `UNREACHABLE (${stuck.length}): ${stuck.map((h) => `${h.id} needs ${Q.RANK_GATE[h.rank]} pts at rank ${h.rank}`).join('; ')}`
  : `every one of the ${hunts.length} bounties is reachable; the board tops out at ${pts} points`);

// And the rung the board can never reach.
const topRung = Q.HUNTER_RANKS[Q.HUNTER_RANKS.length - 1];
out.push(topRung.at <= pts
  ? `the top rung "${topRung.name}" costs ${topRung.at} and the board pays ${pts}: reachable`
  : `the top rung "${topRung.name}" costs ${topRung.at} and the board can only ever pay ${pts}: UNREACHABLE`);

out.push('');
out.push('what the seeded save can take right now:');
const log = rpg.quests;
out.push(`  hunter points ${log.hunterPoints}`);
const open = hunts.filter((h) => log.hunterPoints >= Q.RANK_GATE[h.rank] && ['available', 'active'].includes(log.status(h.id)));
out.push(`  takeable: ${open.length ? open.map((h) => h.name).join(', ') : 'NOTHING'}`);

// The rank-up payout, driven through the real path.
out.push('');
out.push('does a rank-up actually pay?');
const before = rpg.inventory.count('bronze_bangle');
const p0 = log.hunterPoints;
rpg._rankSeen = 0;
log.hunterPoints = 1;
rpg._checkHunterRank();
out.push(`  crossing 1 pt: bronze_bangle ${before} -> ${rpg.inventory.count('bronze_bangle')}`);
log.hunterPoints = p0;

return out.join('\n');
