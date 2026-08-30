# To nine — the one plan

Status: LOCKED (2026-08-30 13:22 CEST, fable — locked by the human).
**Nothing builds before tonight: lanes staff at ~02:20 CEST, 2026-08-31.**
Supersedes `2026-08-29-opus-to-nine.md` and absorbs
`2026-08-30-fable-content-arc.md` (both archived). Every claim was verified
2026-08-29/30 against the code at `66b354ad`, a fresh `--jpeg` capture, or a
re-derived live table — nothing here rests on a handoff's word.

**How this plan was built.** The opus draft audited clean on most single
facts but barely overlapped the judge: six of round 16's eight ranked tells
had no task, and the one proven hesitation lever (`vista_dawn`'s recipe)
appeared nowhere. This plan is ordered by the tells. A verified content
inventory then found: the main story soft-locks at ch3 on an item nothing
grants; the POI `gate:` field has zero consumers; Hammerhead is the only
settlement with a single interactable out of 124 POIs; dungeons are
enterable but enemy-free; due south is a 59° arc with zero POIs; all 8
royal arms are unobtainable. Parts D–E answer that. Human decisions folded
in at lock: the Meteor art round is funded (reversing the earlier decline),
chocobo riding and swimming are funded as engine work, and the standing
order after the first post-build judge round is **iterate to 9 or plateau**
(§3–§4: MEGA BUILD MODE — build everything first, judge after).

---

## §1 — The number

**Polish 9/10 = blind-critic hesitation ≥30%** on a 20-pair round with **≥2
frames called wrong** (`compare.mts`, shuffled control arm, round 16's
method). Today: 5%, 0 fooled — and the control arm separates, so the
instrument works.

**Playable 9/10 = a first-time player, no instruction, 30 minutes, fewer
than three things that feel broken.** Today unknown; the one human sample
found the mirrored steering in about a minute.

## §2 — Rules

1. **No section may grow.** Leftovers → `project/TASKS.md`, traps →
   `LANDMINES.md`, decisions → `HUMAN_REVIEW.md`.
2. **A measured negative closes an item** and counts as a win.
3. **Where an exit's instrument does not exist, building it is the lane's
   first task.**
4. **Ownership is disjoint by file.** Named cross-lane one-liners land as
   their own explicit-pathspec commits. Anything else touching another
   lane's file goes to `TASKS.md`.
5. **MEGA BUILD MODE (human decision at lock): no judging during the
   build.** Build order follows round 16's ranked tells as written. Each
   lane verifies only its own scope with its own instruments; judged rounds
   resume when everything is built.
6. **`Shots.ts` has exactly one owner at a time**: lane 3 (composition)
   first; lane 19 (content shots) after lane 3's re-baselines land.

## §3 — MEGA BUILD MODE: build first, judge after

Human decisions at lock (2026-08-30): **no pre-build judge round, no
pre-build playtest** ("I already did it and the game is pretty bad lol it
can't get worse" — that is the baseline, recorded). Everything in Parts A–E
builds in parallel waves of **6–8 lanes**; during the build the only
checking is each lane's own scoped instruments plus the standing gates
(`check`, `nanscan`, perf). When everything is built:

- **R1. Judge round 17** — the first post-build round. 20 pairs + shuffled
  control arm + the five new city PAIRING rows, round 16's method.
- **R2. One 30-minute human playtest** — no instruction, ranked
  what-felt-broken, via `HUMAN_REVIEW.md`.

## §4 — The standing order after the first post-build round

Locked by the human: **iterate to 9 or plateau.** If a round reports
hesitation < 30%, its ranked tells re-order into the next fix wave
automatically; further rounds follow the same loop. Stop only when the bar
is met, or when a full fix-wave moves the number by nothing (a measured
plateau) — either way, published. Same for the playtest bar: a session
reporting ≥3 broken feels queues its ranked list into lane 12, the fixes
land, and another session runs.

## §5 — For the coordinator who staffs this tonight

The human starts the build manually with a fresh agent at ~02:20 CEST.
Coordinator: read `CLAUDE.md`, `project/LANDMINES.md`, then this file — it
is the whole brief. Staff waves of 6–8; suggested composition, honoring
rule 4:

- **Wave 1:** lanes 1 (rig/), 3 (veg + `Shots.ts`), 4 (sky), 5 (terrain),
  17 (game/rpg + dungeons + map screen), 19 (town/CityHub + Shops + Npcs),
  10 (ui + vehicle), 13 (engine).
- **Wave 2:** lanes 2, 6, 7, 18, 11, 14, 15, 16.
- **Wave 3:** lanes 22 (chocobo), 23 (swim), 21 (content shots — only
  after lane 3 releases `Shots.ts`), 20 (Meteor — staff LAST), 12 (idle
  until R2).

**Serialization the lane split can't express:** `Quests.ts` is touched by
17, 18 and 19 — 17 owns it first; 18 and 19 land their quest rows after
17's spine commits (or hand rows to 17 as explicit-pathspec patches).
`PoiKits.ts`: lane 19's H2 anchor export is a small first commit; lane 18's
sector kits go after it. **Overrun cut order (human decision): lane 20
(Meteor) is cut first; everything else ships.** Each lane keeps
`project/handoff/<lane>.md` current and respawns from it at the ~3 h/150-
turn stop.

**Cold-start briefs: every lane has one at `project/handoff/lane-*.md`.**
Read yours before anything else — verified anchors (file:line), copyable
row formats, exact commands, a first-commit sequence, and the landmines
that apply. They were researched 2026-08-30 against `66b354ad`. Ownership
fix found during briefing: **lane 1 owns all of `src/characters/rig/`;
lane 2 owns `src/characters/` outside `rig/` plus `rig/Outfit.ts` and
`rig/Look.ts`** (the original split double-claimed Materials/Geo/
Character). Three more brief findings that correct this plan's text:
`uCloudSunGain`'s 0.42 is a dead constructor value — the live value is
`lerp(0.26, 0.20, overcast)` written every frame at `Sky.ts:1035-1036`
(edit the lerp); the 85.5 MB first-load figure came from `coldload`
navigating `?q=high`, which skips the geo fetch entirely
(`GeoBake.ts:261`) — not from a missing file; and route id `route19` is
taken ("Vesperpool Causeway") — the new roads are ids `route20`/`route21`.

---

# Part A — Presentation, in the judge's own order

## Lane 1 · Skin and hair *shading* — `src/characters/rig/`

Round 16, tell #1, corrected blind note: *"It is entirely a shading
problem."*

1. **Fix the winding first.** Probe-verified live: `Noctis_body` signed
   volume −6.7e-2 with 0% of front triangles facing +z; both eye meshes
   negative. Wrong normals corrupt every shading fix stacked on top. Name
   the eye meshes (`Character.ts:210` never does) and run the other three
   heroes.
2. **A subsurface cue.** A backlit ear staying flat opaque "is most of why
   the head reads as plastic". Wrap lighting / thickness-tinted rim; the bar
   is `hero_profile`'s backlit ear glowing red-warm.
3. **Skin-detail scale.** Pores "read as scratches scribbled across the
   cheek" — re-scale against a 1568 px read of `hero_portrait`.
4. **Hair: anisotropic highlight + edges.** Cards are already alpha-tested
   12–18 mm strips (`Hair.ts:647-675`); the judge sees "opaque hard-alpha
   shards, aliased edges, no anisotropic highlight". Add the aniso term and
   `coverageAA` on the hair material (`Materials.ts:799`).
5. **Why does blond render near-white?** Constants are already blond/taupe
   (`Cast.ts:493`) and the straw-specular fix landed (`Materials.ts:300-309`)
   — yet `hero_full` still shows two near-white heads. Diagnosis task.
6. **The painted creases and the mid-face diagonal** — confirmed at
   `hero_portrait`; damping is exhausted (pass 6 took 22–46%), re-derive
   against the visible surface. Done: `facecheck` green with lane 16's VOID
   fix in.

## Lane 2 · Costume — `src/characters/` except `rig/Face.ts`, `Hair.ts`

7. **Cloth folds.** `hero_full`: "flat-shaded clothing with no cloth folds".
   Shading-level folds; the sleeve's three surface passes are a recorded
   negative — if shading fails again, that negative ends it.
8. **Forward the shirt print's authored resolution — verified live bug.**
   `Cast.ts:193` authors `steps: 42, seg: 76`; `printPatch` re-sweeps at
   56×64 (`Outfit.ts:221,238`).
9. **The triangular skin hole at Noctis's collar** — confirmed in frame.
10. **Ignis at distance** — collapses in `party_formation`; value separation
    at 4 m+, not garment construction.

## Lane 3 · Near-field and composition — `src/world/veg/` seating + shot framing

The proven lever: `vista_dawn` is the only frame that ever made the judge
stall, and the bare bottom third survives in 19 of 20 frames.

11. **Grass, shrubs and saplings reaching into the lens** across the bottom
    third — `zone_longwythe`, `zone_vannath`, `zone_three_valleys`,
    `vista_dusk`, `zone_lestallum` first. Price draws with `vegcensus`.
12. **Fix the star-shaped grass billboards at the party's feet.**
13. **Foreground occluders** — a branch over the top, a trunk on the left,
    per judged vista. This lane owns `Shots.ts` first (rule 6); every
    framing change re-baselines through `imgdiff` deliberately.
14. **Midground** — sparse, not empty (refuted claim); act only if round 17
    ranks it.

## Lane 4 · Clouds — `src/world/Sky.ts`, `src/world/sky/`, `src/shaders/clouds.glsl.ts`

Tell #2, deciding six frames on sight.

15. **Organisation** — streets, systems, a large cell beside a small one;
    macro-structure of the coverage field.
16. **A crisp sunlit top edge** — the mass "reads defocused"; separate work
    from 15.
17. **Internal dynamic range** — measured 0.87–1.06 stops, wants 2+. Levers:
    the `cRemap` pair (`clouds.glsl.ts:132,143`), `uCloudSunGain`
    (`Sky.ts:1036`) vs `uCloudMaxRad` 9.5. Negatives stand: not `uCloudTap`,
    not `MARCH_SCALE`, not exposure.

## Lane 5 · Light in shadow — `src/world/terrain/` (except `Field.ts`)

Tell #3 re-specified: no hatch exists — the real defects are missing blue
sky-fill, posterised darks, no mid-frequency geology.

18. **Sky fill in shadowed terrain.**
19. **De-posterise the darks.**
20. **Mid-frequency geology** in the verified ~0.65→300 m gap
    (`TerrainMaterial.ts:2094`, GTAO 0.62 m, `uHorizonMix` ~300 m).
21. **`zone_vannath`'s cloud-shadow floor** — measured p50 luma 10.9, core
    7.1; preset `shadowScale` 3.5 × `uShadowTile` 2700 → ~640 m patches.
    Done: same crop boxes ≥30/255, patches within 2× of their clouds.

## Lane 6 · Hue range — zone palettes

22. **One hue per frame** (tell #5; `zone_three_valleys` is "brown,
    entirely"). Build the sky-matched reference slice before chasing any
    channel number (`imagestats.mts:418`'s own caveat).

## Lane 7 · Water and weather — `src/world/water/`, `src/world/Water.ts`, `src/world/weather/`

23. **The sea is one slab** (tell #7: `zone_galdin`, `zone_vesperpool`) —
    depth ramp, shoreline interaction, wave-scale variation.
24. **Rain** (tell #8, `storm`) — density variation, splashes, ground
    interaction.
25. **Frame the unjudged water before fixing it** — no shot covers the
    Maidenwater or any river; probe framings first, then judge the tarn
    mottle and the river sheet (`RiverMaterial` already grew a 0.34 alpha
    floor — may be closed).
26. **`gradePad` V-from-height** — verified exactly (`Wear.ts:773`, 16.25:1),
    and `poi_haven` is judged. Owns `src/world/props/Wear.ts` for it.

## Lane 8 · Grain — one item, staffed inside lane 15

27. **Grain sits at full amplitude on flat sky** (tell #6) — modulate by
    luminance or mask the sky.

## Lane 20 · The Meteor — funded art round

Human reversal at lock (2026-08-30): previously declined, now funded.
`landmark_meteor` is a judged frame, "does not read as a meteorite", and
both engineering levers are measured negatives (the fissure glow has never
rendered — all 22 slabs are entombed). This is authored-art work on the
Disc: silhouette, crater material, exposed impact glow, whatever makes the
strike legible.

28. **Re-art the Disc as a glowing wound** (direction chosen by the human):
    exposed molten-blue crystal fissures in the crater, visible from the
    highway at night — pairing with the `lest_overlook_disc` judged shot.
    Done: a blind A/B of `landmark_meteor` against its plate hesitates in
    the next judged round — or the lane closes with a measured negative and
    the decision returns to the human. Size M/L. **First cut on overrun
    (§5).**

# Part B — Playable

## Lane 10 · Input truth — `src/ui/`, `src/world/vehicle/RegaliaSystem.ts`

29. **Fix the card, not the code** — 5 of 12 combat rows wrong; the correct
    table exists at `CombatSystem.ts:1458-1470`; `Prompts.ts:21` repeats two
    bad pairs; `ArmigerScreen.ts:239` contradicts the card.
30. **Key collisions** — T, B, V, F collide between combat and Regalia.
    Verify mode-exclusivity; rebind the Regalia side where live; document.
31. **A steering-sign gate** — `regaliadrive` takes `Math.abs(h1−h0)`; drive
    `KeyA`, assert the sign.
32. **The Armiger caption** — `--ink-4` at 0.34 alpha, no text-shadow
    (`ui.css:914`). Restyle. (The "two-column screens" claim names no real
    screen; find it from a capture or drop it.)

## Lane 11 · Fight shape — `src/combat/`, `src/game/encounters/`, `src/game/rpg/`

33. **Instrument first: `fightshape` computes no median** — add it.
34. **`enemyScaling` lies about itself** — JSDoc says party level; body is
    `nightScaling(hour, isDaemon)` (`RpgSystem.ts:720-721`). Implement or
    fix the doc, then tune.
35. **Pack size** — verified levers: `Pack.maxEngaged` 2 (wild 3, bosses
    3→4), `spawnRoamer` cap 3, counts [1,1]→[4,7]. 22 000 hp tops only the
    wild roster (Deadeye 34 k, MA 32 k); `LEVEL_LIFT` 1.0 is a comment, not
    saturation.
36. **Warp throughput** — re-measure first; the "3–12 casts" figure matches
    `dpsshare`'s distance labels, not casts.

**Exit:** median den 18–30 s, Noctis pays ≥15% HP, `combatloop` 31/31, both
perf gates certify. Today a wild den runs 5.8–17 s costing 0.8% HP — combat
has no danger.

## Lane 12 · The playtest's own list — reserved, unstaffed until R2 reports

37. **R2's ranked what-felt-broken becomes this lane's queue** — and §4
    keeps refilling it until the <3 bar is met. Named candidates that wait
    here rather than pre-empting it: Fociaugh's missing mouth (the apron is
    `fociaugh_menace`'s, 70 m away; `fociaugh` itself is excluded at
    `PoiKits.ts:2776-2795`; talus design in `e5557e5`'s message), Balouve's
    missing adit, Malacchi's missing pond (nearest water 133.5 m, 28 m
    below).

# Part C — Launchable (moves neither 9; gates the demo — the human's TODO)

## Lane 13 · Memory and boot — `src/engine/` except `postfx/`, plus the veg/props boot caches

38. **`skinWeight` → Uint8** (verified Float32×4, `Geo.ts:250`; ~15 MB —
    and it halves the rig cost Part D's NPCs add).
39. **`AttrPack` for the 115 streamed POI sites** (only Dungeons calls it;
    the one-line call lands in `src/world/Props.ts` — named cross-lane
    commit).
40. **Census the towns** — 3.70 M resident verts; merged per-material plus a
    670 k-vert shadow proxy. Remove the unreachable.
41. **Boot caches:** `Props.landmarks` → `bakedParts` (~46 ms); a cache
    shape for `Rocks`' two rootless `TileStream`s (~78 ms); cache
    `Vegetation.prime`'s *result* (610 ms — deleting it is a measured
    negative, 13.359/255).

**Exit: tab under 800 MB** (`bootprof --mem --play --prod`; the mem page
boots `?q=ultra`), from 1 246 MB.

## Lane 14 · First load — `src/engine/TexBake.ts`, `GeoBake.ts`, `src/tools/bake.mts`, `coldload.mts`

**Human decision at lock: the demo launches on a public URL** — this lane
is mandatory, and the DoD gains a deploy step.

42. **Instrument first:** `coldload` measures bytes to `GAME.ready`, not
    first frame — add the marker or re-spec the exit honestly.
43. **Tier the bake — the real number is ~116 MB over 6 requests** (the
    85.5/5 figure was measured the day `geo.bin.gz`, 30.8 MB, was missing).
    Deferring `texc` is not free — it feeds boot-path face bakes; low-res
    first tier or a repaint fallback. Done: **≤25 MB to first frame by task
    42's instrument.**

## Lane 15 · Idle CPU — `src/engine/postfx/`, `PostFX.ts`

44. **`post.render` is 74–77% of a 6.2 ms frame**; the cap helped 120 Hz
    only. Profile per pass, cut or gate. Includes task 27 (grain). Done:
    **idle <30% of a core at 60 Hz** (`idlecpu --q high --dpr 1.5`).
45. **RT budget** — 28 chain targets ≈130 MB by `bootprof`'s formula; the
    recorded 181/33 includes world-owned RTs and undercounts MSAA. Done: the
    walk reports <120 MB, corpus at floor.

## Lane 16 · Gates — `src/tools/`

46. **A bake-artifact gate** — none of `check`'s 23 gates looks at
    `src/public/baked/`; this gate is what would have caught the stale
    85.5 MB number.
47. **Make `facecheck`'s VOID a failure** — voided heads currently skip and
    PASS (`facecheck.mts:765-772`). Lane 1's exit depends on it.
48. **The NaN sweep** — unguarded `normalize(` / varying-base `pow(` across
    remaining shaders; findings to owning lanes via `TASKS.md`.

# Part D — Content: the 30-minute arc and two city hubs

Designed 2026-08-30 from a verified inventory of every playable system and a
re-derived geographic survey (live `WorldMap`/`RoadGraph`/`SpawnTables`
tables, the real heightfield). Spawn is (0,0), dead centre; nothing is
farther than 4.2 min by car or ~26 min on foot — **"30 minutes in every
direction" is bought with activity density, not distance.** The ambient loop
is proven non-decaying (28-min `longplay`: 0.79 encounters + 2.9 pickups/min,
flat); what's missing is destinations and guided beats. SCOPE.md is 7 days
stale and understates the game — fishing, dungeon entry, set pieces,
foraging and deposits all shipped since its stamp.

## Lane 17 · Spine, dungeons, wayfinding — `src/game/`, `src/world/dungeons/`, `src/ui/screens/WorldMapScreen.ts`

**D1 · Spine repair.**
49. **Un-soft-lock ch3.** `sword_wise` (`Quests.ts:330`) is granted by
    nothing — not shops (Culless filters royals), not chests, not forage,
    not drops; ch4–5, six side quests, the Deadeye and Titan set pieces and
    the only royal arm are silently unreachable. Replace the fetch with
    `reach` Tomb of the Wise + a `Claim` grant (D3), and seed `sword_wise`
    into Keycatrich's Imperial Vault chest (`Keycatrich.ts:109`). **Delete
    `mainchain.mts:70-72`'s self-grant shim in the same commit** — it
    false-passes exactly this bug. Done: `mainchain` reaches ch5 without it.
50. **Stop ch1 self-completing** against the boot seed (42 180 gil,
    pre-completed bounty): re-author `main_ch1_pauper` to this session's
    acts — complete `hunt_sabertusks`, talk Cindy, buy one weapon (new
    one-line `'buy'` notify from `Inventory.buy`). Keep the mid-game seed.
51. **The spine after repair, with minutes** (drive 24 m/s, sprint 7.4):
    ch1 Hammerhead loop 7–9 · ch2 Galdin 8–11 · ch3 Keycatrich 12–15 ·
    ch3-Deadeye 7–9 · ch4 Lestallum 8+ · ch5 Titan 8–10. **Spine ≈ 50–65
    guided minutes, from 12–15.**

**D4 · Dungeon enemies — the cheapest large content win.**
52. `Layout.encounters` (6 authored fights incl. 3 bosses) is consumed only
    by the map renderer. `Dungeons` owns arming: on `enter()`, call one new
    public `EncounterDirector.spawnAt(spec, pos, {interior: true})` — a thin
    wrapper over the existing pack-spawn path, leashed to the room; bosses
    route through the existing `BossFight`. No respawn within a visit. Done:
    `combatloop` gains a dungeon round; Keycatrich's Magitek Commander dies
    in a played run. (The unwired dungeon-map *screen* → `TASKS.md`.)

**D5 · Chapter gates.**
53. The POI `gate:` field has **zero consumers** — the locks were never
    wired. Drop `gate:'ch4'` from Lestallum's row, re-key its three side
    quests (lane 19), then delete or comment the field repo-wide so nothing
    silently starts enforcing ch13. Done: grep still shows zero consumers.

**D6 · Onboarding and wayfinding.**
54. **The decorative haven rock 15 m from spawn** (looks campable, no
    prompt): promote it to a real haven row — the south's gateway camp.
55. **Map → autodrive.** `AutoDrive.setTargetPos` has no caller; add
    "Ignis, drive there" to `WorldMapScreen` for any road-reachable pin. 23
    parking POIs become destinations. New end-to-end map-picked drive
    assertion.
56. **Persist discovery fog** (`WorldMap.ts:932` reseeds every boot;
    SAVE_VERSION 4).

## Lane 18 · Sectors and discovery — `src/world/map/`, `src/game/encounters/SpawnTables.ts`, `src/world/props/PoiKits.ts`, new `src/game/rpg/Tombs.ts`

New POIs are POIS rows on existing kit types; roads are ROUTES rows
(corridor carving is automatic); territories are `SpawnTables` rows. Light
kits ≤8 draws in-radius; one reststop ≈20–30; no sector adds more than one
non-light kit inside any 2400 m draw radius; `drawcheck` + `perfpoi` gate
every addition.

57. **S — "The Old South Road"** (the 59° void; flagship). Route 19
    (`track`) from Route 1 at ≈(−40,30) due south 2.9 km. Five POIs:
    `threshold_stones` landmark lv8 (120,900) — leaning Solheim milestones;
    `southwatch_haven` lv10 (−260,1400); `saltgrass_flats` landmark lv12
    (300,1900) — dry-lake pan with a wreck field; `pilgrims_rest` reststop
    lv12 (−80,2600) — the only bed/save south of spawn;
    `old_kingsroad_end` parking (−60,2860). Territories `southroad_tusks`
    day lv8 and `saltflat_graze` passive lv12; SET_PIECE
    `king_of_the_flats` (bandersnatch lv24) armed by a new rank-3 hunt;
    widen `night_giant`'s window to `nightDepth ≥ 0.4`. Side quest
    `side_old_road` (Dave). **≈ 32–38 min.**
58. **NE — Longwythe ascent + the adamantoise graveyard** (largest void).
    Route 20, class `trail` (first use of the declared-unused class) to
    `peak_overlook` landmark lv10 (1250,−1600) — vista + photo site.
    Beyond: `crag_haven` lv18 (1500,−2100); `adamantoise_graveyard`
    landmark lv30 (2600,−2800) — ribcage-scale bone arches (PartBuilder),
    lore anchor for the existing rank-10 `hunt_adamantoise`;
    `graveyard_watch` night lv30; `peak_coeurls` any lv24. Side quest
    `side_the_graveyard` (Takka). **≈ 30–34 min.**
59. **N** — Route 9 +1.2 km; `mencemoor_obelisks` landmark lv20 (300,−2400);
    `northwatch_ruin` imperial lv26 (150,−3100) + garrison territory;
    `moor_haven` lv22 (520,−2700). **≈ 30 min.**
60. **SE** — `washes_lookout` landmark lv6 (700,650) + `wash_pack` day lv8 +
    one lightning micro-deposit. **≈ 30 min with the Galdin hub.**
61. **SW** — three territory rows, no geometry: `prairie_verge` day lv12 at
    Prairie Outpost; `slough_shallows` any lv18 guarding the Alstor dock
    fishing spot; `fallgrove_dark` night lv24. **≈ 30–36 min.**
62. **E** — `saulhend_overlook` landmark lv15 (2200,400) only. **W** —
    `night_saxham` territory lv20 + a `Read` lore plaque at the ghost town.
    **NW** — unlock, don't build: `disc_rim_overlook` vista trigger; the
    sector's 40 POIs are carried by lanes 17/20 and the tombs.
63. **Tombs → royal arms.** New `src/game/rpg/Tombs.ts` on the `Deposits.ts`
    register pattern: one `Claim` per tomb granting the matching arm + AP +
    area card. Six name-matched pairs; trident_oracle→Tall,
    sword_father→Fierce; Pious and Wanderer read "long since plundered"
    (lore + 6 AP). Eight unobtainable weapons become eight destinations.
    Done: `reachcheck` visits 10, new `probes/tombclaim.mts` claims 8,
    `ArmigerScreen` shows them.
64. **Night danger on the road.** Wire the orphaned
    `RegaliaSystem.nightDanger()`: at `nightDepth > 0.5` roll the existing
    `daemon_pack`/`ronin_duel` roamers onto the road ahead + HUD warning +
    banter line. `longplay --night`.
65. **Deposits + forage + lore.** Micro-deposits at the SE lookout and the
    saltflats; add `old_book` to the south's `rock` pool (un-grinds
    `side_scraps`); every new landmark registers a `Triggers` place card;
    Saxham, the graveyard and the milestones get `Read` plaques.

## Lane 19 · City hubs — `src/world/town/`, `src/game/rpg/Shops.ts`, `Quests.ts`, `Npcs.ts`

**Lestallum** (−2960,−700, 2.1 min drive) and **Galdin Quay** (2330,2380,
2.9 min). Both `_town` kits already build plaza, gabled market stalls and
strung lights — **the cities exist as sets; what's missing is inhabitants
and verbs.** Both have real FFXV plates for PAIRING. (Runner-up weighed: a
new southern harbor town at 3–4× the cost of both upgrades; deferred with a
ledger name and radio slot reserved.)

66. **H2 — export town anchors** (the one new mechanism): `PoiKits._town`
    computes stall/plaza/light transforms and discards them; publish them so
    NPCs and interactables place on real pavement (`standingroom.mts`
    verifies). **H3** — `town/CityHub.ts`, one class per city on the
    `Hammerhead.ts:1000-1110` pattern. **H4** — Culless gains
    `def.price <= 2500`; high-tier steel moves to Lestallum.
67. **Lestallum:** three `TOWN_SHOPS` vendors — Partellum Market/Verdough
    (high-tier ingredients, `old_book` at 900 gil, gemstones), Forge &
    Filigree (weapons >2500, accessories >1500 — where the 42 180-gil
    wallet goes), Surgate's Beanmine ("Eat" applies a recipe buff via
    `party.addBuff`, 300–1800 gil). Wire the **already-authored**
    `leville_std`/`leville_deluxe` lodging rows. **Hunt board #2** at the
    plaza (ledger tabs derive automatically — ends the truck-stop monopoly).
    **18 NPC bodies** (7 talkable incl. **Sania embodied at last**; 11
    ambient on existing routes/postures). **5 quests:** `city_lest_arrival`
    (Iris; the tutorializing walk: market → lookout photo → Surgate),
    `side_power_play` re-keyed, `city_lest_lights` (Holly; new
    `substation_raid` territory ~300 m out), `city_lest_market` (Sania;
    also takes over `side_scraps`), `side_gemstone_run` re-keyed. Night-lit
    string lights (emissive material — the signature night shot), awning
    variance, EXINERIS steam; no merged mass beyond signs.
68. **Galdin Quay:** Mother of Pearl/Coctura (premium meals 1 200–2 800
    gil; sells sea-fish ingredients; **buys fish at 1.4× — fishing finally
    pays**) and Dino's bench (3 exclusive accessories, buys gemstones at
    premium). Wire `galdin_std`/`galdin_pearl` lodging. Pier verbs: ferry
    bell `Read` ("SERVICE SUSPENDED — ACCORDO LINE"), two photo spots,
    signpost to the live fishing hole. **11 bodies** (4 talkable incl.
    **Navyth embodied** at the pier rail). **3 quests:**
    `city_gald_postcards` (Dino), `city_gald_catch` (Coctura),
    `side_legendary_fish` re-keyed to Navyth.
    Perf, both cities: `npcdraws` ≤60 colour draws per city; ambient bodies
    share iris constants — resurrect the demoted iris-literal dedup from
    `TASKS.md` iff `npcdraws` forces it; no eye meshes past 25 m; ≤12
    bodies per authored framing; `drawcheck` ≤800 on all city shots.

## Lane 21 · Content shots — `src/game/Shots.ts` (ownership after lane 3, rule 6)

69. **32 new corpus shots (142 → 174), five joining PAIRING** against real
    FFXV plates — the judged set grows with the content.
    Arc (18): `south_road_dawn`, `threshold_stones`, `southwatch_camp`,
    `saltflat_setpiece`, `pilgrims_rest`, `peak_overlook`,
    `adamantoise_graveyard`, `graveyard_night`, `northwatch_ruin`,
    `mencemoor_obelisks`, `washes_lookout`, `saxham_ghost`, `tomb_claim`,
    `armiger_full`, `dungeon_keycatrich_fight`, `dungeon_balouve_boss`,
    `regalia_night_road`, `map_drive_there`.
    Cities (14): `lest_market_day`†, `lest_street_night`†,
    `lest_overlook_disc`†, `lest_plaza_walk`, `lest_exineris`,
    `lest_leville`, `lest_market_vendor`, `lest_night_high`,
    `galdin_pier_sunset`†, `galdin_angelgard`†, `galdin_restaurant`,
    `galdin_beach`, `galdin_pier_fishing`, `galdin_night_lanterns`.
    († = PAIRING row.) Done: all 32 in the corpus, `nanscan` 0/174, floors
    measured for the five judged entries. Capture wall time +~23%.

# Part E — Mounts and water (funded engine systems)

Human decision at lock: fund both. These are real engine work, not table
rows — sized honestly and staffed after Part D's first wave.

## Lane 22 · Chocobos — new `src/game/chocobo/`, `src/characters/`

70. **A free-form mount, summonable from minute one.** The
    `chocobo_whistle` item already exists — bind a whistle key + prompt; the
    bird runs in, mount/dismount anywhere sane (no water, no >50° slope).
    Locomotion ~11 m/s with a sprint burst — matching the speed the world
    map's ETA table already prices chocobos at (`WorldMap.travel()`), so the
    map instantly tells the truth. Rig via the `RigBuilder` patterns +
    gallop cycle; camera reuses the follow rig. **No unlock gate** — this
    is the fun/fast-movement layer from the very start.
71. **The chocobo posts become chocobo hubs.** Wiz Chocobo Post + Alpine
    Stable: `side_chocobo` re-keyed off the dead ch3-deadeye gate;
    cosmetics (color variants via the Cast pattern, bought with gil at
    Wiz); upgrades (feed `sylkis_greens` for stamina/speed tiers);
    **racing** — 3 authored checkpoint courses on the `Triggers` + timer
    pattern with gil/AP prizes. No new engine beyond the mount itself.
    Done: summon→ride→dismount in `gameplay`; one race completable
    end-to-end by a probe; `npcdraws`/perf gates green with the bird in
    frame. Size: **3–4 lane-lifetimes**, the largest single perf/animation
    risk in the plan.

## Lane 23 · Swimming — `src/world/collision/CharacterController.ts`, `src/world/Water.ts`

72. **Surface swimming.** Today the player walks lake floors. At depth
    >1.2 m enter a swim state: buoyancy at water level, swim locomotion
    ~2.2 m/s + sprint stroke, weapons sheathed (no combat in water), exit
    at banks; party waits at shore and rejoins. Applies to the four
    flood-filled bodies and rivers. Camera at the waterline and water-shader
    intersection are the known risks. Done: swim across Alstor Slough
    without floor-walking, in `gameplay`; `longplay` clean.
73. **Diving (funded at lock).** Below the surface: underwater camera,
    breath meter, subsurface fog/murk pass, surface seen from below;
    resurface at the breath limit. New rendering risk — the water shader
    has never been seen from underneath. Done: dive under Alstor and the
    Vesperpool, breath runs out and forces ascent, no NaN/artefact frames
    (`nanscan` on two new underwater probe framings).
    Size for the lane: **3–5 lane-lifetimes.**

---

## Demoted to `project/TASKS.md` — audited out, not lost

`Wear.ts:873` uuid program key; eye-program dedup (~17 iris-literal
programs — resurrected only if lane 19's `npcdraws` forces it);
`Water._visible` reflection draws; palm framings; tomb stubs (deliberate:
`rng < 0.16`); Crestholm's ~23 submerged boulders (`_genOutcrop` lacks the
water reject); impostor-ring texel check (ring is 250–330 m); card-albedo
baking; euEu 162.5→155; noise-floor calibration beyond the judged set;
archive pruning; the dungeon-map screen. Deleted outright: hair `mips: 0`
(probe artifact) and `assertAttributeContract` wiring (already done, 4/4).

## What this costs

**Waves of 6–8 lanes** on the shared trunk (human decision — expect gitlock
queuing and capture contention; commit small and often), one ~3 h/150-turn
lifetime each. Parts A–C ≈ 12–16 lifetimes; Part D ≈ 10–11; Part E ≈ 7–10
with diving; lane 20 (Meteor) 1–2. **Total ≈ 30–39 lane-lifetimes ≈ 12–18
hours of wall-clock at this parallelism** — one long night into day — then
§4's judge/playtest loops. Lanes 1–3, 57, 22 and 23 are the likeliest
respawns. First staffing: 2026-08-31 ~02:20 CEST.

## Definition of done

- [ ] All tasks landed or closed with a measured negative.
- [ ] `check` green, `nanscan` 0 over the full corpus (174 once lane 21
      lands), draw peak ≤800 on every shot, both perf gates certifying.
- [ ] Tab <800 MB, first load ≤25 MB by task 42's instrument, idle <30% of
      a core, median den 18–30 s.
- [ ] Content bars: `mainchain` completes ch1→ch5 with its shim deleted;
      every sector ≥30 activity-minutes (S≈35 · NE≈32 · N≈30 · SE≈30 ·
      SW≈33 · E≈40 · W≈38 · NW≈45; spine 50–65); both hubs' vendors,
      lodging, board and 8 city quests work end-to-end; all 8 royal arms
      claimable; dungeons fight back; `longplay` 30 min clean, day and
      night.
- [ ] Part E bars: chocobo summonable at spawn, one race completable,
      Alstor swimmable on the surface and divable with a working breath
      limit.
- [ ] **§4 satisfied: rounds run and published until hesitation ≥30% with
      ≥2 fooled (judged set includes the five city PAIRING rows) or a
      measured plateau; playtests until <3 broken-feel reports or the same
      plateau — with the numbers, whichever way they fall.**
- [ ] **Deployed to a public URL, and `coldload` run against the deployed
      origin.**
- [ ] This file archives when §4 is satisfied and the lanes report. No
      section may be added to it.
