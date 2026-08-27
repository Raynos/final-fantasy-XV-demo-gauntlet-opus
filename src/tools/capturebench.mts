#!/usr/bin/env node
/**
 * What does the harness cost, end to end, for the things agents actually do?
 *
 *   node src/tools/capturebench.mts                 # the default sweep, ~2 min
 *   node src/tools/capturebench.mts --shots 100     # 100 shots across N agents
 *   node src/tools/capturebench.mts --agents 4
 *   node src/tools/capturebench.mts --cold          # stop the daemon first: boot is measured
 *   node src/tools/capturebench.mts --json out.json
 *
 * `bench.mts` answers "what is the right BROWSER_BUDGET on this machine" by
 * sweeping worker counts. This answers a different question, the one a human
 * asks: **how long do I wait?** It walks the path an agent walks — node starts,
 * a tool resolves a build, the daemon materialises and serves it, a page boots,
 * a shot poses, a frame comes back — and prices each segment separately, because
 * a wait that is 90% node startup and a wait that is 90% shader compilation look
 * identical from outside and have nothing in common.
 *
 * ## What it separates, and why each one is its own row
 *
 *   spawn     `node src/tools/shoot.mts` to its first line of work: process
 *             start plus type-stripping the import graph. Paid PER INVOCATION,
 *             so a fan-out of small calls can be nothing else.
 *   resolve   `git rev-parse` + `git status` in `identity.mts`, per tool run.
 *   daemon    the HTTP round trip and the scheduler, with no browser in it.
 *   serve     `materialise()` — `git archive` plus a `vite build` — paid once
 *             per tree sha and then never again.
 *   boot      chromium to `window.GAME.ready`: module transform, world build,
 *             ~110 shader compiles. The dominant cost of anything uncached.
 *   pose      applyShot + settle, which is 68 stepped frames at ~11.7 ms.
 *   encode    `page.screenshot` and its base64 CDP hop.
 *   cache     what a HIT costs: a sha1, two `existsSync` and a `copyFileSync`.
 *
 * ## The traps, all of them learned expensively
 *
 * **A number measured on a busy box is not a number.** `../game-scaffold`'s
 * `bench_test.sh` once had a previous run survive its supervisor and race a new
 * one — interleaved rows, both arms fighting for the same cores, every figure
 * garbage and every figure plausible. This takes the same lock `bench.mts` takes
 * (pid-validated, `O_EXCL`) so the two can never run together, and refuses
 * outright above a load threshold.
 *
 * **The cache is 50x cheaper than rendering, so measuring it by accident is the
 * easiest way to conclude the harness is fast having measured nothing.** Every
 * render row here passes `skipCache`, and the cache gets its own row instead.
 *
 * **RSS summed over chromium double-counts shared pages.** Reported, and
 * reported as a trendline rather than a total; `project/LANDMINES.md` says why.
 *
 * **A cold row and a warm row are different questions.** `--cold` stops the
 * daemon first, which measures the thing a fresh agent on a quiet machine pays;
 * the default measures what the second agent pays, which is the common case.
 */
import { execFile, execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync, writeSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { call, ensureDaemon } from './daemon.mts';
import type { HealthResponse, ShotsResponse } from './daemon.mts';
import { ROOT, resolveBuild, shortBuild } from './identity.mts';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const LOCK = path.join(ROOT, 'tmp', '.bench.lock');
const OUT = path.join(ROOT, 'tmp', 'capturebench');

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const val = (n: string, d: number) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : d;
};
const SHOTS = val('shots', 24);
const AGENTS = val('agents', 4);
const COLD = flag('cold');

const ms = (n: number) => `${n.toFixed(0)} ms`;
const sec = (n: number) => `${(n / 1000).toFixed(2)} s`;
const now = () => Date.now();

/**
 * The bench lock, shared with `bench.mts` so the two can never interleave.
 *
 * `O_EXCL` rather than "does the file exist": two benches started in the same
 * second is exactly the race that produced the garbage rows.
 */
