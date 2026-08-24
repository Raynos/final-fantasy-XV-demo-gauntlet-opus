# Handoff — `head-r3`: the third axis, and the muzzle it found

Owns `src/characters/**`. Started from round 13's blind grade — 12 of 12
identified, HIGH on every frame — whose number-one finding across the whole set
was *"the head is a wedge, not a face"*, and whose face note was the sentence
this lane exists for:

> **BETTER — and the head is WORSE.** The close-up now has a faint painted mouth
> mark under the nose, so the literal defect is addressed. But the same crop
> shows the whole lower face is now a forward-tapering muzzle wedge with no
> lips, philtrum or chin — the region regressed while the checklist item was
> ticked.

Commits on `main`: `020e722` (the depth axis + its controls), `6e49b07` (the
muzzle), `2066f79` (local mouth relief, the hair ceiling, `hairstand.mts`),
`5a01068` (the transverse row + the malar and maxilla).

**Both previous lanes were right about what they measured.** `head-r2`'s
proportions are still inside Farkas' bands on every row and two rows *improved*
here. The bench and the frame disagreed for the third time in this repo, and for
the third time the answer was the same shape: **the instrument was blind to the
failing axis.**

---

## 1. Nothing here measured depth

`headprofile.mts` measures a mid-sagittal *outline* in 9.9 mm bands.
`headprop.mts` measures landmark **heights** as a fraction of head height, plus
a **half-width** profile. A forward-projecting lower face is neither of those,
and a head can score adult on both while being a snout.

The mid-sagittal outline at `HEAD` before this lane, in mm below the vertex
against canonical z:

```
nose tip 140:109.4 -> subnasale 154:87.1 -> 166:106.1 -> 174:87.6
      -> 180:97.3 -> sulcus 192:69.7 -> chin 203:75.5
```

That **106.1 is a second nose.** The upper lip stood 19 mm in front of the base
of the actual nose and within 3 mm of its tip; the sulcus under it was an 18 mm
trench; the chin never climbed back out of it. And the run from 162 to 192 was
**bit-identical on all four characters** — the mouth block is authored in
absolute canonical space and does not scale with the look.

### 1.1 What was added, and why these metrics

`src/tools/probes/headprop.mts` gains a `sagittal` block. Every primary metric
is **tilt-invariant**: each reference line is drawn between two points *on the
face itself*, so rotating the head rotates the line with it. That is not
fastidiousness — the modern soft-tissue tables (Arnett's TVL, Holdaway, anything
"to Frankfort") are measured against a true vertical in **natural head
position**, and canonical Y here is whatever `shellPoint` was authored around.
Quoting them against canonical Y measures the rig's posture and calls it
anatomy. The tilt-dependent rows are still reported, under `secondary`, with
Arnett's means beside them and a `_ref` that says what they are.

| metric | what it is | adult male |
|---|---|---|
| **`muzzleMm`** | the furthest ANY midline band between subnasale and pogonion stands in front of the subnasale-pogonion chord | **3-6** |
| `eLineLsMm` / `eLineLiMm` | Ricketts' E-line, pronasale to pogonion | **-4** / **-2** |
| `nasolabialDeg` | columella - subnasale - labrale superius | **126 ± 15** |
| `mentolabialMm` / `Deg` | sulcus depth under the lower-lip-to-chin chord | **2-6** / **110-134** |
| `convexityDeg` | 180 minus glabella - subnasale - pogonion | 8-16, **non-discriminating** |

`muzzleMm` is the headline and names no landmark at all: it is a maximum over
the raw 1 mm outline between two unambiguous points. A peak-finder is a
hypothesis; this is the curve. Its band is cross-checked two ways — Ricketts'
E-line norms put the upper lip 4.2 mm in front of that chord, and Arnett's TVL
means (subnasale 0, labrale superius +3.3, pogonion −3.5) put it at 4.2 as well
— which is why it is stated as 3-6 and not as a point.

### 1.2 The controls, which are the point

`controls.depthAdult` and `controls.depthMuzzle` are **the same skull with the
same landmark heights and the same widths**, differing only in sagittal depth.
The adult one is built to Arnett's male means; the other has the lips driven 12
and 8 mm forward and the sulcus and chin 12 and 8 mm back.

