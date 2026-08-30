/*
 * Does the new swim state change any frame in the existing shot corpus?
 *
 *   node src/tools/probe.mts src/tools/probes/shotswim.mts
 *
 * Lane 23 added a system that takes the world over -- foot IK, both locomotion
 * speeds, the drawn blade, combat input, and the retinue's positions -- the
 * moment the player is standing in more than 1.2 m of water. Every shot in the
 * corpus poses the player somewhere, and if any of them poses him in a lake
 * then that shot silently changes: his sword vanishes, his legs stop reaching
 * for the bottom and the other three are pinned to a bank. That is a
 * cross-lane regression in somebody else's baseline, and it is invisible from
 * inside this lane.
 *
 * So ask the question directly, on the corpus, once. Reports every shot where
 * the player is over water at all, and whether the state actually engaged.
 */
const g = window.GAME;
const swim = g.get('Swim');
const player = g.get('Player');
if (!swim || !player) return { error: 'no Swim / Player' };

const M = await import('/game/Shots.ts');
const names = Object.keys(M.SHOTS).filter((n) => n !== M.PROBE_SHOT && M.SHOTS[n]);

const wet = [], engaged = [];
for (const name of names) {
  g.resetClock();
  g.applyShot(name);
  // Two steps is enough: Swim decides in lateUpdate off the player's position,
  // and applyShot has already put him where the shot wants him.
  g.settle(4);
  if (swim.depth > 0.01 || swim.swimming) {
    const row = { name, depth: +swim.depth.toFixed(2), swimming: !!swim.swimming };
    wet.push(row);
    if (swim.swimming) engaged.push(name);
    console.log(`[shotswim] ${name} depth=${row.depth} swimming=${row.swimming}`);
  }
}
console.log(`[shotswim] ${wet.length} of ${names.length} shots stand in water; `
  + `${engaged.length} engage the swim state`);
return { shots: names.length, wet, engaged };
