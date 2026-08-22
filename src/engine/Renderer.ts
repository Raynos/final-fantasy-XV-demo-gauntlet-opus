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
