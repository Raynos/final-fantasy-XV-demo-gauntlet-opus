# Dev suite plan

## Context

The project is a 139-shot, 19-zone, 8192 m procedural ThreeJS action RPG with a
mature *offline* harness (`tools/shoot.mjs`, `daemon.mjs`, `framecam.mjs`,
`sheet.mjs`, `perf.mjs`, …) but **zero in-game debug affordances**. Today
`?debug` only enables five `console.log` calls; there is no free camera, no
stats overlay, no way to isolate an asset, and no way to record a review note
without leaving the game and hand-writing a prompt.

That gap is now the bottleneck. Reviewing this build means shooting a 139-shot
corpus (~20 min), building a contact sheet, and squinting at PNGs — a loop that
cannot answer "what does this enemy's walk cycle look like from behind" or "why
is the ground ochre *here*". Meanwhile the r4 corpus review surfaced defects
that a 30-second freecam pass would have caught months earlier (a mountain-sized
meteor parked 4 km from its own zone, weapons floating beside hands, the Iron
Giant rendering 8.4 m underground).

The outcome we want: load the game with `?debug=1`, fly anywhere, isolate and
scrub any asset, and file a note with one keypress that lands on disk as
structured JSON + PNG that an agent can drain and act on.

**Decisions already taken** (from the clarifying round): one build, gated by
`?debug`; a Vite plugin writing to disk in both `dev` and `preview`; tuning
exported as patch files rather than the suite writing to `src/`; all four
feature slices built, after a shared substrate.

---

## Architecture

### Where it lives — `src/dev/**`, a brand-new tree

`BRIEF.md` rule 4 forbids editing `src/game/Game.js` and `src/game/Shots.js`
(shared files), and `src/ui/**` is currently claimed by a live agent. So the
suite takes **no shared file** except a four-line hook in `src/main.js`:

```js
// src/main.js — the one shared edit
const qs = new URLSearchParams(location.search);
if (qs.has('debug') && !qs.has('shoot')) {
  const { installDevSuite } = await import('./dev/DevSuite.js');
  await installDevSuite(game);
}
```

This mirrors the sanctioned precedent: `src/engine/BootProfile.js` already adds
capability by wrapping `Game.add` from `main.js` instead of editing `Game.js`.

Three consequences worth stating:

- **`await import()` puts the whole suite in its own async chunk.** It ships in
  `vite build` (one build, zero drift, review the real bundle) but costs the
  normal path only a dead branch.
- **`&& !qs.has('shoot')` is a hard determinism guard.** `tools/shoot.mjs` loads
  `?q=ultra&shoot=1`, so the suite can never appear in a capture and cannot
  violate BRIEF rule 2 ("two runs must produce identical images"). It also frees
  the suite from the "no CSS transitions in `src/ui`" rule, which exists purely
  for capture determinism.
