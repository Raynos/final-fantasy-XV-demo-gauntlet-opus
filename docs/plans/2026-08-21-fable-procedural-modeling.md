# Procedural modeling port plan — how the siblings build shapes

Status: PROPOSED (2026-08-21, fable). No game code is changed by this file.
Author: Fable 5 audit pass, against commit `86303de`. Companion to
`docs/plans/2026-08-21-fable-sibling-ports.md` (which covers rendering, perf,
gameplay and tooling); this one covers **mesh and shape construction only** —
terrain landforms, rocks, buildings, towns, trees, grass, water, characters,
props, and the placement logic that composes them into scenes.
Sources: dedicated geometry audits of `final-fantasy-XV-demo-opus`,
`metal-gear-solid-5-opus-demo`, and `final-fantasy-XV-demo-ogl-opus` (all under
`/Users/raynos/projects/game-demos/gauntlet-demos/`), plus a full inventory of
this repo's own generators (`src/world/**`, `src/characters/**`,
`src/combat/GeoKit.js`).

---

## 0. The one-paragraph version

Our generators are competitive at the system level — the terrain authoring
model (19 zone fields + 48 landform stamps + real droplet erosion) and the
fracture-plane rocks are as good as anything in the siblings — but the
siblings spent their rounds on exactly the **finishing layers we lack**: what
happens after the cut (chamfer, weathering, strata that step the silhouette),
what happens after the scatter (seat verification against the drawn surface,
talus aprons that ground cliff bases), and what happens after the grow
(LOD-as-re-skin, silhouette benches, area-conserving crown LOD). They also
solved, with measured evidence, the three things our own handoffs name as our
worst geometry: the hero head in profile, quill hair, and the 13
primitive-stack enemy species. The plan below is organized by domain, each
item tied to a named weakness in our inventory, with the one meta-lesson that
recurs in every sibling's history stated up front: **enforce guarantees on
the finished, placed mesh, not on the recipe** — aspect floors, seating,
burial, winding and orientation were all defeated downstream until they were
re-checked on what actually ships.

## 1. Baseline — our four toolkits and where they're weak

We build with four coexisting kits: `MeshBuilder` (`src/characters/rig/Geo.js`,
heroes), `CBuilder`/Sculpt (`src/characters/rig/Sculpt.js`, 6 rebuilt enemies),
`GeoKit` (`src/combat/GeoKit.js`, weapons + ~15 legacy enemies), and
`PartBuilder` (`src/world/props/PartBuilder.js`, props/town/Regalia). Terrain
is `WorldMap.js` zone fields + `Field.js` stamps + 620k-droplet erosion + a
7-level clipmap; rocks are 8 fracture-plane base meshes; trees are a recursive
random-walk grower with frontal-bake impostors; Hammerhead is a box kit with
one bespoke terrain-skirt berm; dungeons are a no-CSG loft/patch kit.

The inventory's top weaknesses (each with handoff provenance): profile head
collapse (`Face.js` — brush sums, no nasion/mandible), quill hair
(`Geo.js ribbon()`), zero facial animation, single-view tree impostors with
hard-coded normals + trees carrying the grass albedo bug (`Trees.js:289/331`),
~13 enemy species as primitive stacks, no rivers/overhangs, an 8-mesh rock
variety ceiling, box-primitive tells within ~10 m of every structure,
single-LOD kits, plumb vegetation on slopes, and RNG-coupled outcrops.

## 2. Placement, seating, and scatter — the scene-composition layer

The cheapest quality-per-line in the whole audit lives here.

- **2.1 Seat on the drawn surface, verify on the finished matrix** (MGS5
  `Terrain.js:2193-2265`, `Scatter.js:594-877`). `seatHeightAt` = min over
  the lattice heights of every clipmap ring that could draw this point (from
  the renderer's own level-selection rule — an object-size rule was the
  floating-rock bug); then `proudOf` pushes the variant's support points
  through the *final* instance matrix and measures float above the drawn
  ground — sink up to 0.55×height or reject. Add a 6-probe least-squares
  seat plane (a knife edge passes a normal test). This supersedes the brief
  `seatHeightAt` mention in the companion plan with the full contract; it
  kills our floating-pickup / apron-3.2 m class outright. *~200 lines +
  exposing the clipmap's level rule. Difficulty: medium.*
