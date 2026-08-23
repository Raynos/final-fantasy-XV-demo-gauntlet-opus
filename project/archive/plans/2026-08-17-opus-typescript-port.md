# TypeScript port plan

Port this project from JavaScript to TypeScript, matching the sibling attempts
`../final-fantasy-XV-demo-opus` (172 `.ts`, zero `.js` in `src/`) and
`../final-fantasy-XV-demo-ogl-opus` (100 `.ts`).

Status: SUPERSEDED (2026-08-22, opus) — by `2026-08-22-opus-phase2-typescript-port.md`, which shipped.

**Superseded and done.** `docs/plans/2026-08-22-opus-phase2-typescript-port.md`
carried this out on 2026-08-22 -- read that one for the numbers and
`project/handoff/typescript.md` for what the port found. This document is kept
for its argument, in §1, which the port confirmed several times over.

---

## 1. Why this is worth doing here

Not for tidiness. Two of the most expensive bugs in this project were type
errors that a compiler catches for free, and both cost hours:

| bug | what happened | what a compiler would have said |
|---|---|---|
| `Game.get()` keyed on `constructor.name` | Worked in dev, returned `undefined` for **every** system in a production build because the minifier mangles class names. The game crashed on load in `vite preview` and the capture harness only ever tested the dev server. | A typed registry (`Map<SystemKey, System>` with a literal-union key) makes the lookup checkable and the mangling irrelevant. |
| `this.title.t = spec.at ?? 6` | `spec` can be the bare string `'title'`. `String.prototype.at` **is a function, not `undefined`**, so `??` never fired. `t` became a function, `t += dt` string-concatenated, `Math.cos` returned `NaN`, and the entire title-screen camera resolved to `NaN` — a black screen. | `spec: string \| TitleSpec` forces the narrow before the property access; assigning a function to `t: number` is an error. |

A third class shows up repeatedly in the integration audit: cross-system calls
guessing at APIs (`rpg.load` vs `rpg.loadGame`, `Dungeons.defs` being a `Map`
not an object, `Regalia.enter(autoDrive)` being passed the game object,
`body.pos` vs `body.position`). Every one of those is a compile error in a typed
codebase.

## 2. Sequencing — do not start while agents are live

235 modules, ~79,500 lines, and at time of writing six agents are concurrently
editing `src/ui/**`, `src/characters/**`, `src/combat/**`, `src/world/**`,
`src/engine/**` and `src/game/Shots.js`. A port touches every file, so it
conflicts with everything.

**Gate: every in-flight branch merged to `main` and the working tree quiet.**

## 3. Order of work

Leaf-first, so each stage compiles against already-typed dependencies.

| # | stage | files | why here |
|---|---|---|---|
| 0 | Config only, no renames | `tsconfig.json`, `tsconfig.tools.json`, devDeps, `typecheck` scripts | Prove the toolchain before touching code |
| 1 | `src/util/**` | 3 | No internal imports. Defines shared primitives (`Noise`, `Rng`, `TextureGen`) every other module consumes |
| 2 | `src/engine/**` | 20 | Declares the core contracts: the `System` interface, the `Game` registry key union, `PostFX`'s public surface |
| 3 | `src/game/rpg/**` | ~11 | Pure logic, zero three.js. Highest type value per line — this is the layer the UI reads through `hudState()` |
| 4 | `src/shaders/**`, `src/audio/**` | 15 | Small, isolated |
| 5 | `src/combat/**` | 11 | Depends on engine + rpg |
| 6 | `src/characters/**` | 44 | Depends on engine + combat |
| 7 | `src/world/**` | 68 | Largest area; depends on engine + util |
| 8 | `src/ui/**` | 25 | Depends on rpg + combat event types |
| 9 | `src/game/**` (rest) | ~37 | `Game`, `Shots`, story, cinematics, encounters, interaction |
| 10 | `src/tools/**` → `.mts` | 20 | Under `erasableSyntaxOnly` (see §5) |

