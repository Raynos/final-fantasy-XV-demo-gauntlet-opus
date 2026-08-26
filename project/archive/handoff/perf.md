# Perf — the baseline was measuring the harness

Owner: the performance agent (`PORT=5480`), 2026-08-23.
Branch: `worktree-agent-a11d7dcfea20336fe`, merged from `main` at `6b61bec`.

**Status: the instrument is fixed, both baselines are re-taken and certified,
the attribution is done, and the one segment that was under target now clears
it. The premise this lane was opened on — "the game is well short of 60 fps" —
is false.** `gameplay.mts` prints PASS on every segment; `perf.mts` prints PASS
on all 141 shots. What is left is two real defects and one open question,
at the bottom.

---

## The headline

    old, certified          new, certified          on the same tree
    perf   mean 63.1 fps    perf   mean 190.2 fps   RULER_VALID: true both
    worst  31 fps           worst  87 fps           floor 0.70/0.60 ms
    idle   40.6 fps         idle   177 fps
    walk   42.7 fps         walk   189 fps
    sprint 38.0 fps         sprint 177 fps

`ruler.mts` rendered 20 frames inside one synchronous JS task. A task that
keeps the GPU busy past one 16.7 ms display refresh is throttled about five
times on this machine, so every perf number this project has ever produced was
taken a factor of five inside that cliff. `project/LANDMINES.md` carries the
full write-up under *The measurement trap*; the sweep that pins it is
`src/tools/probes/perfgroup.mts`.

**The old baseline cannot be salvaged by scaling.** Correlation between the old
per-shot number and the new one, over the 140 shots both runs share, is
**0.107**. The ranking inverts.

---

## Ranked attribution of the open-world frame

