# Working in this repo

`BRIEF.md` is the contract — art direction, engine contracts, definition of done.
Read it before writing code. Coordinating rather than implementing? `project/HANDOFF.md`
first, then `project/STATUS.md` for who owns what.

## Layout

Four buckets, and the root holds nothing but config and the three docs below.

- **`src/`** — everything the build reads. The game, `src/index.html` (vite's
  `root`, so in-page URLs are `/world/...`, **not** `/src/world/...`),
  `src/public/` (generated terrain cache, ignored) and `src/tools/` (the harness —
  **`src/tools/README.md` is its contract**).
- **`docs/`** — durable reference: what the game *is*. `docs/SCOPE.md` (the only
  inventory), `docs/WORLDMAP.md`, and `docs/plans/` for **live proposals only** —
  `<YYYY-MM-DD>-<model>-<topic>.md`, carrying a `Status:` line, graduating to
  `project/archive/` when `DONE`. `docs/plans/README.md` has the vocabulary.
- **`project/`** — working state: how the work is *going*. `STATUS.md` (the
  snapshot — **replaced in place, never appended to**), `HANDOFF.md` (method),
  `LANDMINES.md` (what will bite you), `handoff/<topic>.md` (one per *live*
  agent), `journal/`, `archive/`, `TODO.md` (human-written — agents never edit
  it). **`project/README.md` says which document is which genre**; read it first.
- **`tmp/`** — scratchpad. **Deleting it whole must cost nothing**: no build,
  deploy or dev-server run may read it. `tmp/shots/` is the default `--out`. The
  frame cache lives in `~/.cache/`, not here — it is shared between agents, and
  equally free to delete.

`dist/` is build output and `src/public/baked/` the bake cache — generated,
ignored, and not in `tmp/`: losing them costs a re-bake. The cache cannot live in
`dist/` (vite empties it every build); it is copied to `dist/baked/` at build
time. The daemon symlinks it into every materialised tree, so it is effectively
read-only from anywhere but the live tree.

All of `src/` is TypeScript: `.ts` for the game, `.mts` for the harness (Node
strip-only, hence `erasableSyntaxOnly` in `tsconfig.tools.json`). `pnpm run
typecheck` covers the game, `typecheck:tools` the harness; both run pre-commit.
Probe snippets under `src/tools/_probe/` and `probes/` are excluded — they are
evaluated as a *function body*, so a top-level `return` is correct.

Root: `README.md` (the human's original brief), `CLAUDE.md`, `BRIEF.md`, and build
config. A new file that is none of those belongs in one of the four buckets.

## Committing

**Commit early and often, and keep commits small.** One concern per commit: a
fix, a system, a rename — not an afternoon. The reasons are specific to how work
happens here:

- The pre-commit hook runs `vite build`, so every commit is a build check too —
  a syntax error surfaces in minutes rather than as a 120 s capture timeout you
  then have to bisect.
- **Agents share one trunk and one git index.** Commit with an explicit pathspec
  — `git commit -m "…" -- path/a path/b` — and `git add` only NEW files; `git add
  -A`, `git commit -am` and a bare `git commit` snapshot the shared index and
  sweep a co-agent's staged work (a hook blocks all three). Never
  `stash`/`checkout`/`restore` a file you did not author, and never push over
  somebody else's red tree.
- **You commit to see your work.** Captures default to `--build HEAD`, so an
  uncommitted edit is not in the frame (`--dirty` shows the live tree).
- A retired or crashed agent loses only what it had not committed: the state
  lives on disk, the same principle as `project/STATUS.md`.

Do not batch unrelated changes or wait until a system is "finished" — commit the
working intermediate step. Messages stay long-form: what changed and *why*.

## Handing off

Keep `project/handoff/<topic>.md` current as you work: what is done and verified, what
is left, the exact next step, files touched, open questions, and the shots that show the
current state. It is what lets a fresh agent pick your work up.

After roughly three hours, finish what you are mid-way through, bring the handoff up to
date and stop at a sensible pause rather than opening a new line. Past ~400 turns, treat
it as a hard stop — no agent here has usefully gone further.

## Looking at your own work

Non-negotiable, per `BRIEF.md`: capture, then **read the image and actually look at it**.
Structural correctness is not the bar.

- Capture review frames with `--jpeg`: `node src/tools/shoot.mts hero_full --out tmp/shots/x --jpeg`.
  A 1600×900 capture is downscaled to a 1568 px long edge before you see it either way,
  so a 2.5 MB PNG shows nothing a 250 KB JPEG doesn't — it just makes every later turn
  carry it. Keep PNG when the capture feeds `src/tools/imgdiff.mts`, whose floor is
  **1.5/255**, measured: two fresh boots of one shot differ by that much.
- Contact sheets are paginated: read `_sheet-1.jpg`, `_sheet-2.jpg` … one at a time.
  Never a `_sheet.png` — the old single-image sheets reach 45 MB and 30 000 px tall, and
  arrive as an illegible strip.
- Shot names are **positional** on `shoot.mts`, not `--shot`.

## Reading tool output

Use judgement. `perf.mts`, `gameplay.mts`, `integration.mts`, `combatloop.mts`,
`roadcheck.mts` and friends print bounded reports meant to be read whole.
`manifest.json`, full-corpus captures and long `git log` ranges are unbounded;
slice those.

## Running the harness

**`src/tools/README.md` is the contract — read it before writing a tool.** One
daemon per repository serves every agent: nobody starts a server, picks a port or
launches a browser (a hook blocks all three). Every tool takes `--build <ref>`,
default `HEAD`, and `--dirty` for the live tree.

- `daemon.mts --health` says what it is doing; `identity.mts` which port.
- `git config core.hooksPath .githooks`. **pre-commit** is the fast lane —
  `vite build` and both typechecks — because a gate slow enough to skip gets
  skipped. **pre-push** runs `pnpm run check:gate`, the five gates that catch a
  broken game rather than a broken build.
- `cleanup.mts` reports orphaned vite/chromium and `--kill` acts — it protects
  everything the daemon owns.
- **`pnpm run build` does not make every cache**: it *deletes* a stale painted-face
  cache without replacing it (recording it needs a browser). Nothing breaks, no gate
  notices, cold boot goes 6.9 -> ~9 s. **`build:full` adds it** — run it after any
  merge. Tools spawn `node_modules/.bin/vite`, never `npx`/`pnpm dlx` (network).
- **`pnpm run check`** runs the whole suite and prints one table. `check:perf`
  adds `perf.mts` and `gameplay.mts`, which take the daemon's exclusive lease and
  so no longer need a quiet tree to be honest. `pnpm run bench` re-derives the
  harness's own defaults (`project/journal/2026-08-23-harness-bench.md`).
