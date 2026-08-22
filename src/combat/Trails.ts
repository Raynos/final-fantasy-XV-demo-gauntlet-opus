import * as THREE from 'three';
import { turbulence } from './VfxTextures.ts';

/**
 * Weapon-swing ribbon trails.
 *
 * A trail is a strip of quads built from (base, tip) samples taken along the
 * blade each frame. The shader turns that strip into a soft, turbulence-broken
 * energy sheet with a white-hot core and a coloured outer wash — additive, so
 * the bloom pass does the heavy lifting.
 */

const MAX_SEG = 34;

export class TrailRibbon {
  _samples!: any[];
  active!: boolean;
  ageAttr!: THREE.BufferAttribute;
  ages!: Float32Array;
  count!: number;
  life!: number;
  material!: THREE.ShaderMaterial;
  mesh!: THREE.Mesh;
  posAttr!: THREE.BufferAttribute;
  positions!: Float32Array;
  segments!: number;
  strength!: number;
  uniforms!: any;
  uvAttr!: THREE.BufferAttribute;
  uvs!: Float32Array;
  constructor({
    segments = MAX_SEG, head = 0x9fd8ff, tail = 0x1a4c9c, core = 0xffffff,
    life = 0.34, intensity = 2.6, headBias = 0.55, renderOrder = 22,
  } = {}) {
    this.segments = segments;
    this.life = life;
    this.count = 0;          // live samples
    this.strength = 0;
    this.active = false;

    const n = segments * 2;
    this.positions = new Float32Array(n * 3);
    this.uvs = new Float32Array(n * 2);
    this.ages = new Float32Array(n);

    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.uvAttr = new THREE.BufferAttribute(this.uvs, 2).setUsage(THREE.DynamicDrawUsage);
    this.ageAttr = new THREE.BufferAttribute(this.ages, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('uv', this.uvAttr);
    geo.setAttribute('aAge', this.ageAttr);

    const idx = [];
    for (let i = 0; i < segments - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, d, a, d, c);
    }
    geo.setIndex(idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.uniforms = {
      uHead: { value: new THREE.Color(head) },
      uTail: { value: new THREE.Color(tail) },
      uCore: { value: new THREE.Color(core) },
      uLife: { value: life },
      uStrength: { value: 0 },
      uIntensity: { value: intensity },
      uHeadBias: { value: headBias },
      uNoise: { value: turbulence() },
      uTime: { value: 0 },
      uGlobal: { value: 1 },
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: TRAIL_VERT,
      fragmentShader: TRAIL_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.visible = false;
    this.mesh.matrixAutoUpdate = false;

    this._samples = [];  // {b:Vector3, t:Vector3, age:number}
    for (let i = 0; i < segments; i++) {
      this._samples.push({ b: new THREE.Vector3(), t: new THREE.Vector3(), age: 1e3 });
    }
  }

  setColors(head: any, tail: any, core: any) {
    this.uniforms.uHead.value.set(head);
    this.uniforms.uTail.value.set(tail);
    if (core !== undefined) this.uniforms.uCore.value.set(core);
    return this;
  }

  reset() {
    this.count = 0;
    this.active = false;
    this.strength = 0;
    this.mesh.visible = false;
    for (const s of this._samples) s.age = 1e3;
  }

  /** Append one blade sample. Call once per frame while swinging. */
  push(base: any, tip: any) {
    // shift (small N, cheap)
    const s = this._samples;
    const last = s[s.length - 1];
    for (let i = s.length - 1; i > 0; i--) s[i] = s[i - 1];
    s[0] = last;
    s[0].b.copy(base); s[0].t.copy(tip); s[0].age = 0;
    if (this.count < this.segments) this.count++;
    this.active = true;
    this.strength = 1;
    this.mesh.visible = true;
    this._rebuild();
  }

  /**
   * Author a complete swing arc in one call — used by the screenshot
   * scenarios so a still frame shows a full, believable blade sweep.
   * @param {object} o
   * */
  setArc({ pivot, axis, start, from, to, inner = 0.25, outer = 1.7, ageSpread = 0.9 }: { pivot: THREE.Vector3, axis: THREE.Vector3, start: THREE.Vector3, from: number, to: number, inner?: number, outer?: number, ageSpread?: number }) {
    const q = new THREE.Quaternion();
    const dir = new THREE.Vector3();
    const n = this.segments;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);                    // 0 = head (newest), 1 = tail
      const ang = THREE.MathUtils.lerp(to, from, f);
      q.setFromAxisAngle(axis, ang);
      dir.copy(start).applyQuaternion(q).normalize();
      const s = this._samples[i];
      s.b.copy(pivot).addScaledVector(dir, inner);
      s.t.copy(pivot).addScaledVector(dir, outer);
      s.age = f * this.life * ageSpread;
    }
    this.count = n;
    this.active = true;
    this.strength = 1;
    this.uniforms.uStrength.value = 1;
    this.mesh.visible = true;
    this._rebuild();
  }

