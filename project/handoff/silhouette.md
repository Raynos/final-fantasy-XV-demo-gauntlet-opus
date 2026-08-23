# Silhouette — the terrain that "reveals its mesh", and the Meteor that floats

Owner: the silhouette agent (`PORT=5580`), 2026-08-23.
Branch: `worktree-agent-afe111e3f3cccfc59`, merged up from `main` (16 commits) at the start.
Predecessors: `project/handoff/landmarks.md` (its round-10 write-up was this lane's
brief), `project/handoff/terrain-material.md`, `project/handoff/midground.md`.

**Status: two commits, both gated. `pnpm run check` 12/12, `anycheck` 0,
`perf` and `gameplay --baseline` both PASS with `RULER_VALID: true`.**

---

## The headline, and the one thing to read if you read nothing else

Round 10's judge named this first, and four consecutive judges have named
something like it:

> *"terrain that reveals its mesh — visible triangulation, and a single texture
> stretched across facets"*, on `landmark_insomnia`

**It is not triangulation. It is not the heightfield, and it is not GTAO.** It is
one band limit used for two jobs.

`bedRelief` — the metres of step a sedimentary bed makes out of a face — was
band-limited by `aaFade`, which is the fade the bed *colour* uses. `aaFade` holds
full contrast down to about **six pixels per bed** and only dies at **one and a
half**. For a colour that is right: a bed too fine to resolve should blur toward
its mean, and mush is what a distant stack ought to look like.

For a height it is catastrophic, because `bedRelief` is not read, it is
**differentiated**. `tf_bump` takes `dFdx`/`dFdy` of it in screen space. `bedA` is
a near-square pulse in `fract(sy1)`, and a full-amplitude square pulse whose edge
lands inside one pixel differentiates to a spike whose sign is set by where that
pixel centre happened to fall. **A sign that alternates pixel to pixel across a
whole face draws as a woven diagonal crosshatch** — and a judge reading that frame
calls it the mesh.

The fix is one expression. The relief gets its own limit, the same 4–8 px rule
`tf_lodW` already applies to every other octave of this field, written in the
bedding's own coordinate: full amplitude while a bed is 8 px or wider, gone by
4 px. `aaFade` is untouched, so no bed anywhere lost its colour.

```glsl
float bedReliefFade = 1.0 - smoothstep(0.125, 0.25, sw);   // sw = fwidth(sy1)
```

**The transferable rule, and it is more general than this shader: a term that is
read and a term that is differentiated do not get the same band limit.**
Differentiation multiplies by frequency, so a field that is acceptably aliased as
a colour is catastrophically aliased as a normal. Anywhere in this repo where one
`fwidth`-derived fade feeds both an albedo and a `tf_bump`, the same bug is
sitting there waiting.

---

## What landed

### 1. `aadc371` — band-limit the bedding RELIEF apart from the bedding colour

`src/world/terrain/TerrainMaterial.ts`, one expression plus its argument.

Measured, one shot per capture, `landmark_insomnia`:

| | before | after |
|---|---|---|
| whole-frame delta | — | mean **1.085/255**, 2.16% of pixels over 8/255 |
| latticed face 110×150, high-pass RMS | 11.33 | **8.65** |
| same patch, vertical autocorrelation lag 1 | 0.41 | **0.62** |
| same patch, lag 2 | 0.11 | **0.41** |
| same patch, anti-diagonal lag 1 | 0.24 | **0.52** |
| draws / triangles | 396 / 7 088 556 | **unchanged** |

The autocorrelation row is the one that matters. A period-2 alternation shows as
a *low* neighbour correlation and a negative lag-2; after the fix the neighbours
are smoothly correlated in both axes. The checkerboard is gone, not damped.

`reliefstat` on the massif ROI says the same thing from the other side, and this
is the part that says the fix is a fix and not a deletion:

| | d1 | d2 | d4 | d8 | d16 | d32 | tot |
|---|---|---|---|---|---|---|---|
| before | 8.35 | 7.50 | 8.47 | 12.48 | 15.14 | 24.80 | 40.85 |
| **after** | **7.62** | 7.12 | 8.45 | 12.54 | 15.25 | 24.94 | 40.85 |
| `FFXV-ground` (n=6) | 7.13 | 9.23 | 10.57 | 12.33 | 14.68 | 17.05 | 35.27 |

