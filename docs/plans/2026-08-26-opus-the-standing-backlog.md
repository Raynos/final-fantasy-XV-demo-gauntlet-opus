# The standing backlog — everything 52 handoffs were still holding

Status: IN-PROGRESS (2026-08-28, opus) — **ten workstreams, none staffed, nothing
locked.** This is a *queue*, not a snapshot: every item below is work somebody
measured, wrote down, and could not finish.

## Why this file exists

`project/handoff/` held **52 files** while `project/STATUS.md` said *"Live right
now — nobody."* Its own README says the length of that directory **is** the
live-agent headcount, and warns about exactly this: *"Ten of them once outlived
the agents that wrote them, and the result was a reader who could not tell a
live workstream from one that merged weeks ago without opening every file."* It
was at five times that.

The rot is not the file count. It is that `project/README.md` says **work is
picked up from `docs/plans/` or `TODO.md` and nowhere else** — *"a handoff note
and a journal entry are a record, not a queue, nobody picks work up from them"*
— and yet the only surviving statement of most of this work was inside a
handoff. Fifty-two dead lanes were each holding a private backlog that no plan
knew about.

So: every handoff was read, its open work extracted here **grouped by what it
is rather than by who wrote it**, and all 52 graduated to
`project/archive/handoff/`. The originals are not deleted and each item names
the file it came from, because the handoff is still the place with the full
argument — this plan carries the claim, the measurement and the next command.

**This supersedes `2026-08-26-opus-ground-and-indirect-light.md`**, written an
hour earlier and folded in whole as WS-2.

### Read this before picking anything up

Three things repeat across all 52 files and are worth more than any single item:

1. **The obvious diagnosis was wrong, over and over.** Nearly every handoff has
   a paragraph beginning "the obvious first guess is wrong and here is the
   measurement that kills it". `BRIEF.md` §6.1 — **ablate before re-tinting** —
   is not style advice, it is the accumulated cost of not doing it.
2. **Several items are measured *negatives*, recorded so nobody re-opens them.**
   They are marked **[DEAD END]** below. Read them as results, not as untried
   ideas.
3. **Four items were closed on 2026-08-25 and their handoffs never learned.**
   Marked **[ALREADY CLOSED]**. They are listed only so that a reader who opens
   the archived handoff does not start them.

---

## Triage — where the 52 went

| workstream | from | weight |
|---|---|---|
| WS-1 the head and hair | `head`, `head-r2`, `head-r3`, `hair`, `characters`, `heroart` | **the judge's #1** |
| WS-2 the ground and the light reaching it | sibling-ports §3.6/§3.8/§2.6, `grounding`, `terrain-material`, `shadows`, `splat` | large |
| WS-3 alpha edges | `alpha-edges`, `vegetation`, `grass` | the judge's #1 of round 5 |
| WS-4 clouds and sky | `clouds`, `clouds-r2`, `atmosphere`, `graphics-ceiling` | one free win inside |
| WS-5 the Meteor, landmarks, massing | `landmarks`, `silhouette`, `midground`, `rocks`, `finish`, `modeling`, `variety`, `variety-r2`, `variety-r3` | large, diffuse |
| WS-6 the last perf stalls | `perf`, `perf-r2`, `perf-r3`, `splat`, `town` | → phase4 WS-0b |
| WS-7 content holes | `content-wire` | breaks a playthrough |
| WS-8 water | `water` | small |
| WS-9 harness and method debt | `method`, `instruments`, `seating`, `no-any*`, `ui`, `variety-r2` | cheap, unblocks others |
| WS-10 creatures | `enemies` | small |

Handoffs with nothing open: `2026-08-22-coordinator`, `2026-08-23-coordinator`,
`boot-memory` (its list went to `2026-08-25-opus-after-phase3`), `budget`
(entirely negatives — see WS-9), `postfx`, `postfx-r2`, `terrain`, `town`,
`trees`, `typescript`, `hydrology`, `no-any-combat-world`.

---

## WS-1 — The head and hair

**The judge's #1, and worth more than everything else combined** (3.0 → 4.0 on
its own costing). `2026-08-25-opus-after-phase3` WS-1 already owns the head's
*proportions*; **this section is the rest of the face and all of the hair**, and
it should be read as that plan's other half rather than as a competitor.

- **The transverse section is 3× too steep.** `head-r3.md` §4 measured it:
  `shellPoint` sweeps a pure ellipse, so the drop from the midline at the
  upper-lip line is **24.6 mm at x = 30 mm** where a real head is about **7**.
  That is what "a blank cheek", "flat sockets" and "a wedge" all are, in one
  number, and it is why a key from either side splits the face instead of
  drawing it. `headprop.mts`'s `transverse.dropMm` is the before/after.
- **The eyeballs are proud spheres.** Front of globe `FACE.eye[2] + FACE.eyeR =
  0.0753` against a lid margin at 0.075 — exactly flush. Move the globe *back*;
  check `skinSnap` and the lid band after. **[DEAD END]** widening the socket
  brushes: `LANDMINES.md` records it cost a lane most of a session and changed
  the rendered frame by nothing.
- **A hard sub-pixel vertical line down the midline**, crown to chin. Reported
  by three handoffs, ablated by none. The move is a `NO_FACEMAP` toggle in
  `facecam.mts`: if it survives a flat face colour it is geometry, if it
  vanishes it is `paintFace`'s lit central T.
- **Hair is the biggest single item in `src/characters/`.** ~870 roots × 3
  locks, each a 4–5 sided *tube* 1.3–2 mm wide, no alpha anywhere, splaying past
  the silhouette. **Do the pixel arithmetic first** (`characters.md` §5.1.2): a
  1.5 mm lock at 4 m in a 1600 px 50° frame is **0.7 px**, and sub-pixel opaque
  geometry cannot be antialiased and can only shimmer. That number probably
  decides the whole design before any modelling starts.
- **Nothing in the last hair+eyes round is judged.** `heroart.md` §11: three
  commits landed, the blind round was never run with `--control`, and
  `perf.mts` came back VOID. Run the round before building on it.
- Open, cheap: the ear is still a flat scoop standing off the head; the cranium
  reads as an egg with the hair off; the shoulder yoke steps out horizontally
  where FFXV slopes C7 → acromion on every character (one term in `torsoShape`,
  one in `jacket`).

## WS-2 — The ground, and the light that reaches it

Four items with one theme: what the ground reflects, what occludes it, what
shadows the light reaching it, and how things meet it. **Two have already been
diagnosed wrong once by being treated separately.**

> **Worked 2026-08-28 by the `ground-light` lane — read
> `project/handoff/ground-light.md` before picking any of this up.** Result in
> one line each: **2a is a measured negative** and is in the negatives table
> below, though the half of it that was real (`LAYER_AVG`) landed at `14c49f3`;
> **2b is half stale** (the `zone_fallgrove` colour disagreement was fixed
> before this plan was written) and half open (coverage economics, and tier-D
> whose *ceiling* is now priced and is in the negatives table); **2c is
> landed** — its "written and never run" commit is an ancestor of `main` and the
> ramp has been rendering for five days, now ablated; **2d is still open and its
> gate has an answer.** Four new `?post=` ablations and three probes were added
> so none of this has to be re-argued.

### 2a. Shadow warmth is a ground-albedo row, not an ambient one

`sh(R−B)` **−9.2** against the FFXV-field reference's **+5.8** — the last
failing check of the grade's nine. **It was filed against the wrong system for
two sessions.** Ablated with exposure pinned (`?post=noexp,noambient` against
`?post=noexp`, because the closed loop hands back whatever you remove),
**deleting the entire diffuse ambient moves the row from −4.9 to −2.3**. The
whole lever is worth 2.6 points of a 15-point gap.

`imagestats.mts`'s own docstring says why and always did: outdoors the darkest
quartile of a frame is mostly *ground*, so `sh(R−B)` reads terrain and
vegetation albedo, not fill colour. §6.5's "metrics have blind spots by class",
arriving for the third time.

**`terrain-material.md` independently reached the same place** and calls it *"the
single biggest remaining lever in this lane"*: the six `RECIPES` in `Layers.ts`
have mean lumas spanning only **0.35–0.47**, so the splat switching material is
invisible. Author them with genuinely different values — a pale scoured sand, a
dark wet loam, a mid grey scree. **Do not re-tint the grade**; the note in
`src/shaders/post/grades.ts` records that moving `day.shadowTint` most of the
way to neutral bought 0.9 of the 15 points.

### 2b. Grass coverage economics, and tier-D's reach

**Reach first — the code says so itself.** `TerrainMaterial.ts:1231` already has
the tier-D sward *and* a separate dry-cover term for Leide, patchy at clump
scale, wind-coupled to the same uniform objects the blades sway on. Its own
comment records it as close to a measured negative — **0.037 mean/255 over
0.006% of pixels** against a floor of 1.5–1.9 — and says what to do:

> *"The reason is reach, not strength. […] Anyone extending this should widen
> its reach before touching its colour again."*

It is gated on the grass splat weight **and** a 100–185 m ramp **and**
`bioGreen`, simultaneously.

**Then coverage economics** (sibling-ports §3.6, from the OGL repo): coverage is
`1 − exp(−λa)`, so near the camera you buy ground occlusion with blade *area*,
not clump density — measured there at 46% → 88% for **+112k triangles instead
of +2M**. Our near ring is `spacing: 0.27, max: 240000` with `HALF_W = 0.046`;
nothing buys width near the camera.

Related, from `grass.md`: **`Bushes.ts` is 491 lines nobody has audited**, and
their albedo has never been pinned the way grass and leaf cards now are — the
same class of defect twice found and twice worth money. And `zone_fallgrove`'s
ground disagrees with itself: `Terrain.groundColorAt` returns a warm brown
(lum 0.090, r/g 1.34) while the rendered mat is pale desaturated green, and
vegetation tints from `groundColorAt`, so grass ends up darker than the ground
it stands in. Decide which side is wrong.

**`src/world/veg/` has no owner** — `2026-08-21-fable-procedural-modeling` owned
it and is archived. Taking 2b means taking that directory.

### 2c. Grounding — the ramp that has never rendered

From `grounding.md`, whose lane was **retired after ~1 h mid-experiment**, and
sibling-ports §2.6 which closed contact shadows as "present and insufficient".

**Every grounding mechanism is scaled to human/room dimensions and every scenery
object in a graded frame is past all of them**: GTAO gathers at a fixed 0.62 m
and fades from 220 m; `ContactShadowPass` marches 0.5 m and range-gates at 55 m;
the CSM's `maxFar` is 190 m — while the graded shots put their nearest visible
ground at **61–80 m**. And `aoBoost` in `VegMaterial.patchVeg` is applied to
grass and nothing else, so trees and bushes carry no base occlusion at all.

**[DEAD END]** a world-metre contact ramp. Sub-pixel at the range the judge
grades, and its own positive control (`?post=gcmax`, all indirect killed inside
the ramp) moved `zone_vannath` by 2.600 mean/255 with the 2× crop **visually
identical**.

**Exact next step, written and never run.** The fraction-of-object ramp builds
and typechecks on the lane's `WIP` commit but has never rendered:

    node src/tools/shoot.mts zone_vannath zone_fallgrove --out tmp/shots/G2p

diff against `tmp/shots/G0p` (baseline PNGs, on disk), ablate with
`?post=nogcontact`, price the ceiling with `?post=gcmax`. **`pnpm run check` has
not been run on that commit.**

### 2d. Occlude indirect diffuse, in-material

3.8(a) built the SH probe and fixed the *aimability* of the diffuse ambient and
the double-count with the env cube. **It did not fix the occlusion.** A
`LightProbe` is no more shadowed by geometry than the env cube was, because our
GTAO is a post pass multiplying the composited frame rather than AO bound
in-material — so it darkens direct light too and cannot darken indirect
specifically. That is the remaining half of §3.8's original complaint.

**Gated on 2c's answer**, deliberately: both touch occlusion at the ground, and
doing them independently is how two lanes ship two terms that cancel. `gcmax`
prices what *all* indirect occlusion inside the ramp is worth, which bounds this
too.

### Two `shadows.md` items that are now stale

- **[ALREADY CLOSED]** *"No bounce light filling the shadows — the only fill is
  one `HemisphereLight` at 0.16 intensity."* That light was measured **inert**
  (0.4 luma of 87.7) and replaced on 2026-08-25 by the L2 SH probe in
  `world/sky/SkyProbe.ts`. The complaint was right; the mechanism is gone.
