# Game Studio v2 — the studio is not the game

Status: **IN-PROGRESS (2026-09-02, opus)** — supersedes the architecture of
`2026-09-02-opus-game-studio.md`, whose information architecture survives
intact. **V1-V3 and the gate are built, shipped and green** (`pnpm run check`
24/24); V4-V8 are open. `project/handoff/game-studio.md` is the live state.

---

## 0. The verdict on v1

v1 works and is wrong. Every complaint the human raised on it is the same
mistake seen from a different angle:

> "why do you actually load the full game in the background of the game studio"
> "The model explorer should not have the game running in the background"
> "why are the characters spawned etc like the model explorer is a completely
> standalone brand new thing"
> "The world explorer should also not have the game or the characters — just the
> geometry of the world"

**I built the studio as an overlay on a running game, because that is what
`src/dev/` is.** `DevSuite` is a debug overlay: you are playing, you press a
key, you inspect. Every assumption in it — `Stage` hides the world by clearing
`visible` on scene children, `AssetBrowser` spawns enemies through the pooled
`Enemies` system, the camera is stolen from `CameraRig` — is correct *for an
overlay* and wrong for a mode. I promoted the overlay instead of building the
mode, and the symptoms follow mechanically:

| symptom | cause |
|---|---|
| 6.5 s of boot before a two-row menu | `main.ts` awaits the **whole** `game.init()` — 30 systems — before deciding which door to open |
| the party stands in the studio menu shot | `Player`, `Party` and `Npcs` were booted and are in the scene |
| an enemy has to be spawned to look at it | `AssetBrowser._enemy` calls `enemies.spawn()`, which needs the pooled `Enemies` system, which needs the game |
| `holdWorld()` clearing encounters every frame | there are encounters, because `Encounters` was booted |
| `pumpWorld()` hand-ticking the streamers | the world is paused because the *game* is paused, because there is a game |
| `Stage` blanking `scene.children` | there is a world in the scene that has to be hidden |

`holdWorld` and `pumpWorld` are the tell. Both are machinery for suppressing
things that should never have existed. **The correct amount of code for holding
the game still in the studio is zero, because the game is not running.**

---

## 1. What the audit found in v1's own code

Separate from the architecture, reading 1,654 lines back:

1. **Full DOM rebuild on every interaction.** `render()` does
   `side.textContent = ''` and re-creates every row — 170 `<button>`s and their
   children on every arrival click, 23 on every pose step. It also **loses
   scroll position**, so stepping an asset in a long family scrolls you back to
   the top.
2. **`places()` allocates 170 objects per render**, plus a `Map` of every POI,
   because it is called from `render()`.
3. **No search anywhere.** 170 destinations and 50 assets, navigable only by
   scrolling. Every real editor is search-first (§2).
4. **No virtualization.** All 170 rows are in the DOM at once.
5. **`hideGameUi()` runs three `getElementById` calls 60×/second**, forever.
6. **Stale readouts.** `onSection` fires on section change only, so any state
   change made outside a click handler leaves the chrome stale — this bit twice
   during L2 and both times a capture caught it.
7. **Exit costs a full reload** (~6.5 s), which is only tolerable because the
   studio's own state is trivial. It stops being tolerable the moment the
   studio is where you live.
8. **`st-side` overlays the viewport** rather than laying out beside it, so a
   wide model is drawn *behind* the list.
9. **No thumbnails.** A list of 23 lowercase ids is not how anybody picks a
   creature.
10. **The mobile shell renders no section at all.**

Items 1–4 and 7 are performance; 3, 6, 8, 9, 10 are UX. The architecture change
in §3 makes 5 and 6 disappear and makes 7 cheap.

---

## 2. What real editors do, and what we take

