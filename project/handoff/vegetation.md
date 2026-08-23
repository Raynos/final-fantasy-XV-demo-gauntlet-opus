# Vegetation LOD — the blind judge's round-4 number one defect

Owner: the vegetation-LOD agent (`PORT=5470`).
Branch: `worktree-agent-a70c77fefd6048731`, merged up from `main` at `f816797`
(**the worktree was created 170 commits behind; check this first, always** —
that is now three agents in a row).
Predecessors: `project/handoff/shadows.md` (which handed this over),
`project/handoff/grass.md` (the long-running vegetation handoff — sections 2–4
and 8 are still accurate and section 8 will still cost you a round each),
`project/handoff/terrain-material.md`.

**Four commits, all landed and gated. Distant trees are no longer flat cards
shaded by their own random yaw, a stand no longer has one tree in it ninety
times, and Leide's ground layer no longer stops dead at 132 m.** Triangles are
*down* 0.8–6.3% on all six graded shots and draw calls are up 4–6.

---

## The headline

Round 4's number one, verbatim: *"vegetation is flat cards and alpha-cut clumps
with no silhouette variety… it fails at every distance simultaneously"*. The
shadows lane handed it over with the right sentence — *"giving impostors a
shadow sat the world down on the ground; it didn't make impostors into trees"* —
and with the census that makes it matter: in `zone_fallgrove` **1 239 of the
~1 800 trees on screen are impostors and only 97 are geometry**, because the
graded frames are elevated establishing shots whose nearest visible ground is
61–80 m and the geometry ring stops at 100.

**What an impostor actually was.** `billboardGeo` gave all eight vertices of
both crossed quads *one* constant object-space normal, `(0, 0.62, 0.78)`. An
InstancedMesh rotates that by the per-instance yaw, so the whole crown was
flat-shaded by a single N·L that is a pure function of the tree's random yaw.
Measured with `src/tools/probes/impostorshade.mts` over `zone_fallgrove`,
restricted to instances actually inside the frustum:

| tier | mean lambert | sd | **neighbour scatter** |
|---|---|---|---|
| tree geometry leaf (the reference) | 0.382 | 0.071 | **0.078** |
| tree impostor, before | 0.399 | 0.383 | **0.404** |
| canopy stand card, before | 0.318 | 0.333 | **0.363** |

The means already agreed to within 4%. **No tint, albedo or palette change
could ever have reached this** — it was a *normal* problem wearing a colour
problem's clothes, which is the fourth time this project has been caught by
that shape. The column that matters is the last one: how far a card's shading
sits from the mean of its eight nearest neighbours. At 0.404 against the near
ring's 0.078 that is salt-and-pepper, and `tmp/crop/fg-mid.png` is what it
looks like — crowns alternating near-black and pale green with no relation to
each other, in a frame where the geometry trees ten metres in front of them all
agree.

---

## What landed

### 1. `ba6f8bc` — every card LOD gets a crown

`crownNormalTex` in `VegTextures.ts` synthesises an object-space normal from
the baked card's **own alpha**: blur the coverage at a crown scale and a lobe
scale, take the gradient, read it as an inflated blob. No second GPU pass, no
authored art, and it tracks whatever the bake produced. `patchVeg` gains a
`crownNormal` option that rebuilds the card's frame in view space and rotates
the sample into it. Applied to the tree impostors and the canopy stand cards.

**Two things in it were arrived at by measurement, and both first attempts
looked entirely reasonable.** They are commented at the site; read them before
changing either.

- **The dome is built around the view axis, not the quad's plane normal.**
  Anchored to the plane normal the two crossed quads are ninety degrees apart,
  so every card came out *folded down the middle* with a lit half, a dark half
  and a hard vertical seam — `tmp/crop/v1-mid.png`, and it is worse than what
  it replaced. A crown is a sphere and a sphere shows the same dome to every
  viewer, so the view-aligned frame is the correct one and the seam cannot
  exist. It costs no extra varying.
