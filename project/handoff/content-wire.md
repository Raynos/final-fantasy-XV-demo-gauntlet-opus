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
| camping at a haven | **FAIL — genuinely missing**, §3.2, now fixed |
| cooking a meal | **FAIL — genuinely missing**, §3.3, now fixed |
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

## 3. What was genuinely missing — all three now fixed

### 3.1 Every world coordinate in `src/game/rpg/**` was pre-8 km fiction

The audit's §1.2 last bullet, never fixed, and the world grew from 3 km to 8 km
underneath it:

| table | said | the world says |
|---|---|---|
| `DayCycle.HAVENS` (10) | `haven_longwythe` at `[128, 0, 84]` | `WorldMap` has **17** havens, `longwythe_haven` at `(962, -712)` |
| `Elemancy.DEPOSITS` (10) | `dep_hammerhead` at `[42, 0, -118]` | Hammerhead's layby is at `(246, 52)` |
| `Quests` waypoints (44) | `[8, 0, -102]` for "push the Regalia to Hammerhead" | the town is at `(576, 10)` |

What a player saw: `rpg.camp()` returned `no-haven` wherever you stood; the
compass strip pointed into open desert and printed a fictional metre count; and
because `checkProximity` measures `reach` objectives against those coordinates,
**no reach objective in the game could ever tick over.**

All three tables are now derived from `WorldMap`. Havens map straight from
`poisOfType('haven')`. Deposits keep their authored element / capacity / refill
and resolve position from a named POI. Quest objectives name the POI —
`at('hammerhead')` — and `at()` throws at load on an unknown id, so a wrong
waypoint cannot quietly resolve to the origin and survive for months.

After: 16 map markers, **0 outside the 8 km field**; drawing energy standing on
`Hammerhead Verge` works; the sabertusk hunt points at the Three Valleys where
sabertusks actually are.

### 3.2 Camping at a haven had no door

Twelve interactables were registered and every one was inside Hammerhead —
`hh_huntboard, hh_diner, hh_garage_shop, hh_culless, hh_caravan, hh_pump,
hh_regalia_bay, hh_rentabird, npc_cindy, npc_cid, …`. `docs/SCOPE.md:335` agreed:
*"the caravan Rest at Hammerhead works; havens are not wired"*.

`src/game/rpg/HavenCamp.ts` registers a `Camp` prompt at all seventeen and opens
a cook/sleep/wait conversation. Installed from `RpgSystem`'s first tick, because
`Interaction` boots six systems after `Rpg` — which also keeps it out of
`Game.ts`.

### 3.3 Cooking had no way in

`PartyState.cook()` and thirty recipes existed with no screen and no prompt. The
camp dialogue now offers whatever Ignis can cook from the bag as it stands. There
is still no *standalone* cook UI (§7).

---

## 4. State — committed and verified on this branch

| commit | what |
|---|---|
| `Add DOM.Iterable to the tools config` | `npm run typecheck:tools` was **red on a clean `main`**, blocking the pre-commit hook for every agent |
| `Give E back to the interaction verb` | §2 — the headline fix |
| `The re-audit probe…` | `src/tools/probes/reaudit.mts`, `epress.mts` |
| `Make integration press the key…` | `integration.mts` 18 → 19 probes; the E verb and resting are now actually tested |
| `Derive the haven table from WorldMap…` | §3.1 havens; `huntloop.mts`, `huntboard.mts` |
| `Register a Camp prompt at every haven` | §3.2 — `src/game/rpg/HavenCamp.ts`, `camp.mts` |
| `Name the places instead of typing them` | §3.1 quests and deposits; `waypoints.mts` |

Measured by driving the real page, after the fixes:

