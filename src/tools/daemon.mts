#!/usr/bin/env node
/**
 * ONE capture daemon per repository, for every agent on the machine.
 *
 *   node src/tools/daemon.mts            # run in the foreground (clients autostart it)
 *   node src/tools/daemon.mts --stop     # stop it, its builds and its browsers
 *   node src/tools/daemon.mts --health
 *
 * Why this exists: booting the game is the dominant cost of every capture.
 * Measured on this machine (`project/journal/2026-08-23-harness-bench.md`) boot
 * is **9.2 s against a 2.3 s render**, and four concurrent browsers deliver only
 * **1.5x** the throughput of one — the GPU binds, not the 18 cores or the
 * 137 GB. So the win was never "run more browsers". It is *not booting the same
 * page over and over*, and that is what a warm, shared daemon is.
 *
 * ONE DAEMON, NOT ONE PER CHECKOUT. The old design was scoped to a checkout and
 * `CLAUDE.md` told every worktree to pick its own `PORT` — three agents, three
 * daemons, three pools, and a perfect per-daemon cap of four still putting
 * twelve chromiums on one GPU. A browser budget is a property of the *machine*,
 * so the process that owns it must be too. `identity.mts` keys the daemon off
 * the repository rather than the directory, which is what makes the budget
 * enforceable at all — and it is why `perf.mts` can now demand a quiet machine
 * and actually get one.
 *
 * BUILDS, NOT DIRECTORIES. A request names a **build identity**: `sha:<tree>`
 * (content-addressed, immutable, materialised once, shared by everyone) or
 * `dirty:<root>` (the live working tree — never cached, always flagged). That is
 * what lets five agents type while a sixth captures `HEAD` and gets stable
 * frames; under the old source-fingerprint scheme one save by anyone rebooted
 * every warm page for everyone.
 *
 * SERVING A BUILD IS CHEAP AND THAT IS NOT AN ACCIDENT. `git archive` is 173 ms
 * and `vite build` is 562 ms — *provided* `src/public/baked` is symlinked into
 * the tree rather than re-baked. Without that symlink the same build measured
 * 24 514 ms. See `materialise()`.
 *
 * Lifetime: browsers close after BROWSER_IDLE_MIN (default 6) minutes with no
 * work, build servers after BUILD_IDLE_MIN (default 10), and the daemon exits
 * after DAEMON_IDLE_MIN (default 25). It **outlives the session that started
 * it**: retiring the agent that happened to autostart it must not take the
 * machine's harness down with it.
 */
import type { BrowserContext, ConsoleMessage, Page } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync, mkdirSync, rmSync, readdirSync, statSync, symlinkSync, readFileSync, writeFileSync, copyFileSync, utimesSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { launchPersistent } from './chromium.mts';
import {
  ROOT, repoKey, keyHash, derivedPort, repoCacheDir, readRegistry, writeRegistry, clearRegistry,
  resolveBuild, isDirty, shaOf, shortBuild, DIRTY_PREFIX,
} from './identity.mts';
import type { BuildId, Registry } from './identity.mts';

/**
 * Bumped whenever a route, a request shape or a response shape changes.
 *
 * An agent editing this file does **not** restart the running daemon, so
 * without this a new client talks to an old daemon over a port that is open and
 * a key that matches, and gets behaviour that no longer exists in the tree.
 * That cost a whole round once: a capture came back with the loading screen in
 * it, the fix was applied, the capture came back wrong *again*, and the code
 * being blamed was not the code that ran. Harness work is self-hosting; this is
 * the one place it bites.
 */
export const PROTOCOL = 3;

/** The local vite binary. Never `npx`/`pnpm dlx`: those can fetch from the network. */
const VITE = path.join(ROOT, 'node_modules/.bin/vite');

const KEY = repoKey();
export const DAEMON_PORT = Number(process.env.HARNESS_DAEMON_PORT || derivedPort(KEY));
/**
 * Legacy: the app port a *dirty* build gets when nothing else has claimed one.
 * Build servers are allocated out of the daemon's own block now, so nobody
 * picks a port and `PORT` no longer means anything to a client.
 */
export const APP_PORT = Number(process.env.PORT || 5173);

/**
 * Measured, not guessed. `project/journal/2026-08-23-harness-bench.md`:
 * throughput is flat within noise from W=3 (0.29-0.31 req/s at W=4 across three
 * runs, on a plateau only 20% wide), so throughput cannot pick this number.
 * Latency can, and is not noisy: mean boot 9.2 s at W=1, 14.8 s at W=4, 32.3 s
 * at W=6, 40.5 s at W=8. Four is the largest W that still boots within 2x of
 * serial.
 *
 * At four: 2.2 of 18 cores and 10 of 137 GB. Neither binds — the single Metal
 * GPU does. Do not raise this because the machine "looks idle"; it always
 * looks idle.
 */
const BROWSER_BUDGET = Number(process.env.HARNESS_BROWSER_BUDGET || 4);
/** One job per browser: a fifth worker would only queue behind a browser anyway. */
const WORKERS = BROWSER_BUDGET;
/**
 * What two frames of the same shot differ by when nothing is wrong.
 *
 * Measured in `project/journal/2026-08-23-harness-bench.md`: two *fresh serial
 * boots* on a quiet machine differ by mean 1.493/255, because TAA history, the
 * exposure integrator and the shader cache do not start from the same place
 * twice. Every threshold in this file that compares two captures traces here.
 */
const DRIFT_FLOOR = 1.5;
/** Materialised sha trees are 115 MB each; ten is 1.2 GB, which is affordable. */
const MAX_TREES = Number(process.env.HARNESS_MAX_TREES || 10);
/** One CDP port per pooled browser, out of a block nothing else claims. */
const CDP_BASE = Number(process.env.HARNESS_CDP_BASE || 9333);

const BROWSER_IDLE_MS = Number(process.env.BROWSER_IDLE_MIN || 6) * 60_000;
const BUILD_IDLE_MS = Number(process.env.BUILD_IDLE_MIN || 10) * 60_000;
const DAEMON_IDLE_MS = Number(process.env.DAEMON_IDLE_MIN || 25) * 60_000;

const sleep = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });

const portOpen = (p: number) => new Promise<boolean>((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 800);
});

/**
 * Fingerprint of a *dirty* build's sources.
 *
 * Only dirty builds need one: a `sha:` build is immutable by construction, so
 * its fingerprint is its name. This stays deliberately paranoid — names, sizes
 * and mtimes of every source file — because a page booted before an edit serves
 * the old build, and that produced a completely false bug diagnosis once. Do
 * not "optimise" it to a subset; sha builds make it cheap by making it rare.
 */
function sourceStamp(root: string) {
  const parts: string[] = [];
  const walk = (dir: string) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.(js|mjs|ts|mts|css|html|json)$/.test(e.name)) {
        try { const st = statSync(f); parts.push(`${f}:${st.size}:${st.mtimeMs}`); } catch { /* raced */ }
      }
    }
  };
  walk(path.join(root, 'src'));
  for (const f of ['src/index.html', 'vite.config.js']) {
    try { const st = statSync(path.join(root, f)); parts.push(`${f}:${st.size}:${st.mtimeMs}`); } catch { /* absent */ }
  }
  return createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);
}

// --------------------------------------------------------------- the protocol

/** What every client sends to say which page it wants. */
export interface PageOpts {
  w?: number;
  h?: number;
  q?: string;
  nobake?: boolean;
  /** Force a fresh page, for a run that must be provably independent. */
  cold?: boolean;
  /**
   * Boot the game WITHOUT `?shoot=1`, so the render loop runs.
   *
   * `main.ts` gates `game.start()` on the absence of `shoot`, which is a hard
   * determinism gate for captures — a page that free-runs between "ready" and
   * the harness taking over has advanced TAA history, the exposure integrator
   * and enemy AI by a nondeterministic amount. `uxcheck` genuinely wants that:
   * it is testing what a player sees, not what a screenshot contains.
   *
   * It is part of page IDENTITY, so a play page and a capture page can never be
   * confused for one another in the pool.
   */
  play?: boolean;
  /**
   * Extra query parameters, appended verbatim — `audio=force` and friends.
   *
   * Part of page IDENTITY like every other query bit, so a page booted with the
   * audio graph forced on is never handed to a request that did not ask for it.
   */
  extra?: string;
  /**
   * Serve the production bundle rather than the dev server.
   *
   * Rare and opt-in. It costs a `vite build` per sha and it removes the ability
   * to `import()` source modules from inside the page, which several probes
   * depend on. Use it when the *bundle* is the thing under review.
   */
  prod?: boolean;
  /**
   * Post-chain ablation, passed straight through to `?post=` and read by
   * `PostFX.debugToggle` — `nobloom`, `nogtao`, `nocontact`, `plain`, ...
   *
   * It is part of the page IDENTITY, not of one capture, which is what makes it
   * safe here: a page is only reused when its query matches, so an ablated run
   * can never be served a frame from an un-ablated page.
   */
  post?: string;
  /**
   * `sha:<tree>` or `dirty:<root>`, or a ref the client already resolved.
   * Absent means the live tree of whoever is asking, which is the conservative
   * reading of an unversioned request.
   */
  build?: BuildId;
  /** Priority class: `fix` wants latency, `sweep` wants throughput. */
  lane?: Lane;
  /** Who is asking, for fair-share and for `/health` to name who is ahead. */
  agent?: string;
  /** Give up rather than queue past this many ms. */
  deadlineMs?: number;
  /**
   * The client's pid, so the daemon can give back what a dead client is
   * holding. A TTL either expires on a legitimate long run or leaves a corpse
   * in place; liveness does neither.
   */
  pid?: number;
}

