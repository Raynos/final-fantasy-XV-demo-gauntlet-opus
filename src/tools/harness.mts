#!/usr/bin/env node
/**
 * The one client. Every tool in `src/tools/` talks to the daemon through this.
 *
 * Phase 3 of `project/archive/plans/2026-08-21-opus-harness-daemon.md`. Thirty of
 * forty-eight tools used to call `chromium.launch` themselves, and seventeen
 * spawned their own vite, each carrying a copy-pasted `portOpen()` /
 * `ensureServer()` / `goto('?q=…&shoot=1')` / `waitForFunction('GAME.ready')`
 * preamble. That is not merely duplication: it is thirty places that can each
 * put a browser on the GPU without anyone counting, which is exactly the
 * saturation RESCUE blamed for killing three agents.
 *
 * TWO TIERS, BECAUSE THE TOOLS ARE TWO KINDS.
 *
 * - **Capture tools** want a posed page and some frames. `shots()` and
 *   `evalIn()` are enough for them, and they never see a browser.
 * - **Play tools** — `gameplay`, `combatloop`, `integration`, `uxcheck`,
 *   `driftcheck`, `heightcheck`, `roadcheck`, `bootprof` — drive real input over
 *   a running loop and need the `Page`, not a frame. `withPage()` gives them
 *   one: the daemon owns the chromium, the budget, the deadline and the
 *   teardown; the tool keeps full Playwright control over CDP. That division is
 *   the only reason those eight can stop owning browsers.
 *
 * WHICH BUILD, AND THE WARNING THAT GOES WITH IT. Every entry point takes
 * `--build <ref>` and defaults to **`HEAD`**, so captures are of a committed,
 * content-addressed tree that five agents can share and nobody's keystroke can
 * disturb. The cost is that your uncommitted edit is *not* in the frame, and
 * that failure mode — a capture that comes back identical after a real change —
 * reads as "my change did nothing" rather than "I photographed the wrong tree".
 * `portowner.mts` exists because exactly that cost an agent an hour. So
 * `announceBuild()` says so, loudly, every time the tree is dirty.
 */
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  call, ensureDaemon, DAEMON_PORT, PROTOCOL,
} from './daemon.mts';
import type {
  EvalResponse, LeaseRequest, LeaseResponse, Lane, PageOpts, ShotsRequest, ShotsResponse,
} from './daemon.mts';
import { ROOT, resolveBuild, shortBuild, workingTreeDirty, isDirty } from './identity.mts';
import type { BuildId } from './identity.mts';

export { call, ensureDaemon, PROTOCOL };
export const daemonPort = (): number => DAEMON_PORT;
export type { Lane, PageOpts, ShotResult, ShotsResponse } from './daemon.mts';

/** Everything every tool shares on its command line. */
export interface HarnessArgs {
  build: BuildId;
  lane: Lane;
  agent: string;
  deadlineMs: number;
  cold: boolean;
  w: number;
  h: number;
  q: string;
  post: string;
  nobake: boolean;
  prod: boolean;
  play: boolean;
  extra: string;
}

/**
 * The shared flags, named once so a tool's own parser can skip them.
 *
 * Every tool here rejects unknown flags -- correctly, since a typo'd flag that
 * is silently ignored is a capture of the wrong thing. That means adding a
 * shared flag breaks every hand-rolled parser unless they can all ask what the
 * shared ones are.
 */
export const HARNESS_VALUE_FLAGS = ['build', 'lane', 'agent', 'deadline', 'q', 'post', 'ablate', 'wait-lease'];
export const HARNESS_SWITCHES = ['dirty', 'cold', 'nobake', 'prod'];

/** True if `argv[i]` is a shared flag; the caller skips it and its value. */
export function isHarnessFlag(a: string): 'switch' | 'value' | null {
  if (!a.startsWith('--')) return null;
  const name = a.slice(2);
  if (HARNESS_SWITCHES.includes(name)) return 'switch';
  if (HARNESS_VALUE_FLAGS.includes(name)) return 'value';
  return null;
}

