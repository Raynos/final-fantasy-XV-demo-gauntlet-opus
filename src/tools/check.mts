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
}

/** Ordered cheapest-first, so a broken tree fails fast. */
const GATES: Gate[] = [
  { name: 'build', cmd: 'npx', args: ['vite', 'build'], expect: 'builds' },
  { name: 'anycheck', script: 'anycheck.mts', expect: '0 `any`' },
  { name: 'orphans', script: 'orphans.mts', expect: 'every module reachable' },
  { name: 'integration', script: 'integration.mts', expect: '18 pass, 0 fail' },
  { name: 'uxcheck', script: 'uxcheck.mts', expect: '86/86' },
  { name: 'creaturecheck', script: 'creaturecheck.mts', expect: '207 poses, 0 failures' },
  { name: 'combatloop', script: 'combatloop.mts', expect: '30/30' },
  { name: 'roadcheck', script: 'roadcheck.mts', expect: '0 failures' },
  // No browser and no server: the horizon sweep and its brute-force reference
  // are both plain arithmetic, so this runs in a second and belongs among the
  // cheap gates.
  { name: 'horizoncheck', script: 'horizoncheck.mts', expect: 'MCC >= 0.85 vs the ray march' },
  // These two do NOT spawn a server; they assume one is already up. Everything
  // else starts its own, and `strictPort` means a pre-started vite on the same
  // port would break those -- so they get a dedicated one, scanned for below.
  { name: 'heightcheck', script: 'heightcheck.mts', expect: '0.000 m GPU vs CPU', needsServer: true },
  { name: 'driftcheck', script: 'driftcheck.mts', expect: 'within tolerance', needsServer: true },
  { name: 'perf', script: 'perf.mts', expect: '60 fps', perf: true },
  { name: 'gameplay', script: 'gameplay.mts', expect: '60 fps under real input', perf: true },
];

function parse(argv: string[]) {
  const o: { perf: boolean, only: string[] | null } = { perf: false, only: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--perf') o.perf = true;
    else if (argv[i] === '--only') o.only = argv[++i].split(',').map((s) => s.trim());
  }
  return o;
}

/** Vite on `port`, resolved once it is actually serving. */
function serve(port: number): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const p = spawn('npx', ['vite', '--port', String(port), '--strictPort'], {
      cwd: path.join(HERE, '..', '..'), env: { ...process.env, PORT: String(port) },
    });
    let out = '';
    const done = (ok: boolean) => { if (ok) resolve(p); else reject(new Error(out.slice(-400))); };
    p.stdout.on('data', (d) => { out += d; if (/Local:|ready in/.test(String(d))) done(true); });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', () => done(false));
    setTimeout(() => done(true), 15000);
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
const todo = GATES.filter((g) => (opts.only ? opts.only.includes(g.name) : (opts.perf || !g.perf)));

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

const results = [];
for (const g of todo) {
  process.stdout.write(`  ${g.name.padEnd(14)}`);
  let env = process.env;
  if (g.needsServer) {
    if (!aux) { try { aux = await serve(auxPort); } catch { /* reported by the gate */ } }
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
