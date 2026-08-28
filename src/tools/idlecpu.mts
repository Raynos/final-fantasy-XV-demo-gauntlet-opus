#!/usr/bin/env node
/**
 * What does an IDLE tab cost, and which subsystem is spending it?
 *
 *   node src/tools/idlecpu.mts                 # 15 s of idle free-run, per-subsystem table
 *   node src/tools/idlecpu.mts --secs 30       # a longer window
 *   node src/tools/idlecpu.mts --no-ablate     # the running arm only
 *   node src/tools/idlecpu.mts --hidden        # add a background-tab arm
 *   node src/tools/idlecpu.mts --q high        # what a PERSON opens; the harness default is ultra
 *   node src/tools/idlecpu.mts --dpr 1.5       # add a Retina-resolution arm (headless reports dpr 1)
 *   node src/tools/idlecpu.mts --gate          # the `idlecpu` gate, as `check --perf` runs it
 *
 * **This is the gate-shaped hole `docs/BOOT_PERF.md` names.** `?shoot=1` is a
 * determinism gate and also a blindfold: `main.ts` does not call `game.start()`
 * under it, so a posed page never free-runs. The 142-shot corpus, every
 * `--cold` capture and both perf gates are posed — `perf.mts` steps frames by
 * hand, measuring the cost of a frame the harness *asks for* rather than the
 * behaviour of a loop nobody is driving. A tab pinned at 100% of a core while
 * the player is not touching anything is therefore invisible to all 19 gates,
 * both perf gates and all 142 shots, by construction.
 *
 * `BRIEF.md` rule 3's "≥60 fps" and "no frame over 33 ms" are upper bounds on
 * work *per frame*. Neither says anything about how many frames a second the
 * page decides to render, which is the whole of this question: idle CPU is
 * `frame cost x frame rate`, and the harness has only ever measured the first
 * factor.
 *
 * ## Where the number comes from
 *
 * Three oracles, deliberately independent, because each one alone is arguable:
 *
 *  - **`SystemInfo.getProcessInfo`** — cumulative CPU seconds per *browser
 *    process* (renderer, GPU, browser, viz). This is the number Activity
 *    Monitor shows a human, and the only one that can see the GPU process.
 *  - **`Performance.getMetrics`** — `ThreadTime` (renderer main thread) and
 *    `ProcessTime` (all its threads). Not frozen, unlike `performance.memory`.
 *  - **in-page accumulators** — every `system.update`, `system.lateUpdate`,
 *    `post.update` and `post.render` wrapped with `performance.now()`, so the
 *    main-thread millisecond is attributed to a *name* rather than guessed at.
 *    `BRIEF.md`'s "ablate before re-tinting" applies to a profile exactly as it
 *    does to a frame.
 *
 * ## The ablation, and why it is A/B/A
 *
 * The default runs **running -> stopped -> running**. `stop()` cancels the rAF
 * loop and nothing else: the page, the world, the GL context and every timer
 * survive. So the difference is the render loop, and the *stopped* arm is what
 * anything else — a timer, a microtask storm, a converge loop that never
 * reports finished — would show up in. Chrome throttles `requestAnimationFrame`
 * in a background tab and does not throttle a timer, which is the same
 * discriminator from the other side; `--hidden` runs it directly where the
 * build supports the override.
 *
 * A/B/A rather than A/B because a 15 s window on a laptop drifts, and a second
 * running arm that does not match the first says so instead of hiding it.
 */
import { pathToFileURL } from 'node:url';
import { harnessArgs, announceBuild, lease, pageOpts, withExclusive, EXIT_BUSY } from './harness.mts';
import { printContention, contention } from './ruler.mts';
import { powerWarning } from './power.mts';
import type { Page } from 'playwright';

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(n);
const num = (n: string, d: number) => { const i = argv.indexOf(n); return i < 0 ? d : Number(argv[i + 1]); };

