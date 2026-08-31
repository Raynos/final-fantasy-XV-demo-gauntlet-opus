# Lane 19 — City hubs (Lestallum, Galdin Quay)

Status: **items 66, 67 and 68 landed and measured.** 2026-08-31. Plan items 66–68 of
`docs/plans/2026-08-30-fable-to-nine.md`.

## Landed

### 66 · H2 anchors — `ca8929e` (lane 18 unblocked)

`src/world/props/PoiKits.ts`:

- `KitResult.anchors?: Record<string, [number, number, number]>` — kit-local
  (post-yaw, pre-position). **Plain number triples**: the value rides
  `bakedParts`' `meta` through `JSON.stringify` into `geo.bin.gz`, so a
  `Vector3` would work on the run that built the cache and come back
  method-less on every run that read it.
- `BuiltSite.anchors`; `PoiKits.anchorAt(poiId, name, out?)` → world `Vector3`
  or `null`; `PoiKits.anchorNames(poiId)`.
- `export const PLAZA_Y = 0.675` — walkable top of a `_town` plaza disc.
- `_town` publishes 19: `plaza`, `stall0..5` (1.1 m clear of each counter,
  through the stall's own `place` matrix), `light0..5` (bulbs), `edge0..5`
  (free pavement between stalls, r 9.6).
- `geo.bin.gz` re-baked after the commit. **Verified** by
  `src/tools/probes/cityanchors.mts`.

**A caller must late-bind.** `_make` runs when the camera comes within
`BUILD_R`, so `anchorAt` is `null` at `init` for every unvisited site.

### The instrument — `615cdf8`

`src/tools/probes/cityanchors.mts`. Resolves every anchor and asks whether a
person could stand on it. It does **not** use `standingroom.mts`'s
bounding-box test: a POI compound is merged per material, so
`town_poi_render4` is one buffer whose box is the whole 92 m footprint and
every point in Lestallum, the middle of the square included, reads "inside a
building". It walks the position attributes instead and counts surfaces
between knee and head height in a 0.55 m cylinder, with eight compass
approaches at 1.6 m.

Three exclusions were needed and each read exactly like a wall: an
`InstancedMesh`'s `position` attribute is the template at the geometry origin
(the copies live in `instanceMatrix`), Noctis' hair is 39,484 vertices, and
the three companions are unnamed un-skinned meshes. The party is now moved
300 m off before anything is sampled.

**Measured result (verified):**

```
Lestallum   19 anchors, 4 blocked: edge0, edge1, edge5, stall5
Galdin Quay 19 anchors, 1 blocked: edge4
plaza and the remaining stalls: OPEN, 8/8 approach, in both cities
```

A block of Lestallum's street grid leans into the square. **Nothing in this
lane places on those five**, and if `_town` changes the probe must be re-run
and the tables in `CityHub.CITIES` and `Npcs.CITY` re-checked.

### 67/68 · `CityHub` + shops — `4de578e`, wiring `ef1055e`

`src/world/town/CityHub.ts` (new) does Hammerhead's integration job against
the kit rather than a hand-authored local frame. It **late-binds** in
`update`. `_registerScreens` keeps Hammerhead's early-return guard, which is
what makes a second caller of `shop`/`hunts` safe.

On the ground now:

| city | verb | anchor | what |
|---|---|---|---|
| Lestallum | Shop | stall0 | Partellum Market (`partellum`) |
| Lestallum | Eat | stall1 | Surgate's Counter — three meals, `party.addBuff` |
| Lestallum | Shop | stall2 | Surgate's Beanmine (`beanmine`) |
| Lestallum | Shop | stall4 | Forge & Filigree (`forge`) |
| Lestallum | Rest | edge2 | The Leville — `leville_std` + `leville_deluxe` |
| Lestallum | Hunts | edge3 | Duscae Bounty Ledger (board #2) |
| Lestallum | View | edge4 | The Lookout (the Meteor; photo spot) |
| Galdin | Shop | stall0 | Mother of Pearl (`pearl`) |
| Galdin | Shop | stall3 | Dino's Bench (`dinos_bench`) |
| Galdin | View | stall5 | Angelgard (photo spot) |
| Galdin | Read | edge0 | Ferry bell — SERVICE SUSPENDED · ACCORDO LINE |
| Galdin | View | edge1 | The Causeway (photo spot) |
| Galdin | Rest | edge2 | Reception — `galdin_std` + `galdin_pearl` |
| Galdin | Read | edge3 | Fishing notice → Galdin Shoals |
| Galdin | Hunts | edge5 | Coastal Bounty Ledger |

**Rest is one interactable per city with both tiers as choices**, not two
interactables — the brief's "2 Rest per city" is delivered as two rows in one
conversation, because a hotel with two prompts on its door is worse. Flag if
the coordinator wants it literal.

`src/world/town/Shops.ts`: Culless capped at `price <= 2500`; five new rows —
`partellum`, `forge` (its exact complement, `> 2500` / accessories `> 1500`),
`beanmine`, `pearl`, `dinos_bench`. Dino's three commissions are
`sages_stone` / `obsidian_torque` / `hypno_crown` and **not** `moogle_charm`
or `ribbon`, which are priced 0 in the item table — a 0-gil shop row is a
free Ribbon.

The festoon: `_town` leaves six unconnected spheres 4.4 m up, which after
dark is six floating dots. `CityHub._festoon` strings catenaries between
them (9% sag, a bulb per segment) on its **own** emissive material — not
`PoiMats.lamp`, which six kits share — plus one warm point light per square
on the night ramp. Two draws per city.

### NPCs — `fd94f1c`, and the frame fixes in `26c0c1f` / `0c84ecb` / `bb1f622`

29 bodies, 5 new archetypes (`sania`, `navyth`, `coctura`, `verdough`,
`surgate`); the 18 ambient re-use `trucker`/`traveller`/`mechanic`/`kid`
because `archetype()` caches geometry, the painted face and the eye material
per cast key. `RemoteNpc` gains `anchor` and `off: [along, side]` in the
frame *anchor → plaza*, plus `key`/`seed`/`route`/`pause`/`speed`.
`Npcs._pads` fixes the 0.675 m plaza sink. LOD boundary 38 m → **25 m** (eyes
off) and 85 m → **60 m** (hidden).

Randolph moved from the `lestallum_lookout` car park onto his forge on the
square — which is where `side_gemstone_run` always said he was.

## Measured — all verified, each gate run individually, no `pnpm run check`

`citydraws.mts`, this lane's own instrument, at `bb1f622`:

```
                     calls   npc colour   bodies     budget: 800 / 60 / 12
lest_market_day        720       59         11
lest_market_dusk       715       59         11
lest_festoon_night     730       59         11
lest_crowd             693       59         11
galdin_pier_sunset     480       59         11
galdin_square_day      485       59         11
galdin_festoon_night   482       59         11
```

Draw counts, not timings, so the eight-lane load on the box does not make them
suspect the way a frame time would. **The tree was not quiet.**

Before the crowd budget the same probe read **18 bodies, 159 npc colour draws
and 949–973 calls**. A tighter distance LOD is why they were already that low
and is why they could not go lower: a market square is 22 m across, so every
body in it is inside any threshold you would set for the people you are
actually looking at. So the crowd is ranked and the budget spent nearest-first
— `CROWD_DETAIL` 3, `CROWD_MAX` 11, `CROWD_FAR` 60 m in `Npcs.ts`. **Both
constants are measured, not derived:** the arithmetic said 4 and 12 came to
sixty and it measured 68, because a LOD-0 body also shows its shadow proxy and
an outfit can split across material groups. Re-measure rather than re-derive if
the rig changes.

`questaudit` — **0 unsatisfiable objectives**, every new row `ok`.
`integration` — **27 pass · 0 wired-but-unproven · 0 not integrated**,
including "all 83 objectives across 37 quests are satisfiable". The one red
lane 17 handed over, `gald_ferrybell->npc_navyth`, is fixed at `bb1f622`:
Navyth stood on the ferry bell's own anchor and a `Talk` at priority 3 beats a
`Read` at 0, so the bell could never be selected by walking up to it.
`cityanchors` — unchanged: Lestallum 4 blocked, Galdin 1, nothing placed on
those five.

## Quests — landed at `26c0c1f`

`city_lest_arrival`, `city_lest_market`, `city_lest_lights`,
`city_gald_postcards`, `city_gald_catch`, plus a hand-in objective on
`side_scraps` now that Sania is a body.

**`side_power_play`, `side_gemstone_run` and `side_legendary_fish` needed no
re-key at all.** Their `giver` and their `talk` targets were already `holly` /
`randolph` / `navyth`, already waypointed at `at('exineris')` /
`at('lestallum')`. The rows were right and the people were missing, which is
the shape of this entire lane. Nothing is keyed to `gate:`.

## Left to do

1. **EXINERIS steam and awning variance** — the last third of item 67, not
   started, and the lowest-value third. Awning variance lives in
   `PoiKits._town`, which this lane has spent its one commit on. Steam can be
   built in `CityHub`'s own group without touching anyone else's file: derive
   the town yaw from the anchors (`u = normalize(light0 - plaza)`,
   `v = (-u.z, u.x)`), and the kit's chimney stack is at `plaza + 22u - 18v`,
   34 m tall.
2. **The ground under both cities is a flat, untextured plane in every frame**
   and is now the weakest thing about them — see below. `PoiKits` `M.concrete`
   and `M.gravel`; not this lane's file.
3. Lane 21's fourteen framings, listed below.

## What the frames showed — 2026-08-31, `tmp/shots/l19-d` (and `-a`/`-b`/`-c`)

Each of these was captured and read.

- `lest_market_day` — the square is inhabited: three bodies at three depths, a
  festoon strung across the frame, market stalls reading as stalls. **The
  pavement is a flat cream plane with no texture at all**, which is the one
  thing dragging the frame down and is the kit's material, not this lane's.
- `lest_festoon_night` — the intended signature: a run of warm bulbs over the
  square with a warm wash on the building faces under them, three people
  separated in silhouette. At the first attempt the bulbs clipped to hard white
  (`0.25 + night*4.2`) and the square was blue with white dots; **1.9 keeps the
  amber** and the plaza lamp at 4.2 m / 120 puts a pool under the string.
- `galdin_pier_sunset` — the best frame of the lane: eight people at golden
  hour, warm rim light, long shadows, lights over the boards. Two pairs read as
  one four-armed person at 1.55 m separation and are clear at 2.2 m.
- `galdin_square_day` — the bulbs read as well-formed warm globes at close
  range and the crowd is evenly distributed; the plaza is again a flat plane.
- `lest_market_dusk`, `lest_crowd`, `galdin_festoon_night` — same read, no new
  defect.

**Not verified by eye:** the `Eat` conversation, the two lodging conversations,
the ferry bell and the three `View` verbs have been proven to *register* and to
be selectable (`integration`, 65/65 reachable) but nobody has read the cards.

## Framings lane 21 should shoot (deliverable)

Fourteen, seven per city. Coordinates are world-space and were taken off the
live anchors; `plaza` is Lestallum `(-2960, 121.2, -700)` and Galdin
`(2330, 14.0, 2380)`.

**Lestallum** (the square's clear side is toward −x/−z; the block that leans
in is on the +x side, so keep it behind camera)

1. `lest_market_day` — eye height on the square, stalls across frame, 10.5 h.
   From about `(-2966, 122.6, -706)` looking at `(-2957, 121.9, -697)`.
2. `lest_market_dusk` — same, 19.0 h, for the raking light on the awnings.
3. `lest_festoon_night` — 21.5 h, low, framing two or three catenary runs
   against the dark block. **The signature night shot of the lane.**
4. `lest_forge` — Randolph at `stall4` over his rack, ~4 m, 16 h.
5. `lest_lookout` — from `edge4` out over the shelf toward the Meteor
   (`-1020, -2160`), 17.5 h. Wide, aerial perspective doing the work.
6. `lest_crowd` — the walkers crossing the square, mid-tele, 12 h, to show
   the city is inhabited rather than dressed.
7. `lest_sania` — Sania at `edge2` with her jar, 0.9 m, `framecam` follow.

**Galdin Quay**

8. `galdin_pier_sunset` — 18.1 h, the square with the sea behind it.
9. `galdin_pearl` — Coctura at `stall0`, the kitchen, 12 h.
10. `galdin_navyth` — Navyth folded over the rail at `edge0`, from behind and
    to the side so the sea is the background, 17 h.
11. `galdin_bell` — the ferry bell close, 9 h, hard morning light.
12. `galdin_angelgard` — from `stall5` out to the island, dusk.
13. `galdin_festoon_night` — 21.5 h, festoon over water.
14. `galdin_causeway` — from `edge1` along the boards, 16 h.

## Cross-boundary / residue

- **`project/TASKS.md` (lane 10):** `ShopScreen` has no per-shop sell
  multiplier. `TOWN_SHOPS.pearl` wants `sellMult: 1.4` honoured in `rows()`
  and `accept()`. Not blocking — Coctura's premium is implemented in her
  dialogue instead — but the shop screen is the right home for it.
- **`project/TASKS.md`:** `PhotoScreen.subjects()` can only emit `meteor`,
  `beast`, `party`, `vista`. A city photo objective can therefore never name
  a *place*. Two of the fourteen framings above are "photo spots" that no
  objective can distinguish.
- **`project/TASKS.md`:** the third entry filed is the measured finding that a
  block of Lestallum's street grid stands inside its own market square and
  costs four of the nineteen anchors `_town` publishes. Fixing it in the block
  loop would give both cities four more usable anchors.
- **`HUMAN_REVIEW.md`:** nothing.

## Files owned / touched

Owned: `src/world/town/CityHub.ts` (new), `src/world/town/Shops.ts`,
`src/characters/npc/Npcs.ts`, `NpcCast.ts`, `NpcDialogue.ts`,
`src/tools/probes/cityanchors.mts` (new), `src/tools/probes/citydraws.mts`
(new), `src/game/rpg/Quests.ts` rows (after lane 17's release at `ff695f8`).
One commit each, by agreement: `src/world/props/PoiKits.ts` (H2 anchors,
`ca8929e`) and `src/game/Game.ts` (six-line boot registration, `ef1055e`).

Commits: `ca8929e` `615cdf8` `4de578e` `ef1055e` `fd94f1c` `8b986e3` `26c0c1f`
`0c84ecb` `bb1f622`.

---

## Respawn 2026-08-31 — the sunk feet

**Root cause found, fixed and measured. It was never a constant.**

Lane 18 read `tmp/shots/l18c/plaza_down.jpg` and reported every Lestallum body
sunk ~20 cm into the plaza deck; lane 21 photographed it twenty-one times and
called it "cut mid-shin, no shoe"; the coordinator's hypothesis was that the
site's Y depends on approach order and that `PLAZA_Y` was not being used.

**All three readings of the cause were wrong, and the evidence says so:**

- `probes/cityfeet.mts` (new) walks the **triangle that contains each body's
  (x, z)** — a vertex search is not good enough and cost the first run, because
  the disc's top face is a 40-way fan whose only vertices are the centre and
  the rim. Every body on the disc measured **sink 0.000 against
  `town_poi_paving`**, by both approach paths (player teleport, and the
  camera-only path `framecam`/`shoot` take).
- Hiding the paving disc, hiding the whole POI compound (344 meshes) and hiding
  every mesh in the scene that is not a person (792) all left the legs cut in
  the same place. So no single surface was the occluder.
- A **12-degree lens on one body's boots from the same camera** showed the
  boots complete, on the flags, at the same distance and LOD as the wide frame
  that showed them cut.

The reconciliation is that **it is per-body, not per-city**: in one frame three
people are cut by half a metre and nine are perfect. `cityfeet` with a
five-point *footprint* sample (a plinth edge running between somebody's boots
is the case a centre sample misses) named all nine:

```
lest_a lest_c surgate gald_b dino_bench   0.810  a stall counter / bench top
verdough lest_kid lest_w2               0.500  a building plinth
gald_e                                  1.067  inside a wall
navyth                                 -0.189  floating on the plinth's batter
lest_f 0.741 / lest_g 0.160 (buried)           the graded apron, see below
```

Every one was authored one to two metres off a **stall** anchor — and a stall
anchor is already 1.1 m clear of its own counter, so a side offset of 1.5–2.6 m
walks straight back into the stall's bench or the block behind it. It is a
placement bug, not a height bug, and a tuned constant would have "fixed" one
capture and left the rest.

### Landed

- `647a874` — **the city ground model is the built deck, not the heightfield.**
  `_pads` is now a disc *with a rim* (flat to `r`, a ramp to `y2` at `r2`) that
  **replaces** the terrain rather than being maxed against it, because
  `gradePad` cuts as well as fills; it carries the plaza (r 11, `PLAZA_Y`), its
  batter (11 → 11.9) and the graded apron (`APRON_R` 30 m at `base`). It is
  **re-derived from the live anchor on every `_anchorFrame`** and every body
  **re-plants every frame** through the new `_plant`, so a site rebuilt at a
  different `base` can no longer leave the crowd behind — that is the
  approach-order hazard, closed by construction rather than by a number.
  Measured: `lest_f` 0.741 → 0.000, `lest_g` 0.160 → 0.000.
- `2e3cc07` — `_clearSpot`, which asks `CollisionWorld.groundDisc` at placement
  whether anything solid is within 1.1 m above the feet, and slides the body
  along sixteen bearings at three radii. **It is a no-op today** — see the
  residue below — but it costs nothing and becomes the durable fix the moment
  the city props are in the collision world. Navyth also comes off the batter.
- `8a24bb3` — the nine offsets, moved and re-measured: 3 m toward the plaza and
  about a metre to the side, which is where a market vendor actually stands.
  **26 of 29 bodies at sink 0.000.**
- The `CITY` docblock now says the offsets are measured: move a row, re-run
  `cityfeet`, the number to get to is `0.000`.

### Verified by eye

`tmp/shots/l19-fix1/lest_feet.jpg`, lane 18's exact framing: the man in purple
now stands on his boots on the flags (he was cut at mid-calf in
`tmp/shots/l19-feet3`, same framing, one commit earlier), and so does the woman
by the wall. One body in the foreground was still cut at that commit and is one
of the three below.

### Closed, measured at HEAD

```
probe.mts src/tools/probes/cityfeet.mts
  Lestallum  18 bodies within 30 m of the square, every one sink 0.000
  Galdin Quay 11 bodies, every one sink 0.000
```

**Verified by eye at `7059133`, `tmp/shots/l19-fix2`:**

- `lest_feet` (lane 18's exact framing) — five bodies, every one standing on
  its boots on the flags with a contact shadow; the woman in the near
  foreground, who was cut at the knee two commits earlier, is whole. The crowd
  now leans a little toward the camera side of the square, which is the cost of
  moving nine rows toward the plaza and is worth watching in `lest_market_day`.
- `gald_eye` — six bodies, all with boots on the pavement, nobody clipped.
- `lest_eye`, `gald_feet` — same read, no new defect.

### Gates run at `7059133` (individually — the coordinator owns the suite)

```
cityfeet     Lestallum 18 bodies, Galdin 11, every one sink 0.000
citydraws    lest_market_day 720 calls / 59 npc colour / 11 bodies   (budget 800 / 60 / 12)
             galdin_festoon_night 482 / 59 / 11 — unchanged by this work
integration  26 pass · 0 wired-but-unproven · 1 not integrated
             the one FAIL is `tomb_tomb_rogue->nothing`, a royal tomb from
             lane 18's `Tombs.ts`, not a city row. 1/86 unreachable; every city
             interactable including `gald_ferrybell` is reachable.
citysight    see the residue below
```

The tree was **not** quiet — eight lanes capturing — so these are draw counts
and pass/fail, never timings.

### Left

1. **EXINERIS steam and awning variance** — the last third of item 67, not
   started. The recipe is in the section above.
2. The three items in the residue below are not this lane's files.

### Residue for `project/TASKS.md`

**The city POI compounds are not in `CollisionWorld` at all.** `groundDisc` at
every one of the twenty-nine city bodies returns `onProp false` and a height
**0.7-1.1 m below the pavement they are standing on** - raw terrain. So the
player walking into Lestallum or Galdin Quay walks at terrain height, under the
square's own deck, and nothing built there can be stood on. It is why
`_clearSpot` cannot see a bench, and it is a gameplay defect well outside this
lane. Numbers: Lestallum deck 121.215, collision 120.12-120.84 across eighteen
sample points; Galdin deck 14.012, collision 12.86-13.48.

**Both squares are shut in, and Galdin Quay is 712 m from the sea.**
`probes/citysight.mts` (new) stands in the middle of each square and walks
sixteen bearings outward to the first surface between knee and head height:

```
Lestallum   reach min 4.0  median 5.5  max 16.0 m   16/16 bearings block inside 20 m
Galdin Quay reach min 5.5  median 9.0  max 16.5 m   16/16 bearings block inside 20 m
Galdin: nearest water body 712 m away at 46 deg, level -6.5, ocean 1956x1788;
        the plaza deck is at 14.0 and that bearing is clear for 5.5 m
```

Most of the near blocking is the square's **own furniture** - six stalls on a
7.8 m ring and six light poles - so it is not all the block plan. But a camera
cannot back out past ~6 m on fourteen of sixteen bearings at either city, which
is lane 21's finding with numbers on it. And **the sea is not a framing problem
at Galdin**: the POI pin is 712 m inland of the coastline and 20 m above it, so
no camera on that square can see water. `galdin_pier_sunset` and
`galdin_angelgard` need a camera on the coast, not on the square. Both of these
are content calls for the coordinator; neither is fixable in this lane's files.

