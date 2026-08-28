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

The absolute boot numbers are high because **`paintedFaces` and `bakedGeometry`
were both missing** for the whole session (`daemon.mts --health` says so; the
`head` lane keeps editing files in `CANVAS_SOURCES`, which prunes `texc`), worth
~2.5 s and ~1.2 s. Both arms paid it, so the delta stands; the absolute number
does not. **Re-measure after `pnpm run build:full`.**

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

## Verified so far

- Cold capture of six shots at HEAD: **zero console errors**, and the frames
  read correctly — atmosphere, CSM shadows, night emissives all present. Looked
  at `hero_full` and `vista_night` at 1:1.
- Cold-vs-cold six-shot diff, `cc7a9b6` against `ea90e0b`: **all six under
  their floor** (`hero_full` 1.557 against 2.25, `storm` 0.071 against 0.18,
  `town_forecourt` 0.260 against 2.00, `vista_dusk` 0.175/0.25, `vista_night`
  0.530/0.82, `zone_longwythe` 0.694/1.23).
- `pre-commit` build + both typechecks + 4 gates green on both commits.

## Left to do — the gate, then the rest of the workstream

1. **Full-corpus cold diff, 142 shots, `cc7a9b6` vs HEAD.** In flight at the
   time of writing (`tmp/shots/corpus-a` and `-b`, `corpus.mts --build`).
   **This is the revert gate.**
2. `pnpm run check`, and **both perf gates re-certified on a quiet tree**
   (`perf.mts`, `gameplay.mts`, `daemon.mts --wait quiet --for 900`).
   `nanscan` 0.
3. `pnpm run build:full`, then a fresh `bootprof` for an absolute number that
   is not carrying two missing caches.
4. **Not started: character LOD.** `probes/drawwhere.mts` on `town_forecourt`
   still reports ~5.2 M triangles, a third of it skinned character mesh at
   ~29k triangles per draw with no LOD. The cold capture above measures
   8.2–10.7 M triangles per frame, so this has if anything grown. Untouched.
5. **Not started: the 16/16 texture-unit warning**, still logged dozens of
   times a frame in every probe run.

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
