# Session state

Live snapshot for resuming after an interruption (usage limit, crash, new session).
Session `07642602` (resumed from `51c0b82c`) · updated 2026-08-21 · `main` @ 131 commits.
**7 agents running.**

---

## What I (the coordinator) am doing

Running the loop from `docs/HANDOFF.md` §1: dispatch parallel agents on disjoint
directories → each iterates shoot/look/fix → I merge and verify → harsh critics
→ feed critique into the next round.

Round 4 is captured and reviewed. `shots/r4/` holds all 139 shots plus
`_sheet.png`. **The party-sinking bug is fixed and confirmed by eye** — every
character now stands on the ground in every frame.

## What the r4 corpus review found

Ranked by how many of the 139 shots each defect touches:

1. **Weapons float detached from the hands** (~40 shots). Gladiolus's greatsword
   hangs in mid-air beside him; every character's blade touches nothing. The
   socket system is real and wired (`Character.attach.handR` → `PartyAI._equip`),
   so this is an origin/grip bug, not a missing feature.
2. **Every character stands in an identical rigid A-pose** (nearly all shots).
   Arms straight down, feet parallel, spine vertical, staring past camera. Four
   men in a lineup. No contrapposto, no per-character personality, and the party
   holds the same relaxed idle in the middle of a fight.
3. **Grass is knee-high acid-yellow straw** (most field shots). Blades read as
   ~1 m long and the colour is uniform highlighter yellow world-wide.
4. **The terrain splat reads Leide-ochre across the whole 8192 m world**, so the
   ground between Duscae's trees is desert-coloured. The ground texture also
   tiles at an enormous scale — cracks ~2 m wide, macro pattern visibly
   repeating across a whole plain.
5. **Character art below AAA at closeup**: eyes are painted-on ovals with no
   lid/lash/specular, hands read as mittens, outfits are flat black shapes with
   no layering or hardware, hair colours are wrong (Prompto grey not blond,
   Ignis green-grey not ash-blond).
6. **Enemies are unreadable blobs** — the sabertusk is a legless tan mass
   floating above the ground.

## The in-game dev/review suite

Plan: **`docs/dev-suite-plan.md`**. Phase 0 + the freecam and review inbox have
landed (`src/dev/**`, `tools/vite-plugin-review.mjs`).

```bash
npm run dev      # then open http://127.0.0.1:5173/?debug=1
```

