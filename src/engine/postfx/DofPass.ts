import * as THREE from 'three';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { makeRT, fsMaterial, blit } from './Fx.ts';
import { CHUNK_COLOR, CHUNK_DEPTH, CHUNK_HASH } from '../../shaders/post/common.ts';

/**
 * Bokeh depth of field driven by a physical camera model.
 *
 * The circle of confusion is the real lens equation
 *
 *     coc = |d - F| / d  *  f^2 / (N * (F - f))
 *
 * in millimetres on the sensor, converted to pixels through the sensor height,
 * where `f` is derived from the current vertical FOV. Near and far fields are
 * gathered separately from a half-resolution premultiplied buffer using a
 * scatter-as-gather kernel on a rounded-hexagonal aperture, so foreground blur
 * correctly bleeds *over* sharp background while background blur never bleeds
 * onto a sharp foreground.
 */
export class DofPass extends Pass {
  blades!: number;
  bokehScale!: number;
  composite!: THREE.ShaderMaterial;
  fStop!: number;
  farScale!: number;
  focusDistance!: number;
  fx!: any;
  gather!: THREE.ShaderMaterial;
  height!: number;
  maxCoc!: number;
  nearScale!: number;
  prefilter!: THREE.ShaderMaterial;
  rtBlur!: any;
  rtPre!: any;
  sensorHeight!: number;
  width!: number;
  constructor(fx: any, w: number, h: number) {
    super();
    this.fx = fx;
    this.needsSwap = true;
    this.enabled = true;

    // A stills photographer shooting a person at f/2.8 on a 40mm lens throws
    // the whole background away, and that is exactly what a game frame must
    // not do: the world *is* the shot. Games that look cinematic (FFXV very
    // much included) run a deep stop and let the far field go gently soft
    // rather than to mush, so the mesa behind the hero still reads as strata.
    // The near field is a different job — a soft grass foreground is a free
    // depth cue — so the two halves are scaled independently below.
    this.fStop = 4.6;
    this.sensorHeight = 24.0;      // mm, full frame
    this.focusDistance = 8.0;      // metres
    this.bokehScale = 0.95;        // artistic multiplier on top of the physics
    this.maxCoc = 10.0;            // pixels, full-res
    this.blades = 0.55;            // 0 = circular, 1 = hard hexagon
    this.nearScale = 1.35;         // foreground: keep it creamy
    this.farScale = 0.68;          // background: soft, never unreadable

    this.prefilter = fsMaterial({
      uniforms: {
        tDiffuse: { value: null }, tDepth: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uNear: { value: 0.15 }, uFar: { value: 6000 },
        uCoc: { value: new THREE.Vector4() },   // focalMM, fStop, focusM, maxCoc
        uPxPerMM: { value: 1 },
        uScale: { value: new THREE.Vector2(1, 1) },
      },
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D tDiffuse, tDepth;
        uniform vec2 uTexel, uScale;
        uniform vec4 uCoc;
        uniform float uNear, uFar, uPxPerMM;
        varying vec2 vUv;
        ${CHUNK_COLOR}
        ${CHUNK_DEPTH}

        float cocPixels(float dist) {
          float f = uCoc.x, N = uCoc.y, F = uCoc.z * 1000.0;   // mm
          float d = max(dist, 1e-3) * 1000.0;
          float c = (d - F) / d * (f * f) / max(N * (F - f), 1e-3);  // mm, signed
          float px = c * uPxPerMM;
          px *= px > 0.0 ? uScale.y : uScale.x;
          return clamp(px, -uCoc.w, uCoc.w);
        }

        void main() {
          vec2 o = uTexel;
          vec3 c0 = max(texture2D(tDiffuse, vUv + vec2(-o.x, -o.y)).rgb, vec3(0.0));
          vec3 c1 = max(texture2D(tDiffuse, vUv + vec2( o.x, -o.y)).rgb, vec3(0.0));
          vec3 c2 = max(texture2D(tDiffuse, vUv + vec2(-o.x,  o.y)).rgb, vec3(0.0));
          vec3 c3 = max(texture2D(tDiffuse, vUv + vec2( o.x,  o.y)).rgb, vec3(0.0));
          float w0 = 1.0 / (1.0 + luma(c0)), w1 = 1.0 / (1.0 + luma(c1));
          float w2 = 1.0 / (1.0 + luma(c2)), w3 = 1.0 / (1.0 + luma(c3));
          vec3 col = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 1e-5);

          float d0 = texture2D(tDepth, vUv + vec2(-o.x, -o.y)).x;
          float d1 = texture2D(tDepth, vUv + vec2( o.x, -o.y)).x;
          float d2 = texture2D(tDepth, vUv + vec2(-o.x,  o.y)).x;
          float d3 = texture2D(tDepth, vUv + vec2( o.x,  o.y)).x;
          float d = min(min(d0, d1), min(d2, d3));   // bias to the nearest surface
          float coc = cocPixels(viewDepth(d, uNear, uFar));

          gl_FragColor = vec4(col, coc / uCoc.w);
        }
      `,
    });

    this.gather = fsMaterial({
      uniforms: {
        tPre: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uMaxCoc: { value: 16 },
        uBlades: { value: 0.55 },
      },
      defines: { TAPS: 31 },
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D tPre;
        uniform vec2 uTexel;
        uniform float uMaxCoc, uBlades;
        varying vec2 vUv;
        ${CHUNK_COLOR}
        ${CHUNK_HASH}

        // radius of a unit-circumradius hexagon at angle a
        float hexEdge(float a) {
          float s = mod(a, 1.0471975512) - 0.5235987756;
          return 0.8660254038 / max(cos(s), 0.5);
        }

        void main() {
          vec4 c = texture2D(tPre, vUv);
          float centerCoc = c.a * uMaxCoc;

          vec3 farCol = c.rgb;
          float farW = 1.0;
          // weight = how much this sample's disc covers us (soft 1px edge);
          // coverage = how much *near* blur actually lands here, which must be
          // zero for an in-focus pixel or the whole frame goes soft
          float wnC = clamp(-centerCoc + 1.0, 0.0, 1.0);
          vec3 nearCol = c.rgb * wnC;
          float nearW = wnC;
          float nearAlpha = clamp(-centerCoc, 0.0, 1.0);

          float rot = ign(gl_FragCoord.xy) * 6.2831853;
          // one half-res texel spans two full-res pixels
          vec2 texStep = uTexel * 0.5;

          for (int i = 0; i < TAPS; i++) {
            float fi = float(i) + 0.5;
            float a = fi * 2.39996323 + rot;
            float rr = sqrt(fi / float(TAPS));
            float shape = mix(1.0, hexEdge(a), uBlades);
            vec2 dir = vec2(cos(a), sin(a)) * rr * shape;
            float r = length(dir) * uMaxCoc;                 // full-res pixels

            vec4 s = texture2D(tPre, vUv + dir * uMaxCoc * texStep);
            float sCoc = s.a * uMaxCoc;

            float wf = clamp(sCoc - r + 1.0, 0.0, 1.0);
            farCol += s.rgb * wf; farW += wf;

            float wn = clamp(-sCoc - r + 1.0, 0.0, 1.0);
            nearCol += s.rgb * wn; nearW += wn;
            nearAlpha = max(nearAlpha, clamp(-sCoc - r, 0.0, 1.0));
          }

          vec3 far = farCol / max(farW, 1e-4);
          vec3 near = nearW > 1e-4 ? nearCol / nearW : far;

          float farBlend = clamp((centerCoc - 0.6) / 2.4, 0.0, 1.0);
          nearAlpha = clamp(nearAlpha, 0.0, 1.0);

          vec3 outCol = mix(far, near, nearAlpha);
          gl_FragColor = vec4(outCol, max(farBlend, nearAlpha));
        }
      `,
    });

