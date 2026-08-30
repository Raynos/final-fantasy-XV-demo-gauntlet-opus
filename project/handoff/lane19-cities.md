# Lane 19 — City hubs (Lestallum, Galdin Quay)

Status: IN PROGRESS, 2026-08-30. Plan items 66–68 of
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

### NPCs — commit pending (blocked on another lane's `src/characters/rig/Materials.ts`, which is mid-edit and does not parse)

29 bodies, 5 new archetypes (`sania`, `navyth`, `coctura`, `verdough`,
`surgate`); the 18 ambient re-use `trucker`/`traveller`/`mechanic`/`kid`
because `archetype()` caches geometry, the painted face and the eye material
per cast key. `RemoteNpc` gains `anchor` and `off: [along, side]` in the
frame *anchor → plaza*, plus `key`/`seed`/`route`/`pause`/`speed`.
`Npcs._pads` fixes the 0.675 m plaza sink. LOD boundary 38 m → **25 m** (eyes
off) and 85 m → **60 m** (hidden).

Randolph moved from the `lestallum_lookout` car park onto his forge on the
square — which is where `side_gemstone_run` always said he was.

## Left to do

1. **The eight city quests.** `Quests.ts` is lane 17's. The rows are written
   out below under **FOR LANE 17** — paste them after the spine.
2. **`npcdraws` / `drawcheck` measurement.** Not yet taken. Budgets: ≤60
   colour draws per city, ≤800 draws on city shots.
3. **Look at the frames with the crowd in.** Only the empty square has been
   looked at so far (see below).
4. **EXINERIS steam and awning variance** — plan item 67, not started, lowest
   value of the three.

## What the frames showed — 2026-08-30, `tmp/shots/l19-a`

- `lest_square_day`: the festoon cable and bulbs render and sag correctly;
  the framing is poor (half the frame is the grey block that leans into the
  square) and the plaza reads as a flat untextured plane at midday. **Not a
  frame to ship.**
- `lest_square_night`: the bulbs read as small dim dots and the pavement is
  moonlit blue, not warm. The festoon brightness and the plaza point light
  were raised afterwards (bulb 0.075→0.105 m, `0.25 + night*4.2`, point light
  70 at 44 m) — **not yet re-shot, not verified.**

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

## FOR LANE 17 — `Quests.ts` rows (paste after the spine)

Every objective target below is a **verified** key: `mt` is the bestiary key
for a trooper (`magitek_trooper` matches nothing), `sea_bass` and `old_book`
are real item ids, `sky_gemstone` is a real catalyst id, and the photo
subjects `PhotoScreen.subjects` can emit are exactly `meteor`, `beast`,
`party`, `vista`. `at()` throws at boot on an unknown POI id; `lestallum`,
`lestallum_lookout`, `exineris`, `galdin_quay`, `galdin_pier` and
`alstor_slough` all exist.

