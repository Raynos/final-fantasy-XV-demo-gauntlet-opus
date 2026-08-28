# perf lane, round 4 — the last stalls and the draw work

Owns `src/engine/postfx/` (not the AA/sharpen passes — `alpha-edges` holds
those), `src/characters/npc/`, `src/world/terrain/Clipmap.ts`, and by necessity
`src/engine/Warmup.ts`, which nobody else claims and which is where the last
33 ms breach actually lived.

Brief: `docs/plans/2026-08-26-opus-the-standing-backlog.md` §WS-6 and §WS-11's
"Draw calls".

## Read this first: four of the eight items were already closed by other work

The backlog's WS-6 text is a queue nobody re-read, and it is stale in four
places. Verified at HEAD before starting:

| WS-6 said | at HEAD |
|---|---|
| `day-night-sweep` 11.3 ms, 11% over budget | **7.0-7.1 ms**, twice, on a quiet ruler. Closed. |
| `menu-open` hitches, `ScenePass` 3.5 -> 37.6 ms | **0 hitches, max 7.4 ms**, twice. Closed. |
| the menu scrim's 26 px `backdrop-filter` is an unmeasured risk | **signed off** by the same two runs — see below |
| `VelocityPass`'s missing frustum cull is the cheapest draw win | **landed in `4c57c1c`**, a day before the section still said so |
| the NPC shadow-proxy merge is the next draw win | **landed** — `a465ad0`, `a50ad33`, `881d065`, `src/characters/npc/NpcShadow.ts` |
| `town_forecourt` is the one shot over 800, 24 away | `STATUS.md`: worst **786**, zero shots over, `drawcheck` flat and green |

## The menu scrim: signed off

`gameplay.mts` twice, `RULER_VALID: true`, the second run stamped
`VERDICT: quiet`. `menu-open` is **4.7 and 4.9 ms** thru (212.8 / 204.1 fps),
p99 7.4, **max 7.4, zero hitches** in both. The full-screen 26 px
`backdrop-filter: blur(26px)` that WS-9 made render for the first time costs
nothing a frame budget can see. This was the live unmeasured risk and it is
closed.

## The one remaining 33 ms breach: found, and it was neither candidate

`sprint+turn` spiked **40.4 / 40.7 ms at frame 35** and **34.9 / 33.1 ms at
frame 23**, the same indices every run. WS-6 offered two candidates and had
never separated them. Both are now measured negatives:

- **Not buffer uploads for geometry `Warmup` built but never drew.**
  `probes/perfupload.mts`: both spike frames report `fresh 0, freshKb 0` — not
  one geometry rendering for the first time — while the frame that really does
  upload **497 KB** of fresh Menace-POI geometry costs **6.4 ms**.
- **Not shadow-cascade work for hundreds of new casters.** New probe
  `probes/perfstall.mts` times `renderer.shadowMap.render` and splits every
  `renderBufferDirect` into shadow / colour. On the 86 ms frame the shadow pass
  is **0.3-0.6 ms**, with the same **99 shadow draws and 1.48 Mtris** the median
  frame on that cascade phase carries. The all-three-cascade phase (292 draws,
  4.4 Mtris) has a median frame of **5.4 ms**.

**It is one draw call linking one shader program.** Per-draw timing puts
**35.5-90.8 ms inside a single `renderBufferDirect`**, and
`renderer.info.programs` grows by exactly one across the frame. Diffing the new
cache key against its nearest already-linked twin isolates one bit of three's
second `getProgramCacheKeyBooleans` mask:

| frame | object | differing bit |
|---|---|---|
| 35 | `roadflat_road_rust` (`RoadFurniture.mats.rust`) | 11, `doubleSided` |
| 23 | a `VelocityPass` motion-vector proxy | 5, `skinning` |

