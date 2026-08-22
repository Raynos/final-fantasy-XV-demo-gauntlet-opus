import * as THREE from 'three';

/**
 * Instanced 3D crystal shards — the physical half of the warp-strike look.
 *
 * These are real faceted solids, not billboards: they tumble, catch a fake
 * specular along their facets and pick up a fresnel rim, which is what stops
 * the warp effect reading as "a bunch of glowing sprites". One draw call for
 * the whole swarm; motion is integrated in the vertex shader from the same
 * clock the particle systems use, so a scenario can freeze the swarm mid-flight.
 */
export class CrystalShards {
  _dirtyHi!: number;
  _dirtyLo!: number;
  aAxis!: THREE.InstancedBufferAttribute;
  aColor!: THREE.InstancedBufferAttribute;
  aParams!: THREE.InstancedBufferAttribute;
  aParams2!: THREE.InstancedBufferAttribute;
  aPos0!: THREE.InstancedBufferAttribute;
  aVel!: THREE.InstancedBufferAttribute;
  capacity!: number;
  cursor!: number;
  material!: THREE.ShaderMaterial;
  mesh!: THREE.Mesh;
  uniforms!: any;
  constructor({ capacity = 320, renderOrder = 21 } = {}) {
    this.capacity = capacity;
    this.cursor = 0;

    const base = shardGeometry();
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.setAttribute('position', base.getAttribute('position'));
    geo.setAttribute('normal', base.getAttribute('normal'));
    geo.setAttribute('uv', base.getAttribute('uv'));
    geo.instanceCount = capacity;

    const mk = (n: any) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.aPos0 = mk(3); this.aVel = mk(3); this.aAxis = mk(3);
    this.aColor = mk(3);
    this.aParams = mk(4);   // t0, life, size, spinRate
    this.aParams2 = mk(4);  // drag, gravity, stretch, phase
    geo.setAttribute('aPos0', this.aPos0);
    geo.setAttribute('aVel', this.aVel);
    geo.setAttribute('aAxis', this.aAxis);
    geo.setAttribute('aColor', this.aColor);
    geo.setAttribute('aParams', this.aParams);
    geo.setAttribute('aParams2', this.aParams2);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    for (let i = 0; i < capacity; i++) this.aParams.array[i * 4 + 1] = -1;

    this.uniforms = {
      uTime: { value: 0 },
      uIntensity: { value: 0.68 },
      uRim: { value: new THREE.Color(0x8fd8ff) },
      uLightDir: { value: new THREE.Vector3(-0.5, 0.75, 0.42).normalize() },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SHARD_VERT,
      fragmentShader: SHARD_FRAG,
      transparent: true,
      blending: THREE.NormalBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.matrixAutoUpdate = false;
    this._dirtyLo = Infinity; this._dirtyHi = -Infinity;
  }

  /**
   * @param s {pos, vel, axis, color, t0, life, size, spin, drag, gravity, stretch, phase}
   */
  emit(s: any) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    const w = (attr: any, v: any, n: any) => {
      const a = attr.array;
      a[i * n] = v.x !== undefined ? v.x : v[0];
      a[i * n + 1] = v.y !== undefined ? v.y : v[1];
      a[i * n + 2] = v.z !== undefined ? v.z : v[2];
    };
    w(this.aPos0, s.pos, 3);
    w(this.aVel, s.vel || { x: 0, y: 0, z: 0 }, 3);
    w(this.aAxis, s.axis || { x: 0, y: 1, z: 0 }, 3);
    const c = s.color || { r: 0.35, g: 0.75, b: 1 };
    const ca = this.aColor.array;
    ca[i * 3] = c.r !== undefined ? c.r : c[0];
    ca[i * 3 + 1] = c.g !== undefined ? c.g : c[1];
    ca[i * 3 + 2] = c.b !== undefined ? c.b : c[2];
    const q = this.aParams.array;
    q[i * 4] = s.t0; q[i * 4 + 1] = s.life; q[i * 4 + 2] = s.size; q[i * 4 + 3] = s.spin || 0;
    const r = this.aParams2.array;
    r[i * 4] = s.drag || 0; r[i * 4 + 1] = s.gravity || 0;
    r[i * 4 + 2] = s.stretch || 0; r[i * 4 + 3] = s.phase || 0;
    if (i < this._dirtyLo) this._dirtyLo = i;
    if (i > this._dirtyHi) this._dirtyHi = i;
  }

  flush() {
    if (this._dirtyHi < this._dirtyLo) return;
    const lo = this._dirtyLo, n = this._dirtyHi - lo + 1;
    const buffers: [THREE.InstancedBufferAttribute, number][] = [
      [this.aPos0, 3], [this.aVel, 3], [this.aAxis, 3],
      [this.aColor, 3], [this.aParams, 4], [this.aParams2, 4],
    ];
    for (const [a, s] of buffers) {
      a.clearUpdateRanges();
      a.addUpdateRange(lo * s, n * s);
      a.needsUpdate = true;
    }
    this._dirtyLo = Infinity; this._dirtyHi = -Infinity;
  }

  setClock(c: any) { this.uniforms.uTime.value = c; }

  clear() {
    const q = this.aParams.array;
    for (let i = 0; i < this.capacity; i++) q[i * 4 + 1] = -1;
    this.aParams.clearUpdateRanges();
    this.aParams.needsUpdate = true;
    this.cursor = 0;
    this._dirtyLo = Infinity; this._dirtyHi = -Infinity;
  }