| | height bench Δ | width profile Δ | `muzzleMm` |
|---|---|---|---|
| adult vs muzzle, 27 mm of depth apart | **0.008 of head height** | **0.013** | **3.49 → 17.13, 4.9×** |

That is the claim as a number rather than as a paragraph. Two more controls:
a **bare ellipsoid** reads `muzzleMm` 1.6 and a nasolabial of 180 (no face, no
muzzle), and both synthetic heads are re-run at **the shipped grid's own row
count**, where every landmark z still comes back within 0.9 mm — so the answer
does not depend on the sampling.

### 1.3 Two extractor bugs the controls caught

Each had produced a plausible number, which is the only kind worth catching.

- **On a head built to the adult means the labrale-inferius swing is 0.8 mm** —
  a third of the extractor's 2.5 mm prominence floor, which exists to kill the
  nasal-dorsum wobble. So on a *correct* profile the persistence filter merges
  the lower lip away, `nth('min', 2)` finds nothing, and the sulcus falls back to
  a fixed window: the adult control came back `mentolabialMm: 0` on a head whose
  sulcus was placed by hand at −5.3 mm. Lowering the floor re-admits the decoy.
  Below the mouth line the order is fixed anatomy — lip, sulcus, chin — so all
  three are now extrema **of a range** and need no prominence at all.
- **"The front-most band below the lower lip" finds the lip's own skirt** on a
  head whose chin is retruded, which is exactly the head this axis exists to
  catch. On Noctis it put the pogonion 11 mm high and 6 mm proud of the real
  chin. Sulcus first, in a window 4-22 mm below the lip; the chin is the
  front-most band below **it**.

`nasolabialDeg`'s norm is **calibrated off the adult control** (126 ± 15) rather
than quoted: the published 90-110 is measured against the columella *tangent*,
which a 1 mm-band outline does not have, and quoting it would have condemned a
correct nose. `convexityDeg` is marked non-discriminating in `ZNORM` — a bare
ellipsoid scores 12.2 through it, dead centre of the adult band, because
glabella, subnasale and pogonion sit on one smooth curve whatever is or is not
carved between them.

---

## 2. What the depth axis says, before and after

Every number from `node src/tools/probe.mts src/tools/probes/headprop.mts`.
"before" is `262cb01`, the commit this lane started from.

| | noctis | gladio | ignis | prompto | adult male |
|---|---|---|---|---|---|
| **`muzzleMm`** before | 22.44 | 22.06 | 22.55 | 22.41 | **3-6** |
| **`muzzleMm`** after | **6.46** | **5.75** | **5.95** | **7.01** | |
| `eLineLsMm` before | +11.23 | +7.69 | +9.71 | +11.66 | **-4** |
| `eLineLsMm` after | **-3.86** | -7.37 | -5.79 | **-3.37** | |
| `eLineLiMm` before | +9.81 | +5.58 | +7.97 | +10.18 | **-2** |
| `eLineLiMm` after | **-0.93** | -4.72 | -3.00 | **-0.51** | |
| `nasolabialDeg` before | 60.3 | 58.4 | 59.0 | 61.0 | **126 ± 15** |
| `nasolabialDeg` after | 99.4 | 94.0 | 98.3 | 96.2 | |
| `mentolabialMm` before | 16.01 | 20.10 | 18.05 | 15.76 | **2-6** |
| `mentolabialMm` after | 6.64 | 7.99 | 7.35 | 6.62 | |
| `mentolabialDeg` before | 83.7 | 74.1 | 79.0 | 84.9 | **110-134** |
| `mentolabialDeg` after | 114.9 | 106.5 | 113.3 | 115.0 | |
| `convexityDeg` after | 8.6 | 18.1 | 11.7 | 8.8 | 8-16 |

And the lower-face **chord profile** — the outline as an offset from the
subnasale-pogonion chord, every 2 mm, which is the curve `muzzleMm` is the
maximum of:

```
before  154:-0.0 ... 166:22.4 168:22.1 170:15.4 172:5.5 174:5.3 176:10.6
        178:14.7 180:16.8 182:17.2 ... 190:-5.9 192:-8.7 ... 202:-0.3
after   154:0.4 ... 166:6.0 168:6.5 170:4.7 172:2.3 174:-0.6 176:5.3
        178:5.8 180:5.0 182:3.1 ... 190:-4.4 192:-3.9 ... 198:0.0
```

