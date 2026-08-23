# Procedural modeling — buildings, rocks, props

Contract: `docs/plans/2026-08-21-fable-procedural-modeling.md` (sections 2.1, 3.1–3.3,
5.1–5.2, 5.5). Worktree `agent-a47fcd949a77cc8d7`, `PORT=5430` (daemon 5431), which
was free — `lsof -nP -iTCP:5430 -sTCP:LISTEN` before the first capture, per the
previous agent's hour lost to photographing someone else's tree.

**The worktree started 131 commits behind `main`** and had no `node_modules` and no
`src/public/`. `git merge --ff-only main`, `npm install`, `mkdir -p src/public` and
*then* the `baked` symlink. Check `git rev-list --count HEAD..main` before anything
else — nothing warns you.

## The headline

Six things, in the order the last handoff prioritised them, plus the two the blind
A/B judge found. Cost for all of it, measured by checking `src/world/{town,props}`
out at `main` and capturing the same nine shots:

```
                     tris before        after         calls
town_wide            7,372,904    7,379,396 (+0.09%)  567 -> 567
town_forecourt       9,646,056    9,678,264 (+0.33%)  917 -> 917
town_diner           9,790,730    9,822,570 (+0.33%)  848 -> 848
town_garage         10,342,953   10,374,905 (+0.31%)  917 -> 917
town_shops           9,700,458    9,729,854 (+0.30%)  902 -> 902
poi_reststop         9,689,157    9,720,933 (+0.33%)  910 -> 910
zone_mencemoor       6,505,576    6,508,388 (+0.04%)  357 -> 357
landmark_insomnia    6,495,046    6,499,814 (+0.07%)  342 -> 343
vista_noon           7,617,633    7,621,025 (+0.04%)  472 -> 472
```

**+0.33% worst case and exactly one extra draw call in the whole corpus** — Insomnia's
`cityLit`. `npm run check`: **11/11**.

Shots: `tmp/shots/COST-BASE/` vs `tmp/shots/COST-AFTER/` are the pairs above.
`tmp/shots/base/` is the original before-state (whole corpus, ten shots).

## What is done and verified

### The defect that ran through everything: texel density

The fuel canopy's soffit read as blue-green **water caustics**. It was not shading and
it was not the light: it was `panelMaterial`'s 256-pixel paint-chip tile stretched
across a 16.4 × 11.2 m box by that box's 0..1 face UVs. The same stretch marbled the
diner's fascia into wood grain, and the same texture *squeezed* onto a 30 cm chair leg
is the "speckle at gravel scale on furniture" the last handoff recorded. One cause,
three symptoms, in three different write-ups.

- **`TownKit.texelPlace`** wraps a `PlaceFn` and re-UVs every piece to the constant
  world texel density its material wants, from `TEXEL`, a table keyed on the material's
  `name`. Boxes get a true per-face planar projection off the vertex normal; cylinders
  and tori keep their own parameterisation and are only scaled, with U over the
  *circumference*. Cached per (geometry, density) pair.
- **`PartBuilder.texelBox`** is the same construction for prop kits that build one-off
  boxes. `Outposts` containers and `Megastructures` towers use it.
- **Excluded on purpose**: `town_corr` (its grime is a `(1 - v)` run-down streak that
  must span one sheet exactly once), signs, chain-link. `uvScale` marks its output
  exempt through an `authored` `WeakSet`.

Fixing density then exposed what the stretch had hidden. `panelMaterial`'s relief was
`fbm2(u * 26)` at `normalScale` 0.55 — white noise at a fifth of a tile, which is
*grain*, and painted sheet steel has none — at `metalness` 0.55, so every bump mirrored
the sky. The canopy and diner trim came back **reading as lava rock**. Paint is a
dielectric: metal near zero, sheen into roughness, relief becomes oil-canning.

### Hammerhead (`src/world/town/`)

- **Every arris is chamfered.** `TownKit.box` builds through `BuildKit.box`, which
  section-gates itself so 45 mm battens stay sharp.
- **The canopy soffit is coffered** — 4 × 2 bays of downstand beams with the light
  panels recessed *up into* the coffer, so the beams are what is nearest the eye.
  Plus a drip lip under the fascia.
- **`TownKit.fuelPump`** replaces a cream box with a red cap: cast skirt, corner posts,
  red shoulder band, valance, and a recessed bezel with lit readout and keypad on
  **both** faces. Hose/boots/nozzle in the clutter pass.
