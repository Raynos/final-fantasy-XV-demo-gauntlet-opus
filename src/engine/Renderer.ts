import * as THREE from 'three';
import { demoActive, renderScale, resolveQualityTier } from './Device.ts';

/**
 * The four render quality tiers, worst to best.
 *
 * Ordered, because `SystemScreen` steps through them with an index and
 * `PostFX` compares them. Exported so the tier is one closed set: it arrives
 * from `?q=`, from the dev console and from the settings screen, and every one
 * of those is a string until something checks it.
 */
export const QUALITY_TIERS = ['low', 'medium', 'high', 'ultra'] as const;

/** One render quality tier. */
export type QualityTier = typeof QUALITY_TIERS[number];

/** Narrow an untrusted string (`?q=`, a console argument) to a tier. */
export function isQualityTier(v: unknown): v is QualityTier {
  return typeof v === 'string' && (QUALITY_TIERS as readonly string[]).includes(v);
}

/** What `new Renderer()` accepts. */
export interface RendererOpts {
  /** Overrides `?q=`; anything unrecognised falls back to `'high'`. */
  quality?: string;
}

/**
 * Owns the WebGL context, the main camera and global render settings.
 * Quality tiers let the screenshot harness force max settings while the
 * interactive session adapts to the machine.
 */
