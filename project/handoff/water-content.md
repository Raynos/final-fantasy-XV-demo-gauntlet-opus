# water-content — WS-7 content holes and WS-8 water

Owns `src/world/water/`, `src/world/Water.ts`, `src/world/map/`, `src/game/fishing/`.
Contract: `docs/plans/2026-08-26-opus-the-standing-backlog.md` §WS-7 and §WS-8.
Sources: `project/archive/handoff/{content-wire,water,hydrology}.md`.

**Status: eight commits on `main`, `2b344e7..b915af3`. Every §WS-7 and §WS-8 item
is landed or closed with a measured number. Ten of ten fishing pins are now
either fishable or drawn as unavailable.**

---

## The headline: eight of ten fishing pins had water and the survey was looking at the sea

§WS-7's #1 item — *"the most likely thing to break a 30-minute playthrough"* —
was **one stale comparison**, not the `Water.ts` / `WorldMap.ts` + re-bake job
the plan budgeted for. No re-bake was needed and none was done.

`Fishing._survey` decided a sample was submerged with

```js
water.surfaceAt(x, z) != null && terrain.heightAt(x, z) < water.level
```

and `water.level` is the **global** −6.5 m. That was correct when the file was
written. It stopped being correct the night `Water._findTarns` began measuring a
level per body and `Field._tarnBasins` carved a basin under every inland pin —
work that `hydrology.md` records as *"8 of 10 hold water, from 1"*. Since then
`Water.bodies` has held **eight** bodies: four seas and four tarns at +36.9,
+40.1, +67.9 and +80.5 m. Every tarn failed a test that can only pass at the
coast.

Measured at `HEAD` before the fix (`tmp/water/dry.mts`, `tmp/water/near.mts`):

| pin | ground | verdict | nearest real water |
|---|---|---|---|
| crestholm_reservoir | 77.5 | tarn, level 80.5 | **6 m** |
| swainsmere | 64.4 | tarn, level 67.9 | **6 m** |
| archaeans_mirror | 33.4 | tarn, level 36.9 | **6 m** |
| maidenwater | 37.1 | tarn, level 40.1 | **6 m** |
| caem_shore | 95.6 | spills — no hollow | 246 m |
| rachsia_bridge | 120.4 | spills — no hollow | none within 600 m |

All four answered `DRY -- no water within 170 m` with water six metres away.

**A second bug the first one was hiding.** A tarn pin stands at the *centre* of
the basin cut around it, so the pin is two to four metres **under** water; the
outward walk found the pin's own puddle at r = 6 and stood the rod in the middle
of the lake. The survey looks for a wet/dry **transition** now, in whichever
direction the pin is standing, and puts the stand on the dry side either way.

    before: 4 live fishing holes, 6 dry pins
    after:  8 live fishing holes, 2 dry pins

`2b344e7`. `probes/fishwater.mts` and `probes/fishloop.mts` (18/18) are the gates.

### The other two are honestly drawn as unavailable

`1b8ab41`. `WorldMapScreen._unavailable(poi)` asks `Fishing.spots`, which is the
survey's own output — so it **cannot go stale** the way a hand-kept exception
list would, and the strike disappears by itself the day a basin appears under a
pin. Drawn *dead*, not merely inert, the way `MainScreen` draws a screen no
build registered: the glyph keeps its shape (you must still be able to tell what
it was meant to be), loses its type colour, drops to 0.42 alpha and takes a
haloed strike; the card strikes the `does:` line through, prints the reason in a
warm rule-marked note, and the footer reads UNAVAILABLE IN THIS WORLD.
Looked at: `tmp/shots/wm-fish2/x-caem.png` (dead) against `x-swains.png` (live).

**Why those two were left dry rather than fixed.** Both want a terrain change:
`caem_shore` stands 95.6 m up with the sea 246 m out and 100 m down —
`_tarnBasins` refuses it because closing a rim there needs more than 6 m of fill,
which is a visible ring embankment; `rachsia_bridge` has no water within 600 m
and the disc slopes 13.7 m straight through the pin. Moving either pin edits
`WorldMap.ts`, which is in **both** `bake.mts`'s `SOURCES` and `TEX_SOURCES`, so
it re-bakes the shared heightfield *and* the shared chart for every lane on the
machine. Two other lanes were capturing continuously. Not worth it for two pins
that the map now tells the truth about; the option is real and is written down
here rather than taken.