/**
 * The flags {@link harnessArgs} consumes, and how many words each takes.
 *
 * A tool with its own strict `parseArgs` — `perf.mts` and `gameplay.mts` both
 * have one, and throwing on an unknown flag is a feature worth keeping — has to
 * be told which flags are not its business. Without this, `parseArgs` runs
 * first and `perf.mts --build <sha>` dies on `unknown flag --build`, so the two
 * headline perf gates could only ever measure `HEAD`: no A/B, no re-measuring a
 * suspect regression against the baseline that certified it. That is not a
 * theoretical limit — the postfx lane hit it and had to bound its cost another
 * way, and this round needed `--dirty` to see its own edit in the gate.
 *
 * `--w`, `--h`, `--q` and `--nobake` are deliberately absent: the tools parse
 * those themselves and pass them back in as defaults.
 */
export const HARNESS_FLAGS: ReadonlyMap<string, 0 | 1> = new Map<string, 0 | 1>([
  ['--build', 1], ['--dirty', 0], ['--lane', 1], ['--agent', 1],
  ['--deadline', 1], ['--cold', 0], ['--prod', 0], ['--ablate', 1], ['--post', 1],
  ['--wait-lease', 1],
]);

/**
 * Parse the flags every tool now has, leaving the rest to the tool.
 *
 * `--dirty` is the escape from the `HEAD` default and is what the tight edit
 * loop uses. On a shared trunk a dirty capture contains *every* agent's
 * in-flight edits, not just yours; that is the real cost of a single tree, it
 * is not removable, and it is why the sha path is the default for anything
 * anyone will judge.
 */
export function harnessArgs(argv: string[], defaults: Partial<HarnessArgs> = {}): HarnessArgs {
  const val = (k: string, d: string) => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
  };
  const has = (k: string) => argv.includes(`--${k}`);
  const ref = has('dirty') ? 'dirty' : val('build', 'HEAD');
  return {
    build: resolveBuild(ref),
    lane: (val('lane', defaults.lane ?? 'fix') === 'sweep' ? 'sweep' : 'fix'),
    agent: process.env.HARNESS_AGENT || val('agent', path.basename(process.argv[1] || 'anon', '.mts')),
    deadlineMs: Number(val('deadline', String(defaults.deadlineMs ?? 0))),
    cold: has('cold'),
    w: Number(val('w', String(defaults.w ?? 1600))),
    h: Number(val('h', String(defaults.h ?? 900))),
    q: val('q', defaults.q ?? 'ultra'),
    post: val('ablate', val('post', defaults.post ?? '')),
    nobake: has('nobake'),
    prod: has('prod'),
    play: defaults.play ?? false,
    extra: defaults.extra ?? '',
  };
}

/** The subset of `HarnessArgs` the daemon actually needs on a request. */
export function pageOpts(a: HarnessArgs): PageOpts {
  return {
    w: a.w, h: a.h, q: a.q, post: a.post, nobake: a.nobake, cold: a.cold,
    build: a.build, lane: a.lane, agent: a.agent, deadlineMs: a.deadlineMs, prod: a.prod, play: a.play, extra: a.extra,
  };
}

/**
 * Say which build is about to be photographed, and warn when that is not what
 * the caller probably means.
 *
 * Print this before the first capture, always. A one-line note costs nothing
 * and the thing it prevents — reading a frame of `HEAD` as if it showed your
 * edit — is the single most expensive mistake this harness can make, because it
 * has no symptom other than "nothing changed".
 */
export function announceBuild(a: HarnessArgs): void {
  const label = shortBuild(a.build);
  if (isDirty(a.build)) {
    console.log(`[harness] ${label} — the LIVE tree. Frames are not cached, not shared, `
      + 'and contain every agent\'s in-flight edits. Do not quote them as evidence.');
    return;
  }
  if (workingTreeDirty()) {
    console.log(`[harness] ${label} — capturing COMMITTED code. You have uncommitted changes and they are `
      + 'NOT in these frames. Commit them, or pass --dirty to see the live tree.');
  } else {
    console.log(`[harness] ${label}`);
  }
}

