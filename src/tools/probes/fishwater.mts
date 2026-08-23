/*
 * Which fishing POIs have real water, and where the rod actually stands.
 *
 * `Water` is a single global plane at y = -6.5: a basin below it gets a
 * surface and everything else is dry ground. A `type: 'fishing'` pin sitting
 * at 68 m of elevation can never have water under it, whatever its `does:`
 * line advertises. This prints the survey `Fishing._survey` runs at install,
 * so the count of live fishing holes is a measurement and not a claim.
 */
const g = window.GAME;
const rpg = g.get('Rpg');
const water = g.get('Water');
const terrain = g.get('Terrain');
const map = (await import('/world/map/WorldMap.ts')).worldMap;

// Force the install: it normally happens on the first tick, and the probe
// stops the loop before it runs.
rpg.fishing.install(g);
const F = rpg.fishing;

const out = [];
out.push(`water plane y=${water.level}  bodies=${water.bodies.length}`);
for (const b of water.bodies) {
  out.push(`  body  centre (${b.cx.toFixed(0)}, ${b.cz.toFixed(0)})  ${b.w.toFixed(0)} x ${b.d.toFixed(0)} m`);
}
out.push('');
out.push('poi                   pin ground   stand                       fetch  species');
let live = 0;
for (const p of map.pois.filter((q) => q.type === 'fishing')) {
  const spot = F.spots.get(p.id);
  const h = terrain.heightAt(p.x, p.z);
  if (!spot) {
    out.push(`${p.id.padEnd(21)} ${h.toFixed(1).padStart(7)} m   DRY -- no water within 170 m`);
    continue;
  }
  live++;
  const d = Math.hypot(spot.stand.x - p.x, spot.stand.z - p.z);
  const standWet = water.surfaceAt(spot.stand.x, spot.stand.z) != null
    && terrain.heightAt(spot.stand.x, spot.stand.z) < water.level;
  out.push(`${p.id.padEnd(21)} ${h.toFixed(1).padStart(7)} m   `
    + `(${spot.stand.x.toFixed(0)}, ${spot.stand.z.toFixed(0)}) y=${spot.stand.y.toFixed(1)} ${d.toFixed(0)}m out`
    + `  ${spot.fetch.toFixed(0).padStart(3)}   ${spot.fish.join(', ')}`
    + (standWet ? '   !! STAND IS UNDER WATER' : ''));
}
out.push('');
out.push(`${live} live fishing holes, ${F.dry.length} dry pins: ${F.dry.join(', ') || '-'}`);

// Every species the live holes can pay out must be a real ingredient.
const inv = await import('/game/rpg/Inventory.ts');
const bad = [];
for (const spot of F.spots.values()) {
  for (const id of spot.fish) {
    const def = inv.ITEMS[id];
    if (!def) bad.push(`${id} (no item)`);
    else if (def.category !== 'ingredient') bad.push(`${id} (${def.category}, not ingredient)`);
  }
}
out.push(bad.length ? `FAIL every catch must be a cookable ingredient: ${bad.join(', ')}` : 'PASS every catch is a cookable ingredient');

// And the rod has to be in the bag, or the prompt never lights.
out.push(rpg.inventory.count('fishing_rod') > 0
  ? 'PASS the party starts with the Tranquility Rod'
  : 'FAIL no fishing rod in the bag -- every Fish prompt is disabled');

const ix = g.get('Interaction');
const prompts = [...ix.items.values()].filter((i) => i.id.startsWith('fish_'));
out.push(`${prompts.length} "Fish" prompts registered`);
return out.join('\n');