---

## §WS-8 — the water

### The river bank was painting a 26 m wet apron around a 3 m stream

`b237dc6`. WS-8 says the rivers are too narrow. **Standing in one says something
else first.** Ablated at the widest reach from 13 m up (`tmp/water/riv.mts`, six
captures toggling `riverWater` / `riverBank` / `shoreRibbon` independently): the
sprawl of pale angular plates that fills the near field is the **bank decal**,
and hiding the water leaves all of it.

Per side: bank half-width **mean 8.08 m, max 13.0** — the whole of `MAX_BANK` —
against a water half-width mean of 1.75. `firstCrossing` walks outward until the
ground reaches `bankH`; on a valley floor it never does, so both banks returned
the full search on every station of every flat reach. The decal re-introduced,
in blend, exactly the sixty-four-metre sheet the water's own discharge cap exists
to prevent. It is `min(MAX_BANK, 1.2 + 5.0 q)` now, and with that alone the strip
reads as a bank following a channel.

### The flat white patch on the beach was never the shore ribbon's lace

`5531bd9`. §WS-8.2 names the ribbon's `lace` threshold and `brk` term as the
handles. Ablated at the third-gentlest beach on the map from 7 m out at 26°
(`tmp/water/foamab.mts`): hide the shore ribbon **entirely** and the white patch
is unchanged; set its `uFoam` to zero and it is unchanged again. It is the lake
surface's own depth-derived foam margin in `Water._makeMaterial`, and neither
named handle could have touched it.

**The band was a depth and it needed to be a distance along the beach.**
`edge = 1 - smoothstep(0, uFoamBand, dropDown)` at 1.35 m of depth is a hand's
width of ground on a cliff and four-plus metres of it on a shelving beach — so
precisely where a shoreline is worth standing on, the margin stopped being a
margin and became a white *area* with a shaped edge. Two extra `wf_bed` taps
give the local bed slope; the band is now the depth corresponding to ~3.5 m of
beach, capped by the authored number so a cliff and a tarn render as before.

Before/after: `tmp/shots/w-fab/f-withribbon.jpg` against
`tmp/shots/w-fab2/f-withribbon.jpg`. The shallow margin now reads as shallow
water — bed visible through it, sky in it — with the foam back to a lace at the
waterline.

### Numbers, and one thing I would not call a win

| | before | after |
|---|---|---|
| river mean width | 3.49 m | **5.17 m** |
| river max width | 20.03 m | 29.92 m |
| river mean depth | 0.39 m | **0.47 m** |
| width p10 / p50 / p90 / p99 | — | 2.32 / 4.10 / 9.33 / 26.38 |

The half-width cap is `water.md`'s own suggested `2.5 + 14 q` and the depth
`0.45 + 2.20 q`. **The width raise is not what was wrong and I would take an
argument to revert it.** At the p50 station (4.1 m wide, 0.6 m deep) the reach
still reads as a damp streak across a pasture — because that site is a pan with
no incised channel, not because the river is narrow — and at p99 the cap
truncates the sheet over still-submerged ground and it ends in a hard polygonal
cliff, which the wider cap makes *worse*. See "left open" below.

Two shading changes did help and are cheap:

- **Sky gain 1.15 → 2.9** in the river water. `uAmbient` is `Sky.fill`, a
  hemisphere *fill* intensity — the light the sky delivers to a diffuse surface,
  not the radiance you see looking at it — so reflecting it at unit gain put the
  surface an octave under the sunlit grass beside it.
- **An alpha floor of 0.34**, ramped in over the first half metre of depth. Half
  a metre of water absorbs almost nothing at 0.14/m in blue: the Beer-Lambert
  alpha is 0.05 and the Fresnel one 0.13 looking down a reach from the bank, so
  the surface was ~87% invisible over its own bed and every cue that says water
  was being multiplied by that.

