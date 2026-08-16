import * as THREE from 'three';
import {
  loft, bladeCross, rectCross, circleCross, tube, slab, spike, place, tint, glow, merge,
  enableVertexEmissive,
} from './GeoKit.js';

/**
 * Weapon definitions, procedural weapon geometry, the blue-crystal
 * materialisation shader and the Armiger phantom-weapon swarm.
 *
 * Each class has its own reach, combo timing and swing arc, which the combat
 * system reads directly — the arcs also drive the trail ribbons, so a
 * greatsword really does sweep a wider, slower band than the daggers.
 */

/** @typedef {'sword'|'greatsword'|'polearm'|'daggers'|'firearm'} WeaponClass */

export const WEAPONS = {
  sword: {
    name: 'Engine Blade', reach: 2.05, damage: 118, poise: 22,
    // per-hit: windup, active, recovery (seconds) and the arc the blade sweeps
    combo: [
      { wind: 0.11, active: 0.13, rec: 0.16, arc: [-2.5, 0.9], axis: [0.10, 1, 0.15], tilt: 0.22, dmg: 1.0 },
      { wind: 0.09, active: 0.12, rec: 0.14, arc: [2.4, -0.8], axis: [-0.05, 1, -0.2], tilt: -0.3, dmg: 1.05 },
      { wind: 0.12, active: 0.13, rec: 0.15, arc: [-1.2, 1.9], axis: [1, 0.25, 0], tilt: 0.1, dmg: 1.1 },
      { wind: 0.15, active: 0.16, rec: 0.30, arc: [2.9, -1.4], axis: [0.2, 0.85, 0.4], tilt: 0.5, dmg: 1.6 },
    ],
    trail: { head: 0xbfe4ff, tail: 0x1b4fa8, life: 0.30, width: 1.0 },
    hitbox: 0.42,
  },
  greatsword: {
    name: 'Ultima Blade', reach: 2.6, damage: 226, poise: 60,
    combo: [
      { wind: 0.26, active: 0.20, rec: 0.34, arc: [-2.9, 1.3], axis: [0.05, 1, 0.1], tilt: 0.3, dmg: 1.0 },
      { wind: 0.30, active: 0.22, rec: 0.40, arc: [2.6, -1.5], axis: [1, 0.1, 0.15], tilt: -0.2, dmg: 1.25 },
      { wind: 0.38, active: 0.24, rec: 0.55, arc: [-0.4, 2.7], axis: [1, 0.0, 0], tilt: 0.0, dmg: 1.9 },
    ],
    trail: { head: 0xffd9a8, tail: 0x8a3a12, life: 0.42, width: 1.5 },
    hitbox: 0.72,
  },
  polearm: {
    name: 'Zwill Crossblade', reach: 3.1, damage: 96, poise: 18,
    combo: [
      { wind: 0.10, active: 0.10, rec: 0.13, arc: [0.2, 0.2], axis: [0, 1, 0], thrust: 1, tilt: 0, dmg: 0.9 },
      { wind: 0.09, active: 0.10, rec: 0.12, arc: [-2.2, 1.4], axis: [0, 1, 0], tilt: 0.05, dmg: 1.0 },
      { wind: 0.10, active: 0.11, rec: 0.14, arc: [2.4, -1.6], axis: [0, 1, 0], tilt: -0.05, dmg: 1.05 },
      { wind: 0.14, active: 0.14, rec: 0.26, arc: [-3.1, 3.1], axis: [0, 1, 0], tilt: 0, dmg: 1.4 },
    ],
    trail: { head: 0xcfe9ff, tail: 0x2a6ea8, life: 0.26, width: 0.85 },
    hitbox: 0.34,
  },
  daggers: {
    name: 'Auroral Kukris', reach: 1.35, damage: 62, poise: 8,
    combo: [
      { wind: 0.06, active: 0.07, rec: 0.07, arc: [-1.9, 0.7], axis: [0.2, 1, 0.1], tilt: 0.3, dmg: 0.85 },
      { wind: 0.05, active: 0.07, rec: 0.07, arc: [1.9, -0.7], axis: [-0.2, 1, -0.1], tilt: -0.3, dmg: 0.85 },
      { wind: 0.05, active: 0.06, rec: 0.07, arc: [-1.4, 1.4], axis: [1, 0.3, 0], tilt: 0.5, dmg: 0.9 },
      { wind: 0.05, active: 0.06, rec: 0.07, arc: [1.4, -1.4], axis: [1, -0.3, 0], tilt: -0.5, dmg: 0.9 },
      { wind: 0.10, active: 0.12, rec: 0.24, arc: [-3.0, 3.0], axis: [0.1, 1, 0], tilt: 0.1, dmg: 1.5 },
    ],
    trail: { head: 0xd8fff2, tail: 0x1c8f7a, life: 0.20, width: 0.6 },
    hitbox: 0.28,
  },
  firearm: {
    name: 'Quicksilver', reach: 26, damage: 44, poise: 4, ranged: true,
    combo: [
      { wind: 0.05, active: 0.02, rec: 0.11, arc: [0, 0], axis: [0, 1, 0], shoot: 1, tilt: 0, dmg: 1.0 },
      { wind: 0.04, active: 0.02, rec: 0.11, arc: [0, 0], axis: [0, 1, 0], shoot: 1, tilt: 0, dmg: 1.0 },
      { wind: 0.04, active: 0.02, rec: 0.22, arc: [0, 0], axis: [0, 1, 0], shoot: 1, tilt: 0, dmg: 1.4 },
    ],
    trail: { head: 0xffe2b0, tail: 0x904a10, life: 0.10, width: 0.3 },
    hitbox: 0.16,
  },
};

