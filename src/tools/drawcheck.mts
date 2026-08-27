#!/usr/bin/env node
/**
 * Does any frame in the corpus draw more than `BRIEF.md` allows?
 *
 *   node src/tools/drawcheck.mts                    # the whole corpus
 *   node src/tools/drawcheck.mts town_wide poi_reststop
 *   node src/tools/drawcheck.mts --worst 30 --json tmp/draws.json
 *   node src/tools/drawcheck.mts --manifest tmp/shots/corpus/manifest.json
 *   node src/tools/drawcheck.mts --full                 # every shot, not just the hot set
 *   node src/tools/drawcheck.mts --no-reuse --par 1     # re-capture, one slot
 *   node src/tools/drawcheck.mts --capture              # write the frames too (slow)
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
import { writeFile, readFile, mkdir, rm } from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { harnessArgs, announceBuild, shots, isHarnessFlag } from './harness.mts';
import { pageOpts } from './harness.mts';
import type { ShotResult } from './harness.mts';
import { repoCacheDir, isDirty, shaOf } from './identity.mts';

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
  /**
   * How many chunks are in flight at once.
   *
   * This gate is the whole suite's critical path -- 269 s of a 270 s parallel
   * `check`, with every other gate finishing inside its shadow -- and it spent
   * all of it talking to ONE browser slot out of four. Four concurrent chunks
   * do not make it four times faster (the single Metal GPU binds; the bench
   * measures four browsers at 1.5x the throughput of one) but 1.5x off the
   * critical path is 1.5x off the suite.
   *
   * It does not change what is measured. Chunks were already dispatched as
   * separate `/shots` jobs that the scheduler could land on any free slot, so
   * "a contiguous run of poses on one page" was never a property this had.
   */
  par: number;
  /** Reuse a manifest this machine already captured for this exact tree. */
  reuse: boolean;
  /** True when `--chunk` was given explicitly; otherwise it is sized to `--par`. */
  chunkSet: boolean;
  /** Take the real frames too, at the old cost. Off by default; see the capture call. */
  capture: boolean;
  /** Pose every shot, not the hot set plus a rotating slice. Required to re-baseline. */
  full: boolean;
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
 * The last count anyone measured for each shot, across every tree.
 *
 * Distinct from the per-sha manifest memo, which answers "have I already run
 * this exact tree" and vanishes with the tree. This answers "how close is this
 * shot to the budget", which changes slowly and is worth carrying forward — it
 * is what lets a run pose the shots that could actually breach. Advisory by
 * construction: a wrong entry costs a shot posed or skipped for one rotation,
 * never a wrong verdict, because the verdict is computed from the counts this
 * run actually took.
 */
interface Profile { runs: number; calls: Record<string, number> }
const profilePath = (): string => path.join(repoCacheDir(), 'drawprofile.json');
function readProfile(): Profile {
  try { return JSON.parse(readFileSync(profilePath(), 'utf8')) as Profile; }
  catch { return { runs: 0, calls: {} }; }
}
function writeProfile(rows: { name: string, calls: number }[]): void {
  try {
    const p = readProfile();
    p.runs += 1;
    for (const r of rows) p.calls[r.name] = r.calls;
    writeFileSync(profilePath(), `${JSON.stringify(p)}\n`);
  } catch { /* advisory; never worth failing a gate for */ }
}

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
 *
 * A second source was the boot itself, and it is **no longer unexplained**. A
 * freshly booted page drew more than a reused one because `VehicleBody` and
 * `Player` damp their attitude and gait exponentially — asymptotically, so they
 * are still moving at the 68th frame of the first pose on a page and at rest by
 * the second — and `VelocityPass` drew a proxy for each still-moving mesh.
 * Both now implement `converge()`. `town_forecourt` went 806/786/786/786 to a
 * flat 786; `poi_reststop` and `hero_closeup` from 5 to 0.
 * See `probes/thesixty.mts`, which is the instrument that names it.
 *
 * **The live set-piece scenarios are the deliberate exception.**
 * `Director._setPieceScenario` turns the encounter loop back ON, because the
 * whole subject of those shots is a fight in progress; its own comment says the
 * capture is "of whatever the fight genuinely does N fixed steps in". So
 * `setpiece_deadeye` really does have 16 enemies on the first pose of a page
 * and 4 on later ones, and reads 579 then 514, 514, 514. That is not noise and
 * it is not a bug to fix here — making it deterministic would contradict the
 * scenario's purpose and re-baseline every combat shot, which `Director.init`
 * explicitly warns against.
 *
 * **It costs this gate nothing**, and that is worth stating rather than
 * assuming: the ratchet grades only shots that are *over budget*, and the live
 * set-pieces sit 220 calls under it with no debt entry. They enter the corpus
 * only through the rotating sixth, where they are compared against the 800
 * budget and clear it in both states. A shot that is never graded cannot be
 * graded noisily.
 */