/** `POST /shots` */
export interface ShotsRequest extends PageOpts {
  shots: string[];
  settle?: number;
  out: string;
  /** JPEG quality 1..100; 0 or absent means PNG. */
  jpeg?: number;
  /**
   * Scene objects to hide for this capture, by case-insensitive substring of
   * `Object3D.name`. Restored afterwards, so it does not leak into the next
   * shot on the same page.
   */
  hide?: string[];
  /**
   * Capture the RAW scene render instead of the composited frame.
   *
   * The point of an ablation is to localise, and the post chain destroys that:
   * hide one mesh and auto-exposure, bloom and the grade all move, so tens of
   * thousands of pixels change that have nothing to do with the mesh. Diff raw
   * renders and the difference is where the mesh was.
   */
  raw?: boolean;
  /** Render even if the cache has this frame. `--cold` implies it. */
  skipCache?: boolean;
}

/** One captured frame, plus what the renderer cost to draw it. */
export interface ShotResult {
  name: string;
  /**
   * Served from the frame cache rather than rendered.
   *
   * Reported, not hidden, because the counts below come from the sidecar rather
   * than from a renderer that just ran. A number that blinks in and out
   * depending on whether another agent asked first is indistinguishable from
   * geometry actually changing.
   */
  cached?: boolean;
  file: string;
  triangles: number;
  calls: number;
  textures: number;
  geometries: number;
  programs: number;
  ms: number;
}

/**
 * Every response carries the reuse counters and the build it came from, so a
 * client can tell a warm capture from a cold one, and a shared frame from its
 * own, without a second call.
 */
interface Counters {
  errors: string[];
  boots: number;
  reuses: number;
  /** Short form of the build identity these results are of. */
  build: string;
  /** True when the frames are of somebody's live working tree. Never quote them. */
  dirty: boolean;
}

export interface ShotsResponse extends Counters { results: ShotResult[]; bootMs: number }

/** `POST /eval` -- `fn` is a function *source string*, evaluated in the page. */
export interface EvalRequest extends PageOpts { fn: string; arg?: unknown }
export interface EvalResponse extends Counters { value: unknown }

/** `POST /lease` -- a play tool takes the whole page over CDP. */
export interface LeaseRequest extends PageOpts {
  ttlMs?: number;
  /**
   * A page with no game in it.
   *
   * Six tools -- `sheet`, `corpus`, `compare`, `imagestats`, `reliefstat`,
   * `shrink` -- use a browser purely as an image and HTML renderer: contact
   * sheets, canvas re-encodes, luminance histograms. They still need a browser,
   * so they still spend GPU and RSS, so they still belong under the budget. But
   * booting the game for them would be absurd, and navigating a *game* page to
   * a `file://` URL would silently poison the pool.
   */
  blank?: boolean;
}
export interface LeaseResponse extends Counters {
  id: string;
  cdp: string;
  url: string;
  appPort: number;
}

export interface BuildHealth {
  build: string;
  dirty: boolean;
  port: number;
  kind: 'dev' | 'prod';
  pages: number;
  idleSec: number;
}

export interface HealthResponse {
  ok: boolean;
  protocol: number;
  repoKey: string;
  daemonPort: number;
  uptimeSec: number;
  /** False means the GPU program cache is cold every boot; see chromium.mts. */
  persistentProfile: boolean;
  budget: number;
  workers: { busy: number, total: number };
  pool: { pages: number, contexts: number, budget: number };
  queue: { lane: Lane, depth: number, agents: Record<string, number> }[];
  builds: BuildHealth[];
  boots: number;
  reuses: number;
  bootMs: number;
  idleSec: number;
  exclusive: string | null;
  resetDrift: Record<string, string>;
}

/**
 * The request bodies arrive as untrusted JSON off a socket, so they are
 * narrowed here rather than asserted at the call. A predicate is worth the four
 * extra lines over a cast: it narrows, so the route receives a checked request,
 * and the `400` and the type stay in step because they derive from one test.
 */
function isShotsRequest(b: Record<string, unknown>): b is Record<string, unknown> & ShotsRequest {
  return Array.isArray(b.shots) && b.shots.every((s) => typeof s === 'string') && typeof b.out === 'string';
}

function isEvalRequest(b: Record<string, unknown>): b is Record<string, unknown> & EvalRequest {
  return typeof b.fn === 'string';
}

// --------------------------------------------------------------- client side

/**
 * POST JSON to the daemon. The caller names the response it expects.
 *
 * DELIBERATELY NOT `fetch`. undici aborts a request whose *headers* have not
 * arrived within 300 s, and that timeout is not configurable from `fetch` --
 * `AbortSignal.timeout(600_000)` does not raise it, it only adds a second,
 * later deadline. A long job blows the 300 s budget while rendering perfectly
 * well, and the client sees `TypeError: fetch failed` with an
 * `UND_ERR_HEADERS_TIMEOUT` cause that names nothing about what it was doing.
 *
 * `corpus.mts` hit this and grew a private `node:http` copy of this function to
 * escape it. Then a 20-shot sweep on the `sweep` lane hit it again from the
 * shared client, which is the point at which a workaround in one tool stops
 * being enough: the whole design of the sweep lane is that a request may
 * legitimately queue for a long time behind somebody else's work.
 *
 * So: raw `node:http`, no header deadline, and a generous socket-IDLE timeout
 * instead -- which is the honest thing to bound, since a daemon that has gone
 * quiet for 45 minutes really is wedged.
 */
export function call<T = unknown>(route: string, body?: unknown, { timeout = 45 * 60_000 }: { timeout?: number } = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({
      host: '127.0.0.1',
      port: DAEMON_PORT,
      path: route,
      method: payload ? 'POST' : 'GET',
      headers: payload
        ? { 'content-type': 'application/json', 'content-length': payload.length }
        : {},
    }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (d: string) => { raw += d; });
      res.on('end', () => {
        let j: T & { error?: string };
        try { j = JSON.parse(raw) as T & { error?: string }; }
        catch { return reject(new Error(`daemon ${res.statusCode}: ${raw.slice(0, 200)}`)); }
        if (res.statusCode === 429) {
          const err = new Error(j.error || 'daemon busy') as Error & { busy: true, detail: unknown };
          err.busy = true;
          err.detail = j;
          return reject(err);
        }
        if (res.statusCode !== 200) return reject(new Error(j.error || `daemon ${res.statusCode}`));
        return resolve(j);
      });
    });
    req.setTimeout(timeout, () => req.destroy(new Error(`daemon socket idle for ${Math.round(timeout / 1000)} s`)));
    req.on('error', reject);
    req.end(payload ?? undefined);
  });
}

/** What the daemon says about itself before any work is asked of it. */
interface VersionResponse { protocol: number; repoKey: string; pid: number; startedFrom: string }

/**
 * Make sure a daemon is listening, starting a detached one if not.
 *
 * Three failure modes, all of which have actually happened here:
 *
 * - **A daemon for a different repository.** Reusing it captures the other
 *   repo's build. Hard error, never a silent reuse.
 * - **A daemon speaking an older protocol.** Stop it and start a fresh one. It
 *   cannot reload itself, and a client that quietly talks to it debugs code
 *   that is not running.
 * - **Nothing there.** Start one, detached, so it survives this agent.
 *
 * @returns true if this call started it
 */
export async function ensureDaemon(): Promise<boolean> {
  const reg = readRegistry(KEY);
  const port = reg?.port ?? DAEMON_PORT;
  if (await portOpen(port)) {
    let v: VersionResponse | null = null;
    try { v = await call<VersionResponse>('/version', undefined, { timeout: 5_000 }); } catch { /* pre-/version daemon */ }
    if (v && v.repoKey !== KEY) {
      throw new Error(
        `the daemon on port ${port} serves a different repository:\n`
        + `  running: ${v.repoKey}\n  wanted:  ${KEY}\n`
        + 'That is a port collision between two repos. Set HARNESS_DAEMON_PORT, or stop that daemon.');
    }
    if (v && v.protocol === PROTOCOL) return false;
    console.log(`[daemon] running daemon speaks protocol ${v?.protocol ?? '<none>'}, this client speaks ${PROTOCOL}; restarting it`);
    try { await call('/stop', {}); } catch { /* already going */ }
    for (let i = 0; i < 100 && await portOpen(port); i++) await sleep(100);
  }
  const child = spawn(process.execPath, [path.join(ROOT, 'src/tools/daemon.mts')], {
    cwd: ROOT, detached: true, stdio: 'ignore', env: { ...process.env },
  });
  child.unref();
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    await sleep(200);
    if (await portOpen(DAEMON_PORT)) return true;
  }
  throw new Error('daemon failed to start');
}

