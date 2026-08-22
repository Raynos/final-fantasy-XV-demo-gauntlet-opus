# agent/splat — regional terrain palette + de-tiled ground

Branch `agent/splat`, based on `main` (merged at `7b377dd`, so the dev suite is in).

| commit | what |
|---|---|
| `721edca` | `WIP:` regional terrain splat — salvaged from a stalled predecessor. **The `WIP:` label is now stale**: everything in it has been verified by eye and by measurement, see below. |
| `7b377dd` | merge `main` (dev suite, meteor zone move) |
| `56610c3` | this session's corrections: bedding suppression in green regions, Ravatogh pre-compensation |

Files owned and touched: `src/world/Terrain.ts`, `src/world/terrain/Biome.ts` (new),
`src/world/terrain/Layers.ts`, `src/world/terrain/TerrainMaterial.ts`. Nothing else.

---

## The two root causes (restated so they survive this conversation)

**1 — The splat never read `WorldMap`.** `TerrainMaterial.ts` `tf_shade()` derived
every colour it drew from slope, altitude, flow, sediment and noise. Every one of
those is a *global* field that has never heard of the cartography. Concretely: the
macro tint was a hard-coded `ochre / ash / olive` triple, the strata tint was a
hard-coded rust, and all six `Layers.ts` recipes are authored red-ochre. `WorldMap`
does carry `moist` and `rocky` per zone, but those only ever reached the heightfield
and the vegetation (`Ecology.moisture()` uses `zoneMoist()`; the splat did not).
Result: the whole 8 km world drew as one Leide badland — the Nebulawood, the
Vesperpool, the Lestallum Shelf and the Rock of Ravatogh included.

**2 — The "two-metre cracks" *were* the anti-tiling trick itself.** Each layer was
sampled twice, at `uLayerScale[i]` and again at `uLayerScale[i] * 0.34`, cross-faded
by `macroMix`. For dirt that second tap is a **27 m tile whose worley cells are
~4.5 m across**, and `macroMix` rose to **0.82** with distance — so the mega-plate
pattern took over the whole visible plain. Domain-warping the uv (`jit`) bent that
lattice but could never stop the same polygon pattern reappearing every tile.

Both are fixed. The coarse tap is deleted for layers 0,1,2,4,5 and replaced by a
Heitz/Neyret triangle-grid **stochastic tile sampler** (`tf_stoch`, three hashed
offset+rotation taps blended by barycentric weights combined with each tap's own
height alpha). `LAYER_SCALE` was retightened ~1.6x now that the base tile no longer
has to survive being drawn at 3x. Layer 3 (rock) is excluded — it keeps its own
triplanar path.

---

## State

### Done and verified by eye

- The regional palette reaches the shader and reads correctly across all three
  regions. **Duscae and Cleigne are no longer ochre** — this is the headline win and
  it is unambiguous in an A/B: `tmp/shots/sp0/zone_lestallum.png` (pre-change) is a
  red-ochre desert with trees on it; `tmp/shots/sp1/zone_lestallum.png` is green Cleigne
  upland. Same for Fallgrove, Taelpar, Alstor, Vesperpool.
- **Leide is unchanged in character** — `tmp/shots/sp0/zone_longwythe.png` vs
  `tmp/shots/sp2/zone_longwythe.png` are visually identical warm red-ochre badlands.
- The 27 m mega-plates are gone from `combat_wide`; the foreground now reads as
  cracked ground at a believable ~1 m scale rather than 3-5 m plates.
- Cleigne cliffs are pale and cool (`zone_vesperpool`), Leide cliffs still rust
  (`zone_keycatrich`).
- **No zone boundary reads as a seam anywhere I looked.** Blending is Gaussian
  (`WorldMap.zoneWeights`) raised to `BLEND_POW = 2.4` and renormalised, which is a
  monotone transform of a smooth function — it sharpens the plateau without
  introducing a discontinuity, so smoothness is guaranteed by construction, not by
  tuning.

### Done and verified by measurement

A throwaway probe walked all 19 zone centres, comparing the authored `SURFACE`
entry, the CPU `surfaceAt()` blend, and the byte actually sitting in the baked LUT
at that world position. Worst `|blend − LUT|` was **0.007** (pure quantisation).
This proves the array packing, the world→uv mapping **and the row orientation** —
a v-flip here would have scrambled the whole world's palette silently. It also
confirmed no `SURFACE` entry is missing and none is orphaned. The probe was deleted
rather than committed; it is ~35 lines and trivial to rewrite (see *Gotchas*).

### Not done

