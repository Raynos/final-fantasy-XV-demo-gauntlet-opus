// Does anything the player charts survive a save and a reload?
//
// `WorldMap.discovered` is reseeded to two ids in the constructor and the
// constructor runs at import, so before SAVE_VERSION 4 every load -- including
// "Continue" on a 27-hour save -- opened the map with Hammerhead and its layby
// on it and the surveyed read-out back at its boot value. Twelve hours of
// driving charted nothing that outlived the tab.
const g = window.GAME;
const out = [];
const fails = [];
const ok = (name, cond, detail) => {
  out.push(`  ${cond ? 'ok  ' : 'FAIL'}  ${name.padEnd(46)} ${detail || ''}`);
  if (!cond) fails.push(name);
  return cond;
};
const rpg = g.get('Rpg');
const M = await import('/world/map/WorldMap.ts');
const F = await import('/world/map/FogOfWar.ts');
const SG = await import('/game/rpg/SaveGame.ts');
const map = M.worldMap, fog = F.fog;

out.push(`SAVE_VERSION ${SG.SAVE_VERSION}`);
out.push('');
out.push('--- 1. what a session charts is written ---');
// Chart three far places and survey a patch of wilderness nowhere near a road.
const far = ['galdin_quay', 'lestallum', 'keycatrich_trench'].filter((id) => map.poiById(id));
for (const id of far) map.discover(id);
fog.reveal(-2400, 2400, 700);
const seen0 = fog.mask.reduce((a, v) => a + (v ? 1 : 0), 0);
const disc0 = new Set(map.discovered);
const res = rpg.save('probe_fog');
ok('the save is written', !!res.ok, `slot probe_fog, ${disc0.size} pins, ${seen0} cells surveyed`);
const blob = SG.load('probe_fog');
ok('and carries a map block', !!(blob.ok && blob.data.map), `version ${blob.data && blob.data.version}`);
ok('with every charted pin', far.every((id) => blob.data.map.discovered.includes(id)), far.join(', '));
ok('and a fog bitset, not the raw bytes', typeof blob.data.map.fog === 'string' && blob.data.map.fog.length < 4000,
  `${blob.data.map.fog.length} chars for ${fog.mask.length} cells`);

out.push('');
out.push('--- 2. a reload restores it ---');
// Wipe the map back to what a cold boot would leave.
map.discovered.clear();
map.discovered.add('hammerhead'); map.discovered.add('hammerhead_layby');
fog.mask.fill(0);
ok('the map is back to boot state', map.discovered.size === 2 && fog.mask.every((v) => !v),
  `${map.discovered.size} pins, ${fog.mask.reduce((a, v) => a + (v ? 1 : 0), 0)} cells`);
const lr = rpg.loadGame('probe_fog');
ok('the save loads', !!lr.ok, `migrated=${lr.migrated}`);
ok('every pin comes back', far.every((id) => map.discovered.has(id)),
  `${map.discovered.size} pins vs ${disc0.size} saved`);
const seen1 = fog.mask.reduce((a, v) => a + (v ? 1 : 0), 0);
ok('and so does the surveyed wilderness', seen1 === seen0, `${seen1} cells vs ${seen0} saved`);
ok('including the patch off the road network', fog.at(-2400, 2400) > 0.5, `fog.at(-2400,2400) = ${fog.at(-2400, 2400)}`);

out.push('');
out.push('--- 3. a version-3 save still loads ---');
// Written by hand rather than by an old build: the point is the migration
// chain, and `MIGRATIONS[3]` is the arm under test.
const v3 = JSON.parse(JSON.stringify(SG.serialize(rpg)));
delete v3.map;
v3.version = 3;
localStorage.setItem(SG.SAVE_PREFIX + 'probe_v3', JSON.stringify(v3));
const old = SG.load('probe_v3');
ok('it migrates rather than throwing', !!old.ok && old.migrated, `from v${old.from} to v${old.data.version}`);
ok('and lands on the current version', old.data.version === SG.SAVE_VERSION, `version ${old.data.version}`);
ok('with a map block a new game would have', !!old.data.map
  && old.data.map.discovered.length === 2 && old.data.map.discovered.includes('hammerhead'),
  JSON.stringify(old.data.map));
map.discovered.clear();
const lr3 = rpg.loadGame('probe_v3');
ok('and applies without clearing the two starting pins', !!lr3.ok && map.discovered.has('hammerhead'),
  `${map.discovered.size} pins after a v3 load`);

SG.erase('probe_fog'); SG.erase('probe_v3');
out.push('');
out.push(fails.length ? `*** ${fails.length} FAILED: ${fails.join(', ')} ***`
  : 'PASS — the chart survives the tab.');
return out.join('\n');