There is now a **V where a mouth line goes**: +6.5 at the upper lip, **-0.6 at
the stomion**, +5.3 at the lower lip. Before, the curve never crossed the chord
between the subnasale and the sulcus at all — it was one 22 mm lobe.

**The height bench did not regress and two rows improved.** noseLen error 0.006
→ 0.002 of head height; thirds 0.716 → 0.691 against Farkas' 0.68; sn-prn 22.5
→ 21.0 mm against a male mean of 20.7; pogonion out of its own sulcus 6.2 → 3.2.
The painted map is **still registered** — the mouth line reads 2.4 mm from the
measured stomion and the nostrils 2.5 mm from the subnasale — because every
landmark *height* is unchanged and only depths moved.

---

## 3. What was actually wrong, in the sculpt

**Three brushes stacking on one spot, and a shell that gives up.**

The mouth barrel (+5.5 mm along the normal), the upper vermilion (+11.5) and the
cupid's bow (+3.8) all centre within 3 mm of each other and all push +z. A face
whose shell is at 89 mm there arrived at 106. Each was defensible on its own and
**the sum was never measured, because until this lane nothing measured depth.**

Under that is the real defect and it is the shell, not the brushes: `profileW`
gives up **20 mm of z between the mouth line and the pogonion**, where a
mandible's symphysis is very nearly a wall. `head-r2` compensated by piling
relief onto the mouth — which is why every increase there was locally correct
and made the frame worse.

So the chin brush becomes that wall: up from y −0.1045 to −0.1010, r_y 0.0205 →
0.0330 so it spans the sulcus to the menton instead of stopping above the
sulcus, amt 0.0205 → 0.0155 because a wall does not need to be a bump. Its
`jaw` coefficient drops 0.007 → 0.005: at Gladiolus' 1.35 the old one put his
chin 8 mm in front of Noctis'.

With the wall there the mouth only needs a mouth's worth of relief. Final
values, against `262cb01`:

```
mouth barrel      0.0055 -> 0.0008     upper vermilion  0.0115 -> 0.0024
cupid's bow       0.0038 -> 0.0010     lower vermilion  0.0105 -> 0.0050
philtrum groove  -0.0060 -> -0.0038    philtrum columns 0.0042 -> 0.0026
mouth corners    -0.0100 -> -0.0078    sulcus          -0.0072 -> -0.0040
mouth line       -0.0130 -> -0.0068    nose tip         0.0135 -> 0.0115
```

The **mouth line stays the deepest thing in the block on purpose** — 6.8 mm is
still twice an adult's stomion recess, because 3 mm of groove is 5.7 px at
`hero_portrait` and it has to survive a raking key. Note that `head-r2`'s
argument for 13 mm was an argument against a `ContactShadowPass` blob that has
since been fixed, so the premise it was made under is gone.

Two brushes carry the last of it, and they are shaped by the *direction* of the
light rather than its amount: the lower vermilion's `dir` flips from
`[0,-0.10,1]` to `[0,0.12,1]` so the lip faces slightly **up** into the sky, and
the mouth line's from straight −z to `[0,0.42,1]` so it cuts **up under** the
upper lip and the lip overhangs its own shadow. The corners deepen, because a
corner is a *vertical* feature and a mouth line is a horizontal one, and under
this game's low raking key the horizontal one produces almost no shading
contrast at any depth. That last sentence is the most useful thing in this
section — see §5.

---

## 4. The transverse axis — measured, partly fixed, and the next lane's job

The depth axis above is still a **midline** statistic, and so is every other
bench in this repo. `headprop.mts` now also reports a **transverse** row: for a
band of heights, the front-most z at |x| = 0, 15, 30 and 45 mm, as a drop from
the midline.

`shellPoint` sweeps a **pure ellipse** in theta, so the face's transverse
section is an ellipse whose semi-axes at the upper-lip line are 58 mm across and
89 mm deep. Measured on the shipped mesh at `262cb01`, the drop from the midline
at the upper-lip line was **24.6 mm at x = 30** and 40.4 at x = 45; on a head
those are roughly **7** and 18. The face turns away from the front about **3×
too fast**, and the mouth-corner and nasolabial brushes (both negative, both at
x ≈ 26-31 mm) make it worse.

That is what "the cheek is a blank plane at every angle but profile"
(`head-r2.md` §8.2) is, in numbers, and it is why a key from either side splits
the face rather than drawing it.

