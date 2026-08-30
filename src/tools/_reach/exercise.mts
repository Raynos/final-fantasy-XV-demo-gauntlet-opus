/*
 * Drive the game the way a human would, with real key events.
 *
 * This is the half that decides what "reached" means. A census taken while the
 * game merely *renders* would call half the gameplay dead; a census taken while
 * a script calls methods directly would call all of it alive and prove nothing.
 * So: real `KeyboardEvent`s through the same listeners a player's keyboard hits,
 * and the interaction/menu/camp/fight paths a player actually walks.
 *
 * Evaluated as a function body in the page, after `instrument.mts`.
 */
const g = window.GAME;
const player = g.get('Player');
const rpg = g.get('Rpg');
const ix = g.get('Interaction');
const menus = g.get('Menus');
const enc = g.get('Encounters');

const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
const key = (code, held = 2) => {
  window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
  step(held);
  window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  step(1);
};

// --- render paths: every scenario, every weather, day and night -------------
for (const shot of ['hud_field', 'vista_dawn', 'storm', 'vista_night', 'combat_wide',
  'town_wide', 'zone_fallgrove', 'poi_fishing', 'menu_map', 'regalia_drive']) {
  try { g.applyShot(shot); g.settle(8); } catch (e) { /* a missing shot is not this tool's problem */ }
}

// --- movement --------------------------------------------------------------
try {
  g.applyShot('hud_field'); g.settle(4);
  for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'Space']) key(k, 6);
} catch (e) { /* keep going */ }

// --- menus, every screen ---------------------------------------------------
try {
  for (const screen of ['main', 'inventory', 'gear', 'ascension', 'map', 'quests',
    'hunts', 'shop', 'armiger', 'archive', 'elemancy', 'photo', 'system', 'controls']) {
    if (menus && menus.setScreen) { menus.setScreen(screen); step(4); }
  }
  if (menus && menus.setScreen) menus.setScreen(null);
  for (const k of ['Tab', 'KeyM', 'KeyC', 'KeyH']) key(k, 4);
  if (menus && menus.setScreen) menus.setScreen(null);
  step(4);
} catch (e) { /* keep going */ }

// --- combat: a real fight, driven ------------------------------------------
try {
  g.applyShot('combat_wide'); g.settle(10);
  for (let i = 0; i < 3; i++) { key('KeyJ', 8); key('KeyK', 8); key('KeyL', 6); }
  key('KeyG', 6);
  step(90);
} catch (e) { /* keep going */ }

// --- interaction, camp, fishing, elemancy ----------------------------------
try {
  if (rpg && rpg.restAt) rpg.restAt('caravan', { wakeHour: 6.5 });
  const havens = rpg && rpg.day && rpg.day.havens && rpg.day.havens();
  if (havens && havens.length) {
    const h = havens[0];
    // With a recipe, so the cook path runs. Camping without one exercises the
    // clock and the EXP bank and silently skips `PartyState.cook` — which is
    // exactly the kind of half-walked path this tool exists to catch.
    const cookable = rpg.party && rpg.party.cookableNow && rpg.party.cookableNow(rpg.inventory);
    rpg.camp({
      lodging: 'haven', pos: { x: h.pos[0], z: h.pos[2] },
      recipe: cookable && cookable.length ? cookable[0].id : undefined,
    });
  }
  // Elemancy: draw from a deposit and craft, which is the loop that had no door
  // in the game at all until this session.
  if (rpg && rpg.craftSpell) {
    try {
      const dep = rpg.elemancy && rpg.elemancy.deposits && rpg.elemancy.deposits[0];
      if (dep && rpg.drawEnergy) rpg.drawEnergy(dep.id ?? dep, 40);
      rpg.craftSpell({ element: 'fire', potency: 30 });
    } catch (e) { /* keep going */ }
  }
  // Magic and the Armiger, through the combat system rather than a screen.
  const combat = g.get('Combat');
  if (combat) {
    try { if (combat.cast) combat.cast('fire'); step(20); } catch (e) { /* keep going */ }
    try { if (combat.armigerStart) combat.armigerStart(); step(20); } catch (e) { /* keep going */ }
    try { if (combat.lockOn) combat.lockOn(null); } catch (e) { /* keep going */ }
  }
  step(20);
  if (ix && ix.items) {
    let n = 0;
    for (const [, item] of ix.items) {
      if (n++ > 24) break;
      try { if (item && item.handler) item.handler(); step(2); } catch (e) { /* one bad prompt is not fatal */ }
      if (menus && menus.setScreen) menus.setScreen(null);
      if (ix.close) ix.close();
      step(1);
    }
  }
} catch (e) { /* keep going */ }