// ------------------------------------------------------------ capture tier

/** Ask the daemon for frames. It owns the browser; this owns nothing. */
export async function shots(names: string[], req: Omit<ShotsRequest, 'shots'>): Promise<ShotsResponse> {
  await ensureDaemon();
  return call<ShotsResponse>('/shots', { ...req, shots: names });
}

/**
 * Run a function in the page and get its value back.
 *
 * `fn` is serialised to source, so it may not close over anything in this
 * process — pass what it needs as `arg`. That restriction is not a wart; it is
 * the same one `page.evaluate` has, and making it explicit here is what lets a
 * tool run against a page in a browser it does not own.
 */
export async function evalIn<T = unknown>(
  fn: (arg: never) => unknown,
  arg?: unknown,
  opts: PageOpts = {},
): Promise<T> {
  await ensureDaemon();
  const r = await call<EvalResponse>('/eval', { ...opts, fn: fn.toString(), arg });
  if (r.errors.length) console.warn(`[harness] page errors: ${r.errors.slice(0, 3).join(' | ')}`);
  return r.value as T;
}

/**
 * Evaluate a probe snippet from `src/tools/_probe/` or `src/tools/probes/`.
 *
 * Those files are read as text and evaluated as a **function body**, which is
 * why a top-level `return` in them is correct and why they are excluded from
 * `tsconfig.tools.json`. Keeping that contract in one place means a probe
 * cannot drift into being a module by accident.
 */
export async function probe<T = unknown>(file: string, opts: PageOpts = {}): Promise<T> {
  const src = readFileSync(path.isAbsolute(file) ? file : path.join(ROOT, file), 'utf8');
  await ensureDaemon();
  const r = await call<EvalResponse>('/eval', {
    ...opts,
    fn: `async function (arg) { ${src}\n }`,
  });
  if (r.errors.length) console.warn(`[harness] page errors: ${r.errors.slice(0, 3).join(' | ')}`);
  return r.value as T;
}

/**
 * A served build's port, with no page attached.
 *
 * For the three tools whose measurement *is* the navigation: `bootprof` times
 * `goto` to `GAME.ready` repeatedly, `texbake` records a canvas cache through a
 * query only honoured on a fresh load, and `detcheck` compares a reused page
 * against a fresh one. Pair it with `withBlankPage()` so the browser is still
 * one of the four the budget knows about.
 */
export async function buildServer(opts: { build?: BuildId, prod?: boolean } = {}):
Promise<{ port: number, build: string, dirty: boolean, kind: 'dev' | 'prod' }> {
  await ensureDaemon();
  return call('/build', opts);
}

// --------------------------------------------------------------- play tier

/** A leased page: a real Playwright `Page` in a browser the daemon owns. */
export interface Leased {
  page: Page;
  browser: Browser;
  /** The build server's port, for a tool that needs to build its own URL. */
  appPort: number;
  build: string;
  dirty: boolean;
  release: () => Promise<void>;
}

/**
 * Take a page from the pool over CDP.
 *
 * The daemon has already booted it and waited for `GAME.ready`, so a boot
 * failure is the daemon's problem rather than a mystery arriving on the far
 * side of a CDP socket. What comes back is a page with the render loop stopped
 * and the clock zeroed, exactly as a fresh load leaves it for the harness.
 */
