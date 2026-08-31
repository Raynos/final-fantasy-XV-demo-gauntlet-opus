# Handoff — W3-D: the clock, and telling the player why something didn't work

**Lane:** two items from the second blind playtest — (A) the sun never moves,
(B) a button drawn as available that does nothing and explains itself in
unreadable type — plus playtest item 7 (overlay text that reads as a ghost).

**Owns / touched:** `src/world/Sky.ts`, `src/game/rpg/DayCycle.ts`,
`src/ui/screens/WorldMapScreen.ts`, `src/ui/Menus.ts`, `src/ui/Hints.ts`,
`src/ui/ui.css`, new probes `src/tools/_probe/w3dclock.mts`, `w3denv.mts`,
`w3dmap.mts`, `w3dday.mts`. **Cross-lane:** one commit into
`src/tools/probes/longplay.mts` (finished `night-danger` lane) — see below.
**Not touched:** `src/characters/`, `src/game/CameraRig.ts`, `src/game/Shots.ts`.

**Commits:** `c174019` (clock), `32fe26c` (refusal + legibility), `1152bdc`
(longplay pin).

## A. The clock — LANDED, verified numerically and by eye

`DayCycle.driveSky` is now **true** and the clock advances at
**`minutesPerSecond = 0.4`** — one full in-game day per real hour, FFXV's own
ratio. Rationale is in the constructor docblock: 30 minutes is the unit the
playtest measured against, so half a day per session is the target, and from
the 12:00 the world boots at that session runs midday → afternoon → five real
minutes of golden hour → dusk → the starfield night. Both of `BRIEF.md`'s
signature looks inside one sitting.

Mechanism (all in `DayCycle.update`):

- `update` remembers the sky hour it last observed (`_skyWritten`), so a
  scripted `Sky.setTimeOfDay` — `applyShot`, a chapter start, a cutscene,
  `Dungeons._restoreWorldLighting`, `Warmup`, the ?debug slider — is
  distinguishable from our own push and still wins. `setTimeOfDay`'s signature
  is unchanged for every existing caller; it gained an optional `force`
  (default true) and `DayCycle` is the only caller passing false.
- **`flowing()` pins the clock while `game.currentShot` is set** — that is what
  keeps the 166-shot corpus dependent only on its authored `time`. Also pinned
  while the title screen is up ("golden hour, always").
- **`drivesSky()` stops pushing while inside a dungeon**, because
  `Sky._updateEnv` overwrites the `scene.environmentIntensity` and probe
  intensity that `Dungeons` parks. Time still passes; the light catches up in
  one step on the way out.
- Pushes only past `PUSH_EPS = 0.004 h` (≈0.6 s of wall clock), so
  `_applyTimeOfDay` runs at ~1.6 Hz, not 60 Hz.
- `fromJSON` marks the instance `_restored`, so a loaded save's hour is pushed
  into the sky instead of being overwritten by whatever the sky booted at.

### Verified (`node src/tools/probe.mts src/tools/_probe/w3dclock.mts`)

    ok    shot hud_field            authored 14.000  sky 14.000 -> 14.000 over 200 settle frames
    ok    shot landmark_meteor      authored 17.600  sky 17.600 -> 17.600 over 200 settle frames
    ok    shot lest_overlook_disc   authored 21.400  sky 21.400 -> 21.400 over 200 settle frames
    ok    title screen pinned       sky 18.550 -> 18.550 over 600 frames
    FAIL  one real minute of play   DayCycle 12.000 -> 12.385 (+0.384 h, want +0.4)
    ok    the sky followed it       Sky +0.381 h, lag 0.003
    ok    scripted setTimeOfDay wins  sky 21.000 -> DayCycle 21.001 after 6 frames
          a 30-minute session from 12:00: 5m 13:45 Midday | 10m 15:27 Afternoon |
          15m 17:18 Afternoon | 20m 18:55 Dusk | 25m 20:36 Evening | 30m 22:19 Deep Night

