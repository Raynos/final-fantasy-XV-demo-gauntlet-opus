# Landmarks — the Meteor, the skyline, the birds, and Leide's middle distance

Owner: the landmarks agent (`PORT=5550`), 2026-08-23.
Branch: `worktree-agent-a84e7588d2e1a63e7`, merged up from `main` at the start.
**Created 248 commits behind `main`** — that is now seven agents in a row and it
really should be a worktree-creation step. A fresh worktree also has no
`node_modules` and no `src/public/`; both need a symlink to the main checkout
before anything runs, and `mkdir -p src/public` before the `baked` symlink.
The `node_modules` symlink shows as untracked in `git status` because
`.gitignore`'s `node_modules/` has a trailing slash and git sees a symlink as a
file. **Do not commit it.**

Predecessors: `project/handoff/midground.md` (whose open-items list was this
lane's brief), `project/handoff/modeling.md`, `project/handoff/variety.md`.

**Status: five commits landed, all gated. `pnpm run check` 11/11, `anycheck` 0.**

---

## The headline, and the one thing to read if you read nothing else

**`gully` — a named, documented, tuned terrain feature on every rock mass in the
world — has never displaced a single vertex, anywhere, since it was written.**

`rockGeometry`'s gully pass evaluated its ridged field at `P / size`. `size` is
not applied at that point in the pipeline: the normalisation that multiplies by
it is eighty lines further down, so `P` is still the unit-radius blank, about
0.85 at its widest. Dividing that by a 585-metre `size` evaluated the entire
noise field inside a box three thousandths of a unit across, and simplex noise
over that domain is a constant. Measured before touching anything, four thousand
samples on the Meteor's largest mass:

    as written (P/size): ridge range 0.00000 .. 0.00000
    unit space         : ridge range 0.00000 .. 0.99968

Identically zero. The probe is ten lines and is in `tmp/gullyprobe.mts`.

What makes it worth the top of this file is not the bug, it is **the paragraph
that was sitting on top of it**. The code comment recorded "at a gentle slope
this is a broad uniform shrink and does nothing visible — which is what 2.2
measured as", and `meteorMass`'s docblock then argued *from that observation*
that "the relief that does work at this range is `gully`, which is why it is at
0.34 and not `shard`'s 0.3". The observation was correct. The inference drawn
from it was never tested, and the response to a term that did nothing was to
turn it up. That is `LANDMINES.md`'s "Diagnoses that were wrong" pattern
exactly, and the coordinator reports this is the **sixth "declared but never
executing" system found in this session alone**.

The rule that follows: **when a term measures as doing nothing, check that it is
being evaluated at all before you conclude anything about its frequency, its
amplitude or its shape.** A ten-line probe that prints the range of the field
would have caught all six.

---

## What landed

### 1. `d5bf523` — the `gully` domain fix

Above. `gully` is only used by `Megastructures` (`shard` and `meteorMass`), so
the blast radius is the Meteor and the ejecta shards. It changes the shape of
every one of them, for the first time.

### 2. `ceaa2bb` — `relief`: step fracture on the Meteor's cleave faces

Both round-9 judges named the Meteor independently. The mid-ground lane had
already answered the obvious question from the code — it is *not* untextured,
`M.stone` is a real `rockMaterial` with albedo/normal/roughness, `splitNormals`
bakes per-face triplanar UVs, and `uvScale` tiles them eleven times across the
mass. **The defect is that sixteen half-space cuts leave sixteen genuinely
planar faces, and a hundred metres of constant normal under one directional
light is a hundred metres of one value.** No tint fixes a missing gradient.

`relief` is a new `rockGeometry` term: a *terraced* displacement along the
vertex normal. Terraced rather than smooth because a conchoidal fracture surface
is covered in step and hackle — the crack front runs at different depths in
adjacent patches and leaves a riser — which is the same thing the cut pipeline
already does, one octave smaller. `round(f * steps) / steps` leaves each patch
genuinely planar with a hard riser between, and `splitNormals`' 26° threshold
keeps it.

**The mesh had to come first and that is the transferable part.** `detail: 10`
is 2 420 triangles, one every seventeen metres on a 585 m mass. No displacement
can express a feature the mesh cannot hold. `detail` now scales with `r` to
about a seven-metre triangle; the five masses together are ~125 000 triangles.

Two calibration failures, both looked at:

- **0.06 at 3.6, three octaves of a two-octave `fbm3`** put the finest term at a
  fifteen-metre wavelength on a mesh with seven-metre triangles. A quantised
  field at the mesh's own frequency snaps its terraces to triangle edges: the
  mass came back a heap of loose triangular shards — crumpled foil, and *worse*
  than the flat facets. `tmp/crop/L1-met-mm.jpg`. It uses `simplex3` straight
  now, because an `fbm` hides an extra octave inside itself.
- **Quantising the fine octave as well** left the left mass covered in isolated
  bright triangles. Where the noise is locally flat its level set is a thin
  wandering curve, so the riser is a one-triangle ribbon, and a ribbon that
  catches the sun on a face otherwise turned away reads as glitter.
  `tmp/crop/L4-left.jpg` against `tmp/crop/L5-left.jpg`.

`gully` then had to be **ablated to zero and retuned** from 0.34 to 0.20 at a
broader 3.0 — at 0.34 the flutes take a third of the radius off the foot of
every mass and the base comes apart into plates. On the evidence of that
ablation **`gully` is the larger of the two contributors**; `relief` breaks the
faces above the flute line.

Cost, one shot per capture:

| shot | tris before | after | calls |
|---|---|---|---|
| `zone_mencemoor` | 7 009 808 | 7 122 448 | 443 -> 443 |
| `zone_longwythe` | 8 071 812 | 8 184 452 | 598 -> 598 |

**Zero draw calls.**

### 3. `b3f4822` — Insomnia: a population, a surface, and something to stand on

Four independent defects. The atmosphere lane had already *disproved* aerial
perspective as the cause (79% hazed, converging), so all four are geometry and
material.

1. **Every tower was exactly `0x5d6470`.** Fifty-eight buildings sharing one
   albedo cannot read as fifty-eight buildings. `M.city`/`M.cityLit` read vertex
   colours now and `_tower` stamps one tone per tower through the merge. Free.
2. **Every tower was built to the same proportion** — `cuts = [0.52, 0.31,
   0.17]`, `widths = [1.0, 0.82, 0.63]`, three sections, always. A repeated
   *rule* is as legible at three kilometres as a repeated mesh. Two to four
   sections now, shares drawn and normalised, plus a fifth crown kind and an
   aerial on two towers in five.
3. **`concreteMaterial` was the wrong instrument by four orders of magnitude.**
   Its features are a 26-cell worley pit and a 40-octave grain; at `texelBox`'s
   55 m per tile those are 20 cm and 13 cm, and at three kilometres a pixel is
   2.5 m. Every tile mips to its own mean. New `curtainMaterial` in
   `PropMaterials.ts` is authored at the surviving scale: four structural bays
   per tile (13.7 m pier pitch, ~5 px), six floor bands, per-bay value jitter so
   a five-pixel rhythm is not a moire generator, ~1.5:1 pier-to-glass with the
   hue on the glass.
4. **The city was standing on nothing.** Everything in `_capital` sits on one
   flat plane at world y = 150 and `zone_longwythe`'s camera is at y = 47. Any
   tower whose foot cleared the intervening ridge showed its podium soffit
   against the sky.

**The measured negative here is the fourth one, and it cost three capture
rounds.** A plinth under the whole city is the obvious fix and it is wrong:
`landmark_insomnia`'s camera is 1.7 km out, so any mass wide enough to carry a
1.9 km city reaches past it and renders as a mesa filling the foreground
(`tmp/shots/S9/landmark_insomnia.png`). A clean 9-sided frustum also reads as a
*table* — its rim is a ruled horizontal line across the frame
(`tmp/crop/S5-sky-lw.jpg`). Sinking it below the ridge makes it invisible and
the towers float again (`tmp/crop/S6-sky-lw.jpg`, `S7-sky-lw.jpg`). What works
is local: a 190 m skirt frustum under each tower plus ninety low-rise blocks
sunk 150 m, and clamped placement so no tower lands off the mass.

Cost: `landmark_insomnia` 396 -> 396 calls, `zone_longwythe` 598 -> **599**.
One draw call, repeated to confirm it is not capture noise. I did not chase the
+1 to its cause and it is 8.7 µs.

### 4. `1730688` — the birds

Round 9's judge named them unprompted. The mechanism: one `InstancedMesh`, one
geometry, and the only per-instance variation was a **uniform** scale and a yaw
that follows the circle — so two birds on opposite sides of the same thermal at
the same scale are pixel-identical mirror images, which is exactly "repeat
visibly in pairs". Now: non-uniform scale (wingspan 0.80-1.24 against body
length 0.88-1.18, independent), per-bird bank and an oscillating pitch, and a
wingbeat on two birds in five implemented as a modulation of the *span* —
a flapping raptor's wings foreshorten, and at four pixels that is the wingbeat.
Zero draws, zero triangles. `tmp/crop/B0-birds.jpg` vs `tmp/crop/B1-birds.jpg`.