## 4. `tsconfig.json` (src)

Copied from the siblings so all three projects agree.

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": false,
    "noImplicitOverride": true,
    "noUnusedLocals": true,
    "noUnusedParameters": false,
    "exactOptionalPropertyTypes": false,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src/**/*.ts"]
}
```

`noEmit` because Vite transpiles; `tsc` is only the checker.

## 5. `tsconfig.tools.json` (tools)

The tools run under **Node's strip-only type stripping**, which never checks
types and outright rejects some legal TypeScript — parameter properties, enums,
namespaces. So `tsc` is the only thing that checks them, and `erasableSyntaxOnly`
is what stops us writing syntax that type-checks but Node then refuses to run.

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    // DOM is needed even though these run in Node: page.evaluate() callback
    // bodies are compiled here but execute in the browser.
    "lib": ["ES2022", "DOM"],
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "erasableSyntaxOnly": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/tools/**/*.mts"]
}
```

## 6. Dependencies and scripts

```
devDeps: typescript, @types/node, @types/three
scripts: "typecheck": "tsc --noEmit -p tsconfig.json"
         "typecheck:tools": "tsc --noEmit -p tsconfig.tools.json"
```

## 7. The types worth designing rather than inferring

Most of the port is mechanical. These few are where the value is:

- **`System`** — the lifecycle every registered system implements:
  `init(game): void | Promise<void>`, `update?(dt, game)`, `lateUpdate?(dt, game)`,
  optional `resetClock?()`.
- **`SystemKey`** — a literal union of the 25 registry keys plus their aliases
  (`'Combat' | 'CombatSystem' | 'Camera' | 'CameraRig' | …`), so
  `game.get('Terain')` is a compile error, and `game.get('Terrain')` returns
  `Terrain` rather than `any`. This is the single highest-value type in the
  codebase and directly prevents the `constructor.name` class of bug.
- **`Shot`** — a discriminated union over the framing modes: a fixed
  `{ pos, target, fov }` shot versus a `{ follow: 'player', offset, lookOffset }`
  shot, plus the optional `time`/`weather`/`scenario`/`menu`/`story`/`hud` fields.
  Several shots have broken by mixing these; the union makes it impossible.
- **The combat event map** — `combat:damage`, `combat:hit`, `combat:warp`,
  `combat:lockon` and the rest, typed as a `Record<EventName, PayloadType>` so
  the HUD, audio and RPG bridges all agree on payload shape. Three systems
  currently subscribe to these by convention alone.
- **`Terrain`'s cross-system contract** — `heightAt`, `normalAt`, `slopeAt`,
  `sampleMaterial`, `roadDistance`, `roadCenterX`, `road`, `landmarks`,
  `setWetness`. A dozen systems call these every frame and one of them
  (`Ecology`) silently fell back to a wrong road curve when `roadCenterX` was
  missing. An interface makes that a compile error instead of a visual bug.

## 8. Definition of done

- [ ] `pnpm typecheck` and `pnpm typecheck:tools` both clean
- [ ] Zero `.js` files under `src/`
- [ ] `pnpm exec vite build` passes
- [ ] `node src/tools/orphans.mjs` — still 100% reachable
- [ ] `node src/tools/integration.mjs` — still 0 failures
- [ ] `node src/tools/shoot.mjs` — exits 0, and `src/tools/imgdiff.mjs` shows no shot
      above the measured harness noise floor (1.58–1.99 mean/255)
- [ ] `node src/tools/gameplay.mjs` — no worse than before the port
- [ ] Both typechecks added to `.githooks/pre-commit` alongside the build

## 9. Explicitly not in scope

- Rewriting logic while porting. A port that also refactors cannot be verified
  by image diff, which is the only cheap proof we have that nothing broke.
- `any`-eliminating heroics in shader-string or `onBeforeCompile` code, where
  three.js's own types are weak. `// @ts-expect-error` with a reason beats a
  fictional type.
