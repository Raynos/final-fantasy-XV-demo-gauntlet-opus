# materials — WS-2 (fewer shader programs) + WS-12b (material consolidation, character LOD)

**Owner:** the `materials` lane, 2026-08-28. **Scope:**
`docs/plans/2026-08-25-opus-after-phase3.md` §WS-2 and
`docs/plans/2026-08-26-opus-the-standing-backlog.md` §WS-12b, which are one
piece of work. Gated by the human on `pnpm run check` plus a full-corpus cold
diff, **reverted wholesale if the diff does not clear**.

## Where it stands

**Shader programs 271 → 126. `postfx+compile+warmup` 1776 ms → 989 ms.**
Two commits, both in `src/engine/CompileGuard.ts` + one line of `Sky.ts`.
Nothing in the 132 material construction sites was touched, and nothing needed
to be: **the program explosion was not material sprawl at all.**

| | HEAD~3 (`cc7a9b6`) | now (`ea90e0b`) |
|---|---|---|
| programs held after boot | **271** | **126** |
| `postfx+compile+warmup` (3 loads) | 1826 / 1706 / 1797 ms | **979 / 988 / 1000 ms** |
| warm-up's own report | 1759 ms, +181 programs | **~910 ms, +38 programs** |
| warm-up `scene` step | 1309 ms, 135 programs | **~640 ms, 12 programs** |
| cold boot wall | 8.15 s | **7.20 s** |
| warm loads | 7.71 / 7.81 s | **7.04 / 7.03 s** |

A fourth run after a `vite build`, same build, quiet: **918 / 943 / 954 ms** and
7.46 / 7.03 / 6.90 s wall — so 933 ms is the settled figure and the effect is
**-843 ms on that line, -47%**.

The absolute boot numbers are high because **`paintedFaces` and `bakedGeometry`
were both missing** for the whole session (`daemon.mts --health` says so; the
`head` lane keeps editing files in `CANVAS_SOURCES`, which prunes `texc`), worth
~2.5 s and ~1.2 s. Both arms paid it, so the delta stands and the absolute does
not. **`pnpm run build:full` was run and could not fix it**: `texbake --canvas`
died on `page.goto ... ERR_CONNECTION_REFUSED` against its own build server
while the box was under three lanes' load. Worth one retry on a quiet machine —
it is not a code fault and nothing here depends on it.

## The finding, because the plans point the wrong way

Both plans, and the coordinator's static pass, said the multiplier was three's
own feature key across 132 material construction sites. **It is not.** The keys
this repo writes are honest — `VegMaterial` and `rig/Materials` compile their
tuning values into the GLSL as literals, so those really are different shaders.

The multiplier was that **`renderer.compile()` was compiling a set of programs
the frame does not ask for**, twice over:

1. **Unpatched.** `Game.init()` runs `renderer.compile(scene, camera)` and one
   warm `post.render()` **before** `PostFX` builds `Warmup`, and
   `Warmup._patchAll()` is where `MaterialPatch.scan` runs. So every lit
   material visible then compiled with no CSM defines and no `atmo1|` key; the
   patch landed, `needsUpdate` fired, and three compiled it again. **60 dead
   programs**, `usedTimes` 234, bound by nothing.
2. **Canvas-flavour.** three keys **two** fields on `_currentRenderTarget ===
   null` — `outputColorSpace` and `toneMapping` — and both are in the cache
   key. Every scene pixel goes through `EffectComposer`, which owns a target.
   A compile with no target bound builds the canvas twin of every material.
   **85 more programs**, 60 of them the expensive patched `physical` ones.

Neither field survives a single-field collapse test (`outputColorSpace` scores
4, `toneMapping` 1) — they are two readings of one condition, and an inventory
that varies one field at a time walks straight past them. That is why this
sat open through three plans.

`src/engine/CompileGuard.ts` wraps `renderer.compile` so that it scans first and
runs with a target bound: **a compile sees what a frame sees**. Wrapping the
renderer rather than the four call sites, because `Game.ts` is shared and its
compile is not wrong — it is early, and it is to the canvas.

## The instruments (new, committed)

| probe | question |
|---|---|
| `probes/progkeys.mts` | decode three's `cacheKey`; which field multiplies the set |
| `probes/progused.mts` | hook `gl.useProgram`, pose 12 shots — **which programs does a frame ever bind** |
| `probes/progbare.mts` | name the lit programs with no patch, and cross-check the live graph |
| `probes/progphase.mts` | `BootProfile` now records `progs` per system `init()` — who compiles what |
| `probes/progrt.mts` | hold `outputColorSpace` + `toneMapping` constant **together** |

**Do not parse a `cacheKey` from the end.** three's default
`customProgramCacheKey` is `onBeforeCompile.toString()`, and a stringified
function is full of commas — that misparses 44 of 271 rows into nonsense and
produces a phantom "srgb vs srgb-linear splits everything" reading. Anchor
forward on the GLSL precision qualifier.

`material.program` is `undefined` in three 0.185. Use `renderer.info.programs`.

## Verified

