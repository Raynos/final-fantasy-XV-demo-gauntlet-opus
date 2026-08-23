#!/usr/bin/env node
/**
 * What does concurrency actually cost on THIS machine, for THIS game?
 *
 *   node src/tools/bench.mts                 # small: W in {1,2,4}, 3 shots each, ~2 min
 *   node src/tools/bench.mts --full          # W in {1,2,3,4,6,8}, the real sweep
 *   node src/tools/bench.mts --workers 1,4   # a specific sweep
 *   node src/tools/bench.mts --park          # Q2 only: what a resident page costs
 *   node src/tools/bench.mts --reset         # Q3 only: soft reset vs reload
 *   node src/tools/bench.mts --tree          # Q4 only: what a sha tree costs
 *
 * WHY THIS EXISTS. `project/archive/RESCUE-2026-08-21.md` says "cap concurrency
 * at ~4"; `../game-scaffold` ships `WORKERS_PER_LANE = 4` measured on a 12-core
 * box running a 2D toy. Neither number was measured here, and this machine is 18
 * cores / 128 GB / **one** Metal GPU behind ~110 shader compiles. Shipping
 * either as a default would repeat the exact mistake the harness plan is about,
 * so every default in `daemon.mts` has to trace to a row this prints.
 *
 * WHAT IT SEPARATES. A client's wall time is three things and only one of them
 * is the browser:
 *
 *   render   the page's own applyShot -> settle -> screenshot, measured in-page
 *   boot     chromium launch + module transform + world build + shader compiles
 *   spawn    node startup and process teardown, paid once per client
 *
 * A wave that looks "slow because rendering is slow" is usually boot, and a
 * fan-out of small requests can be dominated by node startup. Guessing picks
 * the wrong fix.
 *
 * A LOCK, BECAUSE A NUMBER MEASURED ON A BUSY BOX IS NOT A NUMBER. Scaffold's
 * `bench_test.sh` learned this the expensive way: a previous run survived its
 * supervisor and ran concurrently with a new one, both arms fighting for the
 * same cores, and every row was garbage and looked fine. This takes an
 * `O_EXCL` lock validated by pid liveness, and refuses outright when other
 * chromiums are already up.
 *
 * PER-PID CPU, NOT A LIVE-SUM DELTA. Browsers come and go mid-wave, so
 * `(end - start)` over the live process set goes negative. The sampler keeps
 * the last CPU time it saw for every pid and sums those, which is exact for any
 * process it saw at least twice and never negative.
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, openSync, closeSync, writeSync, readFileSync, rmSync, existsSync, statSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launchPersistent } from './chromium.mts';
import { decodePng, compare } from './imgdiff.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VITE = path.join(ROOT, 'node_modules/.bin/vite');
const LOCK = path.join(ROOT, 'tmp', '.bench.lock');
const OUT = path.join(ROOT, 'tmp', 'bench');

const sleep = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });

const portOpen = (p: number) => new Promise<boolean>((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 800);
});

// ------------------------------------------------------------------ the lock

/** True if a process with this pid is alive and ours to reason about. */
function alive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/**
 * Take the bench lock, or explain who has it.
 *
 * `O_EXCL` rather than "does the file exist": two benches started in the same
 * second is exactly the race that produced the interleaved rows.
 */
function takeLock(): () => void {
  mkdirSync(path.dirname(LOCK), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(LOCK, 'wx');
      writeSync(fd, String(process.pid));
      closeSync(fd);
      return () => { try { rmSync(LOCK); } catch { /* already gone */ } };
    } catch {
      const held = Number(readFileSync(LOCK, 'utf8').trim());
      if (held && alive(held)) {
        throw new Error(`another bench is running (pid ${held}). Its numbers and yours would both be garbage.`);
      }
      // The holder is dead: a supervisor was killed mid-run. Reap and retry once.
      console.log(`[bench] reaping a stale lock from dead pid ${held}`);
      try { rmSync(LOCK); } catch { /* raced */ }
    }
  }
  throw new Error('could not take the bench lock');
}

/**
 * Every *harness* chromium on the box, by pid.
 *
 * Matched on `ms-playwright`, not on "Chrome": the human's own desktop Chrome
 * and its crashpad handler are always running on this machine and have nothing
 * to do with the GPU contention being measured. A quiet check that fires on the
 * browser you are reading this in is a quiet check that gets `--force`d every
 * time, which is the same as not having one.
 */
