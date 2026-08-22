#!/usr/bin/env node
/**
 * Frame-time benchmark — self-validating.
 *
 *   node src/tools/perf.mts                     # every shot, ultra
 *   node src/tools/perf.mts vista_noon storm    # named shots
 *   node src/tools/perf.mts --q high            # quality tier (low|medium|high|ultra)
 *   node src/tools/perf.mts --frames 180        # latency samples per shot
 *   node src/tools/perf.mts --w 1920 --h 1080
 *   node src/tools/perf.mts --breakdown         # also time the scene pass alone
 *   node src/tools/perf.mts --out tmp/perf.json
 *   node src/tools/perf.mts --baseline tmp/perf.json    # compare, honestly
 *
 * TWO NUMBERS PER SHOT, AND THEY MEAN DIFFERENT THINGS.
 *
 *   `thru` is the headline: the median of several PIPELINED blocks (16 frames
 *   between two `gl.finish()` calls). That is how the game actually runs — the
 *   CPU builds frame N+1 while the GPU is still on N — so it is the number a
 *   60 fps target is about, and it is what the pass/fail gate reads.
 *
 *   `lat` is the old headline: every frame individually `gl.finish()`-ed. That
 *   inserts a full pipeline bubble per frame, so it measures CPU+GPU serialised
 *   and reads systematically slower than the game. It is kept because the tail
 *   (`p95`, `max`) is only meaningful per frame, and because a big gap between
 *   `thru` and `lat` is itself a finding: it means the frame is not overlapping.
 *
 * AND A RULER THAT CHECKS ITSELF. `ruler.mts` measures the noise floor by
 * running the same paired procedure with the SAME configuration on both sides,
 * before and after the run; if the floor is not small relative to the frame, or
 * its bias does not sit inside its own IQR, the whole run is stamped
 * `RULER_VALID: false` and exits 3 without certifying anything. A perf number
 * taken while five agents' Chromiums share the GPU is not a weaker measurement,
 * it is not a measurement. See the header of `ruler.mts` for why.
 *
 * Exits 0 on pass, 2 if a shot is below target, 3 if the run is void.
 */
import { chromium } from 'playwright';
import { CHROMIUM_ARGS } from './chromium.mts';
import { RULER_PAGE_SRC, printContention, validate, deltaVerdict, quantiles } from './ruler.mts';
import type { Floor } from './ruler.mts';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.PORT || 5173);

