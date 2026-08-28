# After phase 3 — four independent pieces of work

Status: IN-PROGRESS (2026-08-28, opus) — four workstreams, each independently
staffable. **Nothing here is locked.** WS-1 is the only one with an external
argument for its priority; WS-2 and WS-3 are the boot work phase 3 deliberately
did not take, sized against measurements rather than guesses; WS-4 is small and
concrete.

Written on closing `2026-08-22-opus-phase3-boot-and-memory` (now in
`project/archive/plans/`). That plan's §3 "what is left" table and
`project/handoff/boot-memory.md` are the evidence behind WS-2 and WS-3; read one
of them before starting either.

**Assign one agent per workstream.** They collide nowhere: WS-1 is
`src/characters/**`, WS-2 is materials across every lane, WS-3 is `src/world/**`
geometry plus `src/tools/texbake.mts`, WS-4 is one shader or one material.

---

## WS-1 — The head

**The judge's own #1, and the reason round 14 scored 3.0.** Of the five changes
it was asked to compare against round 13, four were BETTER or UNCHANGED and the
head was **WORSE**: *"the chin projects further forward than the nose... no
mouth geometry or mouth texture on the mouth's location."* Its costed advice was
*"fix the head, and only the head. Nothing in the environment can buy a point
while that frame exists."* Worth **3.0 -> 4.0** — more than everything else in
this document combined.

> **Pass 5 (2026-08-28) — resolved, and the trap was not a sculpt trap.**
> `buildHead`'s skull grid was **wound inside out** — `(b-a) x (c-a) = -z_hat`
> for every quad — and the face material is `FrontSide`, so the near surface was
> culled on every frame this repo has ever captured and what drew was the
> **inside of the far side of the skull**. The judge's three sentences are then
> literal: an inside-out occiput *is* an egg, the eyes are separate geometry in
> front of it, the mouth is on the culled surface, and the lowest forward point
> of the inside of a braincase *is* the chin. It is also why the profile always
> read (a silhouette is the same surface either way round) and why every sculpt
> change measured on the position buffer and moved the frame by ~1 of 255.
> `src/tools/probes/facewind.mts` is the instrument — signed volume per mesh and
> the geometric normal of the front-most triangles — and it went 0.0% -> 100.0%
> outward. `facecheck`'s `mouthRange` went 2.9 -> 101.3 on Noctis and -18.9 ->
> 189.0 on Prompto against a limit of 14. `d866db7`; the section-level nose and
> vault work that preceded it is `7b2d4ce`. See `project/handoff/head.md` and
> the negatives table in `2026-08-26-opus-the-standing-backlog.md`.

**The trap, and it has caught three agents.** `muzzleMm` went 22.44 -> 6.46,
which is inside the adult-male norm, and the frame got worse: pulling the
mid-face back put the chin ahead of the nose. **No bench in this repo asserts
that nose projection must exceed chin projection.** That is the gap. It is the
third time on this head that a measurement agreed while the picture did not, so:

- **Add the bench first, then fix the head.** A metric that cannot fail on the
  current frame is not going to tell you when you have fixed it.
- Re-open `project/handoff/characters.md`'s "do not rebuild" verdict against
  `tmp/shots/judge-r11/hero_portrait.png`. It was reached before this defect
  was understood.
- `handoff/head.md`, `head-r2.md`, `head-r3.md` are three previous passes.
  Read what each of them already ruled out before ruling it out again.

### 2026-08-28 — the bench exists, two shapes landed, and the defect moved

**`src/tools/facecheck.mts` is the bench, and it failed on HEAD at 13 of 24 rows
before a line of `Face.ts` moved** — which is what the instruction above was for.
It renders each hero at 0.55 m and scores feature windows against a blank patch
of the *same* face in the *same* light, after removing a least-squares plane: a
raw p97−p03 scored the **terminator** as a mouth, and a blank cheek came back at
`range` 157. `noseLeadMm` is in it as the ratchet. Wired into `check`, 19/19.

