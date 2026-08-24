#!/usr/bin/env node
/**
 * Run the whole gate suite and report one table.
 *
 * **Why this exists.** `combatloop.mts` slid from 30/30 to 21/30 and nobody
 * noticed for weeks, because the cheap gates were run at every merge and the
 * expensive ones were not. A regression that no one runs is a regression no one
 * finds. This runs all of them, always, and exits non-zero if any fail.
 *
 *   node src/tools/check.mts              # everything except the perf gates
 *   node src/tools/check.mts --perf       # include perf.mts and gameplay.mts
 *   node src/tools/check.mts --only integration,uxcheck
 *
 * `--perf` is opt-out by default on purpose: **a perf number taken while agents
 * are running is meaningless.** Six or more headless Chromiums saturate the
 * machine. Pass it only on a quiet tree.
 *
 * `PORT` is honoured and forwarded; the capture daemon takes `PORT+1`.
 */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** The local vite binary. Never `npx`/`pnpm dlx`: those can fetch from the network. */
const VITE = path.join(HERE, '..', '..', 'node_modules/.bin/vite');

/**
 * One gate: either a `.mts` under this directory or an explicit command.
 *
 * `expect` is printed when the gate fails, so the reader is told what a pass
 * would have looked like rather than only that something went wrong.
 */
interface Gate {
  name: string;
  /** A tool in `src/tools/`; mutually exclusive with `cmd`/`args`. */
  script?: string;
  cmd?: string;
  args?: string[];
  expect: string;
  /** Assumes a server is already up on `PORT`; `check` starts one for it. */
  needsServer?: boolean;
  /** Only run under `--perf`, and only on a quiet tree. */
  perf?: boolean;
  /**
   * In the **push gate** (`pnpm run check:gate`).
   *
   * The roster lives here and nowhere else, which is the whole point. The
   * commit hook is deliberately a few seconds -- build plus typecheck -- because
   * a gate slow enough to skip *gets* skipped, and RESCUE §B5 records
   * `combatloop` sliding from 30/30 to 21/30 unnoticed for weeks precisely
   * because the expensive gates were "run at merge" by convention rather than
   * by anything. These five are the ones that catch a broken game rather than a
   * broken build, and they run before a push.
   */
  gate?: boolean;
}

/** Ordered cheapest-first, so a broken tree fails fast. */
const GATES: Gate[] = [
  { name: 'build', cmd: VITE, args: ['build'], expect: 'builds' },
  { name: 'anycheck', script: 'anycheck.mts', expect: '0 `any`' },
  { name: 'orphans', script: 'orphans.mts', expect: 'every module reachable' },
  // Bare Node, ~3 s: it grows the trees and the bestiary in process and
  // compares outlines. A ratchet like `anycheck` -- it fails on a NEW pair of
  // meshes sharing one silhouette, not on the debt recorded in
  // `project/silhouette-baseline.json`.
  { name: 'silhouette', script: 'silhouette.mts', expect: 'no new collapsed silhouettes' },
  // The same bench over the *generated* rock families, which need a different
  // ratchet: a tor's name is its seed index, so any edit to `torPlan` renumbers
  // every subject and a pair-named baseline cries wolf on the commits it exists
  // to protect. This one is ratcheted on the family property instead, and the
  // `--seeds`/`--reseeds` are load-bearing -- the floors were recorded at these
  // and the tool VOIDs rather than grade at any others. ~18 s.
  {
    name: 'silrocks',
    args: [path.join(HERE, 'silhouette.mts'), '--set', 'rocks', '--seeds', '24', '--reseeds', '5'],
    expect: 'no rock family below its recorded distinct/variety floor',
  },
  // Winding, orientation and attribute asserts over every generator bare Node
  // can build. Five controls with known answers run first and the tool exits
  // VOID rather than PASS if any comes back wrong.
  { name: 'geocheck', script: 'geocheck.mts', expect: '0 non-finite, 0 bad indices, no new edge-parity imbalance' },
  // Bare Node too, but it builds the field, so ~20 s. Two claims in
  // `Terrain.erosionAt`'s contract -- every channel is a percentile, and the
  // hot cells form a network rather than a haze -- each against its own
  // control, including the checkerboard that says whether the instrument is
  // saturated.
  { name: 'hydrocheck', script: 'hydrocheck.mts', expect: 'percentile medians, and lift over the shuffled null' },
  { name: 'integration', gate: true, script: 'integration.mts', expect: '27 pass, 0 fail' },
  { name: 'uxcheck', gate: true, script: 'uxcheck.mts', expect: '93/93' },
  { name: 'creaturecheck', gate: true, script: 'creaturecheck.mts', expect: '207 poses, 0 failures' },
  { name: 'combatloop', gate: true, script: 'combatloop.mts', expect: '31/31' },
  { name: 'roadcheck', gate: true, script: 'roadcheck.mts', expect: '0 failures' },
  // Does the code *run*? `orphans` proves a module is reachable from `main.ts`;
  // six systems passed that and never executed. See `reachcheck.mts`.
  { name: 'reachcheck', script: 'reachcheck.mts', expect: 'every must-run path executes' },
  // `proudOf` over the final instance matrices, across the whole POI corpus
  // (every site force-built in one boot) and every live rock/debris instance.
  // A ratchet: the counts may not go up. See `project/float-baseline.json`.
  { name: 'floatcheck', script: 'floatcheck.mts', expect: 'nothing new floats or is buried' },
  // No browser and no server: the horizon sweep and its brute-force reference
  // are both plain arithmetic, so this runs in a second and belongs among the
  // cheap gates.
  { name: 'horizoncheck', script: 'horizoncheck.mts', expect: 'MCC >= 0.85, or <= 1% disagreement, vs the ray march' },
  // These two do NOT spawn a server; they assume one is already up. Everything
  // else starts its own, and `strictPort` means a pre-started vite on the same
  // port would break those -- so they get a dedicated one, scanned for below.
  { name: 'heightcheck', script: 'heightcheck.mts', expect: '0.000 m GPU vs CPU', needsServer: true },
  { name: 'driftcheck', script: 'driftcheck.mts', expect: 'within tolerance', needsServer: true },
  { name: 'perf', script: 'perf.mts', expect: '60 fps', perf: true },
  { name: 'gameplay', script: 'gameplay.mts', expect: '60 fps under real input', perf: true },
];