### 5. `7324bca` — tors, for Leide's middle distance

The mid-ground lane proved instances of the *existing* dressing cannot close
this (every bush card in `zone_longwythe` is 0.955 mean/255 over 2.0% of pixels,
under the noise floor; the card ring is 90% saturated). **Cropping the 150-700 m
band at 3x says what is missing in one look: nothing in that band stands more
than two metres off the ground.** `tmp/crop/mid-lw.jpg`. It is not a texture
deficit and not a density deficit — there is no vertical.

`_genOutcrop` now builds **tors**: four to seven of the existing rock blocks
stacked into a 16-30 m pinnacle. Every block is an instance of a mesh already
resident in a group already drawn, so it is placement arithmetic:

| shot | tris before | after | calls |
|---|---|---|---|
| `zone_longwythe` | 8 187 120 | 8 442 000 | 599 -> 599 |
| `zone_vannath` | 10 055 539 | 10 289 539 | 728 -> 728 |

**Zero draw calls.** It also honours `_genOutcrop`'s own eleven-metre ceiling
rather than raising it: each block is still a boulder, the *stack* is the
landform.

Four things captured and looked at:

- **Hanging the tor off the outcrop site test put every one of them where the
  outcrop field already was.** `q`'s patch term is a 0.007 field, clustering at
  ~140 m, and in `zone_longwythe` every surviving site sat past 900 m — the band
  the judge is describing came out exactly as empty as before. Tors have their
  own offset and threshold now.
