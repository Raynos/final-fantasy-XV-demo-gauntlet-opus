# What every gate is for, and what it costs

Status: SUPERSEDED (2026-08-28, opus) by
`docs/plans/2026-08-28-opus-close-out.md`. Items 1 (key each gate on what it
reads, `61a0c0b`) and 2 (tier `drawcheck`, `27a4af2`) are DONE and verified
across five arms. Items 3 (the 7.46 s boot) and 4 (`drawcheck`'s instrument)
were never staffed and carry forward as close-out items 7-9 and 2. The audit's
own conclusion — **no gate should be deleted; zero of eighteen assert anything
wrong** — is carried into close-out's kill list unchanged.

Eighteen gates, ~309 s of wall on a cold run. This asks of each one: what does
it assert, what regression does it exist to catch, has it ever caught one, and
is there a fundamentally cheaper way to the same end?

The answer for most of them is **the gate is fine and the scheduling around it
was wasteful** — which is the more useful finding, because it generalises. Two
gates are genuinely mispriced and both are addressed below.

## The headline

| | |
|---|---|
| Gates whose *assertion* is wrong or worthless | **0** |
| Gates that were re-running for no reason | **all 18, on 70% of commits** |
| Gates mispriced against what they assert | **1** (`drawcheck`) |
| Gates whose instrument is noisier than its tolerance | **1** (`drawcheck`) |

**Of the last 120 commits on this trunk, 84 (70%) touch no game code at all** —
52 docs or config, 32 the harness. Every one of them re-derived all eighteen
gates, because the cache keyed on the tree sha. That single fact was worth more
than any individual gate's cost, and it is fixed (`gatecache.mts`).

## By what they catch

### Static and pure — 2.3 s, all four in pre-commit

| gate | asserts | catches | verdict |
|---|---|---|---|
| `anycheck` 0.2 s | `any` count may not rise | type erosion during a port | **keep.** A lint, not a test, but free. |
| `orphans` 0.2 s | every module reachable from `main.ts` | dead subsystems — this repo shipped 5,765 lines of RPG model nothing imported | **keep.** Cheapest real bug class here. |
| `horizoncheck` 0.3 s | sweep agrees with a brute-force ray march, MCC ≥ 0.85 | a wrong horizon that still looks plausible | **keep.** Genuine differential oracle against an independent implementation. The best-value gate in the suite. |
| `geocheck` 1.1 s | winding, orientation, 0 non-finite, no new edge-parity imbalance | NaN vertices, inverted normals | **keep.** Five controls with known answers run first and it VOIDs rather than passes if any is wrong. |

Nothing to do. These are what a gate should look like: an assertion with an
independent oracle, running in under a second.

### Generative benches, bare Node — ~41 s

| gate | asserts | catches | verdict |
|---|---|---|---|
| `silhouette` 5.6 s | no new pair of meshes shares one outline | a "variety" pass that produced variants nobody can tell apart | **keep.** 107 commits reference it; clearly load-bearing. |
| `silrocks` 14.1 s | no rock family below its distinct/variety floor | same, for generated rock families | **keep**, but see below. |
| `hydrocheck` 13.6 s | every erosion channel is a percentile; hot cells form a network, not a haze — against a shuffled null | a hydrology map that correlates by accident | **keep.** It measures lift over its own null, which is the discipline most of this repo's mistakes came from lacking. |
| `roadcheck` 7.6 s | POI reach, grade limits, corner radii | a road network you cannot actually drive | **keep.** |

All four are **pure functions of source plus a fixed seed** — they cannot change
unless specific files change. They were the largest beneficiaries of the input
hash and are now free on any commit that does not touch the world.

The residual cost is content generation, not assertion: `hydrocheck` spends its
13.6 s building the field, and the check itself is milliseconds. If these ever
need to be cheaper the answer is to cache the *generated field* keyed on the
generator source, not to weaken the assertion.

### Browser behaviour — ~226 s, and the real remaining cost

| gate | asserts | catches | verdict |
|---|---|---|---|
| `uxcheck` 60→13 s | 93/93 menu and control invariants on live state | a menu row that opens nothing; pointer lock never released | **keep.** Turbo'd, byte-identical verdict. |
| `reachcheck` 49 s | every must-run path actually executes | code that is reachable *statically* and never runs — six systems passed `orphans` and never executed | **keep.** Asks the question `orphans` cannot. |
| `integration` 45→15 s | 26 pass, 1 wired | a feature no player can reach | **keep.** Turbo'd; the weapon-swap probe stands itself down rather than pass on frames it knows were never submitted. |
| `combatloop` 45→14 s | 31/31 bindings, damage numbers, poise | the fight silently degrading — RESCUE §B5 records it sliding 30/30 → 21/30 unnoticed for weeks | **keep.** The single strongest argument in the repo for gates running automatically rather than by convention. |
| `creaturecheck` 17 s | 207 poses, every creature stands on the ground | a skeleton folded through the floor, invisible to `Box3` on the bind pose | **keep.** |
| `floatcheck` 10.5 s | nothing new floats or is buried | placement drift across the POI corpus | **keep.** Deliberately not turbo'd — it contains no `g.frame(` calls, so the flag bought under a third of a second and asserted a validation its coverage cannot support. |

These are the gates that catch a broken *game* rather than a broken build, and
none of them is a candidate for removal.

**Their remaining cost is not the assertion, it is the boot.** Each takes an
exclusive lease on a fresh page — 188 boots over 190 lease jobs, structurally
forced — at **7.46 s each**. Page sharing is not the way out: the boot audit
found exactly one of nine gates (`heightcheck`) that can safely receive a used
page, and this repo has been burned twice trying, because `reachcheck` rewrites
every system prototype, `integration` reports 27→24 on a driven page, and
`combatloop` moves `player.position` where `Game.reset()` never restores it.

So the lever is **the 7.46 s boot itself**, which is also line one of the
human's `project/TODO.md` — *"Wow starting a new page takes forever."* One fix,
two payoffs: every gate gets cheaper and the game starts faster. That is the
next thing to work on.

### GPU-vs-CPU oracles — 47 s

| gate | asserts | catches | verdict |
|---|---|---|---|
| `heightcheck` 9.3 s | GPU `tf_height()` vs `Terrain.heightAt()`, 0.000 m | a shader and a collision surface disagreeing | **keep.** Exact oracle. |
| `driftcheck` 37.8 s | rendered surface stays put while the camera travels | clipmap LOD morph bugs that `heightcheck` is blind to by construction | **keep.** Expensive but it asks a question nothing else asks. |

### Budget ratchet

| gate | asserts | verdict |
|---|---|---|
| `drawcheck` 200→32 s | no shot over BRIEF's 800; no recorded shot worse | **mispriced, now fixed — and its instrument is still broken.** |

Two separate problems, and they were being confused with each other.

**Mispriced.** It posed 142 shots to police a limit only 9 of them come within
100 of, and only 4 within 60. Now poses the shots that could breach plus a
rotating sixth of the rest: 37 shots, 32.4 s.

**Broken instrument.** It disagrees with *itself* on 25 of 142 shots by up to
**60 draw calls**, against `TOLERANCE = 8`, on identical code and an identical
tree. Five hypotheses tested, four falsified; `resetClock()` demonstrably fixes
the isolated per-shot case and changes nothing at corpus scale, which points at
state accumulating **across** shots rather than frame parity within one. The
chunk boundary is the only `GAME.reset()` in a run, which is why chunk sizing
now stays at 16.

Until that is resolved, **no drawcheck-based verdict finer than 60 calls means
anything** — including the evidence that reverted a 5.7× settle ablation, which
was +20.

### Measurements, not assertions — opt-in

`perf` 780 s and `gameplay` 360 s stay behind `--perf`. A measurement's
provenance is part of it: neither replays from cache unless the machine was
quiet, which is correct and should not be relaxed.

## What this audit changes

1. **Key each gate on what it reads.** DONE (`61a0c0b`). Verified across five
   arms: cold 77.7 s, warm 74.6 s, docs-only commit **8.2 s**, harness-only
   commit **8.5 s**, and a game edit correctly re-derives everything at 76.9 s.
2. **Tier `drawcheck`.** DONE (`27a4af2`). 142 shots → 37, 153.8 s → 32.4 s.
3. **Attack the 7.46 s boot.** IN PROGRESS — see
   `project/handoff/reset-and-reuse.md`. The route is not "make boot faster" but
   "make a booted page reusable": `resetcheck.mts` took the leak count from 29
   fields to 12, and `creatures`/`dungeon` are clean. The remaining 12 are
   structural (GPU resources, scene objects, the enemy roster) and overlap the
   1.4 GB in `project/TODO.md`.
4. **Fix drawcheck's instrument.** HALF DONE. `warmup()` removed the -60:
   lazy bestiary construction made a draw count a function of run history. On a
   warmed page, three consecutive passes over twelve shots are byte-identical,
   which proves the residual +15 is **boot-to-boot rather than accumulated**.
   That is one narrow question left instead of five.

**No gate should be deleted.** The suite's problem was never that it asserts
too much; it is that it re-asserted the same things on commits that could not
have changed them.
