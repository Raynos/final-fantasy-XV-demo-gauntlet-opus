# The 30-minute arc — content in every direction, and two city hubs

Status: PROPOSED (2026-08-30, fable) — companion to
`2026-08-30-fable-to-nine.md` (its Part D points here). Designed from a
verified inventory of every playable system and a re-derived geographic survey
(live `WorldMap`/`RoadGraph`/`SpawnTables` tables, the real heightfield), not
from SCOPE.md — which is 7 days stale and both understates the game (fishing,
dungeon entry, set pieces, foraging, deposits all shipped since) and misses
its worst defect.

## §0 — The evidence this stands on

- **Spawn is (0,0), dead centre; nothing is farther than 4.2 min by car or
  ~26 min on foot.** "30 minutes in every direction" is bought with activity
  density, not distance.
- **The main story soft-locks at chapter 3, objective 3.** `sword_wise`
  (`Quests.ts:330`) is granted by nothing in the world — not shops (Culless
  filters royals), not chests, not forage, not drops. Chapters 4–5, six side
  quests, the Deadeye and Titan set pieces and the only royal arm are
  silently unreachable. `probes/mainchain.mts:70-72` false-passes it by
  granting the item to itself.
- **The POI `gate:` field has zero consumers** — grep hits only its
  definition. Every "ch4/ch6/ch7/ch8/ch13-locked" POI is reachable today; the
  locks were never wired. De-gating is free.
- **Hammerhead is the entire interactive game.** 8 prompts, 9 talkable NPCs,
  3 shops, the only hunt board, the only bed. The other 123 POIs — Lestallum
  and Galdin Quay included — register zero interactables.
- **Dungeons are half-built:** 3 enterable, lootable (18 chests), hazarded,
  mapped — and enemy-free. `Layout.encounters` (6 fights incl. 3 bosses) is
  consumed only by the map renderer.
- **The ambient loop is proven non-decaying** (28-min `longplay`: 0.79
  encounters + 2.9 pickups/min, flat) but the guided spine is ~12–15 min: ch1
  self-completes against the boot seed, ch2 is one drive, ch3 hits the wall.
- **8 of 37 weapons (all royal arms) are unobtainable**; the 10 royal-tomb
  POIs are geometry with no verb.
- The empty directions, measured: **due south is a 59.3° arc with zero
  POIs**; NE beyond 1.5 km is the largest void by area (the (4000,−4000)
  corner is 3.9 km from any named place); N ends at 1.6 km; SE has a
  0.5–1.5 km inner hole; SW has 20 POIs and zero resident territories.
- Sania and Navyth are quest-givers with no body anywhere in the world.

Rules inherited from the to-nine plan: measured negatives close items; no
section grows; disjoint file ownership; no new engine system where a table
row and a placement do the job. Perf: 800-draw budget (786 measured peak),
33 ms, everything procedural and deterministic.

---

# Part 1 — Spine repair (D1)

1. **Un-soft-lock ch3.** Replace the `sword_wise` fetch with `reach` Tomb of
   the Wise + a `Claim` interactable that grants it (mechanism §3.1); also
   seed `sword_wise` into Keycatrich's Imperial Vault chest
   (`Keycatrich.ts:109`) so either path settles. **Delete the mainchain
   self-grant shim in the same commit.** Files: `Quests.ts`, `Keycatrich.ts`,
   new `Tombs.ts`. S. Done: `mainchain` reaches ch5 without the shim.
2. **Stop ch1 self-completing.** Re-author `main_ch1_pauper` to acts the
   session performs: complete `hunt_sabertusks`, talk Cindy, buy one weapon
   (new one-line `'buy'` notify from `Inventory.buy`). Keep the mid-game seed
   — level 27 is a demo decision. S. Done: `questchain` shows ch1 needs ≥3
   real acts.
3. **The spine after repair, with minutes** (drive 24 m/s, sprint 7.4):
   ch1 Hammerhead loop 7–9 · ch2 Galdin 8–11 (+ hub, Part 5) · ch3
   Keycatrich 12–15 (two MT territories, dungeon fights per Part 4, vault,
   tomb claim) · ch3-Deadeye 7–9 · ch4 Lestallum 8+ (hub, Part 5) · ch5
   Titan 8–10. **Spine ≈ 50–65 guided minutes, from 12–15.**

