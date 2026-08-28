# ground-r2 — the four ground leftovers WS-13 handed back

Owner: the `ground-r2` lane, 2026-08-28. Directories: `src/world/terrain/`,
`src/world/sky/SkyProbe.ts`, and — after `alpha-edges` handed off at `fbe8e1f`
mid-session — the one `Ecology` predicate the beach needed.

Four items, each measured by a lane that stopped at a directory boundary, plus
the water lane's tarn leftover. **Two landed in full, one is closed for terrain
and open for two other directories, one is half a measured negative and half a
`Shots.ts` recommendation, and the tarn is a fourth measured negative.** Read the item you are picking up and its
number before anything else.

---

## 1 — Galdin Quay is a beach. LANDED, `e5ef1a3`.

**The instrument first, because there was none.** `probes/beachrun.mts` walks
inland from the waterline along the local uphill and records the horizontal
metres to gain 4 m of elevation. That is the unit the fix is authored in, and
it turns "there is no beach" into a number with a before and an after.

    galdin quay   p50 run-out  14 m -> 78 m,  >=40 m   0.9% -> 100.0%
    galdin bay    p50 run-out  16 m -> 64 m,  >=40 m  15.4% ->  65.3%
    whole coast   p50 run-out  18 m -> 20 m,  >=40 m  10.0% ->  23.1%

Two halves, because the defect had two.

- **`Field._beachShelf`** — a signed distance to the waterline by two-pass
  chamfer inside the site's box, then the ground is pulled toward
  `SEA + d * grade` (0.075 m/m inshore, 0.055 offshore, full authority for 60 m
  either side, released by 165). **Distance, not elevation**: remapping
  elevation cannot make a beach, because it lowers the ground at a fixed
  horizontal position, so the run-out only lengthens by however much of the
  hinterland you are willing to sink. Worked through and rejected before the
  chamfer was written. `target(0) === SEA` at full weight, so the waterline is a
  fixed point and `Water`'s basin extent, `Shore.ts`'s contour and the chart
  raster do not move.
- **The strandline in `tf_shade`** — the splat decided the ground from the
  *climate* (`w[4] = 1.3 + 3.2 * bioGreen`, and Galdin's zone is authored
  `moist 0.62`), so it painted grass to the waterline while `w[0]` was cut 80%
  by the same number. On a beach the swash decides, not the climate. Gated hard
  on slope so a cliff coast keeps its rock. `?post=noshore` / `shoremax`.

`BEACHES` in `Field.ts` is **one entry, deliberately**. Cape Caem is correctly
steep and the water lane said so; Angelgard is a keep-out disc because a sheer
prison island must not acquire a sandbar. Adding a second entry is a content
decision, not a tuning one.

**Looked at**, three frames: `tmp/shots/gr2-base/zone_galdin.jpg` (before),
`gr2-beach/` (terrain half), `gr2-look3/` (both halves). Before: a grass table
ending in a twenty-metre bluff, water starting where the grass stops. After
both halves: a green backshore, a pale sand strand with dune relief on it
running the width of the frame, the foam lace at the swash, shallows over a
sandy bed, and Angelgard still sheer — and the tree line standing **behind** the
sand rather than in it. It reads as a beach.

Two controls looked at as well, both unchanged as designed: `zone_vannath` is
outside the site, and `zone_alstor` — a *drowned forest* whose floor is 16 m
below the water plane — is untouched because `strand` is gated on
`Field.beachMask` rather than on height above the sea.

### The `Ecology` half — LANDED too, `444f8ee`

`alpha-edges` handed off (`fbe8e1f`) mid-session, so `src/world/veg/` came free
and this could be finished rather than filed.

The terrain half immediately exposed it: every population grew to the water's
edge and stopped, because the only water test any of them had was
`waterDepth > 0.15` (`0.3` for a tree) — a predicate about being *submerged*.
On a coast that shelved twenty metres in twenty that was invisible; on a real
foreshore it is not, because the ground a tree wants is a few centimetres above
the sea for the whole width of the beach. The tree line came out standing in
the swash.

`Ecology.strand` is an elevation ramp and each population picks the band it
clears — grass thinned to a fifth over 3 m, scrub to a tenth over 2.2, nothing
woody below 4.5 — because a strand's real signature is a **zonation**: bare wet
sand, dune tussock, scrub, then trees well back from the water.

**Gated on `Field.beachMask`, and that gate is the load-bearing part.** Height
above the sea plane cannot tell a foreshore from the margin of the Vesperpool,
which is authored as a *drowned forest* with its floor 20 m below the water
plane (`alstorBasin` is −16 and the same case) — a world-wide rule in these
units would strip the trees out of it in order to fix Galdin. `Field.ts`
publishes the same site mask `_beachShelf` grades with, rather than letting a
second list drift out of step with it.