- **The out-of-card component is damped to 0.14.** Taken literally the dome is
  a camera-facing hemisphere, which is what a *solid* sphere presents — and a
  solid sphere seen from the anti-sun side is black. `zone_fallgrove` is
  backlit, and a full-depth dome took the on-screen impostors to a mean lambert
  of **0.092** against the near ring's 0.382. A correct sphere and a completely
  wrong tree. A canopy is a translucent volume of leaves; the form is carried
  by the lateral terms, which average out against any sun direction instead of
  tracking it.

The up bias is **solved, not authored**. The card's y axis *is* world up in the
frame the shader builds, so the coverage-weighted mean of the encoded y is the
tier's mean world-space upness and is view-independent — the one honest thing
to match the near ring on. That ring measures **0.845**; `CROWN_MEAN_UP` is
0.84 and `crownNormalTex` binary-searches the bias to hit it.

After:

| tier | mean lambert | sd | neighbour scatter |
|---|---|---|---|
| tree geometry leaf | 0.382 | 0.071 | 0.078 |
| tree impostor | 0.318 | 0.036 | **0.008** |
| canopy stand card | 0.250 | 0.031 | **0.017** |

**Neighbour-to-neighbour scatter down 50×** and now well under the near ring's
own crown-to-crown variation. What sd remains varies *smoothly* across the
frame, which is a lighting gradient and is what a forest does.

### 2. `b837cf0` — a stand gets a canopy line, emergents and its own aspect

Two things made every tree in a grove the same tree, and neither is shading:

- **The height band is only ~1.5:1 and biased to its low end.** A forest biome
  authors `treeS: [0.95, 1.4]` and the draw is `lo + u^1.4 * (hi − lo)`, so the
  median tree sits near 1.05 and the treeline is a level wall. The two tails
  are now drawn explicitly — top 12% × 1.10–1.40, bottom 16% × 0.62–0.86 — and
  the author's band goes back to describing the *typical* tree.
- **Every card was scaled uniformly, so every impostor in frame had the same
  aspect ratio.** `sw` is an extra 0.82–1.24 on x/z only, and *every* ring
  applies it, so the LOD swap stays invisible.

**Both are drawn from a position hash rather than the tile's `Rng`, and that is
the reusable part.** The first version took two more numbers off the tile
stream, which re-rolls the acceptance test, species and yaw of every later
candidate: `zone_fallgrove` came back a *different grove* (`tmp/shots/v4/`), and
a frame that is different for two reasons at once cannot tell you whether
either helped. Hashing the placement's own x/z leaves the scatter
bit-identical. **Anything added to `_makeTile` in future must do the same.**

### 3. `006b755` — Leide is bare because the ground layer stops at 132 m

The finding handed over was *"a `Biomes.ts` density question"*. It was half of
one. Probed along `zone_longwythe`'s own camera rays
(`src/tools/probes/nearfield.mts`, which marches the real rays onto the
heightfield rather than assuming a distance), the ecology was **not** switched
off: `grassDensity` returned 0.27–0.59, `scrubDensity` 0.12–0.23, and the grass
field was drawing **310 355 instances in 124 calls**. Two separate things:

- **`Bushes.range` is 132 m and the graded Leide shots start at 54–80 m.** The
  entire ground layer ended a few dozen metres past where the visible ground
  began, and then four hundred metres of nothing. There is now a **card ring at
  96–280 m**, built from exactly the parts the tree impostors use —
  `bakeTreeImpostor`, `crownNormalTex`, crossed quads, eight triangles an
  instance. Fern, bracken and reed deliberately get no card (forest-floor and
  water-line cover nobody reads from 200 m), and the cards are kept out of the
  shadow pass on the shadows lane's own rule.
- **Flat ground was cut to 0.35 of its slope value in `scrubDensity`.** The
  comment is right that dry country grows thorn on slopes, but a third is not a
  floor, it is an off switch for a plain — and both Leide shots look across a
  plain. Now `0.60 + 0.40 * slope`. The patch mask is untouched: scrub *should*
  come in islands.

**The order of those two is the finding.** Raising the floor first, with the
geometry ring still at 132 m, cost **+14.6% triangles** on `zone_longwythe` —
the extra bushes all landed inside the geometry ring and were drawn as four
hundred triangles of branch each to fill six pixels. Pulling the ring back to
96 m and letting the card take 96–280 m gives a frame indistinguishable by eye
(`tmp/shots/v7/` vs `tmp/shots/v8/`) for **less than the original baseline**.

