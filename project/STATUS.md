# Status — 2026-08-30

> **A snapshot, REPLACED in place, never appended to.** Dated bullets belong in
> `journal/`. Deleting a line that has stopped being true loses nothing.
> Capped at 150 lines by `.githooks/pre-commit`.

**`main`. One plan, LOCKED: `docs/plans/2026-08-30-fable-to-nine.md`** — the
audited to-nine plan merged with the content arc, two city hubs, chocobos,
swimming and the funded Meteor art round. **Lanes staff 2026-08-31 ~02:20
CEST; live lanes: none until then.** `project/handoff/` holds only its README.

`pnpm run check` **19/19**, `nanscan` **0 of 142**, draw calls **786/800**, and
**`BRIEF.md`'s 33 ms rule is met** — `perf` and `gameplay` both certify with
`RULER_VALID: true` and **0 hitches**.

## Both plans are built and archived

`2026-08-25-opus-after-phase3` closed 4 of 4. `2026-08-26-opus-the-standing-backlog`
closed all thirteen. Both are in `project/archive/plans/`.

**The backlog nearly did not end, and that is the part to remember.** Its §WS-13
was created so open work would stop dying inside handoffs — a real problem, since
52 of them had each held a private backlog no plan knew about. But it made the
plan self-regenerating: every finishing lane handed leftovers into WS-13, which
kept the plan alive to staff another wave. **The rule that ended it is in that
section: no new rows, ever.** After a plan closes, a reusable trap goes to
`LANDMINES.md`, what happened goes to `journal/`, and something worth funding
gets *said to the human*. **Nothing gets a new queue by default.**

## The headline is that the plans were wrong more often than they were right

Roughly 60% of what closed came back as a **measured negative or a corrected
premise** rather than a landed feature. Eight premises were false:

- **The head was not a sculpting problem.** `buildHead`'s skull grid was **wound
  inside out**, so the near surface was backface-culled in *every frame this repo
  has ever captured*.
- **The program count was not material sprawl** — 271 → 126 without touching one
  of the 132 construction sites. `renderer.compile()` was building programs no
  frame ever binds.
- **The canopy blob was not GTAO** — NaN, from the terrain shader reading
  roughness as a tangent normal's Z.
- **Shadow warmth is not ground albedo** — it is aerial perspective in shadows
  that are otherwise black.
- **Seven dry fishing pins were one predicate.**
- **`--hide` was never broken** the way WS-9 said — one frame of cascade phase.
- **The overlapping river panels were one river crossing itself**, not two rivers
  crossing; the merge branch had been unreachable code since it was written.
- **The terracing was `_peak`'s two cliff bands** — blast radius *one landform*,
  not the every-hill fear that had stopped two lanes.

## Instruments lied eleven times

The single most valuable habit this run bought: **when a metric agrees and the
frame disagrees, suspect a property no metric in the tree reads.** Every bench
here reads the *position* buffer, so five head passes measured a correct face and
photographed a wrong one. Also: `anycheck` scanned **0 files** while "zero `any`"
rested on it; `perfsprint` compared `cacheKey.length` **strings**; `stackjoint`
computed course heights the same way the plan it graded did; `fishdeck`
re-derived the code's own arithmetic, so it could not notice the code changing;
`outcropjoint` read support off an unpinned clipmap ring, making **33 of 34
"floats" the harness**; `facemark` never drew anything; `corpus.mts` rejected
`--build`; `performance.memory` is **frozen**; and the 16/16 texture-unit warning
is three counting the wrong limit.

## What moved

**Boot 7.13 → 5.78 s**, then −850 ms more. **RAM 1 608 → 1 246 MB off the tab**
(*releasing an index entry frees nothing* — every entry carries the whole
container, and one surviving key pinned 134 MB for the session). **Idle CPU
189% → 103%** with the loop capped at 60. **The corpus went 7 NaN shots → 0.** The
river water surface, undrawn for a day behind a `'body' : redefinition`, draws.

Frames: the exposure meter was overriding the Sky's physics by a median 1.361.
Galdin's strand **14 → 78 m**. The 4–30 m relief hole is filled. Fishing pins with
water **4 → 8**. Swainsmere went from a lawn over the water to **443 instances**.
Anak reads as an animal. A fight has an ending. Three shots were reframed after
`framedepth` showed their cameras made their own content unreachable.

## Knowingly unfinished

- **The head is short of `BRIEF.md`'s bar and was closed anyway**, by the human,
  after six passes. Its own "done when" is met and `facecheck` asserts it.
- **The Disc does not read as a meteorite.** Both levers are measured negatives,
  and the fissure glow **has never rendered from any camera** — all 22 slabs are
  entombed. The honest fix is an art round; it was put to the human and declined.
- **`zone_mencemoor`'s corduroy** is the ensemble of five `ridged2` generators in
  one `strikeFrame`. Closing it needs per-octave anisotropy across all five, with
  **no instrument that measures directional statistics.**
- `docs/BOOT_PERF.md` carries the vitals. Note **capping did not reduce
  `CPU ms/frame`** — a 120 Hz panel halves, a **60 Hz panel is unchanged**.
