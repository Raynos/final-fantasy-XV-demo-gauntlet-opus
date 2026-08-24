# Handoff — `head` lane: the 3/10 face

Owns `src/characters/**`. Started from round 11's blind grade (3/10, 12 of 12
identified, 0 fooled) whose number-one finding was *"the characters have no
faces… a smooth flesh mask with no nose, no mouth, no brow ridge, no eye
sockets"*.

---

## 1. The bench and the frame disagreed. Here is why, measured.

`project/handoff/characters.md` §4 concluded from `headprofile.mts` that
`Face.ts` already has the anatomy and **§8.2's head rebuild is not justified**
(sagittal relief: slab 0.000 / ellipsoid 0.091 / sculpt-ablated 0.172 / heroes
0.445–0.497). A blind judge and the frame say the opposite. Both are looking at
the same head, so one of them is blind to something.

**Neither is wrong. The bench is blind, and the sculpt is destroyed by the
tessellation.** Two separate facts, both measured:

### 1.1 The sculpt does not survive the grid — `src/tools/probes/brushsurvive.mts`

New probe, `--without <op>` ablation done **one brush at a time** at two sampling
rates: the shipped grid (`segU=76 × segV=56`, exactly what `buildHead`
evaluates) and the same continuous surface at 6× in both directions — which is
what the brush table is authored against. Controls first, because seven
instruments in this repo measured themselves: **null ablation 0.000 mm, a
synthetic 40 mm brush survives 0.995, a synthetic 1 mm brush survives 0.000.**
The instrument works.

What it reports on the shipped heads:

```
grid  segU=76 segV=56  headVerts=4389
      row spacing mm  brow 9.17  eye 9.62  nose 8.81  mouth 6.52  chin 7.29
      col spacing mm  eye 6.75   mouth 5.56
noctis: 45 brushes, 17 with <4 verts in support; face-front verts 611
```

**The entire front of the face — brow to chin, ear to ear — is 611 vertices at
5.6–9.6 mm spacing.** The brush table is authored at 3–10 mm feature radii. So:

| brush | radius mm | amt mm | verts in its support | survival |
|---|---|---|---|---|
| **nostril openings** | 5.2 × 5.8 × 12.5 | −9.0 | **0** | 0.42 |
| alar crease | 5.5 × 9 × 14 | −5.5 | **0** | 0.80 |
| alar wings (ball of cartilage) | 10.5 × 11 × 19.5 | +11.5 | **0** | 0.90 |
| **nose tip** | 16.5 × 19 × 28 | +20.0 | **0** | 0.99 |
| nose columella | 11.5 × 10 × 20 | +7.0 | **0** | 1.00 |
| philtrum columns | 5 × 9 × 17 | +4.2 | 1 | 0.54 |
| philtrum groove | 7.5 × 10.5 × 19 | −6.0 | 1 | 0.87 |
| mouth corners | 12 × 12 × 21 | −7.0 | 1 | 0.95 |
| nasion | 14.5 × 11.5 × 30 | −8.2 | 1 | 0.96 |
| cupid's bow | 10 × 5.5 × 20 | +3.8 | 1 | 0.98 |
| **mouth line** (30 mm wide!) | 30 × **3.2** × 26 | −9.2 | **3** | 0.72 |
| lower orbital rim | 30 × 9 × 34 | +11.2 | 4 | 0.92 |
| upper vermilion | 26 × 9.5 × 26 | +11.5 | 5 | 0.89 |
| eye socket (main) | 36 × 24 × 46 | −30.0 | 8 | 0.99 |
| lower vermilion | 23 × 10.5 × 27 | +10.5 | 8 | 1.00 |
| — cranium, for contrast — | 120 × 100 × 70 | −10.0 | **272** | 1.00 |
| — crown, for contrast — | 100 × 60 × 100 | −5.0 | **785** | 1.00 |

Gladiolus is the same or worse: 18 of 45 starved, 597 face-front verts.

Read the two columns together. `survival` is max-displacement and is a
*forgiving* statistic — a lone neighbouring vertex catching the tail of a
falloff scores 0.99 while carving nothing. `vertsInSupport` is the **shape**
statistic, and it says the nose tip, both alar wings, both nostrils and the
columella are carved by **zero vertices**; the philtrum, the mouth corners, the
nasion and the cupid's bow by **one**; a 60 mm-wide mouth line by **three**.

So: the anatomy is real, complete and correct **in `skullSampler`, the
continuous function**. It is annihilated by a 76 × 56 UV sphere that spends 785
vertices on the crown and 611 on the whole face. That is why a profile silhouette
looks like a face (the surviving brushes are the big ones — nose bridge 17.5 mm,
chin 32 mm, jaw 46 mm, and a silhouette needs only the extreme point) and a
front-on portrait is a blank mask (everything a front view reads is in the
starved column above).

### 1.2 The bench cannot see any of it — and now says so

`headprofile.mts` measures the **mid-sagittal outline**: for each of `NB = 24`
height bands, the front-most `z` among vertices with `|x| ≤ 14%` of max `|x|`.
Three independent blindnesses, all structural, none of them a bug:

1. **24 bands over a 238 mm head is 9.9 mm per band** — coarser than the mesh it
   measures. A 3.2 mm mouth line and a 5.2 mm nostril are below its own
   quantisation. Its dead-band for counting "features" is 1.5 mm *per head
   height*, i.e. 0.36 mm — but the band grid has already thrown the feature away
   before that test runs.
2. **It is a silhouette.** Front-most `z` on the midline is the profile outline.
   A front-facing portrait shows no silhouette; it is judged entirely on interior
   structure — mouth corners, alar wings, nasolabial, socket recess, lid
   occlusion — none of which lie on the midline and none of which change the
   outline.