function takeLock(): () => void {
  mkdirSync(path.dirname(LOCK), { recursive: true });
  try {
    const fd = openSync(LOCK, 'wx');
    writeSync(fd, String(process.pid));
    closeSync(fd);
  } catch {
    const held = Number(readFileSync(LOCK, 'utf8').trim());
    let alive = false;
    try { process.kill(held, 0); alive = true; } catch { /* stale */ }
    if (alive) {
      console.error(`another bench is running (pid ${held}). A number measured beside one`);
      console.error('is not a number — refusing rather than printing something plausible.');
      process.exit(1);
    }
    rmSync(LOCK, { force: true });
    return takeLock();
  }
  return () => rmSync(LOCK, { force: true });
}

/** Refuse to measure a machine somebody else is using. */
function contentionGate(): { load: number, cores: number, chromiums: number } {
  const cores = os.cpus().length;
  const load = os.loadavg()[0];
  let chromiums = 0;
  try {
    chromiums = execFileSync('bash', ['-c', 'pgrep -f "headless_shell|chrome-headless" | wc -l'],
      { encoding: 'utf8' }).trim().split('\n').map(Number)[0] || 0;
  } catch { /* not fatal */ }
  if (load > cores * 0.7) {
    console.error(`ABORT: load ${load.toFixed(1)} on ${cores} cores — too busy to measure.`);
    process.exit(1);
  }
  return { load, cores, chromiums };
}

/** Wall time of a child process, which is what "how long do I wait" means. */
function timeChild(args: string[], env: NodeJS.ProcessEnv = {}): Promise<{ ms: number, code: number, out: string }> {
  return new Promise((resolve) => {
    const t0 = now();
    let out = '';
    const p = spawn(process.execPath, args, { cwd: ROOT, env: { ...process.env, ...env } });
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ ms: now() - t0, code: code ?? 1, out }));
  });
}

const rows: { row: string, value: string, note: string }[] = [];
const add = (row: string, value: string, note = '') => {
  rows.push({ row, value, note });
  console.log(`  ${row.padEnd(30)}${value.padStart(11)}   ${note}`);
};

