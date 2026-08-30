# Lane 3 — Near-field and composition (cold-start brief)

Owns: `src/game/Shots.ts` (exclusive, rule 6 — release to lane 21 after
re-baselines land), `src/world/veg/**` seating (`GrassField.ts`, `Bushes.ts`,
`Trees.ts`, `Biomes.ts`, `Ecology.ts` density fns). Do NOT touch
`src/world/terrain/**` (lane 5), `Sky.ts` (lane 4), `src/characters/**`
(lanes 1–2).

## Anchors per task

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

## Mechanism notes
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

## Commands
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

## First commits
1. Measure before touching: vegcensus + `--jpeg` captures of the six shots;
   record draws-per-ring and bottom-of-frame ground distance per shot.
2. hero_full star-tuft ablation — name the geometry before editing; fix
   lands in GrassField.ts or Bushes.ts, not Shots.ts.
3. Reframe pass for the five shots (bottom third inside 26 m), one commit,
   re-calibrate `project/noise-floors.json` IN THE SAME COMMIT.
4. Occluders via camera placement against existing trees first
   (vista_dawn's own recipe); only then litter bumps or a new site type.

## Landmines
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

## Done-when
Five judged landscape shots have grass/shrub/sapling silhouettes with cast
shadow and parallax in the bottom third, verified by READING the JPEG at 2×
crop; hero_full has no star tufts and something with silhouette at 15–97 m;
every judged vista carries a foreground occluder crossing top or side;
drawcheck ≤800 everywhere; noise floors re-calibrated and committed with
the framing changes; Shots.ts released to lane 21 with the format contract
(2-space indent, `{` on key line, single-line doc, category headers).