  /** Stop emitting; the ribbon dissolves over `life`. */
  release() { this.active = false; }

  update(dt: any, clock: any) {
    this.uniforms.uTime.value = clock;
    if (!this.mesh.visible) return;
    let alive = false;
    for (let i = 0; i < this.count; i++) {
      this._samples[i].age += dt;
      if (this._samples[i].age < this.life) alive = true;
    }
    if (!this.active) {
      this.strength = Math.max(0, this.strength - dt / Math.max(0.05, this.life));
    }
    this.uniforms.uStrength.value = this.strength;
    if (!alive && !this.active) { this.mesh.visible = false; this.count = 0; }
    else this._writeAges();
  }

  _writeAges() {
    const a = this.ages;
    for (let i = 0; i < this.segments; i++) {
      const age = i < this.count ? this._samples[i].age : 1e3;
      a[i * 2] = age; a[i * 2 + 1] = age;
    }
    this.ageAttr.needsUpdate = true;
  }

  _rebuild() {
    const p = this.positions, uv = this.uvs;
    const n = this.segments;
    const head = this._samples[0];
    for (let i = 0; i < n; i++) {
      const s = i < this.count ? this._samples[i] : head;   // collapse unused
      const o = i * 6;
      p[o] = s.b.x; p[o + 1] = s.b.y; p[o + 2] = s.b.z;
      p[o + 3] = s.t.x; p[o + 4] = s.t.y; p[o + 5] = s.t.z;
      const u = 1 - i / (n - 1);        // 1 at head, 0 at tail
      uv[i * 4] = u; uv[i * 4 + 1] = 0;
      uv[i * 4 + 2] = u; uv[i * 4 + 3] = 1;
    }
    this.posAttr.needsUpdate = true;
    this.uvAttr.needsUpdate = true;
    this._writeAges();
  }

  dispose() { this.mesh.geometry.dispose(); this.material.dispose(); }
}

/** Small recycling pool so the combat system never allocates mid-fight. */
export class TrailPool {
  _next!: number;
  items!: any[];
  constructor(parent: THREE.Group, size = 8, opts = {}) {
    this.items = [];
    for (let i = 0; i < size; i++) {
      const t = new TrailRibbon(opts);
      parent.add(t.mesh);
      this.items.push(t);
    }
    this._next = 0;
  }

  /** Grab the least-recently-used free ribbon. */
  acquire() {
    for (const t of this.items) if (!t.mesh.visible) { t.reset(); return t; }
    const t = this.items[this._next];
    this._next = (this._next + 1) % this.items.length;
    t.reset();
    return t;
  }

  update(dt: any, clock: number) { for (const t of this.items) t.update(dt, clock); }
  clear() { for (const t of this.items) t.reset(); }
}

const TRAIL_VERT = /* glsl */`
precision highp float;
attribute float aAge;
varying vec2 vUv;
varying float vAge;
void main() {
  vUv = uv;
  vAge = aAge;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const TRAIL_FRAG = /* glsl */`
precision highp float;
uniform vec3 uHead, uTail, uCore;
uniform float uLife, uStrength, uIntensity, uHeadBias, uTime, uGlobal;
uniform sampler2D uNoise;
varying vec2 vUv;
varying float vAge;

void main() {
  float along = vUv.x;                       // 1 at the blade head
  float across = vUv.y;

  float ageFade = clamp(1.0 - vAge / uLife, 0.0, 1.0);
  ageFade *= ageFade;
  if (ageFade <= 0.001 || uStrength <= 0.001) discard;

  // turbulence breaks the ribbon silhouette so it never reads as a flat band
  float t1 = texture2D(uNoise, vec2(along * 1.7 - uTime * 0.55, across * 0.85 + 0.13)).r;
  float t2 = texture2D(uNoise, vec2(along * 3.4 + uTime * 0.31, across * 1.7 + 0.61)).r;
  float turb = t1 * 0.65 + t2 * 0.35;

  // soft across-profile, eroded by turbulence at the trailing edge
  float e = 1.0 - abs(across * 2.0 - 1.0);
  float erode = mix(1.0, turb * 1.5, 0.55 * (1.0 - along));
  float body = pow(clamp(e * erode, 0.0, 1.0), 1.15);
  float core = pow(clamp(e, 0.0, 1.0), 9.0) * smoothstep(0.05, 0.5, along);

  float lengthFade = pow(along, uHeadBias);
  float a = (body * 0.85 + core) * lengthFade * ageFade * uStrength * uGlobal;
  a *= 0.45 + 0.85 * turb;
  if (a <= 0.004) discard;

  vec3 col = mix(uTail, uHead, pow(along, 1.35));
  col += uCore * core * 1.6;
  col *= uIntensity;

  gl_FragColor = vec4(col, a);
}
`;
