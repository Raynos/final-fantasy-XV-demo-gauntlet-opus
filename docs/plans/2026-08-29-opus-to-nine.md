# To nine — polish 9/10, playable 9/10

Status: PROPOSED (2026-08-29, opus) — **nothing locked.** One plan, five phases,
an exit criterion per phase and a rule that ends it. Read §0 before anything.

Today's honest scores, from an audit that looked at frames rather than at
`STATUS.md`: **polish 6.5, playable 7.** The blind critic identifies our frame
as not-FFXV **19 times in 20**, 0 fooled. This plan is the argument for how that
becomes 9 and 9, what it costs, and what it would mean.

---

## §0 — The rules this plan is built under, because the last one nearly did not end

The standing backlog was archived yesterday after it turned self-regenerating:
every finishing lane handed its leftovers into a §WS-13 that kept the plan alive
to staff another wave. So:

1. **No section may grow.** A lane's leftovers go to `project/TASKS.md` (the
   tracker), a reusable trap goes to `project/LANDMINES.md`, a decision goes to
   `HUMAN_REVIEW.md`. **This plan ends when its five phases have exit criteria
   met or explicitly waived by the human.**
2. **A measured negative closes an item.** Six of the last plan's premises were
   false and eight more were stale; expect the same rate here and treat killing
   an item with a number as a win, not a failure.
3. **Every phase's exit is an instrument, not an opinion.** Where the instrument
   does not exist, building it is the first task of the phase.
4. **Nothing in here is believed until it is looked at.** The most expensive
   failures in this repo were plausible write-ups of things nobody photographed.

---

## §1 — What 9/10 actually means, defined before it is chased

Vague targets are why "polish" has never moved as a number. So:

**Polish 9/10 = the blind critic's hesitation rate reaches 30%** on a 20-pair
round, with **at least two frames it calls wrong**. Today: 5% hesitation, 0
fooled. `compare.mts` already runs this and its own header says the hesitation
rate moves before the win rate does — it is the leading indicator and it is the
score.

**Playable 9/10 = a first-time player, given no instruction, plays for 30
minutes and reports fewer than three things that feel broken.** Today that
number is unknown and the one sample we have is bad: a human drove for a minute
and found the steering mirrored. **The instrument here does not exist and Phase 1
builds it.**

**Both are hard and one may not be reachable.** 30% hesitation against shipped
console art, in a browser, with no binary assets, is a serious bar. Phase 5 is
the honest re-scoring that says whether it was met, missed, or was the wrong
target.

---

## §2 — Where the 3.5 points of polish actually are

From the audit, scored per dimension. **The gap is not evenly spread and this is
the single most important table in the plan:**

| dimension | now | ceiling reachable | gap |
|---|---|---|---|
| Technical | 9 | 9 | — |
| UI | 8 | 9 | 1 |
| Environment | 7.5 | 9 | 1.5 |
| **Characters** | **4** | 8 | **4** |

**Characters are the whole problem.** Every judged round names them, the head
alone was costed at 3.0 → 4.0 by the critic, and six passes on it ended short of
the bar. An environment-only push cannot reach 9 because a party stands in the
middle of the hero shots.

---

## Phase 1 — Find out what is actually broken (2 days)

**Nothing here is a fix.** Two instruments and a judged round, because every
number this plan steers by is either missing or a day stale.

- **A playtest protocol, and the first three sessions.** Written steps, a fixed
  30 minutes, and *the human plays* — the steering bug proved that a person
  finds in one minute what 1,348 commits of automation cannot. Output is a
  ranked list of what felt broken, undiagnosed.
- **Judge round 17** (in flight) — the ranked list of *what identifies us*, in
  fix-payment order. **Phases 2 and 3 are re-ordered by its answer**, and if it
  contradicts §2's table, the table is wrong and the judge is right.
- **An input audit.** The steering was mirrored in a frame where `AutoDrive` was
  self-consistent, so every instrument agreed. Walk every binding in
  `ControlsScreen` against what the code does. `KeyT` is already known to be
  bound twice with the wrong one documented.

**Exit:** three playtest reports, round 17's ranked tells, and an input audit
with every binding verified or fixed.

## Phase 2 — Characters, because they are four points of the gap (2 weeks)

The largest, hardest, least optional phase. `src/characters/**`.

- **The head, seventh pass, and this time from the right end.** Six passes fixed
  geometry; the last one found the actual state: **every painted brush and
  painted AO on that head was authored while the face was culled** — tuned
  against the inside of a skull. Re-author rather than damp. The winding fix
  means the sculpt underneath is finally visible and correct.
