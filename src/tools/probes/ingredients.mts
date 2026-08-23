/* Can a player restock the kitchen? And what buff is already running at boot? */
const g = window.GAME;
const out = [];
const rpg = g.get('Rpg');
const P = await import('/game/rpg/PartyState.ts');
const I = await import('/game/rpg/Inventory.ts');
const B = await import('/characters/enemies/Bestiary.ts');

out.push('--- what is buffing the party before anyone has cooked? ---');
out.push(`activeBuffs: ${rpg.party.activeBuffs.length ? rpg.party.activeBuffs.map((b) => `${b.name} [${b.kind}] ${JSON.stringify(b.mods)}`).join(' ; ') : 'none'}`);
const n = rpg.noctis;
out.push(`noctis buff mods: ${JSON.stringify(n.buff)}`);
out.push(`gear mods: ${JSON.stringify(n.gear)}`);
out.push(`attack ${n.attack} = strength ${n.strength} + gear ${n.gear.attack || 0} + buff ${n.buff.attack || 0} + asc ${n.ascension.attack || 0}`);
out.push(`defense ${n.defense} = vitality ${n.vitality} + gear ${n.gear.defense || 0} + buff ${n.buff.defense || 0} + asc ${n.ascension.defense || 0}`);

out.push('');
out.push('--- ingredient supply ---');
const drops = new Map();
for (const k of Object.keys(B.BESTIARY)) {
  for (const d of B.BESTIARY[k].drops || []) {
    if (!drops.has(d.id)) drops.set(d.id, []);
    drops.get(d.id).push(k);
  }
}
const shop = new Map();
for (const [sid, s] of Object.entries(I.SHOPS)) {
  for (const it of s.stock || []) {
    const id = typeof it === 'string' ? it : it.id;
    if (!shop.has(id)) shop.set(id, []);
    shop.get(id).push(sid);
  }
}
// The third supply line, and the newest: anything a fishing hole with real
// water under it can pay out. Sourced from the live `Fishing` survey rather
// than from `HOLES`, because a hole whose pin has no water is not a source.
const caught = new Map();
{
  const F = rpg.fishing;
  F.install(g);
  for (const sp of F.spots.values()) {
    for (const id of sp.fish) {
      if (!caught.has(id)) caught.set(id, []);
      caught.get(id).push(sp.id);
    }
  }
}

const need = new Map();
for (const r of Object.values(P.RECIPE_TABLE)) {
  for (const ing of r.ingredients) need.set(ing.id, (need.get(ing.id) || 0) + 1);
}
let unobtainable = 0;
const rows = [];
for (const [id, uses] of [...need.entries()].sort((a, b) => b[1] - a[1])) {
  const src = [];
  if (drops.has(id)) src.push(`drops from ${drops.get(id).join('/')}`);
  if (shop.has(id)) src.push(`sold at ${shop.get(id).join('/')}`);
  if (caught.has(id)) src.push(`caught at ${caught.get(id).join('/')}`);
  if (!src.length) { src.push('NO SOURCE'); unobtainable++; }
  rows.push(`  ${id.padEnd(22)} used by ${String(uses).padStart(2)} recipes, held ${String(rpg.inventory.count(id)).padStart(2)}  ${src.join('; ')}`);
}
out.push(rows.join('\n'));
out.push(`${need.size} distinct ingredients, ${unobtainable} with no source in the game at all`);

out.push('');
out.push('--- how many of the 30 recipes are reachable at all? ---');
let ok = 0, blocked = 0;
for (const r of Object.values(P.RECIPE_TABLE)) {
  const bad = r.ingredients.filter((i) => !drops.has(i.id) && !shop.has(i.id) && !caught.has(i.id));
  if (bad.length) { blocked++; out.push(`  ${r.name.padEnd(30)} rank ${r.rank}  BLOCKED on ${bad.map((b) => b.id).join(', ')}`); } else ok++;
}
out.push(`${ok} recipes have a supply line, ${blocked} do not`);

out.push('');
out.push('--- what the shops actually sell ---');
for (const [sid, s] of Object.entries(I.SHOPS)) {
  out.push(`  ${sid.padEnd(18)} "${s.name}" ${s.stock.length} lines: ${s.stock.map((it) => (typeof it === 'string' ? it : it.id)).join(', ')}`);
}

return out.join('\n');
