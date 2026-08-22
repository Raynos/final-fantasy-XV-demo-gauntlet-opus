#!/usr/bin/env node
/**
 * Capture daemon: one vite server, one Chromium, one warm page, reused across
 * every tool invocation.
 *
 *   node src/tools/daemon.mts            # run in the foreground (clients autostart it)
 *   node src/tools/daemon.mts --stop     # stop it and its server
 *   node src/tools/daemon.mts --health
 *
 * Why this exists: booting the game is the dominant cost of every capture. A
 * cold `src/tools/shoot.mts` pays chromium launch + vite start + module transform +
 * world build + ~110 shader compiles before it can take its first picture, and
 * every tool paid it separately, every time. Holding the page open makes the
 * second and subsequent runs cost only their own frames — and it removes the
 * repeated boot from a machine that several agents are already saturating.
 *
 * Safety of reuse: `src/tools/shoot.mts` has always rendered all of its shots on one
 * page in sequence, so cross-shot reuse is the established contract; this only
 * extends it across invocations. `/reset` restores the same starting condition
 * the harness sets up after a fresh load (rAF stopped, clock zeroed, shot state
 * re-applied), and `--cold` on any client forces a fresh page when a run must be
 * provably independent.
 *
 * Lifetime: the browser closes after BROWSER_IDLE_MIN (default 6) minutes with
 * no work and the daemon exits after DAEMON_IDLE_MIN (default 25), taking vite
 * with it. Nothing is left burning CPU on a shared box.
 */
import { chromium } from 'playwright';
import type { Browser, ConsoleMessage, Page } from 'playwright';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CHROMIUM_ARGS } from './chromium.mts';
import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';

/**
 * Fingerprint of everything the page's behaviour depends on.
 *
 * The daemon holds a booted page across invocations, which is the whole point —
 * a warm capture is ~1.5 s against ~12 s cold. But a page booted *before* an
 * edit keeps the modules it booted with, so reusing it silently serves the old
 * build. That produced a completely false bug diagnosis once: two captures
 * taken either side of an edit were compared as if they were the same build,
 * and the difference was read as a rendering fault in the game.
 *
 * Cheap and sufficient: names, sizes and mtimes of every source file. No
 * hashing of contents, so it costs a stat per file.
 */
/**
 * Fingerprint of the daemon's *own* code.
 *
 * `sourceStamp()` below guards the open *page* -- reusing a page booted before
 * an edit serves the old build. It does not guard the daemon **process**, which
 * has been running since whenever it was started and cannot reload itself. So
 * editing `daemon.mts` and running a capture silently exercises the old daemon:
 * the port is open, `/root` matches, and the client happily reuses it.
 *
 * That cost a round. A capture came back with the loading screen still in it,
 * the fix was applied, the capture came back wrong *again*, and the code being
 * blamed was not the code that ran. Clients compare this and restart rather
 * than reuse.
 */
function selfStamp() {
  const parts = [];
  for (const f of ['daemon.mts', 'chromium.mts']) {
    try {
      const st = statSync(path.join(ROOT, 'src/tools', f));
      parts.push(`${f}:${st.size}:${st.mtimeMs}`);
    } catch { parts.push(`${f}:missing`); }
  }
  return createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 12);
}

/**
 * Taken **once, at startup**, and never recomputed.
 *
 * The first version of this check called `selfStamp()` inside the `/root`
 * handler, so the running daemon and the client both read the current file off
 * disk and always agreed -- the check could not fail, which is a worse bug than
 * the one it was added for. What matters is the code this process *started*
 * with, not what is on disk now.
 */
const SELF_STAMP = selfStamp();

