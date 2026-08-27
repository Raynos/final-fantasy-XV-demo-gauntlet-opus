# Critic round 16 — 20 pairs, 19 identified, 0 fooled, 1 hesitated

Run 2026-08-27 against `HEAD` = `5fabd4b` (tree `sha:5f7c11a15d9c`), on all
sixteen landscape shots in `compare.mts`'s `PAIRING` table plus `poi_haven` and
the three character shots — `hero_full`, `hero_portrait`, `hero_profile` —
because hands, outfits and gloves landed this session and round 15 never judged
a face.

    n=20   identified 19   fooled 0   hesitated 1     hesitation rate 5%

**The first non-zero hesitation in five rounds.** Rounds 12/13/14 were 12-of-12
and round 15 was 8-of-8, all at 0%. One frame — `vista_dawn` — I could not call,
and I said so with the key still sealed. That is the number `compare.mts`'s own
header says to track: *"a judge who starts hesitating is the first evidence of
the gap closing, and it moves before the win rate does."*

It has moved. It has moved by one frame out of twenty.

## Method, and one change to it

Steps 1-4 as written: fresh `--jpeg` corpus against `HEAD`, `compare.mts
--shots`, every `ab-*.jpg` read and judged with a written reason before
`ANSWER-KEY.json` was opened.

The change is the control arm. `--control` pairs two shipped plates against each
other and asks the same question; it exists because a verdict that never moves
while the thing it measures improves is either a real gap or a saturated
instrument. But run *after* twenty game-vs-plate pairs, a control is not blind —
the judge has spent twenty images learning our renderer's signature and will
read "neither of these is it" straight off. So the eight control pairs were
**shuffled into the twenty real ones** and all twenty-eight judged in one
undifferentiated pile, with the arm map sealed alongside the answer key.

    main arm      n=20   identified 19   fooled 0   hesitated  1   (  5% hesitation)
    control arm   n=8    -                -         hesitated  8   (100% hesitation)

The instrument separates. The judge called "could not tell" on 8 of 8 pairs
where neither panel was ours and on 1 of 20 where one was. It is not a machine
that always says HIGH.

One thing checked rather than asserted: 17 of the 20 real pairs put our frame on
panel B, which looks like the parity bug the header describes. It is not.
Simulating `flip(seed0 + n*0x9e37)` for n=1..20 over 200 000 random seeds gives
P(>=17 or <=3 on one side) = **0.263%** against a fair coin's 0.259%, mean left
10.004. This round drew a 1-in-380. The shuffle is sound; nobody needs to
re-open it.

## The one that nearly passed, and why

`vista_dawn` — backlit canopy, sun burning through a gap, grass to the lens. I
wrote "very painterly, could be shipped" and marked it `?`. It was ours.

It is worth being precise about what that frame does that the other nineteen do
not, because it is not a better renderer — it is the *same* renderer with round
15's list applied:

- **A foreground occluder.** A branch crosses the top of frame and a trunk
  crosses the left. Round 15's tell #5 was "nothing crosses the bottom or the
  side of any of our eight frames".
- **Continuous near-field cover.** The bottom third is 3D grass with a backlit
  rim, not dirt with dots. Round 15's tell #2.
- **Real hue and value range in one frame.** Blown white sun disc to near-black
  shade; green, gold, teal and maroon all present. Round 15's tell #3 was "one
  hue per frame".
- **The sky is not in the shot.** Canopy occludes almost all of it, so the
  loudest tell in the corpus — the cloud layer — never gets to speak.

Four items off round 15's list, in one frame, and the judge stalled. That is the
strongest evidence this project has that the ranked list is *correct* and simply
is not applied anywhere else.

## The tells, in the order they were actually noticed

Written blind. Where the blind mechanism turned out to be wrong, the correction
is inline and is the more important half — round 15 had to retract its cloud
diagnosis and the lesson took.

