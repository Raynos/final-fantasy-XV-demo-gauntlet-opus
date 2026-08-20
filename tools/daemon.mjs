#!/usr/bin/env node
/**
 * Capture daemon: one vite server, one Chromium, one warm page, reused across
 * every tool invocation.
 *
 *   node tools/daemon.mjs            # run in the foreground (clients autostart it)
 *   node tools/daemon.mjs --stop     # stop it and its server
 *   node tools/daemon.mjs --health
 *
 * Why this exists: booting the game is the dominant cost of every capture. A
 * cold `tools/shoot.mjs` pays chromium launch + vite start + module transform +
 * world build + ~110 shader compiles before it can take its first picture, and
 * every tool paid it separately, every time. Holding the page open makes the
 * second and subsequent runs cost only their own frames — and it removes the
 * repeated boot from a machine that several agents are already saturating.
 *
 * Safety of reuse: `tools/shoot.mjs` has always rendered all of its shots on one
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
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CHROMIUM_ARGS } from './chromium.mjs';
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
function sourceStamp() {
  const parts = [];
  const walk = (dir) => {
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
  for (const f of ['index.html', 'vite.config.js']) {
    try { const st = statSync(path.join(ROOT, f)); parts.push(`${f}:${st.size}:${st.mtimeMs}`); } catch { /* absent */ }
  }
  return createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const APP_PORT = Number(process.env.PORT || 5173);
export const DAEMON_PORT = APP_PORT + 1;
const BROWSER_IDLE_MS = Number(process.env.BROWSER_IDLE_MIN || 6) * 60_000;
const DAEMON_IDLE_MS = Number(process.env.DAEMON_IDLE_MIN || 25) * 60_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const portOpen = (p) => new Promise((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 800);
});

// --------------------------------------------------------------- client side

/** POST JSON to the daemon. @returns {Promise<any>} */
export async function call(route, body, { timeout = 600_000 } = {}) {
  const res = await fetch(`http://127.0.0.1:${DAEMON_PORT}${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error || `daemon ${res.status}`);
  return j;
}

/**
 * Make sure a daemon is listening, starting a detached one if not.
 * @returns {Promise<boolean>} true if this call started it
 */
export async function ensureDaemon() {
  if (await portOpen(DAEMON_PORT)) return false;
  const child = spawn(process.execPath, [path.join(ROOT, 'tools/daemon.mjs')], {
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

  async ensureServer(prod) {
    if (this.server || await portOpen(APP_PORT)) return;
    if (prod) {
      await new Promise((res, rej) => {
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
  async page_(opts) {
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
      if (this.viewport.w !== w || this.viewport.h !== h) {
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
    page.on('pageerror', (e) => this.errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') this.errors.push(m.text()); });

    const t0 = Date.now();
    await page.goto(`http://127.0.0.1:${APP_PORT}/${query}`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
    await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 300_000 });
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
let busy = null;

/** Serialise every request: exactly one browser doing exactly one thing. */
function queue(fn) {
  const run = (busy || Promise.resolve()).then(fn, fn);
  busy = run.catch(() => {});
  return run;
}

async function routeShots(body) {
  const { shots, settle = 60, out, ...rest } = body;
  const page = await harness.page_(rest);
  const outDir = path.isAbsolute(out) ? out : path.join(ROOT, out);
  await mkdir(outDir, { recursive: true });
  const results = [];
  for (const name of shots) {
    const t0 = Date.now();
    const meta = await page.evaluate(([n, s]) => {
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
    }, [name, settle]);
    const file = path.join(outDir, `${name}.png`);
    await writeFile(file, await page.screenshot({ type: 'png' }));
    results.push({ name, file, ...meta, ms: Date.now() - t0 });
  }
  return { results, errors: [...harness.errors], boots: harness.boots, reuses: harness.reuses, bootMs: harness.bootMs };
}

async function routeEval(body) {
  const page = await harness.page_(body);
  const value = await page.evaluate(
    new Function('arg', `return (${body.fn})(arg)`), body.arg
  );
  return { value, errors: [...harness.errors], boots: harness.boots, reuses: harness.reuses };
}

async function serve() {
  const srv = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => { raw += d; });
    req.on('end', async () => {
      const send = (code, obj) => {
        res.writeHead(code, { 'content-type': 'application/json' });
        res.end(JSON.stringify(obj));
      };
      const url = (req.url || '').split('?')[0];
      let body = {};
      try { body = raw ? JSON.parse(raw) : {}; } catch { return send(400, { error: 'bad json' }); }
      try {
        if (url === '/health') {
          return send(200, {
            ok: true, appPort: APP_PORT, page: !!harness.page, browser: !!harness.browser,
            mode: harness.mode, query: harness.query, boots: harness.boots,
            reuses: harness.reuses, bootMs: harness.bootMs,
            idleSec: Math.round((Date.now() - harness.lastUsed) / 1000),
          });
        }
        if (url === '/stop') { send(200, { ok: true }); setTimeout(stop, 50); return; }
        if (url === '/shots') return send(200, await queue(() => routeShots(body)));
        if (url === '/eval') return send(200, await queue(() => routeEval(body)));
        return send(404, { error: `no route ${url}` });
      } catch (e) {
        return send(500, { error: String((e && e.stack) || e) });
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
    try { console.log(JSON.stringify(await call('/health'), null, 2)); }
    catch (e) { console.log('not running:', e.message); process.exit(1); }
  } else {
    await serve();
  }
}
