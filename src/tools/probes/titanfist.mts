/*
 * Does Titan's fist land where the hand is?
 *
 * `BossFight.resolveStrike`, `slamAt` and `_handPos` sat in the tree for
 * months, typed, compiling, and never once executed: `Enemies.onStrike` routed
 * every blow to `EncounterDirector.resolveStrike`, which sweeps an arc from the
 * enemy's *root* along its heading. That is the right model for a sabertusk and
 * the wrong one for a creature whose fist arrives forty metres from its navel.
 *
 * This measures the difference rather than asserting it: start the Titan set
 * piece, drive the boss to a slam, and compare where the generic sweep would
 * have hit (the root) with where the hand actually is.
 */
const g = window.GAME;
const out = [];
let fails = 0;
const ok = (c, m) => { out.push(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };

const enc = g.get('Encounters');
const player = g.get('Player');
const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };

g.get('Director').play();
g.get('Menus').setScreen(null);
g.get('Cinematics')?.stop?.({ skipped: true });
step(10);

ok(!!enc, 'the encounter director is registered as "Encounters", not "Director"');
const started = enc.startSetPiece('titan');
step(30);
const fight = enc.boss;
ok(!!fight, `startSetPiece("titan") makes a BossFight  (${started ? 'started' : 'refused'})`);
if (!fight) { out.push('cannot go on without a fight'); return out.join('\n'); }
const boss = fight.boss;
ok(!!boss, `and it has a boss: ${boss ? `${boss.speciesId} lv${boss.level} hp ${boss.hp}` : 'none'}`);
ok(fight.def.kind === 'astral', `the fight is an astral set piece (kind=${fight.def.kind})`);

// -- 1. the wiring exists at all ------------------------------------------
let handled = 0, slams = 0;
const origBoss = fight.resolveStrike.bind(fight);
fight.resolveStrike = (e, a) => { const r = origBoss(e, a); if (r) handled++; return r; };
const origSlam = fight.slamAt.bind(fight);
let slamPoint = null;
fight.slamAt = (p, a) => { slams++; slamPoint = p.clone(); return origSlam(p, a); };

// -- 2. fire a slam through the real path ---------------------------------
// `EnemyBase` calls `ctx.onStrike(this, attack)` on the active frame; call it
// the same way rather than reaching into BossFight, so a pass means the live
// route works and not just the method.
const slam = (boss.attacks || []).find((a) => a.id === 'slam_l' || a.id === 'slam_r');
ok(!!slam, `Titan has a slam attack  (${(boss.attacks || []).map((a) => a.id).join(', ')})`);

// Stand the party inside the crater the hand will make.
const hand = fight._handPos(slam && slam.id === 'slam_l' ? 'handL' : 'handR');
ok(!!hand, `the hand bone resolves  ${hand ? `(${hand.x.toFixed(1)}, ${hand.y.toFixed(1)}, ${hand.z.toFixed(1)})` : '-- rig has no handL/handR'}`);

const root = boss.root.position;
if (hand) {
  const d = Math.hypot(hand.x - root.x, hand.z - root.z);
  out.push(`      hand is ${d.toFixed(1)} m from the root, and the generic sweep`
    + ` reaches ${((slam?.hitRadius ?? 1.8) * boss.scale).toFixed(1)} m from the root`);
  ok(d > (slam?.hitRadius ?? 1.8) * boss.scale * 0.3,
    'the two are far enough apart that it matters which one is used');
}

const hpBefore = g.get('Rpg').noctis.hp;
// Put Noctis under the hand, then re-read the hand on the strike frame: Titan
// is animating, and the bone moves several metres between frames. Comparing
// against a position read four frames earlier measures the animation, not the
// wiring -- which is exactly the mistake the first run of this probe made.
if (hand) {
  player.root.position.set(hand.x, g.get('Terrain').heightAt(hand.x, hand.z), hand.z);
  player.velocity?.set(0, 0, 0);
  step(4);
}
const handNow = fight._handPos(slam && slam.id === 'slam_l' ? 'handL' : 'handR');
g.get('Enemies').onStrike(boss, slam);
step(6);

ok(handled === 1, `the boss fight claimed the blow (BossFight.resolveStrike returned true ${handled}x)`);
ok(slams === 1, `slamAt ran ${slams}x -- the crater, the shockwave and the quake`);
if (slamPoint && handNow) {
  const off = Math.hypot(slamPoint.x - handNow.x, slamPoint.z - handNow.z);
  ok(off < 0.5, `and it landed on the hand, not the navel (${off.toFixed(2)} m off)`);
}
const hpAfter = g.get('Rpg').noctis.hp;
out.push(`      Noctis stood under the fist: ${hpBefore} -> ${hpAfter} HP`);

// -- 3. an ordinary enemy still goes down the generic path ----------------
const other = (enc.enemies?.list || []).find((e) => e !== boss);
if (other) {
  handled = 0;
  g.get('Enemies').onStrike(other, null);
  step(2);
  ok(handled === 0, 'an ordinary enemy still falls through to the generic sweep');
}

out.push('');
out.push(fails === 0 ? 'ALL PASS' : `${fails} FAILED`);
return out.join('\n');
