# Atmosphere — cloud scattering, aerial perspective, tonemap

Owner: the atmosphere agent (`PORT=5380`).
Branch: `worktree-agent-aba0844b40f558738`, fast-forwarded from `main` at `d3491a4`.
Predecessor: `project/handoff/graphics-ceiling.md`. Read that first; this picks
up its three named items in its stated order.

**Aerial perspective DONE. Cloud coverage and cloud exposure DONE. The grade's
half of the tonemap item DONE. The other half — nothing in our frame ever
reaches white — is open and is the top of the next agent's list.**

---

## The headline

The measured colour signature now lands on the reference. Six field/zone shots
against `FFXV-field`, as the delta from the reference (0 = on it):

|                | start | after aerial | after clouds | after grade | FFXV-field |
|---|---|---|---|---|---|
| `R-B`          | +20.0 | +10.4 | +7.1  | **+0.9**  | -8.5 |
| `sh(R-B)`      | +4.4  | -1.6  | +2.8  | **+2.8**  | +5.8 |
| `hi(R-B)`      | +23.9 | +18.1 | +18.0 | **+2.0**  | -13.5 |
| `sat%`         | +6.0  | +0.2  | +2.4  | **+3.1**  | 29.5 |
| `stops`        | +1.33 | -0.04 | +0.25 | **+0.24** | 9.79 |
| `p0.1`         | -2.4  | +0.4  | -0.5  | **-0.5**  | 3.4 |
| `p50`          | -3.9  | +1.8  | +2.5  | **+2.4**  | 100.9 |
| `clip%`        | +0.72 | -0.45 | -0.44 | **-0.50** | 0.50 |
| `meanL`        | +12.0 | +11.2 | +10.3 | **+10.0** | 102.3 |

The six shots are `vista_noon`, `zone_longwythe`, `zone_three_valleys`,
`zone_vannath`, `zone_malacchi`, `zone_fallgrove` — all daylight,
environment-dominant, no HUD, which is what `FFXV-field` is a corpus of. This is
**not** the previous agent's six; theirs was lost with their worktree, so the
"start" column is a fresh baseline taken at `d3491a4` on this set. Use this set,
not theirs, if you want to continue the series.

## The three findings, each with the ablation that produced it

### 1. Aerial perspective was aiming at the wrong colour (`297bd09`)

Judge defect 5. It was **not** an amount problem. Ablating it
(`?post=noaerial`, new) moved 4.97 mean/255 with 18.4% of pixels over 8/255 on
`zone_longwythe` — the term was in the frame and working.

`?post=aerialmax` is the instrument that found the real fault. It drives
`uHazeBase` to 0.02 so everything past a few hundred metres renders as *pure*
inscatter, and the converged colour can then be read with an eyedropper instead
of solved for out of an unknown blend weight. It read **`#274f8e`, a navy at
luma 72**, against `ART-DIRECTION.md` §2's `#bad2e4` at luma 206.

Right hue, a third of the value. **That is why nobody could have fixed this by
turning the density up**: at the old colour, more density made far ranges muddy,
so the weak setting was a local optimum and every attempt to strengthen it would
have made the frame worse.

The cause: `mix(surface, inCol, 1-T)` converges to the *equilibrium* radiance of
the path, which for a near-horizontal path is the sky radiance **at the same
elevation** — a very long column, hence pale and bright. We sampled 0.55 above
the view ray (~29°) and then mixed 40% toward the zenith. Both moves came from a
real problem (sampling along the ray makes every azimuth warm at low sun) which
the Rayleigh/Mie split immediately below already solves. 0.10 rise, 0.12 zenith
mix. Converged colour `#274f8e` → `#668eab`.

With the colour right, `clear`'s `haze` goes 0.00004 → 0.00024, which is §2's
"70–80% blended to sky at a horizon ridge": 4 km at 76%, 1 km at 29%, 300 m at
10%. `haze` and not `fogDensity`, because the height-fog term pools in valleys
and barely touches a skyline.

### 2. The fair-weather deck was closed, and clipping before post (`4325a35`)

Judge defect 4, and the upstream half of defect 1.

