# Mid-ground — the daylight band from 60 m to 400 m

Owner: the mid-ground agent (`PORT=5530`), 2026-08-23.
Branch: `worktree-agent-ae7aa657578f4e7fc`, merged up from `main` at `6b61bec`
(**created 234 commits behind — that is now six agents in a row and it really
should be a worktree-creation step**). A fresh worktree also has no
`node_modules` and no `src/public/`; both need a symlink to the main checkout
before anything runs.

Predecessors, all of which handed a piece of this over: `project/handoff/variety.md`,
`project/handoff/budget.md`, `project/handoff/terrain-material.md`,
`project/handoff/shadows.md`.

**Status: three commits landed, all gated.**

---

## The brief, and what the measurement said about it

A blind judge validated against a hardened control identified 4 of our 5 frames.
Its stated cue was *"smooth untextured terrain silhouettes, box/decal props, and
repeated card-foliage trees over a single flat ground texture with no
ground-layer scatter or contact AO"*, and every frame it caught was a daylight
landscape with ground running to the horizon.

The first useful thing this lane did was stop reading `reliefstat`'s six-shot
median and read it **per shot**. The median hides the finding completely:

| shot | `tot`, ground ROI | vs `FFXV-ground` 49.00 |
|---|---|---|
| `vista_noon` | 72.39 | 148% |
| `zone_fallgrove` | 63.11 | 129% |
| `vista_dusk` | 62.30 | 127% |
| `zone_vannath` | 48.14 | 98% |
| **`zone_longwythe`** | **28.97** | **59%** |
| **`zone_three_valleys`** | **30.11** | **61%** |

The environment does not have a uniform detail deficit. **Dry Leide does**, and
it is roughly a factor of two behind everything else we render. Those two shots
are two of the four the judge caught.

And the spectral shape of the deficit is specific. Over a mid-ground band ROI
(`--roi 0.10,0.46,0.80,0.18`), the six-shot median against the same plates:

    d4   10.66 vs 13.39   —  80% of the reference
    d8   13.64 vs 14.82   —  92%
    d16  18.13 vs 15.96   — 114%
    d32  27.41 vs 16.38   — 167%   HOT

**Too much large soft blotch, not enough small hard object.** That is one
sentence and it is the whole brief. The 2-8 m surface variegation the
terrain-material lane added is alive out there and is most of the d32; what is
missing is sub-metre contrast.

---

## The measured negative that decided the approach

Before building anything, ablate. `zone_longwythe`, paired `--raw` captures:

| ablation | mean/255 | pixels over 8/255 |
|---|---|---|
| every bush card (`--hide scrub_`) | **0.955** | 2.0% |
| the whole grass ring (`--hide grass`) | **1.654** | 5.0% |

`imgdiff`'s own noise floor is 1.5-1.9/255. **The entire instanced ground layer
of the frame the judge catches is worth about 2% of its pixels**, and
`scrubbind` says the card ring is already 8 076 of 9 000 — 90% saturated, so
there is no headroom to spend even if spending were the answer. FFXV's matched
band is tens of percent cover. Closing that with instances needs roughly fifteen
times the cards, in the one currency this renderer is bound on.

So the mid-ground fix has to be in the terrain shader, which is where ~98% of
those pixels come from. That is not a preference, it is arithmetic.

---

## What landed

### 1. `74e771a` — the `vista_noon` placeholder props, five rounds late

Two of the three offenders were one-line material bugs and **neither was what
the last handoff guessed.**

- **The "chrome-black sphere" is the comms dish, and it was never geometry.**
  `outpostMaterials().steel` was `paintedMaterial(0x8b9095, 0.5, 0.8)` —
  metalness **0.8**. A metal that smooth has essentially no diffuse term; all it
  has is the sun's specular lobe plus a sky PMREM that is dim beside a noon sun.
  On thin lattice members that reads fine because every face catches a
  highlight. On a 1.9 m spherical cap seen from *behind*, with every normal
  turned away from the sun, it renders a near-black ball with two white streaks.
  Three lanes rebuilt the dish's ribs, rim, yoke and counterweight trying to fix
  that. Painted steel is a dielectric; 0.22 is the right number.
