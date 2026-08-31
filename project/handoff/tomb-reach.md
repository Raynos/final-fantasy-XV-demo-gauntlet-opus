# tomb-reach — `integration`'s last functional red

**Status: DONE.** `integration` is 27 pass · 0 wired · 0 not integrated as of
`ed47e17a6be8` (tree). Nothing is left open on this lane; the residue below is
observation, not work in flight.

## The row

```
FAIL   walking up to a thing selects that thing     1/86 unreachable: tomb_tomb_rogue->nothing
26 pass · 0 wired-but-unproven · 1 not integrated
```

## Diagnosis — verified, with the numbers

The historical lead was wrong and is written off: the `tomb_rogue` floats by
8.64 m comment at `PoiKits.ts:716` is **historical** (it describes the
`coverY` → `seatY` fix), `floatcheck` is green, and the tomb is on the ground.
Verified: the frames below show Noctis standing on the stylobate with the deck
under his feet.

The cause is that **the prompt moves while it is being offered.**

- `Tombs.install` hands `Interaction` a **live** `THREE.Vector3` sitting on the
  POI pin. `Tombs.update` re-points that same vector onto the kit's
  `sarcophagus` anchor the first time `PoiKits` builds the temple.
- `PoiKits._tomb` puts the coffin at kit-local `z = cD / 2 + 2.6` with
  `cD = spanZ * 1.3 = 5.07`, under a `1.4` world scale. So the move is
  **7.19 m at every one of the ten tombs** — only the bearing turns, with the
  per-site yaw. Verified: `probes/tombreach.mts` prints `dPin=7.19` on all ten
  rows.
- `Interaction._pick` reads `pos` live. `integration` samples `it.pos`, walks
  2.2 m out on the diagonal, and asserts eight stepped frames later. For
  `tomb_rogue` the bind landed **inside** that window. Verified, from an
  instrumented private copy of the gate:

  ```
  tomb_tomb_rogue: pos0=(-2514.0,51.9,-3292.0) r0=15
                   pos1=(-2514.7,58.9,-3284.8) r1=6.5  moved=7.19
                   walk=(-2512.4,52.7,-3290.4)  dEnd=6.05
                   cone=200  -> nothing
  ```

  `dEnd=6.05` is **inside** the 6.5 m reach. It was rejected on **facing**: the
  coffin came to rest 107° off the approach bearing, and `cone: 200` admits
  only ±100°.
- The other nine passed by luck of a 0.3 s throttle — their bind fell outside
  their own eight-frame window. Not a property.

A second, yaw-independent defect fell out of the same measurement: the prompt
was advertised on the pin at `REACH_FAR = 15` and re-anchored to
`REACH_NEAR = 6.5`. **6.5 < 7.19**, so the instant it bound it no longer
reached the place it had just been offered from.

## Fix — `01d3a1d`, `src/game/rpg/Tombs.ts` only

The prompt is now **off until `anchored`**, and registers at 6.5 m from the
start (`REACH_FAR` deleted). `anchored` is never cleared and `pos` is never
written after it is set, so **from the frame a tomb's prompt turns on, its
position never moves again** — which is the invariant `_pick` is written
against.

Two rules justify it over widening the reach or the cone:

- `integration`'s own row **"no prompt is offered where its subject is not"** —
  the pin-parked prompt was a `Claim` verb standing over seven metres of empty
  stylobate. It escaped that row only because the row scans `npc_` ids and the
  world origin.
- Nothing changes in play. `PoiKits` builds a site when the camera comes within
  `BUILD_R = 1500 m`, so the anchor lands a kilometre before the player can be
  within 6.5 m of anything. Verified: `tombclaim` still gets a prompt at all
  ten, standing 3.5 m out.

## Instrument — `a61a832`, `src/tools/probes/tombreach.mts`

`node src/tools/probe.mts src/tools/probes/tombreach.mts`. Asserts four things:
every tomb anchors; `dPin` is 7.19 ± 0.05 at all ten; **no enabled
interactable's `pos` moves during its own walk-up**; and the walk-up selects.

Current reading — **verified**:

```
10 tombs; 0 never anchored; 0 off the 7.19 m pin-to-coffin pitch
walk-up: 96 enabled interactables, 0 unreachable, 0 moved while offered
```

Landmine written into the file: the **player** must visit each site, not the
camera. `PoiKits.update` builds against the camera and the rig re-derives the
camera from the player every stepped frame, so a camera written straight into
`g.camera` is gone before `Props` reads it — that mistake left four of ten
sites unbuilt and read exactly like four missing anchors.

## Gates

- `integration` — **27 pass · 0 wired · 0 not integrated** (was 26 · 0 · 1).
  Verified.
- `probes/tombclaim.mts` — **10 tombs, prompts 10/10, sarcophagus-anchored
  10/10, royal arms 8/8, `pass: true`**. Verified, unchanged by the fix.
- `probes/tombreach.mts` — `pass: true`. Verified.

## What the frames showed — verified by eye

- `tmp/shots/tombreach/rogue2.jpg` — Noctis on the crepidoma steps of the Tomb
  of the Rogue, 3.2 m from the sarcophagus, the coffin square on the deck
  between the columns with the rune blade standing over it. The probe reported
  `current = "Claim Tomb of the Rogue (tomb_tomb_rogue)"`, `appear = 1.00`.
- `tmp/shots/tombreach/rogue4.jpg` — same stand, hints muted and the field
  cleared. Same live prompt.
- In **both**, the prompt glyph itself is invisible: the onboarding hint card
  and (in `rogue4`) the `COEURL / VICTORY` banner draw at the same screen point
  over the target and cover it. See residue.

Reproduce with the scratch probe `src/tools/_probe/tombshot.mts` (untracked,
deliberately).

## Residue

1. **Three HUD elements draw at the same screen point over the interact
   target.** The `InteractPrompt`, the hint card and the encounter victory
   banner all land over the thing you are standing at, and stack: in both
   frames above, a live `Claim` prompt is completely hidden behind the hint
   card. Nobody owns HUD stacking tonight. Filed for `project/TASKS.md`.
2. **`integration`'s walk-up row now walks 76 items, not 86**, because the ten
   tombs are legitimately switched off at the point that probe runs (their
   temples are unbuilt — the camera has not been near them). That is the
   gate's own documented rule ("walking up to something that is deliberately
   off is not a miss"), and `tombreach` covers all ten at 96 items. Worth
   knowing, not worth changing the gate for.
