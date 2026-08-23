# Handoff — inventory (docs/SCOPE.md, docs/WORLDMAP.md)

**Lane:** documentation truth. Read-only in `src/`; owns `docs/SCOPE.md`,
`docs/WORLDMAP.md` and anything new under `docs/`.

**Branch:** `worktree-agent-aa1d53823ec82c26f`, merged from `main` @ `593b373`
(421 commits). The worktree started 88 commits behind; the merge was the first act.

## State — done, and mergeable

Both documents are re-verified and rewritten. Three commits, one concern each:
the handoff, the WORLDMAP corrections, the SCOPE rewrite. Nothing in `src/` was
touched.

## Method

Six parallel read-only audits, one per SCOPE section group, each required to cite
`file:line` for every verdict and to mark UNVERIFIED rather than guess. Every
number they returned that mattered I re-counted myself before it went in the
document — the counts below are mine, not theirs. `roadcheck.mts` and
`orphans.mts` were actually run; nothing else needed a browser.

## How wrong SCOPE.md was, and in which direction

Stale by 323 commits, and wrong **in both directions** — but the dominant error
was **understatement**.

- **Fifteen atoms marked `[ ]` or `[~]` are shipped and reachable.** Quest
  coordinates (all 44 waypoints go through `at(poiId)` → `worldMap.poiById`,
  which throws on an unknown id; zero literal coordinate pairs in the table),
  shops trading real gil, four of the five camp-and-rest boxes, side quests with
  real objectives, the quest log screen, the settings screen, the tutorial hints,
  elemental deposits, fast travel, quality tiers.
- **Two dozen systems were not listed at all.** The `?debug` dev suite (10
  modules). Three registered, gate-tested screens (Armiger, Archive, Controls).
  The horizon bake. The drawn-surface API. The per-zone surface palette. The
  grass shadow proxy. `TexBake` and the three baked artifacts. Six new tools and
  the VOID verdict. The prop infrastructure — `TileStream`, `ZoneDress`,
  `PartBuilder`, `PropMaterials`, `CreatureGeo`, `EcoSites`.
- **The counts that were simply wrong:** 620,000 erosion droplets, not 420k ·
  7 tree species, not 4 · 12 techniques, not the 8 named (two of which,
  "Royal Guard" and "Trigger-Happy", do not exist) · 12 kinds of debris, not 3 ·
  region levels 1-15 / 15-35 / 35-60, not 1-12 / 12-30 / 30-50 · 11 gates, not 9.
  "Saddles" are listed in the silhouette variety and exist in no code.
- **The self-contradiction:** §11 said the Ascension screen drew a *fake* grid
  while §8, in the same file, said it rendered the real 106-node graph. §8 was
  right.
- **Overstatement, three atoms:** the field boss, the imperial set piece and the
  Titan fight were `[x]` and are unreachable (below).

### The new third state

`[~]` no longer means "in progress" — that is `STATUS.md`'s genre, and
`project/README.md` says an inventory is not a tracker. It now means **built and
unreachable**: the code exists, `orphans.mts` proves it reachable from `main.ts`,
and no input path in a played session gets to it. Eighteen atoms are in that
state and each names the caller that is missing. This is the distinction the
document had no way to write down, and it is the one that cost this project
5,765 lines of dead RPG code.

## Code defects found — reported, not touched

Ordered by how much play they block.

1. **Chapter 3 cannot close.** `main_ch3_deadeye`
   (`src/game/rpg/Quests.ts:266`) requires `kill('deadeye', …)`. `deadeye` is
   defined (`src/characters/enemies/Bestiary.ts:110`, a Behemoth reskinned from
   the Bandersnatch, 34,000 HP, `boss: true`) and **nothing spawns it** — it
   appears nowhere in `src/game/encounters/SpawnTables.ts`.
   `src/game/story/StorySystem.ts:255` needs *every* chapter quest complete
   before `completeChapter` fires, so chapter 4 never starts, its card never
   prints and its quest is never accepted. (`RpgSystem.ts:321` separately bumps
   `rpg.chapter` on any main-quest completion, which is why the two disagree.)