- Columns get a splayed base, an impact collar at bumper height, and a capital.

### The two the judge found

- **The "untextured white sphere on the ridge" in `vista_noon`** is
  `Outposts._mesaOutpost`'s comms dish, aimed correctly at the sky — so the only side a
  ground camera sees is its convex back, and that back was one bare spherical cap.
  `Outposts._dish` puts hub, eight ribs, rim ring, yoke and counterweight on the back
  and a feed horn on the front, and makes the reflector **galvanised, not cream** —
  which matters more than the geometry, because at a kilometre it is thirty pixels and
  what decides the read is its *value* against the rock.
- **Insomnia was forty-four extruded boxes.** The atmosphere lane already disproved the
  judge's "takes no aerial perspective" claim (79% hazed, converging). The tell was the
  geometry. `Megastructures._tower` gives every tower a podium, two setbacks with a
  cornice each, and one of four crowns; 58 towers in three depth bands so the skyline
  overlaps itself. Lit stock moved off `windows` (a bare `glowMaterial`, flat and
  untextured by day) onto `cityLit`.

### The Meteor of the Disc

It kept coming out a dome because it was built by `shard`, which is a **sedimentary**
recipe — one bedding plane, two conjugate shear sets, eleven strata. Bedding gives a
mass a top and a bottom and joint sets give it a grain; both pull the outline back
toward a loaf however many attendant masses you park beside it.

`meteorMass` is the other recipe: `joints` off, `upright` 0.05, 16 planes at `bite`
0.74, `bedding` 0. Five masses within a factor of two of each other (the old 330 / 190
/ 160 is *why* one rounded outline owned the silhouette), spread far enough apart to
leave real clefts, with `CLEFT` recording the mouths so the fissure glow sits in them.

### Seating

The last four systems now go through `Seat.ts`: `Landmarks` (8), `RoadFurniture` (13),
`Outposts` (8), `Megastructures` (3). Road furniture wants both bounds as predicted —
`seatY` for posts, guardrail, markers, culverts, litter; `coverY` for grit, gravel and
the culvert scatter stones. `seatcheck` PASS, model residual p99 0.000 m.

## Traps this lane hit

Six of these cost a capture round, and all of them fail quietly.

- **`BuildKit.box` writes object-space UVs, not 0..1 per face.** So `uvScale`'s multiply
  is meaningless on one, and swapping `TownKit.box` over to it turned a 4.5-repeat
  garage wall into a 4.5-metres-per-texel wall and **mipped the corrugation clean away
  to flat cream**. It read as a *simplification*, not as a bug. `sbox` is the sharp box
  with plain face UVs and is what every `uvScale` site builds from now.
- **`seatY` over a ring of probes minimises a minimum.** `seatHeightAt` already widens
  its envelope across `size`, so `Outposts._base`'s `Math.min` over eight of them
  doubled the drop and put the entire mesa compound *inside* the ridge — dish,
  containers, truck and fence gone, only the mast poking out.
- **A cull distance for `Seat` is the range at which the object's BASE is read against
  the ground, not the range at which the object is visible.** `seatY` returns the lower
  envelope of every ring that could draw the point, and by the 24 m ring that is tens
  of metres down. Seating a haven at 1200 m to protect a silhouette nobody can resolve
  sinks it at the range a player camps on it. 300 m outposts / 400 m landmarks /
  1200 m megastructures.
- **`rockGeometry` normalises to a *bounding* radius.** A 2.4:1 pre-`stretch` means the
  two short axes only reach 40% of `size`, so cuts taken at a fraction of `size` never
  touch them while the long axis is cut right down. One Meteor mass came back a literal
  **sail** standing over the crater. Cap anisotropy near 1.5:1.
- **Twelve random cut planes leave half a sphere untouched**; twenty at `bite` 0.60
  compound the volume loss until nothing is left. Sixteen at 0.74 with `size` scaled up
  to pay for it is where it holds.
- **Raising `warp` to break up big flat faces makes it worse.** At 1.5 km `warp`'s
  frequency is below what the eye resolves, so all it does is soften the arrises.
  `gully` is the knob that works at that range.
- **A material's texbake key contains its roughness and metalness.** Changing either
  invalidates the cache silently — boot falls back to runtime generation. `node
  src/tools/texbake.mts --force` after any material edit.
