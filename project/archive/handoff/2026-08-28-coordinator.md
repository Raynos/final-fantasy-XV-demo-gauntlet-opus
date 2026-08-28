# Coordinator — building out both live plans, 2026-08-28

**Owner:** an autonomous coordinator session. **Mandate:** take
`docs/plans/2026-08-25-opus-after-phase3.md` and
`docs/plans/2026-08-26-opus-the-standing-backlog.md` to `DONE` — every workstream
either landed or closed with a measured negative appended to the backlog's
negatives table.

## Decisions the human made before this started

They are recorded here because every one of them overrides a default that a
fresh agent would otherwise pick, and three of them override the plans themselves.

| question | ruling |
|---|---|
| how much of the two plans | **all of it** — full coverage, not a subset |
| how | **waves of 2–3 concurrent lanes** on provably disjoint directories, not a big-bang fan-out |
| the risky shading sweeps (A-WS2 programs, B-WS12b materials) | **in, fully** — gated on `check` + a full-corpus cold diff, reverted wholesale if the diff does not clear |
| the head's "do not rebuild" verdict | **rebuild sanctioned.** The head may be treated as broken by construction |
| baselines | a lane **may re-baseline a shot** it intentionally changed, *after* capturing it, reading the image and judging the frame better. Before/after and the reason go in the commit message |
| a measured negative | **counts as closing an item.** It goes in the backlog's negatives table |
| "budget several days" | that is a pre-agent estimate. It is not a reason to defer a workstream |
| `TODO.md` | folded in as its own wave. The repo-layout line was closed by the human at `ddea338`; boot and the 1.4 GB RSS remain |
| when to stop | **when the plans are done**, respawning lanes from their handoffs as they hit their limits |

## Baseline this run started from

`ddea338` · tree `2072870e2ace` · **`pnpm run check` 18/18** (16 from cache,
8.5 s). Perf gates not re-run — they need a quiet tree and the tree has not been
quiet since. `project/STATUS.md` is otherwise accurate as of 08-28.

## The lane map

Sixteen workstreams across the two plans collapse to **fifteen lanes**, because
five pairs are the same work seen from two plans. The merges are the important
part of this table — staffing them separately is how two lanes ship two terms
that cancel.

| lane | owns | is | merged from |
|---|---|---|---|
| `head` | `src/characters/` | the judge's #1, 3.0 → 4.0 | A-WS1 + B-WS1 + B-WS11's character list |
| `harness` | `src/tools/` | cheap, unblocks 3 lanes | B-WS9 |
| `canopy` | postfx + the veg material | one black blob on a judged shot | A-WS4 |
| `ground-light` | `src/world/terrain/`, `src/world/veg/` | 2.6 of a 15-point gap | B-WS2 a/b/c/d |
| `landmarks` | `src/world/props/` | the most-named object in the rounds | B-WS5 |
| `water-content` | `src/world/water/`, the map, fishing | breaks a playthrough | B-WS7 + B-WS8 |
| `alpha-edges` | `src/world/veg/`, postfx | the judge's #1 of round 5 | B-WS3 |
| `sky-clouds` | `src/world/sky/` | one free win inside | B-WS4 |
| `creatures` | `src/characters/enemies/`, encounters | Anak, Titan, and `Enemy.level` | B-WS10 |
| `geometry-bake` | `src/world/**` generators, `bake.mts` | ~1.5 s of a 6.5 s boot | A-WS3 + B-WS12a |
| `perf` | `src/engine/postfx/`, npc shadows | the last 3 stalls + draw calls | B-WS6 + B-WS11's draw list |
| `combat` | `src/combat/` | the arm whip, the framing, the banner | B-WS11's combat list |
| `materials` | cross-cutting | 228 programs, 288 buckets, char LOD | A-WS2 + B-WS12b |
| `memory` | cross-cutting | 1.4 GB RSS in `?debug` and prod | `TODO.md` |
| `dress` | `src/characters/` costume | Ignis, the sleeve, the collar hole | B-WS11's character list, if `head` does not reach it |

