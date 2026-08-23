# Shadows — the blind judge's round-3 number one defect

Owner: the shadows agent (`PORT=5440`).
Branch: `worktree-agent-a0ec63a5f96178040`, merged up from `main` at `6b61bec`
(the worktree was created **163 commits behind**; check this first, always).
Predecessors: `project/handoff/terrain-material.md` (which handed this over),
`project/handoff/atmosphere.md`, `project/handoff/graphics-ceiling.md`.

**Two commits, both landed and gated. The frames now have a cast shadow under
every tree, bush and boulder, which is what the reference plates have and what
three rounds of blind judging said we did not.**

---

## The headline

Round 3's number one, verbatim: *"no shadowing of any kind"*. The
terrain-material lane verified it in the composite itself rather than taking it
from the judge's prose, and handed it over as *"nothing in these six frames casts
a visible ground shadow"*. That observation is **correct**. The diagnosis
everybody reached for — cascade coverage, depth bias, the shadow camera's
frustum, cascade resolution, a receiver-side term — is **wrong in every one of
its five forms**, and each was measured, not argued.

**What was actually preventing the shadows: the LOD tiers that fill these frames
were all explicitly flagged not to cast.** A census of what is in the shadow pass
for `zone_fallgrove`:

| tier | instances in frame | casting |
|---|---|---|
| tree impostors (100–340 m) | **1 239** | **0** |
| canopy stand cards (300–1250 m) | **490** | **0** |
| far-LOD rocks (62–430 m) | **700** | **0** |
| tree geometry (0–100 m) | 97 | 97 |

Ninety-three per cent of the trees in that frame were impostors. And the graded
shots are elevated establishing frames whose **nearest visible ground is 61 m
(`zone_fallgrove`) / 80 m (`zone_longwythe`)** — measured by marching the real
camera rays onto the heightfield, not assumed — so essentially everything on
screen is past the 100 m geometry LOD. Nothing was casting because nothing that
was on screen was *allowed* to.

Two lines. `src/world/veg/Trees.ts:370` and `src/world/props/Rocks.ts:781`,
`castShadow = false` → `true`. **Both are in other lanes' directories and that is
flagged loudly here and in the commit message.**

---

## What landed

### 1. `1655496` — the cascade splits follow the ground the frame contains

`src/world/Sky.ts`. `mode: 'practical'` → `mode: 'custom'` with a callback that
is three's own practical split and **one number changed**: the near bound is the
distance to the nearest ground the camera can see, not `camera.near`.

`camera.near` is 0.15 m, and a practical split is half logarithmic, so it spent
cascade 0 on 0.15–32.5 m. That is right for the third-person gameplay camera —
`hero_full` puts ground at 3.0–11.9 m and every one of those pixels selects
cascade 0 and lands cleanly inside its map. It is wrong for an establishing shot:
in `zone_fallgrove` **cascade 0's map did not contain a single on-screen ground
point** (shadow-space *v* ran −0.06 at the bottom edge to −6.14 at the horizon).
The 2048² cascade was re-rendering the world into a 54 m box every frame and no
pixel of any graded frame ever sampled it. Everything fell through to cascade 2 —
1024² over a 314 m box, **0.31 m per texel**, coarser than the trunks and bushes
it was being asked to resolve.

`zone_fallgrove` now serves its visible band from the 2048² cascade at
**0.065 m/texel**: a 4.7× improvement.

**And it is worth almost nothing on its own, which is exactly why it is recorded
as a first-class result.** Paired `--raw` captures, new against `?post=nearsplit`
(the old behaviour, kept as an ablation): `zone_fallgrove` **0.308/255** over 1.2%
of pixels, `zone_longwythe` **0.050/255** — below the 0.30 capture floor.
**Cascade resolution was never what was stopping the shadows.** Kept because it
is correct, costs nothing (same cascade count, resolutions and stride), and is
the precondition for anything that does put casters in that band.