// ---------------------------------------------------------------- the builds

/** One servable build: a directory, a vite server and a port. */
class Build {
  id: BuildId;
  dir: string;
  port: number;
  kind: 'dev' | 'prod';
  server: ChildProcess | null = null;
  lastUsed = Date.now();
  /** Only meaningful for a dirty build; a sha build is its own fingerprint. */
  stamp: string;

  constructor(id: BuildId, dir: string, port: number, kind: 'dev' | 'prod') {
    this.id = id;
    this.dir = dir;
    this.port = port;
    this.kind = kind;
    this.stamp = isDirty(id) ? sourceStamp(dir) : (shaOf(id) ?? id);
  }

  /** The fingerprint a page must have booted with to still be valid. */
  currentStamp(): string { return isDirty(this.id) ? sourceStamp(this.dir) : this.stamp; }

  url(query: string): string { return `http://127.0.0.1:${this.port}/${query}`; }

  stop() { if (this.server) { this.server.kill(); this.server = null; } }
}

/**
 * Materialise, serve and prune build identities.
 *
 * The daemon allocates every server port out of its own block, so no human ever
 * picks one — which retires the `PORT`-per-worktree convention and the trap
 * both `CLAUDE.md` and RESCUE warned about (aiming a tool at the daemon's port
 * and hanging for the full 300 s).
 */
class BuildStore {
  builds = new Map<BuildId, Build>();
  private starting = new Map<BuildId, Promise<Build>>();
  private nextPort = DAEMON_PORT + 1;

  private async freePort(): Promise<number> {
    for (let i = 0; i < 200; i++) {
      const p = this.nextPort++;
      if (this.nextPort > DAEMON_PORT + 200) this.nextPort = DAEMON_PORT + 1;
      if (![...this.builds.values()].some((b) => b.port === p) && !(await portOpen(p))) return p;
    }
    throw new Error('no free port for a build server');
  }

  /**
   * @param prod serve the production bundle instead of the dev server. Rare;
   *   see `start()` for why it is not the default it was designed to be.
   */
  async acquire(id: BuildId, prod = false): Promise<Build> {
    const key = prod ? `${id}#prod` : id;
    const have = this.builds.get(key);
    if (have) { have.lastUsed = Date.now(); return have; }
    const pending = this.starting.get(key);
    if (pending) return pending;
    const p = this.start(id, prod, key).finally(() => this.starting.delete(key));
    this.starting.set(key, p);
    return p;
  }

  /**
   * DEV IS THE DEFAULT, EVEN FOR AN IMMUTABLE SHA TREE.
   *
   * The plan proposed `vite build` + `preview` for sha builds, on the grounds
   * that an immutable tree only pays the build once. Two things overturned it.
   *
   * It buys nothing measurable: boot from a materialised tree is **9248 ms
   * under dev against 8838 ms under preview** — 4%, against a build step and a
   * `dist/` per sha.
   *
   * And it breaks real tools. `heightcheck` does
   * `import('/world/terrain/TerrainMaterial.ts')` *inside the page*, to compare
   * the GPU's terrain surface against the same source the shader was built
   * from. A preview server has no such URL, so it 404s — and the failure looks
   * like a broken probe rather than a wrong server. `bootprof` and the probe
   * rigs are the same shape. Whatever a production build is worth reviewing
   * for, it is not worth silently deleting the ability to import the source
   * under test.
   *
   * `prod` remains available for the one thing it is actually for: looking at
   * the bundle that ships. Note the landmine when you use it — a production
   * build mangles class names, and `Game.add()` falls back to
   * `constructor.name` when a system is registered without an explicit key.
   */
  private async start(id: BuildId, prod: boolean, key: string): Promise<Build> {
    const port = await this.freePort();
    let build: Build;
    if (isDirty(id)) {
      // The live tree, served by a dev server. A full production build per
      // keystroke is exactly what this path exists to avoid.
      build = new Build(id, id.slice(DIRTY_PREFIX.length), port, 'dev');
      build.server = spawn(VITE, ['--port', String(port), '--strictPort'],
        { cwd: build.dir, stdio: ['ignore', 'ignore', 'ignore'] });
    } else {
      const dir = materialise(id, prod);
      build = new Build(id, dir, port, prod ? 'prod' : 'dev');
      build.server = spawn(VITE, prod
        ? ['preview', '--port', String(port), '--strictPort']
        : ['--port', String(port), '--strictPort'],
      { cwd: dir, stdio: ['ignore', 'ignore', 'ignore'] });
    }
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      await sleep(200);
      if (await portOpen(port)) {
        this.builds.set(key, build);
        console.log(`[daemon] serving ${shortBuild(id)} (${build.kind}) on ${port}`);
        return build;
      }
    }
    build.stop();
    throw new Error(`vite failed to serve ${shortBuild(id)} on ${port}`);
  }

  release(id: BuildId) {
    const b = this.builds.get(id);
    if (!b) return;
    b.stop();
    this.builds.delete(id);
  }

  /** Drop build servers nothing has asked for lately. The trees stay on disk. */
  reapIdle() {
    for (const [id, b] of this.builds) {
      if (Date.now() - b.lastUsed > BUILD_IDLE_MS) {
        console.log(`[daemon] ${shortBuild(id)} idle, stopping its server`);
        this.release(id);
      }
    }
  }

  closeAll() { for (const id of [...this.builds.keys()]) this.release(id); }
}

/**
 * Lay a tree sha out on disk, once, and build it.
 *
 * THE SYMLINKS ARE THE WHOLE COST MODEL. Measured
 * (`project/journal/2026-08-23-harness-bench.md`): `git archive` 173 ms +
 * `vite build` **562 ms**. The first version of that measurement said 24 514 ms,
 * and the entire difference was `src/public/baked` — without the symlink every
 * sha re-bakes the terrain, and `--build HEAD` stops being affordable as a
 * default.
 *
 * The bake cache is shared and therefore **read-only from here**. A
 * `texbake.mts --force` run inside a materialised tree would rewrite the
 * artifacts every other tree is booting against — the exact hazard that bit the
 * worktree experiment, where symlinking the cache into three checkouts meant
 * one agent's `--force` silently re-textured everybody else's game.
 */
function materialise(id: BuildId, prod: boolean): string {
  // `prod` is opt-in and rare; see BuildStore.start for why dev is the default.
  const sha = shaOf(id);
  if (!sha) throw new Error(`not a sha build: ${id}`);
  const dir = path.join(repoCacheDir(KEY), 'trees', sha);
  if (!existsSync(path.join(dir, 'src', 'index.html'))) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    execFileSync('bash', ['-c', `git archive ${sha} | tar -x -C ${JSON.stringify(dir)}`], { cwd: ROOT });
    linkNodeModules(dir);
    const bake = path.join(ROOT, 'src/public/baked');
    if (existsSync(bake)) {
      mkdirSync(path.join(dir, 'src/public'), { recursive: true });
      rmSync(path.join(dir, 'src/public/baked'), { recursive: true, force: true });
      execFileSync('ln', ['-s', bake, path.join(dir, 'src/public/baked')]);
    }
    pruneTrees();
  }
  if (prod && !existsSync(path.join(dir, 'dist', 'index.html'))) {
    execFileSync(VITE, ['build'], { cwd: dir, stdio: ['ignore', 'ignore', 'pipe'], timeout: 600_000 });
  }
  return dir;
}

/**
 * A per-tree `node_modules` that shares every package but NOT `.vite`.
 *
 * Symlinking `node_modules` wholesale is the obvious move and it reintroduces a
 * bug this repo already paid for. Vite resolves its dependency cache to
 * `<root>/node_modules/.vite`, which through a wholesale symlink is the *same
 * directory* for every build server — so several vites fight over one cache,
 * each decides the config changed, each re-optimises, and each triggers a full
 * page reload that the capture harness sees as a boot which never finishes.
 * `src/tools/vite.map.config.mts` existed solely to dodge that with a private
 * `cacheDir`, back when the collision was between worktrees.
 *
 * So: a real directory, one symlink per top-level entry, and `.vite` left for
 * this tree's vite to create for itself. A few hundred symlinks, well under the
 * 173 ms the archive costs.
 */
function linkNodeModules(dir: string) {
  const src = path.join(ROOT, 'node_modules');
  const dest = path.join(dir, 'node_modules');
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    if (name === '.vite' || name.startsWith('.vite-')) continue;
    try { symlinkSync(path.join(src, name), path.join(dest, name)); } catch { /* already there */ }
  }
}

/**
 * Keep the N most recently touched trees.
 *
 * 115 MB each, so ten is 1.2 GB — cheap enough that pruning harder would cost
 * more in re-materialising than it saves on disk.
 */
