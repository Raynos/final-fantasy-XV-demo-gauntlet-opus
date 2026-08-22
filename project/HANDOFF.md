# Handoff

You are taking over a AAA-quality recreation of **Final Fantasy XV** in ThreeJS,
built entirely procedurally — no asset files, no network, everything generated in
code. This document is what I wish I had been handed: **how this is built**. It
is durable, not a snapshot — the numbers and the live state live in
`project/STATUS.md`.

Read in this order:

1. **`BRIEF.md`** — the contract every agent works against.
2. **`project/STATUS.md`** — where the project is right now, who owns what, which
   gates pass, what is next. Start here if you are resuming.
3. **This file** — the method, the tooling, the architecture.
4. **`project/LANDMINES.md`** — what will bite you, and the seven diagnoses that
   were confidently wrong. Read its last section twice.
5. **`docs/SCOPE.md`** — the atomic inventory of what the game should contain.
6. `docs/WORLDMAP.md` (cartography), `docs/plans/` (live plans only),
   `project/README.md` (which document is which genre and why).

For the narrative version of how this got built — including what went wrong and
why several things are the way they are — see `project/journal/`.

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

Five rules that produced most of the value:

1. **Agents must look at their own output.** Every brief says "read the PNGs with
   the Read tool and actually look at them". Agents that only check for absence
   of errors ship ugly work that renders fine.
2. **Grade against shipped FFXV, never against improvement.** Critics are told
   this explicitly. "Better than last round" is not a bar.
3. **Do not trust an agent's report — verify the merge.** Several reports were
   wrong in ways that mattered; `LANDMINES.md` ends with the list. Merge,
   capture, look.
4. **Disjoint file ownership.** Agents run in git worktrees and own directories.
   Anything cross-boundary is *reported*, not edited, and the coordinator applies
   it. Two agents editing `_readInput` independently caused the only merge
   conflict in 114 commits.
5. **Every agent keeps `project/handoff/<topic>.md` current.** An agent that can
   be replaced by its handoff is one you can retire the moment it stops being
   worth its cost; one that can't has taken its afternoon hostage. Same principle
   as `STATUS.md`: the state lives on disk, not in a context window.
   `project/handoff/README.md` has the rules, including what happens to a handoff
   when its branch merges.

## 2. Tooling — learn these before writing code

Everything is `.mts` and runs under Node's type stripping. Shot names are
**positional** on `shoot.mts`, not `--shot`.

**Start here**

| tool | what it is for |
|---|---|
| `npm run check` | **The whole gate suite, one table.** Run it at every merge, not just the cheap gates — `combatloop` slid 30/30 → 21/30 and went unnoticed for weeks because the expensive ones were skipped. `npm run check:perf` adds `perf` and `gameplay`, opt-in, quiet tree only. |
| `shoot.mts` | Capture named shots from `src/game/Shots.ts`. Fixed timestep, exits non-zero on any console error. `--prod` builds and serves the real bundle. `--jpeg` writes review-sized JPEGs — use it for anything an agent will read back. |
| `daemon.mts` | Holds one vite + one Chromium + one booted page across invocations. Warm capture ~1.5 s vs ~24 s cold. Used by `shoot.mts` by default. |
| `sheet.mts` | Contact sheet of a shot directory, paginated to `_sheet-1.jpg`, `_sheet-2.jpg` … at 12 a page. How critics review the whole game at once. |
| `corpus.mts` | Captures every shot in `Shots.ts` and lays it out as one sheet per category — every zone, every dungeon room, every enemy, as a single image. |

**Gates** — all wired into `npm run check`

| tool | asserts |
|---|---|
| `integration.mts` | Features are **reachable in play**, not merely present. 18 checks. |
| `uxcheck.mts` | Every registered screen responds to real input. Grows by three per new screen. |
| `combatloop.mts` | Combat mechanics respond to real input. |
| `orphans.mts` | Static reachability from `main.ts`. Catches dead code. |
| `roadcheck.mts` | Every drivable POI reachable; grades and corner radii legal. |
| `heightcheck.mts` | The shared height field agrees GPU vs CPU. |
| `creaturecheck.mts` | Creatures are grounded and posed. |
| `anycheck.mts` | Counts `any` and **fails if it goes up**. `--by-file` for the worst; `--set` lowers the ceiling in `ANY_BUDGET.json`. |

**Measurement**

