# Lane 12c — traversal and HUD stacking

Playtest complaints #3 (silent slope refusal) and #4 (the tutorial card parks on
top of every full-screen screen). Both are playability, both cheap.

## Status: LANDED — 4 commits; `uxcheck` still to confirm at hand-off

## What the instruments say

- **New probe `src/tools/probes/slopewalk.mts`** — the instrument that was
  missing. Slope census of the terrain field plus walk trials: Noctis is placed
  at the foot of real hillsides binned by steepness, pointed uphill, and
  sprints for 10 s. Reports metres along the wish direction, height gained, and
  whether anything was ever *said* (`body.slip`, the HUD hint). A trial is
  DEAD-SILENT when it covers under 6 m with no signal.
- **`longplay` has been reporting this all night** and nobody read it as a
  defect: `gave up on N unreachable spot(s), turned away from being stuck M
  time(s)`. Its own source comment (`probes/longplay.mts:313-324`) records the
  original: at game minute 2.8 the route hit a slope too steep to climb and the
  probe held W into it for the remaining 27 minutes, `grounded` true, position
  pinned to the metre.
- **The corpus could never have caught complaint #4.** `HUD.update:183` writes
  `hints.muted = !!game.currentShot` every frame and `Hints._poll:120` returns
  early on `currentShot` too — so the first-run hint card is invisible in every
  capture this project has ever taken. Two new `ui-shoot` scenes,
  `hint_over_menu` and `hint_over_prompt`, reach past the mute and `_present`
  a card directly. That is what a player gets on their first minute.

## Files owned / touched

- `src/world/collision/CharacterController.ts` (free — lane 23 finished; do not
  break the swim branch)
- `src/ui/*` (free — lane 10 finished)
- `src/tools/probes/slopewalk.mts` (new), `src/tools/ui-shoot.mts` (scenes)

## What landed, and whether it is verified

1. **`CharacterController`: the slide gets momentum, and publishes `slip`.**
   The 50-58 deg fade band keeps its old behaviour verbatim; past it the slide
   accelerates under gravity along the slope, caps at `SLIDE_MAX` 3.5 m/s and
   brakes at `SLIDE_BRAKE` 8/s once the ground holds — so it cannot reach an
   equilibrium and it carries the character off the contour into country he can
   walk on. **Verified** by `slopewalk`.
2. **`REFUSE_T` is a leaky 0.35 s counter, not a debounce.** `Terrain.normalAt`
   is a one-cell finite difference over an incised field (`Field._addDetail`'s
   gully cuts 4.8 m, amplified by `(0.4 + 0.9*slope)` so it bites the flanks),
   and a 41.6 deg hillside that climbs 12.4 m without difficulty spends **54% of
   its frames** with a sub-metre facet steeper than 58 deg underfoot. Building
   momentum or firing the message on those was measurably wrong both ways.
   **Verified** — it is what the two tuning rounds in `slopewalk` measured.
3. **`src/ui/Layers.ts`** — the ladder (`#menus` 2 -> 3, which breaks its tie
   with `#interact`) plus a band-occupancy register. `Hints` **suspends** rather
   than covers, and its hold timer stops while suspended. The reading claim is
   taken in `HUD.setMenuOpen`, the one signal that already covers both a screen
   (`Menus`) and a conversation (`Interactables`) — which is why the camp meal
   menu is fixed by the same claim as the Gear screen. **Verified** by
   `hudstack` and **by eye**: `tmp/shots/l12c-before/hint_over_menu.png` has the
   card lying across THE REGALIA and CHOCOBO; the after shot has both headers
   clear and the screen untouched.
4. **The traversal note** — `TOO STEEP / This face will not hold — find a way
   around`, gold (the rest of this HUD is ice; this is the game refusing you),
   in flow above the button row inside `.bc`. **Verified by eye** in
   `tmp/shots/l12c-after/slip_note.png`: quiet, in the house style, legible at
   the size a player reads it.
5. **`CombatHUD`** — nameplate de-collision (nearest-first, later plates pushed
   UP into empty sky, faded past `MAX_SHOVE` because a label in the wrong place
   is worse than no label) and every projection in the file corrected for the
   HUD's `zoom`. The zoom error is exactly zero at 1600x900, which is why no
   capture and no gate has ever seen it and it took a human playing in their own
   window to report it. **NOT verified by eye** — needs a combat capture at 5-8
   enemies, and one at a viewport that is not 1600x900.
6. **Legibility over a bright ground — now VERIFIED by eye.**
   `tmp/shots/l12c-legib/hud_field.png` against
   `tmp/shots/l12c-before/hint_over_prompt.png`: the bottom control strip is
   clearly whiter with a visible ground behind it, and the top-right
   `M.E. 756 · DAY 1 · MIDDAY` line went from near-invisible grey to legible
   white. The HUD did not get shouty. **The minimap caption is still the least
   legible thing in the frame** and is filed — it is a self-contained `<style>`
   tag in `Minimap.ts` that does not use the ui.css tokens.
   Confirmed **still present on the
   post-`e848801` build**, so it is not the Float16 white-frame bug: in
   `tmp/shots/l12c-after/hud_field.png` the top-right `M.E. 756 · DAY 1 ·
   MIDDAY` line and the minimap caption are close to invisible over sunlit
   scrub. Fixed by adding the `.bc::before` shade wash — the bottom-centre strip
   was the only corner with none, which is exactly why the control hints were
   the first thing the playtest lost — plus lane 10's `b3dbbdc` recipe on
   `.armiger .ar-note` (`--ink-4`, 8px, no text-shadow: the same defect one
   layer out, and over unblurred terrain rather than a scrim) and a colour step
   on `.clock-day`, `.loc-sub`, `.quest-step`, `.prompt .lb`, `.toast
   .tz-k`/`.tz-ico`.
