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
/**
 * A METHOD THAT NO LONGER EXISTS IS NOT A METHOD THAT DID NOT RUN.
 *
 * `dead` used to be `!(reached[m] > 0)`, which folds two different verdicts into
 * one row: *the feature is unreachable* — the thing this gate exists to catch —
 * and *the entry names a method that was renamed, moved or deleted*, which is a
 * stale line in `must-run.json` and says nothing about the game at all. They
 * need opposite fixes, wire the feature against edit the roster, and the second
 * reads as the first — which is how a wiring gate becomes a gate people learn
 * to edit past.
 *
 * The instrumentation knows the difference and always did: a path it wrapped
 * appears in `reached` or in `unreached`, and one it never saw appears in
 * neither. Same lesson as `check.mts`'s VOID column and the ledger's `error`
 * against `fail`, at a third grain.
 *
 * `GONE` means NOT INSTRUMENTED, which is two things and the row says so: the
 * name was renamed or deleted, OR the class was never reached by the wrapper's
 * bounded walk from the registered systems. The second is real —
 * `BossFight.resolveStrike`, this tool's own headline example, is written and
 * present and reads GONE, because a `BossFight` is constructed when a set piece
 * starts and there is no instance to wrap at instrumentation time. Both need
 * the roster or the exercise looked at, and neither is "the feature is dead".
 *
 * It matters more now that generator entry points are in the roster: those are
 * private methods on files other lanes are actively rewriting, so a rename is
 * the LIKELY failure here and it must not read as "the rocks stopped
 * generating".
 */
const known = new Set<string>([...Object.keys(out.reached), ...out.unreached]);
const dead = must.filter((m) => known.has(m) && !(out.reached[m] > 0));
const missing = must.filter((m) => !known.has(m));

console.log(`instrumented ${out.instrumented} methods; ${Object.keys(out.reached).length} ran, ${out.unreached.length} did not.`);
if (out.errors.length) console.log(`page errors: ${out.errors.length}`);

if (argv.includes('--all')) {
  console.log('\nnever reached in this exercise (advisory — many are legitimately idle):');
  for (const n of out.unreached.slice(0, 400)) console.log(`  ${n}`);
}

const jsonAt = argv.indexOf('--json');
if (jsonAt >= 0 && argv[jsonAt + 1]) await writeFile(argv[jsonAt + 1], JSON.stringify(out, null, 2));

console.log(`\nmust-run: ${must.length - dead.length - missing.length}/${must.length} reached`);
for (const m of must) {
  const n = out.reached[m] ?? 0;
  const said = n > 0 ? 'ok  ' : known.has(m) ? 'DEAD' : 'GONE';
  console.log(`  ${said}  ${m}${n > 0 ? `  (${n}x)` : ''}`);
}

if (missing.length) {
  console.log(`\nFAIL: ${missing.length} must-run path(s) were never INSTRUMENTED, so this run`);
  console.log('cannot say whether they ran. Either the name is stale -- renamed, moved,');
  console.log('deleted -- or the class is never reached by the wrapper walk from the');
  console.log('registered systems, because nothing had constructed one yet. Correct the name');
  console.log('in project/must-run.json, or reach the class in _reach/exercise.mts, and say');
  console.log('which; deleting the row makes it green and unwatched.');
  for (const m of missing) console.log(`  GONE  ${m}`);
}
if (dead.length) {
  console.log(`\nFAIL: ${dead.length} path(s) a human is supposed to reach did not run.`);
  console.log('Either wire it up, or delete it and remove it from project/must-run.json.');
}
if (dead.length || missing.length) process.exit(1);
console.log(`\nreachcheck: every must-run path executed (${must.length} of them).`);
console.log('\nblind to: anything called only during init(). The instrumentation wraps the');
console.log('          prototypes AFTER boot, so a generator that builds all its content at');
console.log('          startup cannot appear here at all -- only its streaming path can.');
console.log('          And to any class no registered system holds a reference to at the');
console.log('          moment of instrumentation: those read GONE, not DEAD.');