Sources: [Unreal Content Browser](https://dev.epicgames.com/documentation/en-us/unreal-engine/content-browser-in-unreal-engine),
[Content Browser UI](https://docs.unrealengine.com/4.26/en-US/Basics/ContentBrowser/UI),
[Unity → Unreal overview](https://dev.epicgames.com/documentation/unreal-engine/unity-to-unreal-engine-overview?lang=en-US),
[Command Palette pattern](https://uxpatterns.dev/patterns/advanced/command-palette),
[Designing a Command Palette](https://destiner.io/blog/post/designing-a-command-palette/),
[Command Palette UX Patterns](https://medium.com/design-bootcamp/command-palette-ux-patterns-1-d6b6e68f30c1),
[3D model viewer UX](https://hwan-h-heo.github.io/blogs/posts/3d-model-viewer-in-web/).

| pattern | where from | what we take |
|---|---|---|
| **Tiles / List / Columns** view switch | Unreal Content Browser | Tiles with rendered thumbnails as the *default* for models. A grid of 23 creatures is scannable; a column of 23 ids is not |
| **Search by name, path, tag, type; `-` to exclude** | Unreal | One search box per section, matching name **and** id **and** type, `-` prefix excludes |
| **Command palette, fuzzy, keyboard-first, virtualized** | Sublime → VS Code → Zed, Linear, GitHub | `⌘K` / `Ctrl+K` opens one palette over the whole studio: every place, every model, every command. This is the single biggest UX win available and it costs one component |
| **Collections** | Unreal | Deferred. Our equivalent is the existing `ok`/`flag` verdict, which already filters |
| **Live stats: meshes, tris, materials, bounds in metres** | model-viewer / Sketchfab / Babylon inspector | Already built in v1 — keep, and add it to the World Explorer for the subtree you are looking at |
| **Shading swap: original / clay / wireframe / normals** | Sketchfab, Babylon inspector | `ViewModes` already has wireframe, unlit, normals, overdraw. Surface it in both explorers, not just Look Lab |
| **Panel collapses to a floating button on small screens** | model-viewer mobile guidance | The mobile shell's bottom sheet. The viewport is never shared with a list on a phone |
| **Visible affordance or the viewer reads as a heavy static image** | 3D commerce UX | A drag hint on first entry to any viewport, dismissed on first drag |
| **One finger orbit, two pinch, two-finger drag pan** | model-viewer mobile convention | Exactly this, rather than inventing |

The thing worth stating plainly: **every one of these tools is search-first and
thumbnail-first, and v1 is neither.** That, not the panel layout, is the UX gap.

---

## 3. The architecture: three boot profiles, not one

The whole of v1's trouble is that there is one boot and it is "the entire game".
v2 has three, and the studio picks one **before** anything heavy runs.

```
                      ┌──────────────────────────────────────────┐
   index.html         │  FRONT DOOR        ~0.3 s, no systems    │
   main.ts        ──► │  PLAY  /  GAME STUDIO                    │
                      └───────┬───────────────────┬──────────────┘
                              │                   │
                 profile FULL │                   │ profile chosen per section
                              ▼                   ▼
              ┌───────────────────────┐   ┌───────────────────────────────┐
              │ 30 systems, as today  │   │ MODEL:  0 systems             │
              │ title → attract → game│   │ WORLD:  5 systems, geometry   │
              └───────────────────────┘   └───────────────────────────────┘
```

### 3.1 The front door boots nothing

`main.ts` currently does `game.init().then(...)`. In v2 the front door is
rendered **first**, from its own module, against its own backdrop — and
`game.init()` is not called until a choice is made. The door is a crest, two
rows and a fade; it needs no renderer, no scene and no world.

That is the load-time fix, and it is worth roughly **6.2 of the 6.5 seconds**
before anybody can press a key.

The attract camera over Leide moves to *behind the title screen*, where it
belongs — you see it after choosing PLAY, while the game boots, which is
exactly when a game shows you a vista.

### 3.2 Model Explorer boots **zero** game systems

It gets its own `THREE.Scene`, its own three-point rig, its own camera, and it
builds one model at a time from the factories that already exist and are already
standalone:

| family | factory | needs a Game? |
|---|---|---|
| Party | `makeCharacter(key)` | **no** |
| NPCs | `new NpcBody(archetype(...), 7)` | **no** |
| Weapons | `new Weapon(key)` | **no** |
| Chocobo | `buildChocoboPrototype(colours)` | **no** |
| Regalia | `new VehicleBody()` | **no** |
| Enemies | `type.make({...})` + `attachVisual(prototype(key))` | **the one exception** — v1 went through `Enemies.spawn()`, a pool that belongs to the game. v2 calls the species factory directly |

**`Stage` is not reused.** Its whole method — walk `scene.children`, clear
`visible` on anything that is not a light or the sky — exists because there is a
world in the way. In a scene containing one model there is nothing to hide, so
the code does not exist. The three-quarter key, the bounds-derived framing and
the quadruped `faceOffset` are the parts worth keeping and they move into
`studio/scene/ModelStage.ts` as ~40 lines.

**The light budget objection does not apply.** `LightBudget` pins light counts
because changing them re-keys every material's program in *the game's* scene.
The model scene's materials are freshly built for a model that only exists here,
so its three lights cost three programs and nothing else recompiles.

### 3.3 World Explorer boots **five** systems — geometry only

```
  Sky · Terrain · Water · Vegetation · Props
```

and none of `Player`, `Party`, `Enemies`, `Combat`, `Camera`, `Regalia`,
`Chocobo`, `Swim`, `Underwater`, `Audio`, `Rpg`, `HUD`, `Minimap`, `Menus`,
`Cinematics`, `Story`, `Interaction`, `Town`, `Cities`, `Npcs`, `Director`,
`Dungeons`, `VFX`, `Weather`.

**This is verified, not hoped.** Every cross-dependency those five have on a
system outside the set is already guarded, checked in the source on 2026-09-02:

```
  Vegetation  game.get('Player')      →  if (player) add(player, 1.35)
              game.get('Party')       →  if (party && Array.isArray(party.members))
              game.get('Enemies')     →  if (enemies && Array.isArray(enemies.list))
              game.get('Weather')     →  const base = w && w.windStrength != null ? … : 1.0
  Water       game.get('Menus')       →  if (menus && menus.name && …)
  Props       game.get('Vegetation')  →  (veg && veg.ecology) || new Ecology(game, seed)
              game.get('Sky')         →  if (!sky || !sky.sun) return 0
  Sky         game.get('Terrain')     →  if (!terrain || !terrain.heightAt) return camera.near
```

Nothing throws on a missing system. The subset is a supported configuration by
accident of good defensive style, and §7 adds a gate so it stays one.

With no `Player` and no `Party` there is nobody in the frame, and with no
`Encounters` there is nothing to spawn — so `holdWorld()` is **deleted**, not
improved. With no game to pause, `game.paused` is never set, so `Props.update`
runs in the ordinary loop and `pumpWorld()` is **deleted** too.

### 3.4 How a subset boots without editing `Game.ts`

BRIEF rule 4 forbids editing `src/game/Game.ts`, and `init()` is monolithic. So
`studio/StudioBoot.ts` reproduces `init()`'s eight-line prologue — `Renderer`,
scene, camera, `Input`, seed — then boots only the systems it wants through
`game.add()`, which is already public and is what `init()`'s own `step()` uses,
then `new PostFX(rnd)` and a compile pass.

That duplication is the honest cost of rule 4, and it is a real risk: if the
prologue changes, the studio drifts silently. §7 gates it.

### 3.5 Exit stops being a reload

With no game booted there is nothing to restore, so leaving a section is
`scene.clear()` and leaving the studio is a front-door re-render. The reload
that v1 justified by "unwinding all of that exactly is a bug farm" was itself a
consequence of running inside the game. **Only PLAY costs a boot, and it costs
it once.**

---

## 4. The UX rebuild

### 4.1 Command palette — `⌘K` / `Ctrl+K`

One surface over the entire studio: every model, every place, every command,
fuzzy-matched, keyboard-driven, virtualized. Type `blood` → bloodhorn; type
`hammer` → Hammerhead; type `wire` → wireframe mode. Results carry their kind as
a chip so `tomb` disambiguates ten royal tombs from the dungeon.

This is the single highest-value item in v2. It replaces navigation for anyone
who knows what they want, and it is the only thing that makes 220 destinations
plus 50 models tractable without a hierarchy.

### 4.2 Search and filter in every list

A box at the top of each list; matches name, id and type; `-` prefix excludes,
per Unreal. Plus the verdict filter v1 already has (`unreviewed` only).

### 4.3 Thumbnails, and a tile view for models

Render each model once to a 128 px offscreen target, cache it. A tile grid is
the default view for models, list for places. This is what makes 23 creatures
pickable rather than 23 lowercase strings.

### 4.4 Lists that do not rebuild

Rows are created once per dataset and **reconciled** by key, not recreated;
selection is a class toggle. Scroll position survives, which it does not today.
Above 200 rows, windowing.

### 4.5 The viewport is not shared with a panel

Desktop lays out as a real grid — list column, viewport column — so a wide model
is never drawn behind the list. Mobile keeps one screen at a time and collapses
controls into a bottom sheet.

### 4.6 Affordance

A one-time drag hint on the first viewport a session shows, dismissed on first
interaction. Per the 3D-commerce finding: a viewer with no visible affordance
reads as an unusually heavy static image.

---

## 5. What is kept from v1

Unchanged and still correct: the six sections and what earns a top-level slot
(§3 of v1), `Sections.ts` as one table both shells render from, the
`unreviewed / ok / flag` verdict, runtime registry counts, the Signature band as
an authored list, per-entry `back` distances, `Freecam` for flight,
`Registry` as the substrate, Notes hidden on the deployed build, the JIT
landscape gate, and BRIEF's UI voice denser.

Five bugs v1 found the hard way are kept as **fixed behaviour with their
reasons**, because every one of them is still live in v2:

1. The party rig faces **+Z** — measured off Noctis's eye meshes at local
   z = +0.073, not guessed.
2. A rotation written once does not stick against a held animation; it is a
   per-frame pin.
3. `Stage.exit` restoring `#ui`/`#title`/`#hints` — moot in v2, since the studio
   never boots them.
4. Registry counts are read at runtime. Three sources said 8, 17 and 18.
5. `shoot.mts` cannot photograph the studio; `probe.mts` can.

---

## 6. Build order

| lane | what | why this order |
|---|---|---|
| **V1** | `StudioBoot.ts`: profiles, subset boot, front door before `game.init()` | everything else depends on there being no game |
| **V2** | Model Explorer on its own scene; delete `Stage`/`AssetBrowser` coupling | the loudest complaint |
| **V3** | World Explorer on the five-system profile; delete `holdWorld`/`pumpWorld` | second complaint |
| **V4** | List engine: reconcile, search, scroll retention | unblocks every section |
| **V5** | Command palette | the UX headline |
| **V6** | Thumbnails + tile view | needs V2's offscreen render |
| **V7** | Mobile shell over the new core | §4.5 |
| **V8** | Shot Gallery, Look Lab, Device on the new list engine | the remaining must-have plus two |

## 7. Definition of done — instruments

1. **`pnpm run check` 23/23**, `anycheck` at zero, suite inside 290 s.
2. **`shoot.mts` byte-identical.** Determinism unchanged; `?shoot=1` still sees
   no front door and no studio.
3. **`studiocheck.mts`** — new gate, lifting `_probe/studiodoor.mts`:
   - front door interactive with **no game systems booted** — assert
     `game.systems.length === 0` at first paint;
   - Model Explorer builds all 50 assets with **zero** game systems present, no
     console errors, reporting tris/meshes/materials each;
   - World Explorer boots **exactly** the five named systems — assert the set,
     so §3.3's guarded-dependency finding cannot rot silently;
   - **no `Player`, `Party`, `Npcs` or `Enemies` object in either scene**, which
     is the human's complaint expressed as an assertion;
   - `⌘K` opens, filters and navigates.
4. **Time to interactive, measured, not asserted.** Front door paints in
   **≤ 0.5 s**; Model Explorer's first model ≤ 1.5 s; World Explorer's first
   arrival ≤ 4 s. `bootprof.mts` already records phases.
5. **No full list rebuild**: stepping an asset does not reset scroll, asserted
   in the gate.
6. `touchcheck` extended to the mobile shell; `devicecheck` 10/10 with the
   studio open.
7. Deployed, and **the frames read**.

## 8. Risks

- **§3.4's duplicated prologue is the real one.** Mitigated by a gate that boots
  both paths and compares the renderer/scene/camera/input surface.
- **Enemy species factories may assume `Enemies`.** v1 only ever went through
  the pool. If `type.make` + `attachVisual` needs the system, the fallback is a
  headless `Enemies` instance with no world — one system, not thirty.
- **Thumbnails cost GPU time on a phone.** Render on demand, cache, cap.