# Part 2 — The eight sectors (D2)

New POIs are `WorldMap.ts` POIS rows using existing PoiKit types; roads are
`RoadGraph.ts` ROUTES rows (corridor carving is automatic); territories are
`SpawnTables.ts` rows anchored `near(poi,dx,dz)`. Light kits (haven, parking,
landmark, fishing) are ≤8 draws in-radius; one reststop ≈20–30. No sector
adds more than one non-light kit inside any 2400 m draw radius; `drawcheck` +
`perfpoi` gate every addition.

**S — "The Old South Road"** (the 59° void; flagship). Route 19, class
`track`, from Route 1 at ≈(−40,30) due south 2.9 km to a turning circle.
Five POIs along it: `threshold_stones` landmark lv8 (120,900) — leaning
Solheim milestones; `southwatch_haven` haven lv10 (−260,1400);
`saltgrass_flats` landmark lv12 (300,1900) — dry-lake pan with a wreck
field; `pilgrims_rest` reststop lv12 (−80,2600) — caravan + pump, the only
bed/save south of spawn; `old_kingsroad_end` parking (−60,2860).
Territories: `southroad_tusks` day lv8; `saltflat_graze` passive garula
lv12. SET_PIECE `king_of_the_flats` — bandersnatch lv24 at the pan, armed by
a new rank-3 hunt. Widen the existing lv46 `night_giant`'s window to
`nightDepth ≥ 0.4` so a first session can meet the sector's night finale.
Side quest `side_old_road` (Dave): reach the stones → fetch 3
`imperial_relay` (already in the road forage pool) → kill the set piece.
**Sector ≈ 32–38 min.** M. Gates: `roadcheck`, `reachcheck`, `fightshape`.

**NE — "Longwythe ascent + the graveyard"** (largest void). Route 20, class
`trail` — first use of the declared-unused class — from the trailhead up the
peak's shoulder to `peak_overlook` landmark lv10 (1250,−1600): vista trigger
+ photo site over the 373 m horn. Beyond: `crag_haven` haven lv18
(1500,−2100); `adamantoise_graveyard` landmark lv30 (2600,−2800) —
ribcage-scale bone arches (PartBuilder), the lore anchor for the existing
rank-10 `hunt_adamantoise` already sited at the peak; `graveyard_watch`
night territory lv30 (arachne/hobgoblin); `peak_coeurls` any lv24 on the
col. Side quest `side_the_graveyard` (Takka: photo + reach + kill 2 coeurl).
**≈ 30–34 min.** M.

**N — extend past 1.6 km.** Route 9 +1.2 km. `mencemoor_obelisks` landmark
lv20 (300,−2400); `northwatch_ruin` imperial lv26 (150,−3100) with garrison
territory (mt 3–4, sniper 1–2); `moor_haven` haven lv22 (520,−2700).
**≈ 30 min.** S/M.

**SE — plug the inner hole.** `washes_lookout` landmark lv6 (700,650) —
vista over the Three Valleys; `wash_pack` day territory lv8 (620,760); one
lightning micro-deposit (cap 20) at the lookout. **≈ 30 min with the Galdin
hub.** S.

**SW — enemies for the places (zero territories today).** Three rows, no
geometry: `prairie_verge` day lv12 sabertusk at Prairie Outpost;
`slough_shallows` any lv18 voretooth 3–4 guarding the Alstor dock fishing
spot; `fallgrove_dark` night lv24 goblin/bussemand at The Fallgrove.
**≈ 30–36 min.** S.

**E — connective tissue only.** `saulhend_overlook` landmark lv15 (2200,400)
between the 2.0 and 3.1 km beats; the sector's real gaps are the hubs and
the Balouve fights (Part 4). S.

**W — the ghost town at night.** `night_saxham` territory lv20 (hobgoblin
2–3) at Saxham Outpost + a `Read` lore plaque. S.

**NW — unlock, don't build.** 40 POIs exist; the sector's problems are the
dead gates (free), the tombs (§3.1) and Fociaugh's buried mouth (to-nine
lane 11). Add `disc_rim_overlook` vista trigger on the rim spur. S.

# Part 3 — The discovery layer (D3)