Two shapes landed, both invisible to every bench that existed:

- **`shellPoint` swept a pure ellipse in theta** — `transverseDropMm` **18.6 →
  7.2** against a real head's ~7. This is `head-r3` §4, which left it as "a lane,
  not an afternoon". Note `x` is untouched by construction, so `muzzleMm` moved
  6.46 → 6.26 and `noseLeadMm` by **<0.1 mm**: the transverse section was never
  the projection defect, and fixing it does not fix the profile.
- **The jawline undercut reached x = 4 mm, the midline**, taking 6.6 mm off the
  chin's half-width. `jawWidthErr` 0.0665 → 0.018; the mandible profile is now
  `0.804 0.677 0.507 0.328` against Farkas' `0.82 0.70 0.53 0.32`.

**And then the finding that reframes three lanes of failure.** Fill the whole
face canvas pure `#00ff00` and re-render: the shadow half comes back green, **the
lit half comes back white.** *No texture survives on a blown face.* `SKIN_BASE`
0.88 → 0.55, which walks it out of the clip, moves `mouthRange` **1.4 → 12.3**.
Which half is blown is decided by the hero's **yaw and nothing else** — Ignis
reads a mouth at window-mean 175, Noctis does not at 227, on identical geometry
and identical paint.

So *"no mouth texture on the mouth's location"* is very likely **a clip, not a
sculpt**, and that is a coherent explanation for why three agents in a row
measured a correct face and photographed a wrong one. `facecheck` now VOIDs a
clipped window and names it rather than blaming the sculpt. **Open: whether the
cure is `SKIN_BASE` or the scene exposure aimed at the landscape** — different
bugs, different blast radii, and it needs a full-corpus diff.

Honest read from the lane that did the work: **better, not fixed.** The hair is
black instead of slate, both eyes read in `hero_portrait` where one was blank,
the chin is no longer a point and the cheek has a plane — but the portrait is
still a pale blown mask with no mouth, on a head pitched down under a camera
looking up.

**Done when** the portrait reads as a face at 1:1 — a mouth that exists, a nose
that leads the profile — and a bench asserts both, so the next agent cannot
regress it silently.

---

## WS-2 — Fewer shader programs

**1.83 s of a 6.6 s cold boot, the largest single item on the profile**, and the
only one phase 3 could not touch from inside a boot lane.

**What is already closed, with numbers — do not redo it.** `compileAsync` is
**3% slower** here, measured six alternating pairs (`bootprof.mts --warm-ab`
re-runs it in one command). `KHR_parallel_shader_compile` is present and the
path works; it resolves a larger set (134 programs against 112) and that eats
the per-program gain. Going async also finishes *after* the harness is told the
page is ready, which spends capture determinism for a loss.

**The open question is the program count, not the compilation.** 129 programs in
the warm-up's `scene` step alone; 228 held in total. Every one is a material
permutation. So this is a **material-architecture sweep across every lane**, not
a boot task, and that is why it is its own workstream:

- Inventory the 228 by program key and find out what actually differentiates
  them. A `#define` nobody reads still costs a program.
- Expect the answer to be a handful of flags multiplying out. Consolidating even
  one binary variant that is set on half the world removes ~60 programs.
- **`engine/LightBudget.ts` pins light counts for a reason:** toggling a light's
  `visible` once recompiled 43 programs, a measured **9.5 s freeze**. Any
  consolidation that changes a program key at runtime instead of at build time
  makes the boot cost a play cost, which is strictly worse.

**Done when** the warm-up's program count is materially down, the cold boot
number moves with it, and `pnpm run check` plus a full-corpus cold diff show the
frames unchanged. **Budget several days.** This one is genuinely risky: it
touches how everything in the game is shaded.

---

## WS-3 — Bake the geometry — **DONE**

Three items on the boot profile want the same thing that does not exist:

| ms | item |
|---|---|
| 400 | `Props.poiPrebuild` — eight POI kits that cannot be built inside a frame |
| 322 | `Props.mega` — megastructure geometry |
| 225 | `Water.shore` — marching-squares shoreline ribbons |

