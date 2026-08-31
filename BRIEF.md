# FINAL FANTASY XV — Eos. Engineering & art brief

Read this fully before writing code. Every agent works against this contract.
> **Live: https://dist-three-rho-86.vercel.app** — one build, no query
> parameters. A desktop gets the full game; a phone or tablet is detected and
> gets the demo automatically. `?demo=0` / `?demo=1` force either half.
> Coordinating rather than implementing? Read [`project/HANDOFF.md`](project/HANDOFF.md) first.

## The bar

A **AAA-quality action RPG in ThreeJS** that survives a blind side-by-side with
*Final Fantasy XV* (PS4, 2016). A harsh critic agent looks at our frames beside
real ones and says which is better. "Reasonable for WebGL" is a failing grade.

**And it has to survive a phone.** The bar is not lowered there — same world,
same art direction, within a handset's budget. A phone build that reads as a
different, worse game has failed, and the fastest route there is turning quality
knobs down without looking at the result. Every knob is a trade you must *see*.

## Art direction (FFXV specifics — get these right)

- **Palette.** Sun-bleached, desaturated naturalism, warm highlights, cool
  blue-teal shadows. Leide is red-ochre badlands, rust rock, dry scrub; Duscae
  deep humid green under haze. Never candy-coloured, never flat grey.
- **Light.** One physically-motivated sun with visible aerial perspective.
  Golden hour is the signature: long raking shadows, warm rim light, dense
  scattering, god rays through cloud gaps. Night is *dark* and blue, Eos
  starfield, huge moon.
- **Atmosphere is the #1 lever.** FFXV frames are 40% atmosphere: height fog,
  distant hills tinted toward the sky, light shafts, cloud shadows crossing
  terrain, dust motes catching sun.
- **Detail density.** Never an empty field. Grass clumps, scattered rock, scrub,
  dead branches, wheel ruts, a ruined pylon on the horizon — the eye must always
  have something to land on.
- **Composition.** Foreground / midground / background separation; silhouettes
  read against sky.
- **Characters.** Stylised-realistic. Noctis: black layered jacket, spiky
  asymmetric fringe, slim. Gladiolus: huge, tank top, scarred, greatsword.
  Ignis: tall, glasses, purple-grey coat. Prompto: blond, vest, camera, freckles.
- **VFX.** Warp-strike is cyan crystal shards and a chromatic dash. Magic is
  elemental bursts with real light emission. Weapons materialise from blue light.
- **UI.** Thin white/pale-blue type, generous letterspacing, low-opacity dark
  panels, angular corner cuts. Restrained, never chunky game-UI.

## Hard rules

1. **No network, no binary assets.** Everything procedural — geometry in code,
   textures via `src/util/TextureGen.ts`. No content `fetch`, no CDN, no
   `.glb`/`.png`/`.hdr`. The `baked/` containers are a **cache of our own
   generators**: every one regenerates from code if missing, which is the
   property that keeps this rule true.
2. **Determinism.** `Rng`/`Noise` with fixed seeds. Two `shoot.mts` runs must
   produce identical images.
3. **Two performance budgets.**
   - *Desktop:* ≥60 fps at 1600×900 on an M-series GPU with the full post
     chain — `perf.mts` (posed) **and** `gameplay.mts` (real input, streaming,
     combat). No gameplay frame over 33 ms. Draw-call budget is **800**;
     `drawcheck` parses that number out of this line, so reword it and the gate
     goes VOID rather than passing.
   - *Phone:* a locked 30 that does not heat the device. Phone draw-call budget
     is **250** and triangles **≤ ~2.5 M**, via `_probe/mobcost.mts`. A handset
     is fill-rate and draw-call bound long before it is triangle bound.
4. **Do not edit `src/game/Game.ts` or `src/game/Shots.ts`** unless you own
   them. Put new files in *your own* directory, wired from your `init()`.
5. **No page errors.** `shoot.mts` exits non-zero on any console error.
6. **TypeScript everywhere** — `.ts` for the game, `.mts` for the harness. ES
   modules, JSDoc on public methods, no framework. `anycheck` holds `any` at
   **zero** and it only goes down.