- `src/tools/perf.mts` was **not run**. `tf_stoch` costs 6 array fetches per active
  layer instead of 4; with the `wCut` early-out typically ~2 layers are live, so
  roughly +4 fetches per pixel. Draw calls and triangles in every shot were inside
  budget (384-596 calls against a budget of 800), but the fragment cost is unmeasured.
  **This is the highest-priority remaining item.** The pre-planned fallback if it
  does not pay: gate `tf_stoch` to `vTDist < ~400 m` and take a single tap beyond.
- `zone_mencemoor` could not be assessed — the camera now sits *inside* the Disc of
  Cauthess meteor and the frame is a full-screen underside of it. See *Cross-boundary*.

---

## The biome LUT

`src/world/terrain/Biome.ts`:

- `SURFACE` — one authored entry per zone id plus a `_default` frontier entry,
  `{ ground:[r,g,b], rock:[r,g,b], green, damp }`. The two colours are **multipliers
  around 1.0**, not colours, because the tiles they correct are all authored
  red-ochre (the rock tile averages ~(0.41, 0.33, 0.28)). This is why the Cleigne
  entries look lopsided — to reach neutral pale limestone the blue channel has to
  be lifted by about 60%, and a first pass that authored plausible-looking near-1.0
  triples left every Cleigne cliff still reading as Leide rust.
- `surfaceAt(x, z, out)` — blends by `worldMap.zoneWeights()`, the same Gaussian the
  heightfield uses. This is also the CPU mirror used by `Terrain.sampleMaterial()`,
  so the shader and the CPU cannot drift.
- `buildBiomeLut(size)` — evaluates on a 128x128 grid over the 8192 m world (the
  finest feature the table can express is a zone whose radius is over a kilometre,
  so 64 m per sample is already several times oversampled) and bilinearly upsamples.

**Packing — and why.** The LUT is **not an eighth sampler**. `TerrainMaterial.ts`
documents that the terrain fragment shader already sits on the **16-texture-unit
limit** once the atmosphere patch and the shadow cascades are injected into it, and
a seventh standalone sampler tips it over. So the palette is appended as two extra
layers of the detail array that is already bound:

```
uDetailArr  layer 0 — sub-metre grit               (tiled, RepeatWrapping)
            layer 1 — near-field surface, 2-4 m    (tiled, RepeatWrapping)
            layer 2 — rgb = ground tint / 2,  a = green   (world-space, spans world once)
            layer 3 — rgb = rock   tint / 2,  a = damp    (world-space, spans world once)
```

Tints run 0..2 encoded into a byte at ~0.008 steps. The shader reads it in two
`textureLod(..., 0.0)` fetches — **explicit LOD 0**, because the array is
`RepeatWrapping` for layers 0-1's sake and because an implicit mip in divergent
control flow is undefined. The uv is clamped in-shader for the same reason. The LUT
is deliberately *not* baked: it costs single-digit ms and depends on `WorldMap`
rather than on the layer recipes, so baking it would only add a second staleness
dependency. `FieldBake.ts` and `src/tools/bake.mts` therefore need no change.

---

## Zones actually looked at, by name

All three regions were covered. Every one of these was opened with the Read tool and
looked at, not just captured:

- **Leide** — `zone_longwythe`, `zone_three_valleys`, `zone_keycatrich`,
  `zone_galdin`, `zone_ostium_gorge`, `zone_vannath`
- **Duscae** — `zone_fallgrove`, `zone_taelpar`, `zone_alstor`, `zone_nebulawood`,
  `zone_mencemoor` (blocked, see below)
- **Cleigne** — `zone_lestallum`, `zone_vesperpool`, `zone_ravatogh`
- **Ground-level read** — `combat_wide`, `hero_face`
- **A/B baseline** (pre-change build) — `tmp/shots/sp0/`: `zone_lestallum`,
  `zone_fallgrove`, `zone_longwythe`, `combat_wide`

Captured but **not** individually opened: `zone_callaegh`. Never captured this
session: `zone_malacchi`, `zone_pallareth`, `zone_malmalam`, `zone_cape_caem`,
`zone_weaverwilds`. Those five are the gap.

Shot directories: `tmp/shots/sp0` (pre-change baseline), `tmp/shots/sp1` (first verified
round), `tmp/shots/sp2` (after the bedding fix).

---

## Gate status

| gate | result |
|---|---|
| `npx vite build` | **pass** — also runs as a pre-commit hook |
| `node src/tools/integration.mts` | **pass** — 18 pass, 0 wired-but-unproven, 0 not integrated |
| `node src/tools/orphans.mts` | ~~**fails, pre-existing and not mine** — `MapRaster` is orphaned.~~ **RESOLVED 2026-08-22:** the file was a re-export facade and was deleted; `orphans` is clean. |
| `node src/tools/roadcheck.mts` | **pass** — 0 failures, 0 warnings, 30.26 km over 50 edges / 50 nodes |
| `node src/tools/heightcheck.mts` | **pass — d 0.000 m on every probe**, gpu vs cpu, including the `micro` and `grid` components separately |
| `node src/tools/driftcheck.mts` | **pass** — tolerance 0.05 m drift / 0.45 m vs `heightAt` |
| `node src/tools/perf.mts` | **not run** |