/** One CPU-time reading, from all three oracles at once. */
export interface CpuSample {
  wallMs: number;
  /** `SystemInfo.getProcessInfo`, seconds of CPU, keyed by process type. */
  proc: Record<string, number>;
  /** `Performance.getMetrics`, seconds. */
  metrics: Record<string, number>;
}

interface FrameProfile {
  frames: number;
  /** rAF callbacks the host offered over the window, drawn or skipped. */
  ticks: number;
  wallMs: number;
  /** name -> total ms spent inside it over the window */
  rows: Record<string, number>;
  /** total ms inside `Game.frame`, measured around the whole body */
  frameMs: number;
  visibility: string;
  running: boolean;
  dpr: number;
  pixelRatio: number;
  drawW: number;
  drawH: number;
  quality: string;
  /** `Game.maxFps` — the render loop's frame-rate cap, 0 if it is free-running. */
  maxFps: number;
}

/**
 * Install the per-subsystem accumulators on a LIVE, running page.
 *
 * Wrapping mid-flight is safe and is the point: the loop must not be stopped to
 * measure it, or the measurement is of a page in a state no player is ever in.
 * `performance.now()` is ~50 ns and there are about sixty wrapped calls a
 * frame, so the instrument costs well under 1% of what it reads.
 */
const INSTALL = `(() => {
  const g = window.GAME;
  const w = window;
  if (w.__idlecpu) return 'already installed';
  const acc = Object.create(null);
  const now = () => performance.now();
  // Invert the registry to get a canonical name per system. Aliases are set
  // after the key in Game.add(), so first-write-wins is the canonical one.
  const named = new Map();
  for (const [k, s] of g._registry) if (!named.has(s)) named.set(s, k);
  const wrap = (obj, fn, label) => {
    const orig = obj[fn];
    if (typeof orig !== 'function' || orig.__idle) return;
    const patched = function (...a) {
      const t0 = now();
      try { return orig.apply(this, a); } finally { acc[label] = (acc[label] || 0) + (now() - t0); }
    };
    patched.__idle = true;
    obj[fn] = patched;
  };
  for (const s of g.systems) {
    const n = named.get(s) || s.constructor.name || '?';
    if (s.update) wrap(s, 'update', n + '.update');
    if (s.lateUpdate) wrap(s, 'lateUpdate', n + '.lateUpdate');
  }
  if (g.post) { wrap(g.post, 'update', 'post.update'); wrap(g.post, 'render', 'post.render'); }
  if (g.input) wrap(g.input, 'update', 'input.update');
  // The whole frame, so "everything the table does not name" is derivable
  // rather than assumed to be zero.
  wrap(g, 'frame', '__frame');
  // k0 is the rAF OFFER, against f0's frames DRAWN.
  //
  // Game.start() caps itself by SKIPPING rAF callbacks, so g.time.frame cannot
  // tell a capped loop on a fast display from an uncapped one on a slow display
  // -- and the gate has to resolve exactly that. Game._rafTicks counts the
  // offer from inside the callback that already exists.
  //
  // This was a second rAF chain installed here, which was wrong: rAF callbacks
  // make the compositor schedule BeginFrames, and the chain's own scheduling
  // read as ~2% of a core in the *stopped* arm -- doubling the one number in
  // this tool that is supposed to be near zero, and it is the load-bearing
  // assertion. An instrument may not spend in the arm it is ablating.
  w.__idlecpu = { acc, t0: now(), f0: g.time.frame, k0: g._rafTicks };
  return 'installed';
})()`;