2. **No dungeon can be entered.** `src/world/dungeons/Dungeons.ts:206-225`
   states it outright: entrances are handed to no interaction system, because the
   old wiring called `Interaction.add` (the method is `register`) with every
   field of the payload wrong, so the guard was always false. `enter()` is
   reached only by the capture harness and `integration.mts`, and **nothing reads
   `Dungeons.prompt`**. Three built dungeons, their treasure, hazards and locked
   doors are all unreachable. The comment gives the exact `register` call needed.
3. **The whole boss set-piece path is dead.** `BossFight` is constructed only by
   `EncounterDirector.startSetPiece`, called only by `HuntRuntime.arm:66` behind
   `if (t.setPiece)`, and **no `HUNT_TARGETS` entry sets `setPiece`**. So
   `TitanArena` (a complete merged-mesh basalt arena with quake and rising
   spires), the phase machine, and `magitek_armour` and `bloodhorn` never run —
   not in play and not in the harness, since `Director._bossScenario` spawns the
   enemy directly and freezes it. `SetPiece.music` is inert by its own admission.
4. **Elemancy crafting has no in-game door.** `RpgSystem.craftSpell:612` is
   called only from `src/tools/combatloop.mts:497`; no screen imports Elemancy.
   The quest objective "Craft your first spell" (`Quests.ts:456`) is therefore
   uncompletable. Drawing energy and casting equipped spells *are* wired.
5. **`escort`, `photo` and `fish` objective types are declared and never
   notified** (`Quests.ts:109-115`); `fetch` fires from exactly one hard-coded
   dialogue line, and `Inventory.add` does not notify the log. Any quest carrying
   one of those cannot complete.
6. **`CameraRig.setLockOn` still has no caller** (`src/game/CameraRig.ts:201`),
   so `lockOn` has been `null` since it was written and the combat-framing block
   at `:329-339` has never executed. Re-verified on this tree; `LANDMINES.md`
   already carries it, and the file's own comment at `:71-73` says so.
7. **`BossFight.resolveStrike` / `slamAt` / `_handPos` are still dead** —
   `Enemies.onStrike` routes to `EncounterDirector.resolveStrike`, an arc sweep
   off the enemy root. Titan's forty-metre fist has never landed where the hand
   is. Now doubly dead, since `BossFight` never instantiates.
8. **`RegaliaSystem.nightDanger()` has no callers** (`:693-698`).
9. **`CombatSystem` accepts `aerial` and forwards `isAerial` to the damage
   formula, and nothing ever passes `true`** — the aerial bonus is unreachable.
10. **`VfxTextures.blobDecal()` ("blood pools") has zero callers.**
11. **`Inventory.SHOPS`** (`:808-830`) is a second 5-outpost stock table exposed
    as `rpg.tables.shops` and read by nothing; `ShopScreen` uses
    `world/town/Shops.ts`. Duplicate data, and the two can drift.
12. **Fast travel moves only the player.** `WorldMapScreen.accept():370-382`
    sets `player.position` and `player.root.position`; the party and the Regalia
    stay where they were, and nothing charges time or gil.

### Docstrings that contradict their own code

Cheap to fix, and each one is a future wrong diagnosis:

- `src/characters/rig/Skeleton.ts:6` says 34 bones; the builder emits **40**.
- `src/game/rpg/Stats.ts` header says the EXP curve totals ~26M; it is
  **24,224,330**.
- `src/game/rpg/Emitter.ts:1-7` says "no wildcards"; the `emit` comment three
  lines down admits `'*'` works.
- `src/game/Shots.ts:383-396` lists six zone id/name mismatches; there are
  **seven** — it misses `lestallum_shelf` → `zone_lestallum`.
- ~~`src/tools/check.mts:52-53` `expect` strings still say `integration` 18 pass
  and `uxcheck` 86/86; `STATUS.md` reports 20/20 and 89/89.~~ **FIXED
  2026-08-23**, and all three numbers were wrong: a full `check` run gives
  `integration` **27**, `uxcheck` **93/93**, `combatloop` **31/31**. The `expect`
  strings and `STATUS.md` now both carry the measured values. This entry was
  right that it is display-only and right that it matters — it is what a failing
  gate prints at you, and it was the thread that unravelled four documents
  disagreeing about one gate suite.
