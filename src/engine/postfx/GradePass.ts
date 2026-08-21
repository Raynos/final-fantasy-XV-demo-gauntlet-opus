import * as THREE from 'three';
import { FilterPass, fsMaterial } from './Fx.ts';
import { CHUNK_COLOR, CHUNK_TONEMAP, CHUNK_LUT, CHUNK_HASH } from '../../shaders/post/common.ts';

/**
 * The grade: a real film pipeline rather than a pile of tweaks.
 *
 *   exposure trim -> white balance -> lift/gain -> log-space contrast ->
 *   channel mixer -> saturation -> lens vignette -> ACES tone map ->
 *   3D LUT (two slots, cross-faded) -> grain -> sRGB
 *
 * Everything up to the tone map happens in scene-linear; the LUT is a
 * procedurally baked 32^3 print emulation applied in display space.
 */
export class GradePass extends FilterPass {
  override material!: any;
  constructor(fx: any) {
    super(fx);
    this.material = fsMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tLutA: { value: null },
        tLutB: { value: null },
        uLutMix: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTime: { value: 0 },
        uVignette: { value: 0.42 },
        uGrain: { value: 0.024 },
        uChroma: { value: 0.9 },
        uSaturation: { value: 1.04 },
        uContrast: { value: 1.06 },
        uLift: { value: new THREE.Vector3(0.0, 0.0, 0.006) },
        uGain: { value: new THREE.Vector3(1.0, 1.0, 1.0) },
        uExposure: { value: 1.0 },
        uBalance: { value: new THREE.Vector2(0.06, 0.0) },
        uLutAmount: { value: 1.0 },
      },
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D tDiffuse, tLutA, tLutB;
        uniform vec2 uResolution, uBalance;
        uniform float uTime, uVignette, uGrain, uChroma, uSaturation, uContrast;
        uniform float uExposure, uLutMix, uLutAmount;
        uniform vec3 uLift, uGain;
        varying vec2 vUv;
        ${CHUNK_COLOR}
        ${CHUNK_TONEMAP}
        ${CHUNK_LUT}
        ${CHUNK_HASH}

        vec3 whiteBalance(vec3 c, float temp, float tint) {
          vec3 g = vec3(1.0 + temp * 0.24 + tint * 0.02,
                        1.0 + tint * 0.16,
                        1.0 - temp * 0.26 + tint * 0.02);
          // renormalise so the exposure does not drift with the balance
          float n = dot(g, vec3(0.2126, 0.7152, 0.0722));
          return c * (g / max(n, 1e-4));
        }

        void main() {
          vec2 uv = vUv;
          vec2 c = uv - 0.5;
          float r2 = dot(c, c);

          // lateral chromatic aberration, zero in the centre
          vec3 col;
          float ca = uChroma * 0.0018 * r2;
          if (ca > 1e-6) {
            col.r = texture2D(tDiffuse, uv + c * ca).r;
            col.g = texture2D(tDiffuse, uv).g;
            col.b = texture2D(tDiffuse, uv - c * ca).b;
          } else {
            col = texture2D(tDiffuse, uv).rgb;
          }
          col = max(col, vec3(0.0));

          col *= uExposure;
          col = whiteBalance(col, uBalance.x, uBalance.y);
          col = col * uGain + uLift;

          // contrast about scene-linear mid grey, in log space (filmic)
          vec3 lg = log2(max(col, vec3(1e-5)));
          lg = (lg - log2(0.18)) * uContrast + log2(0.18);
          col = exp2(lg);

          float l = luma(col);
          col = max(vec3(0.0), mix(vec3(l), col, uSaturation));

          // lens falloff: natural cos^4-ish, applied as light not as paint
          float v = 1.0 - uVignette * 0.9 * pow(clamp(r2 * 2.0, 0.0, 1.0), 1.35);
          col *= clamp(v, 0.0, 1.0);

          vec3 tm = tonemapACES(col);
          vec3 disp = linearToSrgb(tm);

          vec3 graded = mix(sampleLut(tLutA, disp), sampleLut(tLutB, disp), uLutMix);
          disp = mix(disp, graded, uLutAmount);

          // film grain: finer in the highlights, coarse in the shadows
          float g = hash12(gl_FragCoord.xy + fract(uTime) * 719.7) - 0.5;
          float gl2 = luma(disp);
          disp += g * uGrain * (0.35 + 0.85 * (1.0 - smoothstep(0.0, 0.75, gl2)));

          // Temporal dither with a hard floor of ~1.5 LSB. The deep blue
          // gradients of a night sky are exactly the case where 8 bits runs
          // out, and grain alone is scaled per preset so it cannot be relied
          // on to cover it. Decorrelated from the grain hash on purpose.
          float d8 = hash12(gl_FragCoord.yx * 1.7 + fract(uTime * 0.37) * 311.3) - 0.5;
          disp += d8 * (1.5 / 255.0);

          gl_FragColor = vec4(max(disp, vec3(0.0)), 1.0);
        }
      `,
    });
  }

  override setSize(w: any, h: any) { this.material.uniforms.uResolution.value.set(w, h); }
}