function pruneTrees() {
  const root = path.join(repoCacheDir(KEY), 'trees');
  let entries: string[];
  try { entries = readdirSync(root); } catch { return; }
  const byAge = entries
    .map((name) => ({ name, at: statSync(path.join(root, name)).mtimeMs }))
    .sort((a, b) => b.at - a.at);
  for (const stale of byAge.slice(MAX_TREES)) {
    rmSync(path.join(root, stale.name), { recursive: true, force: true });
  }
}

// ----------------------------------------------------------------- the cache

/**
 * Frames, content-addressed by the build that produced them.
 *
 * Under `~/.cache/ffxv-harness/<keyhash>/frames/<sha>/` rather than `tmp/`.
 * `CLAUDE.md` is right that deleting `tmp/` must cost nothing, but `tmp/` is
 * per-checkout, and a per-checkout cache cannot serve the cross-agent hits that
 * are the entire point: five agents reviewing `HEAD` should render each shot
 * once between them. This lives beside the registry, is equally free to delete,
 * and must never go near `src/public/baked/`, which costs a re-bake.
 *
 * `dirty:` builds are NEVER cached. Their content is a moving target by
 * definition, and a cached frame of somebody's half-saved edit is the worst
 * possible thing to hand to a third party.
 */
function frameKey(build: BuildId, name: string, w: number, h: number, query: string, jpeg: number): string {
  return createHash('sha1')
    .update([build, name, w, h, query, jpeg, PROTOCOL].join('|'))
    .digest('hex').slice(0, 16);
}

const framesDir = (build: BuildId) => path.join(repoCacheDir(KEY), 'frames', shaOf(build) ?? 'dirty');

/**
 * The stats sidecar, and why it is not optional.
 *
 * Without it a cache hit returns `{ms: 0, cached: true}` and `triangles` /
 * `calls` come back `undefined` — so the counts appear and disappear depending
 * on whether another agent happened to ask first. Scaffold shipped this bug and
 * it is exactly as confusing as it sounds.
 */
interface Sidecar { triangles: number; calls: number; textures: number; geometries: number; programs: number; ms: number }

function cacheLookup(build: BuildId, key: string, ext: string): { file: string, meta: Sidecar } | null {
  const file = path.join(framesDir(build), `${key}.${ext}`);
  const side = path.join(framesDir(build), `${key}.json`);
  if (!existsSync(file) || !existsSync(side)) return null;
  try {
    const meta = JSON.parse(readFileSync(side, 'utf8')) as Sidecar;
    // Touch the sha directory so the pruner keeps what is actually in use.
    utimesSync(framesDir(build), new Date(), new Date());
    return { file, meta };
  } catch { return null; }
}

/**
 * Keep the N newest sha directories and the OLDEST one.
 *
 * The oldest is kept deliberately: it is the record of where this session
 * started, and "how far has this moved since we began" is the comparison
 * somebody always wants and nobody thinks to preserve. 1600x900 PNGs over a
 * 142-shot corpus reach gigabytes in a session, so the middle goes.
 */
function pruneFrames(keepNewest = 6) {
  const root = path.join(repoCacheDir(KEY), 'frames');
  let names: string[];
  try { names = readdirSync(root); } catch { return; }
  if (names.length <= keepNewest + 1) return;
  const byAge = names
    .map((name) => ({ name, at: statSync(path.join(root, name)).mtimeMs }))
    .sort((a, b) => b.at - a.at);
  const keep = new Set([...byAge.slice(0, keepNewest), byAge[byAge.length - 1]].map((e) => e.name));
  for (const e of byAge) if (!keep.has(e.name)) rmSync(path.join(root, e.name), { recursive: true, force: true });
}

/**
 * Renders in flight, by frame key.
 *
 * This is the cross-agent half of the win. Five agents asking for `hero_full`
 * at the same sha *at the same time* miss the cache identically, and without
 * coalescing that is five renders of one frame — four of them on browsers that
 * could have been doing something else.
 */
const inflight = new Map<string, Promise<Sidecar>>();

// ------------------------------------------------------------------ the pool

/** A booted page, leased rather than owned. */
class Slot {
  ctx: BrowserContext;
  page: Page | null = null;
  /** `(build, viewport, query)` — the identity a page must match to be reused. */
  key = '';
  build: BuildId | null = null;
  busy = false;
  lastUsed = Date.now();
  errors: string[] = [];
  cdpPort: number;
  viewport = { w: 0, h: 0 };
  constructor(ctx: BrowserContext, cdpPort: number) { this.ctx = ctx; this.cdpPort = cdpPort; }
}

/**
 * The one object that knows what every chromium on this machine is for, which
 * is why it is the one object that can enforce a budget.
 *
 * BROWSER_BUDGET = 4, measured. Note what Phase 0 says about *parking*: unlike
 * `../game-scaffold`, a posed page here burns **zero** idle CPU (`main.ts`
 * never starts the render loop under `?shoot=1`), parking to `about:blank`
 * reclaims 17% of its RSS, and unparking costs a full 8.5 s reboot. So this
 * pool does not park. It holds up to four contexts, keyed by what they are
 * showing, and evicts the least recently used when a fifth identity is wanted.
 */
class BrowserPool {
  slots: Slot[] = [];
  persistentProfile = false;
  boots = 0;
  reuses = 0;
  bootMs = 0;
  private waiters: (() => void)[] = [];

  get pages(): number { return this.slots.filter((s) => s.page).length; }

  /** CDP ports handed out but whose browser has not finished launching. */
  private reservedCdp = new Set<number>();

  private async newSlot(w: number, h: number): Promise<Slot> {
    // A CDP port per slot, from a block nothing else uses. It is opened on every
    // slot rather than on demand because a browser cannot grow one later, and a
    // play tool must not have to wait for a fresh launch to get a lease.
    //
    // RESERVE IT BEFORE AWAITING. A slot only joins `this.slots` once its
    // browser has launched, so two concurrent `newSlot` calls both saw an empty
    // set and both picked 9333 -- two chromiums fighting for one debug port,
    // which surfaces as `browserType.launch: Timeout 180000ms exceeded` with
    // nothing in it that names a port. Five agents fanning out on a cold pool is
    // exactly the shape that hits it, which is to say the normal one.
    const used = new Set([...this.slots.map((s) => s.cdpPort), ...this.reservedCdp]);
    let cdpPort = CDP_BASE;
    while (used.has(cdpPort)) cdpPort++;
    this.reservedCdp.add(cdpPort);
    try {
      const { ctx, persistent } = await launchPersistent({ width: w, height: h }, cdpPort);
      this.persistentProfile = persistent;
      const slot = new Slot(ctx, cdpPort);
      this.slots.push(slot);
      return slot;
    } finally {
      this.reservedCdp.delete(cdpPort);
    }
  }

  /**
   * Take a slot showing `key`, booting or evicting as needed.
   *
   * Prefers, in order: a free slot already showing this exact page, a free empty
   * slot, a new slot under budget, the least recently used free slot. Only when
   * every slot is busy does it wait — and that wait is what the deadline and
   * the `429` exist to bound.
   */
  async lease(key: string, w: number, h: number, cold: boolean): Promise<Slot> {
    for (;;) {
      if (!cold) {
        const match = this.slots.find((s) => !s.busy && s.page && s.key === key);
        if (match) { match.busy = true; match.lastUsed = Date.now(); this.reuses++; return match; }
      }
      const empty = this.slots.find((s) => !s.busy && !s.page);
      if (empty) { empty.busy = true; return empty; }
      if (this.slots.length < BROWSER_BUDGET) {
        const slot = await this.newSlot(w, h);
        slot.busy = true;
        return slot;
      }
      const free = this.slots.filter((s) => !s.busy).sort((a, b) => a.lastUsed - b.lastUsed)[0];
      if (free) { await this.evict(free); free.busy = true; return free; }
      await new Promise<void>((r) => this.waiters.push(r));
    }
  }

  release(slot: Slot) {
    slot.busy = false;
    slot.lastUsed = Date.now();
    const w = this.waiters.shift();
    if (w) w();
  }

  /** Drop the page but keep the browser: relaunching chromium is the expensive half. */
  private async evict(slot: Slot) {
    if (slot.page) { await slot.page.close().catch(() => {}); }
    slot.page = null;
    slot.key = '';
    slot.build = null;
  }

  /** A wedged page must never be pooled; recycle the whole context. */
  async recycle(slot: Slot) {
    await slot.ctx.close().catch(() => {});
    this.slots = this.slots.filter((s) => s !== slot);
    const w = this.waiters.shift();
    if (w) w();
  }

  async closeAll() {
    const slots = this.slots;
    this.slots = [];
    for (const s of slots) await s.ctx.close().catch(() => {});
    for (const w of this.waiters.splice(0)) w();
  }

  get idle(): boolean { return this.slots.every((s) => !s.busy); }
}

// ------------------------------------------------------------- the scheduler

export type Lane = 'fix' | 'sweep';
const LANES: Lane[] = ['fix', 'sweep'];

interface Job<T = unknown> {
  lane: Lane;
  agent: string;
  kind: string;
  enqueuedAt: number;
  deadlineMs: number;
  run: () => Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
  /** Fires the `429` while the client still cares; cleared once the job runs. */
  timer?: NodeJS.Timeout;
}

