import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { FS_VERT } from '../../shaders/post/common.ts';
import type { PostFX } from '../PostFX.ts';

/** What `fsMaterial()` needs to build a fullscreen filter material. */
export interface FsMaterialSpec {
  uniforms: Record<string, THREE.IUniform>;
  fragmentShader: string;
  defines?: Record<string, unknown>;
  blending?: THREE.Blending;
}

/**
 * Small utilities shared by every pass in the cinematic chain.
 */

/** HDR render target with sane post-processing defaults. */
export function makeRT(w: number, h: number, opts = {}) {
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
export function fsMaterial({ uniforms, fragmentShader, defines = {}, blending = THREE.NoBlending }: FsMaterialSpec) {
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
export const quad = new FullScreenQuad(null as unknown as THREE.Material);

/**
 * Render `material` over `target` (null = screen). Never clears depth so a
 * shared depth attachment survives the whole frame.
 *
 * The colour buffer *is* cleared first, unless the material blends. That looks
 * redundant — a fullscreen triangle overwrites every pixel anyway — but it is
 * worth around a millisecond per pass on a tile-based GPU. Without the clear
 * the driver has to assume the pass reads what was already in the attachment,
 * so it faults the whole render target back into tile memory before drawing;
 * with it, the load is skipped. At two dozen fullscreen passes a frame that is
 * most of the post chain's fixed overhead.
 *
 * @param [opts] force the clear on or off
 */
export function blit(renderer: THREE.WebGLRenderer, material: THREE.Material, target: THREE.WebGLRenderTarget | null, opts?: {clear?:boolean}) {
  const clear = opts && opts.clear !== undefined
    ? opts.clear
    : material.blending === THREE.NoBlending;
  const prevAutoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.setRenderTarget(target || null);
  if (clear) renderer.clear(true, false, false);
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
  /** The chain that owns this pass; passes reach back for shared buffers. */
  fx!: PostFX;
  /** Built by the subclass constructor, so it is null for one statement. */
  material!: THREE.ShaderMaterial;

  /** Subclass hook, run after `tDiffuse` is bound and before the blit. */
  beforeRender?(renderer: THREE.WebGLRenderer, readBuffer: THREE.WebGLRenderTarget): void;
  constructor(fx: PostFX) {
    super();
    this.fx = fx;
    this.needsSwap = true;
  }

  /** Shorthand so `pass.uniforms.x.value` works like a three ShaderPass. */
  get uniforms() { return this.material.uniforms; }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    if (this.material.uniforms.tDiffuse) this.material.uniforms.tDiffuse.value = readBuffer.texture;
    if (this.beforeRender) this.beforeRender(renderer, readBuffer);
    blit(renderer, this.material, this.renderToScreen ? null : writeBuffer);
  }

  override dispose() { if (this.material) this.material.dispose(); }
}
