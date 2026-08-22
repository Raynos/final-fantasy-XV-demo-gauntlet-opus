import * as THREE from 'three';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { makeRT, fsMaterial, blit } from './Fx.ts';
import { CHUNK_COLOR, CHUNK_HASH } from '../../shaders/post/common.ts';
import { lensDirtTexture } from './LensTextures.ts';

/**
 * Physically-plausible bloom on a progressive mip chain (Call of Duty style
 * 13-tap downsample / 9-tap tent upsample), plus the rest of the lens model:
 * an anamorphic horizontal streak, procedurally generated lens dirt, screen
 * space ghosts and halo, and a sun starburst that is occlusion-tested against
 * the depth buffer.
 *
 * Exposes `strength` / `radius` / `threshold` so code written against
 * UnrealBloomPass keeps working.
 */
export class BloomPass extends Pass {
  anamorphic!: number;
  anamorphicTint!: THREE.Color;
  baseDivisor!: number;
  compositeMat!: THREE.ShaderMaterial;
  dirt!: THREE.DataTexture;
  dirtAmount!: number;
  downMat!: THREE.ShaderMaterial;
  flareThreshold!: number;
  floor!: number;
  fx!: any;
  ghostAmount!: number;
  haloAmount!: number;
  knee!: number;
  levels!: number;
  mipFalloff!: number;
  mips!: any[];
  prefilterMat!: THREE.ShaderMaterial;
  radius!: number;
  streak!: any;
  streakMat!: THREE.ShaderMaterial;
  strength!: number;
  sunAmount!: number;
  threshold!: number;
  upMat!: THREE.ShaderMaterial;
  constructor(fx: any, w: number, h: number) {
    super();
    this.fx = fx;
    this.needsSwap = true;
    this.enabled = true;

    this.strength = 0.34;
    this.radius = 0.85;
    /**
     * Threshold in *display* units (post-exposure), not raw scene-linear.
     * The bloom runs on the un-exposed HDR buffer, so a fixed scene-linear
     * threshold means a different thing at every time of day — at dusk the
     * whole sunset band sat above it and the widest mip painted a uniform
     * amber veil across the frame. Dividing by the published scene exposure
     * makes "bloom what looks blown out" true at noon and at midnight alike.
     */
    this.threshold = 1.45;
    this.knee = 0.42;
    // Thresholdless veil. This is applied to *every* texel, so at 0.012 the
    // deepest mip was ~1% of the entire frame smeared over the entire frame —
    // a flat wash tinted by whatever was brightest. Keep it homeopathic.
    this.floor = 0.0018;
    /** Per-octave falloff on the upsample. <1 keeps the glow local. */
    this.mipFalloff = 0.72;
    this.anamorphic = 0.26;
    this.anamorphicTint = new THREE.Color(0.35, 0.55, 1.0);
    this.dirtAmount = 0.22;
    this.ghostAmount = 0.10;
    this.haloAmount = 0.07;
    this.flareThreshold = 0.45;   // ghosts come from real hot spots only
    this.sunAmount = 0.75;
    /**
     * Mips in the pyramid, and where it starts.
     *
     * Six mips from half resolution and five from quarter reach exactly the
     * same widest octave (1/64 of the frame), so the glow is the same size —
     * but the quarter-res chain touches a quarter of the pixels and runs two
     * fewer fullscreen passes. Bloom is a wide, smooth field; there is no
     * detail at half resolution that survives the first downsample anyway.
     */
    this.levels = 5;
    this.baseDivisor = 4;

    this.dirt = lensDirtTexture(256, 90210);

    this.prefilterMat = fsMaterial({
      uniforms: {
        tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() },
        uThreshold: { value: new THREE.Vector4() }, uFloor: { value: 0.012 },
      },
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D tDiffuse; uniform vec2 uTexel;
        uniform vec4 uThreshold; uniform float uFloor;
        varying vec2 vUv;
        ${CHUNK_COLOR}
        vec3 tap(vec2 uv, out float w) {
          vec3 c = max(texture2D(tDiffuse, uv).rgb, vec3(0.0));
          w = 1.0 / (1.0 + luma(c));      // Karis average kills fireflies
          return c;
        }
        void main() {
          float w0, w1, w2, w3;
          vec3 a = tap(vUv + uTexel * vec2(-1.0, -1.0), w0);
          vec3 b = tap(vUv + uTexel * vec2( 1.0, -1.0), w1);
          vec3 c = tap(vUv + uTexel * vec2(-1.0,  1.0), w2);
          vec3 d = tap(vUv + uTexel * vec2( 1.0,  1.0), w3);
          vec3 col = (a * w0 + b * w1 + c * w2 + d * w3) / max(w0 + w1 + w2 + w3, 1e-5);

          float br = maxc(col);
          float soft = clamp(br - uThreshold.y, 0.0, uThreshold.z);
          soft = soft * soft * uThreshold.w;
          float contrib = max(soft, br - uThreshold.x) / max(br, 1e-5);
          gl_FragColor = vec4(col * contrib + col * uFloor, 1.0);
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
          vec2 t = uTexel;
          vec3 a = texture2D(tDiffuse, vUv + t * vec2(-2.0,  2.0)).rgb;
          vec3 b = texture2D(tDiffuse, vUv + t * vec2( 0.0,  2.0)).rgb;
          vec3 c = texture2D(tDiffuse, vUv + t * vec2( 2.0,  2.0)).rgb;
          vec3 d = texture2D(tDiffuse, vUv + t * vec2(-2.0,  0.0)).rgb;
          vec3 e = texture2D(tDiffuse, vUv).rgb;
          vec3 f = texture2D(tDiffuse, vUv + t * vec2( 2.0,  0.0)).rgb;
          vec3 g = texture2D(tDiffuse, vUv + t * vec2(-2.0, -2.0)).rgb;
          vec3 h = texture2D(tDiffuse, vUv + t * vec2( 0.0, -2.0)).rgb;
          vec3 i = texture2D(tDiffuse, vUv + t * vec2( 2.0, -2.0)).rgb;
          vec3 j = texture2D(tDiffuse, vUv + t * vec2(-1.0,  1.0)).rgb;
          vec3 k = texture2D(tDiffuse, vUv + t * vec2( 1.0,  1.0)).rgb;
          vec3 l = texture2D(tDiffuse, vUv + t * vec2(-1.0, -1.0)).rgb;
          vec3 m = texture2D(tDiffuse, vUv + t * vec2( 1.0, -1.0)).rgb;
          vec3 col = e * 0.125;
          col += (a + c + g + i) * 0.03125;
          col += (b + d + f + h) * 0.0625;
          col += (j + k + l + m) * 0.125;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    this.upMat = fsMaterial({
      uniforms: {
        tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() },
        uRadius: { value: 1 }, uWeight: { value: 1 },
      },
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uRadius, uWeight;
        varying vec2 vUv;
        void main() {
          vec2 t = uTexel * uRadius;
          vec3 col = texture2D(tDiffuse, vUv).rgb * 4.0;
          col += texture2D(tDiffuse, vUv + vec2(-t.x,  0.0)).rgb * 2.0;
          col += texture2D(tDiffuse, vUv + vec2( t.x,  0.0)).rgb * 2.0;
          col += texture2D(tDiffuse, vUv + vec2( 0.0, -t.y)).rgb * 2.0;
          col += texture2D(tDiffuse, vUv + vec2( 0.0,  t.y)).rgb * 2.0;
          col += texture2D(tDiffuse, vUv + vec2(-t.x, -t.y)).rgb;
          col += texture2D(tDiffuse, vUv + vec2( t.x, -t.y)).rgb;
          col += texture2D(tDiffuse, vUv + vec2(-t.x,  t.y)).rgb;
          col += texture2D(tDiffuse, vUv + vec2( t.x,  t.y)).rgb;
          gl_FragColor = vec4(col * (uWeight / 16.0), 1.0);
        }
      `,
      blending: THREE.AdditiveBlending,
    });

    this.streakMat = fsMaterial({
      uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() }, uStep: { value: 1 } },
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uStep;
        varying vec2 vUv;
        void main() {
          // 17-tap horizontal gaussian, widening per iteration.
          //
          // Two passes at strides 4 and 14 replace three at 2, 9 and 30: the
          // wider kernel means the second pass's sample spacing still sits
          // inside the first pass's support, so the smear stays continuous
          // rather than breaking into a row of copies of the highlight, and it
          // reaches the same ~110 texel span for one fewer render target.
          float w[9];
          w[0] = 0.1410; w[1] = 0.1330; w[2] = 0.1122; w[3] = 0.0847;
          w[4] = 0.0572; w[5] = 0.0346; w[6] = 0.0187; w[7] = 0.0090; w[8] = 0.0039;
          vec3 col = texture2D(tDiffuse, vUv).rgb * w[0];
          for (int i = 1; i < 9; i++) {
            float o = float(i) * uStep * uTexel.x;
            col += texture2D(tDiffuse, vUv + vec2(o, 0.0)).rgb * w[i];
            col += texture2D(tDiffuse, vUv - vec2(o, 0.0)).rgb * w[i];
          }
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    this.compositeMat = fsMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tBloom: { value: null },
        tGhostSrc: { value: null },
        tStreak: { value: null },
        tDirt: { value: null },
        tDepth: { value: null },
        uStrength: { value: 0.42 },
        uAnamorphic: { value: 0.3 },
        uAnaTint: { value: new THREE.Vector3(0.35, 0.55, 1.0) },
        uDirt: { value: 0.55 },
        uGhost: { value: 0.10 },
        uHalo: { value: 0.07 },
        uFlareThreshold: { value: 0.45 },
        uSun: { value: new THREE.Vector4(0.5, 0.5, 0.0, 1.0) },  // uv, visible, size
        uSunColor: { value: new THREE.Vector3(1.0, 0.82, 0.55) },
        uSunAmount: { value: 1.0 },
        uAspect: { value: 1.777 },
        uTexel: { value: new THREE.Vector2() },
      },
      fragmentShader: /* glsl */`
        precision highp float;
        uniform sampler2D tDiffuse, tBloom, tGhostSrc, tStreak, tDirt, tDepth;
        uniform float uStrength, uAnamorphic, uDirt, uGhost, uHalo, uSunAmount, uAspect, uFlareThreshold;
        uniform vec3 uAnaTint, uSunColor;
        uniform vec4 uSun;
        uniform vec2 uTexel;
        varying vec2 vUv;
        ${CHUNK_COLOR}
        ${CHUNK_HASH}

        vec3 ghostSample(vec2 uv, vec3 chroma) {
          // slight lateral dispersion so the ghosts break into colour
          vec2 d = (uv - 0.5) * 0.012;
          vec3 v = vec3(
            texture2D(tGhostSrc, uv + d * chroma.r).r,
            texture2D(tGhostSrc, uv + d * chroma.g).g,
            texture2D(tGhostSrc, uv + d * chroma.b).b
          );
          // only genuine hot spots throw ghosts - a merely bright sky must not
          return max(v - uFlareThreshold, vec3(0.0));
        }

        void main() {
          vec3 col = texture2D(tDiffuse, vUv).rgb;
          vec3 bloom = texture2D(tBloom, vUv).rgb;
          float dirt = texture2D(tDirt, vUv).r;

          // ---- lens ghosts + halo -------------------------------------
          vec3 flare = vec3(0.0);
          vec2 c = vUv - 0.5;
          if (uGhost > 0.0) {
            for (int i = 0; i < 3; i++) {
              float s = -0.62 - float(i) * 0.58;
              vec2 guv = c * s + 0.5;
              float mask = pow(clamp(1.0 - length(guv - 0.5) * 1.9, 0.0, 1.0), 3.0);
              vec3 tint = mix(vec3(0.55, 0.75, 1.0), vec3(1.0, 0.72, 0.42), fract(float(i) * 0.37));
              flare += ghostSample(guv, vec3(1.0, 0.0, -1.0)) * mask * tint * (1.0 - float(i) * 0.13);
            }
            flare *= uGhost;
          }
          if (uHalo > 0.0) {
            vec2 dir = normalize(-c + 1e-6) * 0.42;
            vec2 huv = vUv + dir;
            float hmask = pow(clamp(1.0 - abs(length(c) - 0.28) * 4.5, 0.0, 1.0), 2.0);
            flare += ghostSample(huv, vec3(1.6, 0.0, -1.6)) * hmask * uHalo * vec3(0.85, 0.9, 1.0);
          }

          // ---- sun: starburst, iris ring, ghost chain ------------------
          if (uSun.z > 0.001 && uSunAmount > 0.0) {
            vec2 sd = vUv - uSun.xy;
            sd.x *= uAspect;
            float r = length(sd);
            float ang = atan(sd.y, sd.x);

            // occlusion: how much sky is around the sun position
            float vis = 0.0;
            for (int i = 0; i < 8; i++) {
              float a = float(i) * 0.7853981634;
              vec2 o = vec2(cos(a), sin(a)) * 0.012;
              o.x /= uAspect;
              float d = texture2D(tDepth, clamp(uSun.xy + o, vec2(0.001), vec2(0.999))).x;
              vis += step(0.9999, d);
            }
            vis /= 8.0;
            vis *= uSun.z;

            float core = exp(-r * 96.0) * 2.4 + exp(-r * 26.0) * 0.42;
            float a8 = ang * 4.0;
            float spokes = pow(abs(cos(a8)), 26.0) * exp(-r * 30.0)
                         + 0.5 * pow(abs(cos(a8 + 0.3927)), 60.0) * exp(-r * 48.0);
            float iris = exp(-pow((r - 0.055) * 50.0, 2.0)) * 0.05;
            float streak = exp(-abs(sd.y) * 300.0) * exp(-abs(sd.x) * 5.5) * 0.30;
            vec3 sun = uSunColor * (core + spokes * 0.30 + iris)
                     + vec3(0.50, 0.70, 1.0) * streak;

            // ghosts marching back through the optical centre
            vec2 axis = uSun.xy - 0.5;
            for (int i = 0; i < 5; i++) {
              float s = -0.34 - float(i) * 0.37;
              vec2 gd = vUv - (0.5 + axis * s);
              gd.x *= uAspect;
              float gr = length(gd);
              float size = 0.028 + 0.017 * float(i);
              float disc = smoothstep(size, size * 0.6, gr)
                         * (0.5 + 0.5 * smoothstep(size * 0.4, size * 0.92, gr));
              vec3 tint = mix(vec3(0.45, 0.72, 1.0), vec3(1.0, 0.62, 0.35), fract(float(i) * 0.41 + 0.2));
              sun += tint * disc * (0.032 / (1.0 + float(i) * 0.55));
            }

            flare += sun * vis * uSunAmount;
          }

          // ---- combine ------------------------------------------------
          vec3 streakCol = texture2D(tStreak, vUv).rgb * uAnaTint * uAnamorphic;
          vec3 total = bloom * uStrength + streakCol + flare;
          total *= 1.0 + dirt * uDirt * clamp(luma(total) * 2.0, 0.0, 3.0);

          gl_FragColor = vec4(col + total, 1.0);
        }
      `,
    });

    this.setSize(w, h);
  }

  override setSize(w: number, h: number) {
    if (this.mips) for (const rt of this.mips) rt.dispose();
    if (this.streak) for (const rt of this.streak) rt.dispose();
    this.mips = [];
    const div = this.baseDivisor || 2;
    let mw = Math.max(1, Math.floor(w / div)), mh = Math.max(1, Math.floor(h / div));
    for (let i = 0; i < this.levels; i++) {
      this.mips.push(makeRT(mw, mh));
      mw = Math.max(1, Math.floor(mw / 2));
      mh = Math.max(1, Math.floor(mh / 2));
    }
    const sw = Math.max(1, Math.floor(w / 8)), sh = Math.max(1, Math.floor(h / 8));
    this.streak = [makeRT(sw, sh), makeRT(sw, sh)];
    this.prefilterMat.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.compositeMat.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.compositeMat.uniforms.uAspect.value = w / h;
  }

  override render(renderer: THREE.WebGLRenderer, writeBuffer: any, readBuffer: any) {
    const u = this.prefilterMat.uniforms;
    // the threshold is authored post-exposure; convert it into the scene-linear
    // units this buffer is actually in (see the field comment)
    const ev = this.fx.exposure ? Math.max(this.fx.exposure.base, 0.05) : 1.0;
    const thr = this.threshold / ev;
    const k = Math.max(this.knee / ev, 1e-4);
    u.tDiffuse.value = readBuffer.texture;
    u.uThreshold.value.set(thr, thr - k, 2 * k, 0.25 / k);
    u.uFloor.value = this.floor;
    blit(renderer, this.prefilterMat, this.mips[0]);

    for (let i = 1; i < this.mips.length; i++) {
      const src = this.mips[i - 1];
      this.downMat.uniforms.tDiffuse.value = src.texture;
      this.downMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      blit(renderer, this.downMat, this.mips[i]);
    }

    for (let i = this.mips.length - 1; i > 0; i--) {
      const src = this.mips[i];
      this.upMat.uniforms.tDiffuse.value = src.texture;
      this.upMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      this.upMat.uniforms.uRadius.value = this.radius;
      this.upMat.uniforms.uWeight.value = this.mipFalloff;
      blit(renderer, this.upMat, this.mips[i - 1]);
    }

    // anamorphic streak: two widening horizontal passes off a mid mip
    const s0 = this.streak[0], s1 = this.streak[1];
    // keep the streak and ghost sources at the same *screen* octaves they
    // used to sit at, now that the pyramid starts one level lower
    this.streakMat.uniforms.tDiffuse.value = this.mips[Math.min(1, this.mips.length - 1)].texture;
    this.streakMat.uniforms.uTexel.value.set(1 / s0.width, 1 / s0.height);
    this.streakMat.uniforms.uStep.value = 4.0;
    blit(renderer, this.streakMat, s1);
    this.streakMat.uniforms.tDiffuse.value = s1.texture;
    this.streakMat.uniforms.uStep.value = 14.0;
    blit(renderer, this.streakMat, s0);

    const cu = this.compositeMat.uniforms;
    cu.tDiffuse.value = readBuffer.texture;
    cu.tBloom.value = this.mips[0].texture;
    cu.tGhostSrc.value = this.mips[Math.min(3, this.mips.length - 1)].texture;
    cu.tStreak.value = s0.texture;
    cu.tDirt.value = this.dirt;
    cu.tDepth.value = this.fx.rtScene.depthTexture;
    cu.uStrength.value = this.strength;
    cu.uAnamorphic.value = this.anamorphic;
    cu.uAnaTint.value.set(this.anamorphicTint.r, this.anamorphicTint.g, this.anamorphicTint.b);
    cu.uDirt.value = this.dirtAmount;
    cu.uGhost.value = this.ghostAmount;
    cu.uHalo.value = this.haloAmount;
    cu.uFlareThreshold.value = this.flareThreshold;
    cu.uSunAmount.value = this.sunAmount;
    cu.uSun.value.copy(this.fx.sunScreen);
    cu.uSunColor.value.copy(this.fx.sunColor);
    blit(renderer, this.compositeMat, this.renderToScreen ? null : writeBuffer);
  }

  override dispose() {
    for (const rt of this.mips) rt.dispose();
    for (const rt of this.streak) rt.dispose();
    this.dirt.dispose();
  }
}
