# memory-content — `TODO.md` line 2, and the last two content holes

Two jobs. **Job 1 is the human's own complaint and is answered.** Job 2 was two
items: energy deposits **landed**, Fociaugh **closed as a measured negative**
with a different cause found.

Commits: `12e1a41` `4c089cb` `06deb05` `c220833` `1eade09` `e5557e5`, plus the
backlog rewrite (swept into `a911e69` — see *Hazards* below).

---

## Job 1 — what the 1.4 GB actually is

### Read this before quoting any number here

- **`performance.memory` is frozen on this build**, exactly as
  `_probe/gcwatch.mts`'s header says. `probes/memowners.mts` opens with the
  control nobody had run: allocate exactly **200 MB** of `Float32Array` in the
  page and `usedJSHeapSize` reads **894.0 MB before and 894.0 MB after**. Every
  JS-heap row in `project/archive/handoff/boot-memory.md` is a reading of that
  constant. `--enable-precise-memory-info` does not unfreeze it.
- **Neither heap oracle is the answer on its own.** CDP `Runtime.getHeapUsage`
  is honest (68–187 MB) but a typed array's backing store is **external to the
  V8 heap**, and typed arrays are where the mass is. The buckets below add the
  external arrays explicitly.
- **`?debug=1` had never been measured.** `main.ts:37` gates the dev suite on
  `qs.has('debug') && !qs.has('shoot')`, and `bootprof --mem` compared
  `?q=ultra&shoot=1` against `?q=ultra&shoot=1&debug=1` — the same page twice,
  with the suite not loaded in either arm. The "4 MB" in `boot-memory.md` is
  boot noise between two identical configurations.
- Every number below was taken with **all four bake caches warm**. Both
  `texc.bin.gz` and `geo.bin.gz` were missing when this lane started; it rebuilt
  them (`texbake --canvas`, `texbake --geo`). `geo.bin.gz` is deleted again
  whenever a lane touches a `GEO_SOURCES` file, which happened twice in an hour.
- The runs are labelled **CONTENDED** — six lanes were live. RSS of one's own
  process subtree is not inflated by other processes (memory pressure would
  *lower* it), so treat these as a floor, but re-take on a quiet box before
  quoting them as a baseline.

### The headline

`node src/tools/bootprof.mts --mem [--play] [--prod]`. Browser RSS over the
whole process tree, node excluded, one fresh browser launch per variant:

