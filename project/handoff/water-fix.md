# water-fix — the cold-boot shader error, and WS-13's water and map items

Owns `src/world/water/`, `src/world/Water.ts`, `src/world/map/`, `src/game/fishing/`,
and `src/world/props/PoiKits.ts` for the jetty item only.
Contract: `docs/plans/2026-08-26-opus-the-standing-backlog.md` §WS-13.
Source: `project/archive/handoff/water-content.md` — my predecessor, who carries the numbers.

---

## P0, FIXED AND ON `main` — every lane can take cold captures again

`8f728d4`. **`hero_full --cold` exits 0.** Three lanes were waiting on this.

Every cold boot at `main` raised

```
THREE.WebGLProgram: Shader Error 0 - VALIDATE_STATUS false
```

so every `--cold` capture exited non-zero and failed `BRIEF.md` hard rule 5.
`sky-clouds` bisected it to `b237dc6`, the river-bank commit. The cause is one
line of that commit, in `RiverMaterial.ts`'s fragment shader:

```glsl
vec3  body = (bed * Tr + uScatter * (1.0 - Tr)) * downwelling;   // line 167
...
float body = smoothstep(0.02, 0.55, depth);                      // line 223
```

Same scope, same name.

```
ERROR: 0:335: 'body' : redefinition
ERROR: 0:336: 'max' : no matching overloaded function found
```

The fragment shader never compiled, so `riverWater`'s program never linked, so
**the river water surface has not been drawn at all since `b237dc6`**. The pale
strip left in every river frame was the bank decal alone. The alpha floor's ramp
is `bodyRamp` now.

### Why it was invisible warm, which is why it shipped

A program is compiled **once per page**. The daemon clears a slot's error list
per run, so a link failure is charged to whichever run happened to cold-boot
that page, and every later run on that page reports clean. The pre-commit hook
builds; it does not link GLSL. **Nothing but `--cold` can see this class of
fault** — which also means: after any shader edit, take one cold capture.

### The message that would have named it was being truncated

`shoot.mts` printed `e.split('\n')[0]` of each page error. For a shader failure
that is the one useless line — `Shader Error 0 - VALIDATE_STATUS false` — while
the `Material Name:` and `ERROR: 0:335:` that follow it were captured and thrown
away. That truncation turned a one-line typo into a bisect. It now prints the
first line plus every `ERROR:` / `WARNING:` / `Material …` / `Program Info Log:`
line after it, capped at eight. Same commit.

### How to recover the diagnosis next time

In a probe: set `renderer.debug.onShaderError`, set `material.needsUpdate = true`
on the suspect material, render once. Three re-links it and hands you the shader
info logs. To find *which* material, walk `renderer.info.programs` and read
`LINK_STATUS` per entry — **`material.program` is undefined in three 0.185**,
which is why `probes/samplercount.mts` returned an empty list here and looked
like the page had no materials.

`tmp/water/linkfail.mts` (link status for all 271 programs) and
`tmp/water/relink.mts` (the re-link + `onShaderError` capture) are both left in
place.

### Two measured negatives from that hunt, worth not re-opening

- **The sampler budget is not this bug.** 16 of 16 fragment texture units and 32
  combined are in use and the page does warn about it, but the failure is a
  *compile* error in one file.
- **`VALIDATE_STATUS false` on a linked program means nothing here.** ~120 of
  the 271 programs report it, all with the same log — *"Two textures of
  different types use the same sampler location"* — which is what
  `gl.validateProgram` says about any program inspected outside a draw call.
  Only `LINK_STATUS === false` is a real failure.

---

## WS-13 item 1 — the world map draws no blue under the four tarns: FIXED

`e67eef8`. `rasterChart` decided a pixel was water with `h < WORLD.seaLevel` and
nothing else — **the same one-global-level predicate for the third time**, after
`Water.ts` (seven of ten pins were a jetty on dry rock) and `Fishing._survey`
(four tarns called dry with water six metres from the pin, `2b344e7`).

So it is not copied a fourth time. The arithmetic is now
**`src/world/water/Tarns.ts`**, which takes its ground height as a *function*,
so the same code runs against the live `Terrain` in the game and against the
baked elevation grid inside the chart bake — which runs under Node in
`texbake.mts` with no `Terrain` and no DOM. `Water._findTarns` is six lines that
bind it.

