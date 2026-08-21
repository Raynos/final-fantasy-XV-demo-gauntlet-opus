import * as THREE from 'three';
import { turbulence } from './VfxTextures.ts';

/**
 * Camera-facing polyline ribbons: warp dash streaks, lightning arcs, magic
 * beams. The ribbon is billboarded around its own path tangent in the vertex
 * shader, so it always presents its full width to the camera without ever
 * showing an edge-on sliver.
 *
 * The fragment shader offsets its turbulence lookup per colour channel, which
 * gives the streak a genuine chromatic dispersion instead of a flat tint.
 */
export class PolyBeam {
  constructor({
    segments = 56, head = 0xbfe8ff, tail = 0x1b3f8f, core = 0xffffff,
    width = 0.22, taper = 0.85, headBulge = 0.0, falloff = 0.7,
    intensity = 2.4, renderOrder = 24, scroll = 1.2,
  } = {}) {
    this.segments = segments;
    const n = segments + 1;

    this.pathPos = new Float32Array(n * 2 * 3);
    this.pathTan = new Float32Array(n * 2 * 3);
    const aT = new Float32Array(n * 2);
    const aSide = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const t = i / segments;
      aT[i * 2] = t; aT[i * 2 + 1] = t;
      aSide[i * 2] = -1; aSide[i * 2 + 1] = 1;
    }

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pathPos, 3).setUsage(THREE.DynamicDrawUsage);
    this.tanAttr = new THREE.BufferAttribute(this.pathTan, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aTangent', this.tanAttr);
    geo.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
    geo.setAttribute('aSide', new THREE.BufferAttribute(aSide, 1));
    const idx = [];
    for (let i = 0; i < segments; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, d, a, d, c);
    }
    geo.setIndex(idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.uniforms = {
      uHead: { value: new THREE.Color(head) },
      uTail: { value: new THREE.Color(tail) },
      uCore: { value: new THREE.Color(core) },
      uWidth: { value: width },
      uTaper: { value: taper },
      uHeadBulge: { value: headBulge },
      uFalloff: { value: falloff },
      uIntensity: { value: intensity },
      uStrength: { value: 1 },
      uTime: { value: 0 },
      uScroll: { value: scroll },
      uWobble: { value: 0 },
      uPhase: { value: 0 },
      uChroma: { value: 0.035 },
      uNoise: { value: turbulence() },
      uGlobal: { value: 1 },
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.visible = false;
    this._tmpA = new THREE.Vector3();
    this._tmpB = new THREE.Vector3();
  }

  /** Straight streak between two world points. */
  setLine(from, to) {
    const n = this.segments + 1;
    const p = this.pathPos, t = this.pathTan;
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const inv = 1 / Math.max(1e-5, Math.hypot(dx, dy, dz));
    for (let i = 0; i < n; i++) {
      const f = i / this.segments;
      const x = from.x + dx * f, y = from.y + dy * f, z = from.z + dz * f;
      for (let s = 0; s < 2; s++) {
        const o = (i * 2 + s) * 3;
        p[o] = x; p[o + 1] = y; p[o + 2] = z;
        t[o] = dx * inv; t[o + 1] = dy * inv; t[o + 2] = dz * inv;
      }
    }
    this.posAttr.needsUpdate = true;
    this.tanAttr.needsUpdate = true;
    this.mesh.visible = true;
    return this;
  }

  /** Arbitrary path (resampled linearly onto the ribbon's segment count). */
  setPath(points) {
    const n = this.segments + 1;
    const p = this.pathPos, t = this.pathTan;
    const m = points.length;
    const a = this._tmpA, b = this._tmpB;
    for (let i = 0; i < n; i++) {
      const f = (i / this.segments) * (m - 1);
      const i0 = Math.min(m - 1, Math.floor(f));
      const i1 = Math.min(m - 1, i0 + 1);
      const k = f - i0;
      a.lerpVectors(points[i0], points[i1], k);
      b.subVectors(points[i1], points[Math.max(0, i0 - 0)]);
      if (b.lengthSq() < 1e-8) b.set(0, 1, 0);
      b.normalize();
      for (let s = 0; s < 2; s++) {
        const o = (i * 2 + s) * 3;
        p[o] = a.x; p[o + 1] = a.y; p[o + 2] = a.z;
        t[o] = b.x; t[o + 1] = b.y; t[o + 2] = b.z;
      }
    }
    this.posAttr.needsUpdate = true;
    this.tanAttr.needsUpdate = true;
    this.mesh.visible = true;
    return this;
  }

  set strength(v) { this.uniforms.uStrength.value = v; this.mesh.visible = v > 0.001; }
  get strength() { return this.uniforms.uStrength.value; }
  set width(v) { this.uniforms.uWidth.value = v; }

  setClock(c) { this.uniforms.uTime.value = c; }
  hide() { this.mesh.visible = false; }
  dispose() { this.mesh.geometry.dispose(); this.material.dispose(); }
}

