# Lane 12e — the judge's landscape tells (2026-08-31)

Round 17's tells **#2 "terrain as one texture instead of geometry"** and
**#4 "stamped, tiling cloud sprites"**, specifically the two halves nobody had
taken: the cloud shadows that do not land on the terrain, and the diagonal
weave across the massif.

Owns `src/world/terrain/` (not `Field.ts`), `src/world/veg/`, `src/world/Sky.ts`,
`src/world/sky/`, `src/shaders/clouds.glsl.ts`. Added
`src/tools/probes/shadowscale.mts` and `src/tools/weavestat.mts`.

**Every capture in this file is at or after `b831213`**, i.e. after the
`Float16`/`geo.bin.gz` blown-white fix in `e848801`. Nothing here was judged
from a clipped frame.

## 1. Cloud shadows were 1/3.5 the size of their clouds — a projection error

**LANDED**, `54692e7`. **Verified by eye and by instrument.**

`Clouds.ts`'s `SHADOW_FRAG` bakes the ground shadow tile by evaluating the
cloud field over `uShadowTile * uShadowFieldScale` metres.
`sky/MaterialPatch.ts:120` maps that tile onto `uShadowTile` metres of ground.
**The two spans have to be equal or the shadow is not the cloud's shadow.** Any
`uShadowFieldScale` but 1.0 is a magnification error of exactly that factor. It
shipped at 3.5 clear, 5.0 overcast, 7.0 storm, with a comment defending the
magnification on grounds ("several patches inside the playable world") that are
`uShadowTile`'s business, not this uniform's.

**The instrument**, `src/tools/probes/shadowscale.mts`. Autocorrelation
half-length of the baked shadow tile and of the weather map's coverage channel,
each converted to metres through its own world span; ratio is the answer. Two
synthetic gratings exactly 3.5x apart go through the same code every run and
the run is VOID if that does not come back — it does, **3.48 against 3.50**.

Clear sky, before:

```
preset      tile   fscale  fieldSpan  r(tex)  patch(m)  cloud/patch  m/texel   T p05  T<0.8
clear       2700    3.50       9450   18.91       199         9.24      5.3    0.03   25.3%
overcast    2700    4.97      13426   18.52       195         9.44      5.3    0.00   96.3%
storm       2700    6.96      18800   12.90       136        13.55      5.3    0.00   96.5%
```

Cloud feature **1844 m**; ground patch **199 m**. The shadows were there —
25.3 % of the clear tile is below transmittance 0.8, p05 is 0.03, so where one
lands it is deep — and they were a tenth of the size of what cast them. At
199 m a cloud shadow does not read as a cloud shadow; it reads as mottled
ground. That is the whole of "casting no shadow whatsoever on the terrain".

**The fix is two numbers**, as `project/TASKS.md` predicted: `shadowScale` 1.0
in all four presets, and `uShadowTile` 2700 -> **27000**. 27000 exactly because
it is `uWeatherTile`: at scale 1.0 the bake spans one full weather period, so
the tile's two edges meet and the ground wrap is seamless. The old 9450 m field
window inside a 2700 m ground wrap had edges that did not meet at all.

**A/B, twelve landscape shots, one build, `?post=set:ushadowfieldscale:1:ushadowtile:27000`,
every frame read by eye** (`tmp/shots/l12e-base` vs `tmp/shots/l12e-cs-fs1t27`):

- **`zone_callaegh` is the proof shot.** Base: the foreground summit dome is one
  uniform dull brown. Arm: a bright warm sunlit band along its crest and a large
  soft-edged dark sweep across the lower-left of the dome, with broad light/dark
  banding out on the mid-ground plain. It reads as a cloud casting that shadow.
- **`vista_noon`** loses a flat blue-grey veil over the whole massif for sunlit
  warm ridge tops against a broad soft shadow on the lower-left slopes.
- Seven unchanged; `vista_dusk` ambiguous (slightly cooler, duller foreground).
- **One regression: `zone_longwythe`** loses the fine dark dapple on its flats
  and reads flatter. That dapple *was this bug* — 199 m cloud-shadow mottle
  pretending to be terrain detail — so losing it exposes the already-filed
  tier-C mesorelief deficit rather than causing a new one.
- **No frame gained a seam, a crushed foreground or a stain.** Tiling edges were
  looked for specifically at 27 km wrap and none was found.

**Honest verdict: correct, cheap, worth about two frames in twelve.** It is not
on its own an answer to the judge. Residue below.

## 2. The massif weave is the runnel albedo, on three fixed world azimuths

**LANDED**, `04aacc9`. **Verified by eye**; see the instrument caveat in §3.

