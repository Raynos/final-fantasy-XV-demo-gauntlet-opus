# content-wire — phase 4, WS-0 (re-audit) and WS-1 (the wire)

Owner: content & gameplay agent, worktree `agent-af853a3898f7c38cd`, `PORT=5340`.
Contract: `docs/plans/2026-08-22-opus-phase4-content-and-gameplay.md`, over the
985-line audit `docs/plans/2026-08-17-opus-content-gameplay.md`.

---

## 1. The re-audit verdict — read this before you plan anything

**The 985-line audit is comprehensively out of date, and so is `docs/SCOPE.md`.**
Its §1.2 "the RPG layer is orphaned" finding has been fixed by later sessions;
its §1.3 "what is entirely missing" list is mostly built. The grep it was drawn
from now returns 22 files:

```
$ grep -rln "game.get('Rpg')\|from '.*rpg/" src --include=*.ts | grep -v '^src/game/rpg/'
src/audio/AudioSystem.ts        src/characters/ai/PartyAI.ts
src/characters/npc/Npcs.ts      src/combat/CombatSystem.ts
src/game/encounters/*.ts        src/game/story/**            src/ui/GameData.ts
src/world/town/Hammerhead.ts    src/world/vehicle/RegaliaSystem.ts   ...
```

`GameData.ts` opens with "The UI's single read-side adapter over the RPG model"
and the literals survive only as a harness fallback. WS-2 (encounters, party AI,
death), WS-3 (Hammerhead, NPCs, the interaction verb), WS-6 (the Regalia) and
most of WS-4 all have real implementations on disk.

### What the two gates actually prove, and what they do not

Both were re-run on this branch, whole: **`combatloop` 30/30, `integration` 18/18.**
Those are real, and the fifty-odd mechanics they name are genuinely wired.

But the two gates have a shared blind spot, and it is the join between them:

| gate | how it tests | blind spot |
|---|---|---|
| `combatloop.mts` | real DOM key/mouse events, real damage maths | tests combat **in an empty field**, away from any interactable |
| `integration.mts` | direct API calls on the systems | never presses a key; several probes are presence checks, not behaviour |

So `integration`'s interaction probe asserts a prompt is *selected* when you
stand at an anchor, and stops there. `combatloop` presses `E` out in open
country. Neither ever pressed `E` while a prompt was up — which is the only
place the bug lived (§2).

Named weaknesses in `integration.mts`, for whoever extends it:

- `party companions fight` checks `m.ai || m.combat` **exists**. It does not swing.
- `player death -> downed -> game over` checks the system is registered.
- `encounter: spawn -> aggro -> kill -> reward` uses `Director.setScenario('combat')`
  — the *screenshot* path — and kills with `e.hit(99999)`. It never proves the live
  `EncounterDirector` spawns anything during play.
- `rest banks EXP at a lodging` calls **`day.rest('caravan')`**, passing a string
  where the signature wants a context object. That returns
  `{ok:false, reason:'no-position'}` and the probe passes anyway because it only
  checks `res !== undefined`. Its own evidence line reads `level 27->27`. **It has
  never tested resting.**
- `inventory + gil economy` calls `listByCategory('curative')`; that method takes
  no arguments and returns a grouped map. Hence its `(undefined curative)` evidence.

### What I verified behaviourally, by driving the real page

`src/tools/probes/reaudit.mts` (run it with
`PORT=5340 node src/tools/probe.mts src/tools/probes/reaudit.mts`) drives the
player path the gates skip. Results after the fix in §2:

| | verdict |
|---|---|
| roamers spawn while walking the field | **PASS** — 18 live creatures over 12 hops, state `field`→`combat` |
| aggro pulls the world into combat | **PASS** — standing 6 m from a sabertusk enters combat |
| companions damage enemies with no player input | **PASS** — a sabertusk dies 780/780 in 15 s hands-off |
| E at the caravan actually rests | see §2 / §4 |
| E at the diner buys an item for real gil | see §2 / §4 |
| hunt board accepts a bounty | see §2 / §4 |
| camping at a haven | **FAIL — genuinely missing**, §3 |
| cooking a meal | **FAIL — genuinely missing**, §3 |
| spending AP makes a warp-strike hit harder | wired: `RpgSystem.damage()` folds `ascension.value('warpDamage')` |

**The audit's "photo booth" line is no longer true.** The encounter loop, the
party AI and the death/revive path are real and lethal. What is missing is
narrower and more specific than the audit's list, and it is in §3.

---

## 2. The finding that mattered: nothing in the game was pressable

`CombatSystem._readInput` bound `KeyE` to `warpToPoint()`. `Combat` is system 11
in the boot order; `Interaction` is system 21. Every press of `E` point-warped
Noctis twelve metres before `Interactables.update` ran, so `_pick()` found
nothing in reach and returned early **without ever reading the key**.

Traced at the Hammerhead caravan with the player pinned so he could not drift:

```
trace: pressedSet=KeyE , KeyE=true , >ix , <ix cur=null firedAt=-10
```

`KeyE=true` is combat consuming it. Calling `item.handler()` directly opened the
caravan dialogue perfectly, so the twelve registered interactables — three shops,
the hunt board, the caravan, the fuel pump, the Regalia, the NPCs — were all
correct and all unreachable. The same conflict fired during conversations:
`Dialogue` advances on `E` and, unlike `Menus`, does not drop `input.enabled`,
so advancing a line warped Noctis out of the conversation and spent MP for it.

Fixed in `src/combat/CombatSystem.ts` (commit *Give E back to the interaction
verb*): combat yields `E` whenever `Interaction.current` or `Interaction.talking`
is set. It has to be combat that yields — Interaction runs later in the frame and
cannot defend its own key.

**Also fixed:** `npm run typecheck:tools` was **red on a clean `main`** — eight
errors in `combatloop.mts` and `sheet.mts`, all from `DOM.Iterable` missing from
`tsconfig.tools.json`'s `lib`. The pre-commit hook runs that config, so it was
rejecting every commit from every agent. Verified against a stashed tree, so it
is `main`'s state, not this branch's. The last coordinator handoff records both
typechecks as green.

---

## 3. What is genuinely missing (the real WS-1 remainder)

### 3.1 The RPG layer's world coordinates are still fiction — the audit was right about this one

This is the audit's §1.2 last bullet and it was never fixed. Every position table
in `src/game/rpg/**` is in the **pre-8 km coordinate space**:

| table | says | the world says |
|---|---|---|
| `DayCycle.HAVENS` (10 entries) | `haven_longwythe` at `[128, 0, 84]` | `WorldMap.POIS` has **17** havens, `longwythe_haven` at `(962, -712)` |
| `Elemancy.DEPOSITS` (10 entries) | `dep_hammerhead` at `[42, 0, -118]` | Hammerhead is at `(576, 10)` |
| `Quests` waypoints | `[42, 0, -118]`, `[8, 0, -102]` … | same problem |

Consequences a player sees:

- `rpg.camp({lodging:'haven'})` returns **`{ok:false, reason:'no-haven'}`** wherever
  you stand, because `canCamp` measures against the fiction table.
- `GameData.readMarkers()` publishes haven and deposit pins to the world map and
  the compass at coordinates hundreds of metres from the geometry.
- `combatloop`'s deposit check passes only because it **teleports the player onto
  `deposits[0].pos` first**. In play the deposits are not where the world is.
- The HUD quest tracker resolves a real quest name (`A Better Engine Blade`) but
  its objective text and metre distance come back empty.

Per `project/HANDOFF.md`'s own lesson — *"coordinates go stale; derive them live
from `WorldMap`/`Terrain`, never hard-code and hope"* — the fix is to **derive**
these tables from `worldMap.poisOfType('haven')` and friends rather than re-typing
numbers that will rot again.

### 3.2 Camping at a haven is not reachable

Twelve interactables are registered and **none of them is a haven**:
`hh_huntboard, hh_diner, hh_garage_shop, hh_culless, hh_caravan, hh_pump,
hh_regalia_bay, hh_rentabird, npc_cindy, npc_cid, …` — all Hammerhead.
`docs/SCOPE.md:335` agrees: *"the caravan Rest at Hammerhead works; havens are
not wired"*. The camp/cook/level-up loop is FFXV's signature and it is ~90 %
coded in `DayCycle` + `PartyState.cook()` + `ExpBank.redeem()`.

### 3.3 Cooking has no UX

`PartyState.cook()` and 30 recipes exist. The registered screens are
`main, inventory, ascension, armiger, map, world, map_wide, gear, quests,
archives, system, controls, photo, shop, hunts` — no cook screen, no camp screen.

---

## 4. State, and the exact next step

Committed on this branch:

1. `Add DOM.Iterable to the tools config` — unblocks the pre-commit hook.
2. `Give E back to the interaction verb` — §2.

Next, in order:

1. Re-run `src/tools/probes/reaudit.mts` and confirm the four interaction rows
   (caravan rest, shop purchase, hunt accept, NPC talk) now pass end to end.
2. Extend `integration.mts` so the E verb cannot regress: stand at an anchor,
   **press the key**, assert the screen opened or gil moved. Fix its
   `day.rest('caravan')` call while there.
3. Derive `DayCycle.HAVENS` and `Elemancy.DEPOSITS` from `WorldMap` (§3.1).
4. Register a haven camp interactable from `RpgSystem` — it is already
   constructed and ticked, and can reach `game.get('Interaction')` lazily on its
   first tick, so this needs no change to `Game.ts` (§3.2).

Files touched so far: `src/combat/CombatSystem.ts`, `tsconfig.tools.json`,
`src/tools/probes/reaudit.mts` (new), `src/tools/probes/epress.mts` (new,
diagnostic).

Reported, not edited (outside my paths): nothing yet.
