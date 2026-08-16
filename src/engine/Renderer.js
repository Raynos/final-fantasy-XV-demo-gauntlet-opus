import * as THREE from 'three';

/**
 * Owns the WebGL context, the main camera and global render settings.
 * Quality tiers let the screenshot harness force max settings while the
 * interactive session adapts to the machine.
 */
export class Renderer {
  constructor(container, opts = {}) {
    this.container = container;

    const params = new URLSearchParams(location.search);
    this.quality = opts.quality || params.get('q') || 'high';

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
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.onResize) this.onResize(w, h);
  }
}