Attributed by **ablation**, and every obvious suspect was innocent. On
`vista_noon`'s left peak the pattern survives `?post=nogully`, `?post=nomeso`,
`?post=nomacroh` and `?post=nostoch` completely unchanged. `nostoch` is the
positive control — the stochastic-tiling sampler cut from three taps to one —
and the lattice it should bring back never appeared, **which by itself rules out
texture-tile repetition as the mechanism.** It collapses under `?post=gwhite`:
relative contrast on the face halves (rms/mean 0.22 -> 0.10) and the 2-D
autocorrelation recurrence (-0.12 at 6 px, back to +0.11 at 12-14 px) becomes a
monotone decay with no periodicity at all. **So: albedo, not geometry, not
normals, not lighting.** Two crossing families at 12-13 px and 7.6 px meeting at
**55 degrees** — not perpendicular, so not a UV tile either.

The 7.6 px family is the sedimentary bedding, which is a wanted Leide signature.
The 12-13 px family is `runnel`, `TerrainMaterial.ts:769-771`, and it was built
wrong: each octave's first noise coordinate was a dot of `P.xz` with a **fixed
world azimuth** and its second was `P.y * ~0.005`, which over 300 m of massif is
less than one noise cell. Each octave was therefore a family of parallel
**vertical planes ruled across the entire world** at 19 m, 6.5 m and 59 m on
three fixed compass bearings. Vertical planes do cut any surface in vertical
lines — which is why it looked right in isolation — but they cannot vary, so
every face on the planet got the same three bearings at the same three pitches.
The 19 m family crossing the bedding is the plaid.

**The fix is a bounded domain warp on the projection, not a rotation of it.**
The obvious move is to project onto the local fall line (`rawN` is already
fetched for `structSlope`, so the frame is free) and **it is wrong**, for the
reason the bedding comment 40 lines below already records: an absolute dot of
`P.xz` with a per-pixel direction has a derivative of `|P|`, so on a cone 10 km
from the origin the coordinate swings thousands of cycles across one face. That
is the same trap that once averaged the beds away on every massif off the
origin. Adding metres of low-frequency noise to the projection instead keeps
every iso-surface vertical while bending the family: two extra `tf_snoise`,
both inside the `structSlope > 0.295` branch, which does not run on flats.

**Verified by eye at 3x on the same 400x200 box, one build**
(`?post=runnelflat` vs shipped, `tmp/l12e/plaid-old.png` / `plaid-new.png`):
the old crop carries a clear tartan on the left peak's shaded face — regular
horizontal bands crossed by regular near-vertical ones, a visible grid. The new
crop has that region as irregular fluting following the fall line, with the
bands broken up and no crossing grid. `imgdiff`: **mean 2.706/255, max 63,
9.8 % of pixels past 8/255**, floor 0.39.

`?post=norunnel` removes the field entirely; **`?post=runnelflat` restores the
three fixed azimuths exactly as they shipped**, so the defect stays runnable off
one build and a future judged round can be told which half moved.

## 3. `weavestat.mts` — built, calibrated, and it returned a negative

**LANDED as an instrument; the measurement it was built for is a NULL, and the
null is the instrument's, not the fix's.** `57eb5d4`.

Nothing here could see tell #2: `imagestats` reports means, `edgestat` crossing
widths, `reliefstat` a band pyramid, and all three score a rock face and a
tartan identically. `weavestat` high-passes a region, Hann-windows it,
decomposes onto a polar grid of plane waves (36 directions x 24 periods, 4-40 px)
and reports the fraction of the region's variance the strongest wave carries
(`peak`) plus the strongest wave at least 20 degrees away (`n2`). One direction
is fluting or bedding and legitimate; two crossing is a plaid.

Anchors run every invocation: **plaid n2 0.19, stripe 0.00, noise 0.00.**

**The first version measured autocorrelation and VOIDed itself on that anchor**
— stripe n2 0.93 against plaid 0.98 — and the reason is geometry, not a bug: the
autocorrelation of a single grating is 1.0 for *every* displacement along the
stripes, so a second strong direction is free for any striped field. An
instrument built that way scores a correct bedded cliff and a tartan the same.

**And the negative.** Across `04aacc9`, which visibly works, this statistic
reads **0.12 against 0.11**; on the tightest box (`520,500,60,50`) both arms
report the same wave, 12 px at 85 degrees, `n2` under 0.04 in both.

That is the instrument answering a different question. Local periodicity was
never the defect — both arms are locally a 12 px near-vertical band family,
because runnels *are* a band family and are meant to be. The defect was that it
was the **same** family everywhere, and "repeats across the entire massif" is a
claim about coherence between distant regions that no single-ROI statistic can
hold. **The next version wants the spread of `deg` over many separated boxes on
unrelated faces, not the peak inside one.** A low pair here is not evidence of
absence, and that warning is at the top of the file.

## 4. The bare silhouette — investigated, priced, NOT landed (not this lane's file)