7. **`_deCollide` is landed but its test frame was too easy.**
   `tmp/shots/l12c-legib/combat_wide.png` has four well-separated nameplates
   and no overprint, which proves nothing — the reported failure is at 5-8
   hostiles in a den. **What that frame DID show is a live instance of the same
   class one layer over: `BLINDSIDE / ATTACK FROM BEHIND` with `316 CRITICAL`
   and `284` printed straight through it, and `751 / CRITICAL / 781` stacked
   top-right.** Filed in TASKS with the note that `hudstack` reported that frame
   clean only because `.dmg` is not in its `WATCH` list.

## The refusal predicate took three tries, and the third is unconfirmed

This is the one thing a successor must pick up. `slopewalk` measured all three:

| refusal predicate | DEAD-SILENT | what it got wrong |
|---|---|---|
| `slip = 1 - grip` | 0 / 15 | **78% slip on a 41.6 deg hill that climbs 12.3 m.** A warning that fires while you are succeeding is one nobody believes the time it is true. |
| `grip <= 0` (the 58 deg line) | **1 / 15** | a 60 deg face whose local facets sit just *inside* the fade band, where the damped uphill push and the downhill push still cancel |
| `progress < 0.25` | **6 / 15**, slip 0% everywhere | `progress` is scored against the velocity the slope response PRODUCED, so a character sliding backwards down a cliff scores a perfect 1 |
| displacement along the pre-slope **wish direction** (`_scoreRefusal`) | **not yet measured** | — |

The last one is what is on `main` now. It is committed rather than held because
it replaces a state that is measured *bad*, and because an uncommitted edit on a
shared trunk is served to every co-agent's `--dirty` capture anyway. **Re-run
`node src/tools/probe.mts src/tools/probes/slopewalk.mts --dirty`. The bar is
0 of 15 DEAD-SILENT with the eight CLIMBED rows between 40 and 55 deg intact.**

Its commit message says it landed with `SKIP_BUILD_CHECK` because the hook was
red on two other lanes' in-flight files (`weavestat.mts:102`,
`WorldMapScreen.ts:603,648`). By the time it actually ran, those were fixed and
**the hook passed normally** — build, typechecks and four gates all green. The
message is wrong on that one point and is not being rewritten on a shared trunk.

## Caveat on the commits

`src/ui/ui.css` carried hunks from two concerns at once and an explicit pathspec
commits the FILE, not the hunks (LANDMINES, "An explicit pathspec commits the
FILE"). The legibility pass therefore landed inside the commit titled *"Say the
slope rule out loud"*. Every changed rule carries its own inline `/* why */`
comment, which is where that reasoning needs to live anyway.

## Next step

- Re-capture `hud_field` and `combat_wide` and **look at them**: does the
  legibility pass actually help, and does `_deCollide` read right at density?
- Confirm `uxcheck` is still 95/95 (it was queued behind the daemon at hand-off;
  the two assertions that touch this work are "a hint greets the player on the
  first field frame" and "a hint explains how to leave the first menu", both of
  which read `hints.cur.id` and not visibility, so suspension does not disturb
  them — but that is an argument, not a measurement).
- `longplay` is the end-to-end number for complaint #3 and has not been re-run
  since the fix. Its `gave up on N unreachable spot(s), turned away from being
  stuck M time(s)` line is the before/after nobody was reading.

## Measured, 2026-08-31

### A — slopes (complaint #3)

`probes/slopewalk.mts`, 15 real hillsides, 10 s of sprint straight uphill each:

| | DEAD-SILENT | note shown |
|---|---|---|
| before | **6 / 15** | never (`slip 0%`, `hint 0%` on every row) |
| after  | **0 / 15** | on every refusing face |

but see the section below: the predicate that produced that 0/15 was replaced
twice afterwards, and the version on `main` is not yet confirmed.

Slope census (unchanged by the fix, it is the world): `>50 deg 8.57%`,
`>55 6.48%`, `>58 5.25%`, `>62 3.80%`, `>66 2.53%` over 42 025 samples.

**The diagnosis is not the limit.** Four of five sites between 47 and 58 deg
already climb, so raising the walk limit buys almost nothing and would put
Noctis on faces nothing authored. What was broken is what happens *past* it: the
downhill push was recomputed each frame and `Player` rebuilds `velocity` from
heading and speed each frame too, so it could never accumulate — the character
slid until the push cancelled his own effort and PARKED on that contour,
upright, `grounded` true, `progress` ~0 so the animator held the idle. A cliff
you cannot climb is legitimate. A cliff you stand still on is a bug.

### B — HUD stacking (complaint #4)

`probes/hudstack.mts`, all 16 registered screens with a hint card up:

| | hint-card ink inside the reading band (150..812) |
|---|---|
| before (`--build HEAD`) | **83 px on 16 of 16 screens** |
| after (`--dirty`) | **0 px, 16 of 16** |

