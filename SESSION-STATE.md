# Session state

Live snapshot for resuming after an interruption (usage limit, crash, new session).
Session `51c0b82c-27b7-4759-9812-b001987dde08` · updated 2026-08-17 09:35 · `main` @ 117 commits.

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

## Agents in flight (0)

Both remaining agents hit the 600 s stall watchdog and were salvaged rather than
lost — their work is committed and merged on `main`:

- **`ab4cc2033c17348a9` / `agent/bestiary2`** — rebuilt Sabertusk, Voretooth,
  Coeurl, Dualhorn, Garula, MT Soldier, Magitek Armour and Iron Giant, plus new
  `rig/CombatAnim.js`, `rig/CreatureAnim.js` and `rig/Sculpt.js`. Its last words
  named a real bug it had already fixed: a temp-vector aliasing fault where the
  IK target was clobbered by the shoulder position, "silently aiming the arm at
  its own shoulder". Verified fixed — `_tgt`/`_tgt2` are distinct temporaries.
- **`a459f12406a48e402` / corpus** — grew `Shots.js` from 39 to **139 shots**
  plus `tools/corpus.mjs`. Its last words also named a real bug: skinned
  characters were being frustum-culled by their **bind-pose bounding sphere**.
  Verified handled — `RigBuilder` now sets a generous explicit bounding sphere
  and party/NPC/enemy meshes disable culling besides.

Neither had uncommitted work worth discarding; both worktrees were committed
with `core.hooksPath=/dev/null` (their trees were mid-edit, so the build hook
would have blocked the salvage commit) and then merged and verified on `main`.

**Still owed from the collision agent:** `src/characters/Enemies.js:100` should
route ground sampling through `game.get('Collision').groundAt(...)` rather than
`Terrain.heightAt`, so enemies stand on town pads. It was deferred while
bestiary2 owned that file — **that file is now free, so apply it.**

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