- **The rest of the dish is aim.** It pointed up and away, so every ground
  camera saw its convex back, and a smooth cap is a ball whatever you bolt to
  it. Aimed at the shot's own camera — the euler is derived in the comment from
  the camera position and the compound yaw — it needs none of the detail: hard
  elliptical rim, concave sweep, feed horn on its tripod. `tmp/crop/m0-vn-props.jpg`
  against `tmp/crop/m2-vn-props.jpg` at 2.6-3.4x is the whole argument.
- **The containers were not a mip failure.** `variety.md` guessed aliasing and
  left it. `bakedTexture` mips at anisotropy 16 and the blotches resolve cleanly
  at 3x. `rustMaterial` simply put `base.r * 1.35` — saturated orange — against
  a `0.30` neutral grey on a 0.36 m blotch: a 2.5:1 value swing with a full
  chroma swing on top, seventeen blotches across a 6 m container. Now 1.19:1.
  The third container was `M.red`, a saturated brick enamel that was the
  brightest object in the frame; all three are rusted steel.
- **And the compound cast no shadow at all**, because `outpost` was not in
  `Outposts.build`'s `casters` set. That is the judge's "box/decal props, no
  contact AO" verbatim.

**A correction against my own commit message.** `74e771a` says the caster change
cost "+19 draw calls on `vista_noon` (529 -> 548)". **It does not — it costs
zero**, and the 529 was capture-order noise from a six-shot run. Re-measured
properly, one shot per capture, base against HEAD:

| shot | draws before | after | triangles before | after |
|---|---|---|---|---|
| `zone_longwythe` | 598 | 598 | 8 071 812 | 8 071 812 |
| `vista_noon` | 549 | **548** | 8 289 683 | 8 289 683 |
| `zone_three_valleys` | 555 | 555 | 8 281 671 | 8 281 671 |

Triangle-identical to the triangle, and one draw call *cheaper* — dropping
`M.red` from the containers removed a material from the merged group, which is
worth a colour draw plus its cascades and pays for the group entering the shadow
pass. **The whole lane is free in the currency this renderer is bound on.** I
made the same mistake the handoff warns about two sections down, in the same
session in which I wrote the warning.

### 2. `c2339eb` — a dry-country ground layer painted into the terrain

`TerrainMaterial.ts`, a tier-D analogue for the country the sward's `bioGreen`
gate excludes. Zero draw calls, zero triangles, no new uniform or texture.

Three design decisions, each of which is the finding:

- **The dominant octave is 0.74 m, not metres.** 16 px at 60 m, 5 px at 200 m,
  faded out by its own screen footprint at 300 m where it stops being
  resolvable, with a 1.9 m octave under it that runs to the horizon. Everything
  coarser than that lands in d32, where we were already at 167%.
- **It is a height, not a stain.** A flat multiply adds value range without
  adding structure and would have landed in d32 with the rest of the blotches.
  The mat stands proud through `tf_bump`, so every clump has a lit side and a
  shaded side and the contrast comes out of the sun.
- **It is bimodal, because the shortfall is at the top of the range.** Luma
  percentiles over the mid-ground band:

      ours zone_longwythe      p10 40.6   p50 63.0   p90  97.6   p90/p10 2.40
      ffxv duscae-plains-noon  p10 35.4   p50 65.2   p90 122.5   p90/p10 3.45
      ffxv duscae-wilderness   p10 13.1   p50 32.2   p90  86.7   p90/p10 6.60

  We are a stop short of the reference's value *range* and our p10 is already
  the higher of the two, so cover that only darkens walks both ends down
  together and closes nothing. Bleached straw crowns brighter than the soil,
  dark shade beneath. **The first version of this term darkened only, and it is
  recorded here as the wrong instrument rather than as a tuning miss.**

  The dark endpoint is measured the way the sward's was meant to be:
  (0.644, 0.752, 0.708), from the 22 011 pixels our own scrub cards actually
  cover in a `--raw` pair — not from a rectangle that averages them with bare
  ground.

**The gating is exact, and that is the evidence it is doing what it says.**
Paired `--raw`, mean/255:

| shot | delta | pixels > 8/255 |
|---|---|---|
| `zone_longwythe` | **2.647** | 7.3% |
| `zone_three_valleys` | **2.519** | 7.6% |
| `vista_dusk` | 1.992 | 5.6% |
| `hero_full` | 0.866 | 1.9% |
| `zone_vannath` | 0.578 | 0.9% |
| `zone_fallgrove` | **0.000, max 0** | 0.000% |
| `zone_nebulawood` | 0.020 | 0.001% |

`reliefstat` on `--raw` `zone_longwythe`: total 18.06 -> 19.22, d1 8.76 -> 9.47,
d2 7.81 -> 8.99, d4 6.79 -> 7.24.

### 3. `b37c9cd` — the sward's colour was measured wrong, and it barely matters

The tier-D sward's tint came from a 900x160 rectangle with and without grass.
A rectangle averages the grassed pixels with the bare ones between them, so that
is the **partial-cover** ratio, and it was applied at **full** cover. Re-measured
over the pixels the blades actually cover:

    zone_fallgrove   ratio (0.826, 1.029, 0.735)
    zone_vannath     ratio (1.028, 1.303, 1.123)

Two findings. The humid ratio is about twice the chroma swing of the shipped
(0.922, 0.968, 0.887). And **the dry-savannah ratio is above one on every
channel** — pale straw grass over red soil is *lighter* than what it grows on,
where wet Duscae grass over dark loam is darker. One tint could not have been
right for both and the shipped one was the wrong sign for half the world.

**And it is close to a measured negative.** Paired `--raw` with only this block
changed: `zone_fallgrove` **0.037 mean/255 over 0.006% of pixels**. The 3x
crops before and after are indistinguishable. That is *reach*, not strength —
the endpoints moved 10-17% per channel, so for the frame to move 0.037 the
ground satisfying both the grass splat weight and the 100-185 m ramp at once
must be a small fraction of it. Kept because a wrong-signed constant is not a
defensible resting state, and flagged for whoever widens the reach.

An intermediate version fed the sward tuft through `tf_bump`, which meant
hoisting the block out of its perf-guard branch so the derivative sat in uniform
control flow. That bought 0.144 instead of 0.037 — still under the floor — for
six noise evaluations, a `tf_gust` and a `tf_bump` on **every terrain pixel in
the world** including Leide and the towns. Reverted.

---

## Traps this cost, both already written down

- **Backticks inside a `/* glsl */` template literal**, a fourth time. I wrote a
  variable name in prose inside a shader comment and the next capture hung for
  the full 120 s with a bare daemon stack and no useful error. `LANDMINES.md`,
  both terrain handoffs and `sibling-TRAPS` all warn about this and it still got
  me. **If a capture hangs immediately after a shader edit, grep the edited
  range for a backtick before doing anything else** — it is one `awk` and it is
  always the first thing to check.
- **Draw counts in `manifest.json` are order-dependent.** `zone_longwythe`
  reported 578 when captured first and 598 when captured after another shot in
  the same page, with no code change between. Vegetation streaming state carries
  across shots in a daemon page. Never price a change from two multi-shot runs;
  capture the one shot alone on both sides.

---

## What is left, ranked, and what is known about each

1. **The Meteor of the Disc, and it is a silhouette problem, not a texture one.**
   Both round-9 judges named it independently — *"faceted low-poly floating rock
   with visible flat facets"*, *"visible flat polygon facets on the left rock
   mesh"* — and it is the largest thing in the upper half of `zone_longwythe`.
   `tmp/crop/lw-slabs.jpg` at 2.6x.

   **Read the code before re-tinting it, because the obvious diagnosis is
   wrong.** It is not untextured: `M.stone` is a real `rockMaterial` with an
   albedo, normal and roughness map, `splitNormals` bakes per-face triplanar UVs
   (so no stretched-stripe smear), and `meteorMass` passes
   `uvScale: 22 / (r * 1.95)`, which tiles the map every 27 m — about eleven
   repeats across a 300 m mass. The vertex-colour trap is handled too and there
   is a comment about it.

   What *is* wrong is the shading of the cuts. `meteorMass` takes 16 cleave
   planes, and a cleave plane makes a genuinely flat face; at four kilometres,
   under one directional light, a set of large flat faces reads as exactly the
   hard value steps both judges called "polygon facets". The fix is surface
   break-up on the cut faces — a relief term, or more and shallower cuts — not
   a texture and not a tint. `props/Megastructures.ts`.

   **And the Insomnia skyline, in the same file, is the other half of it**:
   both rounds called it *"a cluster of flat blue prisms"* / *"extruded boxes"*,
   on both `zone_longwythe` and `zone_three_valleys`.