- **[ALREADY CLOSED]** *"No penumbra variation — `shadow.radius` is never set and
  `shadowMap.type = PCFShadowMap`."* Evaluated as sibling-ports §3.8(b): three
  0.185's PCF branch **already** filters with a Vogel disc rotated by
  interleaved gradient noise (5 taps, ~20 filtered). The contact-hardening half
  needs a blocker *search*, i.e. a depth **read**, which `sampler2DShadow`
  cannot do — and sampling one texture through both a shadow sampler and a plain
  `sampler2D` is undefined in GLSL ES 3.0. The alternatives are a second
  linear-depth shadow pass per cascade (on cascades already costing ~22 ms) or
  VSM (which `Sky.ts:481` rejects for an adjacent reason). And the page already
  reports **"Trying to use 16 texture units while this GPU supports only 16"**.
  Closed, not deferred.

**Still open from `shadows.md`: Leide is bare**, and it is the loudest remaining
environment defect. `zone_longwythe` and `zone_three_valleys` barely move on any
`reliefstat` band because there is almost nothing in them to cast. `bioGreen ≈
0` so the grass rings and the tier-D sward are correctly off — but shipped
FFXV's Longwythe is dense scrub for ten metres and scattered rock and dead scrub
beyond. Confirmed by eye. This is 2b's dry-cover term and WS-5's rock scatter
meeting each other.

## WS-3 — Alpha edges: the round-5 #1, located and unfixed

`vegetation.md` magnified it: **every leaf boundary is a hard one-pixel binary
staircase** with isolated texels flicked off the silhouette, no partial coverage
anywhere. `tmp/crop/edge.png` at 8×.

**[DEAD END]** "TAA's neighbourhood clamp rejects the history at a high-contrast
alpha edge" — the textbook answer, and measured false: `--ablate notaa` moves
5.943/255 over 18.0% of pixels on `zone_fallgrove`, and the crop shows TAA *is*
reaching the foliage edges and softening them. It is simply not enough, because
the jitter is sub-pixel and each leaf boundary is about one pixel.

1. **Anti-alias the alpha cut.** `alphaToCoverage` needs `PostFX.rtScene`
   multisampled (cross-lane; the shared `depthTexture` is the complication);
   hashed alpha is the in-lane alternative. Measure both against
   `tmp/crop/edge.png`.
2. **A spatially varying CAS sharpness.** `alpha-edges.md` measured CAS
   **doubling** both the apparent edge-pixel count and the speckle (51.4% edge /
   15.4 speck with it, 26.9 / 7.7 without), and is explicit that turning the
   constant down is *not* the answer — its benefit is in the same octave as its
   cost, so the lever has to be spatial. `fx.rtScene`'s depth texture is already
   bound by four other passes and is the obvious input.
3. **The near ring's leaf cards are still chunky at 8×** — no longer an AA
   defect but the alpha map's own texel resolution and mip chain. With the
   cutoff now *straddled* rather than tested, `alphaRef` is arguably the wrong
   reference for `VegTextures.ts`'s coverage-preserving chain and should be
   re-derived.

### WS-3 result, 2026-08-28 (`alpha-edges` lane)

All three items closed. Shas `95a34c0`, `46c72a1`. Numbers in
`project/handoff/alpha-edges.md`.

**1 was already landed and is still working.** `alphaToCoverage` plus a
multisampled `rtScene` plus the centred coverage ramp shipped at `3237976` /
`1245d14`; the plan was written before that merge. Re-verified on today's main
with `?post=nomsaa` as the control: near-crown p90 step **102.1 → 75.0**,
`hard%` 28.6 → 22.6, and the partial-coverage band `mid%` 7.86 → 8.74. Hashed
alpha was the fallback if the cross-lane half could not be had; it was had, so
it is moot and nobody should build it.

**2 is landed.** CAS's sharpness is now multiplied by a mask read off
`fx.rtScene.depthTexture`, asking *"does this neighbourhood contain more than
one surface"* as total variation against range over a seven-tap line per axis.
A plane at any angle and a single step edge are both monotone, ratio 1, and
keep all their sharpen; a leaf against the sky doubles back, ratio 2; canopy
runs 2–4. `?post=casmask` renders the mask and is the argument: **2.0% of
`town_forecourt`** (wires and a few thin mouldings, all masonry black),
**26.7% of `hero_full`** — every blade of grass, with the four characters
standing out as clean black silhouettes. Canopy `d1` **9.28 → 8.56** against
the reference plate's 8.58, `d8` and above unchanged to two decimals; treeline
`edge%` 42.14 → 38.96 and p90 61.5 → 58.2; near-crown speckle 37.6 → 26.1.
`perf` 0 of 5 shots over the floor, `gameplay` PASS.

**3 is a measured negative on its stated cause, and the defect has moved.** See
the negatives table. `src/tools/probes/leaftexel.mts` is new and is the
instrument.

## WS-4 — Clouds and sky

**The free win first.** `clouds.md`: *"Why is TAA not accumulating the cloud
buffer?"* — proven not to, and fixing the dither's temporal decorrelation did not
change it. The march writes a jittered half-res buffer **with no motion vectors**
while the field scrolls at 7.5 m/s, so a neighbourhood clamp rejects the history
every frame. If it worked, the entry jitter would supersample the layer **8× for
free** and the residual dusk fringing would go with it. Its own lane calls this
*"the largest remaining free win"* and worth more than any further shader tuning.

- **Cloud internal dynamic range.** `atmosphere.md`: the whole body was brought
  under white, where a cumulus wants a body at ~0.8 and a sunlit crown at 3–4.
  That is the "no scattering" half of judge defect 4. **Do not fix it by raising
  exposure — the median is already right.** (Note: the "nothing in our frame
  reaches white / four of six clip at 0.00%" framing in that handoff is **stale**
  — 3.3 traced the cap to a print `fade` and the daylight slice now clips 2.8%
  against the reference's 0.5%. The cloud half of the complaint stands.)
- **Ground cloud-shadow patch size changed as a side effect and was never
  retuned.** Clear was tuned with 6.8 km blobs and `shadowScale` 3.5 giving
  ~1.9 km ground patches; it now gives **~640 m**. That may be better — FFXV's
  Duscae shadows are a few hundred metres — but it was not chosen.
- `daycycle_dawn`'s clouds read **magenta** where the baseline read orange-red;
  dawn is the one hour where `uAmbBury`'s trade shows. `zone_fallgrove` still
  reads as an even scatter because its camera looks along the deck edge-on.
- `uAmbBury` keys on the *normalised* fill, so a denser cloud buries the same
  amount of sky light — keying on `d` directly with `k = uAmbBury / 0.021`
  reproduces `clear` exactly and makes heavy presets scale right. Left undone
  because `overcast`/`storm` run `uAmbientBoost` at 0.30 and the term barely
  reaches them.

### WS-4 result, 2026-08-28 (`sky-clouds` lane)

Four of the five items resolved; two of them as measured negatives. Shas
`abb11ac`, `e8529a3`, `c757019`, `a432996`, `f2fabc5`.
Full numbers in `project/handoff/sky-clouds.md`.

**The "free win first" is a negative and the premise was false. TAA IS already
accumulating the cloud buffer.** `?post=nocloudjitter` (new) holds the march's
own sub-texel Halton offset at zero while leaving TAA and the camera jitter
alone, which `?post=notaa` cannot do because it clears the view offset as well.
On `vista_dusk` and `vista_noon` it moves the sky band **12.8 and 16.0 mean/255
over 31-37% of it**, and at 5x the jitter-off frame shows precisely the artefact
the ablation was written to detect: cloud silhouettes come through as
square-cornered blocks on the march's texel grid, with the small detached puffs
rendering as literal rectangles, where the jitter-on frame has smooth edges and
wisps. The shipped frame already *is* the 8x supersample this asked for.

The stated mechanism was separately wrong. The field scrolls at `wind` 7.5 m/s
at 5-30 km, which is 1.25e-5 rad/frame against a pixel of 4.4e-4 rad — **0.03
px per frame, thirty-five times below one pixel** — and a posed capture holds
the camera still. A neighbourhood clamp cannot reject a history over motion it
cannot resolve. This also explains, in one stroke, three of `clouds.md`'s own
negatives: the dither decorrelation fix changing nothing visible, full-resolution
marching changing almost nothing, and 448 loop iterations reading bit-identical
are all what you see when accumulation already works.

**Aerial perspective converged 24 levels under the sky it joins.**
`?post=aerialmax --ablate noexp` on `zone_vannath` read the converged colour at
**#99bbd2, luma 182, R-B -57**; the sky band directly above the same ridge in
the same frame reads **#c3d6d9, luma 210**, and §2's measured FFXV ridge is
**#bad2e4, luma 206**. The 0.10 rise and 0.12 zenith mix left over from
`297bd09` were kept on the argument that a few kilometres of ground haze is not
the infinite column the horizon sample integrates — which does not survive
arithmetic, since `uHazeBase` at 2.4e-4/m is about **seven times** the sky LUT's
own near-ground extinction and four kilometres of it *is* the horizon column.
Rise 0.03, mix 0.05; converged colour now **#c4d5d6, luma 209, R-B -18**.

**`daycycle_dawn`'s magenta: the cause recorded above is backwards.** Measured
on the cloud crop at free exposure, B is **143 in all of** base, `nocloudsun`,
`nocloudamb` and `noambbury` — to the level — so the blue is the sky behind plus
the `uCloudHaze` wash and neither march arm puts it there. What the ablations
move is *red*: turning the burial off adds 22 levels of it at p90. The burial's
cost at dawn is **warmth**, so the fix is a hue and not a strength — what
survives the burial arrived through the cloud's sides, so it is tinted toward
`skyHz` rather than left at `mix(skyHz, skyUp, hf)`. Near-free at noon; the
strength is untouched.

**`uAmbBury` keyed on `d`: landed**, `AMB_BURY_REF = 0.021`.

**Cloud internal dynamic range: still open, and it is the top of the next
list.** Looked at 1:1 and 4x: a noon cumulus's crown and self-shadowed base
differ by well under a stop and its interior has no structure at all. The 15-20
px edge is geometric, not filtering — a 2.25 km cloud at 20 km subtends ~160 px
and its density ramp is 10% of that — so neither `uCloudTap` nor `MARCH_SCALE`
is the lever. `cloudDensity`'s remap steepness and the `uCloudSunGain` /
`uCloudMaxRad` pair are.

**The ground cloud-shadow patch size: still open.** `shadowScale` 3.5 maps
9.45 km of cloud field onto a 2.7 km ground tile, so the patches are **3.5x
smaller than the clouds casting them** — left over from before `3ccde18` shrank
the clouds. Taking the scale to 1.0 alone puts about one patch in the visible
world, so the tile has to move with it. Separately, `zone_vannath`'s shadowed
band is **26% of the sunlit band in linear** where a real cumulus shadow under
clear sky is about 11%, so the shadow is if anything too *shallow*. Do not
deepen it.

**`zone_mencemoor`'s massif is not an atmosphere item.** The frame is 6.92
stops against `FFXV-field`'s 9.79 with `p0.1` 21.8, and `?post=noaerial` takes
it to 11.69 — but the bottom of that frame is **434 m** from a camera at 286 m
(42° fov, target 107 m above the eye), which at `clear`'s haze is a **10%
blend**, exactly §2's own "300 m at 10%". A 10% blend of a luma-209 inscatter
onto a black surface is 17 levels of floor, which is `p0.1` 21.8 to within the
measurement. The haze is on spec; **the frame has no foreground** — every pixel
is sky or terrain at 400 m-plus, so its darkest quartile is hazed distance by
construction. Content and framing, not sky.

### The fourth handover, mid-session: the auto-exposure meter

`src/engine/postfx/Exposure.ts`, routed to this lane by the coordinator.
`probes/expmeter.mts` is new and reports, per shot, the ratio of the multiplier
the integrator settles on to the scene exposure the Sky publishes from sun and
sky irradiance. **Before: median 1.361, spread 0.700-1.899, and six of twenty
poses on a rail** — a third of the corpus's stop decided by the edge of the
band rather than by either model. **After: median 0.944**, with the four
rail-bound dark scenes unmoved.

Eight-shot day slice against `FFXV-field`, session start -> shipped:
`sh(R-B)` **-9.8 -> -5.1**, `meanL` **109.8 -> 104.4** (ref 102.3), `p0.1`
**0.8 -> 1.8**, `p50` **92.6 -> 95.0**, `hi230%` **8.84 -> 5.19** (ref 6.20),
`clip%` **1.12 -> 0.20** (ref 0.50), `stops` **11.52 -> 10.74** (ref 9.79).
Seven of eleven columns improved; `R-B` and `hi(R-B)` moved about a level the
wrong way and both are sky-fraction-confounded.

## WS-5 — The Meteor, the landmarks, and massing

The single most-named object in the judge's rounds, across five handoffs that
each own a piece of it. **Read all five before touching it** — `rocks.md`
explicitly corrects its own brief: `meteorMass` and `CLEFT` are in
`src/world/props/Megastructures.ts`, which the *town* lane owned, not the rocks
lane.

- **The Meteor floats**, called *"a floating rock arch"* twice unprompted on two
  shots. `_meteor` seats at `seatY(...) - 90` and from 3–5 km that does not put
  its skirt behind the intervening ranges; the 420–800 m ejecta ring is too
  tight to read as a crater rim. Cheap and high value: a deeper seat, a wider
  lower apron, and masses whose feet are below the local ridge line.
- **The overhanging prow.** Seating cannot reach it — it is real geometry in
  `meteorMass`'s cuts on a mass leaned to 0.46 rad. Two untried candidates: less
  tilt, or rock behind it. **The binding constraint is `zone_mencemoor`**, whose
  camera is 1.7 km out looking straight at the Disc — size any ejecta ring
  against that shot, not Longwythe. (Same geometry that made a plinth under
  Insomnia wrong.)
- **[NOT A TEXTURE PROBLEM]** `midground.md` is emphatic: `M.stone` is a real
  `rockMaterial` with albedo, normal and roughness maps, `splitNormals` bakes
  per-face triplanar UVs, the vertex-colour trap is handled. What is wrong is the
  **shading of the cuts** — 16 cleave planes make genuinely flat faces.
- **`meteorMass` uses `uvScale: 22 / (r * 1.95)`** — twenty-two tiles across the
  mass *whatever its size* — so a 585 m mass and a 4 m boulder get the same
  pattern at a hundred times the scale. That is the other half of "one tiling
  texture per surface, at the wrong scale", and it is why the joint network is
  3.8 m across on a meteorite.
- **The towers are still prisms.** The surface half landed (the judge can see the
  windows); the silhouette half did not. Untried axis: **massing** — L-plans,
  notched shafts, twin slabs with a gap.
- **`_imperial`, `_tomb`, `_landmark`, `_dungeon`, `_chocobo`, `_menace`,
  `_haven` still build from bare `BoxGeometry`.** `_block` and `_hut` are the
  templates. The tomb is the one that "most has to read from a kilometre away"
  by its own docstring.
- **The 124 POI aprons are still cake stands**; the haven pad is a smooth cone
  with no scree, rills or tonal break across 30 m of batter.
- **Grass grows through the town plaza and the outpost pads.** The kits publish
  `_exclusions`; something downstream is not reading them at pad radius. Still
  undiagnosed — **ablate before theorising**, and note the last two "obvious"
  diagnoses in that lane were both wrong.
- **Six of eight review shots have not been captured since `6306fc6`** —
  `zone_three_valleys`, `zone_longwythe`, `zone_vannath`, `zone_ostium_gorge`,
  `vista_noon`, `zone_taelpar`. Three commits unseen. `floatcheck` never ran
  there (every attempt returned `socket hang up`).
- **The near half of `zone_longwythe` has no rock in it** — everything below the
  road is scrub and dirt. `probes/rockfield.mts` already does most of the census.
- **`_genOutcrop` is ungraded** and needs the same plan/seat split `_genTor` got.

### WS-5 result, 2026-08-28 (`landmarks` lane)

Landed: `b1db957` the Meteor's texture scale is world-referenced (metres per
tile) rather than per object · `7fdd391` the mass seat, the prow and the crater
rim · `7cb498e` tower massing, six plans · `c2e2295` every POI boulder is a real
`rockGeometry` on a real `rockMaterial` · `94a6429` `assertAttributeContract`
wired into `PartBuilder.build` · `d3b4ba9` stacked-rock joints planned against
the sunk position · `53de19d` rills and a tonal break on the apron batter, and
`PoiKits.PAD_R` published for the vegetation lane.

