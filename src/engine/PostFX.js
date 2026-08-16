import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';

/**
 * Cinematic post chain. Order matters:
 *   scene -> GTAO -> bloom -> grade/DOF/grain -> SMAA -> output(tonemap+sRGB)
 */
export class PostFX {
  constructor(rnd) {
    this.rnd = rnd;
    const { renderer, scene, camera } = rnd;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());

    const rt = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 0,
      colorSpace: THREE.LinearSRGBColorSpace,
    });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.setSize(size.x, size.y);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    this.gtao = new GTAOPass(scene, camera, size.x, size.y);
    this.gtao.output = GTAOPass.OUTPUT.Default;
    this.gtao.updateGtaoMaterial({
      radius: 0.5, distanceExponent: 1.4, thickness: 1.0,
      scale: 1.0, samples: 16, screenSpaceRadius: false,
    });
    this.gtao.blendIntensity = 0.9;
    this.composer.addPass(this.gtao);

    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.7, 0.85);
    this.composer.addPass(this.bloom);

    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);

    this.smaa = new SMAAPass();
    this.composer.addPass(this.smaa);

    this.composer.addPass(new OutputPass());

    rnd.onResize = (w, h) => this.setSize(w, h);
  }

  setSize(w, h) {
    const dpr = this.rnd.renderer.getPixelRatio();
    this.composer.setSize(w * dpr, h * dpr);
    this.grade.uniforms.uResolution.value.set(w * dpr, h * dpr);
  }

  update(time) {
    this.grade.uniforms.uTime.value = time.now;
  }

  render() { this.composer.render(); }
}

/**
 * Combined grade: filmic contrast curve, split-tone, vignette, chromatic
 * aberration, subtle grain and a lift/gamma/gain trim. All in linear space —
 * OutputPass does the tonemap + sRGB conversion afterwards.
 */
export const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uVignette: { value: 0.42 },
    uGrain: { value: 0.028 },
    uChroma: { value: 0.9 },
    uSaturation: { value: 1.06 },
    uContrast: { value: 1.05 },
    uLift: { value: new THREE.Vector3(0.006, 0.008, 0.016) },
    uGain: { value: new THREE.Vector3(1.02, 1.0, 0.985) },
    uExposure: { value: 1.0 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uTime, uVignette, uGrain, uChroma, uSaturation, uContrast, uExposure;
    uniform vec3 uLift, uGain;
    varying vec2 vUv;

    float hash(vec2 p){ p = fract(p*vec2(443.897,441.423)); p += dot(p,p+19.19); return fract(p.x*p.y); }

    void main(){
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c,c);

      // chromatic aberration, strengthening toward the frame edge
      float ca = uChroma * 0.0016 * r2;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + c*ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - c*ca).b;

      col *= uExposure;

      // lift / gain trim
      col = col * uGain + uLift;

      // contrast around scene-linear mid grey
      const float mid = 0.18;
      col = max(vec3(0.0), mix(vec3(mid), col, uContrast));

      // saturation
      float l = dot(col, vec3(0.2126,0.7152,0.0722));
      col = mix(vec3(l), col, uSaturation);

      // vignette
      float v = smoothstep(0.85, 0.15, r2 * uVignette * 2.6);
      col *= mix(0.62, 1.0, v);

      // grain (scene-linear, luminance dependent so shadows stay clean-ish)
      float g = hash(uv * uResolution + fract(uTime) * 431.7) - 0.5;
      col += g * uGrain * (0.35 + 0.65 * smoothstep(0.0, 0.5, l));

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};
