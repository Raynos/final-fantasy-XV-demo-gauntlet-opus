# content-wire — phase 4, WS-4 (quests and hunts) and WS-5 (camp, cook, day)

Owner: content & gameplay agent, worktree `agent-a7340f8d11756a846`, `PORT=5370`.
Contract: `docs/plans/2026-08-22-opus-phase4-content-and-gameplay.md`.
Predecessor in this lane: worktree `agent-af853a3898f7c38cd`, whose WS-0/WS-1
findings (the E key, the pre-8 km coordinate tables, `HavenCamp`) are all merged
and still true. **Do not re-audit whether the RPG layer is orphaned — it is not.**

`npm run check`: **11/11 green** on a quiet tree. `integration` 23, `combatloop`
31/31, `anycheck` 0.

---

## 1. What a player can do now that they could not this morning

Driven end to end with real keys by `src/tools/probes/slice.mts`, which is the
first thing to run if you want to know whether the slice still holds:

```
tracked  "A Better Engine Blade" — Collect Rusted Bits from the wastes
six MT troopers          bits 2 -> 8, objective 2/3 -> 3/3
Cid, hand over the scrap side_engine_blade COMPLETE
Takka                    main_ch1_pauper COMPLETE — unlocks main_ch2_galdin,
                         hunt_voretooth, hunt_mesmenir, side_meat_magnificent,
                         side_elemancy_lesson
the counter              2 Cup Noodles, gil 42,180 -> 41,780
the bounty board         "[E] Hunts Bounty Board", hunts screen opens
twelve sabertusk marks   hunt complete, +1,100 gil, hunter rank 1 -> 2
Cotisse Haven            "[E] Camp Cotisse Haven" -> cook -> sleep,
                         day 1 -> 2, 6,764 banked EXP redeemed
```

**Every step on that list was broken at the start of this session.** Specifically:

1. **The main story was unfinishable from the first frame of every session.**
   `main_ch1_pauper`'s second objective is "complete any bounty", and
   `_seedMidGame` completes `hunt_killer_wasps` *before* it accepts the quest, so
   the `notify('quest')` fired into an inactive quest and was gone. `complete()`
   returns `false` on a second call. Measured, not inferred.
2. **`fetch` had one notifier in the entire repo** — Cid's hand-over line. Ten of
   the eleven fetch objectives could never move, and the *tracked* quest printed
   `Collect Rusted Bits 0/3` with two in the bag.
3. **Six of the twelve hunts could not be completed** by killing the mark the
   board sent you after: `HUNT_TARGETS` names a bestiary key, the objective names
   the mark the way the board words it, and half the table disagrees
   (`arachne`/`naga`, `garula`/`garulessa`, `titan`/`adamantoise`, …).
4. **The hunt board was unreachable.** `_pick` scored `-priority * 10` against a
   distance term spanning 1.0, so Dave — 1.8 m away and one priority step up —
   took every press aimed at the board from any angle but dead-on.
5. **24 of the 30 recipes could never be cooked**: 14 ingredients had no source
   anywhere, Cup Noodles among them.
6. **The first damage number of every fight was wiped by the HUD coming up.**
7. **The whole inhabited world was a 1.2 km disc around the car**, wearing the
   names of places up to 4 km away.

## 2. Commits, and what each one is for

| commit | what |
|---|---|
| `Unblock the pre-commit hook again` | `typecheck:tools` was **red on a fresh `npm install`** — `package.json` wants TS `^7.0.2`, which removed `baseUrl` (TS5102). The checkout most agents run has 5.9.3 from an older install, which is why nobody saw it. Same blast radius as the `DOM.Iterable` fix last pass. |
| `Put the Hammerhead pin on Hammerhead` | the escalated decision, §3 |
| `Let the quest log see what the player already has, and already did` | `QuestLog.settle` + `Holdings`, §1.1/§1.2 |
| `Six hunts could not be completed…` | `QuestLog.creditMark`, `kill/magitek_trooper` -> `mt`, dualhorn steaks |
| `The first damage number of every fight was wiped…` | `CombatHUD._rewindStandIn`, two `combatloop` checks |
| `Put the named dens in the places they are named after` | `SpawnTables` anchors resolve through `WorldMap` |
| `Type HavenCamp` | `anycheck` back to 0 |
| `Twenty-four of the thirty recipes could never be cooked` | shop supply lines + the camp menu showing effects |
| `The area card and the minimap disagreed…` | `Triggers.regionAt` asks the map |
| `The hunt board was unreachable…` | `_pick` priority is a tie-breaker again |
| `A scripted playthrough of the slice…` | `slice.mts` |

