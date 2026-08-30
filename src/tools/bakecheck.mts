#!/usr/bin/env node
/**
 * Is the shared bake cache there, and is it this tree's?
 *
 * **Why this exists.** `check` runs twenty-three gates and not one of them
 * looked at `src/public/baked/`, where the caches of our own generators live.
 * `project/LANDMINES.md` §"Baked caches" is three screens of what that costs,
 * and every entry in it is a bug that shipped:
 *
 *  - **A stale texel bake is the one cache failure with no symptom.** The keys
 *    resolve, the page boots, every gate passes, and the world renders with
 *    texels a previous version of your generator produced — so the material
 *    edit you just made appears to do nothing and you go looking in the shader.
 *  - **A stale GEOMETRY bake is sharper still, because what it serves is
 *    well-formed.** A viaduct correctly wound, contract-clean, and standing in
 *    the air over a heightfield that moved. "Nothing in this repo can see that."
 *    Now something does.
 *  - **`geo.bin.gz` and `texc.bin.gz` go missing constantly**, because they need
 *    a browser to record and the vite plugin only has a server, so all it can do
 *    with a stale one is delete it — which any co-agent's `pre-commit` does.
 *    Each costs 1.2 s and 2.5 s of cold boot, silently. `daemon.mts --health`
 *    warns; nothing gated it, and on the night this was written both had been
 *    absent for hours while `check` was green and a first-load number was quoted
 *    from a cache nobody had checked.
 *
 *   node src/tools/bakecheck.mts                  # the gate
 *   node src/tools/bakecheck.mts --allow-cold     # missing browser-baked artifacts warn, not fail
 *   node src/tools/bakecheck.mts --build <ref>    # ...and does the cache BELONG to <ref>?
 *
 * ## The `--build` arm, which is the other half of the same disease
 *
 * `src/public/baked/` is symlinked into every materialised build tree, so a
 * tool run at `--build <old sha>` renders old code against **today's** bake.
 * The tell is the worst one an instrument can have: on 2026-08-31 an A/B of
 * `driftcheck --build 7da60d5` against `--build HEAD` came back *bit-identical
 * in every digit*, which reads as "nothing changed" and means "you measured the
 * same thing twice". `project/TASKS.md` carries it as "the shared bake cache
 * defeating an A/B".
 *
 * This cannot be fixed without per-branch bakes, which would be right and cost
 * tens of megabytes and ~40 s a branch. It can be made honest, and that is cheap: re-hash
 * each artifact's source list *as it stood in that tree* and compare it to the
 * hash the artifact's own stamp recorded. `announceBuild` now does this on
 * every `--build <ref>` run of every tool, so nobody has to remember.
 *
 * Exits non-zero if any artifact is MISSING, STALE or TRUNCATED (see
 * `--allow-cold`), or if `--build <ref>` was given and the cache is not that
 * tree's.
 */
import path from 'node:path';
import { ARTIFACTS, BAKE_DIR, statusOf, bakeBelongsTo } from './bakesources.mts';
import type { BakeStatus } from './bakesources.mts';
import { resolveBuild, shaOf } from './identity.mts';

function parse(argv: string[]) {
  // No `--json`. The first draft parsed one and never read it, which is the
  // exact defect this lane had just removed from `reliefstat.mts` an hour
  // earlier: a flag that is accepted and ignored is strictly worse than one that
  // is rejected, because a run that names an output format and does not produce
  // it looks like it worked. If this ever needs machine-readable output, add the
  // flag and the writer in the same commit.
  const o = { allowCold: false, build: undefined as string | undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--allow-cold') o.allowCold = true;
    else if (a === '--build') o.build = argv[++i];
    else if (a === '--dirty') o.build = 'dirty';
    else throw new Error(`unknown flag ${a}`);
  }
  return o;
}

/**
 * A gate never exits on a stack trace.
 *
 * An unknown flag has to be rejected -- one that is accepted and ignored is the
 * worse bug, and this file carries the comment saying so -- but rejecting it by
 * letting the throw reach the top level prints twenty lines of node internals
 * and buries the one line that helps. Say what is wrong and what the flags are.
 */
let opts;
try { opts = parse(process.argv.slice(2)); }
catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  console.error('usage: node src/tools/bakecheck.mts [--allow-cold] [--build <ref> | --dirty]');
  process.exit(2);
}
const t0 = Date.now();
const rows: BakeStatus[] = ARTIFACTS.map(statusOf);

const mb = (b: number) => (b / 1048576).toFixed(1).padStart(7) + ' MB';
console.log(`${'artifact'.padEnd(15)} ${'state'.padEnd(10)} ${'size'.padEnd(10)} ${'stamp'.padEnd(17)}what`);
console.log('-'.repeat(96));
for (const r of rows) {
  const size = r.bytes ? mb(r.bytes) : '        -  ';
  const flag = r.inFlight ? ' (being rewritten)' : '';
  console.log(`${r.artifact.file.padEnd(15)} ${(r.state + flag).padEnd(10)} ${size} ${(r.stampHash ?? '-').padEnd(17)}${r.artifact.what}`);
}

