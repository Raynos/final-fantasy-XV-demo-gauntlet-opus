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
 *   node src/tools/check.mts --no-cache   # re-derive verdicts this tree already has
 *   node src/tools/check.mts --serial     # one at a time, the old behaviour
 *   node src/tools/check.mts --set-baseline   # re-record the suite's own time
 *
 * `--perf` is opt-out by default on purpose: **a perf number taken while agents
 * are running is meaningless.** Six or more headless Chromiums saturate the
 * machine. Pass it only on a quiet tree.
 *
 * ## Three things make this fast, and each closes a specific hole
 *
 * **A cache keyed on the tree sha** (`gatecache.mts`). Eighteen gates are a
 * pure function of the tree they read, and this ran all of them every time —
 * so the second `check` on an unchanged tree cost thirteen minutes to re-derive
 * a known fact. Only a PASS on a clean tree is stored; see that file for why.
 *
 * **Two pools instead of one queue.** The old loop was one `await` per child,
 * strictly serially, while four browser slots sat idle. The browser gates are
 * ~6 minutes of mostly *waiting* and the CPU gates are ~40 seconds of mostly
 * *computing*; run each set in its own pool, longest-first, and the suite is
 * bounded by its longest single gate rather than by their sum. The suite goes
 * on the daemon's **sweep** lane (`HARNESS_LANE`), so an agent waiting on one
 * shot still overtakes it.
 *
 * **A ratchet on its own wall time** (`project/check-baseline.json`). The suite
 * grew 9 -> 13 minutes with everyone watching gates pass, because nothing
 * metered the meter. A cold, quiet, uncached run now compares itself against
 * its recorded time and FAILS on a regression past tolerance. A new gate joins
 * the roster by paying its row.
 *
 * `PORT` is honoured and forwarded; the capture daemon takes `PORT+1`.
 */
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { call, ensureDaemon } from './daemon.mts';
import type { HealthResponse, WaitResponse } from './daemon.mts';
import { inputsKey, lookup, store, prune } from './gatecache.mts';
import { appendJob } from './ledger.mts';
import { resolveBuild, shaOf, workingTreeDirty } from './identity.mts';
import { powerState, powerWarning } from './power.mts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
/** The local vite binary. Never `npx`/`pnpm dlx`: those can fetch from the network. */
const VITE = path.join(ROOT, 'node_modules/.bin/vite');

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
   * Which pool it belongs to.
   *
   * `browser` means it takes a daemon page or a frame — its cost is mostly
   * waiting on one of four browser slots, so four of them overlap almost for
   * free. `cpu` means bare Node building terrain or trees in process, where
   * overlapping past a handful only makes each one slower.
   */
  kind: 'cpu' | 'browser';
  /**
   * Measured quiet-machine seconds, from `project/TIMINGS.md`.
   *
   * Used only to order the pools longest-first, which is what makes a pool of
   * four finish in `max(longest, sum/4)` rather than in `sum`. Being wrong
   * costs a little scheduling, never a wrong verdict.
   */
  cost: number;
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
  /**
   * This gate never takes a screenshot, so it may run in TURBO.
   *
   * `grep -c screenshot` over the play gates returns **zero** for `integration`,
   * `uxcheck`, `combatloop`, `reachcheck`, `floatcheck` and `driftcheck`: they
   * drive real input and then assert on game STATE. Every frame they submit is
   * composited and thrown away, and `probes/turbocost.mts` prices submission at
   * **95% of a stepped frame** (11.0 of 11.66 ms; the simulation is 0.58 ms).
   *
   * `HARNESS_TURBO` makes the daemon submit one frame in N on their leased page.
   * The validation is each gate's OWN assertion — these report exact counts
   * (93/93, 31/31, 27 pass), which is a sharper check than any frame diff, and
   * `HARNESS_TURBO=0` turns it off to confirm a verdict does not depend on it.
   *
   * `creaturecheck` is deliberately absent, but NOT because it screenshots --
   * `grep -n screenshot src/tools/creaturecheck.mts` finds only a doc comment.
   * It drives `enemies.update(1/60, g)` directly and never submits a frame at
   * all, so there is nothing for turbo to ablate.
   */
  pixelBlind?: boolean;
  /**
   * The flag that defeats this gate's own cache, if it keeps one.
   *
   * `drawcheck` memoises a whole corpus per tree sha, which the suite's gate
   * cache knows nothing about — so `--no-cache` re-derived seventeen gates and
   * served the eighteenth from storage in 0.3 s against ~250 s of real work,
   * and called the run cold.
   */
  ownCacheFlag?: string;
  /**
   * This gate is NOT a pure function of the tree, so its verdict may never be
   * cached.
   *
   * The gate cache's whole premise is that a gate reads the tree and nothing
   * else, so a verdict recorded against a tree sha stays true until the tree
   * moves. `bakecheck` reads `src/public/baked/`, which is git-ignored, shared
   * between every worktree on the machine, and rewritten by any co-agent's
   * `vite build`. A cached PASS would therefore survive exactly the event the
   * gate exists to catch: someone prunes `geo.bin.gz`, the tree has not moved,
   * and the suite replays yesterday's green.
   */
  uncacheable?: boolean;
}

