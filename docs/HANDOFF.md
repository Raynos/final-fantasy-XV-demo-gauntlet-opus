# Handoff

You are taking over a AAA-quality recreation of **Final Fantasy XV** in ThreeJS,
built entirely procedurally — no asset files, no network, everything generated in
code. This document is what I wish I had been handed.

**State at handoff:** 114 commits · 249 source files · ~86,300 lines · 39 shots ·
25 registered systems · SCOPE 251 shipped / 3 in progress / 90 not started.

**Resuming mid-session?** `SESSION-STATE.md` at the repo root has the live
agent ids, what each is doing, and how to pick up if a session died.

For the narrative version of how this got built — including what went wrong
and why several things are the way they are — see `journal/2026-08-17-51c0b82c.md`.

Read next, in this order: `BRIEF.md` (the contract every agent works against),
`SCOPE.md` (atomic checklist), `PROGRESS.md` (status + bug log), `PLAN.md`
(design audit), `WORLDMAP.md` (cartography), `docs/dev-suite-plan.md`
(in-game debug/review suite), `docs/typescript-port-plan.md`.

---

## 1. The method — this is the important part

The loop that has worked:

```
dispatch parallel agents on disjoint files
  -> each agent iterates shoot → LOOK AT THE PNG → fix, ≥5 rounds
  -> merge to main, verify the merge yourself
  -> run harsh critic agents against the result
  -> feed critique back as the next round's briefs
```

Four rules that produced most of the value:

1. **Agents must look at their own output.** Every brief says "read the PNGs with
   the Read tool and actually look at them". Agents that only check for absence
   of errors ship ugly work that renders fine.
2. **Grade against shipped FFXV, never against improvement.** Critics are told
   this explicitly. "Better than last round" is not a bar.
3. **Do not trust an agent's report — verify the merge.** Several reports were
   wrong in ways that mattered (see §5). Merge, capture, look.
4. **Disjoint file ownership.** Agents run in git worktrees and own directories.
   Anything cross-boundary is *reported*, not edited, and the coordinator
   applies it. Two agents editing `_readInput` independently caused the only
   merge conflict in 114 commits.

## 2. Tooling — learn these before writing code

| tool | what it is for |
|---|---|
| `tools/shoot.mjs` | Capture named shots from `src/game/Shots.js`. Fixed timestep, exits non-zero on any console error. `--prod` builds and serves the real bundle. |
| `tools/daemon.mjs` | Holds one vite + one Chromium + one booted page across invocations. A warm capture is ~1.5 s vs ~24 s cold. Used by `shoot.mjs` by default. |
| `tools/perf.mjs` | Posed frame-time benchmark. `gl.finish()`-bracketed, reports median/min/mean/p95. |
| `tools/gameplay.mjs` | **The primary perf gate.** Drives the real loop with synthetic input across 13 segments (walk, sprint, combat, warp, menus, streaming, weather). Posed shots hide the hitches that ruin play. |
| `tools/attrib.mjs` | Per-subsystem cost attribution, A/B/A baselined. |
| `tools/integration.mjs` | **Proves features are reachable in play**, not merely present. 18 checks. |
| `tools/orphans.mjs` | Static reachability from `main.js`. Catches dead code. |
| `tools/imgdiff.mjs` | Visual regression. **Measured noise floor 1.5–1.9 mean/255** — anything above that needs justifying. |
| `tools/sheet.mjs` | Contact sheet of a shot directory. How critics review the whole game at once. |
| `tools/cleanup.mjs` | Kills orphaned vite/chromium. Grades confidence so a live agent's server is never killed. |
| `tools/roadcheck.mjs` | Asserts every drivable POI is reachable, grades and corner radii are legal. |
| `tools/uxcheck.mjs`, `tools/combatloop.mjs` | Assert menus and combat mechanics respond to real input. |

`.githooks/pre-commit` runs `vite build` (enabled via `core.hooksPath`). A syntax
error in a module the dev server already parsed still boots in dev, fails the
build, and hangs the harness on `waitForFunction` for 120 s with no useful error.

**Chromium flags live in `tools/chromium.mjs`.** `--disable-frame-rate-limit` is
deliberately absent — measured 3× idle CPU for zero benefit. Do not add it back.

## 3. Architecture

`Game` (`src/game/Game.js`) constructs 25 systems in a load-bearing order and
ticks `init` → `update` → `lateUpdate`. Reach others with `game.get('Terrain')`.

**Registration is by explicit key, never `constructor.name`** — the minifier
mangles it and every lookup returns `undefined` in a production build. This cost
a full debugging cycle; do not "simplify" it back.

Order matters in specific places, all commented in `Game.js`: `Rpg` before `HUD`
(the HUD reads it during init), `Interaction`→`Town`→`Npcs` (screens, then
anchors), `Cinematics`/`Story` after `Camera` (they win the lens), `Dungeons`
last (it overrides exposure, grade and atmosphere).

## 4. Where the quality actually is

Last full critic pass scored **4.5/10 overall** (up from 3.5): environment 7.5,
world dressing 5, UI 8, combat VFX 6.5, characters 2.5→5.5 after two more rounds.
Since then: clouds, cartography, collision, menus and the combat loop all landed
and have not been re-scored. **Run a fresh critic pass early — you are flying on
stale numbers.**

