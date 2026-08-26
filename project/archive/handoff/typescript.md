# TypeScript port — done

**Plan:** `project/archive/plans/2026-08-22-opus-phase2-typescript-port.md` (phase 2).
**Status:** complete. Every file under `src/` is TypeScript, both typechecks are
clean, all 9 gates are green, and the pixel diff against the pre-port build is
inside each shot's own run-to-run noise.

---

## What shipped

| | before | after |
|---|---|---|
| `.js` / `.mjs` under `src/` | 312 | **0** |
| `.ts` / `.mts` under `src/` | 0 | **314** |
| `pnpm run typecheck` | — | **clean** (`strict`, 275 modules) |
| `pnpm run typecheck:tools` | — | **clean** (`strict` + `erasableSyntaxOnly`, 39 tools) |
| `pnpm run check` | 9/9 | **9/9** |

Config: `tsconfig.json` (game) and `tsconfig.tools.json` (harness), both from the
plan, plus two deliberate additions documented in the files themselves —
`useDefineForClassFields: false` and the tools config's `exclude` for probe
snippets. Both typechecks run in `.githooks/pre-commit` alongside the build.

## Verification

- **`pnpm run check` — 9/9.** Run it after any follow-up work here; it is the
  only thing that caught the one real regression this port introduced (below).
- **imgdiff, pre-port vs post-port, 10 shots.** Every delta is inside that
  shot's own floor, measured by capturing the same shot twice on the same build:

  | shot | pre→post | floor (post→post) |
  |---|---|---|
  | party_formation | 1.785 | 1.778 |
  | hero_full | 1.478 | 1.471 |
  | hud_field | 0.835 | 0.831 |
  | zone_galdin | 0.784 | 0.783 |
  | zone_lestallum | 0.532 | 0.488 |
  | poi_haven | 0.239 | 0.235 |
  | menu_main | 0.152 | 0.151 |
  | storm | 0.093 | 0.092 |
  | vista_dusk | 0.081 | 0.081 |
  | menu_map | 0.013 | 0.013 |

  The floor is per-shot and nothing like a constant: `menu_map` is 0.013 and
  `party_formation` is 1.78. Comparing either against the corpus-wide "1.5–1.9"
  would have told you nothing.
- **Perf, A/B against a worktree at the pre-port commit** (`git worktree add`,
  not `git stash` — stashing a clean tree stashes nothing and compares a build
  against itself):

  | | pre-port | post-port |
  |---|---|---|
  | `gameplay` worst segment (walk) | 44.6, 47.8 fps | 47.8, 48.3 fps |
  | `perf` mean / worst | 70.1 / 39.8 fps | 72.8 / 40.0 fps |

  Two runs each. The port is inside the variance. Both perf gates were already
  failing their 60 fps target before the port; that is why `pnpm run check`
  excludes them by default and still reads 9/9.

## How it was done, in case it matters later

The plan sequences thirteen stages leaf-first. The *rename* was done in one
move instead — import specifiers, `src/index.html` and the hardcoded paths in
`src/tools/**` all have to agree, and doing that thirteen times would churn the
same references thirteen times with a half-renamed tree in between. The typing
order still followed the plan.

22,360 errors at the moment of rename, cleared in this order:

1. **JSDoc → annotations** (1,285 params, 239 returns). The codebase already
   carried 1,491 `@param {T}` tags, which a `.ts` file ignores entirely.
2. **Field declarations** (2,839). TypeScript, unlike `checkJs`, does not
   synthesise a property from `this.x = v`. Types merged from every assignment
   in the class; driven by TS2339 rather than the AST, which is what kept it
   from redeclaring `position` on classes extending `THREE.Object3D`.
3. **`any` on what could not be inferred** (5,021 params). Explicit and
   greppable, where `noImplicitAny: false` would have hidden the same debt.
4. Then the compiler-driven passes: `override`, trailing-optional parameters,
   `keyof typeof` on dynamic table lookups, null widening, options types.
5. Then ~1,200 errors read one area at a time, in the plan's order.

## What the port found

Real defects and drift, all of them things no test could see:

- **`Director.setScenario`'s JSDoc said `'field'|'combat'|'warp'`** while the
  function had grown four more branches that six shots depend on. Now a shared
  `ScenarioName` union.
- **`Enemy.pose()` was declared to take nothing** while all 22 species override
  it as `pose(state, phase, ctx)` and the base class calls it with three
  arguments in three places.
- **`paint()` in `Goblin.ts` documented its callback as returning
  `[colour, blotchAmount]`**; the body has always read `c.r/g/b`.
- **`FieldCodec.unpackContainer` declared `section(): Uint8Array | null`** and
  has always returned the header entry plus a byte view.
- **`Dungeons` hands its entrance interactables to `interaction.add(...)`**
  behind a `typeof interaction.add === 'function'` guard, and
  `InteractionSystem` exposes `register`, not `add` — so the guard has always
  been false and dungeon mouths have no interaction prompt. **Left as found,
  with a note**: fixing it changes what the world does, and a port verified by
  image diff must not. This is the one open item.
- **`notify('cook')`** is posted when Ignis cooks and no objective listens for
  it. Kept in the `ObjectiveKind` union with that recorded.

## The one regression, and what it teaches

The dead-code pass deleted `const e = pin(spawnAhead('sabertusk'))` from four
`combatloop` checks — `noUnusedLocals` was right that nothing reads `e`, and
wrong that the statement did nothing: it is what puts an enemy in front of
Noctis. combatloop went 30/30 → 28/30 with "no damage event", and `pnpm run
check` is what found it. Restored as bare calls.

The general lesson is the one already in `CLAUDE.md`: run the whole gate suite
at a merge, not the cheap half.

## Types worth knowing about

- `System` (`src/engine/System.ts`) — the lifecycle. `init` returns `unknown`,
  not `void`: five systems end it with `return this`.
- `SystemRegistry` / `SystemKey` (`src/game/Game.ts`) — all 25 registry keys
  plus five aliases, so `game.get('Terain')` is a compile error and
  `game.get('Terrain')` is a `Terrain`. The boot order is a mapped-type union of
  `[key, factory]` pairs, so a line that builds the wrong system for its name
  will not compile.
- `Shot` (`src/game/Shots.ts`) — a discriminated union over the two framing
  modes. All 139 shots validate; none currently mix modes.
- `CombatEvents` (`src/combat/CombatEvents.ts`) — all 22 combat events and their
  payloads, with `on`/`off`/`emit` generic over it. `src/globals.d.ts` mirrors
  the same names onto `WindowEventMap` for the `combat:*` window events.
- `Landform` (`src/world/map/WorldMap.ts`) — discriminated on `kind`, because
  `terrain/Field.ts` branches on it and then reaches for whichever geometry that
  branch needs.

## Known debt

- ~5,000 explicit `any` parameters, and roughly 2,800 class fields typed from
  their assignments (many of them `any`). All greppable; narrowing them is
  incremental work with a green typecheck at every step.
- `src/tools/browser.d.ts` declares in-page URL imports as `any`. Typing those
  properly would mean teaching the tools config about the game's module graph.
- The `Dungeons` / `InteractionSystem` mismatch above.