- `src/world/veg/GrassField.ts:591` says tufts are 0.15–0.35 m; the height law
  at `:104-105` admits ≈0.06–0.48 m and the file's own `:90` says mean 0.157 m.

### Numbers that reproduce from nothing

`docs/SCOPE.md` claimed character proportions of **7.77 heads, 2.84 shoulder
widths, legs 49.3%**. None of those three literals appears anywhere in `src/`,
and recomputing from `src/characters/rig/Skeleton.ts:98,126-129,196-206` gives
**7.44 heads**, height ÷ biacromial **5.06**, hip height **51.4%** of stature.
Either the targets or the rig moved and nothing recorded which. The line now
says so rather than repeating the numbers. Whoever owns `characters/` should
decide which set is the target.

## Cache state, not a defect

**`src/public/baked/` holds two artifacts, not three.** `terrain.bin.gz` and
`tex.bin.gz` are present; **`texc.bin.gz`** (the canvas-drawn painted faces with
hand-built mip chains) **is absent**. It is written only by
`node src/tools/texbake.mts --canvas`, which needs a browser — neither the vite
plugin nor a plain `texbake --force` produces it, and
`vite-plugin-bake.mts:28-37` says so explicitly and can only *prune* a stale one.
So any cold-boot figure below ~9 s is not reproducible on this checkout until
someone runs `--canvas`.

## WORLDMAP.md — what was verified and what was wrong

Verified by measurement, not reading: 8192 m and sea level −6.5 (`WorldMap.ts:23-33`) ·
2048²/4 m near grid and 1024²/32 m frontier (`Field.ts:42-47`) · all 19 zone
centres, extents and level bands, row by row · 124 POIs with the exact type
breakdown · 48 landforms · 19 routes over 50 junctions and 50 edges · 30.26 km
split 8.89 / 11.90 / 9.47 · 18 dead ends and 18 turning circles · 39 drivable
POIs, 0 unreachable — the road figures from an actual `roadcheck.mts` run. Twelve
of the thirteen traversal rows reproduce to the second.

Wrong, and now fixed:

- **`Crown City Checkpoint` was (3856, 546)**; the POI is at **(3478, 498)**
  (`WorldMap.ts:414`).
- **The `Hammerhead → Keycatrich Ruins` row** read 2m03s / 4m24s / 10m15s for
  chocobo / sprint / walk; `travel()` returns **2m21s / 5m02s / 11m45s**. The
  drive column (1m05s over 1.69 km) still reproduces — which is the tell: drive
  routes on the graph and did not move, the other three are straight-line, so the
  **POI** moved and the road did not.
- **`Ecology.worldRadius` is no longer 620 m.** `Ecology.ts:126` computes
  `Math.min(4200, tsize * 0.5 - 40)` = **4056 m**. §7's first open item is closed.
- **The traversal table's `road km` column governs the `drive` column only.**
  `WorldMap.travel()` routes on the graph for `drive` and uses straight line
  × 1.15 (chocobo) / × 1.25 (walk, sprint). Every number was right; the heading
  promised something the code does not do. Now stated above the table.

Added: a §8 for the zone-id vs display-name trap with the full seven-row table,
the horizon bake and the PoiKits geometry in §6, and two new open items (fast
travel is player-only; map discovery does not survive a reload, because
`FogOfWar` has no serialiser and `SaveData` has no map field).

## For whoever picks this up

- **The document is now falsifiable and the counts are re-derivable.** Re-verify
  by re-counting the arrays and by grepping for *callers*, never for definitions.
  Three of the corrections above were features whose only caller was a gate.
- `project/STATUS.md` item 3 ("Re-verify `docs/SCOPE.md`") is done, and its
  "Where the truth is" section still calls SCOPE stale at 98 commits. That file
  is the coordinator's; it needs one line changed.
- The twelve defects above have no home in a queue. Per `project/README.md`
  ("if it is not in a queue, it does not exist") they belong in `TODO.md` (the
  human's) or a `docs/plans/` file — not here. Numbers 1, 2 and 3 each block a
  visible slice of the game and are small, contained fixes.