`d1` moves from 117% of the reference onto 107% and **every band above it is
unchanged to two decimal places**. That is the signature of removing an aliasing
artefact and nothing else.

Where the relief survives was probed rather than assumed, because a band limit
that fires everywhere is a deletion wearing a fix's clothes. Writing
`bedReliefFade`, `aaFade` and pixels-per-bed into three colour channels: in
`zone_longwythe` the relief is alive on the near mesa and off on the far cone,
which is the behaviour asked for; the plain is outside the `structSlope` branch
entirely, as a pan should be; `aaFade` reads ~1 across both frames.

### 2. `83392d1` — the Meteor: seat every part on the ground under it

`src/world/props/Megastructures.ts`. Round 10's *"a floating rock arch"*, twice,
on two shots; the landmarks lane's open item 0.

**The cause is not the seat depth and not the ejecta radius.** `_meteor` placed
every one of its parts at a literal local y in the group's frame — which is a
**flat plane laid across three kilometres of real terrain**. The parts near the
centre sit right, because the group's own seat was measured there; everything out
on the skirt sits at a height belonging to somewhere else. The five masses span
650 m and the ejecta reaches 800 m, and the Disc is not level over any of it.

The ejecta had the same bug and worse. Its shards were placed at a bare
`s * 0.3` — that is `s * 0.3` above the **group origin**, which is ninety metres
*below* the ground, because the whole group is sunk 90 m to bury the masses' feet
and everything in it is sunk with them. So a 30 m shard's crown sat 30 m under the
surface and even a 74 m one cleared it by a fraction of what it was sized for.
**No capture in this project has ever shown a crater rim at the Disc.** Same
family as the dead `gully` the landmarks lane found: a system with a comment, a
tuned constant, and no output.

`ground(lx, lz, size)` is the fix and it is four lines. It reads `seatY` under the
part's own world position — rotating the local offset through the group's 0.6 rad
yaw, which nothing here was doing either — and returns the ground under it
*relative to the ground under the centre*. Zero at the centre, so every authored
height keeps its meaning and mass A is bit-identical: only the parts out on the
skirt move, which are exactly the ones that were wrong. Applied to the five
masses, the twenty-two fissure glow slabs and the thirty ejecta shards.

Cost: `zone_mencemoor` **443 calls and 7 279 408 triangles on both sides**. It
cannot be otherwise — nothing is added or removed, the same geometries go into the
same merged group and only their matrices change.

`tmp/crop/M0-men.jpg` against `tmp/crop/M1-men.jpg` is the pair that carries it,
2× at 1.7 km. Before: the mass's lower right is a hard cut with **pale sky visible
under the overhang**, and one fissure glow slab hangs in mid-air below the rock.
After: the mass continues down into the ridge, the intervening ranges cross
*behind* it, and the floating glow is gone.

---

## Measured negatives, recorded as first-class results

**Four ablations preceded the terrain fix and all four were negative.** They are
in the comment above `bedReliefFade` so nobody re-runs them.

| ablation | result |
|---|---|
| `--ablate nogtao` | **not GTAO.** `LANDMINES.md` records the chevron hatch as GTAO reconstructing normals from depth, and the brief said to ablate it first. It moves 16.9% of the frame by more than 8/255 and leaves the lattice **pixel-identical**. |
| foreshortening-corrected `tfPx` (`/= abs(dot(V,N))`, up to 12× more filtering) | **unchanged.** `tfPx` genuinely ignores grazing angle, so steep faces genuinely are under-filtered — and that is not this. |
| `tf_bump`'s determinant | **not it.** Probed: `det` is positive over the whole frame and `abs(det)/area` reads 1.0. Neither the floor nor the sign flip the previous lane guarded against is engaging here. |
| the `structSlope > 0.295` branch flickering per pixel | **not it**, and it was my own best guess — a binary branch driven by a point-sampled LOD-0 normal texel would checkerboard beautifully. Probed: `structSlope` is smooth and saturated across every latticed face and the branch is uniformly taken. |

**What named it was a probe, not a guess**, which is this file's own rule.
Rendering `relief` as albedo with the bump off shows a perfectly smooth field
(`tmp/crop/P-field-ridge.jpg`). Rendering `length(vec2(dFdx(relief), dFdy(relief)))`
shows the weave wall to wall (`tmp/crop/P-grad-ridge.jpg`, and `P-grad-x8.jpg` at
8× where it is a bare pixel checkerboard). Splitting that derivative into
`|dFd(gully)|`, `|dFd(wash)|` and `|dFd(bedRelief)|` across the three colour
channels: **only the blue channel wove** (`tmp/crop/P-terms-ridge.jpg`).

