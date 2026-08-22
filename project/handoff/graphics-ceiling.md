# Graphics ceiling — Wave 2, the environment half of the AAA push

Owner: the graphics-ceiling agent (`PORT=5360`).
Contract: `docs/plans/2026-08-21-fable-sibling-ports.md` §3 (Wave 2).
Branch: `worktree-agent-a714cbab32e01461d`, fast-forwarded from `main` at `726f0f7`.

**§3.1 DONE. §3.2 DONE, both halves. §3.5 DONE. §3.3 opened, one item measured
and rejected — read that section, it is the most useful thing here.**

---

## The headline, and it is not good

The game now has an instrument that says what it scores, and the first reading
is **3/10, called 6/6 at high confidence**, against a stale 4.5/10 that predates
essentially everything now in the game. That is worse than the number it
replaces and it is the first one anyone can trust.

Both instruments agree with each other and with what I saw in the frames, which
is the part that matters — three independent routes to the same five defects.

---

## §3.1 — the measured art-direction corpus (`eedb645`)

`docs/reference/` is new, and `docs/reference/README.md` states why it is a
fourth documentation genre: it is the only durable material in the repo that
cannot go stale when our code changes, because it measures somebody else's
shipped frames.

| file | what |
|---|---|
| `ART-DIRECTION.md` | 659 lines of pixel-sampled FFXV PS4 reference. **The numeric art target.** |
| `plates/` | The 53 screenshots every hex in it was sampled from, so the document is re-derivable rather than a list of assertions. |
| `PLATE-SOURCES.md` | Provenance for each plate. |
| `sibling-TRAPS.md` | 21 silent-failure mechanisms, with a table of the five we have already rediscovered independently. |
| `sibling-RENDER-INVENTORY.md` | Kept for the format; its ABSENT/WEAK lists double as a checklist of what a three.js FFXV usually lacks. |
| `corpus-stats.json` | Generated. Six scene-matched statistical corpora. |

The 24 MB of plates is deliberate. `BRIEF.md` rule 1 governs what the **build**
reads and nothing under `docs/` is reachable from vite's root or any bundle.
Without them §3.2 has nothing to be blind about.

**The character and creature sections (§12, §13) are the point of the import.**
Every dead repo in this gauntlet lost its blind test on actor silhouettes and
none lost on environment. Those are the only quantified actor targets anyone
produced. The art agent should be reading §12.1 (skin lit:shadow is **2.0–3.2×**,
never more, and skin shadows stay warm while environment shadows push teal),
§12.3 (hair medians `#1f2630`; *blond* hair in full sun still only medians
Y≈81) and §12.5 (a red shirt in full midday sun peaks at `#7a383c`, Y≈74).

## §3.2a — `src/tools/imagestats.mts` (`9806056`)

Twelve statistics on our captures and on the reference, with a delta and a
sentence per row. `--subsets` rebuilds the whole corpus file in one pass.

```bash
node src/tools/imagestats.mts --subsets                          # rebuild the reference corpora
node src/tools/imagestats.mts "tmp/shots/x/*.png" --against FFXV-field
```

Three things worth knowing before you use it:

- **Judge against a scene-matched slice, never against `FFXV`.** The whole
  corpus spans midday plains, night VFX, menu screens and studio portraits;
  its median describes no frame anyone would render.
- **`hi(R-B)` is confounded by sky fraction** and this bit me before it bit
  anyone else. FFXV's whole-corpus `hi(R-B)` is **-19.8** — highlights *cooler*
  than shadows, which flatly contradicts `ART-DIRECTION.md` §1's split-tone.
  The rule is not wrong: outdoors the brightest quartile is mostly sky, which is
  strongly blue, and that swamps a split-tone worth a few levels on lit
  surfaces. `FFXV-actor`, which has no sky in it, reads sh -2.5 / hi +15.6 —
  exactly the eyedropper's answer.
- The port fixed a real flaw in the source: MGS5's `stops` floors at 1e-6
  linear, so **19 of 53 plates reported the identical saturated 19.93**. Floored
  at one code level here; tops out at 11.69.

