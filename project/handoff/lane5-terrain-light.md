# Lane 5+6 — light in shadow, and hue range

Plan: `docs/plans/2026-08-30-fable-to-nine.md` items 18-22.
Owns `src/world/terrain/**` except `Field.ts`. Cross-lane one-liners into
`src/world/Sky.ts` (lane 4) and `src/world/veg/Biomes.ts` (lane 3) are named
below when they land.

## The measured picture (baseline, `tmp/shots/l5-base`, PNG, HEAD e55e01c)

`zone_vannath` 17.2 h clear, box `0.02 0.80 0.20 0.98` ("fg-left"), Y p50 /255:

| frame | Y p50 | R−B |
|---|---|---|
| shipped | **7** | +1 |
| `?post=nocloudshadow` | 28 | +14 |
| `?post=noambient` | **1** | +2 |

The cloud shadow removes 75 % of the light in that box (it multiplies DIRECT
light only, `sky/MaterialPatch.ts:119-122`). What is left underneath is the sky,
and the sky is worth **six levels out of 255** with no chroma. Tasks 18 and 21
are one floor, exactly as the brief says.

## 19 — de-posterise: MEASURED NEGATIVE (verified)

Built `src/tools/bandstat.mts` first (commit `e218e50`) because no instrument
existed. On PNG, the darkest boxes are **not** posterised:

| box | Y span | occ | gap | edges |
|---|---|---|---|---|
| vannath fg-left | 0..25 | **100.0 %** (26/26) | 0 | 0 |
| vannath core | 6..105 | 100.0 % (100/100) | 0 | 0 |
| fog dark | 39..85 | 100.0 % (47/47) | 0 | 0 |

Every integer level in the span is occupied and there is not one empty level,
so nothing upstream is quantising. A q82 JPEG round trip and the 1568 px
downscale do not create it either (both still 100 %/gap 0). What the judge saw
is `top 19 %` — a fifth of that box piled on one near-black level — which is a
**crushed** floor, not a stepped one, and is the same defect as 18/21. Closed as
a measured negative; the residue is the lift, which 18 and 21 own.

## 18 — sky fill: LANDED, first step (verified by eye and by number)

`8222044`. `FRAG_AO` adds a terrain-local second helping of the probe's own
irradiance (`shGetIrradianceAt(tfNormalW, lightProbe)`), gain 1.6, occluded at
0.45 instead of the primary 0.85. New uniform `uSkyFill`, no compile-time
branch, `?post=nofill` / `?post=fillonly` pair.

Same boxes, `tmp/shots/l5-fill` vs `l5-base`, Y p50: vannath fg-left **7 → 11**,
vannath core **35 → 46**, overcast dark **5 → 11**, fog dark 59 → 62.
Whole-corpus `imagestats --against FFXV-field` on the four shots: every row `ok`
except shadow warmth, and **ours are COOLER than FFXV (−3.2 vs +5.8)** — so this
fill must not be pushed bluer. That is measured, and it contradicts the obvious
instinct.

**Looked at it:** the midground now reads as sunlit tan dirt with legible
relief and the cloud-shadow bands read as shadows rather than as a wall of
black. The bottom fifth of the frame is still a murky dark mass.

## Open / next

- The remaining foreground crush is cloud shadow (7 → 28 with it off). Task 21.
- Not yet done: 20 (mid-frequency geology), 22 (hue range).

## 22 — hue range: instrument built, one lever landed, one measured negative