- **A flat 0.30 probability turned Longwythe into Monument Valley** — forty tors
  of one height evenly spread, trading "a kilometre of nothing" for "a wall of
  copies". `tmp/crop/T2-zone_longwythe.jpg` is kept because it is the more
  instructive of the two failures. Now 10% almost everywhere, 58% inside the
  knots of a 240 m field.
- **One form repeated is the defect it is fixing.** Three: a tapering pinnacle,
  a fin of two or three y-stretched spires, a wide low boss. Factor-of-three
  height spread, which is what stops a field of them being a comb.
- **A 0.55 block overlap leaves a visible dark seam** and at
  `zone_three_valleys`' range the stack reads as a cairn. 0.45.

`zone_vannath` gains as much as Longwythe does and was not a shot this lane was
aimed at.

---

## Blind round 10

`tmp/ab/r10/` + `tmp/ab/r10/KEY.json`. Eight pairs: **five real and three
plate-vs-plate controls**, shuffled into neutral `panel-NN.jpg` names, judged in
one set by one fresh agent with no repo access, asked explicitly which panel is
the **shipped** one and told that "CANNOT TELL" is a real answer.

    real     5 identified, 0 fooled, 0 hesitated   — 4 HIGH, 1 MEDIUM
    control  3 of 3 declined ("cannot tell"), 0 false positives

**The crop rule, which is the thing round 9 got wrong twice.** Every panel in
the round — ours and the plates — is the **top 52% of its own source, full
width**, produced by one pass of `tmp/topcrop.mts`. Round 9b's control panels
were tighter crops of their sources than the real panels were of theirs, which
strips the composition and aerial perspective that make a shipped frame legible
and made the control *harder* than the test. One identical rule removes that by
construction.

