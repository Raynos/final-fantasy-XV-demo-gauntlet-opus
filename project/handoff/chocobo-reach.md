# chocobo-reach — `integration`'s last functional red

**Status: DONE, all three verifications green.** Commits `ed4c375` (the fix),
`890b0f7` and `4062a69` (the instrument that should have caught it). Nothing is
left open; the residue at the foot is observation, not work in flight.

## The row

```
HARNESS_TURBO=10 node src/tools/integration.mts
  FAIL   walking up to a thing selects that thing  1/76 unreachable: chocobo-stable-wiz->nothing
```

Standalone `integration` passed. The `WIRED weapon swap is free` row under turbo
is by design (submission ablated, the cost is genuinely not measurable) and is
not this lane's.

## Diagnosis

The `Tombs` defect again, in a second system, for the same reason — *a prompt
that moves while it is being offered*.

- `ChocoboHub.update` registered `chocobo-stable-<key>` and
  `chocobo-races-<key>` off the **world-axis** offsets in `CHOCOBO_HUBS`:
  radius **23.7 m** and **35.4 m** from the POI pin.
- `ChocoboHub._reanchor` later re-pointed those same live `Vector3`s onto the
  chocobo kit's **post-yaw** `stable` / `board` anchors. `stable` is kit-local
  `(BARN_X - 2.9, BARN_Z + 7.1)` = `(-9.9, 1.3)`, radius **~10.0 m**
  (`PoiKits.ts` `_chocobo`, the `A` table). So the move is between **13.7 m**
  (yaw aligned) and **33.7 m** (yaw opposed), against an item `radius` of
  **3.2 m**.
- `Interaction._pick` reads `pos` live and its distance test is horizontal
  (`_to.y = 0`, `Interactables.ts`), so a bind landing inside `integration`'s
  eight-frame walk-up window teleports the target clean out of reach — hence
  `->nothing`, no pick at all rather than the wrong pick. It is a race, which
  is why the phase change from `HARNESS_TURBO=10` flipped it; standalone it
  passed on luck, exactly as nine of the ten tombs did.

## Fix — `ed4c375`, `src/game/chocobo/ChocoboHub.ts` only

Both prompts are gated on `enabled: () => this._settled.has(hub.key)`. `pos` is
written **before** the hub joins `_settled` and never after, and the set is
never cleared — so from the frame a prompt turns on, its position never moves.
That is the invariant `_pick` was always written against.

Three things the tomb precedent did not cover, all found in this file:

1. **The Alpine Stable is not a chocobo POI.** `meldacio_layby` is
   `type: 'parking'` (`WorldMap.ts:708`) and `PoiKits` picks its kit off
   `poi.type`, so it never publishes `stable`/`board`; its offsets *are* final.
   It is therefore added to `_settled` at registration. Gating it on an anchor
   that never arrives would have switched the Alpine Stable off for good.
2. **The 40-try give-up is deleted.** `_tick > 30 * 40` counted from boot, not
   from arrival, so twenty seconds after the title screen the poll stopped
   permanently — a player not already inside `BUILD_R` = 1500 m of Wiz by then
   got prompts that never bound at all (a live bug on its own, pre-existing).
   With the `enabled` gate that would have been prompts that never appeared.
   The poll is one `anchorAt` per unsettled hub per 30 frames, over *built*
   sites only, and it stops entirely once both hubs settle.
3. **`_reanchor` now requires `stable` *and* `board` before settling.** Settling
   on `stable` alone would switch the race board on at the pin and then move it
   — the exact defect the gate exists to prevent.

`REACH_FAR`/`REACH_NEAR` has no analogue here: the reach was already 3.2 m on
both sides of the bind, so the tombs' second, yaw-independent defect (an
advertised reach smaller than the move) does not apply. **Not verified by eye —
no frame captured; this lane is a picker defect, not a visual one.**

## Instrument — `890b0f7`, `src/tools/probes/tombreach.mts`

`probes/tombreach.mts` was written for exactly this class and **missed this
instance**. Why: claim 3 only compared each item's `pos` before and after *its
own eight-frame walk-up*, and `ChocoboHub._reanchor` polls every 30 frames — so
the bind almost always lands during some *other* item's turn. The probe
inherited the same luck it was written to expose.

Claim 3 now has a second, phase-independent half: record where each item was
**the first frame it was seen enabled** (sampled before the tomb tour, once per
walk-up, once at the end) and compare at the end of the run. `npc_*` talk
anchors are excluded because they legitimately track people who walk; their
drift is counted and printed separately so the exclusion stays an argument
rather than a blanket.

## Verification — all verified

**1. `HARNESS_TURBO=10 node src/tools/integration.mts`** — was
`1/76 unreachable: chocobo-stable-wiz->nothing`, now