**Collisions and the order they force.** `head` and `dress` are the same
directory — `dress` waits. `ground-light` (2b) and `alpha-edges` are both
`src/world/veg/` — sequenced, not concurrent. `harness` and `geometry-bake` are
both `src/tools/` but disjoint files. `materials` touches every lane's materials
and therefore runs when the fewest lanes are live.

**Order constraints inherited from the plans:** `harness`'s `--hide` fix before
any cost ablation in `alpha-edges` / `landmarks` / `perf`; B-WS2c before B-WS2d;
`head` first in priority because nothing in the environment buys a point while
that frame exists.

## Waves

- **Wave 1 — RUNNING.** `head`, `harness`, `canopy`.
- **Wave 2.** `ground-light`, `landmarks`, `water-content`.
- **Wave 3.** `alpha-edges`, `sky-clouds`, `creatures`.
- **Wave 4.** `geometry-bake`, `perf`, `combat`.
- **Wave 5.** `materials` (alone or nearly — it moves pixels everywhere).
- **Wave 6.** `memory`, `dress`, and whatever earlier waves handed back.

## The brief every lane is given

Because it is the same brief every time and it is the accumulated cost of not
saying it: read `BRIEF.md` and `CLAUDE.md` first; **ablate before re-tinting**;
capture and *actually look at the image*, `--jpeg` for looking and PNG only for
`imgdiff`; `--hide` is broken until `harness` fixes it, so difference two
ablations against each other; you commit to see your work, because captures
default to `--build HEAD`; `noise-floors.json` covers 18 shots of 142 and its
floors are *cold* floors, so calibrate and diff cold against cold; read
`VERDICT:` before any number; never start a server or poll; commit early, often,
one concern, **explicit pathspec via `gitlock.mts`**, never `git add -A`.

## Open questions

None blocking. The human is away and has cleared the session to run unattended.

## Next step

Wave 1 is in flight. On each completion: record the result below, fold anything
the lane handed back into the right plan section, and launch the next lane so
that 2–3 are always live.

## Coordinator findings (no browser, taken while wave 1 ran)

**The atmosphere patch is not what multiplies the shader programs.**
`world/sky/MaterialPatch.ts` wraps every lit material's `onBeforeCompile` *and*
its `customProgramCacheKey`, which is the shape that usually explains a program
explosion — but the key it prepends is the constant `'atmo1|'`, and the
per-material term it adds (`uActorHaze`) is a **uniform, not a define**, so it
splits nothing. The multiplier is three's own feature key — maps present,
`vertexColors`, skinning, instancing, batching, `alphaTest`, `side`,
`flatShading`, fog — across **132 material construction sites** (the plan says
127; the count moved). `materials` should start from the site list, not from the
patch.

Sites, by file, top of the distribution: `props/Regalia.ts` 10 ·
`props/PropMaterials.ts` 9 · `props/Landmarks.ts` 8 · `props/PoiKits.ts` 7 ·
`game/fishing/Fishing.ts` 7 · `characters/rig/Materials.ts` 7 ·
`veg/Bushes.ts` 6 · `town/TownMaterials.ts` 6 ·
`dungeons/kit/InteriorMaterials.ts` 6. Four files already centralise materials
for their subsystem (`PropMaterials`, `TownMaterials`, `InteriorMaterials`,
`rig/Materials`) — those are the templates, and the sites *outside* them are
the sprawl.

**The instruments each lane will want**, because `src/tools/probes/` holds 140
files and finding the right one is otherwise a search:

| lane | probe |
|---|---|
| `head` | `headprop` `headprofile` `headfold` `headlook` `facecam` `facemap` `facemark` `hairstand` `_probe/heads` `_probe/portrait` `_probe/eyes` |
| `materials` | `drawwhere` `samplercount` `perfprog` `perfcompile` `warmquantum` `_probe/drawattrib` |
| `memory` | `_probe/gcwatch` `perfgc` |
| `perf` | `perfhitch` `perfsprint` `perfmenurepro` `casters` `npcdraws` `npcshadowlook` `perfupload` |
| `ground-light` | `dryground` `scrubbind` `vegcensus` `vegcost` `barrencensus` `skyprobe` `weavecontact` |
| `landmarks` | `meteor` `rockfield` `rockhull` `rockquilt` `torsite` `outposts` `whoowns` |
| `water-content` | `fishwater` `fishloop` `havenloc` `questaudit` `questchain` |
| `creatures` | `fightshape` `rankcurve` `dens` `titanfist` |
| `combat` | `stagecam` `dmgnum` `setpiece` `huntloop` |

**Where to start on the 1.4 GB, and the instrument that can actually see it.**
`performance.memory` is **frozen in this headless build**, which is why
`probes/perfgc.mts` could not answer the question it was written for.
`_probe/gcwatch.mts` reads the heap from *outside* the page over CDP
`Runtime.getHeapUsage` and is the only working oracle here. Note also that JS
heap is not the whole 1.4 GB: chromium RSS includes GPU-side texture and buffer
allocations, and `/health` already records chromium RSS per lease, so the
daemon's ledger has a free time series nobody has read for this question.

The retained-allocation distribution is heavily concentrated and does not look
like `?debug`: `terrain/Field.ts` 42 typed-array sites, `props/Rocks.ts` 23,
`veg/VegTextures.ts` 13 + **18 render targets**, `terrain/FieldCodec.ts` 12,
`props/BuildKit.ts` 12, `map/Chart.ts` 12, `sky/CloudTextures.ts` 11. Render
targets cluster the same way — `VegTextures` 18, `TerrainMaterial` 14,
`Warmup` 10. `src/dev/` is 2 169 lines total and gated at `main.ts:37`, so the
human's *"and maybe in prod mode too"* is very likely right and the lane should
**measure prod first** rather than assuming the dev suite is the cause.

**Sixteen `WIP` commits from retired lanes are still reachable, and neither plan
mentions one of them.** `git log --all --oneline --grep="^WIP"` finds them. They
are half-finished by construction — several say so — so they are evidence of
what a previous pass tried and how far it got, not code to cherry-pick blindly.
But two of them are the *exact* defect a live lane is chasing, and the grounding
one is the plan's own "written and never run" next step, which the plan
describes without naming its sha.

| sha | what | lane |
|---|---|---|
| `6454bb6` | a profile with a nasion, a mandible body and a visible ear | **`head`** — this is the nose-leads-chin defect, attempted once |
| `1a5fa03` | rebuild the eye — socket depth, lid closure, iris size, waterline | **`head`** — the proud-eyeball item, attempted once |
| `10d8c42` | the ear's ridges were buried inside the plate it sits on | `head` — the flat-scoop ear, with a named cause |
| `6397de1` | an ear with a helix, an antihelix and a tragus | `head` |
| `b278b26` | lay the hair on the head instead of shooting it out radially | `head` |
| `991e7a0` | clump the hair into locks, stop highlight aliasing across the strand | `head` — the sub-pixel shimmer, attempted |
| `368711e` | scalp shell lock-scale relief, unify the two subsurface reds | `head` |
| `deab013` | the hair specular was a brightness multiplier, which made blonds straw | `head` |
| `207a399` | why nothing sits on the ground, and a half-finished term for it | **`ground-light`** — B-WS2c's un-rendered fraction-of-object ramp |
| `721edca` | regional terrain splat | `ground-light` |
| `9602004` | put half the leaf chroma back; neutralising it outright was too far | `ground-light` / `alpha-edges` |
| `1a82078` | the clouds lane's uncommitted state, preserved on the way out | `sky-clouds` |
| `06d4030` | grip-centred weapon geometry | `combat` |
| `60a8e58` | `Animator.rest()` plus handoff | `combat` / `dress` |
| `4db36e2`, `9816f1d` | salvaged after a watchdog stall — open to see what | — |