1. **Tombs → royal arms.** New `src/game/rpg/Tombs.ts` on the `Deposits.ts`
   register pattern: one `Claim` per tomb POI granting the matching arm + AP
   + area card. Name-matched pairs (wise, conqueror, clever, just, mystic,
   rogue); trident_oracle→Tomb of the Tall, sword_father→Tomb of the Fierce;
   Pious and Wanderer read "long since plundered" (lore + 6 AP). Eight
   unobtainable weapons become eight destinations across six sectors. M.
   Done: `reachcheck` visits 10, new `probes/tombclaim.mts` claims 8,
   `ArmigerScreen` shows them.
2. **Night danger on the road.** Wire the orphaned
   `RegaliaSystem.nightDanger()`: at `nightDepth > 0.5` roll the existing
   `daemon_pack`/`ronin_duel` roamers onto the road ahead + HUD warning +
   banter line. S/M. `longplay --night`.
3. **Deposits + forage.** Micro-deposits at the SE lookout and the saltflats
   (caps 20–32); add `old_book` to the south's `rock` pool so
   `side_scraps` stops being a blind grind. S.
4. **Vista/lore beats.** Every new landmark registers a `Triggers` place
   card; Saxham, the graveyard and the milestones get `Read` plaques. S.

# Part 4 — Dungeon enemies (D4)

`Dungeons` owns arming; the director stays dungeon-ignorant. On `enter()`,
walk `layout.encounters` and call one new public
`EncounterDirector.spawnAt(spec, pos, {interior: true})` — a thin wrapper
over the existing pack-spawn path (no patrol, no stream-out, leashed to the
room). Bosses route through the existing `BossFight` (the class the two
working set-piece hunts use). No respawn within a visit; reset on exit.
Files: `Dungeons.ts`, `EncounterDirector.ts` (+1 method). M. Done:
`combatloop` gains a dungeon round; Keycatrich's Magitek Commander dies in a
played run; `DungeonMap` markers match live enemies. (The unwired dungeon
map *screen* goes to `TASKS.md`, not here.)

# Part 5 — Two city hubs

**Lestallum** (−2960,−700, 2.1 min drive) and **Galdin Quay** (2330,2380,
2.9 min). Both already have full `_town` kit geometry — plaza, gabled market
stalls, strung lights, 52 m pad — parking where fast travel lands, named
NPCs standing outside, road-terminus placement at opposite ends of the map,
and **real FFXV plates for `compare.mts` PAIRING**. The cities exist as
sets; what's missing is inhabitants and verbs. (Runner-up weighed: a new
southern harbor town — 3–4× the cost of both upgrades combined, in a sector
Part 2 already fills. Deferred; the ledger name and a radio station slot are
reserved if ever funded.)

**H1 — de-gate (S).** Drop `gate:'ch4'` from Lestallum's row; re-key
`side_power_play`, `side_legendary_fish`, `side_gemstone_run` off the new
city quests. Then **delete or comment the `gate:` field repo-wide** as
unwired (D5 policy) so nothing ever silently starts enforcing ch13. Done:
grep still shows zero consumers; `integration` green.

**H2 — export town anchors (M, the one new mechanism).** `PoiKits._town`
computes stall/plaza/light transforms and discards them; publish them
(`anchors: {stalls[], plaza, gate, overlook}`) so NPCs and interactables
place on real pavement. `standingroom.mts` verifies.

**H3 — `town/CityHub.ts` (S).** One class per city, modeled on
`Hammerhead.ts:1000-1110`, registering against anchors; reuses the lazily
registered `shop`/`hunts` screens.

**H4 — Culless re-scope (S).** The Hammerhead van gains
`def.price <= 2500`; high-tier steel moves to Lestallum. One line,
cross-file commit flagged in the handoff.

## Lestallum — the working city

- **L1 vendors (M, three `TOWN_SHOPS` entries, zero new UI):** Partellum
  Market / Verdough — high-tier ingredients Takka lacks, `old_book` at 900
  gil (a priced escape from the forage grind), gemstones; buys ingredients/
  treasures. Forge & Filigree — weapons `price > 2500 && !royal`,
  accessories `> 1500`: where the 42 180-gil wallet goes. Surgate's
  Beanmine — "Eat" applies a recipe buff via `party.addBuff` for 300–1800
  gil, no engine change.