const STEEL = 0xb8c2cc;
const DARK = 0x24272e;
const GOLD = 0xb08a3c;

/* -------------------------------------------------------------- geometry */

/** Noctis' Engine Blade: slim, angular, blue-lit fuller. */
export function swordGeometry() {
  const parts = [];
  const blade = loft(bladeCross(12), [
    { y: 0.00, sx: 0.052, sz: 0.020 },
    { y: 0.18, sx: 0.058, sz: 0.021 },
    { y: 0.72, sx: 0.052, sz: 0.018 },
    { y: 0.95, sx: 0.040, sz: 0.013 },
    { y: 1.06, sx: 0.016, sz: 0.006 },
  ]);
  parts.push(tint(blade, STEEL, 0.05));
  const fuller = loft(rectCross(0.4, 8), [
    { y: 0.10, sx: 0.010, sz: 0.023 },
    { y: 0.88, sx: 0.008, sz: 0.022 },
  ]);
  parts.push(glow(tint(fuller, 0x2a4a7a), 0x2f9bff, 1.6));
  const guard = place(slab(0.22, 0.035, 0.055, 0.012), { pos: [0, -0.015, 0] });
  parts.push(tint(guard, DARK));
  const wingL = place(slab(0.05, 0.10, 0.03, 0.008), { pos: [0.10, 0.03, 0], rot: [0, 0, -0.5] });
  const wingR = place(slab(0.05, 0.10, 0.03, 0.008), { pos: [-0.10, 0.03, 0], rot: [0, 0, 0.5] });
  parts.push(tint(wingL, GOLD), tint(wingR, GOLD));
  const grip = loft(circleCross(8), [
    { y: -0.04, sx: 0.020, sz: 0.014 },
    { y: -0.20, sx: 0.018, sz: 0.013 },
  ]);
  parts.push(tint(grip, 0x1a1c22));
  const pommel = place(slab(0.05, 0.05, 0.035, 0.014), { pos: [0, -0.225, 0] });
  parts.push(tint(pommel, GOLD));
  return merge(parts);
}