`huestat.mts` (commit `7f1b120`) measures hue range on a **sky-matched slice**
(bottom 45 %), which is what `imagestats.mts:418`'s own caveat demands. Columns:
`arc90` (narrowest contiguous hue arc holding 90 % of the slice's chroma mass),
`dom`, `2nd` (busiest window ≥45° off `dom`), mean chroma.

| slice | arc90 | dom | 2nd |
|---|---|---|---|
| `FFXV-field` plates, median (n=10) | **140°** | 67.3 % @ 60° olive | 18.0 % @ 195° blue |
| ours, `zone_three_valleys` | **15-20°** | 97.6 % @ 25° ochre | 0.6 % |
| ours, `zone_vannath` | 55° | 78.8 % @ 30° | 6.2 % |
| ours, `zone_longwythe` | 15° | 98.3 % @ 30° | 0.4 % |

**The cause is upstream of the tell.** All six layer recipes' mean linear
albedos sit between hue **21° and 36°** — sand 26, dirt 24, gravel 29, rock 21,
grass 31, road 36. A per-zone multiplier in `Biome.ts` scales a hue; it cannot
create a second one.

**Measured negative, recorded:** pushing `three_valleys`'s `rock` to a cool
grey-blue `[1.02, 1.05, 1.08]` in `Biome.ts` moved the slice by nothing
(arc90 20° → 15°, dom 97.1 → 97.6). Its visible ground is not the rock layer.
`surfaceAt()` at the shot target arrives as authored ([1.087, 0.966, 0.821]),
so this is not blend dilution — the lever simply is not on that surface.

**Landed:** `444a988` — gravel's cool pebble half given real chroma (0.023 →
0.078 at hue 220), scrub rotated 46-47° → 52-55° khaki, both at matched luma,
`LAYER_AVG` re-derived with `layeravg.mts`.

**LANDMINE found, and it cost a measurement.** `--dirty` did NOT pick up a
`Layers.ts` recipe edit. The texel bake is content-hashed against `Layers.ts`
but `vite-plugin-bake` only re-checks that hash in `configResolved`, i.e. at
**server start**, and its `handleHotUpdate` path is dead because live reload is
off. The daemon keeps one long-lived `dirty:` server, so a recipe edit made
after that server started is served from the stale cache with no symptom. Worse,
the frame that looked like a big win from it was another lane's in-flight edit
arriving through the same shared `dirty:` tree. **A/B a recipe by sha, never by
`--dirty`.**

## 21 — vannath's cloud-shadow floor: diagnosed, half landed

The floor itself is **not** a cloud-shadow-strength problem, and that is
measured, not asserted. On the 288×162 foreground box: shipped 7, with the
cloud shadow off 28, with the probe off 1. Sky = 21 % of unshadowed, which is
close to the real clear-sky diffuse fraction — so cutting `cloudShadow` 0.78
would be physically wrong. **The floor was the sky term**, and `uSkyFill` takes
that box 7 → 22 and the plan's own named gate box (`0.33 0.62 0.46 0.78`)
**35 → 61 against its bar of 30**. No `Sky.ts` one-liner was landed, on purpose.

The **patch-scale** half has an exact cause nobody had measured:
`Clouds.ts:414` bakes the shadow map over `uShadowTile * uShadowFieldScale`
metres and `sky/MaterialPatch.ts:120` samples it over `uShadowTile` alone, so a
clear-sky patch is exactly **1/3.5** of the cloud above it (`shadowScale` 3.5).
The bake's own comment says the magnification is deliberate. Getting inside 2×
is a *two*-number change — `uShadowTile` has to rise with `shadowScale` falling
or the 2700 m `RepeatWrapping` tile becomes the new defect. Filed to
`project/TASKS.md` for lane 4 rather than landed blind.

## 20 — tier-B macro relief: landed, NOT yet verified by number

