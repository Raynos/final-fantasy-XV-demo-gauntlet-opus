# Handoff — `head` lane: the 3/10 face

Owns `src/characters/**`. Started from round 11's blind grade (3/10, 12 of 12
identified, 0 fooled) whose number-one finding was *"the characters have no
faces… a smooth flesh mask with no nose, no mouth, no brow ridge, no eye
sockets — the eyeballs are two spheres resting on the surface"*.

Commits on `main`: `d3a25f8` (probes + the bench-vs-frame resolution), `1db33a5`
(the head grid), `af7153b` (normal-map aliasing), `69142a3` (the crosshatch
diagnosis), `583ee7e` (probe metric correction).

**Gate status: 15/16 on the shared tree, and the 16th passes on its own.**
`creaturecheck` 207 poses PASS, `combatloop` 31/31 PASS, `silhouette` 42 meshes
PASS, `geocheck` PASS (its own summary names *"DoubleSide material hides a
flip"* — it is the gate closest to this work). `driftcheck` FAILed inside the
suite and **passes standalone** (`PASS, tolerance 0.05 m drift`), so that is
contention, not a regression. `floatcheck` is green now — another lane fixed it.

---

## 1. The bench and the frame disagreed. Here is why, measured.

`project/handoff/characters.md` §4 concluded from `headprofile.mts` that
`Face.ts` already has the anatomy and **§8.2's head rebuild is not justified**
(sagittal relief: slab 0.000 / ellipsoid 0.091 / sculpt-ablated 0.172 / heroes
0.445–0.497). A blind judge and the frame say the opposite.

**Neither is wrong. The bench is blind, and the sculpt was destroyed by the
tessellation.** Two separate facts, both measured.

### 1.1 The sculpt did not survive the grid — `src/tools/probes/brushsurvive.mts`

New probe. `--without <op>` ablation done **one brush at a time**, measuring the
displacement each brush achieves on the shipped grid against the same continuous
surface at 3–6×. Controls first, because seven instruments in this repo measured
themselves: **null ablation 0.000 mm, a synthetic 40 mm brush survives 0.995, a
synthetic 1 mm brush survives 0.000.**

```
BEFORE   grid  segU=76 segV=56  headVerts=4389
         row spacing mm  brow 9.17  eye 9.62  nose 8.81  mouth 6.52  chin 7.29
         col spacing mm  eye 6.75   mouth 5.56
         noctis: 45 brushes, 17 with <4 verts in support; face-front verts 611
```

**The entire front of the face — brow to chin, ear to ear — was 611 vertices at
5.6–9.6 mm spacing**, against a brush table authored at 3–10 mm radii:

| brush | radius mm | amt mm | verts in support | survival |
|---|---|---|---|---|
| **nostril openings** | 5.2 × 5.8 × 12.5 | −9.0 | **0** | 0.42 |
| alar crease | 5.5 × 9 × 14 | −5.5 | **0** | 0.80 |
| alar wings | 10.5 × 11 × 19.5 | +11.5 | **0** | 0.90 |
| philtrum columns | 5 × 9 × 17 | +4.2 | 1 | 0.54 |
| philtrum groove | 7.5 × 10.5 × 19 | −6.0 | 1 | 0.87 |
| mouth corners | 12 × 12 × 21 | −7.0 | 1 | 0.95 |
| nasion | 14.5 × 11.5 × 30 | −8.2 | 1 | 0.96 |
| cupid's bow | 10 × 5.5 × 20 | +3.8 | 1 | 0.98 |
| **mouth line** (60 mm wide) | 30 × **3.2** × 26 | −9.2 | **3** | 0.72 |
| lower orbital rim | 30 × 9 × 34 | +11.2 | 4 | 0.92 |
| upper vermilion | 26 × 9.5 × 26 | +11.5 | 5 | 0.89 |
| eye socket (main) | 36 × 24 × 46 | −30.0 | 8 | 0.99 |
| — cranium, for contrast — | 120 × 100 × 70 | −10.0 | **272** | 1.00 |
| — crown, for contrast — | 100 × 60 × 100 | −5.0 | **785** | 1.00 |

`survival` is max-displacement and is a *forgiving* statistic — one neighbouring
vertex catching the tail of a falloff scores 0.99 while carving nothing.
`vertsInSupport` is the **shape** statistic, and it is the one that indicts.
Gladiolus was the same or worse: 18 of 45 starved, 597 face-front verts.

So the anatomy was real, complete and correct **in `skullSampler`, the continuous
function**. It was annihilated by a 76 × 56 UV sphere that spent 785 vertices on
the crown and 611 on the whole face. That is exactly why a profile silhouette
looked like a face (the surviving brushes are the big ones, and a silhouette
needs only the extreme point) and a front-on portrait was a blank mask.

**Caveat on the metric, corrected in `583ee7e`:** `applyBrushes` sums every brush
against the vertex's *undisplaced* shell position, so that is where support must
be counted. Counting on the finished mesh reported the nose tip — a 20 mm push
along +z through a 28 mm z-radius — as having zero vertices in its own support.
It is counted on the shell now. It is still a lower bound for a brush that other
brushes have moved, and four brushes on the cheek and jaw sides still read 0
while scoring 0.98–0.99 survival for that reason.

### 1.2 The bench cannot see any of it — and now says so

`headprofile.mts` measures the **mid-sagittal outline**: per height band, the
front-most `z` among vertices with `|x| ≤ 14%` of max `|x|`. Three structural
blindnesses, none of them a bug:

1. **`NB = 24` bands over a 238 mm head is 9.9 mm per band** — coarser than the
   mesh it measures. A 3.2 mm mouth line and a 5.2 mm nostril are below its own
   quantisation and cannot move any number it returns.
2. **It is a silhouette.** A front-facing portrait shows no silhouette; it is
   judged entirely on interior structure — mouth corners, alar wings,
   nasolabial, socket recess, lid occlusion — all off-midline, none of which
   change the outline.
3. **Its own ablation control removes only the big brushes.** `ablateSculpt`
   projects onto the best-fit ellipsoid, so the 2.6× it reports is *nose + chin +
   jaw* against *nothing*. A head with every feature under 10 mm deleted scores
   identically to the shipped one.

Per §9.3 all three are now in `headprofile.mts`'s header **and in its returned
JSON as a `blindTo` field**, so the number cannot be quoted again without it.
A high `sagittalRelief` means *"this head has a profile"* and nothing about
whether it has a face.

### 1.3 The other two candidate explanations

- **"Structure exists in the sculpt but does not survive to the render —
  skinning, normals, a mip chain, the material."** *Not the primary cause.*
  Normals come from `computeSmoothNormals` on the finished, sculpted index
  buffer (`Geo.ts:252`), not from the un-sculpted shell. The failure was one
  stage earlier: the sculpt did not survive to the *mesh*.
- **"The features are too shallow to read."** *No.* The nose tip is +20 mm and
  the eye socket −30 mm. They are **narrow**, and narrow is what a 6 mm grid
  eats.
- **"The paint is weak."** *No.* `src/tools/probes/facemap.mts` puts the painted
  map on screen: lips with a real vermilion border and dark corners, nostril
  shadows, a lit nasal dorsum, deep lash lines, brows — all correctly registered
  (painted eye centres at ±27° of arc; the sculpt puts them at 27.3°). At 0.55 m
  the map is magnified ~1.5×, so mip 0 is being sampled. Nothing was wrong with
  the paint; there was no geometry under it.

---

## 2. §8.5's pixel pre-check, done before modelling anything

| framing | subject size | px per mm |
|---|---|---|
| `hero_face` (corpus) | head ~100 px | 0.6 |
| **`hero_portrait`** (the judged shot) | head ~300 px | **1.9** |
| `facecam` at 0.55 m, 30° fov | head ~870 px | 5.4 |
| `hero_full` | figure 420 px / 1.75 m | **0.24** |

At the range the judge graded, 1 mm of face is 1.9 px: features down to ~1.5 mm
read, and the old 6 mm sampling was an 11 px facet — directly visible, and it
*was* visible (the chin and jaw are unmistakably polygonal in
`tmp/shots/head-r0/_crop_face.png`). **Target: ≤ 2 mm face-front sampling.**

---

## 3. What was built

### 3.1 The head grid — `1db33a5`

Not §8.2's SDF and not its Catmull–Clark cage. **The measured defect is sampling
density in the face region, not expressive power**: an additive displacement
brush *can* express a socket, a nostril and a mouth line, and `skullSampler`
demonstrably does. Both proposed architectures are uniform-refinement schemes
that pay for the whole head to fix one third of it, and both throw away a working
UV map, a registered painted face texture, the lid band, `skinSnap`, the ear
placement and the hair scalp sampler. **If what is there now still does not clear
the bar, that escalation is untouched and this paragraph is the thing to
overturn.**

1. **`warpAxis`** — a monotone reparameterisation of each grid axis against a
   density function, inverted numerically so the density can be written as the
   shape you want. Columns get a gaussian centred on the face; rows get a
   **super-gaussian (even power of 6)** because the face is a strip from brow to
   chin, not a point — a plain gaussian centred on the mouth left the eye line at
   7.7 mm, which is where the socket, the orbital rim and the lid band all are.
   2.1× the columns and 1.55× the rows on the face **at zero extra vertices**;
   the occiput takes the loss and ends up sampled about as finely as the face
   used to be.
2. **76 × 56 → 144 × 120.**
3. `applyBrushes` rejects on the bounding box and the squared radius before the
   sqrt — the grid now asks 45 brushes at each of 17,545 vertices.

```
AFTER    grid  segU=144 segV=120  headVerts=17545
         row spacing mm  brow 2.51  eye 2.86  nose 2.85  mouth 2.03  chin 2.52
         col spacing mm  eye 1.70   mouth 1.39
         row dy      mm  eye 1.95   mouth 1.91
         noctis: 45 brushes, 4 with <4 verts in support; face-front verts 6517
```

| | before | after |
|---|---|---|
| face-front vertices | 611 | **6,517** (10.7×) |
| mouth-line verts | 3 | **15** |
| nostril verts | 0 | **8** |
| philtrum-column verts | 1 | **16** |
| worst survival | 0.421 | **0.966** |

### 3.2 Normal-map aliasing — `af7153b`

The pore map was four octaves of simplex at 96 / 210 / 420 on a **128**-texel
map. Nyquist there is 64: all three octaves were over it, by 1.5×, 3.3× and
**6.6×**, and `normalFromHeight` then Sobels the aliased field, which
differentiates and amplifies the worst one. `maxFreq()` now states the rule once,
at 2.5 texels per feature; pore and weave go to 256 texels with every octave
pinned to it. Correct on its own merits — but it moved `hero_portrait` by
**0.385/255**, i.e. it was *not* the burlap the judge saw. See §4.

### 3.3 `facecam.mts` — `PIN_HEAD`, and it matters

A `_face` framing **was not a front view**: the head-turn layer leaves the
subject at 35–60°, so the mouth and the far eye were foreshortened to nothing.
Two rounds in a row graded a head from what is really a three-quarter — the
`_3q` spec already exists for that. `PIN_HEAD` pins the neck and head bones to
bind rotation. **Any face judgement taken before `69142a3` was taken on a
three-quarter and should be re-taken.**

---

## 4. The crosshatch on all skin is NOT in this lane — please route it

The single loudest remaining defect on skin at portrait range, and it is
`src/engine/postfx/**`.

`weavehunt.mts`: with every map, vertex colour, sheen, specular and received
shadow off, **a flat white face still carries the identical hard ~2 px
crosshatch**. It is not the material. Skin is simply the only large, smooth,
mid-bright surface in a portrait, which is why it has always read as a skin
defect.

`weavehunt2.mts` takes the post stack apart on one boot at `hero_portrait`:

| stage | result |
|---|---|
| base | uniform hard weave over the whole face |
| **GTAO off** | collapses to patches — most of it is here |
| **CAS off** | hard weave becomes a soft speckle — this is the amplifier |
| **TAA off** | **worse**: a dense per-pixel dither over everything |
| all off | completely clean, and the skin underneath is smooth |

Frames: `tmp/shots/head-w/`, `tmp/shots/head-w2/` (`c-0_base.png` against
`c-all_off.png` is the pair). Chain: a per-pixel dither out of GTAO, which TAA is
supposed to average away and does not on **skinned** meshes, which CAS then
sharpens into a weave. Background rocks, terrain and sky in the same frame are
clean; the *animal* in the background, also skinned, has it. That points at
velocity / history rejection on skinned geometry.
`ContactShadowPass.ts:118` already says *"Rotating the dither every frame is what
lets TAA average it away"* — that is exactly the mechanism that is failing.

`facecam.mts` has a `NO_HATCH` toggle to judge the model underneath it. It is
**off by default** so that what it photographs is what ships.

---

## 5. Where the frame stands, and what is left

Read `tmp/shots/head-r3n/_c.png` — Noctis frontal at 0.55 m, hair hidden, hatch
off. Against the judge's checklist:

| the judge asked for | state |
|---|---|
| a mouth: lips with a real mouth line and corners | **yes** |
| a nose with nostrils and a defined tip | **yes** |
| recessed sockets with lids that occlude the eyeballs | **yes** |
| symmetric eyes | **yes** |
| skin without a visible weave | yes with the hatch off — see §4, not this lane |

`tmp/shots/head-r3/noctis_face.png` is the same framing **with hair**, and it is
the honest picture of what remains.

### 5.1 The hair is now the loudest thing in the frame — and it is this lane's

In `head-r3/noctis_face.png` the groom is a black straw broom that covers both
eyes and the entire forehead and extends well past the skull. §8.5's pre-check,
now done:

- A lock is `width` 0.0015–0.0028 m × 1.38, and ×0.53 again for a clump of 3 →
  **1.1–2.1 mm**.
- At `hero_portrait` (1.9 px/mm) that is **2–4 px**: individually resolvable,
  which is exactly why it reads as a broom of separate sticks.
- At `hero_full` (0.24 px/mm) it is **0.3–0.5 px**: sub-pixel opaque geometry,
  which cannot be antialiased and can only shimmer.
- A **card** at 12–18 mm carrying 4–8 strands in alpha is 23–34 px at portrait
  and 3–4 px at `hero_full`. **That is the scale that works at both ranges, and
  it is the number that decides the design.**

So §8.3's conclusion holds and is now quantified: ~150–250 alpha cards of
12–18 mm, not ~2,600 opaque tubes of 1.5 mm. `Hair.ts` already has the grooming
guides, the clumping, the taper and the darkening; `ribbon()` in `Geo.ts` already
builds the strip. **What is missing is an alpha map and the width.** Note
`Hair.ts` is still `DoubleSide`, which is correct for cards.

### 5.2 The hands are not fingerless — the pose is

`tmp/shots/head-r1p/_hand.png`, 6× on Gladiolus' left hand in `hero_full`. Five
separate fingers with real geometry: a hand is **33 px**, a finger **5 px wide
and ~20 px long**. That is well above the sibling's 18×6 px smear, so *geometry
is justified and is already there* — the previous handoff's guess that "the
answer may be albedo and a cast shadow" is wrong, and so is "fingerless
paddles".

What is actually wrong: the fingers are **straight, splayed and rigid** — a rake.
A relaxed hand carries 20–40° of flexion at every joint and the fingers converge.
The thumb stands off at ~90°. That is `Posture.ts` / `Anim.ts` rest-pose work,
not modelling, and it is the cheapest visible win left in this lane.

### 5.3 Open, on the head itself

- **A hard vertical line runs down the forehead and the nose bridge**
  (`head-r3n/_c.png`). New-looking, and higher density is exactly what would
  expose it. Not yet diagnosed. The next move is the ablation this lane used
  everywhere else: a `NO_FACEMAP` toggle in `facecam.mts` — if the line survives
  a flat face colour it is geometry or shading, if it vanishes it is
  `paintFace`'s "lit central T" (`soft([0, 0.030, 0.090], 0.026, 0.052, …)`),
  which is a 26 × 52 mm pale vertical bar on the midline.
- **The cranium above the brow is too tall and comes to a rounded point** — it
  reads as an egg when the hair is off. Hidden in every shipped frame, so low
  priority, but it is what makes `crown` framings look wrong.
- **The ear is still a flat scoop standing off the head** (`characters.md` §5.2,
  unchanged).
- The eyeballs still read a little proud — big white spheres with a hard rim.
  Worth a look now that the socket has 49 vertices in it instead of 8.

### 5.4 Budget — measured, not estimated

`tmp/shots/head-budget/manifest.json` against `tmp/shots/judge-r11/`, same twelve
shots:

| | before | after |
|---|---|---|
| draw calls | 532–743 | **532–744** (budget 800) |
| triangles | 8.35–20.08 M | **8.89–20.46 M** (+0.52 M, **+5.7%**) |

Zero new draw calls, as predicted — it is the same mesh with the same material.
The +20 calls at `poi_haven` is another lane's, not this one's.

---

## 6. Cross-boundary — requested, not made

- **`src/engine/postfx/**` (whoever owns the engine): the GTAO/TAA/CAS crosshatch
  in §4.** This is the biggest single visual contaminant on skin in the judged
  frame and it is not fixable from `src/characters/**`.
- **`src/tools/framecam.mts` (method lane): `--dirty` is still swallowed as the
  candidate-file argument.** Reported in `characters.md` §7 and still true —
  `framecam.mts --probe X --out Y --dirty` dies on `ENOENT: …/--dirty`. One
  `else if` in its option loop. Everything visual here was therefore taken
  against a committed build, which is the right default anyway but makes the
  edit loop a full commit long.
- **`project/LANDMINES.md` "Characters and faces"** should gain: *the bench that
  says a head has anatomy is a silhouette statistic in 10 mm bands and is blind
  to every feature a front portrait is made of; before believing it, run
  `brushsurvive.mts`*, and *a `_face` framing in `facecam.mts` was a
  three-quarter until `PIN_HEAD`*.