Landed: a **canine eminence** and a **malar plane** brush pair, mirrored.
Measured on the mesh by the bench's own `transverse.dropMm`, at `262cb01`
against `HEAD`:

| row | x=15 | x=30 | x=45 | head |
|---|---|---|---|---|
| labrale superius, before | 11.1 | **42.3** | 58.1 | ~2 / 7 / 18 |
| labrale superius, after | 1.6 | **17.5** | 40.6 | |
| stomion, before | 4.5 | **23.9** | 42.1 | |
| stomion, after | 3.3 | **19.0** | 42.3 | |

**Read the stomion row, not the upper-lip one.** Before the muzzle came off, the
labrale superius *was* the muzzle peak, so its 42.3 mm drop is mostly the
midline lobe falling away and not the transverse section at all — the metric
mixes the two at that height and the correction is not 42 → 17. The stomion row
is clean and says 23.9 → 19.0 against a head's ~7: **a third of the way, no
more.** My own offline model said 14.1; the mesh says 19.0, and the mesh wins.

The brushes cannot touch `muzzleMm` or any other depth-axis number: at x = 0
they are 1.07 and 1.4 radii out and `applyBrushes` rejects on the bounding box
before the sqrt. Confirmed to the last decimal, along with euEu, zyZy, goGo and
the whole width profile.

**Not landed, and this is the honest limit of what a brush can do here:** the
remaining 7 mm needs `shellPoint`'s section to stop being an ellipse — a
superellipse or a per-theta profile that is flat across the maxilla and turns at
the malar. That change touches `skinSnap`, the hair scalp sampler, the UV map
and the paint registration all at once, which is a lane, not an afternoon. The
zygomatic arch and the temporal hollow from `head-r2.md` §8.2 are still absent.

---

## 5. The measured negative that matters most: geometry does not move the mouth
    in `hero_portrait`

This is the finding to read before spending another round on lips.

Same vertical scanline through the mouth (x = 825, y 425-480), three builds —
round 13's judged frame, this lane after the muzzle fix, and this lane after
adding 8 mm of local lip relief and flipping the lip and mouth-line directions:

| build | skin | mouth floor | drop |
|---|---|---|---|
| `judge-r13/hero_portrait.png` | ~211 | **137** | 74 |
| after the muzzle fix | ~210 | **133** | 77 |
| after the local lip relief | ~210 | **134** | 76 |

**Identical.** Eight millimetres of lip geometry, an overhanging mouth line and
a lip rolled to face the sky moved the shipped pixels by less than the capture
noise. At `hero_portrait` the mid-face is lit by near-flat skylight fill — the
whole face sits between 200 and 220 with no directional shading at all — and a
horizontal groove has no shading response to that light at any depth.

**The mouth in the judged frame is carried entirely by `paintFace`.** The map
already has the value break: the bench reads the mid-face strip going
133 → **56** → 112 across the mouth. What it does not have is *structure* — the
rendered profile is an 18 px soft ramp down and back up with **no edge**, which
is exactly "a brown smudge on the texture".

So the next move on the mouth is **not** more relief. It is one of:
- an edge in the paint that survives the mip chain and CAS (the stroke is 3.4 mm
  wide with `blur: 1.8`; it renders as a gradient), **or**
- a lower-lip highlight and an upper-lip shadow *painted*, not sculpted, since
  the light will not supply them, **or**
- accepting that `hero_portrait`'s key cannot draw a mouth and arguing the shot.

Do **not** darken the mouth line further without re-reading `head-r2.md` §5's
plate measurement: at 134 against skin 210 the rendered ratio is 0.64, and the
FFXV plate it was matched to runs Y 79 against a skin p50 of 119 — **0.66**. We
are already at the plate's ratio. The problem is the absence of an edge, not the
value.

---

## 6. Hair: a ceiling on the guided strands, and why it is only a quarter of it

New probe **`src/tools/probes/hairstand.mts`** — the signed offset of every hair
vertex from the sculpted skull along the skull normal, per character.

The control is the point: **the head mesh's own skull grid through the identical
code path**, which must read ~0 and reads p50 −0.26, p90 0.92, p99 11.4, max
15.9 mm. That ±16 mm is the instrument's floor and it is not zero for a real
reason, now in the probe's header — *the (theta, phi) recovered from a sculpted
vertex is not the one it was built at, because the brushes move y as well as z*,
and `Hair.ts`'s own two clamps invert exactly the same way and carry exactly the
same error.

