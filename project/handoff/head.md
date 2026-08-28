# Handoff — `head` (round 14, pass 4): the clip is the jacket, and the paint is not on the face

Owns `src/characters/**`. Inherited a lane that had built `facecheck.mts` (the
first gate here that scores a *rendered* face), landed two real shapes, and
ended on one hypothesis: **the lit half of a face is clipped, and `SKIN_BASE`
0.88 → 0.55 is the fix.** This pass was told to land that corpus-wide.

**It should not be landed.** Two measurements say so, and a third found something
larger underneath. Nothing in `src/characters/` changed this pass; what changed
is that four questions that had been argued for four rounds now have numbers.

---

## 1. The clip is real, and its cause is the party's own black clothing

`src/tools/probes/faceclip.mts` reads the **HDR scene buffer** rather than the
JPEG — `PostFX.rtScene`, half-float, decoded in the page — plus the 1×1 adapted
exposure target and the band the integrator is allowed to sit in.

`hero_portrait`, at HEAD:

| region | HDR linear (pre-exposure) | × E = 1.3037 |
|---|---|---|
| chin | 0.904 0.468 0.259 | **1.179** 0.610 0.338 |
| neck | 0.814 0.408 0.224 | 1.061 0.532 0.292 |
| ground | 0.364 0.228 0.117 | 0.474 0.298 0.152 |
| jacket | 0.056 0.052 0.049 | 0.074 0.068 0.064 |

The face's **red channel enters an ACES tonemapper at 1.18**, and the grade's
warm highlight arm finishes it. Out of the PNG: the chin box reads **mean R
253.6** with a p97−p03 luma spread of **19 of 255**. There is no mouth in that
box because there is nothing in that box.

### The albedo is not the cause — this is the measured negative

`look.skin` 0xb58c70 × `SKIN_BASE` 0.88 is linear **(0.351, 0.199, 0.122)**,
which is a *correct* skin albedo; published diffuse reflectance for skin is
0.35–0.45 in red. And the Sky's own published scene exposure is **0.9789**, at
which the same face lands at R 230.6 and the same chin box carries **115 of
255** — six times the structure, no clip, and a value a portrait should have.

So `SKIN_BASE` is being asked to compensate for a metering error, and the price
would be every character's skin being wrong in the many frames where the meter
behaves. **Closed. Do not cut `SKIN_BASE`.**

### The metering, and the ablation that names it

`faceclip.mts` hides the party and re-meters the identical pose:

| shot | adapted | party hidden | Sky's `base` |
|---|---|---|---|
| `hero_portrait` | 1.3037 | **0.8711** (−33.2%) | 0.9789 |
| `hero_profile` | 1.2900 | 1.0420 (−19.2%) | 0.9789 |
| `hero_full` | 1.1865 | 1.0146 (−14.5%) | 0.9349 |

