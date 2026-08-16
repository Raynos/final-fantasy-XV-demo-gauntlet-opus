import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { FS_VERT } from '../../shaders/post/common.js';

/**
 * Small utilities shared by every pass in the cinematic chain.
 */

/** HDR render target with sane post-processing defaults. */
export function makeRT(w, h, opts = {}) {
  const rt = new THREE.WebGLRenderTarget(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
    colorSpace: THREE.LinearSRGBColorSpace,
    ...opts,
  });
  rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
  return rt;
}

/** ShaderMaterial configured for fullscreen filtering (never touches depth). */
export function fsMaterial({ uniforms, fragmentShader, defines = {}, blending = THREE.NoBlending }) {
  return new THREE.ShaderMaterial({
    defines,
    uniforms,
    vertexShader: FS_VERT,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    blending,
    transparent: blending !== THREE.NoBlending,
    toneMapped: false,
  });
}

/** One reusable fullscreen triangle for the whole chain. */
export const quad = new FullScreenQuad(null);

/**
 * Render `material` over `target` (null = screen). Never clears depth so a
 * shared depth attachment survives the whole frame.
 */
export function blit(renderer, material, target) {
  const prevAutoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.setRenderTarget(target || null);
  quad.material = material;
  quad.render(renderer);
  renderer.autoClear = prevAutoClear;
}

/**
 * Base class for a colour-chain filter: reads the composer read buffer, writes
 * the write buffer. Subclasses build `this.material` and may override
 * `beforeRender()`.
 */
export class FilterPass extends Pass {
  constructor(fx) {
    super();
    this.fx = fx;
    this.needsSwap = true;
    /** @type {THREE.ShaderMaterial} */
    this.material = null;
  }

  /** Shorthand so `pass.uniforms.x.value` works like a three ShaderPass. */
  get uniforms() { return this.material.uniforms; }

  render(renderer, writeBuffer, readBuffer) {
    if (this.material.uniforms.tDiffuse) this.material.uniforms.tDiffuse.value = readBuffer.texture;
    if (this.beforeRender) this.beforeRender(renderer, readBuffer);
    blit(renderer, this.material, this.renderToScreen ? null : writeBuffer);
  }

  dispose() { if (this.material) this.material.dispose(); }
}