1. **Faces. The characters are now the worst thing in the corpus.** `hero_profile`
   and `hero_portrait` were the two fastest and most confident calls of the
   twenty, faster than any landscape. Round 15 never looked at a face, so this
   is new to the list and it enters at the top.

   > **Blind note, corrected.** I wrote "the face is a smeared orange UV with a
   > visible seam down the cheek". Cropped at 2x (`crop.mts`, `hero_profile`
   > 620,90 340x300) there is no seam and no smear. What is actually there:
   > **(a)** a procedural skin-detail texture running at far too coarse a scale,
   > so pores read as scratches scribbled across the cheek and jaw; **(b)** no
   > subsurface — an ear with the sun directly behind it stays flat opaque
   > orange where a real one glows red, and that single missing cue is most of
   > why the head reads as plastic; **(c)** hair as opaque hard-alpha shards
   > with aliased edges and no anisotropic highlight. The silhouette and the
   > hair *shapes* are fine. It is entirely a shading problem.

   `hero_full` goes the same way one step further out: flat-shaded clothing with
   no cloth folds, and star-shaped grass billboards around the party's feet.
2. **The clouds — organisation, and now also focus.** Still the loudest landscape
   tell, and it decided `zone_vannath`, `zone_three_valleys`, `zone_longwythe`,
   `vista_noon`, `zone_lestallum` and `vista_dusk` on sight. Round 15's
   corrected diagnosis stands unchanged: many similar-sized puffs spread evenly
   over the whole sky, no streets, no systems, no large cell beside a small one.

   New and separate: at 2x the cloud has **no crisp sunlit top edge**. The whole
   mass reads defocused — the signature of a half-res raymarch upsampled. Real
   cumulus has a hard cauliflower boundary against blue. Organisation and edge
   crispness are two different pieces of work; round 15 named only the first.
3. **Zero sky fill in shadow, and posterised darks.** This is round 15's tell #4
   ("visible tiling and hatching on terrain slopes") re-specified, and the
   re-specification matters.

   > **Blind note, corrected.** I wrote "diagonal hatch/crosshatch on the ridge
   > face" for `vista_overcast` and `vista_fog`. Cropped at 3x there is no
   > hatch, no grid, no wireframe. What is there: the shadow side of the terrain
   > falls to **near-black with no blue sky fill at all**, and the surviving
   > dark values **posterise into visible bands**; over the top of that sits a
   > high-frequency albedo/normal noise with no mid-frequency geology under it —
   > no strata, no scree, no drainage. Under overcast, where there is no sun to
   > model form, that combination is what the eye was reading as "hatching".
   > Fixing a tiling texture would have fixed nothing.
4. **The near-field ground is still bare — in nineteen of twenty frames.** Round
   15's tell #2, and it survives (see §"Did the cover band move it?" — it did
   not move this). `zone_longwythe`, `zone_vannath`, `zone_three_valleys`,
   `vista_dusk` and `zone_lestallum` all put a flat, near-black, featureless
   band across the bottom third where every FFXV plate puts grass, shrubs and
   saplings reaching into the lens.
5. **One hue per frame.** Unchanged from round 15's #3. `zone_three_valleys` is
   brown, entirely, from ridge to horizon.
6. **Per-pixel grain over the whole frame, including flat sky.** Visible at 3x on
   `vista_overcast` and as a wash over `storm`. It sits on top of a featureless
   grey sky gradient at the same amplitude as it sits on lit rock, which is what
   makes it read as a noise pass applied after the grade rather than as film
   grain modulated by luminance.
7. **Water is one slab.** `zone_galdin` and `zone_vesperpool`: a single flat
   value with a repeating specular ripple, no shoreline interaction, no depth
   colour ramp, no wave-scale variation.
8. **Rain is identical straight lines.** `storm`: uniform density across the whole
   frame, no splash, no interaction with the ground or with the buildings, over
   flat box geometry with no material variation.

## Against round 15's list, item by item

| round 15 | round 16 |
|---|---|
| 1. Clouds (organisation) | **unchanged**, still the top landscape tell; **+ new axis**: edges are defocused as well as badly organised |
| 2. Near-field ground bare | **unchanged in 19/20**; answered in `vista_dawn`, which is the frame that hesitated |
| 3. One hue per frame | **unchanged** |
| 4. Tiling/hatching on slopes | **re-specified**: not tiling. Zero sky fill in shadow + posterised darks + high-frequency noise over no mid-frequency geology |
| 5. No foreground occluder, ever | **partially gone** — `vista_dawn`, `vista_night` and `zone_vesperpool` now have one, and `vista_dawn` is the near-miss. Absent from the other seventeen |
| 6. Magenta smear in `vista_dawn` | **never existed** — see below |
| — | **NEW #1: faces.** No subsurface, over-scaled skin detail reading as scratches, hair as opaque shards. Now the worst thing in the corpus |
| — | **NEW: whole-frame grain sitting on flat sky at rock amplitude** |
| — | **NEW: water is a single slab; rain is uniform lines** |

