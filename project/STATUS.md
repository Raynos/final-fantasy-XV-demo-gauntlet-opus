# Status — 2026-08-25

> **A snapshot, REPLACED in place, never appended to.** Dated bullets belong in
> `journal/`. Deleting a line that has stopped being true loses nothing.
> Capped at 150 lines by `.githooks/pre-commit`.

**`main`**, zero `any`, `pnpm run check` green after `build:full` and both bake
passes. **Perf is certified and passing** — see the next section.

## Perf is no longer uncertified

Full-corpus `perf.mts`, 2026-08-25: **`RULER_VALID: true`**, floor 16% of the
median 5.0 ms frame, verdict *quiet*, **mean 218.1 fps, worst 140
(`poi_reststop`), every shot over 60**. `bestiary_necromancer` read 51 fps on
2026-08-23 in a run that certified itself and failed; it reads **172** here —
that failure was the machine. **`project/baseline-perf.json` is older than
this** (the passing run was taken without `--out`), so a diff against that file
is not a regression.

**Before quoting the ruler:** its floor is measured on `shots[0]`, so **argument
order decides whether a run certifies** — the corpus above, led by the quiet
`hero_closeup`, certified at 16%; a six-shot subset of the same machine minutes
later, led by `poi_reststop`, voided at 35%. Buying a low floor with a quiet
lead shot is the self-flattery the ruler exists to prevent. A floor per shot is
the fix; phase4 WS-0b owns it with the frame-cost split it blocked.

## `project/handoff/` is empty, and its backlog is a plan now

It held **52 files** while this document said "Live right now — nobody", and its
own README says the length of that directory *is* the live-agent headcount. All
52 were read, their open work extracted into
**`docs/plans/2026-08-26-opus-the-standing-backlog.md`**, and graduated to
`project/archive/handoff/`.

The rot was never the file count. `project/README.md` says work is picked up
from `docs/plans/` or `TODO.md` **and nowhere else**, so 52 dead lanes were each
holding a private backlog no plan knew about — including a "largest remaining
free win" (clouds and TAA), a broken `--hide` that silently corrupts every cost
ablation, and seven fishing pins with no water under them. **When a lane
finishes, its open work comes back to a plan.**

## `2026-08-21-fable-sibling-ports` is DONE

Graduated to `project/archive/plans/`, 6 of 6, all four waves closed. 3.8(a) is
built (`world/sky/SkyProbe.ts` — one diffuse ambient, an L2 SH probe, the env
cube demoted to specular-only, the inert `HemisphereLight` resolved); 3.8(b) is
evaluated and closed; Wave 4's cover-and-fire rhythm shipped. One wrong
*diagnosis* out of it, costlier than a stale row: the daylight grade's
shadow-warmth miss was blamed on the ambient probe across two handoffs, and the
**entire** diffuse ambient is worth 2.6 of that 15-point gap. Re-filed against
ground albedo.

## Live right now — nobody. The boot lane finished; seven content lanes before it

**`2026-08-22-opus-phase3-boot-and-memory` is DONE**, graduated to
`project/archive/plans/`. Its definition of done was **amended, not ticked**:
cold boot 13.66 -> **6.64 s** (`?shoot`) / **6.41 s** (`--play`), warm **6.03 /
6.15**, against under 6 s cold and under 3 s warm. Cold is a little over;
**warm was never reachable, and two earlier passes left the row open rather than
say so.** `handoff/boot-memory.md` carries a sized work list.

Three things from it that outlive the lane: **`bootprof.mts --play`** — every
boot number this project ever quoted was a `?shoot=1` number, the harness's page
and not the one `TODO.md` is about; **`ruler.mts` was crying wolf**, matching
command lines rather than executables, so `VERDICT:` is worth believing again;
and **three of four boot wins were accidental costs, not missing caches** — work
that does not vary, sitting inside the loop that varies.

## The seven content lanes, all stopped

`2026-08-21-fable-procedural-modeling` was built end to end by seven parallel
lanes and is archived, so **`src/world/veg/` currently has no owner.**

**A plan's own rows are the least reliable thing in this repository.** Sixteen
of that plan's were false; sibling-ports produced eight more across three
passes. Always the same direction — work called open that was already built —
and almost always findable by **reading the file**. Grepping for a word the
author might have used is not reading it: that is how 3.7 was audited as missing
twice, and how a "DONE" row cited three files containing the word `talus` and no
geometry. **Nothing type-checks a plan.**

