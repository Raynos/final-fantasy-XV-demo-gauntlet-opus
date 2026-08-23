#!/usr/bin/env node
/**
 * Does this code *run*? — the gate this repo did not have.
 *
 *   node src/tools/reachcheck.mts              # census + gate
 *   node src/tools/reachcheck.mts --all        # list every unreached method
 *   node src/tools/reachcheck.mts --json out.json
 *
 * ### Why
 *
 * `orphans.mts` proves every module is *reachable from `main.ts`*. Every one of
 * the following passed it, and none of them executed:
 *
 * - `Animator.rest()` — dead, while two handoffs described its behaviour
 * - `BossFight.resolveStrike` — never ran, in play or in the harness, for weeks
 * - `Dungeons`' entrances — registered against a method that does not exist, so
 *   twelve interiors were built at boot and none had a door
 * - `RpgSystem.craftSpell` — called only from a test, so no player could craft
 * - `CameraRig.setLockOn` — no caller at all
 * - the whole set-piece path — no `HUNT_TARGETS` entry set `setPiece`
 *
 * That is the failure mode of an agent-built codebase: a feature gets written,
 * compiles, type-checks, is imported, is described accurately in a handoff — and
 * is never wired to anything a human can reach. "It exists" and "it runs" are
 * different claims and nothing here distinguished them.
 *
 * ### How
 *
 * No annotations. The page instruments itself: every method on every registered
 * system's prototype chain, plus everything reachable from those systems by a
 * bounded walk, is wrapped in a counter. Then the game is *driven* — real key
 * events, menus opened, a fight, a camp, a shop, a dungeon, a set piece — and
 * anything still at zero is reported.
 *
 * A census is advisory: plenty of methods legitimately do not run in a 90-second
 * exercise. **`project/must-run.json` is the gate.** It lists the paths that a
 * human is supposed to be able to reach, this tool asserts each one ran, and a
 * zero is a failure. Every entry in it is there because it was found dead.
 */
import { chromium } from 'playwright';
import { CHROMIUM_ARGS } from './chromium.mts';
import { assertOwnPort, resolvePort } from './portowner.mts';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** The local vite binary. Never `npx`/`pnpm dlx`: those can fetch from the network. */
const VITE = path.join(ROOT, 'node_modules/.bin/vite');
const PORT = resolvePort(5173, ROOT);

const portOpen = (p: number) => new Promise<boolean>((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 800);
});

async function ensureServer() {
  if (await portOpen(PORT)) { assertOwnPort(PORT, ROOT); return null; }
  const proc = spawn(VITE, ['--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  const deadline = Date.now() + 240000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 400));
    if (await portOpen(PORT)) return proc;
  }
  throw new Error('vite failed to start');
}

interface Result { reached: Record<string, number>; unreached: string[]; instrumented: number; errors: string[] }

const argv = process.argv.slice(2);
const server = await ensureServer();
const browser = await chromium.launch({ args: CHROMIUM_ARGS });
let out: Result;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.goto(`http://127.0.0.1:${PORT}/?q=medium&shoot=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 180000 });

  const src = await readFile(path.join(ROOT, 'src/tools/_reach/instrument.mts'), 'utf8');
  const drive = await readFile(path.join(ROOT, 'src/tools/_reach/exercise.mts'), 'utf8');
  await page.evaluate(new Function(src) as () => void);
  await page.evaluate(new Function(drive) as () => void);
  out = await page.evaluate(() => (window as unknown as { __REACH: () => Result }).__REACH()) as Result;
  out.errors = errs;
} finally {
  await browser.close();
  if (server) server.kill();
}

const must: string[] = JSON.parse(await readFile(path.join(ROOT, 'project/must-run.json'), 'utf8'));
const dead = must.filter((m) => !(out.reached[m] > 0));

console.log(`instrumented ${out.instrumented} methods; ${Object.keys(out.reached).length} ran, ${out.unreached.length} did not.`);
if (out.errors.length) console.log(`page errors: ${out.errors.length}`);

if (argv.includes('--all')) {
  console.log('\nnever reached in this exercise (advisory — many are legitimately idle):');
  for (const n of out.unreached.slice(0, 400)) console.log(`  ${n}`);
}

const jsonAt = argv.indexOf('--json');
if (jsonAt >= 0 && argv[jsonAt + 1]) await writeFile(argv[jsonAt + 1], JSON.stringify(out, null, 2));

console.log(`\nmust-run: ${must.length - dead.length}/${must.length} reached`);
for (const m of must) console.log(`  ${out.reached[m] > 0 ? 'ok  ' : 'DEAD'}  ${m}${out.reached[m] > 0 ? `  (${out.reached[m]}x)` : ''}`);

if (dead.length) {
  console.log(`\nFAIL: ${dead.length} path(s) a human is supposed to reach did not run.`);
  console.log('Either wire it up, or delete it and remove it from project/must-run.json.');
  process.exit(1);
}
console.log('\nreachcheck: every must-run path executed.');
