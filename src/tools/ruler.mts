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
  const load1 = loadavg()[0];
  const cores = cpus().length;
  // Two independent triggers. Browser count catches "five agents each holding a
  // page open but idle" (low load, ruinous GPU queue); load average catches a
  // build or a bake that owns the CPU with no browser at all.
  const busy = browsers > 1 || load1 > cores * 0.7;
  return {
    headlessProcs: heads.length,
    browsers,
    viteProcs: vite,
    load1,
    cores,
    trees,
    busy,
    verdict: busy
      ? 'CONTENDED — a frame time measured now is partly somebody else\'s load.'
      : 'quiet — safe to measure.',
  };
}

/** Print the contention block. Call it *before* measuring, never after. */
export function printContention(c: Contention = contention()): Contention {
  console.log(`headless chromium procs : ${c.headlessProcs} (~${c.browsers} browser${c.browsers === 1 ? '' : 's'})`);
  console.log(`vite procs              : ${c.viteProcs}`);
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
 */
export function validate(floor: Floor, frameMs: number): Validity {
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
          'so nothing in this frame is separable. This is what a CONTENDED machine looks like — ' +
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
 */
export const RULER_PAGE_SRC = `(() => {
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
   * Throughput of one block: warm frames, a finish, N timed frames, a finish.
   * Frames inside the block are PIPELINED, which is how the game actually
   * runs. Per-frame gl.finish() instead measures latency with a full pipeline
   * bubble per frame and reads systematically slower.
   */
  function timeBlock(render, warm, n) {
    for (let i = 0; i < warm; i++) render(i);
    gl().finish();
    const t0 = performance.now();
    for (let i = 0; i < n; i++) render(i);
    gl().finish();
    return (performance.now() - t0) / n;
  }

  /**
   * Headline frame time: the MEDIAN of several pipelined blocks, with the IQR
   * across blocks beside it. Neither the mean nor the minimum survives a
   * shared machine — one block landing in a trough reported 2.5 ms for a
   * standing player in the sibling repo. If \`spreadMs\` rivals \`ms\`, the
   * machine drifted during the scenario and nothing finer than the spread is
   * meaningful.
   */
  function throughput(render, opts) {
    const o = Object.assign({ blocks: 3, warm: 4, n: 16 }, opts || {});
    const b = [];
    for (let i = 0; i < o.blocks; i++) b.push(timeBlock(render, o.warm, o.n));
    const q = quantiles(b);
    return { ms: +q.median.toFixed(2), fps: Math.round(1000 / q.median), spreadMs: +q.iqr.toFixed(2), blocks: b.map((x) => +x.toFixed(2)) };
  }

  /**
   * Paired adjacent difference: cost of configuration B relative to A.
   *
   * ABBA order, paired at the frame (or at a small group of frames, for a
   * change big enough that alternating it every frame would thrash driver
   * state harder than the change costs). Returns the median difference and the
   * IQR, and refuses to call the difference resolved unless |median| > IQR.
   */
  function paired(applyA, applyB, render, opts) {
    const o = Object.assign({ pairs: 24, group: 1, warm: 4 }, opts || {});
    let idx = 0;
    applyB(); for (let i = 0; i < o.warm; i++) render(idx++);
    applyA(); for (let i = 0; i < o.warm; i++) render(idx++);
    gl().finish();
    const timeGroup = () => {
      gl().finish();
      const t0 = performance.now();
      for (let i = 0; i < o.group; i++) render(idx++);
      gl().finish();
      return (performance.now() - t0) / o.group;
    };
    const diffs = [];
    for (let p = 0; p < o.pairs; p++) {
      let a, b;
      if (p % 2 === 0) { applyA(); a = timeGroup(); applyB(); b = timeGroup(); }
      else { applyB(); b = timeGroup(); applyA(); a = timeGroup(); }
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
  function noiseFloor(render, opts) {
    const nop = () => {};
    const r = paired(nop, nop, render, opts);
    return { iqrMs: r.iqrMs, biasMs: r.medianMs, pairs: r.pairs };
  }

  window.__RULER = { quantiles, timeBlock, throughput, paired, noiseFloor };
  return true;
})()`;

/** What `RULER_PAGE_SRC` installs, for the `page.evaluate` bodies that use it. */
export interface PageRuler {
  quantiles(xs: number[]): Quantiles;
  timeBlock(render: (i: number) => void, warm: number, n: number): number;
  throughput(
    render: (i: number) => void,
    opts?: { blocks?: number; warm?: number; n?: number },
  ): { ms: number; fps: number; spreadMs: number; blocks: number[] };
  paired(
    applyA: () => void,
    applyB: () => void,
    render: (i: number) => void,
    opts?: { pairs?: number; group?: number; warm?: number },
  ): { medianMs: number; iqrMs: number; pairs: number; resolved: boolean; verdict: string };
  noiseFloor(
    render: (i: number) => void,
    opts?: { pairs?: number; group?: number; warm?: number },
  ): Floor;
}

declare global {
  interface Window {
    /** installed by `RULER_PAGE_SRC` */
    __RULER: PageRuler;
  }
}