**After any merge: `build:full`**, not `build` — `build` deletes the
painted-face cache without replacing it and cold boot silently regresses ~2.5 s.
Then `pnpm run check`.

## The grade — rounds 12/13/14: **3.5 -> 3.5 -> 3.0**, 12 identified every time

The instrument was validated separately: 24 plate-vs-plate composites came back
**0 HIGH / 21 LOW**, the judge saying unasked it *"could not find a WebGL demo
frame anywhere in this set"*. So the rounds are evidence.

**Round 14 went DOWN, and the cause is the head.** Of the previous round's five
changes, four were BETTER or UNCHANGED and the head was **WORSE** — *"the chin
projects further forward than the nose... no mouth geometry or mouth texture on
the mouth's location."* Its costed advice: *"fix the head, and only the head."*
Worth 3.0 -> 4.0, more than everything else combined. The detail, and the trap
that has caught three agents, are in `2026-08-25-opus-after-phase3.md` WS-1.

## Gates — 17/17 on a quiet tree, 2026-08-25

Re-run after `build:full` and both `texbake` passes. The suite has grown
**9 -> 12 -> 17**; do not quote an older count from any plan or handoff.
`build` · `anycheck` 0 · `orphans` **302/302** · `silhouette` · `silrocks` ·
`geocheck` · `hydrocheck` · `integration` **27** · `uxcheck` 93/93 ·
`creaturecheck` 207 · `combatloop` **31/31** · `roadcheck` · `reachcheck` ·
`floatcheck` · `horizoncheck` · `heightcheck` · `driftcheck`.

**Two gate failures were the harness, not the code** — see `LANDMINES.md`;
check `daemon --health` and `cleanup.mts` before believing a leased-page gate.

## `gameplay.mts`, and the draw-call ceiling

**`gameplay.mts` was not certifiable when last run** — a second session held the
machine. Its best contention-proof number puts `streaming-traverse` at **67.3
fps**, 4 hitches, from 44-55 and 18-25. **The 33 ms rule is still breached** —
`sprint+turn` 90-104 ms, a GPU-process stall when Hammerhead first draws.
Re-run it: `perf` certified on this machine, so `gameplay` should too. The tail
that made earlier runs unreadable **was the ruler**, not the game
(`ruler.yieldTask` starving Chromium's BeginFrame lifecycle); it awaits rAF now.
Also open: **ten town shots draw 924-1011 calls against BRIEF's 800, ungated.**

## Still weak

`Layers.ts`'s splat reads as one texture, not a material system — six layers
whose mean lumas span only 0.35-0.47, and that **is** the shadow-warmth row:
`sh(R-B)` −9.2 against +5.8, a *ground albedo* problem, not an ambient one.
(The old "nothing reaches white" line is gone because it stopped being true —
the daylight slice clips 2.8% against the reference's 0.5%.)

**A page costs ~1.94 GB of RSS** — measured and attributed: 498 MB JS heap,
279 MB GPU-side, the rest Chromium's, only ~94 MB cleanly recoverable.
Genuinely strong: the field HUD, atmosphere and aerial perspective, terrain
strata, the world map, the opening cutscene, warp-strike VFX, km-scale shadow,
a real drainage network, shorelines, rivers, eyes — and now a firefight with
gaps a player can time against.

## Next — `docs/plans/2026-08-25-opus-after-phase3.md`, WS-1..4, in order

1. **The head**, alone — its own costing says nothing in the environment can buy
   a point while that frame exists. `after-phase3` WS-1 and backlog WS-1.
2. **The cloud layer**, including the one free win nobody took: the cloud buffer
   is not accumulating in TAA, for want of motion vectors. Backlog WS-4.
3. **Composition, not density.** The Matérn work fixed the statistics
   (Clark-Evans 0.930 -> 0.741); nobody has chosen where anything *goes*.
4. **Motion.** Every judgment this project has made is on a still frame.

Everything else that was open lives in
`docs/plans/2026-08-26-opus-the-standing-backlog.md`, including its table of
**measured negatives** — ten claims that each cost a lane real time and are not
worth re-opening.
