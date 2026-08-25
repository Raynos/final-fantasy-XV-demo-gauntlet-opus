# Status — 2026-08-25

> **A snapshot, REPLACED in place, never appended to.** Dated bullets belong in
> `journal/`. Deleting a line that has stopped being true loses nothing.
> Capped at 150 lines by `.githooks/pre-commit`.

**`main`**, zero `any`, `pnpm run check` **17/17** on a quiet tree after
`build:full` and both bake passes. Perf is **uncertified** — see below.

## Live right now — nobody. The boot lane finished; seven content lanes before it

**`2026-08-22-opus-phase3-boot-and-memory` is DONE**, graduated to
`project/archive/plans/`. Its definition of done was **amended, not ticked**:
cold boot 13.66 -> **6.64 s** (`?shoot`) / **6.41 s** (`--play`), warm **6.03 /
6.15**, against a target of under 6 s cold and under 3 s warm. Cold is a little
over; **warm was never reachable, and two earlier passes left the row open
rather than say so.** Memory is fully attributed and its rows were met outright.
`handoff/boot-memory.md` is current and carries a sized work list.

Three things from it that outlive the lane: **`bootprof.mts --play`** — every
boot number this project ever quoted was a `?shoot=1` number, the harness's page
and not the one `TODO.md` is about; **`ruler.mts` was crying wolf** — a harness
tool piped into `grep` printed `CONTENDED (another lane is running <itself>)` on
an idle machine, because it matched command lines rather than executables, so
`VERDICT:` is worth believing again; and
**three of four boot wins were accidental costs, not missing caches** — work
that does not vary, sitting inside the loop that varies.

## The seven content lanes, all stopped

`2026-08-21-fable-procedural-modeling` was built end to end by seven parallel
lanes. Every handoff is current:
`handoff/{rocks,town,method,characters,scatter,water,trees,hydrology}.md`, with
`2026-08-23-coordinator.md` holding the lane map and shared rules.

**Sixteen of that plan's rows were false**, each disproved by measuring first and
recorded rather than deleted: four "NOT DONE" rows were long since built, one
**"DONE"** row cited three files containing the *word* `talus` and no geometry,
and four §7 rows went the same way. **Re-audit a row against the tree before
building from it** — nothing type-checks a plan.

**After any merge: `build:full`**, not `build` — `build` deletes the
painted-face cache without replacing it and cold boot silently regresses ~2.5 s.
Then `pnpm run check`.

## The one thing that mattered most in the content lanes

**Every eye in the game was covered by a lit skin-coloured lobe**, built by two
earlier lanes and **never once visible in a shipped frame**. Three causes, all
winding or sidedness; `LANDMINES.md`'s old prescription for it is **wrong and
cost a lane most of a session**, now corrected. Two of the same shape: the rock
**vertex-colour bake halved every rock's value** (near boulder luma 45.1 -> 78.9,
four judge rounds called it "dark smudges") and **640 tube triangles per tree
disagree with their own vertex normals**.

## The grade — rounds 12/13/14: **3.5 -> 3.5 -> 3.0**, 12 identified every time

The instrument was validated separately: 24 plate-vs-plate composites came back
**0 HIGH / 21 LOW**, the judge saying unasked it *"could not find a WebGL demo
frame anywhere in this set"*. So the rounds are evidence.

**Round 14 went DOWN, and the cause is the head.** On the previous round's five:
terrain silhouette **BETTER**, dusk ground material **BETTER**, two **UNCHANGED**,
and the head **WORSE** — *"the chin projects further forward than the nose... no
mouth geometry or mouth texture on the mouth's location."*

**The head's depth fix overshot.** `muzzleMm` 22.44 -> 6.46 is inside the
adult-male norm and reads as a beak, because pulling the mid-face back put the
chin ahead of the nose. **No bench here asserts that nose projection must exceed
chin projection** — the third time on this head that a measurement agreed while
the picture did not. Its costed advice: *"Fix the head, and only the head."*
Worth 3.0 -> 4.0. Second lever (~0.5): **slope-keyed materials, a cliff band and
a talus fan on every landform**, and deleting the flat-blue skyline billboard.

## Gates — 17/17 on a quiet tree, 2026-08-25

Re-run after `build:full` and both `texbake` passes. The suite has grown
**9 -> 12 -> 17**; do not quote an older count from any plan or handoff.

