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
 *   `ms` is the headline and what the gate reads: the median cost of one
 *   frame, rendered alone in its own task and `gl.finish()`-ed, so it charges
 *   CPU and GPU end to end with no overlap. That is an *upper* bound on what a
 *   60 Hz frame costs, which is the direction a target wants to be wrong in.
 *
 *   `cpu` is the same frame timed before the GPU is waited on: JS, culling,
 *   uniform uploads and the driver accepting the commands. `ms - cpu` is the
 *   GPU half, and which of the two is larger says which side to work on.
 *
 * WHY THERE IS NO LONGER A PIPELINED BLOCK NUMBER. There was, and it was
 * wrong by a factor of five. `ruler.mts` used to render 20 frames inside one
 * synchronous task; a task that keeps the GPU busy past one display refresh
 * gets throttled ~5x, and every perf number in this repo was taken inside that
 * throttle. `src/tools/probes/perfgroup.mts` and the eight probes beside it
 * establish it, and the header of `ruler.mts` states the rule. A block long
 * enough to pipeline is long enough to throttle, so the pipelined number is
 * not measurable here — and a 60 Hz game presenting one frame per refresh
 * never had sixteen frames in flight anyway.
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
import { RULER_PAGE_SRC, printContention, validate, deltaVerdict, quantiles } from './ruler.mts';
import type { Floor } from './ruler.mts';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { harnessArgs, announceBuild, lease, pageOpts, withExclusive, HARNESS_FLAGS } from './harness.mts';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

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
    // `harnessArgs` owns these and parses the same argv separately; this
    // clause is what lets the gate take `--build <sha>` and `--dirty` at all.
    // An unknown flag still throws, which is the half of this worth keeping.
    else if (HARNESS_FLAGS.has(a)) i += HARNESS_FLAGS.get(a)!;
    else if (a.startsWith('--')) throw new Error(`unknown flag ${a}`);
    else o.shots.push(a);
  }
  return o;
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
  /** median time `g.frame()` itself takes, before the GPU is waited on */
  cpu: number;
  /** share of frames over one 60 Hz budget; see `ruler.mts` on the tail */
  over16: number;
  p95: number;
  max: number;
  scene: number;
  draws: number;
  tris: number;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const shots = o.shots.length ? o.shots : await listShots();

  // BEFORE measuring, not after. Everything below is only as good as the
  // machine it ran on, and this is the cheapest thing that says what that was.
  const load = printContention();
  console.log('');

  const ha = harnessArgs(process.argv.slice(2), {});
  announceBuild(ha);
  const leased = await lease(pageOpts(ha));
  const page = leased.page;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const rows: Row[] = [];
  let floorStart: Floor = { iqrMs: 0, biasMs: 0, pairs: 0 };
  let floorEnd: Floor = { iqrMs: 0, biasMs: 0, pairs: 0 };
  try {
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
    const measureFloor = (shot: string, pairs: number) => page.evaluate(async ([n, p]: [string, number]) => {
      const g = window.GAME;
      g.resetClock();
      g.applyShot(n);
      g.settle(20);
      await window.__RULER.cooldown();
      return window.__RULER.noiseFloor((_i: number) => g.frame(1 / 60), { pairs: p });
    }, [shots[0], o.pairs] as [string, number]);

    /**
     * Warm the PAGE, not just the shot, before the first floor is taken.
     *
     * Every loop in this harness now yields, and yielding is what finally lets
     * the game's promise continuations run -- streaming, decodes, deferred
     * builds. All of that had been frozen since boot by loops that never
     * returned to the event loop, so the first few hundred yielding frames are
     * the game catching up on work it was owed, and a floor measured inside
     * them came back at 23.60 ms against a 5.1 ms frame while the same floor
     * at the end of the same run came back at 0.95 ms.
     */
    await page.evaluate(async ([n]: [string]) => {
      const g = window.GAME;
      g.resetClock(); g.applyShot(n); g.settle(20);
      for (let i = 0; i < 200; i++) { g.frame(1 / 60); await window.__RULER.yieldTask(); }
      await window.__RULER.cooldown(500);
    }, [shots[0]] as [string]);

    floorStart = await measureFloor(shots[0], o.pairs);
    console.log(
      `noise floor (${shots[0]}, ${floorStart.pairs} ABBA frame pairs): ` +
      `IQR ${floorStart.iqrMs.toFixed(2)} ms, bias ${floorStart.biasMs >= 0 ? '+' : ''}${floorStart.biasMs.toFixed(2)} ms\n`,
    );

    console.log('shot                 ms    fps  spread     cpu    >16     p95     max   draws     tris');
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

        // `settle()` renders back to back, so the shot arrives here already in
        // the throttled state `ruler.mts` documents. Idle it off first, or the
        // whole run measures the warm-up.
        await window.__RULER.cooldown();

        // Headline and tail from ONE set of per-frame samples, each yielding
        // to the event loop. There is no longer a separate pipelined pass:
        // a block long enough to pipeline is long enough to throttle.
        const blocks = 5;
        const t = await window.__RULER.throughput(render, {
          blocks, warm: 4, n: Math.max(8, Math.round(frames / blocks)),
        });

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
          await window.__RULER.cooldown();
          const each: number[] = [];
          for (let i = 0; i < 20; i++) {
            gl.finish();
            const t0 = performance.now();
            g.renderer.render(g.scene, g.camera);
            gl.finish();
            each.push(performance.now() - t0);
            await window.__RULER.yieldTask();
          }
          scene = window.__RULER.quantiles(each).median;
        }

        return {
          thru: t.ms,
          fps: t.fps,
          spread: t.spreadMs,
          cpu: t.cpuMs,
          over16: t.overBudget,
          p95: t.p95,
          max: t.max,
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
        `${r.spread.toFixed(2).padStart(7)} ${r.cpu.toFixed(2).padStart(7)} ` +
        `${(r.over16 * 100).toFixed(0).padStart(5)}% ${r.p95.toFixed(2).padStart(7)} ` +
        `${r.max.toFixed(1).padStart(7)} ${String(r.draws).padStart(7)} ${String(r.tris).padStart(8)}${flag}`,
      );
    }

    floorEnd = await measureFloor(shots[0], o.pairs);
  } finally {
    await leased.release();
  }

  // The worse of the two floors. A run that started quiet and ended contended
  // is a contended run.
  const floor: Floor = floorEnd.iqrMs > floorStart.iqrMs ? floorEnd : floorStart;
  const worst = rows.reduce((a, b) => (a.fps < b.fps ? a : b));
  const meanFps = rows.reduce((s, r) => s + r.fps, 0) / rows.length;
  const medianFrame = quantiles(rows.map((r) => r.thru)).median;
  const validity = validate(floor, medianFrame, floorStart.iqrMs);

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
        headline: 'thru = median per-frame CPU+GPU cost, one frame per task, gl.finish()-ed; cpu = the CPU half',
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

/**
 * THE QUIET LANE. This is the payoff of one daemon owning one machine.
 *
 * RESCUE §B6 threw away every perf number from a whole session because they
 * were taken under six concurrent chromiums. Under per-worktree daemons that
 * was unfixable: a daemon cannot quiesce browsers it does not own. Here it can,
 * so "the machine is quiet" stops being a thing you hope for and becomes a
 * thing the harness enforces -- every worker drained, every pooled page closed,
 * and no new work admitted until this releases.
 *
 * The state the measurement was taken under is stamped into the report, because
 * a perf number without it is not comparable, and two sessions arguing about a
 * regression that was really a busy box is a whole afternoon.
 */
await withExclusive('perf', main).catch((e) => { console.error(e); process.exit(1); });