function parse(argv: string[]) {
  const o: { perf: boolean, only: string[] | null, gate: boolean } = { perf: false, only: null, gate: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--perf') o.perf = true;
    else if (argv[i] === '--gate') o.gate = true;
    else if (argv[i] === '--only') o.only = argv[++i].split(',').map((s) => s.trim());
  }
  return o;
}

/**
 * Vite on `port`, resolved once it is **actually accepting connections**.
 *
 * This used to resolve on a log line, with a 15-second timer that resolved
 * *successfully* if the line never came. That is a guess dressed as a check, and
 * it is wrong exactly when it matters: a cold `src/public/baked/` makes the bake
 * plugin regenerate the terrain field and the texture caches before vite listens
 * at all, which took **41 s** on the run that exposed this. The two gates that
 * do not start their own server then connected to nothing, died with a Node
 * stack, and appeared in the summary table as a terrain regression — twice
 * tonight, costing two lanes an investigation each.
 *
 * So: poll the socket. The only honest signal that a server is up is a
 * connection to it.
 */
function serve(port: number): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const p = spawn(VITE, ['--port', String(port), '--strictPort'], {
      cwd: path.join(HERE, '..', '..'), env: { ...process.env, PORT: String(port) },
    });
    let out = '', settled = false;
    const fail = (why: string) => { if (!settled) { settled = true; reject(new Error(`${why}\n${out.slice(-400)}`)); } };
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', () => fail('vite exited before it served'));
    p.on('error', (e) => fail(String(e.message)));

    // Generous, because a cold bake legitimately takes most of a minute. A
    // deadline that is too short here reintroduces the bug it replaced.
    const deadline = Date.now() + 240000;
    const poll = async () => {
      while (!settled && Date.now() < deadline) {
        if (await portOpen(port)) { settled = true; resolve(p); return; }
        await new Promise((r) => setTimeout(r, 500));
      }
      fail(`nothing listening on ${port} after 240 s`);
    };
    poll();
  });
}

/**
 * A gate that measured nothing, as distinct from one that measured a failure.
 *
 * `perf.mts` and `gameplay.mts` exit 3 when their noise floor is too wide to
 * resolve the thing being asked — machine contention, usually. Rendering that as
 * FAIL is worse than useless: it reads in this table as a regression, so the
 * next person either chases a number that was never taken or, having seen it go
 * green again later, concludes they fixed something. It is still non-zero
 * overall, because a run that certified nothing must not report success.
 */
const VOID = 3;

function verdict(code: number | null): string {
  if (code === 0) return 'PASS';
  return code === VOID ? 'VOID' : 'FAIL';
}