/** Ordered cheapest-first; the pools re-sort by `cost`, this order is for reading. */
const GATES: Gate[] = [
  { name: 'build', cmd: VITE, args: ['build'], expect: 'builds', kind: 'cpu', cost: 0.8 },
  { name: 'anycheck', script: 'anycheck.mts', expect: '0 `any`', kind: 'cpu', cost: 0.2 },
  /**
   * The four caches of our own generators under `src/public/baked/`, which
   * twenty-three gates looked straight past.
   *
   * `project/LANDMINES.md` §"Baked caches": **a stale texel bake is the one
   * cache failure with no symptom** — the keys resolve, the page boots, every
   * gate here passes, and the world renders with a previous generator's output.
   * A stale GEOMETRY bake is sharper still, because what it serves is
   * *well-formed*: a viaduct correctly wound, contract-clean, standing in the
   * air over a heightfield that moved. That section ends "nothing in this repo
   * can see that". This is the something.
   *
   * It also gates the two artifacts that go missing rather than stale.
   * `texc.bin.gz` and `geo.bin.gz` need a browser to record and the vite plugin
   * only has a server, so all the plugin can do with a stale one is delete it —
   * which any co-agent's `pre-commit` does. `daemon.mts --health` warned and
   * nothing failed, and on the night this landed both had been absent for
   * hours, costing ~3.7 s of cold boot per load, while a first-load number was
   * being quoted from a cache nobody had looked at. `--allow-cold` is the
   * escape if a wave of lanes makes that unmanageable; the default is strict
   * and the remedy is one command, `pnpm run build:full`.
   *
   * 9 ms measured, which is what a gate has to cost to survive: it stats four
   * files and hashes ~50 source files. `uncacheable`, because the bake
   * directory is git-ignored and shared and the tree sha says nothing about it.
   */
  {
    name: 'bakecheck', script: 'bakecheck.mts', kind: 'cpu', cost: 0.1, uncacheable: true,
    expect: 'terrain/tex/texc/geo present and matching their own sources',
  },
  { name: 'orphans', script: 'orphans.mts', expect: 'every module reachable', kind: 'cpu', cost: 0.2 },
  // Bare Node, ~3 s: it grows the trees and the bestiary in process and
  // compares outlines. A ratchet like `anycheck` -- it fails on a NEW pair of
  // meshes sharing one silhouette, not on the debt recorded in
  // `project/silhouette-baseline.json`.
  { name: 'silhouette', script: 'silhouette.mts', expect: 'no new collapsed silhouettes', kind: 'cpu', cost: 5.6 },
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
    kind: 'cpu', cost: 14.1,
  },
  // Winding, orientation and attribute asserts over every generator bare Node
  // can build. Five controls with known answers run first and the tool exits
  // VOID rather than PASS if any comes back wrong.
  {
    name: 'geocheck', script: 'geocheck.mts', kind: 'cpu', cost: 1.1,
    expect: '0 non-finite, 0 bad indices, no new edge-parity imbalance',
  },
  // Bare Node too, but it builds the field, so ~20 s. Two claims in
  // `Terrain.erosionAt`'s contract -- every channel is a percentile, and the
  // hot cells form a network rather than a haze -- each against its own
  // control, including the checkerboard that says whether the instrument is
  // saturated.
  {
    name: 'hydrocheck', script: 'hydrocheck.mts', kind: 'cpu', cost: 13.6,
    expect: 'percentile medians, and lift over the shuffled null',
  },
  // 26 pass + 1 WIRED under turbo: the weapon-swap probe stands itself down
  // rather than passing on frames it knows were never submitted. See its comment.
  { name: 'integration', pixelBlind: true, gate: true, script: 'integration.mts', expect: '26 pass, 1 wired, 0 fail', kind: 'browser', cost: 45 },
  { name: 'uxcheck', pixelBlind: true, gate: true, script: 'uxcheck.mts', expect: '95/95', kind: 'browser', cost: 60 },
  { name: 'touchcheck', pixelBlind: true, gate: true, script: 'touchcheck.mts', expect: '20/20', kind: 'browser', cost: 14 },
  // Asserts the Game Studio boots no game: 0 systems for models, exactly the
  // EIGHT geometry ones for the world, and no character object in either scene.
  // An architecture is a claim, and an unmeasured claim rots.
  //
  // It also drives the phone shell under a real iPhone descriptor -- the drill
  // down and back out, the 44 px floor, the landscape gate, and whether a drag
  // in the middle of the viewport reaches the gesture catcher. That half opens
  // its own browser, so this row is dearer than a lease-only gate.
  //
  // **The expect string said `8/8` while the gate ran 22 assertions**, which is
  // the exact failure mode `check.mts` exists to stop: a second copy of a count,
  // kept somewhere else, quietly disagreeing. It grew from 8 to 22 across the
  // studio v3 lanes and nothing updated it, so the suite would have passed a
  // gate that had lost fourteen of its assertions.
  { name: 'studiocheck', pixelBlind: true, gate: true, script: 'studiocheck.mts', expect: '22/22', kind: 'browser', cost: 40 },
  { name: 'devicecheck', pixelBlind: true, gate: true, script: 'devicecheck.mts', expect: '10/10', kind: 'browser', cost: 12 },
  { name: 'creaturecheck', gate: true, script: 'creaturecheck.mts', expect: '207 poses, 0 failures', kind: 'browser', cost: 17 },
  { name: 'combatloop', pixelBlind: true, gate: true, script: 'combatloop.mts', expect: '35/35', kind: 'browser', cost: 45 },
  { name: 'roadcheck', gate: true, script: 'roadcheck.mts', expect: '0 failures', kind: 'cpu', cost: 7.6 },
  // The only gate in this suite that scores a **rendered face**. Every other
  // head instrument here -- `headprop`, `headprofile`, `brushsurvive`,
  // `hairstand` -- reads the position buffer, and three lanes in a row have now
  // moved those numbers into their adult bands while the picture got worse.
  // head-r3 measured the gap: 8 mm of added lip relief moved the *rendered*
  // mouth by 1 of 255. So this one renders the face at 0.55 m and asks the
  // image whether there is a mouth on it. NOT pixelBlind, obviously.
  { name: 'facecheck', gate: true, script: 'facecheck.mts', expect: 'a mouth and a nose read in the frame', kind: 'browser', cost: 30 },
  // Is every shot a *picture*? On 2026-08-31 eleven of them were pure white
  // rectangles and thirty more carried a white veil, and this suite was 20/20
  // through all of it: a blown frame is not a page error, does not move a draw
  // count, and against a baseline blown the same way is not even a pixel diff.
  // The same hole let a GLSL link failure blank every capture in the repo for
  // forty minutes, and a `GradePass` that would not compile turn every frame
  // black before that. Three occurrences, one missing gate. Reads the default
  // framebuffer for what a reader would see and `rtScene` for the radiance that
  // produced it, so it also says whether the scene or the post chain is at
  // fault. Subsumes `probes/nanscan.mts` at no extra read. NOT pixelBlind --
  // it is the one gate here whose entire subject is the pixels.
  { name: 'framecheck', gate: true, script: 'framecheck.mts', expect: '166 shots, none blown or blank', kind: 'browser', cost: 360 },
  // Does the code *run*? `orphans` proves a module is reachable from `main.ts`;
  // six systems passed that and never executed. See `reachcheck.mts`.
  { name: 'reachcheck', pixelBlind: true, script: 'reachcheck.mts', expect: 'every must-run path executes', kind: 'browser', cost: 49 },
  // `proudOf` over the final instance matrices, across the whole POI corpus
  // (every site force-built in one boot) and every live rock/debris instance.
  // A ratchet: the counts may not go up. See `project/float-baseline.json`.
  // NOT pixelBlind: `floatcheck` contains zero `g.frame(` calls and one
  // `settle(30)`, and the ledger says so -- 10.3 s before turbo, 9.2 / 9.1 s
  // after, of which 7.7 s is the lease. The flag bought under a third of a
  // second and asserted a turbo validation this gate's coverage cannot support.
  { name: 'floatcheck', script: 'floatcheck.mts', expect: 'nothing new floats or is buried', kind: 'browser', cost: 10.5 },
  // No browser and no server: the horizon sweep and its brute-force reference
  // are both plain arithmetic, so this runs in a second and belongs among the
  // cheap gates.
  {
    name: 'horizoncheck', script: 'horizoncheck.mts', kind: 'cpu', cost: 0.3,
    expect: 'MCC >= 0.85, or <= 1% disagreement, vs the ray march',
  },
  // These two do NOT spawn a server; they assume one is already up. Everything
  // else starts its own, and `strictPort` means a pre-started vite on the same
  // port would break those -- so they get a dedicated one, scanned for below.
  { name: 'heightcheck', script: 'heightcheck.mts', expect: '0.000 m GPU vs CPU', needsServer: true, kind: 'browser', cost: 9.3 },
  { name: 'driftcheck', pixelBlind: true, script: 'driftcheck.mts', expect: 'within tolerance', needsServer: true, kind: 'browser', cost: 37.8 },
  // BRIEF rule 3's draw-call budget, over the whole corpus. A ratchet: the
  // eleven shots that were already over are recorded in
  // `project/draw-baseline.json` and may only go down; everything else obeys
  // the flat 800. Frames come from the cache on a build anyone has already
  // shot, which is why it sits here and not with the perf gates. It is the
  // suite's longest single gate, so the pool starts it first.
  // `--par 2`, NOT the standalone default of 4, and the difference is measured.
  // Alone, four concurrent chunks take this gate 269 s -> 120 s. Inside the
  // suite there are only four browser slots in total, so four chunks starve
  // every other browser gate and the SUITE gets slower even though the gate
  // gets faster: 242 s for drawcheck and a longer tail behind it, against a
  // 270 s suite when it ran one chunk at a time. Two is the split that keeps
  // half the pool for everyone else.
  {
    name: 'drawcheck', kind: 'browser', cost: 200,
    /**
     * `--no-reuse` under `--no-cache`, because otherwise the flag lies.
     *
     * `drawcheck` memoises a whole corpus per tree sha (`drawmanifest/`), which
     * is a second cache the suite's own `--no-cache` knew nothing about. A
     * `check --no-cache` therefore re-derived seventeen gates and served the
     * eighteenth from a stored manifest -- in **0.3 s**, against ~250 s of real
     * work -- and reported the run as cold. Anyone re-checking a red drawcheck
     * the documented way was reading the answer it had already given.
     */
    args: [path.join(HERE, 'drawcheck.mts'), '--par', '2'],
    ownCacheFlag: '--no-reuse',
    expect: 'no new shot over BRIEF\'s 800, no recorded shot worse',
  },
  { name: 'perf', script: 'perf.mts', expect: '60 fps', perf: true, kind: 'browser', cost: 780 },
  { name: 'gameplay', script: 'gameplay.mts', expect: '60 fps under real input', perf: true, kind: 'browser', cost: 360 },
  /**
   * The only gate that watches the LOAD rather than a frame.
   *
   * Every other gate here starts from a page that has already booted, so the
   * eight seconds before `GAME.ready` were unobserved by all nineteen of them.
   * Measured (`docs/BOOT_PERF.md`): that load used to arrive as **two** long
   * tasks, the worst 7961 ms, with 96% of it unable to paint or take a click —
   * a completely frozen tab, invisible to the whole suite.
   *
   * `perf: true` because it launches its own browser under the exclusive lease
   * (the navigation *is* the measurement, exactly as for `bootprof`), so it
   * must not run beside the pooled browser gates.
   */
  {
    name: 'bootblock', pixelBlind: true, perf: true, kind: 'browser', cost: 90,
    args: [path.join(HERE, 'coldload.mts'), '--prod', '--gate'],
    expect: 'the boot yields; no multi-second freeze; first visit inside its transfer budget',
  },
  /**
   * What a page costs when nobody is touching it.
   *
   * `perf.mts` steps frames by hand and times the main thread, so it can see
   * neither the frame RATE a free-running page chooses nor the CPU the GPU
   * process spends. An idle tab at 96–105% of a core was invisible to all
   * nineteen gates and to both perf gates, by construction.
   *
   * The load-bearing assertion is the `stopped` arm: with the rAF loop
   * cancelled and nothing else changed, the page costs 0.5–2.4% of a core. A
   * `setInterval`, a poll, or a converge loop that stops reporting finished
   * lands there and nowhere else in this suite.
   */
  {
    name: 'idlecpu', pixelBlind: true, perf: true, kind: 'browser', cost: 60,
    args: [path.join(HERE, 'idlecpu.mts'), '--q', 'high', '--gate'],
    expect: 'nothing runs when the loop is stopped; one frame inside its whole-browser CPU budget',
  },
];

