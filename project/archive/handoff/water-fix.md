# water-fix — the cold-boot shader error, and WS-13's water and map items

Owns `src/world/water/`, `src/world/Water.ts`, `src/world/map/`, `src/game/fishing/`,
and `src/world/props/PoiKits.ts` for the jetty item only.
Contract: `docs/plans/2026-08-26-opus-the-standing-backlog.md` §WS-13.
Source: `project/archive/handoff/water-content.md` — my predecessor, who carries the numbers.

---

## P0, FIXED AND ON `main` — every lane can take cold captures again

`8f728d4`. **`hero_full --cold` exits 0.** Three lanes were waiting on this.

Every cold boot at `main` raised

```
THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false
```

so every `--cold` capture exited non-zero and failed `BRIEF.md` hard rule 5.
`sky-clouds` bisected it to `b237dc6`, the river-bank commit. The cause is one
line of that commit, in `RiverMaterial.ts`'s fragment shader:

```glsl
vec3  body = (bed * Tr + uScatter * (1.0 - Tr)) * downwelling;   // line 167
...
float body = smoothstep(0.02, 0.55, depth);                      // line 223
```

Same scope, same name.

```
ERROR: 0:335: 'body' : redefinition
ERROR: 0:336: 'max' : no matching overloaded function found
```

The fragment shader never compiled, so `riverWater`'s program never linked, so
**the river water surface has not been drawn at all since `b237dc6`**. The pale
strip left in every river frame was the bank decal alone. The alpha floor's ramp
is `bodyRamp` now.

### Why it was invisible warm, which is why it shipped

A program is compiled **once per page**. The daemon clears a slot's error list
per run, so a link failure is charged to whichever run happened to cold-boot
that page, and every later run on that page reports clean. The pre-commit hook
builds; it does not link GLSL. **Nothing but `--cold` can see this class of
fault** — which also means: after any shader edit, take one cold capture.

### The message that would have named it was being truncated

`shoot.mts` printed `e.split('\n')[0]` of each page error. For a shader failure
that is the one useless line — `Shader Error 0 - VALIDATE_STATUS false` — while
the `Material Name:` and `ERROR: 0:335:` that follow it were captured and thrown
away. That truncation turned a one-line typo into a bisect. It now prints the
first line plus every `ERROR:` / `WARNING:` / `Material …` / `Program Info Log:`
line after it, capped at eight. Same commit.

### How to recover the diagnosis next time

In a probe: set `renderer.debug.onShaderError`, set `material.needsUpdate = true`
on the suspect material, render once. Three re-links it and hands you the shader
info logs. To find *which* material, walk `renderer.info.programs` and read
`LINK_STATUS` per entry — **`material.program` is undefined in three 0.185**,
which is why `probes/samplercount.mts` returned an empty list here and looked
like the page had no materials.

`tmp/water/linkfail.mts` (link status for all 271 programs) and
`tmp/water/relink.mts` (the re-link + `onShaderError` capture) are both left in
place.

### Two measured negatives from that hunt, worth not re-opening

- **The sampler budget is not this bug.** 16 of 16 fragment texture units and 32
  combined are in use and the page does warn about it, but the failure is a
  *compile* error in one file.
- **`VALIDATE_STATUS false` on a linked program means nothing here.** ~120 of
  the 271 programs report it, all with the same log — *"Two textures of
  different types use the same sampler location"* — which is what
  `gl.validateProgram` says about any program inspected outside a draw call.
  Only `LINK_STATUS === false` is a real failure.

---

## WS-13 item 1 — the world map draws no blue under the four tarns: FIXED

`e67eef8`. `rasterChart` decided a pixel was water with `h < WORLD.seaLevel` and
nothing else — **the same one-global-level predicate for the third time**, after
`Water.ts` (seven of ten pins were a jetty on dry rock) and `Fishing._survey`
(four tarns called dry with water six metres from the pin, `2b344e7`).

So it is not copied a fourth time. The arithmetic is now
**`src/world/water/Tarns.ts`**, which takes its ground height as a *function*,
so the same code runs against the live `Terrain` in the game and against the
baked elevation grid inside the chart bake — which runs under Node in
`texbake.mts` with no `Terrain` and no DOM. `Water._findTarns` is six lines that
bind it.