/**
 * Two priority classes, N workers, work stealing, and round-robin over the
 * *requesting agent* before lane priority.
 *
 * The lanes are priority classes, not execution units: `fix` is one agent
 * wanting one shot now, `sweep` is a 139-shot corpus that must never starve it.
 * The fair-share layer is what stops one agent's corpus monopolising the pool —
 * without it, "why is my capture slow" has no answer, and with it `/health`
 * answers it by naming who is ahead.
 */
class Scheduler {
  queues: Record<Lane, Job[]> = { fix: [], sweep: [] };
  private busyWorkers = 0;
  private lastAgent = new Map<Lane, string>();
  /** An exclusive holder quiesces everything; see `/exclusive`. */
  exclusive: string | null = null;
  /**
   * The holder's pid, because a holder that dies must not keep the machine.
   *
   * `perf.mts` calls `process.exit(2)` when a shot misses its target, which
   * skips every `finally` in the process — so the release never went out, the
   * lease stayed held forever, and every later request queued behind a gate
   * nobody was standing at. It looked exactly like a hung daemon. Liveness is
   * the only honest owner check: a TTL either expires on a legitimate long run
   * or leaves a dead holder in place, and this leaves neither.
   */
  private exclusivePid = 0;
  private exclusiveWaiters: (() => void)[] = [];

  /** Drop an exclusive lease whose holder is gone. Cheap; called before every decision. */
  reapExclusive() {
    if (!this.exclusive || !this.exclusivePid) return;
    try { process.kill(this.exclusivePid, 0); } catch {
      console.log(`[daemon] exclusive holder ${this.exclusive} (pid ${this.exclusivePid}) is gone; releasing`);
      this.releaseExclusive();
    }
  }

  submit<T>(lane: Lane, agent: string, kind: string, deadlineMs: number, run: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const job: Job = {
        lane, agent, kind, enqueuedAt: Date.now(), deadlineMs, run,
        resolve: resolve as (v: unknown) => void, reject,
      };
      /**
       * The deadline fires from a TIMER, not from the dispatch check.
       *
       * The first version only tested `waited > deadlineMs` when the job
       * reached the front of the queue -- so a 2-second deadline behind a
       * 20-shot sweep returned its `429` seventy seconds later. That is not a
       * deadline, it is a note about the past: the client had already hung for
       * exactly as long as the deadline existed to prevent. "No tool hangs for
       * 300 s" only means something if the answer arrives when it is still
       * useful.
       *
       * The job is pulled out of its queue on the way, so nothing later runs
       * work whose client has gone.
       */
      if (deadlineMs > 0) {
        job.timer = setTimeout(() => {
          const q = this.queues[lane];
          const i = q.indexOf(job);
          if (i < 0) return;                       // already running; let it finish
          q.splice(i, 1);
          job.reject(busyError(this, Date.now() - job.enqueuedAt));
        }, deadlineMs);
        job.timer.unref?.();
      }
      this.queues[lane].push(job);
      this.pump();
    });
  }

  depth(): number { return LANES.reduce((n, l) => n + this.queues[l].length, 0); }
  get busy(): number { return this.busyWorkers; }

  /** Agents whose work is on a worker right now, by name. */
  private running = new Map<string, number>();

  /**
   * Who is ahead of a job that just arrived — QUEUED *and* RUNNING.
   *
   * Counting only the queue produced "0 job(s) queued" as the explanation for
   * being turned away, which is worse than saying nothing: the four agents
   * actually holding the browsers had all been dequeued, so the honest answer
   * looked like an empty machine refusing work.
   */
  ahead(): Record<string, number> {
    const by: Record<string, number> = {};
    for (const [agent, n] of this.running) by[agent] = n;
    for (const l of LANES) for (const j of this.queues[l]) by[j.agent] = (by[j.agent] ?? 0) + 1;
    return by;
  }

  /**
   * Take the next job: `fix` before `sweep`, and within a lane the agent that
   * did *not* go last, so a corpus interleaves with everyone else's single
   * shots rather than draining first.
   */
  private take(): Job | null {
    for (const lane of LANES) {
      const q = this.queues[lane];
      if (!q.length) continue;
      const last = this.lastAgent.get(lane);
      // While an exclusive lease is out, the holder is the only agent that runs
      // — including its own work. Without this the quiet lane deadlocks: perf
      // quiesces the machine and then queues behind its own gate forever.
      const eligible = (j: Job) => !this.exclusive || j.agent === this.exclusive;
      if (!q.some(eligible)) continue;
      let i = q.findIndex((j) => eligible(j) && j.agent !== last);
      if (i < 0) i = q.findIndex(eligible);
      const [job] = q.splice(i, 1);
      this.lastAgent.set(lane, job.agent);
      return job;
    }
    return null;
  }

  private pump() {
    this.reapExclusive();
    // A holder's own job must not satisfy the quiesce it is waiting for, so
    // nothing runs at all until the drain completes. Checked before `take()`,
    // which removes a job from its queue: returning after taking one would drop
    // it on the floor and hang its client for the full request timeout.
    if (this.exclusive && this.exclusiveWaiters.length) return;
    while (this.busyWorkers < WORKERS) {
      const job = this.take();
      if (!job) return;
      if (job.timer) clearTimeout(job.timer);
      this.busyWorkers++;
      this.running.set(job.agent, (this.running.get(job.agent) ?? 0) + 1);
      void job.run().then(job.resolve, job.reject).finally(() => {
        this.busyWorkers--;
        const n = (this.running.get(job.agent) ?? 1) - 1;
        if (n > 0) this.running.set(job.agent, n); else this.running.delete(job.agent);
        if (!this.busyWorkers && this.exclusiveWaiters.length) {
          for (const w of this.exclusiveWaiters.splice(0)) w();
        }
        this.pump();
      });
    }
  }

  /**
   * Quiesce the whole machine and hand it to one holder.
   *
   * This is the payoff of one daemon per repository. RESCUE threw away every
   * perf number from a session because they were taken under six concurrent
   * chromiums; under per-worktree daemons that is unfixable, because a daemon
   * cannot quiesce browsers it does not own. Here "the machine is quiet" is a
   * property that can be enforced rather than hoped for.
   */
  async takeExclusive(holder: string, pid: number): Promise<void> {
    this.reapExclusive();
    if (this.exclusive) throw new Error(`exclusive lease already held by ${this.exclusive}`);
    this.exclusive = holder;
    this.exclusivePid = pid;
    if (this.busyWorkers) await new Promise<void>((r) => this.exclusiveWaiters.push(r));
  }

  releaseExclusive() {
    this.exclusive = null;
    this.exclusivePid = 0;
    for (const w of this.exclusiveWaiters.splice(0)) w();
    this.pump();
  }
}

function busyError(sched: Scheduler, waitedMs: number): Error & { busy: true, detail: unknown } {
  const ahead = sched.ahead();
  const who = Object.entries(ahead).sort((a, b) => b[1] - a[1])[0];
  const total = Object.values(ahead).reduce((a, b) => a + b, 0);
  const e = new Error(
    `daemon busy: waited ${waitedMs} ms, ${total} job(s) queued or running`
    + (who ? `, ${who[0]} has ${who[1]} of them` : '')
    + `, ${sched.busy}/${WORKERS} workers busy`,
  ) as Error & { busy: true, detail: unknown };
  e.busy = true;
  e.detail = { busy: true, queueDepth: sched.depth(), workersBusy: sched.busy, waitedMs, ahead };
  return e;
}

// ---------------------------------------------------------------- the harness

const store = new BuildStore();
const pool = new BrowserPool();
const sched = new Scheduler();
const startedAt = Date.now();
let lastUsed = Date.now();
/** Reset drift per build, checked once per build; see `checkResetDrift`. */
const resetDrift: Record<string, string> = {};

function pageKey(build: BuildId, w: number, h: number, query: string, prod = false): string {
  return `${build}${prod ? '#prod' : ''}|${w}x${h}|${query}`;
}

function queryOf(opts: PageOpts): string {
  const { q = 'ultra', nobake = false, post = '', play = false, extra = '' } = opts;
  return `?q=${q}${play ? '' : '&shoot=1'}${nobake ? '&nobake=1' : ''}`
    + `${post ? `&post=${encodeURIComponent(post)}` : ''}${extra ? `&${extra}` : ''}`;
}