`7c2d0b9`. The 30-300 m band. Tier-C (4-30 m) already exists and its own comment
records that all of its measured gain came from the HEIGHT, not the tint — while
the macro tinting immediately below it runs `m1`/`m2`/`m3` at 588/139/37 m,
exactly this band, and spends all three on colour. So tier-B reuses those fields
for a `tf_bump` plus one new 87 m lineament (the trunk of tier-C's braids).
Amplitudes are a matched **8.2° tilt** — 3.20 m over 139 m, 0.85 m over 37 m,
2.10 m over 87 m — which is tier-C's own measured seat one octave down.
`?post=nomacroh` / `macrohmax` is the pair.

**Not verified.** `reliefstat` was queued behind 33 sweep jobs and never ran;
the numbers to beat are the ones quoted in the tier-C comment (ours d8 11.8,
d16 12.1, d32 13.3 against 18.4 / 21.2 / 21.8). **Next step is exactly one
command:** `node src/tools/reliefstat.mts <capture> --roi 0.1,0.6,0.8,0.35
--against FFXV-field-ground`, on a `nomacroh` / shipped pair, plus a look at
`zone_longwythe` for the same 2.5× control tier-C used.

## Looked at, at the end of the session

- `zone_vannath` with the fill: the midground now reads as sunlit tan dirt with
  legible relief and the cloud-shadow bands read as *shadows* rather than as a
  wall of black; the bottom fifth is still the darkest thing in the frame.
- `vista_overcast`, ground half, before/after: the badlands go from an
  unreadable black mass to legible ridge and gully form. This is the frame that
  most justifies `uSkyFill`, and it is also the one whose whole-frame `sat%`
  falls — the number and the picture disagree and the picture is right.
- `zone_three_valleys` before/after tier-B: the left ridge gains a broad lit
  shoulder and the middle gains dark sweeps through its gully system; the
  hillside stops being one even carpet at 200-400 m.
- `zone_longwythe` with tier-B, whole frame: badland floor with broad hummocky
  form and drainage lines, mesas with shape, real depth. No greasy wash, no
  artefacts, no banding. `?post=nomacroh` against it is a subtle but real loss
  of the large-scale light and shade on the plain.
- `daycycle_night`, `vista_dusk`, `zone_nebulawood`, `zone_malmalam` at fill
  3.5: night still dark and blue, dusk still golden, the two green zones
  unchanged in character. Nothing clips.

Draw calls on the last capture: three_valleys 436, longwythe 502, vannath 616 —
all inside the 800 budget.

## `driftcheck` RED — the diagnosis (coordinator ask)

Measured, from the coordinator's run: `SURFACE DRIFT mean 0.000 worst 0.000`
over 36 864 texels, and `gpu vs heightAt` **worst −0.520 m at (−39.8, −68.2),
identical at boot and after 56 km**. So the drift half of the gate is perfectly
clean and the failure is a *static* 0.520 m against a 0.45 m tolerance — 0.07 m
over, on a **worst-of-36 864** statistic.

**It cannot be a terrain commit from tonight, and that is provable from the
diff rather than argued.** Since the dispatch baseline `7da60d5` the ONLY files
changed under `src/world/terrain/` are `Layers.ts` and `TerrainMaterial.ts`,
both lane 5's, and `git diff 7da60d5..HEAD` on them, comments stripped, is:

- `Layers.ts` — two texture recipes and the `LAYER_AVG` table. Texel colour.
- `TerrainMaterial.ts` — `uniform vec2 uSkyFill` in **FRAG_PARS**, a `tf_bump`
  block in the **fragment** body, a `#if defined(USE_LIGHT_PROBES)` addition in
  **FRAG_AO**, and one uniform default.

**Not one line of `VERT_PARS`, `VERT_BEGIN`, `tf_height` or `tf_heightLod`
changed.** `driftcheck` re-renders the clipmap through exactly those vertex
chunks, so nothing lane 5 landed can move the surface it reads. `Field.ts`,
`Terrain.ts`, `Wear.ts` and `Clipmap.ts` were not touched by anyone tonight.
`heightcheck` reading 0.000 says the same thing from the field's side.

What is left is the **tessellation chord**: the tool's own tolerance comment
says the 1.5 m mesh "sags a measured ~0.37 m below `heightAt()`" in the
roughest ground inside 100 m and that 0.45 was chosen as headroom over that.
0.520 is that same quantity, at the single worst texel, 16 % past a threshold
set from one past measurement. `hero_full` is a `follow: 'player'` shot, so the
probe rect is centred on the player — anything that moves the spawn moves the
rect onto different ground and moves a worst-case statistic with it.

**The decisive experiment is running:** `driftcheck --build 7da60d5`, the
dispatch baseline. If it also reads ~0.520 the gate was red before any lane
committed and the tolerance, not tonight's work, is what needs the argument.
Queue depth was 8 in the fix lane and 43 in sweep when it was submitted.

### ...and the disproof does not need the browser at all

Extracting every `/* glsl */` chunk from `TerrainMaterial.ts` at `7da60d5` and
at `HEAD` and comparing them byte for byte:

    FIELD_GLSL    IDENTICAL   4130 -> 4130 chars     <- tf_height lives here
    VERT_PARS     IDENTICAL    467 ->  467
    VERT_BEGIN    IDENTICAL    789 ->  789
    FRAG_MAP / FRAG_NORMAL / FRAG_ROUGH / NOISE_GLSL   IDENTICAL
    FRAG_AO       CHANGED      511 ->  964
    FRAG_PARS     CHANGED    91917 -> 95030

`driftcheck` renders the clipmap through `VERT_PARS` + `VERT_BEGIN` into a float
target. Those two, and the field function they call, are **byte-identical to the
dispatch baseline**. The geometry the gate measures cannot have moved from lane
5's work, and no other lane touched a terrain file. Handing back to the
coordinator: the suspect is not here.

`driftcheck --build 7da60d5` was submitted to settle whether the 0.520 m
predates the wave; it was still queued behind a fix-lane depth of 8 and a sweep
depth of 43 at the stop. **That one command is the next step.**

## Gates run

- `nanscan` (`probes/nanscan.mts`): **0 of 142 shots carry NaN**.
- `pre-commit` green on all eight of this lane's commits (build + both
  typechecks + 4 cheap gates).