---

## The rest of §WS-7

- **`setPiece` in `Shots.ts` and `applyShot` already exists** (`374f5c9`).
  `ScenarioName` carries `setpiece_astral` / `setpiece_field`,
  `Director._setPieceScenario` runs them through the same `startSetPiece` the
  hunt runtime calls, and `setpiece_deadeye` is a live boss fight in the corpus
  today. The handoff's proposed diff describes a mechanism that exists under a
  different name. Nothing to add.
- **Titan's five failed framings were a camera that never moved.** `boss_astral`
  is a `follow:` shot, so `applyShot` sets `CameraRig.followShot` and the rig
  re-derives pos and target every frame, silently overwriting any `setShot` a
  probe makes afterwards. Ten vantages came back **byte-identical**
  (`tmp/water/titanframe.mts`, first run — the contact sheet is ten copies of one
  frame). `rig.followShot = null` first and the sweep works immediately. "Almost
  certainly the Disc of Cauthess" was a plausible attribution with no test on it.
- **Fishing audio landed** (`b915af3`): `reelClick` fired per notch of line
  recovered rather than looped, `lineStrain` gliding up with tension, `castWhirr`
  at the angler with a positional `splash` at the float. Counted through a whole
  cast and a landed fish (`tmp/water/fishaudio.mts`): `ui x2, warp x1, hit x2`
  before, `ui x2, cast x1, splash x1, reel x6, line x34` after.
- **`assertConsistentWinding` wired into both generators** (`73c19b7`), the
  harness lane's hand-off, `try`/`catch`/`console.error` per `PartBuilder.build`.
  Population measured, not assumed: 329 833 interior edges on the ribbon, 47 099
  on the river water, 35 415 on the bank, **0 flipped** on all three.
- **Energy deposits (§WS-7.2)** and **Fociaugh's 1.26 bank (§WS-7.5)** — not
  started. Both are outside this lane's four directories (`src/world/props/`,
  `src/world/dungeons/`) and neither is a water or a fishing question.

---

## Measured negatives — do not re-open these

| claim | verdict |
|---|---|
| Seven fishing pins have no water and it is a `Water.ts` / `WorldMap.ts` + re-bake job | **Four of them had water 6 m away.** `Fishing._survey` compared the ground against the *global* `Water.level` after `Water` stopped having one. One predicate, no re-bake |
| The near-field foam's handles are the shore ribbon's `lace` threshold and `brk` term | **Neither can touch it.** Hiding the ribbon entirely, and separately zeroing its `uFoam`, leaves the white patch unchanged. It is the lake surface's own `uFoamBand` margin in `Water._makeMaterial` |
| The river bank reads as hovering plates because of the clipmap-envelope lift `Shore.ts` rejected | **Removing the lift moved the ablation frame by nothing visible.** It is gone anyway — the shore's argument applies verbatim and it costs a `drawnEnvelope` probe per station — but the plates were the bank being 8 m wide per side, not 0.9 m too high |
| Raising the half-width cap to `2.5 + 14 q` fixes the rivers | Mean width 3.49 → 5.17 m and the p50 reach **still reads as a damp streak**, because that site is a pan with no channel. The lever that matters is opacity and sky, not width — and the wider cap makes the p99 hard-edge truncation worse |
| Titan cannot be framed because the Disc of Cauthess fills the frame | **The camera never moved.** `boss_astral` is a `follow:` shot; `CameraRig.followShot` overwrites `setShot` every frame. Ten vantages, one frame |
| `setPiece` needs adding to `Shots.ts` and `Game.applyShot` | Already there as `scenario: 'setpiece_astral' \| 'setpiece_field'`, with `setpiece_deadeye` live in the corpus |

---

## My honest read of the water

**The sea is good.** `tmp/shots/w-r5/w-galdin_beach.jpg` — a real swell with sky
in it, a submerged rocky bed reading through the shallows, and no white plate on
the margin any more. I would put it in a blind comparison.

