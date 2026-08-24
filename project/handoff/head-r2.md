# Handoff — `head-r2`: the proportions, measured

Owns `src/characters/**`. Started from the coordinator's three findings against
`tmp/shots/head-r3n/_c.png` and `tmp/shots/judge-r12/face.png`: proportions read
as an infant's, the mouth does not survive the shipped light, and the shipped
face is faceted. All three were real. **Two of the three had a different cause
than the frame suggested, and one of them is not in this lane at all.**

Commits on `main`: `5107dd2` (the bench), `b66f93f` (the nose), `b1d6955` (the
barrel and the ear), `3110447` (the paint re-registered + its check), `46efc34`
(chin and neck corrections), `bd29f1e` (`headlook.mts`), `9cdf121` (the mouth
barrel, the mouth line, the nasolabial, Gladiolus' jaw).

---

## 1. The instrument, and the four ways it lied before it was believed

`src/tools/probes/headprop.mts`. `headprofile.mts` says in its own `blindTo`
that it measures a mid-sagittal *outline* in 9.9 mm bands; "the features are in
the wrong place" is exactly the class it cannot see, because a head with the eye
line at 0.40 and one at 0.52 wiggle by the same amount. This one measures
**named landmark heights as a fraction of head height** against Farkas'
adult-male means, plus the half-width profile and the ear.

Four bugs, each caught by a control, each of which had produced a *plausible*
number:

1. The midline strip contains the **back** of the skull as well as the front,
   and the occiput brushes move those vertices in y, so a 1 mm band can hold
   only a back-of-skull vertex. Its front-most z came back as −0.09 and the
   bench reported that as the nasion **on all four characters at once**. Gated
   on `z > 0`.
2. 1 mm bands are finer than the mesh's 2.5 mm rows, so half of them are empty.
   Gaps are interpolated and `interpFrac` reports how many (0.47 on a real head).
3. A "first local minimum below the tip" search stopped on a **3 mm wobble on
   the nasal dorsum** and put the subnasale 24 mm high — which made `sn-gn` come
   out at *exactly* the adult norm on a head whose lower face is a quarter
   short. Landmarks are now assigned **by order over persistence-filtered
   extrema** (below the tip there is always subnasale, upper lip, mouth line,
   lower lip, sulcus, chin), and the synthetic control carries that wobble as a
   decoy.
4. A 10 mm sagittal strip reaches the nostril brush at x = 9.2 mm, whose z is
   15 mm behind the dorsum's. Which one a band caught alternated with height:
   a 5–7 mm saw-tooth at 1 mm pitch, **twenty spurious extrema down one nose**,
   and `nth('min', 0)` picking the first of them as the subnasale. The strip is
   4 mm — it has to fit inside the dorsum.

Controls that now hold: on a synthetic head whose landmark heights are *chosen*,
at both a 1.7 mm and the shipped 2.9 mm row spacing, every landmark returns
within **3 mm**. On a bare ellipsoid the extractor finds **one** extremum and
reports no face. The bench prints the raw midline outline every 2 mm and the
extrema list it made the assignment from, so the assignment is auditable rather
than trusted.

**Every number below is from that bench. `--dirty` is useless right now** — a
live lane's `src/world/Terrain.ts` throws in `lateUpdate` — so everything was
taken at `HEAD`.

## 2. What was actually wrong with the proportions

The coordinator's read was "the cranium is enormous and the features are crammed
into the bottom third". The cranium measured **correct**. What was wrong:

| | before | after | adult male |
|---|---|---|---|
| nasion from the vertex | 0.480 | 0.480 | 0.477 |
| eye line from the vertex | 0.519 | 0.519 | 0.50–0.53 |
| **subnasale from the vertex** | **0.760** | **0.692** | 0.688 |
| **mouth line from the vertex** | **0.851** | **0.783** | 0.782 |
| **nose length n–sn** | **0.281** | **0.217** | 0.211 |
| **lower face sn–gn** | **0.240** | **0.303** | 0.312 |
| **chin block sto–gn** | **0.149** | **0.213** | 0.218 |
| **thirds, n-sn : sn-gn** | **1.17** | **0.716** | 0.68 |
| nose projection, tip to sn | 37.2 mm | 22.5 mm | ~21 mm |
| pogonion out of its sulcus | 1.0 mm | 6.2 mm | 4–6 mm |
| mouth relief, lower lip to stomion | 6.2 mm | 9.7 mm | — |
| ear length / head height | 0.297 | 0.270 | 0.269 |
| ear centre below the eye | 0.102 | 0.055 | 0.056 |

**One defect with three consequences: the nose was a third too long, with its
base 16 mm too low.** That leaves 33 mm between the mouth line and the menton
where an adult has 48, so the mouth sits in the bottom fifth and everything
above it reads as oversized. The vault, brow, nasion and eye line were right all
along and none of them moved.

### 2.1 And the head was a barrel — which is the stronger cue

Half-width from vertex to menton, normalised by its own maximum, identical on
all four heads:

```
before   0.44 0.69 0.80 0.89 0.95 0.99 1.00 0.98 0.99 0.93 0.91 0.44
after    0.44 0.69 0.81 0.90 0.96 0.99 1.00 0.98 0.89 0.75 0.48 0.24
adult    0.40 0.64 0.80 0.91 0.98 1.00 0.98 0.92 0.82 0.70 0.53 0.32
```

The top half was already right; below the cheekbone the head simply stayed at
**full width down to the mouth line**. A neurocranium at nearly adult
proportions over a mandible that is not is the textbook infant outline, and
`headprofile.mts` is structurally blind to it — its statistic is the
*mid-sagittal* outline, the one direction this defect does not touch.

`jawTaper(yn)` is a **second** profile, not a change to `profileW`, because the
two directions want opposite things: front-to-back the head must stay deep at
the jaw (there is a ramus and a neck back there, and `profileW`'s fullness below
the equator is exactly what stops the neck pushing out through the face), while
across it must close to a chin 45 mm wide. One radius cannot do both; trying is
what produced the barrel.

**Cost of narrowing it:** the neck's top ring plugs in where the skull is now
29 mm of half-width and used to be 49, and at `neckR * 0.68` it is 37 — so the
neck came out through the sides of the jaw. `Body.ts` ring at 0.56.

## 3. The faceting is `ContactShadowPass`, and it is not in this lane

`tmp/shots/judge-r12/face.png`'s "flat polygon facets across the cheek and a
scalloped, lobed silhouette along the jaw and chin" is **two different things**,
and the larger one is neither geometry nor normals.

The *facets* and every lobed hard-edged boundary **inside** the face are a post
pass. The jaw *outline* against the background was geometry, and it was the
barrel plus the neck coming through the jaw (§2.1); it is smooth now. Ablated,
one variable at a time, on `hero_portrait`:

| frame | result |
|---|---|
| `head-r2p/hero_portrait.png` — shipped | a lobed dark blob over the whole mid-face, hard stair-stepped edges, a per-pixel checkerboard over all skin |
| `head-r2h/` — `--hide hair` | **the blob survives**: not the groom's cast shadow |
| `head-r2n/` — `--hide hair --ablate nocontact` | **blob gone, dither gone**, face completely clean |

`imgdiff` over the face rectangle alone: **mean 3.634/255, max 120, 5.26 % of
pixels over 8/255**, against that crop's measured floor of 2.00.

Normals were never a candidate after that: `computeSmoothNormals` runs on the
finished, sculpted index buffer and the same head is smooth in `head-r2n`.
The previous lane capped `ContactShadowPass`'s march at `stepPx = 6` and that
fixed the crosshatch it was chasing. At portrait range the pass is now painting
a **6-pixel-quantised lobed blob over the entire mid-face and the neck**, and it
is the single loudest thing in the judged frame — louder than anything this lane
changed. `project/LANDMINES.md` currently says the crosshatch "is fixed"; that
is true and incomplete.

**Requested, not made** (`src/engine/postfx/**`): the step cap is in screen
space only, so at 0.6 m the *whole march* is a handful of screen pixels long and
its penumbra quantises to the step. It needs a world-space floor on the march
length as well as a screen-space cap on the step, or the pass needs to fade out
below some screen-space object size. `head-r2h` / `head-r2n` are the A/B pair.

**Consequence for anyone judging a face here:** `src/tools/probes/headlook.mts`
turns the pass off so a sculpt can be seen, and says in its own header that
nothing photographed through it is what ships.

## 4. `PIN_HEAD` was not enough — three rounds were graded on a three-quarter

`facecam.mts` zeroes `neck` and `head` and the subject **still** arrives 20–30°
off frontal, because the twist is in the spine: `hips`, `spine01..03` and both
clavicles are animated and none of them was pinned. `headlook.mts` pins every
bone from the hips up. `tmp/shots/head-r2b/noctis_front.png` is the first frame
in this lane's evidence that is actually a front view, and it is what produced
§5 — the defect it shows is invisible in three-quarter, which is why three
rounds of face work did not find it.

## 5. The mouth, and why a good profile is a blank mask from the front

One boot, `tmp/shots/head-r2b/`: `noctis_side.png` has a nasion notch, a dorsum,
a tip, a philtrum, two vermilions, a mentolabial crease and a chin.
`noctis_front.png` — same head, same light, pinned frontal — is a smooth egg
with eyes on it, carrying **a straight vertical terminator down the midline**.

That terminator is the diagnosis. The lips wrap a convex mass that stands proud
of the cheeks either side of it, and the muzzle here was the bare ellipsoid. On
a bare ellipsoid a front-lit face flips from lit to unlit in one step down the
midline and every off-midline feature reads as nothing — which is the "smooth
flesh mask" every blind round has named. **Neither bench can see it**:
`headprofile.mts` measures the mid-sagittal outline, `headprop.mts` measures
landmark heights, and this is off-midline *mass*.

Landed: a 5.5 mm barrel over the muzzle; the mouth line at 13 mm instead of 9.2
(it has to survive the shipped key, where the mid-face is in shadow, not a
studio one — 3.6 mm of `r_y` is still four rows at the face's 1.9 mm pitch);
corners at 10 mm instead of 7; and a real nasolabial, which ran from the alar
crease and stopped.

## 6. The map moved with the sculpt, and a check now says whether it did

`paintFace` authors every feature at a canonical height and the sculpt moved
15 mm. **Nothing in the repo would have said so** — a misregistered map is a
beautiful texture in the wrong place, and every geometry bench here reads the
position buffer. All 63 y literals below the tear trough are carried through the
same piecewise map the brushes were.

The check is in `headprop.mts` and lands with it: read the finished canvas back,
take the mean luminance of the 58 mm strip down the middle of the face (the
mouth is 57 mm across and the projection is cylindrical, so that is the mouth's
own column), find the darkest row near each measured landmark. Measured:
**painted mouth line 2.7–4.4 mm from the measured stomion** across the cast,
painted nostrils 2.5 mm from the measured subnasale, on a mesh whose rows are
2 mm apart.

*Caveat, and it is in the output:* Gladiolus' nostril row reads −9.7 mm. His
`paintFace` stubble field is the darkest thing in that window, not his nostrils.
The mouth row is clean on all four.

## 7. Gates and budget

`pnpm run check`: **15/16 PASS**, and the 16th is contention, not content.
`driftcheck` fails inside the suite with `page.evaluate: Target page, context
or browser has been closed` and **passes standalone once the lease clears** —
`PASS (tolerance 0.05 m drift, 0.45 m vs heightAt)`. The daemon's `exclusive`
lease was held by `gameplay` through the suite run and the first retry, which
closes other pages under it. The previous head lane recorded the identical
failure for the identical reason.
Everything this lane can break is green: `creaturecheck` 207 poses,
`combatloop` 31/31, `silhouette` 42 meshes in 8 families, `geocheck`,
`floatcheck` 123 POIs, `orphans` 301/301, `reachcheck`, `uxcheck` 93/93,
`integration`.



**Draw calls, `tmp/shots/judge-r12/manifest.json` against
`tmp/shots/head-r2q/manifest.json`:**

| shot | judge-r12 | now | triangles |
|---|---|---|---|
| `hero_portrait` | 575 | 591 | 8.04 M -> 8.08 M |
| `hero_full` | 692 | 688 | 8.17 M -> 8.19 M |
| `poi_haven` | 638 | 636 | 7.58 M -> 7.41 M |
| `party_formation` | 664 | 660 | 8.11 M -> 8.10 M |

That table is not attributable: `judge-r12` predates this lane by a day and
several other lanes' commits. **The attributable A/B** is `d30e2aa`, the commit
immediately before this lane's first sculpt change, against `HEAD`:

| shot | `d30e2aa` | now | triangles |
|---|---|---|---|
| `hero_portrait` | **595** | **591** | 8.082 M -> 8.078 M |
| `poi_haven` | **636** | **636** | 7.528 M -> 7.446 M |

**Zero new draw calls, four fewer at `hero_portrait`, and 4 000 fewer
triangles.** That is what it
should be: every change here is a number in an existing brush table, two lines
in `shellPoint`/`jawTaper`, one neck ring radius and 63 y literals in a canvas
painter. Same meshes, same materials, same instancing. `hero_portrait` was
already 595 at `d30e2aa` against `judge-r12`'s 575, so the +16 in the table
above belongs to whoever committed in between, not here.

## 8. What is left, in the order I would take it

1. **The eyeballs are proud spheres.** `tmp/shots/head-r2b/noctis_q.png` at
   three-quarter: the near globe sits *on* the face rather than in it, with a
   hard rim. `LANDMINES.md` warns that widening the socket brushes is a measured
   dead end that cost a lane most of a session, so **do not**: the number to
   attack is the globe's own front, `FACE.eye[2] + FACE.eyeR = 0.0753` against a
   lid margin at 0.075, i.e. exactly flush. Move the globe *back*, and check
   `skinSnap` and the lid band after.
2. **The cheek is a blank plane at every angle but profile.** §5 fixed the
   muzzle; the malar is the same defect one region up. There is one cheekbone
   brush and no infra-orbital plane, no zygomatic arch running back to the ear,
   no temporal hollow. This is where the next real gain is, and `headlook.mts`'s
   `_front` and `_q` are the frames to judge it in.
3. **A hard sub-pixel vertical line down the head's midline, crown to chin.**
   Two handoffs before this one reported it and neither ablated it. Ablated
   here, and **the result is inconclusive and the reason matters**: with
   `NO_FACEMAP` the line disappears, but so does all albedo, and the face blows
   out to near-white — the exposure change is bigger than the thing being
   measured, so that is a null ablation, not innocence. And the albedo *itself*
   has no line in it: sampled straight out of the canvas, the 29 texels either
   side of the midline read 143-147 at the forehead and 141-148 at the crown,
   a range of 4/255 with no spike. So it is geometry, shading or the tangent
   frame, not the paint. The next move is `NO_NORMALMAP` (already wired in
   `headlook.mts`, and it does not change exposure) and then `aTan` at u = 0.5.
   It is ~0.6 px at 0.52 m, i.e. sub-pixel at every shipped range — real, but
   not what any judge has been scoring.
4. **Gladiolus is still the outlier.** After taming the lateral `jaw`
   coefficients he measures 192 -> ~173 mm of head breadth against Noctis' 158,
   and his width profile still peaks at the jaw rather than at the parietals.
   His pogonion is 15 mm proud of its sulcus against an adult 4-6.
5. **`zyOverEu` reads 0.99-1.00 against an adult 0.89 on Noctis and Prompto.**
   Do not chase it on that number alone: it is a ratio of two widths measured
   ~15 mm apart on a head whose maximum happens to sit at the eye line, and the
   full width profile it comes from is now within 0.04 of the adult curve
   everywhere. The honest reading is "the euryon is a little low", and moving it
   means narrowing the shell *at the eye line*, which drags `skinSnap`, the lid
   band and the eye registration with it.

## 9. Cross-boundary — requested, not made

- **`src/engine/postfx/ContactShadowPass.ts`** — §3. The single loudest defect
  in the judged frame, ablation-proven, with an A/B pair
  (`tmp/shots/head-r2h/` against `tmp/shots/head-r2n/`) and a number
  (**3.634/255 mean over the face rectangle, max 120, 5.26 % of pixels over
  8/255, floor 2.00**). The `stepPx = 6` cap that fixed the crosshatch left the
  whole march a handful of screen pixels long at 0.6 m, so its penumbra
  quantises to the step and paints a lobed, stair-stepped blob over the entire
  mid-face and neck.
- **`src/world/Terrain.ts` (coordinator)** — `--dirty` is unusable for every
  agent right now: `Terrain.lateUpdate` throws
  `Cannot read properties of undefined (reading 'update')` at `Terrain.ts:675`
  on the live tree. Every measurement in this handoff was therefore taken at a
  committed `HEAD`, which is the right default but makes the edit loop a full
  commit long.
- **`src/tools/framecam.mts` (method)** — `--dirty` is *still* swallowed as the
  candidate-file argument, now reported by four handoffs. The empty-specs-file
  workaround still works.
- **`project/LANDMINES.md` "Characters and faces"** should gain three entries:
  - *The bench that says a head has anatomy is a mid-sagittal outline in 10 mm
    bands. The bench that says its features are in the right place is
    `headprop.mts`. **Neither can see off-midline mass**, which is what makes a
    face read from any angle but dead-on — and a head can pass both while
    rendering as a smooth mask with a straight vertical terminator down its
    midline.*
  - *`PIN_HEAD` in `facecam.mts` is not enough for a front view: the twist is in
    the spine, and `hips`, `spine01..03` and both clavicles are all animated.
    Use `headlook.mts`.*
  - *The "flat facets on the cheek and the lobed jaw silhouette" in every recent
    portrait are `ContactShadowPass`, not geometry and not normals. `--ablate
    nocontact` removes them entirely. The crosshatch entry says the pass is
    fixed; it is fixed for the crosshatch and broken for this.*
  - *`paintFace` authors every feature at a canonical height and is registered
    to the sculpt by hand. Move a brush and the map has to move with it —
    `headprop.mts` reads the painted mouth line back out of the finished canvas
    and compares it with the measured stomion.*

## 10. Frames

| what | where |
|---|---|
| before, the shipped portrait | `tmp/shots/judge-r12/hero_portrait.png`, `face.png` |
| **the contact-shadow A/B** | `tmp/shots/head-r2h/` (hair off) against **`tmp/shots/head-r2n/`** (hair off + `nocontact`) |
| the first true front view, mid-lane | `tmp/shots/head-r2b/noctis_front.png`, `_side`, `_q` |
| studio views, before the chin wall | `tmp/shots/head-r2d/` |
| the `NO_FACEMAP` ablation (inconclusive, see §8.3) | `tmp/shots/head-r2e/` |
| shipped frames + budget, mid-lane | `tmp/shots/head-r2q/` |
| **final studio views** | **`tmp/shots/head-r2f/`** |
| **final shipped frames** | **`tmp/shots/head-r2z/`** |
| the bench, seven runs | `tmp/shots/head-r2/prop0..6.json` |

`tmp/shots/head-r2f/noctis_side.png` against `tmp/shots/head-r3n/noctis_prof.png`
is the before/after for the whole lane: same framing, same light, a head that
had a nose, a mouth and a chin in the sampler and none of them in the right
place, against one that does.
