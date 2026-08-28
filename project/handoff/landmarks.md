# landmarks — WS-5: the Meteor, the landmarks, massing

**Owner:** the `landmarks` lane, wave 2, 2026-08-28. **Owns** `src/world/props/`.
**Brief:** `docs/plans/2026-08-26-opus-the-standing-backlog.md` §WS-5, all items.
Results and the four negatives are written into that plan (§WS-5 result block
and the negatives table); this file carries the state and the next step.

Every claim below is marked **VERIFIED BY EYE**, **MEASURED**, or **UNVERIFIED**.

---

## The measurement that reframed most of this lane

`discCrater` is a real crater and nobody had read its profile. A radial sweep of
`Terrain.heightAt` around the Disc centre `(-1020, -2160)`, 20-degree steps,
0 to 2400 m (**MEASURED**, scratch probe, the rig `probes/meteor.mts` uses):

| r (m) | 0 | 200 | 400 | 600 | 800 | 1000 | 1200 | 1400 | 1600 |
|---|---|---|---|---|---|---|---|---|---|
| ground | 253 | 11–56 | 2–48 | 3–84 | 132–352 | 93–416 | 37–225 | 30–249 | 3–202 |

A **253 m central peak**, a **moat at 3–56 m from 200 to 600 m out**, and a **rim
at 800–1000 m standing 130–420 m over that moat**. Two live bugs followed:

1. The four outer Meteor masses stand 320–360 m from the centre — **in the
   moat** — so the previous round's full ground-follow dropped each about 180 m
   and their crowns finished *below* the rim. From outside the crater, which is
   every camera, four of five masses were invisible and the fifth was a lone
   dome. The seat had reintroduced the exact "one rounded outline owns the
   silhouette" that five masses were authored to cure.
2. The 420–800 m ejecta ring was **in the moat too**, walled off from every
   camera by the crater's own rim. That is why fixing its seat last round made
   it visible and changed nothing.

**MEASURED and not mine to fix:** `zone_mencemoor`'s camera is
`pos [400, 286.4, -1200]` and the ground there is **44 m** — the camera the
shot's own comment describes as standing "on a rim spur" is **242 m in the air**.
`Shots.ts` is the coordinator's.

---

## Landed

| sha | what | state |
|---|---|---|
| `b1db957` | Meteor texture scale is world-referenced (metres per tile), not per object | **VERIFIED BY EYE** |
| `7fdd391` | Mass seat follow 0.35, the prow, apron + crater rim | **VERIFIED BY EYE** |
| `7cb498e` | Tower massing: six plans, and the skirt is concrete not a white cone | **VERIFIED BY EYE** |
| `c2e2295` | Every POI boulder is a real `rockGeometry` on a real `rockMaterial` | **VERIFIED BY EYE** |
| `94a6429` | `assertAttributeContract` wired into `PartBuilder.build` + `probes/attrcontract.mts` | **MEASURED** (256 pairs, 191 binding, 0 broken, control throws) |
| `d3b4ba9` | Stacked-rock joints planned against the **sunk** position + `probes/stackjoint.mts` | **MEASURED** (122 open joints of 1615 → 0) |
| `53de19d` | Rills and a tonal break on the apron batter; `PoiKits.PAD_R` published | **MEASURED**, only marginally visible — see below |
| `b386f6f` | The four negatives and the WS-5 result block, into the plan | — |

Draw calls, HEAD against the start of the lane: `zone_mencemoor` 319 → 319,
`landmark_meteor` 631 → 632, `zone_longwythe` 485 → 486, `zone_vannath` 637 →
639, `landmark_insomnia` 295 → 295, `town_forecourt` 786 → 787. The +1/+2 is one
POI compound gaining `M.rock`, which is a colour pass plus three cascades and
only appears in a frame containing such a compound. **`town_forecourt` sits at
787 against a budget of 800** — pre-existing, not this lane's, worth somebody's
attention.

### The one non-obvious mechanism, worth carrying forward

**A seat that is right for a slope is wrong for a bowl,** and **a joint authored
on an un-sunk position opens once the sink is applied.** Both are the same
shape of error: a placement rule stated in one frame and consumed in another.
`probes/stackjoint.mts` composes the shipped plan through the shipped
`placedScale` for exactly that reason — it does not copy the sink formula.

---

## What the eight review shots show (all captured and read, VERIFIED BY EYE)

The §WS-5 claim that six had not been captured since `6306fc6` is **stale** —
all eight are captured and read, and **`floatcheck` runs now**; the `socket hang
up` is gone (PASS: 0 POI floats, 0 buried, 355 instance floats worst 0.31 m
against a baseline of 362).

- **`zone_mencemoor`** — **it no longer reads as a floating rock arch.** The
  overhang and its undercut are gone; the mass steps down to a broad right
  shoulder; rim blocks read as a shattered rampart at its foot on both sides
  (clearest at frame (400–700, 400–520)); the base runs into continuous ground
  with no sky under it; and the fissure glow is visible from this camera for the
  first time. **It is still one dark monolith rather than a cluster of angular
  peaks, and it is low in chroma against a bright sky.** That is the honest read.
- **`zone_longwythe`** — before, the Meteor's bottom was a hard horizontal cut
  with pale sky under it. Now the base runs continuously down behind the ridge
  and the mass has a shoulder. 3× crop `tmp/shots/lm-r1p/met.png`.
- **`zone_vannath`** — same, a shoulder where there was a cut thumb.
- **`zone_three_valleys`** — the skyline was a smooth haystack of near-identical
  combs; now slender spires, a dominating central tower and visible sky gaps
  inside twin plans. 2× crops `tmp/shots/lm-tvbase/sky.png` vs
  `tmp/shots/lm-tw2/sky.png`.
