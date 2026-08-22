# Sibling trap list — 21 mechanisms whose failure mode is silent

**Provenance: not ours.** Lifted verbatim from `docs/REMASTER.md` in
`final-fantasy-XV-demo-opus`, the sibling three.js FFXV run. Line references
(`Post.ts:640`, `Rig.ts:499`, …) are *their* files, not ours; three.js version
is r181 there and 0.185 here. Read it for the **mechanisms**, which are
three.js and measurement facts and transfer directly, not for the paths.

Ported under `docs/plans/2026-08-21-fable-sibling-ports.md` §3.1.

Which of these we have already been bitten by, independently:

| their trap | our version |
|---|---|
| 9 — posed frames are not byte-stable and **the floor is per-shot** | our capture order-dependence, closed at 0.340 mean/255 against a 0.302 floor (`project/LANDMINES.md`). Same disease, and we also found the floor is not one number. |
| 16 — never measure perf while a builder is live | `src/tools/ruler.mts` `printContention()` exists for exactly this. Our `walk` "57.5 fps" was taken under six-agent load and was never real. |
| 21 — confirm the thing you are blaming is IN the frame | our chevron-hatch/GTAO and shadow-detachment/grass misdiagnoses. This is why `BRIEF.md` now says ablate before re-tinting. |
| 19 — an ablation is only as good as its ROI | we have `--heat`; we do not yet have a habit of validating the ROI. Read this one. |
| 7 / 2 — live constants are not the ones in the constructor | ours are in `src/engine/postfx/GradePass.ts` + `Fx.ts` defaults; check both before quoting a grade number. |

---

## The trap list

Every one of these has already cost this project a round, or is a mechanism whose
failure mode is silent. Read it before writing a line.

1. **CSM erases `onBeforeCompile`.** Three's CSM assigns it directly and derives
   `customProgramCacheKey` from `String(onBeforeCompile)`. Every patch goes through
   `src/world/shaderPatch.ts injectStandard()` and asserts its marker landed.
2. **Two inliners of `lights_physical_pars_fragment` silently collide.** The SSS patch
   consumes the `#include` directive; a second independent inliner finds it already gone
   and `.replace()` returns the source unchanged. Use **one** `inlinePhysical(mat, key,
   substitutions[])`, N substitutions.
3. **`object.layers` does NOT filter the shadow pass.** `WebGLShadowMap.js:347` tests
   against the *view* camera, so hiding a shadow proxy from the colour pass removes it
   from every shadow map, silently. Use a `customDepthMaterial` plus a colour-pass vertex
   shader that collapses vertices outside the clip volume. Same for `material.visible`.
4. **A vec4 `color` attribute means `USE_COLOR_ALPHA`** and drives *opacity*, not
   occlusion. Bake AO to a custom `aAo` attribute; never a 4th colour component.
5. **`alphaToCoverage` is unavailable.** MSAA is coded and force-disabled because the
   depth attachment did not survive the multisample resolve. Anyone planning on it ships
   nothing.
6. **Area is transpose-invariant.** A transposed impostor UV survived four rounds because
   the only check was silhouette area. Every LOD/orientation check needs an
   orientation-sensitive statistic (row-width profile + vertical centroid), and every
   alpha-mip check measures **alpha-survivor fraction per mip**, never area.
7. **`Post.render()` rewrites uniforms every frame** — `uBloomStrength`, `uFogDensity`,
   `uExposure`, `uMieG`. Setting those anywhere else is a no-op. `RenderStack.tuneGrade()`
   is the live source of truth; the `Post.ts` constructor constants are dead.
8. **`MeshStandardMaterial.copy()` resets `defines`.** Re-apply every new define in clone
   paths or the feature dies one indirection later.
9. **Posed frames are NOT byte-stable, AND THE FLOOR IS PER-SHOT.** Two `--cold` renders
   of one fingerprint differ by mean|d| **0.0617** on `vista-noon` — but on `party-walk`,
   which carries cloth springs, hair jiggle and gait phase, ten pairwise comparisons of
   five renders of ONE build span **1.03 to 7.78, mean 4.73**: seventy-seven times worse.
   Never carry a floor measured on one shot to another, and never estimate it from a
   single pair — those ten pairs span 7.6× among themselves. Measure the control on the
   shot you are actually comparing, with at least three renders. And never quote `max`:
   it was ~160 in both signal and noise.
10. **`&seed=` does not make a driven playtest reproducible.** No acceptance check may
    depend on cross-run frame reproducibility; use posed frames or ≥3 samples.
11. **Ablate with a neutral `__ABLATE__` dial at the call site**, never by writing a
    uniform `Post.render()` owns.