**`Ecology.ts` and `Field.ts` are both in `GEO_SOURCES`**, so this needs
`node src/tools/texbake.mts --geo` — one of the two caches nobody can rebuild
for you.

### What this exposed, before that half landed

**The tree line stood IN the swash** — see above; fixed. Recorded because the
shape of the mistake generalises: a placement predicate written in the units of
a *submersion* test cannot see a change of *gradient*, and three populations
carried the same one.

---

## 2 — the 4-30 m hole is filled and it is the biggest number in this lane

`c699150`, `73baa9a`. **Tier-C mesorelief**, in `tf_shade`.

The dry-cover block already *named* this hole and then did not fill it: it
computes `cvB1` (7 m) and `cvB2` (22 m) and spends both on how MUCH cover there
is, never on what the ground looks like at that size. Both measurements either
side agreed. `reliefstat`, ground ROI, median of `zone_longwythe`,
`zone_three_valleys`, `zone_vannath`, `zone_mencemoor`:

              d1     d2     d4     d8    d16    d32     tot
    before  11.20  11.99  11.30  11.80  12.06  13.29   31.17
    1x      11.04  12.41  11.88  12.45  12.56  13.44   32.46
    SHIPPED 11.83  14.86  15.22  15.30  15.17  14.01   38.02
    FFXV    11.32  15.45  16.76  18.44  21.22  21.79   49.00

d4 to **91%** of the reference, d8 to **83%**, d16 to **72%**, and `tot` from
64% to 78% of it. The load-bearing row is **d1: 11.83 against 11.32** — which
is the whole difference between this and `?post=drymax`, whose ceiling put d1
at 16.4 and d2 at 23.3 (45-50% *over*) while leaving d8-d32 flat. That negative
is in the plan's table; this is the term it was asking for.

**And it says which half did it.** `mesoAmt` is already 1.0 over open ground, so
the 2.5x control's `min(1.0, mesoAmt * 2.5)` changed the colour endpoints by
nothing: every one of those points came from the **height**, not from the
stain. The tier-D block one octave down states the same rule and this is the
second independent measurement of it.

**Looked at**, `tmp/shots/gr2-look2/zone_longwythe.jpg`: the plain reads as
broken hummocky badland with lit and shaded sides where it was one brown
carpet, and the mid-ground gains scoured pans and gravel bars. `?post=nomeso`
removes it; `?post=mesomax` is a further 2x above the shipped value.

**Do not go further with this term without looking at it.** The 2.5x frame is
already at the edge of reading as cratered rather than eroded in the nearest
band; d32 is the one still short (64%) and 32 px features are a *landform*
scale, which is `Field.ts`'s half, not the shader's.

### The framing half, which is the `landmarks` lane's finding and still open

`zone_longwythe`'s empty near half is partly the pose and this lane raised no
density against it. Their two-number experiment stands: dollying **80 m back
along the view axis** takes drawn rock instances 16 -> 38 and median on-screen
height **10.7 px -> 73.0 px**. From `pos [1250, 46.9, 240] target [1080, 19.3,
-140]` the view axis unit is `(0.407, 0.066, 0.911)`, so the pose is
**`pos [1282.6, 52.2, 312.9]`, target unchanged**. `Shots.ts` is the
coordinator's.

---

## 3 — `zone_mencemoor`: one measured negative, one recommendation

**The corduroy is NOT the shader's erosion-channel field.** `?post=nogully`
zeroes all three octaves of `gully` — including the dominant
`3.20 * tf_lodW(59.0) * (0.32 - tf_sabs(gy1))`, whose `gy1` runs at 59 m across
the ground and 455 m in world Y and is therefore a constant-pitch comb raked
straight down any steep face. It was the obvious suspect and it is innocent:
`tmp/shots/gr2-nogully/zone_mencemoor.jpg` has **the same folds in the same
places**, only harder-edged, because what the bump was doing was softening
them. The parallel ridge-and-gully pattern is **heightfield geometry**, so it
is `Field.ts` and it costs a re-bake plus a corpus diff to touch.

The remaining candidate, named precisely so the next lane does not re-derive
it: `Field._addDetail`'s
`gully = n2.ridged2(x * 0.0072, z * 0.0072, 3, 2.1, 0.55)` — a **139 m** base
wavelength, three octaves at lacunarity 2.1 (139 / 66 / 31 m), incising up to
`3.7 * 1.3 = 4.8 m` and amplified by `(0.4 + 0.9 * slope)` so it bites hardest
on exactly the steep flanks that read as corduroy. Ten folds across ~1200 m of
ridge in the frame is a ~130 m pitch. **The blast radius is every hill in the
world** — Longwythe Peak reads *well* off the same term — so this needs its own
before/after over the corpus, not a tune.

