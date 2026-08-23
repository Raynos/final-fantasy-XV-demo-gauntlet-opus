# Scatter — the world was a lattice everywhere, and nobody had measured it

Owner: the scatter lane, 2026-08-24. Coordinator:
`project/handoff/2026-08-23-coordinator.md`. Contract:
`docs/plans/2026-08-21-fable-procedural-modeling.md` §2.3, §2.5, §2.6.
Owns `src/world/veg/Ecology.ts`, `src/world/veg/Cluster.ts` (new),
`src/tools/scatterstat.mts` (new). Nothing else.

---

## THE ASK — three call-site changes this lane may not make itself

They are in `Trees.ts`, `Bushes.ts` and `Rocks.ts`. **Everything below is
landed, typechecked, built and measured, and until these three swaps happen
none of it is drawn.** `orphans` will call them reachable and `reachcheck` will
say they never ran, and both will be right.

### 1. `Trees._makeTile` — the grove sampler (§2.3)

Replace the `GRID x GRID` stratified loop (`src/world/veg/Trees.ts:682`) with:

```js
for (const p of eco.groveScatter(x0, z0, TILE, TILE)) {
  const { x, z } = p;
  const sp = p.kind;                       // chosen ONCE per grove, not per tree
  // ... everything from `const vi = ...` down is unchanged
}
```

`groveScatter` already applies `treeDensity` at the parent and the hard
exclusions (`worldRadius`, water, slope, road, cleared pads) per child, so the
`bil()` density grid, the `_clumped` call and the `rng.next() > d` acceptance
test all go. **Keep `_clumped` alive as a `bias`** if you want the thicket/stand
octaves on top: `eco.groveScatter(x0, z0, TILE, TILE, { bias: (x, z) => ... })`
— the bias multiplies the *parent's* suitability and never touches a child.

The one thing to be careful about is the per-candidate `rng` draw count, which
`Trees.ts` documents twice as load-bearing. It stops being load-bearing the
moment the sampler changes, because the whole forest re-scatters anyway; take
the opportunity to move the remaining `rng.next()` draws onto `p.seed`
(`hashU(p.seed, k, SALT)`) so a later edit cannot re-roll the world again.

`Bushes._makeTile` is the same swap with `eco.scrubScatter`, **except** the
water-line branch: `scrubScatter` rejects standing water outright and does not
place reeds or lilies. Keep the `depth > 0.45` / `depth > -1.1` branches exactly
as they are and route only the `else` (woody scrub) arm through the sampler.

`Rocks` gets `eco.rockScatter(x0, z0, w, h, { bias, radius, slack })` — pass the
zone `dress.rockD` as `bias` and your own size draw as `radius`, and read
`p.fromParent` to put the blocks in the middle of a cluster and the scree out
past 1.2.

### 2. `Trees._makeCanopyTile` and `_makeTile` — the far seat (§2.6)

One line each. In `_makeCanopyTile`, `y: eco.height(x, z)` becomes

```js
y: eco.farSeat(x, z, /* card height */ stand.height, this.canopyRange)
```

and in `_makeTile`, `y: eco.height(x, z)` becomes
`eco.farSeat(x, z, variant.height * s, this.impRange)`.

Measured need, 4 000 samples on wooded ground, planted height minus the height
the clipmap actually draws there:

| ring | viewCell | float > 0.5 m | > 2 m | p99 | max |
|---|---|---|---|---|---|
| geometry, 250 m | 3 m | 1.6% | 0.0% | 0.61 m | 1.28 m |
| impostor, 330 m | 6 m | 12.8% | 0.1% | 1.25 m | 2.46 m |
| far canopy card, 1250 m | 24 m | **27.1%** | **10.6%** | 8.48 m | 19.51 m |

The geometry ring is fine and should be left alone. **One far stand card in ten
hangs more than two metres clear of the hillside it grows out of.** The mean
float is *negative* (−0.43 m) — half are already buried — which is why this has
never shown up as an offset in any frame average: it is entirely a positive
tail, and the tail is at the skyline, which is exactly OGL's point.

`farSeat` wraps `Terrain.seatHeightAt` + `clipSpacingForDistance`, the pair
`seatcheck.mts` certifies at 0.000 m residual against the rasterised clipmap. It
is deliberately not a third seating model. Cross-check it with the method lane's
`floatcheck.mts` once the swap is in.