**Why the top and not the middle: the plate corpus cannot support a
landscape-only round any other way.** Two subagents surveyed all 53 plates and
then the crops. Of the eight landscape candidates, exactly **two** are clean
whole-frame (`duscae-thunderstorm-03`, and `duscae-wilderness-04` only after the
crop); every other one has a character, a car, a chocobo, a monster or a HUD.
Our renders never have any of those, so "this panel has a person in it,
therefore it is the shipped one" is a cue about the *corpus* and not about the
rendering. Two of the four plates used carry birds in the sky, which is fine —
we have birds.

**Three defects in this round, stated so nobody treats it as clean.**

1. **The control is not independent evidence.** The judge declined all three
   plate-vs-plate pairs, but its stated reasoning was recurrence: *"both panels
   are scenes that appear elsewhere paired against obvious demo frames"*. It
   solved the control by counting which images repeat, which is round 9a's leak
   in a new place. With four usable plates and five of our frames there is no
   way to build eight pairs with no image used twice. **The real verdicts do not
   depend on this** — every one of their reasons is about rendering — but the
   control did not test what it was built to test.
2. **The top-52% crop removes our foreground**, and the judge's single stated
   cue was the mid-ground. It is judging a band we deliberately handed it. The
   cue is still worth taking seriously; the *strength* of it is not measurable
   from this round.
3. Only three of the four plates are land, so two real pairs put a dry plain
   against open water. Scene-mismatched pairs are not what this instrument is
   for.

### What the judge said, which is more useful than the score

Its single most reliable cue: **the mid-ground** — *"every demo frame has
nothing between the foreground terrain and the horizon... mid-ground population
never once misled me."* The tors did not close it. Its three named giveaways:

- **"Terrain that reveals its mesh."** *"Smooth symmetric cone mountains, blobby
  noise-field hills, visible triangulation, and a single texture stretched
  across facets."* **This is new, it is `src/world/terrain/`, and "visible
  triangulation" on `landmark_insomnia` is a specific, findable defect nobody
  has named before.**
- **"Clouds that are blurry billboards rather than a rendered layer"** — no
  underlighting, no scale variation, no thinning at the horizon. Named every
  round since 5 and still outside every lane.
- **"Placeholder architecture."** *"Repeating extruded skyscraper prisms with
  tiled window textures"*, and *"a black untextured slab with a red light strip
  for a bridge"* — the latter is the dreadnought or the viaduct, not the city.

**Two things moved, and they are the honest headline.**

The Meteor's *facets* are gone from the complaint. Both round-9 judges spent a
reason each on "visible flat polygon facets"; this one does not mention facets
anywhere. What it says instead is **"a floating rock arch"**, twice, on
`zone_longwythe` and `zone_vannath` — the Meteor sits above the intervening
ridgeline and does not connect to any ground. **That is a new, specific and
actionable defect and it is the next thing to fix on this landmark.** The mass
is at `(-1020, -2160)` seated by `seatY(...) - 90`; from 3-5 km the -90 is not
enough to bury its skirt behind the ranges, and the ejecta ring is too small in
radius to read as a crater rim at that distance.

The skyline moved from *"a cluster of flat blue prisms"* to *"extruded prisms
with tiled window textures"*. That is the surface half landing and the
silhouette half not: the towers still read as prisms. `curtainMaterial` did what
it was built to do and the thing left is that **a tower is still a box with a
crown on it.** Real setback massing — L-plans, notches, twin slabs with a gap,
chamfered corners — is the untried axis, and it is free.

---

## What is left, ranked by what round 10 actually said

0. **The Meteor floats.** Round 10's judge called it *"a floating rock arch"*
   twice, unprompted, on two different shots — replacing "visible flat polygon
   facets", which is gone. `_meteor` seats the group at
   `seatY(eco, x, z, 400, CULL) - 90` and from 3-5 km that is not enough to put
   its skirt behind the intervening ranges; the 420-800 m ejecta ring is also
   too tight to read as a crater rim at that range. **This is the highest-value
   next step on this landmark and it is cheap** — a deeper seat, a wider and
   lower ejecta apron, and possibly a few masses whose feet are genuinely below
   the local ridge line.