2. **Our graded Leide shots frame a bare plain from 80 m out, and shipped FFXV
   never does.** Every `FFXV-ground` plate has foreground objects in the bottom
   band; `zone_longwythe` has none. That is why its `tot` cannot be closed by
   ground texture alone — d16 and d32 at 21 need *objects*. This is a
   `src/game/Shots.ts` framing question and that file is not this lane's.
3. **Vegetation contact AO is still unaddressed** and the round-8 judge named it
   first (*"no contact shadow or AO where they meet the terrain"*). In Leide it
   cannot be worth much — the whole ground layer is 2% of pixels there — but in
   `zone_fallgrove` and `zone_vannath` it is a much larger share. The cheap
   untried version is a vertical AO gradient baked into `scrubCardGeo` and the
   tree impostor geometry, which costs nothing at all.
4. **The tier-D sward's reach, per §3 above.** Widen `swardAmt` before anybody
   touches its colour again.
5. **`vista_noon`'s lattice mast is still the palest object in a dark frame.**
   Legible now rather than a placeholder, but high-contrast.
6. **Painted clouds with hard alpha edges**, named every round since 5, still
   outside every lane that has run.

---

## Blind round 9, run twice, and neither run is a clean instrument

Both rounds used `compare.mts`'s own printed question verbatim, a fresh agent
with no repo access and no sight of the key, and **landscape-only panels
throughout** — every crop verified by eye to hold no party member, no Regalia,
no boat, no chocobo, no behemoth and no HUD, because a control that leaks a
character lets the judge identify the *game* instead of the *render*. That was
`variety.md`'s parting instruction and it is now done.

**Round 9a — `tmp/ab/r9/`, seed 9317, ten pairs, five real and five control.**

    real     5 identified, 0 fooled, 0 hesitated   — all five HIGH
    control  5 of 5 declined ("cannot tell", MEDIUM), 0 false positives

**Round 9b — `tmp/ab/r9b/`, seed 9741, eight pairs, four real and four control.**

    real     4 identified, 0 fooled, 0 hesitated   — all four HIGH
    control  1 of 4 declined, **3 FALSE POSITIVES at HIGH**

**Each round has a defect, and they are different defects. Read them together
or not at all.**

*9a leaks through recurrence.* Six plate crops were reused across ten pairs
while each of our five frames appeared exactly once. The judge said so
unprompted — *"distinct frames recur across pairs, so effectively five demo
frames are being pitted against a rotating pool of game frames"* — which means
5/5 could have come from counting repeats with no rendering judgement at all.
Its control result is clean, but its verdict is not evidence.

*9b closes that (every panel image used once, twelve distinct plates) and breaks
the control instead.* Its judge called three of four plate-vs-plate pairs at
HIGH. The mechanism is visible in my own build script and is the finding worth
carrying: **our panels are 1400x788 out of a 1600x900 frame — most of the
composition — while several control panels are 700x394 crops of a 1920x1080
plate, upscaled.** Cropping tightly into a shipped frame throws away exactly the
cues that make it read as shipped: the composition, the depth layering, the
aerial perspective across a full field of view. A tight crop of a real game
frame looks like a demo, so the control was harder than the test.

**The rule for round 10: the control panels must be the same fraction of their
source that our panels are of ours.** Which, given that most plates put a
character in the middle of that fraction, probably means curating more
landscape-only plates rather than cropping harder into the ones we have.

What can be said with both defects in view: **we were identified in 9 of 9 real
pairs across two rounds, with zero hesitation, which is where this has sat since
round 2.** The win rate did not move.

### What moved is the cue, and the ground-layer clause is gone from it

The cue this lane was sent to close, stated by the round-8/9 judge that
validated against a hardened control:

> *"...over a single flat ground texture with **no ground-layer scatter or
> contact AO**"*

Neither round-9 judge says that. Asked for the single most reliable cue across
the whole set:

| round | the cue, verbatim |
|---|---|
| 9a | *"**Whether small objects are individuals or copies.** In every demo panel the scatter — trees, rocks, terrain bumps — is a few meshes stamped repeatedly ... and shadows that read as flat dark decals sitting apart from the object."* |
| 9b | *"**Whether surfaces hold detail when you get close to them.** ... terrain, cliffs, walls, ground — are either smooth vertex-lit gradients or one low-resolution texture stretched over a huge area, with no normal-mapped micro-relief."* Second: *"atmospheric depth ... the demo panels render far geometry at near-field contrast and paste clouds on as hard-edged billboards."* |

"No ground-layer scatter" has dropped out of both. What replaced it is **the
terrain's own surface and silhouette**, **instance variety and shadow
anchoring**, and **sky and aerial perspective** — the first is arguably still
this lane's, the second is `variety.md`'s and the shadow lane's, the third has
been named every round since 5 and belongs to nobody.

Three findings from the per-frame reasons are worth acting on:

1. **Both rounds independently named the Meteor.** 9a: *"faceted low-poly
   floating rock with visible flat facets"* on `zone_longwythe`. 9b: *"visible
   flat polygon facets on the left rock mesh"*. That settles open item 1 — it is
   **not** aerial perspective doing its job, it is a dead surface, and it is in
   `props/Megastructures.ts`.
2. **The Insomnia skyline reads as "a cluster of flat blue prisms" / "extruded
   boxes"** in both rounds, on both `zone_longwythe` and `zone_three_valleys`.
   Also `props/Megastructures.ts`.
3. **The birds repeat visibly.** 9b, unprompted: *"retire the identical bird
   sprites while you are in there — they repeat visibly in pairs 1B, 4A and
   8B"*. Cheap, concrete, and nobody has ever named it before.

And the `vista_noon` outpost is **gone from the complaint**. Five consecutive
rounds ended their guess on the dish and the containers; round 9b's reason for
that frame is *"ridges wear a vertically stretched terrain texture with no
normal map"*, and 9a's is the mast plus *"painted-on cloud sprites"*. That is
the one thing in this lane that demonstrably retired an item.

---

## Instruments added or corrected

Nothing was added to `src/tools/`. Three measurement *methods* are worth
carrying forward and are written into the commit messages:

- **Read `reliefstat` per shot, not as a median.** The median said 93-96% of the
  reference while two shots sat at 59%.
- **A mid-ground band ROI**, `--roi 0.10,0.46,0.80,0.18`, which is what makes
  the d4-vs-d32 tilt visible. `reliefstat --roi` crops the same fraction out of
  the plates, so it is comparable.
- **Measure a cover material over the pixels it covers**, not over a rectangle.
  Take a `--raw` pair with and without the layer, mask on `sum|a-b| > 40`, and
  read both means inside the mask. A rectangle gives the partial-cover ratio and
  applying that at full cover is how the sward lost most of its effect.

---

## Shots

- `tmp/shots/m0/` — the state as inherited, six shots, JPEG. `tmp/shots/m0p/` PNG.
- `tmp/shots/m2/vista_noon.jpg` — after the props commit.
- `tmp/shots/m5/`, `tmp/shots/m6/` — after the dry cover and the sward.
- `tmp/crop/m0-vn-props.jpg` vs `tmp/crop/m2-vn-props.jpg` — the outpost at
  2.6-3.4x, before and after. The pair that carries the props argument.
- `tmp/crop/cmp-cover2.jpg` — the `zone_longwythe` mid-ground at 4x, before,
  after, and beside `duscae-plains-noon-05`. The pair that carries the terrain
  argument, and the frame this was actually judged in.
- `tmp/crop/lw-slabs.jpg` — the untextured Meteor, open item 1.
- `tmp/crop/FINAL-2x.jpg` — `zone_longwythe`'s mid-ground at 4x from the PNG
  captures the cost table was taken from: before, after, and the plate.
- `tmp/ab/r9/` + `tmp/ab/r9-KEY.json`, `tmp/ab/r9b/` + `tmp/ab/r9b-KEY.json` —
  the two blind rounds and their controls.

---

## Gates and cost

