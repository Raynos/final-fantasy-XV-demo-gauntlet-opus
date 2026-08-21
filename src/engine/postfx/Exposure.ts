import * as THREE from 'three';
import { makeRT, fsMaterial, blit } from './Fx.ts';
import { CHUNK_COLOR } from '../../shaders/post/common.ts';

/**
 * GPU eye adaptation. The scene buffer is reduced to a single texel of average
 * log-luminance, then a 1x1 ping-pong target integrates it over time. Nothing
 * is ever read back to the CPU, so there is no pipeline stall.
 *
 * **Ownership.** The value this integrates *is* the final scene-exposure
 * multiplier: metering runs on the un-exposed HDR buffer, so `key / avgLuma`
 * is already an absolute exposure, not a correction on top of one. Nothing
 * else may multiply a second exposure onto the frame. Instead the Sky
 * publishes the physically motivated *scene* exposure through
 * {@link setSceneExposure} and eye adaptation is only allowed to roam inside a
 * band around it (`lo`..`hi`), under a hard `ceiling`. That is what keeps a
 * night dark: a dark frame drives `key / avgLuma` toward the rail, and without
 * the band the integrator would happily expose midnight as noon.
 */
export class Exposure {
  adapt!: any;
  adaptMat!: any;
  base!: number;
  ceiling!: any;
  chain!: any[];
  compensation!: number;
  downMat!: any;
  enabled!: boolean;
  key!: number;
  logMat!: any;
  max!: number;
  min!: number;
  pingpong!: number;
  rangeHi!: number;
  rangeLo!: number;
  speedDown!: number;
  speedUp!: number;
  constructor(w: any, h: any) {
    this.enabled = true;
    this.key = 0.19;            // target middle-grey luminance
    this.speedUp = 3.2;         // adaptation to brighter scenes (per second)
    this.speedDown = 1.6;
    this.min = 0.12;            // absolute rails, a backstop for the band
    this.max = 8.0;
    this.base = 1.0;            // scene exposure published by Sky
    this.rangeLo = 0.62;        // adaptation band, as a ratio of `base`
    this.rangeHi = 1.65;
    this.ceiling = Infinity;    // hard cap on the final multiplier
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

  /**
   * Publish the scene exposure. This is the *only* supported way to drive
   * exposure from lighting: eye adaptation then adapts within `lo`..`hi` of it
   * instead of fighting it.
   *
   * @param base scene exposure multiplier (>0)
   */
  setSceneExposure(base: number, band: {lo?:number, hi?:number, ceiling?:number} = {}) {
    this.base = Math.max(1e-4, base);
    if (band.lo != null) this.rangeLo = band.lo;
    if (band.hi != null) this.rangeHi = band.hi;
    this.ceiling = band.ceiling != null ? band.ceiling : Infinity;
  }

  /** The clamped [min, max] the integrator is allowed to settle inside. */
  get bounds() {
    const hi = Math.min(this.max, this.ceiling, this.base * this.rangeHi);
    const lo = Math.min(hi, Math.max(this.min, this.base * this.rangeLo));
    return [lo, hi];
  }

  setSize(w: any, h: any) {
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
   * @param srcTexture scene-linear HDR colour
   * @param dt seconds
   */
  update(renderer: THREE.WebGLRenderer, srcTexture: THREE.Texture, dt: number) {
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
    const [lo, hi] = this.bounds;
    u.uRange.value.set(lo, hi);
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