| page | browser RSS | Chromium's floor | the world |
|---|---|---|---|
| dev, `?shoot=1` (the harness's page) | 2 759 MB | 236 | 2 365 |
| dev, `?shoot=1&debug=1` | 2 757 MB | 238 | 2 360 |
| dev, play (what a person opens) | 2 766 MB | 233 | 2 533 |
| dev, play + `?debug=1` | 2 767 MB | 244 | 2 523 |
| **prod, play** | **2 533 MB** | 252 | 2 281 |
| **prod, play + `?debug=1`** | **2 556 MB** | 232 | 2 324 |

Three answers to the human, in their own terms:

1. **It is not 1.4 GB, it is 2.5–2.8 GB** on this machine and this headless
   Chromium. Their 1.4 GB was presumably Chrome's task-manager footprint, which
   is a different statistic from summed RSS; the *buckets* transfer, the
   absolute does not.
2. **`?debug=1` is 23 MB in prod, ~1 MB in dev.** The dev suite is innocent, and
   now for the first time on evidence.
3. **"and maybe in prod mode too" is right.** Prod saves **215 MB of 2 766** —
   the dev server's unbundled module graph — and leaves **2 533 MB**.

### Named buckets — prod, play, 2 281 MB of world

| bucket | MB | how it was got |
|---|---|---|
| **GPU-side, total** | **740** | three's inventory; the gpu-process's own RSS is 823, which is the sanity check |
| — scene textures + mips | 199 | 257 textures |
| — **render targets** | **181** | 33, BFS from `game.post`, `game.rnd`, `renderer.shadowMap`. **Never counted before** |
| — shadow maps | 42 | 2–3 cascades |
| — vertex + index, uploaded | 318 | the GPU copy of the row below |
| **CPU typed arrays** (external to V8) | **448** | 275 vertex + 44 index + 103 texel + 27 instance |
| **V8 heap, live** | **85–143** | CDP `Runtime.getHeapUsage`, after `HeapProfiler.collectGarbage` |
| — of which boot garbage | 59 | the drop across a forced GC |
| **unattributed** | **~880** | Chromium renderer overhead, ANGLE/Metal, shader binaries |

### Where the 275 MB of vertex arrays is

`node src/tools/probe.mts src/tools/probes/memowners.mts` — every byte charged
to the top-level scene child that owns it.

| owner | vertex+index MB | verts | texture MB |
|---|---|---|---|
| `poi_kits` | **119.7** | 3 704 402 | 3.8 |
| `npcs` | 61.1 | 759 669 | **33.6** |
| `Group` (the party) | 51.3 | 545 187 | 20.4 |
| `megastructures` | 37.7 | 787 770 | 6.6 |
| `hammerhead` | 2.7 | 93 181 | 31.8 |
| `trees` | 4.6 | 89 611 | 10.6 |
| `DirectionalLight` | — | — | 50.3 (shadow maps) |

- **The 119.7 MB / 3.70 M vertices is resident scene geometry**, not the geo
  bake's container. That settles the backlog's open question about the figure.
- **The two biggest single geometries in the game are the towns' shadow
  proxies**: `poi_kits / town_shadow` at 11.2 MB / 670 619 verts and 10.6 MB /
  638 243. 21.8 MB and 1.31 M vertices that only ever cast a shadow, carrying a
  full vertex format to do it.
- `Gladiolus_hair` is one **15.6 MB** geometry over 124 891 verts — **125 bytes
  a vertex**. Party hair is ~27.7 MB, NPC hair ~10.4 more.
- Each NPC carries its own 1024² map: eight-plus of them, 4.2 MB each.

### By attribute, across all 552 geometries

    position   79.0 MB  (3x Float32)      skinWeight  20.4 MB
    normal     44.9 MB  (3x Float32)      skinIndex   10.2 MB  (4x Uint16)
    colour     42.7 MB  (3x Float32)      aMat / aTan  9.5 MB each
    uv         30.3 MB  (2x Float32)

### Cheaply recoverable, in order — **none taken**

Deliberately not taken: a measurement lands before the change it motivates, and
each of these is a separate lane's file.

| MB | item | who owns it, and the catch |
|---|---|---|
| 103 | CPU texel arrays, dead after upload | needs per-texture `onUpload` disposal **and a context-loss story** — after one, three re-uploads from nothing |
| ~65 | `colour` + `normal` as normalised bytes rather than Float32 | a quarter of the bytes, no visual change; touches every generator that writes them |
| 22 | the towns' shadow proxies at position-only | `src/world/props/PoiKits.ts` |
| 59 | boot garbage | one `gc()` after `ready` — but only reachable with `--expose-gc`, so it is really "allocate less during boot" |

### 309 MB of the renderer is the bake artifacts, held after they are read

The discriminator: `bootprof.mts --mem --play --prod --nobake`, which takes all
four baked artifacts out of the loop for one page load. Same tree, same
machine, same flags, against the run in the table above:

| | baked | `?nobake=1` | delta |
|---|---|---|---|
| browser RSS, prod play | 2 533 MB | **2 224 MB** | **−309** |
| renderer process | 1 555 MB | **1 234 MB** | **−321** |
| gpu-process | 823 MB | 824 MB | +1 |
| GPU-side estimate | 740.3 MB | 740.1 MB | −0.2 |
| geometry attributes | 274.7 MB | 274.7 MB | 0 |
| CPU texel arrays | 103.0 MB | 103.0 MB | 0 |

**Everything the game builds is identical and 309 MB of resident memory
disappears.** The whole delta is in the renderer process and none of it is
GPU-side, geometry or texels — so it is not the *content*, it is the
**containers**: the inflated bake buffers, still held after the last generator
has read them. `terrain.bin.gz` is 33 MB gz / 57.7 MB raw, `tex.bin.gz` 28.5 /
67.3, `texc.bin.gz` 20.5, `geo.bin.gz` 35.5.

**And the file says so.** `src/engine/GeoBake.ts:170` exports
`releaseGeoBake()`, called from `Props.ts:130` — that is the 165 MB codec
container the geometry-bake lane already deals with. **`src/engine/TexBake.ts:82`
has the same module-level `store` and nothing anywhere releases it.**

This is the single biggest recoverable item in the game's own memory and it is
about six lines: an exported `releaseTexBake()` beside `releaseGeoBake()`, and a
call once the last keyed generator has run. It is **not landed here**, on
purpose: the call site is the whole question (`Props.init` is where the geo one
goes and `src/world/` is not this lane's), and a release taken one system too
early is a silent cache miss, which `boot-memory.md`'s "a cache read before
`Props.init()` misses on every boot" already cost somebody a measurement. A late
miss is *correct* — the generator just runs, which is exactly what `?nobake=1`
does — so the risk is boot time, not output.

That leaves roughly **570 MB** of renderer still unnamed, against the ~880 the
first pass could not account for. `?q=low` is the next discriminator and is one
more `bootprof --mem` run.

---

## Job 2 — the content holes

### Energy deposits: LANDED (`c220833`)

`src/game/rpg/Deposits.ts`, ~330 lines, wired from `RpgSystem.update`'s first
tick the way `HavenCamp` is (`Interaction` boots six systems after `Rpg`).

- A faceted crystal druse per deposit, scaled by `capacity` on a sqrt curve, on
  a **separate dark rock socket material** — sharing the emissive one made the
  whole thing read as a campfire.
- A **"Draw"** prompt whose hint carries live remaining units, and when spent the
  hours to recharge. The handler calls `CombatSystem.drawEnergy`, reusing the
  mote burst, flare and `draw` event that already existed.
- Twelve separate groups with a **240 m distance cull**, not three merged meshes
  per element: merged, one bounding sphere spans the map and every deposit is
  submitted from every camera in the world.

Three things the pictures decided, not the code:

1. **A POI centre is the middle of whatever the kit built there.** The first
   build stood the Hammerhead deposit on the outpost's painted lane markings and
   the Three Valleys one inside a pylon plinth. `siteNear` keeps the anchor and
   steps 14–34 m off, scored on `roadDistance` and `slopeAt`.
2. **Emissive 1.6 clips.** Under `Exposure`'s meter the shards go to a flat
   colour and the faceting stops existing — they photograph as paper flames.
   0.75 and let bloom do it.
3. **`DEPOSITS[i].pos[1]` is hard-coded 0.** Everything asks `terrain.heightAt`.

Frames: `tmp/shots/dep3/`, `dep4/` — `dep_ice_dep_galdin` is the one to look at.
**Not yet done:** no deposit has an entry in `src/game/Shots.ts` (coordinator's
file), so none is in the corpus. `probes/depositlook.mts` is the stopgap.

### Fociaugh: CLOSED as a measured negative (`e5557e5`)

The scoped fix — move the brow, jambs and void card from `P` to `G` — **is not
what is wrong, and one third of it is actively wrong.**

- The "1.26 bank" is **one bearing of twenty-four**; the gentlest from the same
  door is **0.02** (`probes/doorsill.mts`).
- The three ellipsoids sit within 3.2 m of the sill, where the terrain rises
  2.2 m. P and G differ by ~2 m against a **7.9 m step** (24.6 m at 20 m out).
- Moving the **void card** to `G` lifts the doorway 1.7 m clear of its own sill.

What actually fills every approach frame, photographed from four vantages
(`tmp/shots/dep8`, `dep9`): **a POI apron built on top of the cave mouth** — a
~40 m untextured beige deck with cut-and-fill skirt and a structure on it. Not
`TerrainClipmap`, not `fociaugh-entrance`, not `megastructures`; each was hidden
by name in turn and the mass did not move. It does not show up in a 40 m
proximity census because it is a world-merged mesh whose bounding box covers the
map. **Owner: `src/world/props/` (`PoiKits` / `Wear.gradePad`).**

**A talus ramp was written and deliberately not landed.** Flat-topped breakdown
blocks, risers 0.85 m against `CharacterController`'s `stepUp` 0.45 /
`climbMax` 1.25, rotated about y only so every top has `n.y = 1`, descending at
0.89 against the hillside's ~1.0 so it meets the slope instead of becoming a
pier. It would have been **real collision floor** — `fociaugh-entrance` is one
of the eight names in `collision/Harvest.ts`'s `SOURCES`. Photographed from four
vantages it is entirely hidden under the apron, and `BRIEF.md` does not allow
landing geometry nobody has been able to look at. The full design is in
`e5557e5`'s message for whoever removes the apron.

### Also found, nobody's item yet

**Balouve is worse than Fociaugh and has never been reported.** Its sill is
**15.1 m below the eye 8 m out and 36.7 m below at 20 m** — the mine mouth is at
the bottom of a cliff. `content-wire.md` measured that door at −0.25; it reads
**−1.97** today. A door grade is a claim with a shelf life, like a boot number.

### Fishing audio: verified, not redone

`b915af3` is an ancestor of `main` and `reelClick` / `lineStrain` / `castWhirr`
plus the positional `splash` are in `src/game/fishing/`. Left alone.

---

## Instruments this lane left behind

| file | what it answers |
|---|---|
| `src/tools/bootprof.mts --mem` | four pages (shoot / shoot+debug / play / play+debug), `--prod`, `--play`; render targets, shadow maps and a forced-GC delta as named rows; CDP heap printed beside `performance.memory` |
| `src/tools/probes/memowners.mts` | every resident byte by owning scene child, the geometries over 2 MB, the textures over 4 MB, and the same bytes re-cut by attribute. Opens with the 200 MB oracle control |
| `src/tools/probes/doorsill.mts` | approach grade at every bearing around a dungeon door, the flattest sill within the map-pin radius, the height profile out of the door, and a 40 m neighbour census |
| `src/tools/probes/depositlook.mts` | poses the rig by hand for subjects with no `Shots.ts` entry: deposits at walk-up and 22 m, dungeon mouths from four vantages, with a hide-by-name ablation loop |

## Hazards this lane hit

- **A co-lane's commit swept the backlog rewrite into `a911e69`.** The content is
  in HEAD; the reasoning is in this file and in `m6`-style detail nowhere else.
  This is exactly the shared-index hazard `CLAUDE.md` describes.
- **`src/tools/_probe/tris.mts`** (another lane's untracked file) carried one
  `any` and `anycheck` blocked *every* lane's commit until it was typed. If
  pre-commit fails on `anycheck` and the file is not yours, this is why.
- **`setShot` calls `_cut()`**, so re-asserting it every frame never lets the
  lens settle and every capture is smeared end to end by motion blur. Set once,
  `resetClock`, then step.
- **`ConeGeometry` is indexed and `DodecahedronGeometry` is not**, and
  `mergeGeometries` returns **null** on a mixed list rather than throwing.
- **`Deposits.install` runs on the first tick**, and a `?shoot=1` page does not
  free-run — a probe that reads `rpg.deposits.nodes` without stepping reports
  zero deposits on a build that has twelve.

## Next, in the order I would take it

1. **The ~880 MB in the renderer.** Two `bootprof --mem` runs: `?nobake=1` and
   `?q=low`. It is the largest bucket and the only one still unnamed.
2. **The 103 MB of CPU texel arrays.** The one clean win in the game's own
   memory, still not attempted after three passes; it needs the context-loss
   story, not the disposal call.
3. **The POI apron on Fociaugh's mouth**, `src/world/props/`. Everything else
   about that dungeon is downstream of it, including the talus in `e5557e5`.
4. **A `Shots.ts` entry for a deposit**, so one is in the corpus rather than only
   in `tmp/`.
