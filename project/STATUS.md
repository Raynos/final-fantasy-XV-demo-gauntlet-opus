# Status — 2026-08-24

> **A snapshot, REPLACED in place, never appended to.** Dated "update —"
> bullets belong in `journal/`. Deleting a line that has stopped being true
> loses nothing — `journal/` and the git log are lossless. Capped at 150 lines
> by `.githooks/pre-commit`, because `PROGRESS.md` accreted instead and drifted
> five months stale while still reading as current.

**`main`**, zero `any`, `pnpm run check` **15/16** on a quiet tree after
`build:full` and both bake passes. Perf is **uncertified** — see below.

## Live right now — nobody. Seven lanes ran overnight and all have stopped

`2026-08-21-fable-procedural-modeling` was built end to end by seven parallel
lanes on this trunk. Every lane's handoff is current:
`project/handoff/{rocks,town,method,characters,scatter,water,trees,hydrology}.md`,
with `2026-08-23-coordinator.md` holding the lane map and the shared rules.

**Sixteen of that plan's rows were false**, each disproved by measuring before
building against it, and each recorded in the plan rather than deleted. Four
"NOT DONE" rows were long since built (`mixSeed` — mulberry32 already
avalanches, lag-1 autocorrelation −0.0103 over 4096 seeds; §12's `_outcrops`
blocker; both halves of §4.4). One **"DONE"** row, §2.2, cited three files that
contained the *word* `talus` and no geometry. Four §7 rows and both of §8.2/§8.3's
premises went the same way. **Re-audit a row against the tree before building
from it** — nothing type-checks a plan.

**After any merge: `build:full`**, not `build` — `build` deletes the
painted-face cache without replacing it and cold boot silently regresses
6.9 -> ~9 s. Then `pnpm run check`.

## The one thing that mattered most last night

**Every eye in the game was covered by a lit skin-coloured lobe.** The full
assembly — sclera, iris, pupil, limbal ring, catchlight, lash line, lid crease —
was built by two earlier lanes and had **never once been visible in a shipped
frame**. That is the "doll eyes / painted-on features / mannequin mask" a blind
judge has named in *every* round. Three causes, all winding or sidedness:
`buildLid` switched on `upper === (sg > 0)` where only `sg` may, the face
material was `DoubleSide`, and `ribbon()` and `buildHead`'s chin cap were
backwards behind it. `LANDMINES.md`'s old prescription for this — widen the
socket brushes — is **wrong and cost a lane most of a session**; it is corrected
there now.

Two more of the same shape: the rock **vertex-colour bake was a global halving
of every rock's value** (near boulder luma 45.1 -> 78.9), which is what four
judge rounds called "dark smudges"; and **640 tube triangles per tree disagree
with their own vertex normals**, which is most of why trunks read as posts in
dirt.

## The grade — measured against a judge with a control

`src/tools/compare.mts` runs a blind A/B against pixel-sampled FFXV plates in
`docs/reference/`. **`--control` is not optional**: without it a round cannot
tell a real gap from a saturated instrument.
Ten rounds, 3 -> 4.5/10, **never fooled it**. Its own answer for what gives us
away is **authoring** — *"the same few instances repeated"* — not rendering
defects: the absence of someone having chosen.

**The grade was rebuilt 2026-08-23** (sibling-ports 3.3/3.4): median range
**9.46 -> 11.06 stops** against 9.79, black point 3.5 -> 1.1, daylight slice 8
of 9 checks. The print fade had been capping display-white at 252/245 by
construction. **All ten rounds predate this grade; the next would be the first
to see it.**

**Open, named by four consecutive judges, nobody assigned:** cloud billboards,
and terrain that reveals its mesh (`landmark_insomnia`). Then a floating rock
arch (round 10, twice, cheap), hair, and Insomnia's massing.

## Gates — 15/16 on a quiet tree, 2026-08-24

Re-run after `build:full` and both `texbake --force` passes. The suite grew from
12 to **16**: `silhouette`, `geocheck`, `hydrocheck` and `floatcheck` all landed
last night, all with their calibration anchors re-measured every run.

`build` · `anycheck` 0 · `orphans` **301/301** · `silhouette` 42 meshes in 8
families · `geocheck` · `hydrocheck` 4 channels are percentiles · `integration`
**27 pass** · `uxcheck` 93/93 · `creaturecheck` 207 · `combatloop` **31/31** ·
`roadcheck` 0 fail · `reachcheck` · `horizoncheck` PASS (worst MCC 0.766,
unmoved by the terrain reshape) · `heightcheck` 0.000 m · `driftcheck` worst
−2.976 m (reported, not failed).

