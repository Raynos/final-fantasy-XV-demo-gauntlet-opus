# landmarks-r2 — the kits, the aprons, the Meteor

**Owner:** the `landmarks-r2` lane, 2026-08-28. **Owns** `src/world/props/`,
`src/world/town/`, `src/world/dungeons/`.
**Brief:** `docs/plans/2026-08-26-opus-the-standing-backlog.md` §WS-13 "Landmarks
and props", §WS-5, and the negatives table.
**Predecessor:** `project/archive/handoff/landmarks-r2.md` — read it; nothing in
it is redone here.

Every claim is marked **VERIFIED BY EYE**, **MEASURED** or **UNVERIFIED**.

---

## The finding that reframed the lane

**Item 1's premise is stale, and item 4's "fourth mechanism" is the aprons.**

`_tomb` does **not** build from bare `BoxGeometry`. It has been a full
`BuildKit` temple — crepidoma, entasis, entablature, pediment, cella,
`bakeTone` — since the kits round, and its two `new THREE.BoxGeometry` calls are
the emissive rune glyphs. Counted (**MEASURED**): `_fishing` 17, `_restStop` 10,
`_parking` 5, `_outpost` 4, `_imperial` 4, `_tomb` 2, `_chocobo` 2, `_dungeon`
1 — and **`_landmark`, `_menace` and `_haven` have none at all**.

The tomb's "40-px grey box" is the **framing**: `poi_tomb` poses the camera
321 m out with two thirds of the temple behind a ridge. On a clear sightline at
the same range the colonnade, pediment and stylobate all read
(`tmp/shots/lr2-tomb/tomb_320.jpg`, **VERIFIED BY EYE**). Same shape of finding
as the closed `zone_longwythe` negative.

What that frame *did* show is a temple **standing on a flying saucer**
(`tmp/shots/lr2-tombp/float.png`): the graded apron thrown out over a crest with
daylight under it and a block hanging free beside it. That is the predecessor's
unexplained levitating boulder, and it was never in `Rocks.ts`.

### The number: `src/tools/probes/padhang.mts`

Per apron, the outer 12 % of the mesh's own radius — the toe ring, which is
supposed to be *under* the ground — against `Terrain.drawnHeightAt` at the
finest ring.

| | aprons over 0 | > 1 m | > 3 m | > 6 m | mean toe |
|---|---|---|---|---|---|
| at `4e98297` | **90** of 91 | 41 | 28 | 19 | **+1.13 m** |
| `bb78cee` | 56 | 31 | 23 | 12 | −0.92 m |
| `911f99d` | **50** | **21** | **15** | **5** | **−1.30 m** |

`floatcheck` reads 0 POI floats on all three, correctly: gate 1 is `min over
MESHES` and its own blind list says a compound passes as soon as one mesh
reaches the ground.

### Three mechanisms, all measured

`probes/cliffwhy` (scratch) replays `gradePad`'s bearing loop through `coverY`:

| pad | kerb bearings | plunge-clamped | mean drop | worst drop |
|---|---|---|---|---|
| `tomb_conqueror2` | 11/36 | 4/36 | 11.7 m | 41.6 m |
| `alstor_haven` | **22/36** | 6/36 | 21.0 | 40.8 |
| `greyshire` | 14/36 | 3/36 | 20.0 | 58.2 |

1. **`cliff` fired on ordinary hillside.** "Does the 1:3 line reach the ground?"
   — and 1:3 is 18°. Where it failed the bearing took a 1.6 m kerb and let the
   terrain "hold the pad up", except the terrain is a 1:1.5 slope.
   `catchSlope` solves for the gentlest face that lands instead.
2. **The toe buried against an *upper* envelope.** `coverY` is
   `Terrain.drawnEnvelope`, `max` over clip levels — right for a seat, wrong for
   a toe, which must be under the surface at **every** LOD. That envelope runs
   0.3 m over the finest drawn ground at `tomb_conqueror2` and **11.2 m** at
   `tomb_fierce`.
3. **`_tomb` scatters its own masonry outside its own deck.** Nine fallen blocks
   and three drums at `d` 7–13 through a `world` matrix scaled **1.4** = 11.9 to
   18.2 world metres, against a 13 m deck that retreats to 9.75.

**And one measured self-correction.** The first cut of (1) let the batter chase
the ground however far it fell. The numbers improved (mean toe +1.13 → −0.92)
and the frame got **worse**: three smooth 46 m tan cones pasted across a red
cliff (`tmp/shots/lr2-a1j/tomb_320.jpg`, **VERIFIED BY EYE**). `FILL_MAX` — 10 m
on a small pad, 18 on a town's — is stated as a composition limit, and the deep
bearings fall through to a kerb that now grows a **retaining wall** to the
ground rather than stopping in air (`tmp/shots/lr2-a3/float.png`: the sky under
the plinth is gone).

---

## Landed