function parse(argv: string[]) {
  const o = {
    perf: false, only: null as string[] | null, gate: false,
    cache: true, serial: false, setBaseline: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--perf') o.perf = true;
    else if (argv[i] === '--gate') o.gate = true;
    else if (argv[i] === '--no-cache') o.cache = false;
    else if (argv[i] === '--serial') o.serial = true;
    else if (argv[i] === '--set-baseline') o.setBaseline = true;
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
      cwd: ROOT, env: { ...process.env, PORT: String(port) },
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
/**
 * "The machine was somebody else's", as distinct from either of the above.
 *
 * `EXIT_BUSY` in `harness.mts`. The two perf gates take the daemon's exclusive
 * lease, which now QUEUES behind a live page lease rather than closing it — so
 * a refusal means a probe is mid-run, and rendering that as FAIL would be the
 * same lie VOID exists to prevent, one cause further out.
 */
const BUSY = 4;

function verdict(code: number | null): string {
  if (code === 0) return 'PASS';
  if (code === VOID) return 'VOID';
  return code === BUSY ? 'BUSY' : 'FAIL';
}

interface Result {
  gate: Gate; code: number | null; ms: number; tail: string; cached: boolean;
  /**
   * The last few lines in full, kept only for a gate that did not pass.
   *
   * `tail` is two lines clipped to 110 characters — right for a PASS row, and
   * useless for the thing that actually goes wrong here, which is a Node stack
   * whose first line names the cause. `LANDMINES.md` records two separate lanes
   * investigating a gate that was not failing but never running, because all the
   * table could show was `at process.processTicksAndRejections`. Printing six
   * lines under the summary costs nothing on a green run and is the difference
   * between "the terrain regressed" and "the browser was closed".
   */
  excerpt?: string;
}

function run(gate: Gate, env: NodeJS.ProcessEnv): Promise<Result> {
  return new Promise((resolve) => {
    const cmd = gate.cmd || process.execPath;
    const args = gate.args || (gate.script ? [path.join(HERE, gate.script)] : []);
    const t0 = Date.now();
    let out = '';
    const p = spawn(cmd, args, { env: env || process.env, cwd: ROOT });
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => {
      const lines = out.trim().split('\n').filter(Boolean);
      resolve({
        gate, code, ms: Date.now() - t0, cached: false,
        tail: lines.slice(-2).join(' | ').slice(0, 110),
        excerpt: code === 0 ? undefined : lines.slice(-8).join('\n'),
      });
    });
    p.on('error', (e) => resolve({ gate, code: 127, ms: Date.now() - t0, tail: String(e.message), cached: false }));
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

// ------------------------------------------------------------- what this run is

/**
 * What this run is about — per gate, and by content rather than by commit.
 *
 * This used to be one tree sha for the whole suite, null on a dirty tree. Both
 * halves of that were costing more than they bought. **84 of the last 120
 * commits here touch no game code at all** — 52 docs or config, 32 the harness
 * — and each of them re-derived all eighteen gates because the sha had moved
 * for reasons no gate could see. And the null-on-dirty rule turned the cache
 * off for the entire edit-check loop it exists to shorten.
 *
 * `inputsKey` hashes the bytes each gate actually reads: the game, that gate's
 * own tool, the daemon and harness for browser gates, the baselines, the root
 * config, the argv. See `gatecache.mts` for what is deliberately excluded and
 * the staleness that trades against.
 */
// NOT gated on `opts.cache`: `--no-cache` means do not TRUST a stored verdict,
// not do not RECORD one. The first version conflated them, so the documented way
// to re-derive a suite also threw the fresh answers away and left the next run
// cold — which is the one run that had every right to be warm.
const keyOf = (g: Gate): string | null => (g.uncacheable ? null : inputsKey(g));
/** Only for the ratchet and the ledger, which are about a commit, not a verdict. */
const treeSha = workingTreeDirty() ? null : shaOf(resolveBuild('HEAD'));
/**
 * What else is on this machine, asked rather than inferred.
 *
 * Null when no daemon is running, which is itself the quietest answer there is.
 */
async function machineState(): Promise<HealthResponse | null> {
  try { return await call<HealthResponse>('/health', undefined, { timeout: 5_000 }); }
  catch { return null; }
}
/**
 * `--set-baseline` waits for the machine before it measures it.
 *
 * The ratchet only grades a quiet run, and the moment you most want to record a
 * new budget is right after a commit — which is exactly when `post-commit`'s
 * prewarm is booting a page. Refusing at that moment is correct and useless.
 *
 * So the tool uses the primitive it tells everyone else to use, instead of
 * making the caller notice, guess and re-run. This is what `--wait` is for.
 */
if (process.argv.includes('--set-baseline')) {
  await ensureDaemon().catch(() => false);
  const w = await call<WaitResponse>('/wait', { what: 'quiet', forMs: 300_000 }, { timeout: 360_000 })
    .catch(() => null);
  if (w && !w.ok) console.log(`  waited ${(w.waitedMs / 1000).toFixed(0)}s for a quiet box — ${w.why}\n`);
  else if (w && w.waitedMs > 1000) console.log(`  quiet after ${(w.waitedMs / 1000).toFixed(1)}s\n`);
}

const health = await machineState();

/**
 * Was the machine quiet? Provenance for the cache and the ratchet, not a gate.
 *
 * Load average alone is a blunt instrument and it was the only one available
 * before the daemon kept a ledger. Now the daemon can be *asked*: a live page
 * lease, a busy worker or a held quiet lane each mean somebody else is on this
 * box, and each is a fact rather than an inference from a number that also
 * moves when the OS indexes a disk.
 *
 * `TIMINGS.md` records the same gates running a third faster on a quiet box, so
 * a suite time without this stamp is not a number anyone can compare — which is
 * exactly why the ratchet below refuses to grade a run that was not quiet.
 */
/**
 * ...and the MACHINE has to be steady, not just idle.
 *
 * Load average says nothing about a laptop on battery, in Low Power Mode, or
 * thermally throttled — all of which change the clocks under a five-minute
 * four-chromium run. The ratchet grades wall time, so a run whose machine was
 * drifting must not set or blow a budget. `power.mts` carries the receipts.
 */
const power = powerState();
const quiet = os.loadavg()[0] < os.cpus().length / 3
  && !(health && (health.workers.busy || health.leases.length || health.exclusive))
  && power.steady;

const auxPort = await freePort(basePort + 50);
/**
 * Held in a box, not a `let`.
 *
 * `ensureAux()` is the only writer and it is a function, so TypeScript's
 * control-flow analysis narrows the bare `let` to `null` at every later use and
 * `aux.kill()` fails to compile. A one-field holder is the honest way to say
 * "this is written from somewhere else".
 */
const aux: { p: ChildProcess | null } = { p: null };
/** Why the aux server failed, if it did. Reported, never swallowed. */
let auxError: string | null = null;

async function ensureAux(): Promise<void> {
  // Do NOT swallow this. The comment that used to sit here said the gate would
  // report it; the gate cannot -- it does not start a server, so all it can do
  // is fail to connect and die with a Node stack, which reads in this table as
  // a terrain regression. Two separate lanes went and investigated heightcheck
  // before noticing it passes standalone.
  if (aux.p || auxError) return;
  try { aux.p = await serve(auxPort); } catch (e) { auxError = String((e as Error).message || e); }
}

const t0 = Date.now();
const results: Result[] = [];
const width = Math.max(...todo.map((g) => g.name.length)) + 2;

function report(r: Result): void {
  const mark = r.cached ? 'cached' : `${(r.ms / 1000).toFixed(1)}s`;
  process.stdout.write(`  ${r.gate.name.padEnd(width)}${verdict(r.code)}  ${mark.padStart(7)}  ${r.tail}\n`);
}

/**
 * Run one gate: cache, then aux server, then the child — and record all three.
 *
 * The ledger line is what makes the suite's own cost visible next to every
 * other harness job, which is the whole of "nothing metered the meter".
 */
async function runGate(g: Gate): Promise<Result> {
  const key = keyOf(g);
  if (opts.cache && key !== null) {
    const hit = lookup(g.name, key);
    // A measurement is not an assertion: a perf verdict taken on a busy box
    // says nothing about a quiet one, so it never replays as a pass.
    if (hit && !(g.perf && !hit.quiet)) {
      const r: Result = { gate: g, code: 0, ms: hit.ms, tail: hit.tail, cached: true };
      results.push(r);
      report(r);
      return r;
    }
  }
  let env = process.env;
  if (g.needsServer) {
    await ensureAux();
    if (auxError) {
      const r: Result = {
        gate: g, code: 1, ms: 0, cached: false,
        tail: `aux server on ${auxPort} never came up: ${auxError}`,
      };
      results.push(r);
      report(r);
      return r;
    }
    env = { ...process.env, PORT: String(auxPort) };
  }
  /**
   * A gate with a cache of its OWN has to be told, or `--no-cache` is a lie.
   *
   * Named per gate rather than appended to whatever has `args`, because the
   * first version of this did the latter and turned `check --no-cache` into
   * `vite build --no-reuse` — the build gate died on an unknown option inside
   * three minutes. Every tool here rejects a flag it does not know, correctly,
   * so a flag may only go to a gate that asked for it.
   */
  // `--set-baseline` defeats it too: a budget recorded from a run that served a
  // memo would enshrine 0.3 s as the cost of 142 poses, and every later run
  // would blow a ratchet set by a number nobody paid.
  const gate = (opts.cache && !opts.setBaseline) || !g.ownCacheFlag
    ? g
    : { ...g, args: [...(g.args ?? [path.join(HERE, g.script!)]), g.ownCacheFlag] };
  const started = Date.now();
  const r = await run(gate, {
    ...env,
    // One frame in ten on the gates that never look. Ten is the largest ratio
    // `probe.mts --turbo` measured byte-identical on `longplay`; the gates'
    // own exact counts are the check that it holds for them too.
    ...(g.pixelBlind ? { HARNESS_TURBO: '10' } : {}),
    // The suite is throughput work by definition: an agent waiting on one shot
    // must overtake it. `HARNESS_LANE` reaches nine tools' hand-rolled parsers
    // without touching any of them.
    HARNESS_LANE: 'sweep',
    HARNESS_AGENT: `check:${g.name}`,
  });
  results.push(r);
  report(r);
  // A null key means "this verdict is not a fact about the tree". Recording it
  // under the empty string would let the next null-keyed gate read it back.
  if (key !== null) {
    store({
      gate: g.name, sha: key, code: r.code ?? 1, ms: r.ms, tail: r.tail,
      at: new Date().toISOString(), quiet, loadavg: Number(os.loadavg()[0].toFixed(2)),
    });
  }
  appendJob({
    t: new Date().toISOString(),
    kind: `gate:${g.name}`,
    agent: 'check',
    lane: 'sweep',
    build: treeSha ? `sha:${treeSha.slice(0, 12)}` : 'dirty',
    queuedMs: 0,
    ranMs: Date.now() - started,
    // A red gate is a RESULT, not a harness fault. Conflating them is what made
    // the ledger read 4.5% errors on an evening whose real fault rate was 0.7%.
    verdict: r.code === 0 ? 'ok'
      : r.code === VOID ? 'void'
        : r.code === BUSY ? 'busy'
          : 'fail',
    note: verdict(r.code),
  });
  return r;
}

/** Run `gates` at most `limit` at a time, longest-first. */
async function pool(gates: Gate[], limit: number): Promise<void> {
  const queue = [...gates].sort((a, b) => b.cost - a.cost);
  const workers = Array.from({ length: Math.max(1, Math.min(limit, queue.length)) }, async () => {
    for (;;) {
      const g = queue.shift();
      if (!g) return;
      await runGate(g);
    }
  });
  await Promise.all(workers);
}

// ------------------------------------------------------------------- the run

const busyWhy = health && health.exclusive ? `quiet lane held by ${health.exclusive}`
  : health && health.leases.length ? `${health.leases.length} lease(s) live`
    : health && health.workers.busy ? `${health.workers.busy} daemon worker(s) busy`
      : !power.steady ? power.label
        : `load ${os.loadavg()[0].toFixed(1)}`;
const pw = powerWarning();
if (pw) console.log(`  ${pw}\n`);
console.log(`  ${treeSha ? `tree ${treeSha.slice(0, 12)}` : 'dirty tree (cached by content, not by commit)'}`
  + `  ·  ${quiet ? 'quiet' : `busy (${busyWhy})`}`
  + `  ·  ${opts.serial ? 'serial' : 'parallel'}\n`);

/**
 * `build` first and alone: it is 0.8 s and it is the fail-fast.
 *
 * A broken build makes every other gate fail in its own confusing way — a
 * `waitForFunction` timeout, a Node stack in the middle of a table — so paying
 * one second to turn eighteen mystery failures into one honest one is the
 * cheapest trade in this file.
 */
const buildGate = todo.find((g) => g.name === 'build');
if (buildGate) {
  const r = await runGate(buildGate);
  if (r.code !== 0) {
    console.log('\n  build failed — the rest of the suite would only fail in more confusing ways.');
    console.log(`  failing: build (expected ${buildGate.expect})`);
    process.exit(1);
  }
}

const rest = todo.filter((g) => g.name !== 'build');

/**
 * Settle the daemon BEFORE the pools start, never during them.
 *
 * `ensureDaemon()` stops a daemon whose `PROTOCOL` differs from the client's —
 * correctly, since a client talking to an old one debugs code that is not
 * running. But stopping it is `pool.closeAll()`, and under two pools the FIRST
 * gate to notice takes down every sibling that is already mid-`page.evaluate`.
 *
 * Measured, on the run that landed this: a protocol bump turned an 18/18 suite
 * into `drawcheck VOID`, `reachcheck FAIL`, and `uxcheck` / `integration` FAIL
 * with `Target page, context or browser has been closed`. Four gates, none of
 * them broken, and a table that reads like a game regression.
 *
 * One call here, before anything is spawned, makes the restart serial and
 * invisible. It is also the honest place for it: the suite is the only thing in
 * this repo that starts nine browser clients at once.
 */
if (rest.some((g) => g.kind === 'browser')) {
  const started = await ensureDaemon().catch(() => false);
  if (started) console.log('  (started the capture daemon)\n');
}

if (opts.serial) {
  for (const g of rest) await runGate(g);
} else {
  /**
   * Two pools, run at once, because the two kinds of gate contend for different
   * things.
   *
   * The browser pool matches `BROWSER_BUDGET`: the daemon queues past it
   * anyway, and spawning more node processes than there are slots only buys
   * memory. The CPU pool is deliberately small — these gates build terrain
   * fields and tree meshes in process, and past a handful they simply make each
   * other slower.
   *
   * The perf gates take the daemon's exclusive lease, which drains every worker
   * and closes every leased page. They cannot overlap with anything, including
   * each other, so they run last and alone.
   */
  /**
   * Leave room for whatever else is on the box.
   *
   * A long probe holds one of the daemon's four slots for its whole run, so a
   * suite that still asks for four spends the difference queueing — and the
   * plan's own last Phase-D bullet is that probes and the suite's parallel
   * phase must not oversubscribe the machine the way six uncounted chromiums
   * once did. The budget is enforced daemon-side either way; this is about not
   * spawning node processes that will only wait.
   */
  /**
   * The suite takes the budget MINUS ONE, and minus anything already leased.
   *
   * `BROWSER_BUDGET = 4` is a property of the machine, not of this tool, and
   * the suite is not the only thing on the machine: the reset-drift check, a
   * post-commit prewarm and any other agent's single shot all want a slot too.
   * A suite that claims all four leaves zero headroom, and every in-suite
   * failure this evening happened at exactly that point — a screenshot past its
   * timeout, a CDP handshake past its, a boot at 32 s against 6.6 s solo. Each
   * of those got its own fix; this is the one that stops manufacturing the
   * conditions for the next one.
   *
   * The cost is small and the arithmetic says so: the browser gates are ~380
   * slot-seconds, so three slots against four is ~127 s of floor against ~95 s,
   * and the suite is bounded by `drawcheck` either way. A suite that has to be
   * re-run is infinitely slower than one that is thirty seconds longer.
   */
  const held = health ? health.leases.length : 0;
  const budget = Number(process.env.HARNESS_BROWSER_BUDGET || 4);
  const browsers = Math.max(1, budget - 1 - held);
  /**
   * And the CPU pool gives way to a live probe too.
   *
   * A lease costs a browser slot, which the line above already accounts for.
   * What it did not account for is that some holders also burn a core: a probe
   * runs its whole body inside one `page.evaluate`, stepping the simulation,
   * and `probes/turbocost.mts` prices that at 11.66 ms of CPU per frame with
   * nothing on the GPU waiting for it. Sizing this pool off `os.cpus()` alone
   * put four terrain-building gates flat out beside a probe doing the same.
   *
   * Holders declare it (`probe.mts --cpu`, default 1) and `/health` reports it,
   * so this is a real number rather than an assumption about who is running.
   */
  const leasedCpu = health ? health.leases.reduce((a, l) => a + (l.cpu || 0), 0) : 0;
  // Subtracted from the CAP, not just from the core count, so the declaration
  // actually binds. On a box with ten cores `min(4, cores - 2 - 1)` is still 4
  // and the tag would be decorative -- and a flag that can never fire is worse
  // than no flag, because it reads as a control that is doing something.
  const cpus = Math.max(2, Math.min(4, os.cpus().length - 2) - leasedCpu);
  console.log(`  (${browsers} browser gate(s) at a time, of a machine budget of ${budget}`
    + `${held ? `, ${held} already leased` : ''}`
    + `${leasedCpu ? `; CPU pool ${cpus}, ${leasedCpu} core(s) declared by live probe(s)` : ''})\n`);
  await Promise.all([
    pool(rest.filter((g) => g.kind === 'cpu' && !g.perf), cpus),
    pool(rest.filter((g) => g.kind === 'browser' && !g.perf), browsers),
  ]);
  for (const g of rest.filter((g) => g.perf)) await runGate(g);
}

if (aux.p) aux.p.kill();
prune();

const wallSec = (Date.now() - t0) / 1000;
const failed = results.filter((r) => r.code !== 0 && r.code !== VOID && r.code !== BUSY);
const voided = results.filter((r) => r.code === VOID || r.code === BUSY);
const cached = results.filter((r) => r.cached);

console.log(`\n${results.length - failed.length - voided.length}/${results.length} gates passed`
  + ` in ${wallSec.toFixed(1)}s${cached.length ? ` (${cached.length} from cache)` : ''}`);
if (voided.length) {
  console.log(`VOID/BUSY (measured nothing, not a regression): ${voided.map((v) => v.gate.name).join(', ')}`);
  console.log('  the ruler refused to certify, or the machine was somebody else\'s. Re-run on a');
  console.log('  quiet tree -- `daemon.mts --wait quiet --for 600` -- and do not read these as numbers.');
}
if (failed.length) {
  console.log(`failing: ${failed.map((f) => `${f.gate.name} (expected ${f.gate.expect})`).join(', ')}`);
  for (const f of failed) {
    if (!f.excerpt) continue;
    console.log(`\n  --- ${f.gate.name}, last lines ---`);
    for (const line of f.excerpt.split('\n')) console.log(`  ${line.slice(0, 160)}`);
  }
  /**
   * The two things that are the harness rather than the game, named where the
   * red row is, because that is where somebody is standing when they decide
   * whether to investigate the renderer.
   */
  if (failed.some((f) => /has been closed|Execution context was destroyed/.test(f.excerpt ?? ''))) {
    console.log('\n  One or more gates lost their browser mid-run. That is almost never the game:');
    console.log('  check ~/.cache/ffxv-harness/<key>/daemon.log, and see LANDMINES.md on the');
    console.log('  daemon restarting (a PROTOCOL bump) or dying. Re-run before believing this table.');
  }
}

// --------------------------------------------- the meta-gate: the suite's own time

/**
 * The suite grew 9 -> 13 minutes while everyone watched gates pass.
 *
 * Nothing metered the meter, so the only signal was a human noticing that
 * `check` "feels slow" — which is exactly the signal that failed for four
 * weeks. A budget in prose regressed; a budget the suite enforces cannot.
 *
 * It grades only a run that can be compared: the full roster, nothing served
 * from cache, on a quiet machine. Anything else records nothing and says so,
 * because a ratchet that fires on a contended box is a ratchet people learn to
 * ignore — the same failure mode `drawcheck`'s tolerance exists to avoid.
 */
interface SuiteBaseline { note: string; wallSec: number; tolerance: number; gates: Record<string, number>; at: string; cores: number }
const BASELINE = path.join(ROOT, 'project', 'check-baseline.json');
const gradeable = !opts.only && !opts.gate && !cached.length && quiet && !failed.length && !voided.length;

if (opts.setBaseline) {
  if (!gradeable) {
    console.log('\n  --set-baseline needs a clean, quiet, fully-uncached run of the whole roster.');
    process.exit(1);
  }
  const next: SuiteBaseline = {
    note: 'What the whole suite costs on a quiet machine, cold. `check` fails itself when it '
      + 'regresses past `tolerance`. A new gate joins the roster by paying its row here.',
    wallSec: Number(wallSec.toFixed(1)),
    tolerance: 0.3,
    gates: Object.fromEntries(results.map((r) => [r.gate.name, Number((r.ms / 1000).toFixed(1))])),
    at: new Date().toISOString(),
    cores: os.cpus().length,
  };
  writeFileSync(BASELINE, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`\n  recorded ${next.wallSec}s as the suite's own budget -> project/check-baseline.json`);
} else if (existsSync(BASELINE)) {
  const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as SuiteBaseline;
  const ceiling = base.wallSec * (1 + base.tolerance);
  if (!gradeable) {
    console.log(`\n  suite budget ${base.wallSec}s (not graded: `
      + `${cached.length ? 'served from cache' : !quiet ? 'busy machine' : opts.only || opts.gate ? 'partial roster' : 'a gate is red'})`);
  } else if (wallSec > ceiling) {
    console.log(`\n  SUITE BUDGET BLOWN: ${wallSec.toFixed(1)}s against ${base.wallSec}s `
      + `+${Math.round(base.tolerance * 100)}% = ${ceiling.toFixed(1)}s.`);
    for (const r of [...results].sort((a, b) => b.ms - a.ms).slice(0, 4)) {
      const was = base.gates[r.gate.name];
      console.log(`    ${r.gate.name.padEnd(width)}${(r.ms / 1000).toFixed(1)}s`
        + `${was === undefined ? '  (new gate — pay its row with --set-baseline)' : ` was ${was}s`}`);
    }
    console.log('    Make it faster, or re-record with --set-baseline and say why in the commit.');
    process.exit(1);
  } else {
    console.log(`\n  suite budget ${wallSec.toFixed(1)}s / ${base.wallSec}s +${Math.round(base.tolerance * 100)}%`);
  }
}

if (failed.length || voided.length) process.exit(1);