const TOLERANCE = 8;

function parseArgs(argv: string[]): Opts {
  const o: Opts = {
    worst: 20, json: null, manifest: null, out: 'tmp/shots/drawcheck', chunk: 16,
    par: 4, reuse: true, capture: false, full: false, chunkSet: false, strict: false, setBaseline: false, names: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--worst') o.worst = Number(argv[++i]);
    else if (a === '--json') o.json = argv[++i];
    else if (a === '--manifest') o.manifest = argv[++i];
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--chunk') { o.chunk = Number(argv[++i]); o.chunkSet = true; }
    else if (a === '--par') o.par = Math.max(1, Number(argv[++i]));
    else if (a === '--no-reuse') o.reuse = false;
    else if (a === '--capture') o.capture = true;
    else if (a === '--full') o.full = true;
    else if (a === '--strict') o.strict = true;
    else if (a === '--set-baseline') { o.setBaseline = true; o.full = true; }
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
  /**
   * A corpus this machine already measured for this exact tree.
   *
   * The frames are content-addressed and shared, but the *measurement* was not:
   * every `drawcheck` re-issued 142 requests to rediscover 142 numbers that do
   * not change while the sha does not change. `check`'s gate cache covers the
   * suite path; this covers the other three -- a lane running the gate directly,
   * a second agent verifying the same commit, and `--manifest` pointed at a
   * corpus somebody else paid for.
   *
   * Keyed on the tree sha, so invalidation is free by construction, and never
   * written for a dirty build.
   */
  const sha = shaOf(harnessArgs(process.argv.slice(2)).build);
  const memo = sha ? path.join(repoCacheDir(), 'drawmanifest', `${sha}.json`) : null;
  const fullCorpus = !opts.names.length;

  if (!opts.manifest && opts.reuse && memo && fullCorpus && existsSync(memo)) {
    const m = JSON.parse(await readFile(memo, 'utf8')) as Manifest;
    results = m.results;
    source = `${results.length} shots memoised for this tree (--no-reuse to re-capture)`;
    console.log(`[drawcheck] ${source}`);
  } else if (opts.manifest) {
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
    const allNames = opts.names.length ? opts.names : await listShots();
    /**
     * POSE THE SHOTS THAT COULD BREACH, PLUS A ROTATING SLICE OF THE REST.
     *
     * This gate asserts "no shot over 800" across 142 shots, and it is the
     * suite's longest by a factor of four. Measured on the current corpus,
     * **only 9 shots are within 100 draws of the budget and only 4 are within
     * 60** — 60 being this gate's own measured run-to-run disagreement with
     * itself. The other 133 sit 100 to 600 calls below the line. Posing them
     * every commit is fifteen times more rendering than the assertion needs,
     * and rendering is the one thing this harness is short of: one Metal GPU,
     * 11 ms of submission per frame, 68 frames per pose.
     *
     * So each run poses
     *   - every shot that was within `HOT_MARGIN` of the budget last time
     *     anyone measured it,
     *   - every shot carrying a debt entry in `project/draw-baseline.json`,
     *     since those are what the ratchet actually grades, and
     *   - a rotating sixth of everything else.
     *
     * **The rotation is what makes this sound rather than merely cheap.**
     * Without it the hot set would be defined by a profile that could never go
     * stale in the one direction that matters: a shot that grew from 500 to 790
     * would never be looked at again, so it could never promote itself. With
     * it, every shot is measured at least every sixth run and a grower joins
     * the hot set on its next rotation.
     *
     * `HOT_MARGIN` is 150 — two and a half times the measured noise — rather
     * than a round number somebody liked.
     *
     * WHAT THIS TRADES, precisely: a regression that adds more than 150 draws
     * to a single cold shot is caught on that shot's next rotation rather than
     * immediately. A regression that adds draws broadly is caught at once,
     * because the hot set spans town, POI, cinematic and bestiary shots.
     * `--full` poses everything and is what a re-baseline must use.
     */
    const HOT_MARGIN = 150;
    let names = allNames;
    if (!opts.full && !opts.names.length) {
      const prof = readProfile();
      const debt = new Set(Object.keys(
        (JSON.parse(await readFile(BASELINE, 'utf8').catch(() => '{"over":{}}')) as Baseline).over ?? {},
      ));
      // An unmeasured shot is Infinity, so a cold profile poses the whole
      // corpus once and earns the right to narrow.
      const hot = allNames.filter((n) => debt.has(n) || (prof.calls[n] ?? Infinity) > budget - HOT_MARGIN);
      const cold = allNames.filter((n) => !hot.includes(n));
      if (cold.length) {
        const slice = Math.ceil(cold.length / 6);
        // Deterministic per tree where there is one, so two agents checking the
        // same commit pose the same shots and their numbers are comparable.
        const seed = sha ? (parseInt(sha.slice(0, 8), 16) || 0) : prof.runs;
        const start = (seed % Math.ceil(cold.length / slice)) * slice;
        names = [...hot, ...cold.slice(start, start + slice)];
        console.log(`[drawcheck] ${names.length}/${allNames.length} shots: ${hot.length} within `
          + `${HOT_MARGIN} of the ${budget} budget or carrying debt, plus a rotating `
          + `${names.length - hot.length} of the other ${cold.length} (--full for all)`);
      }
    }
    const outDir = path.isAbsolute(opts.out) ? opts.out : path.join(ROOT, opts.out);
    await mkdir(outDir, { recursive: true });
    // In chunks, because one request for 140 shots outlives undici's 300 s
    // header deadline and fails at the client with every frame rendered --
    // the same reason `corpus.mts` talks to the daemon over raw `node:http`.
    /**
     * ONE CHUNK PER WORKER, so a page boots once and then poses and poses.
     *
     * The default was 16, which gave 9 batches for 142 shots. Every batch is a
     * separate `/shots` job, and a job only holds its slot while it RUNS -- so
     * between batches the pooled page is free, and the other browser gates
     * (1280x720 against this tool's 1600x900) evict it from a 4-slot LRU pool.
     * The ledger is unambiguous: **12 chunk requests, 19 boots** (`boots`
     * 26 -> 45), at ~9 s each. The gate's real work is ~112 s of posing and it
     * was taking 255-318 s.
     *
     * Sized to `par` rather than fixed, so the arithmetic cannot drift: N
     * workers, N requests, N boots, and each worker poses its whole share on
     * one page. `--chunk` still overrides for anyone bisecting a bad batch.
     *
     * The old 16 was justified by undici's 300 s header deadline, and that
     * reason is stale -- `call()` in daemon.mts is raw `node:http` with a
     * 45-minute socket-idle timeout, precisely so a long sweep can queue. A
     * 36-shot request is ~31 s of posing.
     *
     * The cost is blast radius: a batch that fails VOIDs the run either way
     * (`drawcheck.mts` does that on purpose), but a bigger batch loses more
     * work when it does. That is the trade, and it is worth ~130 s.
     */
    /**
     * A FIXED 16, not one chunk per worker.
     *
     * Sizing the chunk to `--par` looked like a free win — fewer round trips,
     * fewer pooled acquisitions — and it is a 3 s loss that damages the
     * measurement. Each chunk boundary is the run's only state barrier: a
     * pooled acquisition runs `resetPage -> GAME.reset()`. One chunk per worker
     * takes the maximum shots-posed-on-one-page from 16 to 36, which stretches
     * the documented wind-phase drift (LANDMINES.md: windStrength 0.840 ->
     * 0.944 by a page's sixth shot) across more than twice the run, against a
     * draw tolerance of 8. The gate already disagrees with itself by up to 60
     * calls; this makes the accumulation it is made of worse to buy 3 s.
     */
    const chunk = opts.chunk;
    const batches: string[][] = [];
    for (let i = 0; i < names.length; i += chunk) batches.push(names.slice(i, i + chunk));
    const byBatch: ShotResult[][] = batches.map(() => []);
    const errors: string[] = [];
    let done = 0;
    let next = 0;
    /**
     * `opts.par` workers pulling from one list of chunks.
     *
     * Results are written back BY INDEX rather than pushed, so the report is in
     * declaration order however the chunks finish -- the tables below sort, but
     * the JSON dump and the progress counter should not depend on scheduling.
     */
    const capture = async (): Promise<void> => {
      for (;;) {
        const i = next++;
        if (i >= batches.length) return;
        const batch = batches[i];
        try {
          // JPEG: nothing here looks at the pixels, and a 1600x900 PNG corpus
          // is gigabytes of cache for counts that live in the sidecar anyway.
          /**
           * COUNTS, NOT PICTURES. This gate reads `renderer.info.render.calls`
           * and has never looked at a pixel, but it was paying for the whole
           * capture path -- 251 s of a 273 s `pnpm run check`, which made the
           * suite one gate wearing a suite's clothes.
           *
           * `countsOnly` drops the screenshot entirely and stops submitting the
           * sixty settle frames. `probes/posecost.mts` validated it A/B/A across
           * **all 142 shots**: 5.71x (122.6 s -> 21.5 s) with zero hard
           * mismatches. Ten shots disagreed and all ten are shots whose own two
           * full arms disagree with each other.
           *
           * `--capture` restores the old path for when the frames themselves are
           * wanted -- the results are not cacheable as frames, because a pose
           * without its settle drawn is not the picture `shoot` produces.
           */
          const r = await shots(batch, {
            ...pageOpts(ha), out: outDir, jpeg: 70, countsOnly: !opts.capture,
          });
          byBatch[i] = r.results;
          errors.push(...r.errors);
          done += r.results.length;
          process.stdout.write(`  captured ${rpad(done, 3)}/${names.length}\r`);
        } catch (e) {
          // VOID, not FAIL. A corpus takes minutes, and in that window the
          // trunk moves under it: this run died once with a bare Node stack
          // because the daemon pruned the sha tree it was serving while six
          // lanes were committing. `LANDMINES.md` already records two gate
          // failures that were the harness rather than the code, and a red row
          // in `check`'s table is how they cost two lanes an investigation
          // each. So a capture that never happened says so, in those words,
          // and does not pretend to be a measurement.
          console.log(`\n\nVOID: the capture failed on batch ${i + 1} `
            + `(${batch[0]}..${batch[batch.length - 1]}) after ${done} shots.`);
          console.log(`  ${String((e as Error).message || e).split('\n')[0]}`);
          console.log('  This is the harness, not the game. Check `daemon.mts --health` and');
          console.log('  `cleanup.mts`, then re-run; frames already taken are in the cache.');
          process.exit(VOID);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(opts.par, batches.length) }, capture));
    process.stdout.write('\n');
    results = byBatch.flat();
    source = opts.capture
      ? `${results.length} shots captured to ${path.relative(ROOT, outDir)}`
      : `${results.length} shots posed for counts only — no frames written (--capture for those)`;
    if (errors.length) {
      console.log(`\n${errors.length} page error(s):`);
      for (const e of errors.slice(0, 10)) console.log(`  ${e}`);
    }
    // Memoise only a COMPLETE capture of an IMMUTABLE tree. A partial corpus
    // replayed as a whole one would report a pass over shots nobody measured.
    if (memo && fullCorpus && names.length === allNames.length
        && !isDirty(ha.build) && results.length === names.length && !errors.length) {
      await mkdir(path.dirname(memo), { recursive: true });
      await writeFile(memo, `${JSON.stringify({ results })}\n`);
    }
  }

  if (!results.length) {
    console.log('VOID: no shots measured. A run with no frames in it is not a pass.');
    process.exit(VOID);
  }
  // Carry what we just measured forward, so the next run knows which shots are
  // near the line. Advisory — see `Profile`.
  writeProfile(results);

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
    /**
     * **An empty ledger is deleted, not written empty.** The note above has
     * said so since the file was created, and leaving a `{"over": {}}` behind
     * would be a debt file that reads as debt while asserting none — the exact
     * shape of stale document this repo keeps having to trim. The read path
     * already treats a missing file as "the flat budget applies to everything"
     * and says so out loud, so deleting it is the state the gate is designed
     * for rather than a case it merely tolerates.
     */
    if (!over.length) {
      await rm(BASELINE, { force: true });
      console.log(`\nno shot is over ${budget}: removed ${path.relative(ROOT, BASELINE)}`
        + ' — the flat rule now applies to every shot, with no recorded debt.');
      process.exit(0);
    }
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
