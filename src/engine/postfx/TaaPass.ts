import * as THREE from 'three';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { makeRT, fsMaterial, blit } from './Fx.ts';
import { CHUNK_COLOR, CHUNK_DEPTH, CHUNK_BICUBIC } from '../../shaders/post/common.ts';

/**
 * Temporal anti-aliasing.
 *
 * The scene is rendered with a Halton-jittered projection; this pass reprojects
 * last frame's resolve through the motion vectors (object velocity where the
 * velocity pass wrote one, camera reprojection from depth everywhere else),
 * clips the history to the current 3x3 neighbourhood in YCoCg to kill ghosting,
 * and blends. History is sampled with a Catmull-Rom kernel so repeated
 * resampling does not turn the image to mush.
 */
export class TaaPass extends Pass {
  _reset!: boolean;
  clampScale!: number;
  copy!: THREE.ShaderMaterial;
  feedbackMax!: number;
  feedbackMin!: number;
  fx!: any;
  history!: any;
  material!: THREE.ShaderMaterial;
  ping!: number;
  constructor(fx: any, w: any, h: any) {
    super();
    this.fx = fx;
    this.needsSwap = true;
    this.enabled = true;
    this.feedbackMin = 0.86;   // history weight when still
    this.feedbackMax = 0.97;
    this.clampScale = 1.25;
    this._reset = true;
    this.ping = 0;

    this.history = [makeRT(w, h), makeRT(w, h)];

    this.material = fsMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tHistory: { value: null },
        tVelocity: { value: null },
        tDepth: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uResolution: { value: new THREE.Vector2() },
        uInvViewProj: { value: new THREE.Matrix4() },
        uPrevViewProj: { value: new THREE.Matrix4() },
        uNear: { value: 0.15 },
        uFar: { value: 6000 },
        uFeedback: { value: new THREE.Vector2(0.86, 0.97) },
        uClamp: { value: 1.25 },
        uReset: { value: 1 },
        uJitter: { value: new THREE.Vector2() },
      },
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D tDiffuse, tHistory, tVelocity, tDepth;
        uniform vec2 uTexel, uResolution, uFeedback, uJitter;
        uniform mat4 uInvViewProj, uPrevViewProj;
        uniform float uNear, uFar, uClamp, uReset;
        varying vec2 vUv;
        ${CHUNK_COLOR}
        ${CHUNK_DEPTH}
        ${CHUNK_BICUBIC}

        vec3 clipToAABB(vec3 c, vec3 h, vec3 minC, vec3 maxC) {
          vec3 center = 0.5 * (maxC + minC);
          vec3 extent = 0.5 * (maxC - minC) + 1e-5;
          vec3 v = h - center;
          vec3 unit = v / extent;
          vec3 a = abs(unit);
          float ma = max(a.x, max(a.y, a.z));
          return ma > 1.0 ? center + v / ma : h;
        }

