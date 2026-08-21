import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { fsMaterial, blit } from './Fx.ts';

/**
 * Renders the scene into the pipeline's own HDR + depth target (so every later
 * pass has a depth texture that nothing can clobber), runs eye adaptation on
 * the result and blits it into the composer buffer with the adapted exposure
 * already applied. The exposure multiply is free — it rides the blit we need
 * anyway.
 */
export class ScenePass extends Pass {
  constructor(fx) {
    super();
    this.fx = fx;
    this.needsSwap = true;
    this.material = fsMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tExposure: { value: null },
        uCompensation: { value: 1.0 },
      },
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D tDiffuse, tExposure;
        uniform float uCompensation;
        varying vec2 vUv;
        void main() {
          float e = texture2D(tExposure, vec2(0.5)).r * uCompensation;
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          gl_FragColor = vec4(max(c, vec3(0.0)) * e, 1.0);
        }
      `,
    });
  }

  render(renderer, writeBuffer) {
    const fx = this.fx;
    const { scene, camera } = fx.rnd;

    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = true;
    renderer.setRenderTarget(fx.rtScene);
    renderer.render(scene, camera);
    renderer.autoClear = prevAutoClear;

    fx.exposure.update(renderer, fx.rtScene.texture, fx.dt);

    this.material.uniforms.tDiffuse.value = fx.rtScene.texture;
    this.material.uniforms.tExposure.value = fx.exposure.enabled
      ? fx.exposure.texture : fx.oneTexture;
    this.material.uniforms.uCompensation.value =
      fx.exposure.compensation * renderer.toneMappingExposure;
    blit(renderer, this.material, this.renderToScreen ? null : writeBuffer);
  }
}
