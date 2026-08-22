/* Phase-4 step 0 re-audit: behavioural probes for the player path the two
 * gates only assert structurally. Run with:
 *   PORT=5340 node src/tools/probe.mts src/tools/probes/reaudit.mts
 * Read as a function body in the page — a top-level `return` is correct. */
const g = window.GAME;
const out = [];
/* A teleported player drifts out of an interactable's reach within a frame —
 * the collision body settles him and the prompt is dropped before the key is
 * read. Everything that stands somewhere pins him there. */
let _hold = null;
const hold = () => {
  if (!_hold) return;
  const p = g.get('Player');
  p.root.position.set(_hold.x, _hold.y, _hold.z);
  p.heading = _hold.h; p.root.rotation.y = _hold.h;
  if (p.velocity) p.velocity.set(0, 0, 0);
};
const step = (n = 1) => { for (let i = 0; i < n; i++) { hold(); g.frame(1 / 60); hold(); } };
const place = (x, z, h = 0) => {
  _hold = { x, y: g.get('Terrain').heightAt(x, z), z, h };
  hold();
  step(6);
};
const say = (name, verdict, evidence) => out.push(`${verdict.padEnd(6)} ${String(name).padEnd(46)} ${evidence}`);
const T = (n, e) => say(n, 'PASS', e);
const F = (n, e) => say(n, 'FAIL', e);
const W = (n, e) => say(n, 'WEAK', e);
const run = (name, fn) => { try { fn(); } catch (e) { F(name, 'threw: ' + (e && e.message)); } };

const input = g.input;
input.pointerLocked = true;
const keyDown = (code) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
const keyUp = (code) => window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
const tap = (code, frames = 1) => { keyDown(code); step(frames); keyUp(code); step(1); };

const rpg = g.get('Rpg'), enemies = g.get('Enemies'), combat = g.get('Combat');
const player = g.get('Player'), party = g.get('Party'), enc = g.get('Encounters');
const ix = g.get('Interaction'), town = g.get('Town'), menus = g.get('Menus');
const dir = g.get('Director'), hud = g.get('HUD'), pai = g.get('PartyAI');
const V3 = g.camera.position.constructor;

dir.play();
g.get('Story')?.applyShot?.(null);
g.get('Cinematics')?.stop?.({ skipped: true });
menus.setScreen(null);
step(30);
hud.setMenuOpen(false);
step(4);


/* ==================== 1. roaming encounters during traversal ============ */
run('roamers spawn while walking the field', () => {
  const before = enemies.alive ? enemies.alive().length : 0;
  enc.suppressRoamers = false;
  enc.enabled = true;
  enc.budget = 28;
  let spawned = 0; const states = new Set();
  const start = { x: player.position.x, z: player.position.z };
  for (let hop = 0; hop < 12; hop++) {
    place(start.x + hop * 60, start.z - hop * 40);
    step(120);
    const n = enemies.alive ? enemies.alive().length : 0;
    spawned = Math.max(spawned, n);
    states.add(enc.state);
  }
  const terr = enc.active ? enc.active.size : 0;
  if (spawned > before) T('roamers spawn while walking the field',
    `max ${spawned} live creatures, ${terr} territories active, states {${[...states].join(',')}}`);
  else F('roamers spawn while walking the field', `never exceeded ${before} live creatures in 12 hops (${terr} territories)`);
});

/* ==================== 2. aggro pulls the world into combat ============== */
run('aggro pulls the world into combat', () => {
  const live = enemies.alive ? enemies.alive() : [];
  if (!live.length) { W('aggro pulls the world into combat', 'no live enemy to test with'); return; }
  const e = live[0];
  place(e.root.position.x + 6, e.root.position.z);
  let entered = false;
  for (let i = 0; i < 240 && !entered; i++) { step(1); if (enc.state === 'combat') entered = true; }
  entered ? T('aggro pulls the world into combat', `state=combat after standing 6 m from ${e.name}`)
    : F('aggro pulls the world into combat', `stood 6 m from ${e.name} for 4 s, state stayed "${enc.state}"`);
});

