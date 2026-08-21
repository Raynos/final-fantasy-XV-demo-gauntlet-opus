import * as THREE from 'three';

/**
 * GPU particle system. One draw call per system; the CPU only ever writes
 * spawn state into a ring buffer and the vertex shader integrates motion
 * analytically from a single `uTime` uniform.
 *
 * Because every particle carries an explicit spawn time, effects can be
 * *authored in the past* (`t0` in the past) and the whole system frozen at an
 * arbitrary clock value — which is how the screenshot scenarios pin a
 * mid-explosion frame deterministically, regardless of settle count.
 *
 * Features
 *  - analytic drag + gravity integration (no per-frame CPU work)
 *  - velocity-stretched billboards for sparks, round billboards for everything else
 *  - curl-ish turbulence for smoke
 *  - soft particles: depth-fade against a scene depth texture, so nothing
 *    intersects geometry with a hard edge
 *  - manual exponential fog so alpha-blended smoke sits in the aerial perspective
 */


/**
 * One particle. `pos` is the only field every caller sets; the rest default,
 * which is what lets a call site say "a spark here, for 0.4 s" and nothing else.
 *
 * `pos`/`vel`/`color` accept a `Vector3`/`Color` or a plain triple because both
 * are passed all over the VFX code, and normalising them at 4,000 emissions a
 * frame would cost more than reading two shapes.
 */
/** How one pool is built. Every field has a default; `map` is the sprite. */
export interface PoolOpts {
  capacity?: number;
  map?: THREE.Texture;
  blending?: THREE.Blending;
  fog?: boolean;
  /** Depth-softening distance, world units. */
  softness?: number;
  renderOrder?: number;
  name?: string;
  depthTest?: boolean;
}

export interface ParticleSpec {
  pos: THREE.Vector3 | number[];
  vel?: THREE.Vector3 | number[];
  color?: THREE.Color | number[];
  /** Birth time, seconds on the effect clock. */
  t0?: number;
  /** Lifetime, seconds. */
  life?: number;
  size0?: number;
  size1?: number;
  drag?: number;
  gravity?: number;
  spin?: number;
  spinRate?: number;
  /** Velocity-aligned stretch, for sparks and rain. */
  stretch?: number;
  turbulence?: number;
  intensity?: number;
  fade?: number;
  [extra: string]: any;
}

export class ParticleSystem {
  _dirtyHi!: any;
  _dirtyLo!: any;
  aColor!: any;
  aParams!: any;
  aParams2!: any;
  aParams3!: any;
  aPos0!: any;
  aVel!: any;
  capacity!: any;
  cursor!: number;
  live!: number;
  material!: any;
  mesh!: THREE.Mesh;
  uniforms!: any;
  useFog!: any;
  constructor({
    capacity = 2048, map, blending = THREE.AdditiveBlending, fog = false,
    softness = 0.9, renderOrder = 20, name = 'particles', depthTest = true,
  }: PoolOpts = {}) {
    this.capacity = capacity;
    this.cursor = 0;
    this.live = 0;
    this._dirtyLo = Infinity;
    this._dirtyHi = -Infinity;

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(
      [-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3
    ));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.instanceCount = capacity;

    const mk = (n: any) => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(capacity * n), n);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.aPos0 = mk(3);
    this.aVel = mk(3);
    this.aColor = mk(3);
    this.aParams = mk(4);    // t0, life, size0, size1
    this.aParams2 = mk(4);   // drag, gravity, spin0, spinRate
    this.aParams3 = mk(4);   // stretch, turbulence, intensity, fadePow
    geo.setAttribute('aPos0', this.aPos0);
    geo.setAttribute('aVel', this.aVel);
    geo.setAttribute('aColor', this.aColor);
    geo.setAttribute('aParams', this.aParams);
    geo.setAttribute('aParams2', this.aParams2);
    geo.setAttribute('aParams3', this.aParams3);

    // everything is emitted in world space; never cull
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    // life starts at 0 so nothing renders until emitted
    for (let i = 0; i < capacity; i++) this.aParams.array[i * 4 + 1] = -1;

