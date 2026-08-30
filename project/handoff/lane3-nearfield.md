# Lane 3 — Near-field and composition

**Shots.ts: RELEASED at e5db679** — lane 21 may take it. Format contract
unchanged: 2-space indent, `{` on the key line, single-line `doc:`, category
headers as `// --- name ---`, character/UI shots first and cutscenes last.

Plan: `docs/plans/2026-08-30-fable-to-nine.md` items 11–14. Owns `src/game/Shots.ts`
(exclusive, rule 6) and `src/world/veg/**` seating.

## Measured baseline (verified, 2026-08-30, sha 096d739)

`framedepth` on the target shots — distance from camera to ground through the
**bottom centre of frame**, and camera clearance above its own ground:

| shot | camY | aboveGround | centre-hit | **bottom-hit** | b/c |
|---|---|---|---|---|---|
| zone_longwythe | 52.2 | 35.4 | 582 | **100** | 0.17 |
| zone_vannath | 49.2 | 22.9 | 454 | **59** | 0.13 |
| zone_three_valleys | 79.2 | 50.0 | 377 | **121** | 0.32 |
| vista_dusk | 40.0 | 26.8 | 1017 | **103** | 0.10 |
| zone_lestallum | 159.2 | 26.0 | 800 | **70** | 0.09 |
| vista_dawn | 143.0 | 13.5 | 3421 | **20** | 0.01 |
| hero_full | 6.1 | 1.3 | 9 | **3** | 0.33 |

**This is the whole lane in one table.** Grass geometry exists only to 155 m and
only the blade ring (0–26 m) has real silhouette. `vista_dawn` — the one frame
that ever stalled the judge — is the ONLY vista whose bottom of frame lands
inside the blade ring (20 m). Every other vista's bottom third is terrain at
59–121 m, i.e. past the clump ring, which is why it reads bare.

The lever is **camera clearance**, not aim: bottom-hit ≈ clearance / tan(|pitch|
+ fov/2), and the tan term is 0.26–0.48 across these shots. Dropping clearance
to 8–12 m puts bottom-of-frame at 22–34 m on all five, for zero draw cost.

Draw calls at baseline (budget 800): longwythe 503, vannath 637, three_valleys
428, vista_dusk 564, lestallum 670, vista_dawn 642, hero_full 550. **Headroom is
thin on lestallum/vannath — reframing must not add rings.**

## VERIFIED: `vista_dawn` is currently ruined

Read `tmp/shots/l3-base/vista_dawn.jpg`: the frame is almost entirely **inside a
tree crown** — a dark olive wall of leaf cards filling 100% of frame, a magenta
trunk bottom-left, a sliver of dawn sky bottom-centre. 17.8 M tris, the heaviest
shot in the set. The "existing world tree the camera was placed against" has
grown/moved over it. This is a Shots.ts framing fix and it is the highest-value
single item in the lane.

## VERIFIED: the star tufts are `grass_clump`, not blades

Ablation on `hero_full`, `--raw` both sides (floor 2.25):

- `--hide grass_blade` → mean **1.830**/255, 4.03% of pixels — *under floor*.
- `--hide grass_clump` → mean **16.734**/255, 35.34% of pixels — *8x over floor*.

So the star rosettes at the party's feet are the **cross-card clump ring**
rendering at 0–20 m, not blade splay. `_makeTile`'s `lean` is bounded at 0.58 rad
and is innocent; do not touch it.

**Mechanism (read at `GrassField.ts:927`):**

    if (near > 0 && dist < near - T * 0.75) continue;

For the clump ring `near = 21`, `tile = 24`, so the test admits any tile whose
CENTRE is ≥ 3 m from the camera — and that tile spans ±12 m, so clump cards are
drawn **from 0 m**. A clump card is 3 crossed vertical quads each painting a
whole tuft; seen from a camera 6 m up it reads as a 6-armed asterisk. The same
arithmetic puts far cards (near 78, tile 48 → 42 m centres) from 18 m out.

Cropped at 3x (`tmp/shots/l3-abl/crop-a.png` vs `crop-noclump.png`): with clumps
on, the near ground is a mat of flat pale-green arrowheads; with clumps hidden it
is bare cracked dirt with a scatter of thin hair-like blades. **Neither is
right** — pushing the clump ring out is necessary but not sufficient; the blade
ring has to carry 0–26 m afterwards.


## What landed, and what it looks like (all verified by reading the JPEG)

**`e5db679` — Shots.ts, four re-framings.** RELEASED to lane 21 at this sha.

- **`vista_dawn`** moved 150 m forward along its own view axis to the scarp lip:
  `pos [-502.1, 146.2, 371]`. Read `tmp/shots/l3-after/vista_dawn.jpg`: dawn over
  the basin with a mist layer lying across it, the Insomnia skyline strung along
  the far volcanic mesa on the left, a butte at centre, the sun breaking through
  cloud on the right, boulders receding into haze across the pan, and a dark
  thorn branch crossing the bottom-left corner as a foreground occluder. This is
  the best landscape frame I have seen in this project and it replaces an
  unusable one. 618 draws, 17.4 M tris.
