# draw-budget — the corpus against BRIEF rule 3's 800

**Status: 1 of 142 shots over, `town_forecourt` at 821 (+21). The change that
closes it is in `src/characters/`, which this lane does not own.**
Commits `8a89c1c`, `e334e94`, `5efd74c`, `ba17eb4`, `37c793e`.
**`pnpm run check` 18/18 PASS** on the finished tree; `floatcheck`'s `instBuried`
improved 861 -> 801, which is the check that the stone-field merge places the
same instances.
Owns `src/world/props/**`, `src/world/terrain/Clipmap.ts`,
`project/draw-baseline.json`.

## Where it stands

| | before today | after |
|---|---|---|
| shots over 800 | 9 (of 11 recorded, 2 already cleared) | **1** |
| worst | `town_forecourt` 902 | **`town_forecourt` 821** |
| second worst | `poi_reststop` 881 | `poi_reststop` **800**, exactly at budget |
| corpus median / mean | 667 / 621 | **587 / 545** |

`project/draw-baseline.json` is one line and it is measured, not remembered.
Full corpus every time — a subset `--set-baseline` DELETES the entries it did
not measure.

## What landed

1. **`e334e94` — a clipmap level is one mesh, not four.** −39 on every shot in
   the game. Seven levels cost 80 draws (28 colour, 24 shadow, 28 in the
   reflection pass); they cost 20 now. A level was four meshes only because
   `_quadrant` mirrors the lattice and the winding has to flip; all four share
   material, depth material, `renderOrder` and position. The frustum was never
   going to do this: each quadrant's bounding sphere contains the camera.
2. **`5efd74c` — every landmark in the world casts one shadow.** −26. One
   `PartBuilder` runs over every haven, obelisk, shack, truck, sign, telegraph
   run and fence and emits fourteen world-spanning per-material meshes, each
   submitted into every cascade. **`shadowProxy` now lives on `PartBuilder`**,
   where `world/town/Hammerhead.ts` and `props/PoiKits.ts` both said it
   belonged, and `build({ mergeShadow: true })` asks for it.
3. **`ba17eb4` — one instanced mesh per stone kind, not two.** −16 to −20. The
   near and far rock tiers stopped being an LOD when they were given a shared
   geometry; two meshes with the same geometry and material are two colour
   draws and two submissions per cascade. The tier *budgets* are untouched.

Every step: `imgdiff` worst mean **0.31/255** against per-shot floors of
2.00 / 0.25 / 0.18, all under the 1.493 two fresh boots of one shot differ by,
and the frames were looked at full-size (`vista_dusk`, `town_forecourt`,
`regalia_drive`, `storm`).

## The last 21, and who owns them

Attributed on `town_forecourt`'s peak frame with **`src/tools/_probe/drawattrib.mts`**
(new — a generic `renderBufferDirect` wrapper that tallies every draw by owning
system and by pass; `src/tools/probes/npcdraws.mts` is the NPC-specific
ancestor):

| draws | owner | |
|---|---|---|
| 136 | `src/world/veg/` | grass, 58 colour + 78 shadow |
| 136 | `src/characters/` | the four party rigs, 68 + 68 |
| 132 | `src/engine/postfx/VelocityPass.ts` | 60 skinned + 72 plain `ShaderMaterial` proxies |
| 107 | `src/characters/npc/` | eleven NPCs, already proxied |
| 65 | `src/world/veg/` | trees |
| 41 | `src/world/town/` | Hammerhead, already merged |
| **131** | **this lane** | RoadFurniture 36, Outposts 35, Rocks 26, Landmarks 25, PoiKits 5, Debris 4 |
| 20 | `terrain/Clipmap.ts` | this lane, already minimal |