    this.uniforms = {
      uTime: { value: 0 },
      uMap: { value: map },
      uDepth: { value: null },
      uSoft: { value: 0 },
      uSoftDist: { value: softness },
      uCamNF: { value: new THREE.Vector2(0.15, 6000) },
      uFogColor: { value: new THREE.Color(0.6, 0.7, 0.85) },
      uFogDensity: { value: fog ? 0.0035 : 0.0 },
      uGlobal: { value: 1 },
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      blending,
      depthWrite: false,
      depthTest,
      side: THREE.DoubleSide,
      toneMapped: true,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.matrixAutoUpdate = false;
    this.useFog = fog;
  }

  /** Emit a single particle. */
  emit(p: ParticleSpec) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.capacity;
    // Read either shape without narrowing: callers pass a Vector3 or a plain
    // triple, and the `.x ?? [0]` form is the check. Typed as the union, every
    // one of these six accesses is an error on one arm or the other.
    const pos = p.pos as any, vel = (p.vel || ZERO) as any, col = (p.color || WHITE) as any;

    const a = this.aPos0.array, b = this.aVel.array, c = this.aColor.array;
    a[i * 3] = pos.x !== undefined ? pos.x : pos[0];
    a[i * 3 + 1] = pos.y !== undefined ? pos.y : pos[1];
    a[i * 3 + 2] = pos.z !== undefined ? pos.z : pos[2];
    b[i * 3] = vel.x !== undefined ? vel.x : vel[0];
    b[i * 3 + 1] = vel.y !== undefined ? vel.y : vel[1];
    b[i * 3 + 2] = vel.z !== undefined ? vel.z : vel[2];
    c[i * 3] = col.r !== undefined ? col.r : col[0];
    c[i * 3 + 1] = col.g !== undefined ? col.g : col[1];
    c[i * 3 + 2] = col.b !== undefined ? col.b : col[2];

    const q = this.aParams.array;
    q[i * 4] = p.t0; q[i * 4 + 1] = p.life;
    q[i * 4 + 2] = p.size0; q[i * 4 + 3] = p.size1 !== undefined ? p.size1 : p.size0;

    const r = this.aParams2.array;
    r[i * 4] = p.drag || 0; r[i * 4 + 1] = p.gravity || 0;
    r[i * 4 + 2] = p.spin || 0; r[i * 4 + 3] = p.spinRate || 0;

    const s = this.aParams3.array;
    s[i * 4] = p.stretch || 0; s[i * 4 + 1] = p.turbulence || 0;
    s[i * 4 + 2] = p.intensity !== undefined ? p.intensity : 1;
    s[i * 4 + 3] = p.fade !== undefined ? p.fade : 1.4;

    if (i < this._dirtyLo) this._dirtyLo = i;
    if (i > this._dirtyHi) this._dirtyHi = i;
    return i;
  }

  /** Flush CPU writes to the GPU using tight update ranges. */
  flush() {
    if (this._dirtyHi < this._dirtyLo) return;
    const lo = this._dirtyLo, n = this._dirtyHi - lo + 1;
    for (const [attr, size] of [
      [this.aPos0, 3], [this.aVel, 3], [this.aColor, 3],
      [this.aParams, 4], [this.aParams2, 4], [this.aParams3, 4],
    ]) {
      attr.clearUpdateRanges();
      attr.addUpdateRange(lo * size, n * size);
      attr.needsUpdate = true;
    }
    this._dirtyLo = Infinity; this._dirtyHi = -Infinity;
  }

  /** @param clock system time in seconds */
  setClock(clock: number) { this.uniforms.uTime.value = clock; }

  /** Wire the shared depth texture for soft-particle fading. */
  setDepth(texture: any, near: any, far: any) {
    this.uniforms.uDepth.value = texture;
    this.uniforms.uSoft.value = texture ? 1 : 0;
    this.uniforms.uCamNF.value.set(near, far);
  }

  /** Read fog from the scene so smoke matches the world's aerial perspective. */
  syncFog(scene: any) {
    if (!this.useFog) return;
    const f = scene.fog;
    if (!f) { this.uniforms.uFogDensity.value = 0; return; }
    this.uniforms.uFogColor.value.copy(f.color);
    this.uniforms.uFogDensity.value = f.density !== undefined
      ? f.density
      : 1.0 / Math.max(1, f.far);
  }

  /** Retire every live particle (scenario reset). */
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

const ZERO = { x: 0, y: 0, z: 0 };
const WHITE = { r: 1, g: 1, b: 1 };