```
  WIRED  weapon swap is free                       turbo 1-in-10: submission ablated, swap cost not measurable
  PASS   walking up to a thing selects that thing  all 74 selectable from a 2.2 m diagonal walk-up
26 pass · 1 wired-but-unproven · 0 not integrated
```

The single `WIRED` row is the by-design one. **74 items, not 76**: a chocobo
hub whose kit is unbuilt is now legitimately switched off at that point, which
is the gate's own documented rule ("walking up to something that is
deliberately off is not a miss"). `tombreach` covers them at 96.

**2. `node src/tools/integration.mts`** — `27 pass · 0 wired-but-unproven ·
0 not integrated`, walk-up row `all 74 selectable`. Unchanged in kind from
before the fix, which is the point.

**3. `node src/tools/probe.mts src/tools/probes/tombreach.mts`** — `pass: true`,
`96 enabled interactables, 0 unreachable, 0 moved while offered`,
`101 items seen enabled, 0 moved after being offered`.

**Why the probe missed it, measured rather than argued.** The same widened
probe run against the *pre-fix* game (`--build 2295339`, tree
`sha:d92bb83c51e7`) reports both halves of claim 3 on one run:

```
walk-up: 96 enabled interactables, 0 unreachable, 0 moved while offered
whole run: 101 items seen enabled, 2 moved after being offered
  DRIFT chocobo-stable-wiz moved 32.39 m after being offered
  DRIFT chocobo-races-wiz  moved 20.30 m after being offered
```

The scratch diagnostic against the same pre-fix build reproduces
`integration`'s row exactly, and names every term in it:

```
hub _tick=27 anchored=[]
chocobo-stable-wiz:    r=3.2 pin_r=23.7 moved=32.39 dEnd=34.34 got=nothing               anchor=yes r=10.0
chocobo-races-wiz:     r=3.2 pin_r=15.7 moved=0.00  dEnd=2.19  got=chocobo-races-wiz     anchor=yes r=15.7
chocobo-stable-alpine: r=3.2 pin_r=10.3 moved=0.00  dEnd=2.19  got=chocobo-stable-alpine anchor=null
```

`dEnd=34.34` against a `radius` of 3.2 is why the row read `->nothing`: not a
wrong pick, nothing within reach at all. Two details corroborate the diagnosis
rather than just restating it. The race board reads `moved=0.00` and
`pin_r=15.7` — it had *already* been dragged off its 35.4 m offset during the
stable's window, which is the throttle putting one prompt's move inside another
prompt's turn. And `chocobo-stable-alpine` reads `anchor=null`, confirming that
the lay-by publishes no `stable` anchor and would have been switched off for
good by a naive gate.

`0 moved while offered` **on the very run that has a 32.39 m move in it** is the
old blind spot printed in full: the in-window test only sees a re-bind that
lands inside one item's own eight frames, and `_reanchor`'s 30-frame throttle
almost always puts it in somebody else's. 32.39 m against a 3.2 m reach is why
the row read `->nothing` rather than a wrong pick.

The `npc_*` exclusion the widening shipped with was dropped in `4062a69`: it
was a control that read **0 of 101 items on both shas**, i.e. a blanket rule
with no instances.

Outputs kept at `tmp/tombreach-before.txt`, `tmp/tombreach-after.txt`,
`tmp/tombreach-final.txt`, `tmp/integration-turbo.txt`,
`tmp/integration-plain.txt`. `src/tools/_probe/chocoreach.mts` is a scratch
diagnostic (untracked, deliberately) that walks up to the three chocobo prompts
and prints `moved` / `dEnd` / `got` per prompt; it reads `_anchored`, so it only
runs against a pre-`ed4c375` build.

**Not verified by eye — no frame was captured.** This lane is a picker defect,
not a visual one: the failure and the fix are both positions in a distance
test, and `tombreach`'s walk-up is a stricter reading of "does the prompt
appear" than a screenshot is. The chocobo pad's own look was lane 22's.

## Contention

Every run above queued behind the coordinator's `perf`, which held the daemon's
**exclusive** lease for ~25 minutes (`daemon.mts --health`: `exclusive: perf`,
`queue depth 1`, `workers busy 0`). One probe reported
`queued 662.5 s · ran 7.9 s`. No perf numbers were taken by this lane, so
nothing here is contention-sensitive.

## Residue

- `CHOCOBO_HUBS`' own docstring still says the prompts sit "on grass four
  metres the wrong side of a fence" and calls the real fix "read the site's own
  yaw at runtime". That fix has landed for Wiz — the kit's anchors are what
  `_reanchor` binds — but **the Alpine Stable has no chocobo kit to bind to**:
  `meldacio_layby` is `type: 'parking'` (`WorldMap.ts:708`) and `PoiKits` picks
  its kit off `poi.type`, so its two prompts are still world-axis offsets on a
  lay-by, 10.3 m and 15.3 m from the pin with nothing built around them. Nobody
  owns that tonight. For `project/TASKS.md`.
