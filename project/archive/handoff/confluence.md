# confluence — river routing merges where the drainage merges

Owner: the `confluence` lane, 2026-08-28. Directories: `src/world/water/River.ts`
and the routing side of `src/world/Water.ts`. Funded directly by the human as one
defect; no plan file, and none should be made.

**The row is finished.** Confluences exist, are counted, and have been looked at.
The reported defect turned out to be two defects wearing one name, and both are
closed. Everything below carries the number that decided it.

---

## The reported defect was misdiagnosed, and the misdiagnosis was the whole story

`terrain-r3` reported *"braided reaches overlap as translucent panels"* in
`tmp/shots/t3riv-f2/r-pmax.jpg`, and reported it as routing work: two rivers
crossing without merging, 7 sources and 0 confluences.

**No two of the seven traces came within 782 m of each other.**
(`tmp/conf/pairs.mts` — full pairwise minimum-distance table.) The truncation
branch in `buildRivers` tests at 26 m, so it was unreachable code from the day it
was written; `confluences: 0` was arithmetic, not scenery.

The overlapping panels are **one reach crossing itself**. Measured on the built
sheet (`tmp/conf/self.mts`): **3 060 station pairs at least 60 m apart in arc
length yet inside their own combined half-widths**, worst pair overlapping by
25 m, on four of the seven reaches. Reach 1 ran 1 389 m between points 425 m
apart (sinuosity 3.27); reach 3 ran 303 m between points **32 m** apart
(sinuosity 9.37) — an inertial walk spiralling in a hollow, three and four
ribbons deep.

---

## Row 1 — the self-overlap: LANDED (`de7fa2b`)

A river that meets itself cuts the neck and abandons the loop, which is where
oxbow lakes come from. `cutOxbows` splices the loop out at the **discharge cap**,
because that is the width the sheet is actually drawn to, and repeats because one
line holds several.

| | before | after |
|---|---|---|
| self-overlapping station pairs | 3 060 | **0** |
| folded triangles | 866 | **79** |
| reaches | 7 | 6 (the sinuosity-9.4 spiral is gone) |
| network | 5 793 m | 4 254 m (1 470 m of it was loop) |

Verified by measurement, and by eye in `tmp/shots/conf2/` — no crossing
translucent panels in any of the six frames.

## Row 2 — confluences: LANDED, 0 → 2 (`85866ad`, `36d8ccf`)

Three things had to be true and none was.

1. **The walk leaves the drainage network and then stalls on a hillside.** Of 24
   traces, **17 stalled** and 5 reached the sea, with a mean end-`accum` of
   **0.782** and individual ends at 0.238, 0.401, 0.469 (`tmp/conf/stop.mts`).
   That is not a river running out of fall. The step now takes half its lateral
   offset toward the *wettest* cell across the channel as well as toward the
   lowest (`NET_PULL`/`NET_REACH`), and the stall test asks whether there is
   still a channel here before firing (`STALL_ON_NET`). Stalls **17 → 13**, mean
   trace **814 → 1 230 m**, trace pairs meeting within a channel width **6 → 8**.
2. **Sources 700 m apart cannot meet.** `sourceSep` 700 → **260**,
   `maxReaches` 7 → **10**: the smallest pair on this map giving two confluences
   whose trunk is wider below than either arm. Both are `RiverOpts` options.
