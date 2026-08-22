import * as THREE from 'three';
import type { AtmosphereUniforms } from '../Sky.ts';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { ATMO_COMMON, ATMO_SCATTER } from '../../shaders/atmosphere.glsl.ts';
import { SKY_VERT, SKY_FRAG } from '../../shaders/sky.glsl.ts';

const QUAD_VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const TRANSMITTANCE_FRAG = /* glsl */`
precision highp float;
${ATMO_COMMON}
varying vec2 vUv;
void main() {
  float r, mu;
  atmTransmittanceRMu(vUv, r, mu);
  vec3 ro = vec3(0.0, r, 0.0);
  vec3 rd = vec3(sqrt(max(0.0, 1.0 - mu * mu)), mu, 0.0);
  float tTop = atmRaySphere(ro, rd, ATM_TOP_R);
  vec3 od = vec3(0.0);
  const int N = 40;
  float dt = tTop / float(N);
  for (int i = 0; i < N; i++) {
    vec3 p = ro + rd * (float(i) + 0.5) * dt;
    od += atmExtinction(length(p) - ATM_PLANET_R) * dt;
  }
  gl_FragColor = vec4(exp(-od), 1.0);
}
`;

const SKYVIEW_FRAG = /* glsl */`
precision highp float;
${ATMO_COMMON}
${ATMO_SCATTER}
uniform sampler2D uTransLut;
uniform float uCamAlt;
uniform float uSunY;
uniform float uMsBoost;
varying vec2 vUv;
void main() {
  float r = ATM_PLANET_R + max(uCamAlt, 1.0);
  vec3 dir = atmSkyViewDir(vUv, r);
  float sy = clamp(uSunY, -1.0, 1.0);
  vec3 sunDir = vec3(sqrt(max(0.0, 1.0 - sy * sy)), sy, 0.0);
  vec3 ro = vec3(0.0, r, 0.0);
  vec3 tr;
  vec3 L = atmIntegrate(ro, dir, sunDir, uTransLut, 32, uMsBoost, tr);
  gl_FragColor = vec4(max(L, 0.0), 1.0);
}
`;

/**
 * Owns the scattering LUTs and the sky dome mesh.
 * The dome is a sphere centred on the camera; because the fragment world
 * position lies exactly on the view ray, `normalize(vWorldPos - cameraPosition)`
 * is the exact per-pixel ray direction whatever the tessellation, so there is
 * no dome seam and no interpolation error on the sun disc.
 */
export class Atmosphere {
  _skyQuad!: FullScreenQuad;
  _transQuad!: FullScreenQuad;
  envMaterial!: THREE.ShaderMaterial;
  envMesh!: THREE.Mesh;
  material!: THREE.ShaderMaterial;
  mesh!: THREE.Mesh;
  renderer!: THREE.WebGLRenderer;
  skyViewRT!: THREE.WebGLRenderTarget;
  transmittanceRT!: THREE.WebGLRenderTarget;
  uniforms!: AtmosphereUniforms;
  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;

    this.transmittanceRT = new THREE.WebGLRenderTarget(256, 64, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false, generateMipmaps: false,
      colorSpace: THREE.LinearSRGBColorSpace,
    });
    this.skyViewRT = new THREE.WebGLRenderTarget(256, 128, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false, generateMipmaps: false,
      colorSpace: THREE.LinearSRGBColorSpace,
    });

    this._transQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: TRANSMITTANCE_FRAG, depthTest: false, depthWrite: false,
    }));
    this._skyQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      vertexShader: QUAD_VERT, fragmentShader: SKYVIEW_FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        uTransLut: { value: this.transmittanceRT.texture },
        uCamAlt: { value: 20 },
        uSunY: { value: 0.5 },
        uMsBoost: { value: 1.25 },
      },
    }));

    this._bakeTransmittance();
  }

  _bakeTransmittance() {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.transmittanceRT);
    this._transQuad.render(r);
    r.setRenderTarget(prev);
  }

  /**
   * Re-integrate the sky-view LUT for the current sun elevation.
   * @param sunY sin(sun elevation)
   * @param camAlt camera altitude in metres
   * @param msBoost multiple-scattering strength
   */
  bakeSkyView(sunY: number, camAlt: number, msBoost: number) {
    const u = (this._skyQuad.material as THREE.ShaderMaterial).uniforms;
    u.uSunY.value = sunY;
    u.uCamAlt.value = camAlt;
    u.uMsBoost.value = msBoost;
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.skyViewRT);
    this._skyQuad.render(r);
    r.setRenderTarget(prev);
  }

  /**
   * Build the dome mesh. Two materials share the uniform *objects* so the
   * screen dome and the environment-probe dome always agree; only the cloud
   * source differs.
   */
  createDome(uniforms: AtmosphereUniforms) {
    this.uniforms = uniforms;
    const geo = new THREE.SphereGeometry(4000, 48, 32);
    const mat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
    });
    this.material = mat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = -1000;
    mesh.matrixAutoUpdate = false;
    this.mesh = mesh;

    // second material for the environment bake: analytic clouds, no screen buffer
    // the uniform *objects* are shared, so both domes see the same values; only
    // the cloud source differs
    const envUniforms: Record<string, THREE.IUniform> = { ...uniforms };
    envUniforms.uCloudMode = { value: 0 };
    this.envMaterial = mat.clone();
    this.envMaterial.uniforms = envUniforms;
    const envMesh = new THREE.Mesh(geo, this.envMaterial);
    envMesh.frustumCulled = false;
    this.envMesh = envMesh;

    return mesh;
  }

  dispose() {
    this.transmittanceRT.dispose();
    this.skyViewRT.dispose();
    this._transQuad.dispose();
    this._skyQuad.dispose();
    this.material?.dispose();
    this.envMaterial?.dispose();
    this.mesh?.geometry.dispose();
  }
}
