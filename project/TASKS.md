# Task list

**The backlog.** Everything measured, named and not done, one line each. No
prose, no argument — the argument is in the named handoff under
`archive/handoff/`. Delete a line when it is done or when it stops being true.

Unlike a plan, this file is **allowed to live forever**. It is a tracker, which
is what `docs/plans/README.md` says belongs in `project/` rather than in a plan.
Nothing here is committed to; nobody is assigned.

## Memory — 1.5 GB the tab, 2.5 GB the tree

- **181 MB of render targets across 33** — the biggest remaining lever. `PostFX`. `memory-cut`
- `AttrPack` does not reach the 116 POI sites that stream in during play. `memory-cut`
- `skinWeight` is 20.4 MB of `4x Float32`; glTF ships `Uint8` everywhere. ~15 MB. `memory-cut`
- ~570 MB of renderer is attributed but not recoverable — it mirrors GPU allocations at 0.70 MB per MB. `memory-cut`

## CPU and boot

- **`post.render` is 74–77% of the frame and is the only idle-CPU lever left on a 60 Hz panel** — the 60 cap helps 120 Hz only. `runtime-facts`
- Boot blocks are still seconds: `Vegetation` 1.3 s, `Dungeons` 1.2 s, `Props` 1.2 s. Chunk inside those loops; `yieldToBrowser()` is exported for it. `runtime-facts`
- **85.5 MB on the wire on a first visit** — 0.3 s local, ~14 s on 50 Mbit. Streaming the bake or a low-res first tier. `runtime-facts`
- Character LOD untouched: `town_forecourt` 465 calls / 5.33 M triangles, one `SkinnedMesh` bucket at 60 calls / 1.74 M tris / 28 940 per draw. Headroom, not cost. `materials`
- Water's reflection pass spends ~40 draws on shots with no visible water (`Water._visible` tests a bbox only). `perf-r4`
- NPC eye globes + contact-shadow blobs, ~28 draws. The two globes cannot merge — independent gaze pivots. `perf-r4`
- 22 dedupable programs in `src/characters/rig/` (`char2-eye<N>`, eye `gloss` is a GLSL literal). `materials`
- Wave 3's frame-cost split, pixel-scaled vs fixed. Recipe written, never run. `perf-r4`

## Terrain and water

- **`zone_mencemoor`'s corduroy** — the ensemble of five `ridged2` generators in one `strikeFrame`. Needs per-octave anisotropy across all five, and **no instrument measures directional statistics**. `terrain-r3`
- The discharge proxy is **zero on 85.8% of stations**, so most of the network is the minimum channel. Lowering the 0.88 pivot retunes every river in the world. `confluence`
- More than two confluences needs the heightfield's drainage, not `River.ts` — 40-point sweep, never more than one junction that widens. `confluence`
- **The shallow-reach river material** reads as a transparent grey sheet over gravel with pill-shaped foam. Three lanes have now recorded it. `confluence`
- `Water.surfaceAt` knows nothing about rivers and is a bbox scan; `Fishing` and `PoiKits._waterNear` each hold their own copy. `WaterMask.levelAt` is the single answer. Folding them in moves fishing survey results. `veg-water`
- `Bushes`' reed/lily lattice has the same 8 m interpolation problem grass had. `veg-water`
- `treeDensity` allows 30 cm of water, written for a coast — reads as willows at a tarn edge. One number. `veg-water`
- **Malacchi Pond has no pond** — nearest water 133.5 m away and 28 m below. Named for water `_findTarns` never gave it. `poi-seat`
- Boulders under Crestholm outside `Ecology.rockScatter` — ~23 instances deeper than 1.2 m. Half-submerged in a *stream* is wanted; a spire under two metres of reservoir is not. `veg-water`

## Props and art

- **`gradePad` writes world-planar XZ UVs** (`Wear.ts`) — a batter's texture varies with radius, not height: **16:1 vertical stretch** on the cliff branch. This is the "smeared striations / pasted on" two independent reviews reported. Touches every apron. `poi-seat`
- **The Meteor's fissure glow has never rendered** — all 22 slabs entombed inside overlapping masses. Reading at 1.7 km needs veins across the visible faces at tens of metres: an art round. `props-r4`
- The Disc reads as a pale rock dome, lighter than every ridge in front of it. Both levers WS-13 named are measured negatives. `props-r4`
- `crestholm_inlet` is the world's worst apron at 11.36 m. A seat that lands is 45 m off — but Ostium Gorge is a *parking bay*, and moving it turns a lay-by into a clearing. Content decision. `poi-seat`
- `balouve_mines` 7.09 m — a dungeon mouth, cannot move. `poi-seat`
- The Tomb of the Mystic's mausoleum may be broken as well as steep: the pediment appears to hover on column stubs. `_tomb` snaps ~16% of columns deliberately, so *probably* the authored ruin. Seen twice. `poi-seat`

## Characters — all from the head lane, passes 3–6

- **Every painted brush and painted AO on the head was authored while the face was culled** — tuned against the inside of a skull. Pass 6 softened 30–45%; the frame says not nearly enough. Consider re-authoring.
- The hair covers most of the far eye (`len`, not direction) and reads as flat ribbons at 0.55 m. The pixel arithmetic was never acted on: a 1.5 mm lock at 4 m is **0.7 px**.
- `euEu` **162.5 mm** against a real 152 — the lower face is heavy for a slim twenty-year-old.
- **`facewind`'s negative signed volume on `Noctis_body`, `_hair`, `_outfit` and both eye meshes is still unchecked.** Two passes estimated ten minutes; neither spent them. This class of bug beat five passes.
- Ignis is untouched — one black column, no hem line, lapel thickness or collar break.
- The sleeve cut: real work on `piece('sleeve')`. Three attempts at it as a *surface* are a recorded negative.
- Noctis's skull print is vertex-coloured on a 42×76 shirt sweep and smears at 0.95 m.
- A hole at Noctis's collar; `_probe/hands.mts`'s `_palm*` framings are inside the geometry — nothing has ever looked at a palm.

## Harness and housekeeping

- **`daemon.mts --wait` exits 0 whether the condition held or it gave up.** A lane took a perf number on a 4/4-busy box because of it. Needs a distinct exit code.
- `project/archive/handoff/` is at 90 files and nothing prunes it.
- No judge round since **16** (2026-08-27). Everything since is unmeasured against the bar.