~950 ms, and none of it is an accidental cost: it is real geometry generation.
`src/public/baked/` already caches the terrain field and, since phase 3, every
keyed texture including two 3D volumes and a 2048² relief chart. **Geometry is
the one generated thing with no cache at all.**

The mechanism to copy is `src/engine/TexBake.ts` plus `src/tools/texbake.mts`,
and phase 3 added `bakedBytes` — a raw-byte entry point that stores anything as
a `w x h` image and needs no format change. A `BufferGeometry` is a set of typed
arrays; storing and restoring them is the same shape of problem.

Read before starting:

- **`TEX_SOURCES` is the whole correctness story.** A generator whose file is
  not on the list is served stale forever, with every gate green. Phase 3's
  chart entry had to pull in the *terrain* sources because the chart is
  rasterised from the heightfield.
- **A cache read before `Props.init()` misses on every boot** — `Props` is what
  awaits `loadTexBake()`, and a miss is indistinguishable from having no cache.
  This silently made the cloud bake worth zero on its first measurement.
- **`pnpm run build` is not enough; `build:full` is.** And `TexBake.ts` is in
  `CANVAS_SOURCES`, so editing it deletes the painted-face artifact.
- The prize is bigger than 950 ms. Geometry is also most of the 96 MB of CPU
  vertex arrays, and — unlike the texel arrays — those **cannot** be freed,
  because `heightAt`, collision and `creaturecheck`'s skinned-AABB probe all
  walk them. A bake does not fix that, but it is the only lever that has not
  been tried.

### DONE 2026-08-28 — cold boot 7.13 s → 5.78 s

`Game.init()` **6.95 → 5.61 s**; warm 6.67 → 5.56 s. `bootprof --n 3` at HEAD on
a quiet tree (`VERDICT: quiet`), exclusive lease, every other cache warm, with
`geo.bin.gz` moved aside and put back between the two runs so nothing else
differs. At **188 cold boots per suite cycle**, and it is `TODO.md` line 1.

| phase | no artifact | artifact live |
|---|---|---|
| `Water.shore` | 384.4 ms | **0.9 ms** |
| `Props.mega` | 454.8 ms | **9.0 ms** |
| `Props.poiPrebuild` | 423.1 ms | **38.2 ms** |
| the wait for the 35.5 MB artifact | — | **0 ms** |

**The correctness argument is the interesting half, and it is not the image
diff.** `probes/geoverify.mts` compares the cache against the generators in one
page at one instant, every attribute and every index: **IDENTICAL — 145 parts,
4 624 052 vertices, byte for byte.** That is the right oracle here, because **a
stale geometry cache serves *well-formed* geometry** — correctly wound,
contract-clean, standing on a heightfield that has since moved — and an image
diff would have to be lucky to catch it. The full-corpus cold diff was run
anyway, as this section asks: **142 of 142 at or under floor**, worst
`party_formation` 2.033 against 2.85, and the cache-fed shots far lower
(`road_viaduct` 0.703, `landmark_meteor` 0.438 against 1.24).

**Design decisions worth not re-litigating:**

- **Priced before written** (`probes/geocodec.mts`, in the page, real bytes):
  164.9 MB raw / 45.6 MB gz, inflate 200 ms + rebuild 25 ms against ~1.5 s of
  generation. So the codec is **deliberately stupid** — no quantisation, no
  transposition, arrays bit-identical. That is what makes `geoverify` possible.
- **Browser bake, not Node.** `PoiKits._base` seats compounds against
  `drawnHeightAt` — the rasterised clipmap, the renderer's own arithmetic. A Node
  bake would grade 124 aprons against ground the player does not stand on.
- **Only what boot builds is baked** (14 keys), and `releaseGeoBake()` drops the
  165 MB container at the end of `Props.init`. Caching the 116 streamed POIs
  would hold it resident all session.