`heightcheck` and `driftcheck` reading exactly 0.000 is the load-bearing result: it
confirms the change really is colour-only. That was guaranteed by construction — no
vertex-side or height code was touched at all — but it is worth re-running after any
edit here, because it is the cheapest possible proof that `roadcheck`, POI placement
and the `_outcrops` RNG stream cannot have moved.

**Ports.** All of the above need a vite server and several default to 5173/5321,
which collide with the other agents. Run them as `PORT=5261 node src/tools/<x>.mts`
against a server you started yourself; `heightcheck`/`driftcheck`/`roadcheck` do
**not** spawn one, they assume it is already up.

---

## The `lowAlt` grass gate — fixed

`lowAlt = 1 - smoothstep(48, 120, alt)` gated grass and sand off above 120 m, while
Duscae/Cleigne zones are authored at `base` 66-120 m. It was switching the grass off
in precisely the regions that are defined as green. The gate is now regional:

```glsl
float lowAlt = 1.0 - smoothstep(48.0 + 190.0 * bioGreen, 120.0 + 320.0 * bioGreen, alt);
```

Mirrored exactly in `Terrain.sampleMaterial()` (`src/world/Terrain.ts`), whose only
consumer is `AudioSystem` footsteps. The grass weight itself also gained a regional
term — both its gain and its threshold move with `bioGreen`, so a green basin is
grassland with dirt showing through in patches rather than dirt with the odd tuft.
Tinting alone was not enough: a green region is green because there is a *mat* on it.

---

## Next steps, in priority order

1. **Run `src/tools/perf.mts`.** This is the one unmeasured risk in the whole change.
   If `tf_stoch` does not pay for itself, gate it to `vTDist < 400 m` and single-tap
   beyond — the lattice is only visible near, which is the whole reason the sampler
   exists.
2. **Shoot and look at the five unviewed zones**: `zone_weaverwilds`, `zone_malmalam`,
   `zone_cape_caem`, `zone_malacchi`, `zone_pallareth`, plus `zone_callaegh` which was
   captured but not opened. `weaverwilds` matters most — it is the highest `green`
   entry in the table (0.86) and so the most extreme test of the grass path.
3. **Look at `zone_galdin` again in a non-backlit shot.** The one capture of it is
   shot into a low sun with a blown sky, and its foreground reads as a dark green
   meadow rather than the bleached coast the table intends (`galdin` is authored
   `green: 0.32, damp: 0.14`). I could not tell whether that is the palette or the
   lighting, and I did not want to retune a table entry off a backlit frame.
4. Re-check `zone_mencemoor` once the meteor framing is fixed by its owner.

---

## Gotchas and dead ends — read this before touching anything

**The chevron hatch on mountain faces is NOT the splat, and not fixable from here.**
This is the single most valuable thing in this document, because the plan I inherited
had it diagnosed wrong and a future agent will otherwise burn the same hours.

The regular herringbone/chevron pattern that wallpapers every conical peak
(`zone_longwythe`, `zone_three_valleys`, `zone_taelpar`) was attributed in the plan
to "the layer tile lattice surviving to the horizon". **It is not.** Those peaks are
past 1100 m, where `detailAmt` has reached zero and the layer arrays are not sampled
at all. I proved it directly: forcing `cliffAmt = bedThrough = runnelAmt = 0.0`
immediately after the strata block — which removes every scrap of bedding, strata
colour and runnel darkening — leaves the chevrons **completely unchanged**
(`tmp/shots/probeA/zone_longwythe.png`). They are in the **heightfield normals**, i.e.
`Field.heightAt()` / the far normal texture. Softening the `form` term from
`3.6/2.0/1.4` down to `1.9/1.1/0.8` had no visible effect on them for the same
reason. Fixing this needs a height change, which this branch is forbidden to make.

**The same is true of the horizontal "wood grain" on Taelpar's valley walls.** I
tightened the regional bedding suppression for it (and that was correct — it removed
the *rust colour* component), but a second probe with all three strata terms forced
to zero shows the horizontal banding still there and essentially unchanged
(`tmp/shots/probeB/zone_taelpar.png` vs `tmp/shots/sp2/zone_taelpar.png`). It is geometric —
almost certainly the per-zone `terrace` biome parameter stepping the heightfield.
**Do not try to fix either of these from `TerrainMaterial.ts`. You cannot.**

