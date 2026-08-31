# To nine — the one plan

Status: **BUILT — awaiting the human's ruling on five decisions, then archives.**
Built overnight 2026-08-30/31 by a coordinator session; see
`project/handoff/2026-08-30-coordinator.md` for the six decisions taken at
dispatch and the endgame sequence, and
`project/journal/2026-08-31-round17-and-playtest.md` for every judged number.

**All 20 lanes are closed.** 35 agent-lifetimes: 20 plan lanes, 11 in the
first fix wave, 4 in the second. Everything in Parts A-E is landed or closed
with a measured negative, which plan rule 2 counts as a win.

**The mechanical Definition of Done is met.** `pnpm run check` **21/21** (the
suite grew two gates tonight, `bakecheck` and `framecheck`); `perf` and
`gameplay` both certify on a quiet tree with `RULER_VALID: true`, 166/166
shots clearing 60 fps and **0 hitches**; draw peak **747/800**; `nanscan` 0 of
166. Content bars: `mainchain` runs ch1-ch5 with its self-grant shim deleted,
**all 8 royal arms are claimable**, dungeons fight back (`combatloop` 35/35),
`longplay` is clean for 30 minutes **day and night**, and every sector is
populated. Part E: the chocobo is summonable from minute one at **11.00 m/s**
— exactly what `WorldMap.travel()` already priced it at — with a race
completable end to end; Alstor is swimmable at **0.06% floor-walk over 167 m**
and divable with a breath limit that forces an ascent.

**§4's two bars: one plateaued, one still moving.**

- **Polish — MEASURED PLATEAU at 0%.** Judged rounds 17, 18 and 19 each
  returned **0% hesitation over 35 pairs, 0 fooled**, against a bar of >=30%
  with >=2 fooled. Controls ran 62%, 50%, **88%** — the instrument separates
  more sharply than in round 16 and is not saturated. Round 19 followed an
  eleven-lane fix wave built from round 18's own ranked tells; **the number did
  not move at all**, which is precisely §4's stopping condition. The judge's
  closing verdict: *"what fails is never the shot, it is material response and
  asset finish"* — and it could not separate the **Lestallum street** from
  shipped work in two separate pairings.
- **Playable — still improving, NOT plateaued: 4 -> 3 broken-feels** against a
  bar of fewer than three. A third playtest was in flight when this session
  wound down; its result is the next thing to read.