Measured, chart 2048²: **50–63% of each of the four bodies' own footprints reads
as water where it read 0.** Looked at, at 5× (`tmp/shots/chart-tarn4/crop0.png`
Swainsmere, `crop1.png` Crestholm Reservoir): a turquoise pond, darker over its
own deep, with the coastline hairline the existing pass draws for free.

Two things the frame caught that the numbers did not:

- **The depth ramp has to be the body's own** (`level - floor`), not the sea's
  26 m — otherwise a 3 m tarn is one flat shoal-turquoise disc with no basin in it.
- **Take the tarn's surface only where the pixel is under it, not merely inside
  its box.** Letting the sandy strand ramp against a tarn's waterline put every
  pond inside a **pale grey rectangle**: the box is the water's bounding rect
  plus 8 m, a tarn basin is dished, most of that margin is 1–3 m above the level,
  so the strand filled the box to its corners and stopped dead at them.
  Narrowing the strand band from 22 m to 3 m shrank the rectangle and did not
  remove it — only dropping the land case does. See `tmp/shots/chart-tarn2/` and
  `chart-tarn3/` for the two rejected versions.

`Tarns.ts` is in **both** `TEX_SOURCES` and `GEO_SOURCES`: it is a chart
generator now and has always been a shore-ribbon generator (`water/shore` is
baked geometry that is a pure function of the terrain and `Water.bodies`).

**Bake consequence, for whoever picks this up:** that `GEO_SOURCES` change makes
`pruneStaleGeoBake` drop the geometry cache on the next server start. Restore it
with `node src/tools/texbake.mts --geo`. The tex cache re-bakes itself.

---

## WS-13 item 3 — the rivers: LOOKED AT, and the verdict is the predecessor's

`tmp/water/riv2.mts` at `main`, with the water surface actually drawing for the
first time since `b237dc6` (`tmp/shots/w-riv-fixed/`):

- **p50 (4.10 m wide) reads as a damp grey-brown stain on a pasture.** Not a
  river. The grass texture runs straight under it unbroken, there is no incision,
  no bank line, no shadow, and almost no sky in it. The verdict my predecessor
  recorded stands, and it now stands on a frame that has the water in it.
- **max (29.9 m) reads as a pond with a hard polygonal rim** — the p99 hard edge,
  clearly visible as a straight cut across still-submerged ground.
- **p90's camera is inside the hillside.** `riv2.mts`'s `up`/`back` framing does
  not clear the terrain at that station; that shot is not evidence of anything.

So: the width raise is landed and it is still **not** what makes a river read as
a river. The lever is the *channel* — a reach on a flat pan has no banks to have
water between — and conditioning the heightfield is a `Field.ts` job, which is
what `water.md` §5 already said.

---

## Open, in the order I would take them

1. **The p99 hard edge** — `emitWater` in `River.ts`, ~15 lines: ramp the
   outermost lane down to the local ground wherever the discharge cap bound, so
   the sheet closes onto the terrain instead of ending in a wall. Needs a fold
   re-check (`riverStats.folded`). This is the one river defect that is fixable
   inside this lane.
2. **`PoiKits._fishing` builds a jetty at `caem_shore` and `rachsia_bridge`** —
   dry ground, in the 3D world. The map is honest; the geometry is not.
3. **Energy deposits invisible**, and **Fociaugh's cave mouth on a 1.26 bank** —
   WS-7 leftovers.
4. **Fix `riv2.mts`'s p90 framing** before anyone quotes a p90 river shot.

## Not mine, stated so nobody re-opens it

**Galdin Quay.** 698 of 6 280 shore points have a run-out gentler than 4 m; it
needs a `Field.ts` sand shelf and an `Ecology` grass suppression. Terrain lane.

## A process note

`0560b83` (the `geometry-bake` lane) swept my in-flight `src/world/Water.ts`
edit into its own commit. Nothing was lost — the change is correct and on `main`
— but that commit's tree imports `./water/Tarns.ts`, which did not exist yet in
it, so `0560b83` does not build. Its pre-commit passed because the hook builds
the *working tree*, not the commit. This is the shared-index hazard `CLAUDE.md`
warns about, seen from the other side.

## Files

`src/world/water/{Tarns,River,RiverMaterial}.ts` · `src/world/Water.ts` ·
`src/world/map/Chart.ts` · `src/tools/{texbake,shoot}.mts`.

Probes in `tmp/water/`, free to delete: `linkfail.mts`, `relink.mts`,
`charttarn.mts` are mine; the rest are my predecessor's.