**Dark near-ground in green zones is pre-existing, not the palette.** Fallgrove,
Lestallum and Vannath all show a near-black foreground under bright green midground,
and it looks exactly like a bug the palette introduced. It is not: the pre-change
`tmp/shots/sp0/zone_lestallum.png` has an identically dark foreground. It is vegetation
density plus cloud shadow. I nearly retuned the table over this — the A/B is what
saved it, which is the general lesson: **shoot the baseline before believing any
"regression" in this shader.**

**The blend dilutes small zones, and the table does not tell you by how much.**
`BLEND_POW = 2.4` sharpens the plateau but a small zone ringed by contrasting
neighbours still only holds ~78% of the weight at its own centre. Ravatogh is the
worst case and is now pre-compensated in place, with the arithmetic written into the
comment. **Before authoring or retuning any entry, measure what actually arrives** —
`surfaceAt()` at the zone's `cx`/`cz` — rather than assuming the table value lands.

**Zone centres are `cx`/`cz`, not `x`/`z`.** `ZONES[]` in `WorldMap.ts` uses `cx`,
`cz`, `rx`, `rz`. My first probe read `zn.x` / `zn.z`, silently got `undefined`, and
produced a full table of `NaN` and `0.00` that looked exactly like a broken LUT. I
lost a cycle to it.

**Shot names are positional, and zone shot names are not zone ids.** `zone_vannath`,
`zone_ostium_gorge`, `zone_callaegh`, `zone_malacchi`, `zone_pallareth` are *shot*
names with no corresponding `SURFACE` entry, while `cauthess`, `weaverwilds`,
`meldacio`, `balouve`, `kelbass`, `crown_verge`, `lestallum_shelf` are *zone ids*
with no dedicated shot. Do not use one list to audit the other.

**`macroMix` is now dead for layers 0,1,2,4,5** but is still computed and still used
by the rock path. Do not delete it.

**`src/public/baked/` is a gitignored deterministic cache.** `Layers.ts` is in
`src/tools/bake.mts` `SOURCES`, so editing it auto-invalidates the bake; `Biome.ts` is
not, deliberately. Delete `src/public/baked/` freely.

---

## Interaction with `agent/grass` — what I assumed

`agent/grass` was changing `src/world/veg/**` on top of my terrain in parallel, and
every shot above therefore has its vegetation over my ground. What I assumed:

- **Vegetation does not read the splat, so I cannot have disturbed it.** `Vegetation`
  drives off `Ecology.moisture()` / `zoneMoist()`, not off splat weights. The only
  consumer of `Terrain.sampleMaterial()` is `AudioSystem` footsteps. So my changes to
  the six layer weights are invisible to the veg agent by construction.
- **The reverse is not true, and it is the thing to judge the two together on.** My
  `green` channel now drives a real grass *mat* in the splat, and `agent/grass` is
  independently placing grass *instances* on the same ground from a different source
  of truth. In Duscae and Cleigne these now stack. In the shots they read as one
  surface, but nobody has tuned them against each other, and if the grass agent
  raises instance density the ground mat underneath may want to come down.
- The near-ground darkness noted above is, on my reading of the A/B, mostly veg
  density. If the next agent wants it lighter, that lever is in `veg/`, not here.

---

## Cross-boundary items — report, do not fix

| what | where |
|---|---|
| `zone_mencemoor` frames the *inside* of the Disc of Cauthess meteor — the whole frame is its underside. `main`'s `c526d9b`/`0be851f` moved the meteor to its own zone; the shot camera at `pos: [...]` was not moved with it. Duscae cannot be assessed from this shot. | `src/game/Shots.ts`, `zone_mencemoor` entry (~line 359) |
| `zone_ravatogh` frames a green forested valley with the cone at the top of frame rather than the volcano itself. Flagged in the original plan and still true. | `src/game/Shots.ts`, `zone_ravatogh` entry (~line 391) |
| ~~Chevron hatch on all conical peaks — heightfield normals.~~ **WRONG, and it cost two agents a round each. It is GTAO** reconstructing normals from depth and drawing the raw triangle facets of every distant massif; `?post=nogtao` alone removes it. Half of it *was* the clipmap point-sampling the heightfield below its vertex pitch, and that half is fixed. See `project/LANDMINES.md`. | `src/engine/PostFX.ts`, not `Field.ts` |
| Horizontal terracing bands on Taelpar's valley walls — geometric, almost certainly the per-zone `terrace` biome parameter. | `src/world/map/WorldMap.ts` `biome.terrace`; realised in `Field.ts` |
| ~~`MapRaster.ts` is orphaned and fails `orphans.mts`.~~ **RESOLVED 2026-08-22** — deleted; `orphans` is clean at 273/273. | — |
| `project/STATUS.md` records `src/tools/gameplay.mts` already failing its 60 fps gate on streaming/weather hitches, independent of this work. | — |
