# White frames — the blown-out city corpus

Status: **root cause found and named; fix in progress.**
Owner: defect lane, 2026-08-31.

## What was reported

Three city shots (`lest_market_day`, `lest_street_night`, `lest_overlook_disc`)
came back as ~9-32 KB JPEGs — blown to white — at `sha:d1714752497a`. Two of
them are judged PAIRING rows.

## What it actually is (verified)

**A `Float16BufferAttribute` does not survive the `geo.bin.gz` round trip.**

`AttrPack` (`4d16821`) re-packs an over-bright `color` attribute as
`THREE.Float16BufferAttribute` — a `Uint16Array` the GPU is told to read as
`HALF_FLOAT`. `GeoBake` records only the typed-array constructor name and the
`normalized` flag (`GeoBake.ts:198`), and rebuilds every attribute as a plain
`new THREE.BufferAttribute(...)` (`GeoBake.ts:296`). A restored attribute is
therefore uploaded as **`UNSIGNED_SHORT`, unnormalised**, so the shader reads
the raw half-float *bits* — ~15 700 — where the value is ~1.0.

Measured in-page at `sha:5af5c6071459` (`tmp/probes/attrtype.mts`), shot
`lest_market_day`:

    color attrs — float16 9, raw-uint16 43, other 728
    BufferAttribute|Uint16Array|false  e.g. capital_mega_city  rawMax=15714   <-- broken
    Float16BufferAttribute|Uint16Array|false|isF16=true  e.g. haven_poi_rock rawMax=15601   <-- correct

The 9 correct ones are built live; the 43 broken ones came out of the bake.
That is why the defect appeared the moment the coordinator's `build:full`
rebuilt `geo.bin.gz`, and why lane 21's earlier capture of the same three shots
(`tmp/shots/l21-city3`, pre-rebake) shows real content.

## The measurement chain that got there

1. **Corpus by file size then `imagestats`** — 11 shots at 100% clip, ~30 above
    45%. Not 3 shots; a continuum.
2. **`--ablate plain`** restores every one of them (`lest_market_day`
    9 376 B -> 204 874 B). **`--ablate noexp` changes nothing** — auto-exposure
    is innocent, hypothesis 1 is a measured negative.
3. **`--ablate nobloom`** restores fully; **`--ablate noflare`** only partly.
    Bloom is the amplifier, not the source.
4. **Per-pass buffer stats at the pass boundary** (`tmp/probes/bloomin.mts`):
    `ScenePass` output is max **12 792**, mean **1 185** on `lest_market_day`
    against **1.82 / 0.363** on the healthy `galdin_beach`. The scene is hot;
    bloom is faithfully smearing it.
5. **Hide-one-subtree** (`tmp/probes/hotgroup.mts`, `hotkit.mts`): `poi_kits`
    carries 96% of the frame's energy; inside `poi_town_lestallum`,
    `town_poi_render3` alone is 60%, `render2` 24%, `joinery` 11%.
6. **Attribute dump**: those meshes' `color` attribute is a plain
    `BufferAttribute` over a `Uint16Array` with max ~16 000.

Lights and materials were censused and are innocent (max light intensity 130,
two emissive materials at 4.3x/5x — `tmp/probes/lightcensus.mts`).

## Files

- Cause: `src/engine/GeoBake.ts:198` (writer), `:296` (reader). **Lane 14's
  file**; lane 14 is finished and its handoff records GeoBake as *untouched*.
- Innocent, checked: `src/engine/postfx/BloomPass.ts`, `Exposure.ts`,
  `src/engine/PostFX.ts`, `src/world/town/*`, `src/engine/AttrPack.ts`.

## Probes written (all in `tmp/probes/`, free to delete)

`bloomthr.mts`, `bloomhot.mts`, `bloomchain.mts`, `bloomin.mts`,
`hotgroup.mts`, `hotkit.mts`, `nearmesh.mts`, `lightcensus.mts`,
`matdump.mts`, `attrtype.mts`.

## Landmines this run re-proved

- **Read the whole buffer.** `bloomin.mts` first read only a 400x225 rect at the
  origin and reported bloom's input as max 0.47 when it was 11 944. A
  sub-rectangle of a 1600x900 buffer is not the frame.
- **A half-float attribute's `.array` holds bits, not values.** The first read of
  `geometry.attributes.color` said "max 15879" and that was *correct* for the
  9 healthy meshes too — the number alone does not separate them; only
  `isFloat16BufferAttribute` does.

## The fix — landed, verified

`e848801` — `src/engine/GeoBake.ts`. The header gains an `h` flag, written only
when the attribute is half, and `inflatePart` restores
`THREE.Float16BufferAttribute` instead of a plain `BufferAttribute`.
`GEO_BAKE_VERSION` goes 1 -> 2: a cache written before the fix is
indistinguishable from one written after it, and serving a stale one would
reproduce the defect with no symptom in any gate.

Then `node src/tools/texbake.mts --geo` (15 keys, 26.4 MB gz, 16.6 s).

**Verified by instrument** — the same probe, same shot, after:

    lest_market_day: color attrs — float16 52, raw-uint16 0, other 728

**Verified by eye** (`tmp/wf/fixed/`):