/** Gladiolus' greatsword: broad, heavy, chipped. */
export function greatswordGeometry() {
  const parts = [];
  const blade = loft(bladeCross(12), [
    { y: 0.00, sx: 0.115, sz: 0.028 },
    { y: 0.30, sx: 0.135, sz: 0.030 },
    { y: 1.05, sx: 0.125, sz: 0.026 },
    { y: 1.48, sx: 0.095, sz: 0.020 },
    { y: 1.66, sx: 0.020, sz: 0.008 },
  ]);
  parts.push(tint(blade, 0x9aa4ae, 0.06));
  const spineGlow = loft(rectCross(0.5, 6), [
    { y: 0.12, sx: 0.016, sz: 0.032 },
    { y: 1.35, sx: 0.012, sz: 0.030 },
  ]);
  parts.push(glow(tint(spineGlow, 0x3a2a1a), 0xff7a2a, 1.0));
  const guard = place(slab(0.40, 0.055, 0.09, 0.016), { pos: [0, -0.035, 0] });
  parts.push(tint(guard, 0x2c2019));
  const grip = loft(circleCross(8), [
    { y: -0.07, sx: 0.026, sz: 0.020 },
    { y: -0.40, sx: 0.024, sz: 0.019 },
  ]);
  parts.push(tint(grip, 0x40301f));
  const pommel = place(spike(0.045, 0.10, 6), { pos: [0, -0.50, 0] });
  parts.push(tint(pommel, 0x6d5a33));
  return merge(parts);
}

/** Polearm with a leaf blade and a counterweight spike. */
export function polearmGeometry() {
  const parts = [];
  const shaft = loft(circleCross(8), [
    { y: -1.20, sx: 0.021 }, { y: 0.9, sx: 0.024 }, { y: 1.35, sx: 0.021 },
  ]);
  parts.push(tint(shaft, 0x3a3f47));
  const head = loft(bladeCross(12), [
    { y: 1.35, sx: 0.030, sz: 0.014 },
    { y: 1.52, sx: 0.078, sz: 0.020 },
    { y: 1.95, sx: 0.062, sz: 0.016 },
    { y: 2.22, sx: 0.010, sz: 0.005 },
  ]);
  parts.push(tint(head, 0xc4cdd6, 0.04));
  const wingA = place(loft(bladeCross(10), [
    { y: 0, sx: 0.024, sz: 0.010 }, { y: 0.30, sx: 0.040, sz: 0.012 }, { y: 0.44, sx: 0.006, sz: 0.003 },
  ]), { pos: [0.05, 1.42, 0], rot: [0, 0, -1.15] });
  const wingB = place(loft(bladeCross(10), [
    { y: 0, sx: 0.024, sz: 0.010 }, { y: 0.30, sx: 0.040, sz: 0.012 }, { y: 0.44, sx: 0.006, sz: 0.003 },
  ]), { pos: [-0.05, 1.42, 0], rot: [0, 0, 1.15] });
  parts.push(tint(wingA, 0xc4cdd6), tint(wingB, 0xc4cdd6));
  const collar = place(slab(0.08, 0.06, 0.08, 0.02), { pos: [0, 1.33, 0] });
  parts.push(glow(tint(collar, 0x24406a), 0x3f9dff, 0.9));
  const butt = place(spike(0.026, 0.16, 6), { pos: [0, -1.36, 0], rot: [Math.PI, 0, 0] });
  parts.push(tint(butt, 0x8a9099));
  return merge(parts);
}