    this.composite = fsMaterial({
      uniforms: {
        tDiffuse: { value: null }, tBlur: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uIntensity: { value: 1.0 },
      },
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D tDiffuse, tBlur;
        uniform vec2 uTexel;
        uniform float uIntensity;
        varying vec2 vUv;
        void main() {
          // tent upsample of the half-res field hides the resolution step
          vec2 o = uTexel;
          vec4 b = texture2D(tBlur, vUv) * 0.4;
          b += texture2D(tBlur, vUv + vec2( o.x,  o.y)) * 0.15;
          b += texture2D(tBlur, vUv + vec2(-o.x,  o.y)) * 0.15;
          b += texture2D(tBlur, vUv + vec2( o.x, -o.y)) * 0.15;
          b += texture2D(tBlur, vUv + vec2(-o.x, -o.y)) * 0.15;
          vec3 sharp = texture2D(tDiffuse, vUv).rgb;
          gl_FragColor = vec4(mix(sharp, b.rgb, clamp(b.a * uIntensity, 0.0, 1.0)), 1.0);
        }
      `,
    });

    this.setSize(w, h);
  }

  /**
   * Taps around the aperture. The kernel is a spiral over a rounded hexagon at
   * half resolution, so the shape survives a lower count — what falls off is
   * how smoothly a very bright highlight fills its bokeh disc. 24 holds the
   * hexagon cleanly; below about 16 a specular pinpoint starts to read as a
   * ring of dots rather than a blade-edged circle.
   */
  setTaps(n: number) {
    const taps = Math.max(8, Math.round(n));
    if (this.gather.defines.TAPS === taps) return;
    this.gather.defines.TAPS = taps;
    this.gather.needsUpdate = true;
  }

  override setSize(w: number, h: number) {
    this.width = w; this.height = h;
    const hw = Math.max(1, Math.floor(w / 2)), hh = Math.max(1, Math.floor(h / 2));
    if (this.rtPre) { this.rtPre.dispose(); this.rtBlur.dispose(); }
    this.rtPre = makeRT(hw, hh);
    this.rtBlur = makeRT(hw, hh);
    this.prefilter.uniforms.uTexel.value.set(0.5 / w, 0.5 / h);
    this.gather.uniforms.uTexel.value.set(1 / hw, 1 / hh);
    this.composite.uniforms.uTexel.value.set(1 / hw, 1 / hh);
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: any, readBuffer: any) {
    const fx = this.fx;
    const cam = fx.rnd.camera;
    // vertical FOV -> focal length on a full-frame sensor
    const focal = (this.sensorHeight * 0.5) / Math.tan(THREE.MathUtils.degToRad(cam.fov) * 0.5);
    const pxPerMM = (this.height / this.sensorHeight) * this.bokehScale;

    const up = this.prefilter.uniforms;
    up.tDiffuse.value = readBuffer.texture;
    up.tDepth.value = fx.rtScene.depthTexture;
    up.uNear.value = cam.near;
    up.uFar.value = cam.far;
    up.uCoc.value.set(focal, this.fStop, Math.max(this.focusDistance, focal / 1000 + 0.05), this.maxCoc);
    up.uPxPerMM.value = pxPerMM;
    up.uScale.value.set(this.nearScale, this.farScale);
    blit(renderer, this.prefilter, this.rtPre);

    this.gather.uniforms.tPre.value = this.rtPre.texture;
    this.gather.uniforms.uMaxCoc.value = this.maxCoc;
    this.gather.uniforms.uBlades.value = this.blades;
    blit(renderer, this.gather, this.rtBlur);

    this.composite.uniforms.tDiffuse.value = readBuffer.texture;
    this.composite.uniforms.tBlur.value = this.rtBlur.texture;
    blit(renderer, this.composite, this.renderToScreen ? null : writeBuffer);
  }

  override dispose() {
    this.rtPre.dispose(); this.rtBlur.dispose();
    this.prefilter.dispose(); this.gather.dispose(); this.composite.dispose();
  }
}
