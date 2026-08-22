/* Does the region card agree with the minimap, everywhere a player walks? */
const g = window.GAME;
const out = [];
const wm = (await import('/world/map/WorldMap.ts')).worldMap;
const trig = g.get('Story')?.triggers;
if (!trig) return 'no Story.triggers';

const spots = [
  ['the car (spawn)', 0, 0],
  ['Hammerhead', 576, 10],
  ['Cotisse Haven', 962, -712],
  ['The Three Valleys', 1320, 1200],
  ['Keycatrich Ruins', 180, -1330],
  ['Longwythe Rest', 1120, 62],
  ['Saxham Outpost', -1620, 640],
  ['Alstor Slough', -1320, 820],
  ['Lestallum', -2960, -700],
  ['The Vesperpool', -2200, -2400],
];
out.push('place                    card says           minimap zone/region     agree?');
let bad = 0;
for (const [name, x, z] of spots) {
  const id = trig.regionAt({ x, z });
  const card = trig.regionCard(id, { x, z });
  const zone = wm.zoneAt(x, z);
  const region = wm.regionAt(x, z);
  const ok = region && card && card.name === region.name;
  if (!ok) bad++;
  out.push(`${name.padEnd(24)} ${(card ? `${card.name} / ${card.sub}` : 'none').padEnd(28)} ${(zone ? zone.name : '?')} / ${region ? region.name : '?'}   ${ok ? 'yes' : 'NO'}`);
}
out.push(`${bad} disagreements`);
return out.join('\n');
