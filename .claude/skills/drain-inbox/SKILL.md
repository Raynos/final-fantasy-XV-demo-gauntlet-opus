---
name: drain-inbox
description: Read the in-game review notes in .review/inbox/, group them by owning directory, and dispatch parallel agents to fix them. Use when the user says "drain the inbox", "process my review notes", "act on my feedback", or after a review session with the ?debug dev suite.
---

# Drain the review inbox

The in-game dev suite (`src/dev/**`, loaded with `?debug=1`) writes a JSON + PNG
pair into `.review/inbox/` every time the reviewer presses **F9** and types a
note. This skill turns that pile into finished work.

The notes are the reviewer's own words with full repro state attached. Treat
them as authoritative about *what looks wrong* and as a starting hypothesis —
not a conclusion — about *why*.

## 1. Read the notes

```bash
ls .review/inbox/*.json | wc -l
```

Read every `.json`, and **look at its `.png` with the Read tool.** A note that
says "this looks wrong" is only actionable next to its image. Never dispatch an
agent on prose alone when a picture is sitting right there.

Each note carries: `note` (the prose), `severity`, `area`, `shot`, `zone`,
`region`, `poi`, `camera` (pos/quat/fov), `player`, `time`, `weather`, `seed`,
`perf`, `ui`, `build` (git SHA + dirty flag), `cvars` (anything changed from
boot) and `commands` (the last 16 console lines — the repro script).

**Check `build.sha` first.** A note filed against an older commit may already be
fixed. Compare against `git log --oneline` and verify before spending an agent
on it.

**Check `cvars`.** A non-empty `cvars` block means the reviewer had debug
toggles active — the defect may be an artefact of a toggle, not a real bug.
Reproduce with those cvars restored before believing the note.

## 2. Reproduce before dispatching

For each note worth acting on, confirm it is real and current:

```bash
node src/tools/shoot.mjs <shot> --out tmp/shots/drain --cold      # if it names a shot
```

If it has no shot, the camera transform is the repro — use `src/tools/framecam.mjs`
with a candidate built from `note.camera`, or boot `?debug=1` yourself and run
`goto <x> <z>` / `warp <poiId>` from the console.

Dismiss notes you cannot reproduce, and say so explicitly in your summary rather
than silently dropping them.

## 3. Group by owning directory

Notes cluster by `area`, but dispatch must be keyed on **who owns the files**,
because two agents in one directory corrupt each other's work. Map roughly:

| area | owner directory |
|---|---|
| `terrain` | `src/world/terrain/**` |
| `vegetation` | `src/world/veg/**`, `src/world/Vegetation.js` |
| `world` | `src/world/props/**`, `src/world/map/**` |
| `characters` | `src/characters/rig/**`, `src/characters/Cast.js` |
| `enemies` | `src/characters/enemies/**` |
| `combat` | `src/combat/**` |
| `ui` | `src/ui/**` |
| `camera` | `src/game/CameraRig.js`, `src/game/Shots.js` |
| `perf` | wherever the profile points — attribute first with `src/tools/attrib.mjs` |

**Read `project/SESSION-STATE.md` before dispatching.** It carries the live ownership
table. If an agent already owns a directory, do not dispatch a second one into
it — route the note to the existing agent with `SendMessage` instead.

Shared files (`src/game/Game.js`, `src/game/Shots.js`) are the coordinator's per
BRIEF rule 4. Fix those yourself rather than handing them out.

## 4. Dispatch

One agent per owning directory, all in a single message so they run in parallel.
Each brief must contain:

- The verbatim note text and its PNG path, so the agent sees what the human saw.
- The repro: shot name, or camera coordinates plus `warp`/`goto` command.
- Its exact ownership list, and an instruction to *report* rather than edit
  anything outside it.
- The standing gates: `npx vite build`, `node src/tools/integration.mjs`,
  `node src/tools/orphans.mjs`, plus any area-specific check (`roadcheck`,
  `heightcheck`, `driftcheck`, `combatloop`, `uxcheck`, `creaturecheck`).
- **"Look at your own output with the Read tool."** Non-negotiable.

Remind agents that shot names are **positional** on `src/tools/shoot.mjs`, not
`--shot`, and that each worktree needs a unique `PORT` (the capture daemon uses
`PORT+1`).

## 5. Close the loop

After merging, move each handled note out of the inbox so it is not processed
twice:

```bash
mkdir -p .review/done && git mv 2>/dev/null; mv .review/inbox/<id>.* .review/done/
```

`.review/` is gitignored, so this is a local bookkeeping move, not a commit.

Then report to the user, per note: **fixed**, **not reproducible**, **already
fixed in a later commit**, or **deferred** with a reason. Never report a note as
handled without having seen the after-image.