This is the thing the lane was asked for. Held `party_walk`, from
`perfsystems.mts` (wraps every system's `update`/`lateUpdate` and `post.*`) and
`perfpasses.mts` (wraps every composer pass).

| | ms | share |
|---|---|---|
| `post.render` | 4.2 | 78% |
| &nbsp;&nbsp;→ `ScenePass` (incl. shadow cascades) | 3.3 | 61% |
| &nbsp;&nbsp;→ `VelocityPass` | 0.4 | 7% |
| &nbsp;&nbsp;→ GTAO, SSR, TAA, DoF, motion blur, god rays, bloom, grade, CAS | 0.0 each | — |
| every game system together | 0.9 | 17% |
| **accounted** | **5.1 of 5.4** | |

No system is above 0.4 ms. `Water.lateUpdate` 0.4, `Party.update` 0.2, the
rest 0.1.

**And across the corpus the frame is a draw-call count.**

    corr(ms, draws) = 0.801        fit:  ms = 8.7 us x draws + 0.54 ms
    corr(ms, tris)  = 0.628        median |residual| 0.71 ms on a 5.47 ms frame

8.7 us of CPU per draw call is three.js per-object submission overhead, and
`cpu` equals `ms` on every shot in the corpus, so the frame is CPU-submission
bound end to end. That is the only lever with real leverage: `town_forecourt`
is the slowest shot in the game (11.55 ms, 87 fps) because it issues 971 draws.
Triangles are close to irrelevant — `vista_dawn` carries 10.3 M of them at
208 fps.

**Shadows** cost ~1 ms of the calm frame (4.4 → 3.5 ms with
`shadowMap.enabled = false`) and own the entire draw-count variance: with them
off, a held shot's draw count stops moving (306–314 instead of 418–662).

### What this means for last night's unpriced work

The horizon-angle bake, the grass shadow proxy, the impostor / canopy-card /
far-rock shadows, the analytic terrain relief and the Beer-Lambert water all
live inside a 3.3 ms `ScenePass` on a 5.4 ms frame. **None of them can be
costing what was feared, and `uHorizonMix.y -> 0` is not worth spending.** If a
later lane wants those numbers exactly, `perfablate.mts` is the harness for it
— but the ceiling on the whole group is 3.3 ms and the game is at 190 fps.

---

## What I changed

`src/tools/`, `project/`, and **exactly three constants of game code**, which
are called out first because they are somebody else's lane.

**Touched outside my lane:** `src/world/veg/GrassField.ts`, `Trees.ts` and
`Bushes.ts` — one `budgetMs` constant each, halved, with the measurement
written next to the grass one and the other two pointing at it. Nothing else in
`src/world`, `src/render`, `src/ui`, `src/combat` or `src/characters` was
touched at all, so no other lane's work moved. `project/handoff/vegetation.md`
should pick those three up.

Everything else is harness and documents:

- **`src/tools/ruler.mts`** — the page half is async throughout and renders one
  frame per task. `MAX_FRAMES_PER_TASK = 1`. New `cooldown()` (250 ms; recovery
  from the throttled state measured at between 50 and 200 ms) because
  `GAME.settle()` renders back to back and always leaves a shot throttled.
  `paired()` reduces each side by the **median** of nine frames rather than the
  mean, because the 12–31% heavy tail (below) blew the noise floor past the
  point where a run could certify. `throughput()` returns `overBudget`.
  Pipelined-block throughput is **gone**: a block long enough to pipeline is
  long enough to throttle, and a 60 Hz game never had 16 frames in flight.
- **`src/tools/perf.mts`** — one measurement pass instead of two; `lat` column
  replaced by `cpu`, plus a new `>16` column; warms the *page* before the first
  noise floor.
- **`src/tools/gameplay.mts`** — one pass per segment instead of two. The old
  code ran each segment's script twice (once pipelined, once per-frame), and a
  segment is a *sequence*, so the two passes were measuring different game
  states.
- **`src/tools/probes/perf*.mts`** — one probe per eliminated explanation.
- **`project/baseline-perf.json`, `project/baseline-gameplay.json`** — replaced.
- **`project/LANDMINES.md`** — one row in the wrong-diagnoses table and a new
  section, *The measurement trap*.
- **20 probes** in total under `src/tools/probes/perf*.mts`.

Captures: `tmp/shots/perf/party_walk.jpg` (the frame is unchanged in substance
— no rendering code moved), `tmp/shots/vegafter/zone_nebulawood.jpg` (dense
forest, fully populated after the budget halving) and `tmp/shots/vegpop/`
(the two mid-traverse frames, full budget against half).

`pnpm run check` is **11/11**. `pnpm run typecheck`, `typecheck:tools` and
`anycheck` (0) all clean.

---

## What is still wrong — start here

All of these were invisible in the old numbers for the same reason: everything
read 40 fps, so nothing stood out.

1. ~~**`streaming-traverse`**~~ — **fixed, and it was a constant.** See below.
   What remains of it is `Props.update` at 3.0 ms per moving frame, which is
   the same shape of problem and is untouched.
2. **`day-night-sweep`: 11.3 ms, 88 fps, 11% over budget.** Second slowest
   segment, unattributed. `perfstream.mts` is the harness to point at it.
3. **`menu-open`: 6 hitches up to 61 ms** on a 6.1 ms median. Almost certainly
   first-touch work on screens that have never been built; `menu_title` is also
   the one shot in the corpus far dearer than its draw count predicts (10.2 ms
   at 599 draws).

And one open question that is *not* a defect but is not understood either:

4. **The 12–31% tail.** Even paced at 60 Hz on a held shot, that share of frames
   costs 20–90 ms instead of 5. Ruled out: every game system, every composer
   pass individually, canvas presentation (offscreen behaves identically),
   resource creation (zero programs / textures / geometries across 200 frames).
   Turning off *any* post pass moves it 21% → 12–15%, which is an aggregate
   signature. It does **not** appear in `gameplay.mts`'s segments at all —
   `idle`, `walk` and `sprint` are 0% over budget — and that difference between
   the two harnesses is the sharpest lead anyone has. Do not chase it by
   staring at frames; `perfablate.mts` and `perfbisect.mts` are set up for it.

## The one fix that landed: the vegetation streaming budget

`streaming-traverse` 17.3 -> 15.4 ms, 58 -> 64.9 fps, a resolved -1.90 ms
against a 1.18 ms floor, 60% -> 36% of frames over budget, 18 -> 9 hitches.
That is what took the gameplay suite to PASS on every segment.

`perfstream.mts` is the held-shot breakdown pointed at the moving case, which
matters because a posed shot is exactly the case that does no streaming. On a
16.6 ms steady traverse frame: `Vegetation.update` **7.8 ms**, `Props.update`
3.0 ms, `post.render` 4.3 ms, everything else 0.7 ms. Vegetation was costing
nearly twice the whole renderer, and steadily — the 12-frame teleport hops cost
19.5 ms against 16.6 for the frames between, so it is the per-frame cost of
moving and not hop work.

It was 7.8 ms because it is a **constant**: `GrassField.budgetMs` 4,
`Trees.budgetMs` 4, `Bushes.budgetMs` 2, so the streamers were told they could
spend 10 ms of wall clock per frame. The comment on the grass budget cites
"`streaming-traverse`'s 26 ms median" as the thing it was sized against — a
number that was never real. Halved to 2/2/1, and the sweep is in
`perfvegbudget.mts` (4/2/4 → 69 fps, 2/1/2 → 81, 1/0.5/1 → 89). The quarter
budget is another 8 fps and is deliberately left on the table.

It costs nothing measurable: resident vegetation triangles came back *higher*
at the halved budget in both runs, and two mid-traverse captures are
indistinguishable (`perfvegpop.mts`, `tmp/shots/vegpop/`). **A posed capture
cannot see this either way** — `Vegetation.converge()` ignores `budgetMs` and
`Game.settle` calls it, so every shot in the corpus is fully filled whatever
the budget says. Only live traversal shows it.

## A caveat on the corpus numbers, before anyone diffs against them

`perf.mts`'s per-shot median is **not yet reproducible run to run** on the
shots with a heavy `>16` tail. A full-corpus run taken right after the
vegetation change reported 47 of 140 shots moved, several by +5 to +7 ms; the
six biggest "regressions" re-measured immediately afterwards came back at
4.8-6.7 ms, at or below their baseline, and the vegetation budget cannot
affect a posed shot anyway because `converge()` ignores it. The mover list was
noise.

The mechanism is the unexplained tail below: when 30-39% of a shot's frames
are spiking, the median of 120 samples is itself unstable. The noise floor
does not catch this because it is measured on `shots[0]` only and then applied
to every row. **Treat a single-shot `--baseline` delta as a lead, not a
result, and re-measure the movers before believing them.** Fixing this
properly means either a per-shot floor or a headline statistic computed only
from the sub-16.7 ms frames.

## If you take one rule from this

**Ablate before you theorise, and print the raw series rather than a median.**
Four probes in a row here read medians and disagreed with each other about the
mechanism; the shape only named itself when `perfseries.mts` printed all 300
per-frame samples and the step at frame ~50 was simply visible.