export class Renderer {
  _onResize: () => void;
  /** Set by `Game`; called with the new backbuffer size on every resize. */
  onResize: ((w: number, h: number) => void) | null = null;
  /**
   * Set by whoever knows how to come back.
   *
   * A lost WebGL context costs a reload — the CPU copies of 103 MB of
   * generated texels are freed after upload and cannot be re-uploaded — and
   * on a phone the ordinary cause is the player taking a call. Returning this
   * hook a search string is how `StorySystem` turns that reload into a
   * continue rather than a trip back to the title. `Renderer` never learns
   * what a save is; it just uses the string.
   */
  onContextRestored: (() => string | null) | null = null;
  camera: THREE.PerspectiveCamera;
  container: HTMLElement;
  isWebGL2: boolean;
  quality: QualityTier;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  constructor(container: HTMLElement, opts: RendererOpts = {}) {
    this.container = container;

    // `opts.quality` is an untrusted string, so an unrecognised tier lands on
    // `'high'` rather than being carried around as a tier name that every
    // `=== 'low'` test silently misses. With no override, `resolveQualityTier`
    // is the single source of truth — it reads `?q=` and, failing that, asks
    // whether this is the phone demo. `?q=` still wins over detection, so
    // every harness URL means exactly what it did before.
    this.quality = opts.quality
      ? (isQualityTier(opts.quality) ? opts.quality : 'high')
      : resolveQualityTier();

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,               // we resolve AA in post (SMAA/TAA)
      alpha: false,
      stencil: false,
      depth: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,    // needed for deterministic screenshots
    });
    const gl = this.renderer.getContext();
    this.isWebGL2 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;

    this._applyTier(this.quality);
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // The scene is only ever rendered into HDR float targets, so three never
    // applies its own tone map — PostFX owns the whole display transform.
    // `toneMappingExposure` is still honoured: PostFX folds it into the
    // auto-exposure multiplier so existing code that pokes it keeps working.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;   // PCFSoft is deprecated in r185
    this.renderer.shadowMap.autoUpdate = true;
    this.renderer.info.autoReset = false;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(
      50, container.clientWidth / container.clientHeight, 0.15, 6000
    );
    this.camera.position.set(0, 3, 8);

    this.scene = new THREE.Scene();

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this._wireContextLoss();
  }

  /**
   * What happens when the GPU takes the context away.
   *
   * Three already handles this on its own and, until the memory pass, handled
   * it *correctly*: `onContextLost` calls `preventDefault` so the browser will
   * restore, `onContextRestore` calls `initGLContext()`, and every texture then
   * re-uploads from `texture.image` the next time it is bound.
   *
   * That last step is the one that stopped being free. `dropTexelsAfterUpload`
   * releases a generated map's `Uint8Array` the instant the GPU has it — 103 MB
   * of the process — so on a restore three would re-upload an *empty* image and
   * the world would come back with black albedo, black normals and no error
   * anywhere. The same is true of the painted faces, whose canvas mip pyramids
   * are shrunk after upload.
   *
   * So the recovery moves up a level: **a restored context reloads the page.**
   * Every texture in this game is generated from code in the repo and cached in
   * `baked/`, so a reload rebuilds all of it exactly, in the boot time the
   * console already reports. A lost context costs a reload instead of a
   * seamless restore, and that is the whole price of the 103 MB.
   *
   * Not under `?shoot=1`. That page is a determinism gate driven by the capture
   * daemon over CDP, and a navigation it did not ask for destroys the execution
   * context of whatever `page.evaluate` is in flight — which reads as a crash
   * and is not one. There it logs, loudly, and `uxcheck` asserts on page errors.
   */
  _wireContextLoss() {
    const el = this.renderer.domElement;
    el.addEventListener('webglcontextlost', () => {
      console.warn('[Renderer] WebGL context lost — waiting for the browser to restore it');
    });
    el.addEventListener('webglcontextrestored', () => {
      if (new URLSearchParams(location.search).has('shoot')) {
        console.error('[Renderer] WebGL context restored under ?shoot=1: generated texels were'
          + ' freed after upload, so this page now draws empty maps. Reload it.');
        return;
      }
      this._reloadIntoSession();
    });
  }

  /**
   * Reload, but survivably.
   *
   * Keeping the texels resident is not the alternative: `TextureGen` measures
   * them at 103.0 MB over 221 `DataTexture`s, which is most of a phone tab's
   * whole budget. So the reload stays, and the three things that made it hurt
   * go away.
   *
   * **Never while hidden.** Backgrounding a tab is the ordinary way a phone
   * loses its context, and reloading a page nobody is looking at throws the
   * boot away and does it again when they come back. Deferred to the next
   * `visibilitychange`, which is the moment the reload is actually wanted.
   *
   * **Back into the session, not to the title.** `onContextRestored` is set by
   * `StorySystem`, which saves and returns a search string carrying `continue`
   * plus whatever `q`/`demo`/`touch` this page was running — `RpgSystem.init`
   * already honours `?continue`. `Renderer` never learns what `RpgSystem` is.
   *
   * **Never in a loop.** A `sessionStorage` counter survives the reload; on
   * the third restore it logs and stays up rather than cycling forever on a
   * device that cannot hold a context at all.
   */
  _reloadIntoSession() {
    const KEY = 'ffxv:ctxlost';
    let n = 0;
    try { n = Number(sessionStorage.getItem(KEY) || 0) + 1; sessionStorage.setItem(KEY, String(n)); } catch { n = 1; }
    if (n >= 3) {
      console.error(`[Renderer] WebGL context restored ${n} times this session —`
        + ' staying up rather than reloading again. The page will draw empty maps.');
      return;
    }
    const go = () => {
      const search = this.onContextRestored ? this.onContextRestored() : null;
      console.warn('[Renderer] WebGL context restored — reloading, because the CPU copies of the'
        + ' generated textures were freed after upload and cannot be re-uploaded');
      this._navigate(search);
    };
    if (typeof document !== 'undefined' && document.hidden) {
      document.addEventListener('visibilitychange', function once() {
        if (document.hidden) return;
        document.removeEventListener('visibilitychange', once);
        go();
      });
      return;
    }
    go();
  }

  /**
   * The one line that actually navigates. A method rather than an inline
   * `location.reload()` so `_probe/ctxloss.mts` can exercise the deferral and
   * the loop guard without the page navigating out from under the probe --
   * `location.reload` is not assignable, so there is no way to stub it from
   * outside.
   */
  _navigate(search: string | null) {
    if (search != null) location.search = search;
    else location.reload();
  }

  get domElement() { return this.renderer.domElement; }
  get width() { return this.container.clientWidth; }
  get height() { return this.container.clientHeight; }

  /**
   * Change the quality tier at runtime. PostFX has a matching `setQuality`
   * for the post chain; call both.
   */
  setQuality(tier: QualityTier) {
    this.quality = tier;
    this._applyTier(tier);
    this.resize();
  }

  /**
   * The two renderer-level settings a tier owns: how many pixels we draw, and
   * whether we draw shadow maps at all.
   *
   * Extracted because the constructor and `setQuality` used to disagree, and
   * the constructor was the one that mattered for a phone. It hard-coded
   * `shadowMap.enabled = true` and a `ultra ? 2 : 1.5` pixel-ratio cap, so a
   * page that booted at `low` — which is what a phone now does — got shadows
   * on and dpr 1.5 anyway, and only picked the tier up if the player later
   * walked into the settings screen and changed it. Those two are the largest
   * wins the tier has on a handset, and both were dead on the boot path.
   *
   * Deliberately does not call `resize()`: the constructor runs this before
   * the camera exists.
   */
  _applyTier(tier: QualityTier) {
    // `low` caps at 1.0 on a desktop. On a phone that is a 3x panel and 1.0 is
    // already a third of the screen's linear resolution, which reads as blocky
    // rather than as soft -- so the demo gets 1.35, still well under native and
    // enough that edges stop looking like a different console generation.
    const cap = tier === 'ultra' ? 2 : tier === 'low' ? (demoActive() ? 1.35 : 1) : 1.5;
    // `renderScale` is 1 everywhere but the phone demo, where it is the
    // largest GPU lever in the build: 0.62 fills 38% of the pixels. It
    // multiplies the tier cap rather than replacing it, so `?q=` still means
    // what it always did and no harness page is touched.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, cap) * renderScale());
    this.renderer.shadowMap.enabled = tier !== 'low';
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.onResize) this.onResize(w, h);
  }
}
