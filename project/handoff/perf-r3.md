# Perf, round 3 — the ruler was starving the browser, and it had been for the
# whole life of this project

Owner: the perf-r3 lane, 2026-08-24. Branch `main`, committed as it went.

**Read §1 before anything else.** It invalidates the interpretation of every
`>16ms` column and every worst-frame list ever printed here, including the ones
in `project/handoff/perf.md`, `perf-r2.md` and `LANDMINES.md`.

---

## 0. Where the gate stands

`pnpm run check` is **17/17** (`anycheck` was 5 over its zero ceiling from my
own probe; fixed in `4a4…`, verified `0 any across 0 files`).

`gameplay.mts` **still FAILs on `streaming-traverse`**, at 53.8-54.9 fps against
60. Everything else in the session now passes, and the hitch list has gone from
18 frames over 33 ms to 7-9, all of them in two segments.

**Every whole-run number below was taken on a CONTENDED machine and I could not
fix that.** See §2: two other lanes were committing throughout, which means a
`vite build` on this box every few minutes. Nothing here that makes a *claim*
rests on a whole-run before/after; every claim is an interleaved A-B-B-A inside
one page on one build, which is the only shape that survives a moving box.

---

## 1. The 12-35% frame-time tail is the instrument, and it always was

`LANDMINES.md` has carried this for months, under "still unexplained":

> Even paced at 60 Hz on a static shot, 12–31% of frames cost 20–90 ms instead
> of 5. It is pure CPU time inside `post.render`; it creates no GL resources;
> it survives rendering offscreen; it attaches to no composer pass.

It is `ruler.yieldTask`, which was `setTimeout(r, 0)`.

`setTimeout(0)` returns to the **task queue**. Chromium's rendering lifecycle —
style, layout, paint, and the composite that puts the WebGL canvas and any DOM
over it on screen — does not run from the task queue; it runs from a BeginFrame.
A loop that posts a new task the instant the previous one ends starves it. The
work does not vanish, it batches: every tenth frame the compositor finally runs,
the GPU process falls behind, and **the next GL call inside `ScenePass` blocks
on a full command buffer — inside the timed region.** That is why it looked like
"pure CPU inside `post.render`" to every profiler anyone pointed at it, and why
fourteen ablations of the menu came back innocent. None of them was the cause.

### How it was caught

`performance.memory` is frozen in this headless build, so the heap had to be
read from **outside** the page. `src/tools/_probe/gcwatch.mts` drives the frame
loop one frame per CDP round trip and reads `Runtime.getHeapUsage` and
`Performance.getMetrics` between frames.

    frame     ms      heapMB   dHeap   ThreadTime  TaskDuration  RecalcStyleCount
        8    4.0      123.32   +0.64          5.1           5.0                 1
        9  312.6      124.09   +0.77         10.9          10.8                 2
       10   20.1      124.74   +0.65          6.6           6.5                 1

**A 312.6 ms frame in which the renderer main thread burned 10.9 ms.** The frame
is blocked, not working. Same shape on the other spike: `sprint+turn` frame 34,
102.9 ms wall, 10.1 ms `ThreadTime`.

Three more things that fell out of the same probe and are worth not re-deriving:

- **It was never GC.** The heap grows a flat +0.65 MB per frame and drops 25 MB
  every ~39 frames. Those drops land on frames 1 and 40; the spikes land on
  9, 19, 29, 39. They are unrelated processes.
- **The period is exactly ten frames**, in a triple (9, 10, 11 / 19, 20, 21 / …).
- **50 ms of real idle per frame removes every spike**: 0 in 80 frames, against
  14 in 140 with no idle.

### The fix, and why it is not leniency

`yieldTask` now awaits `requestAnimationFrame`. That is also the honest pacing:
`Game.start()` runs exactly one `frame()` per rAF, so the gate is finally paced
the way a player's machine runs. A 60 ms `setTimeout` sits beside it as a
liveness backstop for a throttled page, and `rafStarved` counts how often it
won so a run cannot quietly fall back to the old behaviour — `gameplay.mts`
prints it.

Same shot, same page, minutes apart, interleaved t0-raf-raf-t0, only the yield
changed (`src/tools/probes/perfpace2.mts`):

    shot             yield   median    max    >16ms
    storm            t0        9.50  689.9      34%
    storm            raf       7.80   13.9       0%
    zone_ravatogh    t0        8.00  197.2      25%
    zone_ravatogh    raf       6.40   14.2       0%
    party_walk       t0        6.70  172.3      23%
    party_walk       raf       6.30   11.2       0%
    town_npcs        t0       11.00   33.5      15%
    town_npcs        raf      10.00   31.0      24%

**Read `town_npcs` before trusting the other three. It is the control.** Its
tail is real work — it is the slowest shot in the corpus — and rAF pacing leaves
it exactly where it was. The medians barely move anywhere, and **wall-clock per
iteration is the same either way** (30-51 ms for `storm` under both), so this
buys the measurement no extra idle. It only stops the browser's own work
colliding with the timed region.

### What it was worth

