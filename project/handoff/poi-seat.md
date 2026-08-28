# poi-seat — the last two rows of §WS-13

Owns `src/world/props/PoiKits.ts` and POI pin positions in
`src/world/map/WorldMap.ts`. Both rows are closed; this file exists so the
argument survives the plan's archiving, and it graduates with this lane.

## Row 1 — three POI aprons hung 19–25 m

**Done and verified by eye.** The answer was the pin, not the earthwork, exactly
as the row guessed — but the *criterion* for a good pin was wrong the first time
and the frame is what said so.

| pin | was | now | seat |
|---|---|---|---|
| `fort_vaullerey` | hang 24.8, toe mean +6.06 | hang −0.79, toe mean −5.09 | (−2560, −2720), 20 m south of `n_fort_vaullerey`, authored `x`/`z` |
| `tomb_fierce` | hang 22.0, toe mean +3.72 | hang −0.15, toe mean −0.45, deep 6.2, proud 0.9 | (−2604, −1254), after two rejected seats |
| `tomb_mystic2` | hang 19.5, toe mean −8.62 | hang −1.35, toe mean −4.79 | (−1104, −2234) |

World totals, `probes/padhang.mts`: `over6` **5 → 2**, `over3` 13 → 10, `over1`
21 → 19, `over0` 52 → 49, mean toe **−1.33 → −1.47 m**. The three named pins are
off the worst-20 list entirely; the world's worst apron is now `crestholm_inlet`
at 11.36 m, which is not this lane's and is below.

**The method that made this cheap, and it is reusable:** `tmp/probes/poiseat.mts`
rebuilds the *actual kit* at every offset on a lattice (`pk._make` after resetting
`site.group` and dropping the old entry from `pk.built`) and reads the real toe
ring off the geometry that comes back. A 20 m lattice out to 100 m for three pins
is ~10 s of probe. Do not score a candidate seat off a heightmap.

**`tomb_fierce` took three seats, and each rejection came from a frame that the
previous number called good.** That is the whole method lesson of this lane.

1. `hang` alone chose z = -1274. Looked at: a tall pale striated curtain pasted
   flat on a dark rock cliff. `gradePad`'s `cliff` branch answers a brink with a
   **retaining wall**, and a wall *lands* — so `hang`, `toeMean` and `floatcheck`
   are all structurally blind to it. New number: **`deep`**, the apron's lowest
   vertex below its own deck.
2. `deep` alone chose z = -1214, at 2.6 m. Looked at: the mausoleum in a notch
   with grass across its roofline. An apron is a **mesh laid over the terrain,
   not an excavation** (`_base`'s docstring already records
   `poi_costlemark_menace` growing a mound inside its own sealed court), so a
   hummock inside the footprint comes up through the building. New number:
   **`proud`**, the highest drawn ground above the deck within the *building's*
   ten metres — not the pad's, whose uphill rim is above its deck by
   construction.
3. All three together chose **z = -1254**: hang -0.15, deep 6.2, proud 0.9. 6.2 m
   is an ordinary batter; `FILL_MAX` for a 34 m pad is 17.

Both traps are in `project/LANDMINES.md`.

**Closed with a measured reason, not landed:** `tomb_mystic2` keeps `deep = 26`.
Every seat within 100 m of the Disc's flank does; the first that does not is
**200 m out on the basin floor**, 100 m lower, off the landform the tomb is named
for. Its toe is buried 1.35 m and its mean 4.79 m, so the earthwork lands. Left
where it is deliberately.

`fort_vaullerey` also reads `deep = 26` on some bearing and stays, because it has
been looked at from four bearings and its apron meets the grass on a soft,
scalloped, tufted line with no undercut on any of them. It is the best-looking
POI frame this lane produced.

## Row 2 — four fishing camps stood proud of their bank

**Done and verified by eye.** The row's diagnosis was already half-landed by
`b648b69` and the probe could not tell, which is the first finding.

`probes/fishdeck.mts` was re-derivng `_fishing`'s own arithmetic, so it kept
reporting float that a commit had fixed. Rewritten to measure the built vertices
against the surface each 2 m cell actually has — ground where the ground is above
the local water, water where it is not, and each cell supported by the lowest
thing within one cell of it (an eave is held up by the shack next door).

Measured that way the real defect was not "4.8–5.6 m above its bank". It was:

- **all four tarn camps stood entirely over water** — 44–48 wet cells, zero dry —
  so `b648b69`'s shack-on-the-bank was on a bank 3.5 m under the surface;
- **all four sea/river camps stood entirely over land**, pier included, because
  the jetty ran down `_yaw`, the nearest **road**'s bearing. `alstor_dock` ended
  4.74 m up at 23° off its own water; `vesperpool_dock` **13.94 m** up a bluff.