Against that floor the groom's median offset is 10-13 mm and its tail ran to
**108-149 mm, with 344-635 vertices per head past 60 mm.**

`liftOutOfSkull` — what every **guided** strand gets, and Noctis' fringe is
guided — was **floor-only**, on the reasoning that an authored path needs no
upper clamp. Half right: a guide is a curve through a handful of control points
and nothing held it near the head between or beyond them. It now has a ceiling
1.5× `hugSkull`'s, so it cannot flatten a style: a hugged strand runs to
`baseOff + 0.30·len` at its tip (34 mm on an 85 mm lock), a guided one to
`baseOff + 0.018 + 0.30·len·t` (52 mm).

**Measured, and recorded because it is a negative:** that takes Noctis' >60 mm
count 344 → 253 and his maximum 108 → 102 — about a quarter. The probe's
`worst10` says why, and anyone tightening it further must read this first: the
four largest offsets on Noctis are at **z = −151 mm, y = −98 mm** — 55 mm behind
the back of a skull whose half-depth is 96 mm. That is the **nape**, hanging
down the back of the neck exactly as it should. The metric flags correct hair
there, so the remaining tail is not by itself a defect, and the number to chase
is a *front-half* one this probe does not yet split out. That split is the first
thing to add to it.

---

## 7. What is left, in the order I would take it

1. **The mouth still does not read in `hero_portrait`, and §5 says why.** It is
   a paint problem now, not a geometry one, and the specific thing missing is an
   *edge*. Measure before and after with the scanline in §5; if the numbers do
   not move, say so and stop, because three lanes have now spent rounds adding
   relief that the shipped light cannot find.
2. **The transverse section (§4).** The largest remaining structural error on
   the head and the one a blind judge keeps describing in different words —
   "flat sockets", "a blank cheek", "a wedge". It needs `shellPoint`, and
   `headprop.mts`'s `transverse.dropMm` is now the before/after for it.
3. **The eyeballs are still proud spheres in flat sockets** — and with the
   muzzle gone they are now unambiguously the loudest wrong thing on the head.
   `tmp/shots/head-r3e/noctis_q.png` is the frame: a glass marble sitting *on*
   the face with a hard rim and a huge sclera, under a lid that is a thin band
   rather than a fold with thickness. Exactly as `head-r2.md` §8.1 left them. **Do not widen the socket brushes** —
   `LANDMINES.md` records that as a measured dead end that cost a lane most of a
   session. And note the trap I nearly walked into: `FACE.eye[2]` moves the
   globe *and* both lids, because `buildLid` is built on the same `ec`, so
   "move the globe back" is a no-op on the relationship that matters. The
   levers that are left are the **lid's own thickness and overhang** and the
   **shadow it casts on the sclera** — in `buildLid` and `buildEyes`, not in
   `brushes()`.
4. **The ear.** `headprop.mts` reports `ear.lateralMm` **97.8** against a head
   half-breadth of 79 — the ear projects **19 mm past the widest part of the
   skull**, which is why the judge calls it a flat flap standing off. Its
   length, height and z-position all measure correct; only its lateral extent
   and its section do not.
5. **A front-half split in `hairstand.mts`** (§6), then re-tighten the ceiling
   against it.
6. **The cranium above the brow is still an egg** (`head.md` §5.3). Hidden under
   the groom in every shipped frame; it is what makes `crown` framings wrong.

---

## 8. Traps confirmed, and one new one

- **`framecam.mts --dirty` is still swallowed.** Sixth handoff to say so. The
  empty-specs-file workaround works: `--dirty tmp/head-r3/empty.json` where the
  file is `[]`.
- **`headlook.mts`, not `facecam.mts`** — confirmed, the twist is spinal.
- **The corpus closeups are not closeups**, confirmed: `hero_face` is ~100 px
  and no change in this lane is visible in it.