  dispose() { this.mesh.geometry.dispose(); this.material.dispose(); }
}

/**
 * A tapered hexagonal crystal: pointed tip, wide shoulder, short tail point.
 * Flat-shaded facets are essential — smooth normals would kill the read.
 */
export function shardGeometry(sides = 6) {
  const pos = [], nor = [], uvs = [], idx = [];
  // profile rings: [y, radius]
  const rings = [[-0.55, 0.0], [-0.30, 0.20], [0.05, 0.30], [0.55, 0.14], [1.0, 0.0]];
  const ringStart = [];
  for (let r = 0; r < rings.length; r++) {
    ringStart.push(pos.length / 3);
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      pos.push(Math.cos(a) * rings[r][1], rings[r][0], Math.sin(a) * rings[r][1]);
      nor.push(0, 0, 0);
      uvs.push(i / sides, r / (rings.length - 1));
    }
  }
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides;
      const a = ringStart[r] + i, b = ringStart[r] + j;
      const c = ringStart[r + 1] + i, d = ringStart[r + 1] + j;
      idx.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  const flat = geo.toNonIndexed();
  flat.computeVertexNormals();
  return flat;
}

const SHARD_VERT = /* glsl */`
precision highp float;
attribute vec3 aPos0, aVel, aAxis, aColor;
attribute vec4 aParams;    // t0, life, size, spinRate
attribute vec4 aParams2;   // drag, gravity, stretch, phase
uniform float uTime;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vView;
varying float vAlpha;
varying float vFacet;

mat3 axisAngle(vec3 ax, float ang) {
  float s = sin(ang), c = cos(ang), ic = 1.0 - c;
  return mat3(
    ax.x*ax.x*ic + c,       ax.x*ax.y*ic + ax.z*s, ax.x*ax.z*ic - ax.y*s,
    ax.x*ax.y*ic - ax.z*s,  ax.y*ax.y*ic + c,      ax.y*ax.z*ic + ax.x*s,
    ax.x*ax.z*ic + ax.y*s,  ax.y*ax.z*ic - ax.x*s, ax.z*ax.z*ic + c
  );
}

void main() {
  float life = aParams.y;
  float t = uTime - aParams.x;
  float n = t / max(life, 1e-4);
  vColor = aColor;
  if (life <= 0.0 || n < 0.0 || n > 1.0) {
    vAlpha = 0.0; vNormal = vec3(0.0, 1.0, 0.0); vView = vec3(0.0, 0.0, 1.0); vFacet = 0.0;
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);
    return;
  }

  float k = aParams2.x;
  vec3 g = vec3(0.0, aParams2.y, 0.0);
  vec3 p, vel;
  if (k > 0.001) {
    vec3 vT = g / k;
    float e = exp(-k * t);
    p = aPos0 + vT * t + (aVel - vT) * (1.0 - e) / k;
    vel = (aVel - vT) * e + vT;
  } else {
    p = aPos0 + aVel * t + 0.5 * g * t * t;
    vel = aVel + g * t;
  }

  float stretch = aParams2.z;
  vec3 lp = position;
  vec3 ln = normal;
  if (stretch > 0.0 && dot(vel, vel) > 1e-4) {
    // long axis rides the velocity vector
    vec3 up = normalize(vel);
    vec3 ref = abs(up.y) > 0.92 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 rt = normalize(cross(up, ref));
    vec3 fw = cross(rt, up);
    mat3 basis = mat3(rt, up, fw);
    mat3 spin = axisAngle(up, aParams2.w + aParams.w * t);
    lp = spin * (basis * vec3(lp.x, lp.y * (1.0 + stretch), lp.z));
    ln = spin * (basis * ln);
  } else {
    mat3 rot = axisAngle(normalize(aAxis), aParams2.w + aParams.w * t);
    lp = rot * lp;
    ln = rot * ln;
  }

  float scale = aParams.z * (0.25 + 0.75 * smoothstep(0.0, 0.12, n)) * (1.0 - pow(n, 2.4) * 0.9);
  vec3 world = p + lp * scale;

  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  vNormal = normalize(mat3(modelViewMatrix) * ln);
  vView = normalize(-mv.xyz);
  vFacet = uv.y;
  vAlpha = smoothstep(0.0, 0.06, n) * pow(1.0 - n, 1.1);
  gl_Position = projectionMatrix * mv;
}
`;

const SHARD_FRAG = /* glsl */`
precision highp float;
uniform float uIntensity;
uniform vec3 uRim;
uniform vec3 uLightDir;
varying vec3 vColor;
varying vec3 vNormal;
varying vec3 vView;
varying float vAlpha;
varying float vFacet;

void main() {
  if (vAlpha <= 0.004) discard;
  vec3 N = normalize(vNormal);
  vec3 V = normalize(vView);
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.1);
  float facetLight = 0.35 + 0.65 * abs(dot(N, normalize(uLightDir)));
  // hot inner core toward the tip, deep saturated colour in the body
  vec3 body = vColor * (0.30 + 0.70 * facetLight);
  vec3 col = mix(body, uRim * vColor * 2.6, fres * 0.7);
  col += uRim * pow(fres, 6.0) * 1.1;
  col *= uIntensity * (0.65 + 0.5 * vFacet);
  float a = vAlpha * (0.14 + 0.55 * fres + 0.16 * facetLight);
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.80));
}
`;