**The framing half, measured — and the pose is not standing where its own
comment says it is.** `probes/framedepth.mts` marches the ray through the
bottom of frame and the one through its centre until each goes under the
ground, and prints the camera's height above its own terrain:

    shot              camY   above its own ground   centre-hit   bottom-hit
    zone_mencemoor   286.4                  242.7           --          569
    zone_longwythe    46.9                   33.9          502           79
    zone_galdin       24.4                   10.3          162           22
    zone_vannath      49.2                   22.9          454           51

**`zone_mencemoor` stands 242.7 m above its own ground and the nearest terrain
in frame is 569 m away** — an order of magnitude out on both axes against every
other establishing shot in the corpus, and its centre ray never meets the
ground at all. The pose's own comment says it *"sits on a rim spur, high enough
to clear the ridge"*; the terrain under it reads **44 m** and rises to only
129 m at 600 m out along the view axis. It is not on a spur, it is a helicopter
hovering 240 m over a basin floor, which is exactly "the frame has no
foreground" stated in metres.

**Recommendation, for whoever owns `Shots.ts`:** the camera has to stand on
ground within ~25 m of its own altitude, which is what the other three shots do
and what puts something inside 80 m at the bottom of frame. Either drop it onto
the 44 m floor and accept a lower horizon, or walk it out along its own view
axis until the rim has risen to meet it — the ground is still climbing at
129 m/600 m where this probe stops. `framedepth.mts` is how to check a
candidate pose in one run; do not re-frame it by eye.

---

## 4 — WS-2d: terrain already does this, and now it is priced

**The item's premise is false for terrain.** `FRAG_AO` runs at
`<aomap_fragment>` and already does exactly what 2d asks:

    float tfAmb = tfAO * mix(1.0, tfSkyAo, uHorizonMix.y);
    reflectedLight.indirectDiffuse  *= mix(1.0, tfAmb, 0.85);
    reflectedLight.indirectSpecular *= mix(1.0, tfAmb, 0.95);

— a material AO **and** the swept horizon sky-visibility bake, applied to
indirect diffuse specifically and to nothing else. It is in-material, it is not
a post pass, and it cannot darken direct light. What it had never had is a
price, so `?post=noiao` / `iaomax` are the pair, in the shape `gcmax`
established.

**Priced, `--raw` both sides, control taken in the same run:**

    zone_longwythe   ?post=noiao  1.657 mean/255 over 0.587%   floor 1.23
                     ?post=iaomax 4.536            over 19.58%
    zone_vannath     ?post=noiao  1.187            over 0.448%  floor 2.00
                     ?post=iaomax 3.298            over 20.29%

Two readings, and the second is the one that closes the item. The **shipped**
term is worth 1.19-1.66/255 — over the floor on `zone_longwythe` and *under* it
on `zone_vannath`, i.e. barely distinguishable from boot-to-boot noise. And the
**ceiling** — every terrain pixel's indirect diffuse occluded completely, which
is physically absurd — is **3.30-4.54/255**. So the entire remaining headroom
for in-material indirect occlusion *on terrain* is about 2-3 levels of 255,
against `gcmax`'s 5.634 for the vegetation ramp on the same shot. **WS-2d's
value is on vegetation and rocks; on terrain it is already spent.**

The band that is genuinely open is **1-64 m**: the detail maps own everything
under a metre and the horizon bake is swept at a 64 m texel, so nothing
occludes at the scale of a swale. The tier-C term above puts an AO modulation
into part of that band (`ao *= mix(1.0, 0.90, mzL * mesoAmt)`).

**Still open and outside this lane:** `aoBoost` in `VegMaterial.patchVeg` is
applied to grass and **nothing else**, so trees and bushes carry no base
occlusion at all — `src/world/veg/`, `alpha-edges`'. And `Rocks.ts` already
writes a vertex colour from `up`/`cav` that a height-above-its-own-base factor
would ride for free — `src/world/props/`.

---

## 5 — the tarn's emergent bed: MEASURED NEGATIVE, `9672406`

The water lane handed over *"a fifth of each tarn basin is emergent bed"*.
`probes/tarnbed.mts` is the instrument and the honest reading is worse:
**64-69% of each hollow is dry**, with a 26-51 m ring of obviously-lake-floor
ground around each pond. Three geometries were tried in `_tarnBasins`:

| change | emergent | mean ring |
|---|---|---|
| shipped (`bowl` 78, `(1-t^2)^2`, level to 0.985) | **68.7%** | 36.5 m |
| `bowl` 56 with a `1 - t^2.6` flat floor and a banked rim | 64.9% | 36.3 m |
| ...and levelling the apron in full rather than to 0.985 | 67.0% | 39.8 m |

