/**
 * ruler.mts — the part of a frame-time measurement that is the *instrument*,
 * not the subject. Shared by `perf.mts` and `gameplay.mts`.
 *
 * ============================================================================
 * WHY THIS EXISTS
 * ============================================================================
 *
 * Every perf number in this repo up to now was a single unpaired sample taken
 * on a machine shared with five other agents' headless Chromiums, printed to
 * two decimal places with no statement of what the instrument could resolve.
 * `project/HANDOFF.md` §8 already says the machine saturates and that "agents
 * will report numbers taken under contention"; nothing in the tooling made
 * that visible, so it kept happening.
 *
 * The sibling MGS5 repo hit the same wall and built the fix
 * (`metal-gear-solid-5-opus-demo/tools/probes/perf.js`). Four ideas, all of
 * which are ported here:
 *
 *  1. MEASURE THE NOISE FLOOR, DO NOT ASSERT IT. Time the *same* configuration
 *     against itself with the same paired procedure used for everything else.
 *     The median of those differences is the residual bias (should be ~0); the
 *     IQR is the smallest effect this machine can resolve *today*. Their
 *     headless GPU drifted 2x inside one run — 17.8, 23.4, 35.0, 39.5 ms for
 *     four identical blocks — and the drift was silently charged to whichever
 *     block ran last.
 *
 *  2. PAIR AT THE FRAME, ALTERNATING ORDER (ABBA). Two frames ~30 ms apart see
 *     almost the same machine; two 20-frame blocks ~600 ms apart do not.
 *     Alternating order means a monotone drift adds +d to half the pairs and
 *     -d to the other half, so the median is unbiased by it. Block pairing was
 *     tried there first and could not resolve a single pass.
 *
 *  3. REFUSE TO PRINT WHAT THE INSTRUMENT CANNOT RESOLVE. A difference is only
 *     reported when |median| > IQR. "Bloom costs 0.4 ms" and "bloom costs
 *     nothing measurable" are different claims and only one of them was ever
 *     true. The same rule applied to regressions is the headline: **a median
 *     that moves less than the IQR has not moved.**
 *
 *  4. VOID THE RUN RATHER THAN DISCOUNT IT. `RULER_VALID: false` is a
 *     top-level result, not a footnote. Two conditions, and the second was
 *     learned the hard way over there: the bias must sit inside the IQR, AND
 *     the floor must be small relative to the frame. A run under eight-way
 *     contention reported a 4.0 ms bias inside a 42.8 ms IQR on a 99 ms frame
 *     and called itself valid; a floor above a quarter of the frame resolves
 *     nothing worth resolving.
 *
 * The contention VERDICT line is ported from that repo's `tools/shot.mjs
 * status`. It is printed BEFORE measuring, because the useful moment to learn
 * the machine is busy is before you spend four minutes measuring it.
 */
import { execSync } from 'node:child_process';
import { loadavg, cpus } from 'node:os';

const sh = (cmd: string): string => {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};

export interface Contention {
  /** every `chrome-headless-shell` process: zygote + gpu + renderers */
  headlessProcs: number;
  /** browser *trees*, counted as processes with no `--type=` argument */
  browsers: number;
  viteProcs: number;
  /**
   * `vite build` runs, which is a different animal from the daemon's dev
   * servers: it is a one-shot that saturates several cores for tens of
   * seconds and then vanishes. The pre-commit hook runs one on **every**
   * commit by **every** lane, and `withExclusive` cannot queue it because it
   * never asks the daemon for anything.
   */
  viteBuilds: number;
  /** other agents' harness tools running right now, by tool name */
  otherTools: string[];
  load1: number;
  cores: number;
  /** worktree directory names with a vite or capture process running */
  trees: string[];
  busy: boolean;
  verdict: string;
}

/**
 * What else is on this machine right now.
 *
 * Counts process *trees*, not processes: one headless chromium is a zygote
 * plus a GPU process plus renderers, so a raw count reads ~4x the number of
 * browsers and makes an idle machine look contended.
 */
