#!/usr/bin/env node
/**
 * UI capture harness (companion to src/tools/shoot.mts, owned by the UI agent).
 *
 * The shared Shots.ts only has `hud_field` and `menu_main`, but the UI layer
 * has many more states worth eyeballing. This drives them by calling the public
 * HUD / Menus API after applying a base shot.
 *
 *   PORT=5206 node src/tools/ui-shoot.mts --out tmp/shots/ui-r1
 *   PORT=5206 node src/tools/ui-shoot.mts menu_ascension photo_mode --out tmp/shots/x
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { harnessArgs, announceBuild, lease, pageOpts, runTool, isHarnessFlag } from './harness.mts';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** name -> { shot, settle, after: source of a function body run in the page } */
/** One UI capture: a shot to stage, and optional in-page setup after it. */
interface Scene {
  shot: string;
  settle: number;
  /** Source run in the page after the shot is applied. */
  after?: string;
  /** Extra frames to settle after `after`. */
  then?: number;
}

const SCENES: Record<string, Scene> = {
  hud_field: { shot: 'hud_field', settle: 70 },
  combat_wide: { shot: 'combat_wide', settle: 70 },
  menu_main: { shot: 'menu_main', settle: 70 },
  menu_inventory: { shot: 'menu_main', settle: 20, after: `g.get('Menus').setScreen('inventory')`, then: 80 },
  menu_ascension: { shot: 'menu_main', settle: 20, after: `g.get('Menus').setScreen('ascension')`, then: 90 },
  menu_map: { shot: 'menu_main', settle: 20, after: `g.get('Menus').setScreen('map')`, then: 90 },
  menu_gear: { shot: 'menu_main', settle: 20, after: `g.get('Menus').setScreen('gear')`, then: 80 },
  photo_mode: { shot: 'hud_field', settle: 20, after: `g.get('Menus').setScreen('photo')`, then: 80 },
  // The bounty board, which is where the hunter ladder is read. Worth a scene
  // because the ladder is the only visible long-arc progression in the game and
  // its curve was unclimbable until it was measured against what the board pays.
  menu_hunts: { shot: 'menu_main', settle: 20, after: `g.get('Menus').setScreen('hunts')`, then: 90 },
  /**
   * THE SIX SCREENS NOTHING HAD EVER PHOTOGRAPHED.
   *
   * `Shots.ts` stages nine `menu_*` screens and `Menus` registers fifteen. The
   * six below -- `elemancy`, `armiger`, `quests`, `archives`, `system`,
   * `controls` -- were reachable in play, type-checked, in `must-run.json`, and
   * had never appeared in a capture: 2,000 lines of layout whose only reader
   * was the person who wrote it. `MapScreen` was the seventh and is now a
   * subclass of `WorldMapScreen`, so `menu_map` and `menu_map_wide` are the
   * same screen and one shot covers both.
   *
   * They are staged from `menu_main` like every other menu scene, so what is
   * photographed is the screen a player opening the menu gets.
   */
  menu_elemancy: { shot: 'menu_main', settle: 20, after: `g.get('Menus').setScreen('elemancy')`, then: 80 },
  menu_armiger: { shot: 'menu_main', settle: 20, after: `g.get('Menus').setScreen('armiger')`, then: 80 },
  menu_quests: { shot: 'menu_main', settle: 20, after: `g.get('Menus').setScreen('quests')`, then: 80 },
  menu_archives: { shot: 'menu_main', settle: 20, after: `g.get('Menus').setScreen('archives')`, then: 80 },
  menu_system: { shot: 'menu_main', settle: 20, after: `g.get('Menus').setScreen('system')`, then: 80 },
  menu_controls: { shot: 'menu_main', settle: 20, after: `g.get('Menus').setScreen('controls')`, then: 80 },
  area_card: {
    shot: 'hud_field', settle: 30,
    after: `g.get('HUD').areaTitle('Leide', 'Kingdom of Lucis', 'Longwythe Region  ·  Level 12 — 20')`,
    then: 55,
  },
  dialogue: {
    shot: 'hud_field', settle: 30,
    after: `g.get('HUD').say('Ignis', 'The road ahead narrows past the outpost. We should press on before dark.')`,
    then: 45,
  },
  // The camp menu, standing on a real haven, with the meal effects and the
  // running meal it now prints. This is the decision the camp asks the player
  // to make, and until it showed effects it was a list of ranks.
  camp_cook: {
    shot: 'hud_field', settle: 30,
    after: `
      var rpg=g.get('Rpg'), ix=g.get('Interaction'), pl=g.get('Player'), terr=g.get('Terrain');
      var h=rpg.day.havens()[0];
      var hx=h.pos[0]+2.5, hz=h.pos[2];
      pl.root.position.set(hx, terr.heightAt(hx,hz), hz);
      // The staged shot pinned the camera where the player *was*, so put it
      // behind him at the haven and drop the shot so nothing fights it.
      g.get('Camera').clearShot && g.get('Camera').clearShot();
      g.camera.position.set(hx-7, terr.heightAt(hx-7,hz+8)+3.4, hz+8);
      g.camera.lookAt(hx, terr.heightAt(hx,hz)+1.2, hz);
      g.get('Menus').setScreen(null);
      g.get('HUD').fx.cardState = null;
      rpg.havenCamp.open(h);
      ix.dialogue._goto('cook');
      // finish the typewriter and step past the first line so the "currently
      // running" line and the whole choice list are on screen
      ix.dialogue._typed = ix.dialogue._full.length;
      ix.dialogue._advance();
      ix.dialogue._typed = ix.dialogue._full.length;
    `,
    then: 60,
  },
  /**
   * THE TUTORIAL CARD OVER A FULL-SCREEN SCREEN, AND OVER A LIVE PROMPT.
   *
   * `HUD.update` writes `hints.muted = !!game.currentShot` every frame and
   * `Hints._poll` returns early on `currentShot` as well, so the first-run
   * hint card is invisible to every scene in the corpus and to every scene
   * here. That is why six full-screen screens shipped with a 500 px card
   * parked across their column headers and nobody saw it in a capture: the
   * only instrument that could have caught it had the subject switched off.
   *
   * These two scenes reach past the mute and `_present` a card directly, which
   * is what a player gets when they press H on their first minute.
   */
  /**
   * THE ON-SCREEN CONTROLS, at a phone viewport.
   *
   *   node src/tools/ui-shoot.mts touch_field touch_drive touch_chocobo \
   *     --extra touch=1 -w 844 -h 390 --out tmp/shots/touch
   *
   * Every scene drops `currentShot` before it settles. `TouchControls.update`
   * takes the whole layer off screen while a shot is applied — that is what
   * keeps the overlay out of all 166 corpus frames — so a scene that left the
   * shot in place would capture an empty screen and prove nothing.
   */
  touch_field: {
    shot: 'hud_field', settle: 40,
    after: `g.currentShot = null; g.settle(4); window.TOUCH && window.TOUCH.update();`,
    then: 20,
  },
  touch_interact: {
    shot: 'hud_field', settle: 30,
    after: `
      g.currentShot = null;
      // Stand at the Regalia so CAR reads DRIVE and INTERACT names a verb.
      var rg=g.get('Regalia'), pl=g.get('Player'), terr=g.get('Terrain');
      var x=rg.body.pos.x+3, z=rg.body.pos.z;
      pl.root.position.set(x, terr.heightAt(x,z), z);
      g.settle(20);
      window.TOUCH && window.TOUCH.update();
    `,
    then: 20,
  },
  touch_drive: {
    shot: 'hud_field', settle: 30,
    after: `
      g.currentShot = null;
      var rg=g.get('Regalia'), pl=g.get('Player'), terr=g.get('Terrain');
      var x=rg.body.pos.x+3, z=rg.body.pos.z;
      pl.root.position.set(x, terr.heightAt(x,z), z);
      g.settle(10);
      rg.enter(false);
      g.settle(30);
      window.TOUCH && window.TOUCH.update();
    `,
    then: 20,
  },
  // Portrait, to see the rotate gate rather than to see a layout: the device
  // report was that a portrait phone gets a scattered mess with no explanation.
  touch_portrait: {
    shot: 'hud_field', settle: 20,
    after: `g.currentShot = null; g.settle(4); window.TOUCH && window.TOUCH.rotate.check();`,
    then: 10,
  },
  touch_chocobo: {
    shot: 'hud_field', settle: 30,
    after: `
      g.currentShot = null;
      var cho=g.get('Chocobo');
      cho.summon();
      // Let the bird run most of the way in, so the ring is a real reading
      // rather than a full circle or an empty one.
      for (var i=0;i<240 && cho.state==='arriving';i++) g.frame(1/60);
      window.TOUCH && window.TOUCH.update();
    `,
    then: 8,
  },
  hint_over_menu: {
    shot: 'menu_main', settle: 20,
    after: `
      g.get('Menus').setScreen('controls');
      var h=g.get('HUD').hints; h.reset(); h.muted=false;
      h._present({ id:'boot', title:'Where you are',
        text:'Hammerhead — reach the garage. It is tracked on the compass, top right. H shows every control; Tab opens the menu; M opens the map.',
        keys:['H','Tab','M'], ico:'quests' });
      h.a = 1;
    `,
    then: 80,
  },
  hint_over_prompt: {
    shot: 'hud_field', settle: 30,
    after: `
      var h=g.get('HUD').hints; h.reset(); h.muted=false;
      h._present({ id:'interact', title:'Things you can use',
        text:'When a prompt floats over something — a counter, a board, a pump, a person — press E to use it. The prompt always names the key.',
        keys:['E'], ico:'items' });
      h.a = 1;
      g.get('HUD').areaTitle('Hammerhead', 'Cid Sophiar, Mechanic', 'Leide');
      g.get('HUD').callOut('Coeurl!', 'A hunt has found you');
    `,
    then: 45,
  },
  /**
   * THE TRAVERSAL NOTE, on a face that genuinely refuses.
   *
   * (-2320, -2438) is one of the six hillsides `probes/slopewalk.mts` measured
   * as DEAD-SILENT before this lane: 60.4 deg, ten seconds of sprint gaining
   * -5.4 m along the wish direction with nothing said. Noctis is put at its
   * foot, pointed uphill, and W is held for two seconds — 0.35 s for the
   * controller to decide the ground is refusing rather than merely faceted,
   * plus 0.55 s before the note speaks.
   */
  slip_note: {
    shot: 'hud_field', settle: 24,
    after: `
      var pl=g.get('Player'), terr=g.get('Terrain'), rig=g.get('CameraRig');
      var x=-2320, z=-2438, y=terr.heightAt(x,z);
      var n=terr.normalAt(x,z);
      var dl=Math.hypot(n.x,n.z)||1, ux=-n.x/dl, uz=-n.z/dl;
      pl.root.position.set(x,y,z);
      pl.body.vy=0; pl.body.grounded=true;
      var yaw=Math.atan2(-ux,-uz);
      g.get('Camera').clearShot && g.get('Camera').clearShot();
      if (rig) { rig.clearShot && rig.clearShot(); rig.yaw=yaw; rig.yawTarget=yaw; }
      g.input.pointerLocked = true;
      g.input.keys.clear(); g.input.keys.add('KeyW'); g.input.keys.add('ShiftLeft');
    `,
    then: 140,
  },
  low_hp: {
    shot: 'combat_wide', settle: 40,
    after: `var p=g.get('Player');p.stats.hp=Math.round(p.stats.maxHp*0.14);p.stats.mp=18;g.get('HUD').hit(0.5);g.get('HUD').callOut('Parry!','Perfect guard  ·  counter ready')`,
    then: 26,
  },
};



