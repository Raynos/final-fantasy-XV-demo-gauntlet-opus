import * as THREE from 'three';
import { turbulence } from './VfxTextures.ts';

/**
 * Terrain-conforming ground effects: shockwave rings, scorch marks, ice
 * patches, impact cracks and light pools.
 *
 * Each patch is a small grid whose vertices are snapped to `Terrain.heightAt`,
 * so an effect never floats over or slices into a slope. The effect itself is
 * drawn procedurally in the fragment shader from the patch's local UV, which
 * means an expanding ring animates without touching the geometry.
 */
export class GroundPatch {
  age!: number;
  center!: any;
  free!: boolean;
  grid!: any;
  life!: number;
  material!: THREE.ShaderMaterial;
  mesh!: THREE.Mesh;
  posAttr!: any;
  positions!: Float32Array;
  size!: any;
  uniforms!: any;
  constructor({ grid = 14, additive = false, renderOrder = 6 } = {}) {
    this.grid = grid;
    const g = grid;
    const verts = (g + 1) * (g + 1);
    this.positions = new Float32Array(verts * 3);
    const uvs = new Float32Array(verts * 2);
    for (let j = 0; j <= g; j++) {
      for (let i = 0; i <= g; i++) {
        const k = j * (g + 1) + i;
        uvs[k * 2] = i / g;
        uvs[k * 2 + 1] = j / g;
      }
    }
    const idx = [];
    for (let j = 0; j < g; j++) {
      for (let i = 0; i < g; i++) {
        const a = j * (g + 1) + i, b = a + 1, c = a + g + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    this.uniforms = {
      uMap: { value: null },
      uNoise: { value: turbulence() },
      uColor: { value: new THREE.Color(1, 1, 1) },
      uOpacity: { value: 0 },
      uRing: { value: 0 },
      uRadius: { value: 0.5 },
      uThickness: { value: 0.08 },
      uNoiseAmt: { value: 0.18 },
      uIntensity: { value: 1 },
      uTime: { value: 0 },
      uRotate: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: PATCH_VERT,
      fragmentShader: PATCH_FRAG,
      transparent: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -8,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.visible = false;
    this.free = true;
    this.age = 0;
    this.life = 0;
  }

  /** Snap the patch grid onto the terrain around `center` with side `size`. */
  place(center: any, size: any, terrain: any, bias = 0.06) {
    const g = this.grid, p = this.positions;
    const half = size * 0.5;
    for (let j = 0; j <= g; j++) {
      for (let i = 0; i <= g; i++) {
        const k = j * (g + 1) + i;
        const x = center.x - half + (i / g) * size;
        const z = center.z - half + (j / g) * size;
        const y = terrain && terrain.heightAt ? terrain.heightAt(x, z) : center.y;
        p[k * 3] = x; p[k * 3 + 1] = y + bias; p[k * 3 + 2] = z;
      }
    }
    this.posAttr.needsUpdate = true;
    this.size = size;
    this.center = center.clone();
    this.mesh.visible = true;
    this.free = false;
    return this;
  }

  release() { this.free = true; this.mesh.visible = false; this.uniforms.uOpacity.value = 0; }
  dispose() { this.mesh.geometry.dispose(); this.material.dispose(); }
}

/**
 * Pool of ground patches. Two sub-pools: additive (rings, light pools) and
 * alpha-blended (scorch, frost, cracks). LRU reuse keeps draw calls bounded.
 */
export class GroundFX {
  _decalNext!: number;
  _ringNext!: number;
  constructor(parent: any, { rings = 6, decals = 12 } = {}) {
    this.rings = [];
    this.decals = [];
    for (let i = 0; i < rings; i++) {
      const p = new GroundPatch({ grid: 18, additive: true, renderOrder: 8 });
      parent.add(p.mesh);
      this.rings.push(p);
    }
    for (let i = 0; i < decals; i++) {
      const p = new GroundPatch({ grid: 10, additive: false, renderOrder: 6 });
      parent.add(p.mesh);
      this.decals.push(p);
    }
    this._ringNext = 0;
    this._decalNext = 0;
  }

  _take(pool: any, cursorKey: any) {
    for (const p of pool) if (p.free) return p;
    const p = pool[this[cursorKey]];
    this[cursorKey] = (this[cursorKey] + 1) % pool.length;
    return p;
  }

  /**
   * Expanding shockwave ring on the ground.
   * @param o {pos, terrain, radius, color, life, t0, thickness, intensity}
   */
  ring({ pos, terrain, radius = 4, color = 0x9fd8ff, life = 0.75, thickness = 0.09,
    intensity = 3.2, opacity = 1, age = 0 }: any) {
    const p = this._take(this.rings, '_ringNext');
    p.place(pos, radius * 2.2, terrain, 0.08);
    p.uniforms.uRing.value = 1;
    p.uniforms.uColor.value.set(color);
    p.uniforms.uThickness.value = thickness;
    p.uniforms.uIntensity.value = intensity;
    p.uniforms.uOpacity.value = opacity;
    p.uniforms.uRadius.value = 0.02;
    p.life = life; p.age = Math.max(0, age); p.baseOpacity = opacity;
    p.kind = 'ring';
    return p;
  }

  /** Persistent (slowly fading) textured decal: scorch, frost, cracks. */
  decal({ pos, terrain, size = 3, map, color = 0xffffff, opacity = 0.9,
    life = 26, rotate = 0, intensity = 1, age = 0 }: any) {
    const p = this._take(this.decals, '_decalNext');
    p.place(pos, size, terrain, 0.045);
    p.uniforms.uRing.value = 0;
    p.uniforms.uMap.value = map;
    p.uniforms.uColor.value.set(color);
    p.uniforms.uOpacity.value = opacity;
    p.uniforms.uIntensity.value = intensity;
    p.uniforms.uRotate.value = rotate;
    p.life = life; p.age = Math.max(0, age); p.baseOpacity = opacity;
    p.kind = 'decal';
    return p;
  }

  /** Soft additive light pool — magic circles, warp landing glow. */
  pool({ pos, terrain, size = 4, color = 0x66ccff, opacity = 1, life = 2.5, intensity = 2.4, age = 0 }: any) {
    const p = this._take(this.rings, '_ringNext');
    p.place(pos, size, terrain, 0.07);
    p.uniforms.uRing.value = 2;
    p.uniforms.uColor.value.set(color);
    p.uniforms.uOpacity.value = opacity;
    p.uniforms.uIntensity.value = intensity;
    p.life = life; p.age = Math.max(0, age); p.baseOpacity = opacity;
    p.kind = 'pool';
    return p;
  }

  update(dt: any, clock: any) {
    for (const list of [this.rings, this.decals]) {
      for (const p of list) {
        if (p.free) continue;
        p.uniforms.uTime.value = clock;
        p.age += dt;
        const n = p.age / p.life;
        if (n >= 1) { p.release(); continue; }
        if (p.kind === 'ring') {
          // fast-out expansion, thinning and fading as it goes
          const e = 1 - Math.pow(1 - n, 2.6);
          p.uniforms.uRadius.value = 0.03 + e * 0.86;
          p.uniforms.uOpacity.value = p.baseOpacity * Math.pow(1 - n, 1.5);
          p.uniforms.uThickness.value = 0.10 * (1 - n * 0.55);
        } else if (p.kind === 'pool') {
          p.uniforms.uOpacity.value = p.baseOpacity * Math.pow(1 - n, 1.2) * Math.min(1, n * 8);
        } else {
          // decals hold, then fade out over the last 30%
          p.uniforms.uOpacity.value = p.baseOpacity * Math.min(1, (1 - n) / 0.3);
        }
      }
    }
  }

  clear() {
    for (const p of this.rings) p.release();
    for (const p of this.decals) p.release();
  }
}

const PATCH_VERT = /* glsl */`
precision highp float;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const PATCH_FRAG = /* glsl */`
precision highp float;
uniform sampler2D uMap, uNoise;
uniform vec3 uColor;
uniform float uOpacity, uRing, uRadius, uThickness, uNoiseAmt, uIntensity, uTime, uRotate;
varying vec2 vUv;

void main() {
  if (uOpacity <= 0.003) discard;
  vec2 c = vUv - 0.5;
  float d = length(c) * 2.0;
  vec3 col;
  float a;

  if (uRing > 1.5) {
    // soft light pool with a breathing noise wash
    float n = texture2D(uNoise, vUv * 1.6 + vec2(uTime * 0.05, -uTime * 0.04)).r;
    a = pow(max(0.0, 1.0 - d), 2.2) * (0.55 + 0.75 * n) * uOpacity;
    col = uColor * uIntensity;
  } else if (uRing > 0.5) {
    float ang = atan(c.y, c.x);
    float n = texture2D(uNoise, vec2(ang * 0.16 + 0.5, uRadius * 0.7 + uTime * 0.05)).r;
    float r = uRadius * (1.0 + (n - 0.5) * uNoiseAmt);
    float band = smoothstep(uThickness, 0.0, abs(d - r));
    // trailing inner wash
    float wash = smoothstep(r, r - uThickness * 4.0, d) * smoothstep(r - uThickness * 6.0, r, d) * 0.35;
    a = (band + wash) * smoothstep(1.06, 0.86, d) * uOpacity;
    float hot = pow(band, 3.0);
    col = mix(uColor, vec3(1.0), hot * 0.75) * uIntensity;
  } else {
    float s = sin(uRotate), cs = cos(uRotate);
    vec2 ruv = vec2(c.x * cs - c.y * s, c.x * s + c.y * cs) + 0.5;
    vec4 t = texture2D(uMap, ruv);
    col = uColor * t.rgb * uIntensity;
    a = t.a * uOpacity * smoothstep(1.04, 0.78, d);
  }

  if (a <= 0.004) discard;
  gl_FragColor = vec4(col, a);
}
`;
