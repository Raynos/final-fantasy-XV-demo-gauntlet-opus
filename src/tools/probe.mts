#!/usr/bin/env node
/**
 * Ad-hoc in-page probe: `node src/tools/probe.mts src/tools/probes/foo.mts` runs
 * the file's body in the page.
 *
 *   node src/tools/probe.mts probes/foo.mts --shot tmp/shots/foo.jpg
 *
 * `--shot` grabs the canvas **after the probe body returns and without applying
 * a shot**, which is the one thing `framecam.mts` cannot do: it runs its shots
 * after the probe, and `applyShot` runs a Director scenario that tears down
 * whatever the probe set up. Anything a probe can drive -- a live set piece, a
 * minigame mid-fight, a menu three keystrokes deep -- can now be photographed
 * where it stands. A probe that wants several frames can call
 * `window.__shot(name)` at each moment instead; every one is written next to
 * `--shot`'s path with the name appended.
 */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertOwnPort } from './portowner.mts';
import { mkdir } from 'node:fs/promises';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.PORT || 5173);
const portOpen = (p: number) => new Promise<boolean>((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 800);
});
async function ensureServer() {
  if (await portOpen(PORT)) { assertOwnPort(PORT, ROOT); return null; }
  const proc = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300));
    if (await portOpen(PORT)) return proc;
  }
  throw new Error('vite failed');
}

const argv = process.argv.slice(2);
const shotIx = argv.indexOf('--shot');
const shotPath = shotIx >= 0 ? argv[shotIx + 1] : null;
const probeFile = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--shot');
if (!probeFile) throw new Error('usage: probe.mts <probe.mts> [--shot out.jpg]');
const src = await readFile(probeFile, 'utf8');
const server = await ensureServer();
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--force-color-profile=srgb', '--mute-audio'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
page.on('console', (m) => console.log(`[page:${m.type()}]`, m.text()));
page.on('pageerror', (e) => console.log('[pageerror]', String(e)));
try {
  await page.goto(`http://127.0.0.1:${PORT}/?q=ultra&shoot=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 180000 });
  await page.evaluate(() => { window.GAME.stop(); document.getElementById('boot')?.remove(); });

  // `await window.__shot('name')` from inside the probe grabs the canvas *at
  // that moment*. The binding is async, so the page's JS thread is idle while
  // Node takes the frame -- which is what lets a probe photograph four stages
  // of a minigame in one boot instead of four.
  let shotN = 0;
  await page.exposeFunction('__shot', async (name?: string) => {
    if (!shotPath) return false;
    const ext = path.extname(shotPath) || '.jpg';
    const base = shotPath.slice(0, shotPath.length - ext.length);
    const file = `${base}-${name || ++shotN}${ext}`;
    await mkdir(path.dirname(file), { recursive: true });
    // The **page**, not the canvas: half of what a probe is worth
    // photographing is DOM (the prompt, a menu, the fishing gauges), and a
    // canvas-only grab drops every one of them silently.
    await page.screenshot({ path: file, type: ext === '.png' ? 'png' : 'jpeg',
      ...(ext === '.png' ? {} : { quality: 84 }) });
    console.log(`[shot] ${file}`);
    return true;
  });

  const out = await page.evaluate(`(async () => { ${src} })()`);
  console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 2));

  if (shotPath) {
    const ext = path.extname(shotPath) || '.jpg';
    const dir = path.dirname(shotPath);
    await mkdir(dir, { recursive: true });
    await page.screenshot({ path: shotPath, type: ext === '.png' ? 'png' : 'jpeg',
      ...(ext === '.png' ? {} : { quality: 84 }) });
    console.log(`[shot] ${shotPath}`);
  }
} finally { await browser.close(); if (server) server.kill(); }