The near bound is snapped to a ×1.6 ladder. **The snapping is the correctness
condition, not an optimisation**: a continuously-varying near bound re-derives
the splits every frame, which re-fits every cascade's box every frame, which
desynchronises the stale depth maps `_updateCascades` exists to keep. In
gameplay the ladder pins it at `camera.near` and the splits are what they were.

### 2. `7c6742a` — the LOD tiers cast

The two flags above. The objection to impostor shadows is that a camera-facing
card casts a silhouette that rotates with the viewer. **It does not apply here:
`billboardGeo` (`Trees.ts:115`) is not a billboard.** It builds two crossed
quads at a fixed world orientation — structurally the same construction as
`swardProxyGeo`, the grass shadow proxy already measured to work. And three
builds its depth material from the material's `map`, `alphaTest` and `side`, so
the shadow is the alpha-tested tree silhouette, not a rectangle. Static in world
space, tree-shaped, and **verified by eye** in `tmp/shots/sh-cast/`.

Canopy stand cards are deliberately left alone: they start at 300 m and CSM
`maxFar` is 190, so their shadow could never be sampled. Cost with no pixels.

---

## Numbers

`reliefstat` over the default ground ROI, six shots, against `FFXV-ground`:

| | d1 | d2 | d4 | d8 | d16 | d32 | tot |
|---|---|---|---|---|---|---|---|
| **before** | 14.33 | 11.86 | 11.52 | 12.24 | 14.73 | 17.17 | 40.62 |
| **after** | 15.00 | 12.75 | **12.84** | **13.72** | **16.46** | 17.41 | **42.90** |
| `FFXV-ground` | 11.32 | 15.45 | 16.76 | 18.44 | 21.22 | 21.79 | 49.00 |

d4 69% → **77%** of the reference, d8 66% → **74%**, d16 69% → **78%**, total
83% → **88%**. Three bands crossed from the tool's `OFF` to its `ok`.

The two wooded shots carry it, as they should:

| shot | tot before → after | d8 before → after |
|---|---|---|
| `zone_fallgrove` | 51.44 → **70.85** | 17.76 → **24.37** (above the reference's 18.44) |
| `zone_vannath` | 38.09 → **42.43** | 13.58 → **16.44** |

`zone_longwythe` and `zone_three_valleys` barely move. **That is correct and it
is a finding, not a shortfall** — see the open item below.

`imagestats` is the guard against undoing the atmosphere lane, and it holds:

| | R-B | sh(R-B) | hi(R-B) | meanL | p50 | sat% | stops |
|---|---|---|---|---|---|---|---|
| before | −6.4 | +6.2 | −5.1 | 114.2 | 104.3 | 32.9 | 9.48 |
| after | −6.4 | +5.0 | −4.3 | 115.5 | 106.7 | 32.9 | 9.72 |

Median R-B and sat% identical; the frame gained a quarter-stop of dynamic range,
which is what adding real shadows to a flat frame does.

**Cost**, from the manifests: **+33 to +55 draw calls**, **+2.6% to +4.1%
triangles**. Peak 649 calls against the 800 budget.

---

## Measured negatives, in full

Five wrong diagnoses, each disproved by a probe rather than an argument.

| hypothesis | probe | result |
|---|---|---|
| shadow maps are not being rendered (`shadow.autoUpdate === false` on all three cascades) | read the state after a settled render | **false.** `autoUpdate:false` is deliberate — `Sky._updateCascades` drives `needsUpdate` on a stride. Maps allocated at 2048/1024/1024, freshly fitted. |
| shadows are rendering but something washes them out | `?post=nomask` (`shadow.intensity = 0`, identical program) vs baseline, `--raw` both sides | **the mask contributes +0.17/255 on `zone_longwythe`** (median 0.00, p99 1.00) and +3.72/255 on `zone_fallgrove` with p99 59. Not washed out — barely present. |
| the cascade frustum is misaligned and the near ground falls outside cascade 0's map | shadow-coordinate probe on the *gameplay* camera | **false as a general claim.** `hero_full`: every ground pixel selects cascade 0 and lands inside its map. The rig is correct; the *shot framing* is what falls outside. |
| cascade resolution at range is the limit | the split fix, 4.7× texel density, paired `--raw` diff | **0.308/255 and 0.050/255.** Resolution was never the limit. |
| depth bias / normal bias is eating the shadows | never needed a probe — the `nomask` result rules it out arithmetically. A bias problem makes shadows *wrong*, not absent; a mask that moves 0.17/255 has nothing to bias. | — |

### The confounded ablation, recorded so nobody rebuilds it

The **first** version of the ablation was `l.castShadow = false` on the cascade
lights (`?post=noshadow`). It measured a **+62/255** "shadow contribution" on
`zone_longwythe`, over 73% of pixels — a spectacular, completely false positive
that would have confirmed the wrong diagnosis.

The reason is in `three/examples/jsm/csm/CSMShader.js`. Killing `castShadow`
takes `NUM_DIR_LIGHT_SHADOWS` to 0, which drops the chunk out of its cascade
branch into the plain `#else` loop — **and that loop calls `RE_Direct` for every
directional light instead of for the one cascade the fragment falls in.** Three
cascade lights of equal colour and intensity then light the ground three times
over. The honest figure, from `?post=nomask`, is +0.17/255. **A 360-fold error,
in the flattering direction.**

`noshadow` has been removed. `nomask` is the instrument; it zeroes
`shadow.intensity`, which is a plain uniform, so the program, the defines, the
cascade gating and the light count are bit-identical on both sides. **Do not
"simplify" it back.** The comment at the site says so.

This is the sixth entry for the family in `LANDMINES.md`'s "diagnoses that were
wrong" pattern: a correct negative, an untested inference drawn from it, and a
number large enough to make the inference look measured.

### The contact-shadow pass reaches nothing in the graded frames, and widening it does not help

Measured after round 4, because the judge's new third item is grounding.
`?post=nocontact`, paired captures, **no `--raw`** (see the trap below):

| shot | mean/255 | >8/255 |
|---|---|---|
| `hero_closeup` (close camera, 17.6 h) | **3.420** | 9.12% |
| `zone_fallgrove` | 0.316 | 0.08% |
| `zone_longwythe` | 0.545 | 0.26% |

Against a 0.30 capture floor. **The pass works, and works well, in gameplay. It
contributes nothing to the frames the judge grades**, for the same structural
reason as the cascade split: `maxDistance = 55` m and the nearest visible ground
in these shots is 61–80 m. Every pixel is past the gate.

**Raising it does not fix it.** `CS_STEPS` is a fixed loop count and
`maxDistance` only widens a `smoothstep` range gate, so the cost of raising it
is bounded and it looked like a free win. Set to 200 m and re-measured:
`zone_fallgrove` 0.316 → **0.355**, `zone_longwythe` 0.545 → **0.560**. Nothing.
Reverted. Do not spend a turn on it again — if grounding at 60–200 m is worth
having, it needs a different mechanism, not a bigger number on this one.

### The trap that nearly cost me this measurement

**`--raw` bypasses the post chain entirely**, so *no* `--ablate` token that acts
on a post pass can ever show up under it. My first contact measurement was
`--raw --ablate nocontact` and read **0.000/255, max 0** on every shot including
`hero_full` — a perfect, meaningless null. `BRIEF.md` says a null ablation must
never be read as innocence, and the control is what caught it: `--ablate nogtao`
under `--raw` reads 0.000 too, and GTAO demonstrably moves 8.6% of pixels.

The rule that follows: **`--raw` for mesh and light ablations, never for post
ones.** `BRIEF.md` already says "`--raw` goes on both sides of a *mesh*
ablation"; the italics are load-bearing and easy to skim past. This lane's
`nomask` / `nearsplit` measurements are all light-side and are correctly `--raw`.

### Two probe artefacts worth knowing

- **The shadow-coordinate probe's first version sampled points a fixed
  *horizontal* distance ahead of the camera.** On any shot where the camera is on
  high ground that is meaningless — the point 5 m ahead at terrain height is 57°
  below the horizon and not in frame at all. It produced a beautiful, entirely
  spurious table showing the near ground outside cascade 0. March the real camera
  rays. `src/tools/probes/shadowcoord.mts` does, and says why in its header.
- **`g.step()` does not exist**; the harness API is `g.settle(frames)`. And a
  bare `g.renderer.render(...)` from a probe triggers a framebuffer feedback loop
  against the post chain's bound target and floods the console — `settle` renders
  for you.

---

## Blind A/B round 4 — `tmp/ab/r4/`, seed 4417, six pairs

Shots: `vista_noon`, `vista_dusk`, `zone_longwythe`, `zone_three_valleys`,
`zone_nebulawood`, `zone_galdin`.

**6 identified, 0 fooled, 0 hesitated, all six HIGH. Score 3/10.** Round 3 was
also 6 / 0 / 0 and 3/10, and round 2 was 6 / 0 / 0 with five HIGH and one
MEDIUM. **The win rate and the hesitation rate did not move.**

**What moved is the defect ranking, and that is the result this round is for.**
Round 3's number one was *"no shadowing of any kind"*. In round 4 that sentence
does not appear. It has split into two much weaker items, third and ninth:

| round 3 | round 4 |
|---|---|
| **1. no shadowing of any kind** | **gone as stated.** Now 3rd — *"no ambient occlusion or contact shadowing… rocks sit on the ground like decals, dead trees and boulders float, trunks meet grass with no root darkening"* — and 9th — *"shadows are uniform-density hard blobs from one directional light, no penumbra variation and no bounce light filling them"*. |
| 2. terrain material: tiling, seams, smear | now 2nd, wording unchanged in substance |
| — | **new 1st: vegetation is flat cards and alpha-cut clumps with no silhouette variety**, called out as failing *"at every distance simultaneously"* |

Note the shape of the change: the judge now **grants that cast shadows exist**
and complains about their *quality* — no penumbra, no bounce fill. That is a
different and much later-stage complaint than "none of any kind", and both of
its halves are actionable (see open items).

**A weakness in this round's design, recorded because it inflates nothing and
deflates the result.** `compare.mts`'s `PAIRING` table does not contain
`zone_fallgrove` or `zone_vannath` — the two shots where this lane's fix is most
dramatic — so I chose six that are all in `PAIRING`. Of those six,
`zone_longwythe` and `zone_three_valleys` are bare Leide where the fix does
almost nothing *by design*, `zone_nebulawood` is overcast with no sun at all, and
`zone_galdin` is coastal. **Round 4 substantially under-samples the change it was
run to measure.** Round 5 should add `zone_fallgrove` and `zone_vannath` rows to
`PAIRING` first. Round 3's shot set is not recorded anywhere either, so rounds 3
and 4 are not strictly comparable on shot selection — that should be fixed by
writing the set into the round's directory.

The judge also re-reported, unprompted, **the untextured placeholder props the
atmosphere lane flagged after round 2**: *"a grey lattice tower, a chrome-black
sphere and a red box with a clipped garish texture"* in `vista_noon`, ranked 4th
and described as ending the guess instantly. **Two rounds later they are still in
frame.** That is the cheapest remaining point in the whole environment and it is
nobody's lane right now.

**On the wording.** The previous handoff required round 4 to reuse round 2's
prompt verbatim, because round 3's judge was told "do not hedge" — a direct
instruction against the hesitation metric it was measuring. **Round 2's wording
is not written down anywhere in the repo; I searched.** It is, however,
effectively preserved: `compare.mts` prints the canonical question at the end of
every build, and it is what round 2 used —

> "One of these two panels is a shipped PS4 game and the other is a WebGL demo.
> Which is which, how confident are you, and what gave it away?"

No "do not hedge", no "do not be generous". The judge was given exactly that,
told CANNOT TELL is a legitimate answer, told to report real confidence in both
directions, and given nothing but the six composites — no repo access, no
documents. **Round 5 should use `compare.mts`'s own printed question. That it
lives in the tool rather than in a handoff is what makes it survivable.**

---

## Open items, handed over rather than chased

0. **The judge's two live shadow complaints, both in this lane, both unstarted.**
   *"No penumbra variation"* — `shadow.radius` is never set anywhere in `src/`
   and sits at three's default `1`, with `shadowMap.type = PCFShadowMap`. A
   contact-hardening term (penumbra growing with occluder distance) is the FFXV
   look and is the single highest-value thing left here. *"No bounce light
   filling the shadows"* — the shaded ground goes to a dead flat brown because
   the only fill is one `HemisphereLight` at 0.16 intensity. Both want measuring
   against the plates before either is tuned.
1. **Leide is bare and it is now the loudest remaining environment defect.**
   `zone_longwythe` and `zone_three_valleys` barely moved on any `reliefstat`
   band, because there is almost nothing in them to cast. `bioGreen ≈ 0` so the
   grass rings and the tier-D sward are correctly off, but shipped FFXV's
   Longwythe is dense scrub for the first ten metres and scattered rock and dead
   scrub beyond it. **Confirmed by eye** in `tmp/shots/sh-cast/zone_longwythe.jpg`
   against `docs/reference/plates/duscae-wilderness-04.jpg`. That is a
   `src/world/veg/Biomes.ts` density question and it is not this lane.
2. **`maxFar: 190` caps every shadow at 190 m.** Past it, `getShadow`'s frustum
   test fails and the ground is unconditionally lit. In these shots the visible
   ground runs to 500 m and beyond, so **over half of it can never be shadowed**.
   FFXV's establishing plates have tree shadows across a whole valley. Raising
   `maxFar` alone would just dilute the texels; the honest fix is a fourth
   cascade or a coarse long-range shadow term, and it wants measuring before
   anybody spends the memory. **In this lane, and not done.**
3. **The horizon bake's fade band is calibrated to a cascade range that no longer
   exists.** `TerrainMaterial.ts:1569-1572` sets `uHorizonMix = (1,1,300,620)`
   with a comment saying "the fade band starts at the cascade far plane (320 m)",
   while `Sky.ts` sets `maxFar: 190`. Between 190 m and 300 m neither the
   cascades nor the horizon bake shadow the terrain at full strength. Terrain
   lane's file, this lane's number.
4. **CSM's texel snap uses the wrong map size for the outer cascades.**
   `CSM.update()` snaps on `(right-left)/this.shadowMapSize` with the single
   constructor value (2048), but `Sky.ts` overrides cascades 1 and 2 to `res/2`.
   They snap to a half-texel grid relative to their real resolution — sub-texel
   drift when the camera moves. Not visible in stills; check it in motion.
5. **Our frames never reach white** (atmosphere lane's item). Unchanged by this
   work, and it interacts with how shadows read: `clip%` is still 0.00 on four of
   six.

---

## Gates

`PORT=5460 npm run check`: **11/11**. `anycheck` 0. `horizoncheck` PASS at worst
MCC 0.766 (the coordinator already explained that number: it moved with the
Hammerhead merge and is not a regression). `combatloop` **31/31**.

**Read that `PORT=` — a plain `npm run check` gave me 10/11 with `combatloop`
FAIL, and it was not a regression.** `combatloop.mts:24` hard-codes
`PORT || 5199`, and it is not a `needsServer` gate, so `check.mts` does not hand
it the aux port it found — it inherits the environment and goes to 5199, which
tonight is a co-agent's dev server. `assertOwnPort` correctly refuses the foreign
server and the gate dies in 0.4 s with a Node stack, which reads in the summary
table as a combat regression. It passes 31/31 standalone and 31/31 under `check`
the moment `PORT` points somewhere free.

**This is the same bug `check.mts`'s own comments describe for `heightcheck` and
`driftcheck`** — the one that "cost two separate lanes an investigation tonight
before anyone noticed the two gates were not failing, they were never running."
Those two were fixed by giving them a `freePort` aux server. `combatloop` was
not, because it starts its own; but starting your own on a hard-coded port is the
same assumption. The fix is to give `combatloop.mts` the `freePort` scan the aux
server already has. **Until then, run `npm run check` with an explicit free
`PORT` and do not believe a 0.4-second `combatloop` failure.**

Also note the table's `expect: '30/30'` for `combatloop` is stale display text —
the gate now verifies 31 mechanics and reports `31/31`. It is not asserted
against, so nothing breaks, but the summary line lies about the target.

`npm run typecheck` and `npm run typecheck:tools` both clean.

## Files touched

- `src/world/Sky.ts` — `_splitCascades`, `_nearGround`, `_csmNear`, the `?post=`
  parse moved to the top of `init` (two tokens must land before the first
  program compiles), `?post=nomask`, `?post=nearsplit`.
- `src/world/veg/Trees.ts:370` — **another lane's file.** One flag.
- `src/world/props/Rocks.ts:781` — **another lane's file.** One flag.
- `src/tools/probes/shadowstate.mts`, `shadowcoord.mts`, `casters.mts` — new.
- this file.

Nothing under `src/engine/postfx/`, `src/engine/PostFX.ts`,
`src/engine/LightBudget.ts` or `src/world/sky/` was edited — the contact-shadow
pass and the light budget were read and left alone. The contact pass is a
different mechanism from the cascades and was not implicated.

## Shots that show the current state

- `tmp/shots/sh-base/` — the baseline as inherited, six shots, JPEG.
- `tmp/shots/sh-cast/` — the same six after. `zone_vannath.jpg` and
  `zone_fallgrove.jpg` are the pair that carries the argument: a cast shadow
  under every tree on the plain, and raking shadows across the grove floor.
- `tmp/heat-nomask/zone_fallgrove.png` — the heat map that named it. The shadow
  term lights up the *trees* and almost none of the ground.
- `tmp/shots/rs-before/` vs `tmp/shots/rs-after/` — the PNG pair the `reliefstat`
  and `imagestats` tables above are taken from.
- `tmp/ab/r4/` — blind A/B round 4, six pairs, seed 4417, sealed key.

---

## My honest grade for the environment, against shipped FFXV

**4 / 10.** A point above the judge, and I will say exactly what the point is for
and what it is not for.

The point is for the thing this lane was sent to fix, and it is fixed. Three
rounds of blind judging said there was no shadowing of any kind, and there
genuinely was not — 93% of the trees in a wooded frame were flagged not to cast.
There now is: `zone_vannath` has a shadow under every tree on the plain and
`zone_fallgrove` has raking shadows across the whole grove floor, and the
contrast the eye reads material by closed from 66–69% of the reference to 74–78%
across d4/d8/d16. I looked at both frames myself. The judge no longer writes the
sentence.

What keeps it at 4 rather than higher is that the same judge, looking at the same
six frames, immediately promoted something else to first — *"vegetation is flat
cards and alpha-cut clumps with no silhouette variety… it fails at every distance
simultaneously"* — and it is right. Giving the impostors a shadow made the world
sit down on the ground; it did not make the impostors into trees. And two of the
six frames I put in front of it are bare Leide, where I can see for myself
against `duscae-wilderness-04.jpg` that the reference is dense scrub for the
first ten metres and ours is empty dirt.

The honest read is that this lane has done what it was asked — moved shadowing
from first place to third and ninth, and moved it from "absent" to "present but
hard-edged" — and that the two things now costing us more are both vegetation:
what the far LOD *is*, and how much of it Leide has. Neither is this lane's, and
neither is a rendering problem.