### The combed-fur massif, and why I did NOT turn it down

The second half of the judge's sentence — *"a single texture stretched across
facets"* — survives the bedding fix. The near massif in `landmark_insomnia` is
covered in fine dark dashes raking down the slope that read as brushed fur rather
than rock (`tmp/crop/SIL1-massif.jpg`).

Localised, by ablation, to **the detail normal** `dN` — `Nw = mix(N, dN,
detailAmt)`. Two negatives on the way there: it is **not** the runnel colour
(`mix(1.0, 0.74 + 0.36*runnel, runnelAmt)` forced to zero: unchanged), and it is
**not** the implicit-LOD texture fetches inside the divergent `bw.x > 0.012` /
`w[3] >= wCut` branches (forced to `true`: unchanged — worth knowing, because that
is exactly the undefined-derivative bug this file warns about for `tf_stoch`, and
here it is provably not costing anything visible).

**Then `reliefstat` said do not touch it, and I did not.** On the massif ROI,
ablating `dN` moves `d1` from 7.62 to **6.36** and `d2` from 7.12 to **6.33**,
against the reference's 7.13 and 9.23. We are already *under* FFXV at the scales
the eye reads material; removing the detail normal takes us further under and
pushes `d32` from 145% to **181%** of the reference, because the broad light/dark
flutes are then all that is left.

So the fur is a **character** problem, not an **amount** problem. It wants a
different normal map or a less anisotropic triplanar projection on layer 3
(`rsV/rsH` runs 2–3:1), not a lower weight. Turning it down by eye would have
measured worse against the plates while looking calmer, which is the exact trap
`reliefstat` was built to catch.

---

## Blind round 11 — `tmp/ab/r11/` + `tmp/ab/r11/KEY.json`

Seven pairs: **four real and three plate-vs-plate controls**, shuffled into
neutral `panel-NN.jpg` names, judged in one set by one fresh agent that was given
the seven absolute image paths in a scratchpad outside the repo and told not to
search or read anything else.

**The one methodological change from round 10, and it closes that round's stated
defect.** Round 10's judge declined all three controls but solved them by
*recurrence* — "both panels are scenes that appear elsewhere paired against
obvious demo frames" — which is a cue about how the set was assembled, not about
rendering. **Round 11's controls share zero plates with its real pairs.** The four
real pairs consume `behemoth-deadeye-duscae-02`, `duscae-wilderness-04`,
`beast-party-plains-03` and `duscae-plains-lake-01`; the three controls use
`golden-hour-godrays-01`/`duscae-plains-chocobo-02`,
`rain-fog-prompto-03`/`duscae-thunderstorm-03` and
`party-roadtrip-galdin-01`/`water-lake-01`, and no plate appears twice anywhere in
the round. That is why there are three controls and not six: with 53 plates and
only a handful landscape-only, three is the most that can be built with no image
reused. Fewer controls with no leak beats more controls with one.

The judge was also told explicitly not to reason from characters, cars, monsters,
HUD or repetition — round 10's other identified defect.

### Result

    real     4 identified, 0 fooled, 0 hesitated   — 4 HIGH
    control  3 of 3 declined ("cannot tell"), 0 false positives
    score    4 / 10

**The control result is the most valuable thing in this round and it is not the
score.** Round 10's control was declined for the wrong reason and its own author
said so. Round 11's judge declined all three, and every reason it gave is about
*rendering*: "both frames show depth-correct water/haze and authored asset
density", "both have per-strand hair, translucent vegetation, correct sun
occlusion", "both show depth-correct fog, layered cloud, real material separation
on the character". **That is the first time in this project's history that the
control has been solved on the evidence it was built to test.** The instrument is
calibrated. A 4-identified/0-fooled from a judge that also declines three plate
pairs for rendering reasons is a real categorical gap, not a saturated
instrument — which is the question `--control` was written to answer and had not
yet answered.

### What the judge said, which is more useful than the score

**"Terrain that reveals its mesh" and "visible triangulation" do not appear
anywhere in this round.** Round 10's first-named giveaway is gone from the
complaint. What replaced it in the terrain slot is a *different* claim —

