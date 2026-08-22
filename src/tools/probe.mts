#!/usr/bin/env node
/** Ad-hoc in-page probe: `node src/tools/probe.mjs src/tools/probes/foo.js` runs the file's body in the page. */
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.PORT || 5173);
const portOpen = (p: any) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 800);
});
async function ensureServer() {
  if (await portOpen(PORT)) return null;
  const proc = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300));
    if (await portOpen(PORT)) return proc;
  }
  throw new Error('vite failed');
}

const src = await readFile(process.argv[2], 'utf8');
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
  const out = await page.evaluate(`(async () => { ${src} })()`);
  console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 2));
} finally { await browser.close(); if (server) server.kill(); }