Genuinely strong: the field HUD, atmosphere/aerial perspective, terrain strata
and silhouette, the world map, the opening cutscene, warp-strike VFX.

Known weak: character faces and hair at distance, enemy models (a round is in
flight), storm as a composition, `haven_dusk` exposure.

## 5. Hard-won lessons — read this section twice

Every one of these cost real time and none were obvious:

- **`Game.get()` on `constructor.name`** worked in dev, returned `undefined` for
  every system in a production build. The harness only ever tested dev. Fixed,
  and `shoot.mjs --prod` exists so it cannot recur.
- **5,765 lines of RPG systems were dead code** — constructed, ticked, read by
  nothing, while the HUD drew invented literals over them. Existence is not
  integration. That is why `tools/integration.mjs` exists.
- **`spec.at ?? 6`** — `spec` can be the string `'title'`, and
  `String.prototype.at` *is a function, not undefined*, so `??` never fired. The
  title camera resolved to `NaN` and rendered black.
- **Undefined mip level in divergent control flow.** The cloud weather map was
  read inside a raymarch whose neighbouring pixels diverge, so the implicit
  derivative spanned kilometres and the hardware picked the coarsest mip — a
  uniform coverage value with no holes. That was the black slab in the sky.
- **`setHex(tint, SRGBColorSpace)` returns a *linear* colour**, then written into
  an sRGB-tagged texture and de-gamma'd twice. Every prop was ~10× too dark.
- **three.js has no per-instance normal matrix** — it divides the object normal
  by each instance-matrix column length, so non-uniform instance scale flattens
  normals. That was the "green cardboard" grass.
- **Toggling a light's `visible` changes the program key** and recompiled 43
  programs — a measured 9.5 s freeze. `engine/LightBudget.js` pins the counts.
- **`GTAOPass` sets `scene.overrideMaterial`, which discards alpha-test**, so
  foliage stamped solid black rectangles into the AO buffer.
- **A planar water reflection enabling layer 0** is a full second scene render.
  Documented as "sky + terrain only"; it was not.
- **Coordinates go stale.** Shots framed against world anchors broke twice when
  the terrain was reshaped and again when the world grew 3 km → 8 km. Derive
  coordinates live from `WorldMap`/`Terrain`, never hard-code and hope.
- **Agents' numbers are not evidence.** One reported grass at 8.9 ms; a later
  measurement found 0.3–1.2 ms and left it alone. Two agents correctly disproved
  a critic's claims by measuring. Ask for the measurement, not the conclusion.

## 6. What is in flight right now

Two agents, both in worktrees under `.claude/worktrees/`:

- **`agent/bestiary2`** — enemy model quality and combat animation (telegraphs,
  hit reactions, death anims, per-body-plan gaits). Owns
  `src/characters/{Enemies.js,enemies,ai}` and `rig/Anim.js`.
- **`agent/corpus`** — expanding `src/game/Shots.js` from 39 to ~55-60 shots
  covering all 19 zones, every POI type, weathers, dungeons, UI and bestiary.

Merge them, verify, then re-run the critic pass.

## 7. What to do next, in order

1. **Merge the two in-flight branches** and re-run `integration.mjs`,
   `gameplay.mjs`, `shoot.mjs`.
2. **Fresh critic pass** on the expanded corpus — the scores are stale and the
   game has changed a lot underneath them.
3. **Close the perf gate.** `gameplay.mjs` must have every segment ≥60 fps median
   and no frame over 33 ms. Known remaining: 180–600 ms streaming and
   weather-rebuild hitches; `storm` at ~21 ms.
4. **Characters** are still the lowest-scoring axis and appear in most shots.
   Head sculpt and hair are the named gaps.
5. **The unverified `heightAt` claim.** A story agent reported `Terrain.heightAt`
   reads ~1 m below the rendered surface off the carriageway. I could not verify
   it — the terrain displaces in the *vertex shader*, so a CPU raycast hits the
   undisplaced lattice. It needs a GPU readback. If true, everything placed on
   the ground is subtly wrong.
6. **The in-game dev/review suite** — `docs/dev-suite-plan.md`. Freecam, asset
   browser, world navigator and a feedback inbox that writes `.review/inbox/`.
   Written because every defect in the r4 corpus round was *visible* but not
   *findable*: the only way to look at the game was a 20-minute batch capture of
   fixed cameras.
7. **The TypeScript port** — `docs/typescript-port-plan.md`, gated on a quiet tree.
7. **Content still missing:** chocobos, fishing, photo-mode capture, camping at
   havens (only the Hammerhead caravan works), fast travel, the remaining towns.

## 8. Things that will bite you

- **Don't dispatch two agents onto the same file.** I did it once with `terrain/**`
  and had to tell an agent mid-flight that the ground had been rewritten under it.
- **Merging invalidates coordinates.** After any world change, re-probe anchors
  and re-frame shots before judging anything.
- **The machine saturates.** Six-plus concurrent agents each running headless
  Chromium pushes load average past 18 and makes every measurement worthless.
  Agents will report numbers taken under contention — ask about load conditions.
- **`shots/` is gitignored** and so is the terrain bake cache
  (`public/baked/`, 32 MB, regenerated deterministically from the generators).
- Use worktrees, and clean them up: they reached 6.1 GB before pruning.
