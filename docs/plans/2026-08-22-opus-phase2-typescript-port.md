# Phase 2 — the TypeScript port

**Supersedes `2026-08-17-opus-typescript-port.md`**, whose argument still holds but
whose numbers are badly stale: it says 235 modules / ~79,500 lines. Measured
2026-08-22, it is **274 files / 96,518 lines**, and it grows roughly 5k lines a
session. Read that document for *why*; read this one for *what and in what order*.

**Status:** ready to start. The gate — every branch merged and the tree quiet — is
met for the first time in the project's history: 290 commits, no `agent/*`
branches, worktrees pruned, 9/9 gates green.

---

## 1. Why now, and not after phase 4

The port's cost scales with the codebase, and **phase 4 is seven workstreams of
new code**. Porting afterwards means porting a substantially larger codebase, in
exactly the layer — `game/rpg/**`, the combat event map, `Shot` — where the
original plan argues the type value is highest. Now is the trough.

The second reason is that this session produced fresh evidence for the port's
core argument. Four defects found today were type or contract errors that a
compiler catches for free:

| defect | what a type would have said |
|---|---|
| `Ecology.groundColor` called `Terrain.groundColorAt` and `colorAt`, **neither of which existed** — every plant in the world tinted from a fallback ramp, silently, for months | An interface on `Terrain` makes a call to a non-existent method a compile error |
| `weaponIK` returned nothing, so `setGrip` could not be called on the driving side | A declared return type `'L' \| 'R' \| null` makes the omission visible |
| `Color.setHex(THREE.Color)` → `Math.floor(object)` → `NaN` → **silently black** | `setHex(n: number)` rejects a `Color` at the call site |
| Fissures bound to `'coreC'` instead of `` `hand${n}` `` | A `BoneName` union catches a bone that is real but wrong-limbed only if the names are enumerated — partial win, worth noting honestly |

## 2. Scale, measured

| area | files | lines | notes |
|---|---|---|---|
| `util` | 3 | 353 | no internal imports; port first |
| `engine` | 20 | 3,566 | declares `System`, the registry key union, `PostFX`'s surface |
| `shaders` | 6 | 1,269 | small, isolated |
| `audio` | 11 | 5,204 | small, isolated |
| `combat` | 11 | 5,493 | depends on engine + rpg |
| `dev` | 10 | 1,893 | can never appear in a capture; low risk |
| `ui` | 32 | 7,917 | depends on rpg + combat event types |
| `game` | 48 | 14,404 | includes `rpg/**`, story, cinematics, encounters |
| `characters` | 51 | 23,911 | depends on engine + combat |
| `world` | 82 | 33,044 | **largest area by far** |
| `tools` | 37 | 6,186 | `.mts`, under `erasableSyntaxOnly` |
| **total** | **274** | **96,518** | |

`world` and `characters` together are **59%** of the codebase. Any schedule that
treats them as one stage each will stall; break them by subdirectory.

## 3. Order of work

Leaf-first, so each stage compiles against already-typed dependencies.

| # | stage | files | why here |
|---|---|---|---|
| 0 | Config only, no renames | — | Prove the toolchain before touching code |
| 1 | `util/**` | 3 | No internal imports |
| 2 | `engine/**` | 20 | Declares the contracts everything else consumes |
| 3 | `game/rpg/**` | ~11 | Pure logic, zero three.js — highest type value per line |
| 4 | `shaders/**`, `audio/**` | 17 | Small, isolated |
| 5 | `combat/**` | 11 | Depends on engine + rpg |
| 6 | `characters/rig/**` | ~14 | The shared substrate under enemies, npc and heroes |
| 7 | `characters/**` (rest) | ~37 | enemies, ai, npc, Cast, Party, Player |
| 8 | `world/terrain/**` + `world/veg/**` | ~20 | The two areas with live cross-contracts |
| 9 | `world/**` (rest) | ~62 | props, town, sky, weather, dungeons, map, vehicle |
| 10 | `ui/**` | 32 | Depends on rpg + combat event types |
| 11 | `game/**` (rest) | ~37 | `Game`, `Shots`, story, cinematics, encounters |
| 12 | `dev/**` | 10 | Cannot appear in a capture |
| 13 | `tools/**` → `.mts` | 37 | Under `erasableSyntaxOnly` |

**This cannot be a parallel agent wave.** A port touches every file, so the
disjoint-ownership method that built this repo does not apply. One serial run.

## 4. The types worth designing rather than inferring

Unchanged from the original plan and still right:

- **`System`** — `init(game)`, optional `update`/`lateUpdate`/`resetClock`.
- **`SystemKey`** — a literal union of the 25 registry keys plus aliases, so
  `game.get('Terain')` is a compile error and `game.get('Terrain')` returns
  `Terrain` rather than `any`. Directly prevents the `constructor.name` class of
  bug that once broke every system in a production build.
- **`Shot`** — a discriminated union over framing modes: fixed `{pos,target,fov}`
  versus `{follow, offset, lookOffset}`. Several shots have broken by mixing these.
- **The combat event map** — `Record<EventName, PayloadType>` so the HUD, audio
  and RPG bridges agree on payload shape. Three systems subscribe by convention alone.
- **`Terrain`'s cross-system contract** — `heightAt`, `normalAt`, `slopeAt`,
  `sampleMaterial`, `roadDistance`, `roadCenterX`, `groundColorAt`, `setWetness`.
  **This one is now proven, not hypothetical:** `groundColorAt` was called by
  `Ecology` and had never been defined.

## 5. Definition of done

- [ ] `npm run typecheck` and `typecheck:tools` both clean
- [ ] Zero `.js` files under `src/`
- [ ] **`npm run check` — all 9 gates still green** (this is the real proof)
- [ ] `imgdiff` shows no shot above the harness noise floor. **Measure the floor
      for the shots you compare** — it is per-shot, not a constant: `prompto_closeup`
      measures 0.373, not the 1.5–1.9 quoted for the corpus.
- [ ] `gameplay.mjs` no worse than the phase-1 baseline (`walk` 49.8 fps)
- [ ] Both typechecks added to `.githooks/pre-commit` alongside the build

## 6. Explicitly not in scope

- **Rewriting logic while porting.** A port that also refactors cannot be verified
  by image diff, which is the only cheap proof we have that nothing broke.
- `any`-eliminating heroics in shader-string or `onBeforeCompile` code, where
  three.js's own types are weak. `// @ts-expect-error` with a reason beats a fiction.

## 7. Landmines specific to this work

- **A clean `vite build` does not mean the page runs.** Cost 40 minutes this
  session: a bad substitution prepended function-body code above the imports —
  valid module syntax, clean build, and the only symptom was a 300 s capture
  timeout with an empty console log. **Boot the page after every stage**, not just
  the build.
- **`git stash` on a clean tree stashes nothing**, so an A/B built around it
  compares a build against itself. This produced a confidently backwards
  conclusion today. Use `git checkout <sha> -- <path>` for A/Bs.
- Commit per stage, and keep `project/handoff/typescript.md` current.
