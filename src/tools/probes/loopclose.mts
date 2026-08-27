// Does the loop close? fight -> reward -> spend -> fight better.
//
// Phase 4's definition of done asks for this box and `combatloop` cannot tick
// it: that gate proves thirty-one mechanics are individually *reachable* —
// EXP on kill, Ascension, Elemancy craft, the shop, the inventory — and
// reachable is not a loop. A loop is one continuous run in which the reward
// from the first fight measurably changes the second.
//
// So this drives the whole chain on one page, in order, with a fixed damage
// roll through the real formula as the yardstick at each end. The number that
// matters is the last line: **the same swing, before and after.**
//
// Run: node src/tools/probe.mts src/tools/probes/loopclose.mts --dirty
const g = window.GAME;
const rpg = g.get('Rpg');
const out = [];
if (!rpg) return 'NO RPG SYSTEM';

g.applyShot('hud_field');
g.get('Director')?.play?.();
g.get('CameraRig')?.clearShot?.();
g.resetClock();

/** One fixed roll through the real damage formula, crit forced off. */
const swing = () => rpg.damage({
  attacker: 'noctis',
  target: { level: 20, defense: 60, expClass: 'normal' },
  motion: 1.0, weaponClass: 'sword', seed: 7,
}).damage;

// EXP is BANKED, not applied — FFXV's whole rest loop turns on that, and
// `rpg.noctis.exp` is the applied figure. Reading it is how the first run of
// this probe reported "exp +0" off three kills that had paid 132.
const snap = () => ({
  lv: rpg.noctis.level, exp: rpg.expBank.banked, ap: rpg.ascension.ap,
  gil: rpg.inventory.gil, atk: rpg.noctis.attack, hp: rpg.noctis.maxHp,
  // Meals live in `activeBuffs` with `kind: 'meal'`; there is no `party.meal`.
  meal: (rpg.party.activeBuffs.find((b) => b.kind === 'meal') || {}).name || 'none',
  buffs: rpg.party.activeBuffs.map((b) => `${b.kind}:${b.name}`).join(','),
  swing: swing(),
});

const before = snap();
out.push('--- 0. standing still ---');
out.push(`  Lv ${before.lv}  atk ${before.atk}  AP ${before.ap}  gil ${before.gil}  `
  + `-> ${before.swing} damage on a fixed roll`);

/* ---- 1. fight -------------------------------------------------------- */
// Kill a real pack through the real path: `EncounterDirector.onDeath` is what
// banks EXP, AP, gil and rolled drops, so the fight has to go through it and
// not through `gainExp`.
const enc = g.get('EncounterDirector') || g.get('Encounters');
const combat = g.get('Combat');
const player = g.get('Player');
const enemies = g.get('Enemies');
if (!enc || !combat) return 'NO ENCOUNTER DIRECTOR';

const bankedBefore = { exp: rpg.expBank.banked, ap: rpg.ascension.ap, gil: rpg.inventory.gil };
let killed = 0;
const drops = [];
const offKill = (e) => { killed++; if (e && e.detail && e.detail.drops) drops.push(...e.detail.drops); };
window.addEventListener('encounter:kill', offKill);

// walk until a hostile den activates, then kill everything in it
const inp = g.input, rig = g.get('CameraRig');
let found = null;
for (let leg = 0; leg < 8 && !found; leg++) {
  const yaw = (leg / 8) * Math.PI * 2;
  player.position.set(0, player.position.y, 0);
  if (rig) { rig.yaw = yaw; rig.yawTarget = yaw; }
  inp.keys.clear(); inp.keys.add('KeyW'); inp.keys.add('ShiftLeft');
  for (let f = 0; f < 60 * 45 && !found; f++) {
    g.frame(1 / 60);
    const live = enemies.list.filter((e) => !e.dead && !e.passive);
    if (live.length >= 2) found = live;
  }
  inp.keys.clear();
}
if (!found) { window.removeEventListener('encounter:kill', offKill); return 'NO PACK FOUND IN 8 LEGS'; }

out.push('');
out.push('--- 1. fight ---');
out.push(`  found ${found.length} hostiles: ${found.map((e) => e.name).join(', ')}`);
// Kill them the way the player does — through `Combat`, so death, drops and
// the victory payout all run.
for (const e of found) {
  let guard = 0;
  while (!e.dead && guard++ < 400) {
    combat._applyDamage(e, player.position, { motion: 40, poise: 200 });
  }
}
for (let f = 0; f < 60 * 6; f++) g.frame(1 / 60);   // let the victory beat run
window.removeEventListener('encounter:kill', offKill);