- **Coverage.** `clear` at 0.52 gave a near-total grey blanket at `vista_noon`.
  `?post=noclouds` sizes the problem: six-shot median `hi(R-B)` is **-25.8 with
  no cloud and +4.6 with the old deck**, against the reference's -13.5. The
  reference sits about halfway between our two states, so about half the cloud
  had to go. 0.52 → 0.30, with the remap window narrowed 0.44..0.82 → 0.54..0.74
  — a wide window at low coverage still ran a continuous band across the top of
  frame, because a wide window lets every weak column contribute a little.
- **Trap 7, again, and it cost a capture.** `Clouds.ts` declares
  `uAmbientBoost 1.15` and `uCloudSunGain 0.42`; `Sky._applyTimeOfDay`
  overwrites both every frame. Editing the constructor changed the frame by
  *nothing*, byte for byte on the sampled patches. Both are now commented as
  dead where they are declared.
- **The deck was clipping before post.** A `--raw` capture (pre-tonemap,
  pre-grade) read the cloud body at a flat `255,255,255` across its whole width,
  not just its sunlit crown. Everything above white is hue the shoulder and the
  grade's highlight desaturation have to *invent*, and what they invent is the
  grade's own warm `highTint`. So "the sky clips to pure white" and "our
  highlights are warmer than the reference" were the same defect, upstream of
  the grade entirely. Sun gain 0.42 → 0.26; the raw body now reads `#e3e9ea`,
  under white and faintly cool, with only the crown clipping.
- Ambient 1.15 → 4.00, after ablating each arm separately
  (`?post=nocloudamb` / `nocloudsun`) showed the **sky was contributing 2%** of
  the deck's radiance — 4 levels out of 213. Some of the shortfall is
  dimensional: the term samples sky *radiance* where a cloud element receives
  sky *irradiance*, π times larger.

### 3. The grade warmed the sky and the clouds (`8dd5445`)

`hi(R-B)` delta +18.0 → **+2.0**, overall `R-B` +7.1 → **+0.9**.

FFXV's split-tone is a statement about *light*. Baked flat into a LUT it becomes
a statement about *pixels*, and the two brightest things in an outdoor frame are
not lit surfaces at all — they are the sky and the cloud deck.
`duscae-plains-lake-01` samples its cumulus at `#b1ccde` (R-B **-45**) over a
sky at `#5ea0c9`; ours were `#d5cec5` (R-B +16).

New `GradeLook.highGate` scales `highTint`'s departure from neutral by how warm
the pixel already is, as `(R-B)/luma` so the gate asks about hue and not about
exposure. 1.0 on `day` and `golden`; 0 on `night` and `storm`, whose `highTint`
is already neutral-to-cool and which the gate would simply cancel.

**Read the ordering, it is the lesson.** The graphics-ceiling agent built this
same idea (§3.3), measured 1.4 levels, and reverted it as a measured negative.
That was correct on the tree as it then was: there was almost no blue sky in the
bright quartile for a gate to protect, and the cloud was clipping so its hue was
whatever the shoulder invented. The idea was right and the frame was not ready
for it. **A negative can be a fact about the frame rather than about the idea.**

---

## Blind A/B round 2 — `tmp/ab/r2/`, seed 8171, six pairs

**6 identified, 0 fooled, 1 hesitated.** The tool prints `hesitated 0`
because it counts only LOW confidence; the judge returned **five HIGH and one
MEDIUM**, against round 1's six-of-six at high confidence. That is the metric
the previous handoff said moves first, and it moved one notch. The win rate did
not.

What changed is the judge's *defect list*, and that is the real reading. Round 1
ranked five defects; this is where they went.

| round 1 | round 2 |
|---|---|
| 1. no exposure discipline — sky clips to pure white while the ground crushes to black, no rolloff either end | **gone. Not mentioned once, in any of six frames.** |
| 5. distant geometry takes no aerial perspective | now 4th, and narrowed from all distant geometry to one object: "the city as a flat blue cutout with no aerial-perspective haze separating it from what it overlaps" |
| 4. clouds are an opaque single-layer slab with no scattering | now 3rd, and reframed: not "no scattering" but "hard-edged cutout cumulus with no self-shadowing… degenerating into a smeared blur blob when near-camera" |
| 3. terrain silhouettes are smooth cones with no erosion, one tiling texture on a 60° face | **now 1st, and the loudest tell in four of six frames.** "Smooth vertex-coloured brown lumps at every distance — no detail normal, no roughness variation, no strata, no erosion." *Not this lane.* |
| 2. foliage unlit on its shadow side | now 6th–7th. *Not this lane.* |