## 3. The escalated decision, resolved

**Hammerhead the pin moved onto Hammerhead the town.** `Hammerhead.ts` builds on
`Ecology`'s `reststop` site — `beside('reststop', 44, 1, 34, 26)` — which resolves
to **(576, 10)**, 34 m off the Route 1 shoulder. The POI inherited from road node
`n_hammerhead` at (60, 18), 516 m west. The POI record now carries authored
`x`/`z` with the reason written beside it.

Nothing else keyed off the old position: `roadcheck` is 0 failures (the town is
34 m from the highway, well inside the 320 m town limit), the minimap and world
map read the POI and now point at buildings, and fast travel lands on the apron.

Because that leaves a literal to keep in step by hand — exactly how the 516 m
opened up — **`integration.mts` measures pin-to-`Town.origin` every run and fails
over 60 m.** Currently 0 m.

**Reported, not touched:** the `hammerheadPan` landform that flattens ground "for
the garage apron" is still at (60, 40) with a 460 m radius, levelling empty desert
while the town stands on natural ground 516 m east. The gradient under the town
measures 0.020, flat enough that nothing looks wrong, and moving a landform
re-bakes the terrain and moves the surface under three other lanes.

## 4. What the gates cover now, and what they still do not

`integration.mts` gained four probes, three of which exist because the old ones
passed while the thing they name was broken:

- `the Hammerhead pin is on the Hammerhead town` — §3
- `walking up to a thing selects that thing` — the existing `interaction verb
  finds targets` asks whether *something* is selected at the board anchor, and
  has been reporting `selects "Cindy Aurum"` as a pass for its whole life. This
  one checks all 29 from a 2.2 m diagonal walk-up.
- `every recipe can be restocked` — fails if an ingredient loses its source.

`combatloop.mts` is 31/31, and two of those are new:

- `damage numbers appear on the HUD` **was failing on `main`** (29/30, not the
  30/30 the last handoff recorded — reproduced against a stashed tree). It was a
  stopwatch: it held attack for 90 frames then read the DOM once, but a number
  lives 1.05 s, so an early swing had aged out. It samples every frame now.
- `the opening hit of a fight still prints its number` — the stopwatch fix does
  *not* catch the real bug, because by then the combat layer is already up.
  Verified both ways: 30/31 with the old code, 31/31 with the fix.

**Still blind:** no gate drives the quest chain. `slice.mts` does, and it is a
probe, not a gate. Folding it in is the obvious next piece of gate work — it is
already deterministic and bounded.

## 5. What is still broken, ranked

### 5.1 The main chain dead-ends at chapter 2 on a missing NPC

`main_ch2_galdin` is "drive to Galdin Quay, **speak to Dino at the pier**, stay
the night". There is no Dino. `NPC_CAST` has eight people — cindy, cid, takka,
dave, trucker, mechanic, traveller, kid — and all eight are in Hammerhead. Galdin
Quay has a POI, a shop and a lodging, and nobody to talk to.

`src/tools/probes/questaudit.mts` prints the full list every run. **23 objectives
across 12 quests cannot be completed**, and they fall into three groups:

| group | count | what it needs |
|---|---|---|
| an NPC who does not exist (dino, iris, wiz, holly, randolph) | 5 | cast + placement outside Hammerhead |
| a verb nothing notifies (`photo` ×4, `escort`, `fish`) | 6 | a hook each; `photo` is cheapest — the photo screen exists |
| an item nothing drops or sells (`old_book`, `imperial_relay`, `sky_gemstone`) | 3 | one drop-table line each |
| a species that never spawns (`deadeye`) | 1 | a set piece; the model exists |

The first group is the one that blocks the slice. Everything else is chapter 3+.

### 5.2 Hunter rank is still ungated design work

Unchanged from the last handoff and still true: twelve of fifteen bounties are
behind hunter points, a rank-1 hunt pays one, and the seeded save has one. The
board offers `hunt_voretooth` and `hunt_mesmenir` and nothing else. Nobody has
designed the curve. Worth an hour before WS-4 authors anything new.

### 5.3 Known content shortcuts left alone deliberately

- `hunt_zu` spawns a renamed bandersnatch, so killing the Zu also completes
  `hunt_bandersnatch` through the ordinary species notify. Both are rank 5+ and
  far outside the slice; the honest fix is a Zu in the bestiary, not a special
  case in the quest log.
