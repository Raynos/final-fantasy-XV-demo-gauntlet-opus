# Session state

Live snapshot for resuming after an interruption. Updated 2026-08-21.

> **The previous coordinator session `07642602` and its 7 subagents were
> force-killed** — that session had grown to ~3 GB RSS and an ~80 MB transcript
> and had to be stopped along with every agent under it. No committed work was
> lost: all seven branches had been merged and every worktree pruned. What was
> lost was whatever was still in a head.
>
> **`project/RESCUE.md` is the ledger of what that session left unfinished**,
> reconciled against what is actually on `main` rather than what the handoffs
> claim. Read it before picking anything up.

---

## Tree state

`main`, clean. No `agent/*` branches, no worktrees from the killed round, no
orphaned vite/chromium.

The repo was restructured on 2026-08-21: **`src/` is now vite's root**, so the
tools live at `src/tools/`, the entry is `src/index.html`, and assets are
`src/public/`. In-page dev-server imports are `/world/...`, **not**
`/src/world/...`. The root holds only config and the four buckets
(`src/`, `docs/`, `project/`, `tmp/`).

Plans in `docs/plans/` are now date- and model-prefixed
(`2026-08-17-opus-typescript-port.md`, and so on).

## Rescue progress this session

Landed, each verified by eye or by measurement:

| item | result |
|---|---|
| **`Party.snap()`** (`RESCUE.md` B1) | Written and called from `Game.applyShot`. Rewinds the RNG, re-draws every stochastic field through the same helper `init()` uses, places each member on its slot, zeroes the controller's integrators, rests the animator. `Animator.rest()` existed with zero callers; it now has one. |
| **`Director.setScenario` early-out removed** | It returned early when asked for the scenario it already had, so consecutive `field` shots skipped the reset entirely and inherited the previous shot's drift. Also restores the boot heading — the formation is defined in the player's frame, so an inherited facing rotated all of it. |
| **Per-shot `resetClock()`** | It ran once per *page*, so `time.now` accumulated across a batch and wind, grass sway, water, wildlife, film grain and the TAA history all sat at a different phase. |
| **Noctis is right-handed** (B3) | The anchor at `x = +0.30` put the blade in his left hand, because the rig's right side is −X and `weaponIK` picks the arm by sign. Mirrored, with the rotations mirrored to match. |
| **Noctis' fist closes** (B3) | `weaponIK` now returns the driving side and `CombatAnim` calls `setGrip` on it. |
| **Blades read as steel** (B4) | Was a flat navy plane: at `metalness 0.90` the diffuse term is ~0 so the blade took its colour entirely from the blue sky PMREM. Now 0.76 / 0.42 / 0.82 with a neutral-warm `STEEL` palette. |
| **`agent/idles` verified by eye** (B2) | Merged unverified by the killed session. The A-pose lineup **is** gone — four distinct stances, weight shifted, feet no longer parallel. Confirmed in `hero_face`. |

### The determinism result, measured

Same `follow` shot alone versus sixth in a batch, mean delta per 255:

| state | delta |
|---|---|
| before | **39.200** (camera behind his head, party scattered, weapons drawn) |
| after `Party.snap()` | 4.672 |
| after per-shot `resetClock()` | **2.068** |
| control: two identical alone-runs | **0.305** |

**The control matters.** This shot's true noise floor is 0.305, not the
1.5–1.9 quoted for the corpus generally, so 2.068 is still real
order-dependence — roughly 5% of pixels over 8/255, most likely vegetation tile
streaming. It is a 19× improvement and the framing is now stable, but it is
**not** yet at the floor. Do not record this as closed.

## Agents in flight (4, in worktrees)

| agent | owns | doing |
|---|---|---|
| `enemies-art` | `characters/enemies/**`, `rig/CreatureAnim.js`, `Enemies.js`, `tools/creaturecheck.mjs` | The 17 species that got only the systemic pass (B12) |
| `ui` | `src/ui/**` | `combatloop` 21/30, BLINDSIDE doubling, `map_wide`, type pass (B5, B10) |
| `veg` | `world/veg/**`, `world/Vegetation.js` | Trees/bushes leaf-albedo bug, grass re-judged against the new terrain (B13, B7) |
| `heroart` | `rig/{Face,Hair,Outfit,Materials,Sculpt,Body,Geo,Anatomy,Skeleton}.js`, `npc/**`, `Cast.js` | Profile head collapse, hair, skin, hands (B11) |

Coordinator (this session) holds `Party.js`, `Player.js`, `rig/Anim.js`,
`rig/CombatAnim.js`, `rig/Posture.js`, `src/combat/**`, `src/game/**`,
`src/world/props/**`, `src/world/map/**`.

**Cap concurrency at ~4.** Six or more headless Chromiums saturate the machine,
make every measurement worthless and stall agents outright — that is what killed
three agents in the previous round.

## Verification state

| check | result |
|---|---|
| `npx vite build` | passes (enforced by `.githooks/pre-commit`) |
| `src/tools/integration.mjs` | **18 pass · 0 fail** |
| `src/tools/uxcheck.mjs` | **86/86** |
| `src/tools/orphans.mjs` | **272/272** — clean for the first time, `MapRaster.js` deleted |
| `src/tools/combatloop.mjs` | **21/30** — pre-existing, lead is a stuck `menu=controls`; owned by the `ui` agent |
| `src/tools/roadcheck.mjs` | 0 failures, 30.26 km |
| `src/tools/heightcheck.mjs` | 0.000 m GPU vs CPU |
| `src/tools/perf.mjs` / `gameplay.mjs` | **not re-measured.** Four agents are live — any number taken now is meaningless. B6. |

## Next, in order

1. Finish the `RESCUE.md` B-track — the four agents above, plus the serial items
   still open: the residual 2.068 determinism gap, the six unviewed zones (B7),
   `cine_opening`'s invisible car (B8), `cine_astral` (B9), and the hygiene list
   in B14.
2. Re-measure `perf.mjs` and `gameplay.mjs` **on a quiet tree**, once the agents
   are done.
3. A fresh harsh-critic pass. The last score was 4.5/10 and predates clouds,
   cartography, collision, menus, combat, the rebuilt bestiary, biomes, dressing
   and everything since.
4. **TypeScript port** — `docs/plans/2026-08-17-opus-typescript-port.md`. Gated
   on a quiet tree; it is a whole-repo lock and cannot run as a parallel wave.
   Note the plan is stale on scale: it says 235 modules / ~79,500 lines; it is
   now **274 / ~94,900**.
5. The human's `project/TODO.md` items: boot time and the 1.4 GB `?debug` RSS.
6. The content/gameplay plan.
