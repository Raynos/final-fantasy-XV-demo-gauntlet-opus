# rockseat — the joint seat, and the gate that could not see it

**Owner:** the `rockseat` lane, 2026-08-28. **Owns** `src/world/props/`.
**Predecessor:** `project/archive/handoff/landmarks-r2.md` — its open item 2 is
what this lane took. Nothing else in it is redone here.

Every claim is marked **VERIFIED BY EYE**, **MEASURED** or **UNVERIFIED**.

---

## The lane's one job, done

`zone_longwythe`'s near foreground had a three-course corestone stack with its
top boulder **completely detached** — sky visible all round it, its own cast
shadow on the block below — and a second void at the waist. `poi_imperial` had
the same defect on a tor. Both are closed and **VERIFIED BY EYE**:

| | before (`8640db9`) | after (`a23a3f6`) |
|---|---|---|
| the Longwythe stack, 3× | `tmp/rockseat/before.png` | `tmp/rockseat/after.png` |
| the imperial tor, 5× | `tmp/rockseat/imp-before.png` | `tmp/rockseat/imp-after.png` |
| full frames | `tmp/shots/rs-before2/` | `tmp/shots/rs-after/` |

The stack now reads as three courses in contact with a shadow seam at each
joint; the imperial tor reads as one mass instead of a cap hanging over a shaft.

## Landed

| sha | what | state |
|---|---|---|
| `8640db9` | `probes/stackjoint.mts` raycasts the placed triangles; `hullExtents` returns face heights | **MEASURED** |
| `a23a3f6` | the three plan sites seat on the faces; the inverted `clear` branch is replaced | **MEASURED** + **VERIFIED BY EYE** |
| `f396cc8` | this handoff | — |
| `84bdaa1` | `probes/tombsight.mts` — `poi_tomb` sees 2.8 m of a 13 m temple | **MEASURED** |
| `8aee74b` | `probes/outcropjoint.mts` — the third joint site gets its first instrument | **MEASURED** |
| `6c2e0b7` | a tor is delivered at the height `arch.h` states, repaying the seat's skyline cost | **MEASURED** + **VERIFIED BY EYE** |

### Gates at HEAD

- **`pnpm run check` 19/19.** One caveat worth carrying: `creaturecheck` went
  red once mid-lane and passed on a re-run with nothing changed — the
  `creatures` lane is live on the same trunk. Re-run before reading a red there
  as yours.
- **`floatcheck` PASS** — `poiFloating` 0/0, `poiBuried` 0/0, `instBuried` **843**
  against a baseline of 861.
- **`silhouette --set rocks --seeds 24 --reseeds 5` PASS**, all six family floors
  held, and **three rows went UP**: `fin` 20.6 -> 22.2/24 distinct, `hoodoo`
  19.8 -> 23.2, `pinnacle` 19.0 -> 23.4. Variety came down a little in exchange
  (`boss` 1.51 -> 1.29, `hoodoo` 1.50 -> 1.42 against a 1.40 floor — the
  tightest number in the run, watch it).
- **`probes/stackjoint.mts` PASS** at its ratchet: **16 open joints of 6111**,
  from **266 of 5917**.

---

## The two findings

### 1. `hullExtents[1]` is a bounding box and was used as a joint height

`ex[1]` is `max(bb.max.y, -bb.min.y)` — ONE number for BOTH faces of a hull cut
by random half-spaces and not symmetric about its own origin (**MEASURED**):

| kind | box y | surface over the axis | top overstated by |
|---|---|---|---|
| `granite` | [-0.657, +0.361] | **+0.293** | 0.364 = **55 %** of `ex[1]` |
| `talus` | [-0.712, +0.471] | +0.284 | 0.427 = **60 %** |
| `spire` | [-0.988, +0.763] | +0.720 | 0.268 = 27 % |
| `bedded` | [-0.704, +0.566] | +0.521 | 0.182 = 26 % |
| `slab` | [-0.385, +0.447] | +0.360 | 0.087 = 19 % |

`probes/hullseat.mts` measured the *underside* half of this (`slab` 0.139,
~0.55 m per joint) and stopped there. The topside is the larger half, and a
joint pays both blocks. `hullExtents` now returns a 7-tuple `HullExt`: three
half-extents (the **widths**, which is what an aspect rule and a taper are
about), `down` and `up` measured **on the axis** (the axis is a point on both
surfaces, so seating one on the other guarantees contact *there*), and two
shoulder envelopes. One tuple, not a second map, because a second map is a
parameter a call site can forget and forgetting it reinstates the bug silently.

### 2. `torPlan`'s `clear` branch was inverted

