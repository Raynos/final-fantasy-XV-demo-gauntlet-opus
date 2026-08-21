# `tmp/` — repo-local scratchpad

Everything here is **ignored by git except this file**. Nothing in it is authored,
and nothing outside it may depend on it surviving. Safe to delete wholesale.

- **`tmp/shots/`** — capture output from `src/tools/shoot.mjs`, `ui-shoot.mjs`,
  `dresscam.mjs`, `mapshoot.mjs` and friends. This is the default `--out` root, and
  it is the reason this directory exists: review frames are looked at once and are
  worth hundreds of megabytes on disk, never in history. `src/tools/shrink.mjs` re-encodes
  an old round to JPEG rather than deleting it.
- **One-off probes, diffs, notes** — anything you would otherwise be tempted to drop
  at the repo root while chasing a bug.

Durable documentation goes in `docs/`; working state (handoffs, progress, journal)
goes in `project/`.