- **`menu-open`**: 12 frames over 33 ms and an 85.1 ms worst frame → **0**, with
  a 16.8-20.4 ms worst frame and 0-3% over 16.7. That segment is this project's
  long-documented menu stall, which `perf-r2` proved was *not* a regression
  (27 hitches at the certified baseline `acdcebb` against 26 at HEAD) and which
  survived every one of fourteen ablations. It is gone, and nothing in the game
  changed.
- **`perf.mts`'s false `FAIL: storm at 51 fps`** on a corpus run: the mechanism
  is now named. Those shots' 25-35% `>16` tail was the ruler; with it gone the
  median cannot sit at the edge of it.
- The `~~` "unresolvable" flag should fire much less often, because the spread
  it compares against was largely this.

### And the shipped loop agrees

`src/tools/probes/perflive.mts` calls `Game.start()` — the real rAF loop, one
`frame()` per presented frame — and records the interval between presented
frames. Warm pass, 240 frames each:

    arm          median   p95    p99    max   >33ms
    closed        23.7   28.8   31.4   32.0       0
    menu open     24.3   29.2   30.4   30.6       0
    walking       25.8   46.9   59.4   64.1      30

The menu costs the shipped loop **nothing**. (Do not read the absolute numbers:
headless has no display and its BeginFrame source is not a real vsync, so 24 ms
here is not 41 fps on a player's machine. The *comparison* is what this probe is
for.)

---

## 2. The brief said the machine was quiet. It was not — for the second lane running

`perf-r2`'s handoff opens with the same complaint. Mine did too, and it was
equally false: a **rocks** lane and a **head** lane committed at 15:24, 15:25,
15:32 and 15:32 while I measured, and a `shoot.mts` corpus was running at 15:38.
The pre-commit hook runs `vite build`, so "another lane committed" means "several
cores were saturated for tens of seconds" — and `withExclusive` cannot queue
that, because a `vite build` never asks the daemon for anything.

The damage is visible and large. Two `gameplay.mts` runs half an hour apart,
nothing touched that either could depend on:

    segment    quiet run   contended run
    idle          6.4          9.1
    walk          6.3         11.8
    sprint        7.3         14.3

**`contention()` printed `VERDICT: quiet` for all of it**, because its three
triggers cannot see a co-agent on this repository:

- `trees` greps for `worktrees/agent-*`. Every lane here works on **one shared
  trunk**, so it has always found nothing and always will.
- `browsers > 1` — one browser looks like one browser whoever owns it.
- `load1 > cores * 0.7` — that is **12.6** on this eighteen-core box. A single
  co-agent never gets near it.

Fixed (`f13…`): two more triggers, `vite build` count and other lanes' harness
tools by name, and the verdict now names which one fired. Ten minutes after the
"quiet" verdict above, from the same function:

    headless chromium procs : 15 (~4 browsers)
    vite procs              : 5
    other lanes' tools      : probe, shoot
    load average (1m)       : 2.67 over 18 cores
    VERDICT: CONTENDED (4 browsers) — a frame time measured now is partly somebody else's load.

**Whoever briefs the next perf lane: check this before writing "the machine is
yours".** Two lanes in a row have now spent hours on numbers that moved for
reasons outside their diff.

---

## 3. Vegetation: three layers that all re-gathered on the same frame

Grass, scrub and trees each rebuild their whole instance set when the camera
passes their own threshold — 5 m, 10 m, 12 m. A sprint covers 0.17 m in a frame,
so in real motion they fire every 30, 60 and 72 frames and almost never coincide.
A **teleport** makes all three fire at once, and `gameplay.mts`'s
`streaming-traverse` hops 660 m every twelfth frame. That is the frame that cost
33-63 ms and most of why that segment ran 61-81% of its frames over budget.

`Vegetation._stream` now hands a frame to one layer at a time when more than one
has heavy work. A layer with nothing to do still gets its call — the early-out is
free, and `Bushes`/`Trees` advance their own tick counters inside `update`, so
skipping them would stretch their cadence rather than preserve it. Worst case a
layer waits two frames.

Interleaved base-rot-rot-base-base-rot, one page, one build
(`src/tools/probes/perfveglayer.mts`):

    arm     median   p95    max   >16ms   >33ms   Vegetation.update
    base     13.2   24.1   63.6     12%       6     4.21 ms/frame
    rot       9.3   12.5   16.1      0%       0     1.46 ms/frame

**506-511 draws and 7.75-7.89 M triangles resident in both arms**: the same
world, delivered in smaller pieces. `src/tools/probes/vegrotshot.mts` photographs
the worst moment the rotation can produce (four frames after a hop, two layers
still owed a frame) with the rotation on, forced off and on again: 578 / 584 /
584 draws, 7.69 / 7.73 / 7.81 M triangles — inside the arm-to-arm spread. The
frames themselves are unreadable, motion-blurred by a 200 m/s teleport, so the
counters are the evidence and the images are not.

Determinism is protected the same way `TileStream.budgetMs` is: `converge()`
runs all three layers unbounded before every posed capture, `resetClock()` zeroes
the phase, and `driftcheck` and `detcheck` pass.