const READ = `(() => {
  const g = window.GAME;
  const w = window.__idlecpu;
  const rows = {};
  for (const k of Object.keys(w.acc)) rows[k] = +w.acc[k].toFixed(1);
  const frameMs = rows.__frame || 0;
  delete rows.__frame;
  return {
    frames: g.time.frame - w.f0,
    // rAF callbacks the host offered over the window, drawn or skipped.
    ticks: g._rafTicks - w.k0,
    wallMs: performance.now() - w.t0,
    rows, frameMs,
    visibility: document.visibilityState,
    running: !!g._running,
    // The pixel count is half the cost and headless does not have the human's
    // display. A Retina panel reports devicePixelRatio 2, and Renderer.ts then
    // asks for min(dpr, 1.5) at 'high' and min(dpr, 2) at 'ultra' -- so the
    // same loop draws 2.25x or 4x the pixels on the machine the complaint came
    // from. Quoting a headless percentage without this line understates it.
    dpr: window.devicePixelRatio,
    pixelRatio: g.renderer.getPixelRatio(),
    drawW: g.renderer.getContext().drawingBufferWidth,
    drawH: g.renderer.getContext().drawingBufferHeight,
    quality: g.rnd ? g.rnd.quality : (g.renderer.quality || '?'),
    maxFps: g.maxFps,
  };
})()`;

const ZERO = `(() => {
  const w = window.__idlecpu;
  for (const k of Object.keys(w.acc)) delete w.acc[k];
  w.t0 = performance.now(); w.f0 = window.GAME.time.frame; w.k0 = window.GAME._rafTicks;
  return true;
})()`;

/** CPU seconds per browser process type, and the renderer's own metrics. */
type Cdp = { send: (m: never, p?: never) => Promise<unknown> };

async function sample(page: Page, sys: Cdp | null, perf: Cdp): Promise<CpuSample> {
  const proc: Record<string, number> = {};
  if (sys) {
    const info = await sys.send('SystemInfo.getProcessInfo' as never).catch(() => null) as
      { processInfo: { type: string, id: number, cpuTime: number }[] } | null;
    for (const p of info?.processInfo ?? []) proc[p.type] = (proc[p.type] ?? 0) + p.cpuTime;
  }
  const m = await perf.send('Performance.getMetrics' as never).catch(() => null) as
    { metrics: { name: string, value: number }[] } | null;
  const metrics: Record<string, number> = {};
  for (const e of m?.metrics ?? []) metrics[e.name] = e.value;
  return { wallMs: Date.now(), proc, metrics };
}

const diff = (a: Record<string, number>, b: Record<string, number>): Record<string, number> => {
  const o: Record<string, number> = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) o[k] = (b[k] ?? 0) - (a[k] ?? 0);
  return o;
};

/** A percentage of one core, from CPU seconds over a wall-clock window. */
const pct = (cpuSec: number, wallMs: number) => (cpuSec * 1000 / wallMs) * 100;
const p1 = (x: number) => `${x.toFixed(1)}%`;

interface Arm {
  name: string;
  wallMs: number;
  proc: Record<string, number>;
  metrics: Record<string, number>;
  prof: FrameProfile | null;
}

