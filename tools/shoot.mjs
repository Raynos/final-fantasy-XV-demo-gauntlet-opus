#!/usr/bin/env node
/**
 * Headless capture harness.
 *
 *   node tools/shoot.mjs                       # every shot in Shots.js
 *   node tools/shoot.mjs vista_dusk hero_full  # named shots only
 *   node tools/shoot.mjs --out shots/round3    # output directory
 *   node tools/shoot.mjs --w 1920 --h 1080     # resolution (default 1600x900)
 *   node tools/shoot.mjs --settle 90           # sim frames before capture
 *   node tools/shoot.mjs --prod                # build + serve the real bundle
 *
 * Boots vite itself (or reuses one already on the port), waits for the
 * `game-ready` event, drives the game deterministically with fixed timesteps,
 * and writes PNGs. Exits non-zero on any page error so agents can't mistake a
 * blank canvas for success.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 5173);
const URL_BASE = `http://127.0.0.1:${PORT}`;

function parseArgs(argv) {
  const opts = { w: 1600, h: 900, settle: 60, out: 'shots', shots: [], keep: false, prod: false, timeout: 120000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--w') opts.w = Number(argv[++i]);
    else if (a === '--h') opts.h = Number(argv[++i]);
    else if (a === '--settle') opts.settle = Number(argv[++i]);
    else if (a === '--out') opts.out = argv[++i];
    else if (a === '--keep') opts.keep = true;
    else if (a === '--prod') opts.prod = true;
    else if (a.startsWith('--')) throw new Error(`unknown flag ${a}`);
    else opts.shots.push(a);
  }
  return opts;
}

const portOpen = (port) => new Promise((res) => {
  const s = net.connect(port, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 800);
});

/**
 * Start the dev server, or with `--prod` build and serve the real bundle.
 * Production is worth testing separately: the minifier mangles class names,
 * so anything keyed off `constructor.name` works in dev and breaks in a build.
 */
async function ensureServer(prod) {
  if (await portOpen(PORT)) return null;
  if (prod) {
    await new Promise((res, rej) => {
      const b = spawn('npx', ['vite', 'build'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
      b.on('exit', (c) => (c === 0 ? res() : rej(new Error(`vite build failed (${c})`))));
    });
  }
  const args = prod
    ? ['vite', 'preview', '--port', String(PORT), '--strictPort']
    : ['vite', '--port', String(PORT), '--strictPort'];
  const proc = spawn('npx', args, {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: false,
  });
  proc.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 300));
    // eslint-disable-next-line no-await-in-loop
    if (await portOpen(PORT)) return proc;
  }
  throw new Error('vite failed to start');
}

async function listShots() {
  const src = await readFile(path.join(ROOT, 'src/game/Shots.js'), 'utf8');
  return [...src.matchAll(/^\s{2}([a-zA-Z0-9_]+):\s*\{/gm)].map((m) => m[1]);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const outDir = path.isAbsolute(opts.out) ? opts.out : path.join(ROOT, opts.out);
  await mkdir(outDir, { recursive: true });

  const server = await ensureServer(opts.prod);
  const shots = opts.shots.length ? opts.shots : await listShots();

  const browser = await chromium.launch({
    args: [
      '--use-gl=angle',
      '--use-angle=default',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
      '--enable-gpu-rasterization',
      '--disable-dev-shm-usage',
      '--force-color-profile=srgb',
      '--hide-scrollbars',
      '--mute-audio',
    ],
  });
  const page = await browser.newPage({
    viewport: { width: opts.w, height: opts.h },
    deviceScaleFactor: 1,
  });

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error') errors.push(t);
    if (process.env.VERBOSE) console.log(`[page:${m.type()}]`, t);
  });

  const results = [];
  try {
    await page.goto(`${URL_BASE}/?q=ultra&shoot=1`, { waitUntil: 'domcontentloaded', timeout: opts.timeout });
    await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: opts.timeout });

    // stop the rAF loop; we step manually for determinism
    await page.evaluate(() => {
      window.GAME.stop();
      window.GAME.resetClock();
      document.getElementById('boot')?.remove();
    });

    const info = await page.evaluate(() => ({
      renderer: window.GAME.renderer.getContext().getParameter(
        window.GAME.renderer.getContext().getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL ?? 0x1F01
      ),
      webgl2: window.GAME.rnd.isWebGL2,
    }));
    console.log(`GPU: ${info.renderer} | WebGL2: ${info.webgl2}`);

    for (const name of shots) {
      const t0 = Date.now();
      const meta = await page.evaluate(([n, settle]) => {
        const g = window.GAME;
        g.applyShot(n);
        g.settle(settle);
        g.applyShot(n);          // re-anchor follow shots after settling
        g.settle(8);
        const gl = g.renderer.info;
        return {
          triangles: gl.render.triangles,
          calls: gl.render.calls,
          textures: gl.memory.textures,
          geometries: gl.memory.geometries,
          programs: g.renderer.info.programs?.length ?? 0,
        };
      }, [name, opts.settle]);

      const file = path.join(outDir, `${name}.png`);
      const buf = await page.screenshot({ type: 'png' });
      await writeFile(file, buf);
      const ms = Date.now() - t0;
      results.push({ name, file, ...meta, ms });
      console.log(
        `✓ ${name.padEnd(16)} ${String(meta.triangles).padStart(9)} tris  ` +
        `${String(meta.calls).padStart(4)} calls  ${String(ms).padStart(5)}ms  -> ${path.relative(ROOT, file)}`
      );
    }
  } finally {
    if (!opts.keep) await browser.close();
    if (server) server.kill();
  }

  await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify({ results, errors }, null, 2));

  if (errors.length) {
    console.error(`\n${errors.length} page error(s):`);
    for (const e of [...new Set(errors)].slice(0, 20)) console.error('  ' + e.split('\n')[0]);
    process.exit(1);
  }
  console.log(`\n${results.length} shots -> ${path.relative(ROOT, outDir)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