Measured, chart 2048²: **50–63% of each of the four bodies' own footprints reads
as water where it read 0.** Looked at, at 5× (`tmp/shots/chart-tarn4/crop0.png`
Swainsmere, `crop1.png` Crestholm Reservoir): a turquoise pond, darker over its
own deep, with the coastline hairline the existing pass draws for free.

Two things the frame caught that the numbers did not:

- **The depth ramp has to be the body's own** (`level - floor`), not the sea's
  26 m — otherwise a 3 m tarn is one flat shoal-turquoise disc with no basin in it.
- **Take the tarn's surface only where the pixel is under it, not merely inside
  its box.** Letting the sandy strand ramp against a tarn's waterline put every
  pond inside a **pale grey rectangle**: the box is the water's bounding rect
  plus 8 m, a tarn basin is dished, most of that margin is 1–3 m above the level,
  so the strand filled the box to its corners and stopped dead at them.
  Narrowing the strand band from 22 m to 3 m shrank the rectangle and did not
  remove it — only dropping the land case does. See `tmp/shots/chart-tarn2/` and
  `chart-tarn3/` for the two rejected versions.

`Tarns.ts` is in **both** `TEX_SOURCES` and `GEO_SOURCES`: it is a chart
generator now and has always been a shore-ribbon generator (`water/shore` is
baked geometry that is a pure function of the terrain and `Water.bodies`).

**Bake consequence, for whoever picks this up:** that `GEO_SOURCES` change makes
`pruneStaleGeoBake` drop the geometry cache on the next server start. Restore it
with `node src/tools/texbake.mts --geo`. The tex cache re-bakes itself.

---

## WS-13 item 3 — the rivers: LOOKED AT, and the verdict is the predecessor's

`tmp/water/riv2.mts` at `main`, with the water surface actually drawing for the
first time since `b237dc6` (`tmp/shots/w-riv-fixed/`):

- **p50 (4.10 m wide) reads as a damp grey-brown stain on a pasture.** Not a
  river. The grass texture runs straight under it unbroken, there is no incision,
  no bank line, no shadow, and almost no sky in it. The verdict my predecessor
  recorded stands, and it now stands on a frame that has the water in it.
- **max (29.9 m) reads as a pond with a hard polygonal rim** — the p99 hard edge,
  clearly visible as a straight cut across still-submerged ground.
- **p90's camera is inside the hillside.** `riv2.mts`'s `up`/`back` framing does
  not clear the terrain at that station; that shot is not evidence of anything.

So: the width raise is landed and it is still **not** what makes a river read as
a river. The lever is the *channel* — a reach on a flat pan has no banks to have
water between — and conditioning the heightfield is a `Field.ts` job, which is
what `water.md` §5 already said.

---

## WS-13 item 2 — the jetty at the dry pins: FIXED, and it was two bugs

`1d41cf4`. `_fishing` set its deck from `WORLD.seaLevel` and never asked whether
there was water at the place.

| pin | water (`tmp/water/near.mts`) | before | after |
|---|---|---|---|
| `caem_shore` | 246 m away | 22 m of pier on a grass hillside | shack, rod stands, boat hauled out |
| `rachsia_bridge` | none within 600 m | same | same |
| `crestholm_reservoir` | at the pin, +80.53 | deck **1.6 m under water** | deck at water + 1.5 |
| `swainsmere` | at the pin, +67.90 | deck **2.1 m under** | deck at water + 1.5 |
| `archaeans_mirror` | at the pin, +36.93 | deck **2.1 m under** | deck at water + 1.5 |
| `maidenwater` | at the pin, +40.06 | deck **1.5 m under** | deck at water + 1.5 |

**The submerged four are the newer bug and nobody had seen it.** `max(1.4,
seaLevel + 1.5 - base)` collapses to its own floor at any inland site, so the
deck, the shack, the rod stands and the moored rowboat were all under the pond.
Those four bodies are three days old; the kit predates them.
`tmp/shots/jetty/j-crestholm_reservoir.jpg`, `tmp/shots/jetty/j-caem_shore.jpg`.

The threshold for "not a waterside" is **180 m, not the jetty's own 22 m**, on
purpose: half the *wet* pins are already further from the water than the deck
reaches (`galdin_pier` is 72 m out), so a reach test would take the pier off
Galdin Quay. Whether a jetty meets its shoreline is a different question from
whether the place is a shore, and Galdin's shoreline is the terrain lane's.

