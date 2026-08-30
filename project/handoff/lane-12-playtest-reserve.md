# Lane 12 — The playtest's own list (cold-start brief)

Mission: plan task 37. This lane is DELIBERATELY idle until R2 (the single
post-build 30-minute human playtest, §3 of the plan) reports. Its queue is
the playtest's ranked what-felt-broken list, and §4 keeps refilling it
until the <3-broken-feels bar or a measured plateau.

Owns: nothing until R2 lands; then whatever files its items name (negotiate
via TASKS.md if another lane owns them).

## Named candidates that WAIT here (do not pre-empt the playtest)
- Fociaugh's approach: fresh capture (2026-08-29) shows NO cave mouth in
  frame at all; the apron is `fociaugh_menace`'s, 70 m away — `fociaugh`
  itself is excluded from aprons at PoiKits.ts:2776-2795. Talus-ramp design
  is written in commit e5557e5's MESSAGE (probes only in the commit).
- Balouve: headframe on bare dirt, no adit/sill in poi_dungeon_mine, plus a
  ghost-repetition artifact up the right trestle legs.
- Malacchi Pond: no pond — nearest water 133.5 m away, 28 m below
  (recorded in-code at PoiKits.ts:2158-2165); either hollow the site so
  `findTarns` (Tarns.ts:79-186) seats a body, or move the pin.

## Method when R2 lands
Rank by the human's list order, not by cost. Diagnose before fixing (read
project/LANDMINES.md "Diagnoses that were wrong" first). One item per
commit; capture-and-look per BRIEF.md.

## Done-when
The playtest's list is empty or every remaining row is a measured negative,
and the follow-up session reports <3 broken feels.