function parseArgs(argv: string[]) {
  const o: {
    w: number, h: number, frames: number, warmup: number, q: string, shots: string[],
    target: number, breakdown: boolean, out: string | null, baseline: string | null, pairs: number,
  } = {
    w: 1600, h: 900, frames: 120, warmup: 40, q: 'ultra', shots: [],
    target: 60, breakdown: false, out: null, baseline: null, pairs: 24,
  };
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
    else if (a === '--baseline') o.baseline = argv[++i];
    else if (a === '--pairs') o.pairs = Number(argv[++i]);
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

interface Row {
  name: string;
  /** pipelined block median — the headline, and what the gate reads */
  thru: number;
  fps: number;
  /** IQR across the blocks: this shot's own drift while it was measured */
  spread: number;
  /** per-frame `gl.finish()` median — serialised latency, not throughput */
  lat: number;
  p95: number;
  max: number;
  scene: number;
  draws: number;
  tris: number;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const server = await ensureServer();
  const shots = o.shots.length ? o.shots : await listShots();

  // BEFORE measuring, not after. Everything below is only as good as the
  // machine it ran on, and this is the cheapest thing that says what that was.
  const load = printContention();
  console.log('');

  const browser = await chromium.launch({ args: CHROMIUM_ARGS });
  const page = await browser.newPage({ viewport: { width: o.w, height: o.h }, deviceScaleFactor: 1 });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const rows: Row[] = [];
  let floorStart: Floor = { iqrMs: 0, biasMs: 0, pairs: 0 };
  let floorEnd: Floor = { iqrMs: 0, biasMs: 0, pairs: 0 };
  try {
    await page.goto(`http://127.0.0.1:${PORT}/?q=${o.q}&shoot=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 180000 });
    await page.evaluate(() => { window.GAME.stop(); document.getElementById('boot')?.remove(); });
    await page.evaluate(RULER_PAGE_SRC);

    const gpu = await page.evaluate(() => {
      const gl = window.GAME.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown';
    });
    console.log(`GPU: ${gpu}`);
    console.log(`${o.w}x${o.h}  quality=${o.q}  target ${o.target} fps`);

    /**
     * The noise floor, measured on the first shot in the run: the paired
     * procedure with the same configuration on both sides. Run twice, at the
     * start and the end, and the *worse* of the two is what everything is
     * judged against — a machine that got busy halfway through must not be able
     * to hide behind a quiet opening.
     */
    const measureFloor = (shot: string, pairs: number) => page.evaluate(([n, p]: [string, number]) => {
      const g = window.GAME;
      g.resetClock();
      g.applyShot(n);
      g.settle(20);
      return window.__RULER.noiseFloor((_i: number) => g.frame(1 / 60), { pairs: p });
    }, [shots[0], o.pairs] as [string, number]);

    floorStart = await measureFloor(shots[0], o.pairs);
    console.log(
      `noise floor (${shots[0]}, ${floorStart.pairs} ABBA frame pairs): ` +
      `IQR ${floorStart.iqrMs.toFixed(2)} ms, bias ${floorStart.biasMs >= 0 ? '+' : ''}${floorStart.biasMs.toFixed(2)} ms\n`,
    );

    console.log('shot                thru    fps  spread     lat     p95     max   draws     tris');
    console.log('-'.repeat(80));

    for (const name of shots) {
      const r = await page.evaluate(async ([n, frames, warmup, breakdown]: [string, number, number, boolean]) => {
        const g = window.GAME;
        const gl = g.renderer.getContext();
        g.resetClock();
        g.applyShot(n);
        g.settle(warmup);
        g.applyShot(n);
        g.settle(8);

        const render = (_i: number) => g.frame(1 / 60);

        // Headline: pipelined blocks, median across blocks, IQR beside it.
        const t = window.__RULER.throughput(render, { blocks: 5, warm: 4, n: 16 });

        // Tail: per-frame samples, each individually flushed, so p95 and max
        // describe real single frames rather than a block average.
        const samples = new Float64Array(frames);
        gl.finish();
        for (let i = 0; i < frames; i++) {
          const t0 = performance.now();
          render(i);
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
        return {
          thru: t.ms,
          fps: t.fps,
          spread: t.spreadMs,
          lat: sorted[Math.floor(sorted.length * 0.5)],
          p95: sorted[Math.floor(sorted.length * 0.95)],
          max: sorted[sorted.length - 1],
          scene, ...counts,
        };
      }, [name, o.frames, o.warmup, o.breakdown] as [string, number, number, boolean]);

      rows.push({ name, ...r });
      // `<<` is below target; `~` is a shot whose own block spread rivals its
      // distance from the target, so its verdict is not resolvable today.
      const targetMs = 1000 / o.target;
      const flag = r.fps < o.target
        ? (Math.abs(r.thru - targetMs) <= r.spread ? '  ~~' : '  <<')
        : (Math.abs(r.thru - targetMs) <= r.spread ? '  ~~' : '');
      console.log(
        `${name.padEnd(16)} ${r.thru.toFixed(2).padStart(7)} ${r.fps.toFixed(0).padStart(6)} ` +
        `${r.spread.toFixed(2).padStart(7)} ${r.lat.toFixed(2).padStart(7)} ${r.p95.toFixed(2).padStart(7)} ` +
        `${r.max.toFixed(1).padStart(7)} ${String(r.draws).padStart(7)} ${String(r.tris).padStart(8)}${flag}`,
      );
    }

    floorEnd = await measureFloor(shots[0], o.pairs);
  } finally {
    await browser.close();
    if (server) server.kill();
  }

  // The worse of the two floors. A run that started quiet and ended contended
  // is a contended run.
  const floor: Floor = floorEnd.iqrMs > floorStart.iqrMs ? floorEnd : floorStart;
  const worst = rows.reduce((a, b) => (a.fps < b.fps ? a : b));
  const meanFps = rows.reduce((s, r) => s + r.fps, 0) / rows.length;
  const medianFrame = quantiles(rows.map((r) => r.thru)).median;
  const validity = validate(floor, medianFrame);

  console.log('-'.repeat(80));
  console.log(`mean ${meanFps.toFixed(1)} fps   worst ${worst.fps.toFixed(0)} fps (${worst.name})`);
  console.log(
    `noise floor: start IQR ${floorStart.iqrMs.toFixed(2)} ms / end IQR ${floorEnd.iqrMs.toFixed(2)} ms, ` +
    `bias ${floor.biasMs >= 0 ? '+' : ''}${floor.biasMs.toFixed(2)} ms; ` +
    `${((floor.iqrMs / medianFrame) * 100).toFixed(0)}% of the median ${medianFrame.toFixed(1)} ms frame`,
  );
  console.log(`RULER_VALID: ${validity.valid}`);

  // Compare against a previous run — the only place the "has not moved" rule
  // can actually be applied, and the reason `--out` exists.
  if (o.baseline) {
    const prev = JSON.parse(await readFile(path.resolve(ROOT, o.baseline), 'utf8')) as { rows: Row[] };
    const by = new Map(prev.rows.map((r) => [r.name, r]));
    console.log(`\nagainst ${o.baseline} (a median that moves less than the floor has not moved):`);
    let changed = 0;
    for (const r of rows) {
      const b = by.get(r.name);
      if (!b) continue;
      const v = deltaVerdict(b.thru, r.thru, floor.iqrMs);
      if (!v.startsWith('unchanged')) {
        changed++;
        console.log(`  ${r.name.padEnd(16)} ${b.thru.toFixed(2)} -> ${r.thru.toFixed(2)} ms   ${v}`);
      }
    }
    console.log(`  ${changed} of ${rows.length} shots moved by more than the ${floor.iqrMs.toFixed(2)} ms floor`);
  }

  if (o.out) {
    await mkdir(path.dirname(path.resolve(ROOT, o.out)), { recursive: true });
    await writeFile(path.resolve(ROOT, o.out), JSON.stringify({
      RULER_VALID: validity.valid,
      rulerWarning: validity.warning,
      contention: load,
      ruler: {
        floorStart, floorEnd, medianFrameMs: medianFrame,
        headline: 'thru = median of 5 pipelined 16-frame blocks; lat = per-frame gl.finish()',
        rule: 'a median that moves less than the floor IQR has not moved',
      },
      rows, meanFps, worst,
    }, null, 2));
  }
  if (errors.length) {
    console.error(`\n${errors.length} page error(s):`);
    for (const e of [...new Set(errors)].slice(0, 10)) console.error('  ' + e.split('\n')[0]);
    process.exit(1);
  }
  // Void beats both PASS and FAIL. A run this instrument cannot stand behind
  // must not be quoted in either direction — that is the whole point.
  if (!validity.valid) {
    console.error(`\n${validity.warning}`);
    if (load.busy) console.error(`The contention verdict above already said so: ${load.verdict}`);
    console.error('VOID: no shot is certified pass or fail by this run.');
    process.exit(3);
  }
  if (worst.fps < o.target) {
    console.error(`\nFAIL: ${worst.name} at ${worst.fps.toFixed(0)} fps is below the ${o.target} fps target`);
    process.exit(2);
  }
  console.log(`\nPASS: every shot >= ${o.target} fps, on a ruler that validated itself`);
}

main().catch((e) => { console.error(e); process.exit(1); });