function report(arms: Arm[]) {
  console.log('\n=== CPU of an idle tab, by browser process (% of ONE core)');
  const types = [...new Set(arms.flatMap((a) => Object.keys(a.proc)))].sort();
  console.log(`  ${'arm'.padEnd(12)}${types.map((t) => t.slice(0, 9).padStart(11)).join('')}${'TOTAL'.padStart(11)}`
    + `${'rAF Hz'.padStart(9)}${'fps'.padStart(9)}`);
  for (const a of arms) {
    let total = 0;
    const cells = types.map((t) => { total += a.proc[t] ?? 0; return p1(pct(a.proc[t] ?? 0, a.wallMs)).padStart(11); });
    const per = (n: number) => (a.prof && a.prof.wallMs > 0 ? n / (a.prof.wallMs / 1000) : 0);
    /**
     * `rAF Hz` is what the host OFFERED and `fps` is what the loop DREW; the
     * gap between them is `Game.maxFps` doing its job. They were the same
     * number before the cap existed, which is why this column is new — and
     * headless chromium does not vsync, so its offer moves with the box and
     * neither column can be inferred from the other.
     *
     * Both are counted inside `Game.start()`'s own callback, so the `stopped`
     * arm reads 0 for both: that loop is cancelled and there is nothing left
     * to offer it. rAF itself keeps firing there — see the header — this just
     * refuses to spend a BeginFrame proving it.
     */
    console.log(`  ${a.name.padEnd(12)}${cells.join('')}${p1(pct(total, a.wallMs)).padStart(11)}`
      + `${(a.prof ? per(a.prof.ticks).toFixed(1) : '—').padStart(9)}`
      + `${(a.prof ? per(a.prof.frames).toFixed(1) : '—').padStart(9)}`);
  }
  /**
   * Headless does not vsync, so the raw percentage above is NOT what a person
   * sees — it is what the loop costs when nothing caps it. A real tab's rAF is
   * locked to the display, so the honest projection is per-frame CPU times the
   * refresh rate. 60 Hz is a normal panel; 120 Hz is every ProMotion Mac and
   * every gaming monitor, and the loop takes the frames if they are offered.
   */
  console.log('\n=== the same, projected onto a VSYNC-LOCKED tab (per-frame CPU x refresh)');
  console.log(`  ${'arm'.padEnd(12)}${'CPU ms/frame'.padStart(14)}${'at 60 Hz'.padStart(11)}${'at 120 Hz'.padStart(11)}`);
  for (const a of arms) {
    if (!a.prof || !a.prof.frames) continue;
    const cpuSec = Object.values(a.proc).reduce((x, y) => x + y, 0);
    const perFrameMs = cpuSec * 1000 / a.prof.frames;
    console.log(`  ${a.name.padEnd(12)}${perFrameMs.toFixed(2).padStart(14)}`
      + `${p1(perFrameMs * 60 / 10).padStart(11)}${p1(perFrameMs * 120 / 10).padStart(11)}`);
  }

  console.log('\n=== the renderer main thread (Performance.getMetrics)');
  const KEYS = ['ThreadTime', 'ProcessTime', 'TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'];
  console.log(`  ${'arm'.padEnd(12)}${KEYS.map((k) => k.slice(0, 10).padStart(12)).join('')}`);
  for (const a of arms) {
    console.log(`  ${a.name.padEnd(12)}${KEYS.map((k) => p1(pct(a.metrics[k] ?? 0, a.wallMs)).padStart(12)).join('')}`);
  }

  for (const a of arms) {
    if (!a.prof || !a.prof.frames) continue;
    const f = a.prof;
    console.log(`\n=== ${a.name}: where the main-thread millisecond goes`);
    console.log(`  ${f.frames} frames in ${(f.wallMs / 1000).toFixed(2)} s `
      + `= ${(f.frames / (f.wallMs / 1000)).toFixed(1)} fps, `
      + `${(f.frameMs / f.frames).toFixed(2)} ms per frame inside Game.frame(), `
      + `visibility ${f.visibility}`);
    console.log(`  q=${f.quality} · devicePixelRatio ${f.dpr} · renderer pixelRatio ${f.pixelRatio}`
      + ` · drawing buffer ${f.drawW}x${f.drawH} = ${(f.drawW * f.drawH / 1e6).toFixed(2)} Mpx`);
    const rows = Object.entries(f.rows).sort((x, y) => y[1] - x[1]);
    // `post.render` nests nothing; the system rows nest nothing; but every row
    // sits INSIDE `__frame`, so the remainder is real and worth naming.
    const named = rows.reduce((s, [, v]) => s + v, 0);
    console.log(`  ${'ms/frame'.padStart(10)}  ${'% of frame'.padStart(11)}  ${'% of a core'.padStart(12)}  what`);
    for (const [k, v] of rows) {
      if (v / f.frames < 0.02) continue;
      console.log(`  ${(v / f.frames).toFixed(2).padStart(10)}  ${((v / f.frameMs) * 100).toFixed(1).padStart(10)}%`
        + `  ${p1(pct(v / 1000, f.wallMs)).padStart(12)}  ${k}`);
    }
    const rem = f.frameMs - named;
    console.log(`  ${(rem / f.frames).toFixed(2).padStart(10)}  ${((rem / f.frameMs) * 100).toFixed(1).padStart(10)}%`
      + `  ${p1(pct(rem / 1000, f.wallMs)).padStart(12)}  (Game.frame remainder — the loop's own body)`);
    console.log(`  ${(f.frameMs / f.frames).toFixed(2).padStart(10)}  ${'100.0%'.padStart(11)}`
      + `  ${p1(pct(f.frameMs / 1000, f.wallMs)).padStart(12)}  Game.frame() TOTAL`);
  }
}

