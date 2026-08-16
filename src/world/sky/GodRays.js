import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const QUAD_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** Threshold + radial blur toward the sun, at quarter resolution. */
const RAYS_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tDiffuse;
uniform vec2  uSunPos;
uniform float uDensity;
uniform float uDecay;
uniform float uThreshold;
varying vec2 vUv;

float grHash(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

void main() {
  const int SAMPLES = 28;
  vec2 delta = (vUv - uSunPos) * (uDensity / float(SAMPLES));
  vec2 p = vUv - delta * grHash(gl_FragCoord.xy);
  float illum = 1.0;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < SAMPLES; i++) {
    p -= delta;
    vec3 s = texture2D(tDiffuse, clamp(p, vec2(0.0), vec2(1.0))).rgb;
    float lum = dot(s, vec3(0.2126, 0.7152, 0.0722));
    acc += s * smoothstep(uThreshold, uThreshold * 2.2, lum) * illum;
    illum *= uDecay;
  }
  gl_FragColor = vec4(acc / float(SAMPLES), 1.0);
}
`;

const COMPOSITE_FRAG = /* glsl */`
precision highp float;
uniform sampler2D tDiffuse;
uniform sampler2D tRays;
uniform vec3  uTint;
uniform float uIntensity;
varying vec2 vUv;
void main() {
  vec3 base = texture2D(tDiffuse, vUv).rgb;
  vec3 rays = texture2D(tRays, vUv).rgb;
  gl_FragColor = vec4(base + rays * uTint * uIntensity, 1.0);
}
`;

/**
 * Screen-space light shafts. The bright, unoccluded part of the frame around
 * the sun is smeared radially outward, so terrain, props and cloud banks all
 * carve shafts out of it for free. Intensity is driven from Sky.setTimeOfDay:
 * strongest when the sun is low and near the frame.
 */
export class GodRaysPass extends Pass {
  constructor(width, height) {
    super();
    this.needsSwap = true;
    this.enabled = true;

    this.rt = new THREE.WebGLRenderTarget(Math.max(2, width >> 2), Math.max(2, height >> 2), {
      type: THREE.HalfFloatType, depthBuffer: false, generateMipmaps: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      colorSpace: THREE.LinearSRGBColorSpace,
    });

    this.raysMaterial = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: RAYS_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        uSunPos: { value: new THREE.Vector2(0.5, 0.5) },
        uDensity: { value: 0.72 },
        uDecay: { value: 0.955 },
        uThreshold: { value: 0.9 },
      },
      depthTest: false, depthWrite: false,
    });
    this.compositeMaterial = new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: COMPOSITE_FRAG,
      uniforms: {
        tDiffuse: { value: null },
        tRays: { value: this.rt.texture },
        uTint: { value: new THREE.Color(1, 0.86, 0.66) },
        uIntensity: { value: 0.0 },
      },
      depthTest: false, depthWrite: false,
    });
    this._quad = new FullScreenQuad(this.raysMaterial);
  }

  setSize(w, h) { this.rt.setSize(Math.max(2, w >> 2), Math.max(2, h >> 2)); }

  render(renderer, writeBuffer, readBuffer) {
    if (this.compositeMaterial.uniforms.uIntensity.value <= 0.0005) {
      // pass through untouched
      this.compositeMaterial.uniforms.tDiffuse.value = readBuffer.texture;
      this._quad.material = this.compositeMaterial;
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      if (this.clear) renderer.clear();
      this._quad.render(renderer);
      return;
    }

    this.raysMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    this._quad.material = this.raysMaterial;
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    this._quad.render(renderer);

    this.compositeMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    this._quad.material = this.compositeMaterial;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    if (this.clear) renderer.clear();
    this._quad.render(renderer);
  }

  dispose() {
    this.rt.dispose();
    this.raysMaterial.dispose();
    this.compositeMaterial.dispose();
    this._quad.dispose();
  }
}