**The reading, six field/zone shots against `FFXV-field`:**

```
                   R-B  sh(R-B)  hi(R-B)  meanL  p0.1   p50  p99.9  clip%  sat%  stops
ours-field (6)    +6.4     +7.0     +2.1  107.2   0.5  94.9  251.1   1.94  31.8  11.59
FFXV-field (10)   -8.5     +5.8    -13.5  102.3   3.4 100.9  252.0   0.50  29.5   9.79
```

Exposure, median, saturation and shadow warmth all inside tolerance. Two real
gaps: highlights **+15.6 R-B warmer**, and `p0.1` 0.5 against 3.4.

I checked whether the black-point gap is a codec artifact, since the reference
is JPEG and our captures are PNG. It is not: re-encoding our own PNGs to JPEG
moves `p0.1` by under one level. **`clip%` however IS codec-sensitive** —
`zone_vesperpool` reads 3.25% as PNG and 0.71% as JPEG. Do not compare clipping
across codecs.

## §3.2b — `src/tools/compare.mts`, blind A/B with a sealed key (`8ccb41c`)

```bash
node src/tools/compare.mts --shots tmp/shots/x --out tmp/ab/rN --seed 4242
cp tmp/ab/rN/ab-*.jpg tmp/ab/rN-judge/     # the key must not be in the judge's directory
# hand a FRESH agent (never a fork -- a fork inherits your context) only rN-judge
node src/tools/compare.mts --reveal tmp/ab/rN --answers 1=A,2=B,...
```

`--selftest` asserts the shuffle is not guessable from the seed: seed-parity
correlation 49.97%, left/right balance 50.04% over 100k seeds. The source repo's
first mixer had output bit 0 collapse onto the seed's bit 0 and a judge noticed
all three composites had the game on the same side.

`PAIRING` scene-matches each shot to plates. That is the validity of the test,
not politeness — a judge shown our night vista beside a sunlit Duscae plain is
answering "which scene is prettier", which we lose while learning nothing.

**Round 1, 2026-08-23, `tmp/ab/r1/`: 6 identified, 0 fooled, 0 hesitated, all
high confidence. Score 3/10.** The judge's five defects, in its order:

1. no exposure discipline — sky clips to pure white while the ground crushes to
   black, no rolloff either end
2. foliage unlit on its shadow side, no bounce term *(not this lane)*
3. terrain silhouettes are smooth cones with no erosion break-up, and one tiling
   texture stretched across a 60-degree face
4. clouds are an opaque single-layer slab with no scattering
5. distant geometry takes no aerial perspective — full saturation and contrast
   at the horizon, where the reference measures `#bad2e4`

**Caveat, recorded so the next round is read correctly:** the judge's *prose*
mixed up which panel it was describing in at least two of six, while its A/B
verdict matched the key every time. Read the verdict column as evidence and the
reasoning as a lead. Track **hesitation rate**, not win rate: it moves first.

## §3.5 — the horizon-angle bake (`74ec71e`, `86a249d`)

`src/world/terrain/Horizon.ts`. Maximum skyline elevation in 8 azimuthal bins
per texel of the far heightfield, one 2-layer RGBA8 array texture, two fetches.
Buys kilometre-scale terrain self-shadow (a 320 m cascade cannot express a
caster 2 km away at any resolution) and cosine-weighted sky-visibility AO.

**Proved, not looked at.** `src/tools/horizoncheck.mts`, now a gate: MCC
0.858 / 0.900 / 0.907 against an independently written brute-force ray march at
3 / 6 / 10° of sun, 0 skyline over-claims in 4000 samples, flat plain reads
1.0000. Matthews and not accuracy, because at a high sun a function that returns
"lit" unconditionally is 99% accurate.

**Effect, ablated** (`uHorizonMix` zeroed vs default, `tmp/shots/gc-lowsun-*`):

| shot | mean/255 | >8/255 |
|---|---|---|
| `daycycle_dusk` | **1.962** | 2.66% |
| `zone_three_valleys` | 0.703 | 0.04% |
| `daycycle_dawn` | 0.327 | 0.07% |
| `vista_dusk` | 0.220 | 0.01% |

