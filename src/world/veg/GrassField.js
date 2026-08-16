import * as THREE from 'three';
import { Rng } from '../../util/Rng.js';
import { hash3 } from './Ecology.js';
import { patchVeg, bakeFlex, registerAlphaCard } from './VegMaterial.js';
import { grassClumpTex } from './VegTextures.js';

/**
 * Camera-following instanced grass with three LOD rings:
 *
 *   0  real tapered blade geometry, 0-58 m
 *   1  crossed alpha-cut clump cards, 52-150 m
 *   2  big sparse clump cards, 140-320 m
 *
 * Placement is *position-hashed*, never sequence-dependent, so a tile
 * regenerates byte-identically no matter which order tiles stream in. Tiles are
 * cached as flat matrix/colour arrays; a refill is then just a memcpy, which is
 * what keeps the whole field at three draw calls with no per-frame CPU cost.
 */

// The outer ring used to reach 300 m. An alpha-cut card that small samples the
// coarsest mips, where its silhouette no longer exists, so the whole quad
// passes or fails as one block and the field turns into a rash of dark
// rectangles. Ending the ring where the cards are still several pixels across
// and handing the rest to the terrain's own grass tint reads far better than
// stamping geometry the alpha test cannot resolve.
const LODS = [
  { name: 'blade', tile: 16, far: 46, spacing: 0.155, max: 210000 },
  { name: 'clump', tile: 32, near: 40, far: 132, spacing: 0.8, max: 78000 },
  { name: 'far', tile: 64, near: 122, far: 196, spacing: 2.2, max: 44000 },
];

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3();
const _cGrass = new THREE.Color();
const _cGround = new THREE.Color();

