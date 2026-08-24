# Status — 2026-08-24

> **A snapshot, REPLACED in place, never appended to.** Dated bullets belong in
> `journal/`. Deleting a line that has stopped being true loses nothing.
> Capped at 150 lines by `.githooks/pre-commit`.

**`main`**, zero `any`, `pnpm run check` **15/16** on a quiet tree after
`build:full` and both bake passes. Perf is **uncertified** — see below.

## Live right now — nobody. Seven lanes ran overnight and all have stopped

`2026-08-21-fable-procedural-modeling` was built end to end by seven parallel
lanes. Every handoff is current:
`handoff/{rocks,town,method,characters,scatter,water,trees,hydrology}.md`, with
`2026-08-23-coordinator.md` holding the lane map and shared rules.

**Sixteen of that plan's rows were false**, each disproved by measuring before
building against it and each recorded in the plan rather than deleted. Four
"NOT DONE" rows were long since built; one **"DONE"** row, §2.2, cited three
files containing the *word* `talus` and no geometry; four §7 rows and both of
§8.2/§8.3's premises went the same way. **Re-audit a row against the tree before
building from it** — nothing type-checks a plan.

**After any merge: `build:full`**, not `build` — `build` deletes the
painted-face cache without replacing it and cold boot silently regresses
6.9 -> ~9 s. Then `pnpm run check`.

## The one thing that mattered most last night

**Every eye in the game was covered by a lit skin-coloured lobe** — the full
assembly was built by two earlier lanes and had **never once been visible in a
shipped frame**. Three causes, all winding or sidedness. `LANDMINES.md`'s old
prescription for it is **wrong and cost a lane most of a session**; corrected.
Two of the same shape: the rock **vertex-colour bake was a global halving of
every rock's value** (near boulder luma 45.1 -> 78.9) — four judge rounds called
that "dark smudges" — and **640 tube triangles per tree disagree with their own
vertex normals**, which is most of why trunks read as posts in dirt.

## The grade — rounds 12/13/14: **3.5 -> 3.5 -> 3.0**, 12 identified every time

The instrument was validated first and separately: 24 plate-vs-plate composites
came back **0 HIGH / 21 LOW** with the judge saying unasked that it *"could not
find a WebGL demo frame anywhere in this set"*. So the rounds below are evidence.

**Round 14 went DOWN, and the cause is the head.** Its verdict on the previous
round's five: terrain silhouette **BETTER** (real multi-peak ridgelines and a
drainage chute where there were cones), dusk ground material **BETTER**, one
instance never rotated **UNCHANGED**, props with no site **UNCHANGED**, and the
head **WORSE** — *"the chin projects further forward than the nose... no mouth
geometry or mouth texture on the mouth's location."*

**The head's depth fix overshot.** `muzzleMm` 22.44 -> 6.46 is inside the
adult-male norm and the frame reads as a beak, because pulling the mid-face back
put the chin ahead of the nose. **No bench here asserts that nose projection
must exceed chin projection** — that is the gap, and it is the third time on this
head that a measurement agreed while the picture did not.

Its own costed advice: *"Fix the head, and only the head. Nothing in the
environment can buy a point while that frame exists."* Worth 3.0 -> 4.0. The
second lever, worth ~0.5, is **slope-keyed materials — a cliff band and a talus
fan on every landform** — and deleting the flat-blue skyline billboard.

## Gates — 15/16 on a quiet tree, 2026-08-24

Re-run after `build:full` and both `texbake --force` passes. The suite grew
**12 -> 16**: `silhouette`, `geocheck`, `hydrocheck` and `floatcheck` all landed
last night, each with calibration anchors re-measured every run.

`build` · `anycheck` 0 · `orphans` **301/301** · `silhouette` 42 meshes /
8 families · `geocheck` · `hydrocheck` · `integration` **27 pass** · `uxcheck`
93/93 · `creaturecheck` 207 · `combatloop` **31/31** · `roadcheck` 0 ·
`reachcheck` · `horizoncheck` PASS (MCC 0.766, unmoved by the reshape) ·
`heightcheck` 0.000 m · `driftcheck` −2.976 m (reported).

**`floatcheck` is the one red**, deliberately not baselined over:
`poiFloating 0 -> 1`, `poiBuried 6 -> 15`. `handoff/town.md` has four causes and
a proposed fix, plus the caveat that stops anyone fixing it blind: bedding a
stele 900 mm deeper made the reported float go **up**, so the metric's sign is
not yet understood.