- **Hair.** It reads as flat ribbons at 0.55 m and covers the far eye. The pixel
  arithmetic was never acted on: a 1.5 mm lock at 4 m is **0.7 px** — sub-pixel
  opaque geometry can only shimmer, and no amount of shading fixes it. Decide
  the representation before modelling.
- **Silhouette and costume variety.** In `hero_full` two of four have near-white
  hair (Prompto is blond, Ignis ash-brown), and all four read as dark
  bodysuits. Ignis is untouched — one black column, no hem, no lapel, no collar
  break. This is cheap next to the head and buys a lot.
- **`facewind`'s negative signed volume on the body, outfit and both eyes is
  still unchecked.** Two passes estimated ten minutes and neither spent them.
  **Do this first** — the same class of bug beat five passes.

**Exit:** a blind round in which the *character* shots hesitate at least once,
and `facecheck` green with the pixel rows no longer VOID.

## Phase 3 — Environment, the last 1.5 points (1 week)

Ordered by round 17's tells, not by this list. Provisionally:

- **`gradePad`'s world-planar XZ UVs** — a 16:1 vertical stretch on every apron
  batter, which two independent reviews reported as "smeared / pasted on".
  Biggest single art defect with a known cause.
- **Cloud internal dynamic range** — crown to self-shadowed base is under a
  stop where a cumulus wants 3–4. Named the top of the next list by the lane
  that owned it. Not exposure, not `uCloudTap`, not `MARCH_SCALE` — all
  recorded negatives.
- **`zone_vannath`'s foreground at luma 13/255** under a cloud shadow 3.5×
  smaller than its own clouds.
- **The impostor ring at 210–280 m** — the 1:1 texel band, where the treeline's
  residual aliasing lives.
- **`coverageAA` reaches only `VegMaterial`** — fences, decals, town alpha props
  and every hair card are still binary. One line each.

**Exit:** round 18's landscape pairs hesitate at ≥20%.

## Phase 4 — Make it a demo a stranger can run (1 week)

Polish and playability both die at the door if the page will not load.

- **85.5 MB on the wire, ~14 s on 50 Mbit** before `Game.init()` starts. Stream
  the bake or ship a low-resolution first tier.
- **1.5 GB in the tab.** The named lever is **181 MB of render targets across
  33**; `AttrPack` not reaching the 116 streamed POI sites is next.
- **~100% of a core while idle on a 60 Hz panel.** The 60 fps cap helped 120 Hz
  only. `post.render` is 74–77% of the frame and is the only remaining lever.
- **A 1.3 M-vertex town nobody has ever looked at** — `lestallum` and
  `galdin_quay` are 2.6 M of 3.7 M resident vertices.

**Exit:** first visit under 25 MB, tab under 800 MB, idle under 30% of a core on
60 Hz — measured by `coldload`, `bootprof --mem` and `idlecpu`, all of which
exist.

## Phase 5 — Fights that last, and the honest re-score (1 week)

- **A field encounter lasts 6–7 s against FFXV's 30–90.** The level curve is
  **spent** — 1.0 is its ceiling, and 30 s needs ~21 000 hp of den against a top
  species of 22 000. The two untouched, never-measured levers are **pack size**
  (`WildTerritories.count`, `Pack.maxEngaged`, `spawnRoamer` caps at 3) and
  **warp-strike throughput** (26–47% of a den's damage from 3–12 casts).
- **Three more playtest sessions** against Phase 1's protocol, same shape, so the
  before/after is real.
- **Judge round 19**, and the re-score against §1's definitions.

**Exit:** the plan's own scoring, published, whether or not it reached 9.

---

## What this costs, and the part worth arguing with

**Five to six weeks of lane time**, of which Phase 2 is a third and is the one
that could fail — six passes have already ended short. If Phase 2 stalls again,
**polish caps at about 7.5** no matter what Phases 3 and 4 do, because the party
is in the hero shots. That is the plan's single biggest risk and it should be
said before anyone starts, not after.

The cheapest real win in the whole document is **Phase 1**, and it is two days.
It may also reorder everything after it.

## Definition of done

- [ ] Every phase's exit criterion is met, or **explicitly waived by the human**
      with the reason recorded here.
- [ ] The re-score in Phase 5 is published with its evidence, including if it
      says 7.
- [ ] **This plan is archived when Phase 5 reports.** Leftovers go to
      `project/TASKS.md`. **No section may be added to this file.**
