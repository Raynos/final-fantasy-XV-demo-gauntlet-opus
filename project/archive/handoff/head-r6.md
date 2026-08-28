# Handoff — `head` (round 15, pass 6): the sculpt was authored blind, and it shows

Owns `src/characters/**`. Pass 5 found the structural defect — `buildHead`'s
skull grid was wound inside out, the face material is `FrontSide`, and the near
surface of the face was culled from **every frame this repo has ever captured**.
It fixed the winding and stopped there.

**This pass's one sentence: pass 5 fixed the winding and did not go back and
re-judge the things that were authored *during* the culled window — which is
nearly the whole head.** A brush whose result you cannot see gets pushed until
something shows in the frame, and the only thing that showed was the silhouette,
so the entire feature set came in 30-50% hot and `paintFace` had to *be* every
feature the geometry was not delivering. Both are now walked back, together,
with the evidence in the source.

---

## 0. The two instruments that did all the work

Neither is new. Both were under-used.

- **`framecam.mts --probe src/tools/probes/facefront_flat.mts`** — flat albedo,
  **no normal map**, hair hidden, head pinned. Anything left in the frame is the
  **sculpt**. This is the frame that says the face is fifty years old: a brow
  ridge throwing a hard black shelf across both eyes, the mouth framed by two
  raised arcs like a marionette's jaw, an 11 mm rail under each eye. No amount
  of map work fixes any of that and four passes of map work proved it.
- **A face-map dump.** `probe.mts` on a five-line probe that draws
  `faceMat.map`'s image into a 512 canvas and returns `toDataURL`. One image
  settles "is this mark paint?" for good. `probes/facemap.mts` tries to do this
  with a DOM overlay and the overlay does not reach the screenshot.

Also: `--hide Noctis_hair`, `--hide Noctis_shadow`, and `--ablate
nogtao|nocontact|nocas|noexp|nodof` are all cheap and all decisive. `--raw` is
**not** a post ablation — it skips the whole chain including the tonemap, so a
`--raw` frame differs from every graded frame for reasons that have nothing to
do with the token you passed. Two of my ablations were wasted learning that.

## 1. What landed

`5ff2cbc` · **the cranium.** Round 15's #1 was "far too large and too tall,
roughly 1.6:1 at the brow where a head is 1:1". Measured, **every vertical
landmark is inside 0.005 of Farkas** and the width profile inside 0.01 from the
cheekbone down. A lateral vault taper fitted to the four samples that *are* out
lands them all inside 0.04 and makes the head a **bullet** — recorded as a
measured negative in `Face.ts` with its arithmetic, because it is exactly the
shape pass 5 fixed one axis over. What was wrong is that the vault is a
**featureless surface of revolution**: one smooth convex sweep from brow to
vertex with no event on it, and a blank dome reads bigger than a modelled one
of the same size. Added the zygomatic arch (a thin rail, malar to tragus), the
temporal fossa above it, the temporal line, a **parietal eminence** so the front
silhouette has a shoulder instead of widening all the way to the cheekbone, two
frontal eminences, and a step back above the brow ridge. `head-r2.md` §8.2 named
the arch and the hollow as open in round 12; they are closed.

Same commit: **`occiputDepth`** (13% off the back of the vault above the equator
only — `cephalicIndex` 72.9 vs 79 and `ear.zFromFront` 0.563 vs 0.50 are two
statements that there is too much skull behind the ear), the **ear rebuilt**
(§WS-1's oldest open item — it was a 16 mm-thick slab with a 31 mm bowl bored
through it and painted dark; now 9 mm, 60 x 31, leaned back 16°, concha halved
and lit, plate re-seated 2.7 mm *inside* the skull, which closes the dark seam
behind it), and the **chin** (the "duck lips" are a weak chin: `muzzleMm` 8.13
against 3-6 but `eLineLs`/`eLineLi` both inside Ricketts' band, because the
pogonion stood 3.24 mm proud of its own sulcus against an adult 4-6).

`c2a23d7` · **the crown band and the stucco**, both named by round 15 and
neither where anyone looked. The band is `paintFace`'s fringe-shadow gradient
starting at full alpha on its **first** stop: the map stepped from clean skin to
45% dark across one texel. The stucco is the pore map's **coarsest octave**
carrying half the energy at 1.6 mm, which at 3.1 px/mm is a five-pixel bump per
square millimetre of skin; re-weighted to the two fine octaves at the same total.

`11fbf18` · **the sculpt and the occlusion stack, together.** Brow ridge, the
crease under it, the cheekbone hollow, the mouth corners, the nasolabial, the
lower orbital rim and the alar crease all softened 30-45%. `paintFace`'s `ao()`
damped 0.80 -> 0.52 with the two big planar blobs cut hardest, the brows off
their greasepaint, the upper lip's multiply shadow 0.78 -> 0.44 and the mouth
line off `rgba(58,26,28,0.94)`. **And the socket**: see §2. Plus Noctis' fringe,
whose three guides landed their tips in equal parts across and down and buried
one eye — a sweep is a ratio, not a length.