3. **Its own ablation control removes only the big brushes.** `ablateSculpt`
   projects every vertex radially onto the best-fit ellipsoid, so the 2.6×
   separation it reports is *nose + chin + jaw* versus *nothing*. It is silent on
   whether the small brushes exist, which is exactly the question.

Per §9.3 ("every check declares what it is blind to") this is now written into
`headprofile.mts`'s own header and into its returned JSON as a `blindTo` field.

### 1.3 The other two candidate explanations, and what they measured

- **"The structure exists in the sculpt but does not survive to the render —
  skinning, normals, a mip chain, the material."** *Ruled out as the primary
  cause.* Normals come from `computeSmoothNormals` on the finished, sculpted
  index buffer, not from the un-sculpted shell (`Geo.ts:252`). The failure is one
  stage earlier: the sculpt does not survive to the *mesh*.
- **"The features are real but too shallow to read."** *Ruled out.* They are not
  shallow — the nose tip is +20 mm and the eye socket −30 mm. They are **narrow**,
  and narrow is what a 6 mm grid eats.

### 1.4 Two further defects found while resolving it

- **The painted face map is strong and well-formed and is not the problem.**
  Dumped mip 0 and mip 3 to screen with `src/tools/probes/facemap.mts`: red lips
  with a real vermilion border and dark corners, nostril shadows, a lit nasal
  dorsum, deep lash lines, under-eye shadow, brows. Registration against the
  cylindrical UV checks out (painted eye centres land at ±27° of arc; the sculpt
  puts them at 27.3°). At 0.55 m the map is magnified ~1.5×, i.e. mip 0 is being
  sampled. **The paint is not what is missing** — there is simply no geometry
  under it, and (see below) a high-frequency normal-map artefact sitting on top
  of it with more local contrast than the mouth has.
- **The "woven, burlap-like weave" on the skin is normal-map aliasing, and the
  arithmetic is unambiguous.** `Materials.ts:cache()` builds the pore map as
  `normalFromHeight(128, 0.5·simplex(96u) + 0.3·simplex(210u) + 0.22·simplex(420u))`.
  On a **128**-texel map, Nyquist is frequency **64**. All three octaves are over
  it — by 1.5×, 3.3× and **6.6×** — and `normalFromHeight` then runs a Sobel over
  the aliased field, which differentiates and *amplifies* the highest one. Tiled
  9 × 13 across a face, that moiré is the burlap. Same fault in `weave`
  (`sin(34·2πu)·sin(34·2πv)` on 128 texels is fine, but its `simplex(300u)` octave
  is 4.7× over) and `poreFine`, which is the same texture at a coarser repeat.

### 1.5 §8.5's pixel pre-check, done before modelling anything

| framing | head width | px per mm of face |
|---|---|---|
| `hero_face` (corpus) | ~100 px | 0.6 |
| `hero_portrait` (the judged shot) | ~300 px | **1.9** |
| `facecam` at 0.55 m, 30° fov | ~870 px | 5.4 |

At the range the judge graded, **1 mm of face is 1.9 px**, so features down to
~1.5 mm read and the mesh's 6 mm sampling is an 11 px facet — directly visible,
and it is visible in the frame (the chin and jaw are unmistakably polygonal in
`tmp/shots/head-r0/_crop_face.png`). Target: **≤ 2 mm face-front sampling.**

---

## 2. Verdict on §8.2's two architectures

**Neither, at least not first — and the reason is a measurement, not an
opinion.** §8.2 offers SDF+marching-cubes or a Catmull–Clark cage, and frames the
problem as *"our profile collapse comes from sculpting a sphere with fixed-
direction brushes… no nasion, no mandible"*. That premise is stale (the previous
lane established it, and I confirm it: all of those brushes exist). The measured
defect is not expressive power — an additive displacement brush **can** express a
socket, a nostril and a mouth line, and `skullSampler` demonstrably does. The
defect is **sampling density in the face region**, and both proposed
architectures are uniform-refinement schemes that would pay for the whole head to
fix one third of it, while throwing away a working UV map, a registered painted
face texture, the lid band, `skinSnap`, the ear placement and the hair scalp
sampler.

The cheapest construction that the measurement actually indicts:

1. **Spend the samples where the features are** — a monotone, periodic
   reparameterisation of θ and φ that concentrates columns on the front 90° and
   rows on the brow-to-chin band. Zero extra vertices, ~2.2× horizontal and
   ~1.5× vertical density on the face for free.
2. **Then a modest uniform bump** to reach ≤ 2 mm.

Triangle headroom says this is not close to the constraint: the judged frames run
**8.3–20.1 M triangles** and a head is 8,512. Fifteen characters at +15 k
triangles each is 225 k — **2.4% of a 9 M-triangle frame** — and **zero new draw
calls**, since it is the same mesh. Draws today are 532–743 of 800.

If a density fix plus feature re-authoring still does not put a mouth in the
frame, the escalation to an SDF head is on the table and this section gets
rewritten. That order is deliberate: it is one hour of work against a week, and
it is the exact hypothesis the numbers name.

---

## 3. State

- `src/tools/probes/brushsurvive.mts` — new, controls pass, is the instrument
  above.
- `src/tools/probes/facemap.mts` — new, puts the painted map on screen.
- `Face.ts` — `brushes()` exported so an ablation can remove one.
- Baseline frames: `tmp/shots/head-r0/` (`facecam` at 0.4–0.6 m, all four
  heroes, `follow` shots) and `tmp/shots/head-r0/_crop_face.png`.

## 4. Next

Section 2's step 1 and 2, then capture and look. After the head: the fingerless
hands (§8.4/8.5, pixel pre-check first) and hair cards (§8.3).