- **NEW — `headlook.mts`'s front view cannot be used to judge anything on the
  shadow side, and that is half the face.** It runs HOUR 16.2 on purpose, to
  reveal form, and the price is severe: measured down two scanlines through the
  mouth, the shadow half sits at a uniform **Y 65-100 with no detail of any
  kind**, while the lit half is at 200-220. The left/right box mean is 164 / 213
  and it is the **same with the normal map ablated**, so "the face is split down
  the midline" in that frame is the light doing its job, not a sculpt defect —
  what the normal map *does* carry is the noise on the shadow side (the same box
  goes min 73 / range 147 with it and min 117 / range 93 without). The mouth is
  invisible in that frame at 0.52 m and that means nothing; the judged frame,
  `hero_portrait`, is nearly flat-lit and has the opposite problem. **Use the
  `_side` and `_q` framings for form and `hero_portrait` for the verdict.**
- **NEW — an offline model of the midline pays for itself in the first hour.**
  `tmp/head-r3/mid.mjs` and `eval.mjs` parse the `add({...})` calls straight out
  of `Face.ts` and run `applyBrushes` at x = 0 against `shellPoint`. It agrees
  with the bench to about 1 mm and runs in 200 ms against the bench's 30 s, so a
  brush edit can be evaluated ten times before anything is captured. `trans.mjs`
  does the same across x. They live in `tmp/` and cost nothing to delete —
  rebuilding them is twenty minutes and worth it.

---

## 9. Cross-boundary — requested, not made

- **`src/tools/framecam.mts` (method lane): `--dirty` is still swallowed as the
  candidate-file argument.** Reported now by `characters.md` §7, `head.md` §6,
  `head-r2.md` §9, `hair.md` §6 and this one. The option loop's final
  `else opts.file = a` eats every harness flag. One `else if`.
