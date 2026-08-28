import * as THREE from 'three';

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
  camera: THREE.PerspectiveCamera;
  container: HTMLElement;
  isWebGL2: boolean;
  quality: QualityTier;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  constructor(container: HTMLElement, opts: RendererOpts = {}) {
    this.container = container;

    const params = new URLSearchParams(location.search);
    // `?q=` and `opts.quality` are both untrusted strings, so an unrecognised
    // tier lands on `'high'` rather than being carried around as a tier name
    // that every `=== 'low'` test silently misses.
    const want = opts.quality || params.get('q') || 'high';
    this.quality = isQualityTier(want) ? want : 'high';

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

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality === 'ultra' ? 2 : 1.5));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // The scene is only ever rendered into HDR float targets, so three never
    // applies its own tone map — PostFX owns the whole display transform.
    // `toneMappingExposure` is still honoured: PostFX folds it into the
    // auto-exposure multiplier so existing code that pokes it keeps working.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
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
      console.warn('[Renderer] WebGL context restored — reloading, because the CPU copies of the'
        + ' generated textures were freed after upload and cannot be re-uploaded');
      location.reload();
    });
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
    const cap = tier === 'ultra' ? 2 : tier === 'low' ? 1 : 1.5;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, cap));
    this.renderer.shadowMap.enabled = tier !== 'low';
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.onResize) this.onResize(w, h);
  }
}
