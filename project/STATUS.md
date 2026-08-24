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

## The grade — round 12, 2026-08-24: **3.5/10**, 12 identified, 0 fooled

**The instrument was validated first.** `--control` is an if/else that *replaces*
the round, so it was run separately: 24 plate-vs-plate composites came back
**0 HIGH / 21 LOW**, the judge saying unasked that it *"could not find a WebGL
demo frame anywhere in this set"*. Round 11 then scored **3/10**; round 12, after
the head, hair, cloud, seating and postfx work, scores **3.5** — and the judge
says the half point is **entirely atmospheric**.

Round 11's top five, re-graded by round 12:

| | verdict |
|---|---|
| characters have no faces | **still present, marginally better** — eyes and skin now, still no mouth in the close-up |
| nobody chose where anything goes | **unchanged**, and now the most damaging cue after the cones |
| the sky is a particle system | **partially better** — real cirrus banding and scattering in two frames |
| one tiling texture per surface | **still present** |
| terrain silhouettes are primitives | **still present, and now the single worst thing** |

Its costed one-point lever: *"break the horizon silhouette. Every wide shot fails
at the same place — the skyline. That single change fixes cues 1 and 2, which
between them appear in seven of the twelve demo panels, and it costs no rendering
work."* `_peak` is rebuilt against exactly that (`spurs + strike + cliff bands +
talus fan`; radial CV 0 -> **39-52%**, max/min up to **9.1**); the rock family and
the head are in flight.

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

## Perf — `perf` CERTIFIED and PASSING; `gameplay` FAILS

**`perf.mts` PASS on a quiet machine, `RULER_VALID: true`**: every shot >= 60 fps,
mean **188.5 fps**, worst **66 fps** (`cine_hammerhead`), noise floor 17% of a
5.6 ms median frame. That is the first certified pass in days, and it took
**killing 96 orphaned vite servers holding 39.7 GB** that `cleanup.mts` could not
see — see `LANDMINES.md`. Every voided run before it was measuring that.

**`gameplay.mts` FAILS**, and it is the primary perf gate: worst segment
**streaming-traverse at 51.2 fps**, **17 hitches**, worst frame **168.9 ms**
(`sprint+turn`) against `BRIEF.md`'s hard *"no frame may exceed 33 ms"*. The
prior baseline was 92.2 fps and 2 hitches, so this is a real regression from a
night of new streamed content — and `menu-open` appears **six times** in the
worst-frame list, which is not streaming at all. A lane is on it.

Cost tracks **draw calls** — ~8.7 us each, corr 0.801 against 0.628 for
triangles; a new visible `InstancedMesh` costs **four**. Judged shots run
**532-744 of 800**, so the budget is not the problem: **frame-time spikes are**.

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