const HARNESS_CHROMIUM = /ms-playwright|Chromium\.app|Chrome for Testing/;

function chromiumPids(): number[] {
  try {
    const out = execFileSync('pgrep', ['-f', 'ms-playwright'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.trim().split('\n').filter(Boolean).map(Number);
  } catch { return []; }
}

/**
 * Refuse to measure a busy machine.
 *
 * Not advisory. The whole point of this file is to replace guesses with
 * numbers, and a number taken while three agents capture is a guess with a
 * decimal point on it.
 */
function assertQuiet(force: boolean) {
  const chromiums = chromiumPids().length;
  const load = os.loadavg()[0];
  const busy = chromiums > 0 || load > os.cpus().length * 0.4;
  if (!busy) return;
  const why = `${chromiums} chromium process(es) already running, 1-min load ${load.toFixed(1)} on ${os.cpus().length} cores`;
  if (force) { console.log(`[bench] WARNING: ${why} — --force given, numbers are advisory only`); return; }
  throw new Error(`the machine is not quiet: ${why}\n`
    + '  node src/tools/cleanup.mts --kill   # then retry\n'
    + '  --force                             # measure anyway, and say so in the report');
}

// --------------------------------------------------------------- the sampler

interface Sample { cpuSec: Map<number, number>; rssTotal: number; at: number }

/** `ps` CPU time, `MM:SS.ss` or `HH:MM:SS`, to seconds. */
function cpuSeconds(t: string): number {
  const parts = t.split(/[:]/).map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return Number(t) || 0;
}

function psSnapshot(match: RegExp): Sample {
  const cpuSec = new Map<number, number>();
  let rssTotal = 0;
  try {
    const out = execFileSync('ps', ['-Ao', 'pid=,rss=,time=,command='],
      { encoding: 'utf8', maxBuffer: 8 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
    for (const line of out.split('\n')) {
      const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line);
      if (!m || !match.test(m[4])) continue;
      cpuSec.set(Number(m[1]), cpuSeconds(m[3]));
      rssTotal += Number(m[2]) * 1024;
    }
  } catch { /* ps unavailable: the sampler degrades to no numbers, not to wrong ones */ }
  return { cpuSec, rssTotal, at: Date.now() };
}

/**
 * Integrate CPU and RSS over a wave.
 *
 * Returns core-seconds actually burned by matching processes and the peak
 * simultaneous RSS. A pid seen only once contributes its whole CPU time, which
 * over-counts a browser that was already warm; the sweep launches every browser
 * inside the window, so in practice the first sample is near zero.
 */
function startSampler(match: RegExp, periodMs = 400) {
  const first = new Map<number, number>();
  const last = new Map<number, number>();
  let rssPeak = 0;
  const tick = () => {
    const s = psSnapshot(match);
    for (const [pid, cpu] of s.cpuSec) {
      if (!first.has(pid)) first.set(pid, cpu);
      last.set(pid, cpu);
    }
    rssPeak = Math.max(rssPeak, s.rssTotal);
  };
  tick();
  const timer = setInterval(tick, periodMs);
  return {
    stop() {
      tick();
      clearInterval(timer);
      let coreSec = 0;
      for (const [pid, cpu] of last) coreSec += cpu - (first.get(pid) ?? 0);
      return { coreSec, rssPeak };
    },
  };
}

// ------------------------------------------------------------------- the app

let ownServer: ReturnType<typeof spawn> | null = null;

async function ensureServer(port: number): Promise<void> {
  if (await portOpen(port)) return;
  ownServer = spawn(VITE, ['--port', String(port), '--strictPort'],
    { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    await sleep(250);
    if (await portOpen(port)) return;
  }
  throw new Error('vite failed to start');
}

function stopServer() { if (ownServer) { ownServer.kill(); ownServer = null; } }

// ---------------------------------------------------------------- the worker

/** One line of a worker's report, as JSON on stdout. */
interface WorkerEvent {
  t: 'boot' | 'job' | 'done' | 'error';
  ms?: number;
  shot?: string;
  file?: string;
  msg?: string;
  nodeCpuMs?: number;
}

const emit = (e: WorkerEvent) => { process.stdout.write(`${JSON.stringify(e)}\n`); };

/**
 * One "agent": its own chromium, its own page, its own share of the wave.
 *
 * Deliberately a separate process. Threads in one node would share a GPU
 * command queue in a way real agents do not, and the thing being measured is
 * what N independent tools do to one machine.
 */
async function runWorker(argv: string[]) {
  const arg = (k: string, d = '') => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 ? argv[i + 1] : d;
  };
  const port = Number(arg('port', '5173'));
  const shots = arg('shots').split(',').filter(Boolean);
  const outDir = arg('out', path.join(OUT, 'w'));
  const w = Number(arg('w', '1600')), h = Number(arg('h', '900'));
  mkdirSync(outDir, { recursive: true });
  const { ctx } = await launchPersistent({ width: w, height: h });
  try {
    const page = ctx.pages()[0]?.url() === 'about:blank' ? ctx.pages()[0] : await ctx.newPage();
    await page.setViewportSize({ width: w, height: h });
    const t0 = Date.now();
    await page.goto(`http://127.0.0.1:${port}/?q=ultra&shoot=1`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
    await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 300_000 });
    await page.evaluate(() => { document.getElementById('boot')?.remove(); });
    emit({ t: 'boot', ms: Date.now() - t0 });
    for (const shot of shots) {
      const t1 = Date.now();
      await page.evaluate((n: string) => {
        const g = window.GAME;
        g.applyShot(n);
        g.settle(60);
        g.applyShot(n);
        g.settle(8);
      }, shot);
      const file = path.join(outDir, `${shot}.png`);
      const { writeFile } = await import('node:fs/promises');
      await writeFile(file, await page.screenshot({ type: 'png' }));
      emit({ t: 'job', shot, ms: Date.now() - t1, file });
    }
    const cpu = process.cpuUsage();
    emit({ t: 'done', nodeCpuMs: Math.round((cpu.user + cpu.system) / 1000) });
  } catch (e) {
    emit({ t: 'error', msg: e instanceof Error ? e.message : String(e) });
    process.exitCode = 1;
  } finally {
    await ctx.close().catch(() => {});
  }
}

// ----------------------------------------------------------------- the sweep

interface WaveRow {
  workers: number;
  wallMs: number;
  jobs: number;
  reqPerSec: number;
  meanRenderMs: number;
  meanBootMs: number;
  meanSpawnMs: number;
  coreSec: number;
  rssPeakMB: number;
  errors: string[];
}

const SHOT = 'hero_full';

function spawnWorker(i: number, port: number, shots: string[], outDir: string) {
  const started = Date.now();
  const child = spawn(process.execPath, [
    path.join(ROOT, 'src/tools/bench.mts'), '--worker',
    '--port', String(port), '--shots', shots.join(','), '--out', outDir,
  ], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  const events: WorkerEvent[] = [];
  let buf = '';
  let firstEventAt = 0;
  child.stdout.on('data', (d: Buffer) => {
    buf += d.toString();
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const l of lines) {
      if (!l.trim()) continue;
      try {
        events.push(JSON.parse(l) as WorkerEvent);
        if (!firstEventAt) firstEventAt = Date.now();
      } catch { /* stray output */ }
    }
  });
  let stderr = '';
  child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
  const done = new Promise<{ events: WorkerEvent[], spawnMs: number, stderr: string, code: number }>((res) => {
    child.on('exit', (code) => res({
      events,
      // Everything before the worker's first report: node startup, playwright
      // import and chromium launch handshake. Paid once per client, and the
      // reason a fan-out of tiny requests can be dominated by nothing at all.
      spawnMs: firstEventAt ? firstEventAt - started - (events.find((e) => e.t === 'boot')?.ms ?? 0) : 0,
      stderr,
      code: code ?? 0,
    }));
  });
  return { done, child, label: `w${i}` };
}

async function wave(workers: number, perWorker: number, port: number, dirName?: string): Promise<WaveRow> {
  const outDir = path.join(OUT, dirName ?? `w${workers}`);
  rmSync(outDir, { recursive: true, force: true });
  const shots = Array.from({ length: perWorker }, () => SHOT);
  const sampler = startSampler(new RegExp(`${HARNESS_CHROMIUM.source}|node .*bench\\.mts`));
  const t0 = Date.now();
  const running = Array.from({ length: workers }, (_, i) =>
    spawnWorker(i, port, shots, path.join(outDir, String(i))));
  const results = await Promise.all(running.map((r) => r.done));
  const wallMs = Date.now() - t0;
  const { coreSec, rssPeak } = sampler.stop();

  const jobEvents = results.flatMap((r) => r.events.filter((e) => e.t === 'job'));
  const bootEvents = results.flatMap((r) => r.events.filter((e) => e.t === 'boot'));
  const errors = results.flatMap((r, i) => [
    ...r.events.filter((e) => e.t === 'error').map((e) => `w${i}: ${e.msg}`),
    ...(r.code !== 0 && !r.events.some((e) => e.t === 'error') ? [`w${i}: exit ${r.code} ${r.stderr.slice(0, 200)}`] : []),
  ]);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  return {
    workers,
    wallMs,
    jobs: jobEvents.length,
    reqPerSec: jobEvents.length / (wallMs / 1000),
    meanRenderMs: Math.round(mean(jobEvents.map((e) => e.ms ?? 0))),
    meanBootMs: Math.round(mean(bootEvents.map((e) => e.ms ?? 0))),
    meanSpawnMs: Math.round(mean(results.map((r) => r.spawnMs))),
    coreSec: Math.round(coreSec * 10) / 10,
    rssPeakMB: Math.round(rssPeak / 1024 / 1024),
    errors,
  };
}

// ------------------------------------------------- Q5: is a wave frame-stable

/**
 * Q5 IS A GATE, AND IT NEEDS A CONTROL.
 *
 * Parallelism that quietly changes pixels is worse than the serial queue it
 * replaces: every later diff in this repo would then be measuring the harness
 * rather than the game. But two frames from two different *boots* already
 * differ a little — TAA history, the exposure integrator and the shader cache
 * all start from wherever the boot left them. Diffing W=1 against W=knee and
 * blaming the difference on concurrency confounds the two.
 *
 * So the sweep runs W=1 twice and this reports both numbers. Only the amount by
 * which concurrency exceeds the boot-to-boot control is attributable to
 * concurrency at all.
 */
async function stability(rows: WaveRow[]): Promise<string[]> {
  const frame = (dir: string) => path.join(OUT, dir, '0', `${SHOT}.png`);
  const diff = async (a: string, b: string) => {
    if (!existsSync(a) || !existsSync(b)) return null;
    return compare(decodePng(await readFile(a)), decodePng(await readFile(b)));
  };
  const fmt = (d: { mean: number, max: number, over: number }) =>
    `mean ${d.mean.toFixed(3)}/255, max ${d.max}, ${(d.over * 100).toFixed(3)}% of pixels over threshold`;

  const out: string[] = [];
  const control = await diff(frame('w1'), frame('w1-control'));
  if (!control) return ['not measured (the W=1 control wave produced no frame)'];
  out.push(`- CONTROL, two serial boots: ${fmt(control)}`);

  const busiest = rows.reduce((a, b) => (b.workers > a.workers ? b : a));
  if (busiest.workers === 1) { out.push('- no concurrent wave to compare against'); return out; }
  const conc = await diff(frame('w1'), frame(`w${busiest.workers}`));
  if (!conc) return [...out, '- not measured (the concurrent wave produced no frame)'];
  out.push(`- W=1 vs W=${busiest.workers}: ${fmt(conc)}`);
  const excess = conc.mean - control.mean;
  out.push(excess <= 0.2
    ? `- VERDICT: concurrency adds ${excess.toFixed(3)}/255 over the control — indistinguishable from boot-to-boot noise. Concurrent rendering is frame-safe.`
    : `- VERDICT: concurrency adds ${excess.toFixed(3)}/255 OVER the control. Concurrent renders are NOT frame-safe: parallelise boot and settle, serialise the screenshot.`);
  return out;
}

// ------------------------------------------------- Q2: what does a park cost?

/**
 * Two resident-page questions with two different answers, which is why this
 * measures both rather than quoting scaffold's.
 *
 * Scaffold parks because a posed page burns 0.6-1.8 cores of rAF. Ours does not
 * — `main.ts` never calls `game.start()` under `?shoot=1` — so for capture pages
 * the only cost is RSS and a GPU context. A *play* page (no `?shoot=1`) does run
 * the loop, and that is a different number entirely.
 */
async function parkCost(port: number): Promise<string[]> {
  const lines: string[] = [];
  for (const [label, query] of [['capture (?shoot=1, rAF stopped)', '?q=ultra&shoot=1'], ['play (rAF running)', '?q=ultra']] as const) {
    const { ctx } = await launchPersistent({ width: 1600, height: 900 });
    try {
      const page = ctx.pages()[0]?.url() === 'about:blank' ? ctx.pages()[0] : await ctx.newPage();
      await page.setViewportSize({ width: 1600, height: 900 });
      await page.goto(`http://127.0.0.1:${port}/${query}`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
      await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 300_000 });
      await page.evaluate(() => { document.getElementById('boot')?.remove(); });
      // Let it reach steady state before asking what steady state costs.
      await sleep(3000);
      const s = startSampler(HARNESS_CHROMIUM);
      await sleep(8000);
      const { coreSec, rssPeak } = s.stop();
      lines.push(`resident ${label}: ${(coreSec / 8).toFixed(2)} cores idle, ${Math.round(rssPeak / 1024 / 1024)} MB RSS`);
      // The round trip a park costs: park to about:blank, then come back.
      const t0 = Date.now();
      await page.goto('about:blank', { waitUntil: 'domcontentloaded' });
      const parkMs = Date.now() - t0;
      const sp = startSampler(HARNESS_CHROMIUM);
      await sleep(4000);
      const parked = sp.stop();
      const t1 = Date.now();
      await page.goto(`http://127.0.0.1:${port}/${query}`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
      await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 300_000 });
      lines.push(`  park ${parkMs} ms, parked costs ${(parked.coreSec / 4).toFixed(2)} cores / `
        + `${Math.round(parked.rssPeak / 1024 / 1024)} MB, unpark ${Date.now() - t1} ms`);
    } finally {
      await ctx.close().catch(() => {});
    }
  }
  return lines;
}

