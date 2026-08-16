import * as THREE from 'three';
import { makeRT, fsMaterial, blit } from './Fx.js';
import { CHUNK_COLOR } from '../../shaders/post/common.js';

/**
 * GPU eye adaptation. The scene buffer is reduced to a single texel of average
 * log-luminance, then a 1x1 ping-pong target integrates it over time. Nothing
 * is ever read back to the CPU, so there is no pipeline stall.
 */
export class Exposure {
  constructor(w, h) {
    this.enabled = true;
    this.key = 0.19;            // target middle-grey luminance
    this.speedUp = 3.2;         // adaptation to brighter scenes (per second)
    this.speedDown = 1.6;
    this.min = 0.12;
    this.max = 8.0;
    this.compensation = 1.0;    // manual EV trim, multiplied on top
    this._reset = true;

    this.logMat = fsMaterial({
      uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } },
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D tDiffuse; uniform vec2 uTexel;
        varying vec2 vUv;
        ${CHUNK_COLOR}
        void main() {
          vec3 a = texture2D(tDiffuse, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
          vec3 b = texture2D(tDiffuse, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
          vec3 c = texture2D(tDiffuse, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
          vec3 d = texture2D(tDiffuse, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
          // centre-weighted metering: the middle of the frame is what matters
          vec2 q = vUv - 0.5;
          float meter = mix(0.45, 1.0, smoothstep(0.55, 0.06, dot(q, q)));
          float l = 0.25 * (luma(a) + luma(b) + luma(c) + luma(d));
          gl_FragColor = vec4(log2(max(l, 1e-4)) * meter, meter, 0.0, 1.0);
        }
      `,
    });

    this.downMat = fsMaterial({
      uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } },
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D tDiffuse; uniform vec2 uTexel;
        varying vec2 vUv;
        void main() {
          vec2 s = uTexel;
          vec4 a = texture2D(tDiffuse, vUv + s * vec2(-1.0, -1.0));
          vec4 b = texture2D(tDiffuse, vUv + s * vec2( 1.0, -1.0));
          vec4 c = texture2D(tDiffuse, vUv + s * vec2(-1.0,  1.0));
          vec4 d = texture2D(tDiffuse, vUv + s * vec2( 1.0,  1.0));
          gl_FragColor = 0.25 * (a + b + c + d);
        }
      `,
    });

    this.adaptMat = fsMaterial({
      uniforms: {
        tLum: { value: null }, tPrev: { value: null },
        uDt: { value: 1 / 60 }, uKey: { value: this.key },
        uSpeed: { value: new THREE.Vector2(3.2, 1.6) },
        uRange: { value: new THREE.Vector2(0.12, 8.0) },
        uReset: { value: 1 },
      },
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D tLum, tPrev;
        uniform float uDt, uKey, uReset;
        uniform vec2 uSpeed, uRange;
        varying vec2 vUv;
        void main() {
          vec2 m = texture2D(tLum, vec2(0.5)).rg;
          float avg = exp2(m.r / max(m.g, 1e-4));
          float target = clamp(uKey / max(avg, 1e-4), uRange.x, uRange.y);
          float prev = texture2D(tPrev, vec2(0.5)).r;
          if (uReset > 0.5 || prev <= 0.0) prev = target;
          float speed = target > prev ? uSpeed.x : uSpeed.y;
          float k = 1.0 - exp(-uDt * speed);
          gl_FragColor = vec4(prev + (target - prev) * k, 0.0, 0.0, 1.0);
        }
      `,
    });

    const px = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter };
    this.adapt = [makeRT(1, 1, px), makeRT(1, 1, px)];
    this.pingpong = 0;
    this.setSize(w, h);
  }

  /** Texture holding the current adapted exposure multiplier in .r */
  get texture() { return this.adapt[this.pingpong].texture; }

  setSize(w, h) {
    if (this.chain) for (const rt of this.chain) rt.dispose();
    this.chain = [];
    let cw = Math.max(1, Math.floor(w / 4));
    let ch = Math.max(1, Math.floor(h / 4));
    this.chain.push(makeRT(cw, ch));
    while (cw > 1 || ch > 1) {
      cw = Math.max(1, Math.ceil(cw / 4));
      ch = Math.max(1, Math.ceil(ch / 4));
      this.chain.push(makeRT(cw, ch));
    }
    this._reset = true;
  }

  reset() { this._reset = true; }

  /**
   * Reduce `srcTexture` and integrate the adapted exposure.
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Texture} srcTexture scene-linear HDR colour
   * @param {number} dt seconds
   */
  update(renderer, srcTexture, dt) {
    if (!this.enabled) return;
    const src = this.chain[0];
    this.logMat.uniforms.tDiffuse.value = srcTexture;
    this.logMat.uniforms.uTexel.value.set(0.25 / src.width, 0.25 / src.height);
    blit(renderer, this.logMat, src);

    for (let i = 1; i < this.chain.length; i++) {
      const prev = this.chain[i - 1], cur = this.chain[i];
      this.downMat.uniforms.tDiffuse.value = prev.texture;
      this.downMat.uniforms.uTexel.value.set(1 / prev.width, 1 / prev.height);
      blit(renderer, this.downMat, cur);
    }

    const dst = 1 - this.pingpong;
    const u = this.adaptMat.uniforms;
    u.tLum.value = this.chain[this.chain.length - 1].texture;
    u.tPrev.value = this.adapt[this.pingpong].texture;
    u.uDt.value = Math.min(dt, 0.1);
    u.uKey.value = this.key;
    u.uSpeed.value.set(this.speedUp, this.speedDown);
    u.uRange.value.set(this.min, this.max);
    u.uReset.value = this._reset ? 1 : 0;
    blit(renderer, this.adaptMat, this.adapt[dst]);
    this.pingpong = dst;
    this._reset = false;
  }

  dispose() {
    for (const rt of this.chain) rt.dispose();
    for (const rt of this.adapt) rt.dispose();
  }
}