**`floatcheck` is the one red**, and deliberately not baselined over:
`poiFloating 0 -> 1`, `poiBuried 6 -> 15`. The town lane took it from 13/23 and
documented four causes in `handoff/town.md`; the remaining fourteen are *no-apron
landmarks on sharp relief* where the drawn surface and the seat envelope
disagree by more than the object is tall. Its own caveat is the reason nobody
should fix it blind: bedding a stele 900 mm deeper made the reported float go
**up**, so the metric's sign is not yet understood. The cheap fix it names is a
small `gradePad` under each waymark, +1 to +2 draws on 23 landmarks.

**Two gate failures last night were the harness, not the code**, and both looked
exactly like regressions: `combatloop` returned "target page has been closed"
until `cleanup.mts` cleared a **stale registry for a dead daemon**, then passed
31/31 unchanged; and the characters lane's whole 9/16 run was leased-page
timeouts during a daemon restart storm. **Check `daemon --health` uptime before
believing a leased-page gate.**

## Perf — uncertified

Prior certified pair (`project/baseline-*.json`): perf mean **243.7 fps** /
worst 148, gameplay worst segment **92.2 fps**, 2 hitches.

**A third run on 2026-08-23 certified and FAILED**: `RULER_VALID: true`, floor
22% of a 6.0 ms frame, **mean 166.4 fps, worst 51 fps on
`bestiary_necromancer`** against a 60 fps target. Two earlier runs voided at
27%. **Do not attribute it yet.** That shot's worst has read 179 / 150 / 51 fps
across the three runs and its *baseline* row already carried `p95 31.8 ms,
max 133.2 ms` — it is spike-dominated, and load was ~4.5 from outside this
repo. **Re-run on an idle machine before reading the mean as a regression.**

Cost tracks **draw calls** — ~8.7 us each, corr 0.801 vs 0.628 for triangles —
so **a new visible `InstancedMesh` costs four draws, not one** (colour plus
three cascades). Per-instance variation is free.

## Still weak

`Layers.ts`'s splat reads as one texture, not a material system — six layers
whose mean lumas span only 0.35-0.47. Nothing in our frame reaches white: eight
of ten reference plates clip >=0.10%, four of our six clip at 0.00%. **A page
costs 2.1 GB of RSS** (`project/TODO.md` notices it too), which is what makes
the browser budget bite. `zone_nebulawood` — **one of `compare.mts`'s 30 judged
shots** — is an unreadable wall of leaf cards, and `landmark_meteor` has not
framed the Meteor for some time. Neither was re-framed: changing what a blind
judge sees, between rounds, to a frame an agent chose is a call for the human.

Genuinely strong: the field HUD, atmosphere and aerial perspective, terrain
strata, the world map, the opening cutscene, warp-strike VFX, km-scale shadow —
and now the drainage network, the shorelines and rivers, and eyes that are
visible.

## Next, in order

1. **`floatcheck`'s fourteen buried landmarks** — the one red. `handoff/town.md`
   has the four causes and the proposed fix; read its caveat about the metric's
   sign first.
2. **Grounding** — the judge's #1, diagnosed as *structural*: GTAO gathers at
   **0.62 m**, `ContactShadowPass` marches **0.5 m** (gated at 55 m), CSM
   `maxFar` is **190 m**, and the graded shots' nearest ground is 61-80 m, so a
   boulder at 400 m gets none of the three. **A measured negative comes with
   it:** a world-metre contact ramp is dead on arrival — at that range a 1.5 m
   shrub is eight pixels, and FFXV darkens the object's own lower body, not a
   disc on the ground. Untested lead: `thickness` stays 0.45 while `bias` scales
   with distance, so the accept window is empty past ~140 m. `handoff/grounding.md`.
3. **Clouds** — five commits, unjudged; the last WIP commit is *unverified*.
4. **The tarn that will not fill and the rock quilt** — `rachsia_bridge` needs a
   causeway rather than a basin; the quilt is `rockMaterial`'s Worley `crack`
   term at weight 0.42, proved by a four-way ablation with three recorded
   negatives, and the mitigation was deliberately not landed unphotographed.
5. **Motion.** Every judgment this project has made is on a still frame.