```ts
  {
    id: 'city_lest_arrival', type: 'side', name: 'The Grand Tour',
    region: 'cleigne', level: 30, giver: 'Iris', requires: ['main_ch4_lestallum'],
    summary: 'Iris has waited a year to show somebody her city. Let her.',
    objectives: [
      talk('iris', 'iris', 'Meet Iris at the Lestallum parking', at('lestallum_lookout')),
      buy('market', 'any', 'Buy something at Partellum Market', at('lestallum')),
      photo('shot', 'meteor', 1, 'Photograph the Meteor from the lookout', at('lestallum')),
      talk('coffee', 'surgate', 'Finish at Surgate\'s Beanmine', at('lestallum')),
    ],
    rewards: { gil: 1200, exp: 4200, ap: 8, items: [{ id: 'ulwaat_berries', count: 2 }] },
  },
  {
    id: 'city_lest_market', type: 'side', name: 'Sania\'s Shopping',
    region: 'cleigne', level: 30, giver: 'Sania', requires: ['main_ch4_lestallum'],
    summary: 'A field biologist with no time and a list of three things.',
    objectives: [
      fetch_('berries', 'ulwaat_berries', 1, 'Buy Ulwaat Berries at Partellum Market'),
      fetch_('stone', 'sky_gemstone', 1, 'Buy a Sky Gemstone at Partellum Market'),
      talk('back', 'sania', 'Take them back to Sania', at('lestallum')),
    ],
    rewards: { gil: 2400, exp: 5200, ap: 10, items: [{ id: 'rainbow_frog', count: 1 }] },
  },
  {
    id: 'city_lest_lights', type: 'side', name: 'The Lights Go Out',
    region: 'cleigne', level: 34, giver: 'Holly', requires: ['main_ch4_lestallum'],
    summary: 'A relay station on the shelf has stopped answering, and so have the two people sent to it.',
    objectives: [
      talk('holly', 'holly', 'Hear Holly out at the plant', at('exineris')),
      kill('clear', 'mt', 8, 'Clear the substation', at('exineris', -180, -240)),
      fetch_('relay', 'imperial_relay', 1, 'Recover the relay unit'),
      talk('back', 'holly', 'Report back to Holly', at('exineris')),
    ],
    rewards: { gil: 7500, exp: 11000, ap: 22, items: [{ id: 'topaz_bracelet', count: 1 }] },
  },
  {
    id: 'city_gald_postcards', type: 'side', name: 'Four Column Inches',
    region: 'leide', level: 10, giver: 'Dino', requires: ['main_ch2_galdin'],
    summary: 'Dino\'s column runs Thursday and he has nothing to run in it.',
    objectives: [
      photo('vista', 'vista', 3, 'Photograph Galdin Quay for Dino', at('galdin_quay')),
      talk('dino', 'dino', 'Show Dino the pictures', at('galdin_quay')),
    ],
    rewards: { gil: 2000, exp: 2400, ap: 8, items: [{ id: 'beautiful_bottle', count: 2 }] },
  },
  {
    id: 'city_gald_catch', type: 'side', name: 'A Table of Eleven',
    region: 'leide', level: 12, giver: 'Coctura', requires: ['main_ch2_galdin'],
    summary: 'The boat that brings Coctura her sea bass has decided it is a ferry now.',
    objectives: [
      fish('catch', 'sea_bass', 3, 'Land three Sea Bass at the Galdin Shoals', at('galdin_pier')),
      talk('deliver', 'coctura', 'Take them to Coctura', at('galdin_quay')),
    ],
    rewards: { gil: 3200, exp: 3400, ap: 10, items: [{ id: 'mega_potion', count: 3 }] },
  },
```

Three existing rows are **re-keyed rather than rewritten** — the givers now
exist as bodies in the right places, so only the waypoints need to agree:

- `side_power_play` — `giver: 'Holly'` already; leave it.
- `side_gemstone_run` — `talk('smith', 'randolph', ..., at('lestallum'))` is
  already right, and Randolph now stands there. No change needed.
- `side_scraps` — `giver: 'Sania'` already; Sania is now a body at
  `at('lestallum')`. Add a hand-in objective if you want it to close in
  conversation: `talk('sania', 'sania', 'Take the scraps to Sania',
  at('lestallum'))`.

## Cross-boundary / residue

- **`project/TASKS.md` (lane 10):** `ShopScreen` has no per-shop sell
  multiplier. `TOWN_SHOPS.pearl` wants `sellMult: 1.4` honoured in `rows()`
  and `accept()`. Not blocking — Coctura's premium is implemented in her
  dialogue instead — but the shop screen is the right home for it.
- **`project/TASKS.md`:** `PhotoScreen.subjects()` can only emit `meteor`,
  `beast`, `party`, `vista`. A city photo objective can therefore never name
  a *place*. Two of the fourteen framings above are "photo spots" that no
  objective can distinguish.
- **`HUMAN_REVIEW.md`:** nothing yet.

## Files owned / touched

Owned: `src/world/town/CityHub.ts` (new), `src/world/town/Shops.ts`,
`src/characters/npc/Npcs.ts`, `NpcCast.ts`, `NpcDialogue.ts`,
`src/tools/probes/cityanchors.mts` (new).
One commit each, by agreement: `src/world/props/PoiKits.ts` (H2 anchors),
`src/game/Game.ts` (two-line boot registration).