**It is a slope test, not a range test, and it costs ZERO draw calls.** That is
the surprise: the budget was never the obstacle.

Probed on `vista_noon` (`tmp/probes/massifrock.mts`): **1381 rock instances
live, farthest 1150 m**, so nothing is out of range. By slope band:

| slope | instances | mean height |
|---|---|---|
| `< 0.20` | 1191 | **4.09 m** |
| `0.46-0.60` | 33 | 2.92 m |
| `0.60-0.70` | 15 | 2.36 m |
| `> 0.70` | 9 | 2.15 m |

The massif carries **4 % of the stone field at 60 % of the size**, and nothing
on it exceeds 9.6 m against 23.4 m on the flat. `Ecology.rockScatter` has **no
slope reject at all** — it asks for rock out there and `rockSuit` returns
0.9-1.0 on the face. The shrinking happens downstream, in
`src/world/props/Rocks.ts:2498`: `size *= (1 - steep * 0.62)`, which is 0.38x
at slope 0.56. `:2198`'s outcrop taper `smoothstep(slope, 0.58, 0.8)` is second.

**The price is zero draw calls.** `Rocks.build` (`:2604-2620`) makes exactly
**8 `InstancedMesh`es, one per kind, both LOD tiers sharing one mesh** — a
deliberate past decision — and streaming tiles `emit` into those same eight,
bumping `mesh.count` only. Live caps have headroom: granite 318/890, bedded
462/940, slab 364/730, spire 141/570, worn 30/650.

**Proposal, ready to apply:** `Rocks.ts:2498` `0.62` -> ~`0.25` for BIG kinds,
and `:2198`'s taper to `(0.72, 0.92)`. 4-7 m blocks where 2 m ones are, inside
batches that already draw.

**Not landed: `src/world/props/` is not in this lane's ownership list.** Filed
in `project/TASKS.md` with the file:line and the numbers. Two caveats from the
same probe, and they matter: `emit` **silently drops** instances once a group
cap fills, so watch granite/bedded; and **leave `_genTor`'s 0.30 slope ban
alone** — a 20 m stack on a 30-degree face has metres of seat error and that
ban is load-bearing.

## 4b. The untextured cones: a measured negative

`?post=nostructfade`, `e123436`. Everything in the detail block is gated on
`structSlope` crossing 0.295-0.34, and past 2200 m `structSlope` hands back to
`length(N.xz)` off a normal `tf_surfNormal` has deliberately low-passed — which
flattens a distant face toward zero. The comment above the `mix()` names that
exact mechanism as the reason the raw grid is read at all. So: remove the
hand-back, and the strata and runnels should come back on the cones.

**They do not.** `zone_callaegh`, one build, the token against shipped:
**imgdiff mean 0.260/255 against that shot's own measured noise floor of 2.00**,
0.083 % of pixels past 8/255. Closed.

The remaining candidate is **`tf_lodW`**, which retires each relief octave by
its own screen footprint — contributing at 4 px wide, gone by 2 px — and will
have retired all three long before 2.2 km. Different fade, different argument,
not priced. The conical *shape* is `Field.ts` and belongs to nobody here.
Whatever turns the detail back on out there is traded against the horizon hatch
the fade exists to stop, and **that hatch is a crawl: a still frame cannot
clear it.**

## 4c. Not done
- **No perf number was taken.** Nothing landed changes a loop count, a fetch
  count or a resolution: two uniform values, four preset constants, and two
  extra `tf_snoise` inside a branch that only runs on ground steeper than 17
  degrees. A perf number taken on a trunk with several lanes capturing is
  suspect (`LANDMINES.md:1081`) and none was taken.

## 5. Traps this lane hit, for whoever is next

- **`shoot.mts --extra post=...` does not parse in this build.** The flag is
  `--ablate <token>`, which becomes `post=<token>` on the page. `--post` never
  reaches the page at all (already in LANDMINES).
- **A leased probe page has not stepped a frame.** Read `uShadowFieldScale`
  before a `settle()` and you get **30**, the constructor default, against a
  clear preset's 3.5 — and `uCovRange` (0.30,0.62) against (0.42,0.92). Half an
  hour went into "the entire weather preset system is dead" before
  `g.applyShot(...); g.settle(40)` made it 3.5. Every probe here now settles
  first and says why.
- **`_pushWeatherUniforms` set `_shadowDirty = true` unconditionally, every
  frame**, so the 512^2 x 48-`cloudDensity`-sample shadow bake — which
  `Clouds.ts` documents as landing "on one frame in four" — ran **every frame**.
  Measured with one line of monkey-patching (`tmp/probes/bakecount.mts`):
  **60 calls in 60 frames**. **FIXED**, `da050d2`; re-measured **15 in 60**.
  No millisecond figure is quoted — the trunk is busy and `contention()` cannot
  see a co-agent — but the call count is determinate and does not care.
