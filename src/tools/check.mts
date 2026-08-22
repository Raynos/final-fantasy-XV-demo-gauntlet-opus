#!/usr/bin/env node
/**
 * Run the whole gate suite and report one table.
 *
 * **Why this exists.** `combatloop.mjs` slid from 30/30 to 21/30 and nobody
 * noticed for weeks, because the cheap gates were run at every merge and the
 * expensive ones were not. A regression that no one runs is a regression no one
 * finds. This runs all of them, always, and exits non-zero if any fail.
 *
 *   node src/tools/check.mjs              # everything except the perf gates
 *   node src/tools/check.mjs --perf       # include perf.mjs and gameplay.mjs
 *   node src/tools/check.mjs --only integration,uxcheck
 *
 * `--perf` is opt-out by default on purpose: **a perf number taken while agents
 * are running is meaningless.** Six or more headless Chromiums saturate the
 * machine. Pass it only on a quiet tree.
 *
 * `PORT` is honoured and forwarded; the capture daemon takes `PORT+1`.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Ordered cheapest-first, so a broken tree fails fast. */
const GATES = [
  { name: 'build', cmd: 'npx', args: ['vite', 'build'], expect: 'builds' },
  { name: 'orphans', script: 'orphans.mts', expect: 'every module reachable' },
  { name: 'integration', script: 'integration.mts', expect: '18 pass, 0 fail' },
  { name: 'uxcheck', script: 'uxcheck.mts', expect: '86/86' },
  { name: 'creaturecheck', script: 'creaturecheck.mts', expect: '207 poses, 0 failures' },
  { name: 'combatloop', script: 'combatloop.mts', expect: '30/30' },
  { name: 'roadcheck', script: 'roadcheck.mts', expect: '0 failures' },
  // These two do NOT spawn a server; they assume one is already up. Everything
  // else starts its own, and `strictPort` means a pre-started vite on the same
  // port would break those -- so they get a dedicated one on `PORT + 50`.
  { name: 'heightcheck', script: 'heightcheck.mts', expect: '0.000 m GPU vs CPU', needsServer: true },
  { name: 'driftcheck', script: 'driftcheck.mts', expect: 'within tolerance', needsServer: true },
  { name: 'perf', script: 'perf.mts', expect: '60 fps', perf: true },
  { name: 'gameplay', script: 'gameplay.mts', expect: '60 fps under real input', perf: true },
];

function parse(argv: any) {
  const o: { perf: boolean, only: string[] | null } = { perf: false, only: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--perf') o.perf = true;
    else if (argv[i] === '--only') o.only = argv[++i].split(',').map((s: any) => s.trim());
  }
  return o;
}

/** Vite on `port`, resolved once it is actually serving. */
function serve(port: any) {
  return new Promise((resolve, reject) => {
    const p = spawn('npx', ['vite', '--port', String(port), '--strictPort'], {
      cwd: path.join(HERE, '..', '..'), env: { ...process.env, PORT: String(port) },
    });
    let out = '';
    const done = (ok: any) => { if (ok) resolve(p); else reject(new Error(out.slice(-400))); };
    p.stdout.on('data', (d) => { out += d; if (/Local:|ready in/.test(String(d))) done(true); });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', () => done(false));
    setTimeout(() => done(true), 15000);
  });
}

function run(gate: any, env: any): Promise<{gate: any, code: number | null, ms: number, tail: string}> {
  return new Promise((resolve) => {
    const cmd = gate.cmd || process.execPath;
    const args = gate.args || [path.join(HERE, gate.script)];
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
const auxPort = basePort + 50;
let aux: any = null;

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
  process.stdout.write(`${r.code === 0 ? 'PASS' : 'FAIL'}  ${String(r.ms / 1000).slice(0, 5)}s  ${r.tail}\n`);
}
if (aux) aux.kill();

const failed = results.filter((r) => r.code !== 0);
console.log(`\n${results.length - failed.length}/${results.length} gates passed`);
if (failed.length) {
  console.log(`failing: ${failed.map((f) => `${f.gate.name} (expected ${f.gate.expect})`).join(', ')}`);
  process.exit(1);
}