- Keys are prefixed by quality tier and `loadGeoBake` skips the fetch entirely on
  a tier the bake cannot serve, so `combatloop`/`integration` at `q=low` no longer
  pay 165 MB for nothing.

**Not done, and deliberately.** `trees.build` (~490 ms) is left exactly as this
section instructed — GPU impostor atlases are rendered art and need baking as
images with the baselines re-checked. `bushes.build` (~120 ms) and `Props.rocks`
(~78 ms) were not attempted: `Rocks` is a tile streamer with no `PartBuilder`.
`Props.landmarks` (~46 ms) is `PartBuilder`-shaped and would be five lines.

**Two findings outside the brief.** `corpus.mts` threw `unknown flag --build`, so
a 142-shot corpus **could only ever be captured at HEAD** — the one comparison it
exists for (fixed, `caed02f`). And, for `TODO.md` line 2: the eight prebuilt POI
compounds are **119.7 MB over 3.70 M vertices**, against the **82.3 MB for the
whole page** that `boot-memory.md` records — with `lestallum` (1.34 M) and
`galdin_quay` (1.28 M) making up 2.6 M of the 3.7 M. The bake does not fix that.
**Nobody has ever looked at a 1.3 M-vertex town.**

**Done when** the three items are cache reads, `pnpm run check` is green, and a
full-corpus **cold** diff is at or under each shot's floor.

### WS-3 result, 2026-08-28 (`geometry-bake` lane) — **DONE**, and it pays 5:1

`src/engine/GeoBake.ts` + `node src/tools/texbake.mts --geo`. All three items
are cache reads. Same tree, same page pool, artifact moved aside and put back
between the two runs, so nothing but the cache differs:

| | cold boot | `Game.init()` |
|---|---|---|
| **with the geometry bake** | **5.78 s** | **5.61 s** |
| without it | 7.13 s | 6.95 s |

(`bootprof --n 3`, quiet tree, `VERDICT: quiet`, exclusive lease, every other
cache warm, the artifact moved aside and put back between the runs.) Per phase,
at one committed sha:

| phase | no artifact | artifact live |
|---|---|---|
| `Water.shore` | 384.4 ms | **0.9 ms** |
| `Props.mega` | 454.8 ms | **9.0 ms** |
| `Props.poiPrebuild` | 423.1 ms | **38.2 ms** |
| the wait for the 35.5 MB artifact | — | **0 ms** |

**And the correctness argument is the arrays, not a frame.**
`probes/geoverify.mts` compares what the cache served at boot against what the
generator makes when asked again, in one page at one instant:
**IDENTICAL — 145 parts, 4 624 052 vertices, byte for byte.** The full-corpus
cold diff the section asks for is **142 of 142 at or under floor**, worst
`party_formation` 2.033 against 2.85 — but that is the weaker check, because a
stale geometry cache serves *well-formed* geometry and an image diff would have
to be lucky to see it.

**The codec was priced before it was written** (`probes/geocodec.mts`, in the
page, on the real bytes): those three subtrees are **164.9 MB raw / 45.6 MB
gz**, and inflating and rebuilding all 145 `BufferGeometry` objects costs
**200 + 25 ms**. That is the whole argument, and it is why the codec is
deliberately stupid — no quantisation, no byte transposition — so the arrays
come back bit-identical.

Three things the section did not anticipate:

- **It has to be a *browser* bake, not a Node one.** `PoiKits._base` seats every
  compound against `Terrain.drawnHeightAt`, the **rasterised clipmap**, which
  `seatcheck.mts` proves is the renderer's own arithmetic. A Node bake would
  seat 124 compounds at subtly different heights and grade their aprons against
  ground that is not the ground the player stands on.
- **Only what boot builds is baked, and that is a memory decision.** 14 keys.
  The container is 165 MB inflated and `releaseGeoBake()` drops it at the end of
  `Props.init`; caching the 116 POI sites that stream in later would hold all of
  it resident for the session.
