#!/usr/bin/env node
/**
 * Frame-time benchmark.
 *
 *   node src/tools/perf.mts                     # every shot, ultra
 *   node src/tools/perf.mts vista_noon storm    # named shots
 *   node src/tools/perf.mts --q high            # quality tier (low|medium|high|ultra)
 *   node src/tools/perf.mts --frames 180        # samples per shot
 *   node src/tools/perf.mts --w 1920 --h 1080
 *   node src/tools/perf.mts --breakdown         # also time the scene pass alone
 *
 * Steps the simulation manually and brackets each batch with `gl.finish()` so
 * the number reported is real CPU+GPU wall time per frame, not just the cost of
 * queueing work. rAF is deliberately not used: headless Chrome paces it to the
 * compositor, which would silently clamp the answer at 60.
 *
 * Exits non-zero if any shot falls below the target (default 60 fps).
 */
import { chromium } from 'playwright';
import { CHROMIUM_ARGS } from './chromium.mts';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.PORT || 5173);

function parseArgs(argv: string[]) {
  const o: { w: number, h: number, frames: number, warmup: number, q: string, shots: string[], target: number, breakdown: boolean, out: string | null } =
    { w: 1600, h: 900, frames: 120, warmup: 40, q: 'ultra', shots: [], target: 60, breakdown: false, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--w') o.w = Number(argv[++i]);
    else if (a === '--h') o.h = Number(argv[++i]);
    else if (a === '--frames') o.frames = Number(argv[++i]);
    else if (a === '--warmup') o.warmup = Number(argv[++i]);
    else if (a === '--q') o.q = argv[++i];
    else if (a === '--target') o.target = Number(argv[++i]);
    else if (a === '--breakdown') o.breakdown = true;
    else if (a === '--out') o.out = argv[++i];
    else if (a.startsWith('--')) throw new Error(`unknown flag ${a}`);
    else o.shots.push(a);
  }
  return o;
}

const portOpen = (p: number) => new Promise<boolean>((res) => {
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
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300));
    if (await portOpen(PORT)) return proc;
  }
  throw new Error('vite failed to start');
}

async function listShots() {
  const src = await readFile(path.join(ROOT, 'src/game/Shots.ts'), 'utf8');
  return [...src.matchAll(/^\s{2}([a-zA-Z0-9_]+):\s*\{/gm)].map((m) => m[1]);
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const server = await ensureServer();
  const shots = o.shots.length ? o.shots : await listShots();

  const browser = await chromium.launch({ args: CHROMIUM_ARGS });
  const page = await browser.newPage({ viewport: { width: o.w, height: o.h }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const rows = [];
  try {
    await page.goto(`http://127.0.0.1:${PORT}/?q=${o.q}&shoot=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 180000 });
    await page.evaluate(() => { window.GAME.stop(); document.getElementById('boot')?.remove(); });

    const gpu = await page.evaluate(() => {
      const gl = window.GAME.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
    });
    console.log(`GPU: ${gpu}`);
    console.log(`${o.w}x${o.h}  quality=${o.q}  ${o.frames} frames/shot  target ${o.target} fps\n`);
    console.log('shot              median    fps     min    mean    p95   draws     tris');
    console.log('-'.repeat(76));

    for (const name of shots) {
      const r = await page.evaluate(async ([n, frames, warmup, breakdown]: [string, number, number, boolean]) => {
        const g = window.GAME;
        const gl = g.renderer.getContext();
        g.resetClock();
        g.applyShot(n);
        g.settle(warmup);
        g.applyShot(n);
        g.settle(8);

        // Per-frame samples, each individually flushed so p95 is meaningful.
        const samples = new Float64Array(frames);
        gl.finish();
        for (let i = 0; i < frames; i++) {
          const t0 = performance.now();
          g.frame(1 / 60);
          gl.finish();
          samples[i] = performance.now() - t0;
        }

        // Snapshot the counters from a single clean frame *before* any extra
        // rendering below — renderer.info.autoReset is off, so anything drawn
        // after this point would accumulate into the same totals.
        const info = g.renderer.info;
        const counts = {
          draws: info.render.calls,
          tris: info.render.triangles,
          programs: info.programs?.length ?? 0,
        };

        let scene = 0;
        if (breakdown) {
          // Warm first: rendering straight to the screen uses a different
          // target/material path and would otherwise time a shader compile.
          g.renderer.setRenderTarget(null);
          g.renderer.render(g.scene, g.camera);
          gl.finish();
          const t0 = performance.now();
          for (let i = 0; i < 20; i++) g.renderer.render(g.scene, g.camera);
          gl.finish();
          scene = (performance.now() - t0) / 20;
        }

        const sorted = Array.from(samples).sort((a, b) => a - b);
        const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
        return {
          mean,
          min: sorted[0],
          median: sorted[Math.floor(sorted.length * 0.5)],
          p95: sorted[Math.floor(sorted.length * 0.95)],
          scene, ...counts,
        };
      }, [name, o.frames, o.warmup, o.breakdown] as [string, number, number, boolean]);

      const fps = 1000 / r.median;
      rows.push({ name, ...r, fps });
      const flag = fps < o.target ? '  <<' : '';
      console.log(
        `${name.padEnd(16)} ${r.median.toFixed(2).padStart(7)} ${fps.toFixed(1).padStart(6)} ` +
        `${r.min.toFixed(2).padStart(7)} ${r.mean.toFixed(2).padStart(7)} ${r.p95.toFixed(2).padStart(6)} ` +
        `${String(r.draws).padStart(7)} ${String(r.tris).padStart(8)}${flag}`
      );
    }
  } finally {
    await browser.close();
    if (server) server.kill();
  }

  const worst = rows.reduce((a, b) => (a.fps < b.fps ? a : b));
  const mean = rows.reduce((s, r) => s + r.fps, 0) / rows.length;
  console.log('-'.repeat(76));
  console.log(`mean ${mean.toFixed(1)} fps   worst ${worst.fps.toFixed(1)} fps (${worst.name})`);

  if (o.out) {
    await mkdir(path.dirname(path.resolve(ROOT, o.out)), { recursive: true });
    await writeFile(path.resolve(ROOT, o.out), JSON.stringify({ rows, mean, worst }, null, 2));
  }
  if (errors.length) {
    console.error(`\n${errors.length} page error(s):`);
    for (const e of [...new Set(errors)].slice(0, 10)) console.error('  ' + e.split('\n')[0]);
    process.exit(1);
  }
  if (worst.fps < o.target) {
    console.error(`\nFAIL: ${worst.name} at ${worst.fps.toFixed(1)} fps is below the ${o.target} fps target`);
    process.exit(2);
  }
  console.log(`\nPASS: every shot >= ${o.target} fps`);
}

main().catch((e) => { console.error(e); process.exit(1); });