**The near-field shoreline is now correct and still not beautiful.** The foam is
a lace at the waterline instead of a sheet, but the *land* behind it is grass
running to the water. There is no beach anywhere I looked.

**Galdin Quay is not a beach and the water lane cannot make it one.** The fiction
says resort-on-a-beach; the terrain says submerged rock with grass to the
waterline. Measured: **698 of 6 280** shore points (11%) have a run-out gentler
than 4 m, the gentlest 15 m. The ribbon cannot manufacture sand where the baked
ground albedo is grass — `pale` reads that albedo and is the only handle it has.
Making Galdin a beach is a `Field.ts` grade (a 30–60 m sand shelf at the POI) plus
an `Ecology` grass suppression below about +2 m there. **That is the terrain and
veg lanes, with the numbers above.**

**The rivers are the weakest thing I own.** The bank is fixed and the shading is
better, but a 4 m river half a metre deep on a flat pan is not a river, and seven
reaches totalling 4.9 km are all upland — `water.md` §5's *"the river reaches
never get to the sea"* is still true and its own proposed fix (a priority flood
to condition the heightfield) is a `Field.ts` change.

---

## Left open, in the order I would take them

1. **The p99 hard edge.** Where the discharge cap binds, the water sheet ends
   over still-submerged ground in a straight polygonal cliff (see
   `tmp/shots/w-riv4/r-a_all.jpg`). The fix is to ramp the outermost lane down to
   the local ground where the cap bound, so the sheet closes onto the terrain
   instead of ending in a wall. ~15 lines in `emitWater`, needs a fold re-check.
2. **The world map draws no water under the four tarns.** `Chart.ts` rasterises
   from the heightfield against `WORLD.seaLevel`, one global number — the same
   class of bug as the survey's. Swainsmere is a live fishing hole with no blue
   under it on the sheet. The fix is to share the tarn arithmetic between
   `Water._findTarns` and the chart raster (a module in `src/world/water/`), and
   it costs a chart re-bake because `Chart.ts` is in `TEX_SOURCES`.
3. **Revisit the width raise** with a control. It is unverified as an
   improvement and the numbers above are the honest case against it.
4. **`PoiKits._fishing` builds a jetty at `caem_shore` and `rachsia_bridge`** —
   dry ground, in the 3D world, not only on the map. The map is honest now; the
   geometry is not. `src/world/props/`.

---

## Files

`src/game/fishing/Fishing.ts` · `src/ui/screens/WorldMapScreen.ts` ·
`src/world/Water.ts` · `src/world/water/{River,RiverMaterial,Shore,ShoreMaterial}.ts` ·
`src/audio/Sfx.ts` · `src/game/Shots.ts` (the set-piece comment only, on its own
pathspec).

Probes and benches in `tmp/water/`, all free to delete:

| file | what |
|---|---|
| `dry.mts` | why each fishing pin is dry — mirrors `_findTarns`'s arithmetic |
| `near.mts` | nearest river vertex and nearest submerged sample per pin, unbounded |
| `look2.mts` | the water look set: three beaches, four reaches, a tight swash camera, Galdin from the sand — in daylight, at eye height above the **water** |
| `riv.mts` / `riv2.mts` | the river ablation set, and the width distribution with p50/p90/max framings |
| `foamab.mts` | the ablation that found the white patch was the lake, not the ribbon |
| `titanframe.mts` | the vantage sweep; clears `rig.followShot` first |
| `fishaudio.mts` | wraps `Sfx.play` and counts programs through a whole cast |
| `wind.mts` | the winding assert's population |

---

## One coordination note against myself

`RiverMaterial.ts` and `Water.ts` each spent a stretch of this session
unparseable in the shared tree because I put a **backtick inside a `/* glsl */`
template literal** — the landmine `water.md` records having paid twice. That is
three, and the third one cost the head lane the end of its session. `tsc -p
tsconfig.json --noEmit` after every shader edit, not at commit time: it is two
seconds and the failure mode is that nobody on the machine can capture `--dirty`.
