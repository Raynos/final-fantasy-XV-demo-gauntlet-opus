# landmarks — WS-5: the Meteor, the landmarks, massing

**Owner:** the `landmarks` lane, wave 2, 2026-08-28. **Owns** `src/world/props/`.
**Brief:** `docs/plans/2026-08-26-opus-the-standing-backlog.md` §WS-5, all items.

Every claim below is marked **VERIFIED BY EYE**, **MEASURED**, or **UNVERIFIED**.

---

## The measurement that reframed most of this lane

`discCrater` is a real crater and nobody had read its profile. A radial sweep of
`Terrain.heightAt` around the Disc centre `(-1020, -2160)`, 20-degree steps,
0 to 2400 m (**MEASURED**, scratch probe, same rig as `probes/meteor.mts`'s ring):

| r (m) | 0 | 200 | 400 | 600 | 800 | 1000 | 1200 | 1400 | 1600 |
|---|---|---|---|---|---|---|---|---|---|
| ground | 253 | 11–56 | 2–48 | 3–84 | 132–352 | 93–416 | 37–225 | 30–249 | 3–202 |

A **253 m central peak**, a **moat at 3–56 m from 200 to 600 m out**, and a **rim
at 800–1000 m standing 130–420 m over that moat**.

Two things follow, and both were live bugs:

1. The four outer Meteor masses stand 320–360 m from the centre — **in the
   moat** — so the previous round's full-follow seat dropped each about 180 m
   and their crowns finished *below* the rim. From outside the crater, which is
   every camera, four of five masses were invisible and the fifth was a lone
   dome. The seat had reintroduced the exact "one rounded outline owns the
   silhouette" that five masses were authored to cure.
2. The 420–800 m ejecta ring was **in the moat too**, walled off from every
   camera by the crater's own rim. That is why fixing its seat last round made
   it visible and changed nothing.

Also **MEASURED, worth knowing and not mine to fix**: `zone_mencemoor`'s camera
is `pos [400, 286.4, -1200]` and the ground there is **44 m**, so the camera
that the shot's own comment describes as standing "on a rim spur" is **242 m in
the air**. `Shots.ts` is the coordinator's file.

---

## Landed

| sha | what | state |
|---|---|---|
| `b1db957` | Meteor texture scale is world-referenced (metres per tile), not per object | **VERIFIED BY EYE** |
| `7fdd391` | Mass seat follow 0.35, the prow, apron + crater rim | **VERIFIED BY EYE** |
| `7cb498e` | Tower massing: six plans, and the skirt is concrete not a white cone | **VERIFIED BY EYE** |

### `b1db957` — uvScale
`uvScale` is tiles per **world metre** (it is applied after `rockGeometry`
normalises to `size`), and `rockMaterial` lays its Worley joints at frequency 7
inside a tile, so `joint cell = 1/(7·uvScale)`. `22/(r·1.95)` gave the five
masses 0.0376–0.0684 — a 1.8× step in tile size between masses that
interpenetrate — and put the joint network at **3.8 m**, which at
`zone_mencemoor`'s **1.39 m/px** is 2.7 px and mips to flat grey. Now
`MASS_M_PER_TILE = 70` (10 m cell, 7.2 px) and `EJECTA_M_PER_TILE = 14` (2 m
cell). Before/after 2× crops: `tmp/shots/lm-basep/met.png` vs
`tmp/shots/lm-uvp/met.png` — before is flat dark with isolated bright relief
risers reading as glitter; after carries large-scale tonal mottling and joint
traces across the shadowed face.

### `7fdd391` — the Meteor's seat, prow and rim
- **`MASS_FOLLOW = 0.35`.** A shattered mass is one body; its parts share an
  attitude and do not each drape over the terrain. Mass B's foot is still 251 m
  under the moat floor (was 308) and its crown clears the rim by ~80 m.
- **The prow is mass `2203`**, identified by arithmetic not by eye: mencemoor
  looks along `(-0.828, 0, -0.560)`, so screen-right in world is
  `(0.560, 0, -0.828)`; 2203's local `(305, -150)` rotates through `YAW = 0.6` to
  a world offset of `(167, -296)`, which dots to **+339** — the only mass on
  that side by an order of magnitude. Its lean went 0.46 → 0.19 rad, and a sixth
  mass `2206` (the only one whose long axis is horizontal) sits behind and under
  its shoulder.
- **Apron** 44 shards at 240–720 m, sized 30–96 m, inward-biased — the
  transition from a 900 m cliff to flat ground.
- **Rim** 46 blocks of 52–155 m on the heightfield's own rim at 790–1060 m,
  stretched along the ring, leaned outward, with two breaches. **Sized against
  `zone_mencemoor` at 1714 m and 1.39 m/px** and deliberately not against
  Longwythe.
- Draw calls identical on all four judged shots: 319 / 631 / 485 / 637.

### `7cb498e` — tower massing
`_tower` now draws a **plan** per tower and holds it up the shaft: `slab` .26 /
`ell` .18 (top section drops the short wing) / `notch` .16 / `twin` .14 (link at
0.20 w × 0.56 h so **44% of the gap is sky**) / `cross` .11 / `twist` .15. All
into the same two merged materials, so **free** — 295 / 426 / 485 calls before
and after. The 190 m skirt is now `M.pale` at a 1.28 flare: on a cylinder
three's UVs wrap the map once round the barrel, so `curtainMaterial` smeared to
nothing and each skirt that cleared the ground was a **blank white cone**.

---

## What the eight review shots actually show (all captured at HEAD `b5ece924`, VERIFIED BY EYE)

The §WS-5 claim that six shots had not been captured since `6306fc6` is now
stale — all eight are captured and read. `floatcheck` also **runs now**; the
`socket hang up` is gone (PASS, 0 POI floats, 0 buried, 355 instance floats
worst 0.31 m against a baseline of 362).

- **`zone_mencemoor`** — the Disc is a single very dark monolith against bright
  sky. Before this lane: a hooked prow on the right with a visible undercut.
  After: no beak, a broad right shoulder, rim blocks reading as a shattered
  ridge at its foot on both sides, and the fissure glow visible from this camera
  for the first time. A POI temple bottom-right sits on a smooth pale
  **cake-stand** apron — confirmed, still open.
- **`zone_longwythe`** — before: the Meteor's bottom was a hard horizontal cut
  with pale sky under it, unmistakably floating. After (3× crop
  `tmp/shots/lm-r1p/met.png`): the base runs continuously down behind the pale
  ridge. **The near half genuinely has no rock below the road** — confirmed by
  eye; census delegated.
- **`zone_vannath`** — same story, a shoulder where there was a cut thumb.
- **`zone_three_valleys`** — the skyline was a smooth haystack of near-identical
  combs; now spires, a dominating central tower and sky gaps. Terrain is bare.
- **`zone_ostium_gorge`** — **a dozen boulders read as detached/floating** on the
  massif and in the near field. `floatcheck` says they are not floating
  (worst 0.31 m) and `probes/mushroom.mts` says the stack overhang is 2.847 max,
  not the 7.418 an older handoff quotes. A 4× crop (`tmp/shots/lm-png/c1.png`)
  shows what it really is: **the lower half of a boulder goes to near-zero value
  and merges with the terrain's shadow band, so only the sunlit cap reads.** It
  is a value/contact problem, not a seat problem. **NOT chased — recorded.**
- **`vista_noon`** — fine, nothing of mine in it.
- **`zone_taelpar`** — fine, Duscae green.
- **`landmark_meteor`** — this shot DOES contain the Meteor (re-framed
  2026-08-24; `variety-r3`'s note that it does not is stale).

---

## Still open, in the order I would take them

1. **The POI kits from bare `BoxGeometry`** — `_imperial`, `_tomb`, `_landmark`,
   `_dungeon`, `_chocobo`, `_menace`, `_haven`. `_block`/`_hut` are the
   templates; `TownKit.texelPlace` / `PartBuilder.texelBox` are the mechanism.
   **The tomb first** by its own docstring. Shots: `poi_tomb`, `poi_imperial`,
   `poi_landmark`, `poi_dungeon_*`, `poi_chocobo`, `poi_menace`, `poi_haven`.
2. **`_haven`'s boulder ring** — `PoiKits.ts:742-761`, fourteen
   `DodecahedronGeometry(sc, 0)` in two concentric rings on a mapless
   `plain(0x968a76, 0.93)`. The fix is one import: `rockGeometry` + `hullExtents`,
   both already exported. Geometry inside an existing merge, so **free**.
3. **The 124 aprons are cake stands**; the haven pad is a smooth cone with no
   scree, rills or tonal break across 30 m of batter.
4. **`assertAttributeContract`** wiring into a generator — `src/util/GeoAssert.ts:219`,
   **`try`/`catch` + `console.error`, never a bare throw** (a throw on an
   `init()` path means `GAME.ready` never sets and every browser tool on the
   machine returns a bare `waitForFunction` timeout).
5. **`_genOutcrop` is ungraded** — needs the plan/seat split `_genTor` got, then
   a `rock:outcrop` family in `silhouette.mts --set rocks`.
6. **Grass through the plaza and the outpost pads** — delegated, see below.
7. **The near half of `zone_longwythe`** — delegated, see below.

## Delegated, results not in yet at the time of writing

- A read-only sub-agent is diagnosing the `_exclusions` chain (kits publish →
  `Ecology.cleared`/`poiClear` → which vegetation population fails to test it).
  **If the fix lands in `src/world/veg/` it is another lane's and gets reported,
  not edited.**
- A read-only sub-agent is running the `zone_longwythe` near-band rock census
  against a 200-m-off-road control. **Do not raise `rockD`** — density there is
  a 6–9× lever and the first attempt at wiring it stripped the field to a tenth.

## Rules this lane is carrying

- `uvScale` is **tiles per world metre**, not tiles per object. State texture
  scale in metres.
- **A seat that is right for a slope is wrong for a bowl.** Full ground-follow
  put a landmark inside its own crater.
- Everything merged into an existing `PartBuilder` batch is free; a **new**
  instanced mesh is **four** draw calls (colour + three cascades).
- `imgdiff`'s recorded floors are **cold** floors; a warm diff runs 4–6× them.
  Two `--cold` captures of one build reproduce to 0.44–0.83.
- The `--hide` cost warning in §WS-9 is stale as of `da7bfe2`; ablations are
  trustworthy again, `--raw` still on both sides.