// ------------------------------------------ Q3: soft reset against a reload

/**
 * Measured on a **lighting-changing** shot, not `hero_full`.
 *
 * RESCUE recorded 43 shader programs recompiled and a 9.5 s freeze from
 * toggling one light's `visible`. A soft reset that provokes those compiles is
 * slower than the reload it is supposed to replace, and `hero_full` would never
 * show it.
 */
async function resetCost(port: number): Promise<string[]> {
  const lines: string[] = [];
  const { ctx } = await launchPersistent({ width: 1600, height: 900 });
  try {
    const page = ctx.pages()[0]?.url() === 'about:blank' ? ctx.pages()[0] : await ctx.newPage();
    await page.setViewportSize({ width: 1600, height: 900 });
    const url = `http://127.0.0.1:${port}/?q=ultra&shoot=1`;
    const boot = async () => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 300_000 });
      await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 300_000 });
      await page.evaluate(() => { document.getElementById('boot')?.remove(); });
    };
    await boot();
    for (const shot of ['hero_full', 'dun_keycatrich_hall']) {
      // Get into the state a reset has to get out of.
      await page.evaluate((n: string) => { window.GAME.applyShot(n); window.GAME.settle(60); }, shot);
      const before = await page.evaluate(() => window.GAME.renderer.info.programs?.length ?? 0);
      const t0 = Date.now();
      await page.evaluate(() => {
        const g = window.GAME as unknown as { reset?: () => void, stop: () => void, resetClock: () => void };
        if (typeof g.reset === 'function') g.reset();
        else { g.stop(); g.resetClock(); }
      });
      await page.evaluate(() => { window.GAME.applyShot('hero_full'); window.GAME.settle(60); });
      const softMs = Date.now() - t0;
      const after = await page.evaluate(() => window.GAME.renderer.info.programs?.length ?? 0);
      const t1 = Date.now();
      await boot();
      await page.evaluate(() => { window.GAME.applyShot('hero_full'); window.GAME.settle(60); });
      lines.push(`from ${shot}: soft reset + repose ${softMs} ms (programs ${before} -> ${after}), reload + repose ${Date.now() - t1} ms`);
    }
  } finally {
    await ctx.close().catch(() => {});
  }
  return lines;
}

