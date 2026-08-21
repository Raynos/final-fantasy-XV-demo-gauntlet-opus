# `tmp/` — repo-local scratchpad

Everything here is **ignored by git except this file**, and **deleting the whole
directory must cost nothing**: no build step, no deploy and no dev-server run may
read anything in it. If something in here turns out to be expensive to regenerate,
that is the signal it belongs somewhere else.

- **`tmp/shots/`** — capture output from `src/tools/shoot.mjs`, `ui-shoot.mjs`,
  `dresscam.mjs`, `mapshoot.mjs` and friends. The default `--out` root, and the
  reason this directory exists: review frames are looked at once and are worth
  hundreds of megabytes on disk, never in history. `src/tools/shrink.mjs`
  re-encodes an old round to JPEG rather than deleting it.
- **One-off probes, diffs, notes** — anything you would otherwise be tempted to
  drop at the repo root while chasing a bug.

Not here: `dist/` (build output) and `src/public/baked/` (the generated terrain
cache). Both are ignored too, but the dev server reads the cache and losing it
costs a full re-bake.

Durable documentation goes in `docs/`; working state (handoffs, progress, journal)
goes in `project/`.