- **`src/public/baked` is a symlink into the shared main checkout**, so `texbake
  --force` rewrites the *shared* cache from this worktree's sources. Harmless once this
  branch merges; until then another worktree's cold boot regenerates the town and mega
  materials. Worth knowing before blaming a boot-time regression on your own lane.

## What is still short, in priority order

1. **`_imperial`, `_tomb`, `_landmark`, `_dungeon`, `_chocobo`, `_menace`, `_haven`
   still build from bare `BoxGeometry`.** `_block` and `_hut` are the templates. The
   tomb is the one that "most has to read from a kilometre away" by its own docstring.
   Untouched this round.
2. **Grass grows through the town plaza and the outpost pads.** The POI kits publish
   `_exclusions`; something downstream is not reading them at pad radius. Still
   undiagnosed — **ablate before theorising**, and note that the last two "obvious"
   diagnoses in this lane were both wrong.
3. **The 124 POI aprons are still cake stands.** Plan §5.4 unstarted.
4. **The Meteor is right in kind but soft in detail.** The masses are cleaved and the
   clefts are real, but the faces are large and smooth and read as low-poly crystal
   rather than shattered stone at 1.5 km. Honest grade below.
5. **Hammerhead's asphalt pad** reads as a hard-edged black polygon against bright
   ground, most visible in `town_night`. Not touched — it is the last authored `uvScale`
   on `padGeo` and probably wants the density pass plus a soft edge.
6. **The corrugated sheet's exposed *edge*** (the canopy roof's 10 cm side, seen
   near-horizontal from under the canopy) aliases into a blue-white dashed band. It is
   the only place `town_corr` still reads badly.
7. **`RoadFurniture` writes `RoadSample.y` and nothing reads it.** `_buildChunk` fills
   it lazily and the docstring explains why; grep finds no consumer. Either a consumer
   was removed or it never had one. Dead, but not removed this round — verify before
   deleting.
8. **`driftcheck`'s "coarse-LOD spread worst −2.928 m" is back to its pre-`Seat`
   value**, and the previous handoff credited `Seat` with taking it to −1.18 m. That
   metric measures the *drawn terrain surface* against the analytic field across rings
   and is labelled "reported, not gated" — prop placement cannot move it. Treat the
   −1.18 m claim as a lead to re-measure, not a regression to chase. This is exactly
   the `LANDMINES` pattern: a real number with an inference attached that was never
   itself tested.

## Honest grades against shipped FFXV

**Hammerhead: 6.5/10.** It was 5. The canopy now reads as a built canopy — coffered
ceiling with its own shadow pattern, a fascia with a drip lip, columns with bases and
collars — and the pumps read as pumps from both approaches. Painted steel finally
reads as painted steel rather than as wet rock. What still separates it from the real
Hammerhead is *dressing density and wear placement*: FFXV's forecourt has oil stains
that follow the pump islands, tyre marks that follow the entry curve, tools and cans
against the walls where someone put them down, and cabling and conduit on every
surface. Ours has correct materials at correct scale on clean geometry. It is a good
model of a fuel stop, not a photograph of one.

**The Meteor: 5/10.** It was 3. It is no longer a dome and no longer a single mass:
it is a cluster of cleaved wedges with 30–50 m clefts and light in the cracks, which
is the right *kind* of object at last. Against the real thing it is still too smooth —
FFXV's Meteor has cliff-scale relief across every face, dust and scree banked at every
base, and a crater lip that explains it. Ours has clean planar faces and a rim of
ejecta. The next move is not another parameter sweep on `meteorMass`; it is relief at
the frequency the eye resolves at 1.5 km, which means either much stronger `gully` or
a second scatter of 20–60 m sub-masses welded onto the big faces.

**Insomnia: 6/10.** It was 2 — a comb of rectangles. It now has silhouette grammar and
depth. It is short of shipped FFXV mainly in density and in the Citadel: the real
skyline is far denser, with slender spires and a single tower that dwarfs everything,
and ours has a Citadel loft that no corpus shot currently frames.

## Files touched

`src/world/town/{TownKit,TownMaterials,Hammerhead}.ts`,
`src/world/props/{PartBuilder,Outposts,Megastructures,Landmarks,RoadFurniture}.ts`.
Six commits, one concern each, from `9440ff5` to `b741c87`.
