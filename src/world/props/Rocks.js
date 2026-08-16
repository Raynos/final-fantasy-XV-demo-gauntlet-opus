import * as THREE from 'three';
import { Noise } from '../../util/Noise.js';
import { Rng } from '../../util/Rng.js';
import { rockMaterial } from './PropMaterials.js';

/**
 * Boulders, slabs and pebbles. Six procedurally deformed base meshes are
 * instanced across the map in clusters — a house-sized boulder with a skirt of
 * smaller rocks around it reads as geology; evenly spaced rocks read as a
 * particle system.
 */

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Deform an icosphere with layered noise into a believable rock. */
function rockGeometry(seed, {
  detail = 2, warp = 0.34, flat = 0.0, stretch = [1, 1, 1], sharp = 1.0,
} = {}) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const n = new Noise(seed);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const big = n.fbm3(v.x * 0.85, v.y * 0.85, v.z * 0.85, 3);
    const mid = n.fbm3(v.x * 2.6 + 11, v.y * 2.6, v.z * 2.6 - 4, 3);
    const fine = n.simplex3(v.x * 7.5, v.y * 7.5, v.z * 7.5);
    let r = 1 + big * warp + mid * warp * 0.45 + fine * warp * 0.13;
    // faceted feel: quantise slightly toward flat planes
    if (sharp > 0) r += (Math.round(big * 3) / 3 - big) * warp * 0.35 * sharp;
    v.multiplyScalar(r);
    v.x *= stretch[0]; v.y *= stretch[1]; v.z *= stretch[2];
    if (flat > 0) v.y *= 1 - flat * (0.5 + 0.5 * Math.sign(v.y));
    pos.setXYZ(i, v.x, v.y, v.z);
    // lighter, dustier on upward faces; darker in crevices
    const up = THREE.MathUtils.clamp(v.y / (Math.abs(v.length()) + 1e-4), -1, 1);
    const k = 0.78 + 0.3 * Math.max(0, up) + (big * 0.5 + 0.5) * 0.18;
    col[i * 3] = k * 1.02; col[i * 3 + 1] = k; col[i * 3 + 2] = k * 0.95;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

const KINDS = [
  { key: 'boulder', seed: 101, opts: { detail: 2, warp: 0.3, stretch: [1.15, 0.92, 1.0] }, size: [1.6, 5.4], bury: 0.30, w: 1.0 },
  { key: 'boulder2', seed: 202, opts: { detail: 2, warp: 0.4, stretch: [1.0, 1.15, 0.9], sharp: 1.4 }, size: [1.2, 4.2], bury: 0.26, w: 1.0 },
  { key: 'slab', seed: 303, opts: { detail: 2, warp: 0.26, stretch: [1.5, 0.42, 1.25] }, size: [1.8, 6.5], bury: 0.42, w: 0.55 },
  { key: 'spire', seed: 404, opts: { detail: 2, warp: 0.32, stretch: [0.66, 1.9, 0.7], sharp: 1.6 }, size: [1.4, 3.6], bury: 0.24, w: 0.35 },
  { key: 'cobble', seed: 505, opts: { detail: 1, warp: 0.34, stretch: [1.1, 0.8, 1.0] }, size: [0.28, 0.95], bury: 0.34, w: 2.4 },
  { key: 'pebble', seed: 606, opts: { detail: 1, warp: 0.4, stretch: [1.2, 0.7, 1.0] }, size: [0.07, 0.26], bury: 0.4, w: 4.0 },
];

export class Rocks {
  constructor(eco, scene, { quality = 1, range = 380 } = {}) {
    this.eco = eco;
    this.scene = scene;
    this.quality = quality;
    this.range = range;
    this.groups = [];
  }

