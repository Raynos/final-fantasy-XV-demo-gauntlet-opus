# archive/

Documents that have **graduated**: their work is done, superseded, or abandoned,
and nothing live points at them any more. They are kept because the reasoning in
them is sometimes worth recovering, not because they are true.

> **Read nothing here as current.** Every file is a record of its own moment.
> Before acting on anything in this directory, check it against `project/STATUS.md`
> and `project/LANDMINES.md` — several claims in here were disproven by later
> measurement, which is exactly why they were archived.

## What lands here

- A **plan** the moment its `Status:` becomes `DONE` or `SUPERSEDED`, so
  `docs/plans/` lists only live work.
- A **handoff** when its branch merges, after anything still true and non-obvious
  has been lifted into `project/LANDMINES.md`. See `project/handoff/README.md`.
- A **snapshot** that has been replaced rather than edited — rare; normally
  `STATUS.md` is just overwritten and the git log is the record.

Nothing is ever edited here. If a file needs correcting, the correction belongs
in the live document that replaced it.

## What is here now

| file | was | why it graduated |
|---|---|---|
| `PROGRESS-2026-08-17.md` | `project/PROGRESS.md` | Frozen at 98 commits while `main` reached 338, and still read as current. Its three genres went to their real homes: the bug log to `LANDMINES.md`, the scoreboard to `STATUS.md`, the checklist to `docs/SCOPE.md`. |
| `RESCUE-2026-08-21.md` | `project/RESCUE.md` | The ledger for the force-killed session `07642602`. Closed by the 2026-08-22 coordinator. Its §C landmines are in `LANDMINES.md`, corrected — §C names the chevron hatch as heightfield normals and it is GTAO. |
| `handoff/2026-08-21-coordinator.md` | | Superseded by `handoff/2026-08-22-coordinator.md` and the rescue ledger. |
| `handoff/restructure.md` | | Self-declares done and verified; the layout rule it describes now lives in `CLAUDE.md` §Layout. |
| `handoff/weapons.md` | | Its open items (Noctis left-handed, the fist that never closes) are fixed, and its landing instructions name a branch and worktree that no longer exist. |
| `handoff/idles.md` | | Its whole next-steps list was closed and verified by eye. |
| `handoff/cineui.md` | | Wound down early; both findings — the black cutscene sky and the subtitle burn-in — landed. |

The previous snapshot, `SESSION-STATE.md`, was not copied here: it *became*
`STATUS.md` by rename, so its history is continuous. Recover it with
`git show 4d555bc^:project/STATUS.md`.

## One thing to know before running anything you read here

**Tool and module paths in these files are pre-port.** Everything under `src/`
was renamed `.js` → `.ts` and `.mjs` → `.mts` on 2026-08-22. They are left as
written so each document stays an honest record of its moment; the live docs were
swept. Add the `t` and it will resolve — except for the eleven throwaway probes
under `tmp/tr/` and `tmp/veg-a489/`, which are gone with `tmp/` and are not
coming back.