- **2.2 Talus aprons by cone dilation** (MGS5 `TalusApron.js`).
  `apron(p) = max_q(ground(q) − tan(repose)·|p−q|)` — a grey-scale dilation
  seeded only from the bottoms of >40° faces, bounded by rise above local
  low ground, mottled, soft-floored. One self-contained grid solve that
  grounds every mesa cliff and canyon wall base we have; our mesas currently
  have analytic concave aprons in the heightfield but nothing at rock-mesh
  scale. The file documents the two wrong constructions (in-place chamfer
  escaping its reach and burying 63% of the map; fall-line plates
  cantilevering). *Difficulty: low-medium.*
- **2.3 Matérn cluster scattering, statistically verified** (OGL
  `gen/place.ts`, `scatter.ts`). Parents dart-thrown with min spacing and
  **suitability applied to parents** (thinning children shreds groves back
  to Poisson); Poisson-count children Gaussian around each parent; species
  chosen per cluster (72% grove coherence); radius-aware separation
  (`(r1+r2)·slack`) for rocks; scree at cluster edges via `fromParent`.
  Verified with Clark–Evans R and nearest-neighbour histograms, not by eye
  (their measured move: R 0.890 → 0.531). Our jittered-grid rejection
  sampling is exactly the "statistically almost uniform" pattern they
  measured and replaced. Apply to trees, bushes, rock clusters.
  *Difficulty: low-medium — a new sampler behind `Ecology`/`TileStream`.*
