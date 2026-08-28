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

## WS-6 — The last perf stalls → phase4 WS-0b

The baseline is **published and passing** as of 2026-08-25 (`RULER_VALID: true`,
floor 16%, mean 218.1 fps, worst 140, every shot over 60). What is left:

- **`sprint+turn`, 84–116 ms, same frame index every run**, when Hammerhead
  first enters the frustum — the one remaining breach of the 33 ms rule. **Not
  CPU**: `ThreadTime` 10.1 ms on a 102.9 ms frame, zero new programs, zero
  texture uploads, zero new visible geometries, 82.0 of 84.3 ms inside
  `post.render`, and it survives rAF pacing. Two unseparated candidates: buffer
  uploads for geometry `Warmup` built but never drew (its `_warmShadows` renders
  into a **64×64** target, and a Metal PSO is keyed by attachment format, so the
  pipeline built there may not be the one the composer's MRT needs), and
  shadow-cascade work for hundreds of new casters.
- **`menu-open` hitches are not a regression.** `perfmenurepro.mts` gives 27
  against the certified baseline and 26 against HEAD; the `baseline-gameplay.json`
  row saying 0 was a lucky 90-frame sample. 100% gated on a menu having been
  opened, periodic on frames 9/19/29/…, pure CPU inside `post.render` with
  `ScenePass` going 3.5 → 37.6 ms at the same draw count and triangle count,
  creating no programs, textures or geometries, and surviving every ablation.
- **`day-night-sweep`: 11.3 ms, 11% over budget, unattributed.**
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
- **A perf sign-off is owed on the menu scrim.** WS-9 made a full-screen 26 px
  `backdrop-filter` blur render for the first time — it had never run — and it
  now runs on every menu frame. `uxcheck` passes 93/93 with no page errors but
  does not time frames, so BRIEF's 33 ms rule is unverified against it.
  `gameplay.mts` on a quiet tree settles it.
- **`tf_stoch` has never been measured.** `splat.md` calls this its
  highest-priority remaining item: 6 array fetches per active layer instead of 4,
  ~2 layers typically live, so roughly +4 fetches per pixel, and the fragment
  cost is unknown. Pre-planned fallback if it does not pay: gate it to
  `vTDist < ~400 m` and single-tap beyond.
- **Wave 3's frame-cost split** (pixel-scaled vs fixed), and **a noise floor per
  shot in `perf.mts`** which is what blocked it — the floor is measured on
  `shots[0]`, so argument order decides whether a run certifies. Both are already
  written into `2026-08-22-opus-phase4-content-and-gameplay.md`'s WS-0b inbox.

## WS-7 — Content holes that break a playthrough

From `content-wire.md`, ranked there:

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

## Negatives worth not re-opening

Collected because each one cost a lane real time and none is discoverable
without opening the handoff it lived in.

| claim | verdict |
|---|---|
| Widen the eye-socket brushes | changed the rendered frame by **nothing**, twice; cost a lane most of a session |
| A world-metre contact ramp for grounding | sub-pixel at judged range; its own positive control moved 2.600/255 with the crop *visually identical* |
| TAA's clamp is why leaf edges alias | measured false — TAA reaches them and softens them, it is just not enough |
| `compileAsync` for shader warm | **3% slower** here, six pairs |
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
| **WS-1: the hard vertical line down the face's midline is the fringe's cast shadow** | present with the **hair hidden**, on every hero, in every framing |
| **WS-1: the painted mouth is eaten by mip selection / by a surface drawn over the face / by `patchSkin` mangling the uv** | all three closed. The map ships at `anisotropy = 16` on a hand-built 11-level chain and at 0.55 m the face is *magnified*; `<name>_shadow` carries `colorWrite = false`; and `fract(vMapUv * 8.0)` written straight to `gl_FragColor` comes out even and symmetric over the whole mid-face. **What is left is the projection**: below the mouth line `uvOf`'s `atan2(x, z)` collapses into a radial fan converging on the menton, and the mouth sits inside it. `probes/faceuvshade.mts`, `probes/facebar.mts`, `probes/faceattr.mts` |
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
| `tourSettle` 40 -> 20 in `driftcheck` | 4 s of 36, bought by halving the LOD rings' settle time. Not taken |

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

**Combat — the fight has shape now; these are what is still ugly in it.**

- **The arm whips when the fight is beside a boulder.** Every `stagger` frame of
  every run in four capture sets is a smear with Noctis not in it and a boulder
  filling the near corner, unchanged by both camera commits — so it is
  `CameraRig._armDistance`'s sphere sweep, not the framing. **The single ugliest
  thing a fight here does.**
- **`CameraRig`'s combat framing is live and under-tuned.** `wantPitch = 0.16 +
  toTarget.y * 0.03` barely tilts down for a metre-tall beast, so a sabertusk at
  eight metres is ~60 px; FFXV's combat camera comes in *and* down. And
  `restDistance = targetDistance + flat * 0.22` is why `_frameCombat` only
  frames a threat inside 16 m — beyond that the term pushes the arm 5.6 → 10 m
  and makes framing worse than none.
- **Nothing marks the end of a fight.** `encounter:victory` carries kills, EXP,
  gil and drops; the party just stands up with weapons drawn. And the
  **`STAGGER!` banner outlives the stagger** — still on screen at the victory
  frame four seconds after the last kill, in white letterspaced type with no
  plate over a bright sky. So are the damage numbers.
- **The warp-strike shard burst reads as flat blue confetti at close range** —
  large opaque mid-blue lozenges, no emissive gradient, occluding the fight.
  `src/combat/VFX.ts` / `CrystalShards.ts`.
- **Noctis does 14% of the damage in his own fight.** `PartyAI.ROLES` motion
  values are the knob. The lane's warning that this should not be tuned before
  the level bands moved has been **discharged** — levels scale HP and damage
  now and wild dens track the party — so this is live work rather than a trap.

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

**Draw calls — one shot, and it is 24 away.**

- `town_forecourt` is the only shot of 142 over BRIEF's 800. What clears it is
  named in WS-6: the party rigs' **velocity-pass proxies** (one per mesh per
  mover, and the same merge that fixed their shadows fixes these), and a
  **reflection pass spending ~40 draws on a shot with no visible water**.
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
