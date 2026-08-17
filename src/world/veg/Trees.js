import * as THREE from 'three';
import { Rng } from '../../util/Rng.js';
import { buildTree, TREE_SPECIES } from './TreeBuilder.js';
import { patchVeg, bakeFlex, registerAlphaCard } from './VegMaterial.js';
import { leafClusterTex, bakeTreeImpostor, barkMaps } from './VegTextures.js';

/**
 * Instanced forest. Each species has several pre-built variants; every tree in
 * the world is one variant + a transform. Trees inside `geoRange` render as
 * real branch geometry, everything beyond swaps to a textured cross-billboard,
 * and the split is re-evaluated whenever the camera makes a meaningful move.
 */

const VARIANTS = 3;
/** Per-species canopy tint so a grove never reads as one flat colour. */
const SPECIES_TINT = {
  dead: [1.0, 1.0, 1.0],
  savanna: [1.00, 0.92, 0.58],     // dry olive
  conifer: [0.70, 0.83, 0.70],     // cool blue-green
  broadleaf: [0.80, 0.88, 0.60],   // dusty, never lawn-green
};
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/** Impostor: two crossed quads anchored at the base. */
function billboardGeo(width, height) {
  const g = new THREE.BufferGeometry();
  const p = [], n = [], uv = [], idx = [], col = [];
  const hw = width * 0.5;
  for (let k = 0; k < 2; k++) {
    const dx = k === 0 ? hw : 0, dz = k === 0 ? 0 : hw;
    const base = k * 4;
    p.push(-dx, 0, -dz, dx, 0, dz, dx, height, dz, -dx, height, -dz);
    for (let i = 0; i < 4; i++) n.push(0, 0.62, 0.78);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let i = 0; i < 4; i++) col.push(1, 1, 1);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  bakeFlex(g);
  g.computeBoundingSphere();
  return g;
}

export class Trees {
  constructor(eco, scene, { quality = 1, geoRange = 135, farRange = 460 } = {}) {
    this.eco = eco;
    this.scene = scene;
    this.quality = quality;
    this.geoRange = geoRange;
    this.farRange = farRange;
    this.variants = [];
    this.impostors = new Map();
    this.placements = [];
    this._last = new THREE.Vector3(1e9, 0, 1e9);
  }