**And it cost a gate, which is the gate working.** `5ca25f5`. `floatcheck`'s POI
rule is the *minimum* float over a compound's meshes — at least one thing has to
be in the ground — and the wet kit met it for free, because its jetty piles run
3.4 m below the deck. Take the jetty away and the lowest mesh left is the shack,
on a deck `_base` seats on a ring **average**: `caem_shore` came up 0.38 m proud,
`rachsia_bridge` 0.06, and `poiFloating` went 0 → 2. Four stub piles fixed the
number and looked wrong (a shack on visible legs with daylight under it, on a
lawn — `tmp/shots/jetty2/`); a sunk sill fills the gap instead of framing it
(`tmp/shots/jetty3/`). `deckSink` and `stands` are measured off
`group.position.y` and the compound's top, so neither can trade a float for a
burial.

---

## The tarns render as flooded ground, not as ponds — half fixed

Half fixed at `27960bd`, and the remaining half is named and measured.

**Fixed: half of every tarn was inside its own foam band.** `foamBand` was "a
third of the deepest point", which on a dished basin lands at the *median*
depth, and was then clamped to the sea's own 1.35 m — the number the field
exists to escape. Measured, 81×81 per body: **45.7–48.0% of every tarn was
foaming.** It is now the depth of the shallowest sixth of the body's own wet
area, so a sixth foams by construction: 0.36–0.43 m, **14.9–16.7%**.
`tmp/shots/tarn-foam/` against `tmp/shots/jetty/`.

**Also fixed, and it was worth doing anyway: shallow lake water was six per cent
opaque over its own bed.** `7d91caa`. `uSigma.b` is 0.045/m, so at the tarns'
1.4 m median depth `alpha = 1 - exp(-0.045 × 1.4) = 0.061`, and the sky in the
water, the glint and the foam were all multiplied by that. Same physics the
river lane measured at `b237dc6`, same answer: a floor ramped in over the first
metre, so the swash line stays see-through and the waterline silhouette still
comes from the bed. Controlled against `tmp/water/look2.mts`'s twelve frames
(`tmp/shots/w-look-before/` vs `w-look-after/`): `galdin_beach`, the shot most at
risk, is **indistinguishable**; `shore1`, a shallow weedy lake margin, is
**better**. No regression found.

**And the honest negative: that is NOT what makes the tarns read as flooded
ground.** `tmp/shots/tarn-alpha/` is not meaningfully different from
`tmp/shots/tarn-foam/`. The brown in those frames is mostly not shallow water —
it is **emergent bed**. Only **50–64% of each body's footprint is under its own
level**, against the ~78% a circular pond inscribed in its bounding box would
give, so about a fifth of every tarn is dry islands. That is the basin's shape
and it is carved by **`Field._tarnBasins`** — the terrain lane. Anyone taking it
should note the basin has to hold water at a *median* depth that is large against
its own bed roughness, not merely at its deepest point.

**A second measured negative — do not spend a day on it.** The emergent bed is
*not* `microDetail`, the terrain's ±0.9 m analytic relief. Each body against
`Field.heightAt` (with) and `Field.rawHeightAt` (without): **50.0% wet against
49.7%**, depth p10 0.27 against 0.24 (`tmp/water/tarnmicro.mts`). The roughness
is in the carved DEM.

---

## WS-13 item 4 — both scoped, both outside this lane's directories

Investigated in full, not started. Neither is in `src/world/water/`,
`src/world/Water.ts`, `src/world/map/` or `src/game/fishing/`.

**Energy deposits are invisible because nothing draws one.** The model is
complete and live: 12 sites at `src/game/rpg/Elemancy.ts:101-121`, `draw()` at
`:511-540`, `RpgSystem.drawNearby(pos, 12)` at `RpgSystem.ts:684-693`, called
from `CombatSystem.ts:987`, bound to `KeyT` at `CombatSystem.ts:1484`, with a
mote-burst VFX on success. What is missing is **any geometry** — no file under
`src/world/**` references `DEPOSITS` — and **any interaction prompt** — no
`ix.register` for a deposit anywhere. So the mechanic is: stand within 12 m of
an invisible point and press an unlisted key. `docs/SCOPE.md:318` already says
so. Note `DEPOSITS[i].pos[1]` is hard-coded `0` (`Elemancy.ts:120`); anything
that draws or prompts must call `terrain.heightAt`. ~60–90 lines in
`src/world/props/` (template: `Foraging.ts`, and `HavenCamp.ts:44-68` for the
prompt-installation pattern and *why* it happens on the first tick).
`content-wire.md:212-221` makes one argument worth keeping: **geometry first,
prompt second** — a prompt with no visible subject is the phantom-prompt defect
a blind judge ranked 2nd of eight. Also found: **`KeyT` is bound twice**, Draw
on foot and Type-D in the Regalia (`RegaliaSystem.ts:60`), and
`ControlsScreen.ts` lists `T` only as Type-D, so there is currently no correct
in-game statement of how to draw.