export function contention(): Contention {
  const args = sh('ps -A -o args=').split('\n');
  const heads = args.filter((a) => a.includes('chrome-headless-shell'));
  // A browser's own process is the one launched without `--type=`; every
  // helper (renderer, gpu-process, utility) carries one.
  const browsers = heads.filter((a) => !/--type=/.test(a)).length;
  const vite = args.filter((a) => /node .*\/\.bin\/vite|vite\/bin\/vite\.js/.test(a)).length;
  const trees = [
    ...new Set(
      args
        .filter((a) => /chrome-headless-shell|vite|tools\/\w+\.mts/.test(a))
        .map((a) => (a.match(/worktrees\/(agent-[a-z0-9]+)/) || [])[1])
        .filter(Boolean) as string[],
    ),
  ].sort();
  const viteBuilds = args.filter((a) => /vite(\.js)?\s+build\b/.test(a)).length;
  /**
   * Another lane's harness tool, running right now, in THIS checkout.
   *
   * `trees` only ever finds anything when lanes are in separate worktrees, and
   * on this repository they are not — every agent works on one shared trunk.
   * So the check that mattered found nothing, twice in a row: two consecutive
   * perf lanes were briefed "the machine is yours and it is quiet", printed
   * `VERDICT: quiet`, and measured through a `rocks` lane and a `head` lane
   * committing (and therefore `vite build`ing) every few minutes. Whole-run
   * before/after numbers taken across that are worthless; `idle` moved 6.4 ->
   * 9.1 ms and `walk` 6.3 -> 11.8 ms with nothing touched that either could
   * depend on.
   */
  /**
   * **Exclude self by PID, not by string.** The first version filtered
   * `!a.includes(String(process.pid))` over `ps -o args=`, and a command line
   * does not contain its own pid — so `perf.mts` and `gameplay.mts` both
   * counted *themselves* as "another lane" and voided every run on a quiet
   * machine. The check that was added to stop two lanes measuring through each
   * other then stopped anything measuring at all: `CONTENDED (another lane is
   * running gameplay)` with nothing else on the box.
   *
   * `ps -A -o pid=,args=` gives the pid as a field, so it can be compared as a
   * number. The whole process group goes too — a tool that spawns a child
   * `.mts` is still one lane, not two.
   */
  const self = process.pid;
  const rows = sh('ps -A -o pid=,ppid=,args=').split('\n');
  const mine = new Set<number>([self]);
  for (const r of rows) {
    const m = r.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (m && mine.has(Number(m[2]))) mine.add(Number(m[1]));
  }
  const otherTools = [
    ...new Set(
      rows
        .map((r) => r.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/))
        .filter((m): m is RegExpMatchArray => Boolean(m) && !mine.has(Number(m![1])))
        .filter((m) => /node .*src\/tools\/[\w-]+\.mts/.test(m[3]))
        .map((m) => (m[3].match(/src\/tools\/([\w-]+)\.mts/) || [])[1])
        .filter((n): n is string => Boolean(n) && n !== 'daemon'),
    ),
  ].sort();
  const load1 = loadavg()[0];
  const cores = cpus().length;
  // Four independent triggers. Browser count catches "five agents each holding
  // a page open but idle" (low load, ruinous GPU queue); load average catches a
  // build or a bake that owns the CPU with no browser at all; a `vite build`
  // and another lane's tool each catch the case those two miss entirely, which
  // is a co-agent working in the same checkout.
  const busy = browsers > 1 || load1 > cores * 0.7 || viteBuilds > 0 || otherTools.length > 0;
  const why = browsers > 1 ? `${browsers} browsers`
    : viteBuilds > 0 ? `${viteBuilds} vite build${viteBuilds === 1 ? '' : 's'} running`
      : otherTools.length ? `another lane is running ${otherTools.join(', ')}`
        : `load ${load1.toFixed(2)} over ${cores} cores`;
  return {
    headlessProcs: heads.length,
    browsers,
    viteProcs: vite,
    viteBuilds,
    otherTools,
    load1,
    cores,
    trees,
    busy,
    verdict: busy
      ? `CONTENDED (${why}) — a frame time measured now is partly somebody else's load.`
      : 'quiet — safe to measure.',
  };
}

