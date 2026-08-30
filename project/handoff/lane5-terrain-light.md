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
