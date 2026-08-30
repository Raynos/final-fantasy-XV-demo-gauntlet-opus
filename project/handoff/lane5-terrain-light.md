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