  /** @param {THREE.WebGLRenderer} renderer needed to bake impostors */
  build(renderer) {
    const speciesList = Object.keys(TREE_SPECIES);
    const bark = barkMaps(0x6f5a45);

    for (const sp of speciesList) {
      const S = TREE_SPECIES[sp];
      const woodMat = patchVeg(new THREE.MeshStandardMaterial({
        color: S.bark, roughness: S.barkRough, metalness: 0,
        map: bark.map, normalMap: bark.normalMap,
        normalScale: new THREE.Vector2(0.85, 0.85),
      }), { bend: 0.55, flutter: 0.1, gustFreq: 0.03, flexPow: 2.4 });

      let leafMat = null;
      if (S.leafCount > 0) {
        leafMat = patchVeg(new THREE.MeshStandardMaterial({
          map: leafClusterTex(S.leafKind),
          color: 0xffffff, vertexColors: true,
          alphaTest: 0.42, transparent: false, side: THREE.DoubleSide,
          roughness: 0.72, metalness: 0,
        }), {
          bend: 0.75, flutter: 0.5, gustFreq: 0.032, flexPow: 2.2,
          translucency: 0.85, twoSidedNormals: true,
        });
      }

      for (let v = 0; v < VARIANTS; v++) {
        const t = buildTree(sp, 9001 + v * 733 + sp.length * 37);
        const maxInst = Math.max(8, Math.round(46 * this.quality));
        const wood = new THREE.InstancedMesh(t.wood, woodMat, maxInst);
        wood.castShadow = true; wood.receiveShadow = true;
        wood.count = 0; wood.frustumCulled = false;
        wood.name = `tree_${sp}_${v}_wood`;
        this.scene.add(wood);

        let leaves = null;
        if (t.leaves && leafMat) {
          leaves = new THREE.InstancedMesh(t.leaves, leafMat, maxInst);
          leaves.castShadow = true; leaves.receiveShadow = true;
          leaves.count = 0; leaves.frustumCulled = false;
          leaves.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxInst * 3), 3);
          leaves.name = `tree_${sp}_${v}_leaf`;
          registerAlphaCard(leaves);
          this.scene.add(leaves);
        }
        const key = `${sp}_${v}`;
        this.variants.push({ sp, v, key, wood, leaves, height: t.height, radius: t.radius, max: maxInst });

        // distance impostor, baked straight off this variant's geometry
        const impTex = bakeTreeImpostor(renderer, {
          wood: t.wood, leaves: t.leaves,
          woodMap: bark.map, woodColor: S.bark,
          leafMap: leafMat ? leafMat.map : null,
          height: t.height, radius: Math.max(t.radius, t.height * 0.22),
        }, 256);
        const impMat = patchVeg(new THREE.MeshStandardMaterial({
          map: impTex, color: 0xffffff, vertexColors: true,
          alphaTest: 0.42, transparent: false, side: THREE.DoubleSide,
          roughness: 0.9, metalness: 0,
        }), {
          bend: 0.2, flutter: 0.06, gustFreq: 0.03, flexPow: 3.0,
          twoSidedNormals: true, translucency: 0.5,
        });
        const maxImp = Math.max(24, Math.round(180 * this.quality));
        const cardW = Math.max(t.radius, t.height * 0.22) * 2.12;
        const imp = new THREE.InstancedMesh(billboardGeo(cardW, t.height * 1.02), impMat, maxImp);
        imp.castShadow = false; imp.receiveShadow = true;
        imp.count = 0; imp.frustumCulled = false;
        imp.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxImp * 3), 3);
        imp.name = `tree_${key}_impostor`;
        registerAlphaCard(imp);
        this.scene.add(imp);
        this.impostors.set(key, { mesh: imp, max: maxImp });
      }
    }

    this._place();
  }

  _place() {
    const eco = this.eco;
    const rng = new Rng(31337);
    const pts = eco.scatterClustered(0x7ee5, {
      radius: this.farRange, cellSize: 52, perCell: 9, spread: 17,
      density: (x, z) => eco.treeDensity(x, z),
      maxCount: 2600,
    });
    const byVariant = this.byKey = new Map();
    for (const v of this.variants) byVariant.set(v.key, v);

    for (const p of pts) {
      const sp = eco.treeSpecies(p.x, p.z);
      const vi = Math.floor(rng.next() * VARIANTS);
      const key = `${sp}_${vi}`;
      const variant = byVariant.get(key);
      if (!variant) continue;
      const scale = (0.62 + p.w * 0.5) * rng.range(0.78, 1.34);
      this.placements.push({
        x: p.x, y: p.y, z: p.z, sp, vi,
        s: scale,
        yaw: rng.next() * Math.PI * 2,
        tilt: rng.gauss(0, 0.045),
        tint: 0.70 + rng.next() * 0.4,
        hue: rng.gauss(0, 0.07),
        h: variant.height * scale,
      });
    }
    this.count = this.placements.length;
  }

  /** @param {THREE.Vector3} camPos */
  update(camPos) {
    if (this._last.distanceToSquared(camPos) < 100) return;
    this._last.copy(camPos);

    const geoR2 = this.geoRange * this.geoRange;
    for (const v of this.variants) { v._w = 0; }
    for (const [, im] of this.impostors) { im._w = 0; }

    // near pass first so the closest trees always win the geometry budget
    const near = [];
    for (let i = 0; i < this.placements.length; i++) {
      const p = this.placements[i];
      const dx = p.x - camPos.x, dz = p.z - camPos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < geoR2) near.push([d2, p]);
      else this._writeImpostor(p);
    }
    near.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < near.length; i++) {
      const p = near[i][1];
      const key = `${p.sp}_${p.vi}`;
      const v = this.byKey.get(key);
      if (!v) continue;
      if (v._w >= v.max) { this._writeImpostor(p); continue; }
      const w = v._w++;
      _e.set(p.tilt, p.yaw, p.tilt * 0.7);
      _q.setFromEuler(_e);
      _p.set(p.x, p.y - 0.15, p.z);
      _s.set(p.s, p.s, p.s);
      _m.compose(_p, _q, _s);
      _m.toArray(v.wood.instanceMatrix.array, w * 16);
      if (v.leaves) {
        _m.toArray(v.leaves.instanceMatrix.array, w * 16);
        const c = v.leaves.instanceColor.array;
        const t = SPECIES_TINT[p.sp] || [1, 1, 1];
        c[w * 3] = p.tint * t[0] * (1 + p.hue);
        c[w * 3 + 1] = p.tint * t[1];
        c[w * 3 + 2] = p.tint * t[2] * (1 - p.hue * 0.8);
      }
    }

    for (const v of this.variants) {
      v.wood.count = v._w;
      v.wood.instanceMatrix.needsUpdate = true;
      if (v.leaves) {
        v.leaves.count = v._w;
        v.leaves.instanceMatrix.needsUpdate = true;
        v.leaves.instanceColor.needsUpdate = true;
      }
    }
    for (const [, im] of this.impostors) {
      im.mesh.count = im._w;
      im.mesh.instanceMatrix.needsUpdate = true;
      im.mesh.instanceColor.needsUpdate = true;
    }
  }

  _writeImpostor(p) {
    const im = this.impostors.get(`${p.sp}_${p.vi}`);
    if (!im || im._w >= im.max) return;
    const w = im._w++;
    _e.set(0, p.yaw, 0);
    _q.setFromEuler(_e);
    _p.set(p.x, p.y - 0.15, p.z);
    // the card is baked at the variant's own size, so this is the tree scale
    const k = p.s;
    _s.set(k, k, k);
    _m.compose(_p, _q, _s);
    _m.toArray(im.mesh.instanceMatrix.array, w * 16);
    const c = im.mesh.instanceColor.array;
    const t = SPECIES_TINT[p.sp] || [1, 1, 1];
    c[w * 3] = p.tint * t[0] * (1 + p.hue);
    c[w * 3 + 1] = p.tint * t[1];
    c[w * 3 + 2] = p.tint * t[2] * (1 - p.hue * 0.8);
  }
}