function sourceStamp() {
  const parts = [];
  const walk = (dir: string) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.(js|mjs|css|html|json)$/.test(e.name)) {
        try { const st = statSync(f); parts.push(`${f}:${st.size}:${st.mtimeMs}`); } catch { /* raced */ }
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  for (const f of ['src/index.html', 'vite.config.js']) {
    try { const st = statSync(path.join(ROOT, f)); parts.push(`${f}:${st.size}:${st.mtimeMs}`); } catch { /* absent */ }
  }
  return createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const APP_PORT = Number(process.env.PORT || 5173);
export const DAEMON_PORT = APP_PORT + 1;
const BROWSER_IDLE_MS = Number(process.env.BROWSER_IDLE_MIN || 6) * 60_000;
const DAEMON_IDLE_MS = Number(process.env.DAEMON_IDLE_MIN || 25) * 60_000;

const sleep = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });

const portOpen = (p: number) => new Promise<boolean>((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 800);
});

// --------------------------------------------------------------- the protocol

/** Which build the open page is showing. */
type PageMode = 'dev' | 'prod';

/** What every client sends to say which page it wants. */
export interface PageOpts {
  w?: number;
  h?: number;
  q?: string;
  nobake?: boolean;
  prod?: boolean;
  /** Force a fresh page, for a run that must be provably independent. */
  cold?: boolean;
}

/** `POST /shots` */
export interface ShotsRequest extends PageOpts {
  shots: string[];
  settle?: number;
  out: string;
  /** JPEG quality 1..100; 0 or absent means PNG. */
  jpeg?: number;
}

/** One captured frame, plus what the renderer cost to draw it. */
export interface ShotResult {
  name: string;
  file: string;
  triangles: number;
  calls: number;
  textures: number;
  geometries: number;
  programs: number;
  ms: number;
}

/**
 * Every response carries the reuse counters, so a client can tell a warm
 * capture from a cold one without a second call to `/health`.
 */
interface Counters {
  errors: string[];
  boots: number;
  reuses: number;
}

export interface ShotsResponse extends Counters { results: ShotResult[]; bootMs: number }

/** `POST /eval` -- `fn` is a function *source string*, evaluated in the page. */
export interface EvalRequest extends PageOpts { fn: string; arg?: unknown }
export interface EvalResponse extends Counters { value: unknown }

export interface HealthResponse {
  ok: boolean;
  appPort: number;
  page: boolean;
  browser: boolean;
  mode: PageMode | null;
  query: string | null;
  boots: number;
  reuses: number;
  bootMs: number;
  idleSec: number;
}

/**
 * The two request bodies arrive as untrusted JSON off a socket, so they are
 * narrowed here rather than asserted at the call. A predicate is worth the four
 * extra lines over a cast: it narrows, so `routeShots` receives a checked
 * `ShotsRequest`, and the `400` and the type stay in step because they are
 * derived from the same test.
 */
function isShotsRequest(b: Record<string, unknown>): b is Record<string, unknown> & ShotsRequest {
  return Array.isArray(b.shots) && b.shots.every((s) => typeof s === 'string') && typeof b.out === 'string';
}

function isEvalRequest(b: Record<string, unknown>): b is Record<string, unknown> & EvalRequest {
  return typeof b.fn === 'string';
}

// --------------------------------------------------------------- client side

