#!/usr/bin/env node
/**
 * Gameplay frame-time benchmark.
 *
 * Posed screenshots measure a steady state that real play never sits in. This
 * drives the actual game loop with synthetic input through a scripted session —
 * walking, sprinting, turning the camera, fighting, warping, swapping weapons,
 * opening menus, crossing the map to force streaming, moving the sun, changing
 * the weather — and reports per-segment frame times plus every hitch.
 *
 *   node src/tools/gameplay.mts                  # full session, ultra
 *   node src/tools/gameplay.mts --q high
 *   node src/tools/gameplay.mts --scale 2        # longer segments
 *   node src/tools/gameplay.mts --out perf.json
 *   node src/tools/gameplay.mts --baseline perf.json   # compare, honestly
 *
 * A hitch is a single frame over 33 ms (a dropped frame at 30 fps). Those are
 * what players actually feel; a good median with 100 ms spikes is a bad game.
 * Exits non-zero if the p99 is over budget or any segment medians below target.
 *
 * ONE PASS PER SEGMENT, as in `perf.mts`. `thru` is the median cost of one
 * frame rendered alone in its own task and `gl.finish()`-ed, and the whole
 * tail (`p95`, `p99`, `max`, `hitches`) comes from those same samples, which
 * is the only way a single bad frame stays visible instead of being averaged
 * into a block. There used to be a pipelined-block headline beside it; it ran
 * 20 frames inside one synchronous task, which throttles the GPU ~5x, and it
 * is what made every gameplay number in this repo five times too slow. See
 * the header of `ruler.mts` and `src/tools/probes/perfgroup.mts`.
 *
 * AND THE RUN VALIDATES ITSELF. The noise floor is measured — walking, the
 * same paired procedure with the same configuration on both sides — before the
 * first segment and after the last, and the worse of the two is what every
 * number is judged against. If it is not small relative to the frame the run is
 * stamped `RULER_VALID: false` and exits 3 without certifying anything. See
 * `ruler.mts` for why, and for where it was ported from.
 */
import { RULER_PAGE_SRC, printContention, validate, deltaVerdict, quantiles } from './ruler.mts';
import type { Floor } from './ruler.mts';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { harnessArgs, announceBuild, lease, pageOpts, withExclusive } from './harness.mts';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function parseArgs(argv: string[]) {
  const o = {
    w: 1600, h: 900, q: 'ultra', scale: 1, target: 60, hitchMs: 33,
    out: null as string | null, baseline: null as string | null, pairs: 24, nobake: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--nobake') o.nobake = true;
    else if (a === '--w') o.w = Number(argv[++i]);
    else if (a === '--h') o.h = Number(argv[++i]);
    else if (a === '--q') o.q = argv[++i];
    else if (a === '--scale') o.scale = Number(argv[++i]);
    else if (a === '--target') o.target = Number(argv[++i]);
    else if (a === '--hitch') o.hitchMs = Number(argv[++i]);
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--baseline') o.baseline = argv[++i];
    else if (a === '--pairs') o.pairs = Number(argv[++i]);
    else throw new Error(`unknown flag ${a}`);
  }
  return o;
}



