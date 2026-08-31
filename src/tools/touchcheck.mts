#!/usr/bin/env node
/**
 * The on-screen control layer, driven through real DOM pointer events.
 *
 * Asserts on live game state, never on the DOM alone: a button "works" when
 * the thing it names happens in the world, so the chocobo rows read
 * `ChocoboSystem.state` and the driving rows read the chassis' own `vLong`.
 *
 * Loads `?touch=1`, which is the one flag not gated on `?shoot` — the layer
 * renders nothing into the world, so no capture can see it, and this gate
 * needs a way in from a desktop-shaped headless page.
 *
 *   node src/tools/touchcheck.mts
 */
import { harnessArgs, announceBuild, lease, pageOpts } from './harness.mts';

const results: Array<{ name: string, pass: boolean, note: string }> = [];
const ok = (name: string, pass: unknown, note = '') => {
  results.push({ name, pass: !!pass, note });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${note ? `  — ${note}` : ''}`);
};

const ha = harnessArgs(process.argv.slice(2), { q: 'low', play: true, extra: 'touch=1' });
announceBuild(ha);
const leased = await lease(pageOpts(ha));
const page = leased.page;
const pageErrors: string[] = [];
page.on('pageerror', (e) => pageErrors.push(String(e).split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text().slice(0, 200)); });

await page.waitForFunction('!!window.TOUCH', { timeout: 30000 });
await page.evaluate(() => { document.getElementById('boot')?.remove(); });

// Drive the sim from the gate rather than rAF, so every assertion is taken on
// a known number of settled frames. `TouchControls` keeps its own rAF for the
// DOM half; `_live()` is called explicitly wherever a label is being read.
await page.evaluate(() => {
  const g = window.GAME;
  g.stop();
  g.get('Story')?.title?.hide?.();
  window.step = (n = 30) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
  let pid = 100;
  window.ptr = (node: Element, type: string, x = 0, y = 0, id?: number) => {
    node.dispatchEvent(new PointerEvent(type, {
      pointerId: id ?? pid, clientX: x, clientY: y, bubbles: true, cancelable: true,
    }));
  };
  window.btn = (id: string) => window.TOUCH!.buttons.get(id)!;
  window.tap = (id: string, frames = 2) => {
    const b = window.btn(id);
    window.ptr(b.node, 'pointerdown', 0, 0, ++pid);
    window.ptr(b.node, 'pointerup', 0, 0, pid);
    window.step(frames);
  };
});

/* ------------------------------------------------------------------ 1 */
/* the layer is installed and owns input                                 */

const install = await page.evaluate(() => {
  const g = window.GAME, tc = window.TOUCH!;
  return {
    root: !!document.getElementById('touch'),
    inRoot: document.getElementById('touch')!.parentElement === g.uiRoot,
    touchMode: g.input.touchMode,
    padSource: typeof g.input.padSource === 'function',
    buttons: tc.buttons.size,
    sticks: tc.sticks.length,
    // The root must not eat taps meant for the HUD behind it.
    rootEvents: getComputedStyle(document.getElementById('touch')!).pointerEvents,
    zoom: getComputedStyle(document.getElementById('touch')!).zoom,
  };
});
ok('overlay installed in uiRoot with touchMode set', install.root && install.inRoot && install.touchMode && install.padSource,
  `${install.buttons} buttons, ${install.sticks} sticks`);
ok('overlay root passes taps through and does not scale with the design grid',
  install.rootEvents === 'none' && (install.zoom === '1' || install.zoom === 'normal'), `pointer-events ${install.rootEvents}, zoom ${install.zoom}`);

/* ------------------------------------------------------------------ 2 */
/* the mouse path is dead: no attack, no pointer-lock request            */

const mouse = await page.evaluate(() => {
  const g = window.GAME;
  let lockAsked = 0;
  const dom = g.input.dom;
  const real = dom.requestPointerLock;
  dom.requestPointerLock = function () { lockAsked++; return Promise.resolve(); };
  g.input.mouse.leftEdge = false;
  dom.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
  window.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
  const edge = g.input.mouse.leftEdge;
  const asked = lockAsked;
  const direct = g.input.requestPointerLock();
  dom.requestPointerLock = real;
  return { edge, asked, direct };
});
ok('a canvas tap sets no mouse edge and requests no pointer lock',
  !mouse.edge && mouse.asked === 0 && mouse.direct === false,
  `edge=${mouse.edge} lockRequests=${mouse.asked} requestPointerLock()=${mouse.direct}`);

/* ------------------------------------------------------------------ 3 */
/* sticks reach `input.move` and `input.look`                            */

const sticks = await page.evaluate(() => {
  const g = window.GAME, tc = window.TOUCH!;
  const [left, right] = tc.sticks;
  // Full forward-left on the move stick: 60 px is past the 46 px ring.
  window.ptr(left.root, 'pointerdown', 300, 300, 11);
  window.ptr(left.root, 'pointermove', 260, 240, 11);
  window.step(2);
  const move = { x: +g.input.move.x.toFixed(3), y: +g.input.move.y.toFixed(3) };
  const axes = [+left.pad.axes[0].toFixed(3), +left.pad.axes[1].toFixed(3)];
  window.ptr(left.root, 'pointerup', 260, 240, 11);
  window.step(2);
  const released = { x: g.input.move.x, y: g.input.move.y };

  // The look stick writes axes[2]/[3], which `Input.update` scales by
  // 18 * lookScale into the same per-frame delta the mouse produces.
  window.ptr(right.root, 'pointerdown', 900, 300, 12);
  window.ptr(right.root, 'pointermove', 960, 300, 12);
  g.input.look.set(0, 0);
  g.input.update();
  const look = +g.input.look.x.toFixed(2);
  window.ptr(right.root, 'pointerup', 960, 300, 12);
  return { move, axes, released, look };
});
ok('move stick drives input.move and releases to zero',
  sticks.move.y > 0.4 && sticks.move.x < -0.4 && sticks.released.x === 0 && sticks.released.y === 0,
  `move ${JSON.stringify(sticks.move)} from axes ${JSON.stringify(sticks.axes)}`);
ok('look stick drives input.look', sticks.look > 5, `look.x = ${sticks.look}`);

/* ------------------------------------------------------------------ 4 */
/* tap latching: exactly one rising edge, even for a sub-frame tap       */

/*
 * Edges have to be counted from INSIDE the frame. `Input.gpDown` is
 * `gpButton(i) && !_gpPrev[i]`, and `_gpPrev` is refreshed at the end of every
 * frame from the live pad — so by the time `g.frame()` has returned, the edge
 * it carried is already gone. The recorder wraps `endFrame`, which runs after
 * every consumer has read the frame and before the table is rewritten: exactly
 * where a real system sees the edge.
 */
await page.evaluate(() => {
  const inp = window.GAME.input;
  const real = inp.endFrame.bind(inp);
  window.edges = {};
  inp.endFrame = () => {
    for (const k of Object.keys(window.edges)) {
      if (inp.gpDown(Number(k))) window.edges[k]++;
    }
    real();
  };
  window.watch = (...idx: number[]) => { window.edges = {}; for (const i of idx) window.edges[i] = 0; };
});

const edges = await page.evaluate(() => {
  const g = window.GAME;
  // Down and up entirely between two frames -- the case a naive held-only pad
  // would drop on the floor.
  window.watch(2);
  const a = window.btn('attack');
  window.ptr(a.node, 'pointerdown', 0, 0, 200);
  window.ptr(a.node, 'pointerup', 0, 0, 200);
  window.step(8);
  const tap = window.edges[2];

  // A held button must not re-fire: one edge, then a steady hold.
  window.watch(1);
  const b = window.btn('dodge');
  window.ptr(b.node, 'pointerdown', 0, 0, 201);
  window.step(10);
  const heldEdges = window.edges[1];
  const heldNow = g.input.gpButton(1);
  window.ptr(b.node, 'pointerup', 0, 0, 201);
  window.step(2);
  return { tap, heldEdges, heldNow, releasedNow: g.input.gpButton(1) };
});
ok('a sub-frame tap produces exactly one rising edge', edges.tap === 1, `${edges.tap} edges`);
ok('a held button is one edge then steady hold',
  edges.heldEdges === 1 && edges.heldNow && !edges.releasedNow,
  `${edges.heldEdges} edges, held=${edges.heldNow}, released=${edges.releasedNow}`);

/* ------------------------------------------------------------------ 5 */
/* auto-repeat, without which a held d-pad moves one menu row and stops  */

const repeat = await page.evaluate(async () => {
  const g = window.GAME;
  window.watch(13);
  const b = window.TOUCH!.dpad[3];   // down
  window.ptr(b.node, 'pointerdown', 0, 0, 210);
  // Real wall clock: the repeat schedule is in ms, not frames.
  const t0 = performance.now();
  while (performance.now() - t0 < 900) {
    g.frame(1 / 60);
    await new Promise((r) => setTimeout(r, 8));
  }
  window.ptr(b.node, 'pointerup', 0, 0, 210);
  window.step(2);
  return window.edges[13];
});
ok('a held d-pad auto-repeats rather than firing once', repeat >= 3 && repeat <= 8, `${repeat} edges in 900 ms`);

/* ------------------------------------------------------------------ 6 */
/* the chocobo button: four states, and no accidental re-whistle         */

const bird = await page.evaluate(async () => {
  const g = window.GAME, tc = window.TOUCH!;
  const cho = g.get('Chocobo')!;
  const b = window.btn('chocobo');
  const live = () => { tc.update(); return { label: b.labelNode.textContent, on: b.enabled, ring: b._ring, state: cho.state }; };

  window.step(20);
  const away = live();
  window.tap('chocobo', 4);
  const arriving = live();

  // The impatient second tap. `ChocoboSystem`'s whistle branch for `arriving`
  // is `dismiss()`, so a live button here would send the bird home again.
  window.tap('chocobo', 4);
  const afterSecond = live();

  // Run the bird in.
  for (let i = 0; i < 900 && cho.state === 'arriving'; i++) g.frame(1 / 60);
  const waiting = live();

  const mounted = cho.mount ? cho.mount() : false;
  window.step(6);
  const ridden = live();
  if (cho.state === 'ridden') { cho.dismount(); window.step(6); }
  return { away, arriving, afterSecond, waiting, ridden, mounted };
});
ok('chocobo away -> CHOCOBO, and a tap whistles',
  bird.away.label === 'CHOCOBO' && bird.away.on && bird.arriving.state === 'arriving',
  `${bird.away.label} -> ${bird.arriving.state}`);
ok('chocobo arriving -> COMING, disabled, with a run-in ring',
  bird.arriving.label === 'COMING' && !bird.arriving.on && bird.arriving.ring >= 0 && bird.arriving.ring <= 1,
  `label=${bird.arriving.label} enabled=${bird.arriving.on} ring=${bird.arriving.ring}`);
ok('a second tap during arrival does not dismiss the bird',
  bird.afterSecond.state === 'arriving' || bird.afterSecond.state === 'waiting',
  `state after second tap: ${bird.afterSecond.state}`);
ok('chocobo waiting -> DISMISS', bird.waiting.label === 'DISMISS' && bird.waiting.on && bird.waiting.ring < 0,
  `${bird.waiting.label}, state ${bird.waiting.state}`);
ok('chocobo ridden -> DISMOUNT', !bird.mounted || (bird.ridden.label === 'DISMOUNT' && bird.ridden.state === 'ridden'),
  bird.mounted ? `${bird.ridden.label}, state ${bird.ridden.state}` : 'mount() refused; row skipped');

/* ------------------------------------------------------------------ 7 */
/* the car: get in, pull away, and — load-bearingly — get back out       */

const car = await page.evaluate(async () => {
  const g = window.GAME, tc = window.TOUCH!;
  const rg = g.get('Regalia')!;
  const player = g.get('Player')!;
  const b = window.btn('car');

  // Stand the player at the driver's door, the way a walk over would.
  player.position.set(rg.body.pos.x + 3, player.position.y, rg.body.pos.z);
  window.step(6);
  tc.update();
  const near = { label: b.labelNode.textContent, on: b.enabled };

  window.tap('car', 10);
  tc.update();
  const driving = rg.isDriving;
  const mode = tc.mode;
  const exitLabel = b.labelNode.textContent;

  // GAS is the re-pointed ATTACK button; the ramp means the reading has to be
  // taken after a beat rather than on the first frame.
  const v0 = rg.body.vLong;
  const gas = window.btn('attack');
  const gasLabel = gas.labelNode.textContent;
  window.ptr(gas.node, 'pointerdown', 0, 0, 220);
  window.step(120);
  const v1 = rg.body.vLong;
  window.ptr(gas.node, 'pointerup', 0, 0, 220);
  window.step(4);

  window.tap('car', 30);
  const out = !rg.isDriving;
  return { near, driving, mode, exitLabel, gasLabel, v0: +v0.toFixed(2), v1: +v1.toFixed(2), out };
});
ok('CAR reads DRIVE beside the Regalia and puts you in it',
  car.near.label === 'DRIVE' && car.near.on && car.driving, `${car.near.label}, isDriving=${car.driving}`);
ok('drive mode re-points the arc and labels EXIT',
  car.mode === 'drive' && car.exitLabel === 'EXIT' && car.gasLabel === 'GAS',
  `mode=${car.mode}, car=${car.exitLabel}, attack=${car.gasLabel}`);
ok('GAS accelerates the car', car.v1 > car.v0 + 1, `vLong ${car.v0} -> ${car.v1} m/s`);
ok('EXIT gets the player back out of the car', car.out, `isDriving after EXIT: ${!car.out}`);

/* ------------------------------------------------------------------ 8 */
/* a menu takes the sticks off screen and the stick axes with them       */

const ui = await page.evaluate(() => {
  const g = window.GAME, tc = window.TOUCH!;
  const [left] = tc.sticks;
  window.ptr(left.root, 'pointerdown', 300, 300, 31);
  window.ptr(left.root, 'pointermove', 240, 240, 31);
  window.step(2);
  const before = Math.abs(g.input.move.x) + Math.abs(g.input.move.y);

  g.get('Menus')!.setScreen('main');
  window.step(6);
  tc.update();
  const mode = tc.mode;
  const hidden = tc.sticks.every((s) => s.root.hidden);
  const dpadUp = tc.dpad.every((d) => !d.node.hidden);
  window.step(4);
  const during = Math.abs(g.input.move.x) + Math.abs(g.input.move.y);

  g.get('Menus')!.setScreen(null);
  window.step(20);
  tc.update();
  return { before: +before.toFixed(3), mode, hidden, dpadUp, during: +during.toFixed(3), backHidden: tc.sticks.every((s) => s.root.hidden) };
});
ok('a menu switches to ui mode, unmounts the sticks and raises the d-pad',
  ui.mode === 'ui' && ui.hidden && ui.dpadUp, `mode=${ui.mode} sticksHidden=${ui.hidden} dpad=${ui.dpadUp}`);
ok('stick input is zero while a menu is up and the sticks come back after',
  ui.before > 0.4 && ui.during === 0 && !ui.backHidden, `move ${ui.before} -> ${ui.during}`);

/* -------------------------------------------------------------------- */

ok('no page errors', pageErrors.length === 0, pageErrors.slice(0, 4).join(' | '));

await leased.release();

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