/** POST JSON to the daemon. The caller names the response it expects. */
export async function call<T = unknown>(route: string, body?: unknown, { timeout = 600_000 }: { timeout?: number } = {}): Promise<T> {
  const res = await fetch(`http://127.0.0.1:${DAEMON_PORT}${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  const j = await res.json() as T & { error?: string };
  if (!res.ok) throw new Error(j.error || `daemon ${res.status}`);
  return j;
}

/**
 * Make sure a daemon is listening, starting a detached one if not.
 * @returns true if this call started it
 */
export async function ensureDaemon(): Promise<boolean> {
  let stale = false;
  if (await portOpen(DAEMON_PORT)) {
    // A daemon on the port may belong to a *different* checkout — every agent
    // worktree runs the same tools on the same default ports. Silently reusing
    // it captures the other repo's build, which has already produced at least
    // one false result that took a round to unpick. Refuse rather than lie.
    let root: string | null = null;
    let self: string | null = null;
    try {
      const r = await call<{ root: string, self?: string }>('/root');
      root = r.root;
      self = r.self ?? null;
    } catch { /* daemon predates the route */ }
    // A daemon running code older than this file cannot be reused: it will
    // serve behaviour that no longer exists in the tree. Stop it and start a
    // fresh one rather than quietly capturing through the old one.
    if (root && path.resolve(root) === path.resolve(ROOT) && self !== selfStamp()) {
      try { await call('/stop', {}); } catch { /* already going */ }
      for (let i = 0; i < 50 && await portOpen(DAEMON_PORT); i++) await sleep(100);
      stale = true;
    } else if (root && path.resolve(root) !== path.resolve(ROOT)) {
      throw new Error(
        `a capture daemon on port ${DAEMON_PORT} is serving a different checkout:\n`
        + `  running: ${root}\n  wanted:  ${ROOT}\n`
        + 'Set PORT (and DAEMON_PORT) to values unique to this worktree, '
        + 'or stop that daemon.');
    }
    if (!stale) return false;
    console.log('[daemon] the running daemon is older than src/tools/daemon.mts; restarting it');
  }
  const child = spawn(process.execPath, [path.join(ROOT, 'src/tools/daemon.mts')], {
    cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env, PORT: String(APP_PORT) },
  });
  child.unref();
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await sleep(200);
    if (await portOpen(DAEMON_PORT)) return true;
  }
  throw new Error('daemon failed to start');
}

// --------------------------------------------------------------- server side

class Harness {
  bootMs!: number;
  boots!: number;
  browser!: Browser | null;
  errors!: string[];
  lastUsed!: number;
  mode!: PageMode | null;
  page!: Page | null;
  query!: string | null;
  reuses!: number;
  /** The vite child, or null when one was already listening on the port. */
  server!: ChildProcess | null;
  stamp!: string | null;
  viewport!: { w: number, h: number } | null;
  constructor() {
    this.server = null;      // vite child process
    this.browser = null;
    this.page = null;
    this.errors = [];
    this.viewport = null;
    this.mode = null;        // 'dev' | 'prod'
    this.query = null;
    this.stamp = null;       // source fingerprint the open page booted with
    this.lastUsed = Date.now();
    this.boots = 0;
    this.reuses = 0;
    this.bootMs = 0;
  }

  async ensureServer(prod: boolean) {
    if (this.server || await portOpen(APP_PORT)) return;
    if (prod) {
      await new Promise<void>((res, rej) => {
        const b = spawn('npx', ['vite', 'build'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
        b.on('exit', (c) => (c === 0 ? res() : rej(new Error(`vite build failed (${c})`))));
      });
    }
    const args = prod
      ? ['vite', 'preview', '--port', String(APP_PORT), '--strictPort']
      : ['vite', '--port', String(APP_PORT), '--strictPort'];
    this.server = spawn('npx', args, { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      await sleep(250);
      if (await portOpen(APP_PORT)) return;
    }
    throw new Error('vite failed to start');
  }

  /**
   * Get a page showing a booted game at the requested viewport and query.
   * Reuses the open one whenever it matches; reboots only when it cannot.
   */
  async page_(opts: PageOpts): Promise<Page> {
    const { w = 1600, h = 900, q = 'ultra', nobake = false, prod = false, cold = false } = opts;
    const query = `?q=${q}&shoot=1${nobake ? '&nobake=1' : ''}`;
    // Errors belong to the request that provoked them, so the slate is wiped
    // here — before a boot, so boot-time errors are still attributed to it.
    this.errors.length = 0;
    await this.ensureServer(prod);

    // A page that booted before a source edit is serving the old build; reusing
    // it would hand back captures of code that no longer exists.
    const stamp = sourceStamp();
    if (this.page && !cold && this.query === query
        && this.mode === (prod ? 'prod' : 'dev') && this.stamp === stamp) {
      if (this.viewport && (this.viewport.w !== w || this.viewport.h !== h)) {
        await this.page.setViewportSize({ width: w, height: h });
        this.viewport = { w, h };
        // a resize invalidates every temporal buffer and the post-chain targets
        await this.page.evaluate(() => { window.GAME.rnd.resize(); window.GAME.post?.resetHistory?.(); });
      }
      this.reuses++;
      this.lastUsed = Date.now();
      await this.reset();
      return this.page;
    }

    await this.closePage();
    if (!this.browser) this.browser = await chromium.launch({ args: CHROMIUM_ARGS });
    const page = await this.browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    page.on('pageerror', (e: Error) => this.errors.push(String(e)));
    page.on('console', (m: ConsoleMessage) => { if (m.type() === 'error') this.errors.push(m.text()); });

    const t0 = Date.now();
    await page.goto(`http://127.0.0.1:${APP_PORT}/${query}`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
    await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 300_000 });
    // `ready` is set one warm frame before `main.ts` adds `#boot.done`, and that
    // class only starts an 800 ms opacity transition -- so a capture taken the
    // instant the page reports ready contains the loading screen. It is silent:
    // the shot still reports its real triangle and draw-call counts, so nothing
    // looks wrong until someone opens the image. Only the *first* capture after
    // a boot can hit it, which is why it survives a warm daemon.
    //
    // Remove the node rather than waiting for the fade. `probe`, `framecam` and
    // `creaturecheck` all already do exactly this, and for a reason: the
    // transition needs frames, and a headless page that the harness has just
    // stopped the render loop on is not guaranteed to get them. Waiting on
    // `opacity === '0'` hung every capture for the full timeout.
    await page.evaluate(() => { document.getElementById('boot')?.remove(); });
    this.bootMs = Date.now() - t0;
    this.page = page;
    this.viewport = { w, h };
    this.mode = prod ? 'prod' : 'dev';
    this.query = query;
    this.stamp = stamp;
    this.boots++;
    this.lastUsed = Date.now();
    await this.reset();
    return page;
  }

  /** Return the page to the state a fresh load leaves it in for the harness. */
  async reset() {
    // A concurrent request can close the page between reuse and reset (a source
    // edit forces a reboot); treat a missing page as "nothing to reset".
    if (!this.page || this.page.isClosed?.()) return;
    await this.page.evaluate(() => {
      const g = window.GAME;
      g.stop();
      g.resetClock();
      document.getElementById('boot')?.remove();
    });
  }

  async closePage() {
    if (this.page) { await this.page.close().catch(() => {}); this.page = null; }
  }

  async closeBrowser() {
    await this.closePage();
    if (this.browser) { await this.browser.close().catch(() => {}); this.browser = null; }
  }

  async shutdown() {
    await this.closeBrowser();
    if (this.server) { this.server.kill(); this.server = null; }
  }
}

