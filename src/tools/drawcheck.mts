#!/usr/bin/env node
/**
 * Does any frame in the corpus draw more than `BRIEF.md` allows?
 *
 *   node src/tools/drawcheck.mts                    # the whole corpus
 *   node src/tools/drawcheck.mts town_wide poi_reststop
 *   node src/tools/drawcheck.mts --worst 30 --json tmp/draws.json
 *   node src/tools/drawcheck.mts --manifest tmp/shots/corpus/manifest.json
 *   node src/tools/drawcheck.mts --strict          # BRIEF flat, no ratchet
 *   node src/tools/drawcheck.mts --set-baseline    # re-record the debt (LOWER only)
 *
 * **Why a gate.** `BRIEF.md` rule 3 sets a draw-call budget and every capture
 * already carries its own count — `shoot.mts` prints it and writes it into
 * `manifest.json`, `corpus.mts` writes one per category — so the number has
 * been on screen for months. Nothing read it. `project/STATUS.md` records ten
 * town shots at 924-1011 against a budget of 800, found by a human squinting at
 * a manifest, which is exactly the shape of regression `check.mts` exists to
 * stop being found that way.
 *
 * ## The budget is read out of BRIEF.md, not copied here
 *
 * A gate that hard-codes the contract it enforces drifts from it silently, and
 * this one has already moved once (400 -> 800, when the town, the dungeons and
 * three shadow cascades landed). So the number is parsed from rule 3 and the
 * run is **VOID** rather than a pass if the line cannot be found: an
 * unreadable contract is not a green gate.
 *
 * ## What the number is, exactly, and the trap in it
 *
 * It is `renderer.info.render.calls` for **one frame** — the frame the daemon
 * poses and photographs, after `settle(60)`, a re-anchor and `settle(8)`. That
 * is not the mean frame, and the gap is large: measured on `poi_reststop`,
 * eight consecutive frames of a held pose go
 *
 *     707  855  707  1005  707  855  707  1005
 *
 * because the shadow cascades refresh on a rotating schedule — the near
 * cascade every frame (183 draws), the middle one every second (+148), the far
 * one every fourth (+298). The capture lands on a fixed phase of that cycle, so
 * the figure is **deterministic and comparable run to run**, and it is the
 * expensive phase rather than the cheap one. That is the right end to gate: the
 * 33 ms rule is about the worst frame, not the average. But do not read a
 * `drawcheck` number as "what this shot costs on a typical frame" — it is
 * roughly 1.4x that, and a reduction that only moves the cheap phase will not
 * show up here at all.
 *
 * ## What it is blind to
 *
 *   - **Frames nobody photographs.** The corpus is a set of held poses. A draw
 *     spike that only happens while sprinting into Hammerhead is `gameplay.mts`
 *     territory, not this.
 *   - **Where the calls go.** This says a frame is over budget, never which
 *     system spent it. Wrap `renderer.renderBufferDirect` in a probe for that;
 *     it attributes every draw, shadow cascades included, and it is the only
 *     thing that does — `traverseVisible` counts scene meshes and so misses the
 *     ~1.4x the cascades and the velocity-pass proxy scene add on top.
 *   - **Cost.** Draw calls are a submission-side proxy for frame time and a
 *     good one on this machine (~8.7 us each, per the perf lane), but `perf.mts`
 *     measures the thing itself.
 *
 * ## Two verdicts, and why the gate is the second one
 *
 * **BRIEF** is the flat rule: no shot over the budget, and `--strict` reports
 * only that. It is the number that matters and it is the one printed first.
 *
 * **The ratchet** is what `check.mts` runs, and it exists because eleven shots
 * were already over on the day this was written. A gate that is red from its
 * first run is a gate people learn to skip -- RESCUE B5 records `combatloop`
 * sliding 30/30 to 21/30 unnoticed for weeks for exactly that reason -- so the
 * shots that are over are written into `project/draw-baseline.json` with the
 * count they are over at, and the rule becomes: **anything not in that file
 * must be under budget, and anything in it may only go down.** The ledger is
 * an inventory of debt, not a target; an entry that clears the budget is
 * reported as an improvement and should be deleted with `--set-baseline`, and
 * when the file is empty it should be deleted with it.
 *
 * It is the shape `floatcheck`, `silhouette` and `anycheck` already use here,
 * for the same reason.
 */
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { harnessArgs, announceBuild, shots, isHarnessFlag } from './harness.mts';
import { pageOpts } from './harness.mts';
import type { ShotResult } from './harness.mts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * A run that measured nothing, as distinct from one that measured a failure.
 *
 * `check.mts` renders this as VOID and not FAIL, which is the difference
 * between "the contract could not be read" and "the game got worse".
 */