| sha | what | state |
|---|---|---|
| `bb78cee` | `probes/padhang.mts`; `catchSlope`; the batter grades against a lower envelope | **MEASURED** |
| `911f99d` | `FILL_MAX`; the kerb's retaining wall; the tomb's masonry pulled inside the deck | **MEASURED** + **VERIFIED BY EYE** |
| `b119dd3` | `basaltColumns` — the haven's shelf stops being a lathe. **Also repairs `911f99d`, which committed the call site without the callee** | UNVERIFIED by eye |
| `1d95705` | the two negatives and four new rows into the plan; `probes/fishdeck.mts`, `probes/rocktint.mts` | — |

---

## Open, in the order I would take them

1. **Look at `poi_haven` and confirm `basaltColumns`.** Written and building;
   the frame was still queued behind another lane's `check:perf` when this was
   written. `tmp/shots/lr2-base/poi_haven.jpg` is the before — a grey disc with
   a hard circular lip and a smaller one on top, glowing runes inside.
2. **The Meteor's vertex-colour lever, in the working tree and uncommitted.**
   `rockGeometry` gains `tintNorm` (default **off**, so the instanced rock field
   this file calibrated is untouched); `meteorMass` and `shard` pass it; and
   `megaMaterials().stone` turns `vertexColors` on. The old note on that
   material — "mean about 0.55 ... rendered the meteor near-black" — was right
   about the sign and stale about the number: the bake was rewritten so dust is
   a lightening above 1, and `k = dust * (1 - 0.42 * ao)` now means about 0.84.
   `probes/rocktint.mts` measures it. **Needs its own before/after on
   `zone_mencemoor` and `landmark_meteor` and has not had one.**
3. **`_genOutcrop`'s plan/seat split.** The *joint* half is already landed —
   `d3b4ba9`'s sunk-position rule is in the course loop, with the comment. What
   is left is the pure-function extraction (`outcropPlan(rng, rockS, ext)`,
   taking `flatness` as a callback because the loop reads `eco.slope01`) and a
   `rock:outcrop` family in `silhouette.mts`'s `rockSubjects`, next to
   `rock:tor:*` and `rock:stack`.
4. **Three pads still hang past 6 m** — `fort_vaullerey` 24.8, `tomb_fierce`
   21.1, `tomb_mystic2` 13.6. All three straddle a brink; the answer is probably
   the **pin**, in `WorldMap.ts`, not the earthwork.
5. **Four fishing camps stand 4.8–5.6 m above their own bank.**
   `probes/fishdeck.mts`, all ten pins:

   | pin | base | water | dist | deck | bankAir | pileAir |
   |---|---|---|---|---|---|---|
   | `swainsmere` | 64.5 | 68.5 | 0 | 5.53 | **5.61** | 2.12 |
   | `crestholm_reservoir` | 77.3 | 80.9 | 0 | 5.09 | **5.42** | 1.80 |
   | `archaeans_mirror` | 33.6 | 37.2 | 0 | 5.08 | **4.90** | 1.97 |
   | `maidenwater` | 37.0 | 40.5 | 0 | 4.97 | **4.77** | 2.40 |
   | `vesperpool_dock` | 14.8 | −6.5 | 24 | 1.40 | **9.77** | **20.99** |
   | `caem_shore` | 95.3 | none | — | 0.90 | 0.99 | 0.05 |
   | `rachsia_bridge` | 120.0 | none | — | 0.90 | 1.05 | 2.71 |

   `_fishing` sets **one** `deck` from the water and then puts the shack, rod
   stands, bench and crate on it as well — and those stand on the *bank*. The
   fix is to split the two and ramp between them; `vesperpool_dock` also wants
   per-pile lengths, its tip being over a 21 m drop.

## Verified, and closable

- **The two genuinely dry pins are fixed.** `caem_shore` and `rachsia_bridge`
  find no water within 180 m and take `_fishingDry`: no deck, no piles, no
  handrail, `bankAir` ~1.0 m (**MEASURED**).
- **The four tarn jetties are fixed.** All four sit *in* their water
  (`dist = 0`) with decks **1.5 m proud** of the surface where the water lane
  measured them 1.5–2.1 m under (**MEASURED**).

## Negatives — do not re-open (rows are in the plan)

- **The seven kits do not build from bare `BoxGeometry`.** Counted above.
- **`poi_tomb`'s "40-px grey box" is the framing, not the kit.**
- **The levitating boulder is a fourth mechanism and it is not a rock.** It is
  the apron cantilevering plus `_tomb`'s own masonry outside its own deck.
- **`gradePad`'s `cliff` premise was false**, and the unbounded fix for it was
  worse in the frame than the bug.

## Rules this lane is carrying

- **The measurement is not the bar.** Mean toe went +1.13 → −0.92 m on a change
  that made the frame worse. Capture and look before committing to a direction,
  not only after.
- **`git commit -- <pathspec>` with the pre-commit hook is not a build gate on
  what you committed.** The hook builds the *working tree*; if the tree has the
  callee and your pathspec does not, HEAD breaks and the hook passes. `911f99d`
  did exactly that and `b119dd3` repaired it.
- Editing anything in `GEO_SOURCES` prunes the geometry bake:
  `node src/tools/texbake.mts --geo`, and `daemon.mts --health` reports it.