### 4. `45f8c15` — `PAIRING` rows for `zone_fallgrove` and `zone_vannath`

Added **before round 5 was run and before any score existed**, which is the
only condition under which adding rows to your own test is legitimate. The
shadows lane recorded against itself that round 4 under-sampled its own change
because these two shots had no rows; the same hole would have swallowed this
lane.

---

## Cost

From the capture manifests, `tmp/shots/rs-v0` (inherited) against
`tmp/shots/r5` (now). Same six shots, same machine, same session.

| shot | triangles | Δ | draw calls | Δ |
|---|---|---|---|---|
| `zone_fallgrove` | 7 875 631 → 7 796 759 | **−1.0%** | 599 → 603 | +4 |
| `zone_vannath` | 8 343 909 → 8 276 469 | **−0.8%** | 649 → 655 | +6 |
| `zone_longwythe` | 7 515 094 → 7 352 426 | **−2.2%** | 559 → 565 | +6 |
| `zone_three_valleys` | 8 008 089 → 7 503 429 | **−6.3%** | 494 → 500 | +6 |
| `vista_noon` | 7 835 225 → 7 494 819 | **−4.3%** | 505 → 511 | +6 |
| `zone_nebulawood` | 8 501 372 → 8 302 052 | **−2.3%** | 613 → 617 | +4 |