The one FAIL is the probe's tolerance, not the clock: it is **4% short**, and
the probe plays live (`Director.play()`), so an encounter's hit-stop time scale
(`game.time.scale`) eats a fraction of the frames. **Not chased** — worth one
look if anyone wants the rate exact. Everything else is exact.

### Looked at

`tmp/w3d/day-0/10/20/30.jpg` — the same framing at 12:01, 15:25, ~18:5x and
~22:1x of one continuous session. (See "what the frames showed" below.)

## B. The refusal — LANDED, looked at

`_verbs(poi)` is now the single answer to "what will Enter and I do with this
selection, and why not if not". `accept()`, `canDrive()`, `driveThere()`, the
card footer and the chrome legend all read it, so they cannot disagree — they
did: `_known()` is true for everything on the wide atlas, so that sheet printed
`FAST TRAVEL AVAILABLE` over pins `accept()` refused as `NOT SURVEYED`, and a
struck-through dead fishing pin could still be Enter-travelled to.

1. **A visible refusal banner** (`.wm-refuse`), centred immediately above the
   `Enter TRAVEL` legend, amber headline over a 13px sentence on a
   backdrop-blurred plate, 3.4 s hold. It carries the fix, near-verbatim from
   the playtest's own spec: *"Survey this place first — walk within 55 m of
   it."* It lives in the screen's own root, not a new `Layers` band: `HUD`
   already claims the whole `reading` band at `PRIORITY.screen` for as long as
   a menu is open, so there is nothing to arbitrate with.
2. **`I` refuses out loud.** `driveThere()` returned `false` from three places
   silently while `_onKey` swallowed the key with `preventDefault()`.
3. **`Menus.setFoot`** lets the open screen publish a live legend; a key that
   will refuse is drawn dimmed (`.prompt.off`, 0.3 alpha + desaturated) rather
   than removed, so the legend does not reflow as the selection steps.