Against a 0.30 capture floor. The heat map `tmp/shots/gc-heat/daycycle_dusk.png`
is the whole story: every moving pixel is on a distant mountain flank or a mesa
face; sky black, near foreground black, props black. **It is a dawn/dusk effect
and at noon it is physically almost nothing**, which is correct and is also why
the six-shot noon set only moved 0.24–0.97.

`tmp/shots/gc-dusk-on/daycycle_dusk.jpg` is the frame to look at: warm-lit peak
over a cool shaded base, mesa shadowed at the foot with its top edge catching
light, far ridge cool blue with snow catching pink. That is a real golden-hour
terrain read and it was not there this morning.

Three deviations from the sibling, each forced:

- **Not in the baked container.** A section means bumping `BAKE_VERSION`, and
  `src/public/baked/` is one cache shared by every worktree through a symlink —
  the bump would make every other worktree's `unpackContainer` throw and drop it
  onto the 7–15 s regeneration path. Boot instead: **67 ms sweep + 32 ms pack**,
  in a `Terrain.horizon` boot phase. Move it into the container the next time
  somebody re-bakes anyway.
- **One 2-layer array texture, not two 2D maps.** Two put the terrain shader at
  17 fragment samplers against `MAX_TEXTURE_IMAGE_UNITS` 16.
- **`uSunDir` is not declared in `HORIZON_GLSL`.** `sky/MaterialPatch.ts`
  already injects it and `Sky` writes it every frame.

### Two traps this cost, both now written down

1. **A duplicate uniform declaration surfaces only as
   `THREE.WebGLProgram: Shader Error 1282 - VALIDATE_STATUS false`**, with no
   other detail through `shoot.mts`. It reads as a GLSL bug in the new file and
   is not one. `src/tools/probes/samplercount.mts` is what found it — it dumps
   `MAX_TEXTURE_IMAGE_UNITS`, per-material active sampler counts and the program
   info log. Reach for it first next time a shader fails to validate.
2. **A backtick inside a GLSL comment**, exactly `sibling-TRAPS.md` trap 18.
   Terminated the template literal and reported the error thirty lines down.
   Probe snippets under `src/tools/probes/` are also evaluated as raw text, so
   they must carry **no TypeScript annotations** either.

## §3.3 — one item measured and REJECTED, and the finding is the valuable part

`docs/plans/…` §3.3 lists six grade upgrades. **Most of them are already done.**
`src/shaders/post/grades.ts` already has a lifted toe, a soft shoulder, a
three-band split-tone, highlight desaturation (`satHigh` 0.82–0.88) and a print
fade. Read that file before porting anything from §3.3; it is further along than
the plan assumes.

I built §3.3's **hue-gated warmth** — withdraw `highTint` from pixels that are
already blue, so the sky keeps its blue while the land stays warm — because
`imagestats` had named exactly that defect (+15.6 R-B in the highlights).

**Measured, on the same six shots: `hi(R-B)` moved from +2.1 to +0.7.** 1.4
levels. Reverted (not committed) and recorded, because:

> **The highlight-warmth gap is not in the grade. It is the cloud cover.**

`highTint` for `day` is only `[1.04, 1.0, 0.94]`, and the highlight weight is
`y²`, so it barely engages where the sky is. What actually drives our bright
quartier warm is that at these hours our sky is a **near-neutral grey cloud
blanket** where FFXV's is blue — visible directly in
`tmp/shots/gc-look/vista_noon.jpg`, which is overcast with one hole of blue in
it. Look at that frame; the number and the picture say the same thing.

So the lever is `src/world/sky/Clouds.ts` — coverage and the scattering that
gives a cloud a silver lining instead of a flat grey — which is the judge's
defect 4 as well. **Two of the five ranked defects are one cause.** That is the
next thing I would do.

---

## What I would do next, in order

1. **Cloud coverage and scattering** (`src/world/sky/Clouds.ts`, mine, untouched).
   Closes judge defect 4 and the measured `hi(R-B)` gap at once, per above.
   Verify with `imagestats --against FFXV-field` and re-look at `vista_noon`.
