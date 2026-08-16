import * as THREE from 'three';
import { FilterPass, fsMaterial } from './Fx.js';
import { CHUNK_COLOR, CHUNK_DEPTH, CHUNK_HASH } from '../../shaders/post/common.js';

/**
 * Velocity-buffer motion blur.
 *
 * Per-pixel motion comes from the object velocity buffer where something moved
 * and from depth reprojection everywhere else, so a fast pan streaks the world
 * while a warp-strike streaks only the character. Each pixel gathers along its
 * *own* motion vector with a depth-aware weight, which keeps a static
 * background sharp behind a moving object instead of smearing the whole frame.
 */
export class MotionBlurPass extends FilterPass {
  constructor(fx) {
    super(fx);
    this.enabled = true;
    this.shutter = 0.55;       // fraction of the frame the shutter is open
    this.maxRadius = 28.0;     // pixels
    this.samples = 13;

    this.material = fsMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tVelocity: { value: null },
        tDepth: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uResolution: { value: new THREE.Vector2() },
        uInvViewProj: { value: new THREE.Matrix4() },
        uPrevViewProj: { value: new THREE.Matrix4() },
        uNear: { value: 0.15 },
        uFar: { value: 6000 },
        uStrength: { value: 0.55 },
        uMaxRadius: { value: 28.0 },
        uJitter: { value: new THREE.Vector2() },
      },
      defines: { MB_SAMPLES: 13 },
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D tDiffuse, tVelocity, tDepth;
        uniform vec2 uTexel, uResolution, uJitter;
        uniform mat4 uInvViewProj, uPrevViewProj;
        uniform float uNear, uFar, uStrength, uMaxRadius;
        varying vec2 vUv;
        ${CHUNK_COLOR}
        ${CHUNK_DEPTH}
        ${CHUNK_HASH}

        vec2 motionAt(vec2 uv, out float depth) {
          float d = texture2D(tDepth, uv).x;
          depth = viewDepth(d, uNear, uFar);
          vec4 v = texture2D(tVelocity, uv);
          if (v.a > 0.5) return v.rg;
          vec2 uvU = uv - uJitter;
          // sky reprojects on the ray direction alone
          float dd = d >= 0.999999 ? 0.999 : d;
          vec3 world = worldFromDepth(uvU, dd, uInvViewProj);
          vec4 p = uPrevViewProj * vec4(world, 1.0);
          return uvU - ((p.xy / max(abs(p.w), 1e-6) * sign(p.w)) * 0.5 + 0.5);
        }

        void main() {
          float centerDepth;
          vec2 motion = motionAt(vUv, centerDepth) * uStrength;

          vec2 px = motion * uResolution;
          float len = length(px);
          if (len < 0.75) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
          if (len > uMaxRadius) motion *= uMaxRadius / len;

          float jitter = ign(gl_FragCoord.xy) - 0.5;
          vec3 sum = texture2D(tDiffuse, vUv).rgb;
          float wsum = 1.0;

          for (int i = 1; i < MB_SAMPLES; i++) {
            float t = (float(i) + jitter) / float(MB_SAMPLES - 1) - 0.5;  // -0.5..0.5
            vec2 uv = vUv + motion * t;
            if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) continue;

            float sd;
            vec2 sm = motionAt(uv, sd);
            // accept the tap if it is in front of us, or if it is itself moving
            float depthW = clamp(1.0 - (sd - centerDepth) / max(0.02 * centerDepth, 0.02), 0.0, 1.0);
            float motionW = clamp(length(sm * uResolution) / max(len, 1e-3), 0.0, 1.0);
            float w = max(depthW, motionW) * (1.0 - abs(t) * 0.7);

            sum += texture2D(tDiffuse, uv).rgb * w;
            wsum += w;
          }

          gl_FragColor = vec4(sum / max(wsum, 1e-4), 1.0);
        }
      `,
    });
  }

  setSize(w, h) {
    this.material.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.material.uniforms.uResolution.value.set(w, h);
  }

  beforeRender() {
    const fx = this.fx, u = this.material.uniforms;
    u.tVelocity.value = fx.rtVel.texture;
    u.tDepth.value = fx.rtScene.depthTexture;
    u.uInvViewProj.value.copy(fx.invViewProj);
    u.uPrevViewProj.value.copy(fx.prevViewProj);
    u.uNear.value = fx.rnd.camera.near;
    u.uFar.value = fx.rnd.camera.far;
    u.uStrength.value = this.shutter;
    u.uMaxRadius.value = this.maxRadius;
  }
}
