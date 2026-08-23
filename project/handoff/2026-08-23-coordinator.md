# Coordinator — the overnight procedural-modeling push, 2026-08-23

Contract: `docs/plans/2026-08-21-fable-procedural-modeling.md`, all of it.
The human's instruction was "build all 40, use subagents, start with Wave 2,
one batched `Field.ts` change, capture-and-look plus gates throughout, a single
blind `compare.mts` at the very end".

**Every lane agent reads §"Shared rules" below before touching a file.** It is
the part of the brief that is identical for all of them, kept here rather than
repeated seven times.

---

## Two things the plan says that are already false

Both found by measuring, not by reading, before any lane was dispatched.

- **§2.5 seed avalanching is a non-port.** OGL's disease was an xorshift whose
  seeds 101/202/303 produced 0.0002/0.0004/0.0007 — near-clone "variants".
  Ours is **mulberry32**, which avalanches inside `next()`: across 4096
  consecutive seeds the *first* draw has lag-1 autocorrelation **−0.0103** and
  mean **0.49893**; the second draw's is **0.00501**. Seeds 101/202/303 give
  0.136 / 0.129 / 0.932. `mixSeed` would be a no-op wrapper around a hash that
  already mixes. **Do not build it.**
- **§12's "`_outcrops` RNG coupling must be fixed *first*" is already fixed.**
  `Field.ts:917-948` draws all nine numbers for every candidate whether it is
  placed or not, with the reason in its docstring. The scatter lane (§2.3) is
  **unblocked**; nothing has to land before it.

The plan's own audit table is stale in the other direction too: three lanes
(`handoff/variety.md`, `handoff/vegetation.md`, `handoff/silhouette.md`) have
since eaten parts of §7 without the plan knowing. Re-audit before you build.

---

## Lane map — disjoint file ownership

| lane | owns | plan items |
|---|---|---|
| **scatter** | `src/world/veg/Ecology.ts`, new `src/world/veg/Cluster.ts`, `src/tools/scatterstat.mts` | 2.3, 2.6 |
| **rocks** | `src/world/props/Rocks.ts` | 3.1, 3.3, 3.4, 3.5, 3.6, 3.7 |
| **town** | `src/world/town/**`, `src/world/props/{PoiKits,Outposts,Landmarks,Megastructures,RoadFurniture,PartBuilder,BuildKit}.ts`, new `src/world/props/Wear.ts` | 5.2, 5.3, 5.4, 5.5 |
| **method** | `src/tools/**` (not `scatterstat.mts`), `src/world/props/Seat.ts` | 9.1–9.6, §13 `proudOf` |
| **trees** | `src/world/veg/{Trees,TreeBuilder,Bushes,GrassField,VegTextures,VegMaterial,Biomes}.ts` | 7.1–7.6 |
| **characters** | `src/characters/**` | 8.1–8.6 |
| **water** | `src/world/Water.ts`, new `src/world/water/**` | 6.1, 6.2 |
| **terrain** (coordinator) | `src/world/terrain/**`, `src/world/Terrain.ts` | 2.4, 4.2, 4.3, 4.4 |

`src/world/terrain/**` is the **only** bake-invalidating directory and exactly
one agent (the coordinator) touches it, so `BAKE_VERSION` is bumped once and
every shot shifts once. If your lane needs a terrain change, request it in your
handoff; do not make it.

---

## Shared rules — read before touching a file

**Read first**, in this order: `BRIEF.md`, `CLAUDE.md`, `project/LANDMINES.md`
(its last three sections twice), `src/tools/README.md`, your own sections of
`docs/plans/2026-08-21-fable-procedural-modeling.md`, and
`project/handoff/modeling.md` (the honest read on what already landed).

### Shared tree

Other agents are editing other files in this same checkout **right now**.

- You own only the files listed for your lane. Do not edit, `stash`,
  `checkout` or `restore` anything else. A change you need outside your set is
  **requested in your handoff**, not made.
- Commit with an explicit pathspec: `git commit -m "…" -- path/a path/b`.
  `git add` only NEW files, by name. Never `git add -A`, never `git commit -am`,
  never a bare `git commit` — a hook blocks all three and they sweep a
  co-agent's staged work.
- Commit early and often, one concern per commit. The pre-commit hook runs
  `vite build` and both typechecks, so every commit is also your build check.
- **If pre-commit fails inside a file you do not own, that is another agent's
  in-flight edit.** Wait a minute and retry. Do not fix their file.

### Harness

- One shared daemon serves everyone. Never start a server, pick a port or
  launch a browser — a hook blocks all three.
- `node src/tools/shoot.mts <shot> <shot> --out tmp/shots/<lane>-rN --jpeg`.
  Shot names are **positional**, not `--shot`.
- Captures default to `--build HEAD`, so **an uncommitted edit is not in your
  frame** and the only symptom is "nothing changed". `--dirty` is the tight
  loop; commit before any capture you intend to keep.
- For an A/B, **do not `git stash`** — a clean tree stashes nothing, both halves
  run the same build, and you get two plausible numbers with the conclusion
  exactly backwards. Use `git checkout <sha> -- <path>`.
- `imgdiff`/`crop` decode **PNG only**; `--jpeg` for anything you read back.
  `--raw` goes on **both** sides of a `--hide` ablation.
- `imgdiff`'s noise floor is **per shot** and spans 16× — `project/noise-floors.json`.
  Do not quote the 1.5/255 constant at a shot you have not measured.

### The bar

- **Capture, then read the image with the Read tool and actually look at it.**
  Structural correctness is not the bar; `BRIEF.md` says *beautiful*. Iterate
  shoot → look → fix, five rounds or more.
- **Ablate before re-tinting.** A frame says *that* something is wrong and is
  remarkably bad at saying *what*. `--hide`/`--ablate` + `imgdiff --heat`
  overturned eight confident geometry diagnoses in the sibling repos and seven
  here. A `--hide` matching nothing is an error — never read a null ablation as
  innocence.
- **Cost is draw calls, not triangles**: ~8.7 µs each, corr 0.801 against 0.628
  for triangles. A new *visible* `InstancedMesh` costs **four** draws (colour
  plus three shadow cascades). Per-instance variation is free. Budget 800;
  measured range today 351–506. Report both numbers from `manifest.json`.
- **Every item lands with its §9 check in the same commit** wherever a check is
  possible. "Built but never executed" is this repo's chronic disease — seven
  systems were declared, documented and referenced in handoffs while never
  running. `orphans` proves *reachable*, `reachcheck` proves *ran*.
- **Record measured negatives.** The siblings' rejected constructions were half
  the value of their logs. A port you measure as not helping here is a
  deliverable, not a failure — write it in your handoff and say what you ran.
- **Before trusting a number, make the instrument report on a case whose answer
  you already know.** Seven instruments here measured themselves until stopped.

### Handoff

Keep `project/handoff/<lane>.md` current as you go: what is done *and verified*,
what is left, the exact next step, files touched, open questions, and the shots
that show the current state. An agent that can be replaced by its handoff is
cheap to retire; one that cannot has taken the night hostage.

Work until your sections are done or ~3 hours / ~400 turns, then bring the
handoff up to date and stop at a sensible pause.