// -------------------------------------- Q4: what does materialising a sha cost

function dirBytes(dir: string): number {
  let total = 0;
  const walk = (d: string) => {
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const f = path.join(d, e.name);
      if (e.isDirectory()) walk(f);
      else { try { total += statSync(f).size; } catch { /* raced */ } }
    }
  };
  walk(dir);
  return total;
}

/**
 * `git archive` + `vite build` for one sha, and what it leaves on disk.
 *
 * This is the number that decides whether `--build HEAD` can be the default:
 * if materialising a tree costs a minute, agents will pass `--dirty` to avoid
 * it and Decision 2 buys nothing.
 */
async function treeCost(): Promise<string[]> {
  const lines: string[] = [];
  const sha = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const dest = path.join(OUT, 'tree', sha.slice(0, 12));
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  const t0 = Date.now();
  execFileSync('bash', ['-c', `git archive ${sha} | tar -x -C ${JSON.stringify(dest)}`], { cwd: ROOT });
  const archiveMs = Date.now() - t0;
  const srcBytes = dirBytes(dest);
  // The build needs node_modules; a symlink is what the real BuildStore will do
  // rather than copying 400 MB per sha. The bake cache is symlinked for the
  // same reason it must be shared in production: re-baking terrain per sha is
  // the one cost that would make sha builds unaffordable.
  execFileSync('ln', ['-s', path.join(ROOT, 'node_modules'), path.join(dest, 'node_modules')]);
  const bakeSrc = path.join(ROOT, 'src/public/baked');
  if (existsSync(bakeSrc)) {
    mkdirSync(path.join(dest, 'src/public'), { recursive: true });
    rmSync(path.join(dest, 'src/public/baked'), { recursive: true, force: true });
    execFileSync('ln', ['-s', bakeSrc, path.join(dest, 'src/public/baked')]);
  }
  lines.push(`git archive ${archiveMs} ms, ${(srcBytes / 1e6).toFixed(1)} MB of source`);

  // The two ways a materialised tree can be served, measured against each
  // other, because the plan assumed `vite build` + `preview` is now the right
  // default and that is exactly the kind of assumption this file exists to
  // check. `vite build` is paid ONCE per sha and shared by every agent; a dev
  // server is free to start and pays module transform on every boot instead.
  const devPort = 5190;
  const t2 = Date.now();
  const dev = spawn(VITE, ['--port', String(devPort), '--strictPort'], { cwd: dest, stdio: ['ignore', 'ignore', 'ignore'] });
  try {
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline && !(await portOpen(devPort))) await sleep(200);
    const serveMs = Date.now() - t2;
    const bootMs = await bootOnce(devPort);
    lines.push(`served DEV from the tree: server up in ${serveMs} ms, first boot ${bootMs} ms`);
  } finally { dev.kill(); }

  const t1 = Date.now();
  let buildMs = -1;
  try {
    execFileSync(VITE, ['build'], { cwd: dest, stdio: ['ignore', 'ignore', 'pipe'], timeout: 600_000 });
    buildMs = Date.now() - t1;
  } catch (e) {
    lines.push(`vite build in the materialised tree FAILED: ${e instanceof Error ? e.message.slice(0, 300) : String(e)}`);
  }
  if (buildMs > 0) {
    const prev = spawn(VITE, ['preview', '--port', String(devPort), '--strictPort'], { cwd: dest, stdio: ['ignore', 'ignore', 'ignore'] });
    try {
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline && !(await portOpen(devPort))) await sleep(200);
      lines.push(`served PROD from the tree: vite build ${buildMs} ms once, first boot ${await bootOnce(devPort)} ms`);
    } finally { prev.kill(); }
  }
  const totalBytes = dirBytes(dest);
  lines.push(`tree totals ${(totalBytes / 1e6).toFixed(1)} MB on disk; 10 cached shas = ${(totalBytes * 10 / 1e9).toFixed(1)} GB`);
  rmSync(dest, { recursive: true, force: true });
  return lines;
}