/**
 * The gate, and the one thing it is really guarding.
 *
 * **`STOPPED_MAX` is the assertion that matters.** With the rAF loop cancelled
 * and nothing else changed, an idle page costs 0.5–2.4% of a core, and that is
 * the *whole* non-loop cost of this game: no timer, no interval, no microtask
 * storm, no streaming loop still converging. Anything that introduces one —
 * a `setInterval` for a day cycle, a poll for a network feature, a converge
 * that stops reporting finished — lands squarely in this arm and nowhere else
 * in the suite. It is also the arm least sensitive to a busy box, because a
 * page doing nothing does not do more of it under contention.
 *
 * `FRAME_CPU_MAX` guards the other half: what one rendered frame costs across
 * every browser process, GPU included. 16.5 ms today, and the budget is loose
 * on purpose. `perf.mts` cannot see this number at all — it steps frames by
 * hand and times the main thread, so a regression that lands in the GPU
 * process or the compositor is invisible to it.
 *
 * `CAP_SLACK` guards the *product* of those two, which is the number a person
 * feels and the reason this tool exists. Idle CPU is `frame cost x frame rate`;
 * the two budgets above bound the first factor twice over and neither says a
 * word about the second. `Game.start()` now caps the loop (see its comment),
 * and this is the only assertion in the suite that would notice if it stopped:
 * every other gate poses a `?shoot=1` page that never calls `start()` at all.
 *
 * **It is conditional on the host's rAF rate, and that is not a hedge.** The
 * cap is a vsync divisor and it *floors* rather than rounds, so a host offering
 * fewer than `2 x cap` callbacks a second has no legal division: the only
 * alternative to drawing every one is dropping under the cap, and `BRIEF.md`
 * rule 3's floor wins that. On such a host the loop is *supposed* to draw every
 * callback, and asserting a rate there would be asserting a bug.
 *
 * That case is not hypothetical, and it is not only 75/90/100 Hz panels:
 * **headless chromium's rAF is not vsync-locked**, and its rate moves with the
 * box. Measured minutes apart on this machine, the same arm was offered
 * ~120 Hz (loop drew 60.0, divisor 2) and ~90 Hz (loop drew 90.5, correctly
 * uncapped). A flat `fps <= 75` would have failed the second one for doing the
 * right thing — a gate that flakes by punishing correct behaviour, which is
 * worse than no gate.
 *
 * So count the offer as well as the draw: `Game._rafTicks` counts callbacks
 * from inside the loop's own callback, against `time.frame`'s draws. Above
 * `2 x cap` the cap must bite and the drawn rate is asserted; below it, only
 * that the cap is configured and that the loop is not drawing more often than
 * it is called. Both branches print the rAF rate, so the row says which one
 * ran.
 *
 * The slack is not a tolerance for noise — the cap can only ever *skip* a
 * frame, so contention pushes the drawn rate down and never up, and a busy box
 * cannot fail this. It is there for the divisor: at 144 Hz the loop draws
 * 72 fps, 1.2x the cap, because 60 is not reachable there.
 */
const STOPPED_MAX = 15;
const FRAME_CPU_MAX = 28;
const CAP_SLACK = 1.25;

/**
 * "Is the render loop capped, and is it honouring the cap?" — see the block
 * above for why the answer depends on how fast the host offers rAF callbacks.
 */
