#!/usr/bin/env node
/**
 * Throwaway audit for the controls / menu UX pass.
 *
 * Drives the real page and asserts, on live state:
 *  - every main-menu row opens a screen or is rendered disabled;
 *  - Tab and Backspace close from every screen;
 *  - pointer lock is released when a menu opens, and a click on a menu row
 *    never requests it;
 *  - the Drive prompt appears within interaction range of the Regalia and its
 *    handler really calls `RegaliaSystem.enter()`.
 *
 *   node src/tools/uxcheck.mts
 */
import path from 'node:path';
import { harnessArgs, announceBuild, lease, pageOpts } from './harness.mts';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');



const results: Array<{ name: string, pass: boolean, note: string }> = [];
const ok = (name: string, pass: unknown, note = '') => {
  results.push({ name, pass: !!pass, note });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${note ? `  — ${note}` : ''}`);
};

const ha = harnessArgs(process.argv.slice(2), { q: 'low', play: true });
announceBuild(ha);
const leased = await lease(pageOpts(ha));
const page = leased.page;
const pageErrors: string[] = [];
page.on('pageerror', (e) => pageErrors.push(String(e).split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text().slice(0, 200)); });

await page.evaluate(() => { document.getElementById('boot')?.remove(); });

// Drive the sim from the test rather than rAF, so every assertion is taken on a
// known number of settled frames.
await page.evaluate(() => {
  window.GAME.stop();
  const g = window.GAME;
  g.get('Story')?.title?.hide?.();
  window.step = (n = 30) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
  window.key = (code: string, type = 'keydown') => window.dispatchEvent(
    new KeyboardEvent(type, { code, bubbles: true }));
  window.press = (code: string, frames = 3) => { window.key(code); window.step(1); window.key(code, 'keyup'); window.step(frames); };
});

/* ------------------------------------------------------------------ 1 */
/* every main-menu row routes somewhere real, or is drawn disabled       */

const menuAudit = await page.evaluate(async () => {
  const g = window.GAME;
  const menus = g.get('Menus')!;
  const main = menus.screens.main;
  menus.setScreen('main');
  window.step(40);
  const out = [];
  const rows = main.rows;
  for (let i = 0; i < rows.length; i++) {
    main.i = i;
    window.step(4);
    const e = rows[i].e;
    const live = main._live(e);
    const disabled = rows[i].row.classList.contains('disabled');
    let opened = null;
    if (live) {
      main.accept();
      window.step(30);
      opened = menus.name;
      menus.setScreen('main');
      window.step(30);
    }
    out.push({ key: e.key, label: e.label, to: e.to, live, disabled, opened });
  }
  menus.setScreen(null);
  window.step(30);
  return out;
});

for (const r of menuAudit) {
  const good = r.live ? r.opened === r.to : r.disabled;
  ok(`main-menu row “${r.label}”`, good,
    r.live ? `→ ${r.opened}` : 'rendered disabled');
}

/* ------------------------------------------------------------------ 2 */
/* Tab and Backspace close from every screen                             */

const closeAudit = await page.evaluate(async () => {
  const g = window.GAME;
  const menus = g.get('Menus')!;
  const names = menus.screenNames;
  const out = [];
  for (const n of names) {
    for (const code of ['Tab', 'Backspace', 'Escape']) {
      menus.stack.length = 0;
      menus.setScreen(n);
      window.step(30);
      const openedAs = menus.name;
      window.press(code, 30);
      out.push({ screen: n, code, openedAs, closedTo: menus.name });
      menus.setScreen(null);
      window.step(24);
    }
  }
  return out;
});

for (const c of closeAudit) {
  ok(`${c.code} closes “${c.screen}”`, c.closedTo === null,
    c.closedTo === null ? '' : `still on ${c.closedTo}`);
}

/* ------------------------------------------------------------------ 3 */
/* pointer lock behaviour                                                */

const lock = await page.evaluate(async () => {
  const g = window.GAME;
  const menus = g.get('Menus')!;
  const inp = g.input;
  const out: Record<string, unknown> = {};

  // gameplay: the lock is allowed
  menus.setScreen(null);
  window.step(20);
  out.allowedInField = inp.pointerLockAllowed;

  // a menu releases it
  menus.setScreen('main');
  window.step(20);
  out.allowedInMenu = inp.pointerLockAllowed;

  // a click that lands on a menu row must not request it
  let requested = 0;
  const dom = inp.dom;
  const orig = dom.requestPointerLock;
  dom.requestPointerLock = function spy() { requested++; return Promise.resolve(); };
  const row = document.querySelector<HTMLElement>('#menus .mrow');
  row!.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
  out.requestedFromMenuClick = requested;
  out.attackFromMenuClick = inp.mouse.leftEdge;

  // closing hands it back, and a click on the canvas may take it again
  menus.setScreen(null);
  window.step(30);
  out.allowedAfterClose = inp.pointerLockAllowed;
  requested = 0;
  dom.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
  out.requestedFromCanvasClick = requested;
  dom.requestPointerLock = orig;

  // an unexpected exit opens the pause menu
  inp.lockLost = true;
  window.step(20);
  out.menuAfterLockLost = menus.name;
  menus.setScreen(null);
  window.step(30);
  return out;
});

ok('pointer lock allowed during gameplay', lock.allowedInField === true);
ok('pointer lock released when a menu opens', lock.allowedInMenu === false);
ok('menu click does not request pointer lock', lock.requestedFromMenuClick === 0);
ok('menu click does not register as an attack', lock.attackFromMenuClick === false);
ok('pointer lock re-allowed when the menu closes', lock.allowedAfterClose === true);
ok('canvas click re-acquires pointer lock', lock.requestedFromCanvasClick === 1);
ok('unexpected lock exit opens the pause menu', lock.menuAfterLockLost === 'main');

/* ------------------------------------------------------------------ 4 */
/* the Drive prompt                                                      */

const drive = await page.evaluate(async () => {
  const g = window.GAME;
  const car = g.get('Regalia')!;
  const ix = g.get('Interaction')!;
  const player = g.get('Player')!;
  const out: Record<string, unknown> = { enabled: !!car?.enabled };
  if (!car || !car.enabled) return out;

  const item = ix.get('hh_regalia_bay');
  out.registered = !!item;
  out.followsCar = !!item && item.pos === car.root.position;

  // stand the player just behind the car, facing it
  const b = car.body;
  const fwd = { x: Math.sin(b.heading), z: Math.cos(b.heading) };
  player.position.set(b.pos.x - fwd.x * 2.4, player.position.y, b.pos.z - fwd.z * 2.4);
  player.heading = b.heading;
  window.step(12);

  out.current = ix.current ? `${ix.current.verb} ${ix.current.label}` : null;
  out.promptVisible = ix.appear > 0.5;

  // and the handler really starts the car
  const before = car.isDriving;
  ix.current?.handler(g, ix.current);
  out.enteredFromPrompt = !before && car.isDriving;
  out.autoDrive = car.auto;
  car.exit();
  window.step(10);
  return out;
});

ok('Regalia drive interactable is registered', drive.registered === true);
ok('drive prompt anchors to the live car position', drive.followsCar === true);
ok('“Drive Regalia” prompt raised beside the car', drive.current === 'Drive Regalia', String(drive.current));
ok('drive prompt is actually on screen', drive.promptVisible === true);
ok('prompt handler calls RegaliaSystem.enter()', drive.enteredFromPrompt === true);
ok('walking up does not hand the wheel to Ignis', drive.autoDrive === false);

/* ------------------------------------------------------------------ 5 */
/* the global hotkeys                                                    */

const hotkeys = await page.evaluate(async () => {
  const menus = window.GAME.get('Menus')!;
  const out: Record<string, unknown> = {};
  menus.setScreen(null); window.step(20);
  window.press('KeyH', 30); out.hOpens = menus.name;
  window.press('KeyH', 30); out.hCloses = menus.name;
  window.press('KeyM', 30); out.mOpens = menus.name;
  window.press('KeyM', 30); out.mCloses = menus.name;
  // and from inside another screen, which it must return to on the way out
  menus.setScreen('inventory'); window.step(30);
  window.press('KeyH', 30); out.hFromScreen = menus.name;
  window.press('KeyH', 40); out.hBackToScreen = menus.name;
  menus.setScreen(null); window.step(30);
  return out;
});

ok('H opens the controls card', hotkeys.hOpens === 'controls', String(hotkeys.hOpens));
ok('H closes it again', hotkeys.hCloses === null, String(hotkeys.hCloses));
ok('M opens the world map', hotkeys.mOpens === 'world', String(hotkeys.mOpens));
ok('M closes it again', hotkeys.mCloses === null, String(hotkeys.mCloses));
ok('H works from inside another screen', hotkeys.hFromScreen === 'controls', String(hotkeys.hFromScreen));
ok('closing the card returns to the screen underneath', hotkeys.hBackToScreen === 'inventory', String(hotkeys.hBackToScreen));

/* ------------------------------------------------------------------ 6 */
/* the screens that used to be dead now do something                     */

const live = await page.evaluate(async () => {
  const g = window.GAME;
  const menus = g.get('Menus')!;
  const rpg = g.get('Rpg')!;
  const out: Record<string, unknown> = {};

  // quests: Enter tracks
  menus.setScreen('quests'); window.step(40);
  const qs = menus.screens.quests;
  qs.tab = 0; qs.i = 0; window.step(6);
  const target = qs._rows[0]?.id;
  rpg.quests.track('__none__');
  qs.accept(); window.step(6);
  out.questTracked = rpg.quests.tracked === target;

  // items: Enter uses one
  menus.setScreen('inventory'); window.step(40);
  const inv = menus.screens.inventory;
  inv.tab = 0; inv.i = 0; window.step(8);
  const it = inv.items[0];
  const before = rpg.inventory.count(it.id);
  const hurt = rpg.party.roster[0];
  hurt.hp = Math.max(1, Math.round(hurt.maxHp * 0.4));
  inv.accept(); window.step(6);
  out.itemUsed = rpg.inventory.count(it.id) === before - 1;

  // gear: Enter opens a picker, Enter again equips
  menus.setScreen('gear'); window.step(40);
  const gear = menus.screens.gear;
  gear.i = 0; gear.j = 0; window.step(6);
  gear.accept(); window.step(6);
  const picker = gear.picker;
  out.gearPicker = !!picker && picker.rows.length > 0;
  const wanted = picker?.rows.find((r) => r.id);
  if (picker && wanted) {
    picker.i = picker.rows.indexOf(wanted);
    gear.accept(); window.step(6);
    out.gearEquipped = rpg.inventory.equipped('noctis').weapon[0]?.id === wanted.id;
  }
  out.gearPickerClosed = !gear.picker;

  // system: sliders and toggles move real engine state
  menus.setScreen('system'); window.step(40);
  const sys = menus.screens.system;
  const iy = sys.nodes.findIndex((n: { row: { key: string } }) => n.row.key === 'invertY');
  sys.i = iy; sys.accept(); window.step(4);
  out.invertY = g.input.invertY === true;
  sys.accept(); window.step(4);
  const q = sys.nodes.findIndex((n: { row: { key: string } }) => n.row.key === 'quality');
  sys.i = q; const q0 = g.rnd.quality; sys.nav(1, 0); window.step(4);
  out.qualityChanged = g.rnd.quality !== q0;
  const v = sys.nodes.findIndex((n: { row: { key: string } }) => n.row.key === 'master');
  const audio = g.get('Audio');
  sys.i = v; const v0 = audio?.volumeOf('master'); sys.nav(-1, 0); window.step(4);
  out.volumeChanged = audio ? audio.volumeOf('master') !== v0 : 'no-audio';

  // armiger: real nodes off the ascension grid
  menus.setScreen('armiger'); window.step(40);
  out.armigerRows = menus.screens.armiger._rows.length;

  // archives: real species registry
  menus.setScreen('archives'); window.step(40);
  out.archiveRows = menus.screens.archives._rows.length;

  menus.setScreen(null); window.step(30);
  return out;
});

ok('Quests: Enter tracks the selected quest', live.questTracked === true);
ok('Items: Enter uses the selected item', live.itemUsed === true);
ok('Gear: Enter opens the equip picker', live.gearPicker === true);
ok('Gear: Enter equips the chosen armament', live.gearEquipped === true);
ok('Gear: the picker closes after equipping', live.gearPickerClosed === true);
ok('System: invert-Y writes to Input', live.invertY === true);
ok('System: quality tier writes to Renderer', live.qualityChanged === true);
ok('System: volume writes to AudioSystem', live.volumeChanged === true, String(live.volumeChanged));
ok('Armiger: lists the real constellation', Number(live.armigerRows) > 0, `${live.armigerRows} nodes`);
ok('Archives: lists the real bestiary', Number(live.archiveRows) > 0, `${live.archiveRows} species`);

/* ------------------------------------------------------------------ 7 */
/* first-run hints                                                       */

const hints = await page.evaluate(async () => {
  const g = window.GAME;
  const hud = g.get('HUD')!;
  const menus = g.get('Menus')!;
  const h = hud.hints;
  const out: Record<string, unknown> = {};
  g.currentShot = null;
  h.reset(); h.muted = false;
  menus.setScreen(null);
  window.step(10);
  out.boot = h.cur?.id || null;
  out.bootText = h.cur ? h.ttl.textContent : '';
  h.reset();
  menus.setScreen('main'); window.step(10);
  out.menu = h.cur?.id || null;
  menus.setScreen(null); window.step(20);
  // and it is a *first*-run hint: showing it twice is a no-op
  const again = h.show('menu', 'x', 'y');
  out.repeats = again;
  // muted during a capture
  h.reset(); h.muted = true;
  out.mutedShows = h.show('boot', 'x', 'y');
  h.muted = false; h.reset();
  return out;
});

ok('a hint greets the player on the first field frame', hints.boot === 'boot', String(hints.bootText ?? ''));
ok('a hint explains how to leave the first menu', hints.menu === 'menu');
ok('hints fire once only', hints.repeats === false);
ok('hints are suppressed during a capture', hints.mutedShows === false);

/* ---------------------------------------------------------------- 7.5 */
/* driving is a MODE, and this is what makes section 8 allowed to say so */

// Section 8 below permits combat and the Regalia to share a key. That
// permission used to be a comment -- "driving and on-foot combat are mutually
// exclusive states" -- asserting a modality the code did not implement, and
// four live collisions passed underneath it. It is a measurement now: drive
// the car, press the shared keys, and watch whether any combat verb answers;
// then get out and watch that every one of them does. The second half is not
// optional. A mode guard is one `&&` away from switching combat off entirely,
// and "no combat verb fired" is exactly what the first half asserts.
const modal = await page.evaluate(async () => {
  const g = window.GAME;
  const car = g.get('Regalia')!;
  // Indexed by verb name below, so it is deliberately loosened here: the
  // typed `CombatSystem` has no index signature and this check's whole method
  // is to wrap five methods chosen by name.
  const cbt = (g.get('Combat') || g.get('CombatSystem')) as unknown as Record<string, Function> & { isDriving?: boolean };
  const inp = g.input;
  const out: Record<string, unknown> = {};
  if (!car || !cbt) { out.missing = true; return out; }

  const VERBS = ['heavy', 'dodge', 'drawEnergy', 'castSlot', 'setLockOn'];
  const calls: Record<string, number> = {};
  const orig: Record<string, Function> = {};
  for (const v of VERBS) {
    if (typeof cbt[v] !== 'function') continue;
    orig[v] = cbt[v];
    calls[v] = 0;
    cbt[v] = function (...a: unknown[]) { calls[v]++; return orig[v].apply(this, a); };
  }
  // Counting CALLS, not outcomes: `setLockOn(autoTarget())` with no enemy
  // nearby changes nothing observable, and an outcome-based version of this
  // check would have called that "no collision".
  const mash = () => {
    for (const k of ['KeyV', 'KeyT', 'KeyB', 'Space', 'KeyF']) {
      inp.pressed.add(k);
      g.frame(1 / 60);
      window.step(4);
    }
  };

  car.enter(false);
  window.step(20);
  out.drivingBefore = car.isDriving;
  mash();
  out.whileDriving = VERBS.reduce((n, v) => n + (calls[v] || 0), 0);

  if (car.isDriving) car.exit();
  window.step(20);
  out.drivingAfter = car.isDriving;
  for (const v of VERBS) calls[v] = 0;
  mash();
  out.onFoot = VERBS.filter((v) => (calls[v] || 0) > 0).length;
  out.onFootTotal = VERBS.length;

  for (const v of Object.keys(orig)) cbt[v] = orig[v];
  if (car.isDriving) car.exit();
  window.step(10);
  return out;
});

ok('combat does not read the keyboard while driving',
  modal.whileDriving === 0, `${modal.whileDriving} combat verb calls from V/T/B/Space/F in the car`);
ok('and every one of those verbs still fires on foot',
  modal.onFoot === modal.onFootTotal, `${modal.onFoot}/${modal.onFootTotal} answered outside the car`);

/* ------------------------------------------------------------------ 8 */
/* the keymap is collision-free across the systems that share a mode     */

const SRC = {
  combat: 'src/combat/CombatSystem.ts',
  party: 'src/characters/ai/PartyAI.ts',
  menus: 'src/ui/Menus.ts',
  regalia: 'src/world/vehicle/RegaliaSystem.ts',
  audio: 'src/audio/AudioSystem.ts',
};
// WASD is move / drive / menu-cursor by universal convention; those are modal
// and are not what "collision" means here.
const MOVEMENT = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
const { readFile } = await import('node:fs/promises');
const claimed = new Map();
for (const [owner, file] of Object.entries(SRC)) {
  const text = await readFile(path.join(ROOT, file), 'utf8');
  // `Space` is in the pattern now. It was not, so the one collision in this
  // game that a player can SEE -- handbrake and dodge roll on the same key,
  // `state: idle -> dodge` while driving -- was invisible to the check that
  // exists to find collisions.
  for (const m of text.matchAll(/'(Key[A-Z]|Digit\d|Backquote|Space)([A-Z0-9]*)'/g)) {
    const code = m[1] + m[2];
    if (!claimed.has(code)) claimed.set(code, new Set());
    claimed.get(code).add(owner);
  }
}
/**
 * **A modal exemption has to be earned by a measurement, not by a comment.**
 *
 * This gate has always let combat and the Regalia share a key, on the strength
 * of a comment reading "Driving and on-foot combat are mutually exclusive
 * states, so a key may be in both". They were not mutually exclusive. Nothing
 * in the tree implemented that modality: `CombatSystem.update` gated its input
 * read on `input.enabled` and its own `scenarioLock`, and `isDriving` had
 * three readers, all UI. Four collisions were live underneath the exemption —
 * V lock-on vs the drive camera, T deposit-draw vs Type-D, B the third
 * Elemancy slot vs the radio, F the heavy attack vs getting out — plus Space,
 * which the gate could not even see because `Space` was not in its pattern.
 *
 * `CombatSystem.update` implements the mode now, and section 7.5 above
 * measures it in the running game each time this gate runs: no combat verb
 * answers V/T/B/Space/F from the driver's seat, and every one of them still
 * answers on foot. **That pair of assertions is what licenses the exemption
 * below.** If 7.5 goes red, the exemption is void and every shared key here is
 * a real collision again — which is why they are next to each other in this
 * file rather than the exemption sitting alone with a comment.
 */
const MODAL_OK = new Set(['regalia|menus', 'combat|regalia', 'combat|menus|regalia']);
const clashes = [];
for (const [code, owners] of claimed) {
  if (owners.size < 2 || MOVEMENT.has(code)) continue;
  // AudioSystem only plays a UI click on these keys; it never consumes them.
  owners.delete('audio');
  if (owners.size < 2) continue;
  const pair = [...owners].sort().join('|');
  if (MODAL_OK.has(pair)) continue;
  clashes.push(`${code}: ${[...owners].join(' + ')}`);
}
ok('no keyboard binding is claimed by two systems in the same mode',
  clashes.length === 0, clashes.length ? clashes.join(', ')
    : 'cross-mode pairs allowed only because 7.5 measured the mode');

/* -------------------------------------------------------------------- */

ok('no page errors', pageErrors.length === 0, pageErrors.slice(0, 4).join(' | '));

await leased.release();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