/** Single kukri-style dagger (the pair is two instances). */
export function daggerGeometry() {
  const parts = [];
  const blade = loft(bladeCross(10), [
    { y: 0.00, sx: 0.038, sz: 0.014 },
    { y: 0.16, sx: 0.052, sz: 0.015, dx: 0.012 },
    { y: 0.38, sx: 0.044, sz: 0.012, dx: 0.030 },
    { y: 0.52, sx: 0.012, sz: 0.005, dx: 0.040 },
  ]);
  parts.push(tint(blade, 0xd2e4e0, 0.05));
  const edge = loft(rectCross(0.5, 6), [
    { y: 0.06, sx: 0.006, sz: 0.016 }, { y: 0.46, sx: 0.005, sz: 0.014, dx: 0.034 },
  ]);
  parts.push(glow(tint(edge, 0x1a4a42), 0x30e0b8, 1.2));
  const guard = place(slab(0.10, 0.022, 0.04, 0.008), { pos: [0, -0.012, 0] });
  parts.push(tint(guard, 0x22262b));
  const grip = loft(circleCross(6), [{ y: -0.03, sx: 0.016, sz: 0.012 }, { y: -0.17, sx: 0.015, sz: 0.011 }]);
  parts.push(tint(grip, 0x14161a));
  return merge(parts);
}

/** Prompto-style machine pistol. */
export function firearmGeometry() {
  const parts = [];
  const body = place(slab(0.05, 0.10, 0.16, 0.012), { pos: [0, 0.02, 0] });
  parts.push(tint(body, 0x2b3038));
  const barrel = place(loft(circleCross(8), [{ y: 0, sx: 0.014 }, { y: 0.20, sx: 0.012 }]),
    { pos: [0, 0.05, 0.08], rot: [Math.PI / 2, 0, 0] });
  parts.push(tint(barrel, 0x8d949c));
  const grip = place(slab(0.038, 0.13, 0.05, 0.010), { pos: [0, -0.08, -0.03], rot: [0.28, 0, 0] });
  parts.push(tint(grip, 0x15171b));
  const sight = place(slab(0.02, 0.02, 0.05, 0.004), { pos: [0, 0.08, 0.02] });
  parts.push(glow(tint(sight, 0x30506a), 0x66d9ff, 0.7));
  const mag = place(slab(0.03, 0.08, 0.04, 0.006), { pos: [0, -0.06, 0.0] });
  parts.push(tint(mag, 0x1d2026));
  return merge(parts);
}

/** Broad battle-axe — Armiger filler. */
export function axeGeometry() {
  const parts = [];
  const shaft = loft(circleCross(7), [{ y: -0.55, sx: 0.021 }, { y: 0.62, sx: 0.023 }]);
  parts.push(tint(shaft, 0x33383f));
  const head = loft(bladeCross(10), [
    { y: 0.30, sx: 0.05, sz: 0.024, dx: 0.03 },
    { y: 0.46, sx: 0.20, sz: 0.026, dx: 0.16 },
    { y: 0.66, sx: 0.20, sz: 0.024, dx: 0.16 },
    { y: 0.78, sx: 0.05, sz: 0.018, dx: 0.03 },
  ]);
  parts.push(tint(head, 0xaeb8c2, 0.05));
  const top = place(spike(0.024, 0.16, 6), { pos: [0, 0.62, 0] });
  parts.push(tint(top, 0xc0c8d0));
  return merge(parts);
}

/** Long lance — Armiger filler. */
export function lanceGeometry() {
  const parts = [];
  const shaft = loft(circleCross(7), [{ y: -1.0, sx: 0.018 }, { y: 1.0, sx: 0.021 }]);
  parts.push(tint(shaft, 0x3d434b));
  const head = loft(bladeCross(10), [
    { y: 1.00, sx: 0.030, sz: 0.014 },
    { y: 1.18, sx: 0.055, sz: 0.018 },
    { y: 1.70, sx: 0.014, sz: 0.006 },
  ]);
  parts.push(tint(head, 0xccd5de, 0.04));
  for (let i = 0; i < 3; i++) {
    const ring = place(slab(0.055, 0.03, 0.055, 0.012), { pos: [0, 0.2 + i * 0.3, 0] });
    parts.push(glow(tint(ring, 0x2b4a72), 0x4aa8ff, 0.8));
  }
  return merge(parts);
}

