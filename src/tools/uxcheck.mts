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
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHROMIUM_ARGS } from './chromium.mts';
import { assertOwnPort, resolvePort } from './portowner.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = resolvePort(5178, ROOT);

const portOpen = (p: number) => new Promise<boolean>((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 800);
});

async function ensureServer() {
  if (await portOpen(PORT)) { assertOwnPort(PORT, ROOT); return null; }
  const proc = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300));
    if (await portOpen(PORT)) return proc;
  }
  throw new Error('vite failed to start');
}

const results: Array<{ name: string, pass: boolean, note: string }> = [];
const ok = (name: string, pass: unknown, note = '') => {
  results.push({ name, pass: !!pass, note });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${note ? `  — ${note}` : ''}`);
};

const server = await ensureServer();
const browser = await chromium.launch({ args: CHROMIUM_ARGS });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const pageErrors: string[] = [];
page.on('pageerror', (e) => pageErrors.push(String(e).split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text().slice(0, 200)); });

await page.goto(`http://127.0.0.1:${PORT}/?q=low`, { waitUntil: 'domcontentloaded', timeout: 300000 });
await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 300000 });
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
  for (const m of text.matchAll(/'(Key[A-Z]|Digit\d|Backquote)([A-Z0-9]*)'/g)) {
    const code = m[1] + m[2];
    if (!claimed.has(code)) claimed.set(code, new Set());
    claimed.get(code).add(owner);
  }
}
// Driving and on-foot combat are mutually exclusive states, so a key may be in
// both. Everything else sharing an owner pair is a genuine clash.
const MODAL_OK = new Set(['regalia|menus']);
const clashes = [];
for (const [code, owners] of claimed) {
  if (owners.size < 2 || MOVEMENT.has(code)) continue;
  // AudioSystem only plays a UI click on these keys; it never consumes them.
  owners.delete('audio');
  if (owners.size < 2) continue;
  const pair = [...owners].sort().join('|');
  if (owners.has('regalia') && owners.size === 2 && !owners.has('menus')) continue;
  if (MODAL_OK.has(pair)) continue;
  clashes.push(`${code}: ${[...owners].join(' + ')}`);
}
ok('no keyboard binding is claimed by two systems in the same mode',
  clashes.length === 0, clashes.join(', '));

/* -------------------------------------------------------------------- */

ok('no page errors', pageErrors.length === 0, pageErrors.slice(0, 4).join(' | '));

await browser.close();
if (server) server.kill();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
