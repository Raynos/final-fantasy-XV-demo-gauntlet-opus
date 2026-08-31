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
| B | checkerboard on rock faces | **diagnosis in progress** — see below |
| C | rock scatter by slope (`Rocks.ts`) | not started |

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

## B — the checkerboard

`tmp/round18/pair-39.jpg` panel A, cropped to `tmp/lane-pp/p39-peak.png` and
`p39-low.png`. It is **not** a repeating-texture checkerboard: it is a regular
rectilinear **plaid lattice of thin lines** — graph paper — on the smooth,
steep, sunlit blue-grey faces of the peak, cells roughly 40 px at that framing.
It does not appear on the shallow or shadowed faces. Next step: `framecheck.mts`
on the pair-39 framing (it reads the default framebuffer *and* `rtScene`, so it
separates "a texture failed" from "a material is wrong"), then an ablation of the
rock detail/normal layer before touching any tiling constant.

## C — rock scatter by slope (from another lane, not started)

`src/world/props/Rocks.ts:2498` `size *= (1 - steep * 0.62)` → ~0.25 on a steep
face, plus `:2198`'s taper to `(0.72, 0.92)`. Slope `<0.2` gets 1191 rocks at
mean 4.09 m; slope `>0.70` gets **9 rocks at 2.15 m** — so the silhouette read
against sky is where the rocks are rarest and smallest. Free in draw calls:
`Rocks.build` makes 8 `InstancedMesh`es and tiling only bumps `count`. Two
caveats that lane already paid for: `emit` **silently drops past a cap**, so
check you are getting what you ask for; and **leave `_genTor`'s 0.30 ban alone**.
Numbers in `project/TASKS.md`.

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