export const WEAPON_GEOMETRY = {
  sword: swordGeometry,
  greatsword: greatswordGeometry,
  polearm: polearmGeometry,
  daggers: daggerGeometry,
  firearm: firearmGeometry,
  axe: axeGeometry,
  lance: lanceGeometry,
};

/* --------------------------------------------------- materialise shader */

/**
 * Standard weapon material with a crystal materialisation dissolve.
 * `uReveal` runs 0 -> 1; below the threshold the metal is solid, at the
 * boundary a band of blue crystal light burns, above it nothing is drawn.
 */
export function makeWeaponMaterial() {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.32, metalness: 0.92,
    emissive: 0x000000,
  });
  const uniforms = { uReveal: { value: 1 }, uEdge: { value: new THREE.Color(0x4fb6ff) } };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uReveal = uniforms.uReveal;
    shader.uniforms.uEdge = uniforms.uEdge;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>',
        '#include <common>\nattribute vec3 aEmissive;\nvarying vec3 vEmissive;\nvarying float vLocalY;')
      .replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvEmissive = aEmissive;\nvLocalY = position.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>',
        '#include <common>\nvarying vec3 vEmissive;\nvarying float vLocalY;\nuniform float uReveal;\nuniform vec3 uEdge;')
      .replace('#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
         float rev = mix(-0.7, 2.4, uReveal);
         if (vLocalY > rev) discard;`)
      .replace('#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         float band = smoothstep(0.30, 0.0, mix(-0.7, 2.4, uReveal) - vLocalY);
         totalEmissiveRadiance += vEmissive + uEdge * band * 6.0;`);
  };
  mat.customProgramCacheKey = () => 'weaponMaterialise';
  return mat;
}

/**
 * A drawn weapon: geometry + material + materialisation state.
 * `root` is parented to the wielder's hand transform by the combat system.
 */
export class Weapon {
  /** @param {WeaponClass|string} kind */
  constructor(kind) {
    this.kind = kind;
    this.def = WEAPONS[kind] || WEAPONS.sword;
    this.geometry = (WEAPON_GEOMETRY[kind] || swordGeometry)();
    this.material = makeWeaponMaterial();
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.castShadow = true;
    this.root = new THREE.Group();
    this.root.add(this.mesh);
    this.reveal = 1;
    this.tipLocal = new THREE.Vector3(0, this.def.reach * 0.52, 0);
    this.baseLocal = new THREE.Vector3(0, 0.06, 0);
    this._tip = new THREE.Vector3();
    this._base = new THREE.Vector3();
  }

  /** 0 = fully dematerialised, 1 = solid steel. */
  setReveal(v) {
    this.reveal = THREE.MathUtils.clamp(v, 0, 1);
    this.material.userData.uniforms.uReveal.value = this.reveal;
    this.root.visible = this.reveal > 0.001;
  }

  /** World-space blade base, for trail sampling. */
  base() { return this._base.copy(this.baseLocal).applyMatrix4(this.root.matrixWorld); }
  /** World-space blade tip, for trail sampling and hit sweeps. */
  tip() { return this._tip.copy(this.tipLocal).applyMatrix4(this.root.matrixWorld); }

  dispose() { this.geometry.dispose(); this.material.dispose(); }
}

/* ------------------------------------------------------------- Armiger */

/**
 * Armiger: 8–13 phantom royal arms orbiting the wielder in a slow, tilted
 * ring, ready to strike. Each weapon type is one InstancedMesh, so the whole
 * swarm costs a handful of draw calls no matter how many blades are up.
 */