- Draw calls: 436 / 502 / 616 against a budget of 800.
- `pnpm run check` was run ONCE, before the coordinator's stop-running-check
  rule, and failed on `build` — the failure is another lane's half-saved
  `src/engine/postfx/GradePass.ts:161` in the shared working tree, not this
  lane's. Not re-run.
- NOT obtained: `reliefstat` for task 20 (queued behind 43 sweep jobs, never
  ran) and `driftcheck --build 7da60d5` (same).

### The HEAD run came back, and its DISTRIBUTION is the argument

```
player           before (0.00, 3.57, 0.00)  after (0.00, 3.57, 0.00)
SURFACE DRIFT    mean 0.000 m   worst 0.000 m   over 36864 texels
gpu vs heightAt  boot: mean -0.001 worst -0.520   after travel: mean -0.001 worst -0.520 at (-39.8, -68.2)
                 p99 |err| 0.229 m; 2937/12544 texels over 0.1 m (1.5 m tessellation floor)
FAIL  (tolerance 0.05 m drift, 0.45 m vs heightAt)
```

Reproduces the coordinator's numbers, and the two columns the summary line does
not carry settle it:

- **mean −0.001 m.** The rendered surface agrees with `heightAt()` to one
  millimetre on average. A real offset — a shader adding height, a CPU function
  fallen behind, a mis-decoded attribute — moves the MEAN. This one does not.
- **p99 |err| 0.229 m**, half the tolerance. The gate is failing on **one texel
  in 36 864**, and the sign is negative, which is the only sign a chord can have:
  a 1.5 m triangle through a convex field always sags *below* it.
- **The spawn has not moved** (0.00, 3.57, 0.00), so the probe rect is over the
  same ground as it was.

So this is the tessellation chord at the single roughest spot in one rect,
16 % past a threshold the tool's own comment derived from one past measurement
of ~0.37 m. Combined with the byte-identical `FIELD_GLSL` / `VERT_PARS` /
`VERT_BEGIN` above, there is no candidate commit: the geometry and the field
function are the same objects they were at `7da60d5`.

**Do not widen `--tol-cpu` to make it green** — the coordinator is right that
this gate earns its tightness, and a max-statistic that has never had a floor
measured for it is the thing to fix, not the number it trips. The honest repair
is the one `imgdiff` already made for exactly this failure mode (LANDMINES,
"the noise floor is per-shot, not the constant everyone quotes"): gate the
**p99**, which is 0.229 and has headroom, and *report* the worst texel with its
coordinate. That keeps every offset bug catchable — an offset moves p99 and the
mean together — while not failing on one triangle over a gully.
`driftcheck --build 7da60d5` is still the check on whether 0.520 predates the
wave, and it is still queued.