**The measurement that reframed most of it.** `discCrater` is a real crater and
nobody had read its profile: a 253 m central peak, a moat at **3–56 m from 200
to 600 m out**, and a rim at **800–1000 m standing 130–420 m** over it. The four
outer Meteor masses stand 320–360 m from the centre — in the moat — so the
previous round's full ground-follow dropped each about 180 m and their crowns
finished *below* the rim. From every camera, four of five masses were invisible
and the fifth was a lone dome: the seat had reintroduced the exact silhouette
five masses were authored to cure. And the 420–800 m ejecta ring was in the moat
too, walled off from every camera by the crater's own rim, which is why fixing
its seat last round made it visible and changed nothing.

**A new defect, found on the way and not in this plan.** Every rock instance is
drawn at `y - ny * sink` with `sink` from `placedScale`, scaling with the
instance's own `s`; a stack tapers, so the block below always sinks further than
the block on it, and `stackPlan` / `torPlan` / `_genOutcrop` all authored their
overlap on the un-sunk numbers. **122 open joints of 1615** on the slab-based
corestone stacks, up to 378 mm of daylight. Invisible to both instruments that
look closest: `probes/mushroom.mts` grades width and is silent about the
vertical, and `floatcheck` gate 2 measures against the *terrain*, so a course
standing on another rock is in its own published blind list.
`probes/stackjoint.mts` is the missing measurement.

Still open: the seven kits that build from bare `BoxGeometry` (`_tomb` first),
`_haven`'s shelf drum, `_genOutcrop`'s grading. `project/handoff/landmarks.md`
has the state.

## WS-6 — The last perf stalls — **CLOSED 2026-08-28, and the 33 ms rule is MET**

`gameplay.mts` at `747136a` reports **total hitches: 0**, `RULER_VALID: true`,
every segment over 60 fps. `sprint+turn`'s worst frame went **40.7 -> 7.6 ms**.
This is the first session in this repo's history with no frame over 33 ms
anywhere in a real play session, and BRIEF rule 3 is now met rather than owned.
Handoff: `project/handoff/perf-r4.md`.

**Four of this section's items were already dead when it was picked up**, which
is what a queue costs when nobody re-reads it — the same failure the velocity
cull note below records. `day-night-sweep` was **7.0-7.1 ms**, not 11.3;
`menu-open` had **zero hitches and a 7.4 ms max**, twice; the menu scrim was
signed off by those same two runs; and `town_forecourt` was already at 786 with
`drawcheck` flat and green, not "24 away". Each is struck through below.

The baseline was **published and passing** as of 2026-08-25 (`RULER_VALID: true`,
floor 16%, mean 218.1 fps, worst 140, every shot over 60). What was left:

- ~~**`sprint+turn`, 84–116 ms, same frame index every run**~~ — **DONE,
  `747136a`. It is ONE draw call linking ONE shader program, and it was neither
  named candidate.** Both are now measured negatives in the table below. The
  frame's whole cost is inside a single `renderBufferDirect` (35.5-90.8 ms),
  `renderer.info.programs` grows by exactly one across it, and the new cache key
  differs from its nearest already-linked twin in **one bit** of three's second
  `getProgramCacheKeyBooleans` mask: bit 11 `doubleSided` for
  `roadflat_road_rust` at frame 35, bit 5 `skinning` for a `VelocityPass` proxy
  at frame 23. `RoadFurniture`'s rust is `FrontSide` and only the `DoubleSide`
  copies in `PoiKits`/`Outposts`/`Landmarks` had ever drawn; every mover in the
  world at boot is a character, so only the skinned velocity shader had ever
  linked. `Warmup` gains two steps — `unbuilt content` (walks each system's own
  material tables and draws a scratch box per material; deliberately does *not*
  skip materials already in the scene, because three keys the program on the
  object too) and `velocity proxies` (`VelocityPass.warm`, all six variants,
  materials **held** so three does not release the programs). Cost: the loading
  screen pays **150 -> 566 ms for 9 programs**; boot time is not in `BRIEF.md`.
  New instrument: `src/tools/probes/perfstall.mts`.

  **And `perfsprint.mts`'s "zero new programs" was a false negative that cost
  two rounds.** It compares programs by `name + '|' + cacheKey.length`
  *strings*, so a program whose key-string is already in the list reads as no
  program at all. Count `renderer.info.programs.length`, or diff the keys.
- ~~**`menu-open` hitches are not a regression.**~~ **CLOSED — there are no
  hitches.** `gameplay.mts` three times on 2026-08-28: `menu-open` is
  **4.6-4.9 ms thru, p99 7.4-8.9, max 7.4-8.9, zero hitches** every run, two of
  the three on a ruler that stamped `VERDICT: quiet`. The historic finding, kept
  because it is the shape of the defect if it returns: `perfmenurepro.mts` gives 27
  against the certified baseline and 26 against HEAD; the `baseline-gameplay.json`
  row saying 0 was a lucky 90-frame sample. 100% gated on a menu having been
  opened, periodic on frames 9/19/29/…, pure CPU inside `post.render` with
  `ScenePass` going 3.5 → 37.6 ms at the same draw count and triangle count,
  creating no programs, textures or geometries, and surviving every ablation.
- ~~**`day-night-sweep`: 11.3 ms, 11% over budget, unattributed.**~~ **CLOSED —
  7.0-7.1 ms**, three runs, well inside a 16.7 ms budget. It was never
  attributed because by the time anyone looked it was not over.
- **The frame is a draw-call count** (~8.7 µs/draw, corr 0.801 vs 0.628 for
  triangles). **Gated now** — `src/tools/drawcheck.mts`, in `check.mts`, budget
  parsed out of BRIEF rule 3, ratcheted on `project/draw-baseline.json`. It
  also settles the "reconcile the 349-draw ablation against the 46-mesh page
  count" question above: **both were wrong, because both counted scene meshes.**
  Wrapping `renderer.renderBufferDirect` attributes every real draw, and about
  40% of a town frame is not scene meshes at all — three shadow cascades on a
  rotating refresh schedule, plus the velocity pass's proxy scene. Held poses of
  `poi_reststop` go 707 855 707 **1005** and repeat; the capture lands on the
  1005 phase.

  **Eleven shots are still over, 818–945, and every one of them is Hammerhead.**
  Nothing else in the corpus exceeds 792. Merging the town's and the POI kits'
  shadow casters took the worst from 1013 to 945; the remaining 145 is **not in
  `world/town/` or `PoiKits.ts`**. Attributed on `town_forecourt`'s peak frame,
  by owner:

  | draws | owner | what |
  |---|---|---|
  | 156 | `src/characters/npc/` | 11 town NPCs, ~6 meshes each, casting individually |
  | 136 | `src/world/veg/` | three grass rings |
  | ~106 | `src/engine/postfx/VelocityPass.ts` | motion-vector proxies — was **`frustumCulled = false`, so off-screen movers still drew**; **FIXED in 4c57c1c**, which culls everything but skinned and instanced proxies and says why each exception stays |
  | 90 | `src/characters/` | the four party rigs |
  | 80 | `src/world/terrain/Clipmap.ts` | 28 clipmap rings |
  | 65 | `src/world/veg/` | trees |
  | 52 | `src/world/props/Landmarks.ts` | |
  | ~46 | — | Hammerhead, after the merge (was 100) |
  | 36 + 36 | `RoadFurniture.ts`, `Outposts.ts` | |
  | 44 | `src/world/props/Rocks.ts` | ten families, 4 draws each |

  The instrument that produced that table is a ten-line
  `renderBufferDirect` wrapper; `src/tools/probes/vegcensus.mts` is the nearest
  thing in the tree and it uses `traverseVisible`, which cannot see any of the
  shadow or velocity work. **The velocity pass's missing frustum cull is done (4c57c1c)** —
  this section still called it the cheapest remaining win a day after it landed,
  which is what a queue costs when nobody re-reads it. The next one is the same shadow-proxy merge
  applied to the NPCs — see `shadowProxy` in `world/town/Hammerhead.ts` and
  `world/props/PoiKits.ts` (duplicated in both; it belongs on `PartBuilder`).
- ~~**A perf sign-off is owed on the menu scrim.**~~ **SIGNED OFF.** Two
  `gameplay.mts` runs, the second stamped `VERDICT: quiet`: `menu-open` **4.7
  and 4.9 ms thru, max 7.4 ms, zero hitches**. The blur costs nothing a frame
  budget can see. The claim it settles: WS-9 made a full-screen 26 px
  `backdrop-filter` blur render for the first time — it had never run — and it
  now runs on every menu frame. `uxcheck` passes 93/93 with no page errors but
  does not time frames, so BRIEF's 33 ms rule is unverified against it.
  `gameplay.mts` on a quiet tree settles it.