export class Armiger {
  constructor({ count = 13 } = {}) {
    this.count = count;
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = true;
    this.active = 0;              // 0..1 fade
    this.phase = 0;
    this.strikePhase = -1;

    const kinds = ['sword', 'greatsword', 'polearm', 'axe', 'lance'];
    this.slots = [];
    this.meshes = [];
    const perKind = new Map();
    for (let i = 0; i < count; i++) {
      const k = kinds[i % kinds.length];
      perKind.set(k, (perKind.get(k) || 0) + 1);
    }
    const material = phantomMaterial();
    this.material = material;
    let i = 0;
    for (const [kind, n] of perKind) {
      const geo = WEAPON_GEOMETRY[kind]();
      const im = new THREE.InstancedMesh(geo, material, n);
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = false;
      im.renderOrder = 19;
      this.group.add(im);
      this.meshes.push(im);
      for (let j = 0; j < n; j++) {
        this.slots.push({ mesh: im, index: j, seed: i * 0.618034, kind });
        i++;
      }
    }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._e = new THREE.Euler();
    this.group.visible = false;
  }

  /**
   * Lay out the ring around `center`.
   * @param {THREE.Vector3} center
   * @param {number} t phase in seconds (deterministic when pinned)
   */
  layout(center, t, { radius = 2.0, height = 2.35, tilt = 0.32 } = {}) {
    const n = this.slots.length;
    for (let k = 0; k < n; k++) {
      const s = this.slots[k];
      const a = (k / n) * Math.PI * 2 + t * 0.45;
      // two interleaved rings at different heights so it reads as a swarm
      const tierR = radius * (k % 2 ? 1.0 : 0.78);
      const tierY = height + (k % 2 ? 0.0 : 0.95) + Math.sin(a * 2 + s.seed * 9) * 0.30;
      this._p.set(
        center.x + Math.cos(a) * tierR,
        center.y + tierY,
        center.z + Math.sin(a) * tierR
      );
      // blades point outward-and-down, hilts toward the wielder, slight tumble
      // hilts inward, points swept outward and down — a crown of royal arms
      this._e.set(
        tilt + Math.sin(t * 1.3 + s.seed * 12) * 0.16,
        -a + Math.PI * 0.5,
        Math.PI * 0.92 + Math.cos(t * 1.1 + s.seed * 7) * 0.14,
        'YXZ'
      );
      this._q.setFromEuler(this._e);
      const sc = 0.46 + (k % 3) * 0.05;
      this._s.set(sc, sc, sc).multiplyScalar(this.active);
      this._m.compose(this._p, this._q, this._s);
      s.mesh.setMatrixAt(s.index, this._m);
    }
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
    this.group.visible = this.active > 0.01;
    this.material.uniforms.uStrength.value = this.active;
  }

  setClock(c) { this.material.uniforms.uTime.value = c; }
  dispose() { for (const m of this.meshes) m.geometry.dispose(); this.material.dispose(); }
}

/** Ghostly blue phantom-weapon shader: fresnel shell + crawling energy. */
function phantomMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uStrength: { value: 1 },
      uColor: { value: new THREE.Color(0x2f8fe8) },
      uCore: { value: new THREE.Color(0xd8f0ff) },
    },
    vertexShader: /* glsl */`
      precision highp float;
      varying vec3 vN;
      varying vec3 vV;
      varying float vY;
      void main() {
        vY = position.y;
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelViewMatrix) * mat3(instanceMatrix) * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;
      uniform float uTime, uStrength;
      uniform vec3 uColor, uCore;
      varying vec3 vN; varying vec3 vV; varying float vY;
      void main() {
        float f = pow(1.0 - clamp(dot(normalize(vN), normalize(vV)), 0.0, 1.0), 2.6);
        float scan = 0.6 + 0.4 * sin(vY * 12.0 - uTime * 2.6);
        // a saturated blue shell whose energy lives almost entirely in the rim
        float a = (0.070 + f * 0.34) * uStrength * (0.75 + 0.35 * scan);
        vec3 col = uColor * (0.30 + 0.75 * f) + uCore * pow(f, 5.0) * 0.9;
        gl_FragColor = vec4(col, clamp(a, 0.0, 0.6));
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