const VOID = 3;

interface Opts {
  worst: number;
  json: string | null;
  manifest: string | null;
  out: string;
  chunk: number;
  strict: boolean;
  setBaseline: boolean;
  names: string[];
}

/**
 * The recorded over-budget set. Debt, not a target — see the header.
 *
 * `over` maps a shot to the count it is allowed to draw. Absent from the file
 * means the flat budget applies.
 */
interface Baseline { note: string; budget: number; over: Record<string, number> }

const BASELINE = path.join(ROOT, 'project', 'draw-baseline.json');

/**
 * How far a recorded shot may drift before the ratchet calls it a regression.
 *
 * Measured, not guessed: two full-corpus runs at two different builds a few
 * hours apart, with six lanes committing in between, agreed **exactly** on
 * 114 of 142 shots, and the largest increase on any shot nobody had touched
 * was **+6** (`hero_profile`, the head lane). So the count is essentially
 * deterministic and an exact ratchet would nearly work — but the eleven
 * recorded shots are town frames whose single biggest contributor is
 * `src/characters/npc/`, which another lane owns, and a gate that goes red in
 * somebody else's commit for six draw calls is a gate that gets skipped. This
 * is slack for that drift and NOT a licence to spend it: `--set-baseline`
 * exists to lower these numbers, never to raise them.
 */
const TOLERANCE = 8;

function parseArgs(argv: string[]): Opts {
  const o: Opts = {
    worst: 20, json: null, manifest: null, out: 'tmp/shots/drawcheck', chunk: 16,
    strict: false, setBaseline: false, names: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--worst') o.worst = Number(argv[++i]);
    else if (a === '--json') o.json = argv[++i];
    else if (a === '--manifest') o.manifest = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--chunk') o.chunk = Number(argv[++i]);
    else if (a === '--strict') o.strict = true;
    else if (a === '--set-baseline') o.setBaseline = true;
    // `--w`/`--h` belong to the capture and are read back out of `harnessArgs`.
    else if (a === '--w' || a === '--h') i++;
    else if (isHarnessFlag(a) === 'value') i++;
    else if (isHarnessFlag(a) === 'switch') { /* handled by harnessArgs */ }
    else if (a.startsWith('--')) throw new Error(`unknown flag ${a}`);
    else o.names.push(a);
  }
  return o;
}

/**
 * The budget, read out of `BRIEF.md` rule 3.
 *
 * Returns null when the line has moved or been reworded, which is a VOID and
 * not a pass — see the header.
 */
async function budgetFromBrief(): Promise<number | null> {
  let src: string;
  try { src = await readFile(path.join(ROOT, 'BRIEF.md'), 'utf8'); } catch { return null; }
  const m = src.match(/Draw-call\s+budget\s+is\s+\*\*(\d+)\*\*/i);
  return m ? Number(m[1]) : null;
}

