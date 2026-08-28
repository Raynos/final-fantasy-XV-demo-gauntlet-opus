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
import { harnessArgs, announceBuild, lease, pageOpts, runTool } from './harness.mts';
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
