#!/usr/bin/env node
/**
 * The one client. Every tool in `src/tools/` talks to the daemon through this.
 *
 * Phase 3 of `docs/plans/2026-08-21-opus-harness-daemon.md`. Thirty of
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
  const r = await call<LeaseResponse>('/lease', opts);
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
export async function withExclusive<T>(agent: string, fn: () => Promise<T>): Promise<T> {
  await ensureDaemon();
  await call('/exclusive', { agent });
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