/** Boot the game once against a port and report what it cost. */
async function bootOnce(port: number): Promise<number> {
  const { ctx } = await launchPersistent({ width: 1600, height: 900 });
  try {
    const page = ctx.pages()[0]?.url() === 'about:blank' ? ctx.pages()[0] : await ctx.newPage();
    await page.setViewportSize({ width: 1600, height: 900 });
    const t0 = Date.now();
    await page.goto(`http://127.0.0.1:${port}/?q=ultra&shoot=1`, { waitUntil: 'domcontentloaded', timeout: 300_000 });
    await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 300_000 });
    return Date.now() - t0;
  } catch { return -1; } finally { await ctx.close().catch(() => {}); }
}

// -------------------------------------------------------------------- report

function table(rows: WaveRow[]): string {
  const head = ['W', 'wall s', 'jobs', 'req/s', 'render ms', 'boot ms', 'spawn ms', 'core-s', 'peak RSS MB'];
  const body = rows.map((r) => [
    String(r.workers), (r.wallMs / 1000).toFixed(1), String(r.jobs), r.reqPerSec.toFixed(2),
    String(r.meanRenderMs), String(r.meanBootMs), String(r.meanSpawnMs),
    String(r.coreSec), String(r.rssPeakMB),
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)));
  const line = (cells: string[]) => `| ${cells.map((c, i) => c.padStart(widths[i])).join(' | ')} |`;
  return [line(head), `|${widths.map((w) => '-'.repeat(w + 2)).join('|')}|`, ...body.map(line)].join('\n');
}