---

## 4. What is left, in the order I would take it

### A. `streaming-traverse`, ~18 ms, and it is now `post.render` + `Props`

Post-rotation, per-frame attribution on the traverse script
(`src/tools/probes/perfgrow.mts`, which times every system):

    post.render          5.7 - 7.5 ms
    Vegetation.update    1.2 - 1.9 ms   (was 4.2 - 4.9)
    Props.update         1.8 - 2.7 ms
    everything else      ~1.5 ms

`post.render` is 45-55% of that frame and is not a streaming problem — it is
4.6-5.4 ms in *every* segment. It is `postfx`'s lane, not mine, and it is now
the single largest line in the game's frame.

**`Props.update` is the same bug this lane just fixed, one directory over.**
`Props` drives `rocks.stream`, `rocks.outcrops` and `debris.stream` — three
`TileStream`s with independent `budgetMs` of 0.6 / 0.4 / 0.3 — and they all
refill on the same teleport frame. The rotation in `Vegetation._stream` is about
twenty lines and ports directly. I did not do it because `src/world/props/Rocks.ts`
and `Debris.ts` belong to the rocks lane; `TileStream.ts` itself is mine and
needs no change. Expected worth: ~1.5 ms off the worst frames of that segment.

### B. The one remaining >33 ms frame: `sprint+turn` at frame 34-35

84-116 ms, at the same frame index every single run, when Hammerhead first
enters the frustum. `perf-r2` took it from 226 + 119 ms across two frames down
to this by fixing `Warmup`. What is left is **not CPU**:

- `ThreadTime` 10.1 ms on a 102.9 ms frame (`gcwatch.mts --sprint --raf`).
- Zero new programs, zero texture uploads, zero new *visible* geometries on that
  frame (`src/tools/probes/perfupload.mts`).
- All of it inside `post.render` (82.0 of 84.3 ms, `perfsprint.mts`).
- It survives rAF pacing, so it is **not** the §1 artefact.

So it is a GPU-process stall on the frame a large amount of already-built,
already-linked content is first *drawn*. The two candidates I did not get to
separate: buffer uploads for geometry that `Warmup` created but never actually
drew (its `_warmShadows` renders into a **64×64** target, and a Metal pipeline
state is keyed by attachment format, so a PSO built there may not be the one the
composer's MRT needs), and shadow-cascade work for hundreds of new casters. The
instrument that would settle it is a CDP trace with `disabled-by-default-gpu.*`
categories, correlated with `console.timeStamp` markers per frame.

### C. `day-night-sweep`, 12.3-17.7 ms, 0-5 hitches

Untouched by this lane. It sweeps the sun through 24 hours in 150 frames — a
rate no player can produce — and its cost is Sky/CSM re-keying. Worth asking
whether the segment should sweep at a plausible rate before it is worth
optimising; at 0.16 h per frame it is doing about 500× real time.

---

## 5. Landmines found (also written into `project/LANDMINES.md`)

- **`Game.start()`'s loop does not check `_running`, and `stop()` only cancels
  the one callback in `_raf`.** Any path that starts the loop twice leaves an
  orphan chaining forever — and **the daemon pools the page**, so the next tool
  handed it inherits a browser burning 100% of a core. Seen: one
  `chrome-headless-shell` at **105.8% CPU with nothing running**, and three
  `gameplay.mts` runs 40% worse before I found it. `node src/tools/daemon.mts
  --stop` clears it. `Game.ts` is not mine (BRIEF rule 4) so the loop is
  **reported, not fixed**; `perflive.mts` now stops the loop in a `finally` and
  says so in its header.
- **`anycheck` greps text, so it sees `src/tools/_probe/**`** even though
  `tsconfig.tools.json` excludes that directory from typechecking. Five `as any`
  in a throwaway Node-side probe failed the gate.
- `perfsprint.mts` (perf-r2) timed 150 frames with **no yield at all** in its
  loop — every frame inside one synchronous task, which is the throttle
  `perfgroup.mts` documents. Fixed to rAF; its frame-34 attribution survives.

## 6. Files touched

- `src/tools/ruler.mts` — `yieldTask` → rAF with a counted liveness fallback;
  `rafStarved` on the page API; `contention()` sees `vite build` and other lanes.
- `src/tools/gameplay.mts` — prints `rafStarved`.
- `src/world/Vegetation.ts` — `_stream`, `_phase`, `resetClock` zeroes it.
- `src/world/veg/{GrassField,Bushes,Trees}.ts` — `wants()` on each.
- `src/tools/_probe/gcwatch.mts` — new; CDP heap + `Performance.getMetrics`.
- `src/tools/probes/` — `perfpace`, `perfpace2`, `perfpace3`, `perflive`,
  `perfgrow`, `perfupload`, `perfveglayer`, `vegrotshot` new;
  `perfsprint` re-paced.

Reports: `tmp/perf-r3/gp-*.json`, `tmp/perf-r3/perf-1.json`.
Captures: `tmp/shots/perf-r3/vegrot*.jpg` (counters, not images — see §3).