export async function lease(opts: LeaseRequest = {}): Promise<Leased> {
  await ensureDaemon();
  const r = await call<LeaseResponse>('/lease', { ...opts, pid: process.pid });
  const browser = await chromium.connectOverCDP(r.cdp);
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().startsWith('http')) ?? ctx.pages()[0];
  if (!page) throw new Error('the leased browser has no page');
  let released = false;
  const leased: Leased = {
    page,
    browser,
    appPort: r.appPort,
    build: r.build,
    dirty: r.dirty,
    async release() {
      if (released) return;
      released = true;
      process.off('SIGINT', bail);
      process.off('SIGTERM', bail);
      process.off('uncaughtException', bail);
      process.off('unhandledRejection', bail);
      // Disconnect before releasing: the daemon resets the page, and resetting
      // one a client is still driving is how a "wedged page" is manufactured.
      await browser.close().catch(() => {});
      await call('/release', { id: r.id }).catch(() => {});
    },
  };
  /**
   * Give the slot back when the tool dies rather than when it finishes.
   *
   * The daemon's lease TTL is the backstop, but a crashed tool holding one of
   * four slots for fifteen minutes is a quarter of the machine's capacity lost
   * to a stack trace — and the tools most likely to throw are the long play
   * tools that hold the longest leases. Ctrl-C and an uncaught throw are what
   * actually happen; both are covered here.
   */
  function bail(e?: unknown) {
    void leased.release().then(() => {
      if (e instanceof Error) { console.error(e.stack ?? e.message); process.exit(1); }
      process.exit(130);
    });
  }
  process.once('SIGINT', bail);
  process.once('SIGTERM', bail);
  process.once('uncaughtException', bail);
  process.once('unhandledRejection', bail);
  return leased;
}

/** Lease, run, and always give it back — including when `fn` throws. */
export async function withPage<T>(opts: PageOpts, fn: (page: Page, l: Leased) => Promise<T>): Promise<T> {
  const l = await lease(opts);
  try { return await fn(l.page, l); } finally { await l.release(); }
}

/**
 * A page with no game in it, for the tools that use a browser as an image
 * renderer rather than as a game.
 *
 * `sheet`, `corpus`, `compare`, `imagestats`, `reliefstat` and `shrink` build
 * contact sheets, re-encode PNGs through a canvas, and read luminance
 * histograms. They have no business booting a world — but they are still six
 * chromiums, and six uncounted chromiums is exactly what the budget exists to
 * stop. So they take a slot like everyone else and skip the boot.
 */
export async function withBlankPage<T>(
  opts: { w?: number, h?: number, agent?: string, lane?: Lane, deadlineMs?: number },
  fn: (page: Page, l: Leased) => Promise<T>,
): Promise<T> {
  const l = await lease({ ...opts, blank: true });
  try { return await fn(l.page, l); } finally { await l.release(); }
}

// ------------------------------------------------------------ the quiet lane

/**
 * Quiesce the whole machine for one measurement, then give it back.
 *
 * `perf.mts` and `bootprof.mts` are the only callers. RESCUE §B6 threw away
 * every perf number from a session because they were taken under six concurrent
 * chromiums; under per-worktree daemons that was unfixable, since a daemon
 * cannot quiesce browsers it does not own. It is fixable now, and this is where.
 */
/**
 * How long to queue for the quiet lane, from `--wait-lease <seconds>`.
 *
 * Read from `process.argv` rather than threaded through `HarnessArgs` because
 * `withExclusive` wraps `main` — it runs *before* the tool's own parser, so
 * there is no parsed value to hand it yet. The flag is registered in
 * `HARNESS_FLAGS` / `HARNESS_VALUE_FLAGS` so the strict parsers skip it.
 *
 * The default waits rather than failing. Two agents both wanting a timing run
 * in the same hour is the normal case on a shared trunk, not an error: the
 * lease already serialises them correctly, and failing the second one just
 * pushes it toward measuring on a box the first one is using. Ten minutes
 * covers a full `perf` or `bootprof` run with room over. `--wait-lease 0`
 * restores fail-fast for a script that would rather report than block.
 */
/**
 * The agent identity a timing tool will submit its jobs under.
 *
 * Deliberately duplicates `harnessArgs`' rule rather than calling it, for the
 * same reason `leaseWaitMs` reads argv: `withExclusive` wraps `main`, so it
 * runs before the tool's own parser and there is no `HarnessArgs` yet.
 */