/**
 * Name the knee and say what it is made of.
 *
 * The plan's question 1, in one function. Throughput plateauing while cores
 * idle and RSS stays trivial against 128 GB means the single Metal GPU binds,
 * and the cap belongs on concurrently *rendering* pages. Cores or RSS binding
 * first means it belongs there instead.
 *
 * THROUGHPUT ALONE CANNOT PICK THE NUMBER HERE, and pretending it can is how
 * you ship noise as a default. Measured three times, W=4 came back at 0.29,
 * 0.31 and 0.31 req/s while W=6 came back at 0.37 — a 20% spread on a curve
 * whose whole plateau is 20% wide. So the recommendation is taken from
 * **latency**, which is not noisy at all: mean boot goes 9.2 s at W=1 to 14.8 s
 * at W=4 to 32.3 s at W=6. The budget is the largest W that still boots within
 * 2x of serial, and the plateau check only confirms nothing is being left on
 * the table by stopping there.
 */
function knee(rows: WaveRow[]): string[] {
  const cores = os.cpus().length;
  const totalGB = os.totalmem() / 1e9;
  const sorted = [...rows].sort((a, b) => a.workers - b.workers);
  const base = sorted[0];
  const peak = sorted.reduce((a, b) => (b.reqPerSec > a.reqPerSec ? b : a));
  const plateau = sorted.find((r) => r.reqPerSec >= peak.reqPerSec * 0.85) ?? peak;
  // The latency cliff: past here a client waits multiples of what it waited
  // alone, which is what "the machine stalled my agent" actually looks like.
  const inCliff = sorted.filter((r) => r.meanBootMs <= base.meanBootMs * 2);
  const budget = inCliff.length ? inCliff[inCliff.length - 1] : base;
  const at = budget;
  const cpuBusy = at.coreSec / (at.wallMs / 1000);

  const out = [
    `peak throughput ${peak.reqPerSec.toFixed(2)} req/s at W=${peak.workers}; `
      + `the plateau (within 15% of peak) starts at W=${plateau.workers}`,
    `marginal gain per worker: ${sorted.slice(1).map((r, i) => `${sorted[i].workers}->${r.workers} ${(((r.reqPerSec / sorted[i].workers ? 0 : 0) || (r.reqPerSec - sorted[i].reqPerSec) / sorted[i].reqPerSec) * 100).toFixed(0)}%`).join(', ')}`,
    `latency cliff: mean boot ${sorted.map((r) => `W=${r.workers} ${(r.meanBootMs / 1000).toFixed(1)}s`).join(', ')}`,
    `RECOMMENDED BROWSER_BUDGET = ${budget.workers} — the largest W still booting within 2x of serial`,
    `at W=${at.workers}: ${cpuBusy.toFixed(1)} of ${cores} cores busy, ${(at.rssPeakMB / 1024).toFixed(1)} GB of ${totalGB.toFixed(0)} GB peak RSS`,
  ];
  if (cpuBusy < cores * 0.6 && at.rssPeakMB / 1024 < totalGB * 0.25) {
    out.push('CPU and RAM are both idle at the budget, so the single Metal GPU binds: '
      + 'the cap belongs on concurrently RENDERING pages, and parked-but-resident browsers are nearly free.');
  } else if (cpuBusy >= cores * 0.6) {
    out.push('CPU saturates first: BROWSER_BUDGET and WORKERS are the same number, and it is a core count.');
  } else {
    out.push('RSS binds first: the cap belongs on resident browsers, and parking is worth its complexity.');
  }
  return out;
}