**The magenta smear was a misread.** Round 15 called it "a real artefact, not a
judgement call". Measured on `vista_dawn` at `HEAD`, pixels with
`min(R,B) - G > 18` number **25 out of 1 440 000** (0.00%), and every one of them
sits at x 1503-1598 — the far *right* edge, in sky haze, pale lavender. There is
nothing at lower-left but **a maroon-brown tree trunk and its fork sitting in
deep shade**, which is what a foreground occluder looks like when it is working.
Nobody should go hunting for that bug.

## Did the cover band move it? No — and the number that said it did was mostly sky

`e3897af` claimed `vista_noon` moved **3.466 mean/255 over 8.19% of pixels**
against a 0.39 floor. Re-measured here, paired captures at `e3897af^` and
`e3897af`, post on, one shot changed:

    vista_noon   mean 2.727/255   6.31% over 8/255   floor 0.39

Close enough to reproduce. **But read the heat map, not the mean** — and split by
band, which nobody did:

    sky            (y   0-300)   mean 4.412   12.18% over 8/255
    horizon/clouds (y 300-480)   mean 2.907    8.79%
    terrain        (y 480-900)   mean 1.447    2.31%

The commit changed the terrain. **The sky moved three times as much as the
terrain did.** The heat map shows why: the large deltas are white rims tracing
cloud silhouettes across the whole upper frame — a re-jittered half-res cloud
raymarch, not an exposure shift (an exposure shift is a smooth global delta, not
edge-shaped). The terrain's own contribution is 1.447/255 — above its floor, so
the band is genuinely there, but roughly half the headline and a fifth of what
was claimed.

Two things follow, and the second is the one that costs time.

- **The cover band is real and it is not enough.** Cropped at 2x
  (`vista_noon` 500,680 420x200) the new mid-scale cover reads as **flat green
  dashes painted on brown** — albedo speckle with no cast shadow, no silhouette,
  no parallax. It fills the hole arithmetically. It does not put anything in
  front of the camera, and the judge did not notice it.
- **A whole-frame mean is not a valid instrument for a terrain change on any shot
  with sky in it.** The cloud raymarch's own build-to-build variance swamps the
  edit. `imgdiff`'s per-shot floor is a single whole-frame number and it is not
  uniform across the frame; the sky's floor is several times the terrain's.
  Mask to the band you changed.

One more trap, found the hard way: **`--raw` is wrong for a build-to-build
comparison.** The same pair measured with `--raw` on both sides comes back
`mean 0.066/255, 0.010% over 8` — a 40x understatement that reads as "the commit
did nothing". `--raw` also changes LOD selection (7.96 M tris against 10.6 M on
the same shot). `BRIEF.md` says `--raw` goes on both sides of a **mesh
ablation**, and that is exactly and only where it belongs.

## What I would do next, in priority order

1. **Subsurface scattering on skin, and drop the skin-detail texture two octaves.**
   The face is the fastest tell in the corpus and it is a shading fix, not a
   modelling one — the silhouette and hair shapes already read. One backlit ear
   that glows red is worth more than any terrain octave.
2. **Sky fill in shadow.** Terrain shadow sides going to posterised near-black is
   what three separate landscape verdicts were actually reacting to, under two
   different wrong names across two rounds. It is an ambient/indirect term, it
   is cheap, and it fixes overcast, fog and storm at once.
3. **Cloud organisation — streets, systems, one large cell beside a small one.**
   Still the loudest landscape tell, standing since round 15 with a corrected and
   now double-confirmed diagnosis. Add the edge-crispness question to the same
   piece of work.
4. **Put a foreground occluder in every establishing shot.** Cheapest item on the
   list by a wide margin, still unowned, and `vista_dawn` is now direct evidence
   that it — with cover and hue range — is worth a hesitation.
5. **Near-field cover as geometry, not albedo.** `e3897af` bought the mid-distance
   band. The 0-30 m band in front of the camera is still dirt with dots in
   nineteen frames.

`tmp/ab/r16/`, `tmp/ab/r16-control/` and `tmp/ab/r16-mixed/` are deliberately not
kept: they regenerate from the corpus and the plates in one command, and the
blind is only worth anything if the next round builds its own.
