# Working in this repo

`BRIEF.md` is the contract — art direction, engine contracts, definition of done.
Read it before writing code. Coordinating rather than implementing? `docs/HANDOFF.md`
first, then `SESSION-STATE.md` for who currently owns what.

## Ownership

Agents run in git worktrees and own directories. Anything outside your list is
**reported, not edited** — the coordinator applies it. `src/game/Game.js` and
`src/game/Shots.js` are shared and belong to the coordinator (`BRIEF.md` rule 4);
create new files inside your own directory and wire them from your system's `init()`.
Two agents editing `_readInput` independently caused the only merge conflict in 114
commits.

## Handing off

Keep `docs/handoff/<topic>.md` current as you work: what is done and verified, what is
left, the exact next step, files touched, open questions, and the shots that show the
current state. It is what lets a fresh agent pick your work up, and it means retiring
you costs one turn instead of losing an afternoon.

After roughly three hours, finish what you are mid-way through, bring the handoff up to
date and stop at a sensible pause rather than opening a new line of investigation. Past
~400 turns, treat it as a hard stop — no agent here has usefully gone further.

## Looking at your own work

Non-negotiable, per `BRIEF.md`: capture, then **read the image and actually look at it**.
Structural correctness is not the bar.

- Capture review frames with `--jpeg`: `node tools/shoot.mjs hero_full --out shots/x --jpeg`.
  A 1600×900 capture is downscaled to a 1568 px long edge before you see it either way,
  so a 2.5 MB PNG shows you nothing a 250 KB JPEG doesn't — it just makes every later
  turn carry it. Leave PNG as the default when the capture feeds `tools/imgdiff.mjs`,
  which measures pixels and has a 1.5–1.9/255 noise floor.
- Contact sheets come out paginated: read `_sheet-1.jpg`, `_sheet-2.jpg` … one at a time.
  Never read a `_sheet.png` — the old single-image sheets reach 45 MB and 30 000 px tall,
  and arrive as an illegible strip.
- Shot names are **positional** on `tools/shoot.mjs`, not `--shot`.

## Reading tool output

Use judgement. `perf.mjs`, `gameplay.mjs`, `integration.mjs`, `combatloop.mjs`,
`roadcheck.mjs` and friends print bounded reports meant to be read whole — read them.
`manifest.json`, full-corpus captures and `git log` over a long range are unbounded;
slice those to the part you need.

## Running the harness

- One `PORT` per worktree, and the capture daemon takes `PORT+1`. Aiming `framecam.mjs`
  at the daemon port hangs for the full 300 s timeout.
- `git config core.hooksPath .githooks` — the pre-commit hook runs `vite build`. A syntax
  error that the dev server tolerated will otherwise hang the next capture for 120 s with
  no useful error.
- `node tools/cleanup.mjs` reports orphaned vite/chromium; `--kill` acts.