- **L2 lodging (S):** wire the **already-authored** `leville_std` (1 000,
  ×1.5) and `leville_deluxe` (3 000, ×2.0) rows via `rpg.restAt`.
- **L3 hunt board #2 (S):** plaza board opens the existing screen; ledger
  tabs (Old Lestif, Ezma) derive automatically. Ends the truck-stop
  monopoly on the game's real spine.
- **L4 population (M): 18 bodies.** Talkable 7: Iris, Randolph, Holly
  (re-anchored), **Sania embodied at the market**, Verdough, Surgate, board
  clerk. Ambient 11: shoppers ×4, EXINERIS workers ×3, Leville porter, kids
  ×2, tourist. All on existing `Npcs` postures/routes.
- **L5 quests (M):** `city_lest_arrival` "Streets That Never Sleep" (Iris,
  after ch2: reach → talk → photo at the lookout → talk Surgate);
  `side_power_play` re-keyed (Holly already stands at EXINERIS);
  `city_lest_lights` (Holly: kill mt ×4 at a new `substation_raid`
  territory ~300 m out); `city_lest_market` (Sania: fetch 3 wet-pool
  ingredients → talk; also takes over `side_scraps`); `side_gemstone_run`
  re-keyed (Randolph).
- **L6 dressing (S):** emissive night material on the kit's strung lights
  (the canonical night-shot payoff), awning variance, EXINERIS steam,
  Leville signage. No merged mass beyond signs.

## Galdin Quay — the resort

- **G1 vendors (M):** Mother of Pearl / Coctura — premium meals (1 200–
  2 800 gil, `addBuff`), sells sea-fish ingredients, **buys fish at 1.4×**
  (fishing finally pays). Dino's bench — 3 exclusive accessories, buys
  gemstones at premium.
- **G2 lodging (S):** wire existing `galdin_std` (5 000, ×2.0) and
  `galdin_pearl` (10 000, ×3.0).