1. **The towers are still prisms.** Round 10: *"repeating extruded skyscraper
   prisms with tiled window textures"*. The surface half of `b3f4822` landed —
   the judge can see the windows — and the silhouette half did not, because a
   tower is still a box with a crown on it. The untried axis is **massing**:
   L-plans, notched shafts, twin slabs with a gap between them, chamfered
   corners, a few towers rotated off the grid. All of it is free; `_tower` is
   merged into two materials.

2. **The Meteor's albedo is still flat, and `vertexColors` is off for it on
   purpose.** `M.stone` is `rockMaterial(0x8b7f6d, 0.95, false)` because
   `rockGeometry` bakes a cavity/dust colour whose mean is ~0.55 and applying
   that to a material not calibrated for it rendered the mass near-black. The
   cheap fix nobody has tried: **normalise that bake to mean 1.0** behind an
   option and turn `vertexColors` on for the Meteor. It would give the mass
   large-scale albedo variation for zero draws, which is the one axis this lane
   did not spend. Not attempted — no time, and it is a change to a shared
   generator that every instanced rock in the world reads.
3. **The Meteor's normal map is grain, not rock.** `uvScale: 22 / (r * 1.95)`
   puts 22 tiles across the mass; at `zone_mencemoor`'s 1.46 m/px a tile is
   18 px and the map's own detail lands sub-pixel, so it reads as film noise.
   Dropping to ~8 tiles is a one-line experiment. **Untried — I ran out of
   turns before I could ablate it, and it should be ablated rather than
   assumed.**
4. **The +1 draw call on `zone_longwythe`** from the Insomnia commit. Stable
   across repeats, single-shot on both sides, not chased.
5. **`landmark_meteor`'s framing looks stale.** Camera `(-900, 55.7, 1400)`
   targets `(-1400, 104.4, 1620)` — north-west — while the Meteor moved to
   `(-1020, -2160)`, which is 3.5 km due *south*. The shot is doc'd as "the
   Meteor of the Disc backlit" and I do not believe it contains it. `Shots.ts`
   is the coordinator's; this is a report, not a change.
6. **The city is quite saturated and quite crisp for 2.8 km.** It reads as a
   real skyline now, which is the win, but a judge could call it under-hazed.
   `curtainMaterial`'s contrast came down once already (`tmp/crop/S3-sky.jpg`
   against `tmp/crop/S4-sky.jpg`); it may want one more step.
7. **Painted clouds with hard alpha edges**, named every round since 5 and
   again in round 10 — *"no underlighting, no scale variation, no thinning at
   the horizon"*. Still outside every lane that has run.
8. **Not this lane's, but nobody has named it before and round 10 did:**
   *"terrain that reveals its mesh — visible triangulation, and a single
   texture stretched across facets"*, specifically on `landmark_insomnia`'s
   ridges. `src/world/terrain/`. It is a specific, findable defect and it was
   this judge's first-named giveaway.

---

## Traps this lane hit or confirmed

- **An orphaned vite/chromium from your own captures fails four gates in
  0.07 s each** and prints a bare node stack. `npm run check` came back 7/11
  immediately after a merge — `uxcheck`, `creaturecheck`, `combatloop` and
  `roadcheck`, all of which need the server `check.mts` spawns. `uxcheck` run
  standalone passed 93/93 in the same tree. `node src/tools/cleanup.mts --kill`
  and re-run: 11/11. **Do not report a post-merge gate failure without
  cleaning up first** — the failure looks exactly like a real regression from
  the merge.

- **`manifest.json` draw counts are capture-order dependent**, again. A six-shot
  run reported `zone_mencemoor` at 423 calls and a single-shot run at 443, with
  no code change. Every number in this file is one shot per capture on both
  sides.
- **A term that measures as doing nothing may not be running.** See the top of
  this file.
- **The obvious fix for a floating object is a bigger ground.** It is not, when
  another camera stands on that ground. Three plinths were built and captured
  before that was clear.
- **Overcorrection reads as a different defect, not as "too much".** The first
  Meteor relief and the first tor density both produced frames that a judge
  would fail for the *opposite* reason, and neither looked like "the parameter
  is high" — they looked like new bugs.