/** Every shot in `Shots.ts`, in the order it is declared. */
async function listShots(): Promise<string[]> {
  const src = await readFile(path.join(ROOT, 'src/game/Shots.ts'), 'utf8');
  return [...src.matchAll(/^\s{2}([a-zA-Z0-9_]+):\s*\{/gm)].map((m) => m[1]);
}

/** `manifest.json` as `shoot.mts` writes it: one JSON line per result. */
interface Manifest { results: ShotResult[] }

const pad = (s: string | number, n: number) => String(s).padEnd(n);
const rpad = (s: string | number, n: number) => String(s).padStart(n);

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const budget = await budgetFromBrief();
  if (budget === null) {
    console.log('VOID: BRIEF.md rule 3 no longer says "Draw-call budget is **N**".');
    console.log('      The contract this gate enforces could not be read, so it did not run.');
    process.exit(VOID);
  }

  let results: ShotResult[];
  let source: string;
  if (opts.manifest) {
    // Reading a manifest someone else captured is the cheap path: `corpus.mts`
    // has already paid for the frames and they carry their own counts.
    const m = JSON.parse(await readFile(opts.manifest, 'utf8')) as Manifest;
    results = m.results;
    source = path.relative(ROOT, path.resolve(opts.manifest));
    console.log(`[drawcheck] ${results.length} shots from ${source}`);
  } else {
    // `sweep`, not `fix`: this is a corpus, and it must never starve an agent
    // waiting on one frame.
    const ha = harnessArgs(process.argv.slice(2), { lane: 'sweep' });
    announceBuild(ha);
    const names = opts.names.length ? opts.names : await listShots();
    const outDir = path.isAbsolute(opts.out) ? opts.out : path.join(ROOT, opts.out);
    await mkdir(outDir, { recursive: true });
    // In chunks, because one request for 140 shots outlives undici's 300 s
    // header deadline and fails at the client with every frame rendered --
    // the same reason `corpus.mts` talks to the daemon over raw `node:http`.
    results = [];
    const errors: string[] = [];
    for (let i = 0; i < names.length; i += opts.chunk) {
      const batch = names.slice(i, i + opts.chunk);
      // JPEG: nothing here looks at the pixels, and a 1600x900 PNG corpus is
      // gigabytes of cache for counts that live in the sidecar either way.
      const r = await shots(batch, { ...pageOpts(ha), out: outDir, jpeg: 70 });
      results.push(...r.results);
      errors.push(...r.errors);
      process.stdout.write(`  captured ${rpad(results.length, 3)}/${names.length}\r`);
    }
    process.stdout.write('\n');
    source = `${results.length} shots captured to ${path.relative(ROOT, outDir)}`;
    if (errors.length) {
      console.log(`\n${errors.length} page error(s):`);
      for (const e of errors.slice(0, 10)) console.log(`  ${e}`);
    }
  }

  if (!results.length) {
    console.log('VOID: no shots measured. A run with no frames in it is not a pass.');
    process.exit(VOID);
  }

  const rows = [...results].sort((a, b) => b.calls - a.calls);
  const over = rows.filter((r) => r.calls > budget);
  const cached = results.filter((r) => r.cached).length;

  console.log(`\nbudget ${budget} draw calls per frame (BRIEF.md rule 3)`);
  console.log(`${results.length} shots, ${cached} served from the frame cache\n`);
  console.log(`   calls   over   Mtris  shot`);
  console.log('-'.repeat(52));
  for (const r of rows.slice(0, opts.worst)) {
    const d = r.calls - budget;
    console.log(
      `${rpad(r.calls, 8)}${rpad(d > 0 ? `+${d}` : '', 7)}`
      + `${rpad((r.triangles / 1e6).toFixed(1), 8)}  ${pad(r.name, 22)}${r.cached ? ' ·' : ''}`,
    );
  }
  if (rows.length > opts.worst) console.log(`   ... ${rows.length - opts.worst} more, all under ${rows[opts.worst].calls + 1}`);

  const calls = rows.map((r) => r.calls);
  const sum = calls.reduce((a, b) => a + b, 0);
  const median = calls[Math.floor(calls.length / 2)];
  console.log('-'.repeat(52));
  console.log(`worst ${rows[0].calls} (${rows[0].name})   median ${median}   mean ${Math.round(sum / calls.length)}`);
  console.log(`headroom on the worst shot: ${budget - rows[0].calls}`);

  console.log('\nblind to: frames nobody photographs (that is `gameplay.mts`), where the');
  console.log('          calls go (wrap `renderBufferDirect` in a probe -- `traverseVisible`');
  console.log('          misses the shadow cascades and the velocity proxy scene), and cost');
  console.log('          in milliseconds (that is `perf.mts`). One posed frame per shot, on a');
  console.log('          fixed phase of the cascade refresh cycle: comparable, not average.');

  if (opts.json) {
    await writeFile(opts.json, `${JSON.stringify({ budget, results: rows }, null, 1)}\n`);
    console.log(`\nwrote ${opts.json}`);
  }

  /* ------------------------------------------------------------ the ratchet */

  if (opts.setBaseline) {
    const b: Baseline = {
      note: 'Shots that are OVER BRIEF rule 3\'s draw-call budget, and the count each is '
        + 'over at. DEBT, not a target: the flat budget applies to every shot NOT listed '
        + 'here, and a listed shot may only go DOWN. Re-run with --set-baseline only to '
        + 'LOWER these; an entry that has cleared the budget should be deleted, and when '
        + 'this file is empty it should be deleted with it, so `drawcheck` becomes the '
        + 'flat rule it is trying to be. `--strict` ignores this file entirely and is '
        + 'what says where the game really stands.',
      budget,
      over: Object.fromEntries(over.map((r) => [r.name, r.calls])),
    };
    await writeFile(BASELINE, `${JSON.stringify(b, null, 1)}\n`);
    console.log(`\nwrote ${path.relative(ROOT, BASELINE)}: ${over.length} shot(s) over ${budget}`);
    process.exit(0);
  }

  const briefLine = over.length
    ? `BRIEF: ${over.length}/${results.length} shots over ${budget}, worst +${rows[0].calls - budget}`
    : `BRIEF: every one of ${results.length} shots is under ${budget}`;

  let base: Baseline | null = null;
  if (!opts.strict) {
    try { base = JSON.parse(await readFile(BASELINE, 'utf8')) as Baseline; } catch { base = null; }
  }

  if (over.length) {
    console.log(`\nover budget — ${over.length}/${results.length} shots:`);
    for (const r of over) {
      const ceil = base?.over[r.name];
      const note = ceil === undefined ? 'NOT in the ledger'
        : r.calls > ceil ? `WORSE than the recorded ${ceil}`
          : r.calls < ceil ? `better than the recorded ${ceil}`
            : `at the recorded ${ceil}`;
      console.log(`  ${pad(r.name, 24)} ${rpad(r.calls, 5)}  (+${r.calls - budget})  ${note}`);
    }
  }
  console.log(`\n${briefLine}`);

  if (opts.strict || !base) {
    if (!opts.strict) console.log(`no ${path.relative(ROOT, BASELINE)} — the flat budget applies to everything.`);
    console.log(`\ndrawcheck: ${over.length ? 'FAIL' : 'PASS'}`);
    process.exit(over.length ? 1 : 0);
  }

  // Anything not in the ledger obeys the flat budget; anything in it may only
  // go down. A shot that has cleared the budget is an improvement to record,
  // never a failure.
  const unlisted = over.filter((r) => base.over[r.name] === undefined);
  const worse = over.filter((r) => r.calls > (base.over[r.name] ?? Infinity) + TOLERANCE);
  const cleared = Object.keys(base.over).filter((n) => {
    const r = results.find((x) => x.name === n);
    return r && r.calls <= budget;
  });
  const lowered = over.filter((r) => (base.over[r.name] ?? -1) > r.calls);

  console.log(`\nratchet, against ${path.relative(ROOT, BASELINE)}: `
    + `${Object.keys(base.over).length} shot(s) of recorded debt, ${TOLERANCE} calls of slack each`);
  if (cleared.length) console.log(`  cleared the budget outright: ${cleared.join(', ')} — drop them with --set-baseline`);
  if (lowered.length) console.log(`  improved: ${lowered.map((r) => `${r.name} ${base.over[r.name]} -> ${r.calls}`).join(', ')} — lower with --set-baseline`);

  const fails = [...unlisted, ...worse];
  if (fails.length) {
    console.log(`\ndrawcheck: FAIL — ${fails.length} shot(s) the ratchet does not allow:`);
    for (const r of fails) {
      const ceil = base.over[r.name];
      console.log(`  ${pad(r.name, 24)} ${rpad(r.calls, 5)}  ${ceil === undefined ? `over the ${budget} budget and not recorded debt` : `more than ${TOLERANCE} above its recorded ${ceil}`}`);
    }
    process.exit(1);
  }
  console.log(`\ndrawcheck: PASS — nothing new is over ${budget} and no recorded shot got worse.`);
}

await main();
