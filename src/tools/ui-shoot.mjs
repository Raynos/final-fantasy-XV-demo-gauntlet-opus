#!/usr/bin/env node
/**
 * UI capture harness (companion to src/tools/shoot.mjs, owned by the UI agent).
 *
 * The shared Shots.js only has `hud_field` and `menu_main`, but the UI layer
 * has many more states worth eyeballing. This drives them by calling the public
 * HUD / Menus API after applying a base shot.
 *
 *   PORT=5206 node src/tools/ui-shoot.mjs --out tmp/shots/ui-r1
 *   PORT=5206 node src/tools/ui-shoot.mjs menu_ascension photo_mode --out tmp/shots/x
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.PORT || 5173);
const URL_BASE = `http://127.0.0.1:${PORT}`;

/** name -> { shot, settle, after: source of a function body run in the page } */
const SCENES = {
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
  low_hp: {
    shot: 'combat_wide', settle: 40,
    after: `var p=g.get('Player');p.stats.hp=Math.round(p.stats.maxHp*0.14);p.stats.mp=18;g.get('HUD').hit(0.5);g.get('HUD').callOut('Parry!','Perfect guard  ·  counter ready')`,
    then: 26,
  },
};

const portOpen = (port) => new Promise((res) => {
  const s = net.connect(port, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 800);
});

async function ensureServer() {
  if (await portOpen(PORT)) return null;
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
  const opts = { w: 1600, h: 900, out: 'tmp/shots/ui', names: [] };
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
  const errors = [];
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
      const sc = SCENES[name];
      if (!sc) { console.warn(`unknown scene ${name}`); continue; }
      await page.evaluate(([s]) => {
        const g = window.GAME;
        // reset UI state between scenes
        g.get('Menus').setScreen(null);
        g.get('Menus').a = 0;
        const hud = g.get('HUD');
        hud.resetDemo();
        const p = g.get('Player');
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