/** Tapered, slightly curved blade. Vertex colour carries the root->tip ramp. */
function bladeGeometry(segs = 4) {
  const rows = segs + 1;
  const pos = [], nor = [], uv = [], col = [], flex = [], idx = [];
  const halfW = 0.0135, curve = 0.28;
  for (let i = 0; i < rows; i++) {
    const t = i / segs;
    const w = halfW * (1 - Math.pow(t, 1.45));
    const y = t;
    const z = curve * t * t;
    // normals lean toward "up" so blades read as soft foliage, not metal shards
    const nz = 0.58, ny = 0.81;
    for (let s = -1; s <= 1; s += 2) {
      pos.push(s * w, y, z);
      nor.push(s * 0.14, ny, nz);
      uv.push(s * 0.5 + 0.5, t);
      const shade = 0.34 + Math.pow(t, 0.8) * 0.82;
      col.push(shade * 0.97, shade, shade * 0.86);
      flex.push(t);
    }
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aFlex', new THREE.Float32BufferAttribute(flex, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** N crossed quads, unit height, used for clump cards. */
function crossCardGeometry(planes = 3, width = 1.0) {
  const pos = [], nor = [], uv = [], col = [], idx = [];
  let v = 0;
  for (let p = 0; p < planes; p++) {
    const a = (p / planes) * Math.PI;
    const cx = Math.cos(a) * width * 0.5, cz = Math.sin(a) * width * 0.5;
    const nx = -Math.sin(a) * 0.5, nz = Math.cos(a) * 0.5;
    const quad = [
      [-cx, 0, -cz, 0, 0], [cx, 0, cz, 1, 0],
      [cx, 1, cz, 1, 1], [-cx, 1, -cz, 0, 1],
    ];
    for (const [x, y, z, u, vv] of quad) {
      pos.push(x, y, z);
      nor.push(nx * 0.35, 0.9, nz * 0.35);
      uv.push(u, vv);
      const shade = 0.6 + vv * 0.55;
      col.push(shade, shade, shade);
    }
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    v += 4;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  bakeFlex(g);
  g.computeBoundingSphere();
  return g;
}

export class GrassField {
  /**
   * @param {import('./Ecology.js').Ecology} eco
   * @param {THREE.Scene} scene
   */
  constructor(eco, scene, { quality = 1 } = {}) {
    this.eco = eco;
    this.scene = scene;
    this.quality = quality;
    this.tiles = new Map();
    this.meshes = [];
    this._last = new THREE.Vector3(1e9, 0, 1e9);
    this._budget = 6;          // new tiles generated per update
    this._pending = true;
  }

  build() {
    const bladeGeo = bladeGeometry(4);
    const clumpGeo = crossCardGeometry(3, 1.0);
    const farGeo = crossCardGeometry(2, 1.0);

    const grassMat = (opts) => patchVeg(new THREE.MeshStandardMaterial({
      color: 0xffffff, vertexColors: true, roughness: 0.86, metalness: 0,
      side: THREE.DoubleSide, ...opts.mat,
    }), opts.veg);

    const m0 = grassMat({
      mat: {},
      veg: { bend: 0.34, flutter: 0.34, gustFreq: 0.052, trample: 0.85, flexPow: 1.9, twoSidedNormals: true, aoBoost: 0.42 },
    });
    // the alpha reference the mip chain preserves must be the alpha test the
    // material will actually run, or the far LODs come out denser than the
    // near ones and the field grows a hard edge at the LOD ring
    const clumpTexA = grassClumpTex(0, 46, 0.42);
    const clumpTexB = grassClumpTex(1, 30, 0.42);
    const m1 = grassMat({
      mat: { map: clumpTexA, alphaTest: 0.42, transparent: false },
      veg: { bend: 0.3, flutter: 0.2, gustFreq: 0.05, trample: 0.5, flexPow: 2.0, twoSidedNormals: true, aoBoost: 0.3 },
    });
    const m2 = grassMat({
      mat: { map: clumpTexB, alphaTest: 0.42, transparent: false },
      veg: { bend: 0.24, flutter: 0.1, gustFreq: 0.045, flexPow: 2.0, twoSidedNormals: true, aoBoost: 0.2 },
    });

    const geos = [bladeGeo, clumpGeo, farGeo];
    const mats = [m0, m1, m2];

    for (let i = 0; i < LODS.length; i++) {
      const lod = LODS[i];
      const max = Math.max(64, Math.floor(lod.max * this.quality));
      const mesh = new THREE.InstancedMesh(geos[i], mats[i], max);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.renderOrder = 1;
      mesh.name = `grass_${lod.name}`;
      if (i > 0) registerAlphaCard(mesh);
      this.scene.add(mesh);
      this.meshes.push({ mesh, lod, max });
    }
  }

  /** Build (and cache) one tile's instance data. */
  _makeTile(li, tx, tz) {
    const lod = LODS[li];
    const eco = this.eco;
    const T = lod.tile;
    const x0 = tx * T, z0 = tz * T;
    const rng = new Rng(hash3(tx, tz, 7717 + li * 131));

    // coarse fields, bilerped per instance — density noise is far too costly
    // to evaluate hundreds of thousands of times.
    const CG = 6;                      // density / colour grid
    const HG = li === 0 ? 24 : 12;     // height grid
    const dg = new Float32Array((CG + 1) * (CG + 1));
    const cg = new Float32Array((CG + 1) * (CG + 1) * 3);
    for (let j = 0; j <= CG; j++) {
      for (let i = 0; i <= CG; i++) {
        const x = x0 + (i / CG) * T, z = z0 + (j / CG) * T;
        const k = j * (CG + 1) + i;
        dg[k] = eco.grassDensity(x, z);
        eco.grassColor(x, z, _cGrass);
        eco.groundColor(x, z, _cGround);
        _cGrass.lerp(_cGround, 0.34);
        cg[k * 3] = _cGrass.r; cg[k * 3 + 1] = _cGrass.g; cg[k * 3 + 2] = _cGrass.b;
      }
    }
    const hg = new Float32Array((HG + 1) * (HG + 1));
    for (let j = 0; j <= HG; j++) {
      for (let i = 0; i <= HG; i++) {
        hg[j * (HG + 1) + i] = eco.height(x0 + (i / HG) * T, z0 + (j / HG) * T);
      }
    }
    const bil = (arr, g, u, v, stride = 1, c = 0) => {
      const fu = u * g, fv = v * g;
      const iu = Math.min(g - 1, fu | 0), iv = Math.min(g - 1, fv | 0);
      const su = fu - iu, sv = fv - iv;
      const a = arr[(iv * (g + 1) + iu) * stride + c];
      const b = arr[(iv * (g + 1) + iu + 1) * stride + c];
      const cc = arr[((iv + 1) * (g + 1) + iu) * stride + c];
      const d = arr[((iv + 1) * (g + 1) + iu + 1) * stride + c];
      return (a * (1 - su) + b * su) * (1 - sv) + (cc * (1 - su) + d * su) * sv;
    };

    const n = Math.max(1, Math.round(T / lod.spacing));
    const cap = n * n;
    const mArr = new Float32Array(cap * 16);
    const cArr = new Float32Array(cap * 3);
    let count = 0;

    const isBlade = li === 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const u = (i + rng.next()) / n, v = (j + rng.next()) / n;
        const d = bil(dg, CG, u, v);
        if (d < 0.02 || rng.next() > d) continue;
        const x = x0 + u * T, z = z0 + v * T;
        const y = bil(hg, HG, u, v);

        const jitter = rng.next();
        let h, w;
        if (isBlade) {
          h = (0.15 + 0.30 * d) * (0.55 + jitter * 1.05);
          w = 0.85 + rng.next() * 1.0;
        } else if (li === 1) {
          h = (0.3 + 0.55 * d) * (0.62 + jitter * 1.0);
          w = h * (1.15 + rng.next() * 0.8);
        } else {
          // bigger cards on the outer ring: a few large clumps resolve, a
          // scatter of tiny ones only aliases
          h = (0.62 + 0.9 * d) * (0.8 + jitter * 0.8);
          w = h * (1.25 + rng.next() * 0.9);
        }
        const yaw = rng.next() * Math.PI * 2;
        const tilt = isBlade ? rng.gauss(0, 0.19) : rng.gauss(0, 0.07);
        _e.set(tilt, yaw, rng.gauss(0, isBlade ? 0.19 : 0.06));
        _q.setFromEuler(_e);
        _pos.set(x, y - 0.03, z);
        _scl.set(w, h, w);
        _m.compose(_pos, _q, _scl);
        _m.toArray(mArr, count * 16);

        // per-blade value + hue spread; a minority go straw-dry so the field
        // never reads as one flat colour
        const k = 0.66 + jitter * 0.72;
        const dry = Math.pow(rng.next(), 2.2);
        const hue = rng.next() * 0.2 - 0.09 + dry * 0.5;
        cArr[count * 3] = bil(cg, CG, u, v, 3, 0) * k * (1 + hue * 1.1);
        cArr[count * 3 + 1] = bil(cg, CG, u, v, 3, 1) * k * (1 + dry * 0.22);
        cArr[count * 3 + 2] = bil(cg, CG, u, v, 3, 2) * k * (1 - hue * 0.7);
        count++;
      }
    }
    // slice (not subarray) so the oversized candidate buffer can be collected
    return { m: mArr.slice(0, count * 16), c: cArr.slice(0, count * 3), n: count };
  }

  _tileFor(li, tx, tz) {
    const key = (li * 4096 + (tx & 2047)) * 4096 + (tz & 2047);
    let t = this.tiles.get(key);
    if (t) return t;
    if (this._budget <= 0) return null;
    this._budget--;
    t = this._makeTile(li, tx, tz);
    this.tiles.set(key, t);
    if (this.tiles.size > 900) {
      // cheap FIFO eviction — tiles are pure functions of position
      const it = this.tiles.keys();
      for (let i = 0; i < 120; i++) { const k = it.next().value; if (k !== key) this.tiles.delete(k); }
    }
    return t;
  }

  /** @param {THREE.Vector3} camPos */
  update(camPos) {
    const moved = this._last.distanceToSquared(camPos);
    if (moved < 36 && !this._pending) return;
    this._budget = 6;
    this._last.copy(camPos);
    let pending = false;

    for (let li = 0; li < this.meshes.length; li++) {
      const { mesh, lod, max } = this.meshes[li];
      const T = lod.tile;
      const far = lod.far, near = lod.near || 0;
      const r = Math.ceil(far / T);
      const cx = Math.round(camPos.x / T), cz = Math.round(camPos.z / T);
      const mArr = mesh.instanceMatrix.array;
      const cArr = mesh.instanceColor.array;
      let w = 0;

      outer:
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const tx = cx + dx, tz = cz + dz;
          const ox = (tx + 0.5) * T - camPos.x, oz = (tz + 0.5) * T - camPos.z;
          const dist = Math.hypot(ox, oz);
          if (dist > far + T * 0.75) continue;
          if (near > 0 && dist < near - T * 0.75) continue;
          if (Math.hypot((tx + 0.5) * T, (tz + 0.5) * T) > this.eco.worldRadius + T) continue;
          const t = this._tileFor(li, tx, tz);
          if (!t) { pending = true; continue; }
          if (w + t.n > max) break outer;
          mArr.set(t.m, w * 16);
          cArr.set(t.c, w * 3);
          w += t.n;
        }
      }
      mesh.count = w;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    }
    this._pending = pending;
  }

  get stats() {
    let inst = 0;
    for (const m of this.meshes) inst += m.mesh.count;
    return { instances: inst, draws: this.meshes.length };
  }
}
