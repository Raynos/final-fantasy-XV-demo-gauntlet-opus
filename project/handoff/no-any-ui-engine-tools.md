# `src/ui`, `src/dev`, `src/engine`, `src/tools` — at zero `any`

Companion to `project/handoff/no-any.md`, which is the whole-repo picture. This
one covers the four directories that were driven to zero in one pass.

**Status: done.** 738 → **1**, and the one that is left is
`src/tools/browser.d.ts`'s `declare module '/*'` wildcard (see the bottom).
Both typechecks are clean for these four trees and `vite build` passes.

    node src/tools/anycheck.mts --by-file | grep -E 'src/(ui|dev|engine|tools)/'

`src/tools/typemods/**` and `src/tools/daemon.mts` were out of bounds and are
untouched.

---

## The contracts that were introduced

Everything below is exported, so the next reader reuses it rather than
re-deriving it.

### `src/ui/GameData.ts` — the HUD contract (30 → 0)

`hudState(game): any | null` collapsed to plain `any`, which left every
`hs.*` read in `CompassBar`, `HUD`, `CombatHUD`, `MainScreen` and
`InventoryScreen` unchecked. It now returns **`HudState`**, and the whole
read-side vocabulary lives beside it:

| type | what it is |
|---|---|
| `HudState`, `HudBuff`, `HudMember`, `HudCache` | one frame of `RpgSystem.hudState()`, and the memo `Game` holds |
| `PartyView`, `WeaponView`, `ItemView`, `GearSlotView`, `TechniqueView`, `MarkerView`, `QuestLine` | what each `read*()` hands a screen |
| `AscensionView`, `AscensionNode`, `AscensionEdge`, `ConstellationInfo`, `UnlockCheck`, `AscensionEffect` | the star map |
| `DamageRoll`, `RollOpts` | `rollDamage()` |
| `QuestView`, `QuestObjectiveView`, `QuestWaypoint` | **re-exported** from `game/rpg/Quests.ts` rather than restated |

The rule the file now follows: `src/ui` reaches into `src/game/rpg/**` *here
and nowhere else*, so every RPG type a screen needs is re-exported from this
module.

### `src/ui/Menus.ts` — `ScreenMap` / `ScreenName` / `MenuScreen`

- **`ScreenMap`** maps each of the fifteen slots to its concrete screen class,
  with `shop`/`hunts` optional because `Hammerhead._registerScreens` adds them
  only once the outpost is built. Keeping the concrete classes is what lets
  `NpcDialogue` still call `menus.screens.shop.setShop(id)`.
- **`ScreenName = keyof ScreenMap`** now types `setScreen`, `push`,
  `toggleScreen`, `Menus.stack`, `Interactables.openScreen` and
  `ShotState.menu` — so a typo'd screen name in a shot definition or an
  interactable is a compile error.
- **`MenuScreen`** is what the stack requires of a screen. `node!: HTMLElement`
  is declared on **all thirteen** screen classes now, not just the two the
  brief named: none of them declared it, and `Menus.init` assigns it.

### Engine

- `src/engine/Renderer.ts` — **`QUALITY_TIERS` / `QualityTier` /
  `isQualityTier`**. `?q=`, the dev console and `SystemScreen` all hand over a
  string, and nothing checked it; an unrecognised tier now lands on `'high'`
  instead of being carried around as a tier name every `=== 'low'` test misses.
  `PostFX.setQuality`, `LIGHT_BUDGET` and `SystemScreen`'s choice row all key
  off the union.
- `src/engine/Warmup.ts` — `WarmupStep`, and `PostFX.WarmupReport` for what
  `precompile()` returns.
- `src/engine/Input.ts` — `MouseState`, real DOM event types on all seven
  listeners.
- `src/engine/LightBudget.ts` — `LightKind`, `LightEntry`, and the three.js
  guards instead of `o.isLight`.
- `src/engine/postfx/**` — every pass takes `fx: PostFX`, every
  `render(renderer, writeBuffer, readBuffer)` takes real render targets, and
  `VelocityPass` has `TrackedMesh`.

### Dev suite

`Registry.Cvar` is now generic in its value type with `get`/`set` declared as
**methods** — bivariance is what lets a `number` cvar and a `boolean` cvar live
in one `Map` without every registration widening its own setter. `Command.exec`
takes the argument string and may return a promise. Also: `CvarValue`,
`CvarDelta`, `ReviewNote` (`Report.ts`), `StagedAsset`/`AssetFamily`/
`ReviewMark` (`AssetBrowser.ts`), `CameraBookmark` (`DevSuite.ts`).

### UI widgets

`ElAttrs` (`UIKit.ts`), `IconOpts`/`ButtonOpts` (`Icons.ts`), and one local
interface per widget for its per-frame node caches — `PartyRow`, `CompassTick`,
`CompassMark`, `Nameplate`, `FloatingNumber`, `PlateEnemy`, `DamageEvent`,
`Callout`, `Hint`, `Toast`, `SettingRow` (a four-arm discriminated union),
`GridNode`/`GridEdge`/`GridConstellation`, `HuntRow`, `ShopRow`, `ArchiveRow`,
`PickerRow`/`Picker`/`GearCard`, `ChartPoint`/`ChartDrag`/`RegionLabel`.

`HudBridge` gained **`RpgEvents`**, a name→payload map for the ten emitter
events it subscribes to, and its combat side now subscribes through the
`WindowEventMap` augmentation with each `combat:*` name written out literally —
which is what makes `e.detail` the payload of *that* event with nothing cast.

---

## Real bugs this found

1. **`Minimap.waypoint` is never assigned by anything in the repo.** The
   quest-waypoint ring on the minimap has therefore never been drawn.
   `GameData.readQuest().waypoint` and `readMarkers()` both publish exactly
   what it wants. The field is typed and initialised to `null` (behaviour
   unchanged); **wiring it is a one-line change nobody has made.**
2. **`Minimap._flash` is written on every POI discovery and read by nothing** —
   the "location discovered" flourish it exists for has never appeared.
3. **`CombatHUD._syncPlates` lit every nameplate at once.** The focus test was
   `lockOn === e2 || lockOn === e2.ref || lockOn.ref === e2.ref`. `Enemy` has no
   `ref`, so the third arm read `undefined === e2.ref` — true for *every*
   stand-in plate simultaneously whenever a capture ran with a lock set. Arm
   removed.
4. **`PostFX._headNode` had three dead fallbacks.** `char.eyes` is built for
   every character, so `attach.head`, `rig.byName.head` and `rig.byName.Head`
   could never run — and `Head` was never a bone name at all; `Skeleton.ts`
   writes them all lower-case.
5. **`AssetBrowser._enemy` pivoted every creature at a flat 1.1 m.**
   `e.stats.height` — `Enemy` has no `stats`; the species block is `e.type` and
   the resolved height is `e.height`, which is what the sibling `_hero`/`_npc`
   factories already orbit around. (Fixed concurrently by the characters agent.)
6. **`DevSuite` / `Report` both guessed `poi.id` on `nearestPOI()`**, which
   returns `{ poi, dist }`. The `poi.id` arm has never resolved. Also
   `zone.id || zone.name` and `region.id || region.name`: `id` is always
   present, so the second arms were dead.
7. **`Registry.exec` printed the literal text `[object Promise]`** for
   `shot.save`, the one command whose `exec` is async. It now returns
   `"shot.save: working…"` and the command reports its real result through
   `DevConsole.print` as it always did.
8. **`Quests.waypoints()` declared a return type missing `type`**, which every
   waypoint it builds carries and `readMarkers` reads.
9. **`Quest` did not declare `summary` or `region`** even though all thirty
   quests have both and `readQuest` reads both.
10. **`combat:armiger` and `combat:spell` were missing from the
    `WindowEventMap` augmentation** although `HudBridge` subscribes to both.
    Added, along with `encounter:tech` and `encounter:kill`.
11. **Two different `ItemDef`s existed.** `world/town/Shops.ts` carried a
    five-field local copy written while the RPG layer was untyped;
    `ShopScreen` had to reconcile them. The copy is gone — it re-exports
    `Inventory.ItemDef`.

### And one in the ratchet itself

**`anycheck.mts` was undercounting.** Its comment/string stripper did not know
about regex literals, so `/^\s*doc:\s*['"](.*)['"],?\s*$/` in `corpus.mts`
opened a "string" that ran to the next quote anywhere in the file. That file
collapsed from 14 988 characters to 2 221 and reported **0** `any` while
carrying **fourteen**. The stripper now skips regex literals (tracking `[...]`
so a `/` inside a character class does not end them early). Every file with a
quote inside a regex was affected; the repo total moved *up* on the fix and is
still far below the ceiling, so no gate changed behaviour.

---

## Out-of-scope files this had to touch

All small, all reported here because they belong to other workstreams:

| file | why |
|---|---|
| `src/game/Game.ts` | `_hudCache!: any` → `HudCache \| null` |
| `src/game/Shots.ts` | `menu?: string` → `ScreenName` |
| `src/game/interaction/Interactables.ts` | `openScreen(name: ScreenName)` |
| `src/game/rpg/Quests.ts` | `Quest.summary`/`Quest.region`; `waypoints()` return type |
| `src/world/town/Hammerhead.ts` | `_registerScreens` now assigns `s.node` directly instead of `Object.assign`-ing it on |
| `src/world/town/Shops.ts` | duplicate `ItemDef` removed |
| `src/globals.d.ts` | four missing `WindowEventMap` entries |

---

## What is left

One `any`: `src/tools/browser.d.ts`'s `declare module '/*' { const mod: any }`,
the harness's in-page URL imports. Mapping each URL to the real module
(`declare module '/ui/Minimap.ts' { export * from '../ui/Minimap.ts' }`) **does
not work** — TypeScript treats an ambient module name beginning with `/` as a
rooted path and refuses to match the declaration, so only the wildcard form
resolves at all. Closing it means giving `tsconfig.tools.json` a path mapping
from `/` to `src/`, which is a build-config change rather than a typing one.

`window.GAME` is still `any` in `src/globals.d.ts` (out of scope, and typing it
`Game` would put every `page.evaluate` body in the harness under the checker at
once — a real piece of work, and the right next one for whoever picks this up).

## Verification

- `pnpm exec tsc --noEmit -p tsconfig.json` and `-p tsconfig.tools.json`: clean for
  these four trees.
- `pnpm exec vite build`: passes.
- `uxcheck.mts` could **not** be completed: with four agents editing `src/` the
  dev server's HMR reloads the page mid-run and playwright reports "Execution
  context was destroyed". It needs a quiet tree. The first nine assertions
  (every main-menu row routes to a registered screen — the part that exercises
  the new `ScreenMap`) passed before the reload.
