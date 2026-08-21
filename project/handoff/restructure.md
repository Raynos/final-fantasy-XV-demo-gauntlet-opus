# Handoff — repo restructure (2026-08-21)

**Status: done and verified.** Nothing is left in progress. `main` @ `0422f03`,
working tree clean. This file exists for the two things that will bite someone
holding an older branch or worktree, and for one bug found but not fixed.

## What the layout is now

Four buckets; the root holds only config and three docs. `CLAUDE.md` §Layout is
the durable statement of the rule — read that, not this file, for the convention.

| was | is |
| --- | --- |
| `tools/` | `src/tools/` |
| `index.html` | `src/index.html` (vite's `root` is now `src/`) |
| `public/` | `src/public/` (vite's `publicDir`) |
| `shots/` | `tmp/shots/` (default `--out` for every capture tool) |
| `docs/HANDOFF.md`, `docs/handoff/` | `project/HANDOFF.md`, `project/handoff/` |
| `SCOPE.md`, `WORLDMAP.md`, `PLAN.md` | `docs/SCOPE.md`, `docs/WORLDMAP.md`, `docs/plans/content-gameplay.md` |
| `PROGRESS.md`, `SESSION-STATE.md`, `TODO.md`, `journal/` | under `project/` |
| `probes/` | `src/tools/probes/` |

## The two traps

1. **In-page imports lost their `/src` prefix.** `src/` is vite's `root`, so the
   dev server serves `/world/terrain/Field.js`, not `/src/world/terrain/Field.js`.
   Any `await import('/src/…')` inside a `page.evaluate` now 404s. Eleven call
   sites across the tools were rewritten; a twelfth written from memory will fail.
2. **Tools sit one directory deeper.** 23 of them computed the repo root as
   `dirname(import.meta.url)/'..'`, which from `src/tools/` is `src/`. They now use
   `'..', '..'`. Get this wrong in a new tool and `bake.mjs` writes
   `src/src/public/baked/` and the terrain silently re-bakes every boot.
   Two tools (`roadcheck.mjs`, `corpus.mjs`) additionally reached the game through
   `'../src/world/…'` and were missed by the first sweep — fixed in `0d35f74`.

## Where generated things live, and why

`dist/` (build output) and `src/public/baked/` (32 MB terrain cache) are both
git-ignored, and **neither belongs in `tmp/`**: `tmp/` must stay free to delete,
and a re-bake is not free. The cache also cannot live in `dist/` — vite empties
`dist/` at the start of every build and never serves it in dev, so it would be
destroyed and regenerated on each build. It is a build *input*; vite copies it to
`dist/baked/` as build *output*.

## Verification run at the end

`vite build` pass · `orphans.mjs` **272/272, no orphans** · `roadcheck.mjs` 0
failures / 30.26 km · `heightcheck.mjs` GPU vs CPU 0.000 m at every sample ·
`bake.mjs` "already fresh" · `mapshoot.mjs` 20/20 shots, world map drawing relief,
biome tint, roads, 124 POI glyphs, labels and fog · `shoot.mjs hero_full` at
4836320 tris / 543 calls, unchanged from before the move.

## Also done

`src/world/map/MapRaster.js` deleted (`9b5ad3e`) — the re-export facade left by the
`5fd2876` cartography split. Nothing ever imported it and its `@deprecated`
`drawWorldRaster` had no callers. The bundle hash is unchanged by the deletion
(`index-eksEl-nz.js`, 2,612.97 kB), which is proof it never reached the build.
`orphans.mjs` is clean for the first time, so any orphan it reports now is new.

## Open — not mine, not investigated

**The `hud_minimap` shot renders with no minimap on screen** (bare terrain plus a
TALK prompt). `Minimap` is registered at `src/game/Game.js:121` and
`src/tools/mapshoot.mjs:112` does call `mm.setVisible(true)`, but
`Minimap.update()` damps opacity toward its target and sets `display:none` below
`0.004`, while `mapshoot.mjs:79` calls `GAME.stop()` — so plausibly nothing drives
`update(dt)` and it never fades in. **That is a hypothesis, not a diagnosis.**
Pre-existing and unrelated to the restructure. `src/ui/**` belongs to the round-5
rescue session, which has been told.

## Note for concurrent sessions

More than one session commits from this checkout on `main`. Stage explicit paths
(`git add <path>`); `git add -A` here sweeps a peer's in-progress edits into your
commit. Related: `project/RESCUE.md`.
