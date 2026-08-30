import * as THREE from 'three';
import { FilterPass, fsMaterial } from './Fx.ts';
import { CHUNK_COLOR, CHUNK_DEPTH, CHUNK_HASH } from '../../shaders/post/common.ts';
import type { PostFX } from '../PostFX.ts';

/**
 * Cheap screen-space reflections for wet ground, water and car paint.
 *
 * There is no G-buffer in this pipeline, so the surface normal is rebuilt from
 * depth derivatives and reflections are gated to near-horizontal surfaces below
 * `maxHeight` — which is exactly the wet-ground / water / hood case and costs
 * nothing anywhere else. Disabled by default; the water system turns it on.
 *
 *   game.post.ssr.enabled = true;
 *   game.post.ssr.maxHeight = 2.0;   // world Y below which surfaces reflect
 */
export class SsrPass extends FilterPass {
  override fx!: PostFX;
  intensity!: number;
  override material!: THREE.ShaderMaterial;
  maxDistance!: number;
  maxHeight!: number;
  roughness!: number;
  constructor(fx: PostFX) {
    super(fx);
    this.enabled = false;
    this.intensity = 0.55;
    this.maxHeight = 1.5;
    this.roughness = 0.06;
    this.maxDistance = 60;

    this.material = fsMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uInvViewProj: { value: new THREE.Matrix4() },
        uViewProj: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() },
        uNear: { value: 0.15 },
        uFar: { value: 6000 },
        uIntensity: { value: 0.55 },
        uMaxHeight: { value: 1.5 },
        uRoughness: { value: 0.12 },
        uMaxDistance: { value: 60 },
      },
      defines: { SSR_STEPS: 28 },
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D tDiffuse, tDepth;
        uniform vec2 uTexel;
        uniform mat4 uInvViewProj, uViewProj;
        uniform vec3 uCamPos;
        uniform float uNear, uFar, uIntensity, uMaxHeight, uRoughness, uMaxDistance;
        varying vec2 vUv;
        ${CHUNK_COLOR}
        ${CHUNK_DEPTH}
        ${CHUNK_HASH}

        vec3 worldAt(vec2 uv) {
          float d = texture2D(tDepth, uv).x;
          return worldFromDepth(uv, d, uInvViewProj);
        }

        void main() {
          vec3 src = texture2D(tDiffuse, vUv).rgb;
          float d = texture2D(tDepth, vUv).x;
          if (d >= 0.9999) { gl_FragColor = vec4(src, 1.0); return; }

          vec3 P = worldFromDepth(vUv, d, uInvViewProj);
          if (P.y > uMaxHeight) { gl_FragColor = vec4(src, 1.0); return; }

          vec3 dx = worldAt(vUv + vec2(uTexel.x, 0.0)) - P;
          vec3 dy = worldAt(vUv + vec2(0.0, uTexel.y)) - P;
          /**
           * The degenerate-derivative guard, and it has to come BEFORE the
           * normalize.
           *
           * dx and dy are world-space deltas reconstructed from a depth
           * texture. On a depth plateau, on a silhouette where both neighbours
           * land on the same surface, and at any range where two adjacent texels
           * resolve to one world point, they are parallel or zero -- and
           * normalize(cross(dy, dx)) is then 0/0.
           *
           * The two tests that follow do NOT catch that: N.y < 0.0 and
           * N.y < 0.86 are both FALSE for a NaN, so the pass fell straight
           * through and marched a reflection ray built from a NaN normal. In a
           * post pass that does not stay local -- a NaN written here survives
           * the rest of the composer and lands on the canvas as a hole of pure
           * black. project/LANDMINES.md: it is invisible to every gate, since
           * it is not a page error, not a draw-count change, and against a
           * baseline carrying the same hole not even a pixel diff.
           *
           * The test is on sin^2 of the angle between the deltas rather than
           * on |cross|, because the deltas scale with distance: one texel is
           * a millimetre of world at arm's length and metres of it at the far
           * plane, so an absolute floor would either miss the degenerate case up
           * close or delete the pass in the distance. dot(n,n) / (|dx|^2|dy|^2)
           * is exactly sin^2, and is scale-free.
           *
           * Bailing writes src unchanged, which is what this pass already does
           * for every pixel that does not qualify -- so the failure mode of the
           * guard is "no reflection here", never "wrong reflection here".
           *
           * Found by src/tools/nansweep.mts; see project/TASKS.md.
           */
          vec3 nRaw = cross(dy, dx);
          float nLen2 = dot(nRaw, nRaw);
          float dScale2 = dot(dx, dx) * dot(dy, dy);
          if (!(nLen2 > 1e-8 * dScale2)) { gl_FragColor = vec4(src, 1.0); return; }
          vec3 N = nRaw * inversesqrt(nLen2);
          if (N.y < 0.0) N = -N;
          if (N.y < 0.86) { gl_FragColor = vec4(src, 1.0); return; }

          vec3 V = normalize(P - uCamPos);
          vec3 R = reflect(V, N);
          R = normalize(R + (hash22(gl_FragCoord.xy).xyy - 0.5) * uRoughness);
          if (R.y < 0.02) { gl_FragColor = vec4(src, 1.0); return; }

          float stepLen = uMaxDistance / float(SSR_STEPS);
          vec3 pos = P + N * 0.05;
          vec3 hit = vec3(0.0);
          float found = 0.0;
          float jitter = hash12(gl_FragCoord.xy);

          for (int i = 0; i < SSR_STEPS; i++) {
            pos += R * stepLen * (1.0 + float(i) * 0.16);
            vec4 clip = uViewProj * vec4(pos, 1.0);
            if (clip.w <= 0.0) break;
            vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
            if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
            float sceneD = texture2D(tDepth, uv).x;
            float sceneZ = viewDepth(sceneD, uNear, uFar);
            float rayZ = viewDepth(clip.z / clip.w * 0.5 + 0.5, uNear, uFar);
            float diff = rayZ - sceneZ;
            if (diff > 0.02 && diff < stepLen * 3.0) {
              hit = texture2D(tDiffuse, uv).rgb;
              // fade at the screen edges so reflections do not pop
              vec2 e = smoothstep(vec2(0.0), vec2(0.12), uv) * smoothstep(vec2(0.0), vec2(0.12), 1.0 - uv);
              found = e.x * e.y;
              break;
            }
          }

          float fres = pow(1.0 - clamp(dot(-V, N), 0.0, 1.0), 4.0);
          float w = found * uIntensity * mix(0.25, 1.0, fres);
          gl_FragColor = vec4(mix(src, hit, clamp(w, 0.0, 1.0)), 1.0);
        }
      `,
    });
  }

  override setSize(w: number, h: number) { this.material.uniforms.uTexel.value.set(1 / w, 1 / h); }

  override beforeRender() {
    const fx = this.fx, u = this.material.uniforms;
    u.tDepth.value = fx.rtScene.depthTexture;
    u.uInvViewProj.value.copy(fx.invViewProj);
    u.uViewProj.value.copy(fx.viewProj);
    u.uCamPos.value.setFromMatrixPosition(fx.rnd.camera.matrixWorld);
    u.uNear.value = fx.rnd.camera.near;
    u.uFar.value = fx.rnd.camera.far;
    u.uIntensity.value = this.intensity;
    u.uMaxHeight.value = this.maxHeight;
    u.uRoughness.value = this.roughness;
    u.uMaxDistance.value = this.maxDistance;
  }
}