It read `rise = 2 * h * (clear ? Math.max(lap, 0.58) : lap)` under a comment
saying "an unsupported course has to sit DEEPER". But `lap` is a **rise**
fraction — `arch.lap` runs 0.24 to 0.64 — so `Math.max` **lifted** exactly the
courses it meant to sink, `boss` from 0.24 to 0.58 of its own height. It is
`stackPlan`'s expression copied to a variable of the opposite sense (there
`overlap` really is an overlap). It was also off by one: `clear` describes
course `i` against `i-1` while `rise` positions `i+1`.

## The trade, measured — and why the shipped number is not the best number

With the faces seated and nothing else, 51 joints of 5919 stay open, and **every
one is an offset case**: median `off / wPrev` among them **0.968**, the upper
course's axis at the lower block's rim. Widening is not a cause (`wHi/wLow` 0.43
to 1.15 across the open set), so nothing deepens for it — a wider course still
touches on the axis. The correction is therefore geometric: each hull's measured
**shoulder envelope**, the steepest `k` with `top(f) <= up * (1 - k f^2)`, `k`
from 0.4 (`slab`, a flat lid) to 2.0 (`granite`, a cut face falling past its own
equator). The joint sinks by the SMALLER of the two blocks' drops.

| variant | open / ~5919 | tor drawn height / stated (hoodoo, boss, fin) |
|---|---|---|
| faces only | 51 | 0.64 / 0.81 / 0.66 |
| + shoulder, unbudgeted | **1** | 0.42 / 0.69 / 0.44 |
| **+ shoulder, budgeted (shipped)** | **16** | **0.58 / 0.72 / 0.63** |