- **`project/LANDMINES.md` "Characters and faces"** should gain:
  - *There are three axes and the benches cover them one at a time.
    `headprofile.mts` is a mid-sagittal outline in 10 mm bands; `headprop.mts`
    measures landmark **heights** and a **half-width** profile, and since
    head-r3 the mid-sagittal **depth** and a **transverse** falloff. A head
    passed the first two while its lower face stood 22 mm proud of its own
    subnasale-pogonion chord, four to six times an adult male, on all four
    characters at once. Before believing any of them, read which axis the defect
    is on.*
  - *Published soft-tissue norms (Arnett's TVL, Holdaway, anything "to
    Frankfort") are measured against a true vertical in **natural head
    position**. Canonical head space here is whatever `shellPoint` was authored
    around. Quote only tilt-invariant metrics — ones whose reference line is
    drawn between two points on the face — or you are measuring the rig's
    posture and calling it anatomy.*
  - *At `hero_portrait` the mid-face is flat skylight fill and the whole face
    sits between 200 and 220. A **horizontal** groove has no shading response to
    that at any depth: 8 mm of lip relief, an overhanging mouth line and a lip
    rolled to face the sky moved the mouth's rendered value by 1/255. The mouth
    in the judged frame is carried entirely by `paintFace`. Vertical features —
    the corners, the nasolabial — are the ones that read.*
  - *`headlook.mts` runs a hard raking key at HOUR 16.2 on purpose. A face split
    into a lit half and a dark half in that frame is the light doing its job,
    not a sculpt defect; measured, the left/right step is identical with the
    normal map ablated.*
  - *`FACE.eye[2]` moves the globe **and** both lids — `buildLid` is built on the
    same `ec` — so "move the eyeball back into the socket" is a no-op on the
    relationship that matters.*
- **`docs/plans/2026-08-21-fable-procedural-modeling.md` §8.2** — the head
  rebuild it proposes is still not justified and this lane is more evidence for
  that, not less: every defect found here was a brush amount, a brush extent or
  one function's cross-section, and all of them were reachable without touching
  the UV map, the lid band, `skinSnap` or the hair sampler. The one thing that
  *would* need an architecture change is §4's transverse section, and even that
  is a change to `shellPoint`, not to the representation.

---

## 10. The blond brows, and an honest note on how far it was verified

Round 13's judge, on a frame that is not the portrait: *"in another frame the two
blond characters have no facial features at all at 3 m."*

At `hero_full` a face is 0.24 px/mm and the only features that survive
minification are the ones that are still a **value**. Blended against each
character's own skin, the brow's luminance drop measured:

| | skin Y | brow Y after blend | contrast |
|---|---|---|---|
| noctis | 146 | 82 | **64** |
| gladio | 125 | 64 | **61** |
| ignis | 142 | 90 | 52 |
| **prompto** | 163 | 129 | **34** |

A blond brow *is* lighter than a black one; half the cast's contrast is not a
hair colour, it is an invisible brow. Both moved to the cast norm at the same
hue — `rgba(92,64,34,0.58)` (Prompto, 55) and `rgba(50,36,25,0.56)` (Ignis, 58).
The arithmetic is in the comments at both call sites so the next person can redo
it rather than trust it.

**How far this was verified, honestly.** The albedo change is arithmetic and is
certain. The *frame* check is inconclusive at the size it was aimed at: in
`tmp/shots/head-r3f/hero_full.png` Prompto's face is 30 px and its dark central
mass is the **fringe's cast shadow**, not the brow, so a 20/255 albedo change
under it is not separable by eye and the 34x34 px box mean moves 136.3 → 136.6.
Both blond heroes are also backlit in that shot. If the next round still hears
this note from a judge, the thing to attack is probably `fringeShadow` (0.28 on
Prompto, 0.34 on Ignis) and the eye/sclera contrast, not the brow again.

---

## 11. Gates and budget

**Draw calls: zero from this lane.** `hero_portrait` runs 593 at `020e722` and
597 at `HEAD`, and the +4 is `9047802` — the rocks commit immediately before the
muzzle fix, which is *already* 597. `6e49b07` on top of it is 597 with a
triangle count identical to the last digit, **8,127,190**, because the head grid
is unchanged at 144 x 120 and every edit is a scalar in an existing brush table.
`poi_haven`, the shot with four heroes and the NPCs in it, is **+0 across the
entire window**.

| shot | `262cb01` | `HEAD` | Δ calls | Δ triangles |
|---|---|---|---|---|
| `hero_portrait` | 593 | 597 | +4 (rocks) | −0.127 M |
| `hero_full` | 692 | 696 | +4 (rocks) | −0.126 M |
| `party_formation` | 667 | 671 | +4 (rocks) | −0.127 M |
| `poi_haven` | 624 | 624 | **0** | −0.201 M |

Budget 800; measured range today 597-696.

**`pnpm run check`: 17/17 PASS**, run at `HEAD` after every change in this
lane. `creaturecheck` 207 poses, `combatloop` 31/31, `silhouette` 42 meshes in 8
families, `geocheck` (whose own summary names *"DoubleSide material hides a
flip"* — the gate closest to this work), `floatcheck` 123 POIs, `orphans`
301/301, `reachcheck`, `uxcheck` 93/93, `integration`, `driftcheck`,
`heightcheck`, `roadcheck`, `horizoncheck`, `hydrocheck`, `silrocks`,
`anycheck` 0 `any`, `build`. Perf gates skipped by `check.mts` itself — a perf
number taken while other agents run is meaningless, and a perf lane was live
throughout.

---

## 12. Frames

| what | where |
|---|---|
| **the round-13 judged frame this started from** | `tmp/shots/judge-r13/hero_portrait.png` |
| studio front / side / 3q, **before** | `tmp/shots/head-r3a/` |
| studio, after the muzzle fix | `tmp/shots/head-r3b/` |
| shipped frames, after the muzzle fix | `tmp/shots/head-r3p/`, `head-r3q/` (PNG, for `crop`) |
| shipped frames, after the local mouth relief | `tmp/shots/head-r3r/` |
| studio, after the mouth relief | `tmp/shots/head-r3c/`, `head-r3d/` |
| **the `NO_NORMALMAP` ablation pair** | `tmp/shots/head-r3d/` against **`tmp/shots/head-r3nm/`** |
| studio + shipped, final | `tmp/shots/head-r3e/`, `tmp/shots/head-r3f/` |
| the draw-call A/B | `tmp/shots/head-r3base/` (`262cb01`) against `tmp/shots/head-r3f/`, and `head-r3ab3/` (`9047802`) against `head-r3ab4/` (`6e49b07`) for the +4 |
| the bench, before / after | `tmp/head-r3/prop-before.json` (`--build 262cb01`) / `tmp/head-r3/prop-final.json` |
| the offline midline / transverse models | `tmp/head-r3/mid.mjs`, `eval.mjs`, `trans.mjs` |

**`tmp/shots/head-r3a/noctis_side.png` against `tmp/shots/head-r3e/noctis_side.png`
is the before/after for the whole lane**: same framing, same light, a profile
whose upper lip stood level with the nose tip over a chin that had fallen 28 mm
behind it, against one with a nose, a lip, a mouth line and a jaw.