const harness = new Harness();
let busy: Promise<unknown> | null = null;

/** Serialise every request: exactly one browser doing exactly one thing. */
function queue<T>(fn: () => Promise<T>): Promise<T> {
  const run = (busy || Promise.resolve()).then(fn, fn);
  busy = run.catch(() => {});
  return run;
}

async function routeShots(body: ShotsRequest): Promise<ShotsResponse> {
  const { shots, settle = 60, out, jpeg = 0, ...rest } = body;
  const page = await harness.page_(rest);
  const outDir = path.isAbsolute(out) ? out : path.join(ROOT, out);
  await mkdir(outDir, { recursive: true });
  const results: ShotResult[] = [];
  for (const name of shots) {
    const t0 = Date.now();
    const meta = await page.evaluate(([n, s]: [string, number]) => {
      const g = window.GAME;
      g.applyShot(n);
      g.settle(s);
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
    }, [name, settle] as [string, number]);
    const file = path.join(outDir, `${name}.${jpeg ? 'jpg' : 'png'}`);
    await writeFile(file, await page.screenshot(jpeg ? { type: 'jpeg', quality: jpeg } : { type: 'png' }));
    results.push({ name, file: path.relative(ROOT, file), ...meta, ms: Date.now() - t0 });
  }
  return { results, errors: [...harness.errors], boots: harness.boots, reuses: harness.reuses, bootMs: harness.bootMs };
}