`` ` `` console · **F8** fly · **P** pause+fly · **F9** file a review note ·
**F2** stats. `help` in the console lists everything. Notes land in
`.review/inbox/` as JSON + PNG; the `/drain-inbox` skill turns them into
dispatched agent work.

The suite refuses to load when `?shoot` is present, so it can never appear in a
capture. Verified: two cold captures diff at 1.555/255, the documented noise
floor. Do not weaken that guard.

**F4** opens the asset browser: 23 enemies, 4 heroes, 8 NPCs and 5 weapons on a
sun-keyed turntable, with pose scrubbing (`,` `.` `Space`) and a persisted
`ok`/`flag` review status (`O` / `K`, `U` filters to unreviewed). `view
wireframe|unlit|normals|overdraw` overrides the scene material.

Still to build: trees, props and the Regalia in the browser (props need a
registry introduced — the kind tables exist but are module-private), the
world/zone navigator panel, frozen-frustum culling inspection, and
`review.restore <id>`. `lil-gui` was deliberately **not** added — a new npm dep
triggers Vite re-optimisation, which reloads pages mid-capture and would
corrupt running agents. Add it on a quiet tree if hand-rolled panels chafe.

Defects the browser surfaced on its first pass, none of which were visible at
corpus framing: the coeurl's whiskers are segmented glowing polylines, the
sabertusk has no eye read and a featureless coat, and both blades are flat
slabs (which independently confirms the weapons agent's diagnosis).

## Agents in flight (7)

| branch | owns | doing |
|---|---|---|
| `agent/weapons` | `combat/Weapons.js`, `GeoKit.js`, `rig/Character.js`, `ai/PartyAI.js` | Floating-weapon bug + rebuild weapon geometry |
| `agent/idles` | `rig/Anim.js`, `CombatAnim.js`, `rig/Posture.js` (new), `Party.js`, `Player.js` | Kill the A-pose lineup; weighted per-character idles + combat stance |
| `agent/heroart` | `rig/{Face,Hair,Outfit,Materials,Sculpt,Body,Geo,Anatomy,Skeleton}.js`, `npc/**`, `Cast.js` *appearance only* | Faces, hands, hair, outfit detail |
| `agent/grass` | `world/veg/**`, `Vegetation.js` | Grass scale/colour/translucency, biome palettes |
| `agent/splat` | `world/terrain/**`, `Terrain.js` | Regional ground colour + kill the macro tiling |
| `agent/enemies` | `characters/enemies/**`, `rig/CreatureAnim.js`, `Enemies.js` | Root-offset bug (Iron Giant −8.41 m) + model quality |
| `agent/cineui` | `game/cinematics/**`, `game/story/**`, `ui/**` | **Black cutscene sky (re-prioritised to first)**, `menu_map_wide` duplicate, doubled HUD text |

**Ownership is disjoint by construction. Do not dispatch a second agent onto any
directory in that table** — it happened once with `terrain/**` and an agent had
to be warned mid-flight that the ground had been rewritten under it.

Coordinator keeps `src/game/Shots.js`, `src/world/props/**`, `src/world/map/**`.

## Fixed by the coordinator this round

- **The meteor was 4 km from its own zone.** `Megastructures._meteor` placed the
  Disc of Cauthess at (−2010, 1890) — in Cleigne, ~450 m from Cape Caem — while
  the `cauthess` zone it belongs to is centred at (−1020, −2160) in Duscae. Its
  857 m outer shards leaned over the Cape Caem headland and read as unexplained
  slabs floating above the sea. That is the "Cape Caem slabs" defect the terrain
  agent handed back. Moved to the zone centre, which is also where the
  `discCrater` landform puts the impact bowl.

## Still open, unassigned

- `caem_shore` fishing POI at (−2564, 1966) in `WorldMap.js` is reportedly
  mis-authored. Not yet verified by measurement.
- `_outcrops` consumes its RNG stream conditionally on local slope, so any
  height change anywhere reshuffles every later boulder. Worth decoupling.
- Perf gate: `tools/gameplay.mjs` still fails 60 fps on `walk` (~57.5 fps best
  measured; shadow cascades ~22 ms dominate). **Do not trust perf numbers taken
  while agents are running** — machine load makes them meaningless. Re-measure
  on a quiet tree.
- Fresh harsh-critic pass on the corpus. Scores are badly stale (last read
  4.5/10 and predates clouds, cartography, collision, menus, combat, bestiary,
  biomes and dressing).
- TypeScript port per `docs/typescript-port-plan.md`, gated on a quiet tree.

## Resuming after a usage limit

Nothing about the state lives in my context — it is all on disk.

```bash
cd ~/projects/game-demos/final-fantasy-XV-demo-gauntlet-opus
git status                 # expect clean, on main
git branch --list 'agent/*'   # unmerged agent work from the round above
git worktree list          # agents run in worktrees; prune dead ones
node tools/cleanup.mjs     # report orphaned vite/chromium; --kill to act
git config core.hooksPath .githooks   # if a fresh clone
npx vite build             # sanity
node tools/integration.mjs # 18 pass / 0 fail
```

To recover an interrupted round: for each `agent/*` branch, check whether it has
commits worth keeping (`git log main..agent/x`), merge what is good, and
re-dispatch the rest with the same ownership table.

**Read in this order to rebuild context:** `docs/HANDOFF.md` → `SCOPE.md` →
`PROGRESS.md` → `journal/2026-08-17-51c0b82c.md`.

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
| `tools/heightcheck.mjs` | 0.000 m GPU-vs-`heightAt` error over 64 probes |
| `npx vite build` | passes (enforced by `.githooks/pre-commit`) |

## Housekeeping notes

- `git config core.hooksPath .githooks` must be set for the build hook. If a
  fresh clone skips it, a syntax error will pass commit and hang the harness for
  120 s with no useful error.
- `shots/` and `public/baked/` are gitignored. The bake is a 32 MB cache
  regenerated deterministically from our own generators; delete it freely.
- Worktrees reached 6.1 GB before pruning. `node tools/cleanup.mjs` handles
  orphaned processes; `git worktree remove --force` handles the directories.
- The capture daemon keys page reuse on a source fingerprint (`sourceStamp()` in
  `tools/daemon.mjs`) so any edit forces a reboot, and refuses to serve a
  different checkout. Both guards exist because a stale daemon page once caused
  a completely false diagnosis that cost three investigations.
- `tools/sheet.mjs` writes `_sheet.html` beside the shots and references PNGs
  relatively. Do not go back to inlining base64 — at 139 shots it kills the page.