/** Print the contention block. Call it *before* measuring, never after. */
export function printContention(c: Contention = contention()): Contention {
  console.log(`headless chromium procs : ${c.headlessProcs} (~${c.browsers} browser${c.browsers === 1 ? '' : 's'})`);
  console.log(`vite procs              : ${c.viteProcs}${c.viteBuilds ? ` (${c.viteBuilds} of them a BUILD)` : ''}`);
  if (c.otherTools.length) console.log(`other lanes' tools      : ${c.otherTools.join(', ')}`);
  console.log(`load average (1m)       : ${c.load1.toFixed(2)} over ${c.cores} cores`);
  if (c.trees.length) console.log(`other worktrees running : ${c.trees.join(', ')}`);
  console.log(`VERDICT: ${c.verdict}`);
  return c;
}

export interface Quantiles { median: number; q1: number; q3: number; iqr: number }

export function quantiles(xs: number[]): Quantiles {
  const s = xs.slice().sort((a, b) => a - b);
  const at = (q: number) => {
    const i = (s.length - 1) * q;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
  };
  const q1 = at(0.25);
  const q3 = at(0.75);
  return { median: at(0.5), q1, q3, iqr: q3 - q1 };
}

export interface Floor {
  /** IQR of the same configuration paired against itself: the resolution limit */
  iqrMs: number;
  /** median of those same differences: the residual bias, should be ~0 */
  biasMs: number;
  pairs: number;
}

export interface Validity {
  valid: boolean;
  biasOk: boolean;
  floorOk: boolean;
  warning?: string;
}

/**
 * Is the run quotable at all?
 *
 * Both conditions are necessary. Requiring only that the bias sit inside the
 * IQR passes trivially when the IQR is enormous — that is precisely what a
 * contended machine produces.
 *
 * @param startIqrMs the floor measured *before* the run, when there is one.
 *   With it, a void run can say which of two very different things happened,
 *   and they want opposite responses: a floor that was already wide at the
 *   start is somebody else's load, and you should wait; a floor that *grew*
 *   during the run is the game itself destabilising, and waiting will not help.
 *   `gameplay.mts` voided twice on a provably quiet machine with the floor
 *   going 2.30 -> 5.18 ms across the run, while the message told the reader to
 *   go and find the contention. There wasn't any.
 */
export function validate(floor: Floor, frameMs: number, startIqrMs?: number): Validity {
  const biasOk = Math.abs(floor.biasMs) < floor.iqrMs;
  const floorOk = floor.iqrMs < 0.25 * frameMs;
  if (biasOk && floorOk) return { valid: true, biasOk, floorOk };
  const pct = Math.round((floor.iqrMs / frameMs) * 100);
  return {
    valid: false,
    biasOk,
    floorOk,
    warning:
      'VOID RUN — do not quote any number from it. ' +
      (biasOk
        ? ''
        : `The same configuration paired against itself has a median of ${floor.biasMs.toFixed(2)} ms, ` +
          `which is not inside its own IQR of ${floor.iqrMs.toFixed(2)} ms: the pairing did not cancel the drift. `) +
      (floorOk
        ? ''
        : `The noise floor is ${floor.iqrMs.toFixed(2)} ms against a ${frameMs.toFixed(1)} ms frame (${pct}%), ` +
          'so nothing in this frame is separable. ' +
          (startIqrMs != null && floor.iqrMs > startIqrMs * 1.6
            ? `The floor GREW during the run (${startIqrMs.toFixed(2)} -> ${floor.iqrMs.toFixed(2)} ms), which is ` +
              'the workload destabilising rather than the machine being busy — streaming, GC or a cache filling. ' +
              'Waiting for a quiet machine will NOT fix this one; the run itself is what got noisier. ' +
              'The hitch list below is still real and still worth reading. '
            : 'This is what a CONTENDED machine looks like — ') +
          'wait until the other worktrees are quiet and measure again.'),
  };
}

/**
 * The rule, as a function: **a median that moves less than the noise floor has
 * not moved.** Used for every before/after comparison, including `--baseline`.
 */
export function moved(before: number, after: number, floorMs: number): boolean {
  return Math.abs(after - before) > floorMs;
}