3. **The join.** Longest line first (trace order picked by source accumulation
   would have cut a 1.3 km trunk at a 300 m stub's mouth); meeting radius is the
   two channels' own half-widths rather than a flat 26 m, so the mouths land
   **tangent** instead of twenty metres short; a tributary contributing less than
   `MIN_REACH` of its own channel is deduplication and is not counted; nor is one
   landing on the last 90 m of its trunk, where there is no downstream left.

### And the discharge is summed in channel width, not in `q` — measured

Width goes as the square root of discharge, so what adds at a junction is
width², and two equal arms make a trunk 1.41× wider rather than 2×. But `q` is
`clamp((accum − 0.88)/0.115)`, which is **zero on everything below the 88th
percentile of wet cells**: the `accum` term binds the discharge on **85.8%** of
stations (`tmp/conf/gate.mts`) and reads **0.00 on the arriving tributary at both
real confluences**. Summing `q²` there was arithmetically nothing, and the
ablation proved it — `sumDischarge: false` returned byte-identical widths.
Summing `halfWidthCap` instead, 2.5 m floor and all, is what makes the junction
show. The ablation switch is kept.

| junction | trib | trunk below | width above + trib → below | depth above → below |
|---|---|---|---|---|
| (−74.8, −1229.6), 53° | 1 161 m | 804 m | 4.4 + 3.9 → **8.6 m** | 0.58 → 0.55 |
| (−405.9, −902.3), 89° | 210 m | 627 m | 5.2 + 3.2 → **10.4 m** | 0.62 → **0.98** |

Both come out **wider below than either arm above**; the second is also half a
metre deeper. Without the width-space summation they were 7.2 and 9.3 m.

`RiverJoin` is the report, returned from `buildRivers` and published on
`Water.riverJoins`, because **no corpus shot can frame a confluence** — every
corpus shoreline is 250 m+ from camera — so a probe has to derive its pose from
the junction list.

### Final build

```
sources 10 · reaches 10 · dropped 0 · confluences 2 · oxbows 17 (5 364 m)
network 6 303 m · mean width 5.81 m · mean depth 0.61 m · max 31.92 / 6.81
water 41 933 tris · bank 33 403 · folded 300 (0.7%) · degenerate 0 · downFacing 0
self-overlapping station pairs 0 · cross-reach overlapping station pairs 0
```

---

## What I looked at, and what it reads as

`tmp/shots/conf2/c-c1-near.jpg` and `conf3/c-c1-tight.jpg` — the 89° junction,
framed from below it looking back up so the two arms open toward camera.
**It reads as one river taking in another**: the trunk comes down the centre, a
tributary arrives from the left, and the channel in the foreground is visibly the
wider of the three. `conf1/j-j0-air.jpg` shows the 53° junction from the air as a
clean Y with no crossing panels anywhere in frame.

**What it does not read as is a river.** The water is a near-transparent grey
sheet over gravel — a wet wash, not water — and the foam is a scatter of white
pill shapes. That is the shallow-reach appearance defect three lanes have now
recorded (`water-fix.md`, `water-content.md`, `terrain-r3.md`), it is
`RiverMaterial` and depth rather than routing, and it is **not** mine. Also
visible and not mine: **grass grows through the merged channel** in the tight
frame — `Ecology`, already being worked by the lane that landed
`probes/vegwater.mts` and `water/WaterMask.ts`.

## Open, and honestly bounded

1. **This map has two confluences and will not have many more.** Swept
   `maxReaches` × `sourceSep` × `sourceAccum` over 40 combinations
   (`tmp/conf/sweep2.mts`): even at **44 sources** the best is 3–5 counted
   junctions and never more than **one** that widens. Beyond about 24 sources
   the traces are duplicates of channels already drawn and the water triangle
   count doubles for nothing. If more confluences are wanted the lever is the
   *heightfield's* drainage, not this file.
2. **Junctions cluster near reach ends.** At 24 sources, three of four meetings
   had under 90 m of trunk below them — both traces were terminating in the same
   place. `minJoinRun` exists so those are not miscounted as confluences.
3. **The discharge proxy is zero on 85.8% of stations.** `(accum − 0.88)/0.115`
   means the 88th percentile of wet cells is the floor of "has any width at
   all", and most of the traced network sits under it — which is why mean width
   is 5.8 m against a 5.0 m floor, i.e. most of the river is the minimum
   channel. Lowering that pivot would widen every river in the world; it is a
   world-visible retune and I did not take it on a defect ticket.

## Files

`src/world/water/River.ts` (all of the above) · `src/world/Water.ts`
(`riverJoins` only).

## Instruments left

| what | where |
|---|---|
| build the `Field` once, hand `buildRivers` a `RiverGround` under node | `tmp/conf/lib.mts` |
| pairwise closest approach of every trace | `tmp/conf/pairs.mts` |
| self- and cross-reach overlap census on the built sheet | `tmp/conf/self.mts`, `cross.mts` |
| why each trace stops, and the end-`accum` when it does | `tmp/conf/stop.mts` |
| which term binds the discharge | `tmp/conf/gate.mts` |
| the routing sweep, and the summation ablation | `tmp/conf/sweep2.mts`, `ab.mts` |
| confluence close-ups, poses derived from `Water.riverJoins` | `tmp/conf/look.mts`, `look2.mts` |

`tmp/` is free to delete; `RiverJoin` on `buildRivers` is the part that survives.

## Gates

- **`pnpm run check` 19/19 in 197.5 s**, on a busy dirty tree carrying three
  other lanes' in-flight work. The two that matter here are green:
  **`hydrocheck` PASS** — 4 channels are percentiles and every lift clears the
  null — and **`integration` PASS** with **8 holes with water**. `driftcheck`,
  `heightcheck` and `floatcheck` PASS, which is what says the routing move did
  not disturb the ground under it. Perf gates skipped and **not claimed**: the
  machine was busy and a perf number taken then is meaningless.
- **`nanscan` 0 of 142** (`{"shots":142,"hits":[]}`). No shader was edited here —
  the change is entirely CPU-side geometry — but it was run anyway.
- **Cold captures taken after every change**, per the `--cold`-only rule: a GLSL
  link failure is invisible warm. All six confluence frames exited 0.
- **The corpus did not move, and the diff had to be taken per commit to say so.**
  Four shots most exposed to a river move — `hero_full`, `zone_vannath`,
  `zone_longwythe`, `vista_noon` — **cold on both sides**, against each of my two
  commits' own parents rather than across a span:

      oxbow    9571915 -> de7fa2b     confluence  a603f4c -> 85866ad
      hero_full       1.968  floor 2.25      hero_full       1.986  floor 2.25
      zone_longwythe  0.423  floor 1.23      zone_longwythe  0.429  floor 1.23
      zone_vannath    0.289  floor 2.00      zone_vannath    0.294  floor 2.00
      vista_noon      0.116  floor 0.39      vista_noon      0.117  floor 0.39

  **0 of 4 over their own cold floor on both**, and the two columns agreeing to
  three decimals is itself the tell: that residual is boot-to-boot TAA, not the
  routing. **Do not diff across a span on this trunk** — the same four shots
  across the 277 commits since this lane opened come back at a mean of **47/255**
  on `hero_full` with 87% of pixels moved, all of it other lanes' vegetation and
  water-mask work. That number says nothing about anything and is easy to
  mis-attribute.