// ---------------------------------------------------------------------- main

async function main(argv: string[]) {
  const has = (k: string) => argv.includes(`--${k}`);
  const arg = (k: string, d: string) => {
    const i = argv.indexOf(`--${k}`);
    return i >= 0 ? argv[i + 1] : d;
  };
  const port = Number(process.env.PORT || 5173);
  const full = has('full');
  const only = has('park') || has('reset') || has('tree') || has('sweep');
  const workers = arg('workers', full ? '1,2,3,4,6,8' : '1,2,4').split(',').map(Number).filter(Boolean);
  const perWorker = Number(arg('per-worker', full ? '4' : '3'));

  assertQuiet(has('force'));
  const release = takeLock();
  const started = Date.now();
  const report: string[] = [];
  try {
    mkdirSync(OUT, { recursive: true });
    await ensureServer(port);
    report.push(`machine: ${os.cpus().length} cores, ${(os.totalmem() / 1e9).toFixed(0)} GB, ${os.cpus()[0]?.model ?? '?'}`);
    report.push(`load at start: ${os.loadavg().map((l) => l.toFixed(2)).join(' ')}`);
    report.push(`git: ${execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()}`);

    if (!only || has('sweep')) {
      const rows: WaveRow[] = [];
      // W=1 runs twice: the second is the control for Q5, not a data point.
      const plan = workers.includes(1) ? [1, ...workers] : workers;
      for (const [n, w] of plan.entries()) {
        const control = w === 1 && n > 0 && plan[0] === 1;
        process.stdout.write(`[bench] W=${w}${control ? ' (control)' : ''} x ${perWorker} shots ... `);
        const row = await wave(w, perWorker, port, control ? 'w1-control' : undefined);
        if (control) { await sleep(3000); continue; }
        rows.push(row);
        process.stdout.write(`${(row.wallMs / 1000).toFixed(1)} s, ${row.reqPerSec.toFixed(2)} req/s`
          + `${row.errors.length ? `, ${row.errors.length} errors` : ''}\n`);
        // Let the GPU and the page cache settle between waves, or wave N+1
        // inherits wave N's thermals and its teardown.
        await sleep(3000);
      }
      report.push('', '## Q1 — the concurrency sweep', '', table(rows), '', ...knee(rows).map((l) => `- ${l}`));
      const errs = rows.flatMap((r) => r.errors);
      if (errs.length) report.push('', '### errors', ...errs.map((e) => `- ${e}`));
      report.push('', '## Q5 — is a concurrent wave frame-stable? (GATE)', '', ...(await stability(rows)));
    }
    if (!only || has('park')) {
      process.stdout.write('[bench] park cost ... \n');
      report.push('', '## Q2 — what a resident page costs', '', ...(await parkCost(port)).map((l) => `- ${l}`));
    }
    if (!only || has('reset')) {
      process.stdout.write('[bench] reset cost ... \n');
      report.push('', '## Q3 — soft reset against a reload', '', ...(await resetCost(port)).map((l) => `- ${l}`));
    }
    if (!only || has('tree')) {
      process.stdout.write('[bench] sha tree cost ... \n');
      report.push('', '## Q4 — what materialising a sha tree costs', '', ...(await treeCost()).map((l) => `- ${l}`));
    }
  } finally {
    stopServer();
    release();
  }
  report.push('', `total ${(Date.now() - started) / 1000 | 0} s`);
  console.log(`\n${report.join('\n')}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const argv = process.argv.slice(2);
  if (argv.includes('--worker')) await runWorker(argv);
  else {
    await main(argv).catch((e: unknown) => {
      console.error(`[bench] ${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    });
  }
}
