#!/usr/bin/env node
/**
 * Map-screen framing harness for the cartography workstream.
 *
 *   node src/tools/mapview.mjs --out tmp/shots/mapview --state 0,0,1 --state 3,4,0
 *
 * `--state zoom,filter,revealAll` opens the real `map` menu screen through
 * `Menus`, sets the zoom step / filter row / survey state, settles the sim and
 * captures the frame. `src/tools/shoot.mjs` can only render the states baked into
 * `Shots.js`, which another agent owns; this drives the live screen instead so
 * every zoom level can be looked at. Temporary tooling.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.PORT || 5173);

const portOpen = (port: any) => new Promise((res) => {
  const s = net.connect(port, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 800);
});

async function ensureServer() {
  if (await portOpen(PORT)) return null;
  const p = spawn('npx', ['vite', '--config', 'src/tools/vite.map.config.js', '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (d) => process.stdout.write(`[vite] ${d}`));
  for (let i = 0; i < 160; i++) {
    if (await portOpen(PORT)) return p;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('vite did not start');
}

const argv = process.argv.slice(2);
let out = 'tmp/shots/mapview';
const states = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--out') out = argv[++i];
  else if (argv[i] === '--state') states.push(argv[++i].split(',').map(Number));
}
if (!states.length) states.push([0, 0, 1]);

const server = await ensureServer();
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--force-color-profile=srgb',
    '--hide-scrollbars', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const errors: any[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
  if (process.env.VERBOSE) console.log(`[page] ${m.text()}`);
});
try {
  await page.goto(`http://127.0.0.1:${PORT}/?q=ultra&shoot=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 240000 });
  await page.evaluate(() => {
    window.GAME.stop();
    window.GAME.resetClock();
    document.getElementById('boot')?.remove();
  });
  const dir = path.join(ROOT, out);
  await mkdir(dir, { recursive: true });
  for (const [zoom, filter, revealAll] of states) {
    const meta = await page.evaluate(async ([zoom, filter, revealAll]) => {
      const g = window.GAME;
      const { fog } = await import('/world/map/FogOfWar.ts');
      if (revealAll) { fog.revealAll(); for (const p of g.get('Terrain').map.pois) g.get('Terrain').map.discover(p.id); }
      const menus = g.get('Menus');
      if (zoom < 0) {                       // field HUD only: measure the minimap
        menus.setScreen(null);
        g.settle(120);
        const mm0 = g.get('Minimap');
        return { cost: mm0 ? +mm0.cost.toFixed(3) : null, zoom: 0 };
      }
      menus.setScreen('map');
      g.settle(30);
      const s = menus.screens.map;
      s.zoomI = zoom; s.zoom = s.constructor === Object ? 0 : s.zoom;
      s._setFilter(filter);
      g.settle(45);
      const mm = g.get('Minimap');
      return { cost: mm ? +mm.cost.toFixed(3) : null, zoom: s.zoom };
    }, [zoom, filter, revealAll]);
    const buf = await page.screenshot({ type: 'png' });
    const name = zoom < 0 ? 'field.png' : `map_z${zoom}_f${filter}${revealAll ? '_all' : ''}.png`;
    await writeFile(path.join(dir, name), buf);
    console.log(`✓ ${name}  minimap ${meta.cost} ms/frame  ppm ${meta.zoom.toFixed(3)}`);
  }
} finally {
  await browser.close();
  if (server) server.kill();
}
if (errors.length) {
  console.error(`\n${errors.length} page error(s):`);
  for (const e of [...new Set(errors)].slice(0, 10)) console.error(`  ${e.split('\n')[0]}`);
  process.exit(1);
}