`Exposure`'s metering is centre-weighted — `mix(0.45, 1.0, smoothstep(0.55,
0.06, dot(q,q)))` — and in a portrait the centre of the frame is a black jacket
at HDR 0.056. It drags the log-average down, the integrator runs to **1.33× the
scene exposure the Sky published**, and skin, the highest-albedo large surface
in the shot, is the first thing to clip.

That also explains the thing round 14 could only describe: *which* half of a
hero blows is decided by his yaw, because yaw decides how much black coat and
how much lit skin fall inside the meter's centre weight.

**This is `src/engine/postfx/Exposure.ts` and this lane does not own it.**
`faceexp.mts` is the picture: the same portrait with the adaptation band closed
onto `base`. It is better everywhere, not only on the face — `imagestats` puts
today's two head shots at **median luma 100.2 against the FFXV corpus's 70.2**,
and the excursion is most of that gap. Hand it to whoever owns the post chain;
the shape of the fix is a metering statistic that a large dark subject cannot
dominate (a percentile rather than a log-average), or a tighter `rangeHi` than
today's 1.9.

`facecheck` already VOIDs a window above mean 212 and now the VOID has a cause
rather than a hypothesis.

---

## 2. The paint is not landing on the face, and this is bigger than the clip

Nothing here had ever put **the map's own coordinates on the rendered face**.
`facebar.mts` does: it rebuilds a canvas from the shipped map's mip 0, replaces
its contents with eight 45°-wide stripes in u (one blue, so `u = 0.5` is
identifiable) plus a red latitude at the mouth's own v, and hands it back as the
material's `map` with the **shipped sampler state** (anisotropy 16, the
hand-built 11-level chain's filters — an unmatched sampler was a real confound
on the first run and cost a capture).

Frames in `tmp/shots/p4-str/`, `p4-bin2/`, `p4-uv3/`. What they say:

- **v registers.** The red latitude at the mouth's v crosses the face at mouth
  height; the same at the nose. `paintFace` is not drawing the mouth at the
  wrong height, and that closes one live theory.
- **u does not.** Measured across the head at eye height, hair hidden, camera on
  the head bone's own forward axis: the band θ ∈ [−45°, +45°] — which on this
  shell covers **89% of the head's width**, both eyes inside it — renders as
  **45 px of a 580 px head, 7.8%**. Worse, the stripes at the *silhouette*
  render widest and the stripe facing the camera narrowest, which is the
  opposite of what a convex head under a frontal camera does.
- **And the vertex buffer disagrees with both.** `faceattr.mts` reads the
  attribute directly: the front-most vertex — the nose tip at z = +0.115 — has
  `uv = (0.5000, 0.3821)`; the back-most has `u = 1.0`; the mean position of
  every vertex with `u ∈ [0.46, 0.54]` is z = **+0.083** and of every vertex
  near the seam z = **−0.034**. At the mouth's v, 172 vertices have
  |u − 0.5| < 0.04 and they span x = −22.4 … +22.3 mm. **The mesh's UVs are
  correct, unmirrored, and the seam is at the back where `buildHead` puts it.**

Three candidates were named for that. **Two are now closed and the third is
where the answer is:**

1. ~~A second surface drawn over the face.~~ **Closed.** `faceocclude.mts`:
   `<name>_shadow` is 40 385 verts of `MeshBasicMaterial`, but it carries
   `colorWrite = false` and cannot reach the frame. Every other mesh on a
   character is `MeshPhysicalMaterial` with `colorWrite = true` and none of them
   overlaps the head shell.
2. ~~Something between the attribute and `vMapUv`.~~ **Closed.**
   `faceuvshade.mts` wraps `patchSkin`'s own `onBeforeCompile` and writes
   `fract(vMapUv * 8.0)` straight to `gl_FragColor` — no sampler, no mip chain,
   no colour space, no canvas. Over the brow, eyes, cheeks and mid-face the
   bands come out **even, symmetric about the midline, and about the width the
   vertex buffer predicts.** The attribute reaching the fragment is fine.
3. **The parameterisation itself — and `faceuvshade`'s frame shows it.** Below
   the mouth line the UV collapses into a **radial fan converging on the
   menton**: the u isolines all run into one point at the chin and the v
   isolines become nested arcs around it. That is the `atan2(x, z)` cylinder's
   pole, at the exact place where the shell tapers toward its own axis under the
   jaw, and **the mouth sits inside it.** `paintFace` draws the mouth as a
   horizontal band in a rectangular (u, v) canvas; the lower face samples that
   canvas along a fan, so the band arrives on the mesh as a curve smeared around
   the chin — which is what `facebar`'s latitude stripe looks like in
   `tmp/shots/p4-bar3/`, a "smile" that dips at the midline rather than a line.

So the remaining question is not *where is the paint* but **what does the fan do
to it**, and the fix, if this is it, is in `buildHead`'s projection rather than
in `paintFace`: give the face band its own non-singular chart (a planar or
cylindrical-about-x projection over the front, blended to the existing wrap at
the ears) instead of running a pole through the chin. That is a real piece of
work and it is the *first* thing on this head that is both measured and
mechanically explains four rounds of a missing mouth.

Two cautions for whoever takes it. `facebar`'s stripe-width numbers above were
read off a frame by hand and my run-length classifier was picking up background
on the same rows; treat the 7.8% as indicative, and re-derive it from
`faceuvshade`, which needs no texture and no classifier. And the vertical tear
down the midline in `faceuvshade`'s frame is `fract()`'s own cycle boundary at
`u = 0.5` — an artefact of the visualisation, not evidence of a seam.

**`facemark.mts` was written to answer this question and never could.** It
stamps through `map.mipmaps[i].getContext('2d')` and the shipped chain's levels
are ImageBitmaps, so every level failed the guard, the loop `continue`d, and
sixteen captures came back with no magenta because none was ever drawn — 17
magenta pixels in one profile, zero in any frontal. It now counts what it drew
and throws. `drawImage` *does* work on those levels, which is how `facebar`
gets at mip 0.

---

## 3. Two things three documents say that are not true

- **"The head is pitched down in the settled pose."** `Shots.ts`, `head-r3` and
  two handoffs. `headaim.mts` measures the posed skeleton: the head bone's own
  +Z sits at **−5.5°** of pitch and the `hero_portrait` camera at **+2.0°**, so
  the face is seen from 7.5° below its own normal and the face-to-camera angle
  is **15.1°**. That is a relaxed head in a near-frontal portrait. Whatever
  makes `hero_portrait` read as a foreshortened downward wedge, it is not eight
  degrees of neck. Per-bone: `spine03` carries −10.8° of world pitch and the
  neck gives 6.4° of it back, exactly as `evalIdle`'s comment claims.
- **"The hard vertical line down the midline is the fringe's cast shadow."** It
  is present with the hair hidden (`tmp/shots/p4-bin2/`), in every hero, in
  every framing, and the `u = 0.5` blue stripe lands on it. Whatever it is, it
  is not the fringe.

## 4. What I looked at, and the frame that matters

`tmp/shots/p4-base/` (`hero_portrait`, `hero_profile`, `hero_face` at HEAD),
`p4-fc/` (annotated `facecheck`), `p4-exp/` (the exposure ladder, with
`crop-shoot.png` the shipped frame and `crop-base.png` the same at `base`),
`p4-map/` (the painted canvas), `p4-bin2/` and `p4-str/` (the UV readouts).
Describing them, because `tmp/` gets pruned:

- **`hero_portrait` at 1:1 is not "a pale blown mask".** Both eyes read and are
  the best thing on the head. The lower two-thirds of the face is a smooth
  balloon: no nose, no nostril, no philtrum, no mouth, no mental crease. There
  is one soft diagonal crease where a nasolabial fold would be. The ear stands
  off the head at brow level, exactly as the ear item says.
- **`tmp/shots/p4-bin2/noctis_bar.png` is the frame this repo has needed for
  four rounds**: the head with the hair hidden, at 0.55 m, on the head's own
  axis. It is an **egg with two eyes stuck in it**. Not "a weak nose" — no nose.
  The judge's *"no mouth geometry or mouth texture on the mouth's location"* is
  a literal description of it, and so is *"the chin projects further forward
  than the nose"*, because on an egg the lowest forward point is the chin.
- **Gladiolus' beard is ~350 loose black slivers over bare skin** and at 0.55 m
  they read as flies. `p4-bar2/gladio-zoom.png` shows it over a flat green face,
  which is the clearest picture of it anyone has taken.
- `hero_profile` **does** show lips, a nose and a chin. Whatever destroys the
  front view spares the profile, which is itself a clue for §2.

## 5. State

Tree at `dec74c4` plus one commit of probes (below). **No `src/characters/` file
was changed this pass.** `facecheck` at HEAD is unchanged and still PASS:

```
noctis   mouthRange   2.3  VOID — lit half clipped (mean 227.3)
gladio                     VOID — no blank patch on this face (the beard)
ignis    mouthRange  21.0  PASS
prompto  mouthRange -17.4  VOID — lit half clipped (mean 234.4)
geometry rows: 4/4 heads pass — noseLead 26.5-27.5, transDrop 5.5-7.3,
               jawWidthErr 0.0122-0.0450