**The unbudgeted version is the trap.** It closes all but one joint and costs
**30 % of every tor's height** — `pinnacle` from a 12.8 m median to 8.4 m, in a
family whose stated purpose is to break the horizon of a plain at sixteen to
twenty-six metres. That is `landmarks-r2`'s apron finding in a different file.
The shipped version only applies the drop the joint's existing overlap
(36-76 % of the lower block's height) cannot already absorb.

One clamp, on the tail only: a course may step to 0.85 of the block-below's
half-width and not past — not a clamp on the step, which cost the hoodoo row
20/24 -> 13/24 when tried before, but on the case where the step took a course's
axis clean OFF its support, which no amount of sinking can seat.

## Open, in the order I would take them

1. **The 16 residual open joints** are all `f` 0.65-0.85 tor courses. `torPlan`
   is a pure function with no geometry, so it seats against a two-point proxy
   (each hull's surface under the *other* hull's axis) where the true contact is
   the highest point anywhere in the overlap; on an irregular cut hull at that
   offset the proxy under-sinks. Closing them wants the two specific hulls
   raycast against each other, which means moving the seat out of `torPlan` and
   into `_genTor`, where the geometry is. Priced but not taken.
2. ~~`arch.h` has never been true~~ — **taken, in `6c2e0b7`.** See below.
3. **`_genOutcrop`'s pure-function extraction.** Both halves of "ungraded" are
   now answered differently than `landmarks-r2` proposed. The **joint** half is
   landed (it seats on the faces, same as the other two sites) and it is
   **measured**, by `probes/outcropjoint.mts` — see below. What is still open is
   the `outcropPlan(rng, rockS, ext)` extraction and a `rock:outcrop` family in
   `silhouette.mts`. **It is a bigger change than it looks and I did not take
   it:** `_genOutcrop` reads `it.sx`/`it.sy`/`it.sz` back off `_item`, so a pure
   plan would have to draw its own per-axis jitter the way `torPlan` does. That
   changes the rng stream, hence every outcrop in the world, for a testability
   win with no defect attached. Do it deliberately or not at all.
4. **The one residual float**: a `bedded` block, `s` 2.6, at **(-1036, 1458)**,
   7.97 m clear of the terrain and of every neighbour. It floats at both shas,
   so it is a different mechanism from the joint — most likely a `_genTor`
   skirt block thrown `foot * 3.6` out from a tor whose own seat is well above
   the ground under the skirt. `probes/outcropjoint.mts` names it every run.

## The seat's skyline cost, found by looking and then repaid

A sweep of four rock-heavy shots before and after the seat (`zone_ostium_gorge`,
`zone_mencemoor`, `zone_three_valleys`, `landmark_meteor`; frames in
`tmp/shots/rsq-a` / `rsq-b`, heatmaps in `tmp/shots/rsq-heat/`) said two things.

**The seat is well scoped and sound.** Whole-frame `imgdiff` means were all at
or under each shot's own noise floor, and every changed pixel was a rock
instance — terrain, sky, the Meteor megastructure, vegetation and lighting
untouched. No new floats, no merged blobs, no deep interpenetration, and the
hero stack in `zone_ostium_gorge` that *was* floating is now seated.

**And it cost the skyline more than the world numbers said.** Tors lost ~20 % of
world height; on screen the loss was 27-40 %, because a tor stands with part of
its base behind a ridge and the whole loss comes out of the visible part —
`landmark_meteor`'s ridge pinnacle 22 px -> 16, `zone_three_valleys`'s skyline
hoodoo **63 px -> 43**. That is precisely what `rock:tor` exists to do.

`6c2e0b7` repays it by delivering the height the archetype states. `arch.h` is
documented as "finished height above ground" and had **never** been true — 0.75
to 0.91 before the seat, 0.58 to 0.72 after — because `h0` is solved backwards
from each course's whole bounding box and a course only fills 72-94 % of it.
The plan is **homogeneous of degree 1** in `h0`/`w0` (every width, course
height, the drift, the dip term, both shoulder drops and `placedScale`'s sink
are linear; `sy`, `sz` and both aspect clamps are ratios), so one factor applied
after the loop is exact. Drawn/stated is now 0.97-1.00, and both benches confirm
rather than tolerate it: `stackjoint` **16 open of 6111, unchanged**, and
`silhouette --set rocks --seeds 24 --reseeds 5` **byte-identical on all six
floors** — a bench that grades shape cannot see a uniform scale. No rng draw
moves, so subject numbering does not shift either.

**VERIFIED BY EYE**: `tmp/shots/rs-tall/zone_three_valleys.jpg` (the ridge tor
is an emphatic spire again, not a thin blade) and
`tmp/shots/rs-tall/zone_longwythe.jpg` (the mid-ground has its vertical back and
the foreground corestone stack is untouched — `_stack` is not a tor and the
factor correctly does not reach it).

## `probes/outcropjoint.mts` — the third joint site, measured (**MEASURED**)

`floatcheck` gate 2 measures instances against the TERRAIN and says in its own
blind list that a course standing on another rock is invisible to it. This asks
the stronger question — **is there any support under this block at all?** — with
the support being the higher of the drawn ground and any other instance's
topside within 40 m, read off the placed triangles and never off `hullExtents`.
Over 20x20 of the generator's own 176 m cells, 2548 laid course blocks:

| | before (`8640db9`) | after (`a23a3f6`) |
|---|---|---|
| floating | 35 (1.37 %) | **1 (0.04 %)** |
| p90 gap | -2.410 m | -2.815 m |
| p99 gap | **+0.261 m** | **-1.549 m** |
| worst | 13.44 m | 7.97 m |

## `poi_tomb` — measured, and NOT fixed (`Shots.ts` is the coordinator's)

`probes/tombsight.mts`. `landmarks-r2` proved the kit is a full temple and named
the framing; this is the number. The camera eye is **32.5 m below the deck it is
aimed at**, and a crest 110 m out subtends 7.56 deg against the temple's 5.76 to
8.04 deg: **2.8 m of 13 is visible, 21 %**. Worse than "two thirds behind a
ridge" — 79 % is.

- **Raise the eye in place: +41 m** (to y 136.8). The one-crest solve says +5.3 m
  and is *wrong* — clearing the 110 m crest hands the horizon to a farther one,
  so it is a sweep, not arithmetic. 41 m on a 322 m shot is a different shot.
- **Swing the bearing, same 321.8 m range: the cheap fix.** The shot is at
  bearing **35 deg** from the pin, five degrees inside the only blocked sector.

      bearing   0-30   40    60    80   90-140   150-250   260-350
      visible     0     7   10.6  12.4    12.9      13         0   (of 13 m)

  Anything from 150 to 250 deg sees the whole temple with no lift at all.

## Rules this lane is carrying

- **A gate that composes through the tuple it grades cannot see a bug in that
  tuple.** `stackjoint` said 0 of 1615 for as long as it computed course heights
  the way the plan did. It raycasts the placed triangles now and shares no
  arithmetic with what it grades.
- **The measurement is not the bar.** The variant with 1 open joint of 5919 is
  the wrong ship. Capture and look.
- **And a whole-frame diff under the noise floor is not "no change".** Every
  regression this lane found was invisible to `imgdiff`'s mean and obvious in a
  crop; the pixels that moved were 0.2-0.9 % of the frame and all of them
  mattered. Read the heatmap, then read the crop.
- Editing `Rocks.ts` prunes the geometry bake — it is in `GEO_SOURCES`. Run
  `node src/tools/texbake.mts --geo`; `daemon.mts --health` reports it missing.
