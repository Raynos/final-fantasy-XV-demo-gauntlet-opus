# Goal: strictly and statically typed, with no `any` — implicit or explicit

**Status:** in progress. **5,253 `any` left**, from 7,861 at the start — 33%
gone. Both typechecks clean, all 9 gates green, `vite build` passes, the pixel
diff against the pre-port build is inside each shot's own noise.

The port itself is finished and documented separately in
`project/handoff/typescript.md`. This document is only about getting to zero.

---

## The ratchet

    node src/tools/anycheck.mts             # count + enforce
    node src/tools/anycheck.mts --by-file   # worst files first
    node src/tools/anycheck.mts --set       # lower the ceiling after a reduction

`ANY_BUDGET.json` holds the ceiling. The count only goes down; nothing raises it
but an edit to that file. It strips comments and string literals before
counting, so the word `any` in prose does not register.

**It is not wired into `npm run check` or the pre-commit hook yet.** That is a
deliberate gap — wiring it in while the number is still five figures would make
every unrelated commit carry the argument. Wire it into `check.mts` once the
number is small enough that a regression is worth blocking on.

## Where the remaining 5,253 are

| kind | count | notes |
|---|---|---|
| parameters `p: any` | ~3,850 | the bulk; see the waves below |
| field declarations `x!: any` | ~790 | what the checker could not agree on |
| `any[]` | 258 | mostly accumulator arrays |
| `Record<string, any>` and other type arguments | 111 | authored data tables |
| `as any` | 27 | each one a deliberate assertion, mostly three.js internals |

Worst files, which is where the next hour should go:

```
124  src/world/dungeons/kit/InteriorProps.ts
106  src/audio/Sfx.ts
103  src/characters/enemies/EnemyBase.ts
103  src/characters/rig/Outfit.ts
 99  src/world/props/PoiKits.ts
 87  src/world/town/TownMaterials.ts
 78  src/world/town/Hammerhead.ts
 74  src/world/dungeons/kit/InteriorMaterials.ts
 69  src/world/dungeons/kit/Layout.ts
 68  src/combat/CombatSystem.ts
```

They are all the same shape: a procedural builder taking `(B, ctx, o)` where `B`
is a mesh builder, `ctx` is the room or outfit context and `o` is an options
bag. **That is the next real piece of design work** — three or four interfaces
would take a four-figure bite out of the count, and unlike the mechanical waves
it needs someone to decide what the contracts are.

## The engine: `src/tools/typemods/`

Read `src/tools/typemods/README.md` first. The short version:

    node src/tools/typemods/infer.mts "$PWD" tsconfig.json src --fields --dry
    node src/tools/typemods/infer.mts "$PWD" tsconfig.json src --params

`infer` is the one that does the work. `--fields` gives a field the type of what
is assigned to it; `--params` gives a parameter the type of what its callers
pass — each only when every site agrees on one clean named type, and refusing
anonymous shapes, function types and unions wider than `T | null`, because the
point is types a reader can use.

Two traps, both of which cost a round here and are in the README:

- **Pass the repo root as an absolute path.** A relative root makes
  `parseJsonConfigFileContent` resolve a config with an `exclude` against the
  wrong base and hand back 2 files instead of 37 — which looks exactly like
  "nothing left to infer".
- **`unused --impure` deletes statements, not just bindings.** It removed four
  `const e = pin(spawnAhead('sabertusk'))` lines from `combatloop`, and with
  them the enemy the swing was supposed to hit.

## The loop that works

1. `node src/tools/typemods/infer.mts "$PWD" tsconfig.json src --fields`
2. `node src/tools/typemods/infer.mts "$PWD" tsconfig.json src --params`
3. Repeat 1–2 until both report zero. Each round makes more types real, which
   lets the next round infer more; it converged after 3–4 rounds each time.
4. `npx tsc --noEmit -p tsconfig.json` — **the errors are the point.** A type
   that was `any` could not be wrong; the moment it is real, everything that
   disagreed with it shows up.
5. Fix those by hand. Run the mechanical helpers (`nonnull`, `nulls`,
   `undefnull`) for the null-flavoured ones first, then read the rest.
6. `npx tsc --noEmit -p tsconfig.tools.json` too — the tools config reaches into
   the game through `src/globals.d.ts`, so game changes can break it.
7. `npm run check` before committing a wave. Not the cheap half.

## What has been found so far

Six pieces of contract drift in the port itself (see `typescript.md`), and four
more from this work:

- **`AudioSystem.ambBus` does not exist**, and `DungeonAmbience.ready` tested
  for it — so the dungeon ambience has never played a note. The reference is
  corrected to `graph.bus.amb`, but the system is held off behind
  `DungeonAmbience.ENABLED = false`: switching a whole audio system on is not
  something a typing pass gets to decide. **This is the top open item** — flip
  it, listen to it, and report what happens.
- **`CameraRig` has no `snap()`**, and `Dungeons` called it behind a
  `if (cam && cam.snap)` guard on entering and leaving a dungeon. The camera has
  never cut on a transition. Removed, with `CameraRig._cut()` named as the
  method that would do it.
- **`ParticleSpec.t0`/`life`/`size0` were optional** and would have written NaN
  into a `Float32Array`. All 22 emit sites pass them; they are required now.
- **`BakeSection.n`/`w`/`h`/`ch` were optional** and fed `new
  Float32Array(undefined)`. `sectionField()` throws with the section name
  instead.

## Vocabulary added, and worth reusing

- `src/util/three-guards.ts` — `isMesh`, `isBone`, `isLight`, `isCamera` … for
  three's runtime discriminants, which `Object3D` does not declare. **Prefer
  these to a cast**: a guard narrows, so the branch below gets the real type.
- `src/audio/nodes.ts` — `canStop`, `canDetune` for the mixed audio node lists.
- `CachedNode` in `src/ui/UIKit.ts` — the "element that remembers what it last
  rendered" the screens use to skip DOM writes at 60 Hz.
- `PoiSpec` vs `Poi`, `Landform`'s six arms, `WeatherName`, `ObjectiveKind`,
  `StatMods`, `CoatOpts`, `ParticleSpec` — the pattern to copy is **split the
  authored shape from the resolved one** rather than making everything optional.

## Rules this work has been following

- **A type is a claim about the code, so make the code true, not the type
  loose.** Where a field is genuinely two things, split the type (`PoiSpec` /
  `Poi`, `DiscLandform` / `CraterLandform`). Where the guard is dead, say so.
- **Assert once, where the reasoning lives.** The first pass at the canvas
  contexts put 331 `c!.` assertions across the drawing code; the assertion
  belongs at the nine `getContext('2d')!` calls.
- **Behaviour does not change.** Every wave is verified by `npm run check` and,
  for anything that could move a pixel, by `imgdiff` against a capture from
  before. A found bug gets recorded and left alone unless fixing it is the
  point of the commit.
- **`unknown` beats `any`** where a value really is dynamic — it forces the
  narrow at the point of use.

## Known debt beyond the count

- `src/tools/typemods/**` is excluded from the tools typecheck and from the
  count. It drives the compiler API, which is `any`-heavy by nature. Type it
  last, or delete it when the job is done.
- `src/tools/browser.d.ts` declares the harness's in-page URL imports as `any`.
  Typing them properly means teaching the tools config about the game's module
  graph — worth doing near the end.
- `anycheck` is not in `npm run check` yet. See above.