`pnpm run check` **19/19**. `facecheck` PASS 4/4 on the geometry rows, two heads
measurable on the pixel rows and reading a mouth. The cheek control falls
57.7 -> 44.3 (Ignis) and 49.8 -> 48.9 (Prompto) — that is the map getting
quieter, which is the point — while every mouth row holds.

## 2. The one worth reading twice

The loudest mark on `hero_portrait` is a broad dark groove from each inner
canthus out and down across the cheek with a lit ridge above it. Pass 5 called
it the fringe's cast shadow and made it this pass's first item. **It is not.**
Ablated in order, every one negative and every one captured:

| ablation | result |
|---|---|
| `--hide Noctis_hair` | every mark survives |
| `hair.castShadow = false` | every mark survives |
| `--hide Noctis_shadow` (the merged proxy) | every mark survives |
| `--ablate nogtao` / `nocontact` / `nocas` / `noexp` / `nodof` | every mark survives |
| **`paintFace`'s whole `ao()` stack × 0** | **frame visibly identical** |
| the face map dumped off `faceMat.map` | nothing at all in that position |

The only thing that moves it is the **eye-socket brush's y-radius** — narrow it
and the groove moves and sharpens, which is what identifies it. It is the
socket crater's inferior wall: a −30 mm brush with a 24 mm y-radius whose
falloff lands in the middle of the cheek. −21.2 mm, plus the infraorbital plane
a real face has between the orbital rim and the malar so the socket ends in a
slope rather than an edge. In `hero_portrait` the eyes read as open eyes for the
first time.

**The general lesson, and the reason this pass spent an hour on the wrong axis
first: on this head, a statistic that is inside its norm is not evidence that
the feature is right, and a mark on a face is a shading event until an ablation
says otherwise.** Every landmark on this skull measures correct and it still
reads as a dome; the paint stack measures as the obvious cause of a painted-
looking face and is not.

## 3. Where it actually stands — I looked, and this is what I see

`tmp/shots/p6-done/` (committed HEAD) and `tmp/shots/p6-z/` (facecam, 0.55 m).

**Better, honestly and visibly.** `hero_portrait`: the eyes are open and read as
eyes, the mouth is warm lips instead of a black bar cut in a mask, the cheeks
are skin instead of hard slashes, the ear is an ear. `noctis_face` at 0.55 m is
a young face with soft planes where round 14's was a mask and round 15's was a
mannequin. `hero_full` is unregressed.

**Not yet beautiful, and here is what a harsh critic still gets:**

1. **The fringe still covers most of the far eye.** It sweeps now instead of
   hanging, and more brow shows, but the locks are still long enough to land on
   the eye after the sweep. The next move is `len`, not direction. This is the
   single biggest remaining item on the judged frame.
2. **A dark diagonal still crosses the mid-face** on the shadow side. It is the
   same socket wall, at a third of what it was, read against a raking key on the
   unlit half. Another 20-25% off the socket is available but starts to close
   the aperture — check `facecheck`'s `mouthEdge` and look at the eye.
3. **The lower face is still heavy and wide for a slim twenty-year-old.**
   `euEu` 162.5 mm against a real adult male's 152 and a breadth-over-height of
   0.71 against 0.66. `headWidth` is 0.97 for Noctis and the shell's `HR[0]`
   is shared; narrowing either moves the eye separation ratio with it, so this
   wants one careful commit, not a nudge.
4. **The hair is flat painted ribbons** at 0.55 m — Van Gogh brush strokes, not
   strands. `dfad601`'s alpha cards are the right idea and the cards are too
   wide and too opaque at this range.
5. **Ignis is still one black column** (no hem, no lapel thickness, no collar
   break), the sleeve cut, the skull print smear at 0.95 m, the collar hole and
   `_probe/hands.mts`'s `_palm*` framings sitting inside the geometry are all
   untouched. §WS-11's character list is where `dress` picks up.
6. **The eyes are asymmetric** in a bald front framing — one reads narrower than
   the other at the same `eyeOpen`. Not investigated.

## 4. Still open from pass 5, unaddressed here

**`facewind`'s negative signed volume for `Noctis_body`, `_hair`, `_outfit` and
both eye meshes.** Pass 5 flagged it, estimated ten minutes and did not do it;
neither did I. Given that the same statistic on the *head* is what found the
inside-out shell, it is still worth the ten minutes. The cheap check is a
`--hide outfit` capture of a bare torso.

## 5. Method notes for whoever is next

- **Look at `facefront_flat` before touching `paintFace`.** Four passes have now
  re-tinted a map to fix something the sculpt was doing.
- **`--raw` is not an ablation of a post *stage*.** Use the tokens.
- `probe.mts` prints its return value as JSON, so a downscaled `toDataURL` round
  trips fine and costs one boot. That is the cheapest way to look at any
  generated texture in this repo.
- Do not `git checkout` a file to undo a diagnostic edit. It cost me half an
  hour of uncommitted sculpt work; commit the diagnostic, or edit it back.