- `lest_market_day` — the Lestallum market square in full daylight: a coral
  render block on the left under a grey awning, a slate-blue industrial facade
  opposite, paper lanterns strung between them, eleven NPCs on the paving each
  with a cast shadow, market benches in the foreground. 9 376 B -> 222 438 B.
- `zone_lestallum` — a wide green Cleigne vista with the city on its plateau,
  the EXINERIS chimney, ruins on the skyline, birds. Was a white ellipse
  filling two thirds of the frame. 76 881 B -> 215 903 B.
- `lest_overlook_disc`, `lest_street_night`, `landmark_meteor` all restored to
  200-256 KB from 14-48 KB.

**Caution for the coordinator:** per `LANDMINES.md`, every `--build <sha>`
re-bakes the shared artifacts from *that sha's* sources. A capture at a sha
before `e848801` will write a version-1 `geo.bin.gz` back over the repaired one
and every lane's frames go white again until `texbake.mts --geo` is re-run.

## Not this defect, found next to it

`galdin_restaurant` is still small (9 527 B -> 48 096 B) because the **camera is
under a parasol**: 80% of the frame is the flat maroon underside of a canopy,
with a sliver of paving, one NPC's leg and a shadow at the bottom. A framing
defect in `src/game/Shots.ts` (lane 3's file), not a render one. Residue.

## The gate

`src/tools/framecheck.mts` + `src/tools/probes/framescan.mts`. One boot, every
shot, two buffers: the **default framebuffer** (`gl.readPixels`) for the frame a
reader would see, and `rtScene` for the linear radiance that produced it. Fails
on `white% >= 90`, `black% >= 98`, `sceneMean >= 40`, or any NaN pixel — the
last of which subsumes `probes/nanscan.mts` at no extra read.

## Which frames were affected — the corpus answer

By `imagestats` `clip%` on the pre-fix corpus (`tmp/r17`, sha `d1714752497a`),
against the same 166 shots re-captured after the fix (`tmp/wf/corpus`):

| band | before | after |
|---|---|---|
| 100% clipped (pure white) | 11 | 0 |
| >= 90% | 15 | 0 |
| >= 45% | 30 | 0 |
| worst single frame | 100.00% | **15.25%** (`vista_dawn`) |

The eleven: every `lest_*` shot (9), `galdin_pier_fishing`,
`galdin_restaurant`, `galdin_night_lanterns`, `disc_crater_night`. The next
tier: `landmark_insomnia` 98.1 -> 0.57, `landmark_dreadnought` 97.2 -> 0.91,
`northwatch_ruin` 94.0 -> 0.00, `poi_fishing` 89.9 -> 0.21, `landmark_meteor`
86.9 -> 1.09, `zone_mencemoor` 84.2 -> 0.58, `zone_lestallum` 79.1 -> 0.02,
`zone_keycatrich` 72.1, `zone_longwythe` 65.0, `cine_astral` 63.2 -> 0.00,
`bestiary_titan` 61.8, and the whole Hammerhead town group in the forties.

The pattern is the merged kits: `AttrPack` only touches geometry over 8 000
vertices, which is exactly the city blocks, megastructures and landmark
compounds. Small live-built props were never packed and never broke.

## Gate results

    node src/tools/framecheck.mts
    framecheck: 166 shots at 1600x900
    PASS — every one of 166 shots is a picture
      (worst white 18.8%, highest scene mean 0.76)
    0 NaN pixels in 166 shots.

Second run, busy tree: PASS, worst white 19.1%, highest scene mean 0.75, 358.6 s
wall on one browser worker. Run-to-run spread 0.3 of a point — quote that before
reading any movement off this gate.

Registered in `check.mts` as a browser gate, `expect: '166 shots, none blown or
blank'`. `pnpm run check` was **not** run — the coordinator owns the suite.

`framecheck`'s edge case is validated against the real defect rather than a
synthetic one: at the broken sha the same two signals read `white% ~= 100` on
eleven shots (`imagestats` `clip`) and `sceneMean` **1 185** on
`lest_market_day` (`tmp/probes/bloomin.mts`), against thresholds of 90 and 40.
It has not been run against a deliberately re-broken bake, because doing so
would write a version-1 `geo.bin.gz` into the shared cache and blank every
other agent's captures for the duration.

## Open questions

- Should the byte-size canary also live in `shoot.mts`? It is the cheapest
  detector there is and `LANDMINES.md` already recommends it, but the corpus
  says a flat threshold has one honest false positive (`dun_balouve_drift` at
  0.098 of the median is a real frame), so it would have to be a warning and
  not a failure. Not written; `framecheck` covers the same ground with no false
  positives. Coordinator's call.


## Commits

- `e848801` — the fix, `src/engine/GeoBake.ts` (lane 14's file, landed on its
  own pathspec; lane 14 is finished and records GeoBake as untouched).
- `b831213` — `src/tools/framecheck.mts`, `src/tools/probes/framescan.mts`, and
  the one-line registry entry in `src/tools/check.mts` (lane 16's file).
- `1cbdc98` — three residue lines in `project/TASKS.md`.
- `94f24d0` — two `project/LANDMINES.md` sections.
- `4fca249` — the gate's measured cost and reproducibility.

## Status

**Done.** Nothing is left mid-way. The one thing a successor might still do is
the `shoot.mts` byte-size warning under "Open questions" above.
