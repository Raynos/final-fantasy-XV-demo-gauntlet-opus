# Coordinator handoff — 2026-08-22

Written for whoever picks this up next. The ledger this session worked from is
`project/archive/RESCUE-2026-08-21.md`; it closed with this session and is
archived. **Open work is now `project/STATUS.md`, and its landmines are in
`project/LANDMINES.md`** — read those, not the ledger.

This session rescued the work abandoned when session `07642602` and its seven
subagents were force-killed (~3 GB RSS, ~80 MB transcript, stopped along with
every agent under it). No committed work had been lost; everything still in a
head had been.

---

## 1. State of `main`

290 commits. Tree clean, no `agent/*` branches, worktrees pruned (2.3 GB
reclaimed), no orphaned vite/chromium. **`npm run check` — 9/9 gates green.**

`npm run check` is new: one command, all nine gates, one table. `--perf` adds
`perf.mts` and `gameplay.mts`, opt-in because a perf number taken while agents run
is meaningless. It exists because `combatloop.mts` slid 30/30 → 21/30 and nobody
noticed for weeks — the cheap gates were run at every merge and the expensive ones
were not.

## 2. The most useful thing this session learned

**Four inherited diagnoses were wrong, and every one was caught by measuring
rather than by trusting the handoff that recorded it.**

| recorded as | actually |
|---|---|
| `combatloop` 21/30 = a pre-existing game regression | **a stale test.** `combatloop.mts` still pressed `KeyH` for a technique after the keymap moved to G/J/K; that opened the controls card, `Menus._pointerLock` disabled input, and every later check failed |
| the chevron hatch = heightfield normals | **GTAO** reconstructing normals from depth, drawing distant triangle facets. `?post=nogtao` alone removes it |
| `Terrain.groundColorAt` disagrees with the shader | **it never existed.** `Ecology.groundColor` called two undefined functions, so every plant in the world tinted from a hard-coded brown ramp |
| dualhorn/bloodhorn "deep rebuild, **verified by eye**" | rendering **flat black** from a `Color.setHex` NaN |

The first three had stood for weeks or months, each protected by a plausible
write-up. Treat `RESCUE.md` §C and every `handoff/*.md` as *leads*, not facts.

**And I made the same class of error myself.** I A/B'd a GTAO fix with `git stash`
on an already-clean tree — which stashes nothing, so both runs used the same build.
Both numbers looked plausible (44.8 vs 44.6) and the conclusion was exactly
backwards. Measured properly the fix cost 10% of the walk segment, and I shipped a
two-instruction distance fade instead for no measurable cost. **Use
`git checkout <sha> -- <path>` for A/Bs.**

## 3. What landed

Determinism, the headline: a `follow` shot alone vs sixth in a batch went
**39.200 → 1.511** mean/255, against a **measured control floor of 0.373**. Three
causes, only the first of which was in any handoff — `Party.snap()`;
`Director.setScenario` early-returning when the scenario name was unchanged, so
consecutive `field` shots skipped the reset entirely; and `resetClock()` running
once per page rather than per shot. **Still ~4× this shot's own floor, so a little
real order-dependence remains. Not closed.**

Also: Noctis holds his sword in his right hand with a closed fist; blades read as
steel; `cine_opening` pushes a visible Regalia; `cine_astral` is staged on the
Cauthess crater floor; the subtitle leak that was silently burning cutscene lines
into later corpus captures is fixed (it was `Letterbox`, not `Subtitles`); Titan's
floating slabs, the chevron hatch, the monoculture groves, bark rendering at 0.003
albedo, and the daemons being unreadable at night.

Five agent areas merged and each verified by eye before merging: enemies, ui,
vegetation, hero art, terrain.

## 4. The two numbers to carry

Measured on a genuinely quiet tree — **the first trustworthy perf numbers this
project has had**, because every previous one was taken with agents live:

| gate | result |
|---|---|
| `perf.mts` | mean ~70 fps, **worst 37.9 fps on `vista_dawn` — FAIL** |
| `gameplay.mts` | **worst segment `walk` at 49.8 fps — FAIL** |

`walk` is *worse* than the ~57.5 fps the old `SESSION-STATE.md` recorded; that
figure was taken under load and was never real. **Nobody owns either failure.**

## 5. What is next

`docs/plans/2026-08-21-opus-rescue-and-sequencing.md` holds the agreed order, and
each phase now has its own plan:

1. **Phase 2 — TypeScript** (`2026-08-22-opus-phase2-typescript-port.md`). Gate is
   met for the first time: clean tree, all gates green. **It is a whole-repo lock
   and cannot use the agent-wave method.** Note the old plan's scale figures were
   40% low.
2. **Phase 3 — boot and memory** (`2026-08-22-opus-phase3-boot-and-memory.md`).
   Boot is 13.55 s cold / 12.84 s warm — the warm load saves only 0.7 s, so
   nothing is cached. **The TODO's memory premise is backwards:** `?debug` uses
   *less* JS heap than the plain page.
3. **Phase 4 — content and gameplay**
   (`2026-08-22-opus-phase4-content-and-gameplay.md`), over the existing 985-line
   audit. **Re-audit against `combatloop` 30/30 first** — the audit's picture of
   how stubbed the game is was drawn while that gate was misreporting.

Open and deliberately not closed: hands still mittens, outfits still flat black,
hair reads as quills, anak needs a sculpt not paint, `Bushes.ts` (491 lines) never
audited by anyone, `MapScreen` a 22-line stub, `zone_weaverwilds` has no shot to
capture it with, and **a fresh harsh-critic pass — the last score was 4.5/10 and
predates essentially everything now in the game.**

## 6. Method notes worth keeping

- **Tell every agent to commit early and often, even unverified `WIP:` commits.**
  Three agents were killed mid-flight by a laptop sleep today and lost nothing.
- **A stalled agent's transcript may be unrecoverable; its branch is not.**
  Re-dispatch a fresh agent whose first command is
  `git merge --no-edit worktree-agent-<id>`, and say plainly which inherited
  commits have never been looked at.
- **Cap agent concurrency at ~4.**
- **Measure the noise floor for the shot you are comparing.** It is per-shot, not
  the constant 1.5–1.9 everyone quotes: `prompto_closeup` measures 0.373. The
  determinism work would have been declared finished at 2.068 without this.
- **A clean `vite build` does not mean the page runs.** Boot the page.