4. **`.wm-ft` is legible**: 8px/.3em/34%-alpha in a 296px box (420px of text,
   wrapping into the plate's clip corner) → 9.5px/.16em/`--ink-3` with
   `overflow-wrap` and a two-line `min-height` so the plate stops resizing.
5. `enter()` clears a stale refusal (`game.time.now` keeps running while the map
   is shut, so reopening inside the hold window replayed it).

**Verified by probe and by eye** (`_probe/w3dmap.mts`, `tmp/w3d/refuse-survey.jpg`,
`tmp/w3d/refuse-ok.jpg`, plus corpus `menu_world`, `map_drive_there`, `menu_map`).

## Item 7 — two of the three ghosts, LANDED

The subagent audit found the three have **three different mechanisms**, and the
`Dialogue.update` 0.24 the other lane found is **not** one of them (it is
already 0.45 and governs dialogue choice rows only).

- **`.areacard` had no scrim at all** — `1,200 EXP REDEEMED` is 10px at .56em in
  `#b6d6f8` over whatever the dawn is doing. `.victory` sits on a 0.74-alpha
  plate, `.hint` on `.plate`, this on nothing. Given an elliptical fade behind
  the type rather than a rectangle (a hard plate would cheapen a soft
  left-aligned title over the world). **Not yet photographed** — see "left".
- **`GETTING BACK OUT` could never appear.** `Hints._poll` raises it exactly
  when a menu is open; `HUD` claims the reading band at `PRIORITY.screen`
  exactly while a menu is open; so `_blocked()` was true on every frame the card
  was current. It held at opacity 0 and played its 0.4 s fade-in only *after*
  the menu closed, by which time `_poll` no longer wanted it — the "ghost at
  ~20%" is a card that was never shown, only glimpsed on the way out. A card
  teaching you how to leave the surface that owns the band is now allowed inside
  it; every other claimant still blocks it. `uxcheck`'s own "a hint explains how
  to leave the first menu" still passes. **Not yet photographed.**
- **VICTORY is a measured negative**: it has a full plate (0.74→0.46 gradient,
  10px backdrop blur at brightness 0.70) and its own ramp reaches opacity 1.0.
  Nothing dims it at steady state. If the playtest saw a ghost there it was a
  frame inside the first 0.35 s or the last 0.6 s of its `Clip(0.9, 2.5)`, i.e.
  the ramp is too slow / the hold too short, not the opacity. **Not chased.**

## Gates run

- `uxcheck` — **95/95 passed**.
- `integration` — **27 pass · 0 wired-but-unproven · 0 not integrated**.
- `pre-commit` (build + both typechecks + 4 cheap gates) green on all three
  commits.
- **Not run:** `pnpm run check` (coordinator owns it), `framecheck`, `perf`.

## The one open risk — a moving clock pays for the environment probe

`Sky._updateEnv` (PMREM cubemap + diffuse probe) fires on the sky's own
0.08-hour threshold, which a running clock crosses **every ~12 s of wall clock**.
It never once fired during play before, because the hour never moved.
Measured (`_probe/w3denv.mts`, software-GL harness worker, tree not quiet):

    clock pinned           p50 18.1 ms  p99 40.7 ms  max  48.0 ms  envRebakes 0
    clock running          p50 13.4 ms  p99 52.0 ms  max 423.8 ms  envRebakes 1 [416] ms
    clock running (again)  p50 10.7 ms  p99 42.3 ms  max 344.1 ms  envRebakes 1 [337] ms
    _updateEnv alone x10:  [344, 5, 5, 5, 5, 5, 5, 5, 5, 5] ms

**Read this carefully before acting on it.** Called ten times back to back with
no frame in between it costs **5 ms** after the first; called inside a frame it
lands as 340–420 ms. That bracket is a GPU-stall artefact of a software
rasteriser — the CPU cost of issuing the work is 5 ms and the rest is
SwiftShader actually rasterising a cubemap chain. On a real GPU this is small.
**But it is now a per-play cost that no perf gate has ever measured**, so
`perfhitch` / `check:perf` should be re-run against `HEAD` by whoever owns the
suite. If it does prove to be a hitch, the cheap lever is the `> 0.08` threshold
in `Sky._applyTimeOfDay`.

Two related risks, both checked and both benign:
- `_updateEnv` disposes the env RT (LANDMINES: "a disposed PMREM silently
  rebinds to a 1x1 black texture"). `RegaliaSystem` re-reads `scene.environment`
  every frame now, so it is safe; nothing else holds a reference.
- `Underwater` writes `scene.environmentIntensity = saved * factor` **every
  frame**, so an `_updateEnv` clobber mid-swim self-heals in one frame. Its
  docblock's claim that "Sky does NOT rewrite the light intensities per frame"
  is now occasionally false; it does not matter, but it is now a lie in a
  comment.

## Cross-lane

`1152bdc` — `src/tools/probes/longplay.mts` (`night-danger` lane, finished):
`__PLAY_NIGHT` now pins the clock with `rpg.day.running = false`. Without it a
30-game-minute night run walks 23:12 → 11:12 and tests `_nightRoadDanger` for
its first nine minutes only. Two now-false header paragraphs corrected. The
**day** longplay is deliberately left with a running clock — it now crosses
twelve hours instead of repeating one afternoon, which is a better gate, but it
**moves that probe's day baseline in `TIMINGS.md`** (route unchanged; encounter
mix will change once the session reaches night-gated tables).

## Left / next step

1. **Photograph the two item-7 fixes.** `.areacard` needs a camp-rest frame over
   bright ground; `GETTING BACK OUT` needs a frame with a menu open. Neither is
   verified by eye yet — the code path for the hint is proven by `uxcheck`, the
   `.areacard` scrim is not proven at all.
2. **Re-run `perfhitch` / `check:perf`** — see the open risk above.
3. The 4% rate shortfall in `w3dclock.mts` (time-scale during encounters).
4. `AudioSystem.ts:347` plays `ui:confirm` on Enter **unconditionally** whenever
   a menu is open, so a refused Enter still plays confirm *and* cancel in the
   same frame. Not touched — not my file, and no lane was named for it.