/** Boot a page in a slot, or reuse the one already there. */
async function preparePage(slot: Slot, build: Build, opts: PageOpts): Promise<Page> {
  const { w = 1600, h = 900, cold = false } = opts;
  const query = queryOf(opts);
  const key = pageKey(build.id, w, h, query, build.kind === 'prod');
  slot.errors.length = 0;

  // A dirty build's page may have booted before an edit; a sha build's cannot.
  const stampOk = !isDirty(build.id) || slot.key === key;
  if (slot.page && !cold && slot.key === key && stampOk && build.currentStamp() === build.stamp) {
    if (slot.viewport.w !== w || slot.viewport.h !== h) {
      await slot.page.setViewportSize({ width: w, height: h });
      slot.viewport = { w, h };
      // A resize invalidates every temporal buffer and the post-chain targets.
      await slot.page.evaluate(() => { window.GAME.rnd.resize(); window.GAME.post?.resetHistory?.(); });
    }
    // A play page is handed over RUNNING; stopping it here is the one thing the
    // tool leasing it does not want.
    if (!opts.play) await resetPage(slot.page);
    return slot.page;
  }
  if (isDirty(build.id)) build.stamp = build.currentStamp();

  if (slot.page) { await slot.page.close().catch(() => {}); slot.page = null; }
  // EXACTLY ONE PAGE PER CONTEXT, always. A leased play tool finds its page by
  // asking the CDP connection what pages exist, so a context that has quietly
  // accumulated a second one hands the tool a page nobody booted -- which fails
  // as a timeout waiting for `GAME.ready` on a blank tab, thirty seconds away
  // from anything that names the real cause.
  for (const stray of slot.ctx.pages().slice(1)) await stray.close().catch(() => {});
  // A persistent context fixes its viewport at launch, so a later request for a
  // different size has to resize rather than ask for it up front.
  const page = slot.ctx.pages()[0] ?? await slot.ctx.newPage();
  await page.setViewportSize({ width: w, height: h });
  page.on('pageerror', (e: Error) => slot.errors.push(String(e)));
  page.on('console', (m: ConsoleMessage) => { if (m.type() === 'error') slot.errors.push(m.text()); });

  const t0 = Date.now();
  await page.goto(build.url(query), { waitUntil: 'domcontentloaded', timeout: 300_000 });
  await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 300_000 });
  // `ready` is set one warm frame before `main.ts` adds `#boot.done`, and that
  // class only starts an 800 ms opacity transition -- so a capture taken the
  // instant the page reports ready contains the loading screen. It is silent:
  // the shot still reports its real triangle and draw-call counts, so nothing
  // looks wrong until someone opens the image. Only the *first* capture after a
  // boot can hit it, which is why it survives a warm daemon.
  //
  // Remove the node rather than waiting for the fade: the transition needs
  // frames, and a headless page whose render loop the harness has just stopped
  // is not guaranteed to get them. Waiting on `opacity === '0'` hung every
  // capture for the full timeout.
  await page.evaluate(() => { document.getElementById('boot')?.remove(); });
  pool.bootMs = Date.now() - t0;
  pool.boots++;
  slot.page = page;
  slot.key = key;
  slot.build = build.id;
  slot.viewport = { w, h };
  // A FRESHLY BOOTED PAGE IS NOT RESET. It is already in the state a fresh load
  // leaves it in, which is the state `reset()` is trying to reproduce -- so
  // calling it here can only move the page AWAY from that state, never toward
  // it. `integration.mts` proved that too: 27 pass at the session's starting
  // commit, 24 pass with two "not integrated" once `reset()` existed and ran
  // after every boot, because `Menus.setScreen('main')` had opened the title
  // screen on a page nothing had dirtied. It only needs the clock zeroed and
  // the loading screen gone.
  if (!opts.play) await freshenPage(page);
  return page;
}

/** What a *just-booted* page needs, and nothing more. */
async function freshenPage(page: Page) {
  await page.evaluate(() => {
    window.GAME.stop();
    window.GAME.resetClock();
    document.getElementById('boot')?.remove();
  });
}

/**
 * Return a page to the state a fresh load leaves it in for the harness.
 *
 * Prefers `GAME.reset()` when the game provides it, because a soft reset
 * measured **1.97 s against an 11.1 s reload** — and 2.00 s against 10.9 s even
 * from a dungeon interior, the lighting-changing case that was expected to
 * invert the result (it recompiled 6 shader programs, not the 43 that once cost
 * a 9.5 s freeze).
 *
 * The speed is not the risk. A reset that leaves formation state, dungeon
 * lighting or weather behind produces frames that are plausible and wrong,
 * which is the most expensive kind of wrong. That is what `checkResetDrift`
 * is for, and why it uses a `follow` shot.
 */
async function resetPage(page: Page | null) {
  if (!page || page.isClosed?.()) return;
  await page.evaluate(() => {
    const g = window.GAME as unknown as { reset?: () => void, stop: () => void, resetClock: () => void };
    if (typeof g.reset === 'function') g.reset();
    else { g.stop(); g.resetClock(); }
    document.getElementById('boot')?.remove();
  });
}

/** The counters and provenance every response carries. */
function counters(slot: Slot, build: Build): Counters {
  return {
    errors: [...slot.errors],
    boots: pool.boots,
    reuses: pool.reuses,
    build: shortBuild(build.id),
    dirty: isDirty(build.id),
  };
}

/** Lease a page for one job, and always give it back. */
async function withPage<T>(opts: PageOpts, fn: (page: Page, slot: Slot, build: Build) => Promise<T>): Promise<T> {
  lastUsed = Date.now();
  const buildId = opts.build ?? (DIRTY_PREFIX + ROOT);
  const build = await store.acquire(buildId, opts.prod);
  const { w = 1600, h = 900, cold = false } = opts;
  const slot = await pool.lease(pageKey(buildId, w, h, queryOf(opts), opts.prod), w, h, cold);
  try {
    const page = await preparePage(slot, build, opts);
    const out = await fn(page, slot, build);
    lastUsed = Date.now();
    return out;
  } catch (e) {
    // A page that threw may be wedged, and a wedged page must never be pooled.
    await pool.recycle(slot);
    throw e;
  } finally {
    if (pool.slots.includes(slot)) pool.release(slot);
  }
}

// -------------------------------------------------------------------- routes

async function routeShots(body: ShotsRequest): Promise<ShotsResponse> {
  const { shots, settle = 60, out, jpeg = 0, hide = [], raw = false, skipCache = false, ...rest } = body;
  const buildId = rest.build ?? (DIRTY_PREFIX + ROOT);
  const { w = 1600, h = 900, cold = false } = rest;
  const query = queryOf(rest);
  const ext = jpeg ? 'jpg' : 'png';
  /**
   * An ablation is never cached, and neither is a dirty build.
   *
   * `hide` and `raw` make the frame a *diagnosis* rather than a picture of the
   * build, and the whole point of an ablation is that it is compared against
   * its own control taken moments earlier. Serving either side of that pair
   * from a cache written by somebody else's run is how an ablation stops
   * proving anything.
   */
  const cacheable = !isDirty(buildId) && !cold && !skipCache && !hide.length && !raw;
  const outDir = path.isAbsolute(out) ? out : path.join(ROOT, out);
  await mkdir(outDir, { recursive: true });
  if (cacheable) mkdirSync(framesDir(buildId), { recursive: true });

  const results: ShotResult[] = [];
  const errors: string[] = [];
  /** Shots the cache cannot answer, in request order. */
  const todo: { name: string, key: string }[] = [];

  const deliver = (name: string, from: string, meta: Sidecar, cached: boolean) => {
    const file = path.join(outDir, `${name}.${ext}`);
    copyFileSync(from, file);
    results.push({ name, file: path.relative(ROOT, file), cached, ...meta });
  };

  for (const name of shots) {
    const key = frameKey(buildId, name, w, h, query, jpeg);
    const hit = cacheable ? cacheLookup(buildId, key, ext) : null;
    if (hit) deliver(name, hit.file, hit.meta, true);
    else todo.push({ name, key });
  }

  // Wait on anything another agent is already rendering, rather than rendering
  // it again on a second browser.
  const waited = cacheable
    ? await Promise.all(todo.map(async (t) => {
      const p = inflight.get(t.key);
      if (!p) return null;
      try { await p; } catch { return null; }
      return cacheLookup(buildId, t.key, ext) ? t : null;
    }))
    : [];
  for (const t of waited) {
    if (!t) continue;
    const hit = cacheLookup(buildId, t.key, ext)!;
    deliver(t.name, hit.file, hit.meta, true);
  }
  const render = todo.filter((t) => !waited.includes(t));

  let counters0: Counters | null = null;
  if (render.length) {
    // Claim every key BEFORE leasing a page, so a request that arrives while
    // this one is still queuing waits rather than starting a second render.
    const claims = new Map<string, { resolve: (m: Sidecar) => void, reject: (e: unknown) => void }>();
    if (cacheable) {
      for (const t of render) {
        inflight.set(t.key, new Promise<Sidecar>((resolve, reject) => {
          claims.set(t.key, { resolve, reject });
        }));
      }
    }
    try {
      await withPage(rest, async (page, slot, build) => {
        for (const { name, key } of render) {
          const t0 = Date.now();
    const meta = await page.evaluate(([n, s, hideList, rawFrame]: [string, number, string[], boolean]) => {
      const g = window.GAME;
      g.applyShot(n);
      g.settle(s);
      g.applyShot(n);          // re-anchor follow shots after settling
      g.settle(8);
      // Ablate AFTER settling: hiding a mesh must not change what the sim did,
      // only what the frame contains. Anything else and the two sides of the
      // diff are different worlds, not the same world minus one object.
      const hidden: Array<{ o: { visible: boolean }, was: boolean }> = [];
      if (hideList.length) {
        const want = hideList.map((h) => h.toLowerCase());
        g.scene.traverse((o) => {
          const nm = (o.name || '').toLowerCase();
          if (nm && want.some((h) => nm.includes(h))) {
            hidden.push({ o, was: o.visible });
            o.visible = false;
          }
        });
        g.frame(1 / 60);
      }
      // The raw pre-post render: the scene straight to the default
      // framebuffer, no composer. `screenshot()` then reads exactly that.
      if (rawFrame) {
        g.renderer.setRenderTarget(null);
        g.renderer.clear(true, true, false);
        g.renderer.render(g.scene, g.camera);
      }
      const gl = g.renderer.info;
      const out = {
        hidden: hidden.length,
        triangles: gl.render.triangles,
        calls: gl.render.calls,
        textures: gl.memory.textures,
        geometries: gl.memory.geometries,
        programs: g.renderer.info.programs?.length ?? 0,
      };
      for (const h of hidden) h.o.visible = h.was;
      return out;
    }, [name, settle, hide, raw] as [string, number, string[], boolean]);
          if (hide.length && meta.hidden === 0) {
            slot.errors.push(`--hide ${hide.join(',')} matched no scene object in ${name}`);
          }
          const { hidden: _hidden, ...counts } = meta;
          const sidecar: Sidecar = { ...counts, ms: Date.now() - t0 };
          const shot = await page.screenshot(jpeg ? { type: 'jpeg', quality: jpeg } : { type: 'png' });
          if (cacheable) {
            const cacheFile = path.join(framesDir(buildId), `${key}.${ext}`);
            await writeFile(cacheFile, shot);
            writeFileSync(path.join(framesDir(buildId), `${key}.json`), JSON.stringify(sidecar));
            deliver(name, cacheFile, sidecar, false);
            claims.get(key)?.resolve(sidecar);
            inflight.delete(key);
            claims.delete(key);
          } else {
            const file = path.join(outDir, `${name}.${ext}`);
            await writeFile(file, shot);
            results.push({ name, file: path.relative(ROOT, file), cached: false, ...sidecar });
          }
        }
        counters0 = counters(slot, build);
      });
    } finally {
      // Anything still claimed here failed; free the key or every later request
      // for it waits on a promise that will never settle.
      for (const [key, c] of claims) { c.reject(new Error('render failed')); inflight.delete(key); }
    }
    if (cacheable) pruneFrames();
  }

  // Requested order, not completion order: a caller reading the table down the
  // page should see the shots it asked for in the order it asked for them.
  const byName = new Map(results.map((r) => [r.name, r]));
  const ordered = shots.map((n) => byName.get(n)).filter((r): r is ShotResult => !!r);
  const c: Counters = counters0 ?? {
    errors, boots: pool.boots, reuses: pool.reuses,
    build: shortBuild(buildId), dirty: isDirty(buildId),
  };
  return { results: ordered, bootMs: pool.bootMs, ...c };
}