**Not done, and deliberately so:** the public-URL deploy (descoped by the human
— it is theirs, not a lane's), and plan task 47, which is held unlanded pending
a ruling because `facecheck` may be measuring art direction rather than a
defect.

**Five decisions need the human before this archives.** They are at the top of
`HUMAN_REVIEW.md`, each with its numbers: combat difficulty (a den now costs
25% of Noctis's HP median, 49% worst — measured, unplayed); the `fightshape`
trade boulder collision created (duration into PASS, danger out of it); task
47's `CONTROL_CEILING`; the camera's slope lift trading horizon for arm; and
Noctis's hair hue, where the plate table and `Cast.ts` disagree in writing.
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

**Cold-start briefs: every lane has one in the Appendix at the bottom of
this document.** Read yours before anything else — verified anchors (file:line), copyable
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

---

# Appendix — the cold-start briefs, one per lane

Researched 2026-08-30 against `66b354ad` (13 read-only research
agents + 7 briefs written from the audit's evidence). Each brief:
verified anchors (file:line), copyable formats, exact commands, a
first-commit sequence, landmines, done-when. A lane reads its own
brief and nothing else before its first commit.

## Lane 1 — Skin and hair shading (cold-start brief)

Owns: **all of `src/characters/rig/`** — Materials.ts, Face.ts, Hair.ts,
Geo.ts, Character.ts, Sculpt.ts. (The plan's lane 2 split double-claimed
rig/Materials/Geo/Character — resolved: lane 1 takes rig/ entirely; lane 2
= `src/characters/` outside rig/ plus rig/Outfit.ts and rig/Look.ts.) The
one `src/characters/Cast.ts` hair-colour change lands as its own
explicit-pathspec commit (lane 2 also edits Cast.ts:193).

### Anchors per task

**T1 winding — root cause is two shared builders, not per-mesh.**
- `Geo.ts:391 sweepTube`: ring frame `_r.crossVectors(_f, tan)` :419;
  body quads `:456 B.quad(A[j], A[j2], C[j2], C[j])` — with the
  right-handed basis, geometric normal = −outward → **every sweepTube is
  inward-wound**. `Sculpt.ts:266-270` states this exact rule for the
  creature builder and uses the reversed order. Caps follow the tube
  (:500,:504,:555,:559) — all inward, self-consistent.
- `Geo.ts:843 blob` quad order = −outward → inward too.
- `Face.ts:1404 buildEyes` sphere quad, same order → **both eye globes
  inward — explains "both eyes negative"**.
- Correct references to copy: `Geo.ts:934 ribbon` (comment :925-933),
  `Face.ts:954 buildHead` grid, `:967` chin cap, `:1263-1264 buildLid`,
  `Hair.ts:222-228 emitCard`.
- **Safe flip = swap quad argument order (`quad(a,b,c,d)` → `quad(a,d,c,b)`)
  at each site, NOT negating `_r`** (that mirrors asymmetric shapes).
  `Geo.ts:587-598`: inner shell stays relative; rim/cap quads must flip
  with the tube. Normals derive from the index buffer
  (`computeSmoothNormals` :262) — they flip automatically.
- Bodies: `Body.ts:41,48,63,90,112,307,409,444` (sweepTube) + `:100`
  (blob). Skin is FrontSide (`Character.ts:157-158`); hair is DoubleSide
  (`Materials.ts:804`) and is masking its own winding.
- **Eye meshes are unnamed**: `Character.ts:195-217`, mesh at :209 —
  set `eyeMesh.name = \`${this.name}_eye${sg>0?'L':'R'}\``.

**T2 subsurface.** The sss block is `Materials.ts:189-240`, injected
after `<opaque_fragment>` (:423-428): terminator :207, back-scatter :210
(`pow(dot(sV,-sL),3.0) * (0.12 + 1.15*thick)`), wrap :227-228, fresnel
:236. **A wrap term already exists — the missing cue is THICKNESS.**
`vMat.z` is the channel: `Face.ts:895-905 thicknessAt` (ear 1.0, nose
0.85, lip 0.7); the ear plate `Face.ts:1014 B.mat(0.46, 0, 0.5)`. **The
body writes thickness 0 everywhere** (`Body.ts:33,107 B.mat(0.57, 0)`,
`:487`), so `back` collapses to its 0.12 floor. Amounts: skin sss 0.155
(:739), face sss 0.16 (:757), `SSS_RED = 0xb8503a` (:718). Add the
thickness-tinted rim INSIDE the same block (pow(1−NdV,k) · thick ·
dot(V,−L)), not a new pass.

**T3 skin detail scale.** `Materials.ts:630-704 cache()` — PORE 256,
three octaves, `normalFromHeight(...,1.9)` :650-654. **The scratch is
anisotropic tiling**: `pore.repeat.set(15, 23)` (:655) body and
`poreFine.repeat.set(9, 13)` (:658) face — 1:1.53 / 1:1.44, a round pore
stretches into a streak. Strengths: normalScale 0.30 body (:731) / 0.34
face (:751). `maxFreq` (:628) is the Nyquist floor — don't exceed it.

**T4 hair aniso + coverageAA.** Aniso block ALREADY EXISTS:
`Materials.ts:242-331` (tilted macro normals :279-280, Kajiya-Kay
:288-290, rim :315-321, sky dome :327-328); params at :808
`{spec:0.55, shift:0.30, exp1:110, exp2:20, tint:0.85}` — tune, don't
build. coverageAA at `:798-799` (alphaMap + alphaTest 0.35): shader-side
alphaTest rescale by `fwidth(alpha)` (patch `<alphatest_fragment>` in the
same onBeforeCompile) + alphaToCoverage; the shadow depth material copies
map/alphaMap/alphaTest (:794-797) — anything done as a define must
survive there. `hairCut` generation :504-608 (mean coverage ~0.62 by
design); CARD_VARIANTS 4 (:445); cards emitted `Hair.ts:647-675`.

**T5 near-white blond — hypotheses ranked.** The straw fix (:300-309)
only luminance-normalises the SPECULAR tint; it does nothing to albedo.
1. **Authored albedo is near-white at the tips**: Prompto tipColor
   0xf4e2bd ≈ 0.77 linear luma; `emitCard` ramps `c.lerp(tipColor, t*t)`
   (`Hair.ts:212`) with card tips seeded at `tTip * (0.66-0.96)`
   (:668-670) — a t² ramp to a 0.77-linear tip IS white before light
   touches it. Check first.
2. **Env IBL**: hairMaterial sets no envMapIntensity → 1.0 while
   eyeMaterial clamps to 0.20 (:824); `Sky.ts:1228-1229` assigns the sky
   cube at full intensity. Ablate `--ablate noenv`.
3. Light rig: `Materials.ts:48` clamps the PATCHED terms' sun; three's
   own BRDF is unclamped — clipping is three's.
Order: `regionstat` the hair rect on PNG hero_full → `--ablate noenv` →
zero `spec` at :808 temporarily → drop tipColor.

**T6 face brushes.** `brushes()` `Face.ts:127`; constants :203-268
("authored while backface-culled, softened 30-50%" note :196-205).
`paintFace` :1605; occlusion section :1740; AO damp `a * 0.52` :1771 —
**setting AO to 0 changed hero_portrait by NOTHING (:1750-1770): the
slashes are the SCULPT's grooves, not the paint.** T6 is a brushes() job,
judged with `probes/facefront_flat.mts`, not a paint job.

### Mechanism notes
- One `patch()` (:125-432) serves every character material; `kind` :140
  drives `customProgramCacheKey` :430 — new per-material variation must
  fold into the key or programs alias.
- Varyings cost every program that declares them — put new SSS data in
  vMat's unused headroom, not a new varying.
- Everything injected after `<opaque_fragment>` = linear HDR;
  `totalEmissiveRadiance` writes there are a NO-OP — write
  `gl_FragColor.rgb`.

### Commands
```
node src/tools/probe.mts src/tools/probes/facewind.mts --dirty
## other three heroes: iterate g.get('Party').members instead of Player
node src/tools/shoot.mts hero_portrait hero_profile hero_full --dirty --jpeg --out tmp/shots/lane1-before
node src/tools/shoot.mts hero_full --dirty --cold --raw --ablate noenv --out tmp/shots/lane1-noenv
node src/tools/regionstat.mts tmp/shots/lane1-before/hero_full.png <x0> <y0> <x1> <y1> --label hair   # PNG only
node src/tools/facecheck.mts --dirty --shots tmp/shots/facecheck
node src/tools/probe.mts src/tools/probes/facefront_flat.mts --dirty --shot tmp/shots/brushes.jpg
node src/tools/probe.mts src/tools/probes/nanscan.mts --dirty          # after ANY shader edit
node src/tools/shoot.mts hero_portrait --dirty --cold                  # only oracle for a GLSL link failure
node src/tools/gitlock.mts commit -m "..." -- src/characters/rig/Geo.ts
```

### First commits
1. Geo.ts sweepTube/blob winding + Face.ts:1404 eye winding +
   Character.ts:209 eye names — ONE commit, facewind before/after in the
   message, all four heroes. **Nothing else lands until winding is
   green** — wrong normals corrupt every downstream measurement.
2. Re-capture + re-baseline the three hero shots.
3. Body thickness (Body.ts B.mat third arg) + SSS transmission rim.
4. Pore tiling :655/:658 + normalScale :731/:751.
5. coverageAA :798-799; aniso params :808.
6. Cast.ts hair tipColor (explicit pathspec — lane 2 shares the file).
7. Face.ts brushes re-derivation.

### Landmines
- **A uniformly-inversely-wound shell is invisible to every bench**
  (LANDMINES.md:1529-1568) — only facewind is orientation-absolute.
- **DoubleSide hides winding** — hair still is (:804).
- **A GLSL link failure is invisible on a warm page** — one --cold
  capture after every shader edit; LINK_STATUS===false is the only real
  signal.
- Black blob = possible NaN; in-shader NaN tests fold away — nanscan
  after anything touching a shader; clamp every pow() base with a varying
  input (:289 already guards; keep the discipline).
- Don't ablate lights via `visible` (43-program recompile, 9.5 s).
- **The corpus closeups are not closeups** (hero_face is ~100 px of
  head) — judge at 0.4-0.6 m via framecam/facecheck; absolute framings
  drift — use follow shots.
- The tutorial hint card parks over the forehead in face framings:
  `g.get('HUD').hints.root.remove()`.
- facecheck currently VOIDs and PASSes — lane 16 makes VOID a failure;
  don't read a VOID row as green.

### Done-when
facewind on all four heroes: positive signed volume on body/hair/outfit
and both NAMED eye meshes, ≥95% front tris +z — or the negative explained
here with the geometry that causes it. hero_profile: backlit ear reads
red-warm (regionstat R−B delta ear vs cheek). hero_portrait: pores not
scratches, no directional streaking. Hair edges anti-aliased with a
visible aniso band; shadow behaviour unchanged. Blond closed with a named
cause + regionstat p50/p99 no longer near-white. facecheck green with
lane 16's VOID fix. check green, nanscan 0, one --cold link proof, draws
unmoved.

## Lane 2 — Costume (cold-start brief)

Owns: `src/characters/**` except `rig/Face.ts` and `rig/Hair.ts`. Primary:
`rig/Outfit.ts` (930 ln), `Cast.ts` (562 ln), `rig/Materials.ts` (garment
material only — lane 1 owns the rest of Materials; coordinate), `rig/Look.ts`
(`OutfitPiece` fields). Do NOT touch `Shots.ts` (lane 3).

### Anchors per task

**7 — cloth folds** (`hero_full`: "flat-shaded clothing")
- `Outfit.ts:130-195` `clothShade()` — the only per-vertex shading source:
  `seam`, `wear`, `color`, `mat` ([rough, metal, 0] at :194).
- Fold geometry lives only in each piece's `shape` fn: shirt :174-193,
  jacket :277-321, sleeve :604-616, pants :641-655. Amplitudes `o.wrinkle`
  (Noctis jacket 0.036, shirt 0.020, Cast.ts:193-204). Ring/step counts:
  shirt 42×76 authored, jacket 26×38 (:271), sleeve 18×22, pants 26×22.
- Normals from positions only — `Geo.ts:262` computeSmoothNormals, welded
  by `B.group(g++)` at Outfit.ts:143. No normal-perturbation term anywhere
  in the cloth path.
- Shader: `Materials.ts:122-192 patch()`; only fragment hooks are
  `roughnessmap_fragment` (:182) and `metalnessmap_fragment` (:184).
  Garment material :761-781: `normalMap: c.weave` at normalScale 0.62,
  repeat 9×14 (:672) × per-piece uvScale — thread-scale only, nothing at
  fold scale.
- **Two free per-vertex channels**: `vMat.z` (thickness) is 0 on every
  garment vertex, and `aTan` is the untouched +Y default — Outfit.ts never
  calls `B.thick()`/`B.tang()` (only Hair.ts/Geo.ts:917,940 do).
  `MeshBuilder.mat/tang/thick` at Geo.ts:148-165. A fold/AO/anisotropy
  term rides one of these into patch() without a new attribute.

**8 — print resolution (verified bug)**
- Cast.ts:193 authors `steps: 42, seg: 76`; Outfit.ts:238 ignores them:
  `steps: o.printSteps ?? 56, seg: o.printSeg ?? 64`. One-line fix at :238 —
  derive fallbacks from the shirt, e.g.
  `steps: o.printSteps ?? Math.max(56, Math.ceil((o.steps ?? 20) * (tb - ta) * 4)),
   seg: o.printSeg ?? Math.max(64, Math.ceil((o.seg ?? 32) * ((th1 - th0) / (Math.PI*2)) * 4))`
  (`ta/tb/th0/th1` in scope at :222). Fields exist: Look.ts:296-297.
- Window `printWindow [-0.60,0.60,0.44,0.94]` (Cast.ts:193), `printLift
  0.0016` tapered at :229-233 — don't re-introduce a hard border step.

**9 — triangular skin hole at Noctis's collar**
- Collar builder Outfit.ts:518-548, called :337. **Root cause found:**
  `:521 const gap = o.collarGap ?? (o.gap ?? 0.42) * 0.8;` — Noctis
  (Cast.ts:195) sets `gap: 0.58` and no `collarGap`, so the collar sweeps
  [0.464, 2π−0.464] while the jacket body sweeps [0.58, 2π−0.58] (:272):
  the collar overhangs the jacket's front edge by 0.116 rad per side with
  nothing under it — that wedge is the triangle. Same mismatch on gladio
  (0.34 vs 0.60·0.8? — Cast.ts:349), prompto (Cast.ts:537), ignis
  (Cast.ts:436).
- Rule out with the same crop: shirt neckline scoop :177-178 vs collar base
  `y0 = o.collarY ?? 1.418` (:525). Torso tops at y 1.478 (Anatomy.ts:70);
  neck skin tube Body.ts:63-81. DoubleSide is on (Character.ts:53) — it is
  a real gap, not culling.
- Prior sighting: `project/archive/handoff/ws7-hands-outfits.md:193-195`.

**10 — Ignis value separation at 4 m+**
- Cast.ts:433-444: every garment constant within 8.6/255 of luma —
  jacket/skirt/sleeve 0x25242c (Y≈37), boots 0x2b2827 (41), pants 0x2e2b2c
  (44), shirt 0x2e2c2c (44), belt 0x2e2c38 (45).
- Structural half: `sleeve u1: 0.92` (Cast.ts:438) + full gloves
  (Cast.ts:401) = zero skin below the jaw. Compare Noctis `sleeve u1: 0.34`
  (Cast.ts:202) and shirt 0x3a3a3c (58) vs jacket 0x2c2a29 (42).
- Levers by cheapness: shirt/jacket value split; rough split (both 0.62);
  collarColor/cuffColor/weltColor accents (Look.ts:262-276); then sleeve u1.
- Formation: Ignis slot [1.85,−1.45] (Party.ts:127); party_formation cam
  offset [5.02,3.6,5.16] fov 42 (Shots.ts:296).

### Mechanism notes
- ONE garmentMaterial is shared by all four heroes (Character.ts:43-58) and
  a second by every NPC (npc/NpcRig.ts:10). `customProgramCacheKey` is
  `char2-${kind}` (Materials.ts:430); garments are the only kind==='plain'
  — a garment-only shader branch needs its own kind or it silently shares.
- `shadowSide = BackSide` (Character.ts:56): geometry folds cast into the
  shadow map; a fragment-only fold term will not.
- Wrinkle args are radians over the whole parameter: `sin(th*7 + t*16)` is
  2.5 cycles along t (pants comment :646-652 is the precedent, 4
  samples/cycle min). Current pieces are above that — undersampling is NOT
  the flat-shading cause.
- Recorded negative: three sleeve-as-surface attempts (TASKS.md:91). If
  task 7 fails again as shading, that negative closes it (plan rule 2).

### Commands
```
node src/tools/shoot.mts hero_full hero_face party_formation --out tmp/shots/lane2-r0 --jpeg
node src/tools/shoot.mts hero_full hero_face party_formation --out tmp/shots/lane2-r0p     # PNG for crop/imgdiff
node src/tools/crop.mts tmp/shots/lane2-r0p/hero_full.png tmp/shots/lane2-r0p/c_torso.png 680 210 300 340 3
node src/tools/crop.mts tmp/shots/lane2-r0p/hero_face.png tmp/shots/lane2-r0p/c_collar.png 620 280 340 320 3
node src/tools/crop.mts tmp/shots/lane2-r0p/party_formation.png tmp/shots/lane2-r0p/c_ignis.png 900 300 340 420 2
node src/tools/regionstat.mts tmp/shots/lane2-r0p/party_formation.png 0.56 0.33 0.78 0.80 --label ignis
node src/tools/lineup.mts tmp/shots/lane2-r0p/_four.png 620,60,380,800,2 <four PNGs>
node src/tools/framecam.mts tmp/lane2/collar.json --out tmp/shots/lane2-collar
node src/tools/geocheck.mts && pnpm run check
```
Read the JPEG crops, not the full frame; keep the same rects across rounds.

### First commits
1. Outfit.ts:238 — forward authored steps/seg into printPatch. One line.
2. Outfit.ts:521 — collarGap default becomes `o.gap ?? 0.42` (never
   narrower than the jacket opening); hero_face before/after.
3. Cast.ts:434,436,438 — Ignis value split ≥12/255 + one accent.
4. Only then task 7: a fold term on vMat.z from clothShade read in patch()
   with a new kind, or a fold-scale detail normal.

### Landmines
- Captures default `--build HEAD` — uncommitted edits are not in the frame;
  `--dirty` for the tight loop.
- Explicit pathspec commits only (shared index; hook blocks -am/-A).
- Shots.ts is lane 3's — new framings via framecam/dresscam.
- Any garment-material change hits the whole NPC cast + draw/perf gates.
- The collar sits beside the jaw — don't "fix" it in Body.ts's neck without
  checking lane 1's winding work first.
- imgdiff floor ~1.5/255; single-shot draw deltas under ~20 are noise.
- `_probe/hands.mts` `_palm*` framings are too tight — don't trust them.

### Done-when
8: print border invisible, mark legible at hero_face; raising Cast.ts:193
steps/seg visibly changes the print. 9: no skin between collar and jacket
on any hero at the crop; geocheck green. 10: regionstat ≥12/255 between
Ignis's two largest garment regions; lineup separates him from
gladio/prompto. 7: fold shading visible in the torso crop — or a written
measured negative. Gates green throughout.

## Lane 3 — Near-field and composition (cold-start brief)

Owns: `src/game/Shots.ts` (exclusive, rule 6 — release to lane 21 after
re-baselines land), `src/world/veg/**` seating (`GrassField.ts`, `Bushes.ts`,
`Trees.ts`, `Biomes.ts`, `Ecology.ts` density fns). Do NOT touch
`src/world/terrain/**` (lane 5), `Sky.ts` (lane 4), `src/characters/**`
(lanes 1–2).

### Anchors per task

**Shot format (tasks 11–13, and lane 21's whole dependency)**
- `src/game/Shots.ts` — `ShotState` iface L130-149 (`doc`,`time`,`fov`,
  `weather`,`scenario`,`hud`,`dungeon`,`menu`,`story`,`gait`); `FixedShot`
  L158-165 (`pos`,`target`); `FollowShot` L168-177; `SHOT_TABLE` L187-1147
  `as const satisfies Record<string, Shot>`; `SHOTS`/`ShotName`/`PROBE_SHOT`
  L1149-1187.
- **Format is parsed by regex, not TS.** `corpus.mts:92-115`,
  `drawcheck.mts:255-259`, `perf.mts:88-91` match
  `/^\s{2}([a-zA-Z0-9_]+):\s*\{/gm` — an entry MUST be 2-space indented with
  `{` on the same line. Category buckets from `// --- name ---` header
  comments (`corpus.mts:99`). `doc:` must be a single line.
- **File order is load-bearing** (Shots.ts L79-105): character/UI shots
  first (terrain drifts ~1.5 m up after dozens of far shots and buries the
  party); cutscenes/dungeons last.
- Target shots: `hero_full` L221, `vista_dawn` L377, `vista_dusk` L387,
  `zone_longwythe` L452, `zone_three_valleys` L464, `zone_vannath` L474,
  `zone_lestallum` L547.
- Consumer: `shoot.mts` (positional names, one call takes all; `--jpeg` to
  look, PNG for imgdiff, `--raw`/`--hide` for ablation). `Game.applyShot`
  at `src/game/Game.ts:571`.

**PAIRING (for lane 21)** — `src/tools/compare.mts:73-118`,
`Record<string, string[]>`, key = shot name, value = ≥2 filenames in
`docs/reference/plates/`. `FALLBACK` L119. `--shots <dir>` picks plate
`options[(seed0+i) % len]` (L242-247); `--control` emits one composite per
distinct plate pair (L214-232).

**Vegetation seating**
- `GrassField.ts`: `LODS` L44-48 — blade 0–26 m (`spacing .27`,
  `max 240000`), clump card 21–84, far card 78–155. **Past 155 m there is
  no grass geometry at all.** `tuftHeight` L104; `bladeGeometry` L137
  (`HALF_W .046`); `crossCardGeometry` L214 (3 crossed quads LOD1, 2 LOD2 —
  L444-445); `swardProxyGeo` L261 (shadow-only); `_makeTile` L618, per-tile
  eco fields L646-657.
- Per-zone levers: `Biomes.ts` `VEG_BIOME` L129+ (`grassD`,`grassH`,
  `grassDead`,`scrubD`,`scrub`). Density fns: `Ecology.grassDensity:700`,
  `scrubDensity:727`, `treeDensity:769`, `grassScale:912`.
- Bushes: ctor L427 `{ range 96, impRange 440, massNear 380, massRange
  2600 }`. `CARDS` L176 (fern/bracken/reed, `frondGeometry` L195). Leide's
  mix is `SCRUB_LEIDE` — no ferns at spawn.
- Trees: "camera inside crown" cull L1047-1073 — `cullFloor 3.5`, radius
  `0.55*h + 3`. **A tree seated near a raised camera is silently culled**;
  a vista camera 12–40 m up over a 19 m tree is inside the band.
- Authored sites: `Ecology._layoutSites` L582-668 → `EcoSite`. **Sites only
  CLEAR vegetation** (`siteBlock` L684) — no "seed veg here" type exists;
  adding one is a new `SiteType` (closed set, 4 consumers).
- Litter: `ZoneDress.ts` `ZONE_DRESS` L114+; `Debris.ts` `LITTER` L467-475
  (branch range 105 m, deadtrunk 560 m), `_genCell` L658.

**The cover band (why task 11 exists)** —
`project/journal/2026-08-27-critic-round-16.md:161-200`. `e3897af` added
mid-scale cover, claimed 3.466/255 on vista_noon; split by band the sky
moved 4.412 and the terrain only 1.447; cropped at 2× it reads as *flat
green dashes painted on brown* — no cast shadow, no silhouette, no
parallax. It filled the hole arithmetically and the judge did not see it.

**Occluders** — `vista_dawn`'s occluder is an existing world tree the
camera was placed against, not an authored prop. `vista_night` and
`zone_vesperpool` also have one.

### Mechanism notes
- **Where the bottom of frame lands:** ground distance ≈
  `clearance / tan(|pitch| + fov/2)` with `pitch = asin((target.y −
  pos.y)/d)` (Shots.ts L16-27). `vista_dusk` aims UP (+100 m over 1176 m,
  fov 42): bottom of frame ≈ 3.5× camera clearance out — ~105 m for a 30 m
  clearance, past everything with silhouette. Two levers: reframe (drop
  pos.y / aim down so the bottom lands under 26 m — free of draw cost) or
  push rings/`impRange` outward (priced in draws, budget 800, gated by
  `drawcheck`; `budgetFromBrief` reads BRIEF.md's literal "Draw-call budget
  is **N**" string).
- `TASKS.md:55` (verified): nothing with silhouette at 15–97 m on
  hero_full; fix named there is pulling `scrub_*_card` seating inward.
- **Star tufts**: ablate, don't guess. (a) blade splay `_makeTile`
  L826-844 (`lean` already cut from 0.99 to ~0.58 rad); (b)
  `crossCardGeometry(3,…)` leaking inside 21 m, or bush `frondGeometry`
  (8 radial fronds = star from above). `shoot.mts --raw --hide grass` vs
  `--hide scrub`.
- Grass casts no real shadow — only `swardProxy` darkens ground. New
  near-field cover with no cast shadow will read as the cover band did.

### Commands
```
node src/tools/shoot.mts zone_longwythe zone_vannath zone_three_valleys vista_dusk zone_lestallum hero_full --out tmp/shots/l3-a --jpeg
node src/tools/probe.mts src/tools/probes/vegcensus.mts --set __SHOTS=zone_longwythe,vista_dusk,hero_full
node src/tools/framecam.mts cand.json --out tmp/shots/l3-frame --jpeg
node src/tools/dresscam.mts at:1282,312 --dist 70 --eye 12 --out tmp/shots/l3-dress
node src/tools/imgdiff.mts tmp/shots/before tmp/shots/after --heat tmp/heat --gain 8
node src/tools/shoot.mts --out tmp/nf/a --cold && node src/tools/shoot.mts --out tmp/nf/b --cold && node src/tools/imgdiff.mts tmp/nf/a tmp/nf/b --calibrate
pnpm run check
```
`vegcensus` header's `SHOTS=... env` form is stale — use `--set __SHOTS=`.

### First commits
1. Measure before touching: vegcensus + `--jpeg` captures of the six shots;
   record draws-per-ring and bottom-of-frame ground distance per shot.
2. hero_full star-tuft ablation — name the geometry before editing; fix
   lands in GrassField.ts or Bushes.ts, not Shots.ts.
3. Reframe pass for the five shots (bottom third inside 26 m), one commit,
   re-calibrate `project/noise-floors.json` IN THE SAME COMMIT.
4. Occluders via camera placement against existing trees first
   (vista_dawn's own recipe); only then litter bumps or a new site type.

### Landmines
- **Vegetation.prime is a recorded negative to skip** (hero_full 13.359/255,
  31.7% of pixels; LANDMINES.md:1420-1452). PNG diff on hero_full catches
  any retry.
- **Dark near-ground in green zones is veg density + cloud shadow, not
  palette** — shoot the baseline before believing a regression.
  zone_vannath's 13/255 foreground is LANE 5's item; don't fix from veg.
- **Whole-frame imgdiff mean is invalid for ground changes on sky shots**
  (cloud march variance swamps it) — crop to the band you changed.
- **`--raw` understates build-to-build diffs 40×** and changes LOD
  selection — mesh ablations only, both sides.
- Framing changes break noise floors deliberately — recalibrate in the
  same commit. silhouette/geo baselines key on GENERATORS, not shots — they
  trip if you change tree/bush geometry, not framing.
- `drawcheck`: `project/draw-baseline.json` does not exist — the first shot
  over 800 creates it.
- Derive cameras live via `framecam --probe`; never hand-write coordinates.
- `--no-daemon` swallows shader errors; never start a server (hook blocks).

### Done-when
Five judged landscape shots have grass/shrub/sapling silhouettes with cast
shadow and parallax in the bottom third, verified by READING the JPEG at 2×
crop; hero_full has no star tufts and something with silhouette at 15–97 m;
every judged vista carries a foreground occluder crossing top or side;
drawcheck ≤800 everywhere; noise floors re-calibrated and committed with
the framing changes; Shots.ts released to lane 21 with the format contract
(2-space indent, `{` on key line, single-line doc, category headers).

## Lane 4 — Clouds (cold-start brief)

Owns: `src/world/Sky.ts`, `src/world/sky/Clouds.ts`,
`src/world/sky/CloudTextures.ts`, `src/shaders/clouds.glsl.ts`, cloud block
of `src/shaders/sky.glsl.ts`. Do NOT touch Shots.ts (lane 3), terrain
(lane 5), post/grain (lane 15). Plan: tasks 15–17. Judge:
`project/journal/2026-08-27-critic-round-16.md:96-104`.

### Anchors per task

**T15 organisation (streets / cell-size variance).** Coverage is one baked
512² weather map tiled every `uWeatherTile` 27 km (`Sky.ts:801`), built in
`CloudTextures.ts:226-289`:
- `:259` `cov = valueFbm2(fx*12 …, 12, 4)` — 12 cells / 27 km = 2.25 km
  dominant blob, domain-warped `:257-258`.
- `:261-262` `streak … wCov = cov*(0.72+0.42*streak)` — **the only
  anisotropic term; streets must come from here** (15×5 cells, ±22%),
  applied before `stretch(wCov,0.01,0.99)` `:279`.
- `:267` `wType` 5 cells, `:275` `wVar` 7 cells — the per-cloud-difference
  channels; comments `:263-274` carry the 20→7 history.
- Consumed at `clouds.glsl.ts:84-97 cloudWeather`: `wc = smoothstep(
  uCovRange.x, uCovRange.y, w.r) * (0.48 + 0.98*w.b)` — cell-size variance
  today lives only in that `w.b` multiply and `uCovRange` (`Sky.ts:279-296`
  explains covHi 1.02→0.92).
- Shape volume: `uCloudBaseTile` 4200 (`Sky.ts:798`), `uCloudVertTile`
  3600, second octave 2.63× (`clouds.glsl.ts:137`), erosion tile 900.
  Volume bake `CloudTextures.ts:154-200` (worley 4/8/16/24 over 64³).

**T16 crisp top edge.** March target = `MARCH_SCALE` 0.45 (`Clouds.ts:16`)
→ 720×405 at 1600×900 (`setSize` :542-549). Upsample:
`sky.glsl.ts:318-352`, 3×3 Gaussian radius `uCloudTap` **0.90** march
texels (`Sky.ts:761`). March loop `Clouds.ts:186` (192 iters), fine step
`clamp(t*0.017,30,440)`, `MISS_MAX` 6 (`:133`). **Half-res is NOT the edge
story — measured:** MARCH_SCALE 0.45→1.0 changed a 2× vista_noon crop by
almost nothing (`archive/handoff/clouds.md:103-109`); the ramp is
geometric — a 2.25 km cloud at 20 km subtends ~160 px and its density ramp
is 10% of that (`sky-clouds.md:155-161`). T16 lives in the density-ramp
steepness at the silhouette (`cRemap` :143, `uCloudDetailAmt`) and
`uCloudTap`, not resolution.

**T17 dynamic range.** `cloudDensity` chain (`clouds.glsl.ts:104-174`):
shape remap `:132`, early-out `:135`, octave `:137-138`,
`e = cRemap(shape, 1-cov, 1, 0, 1)` `:143`, erosion `:152`,
`* uCloudDensity` `:173`. Lighting: 3-octave sum `:264-270`, `uCloudMS`
0.62 `:278`, `energy *= uCloudSunGain` `:279`, powder `:282`, `uSilver`
`:287`, `uAmbBury` 2.4 `:331`, **soft knee `sunL *= uCloudMaxRad/
(uCloudMaxRad+pk)` at `Clouds.ts:365`, `uCloudMaxRad` 9.5 :516`.**

**Presets.** `WEATHER` `Sky.ts:267-372` (clear :268, overcast :337, storm
:351, fog :368) → `_pushWeatherUniforms` :1261-1295; only silver/baseShade
reach marchUniforms (:1282-1283).

### Mechanism notes
- **`uCloudSunGain`'s base is NOT 0.42** — the constructor value
  (`Clouds.ts:509`) is dead; `_applyTimeOfDay` overwrites every frame:
  `Sky.ts:1035-1036` `uCloudSunGain = lerp(0.26, 0.20, overcast)`. Edit the
  lerp. (The plan's "base 0.42" is wrong; correction recorded at
  `sky-clouds.md:163`.)
- The knee compresses crown-to-body by `m²/(m+pk)²` (`clouds-r2.md:148-153`)
  — gain cuts are sublinear (40% cut moved clip% 43.7→35.4). **T17's ratio
  lever is the knee + cRemap steepness, not gain alone.**
- `cloudDensity` has three consumers: screen march, ground-shadow bake
  (`SHADOW_FRAG` `Clouds.ts:410-450`), env cube (`CLOUD_ANALYTIC` :239).
  Coverage changes move lane 5's task 21 and the IBL — announce them.

### Commands
```
node src/tools/shoot.mts vista_noon zone_vannath zone_three_valleys vista_dusk zone_longwythe zone_lestallum --out tmp/shots/l4-base
node src/tools/shoot.mts vista_noon --out tmp/shots/l4-tap0 --ablate cloudtap0   # also cloudtapmax, nocloudjitter, nocloudsun, nocloudamb, noambbury, noclouds, nocloudshadow (Sky.ts:704-742)
node src/tools/crop.mts tmp/shots/l4-base/vista_noon.png tmp/l4/noon-cloud.png 620 40 340 220 1
node src/tools/imagestats.mts tmp/l4/noon-cloud.png      # read `stops` = log2(linP99.9/linP0.1)
node src/tools/edgestat.mts tmp/shots/l4-base/vista_noon.png --roi 620,40,340,220
node src/tools/regionstat.mts tmp/shots/l4-base/vista_noon.png 0.39 0.04 0.60 0.28
node src/tools/probes/perfcsm.mts
pnpm run check && node src/tools/probes/nanscan.mts && node src/tools/perf.mts vista_noon storm zone_lestallum
```

### First commits
1. **Instrument first:** fixed crop boxes per shot, crop→imagestats +
   edgestat on the same box; record baseline stops (0.87–1.06) and edge
   hard/p90 in the handoff BEFORE tuning.
2. T15a streets: raise `:261-262` anisotropy with a real aspect ratio, fix
   its tiling bug (landmine 1).
3. T15b cell variance: widen `w.b`'s influence in `cloudWeather` and/or
   drop `wVar` to ~4-5 cells; re-check covLo/covHi.
4. T17: knee (`uCloudMaxRad` up / shoulder) + re-balance the `Sky.ts:1036`
   lerp, then steepen cRemap `:143`. Measure stops per step.
5. T16: `uCloudTap` down against the T17 tree + silhouette-side sharpening.

### Landmines
- **The streak channel does not tile in y**: `CloudTextures.ts:261` passes
  period 15 while `py = fy*5.0` — a discontinuity every 27 km in the
  anisotropic term. Verify/fix BEFORE amplifying or you bake a seam.
- Editing CloudTextures invalidates the bake automatically
  (`texbake.mts:57`) but its args are duplicated at `texbake.mts:302-308`
  and `Clouds.ts:471` — keep in step; each rebake costs 409 ms boot.
- **Recorded negatives — do not re-spend**: full-res march, 448 iters,
  gCloudLod=0, dither decorrelation, god-rays-as-cause, TAA accumulation,
  raising exposure, raising coverage threshold, cutting uAmbientBoost,
  cutting uCloudSunGain alone. Stories: `project/archive/handoff/clouds.md`,
  `clouds-r2.md`, `sky-clouds.md`.
- `MISS_MAX` 6 must stay strictly above the coarse/fine ratio 2.0
  (`Clouds.ts:133,204`) or the deck vanishes.
- Whole-frame imgdiff mean is invalid on sky shots — mask to the band.
- `--ablate noexp` pins exposure to noon — compare same-hour arms instead.
- `imagestats` re-crops inputs to x5–95%/y5–90% — size boxes accordingly.
- `applyShot` lands every capture on frame 8 = all cascades + cloud shadow
  due (`LANDMINES.md:655-670`).

### Done-when
Cloud-crop stops ≥2.0 on vista_noon and zone_vannath at the baseline boxes
(clip% ≤2× reference, no preset losing silhouette); edgestat hard↑/p50↓ and
a 2× crop reads as a cauliflower boundary; visibly unequal cell sizes and
≥1 directional street with no 27 km seam; check/nanscan green; perf not
regressing past ruler floor (vista_noon 4.15 ms, zone_vannath 5.75, storm
5.8, zone_lestallum 6.65 — `project/baseline-perf.json`).

## Lanes 5+6 — Light in shadow + hue range (cold-start brief)

Owns: lane 5 = `src/world/terrain/**` except `Field.ts` (TerrainMaterial,
Layers, Horizon, Biome, Clipmap, Road). Lane 6 ("zone palettes") has no
directory: its files are `terrain/Biome.ts` (in lane 5 — same agent) and
`veg/Biomes.ts` (lane 3's tree → explicit-pathspec one-liner). Task 21's
`uCloudShadowStrength` lives in `Sky.ts` = lane 4's file → named one-liner.
`Field.ts`, `Shots.ts`, `postfx/` are not yours.

### Anchors per task

**18 — sky fill in shadow.** An ambient term EXISTS; it is small and doubly
occluded, not absent.
- The whole diffuse ambient is one L2 `THREE.LightProbe`:
  `sky/SkyProbe.ts` (:49, update :113, upwardIrradiance :195), added at
  `Sky.ts:630-631`, intensity written per frame at `Sky.ts:1105`
  (`PROBE_GAIN = 1.0`, `Sky.ts:30`; `?post=noambient` zeroes it).
- Env cube is specular-only: `uEnvDiffuse` default 0.0 (`Sky.ts:831`),
  injected `MaterialPatch.ts:171-172`. The probe is the ONLY sky fill.
- Probe irradiance clamped ≥0 at `MaterialPatch.ts:145-146`.
- Terrain multiplies it twice: `TerrainMaterial.ts:1882-1892` (FRAG_AO) —
  `tfAmb = tfAO * mix(1, tfSkyAo, uHorizonMix.y)` then
  `indirectDiffuse *= mix(1.0, tfAmb, 0.85)`. `tf_horizonAo`
  (`Horizon.ts:428-445`) folds the normal in, so a shadow-side slope loses
  fill AGAIN and gets no directional sky colour. `uHorizonMix` default
  `(1, 1, 300, 620)` at `TerrainMaterial.ts:2085`.
- `Sky.fill` (`Sky.ts:632`) is NOT a light — only Water and Weather read
  it; editing it does nothing to terrain.
- Ranked levers: PROBE_GAIN; the `mix(1.0, tfAmb, 0.85)`; `uHorizonMix.y`;
  a directional fill (tint indirect by bioCool/sky azimuth); `uEnvDiffuse`
  off zero (double-counting risk — SkyProbe was built to remove exactly
  that; measure with `?post=noprobe`, Sky.ts:703).

**19 — de-posterise.** Dither is NOT absent — find which stage quantises
before authoring.
- `GradePass.ts:152-153` temporal dither floor 1.5/255; `:146` grain is
  mid-weighted `4*l*(1-l)` ≈ 0 at l<0.05 — the darkest band carries 1.5
  LSB alone.
- `CasPass.ts:144` second ordered dither (final display pass).
- LUT 32³ Uint8 (`grades.ts:249-368`) sampled trilinear; shadow EXPANSION
  below knee 0.06 with slope 1+toe*4 (`grades.ts:295-305`) multiplies
  upstream quantisation ~1.2×.
- Buffers all HalfFloat — no 8-bit intermediate. **Likeliest false
  positive: the judge read `--jpeg` (q82) at 3×.** Re-shoot PNG on the
  same boxes BEFORE authoring anything; may close as measured negative.

**20 — mid-frequency geology (0.65→300 m).** Both ends are shading: GTAO
radius 0.62 m fading 220→650 m (`PostFX.ts:282-315`); the horizon bake's
shadow half fades IN at 300→620 m (uHorizonMix.zw). Nothing occludes
between.
- Exists in-band: tier-C mesorelief 4-30 m
  (`TerrainMaterial.ts:1675-1757`, `?post=nomeso/mesomax`); analytic
  strata/laminations (:800-880); talus splat (:590-596); runnels
  (`?post=nogully`); near detail ~2.9 m (`uNearScale` :2093-2095).
- Missing: drainage as a network (flow = ctrl.r, consumed only as splat
  weight) and 30-300 m form — `reliefstat` measures the shortfall (d8
  11.8 vs 18.4, d16 12.1 vs 21.2, d32 13.3 vs 21.8, quoted :1682-1687).
- Layer recipes: `Layers.ts` (LAYER_AVG :55-62 re-derived by
  `layeravg.mts` — **required after ANY recipe edit** or the far-LOD seam
  returns).

**21 — vannath floor.** Cloud shadow multiplies DIRECT light only
(`MaterialPatch.ts:119-122`, injected :131). Under a patch only the probe
remains → tasks 18 and 21 are the same floor. `uCloudShadowStrength`
default 0.62 (Sky.ts:817), preset `clear` **0.78** (:318), written :1271.
zone_vannath = 17.2 h clear (Shots.ts:474). Patch ≈640 m = uShadowTile
2700 (:815) × shadowScale 3.5 (:1288). `?post=nocloudshadow/noclouds`
(Sky.ts:704-705).

**22 — one hue per frame.** The palette is `terrain/Biome.ts`: SURFACE
:48-100 (ground/rock multipliers, green, damp), surfaceAt :142, BLEND_POW
2.4 :117, baked by buildBiomeLut :188; shader reads two textureLod
fetches at `TerrainMaterial.ts:546-558` (bioGround/bioRock/bioGreen/
bioDamp/bioCool).
- `three_valleys: ground [1.09,.96,.81], rock [1.11,.97,.83], green .08,
  damp 0` (Biome.ts:54) — warm × warm with bioCool ≈ 0.07 so the strata
  desaturation (:854) never fires. Brown ridge to horizon.
- **WorldMap.ZONES has no albedo tint** (its `tint` is the map-screen
  colour). Don't look there.
- Accent levers outside terrain albedo: `veg/Biomes.ts:139-145`
  three_valleys (dry 0x8f8257 / lush 0x62663a, treeTint, scrub mix) via
  `Ecology._grassRamp` (:904-910) — note the recorded failure "1.76× red
  = highlighter yellow"; rock tint variance `Rocks.ts:793-816` (±6%);
  strata endpoints (:846-849); mesoPale/mesoLag (:1751-1752).

### Mechanism notes
- Terrain = MeshStandardMaterial patched twice (MaterialPatch then own
  onBeforeCompile); cache key constant `'terrain-surface'` — a new
  UNIFORM is free, a compile-time branch is not.
- FRAG_AO runs at `<aomap_fragment>` (after lights_fragment_end) — one
  injection scales both direct and indirect.
- Probe and env cube re-bake together; new fill must not be metered or
  exposure cancels it (Sky.ts:1096-1101 excludes golden-hour fill from
  the meter deliberately).
- `shadowmask.mts` paints the darkest-quartile mask — prove the quartile
  is ground before filing against albedo; `?post=gwhite/gwarm`
  (TerrainMaterial.ts:52-60) are floor/ceiling controls.

### Commands
```
node src/tools/shoot.mts zone_vannath zone_three_valleys vista_overcast vista_fog --out tmp/shots/l5-base    # PNG, never jpeg for measurement
node src/tools/crop.mts tmp/shots/l5-base/zone_vannath.png tmp/crop/vannath-core.png 520 560 220 140 3
node src/tools/regionstat.mts tmp/shots/l5-base/zone_vannath.png 0.33 0.62 0.46 0.78    # ≥30/255 gate
node src/tools/imagestats.mts "tmp/crop/*.png" --against FFXV-field
node src/tools/reliefstat.mts tmp/shots/l5-base/zone_three_valleys.png --roi 0.1,0.6,0.8,0.35 --against FFXV-field-ground
node src/tools/shoot.mts zone_vannath --ablate noambient --out tmp/shots/l5-noamb
##   noambient noprobe noenv nocloudshadow noclouds nogtao nolut nomeso mesomax noiao iaomax nogully nodry drymax gwhite gwarm nostoch
node src/tools/layeravg.mts        # after ANY Layers.ts recipe edit
node src/tools/check.mts && node src/tools/nanscan.mts
```

### First commits
1. **Instrument first:** PNG baselines + regionstat on named crop boxes
   (vannath core + p50 box, overcast, fog) + reliefstat d1-d32 for
   three_valleys. Nothing lands before these numbers exist.
2. **19 before 18:** re-measure the bands on PNG at 3×; localise with
   `?post=nolut` or close as a jpeg-artifact measured negative.
3. **18** smallest step first: raise the tfAmb mix floor and/or
   PROBE_GAIN; ablate vs noambient; report shadow-side Y p50 + R−B.
4. **21** as its own explicit-pathspec Sky.ts one-liner (cloudShadow
   0.78 for clear and/or shadowScale), verified on identical boxes.
5. **22**: Biome.ts three_valleys row (lift green/damp or push rock off
   the ochre axis so bioCool engages) + paired veg/Biomes one-liner.
   Verify with surfaceAt() at the shot target, not the authored number.
6. **20** last and largest — a mid-frequency field with its own `?post=`
   ablation pair, priced by reliefstat d8/d16/d32.

### Landmines
- The Taelpar "wood grain" was the rock TILE, not the strata — wrong
  twice; recipe 3's comments carry the history. Bedding is
  threshold-gated by bioGreen (:869-878) — don't lerp it back.
- The chevron hatch on peaks is GTAO (`?post=nogtao`), not fixable from
  terrain.
- Zone blend dilutes small zones (Ravatogh ~78% at own centre) — measure
  surfaceAt() before authoring a row. Centres are cx/cz, never x/z.
- mencemoor corduroy is CLOSED as not-worth-it — do not reopen.
- Dark near-ground in green zones is veg + cloud shadow, not palette.
- `?post=drymax` is a measured negative for band 20 (d1/d2 overshoot,
  d8-d32 flat) — no more sub-metre mat.
- Adding a light or a SECOND probe recompiles every program (9.5 s) —
  extend the existing probe.
- Two captures differ ~1.5/255 — thresholds trace to that.

### Done-when
18/19: same boxes — overcast/fog shadow-side Y p50 up, R−B cooler, no
band edges on PNG at 3×; `?post=noambient` reproduces the old frame — or
19 closes as measured negative with the jpeg evidence. 20: reliefstat
d8/d16/d32 move materially toward 18.4/21.2/21.8 without d1/d2
overshoot, with a paired ablation. 21: audit boxes ≥30/255 and patches
within 2× of their clouds. 22: three_valleys shows a second hue that
survives a sky-matched slice (build the slice first —
`imagestats.mts:418`'s own caveat). check green, nanscan 0, ≤800 draws,
layeravg re-run if a recipe changed.

## Lane 7 — Water and weather (cold-start brief)

Owns: `src/world/Water.ts`, `src/world/water/**`, `src/world/weather/**`, and
`src/world/props/Wear.ts` (task 26 only). Do NOT touch `src/game/Shots.ts`
(lane 3 owns it) — task 25 uses probe-authored framings.

### Anchors per task

**23 · sea is one slab** — `src/world/Water.ts`
- `_makeSurface` :478 — `new THREE.PlaneGeometry(b.w, b.d, 1, 1)` rotated
  flat. **Two triangles.** No displacement; `renderOrder = 5`. Literally
  the slab.
- `_findBasins` :403 — flood-fill, every body `name:'sea', foamBand:1.35`,
  `.slice(0,4)`. `_findTarns` :469 → `water/Tarns.ts`. Sea and tarn differ
  only in level/foamBand — same `_makeMaterial` :501.
- Depth colour EXISTS and is physical: `uSigma (0.46,0.10,0.045)` :521,
  `uScatter` :528, `uBed` :530, Beer-Lambert :681, Snell path :670-673.
  Bed height via `wf_bed` :614 off terrain clipmap (`_bindBed` :316).
- **Wave spectrum is hard-coded in the fragment, no uniforms** :622-641:
  `nS` 0.0047 (swell, `swellRot` 31°), `nA` 0.021, `nB` 0.052;
  `fine = 1-smoothstep(70,300,dist)`. Wave-scale variation = new uniforms
  in `_makeMaterial` + a field on `WaterBasin` (:59-87).
- Shoreline: shader foam :699-732 (`bedSlope` two 1.5 m bed taps,
  `band = min(uFoamBand, max(0.10, 3.5*bedSlope))`, distance fade
  `smoothstep(220,620,dist)` :732) + real swash geometry `water/Shore.ts`
  (21 elevation rows, one merged mesh, `_buildShore` :276) with
  `water/ShoreMaterial.ts` (run-up, three along-shore sine sets 43/71/113 m).
- Judged frames: `zone_galdin` Shots.ts:479, `zone_vesperpool` Shots.ts:557.

**24 · rain** — `src/world/weather/Rain.ts`
- Streaks: `RAIN_VERT` :20-83; three parallax shells `uL0/uL1/uL2`
  :231-233; 92 000 instanced quads :211.
- **Splashes already exist** — `SPLASH_VERT` :104, 1500 instances :254,
  `uExtent 22.0` :262, `uRate 2.4` :264, ground via `tf_height`. Two draw
  calls total.
- **Density is one scalar with per-drop random cull**: `alive = step(pick,
  uIntensity)` :40-41 (drops) and :121-122 (splashes) — no spatial or
  temporal structure. That IS the "identical straight lines" tell. Fix: a
  2-D gust/curtain field on `(pxz, uTime)` multiplying `uIntensity` in
  BOTH shaders + per-drop length/width jitter beyond `fract(aSeed.y*91.7)`
  :64.
- Driver: `src/world/Weather.ts` PRESETS.storm :69, `rain.update` :281,
  per-frame uniforms Rain.update :290-313. Wetness in `weather/Wetness.ts`
  (Weather.ts:287), volume in `weather/VolumePass.ts`.

**25 · probe framings (no Shots.ts edit)** — copy
`src/tools/probes/vegwaterlook.mts` verbatim as the pattern:
`g.applyShot('zone_vannath')` :17 to boot, `rig.setShot({pos,target,fov})`
:109/:143/:162, `g.settle(26)`, `await window.__shot(name)`. Derive poses
LIVE from `w.riverWater.geometry` stations and `w.bodies` waterline walks —
never hard-code coordinates. Maidenwater = WorldMap.ts:680 (−3040,1460,r62),
find it as a Water.bodies entry. Run: `node src/tools/probe.mts
src/tools/probes/<name>.mts --shot tmp/shots/l7/x.jpg`. River sheet floor to
re-judge first: `water/RiverMaterial.ts:227` `alpha = clamp(max(...,
0.34*bodyRamp))`.

**26 · gradePad V-from-height** — `src/world/props/Wear.ts`
- The writer: `:773 uv.push(ct * s, st * s)` — U and V both horizontal
  metres; cliff branch walks `reachOut = 1.6` (:646) while y drops to
  `wall = -min(26, deepest+1.2)` (:711) = 16.25:1 stretch. Fix: cumulative
  3-D arc length — accumulate `hypot(Δs, Δy)` across the ring loop (`for i`
  at :671) and push as V; keep U as along-bearing metres so
  `groundMaterial`'s `repeat = 1/mpt` keeps fixed texel density.
- Update `PropMaterials.ts:144` — it documents the world-metre-UV contract
  by quoting this exact line.
- Only one real caller: `PoiKits.ts:715` inside `_apron` (:709-756) — feeds
  every POI apron. Judged frame: `poi_haven`.

### Mechanism notes
- One `reflectTarget` serves every body; mirror plane picked per frame by
  `_nearestLevel` :912 — per-body wave scale must not break the plane
  assumption. `_visible` :834 frustum-tests slab bounds (:488);
  `_shouldReflect` :848; stride 2 (:163); 384×192 target (:369).
  `_collectReflectRoots` :391 puts ONLY sky dome + terrain clipmap on
  `REFLECT_LAYER = 3` (:56).
- Sky drives water light every frame (~:780-815), mirrored to shoreMat and
  riverMats.

### Commands
- `node src/tools/probe.mts src/tools/probes/<x>.mts --shot tmp/shots/l7/<x>.jpg`
- `node src/tools/shoot.mts zone_galdin zone_vesperpool poi_haven --out tmp/shots/l7 --jpeg`
- **`--cold` capture mandatory after any shader edit** (see landmines).
- `pnpm run check` / `check:perf`; nanscan; `daemon.mts --health` /
  `--wait idle --for <s>` (never poll, never start a server).

### First commits
1. `probes/seawater.mts` + `probes/rainlook.mts` — framings for
   Maidenwater, two rivers, Galdin sea, storm ground close-up. Judge BEFORE
   touching anything (task 25 gates 23/24).
2. Wear.ts:773 arc-length V + PropMaterials.ts:144 doc; re-shoot poi_haven.
3. Wave-scale per-body uniforms in `_makeMaterial`; cold capture.
4. Gust/curtain field on uIntensity in both rain shaders; raise splash
   extent/count; cold capture.

### Landmines
- **A planar reflection that enables layer 0 is a full second scene
  render** — `reflectCam.layers.set(REFLECT_LAYER)` at :380/:879 must stay
  `set`, never `enable`.
- **`'body' : redefinition` killed the river surface for a day, every gate
  green.** `Water.ts` has `vec3 body` at :697. A GLSL compile failure is
  invisible on a warm page — one `--cold` capture after any shader edit;
  only `LINK_STATUS === false` is real.
- No shader locals named `cross`/`patch`; backticks inside `/* glsl */`
  templates terminate the string (foam comment :706-717 says so).
- `WORLD.seaLevel` is not "how high is the water here" (four files have
  had that bug) — ask `Water.mask` / `water/WaterMask.ts`.
- Never hard-code world coordinates in a probe.

### Done-when
Maidenwater/river/sea probe captures exist and were LOOKED at (tarn mottle
and river sheet each closed by a read frame or measured negative);
zone_galdin + zone_vesperpool show depth-graded water, a shoreline band and
more than one wave scale, cold-captured, no link failure; storm shows
non-uniform density + ground splashes; poi_haven wall at ~1:1; check green,
nanscan clean, perf unmoved.

## Lane 10 — Input truth (cold-start brief)

Mission: plan tasks 29–32. Fix the controls CARD, not the code — the code is
correct and self-documented; the UI lies about it in three places.

Owns: `src/ui/` (ControlsScreen, Prompts, ArmigerScreen, ui.css), plus
`src/world/vehicle/RegaliaSystem.ts` for rebinds and
`src/tools/probes/regaliadrive.mts` for the sign gate.

### Anchors (all verified 2026-08-29/30)
- The CORRECT reference table is `src/combat/CombatSystem.ts:1458-1470`
  (JSDoc): E point-warp, V lock-on, R Armiger, Z/X/B spells, T deposit-draw,
  Q warp-strike, F heavy, Space dodge, 1–4/5 weapons.
- Wrong card rows, `src/ui/screens/ControlsScreen.ts`: :32 says R for
  Point Warp (code: KeyE, CombatSystem.ts:1511); :35 says X for Armiger
  (code: KeyR, :1513); :36 says Y for Lock On (code: KeyV, :1512); :38 says
  6–8 for magic (code: KeyZ/KeyX/KeyB, :1516-1518); heavy-attack F missing
  from the Combat group entirely (:1486).
- `src/ui/Prompts.ts:21` repeats two wrong pairs: `['R','Point-Warp'],
  ['X','Armiger']`.
- `src/ui/screens/ArmigerScreen.ts:239` says R (correct) — contradicts the
  card's X. After the card fix they agree.
- Collisions (combat vs Regalia driving): KeyT drawEnergy
  (CombatSystem.ts:1519) vs Type-D (RegaliaSystem.ts:60); KeyB castSlot(2)
  (:1518) vs radio (:61); KeyV lock-on (:1512) vs camera (:58); KeyF heavy
  (:1486) vs enter/exit (:57). RegaliaSystem.ts:50-55's own comment claims
  no on-foot collisions — it is wrong; fix the comment too. Check
  mode-exclusivity first: if combat input is dead while driving, document
  rather than rebind; rebind the REGALIA side only where genuinely live.
- Armiger caption: `src/ui/ui.css:914` — `.arm-gauge .d` is 8.5px,
  `--ink-4` = rgba(198,214,240,0.34) (ui.css:14), no text-shadow, in a
  250px right-aligned box (:911). Give it a readable ink + text-shadow like
  its `.k`/`.v` siblings (:912-913).
- Steering gate: `src/tools/probes/regaliadrive.mts` computes
  `dh = Math.abs(h1 - h0)` — sign discarded. Add an assertion that drives
  KeyA (`st += 1`, RegaliaSystem.ts:549) and asserts the SIGNED heading
  change direction. This is the gate the mirrored-steering bug demanded
  (commit 7043084).
- "Two-column screens ~35% empty" (task 32 tail): could not be identified —
  the controls grid is four columns (ControlsScreen.ts:12-70, ui.css:887).
  Capture the menu screens (`ui-shoot.mts`), look, and either name the real
  screen or close the item as a measured negative.

### Commands
- Captures: `node src/tools/ui-shoot.mts --jpeg` (menu shots);
  `node src/tools/shoot.mts combat_hud --jpeg` for the HUD strip.
- Gates: `node src/tools/uxcheck.mts`, `node src/tools/probe.mts
  src/tools/probes/regaliadrive.mts`, `pnpm run check`.

### First commits
1. ControlsScreen rows + Prompts.ts pairs + heavy-attack row (one commit —
   card truth).
2. Collision audit result: rebinds on the Regalia side where live + the
   RegaliaSystem.ts:50 comment correction + ControlsScreen rows for both
   modes.
3. regaliadrive signed-turn assertion.
4. Armiger caption restyle.

### Landmines
- Every instrument agreed while the steering was mirrored — a
  self-consistent frame fools all derived checks. The signed assertion must
  reference WORLD heading change under a known key, not any Regalia-internal
  quantity.
- `settings`/keybind hooks: none — bindings are hardcoded key strings at the
  sites above.

### Done-when
Every documented binding matches the code (uxcheck green, manual read of the
card vs CombatSystem JSDoc), regaliadrive asserts turn sign, the caption is
legible in a capture, collisions documented or rebound.

## Lane 11 — Fight shape (cold-start brief)

Mission: plan tasks 33–36. A wild den fight lasts 5.8–17 s and costs Noctis
0.8% HP at party level 27 — combat has no danger. Exit: median den 18–30 s,
Noctis pays ≥15% HP, combatloop 31/31, both perf gates certify.

Owns: `src/combat/`, `src/game/encounters/`, `src/game/rpg/`,
`src/tools/probes/fightshape.mts`.

### Anchors (verified)
- **Instrument first**: `fightshape.mts` prints 3 rounds, per-round
  `duration Ns` at :328, damage shares at :307-317, warp casts at :262/:329.
  NO median/aggregation exists — add it (run more rounds, print median +
  HP-paid) BEFORE tuning anything, then record the baseline.
- `RpgSystem.enemyScaling` — `src/game/rpg/RpgSystem.ts:720` JSDoc says
  "given the party's level"; :721 body is `nightScaling(this.day.hour,
  isDaemon)` (Stats.ts:507-525) and never reads the party. Decide:
  implement the party read or fix the doc. Note `daemonPressure()` at :724
  DOES read `this.party.averageLevel` — the neighbouring pattern.
- `EncounterDirector.activate` feeds levelBonus into every territory
  (:240-241, daemons full, others ×0.4); explicit per-spawn levels bypass
  it (only `vore_pack` lv7, SpawnTables.ts:159). Duplicated in spawnRoamer
  :353-354.
- Pack-size levers: `Pack.maxEngaged` default 2 (`Pack.ts:49`), engage gate
  :127; wild dens `passive ? 2 : 3` (`WildTerritories.ts:358`); authored
  default 2 with six 3-overrides (SpawnTables.ts:161,194,213,221,227,237);
  `spawnRoamer` `total >= 5 ? 3 : 2` (EncounterDirector.ts:349-352);
  bosses 3→4 (BossFight.ts:79,263). Roster counts [1,1]→[4,7]
  (WildTerritories.ts:108-160).
- `LEVEL_LIFT = 1.0` (WildTerritories.ts:222) is a hand-set constant with a
  design-comment ceiling argument (:207-221), not a mathematical
  saturation. Wild-roster top: Red Giant 22 000 hp lv50
  (RedGiant.ts:32-33). Bestiary-wide: Deadeye 34 000, MagitekArmour
  32 000, Titan 180 000 — do not repeat "top species 22 000".
- Warp-strike throughput: measure with fightshape's by-source shares; the
  recorded "3–12 casts" matches `dpsshare.mts`'s DISTANCE labels
  (:113-115: "from 3 m / from 12 m") — do not trust it as a cast count.

### Commands
- `node src/tools/probe.mts src/tools/probes/fightshape.mts` (baseline
  BEFORE any tuning, again after each lever).
- `node src/tools/combatloop.mts` (must stay 31/31),
  `pnpm run check:perf` for the two perf gates.

### First commits
1. fightshape median + HP-paid + more rounds; record the baseline in this
   handoff.
2. enemyScaling: doc-or-implementation decision, applied.
3. One lever at a time (maxEngaged, roster counts, warp cooldown/damping),
   fightshape between each.

### Landmines
- The steering lesson: a lever that changes AI behavior can be
  self-consistently wrong — pair every fightshape delta with one watched
  capture (`combat_wide --jpeg`) and look at it.
- Perf: more engaged enemies = more skinned rigs mid-fight; watch the
  gameplay gate's 33 ms rule.

### Done-when
fightshape median 18–30 s with Noctis paying ≥15% max HP across ≥5 rounds,
combatloop 31/31, perf + gameplay gates certify.

## Lane 12 — The playtest's own list (cold-start brief)

Mission: plan task 37. This lane is DELIBERATELY idle until R2 (the single
post-build 30-minute human playtest, §3 of the plan) reports. Its queue is
the playtest's ranked what-felt-broken list, and §4 keeps refilling it
until the <3-broken-feels bar or a measured plateau.

Owns: nothing until R2 lands; then whatever files its items name (negotiate
via TASKS.md if another lane owns them).

### Named candidates that WAIT here (do not pre-empt the playtest)
- Fociaugh's approach: fresh capture (2026-08-29) shows NO cave mouth in
  frame at all; the apron is `fociaugh_menace`'s, 70 m away — `fociaugh`
  itself is excluded from aprons at PoiKits.ts:2776-2795. Talus-ramp design
  is written in commit e5557e5's MESSAGE (probes only in the commit).
- Balouve: headframe on bare dirt, no adit/sill in poi_dungeon_mine, plus a
  ghost-repetition artifact up the right trestle legs.
- Malacchi Pond: no pond — nearest water 133.5 m away, 28 m below
  (recorded in-code at PoiKits.ts:2158-2165); either hollow the site so
  `findTarns` (Tarns.ts:79-186) seats a body, or move the pin.

### Method when R2 lands
Rank by the human's list order, not by cost. Diagnose before fixing (read
project/LANDMINES.md "Diagnoses that were wrong" first). One item per
commit; capture-and-look per BRIEF.md.

### Done-when
The playtest's list is empty or every remaining row is a measured negative,
and the follow-up session reports <3 broken feels.

## Lane 13 — Memory and boot (cold-start brief)

Mission: plan tasks 38–41. Tab 1 246 MB → under 800 MB
(`bootprof --mem --play --prod`; note the mem page boots `?q=ultra`).

Owns: `src/engine/` except `postfx/`; the boot-cache items touch
`src/world/props/Landmarks.ts`, `Rocks.ts`, `src/world/Vegetation.ts` —
coordinate via TASKS if those lanes are live (lane 18 owns PoiKits, not
these files).

### Anchors (verified)
- skinWeight: `src/characters/rig/Geo.ts:250`
  `new THREE.Float32BufferAttribute(this.sw, 4)`; contract rows Geo.ts:316
  and Sculpt.ts:512 `['skinWeight', 4, Float32Array]`; enemies
  RigBuilder.ts:85,118,170; NpcShadow.ts:71-76 clones. Switch to
  normalized Uint8 (glTF convention) and update the contract rows +
  `assertAttributeContract` expectations. ~15 MB recorded
  (AttrPack.ts:9, memory-cut.md:232-236).
- AttrPack: `src/engine/AttrPack.ts`; only callers Dungeons.ts:233
  (whole-scene at boot) and :387 (interior on enter). Streamed POIs bypass
  it: add one call where POI kit geometry lands — `src/world/Props.ts`
  (PREBUILD at :113, streaming path nearby). That file is a NAMED
  cross-lane one-liner: explicit-pathspec commit. 115 sites stream (124
  POIs − hammerhead − 8 prebuilt).
- Towns census: recorded 3.70 M resident verts, lestallum 1.34 M +
  galdin_quay 1.28 M (TASKS.md:24, geometry-bake.md:174). They are merged
  per-material + one 670 k-vert shadow proxy (PoiKits.ts:2845,2947 — the
  largest single geometry). Census via
  `src/tools/probes/geofootprint.mts` + `memowners.mts`; cut what no
  camera can reach (interior faces, underside).
- Boot caches: `bakedParts` exists at PartBuilder.ts:261, used only by
  Megastructures (:396,481,769,1108). `Props.landmarks` is
  PartBuilder-shaped WITH a root (Landmarks.ts:121-166) — a bakedParts
  swap, ~46 ms. `Rocks` = two rootless TileStreams (Rocks.ts:2624,2643) —
  needs its own cache entry shape, ~78 ms. `Vegetation.prime` = three
  phases (Vegetation.ts:70-72), 610 ms — cache the RESULT; deleting it is
  a measured negative (hero_full moves 13.359/255, LANDMINES.md); the
  streamer's tile bookkeeping must restore with the matrices.

### Commands
- `node src/tools/bootprof.mts --mem --play --prod` (the exit instrument).
- `node src/tools/probe.mts src/tools/probes/memowners.mts` /
  `geofootprint.mts` for the census.
- After ANY merge: `pnpm run build:full` (plain build deletes the
  painted-face cache without replacing it — 2.5 s cold-boot regression).

### First commits
1. skinWeight Uint8 + contract updates (biggest single win, unblocks lane
   19's 29 NPC rigs).
2. AttrPack call in Props.ts (explicit pathspec, one line).
3. Census report → targeted town cuts.
4. Boot caches, one system per commit, bootprof before/after each.

### Landmines
- "Releasing an index entry frees nothing — every entry carries the whole
  container; one surviving key pinned 134 MB" (STATUS history).
- `performance.memory` is frozen — use bootprof's instrumentation, not the
  browser number.
- Toggling a light's `visible` recompiles 43 programs (9.5 s) —
  LightBudget pins counts; don't touch light visibility while optimizing.

### Done-when
`bootprof --mem --play --prod` reports tab < 800 MB with the corpus
unchanged at floor and boot not regressed (compare docs/BOOT_PERF.md).

## Lane 14 — First load (cold-start brief)

Owns: `src/engine/TexBake.ts`, `GeoBake.ts`, `src/tools/bake.mts`,
`src/tools/coldload.mts`. `texbake.mts`/`vite-plugin-bake.mts`/`FieldBake.ts`/
`FieldCodec.ts` are shared — land those as explicit-pathspec commits.
**Human decision: the demo launches on a PUBLIC URL — this lane is
mandatory and the DoD requires coldload against the deployed origin.**

### Anchors per task

**42 — first-frame marker**
- `coldload.mts:264` installs WATCH (rAF chain + longtask PO + #boot-label
  observer); `:88-114` READ — `transfer` summed at `:96` over ALL
  resources, no time cut-off; `:271-277` goto → waitFor `GAME.ready` →
  report.
- `GAME.ready` set at `Game.ts:340`, AFTER `post.render()` (`:337`) — ready
  is already one frame past first render. Honest marker = first rAF after
  that, or `boot.classList.add('done')` in `main.ts:24`; `game-ready`
  CustomEvent at `Game.ts:341`; `BootProfile.ready` at `BootProfile.ts:124`.
- **The change that makes tiering measurable: sum only
  `r.responseEnd <= firstFrameMs`** in READ (`:94-102`). Today a deferred
  tier landing at t+8 s still counts, so tiering would show zero
  improvement. Add `firstFrame` to `ColdRead`, report
  `transfer@firstFrame` alongside total, gate on the former.

**43 — tier the bake**
- Fetch sites: `TexBake.ts:165-190` (`loadTexBake` fetches TEX + TEXC in
  one Promise.all `:172-186`); `GeoBake.ts:254-277`;
  `FieldBake.ts:115-139`. Path constants `TexBake.ts:55-56`,
  `GeoBake.ts:64`, `FieldBake.ts:21`. Kick-offs at module eval:
  `TexBake.ts:431`, `GeoBake.ts:390` — all transfers start before
  Game.init().
- texc consumers: `Face.ts:1564 bakedCanvasMips` ← paintFace ← buildHead ←
  `Character.ts:117` (heroes, systems #8/#9) and `NpcRig.ts:119` (#24).
  `bakedCanvasMips` rejects a chain not ending at 1×1 (`TexBake.ts:329`)
  and falls through to `build()` — built-in repaint fallback.

### Mechanism notes — the measured fetch graph
- `terrain.bin.gz` 33.2 MB (57.7 inflated), awaited `Terrain.ts:166`,
  system #2. Sections gz: h 12.0, ctrl 8.3, far 2.9, layerSurf 3.6,
  layerAlbedo 3.0, layerDetail 1.7, farCtrl 0.9, hydro 0.8.
- `tex.bin.gz` 31.0 MB (72.0), 157 entries — **awaited at `Sky.ts:502`,
  system #1** (docstrings claiming Props are stale); also Props.ts:52,
  Hammerhead.ts:172, Dungeons.ts:193. By namespace gz: props 16.7,
  **dgn 6.8 (only consumed on first Dungeons.enter() — pure tier-2)**,
  town 5.7, sky 1.7.
- `texc.bin.gz` 20.5 MB (67.1), 132 entries = 12 faces × 11 mips. Fetched
  inside the same promise as tex, so it blocks Sky #1 though its first
  consumer is #8. **Mip split: level 0 = 14.4 MB gz; levels 1..10 =
  6.1 MB gz. Low-res tier = truncated chain: ship 1..10 (512² base),
  defer level 0.**
- `geo.bin.gz` 30.8 MB (107.5), 14 keys, awaited Water.ts:221 (#3) +
  Props.ts:57. **`GeoBake.ts:261` skips the fetch unless `?q=ultra`** —
  coldload navigates `?q=high` (`:271`), so today's run doesn't fetch geo
  at all: that (not a missing file) is why BOOT_PERF records 85.5 MB/5.
  The ~116 MB/6 figure is the q=ultra number. Per-key gz: mega/meteor
  10.2, poi/lestallum 5.8, poi/galdin_quay 5.6, water/shore 2.6.
- Bundle 1.0 MB wire; DevSuite already lazy (`main.ts:35`).

**Tiering shape: split files, not HTTP Range.** Each container is one gzip
member with a JSON index at the front (`TexBake.ts:131-140`,
`FieldCodec.ts:135-151`) — no way to read the index without inflating the
whole thing (`GeoBake.ts:134-140` says so). `publicDir`
(`vite.config.mts:44`) copies baked/ verbatim; an extra file costs one
writer line + one fetch. Range fights `Content-Encoding: gzip` on most
hosts.

**Budget arithmetic for ≤25 MB:** free wins — texc level 0 → tier 2
(−14.4), tex dgn/* → tier 2 (−6.8), geo mega/meteor + two big POIs →
tier 2 with regenerate-on-miss (−21.6 at ultra). Terrain is the wall
(33.2): (a) split layer* (8.3 gz) — `Terrain.ts:179` already has a
generator fallback; (b) **quantise h f32→u16** (range −48.1…597.2 m, step
0.0098 m): 12.0 → 5.3 MB gz. Both → terrain ~19 MB. Realistically
tex/props (16.7) must split too or tier 1 keeps the generator path for
props/rock*.

### Commands
```
node src/tools/coldload.mts --prod                    # today's default (q=high; NO geo fetch)
node src/tools/coldload.mts --prod --extra q=ultra    # the ~116 MB / 6-request truth
node src/tools/coldload.mts --prod --gate             # as check.mts:261-262 runs it
pnpm run build:full                                   # NEVER plain build in this lane
node src/tools/texbake.mts --canvas --force           # after ANY TexBake.ts/Face.ts edit
node src/tools/texbake.mts --geo                      # after ANY GeoBake.ts/Field edit
node src/tools/daemon.mts --health
```

### First commits
1. coldload.mts only: `firstFrame` in WATCH/READ/ColdRead, report bytes to
   first frame, move the gate onto it. Land BEFORE touching any byte of
   the bake (rule 3 — without it task 43 is unmeasurable).
2. coldload.mts only: `--origin <url>` that skips buildServer (`:244`) and
   navigates the deployed URL — the DoD's deploy line cannot be satisfied
   otherwise.
3. coldload.mts only: default `?q=ultra` or print a loud note that q=high
   skips geo (silently under-reports by 30.8 MB).
4. TexBake.ts only: split loadTexBake into tex and texc loaders so
   Sky.ts:502 stops awaiting the face bake; one-liner follow-ups at
   Sky.ts:502/Props.ts:52 as own pathspec commits.
5. texbake.mts + TexBake.ts: emit texc-lo (mips 1..10) + texc-hi (mip 0);
   tier 1 uploads the 512² chain; tier 2 swaps mip 0 + needsUpdate after
   first frame.

### Landmines
- **TexBake.ts is in CANVAS_SOURCES (`texbake.mts:87`) — editing it
  deletes texc.bin.gz**, and the plugin can't re-record without a browser.
  Every plain `pnpm run build` costs the painted-face cache (~2.5 s boot,
  every gate green). `build:full`, always. Same: GeoBake.ts → GEO_SOURCES
  → geo.bin.gz (~1.2 s).
- **Pre-commit runs vite build** — a commit prunes the caches too; bake
  after the tree settles, never mid-measurement.
- **src/public/baked/ is a shared symlink across worktrees**
  (`daemon.mts:872-878`) — a `--force` rewrites every lane's artifacts.
  Announce first.
- `TRANSFER_MAX = 120e6` (`coldload.mts:210`) was set against the
  geo-less 85.5 — it must come down to the new first-frame budget or the
  gate certifies nothing.
- **Quantising h changes Field.h → drawnHeightAt → every POI seat**
  (`GeoBake.ts:44-52`). Owe a --geo re-bake + seatcheck/heightcheck pass.
- A stale bake is the only cache failure with no symptom — any new tier
  file needs a stamp + prune path in vite-plugin-bake.mts.
- A shortened-at-the-top mip chain is silently accepted by
  bakedCanvasMips (that's the design) — assert the level-0 size in the
  upgrade path.
- Prod mangles class names — `Game.add()` name fallback breaks under
  --prod (`daemon.mts:793-795`); looks like a boot bug, isn't.

### Done-when
coldload --prod --gate prints bytes-to-first-frame and gates on it;
`--extra q=ultra` reports ≤25 MB to first frame with deferred tiers
landing after the marker; `?nobake=1` and a wiped baked/ still boot
(every miss path regenerates); tier-1-only page renders faces (512²) with
no black head; build:full emits every tier into dist/baked/ and
`daemon --health` stays green; deployed to the public URL and
`coldload --origin <url>` reproduces ≤25 MB over the real wire;
docs/BOOT_PERF.md updated with the new table + the q=high/q=ultra geo
caveat.

## Lane 15 — Idle CPU + RT budget + grain (cold-start brief)

Mission: plan tasks 44–45 + task 27 (grain). Idle is ~100% of a core at
60 Hz; `post.render` is 74–77% of a 6.2 ms frame (docs/BOOT_PERF.md:99;
runtime-facts.md:27 says 5.8 — re-measure first, do not trust either).

Owns: `src/engine/postfx/`, `src/engine/PostFX.ts`.

### Anchors (verified)
- Exit instrument: `node src/tools/idlecpu.mts --q high --dpr 1.5` — wraps
  post.update/post.render at idlecpu.mts:129. Target: idle < 30% of a core.
- The 60 fps cap (Game.ts:204 maxFps, honored :423) halves 120 Hz panels
  only — a 60 Hz panel is unchanged. The lever is the chain itself.
- RT inventory (code-derived, audit 2026-08-29): 28 targets ≈130 MB by
  bootprof's own formula (bootprof.mts:76-89 — note it ignores `samples`
  on the MSAA rtScene, so the real number is higher). Biggest singles:
  rtScene (full, MSAA + depth, PostFX.ts:215-226), rtVel (:228-240),
  composer ×2 (:242-250), TAA history ×2 (TaaPass.ts:39), GTAO ×3
  (via PostFX.ts:272), SMAA ×2 (:339), Exposure 2+6 small, Bloom 5+2
  (BloomPass.ts:85,337-346), DoF 2 half (DofPass.ts:229-232). The recorded
  181 MB/33 includes world-owned RTs (Water 384×192, Clouds+shadow 512²,
  Atmosphere, GodRays w/4, VFX.depthRT half, VolumePass) — do not charge
  those to this lane, but the <120 MB exit is measured by the same walk.
- Profile per pass FIRST: add a per-pass timer around the composer chain
  (or use the existing perf probes: probes/perfpasses.mts exists — read it,
  it likely already does this). Cut or gate the most expensive; candidates
  from the pass list: TAA at idle (static frame), GTAO rate, SMAA vs MSAA
  redundancy, exposure chain every frame, DoF when disabled.
- Grain (task 27): grain sits at full amplitude on flat sky (round 16 tell
  #6). Find the grain term in the grade pass (GradePass / grade.uniforms);
  modulate by luminance or mask sky (depth == far). Small, do it while
  profiling.

### Commands
- `node src/tools/idlecpu.mts --q high --dpr 1.5` before/after each cut.
- `node src/tools/probe.mts src/tools/probes/perfpasses.mts` (per-pass
  costs), `perfablate.mts`/`?post=` ablations.
- Full corpus diff after any visual change: `pnpm run check` (shot-baseline
  gate) — a gated pass must not change pixels at floor.

### First commits
1. Per-pass idle profile recorded in this handoff (the evidence).
2. One gate/cut per commit, idlecpu + shot-baseline between each.
3. Grain modulation.
4. RT cuts (share/downsize targets), walk-reported <120 MB.

### Landmines
- `?post=plain` bisects the chain in 30 s — use it before blaming a pass.
- ContactShadowPass: any march that walks the depth buffer needs a
  screen-space step cap, and capping a length invalidates every constant
  expressed as a ratio of it (thickness!). Both entries in LANDMINES.md.
- GTAO sets scene.overrideMaterial (alpha-test lost) and reconstructs
  normals from depth when not fed the G-buffer — known artifacts if you
  re-plumb it.

### Done-when
idlecpu < 30% of a core at 60 Hz, RT walk < 120 MB, corpus at floor,
perf + gameplay gates certify.

## Lane 16 — Gates (cold-start brief)

Mission: plan tasks 46–48. Three instrument changes other lanes depend on —
ship 46 and 47 EARLY (lane 1 blocks on 47).

Owns: `src/tools/`.

### Anchors (verified)
- Bake-artifact gate (46): none of check.mts's 23 gates (:141-290) looks at
  `src/public/baked/`; the only existsSync is check-baseline.json (:858). A
  cold bake is treated as 41 s of latency (:306). `daemon.mts` already
  warns: bakedGeometry existsSync at :2751, WARNING prints at :2944-2952
  (geo + texc). Add a fast gate: assert
  src/public/baked/{terrain,tex,texc,geo}.bin.gz exist and are non-trivial
  size; red with a message naming `pnpm run build:full`. This gate would
  have caught the stale 85.5 MB first-load number.
- facecheck VOID (47): facecheck.mts:765-772 — voided heads (`clipped =
  mouth.mean > 212 || cheek.range > 60`) are skipped and the run still
  PASSes (:809-810). Known VOIDs documented at :145-195 (Gladiolus beard,
  Noctis fringe shadow). Make VOID a FAILURE (or a separate red row) so
  lane 1's "facecheck green" means the pixel rows actually ran. Expect
  lane 1 to fix the underlying heads; coordinate the flip so check isn't
  red overnight for a known cause — land the gate with a
  `--allow-void` escape the coordinator can drop later, default strict.
- NaN sweep (48): grep all shaders for unguarded `normalize(` and `pow(`
  with a varying base — both of this month's NaNs were operations
  undefined on their input (LANDMINES: trail ribbon pow(vUv.x<0), terrain
  normalize(vec3(0))). In-shader NaN tests fold away on this backend —
  test bits: `(floatBitsToUint(v) & 0x7f800000u) == 0x7f800000u &&
  (v_bits & 0x007fffffu) != 0u`. Findings go to the OWNING lane via
  project/TASKS.md rows, not fixed here (rule 4).
- Also useful early (from the plan's shot work): noise floors for any new
  judged shots come through `imgdiff.mts` floors
  (project/noise-floors.json, 20/142 measured, DEFAULT_LIMIT 2 at :229).

### Commands
- `pnpm run check` (the suite, tree-sha cached; `--no-cache` to force).
- `node src/tools/facecheck.mts` directly while changing it.
- `node src/tools/probe.mts src/tools/probes/nanscan.mts` after ANY shader
  finding lands elsewhere.

### First commits
1. Bake-artifact gate (small, immediate value).
2. facecheck VOID strictness + `--allow-void` escape, announced in
   project/handoff/ for lane 1.
3. NaN sweep report → TASKS.md rows per owner.

### Landmines
- A PASS is cached against the tree sha — after changing a gate, run with
  `--no-cache` once.
- Gates slow enough to skip get skipped: keep the bake gate < 100 ms.

### Done-when
check red on a missing bake artifact (verified by renaming one), facecheck
VOID visible as failure, NaN sweep filed per owner, nanscan 0/corpus.

## Lane 17 — Spine, dungeons, wayfinding (cold-start brief)

Owns: `src/game/` (rpg, encounters, story), `src/world/dungeons/`,
`src/ui/screens/WorldMapScreen.ts`, `src/tools/probes/mainchain.mts`.
**NOT yours:** `SpawnTables.ts` + `WorldMap.ts` POI rows (lanes 18/19) —
those land as explicit-pathspec one-liners. `Quests.ts` is yours FIRST;
lanes 18/19 queue behind you.

### Anchors per task

**49 · un-soft-lock ch3**
- `Quests.ts:330` `fetch_('sword','sword_wise',1,…,at('tomb_wise'))` —
  nothing grants it (`Inventory.ts:286` defines; no shop `Inventory.ts:
  840-858`; no drop). Rewrite as `reach('sword','tomb_wise','Claim the
  Sword of the Wise', at('tomb_wise'), 18)` — the quest's own reward
  already hands the item (`Quests.ts:332`), so `reach` alone breaks the
  lock with no dependency on lane 18's Tombs.ts.
- POI exists: `WorldMap.ts:451` tomb_wise (66,−1514) lv12 r60.
- Chest seed: `Keycatrich.ts:109` Imperial Vault — append `'sword_wise'`.
- **Shim to delete, same commit**: `mainchain.mts:71-73` — the
  `o.type === 'fetch'` branch grants the item to itself. After task 50 the
  gil fetch is gone too, so the whole fetch branch goes; any surviving
  fetch must fail loudly.

**50 · re-author main_ch1_pauper** — `Quests.ts:299-308`.
- Self-completion source: `RpgSystem.ts:148` STARTER_QUESTS.complete =
  ['main_ch1_departure','hunt_killer_wasps'] + seeded 42 180 gil;
  `QuestLog.settle` (:963-985) closes it on accept.
- New acts: `{id:'bounty', type:'quest', target:'hunt_sabertusks',
  count:1}` (live-but-incomplete in the seed); `talk('cindy',…)` (fires via
  Npcs.ts:486 generic notify); a new `buy` objective.
- `'buy'` plumbing: add to ObjectiveKind (:180-182); `Inventory.buy` is
  `Inventory.ts:779-789` — emit after spendGil (:787) and add one line in
  `RpgSystem._wire` next to the item-gained listener (:335-336):
  `this.quests.notify('buy', { target: def.category === 'weapon' ?
  'weapon' : id })`. Hammerhead stocks iron_sword/bronze_spear/handgun/
  buckler (Inventory.ts:843).
- main_ch1_departure already owns `talk cindy` — use different verb copy.

**52 · dungeon enemies**
- Author rows (6, 3 bosses): `Keycatrich.ts:117-118` (mt-squad ×5,
  mt-commander boss), `Balouve.ts:118-119` (goblin-pack ×4, iron-giant
  boss), `Fociaugh.ts:108-109` (sabertusk-pack ×3, mindflayer boss).
  Shape: `EncounterSpec` Layout.ts:283-291 `{at:[x,z], r, kind, count?,
  boss?, name?}`; `Layout.encounter()` :514-518 (rewrite its "spawn
  nothing" doc). Only consumer today: DungeonMap.ts:111.
- Wrapper: new public `EncounterDirector.spawnAt(spec, pos,
  {interior:true})` — copy the pack-spawn body of activate() (:236-273)
  (`new Pack(...)`, `this.enemies.spawn(key, {pos, level, pack, leash,
  owner})`, `this.packs.push(pack)`) but SKIP `this.active.set()` so
  `_streamOne` (:970-996) never distance-deactivates/respawns it.
- Bosses: build a SetPiece LITERAL in spawnAt and hand to
  `new BossFight(def, this)` + `fight.begin(pos)` — do NOT add SET_PIECES
  rows (lane 18's file). Mirror `HuntRuntime.armSetPiece:80-98`.
  `BossFight.begin` (:76-110) stands the boss 16 m off the party.
- **Species keys** (Bestiary.ts:121-143): there is NO `mindflayer` and NO
  `magitek_commander` — map mt-commander → `magitek_armour` (kind
  'imperial', dropship:false) and mindflayer → `necromancer` or
  `bussemand`.
- Call site: `Dungeons._doEnter` (:375-437), after `_patchTerrain()`
  (:408) and party placement (:411-424), before `state='inside'` (:433).
  World pos = `d.origin + [at[0], floorAt, at[1]]` (Dungeon.ts:279-294).
  Track spawned ids on the Dungeon record; clear in `_doLeave`
  (:439-476), respawn next enter() — "no respawn per visit" for free.

**53 · POI gate:** declared WorldMap.ts:353, doc :329, ~124 rows carry it,
**zero readers** (other `gate` hits: HuntBoardScreen.ts:48 unrelated,
Grazer.ts:79-82). Delete or comment inert; verify grep after.

**54 · haven rock** — `Ecology.ts:589-590` decorative haven at (−62,−46).
Promote with ONE POIS row near WorldMap.ts:395: `{ id:'spawn_haven',
type:'haven', zone:'longwythe', x:-62, z:-46, r:55, travel:true, lv:1,
… }`. HAVENS derives automatically (DayCycle.ts:86-96, level-sorted) and
`HAVENS[0].discovered = true` (:96) — **lv 1 moves the pre-discovered flag
off Cotisse, intended; say so in the commit.** HAVEN_RADIUS 14;
HavenCamp.ts:50 iterates. POI row = lane 18's file → explicit pathspec.

**55 · map → autodrive** — `WorldMapScreen.accept()` :372-384 is fast
travel; `Menus.ts:489` binds Enter/Space/pad-A. Add a second key in
`WorldMapScreen._onKey` (:402-407) — e.g. KeyI → **use
`RegaliaSystem.driveTo` (`RegaliaSystem.ts:348-352`), NOT setTargetPos
directly** — it wraps setTargetPos (AutoDrive.ts:68-71, road.nearest),
flips setAutoDrive(true), calls enter(true) if on foot. Gate on
`p.travel || POI_TYPES[p.type].drive` and `map.discovered.has(p.id)`;
close with `menus.setScreen(null)`. Prompt copy in `this.cardFt` (:250).

**56 · fog persist** — ctor reseed `WorldMap.ts:932`; only runtime writer
`Minimap.ts:170` → `discoverAround` (WorldMap.ts:1124-1136). Add
`map?: { discovered: string[] }` to SaveData (SaveGame.ts:41-58), write in
serialize (:150-176), restore in RpgSystem.loadGame (:740-750), bump
SAVE_VERSION (SaveGame.ts:18) → 4 with MIGRATIONS[3] beside :119-128:
`(data) => ({ ...data, version: 4, map: data.map ?? { discovered:
['hammerhead','hammerhead_layby'] } })`. Never edit an old migration.

**Chapter sanity** — Chapters.ts:38-56; scenes key off
`objective:main_ch1_departure:push` and `quest:main_ch1_pauper:accepted`
(also StorySystem.ts:325). `_advanceChapterLine` :164-173;
`completeChapter` :178-190. Re-authoring objectives touches neither key —
but do NOT rename the quest id; keep Hammerhead.ts:176 auto-accept.

### Mechanism notes
- `QuestLog.notify(type,{target,count})` (:1032-1074): objectives complete
  IN ORDER (:1053 blocks on earlier undone); matching is exact or
  `target:`-prefixed. `settle()` covers fetch/quest only — a `buy`
  objective is event-only, the notify is mandatory.
- `at(poiId)` THROWS at load on unknown ids — a typo is a boot failure.
  Never reference `spawn_haven` from Quests.ts before the row lands.
- `Dungeons._patchTerrain` (:538-548) redirects heightAt to the interior
  floor, so `EncounterDirector.ground()` (:195-199) already returns
  dungeon floors — call spawnAt only after _patchTerrain().
- `_hideExterior` (:495-520) keeps Enemies in KEEP_SYSTEMS — spawns stay
  visible inside.
- `EncounterDirector.update` keeps running inside: set `suppressRoamers`
  on enter and short-circuit `_stream` with an interior flag.
- `Dungeon.floorAt` returns null outside the carved volume — guard.

### Commands
```
node src/tools/probe.mts src/tools/probes/mainchain.mts     # exit for 49/50
node src/tools/probe.mts src/tools/probes/questchain.mts
node src/tools/probe.mts src/tools/probes/questaudit.mts
node src/tools/combatloop.mts                               # add a dungeon round (52 exit)
node src/tools/probe.mts src/tools/probes/slice.mts
pnpm run check
```

### First commits
1. Quests.ts:330 fetch→reach + mainchain fetch-branch deletion — ONE
   commit; mainchain is the proof.
2. Keycatrich.ts:109 chest seed.
3. ch1 re-author + ObjectiveKind 'buy' + Inventory.ts:787 emit +
   RpgSystem.ts:336 notify.
4. EncounterDirector.spawnAt alone (no callers) — commit, then wire
   Dungeons._doEnter.
5. gate: removal; spawn-haven POI row (separate pathspec).
6. WorldMapScreen drive-there; SAVE_VERSION 4 + fog persist LAST (touches
   the migration chain).

### Landmines
- Explicit pathspec only (shared index; hook blocks -am/-A/bare).
- Don't add SET_PIECES rows for dungeon bosses — literal in the director.
- SAVE_VERSION bump without MIGRATIONS[3] silently stamps old saves
  (migrate :137-142 falls through).
- A lv-1 spawn haven silently steals HAVENS[0].discovered — intended,
  state it.
- BossFight sets dir.boss; two armed at once clobber (startSetPiece:397
  ends the previous). One boss per room trigger.
- `_streamOne` deactivates anything in `this.active` 230 m away — interior
  origin can be km from the entrance. Keep interior packs OUT of active.
- mainchain also self-drives talk/reach via raw notify — fine (real world
  drivers exist); only the fetch branch lies.

### Done-when
mainchain reaches ch5 with the fetch branch DELETED, all main quests
complete, chapter ≥5; questchain shows ch1_pauper active-not-complete at
boot, ticking off a real hunt + real Cindy talk + real buy; combatloop
gains a dungeon round (Keycatrich MT patrol + commander via BossFight, no
respawn within visit, gone after leave, back on re-entry);
`grep -rn "\.gate" src` zero consumers; spawn haven in rpg.tables.havens,
campable, pre-discovered HAVENS[0]; map-picked Ignis drive arrives
end-to-end; save/reload keeps fog, v3 save loads clean.

## Lane 18 — Sectors and discovery (cold-start brief)

Owns: `src/world/map/WorldMap.ts` (POIS), `RoadGraph.ts` (NODES/ROUTES),
`src/game/encounters/SpawnTables.ts`, `src/world/props/PoiKits.ts` (AFTER
lane 19's H2 anchors commit), new `src/game/rpg/Tombs.ts`, new
`src/tools/probes/tombclaim.mts`. Cross-lane one-liners (own commits):
`Quests.ts` (2 hunts + 2 side quests — AFTER lane 17's spine),
`Chapters.ts:135 PLACES`, `StorySystem.ts:291`, `Foraging.ts:62 POOLS`,
`RegaliaSystem.ts:720`, `probes/longplay.mts` (--night).

### Row formats (copyable)

**POIS row** — `WorldMap.ts:372`. Fields: id, name, type, zone, r
(discovery radius) + x,z OR `at:'<road node id>'` (unknown node THROWS at
load, :918), travel?, lv?, does, gate (zero consumers).
```ts
  { id: 'threshold_stones', name: 'The Threshold Stones', type: 'landmark', zone: 'longwythe', x: 120, z: 900, r: 300, lv: 8,
    does: 'Leaning Solheim milestones on the old pilgrim road south.', gate: null },
  { id: 'old_kingsroad_end', name: 'Old Kingsroad End', type: 'parking', zone: 'longwythe', at: 'n_kingsroad_end', r: 46, travel: true, lv: 12,
    does: 'Turning circle where the south road gives up.', gate: null },
```
Types (:308): town/outpost/reststop/parking/haven/dungeon/menace/tomb/
imperial/chocobo/fishing/landmark; drive:true only town/outpost/reststop/
parking/chocobo. Corpus today: 124 rows.

**ROUTES row** — RoadGraph.ts:156; NODES :75; classes :46 (`trail` =
speed 0, reach 0, maxGrade 0.36, minRadius 6 — never used yet). `path`
alternates node-id strings (open/close an edge) with [x,z] shaping points.
```ts
  // NODES:  j_southroad: [-40, 11], n_pilgrims_rest: [-80, 2600], n_kingsroad_end: [-60, 2860],
  { id: 'route20', name: 'Route 20 — The Old South Road', cls: 'track',
    doc: 'South off the spine into the empty quarter.',
    path: ['j_southroad', [-20, 420], [140, 980], [280, 1880], 'n_pilgrims_rest', 'n_kingsroad_end'] },
```
Join Route 1 by inserting `'j_southroad'` into route1.path **between
`n_hammerhead` and `[-300,-2]`**. `roadcheck` asserts: drivable POIs within
class limit of an edge (town 320 / outpost 220 / rest 90 m); grades;
corner radii; **every 1-edge node needs a parking/town/outpost POI within
90 m** (class-agnostic, `deadEnds()` :660); no road below seaLevel+0.5.

**TERRITORIES / SET_PIECES** (SpawnTables.ts:126 via T() :83 + near()
:113; SET_PIECES :352):
```ts
  T({ id: 'southroad_tusks', name: 'The Old South Road', at: near('threshold_stones', 60, 120), radius: 30,
      when: 'day', level: 8, danger: 1, spawn: [{ key: 'sabertusk', count: [3, 5] }], patrolRadius: 22, respawn: 160 }),
  king_of_the_flats: { id: 'king_of_the_flats', name: 'King of the Flats', kind: 'field',
    at: near('saltgrass_flats', 90, -70), radius: 42, level: 24, boss: 'bandersnatch',
    adds: [{ key: 'sabertusk', count: 3, level: 16 }], music: 'boss-field' },
```
T() defaults: respawn 150, radius 26, when 'any', maxEngaged 2. Widen
`night_giant` at :252 from 0.55 → 0.4. `near()` THROWS on unknown POI —
POI rows land first, always. **Arming a set piece** = a QUEST_TABLE hunt
row with `setPiece:` (pattern `hunt_bloodhorn` Quests.ts:403: reach + kill
at the SAME at() waypoint).

**Tombs.ts** — clone `Deposits.ts`: anchor table like `Elemancy.ts:101
DEPOSIT_SITES` ({id,name,at:'<poiId>'} → worldMap.poiById, throws);
register block `Deposits.ts:240-258` (ix.register {id, pos, radius 6.5,
cone 200, priority 2, verb, label, yOffset 2.2, handler}); installed
lazily from RpgSystem.update's first tick, never init(). Claim grants:
`rpg.inventory.add(armId, 1, 'quest')` (Inventory.ts:546),
`rpg.ascension.awardAp('discovery')` (5 AP; AP_RULES Ascension.ts:139 —
add a tomb key or reuse 'discovery'), `rpg.quests.notify('fetch'|'reach',
{target})`, `hud.toast(...)`, area card via Triggers/ffxv-area. Royal-arm
ids (Inventory.ts:286-321): sword_wise, blade_mystic, sword_father,
axe_conqueror, trident_oracle, star_rogue, bow_clever, shield_just.
**Tomb POI ids vs display names are DELIBERATELY crossed**
(tomb_conqueror="of the Clever", tomb_clever="of the Fierce",
tomb_fierce="of the Wanderer", tomb_mystic="of the Pious", plus
tomb_conqueror2/tomb_mystic2/tomb_just/tomb_wise/tomb_tall/tomb_rogue) —
**pair on the NAME, not the id.**

**PoiKits** — dispatch map in build() (:551) keyed by poi.type; unknown
type = silently no geometry. `_landmark` (:2456) branches on
/lighthouse/.test(id) — add /graveyard/ and /stones/ branches the same
way. Primitives from BuildKit.ts: bag/box/cyl/post/xform/wallRun/plinth/
parapet/basaltColumns/bakeTone/toneVariant + PartBuilder loft/ring/
texelBox + rockGeometry; a torus half via THREE.TorusGeometry (lighthouse
gallery precedent).

**nightDanger** — RegaliaSystem.ts:720, no callers; returns
`p.spawn ? p.density : 0` off daemonPressure. Reuse
`EncounterDirector.spawnRoamer(def)` (:341) — it already picks a bearing
30-42 m out, scales, alerts, and fires the `encounter:warn` HUD event.
Pass `ROAMERS.find(r => r.id==='daemon_pack'|'ronin_duel')` (:289);
`rollRoamer` (:325) already filters on window + depth. Banter:
`story.talk.react('nightfall')`.

**Triggers** — `triggers.add({kind:'place'|'region'|'hour'|'quest'|
'combat', id?, once?, run})`, polled 4 Hz. **Trap: places() resolves
`Chapters.ts:135 PLACES` against ECOLOGY SITE types, not POIs** — a new
landmark needs a PLACES row {id,name,sub,site,radius} or it can never
fire. Area card = `window.dispatchEvent(new CustomEvent('ffxv-area',
{detail}))` (StorySystem.ts:294). Read plaque = an interactable, copy
`Hammerhead.ts:1094-1110` (`ix.say({speaker, nodes:{a:{lines,next:null}}})`).

**Gates.** roadcheck; drawcheck (--set-baseline only LOWERS; on a subset
it DELETES unmeasured entries — full corpus or nothing); perfpoi (33 ms
per site); reachcheck + must-run.json (add Tombs rows). **No gate
hard-codes 124** — every literal 124 found is prose; update in one sweep.

### Anchors per task
- 57 south: POIS ×5 → :372; j_southroad + terminals → RoadGraph:75; route
  → :156; 2 T() + set piece + night_giant widen; rank-3 hunt +
  side_old_road → Quests.ts (after lane 17).
- 58 NE: route (trail) + 3 POIs + graveyard branch in _landmark;
  graveyard_watch/peak_coeurls territories.
- 59-62: POIS + T() rows; saxham Read plaque; disc_rim_overlook place
  trigger.
- 63 Tombs.ts + tombclaim probe. 64 nightDanger. 65 Elemancy micro-rows,
  Foraging weight, PLACES rows, plaques.

### Commands
```
node src/tools/roadcheck.mts            # ~1 min, builds the real field
node src/tools/drawcheck.mts --worst 30
node src/tools/probe.mts probes/perfpoi.mts
node src/tools/probe.mts probes/tombclaim.mts
node src/tools/probe.mts probes/longplay.mts --ttl 40 --turbo
node src/tools/reachcheck.mts
pnpm typecheck && node src/tools/check.mts
```

### First commits
1. NODES + route20 + Route 1 junction insert (expect the dead-end failure
   until commit 2).
2. Five south POIS rows incl. the parking terminal; roadcheck + drawcheck
   green.
3. Territories + set piece + night_giant widen; hunt/side rows (own
   pathspec, after lane 17 releases Quests.ts).
4. Tombs.ts + tombclaim + must-run entries.
5. Route 21 (trail) + NE POIs + bone-arch branch.
6. nightDanger wiring; PLACES/Triggers/plaques/micro-deposits.

### Landmines
- **`route19` already exists** ("Vesperpool Causeway", RoadGraph.ts:268) —
  use ids route20/route21.
- **Route 1's Z must decrease monotonically westward** (comment :76). The
  plan's junction z=30 breaks it — use z ≈ 11.
- Dead ends are class-agnostic: a trail terminal needs a parking POI
  within 90 m, or author the trail as shaping points off an existing node.
- `trail` has reach 0 / speed 0 — never hang drive:true off one;
  RoadGraph.nearest() is class-agnostic and will hide unreachability.
- **Corridor carving is automatic AND suppresses ridge belts near roads**
  (Field.ts:894) — a 2.9 km track flattens a 59° arc of Leide; re-shoot
  affected corpus categories, expect terrain diffs beyond the road.
- PAD radii (PoiKits.PAD_R:403) plateau vegetation via Ecology.ts:176
  with PAD_SKIRT 2.2 — a big landmark r clears a big veg hole; check
  probes/padclear.mts.
- SKIP_IDS (:140) — any POI co-located with lane 19's hand-built city
  geometry must be added or you get a kit inside a set.
- `old_book` is ALREADY in the rock pool (Foraging.ts:77) — task 65 needs
  a weight/second entry or a south-biased pool, not an insertion.
- _landmark's stele takes no apron — steep sites sag (longwythe_peak's
  17.5 m precedent).
- PREBUILD pays at boot — the plan's ≤1 non-light kit per 2400 m draw
  radius is the budget.

### Done-when
roadcheck 0 failures with both routes + all new drivable POIs; drawcheck
under baselines and 800; perfpoi no site over 33 ms; reachcheck visits 10
tombs; tombclaim claims 8 arms and ArmigerScreen lists them; longplay
--night 30 min with the road daemon roll firing; POI count ~137 with the
prose 124s updated in one sweep; each new landmark fires exactly one
ffxv-area card; three Read plaques answer via ix.say.

## Lane 19 — City hubs (cold-start brief)

Owns: `src/world/town/` (new `CityHub.ts`, `Shops.ts`), `Quests.ts` rows
(AFTER lane 17's spine), `src/characters/npc/Npcs.ts` + `NpcCast.ts` +
`NpcDialogue.ts`, and ONE first commit in `PoiKits.ts` (H2 anchors — lane
18 queues behind it). Not yours: `ShopScreen.ts`/`HuntBoardScreen.ts`
(lane 10), `Game.ts` boot order (two-line explicit-pathspec commit),
`Shots.ts` (lane 3→21).

### Formats (copyable)

**H2 anchor export.** `KitResult` at PoiKits.ts:200-215; `_town`
:1377-1459. Transforms computed and discarded: plaza disc :1407, stall
ring :1415-1445 (`place` matrix :1439, a=(i/6)·2π, radius 7.5), light
spheres :1444 (r 10.5, y 4.4). **Meta rides bakedParts → JSON.stringify
(GeoBake.ts:214) — anchors must be PLAIN NUMBERS, never Vector3.** Store
kit-local (post-yaw, pre-position):
```ts
// KitResult:
  anchors?: Record<string, [number, number, number]>;
// _town, inside the stall loop after `place`:
  A[`stall${i}`] = lp(new THREE.Vector3(0, 0.5, -cd/2 - 1.1).applyMatrix4(place));
  A[`light${i}`] = lp(new THREE.Vector3(Math.cos(a)*10.5, 4.4, Math.sin(a)*10.5).applyMatrix4(world));
// once: A.plaza / A.plazaN; return { cast: false, r: 58, anchors: A };
```
Publish: `BuiltSite` (:236-260) gains anchors, set in `_make` (~:2856);
add `PoiKits.anchorAt(poiId, name, out)` returning world-space (group pos
+ anchor) or null until built. Hammerhead comparison: `anchors!` at
Hammerhead.ts:118, written :573-910, `local()` :277-284.

**Registration (CityHub copies Hammerhead.ts:996-1110).**
`_registerScreens`: `add(key, Screen)` early-returns if
`menus.screens[key]` exists — **the guard that makes a second caller
safe; keep it**. `_registerInteractables`:
```ts
const openShop = (id) => { const s = menus?.screens?.shop; if (s?.setShop) s.setShop(id); ix.openScreen('shop'); };
this._handles.push(ix.register({ id: 'lest_market', pos: A.stall0, radius: 2.8, priority: 1,
  verb: 'Shop', label: 'Partellum Market', hint: 'Ingredients & gemstones', yOffset: 1.5,
  handler: () => openShop('partellum') }));
```
InteractableSpec: Interactables.ts:72-85 (pos may be number[]).

**TOWN_SHOPS entry (Shops.ts:37-130).** ShopDef: id, name, sub, owner,
ownerRole, hue, greeting, buyLine, brokeLine, emptyLine, tabs[] (last is
always Sell), EITHER `stock: Record<tab,string[]>` OR `filter:
Record<tab,(def)=>boolean>`, sellCategories[]. `ShopScreen.setShop`
SILENTLY returns on an unknown id (:146).
```ts
  forge: { id: 'forge', name: 'Forge & Filigree', sub: 'Lestallum · Smithy',
    owner: 'Randolph', ownerRole: 'Weaponsmith', hue: 12,
    greeting: 'Steel worth the name.', buyLine: 'Carry it like you mean it.',
    brokeLine: 'Come back with gil.', emptyLine: 'I take steel and stones.',
    tabs: ['Weapons', 'Accessories', 'Sell'],
    filter: { Weapons: (d) => d.category === 'weapon' && d.price > 2500 && !d.tags.includes('royal'),
              Accessories: (d) => d.category === 'accessory' && d.price > 1500 },
    sellCategories: ['weapon', 'accessory', 'treasure', 'catalyst'] },
```
**Culless cap — Shops.ts:125, one line:** `d.price > 0 && d.price <= 2500`.

**Lodging (Stats.ts:110-136).** All four rows EXIST: leville_std
1000/×1.5, leville_deluxe 3000/×2.0, galdin_std 5000/×2.0, galdin_pearl
10000/×3.0. Entry: `rpg.restAt(id, {wakeHour?, recipe?})`
(RpgSystem.ts:685) → DayCycle.rest (:355) spends the gil itself, returns
{ok, …} or {ok:false, reason}. **Copy the caravan dialogue wholesale from
Hammerhead.ts:1116-1177**; two lodgings = one extra choice row.

**NPC body spec.** NpcPlacement (Npcs.ts:228-243): key, seed, pos, face
(a POINT), posture (lean|wrench|counter|folded|pockets|seated), task
(wrench|chop|inspect), route[], pause[], speed, sit, talkRadius. _spawn
:395. Talk registers only if talkRadius AND an NPC_DIALOGUE[castKey]
entry exist (:459-487) — **talkRadius without a script silently registers
nothing**. POI-anchored bodies: RemoteNpc rows (:165-217), streamed at
420 m. Cast: copy trucker (:251) or traveller (:310) and change six
numbers (profile, look.seed, skin, iris, hairSet, outfit colours);
**archetype is cached per castKey (NpcRig.ts:111) — reusing one key
across many bodies is the perf strategy**. Sania = lab-coat jacket;
Navyth = trucker frame folded at the rail; Verdough/Surgate = one
merchant archetype, two seeds.

**Dialogue.** DialogueScript/Node/Choice: Dialogue.ts:41-93. Helpers at
NpcDialogue.ts top: rpgOf :21, questStatus :22, openShop :23, openHunts
:29, hub :32, **takeQuest(game,id,who,okNode,noNode) :48-55** (accept +
track + notify('talk') in one). Model city scripts on wiz (:466-530).
Hand-ins without takeQuest: notify('fetch',{target,count}) then
notify('talk') — Cid :322-340 pattern. Quest rows: helpers at
Quests.ts:163-176 (kill/fetch_/reach/talk/photo/craft/rest/fish);
`at()` THROWS at load on unknown POI ids.

**Hunt board #2 = one ix.register, no table work.** ledgers() derives
tabs from Quest.tipster → TIPSTERS[x].tome; `lestallum` (Tony, Duscae
ledger) and `galdin` (Coctura, Coastal ledger) ALREADY exist with hunts —
board needs only `handler: () => ix.openScreen('hunts')` (model
hh_huntboard, Hammerhead.ts:1030-1035).

**String lights.** _town draws six unconnected M.lamp spheres (:1444);
`M.lamp = glowMaterial(0xffe6b4, 0.5, …)` (:473). **Night ramp EXISTS:
PoiKits.update sets `M.lamp.emissiveIntensity = 0.3 + night*1.15`
(:2893).** Build catenary runs between the stall poles with bulbs on
M.lamp and they light at dusk for free. Want brighter? Add an `M.festoon`
with its own ramp line — do NOT mutate M.lamp (six kits share it).

**Fish premium caveat:** sell price is global
(`Inventory.sellPrice` :752-756); ShopScreen has no per-shop hook —
Coctura's 1.4× needs a `sellMult` on ShopDef honoured in
ShopScreen.rows()+accept(), **which is lane 10's file** — negotiate or
drop the premium.

### Mechanism notes
- Boot order (Game.ts:276-315): Interaction → Town → Npcs → Director.
  CityHub must init after Interaction, before Npcs: `step('Cities', …)`
  between :309 and :310 + a SystemRegistry line (:46-95). Two-line
  cross-lane commit.
- Npcs.init falls back to five bodies when Town lacks anchors (:273-280)
  — city bodies go through REMOTE-style POI anchoring or a new branch
  reading poiKits.anchorAt, NOT town.local.
- `_apron` runs before the kit and anchors have the same timing — nothing
  can read them until _make has streamed the site. **CityHub must
  poll/late-bind, not read at init.**
- Both city POIs are one merged volume; poi.x/z is the footprint centre —
  REMOTE places Iris/Dino at the PARKING POIs for this reason.

### Commands
```
node src/tools/probe.mts src/tools/probes/standingroom.mts
node src/tools/probe.mts src/tools/probes/npcdraws.mts --set __SHOT__=lest_market_day
node src/tools/probe.mts src/tools/probes/questaudit.mts
node src/tools/probe.mts src/tools/probes/huntboard.mts
node src/tools/texbake.mts --geo          # MANDATORY after PoiKits.ts
node src/tools/drawcheck.mts lest_market_day galdin_pier_sunset
node src/tools/check.mts && pnpm typecheck && pnpm typecheck:tools
```

### First commits
1. **PoiKits anchors ONLY** (KitResult.anchors + _town writes +
   BuiltSite.anchors + anchorAt) → `texbake --geo` → push immediately;
   announce so lane 18 unblocks.
2. CityHub.ts skeleton: one shop + one rest per city off the anchors.
3. Shops.ts: Culless cap + five vendor rows.
4. Game.ts two-line registration (own pathspec).
5. NpcCast archetypes → Npcs placements → NpcDialogue scripts →
   Quests.ts rows (LAST, after lane 17).

### Landmines
- **PoiKits.ts is in GEO_SOURCES — touching it stales geo.bin.gz
  (30 MB)**; re-bake or every POI rebuilds live and captures drift.
- **Anchors must survive JSON** — a Vector3 comes back method-less from a
  warm cache; the bug only shows on the SECOND run.
- ShopScreen.setShop silently no-ops on a typo'd id.
- at() throws at boot on a bad waypoint — game down, not quest broken.
- **Objective targets must match real keys** (`magitek_trooper` matched
  nothing once; `mt` is the bestiary key). Verify every kill/fetch target.
- CollisionWorld.blocked() lies inside buildings (standingroom header) —
  never place a body from a collision query alone.
- SKIP_IDS/_exclude memoise on first call — register city origins before
  the first _make.
- Quests.ts: 17 → 18 → 19 order; Shots.ts untouchable until lane 3
  releases.
- Iris programs: Materials.ts:369 bakes iris hex as a GLSL literal —
  give the ~20 ambient bodies ONE shared iris (reuse trucker's 0x5b6a55);
  resurrect the uniform-dedup only if npcdraws still fails.

### Done-when
anchorAt('lestallum','stall0') and ('galdin_quay','plaza') return world
points; standingroom reports all 29 bodies on open pavement; walk-up
offers 5 Shop + 2 Rest per city + 1 Hunts + Galdin pier verbs; the two
ledger tabs appear with ZERO TIPSTERS rows added; restAt leville_deluxe/
galdin_pearl spends 3000/10000 and banks ×2.0/×3.0; Culless caps at
2500 and Forge carries the rest; all 8 city quests load (questaudit) and
accept in one conversation; npcdraws ≤60 colour draws per city, no eye
mesh past 25 m, ≤12 bodies per framing; drawcheck ≤800 on city shots;
geo.bin.gz re-baked and committed.

## Lane 20 — The Meteor (cold-start brief)

Owns: `src/world/props/Megastructures.ts` (`_meteor`/`_meteorParts`/
`megaMaterials`); touch `PropMaterials.ts:537 glowMaterial` narrowly.
Not yours: `Shots.ts` (lane 3→21); `lest_overlook_disc`/
`disc_rim_overlook` don't exist yet. Direction chosen by the human:
**glowing wound — molten-blue crystal fissures, visible from the highway
at night.** First cut on overrun (plan §5).

### The recorded story (read before designing)
- Closure: STATUS history "both levers are measured negatives … all 22
  slabs are entombed"; full row:
  `project/archive/plans/2026-08-26-opus-the-standing-backlog.md:1207-1220`;
  lane report `project/archive/handoff/props-r4.md:158-190, 250-259`.
- Negative 1: `tintNorm` on the rock field (b921642, reverted) — a
  uniform ×1.115 albedo lift wearing a normalisation's name.
- Negative 2: fissure glow ×40 (`probes/meteorglow.mts`, 3eef135) — **not
  one lit pixel** in either shot. Cause is geometric: `_meteorParts`
  places clefts at the MIDPOINT of two mass centres
  (Megastructures.ts:1004-1010); masses r 165–300 m at centres 300–360 m
  apart, so every midpoint is inside both bodies. All 22 slabs within
  ±204 m of origin while the stone spans −1154…+1085.
- Negative 3: vertex-seated slab placement, built and reverted — still
  invisible at ×40 (a slab stands ~0.6 m proud; one pixel at 1.7 km is
  1.53 m).
- The priced fix (this task): "glowing veins authored ACROSS THE VISIBLE
  FACES on the cleave-plane edges the mass already has, at tens of
  metres, sized for a 585 m landform."

### Anchors
- Build: `_meteor` :886 (group at meta.x/gy/z, rotation.y 0.6), centre
  (−1020,−2160), gy = seatY − 90 (:907-918); ground() :922-931; six
  masses :938-968; CLEFT :1004-1008; 22 slabs :1011-1024; apron :1030;
  rim ring 46 blocks 790–1060 m :1057-1085.
- Materials: `meteorGlow: glowMaterial(0xff8a2e, 2.2, …)` :317; mesh
  auto-naming `mega_<key>` :375 (geo bake keys on it); night ramp
  `emissiveIntensity = 1.6 + 1.4*night` :1131; night from sun elevation
  Props.ts:198-204.
- meteorMass closed negatives (:177-224): 12 planes, bite 0.60, warp
  0.21, gully 0.34 — do not re-tune.
- Crater: WorldMap.ts:839 discCrater r1080 rim 210 depth 120 core 300;
  shaping Field.ts:1240-1269 (rim gaussian at 864 m, σ184; rim breaches
  at 1.9/4.6 rad in the ring loop).
- Per-vertex emissive to reuse: `GeoKit.ts:260 glow() / :322
  enableVertexEmissive`; same pattern RigBuilder.ts:376-400.
  Containment-test idiom: `_probe/fissure.mts`.
- Bloom threshold 1.45 post-exposure (BloomPass.ts:61, ÷EV :354-357).
- Sightlines (world→local with yaw 0.6: lx = .8253wx − .5646wz, lz =
  .5646wx + .8253wz): `landmark_meteor` (Shots.ts:749, t 17.6, 1400 m S,
  1.45 m/px) sees masses 2203/2206 (+0.56,−0.83 local); `zone_mencemoor`
  (1714 m NE, 1.39–1.53 m/px) sees 2204/2201; **Lestallum (2428 m, west
  face = exactly local −X, 2.18 m/px) sees 2202/2205**; highway spur
  n_disc (−1220,−1360) is 824 m — ON the rim ring, ~0.66 m/px.

### Mechanism (the design)
The entombment cause: the glow is a separate solid placed where the rock
also is. Two layers:
1. **Veins as surface, not objects.** `meteorSkin = stone.clone()`
   patched with enableVertexEmissive; stamp an `aEmissive` vein field
   per-vertex on the six mass geometries (fbm ridge banded to the
   relief step edges, so veins follow cleave arrises). Occlusion becomes
   impossible — the lit vertices ARE the visible surface. One extra draw.
   Width floor: ~7 m triangles, ≥10 px at 2.18 m/px ⇒ **author 20–40 m
   wide**, tapering, a few long branching veins per face on local −X
   (Lestallum), +X/−Z (landmark_meteor), +Z (mencemoor).
2. **Crust fissure mouths.** Repurpose the 22 meteorGlow boxes as a few
   LARGE fissure mouths on the crater crust (40–120 m, seated on
   ground() a few metres proud, biased to the rim breaches at 1.9/4.6
   rad so the rim doesn't occlude them from the spur and Lestallum).
- Colour: molten-blue = core near white-blue, warmer halo (keep 0xff8a2e
  only as the halo). Radiance must clear bloom's 1.45 post-exposure:
  ~2–4 at night, ~0.8–1.2 day.
- **enableVertexEmissive adds vEmissive straight into
  totalEmissiveRadiance — material.emissiveIntensity does NOT scale it.**
  Add a `uGlow` uniform to the patch and drive it beside :1131.

### Commands
```
node src/tools/daemon.mts --health
node src/tools/probe.mts src/tools/probes/meteor.mts --dirty
node src/tools/probe.mts src/tools/probes/meteorglow.mts --dirty --shot tmp/l20/glow.png --set __MG_SHOT=landmark_meteor --set __MG_GAIN=40
node src/tools/shoot.mts landmark_meteor zone_mencemoor --dirty --out tmp/shots/l20-a --jpeg
node src/tools/texbake.mts --geo        # MANDATORY after Megastructures/PropMaterials edits
pnpm run build:full && pnpm run check
```

### First commits
1. **Instrument first:** `probes/discglow.mts` — per emissive element:
   (a) containment in any mass, (b) rays from the three judged stands vs
   the meteor meshes, (c) lit-pixel count at gain 1 per shot. The ×40
   control stays the arbiter: invisible at ×40 = geometry, not
   brightness.
2. meteorSkin + aEmissive veins on the three judged faces + uGlow night
   uniform.
3. Re-place the 22 slabs as crust fissure mouths near the rim breaches;
   **delete the CLEFT midpoint placement outright** (it has never
   rendered).
4. texbake --geo; before/after crops with a control box; keep this file
   current.

### Landmines
- `Megastructures.update:1119-1133` rewrites emissiveIntensity every
  frame — settle first (this cost the glow probe a whole run).
- PartBuilder synthesises only a missing `color`, not aEmissive
  (:100-106) — an aEmissive mass in the shared M.stone batch breaks the
  merge; the separate material key is mandatory.
- Megastructures.ts + PropMaterials.ts are in GEO_SOURCES — editing
  deletes geo.bin.gz for every lane until re-baked. Announce.
- Group origin is sunk 90 m — use ground(lx,lz,size) + MASS_FOLLOW 0.35
  or new geometry floats/buries (the invisible-apron-shards bug).
- Whole-frame imgdiff can't see this: landmark_meteor cold floor 1.238
  but warm-to-warm noise 5.37 (LANDMINES.md:680-707). Box-on-change +
  control box + repeat.
- landmark_meteor has period-2 draw parity — poses must resetClock().
- landmark_meteor runs t 17.6 — verify `night` there before claiming a
  night read; a true night frame needs a shot this lane does not own.

### Done-when
Blind A/B of landmark_meteor hesitates in the next judged round. Lane
exits before that: **>0 lit pixels at gain 1** from landmark_meteor,
zone_mencemoor AND a Lestallum-stand probe capture; vein width ≥10 px at
the worst range; before/after crops read by eye; check + nanscan green;
texbake --geo re-run. Otherwise the lane closes with a measured negative
into HUMAN_REVIEW.md and the decision returns to the human.

## Lane 21 — Content shots (cold-start brief)

Mission: plan task 69 — 32 new corpus shots (142 → 174), five joining
`compare.mts` PAIRING. **Runs LAST: takes `Shots.ts` ownership only after
lane 3 releases it (plan rule 6), and shoots content lanes 17–19/22–23
have landed.**

Owns: `src/game/Shots.ts` (after lane 3), `src/tools/compare.mts`
(PAIRING rows), `project/noise-floors.json` entries for the new shots.

### The format contract (from lane 3's research — binding)
- Entries are parsed by REGEX, not TS: `corpus.mts:92-115`,
  `drawcheck.mts:255-259`, `perf.mts:88-91` match
  `/^\s{2}([a-zA-Z0-9_]+):\s*\{/gm` — **2-space indent, `{` on the key
  line, single-line `doc:`**. Category buckets come from `// --- name ---`
  header comments.
- `ShotState` (Shots.ts L130-149): doc, time, fov, weather, scenario,
  hud, dungeon, menu, story, gait. `FixedShot` = pos+target;
  `FollowShot` = follow+offset. Mixing them is a compile error by design.
- **File order is load-bearing** (L79-105): character/UI shots first,
  cutscenes/dungeons last. Insert new landscape/content shots into the
  matching category block, dungeon shots at the end.
- Derive every camera live with `framecam.mts --probe` — hand-written
  coordinates have gone stale three times.

### The 32 shots (subjects in the plan task 69)
Arc (18): south_road_dawn, threshold_stones, southwatch_camp(night),
saltflat_setpiece(dusk), pilgrims_rest, peak_overlook(golden),
adamantoise_graveyard, graveyard_night, northwatch_ruin(storm),
mencemoor_obelisks(night), washes_lookout, saxham_ghost(night),
tomb_claim(interior), armiger_full(UI), dungeon_keycatrich_fight,
dungeon_balouve_boss, regalia_night_road, map_drive_there(UI).
Cities (14): lest_market_day†, lest_street_night†, lest_overlook_disc†,
lest_plaza_walk, lest_exineris, lest_leville, lest_market_vendor,
lest_night_high, galdin_pier_sunset†, galdin_angelgard†,
galdin_restaurant, galdin_beach, galdin_pier_fishing,
galdin_night_lanterns. († = PAIRING.)

### PAIRING (compare.mts:73-118)
`Record<string, string[]>` — key = shot name, value = ≥2 plate filenames
in `docs/reference/plates/`. **Check the plates directory for
Lestallum/Galdin plates first; if absent, sourcing plates is a
HUMAN_REVIEW item (no network fetching — BRIEF rule 1 covers the game,
but plates are reference material the human has provided before).**
`--control` emits one composite per distinct plate pair.

### Process per batch (5–8 shots at a time)
1. `framecam.mts` candidates → pick framings by eye (BRIEF: read the
   image and actually look).
2. Add entries to Shots.ts in the right category block.
3. Capture PNG + JPEG; check drawcheck ≤800 on each (a new shot over 800
   CREATES `project/draw-baseline.json` — don't).
4. Two `--cold` captures → `imgdiff --calibrate` → commit the new
   noise-floor rows IN THE SAME COMMIT as the shot rows.
5. `nanscan` (corpus count grows — expect 0/174 at the end), `perf.mts`
   on the new shots (capture wall time grows ~23%; the check-baseline
   ratchet in `project/check-baseline.json` may need a deliberate,
   justified bump — say so in the commit).
6. Dungeon/interior shots: `dungeon:` field exists in ShotState; check an
   existing dungeon shot for the pattern before authoring.
7. UI shots (armiger_full, map_drive_there): `menu:` field; see existing
   menu shots.

### Landmines
- Shots.ts order: character/UI first or terrain drift buries the party.
- Framing near cities: ≤12 NPC bodies per authored framing (lane 19's
  perf rule); night city shots need the string-light ramp — verify hour
  vs the lamp ramp (`PoiKits.update` night term).
- `regalia_night_road` needs nightDanger (lane 18) landed and a rolling
  daemon in frame — coordinate timing or stage via Director scenario.
- compare.mts control-arm: two rows sharing the same two plates collapse
  to one control pair — give the five † rows distinct plate pairs.
- New shots enter EVERY gate (nanscan, drawcheck, perf, corpus) — land in
  small batches so a red gate names its cause.

### Done-when
All 32 in the corpus with measured floors committed alongside; nanscan
0/174; drawcheck ≤800 on every new shot; the five † rows in PAIRING with
real plates (or a HUMAN_REVIEW row saying plates are needed); perf gates
certify with the ratchet honestly adjusted; every new shot LOOKED at as
a JPEG and its subject actually visible.

## Lane 22 — Chocobos (cold-start brief)

Owns (new, all yours): `src/game/chocobo/` — `ChocoboSystem.ts` (whistle
key, summon, mount/dismount, prompt), `ChocoboRig.ts` (RigBuilder bird +
prototype, colour variants), `ChocoboBody.ts` (own CharacterController +
wish-velocity move), `ChocoboAnim.ts` (idle/trot/gallop from
Mesmenir.pose), `Saddle.ts` (Occupants analogue), `ChocoboHub.ts` (Wiz/
Alpine interactables), `Races.ts` (3 courses), `probes/chocoboride.mts`.

Minimal touches, each its own explicit-pathspec commit: `Game.ts` (one
SystemRegistry key + one step() line after Regalia :290);
`RpgSystem.ts:111-119` (+`['chocobo_whistle', 1]` to STARTING_ITEMS);
`Quests.ts:573` (side_chocobo re-key off ch3-deadeye);
`ControlsScreen.ts:12` (a Chocobo group — see landmine on the stale
rows); `NpcDialogue.ts:463` (Wiz hub rows); `WorldMap.ts:611`
(meldacio_layby "Alpine Stable" parking → type chocobo). Do NOT touch
Shots.ts, Player.ts, CharacterController.ts (lane 23 owns it).

### Anchors per task

**Rig.** RigBuilder.ts: Rig :26, bone() :47, attach() :76, attachBlend
:96, attachChain :135, build() :178, poseBone :323, creatureMaterial
:352. **The whole creature is ONE SkinnedMesh** (EnemyPrototype.mesh,
EnemyBase.ts:262; cloneSkinned :757) — the perf argument for this path.
**Closest template: Mesmenir.ts** — a horse with a real gallop: GALLOP
offsets :313, gallop(ph, reach) :334, run/approach with bounce+pitch
:365-378. Bone naming fsh/fkn/ffl/fho, bhp/bst/bhk/bho, spine/chest/
neck1/neck2/head. Chocobo is bipedal: keep the hind chain, drop the fore
pair, add wing L/R + crest; retime GALLOP to a two-beat hop (bR 0, bL π)
with suspension. CreatureAnim.ts: GAITS :57, stride() :319, pickGait
:326. Anak.ts:114-133 is the cleanest bone table to read.

**Locomotion.** Player.ts:115-116 run 7.4 / walk 3.6; selection :201;
update :173; collide+snap :214-219; gait feed :227. CharacterController
move() :88, slope :93-105, WALKABLE_Y = cos 50° (CollisionWorld.ts:26).
**The 50° mount rule already exists** — refusal = normal.y < WALKABLE_Y.
Regalia pattern: KEY.enter :57, enter() :307, exit() :322, prompt+toggle
:588-603. Occupants.ts: enter :246, the neutralisation (p.terrain =
NO_GROUND, party.speedMul = 0, :262-275), exit :279, update writes
root pos/quat from the seat anchor :320-338, _applyPose :342.

**Camera.** CameraRig follows player.position directly (:472-476), FOV
kick at speed > 5.2 (:518-520). **No changes needed** if the player root
rides the saddle — only maybe raise restDistance/height while mounted.

**Whistle + key.** Inventory.ts:257 chocobo_whistle (KEY_ITEMS, no use
handler); sylkis_greens :206 (600 gil, sold :851). Granted only by
side_chocobo's reward (Quests.ts:586) — hence STARTING_ITEMS. **Free key
codes (grepped every key()/keyDown() site): KeyY, Digit6–Digit0.** Take
KeyY = toggle summon/dismount; mount itself via
`Interaction.register({verb:'Ride', …})` so it gets the standard prompt.
Ascension hooks EXIST: 'chocobo-distance' 1 AP/400 m (:155),
exp_choco1/2 (ap-chocobo, chocoboStamina +50%, :324-325), accumulator
:417/:446-450.

**Hubs + races.** POIs: wiz_chocobo (WorldMap.ts:473, at n_wiz),
wiz_paddocks (:475, "the training rings and the race circuit"). Kit
geometry exists (PoiKits.ts:1961 _chocobo: paddock/barn/silo/trough/
signboard). Wiz: cast NpcCast.ts:435, placement Npcs.ts:221, dialogue
NpcDialogue.ts:463-505 (a hub([...]) menu — add rows). Races: Triggers
add() :105 (kinds place|region|hour|quest|combat, once default true),
clear(tag) :111, notify :221 — checkpoints do NOT need PLACES entries:
radius-test in Races.ts, keep Triggers for start/finish. Timer: none
generic; Fishing's _t accumulator (:81) is the shape, ~20 lines.
Markers: `Minimap.waypoint` (Minimap.ts:77) — **nothing assigns it
today; it is a free write target**; CompassBar reads GameData.readMarkers
(:642). Colour variants: Cast.ts-shaped record; blend with `mixc` from
enemies/Palette.ts (the naive two-scratch mix renders parts black).

**Perf.** Budget 800/shot; worst town_forecourt 821 recorded; the four
party rigs cost ~34 draws each (Character = many meshes). **One
RigBuilder creature ≈ 3–5 draws** — the bird is ~1/8th of a party member.
Instruments: probes/npcdraws.mts, _probe/drawattrib.mts, drawcheck gate.

### Architecture (decided): attach the player to a chocobo entity
(Regalia/Occupants pattern) with a CharacterController, NOT VehicleBody,
NOT a re-skinned player controller. ChocoboBody owns
`new CharacterController(collision, {radius .55, height 2.1, stepUp .55,
stepDown .7})`, reproduces Player.update:178-226 (camera-relative wish →
heading → damp → body.move) with run 11.0 / walk 5.5 / sprint burst ~15
on stamina scaled by ascension.value('chocoboStamina').
ChocoboSystem.lateUpdate writes player.root onto the saddle anchor as
Occupants.update:325-338 does, reusing the NO_GROUND neutralisation.
Why: the rider must be drawn anyway (_applyPose's job); Player.ts stays
untouched; CameraRig/lock-on/minimap keep working because
player.position stays truthful; dismount is already solved
(Occupants.exit). Mount legality: refuse if normal.y < WALKABLE_Y or
`terrain.heightAt < water.level` at the target. Summon: spawn 18–25 m
out, run in, register Ride only on arrival.

### Commands
```
pnpm run typecheck
node src/tools/check.mts --only integration,uxcheck,creaturecheck
node src/tools/probe.mts src/tools/probes/chocoboride.mts --ttl 20
node src/tools/probe.mts src/tools/probes/npcdraws.mts --set __SHOT__=poi_chocobo
node src/tools/check.mts --perf
node src/tools/gitlock.mts commit -m "…" -- src/game/chocobo
```

### First commits
1. ChocoboRig.ts — bone table + build; probe prints skeleton size + draw
   delta.
2. ChocoboAnim.ts — idle/trot/gallop from Mesmenir.pose:334-378.
3. ChocoboBody.ts — headless, probe-driven.
4. ChocoboSystem + Saddle + the Game.ts one-liner — summon on KeyY, Ride
   prompt, mount/dismount. **The task-70 bar.** npcdraws reading here.
5. ControlsScreen group + STARTING_ITEMS (separate pathspec commits).
6. ChocoboHub — Wiz interactables + dialogue rows; colours, then sylkis
   tiers.
7. Races.ts — one course end-to-end, then the other two.

### Landmines
- **ControlsScreen already lies** (X/Y/6-8 rows vs actual R/V/Z-X-B) —
  lane 10 owns fixing those; coordinate so your Chocobo group lands on
  the corrected card, or fix in the same commit if lane 10 hasn't.
- **E is contested**: CombatSystem._interactClaimsE (:1512,:1522) — a
  Ride interactable is fine; a raw keyDown('KeyE') is not.
- **Player.update keeps running while mounted** — Saddle.update must run
  in lateUpdate after CameraRig or the rider snaps a frame behind.
- **converge()**: any exponential damp (speed/gait/stamina) needs a
  converge() or shoot.mts gets non-deterministic draw counts.
- Palette.mixc, not a local mix (four species rendered black from nested
  two-scratch blends).
- drawcheck --set-baseline on a subset DELETES unmeasured entries.
- EnemyBase runs _groundCal (:958) — a rig outside Enemy doesn't get it;
  hand-tune saddle/foot Y or lift the calibration.
- Occupants.exit early-returns if _saved is null — a dismount that never
  entered strands the player at NO_GROUND. Guard.
- side_chocobo's escort verb is deliberately cut — do not resurrect a
  follower system.
- Alpine Stable re-type changes the world-map filter set
  (WorldMapScreen.ts:55/87) — check both.

### Done-when
Whistle in the starting bag; KeyY at spawn summons, E mounts, KeyY
dismounts — flat, 40° OK, refused at 55°, refused over water; sustained
11.0 m/s over 30 s matching WorldMap.travel()'s SPEED.chocobo
(WorldMap.ts:1145) so the map ETA is true; camera follows with zero
CameraRig edits; Wiz + Alpine offer colours, sylkis tiers, and a race
board; side_chocobo accepts without ch3; one race completable end-to-end
by chocoboride.mts paying gil + AP; typecheck + check green; --perf 60
fps with the bird in frame; npcdraws ≤5 colour draws for the mount, no
shot over 800.

## Lane 23 — Swimming + diving (cold-start brief)

Owns: new `src/world/swim/` (`Swim.ts`, `Underwater.ts`),
`CharacterController.ts` (one field + one branch), the from-below branch
in `Water.ts` (**contested with lane 7 — coordinate or hand over**), new
`probes/nanunder.mts`. Everything else is another lane's file — design
for ZERO edits there via the Occupants save/overwrite/restore pattern:
`src/characters/` = lanes 1/2/22, `src/ui/` = 10, `PostFX.ts` = 15,
`Sky.ts` = 4, `src/game/` = 17, `Shots.ts` = 21, `src/tools/` = 16.

### Anchors per task

**Controller.** CharacterController.move() is 4 phases: slope :93-104,
substepped horizontal + world.resolve :106-115, **ground snap/gravity
:117-146 (GRAVITY 19.5 at :7; vy is the single vertical integrator)**,
scramble :159-177. Swim = an early branch in move(): skip §1/§3, drive
pos.y toward water level, vy = 0, grounded = true. Exit-at-bank = §3's
snap test reused against `groundDisc` (CollisionWorld.ts:347; groundAt
:311; blocked :442). Player call site Player.ts:217; speeds :112-113;
sprint :167. Foot IK dies by passing null terrain: Player.ts:236 →
Anim.update:548. **The takeover precedent needing zero src/characters/
edits: Occupants.enter (vehicle/Occupants.ts:261-271)** saves and
overwrites p.terrain = NO_GROUND, party.terrain, speedMul, and runs in
lateUpdate — "the last word over Player and Party" (:308-311).

**Water level queries.** `Water.surfaceAt(x,z)` (Water.ts:931) — ≤5 body
AABBs, returns level, null off-body, **rivers not included**.
**`WaterMask.levelAt(x,z)` (water/WaterMask.ts:158) is the real one** —
bodies + hashed barycentric lookup into the drawn river sheet (CELL 8),
−Infinity where dry. Depth for the >1.2 m gate = `level −
CollisionWorld.groundAt(...).y` (NOT terrain.heightAt, or you swim
through jetties). Bank-finding: copy Fishing._survey
(Fishing.ts:233-300) — wet() + 36 rays + 1 m step-back. Body AABBs are
rectangles over basins: `surfaceAt` says wet over dry land inside the
rectangle — ALWAYS pair with a ground test.

**Camera.** CameraRig._armDistance (:250-289) sweeps terrain only; the
ground floor clamps against the LAKE BED (:535-537), so the lens sinks
under the plane freely today. Framed shots clamp at heightAt+1.35
(:350-352) — an authored underwater framing between bed and level
survives. Water._shouldReflect bails when cam.y < level (:849).

**Water from below TODAY.** Lake surface: DoubleSide, transparent,
depthWrite:false, renderOrder 5 (Water.ts:559-561, :478-488) — backface
draws, unshaded for it. River + shore: FrontSide (RiverMaterial.ts:87-89,
ShoreMaterial.ts:75-79) — vanish from beneath (correct). Predicted
from-below failure in the lake fragment (:640-770): V points down, N +Y →
dot < 0 → fres = 1.0 → 100% planar reflection sampled from an
ABOVE-water reflect cam (sky pasted on the ceiling); refract from the
wrong side TIRs to vec3(0); `down` clamps to 0.10 → path ≈ 10× depth →
T → 0. Fix = branch on `gl_FrontFacing`: Snell cone (~48.6°) showing the
compressed sky disc, mirror the underwater scene colour outside it,
alpha from viewing angle.

**Murk — cheapest path (no PostFX pass; lane 15 owns the chain).**
Repoint the shared atmosphere uniforms exactly as
`Dungeons._applyInteriorAtmosphere` does (Dungeons.ts:751-792): uSkyDim
0, uNight 1, uNightTint = water tint, uFogBase = waterLevel, uFogHeight
small, uFogDensity high, uHazeBase, plus post.autoGrade = false /
setGradeBlend. Depth-correct murk on every patched material for free.
**Sky.update rewrites these each frame (Sky.ts:1290-1292) — write in
lateUpdate.** Precedent for toggling post from outside:
Wetness.ts:53 flips post.ssr.enabled.

**Breath HUD.** Own class appending to `game.uiRoot` with inline style
(el() accepts cssText, UIKit.ts:26) — zero src/ui/ edits. Bar
(ui/Bar.ts) is the gauge pattern; Armiger gauge (CombatHUD.ts:230-240)
the vertical worked example.

**Party waits at shore.** Levers settable from outside: m.speedMul
(Occupants zeroes it) and the recall teleport (Party.ts:395-430, dist >
100, 55° cone). Pin m.slot/baseSlot to the last dry sample on the entry
ray, zero speedMul, **raise the recall distance while swimming** or
companions teleport into the lake when the camera looks away.

**No combat in water.** `combat.scenarioLock = true` short-circuits
CombatSystem.update (:1303-1313; Director sets it at :391/:460/:539/
:674). Blade: `combat.weapon.setReveal(0)` (:551; restored by
materialise :560). Companions: PartyAI.ts:251 carry.stow. Do NOT use
input.enabled = false (zeroes move).

**Drowning.** Dungeons._hazards (:711-724) is the pattern: `s.hp =
max(1, hp − dps·dt)`; cold water 12 dps precedent Fociaugh.ts:105.

### Architecture (decided)
`src/world/swim/Swim.ts` + `Underwater.ts`, registered by one Game.ts
line (explicit pathspec, after Camera), writes in lateUpdate. Swim reads
WaterMask.levelAt + groundAt; on entry saves/overwrites player.terrain
(kills foot IK), speeds → 2.2/3.4, scenarioLock, setReveal(0), party
speedMul 0; on exit restores everything in one place. The only
CharacterController edit: a `swim`/`buoyLevel` field + the early branch —
buoyancy lives where vy lives so gravity can never race it. Diving = same
state with pos.y free below level, breath integrating down, forced
ascent ~1.5 m/s with input ignored.

### Commands
```
node src/tools/probe.mts src/tools/probes/nanunder.mts --dirty     # the new instrument
node src/tools/shoot.mts <shots> --jpeg
node src/tools/framecam.mts …        # SHOTS.__probe pattern (framecam.mts:100-105) — photograph underwater without Shots.ts
node src/tools/gameplay.mts
node src/tools/probe.mts src/tools/probes/longplay.mts --dirty     # check daemon --health first (exclusive lease)
pnpm run check && pnpm run typecheck
```
**Two underwater probe framings (bed/level verified: Alstor basin
(−1355,745) h−18; Vesperpool (−2940,−2280) h−22; both level −6.5):**
`under_alstor` pos [−1355,−9.5,745] target [−1290,−6.2,790] fov 55
(grazing look up at the underside + Snell window); `under_vesper` pos
[−2940,−12.0,−2280] target [−2938,−6.4,−2246] fov 60 (near-vertical from
5.5 m down). Both sit above the bed so the shot clamp leaves them alone.

### First commits
1. `probes/nanunder.mts` (new file only) — nanscan's h2f + rtScene
   readback (nanscan.mts:20-45) over the two framings. Rule 3, and it
   proves the from-below pass.
2. Swim.ts + the Game.ts one-liner — depth probe, enter/exit hysteresis,
   saved-state block, no rendering. Prove floor-walking gone at Alstor in
   gameplay.
3. CharacterController swim branch (buoyancy + vy ownership + bank exit).
4. Water.ts gl_FrontFacing branch (coordinate with lane 7 FIRST).
5. Underwater.ts — murk + breath gauge + forced ascent.

### Landmines
- **NaN classes from below**: sampleNormal = normalize(tex*2−1)
  (Water.ts:580-582) NaN on a (0.5,0.5,0.5) texel; normalize at :646-649
  and :740 NaN on zero vectors — V flips sign underwater, a NEW way to
  hit them. refract() returns vec3(0) under TIR; anything normalizing it
  is a hole. NaN survives the composer as pure black; only nanunder sees
  it.
- **March overshoot**: `down = max(−R.y, 0.10)` (:670-672) is 10× from
  below; SSR (maxDistance 60), GTAO and DoF march a depth buffer with no
  water surface in it (depthWrite:false). Cap path lengths explicitly.
- **Do not add a fifth copy of "is this wet"** — WaterMask.ts:1-42 is the
  file-length essay on that bug class. surfaceAt/_shouldReflect test the
  GLOBAL level and rectangle AABBs.
- Ownership: Water.ts double-assigned (7 + 23); Shots.ts is 21's;
  Player/Party/PartyAI are 22's. Zero-edit design or the lanes deadlock
  on gitlock.
- Party recall teleports at 100 m with the chase cap open — handle
  before the first long swim.

### Done-when
Swim across Alstor with no floor-walking, entering at >1.2 m, exiting at
a bank under control, in gameplay; longplay clean. Dive under Alstor AND
the Vesperpool: breath drains and forces a surfacing ascent; the surface
reads as a surface from below (Snell window, not sky-on-the-ceiling);
nanunder 0 NaN on both framings; check + both typechecks green; every
cross-lane touch a named one-liner or a TASKS.md row.
