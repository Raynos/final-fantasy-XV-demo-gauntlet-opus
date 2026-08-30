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