- ~~**`tf_stoch` has never been measured.**~~ **MEASURED, and it is free.**
  `?post=nostoch` (`73ae5f0`) collapses the Heitz-Neyret sampler to a single
  barycentric tap. `perf.mts` over six ground-dominant shots, both sides
  `RULER_VALID: true`: **0 of 6 shots moved by more than the 0.93 ms floor**,
  mean 239.0 fps against 239.5, and the sign is inconsistent shot to shot
  (`zone_longwythe` is *slower* with the sampler off). **The `vTDist < 400 m`
  fallback is not worth building.**

  The ablation is not a null one — that trap is `BRIEF.md` §6.1's and it was
  checked: nostoch moves `zone_longwythe` **1.14 mean/255, max 196, over 14.8%
  of pixels**, and the ground's micro-detail is visibly different in a crop.
  `splat.md`'s highest-priority remaining item, closed.
- **Wave 3's frame-cost split** (pixel-scaled vs fixed), and **a noise floor per
  shot in `perf.mts`** which is what blocked it — the floor is measured on
  `shots[0]`, so argument order decides whether a run certifies. Both are already
  written into `2026-08-22-opus-phase4-content-and-gameplay.md`'s WS-0b inbox.

## WS-7 — Content holes that break a playthrough

### WS-7 result, 2026-08-28 (`water-content` lane) — 1, 3 and 4 closed, 2 and 5 untouched

`2b344e7..b915af3`, handoff `project/handoff/water-content.md`.

1. **Closed, and it was not the job this section describes.** Four of the six dry
   pins had water six metres away; see the negatives table. `Fishing._survey` is
   one predicate different and the count went **4 live holes -> 8**. The
   remaining two — `caem_shore` (sea 246 m out and 100 m down) and
   `rachsia_bridge` (no water within 600 m) — are genuinely dry ground and the
   world map now draws them **dead**: glyph struck through, `does:` line struck
   through, footer UNAVAILABLE IN THIS WORLD. The predicate asks the live
   survey, so it cannot go stale.
2. **Energy deposits: not started.** `src/world/props/`, outside this lane.
3. **Fishing audio: landed.** `reelClick` per notch of line recovered rather
   than looped, `lineStrain` gliding with tension, `castWhirr` plus a positional
   `splash` at the float. Counted: `ui x2, warp x1, hit x2` before, `ui x2,
   cast x1, splash x1, reel x6, line x34` after.
4. **`setPiece`: already existed.** See the negatives table, twice.
5. **Fociaugh's 1.26 bank: not started.** `src/world/dungeons/`, outside this lane.

The original text follows, from `content-wire.md`, ranked there:

1. **Seven of ten fishing pins have no water.** The largest content hole left and
   *"the most likely thing to break a 30-minute playthrough"*, because the world
   map's `Fishing` filter lists all ten. Measured: `swainsmere` sits at 68.4 m
   under closed forest canopy, `malacchi_pond` at 20.0 m, both answering
   `prompt=none` — a player who fast-travels there finds a jetty on a hillside.
   It is a `Water.ts` or `WorldMap.ts` + re-bake job, not a fishing one. Cheap
   mitigation meanwhile: draw a pin the live survey does not know about as
   unavailable, the way `MainScreen` draws an unregistered screen.
2. **Energy deposits are invisible** — no visible deposit, no "Draw" prompt.
3. **Fishing is nearly silent** — a reel click, a splash, a line whine.
4. **`setPiece` in `Shots.ts` and `applyShot`**, so a live boss fight is in the
   corpus and not only in `tmp/`. The diff is in that handoff's §6.
5. Fociaugh's cave mouth sits on a 1.26 bank.

## WS-8 — Water

### WS-8 result, 2026-08-28 (`water-content` lane) — 1 landed but unverified, 2 closed, 3 handed on

`b237dc6` `5531bd9` `73c19b7`, handoff `project/handoff/water-content.md`.

1. **The width raise landed at the suggested `2.5 + 14 q` and is not what was
   wrong.** See the negatives table. What *was* wrong at a reach is the **bank
   decal**: 8.08 m mean per side against a 1.75 m water half-width, because
   `firstCrossing` never reaches `bankH` on a valley floor. It is capped by
   discharge now and the strip reads as a bank.
2. **Closed by ablation, and neither named handle was involved** — the flat
   white patch is the lake surface's own `uFoamBand` margin, which was a
   **depth** where it needed to be a distance along the beach. Two extra bed
   taps for the local slope and the margin is a margin again.
3. **Handed to terrain and veg with numbers.** 698 of 6 280 shore points (11%)
   have a run-out gentler than 4 m; the gentlest is 15 m. At Galdin the shore is
   submerged rock with grass to the waterline, and the ribbon cannot manufacture
   sand where the baked ground albedo is grass. Making Galdin a beach is a
   `Field.ts` grade (a 30–60 m sand shelf at the POI) plus an `Ecology` grass
   suppression below about +2 m there.

Also landed here: `assertConsistentWinding` has its build-time call sites in both
water generators (`73c19b7`), the harness lane's hand-off — 329 833 interior
edges on the ribbon, 0 flipped.

The original text follows.

1. **The rivers are now too narrow** — mean width **3.09 m**, max 12.71, mean
   depth 0.36 m. A brook, over-correcting the old 64 m sheet. Raise the
   half-width cap `1.5 + 9.5 q` and depth `0.34 + 1.55 q`; the lane suggests
   `2.5 + 14 q`. **Unverified either way — no round was had on it.**
2. **Near-field foam is a flat white patch rather than a lace.** The `lace`
   threshold and the `brk` shore-break term are the handles.
3. **Only 514 of 5,677 shore points have a beach gentler than 4 m of run-out**,
   so the ribbon mostly reads as a wet stripe. Correct for Cape Caem; the fiction
   says Galdin Quay is a beach.

Review close-ups with `node src/tools/probe.mts tmp/water/look.mts --shot …` —
every corpus shoreline is 250 m+ from camera and cannot show this.

## WS-9 — Harness and method debt — **CLOSED 2026-08-28, all eight**

Four of the eight were **already done** and this document did not know; the
other four landed. Kept here rather than deleted because half of this section
was wrong, and *how* it was wrong is the reusable part.

**`--hide` was never broken the way this section said.** The claim was that an
ablation frame renders with ~320 draws of *less streamed content* than its
control. It was **one frame of shadow-cascade phase**. `Sky._updateCascades`
refreshes the three cascades on a stride of `[1, 2, 4]` keyed on
`game.time.frame`, and `Clouds.renderShadow` on `frame & 3`; `applyShot` calls
`resetClock()`, so a pose **always ends on frame 8** — the one phase where all
three cascades *and* the cloud shadow are due, and the most expensive frame of
the cycle. The hide pass then stepped one more frame, so the control sat on 8
and the ablation on 9. Held at `town_forecourt` the cycle reads
`791 612 690 612 791 …`. The fix spends the last settle frame on the ablation
rather than adding one after it. A 4-mesh waymark now costs **5 draws** where it
read −301, and `poi_kits` **33** where it read −349 — and 1188 − 1160 = 28,
exactly what the difference-two-ablations workaround was reaching for. `da7bfe2`,
`PROTOCOL` 14, probe `_probe/hidephase.mts`. **Cost ablations are trustworthy
again.**

- **`assertAttributeContract` has a caller** — `geocheck` asserts it over the
  bestiary, 0 broken of 21 mesh/material pairs. `ebdc699`. **Two build-time call
  sites remain and belong to live lanes:** `assertConsistentWinding` →
  `water-content`, `assertAttributeContract` in a generator → `landmarks`. Each
  must be `try`/`catch` + `console.error`; **a throw inside `init()` hangs the
  boot.**
- **17 generator entry points** added to `must-run.json`, 56/56 reached, and
  `reachcheck` now separates **DEAD** (instrumented, never ran) from **GONE**
  (never instrumented — a stale name *or* a class its wrapper walk never
  reached). `4ecdb3f`.
- **Blindness lines** on `creaturecheck`, `driftcheck`, `imagestats`,
  `reachcheck`. And **`anycheck` was reporting `0 any across 0 files`** — a
  scanner that walked nothing, which is what "zero `any`" was resting on. It now
  prints `0 in 0 of 534 files scanned`. `41eed1d`, `f176f07`.
- **`MapScreen` and the six unphotographed `menu_*` screens** — capturing them
  found that **`.menu-scrim`'s `backdrop-filter: blur(26px)` has never
  rendered**: it computes correctly and produces nothing, because it samples its
  own compositing layer's backdrop and inside `#menus` that is empty. Six arms
  tested; only re-homing into `uiRoot` works, at 0.51 MB against 3.08 MB for
  `position:fixed`, `will-change`, `translateZ(0)` and promoting `#menus`.
  Gradient re-tuned `.74/.93 → .52/.72` against the now-live `brightness(.54)`.
  `884e8c8`, `256fe06`, `64b54c8`.

**Closed as already-done, four rows this document had stale:** the `VOID` column
exists in `check.mts` (`VOID = 3`, `BUSY = 4`, excluded from `failed`, own
summary line); the family-level rocks ratchet exists *and* is wired as `silrocks`
at `--seeds 24 --reseeds 5`, with per-family minima over five resamples — a
correctly lower floor than this plan's single-sample numbers; `window.GAME` is
already `Game` and `browser.d.ts`'s wildcard already closed by a tsconfig path
mapping; the 13 floating landmarks are already re-seated, `poiFloating` 0 against
the pinned 0, instance floats 362 → 355.

## WS-10 — Creatures

- **Anak needs a sculpt rebuild, not more paint.** 2,770 tris and the only
  species with **no `colorAt` anywhere** — built from `GeoKit` primitives with
  one flat `tint()` per part, which is why it is a single sheet of cream. Legs
  end in round brown balls rather than hooves, the tail is a flat card sticking
  out sideways, the shoulder/neck join is a visible box. Port it to
  `CBuilder`/`sweep` the way `Sabertusk.ts` is built.
- **A dozen of Titan's `fissure()` wedges float free above the terrain**, in arcs
  around and in front of the hands.
- **`Enemy.reset()` does not clear `analysed`, `_waited`, `status` or
  `airborne`**, so a pooled instance inherits them. Recorded by the no-`any`
  lane, never changed.
- The five quadruped sculpts still carry their own two-scratch-register
  `mix`/`blend` helpers rather than `Palette.mixc`, which exists precisely
  because two registers cannot survive a nested blend (`LANDMINES.md`).

### `Enemy.level` is decoration, and the danger gradient is cosmetic

From WS-2's fight-shape lane, 2026-08-27, measured with
`src/tools/probes/fightshape.mts`. **The largest single reason a field
encounter here lasts 5.8 seconds and costs 0.8% of Noctis' HP**, and it needs
two owners at once, which is why it is a queue item rather than a commit.

`EnemyBase` reads `level` for `defense`, `magicDefense`, the EXP bucket and the
nameplate. **Nothing scales HP or damage by it.** A `level: 7` sabertusk
(`SpawnTables.ts:160`) and a level 45 one are byte-identical animals, so
`WildTerritories.ts:102`'s promise — *"a coeurl in Leide is a level 22 coeurl
and the same coeurl in Cleigne is a level 45 coeurl, which is how the danger
gradient survives being procedural"* — moves the number over the creature's head
and nothing else.

The curve is already in the bestiary and fits its own table: Anak (lv 9, 900 hp,
60 damage) through Red Giant (lv 50, 22 000 hp, 520 damage) is **×1.085 per
level for HP, ×1.058 for damage**. At a species' own listed level the factor is
exactly 1, so the corpus and every gate are untouched by construction.

It was **built and reverted** because it cannot live inside
`src/characters/enemies/**` alone. Two writers outside it defeat every version:

- `src/characters/Enemies.ts:171` — `if (o.hp) { e.maxHp = o.hp; e.hp = o.hp; }`
  overwrites a constructor-computed value on the **fresh-spawn** path while the
  pooled path goes through `reset()`. The first pack of each species would
  behave differently from every later one.
- `src/game/encounters/EncounterDirector.ts:438` —
  `e.maxHp = Math.round(e.maxHp * 3.2)` is a read-modify-write, so a read-time
  scaling is applied twice to every hunt mark.

The clean shape: `Enemies.spawn` hands the level to the constructor and
`reset()` and stops assigning raw `hp`/`damage` afterwards.

**Half of it is worse than none.** The dens a player of this demo actually meets
are **level 3-5** while Noctis is **level 27** (`Game.ts:224` boots
`startLevel: 27`; `WildTerritories.ts:246` takes the zone band, `[1, 8]` by
default), and `RpgSystem.enemyScaling` — documented *"given the party's level"*
— is `nightScaling(hour, isDaemon)` and has never read a party level. Applying
the curve without moving the bands makes the measured fights *weaker*. Both
halves, or neither. `project/handoff/ws2-fight-shape.md` carries the frames.