- **`zone_three_valleys`** clearance 50 → 20 m. The Insomnia skyline now reads
  clean against blue where a cloud used to eat half of it; a hoodoo, a dead tree
  and wheel ruts give the midground something to land on. 431 draws.
- **`zone_vannath`** clearance 22.9 → 18 m. Sunlit dry prairie with savanna
  trees, boulders and the balanced monolith against the hero peaks; the
  information-free shadow band across the bottom third is gone. 595 draws.
- **`zone_lestallum`** clearance 26 → 18 m. Town, smokestack and aqueduct arches
  read at size against a tree band that silhouettes properly. The lower third is
  still crushed dark green — that is a lighting item, not a framing one. 656
  draws (the highest in my set; budget 800).
- **`zone_longwythe` and `vista_dusk` deliberately unchanged** — see the negative
  below.

**`03089ba` — GrassField.ts, the near ring test.** Clean A/B against its own
parent (only that file differs), PNG, `imgdiff`:

| shot | mean | pixels >8/255 | floor | draws before → after |
|---|---|---|---|---|
| `hero_full` | **23.201**/255 | 53.77% | 2.25 | 549 → 541 |
| `zone_longwythe` | 0.715/255 | 0.72% | 1.23 | 503 → 496 |

Exactly the expected signature: a large change confined to the near field, none
at all on a shot whose bottom of frame is 100 m out, and eight FEWER draw calls
because both card rings now skip the tiles they should never have had. Tris
+300 k on `hero_full` from the extra blades.

Looking at `tmp/shots/l3-after/hero_full.jpg`: **the star tufts are gone.** The
ground under the party now reads as dry straw stubble over cracked Leide dirt
with a scatter of real tussocks catching light on the left, where before it was
a mat of flat pale-green six-armed rosettes. Not yet beautiful — see below — but
no longer wrong.

## MEASURED NEGATIVE — camera clearance does not put grass in the bottom third

This was the lane's opening thesis and it is refuted. Twenty candidates over five
shots (7, 10, 14, 18 and 20 m of clearance against baselines of 22.9-50 m), read
one at a time by two independent look-loops: **individual grass blades appear in
the bottom third of none of them.** What the near ground actually contains is
dirt with sparse scrub dots in Leide and a crushed near-black olive mat in the
green zones, at every clearance, and in the green zones a lower camera makes it
*worse* by giving the mat more of the frame.

`bottom-hit` is a real number and the arithmetic behind it is right; what was
wrong was the inference that ground inside 26 m therefore reads as grass. It does
not, because a Leide tuft is 0.12-0.29 m and the blade ring is sparse, and
because the thing that WAS covering the near field was the mis-ringed clump card.

`zone_longwythe` is a second, smaller negative worth recording as contested
rather than settled: one look-loop scored 7 m of clearance 4/5 against the 35 m
baseline's 3/5 for the foreground rock stack it promotes; the other kept the
baseline for the layered ridges, the meteor, the skyline and the rest stop. A
contested re-framing is not worth the noise-floor re-baseline, so it stayed.

## Left / residue

- **Foreground occluders on the other judged vistas (task 13)** — `vista_dawn`
  has one now. `vista_night` and `zone_vesperpool` already had one. The rest do
  not, and the recipe is `vista_dawn`'s own: place the camera against an existing
  world tree rather than authoring a prop. **This needs `Shots.ts`, which I have
  released**, so it is residue for whoever holds it next.
- **The near field is correct but not yet beautiful.** With the cards pushed back
  to 22 m the blade ring is alone in 0-22 m and reads as ground texture rather
  than plants. Levers examined and NOT taken, with reasons: blade `lean` is
  bounded at 0.58 rad and is innocent (ablation); Leide's tuft height is
  authored and `Biomes.ts` says in terms not to "improve" it; `hero_full` sits
  inside `scrubDensity`'s road corridor (`roadDist` ramp 3.4-13 m) and its
  clearing mask, so its bareness is partly correct. The unexamined lever is
  `swardProxyGeo` coverage — the caster gate is `hTuft > 0.16 * lod.hMul`, an
  ABSOLUTE metre threshold despite a comment claiming it scales with the zone,
  and Leide's mean tuft is 0.138 m, so only the top ~35% of tufts cast anything.
  Ablate the sward proxy on `hero_full` before touching it.
- **Task 14 (midground) not started** — it is a refuted claim in the plan and
  only acts if a later judged round ranks it.

## Done / left

- [x] Baseline measured (framedepth, vegcensus, draw counts) — verified
- [x] Star-tuft carrier named by ablation — verified
- [ ] Reframe pass in Shots.ts + noise-floor recalibration → **release Shots.ts**
- [ ] Clump-ring near clamp + blade-ring near-field density
- [ ] Occluders per judged vista

## Next step

Derive candidate framings with `framecam.mts` (never hand-write coordinates),
targeting bottom-of-frame 20–34 m on the five vistas, and a clean vista_dawn.

## Files

Owned: `src/game/Shots.ts`, `src/world/veg/**`.
Touched so far: none (measurement only).
