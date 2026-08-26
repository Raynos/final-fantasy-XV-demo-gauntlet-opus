# Status — 2026-08-25

> **A snapshot, REPLACED in place, never appended to.** Dated bullets belong in
> `journal/`. Deleting a line that has stopped being true loses nothing.
> Capped at 150 lines by `.githooks/pre-commit`.

**`main`**, zero `any`, `pnpm run check` green after `build:full` and both bake
passes. **Perf is certified and passing** — see the next section.

## Perf is no longer uncertified

Full-corpus `perf.mts`, 2026-08-25, on the daemon's quiet lane: **`RULER_VALID:
true`**, floor 0.82/0.42 ms IQR = 16% of the median 5.0 ms frame, verdict
*quiet* at load 5.00 / 18 cores and 0 browsers, **mean 218.1 fps, worst 140
(`poi_reststop`), every shot over 60**.

`bestiary_necromancer` read **51 fps** on 2026-08-23 in a run that certified
itself and failed. It reads **172** here — that failure was the machine.
**`project/baseline-perf.json` is older than this**: the passing run was taken
without `--out`, so a diff against that file is not a regression. Re-run with
`--out project/baseline-perf.json` on a quiet box to clear it.

**Before quoting the ruler:** its noise floor is measured on `shots[0]`, so
**the order of the arguments decides whether a run certifies** — the corpus
above, led by the quiet `hero_closeup`, certified at 16%, while a six-shot
subset of the same machine minutes later, led by `poi_reststop`, voided at 35%.
Leading with a quiet shot and then quoting a heavy one against that floor is
exactly the self-flattery the ruler exists to prevent. A floor per shot is the
fix; it belongs to phase4's WS-0b with the frame-cost split it blocked.

## `2026-08-21-fable-sibling-ports` is DONE

Graduated to `project/archive/plans/`, 6 of 6, all four waves closed. 3.8(a) is
built (`world/sky/SkyProbe.ts` — one diffuse ambient, an L2 SH probe, the env
cube demoted to specular-only, the inert `HemisphereLight` resolved); 3.8(b) is
evaluated and closed; Wave 4's cover-and-fire rhythm shipped. Its handoff
graduated with it.

One wrong *diagnosis* out of it, which costs more than a stale row: the daylight
grade's shadow-warmth miss was blamed on the ambient probe across two handoffs.
Ablating the **entire** diffuse ambient under pinned exposure moves it 2.6 of a
15-point gap. `imagestats.mts`'s own docstring says why — outdoors the darkest
quartile is mostly ground. **Re-filed against ground albedo.**

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
lanes; every handoff is current
(`handoff/{rocks,town,method,characters,scatter,water,trees,hydrology}.md`,
with `2026-08-23-coordinator.md` holding the lane map). It is archived, so
**`src/world/veg/` currently has no owner.**

**A plan's own rows are the least reliable thing in this repository.** Sixteen
of that plan's were false; `2026-08-21-fable-sibling-ports` produced eight more
across three passes, five in its final one. Always the same direction — work
called open that was already built — and almost always findable by **reading the
file**. Grepping for a word the author might have used is not reading the file:
that is how 3.7 was audited as missing twice, and how a "DONE" row cited three
files containing the word `talus` and no geometry. **Nothing type-checks a
plan.**

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

**Two gate failures were the harness, not the code** — see `LANDMINES.md`, and
check `daemon --health` uptime and `cleanup.mts` before believing a leased-page
gate. A third was `anycheck` flagging a local variable *named* `any`, which is
the gate being right at a zero ceiling.

## `gameplay.mts`, and the draw-call ceiling

**`gameplay.mts` was not certifiable when last run** — a second session held the
machine. Its best contention-proof number (interleaved A/B in one page) puts
`streaming-traverse` at **67.3 fps**, 4 hitches, from 44-55 fps and 18-25.
**The 33 ms rule is still breached** — `sprint+turn` 90-104 ms, a GPU-process
stall when Hammerhead first draws. Re-run it: `perf` certified on this machine
on 2026-08-25, so `gameplay` should too.

The frame-time tail that made every earlier run unreadable **was the ruler, not
the game**: `ruler.yieldTask` was `setTimeout(r, 0)`, starving Chromium's
BeginFrame lifecycle. It awaits `requestAnimationFrame` now.

Also open: **ten town shots draw 924-1011 calls against BRIEF's 800, ungated.**

## Still weak

`Layers.ts`'s splat reads as one texture, not a material system — six layers
whose mean lumas span only 0.35-0.47. **The old "nothing reaches white" line is
gone because it stopped being true**: the daylight slice clips 2.8% against the
reference's 0.5%. The live weakness next door is **shadow warmth**, `sh(R-B)`
−9.2 against +5.8 — a *ground albedo* row, not an ambient one; the whole diffuse
ambient is worth 2.6 of that 15-point gap.

**A page costs ~1.94 GB of RSS** — measured and attributed: 498 MB JS heap,
279 MB GPU-side, the rest Chromium's, only ~94 MB cleanly recoverable.
Genuinely strong: the field HUD, atmosphere and aerial perspective, terrain
strata, the world map, the opening cutscene, warp-strike VFX, km-scale shadow,
a real drainage network, shorelines, rivers, eyes — and now a firefight with
gaps a player can time against.

## Next — `docs/plans/2026-08-25-opus-after-phase3.md`, WS-1..4, in order

1. **The head.** The judge's #1 and the round's whole 3/10: no mouth, a bump for
   a nose, asymmetric eyes, burlap skin.
2. **The cloud layer** — seven of twelve frames, widest reach in the set. Fewer,
   varied, hand-placed sheets; delete the even scatter.
3. **Composition, not density.** The Matérn work fixed the statistics
   (Clark-Evans 0.930 -> 0.741); nobody has chosen where anything *goes*.
4. **Grounding** — a world-metre contact ramp is a **measured** dead end.
   `handoff/grounding.md`.
5. **Motion.** Every judgment this project has made is on a still frame.
