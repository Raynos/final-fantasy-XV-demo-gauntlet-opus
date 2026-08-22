# handoff/

One file per **live** agent, named for what it owns — `terrain.md`, `ui.md`,
`no-any.md`. A coordinator session gets a dated one, `<YYYY-MM-DD>-coordinator.md`.

**The length of this directory is a live agent headcount.** That is the property
that makes it useful, and it only holds if handoffs graduate. Ten of them once
outlived the agents that wrote them, and the result was a reader who could not
tell a live workstream from one that merged weeks ago without opening every file.

## What a handoff is for

An agent that can be replaced by its handoff is one you can retire the moment it
stops being worth its cost. One that cannot has taken its afternoon hostage.
Keep it current *as you work*, not at the end — a crashed agent loses only what
it did not write down.

It should carry: what is done **and verified by eye**, what is left, the exact
next step, the files it owns and touched, open questions, cross-boundary items it
is reporting rather than fixing, and the shots that show the current state.

Flag every claim as *verified* or *not*. The most expensive failures in this
project were plausible write-ups of things nobody had actually looked at — see
the last section of `../LANDMINES.md`.

## When the branch merges

1. **Lift anything still true and non-obvious into `../LANDMINES.md`** — the
   gotcha, the reserved word, the two-hour dead end. This is the step that gives
   the handoff a life after its agent.
2. `git mv` the file to `../archive/handoff/`.

Do not leave it here marked "merged". The whole value of the directory is that
everything in it is live.

## Two things that go stale the moment the agent stops

- **`tmp/shots/` paths.** Every "where the images are" table points at a
  gitignored directory in a worktree that gets pruned. All sixteen referenced by
  the 2026-08 handoffs were gone within days. Describe what the shot *showed*;
  the path is a convenience, not evidence.
- **Branch and worktree names.** `agent/weapons` and its worktree were referenced
  in landing instructions long after both had been deleted. Name the commit sha.