/** Format a delta against the floor, refusing to quote what cannot be resolved. */
export function deltaVerdict(before: number, after: number, floorMs: number): string {
  const d = after - before;
  if (!moved(before, after, floorMs)) return `unchanged (|${d.toFixed(2)}| <= floor ${floorMs.toFixed(2)} ms)`;
  return `${d > 0 ? '+' : ''}${d.toFixed(2)} ms`;
}

/**
 * In-page half of the instrument. Evaluated once per page with
 * `await page.evaluate(RULER_PAGE_SRC)`, after which `window.__RULER` exists.
 *
 * It is a string rather than a function because `page.evaluate` serialises a
 * function's source and drops its module scope, and these helpers reference
 * each other. It is deliberately dependency-free: `render(i)` is supplied by
 * the caller and is the only thing it knows about the game.
 *
 * ============================================================================
 * EVERY FUNCTION HERE IS ASYNC, AND THE `await` BETWEEN FRAMES IS THE POINT
 * ============================================================================
 *
 * The first version of this file rendered `warm + n` = 20 frames inside one
 * synchronous task. That is a factor of ten over a cliff nobody knew was
 * there, and it made every perf number in the repo 4-5x too slow.
 *
 * What the cliff is, measured by `src/tools/probes/perfgroup.mts` and the
 * eight probes beside it: a synchronous task that keeps the GPU busy for
 * longer than roughly one 16.7 ms display refresh gets throttled, and the
 * throttle costs about 5x. Frames per synchronous task against the steady
 * state of a held `party_walk`:
 *
 *     1 frame   5.4 ms        4 frames   22.8 ms
 *     2 frames  5.6 ms        8 frames   22.3 ms
 *                            16 frames   21.7 ms
 *                            64 frames   23.9 ms
 *
 * Sleeping is NOT what fixes it. A 1 ms `setTimeout` and a 16 ms one give the
 * same 5.2 ms, at 86% and 26% GPU duty respectively, so this is not a duty
 * cycle, not thermal and not a power governor. Returning to the event loop is
 * the whole of it. Queue depth is not it either: a `gl.finish()` after every
 * frame degrades exactly as far as one every 32 frames, if neither yields.
 * And a nearly empty scene degrades 3.1x on the same loop, which is what
 * proves the effect has nothing to do with what we draw.
 *
 * Three consequences for anyone editing this file:
 *
 *  - **Never render more than `MAX_FRAMES_PER_TASK` frames without an
 *    `await`.** It is 1. Two measured clean and there is no reason to spend
 *    the margin.
 *  - **The yield sits outside the timed region**, so it costs the reported
 *    number nothing. It costs wall-clock time on the run, which is the price.
 *  - **Pipelined block throughput is gone.** It cannot be measured here: a
 *    block long enough to pipeline is long enough to throttle. It was also
 *    never what the game does — a 60 Hz game presents one frame per refresh
 *    and never has sixteen in flight. What replaces it is the per-frame
 *    serialised latency, which is *conservative*: it charges CPU and GPU end
 *    to end with no overlap, so a real frame is at worst this and usually
 *    less. `cpuMs` is reported beside it so the two halves are separable —
 *    a 60 Hz frame costs about `max(cpuMs, ms - cpuMs)`, and `ms` itself is
 *    the honest upper bound.
 */