// --- the quest log: accept, complete, advance a chapter ---------------------
// `QuestLog.accept`, `QuestLog.complete`, `RpgSystem.gainExp` and
// `StorySystem.completeChapter` used to be reached BY ACCIDENT. The mid-game
// seed pre-satisfied two of chapter 1's three objectives -- `hunt_killer_wasps`
// pre-complete, 42,180 gil against a `gil:1500` fetch -- so calling Takka's
// talk handler in the interactable sweep above closed the quest, closed the
// chapter and paid out, all on its own. Nothing in this file ever asked for it.
//
// Part D task 50 removed that self-completion, which is the correct change and
// which took the only thing in this exercise that ever finished a quest with
// it. Reaching a path by accident is precisely the failure this tool exists to
// catch, so chapter 1 is now walked deliberately, through the real methods a
// player's inputs reach.
try {
  g.get('Story')?._resume?.();
  const q = rpg.quests;
  // 1. accept -- something genuinely `available`, through the real method.
  for (const id of ['hunt_dualhorn', 'hunt_killer_wasps', 'side_engine_blade', 'hunt_sabertusks']) {
    if (q.status(id) === 'available') { q.accept(id); break; }
  }
  // 2. the chapter-1 acts, in the order the log makes you do them.
  q.notify('talk', { target: 'takka' });
  const bounty = q.def('main_ch1_pauper')?.objectives.find((o) => o.type === 'quest');
  const huntId = bounty ? bounty.target : 'hunt_sabertusks';
  if (q.status(huntId) === 'available') q.accept(huntId);
  const kill = q.def(huntId)?.objectives.find((o) => o.type === 'kill');
  if (kill) {
    // The real kill path: this is what pays EXP, so `RpgSystem.gainExp` runs
    // here and not because a reward object happened to carry one.
    for (let i = 0; i < (kill.count || 1); i++) {
      rpg.enemyKilled({ id: kill.target, level: 8, expClass: 'normal', drops: [] }, {});
    }
  }
  const buy = q.def('main_ch1_pauper')?.objectives.find((o) => o.type === 'buy');
  if (buy && rpg.inventory && rpg.inventory.buy) rpg.inventory.buy('iron_sword', 1);
  q.notify('talk', { target: 'cindy' });
  // 3. the chapter card is queued at +1.4 s; give it time to fire.
  step(150);
} catch (e) { /* keep going */ }

// --- set piece: the path that had never executed ---------------------------
try {
  g.applyShot('setpiece_deadeye'); g.settle(120);
} catch (e) { /* keep going */ }
try {
  if (enc && enc.startSetPiece) {
    // Long enough for the fight to reach a landed strike. `resolveStrike` had
    // never executed in play *or* in the harness until this session, so a set
    // piece that merely spawns proves nothing.
    enc.startSetPiece('titan');
    step(600);
    enc.endBoss(false);
  }
} catch (e) { /* keep going */ }

// --- dungeons --------------------------------------------------------------
try {
  const dg = g.get('Dungeons');
  if (dg && dg.list) {
    for (const d of (dg.list.slice ? dg.list.slice(0, 2) : [])) {
      if (dg.enter) { dg.enter(d.id || d); step(30); }
      if (dg.exit) { dg.exit(); step(10); }
    }
  }
} catch (e) { /* keep going */ }

// --- back to a field frame, and settle -------------------------------------
try { g.applyShot('hud_field'); g.settle(30); } catch (e) { /* done */ }
return true;
