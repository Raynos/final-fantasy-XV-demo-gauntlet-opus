/* Can a player walk into a dungeon, open a chest and walk back out? */
const g = window.GAME;
const out = [];
const ix = g.get('Interaction');
const dun = g.get('Dungeons');
const player = g.get('Player');
const terr = g.get('Terrain');
const menus = g.get('Menus');
const rpg = g.get('Rpg') || g.get('RpgSystem');

let _hold = null;
const hold = () => {
  if (!_hold) return;
  player.root.position.set(_hold.x, _hold.y, _hold.z);
  player.heading = _hold.h; player.root.rotation.y = _hold.h;
  if (player.velocity) player.velocity.set(0, 0, 0);
};
const step = (n = 1) => { for (let i = 0; i < n; i++) { hold(); g.frame(1 / 60); hold(); } };
const free = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
/** stand `d` metres out from a world point, facing it */
const standAt = (p, d = 1.6) => {
  const ax = p.x + d, az = p.z;
  _hold = { x: ax, y: (terr.heightAt(ax, az) ?? p.y), z: az, h: Math.atan2(p.x - ax, p.z - az) };
  step(8);
};
/** press E the way the player does: a real key event, not a poked input map */
const press = () => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }));
  step(3);
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE', bubbles: true }));
  step(2);
  _hold = null;
};

g.input.pointerLocked = true;
g.get('Director').play();
g.get('Cinematics')?.stop?.({ skipped: true });
menus.setScreen(null); step(20);
g.get('HUD').setMenuOpen(false); step(4);

out.push(`entrances built: ${dun.entrances.length}`);
for (const e of dun.entrances) out.push(`  ${e.id.padEnd(14)} "${e.verb} ${e.name}" at (${e.pos.x.toFixed(0)}, ${e.pos.z.toFixed(0)}) r${e.radius}`);
out.push(`registered verb: ${dun._verb ? dun._verb.id : 'NONE - nothing wired'}`);
out.push('');

// The same trap the quest waypoints and the spawn tables both fell into: these
// three entrances carry literal coordinates written against the 3 km world,
// while the map, the compass and `at('keycatrich_trench')` all resolve against
// the 8 km one. Reported every run so it cannot go quiet again.
out.push('where the map says each dungeon is, against where its door actually is:');
const { worldMap } = await import('/world/map/WorldMap.ts');
const POI = { keycatrich: 'keycatrich_trench', balouve: 'balouve_mines', fociaugh: 'fociaugh' };
for (const e of dun.entrances) {
  const p = worldMap.poiById(POI[e.id]);
  const d = p ? Math.hypot(p.x - e.pos.x, p.z - e.pos.z) : NaN;
  out.push(`  ${e.id.padEnd(11)} pin (${p.x}, ${p.z})  door (${e.pos.x.toFixed(0)}, ${e.pos.z.toFixed(0)})  ${d.toFixed(0)} m apart${d > 60 ? '   <-- the pin is not on the door' : ''}`);
}
out.push('');

let fails = 0;
const check = (name, ok, extra = '') => { if (!ok) fails++; out.push(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${extra ? `  ${extra}` : ''}`); };

for (const e of dun.entrances) {
  out.push(`-- ${e.id} --`);
  standAt(e.pos, 1.6);
  const sel = ix.current;
  check('walking up to the entrance offers a prompt', !!sel && sel.id === 'dungeon_verb',
    `got ${sel ? `${sel.id} "${sel.verb} ${sel.label}"` : 'nothing'}`);
  if (sel && sel.id === 'dungeon_verb') check('the prompt names this dungeon', sel.label === e.name, `got "${sel.label}"`);

  press();
  // the fade is asynchronous; give it time to land
  free(180);
  check('E puts the party inside', dun.state === 'inside' && dun.current && dun.current.id === e.id,
    `state=${dun.state} current=${dun.current ? dun.current.id : 'null'}`);
  if (dun.state !== 'inside') { out.push(''); continue; }

  // a chest, opened by walking up to it and pressing E
  const chests = dun.current.interactables.filter((i) => i.kind === 'chest' && !i.opened);
  if (chests.length) {
    const c = chests[0];
    const gil0 = rpg && rpg.inventory ? rpg.inventory.gil : 0;
    const wp = c.pos.clone().add(dun.current.origin);
    _hold = { x: wp.x + 1.2, y: wp.y, z: wp.z, h: Math.atan2(-1, 0) };
    step(8);
    const csel = ix.current;
    check('walking up to a chest offers Open', !!csel && csel.id === 'dungeon_verb' && csel.verb === 'Open',
      `got ${csel ? `"${csel.verb} ${csel.label}"` : 'nothing'}`);
    press(); free(6);
    const gil1 = rpg && rpg.inventory ? rpg.inventory.gil : 0;
    check('opening it pays out', c.opened && gil1 >= gil0, `opened=${c.opened} gil ${gil0}->${gil1}`);
  } else out.push('  --   no unopened chest in this interior');

  // the way out
  const exit = dun.current.interactables.find((i) => i.kind === 'exit');
  if (exit) {
    const wp = exit.pos.clone().add(dun.current.origin);
    _hold = { x: wp.x + 1.2, y: wp.y, z: wp.z, h: Math.atan2(-1, 0) };
    step(8);
    const esel = ix.current;
    check('the exit offers a prompt', !!esel && esel.id === 'dungeon_verb',
      `got ${esel ? `"${esel.verb} ${esel.label}"` : 'nothing'}`);
    press(); free(180);
    check('E puts the party back outside', !dun.isInside, `state=${dun.state}`);
  } else check('the interior has a way out', false, 'no exit interactable');
  if (dun.isInside) dun.leave({ instant: true });
  free(4);
  out.push('');
}

out.push(`${fails} failures`);
return out.join('\n');