- **Full-corpus cold diff, 142 shots, `cc7a9b6` -> `ea90e0b`: 136 under floor.**
  The six that were not — `warp_strike` 5.530, `warp_wide` 2.681,
  `bestiary_goblin` 2.593, `combat_stagger` 2.435, `combat_armiger` 2.411,
  `combat_magic_ice` 2.265 — are **all combat VFX and all belong to `10c2688`**,
  another lane's deliberate warp-shard blending change that landed between the
  two builds. Proven, not assumed: each of this lane's two commits was diffed
  **against its own immediate parent** on exactly those six shots and every one
  is under floor. `warp_strike` goes 5.530 -> **0.564** (commit 2 alone) and
  **0.523** (commit 1 alone).
- **`pnpm run check` 19/19.**
- **`nanscan` 0 of 142.**
- Cold capture of six shots: **zero console errors**. Looked at `hero_full` and
  `vista_night` at 1:1 — atmosphere, CSM shadows, night emissives all present,
  nothing unlit and nothing missing.
- `progused.mts` on the fixed build: of **134 programs any frame binds, exactly
  one is canvas flavour**, and it is the composer's own `renderToScreen` pass,
  which `renderer.compile` does not build.
- `pre-commit` build + both typechecks + 4 gates green on every commit.
- **Both perf gates re-certify on a quiet tree.** `perf.mts` **PASS** — mean
  **226.3 fps**, worst 152 (`regalia_drive`), **142/142 shots clear 60 by more
  than their own noise**. `gameplay.mts` **PASS** — every segment over 60,
  worst `streaming-traverse` 128.2 fps, `RULER_VALID: true`.
- **Nothing moved from boot into play, and this is the measurement that says
  so.** `progused.mts` reports `compiledDuringPoses` = **25 at all three
  program counts — 271, 211 and 126** — and `boundTotal` = **134 at all three**.
  The set of programs a frame binds is unchanged; only the dead ones went away
  (`unusedOfHeld` 162 -> **17**). That is the `LightBudget` constraint met by
  construction: no program key changes at runtime, the same keys are simply
  built once each instead of two or three times.
- `gameplay` still shows **two frames over 33 ms**, both `sprint+turn` (39.0 and
  34.8 ms). Those are **pre-existing** — `STATUS.md` records three breaches, of
  which "two are 1% of one segment" — and the `compiledDuringPoses` figure above
  shows they are not a compile this lane introduced.

## Not done, and the honest reason

- **Character LOD.** It was folded into this workstream because splitting it
  would mean touching the same 127 material sites twice. **Nothing touched them
  once**, so the coupling argument is spent and it is a clean separate lane.
  Re-measured today, `probes/drawwhere.mts` on `town_forecourt`: **465 calls,
  5 327 248 triangles, 272 buckets, 121 draws under 60 triangles**, and one
  bucket — `SkinnedMesh` / `ShaderMaterial` — is **60 calls and 1 736 436
  triangles, 28 940 per draw, a third of the frame with no LOD**. The frame
  costs 6.0-7.2 ms against 16.7, so this is headroom, not a cost.
- **The 16/16 texture-unit warning.** Still logged dozens of times a frame. It
  was not on the path of either fix. The atmosphere patch alone adds three
  samplers (`uSkyLut`, `uTransLut`, `uCloudShadowMap`) to every lit material, on
  top of CSM's cascades, the PMREM env map and the material's own maps — that is
  where to start.
- **`pnpm run build:full` and a fresh absolute boot number.** Both `texc.bin.gz`
  and `geo.bin.gz` were missing for this whole session, worth ~2.5 s and ~1.2 s,
  which is why the absolute boot reads 8.15/7.20 s rather than the ~5.8 s the
  `geometry-bake` lane last recorded. **The delta is sound; the absolute is
  not.**

## Known-remaining program dedupe, and why it was not taken

`progkeys`'s `instanceIds` equivalence says **22 more programs** collapse if
per-instance ids come out of cache keys. Essentially all of them are
`char2-eye<N>` from `src/characters/rig/Materials.ts:430`, where `kind` carries
a per-NPC id and the eye's `gloss` is compiled into the GLSL as a literal
(`${gloss.toFixed(2)}`). Making `gloss` a uniform collapses twelve programs to
one. **`src/characters/rig/` is the live `head` lane's directory and this lane
did not touch it.** `props/Wear.ts:717` keys on `tex.uuid` for a shader whose
GLSL is byte-identical every time — `uWear` is a sampler uniform, not a define,
so that key is simply wrong; it is worth 1–2 programs and is free to take.

`VegMaterial.ts:520`'s eleven-number key is **honest** — those numbers are GLSL
literals. Collapsing it means making them uniforms, which changes the shader of
every plant in the game and forfeits constant folding on the most-drawn
geometry there is. ~24 programs. Not judged worth the risk against a corpus
diff, but it is the next-largest item if someone wants it.

## Rules this lane is working under

- Only `--cold` sees a GLSL link failure. Take one after every shader-adjacent
  change.
- Lanes live in `src/characters/rig/` (`head`) and `src/combat/`. Do not touch.
- Explicit pathspec via `gitlock.mts`. Never `git add -A`.
