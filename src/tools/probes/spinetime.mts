// How many guided minutes is the main line, after the chapter-3 repair?
//
// Part D's claim is "the spine is 50-65 guided minutes, up from 12-15". That
// number was never measured, and it cannot be measured by playing it once --
// a run measures one player's route. So this prices the spine the way the map
// screen prices a journey: the TRAVEL half comes from the real road graph and
// the real speeds (`WorldMap.travel`, `roadGraph.route`), objective by
// objective, in the order the quest log makes you do them; the ACT half is an
// explicit per-objective allowance, printed as itself so nobody can mistake a
// design assumption for a measurement.
//
// Two things it deliberately does not do. It does not walk the world, so it
// cannot see terrain that makes a "direct" line impossible -- it uses the road
// wherever the road graph has a route and a 1.25x detour factor when it does
// not, which is `WorldMap.travel`'s own model. And it prices the guided line
// only: no hunts, no side quests, no foraging, no encounters you stop for.
// The ambient loop is what the other 26 minutes of every 30 are made of.
//
//   node src/tools/probe.mts src/tools/probes/spinetime.mts
const g = window.GAME;
const out = [];
const rpg = g.get('Rpg');
const M = await import('/world/map/WorldMap.ts');
const C = await import('/game/story/Chapters.ts');
const map = M.worldMap;

/**
 * Seconds an objective costs once you are standing on it.
 *
 * These are ALLOWANCES, not measurements, and they are the only invented
 * numbers here. A kill is priced per head off the bestiary's own level, which
 * is the closest thing to a measurement available without playing the fight.
 */
const ACT = {
  talk: 45,        // a conversation with a camera move
  rest: 90,        // the camp menu, cooking, banking EXP
  photo: 40,       // Prompto lines up the shot
  buy: 60,         // walk to the counter, open the shop, pick something
  reach: 0,        // the travel line already paid for this
  fetch: 0,
  quest: 0,        // priced by recursing into the sub-quest
  fish: 240,
  draw: 30, craft: 60, cook: 90, escort: 0,
};
const perKill = (target, count, isBoss) => (isBoss ? 300 : Math.min(45, 12 + count * 2)) * (isBoss ? 1 : count);

const fmt = (s) => `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;

let at = [0, 0];                 // the party starts where the Regalia broke down
let grand = 0, grandTravel = 0;
const perChapter = [];

/** Price one quest's objectives in order, from wherever we are standing. */
const priceQuest = (id, depth = 0) => {
  const q = rpg.quests.def(id);
  if (!q) return 0;
  let total = 0;
  for (const o of q.objectives) {
    const wp = o.waypoint;
    let travel = 0, mode = '';
    if (wp) {
      const drive = map.travel(at[0], at[1], wp[0], wp[2], 'drive');
      const walk = map.travel(at[0], at[1], wp[0], wp[2], 'walk');
      // The Regalia is faster on anything the road serves, and the party has
      // it from the end of chapter 1. Under ~120 m nobody gets in the car.
      const straight = Math.hypot(wp[0] - at[0], wp[2] - at[1]);
      // Floor the road distance at the straight line. `roadGraph.route`
      // returns 0 when both ends snap to the SAME road node, which is exactly
      // what happens between the three Keycatrich pins -- and a 147 m walk
      // priced at zero is how a spine budget talks itself into being longer
      // than it is.
      const driveSeconds = Math.max(drive.dist, straight) / 26;
      const useCar = straight > 120 && driveSeconds < walk.seconds;
      travel = useCar ? driveSeconds : walk.seconds;
      mode = useCar ? `drive ${(Math.max(drive.dist, straight) / 1000).toFixed(2)} km` : `foot ${(straight / 1000).toFixed(2)} km`;
      at = [wp[0], wp[2]];
    }
    let act = ACT[o.type] ?? 0;
    if (o.type === 'kill') act = perKill(o.target, o.count || 1, !!q.setPiece);
    if (o.type === 'quest') act = priceQuest(o.target, depth + 1);
    total += travel + act;
    grandTravel += travel;
    out.push(`      ${'  '.repeat(depth)}${(o.type + ':' + o.id).padEnd(20)} ${fmt(travel + act).padStart(8)}  `
      + `${mode ? mode.padEnd(18) : ''.padEnd(18)} ${act ? `+${Math.round(act)}s act` : ''}`);
  }
  return total;
};

out.push('The main line, priced objective by objective.');
out.push('Travel is the real road graph at the map screen\'s own speeds; act times are allowances.');
out.push('');
for (const ch of C.CHAPTERS) {
  let chap = 0;
  out.push(`  ch${ch.n} ${ch.name}`);
  for (const id of ch.quests) {
    const q = rpg.quests.def(id);
    const before = grandTravel;
    const s = priceQuest(id);
    chap += s;
    out.push(`    ${id.padEnd(22)} ${fmt(s).padStart(8)}   (${q.name})  [travel ${fmt(grandTravel - before)}]`);
  }
  perChapter.push([ch.n, ch.name, chap]);
  out.push(`    ${'-- chapter total'.padEnd(22)} ${fmt(chap).padStart(8)}`);
  out.push('');
  grand += chap;
}

out.push('summary, guided minutes only:');
for (const [n, name, s] of perChapter) out.push(`  ch${n} ${name.padEnd(18)} ${(s / 60).toFixed(1)} min`);
out.push(`  ${'TOTAL'.padEnd(21)} ${(grand / 60).toFixed(1)} min`
  + `  (${(grandTravel / 60).toFixed(1)} min of it travel, ${((grand - grandTravel) / 60).toFixed(1)} min acts)`);
out.push('');
out.push(grand >= 50 * 60
  ? `PASS — the spine is ${(grand / 60).toFixed(0)} guided minutes, against Part D's 50-65.`
  : `SHORT — ${(grand / 60).toFixed(0)} guided minutes, against Part D's target of 50-65.`);
return out.join('\n');