async function main() {
  const ha = harnessArgs(process.argv.slice(2));
  announceBuild(ha);
  const argv = process.argv.slice(2);
  const opts: { w: number, h: number, out: string, names: string[] } = { w: 1600, h: 900, out: 'tmp/shots/ui', names: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') opts.out = argv[++i];
    else if (a === '--w') opts.w = Number(argv[++i]);
    else if (a === '--h') opts.h = Number(argv[++i]);
    // The shared --build/--dirty/--lane/... flags belong to `harnessArgs`, which
    // has already read them. Swallowing them as scene names printed `unknown
    // scene --dirty` on every dirty run and, with a value flag, would have eaten
    // the value as a second one. Same fix as `framecam` took in 6a14da5.
    else if (isHarnessFlag(a) === 'value') i++;
    else if (isHarnessFlag(a) === 'switch') { /* handled by harnessArgs */ }
    else opts.names.push(a);
  }
  const names = opts.names.length ? opts.names : Object.keys(SCENES);
  const outDir = path.isAbsolute(opts.out) ? opts.out : path.join(ROOT, opts.out);
  await mkdir(outDir, { recursive: true });

  const leased = await lease(pageOpts(ha));
  const page = leased.page;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
    if (process.env.VERBOSE) console.log(`[page:${m.type()}]`, m.text());
  });

  try {

    for (const name of names) {
      const sc = SCENES[name as keyof typeof SCENES];
      if (!sc) { console.warn(`unknown scene ${name}`); continue; }
      await page.evaluate(([s]) => {
        const g = window.GAME;
        // reset UI state between scenes
        const menus = g.get('Menus')!;
        menus.setScreen(null);
        menus.a = 0;
        const hud = g.get('HUD')!;
        hud.resetDemo();
        const p = g.get('Player')!;
        p.stats.hp = p.stats.maxHp; p.stats.mp = p.stats.maxMp;
        g.applyShot(s.shot);
        g.settle(s.settle);
        g.applyShot(s.shot);
        if (s.after) new Function('g', s.after)(g);
        g.settle(s.then || 8);
      }, [sc]);
      const buf = await page.screenshot({ type: 'png' });
      await writeFile(path.join(outDir, `${name}.png`), buf);
      console.log(`✓ ${name}`);
    }
  } finally {
    await leased.release();
  }

  if (errors.length) {
    console.error(`\n${errors.length} page error(s):`);
    for (const e of [...new Set(errors)].slice(0, 20)) console.error('  ' + e.split('\n')[0]);
    process.exit(1);
  }
  console.log(`\n${names.length} scenes -> ${path.relative(ROOT, outDir)}`);
}

await runTool(main);
