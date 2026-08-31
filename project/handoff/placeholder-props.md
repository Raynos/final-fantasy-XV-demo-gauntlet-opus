# Placeholder props, checkerboard rock, rock silhouette

Lane brief: the judge's **#2 tell** (untextured black torus/box primitives lying
in shot, "decided the panel in under a second", pairs 06/09/11/19/31/43), then
its **#4** (terrain tiling degenerating into a visible checkerboard on rock,
pairs 38 and 39), then a hand-off item from another lane on **rock scatter by
slope**.

Files owned: `src/world/props/`, `src/world/terrain/`, `src/world/veg/`.
Stay out of `src/ui/` and `src/characters/`.

## Status

| # | task | state |
|---|------|-------|
| A | the black torus / box placeholder | **LANDED**, verified by eye and by instrument |
| A' | draw cost of A paid back | **LANDED**, `drawcheck` numbers below |
| B | checkerboard on rock faces | **diagnosed and half fixed** — see below |
| C | rock scatter by slope (`Rocks.ts`) | **LANDED**, censused |

## A — it was `RoadFurniture._litter`'s tyre. **Verified.**

Nobody could name it because a proximity walk returns 0.0 m for everything near
spawn: the props there are merged, so each child reports its chunk's origin.

**`src/tools/_probe/blackprop.mts`** (new) finds it in the *camera's* frame
instead. For every mesh whose material is dark enough to read black it walks the
merged geometry's own triangles, transforms each centroid to world space,
projects it through the live camera and clusters what lands on screen — so a
merged prop reports its own position and size, not its chunk's.
**`src/tools/_probe/pickat.mts`** (new) is the general form: name whatever is
drawn at a given NDC point.

> `import('three')` does not resolve in a page-evaluated probe — bare specifier,
> no module graph. `Vector3` comes off `camera.position.constructor` and
> `Vector3.project(camera)` does all the projection. No Raycaster exists in this
> codebase to borrow.

It named one object in every party shot:
`road_furniture/roadchunk_7_0/roadflat_road_dark`, material `road_dark`
`#25262a`, `castShadow=false`, **1.15 x 0.55 x 1.12 m, 4–9 m from camera,
2.07 % of the viewport**, at (-0.63, 5.18, 2.57) and (-1.84, 3.90, -2.23) —
within three metres of the world origin, where the party spawns.

Three defects, and the judge's phrasing named each one:

1. **"Receiving no light" is a read, not a mechanism.**
   `src/tools/_probe/tyrelight.mts` (new) sweeps the material's albedo and reads
   the framebuffer back through a mask derived by ablation — the pixels that
   move when albedo goes black→white *are* the prop. Measured: albedo `0x25262a`
   → rendered **50,42,40**; `0x4a4c54` → **56,47,52**; white → **131,129,137**.
   **The surface tracks its albedo; the light path is alive.** It was simply 4–5x
   darker than the ground it lay on (150–200). Fixed by `0x45464b`, roughness
   0.92, metalness **0** (0.25 was suppressing the diffuse term).
2. **"Casting no contact shadow."** `_litter` built into the `flat` builder — the
   one for skid marks and gravel. `castShadow` was toggled only over
   `children[0..castCount)` and every flat child is past that index; `flat` also
   stamps `renderOrder = 1`. Litter now builds into `cast`.
3. **"Primitive."** `TorusGeometry(0.42, 0.16, 6, 12)` is **1.16 m** across — a
   lorry tyre at 2x — with a twelve-sided silhouette. Now `(0.23, 0.10, 6, 18)`:
   0.66 m across, 0.20 m tread.

**Verified by eye**, `tmp/lane-pp/after2/party_formation.jpg` and
`party_dawn.jpg` against `tmp/round18/pair-06.jpg` / `pair-19.jpg`: where two
1.2 m flat-black rings used to sit beside the party with nothing under them,
there is now one modest tyre with a clear light gradient across the tube, a
readable hole, and a soft contact shadow on the ground. Worst on-screen cluster
**2.07 % → 0.74 %** of the viewport (`blackprop.mts`, `party_dawn`).

**The judge's "box primitives" were the same object.** `blackprop` and `pickat`
between them account for every dark cluster in the party shots and there is no
black box: the bottom-right "wedge" in `party_dawn` is this same tyre seen
edge-on in terrain shadow. Nothing else in `src/world/props/` reports a
near-black untextured primitive within 45 m of a party camera.