**Fociaugh's "1.26 bank" is a *grade*, not 1.26 m.** It comes from
`probes/dungeondoor.mts:66-71`, rise over run at 6 m: **the sill stands ≈7.6 m
above the ground 6 m in front of the door, about 51°**, against Keycatrich 0.13
and Balouve −0.25. The door is at terrain height by construction; it is the
approach that is a cliff. `Portal.ts:49-59` gives the builder a door space `P`
and a ground space `G`, and `buildCaveMouth` mixes them: the knoll and breakdown
blocks follow the slope in `G`, but the brow (`:274`), the jambs (`:276`) and
the black void card (`:278`) are in `P`, so on a 1.26 grade the brow sits metres
inside the hill. Fix owner is `src/world/dungeons/kit/Portal.ts`; cheapest
option is moving those three into `G` (~20 lines). `gradePad()` at
`Wear.ts:332` is the real answer and needs an `Ecology` handle threaded into
`Dungeons.init`. `dungeondoor.mts` already prints the grade every run and
asserts only distance-to-pin — one `check('approach grade is walkable',
abs(grade) < 0.35)` turns it into a gate. **Not re-measured live** (the daemon
was saturated); the figure is from `content-wire.md:189` plus a line-by-line
read of the probe.

---

## Open, in the order I would take them

1. **The tarn basins are a fifth dry islands** — `Field._tarnBasins`, the terrain
   lane, with the numbers above. It is the biggest remaining thing standing
   between the four newest water bodies and reading as ponds.
2. **The p99 hard edge** — `emitWater` in `River.ts`, ~15 lines: ramp the
   outermost lane down to the local ground wherever the discharge cap bound, so
   the sheet closes onto the terrain instead of ending in a wall. Needs a fold
   re-check (`riverStats.folded`). The one river defect fixable inside this lane.
3. **Energy deposits**, and **Fociaugh's cave mouth** — both fully scoped above,
   both in other people's directories.
4. **Fix `riv2.mts`'s p90 framing** before anyone quotes a p90 river shot.

## Not mine, stated so nobody re-opens it

**Galdin Quay.** 698 of 6 280 shore points have a run-out gentler than 4 m; it
needs a `Field.ts` sand shelf and an `Ecology` grass suppression. Terrain lane.

## Two things I could not do from this lane

- **`project/LANDMINES.md` has an uncommitted change from another lane**, so I
  did not touch it. The entry it should get is the one at the top of this file:
  *a GLSL compile or link failure is invisible on a warm page, because a program
  is compiled once per page and the daemon clears a slot's errors per run — only
  `--cold` can see it, and `renderer.info.programs` + `LINK_STATUS` is how you
  find which material, since `material.program` is undefined in three 0.185.*
- **The geometry bake.** Adding `Tarns.ts` to `GEO_SOURCES` means
  `pruneStaleGeoBake` drops the geometry cache on the next server start (~1.2 s
  of boot). `node src/tools/texbake.mts --geo` restores it. I left it to whoever
  is next past the `geometry-bake` lane rather than racing a shared gz with the
  lane that owns that tooling.

## A process note

`0560b83` (the `geometry-bake` lane) swept my in-flight `src/world/Water.ts`
edit into its own commit. Nothing was lost — the change is correct and on `main`
— but that commit's tree imports `./water/Tarns.ts`, which did not exist yet in
it, so `0560b83` does not build. Its pre-commit passed because the hook builds
the *working tree*, not the commit. This is the shared-index hazard `CLAUDE.md`
warns about, seen from the other side.

## Files

`src/world/water/{Tarns,River,RiverMaterial}.ts` · `src/world/Water.ts` ·
`src/world/map/Chart.ts` · `src/tools/{texbake,shoot}.mts`.

Probes in `tmp/water/`, free to delete: `linkfail.mts`, `relink.mts`,
`charttarn.mts` are mine; the rest are my predecessor's.
