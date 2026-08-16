# FINAL FANTASY XV — Eos. Engineering & art brief

Read this fully before writing code. Every agent works against this contract.

## The bar

We are building a **AAA-quality action RPG in ThreeJS** that stands up to a blind
side-by-side comparison with *Final Fantasy XV* (PS4, 2016). A harsh critic agent
will look at screenshots of our game next to real FFXV frames and say which looks
better. "Reasonable for WebGL" is a failing grade. The target is *photoreal,
shipped-console-game* quality.

## Art direction (FFXV specifics — get these right)

- **Palette.** Sun-bleached, slightly desaturated naturalism with warm highlights
  and cool blue-teal shadows. Leide is red-ochre badlands, rust rock, dry scrub.
  Duscae is deep humid green with heavy haze. Never candy-coloured, never flat grey.
- **Light.** Physically-motivated, single strong sun with visible aerial
  perspective. Golden hour is the signature look: long raking shadows, warm rim
  light on characters, dense atmospheric scattering, god rays through cloud gaps.
  Night is *dark* and blue with the Eos starfield and a huge moon.
- **Atmosphere is the #1 lever.** FFXV frames are 40% atmosphere: height fog,
  aerial perspective tinting distant hills toward the sky colour, light shafts,
  cloud shadows moving over terrain, dust motes catching sun.
- **Detail density.** Never an empty field. Grass clumps, scattered rocks,
  scrub bushes, dead branches, dirt paths with wheel ruts, distant rock spires,
  a ruined pylon on the horizon. The eye must always have something to land on.
- **Composition.** Strong foreground / midground / background separation with
  depth cues. Silhouettes read against sky.
- **Characters.** Stylised-realistic. Noctis: black layered jacket, black hair
  with spiky asymmetric fringe, slim silhouette. Gladiolus: huge, tank top,
  scarred, greatsword. Ignis: tall, glasses, purple-grey coat, formal. Prompto:
  blond, vest, camera, freckles, energetic posture.
- **VFX.** Warp-strike = a streak of cyan-blue crystal shards and a chromatic
  dash. Magic = elemental bursts with real light emission. Weapons materialise
  from blue crystal light.
- **UI.** Thin white/pale-blue type, generous letterspacing, low-opacity dark
  panels, angular corner cuts. Restrained and elegant, never chunky game-UI.

## Hard rules

1. **No network, no binary assets.** Everything procedural — geometry built in
   code, textures synthesised via `src/util/TextureGen.js`. No `fetch`, no CDN,
   no `.glb`/`.png`/`.hdr` loads. If you need a texture, generate it.
2. **Determinism.** Use `Rng`/`Noise` from `src/util/` with fixed seeds. Two runs
   of `tools/shoot.mjs` must produce identical images.
3. **Performance budget.** ≥45 fps at 1600×900 on an Apple M-series GPU with the
   full post chain on. Instance everything repeated. Keep draw calls under ~400.
   Test it: `manifest.json` from the harness records tris/calls per shot.
4. **Do not edit `src/game/Game.js` or `src/game/Shots.js`** unless you are the
   agent who owns them — they are shared. Create new files inside *your own*
   directory and wire them from your system's `init()`.
5. **No page errors.** `tools/shoot.mjs` exits non-zero on any console error.
   A run that exits non-zero is a failed run.
6. Match the surrounding code style: ES modules, no semicolon-free style, JSDoc
   on public methods, no framework, no TypeScript.

## Engine contracts

`Game` (`src/game/Game.js`) constructs systems in order and ticks them:

```js
class MySystem {
  async init(game) {}            // build scene content; may await
  update(dt, game) {}            // simulation
  lateUpdate(dt, game) {}        // after all updates — camera, HUD, culling
}
```

Reach other systems with `game.get('Terrain')` (by class name). Useful handles:

| handle | what |
|---|---|
| `game.scene`, `game.camera`, `game.renderer` | three.js core |
| `game.rnd` | `Renderer` wrapper (quality tier, resize hook) |
| `game.time` | `{ now, dt, rawDt, scale, frame, fps }` — `scale` drives slow-mo |
| `game.input` | `move` (Vector2), `look`, `key/keyDown`, `mouse`, gamepad |
| `game.uiRoot` | DOM element for HUD/menus (`pointer-events:none` by default) |
| `game.post` | `PostFX` — `.bloom`, `.gtao`, `.grade.uniforms`, `.composer` |

Cross-system APIs other code already calls — **implement these if you own the system**:

- `Terrain.heightAt(x, z) -> number`, `Terrain.normalAt(x, z) -> Vector3`
- `Sky.setTimeOfDay(hours0to24)`, `Sky.sun` (DirectionalLight)
- `Weather.set('clear'|'storm'|'fog'|'overcast')`
- `Director.setScenario('field'|'combat'|'warp')`
- `HUD.setVisible(bool)`, `Menus.setScreen(nameOrNull)`
- `Player.root`, `Player.position`, `Player.velocity`, `Player.heading`, `Player.stats`
- `CameraRig.setShot({pos,target,fov})` / `clearShot()`

## The screenshot harness — this is how you check your work

```bash
node tools/shoot.mjs                        # all shots -> shots/
node tools/shoot.mjs vista_dusk hero_full   # named shots
node tools/shoot.mjs --out shots/veg-r2 --w 1920 --h 1080 --settle 90
```

It boots vite, waits for `window.GAME.ready`, steps the sim with a fixed
timestep, applies the named shot from `src/game/Shots.js`, and writes PNGs plus
a `manifest.json` with triangle/draw-call counts. **Read the PNGs back with the
Read tool and actually look at them.** Iterate: shoot → look → fix → shoot.

`VERBOSE=1 node tools/shoot.mjs ...` echoes page console output for debugging.

## Definition of done for your task

- Your shots render with zero console errors.
- You have looked at the output images yourself and they are genuinely beautiful
  — not "structurally correct", *beautiful*.
- Draw calls and triangle counts are within budget.
- The work reads as one part of a coherent world, not a tech demo of your system.