- **`landmark_insomnia`** — notches, L-wings, twin gaps and stepped setbacks
  where there were flat rectangular slabs; the two white lampshade skirts are
  now textured concrete podia.
- **`zone_ostium_gorge`**, **`vista_noon`**, **`zone_taelpar`** — read; nothing
  of this lane's is wrong in them beyond the item below.

---

## Open, in the order I would take them

1. **The seven kits that build from bare `BoxGeometry`** — `_imperial`, `_tomb`,
   `_landmark`, `_dungeon`, `_chocobo`, `_menace`, `_haven`. `_block`/`_hut` are
   the templates and `TownKit.texelPlace` / `PartBuilder.texelBox` are the
   mechanism (re-UV every piece to the constant world texel density its material
   wants, from `TEXEL`, keyed on material name; boxes get a true per-face planar
   projection off the vertex normal). **The tomb first** by its own docstring —
   and `tmp/shots/lm-poi/poi_tomb.jpg` shows why: at that shot's framing the
   tomb is a **40-pixel featureless grey box** at (785–830, 365–400) against a
   red-ochre hillside. Untouched by this lane.
2. **`_haven`'s shelf is the cake stand at `poi_haven`, not the apron.** MEASURED
   and worth stating because the plan's bullet points at the wrong object:
   `gradePad` already replaced the faceted drum with a real cut-and-fill
   earthwork. What reads as a cake stand in `tmp/shots/lm-hv2/pad.png` is
   `_haven`'s own `shelf()` — two courses of wobbled `CylinderGeometry` with a
   hard circular rim, at `PoiKits.ts` ~line 725. A shelf a haven sits on is a
   slab of weathered basalt with a broken edge, not a turned drum.
3. **`53de19d`'s rills are only marginally visible and I could not prove them
   beautiful.** `imgdiff` on `poi_haven` warm-vs-warm: mean **1.162/255**, max
   146, **1.04% of pixels** past 8/255 against a recorded *cold* floor of 0.66 —
   a real band, and the band is the batter. By eye at 4× the toe is now darker
   than the crest where it was one value and the face carries a faint
   undulation. **The two other POI shots that frame a pad (`poi_parking`,
   `poi_imperial`) are both on near-level ground where the batter is under a
   metre**, so no shot in the corpus can show this properly. Either frame one, or
   judge it at a pad on a real slope.
4. **`_genOutcrop` is still ungraded** — needs the plan/seat split `_genTor` got
   and a `rock:outcrop` family in `silhouette.mts --set rocks` (~30 lines in
   `rockSubjects`). Untouched.
5. **The Meteor is still one dark monolith.** The prow and the float are gone;
   the cluster is not there. The untried lever the archive names and this lane
   did not reach: normalise the rock generator's cavity/dust vertex-colour bake
   to mean 1.0 behind an option and turn `vertexColors` on for `M.stone`, for
   free large-scale albedo variation. **It changes a shared generator every
   instanced rock reads** — measure `hero_full` and `zone_longwythe` on both
   sides.
6. **An unexplained levitating boulder.** `tmp/shots/lm-rock/r1.png` is a 5×
   crop of `poi_imperial` at (1270,300,180,190): a boulder hanging a clear metre
   above another, against sky, with a third under that. It is **pixel-identical
   across the `stackPlan`, `torPlan` and `_genOutcrop` fixes**, so it is not a
   corestone stack, not a tor and not an outcrop course. `floatcheck` says
   nothing floats past 0.31 m and `probes/stackjoint.mts` says no joint is open.
   Whatever it is, it is a *fourth* thing. Same read appears in
   `zone_ostium_gorge` and `landmark_insomnia`. **Start by identifying the mesh**
   — project the instance matrices into the shot camera and match the screen
   position, which is what I ran out of budget to do.

## Negatives — do not re-open (full rows are in the plan)

- **`_exclusions` is not the grass leak.** It is a POI-versus-POI *placement* ban
  list. The leak is `Ecology._layoutClearings`'s linear cone plus two missing
  `FRAC` keys (`tomb`, `landmark` — 33 of 123 POIs get no clearing at all).
  Grass passes its gate on **97–99%** of every pad while every other population
  is rejected on **100%**. **Fix belongs to `src/world/veg/`**; `PoiKits.PAD_R`
  is published for it.
- **The town plaza is clean at HEAD** — `cleared > 0.06` rejects 100.0% on the
  Hammerhead deck, mean `grassDensity` 0.067 against 0.627 in open country.
- **`zone_longwythe`'s empty near half is the framing.** Neutralising the road
  sweep and the POI pad entirely buys 5 instances and **zero** legible ones. The
  camera stands 30 m from a 33.4 m tor and points 48° away from it. A two-number
  dolly in `Shots.ts` takes drawn instances 16 → 38 and median on-screen height
  10.7 px → 73.0 px. **Do not raise `rockD`** — it is a 6–9× lever.

## Rules this lane is carrying

- `uvScale` is **tiles per world metre**, not tiles per object. State texture
  scale in metres. Same error class as scaling a unit rock mesh.
- **Price a silhouette bench move before and after.** The unclamped joint fix
  breached two `silhouette --set rocks` floors on joints that were not open;
  clamping it to "only ever pull a course down" held all six and improved every
  one. The gate reads the working tree, so to get the *before* number run it
  against `git show HEAD:src/world/props/Rocks.ts` and restore.
- Geometry merged into an existing `PartBuilder` batch is free; a **new** merged
  mesh is **four** draw calls (colour + three cascades).
- `imgdiff`'s recorded floors are **cold**; a warm diff runs 4–6× them.
- The `--hide` warning in §WS-9 is stale as of `da7bfe2`.