/**
 * What is actually wrong, and what it costs.
 *
 * **MISSING and STALE are not the same severity and must not be reported as
 * one.** A missing artifact costs exactly the boot time it used to cost — every
 * path falls back to the generator — and for `texc`/`geo` it is the *designed*
 * response to a source moving. A stale one is silent and wrong. So a stale
 * artifact is red under every flag, and `--allow-cold` reaches only the two the
 * plugin cannot regenerate, and only when they are absent rather than wrong.
 */
const stale = rows.filter((r) => r.state === 'STALE' || r.state === 'TRUNCATED');
const missing = rows.filter((r) => r.state === 'MISSING' && !r.inFlight);
const cold = missing.filter((r) => !r.artifact.regenerable);
const gone = missing.filter((r) => r.artifact.regenerable);
const inFlight = rows.filter((r) => r.inFlight);

let bad = stale.length > 0 || gone.length > 0 || (cold.length > 0 && !opts.allowCold);

if (inFlight.length) {
  console.log(`\nA writer is replacing ${inFlight.map((r) => r.artifact.file).join(', ')} right now`);
  console.log('(any lane\'s pre-commit runs `vite build`, which runs the bake plugin). Reported,');
  console.log('not failed: a bake happening this second is the one state that is nobody\'s bug.');
}
for (const r of stale) {
  console.log(`\n${r.artifact.file} is ${r.state} — it does not match its own sources.`);
  console.log(`  stamp ${r.stampHash}  sources now ${r.treeHash}  over ${r.artifact.sources.length} files`);
  console.log('  This is the cache failure with NO symptom: the keys resolve, the page boots,');
  console.log(`  every other gate passes, and the world is served the previous generator's output.`);
  console.log(`  Fix: ${r.artifact.remedy}`);
}
for (const r of gone) {
  console.log(`\n${r.artifact.file} is MISSING, and the vite plugin is supposed to regenerate it.`);
  console.log('  Absent means the plugin did not run: `pnpm run build` was skipped, or the bake');
  console.log(`  threw. Cold boot pays ~${r.artifact.bootCostSec} s. Fix: ${r.artifact.remedy}`);
}
if (cold.length) {
  const secs = cold.reduce((s, r) => s + r.artifact.bootCostSec, 0);
  console.log(`\n${cold.map((r) => r.artifact.file).join(' and ')} ${cold.length > 1 ? 'are' : 'is'} MISSING.`);
  console.log('  These two need a BROWSER to record, which the vite plugin does not have, so all');
  console.log('  it can do with a stale one is delete it — and any co-agent\'s pre-commit does.');
  console.log(`  Cold boot pays ~${secs.toFixed(1)} s per load, silently, and no other gate can see it.`);
  console.log('  Fix: pnpm run build:full        (or, individually:)');
  for (const r of cold) console.log(`       ${r.artifact.remedy}`);
  if (opts.allowCold) console.log('  --allow-cold: reported, not failed.');
}

// ---- the `--build <ref>` arm --------------------------------------------
if (opts.build !== undefined) {
  // `resolveBuild` throws on a ref git cannot name, and this is a GATE: it must
  // print a verdict, not a stack trace. `--build typo` used to exit 0 through an
  // unhandled rejection, which is the worst of both -- no answer, and a green
  // exit code for a run that never ran.
  let id;
  try { id = resolveBuild(opts.build); }
  catch (e) {
    console.log(`\n--build ${opts.build} is not a ref git can resolve: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    console.log(`\nFAIL  (${rows.filter((r) => r.state === 'FRESH').length}/${rows.length} artifacts fresh, ${Date.now() - t0} ms)`);
    process.exit(2);
  }
  const sha = shaOf(id);
  console.log('');
  if (!sha) {
    console.log(`--build ${opts.build} is the live tree; the bake is this tree's by construction.`);
  } else {
    const wrong = bakeBelongsTo(sha);
    if (!wrong.length) {
      console.log(`the shared bake at ${path.relative(process.cwd(), BAKE_DIR)} DOES belong to ${sha.slice(0, 12)}.`);
    } else {
      bad = true;
      console.log(`the shared bake does NOT belong to ${sha.slice(0, 12)} — ${wrong.length} of ${ARTIFACTS.length} artifacts:`);
      for (const w of wrong) console.log(`  ${w.artifact.file.padEnd(15)} ${w.why}   (${w.artifact.what})`);
      console.log('');
      console.log('  `src/public/baked/` is a SYMLINK into the main checkout from every materialised');
      console.log('  tree, so a run at this sha renders that code against TODAY\'s bake. An A/B whose');
      console.log('  two arms differ only in a baked artifact will come back bit-identical and read');
      console.log('  as "nothing changed". Do not quote it.');
    }
  }
}

console.log(`\n${bad ? 'FAIL' : 'PASS'}  (${rows.filter((r) => r.state === 'FRESH').length}/${rows.length} artifacts fresh, ${Date.now() - t0} ms)`);
process.exit(bad ? 1 : 0);