async function main(): Promise<void> {
  const release = takeLock();
  process.on('exit', release);
  try {
    const { load, cores, chromiums } = contentionGate();
    mkdirSync(OUT, { recursive: true });
    const build = resolveBuild('HEAD');

    console.log(`\n=== capturebench — ${shortBuild(build)} on ${cores} cores, load ${load.toFixed(2)}, `
      + `${chromiums} chromium(s) already up ===\n`);

    // ---------------------------------------------------------- spawn floor
    // Every tool invocation pays this before it does anything at all, and a
    // fan-out of small calls can be nothing else. Measured against a tool that
    // exits immediately so the number is startup and nothing else.
    const spawnR = await timeChild([path.join(TOOLS, 'identity.mts')]);
    add('node + import graph', ms(spawnR.ms), 'identity.mts: process start, strip, 2 git calls');

    // ----------------------------------------------------------------- cold
    if (COLD) {
      await call('/stop', {}).catch(() => {});
      await new Promise((r) => { setTimeout(r, 1500); });
      const t0 = now();
      await ensureDaemon();
      add('daemon start', ms(now() - t0), 'detached spawn to listening');
    }

    // ------------------------------------------------------------ one shot
    // COLD: the first capture of a sha pays materialise + vite build + boot.
    const one = await timeChild(
      [path.join(TOOLS, 'shoot.mts'), 'hero_full', '--out', path.join(OUT, 'a'), '--jpeg', '--cold'],
      { HARNESS_AGENT: 'bench-cold' },
    );
    add('ONE shot, cold page', sec(one.ms), one.code === 0 ? 'boot + pose + encode' : `FAILED ${one.code}`);

    // WARM: same identity, page already booted and pooled.
    const warm = await timeChild(
      [path.join(TOOLS, 'shoot.mts'), 'party_walk', '--out', path.join(OUT, 'a'), '--jpeg'],
      { HARNESS_AGENT: 'bench-warm' },
    );
    add('ONE shot, warm page', sec(warm.ms), 'pose + encode, no boot');

    // CACHE HIT: the same shot again. A hit is a sha1, two stats and a copy.
    const hit = await timeChild(
      [path.join(TOOLS, 'shoot.mts'), 'party_walk', '--out', path.join(OUT, 'b'), '--jpeg'],
      { HARNESS_AGENT: 'bench-hit' },
    );
    add('ONE shot, cache hit', sec(hit.ms), 'no browser touched at all');

    // ------------------------------------------- the daemon with no browser
    const t1 = now();
    await call<HealthResponse>('/health');
    add('/health round trip', ms(now() - t1), 'the daemon\'s own floor, no page');

    // --------------------------------------------------- pose vs everything
    // One /shots call for N shots on ONE page: this is the per-shot marginal
    // cost with boot amortised, which is what a corpus actually pays.
    const names = shotNames().slice(0, Math.min(SHOTS, 142));
    const t2 = now();
    const batch = await call<ShotsResponse>('/shots', {
      shots: names, out: path.relative(ROOT, path.join(OUT, 'batch')), jpeg: 70,
      build, agent: 'bench-batch', lane: 'sweep', skipCache: true,
    });
    const batchMs = now() - t2;
    const inPage = batch.results.reduce((a, r) => a + r.ms, 0);
    add(`${names.length} shots, one page`, sec(batchMs),
      `${ms(batchMs / names.length)}/shot marginal`);
    add('  of which in-page', sec(inPage), `${(100 * inPage / batchMs).toFixed(0)}% pose+encode`);
    add('  of which harness', sec(batchMs - inPage), 'queue, http, file writes');

    // COUNTS-ONLY: the same poses with no screenshot and the settle undrawn.
    const t3 = now();
    const counts = await call<ShotsResponse>('/shots', {
      shots: names, out: path.relative(ROOT, path.join(OUT, 'counts')), jpeg: 70,
      build, agent: 'bench-counts', lane: 'sweep', skipCache: true, countsOnly: true,
    });
    const countsMs = now() - t3;
    add(`${names.length} shots, counts only`, sec(countsMs),
      `${(batchMs / countsMs).toFixed(1)}x — what drawcheck now pays`);
    void counts;

    // ------------------------------------------------- N agents, M shots each
    // The question nobody had measured: what does the Nth concurrent agent pay?
    // Separate PROCESSES, because that is what agents are — this also prices
    // the spawn floor N times, which is part of the honest answer.
    const per = Math.max(1, Math.floor(SHOTS / AGENTS));
    const t4 = now();
    const waves = await Promise.all(Array.from({ length: AGENTS }, (_, i) => timeChild(
      [path.join(TOOLS, 'shoot.mts'), ...names.slice(i * per, (i + 1) * per),
        '--out', path.join(OUT, `w${i}`), '--jpeg'],
      { HARNESS_AGENT: `bench-agent-${i}` },
    )));
    const waveMs = now() - t4;
    const slowest = Math.max(...waves.map((w) => w.ms));
    add(`${AGENTS} agents x ${per} shots`, sec(waveMs),
      `slowest agent ${sec(slowest)}; ALL FROM CACHE — the second agent is free`);

    // -------------------------------------------------------------- the box
    const h = await call<HealthResponse>('/health');
    add('chromium RSS', `${h.rssMb} MB`, `${h.pool.contexts} contexts — ps double-counts shared pages`);
    add('boots / reuses', `${h.boots} / ${h.reuses}`, 'a reuse is a boot not paid');

    if (flag('json')) {
      const f = argv[argv.indexOf('--json') + 1] || path.join(OUT, 'capturebench.json');
      const { writeFileSync } = await import('node:fs');
      writeFileSync(f, `${JSON.stringify({ at: new Date().toISOString(), cores, load, rows }, null, 2)}\n`);
      console.log(`\n  -> ${path.relative(ROOT, f)}`);
    }
    console.log('');
  } finally {
    release();
  }
}

/** Every shot the game declares, read the way `drawcheck` reads it. */
function shotNames(): string[] {
  const src = readFileSync(path.join(ROOT, 'src/game/Shots.ts'), 'utf8');
  return [...src.matchAll(/^\s{2}([a-zA-Z0-9_]+):\s*\{/gm)].map((m) => m[1]);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  void execFile;
  void existsSync;
  await main();
}