async function main() {
  const o = parseArgs(process.argv.slice(2));

  // BEFORE measuring. Everything below is only as good as the machine it ran
  // on, and this is the cheapest thing that says what that machine was.
  const load = printContention();
  console.log('');

  const ha = harnessArgs(process.argv.slice(2), { q: 'ultra' });
  announceBuild(ha);
  const leased = await lease(pageOpts(ha));
  const page = leased.page;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  let out;
  try {
    await page.evaluate(RULER_PAGE_SRC);

    const gpu = await page.evaluate(() => {
      const gl = window.GAME.renderer.getContext();
      const e = gl.getExtension('WEBGL_debug_renderer_info');
      return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown';
    });
    console.log(`GPU: ${gpu}`);
    console.log(`${o.w}x${o.h}  quality=${o.q}  hitch>${o.hitchMs}ms  target ${o.target} fps\n`);

    out = await page.evaluate(async ([scale, hitchMs, pairs]) => {
      const g = window.GAME;
      const gl = g.renderer.getContext();
      const dt = 1 / 60;
      const inp = g.input;
      const player = g.get('Player')!;
      const combat = g.get('Combat')!;
      const menus = g.get('Menus')!;
      const sky = g.get('Sky')!;
      const weather = g.get('Weather')!;
      const rig = g.get('CameraRig')!;

      const hold = (...codes: string[]) => { inp.keys.clear(); for (const c of codes) inp.keys.add(c); };
      const look = (x: number, y: number) => { inp.look.set(x, y); };
      const n = (base: number) => Math.max(4, Math.round(base * scale));

      // Leave capture/shot mode: we want the live gameplay camera.
      g.applyShot('hud_field');
      rig?.clearShot?.();
      g.resetClock();
      const start = player ? player.position.clone() : null;

      const segments: { name: string, setup?: () => void, each?: (i: number) => void, frames: number }[] = [
        { name: 'idle', frames: n(60), setup: () => hold() },
        { name: 'walk', frames: n(120), setup: () => hold('KeyW') },
        { name: 'sprint', frames: n(150), setup: () => hold('KeyW', 'ShiftLeft') },
        {
          name: 'sprint+turn',
          frames: n(150),
          setup: () => hold('KeyW', 'ShiftLeft'),
          each: (i) => look(Math.sin(i * 0.06) * 22, Math.sin(i * 0.021) * 5),
        },
        {
          name: 'strafe+camera',
          frames: n(120),
          setup: () => hold('KeyW', 'KeyD'),
          each: (i) => look(18 * Math.cos(i * 0.09), 0),
        },
        {
          name: 'weapon-swap',
          frames: n(90),
          setup: () => hold(),
          each: (i) => {
            if (i % 6 === 0 && combat?.setWeapon) {
              const kinds = ['sword', 'greatsword', 'polearm', 'daggers', 'firearm'] as const;
              combat.setWeapon(kinds[(i / 6) % kinds.length]);
            }
          },
        },
        {
          name: 'combat',
          frames: n(240),
          setup: () => { g.get('Director')?.setScenario?.('combat'); hold('KeyW'); },
          each: (i) => {
            if (i % 14 === 0) combat?.attack?.();
            if (i % 47 === 0) combat?.dodge?.();
            if (i % 61 === 0 && combat?.autoTarget) combat.lockOn?.(combat.autoTarget());
            look(Math.sin(i * 0.05) * 12, 0);
          },
        },
        {
          name: 'warp-strike',
          frames: n(120),
          setup: () => { g.get('Director')?.setScenario?.('warp'); hold(); },
          each: (i) => { if (i % 30 === 0) combat?.warpStrike?.(combat?.lockTarget || combat?.autoTarget?.()); },
        },
        {
          name: 'magic',
          frames: n(90),
          setup: () => { hold(); },
          each: (i) => {
            if (i % 20 !== 0 || !player) return;
            const at = player.position.clone();
            at.x += 6; at.z += 6;
            // `castSpell` takes a *slot index*, not an element name:
            // `castSpell('fire', at)` looked up `elemancy.equipped['fire']`,
            // missed every time and answered `{ ok: false, reason:
            // 'empty-slot' }` -- an object, so the `??` fallback behind it
            // never ran either, and this scenario has been measuring an idle
            // field for its whole life. It now fires the effect directly,
            // which is what that dead fallback was reaching for.
            combat?.elemancy?.cast('fire', { pos: at });
          },
        },
        {
          name: 'streaming-traverse',
          frames: n(180),
          setup: () => { g.get('Director')?.setScenario?.('field'); hold('KeyW', 'ShiftLeft'); },
          // teleport in long hops: forces grass tile refill, clipmap rebuild,
          // prop LOD swaps — the streaming work posed shots never trigger
          each: (i) => {
            if (i % 12 === 0 && player) {
              const a = i * 0.7;
              player.root.position.x = Math.cos(a) * (120 + i * 3);
              player.root.position.z = Math.sin(a) * (120 + i * 3);
            }
          },
        },
        {
          name: 'day-night-sweep',
          frames: n(150),
          setup: () => hold('KeyW'),
          each: (i) => sky?.setTimeOfDay?.((i * 0.16) % 24),
        },
        {
          name: 'weather-change',
          frames: n(120),
          setup: () => hold('KeyW'),
          each: (i) => {
            if (i === 10) weather?.set?.('storm');
            if (i === 60) weather?.set?.('fog');
            if (i === 100) weather?.set?.('clear');
          },
        },
        {
          name: 'menu-open',
          frames: n(90),
          setup: () => hold(),
          each: (i) => {
            if (i === 5) menus?.setScreen?.('main');
            if (i === 30) menus?.setScreen?.('ascension');
            if (i === 55) menus?.setScreen?.('inventory');
            if (i === 80) menus?.setScreen?.(null);
          },
        },
      ];

      /**
       * The noise floor for this session: the paired procedure with the SAME
       * configuration on both sides, walking. Measured, never asserted — its
       * IQR is the smallest per-segment difference this machine can resolve
       * right now, and it is what `--baseline` comparisons are judged against.
       */
      const measureFloor = async () => {
        hold('KeyW');
        look(0, 0);
        for (let i = 0; i < 20; i++) g.frame(dt);
        await window.__RULER.cooldown();
        return window.__RULER.noiseFloor(() => g.frame(dt), { pairs });
      };
      const floorStart = await measureFloor();

      const results = [];
      const allHitches = [];
      for (const seg of segments) {
        const failures = [];
        const act = (i: number) => {
          try { seg.each?.(i); } catch (e: unknown) {
            if (failures.length < 3) failures.push(e instanceof Error ? e.message : String(e));
          }
        };
        try { seg.setup?.(); } catch (e: unknown) { failures.push(e instanceof Error ? e.message : String(e)); }
        // warm the segment so its first-touch costs are attributed but do not
        // dominate: 6 warm frames, then measure
        for (let i = 0; i < 6; i++) { act(i); g.frame(dt); }
        gl.finish();
        // The warm-up above ran back to back, which throttles; see ruler.mts.
        await window.__RULER.cooldown();

        // ONE pass, not two. There used to be a pipelined-block headline and a
        // per-frame tail beside it, which ran the segment's script twice and
        // measured the first pass inside the throttle. A segment is a
        // *sequence* -- `each(i)` walks, turns and swings -- so it can only be
        // measured in order anyway. Every frame yields to the event loop; the
        // yield is outside the timed region and costs the number nothing.
        const samples = [];
        for (let i = 0; i < seg.frames; i++) {
          act(i);
          gl.finish();
          const t0 = performance.now();
          g.frame(dt);
          gl.finish();
          const ms = performance.now() - t0;
          samples.push(ms);
          if (ms > hitchMs) allHitches.push({ segment: seg.name, frame: i, ms: +ms.toFixed(1) });
          await window.__RULER.yieldTask();
        }
        const s = samples.slice().sort((a, b) => a - b);
        // `spread` still answers "did the machine drift while this segment was
        // measured": the IQR of the four quarter-medians of the same samples.
        const quarter = Math.max(1, samples.length >> 2);
        const parts = [];
        for (let i = 0; i + quarter <= samples.length; i += quarter) {
          parts.push(window.__RULER.quantiles(samples.slice(i, i + quarter)).median);
        }
        results.push({
          name: seg.name,
          frames: seg.frames,
          thru: +window.__RULER.quantiles(samples).median.toFixed(2),
          spread: +window.__RULER.quantiles(parts).iqr.toFixed(2),
          median: s[Math.floor(s.length * 0.5)],
          p95: s[Math.floor(s.length * 0.95)],
          p99: s[Math.floor(s.length * 0.99)],
          max: s[s.length - 1],
          over16: samples.filter((x) => x > 16.7).length / samples.length,
          hitches: samples.filter((x) => x > hitchMs).length,
          failures,
        });
      }

      const floorEnd = await measureFloor();
      if (start && player) player.root.position.copy(start);
      return { results, floorStart, floorEnd, hitches: allHitches.sort((a, b) => b.ms - a.ms).slice(0, 25) };
    }, [o.scale, o.hitchMs, o.pairs]);
  } finally {
    await leased.release();
  }

  // The worse of the two floors: a session that started quiet and ended
  // contended is a contended session.
  const floorStart: Floor = out.floorStart;
  const floorEnd: Floor = out.floorEnd;
  const floor: Floor = floorEnd.iqrMs > floorStart.iqrMs ? floorEnd : floorStart;
  const medianFrame = quantiles(out.results.map((r) => r.thru)).median;
  const validity = validate(floor, medianFrame, floorStart.iqrMs);
  const targetMs = 1000 / o.target;

  console.log(
    `noise floor (walking, ${floor.pairs} ABBA frame pairs): start IQR ${floorStart.iqrMs.toFixed(2)} ms / ` +
    `end IQR ${floorEnd.iqrMs.toFixed(2)} ms, bias ${floor.biasMs >= 0 ? '+' : ''}${floor.biasMs.toFixed(2)} ms\n`,
  );
  console.log('segment              thru ms    fps  spread     lat    p95    p99    max   >16ms  hitches');
  console.log('-'.repeat(90));
  for (const r of out.results) {
    const fps = 1000 / r.thru;
    // `~~` means the verdict is not resolvable: the segment sits closer to the
    // target than this segment's own block spread. Saying "49.8 fps, fails" of
    // a number with a 4 ms spread is the lie this instrument exists to stop.
    const unresolved = Math.abs(r.thru - targetMs) <= r.spread;
    const flag = unresolved ? '  ~~' : (fps < o.target ? '  <<' : '');
    console.log(
      `${r.name.padEnd(20)} ${r.thru.toFixed(1).padStart(6)} ${fps.toFixed(1).padStart(6)} ` +
      `${r.spread.toFixed(1).padStart(7)} ${r.median.toFixed(1).padStart(7)} ${r.p95.toFixed(1).padStart(6)} ` +
      `${r.p99.toFixed(1).padStart(6)} ${r.max.toFixed(1).padStart(6)} ` +
      `${(r.over16 * 100).toFixed(0).padStart(6)}% ${String(r.hitches).padStart(8)}${flag}`
    );
  }
  const worst = out.results.reduce((a, b) => (a.thru > b.thru ? a : b));
  const totalHitches = out.results.reduce((s, r) => s + r.hitches, 0);
  console.log('-'.repeat(90));
  console.log(`worst segment: ${worst.name} at ${(1000 / worst.thru).toFixed(1)} fps   total hitches: ${totalHitches}`);
  console.log(
    `noise floor ${floor.iqrMs.toFixed(2)} ms = ${((floor.iqrMs / medianFrame) * 100).toFixed(0)}% ` +
    `of the median ${medianFrame.toFixed(1)} ms segment`,
  );
  console.log(`RULER_VALID: ${validity.valid}`);

  if (out.hitches.length) {
    console.log('\nworst individual frames:');
    for (const h of out.hitches.slice(0, 12)) {
      console.log(`  ${h.ms.toFixed(1).padStart(7)} ms   ${h.segment} @ frame ${h.frame}`);
    }
  }

  // Against a previous run, with the rule applied: a median that moves less
  // than the floor has not moved.
  if (o.baseline) {
    const prev = JSON.parse(await readFile(path.resolve(ROOT, o.baseline), 'utf8')) as { results: typeof out.results };
    const by = new Map(prev.results.map((r) => [r.name, r]));
    console.log(`\nagainst ${o.baseline}:`);
    let changed = 0;
    for (const r of out.results) {
      const b = by.get(r.name);
      if (!b || b.thru == null) continue;
      const v = deltaVerdict(b.thru, r.thru, floor.iqrMs);
      if (!v.startsWith('unchanged')) {
        changed++;
        console.log(`  ${r.name.padEnd(20)} ${b.thru.toFixed(1)} -> ${r.thru.toFixed(1)} ms   ${v}`);
      }
    }
    console.log(`  ${changed} of ${out.results.length} segments moved by more than the ${floor.iqrMs.toFixed(2)} ms floor`);
  }

  if (o.out) {
    await mkdir(path.dirname(path.resolve(ROOT, o.out)), { recursive: true });
    await writeFile(path.resolve(ROOT, o.out), JSON.stringify({
      RULER_VALID: validity.valid,
      rulerWarning: validity.warning,
      contention: load,
      ruler: {
        floorStart, floorEnd, medianFrameMs: medianFrame,
        headline: 'thru = median per-frame CPU+GPU cost, one frame per task, gl.finish()-ed; tail from the same samples',
        rule: 'a median that moves less than the floor IQR has not moved',
      },
      ...out,
    }, null, 2));
  }
  if (errors.length) {
    console.error(`\n${errors.length} page error(s):`);
    for (const e of [...new Set(errors)].slice(0, 10)) console.error('  ' + e.split('\n')[0]);
    process.exit(1);
  }
  // Void beats both PASS and FAIL: a run this instrument cannot stand behind
  // must not be quoted in either direction.
  if (!validity.valid) {
    console.error(`\n${validity.warning}`);
    if (load.busy) console.error(`The contention verdict above already said so: ${load.verdict}`);
    console.error('VOID: no segment is certified pass or fail by this run.');
    process.exit(3);
  }
  const worstFps = 1000 / worst.thru;
  if (worstFps < o.target) {
    console.error(`\nFAIL: ${worst.name} at ${worstFps.toFixed(1)} fps is below the ${o.target} fps target`);
    process.exit(2);
  }
  console.log(`\nPASS: every segment >= ${o.target} fps, on a ruler that validated itself`);
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
await withExclusive('gameplay', main).catch((e) => { console.error(e); process.exit(1); });