---

## WS-12 — The boot diet, 2026-08-28, from the close-out plan

`2026-08-28-opus-close-out` closed eight of its ten items and handed these two
back, because they are builds rather than fixes and it is the close-out plan's
own rule that open work returns to a queue rather than dying in a handoff.

**Cold boot is 6.54 s** (`bootprof --dirty`, quiet, this tree), of which
`Game.init()` is 6.36 s. Where it goes:

    1216 ms  Vegetation   (trees.build 538, prime.bushes 450, bushes.build 132,
                           prime.grass 119, prime.trees 43, grass.build 18)
     930 ms  Props        (poiPrebuild 392, mega 330, rocks 86, landmarks 47)
    1710 ms  postfx+compile+warmup, +181 shader programs
     388 ms  Water · 349 Npcs · 311 Director · 303 Sky · 300 Terrain

The boot matters at 188 cold boots per suite cycle, and it is `TODO.md` line 1.

### WS-12a — cache the generated content (~1.5 s of the 6.5 s)

`trees.build` 538 ms, `Props.poiPrebuild` 392 ms, `Props.mega` 330 ms,
`bushes.build` 132 ms, `Props.rocks` 86 ms are pure functions of source plus a
fixed seed. `src/tools/bake.mts` already does exactly this for the height field
— generator-source content hash, `src/public/baked/`, browser inflates or falls
back to generating in place — so the pattern is established and the work is a
geometry codec plus a second bake entry, not a new idea.

**The one that is not simply CPU:** `Trees.build` takes the renderer and draws
its impostor atlases on the GPU. Those are rendered art and would need baking as
images with the image baselines re-checked, so stage it last or leave it.

**Do not confuse this with deleting the prime.** That was tried on 2026-08-28
and reverted: it is 610 ms, it looks certainly redundant under `?shoot`, and it
moves `hero_full` by 13.359/255 against a floor of 2.25. See `LANDMINES.md`.

#### WS-12a result, 2026-08-28 (`geometry-bake` lane) — **DONE for the three; trees left**

`src/engine/GeoBake.ts`, `node src/tools/texbake.mts --geo`, and the full
account in `docs/plans/2026-08-25-opus-after-phase3.md` §WS-3 and
`project/handoff/geometry-bake.md`. `Water.shore` 465.5 -> **0.7 ms**,
`Props.mega` 454.8 -> **9.0 ms**, `Props.poiPrebuild` 423.1 -> **38.2 ms**, and
**cold boot 7.13 s -> 5.78 s** on a quiet tree, for a 35.5 MB artifact whose
fetch measures **0 ms** because it starts at module evaluation and is not
awaited until immediately before the shoreline.

Verified by `probes/geoverify.mts` — the cache against the generators, one page,
one instant, **145 parts, 4 624 052 vertices, byte for byte identical** — and by
a full-corpus cold diff at **142 of 142 under floor**.

`trees.build` was left, as this section said to: it draws impostor atlases on
the GPU and would need baking as *images* with the image baselines re-checked.
`bushes.build` (120 ms) and `Props.rocks` (78 ms) were not attempted —
`Rocks` is a tile streamer with no `PartBuilder` and needs a different shape of
entry.

**And the memory line is understated.** The eight prebuilt POI compounds are
**119.7 MB over 3.70 M vertices** (`probes/geofootprint.mts`) against the
82.3 MB `boot-memory.md` records for the whole page, and two town POIs are 2.6 M
of the 3.7 M. Directly relevant to `TODO.md` line 2, which still has no lane.

### WS-12b — material consolidation (was the 100x map's #12)

`probes/drawwhere.mts` on `town_forecourt`: 496 draw calls but **5 231 106
triangles**, a third of it skinned character mesh at ~29k triangles per draw with
no LOD, across **288 distinct object/material buckets**, and 152 calls drawing
under 60 triangles each. The bucket count is the likely source of the 181 shader
programs, and of `Trying to use 16 texture units while this GPU supports only
16`, logged dozens of times a frame.

One fix pays boot, frame and texture-unit exhaustion. 127 material construction
sites. It moves pixels, so it needs both perf gates re-certified and a corpus
image diff at the 1.5/255 floor.

**Not a cost today** and that is why it is here rather than urgent: the game is
mean 208 fps against a 60 fps target. This is bought for boot and for headroom.

**Character LOD is folded in here**, not run as its own line: the 5.2 M triangles
are real and latent, and splitting them from the bucket work would mean touching
the same 127 sites twice.

#### WS-12b result, 2026-08-28 (`materials` lane) — **programs DONE; character LOD NOT started, and no longer coupled**

**271 shader programs -> 126** and `postfx+compile+warmup` **1776 ms -> 989 ms**
(mean of three loads each), cold boot wall 8.15 -> 7.20 s. Full account in
`docs/plans/2026-08-25-opus-after-phase3.md` §WS-2 and
`project/handoff/materials.md`.

**The premise of this section is false and that is worth more than the fix.**
The bucket count is not the source of the programs. Not one of the 132 material
construction sites was touched; the keys they write are honest. What multiplied
the set was `renderer.compile()` building programs no frame binds — once because
`Game.init()` compiles before `MaterialPatch.scan` has run (60 programs), and
once because it compiles with **no render target bound**, which flips both
`outputColorSpace` and `toneMapping` in three's cache key while every scene
pixel in this game goes through `EffectComposer` (85 programs).
`probes/progused.mts` hooks `gl.useProgram`: of 134 programs a twelve-shot
spread ever binds, **one** is canvas flavour, and it is the composer's own
final pass.

**Character LOD is untouched, and the reason to fold it in has gone.** It was
folded in because splitting it would mean touching the same 127 sites twice.
Nothing touched them once, so that argument is spent and this is now a clean
separate lane. The number, re-measured today (`probes/drawwhere.mts`,
`town_forecourt`): **465 calls, 5 327 248 triangles, 272 buckets, 121 draws
under 60 triangles**, and one bucket — `SkinnedMesh` / `ShaderMaterial` —
is **60 calls and 1 736 436 triangles, 28 940 per draw, a third of the frame
with no LOD**. Frame cost 6.0-7.2 ms against a 16.7 ms budget, so it is
headroom, not a cost.

**Also untouched: the 16/16 texture-unit warning**, still logged dozens of times
a frame. It was not on the path of either fix.

## WS-13 — What the 2026-08-28 wave handed back

Five lanes closed on 08-28. **This section exists because their open work would
otherwise have died in a handoff**, which is the failure this whole plan was
written to stop. Each item names the lane that measured it and stopped at a
directory boundary it did not own.

### Ground and vegetation (from `ground-light`, `water-content`, `landmarks`)

- **The "Leide is bare" hole is 4–30 m features, and nothing occupies that
  band.** Tier-D's ceiling is priced: `?post=drymax` buys `zone_longwythe`
  29.0 → 40.4 of 49.0, but lands d1 **16.4** / d2 **23.3** against a reference of
  11.3 / 15.5 while d8–d32 stay flat. **Turning the dry cover up makes the ground
  noisier and does not close the gap.** Something has to *be* there at 4–30 m.
- **Galdin Quay is not a beach and the water lane cannot make it one.** 698 of
  6 280 shore points have a run-out gentler than 4 m. It needs a **`Field.ts`
  sand shelf plus `Ecology` grass suppression** — the land behind a now-correct
  foam lace is grass to the waterline.
- **`zone_mencemoor` renders as a bare corrugated massif that nobody owns.**
- **WS-2d was never reached.** It was gated on 2c, and 2c turned out to be
  already landed — so the gate is lifted and the item is simply untouched.
  Occluding indirect diffuse in-material is still open, and `?post=gcmax` (5.634
  mean/255 on `zone_vannath`) still bounds it.

### The map and the two dry pins (from `water-content`)

- **`Chart.ts` uses one global sea level, so the world map draws no blue under
  the four tarns** that now have water. Same bug class as the survey predicate
  that hid them, and it **costs a chart re-bake**.
- **`PoiKits` still builds a jetty at the two genuinely dry pins.** They are
  drawn dead on the map now, but the jetty is still in the world.

### Landmarks and props (from `landmarks`)

- **Seven kits still build from bare `BoxGeometry`** — `_imperial`, `_tomb`,
  `_landmark`, `_dungeon`, `_chocobo`, `_menace`, `_haven`. **The tomb first:**
  it is a 40-px grey box and its own docstring says it *"most has to read from a
  kilometre away"*. `_block` and `_hut` are the templates.
- **`_haven`'s own shelf** is what reads as a cake stand at `poi_haven`;
  `gradePad` already replaced the drum, so that half of the plan's claim is
  stale.
- **`_genOutcrop` is ungraded** and needs the plan/seat split `_genTor` got.
- **One unexplained levitating boulder in `poi_imperial`**, pixel-identical
  across all three joint fixes, so it is a **fourth mechanism** and not the
  un-sunk-plan bug.
- **The Meteor is a good landmark and not yet a beautiful one** — one dark
  monolith rather than a cluster of angular peaks, low in chroma against a bright
  sky. The untried lever: normalise the rock generator's vertex-colour bake to
  mean 1.0 and turn `vertexColors` on for `M.stone`. Touches a shared generator;
  needs its own before/after.

### Content and water (from `water-content`)

- **Energy deposits are invisible** and **Fociaugh's cave mouth sits on a 1.26
  bank** — both outside that lane's four directories, both still open from WS-7.
- **The rivers are the weakest thing in the water lane's own estimate.** Width
  went 3.49 → 5.17 m mean and the p50 reach **still reads as a damp streak**;
  the change is landed but unverified and the lane says it would take an argument
  to revert. There is also a **p99 hard edge**.

### Memory — `TODO.md` line 2, still unstaffed (from `geometry-bake`)

- **The eight prebuilt POI compounds are 119.7 MB over 3.70 M vertices**, against
  the **82.3 MB for the whole page** that `boot-memory.md` records. `lestallum`
  (1.34 M) and `galdin_quay` (1.28 M) are 2.6 M of the 3.7 M on their own.
  **Nobody has ever looked at a 1.3 M-vertex town.** The geometry bake does not
  fix this — it caches the build, it does not shrink the result.
- The instrument is `_probe/gcwatch.mts` (CDP `Runtime.getHeapUsage`);
  **`performance.memory` is frozen in this headless build**, which is why
  `probes/perfgc.mts` could not answer. Chromium RSS is also recorded per lease in
  the daemon's ledger — a free time series nobody has read for this question.

### The face (from `head`, passes 3–5)

- **The `Exposure` meter is routed to `sky-clouds`** and is not a character item:
  a +33% eye-adaptation excursion driven by the subject's own black jacket, worth
  most of the corpus's median-luma gap (100.2 against FFXV's 70.2).
- Everything else is in `project/handoff/head.md`, which is still live.

## Negatives worth not re-opening

Collected because each one cost a lane real time and none is discoverable
without opening the handoff it lived in.

