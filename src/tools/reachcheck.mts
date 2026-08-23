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
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { harnessArgs, announceBuild, lease, pageOpts } from './harness.mts';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');



interface Result { reached: Record<string, number>; unreached: string[]; instrumented: number; errors: string[] }

const argv = process.argv.slice(2);
const ha = harnessArgs(process.argv.slice(2), { q: 'medium', w: 1280, h: 720 });
announceBuild(ha);
const leased = await lease(pageOpts(ha));
const page = leased.page;
let out: Result;
try {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(String(e)));

  const src = await readFile(path.join(ROOT, 'src/tools/_reach/instrument.mts'), 'utf8');
  const drive = await readFile(path.join(ROOT, 'src/tools/_reach/exercise.mts'), 'utf8');
  await page.evaluate(new Function(src) as () => void);
  await page.evaluate(new Function(drive) as () => void);
  out = await page.evaluate(() => (window as unknown as { __REACH: () => Result }).__REACH()) as Result;
  out.errors = errs;
} finally {
  await leased.release();
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