- Backticks inside a `/* glsl */` template literal terminate the string. A
  comment written in this repo's normal style broke the typecheck once.

## 6. Gates

- `pre-commit` — build, both typechecks and four cheap gates — **passed on all
  four code commits**.
- `drawcheck` — **PASS, 31 of 31 shots under 800, headroom 53 on the worst
  shot.** Nothing this lane landed adds geometry or a draw.
- **Not run: `pnpm run check`** (coordinator owns the suite), and **no perf
  number**, deliberately: see §4.
- One transient block worth recording: `weavestat` could not commit for two
  attempts because `pre-commit`'s tree-wide typecheck was red on another lane's
  in-progress `src/ui/screens/WorldMapScreen.ts` (`TS2304: Cannot find name
  'dim'` / `'fmtDist'`). It cleared on its own. The shared tree has to stay
  parseable between edits, not only at commit.

## 7. Residue for `project/TASKS.md`

Written out ready to paste:

- **The cloud-shadow scale error is fixed and the shadows are still only on a
  quarter of the ground.** `shadowScale` is 1.0 and `uShadowTile` 27000, so a
  patch is now the size of its cloud (measured 199 m -> cloud-sized under a
  1844 m field). 25.3 % of the clear tile is below transmittance 0.8, which is
  right for fair weather, so most compositions correctly sit in sun: two of
  twelve landscape shots gained a readable cast shadow. Making more frames show
  one is a **coverage or framing** question — TASKS already forbids deepening
  `cloudShadow`, and lane 5 measured that weakening it would be physically
  wrong. `lane12e`
- **The shadow bake runs every frame, not every fourth.**
  `Sky.ts:_pushWeatherUniforms` sets `_shadowDirty = true` unconditionally and
  it is called from `update()` every frame, so `Clouds.renderShadow()` — 512^2
  texels x 48 `cloudDensity` evaluations, "by some way the most expensive thing
  in the sky" by its own comment — never takes the every-fourth-frame path it
  was written for. The fix is to set the flag only when a value actually
  changes. Wants a perf number on a quiet tree. `lane12e`
- **`weavestat` cannot see a global repeat, only a local one.** It is calibrated
  (plaid n2 0.19, stripe 0.00, noise 0.00) and it read 0.12 -> 0.11 across a fix
  that visibly removes a plaid, because the defect is coherence between distant
  faces and the statistic is per-ROI. Wants a version scoring the spread of
  `deg` over many separated boxes. `lane12e`
- **The massif silhouette has no rock or scrub scatter on it**, which is the
  half of the judge's tell #2b that terrain shading cannot answer, and the same
  band as the filed tier-C deficit (`longwythe` d16 15.58 / d32 19.23 against
  `FFXV-ground` 21.42 / 23.60). Priced against `drawcheck` 745/800 before
  anything is added. `lane12e`

## 8. Where the shots are

- `tmp/shots/l12e-base` — twelve landscape shots, shipped at `b831213`.
- `tmp/shots/l12e-cs-fs1t27` — the same twelve with the cloud-shadow fix as a
  uniform override off the same build.
- `tmp/shots/l12e-runnel-old` / `-new` — `?post=runnelflat` against shipped,
  `vista_noon`, `windpump_flats`, `zone_longwythe`, PNG.
- `tmp/l12e/plaid-old.png` / `plaid-new.png` — the 3x crop of `480,470,400,200`
  on `vista_noon` that shows the tartan and its removal.
- `tmp/shots/l12e-final` — `storm`, `vista_overcast`, `vista_fog`,
  `zone_callaegh` at HEAD with everything landed. **Read by eye:** `storm` is
  healthy blue-grey rain with a readable ridge, wet asphalt and a lit forecourt
  — no crushed black and no seam from the 27 km wrap; `zone_callaegh` carries
  a large soft-edged cloud shadow across the lower-left of its foreground dome
  under a sunlit warm crest, with broad light/dark banding on the plain behind,
  and its rock now reads as weathered stone rather than as a plaid.

## Commits

| sha | what |
|---|---|
| `54692e7` | cloud-shadow projection: `shadowScale` 3.5/5/7 -> 1.0, `uShadowTile` 2700 -> 27000, plus `probes/shadowscale.mts` |
| `04aacc9` | runnel albedo de-plaided; `?post=norunnel` / `?post=runnelflat` |
| `57eb5d4` | `src/tools/weavestat.mts` and the negative it returned |
| `da050d2` | shadow bake back on its documented every-fourth-frame stride |
| `11e67c0` | `?post=nostructfade`, so the untextured-cone hypothesis could be priced |
| `e123436` | ...and the measured negative it returned |
| `914d2a3` | `project/TASKS.md` residue, including the zero-draw-call scatter item |
