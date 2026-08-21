# Coordinator handoff — 2026-08-21, session `07642602`

Written for whoever picks this project up next. Read this first, then
`project/HANDOFF.md` (method and scar tissue), `BRIEF.md` (the contract), `docs/SCOPE.md`,
then the per-agent handoffs listed below.

This session resumed `51c0b82c`, which had run out of weekly usage mid-round.

---

## 1. The one thing that changed how this project is worked on

**There is now an in-game developer / review suite.** Before it, the only way to
look at the game was `src/tools/shoot.mjs` — a ~20 minute batch capture of 139 fixed
cameras, then squinting at a contact sheet. That loop cannot answer "what does
this enemy's walk cycle look like from behind" or "why is the ground ochre
*here*", which is why several defects survived for months while being plainly
visible.

```bash
npm run dev      # then open http://127.0.0.1:5173/?debug=1
npm run preview  # the built bundle, same URL suffix — the inbox still writes
```

| key | does |
|---|---|
| `` ` `` | console — `help` lists every command and cvar, Tab completes |
| `F8` | freecam, simulation keeps running |
| `P` | pause the world and fly (`game.paused` skips `update()`, not `lateUpdate()`) |
| `F4` | asset browser — 23 enemies, 4 heroes, 8 NPCs, 5 weapons on a turntable |
| `F9` | capture the frame and file a review note |
| `F2` | fps / frame-time graph / draw calls |

Console verbs: `warp <poiId|zoneId>`, `goto <x> <z>`, `where`, `shot <name|next|prev>`,
`eject`, `shot.save`, `mark <slot>` / `jump <slot>`, `view wireframe|unlit|normals|overdraw`,
`post nodof,nobloom`, `quality ultra`, `sky.time 18.5`, `sky.weather storm`,
`time.scale 0.25`, `asset enemies irongiant`, `note`, `reset`, `dump`.

In the asset browser: `←→` asset, `↑↓` family, `,` `.` pose, `Space` play,
`O` mark ok, `K` flag, `U` filter to unreviewed, `F4` close.

Notes land in `.review/inbox/` as a JSON + PNG pair carrying seed, camera
transform, shot, zone, weather, perf, build SHA and every cvar changed from
boot. The **`/drain-inbox` skill** (`.claude/skills/drain-inbox/`) reads them,
groups by owning directory and dispatches agents.

Design detail worth keeping: the suite **refuses to load when `?shoot` is
present**, so it can never appear in a capture. Verified, not assumed — two cold
captures diff at 1.555/255, the documented noise floor. **Do not weaken that
guard.**

Full design and rationale: **`docs/plans/2026-08-21-opus-dev-suite.md`**.

Not yet built: trees/props/Regalia in the browser (props need a registry
introduced — the kind tables exist but are module-private), the world/zone
navigator panel, frozen-frustum culling inspection, and `review.restore <id>`.
`lil-gui` was deliberately **not** added — a new npm dep triggers Vite
re-optimisation, which reloads pages mid-capture and corrupts running agents.

---

## 2. State of `main`

Landed and **verified by eye** this session:

- **The party no longer sinks.** `Anim.js` accumulated `bobY` with `-=` on the
  idle layer, unbounded — hips went +0.844 at boot to −9.667 after 139 shots.
  Idle layers must **assign**, never accumulate.
- **The Disc of Cauthess meteor was 4 km from its own zone.** Placed at
  (−2010, 1890) in Cleigne while the `cauthess` zone it belongs to is centred at
  (−1020, −2160) in Duscae. Its 857 m outer shards leaned over the Cape Caem
  headland and rendered as unexplained slabs above the sea. This was diagnosed
  for weeks as a *terrain* bug. It was a prop in the wrong place.
- **Companion closeups focused on Noctis.** `PostFX._headObject()` resolved the
  player unconditionally, so a `follow: 'gladio'` shot racked focus onto Noctis
  behind the subject; the distances differ by less than `headFocusWindow`
  (3.2 m) so the snap always fired. Now resolves the head of whoever
  `rig.followShot.follow` names.
- **Weapons are in hands.** Every weapon authored its crossguard at y=0, so the
  fist closed on the guard and the grip dangled below. The socket wiring was
  never the bug — do not re-investigate it. Companions now carry sheathed in
  the field.
- **A dungeon visit hid the sky for the rest of the session.** `sky.dome` is a
  direct child of `game.scene`, so `_hideExterior()` cleared its visible flag
  *before* `_saveWorldLighting()` snapshotted it; on leave the false snapshot
  was written back over the correct value. Every cutscene then rendered
  correctly-lit golden-hour ground under an absolutely black sky. It only
  reproduces when a `dun_*` shot runs earlier in the same page, which is exactly
  how it survived a whole corpus review and was nearly filed "cannot reproduce".
- **`zone_mencemoor` reframed** — its camera ended up inside the meteor once the
  meteor moved to its own zone centre. A shot that frames a landmark from 710 m
  is inside anything with an 857 m radius.
- **The dev suite**, above.

---

## 3. The agent round — branches and handoffs

Each agent wrote its own handoff into its worktree at `project/handoff/<name>.md`.
Merging the branch brings the handoff with it.

All seven branches are **merged into `main`**. Each agent's own handoff is at
`project/handoff/<name>.md` and carries far more detail than this summary.

| agent | landed and verified | left undone |
|---|---|---|
| `weapons` | Grip-centred origins put every hilt in the hand; companions carry sheathed in the field. The socket wiring was never the bug. | Blade **material**: at `metalness 0.90` blades take their colour entirely from the sky env map — flat navy planes, no edge highlight. |
| `enemies` | Grounding drift **52/207 poses → 0**, worst −321 m → 0, plus the 46 static failures → 0, with corrections *measured* rather than hand-tuned. Systemic texel-density fix across all 23 species. Deep rebuilds of goblin, iron giant, dualhorn/bloodhorn, sabertusk. Ships `src/tools/creaturecheck.mjs` as a permanent gate. | Remaining 18 species are surfaced but not rebuilt. |
| `splat` | Regional palette works — `zone_lestallum` went from red-ochre desert to green Cleigne upland, Leide unchanged in character. 27 m mega-plates gone. LUT packing proved numerically over all 19 zone centres (worst error 0.007). `heightcheck`/`driftcheck` both 0.000 m, confirming colour-only. | `perf.mjs` never run — `tf_stoch` adds ~4 fetches/pixel and is the one unmeasured risk. Five zones unviewed. |
| `heroart` | The eye region on all four heroes, verified at 0.4 m. Six compounding defects, each measured: lower lid never closed at either canthus (the blank-white far eye), iris a third too small, lid riding inside the corneal dome, lid band hanging off the cheek, lid UV pinned to (0.5, 0.5), sclera blowing to paper white at grazing angles. | Profile head collapse, hair, hands, outfits, skin. `Cast.js` untouched. |
| `grass` | LOD albedo bug fixed and verified — card rings rendered **3× darker** than the blade ring. Blade heights re-unified from a 1 : 2 : 3.5 drift to 1 : 1.20 : 1.80; Leide is an ankle tuft again. Tint chain rewritten: r/g 1.76 → 1.30, b/g 0.21 → 0.57. | Trees and bushes untouched — the leaf cards may carry the same unpinned-albedo bug. |
| `cineui` | **Found the black-sky root cause** (see §2) and re-staged `cine_hammerhead` and `cine_longwythe` at real world anchors. | `cine_astral`, all `src/ui/**`, BLINDSIDE doubling. **No `map_wide` screen was registered — do not add `menu: 'map_wide'` to `Shots.js`, it would point at nothing.** |
| `idles` | Weighted asymmetric idles, a real fighting stance, two inverted signs fixed, `footYaw` finally read. `Animator.rest()`. | **Not verified by eye at all** — the agent stalled before any capture round. `Party.snap()` never written. See open item 1. |

**Ownership is disjoint by construction and must stay that way.** Two agents in
one directory corrupt each other's work; it happened once with `terrain/**` and
an agent had to be warned mid-flight that the ground had been rewritten under
it. `Cast.js` was split mid-round: `agent/heroart` owns appearance (hair, scar,
vest, coat), `agent/idles` moved posture out into a new `rig/Posture.js`.

Shared files — `src/game/Game.js`, `src/game/Shots.js` — are the coordinator's
per BRIEF rule 4. Agents report changes to them rather than editing.

### Three agents stalled and were salvaged

`agent/splat`, `agent/weapons` and `agent/idles` all stalled with the watchdog
message "no progress for 600s". In every case the work was **uncommitted** and
would have been lost: ~280 lines plus a new `Biome.js`, ~860 lines, and
`Animator.rest()` respectively. All three were recovered by committing the
worktree directly.

**Lesson for the next round: tell agents to commit early and often, even
unverified `WIP:` commits.** An ugly commit is enormously cheaper than a lost
afternoon. The cause is machine saturation, not agent error — see §6.

---

## 4. Open items, ranked

1. **The party formation never settles, and follow shots are order-dependent.**
   This is the most serious open defect because it undermines determinism for
   all 47 `follow` shots. `prompto_closeup` reads as out of focus; it is not a
   DOF bug. Re-shot **alone** with `--settle 300` it is sharp. Companions are
   still steering to their wandering formation slots, and a camera anchored to a
   moving subject smears the *whole* frame through TAA and motion blur. Prompto
   is worst — smallest `lag` (0.10), highest `speedMul` (1.05).
   The same shot in a batch on the same warm page put the camera *inside another
   party member*: same shot, same settle, different result purely from what ran
   before it. **Some framings previously judged "broken" may simply never have
   settled.**
   `Animator.rest()` exists on `agent/idles`; `Party.snap()` does not. Build it,
   then call it from `Game.applyShot`.
   **Two harness fixes were tried and both reverted — do not repeat them:** a
   re-anchor convergence loop (formation drifts between iterations, camera lands
   inside whoever is in the way) and a long settle for follow shots (240 extra
   frames × 47 shots, did not fix ordering). The fix belongs in `Party`.
2. **Blade material.** Geometry is fixed but at `metalness 0.90` blades take
   their colour entirely from the sky env map — every blade is a flat navy plane
   with no edge highlight. See `project/handoff/weapons.md`.
3. **Perf gate.** `src/tools/gameplay.mjs` still fails 60 fps on `walk` (~57.5 fps
   best measured; shadow cascades ~22 ms dominate). **Never trust a perf number
   taken while agents are running.**
4. **A fresh harsh-critic pass.** Scores are badly stale — the last read 4.5/10
   and predates clouds, cartography, collision, menus, combat, the rebuilt
   bestiary, biomes, dressing and everything in this session.
5. `caem_shore` fishing POI at (−2564, 1966) in `WorldMap.js` is reportedly
   mis-authored. Never verified by measurement.
6. `_outcrops` consumes its RNG stream conditionally on local slope, so any
   height change anywhere reshuffles every later boulder. Worth decoupling.
7. ~~`src/world/map/MapRaster.js` is orphaned.~~ **Done** — it was a re-export
   facade left by the `5fd2876` cartography split, with a `@deprecated`
   `drawWorldRaster` alias kept for callers that never existed. Deleted;
   `orphans.mjs` is now clean at 272/272.
8. **TypeScript port** — `docs/plans/2026-08-17-opus-typescript-port.md`, gated on a quiet tree.

---

## 5. Verification state

Measured on a **quiet tree** after every branch was merged and all worktrees
pruned.

| check | result |
|---|---|
| `npx vite build` | passes (enforced by `.githooks/pre-commit`) |
| `src/tools/integration.mjs` | 18 pass · 0 fail |
| `src/tools/uxcheck.mjs` | 86/86 |
| `src/tools/creaturecheck.mjs` | **207 poses across 23 species · 0 failures** (new gate) |
| `src/tools/heightcheck.mjs` / `driftcheck.mjs` | 0.000 m — confirms the splat change was colour-only |
| `src/tools/roadcheck.mjs` | 0 failures |
| `src/tools/orphans.mjs` | **clean, 272/272** — the `MapRaster.js` orphan is deleted |
| dev-suite determinism | 1.555/255 — at the documented noise floor |
| `src/tools/combatloop.mjs` | **21/30 — a pre-existing regression, not from this round** |
| `src/tools/gameplay.mjs` | **fails** — see open item 3 |
| `src/tools/perf.mjs` | not re-measured on a quiet tree — do this first next session |

**The `combatloop` regression is worth its own note.** `agent/enemies`
reproduced the identical nine failures with `src/characters` reverted to
`0be851f`, so it predates this round. Its lead: a stuck `menu=controls` eating
input, in `src/ui/**`. `project/SESSION-STATE.md` recorded 30/30 at some earlier point,
so it broke between then and now and nobody noticed — which is an argument for
running the full gate suite at every merge, not just the cheap ones.

## 6. Landmines — all measured, all previously cost real time

- **The machine saturates.** Six or more concurrent headless Chromiums make
  every measurement worthless *and* stall agents outright. This session lost
  three agents to it. Cap concurrency at ~4, give each worktree a unique `PORT`
  (the capture daemon uses `PORT+1`), and prefer the warm daemon over `--cold`.
- **Toggling a light's `visible` recompiled 43 programs — a measured 9.5 s
  freeze.** `engine/LightBudget.js` pins the counts. The dev suite's isolation
  stage deliberately adds **no** lights for this reason.
- **A stale capture-daemon page once produced a completely false diagnosis** that
  cost three separate investigations. `sourceStamp()` in `src/tools/daemon.mjs` now
  reboots the page on any `src/` edit, and the daemon refuses to serve a
  different checkout. This is also why the dev suite writes tuning to
  `.review/`, never to `src/`.
- `constructor.name` is mangled in production builds — register systems with
  explicit string keys, always.
- Do **not** add `--disable-frame-rate-limit` to `src/tools/chromium.mjs`; measured
  3× idle CPU for zero benefit.
- **Shot names are positional** on `src/tools/shoot.mjs`, not `--shot`.
- `src/tools/framecam.mjs` needs `PORT` = the **vite** port; the daemon uses
  `PORT+1` and aiming framecam at it hangs for the full 300 s timeout.
- **No CSS transitions in `src/ui`** — every animation is written per frame from
  `game.time` or deterministic captures break. `src/dev/**` is exempt because it
  cannot appear in a capture.
- `bestiary_coeurl` does not exist. Do not chase it.
- **Never `-=` on an idle layer.** See §2.

---

## 7. Resuming

```bash
cd ~/projects/game-demos/final-fantasy-XV-demo-gauntlet-opus
git status                          # expect clean, on main
git config core.hooksPath .githooks # if a fresh clone
git branch --list 'agent/*'         # unmerged round-5 work
git worktree list                   # ~19 worktrees, 6.9 GB — prune after merging
node src/tools/cleanup.mjs              # report orphaned vite/chromium; --kill to act
npx vite build
node src/tools/integration.mjs
```

To merge the round: for each `agent/*` branch, read its
`project/handoff/<name>.md` **first**, check `git log main..<branch>` for `WIP:`
prefixes (those are explicitly unverified), merge, then **shoot the affected
shots and look at them yourself**. Do not trust a merge you have not seen.

Then prune: `git worktree remove --force <path>` for each, and
`git branch -d agent/<name>`. `tmp/shots/` is 1.7 GB of gitignored captures from
many sessions and can be emptied freely.

**The standing loop** (`project/HANDOFF.md` §1): dispatch parallel agents on
disjoint directories → each iterates shoot/look/fix → coordinator merges and
verifies → harsh critics → feed critique into the next round. The user's
standing instruction: *"Always focus on broad perfection across all details of
the game, never pigeonhole, always see the forest through the trees, always work
on the biggest highest-impact levers, never spend 5 rounds tweaking some tiny
detail on one screenshot in one direction."*

And the rule that matters most, from `project/HANDOFF.md` §1: **agents must look at
their own output.** Every brief says read the PNGs and actually look at them.
The dev suite exists to make that cheap.
