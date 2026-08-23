import * as THREE from 'three';
import { FilterPass, fsMaterial } from './Fx.ts';
import { CHUNK_COLOR, CHUNK_TONEMAP, CHUNK_LUT, CHUNK_HASH } from '../../shaders/post/common.ts';
import type { PostFX } from '../PostFX.ts';

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
  override material!: THREE.ShaderMaterial;
  constructor(fx: PostFX) {
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
        // (knee, end, amount) — see `bleachHighlights` in the shader.
        uBleach: { value: new THREE.Vector3(1.0, 6.0, 0.0) },
      },
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D tDiffuse, tLutA, tLutB;
        uniform vec2 uResolution, uBalance;
        uniform float uTime, uVignette, uGrain, uChroma, uSaturation, uContrast;
        uniform float uExposure, uLutMix, uLutAmount;
        uniform vec3 uLift, uGain, uBleach;
        varying vec2 vUv;
        ${CHUNK_COLOR}
        ${CHUNK_TONEMAP}
        ${CHUNK_LUT}
        ${CHUNK_HASH}

        /**
         * Film bleach: hot pixels lose chroma before the tone map.
         *
         * Photographic highlights go white, not to their brightest primary.
         * Ours did the opposite, and it was measured rather than assumed: at
         * golden hour our highlight R-B read +52.0 against a +7.6 reference
         * median, and ablating the whole grade LUT (?post=nolut) still left
         * +39.2 of it. So three quarters of the cast was already in the HDR
         * buffer, and no display-referred tint could have reached it -- which
         * is why this runs in scene-linear before tonemapACES rather than in
         * the LUT.
         *
         * Bloom was ruled out the same way and points the other direction:
         * ?post=nobloom reads +68.6, so bloom is spreading white sun energy
         * and *cooling* the highlights. God rays and lens flare moved it under
         * four points each.
         *
         * b is (knee, end, amount) in scene-linear luminance. Below the knee
         * this is exactly identity, so mids and every shadow keep their chroma
         * untouched -- the desaturation is bought only where the sensor would
         * have run out of headroom anyway.
         */
        vec3 bleachHighlights(vec3 c, vec3 b) {
          if (b.z <= 0.0) return c;
          float y = luma(c);
          float t = smoothstep(b.x, max(b.y, b.x + 1e-3), y);
          return mix(c, vec3(y), t * b.z);
        }

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

          col = bleachHighlights(col, uBleach);

          vec3 tm = tonemapACES(col);
          vec3 disp = linearToSrgb(tm);

          vec3 graded = mix(sampleLut(tLutA, disp), sampleLut(tLutB, disp), uLutMix);
          disp = mix(disp, graded, uLutAmount);

          // Film grain, mid-weighted: 4*l*(1-l) peaks at mid grey and falls to
          // zero at both rails. Real film grain is densest in the mids because
          // that is where the most silver halide is developed; it is invisible
          // in a blown highlight and it is not what makes a shadow noisy.
          //
          // This was shadow-weighted, which put the most grain exactly where an
          // 8-bit night has the least headroom and where our night frames
          // already read hazy against the reference. The sibling repo measured
          // the extreme form of the same mistake -- shadow-weighted grain in
          // *linear* space swinging 28/255 near black. Ours is applied after
          // the sRGB encode, which is right and is kept.
          float g = hash12(gl_FragCoord.xy + fract(uTime) * 719.7) - 0.5;
          float gl2 = luma(disp);
          disp += g * uGrain * (4.0 * gl2 * (1.0 - gl2));

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

  override setSize(w: number, h: number) { this.material.uniforms.uResolution.value.set(w, h); }
}