### 3. `project/must-run.json`

Add `Ecology.groveScatter`, `Ecology.scrubScatter`, `Ecology.rockScatter`,
`Ecology.farSeat` when the call sites land — not before, or `reachcheck` goes
red on a promise instead of a regression.

---

## Why the swap cannot be faked with a density mask — the finding that matters

The obvious cheap alternative is to leave the jittered grid alone and make
`treeDensity` itself lumpy, which is what the variety lane's `_clumped` (`b4bd4e2`)
did. **It cannot work in a wooded zone, and the reason is arithmetic.**

A jittered grid with acceptance probability `d` can never place more than one
instance per cell. `Trees` uses 8 m cells, so the ceiling is 1 tree / 64 m² =
0.0156 /m². Measured over a 640 m box on the Nebulawood: mean `treeDensity`
**0.727**, peak **1.000** — a peak-to-mean ratio of **1.38**, giving 0.0114 /m²
actual against a 0.0156 /m² ceiling. There is 38% of headroom. A grove needs a
factor of several between the inside of a stand and the ground between stands,
and no density field can express that when the cell size has already capped the
peak.

That is why `scatterstat` measures the Nebulawood's shipped tree scatter at
**R = 1.129 — dispersed, more even than random** — after a lane spent an
afternoon making its density field lumpier. The lumpiness went into the
low-frequency envelope, which is the only place it can go, and the local
arrangement stayed a lattice.

---

## Landed

### `e33e1c3` — `Cluster.ts` and `scatterstat.mts`

`src/world/veg/Cluster.ts` is a Matérn (Neyman–Scott) cluster process:

- **Parents dart-thrown with a minimum spacing.** One candidate per
  `parentMin`-sized cell with a hashed priority; it wins iff no candidate within
  `parentMin` has a higher priority. Because the cell equals the spacing, only
  the 3×3 neighbourhood can conflict, so this is a one-pass local rule with no
  recursion — which is what makes it identical from either side of a tile edge.
  Verified: min pairwise spacing 30.62 m at `parentMin = 30`; acceptance ~42% of
  cells, so the *achieved* parent pitch is about 1.55 × `parentMin`.
- **Suitability applied to the parents.** It scales the parent's Poisson rate
  and is never evaluated at a child, so a poor site grows a smaller grove or
  none, never a moth-eaten one. This is the item's load-bearing line and it is
  the whole reason the numbers below move.