**Two failures last night were the harness, not the code**, and both looked like
regressions — see `LANDMINES.md`. **Check `daemon --health` uptime and run
`cleanup.mts` before believing a leased-page gate.**

## Perf — `perf` PASS; `gameplay` improved hugely but **not certifiable here**

`perf.mts` **PASS**, `RULER_VALID: true`, mean **186-188 fps**, worst 66-74.

**The long-unexplained 12-35% frame-time tail was the ruler, not the game.**
`ruler.yieldTask` was `setTimeout(r, 0)`, which returns to the *task queue*;
Chromium's rendering lifecycle runs from a BeginFrame, so a loop that posts a new
task the instant the last ends **starves the compositor**. Caught from outside
the page over CDP: a **312.6 ms frame in which the main thread burned 10.9 ms** —
blocked, not working. It was never GC. `yieldTask` awaits `requestAnimationFrame`
now. `storm` 34% -> **0%** of frames over 16 ms, worst frame 689.9 -> **13.9 ms**;
`menu-open` — the stall that survived **fourteen** ablations across two lanes —
12 hitches / 85 ms -> **0 hitches / 18.3 ms**. `town_npcs` is the control and
stays 15-24% under both pacings, so the fix buys no false idle.

Plus: the three vegetation layers all re-gathered on the same teleport frame and
now rotate — `Vegetation.update` **4.21 -> 1.46 ms**.

**`gameplay.mts` cannot be certified on this machine**: a *second Claude session*
is running gates on it, and the contention detector correctly voids every run.
The best contention-proof measurement (interleaved A/B in one page) puts
`streaming-traverse` at **67.3 fps** and total hitches at **4**, from 44-55 fps
and 18-25. **The 33 ms rule is still breached** — `sprint+turn` 90-104 ms, a
GPU-process stall when Hammerhead first draws.

Also open: **ten town shots draw 924-1011 calls against BRIEF's budget of 800,
and no gate checks it.**

## Still weak

`Layers.ts`'s splat reads as one texture, not a material system — six layers
whose mean lumas span only 0.35-0.47. Nothing in our frame reaches white: eight
of ten reference plates clip >=0.10%, four of our six clip at 0.00%. **A page
costs 2.1 GB of RSS**, which is what makes the browser budget bite.
**Three corpus shots were re-framed 2026-08-24** (`ac1a495`), on the human's
call: `landmark_meteor` was aimed **3.8 km at the wrong zone**, `poi_haven` sat
near the origin with the camera inside a rock, and `zone_nebulawood` descended
into a canopy and was a wall of leaf cards. **`zone_nebulawood` is one of the 30
judged shots, so round 12 is not comparable to rounds 1-11 on it.** All three now
reveal defects the old framings hid — the Meteor's quilt, and haven pads that
read as hard-edged cake stands.

Genuinely strong: the field HUD, atmosphere and aerial perspective, terrain
strata, the world map, the opening cutscene, warp-strike VFX, km-scale shadow —
and now a real drainage network, shorelines, rivers, and eyes.

## Next, in order

1. **The head.** The judge's #1 and the round's whole 3/10: no mouth, a bump for
   a nose, asymmetric eyes, burlap skin. Re-open `handoff/characters.md`'s "do
   not rebuild" verdict against `tmp/shots/judge-r11/hero_portrait.png`.
2. **The cloud layer** — seven of twelve frames, and the judge costs it at one
   day with the widest reach in the set. Fewer, varied, hand-placed sheets at
   different altitudes, sun-tinted undersides, fading into a horizon haze band.
   Delete the even scatter.
3. **`floatcheck`'s fourteen buried landmarks** — the one red gate.
   `handoff/town.md` has four causes and a fix; read its caveat about the
   metric's sign first.
4. **Composition, not density.** The Matérn work fixed the statistics
   (Clark-Evans 0.930 -> 0.741) and the judge still says nobody chose where
   anything goes. Hero silhouettes and sight-lines are the missing half.
5. **Grounding** — GTAO gathers at 0.62 m, `ContactShadowPass` marches 0.5 m
   (gated at 55 m), CSM `maxFar` is 190 m, and the graded shots' nearest ground
   is 61-80 m, so a boulder at 400 m gets none of the three. A world-metre
   contact ramp is a **measured** dead end. `handoff/grounding.md`.
6. **Motion.** Every judgment this project has made is on a still frame.
