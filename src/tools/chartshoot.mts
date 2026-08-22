#!/usr/bin/env node
/**
 * Chart inspector for the cartography workstream.
 *
 *   node src/tools/chartshoot.mts --out tmp/shots/chart
 *
 * Boots the game, bakes the world chart out of the live heightfield and writes
 * the raw raster to disk, plus a 1:1 crop, so palette and relief-shading work
 * can be judged without the map UI, the fog sheet or the menu scrim on top.
 * Temporary tooling — delete when the chart is finished.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.PORT || 5173);

const portOpen = (port: number) => new Promise<boolean>((res) => {
  const s = net.connect(port, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 800);
});

async function ensureServer() {
  if (await portOpen(PORT)) return null;
  const p = spawn('npx', ['vite', '--config', 'src/tools/vite.map.config.mts', '--port', String(PORT), '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stdout.on('data', (d) => process.stdout.write(`[vite] ${d}`));
  for (let i = 0; i < 160; i++) {
    if (await portOpen(PORT)) return p;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('vite did not start');
}

const argv = process.argv.slice(2);
let out = 'tmp/shots/chart';
const crops = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--out') out = argv[++i];
  else if (argv[i] === '--crop') crops.push(argv[++i].split(',').map(Number));
}
if (!crops.length) crops.push([1024, 1024, 420, 260, 2]);

const server = await ensureServer();
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--force-color-profile=srgb'],
});
const page = await browser.newPage({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (process.env.VERBOSE || m.type() === 'error') console.log(`[page] ${m.text()}`); });
try {
  await page.goto(`http://127.0.0.1:${PORT}/?q=ultra&shoot=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 240000 });
  const res = await page.evaluate(async ([crops]) => {
    const { getChart } = await import('/world/map/Chart.ts');
    const chart = getChart(window.GAME.get('Terrain'));
    const shrink = document.createElement('canvas');
    shrink.width = 1024; shrink.height = 1024;
    const sc = shrink.getContext('2d');
    sc!.imageSmoothingQuality = 'high';
    sc!.fillStyle = '#05090f';
    sc!.fillRect(0, 0, 1024, 1024);
    sc!.drawImage(chart.canvas, 0, 0, 1024, 1024);
    const cuts = crops.map(([x, y, w, h, s]) => {
      const cv = document.createElement('canvas');
      cv.width = w * s; cv.height = h * s;
      const c = cv.getContext('2d');
      c!.imageSmoothingEnabled = false;
      c!.fillStyle = '#05090f';
      c!.fillRect(0, 0, cv.width, cv.height);
      c!.drawImage(chart.canvas, x, y, w, h, 0, 0, w * s, h * s);
      return cv.toDataURL('image/png');
    });
    return { full: shrink.toDataURL('image/png'), cuts, ms: chart.ms, size: chart.size };
  }, [crops]);
  const dir = path.join(ROOT, out);
  await mkdir(dir, { recursive: true });
  const save = (name: string, url: string) => writeFile(path.join(dir, name), Buffer.from(url.split(',')[1], 'base64'));
  await save('chart.png', res.full);
  for (let i = 0; i < res.cuts.length; i++) await save(`crop${i}.png`, res.cuts[i]);
  console.log(`chart ${res.size}² baked in ${res.ms.toFixed(0)} ms -> ${out}`);
} finally {
  await browser.close();
  if (server) server.kill();
}