12. **GPU-baked textures are not byte-identical across vendors.** No byte-diff acceptance
    check downstream of the bakery — statistics only.
13. **`vUv1` does not exist in three r181.** The varying was dropped. `texture.channel = 1`
    is what makes three emit `vMapUv` carrying uv1 for that slot. Every row coding against
    this project's UV1-in-metres convention — which is most of them — will otherwise write
    a varying that is not there.
14. **`computeSpecularOcclusion` has never executed in this project.** three's own
    implementation is exactly the formula we want, but it is gated on
    `USE_ENVMAP && aoMap`, and measured aoMap coverage across all 50 standard materials is
    **zero**. So every "we need specular occlusion" item is really "we need an AO map";
    the shading term arrives free the moment one is bound. Do not hand-roll it.
15. **Two patchers can consume the same anchor and neither audit will notice.** The grass
    material's chunks are a superset of `patchFoliage`'s, so running both on one material
    consumes the shared `#include <common>` anchor twice. A marker assert only proves *a*
    patch landed, not that an earlier one still has its anchor. Where two systems could
    patch the same material, one must own it outright.
16. **NEVER MEASURE PERF WHILE A BUILDER IS LIVE.** `pnpm run build` compiles the whole
    working tree, so any agent mid-edit is in your binary. Measured the hard way: a
    shipgate run reported 257 ms and 364 ms main-thread tasks, which was attributed to a
    grass density change and ablated against — and then `perf-stall` came back at
    **2761 ms**, which no grass setting explains. `git status` showed a character builder
    had landed a 997 ms SDF head build in the same tree. The ablation that "confirmed"
    grass was measuring someone else's work. Perf numbers are only meaningful with
    `git status --short` clean of other owners' paths, exactly as AGENTS.md already says
    for commits.
17. **Posed frames render through the full post chain.** Any probe comparing two builds is
    also comparing their grade and exposure. Only compare builds whose grade is otherwise
    identical, or ablate the term under test with a neutral `__ABLATE__` dial.

18. **NEVER put a backtick in a GLSL comment.** Shaders live in `` /* glsl */ `...` ``
    template literals, so a stray `` ` `` — the natural way to quote a uniform name in
    prose — terminates the string and the file fails to parse. It has cost this project
    four separate incidents (bloom, grass AO, and a water ripple comment that broke the
    build for every other agent on the machine at once). Write uniform names bare, or in
    CAPS. The failure is loud but its message points at the *next* identifier, not at the
    backtick, so it reads as a syntax error in code that is fine.

20. **The wave gate `__SHADER_AUDIT__().failed === 0` was not real.** Two modules
    assigned `globalThis.__SHADER_AUDIT__` from their own top-level blocks —
    `render/shaderAudit.ts` (the rich report) and `actors/body/materials.ts` (a flat
    `Record<string, PatchAudit>`) — so the winner was decided by import order, and the
    flat one ran second. It has no `failed` field, so the gate cited in six files and in
    this document was evaluating `undefined === 0` on the shipped page. Fixed by
    `registerLegacyAudit()`: whoever imports first installs the rich report and the flat
    one folds in, in either order. **Verified on a rendered frame: 310 compiles / 310
    injected / 0 failed across 90 keys, `failed` a number, nothing never-compiled.**
    The general lesson is the sharper one — *a global assigned at import time by two
    modules is a race whose winner is a bundler decision*, and it silently downgraded a
    gate rather than breaking anything visible.

21. **Confirm the thing you are blaming is IN THE FRAME.** Twice now a confident
    finding has been written about a subsystem that was not being rendered. "The sky has
    no sun disc radiance at any hour" — it does, at 55.0 linear; no pose had ever framed
    the sun. "The broadleaf bushes are flat cutouts, badly oversized" — `lake-shore`
    contains no trees at all; the blobs are `Props.ts bush()`, an 11-flat-card rosette,
    and the veg broadleaves already read correctly. Both were reasoned from a real image
    and both named the wrong owner, which sends a builder to rewrite code that was fine.
    Before attributing a rendered defect: **ablate the suspect and confirm the pixels
    move**, or enumerate what actually draws into that region. It costs one probe.

19. **An ablation is only as good as its ROI.** Four consecutive ablations of the face
    mottling — vertex AO, mesh normals, albedo map, vertex colours — all returned "no
    effect" (−0.1% to −3.6%) because the ROI included the hair fringe, whose
    high-frequency energy is an order of magnitude larger than anything on skin. The same
    four tests against a cheek-only ROI returned 4.8% / 8.2% / 5.6% / **34.5%**. A null
    result from a region you have not verified is dominated by the thing under test is
    not a null result; before believing one, measure the ROI's baseline against a region
    where the effect is known to be absent.