const VERT = /* glsl */`
precision highp float;

attribute vec3 aPos0;
attribute vec3 aVel;
attribute vec3 aColor;
attribute vec4 aParams;    // t0, life, size0, size1
attribute vec4 aParams2;   // drag, gravity, spin0, spinRate
attribute vec4 aParams3;   // stretch, turbulence, intensity, fadePow

uniform float uTime;

varying vec2 vUv;
varying vec3 vColor;
varying float vIntensity;
varying float vAlpha;
varying vec4 vScreen;
varying float vViewDepth;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

void main() {
  vUv = uv;
  vColor = aColor;
  vIntensity = aParams3.z;

  float life = aParams.y;
  float t = uTime - aParams.x;
  float n = t / max(life, 1e-4);

  if (life <= 0.0 || n < 0.0 || n > 1.0) {
    vAlpha = 0.0;
    vScreen = vec4(0.0, 0.0, 2.0, 1.0);
    vViewDepth = 0.0;
    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);   // clipped
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

  float seed = hash11(dot(aPos0, vec3(12.9898, 78.233, 37.719)) + dot(aVel, vec3(3.17, 9.41, 1.73)));
  float turb = aParams3.y;
  if (turb > 0.0) {
    float s = seed * 43.0;
    vec3 w = vec3(
      sin(t * 1.61 + s) + 0.52 * sin(t * 3.37 + s * 2.13),
      0.55 * sin(t * 1.21 + s * 1.71) + 0.30 * cos(t * 2.9 + s),
      cos(t * 1.83 + s * 0.77) + 0.52 * cos(t * 3.11 + s * 1.31)
    );
    p += turb * w * t;
    vel += turb * w * 0.6;
  }

  float size = mix(aParams.z, aParams.w, n);

  // alpha envelope: quick rise, authored falloff
  float rise = smoothstep(0.0, 0.10, n);
  vAlpha = rise * pow(max(0.0, 1.0 - n), aParams3.w);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec2 q = position.xy;

  float st = aParams3.x;
  if (st > 0.0) {
    vec3 vView = (modelViewMatrix * vec4(vel, 0.0)).xyz;
    float sl = length(vView.xy);
    vec2 dir = sl > 1e-4 ? vView.xy / sl : vec2(0.0, 1.0);
    vec2 perp = vec2(-dir.y, dir.x);
    float len = size * (1.0 + st * length(vView));
    mv.xy += dir * (q.y * len) + perp * (q.x * size);
  } else {
    float rot = aParams2.z + aParams2.w * t;
    float cs = cos(rot), sn = sin(rot);
    mv.xy += vec2(q.x * cs - q.y * sn, q.x * sn + q.y * cs) * size;
  }

  vViewDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
  vScreen = gl_Position;
}
`;

const FRAG = /* glsl */`
precision highp float;

uniform sampler2D uMap;
uniform sampler2D uDepth;
uniform float uSoft;
uniform float uSoftDist;
uniform vec2 uCamNF;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uGlobal;

varying vec2 vUv;
varying vec3 vColor;
varying float vIntensity;
varying float vAlpha;
varying vec4 vScreen;
varying float vViewDepth;

float linearDepth(float d) {
  float n = uCamNF.x, f = uCamNF.y;
  float ndc = d * 2.0 - 1.0;
  return (2.0 * n * f) / (f + n - ndc * (f - n));
}

void main() {
  if (vAlpha <= 0.0) discard;
  vec4 texel = texture2D(uMap, vUv);
  float a = texel.a * vAlpha * uGlobal;
  if (a <= 0.004) discard;

  vec3 col = vColor * texel.rgb * vIntensity;

  if (uSoft > 0.5) {
    vec2 suv = (vScreen.xy / vScreen.w) * 0.5 + 0.5;
    float raw = texture2D(uDepth, suv).x;
    float sceneD = raw >= 1.0 ? uCamNF.y : linearDepth(raw);
    a *= clamp((sceneD - vViewDepth) / uSoftDist, 0.0, 1.0);
    // fade out as the sprite approaches the near plane so nothing pops
    a *= smoothstep(0.10, 0.75, vViewDepth);
  }

  if (uFogDensity > 0.0) {
    float fd = uFogDensity * vViewDepth;
    float fogFactor = 1.0 - exp(-fd * fd);
    col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));
  }

  if (a <= 0.004) discard;
  gl_FragColor = vec4(col, a);
}
`;