  build() {
    const eco = this.eco;
    const mat = rockMaterial(0x8d7663, 0.93);
    const rng = new Rng(777);

    // one clustered field, then split by kind so big rocks anchor the clusters
    const clusters = eco.scatterClustered(0x40c8, {
      radius: this.range, cellSize: 48, perCell: 9, spread: 13,
      density: (x, z) => {
        const slope = eco.slope01(x, z);
        const p = eco.patch(x + 610, z - 340, 0.011, 3);
        const rd = THREE.MathUtils.smoothstep(eco.roadDist(x, z), 4.5, 9);
        // Scree gathers on slopes, but nothing rests on a cliff face — past
        // about 40 degrees a boulder would hang off the wall instead of
        // sitting on it, so fall away to zero well before vertical.
        const rests = 1 - THREE.MathUtils.smoothstep(slope, 0.42, 0.62);
        return THREE.MathUtils.clamp(
          (0.5 + 0.5 * THREE.MathUtils.smoothstep(slope, 0.06, 0.45)) * rests *
          (0.32 + 0.68 * THREE.MathUtils.smoothstep(p, 0.26, 0.74)) *
          rd * (1 - eco.siteBlock(x, z) * 0.85), 0, 1);
      },
      maxCount: 3600,
    });

    const buckets = new Map();
    for (const k of KINDS) buckets.set(k.key, []);

    for (const c of clusters) {
      // one anchor rock and a scatter of debris around it
      const rBig = rng.next();
      const anchorKind = rBig < 0.16 ? KINDS[0] : rBig < 0.3 ? KINDS[1]
        : rBig < 0.4 ? KINDS[2] : rBig < 0.46 ? KINDS[3] : KINDS[4];
      buckets.get(anchorKind.key).push(this._item(anchorKind, c.x, c.z, rng, c.w));
      const debris = 1 + Math.floor(rng.next() * 5);
      for (let i = 0; i < debris; i++) {
        const a = rng.next() * Math.PI * 2;
        const d = Math.abs(rng.gauss(0, 1)) * (2.2 + rBig * 5);
        const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
        if (eco.roadDist(x, z) < 4.6) continue;
        const kind = rng.next() < 0.62 ? KINDS[5] : KINDS[4];
        buckets.get(kind.key).push(this._item(kind, x, z, rng, c.w * 0.7));
      }
    }

    // A dozen proper outcrops: tight knots of large stone that read as bedrock
    // pushing through the soil rather than boulders dropped on a lawn.
    const outcrops = eco.scatterClustered(0x0c1f, {
      radius: this.range, cellSize: 150, perCell: 2, spread: 10,
      density: (x, z) => {
        const p = eco.patch(x - 800, z + 950, 0.007, 3);
        return THREE.MathUtils.smoothstep(p, 0.42, 0.78)
          * THREE.MathUtils.smoothstep(eco.roadDist(x, z), 9, 26)
          * (1 - eco.siteBlock(x, z));
      },
      maxCount: 26,
    });
    for (const o of outcrops) {
      const n = 4 + Math.floor(rng.next() * 6);
      const axis = rng.next() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const t = (i / n - 0.5) * 2;
        const px = o.x + Math.cos(axis) * t * 9 + rng.gauss(0, 2.4);
        const pz = o.z + Math.sin(axis) * t * 9 + rng.gauss(0, 2.4);
        const kind = rng.next() < 0.45 ? KINDS[0] : rng.next() < 0.6 ? KINDS[2] : KINDS[1];
        const it = this._item(kind, px, pz, rng, 1);
        it.s = Math.max(it.s, kind.size[1] * rng.range(0.55, 1.05));
        it.bury = kind.bury * rng.range(0.35, 0.8);
        buckets.get(kind.key).push(it);
      }
    }

    for (const k of KINDS) {
      const items = buckets.get(k.key);
      if (!items.length) continue;
      const max = Math.max(8, Math.min(items.length, Math.round(items.length * this.quality)));
      const mesh = new THREE.InstancedMesh(rockGeometry(k.seed, k.opts), mat, max);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
      mesh.count = 0; mesh.frustumCulled = false;
      mesh.name = `rock_${k.key}`;
      this.scene.add(mesh);
      this.groups.push({ kind: k, mesh, items, max, range: k.size[1] > 1.2 ? this.range : 90 });
    }
    this._last = new THREE.Vector3(1e9, 0, 1e9);
    this.update(new THREE.Vector3());
  }

  _item(kind, x, z, rng, w) {
    const t = Math.pow(rng.next(), 1.7);
    const size = kind.size[0] + (kind.size[1] - kind.size[0]) * t * (0.6 + w * 0.7);
    const nrm = this.eco.normal(x, z);
    return {
      x, z, y: this.eco.height(x, z),
      // Sink along the surface normal, not straight down: on a slope a purely
      // vertical offset leaves the rock hanging off the face. Ecology.normal
      // hands back a shared vector, so copy the components out.
      nx: nrm.x, ny: nrm.y, nz: nrm.z,
      s: size,
      sx: 1 + rng.gauss(0, 0.14), sz: 1 + rng.gauss(0, 0.14),
      yaw: rng.next() * Math.PI * 2,
      pitch: rng.gauss(0, 0.22), roll: rng.gauss(0, 0.22),
      bury: kind.bury * rng.range(0.7, 1.5),
      tint: 0.82 + rng.next() * 0.36,
      warm: rng.gauss(0, 0.06),
    };
  }

  update(camPos) {
    if (this._last.distanceToSquared(camPos) < 100) return;
    this._last.copy(camPos);
    for (const g of this.groups) {
      let w = 0;
      const r2 = g.range * g.range;
      for (const it of g.items) {
        const dx = it.x - camPos.x, dz = it.z - camPos.z;
        if (dx * dx + dz * dz > r2) continue;
        if (w >= g.max) break;
        _e.set(it.pitch, it.yaw, it.roll);
        _q.setFromEuler(_e);
        const sink = it.s * it.bury;
        _p.set(it.x - it.nx * sink, it.y - it.ny * sink, it.z - it.nz * sink);
        _s.set(it.s * it.sx, it.s, it.s * it.sz);
        _m.compose(_p, _q, _s);
        _m.toArray(g.mesh.instanceMatrix.array, w * 16);
        const c = g.mesh.instanceColor.array;
        c[w * 3] = it.tint * (1 + it.warm);
        c[w * 3 + 1] = it.tint;
        c[w * 3 + 2] = it.tint * (1 - it.warm);
        w++;
      }
      g.mesh.count = w;
      g.mesh.instanceMatrix.needsUpdate = true;
      g.mesh.instanceColor.needsUpdate = true;
    }
  }
}