Routed to `head` on 08-28. Route the rest as each lane launches.

## Results — CLOSED

**Twelve lanes ran, all reported, all graduated. ~225 commits.** Both plans are
wrapped up: `2026-08-25-opus-after-phase3` closed 4 of 4 and is in
`archive/plans/`; the standing backlog closed all twelve of its original
workstreams and stays live because §WS-13 is now the queue.

`pnpm run check` **19/19 in 78.1 s** at close. `nanscan` 0 of 142. Both perf
gates certified under the perf lane with `RULER_VALID: true`, and **`BRIEF.md`'s
33 ms rule is met for the first time**.

The full account is in `project/journal/2026-08-28-both-plans.md`; the snapshot
is `STATUS.md`; the vitals a human asked for are `docs/BOOT_PERF.md`.

**The one thing a successor should read first:** six of the two plans' premises
were false and two more were stale, so roughly 60% of what closed came back as a
measured negative or a corrected premise rather than a landed change. The
generalisation is in `LANDMINES.md` — *when a metric agrees and the frame
disagrees, suspect a property no metric in the tree reads.*

**Open, and deliberately:** §WS-13 is the queue. The head is short of `BRIEF.md`'s
bar and was closed by the human after six passes. The 309 MB memory win is not a
one-line call and the reason is written next to it.

### `materials` — DONE, 2026-08-28. A-WS2 and B-WS12b's programs half; character LOD handed back

**271 shader programs -> 126**, `postfx+compile+warmup` **1776 ms -> 933 ms**
(means of three loads each side), cold boot wall 8.15 -> 7.20 s on the same
tree. `project/handoff/materials.md`, and the accounts in both plan sections.

**Your static pass was right about the atmosphere patch and the finding is
next door to it.** `'atmo1|'` is a constant and `uActorHaze` is a uniform, so
the patch splits nothing — but 60 lit materials were compiled *before* it
reached them, and each of those programs is dead the moment it does. The other
85 are three keying **both** `outputColorSpace` and `toneMapping` on whether a
render target is bound, while every scene pixel here goes through
`EffectComposer`. **Not one of the 132 material construction sites was
touched**, and the sites list would not have led here: the keys they write are
honest, because `VegMaterial` and `rig/Materials` compile their tuning values
into the GLSL as literals.

Gate, in full: full-corpus cold diff **136 of 142 under floor**, the six
exceptions all combat VFX and all `10c2688`'s (proven by diffing each of this
lane's commits against its own parent on those six — every one under floor);
`check` **19/19**; `nanscan` **0 of 142**; `perf` **PASS mean 226.3 fps,
142/142**; `gameplay` **PASS**. And `progused.mts` shows
`compiledDuringPoses` = **25** and `boundTotal` = **134** at 271, 211 *and*
126 programs — the set a frame binds never changed, so nothing moved from boot
into play and `LightBudget`'s constraint holds by construction.

**Handed back, with numbers rather than a gap.** Character LOD was folded into
B-WS12b so the 127 sites would not be touched twice; nothing touched them once,
so it is a clean separate lane now: `town_forecourt` is 465 calls, **5 327 248
triangles**, 272 buckets, 121 draws under 60 triangles, and one bucket —
`SkinnedMesh`/`ShaderMaterial` — is 60 calls and **1 736 436 triangles, 28 940
per draw, with no LOD**. The 16/16 texture-unit warning is likewise untouched.
Both are headroom, not cost: the frame is 6.0-7.2 ms of a 16.7 ms budget.

**Two things for whoever runs the next boot measurement.** `texc.bin.gz` was
missing all session and `pnpm run build:full` failed to rebuild it
(`texbake --canvas` got `ERR_CONNECTION_REFUSED` against its own build server
under load), so every absolute boot number today is ~2.5 s inflated. And
`project/STATUS.md` is **at its 150-line cap**, so this result is not in it.