**Triangles down on every shot; draw calls up 4–6; peak 655 against the 800
budget** (the shadow lane's peak was 649). More vegetation on screen for fewer
triangles, because the work moved from branch geometry to eight-triangle cards
at distances where nobody can tell.

Memory: 21 impostor normal maps at 256², 7 stand-card maps at 384², 6 scrub
impostor bakes at 128² plus their normal maps. All synthesised from bytes
already in memory; no new GPU passes at runtime.

**`perf.mts` and `gameplay.mts` were not run** — the tree was not quiet and
`CLAUDE.md` says a perf number taken while agents run is meaningless. The
triangle and draw-call direction is favourable on every shot, but that is an
inference about frame time, not a measurement of one. It is still the largest
unknown in this directory and has been for three handoffs.

---

## `reliefstat`, and why it cannot grade this lane

Six shots, median, against `FFXV-ground`.

**Default ground ROI** — this is the ROI the shadows lane's numbers are on, so
it is directly comparable:

| | d1 | d2 | d4 | d8 | d16 | d32 | tot |
|---|---|---|---|---|---|---|---|
| before | 15.01 | 14.06 | 15.59 | 18.04 | 20.74 | 20.73 | 49.09 |
| after | 15.31 | 14.05 | 15.76 | 18.25 | 20.71 | 19.12 | 48.04 |
| `FFXV-ground` | 11.32 | 15.45 | 16.76 | 18.44 | 21.22 | 21.79 | 49.00 |

d4 93→94%, d8 98→99%, d16 98→98%, **d32 95→88%**. Essentially flat, with one
real regression at d32 — the coarse band, most likely the bush geometry ring
pulling back from 132 m to 96 m and taking large near-ground clumps with it.
Worth a look; not chased.

**Canopy band ROI** (`--roi 0.08,0.36,0.84,0.26`) — where this lane's work
actually is:

| | d4 | d8 | d16 | d32 |
|---|---|---|---|---|
| before | 88% | 93% | 88% | 124% |
| **after crown normals alone** | **88%** | **89%** | **84%** | 122% |
| after everything | 89% | **97%** | **93%** | 121% |

**Read the middle row.** The crown-normal fix — the one measured to cut
neighbour scatter fifty-fold and the one that visibly turned a salt-and-pepper
band into a forest — scored *worse* on `reliefstat`, because the contrast it
removed was real contrast that happened to be in the wrong place.
**`reliefstat` is a detail-*density* instrument and the impostor defect was a
*coherence* defect.** Do not chase this tool on vegetation, and do not read the
88→89% at d4 as a failure to add detail. The instrument for coherence is
`neighbourScatter` in `impostorshade.mts`, and it is the one that agreed with
the eye. This is the same shape as terrain-material's "`imagestats` cannot
grade this lane" and atmosphere's before it.

---

## Blind A/B round 5 — `tmp/ab/r5/`, seed 5519, six pairs

Shots: `vista_noon`, `zone_fallgrove`, `zone_longwythe`, `zone_nebulawood`,
`zone_three_valleys`, `zone_vannath`. Two of them are the new `PAIRING` rows.
`compare.mts`'s own printed question, verbatim, no added instructions.

**6 identified, 0 fooled, 0 hesitated, all six HIGH. Score 3/10.** Identical to
rounds 3 and 4. **The win rate and the hesitation rate did not move, again.**

**Vegetation is still first — but it is a different sentence, and the
difference is the whole result.**

| round 4 | round 5 |
|---|---|
| **1. vegetation is flat cards and alpha-cut clumps with no silhouette variety — fails at every distance simultaneously** | **1. "Billboard/cutout vegetation. Flat crossed cards with *hard alpha edges*… aggressive alpha-cutout with speckled, dithered edges *eating the silhouette*"** |
| (part of the same item) | **8. "Uniform instancing. Same tree, same rock, same scale, evenly spaced"** |

The *silhouette-variety* half went from sharing first place to **eighth**. The
*flat card* half has stopped being about shading and become one specific,
nameable thing: **the alpha cut has no anti-aliasing at all**. It is cited on
exactly the two forest frames, `zone_fallgrove` and `zone_nebulawood`.

Also promoted: terrain material at 3 (one tiled noise texture per landform, no
slope blend), primitive geometry in the silhouette at 4 (cone mountains, box
buildings, **the untextured placeholder props the atmosphere lane flagged after
round 2 are still there and are still ending the guess** — three rounds now),
grounding/AO at 2, sky-as-a-flat-layer at 6, aerial perspective at 7.

---

## The next defect, already located and measured

**`tmp/crop/edge.png`** is the treeline against the sky at 8× nearest-neighbour.
Every leaf boundary is a hard one-pixel binary staircase with isolated single
texels flicked off the silhouette. There is no partial coverage anywhere. That
is the judge's sentence, exactly, and it is visible to the naked eye once
magnified.

**The obvious first guess is wrong and here is the measurement that kills it.**
"TAA's neighbourhood clamp rejects the history at a high-contrast alpha edge"
is the textbook explanation and it is *not* what is happening here.
`--ablate notaa` (no `--raw` — see the shadows lane's trap) moves **5.943/255
mean over 18.0% of pixels** on `zone_fallgrove`, and `tmp/crop/edge-notaa.png`
against `tmp/crop/edge.png` shows TAA is reaching the foliage edges and
genuinely softening them. It is simply not enough: the jitter is sub-pixel and
each leaf boundary is about one pixel.

**The real fix needs a cross-lane change, and this is the specific one.**
`alphaToCoverage = true` on the vegetation materials is one line in
`VegMaterial.patchVeg` and would give every foliage edge 4–8× coverage AA for
free — but it is a **no-op unless the scene target is multisampled**, and
`PostFX.rtScene` (`src/engine/PostFX.ts:166`) has no `samples`. `Renderer.ts:53`
says `antialias: false // we resolve AA in post (SMAA/TAA)`, which was the right
call before foliage filled the frame. Complication to hand over with it:
`rtScene.depthTexture` is shared with `rtVel`, and a multisampled target with an
attached depth texture is a known three limitation — whoever owns PostFX needs
to solve that, not just add `samples: 4`. **`src/engine/PostFX.ts` is not this
lane's file and was not touched.** The alternative that *is* in-lane is hashed
(stochastic) alpha, which trades the hard edge for dither noise that TAA then
has to resolve — cheaper to try, and worth measuring against a `samples: 4`
prototype before anyone commits to either.

---

## Measured negatives, in full

| hypothesis | probe | result |
|---|---|---|
| the impostor band is too dark / wrongly tinted | per-instance mean lambert, all three tiers | **false.** Impostor 0.399 vs geometry 0.382 *before* any change — a 4% agreement. It was never a value problem. |
| a plane-normal-anchored crown dome | built it, looked at `tmp/crop/v1-mid.png` | **worse than the defect.** Every card folded down the middle with a hard vertical seam. |
| a full-depth camera-facing dome is the physically right crown | on-screen mean lambert | **0.092 against 0.382.** Correct for a solid sphere, wrong for a canopy. |
| `reliefstat` can grade the impostor fix | canopy-band ROI, before/after | **it scores the fix *worse*** (d8 93→89%, d16 88→84%). Coherence defect, density instrument. |
| Leide is bare because the ecology has switched cover off there | `nearfield.mts` along the real camera rays | **false.** `grassD` 0.27–0.59, `scrubD` 0.12–0.23, grass drawing 310 355 instances. The ground layer's *range* was the problem. |
| raise the scrub density floor and the frame fills in | shot it | **it does, for +14.6% triangles**, because the new bushes land inside the geometry ring. Needed the card ring first. |
| TAA's history clamp is why foliage edges are hard | `--ablate notaa`, paired, no `--raw` | **false.** TAA moves 5.94/255 over 18% of pixels and visibly softens the edges. It is insufficient, not absent. |

Two instrument artefacts worth knowing, both of which produced a confident
wrong number for a turn:

- **A census that tests `!o.count` silently drops every non-instanced mesh**,
  because a plain `Mesh` has no `count`. My first `nearfield` run reported *no
  grass at all* at `zone_longwythe`; there were 310 355 instances.
- **The instance rings write with `frustumCulled = false`**, so the raw
  instance list includes cards behind the lens, and a card behind the lens has
  its view-aligned frame pointing the other way. Including them dragged the
  impostor mean lambert by a third. `impostorshade.mts` now frustum-tests, and
  any statistic that claims to describe *the frame* must.

---

## Gates

`PORT=5480 npm run check`: **11/11**. `anycheck` 0. `combatloop` 31/31,
`horizoncheck` PASS at worst MCC 0.766 (unchanged, the coordinator has already
explained that number), `driftcheck`, `heightcheck`, `roadcheck`, `uxcheck`
89/89, `creaturecheck`, `integration`, `orphans` all PASS.
`npm run typecheck` and `npm run typecheck:tools` clean.

**Use an explicit free `PORT`** — the shadows lane's note about `combatloop`
hard-coding `PORT || 5199` still applies and is still unfixed.

`npm run check:perf` **not run**, per `CLAUDE.md`: the tree was not quiet.

---

## Files touched

- `src/world/veg/VegTextures.ts` — `crownNormalTex`, `blurField`,
  `CROWN_MEAN_UP`; `bakeTreeImpostor` and `bakeCanopyCard` now return
  `{tex, normalMap}`.
- `src/world/veg/VegMaterial.ts` — `crownNormal` option; the two
  `<normal_fragment_begin>` rewrites merged into one ordered list (the order is
  load-bearing and commented).
- `src/world/veg/Trees.ts` — true per-quad plane normals in `billboardGeo`,
  crown normals wired to both card rings, stand structure and crown spread.
- `src/world/veg/Bushes.ts` — `scrubCardGeo`, the 96–280 m card ring, `range`
  132 → 96.
- `src/world/veg/Ecology.ts` — the flat-ground scrub floor, 0.35 → 0.60.
- `src/world/Vegetation.ts` — `bushes.build(game.renderer)`.
- `src/tools/compare.mts` — two `PAIRING` rows, nothing else.
- `src/tools/probes/impostorshade.mts`, `src/tools/probes/nearfield.mts` — new.
- this file.

Nothing under `src/world/terrain/`, `src/world/props/`, `src/world/town/`,
`src/engine/`, `src/world/sky/`, `src/game/` or `src/ui/` was edited. **No other
lane's file was touched at all** — the PostFX MSAA change the next step needs is
described above and deliberately left for its owner.

---

## Exact next steps, in priority order

1. **Anti-alias the alpha cut.** The judge's number one, located, magnified and
   with the obvious wrong answer already eliminated. See the section above:
   `alphaToCoverage` needs `PostFX.rtScene` multisampled (cross-lane, and the
   shared `depthTexture` is the complication); hashed alpha is the in-lane
   alternative. Measure both against `tmp/crop/edge.png`.
2. **Baseline `perf.mts` and `gameplay.mts` on a quiet tree.** Three handoffs
   have now said this and none has done it. Triangles are down 0.8–6.3% and
   draws up 4–6 across this lane, which *should* be a win, but nobody has
   measured a frame time in this directory since before the town existed.
3. **The near ring's leaf cards read as soft spray at 20–40 m and as smeared
   paint closer than that** — visible on the big emergent in
   `tmp/shots/v4/zone_fallgrove.jpg`. Carried over unchanged from
   `grass.md` §7.5; the emergent tail has made it easier to run into. Probably
   the mip chain plus `flutter: 0.5` shear.
4. **`zone_fallgrove`'s ground still reads pale grey-green under a warm-brown
   `groundColorAt`** — `grass.md` §7.3, unresolved, needs the terrain owner.
5. **The scrub card ring stops at 280 m** and the Leide shots run to 500 m+.
   Extending it is cheap in triangles but the tile grid is 32 m, so the tile
   count goes as the square; a coarser tile for the far ring is the honest fix.
6. **d32 on the ground ROI went 95% → 88%.** Most likely the bush geometry ring
   pulling back to 96 m. Measure before assuming.
7. **The untextured placeholder props in `vista_noon`** — a grey lattice tower,
   a chrome-black sphere, a red box — were flagged after round 2 and are still
   ending the judge's guess in round 5. Fourth round running. Still nobody's
   lane. It is the cheapest remaining point in the whole environment.

---

## Shots that show the current state

- `tmp/shots/rs-v0/` — the state as inherited, six shots, PNG.
- `tmp/shots/r5/` — the same six now. This is the round-5 set.
- `tmp/crop/fg-mid.png` vs `tmp/crop/v3-mid.png` — the impostor band before and
  after the crown normal, 3×. The pair that carries the argument.
- `tmp/crop/v1-mid.png` — the plane-normal-anchored dome, kept because it is
  the mistake most worth not repeating.
- `tmp/shots/v4/` vs `tmp/shots/v5/` — the RNG-stream reshuffle against the
  position-hash version of the same change.
- `tmp/shots/v5/zone_longwythe.jpg` vs `tmp/shots/v8/zone_longwythe.jpg` —
  bare hardpan against scrub, for fewer triangles.
- `tmp/crop/edge.png` and `tmp/crop/edge-notaa.png` — the alpha edge at 8×,
  with and without TAA. The next defect.
- `tmp/ab/r5/` — blind round 5, six pairs, seed 5519, sealed key.

---

## My honest grade for the environment, against shipped FFXV

**4 / 10.** The same number the shadows lane gave, and I want to be clear that
I am not claiming its point back and adding one of my own.

What this lane was sent to fix is fixed, and it was fixed by measurement rather
than by taste. Ninety-three per cent of the trees in a wooded frame were being
flat-shaded by their own random yaw; adjacent crowns differed by 0.40 in mean
lambert where the real trees ten metres in front of them differed by 0.078. That
is now 0.008, a stand has a canopy line and emergents in it instead of one tree
stamped ninety times, and Leide's foreground has cover in it for the first time
— all for *fewer* triangles than I started with. I looked at every frame. The
judge moved "no silhouette variety" from joint-first to eighth.

What keeps it at 4 is that the same judge, on the same frames, kept vegetation
at number one and simply named a different thing about it: the alpha cut has no
anti-aliasing, and at the distance these frames put a leaf, that is one hard
pixel per leaf boundary across the entire canopy. I can see it myself at 8× and
it is not subtle. It is also not something I could fix from inside this lane
without editing `src/engine/PostFX.ts`, which is not mine, so it is handed over
with the measurement, the failed hypothesis and the specific complication rather
than half-attempted.

And the honest reading of five rounds is that 6/0/0 has not moved since round 2.
The defect *ranking* keeps reshuffling — shadows out of first, silhouette
variety out of first — which says the lanes are hitting real things. The *win
rate* not moving says the gap is not one defect deep. On the two forest frames
the judge called it "a full console generation", and on that I think it is
right.