### A' — the draw calls, paid back

`drawcheck`, worst shot `lest_street_night`, four-shot runs:

| build | lest_street_night | party_dawn | party_formation |
|---|---|---|---|
| `e5f65cf` (before) | **736** | | |
| `56ddb24` (litter → cast) | **750** | 531 | 594 |
| `cd96f47` (+ shadow proxy) | **738** | **504** | **571** |

The move cost 14 draws, because each material bucket in `cast` is a draw per
cascade. `PartBuilder.shadowProxy` — whose docblock describes exactly this case
and which this file was not using — gives one merged position-only caster for
the whole roadkit. The 110 m range gate now toggles the proxy's `visible`
instead of `castShadow` per mesh, which is what that docblock asks a
range-gating caller to do. `castCount` survives as the fallback for a null
merge. Full-corpus `drawcheck` at HEAD **PASS**, worst 761 before the proxy
landed (of which +11 was other lanes).

### One negative worth keeping

`1a49ac5` added a 1.1 m minimum separation to `_litter` after `blackprop`
reported "two interpenetrating tyres 0.17 m apart". **There was no such pair** —
the probe clustered on a 2 m grid in x, y *and* z and split one tyre whose
centroids straddled y = 5.0. The tri count being identical across that commit was
the tell I should have read. The guard is still correct (`gauss(0, 1.6)` around
one sample genuinely can drop two items inside each other) and stays; the probe
now clusters on a 3 m **plan** grid, because over-merging turns two real props
into one row while splitting one prop invents a second. Recorded in `cd96f47`.

## B — the checkerboard. Diagnosed; the albedo half fixed.

Pairs 38 and 39 are **`vista_noon`** and **`vista_fog`** (matched by
downsampled-image distance against `tmp/r18/`; both panel A, mse 0).

**The round-18 corpus predates its own fix by three minutes.**
`tmp/r18/vista_noon.jpg` was written at 04:33 and `04aacc9` — the commit that
warped the runnel projection off its three fixed world azimuths — landed at
04:36. **Re-shoot both before re-judging them.** That does not exonerate the
warp: the plaid is still visible at HEAD.

**Attribution, by a sixteen-token ablation sweep on `vista_noon`'s peak face
(`tmp/lane-pp/sheet-albedo.png`, one contact sheet, read once).** The plaid
survives `nodry`, `nogully`, `nomacroh`, `nomeso`, `nostoch` and every post
stage (`nogtao`, `nocontact`, `notaa`, `nocas`, `nobloom`, `nodof`, `nomb`,
`nograin`) unchanged. It collapses under `gwhite`, so it is in the ground
albedo. Of the albedo tokens **only `norunnel` visibly cleans the face**.

**Fixed (`5e806be`): a third domain warp at 85 m.** The two existing warps are
at 230 m and 620 m — a gentle fan across a kilometre of range and *nothing at
all* across the 150–250 m of one peak face, which is the only scale a judged
frame shows. 26 m of amplitude at 85 m is a cycle and a half of swing on the
19 m rake family within one face. **Verified by eye**, `tmp/lane-pp/sheet-warp.png`
(base / norunnel / this at 3x): the rakes curve and break instead of combing the
whole face at one pitch. It is a clear improvement and it is **not** a complete
fix — the face is still more streaked than `norunnel`.

**A negative instrument, recorded so nobody rebuilds it.** An FFT of the crop
band-limited to 10–40 px returns 36.0 px at 37° and 36.6 px at 114° for *every*
build and *every* ablation alike, including ones that visibly remove the
pattern — because those are the lowest frequencies the band admits and a
broadband rock face puts its most power in the lowest bin available. **It was
measuring its own cutoff**, and it nearly bought a false attribution (I had
already written its numbers into a comment before catching it). Grade this by
eye on a 3x crop.

**Still open, and a different defect.** `vista_fog`'s peak carries a *second*
lattice — finer, regular, rectilinear — which survives this change and which
shows faintly on `vista_noon` under `gwhite` too. Surviving `gwhite` means it is
in the geometry or the normals, not the albedo. The `bedRelief` docblock at
`TerrainMaterial.ts:~970` describes an earlier lattice of exactly that family
and its `bedReliefFade` fix, so that fade at long range is the first place to
look. Not attempted here.

