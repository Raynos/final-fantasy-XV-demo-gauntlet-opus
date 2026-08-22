# project/

**How the work is going.** `docs/` is what the game *is*; this is where it stands
and who is holding what.

Six genres live here, and the whole point of this file is that they have
different lifecycles. Putting them in one flat namespace is what let `PROGRESS.md`
drift five months out of date while still reading as current, and let ten handoff
files outlive the agents that wrote them.

| | genre | lifecycle |
|---|---|---|
| `STATUS.md` | **snapshot** — where the project is right now | **Replaced in place, never appended to.** Capped at 150 lines. |
| `HANDOFF.md` | **durable** — the method, the tooling, the architecture | Edited in place. Carries no numbers. Capped at 250 lines. |
| `LANDMINES.md` | **durable** — what will bite you, proven | Append when something is proven; delete when the cause leaves the code. |
| `handoff/` | **agent-lifetime** — one file per live agent | Graduates to `archive/` when its branch merges. See `handoff/README.md`. |
| `journal/` | **history** — one file per session, dated | Append-only. Never edited, never deleted. |
| `TODO.md` | **the human's queue** | Human-written. **Agents never tick or edit it.** |
| `archive/` | **graduated** — done, superseded, abandoned | Never edited. See `archive/README.md`. |

## The rule that keeps this from rotting

> **A snapshot is replaced, not appended to.** The lossless history is `journal/`
> and the git log, so deleting a line from `STATUS.md` that has stopped being true
> costs nothing. Appending to it instead is how a one-screen snapshot becomes a
> 232-line document that nobody can bring themselves to trim.

`.githooks/pre-commit` enforces the line caps above. It warns at 85% and blocks at
the cap, so adding a line means displacing a weaker one. `SKIP_DOCBUDGET=1`
escapes it when you genuinely need to.

## What does not belong here

- **A proposal.** "Should we, and how?" goes to `docs/plans/`, with a `Status:`
  line. Pre-decision work is not project state.
- **A durable description of the game.** What a system *is* goes to `docs/`.
  What its current state is goes to `STATUS.md`.
- **A second inventory.** `docs/SCOPE.md` is the only checklist. `PROGRESS.md`
  kept a prose copy of it and the two drifted apart; that is why it is archived.
- **Anything a fresh `git clone` can tell you.** Code structure, past fixes and
  the commit history are already recorded. Write down what is *not* derivable.

## If it is not in a queue, it does not exist

Work you ruled on, discovered, or deferred but did not build gets a
`docs/plans/` file or a `TODO.md` line. A handoff note and a journal entry are a
*record*, not a queue — nobody picks work up from them. A shouted **NOT BUILT** in
any document must name where its home is.
