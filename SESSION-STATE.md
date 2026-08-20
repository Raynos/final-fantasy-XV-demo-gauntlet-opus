# Session state

Live snapshot for resuming after an interruption (usage limit, crash, new session).
Session `07642602` (resumed from `51c0b82c`) · updated 2026-08-17 · `main` @ 127 commits.
**4 agents running.**

Working tree is **clean**, **no agents are running**, and everything is merged
to `main`. If the session dies right now, nothing is lost.

---

## What I (the coordinator) am doing

Running the loop from `docs/HANDOFF.md` §1: dispatch parallel agents on disjoint
directories → each iterates shoot/look/fix → I merge and verify → harsh critics
→ feed critique into the next round.

**Immediately next, in order:**

1. **Shoot the full 139-shot corpus and look at the contact sheet.** It has never
   been reviewed — it more than tripled in the last hour and most of those
   framings have never been seen.
   ```bash
   PORT=5299 node tools/shoot.mjs --out shots/full
   node tools/sheet.mjs shots/full --cols 5 --w 4000
   ```
   Expect some shots to frame empty ground: the agent that wrote them stalled
   before it could verify every one.
2. **Fresh critic pass** on that sheet. Scores are badly stale — the last read
   4.5/10 and predates clouds, cartography, collision, menus, the combat loop and
   the rebuilt bestiary.
3. Re-run `node tools/gameplay.mjs` — still failing the 60 fps gate on streaming
   and weather-rebuild hitches. That is the last hard gate.
4. Then `docs/HANDOFF.md` §7 for the ordered backlog.

## Agents in flight (2)

| agent id | branch | doing |
|---|---|---|
| `a3aec6b6934d8dd05` | `agent/framing` | Auditing all 139 shots and repairing every broken framing. Several frame empty ground or 75% sky. |
| `a732ad329c287fb2b` | `agent/wildlife` | Rebuilding the ambient garula herds — "the ugliest thing in every Leide frame" per the bestiary agent. |

Merged this session: `agent/perfgate`, `agent/dressworld`, `agent/bestiary3`.

## Corrected: the terrain does NOT render above `heightAt`

I claimed this earlier and was wrong. A perf agent disproved it by measurement —
`tools/heightcheck.mjs` renders the terrain vertex shader's own `tf_height()`
into a float target and reads it back: **0.000 m error vs `Terrain.heightAt()`
across 64 probes from 1 m to 3 km**, and `tf_micro` matches `microDetail`
exactly.

**The real cause of my false diagnosis was the capture daemon serving a stale
page.** It keyed page reuse on query and mode only, so a page booted before an
edit kept serving the old modules; the two captures I compared were different
builds. Fixed — pages are now keyed on a source fingerprint (`sourceStamp()` in
`tools/daemon.mjs`) so any edit forces a reboot.

The genuinely broken thing was shot framing: `ignis_closeup` and
`prompto_closeup` put every character off-screen because they guessed a
companion's position as a fixed offset from the player, and companions steer to
a *wandering* formation slot. Shots can now declare
`follow: 'gladio' | 'ignis' | 'prompto'` and `Game.followAnchor` resolves the
real member each frame.

## Resuming after a usage limit

Nothing about the state lives in my context — it is all on disk, and there is no
in-flight work to recover.

```bash
cd ~/projects/game-demos/final-fantasy-XV-demo-gauntlet-opus
git status                 # expect clean, on main
git worktree list          # expect main only
node tools/cleanup.mjs     # report orphaned vite/chromium; --kill to act
git config core.hooksPath .githooks   # if a fresh clone
npx vite build             # sanity
node tools/integration.mjs # 18 pass / 0 fail
```

Then pick up at "Immediately next" above.

**Read in this order to rebuild context:** `docs/HANDOFF.md` → `SCOPE.md` →
`PROGRESS.md` → `journal/2026-08-17-51c0b82c.md` (the narrative, including what
went wrong and why things are shaped as they are).

## Verification state at snapshot

| check | result |
|---|---|
| `tools/orphans.mjs` | 249/249 modules reachable, no dead code |
| `tools/integration.mjs` | 18 pass · 0 wired · 0 not integrated |
| `tools/perf.mjs` | mean ~87 fps, worst ~47 |
| `tools/gameplay.mjs` | **fails** — streaming/weather hitches remain |
| `tools/roadcheck.mjs` | 39/39 drivable POIs reachable, 0 failures |
| `tools/uxcheck.mjs` | 86/86 |
| `tools/combatloop.mjs` | 30/30 |
| `npx vite build` | passes (enforced by `.githooks/pre-commit`) |

## Housekeeping notes

- `git config core.hooksPath .githooks` must be set for the build hook. If a
  fresh clone skips it, a syntax error will pass commit and hang the harness for
  120 s with no useful error.
- `shots/` and `public/baked/` are gitignored. The bake is a 32 MB cache
  regenerated deterministically from our own generators; delete it freely.
- Worktrees reached 6.1 GB before pruning. `node tools/cleanup.mjs` handles
  orphaned processes; `git worktree remove --force` handles the directories.
- Do not dispatch two agents onto the same directory. It happened once with
  `terrain/**` and I had to warn an agent mid-flight that the ground had been
  rewritten under it.