async function routeEval(body: EvalRequest): Promise<EvalResponse> {
  return withPage(body, async (page, slot, build) => {
    // `body.fn` arrives as source text, so the function has to be built here.
    // `new Function` is typed `Function`, which `evaluate` will not take; the
    // signature is the one it is constructed with.
    const fn = new Function('arg', `return (${body.fn})(arg)`) as (arg: unknown) => unknown;
    const value = await page.evaluate(fn, body.arg);
    return { value, ...counters(slot, build) };
  });
}

/**
 * Hand a whole page to a play tool over CDP.
 *
 * `gameplay`, `combatloop`, `integration`, `uxcheck` and friends drive real
 * input over a running loop; they need the `Page`, not a frame. So the daemon
 * keeps ownership of the chromium, the budget, the deadline and the teardown,
 * and the tool keeps full Playwright control of the page. That division is the
 * only reason those eight tools can stop launching their own browsers.
 */
const leases = new Map<string, { slot: Slot, build: Build | null, timer: NodeJS.Timeout, pid: number }>();

/**
 * Give back leases whose holder is gone.
 *
 * The TTL is the backstop for a client that hangs; this is for one that dies. A
 * crashed tool holding one of four slots is a quarter of the machine, and the
 * tools that crash are the long-running ones holding the longest leases.
 */
function reapLeases() {
  for (const [id, l] of leases) {
    if (!l.pid) continue;
    try { process.kill(l.pid, 0); } catch { void releaseLease(id); }
  }
}

async function routeLease(body: LeaseRequest): Promise<LeaseResponse> {
  lastUsed = Date.now();
  const { w = 1600, h = 900, cold = false, ttlMs = 15 * 60_000, blank = false } = body;

  if (blank) {
    // No build, no server, no boot -- but a real slot, so an image tool still
    // counts against the same budget as a capture. That is the point: the
    // reason to route these through the daemon at all is that six more
    // uncounted chromiums is six more uncounted chromiums.
    const slot = await pool.lease(`blank|${w}x${h}`, w, h, cold);
    try {
      if (!slot.page) {
        for (const stray of slot.ctx.pages().slice(1)) await stray.close().catch(() => {});
        const page = slot.ctx.pages()[0] ?? await slot.ctx.newPage();
        await page.setViewportSize({ width: w, height: h });
        await page.goto('about:blank');
        slot.page = page;
        slot.key = `blank|${w}x${h}`;
        slot.build = null;
        slot.viewport = { w, h };
      }
      const id = newLeaseId();
      leases.set(id, { slot, build: null, timer: setTimeout(() => { void releaseLease(id); }, ttlMs), pid: Number(body.pid) || 0 });
      return {
        id,
        cdp: `http://127.0.0.1:${slot.cdpPort}`,
        url: 'about:blank',
        appPort: 0,
        errors: [...slot.errors],
        boots: pool.boots,
        reuses: pool.reuses,
        build: 'blank',
        dirty: false,
      };
    } catch (e) {
      await pool.recycle(slot);
      throw e;
    }
  }

  const buildId = body.build ?? (DIRTY_PREFIX + ROOT);
  const build = await store.acquire(buildId, body.prod);
  const slot = await pool.lease(pageKey(buildId, w, h, queryOf(body), body.prod), w, h, cold);
  try {
    // The page is booted here so the caller connects to something ready, and so
    // a boot failure is the daemon's problem rather than arriving as a mystery
    // on the far side of a CDP socket.
    await preparePage(slot, build, body);
    const id = newLeaseId();
    const timer = setTimeout(() => { void releaseLease(id); }, ttlMs);
    leases.set(id, { slot, build, timer, pid: Number(body.pid) || 0 });
    return {
      id,
      cdp: `http://127.0.0.1:${slot.cdpPort}`,
      url: build.url(queryOf(body)),
      appPort: build.port,
      ...counters(slot, build),
    };
  } catch (e) {
    await pool.recycle(slot);
    throw e;
  }
}

const newLeaseId = () => createHash('sha1').update(`${Date.now()}:${Math.random()}`).digest('hex').slice(0, 10);

async function releaseLease(id: string): Promise<void> {
  const l = leases.get(id);
  if (!l) return;
  clearTimeout(l.timer);
  leases.delete(id);
  if (!l.build) {
    // A blank page has been driven somewhere arbitrary -- a file:// contact
    // sheet, a data: URI, an OffscreenCanvas full of somebody's frame. Sending
    // it back to about:blank is the whole reset; there is no game state to
    // lose, and keeping the browser is what makes the next image tool free.
    await l.slot.page?.goto('about:blank').catch(() => {});
  } else {
    // EVERY LEASED GAME PAGE IS THROWN AWAY, NOT POOLED.
    //
    // The first version of this pooled a leased page whose query carried
    // `?shoot=1`, on the theory that `shoot=1` means "capture" and capture
    // pages are safe to reuse. That is wrong, and `integration.mts` proved it
    // within an hour: it boots with `?shoot=1` and then drives fifteen minutes
    // of real gameplay -- combat, quests, camping, fishing -- stepping the sim
    // by hand. Two consecutive runs disagreed with each other (26 pass / 1 not
    // integrated, then 24 pass / 2 not integrated) because the second was
    // handed a world the first had already played.
    //
    // The discriminator is not the query, it is HOW THE PAGE WAS OBTAINED. A
    // tool that asked for frames (`/shots`) only ever posed shots, and its page
    // is reset and pooled. A tool that took a LEASE asked for the page itself,
    // which means it intends to do something the daemon cannot see or undo --
    // and `stop()` plus a zeroed clock puts none of it back.
    //
    // Closing the page keeps the browser, which is the expensive half: a boot
    // is 9.2 s and a chromium launch is a fraction of that.
    if (l.slot.page) { await l.slot.page.close().catch(() => {}); l.slot.page = null; }
    l.slot.key = '';
    l.slot.build = null;
  }
  if (pool.slots.includes(l.slot)) pool.release(l.slot);
}

/**
 * Once per build: does a reset really put the page back where a fresh boot
 * would?
 *
 * On a **`follow` shot**, because RESCUE §B1 says all 47 of them are
 * order-dependent — companions are still steering to wandering formation slots
 * when a shot settles, and formation state carries across shots. A warm daemon
 * is a machine for carrying that state across captures, and a *shared* daemon
 * carries it across agents, where it is invisible and unattributable. A
 * drifting reset is a lying reset.
 */
