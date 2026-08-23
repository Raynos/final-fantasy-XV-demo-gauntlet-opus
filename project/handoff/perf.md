# Perf — the baseline was measuring the harness

Owner: the performance agent (`PORT=5480`), 2026-08-23.
Branch: `worktree-agent-a11d7dcfea20336fe`, merged from `main` at `6b61bec`.

**Status: the instrument is fixed, both baselines are re-taken and certified,
and the attribution is done. The premise this lane was opened on — "the game is
well short of 60 fps" — is false.** What is left is three real defects the old
numbers could not have shown anyone, listed at the bottom.

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

Only `src/tools/` and `project/`. **No game code in `src/` was touched at all**,
so no other lane's files moved and there is no visual risk — the `party_walk`
capture at `tmp/shots/perf/party_walk.jpg` is unchanged in substance from before
the work.

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
- **17 probes** under `src/tools/probes/perf*.mts`, one per eliminated
  explanation.
- **`project/baseline-perf.json`, `project/baseline-gameplay.json`** — replaced.
- **`project/LANDMINES.md`** — one row in the wrong-diagnoses table and a new
  section.

`npm run check` is **11/11**. `npm run typecheck`, `typecheck:tools` and
`anycheck` (0) all clean.

---

## What is still wrong — start here

Three real defects, all of them invisible in the old numbers for the same
reason: everything read 40 fps, so nothing stood out.

1. **`streaming-traverse`: 17.3 ms, 58 fps, 60% of frames over budget.** The
   only segment under target and the only one whose median is more than three
   times the idle frame. Unattributed — `perfsystems.mts` was only ever run on
   a held shot, and pointing it at a traverse is the obvious next step.
2. **`day-night-sweep`: 11.55 ms, 87 fps, 21% over budget**, spread 6.13 ms,
   one 51.8 ms frame.
3. **`menu-open`: 13 hitches up to 82 ms** on a 5.3 ms median. Almost certainly
   first-touch work on screens that have never been built; `menu_title` is also
   the one shot in the corpus that is far dearer than its draw count predicts
   (10.2 ms at 599 draws).

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

## If you take one rule from this

**Ablate before you theorise, and print the raw series rather than a median.**
Four probes in a row here read medians and disagreed with each other about the
mechanism; the shape only named itself when `perfseries.mts` printed all 300
per-frame samples and the step at frame ~50 was simply visible.
