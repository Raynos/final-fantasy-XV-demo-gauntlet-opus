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

## Agents in flight (4)

| agent id | branch | doing |
|---|---|---|
| `a67478868fd8a3f23` | `agent/bestiary3` | Resumed bestiary/animation. Predecessor's models *were* merged but never once looked at — first job is to verify them. |
| `a2b7f245a410ed051` | `agent/perfgate` | Closing the 60 fps `gameplay.mjs` gate — **and now the terrain/heightAt bug below, which outranks it.** |
| `a909538c4ae855773` | `agent/dressworld` | Dressing the world beyond the 380 m bubble around spawn: camera-relative prop streaming, 19 zone characters, 124 POIs given built form. |
| *(pending)* | — | Fresh critic pass, once the above land. |

## Open bug: the terrain renders above `heightAt`

Found this session and handed to the perfgate agent with a decisive repro.
`hero_closeup` renders a sword on bare dirt and no characters. Hiding **only**
`Terrain.clipmap.group` makes all four appear, standing correctly in grass that
is placed by the same `heightAt`. So the terrain mesh is roughly a metre or two
above the height the rest of the game is told the ground is, and buries
everything at close range. Likely the same thing as the never-explained "a
smooth brown mound eats the bottom third" complaint from critic round 1.

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