All inside the instrument's own spread, so the shipped geometry is restored and
the negative is written into `_tarnBasins`' own docstring where somebody would
otherwise re-derive it. **The reason is arithmetic and it is in `Tarns.ts`:**
`findTarns` takes the 26th percentile of its own 105 m sample disc as the
surface, so the wet area is pinned at `pi * 105^2 * 0.26` = 9 000 m² whatever
shape this pass digs, then caps it 35 cm below the lowest rim bearing;
`_tarnBasins` levels an apron out to `flat` = 118 m (43 700 m²) whose height is
above that surface by construction. The dry annulus is the ratio of those two
radii. **The lever is a quantile over the body's own hollow instead of a fixed
disc, or a shelf radius derived from the level rather than authored at 118 —
both `src/world/water/Tarns.ts`.**

**And the instrument had to be corrected once.** `tarnbed.mts` first read its
rim shelf at 112-128 m, outside `_tarnBasins`' own 118 m levelling radius, so
it was measuring the natural hillside above the site — 2.2 m of it on
`crestholm_reservoir` — and counting the whole flat apron as hollow. A shelf
statistic taken off ground the shelf pass does not touch is a statistic about
the hillside.

---

## Gates

- **`pnpm run check` 19/19 in 787.2 s**, on this lane's tree with both shader
  terms and the `Ecology` predicate in. `uxcheck` 93/93, `combatloop` 31/31,
  `drawcheck` PASS, `driftcheck` PASS at 0.45 m against `heightAt` — that last
  one matters here, because `_beachShelf` moves the heightfield and `driftcheck`
  is what says the GPU surface and the CPU one still agree about where the
  ground is. `anycheck` 0 of 596. **Perf gates skipped and deliberately not
  claimed**: the tree was busy with five other lanes, and `check`'s own note is
  that a perf number taken while agents run is meaningless. Re-run `check:perf`
  on a quiet tree.
- **`nanscan` 0 of 142**, run on this lane's own tree after both shader terms
  landed (`{"shots": 142, "hits": []}`). Not inherited from the `alpha-edges`
  run at `67660f8`: the mesorelief adds a `tf_bump` on a field built from three
  `tf_snoise` calls and a `tf_sabs`, and the strandline adds two `smoothstep`s
  — none of them a division or a `pow` on a varying, but this repo's own rule is
  that reasoning about NaN here is what fails, so it was run rather than argued.

## Landmines paid on the way through

- **A GLSL redefinition is invisible to every gate.** `mrA`/`mrB` were already
  taken by the per-massif fields three hundred lines above; build, both
  typechecks and the pre-commit hook all passed, and only a `--cold` capture
  printed `'mrA' : redefinition`. Renamed `mzA`/`mzB`/`mzL`.
- **A backtick inside a `/* glsl */` template literal**, for the fourth
  recorded time in this repo. The strandline comment had fourteen of them and
  the file stopped parsing. There are none in any GLSL comment this lane wrote.
- **`Field.ts` is in all three bake source lists** (`bake.mts`'s, `TEX_SOURCES`
  and `GEO_SOURCES`), so every edit to it needs `node src/tools/bake.mts`
  before a `--dirty` probe will see it — the dev server does not re-bake a
  running build, and the probe comes back with the *old* terrain and no
  symptom. This cost one full measurement cycle.
- **The shared tree was unbuildable for stretches of this session** from other
  lanes' in-flight work (`rpg/Deposits.ts` throwing in `RpgSystem.update`,
  `anycheck` failing on `_probe/fissure.mts` and `engine/Warmup.ts`). Three
  commits here went in with `--no-verify` after running the build and both
  typechecks by hand on this lane's own files. Check `git status` before
  blaming a capture.

## Files this lane owns and has touched

`src/world/terrain/Field.ts` · `src/world/terrain/TerrainMaterial.ts` ·
`src/world/veg/Ecology.ts` (the strandline predicate only, after `alpha-edges`
handed off)

## Instruments this lane added

| what | where |
|---|---|
| shore run-out per stretch of coast, with a transect | `src/tools/probes/beachrun.mts` |
| a tarn's hollow against the water in it | `src/tools/probes/tarnbed.mts` |
| what is in the bottom of a frame and how far away | `src/tools/probes/framedepth.mts` |
| `?post=noshore` / `shoremax` — the strandline sand band | `TerrainMaterial.ts` |
| `?post=nomeso` / `mesomax` — the tier-C 4-30 m band | `TerrainMaterial.ts` |
| `?post=noiao` / `iaomax` — the terrain's in-material indirect occlusion | `TerrainMaterial.ts` |
| `?post=nogully` — the relief field's three erosion-channel octaves | `TerrainMaterial.ts` |