| claim | verdict |
|---|---|
| **WS-6: the 84-116 ms `sprint+turn` frame is buffer uploads for geometry `Warmup` built but never drew** | **no.** `probes/perfupload.mts` snapshots every geometry uuid the renderer has uploaded and lists what first renders each frame: both spike frames report `fresh 0, freshKb 0` — not one geometry rendering for the first time — while the frame that really does upload **497 KB** of fresh Menace-POI geometry costs **6.4 ms**. The 64x64-target / Metal-PSO-by-attachment-format reasoning was also unnecessary: the thing being built is a **WebGL program**, and three's program key does not carry the attachment format, only whether a target was bound at all |
| **WS-6: the 84-116 ms `sprint+turn` frame is shadow-cascade work for hundreds of new casters** | **no.** `probes/perfstall.mts` times `renderer.shadowMap.render` and splits every `renderBufferDirect` into shadow and colour. On the 86 ms frame the shadow pass is **0.3-0.6 ms**, with the same **99 shadow draws and 1.48 Mtris** the median frame on that cascade phase carries; the all-three-cascade phase (292 draws, 4.4 Mtris) has a median frame of **5.4 ms**. It is one draw call linking one program — see WS-6 |
| **`perfsprint.mts` reporting "zero new programs" on the stall frames means no program was linked** | **it means the opposite of what it says.** The probe compares programs by `name + '|' + cacheKey.length` STRINGS and reports `added = now.filter(p => !prev.includes(p))`, so a program whose key-string is already in the list reads as no program at all. `renderer.info.programs.length` grows by exactly one across both spike frames. Two rounds of WS-6 were spent looking past a link because of it |
| **`tf_stoch`'s three taps are a fragment cost worth gating to `vTDist < 400 m`** (`splat.md`'s highest-priority item) | **they cost nothing measurable.** `?post=nostoch` cuts the Heitz-Neyret sampler to one tap; `perf.mts` over six ground-dominant shots, both sides `RULER_VALID: true`, moves **0 of 6 shots by more than the 0.93 ms floor** — mean 239.0 fps against 239.5, with the sign inconsistent shot to shot. Not a null ablation: it moves `zone_longwythe` **1.14 mean/255, max 196, over 14.8% of pixels**. Do not build the fallback |
| **The page is at 16/16 texture units** (used to close PCSS, and carried as an open defect through three plans) | **it is at 15 fragment, 4 vertex, 17 of a combined 32, and the program links.** `probes/texunits.mts` names the culprit — it is the terrain material on every clipmap ring — and then reads the linked program's active samplers back by stage: `uHeightTex`/`uFarHeightTex` are vertex-only displacement taps, `uNormalTex`/`uFarNormalTex` are both. three's `allocateTextureUnit` warns when its running total of allocated units reaches `capabilities.maxTextures`, which is `MAX_TEXTURE_IMAGE_UNITS` (the **fragment** limit, 16) — not `MAX_COMBINED_TEXTURE_IMAGE_UNITS`, which is **32**. Nothing is starved, `LINK_STATUS` is true, and there is a fragment unit free. PCSS is still closed on its other clause (the depth read `sampler2DShadow` cannot do), but not on this one |
| Widen the eye-socket brushes | changed the rendered frame by **nothing**, twice; cost a lane most of a session |
| A world-metre contact ramp for grounding | sub-pixel at judged range; its own positive control moved 2.600/255 with the crop *visually identical* |
| TAA's clamp is why leaf edges alias | measured false — TAA reaches them and softens them, it is just not enough |
| `compileAsync` for shader warm | **3% slower** here, six pairs |
| **WS-11: the arm whips beside a boulder, so it is `CameraRig._armDistance`'s sphere sweep, not the framing** | **the sweep is innocent.** `probes/armwhip.mts` records the lens's own kinematics in a real den fight, decomposed into focus translation / arm length / orbit: **zero frames at the `minDistance` clamp** in the fight and in the walking control, and **14.45 of the 14.86 m/s p95 lens speed is the ORBIT term**. It is the combat **framing block**, which steered `yawTarget` at the bearing from the *player* — the one unstable quantity in a melee, a sabertusk two metres away swings it 90 degrees in a third of a second while barely moving on screen — with no deadzone and no rate limit, while `restDistance = targetDistance + flat * 0.22` ran the arm out to 7.9 m so every degree of it was 40% more lens travel. Rewritten: `e218f5b`. The **boulder** is a separate defect and is still open — see below |
| **WS-11: the boulder in the near corner is the camera having no prop collision** | **built, measured at 0.00%, reverted (`90aeb6a` / `93f900b`).** `probes/rockcam.mts` walks 9 240 frames of sprinting across Longwythe with the camera turning at 0.3 rad/s and asks whether a stone crosses the segment from the lens to the player: **zero, before and after** the sweep, and zero lens-inside-stone. It cost 2.14% -> 3.55% of frames a shortened arm for that. A **sphere** version of the same test says 1.24% and is wrong in the way that matters — a median-axis radius makes a ten-metre tor a ten-metre ball, so a player standing three metres from one reads as inside it — and it is also what broke the first sweep, which cleared 2 of the 107 frames it flagged. **The boulder in `tmp/shots/cb1/f-engage.jpg` is beside the lens, not between it and the player**, so no arm length removes it: shortening the arm moves the camera *toward* the player. Re-opening it means measuring the screen area a prop within a few metres of the lens covers, and the fix for that is a lateral dodge or a soft fade |
| **WS-11: `PartyAI.ROLES`' motion values are the knob for "Noctis does 14% of the damage in his own fight"** | **they are not.** `probes/dpsshare.mts` runs every attacker's real blow through `rpg.damage` with that attacker's own stats and cadence: at **full uptime Noctis already has 64%** of the party's output (781 dps to gladio 203, ignis 131, prompto 112). The entire gap is **uptime**, which `ROLES` cannot reach — and most of the measured 14% was the probe, whose melee policy stood at `t.radius + 3.4` (4.4 m for a sabertusk) with a 2.05 m blade and swung at air; one round went **0% -> 27%** on that line alone. What was left was a missing **attack step-in** and a flat warp-strike multiplier. `ea87e16`, `77e5c51` |
| Raising a cost cap in the ground layer | no budget bug exists there; the limit is `Ecology.scrubDensity` at 0.09–0.34, which is authored ecology |
| `GrassField`'s 155 m outer ring is a fictional budget constant | it is justified on quality and the justification is good |
| The Meteor's flat facets are a texture problem | it has real maps, triplanar UVs and the vertex-colour trap handled; it is the cleave-plane shading |
| Turning CAS's constant down | its benefit is in the same octave as its cost; the lever must be spatial |
| PCSS blocker search on our shadow path | needs a depth read `sampler2DShadow` cannot do, and the page is already at 16/16 texture units |
| The ambient probe is the shadow-warmth gap | the **whole** diffuse ambient is worth 2.6 of 15 points |
| **Ground albedo is the shadow-warmth gap** (WS-2a, the re-filing above) | **it is not, and now it has a positive control.** `?post=gwhite` moves the median 48 levels, so the lever reaches; then `gwarm`+`vwarm` — every ground *and* plant pixel pushed 35% red / −38% blue at constant luma, far past shippable — buys **5.2 of the 13.2 levels needed** and takes `sat%` to **38.6** against a 29.5 reference. The reference's own per-plate spread on the column is 50 levels around a 15-level difference of medians, and the darkest quartile, painted and looked at, is half canopy. `handoff/ground-light.md` |
| The six `RECIPES` in `Layers.ts` have mean lumas spanning only 0.35–0.47 | **that is `LAYER_AVG`, not the recipes.** The recipes' real mean *linear* lumas run **0.091–0.361, a 3.98× spread**. `LAYER_AVG` was their sRGB numbers used as linear light and was painting the far LOD 2.2–4.0× too bright; fixed at `14c49f3`. Nothing is wrong with the recipes' value contrast |
| WS-2c's fraction-of-object contact ramp "has never rendered" | **`207a399` is an ancestor of `main`** and the ramp has been live since 2026-08-23. Ablated: `?post=nogcontact` moves `zone_vannath` **4.228 mean/255 over 11.9%** of pixels against a 2.00 floor, with `gcmax` at 5.634 — the shipped term is at 75% of its own ceiling, and an order of magnitude past the metre-scale version's 0.438/0.059% |
| Tier-D dry cover can close the `reliefstat` gap if its reach is widened | **only a fifth of the way, and into the wrong bands.** `?post=drymax` prices full cover on `zone_longwythe` at tot 29.0 → **40.4** against a reference of 49.0 — but it lands as d1 **16.4** and d2 **23.3** where the reference is 11.3 and 15.5 (we would be 45–50% *over*), while d8/d16/d32 stay at 12.2/11.3/11.2 against 18.4/21.2/21.8. The hole is 4–30 m features and the term's octaves are 0.74 m and 1.9 m |
| Skipping `Vegetation`'s origin prime under `?shoot`, since `converge()` re-streams at the shot camera | 610 ms and **wrong**: `hero_full` moves **13.359/255** against a 2.25 floor. Sixty budgeted `update()` calls are not the same resident set as "stream until finished" |
| `combatloop` and `integration` can take warm leases once the viewport matches | `integration` needs `audio=force` in the query and no pooled page has it; `combatloop` matching the pool key costs **+28 s (42 -> 70)** to save a 7.5 s boot |
| Chromium's disk cache can hold the 181 shader programs | `gl` and `metal` both compile +181 on a warm load; the cost is ANGLE's in-process translation, which no disk cache stores |
| Skipping the shader warm-up is worth its 1.71 s line | **0.53 s**: `warm=off` boots 6.01 s against 6.54 s, because `postfx+compile` pays for it either way |
| `--hide` renders less streamed content than its control, so an `--hide` delta is not a cost | **wrong for two months.** It was one frame of shadow-cascade phase: `resetClock()` lands every pose on frame 8, where all three cascades and the cloud shadow are due, and the hide pass stepped one frame further. A 4-mesh waymark reads **5 draws**, not −301 |
| "zero `any`" | rested on `anycheck` reporting `0 across 0 files` — a scanner that walked nothing. It walks 534 files now, and the answer happens to still be zero |
| `.menu-scrim`'s `backdrop-filter: blur(26px)` | **had never rendered.** It computes correctly and produces nothing: it samples its own compositing layer's backdrop, and inside `#menus` that is empty. Only re-homing into `uiRoot` fixes it — `position:fixed`, `will-change`, `translateZ(0)` and promoting `#menus` all cost 6× the memory and still do not work |
| Sharpening the mouth line (blur 1.8 → 0.5), and darkening it further | moved the rendered mouth **0.5 of 255** each. `head-r3` §7's own next action, and it is nothing |
| **WS-1: `SKIN_BASE` 0.88 → 0.55 is the fix for the blown face** | **no — the albedo is right and the meter is wrong.** `look.skin` × 0.88 is linear (0.351, 0.199, 0.122), a published skin reflectance, and at the *Sky's own* scene exposure (0.9789) the chin window carries **115 of 255** and does not clip. What clips it is a **+33% eye-adaptation excursion above that base**, driven by the subject's own black jacket inside `Exposure`'s centre-weighted meter: hide the party and re-meter the identical pose and `hero_portrait` goes 1.3037 → **0.8711** (`hero_profile` −19.2%, `hero_full` −14.5%). Cutting `SKIN_BASE` would make every character's skin wrong in every frame where the meter behaves. **The fix is one file in `src/engine/postfx/Exposure.ts`** — a metering statistic a large dark subject cannot dominate, or a `rangeHi` under today's 1.9. `probes/faceclip.mts`, `probes/faceexp.mts` |
| **WS-1: the head is pitched down in the settled pose** (`Shots.ts`, `head-r3`, two handoffs) | **−5.5°.** `probes/headaim.mts` reads the posed skeleton: the head bone's +Z sits at −5.5° and the `hero_portrait` camera at **+2.0°**, so the face-to-camera angle is **15.1°** — a relaxed head in a near-frontal portrait. `spine03` carries −10.8° of world pitch and the neck gives 6.4° back, exactly as `evalIdle` claims. Whatever makes that frame a foreshortened wedge, it is not eight degrees of neck |
| **WS-1: the hard vertical line down the face's midline is the fringe's cast shadow** | present with the **hair hidden**, on every hero, in every framing. Pass 5 then killed six more candidates by capture — the **hour** (9/12/14.5/16.2), the **painted map** (`probes/facefront_flat.mts`; `probes/facemapscan.mts` shows the texels smooth across u = 0.485..0.515 at every row), the **pore normal map**, the **mip chain and anisotropy**, the shell's **normals** (negated, and replaced with a radial field), and the character's **own shadow** — and then found it: it was the inside of the occiput's crown line, because the shell was wound inside out. Gone in `d866db7` |
| **WS-1: the painted mouth is eaten by mip selection / by a surface drawn over the face / by `patchSkin` mangling the uv** | all three closed. The map ships at `anisotropy = 16` on a hand-built 11-level chain and at 0.55 m the face is *magnified*; `<name>_shadow` carries `colorWrite = false`; and `fract(vMapUv * 8.0)` written straight to `gl_FragColor` comes out even and symmetric over the whole mid-face. `probes/faceuvshade.mts`, `probes/facebar.mts`, `probes/faceattr.mts` |
| **WS-1: what is left is the projection — `uvOf`'s `atan2(x, z)` collapses into a radial fan at the menton and the mouth sits inside it** (pass 4's closing hypothesis) | **retired.** The fan is real but it is *below* the chin, `v` is linear in `y` and registers at the mouth's own latitude, and the mouth's absence had nothing to do with it. **The skull grid was wound inside out** — `(b-a) x (c-a) = -z_hat` for every quad in `buildHead` — and the face material is `FrontSide`, so the near surface was culled on every frame this repo has ever captured and what drew was the **inside of the far side of the skull**. That is, literally, *"an egg with two eyes stuck in it"*, *"no mouth on the mouth's location"*, *"the chin projects further forward than the nose"*, and *why the profile always read and the front never did*. `probes/facewind.mts`: **0.0%** of the head's 1 155 front-most triangles had a `+z` geometric normal before, **100.0%** after; the max-z vertex, the nose tip at `uv = (0.500, 0.372)`, carried `n = (0.01, 0.35, -0.94)`. `facecheck` `mouthRange` went 2.9 -> **101.3** (noctis), -18.9 -> **189.0** (prompto) against a limit of 14. `d866db7` |
| **WS-1: `noseLeadMm` 26-27 mm proves the nose is long enough** | the number is right and it is the wrong number. Pronasale minus subnasale **on the midline** is 20.5 mm against Farkas' 21; the defect was *lateral*. `probes/facesect.mts` prints the surface as a section and at pronasale height the tip stood **4.5 mm** in front of the surface 8 mm out and **16.7** in front of the cheek at 40, where a head does 35-45 — the section at *eye* level fell away faster than the one at the nose. Two causes: `FACE_FLAT = 1.30` applied at every height (it was derived at the upper-lip line and buys +10.6 mm of cheek at the nose line; now ramped off above the mouth), and dorsum brushes with `r_x` of 17.5 / 16.5 mm, a 34 mm bridge. `7b2d4ce` |
| **WS-1: Gladiolus' beard needs coverage per strand — `width` 0.9 -> 1.5 mm buys 1.7x for zero vertices** (pass 4) | **negative, and the second one on this defect.** Applied and captured: 1 068 roots at 1.5 mm read as **black birds** on his jaw, because a wider strand is a more legible *object*, not a denser mass; `facecheck`'s control patch moved 221.3 -> 213.9 of 255. Pass 3's doubling of the root count is the first. Neither count nor size is the lever — **contrast against the beard shadow `paintFace` already draws there** is. `3523898` |
| **WS-1: the cranium is too large and too tall — "roughly a 1:1 split at the brow line, and this reads closer to 1.6:1"** (round 15's #1) | **the proportions are right; the surface is featureless.** `headprop.mts` on the shipped head: nasion 0.480 from the vertex against Farkas' 0.477, eye 0.519 against 0.520, subnasale 0.692 against 0.688, stomion 0.787 against 0.782, ear length 0.270 against 0.269 — every vertical landmark inside 0.005 — and the half-width profile inside 0.01 of an adult male's from the cheekbone down. A *lateral* taper on the vault fitted to the four samples that are out (0.529/0.771/0.869/0.935 against 0.40/0.64/0.80/0.91) lands all four inside 0.04 and makes the head a **bullet**: narrowing the top of a tall dome only sharpens it, which is pass 5's sagittal fix walking back in through the lateral axis. Both the arithmetic and the picture are in `profileW`'s neighbourhood in `Face.ts` so nobody re-derives it. What worked was **relief, not radius** — zygomatic arch, temporal fossa, temporal line, parietal eminence, frontal eminences — plus `occiputDepth`, because `cephalicIndex` 72.9 against 79 and `ear.zFromFront` 0.563 against 0.50 are two honest statements that there is too much skull behind the ear. `5ff2cbc` |
| **WS-1: the hard-edged black stripes across the face on `hero_portrait` are the fringe's cast shadow** (pass 5's parting item, round 15's #5) | **no, and neither is anything else in the post chain.** Ablated in order, all negative: the hair mesh (`--hide Noctis_hair`), the hair's own `castShadow`, the merged shadow proxy (`--hide Noctis_shadow`), GTAO, `ContactShadowPass`, CAS, auto-exposure, DOF — and **`paintFace`'s entire occlusion stack multiplied by zero**, which leaves the frame visibly identical; the face map dumped straight off `faceMat.map` has nothing in that position. The one thing that moves it is the eye-socket brush's y-radius: narrow it and the groove moves and sharpens. It is the **socket crater's inferior wall**, a -30 mm brush with a 24 mm y-radius whose falloff lands in the middle of the cheek. -21.2 mm plus an infraorbital plane between the orbital rim and the malar. `11fbf18` |
| **WS-1: the hard horizontal tone band across the forehead/crown is a seam — the scalp shell, the hairline, or a mip/tiling artifact** (round 15's #2) | **it is a `fillRect`'s top edge.** `paintFace`'s fringe-shadow gradient started at full `fringeShadow` (0.55, multiply) on its *first* stop and the rect began there, so the map stepped from untouched skin to 45%-darkened skin across one texel at canonical y = 0.078 — which on a sphere of radius 0.113 foreshortens to a band right across the top of the dome in front view and an arc over the crown in profile. Ramp in as well as out. `c2a23d7` |
| **WS-1: the "scaly, hatched texture on the dome" is the mip chain or the tiling** (round 15's #2, second half) | **it is one octave's weight.** The pore map is three octaves at 1.6 / 0.7 / 0.6 mm weighted 0.5 / 0.3 / 0.22, i.e. most of its energy in the coarsest — and at the 0.55 m range `LANDMINES.md` requires face work to be judged at, the head is 3.1 px/mm, so that octave is a five-pixel bump over every square millimetre of skin. Real skin has almost nothing at 1.6 mm. 0.26 / 0.36 / 0.34 at the same total and the same amplitude. `c2a23d7` |
| **WS-1: the ear is a flat scoop standing off the head** (open since round 3; `WIP` `10d8c42`, `6397de1`) | **closed, and it was the plate, not the ridges.** 8.0 mm of *half*-thickness on an ear whose whole cartilage is 3-4 mm, 55 x 38 mm against a real 60 x 32, near-vertical where an auricle leans back 15-20 degrees, with a 31 x 20 mm concha bored through it and painted 0x8e8078 — so in profile it read as a pale disc with a black hole in it, and no amount of helix/antihelix work helped because the object being detailed was the wrong object. 4.5 mm half-thick, 60 x 31, leaned 16 degrees, concha halved and lit rather than painted dark, and the plate re-seated 2.7 mm inside the skull (the old 0.006 offset would have left a 1.5 mm gap — the dark seam behind the right ear). `5ff2cbc` |
| **`facemark.mts` shows no magenta at the mouth, so the map is not sampled there** | **it drew nothing.** It stamps through `map.mipmaps[i].getContext('2d')` and the shipped chain's levels are ImageBitmaps, so every level failed the guard and the loop `continue`d — sixteen captures, 17 magenta pixels, none frontal. It counts and throws now; use `probes/facebar.mts`, which reaches mip 0 with `drawImage` |
| Face material `sheen` 0.17 → 0, `specularIntensity` 0.35 → 0.10 | moved **nothing** |
| The transverse section is why the profile is wrong | it is a real defect and it landed (18.6 → 7.2 mm), but `x` is untouched by construction: `noseLeadMm` moved **<0.1 mm**. Two separate bugs |
| The Nebulawood black patch is `GTAOPass`'s `overrideMaterial` discarding alpha-test | **no** — the blob is pixel-identical with the whole post chain off. It was NaN from the terrain surface shader reading roughness as a tangent normal's Z |
| `isnan()` / `isinf()` / `(x >= 0 \|\| x < 0)` can detect a NaN in a shader here | **all three are folded away by this backend's compiler.** Six sanitisers read as innocence on a frame with a visible hole in it. Test the bits with `floatBitsToUint` |
| A zero blend weight gates a poisoned term | `0.0 * NaN` is NaN |
| A NaN diagnostic can be flagged out through `totalEmissiveRadiance` | invisible on a NaN pixel — it cost the canopy lane its second attempt |
| **WS-5: the POI kits publish `_exclusions` and something downstream is not reading them at pad radius** | **the premise is false.** `PoiKits._exclusions` is a POI-versus-POI *placement* ban list (dungeon mouths at 130 m, `sameOnly`) and has never had a vegetation meaning; `Ecology.ts:192` already said so. What leaks is that `Ecology._layoutClearings` authors a clearing as a **linear cone** whose zero is the settlement's *catchment* radius, and grass is the only population with no hard reject — only a density multiply and a `d < 0.02` cut. 4 000 uniform samples per pad: every other population is rejected on **100%** of the pad, grass passes on **97–99%**, standing up to **0.57 m proud** of the kit's own top surface. Plus `FRAC` has ten keys against twelve POI types, so `tomb` (10) and `landmark` (23) — **33 of 123 POIs** — get no clearing at all (`cleared` = 0.000 at `tomb_just`). The fix is a plateau-plus-skirt in `Ecology.poiClear` and belongs to **`src/world/veg/`**; `PoiKits.PAD_R` now publishes the twelve pad radii for it |
| **WS-5: grass grows through the town plaza** | **false at HEAD.** `cleared > 0.06` rejects **100.0%** of samples on the Hammerhead deck and mean `grassDensity` there is **0.067** against 0.627 in open country; `town_forecourt` and `town_wide` show clean asphalt with a hard pad edge. Only the *POI aprons* leak. Galdin Quay and Lestallum are map pins with a `_town` kit, not plazas |
| **WS-5: the near half of `zone_longwythe` has no rock in it** | **it is the framing, not the field.** Neutralising the carriageway sweep and the POI pad *entirely* buys **5 instances and zero legible ones** — the count of stones ≥ 20 px does not move at all (4 either way). The camera stands **30 m from a 33.4 m tor and points 48° away from it**: twelve outcrop/tor knots sit within 400 m and every one is behind the camera or 48–80° off-axis against a 35.7° half-fov. Per hectare of *visible* ground the near band is the densest in the frame (7.4 drawn/ha against 3.1 mid and 1.2 far); it just subtends 1.7% of it. Dollying back 80 m along the view axis takes drawn instances 16 → 38 and median on-screen height **10.7 px → 73.0 px**. The change belongs in `Shots.ts`, which is the coordinator's. **Do not raise `rockD`** |
| **WS-5: the 124 POI aprons are still cake stands** | **half-stale.** `gradePad` already replaced the faceted drum with a real cut-and-fill earthwork. What reads as a cake stand at `poi_haven` is not the apron at all — it is `_haven`'s **own two-course shelf drum** with a hard circular rim, which is a different object in a different function |
| `driftcheck`'s 200 m probe rect covers the LOD morph band | it does not — level 0 reaches +/-144 m, so a **5 m** morph error moved not one number. Rect is 340 m now |
| **WS-4: TAA is not accumulating the cloud buffer, and fixing it supersamples the layer 8x for free** | **it already is.** `?post=nocloudjitter` holds the march's sub-texel offset at zero with TAA and the camera jitter untouched: the sky band moves **12.8-16.0 mean/255 over 31-37%** of it and the jitter-off frame renders cloud silhouettes as square-cornered blocks on the march's texel grid, small puffs as literal rectangles. The stated mechanism is also arithmetically impossible — the field scrolls **0.03 px per frame**, 35x below a pixel, and a posed capture holds the camera still. It is what makes sense of three of `clouds.md`'s own negatives at once |
| **The auto-exposure excursion is the meter's centre weighting** | **three percent of it.** Removing the centre weight outright moves `hero_portrait` **1.361 -> 1.327** and the corpus median **1.361 -> 1.344** against a 36% excursion. It is that a log-average is dominated by its darkest members: log2(0.056), a black coat, is -4.16 where log2(0.5), a sunlit hillside, is -1.0. Area times log-depth, reaching from anywhere in the frame. The fix is a Naka-Rushton weight `l / (l + key*0.63)` on each pixel's vote |
| **The corpus median luma gap is 100.2 against FFXV's 70.2** | **that is the comparison `imagestats`' own header warns against.** 70.15 is the median of the whole 53-plate corpus — midday plains, night VFX, menus and studio portraits together. Against the scene-matched `FFXV-field` our day slice read `meanL` 109.8 and `p50` **92.6 against 100.9**: we were *darker* than the reference where it counts. The meter was still wrong; this was not the reason |
| **`zone_mencemoor`'s bare massif is an aerial-perspective defect** | **the haze is on spec and the frame has no foreground.** The bottom of frame is 434 m from a camera at 286 m altitude, which at `clear`'s haze is a 10% blend — exactly §2's "300 m at 10%" — and 10% of a luma-209 inscatter on a black surface is the 17 levels of floor that `p0.1` 21.8 measures. Every pixel in the shot is sky or terrain at 400 m-plus, so its darkest quartile is hazed distance by construction |
| **`daycycle_dawn`'s magenta is the burial removing the blue that desaturated the sun tint** | **backwards.** B reads **143 in all of** base, `nocloudsun`, `nocloudamb` and `noambbury`, to the level, so the blue is the sky behind plus the `uCloudHaze` wash. What the ablations move is red — `noambbury` adds 22 levels of it at p90. The burial's cost at dawn is warmth |
| `clear`'s `haze` 0.00024 was only compensating for a converged colour a third too dark, so it can come down once the colour is right | **half true and not worth taking.** With the colour fixed, 0.00016 is better on all four colour columns and worse on all five range columns, and `hi230%`/`clip%`/`stops` at 0.00024 land within 0.19/0.06/1.11 of `FFXV-field` where the cut takes them to 2.09/0.17/1.88. Looked at on `zone_three_valleys`, the cut also brings the far mountain forward to the near ridge's value. The 6x raise is carrying the frame's depth separation as well |
| `tourSettle` 40 -> 20 in `driftcheck` | 4 s of 36, bought by halving the LOD rings' settle time. Not taken |
| **WS-3.3: the near ring's leaf cards are chunky because of the alpha map's own texel resolution** | **the near ring never magnifies.** `probes/leaftexel.mts` measures texels per screen pixel per triangle from the geometry's own UVs — a bounding box reads a 6x minification as a 2x magnification, because a crown mesh is dozens of cards each carrying the whole 0..1 UV square. On `zone_fallgrove` the nearest instance of every near-ring kind is **minified 6.7x to 38.6x** (`tree_duscae_0_leaf` 38.7 m / 6.69, `tree_duscae_1_leaf` 55.4 m / 8.35, `scrub_fern` 44.5 m / 38.58). The 256 px canvas already holds six to thirty-nine times the detail the frame can carry; raising it buys nothing. Looked at, too: a near crown at 8x today is **soft, not chunky** — the "hard binary staircase" is not in that part of the frame any more. `46c72a1` |
| **WS-3.3: `alphaRef` is the wrong reference for the coverage-preserving mip chain now that the cutoff is straddled** | **no, and the near ring is not where to ask.** The previous lane's argument stands — a ramp *centred* on `alphaRef` integrates to the same 50% crossing that `buildAlphaMips`' hard `count(a >= alphaRef)` measures, where three's one-sided ramp biased it low. And the measurement says the question is misaddressed: the band where the chain sits at **one texel per pixel** is the **impostor ring at 210-280 m** (`tree_duscae_1_impostor` 0.99, `tree_duscae_0_impostor` on `zone_nebulawood` 0.74), not the near ring at 6-39. That is the worst case for aliasing in the vegetation system — mip 0, no supersampling from minification — and it is exactly where the treeline `edgestat` scores sits |
| **WS-3.2: a depth mask can take CAS's foliage cost down to what `?post=nocas` shows** | **about a third of it, and the rest is not a depth phenomenon.** The mask lands treeline `edge%` 42.14 -> 38.96 where `nocas` is 27.93, and near-crown speckle 37.6 -> 26.1 where `nocas` is 7.1. What survives is CAS sharpening *within* a card: a distant tree is three impostor planes and a mid tree is crossed cards, so the leaf detail is in the alpha and albedo texture and the depth buffer sees one flat surface across it. A depth mask structurally cannot see texture aliasing. The part it does reach — the silhouette and the multi-card fringe — is the part the judge named. Landed at `95a34c0` |
| **WS-7: seven fishing pins have no water and it is a `Water.ts` / `WorldMap.ts` + re-bake job** | **Four of the six had water 6 m away.** `Fishing._survey` tested `terrain.heightAt(x,z) < water.level` — the *global* −6.5 m — after `Water` stopped having one global level: `_findTarns` and `Field._tarnBasins` had already given every inland pin its own body at +36.9 to +80.5 m. One predicate, no re-bake. 4 live holes -> **8**. `2b344e7` |
| **WS-8: the near-field foam's handles are the shore ribbon's `lace` threshold and the `brk` shore-break term** | **Neither can touch it.** Ablated at the third-gentlest beach on the map: hide `shoreRibbon` entirely, and separately set its `uFoam` to 0 — the white patch is unchanged both times. It is the **lake surface's** own depth-derived margin in `Water._makeMaterial`, where `uFoamBand` is 1.35 m of *depth* and therefore four-plus metres of *ground* on anything that shelves. `5531bd9` |
| The river bank reads as hovering plates because it still uses the clipmap-envelope lift `Shore.ts` rejected | **Removing the lift moved the ablation frame by nothing visible.** It is gone anyway — the shore's argument applies verbatim and it costs a `drawnEnvelope` probe per station — but the plates were the bank being **8.08 m mean, 13.0 max per side** against a 1.75 m water half-width, because `firstCrossing` never finds `bankH` on a valley floor and returns the whole of `MAX_BANK` |
| **WS-8: raising the half-width cap to `2.5 + 14 q` is what the rivers need** | Mean width 3.49 -> **5.17 m**, mean depth 0.39 -> 0.47, max width 20.0 -> **29.9**. The p50 reach (4.1 m) **still reads as a damp streak on a pasture** — that site is a pan with no incised channel — and at p99 the cap truncates the sheet over still-submerged ground into a hard polygonal cliff, which a wider cap makes worse. The levers that moved it were opacity (a 0.34 alpha floor) and the sky gain (1.15 -> 2.9). Landed, but **unverified as an improvement** |
| **WS-7: `setPiece` must be added to `Shots.ts` and `Game.applyShot`** | **Already there** under a different name: `ScenarioName` carries `setpiece_astral` / `setpiece_field`, `Director._setPieceScenario` routes them through the same `startSetPiece` the hunt runtime calls, and `setpiece_deadeye` is a live boss fight in the corpus today |
| Titan cannot be framed because the Disc of Cauthess fills the frame | **The camera never moved.** `boss_astral` is a `follow:` shot, so `applyShot` sets `CameraRig.followShot` and the rig re-derives pos/target every frame, silently overwriting `setShot`. Ten vantages at six azimuths came back **byte-identical** — a contact sheet of ten copies of one frame. Clear `rig.followShot` and the sweep works first try. He is legible at az 300°, r 95 m, +34 m, fov 46; the shot still does not go in because he renders as an **unlit black silhouette** and sits 3 m under `Terrain.heightAt`. `374f5c9` |
| **The 288 object/material buckets and the 132 material construction sites are the source of the 181 shader programs** (WS-2 and WS-12b's shared premise) | **no, and nothing in either list needed touching.** The keys this repo writes are honest: `VegMaterial.ts:520`'s eleven numbers and `rig/Materials.ts:430`'s eye `gloss` are GLSL *literals*, so those are genuinely different shaders. The multiplier was `renderer.compile()` building programs no frame ever binds — **60** because `Game.init()` compiles before `MaterialPatch.scan` has patched anything, and **85** because it compiles with no render target bound, which flips `outputColorSpace` *and* `toneMapping` in three's cache key while every scene pixel goes through `EffectComposer`. **271 -> 126 programs, `postfx+compile+warmup` 1776 -> 989 ms**, one wrapper in `engine/CompileGuard.ts` and one line of `Sky.ts`. `probes/progused.mts` |
| A shader-program inventory can be read one cache-key field at a time | **it cannot, and this is why WS-2 survived three plans.** Held constant on its own, `outputColorSpace` collapses **4** programs and `toneMapping` **1**. Held together — they are two readings of one condition, "was a render target bound" — they collapse **85 of 211**. `probes/progrt.mts` exists to hold a pair |
| three's program `cacheKey` can be parsed from the end, since its tail is fixed-length | **44 of 271 rows misparse into nonsense.** three's *default* `customProgramCacheKey` is `this.onBeforeCompile.toString()`, and a stringified function is full of commas. The misparse produces a confident phantom — "srgb splits every material, 103 against 124" — that survives being cross-tabbed. Anchor **forward** on the GLSL precision qualifier |
| The atmosphere patch's `customProgramCacheKey` is the program multiplier | **the coordinator's own static pass called this right**: the key it prepends is the constant `'atmo1|'` and `uActorHaze` is a uniform, so it splits nothing. But the patch *is* implicated, from the other side: 60 lit materials compiled **before** it reached them and each of those programs is dead the moment it does |


## Order

**WS-1 first and alone** — its own costing says nothing in the environment can
buy a point while that frame exists. **WS-9 is closed, so the `--hide` gate on
WS-3/5/6's cost ablations is lifted** (`da7bfe2`). WS-2c before WS-2d. Everything else is parallel and
collides nowhere; the directory map is in each section.

## WS-11 — What phase 4's four lanes left, 2026-08-27

Phase 4 closed DONE with four lanes running under it. Their handoffs graduated
to `project/archive/handoff/` the same day and their open work is here, which is
the rule this file exists to enforce. Directories: `src/combat/**`,
`src/characters/**`, `src/ui/**`, `src/world/props/**`.

**Combat — DONE, 2026-08-28.** All five items landed or closed; two of the
five closed as measured negatives on their stated cause (both in the negatives
table). `e218f5b` the camera whip and the combat framing · `10c2688` +
`e729bb8` the shards · `6a00b0f` the victory card, the call-out wash and the
damage-number lanes · `ea87e16` + `77e5c51` the damage share. Handoff:
`project/archive/handoff/combat.md`. Two things it reports rather than fixes:

- **The boulder in the near corner is not a collision problem at all.** Built,
  measured at **0.00%** and reverted — see the negatives table. The stone in
  `tmp/shots/cb1/f-engage.jpg` is *beside* the lens, not between it and the
  player, and shortening the arm moves the camera toward the player rather
  than away from the rock. `probes/rockcam.mts` is the instrument and carries
  the arithmetic.
- **A wild enemy's max HP is one Noctis combo**, which is why field encounters
  last **6-7 s** against FFXV's 30-90. A level 21 sabertusk is 1381 hp; a full
  Engine Blade combo is 1375 over 1.76 s and the party's full-uptime output is
  1227 dps (`probes/dpsshare.mts`). Not a combat-lane knob: it is enemy HP
  scaling, `WildTerritories` bands and `RpgSystem.enemyScaling`.

**Characters — WS-7's own list, in its order.**

1. **Ignis is untouched and still one black column**, the only character whose
   read did not move: no hem line, no lapel thickness, no collar break.
2. **The sleeve cut** — real work on `piece('sleeve')`, not a data change. Three
   attempts at it as a *surface* are a recorded measured negative; the plate has
   a cut.
3. **Noctis's skull print is vertex-coloured on a 42×76 shirt sweep** and smears
   at 0.95 m. `printWindow`/`printSteps`/`printSeg` exist for exactly this.
4. **A hole at Noctis's collar** — a triangular void between jacket collar and
   shoulder with skin through it.
5. **`_probe/hands.mts`'s `_palm*` framings are inside the geometry.** Nothing
   has ever looked at a palm.
6. **Hair colour** — slate blue `0x252834` against a near-black-with-warm
   reference. One number, and the cheapest win left on the head.

**Draw calls — ~~one shot, and it is 24 away~~ NOTHING IS OVER BUDGET.**
`project/STATUS.md` records the corpus at median 567, worst **786**
(`town_forecourt`), zero shots over 800, with `drawcheck` gating the flat BRIEF
rule and carrying no debt file. The velocity-pass cull (`4c57c1c`) and the NPC
shadow-proxy merge (`a465ad0`, `a50ad33`, `881d065`) both landed. What is below
is **headroom, not a failure**, and at ~8.7 µs/draw the reflection item is worth
about 0.35 ms.

- ~~`town_forecourt` is the only shot of 142 over BRIEF's 800.~~ What clears it is
  named in WS-6: the party rigs' **velocity-pass proxies** (done) and a
  **reflection pass spending ~40 draws on a shot with no visible water** — still
  open, and the mechanism is named now: `Water._visible` tests each body's
  *bounding box* against the frustum and nothing else, so a tarn behind a hill
  or four pixels across on the horizon buys a whole mirrored render of the sky
  dome and the clipmap. It wants a screen-coverage or distance gate.
  `src/world/Water.ts`, which is the `water-content` lane's neighbourhood.
- **`shadowProxy` is duplicated three ways** — `Hammerhead.ts`, `PoiKits.ts` and
  `npc/NpcShadow.ts`. The static pair belongs on `props/PartBuilder.ts`, where
  WS-6 has now put it; the skinned one is a sibling, not the same function.
- **Do not read a single-shot draw delta under ~20 as real.** On the identical
  sha, `town_forecourt` read 821 twice and 801 half an hour later — wider than
  `drawcheck`'s `TOLERANCE` of 8. The ledger records the 821 deliberately.
- **The next NPC block** is the 28 colour draws the eye globes and contact-shadow
  blobs spend. The two globes cannot merge as they stand: independent gaze
  pivots.

**And one game defect nobody owns yet:** there is terrain where holding forward
yields **zero progress indefinitely with no slide-off**. Not a dead end for a
player who steers — `longplay` now steers — but a traversal row.

## Definition of done

- [ ] Every workstream either lands its items or closes them with a measured
      negative appended to the table above.
- [ ] `project/handoff/` holds one file per genuinely live agent, and this plan
      is the only queue. **When a lane finishes, its open work comes back here
      or into a successor plan — never stays in a handoff.**
- [ ] Every frame judged by eye, not only by statistic (`BRIEF.md`).