/* ==================== 3. companions actually damage things ============== */
run('companions damage enemies with no player input', () => {
  enc.suppressRoamers = true;
  enc.budget = 0;
  for (const id of [...enc.active.keys()]) enc.deactivate(id);
  enc.packs.length = 0;
  enemies.clear(); step(2);
  const f = new V3(0, 0, 1);
  const p = player.position.clone().addScaledVector(f, 7);
  const e = enemies.spawn('sabertusk', { pos: p, heading: Math.PI });
  e.target = player; e.awareness = 1; e.setState('chase');
  for (const m of party.members) m.root.position.copy(player.position).add(new V3((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 3));
  let strikes = 0;
  const off = () => { strikes++; };
  window.addEventListener('party:strike', off);
  const hp0 = e.hp;
  step(900);
  window.removeEventListener('party:strike', off);
  const dealt = hp0 - e.hp;
  if (dealt > 0) T('companions damage enemies with no player input',
    `${dealt} hp of ${hp0} removed in 15 s hands-off (party:strike x${strikes})`);
  else F('companions damage enemies with no player input',
    `enemy hp unchanged at ${hp0} after 15 s (party:strike x${strikes}, alive=${!e.dead})`);
});

/* ==================== 4. interaction: caravan rest ====================== */
run('E at the caravan actually rests', () => {
  const A = town.anchors;
  if (!A || !A.caravan) { F('E at the caravan actually rests', 'no caravan anchor'); return; }
  const c = A.caravan;
  place(c.x - 1.4, c.z, Math.atan2(1, 0));
  step(10);
  const cur = ix.current;
  if (!cur || cur.id !== 'hh_caravan') { F('E at the caravan actually rests', `prompt is "${cur && cur.id}" not the caravan`); return; }
  const gil0 = rpg.inventory.gil, day0 = rpg.day.day, lv0 = rpg.noctis.level;
  rpg.gainExp(60000);
  const bank0 = rpg.expBank.banked;
  tap('KeyE'); step(20);
  const talking = ix.talking;
  for (let i = 0; i < 8 && !(ix.dialogue._visibleChoices && ix.dialogue._visibleChoices().length); i++) { tap('KeyE'); step(10); }
  const choices = ix.dialogue._visibleChoices ? ix.dialogue._visibleChoices() : [];
  tap('KeyE'); step(30);
  const gil1 = rpg.inventory.gil, day1 = rpg.day.day, lv1 = rpg.noctis.level;
  const bank1 = rpg.expBank.banked;
  if (day1 > day0 && bank1 < bank0) T('E at the caravan actually rests',
    `day ${day0}->${day1}, gil ${gil0}->${gil1}, banked ${Math.round(bank0)}->${Math.round(bank1)}, level ${lv0}->${lv1}`);
  else F('E at the caravan actually rests',
    `day ${day0}->${day1}, gil ${gil0}->${gil1}, banked ${Math.round(bank0)}->${Math.round(bank1)}, choices=${choices.length}, talking=${talking}`);
  if (ix.dialogue.active) ix.dialogue.end();
  step(4);
});

/* ==================== 5. shop: E, buy, gil down, item in bag ============ */
run('E at the diner buys an item for real gil', () => {
  const c = town.anchors.dinerCounter;
  if (!c) { F('E at the diner buys an item for real gil', 'no dinerCounter anchor'); return; }
  place(c.x - 1.3, c.z, Math.atan2(1, 0));
  step(10);
  const cur = ix.current;
  if (!cur || cur.verb !== 'Shop') { F('E at the diner buys an item for real gil', `prompt is "${cur && cur.id}"`); return; }
  tap('KeyE'); step(20);
  if (menus.name !== 'shop') { F('E at the diner buys an item for real gil', `menu is "${menus.name}"`); return; }
  const screen = menus.screens.shop;
  const gil0 = rpg.inventory.gil;
  const row = (screen._rows || [])[screen.i];
  const held0 = row ? rpg.inventory.count(row.def.id) : -1;
  tap('Enter'); step(12);
  const gil1 = rpg.inventory.gil;
  const held1 = row ? rpg.inventory.count(row.def.id) : -1;
  if (gil1 < gil0 && held1 > held0) T('E at the diner buys an item for real gil',
    `bought ${row.def.name}: gil ${gil0}->${gil1}, held ${held0}->${held1}`);
  else F('E at the diner buys an item for real gil',
    `row=${row && row.def && row.def.name} gil ${gil0}->${gil1} held ${held0}->${held1}`);
  menus.setScreen(null); step(6);
});

/* ==================== 6. hunt board: accept -> quest log ================ */
run('hunt board accepts a bounty into the quest log', () => {
  const c = town.anchors.huntBoard;
  place(c.x - 1.3, c.z, Math.atan2(1, 0));
  step(10);
  const cur = ix.current;
  if (!cur || cur.verb !== 'Hunts') { F('hunt board accepts a bounty into the quest log', `prompt is "${cur && cur.id}"`); return; }
  tap('KeyE'); step(20);
  if (menus.name !== 'hunts') { F('hunt board accepts a bounty into the quest log', `menu is "${menus.name}"`); return; }
  const active0 = rpg.quests.byStatus('active').length;
  let accepted = null;
  for (let i = 0; i < 8; i++) {
    tap('Enter'); step(8);
    const a = rpg.quests.byStatus('active');
    if (a.length > active0) { accepted = a[a.length - 1]; break; }
    tap('ArrowDown'); step(4);
  }
  accepted ? T('hunt board accepts a bounty into the quest log', `accepted "${accepted.name || accepted.id}"`)
    : F('hunt board accepts a bounty into the quest log', `${active0} active quests before and after 8 Enter presses`);
  menus.setScreen(null); step(6);
});

/* ==================== 7. hunt completes and pays ======================== */
run('killing the hunt target completes it and pays', () => {
  const act = rpg.quests.byStatus('active');
  const hunt = act.find((q) => q.kind === 'hunt' || q.type === 'hunt') || act[0];
  if (!hunt) { W('killing the hunt target completes it and pays', 'no active hunt to close'); return; }
  const gil0 = rpg.inventory.gil;
  enc.suppressRoamers = true;
  let spawnedHunt = null;
  try { spawnedHunt = enc.spawnHunt(hunt.id); } catch (e) { spawnedHunt = 'threw: ' + e.message; }
  step(30);
  const live = enemies.alive ? enemies.alive() : [];
  const up = new V3(0, 1, 0);
  for (const e of live) { for (let i = 0; i < 40 && !e.dead; i++) { e.hit(99999, up, {}); step(1); } }
  step(60);
  const still = rpg.quests.byStatus('active').find((q) => q.id === hunt.id);
  const gil1 = rpg.inventory.gil;
  if (!still) T('killing the hunt target completes it and pays', `"${hunt.id}" closed, gil ${gil0}->${gil1}`);
  else W('killing the hunt target completes it and pays',
    `spawnHunt->${spawnedHunt ? 'ok' : 'nothing'}, killed ${live.length}, "${hunt.id}" still active, gil ${gil0}->${gil1}`);
});

/* ==================== 8. camping at a haven ============================ */
run('camping at a haven is reachable', () => {
  const ids = [...ix.items.keys()];
  const campy = ids.filter((k) => /camp|haven|tent|fire/i.test(k));
  const near = rpg.day.nearestHaven({ x: player.position.x, z: player.position.z });
  const res = rpg.camp({ lodging: 'haven', pos: near ? { x: near.x, z: near.z } : null });
  if (campy.length) T('camping at a haven is reachable', `interactables ${campy.join(',')}; rpg.camp -> ${JSON.stringify(res).slice(0, 120)}`);
  else F('camping at a haven is reachable',
    `no camp/haven interactable among ${ids.length} registered (${ids.slice(0, 10).join(',')}); rpg.camp() -> ${JSON.stringify(res).slice(0, 160)}`);
});

/* ==================== 9. cooking ======================================= */
run('cooking a meal is reachable in play', () => {
  const has = typeof rpg.party.cook === 'function';
  const screens = Object.keys(menus.screens || {});
  const cookScreen = screens.filter((s) => /cook|camp|meal/i.test(s));
  cookScreen.length ? T('cooking a meal is reachable in play', `screens: ${cookScreen.join(',')}`)
    : F('cooking a meal is reachable in play', `PartyState.cook=${has} but no cook/camp screen among [${screens.join(', ')}]`);
});

/* ==================== 10. AP spend changes a real number =============== */
run('spending AP makes a warp-strike hit harder', () => {
  const asc = rpg.ascension;
  const e = enemies.alive()[0] || enemies.spawn('sabertusk', { pos: player.position.clone() });
  const roll = () => rpg.damage({ attacker: 'noctis', defender: e, motion: 1, isWarpStrike: true, crit: false, variance: 0 });
  const before = roll();
  const node = 'cbt_warpdmg1';
  if (asc.isUnlocked(node)) { W('spending AP makes a warp-strike hit harder', `${node} already unlocked; warpDamage=${asc.value('warpDamage')}`); return; }
  const res = asc.unlock(node);
  rpg.refreshDerived();
  const after = roll();
  (after.damage ?? after) > (before.damage ?? before)
    ? T('spending AP makes a warp-strike hit harder', `${node} (${res.ok ? 'ok' : res.reason}): ${JSON.stringify(before.damage ?? before)} -> ${JSON.stringify(after.damage ?? after)}, warpDamage=${asc.value('warpDamage')}`)
    : F('spending AP makes a warp-strike hit harder', `${node} -> ${res.ok ? 'ok' : res.reason}; damage ${JSON.stringify(before.damage ?? before)} -> ${JSON.stringify(after.damage ?? after)}`);
});

/* ==================== 11. HUD quest tracker ============================ */
run('HUD tracks a real objective with a real distance', () => {
  const s = rpg.hudState();
  const t = s.tracked;
  const wp = s.waypoints;
  t ? T('HUD tracks a real objective with a real distance',
    `"${t.name || t.title}" — ${t.objective || (t.steps && t.steps[0] && t.steps[0].text)} · ${wp && wp.length ? Math.round(wp[0].dist ?? -1) + ' m' : 'no waypoint'}`)
    : F('HUD tracks a real objective with a real distance', `hudState().tracked is ${JSON.stringify(t)}`);
});

/* ==================== 12. NPC dialogue ================================= */
run('an NPC can be talked to', () => {
  const npcs = g.get('Npcs');
  const list = npcs.list || npcs.npcs || [];
  const n = list[0];
  if (!n) { F('an NPC can be talked to', 'no npcs'); return; }
  const p = n.root ? n.root.position : n.pos;
  place(p.x - 1.2, p.z, Math.atan2(1.2, 0));
  step(10);
  const cur = ix.current;
  if (!cur) { F('an NPC can be talked to', `nothing selected standing 1.2 m from ${n.name || n.id}`); return; }
  tap('KeyE'); step(20);
  const talking = ix.talking;
  talking ? T('an NPC can be talked to', `"${cur.label}" -> dialogue open`)
    : F('an NPC can be talked to', `"${cur.label}" prompt but E opened nothing (menu=${menus.name})`);
  if (ix.dialogue.active) ix.dialogue.end();
  step(4);
});

/* ==================== 13. inventory listByCategory ===================== */
run('inventory listByCategory returns curatives', () => {
  const inv = rpg.inventory;
  const cur = inv.listByCategory ? inv.listByCategory('curative') : null;
  (cur && cur.length) ? T('inventory listByCategory returns curatives', `${cur.length} curative stacks`)
    : F('inventory listByCategory returns curatives', `listByCategory('curative') -> ${JSON.stringify(cur)}`);
});

return out.join('\n');