```
PASS  roamers spawn while walking the field   max 18 live creatures, states {field,combat}
PASS  aggro pulls the world into combat       state=combat 6 m from a Sabertusk
PASS  companions damage enemies hands-off     780/780 hp in 15 s with no player input
PASS  E at the caravan actually rests         day 1->2, gil -30, banked 61340->0, level 27->33
PASS  E at the diner buys an item             Antidote, gil -50, held 3->4
PASS  an NPC can be talked to                 "Cindy Aurum" -> dialogue open
PASS  the hunt loop pays                      12 credited kills -> complete, +1100 gil, rank 1->2
PASS  camp at Cotisse Haven                   "[E] Camp Cotisse Haven" -> Cup Noodles -> sleep
                                              day 1->2, 91,200 EXP redeemed, party 27 -> 34
PASS  markers land in the world               16 markers, 0 outside the field; draw at a deposit ok
PASS  party companions fight (gate)           468 hp of 780 off a sabertusk in 0.1 s, hands off
PASS  camp at a haven (gate)                  17 camps; slept at Cotisse Haven; refused 400 m away
```

`npm run check` on a quiet tree: **7/9**, and the two failures are a harness
port collision, not the game — see §7.5.

```
  build         PASS   orphans       PASS  278/278 reachable
  integration   PASS   20/20         uxcheck       PASS  89/89
  creaturecheck PASS   207 poses     combatloop    PASS  30/30
  roadcheck     PASS   0 failures
  heightcheck   FAIL   0.3s  ERR_CONNECTION_REFUSED
  driftcheck    FAIL   0.5s  ERR_CONNECTION_REFUSED
```

`uxcheck` 89/89 is the one that mattered for the E change: yielding the key to
the interaction layer did not cost the menus anything.

And I looked at it. `tmp/shots/haven/camp_cotisse_wide.png` — the rune shelf,
the tent and the fire ring are genuinely built at `(962, -712)`, on the shelf
below Longwythe Peak with a track running up to it, so the `Camp` prompt is
standing on real geometry rather than on a coordinate. Ignis is saying *"The
light is going. We should find a haven before dark"* over it, which as of
tonight is advice a player can act on.

**What a player can do now that they could not this morning:**

1. **Press E.** That is not a joke, it is the whole of it. Every shop, the hunt
   board, the caravan, the fuel pump, the Regalia and every NPC advertised a
   prompt that combat's point-warp ate before the interaction layer ever read
   the key.
2. **Camp.** Walk onto any of seventeen havens, have Ignis cook, sleep, and wake
   up several levels higher — the loop FFXV is built around, which had no
   entrance at all.
3. **Follow a waypoint to a place that exists**, and finish a `reach` objective
   by standing on it.

That closes the loop the plan asks for — fight → reward → spend → fight better —
end to end: a credited kill banks EXP, a hunt pays gil and hunter points, the
gil buys potions at Takka's counter, the banked EXP becomes levels at a haven,
and AP bought on the Ascension grid raises the number `RpgSystem.damage()`
computes for the next warp-strike.

## 5. Traps this cost real time to find, for whoever is next

- **A teleported player drifts out of an interactable's reach within one frame.**
  The collision body settles him, `_pick()` drops the prompt, and the key press
  lands on nothing. Any probe that stands somewhere must pin the position *every
  frame*, not once. The first run of `reaudit.mts` was ambiguous for exactly this
  reason.
- **`e.hit(99999)` credits nothing.** The encounter director hangs EXP, gil,
  drops and quest progress off the combat `damage` event, so a probe that kills
  by calling `hit()` directly sees a hunt stuck at 0/12 and a bank that never
  moves. I nearly filed that as a bug. Kill through combat, or call
  `rpg.enemyKilled()` directly.
- **The seeded mid-game save has no takeable hunts.** Two are already active, one
  is complete, and every other bounty is gated behind hunter points the player
  does not have. A probe that expects the board to accept something will fail
  against a correct game.
- **`docs/SCOPE.md` is as stale as the audit.** It still lists a quest log screen
  and shops-against-the-real-economy as not started; both exist.

## 6. Reported, not edited — the one that needs a decision

