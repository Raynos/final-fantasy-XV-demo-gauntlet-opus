/*
 * Whose fight is it, arithmetically?
 *
 * `fightshape` measures the damage share of a real fight, which mixes two
 * things: how hard each attacker hits, and how much of the fight each one
 * spends attacking. WS-11 names `PartyAI.ROLES`' motion values as the knob,
 * and a knob is worth turning only against the first of those.
 *
 * So this asks the damage formula directly. For one live sabertusk, it runs
 * every attacker's real blow through `rpg.damage` with that attacker's own
 * stats and motion value, divides by that attacker's own cadence, and prints
 * damage per second at **full uptime** plus the share that implies. The gap
 * between this share and `fightshape`'s measured share is the uptime, and it
 * is not something the motion values can fix.
 *
 *   node src/tools/probe.mts src/tools/probes/dpsshare.mts
 */
const g = window.GAME;
const out = [];
const combat = g.get('Combat');
const enemies = g.get('Enemies');
const enc = g.get('Encounters');
const player = g.get('Player');
const rpg = g.get('Rpg');
const menus = g.get('Menus');
const P = await import('/characters/ai/PartyAI.ts');
const W = await import('/combat/Weapons.ts');

const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
g.input.pointerLocked = true;
g.get('Director').play();
g.get('Cinematics')?.stop?.({ skipped: true });
menus.setScreen(null); step(20);
g.get('HUD').setMenuOpen(false); step(4);

for (const id of [...enc.active.keys()]) enc.deactivate(id);
enc.packs.length = 0;
enemies.clear();
step(2);

const f = g.camera.getWorldDirection(player.position.clone());
f.y = 0; f.normalize();
const pos = player.position.clone().addScaledVector(f, 3.0);
const e = enemies.spawn('sabertusk', { pos, heading: player.heading + Math.PI });
e.frozenPose = { state: 'idle', phase: 0 };
combat.drawSlot(0);
step(2);

out.push(`target: ${e.name} lv ${e.level}, ${e.maxHp} hp, defense ${Math.round(e.defense)}`);
out.push(`noctis: lv ${rpg.noctis.level} attack ${Math.round(rpg.noctis.attack)}  weapon ${combat.weapon.def.name} motion ${combat.weapon.def.motion}`);
out.push('');

/** One blow through the real formula, without landing it. */
const hit = (attacker, motion, weaponClass, staggerMult) => rpg.damage({
  attacker, target: e, motion, weaponClass, staggerMult, kind: 'physical', element: 'physical',
}).damage;

const rows = [];

/* ---- Noctis: the drawn weapon's own combo -------------------------- */
{
  const def = combat.weapon.def;
  const steps = def.combo || def.steps || [];
  let dmg = 0, secs = 0;
  const per = [];
  for (const s of steps) {
    const m = def.motion * (s.dmg ?? 1);
    const d = hit(rpg.noctis, m, combat.weaponClass, 1);
    per.push(`${Math.round(d)}`);
    dmg += d;
    secs += (s.wind ?? 0) + (s.active ?? 0) + (s.rec ?? 0);
  }
  rows.push({
    who: 'noctis', dmg, secs, per: per.join('/'),
    note: `${steps.length}-hit combo, motion ${def.motion} x [${steps.map((s) => s.dmg ?? 1).join(', ')}]`,
  });
}

/* ---- the retinue: one swing each, on its own cadence ---------------- */
for (const key of ['gladio', 'ignis', 'prompto']) {
  const role = P.ROLES[key];
  const stats = rpg.party.stats[key];
  // `PartyAI.strike` passes `weaponClass: null` and `staggerMult: 1`.
  const d = hit(stats, role.motion, null, 1);
  rows.push({
    who: key, dmg: d, secs: role.swing + role.recover, per: `${Math.round(d)}`,
    note: `attack ${Math.round(stats.attack)}, motion ${role.motion}, ${role.swing}s swing + ${role.recover}s recover`,
  });
}

const total = rows.reduce((a, r) => a + r.dmg / r.secs, 0) || 1;
out.push('DAMAGE PER SECOND AT FULL UPTIME (the formula, not a fight)');
for (const r of rows) {
  const dps = r.dmg / r.secs;
  out.push(`  ${r.who.padEnd(8)} ${dps.toFixed(0).padStart(5)} dps  ${(100 * dps / total).toFixed(0).padStart(3)}%   ${r.per} over ${r.secs.toFixed(2)}s   ${r.note}`);
}
out.push('');

/* ---- what the multipliers Noctis alone gets are worth ---------------- */
const base = hit(rpg.noctis, combat.weapon.def.motion, combat.weaponClass, 1);
out.push('MULTIPLIERS ONLY NOCTIS SEES (one first-combo-step blow)');
out.push(`  plain                 ${Math.round(base)}`);
out.push(`  staggered (x1.9)      ${Math.round(hit(rpg.noctis, combat.weapon.def.motion, combat.weaponClass, 1.9))}`);
// The live path: `_tickWarp` uses `weaponMotion * 1.9` and withholds the
// blindside bonus from a target that is already staggered.
const warp = (staggered, dist) => Math.round(rpg.damage({
  attacker: rpg.noctis, target: e,
  motion: (combat.warpMotion ? combat.warpMotion(dist) : combat.weapon.def.motion * 1.9),
  weaponClass: combat.weaponClass, staggerMult: staggered ? 1.9 : 1,
  isWarpStrike: true, isBackAttack: !staggered,
  kind: 'physical', element: 'physical',
}).damage);
out.push(`  warp-strike, from 3 m   ${warp(false, 3)}   staggered ${warp(true, 3)}`);
out.push(`  warp-strike, from 12 m  ${warp(false, 12)}   staggered ${warp(true, 12)}`);
out.push(`  warp-strike, from 24 m  ${warp(false, 24)}   staggered ${warp(true, 24)}`);
out.push(`  ...against ${e.maxHp} hp. A staggered warp that exceeds that is an execute, not a punish.`);
out.push(`  companions never get any of these: PartyAI.strike passes staggerMult: 1 and weaponClass: null`);

return out.join('\n');