export function leaseAgent(fallback: string, argv: string[] = process.argv): string {
  if (process.env.HARNESS_AGENT) return process.env.HARNESS_AGENT;
  const i = argv.indexOf('--agent');
  const v = i >= 0 ? argv[i + 1] : undefined;
  return v && !v.startsWith('--') ? v : fallback;
}

export function leaseWaitMs(argv: string[] = process.argv): number {
  const i = argv.indexOf('--wait-lease');
  if (i < 0) return 10 * 60_000;
  const v = Number(argv[i + 1]);
  return Number.isFinite(v) && v >= 0 ? v * 1000 : 10 * 60_000;
}

export async function withExclusive<T>(
  label: string, fn: () => Promise<T>, { waitMs = leaseWaitMs() }: { waitMs?: number } = {},
): Promise<T> {
  await ensureDaemon();
  // **Hold the lease under the same identity the tool's own jobs will carry.**
  // While the lease is out the scheduler runs jobs only from the holding agent
  // (`j.agent === this.exclusive`), and this used to pass the tool's *name*
  // while every capture the tool submitted went in under `--agent <whatever>`.
  // The two agreed by accident, because `harnessArgs` defaults the agent to the
  // tool's own basename — so `perf.mts` worked and `perf.mts --agent sibling`
  // deadlocked against its own lease, silently, forever: no browser, no output,
  // no error, 0.35 s of CPU and a held lease that blocked the whole repository.
  // Resolved the same way `harnessArgs` resolves it so the two cannot drift.
  const agent = leaseAgent(label);
  // The pid is what lets the daemon reap this if the tool dies holding it --
  // `perf.mts` exits via process.exit() on a failing shot, which skips every
  // `finally` in the process, so a release that only happens on the happy path
  // is not a release.
  //
  // `waitMs` queues behind whoever holds it rather than failing. Two agents
  // wanting the quiet lane in the same hour is the normal case here, not an
  // error: the request is serialised, which is the point of the lease, and the
  // one that arrives second waits instead of measuring on a busy box.
  if (waitMs > 0) console.log(`[harness] requesting the quiet lane as ${agent} (will wait up to ${Math.round(waitMs / 1000)} s)`);
  await call('/exclusive', { agent, pid: process.pid, waitMs },
    { timeout: Math.max(waitMs + 60_000, 45 * 60_000) });
  // Stamp the state the measurement was taken under, before it is taken. A perf
  // number without this is not comparable, and two sessions arguing about a
  // regression that was really a busy box costs an afternoon.
  const os = await import('node:os');
  console.log(`[harness] quiet lane held by ${agent} — load ${os.loadavg()[0].toFixed(2)}, `
    + `${os.cpus().length} cores, pool drained`);
  try { return await fn(); }
  finally { await call('/exclusive-release', {}).catch(() => {}); }
}

/**
 * The state a measurement was taken under, for stamping into a report.
 *
 * A perf number without this is not reproducible and not comparable, which is
 * how two sessions end up arguing about a regression that was a busy machine.
 */
export async function measurementState(build: BuildId): Promise<Record<string, unknown>> {
  const os = await import('node:os');
  const h = await call<{ pool: { contexts: number }, workers: { busy: number } }>('/health');
  return {
    build: shortBuild(build),
    dirty: isDirty(build),
    loadavg: os.loadavg().map((n) => Number(n.toFixed(2))),
    pooledBrowsers: h.pool.contexts,
    workersBusy: h.workers.busy,
    at: new Date().toISOString(),
  };
}

/**
 * The exit code for "the machine is saturated", distinct from 1.
 *
 * An agent reading an exit code must be able to tell a busy box from a broken
 * build; conflating them turns "retry in a minute" into "debug the renderer".
 */
export const EXIT_BUSY = 4;

/** Wrap a tool's `main` so a `429` exits 4 with the daemon's own explanation. */
export async function runTool(main: () => Promise<void>): Promise<void> {
  try { await main(); } catch (e) {
    const busy = e as { busy?: true };
    if (busy.busy) {
      console.error(`[harness] ${(e as Error).message}`);
      process.exit(EXIT_BUSY);
    }
    throw e;
  }
}
