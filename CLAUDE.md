# Working in this repo

`BRIEF.md` is the contract — art direction, engine contracts, definition of done.
Read it before writing code. Coordinating rather than implementing? `HANDOFF.md`
first, then `project/STATUS.md` for who owns what.

## Layout

Four buckets, and the root holds nothing but config and the three docs below.

- **`src/`** — everything the build reads. The game, `src/index.html` (vite's
  `root`, so in-page URLs are `/world/...`, **not** `/src/world/...`),
  `src/public/` (generated caches, ignored) and `src/tools/` (the harness —
  **`src/tools/README.md` is its contract**).
- **`docs/`** — durable reference: what the game *is*. `docs/SCOPE.md` (the only
  inventory), `docs/WORLDMAP.md`, and `docs/plans/` for **live proposals only**,
  named `<YYYY-MM-DD>-<model>-<topic>.md`, carrying a `Status:` line, graduating
  to `project/archive/` when `DONE` (see `docs/plans/README.md`).
- **`project/`** — working state: how the work is *going*. `STATUS.md` is a
  snapshot **replaced in place, never appended to**, and `TODO.md` is the
  human's — agents never edit it. **`project/README.md` says which document is
  which genre**; read it first.
- **`tmp/`** — scratchpad. **Deleting it whole must cost nothing**: no build,
  deploy or dev-server run may read it; `tmp/shots/` is the default `--out`. The
  frame cache, job ledger and gate cache live in `~/.cache/ffxv-harness/`, shared
  between agents and equally free to delete.

`dist/` is build output and `src/public/baked/` the bake cache — generated,
ignored, and not in `tmp/`, because losing them costs a re-bake. The cache cannot
live in `dist/` (vite empties it every build); it is copied to `dist/baked/` at
build time and symlinked into every materialised tree.

All of `src/` is TypeScript: `.ts` for the game, `.mts` for the harness (Node
strip-only, hence `erasableSyntaxOnly` in `tsconfig.tools.json`). Probes under
`src/tools/_probe/` and `probes/` are excluded — they are evaluated as a
*function body*, so a top-level `return` is correct.

Root: `README.md`, `CLAUDE.md`, `BRIEF.md`, `HUMAN_REVIEW.md` (what needs the
operator, not a lane), build config. Roster enforced in `.githooks/pre-commit`.

## Committing

**Commit early and often, and keep commits small.** One concern per commit: a
fix, a system, a rename — not an afternoon. Why, specifically:

- The pre-commit hook builds, so every commit is a build check — a syntax error
  surfaces in a second rather than as a 120 s capture timeout you must bisect.
- **Agents share one trunk and one git index.** Commit with an explicit pathspec
  — `git commit -m "…" -- path/a path/b` — and `git add` only NEW files; `git add
  -A`, `git commit -am` and a bare `git commit` snapshot the shared index and
  sweep a co-agent's staged work (a hook blocks all three). Never
  `stash`/`checkout`/`restore` a file you did not author, and never push over
  somebody else's red tree.
- **You commit to see your work.** Captures default to `--build HEAD`, so an
  uncommitted edit is not in the frame (`--dirty` shows the live tree).
- A retired or crashed agent loses only what it had not committed.
- **git's index lock has no queue; `gitlock.mts <git args>` is one** — capped
  backoff, and it names the pid holding it. Never spin on `.git/index.lock`.
- Do not batch unrelated changes or wait until a system is "finished" — commit
  the working step. Messages stay long-form: what changed and *why*.

## Handing off

Keep `project/handoff/<topic>.md` current as you work: what is done and verified, what
is left, the exact next step, files touched, open questions, and the shots that show the
current state. It is what lets a fresh agent pick your work up.

After roughly three hours, finish what you are mid-way through, bring the handoff up to
date and stop rather than opening a new line. **~150 turns is the hard stop**: per-turn
context is flat at ~250 k tokens across three audits, so a lane's cost is linear in
turns and its value is not. Respawn from the handoff.

## Looking at your own work

Non-negotiable, per `BRIEF.md`: capture, then **read the image and actually look
at it**. Structural correctness is not the bar.

- Capture with `--jpeg`. A capture is downscaled to a 1568 px long edge before
  you see it either way, so a 2.5 MB PNG shows nothing a 250 KB JPEG does not —
  it only makes every later turn carry it. Keep PNG for `imgdiff.mts`, whose
  floor is **1.5/255**, measured.
- Contact sheets are paginated: read `_sheet-1.jpg`, `_sheet-2.jpg` … one at a
  time. Never a `_sheet.png` — those reach 45 MB and arrive as a blurred strip.
- Shot names are **positional** on `shoot.mts`, and **one call takes them all**.
  A look-loop belongs in a subagent: images are ~95% of a transcript.
- `perf`, `gameplay`, `integration`, `combatloop`, `roadcheck` print bounded
  reports meant to be read whole; `manifest.json`, full-corpus captures and long
  `git log` ranges are unbounded — do not.

## Running the harness

**`src/tools/README.md` is the contract — read it before writing a tool.** One
daemon per repository serves every agent: nobody starts a server, picks a port or
launches a browser (a hook blocks all three). Every tool takes `--build <ref>`,
default `HEAD`, and `--dirty` for the live tree.

- **There is no `pnpm dev`, and live reload is off.** HMR is a fault injector on
  a shared trunk: the `dirty:` build serves the working tree, so any agent's save
  navigates every open page and kills a long `page.evaluate` with *"Execution
  context was destroyed"* — which reads like a crash and is not one.
  `daemon.mts --health` says what it is doing; `identity.mts` which port.
- **Never poll — wait.** `daemon.mts --wait quiet|exclusive-free|idle --for <s>`
  blocks and says why if it gives up; `run_in_background` re-invokes you when a
  long tool exits. A hook blocks sleep loops. `harnessstats.mts` reads the
  daemon's ledger: what queued, what ran, and whose.
- `git config core.hooksPath .githooks`. **pre-commit** is the fast lane —
  build and both typechecks, concurrently, ~0.7 s, because a gate slow enough to
  skip gets skipped; **post-commit** prewarms the sha you just made; **pre-push**
  runs `check:gate`. `cleanup.mts --kill` clears orphans, sparing the daemon's.
- **`pnpm run build` does not make every cache**: it *deletes* a stale
  painted-face cache without replacing it and cold boot regresses ~2.5 s.
  **`build:full` adds it** — after any merge; `--health` warns when it is
  missing. Tools spawn `node_modules/.bin/vite`, never `npx` (network).
- **`pnpm run check`** runs the suite in two pools and prints one table. A PASS
  is cached against the **tree sha**, so re-running it on an unchanged clean
  tree is under a second (`--no-cache`, `--serial` to override), and the suite
  ratchets its own wall time against `project/check-baseline.json`. `check:perf`
  adds the two perf gates, which take the exclusive lease — it queues behind a
  live probe now rather than closing its page. `pnpm run bench` re-derives the
  harness's own defaults.
