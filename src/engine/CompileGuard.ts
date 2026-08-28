import * as THREE from 'three';

/**
 * Make `renderer.compile()` compile the programs a real frame will actually
 * bind, rather than programs that merely resemble them.
 *
 * A pre-compile only earns its wall clock if what it builds is what the frame
 * asks for. Two things here made that false, and both were worth about sixty
 * shader programs each — a quarter of the page's set, apiece.
 *
 * **1. The material must already be patched.** `Game.init()` runs
 * `renderer.compile(scene, camera)` and one warm `post.render()` before
 * `PostFX` builds `Warmup`, and `Warmup._patchAll()` is where
 * `MaterialPatch.scan` gets called. So every lit material visible at that
 * moment compiled with no CSM defines and no `atmo1|` cache key, the patch then
 * landed and set `needsUpdate`, and three compiled the identical material
 * again. `beforeCompile` closes that by running the scan first, for every
 * caller, instead of for whichever caller remembered.
 *
 * **2. A render target must be bound.** three keys *two* fields on
 * `_currentRenderTarget === null`:
 *
 * ```
 * outputColorSpace : renderer.outputColorSpace  when null, else the working space
 * toneMapping      : renderer.toneMapping       when null, else NoToneMapping
 * ```
 *
 * Both are in the program cache key, so the same material compiles to two
 * different programs depending on whether a target was bound — and this game
 * renders every scene pixel through `EffectComposer`, which owns one. A
 * compile with no target bound therefore builds the *canvas* flavour of every
 * material in the scene, and the canvas flavour is never drawn.
 *
 * That is measured, not deduced. `src/tools/probes/progused.mts` hooks
 * `gl.useProgram` and poses twelve shots spanning day, night, storm, town,
 * dungeon, haven, a boss and a combat set piece: of 134 programs bound,
 * **exactly one is canvas flavour** — the composer's final `renderToScreen`
 * pass, which really does draw to the canvas and is not built by `compile`.
 * Meanwhile 60 `physical` canvas twins sit compiled and unbound.
 *
 * Neither field survives being held constant on its own (the single-field
 * collapse test scores them 4 and 1), because they are two readings of one
 * condition. Held together they collapse **85 of 211 programs**.
 *
 * Wrapping the renderer is the right seam rather than fixing the call sites:
 * `Game.ts` is shared and its compile call is not wrong — it is early, and it
 * is to the canvas — and there are four such call sites between it and
 * `Warmup`. This makes "a compile sees what a frame sees" an invariant of the
 * renderer. Same shape as `BootProfile` wrapping `Game.add`, and for the same
 * reason.
 *
 * @param renderer the renderer to wrap; wrapping twice is a no-op
 * @param beforeCompile run on the scene about to be compiled, before it is
 */
export function guardCompile(
  renderer: THREE.WebGLRenderer,
  beforeCompile: (scene: THREE.Object3D) => void
) {
  const r = renderer as THREE.WebGLRenderer & { __compileGuard?: boolean };
  if (r.__compileGuard) return;
  r.__compileGuard = true;

  /**
   * One pixel, allocated on first use. Only its existence matters: three reads
   * `_currentRenderTarget !== null`, never the target's size or format.
   */
  let scratch: THREE.WebGLRenderTarget | null = null;

  const orig = renderer.compile.bind(renderer);
  renderer.compile = function (scene, camera, targetScene) {
    beforeCompile(scene);
    const prev = renderer.getRenderTarget();
    if (prev === null) {
      if (!scratch) scratch = new THREE.WebGLRenderTarget(1, 1);
      renderer.setRenderTarget(scratch);
    }
    try {
      return orig(scene, camera, targetScene);
    } finally {
      if (prev === null) renderer.setRenderTarget(null);
    }
  };
}
