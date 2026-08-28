# veg-water — nothing grows through the water any more

Owner: the `veg-water` lane, 2026-08-28. Directories: `src/world/veg/` and
`Ecology`. One defect, funded directly, no plan file. **It is finished and this
handoff graduates with it.** Everything below is verified — by an instrument and
by looking at the frame — and every claim says which.

Commits: `c19f5df` (the instrument and the mask class), `55bd1e5` (the fix),
`bec87a6` (the per-tuft half of it), `a57dbd4` (the control's own control).

---

## The cause: one line, and the fourth system to write it

`Ecology.waterDepth` was `WORLD.seaLevel - this.height(x, z)`.

`Tarns.ts` already opens with the table of what that assumption costs — seven
fishing pins on dry rock, four tarns reported dry with water six metres away, no
blue on the chart under any of them. This is the fourth entry and by far the
most visible: a traced reach at +180 m is two hundred metres from the sea plane,
so **every** population's water test came back at −190 and grass, scrub and
trees grew straight up through the rivers and the tarns. `terrain-r3` found it
in a near-field close-up and could not fix it — `Ecology` was outside its scope.

**Measured, both arms on one terrain snapshot** (`probes/vegwater.mts`, the
Vesperpool's `aboveSea` count is the witness that the heightfield did not move
between them — the shared terrain bake was re-baked by another lane three times
during this session, so an unpaired before/after here means nothing):

| under drawn water | grass | scrub | tree | rootBlocked |
|---|---|---|---|---|
| river sheet, 2 615 points, before | **95.83%** | **77.40%** | **41.19%** | 32.28% |
| river sheet, 3 901 points, after | **0** | **0** | 7.05% | 85.70% |
| crestholm_reservoir, before → after | 85.44 → **0** | 70.88 → **0** | 28.10 → 2.68 | |
| swainsmere | 88.59 → **0** | 66.75 → **0** | 88.96 → 5.64 | |
| archaeans_mirror | 87.78 → **0** | 62.22 → **0** | 88.33 → 5.40 | |
| maidenwater | 83.71 → **0** | 68.62 → **0** | 84.36 → 5.86 | |

The tree residual is the **0.15–0.30 m band and is deliberate**: `treeDensity`
has always allowed 0.3 m of water where grass gets 0.15, so what is left is a
trunk standing in a handspan of water at the margin. The thresholds are
untouched; only the level they measure from moved.

## The fix: a mask derived from the drawn sheet, not from the hydrology

`water/WaterMask.ts`. `Water` builds one last, after the basins and the river
sheet, because it is made of both: the bodies `_findTarns` measured a level for,
and the triangles `River.emitWater` actually emitted — indexed into an 8 m grid,
queried by barycentric interpolation of their own vertex heights. **39 076
triangles, 1 555 cells, 2 ms to build**, one hash lookup per query.

Reading the drawn sheet rather than re-deriving the channel arithmetic buys
three things and the first is not a nicety:

- `emitWater` ramps the outer 38% of the sheet down onto the bed so the
  waterline's alpha reaches zero, and the discharge cap leaves p50 0.50 m of
  ground under that rim. A mask built on `wsl` would strip a bald ring of plants
  along every bank **in a band where the water is drawn transparent**. This one
  reads the ramped vertices, so the depth at the rim is zero because the surface
  there *is* the ground.
- No assumption that a reach is straight or that a tarn is a circle. It is not —
  the bowl radius is warped per azimuth.
- It cannot disagree with the frame. While this was being written another lane
  landed oxbow-splicing in `River.ts` and the sheet went 28 344 → 39 076
  triangles; the mask followed with no edit.

`Ecology.waterLevel` is `max(sea plane, mask)`, so **the level only ever goes
UP** and ground no body and no river covers behaves exactly as it did.

### The second half: the density lattice cannot see a six-metre river

Fixing the level fixed the *sampler*, and the sampler is not what places a
blade. `GrassField._makeTile` evaluates `grassDensity` on a 6×6 lattice per tile
and bilerps: **2 m pitch on the blade ring, 4 on the clump ring, 8 on the far
one**, against a mean river width of 5.5 m. On two of three rings the channel
fits between the samples — the sampler says "no grass" at both ends of a cell
the river runs through the middle of, and the interpolation puts the grass back
on the water. Counted per instance at a wading pose after the level fix and
before this: **1 251 blades still in the Vannath reach, 328 of them in over
1.2 m of water; 7 000 in Swainsmere.**

`Ecology.standsInWater` asks the mask per tuft, before the tuft's own draws.
Same predicate and same 0.15 m threshold `grassDensity` uses, so it can only
remove interpolation leakage — it cannot strip anything the sampler permits.
Every other population was already exact and already at zero: scrub and trees go
through `rootBlocked`, which runs per child.

**It is `lv > seaLevel`, i.e. raised water only.** A body sitting exactly at the
sea plane fails that test, so the coast and the Vesperpool are untouched *by
construction* rather than by a site list. Widening it to the sea is a separate
change and needs its own counter-example answered first.

## The counter-example, checked explicitly

The Vesperpool is a drowned forest with its floor **20 m below the sea plane**
(`WorldMap` landform `vesperBasin`, `h: -20`), which is exactly what kills the
naive "below the water level, no plants" fix. Over 25 445 samples of its 640 m
disc, paired on one terrain snapshot:

    before  74.33 / 62.25 / 58.42 %   mean 0.3913 / 0.1032 / 0.2037
    after   74.32 / 62.24 / 58.37 %   mean 0.3911 / 0.1032 / 0.2034

It cannot move by construction — the pool's own body sits at the sea plane, so
`max(sea, mask)` returns the sea plane and the arithmetic is unchanged. The
0.05 pp that *did* move is accounted for: **37 of the 25 445 samples have a
raised level at all**, and they are a traced reach running down through the disc
on its way to the sea, not the pool. `vegwater.mts` prints that count so the
control explains itself rather than being asserted (`a57dbd4`).

World-wide, **0.177–0.222% of 194 481 samples get a raised water level at all**.

## What I looked at, and what each reads as — all verified by eye

- **A tarn at wading height, before and after, same derived pose.** Before:
  Swainsmere is a *lawn* — grass carpets the entire water surface bank to bank
  and trees stand all through it. After: open water with a jetty, grass stopping
  in a clean line at the near bank, one willow overhanging from the right, a
  treeline on the far shore. It reads as a pond. 142 470 → 443 submerged
  instances at that pose, and 375 of the 443 are within 15 cm of the waterline —
  a blade at the rim of a tuft whose centre is dry.
- **Crestholm Reservoir**, same treatment: open water and a jetty above a dry
  bank, 51 233 → 55.
- **The widest river reach at the `t3-river` wading pose**, before and after at
  the same station: before, the foreground sheet is speckled with grass tufts
  and a tree stands in it; after, it is clean water with the sward stopping at
  both banks.
- **`zone_nebulawood` is the one corpus shot the fix is visible in, and it is
  the best frame of the four.** Before, the bottom-left of the plate is an
  unbroken mat of dark canopy with a glint of water under it. After, there is a
  **lake** with foam at its margin and the forest stopping at its shore. The
  Nebulawood had a forest growing on top of a tarn.

## Gates

- **`pnpm run check` 19/19 in 108.7 s**, on a busy tree — `hydrocheck` PASS,
  `integration` PASS with **8 holes with water**, `driftcheck`, `heightcheck`,
  `floatcheck`, `reachcheck`, `drawcheck` all PASS. Perf gates skipped and not
  claimed: three other lanes were live and a perf number taken under them is
  meaningless.
- **`nanscan` 0 of 142** (`{"shots":142,"hits":[]}`).
- **Cold corpus diff, 8 shots, both of my game-code commits isolated** (each
  span contains only my own commit):
  - the level fix, `c19f5df` → `55bd1e5`: **2 of 8 over their cold floor** —
    `zone_nebulawood` **4.776** (floor 0.74), which is the fix and is described
    above, and `hero_full` 2.273 against a floor of 2.254, i.e. 0.8% over it.
    The other six are 0.17–0.65 against floors of 0.25–1.23.
  - the per-tuft reject, `a001268` → `bec87a6`: **0 of 8 over their floor**,
    worst 1.984 on `hero_full` against 2.25. It is a waterline correction and
    nothing else.
- `scatterstat.mts` still runs: the four probes that build an `Ecology` over a
  bare `Terrain` get `null` from `_mask()` and every sampler still answers.

## Instruments left

| what | where |
|---|---|
| does anything grow through the water — three populations, three surfaces, two controls | `src/tools/probes/vegwater.mts` |
| near-field river and tarn close-ups with poses derived from the sheet, plus a per-instance census of what is standing in water at each pose | `src/tools/probes/vegwaterlook.mts` |

Both run on a build that predates the fix: `waterLevel` is looked up rather than
assumed and `WaterMask` is constructed in the probe, so before and after are the
same probe.

## Files

`src/world/water/WaterMask.ts` (new) · `src/world/Water.ts` ·
`src/world/veg/Ecology.ts` · `src/world/veg/GrassField.ts` ·
`src/world/veg/Bushes.ts` · `src/tools/texbake.mts`.

## Reported, not fixed — all outside `src/world/veg/`

- **`props/Debris.ts` reads `WORLD.seaLevel` directly** and its branches, logs,
  stumps and leaf litter are still in the water: 5–6 instances of each at the
  Swainsmere pose, some in over 1.2 m. It never went through `Ecology`, so the
  mask does not reach it. One-line fix for whoever owns `props/`: ask
  `eco.waterLevel(x, z)`.
- **Boulders placed outside `Ecology.rockScatter`.** `rockScatter` itself now
  rejects raised water (`waterDepth > 0.1`), but `rock_granite`, `rock_bedded`,
  `rock_slab` and `rock_spire` still put 2–10 instances each under Crestholm —
  ~23 of them deeper than 1.2 m. Something in `props/Rocks.ts` / `ZoneDress` has
  its own placement path. Half-submerged boulders in a *stream* are wanted; a
  spire under two metres of reservoir is not.
- **`Water.surfaceAt` is still a bbox scan over `bodies` and knows nothing about
  rivers.** `Fishing` and `PoiKits._waterNear` use it or their own copy of it.
  `WaterMask.levelAt` is the answer for all three and folding them into it is a
  tidy-up I did not take, because it moves fishing survey results.
- **`Bushes`' water-line lattice** (reeds and lily pads) reads a bilerped depth
  on an 8 m pitch, the same interpolation problem grass had. Reeds along a river
  margin are new and correct, but they can be placed up to a few metres off the
  band. Nothing in the frames showed it; it is the obvious next thing if reeds
  start appearing on dry ground.

## Open question

Should a tree be allowed to stand in up to 30 cm of a *tarn*? The 0.3 m
threshold was written for a coast and is why 2.7–5.9% of tarn samples still
carry tree density. In the Swainsmere frame it reads fine — willows at the
water's edge — so I left it. It is one number in `treeDensity` if anyone
disagrees.