> **"Terrain that is one texture, not a material system."** *"The whole ground is
> a single noise field stretched over the heightfield, so slope and flat, ridge
> and basin all share one albedo and one roughness. Real ground changes material
> where water runs, where rock is exposed, where traffic wears it."*

— which is the splat's palette, not its filtering. The terrain-material lane
already named this as its own biggest untaken lever: `LAYER_ROUGH` spans
0.82–0.95 and the six `RECIPES` in `Layers.ts` have mean lumas 0.35–0.47, a ±15%
spread, so the splat can switch from dirt to gravel to scree and the value barely
moves. **That is now the judge's number two, it is a one-file change, and nobody
owns it.**

Its **number one is new and it is nobody's lane**: *"Nothing sits on the ground.
Every demo frame has objects that hover in the shading sense — a tree, a rock, a
bush with either a detached ellipse of darkness beneath it or nothing at all...
This is the single most reliable tell and it reads instantly at thumbnail size."*
The terrain-material lane flagged exactly this in round 3 — "nothing in these
frames casts a visible shadow onto the ground" — and it has gone unowned for
eight rounds. It is very likely the largest single item in the environment.

Number three is the atmosphere depth ramp and the cloud billboards, the latter
named every round since 5.

### Two limits of this round, stated so nobody treats it as clean

1. **`landmark_insomnia` is not in it.** It is the shot round 10 named and the
   shot this lane's first commit was aimed at, and it has no `PAIRING` row —
   a city skyline behind mountains has no scene-matched plate in a 53-plate
   corpus. The bedding fix is graded here only through `zone_longwythe`,
   `zone_vannath`, `zone_three_valleys` and `zone_fallgrove`, which do carry
   bedded rock faces but not the frame the complaint was written about. The
   direct evidence for `landmark_insomnia` is the 2× pair and the autocorrelation
   and `reliefstat` numbers above, not this round.
2. **`zone_mencemoor` is not in it either**, so the Meteor fix is graded here only
   at 3–5 km through Longwythe and Vannath, not at the 1.7 km where it changes
   most.

See `KEY.json` for the sealed key.

---

## Traps this lane hit or confirmed

- **A fresh worktree needs `mkdir -p src/public` before the `baked` symlink and a
  `node_modules` symlink to the main checkout.** Eighth agent in a row. Do not
  commit the `node_modules` symlink — `.gitignore`'s `node_modules/` has a
  trailing slash and git sees a symlink as a file.
- **`manifest.json` is overwritten per capture invocation, not merged.** A
  single-shot number taken and then followed by a two-shot run loses the first
  number. Take the count you intend to quote in its own invocation and read it
  from the `shoot` line, not from the file afterwards.
- **`LANDMINES.md`'s "diagnoses that were wrong" table is a lead, not an
  index.** It records the chevron hatch as GTAO, which was true for *that* hatch.
  Ablating GTAO first was still right — it cost one capture and it is the reason
  this write-up can say "not GTAO" as a measurement instead of an assumption.
- **`perf.mts` came back 229.4 fps mean / 136 worst against the brief's recorded
  243.7 / 148.** Both gates PASS, `RULER_VALID: true`. I cannot separate tree
  state from load: this tree is 16 commits ahead of the number in the brief, other
  agents were live, and the only runtime delta from this lane is one extra
  `smoothstep` inside an existing branch of the terrain fragment shader plus a
  handful of build-time `seatY` calls. Draw counts are identical on every shot
  measured. **Reported rather than buried, and not claimed as clean.**

---

## What is left, ranked

0. **The Meteor's overhanging prow.** The floating is fixed; the *arch* read is
   not entirely. There is a genuine overhang in `meteorMass`'s cut geometry on the
   right of the cluster, lit against sky, visible as the same lobe in all three
   shots (`tmp/crop/M1-van.jpg` most clearly). Seating cannot reach it. Two
   candidates, neither tried: less tilt on the mass that carries it — the `MASS`
   table runs to 0.46 rad, and a cleaved mass leaned 26° overhangs by
   construction — or rock behind it. **The ejecta ring is above ground for the
   first time and is the natural source of that rock**, but at 420–800 m radius
   and 20–74 m it is still hidden behind the intervening ridge from every camera
   that sees the Meteor. Widening it to ~1.5 km and 60–150 m would read as a
   crater rim at 1.7–5 km. **The constraint that binds it is `zone_mencemoor`,
   whose camera is 1.7 km out and looks straight at the Disc** — that is the same
   geometry that made a plinth under Insomnia wrong, so size it against that shot
   and not against Longwythe.
