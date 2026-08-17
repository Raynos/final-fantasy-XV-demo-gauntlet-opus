# Session state

Live snapshot for resuming after an interruption (usage limit, crash, new session).
Session `51c0b82c-27b7-4759-9812-b001987dde08` · updated 2026-08-17 09:35 · `main` @ 117 commits.

Working tree is **clean** and everything finished is **merged**. If the session
dies right now, nothing is lost except the two agents below.

---

## What I (the coordinator) am doing

Running the loop from `docs/HANDOFF.md` §1: dispatch parallel agents on disjoint
directories → each iterates shoot/look/fix → I merge and verify → harsh critics
→ feed critique into the next round.

**Immediately next, in order:**

1. Merge the two in-flight branches below.
2. Re-run `node tools/integration.mjs` (currently 18 pass / 0 fail) and
   `node tools/gameplay.mjs` (still failing the 60 fps gate on streaming hitches).
3. **Fresh critic pass** — scores are stale. The last one read 4.5/10 overall and
   predates clouds, cartography, collision, menus and the combat loop.
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

Nothing about the state lives in my context — it is all on disk.

```bash
cd ~/projects/game-demos/final-fantasy-XV-demo-gauntlet-opus
git status                 # expect clean
git branch                 # expect main + the live agent branches
git worktree list          # expect the 2 locked worktrees
node tools/cleanup.mjs     # kill orphaned vite/chromium; --kill to act
```

**If the two agents completed before the cutoff**, their work is committed on
their branches even though I never merged it:

```bash
git merge --no-edit agent/bestiary2
git merge --no-edit worktree-agent-a459f12406a48e402
npx vite build                       # pre-commit hook enforces this anyway
PORT=5299 node tools/shoot.mjs --out shots/verify
node tools/sheet.mjs shots/verify --cols 4 --w 3200   # then LOOK at it
node tools/integration.mjs
```

**If they did not complete**, their worktrees hold uncommitted work. Either
`cd` into the worktree and finish it by hand, or discard:

```bash
git worktree remove --force .claude/worktrees/agent-ab4cc2033c17348a9
git branch -D agent/bestiary2
```

Then re-dispatch from `docs/HANDOFF.md` §6-7, which describes both briefs.

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