- **Poisson-count children, Gaussian around each parent** (Knuth, exact at these
  rates; Box–Muller from the child's own salt).
- **Species per cluster.** A grove is one species.
- **Radius-aware separation** `(r1 + r2) * slack`, by the same priority rule
  rather than a greedy sweep — a greedy sweep's answer depends on where the
  sweep started, i.e. on which tile asked.
- **`fromParent`** in units of `spread`, for scree at the cluster edge.
- Hard geometric exclusion is a *separate* per-child predicate. A tree standing
  in a lake because its parent was on the shore is not grove coherence.

Tile-independence is verified, not asserted: one 400 m rect and the same rect
assembled from four 200 m quadrants return identical point sets (542 = 542).

`src/tools/scatterstat.mts` is the measurement, and it is half the item.
Clark–Evans R plus the NN histogram, edges handled by **buffering** — gather
768 m, score the inner 512 m — rather than by a correction formula, because a
cut-off neighbour biases R *upward*, which is the direction that would let a
lattice off.

**Three synthetic anchors are regenerated and re-scored on every run** and the
run VOIDs if they misbehave: uniform-random must read 1.00, a jittered lattice
must read above it, a cluster process well below.

| anchor | true answer | today |
|---|---|---|
| poisson | 1.00 | **0.989** |
| lattice | > 1 | **1.258** |
| matern | << 1 | **0.519** |

**The Poisson anchor caught two bugs in my own estimator on its first run** and
this is the entire argument for the rule: the grid neighbour search started at
ring 1, skipping the point's *own* cell where the nearest neighbour usually is,
and it stopped at the first ring with any hit rather than the first ring that
proves the hit is nearest. Uniform random points read **R = 1.281** — a number
that, had I shipped it, would have made every real scatter in the world look
0.29 more dispersed than it is, and would have made the lattice defect look
worse and the fix look better. Both, in the flattering direction.

### `39d4d16` — `Ecology`: the plaza, the hydrology, and `farSeat`

**Grass grew through every town plaza in the world.** `poiClear` had two
consumers out of three: `treeDensity` multiplied by `1 − poiClear`,
`grassDensity` and `scrubDensity` took `siteBlock` alone — which knows about the
handful of landmarks Vegetation authored near the origin and nothing about the
world map's 124 POIs. Measured at pad centres *before*: Galdin Quay's plaza
`grassDensity` **0.746**, Schier Heights parking `scrubDensity` **0.587**,
`poiClear` exactly **1.00** at both. The exclusion was published, correct, and
not read.

Hammerhead alone read near zero, because it has an authored `site` sitting on
top of it. That is why the symptom presented as a Hammerhead mystery rather than
as what it was, and it is why "ablate before theorising" earned its place in the
brief: the one POI anyone looks at closely is the one POI that was already
covered.

Both densities now take `cleared()` = max(`siteBlock`, `poiClear`); every pad
centre in the sample reads 0.000. World-wide mean cost is under 1% (grass
0.4271 → 0.4237, scrub 0.1672 → 0.1662) because pads are a tiny fraction of an
8 km world — but they are where the camera stands.

**`treeDensity` claimed hydrology it never sampled.** Its docstring has always
said trees cluster on "low, sheltered, wetter ground"; behind that sentence were
an fbm lobe and a 12 m convexity stencil. It now reads
`Terrain.erosionAt().wet` — the erosion pass's own channel (plan 2.4). The term
is `0.55 + 0.90 * wet` and is deliberately **mean-neutral**: `wet` is a
percentile and measures mean 0.505, so trees *redistribute* without multiplying.
Measured: density ratio **1.301 on the wettest quartile against 0.705 on the
driest**, a 1.85:1 move, for a world mean of 0.1511 → 0.1477 (−2.3%).
`exposure` stays — a 12 m crest and a 16 m drainage channel are different scales
and they disagree usefully. `sampleMaterial().flow` is not used and must not be.

`farSeat` is above.

---

## The numbers — `node src/tools/scatterstat.mts`

768 m gathered, inner 512 m scored, counts tuned to parity with the lattice they
replace (0.85–1.35×) so that clustering changes *where* the matrices go and not
how many there are.

| zone | class | R grid | R matérn | same-species grid | matérn |
|---|---|---|---|---|---|
| fallgrove | trees | 0.930 | **0.741** | 77% | 93% |
| nebulawood | trees | **1.129** | **0.740** | 88% | 96% |
| alstor | trees | 0.648 | 0.457 | 71% | 92% |
| longwythe | trees | 0.562 | 0.650 | 83% | 91% |
| three_valleys | trees | 0.603 | 0.622 | 94% | 98% |
| fallgrove | bushes | 0.920 | **0.720** | 32% | 88% |
| nebulawood | bushes | 0.951 | **0.628** | 35% | 92% |
| longwythe | bushes | 0.971 | **0.671** | 38% | 93% |
| three_valleys | bushes | 0.983 | **0.670** | 43% | 95% |
| alstor | bushes | 1.058 | 0.427 | 91% | 91% |

The sibling's measured move on the same defect was 0.890 → 0.531; ours is
0.930 → 0.741 and 1.129 → 0.740 in the two wooded zones, and roughly
0.95 → 0.65 on scrub everywhere.

**The scrub row is the bigger finding.** The undergrowth is Poisson-to-dispersed
in *every* zone — 0.92 to 1.06, with no zone reading clustered — and its species
is drawn per instance, so a bush's nearest neighbour is the same species only
32–43% of the time. That is the even salad of identical dark dots the variety
lane described, still running, and it is the layer that fills the bottom third
of every establishing frame.

---

## Measured negatives, in full

| hypothesis | probe | result |
|---|---|---|
| the shipped tree grid reads dispersed **everywhere** | `scatterstat`, five zones | **No.** In the two sparse Leide zones it already reads clustered (0.562, 0.603) because the glade gate carves it into islands, and the Matérn sampler is a wash there (0.650, 0.622). The defect is real where the frame is wooded and absent where it is not — which is also where it matters, since a Leide frame has 63–71 trees in a 512 m box and a Duscae frame has 2 660. |
| §2.5 **seed avalanching** (`mixSeed`) is worth porting | the coordinator measured it before dispatch and I did not re-litigate | non-port: mulberry32 avalanches inside `next()`. Not built. |
| §2.5 **decorrelated draws** — `Ecology` reuses a hash across decisions | measured \|r\| between every pair of draws that shares a `Noise` object, as the real callers sample them, 20 000 land points | **No exceptions.** Every pair is ≤ 0.064: `nGrove` treeDensity-grove vs treeSpecies-grove **0.036**, vs treeSpecies-local −0.012; `nPatch` grass-patch vs tree-glade −0.052, vs grass-fine −0.028, vs scrub-patch **0.0008**; tightest is scrub-patch vs tree-glade at **−0.063**. Separating a shared noise field by frequency *and* by an offset of many lattice periods is sufficient, and `Ecology` does both everywhere. Nothing to fix. |
| §2.5 **hash-shuffled truncation** — no exceptions | read every budget cap in the scatter path | **Two exceptions, both in `Trees.ts` (not this lane's file).** `Ecology.scatterClustered` had a third and is deleted. Details below. |
| the density mask could do the job instead of a new sampler | peak-vs-mean `treeDensity` over the Nebulawood | **No**, and it is arithmetic, not taste — see "why the swap cannot be faked" above. |

### §2.5 truncation — the two exceptions, for whoever owns `Trees.ts`

`Trees.update` has three budgets and they do not behave the same way.

- **`geoBudget`** truncates by a **distance sort** — closest trees win the
  geometry budget, the rest fall back to their own impostor. Correct. No change.
- **`impBudget`** (`far < this.impBudget`) truncates in **tile-scan order**, the
  `dz`/`dx` loops walking outward from the camera tile. When it binds, the
  impostors that get dropped are the ones in the tiles scanned last — a fixed
  corner of the ring, not a random sample of it.
- **`canBudget`** (`cn < this.canBudget`) does the same for the far stand cards,
  and the per-species cap `c._w >= c.max` truncates in scan order *within* a
  species on top of that.

The §2.5 fix is one line each: rank by `hashU(p.seed, i, SALT)` and keep the top
`budget`, or simply skip with probability `1 − budget/estimated` from a position
hash. **I have not measured whether either budget actually binds in a shipped
frame**, and that is the first thing to check before spending anything on it —
if `far` never reaches `impBudget` this is a latent bug and not a live one.

---

## Files touched

- `src/world/veg/Cluster.ts` — new, the sampler.
- `src/tools/scatterstat.mts` — new, the measurement. Bare Node, no daemon, no
  browser, no build ref; it reads the working tree and the baked field, ~3 s.
- `src/world/veg/Ecology.ts` — `cleared`, `erosion`, `groveSuit`, `scrubSuit`,
  `rockSuit`, `rootBlocked`, `groveScatter`, `scrubScatter`, `rockScatter`,
  `farSeat`; `hash3` moved down to `Cluster.ts` and re-exported; the dead
  `scatterClustered` / `ScatterPoint` / `ScatterOpts` deleted.

Not touched, deliberately: `Trees.ts`, `Bushes.ts`, `GrassField.ts`,
`Rocks.ts`, `Debris.ts`, `ZoneDress.ts`, `src/world/terrain/**`, `Terrain.ts`.

## For other lanes

- **town lane:** `PoiKits._exclusions` is published at `PoiKits.ts:1953` and has
  **no consumer anywhere in the tree** — that is the per-building half of the
  pad exclusion and it is not "something downstream reading it at the wrong
  radius", it is nothing reading it at all. The *disc* half was in `Ecology` and
  is fixed. A consumer cannot live in `Ecology`: `Props` initialises after
  `Vegetation` and `Ecology` is built by both.
- **rocks lane:** `eco.rockScatter` gives you `fromParent` and radius-aware
  separation, and `eco.rockSuit` keys the parents on `accum` + `scree` + `rock`
  so the stones and the plants agree about where the water went. `scree` is
  **83.2% exactly zero** with p95 = 0.40 — it is a sparse mask, so it is an
  additive term in `rockSuit`, never a multiplier.
- **method lane:** `scatterstat` prints its own blindness block and carries its
  calibration triple, per §9.3/§9.6. It is not wired into `pnpm run check` yet
  because it grades a sampler nothing calls; wire it the same day the call sites
  land. It does need a ratchet at that point, not a fixed threshold — R is
  zone-dependent by a factor of two.