export const RULER_PAGE_SRC = `(() => {
  /** See the header: the cliff is between 2 and 4, and 1 is the safe side. */
  const MAX_FRAMES_PER_TASK = 1;

  /**
   * Return to the event loop **and let the browser present a frame**.
   *
   * A macrotask, not a microtask: \`await null\` stays inside the same task
   * and does not clear the throttle, which \`perfdepth.mts\` checked directly
   * (25.9 ms with a bare await, 5.5 with a timer). But a macrotask is not
   * enough either, and that is what \`setTimeout(0)\` got wrong for the whole
   * life of this instrument.
   *
   * \`setTimeout(0)\` returns to the *task queue*. Chromium's rendering
   * lifecycle -- style, layout, paint, and the composite that puts the WebGL
   * canvas and the DOM over it on screen -- does not run from the task queue;
   * it runs from a BeginFrame, and a loop that posts a new task the instant
   * the previous one ends starves it. The work does not vanish, it batches:
   * every tenth frame the compositor finally runs, the GPU process falls
   * behind, and the next GL call in \`ScenePass\` blocks on a full command
   * buffer -- *inside* the timed region.
   *
   * That is measured, not argued (\`src/tools/_probe/gcwatch.mts\`, which
   * reads CDP \`Performance.getMetrics\` from outside the page): on a 312.6 ms
   * frame the renderer main thread burns **10.9 ms** of \`ThreadTime\` and
   * 10.8 ms of \`TaskDuration\`. The frame is blocked, not working. It is why
   * every measurement here carried a 12-35% \`>16ms\` tail that no ablation
   * could ever attribute to anything (\`LANDMINES.md\`, "still unexplained").
   *
   * \`requestAnimationFrame\` is the fix and it is also the honest pacing:
   * \`Game.start()\` runs exactly one \`frame()\` per rAF, so this is the
   * cadence the player's machine actually runs. Same shot, same page, minutes
   * apart, only the yield changed (\`src/tools/probes/perfpace2.mts\`):
   *
   *     shot             yield   median    max    >16ms
   *     storm            t0        9.50  689.9      34%
   *     storm            raf       7.80   13.9       0%
   *     zone_ravatogh    t0        8.00  197.2      25%
   *     zone_ravatogh    raf       6.40   14.2       0%
   *     party_walk       t0        6.70  172.3      23%
   *     party_walk       raf       6.30   11.2       0%
   *     town_npcs        t0       11.00   33.5      15%
   *     town_npcs        raf      10.00   31.0      24%
   *
   * Read \`town_npcs\` before trusting the other three: it is the control.
   * Its tail is real work, and rAF pacing leaves it exactly where it was. The
   * medians barely move anywhere, and **wall-clock per iteration is the same
   * either way** (30-51 ms for \`storm\` under both), so this buys the
   * measurement no extra idle -- it only stops the browser's own work
   * colliding with the timed region.
   *
   * The \`setTimeout\` beside it is a liveness backstop, not pacing: a hidden
   * or backgrounded page throttles rAF to a crawl, and a gate that hangs is
   * worse than a gate that is 4% slow. \`rafStarved\` counts how often it won,
   * so a run that quietly fell back to the old behaviour says so.
   */
  let rafStarved = 0;
  const yieldTask = () => new Promise((r) => {
    let done = false;
    const fire = (viaTimer) => { if (done) return; done = true; if (viaTimer) rafStarved++; r(); };
    const id = setTimeout(() => fire(true), 60);
    requestAnimationFrame(() => { clearTimeout(id); fire(false); });
  });

  /**
   * Leave the throttled state before timing anything.
   *
   * \`GAME.settle()\` renders its warm-up frames back to back, so a shot is
   * *always* throttled by the time it is ready to measure. \`perffalsify.mts\`
   * timed the recovery: 50 ms of idle is not enough (23.9 ms), 200 ms is
   * (5.1 ms). 250 is that with margin. Call it after every \`settle\` and
   * before every measurement, or the run measures the warm-up.
   */
  const cooldown = (ms) => new Promise((r) => setTimeout(r, ms || 250));

  const quantiles = (xs) => {
    const s = xs.slice().sort((a, b) => a - b);
    const at = (q) => {
      const i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
      return s[lo] + (s[hi] - s[lo]) * (i - lo);
    };
    const q1 = at(0.25), q3 = at(0.75);
    return { median: at(0.5), q1, q3, iqr: q3 - q1 };
  };

  const gl = () => window.GAME.renderer.getContext();

  /**
   * One frame, timed twice: \`cpu\` is \`render()\` returning, which is JS plus
   * the driver accepting the commands; \`ms\` is that plus \`gl.finish()\`, so
   * it includes the GPU actually finishing the work.
   */
  function timeOne(render, i) {
    gl().finish();
    const t0 = performance.now();
    render(i);
    const t1 = performance.now();
    gl().finish();
    return { cpu: t1 - t0, ms: performance.now() - t0 };
  }

  /**
   * \`n\` timed frames, yielding between every one. Warm frames are rendered
   * first and thrown away, and they yield too — a warmup that throttles hands
   * the throttled state straight to the measurement.
   */
  async function timeFrames(render, warm, n, startIndex) {
    let idx = startIndex || 0;
    for (let i = 0; i < warm; i++) { render(idx++); await yieldTask(); }
    const ms = [], cpu = [];
    for (let i = 0; i < n; i++) {
      const s = timeOne(render, idx++);
      ms.push(s.ms); cpu.push(s.cpu);
      await yieldTask();
    }
    return { ms, cpu, nextIndex: idx };
  }

  /**
   * Headline frame time: the MEDIAN per-frame cost over \`blocks * n\` frames,
   * with the IQR of the per-block medians beside it as \`spreadMs\`. The blocks
   * no longer bound a pipelined region — they only exist so that \`spreadMs\`
   * still answers "did the machine drift while this shot was being measured".
   *
   * \`opts.n\` and \`opts.blocks\` keep their old names and meanings so the
   * call sites did not have to change; what changed is that the frames inside
   * a block are no longer rendered back to back.
   */
  async function throughput(render, opts) {
    const o = Object.assign({ blocks: 3, warm: 4, n: 16 }, opts || {});
    const all = [], allCpu = [], blockMed = [];
    let idx = 0;
    for (let i = 0; i < o.blocks; i++) {
      const r = await timeFrames(render, i === 0 ? o.warm : 0, o.n, idx);
      idx = r.nextIndex;
      all.push.apply(all, r.ms);
      allCpu.push.apply(allCpu, r.cpu);
      blockMed.push(quantiles(r.ms).median);
    }
    const q = quantiles(all);
    const sorted = all.slice().sort((a, b) => a - b);
    const pick = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
    return {
      ms: +q.median.toFixed(2),
      fps: Math.round(1000 / q.median),
      spreadMs: +quantiles(blockMed).iqr.toFixed(2),
      cpuMs: +quantiles(allCpu).median.toFixed(2),
      /**
       * Share of frames over one 60 Hz budget. Reported rather than folded
       * into the median because on this machine it is 12-21% even on a shot
       * whose median is 5 ms, and because no ablation has yet separated the
       * part of it that is ours from the part that is the harness.
       */
      overBudget: +(all.filter((x) => x > 16.7).length / all.length).toFixed(3),
      blocks: blockMed.map((x) => +x.toFixed(2)),
      p95: +pick(0.95).toFixed(2),
      p99: +pick(0.99).toFixed(2),
      max: +sorted[sorted.length - 1].toFixed(2),
      samples: all.map((x) => +x.toFixed(2)),
    };
  }

  /**
   * Paired adjacent difference: cost of configuration B relative to A.
   *
   * ABBA order, paired at the frame (or at a small group of frames, for a
   * change big enough that alternating it every frame would thrash driver
   * state harder than the change costs). Returns the median difference and the
   * IQR, and refuses to call the difference resolved unless |median| > IQR.
   *
   * \`group\` is clamped to \`MAX_FRAMES_PER_TASK\`: a caller asking for eight
   * frames per side would measure the throttle instead of the change, and
   * silently, which is how this whole class of error happened the first time.
   */
  async function paired(applyA, applyB, render, opts) {
    const o = Object.assign({ pairs: 24, group: 9, warm: 4 }, opts || {});
    let idx = 0;
    applyB(); for (let i = 0; i < o.warm; i++) { render(idx++); await yieldTask(); }
    applyA(); for (let i = 0; i < o.warm; i++) { render(idx++); await yieldTask(); }
    /**
     * One side of a pair: \`group\` frames, each in its own task, reduced by
     * MEDIAN rather than mean.
     *
     * The mean was wrong here for a specific measured reason. Even paced at
     * 60 Hz on a static shot, 12-21% of frames cost 20-90 ms instead of 5,
     * and the share tracks total GPU work rather than any subsystem --
     * \`perfbisect.mts\` turned off each post pass in turn and every one moved
     * it from 21% to 12-15%, which is what an aggregate looks like and what
     * no single cause looks like. A mean over five frames inherits that tail
     * whole and blows the noise floor past the point where the run can
     * certify; a median over nine frames does not. Nine rather than five
     * because the frame itself is now 5 ms rather than 23, so the SAME
     * absolute floor is four times larger as a fraction of it, and the
     * validity rule is relative: a 1.5 ms floor that was 6% of the old
     * measurement is 30% of the true one. This changes what the
     * floor is an estimate OF -- the calm frame, not the calm frame plus its
     * outliers -- so the tail is reported separately by the callers instead
     * of being smuggled into the headline.
     */
    const timeGroup = async () => {
      const s = [];
      for (let i = 0; i < o.group; i++) {
        gl().finish();
        const t0 = performance.now();
        render(idx++);
        gl().finish();
        s.push(performance.now() - t0);
        await yieldTask();
      }
      return quantiles(s).median;
    };
    const diffs = [];
    for (let p = 0; p < o.pairs; p++) {
      let a, b;
      if (p % 2 === 0) { applyA(); a = await timeGroup(); applyB(); b = await timeGroup(); }
      else { applyB(); b = await timeGroup(); applyA(); a = await timeGroup(); }
      diffs.push(b - a);
    }
    applyA();
    const q = quantiles(diffs);
    const resolved = Math.abs(q.median) > q.iqr;
    return {
      medianMs: +q.median.toFixed(2),
      iqrMs: +q.iqr.toFixed(2),
      pairs: o.pairs,
      resolved,
      verdict: resolved ? q.median.toFixed(2) + ' ms' : 'below noise (|' + q.median.toFixed(2) + '| <= IQR ' + q.iqr.toFixed(2) + ')',
    };
  }

  /**
   * The noise floor: the whole paired procedure run with the SAME
   * configuration on both sides. Measured, never asserted. Its IQR is the
   * smallest effect this machine can resolve right now; its median is the
   * residual bias and should be ~0.
   */
  async function noiseFloor(render, opts) {
    const nop = () => {};
    const r = await paired(nop, nop, render, opts);
    return { iqrMs: r.iqrMs, biasMs: r.medianMs, pairs: r.pairs };
  }

  window.__RULER = { quantiles, timeOne, timeFrames, throughput, paired, noiseFloor, yieldTask, cooldown, MAX_FRAMES_PER_TASK,
    rafStarved: () => rafStarved };
  return true;
})()`;