## The phone build

One build, two data sets — not a second bundle and not a second site.
`src/engine/Device.ts` resolves **synchronously at module evaluation, before the
first `fetch`**, so a phone never learns the desktop URLs exist.

- **Detection** is three legs, all required: a touchscreen exists, the *primary*
  pointer is coarse, nothing can hover. No UA sniffing, no screen-size test —
  that was a guess about form factors that kept being wrong. `devicecheck.mts`
  proves it against ten real device profiles.
- **`demoActive()`** decides the render tier, which containers are fetched, what
  defers past the first frame, and which knobs move. Memoised: a predicate that
  answers differently twice in a session is a bug class we have already paid for.
- **`baked/m/`** holds the phone's artifacts. A 404 there is a cache miss, and a
  miss is the generator — so a deploy that forgot to bake is *slow*, not broken.
- **Touch controls** (`src/ui/touch/`) drive the game through a synthetic
  `PadLike` in `Input.padSource` plus synthesised keys for the two verbs with no
  pad binding. No gameplay system knows they exist.

**Read `project/LANDMINES.md` before touching the bake pipeline** — the two
container formats have *different byte layouts*, and that entry cost an
afternoon and four wrong diagnoses.

## Engine contracts

```ts
class MySystem {
  async init(game: Game) {}               // build scene content; may await
  update(dt: number, game: Game) {}       // simulation
  lateUpdate(dt: number, game: Game) {}   // camera, HUD, culling
}
```

Reach systems with `game.get('Terrain')` — the **registered name**, an explicit
key in `SystemRegistry`, *not* `constructor.name` (minification renames classes).

Handles: `game.scene` / `camera` / `renderer` / `rnd` (quality tier, resize,
context-loss hook) / `time` / `input` (`move`, `look`, `keyDown`, `gamepad`,
`padSource`) / `uiRoot` / `post`. The cross-system API other code already calls
is whatever `SystemRegistry` types say — implement it if you own the system.

## The harness — this is how you check your work

```bash
node src/tools/shoot.mts vista_dusk hero_full --jpeg
node src/tools/ui-shoot.mts touch_field --extra "touch=1&demo=1" --w 844 --h 390
```

Boots vite, waits for `GAME.ready`, steps a fixed timestep, applies a shot from
`Shots.ts`, writes images plus draw/triangle counts. **Read the images back and
actually look at them.** Iterate: shoot → look → fix → shoot. Always `--jpeg`: a
capture is downscaled to 1568 px before you see it. `VERBOSE=1` echoes console.

## For a visual defect, ablate before re-tinting

A frame tells you *that* something is wrong and is bad at *what*: the chevron
hatch was GTAO, not normals; the shadow detachment was grass casting nothing,
not bias; the speckled sky was a channel scramble in `take()`, not the four
texture-compression theories that each sounded right.

Shoot twice with `--hide <name>` or `--ablate <token>` between, then
`imgdiff.mts --heat`. **`--raw` on both sides of a mesh ablation** — with post
on, hiding one object moves exposure, bloom and the grade. Read the heat map,
not the mean. A `--hide` matching nothing is an error: never read a null
ablation as innocence.

**The strongest instrument is a control isolating one variable:** `?nobake=1`
forces the generators, `?webp=0` the plane containers, `?demo=0` the desktop
build; `?rs=`/`?dens=`/`?veg=`/`?fps=` each override one knob. Four theories
about the sky died to `?webp=0` rendering it perfectly in one reload.

## Definition of done

- Zero console errors.
- You looked at the images and they are genuinely beautiful — not "structurally
  correct", *beautiful*.
- **If you touched the demo path, you looked at it at a phone viewport.** Three
  rounds of real regressions reached a human's handset before any gate or
  desktop capture noticed.
- Draw calls and triangles inside the right one of the two budgets.
- It reads as one part of a coherent world, not a tech demo of your system.
