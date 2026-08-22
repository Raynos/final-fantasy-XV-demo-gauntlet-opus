/* WS-5: is camp -> cook -> sleep a loop worth repeating? */
const g = window.GAME;
const out = [];
const rpg = g.get('Rpg');
const P = await import('/game/rpg/PartyState.ts');

const n = rpg.noctis;
const snap = () => ({ atk: n.attack, def: n.defense, hp: n.maxHp, mp: n.maxMp, crit: n.critRate, cd: n.critDamage, mag: n.magicAttack });
const dmg = () => {
  // a fixed roll through the real formula, crit forced off, so the only thing
  // moving is the buff
  const r = rpg.damage({ attacker: 'noctis', target: { level: 20, defense: 60, expClass: 'normal' }, motion: 1.0, weaponClass: 'sword', seed: 7 });
  return r.damage;
};

out.push('--- the cookbook ---');
out.push(`cooking level ${rpg.party.cookingLevel}, ${rpg.party.cookbook.length} recipes known, ${P.RECIPE_TABLE ? Object.keys(P.RECIPE_TABLE).length : '?'} in the table`);
const cookable = rpg.party.cookableNow(rpg.inventory);
out.push(`cookable right now: ${cookable.length} -> ${cookable.map((r) => r.name).join(', ')}`);

out.push('');
out.push('--- what a meal is worth, measured through the real damage formula ---');
const base = snap(); const d0 = dmg();
out.push(`no meal: atk ${base.atk} def ${base.def} maxHp ${base.hp} crit ${(base.crit * 100).toFixed(1)}%  -> ${d0} damage on a fixed roll`);
let changed = 0;
for (const r of rpg.party.cookbook) {
  // force-feed: grant the ingredients so every recipe can be measured
  for (const ing of r.ingredients) rpg.inventory.add(ing.id, ing.count, 'probe');
  const res = rpg.party.cook(r.id, rpg.inventory, rpg.day.absoluteHour);
  if (!res.ok) { out.push(`  ${r.name.padEnd(26)} REFUSED (${res.reason})`); continue; }
  const s = snap(); const d = dmg();
  const bits = [];
  if (s.atk !== base.atk) bits.push(`atk ${base.atk}->${s.atk}`);
  if (s.def !== base.def) bits.push(`def ${base.def}->${s.def}`);
  if (s.hp !== base.hp) bits.push(`hp ${base.hp}->${s.hp}`);
  if (s.mp !== base.mp) bits.push(`mp ${base.mp}->${s.mp}`);
  if (Math.abs(s.crit - base.crit) > 1e-6) bits.push(`crit ${(base.crit * 100).toFixed(0)}->${(s.crit * 100).toFixed(0)}%`);
  if (Math.abs(s.mag - base.mag) > 1e-6) bits.push(`mag ${base.mag}->${s.mag}`);
  const expM = rpg.party.expMultiplier;
  if (expM !== 1) bits.push(`expX${expM.toFixed(2)}`);
  const dd = d - d0;
  if (bits.length || dd) changed++;
  out.push(`  ${r.name.padEnd(26)} rank ${r.rank} ${String(r.hours).padStart(2)} h  ${bits.join(' ') || 'NO STAT CHANGE'}  | damage ${d0}->${d} (${dd >= 0 ? '+' : ''}${dd})`);
}
out.push(`${changed}/${rpg.party.cookbook.length} known recipes move a number the player can feel`);

out.push('');
out.push('--- do buffs expire with the clock? ---');
const before = rpg.party.activeBuffs.map((b) => `${b.name} ${Math.round(b.expiresAt - rpg.day.absoluteHour)}h`);
out.push(`active now: ${before.join(', ') || 'none'}`);
rpg.day.wait(14, { party: rpg.party });
rpg.party.expireBuffs(rpg.day.absoluteHour);
out.push(`after waiting 14 h: ${rpg.party.activeBuffs.map((b) => b.name).join(', ') || 'none'}`);

out.push('');
out.push('--- the day cycle: does night change the fight? ---');
for (const h of [9, 13, 19, 22, 2, 4]) {
  rpg.day.setHour(h);
  const p = rpg.daemonPressure();
  out.push(`  ${String(h).padStart(2)}:00  ${rpg.day.phase.name.padEnd(10)} night=${rpg.day.isNight} depth=${(p.depth ?? 0).toFixed(2)} daemons=${p.spawn} density=${(p.density ?? 0).toFixed(2)} lvBonus=${p.levelBonus} atkX${(p.attack ?? 1).toFixed(2)} hpX${(p.hp ?? 1).toFixed(2)}`);
}

out.push('');
out.push('--- lodgings: what is a night worth where? ---');
for (const [id, l] of Object.entries(rpg.tables.lodgings)) {
  out.push(`  ${id.padEnd(12)} x${l.bonus} exp, ${l.cost ?? 0} gil${l.desc ? ' — ' + l.desc : ''}`);
}

return out.join('\n');
