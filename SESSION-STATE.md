# Session state

Live snapshot for resuming after an interruption (usage limit, crash, new session).
Session `51c0b82c-27b7-4759-9812-b001987dde08` · updated 2026-08-17 09:20 · `main` @ 115 commits.

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

## Agents in flight (2)

Both run in git worktrees under `.claude/worktrees/` and are **locked** — do not
remove those worktrees while they are alive.

| agent id | branch / worktree | doing | owns |
|---|---|---|---|
| `ab4cc2033c17348a9` | `agent/bestiary2` · `.claude/worktrees/agent-ab4cc2033c17348a9` | Enemy model quality (21 species) + combat animation: attack telegraphs, hit reactions, death anims, per-body-plan gaits | `src/characters/Enemies.js`, `src/characters/enemies/**`, `src/characters/ai/**`, `src/characters/rig/Anim.js` |
| `a459f12406a48e402` | `worktree-agent-a459f12406a48e402` · `.claude/worktrees/agent-a459f12406a48e402` | Expanding the shot corpus 39 → ~55-60: all 19 zones, every POI type, weathers, dungeons, UI screens, bestiary | `src/game/Shots.js`, `tools/corpus.mjs` |

Both were told to report — not apply — any change outside those paths.

### Outstanding asks I sent them

- **corpus** — add `menu_map_wide` (map screen at `zoomI 0`, fully revealed);
  re-capture every sky-heavy shot, because the ones taken before the cloud fix
  had a black slab across the sky and are unrepresentative.
- **bestiary2** — nothing outstanding. Note the collision agent asked for
  `src/characters/Enemies.js:100` to route ground sampling through
  `game.get('Collision').groundAt(...)` instead of `Terrain.heightAt`; I did not
  apply it because bestiary2 owns that file. **Apply it after merging.**

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