## C — rock scatter by slope. **LANDED.**

The judge's "no boulder or scrub scatter breaking the silhouette" is a slope
test. `_probe/rockslope.mts` (new) censuses the live field by slope band and
prints every group's near/far occupancy against its cap, flagged `CAPPED` —
because `emit` drops silently once a cap fills, which is the trap this change
could have fallen into. At HEAD on `vista_noon`, **before**:

| slope | n | mean scale | farthest |
|---|---|---|---|
| 0.00–0.20 | 2099 | 0.75 | 695 m |
| 0.46–0.60 | 102 | 0.35 | 589 m |
| 0.70–1.01 | 40 | 0.20 | 572 m |

Total 2695 live, farthest 695 m — so **nothing is out of range**; the massif was
getting a twentieth of the stone at a quarter of the size. Far-tier occupancy
granite 300/760, bedded 448/800, slab 351/620, so there is cap headroom.

Two changes, both right in kind and wrong in degree before:
`emit`'s `(1 - steep * 0.62)` now applies 0.62 only to the small kinds (a pebble
scatter on a 40° face genuinely does wash out, and the small kinds fill the near
field where a wrong seat shows) and **0.25 to the BIG kinds**, which are the
landmarks a silhouette needs. `_genOutcrop`'s `smoothstep(slope01, 0.58, 0.80)`
— half gone by a 30° slope, entirely gone by 39° — becomes **(0.72, 0.92)**.
`_genTor`'s 0.30 ban is deliberately untouched: a 20 m stack on a 30° face has
metres of seat error.

Free in draw calls: `Rocks.build` makes eight `InstancedMesh`es and streaming
only bumps `mesh.count`.

**Verified by census and by eye.** After (`0d8e70b`, same shot, same probe):

| slope | n | mean scale before → after |
|---|---|---|
| 0.20–0.33 | 268 | 0.55 → **0.57** |
| 0.33–0.46 | 141 | 0.49 → **0.56** |
| 0.46–0.60 | 102 | 0.35 → **0.48** (+37 %) |
| 0.60–0.70 | 45 | 0.31 → **0.48** (+55 %) |
| 0.70–1.01 | 40 | 0.20 → **0.23** |

No group is `CAPPED` (granite 308/760, bedded 455/800, slab 355/620), and drawn
counts rose only 318→326 / 462→469 / 364→368. **`tmp/lane-pp/rocks/vista_noon.jpg`
by eye**: the flank speckle is denser and coarser in the 300–700 m band and
there are no floaters. Draw calls 435, unchanged from the pre-change capture.

**Honest limit: this did not reach the sky-line itself.** The instance COUNT per
band is identical before and after (2099/268/141/102/45/40), so the outcrop
taper widening added nothing on this shot — the > 0.70 band is populated almost
entirely by small kinds, which keep the 0.62 taper by design. What changed is
the size of stone on the 25–35° flanks, not the presence of stone on the
near-vertical crest. If the judge's tell persists on the crest specifically, the
next lever is the population that is allowed up there at all
(`_genOutcrop`'s `q`, and `BIG`'s membership), not the taper.

## Residue for `project/TASKS.md`

- `RoadFurniture._markers` and `_culverts` have the same shape of bug A had: a
  1.9 m chevron post, a distance plate and a concrete culvert headwall are all
  built into the `flat` decal builder, so they carry `renderOrder = 1` and cast
  no shadow. Moving them is now nearly free — the `mergeShadow` proxy absorbs
  them into the existing one caster — but it is a separate concern and was not
  photographed as a judged defect, so it is filed rather than done.
- `src/world/town/Hammerhead.ts` still carries its own copy of `shadowProxy`
  (noted in `PartBuilder.ts`); another lane's file.

## Commits

- `56ddb24` the tyre: material, size, and litter into the casting builder;
  `_probe/blackprop.mts`, `_probe/tyrelight.mts`
- `1a49ac5` litter minimum separation; `_probe/pickat.mts`
- `cd96f47` `mergeShadow` proxy for the roadkit; `blackprop` clustering corrected
- `10b1032` this handoff, and the corrected draw numbers in the code comment
- `5e806be` the 85 m runnel warp, the ablation attribution, the negative FFT
- `0d8e70b` the rock slope taper and `_probe/rockslope.mts`