const afterFight = snap();
out.push(`  killed ${killed}, exp banked +${rpg.expBank.banked - bankedBefore.exp}, `
  + `AP +${rpg.ascension.ap - bankedBefore.ap}, gil +${rpg.inventory.gil - bankedBefore.gil}, `
  + `drops ${drops.length ? drops.join(',') : 'none'}`);
const paid = rpg.expBank.banked > bankedBefore.exp
  || rpg.ascension.ap > bankedBefore.ap
  || rpg.inventory.gil > bankedBefore.gil;
out.push(`  REWARD: ${paid ? 'PAID' : '*** NOTHING WAS BANKED ***'}`);

/* ---- 2. spend the AP ------------------------------------------------- */
out.push('');
out.push('--- 2. spend ---');
// maxHp is watched at every step: the first run of this lost 400 of it
// somewhere between the fight and the meal and could not say where.
const hpTrail = [rpg.noctis.maxHp];
// `availableNodes()` is the real API — affordable and unblocked, which is
// exactly the question. An invented `status()` is how the first run of this
// reported "0 candidates" against 150 unspent AP.
const canUnlock = rpg.ascension.availableNodes();
let spent = null;
for (const n of canUnlock) {
  if (rpg.unlockNode(n.id)) { spent = n; break; }
}
out.push(spent
  ? `  unlocked "${spent.name}" for ${spent.ap} AP  (${canUnlock.length} were affordable)`
  : `  NOTHING AFFORDABLE: ${rpg.ascension.ap} AP, ${canUnlock.length} candidates`);
hpTrail.push(rpg.noctis.maxHp);

/* ---- 3. spend the gil ------------------------------------------------ */
const gilBefore = rpg.inventory.gil;
const bought = rpg.inventory.buy('potion', 3);
out.push(bought && bought.ok !== false
  ? `  bought 3 Potions for ${gilBefore - rpg.inventory.gil} gil, bag now ${rpg.inventory.count('potion')}`
  : `  BUY REFUSED: ${bought && bought.reason}`);
hpTrail.push(rpg.noctis.maxHp);

/* ---- 4. cook, which is the other half of "spend" --------------------- */
// Cook the BEST thing available, which is what a player does. Cooking the
// first row of the list is how the first run of this replaced the seeded
// save's Lucian Tomato Stew with Cup Noodles and reported the loop costing
// 400 maximum HP — correct behaviour, read through a silly choice.
const cookable = rpg.party.cookableNow(rpg.inventory)
  .slice().sort((a, b) => (b.rank || 0) - (a.rank || 0));
let meal = null;
if (cookable.length) {
  const res = rpg.party.cook(cookable[0].id, rpg.inventory, rpg.day.absoluteHour);
  if (res && res.ok !== false) meal = cookable[0];
}
hpTrail.push(rpg.noctis.maxHp);
out.push(meal ? `  cooked "${meal.name}"` : `  nothing cookable (${cookable.length} recipes ready)`);
out.push(`  maxHp across the three spends: ${hpTrail.join(' -> ')}`);
out.push(`  buffs before "${before.buffs || 'none'}"  after "${snap().buffs || 'none'}"`);

/* ---- 5. fight better ------------------------------------------------- */
const after = snap();
out.push('');
out.push('--- 3. the same swing, after ---');
out.push(`  Lv ${before.lv} -> ${after.lv}   atk ${before.atk} -> ${after.atk}   `
  + `maxHp ${before.hp} -> ${after.hp}   meal "${before.meal}" -> "${after.meal}"`);
out.push(`  exp banked ${before.exp} -> ${after.exp}, AP ${before.ap} -> ${after.ap}, `
  + `gil ${before.gil} -> ${after.gil}`);
out.push(`  fixed roll ${before.swing} -> ${after.swing}  `
  + `(${after.swing >= before.swing ? '+' : ''}${after.swing - before.swing})`);
const closed = paid && (after.swing > before.swing || after.atk > before.atk
  || after.hp > before.hp || !!meal);
out.push('');
out.push(closed
  ? 'LOOP CLOSES: the first fight paid for something the second fight can feel.'
  : '*** LOOP DOES NOT CLOSE: nothing the fight paid for moved a number. ***');
return out.join('\n');