`PORT=5530 pnpm run check`: **11/11**. `anycheck` 0. `combatloop` 31/31,
`uxcheck` 93/93, `horizoncheck` PASS at worst MCC 0.766 (unchanged),
`heightcheck`, `driftcheck`, `roadcheck`, `creaturecheck`, `integration`,
`orphans`, build. `pnpm run typecheck` and `typecheck:tools` clean.

`perf.mts` on a quiet tree: **PASS, `RULER_VALID: true`**, mean **248.6 fps**,
worst **157 fps** (`town_forecourt`), noise floor 0.38 ms end IQR against a
median 4.3 ms frame. `project/handoff/budget.md` certified mean 202.9 / worst
152 for comparison; nothing regressed, and the difference is not this lane's to
claim.

**Cost: zero draw calls, zero triangles**, measured one shot per capture on both
sides — see the correction under §1 above.

`reliefstat` on the full post-processed captures the cost table was taken from,
default ground ROI, before -> after:

| shot | d1 | d2 | d4 | d8 | d16 | d32 | tot |
|---|---|---|---|---|---|---|---|
| `zone_longwythe` before | 11.30 | 10.39 | 10.01 | 10.09 | 10.95 | 11.33 | 28.96 |
| `zone_longwythe` after | 11.85 | **12.33** | **10.65** | 10.22 | 11.03 | 11.39 | **30.12** |
| `zone_three_valleys` before | 10.99 | 10.43 | 10.25 | 10.45 | 11.88 | 12.61 | 30.12 |
| `zone_three_valleys` after | **12.19** | **11.38** | **10.66** | 10.46 | 11.78 | 12.46 | **30.87** |
| `FFXV-ground` | 11.32 | 15.45 | 16.76 | 18.44 | 21.22 | 21.79 | 49.00 |

`zone_longwythe` goes from 59% to **62%** of the reference total, d4 from 60% to
64%. `zone_three_valleys` from 61% to 63%. **That is a real move and it is a
small one, and the size of it is the honest headline of this lane.**

The gain lands in d2 and d4 rather than in d8-d16, which is where I aimed it.
The ROI runs from about 80 m at the bottom of frame to 400 m at the top, and the
0.74 m octave is 18 px at 80 m but 4 px at 300 m — most of the ROI's *area* is
the far part, so the pyramid puts most of the added energy low. The term is
doing what it was designed to do; the ROI is weighted against seeing it. A
distance-stratified ROI would report this better and does not exist.

---

## My honest grade for the environment, against shipped FFXV

**4.5 / 10.** The same number the variety lane claimed, and I am not claiming
more, because the win rate did not move: nine of nine real pairs identified
across two rounds with zero hesitation.

What this lane can defend. The `vista_noon` outpost has been the judge's
closing evidence for five consecutive rounds and is now gone from the
complaint — and the two things that fixed it were a metalness constant and an
aim, not the three passes of geometry three lanes spent on it. The judge's
"no ground-layer scatter" clause is gone from both round-9 cues. Leide's ground
went from 59% to 62% of the reference's detail energy for zero draw calls and
zero triangles, and the 4x crop before and after is a different material rather
than a different tint. And the ablation that decided the approach —
**every bush card in the frame is worth 0.955 mean/255 over 2.0% of its
pixels** — is the kind of number that should stop the next four lanes from
spending instances on this problem.

What keeps it at 4.5. Three per cent of `reliefstat` is not a frame anybody
mistakes for a shipped game, and I knew that while I was measuring it. The gap
in that shot is not a texture gap any more, it is that **we point a camera at a
kilometre of empty plain and shipped FFXV never does** — every reference plate
has something in its first thirty metres. Both judges spent their reasons on the
Meteor, the skyline, the cliff UVs, the clouds and the aerial perspective, and
not one of those is a mid-ground ground-cover problem. The lane closed the
defect it was given and the frame is still obviously ours.

And one thing against myself, twice over. I wrote a backtick into a GLSL comment
after reading four separate warnings about it, and I priced a change off two
multi-shot captures and put "+19 draw calls" into a commit message that is
simply wrong — in the same session in which I wrote the warning about
order-dependent draw counts into this file. Both are in the traps section
because writing the rule down is evidently not the same as following it.