```

New in `src/tools/probes/`: **`faceclip`** (HDR readout + the party-hidden
metering ablation), **`faceexp`** (the exposure ladder as pictures),
**`headaim`** (where the head actually points, and which bone points it),
**`faceuvshade`** (`vMapUv` drawn straight to the frame, no texture in the path
— ***start here***), **`facebar`** (the map's own coordinates on the face),
**`faceattr`** (the head mesh's uv attribute and its mesh/material list),
**`faceocclude`** (is anything drawn over the face — no), **`faceuv`** (a
lat/long grid version of `facebar`), **`facemip`** (the mip-selection ablation;
the shipped map already has anisotropy 16, so that theory is closed).

## 6. Next, in order

1. **The chin's UV pole (§2.3).** Two of the three candidates are closed and
   this is the one left standing, with a picture of it. Every other item on this
   head is being judged through it.
2. **Hand §1 to the post lane.** It is a one-file change they own and it is
   worth more than any sculpt item here.
3. **Gladiolus' beard.** Ugliest thing on any hero's face, un-VOIDs a quarter of
   `facecheck`, and entirely inside this lane.
4. The ear's 16 mm; the cranium; the C7 → acromion yoke.

## 7. Closed as measured negatives this pass

- **`SKIN_BASE`.** Not the cause of the clip; the albedo is a correct skin
  value and the frame is correct at the Sky's own published exposure. §1.
- **Mip selection on the face map.** The shipped painted map already ships at
  `anisotropy = 16` with `minFilter` LinearMipmapLinear and a hand-built
  11-level chain, and at 0.55 m the face is *magnified*, not minified. Not it.
- **A second surface drawn over the face.** `<name>_shadow` carries
  `colorWrite = false`. §2.1.
- **`patchSkin` mangling the uv on its way to the fragment.** `fract(vMapUv*8)`
  written straight to `gl_FragColor` comes out even and symmetric over the whole
  mid-face. §2.2.
- **"The head is pitched down."** −5.5°. §3.
- **"The midline line is the fringe's shadow."** Present with the hair off. §3.
- Inherited and still standing: the mouth line's blur and value, the face
  material's `sheen` and `specularIntensity`, and the eight `WIP:` commits.
