import * as THREE from 'three';
import { FilterPass, fsMaterial } from './Fx.ts';
import { CHUNK_COLOR, CHUNK_DEPTH, CHUNK_HASH } from '../../shaders/post/common.ts';
import type { PostFX } from '../PostFX.ts';

/**
 * Screen-space contact shadows — the last few centimetres a shadow map cannot
 * resolve.
 *
 * A cascaded sun shadow covering hundreds of metres has texels tens of
 * centimetres across near the character, and the depth bias needed to stop it
 * self-shadowing pushes the occluder off the ground by roughly the same
 * amount. The result is the single most reliable tell that a model was pasted
 * into a scene rather than standing in it: a boot with daylight under it. AO
 * does not fill the gap either — ambient occlusion darkens a cavity, but the
 * black wedge under a heel is *direct* light being blocked, and it has to be
 * the shape of the sun.
 *
 * So we ray-march the depth buffer toward the sun for a short distance (tens
 * of centimetres, not metres) and shadow anything the march runs into. It is
 * the same geometry the shadow map is trying to express, sampled at screen
 * resolution where it actually matters, and it costs one dependent texture
 * fetch per step with no extra scene pass.
 *
 *   post.contact.enabled / .intensity / .length / .thickness / .stepPx
 */
export class ContactShadowPass extends FilterPass {
  _lightDir!: THREE.Vector3;
  _lightTgt!: THREE.Vector3;
  bias!: number;
  override fx!: PostFX;
  intensity!: number;
  length!: number;
  override material!: THREE.ShaderMaterial;
  maxDistance!: number;
  /** Screen-space budget for one march step, in pixels. See the shader. */
  stepPx!: number;
  thickness!: number;
  tint!: THREE.Color;
  constructor(fx: PostFX) {
    super(fx);
    this.enabled = true;
    this.intensity = 0.85;      // 0..1 how black the contact goes
    this.length = 0.50;         // metres of ray marched toward the sun
    this.thickness = 0.45;      // assumed occluder depth (rejects far hits)
    this.bias = 0.030;          // metres, kills self-shadow acne
    this.maxDistance = 55;      // metres; contacts stop mattering past this
    this.stepPx = 6.0;          // pixels per step, ceiling — the crosshatch fix
    this.tint = new THREE.Color(0x2b3a52);   // cool shadow, never neutral grey
    this._lightDir = new THREE.Vector3(0.4, 0.8, 0.3);
    this._lightTgt = new THREE.Vector3();

    this.material = fsMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uInvViewProj: { value: new THREE.Matrix4() },
        uViewProj: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() },
        uLightDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) },
        uNear: { value: 0.15 },
        uFar: { value: 6000 },
        uParams: { value: new THREE.Vector4(0.50, 0.45, 0.03, 55) }, // len, thick, bias, maxDist
        uIntensity: { value: 0.85 },
        uTint: { value: new THREE.Vector3(0.17, 0.23, 0.32) },
        uFrame: { value: 0 },
        uStepPx: { value: 6.0 },
      },
      defines: { CS_STEPS: 12 },
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D tDiffuse, tDepth;
        uniform vec2 uTexel;
        uniform mat4 uInvViewProj, uViewProj;
        uniform vec3 uCamPos, uLightDir, uTint;
        uniform float uNear, uFar, uIntensity, uFrame, uStepPx;
        uniform vec4 uParams;
        varying vec2 vUv;
        ${CHUNK_COLOR}
        ${CHUNK_DEPTH}
        ${CHUNK_HASH}

        vec3 worldAt(vec2 uv) {
          return worldFromDepth(uv, texture2D(tDepth, uv).x, uInvViewProj);
        }

        void main() {
          vec3 src = texture2D(tDiffuse, vUv).rgb;
          float d = texture2D(tDepth, vUv).x;
          // sky: nothing in front of it to cast
          if (d >= 0.9999) { gl_FragColor = vec4(src, 1.0); return; }

          vec3 P = worldFromDepth(vUv, d, uInvViewProj);
          float dist = distance(P, uCamPos);
          float range = 1.0 - smoothstep(uParams.w * 0.55, uParams.w, dist);
          if (range <= 0.001) { gl_FragColor = vec4(src, 1.0); return; }

          // A pixel already in shade must not be shaded twice — the sun is
          // only blocked once. Brightness is a good enough stand-in for "this
          // surface can still see the key light" with no G-buffer to ask.
          float lit = smoothstep(0.025, 0.16, luma(src));
          if (lit <= 0.001) { gl_FragColor = vec4(src, 1.0); return; }

          vec3 L = normalize(uLightDir);

          // Surface normal from depth derivatives — no G-buffer to ask. It is
          // what stops the march from grazing along the very surface it starts
          // on, which is where every screen-space shadow gets its acne.
          vec3 N = normalize(cross(worldAt(vUv + vec2(0.0, uTexel.y)) - P,
                                   worldAt(vUv + vec2(uTexel.x, 0.0)) - P));
          if (dot(N, uCamPos - P) < 0.0) N = -N;
          float ndl = dot(N, L);
          if (ndl <= 0.06) { gl_FragColor = vec4(src, 1.0); return; }
          float facing = smoothstep(0.06, 0.30, ndl);

          // Step length grows with distance so a far-away character still gets
          // a contact of the right *world* size rather than a sub-pixel one.
          float len = uParams.x * (1.0 + dist * 0.045);

          // ...and is then capped so a step can never cross more of the screen
          // than the depth buffer can resolve. **This is the crosshatch fix.**
          //
          // The world length above says nothing about how far a step travels in
          // pixels, and at portrait range that is enormous: at 0.6 m the shipped
          // 0.5 m / 12 steps is ~69 px per step. The per-pixel jitter below is
          // meant to dither the start within one step; at 69 px per step it
          // instead starts neighbouring pixels' marches on completely different
          // geometry, so the binary hit/no-hit lands as a **one-pixel
          // checkerboard** — which CAS then sharpens into the burlap weave that
          // a blind judge read as "flat untextured plastic skin". Nothing about
          // skin was involved: skin is just the nearest large surface in a
          // portrait, and the same march over distant terrain steps a fraction
          // of a pixel and is clean. See src/tools/probes/weavecontact.mts.
          //
          // Measured on hero_portrait, face residual, rms /255 and one-pixel
          // alternation (each stage re-posed, history reset, 40 frames; the
          // protocol's own null ablation repeats to 0.01):
          //
          //     shipped                       10.93   0.308
          //     contact pass off               4.84  -0.023
          //     CS_STEPS 12 -> 48              2.88  -0.028
          //     length 0.50 -> 0.20          2.87  -0.027
          //     jitter forced to 0.5          12.62  -0.570   (banding instead)
          //     **this cap, 6 px**             2.97  -0.047
          //
          // Note which two rows are *not* on that list: GTAO off makes it worse
          // (14.59 / 0.379), and forcing TAA to ignore the velocity buffer
          // entirely reproduces the shipped frame to 0.001. The chain named in
          // project/handoff/head.md §4 — GTAO dither, TAA failing on skinned
          // meshes, CAS — was wrong in both of its first two links.
          //
          // 48 steps fixes it too and costs 4x the depth fetches. This costs one
          // matrix multiply and no fetch: worldFromDepth is evaluated at the
          // neighbouring uv with **this pixel's own depth**, so it is the
          // projected world size of one texel and not a depth difference.
          float pxWorld = length(worldFromDepth(vUv + vec2(uTexel.x, 0.0), d, uInvViewProj) - P);
          len = min(len, pxWorld * uStepPx * float(CS_STEPS));

          float stepLen = len / float(CS_STEPS);
          float bias = uParams.z * (1.0 + dist * 0.10);
          // Rotating the dither every frame is what lets TAA average it away.
          // A screen-locked pattern is re-stamped at the same pixel each frame
          // and survives the accumulation as visible cross-hatching. It is
          // necessary and it is not sufficient: it was already here, correctly
          // rotating over eight phases, while the weave above was shipping.
          float jitter = ign(gl_FragCoord.xy + mod(uFrame, 8.0) * 47.13);

          float occ = 0.0;
          vec3 pos = P + N * bias + L * (bias + stepLen * jitter);

          for (int i = 0; i < CS_STEPS; i++) {
            pos += L * stepLen;
            vec4 clip = uViewProj * vec4(pos, 1.0);
            if (clip.w <= 0.0) break;
            vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
            if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
            float sceneD = texture2D(tDepth, uv).x;
            if (sceneD >= 0.9999) continue;
            float sceneZ = viewDepth(sceneD, uNear, uFar);
            float rayZ = viewDepth(clip.z / clip.w * 0.5 + 0.5, uNear, uFar);
            float diff = rayZ - sceneZ;
            if (diff > bias && diff < uParams.y) {
              // nearer hits are the real contact; distant ones fade out
              occ = max(occ, 1.0 - float(i) / float(CS_STEPS) * 0.55);
            }
          }

          // screen-edge fade: an occluder that leaves the frame must not pop
          vec2 e = smoothstep(vec2(0.0), vec2(0.05), vUv) *
                   smoothstep(vec2(0.0), vec2(0.05), 1.0 - vUv);
          float w = occ * uIntensity * range * lit * facing * e.x * e.y;
          vec3 shaded = src * mix(vec3(1.0), uTint, 0.72);
          gl_FragColor = vec4(mix(src, shaded, clamp(w, 0.0, 1.0)), 1.0);
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
    u.uParams.value.set(this.length, this.thickness, this.bias, this.maxDistance);
    u.uStepPx.value = this.stepPx;
    u.uFrame.value = fx.frame;
    u.uIntensity.value = this.intensity;
    u.uTint.value.set(this.tint.r, this.tint.g, this.tint.b);

    // direction *toward* the key light, in world space
    const sun = fx.sun;
    if (sun) {
      const sp = this._lightDir.setFromMatrixPosition(sun.matrixWorld);
      if (sun.target) sp.sub(this._lightTgt.setFromMatrixPosition(sun.target.matrixWorld));
      if (sp.lengthSq() > 1e-8) u.uLightDir.value.copy(sp).normalize();
    }
  }
}