function capCheck(cap: number, fps: number, rafHz: number): [string, boolean, string] {
  const where = `Game.maxFps ${cap}, host rAF ${rafHz.toFixed(1)} Hz, drew ${fps.toFixed(1)} fps`;
  if (!(cap > 0)) {
    return ['the render loop is capped, and honours its cap', false,
      'Game.maxFps is 0 — the loop free-runs at whatever rate the host offers'];
  }
  if (rafHz >= cap * 2) {
    return ['the render loop is capped, and honours its cap', fps <= cap * CAP_SLACK,
      `${where}, budget ${(cap * CAP_SLACK).toFixed(1)}`];
  }
  return ['the render loop is capped (host too slow for the cap to bite)',
    fps <= rafHz * 1.05,
    `${where} — under ${cap * 2} Hz there is no division that stays at or above the cap, `
    + 'so drawing every callback is correct'];
}

function gate(arms: Arm[]): boolean {
  const armOf = (n: string) => arms.find((a) => a.name === n);
  const stopped = armOf('stopped');
  const running = armOf('running2') ?? armOf('running');
  if (!stopped || !running || !running.prof?.frames) {
    console.log('idlecpu: FAIL — the ablation did not produce both arms');
    return false;
  }
  const stoppedPct = pct(Object.values(stopped.proc).reduce((x, y) => x + y, 0), stopped.wallMs);
  const frameCpu = Object.values(running.proc).reduce((x, y) => x + y, 0) * 1000 / running.prof.frames;
  const cap = running.prof.maxFps;
  const fps = running.prof.frames / (running.prof.wallMs / 1000);
  const checks: [string, boolean, string][] = [
    ['an idle page with the render loop stopped costs nothing',
      stoppedPct <= STOPPED_MAX, `${p1(stoppedPct)} of a core, budget ${p1(STOPPED_MAX)}`],
    ['one rendered frame stays inside its whole-browser CPU budget',
      frameCpu <= FRAME_CPU_MAX, `${frameCpu.toFixed(2)} CPU ms/frame = ${p1(frameCpu * 60 / 10)} of a core at 60 Hz, budget ${FRAME_CPU_MAX} ms`],
    capCheck(cap, fps, running.prof.ticks / (running.prof.wallMs / 1000)),
  ];
  let ok = true;
  for (const [what, pass, detail] of checks) {
    console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${what} — ${detail}`);
    if (!pass) ok = false;
  }
  console.log(`\nidlecpu: ${ok ? 'PASS' : 'FAIL'} — stopped ${p1(stoppedPct)}, `
    + `${frameCpu.toFixed(2)} CPU ms/frame, drew ${fps.toFixed(1)} fps of the `
    + `${(running.prof.ticks / (running.prof.wallMs / 1000)).toFixed(1)} Hz offered, cap ${cap}`);
  return ok;
}

async function main() {
  const GATE = flag('--gate');
  const SECS = num('--secs', GATE ? 8 : 15);
  const ABLATE = !flag('--no-ablate');
  const HIDDEN = flag('--hidden');
  const DPR = num('--dpr', 0);
  printContention();
  const pw = powerWarning();
  if (pw) console.log(pw);

  const ha = harnessArgs(argv, { q: 'ultra', play: true });
  announceBuild(ha);
  const leased = await lease(pageOpts(ha));
  const page = leased.page;
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).split('\n')[0]));
  const perfCdp = await page.context().newCDPSession(page);
  await perfCdp.send('Performance.enable', { timeDomain: 'threadTicks' });
  // Browser-level session: `SystemInfo` is not a page domain, and the GPU
  // process — which no in-page oracle can see — is half the question.
  const sysCdp = await (leased.browser as unknown as
    { newBrowserCDPSession: () => Promise<Cdp> })
    .newBrowserCDPSession().catch(() => null);
  if (!sysCdp) console.log('[idlecpu] no browser-level CDP session; per-process CPU unavailable');

  const arms: Arm[] = [];
  let failed = false;
  try {
    const installed = await page.evaluate(INSTALL);
    console.log(`[idlecpu] instrument ${installed}; page is ${await page.evaluate('!!window.GAME._running') ? 'RUNNING' : 'STOPPED'}`);
    const run = async (name: string, pre?: () => Promise<unknown>) => {
      if (pre) await pre();
      await page.evaluate(ZERO);
      const a = await sample(page, sysCdp, perfCdp as unknown as Cdp);
      await new Promise((r) => setTimeout(r, SECS * 1000));
      const b = await sample(page, sysCdp, perfCdp as unknown as Cdp);
      const prof = await page.evaluate(READ) as FrameProfile;
      arms.push({ name, wallMs: b.wallMs - a.wallMs, proc: diff(a.proc, b.proc), metrics: diff(a.metrics, b.metrics), prof });
      console.log(`[idlecpu] arm "${name}" done (${((b.wallMs - a.wallMs) / 1000).toFixed(1)} s, ${prof.frames} frames)`);
    };

    await run('running');
    if (ABLATE) {
      await run('stopped', () => page.evaluate('window.GAME.stop()'));
      await run('running2', () => page.evaluate('window.GAME.start()'));
    }
    /**
     * The background-tab arm, which is the cheapest discriminator there is.
     *
     * Chrome throttles `requestAnimationFrame` in a hidden tab and does NOT
     * throttle a timer, so an idle cost that survives being hidden is
     * timer-driven and one that collapses is the render loop. Half the search
     * space for the price of one window.
     */
    if (HIDDEN) {
      const ok = await perfCdp.send('Emulation.setPageVisibilityOverride' as never, { hidden: true } as never)
        .then(() => true).catch(() => false);
      console.log(`[idlecpu] visibility override: ${ok ? 'hidden' : 'UNSUPPORTED by this build'}`);
      if (ok) await run('hidden');
    }
    /**
     * The Retina arm, and the reason a headless percentage understates this.
     *
     * Headless reports `devicePixelRatio` 1, so the drawing buffer is 1600x900
     * = 1.44 Mpx. The machine the complaint came from reports 2, and
     * `Renderer.ts` then asks for `min(dpr, 1.5)` at `q=high` and `min(dpr, 2)`
     * at `q=ultra` — 3.24 Mpx and 5.76 Mpx, 2.25x and 4x the pixels of what a
     * headless run measures. `post.render` is three quarters of the frame and
     * scales with pixels, so this is not a rounding term.
     *
     * `setPixelRatio` + `resize()` is the supported path: `PostFX` re-sizes its
     * whole chain off `rnd.onResize`, which is what a window resize does
     * anyway.
     */
    if (DPR > 0) {
      await run(`dpr${DPR}`, () => page.evaluate((r) => {
        const g = window.GAME as unknown as { rnd: { renderer: { setPixelRatio: (n: number) => void }, resize: () => void } };
        g.rnd.renderer.setPixelRatio(r); g.rnd.resize();
      }, DPR));
    }
  } finally {
    report(arms);
    // Release FIRST. `contention()` counts headless chromiums and load average,
    // and the browser this tool is measuring is one of each -- checking before
    // the lease is given back reports our own instrument as somebody else's
    // load, which is how a clean run prints "CONTENDED" with an empty list of
    // worktrees.
    await leased.release();
    if (GATE) failed = !gate(arms);
    const after = contention();
    if (after.busy) {
      console.log(`\n!! CONTENDED by the end — load ${after.load1.toFixed(2)}`
        + `${after.trees.length ? `, live worktrees: ${after.trees.join(', ')}` : ''}. Not a baseline.`);
    }
  }
  if (failed) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await withExclusive('idlecpu', main).catch((e) => {
    if ((e as { busy?: true }).busy) { console.error(`[harness] ${(e as Error).message}`); process.exit(EXIT_BUSY); }
    console.error(e); process.exit(1);
  });
}