| tool | what it is for |
|---|---|
| `gameplay.mts` | **The primary perf gate.** Drives the real loop with synthetic input across 13 segments (walk, sprint, combat, warp, menus, streaming, weather). Posed shots hide the hitches that ruin play. |
| `perf.mts` | Posed frame-time benchmark, `gl.finish()`-bracketed, median/min/mean/p95. |
| `attrib.mts` | Per-subsystem cost attribution, A/B/A baselined. |
| `bootprof.mts` | Cold and warm page load with a per-system breakdown. |
| `imgdiff.mts` | Visual regression. **The noise floor is per-shot** — measure it for the shot you are comparing rather than quoting the 1.5–1.9 constant. PNG only. |
| `driftcheck.mts`, `detcheck.mts` | Does the rendered surface stay put as the camera travels; is nondeterminism from boot or from stepping. |

**Framing and inspection**

`framecam.mts` (free camera, and the only way to judge faces — at 0.4–0.6 m),
`dresscam.mts` (world dressing by zone or POI), `mapview.mts` / `chartshoot.mts`
(cartography), `ui-shoot.mts` (UI states the shared corpus does not cover),
`probe.mts` (runs a snippet from `src/tools/probes/` as a function body in the
page), `crop.mts` (crop and magnify a capture).

**Housekeeping**

`cleanup.mts` reports orphaned vite/chromium and `--kill` acts, grading
confidence so a live agent's server is never killed. `shrink.mts` recompresses
the shot archive to JPEG in place, holding recent directories lossless for
`imgdiff`; dry run by default. `agentstats.mts` shows what each live subagent
costs — turns, context, p50/p90 model wait, screenshot MB, last tool — which is
how you tell *expensive* apart from *stuck*.

**`.githooks/pre-commit`** runs `vite build`, both typechecks, and the doc line
budgets. Enable with `git config core.hooksPath .githooks`. A syntax error in a
module the dev server already parsed still boots in dev, fails the build, and
hangs the harness on `waitForFunction` for 120 s with no useful error; a broken
cross-system contract shows up nowhere else at all, because vite strips the types
without reading them.

**Chromium flags live in `src/tools/chromium.mts`.** `--disable-frame-rate-limit`
is deliberately absent — measured 3× idle CPU for zero benefit. Do not add it back.

## 3. Architecture

`Game` (`src/game/Game.ts`) constructs 25 systems in a load-bearing order and
ticks `init` → `update` → `lateUpdate`. Reach others with `game.get('Terrain')`.

**Registration is by explicit key, never `constructor.name`** — the minifier
mangles it and every lookup returns `undefined` in a production build. This cost
a full debugging cycle; do not "simplify" it back.

Order matters in specific places, all commented in `Game.ts`: `Rpg` before `HUD`
(the HUD reads it during init), `Interaction`→`Town`→`Npcs` (screens, then
anchors), `Cinematics`/`Story` after `Camera` (they win the lens), `Dungeons`
last (it overrides exposure, grade and atmosphere — and that is the state leak
behind the black cutscene sky).

The whole of `src/` is TypeScript: `.ts` for the game, `.mts` for the harness
(which runs under Node's strip-only type stripping, hence `erasableSyntaxOnly` in
`tsconfig.tools.json`). Probe snippets under `src/tools/_probe/` and
`src/tools/probes/` are excluded from the tools config: they are read as text and
evaluated as a *function body*, so a top-level `return` is correct and they are
not modules.

## 4. Running agents

- **One `PORT` per worktree**, and the capture daemon takes `PORT+1`. Aiming
  `framecam.mts` at the daemon port hangs for the full 300 s timeout.
- **Cap concurrency at ~4.** Six-plus concurrent headless Chromiums push load
  average past 18, make every measurement worthless, and stall agents outright —
  that is what killed three agents in one round.
- **A slow agent is usually not a stuck one, and the difference is invisible from
  outside.** `agentstats.mts` shows both: a healthy `last tool` with a p90 in the
  hundreds of seconds means expensive; a `last tool` minutes old with no result
  means blocked. One agent sat 94 minutes inside a single `git reset --hard`.
- **Merging invalidates coordinates.** After any world change, re-probe anchors
  and re-frame shots before judging anything.
- **Screenshots dominate an agent's transcript** — 20 PNG reads is 12–15 MB, ~95%
  of everything it carries. Capture with `--jpeg`.
- **Clean up worktrees.** They reached 6.1 GB before pruning.
- `tmp/shots/` is gitignored, and so is the terrain bake cache
  (`src/public/baked/`, 32 MB, regenerated deterministically).

Everything else that will bite you is in **`project/LANDMINES.md`**.