### CORRECTION — the baseline PASSES, so it DID break tonight

`driftcheck --build 7da60d5` came back **PASS (tolerance 0.05 m drift, 0.45 m
vs heightAt)**. My "the 0.520 predates the wave" hypothesis is **wrong** and is
struck. (I truncated my own capture with `tail -14` and lost the baseline's
`worst` value; re-submitted with a grep that keeps it.)

**What survives the correction, and it is the useful half.** The byte-comparison
still holds: `FIELD_GLSL`, `VERT_PARS` and `VERT_BEGIN` are identical to the
baseline, `Field.ts` / `Terrain.ts` / `Wear.ts` / `Clipmap.ts` were touched by
nobody, and `heightcheck` reads 0.000. So the shader arithmetic and the field
function are not the carrier. Combined with the distribution — **mean −0.001 m,
p99 0.229 m, one texel in 36 864 at −0.520, sign always negative** — there is
exactly one mechanism left that fits every one of those facts at once:

> Something **sharpened the ground content** near (−39.8, −68.2) without
> breaking `tf_height() == heightAt()`. A steeper feature raises the sag of the
> 1.5 m tessellation chord through a field both sides still agree on perfectly.
> `heightcheck` cannot see it by construction; `driftcheck` can, because it
> renders triangles.

That is why the mean did not move and only the worst texel did. **The suspects
are the two commits that stamp the heightfield through `Wear.gradePad`:**

- `ca8929e` — *PoiKits: publish named kit anchors, and give `_town` the square*
- `0fb3087` — *Props: pack the 115 POI sites that stream in during play*

and the mechanism to look at first is `gradePad`'s **cliff branch**, which
LANDMINES already records as building "a kerb and then a retaining wall straight
down" — a vertical step is the maximum-chord-sag shape there is, and
(−39.8, −68.2) is ~80 m from spawn, well inside POI seating range. Not lane 5's
files; handed to the coordinator with those two shas named.

The p99-not-max recommendation above still stands on its own merits, but it is
now a **second** point and not the diagnosis: something real moved tonight and
should be found before the gate is reshaped.

### SECOND CORRECTION — the same build ref gives two different verdicts

I ran `node src/tools/driftcheck.mts --build 7da60d5` **twice**. Same command,
same sha, minutes apart:

| run | verdict | numbers |
|---|---|---|
| A | **PASS** | lost — I truncated my own capture with `tail -14` |
| B | **FAIL** | mean −0.001, worst −0.520 at (−39.8, −68.2), p99 0.229, 2937/12544 |

Run B's numbers are **identical in every digit** to the HEAD run — mean, worst,
worst-coordinate, p99 and the over-0.1 m count all match to three decimals. Two
genuinely different trees agreeing to that precision would be remarkable; one
tree measured twice is exactly what it looks like. So at least one of these two
runs did not photograph the tree it named — the shared bake cache, a reused warm
page, or the build ref not being honoured.

**Therefore `driftcheck` cannot attribute tonight's red to any sha right now,
and both of my previous conclusions are withdrawn:**

- The "it predates the wave" hypothesis rested on nothing (run A's numbers are
  the ones I lost, and run B says 7da60d5 fails).
- The "`ca8929e` / `0fb3087` POI seating sharpened the ground" attribution
  rested on run A's PASS alone, which run B contradicts. **Do not chase those
  two shas on my say-so.** The mechanism I described is still the only one that
  fits `mean −0.001` + `p99 0.229` + one texel at −0.520 + byte-identical vertex
  chunks — but "which commit" is now unanswered, not answered.

**The next step is a harness question, not a terrain one:** establish that
`driftcheck --build <sha>` is reproducible at all. Run it three times on ONE sha
and keep the whole output including the `[harness]` announce line, which names
the build actually served and which I grepped away. If the three disagree, the
gate is measuring the daemon and every attribution made from it tonight —
including lane 13's exoneration — needs re-checking.

This is the same family as the bake-cache entry already filed in
`project/TASKS.md`: a shared, content-addressed cache that two build trees fight
over, producing a result that is stable, plausible, and about the wrong tree.