2. **§3.4 aerial perspective** — judge defect 5, and `ART-DIRECTION.md` §2 gives
   the target as a number (`#bad2e4` on a distant ridge against `#6f753b`
   foreground). Ours applies far too little: in `tmp/shots/gc-look/zone_longwythe.jpg`
   the peaks are as contrasty and as saturated as the foreground. §3.4's
   `airDepth = 1 - exp(-dist/scatterLength)` weighting is the structure, and the
   **creature/terrain haze split** (a boss against sky is 1:10 near-black and
   takes NO aerial perspective) is a legibility rule, not a lighting one.
3. **The stretched rock tile on steep faces** — judge defect 3's other half.
   Visible as vertical "wood grain" on every cone in `zone_longwythe` and
   `daycycle_dusk`. `LANDMINES.md` already records this being misdiagnosed twice
   as analytic strata; it is `Layers.ts` recipe 3, the rock tile. Ablate before
   re-tinting.
4. **Round 2 of the blind A/B**, after 1 and 2, not before — one small change
   does not move a 6/6.
5. Move the horizon bake into the baked container when somebody next bumps
   `BAKE_VERSION` for another reason. While there: the sweep stores
   `atan(slope)` and the pack takes `sin` of it, and `sin(atan(s)) =
   s/sqrt(1+s²)` — dropping both trig calls should take the ~99 ms boot cost to
   well under half that.

## State of the tree

`npm run check`: **6/10**, and the four failures are all pre-existing or
environmental, none from this lane.

- `anycheck` — 11 `any`, all in `src/game/rpg/HavenCamp.ts`. Not mine.
- `combatloop` — 29/30. Not mine.
- `heightcheck`, `driftcheck` — crash under `check.mts` but **PASS standalone**
  (`worst |gpu - cpu| = 0.000 m`); the runner's dedicated-server scan collides
  with a live capture daemon. Run them by hand until someone fixes the runner.
- `horizoncheck` — new, PASS, 0.56 s.
- `seatcheck` — **PASS, model residual p99 0.000 m**, unchanged by the terrain
  work. It is the regression test for the seating model; keep it passing.

**Perf is unmeasured for the horizon change and this is the one open risk.** The
terrain fragment shader gained two array-texture fetches and an 8-iteration AO
loop, on a shot (`vista_dawn`) that the instruments lane already showed is
single-bottleneck and almost certainly GPU. The tree was not quiet enough to
take a ruler-valid number. **Somebody must run `node src/tools/perf.mts --out
project/baseline-perf.json` on a quiet tree and confirm `RULER_VALID: true`
before this is trusted.** If it costs more than a millisecond, the cheap lever is
`uHorizonMix.y` → 0 (drop the AO loop, keep the shadow, which is the half that
carries the look).

## Files touched

New: `src/world/terrain/Horizon.ts`, `src/tools/imagestats.mts`,
`src/tools/compare.mts`, `src/tools/horizoncheck.mts`,
`src/tools/probes/samplercount.mts`, `docs/reference/**`.
Modified: `src/world/Terrain.ts`, `src/world/terrain/TerrainMaterial.ts`,
`src/tools/check.mts`.

## Shots that show the current state

- `tmp/shots/gc-dusk-on/daycycle_dusk.jpg` — the horizon bake doing its job.
- `tmp/shots/gc-heat/daycycle_dusk.png` — its ablation heat map.
- `tmp/shots/gc-look/zone_longwythe.jpg`, `vista_noon.jpg` — the two frames that
  show defects 3, 4 and 5 without any instrument.
- `tmp/ab/r1/` — round 1 composites and the sealed key.

## My honest grade for the environment, against shipped FFXV

**3.5 / 10.** Half a point above the blind judge because the terrain now has
kilometre-scale shade that it did not have this morning, and because the
composition, the palette and the world's *shape* are genuinely right — Leide
reads as Leide. Everything else the judge said stands. The three things between
us and a 6 are all atmosphere: cloud scattering, aerial perspective, and a
tonemap that does not clip the sky while crushing the ground. `BRIEF.md` has
said all along that atmosphere is the #1 lever and it is still the answer.