---

## Shots

- `tmp/shots/L0/` — the state as inherited, five shots, PNG.
- `tmp/crop/L0-met-mm.jpg` vs `tmp/crop/L4-met-mm.jpg` — the Meteor at 2x from
  `zone_mencemoor`, before and after. The pair that carries the Meteor argument.
- `tmp/crop/L0-met-lw.jpg` vs `tmp/crop/L5-met-lw.jpg` — the same at 3x from
  `zone_longwythe` at 3.3 km: a flat paper cutout, then a crag.
- `tmp/crop/L1-met-mm.jpg` — the shattered-foil overcorrection.
- `tmp/crop/L4-left.jpg` vs `tmp/crop/L5-left.jpg` — the glitter fix.
- `tmp/crop/L0-sky-lw.jpg` vs `tmp/crop/SA-sky-lw.jpg` — the skyline at 4x from
  `zone_longwythe`, before and after.
- `tmp/crop/L0-landmark_insomnia.jpg` vs `tmp/crop/SA-landmark_insomnia.jpg`.
- `tmp/crop/S5-sky-lw.jpg`, `S6-sky-lw.jpg`, `S7-sky-lw.jpg`,
  `tmp/shots/S9/landmark_insomnia.png` — the three rejected plinths.
- `tmp/crop/B0-birds.jpg` vs `tmp/crop/B1-birds.jpg` — the birds at 4x.
- `tmp/crop/mid-lw.jpg` vs `tmp/crop/T1-mid.jpg` — the Leide mid band at 3x.
- `tmp/crop/T2-zone_longwythe.jpg` — Monument Valley, the tor overcorrection.
- `tmp/shots/T4/` — five zones after everything, JPEG.
- `tmp/ab/r10-panels/`, `tmp/ab/r10/` + its key — blind round 10.
- `tmp/gullyprobe.mts` — the ten-line probe that found the dead gully.
- `tmp/topcrop.mts` — the matched-fraction panel cropper written for round 10.

---

## Files touched

- `src/world/props/Rocks.ts` — `gully` domain fix, new `relief` term, `_genTor`.
- `src/world/props/Megastructures.ts` — `meteorMass` density and relief, `tint`,
  `_tower` grammar/crowns/aerials/skirt, `_capital` low-rise and clamps.
- `src/world/props/PropMaterials.ts` — new `curtainMaterial`.
- `src/world/props/Wildlife.ts` — per-instance bird variation.

Nothing in `src/characters/`, `src/world/terrain/`, `src/world/veg/`,
`src/engine/` or `src/game/Shots.ts`.

---

## My honest grade for the environment, against shipped FFXV

**4.5 / 10**, the same number the last two lanes claimed, and I am not claiming
more. Five of five real pairs identified, zero hesitation. That number has not
moved since round 2 and this lane did not move it.

What this lane can defend. The Meteor of the Disc was named by both round-9
judges for the same defect — *visible flat polygon facets* — and that phrase
does not appear anywhere in round 10. It is a crag now rather than a pillow,
and the 2x crops before and after are a different object, not a different tint.
The mid-ground lane's "kilometre of empty plain" has objects in it for the first
time. The birds are individuals. All of it cost **one draw call across four
systems**, and three of the four are exactly zero — which is the part I would
most want the next lane to take: on a submission-bound frame, per-instance
variation, mesh density inside an existing merged group, and placement are all
free, and almost everything this lane did was one of those three.

And one measured result that should stop somebody re-deriving it: **`gully` was
never running.** Six systems in this session have now turned out to be declared
and never executing. The instrument that found it was ten lines and thirty
seconds, and the reason nobody ran it earlier is that a well-written comment
already explained the symptom.

What keeps it at 4.5. The judge's first-named cue is still the mid-ground, on
the frame I spent the most turns on. The towers are still called prisms — the
surface landed and the massing did not. The Meteor traded one named defect for
another: it no longer has flat facets, it floats. And two of round 10's three
giveaways — cloud billboards and terrain that shows its mesh — were never in
this lane's directories and have now been named by four consecutive judges with
nobody assigned to either.

The frame is better than I found it in four specific, measured places, and it is
still obviously ours.
