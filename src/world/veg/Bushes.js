import * as THREE from 'three';
import { Rng } from '../../util/Rng.js';
import { buildTree } from './TreeBuilder.js';
import { patchVeg, registerAlphaCard } from './VegMaterial.js';
import { leafClusterTex, fernTex, barkMaps } from './VegTextures.js';

/**
 * Scrub layer: sagebrush, dry thorn balls, low green shrubs and ferns.
 * Bushes are built with the same recursive branch generator as trees, just at
 * a different scale — which keeps their twig structure consistent with the
 * canopies above them.
 */

const BUSH = {
  sage: {
    base: 'broadleaf', variants: 2, range: 165, count: 2600,
    params: {
      height: 1.05, trunkR: 0.045, depth: 3, kids: [3, 4], spread: [0.85, 1.5],
      lenFall: 0.72, radFall: 0.6, curl: 0.5, droop: -0.05, upBias: 0.55,
      trunkFrac: 0.34, leafDepth: 2, leafCount: 7, leafSize: 0.3,
      leafKind: 'dry', bark: 0x8b7d63, barkRough: 0.95,
    },
    tint: [1.0, 0.94, 0.66], scale: [0.55, 1.75],
    density: (eco, x, z) => eco.scrubDensity(x, z),
  },
  thorn: {
    base: 'dead', variants: 2, range: 155, count: 1500,
    params: {
      height: 1.35, trunkR: 0.05, depth: 4, kids: [2, 3], spread: [1.0, 1.8],
      lenFall: 0.7, radFall: 0.6, curl: 1.1, droop: -0.02, upBias: 0.42,
      trunkFrac: 0.3, leafDepth: 99, leafCount: 0,
      bark: 0x6f5c46, barkRough: 0.95,
    },
    tint: [1.0, 0.95, 0.82], scale: [0.5, 1.6],
    density: (eco, x, z) => eco.scrubDensity(x, z) * 0.75,
  },
  shrub: {
    base: 'broadleaf', variants: 2, range: 150, count: 1900,
    params: {
      height: 1.5, trunkR: 0.06, depth: 3, kids: [3, 4], spread: [0.7, 1.2],
      lenFall: 0.72, radFall: 0.62, curl: 0.45, droop: 0.0, upBias: 0.6,
      trunkFrac: 0.34, leafDepth: 2, leafCount: 9, leafSize: 0.42,
      leafKind: 'broad', bark: 0x6a5a44, barkRough: 0.92,
    },
    tint: [0.78, 0.88, 0.54], scale: [0.55, 1.6],
    density: (eco, x, z) => {
      const m = eco.wetness(x, z);
      return eco.grassDensity(x, z) * THREE.MathUtils.smoothstep(m, 0.52, 0.88);
    },
  },
};

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Radial spray of arching fern fronds, for damp low ground. */
function fernGeometry(seed) {
  const rng = new Rng(seed);
  const p = [], n = [], uv = [], col = [], idx = [], flex = [];
  const fronds = 8;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + rng.gauss(0, 0.25);
    const lean = rng.range(0.35, 0.75);
    const len = rng.range(0.40, 0.68);
    const wid = len * 0.44;
    const dx = Math.cos(a), dz = Math.sin(a);
    // frond plane: "up" tilted outward, "side" perpendicular
    const uy = 1 - lean, ux = dx * lean, uz = dz * lean;
    const sx = -dz, sz = dx;
    const base = p.length / 3;
    const corners = [[-1, 0], [1, 0], [1, 1], [-1, 1]];
    for (const [cx, cy] of corners) {
      p.push(sx * cx * wid * 0.5 + ux * cy * len,
        uy * cy * len,
        sz * cx * wid * 0.5 + uz * cy * len);
      n.push(dx * 0.3, 0.9, dz * 0.3);
      uv.push(cx * 0.5 + 0.5, cy);
      const sh = 0.7 + cy * 0.45;
      col.push(sh, sh, sh);
      flex.push(cy);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aFlex', new THREE.Float32BufferAttribute(flex, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export class Bushes {
  constructor(eco, scene, { quality = 1 } = {}) {
    this.eco = eco;
    this.scene = scene;
    this.quality = quality;
    this.groups = [];
    this._last = new THREE.Vector3(1e9, 0, 1e9);
  }

  build() {
    const bark = barkMaps(0x7a6650);
    const rng = new Rng(5150);

    for (const key of Object.keys(BUSH)) {
      const spec = BUSH[key];
      const woodMat = patchVeg(new THREE.MeshStandardMaterial({
        color: spec.params.bark, roughness: spec.params.barkRough, metalness: 0,
        map: bark.map, normalMap: bark.normalMap,
        normalScale: new THREE.Vector2(0.6, 0.6),
      }), { bend: 0.28, flutter: 0.22, gustFreq: 0.05, flexPow: 1.9 });

      let leafMat = null;
      if (spec.params.leafCount > 0) {
        leafMat = patchVeg(new THREE.MeshStandardMaterial({
          map: leafClusterTex(spec.params.leafKind), color: 0xffffff,
          vertexColors: true, alphaTest: 0.4, transparent: false,
          side: THREE.DoubleSide, roughness: 0.78, metalness: 0,
        }), {
          bend: 0.42, flutter: 0.55, gustFreq: 0.05, flexPow: 1.7,
          translucency: 1.35, twoSidedNormals: true,
        });
      }

      const placements = this.eco.scatterClustered(0x1b0b ^ key.length * 977, {
        radius: spec.range * 1.05, cellSize: 40, perCell: 13, spread: 9,
        density: (x, z) => spec.density(this.eco, x, z),
        maxCount: Math.round(spec.count * this.quality),
      });

      const per = Math.ceil(placements.length / spec.variants) + 32;
      const variants = [];
      for (let v = 0; v < spec.variants; v++) {
        const t = buildTree(spec.base, 4242 + v * 613 + key.length * 71, spec.params);
        const wood = new THREE.InstancedMesh(t.wood, woodMat, per);
        wood.castShadow = true; wood.receiveShadow = true;
        wood.count = 0; wood.frustumCulled = false;
        wood.name = `bush_${key}_${v}`;
        this.scene.add(wood);
        let leaves = null;
        if (t.leaves && leafMat) {
          leaves = new THREE.InstancedMesh(t.leaves, leafMat, per);
          leaves.castShadow = true; leaves.receiveShadow = true;
          leaves.count = 0; leaves.frustumCulled = false;
          leaves.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(per * 3), 3);
          leaves.name = `bush_${key}_${v}_leaf`;
          registerAlphaCard(leaves);
          this.scene.add(leaves);
        }
        variants.push({ wood, leaves, max: per });
      }

      const items = placements.map((pt) => ({
        x: pt.x, y: pt.y, z: pt.z,
        vi: Math.floor(rng.next() * spec.variants),
        // heavy-tailed size distribution: mostly knee-high scrub with the odd
        // waist-high bush that breaks up the speckle. The tail used to run to
        // two and a half metres, which put sagebrush over Gladiolus's head.
        s: (0.5 + pt.w * 0.7) * (spec.scale[0] + Math.pow(rng.next(), 2.1) * (spec.scale[1] - spec.scale[0])) * 0.78,
        yaw: rng.next() * Math.PI * 2,
        tilt: rng.gauss(0, 0.09),
        tint: 0.82 + rng.next() * 0.4,
      }));
      this.groups.push({ key, spec, variants, items });
    }

    // Ferns: damp hollows only, one instanced mesh.
    const fernMat = patchVeg(new THREE.MeshStandardMaterial({
      map: fernTex(), color: 0xb9c69a, vertexColors: true,
      alphaTest: 0.38, transparent: false, side: THREE.DoubleSide,
      roughness: 0.7, metalness: 0,
    }), { bend: 0.4, flutter: 0.6, gustFreq: 0.05, flexPow: 1.6, translucency: 1.7, twoSidedNormals: true });
    const fernPts = this.eco.scatterClustered(0x3f2a, {
      radius: 150, cellSize: 30, perCell: 12, spread: 8,
      density: (x, z) => {
        const m = this.eco.wetness(x, z);
        const low = 1 - THREE.MathUtils.smoothstep(this.eco.height(x, z), 0, 12);
        return this.eco.grassDensity(x, z) * THREE.MathUtils.smoothstep(m, 0.7, 0.96) * low;
      },
      maxCount: Math.round(900 * this.quality),
    });
    const fernMax = fernPts.length + 32;
    const fern = new THREE.InstancedMesh(fernGeometry(88), fernMat, fernMax);
    fern.castShadow = true; fern.receiveShadow = true;
    fern.count = 0; fern.frustumCulled = false;
    fern.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(fernMax * 3), 3);
    fern.name = 'fern';
    registerAlphaCard(fern);
    this.scene.add(fern);
    this.groups.push({
      key: 'fern', spec: { range: 130, variants: 1 },
      variants: [{ wood: fern, leaves: null, max: fernMax }],
      items: fernPts.map((pt) => ({
        x: pt.x, y: pt.y, z: pt.z, vi: 0,
        s: (0.45 + pt.w * 0.5) * rng.range(0.6, 1.05),
        yaw: rng.next() * Math.PI * 2, tilt: rng.gauss(0, 0.07),
        tint: 0.8 + rng.next() * 0.4,
      })),
    });
  }

  update(camPos) {
    if (this._last.distanceToSquared(camPos) < 64) return;
    this._last.copy(camPos);
    for (const g of this.groups) {
      for (const v of g.variants) v._w = 0;
      const r2 = g.spec.range * g.spec.range;
      for (const it of g.items) {
        const dx = it.x - camPos.x, dz = it.z - camPos.z;
        if (dx * dx + dz * dz > r2) continue;
        const v = g.variants[it.vi];
        if (!v || v._w >= v.max) continue;
        const w = v._w++;
        _e.set(it.tilt, it.yaw, it.tilt * 0.6);
        _q.setFromEuler(_e);
        _p.set(it.x, it.y - 0.06, it.z);
        _s.set(it.s, it.s * 0.94, it.s);
        _m.compose(_p, _q, _s);
        _m.toArray(v.wood.instanceMatrix.array, w * 16);
        if (v.wood.instanceColor) {
          const c = v.wood.instanceColor.array;
          c[w * 3] = it.tint; c[w * 3 + 1] = it.tint; c[w * 3 + 2] = it.tint;
        }
        if (v.leaves) {
          _m.toArray(v.leaves.instanceMatrix.array, w * 16);
          const c = v.leaves.instanceColor.array;
          const t = g.spec.tint || [1, 1, 1];
          c[w * 3] = it.tint * t[0]; c[w * 3 + 1] = it.tint * t[1]; c[w * 3 + 2] = it.tint * t[2];
        }
      }
      for (const v of g.variants) {
        v.wood.count = v._w;
        v.wood.instanceMatrix.needsUpdate = true;
        if (v.wood.instanceColor) v.wood.instanceColor.needsUpdate = true;
        if (v.leaves) {
          v.leaves.count = v._w;
          v.leaves.instanceMatrix.needsUpdate = true;
          v.leaves.instanceColor.needsUpdate = true;
        }
      }
    }
  }
}