Three of the judge's eight are things this lane owns, and two are new:

- The cirrus banding, named twice — **fixed in `102ee7c`, after the round.**
  A round 3 should not see it.
- Cloud silhouette: hard-edged and un-self-shadowed at distance, a smeared blob
  near camera. This is `MARCH_SCALE 0.45` plus the composite's tap filter, and
  it is the strongest single remaining item in this lane.
- Insomnia specifically. Everything else at that distance now hazes correctly;
  the skyline is a separate mesh and may not be taking the aerial term at all.
  **Ablate `?post=noaerial` on `zone_three_valleys` and check the skyline pixels
  move before assuming it is a strength problem.**

**Two of the judge's top five are free wins for other lanes and someone should
take them today:**

1. **"Interact prompts with nobody there."** `TALK / TAKKA` and
   `TALK / CINDY AURUM` float over an empty landscape in three of six frames.
   The judge ranked this **2nd of eight** and called it "the cheapest fix with
   the biggest payoff". An interaction volume is firing with no NPC rendered.
2. **A placeholder primitive shipped in frame.** An untextured white sphere on
   the ridge beside the radio mast in `vista_noon` — the judge named it as
   decisive. It is presumably a radome that never got a material.
   `daycycle_dawn` also has two white vertical bars near the Insomnia wall that
   look like the same class of bug.

Neither is mine to fix and both are reported here rather than edited.

## Measured negatives, recorded as first-class results

- **Narrowing the coverage window alone does not open the deck.** `coverage`
  0.52 → 0.60 with the window narrowed to 0.54..0.74 moved the six-shot
  `hi(R-B)` delta from +18.1 to +14.8 and left `vista_noon` visually unchanged —
  still a lid. The window shapes *which* columns are cloudy; only `coverage`
  decides how much cloud there is.
- **`uCloudMaxRad` is the wrong lever for cloud clipping.** Capping it at 1.15
  and at 1.50 does bring the deck under white, and the numbers improve — but it
  is a Reinhard on the whole of `sunL`, not on its peak, so it compresses the
  top-to-base gradient and the cumulus read as **dull grey smoke**. Reverted to
  3.2; the gain is the right lever because it scales linearly and keeps the
  shape. `tmp/shots/sw-m2/vista_noon.jpg` is the frame that shows it.
- **Raising cloud ambient while the deck still clips is worth one level.**
  `uAmbientBoost` 1.15 → 5.00 with the old sun gain moved the cloud from
  `#d5cec5` to `#e0dbd1`: brighter, and `R-B` +16 → +15. There is no hue left
  above white to move. The same change after the gain came down is worth the
  whole blue shift.
- **`meanL +10` is probably not an exposure error.** The `FFXV-field` plates
  themselves span mean luma **57.2 to 136.0** (`duscae-wilderness-04` 57.2,
  `water-lake-01` 136.0), and `hi(R-B)` from +23.1 to -75.9. A ±10 delta on the
  corpus median is inside the reference's own inter-plate spread. Our vista
  shots are also 40–60% sky against the plates' 20–25%, which is a framing
  confound, not a grade one. Do not darken the game to chase this number.

---

## What I would do next, in order

1. **Nothing in our frame reaches white, and that is now the largest honest
   gap.** `p99.9` 241 vs 252, `clip%` 0.00 vs 0.50 — and the codec asymmetry
   makes it worse, not better: the handoff before this one measured that PNG
   reads *higher* `clip%` than JPEG (3.25 vs 0.71 on one shot), so our 0.00 as
   PNG would be no higher as JPEG. Measured per plate rather than off the
   median: **eight of the ten `FFXV-field` plates reach p99.9 ≥ 246 and eight
   of ten clip at ≥ 0.10%**, where four of our six clip at *exactly* 0.00%.
   The likely cause is that our cloud now has too little *internal* dynamic
   range: I brought the whole body under white where what a cumulus wants is a
   body at ~0.8 and a sunlit crown at 3–4. That is the "no scattering" half of
   judge defect 4 and it is still open. Do not fix it by raising exposure — the
   median is already right.
2. ~~The cirrus sheet reads as parallel scratches.~~ **Done, `102ee7c`**, after
   the blind judge named it twice. `tmp/crop-cirrus.jpg` and `tmp/crop-cir1.jpg`
   are the same crop at 2x, before and after.