- **2.4 Erosion outputs as the placement API** (MGS5 `surfaceAt`
  {rock, scree, flow, accum, deposit}; FFXV-opus's identical conclusion).
  We already record `flow`/`sed` grids in `Field.js` — but only the splat
  reads them. Publish them through `Terrain` and key scatter on them: stone
  bars on raw accumulation (not the blurred mask — measured to zero out),
  boulder trains walking steepest descent, debris fining downstream, reeds
  on wetness. This is the "the world reads composed" lever: material,
  plants and props agreeing about where water went. *Difficulty: medium —
  the fields exist; the work is consumers.*
- **2.5 Placement hygiene trio** (OGL + FFXV-opus, all trivial):
  **seed avalanching** (`mixSeed`) before any xorshift-family RNG — OGL's
  seeds 101/202/303 produced 0.0002/0.0004/0.0007, making every "variant" a
  near-clone silently (audit our `Rng.js`/hash paths for the same disease,
  and it bears directly on our RNG-coupled `_outcrops` open item);
  **decorrelated hash draws per decision** (position/gate/yaw/scale/tint
  each from its own salt — reusing one biases exactly the property it also
  selects; we mostly do this, audit for exceptions); **hash-shuffled
  truncation** when a budget caps a scatter (scan-order truncation packs
  everything into one corner).
- **2.6 Sink far instances by LOD mesh error** (OGL): far trees planted on
  the analytic height float above the coarse far mesh — sink them
  proportionally to distance ("a floating tree at the skyline is much
  louder than a slightly buried one"). Check our far tree-stand cards and
  megastructure bases against the coarse clipmap rings.

## 3. Rocks — the post-fracture finishing stack

Our `rockGeometry()` fracture is sound; the siblings' wins are all in what
happens *after* the cut, and in cut orientation. All bolt onto
`src/world/props/Rocks.js`:

- **3.1 Conjugate joint sets** (OGL `rock.ts`): draw cut planes from a
  geologic frame — one bedding normal (near-horizontal, slightly tilted) +
  two conjugate shear sets at ~55° off it — with **dominant cuts applied
  last and deepest so they own the silhouette**, and isotropic cuts demoted
  to corner chamfers. Our `upright` bias is a scalar approximation of this;
  the three-modal-direction version is why their blocks read as geology.
- **3.2 Edge chamfer + convexity-weighted weathering** (MGS5
  `RockGeometry.js`): a 2–4% chamfer band on every arris ("catches a bright
  sliver of sun exactly the way a worn edge does — the difference between
  low-poly asset and rock"), then a Laplacian weighted by convexity × upness
  (`upBias 0.55`, strength ~0.24 — 0.45 eats the facets) so exposed tops
  blunt while cleave faces stay planar. Our cut-only pipeline goes straight
  from arris to render.
- **3.3 Strata that step the silhouette** (OGL `stratifiedSlab` + MGS5
  `beddingLedges`): at each bedding plane emit **two coincident-Y rings at
  different radii plus a flat ledge quad strip** — a real horizontal step in
  the outline. "The shader can paint strata all day and it reads as a
  decal; what sells sedimentary rock is that the silhouette steps." Our
  sawtooth radial scale bends the surface but never emits the ledge face.
- **3.4 Corestone stacking + shared fabric** (both): split the block along
  sheeting joints into 3–4 corestones, settle each into the one below
  (measured: one corestone silhouette-scores 3.90, stacked read 6.1–8.3 —
  block count IS the silhouette, fbm is not); scree chips share one
  orientation "fabric" (all yaws within ±0.6 of a family angle, `√rand`
  disc placement, outward shrink); MGS5's outcrops mandate ~30% vertical
  course overlap ("edge to edge reads as a pile of plates"). Our tors are
  aligned lines of blocks — add the overlap + fabric rules.
- **3.5 Guarantees on the finished hull**: aspect floor enforced on the
  *finished, weathered, placed* hull with the same factor at every LOD (a
  critic found their 25 m × 2 m plate; local caps were "routed around by
  tilt — 40 instances measured"); **bake the sink into the mesh** (OGL
  `ROCK_SINK` 12% of footprint diameter — no instance transform can then
  produce a clean ground line; ours sinks via instance transform, which is
  exactly the defeatable version).
- **3.6 `aRock`-style bakes** (MGS5): cavity = curvature measured on a
  **smoothed copy** of the positions (measuring the shipped mesh saturates
  on grain noise — their "splotch camouflage" bug), AO = diffusion of that
  renormalized against its own p90, plus near-free plane-depth occlusion
  (one dot per cleave plane). We bake dust/cavity vertex color already —
  the smoothed-copy trick and per-channel split are the upgrades.
- **3.7 Variety ceiling**: our 8 base meshes worldwide is the named
  weakness; 3.1–3.4 multiply silhouettes without new base meshes (archetype
  *families*, not harder randomization of one generator — MGS5's stated
  thesis), and per-cluster parameter jitter is cheap once cuts are cheap.

## 4. Terrain landforms

Our stamp/erosion pipeline is strong; targeted upgrades:

- **4.1 Strata with per-bed resistance feeding thermal erosion** (MGS5
  `_addStrata`): quantize altitude into 18–45 m beds against a tilted AND
  folded bedding datum (a planar datum makes bed traces topographic
  contours — their vista's FFT literally peaked at the contour frequency);
  bench/riser remap per bed; per-bed hardness returned as the **per-cell
  talus angle**, so a following thermal pass carves cliff + bench + apron
  from one construction; run *after* erosion (before, erosion eats the
  terraces). This directly replaces our blunt `round(wall·5)/5` canyon
  terracing and the terracing-band artifact on Taelpar's walls, and our
  altitude-dependent-repose `_talus` is already halfway there. Publish a
  `bedRef` channel so the splat paints beds exactly where geometry cut
  them. *Difficulty: medium — ~60 lines of pass + control-channel wiring.*
- **4.2 Drainage incision from the flow field** (MGS5 `_inciseDrainage`):
  cut channels from D8/MFD accumulation in three widening bands off one
  field (tributaries merge exactly where drainage merges), with a **hard
  slope gate** (incising flats turns tie artifacts into ploughed-field
  chevrons — measured). We have droplet `flow` but never cut geometry from
  it — this is the missing step toward SCOPE's rivers, and feeds 6.2's
  river mesh. *Difficulty: medium.*
- **4.3 Strike-frame anisotropy** (MGS5): sample ridged noise ~2.8:1
  stretched along a regional strike rotation, plus a conjugate set at ~62°,
  and give foothills an **independent** amplitude field (tying it to the
  massif field made foothills a scaled copy of the range). Our per-massif
  rotation/elongation is per-point; a shared regional strike is what makes
  ranges *run*. Also steal: angle-budgeted far horizons (OGL — far
  amplitude ∝ radius so every ridge subtends a constant angle, validated by
  a ray-escape test in Node) for our pure-noise far field.
- **4.4 Compositing and sampling rules** (OGL, cheap): **softplus
  smooth-max** for imposing landforms (Math.max leaves a derivative crease
  the mesh renders as a line; lerp-to-crest digs a ring ditch — our stamps
  mostly impose via max); ring/rim relief from noise sampled **on the unit
  circle** (kills atan2 branch cuts and periodicity); central-difference
  normal eps ≈ half the local mesh spacing (finer eps gives vertices
  normals the triangles can't draw — relevant to our far field). And the
  twice-learned MGS5 Nyquist rule: **no displacement octave below ~3 cells
  of the lattice it lands on** — sub-scale relief goes in normal-map tiles.
  Our `microDetail` (6–25 m wavelengths) evaluated on 96 m coarse rings is
  a live instance of this bug (flagged in our own inventory).

## 5. Buildings, town, dungeons

The MGS5 outpost kit is the direct answer to our "box-primitive tells within
10 m" weakness. All of it is engine-agnostic mesh discipline:

- **5.1 `wallRun` + auto-chamfered `box`** (`outpost/geo.js`): walls of real
  thickness split into pier/sill/lintel boxes around sorted openings — every
  doorway gets a true reveal and its shadow, no CSG; the workhorse box is
  auto-chamfered (26-facet, size-gated: no chamfer below 75 mm section;
  ~46 mm cap) with chamfer facets *marked in an attribute* so shading can
  treat arrises differently ("a 45° normal on a box edge and a cylinder are
  indistinguishable — geometry must mark what shading can't recover").
  Retrofit into `TownKit`/`PoiKits`/dungeon `Build.js`. *Difficulty: low —
  drop-in module; biggest visual lift per line for the town.*
- **5.2 Human-scale + architectural-detail constants**: storeys 3.2 m,
  doors 2.1×1.1, cills ~1.05 m, parapet coping + 50 mm drip lip ("bright
  line over dark line over wall — all three needed"), plinths with buried
  footings so no wall runs straight into the ground ("get the human scale
  wrong by 20% and the compound reads as a toy no matter the shading").
  Audit Hammerhead and every POI kit against these numbers.
- **5.3 Soft goods** (`props.js`): `membraneSag` — cloth/camo-net as Jacobi
  relaxation of a pinned grid, solved twice (unloaded + loaded) and
  rescaled so max deflection is exactly the requested sag (produces the
  cusp-and-swag rhythm no cos() product can); tarps as the **upper envelope
  (max) of box lumps** → real ridge lines; superellipse sandbags with
  settlement stacking (load-accumulated course dip, alternating bond, 7%
  rogue bags). Havens, outposts, Hammerhead clutter and the caravan all
  want these. *Difficulty: low per prop.*
- **5.4 Wear as distance-field textures + engineered pads** (`wear.js`,
  `ground.js`): paths/ruts rasterized to a 0.5 m/texel texture storing
  distance fields (linear ramps survive bilinear reconstruction; masks
  don't — their 1.5 m path on a 1.7 m lattice peaked at 0.31 of authored
  value as vertex data), desire lines walked between named destinations;
  the settlement pad as a **cut-and-fill platform that measures its own
  fill** (skirt 1:3, truckable ramp 1:9 written back into the road
  corridor, spoil berms riding the pad isoline, SDF wobble because "a
  perfectly offset rounded rectangle of earthwork is the tell"). Our
  Hammerhead berm strip is the seed of this; the pad/wear model finishes
  it and generalizes to all 124 POI aprons — including the admitted
  "cake stand" problem. *Difficulty: medium.*
- **5.5 Attribute-carrying merges** (`prep()`): normalize every input to a
  KEEP list, synthesize missing attributes, bake object-level variation
  stamps (`aVar`) **before** merging — their merged geometry silently read
  `aVar=(0,0,0)` for four rounds because the attribute existed only on
  instances. Our `PartBuilder` strips vertex colors and zeroes UVs — same
  disease, pre-documented fix. Also our own `stripAttrs` note (mixed
  indexed/non-indexed merge returns null silently) belongs in the shared
  module.

## 6. Water and shorelines

We have no shore geometry and no rivers; both siblings solved one each:

- **6.1 Shoreline contour ribbon** (FFXV-opus `water/shore.ts` — their
  best geometry, per their own audit): marching squares over the *eroded*
  heightfield at water level → chain segments → arc-length resample →
  **bisection re-snap onto the exact waterline** (smoothing alone walks
  the line inland) → rows placed by **elevation targets** (+0.60/−1.45 m
  first-crossing, not metres — a berm is non-monotone), 21 rows biased
  toward the line (a sweep showed rows buy everything, columns nothing).
  `aShore = (arclength, row, offset)` so swash travels in arc length.
  Plus the winding lesson: per-triangle settlement against the vertex's
  own terrain normal, and a `downFacing` stat hard-errored at nonzero
  ("nothing in the pipeline can tell you a triangle was wound backwards").
  Feeds our lakes/sea basins directly. *Difficulty: low-medium (~700
  lines, inputs: height fn + water level).*
- **6.2 Channel-fitted river strip** (OGL `water.ts`): per-row bisection
  of the heightfield for the two waterlines + bank tops, fixed lane
  budgets across water/bank (their constant-width slab "spent most of its
  lanes on ground metres above the water"); bank lanes as a **lifted
  terrain decal** (bed + 6 cm — a flat sheet was depth-clipped to 43% of
  the wet band); `uv.y` = signed bed depth in metres, `uv.x` = edge alpha.
  Waves: **one GLSL string shared by vertex and fragment** so
  displacement, normal, Jacobian and RMS slope come from one sum
  (disagreement "slides the shading off the geometry"); displace only
  waves with ≥6 vertex samples per wavelength; detuned wavelengths + a
  30 m fbm group envelope (clean series beat into a stationary diamond
  lattice; no envelope = corduroy); foam derived from Froude number ×
  reach alternation × Jacobian crests gated on shoaling — never stamped.
  Pairs with 4.2's incised channels; this is SCOPE's rivers item with the
  design already paid for. *Difficulty: medium-high.*

## 7. Trees, grass, vegetation

- **7.1 Strand skeleton + LOD-as-re-skin** (FFXV-opus `veg/skeleton.ts`):
  radius is never stored per segment — one analytic taper law evaluated on
  demand, so LOD1 is a **re-skin of the same skeleton at lower ring count**
  and lands on the identical surface by construction (measured 4082→2442
  tris, indistinguishable; decimators optimize triangles against a mesh,
  not an outline). A data-model transplant for `TreeBuilder.js`.
- **7.2 Junction and root treatment** (FFXV-opus `skin.ts`, OGL): parent
  radius inflated over ±1.4× child radius biased to the child's azimuth,
  child's first ring re-planed onto the axis bisector ("without this a
  fork is two intersecting pipes"); root flare with **compact-support
  cubic** falloff (exponential never reaches zero — "elephant foot") and
  constant multi-lobe buttress ridges; trunk stations foot-biased
  (`t^1.8`) so vertices exist where silhouette and contact need them;
  side count follows **radius, not depth** (a 6-gon twig is wasted budget
  — MGS5 agrees: 6/4/3).
- **7.3 Growth habits as spec deltas** (OGL `HABITS`): per-species habit
  variants that only add deltas/multipliers — `snapped` (bole truncated +
  6-triangle splinter top: variety by *deleting* the expensive half),
  `veteran` (one-sided crown via `1 + a·cos(roll − dir)` — free),
  `umbrella` — selected by **stratified tier, not RNG** (3 random draws
  miss a habit 44% of the time). Their measured result: conifer band went
  from 2 to 6 distinct silhouettes at −5.5% triangles. Directly attacks
  our species-sameness at zero budget.
- **7.4 Area-conserving crown LOD + volume normals** (OGL `crownLod`,
  both repos' card systems): when LOD thins limbs, scale card size by
  √(area ratio) and go 2→3 cards at 60° (2 crossed cards collapse to an X
  edge-on — their far pine read as "three green discs on a stick" at
  20.8% crown fill, fixed to 48.4%); card shading normals blended ~0.72
  toward the crown-outward radial ("the single cheapest thing that stops
  card foliage reading as flat slabs" — both repos converged on ~0.7).
  Check whether our leaf cards and impostor swap do either.
- **7.5 Tree debt already on our books**: the albedo-pin fix
  (`normalizeAlbedo`) that grass got and trees never did
  (`Trees.js:289/331` — verified live), per-tile immutable instancing
  (grass's fix, not adopted by trees/bushes), slope alignment (we plant
  everything plumb; OGL leans 22% toward the normal with wind-combed yaw),
  and multi-view impostors (our frontal bakes are wrong from above; the
  FFXV-opus octahedral baker + orientation assert exists, gated, never
  wired even there — port the baker *with its assert*).
- **7.6 Grass deltas** (FFXV-opus + OGL — ours is already good): the
  **tilted thatch quad** per clump (their single highest-leverage
  triangle: nadir bare ground 67.6%→16.9%); root-spread post-pass
  (push blade roots outward ×1.8 — converts intra-clump overdraw into
  coverage for zero triangles); every fade must **shorten as well as
  thin** (a thin-only fade leaves a traceable line of full-height tufts);
  bare-ground legibility is component size, not fraction (22% bare as
  2,913 slivers reads as 0% — redistribute into fewer ≥2 m² openings).

## 8. Characters and creatures

Every sibling lost blind tests on actors; two of them then built real
answers. Ours are the named worst frames, so this is where imported
technique meets highest need — but port tooling before anatomy.

- **8.1 Geodesic auto-skinning** (OGL `skinbind.ts` — portable wholesale,
  engine-free): per-bone Dijkstra over the mesh edge graph seeded by
  perpendicular distance (Euclidean leaks across the crotch/chin; the
  geodesic goes up over the hip), `reach` multipliers, allowed-mask-
  constrained Laplacian smoothing (unconstrained smoothing walks an ankle
  bone up the shin one ring per round), exponent-based twist
  redistribution (kills candy-wrapper without twist bones), and top-4 u8
  quantisation with the residual pushed onto the largest weight so bytes
  sum to exactly 255. Upgrade path for `RigBuilder`'s attach heuristics
  and the enemy debt tier. MGS5's alternative (segment distance + per-part
  candidate bone masks + **voxel-grid AO bake**, 14 directions — "without
  this, procedural characters read as inflatable") is simpler and also
  worth taking; the voxel AO complements our baked `occlude()`.
- **8.2 The head: two proven architectures for our worst frame**. Our
  profile collapse comes from sculpting a sphere with fixed-direction
  brushes. FFXV-opus: **SDF-composed head** (an eye socket is a
  subtraction a union of ellipsoids cannot express) polygonised by
  marching cubes with Newton projection — plus the *headsheet* Node
  raymarcher with `--without <op>` ablation, and the finding that the
  discriminating statistic is the **width-vs-height profile** (a head and
  a slab agree on height, max width and volume). OGL: **Catmull–Clark
  cage** (~876 quads) with features sculpted into the cage and verified
  on the *limit* surface (a control offset survives ~50% per level — 9 mm
  eye sockets subdivided away to nothing), boundary-arithmetic limb
  joins, and a stencil-table engine where UVs/weights/AO subdivide by the
  same affine tables. Either fixes the class; the SDF route is smaller
  and self-contained, the cage route also solves bodies/hands. Decide at
  implementation time; **port the measurement tooling first** (headsheet
  ablation + width-profile bench) — both repos' anatomy took multiple
  corrective rounds and the tooling is what made them converge.
  *Difficulty: high either way.*
- **8.3 Hair as grooming, not quills** (FFXV-opus `hair.ts` + OGL hair
  cards): cards grown from 6–10 Bezier guides authored in **skull-radius
  units** (grooms rescale per character), each card bending as an
  inverse-square blend of its two nearest guides; hairline and tail
  length as `a + b·cos(longitude)` (high at brow, low at nape in one
  expression); roots evenly slotted then jittered ≤0.55 slot ("an even
  fan is a comb, fully random leaves bald patches"); card cross-section
  slightly round so the specular is a band, not a plate; tips taper over
  the last third ("a lock ends in a point"); mean-preserving edge/root
  darkening (their first build lost the luminance *variance* — "the only
  thing separating hair from a hat at distance"). Our diagnosed-but-
  never-built fix, fully designed. *Difficulty: medium-high.*
- **8.4 Cheap body upgrades**: Fourier cross-section modulation
  (FFXV-opus `sections.ts` — muscle/ribcage as `r(θ)` cosine terms for
  zero extra vertices; directly fixes our faceted forearms with a shape
  term instead of more segments); garment offsets along the **geometric**
  normal, not the shading normal (measured 28° apart at taper changes);
  MGS5's `zone`/`ang`/`rim` vertex channels (material id, angle around
  section, metres-to-cut-edge) making seams and stitched borders shader-
  addressable; metric UVs; and their collar lesson — head–neck junctions
  want **layered cut-edge geometry** (three value steps), not shading.
  Plus the FFXV-opus assembly discipline trio (`mesh/{shells,buildOrder}.ts`,
  `geom/weld.ts`): a **weld with a policy** (same shell+slot → weld at
  0.2 mm with 68° creases; same shell, different slot → average normals
  without merging; hardware never welds), garments derived from the body
  surface (`garment = body + gn·thickness`) instead of hand-copied radius
  tables, and a **build-order state machine** (weld → relax → bakes →
  colors → tangents, enforced by throwing) — every post-weld step writes
  one value per vertex, and running any early produces a faint quad-grid
  seam artefact diagnosed nowhere near its cause.
- **8.5 Creature finishing** (OGL beasts — for the 13-species debt tier):
  fur as fins whose plane is spanned by outward-radial × body-axis (the
  silhouette fins face the camera), ~3:1 aspect, tip albedo at half the
  hide's; head furniture placed **on the surface** via `onEllipsoid`
  (their eye was measured 81% inside the skull — "no facial detail"
  complaints can be placement arithmetic); pattern frequency bounded by
  vertex spacing (past Nyquist a pattern aliases, not blurs); pack
  variation from avalanched seeds. And the universal pre-check from both
  repos: **compute the on-screen pixel size of a feature before modeling
  it** — their portrait-grade noses survived as an 18×6 px smear.
- **8.6 Detail-dial LOD** (MGS5 `setDetail` + `lod.js`): ring counts
  scale with a detail dial (stations by √detail) so the low mesh keeps
  shapes/parts/materials and binds the same skeleton — the swap is a
  pointer write; tiered update-rate/IK/shadow/skeleton gating scheduler
  ports regardless (their measured point: 40 guards' cost is geometry,
  not animation). Our heroes and rebuilt enemies have no mesh LOD at all.

## 9. Method — geometry checks worth adopting wholesale

The recurring failure across all three repos: every scalar metric read
clean while zero correct pixels shipped. The named antidotes, all cheap:

1. **Orientation/winding asserts**: `assertCardOrientation` (O(1),
   transpose/flip-sensitive — the bug survived four rounds because area is
   transpose-invariant), `downFacing` recomputed on the final index buffer,
   tangent-handedness re-derivation. Wire into impostor bakes and any
   ribbon/shore-style strip.
2. **Silhouette benches in bare Node** (OGL): rasterize each mesh at 8
   azimuths, width profile in 24 bands **normalized by the mesh's own
   height** (so scale variation scores zero), RMS distance with thresholds
   *calibrated* against a known-same and known-different pair; companion
   crown bench (% fill, % empty crown height). Runs without a browser;
   this is how tree/creature variety becomes measurable. Our
   `creaturecheck` gates grounding — this gates *shape*.
3. **Paired, gameable-aware gates** (FFXV-opus): perimeter P/√A alone is
   passed by fringe-on-a-solid; interior-sky alone by card clouds; a drum
   stack passed both and needed cross-azimuth course correlation. Every
   check declares what it is **blind to**.
4. **A wiring gate**: "built-but-unwired is this pipeline's chronic
   disease" (FFXV-opus — shrubs, LODs, cliffs and card materials all
   passed gates while nothing called them; we shipped 5,765 lines of
   unwired RPG once). After landing any generator: prove the caller.
5. **Undeclared attributes read as zero, silently** (their black
   megaliths = a UV-less mesh on a UV material building NaN tangents):
   assert the material↔mesh attribute contract at build time.
6. **Ablation before re-modeling**: `--hide <mesh>` per-mesh ablation
   overturned eight confident geometry diagnoses in MGS5 alone (their
   "rock plates" were a bush); OGL's checkerboard-positive-control rule
   before "fixing" any tiling read.

## 10. Anti-ports — audited and rejected

- **MGS5's GPU-hashed grass placement** — elegant, but our per-tile
  immutable `InstancedMesh` streaming already won this trade for us and
  carries trample/wind state theirs can't.
- **OGL's Weber-Penn conifers wholesale** — our grower differs but works;
  take the habit layer (7.3), junction/flare math (7.2), and benches
  (9.2) rather than replacing the grower.
- **FFXV-opus's cliff band sweeps** — built and never shipped even there
  (consumed only by its self-test); take the lesson (real undercuts need
  swept bands, heightfields can't overhang) only if a dungeon-mouth or
  gorge-wall task actually demands it.
- **MGS5's `Obstacles`-style top-down bakes and outpost layout grammar**
  — compound-scale assumptions; Hammerhead is already laid out. Take
  `wallRun`/soft-goods/wear (5.1–5.4), not the layout.
- **A wholesale character-pipeline rebuild** — 8.2's own history says the
  anatomy took multiple corrective rounds *with* tooling; port benches
  first, rebuild the head second, and leave working bodies alone.

## 11. Sequencing

Wave 1 (cheap, defect-tied, independent): 2.1 seat contract, 2.5 RNG
hygiene, 3.2 chamfer+weathering, 5.1 wallRun+chamfered box, 7.5 tree debt
(albedo pin, slope lean), 9.x asserts. Wave 2 (composition): 2.2 talus,
2.3 Matérn, 2.4 erosion-API, 4.1 strata, 5.4 wear+pads, 6.1 shoreline.
Wave 3 (bigger builds, tooling-first): 8.1 skinning, 8.2 head (bench
first), 8.3 hair, 6.2 rivers (+4.2), 7.1–7.4 tree overhaul, 8.6 LOD.
Each item should land with its check from §9 in the same commit.

## 12. Landmines

- Sibling sources are TypeScript; translate, don't copy — GLSL moves
  verbatim. Read the cited file before implementing; this summary is not
  the spec.
- `mergeGeometries` returns **null silently** on mixed indexed/non-indexed
  input (our own Debris found this too) — the 5.5 `prep()` pattern is the
  systemic fix.
- Fracture `cut()` projects without retriangulating in both our and OGL's
  rocks — facet fidelity is bounded by base-mesh detail; deep bites starve
  facets. Chamfering (3.2) raises the demand on this; budget detail 2.
- Our `_outcrops` RNG coupling (coordinator open item) must be fixed
  *before* 2.3/2.5 land, or every placement change reshuffles the world.
- Anything touching `Field.js` invalidates the terrain bake — bump
  `BAKE_VERSION`, re-run `bake.mjs`, and expect every shot to shift;
  batch 4.x changes rather than trickling them.
- The seat contract (2.1) needs the clipmap's real level-selection rule —
  derive it from `Clipmap.js`, don't approximate from object size (that
  approximation was the original MGS5 bug).

## 13. Definition of done

- [ ] Each landed item cites its source file and ships with its §9 check.
- [ ] Wave 1 verified by capture on the shots that showed the defect
      (floating props, town close-ups, tree LOD swaps).
- [ ] A silhouette bench exists in `src/tools/` and gates at least trees
      and the rebuilt enemy species.
- [ ] `seatHeightAt`+`proudOf` runs in `integration.mjs` or a new check —
      zero floating instances across the POI corpus.
- [ ] The head/hair rebuild (if taken) is judged by the width-profile
      bench and a blind A/B, not by eye alone.
- [ ] Measured negatives are recorded here or in handoffs — the siblings'
      rejected constructions were half the value of their logs.