- **G3 pier verbs (S):** ferry bell `Read` ("SERVICE SUSPENDED — ACCORDO
  LINE"), two photo-spot markers (Angelgard; the arch), signpost to the
  live `galdin_pier` fishing hole 90 m away.
- **G4 population (S): 11 bodies.** Talkable 4: Dino, Coctura, **Navyth
  embodied at the pier rail**, maître d'. Ambient 7: diners ×3 seated,
  porters ×2, anglers ×2.
- **G5 quests (S):** `city_gald_postcards` (Dino: photo ×2 → talk);
  `city_gald_catch` (Coctura: fetch 2 pier fish → talk);
  `side_legendary_fish` re-keyed to Navyth's body.

# Part 6 — Onboarding and wayfinding (D6)

1. **The decorative haven rock 15 m from spawn** (looks campable, no
   prompt): promote it to a real haven row — the south's gateway camp — or
   delete it. Promote. S.
2. **Map → autodrive (M).** `AutoDrive.setTargetPos` has no caller; add
   "Ignis, drive there" to `WorldMapScreen` for any road-reachable pin. 23
   parking POIs and every reststop become destinations. `roadcheck` +
   one new end-to-end map-picked drive assertion.
3. **Persist discovery fog (S).** Fog reseeds every boot
   (`WorldMap.ts:932`); serialise discovered ids (SAVE_VERSION 4).
4. With Part 1.2, all four boot-seeded quests require real acts;
   `side_engine_blade` stays tracked as the tutorial pointer.

# Part 7 — Shots: 32 new, 5 PAIRING rows (corpus 142 → 174)

**Ownership rule: `Shots.ts` has exactly one owner at a time.** The to-nine
plan's lane 3 (composition) owns it first for reframing; this plan's shot
task takes ownership after lane 3's re-baselines land. Every new shot gets a
measured noise floor on entry (to-nine lane 15).

Arc shots (18): `south_road_dawn`, `threshold_stones`, `southwatch_camp`
(night), `saltflat_setpiece` (dusk), `pilgrims_rest`, `peak_overlook`
(golden), `adamantoise_graveyard`, `graveyard_night`, `northwatch_ruin`
(storm), `mencemoor_obelisks` (night), `washes_lookout`, `saxham_ghost`
(night), `tomb_claim` (interior), `armiger_full` (UI, 8 arms),
`dungeon_keycatrich_fight`, `dungeon_balouve_boss`, `regalia_night_road`
(headlights, daemon ahead), `map_drive_there` (UI).

City shots (14): Lestallum — `lest_market_day`†, `lest_street_night`†
(strung lights — the signature), `lest_overlook_disc`†, `lest_plaza_walk`,
`lest_exineris`, `lest_leville`, `lest_market_vendor`, `lest_night_high`;
Galdin — `galdin_pier_sunset`†, `galdin_angelgard`†, `galdin_restaurant`,
`galdin_beach`, `galdin_pier_fishing`, `galdin_night_lanterns`.
† = joins `compare.mts` PAIRING against real FFXV plates — the judged set
grows by five, tying this content directly to the presentation 9.

Done: all 32 in the corpus, `nanscan` 0/174, floors measured for the five
judged entries.

# Part 8 — Budget, perf honesty, sequencing

| item | size | perf risk | gate |
|---|---|---|---|
| Part 1 spine | S+S | none | mainchain (shim deleted), questchain |
| Part 2 S sector | M | +1 reststop + 4 light kits ≈45–60 draws in-radius — `perfpoi` before/after | roadcheck, reachcheck, drawcheck, fightshape |
| Part 2 NE | M | 4 light kits + trail | roadcheck, drawcheck |
| Part 2 N/SE/SW/E/W/NW | S each | light | reachcheck, fightshape |
| Part 3 tombs | M | none | reachcheck, tombclaim (new) |
| Part 3 night / deposits / lore | S–M | none | longplay --night |
| Part 4 dungeon fights | M | interior-only | combatloop |
| Part 5 hubs (H1–H4, L1–L6, G1–G5) | ~5 M + rest S | **29 skinned rigs** — mitigations: ambient bodies share iris constants (resurrect the demoted iris-literal dedup from `TASKS.md` iff `npcdraws` forces it), no eye meshes past 25 m, ≤12 bodies per authored framing; `npcdraws` ≤60 colour draws per city; `drawcheck` ≤800 on all 14 city shots | uxcheck, integration, gameplay, npcdraws |
| Part 6 wayfinding | S+M+S | none | roadcheck + new drive assert |
| Part 7 shots | S | capture wall time +~23% | nanscan, floors |

RAM: the hubs add rigs and anchors, not merged mass — compatible with the
to-nine lane 12 cutting unreachable town verts, and skinWeight→Uint8 halves
the rig cost this adds. Discoverability bar: fast travel lands at parking;
the first prompt is visible from it; the `city_*_arrival` quests waypoint
the rest — no instruction, which is the playable-9 bar.

**Sequencing:** Part 1 + Part 4 + Part 6.1 first — they remove broken
feels, the instrument's currency. Part 2-S and 2-NE second (the voids).
Hubs parallel to sectors (disjoint files). Part 7 last, after lane 3's
re-baselines. **Cost: roughly 10–11 lane-lifetimes** (arc ≈6, hubs ≈4–5) on
top of the to-nine plan's waves; Part 2-S is the likeliest respawn.

**Out of scope, said once:** chocobo riding and swimming are engine systems,
not table rows — `HUMAN_REVIEW.md` if wanted. A southern harbor town is
deferred with its cost stated above.

## Definition of done

- [ ] `mainchain` completes ch1→ch5 with its self-grant shim deleted.
- [ ] Every sector's ledger holds ≥30 activity-minutes: S≈35 · NE≈32 ·
      N≈30 · SE≈30 · SW≈33 · E≈40 · W≈38 · NW≈45; spine 50–65.
- [ ] Both hubs: every vendor round-trips gil in the `gameplay` gate, both
      lodging tiers apply, board #2 accepts a hunt, all 8 city quests
      completable by a probe that does not self-satisfy `fetch`.
- [ ] All 8 royal arms claimable; dungeons fight back (`combatloop`).
- [ ] Corpus at 174, `nanscan` 0/174, draw peak ≤800 on every shot, both
      perf gates certify, `longplay` 30 min clean day and night.
- [ ] Archives with the to-nine plan when its Part D lanes report.