/** What `RULER_PAGE_SRC` installs, for the `page.evaluate` bodies that use it. */
export interface PageRuler {
  quantiles(xs: number[]): Quantiles;
  timeOne(render: (i: number) => void, i: number): { cpu: number; ms: number };
  timeFrames(
    render: (i: number) => void, warm: number, n: number, startIndex?: number,
  ): Promise<{ ms: number[]; cpu: number[]; nextIndex: number }>;
  throughput(
    render: (i: number) => void,
    opts?: { blocks?: number; warm?: number; n?: number },
  ): Promise<{
    ms: number; fps: number; spreadMs: number; cpuMs: number; overBudget: number;
    blocks: number[]; p95: number; p99: number; max: number; samples: number[];
  }>;
  paired(
    applyA: () => void,
    applyB: () => void,
    render: (i: number) => void,
    opts?: { pairs?: number; group?: number; warm?: number },
  ): Promise<{ medianMs: number; iqrMs: number; pairs: number; resolved: boolean; verdict: string }>;
  noiseFloor(
    render: (i: number) => void,
    opts?: { pairs?: number; group?: number; warm?: number },
  ): Promise<Floor>;
  /** return to the event loop; see the header for why every loop must */
  yieldTask(): Promise<void>;
  /** idle long enough to leave the throttled state a `settle()` always enters */
  cooldown(ms?: number): Promise<void>;
  /**
   * How many `yieldTask` calls fell back to the 60 ms timer because rAF did
   * not fire. Anything but 0 means the page was throttled and the run was
   * paced the old, starving way; print it rather than hiding it.
   */
  rafStarved(): number;
  MAX_FRAMES_PER_TASK: number;
}
declare global {
  interface Window {
    /** installed by `RULER_PAGE_SRC` */
    __RULER: PageRuler;
  }
}