        void main() {
          vec3 cur = max(texture2D(tDiffuse, vUv).rgb, vec3(0.0));

          // dilate the motion lookup toward the closest surface in a 3x3
          vec2 bestUv = vUv;
          float bestD = 1.0;
          for (int i = 0; i < 5; i++) {
            vec2 o = i == 0 ? vec2(0.0)
                   : i == 1 ? vec2(-1.0, -1.0)
                   : i == 2 ? vec2( 1.0, -1.0)
                   : i == 3 ? vec2(-1.0,  1.0)
                   :          vec2( 1.0,  1.0);
            vec2 uv = vUv + o * uTexel;
            float d = texture2D(tDepth, uv).x;
            if (d < bestD) { bestD = d; bestUv = uv; }
          }

          // undo the sub-pixel jitter: history lives in pixel-centre space
          vec2 bestU = bestUv - uJitter;
          vec4 vel = texture2D(tVelocity, bestUv);
          vec2 motion;
          if (vel.a > 0.5) {
            motion = vel.rg;
          } else {
            vec3 world = worldFromDepth(bestU, bestD, uInvViewProj);
            vec4 p = uPrevViewProj * vec4(world, 1.0);
            vec2 pu = (p.xy / max(abs(p.w), 1e-6) * sign(p.w)) * 0.5 + 0.5;
            motion = bestU - pu;
          }

          // history bins live at pixel centres, so only the content motion
          // displaces the lookup - never the jitter itself
          vec2 prevUv = vUv - motion;
          bool valid = prevUv.x > 0.0 && prevUv.x < 1.0 && prevUv.y > 0.0 && prevUv.y < 1.0 && uReset < 0.5;
          if (!valid) { gl_FragColor = vec4(cur, 1.0); return; }

          // neighbourhood statistics in YCoCg (variance clipping)
          vec3 m1 = vec3(0.0), m2 = vec3(0.0);
          vec3 nmin = vec3(1e9), nmax = vec3(-1e9);
          for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
              vec3 s = rgb2ycocg(max(texture2D(tDiffuse, vUv + vec2(float(x), float(y)) * uTexel).rgb, vec3(0.0)));
              m1 += s; m2 += s * s;
              nmin = min(nmin, s); nmax = max(nmax, s);
            }
          }
          vec3 mean = m1 / 9.0;
          vec3 sigma = sqrt(max(vec3(0.0), m2 / 9.0 - mean * mean));
          vec3 lo = max(mean - uClamp * sigma, nmin);
          vec3 hi = min(mean + uClamp * sigma, nmax);

          vec3 hist = max(sampleCatmullRom(tHistory, prevUv, uResolution).rgb, vec3(0.0));
          vec3 histY = rgb2ycocg(hist);
          vec3 clipped = ycocg2rgb(clipToAABB(rgb2ycocg(cur), histY, lo, hi));

          // more of the current frame when things move fast
          float speed = length(motion * uResolution);
          float feedback = mix(uFeedback.y, uFeedback.x, clamp(speed / 24.0, 0.0, 1.0));

          // luminance weighting stops bright pixels from dominating the average
          float wc = 1.0 / (1.0 + luma(cur));
          float wh = 1.0 / (1.0 + luma(clipped));
          float a = (1.0 - feedback) * wc;
          float b = feedback * wh;
          vec3 outc = (cur * a + clipped * b) / max(a + b, 1e-5);

          gl_FragColor = vec4(outc, 1.0);
        }
      `,
    });

    this.copy = fsMaterial({
      uniforms: { tDiffuse: { value: null } },
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        void main() { gl_FragColor = texture2D(tDiffuse, vUv); }
      `,
    });
  }

  reset() { this._reset = true; }

  override setSize(w: any, h: any) {
    for (const rt of this.history) rt.setSize(w, h);
    this.material.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.material.uniforms.uResolution.value.set(w, h);
    this._reset = true;
  }

  override render(renderer: any, writeBuffer: any, readBuffer: any) {
    const fx = this.fx;
    const u = this.material.uniforms;
    const dst = 1 - this.ping;
    u.tDiffuse.value = readBuffer.texture;
    u.tHistory.value = this.history[this.ping].texture;
    u.tVelocity.value = fx.rtVel.texture;
    u.tDepth.value = fx.rtScene.depthTexture;
    u.uInvViewProj.value.copy(fx.invViewProj);
    u.uPrevViewProj.value.copy(fx.prevViewProj);
    u.uNear.value = fx.rnd.camera.near;
    u.uFar.value = fx.rnd.camera.far;
    u.uFeedback.value.set(this.feedbackMin, this.feedbackMax);
    u.uClamp.value = this.clampScale;
    u.uReset.value = this._reset ? 1 : 0;

    blit(renderer, this.material, this.history[dst]);
    this.ping = dst;
    this._reset = false;

    this.copy.uniforms.tDiffuse.value = this.history[dst].texture;
    blit(renderer, this.copy, this.renderToScreen ? null : writeBuffer);
  }

  override dispose() {
    for (const rt of this.history) rt.dispose();
    this.material.dispose();
    this.copy.dispose();
  }
}
