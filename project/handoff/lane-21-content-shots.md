# Lane 21 — Content shots (cold-start brief)

Mission: plan task 69 — 32 new corpus shots (142 → 174), five joining
`compare.mts` PAIRING. **Runs LAST: takes `Shots.ts` ownership only after
lane 3 releases it (plan rule 6), and shoots content lanes 17–19/22–23
have landed.**

Owns: `src/game/Shots.ts` (after lane 3), `src/tools/compare.mts`
(PAIRING rows), `project/noise-floors.json` entries for the new shots.

## The format contract (from lane 3's research — binding)
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

## The 32 shots (subjects in the plan task 69)
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

## PAIRING (compare.mts:73-118)
`Record<string, string[]>` — key = shot name, value = ≥2 plate filenames
in `docs/reference/plates/`. **Check the plates directory for
Lestallum/Galdin plates first; if absent, sourcing plates is a
HUMAN_REVIEW item (no network fetching — BRIEF rule 1 covers the game,
but plates are reference material the human has provided before).**
`--control` emits one composite per distinct plate pair.

## Process per batch (5–8 shots at a time)
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

## Landmines
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

## Done-when
All 32 in the corpus with measured floors committed alongside; nanscan
0/174; drawcheck ≤800 on every new shot; the five † rows in PAIRING with
real plates (or a HUMAN_REVIEW row saying plates are needed); perf gates
certify with the ratchet honestly adjusted; every new shot LOOKED at as
a JPEG and its subject actually visible.