1. **The combed fur on the near massif.** Localised to `dN`, measured as *not* an
   excess-energy problem (above). Wants a different rock normal map or a less
   anisotropic layer-3 projection. Do not simply lower its weight — `reliefstat`
   says that makes it worse against the plates.
2. **`tf_lodW`'s 4–8 px rule is applied by hand at ten call sites and was missing
   at the eleventh.** Every octave of `gully` and `wash` carries one, `nfAmt`
   carries one, the sward and cover terms carry one, and `bedRelief` did not.
   Somebody should sweep for any remaining `fwidth`-derived fade that feeds a
   `tf_bump` and check it is the differentiated limit and not the read one.
3. **The implicit-LOD fetches inside divergent branches in the detail block are
   still there** (`if (bw.x > 0.012)`, `if (w[3] >= wCut)`) and are formally
   undefined. Measured as costing nothing visible on `landmark_insomnia`, so this
   is tidiness rather than a bug — but it is a landmine for whoever next changes
   the surrounding weights.
4. **Clouds** — named every round since 5, still outside every lane.
5. **The towers are still prisms** — the landmarks lane's open item 1, untouched.

---

## Files touched, and the only files touched

- `src/world/terrain/TerrainMaterial.ts` — `bedReliefFade`, and the comment block
  that records the four negatives.
- `src/world/props/Megastructures.ts` — `_meteor`: the `ground()` helper and its
  application to the masses, the glow slabs and the ejecta.
- `tmp/pitch.mts`, `tmp/mkround.py` — the autocorrelation probe and the round
  builder. Scratch, per `CLAUDE.md`.
- this file.

**Nothing under `src/world/sky/`, `src/world/Sky.ts`, `src/characters/`,
`src/world/veg/`, `src/engine/` or `src/game/Shots.ts` was touched.**

## Shots

- `tmp/shots/SIL0/` — `landmark_insomnia` as inherited. `tmp/shots/SIL1/` — after.
- `tmp/crop/SIL0-ridge.jpg` vs `tmp/crop/SIL1-ridge.jpg` — **the pair that carries
  the terrain argument**, 2× on the mid-left ridge. Diamond lattice, then rock.
- `tmp/crop/SIL0-massif.jpg` vs `tmp/crop/SIL1-massif.jpg` — the near massif at 2×.
- `tmp/crop/P-field-ridge.jpg`, `P-grad-ridge.jpg`, `P-grad-x8.jpg`,
  `P-terms-ridge.jpg`, `P-ss-ridge.jpg`, `P-relbump-ridge.jpg` — the probe series,
  in the order it was run.
- `tmp/shots/SIL-nogtao/`, `tmp/shots/SIL-aniso/`, `tmp/shots/SIL-nobump/` — the
  ablations. `SIL-nobump` is what the frame looks like with the relief bump off.
- `tmp/crop/A-norunnel.jpg`, `A-nodn.jpg`, `A-nodiv.jpg` — the fur ablations.
- `tmp/crop/M0-men.jpg` vs `tmp/crop/M1-men.jpg` — **the pair that carries the
  Meteor argument**, 2× at 1.7 km.
- `tmp/crop/M0-lw.jpg` vs `tmp/crop/M1-lw.jpg`, `M0-van.jpg` vs `M1-van.jpg`.
- `tmp/shots/P-fade/` — `bedReliefFade` / `aaFade` / px-per-bed in three channels
  on two shots. This is the capture that proves the fix is not a deletion.
- `tmp/ab/r11/` + `KEY.json`, `tmp/ab/r11real/`, `tmp/ab/r11ctl/` — blind round 11.

## Gates

`pnpm run check`: **12/12** — `build`, `anycheck` (0 `any`, ceiling 0), `orphans`,
`integration`, `uxcheck` 93/93, `creaturecheck`, `combatloop` 31/31, `roadcheck`,
`reachcheck`, `horizoncheck` (worst MCC 0.766, unchanged), `heightcheck`,
`driftcheck`. `perf.mts` PASS, `RULER_VALID: true`. `gameplay.mts --baseline`
PASS, `RULER_VALID: true`, worst segment 94.8 fps.