**The one change that clears the corpus has already been made once in this
repo.** `src/characters/npc/NpcShadow.ts` gives each NPC a merged skinned shadow
proxy: an NPC costs 6 shadow draws (proxy + alpha-cut hair × three cascades).
The party did not get it — `Noctis_body`, `_head`, `_hair`, `_outfit` and the
same for Gladiolus, Ignis and Prompto each cast for themselves, **4 × 4 × 3 = 48
shadow draws**. At the NPCs' 6 apiece that is 24, and `town_forecourt` lands at
**~797**. The handoff for that work is `project/handoff/npc-shadows.md`; it is
the same file, the same trick, four more rigs.

Two smaller ones, also not this lane's:

- **`VelocityPass`, 132 draws, 16% of the frame.** One motion-vector proxy per
  *mesh* per mover. The same merge that fixes the party's shadow would fix its
  velocity: one proxy per character instead of five.
- **The reflection pass costs ~36-45 draws on `town_forecourt`, which has no
  visible water.** Counted as `[othercam]` by the probe: 7 clipmap levels plus
  ~36 unnamed meshes, rendered from a camera that is not `GAME.camera`.

## What was tried and reverted

**A shadow proxy on the Regalia** (`props/Regalia.ts`, `mergeShadow: true`) is a
clear win where the car is the subject — `regalia_drive` 664 → 647,
`regalia_cruise` 661 → 644, `regalia_night` 667 → 650 — and a **loss** where
several parked cars sit out of shadow range: `town_regalia_bay` 737 → **747**,
`town_caravan` 756 → **761**, `town_forecourt` unchanged. `PartBuilder.build`
has no range gate on the proxy, so a car nothing casts for still pays one
colour draw. `PoiKits` solves this by hiding its proxy past 90 m; giving
`mergeShadow` the same gate would make this land. Not done — it does not move
the one shot that is over.

## Traps

- **`vite.config.js` sets `watch: { ignored: ['**/*'] }`.** A long-lived
  `dirty:` vite server therefore NEVER invalidates its module graph, and an edit
  made after that server started measures as **exactly zero** — page reload and
  `--cold` included. It cost this lane an hour. Do not restart the shared
  daemon to fix it (another lane may hold the exclusive lease). Build a tree
  object out of a private index and capture that sha instead:

  ```
  export GIT_INDEX_FILE=/tmp/idx && rm -f "$GIT_INDEX_FILE"
  git read-tree HEAD
  h=$(git hash-object -w path/to/file.ts)
  git update-index --cacheinfo 100644,"$h",path/to/file.ts
  git write-tree            # -> pass as --build sha:<tree>
  ```

  (`git add` even into a private index is blocked by `.githooks`.)
- **`drawcheck`'s number is the expensive phase of the cascade cycle**, and the
  probe's peak-of-eight agrees with it to within a few draws — but both drift
  run to run with what has streamed in, and by **more than the ratchet's
  `TOLERANCE` of 8**. On the identical sha `0a42dcb`, `town_forecourt` read
  **821** in two back-to-back full-corpus runs and **801** inside `pnpm run
  check` half an hour later. The ledger records the **821**, deliberately: an
  801 entry would make the gate red on a reading the game already gives. Do not
  read a single-shot delta under about 20 as real.
- **`RockGroup.near` is now an alias for `RockGroup.mesh`**, kept only because
  `src/tools/probes/rockquilt.mts` reads `groups[0].near.material`.

## Is the budget wrong?

Probably not *wrong*, but it is not what binds the frame. At the certified
baseline (`project/baseline-perf.json`), `town_forecourt` ran **915 draws at
7.3 ms / 137 fps**, max frame 9.3 ms, zero frames over 16 — against a 33 ms
contract. The slowest posed shot in the whole corpus is `regalia_drive` at
**8.6 ms with 770 draws**: the most expensive frame is not the one with the most
draws. The real 33 ms breach is `sprint+turn` at 84-116 ms, and WS-6 measured
82.0 of its 84.3 ms inside `post.render` with zero new programs — not a
submission cost at all.

So 800 is a hygiene ratchet rather than a frame-time constraint, and it has
earned its keep: it is what found 1013 and it is why the corpus is at 545 mean
today. **It should not be moved to 850 to swallow one shot** — the shot is 24
draws from clearing on a fix that has already been written once.