**Hammerhead the town and Hammerhead the map pin are 516 m apart.**

`src/world/town/Hammerhead.ts` builds itself at `Ecology`'s `reststop` site —
`integration.mts` prints `town at (576,10)`. `worldMap.poiById('hammerhead')`
resolves through road node `n_hammerhead` to **(60,18)**. So the world map
screen, the minimap, the compass and now every quest waypoint that names
Hammerhead point half a kilometre from the diner they mean.

`WorldMap`'s own header calls itself "the single source of truth for *where
everything is*… so a coordinate only ever exists in one place". Two places
currently disagree, and neither is obviously the wrong one — the town is built
where the vegetation was cleared for it, and the map is what everything else
reads. Somebody who owns `src/world/` has to pick:

- move the `n_hammerhead` road node (and the `hammerhead` POI with it) onto the
  Ecology site, or
- build the town from `worldMap.poiById('hammerhead')` and let Ecology clear the
  ground where the map says, not the other way round.

I have not touched it: `src/world/town/` and `src/world/veg/Ecology.ts` are not
mine. Until it is settled, the Hammerhead-anchored quest waypoints are 516 m out
— which is still a large improvement on the 3 km-world literals they replaced,
and it will fix itself the moment the two agree.

## 7. What is left

1. **Cooking outside a camp has no screen.** The camp dialogue offers Ignis'
   currently-cookable recipes, which is enough for the slice, but there is no
   standalone cook UI and `docs/SCOPE.md:336` still wants one.
2. **`integration.mts`'s remaining presence-only probes.** `party companions
   fight` checks a field exists rather than watching an enemy's HP fall, and
   `player death -> downed -> game over` checks a system is registered. Both are
   behaviours `reaudit.mts` covers and the gate does not. Fold them in.
3. **`inventory + gil economy` prints `(undefined curative)`** — that probe calls
   `listByCategory('curative')`; the method takes no argument and returns a
   grouped map. A gate cosmetic, not a game bug.
4. **Hunter rank is the gate on all remaining hunt content, and nobody has
   designed the curve.** Twelve of the fifteen bounties are locked behind hunter
   points; the seeded save has one point and a rank-1 hunt pays one. At that rate
   the Meldacio tome opens after roughly seventy-five rank-1 hunts. Worth an hour
   of design before WS-4 authors anything new.
5. **`heightcheck` and `driftcheck` cannot pass in a multi-agent session, and
   it is the harness, not the game.** Neither starts its own server; they take
   the aux one `check.mts` puts on **`PORT + 50`**. With agents assigned ports
   fifty apart, that is *another agent's port*: mine is 5340, so the aux port is
   5390, and 5390 was already held (`vite: Port 5390 is already in use`, pid
   66679 listening and refusing the game page). `check.mts` swallows the failure
   — `try { aux = await serve(auxPort) } catch { /* reported by the gate */ }` —
   and the two gates then fail 0.3 s later against a port serving something
   else. Both gates were green on a single-agent tree yesterday.

   The fix is one line in `check.mts`: pick a *free* aux port instead of a fixed
   offset. I have left it alone because a coordinator running the suite alone
   will not see this and may prefer a different allocation scheme.

   Also worth knowing: **do not run a probe while `npm run check` is running.**
   An earlier run of mine came back 5/9 with `uxcheck` and `creaturecheck` dead
   on connection-refused — `creaturecheck` printed `207 poses probed · 0
   failures` and *then* failed. That was my probe on the same port, not a
   regression.

Files touched: `src/combat/CombatSystem.ts`, `src/game/rpg/DayCycle.ts`,
`src/game/rpg/Elemancy.ts`, `src/game/rpg/HavenCamp.ts` (new),
`src/game/rpg/Quests.ts`, `src/game/rpg/RpgSystem.ts`,
`src/tools/integration.mts`, `tsconfig.tools.json`, and six probes under
`src/tools/probes/`.
