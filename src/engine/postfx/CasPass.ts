import * as THREE from 'three';
import { FilterPass, fsMaterial } from './Fx.ts';
import { CHUNK_HASH, CHUNK_DEPTH } from '../../shaders/post/common.ts';
import type { PostFX } from '../PostFX.ts';

/**
 * Final output: AMD-style contrast adaptive sharpening plus an ordered dither
 * that removes the 8-bit banding from sky gradients. Runs in display space on
 * an already-graded image, so it never amplifies HDR fireflies.
 *
 * ## Why the sharpness is spatially varying
 *
 * CAS is the last thing in the chain, and on foliage it undoes the pass before
 * it. `project/archive/handoff/alpha-edges.md` measured it: with the scene
 * target multisampled and `alphaToCoverage` resolving leaf boundaries into
 * partial coverage, switching CAS on **doubles** the apparent edge-pixel count
 * and multiplies the isolated-texel speckle several times over. It re-hardens
 * exactly the pixels the coverage resolve just spent bandwidth softening.
 *
 * **Turning the constant down is a measured negative and is not the lever.**
 * The same handoff banded four shots with and without the pass: CAS is a
 * `d1`/`d2` generator and nothing else, so its benefit — the roof edge, the
 * path stones, the shrub silhouette — lives in the *same octave* as its cost.
 * A global reduction buys a clean treeline by softening every roofline in the
 * game, and the agent that measured it looked at `hero_full` at 4x and stopped.
 *
 * So the lever has to be spatial, and the input is the one thing that can tell
 * a roofline from a canopy: `fx.rtScene.depthTexture`, already bound by four
 * other passes.
 *
 * ## What the mask actually asks
 *
 * Not "is there a depth discontinuity here" — a roofline against the sky is the
 * largest discontinuity in the frame and it is the thing we want to keep sharp.
 * The question is **"does this neighbourhood contain more than one surface"**,
 * because that is the case the sharpen cannot help: where a pixel is a blend of
 * a leaf and the sky behind it, there is no local contrast to recover and all
 * the filter can do is re-quantise the coverage the resolve just produced.
 *
 * The test is **total variation against range**, along a seven-tap line on each
 * axis. Walk the line and sum the absolute steps; compare that to the spread
 * between the largest and smallest depth on it.
 *
 * - A smooth surface at *any* angle, including a ground plane at a grazing
 *   angle where depth ramps hard down the frame, is monotone: the steps add up
 *   to exactly the range, ratio **1**.
 * - A single step edge — roofline, cliff lip, character silhouette, the near
 *   edge of a stone — is also monotone. Ratio **1**. It keeps all its sharpen,
 *   and that is the whole reason this is a mask rather than a smaller constant.
 * - One leaf against the sky, or one gap of sky inside a crown, doubles back:
 *   ratio **2**. Canopy, where every pixel is a different card at a different
 *   depth, runs **2–4**.
 *
 * The ratio is scale-free, which is what makes one threshold work at 15 m and
 * at 400 m — a crown 8 m deep at 400 m is a 2% depth variation and no absolute
 * threshold covers both ends. A second term gates on the range itself being a
 * real variation rather than depth-buffer quantisation, which at 2 km is
 * metres.
 *
 * `?post=nocasmask` pins the mask off and reproduces the pre-change frame
 * exactly; `?post=casmask` renders the mask itself instead of the image.
 */
export class CasPass extends FilterPass {
  dither!: number;
  override material!: THREE.ShaderMaterial;
  sharpness!: number;
  /**
   * How much of the sharpen to remove where the depth mask says "more than one
   * surface in this neighbourhood". 1 = none of it survives there, 0 = the
   * pass behaves exactly as it did before the mask existed.
   */
  edgeSoft!: number;
  constructor(fx: PostFX) {
    super(fx);
    this.sharpness = 0.42;
    this.dither = 1.0;
    this.edgeSoft = 0.9;
    this.material = fsMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uSharpness: { value: 0.42 },
        uDither: { value: 1.0 },
        uEdgeSoft: { value: 0.9 },
        uNear: { value: 0.15 },
        uFar: { value: 6000 },
        uShowMask: { value: 0 },
      },
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D tDiffuse, tDepth;
        uniform vec2 uTexel;
        uniform float uSharpness, uDither, uEdgeSoft, uNear, uFar, uShowMask;
        varying vec2 vUv;
        ${CHUNK_HASH}
        ${CHUNK_DEPTH}

        float vz(vec2 uv) { return viewDepth(texture2D(tDepth, uv).x, uNear, uFar); }

        /**
         * How many surfaces this five-tap line crosses, as total variation
         * over range. 1 = monotone (a plane, or a single step edge). 2 = the
         * line doubles back once, which is a sliver or a gap. Gated on the
         * range being a real depth variation and not quantisation.
         */
        float multiSurface(vec2 uv, vec2 s1, float zc) {
          float a = vz(uv - 3.0 * s1), b = vz(uv - 2.0 * s1), c = vz(uv - s1);
          float d = vz(uv + s1), e2 = vz(uv + 2.0 * s1), f = vz(uv + 3.0 * s1);
          float tv = abs(b - a) + abs(c - b) + abs(zc - c)
                   + abs(d - zc) + abs(e2 - d) + abs(f - e2);
          float hi = max(max(max(a, b), max(c, zc)), max(d, max(e2, f)));
          float lo = min(min(min(a, b), min(c, zc)), min(d, min(e2, f)));
          float rng = hi - lo;
          float ratio = tv / max(rng, 1e-4);
          return smoothstep(1.20, 1.90, ratio) * smoothstep(0.003, 0.010, rng / max(zc, 1.0));
        }

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

          float zc = vz(vUv);
          float thin = max(multiSurface(vUv, vec2(uTexel.x, 0.0), zc),
                           multiSurface(vUv, vec2(0.0, uTexel.y), zc));
          float local = 1.0 - uEdgeSoft * thin;

          res = mix(e, res, local * step(0.001, uSharpness));

          float dth = (hash12(gl_FragCoord.xy) - 0.5) * (uDither / 255.0);
          vec3 outc = max(res + dth, vec3(0.0));
          gl_FragColor = vec4(mix(outc, vec3(thin), uShowMask), 1.0);
        }
      `,
    });
  }

  override setSize(w: number, h: number) { this.material.uniforms.uTexel.value.set(1 / w, 1 / h); }

  override beforeRender() {
    const u = this.material.uniforms;
    u.uSharpness.value = this.sharpness;
    u.uDither.value = this.dither;
    u.uEdgeSoft.value = this.edgeSoft;
    u.tDepth.value = this.fx.rtScene.depthTexture;
    u.uNear.value = this.fx.rnd.camera.near;
    u.uFar.value = this.fx.rnd.camera.far;
  }
}