3. **The cloud silhouette is soft.** `MARCH_SCALE 0.45` plus TAA gives blurred
   edges where FFXV's cumulus are crisp. Before touching the march resolution,
   ablate: it may be the composite's tap filter rather than the march.
4. **Aerial perspective on creatures.** `ART-DIRECTION.md` §13.2: a boss against
   the sky is a near-black cut-out at 1:10 luma and picks up **no** aerial
   perspective even though terrain at the same distance lifts to `#bad2e4`.
   `MaterialPatch.inject` applies the same `uAerialStrength` to everything. Now
   that the haze is 6x stronger this matters more than it did: check `boss` and
   `hero_full` captures before assuming it is fine. **This is a legibility rule,
   not a lighting one.**
5. The other three weather presets' `haze` values (`overcast` 0.00020, `storm`
   0.00022, `fog` 0.00075) were **not** retuned and are now inconsistent with
   `clear`'s 0.00024 — heavy weather should scatter *more*, not the same.
   `vista_overcast` and `storm` were checked by eye and neither regressed, so
   this is a tidy-up rather than a defect.

## Instruments added

`?post=` tokens, all read by `Sky._ablateWeather` and applied from
`_pushWeatherUniforms` — they **have** to be re-applied every frame, because the
weather cross-fade rewrites all of these on every tick (trap 7 in `Sky.ts`
rather than in `Post.ts`). `PostFX.debugToggle` ignores tokens it does not own
and vice versa, so `shoot.mts --ablate` stays the one dial.

| token | what |
|---|---|
| `noaerial` | `uAerialStrength = 0` |
| `noclouds` | `uCloudCoverage = 0`, cloud shadow off |
| `nocloudshadow` | cloud shadow only |
| `nocirrus` | `uCirrus = 0` |
| `nocloudsun` | cloud march sun arm off |
| `nocloudamb` | cloud march sky-ambient arm off |
| `aerialmax` | **a readout, not an ablation**: `uHazeBase = 0.02`, so a distant ridge renders as pure inscatter and the converged aerial colour can be eyedropped |

## Files touched

- `src/world/Sky.ts` — `clear` preset (coverage, window, haze), the live cloud
  lighting constants, `_ablate` / `_ablateWeather`.
- `src/world/sky/MaterialPatch.ts` — the aerial inscatter sample direction.
- `src/shaders/post/grades.ts` — `GradeLook.highGate` and the baker's hue gate.
- `tsconfig.tools.json` — one line, unrelated, see below.

**Nothing in `src/world/terrain/`, `src/world/veg/`, `src/characters/` or
`src/ui/` was touched.**

`src/shaders/post/grades.ts` is not literally named in my ownership list, which
said `src/engine/postfx/` and `src/engine/PostFX.ts`. It is the shader half of
`GradePass.ts` and no other lane claims it; flagging it in case the coordinator
disagrees.

### One out-of-lane commit, deliberately alone (`661954e`)

`package-lock.json` pins **typescript 7.0.2**, which removed the `baseUrl`
option outright, so `npm run typecheck:tools` fails with TS5102 before reading a
line of code and the pre-commit hook aborts in any fresh worktree. The shared
checkout does not see it because its `node_modules` still holds a stale 5.9.3;
anything running `npm ci` does. Removal is a no-op — `baseUrl` was `"."` and
`paths` values resolve relative to the tsconfig's directory, the same directory.

## Shots that show the current state

- `tmp/shots/atm-base/` — the baseline at `d3491a4`. `zone_longwythe.jpg` and
  `vista_noon.jpg` are the two frames the previous handoff named.
- `tmp/shots/atm-g1/zone_longwythe.jpg` — the same frame at the end. Blue sky
  with separated cumulus, the far ranges receding, Insomnia's skyline hazed
  instead of a black decal.
- `tmp/shots/sw-m2/vista_noon.jpg` — the `uCloudMaxRad` negative: correct
  numbers, dull grey smoke.
- `tmp/shots/atm-tod/` — `daycycle_dusk`, `vista_dusk`, `daycycle_dawn`,
  `vista_overcast`, `storm`, checked so the `clear` changes could not be hiding
  a regression at another hour. Golden hour and the overcast lid both hold.
- `tmp/ab/r2/` — blind A/B round 2, six pairs, seed 8171, sealed key.
