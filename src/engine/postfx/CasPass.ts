import * as THREE from 'three';
import { FilterPass, fsMaterial } from './Fx.ts';
import { CHUNK_HASH } from '../../shaders/post/common.ts';

/**
 * Final output: AMD-style contrast adaptive sharpening plus an ordered dither
 * that removes the 8-bit banding from sky gradients. Runs in display space on
 * an already-graded image, so it never amplifies HDR fireflies.
 */
export class CasPass extends FilterPass {
  dither!: number;
  override material!: THREE.ShaderMaterial;
  sharpness!: number;
  constructor(fx: any) {
    super(fx);
    this.sharpness = 0.42;
    this.dither = 1.0;
    this.material = fsMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uSharpness: { value: 0.42 },
        uDither: { value: 1.0 },
      },
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D tDiffuse;
        uniform vec2 uTexel;
        uniform float uSharpness, uDither;
        varying vec2 vUv;
        ${CHUNK_HASH}
        void main() {
          vec3 e = texture2D(tDiffuse, vUv).rgb;
          vec3 b = texture2D(tDiffuse, vUv + vec2(0.0, -uTexel.y)).rgb;
          vec3 d = texture2D(tDiffuse, vUv + vec2(-uTexel.x, 0.0)).rgb;
          vec3 f = texture2D(tDiffuse, vUv + vec2( uTexel.x, 0.0)).rgb;
          vec3 h = texture2D(tDiffuse, vUv + vec2(0.0,  uTexel.y)).rgb;

          vec3 mn = min(min(min(d, e), min(f, b)), h);
          vec3 mx = max(max(max(d, e), max(f, b)), h);
          vec3 amp = clamp(min(mn, 2.0 - mx) / max(mx, vec3(1e-4)), 0.0, 1.0);
          amp = sqrt(amp);
          float peak = -1.0 / mix(9.0, 5.5, clamp(uSharpness, 0.0, 1.0));
          vec3 w = amp * peak;
          vec3 res = (b * w + d * w + f * w + h * w + e) / (1.0 + 4.0 * w);

          // keep the sharpen from ringing: never leave the local range
          res = clamp(res, mn - 0.06, mx + 0.06);
          res = mix(e, res, step(0.001, uSharpness));

          float dth = (hash12(gl_FragCoord.xy) - 0.5) * (uDither / 255.0);
          gl_FragColor = vec4(max(res + dth, vec3(0.0)), 1.0);
        }
      `,
    });
  }

  override setSize(w: number, h: number) { this.material.uniforms.uTexel.value.set(1 / w, 1 / h); }

  override beforeRender() {
    this.material.uniforms.uSharpness.value = this.sharpness;
    this.material.uniforms.uDither.value = this.dither;
  }
}
