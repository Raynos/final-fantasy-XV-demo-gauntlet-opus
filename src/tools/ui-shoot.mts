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
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { assertOwnPort } from './portowner.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.PORT || 5173);
const URL_BASE = `http://127.0.0.1:${PORT}`;

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

const portOpen = (port: number) => new Promise<boolean>((res) => {
  const s = net.connect(port, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 800);
});

async function ensureServer() {
  if (await portOpen(PORT)) { assertOwnPort(PORT, ROOT); return null; }
  const proc = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300));
    if (await portOpen(PORT)) return proc;
  }
  throw new Error('vite failed to start');
}

async function main() {
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

  const server = await ensureServer();
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist', '--force-color-profile=srgb', '--hide-scrollbars', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: opts.w, height: opts.h }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
    if (process.env.VERBOSE) console.log(`[page:${m.type()}]`, m.text());
  });

  try {
    await page.goto(`${URL_BASE}/?q=ultra&shoot=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 120000 });
    await page.evaluate(() => { window.GAME.stop(); document.getElementById('boot')?.remove(); });

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
    await browser.close();
    if (server) server.kill();
  }

  if (errors.length) {
    console.error(`\n${errors.length} page error(s):`);
    for (const e of [...new Set(errors)].slice(0, 20)) console.error('  ' + e.split('\n')[0]);
    process.exit(1);
  }
  console.log(`\n${names.length} scenes -> ${path.relative(ROOT, outDir)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