- Four waypoints sit on ground steeper than 0.42 — Keycatrich Trench (0.51, a
  dungeon mouth), the Rock of Ravatogh (1.10, a volcano), Longwythe Peak (1.18, a
  mountain the quest tells you to climb) and Malmalam (0.72). All are `reach`
  objectives or level 45+ marks, and all are steep because the *place* is steep.
  `src/tools/probes/dens.mts` prints them every run so they stay visible.

### 5.4 Art, reported not touched

The haven pad reads as a pale concrete apron with white dashes rather than
FFXV's raised rock shelf with cyan runes — see `tmp/shots/ws5c/camp_cook.png`,
which is otherwise the shot to look at for the camp menu. `src/world/props/
PoiKits.ts` (`haven: this._haven`) is the boot lane's.

## 6. Traps this cost real time to find

- **`Npcs._registerTalk` hands each person an empty `Vector3`, and `Npcs.update`
  only writes it while the camera is within 85 m.** From the player's spawn, all
  four Hammerhead talk anchors read (0, 0, 0). A probe that reads `npc_cid.pos`
  and stands beside it ends up on top of the car with four NPCs stacked on the
  origin, and reports "walked up to Cid, got Cindy" — which reads exactly like
  the picker bug that was *also* real. Move the camera, then read the anchor.
  Both `slice.mts` and the new `integration` probe carry the fix and the comment.
- **A `while (ix.talking)` loop can hang the page forever.** `probe.mts` has no
  in-page timeout, so the run sits at the 420 s harness limit with an empty
  output file and no error. Bound every dialogue-walking loop.
- **`priority` in `Interactables` was never a tie-breaker** despite its doc
  saying so. If you add a high-priority interactable near a low-priority one,
  check `reachall.mts` before assuming the low one is still reachable.
- **`hunt_voretooth` pointed into a lake.** `at('alstor_slough')` is the middle of
  Alstor Slough, 16 m below the water plane; `spawnHunt` would have grounded ten
  voretooth on the lake bed. A landmark's pin is its *centre*, and several
  landmarks are centred on the thing that makes them landmarks. `at()` takes an
  offset now, and `dens.mts` measures the terrain under every waypoint.

## 7. The probes, and what each is for

All under `src/tools/probes/`, run with
`PORT=5370 node src/tools/probe.mts src/tools/probes/<name>.mts`:

| probe | answers |
|---|---|
| `slice.mts` | can a player play the opening? **Start here.** |
| `questaudit.mts` | every objective in the table vs the bestiary, the item table, the placed cast and the spawn tables |
| `questchain.mts` | the boot state of the quest log, and whether each verb ticks |
| `huntmark.mts` | does killing a hunt's own mark credit that hunt |
| `reachall.mts` | can every interactable be selected by walking up to it |
| `dens.mts` | where the territories are, and whether every waypoint is dry and flat |
| `ingredients.mts` | can the kitchen be restocked |
| `camploop.mts` | what a meal is worth, through the real damage formula |
| `regioncard.mts` | does the area card agree with the minimap |
| `dmgnum.mts` | the damage-number frame ordering |
| `hhpos.mts` | the Hammerhead split (kept for the record) |
| `havenloc.mts` | haven positions and what is built on them |

`node src/tools/ui-shoot.mts camp_cook --out tmp/shots/x` captures the camp menu.

## 8. The exact next step

**Give Galdin Quay a Dino, and the other four missing NPCs a home.** That is the
single thing standing between the current slice and a main chain that runs to
chapter 3. It needs `NPC_CAST` entries, `NPC_DIALOGUE` trees and placement — the
Hammerhead four are the template and they work. `src/characters/npc/` is not
formally owned by this lane; the art lane owns meshes and materials there, so
agree the split before starting.

After that, in order: wire `photo` (the screen exists, four objectives depend on
it), fold `slice.mts` into `integration.mts` as a gate, and design the hunter-rank
curve before authoring any new bounty.

Files touched: `src/game/rpg/{Quests,RpgSystem,HavenCamp,Inventory,CombatBridge}.ts`,
`src/game/encounters/{SpawnTables,EncounterDirector}.ts`,
`src/game/interaction/Interactables.ts`, `src/game/story/Triggers.ts`,
`src/ui/CombatHUD.ts`, `src/characters/enemies/Dualhorn.ts`,
`src/world/map/WorldMap.ts`, `src/tools/{integration,combatloop,ui-shoot}.mts`,
`tsconfig.tools.json`, and twelve probes.