- **The prize being "bigger than 950 ms" is right, and worse than stated.**
  `probes/geofootprint.mts`: the eight prebuilt POI compounds alone are
  **119.7 MB over 3.70 M vertices**, against the **82.3 MB for the whole page**
  `boot-memory.md` records — and **two** of them, `lestallum` (1.34 M) and
  `galdin_quay` (1.28 M), are 2.6 M of the 3.7 M. The bake does not fix that; it
  changes where the arrays come from, not how many there are. Somebody should
  look at a 1.3 M-vertex town.

Not taken, with reasons, in `project/handoff/geometry-bake.md`:
`Vegetation.trees.build` (GPU impostor art, WS-12a says stage last or leave —
left), `bushes.build`, `Props.rocks` (a tile streamer, not a `PartBuilder`), and
`Props.landmarks` (46 ms, `PartBuilder`-shaped, would be five lines).

---

## WS-4 — The black patch on the Nebulawood canopy — **DONE** (4384cff, 154e8bf)

**It was a NaN, and both landmines this section pointed at are innocent.**
`--ablate plain` was the first thing tried and the blob is **pixel-identical
with the whole post chain off**, so GTAO's `overrideMaterial` never came into
it. The blob is the terrain surface shader writing NaN, which the grade shows
as a hole of pure 0,0,0.

`surfArray` is `rg = tangent normal xy, b = roughness, a = AO`, and the
triplanar rock block read `sx.rgb * 2.0 - 1.0` as a tangent normal — taking the
**roughness** for the normal's Z. On ground with no rock in it (most of a
forest) all three planes keep the neutral fill `vec4(0.5)`, which decodes to the
**zero vector** rather than to `(0, 0, 1)`, and the whiteout blend of three zero
vectors is exactly zero on axis-aligned ground: `normalize` of that is NaN. It
reached the frame even at zero rock weight, because `0.0 * NaN` is NaN. `tf_tanN`
reconstructs Z, which also makes the neutral fill contribute exactly `N` — what
the code's own comment already claimed it did.

`src/tools/probes/nanscan.mts` came out of it and poses all 142 shots counting
NaN in `rtScene`: **7 shots carried NaN and the corpus is now at zero.**
`zone_nebulawood` (3261 px) and `zone_malmalam` (314 px) were the terrain's;
`combat_wide`, `combat_hud`, `combat_armiger`, `warp_strike` and `warp_wide`
carried 15-50 px each from an unrelated cause in the same class — `TRAIL_FRAG`
used a varying as the base of `pow()`, which GLSL leaves undefined below zero
and this backend answers NaN (d27a0b6).

Both fixed shots now carry measured floors (0.744 and 0.276, verified by a
third cold capture at 0.496 and 0.188); `pnpm run check` is green. The two
traps that cost the lane most of its time — every in-shader NaN test is folded
away by this backend's compiler, and a flag added through
`totalEmissiveRadiance` is invisible on a NaN pixel — are in
`project/LANDMINES.md`.

---

## Two things any of these will need

**Read `VERDICT:` before reading any number.** `ruler.mts` spent weeks reporting
`CONTENDED (another lane is running <itself>)` on an idle machine — it matched
command lines rather than executables, so a tool piped into `grep` counted the
subshell bash forked for the other half of the pipe. Fixed 2026-08-25; the
verdict is worth believing again, and a habit of skipping it had somewhere to
form.

**`project/noise-floors.json` covers 18 shots, not 142.** Everything else is
checked against `DEFAULT_LIMIT` = 2.0, which is a placeholder, not a
measurement. Worse, the recorded floors are **cold** floors and the daemon
reuses pages, so an ordinary warm diff runs 4-6x them. A warm 3.1/255 against a
default 2.0 looks like a regression and is noise; a real change can hide the
same way. **Calibrate the shots you care about first** — two `--cold` captures
of one build and `imgdiff --calibrate` — and diff cold against cold. Doing this
is what separated a real regression from noise when phase 3's last change was
being judged, in both directions.
