#!/usr/bin/env node
/**
 * Boot / page-load profiler.
 *
 *   node src/tools/bootprof.mjs            # one cold + one warm load, per-system breakdown
 *   node src/tools/bootprof.mjs --n 3      # 3 loads, report each
 *   node src/tools/bootprof.mjs --prod     # against the production bundle
 *
 * Prints the wall clock from navigation to `GAME.ready` and the per-system
 * `init()` breakdown collected by `src/engine/BootProfile.ts`.
 */
import { chromium } from 'playwright';
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
  const proc = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'],
  });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
    if (await portOpen(PORT)) return proc;
  }
  throw new Error('vite failed to start');
}

async function main() {
  const argv = process.argv.slice(2);
  let n = 2, nobake = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--n') n = Number(argv[++i]);
    else if (argv[i] === '--nobake') nobake = true;
  }

  const server = await ensureServer();
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=default', '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist', '--disable-dev-shm-usage', '--force-color-profile=srgb',
      '--hide-scrollbars', '--mute-audio'],
  });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.log('PAGEERROR:', String(e).split('\n')[0]));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE ERR:', m.text().slice(0, 200)); });

  try {
    for (let run = 0; run < n; run++) {
      const t0 = Date.now();
      await page.goto(`http://127.0.0.1:${PORT}/?q=ultra&shoot=1${nobake ? '&nobake=1' : ''}`,
        { waitUntil: 'domcontentloaded', timeout: 300000 });
      await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 300000 });
      const wall = Date.now() - t0;
      const prof = await page.evaluate(() => window.BOOT_PROFILE);
      const label = run === 0 ? 'cold' : `warm ${run}`;
      console.log(`\n=== load ${label}: ${(wall / 1000).toFixed(2)} s wall, ${(prof!.total / 1000).toFixed(2)} s in Game.init()`);
      const marks = prof!.marks.slice().sort((a: any, b: any) => b.ms - a.ms);
      for (const m of marks) {
        if (m.ms < 5) continue;
        console.log(`  ${String(m.ms.toFixed(0)).padStart(7)} ms  ${m.name}`);
      }
      if (prof!.warmup) {
        console.log(`  -- warmup ${prof!.warmup.ms.toFixed(0)} ms, +${prof!.warmup.programs} programs`);
        for (const s of prof!.warmup.steps) console.log(`     ${String((s.ms || 0).toFixed(0)).padStart(6)} ms  ${s.name} (${s.programs ?? '-'} progs)`);
      }
    }
  } finally {
    await browser.close();
    if (server) server.kill();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