Fix: `PoiKits._waterLine` walks 48 bearings for the nearest crossing of the local
water surface and returns the heading that faces the water plus the **signed**
slide from the pin to the edge. The camp faces it and slides onto it, so local
`z = 0` is the waterline at every pin. The shack takes the first ground out of
the water walking back from it, seated on the **low corner** of its own 4.6×3.8 m
footprint; the ramp spans the gap that leaves; every pile is already measured.
`_fishingDry` seats each of its six loose objects on the ground under itself
instead of on one plane.

After, all ten camps (`bankAir` / `waterAir`, metres, negative = buried):

    alstor_dock         -1.08 -1.80    crestholm_reservoir -0.74 -1.80
    swainsmere          -0.92 -2.70    maidenwater         -1.29 -2.05
    archaeans_mirror    -1.25 +1.42    galdin_pier         -1.04 -1.80
    malacchi_pond       -0.02   -      rachsia_bridge      -0.03   -
    caem_shore          -0.08   -      vesperpool_dock     -1.78 -2.09

The one positive is the last 2.5 m of `archaeans_mirror`'s deck cantilevering
past its final pile, 1.42 m over the water — that is the deck's own freeboard,
not a float.

`LIM = 80 m` is in a measured gap: the crossings are 19.5, 24.0, 54.0, 54.0,
55.5, 67.5, 69.0, then `malacchi_pond` at **133.5**. Sixty was tried and left
`crestholm_reservoir` under its own reservoir.

## Reported, not fixed

- **Malacchi Pond has no pond.** Nearest water 133.5 m away and 28 m below; the
  camp is dry now, correctly, but the place is named for water that is not there.
  `Water._findTarns` gave four pins a body and not this one.
- **The Keycatrich peak's hard horizontal terracing** is still in `poi_tomb`, as
  §WS-13 already records. Not mine and not touched.
- **`crestholm_inlet` is now the world's worst apron at 11.36 m**, and
  `balouve_mines` at 7.09. `poiseat.mts` was run on the first of them, and the
  answer is a decision rather than a number: the nearest seat that lands is
  **(+20, +40), hang -0.08, toe mean -0.38, deep 0.9** — and the flattest,
  (+60, -20), has footprint relief **3.6 m against 74.1 today**. Both are 45-63 m
  off `n_crestholm`, and Ostium Gorge is a **parking bay**, which is a thing that
  is beside a road by definition. Moving it turns a lay-by into a clearing. That
  trade is a content call, not a seating one, so it is written here rather than
  taken. `balouve_mines` is a dungeon mouth and cannot move at all.
- The tarn water surface reads as a dense white foam mottle across the whole
  body at `maidenwater` — visible in `tmp/shots/fishcam2/maidenwater.jpg`. That
  is `Water`/`Shore`, not `PoiKits`.
- **`gradePad`'s steep faces are smeared by construction, and the cause is one
  line.** The pad writes **world-planar XZ** UVs — `uv.push(ct * s, st * s)` in
  `Wear.ts` — so a face's UV varies with its RADIUS and not with its height. On
  the `cliff` branch the radius moves 1.6 m while `y` drops up to 26, which is a
  16:1 vertical stretch; on any steep batter it is several to one. Both reviews
  of these pads independently described "finely vertical-striated", "smeared",
  "stretched UVs, not rock", "pasted on" — that is this, and it is why a
  retaining wall reads as a curtain rather than as a wall. Visible in
  `tmp/shots/fierce/fierce_e.jpg`. A triplanar or an arc-length-plus-height
  parameterisation on the batter stations would fix it; `Wear.ts` is not this
  lane's file and the change touches every apron in the world.
- **The Tomb of the Mystic's mausoleum may be broken as well as steep.** Read
  from bearing 165 the pediment appears to hover with two column shafts ending
  in mid air. `_tomb`'s `shaft(..., broken)` deliberately snaps ~16% of columns
  to a 1.7-4.0 m stump, so this is *probably* the authored ruin seen at 2% of
  frame through the Disc — but it was seen twice and is written down rather than
  waved off. A close capture would settle it in one frame.

## Files

- `src/world/props/PoiKits.ts` — `_waterLine` (new), `_fishing`, `_fishingDry`.
- `src/world/map/WorldMap.ts` — three pin positions, each with its measurement.
- `src/tools/probes/fishdeck.mts` — rewritten to measure built geometry.
- `tmp/probes/poiseat.mts`, `tmp/probes/poicam.mts` — scratch, and worth keeping
  if anyone picks up `crestholm_inlet`: the first ranks candidate seats by real
  rebuilt geometry, the second finds a camera bearing that is not inside a hill.