async function routeEval(body: EvalRequest): Promise<EvalResponse> {
  const page = await harness.page_(body);
  // `body.fn` arrives as source text, so the function has to be built here.
  // `new Function` is typed `Function`, which `evaluate` will not take; the
  // signature is the one it is constructed with.
  const fn = new Function('arg', `return (${body.fn})(arg)`) as (arg: unknown) => unknown;
  const value = await page.evaluate(fn, body.arg);
  return { value, errors: [...harness.errors], boots: harness.boots, reuses: harness.reuses };
}

async function serve() {
  const srv = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', async () => {
      const send = (code: number, obj: unknown) => {
        res.writeHead(code, { 'content-type': 'application/json' });
        res.end(JSON.stringify(obj));
      };
      const url = (req.url || '').split('?')[0];
      let body: Record<string, unknown> = {};
      try { body = raw ? JSON.parse(raw) as Record<string, unknown> : {}; }
      catch { return send(400, { error: 'bad json' }); }
      try {
        if (url === '/health') {
          return send(200, {
            ok: true, appPort: APP_PORT, page: !!harness.page, browser: !!harness.browser,
            mode: harness.mode, query: harness.query, boots: harness.boots,
            reuses: harness.reuses, bootMs: harness.bootMs,
            idleSec: Math.round((Date.now() - harness.lastUsed) / 1000),
          });
        }
        // Which checkout this daemon serves, and which version of its own code
        // it is running. Clients compare both.
        if (url === '/root') return send(200, { root: ROOT, self: SELF_STAMP });
        if (url === '/stop') { send(200, { ok: true }); setTimeout(stop, 50); return; }
        if (url === '/shots') {
          if (!isShotsRequest(body)) {
            return send(400, { error: '/shots needs { shots: string[], out: string }' });
          }
          return send(200, await queue(() => routeShots(body)));
        }
        if (url === '/eval') {
          if (!isEvalRequest(body)) return send(400, { error: '/eval needs { fn: string }' });
          return send(200, await queue(() => routeEval(body)));
        }
        return send(404, { error: `no route ${url}` });
      } catch (e) {
        return send(500, { error: e instanceof Error ? e.stack ?? e.message : String(e) });
      }
    });
  });
  srv.listen(DAEMON_PORT, '127.0.0.1');
  srv.on('error', (e) => { console.error('[daemon]', e.message); process.exit(1); });
  console.log(`[daemon] listening on ${DAEMON_PORT}, app on ${APP_PORT}`);

  const stop = async () => { await harness.shutdown(); srv.close(); process.exit(0); };
  setInterval(() => {
    const idle = Date.now() - harness.lastUsed;
    if (idle > DAEMON_IDLE_MS) { console.log('[daemon] idle, exiting'); void stop(); }
    else if (idle > BROWSER_IDLE_MS && harness.browser) {
      console.log('[daemon] idle, closing browser');
      void queue(() => harness.closeBrowser());
    }
  }, 15_000).unref?.();
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => void stop());
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const argv = process.argv.slice(2);
  if (argv.includes('--stop')) {
    try { await call('/stop', {}); console.log('stopped'); }
    catch { console.log('not running'); }
  } else if (argv.includes('--health')) {
    try { console.log(JSON.stringify(await call<HealthResponse>('/health'), null, 2)); }
    catch (e) { console.log('not running:', e instanceof Error ? e.message : String(e)); process.exit(1); }
  } else {
    await serve();
  }
}
