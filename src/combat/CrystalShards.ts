import * as THREE from 'three';
import type { ColorLike, Vec3Like } from './ParticleSystem.ts';

/**
 * Instanced 3D crystal shards — the physical half of the warp-strike look.
 *
 * These are real faceted solids, not billboards: they tumble, catch a fake
 * specular along their facets and pick up a fresnel rim, which is what stops
 * the warp effect reading as "a bunch of glowing sprites". One draw call for
 * the whole swarm; motion is integrated in the vertex shader from the same
 * clock the particle systems use, so a scenario can freeze the swarm mid-flight.
 */
/** The shard shader's uniform block; the index signature is `ShaderMaterial`'s. */
export interface ShardUniforms {
  [uniform: string]: THREE.IUniform;
  uTime: THREE.IUniform<number>;
  uIntensity: THREE.IUniform<number>;
  /** Rim colour picked up along a facet edge. */
  uRim: THREE.IUniform<THREE.Color>;
  uLightDir: THREE.IUniform<THREE.Vector3>;
}

/** One shard: where it starts, how it tumbles, and how long it lives. */
export interface ShardSpec {
  pos: Vec3Like;
  vel?: Vec3Like;
  /** Spin axis. Defaults to +Y. */
  axis?: Vec3Like;
  color?: ColorLike;
  /** Birth time on the effect clock, seconds. */
  t0: number;
  life: number;
  size: number;
  /** Radians per second about `axis`. */
  spin?: number;
  drag?: number;
  gravity?: number;
  /** Velocity-aligned stretch. */
  stretch?: number;
  /** Phase offset so a ring of shards does not pulse in lock-step. */
  phase?: number;
}

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
  uniforms!: ShardUniforms;
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

    const mk = (n: number) => {
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
      uIntensity: { value: 0.95 },
      // Cyan-blue, per BRIEF's "a streak of cyan-blue crystal shards". A
      // paler rim reads as white the moment the burst lands on sunlit sand,
      // because the blending is additive and the ground is already bright.
      uRim: { value: new THREE.Color(0x74cdff) },
      uLightDir: { value: new THREE.Vector3(-0.5, 0.75, 0.42).normalize() },
    };
    // **Additive and front-faced**, which is what makes these read as crystal
    // rather than as blue confetti.
    //
    // They were `NormalBlending` + `DoubleSide` + `depthWrite: false`, alone
    // in this directory — every other VFX material here is additive — and
    // that combination costs the effect twice. Normal blending over a bright
    // sky *darkens*: a mid-blue body at alpha 0.8 subtracts 80% of whatever
    // is behind it and adds back a colour dimmer than the sky, so a shard in
    // front of the fight is a hole in it. And double-siding a closed solid
    // with the depth write off draws the far facets over the near ones, which
    // destroys the facet read the geometry exists for: the shards flatten
    // into leaves. `shardGeometry` is a closed, outward-wound bipyramid (the
    // winding is checked in that function's own note), so front faces alone
    // are the whole silhouette.
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SHARD_VERT,
      fragmentShader: SHARD_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.FrontSide,
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
  emit(s: ShardSpec) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    // `Array.isArray` is the discriminant the old `.x !== undefined` test was
    // really making; `ParticleSystem` reads the same three shapes the same way.
    const w = (attr: THREE.InstancedBufferAttribute, v: Vec3Like, n: number) => {
      const a = attr.array;
      if (Array.isArray(v)) { a[i * n] = v[0]; a[i * n + 1] = v[1]; a[i * n + 2] = v[2]; }
      else { a[i * n] = v.x; a[i * n + 1] = v.y; a[i * n + 2] = v.z; }
    };
    w(this.aPos0, s.pos, 3);
    w(this.aVel, s.vel || { x: 0, y: 0, z: 0 }, 3);
    w(this.aAxis, s.axis || { x: 0, y: 1, z: 0 }, 3);
    const c: ColorLike = s.color || { r: 0.35, g: 0.75, b: 1 };
    const ca = this.aColor.array;
    if (Array.isArray(c)) { ca[i * 3] = c[0]; ca[i * 3 + 1] = c[1]; ca[i * 3 + 2] = c[2]; }
    else { ca[i * 3] = c.r; ca[i * 3 + 1] = c.g; ca[i * 3 + 2] = c.b; }
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

  setClock(c: number) { this.uniforms.uTime.value = c; }

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
 *
 * **Wound outward**, which the material depends on: it draws `FrontSide`
 * only. Ring `r` vertex `i` is at `(cos a * R, y, sin a * R)` and the quad is
 * emitted `(a, c, b)` / `(b, c, d)` with `c` on the ring above; taking the
 * cross product at `i = 0` on the widest band gives a normal with a positive
 * `x`, which is radially outward there. `computeVertexNormals` on the
 * non-indexed copy then agrees with it, and every transform the vertex shader
 * applies — `axisAngle`, the velocity basis, the positive stretch — has a
 * determinant of `+1`, so none of them flips it.
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
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  // Every pow() here takes a base that is clamped or a smoothstep, never a
  // raw varying: a negative base is NaN on this backend and NaN in a trail
  // shader in this directory is a recorded defect.
  float fres = pow(1.0 - ndv, 2.4);
  float facetLight = 0.35 + 0.65 * abs(dot(N, normalize(uLightDir)));

  // The emissive gradient the flat version had no trace of. vFacet is the
  // ring index along the crystal -- 0 at the tail point, 1 at the tip -- so the
  // tip carries a near-white cyan core and the body stays a deep blue glass.
  float tip = smoothstep(0.30, 1.0, vFacet);
  vec3 core = mix(vColor, uRim, 0.44);
  vec3 body = vColor * (0.16 + 0.52 * facetLight);
  vec3 col = mix(body, core * 1.9, tip * 0.72);
  col = mix(col, uRim * 2.0, fres * 0.74);             // lit facet edges
  col += uRim * pow(fres, 5.0) * 1.9;                  // the rim itself
  col += core * pow(tip, 3.0) * 1.4;                   // the hot tip
  col *= uIntensity;

  // Glass, not paper. Under additive blending the alpha is intensity rather
  // than coverage, so a nearly clear body with bright edges and a bright tip
  // is a shard you can see the fight through.
  float a = vAlpha * (0.06 + 0.44 * fres + 0.34 * tip * tip);
  gl_FragColor = vec4(col, clamp(a, 0.0, 0.62));
}
`;
