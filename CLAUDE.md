# Working in this repo

`BRIEF.md` is the contract — art direction, engine contracts, definition of done.
Read it before writing code. Coordinating rather than implementing? `project/HANDOFF.md`
first, then `project/STATUS.md` for who currently owns what.

## Layout

Four buckets, and the root holds nothing but config and the three docs below.

- **`src/`** — everything the build reads. The game, plus `src/index.html` (vite's
  `root`, so in-page dev-server URLs are `/world/...`, **not** `/src/world/...`),
  `src/public/` (the generated terrain cache, ignored) and `src/tools/` (the
  harness: capture, checks, probes for `src/tools/probe.mts`).
- **`docs/`** — durable reference: what the game *is*. `docs/SCOPE.md` (the only
  inventory), `docs/WORLDMAP.md`, and `docs/plans/` for **live proposals only** —
  named `<YYYY-MM-DD>-<model>-<topic>.md`, carrying a `Status:` line, and
  graduating to `project/archive/` when `DONE` or `SUPERSEDED`. `docs/plans/README.md`
  has the vocabulary.
- **`project/`** — working state: how the work is *going*. `project/STATUS.md`
  (the snapshot — **replaced in place, never appended to**), `project/HANDOFF.md`
  (durable method and tooling), `project/LANDMINES.md` (what will bite you),
  `project/handoff/<topic>.md` (one per *live* agent, graduating on merge),
  `project/journal/`, `project/archive/`, and `project/TODO.md` (human-written —
  agents never edit it). **`project/README.md` states which document is which
  genre and why that matters**; read it before adding a file here.
- **`tmp/`** — scratchpad. **Deleting it whole must cost nothing**: no build, no
  deploy and no dev-server run may read anything in it. `tmp/shots/` (the default
  `--out` for every capture tool) is what it is for.

`dist/` is build output and `src/public/baked/` is the terrain cache — both
generated, both ignored, neither belongs in `tmp/` because losing them costs a
re-bake. The cache cannot live in `dist/` either: vite empties `dist/` on every
build and never serves it in dev. It is copied into `dist/baked/` at build time.

The whole of `src/` is TypeScript: `.ts` for the game, `.mts` for the harness
(which runs under Node's strip-only type stripping, hence `erasableSyntaxOnly` in
`tsconfig.tools.json`). `npm run typecheck` covers the game, `npm run
typecheck:tools` the harness, and both run in the pre-commit hook. Probe snippets
under `src/tools/_probe/` and `src/tools/probes/` are excluded from the tools
config: they are read as text and evaluated as a *function body* in the page, so
a top-level `return` is correct and they are not modules.

Root: `README.md` (the human's original brief), `CLAUDE.md`, `BRIEF.md` (the
contract), and build config. New file that is none of the above? It belongs in one
of the four buckets, not at the root.

## Committing

**Commit early and often, and keep commits small.** One concern per commit: a
fix, a system, a rename — not an afternoon. The reasons are specific to how work
happens here:

- The pre-commit hook runs `vite build`, so every commit is also a build check.
  Committing often means a syntax error surfaces within minutes instead of after
  a 120 s capture timeout you then have to bisect.
- Agents work in parallel worktrees on disjoint directories. Small, frequent
  commits are what keep the coordinator's merges trivial — the one merge conflict
  in 114 commits came from two agents sitting on a large uncommitted change.
- A retired or crashed agent loses only what it had not committed. This is the
  same principle as `project/STATUS.md`: the state lives on disk.

Do not batch unrelated changes to save a turn, and do not wait until a system is
"finished" — commit the working intermediate step. Messages stay long-form: say
what changed and *why*, the way the existing log does.

## Handing off

Keep `project/handoff/<topic>.md` current as you work: what is done and verified, what is
left, the exact next step, files touched, open questions, and the shots that show the
current state. It is what lets a fresh agent pick your work up, and it means retiring
you costs one turn instead of losing an afternoon.

After roughly three hours, finish what you are mid-way through, bring the handoff up to
date and stop at a sensible pause rather than opening a new line of investigation. Past
~400 turns, treat it as a hard stop — no agent here has usefully gone further.

## Looking at your own work

Non-negotiable, per `BRIEF.md`: capture, then **read the image and actually look at it**.
Structural correctness is not the bar.

- Capture review frames with `--jpeg`: `node src/tools/shoot.mts hero_full --out tmp/shots/x --jpeg`.
  A 1600×900 capture is downscaled to a 1568 px long edge before you see it either way,
  so a 2.5 MB PNG shows you nothing a 250 KB JPEG doesn't — it just makes every later
  turn carry it. Leave PNG as the default when the capture feeds `src/tools/imgdiff.mts`,
  which measures pixels and has a 1.5–1.9/255 noise floor.
- Contact sheets come out paginated: read `_sheet-1.jpg`, `_sheet-2.jpg` … one at a time.
  Never read a `_sheet.png` — the old single-image sheets reach 45 MB and 30 000 px tall,
  and arrive as an illegible strip.
- Shot names are **positional** on `src/tools/shoot.mts`, not `--shot`.

## Reading tool output

Use judgement. `perf.mts`, `gameplay.mts`, `integration.mts`, `combatloop.mts`,
`roadcheck.mts` and friends print bounded reports meant to be read whole — read them.
`manifest.json`, full-corpus captures and `git log` over a long range are unbounded;
slice those to the part you need.

## Running the harness

- One `PORT` per worktree, and the capture daemon takes `PORT+1`. Aiming `framecam.mts`
  at the daemon port hangs for the full 300 s timeout.
- `git config core.hooksPath .githooks` — the pre-commit hook runs `vite build` and both
  typechecks. A syntax error that the dev server tolerated will otherwise hang the next
  capture for 120 s with no useful error, and a broken cross-system contract shows up
  nowhere else at all: vite strips the types without reading them.
- `node src/tools/cleanup.mts` reports orphaned vite/chromium; `--kill` acts.
- **`npm run check` runs the whole gate suite** and prints one table. Run it at
  every merge, not just the cheap gates -- `combatloop.mts` slid from 30/30 to
  21/30 and went unnoticed for weeks because the expensive gates were skipped.
  `npm run check:perf` adds `perf.mts` and `gameplay.mts`; only ever pass that on
  a **quiet tree**, since a perf number taken while agents run is meaningless.