`build` · `anycheck` 0 · `orphans` **301/301** · `silhouette` 42 meshes /
8 families · `silrocks` · `geocheck` · `hydrocheck` · `integration` · `uxcheck`
93/93 · `creaturecheck` 207 · `combatloop` **31/31** · `roadcheck` 0 ·
`reachcheck` · `floatcheck` · `horizoncheck` (MCC 0.766) · `heightcheck` 0.000 m
· `driftcheck` −2.981 m (reported).

**`floatcheck` now passes** (`instBuried 801` against a baseline of 861,
reported only). It was the one red gate on 2026-08-24. `handoff/town.md` still
carries the caveat worth keeping: bedding a stele 900 mm deeper once made the
reported float go **up**, so do not fix this metric blind.

**Two gate failures were the harness, not the code**, and both looked like
regressions — see `LANDMINES.md`. **Check `daemon --health` uptime and run
`cleanup.mts` before believing a leased-page gate.**

## Perf — `perf` PASS; `gameplay` improved hugely, last run uncertifiable

`perf.mts` **PASS**, `RULER_VALID: true`, mean **186-188 fps**, worst 66-74.
**The long-unexplained 12-35% frame-time tail was the ruler, not the game.**
`ruler.yieldTask` was `setTimeout(r, 0)`, which returns to the *task queue* and
starves Chromium's BeginFrame-driven rendering lifecycle. Caught over CDP: a
**312.6 ms frame in which the main thread burned 10.9 ms** — blocked, not
working, and never GC. It awaits `requestAnimationFrame` now. `storm` 34% ->
**0%** of frames over 16 ms; `menu-open` — the stall that survived **fourteen**
ablations across two lanes — 12 hitches / 85 ms -> **0 / 18.3 ms**. `town_npcs`
is the control and stays 15-24% under both pacings, so no false idle was bought.
Plus the three vegetation layers now rotate instead of re-gathering on one
teleport frame — `Vegetation.update` **4.21 -> 1.46 ms**.

**`gameplay.mts` was not certifiable when last run** — a second session held the
machine. Its best contention-proof measurement (interleaved A/B in one page) puts
`streaming-traverse` at **67.3 fps** and hitches at **4**, from 44-55 fps and
18-25. **The 33 ms rule is still breached** — `sprint+turn` 90-104 ms, a
GPU-process stall when Hammerhead first draws. Re-run it: the tree is quiet and
`ruler.mts`'s false-contention bug is fixed.

Also open: **ten town shots draw 924-1011 calls against BRIEF's 800, ungated.**

## Still weak

`Layers.ts`'s splat reads as one texture, not a material system — six layers
whose mean lumas span only 0.35-0.47. Nothing in our frame reaches white: eight
of ten reference plates clip >=0.10%, four of our six clip at 0.00%.
 **A page costs ~1.94 GB of RSS** — measured and attributed, not guessed:
498 MB JS heap, 279 MB GPU-side, the rest Chromium's, and only ~94 MB of it is
cleanly recoverable. See the archived phase-3 plan §2.
**Three corpus shots were re-framed 2026-08-24** (`ac1a495`): `landmark_meteor`
was aimed 3.8 km at the wrong zone, `poi_haven` had the camera inside a rock,
and `zone_nebulawood` was a wall of leaf cards. **`zone_nebulawood` is one of the
30 judged shots, so round 12 is not comparable to rounds 1-11 on it.**

Genuinely strong: the field HUD, atmosphere and aerial perspective, terrain
strata, the world map, the opening cutscene, warp-strike VFX, km-scale shadow,
and now a real drainage network, shorelines, rivers, and eyes.

## Next — `docs/plans/2026-08-25-opus-after-phase3.md`, WS-1..4, in order

1. **The head.** The judge's #1 and the round's whole 3/10: no mouth, a bump for
   a nose, asymmetric eyes, burlap skin. Re-open `handoff/characters.md`'s "do
   not rebuild" against `tmp/shots/judge-r11/hero_portrait.png`.
2. **The cloud layer** — seven of twelve frames, one day, widest reach in the
   set. Fewer, varied, hand-placed sheets at different altitudes, sun-tinted
   undersides, fading into a horizon haze band. Delete the even scatter.
3. **Composition, not density.** The Matérn work fixed the statistics
   (Clark-Evans 0.930 -> 0.741); the judge still says nobody chose where
   anything goes. Hero silhouettes and sight-lines are the missing half.
4. **Grounding** — GTAO gathers at 0.62 m, `ContactShadowPass` marches 0.5 m
   (gated at 55 m), and the graded shots' nearest ground is 61-80 m, so a boulder
   at 400 m gets none of it. A world-metre contact ramp is a **measured** dead
   end. `handoff/grounding.md`.
5. **Motion.** Every judgment this project has made is on a still frame.