function run(gate: Gate, env: NodeJS.ProcessEnv): Promise<{ gate: Gate, code: number | null, ms: number, tail: string }> {
  return new Promise((resolve) => {
    const cmd = gate.cmd || process.execPath;
    const args = gate.args || (gate.script ? [path.join(HERE, gate.script)] : []);
    const t0 = Date.now();
    let out = '';
    const p = spawn(cmd, args, { env: env || process.env, cwd: path.join(HERE, '..', '..') });
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({
      gate, code, ms: Date.now() - t0,
      tail: out.trim().split('\n').filter(Boolean).slice(-2).join(' | ').slice(0, 110),
    }));
    p.on('error', (e) => resolve({ gate, code: 127, ms: Date.now() - t0, tail: String(e.message) }));
  });
}

const opts = parse(process.argv.slice(2));
const todo = GATES.filter((g) => {
  if (opts.only) return opts.only.includes(g.name);
  // `--gate` is the push roster: the five that catch a broken *game*. The
  // commit hook already covers a broken build.
  if (opts.gate) return g.gate === true;
  return opts.perf || !g.perf;
});

if (!opts.perf && !opts.only) {
  console.log('note: perf gates skipped. Pass --perf on a QUIET tree -- a perf');
  console.log('      number taken while agents run is meaningless.\n');
}

const basePort = Number(process.env.PORT || 5173);
/**
 * A free port for the aux server, found rather than assumed.
 *
 * This used to be `basePort + 50`, which is fine alone and wrong the moment a
 * second worktree exists: agents here are allocated ports ten or fifty apart,
 * so `PORT + 50` lands squarely on a co-agent's dev server. `strictPort` then
 * refuses, the failure is swallowed by the bare `catch` below, and both gates
 * that need a server crash a second later with a Node stack -- which reads in
 * the summary table as a terrain regression. It cost two separate lanes an
 * investigation tonight before anyone noticed the two gates were not failing,
 * they were never running.
 */
async function freePort(from: number): Promise<number> {
  for (let p = from; p < from + 400; p += 2) if (!(await portOpen(p))) return p;
  throw new Error(`check: no free port in ${from}..${from + 400}`);
}

/** Is something already listening on `port`? */
function portOpen(port: number): Promise<boolean> {
  return new Promise((res) => {
    const sock = net.connect(port, '127.0.0.1');
    const done = (v: boolean) => { sock.destroy(); res(v); };
    sock.on('connect', () => done(true));
    sock.on('error', () => res(false));
    setTimeout(() => done(false), 600);
  });
}

const auxPort = await freePort(basePort + 50);
let aux: ChildProcess | null = null;
/** Why the aux server failed, if it did. Reported, never swallowed. */
let auxError: string | null = null;

const results = [];
for (const g of todo) {
  process.stdout.write(`  ${g.name.padEnd(14)}`);
  let env = process.env;
  if (g.needsServer) {
    // Do NOT swallow this. The comment that used to sit here said the gate
    // would report it; the gate cannot -- it does not start a server, so all it
    // can do is fail to connect and die with a Node stack, which reads in this
    // table as a terrain regression. Two separate lanes went and investigated
    // heightcheck tonight before noticing it passes standalone.
    if (!aux && !auxError) {
      try { aux = await serve(auxPort); } catch (e) { auxError = String((e as Error).message || e); }
    }
    if (auxError) {
      results.push({ gate: g, code: 1, ms: 0, tail: `aux server on ${auxPort} never came up: ${auxError}` });
      process.stdout.write(`FAIL  0.000s  aux server on ${auxPort} never came up: ${auxError}\n`);
      continue;
    }
    env = { ...process.env, PORT: String(auxPort) };
  }
  const r = await run(g, env);
  results.push(r);
    process.stdout.write(`${verdict(r.code)}  ${String(r.ms / 1000).slice(0, 5)}s  ${r.tail}\n`);
}
if (aux) aux.kill();

const failed = results.filter((r) => r.code !== 0 && r.code !== VOID);
const voided = results.filter((r) => r.code === VOID);
console.log(`\n${results.length - failed.length - voided.length}/${results.length} gates passed`);
if (voided.length) {
  console.log(`VOID (measured nothing, not a regression): ${voided.map((v) => v.gate.name).join(', ')}`);
  console.log('  the ruler refused to certify -- re-run on a quiet tree; do not read these as numbers.');
}
if (failed.length) {
  console.log(`failing: ${failed.map((f) => `${f.gate.name} (expected ${f.gate.expect})`).join(', ')}`);
}
if (failed.length || voided.length) process.exit(1);