`RoadFurniture`'s rust is `FrontSide`; `PoiKits`', `Outposts`' and `Landmarks`'
are the same recipe with `side: DoubleSide` bolted on, and only those had ever
drawn. Every mover in the world at boot is a character, so only the *skinned*
velocity shader had ever linked.

**`perfsprint.mts`'s "zero new programs" was a false negative** and cost two
rounds: it compares programs by `name + '|' + cacheKey.length` **strings**, so a
program whose key-string is already in the list reads as no program at all.
Count `renderer.info.programs.length`, or diff the keys.

### The fix — `747136a`

Two new `Warmup` steps, both in `src/engine/Warmup.ts`:

- **`unbuilt content`** — walks each system's own properties for material
  tables, structurally rather than through a registry every kit must remember to
  call, and draws one scratch box per material into the throwaway target with
  shadows on. **It does not skip materials already in the scene**: `road_rust`
  *is* in the scene at boot and its program still linked, because three keys the
  program on the object as well as the material. Skipping by uuid warmed 3
  programs and left the 90 ms frame exactly where it was. Restricted to three's
  built-in mesh materials — a bare `ShaderMaterial` in a table belongs to a pass
  with its own target, and a scene flavour of it is precisely the unbound
  program `engine/CompileGuard.ts` just removed.
- **`velocity proxies`** — `VelocityPass.warm()` links all six variants (plain /
  skinned / instanced, front- and double-sided). They live in `proxyScene`,
  which is not `game.scene`, so nothing walking the scene graph could reach
  them. **The six materials are held, not disposed**: three refcounts programs
  by material, and disposing them releases the programs again — measured, the
  spike still fell 43 -> 7.1 ms because ANGLE keeps the translated shader, but
  `dProg` stayed 1.

Cost: the loading screen goes **150 -> 566 ms on that step, +9 programs**
(126 -> 135). Boot time is not in `BRIEF.md`; the 33 ms rule is.

## Still open

- **`tf_stoch` has never been measured.** `?post=nostoch` now exists (`73ae5f0`,
  `src/world/terrain/TerrainMaterial.ts`) and collapses the Heitz-Neyret
  sampler to a single barycentric tap. Ablation only — the lattice comes
  straight back. Price it with `perf.mts --post nostoch` against a plain run on
  ground-dominant shots; the pre-planned fallback if it is expensive is to gate
  it to `vTDist < ~400 m`.
- **Draw-call headroom** (not a gate failure — the corpus is green):
  - `Water.lateUpdate` renders a **mirrored second view** whenever any body's
    *bounds box* intersects the frustum (`Water._visible`), with no
    screen-coverage or distance test. ~40 draws on a shot with no visible water.
  - the NPC eye globes and contact-shadow blobs, ~28 colour draws. The two
    globes cannot merge (independent gaze pivots); the **blobs across all NPCs
    could become one `InstancedMesh`**, and `NpcRig.setLod` already has the
    band structure to drop the globes earlier than 38 m.
- **The 16/16 texture-unit warning** is still unaddressed and is printed on
  every page.
- **Wave 3's frame-cost split** (pixel-scaled vs fixed) — untouched.
- **Character LOD**, handed over by the `materials` lane: `town_forecourt` is
  465 calls / 5 327 248 triangles, one `SkinnedMesh`/`ShaderMaterial` bucket at
  60 calls / 1 736 436 tris / **28 940 per draw, no LOD**. Headroom, not cost —
  the frame is 6.0-7.2 ms of 16.7.

## Method notes that cost time

- **`--dirty` is a shared trunk.** A measurement run died on
  `Deposits: mergeGeometries returned null` from another lane's untracked
  in-flight file. Commit and measure `HEAD`.
- `daemon.mts --wait quiet --for N` piped into `&&` will sit for the full N
  while other lanes shoot; `perf`/`gameplay` do their own lane wait and print
  `VERDICT:` — just run them.
- Both cache warnings (`texc.bin.gz`, `geo.bin.gz`) were live all session, so
  every absolute boot number here is inflated. The deltas hold.