/** Build a jagged branching lightning path between two points. */
export function lightningPath(from, to, rng, { jitter = 0.5, points = 14 } = {}) {
  const pts = [];
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  dir.normalize();
  const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const rx = new THREE.Vector3().crossVectors(dir, up).normalize();
  const ry = new THREE.Vector3().crossVectors(dir, rx).normalize();
  for (let i = 0; i < points; i++) {
    const f = i / (points - 1);
    const env = Math.sin(f * Math.PI);
    const j = jitter * len * 0.13 * env;
    pts.push(new THREE.Vector3()
      .copy(from).addScaledVector(dir, len * f)
      .addScaledVector(rx, rng.gauss(0, j))
      .addScaledVector(ry, rng.gauss(0, j)));
  }
  pts[0].copy(from);
  pts[points - 1].copy(to);
  return pts;
}

const BEAM_VERT = /* glsl */`
precision highp float;
attribute vec3 aTangent;
attribute float aT;
attribute float aSide;
uniform float uWidth, uTaper, uHeadBulge, uWobble, uPhase;
varying float vT, vSide;
void main() {
  vec3 p = position;
  vec3 toCam = normalize(cameraPosition - p);
  vec3 right = cross(normalize(aTangent), toCam);
  float rl = length(right);
  right = rl > 1e-4 ? right / rl : vec3(1.0, 0.0, 0.0);

  float w = uWidth * (pow(max(aT, 0.0), uTaper) + uHeadBulge * pow(max(aT, 0.0), 14.0));
  float wob = sin(aT * 19.0 + uPhase) * 0.35 + sin(aT * 37.0 + uPhase * 1.7) * 0.16;
  p += right * (aSide * w + wob * uWobble);

  vT = aT;
  vSide = aSide * 0.5 + 0.5;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

const BEAM_FRAG = /* glsl */`
precision highp float;
uniform vec3 uHead, uTail, uCore;
uniform float uFalloff, uIntensity, uStrength, uTime, uScroll, uChroma, uGlobal;
uniform sampler2D uNoise;
varying float vT, vSide;

void main() {
  if (uStrength <= 0.002) discard;
  float e = 1.0 - abs(vSide * 2.0 - 1.0);
  float body = pow(clamp(e, 0.0, 1.0), 1.25);
  float core = pow(clamp(e, 0.0, 1.0), 9.0);

  vec2 nuv = vec2(vT * 2.3 - uTime * uScroll, vSide * 0.7);
  float n  = texture2D(uNoise, nuv).r;
  float nr = texture2D(uNoise, nuv + vec2(uChroma, 0.0)).r;
  float nb = texture2D(uNoise, nuv - vec2(uChroma, 0.0)).r;

  float a = (body * 0.34 + core * 1.75) * pow(max(vT, 0.0), uFalloff) * uStrength * uGlobal;
  a *= 0.40 + 0.95 * n;
  if (a <= 0.004) discard;

  vec3 col = mix(uTail, uHead, pow(max(vT, 0.0), 1.4));
  col *= vec3(0.72 + 0.62 * nr, 0.78 + 0.48 * n, 0.84 + 0.46 * nb);   // dispersion
  col += uCore * core * 2.2;
  col *= uIntensity;

  gl_FragColor = vec4(col, a);
}
`;