- The suite mounts its **own DOM root** `#dev` (the precedent is
  `TitleScreen`'s `#title` root), so it never touches `src/ui/**` and cannot
  collide with the `cineui` agent.

### The substrate: a command + cvar registry, built first

The single strongest finding from the industry research: mature toolsets
(Unreal's `IConsoleManager`, Quake/Source cvars, Dear ImGui suites) put a
**named command registry at the bottom** and make every UI a view over it. Build
the GUI first and you get capabilities that can't be scripted, keybound, or
captured into a bug report.

Every capability registers as:

```js
reg.add({ name: 'cam.speed', category: 'camera', help: '…',
          get: () => freecam.speed, set: (v) => (freecam.speed = v),
          min: 0.5, max: 500, cheat: false });
reg.cmd({ name: 'goto', args: '<x> <z> | <poiId> | <zoneId>', help: '…',
          exec: (a) => world.goto(a) });
```

From that one registry you get, for free: the console with autocomplete, the
lil-gui panels (types and ranges are already declared), keybinds
(`bind F5 "shot.next"`), presets, **and the repro script embedded in every
review note**. Cvars whose value differs from default are tracked so a note can
be stamped "DEBUG STATE MODIFIED" — the research flags leftover-toggle chasing
as the most expensive failure mode of a debug suite.

### Camera: do *not* reuse `CameraRig.setShot`

`CameraRig.lateUpdate` clamps a shot camera to `terrain.heightAt(...) + 1.35`
every frame (`src/game/CameraRig.js:227-231`). A freecam built on `setShot`
would be involuntarily floor-clamped and could never fly underground or inspect
a cliff face from below.

Instead `DevSuite` registers **last** in system order and writes
`game.camera.position / quaternion / fov` directly in its own `lateUpdate`,
after `CameraRig` has already run. On any discontinuous jump it must call
`post.resetHistory()` and `post.snapFocus()` — this is exactly what
`CameraRig._cut()` does, and skipping it smears TAA and DOF across the cut.

Two camera modes, on two keys, per the Unreal Eject-vs-DebugCamera distinction:

- **Eject (F8)** — detach the camera, *simulation keeps running*.
- **Pause-and-inspect (P)** — `game.paused = true`, then fly.

`game.paused` is already implemented, currently unused, and stops `update` but
**not** `lateUpdate` (`src/game/Game.js:277-280`). That is precisely the
semantics a pause-and-inspect freecam needs, at zero cost.

### Time scale needs no edits anywhere

`Time.tick()` computes `dt` from `scale` at the *start* of a frame, and
`CombatSystem` damps `scale` back to 1 during `update`. If `DevSuite` writes
`time.scale` in `lateUpdate` — after every system's `update` — it wins the next
frame unconditionally. No change to `CombatSystem`, no contention.

### Screenshots work today

`src/engine/Renderer.js:21` already sets `preserveDrawingBuffer: true`, and the
composer's final pass renders to the visible canvas. So
`renderer.domElement.toDataURL('image/png')` returns the fully graded frame at
any time, from any code.

**Known limitation to design around, not hide:** the DOM UI (`#ui`, `#hud`,
`#menus`) is *not* in the canvas. A note's PNG is the 3D frame only. The note
JSON therefore records HUD/menu state so the UI condition is reconstructible,
and the inbox viewer says so explicitly.

### Disk I/O: a Vite plugin on both servers

Nothing in the repo hooks `configureServer` or `configurePreviewServer` today —
`tools/vite-plugin-bake.mjs` uses only `configResolved`. This is uncontested
greenfield. New `tools/vite-plugin-review.mjs`, added to `vite.config.js`'s
plugin array, registers identical middleware on both hooks:

| route | method | does |
|---|---|---|
| `/__review/note` | POST | writes `.review/inbox/<iso>-<id>.json` + `.png` |
| `/__review/inbox` | GET | lists notes (for the in-game browser) |
| `/__review/tuning` | POST | writes `.review/tuning/<name>.patch.json` |
| `/__review/build` | GET | git SHA + dirty flag, for note metadata |

This is same-origin localhost middleware, not asset acquisition — it does not
violate BRIEF rule 1 ("no `fetch`, no CDN"), which is about pulling in art. The
suite must degrade to a browser download if the endpoint 404s (static build).

`.review/` goes in `.gitignore` alongside `shots/` and `public/baked/`.

### One dependency: `lil-gui`

MIT, zero deps, ~7.9 kB min+gzip, what the three.js examples themselves use, and
it infers widget type from the registry metadata we already have.
`gui.save()`/`gui.load()` return plain JSON — that *is* the tuning-patch export
and the cvar snapshot in a review note, for free.

It lands inside the dynamic `src/dev` chunk, so it never touches the game
bundle. "No framework" in `BRIEF.md` targets React/Vue-class app frameworks; a
dev-only widget library in a dev-only chunk is a different thing — but it is a
judgement call, and the console/inbox/browsers are hand-rolled plain DOM either
way, so lil-gui is swappable if you'd rather take zero new deps.

Stats come from `Time.fps` and `renderer.info` (already reset every frame in
`Game.frame()` and currently read by nobody) — no `stats.js`, no `stats-gl`.

---

## Phase 0 — substrate (everything depends on this)

| file | contents |
|---|---|
| `src/dev/DevSuite.js` | `installDevSuite(game)`; the system, registered via `game.add(suite, 'Dev')`; owns `#dev` root, key routing, `lateUpdate` |
| `src/dev/Registry.js` | commands + cvars, defaults tracking, `cheat` flags, autocomplete index |
| `src/dev/Console.js` | overlay, history, autocomplete, `help` / `dump` / `bind` / `exec` |
| `src/dev/Keys.js` | `bind <key> "<cmd>"`, persisted to localStorage |
| `src/dev/Overlay.js` | DOM host + lil-gui mount, `pointer-events` discipline |
| `src/dev/StatsHud.js` | fps, frame ms, draw calls, triangles, geometries, textures, programs, rolling graph |
| `src/dev/dev.css` | utilitarian styling, deliberately unlike the game UI |
| `tools/vite-plugin-review.mjs` | the four routes above, on dev **and** preview |

Input: read edges via `game.input.keyDown(code)` in `lateUpdate`. `Input.pressed`
is a `Set` nobody consumes, so multiple readers see the same edge — no stealing.
Suppress gameplay with the suite's own guard rather than `input.enabled`, which
`Menus._pointerLock` already arbitrates over. Free keys confirmed unused:
`` ` ``, `P`, `O`, `U`, `Y`, `F1`–`F4`, `Insert`, `Home`, `End`, brackets,
digits `6`–`0`. Note `Input` only `preventDefault`s `Space/Tab/Backspace/F1/F5`.

## Phase 1 — freecam + shot ejection

`src/dev/Freecam.js`, `src/dev/Bookmarks.js`, `src/dev/ShotBrowser.js`.

- WASD + QE, `Shift` boost, `Ctrl` crawl, mouse look, momentum + damping, roll,
  FOV/focal-length, `F` frame-selection.
- **Eject (F8)** keeps the sim running; **pause (P)** freezes `update`.
- Camera bookmarks `Ctrl+0–9` set / `0–9` jump, named, persisted, exportable.
  Cheap, and the research singles it out as the feature that most changes review
  throughput on a large world.
- **Shot browser**: all 139 `SHOTS`, labelled by their existing `doc` string,
  grouped by the `// --- section ---` comments (`tools/corpus.mjs` already
  parses those). `[` / `]` step; `Enter` **ejects from the posed shot into
  freecam from that exact transform** — the headline request.
- **Capture-as-framing**: `shot.save` writes the live camera back as
  `{pos, target, fov}` into `.review/tuning/shots.patch.json`, keyed by shot
  name. This is the direct fix for framing bugs like `zone_mencemoor`, where
  moving the meteor onto its zone centre buried the zone camera inside it.
- Shots are applied via the live-`SHOTS` mutation pattern already proven by
  `tools/framecam.mjs` (`SHOTS.__probe = s; g.applyShot('__probe')`), so
  arbitrary candidate framings work without editing `Shots.js`.

## Phase 2 — feedback inbox + capture

`src/dev/Inbox.js`, `src/dev/Report.js`.

`F9` freezes the frame, grabs `toDataURL`, opens a note field (free text +
severity + category), and POSTs. Metadata captured automatically — the human
types only prose:

`buildId` (git SHA + dirty) · `game.seed` · current shot · camera transform +
fov · player transform · zone/region/POI from `worldMap.zoneAt` · game time,
weather, `Sky` hours · `state` · HUD/menu visibility · **cvar deltas from
default** · fps + frame ms + `renderer.info` snapshot · last N console commands ·
last N log lines · canvas size + pixel ratio · `WEBGL_debug_renderer_info`.

**"Restore from report" is the payoff feature** and is unusually cheap here
*because* the world is fully procedural and seeded: `review.restore <id>`
re-seeds, warps, re-applies cvars and re-poses the camera to put you exactly
where the note was filed. In an asset-heavy engine this is near-impossible; here
it is a few dozen lines.

Then a `/drain-inbox` skill reads `.review/inbox/*.json`, groups notes by owning
directory, and dispatches agents — closing the loop from "I saw something wrong"
to "an agent is fixing it" without a hand-written prompt.

## Phase 3 — asset browser / viewer

`src/dev/browsers/AssetBrowser.js`, `src/dev/Stage.js`, `src/dev/Anim.js`.

**Most content families already have a usable registry** — this phase is mostly
wiring, not authoring:

| family | registry | count | standalone factory |
|---|---|---|---|
| Enemies | `TYPES`/`speciesKeys()` — `enemies/Bestiary.js` | 23 | `Enemies.spawn(key)` |
| Heroes | `CAST`/`makeCharacter()` — `characters/Cast.js` | 4 | `makeCharacter('noctis')` |
| NPCs | `NPC_CAST` — `npc/NpcCast.js` | 8 | `archetype()` + `new NpcBody()` |
| Trees | `TREE_SPECIES`/`buildTree()` — `veg/TreeBuilder.js` | 7 | pure fn, no scene needed |
| Weapons | `WEAPONS`/`WEAPON_GEOMETRY` — `combat/Weapons.js` | 5 / 7 | `new Weapon(kind)` |
| World | `worldMap` — `map/WorldMap.js` | 19 zones / 124 POIs / 48 landforms | accessors |
| Vehicle | `buildRegalia()` — `props/Regalia.js` | 1 | fully standalone |

Three need a small, additive registry introduced (no refactor of existing code):

- **Props** — the kind tables exist but are module-private (`Rocks.KINDS` 8,
  `Debris.LITTER` 12, `PoiKits.kits` 12, `Megastructures` 5 private methods).
  Export them behind one `PROP_KINDS` map. Caveat: `Landmarks`, `Outposts`,
  `RoadFurniture` and `Megastructures` merge everything into one group at
  `build()` time, so *some* entries can only be inspected in-world, not isolated.
  Say so in the UI rather than faking it.
- **Dungeons** — `DEFS` is private; a one-line `export` is the whole fix.
- **VFX** — effects are methods, not a table. Add a name→signature table so the
  UI can offer per-effect controls. `vfx.pin(t)` already freezes the layer.

**Animation scrubbing already has its hooks.** `EnemyBase.freeze(state, phase,
ctx)` / `unfreeze()` exist, and `Enemies.frozen = true` re-applies the frozen
pose each frame. Enemy pose vocabulary: `idle, approach, telegraph, attack,
flinch, stagger, death` (+ `run`/`walk` on some). Heroes use `ACTIONS` in
`rig/Anim.js`: `attack_slash, attack_thrust, attack_overhead, guard, hit, cast,
warp`, played via `char.play(name, {speed, hold})`.

`Director.setScenario` (`src/game/Director.js:163`) already implements
spawn → face → `freeze(state, phase)` → `enemies.frozen = true` → `vfx.pin(t)`.
The browser drives that same mechanism from `speciesKeys()` instead of a
hand-authored list.

Viewer features: neutral turntable stage with a fixed 3-point rig (judge the
asset, not the lighting), auto-rotate, orbit/pan/dolly, frame-selection,
animation scrubber with frame stepping and playback rate, skeleton overlay
(`THREE.SkeletonHelper`), socket markers (`char.attach.*`), bounding volumes
(render bounds vs cull bounds drawn separately — mismatch is the classic pop-in
cause), and per-asset tri/draw/material/bone stats.

**Review status per asset** (`unreviewed / ok / flagged`, persisted, with a
"show unreviewed only" filter). This is the thing that turns a viewer into a
review *suite* and, per the research, almost nobody builds it.

## Phase 4 — world / zone navigator + view modes

`src/dev/browsers/WorldBrowser.js`, `src/dev/ViewModes.js`.

- Jump to any of 19 zones / 124 POIs / 48 landforms / 50 road nodes, all from
  `worldMap` accessors. `goto <x> <z>`, `warp <poiId>`.
- Live **time-of-day scrub** (`Sky.setTimeOfDay`, accepts any real, wraps 0–24)
  and **weather override** (`Weather.set` — exactly `clear|overcast|storm|fog`;
  unknown names silently no-op, so the UI must offer only those four).
  Per the research these are the fastest way to review an environment's lighting.
- **Show-flags**: `PostFX.debugToggle()` already accepts
  `nodof,nobloom,notaa,smaa,nogtao,nocontact,nomb,nocas,nograin,nolut,novig,noflare,nodirt,noexp,ssr,plain`
  and is live-callable; `Renderer.setQuality(tier)` likewise. Both just need
  surfacing as cvars.
- **View modes** via `scene.overrideMaterial`: wireframe, unlit/albedo, normals,
  overdraw (additive, depth-test off), triangle density, UV checker, LOD colour.
- **Frozen-frustum culling inspection** (Unreal's `FreezeRendering`): snap the
  culling frustum, fly away, see what was culled. For a cell-hashed streaming
  world this is where pop-in bugs get diagnosed. Pair with a chunk-state overlay
  (loaded / loading / evicted) driven off `TileStream.live`.
- **Pick-under-crosshair inspector**: `THREE.Raycaster` → live editable property
  panel with value-history sparklines on numeric fields.

---

## Verification

```bash
npx vite build                      # must pass; enforced by .githooks/pre-commit
node tools/orphans.mjs              # src/dev must be reachable, no dead modules
node tools/integration.mjs          # 18 pass / 0 fail — unchanged
node tools/uxcheck.mjs              # 86/86 — the suite must not register a Menus screen
node tools/gameplay.mjs             # 60 fps gate must not move
node tools/perf.mjs                 # unchanged

# determinism — the critical one: the suite must be invisible to captures
node tools/shoot.mjs hero_face combat_wide --out shots/dev-a --cold
node tools/shoot.mjs hero_face combat_wide --out shots/dev-b --cold
node tools/imgdiff.mjs shots/dev-a shots/dev-b   # must be at the 1.5-1.9/255 noise floor

# the suite itself
npm run dev      # then open http://127.0.0.1:5173/?debug=1
npm run preview  # then open the preview URL with ?debug=1 — inbox must still write
```

Manual acceptance: file a note with `F9` and confirm a JSON + PNG pair lands in
`.review/inbox/`; run `review.restore <id>` and confirm it returns you to the
same place; step the shot browser to `zone_mencemoor`, eject, fly out, and save
a corrected framing to `.review/tuning/shots.patch.json`.

---

## Landmines (all measured, all previously cost real time)

- **Toggling a light's `visible` changed the program key and recompiled 43
  programs — a measured 9.5 s freeze.** `engine/LightBudget.js` pins the counts.
  A naive "toggle this light" checkbox is a trap; gate light debug behind an
  explicit confirm.
- **The capture daemon reboots its warm page on any `src/` edit**
  (`sourceStamp()`). Adding `src/dev/**` is fine, but the suite must never write
  into `src/` at runtime — it would invalidate every running agent's warm page.
  This is a large part of why tuning goes to `.review/` patch files.
- `constructor.name` is mangled in prod builds — register with explicit string
  keys, always.
- Do **not** add `--disable-frame-rate-limit` to `tools/chromium.mjs`; measured
  3× idle CPU for zero benefit.
- `game.currentShot` is a de-facto global "a posed capture is running" signal
  that eight systems poll to mute themselves. The suite should not set it.
- `tools/framecam.mjs` needs `PORT` = the **vite** port; `daemon.mjs` uses
  `PORT+1`, and aiming framecam at the daemon hangs for the full 300 s timeout.

---

## Why this plan exists — the r4 review round, 2026-08-21

This plan was written immediately after a full 139-shot corpus review, and the
defects that review turned up are the argument for the suite. Every one of them
would have been caught in seconds by a freecam and an asset viewer, and instead
took a capture round, a contact sheet and a dispatched agent each:

- **The Disc of Cauthess meteor was 4 km from its own zone.** `Megastructures`
  placed it at (−2010, 1890) in Cleigne while the `cauthess` zone it belongs to
  is centred at (−1020, −2160) in Duscae. Its 857 m outer shards leaned over the
  Cape Caem headland and rendered as unexplained slabs floating above the sea.
  Diagnosed for weeks as a *terrain* bug.
- **Enemy models sank below their roots in frozen poses.** `_resetVisual()` was
  opt-in and the frozen-pose path never called it, so relative pose offsets
  (`visual.position.y -= drop`) integrated every frame — 52 of 207 poses
  drifting, worst −321 m, Iron Giant telegraph −62.8 m. `MagitekArmour`
  integrated in live play too. Now gated by `tools/creaturecheck.mjs`.
- **Weapons floated beside hands** because every weapon authors its crossguard
  at y=0, so the fist closes on the guard and the grip dangles below. The socket
  wiring was fine all along.
- **Every companion closeup in the corpus is out of focus.**
  `PostFX._headFocusDistance()` measures to *the player's* head and snaps focus
  whenever it disagrees with the shot by less than `headFocusWindow = 3.2 m` —
  exactly the case in a companion closeup. Found independently by two agents.
- **Every cutscene renders a pure-black sky** under correctly-lit golden-hour
  ground, while `vista_dusk` from the same build renders a full cloudscape.
- **The terrain splat never reads `WorldMap`**, so all 19 zones render in
  Leide ochre; and the "two-metre cracks" turned out to be the anti-tiling trick
  itself (a 27 m second tap with ~4.5 m worley cells, weighted to 0.82 with
  distance).
- **Grass LOD1/LOD2 render 3–6× darker than LOD0** because `grassClumpTex` is
  luminance-only at 96–224 sRGB while the blade ring has no map at all.

The pattern is consistent: each defect was *visible* but not *findable*, because
the only way to look at the game was a 20-minute batch capture of fixed camera
positions. The suite exists to make looking cheap.

A parallel lesson for the tooling itself: a stale capture-daemon page once
produced a completely false diagnosis that cost three separate investigations,
which is why `sourceStamp()` now reboots the page on any `src/` edit. Cheap,
trustworthy observation is the whole game.