const driftChecked = new Set<string>();

/**
 * Run the drift check once per build, in the background, on the sweep lane.
 *
 * Automatic rather than opt-in because the failure it catches is silent: a
 * reset that leaves state behind produces frames that look right. Background
 * and sweep-laned because it costs three captures, and the agent whose request
 * triggered it must not pay for them.
 */
function scheduleDriftCheck(build: BuildId) {
  if (driftChecked.has(build)) return;
  driftChecked.add(build);
  resetDrift[shortBuild(build)] = 'checking';
  void sched.submit('sweep', 'daemon', 'drift', 0, () => checkResetDrift(build))
    .then((v) => {
      if (!v.startsWith('within')) console.log(`[daemon] reset drift on ${shortBuild(build)}: ${v}`);
    })
    .catch(() => { /* recorded in resetDrift */ });
}

async function checkResetDrift(build: BuildId, shot = 'party_walk'): Promise<string> {
  const shoot = async (cold: boolean) => {
    // Called from inside a worker, so these go straight to `routeShots` rather
    // than back through `sched.submit` -- re-queueing from a worker is how a
    // scheduler deadlocks against its own worker count.
    const out = await routeShots({
      shots: [shot], out: path.join(repoCacheDir(KEY), 'drift', cold ? 'cold' : 'warm'),
      build, cold, agent: 'daemon', lane: 'sweep',
    });
    return out.results[0]?.file;
  };
  try {
    const fresh = await shoot(true);
    // Dirty the page the way a real sequence would, then reset back to it.
    await routeShots({ shots: ['dun_keycatrich_hall'], out: path.join(repoCacheDir(KEY), 'drift', 'via'), build, agent: 'daemon', lane: 'sweep' });
    const after = await shoot(false);
    if (!fresh || !after) return 'not measured';
    const { decodePng, compare } = await import('./imgdiff.mts');
    const { readFile } = await import('node:fs/promises');
    const d = compare(decodePng(await readFile(path.join(ROOT, fresh))), decodePng(await readFile(path.join(ROOT, after))));
    // The threshold is measured, not chosen. Phase 0 diffed two *fresh serial
    // boots* on a quiet machine and got mean 1.493/255: TAA history, the
    // exposure integrator and the shader cache do not start from the same place
    // twice. "Byte-identical" is therefore not achievable and demanding it would
    // make this check cry wolf on every build until somebody muted it.
    const verdict = d.mean <= DRIFT_FLOOR
      ? `within the ${DRIFT_FLOOR}/255 boot-to-boot floor (mean ${d.mean.toFixed(3)}, max ${d.max})`
      : `mean ${d.mean.toFixed(3)}/255 max ${d.max} — RESET IS DRIFTING, above the ${DRIFT_FLOOR}/255 boot-to-boot floor`;
    resetDrift[shortBuild(build)] = verdict;
    return verdict;
  } catch (e) {
    const msg = `failed: ${e instanceof Error ? e.message : String(e)}`;
    resetDrift[shortBuild(build)] = msg;
    return msg;
  }
}

/**
 * `/health` must never touch a page.
 *
 * "Are you busy?" is exactly the question you ask when everything is slow, and
 * an answer that queues behind a 139-shot corpus is not an answer.
 */
function health(): HealthResponse {
  return {
    ok: true,
    protocol: PROTOCOL,
    repoKey: KEY,
    daemonPort: DAEMON_PORT,
    uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    persistentProfile: pool.persistentProfile,
    budget: BROWSER_BUDGET,
    workers: { busy: sched.busy, total: WORKERS },
    pool: { pages: pool.pages, contexts: pool.slots.length, budget: BROWSER_BUDGET },
    queue: LANES.map((lane) => ({
      lane,
      depth: sched.queues[lane].length,
      agents: sched.queues[lane].reduce<Record<string, number>>((a, j) => {
        a[j.agent] = (a[j.agent] ?? 0) + 1; return a;
      }, {}),
    })),
    builds: [...store.builds.values()].map((b) => ({
      build: shortBuild(b.id),
      dirty: isDirty(b.id),
      port: b.port,
      kind: b.kind,
      pages: pool.slots.filter((s) => s.build === b.id && s.page).length,
      idleSec: Math.round((Date.now() - b.lastUsed) / 1000),
    })),
    boots: pool.boots,
    reuses: pool.reuses,
    bootMs: pool.bootMs,
    idleSec: Math.round((Date.now() - lastUsed) / 1000),
    exclusive: sched.exclusive,
    resetDrift,
  };
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
      const lane = (body.lane === 'sweep' ? 'sweep' : 'fix') as Lane;
      const agent = typeof body.agent === 'string' ? body.agent : 'anon';
      const deadline = typeof body.deadlineMs === 'number' ? body.deadlineMs : 0;
      const queued = <T,>(kind: string, fn: () => Promise<T>) => sched.submit(lane, agent, kind, deadline, fn);
      try {
        if (url === '/health') return send(200, health());
        if (url === '/version') {
          return send(200, { protocol: PROTOCOL, repoKey: KEY, pid: process.pid, startedFrom: ROOT });
        }
        if (url === '/stop') { send(200, { ok: true }); setTimeout(stop, 50); return; }
        if (url === '/shots') {
          if (!isShotsRequest(body)) {
            return send(400, { error: '/shots needs { shots: string[], out: string }' });
          }
          {
            const out = await queued('shots', () => routeShots(body));
            scheduleDriftCheck(body.build ?? (DIRTY_PREFIX + ROOT));
            return send(200, out);
          }
        }
        if (url === '/eval') {
          if (!isEvalRequest(body)) return send(400, { error: '/eval needs { fn: string }' });
          return send(200, await queued('eval', () => routeEval(body)));
        }
        if (url === '/lease') return send(200, await queued('lease', () => routeLease(body as LeaseRequest)));
        if (url === '/release') {
          await releaseLease(String(body.id ?? ''));
          return send(200, { ok: true });
        }
        if (url === '/build') {
          // A served build WITHOUT a page: the port, and nothing else.
          //
          // `bootprof` times `goto` to `GAME.ready` over and over, `texbake`
          // records a canvas cache through a query the game only honours on a
          // fresh load, and `detcheck` compares a reused page against a fresh
          // one. All three need a URL and their own navigation; none of them
          // wants the daemon to have booted the page first, because the boot
          // IS the measurement. They pair this with a blank lease, so they
          // still hold exactly one slot against the budget.
          const id = typeof body.build === 'string' ? body.build : (DIRTY_PREFIX + ROOT);
          const b = await store.acquire(id, body.prod === true);
          lastUsed = Date.now();
          return send(200, { port: b.port, build: shortBuild(b.id), dirty: isDirty(b.id), kind: b.kind });
        }
        if (url === '/release-build') {
          store.release(String(body.build ?? ''));
          return send(200, { ok: true });
        }
        if (url === '/exclusive') {
          await sched.takeExclusive(agent, Number(body.pid) || 0);
          await pool.closeAll();
          return send(200, { ok: true, holder: agent });
        }
        if (url === '/exclusive-release') { sched.releaseExclusive(); return send(200, { ok: true }); }
        if (url === '/drift') {
          const build = typeof body.build === 'string' ? body.build : resolveBuild('HEAD');
          return send(200, { verdict: await checkResetDrift(build) });
        }
        return send(404, { error: `no route ${url}` });
      } catch (e) {
        const busy = e as { busy?: true, detail?: Record<string, unknown> };
        if (busy.busy) {
          // Exit 4 on the client, not 1: a saturated machine and a broken build
          // must not look the same to an agent reading an exit code.
          return send(429, { error: (e as Error).message, hint: 'retry, raise --deadline, or use --lane sweep', ...busy.detail });
        }
        return send(500, { error: e instanceof Error ? e.stack ?? e.message : String(e) });
      }
    });
  });
  srv.listen(DAEMON_PORT, '127.0.0.1');
  srv.on('error', (e) => { console.error('[daemon]', e.message); process.exit(1); });

  const reg: Registry = {
    port: DAEMON_PORT, pid: process.pid, key: KEY, protocol: PROTOCOL,
    started: new Date().toISOString(), startedFrom: ROOT,
  };
  writeRegistry(reg);
  console.log(`[daemon] ${keyHash(KEY)} listening on ${DAEMON_PORT}, budget ${BROWSER_BUDGET}, protocol ${PROTOCOL}`);

  const stop = async () => {
    clearRegistry(KEY);
    await pool.closeAll();
    store.closeAll();
    srv.close();
    process.exit(0);
  };
  setInterval(() => {
    sched.reapExclusive();
    reapLeases();
    store.reapIdle();
    const idle = Date.now() - lastUsed;
    if (idle > DAEMON_IDLE_MS) { console.log('[daemon] idle, exiting'); void stop(); }
    else if (idle > BROWSER_IDLE_MS && pool.slots.length && pool.idle) {
      console.log('[daemon] idle, closing browsers');
      void pool.closeAll();
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
