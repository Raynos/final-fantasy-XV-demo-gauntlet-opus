import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Noise } from '../../util/Noise.js';
import { Rng } from '../../util/Rng.js';
import { rockMaterial } from './PropMaterials.js';

/**
 * Boulders, slabs and pebbles.
 *
 * A rock is not a lumpy sphere. Real stone breaks along planes: a granite
 * boulder is a handful of flat conchoidal fracture faces meeting at hard
 * arrises, sandstone carries horizontal bedding ledges, and only a river-worn
 * cobble is genuinely smooth. So every base mesh here is built by *cutting* a
 * noise-warped icosphere with random half-spaces, stepping it with strata, then
 * shaving the corners — and the normals are computed with a smoothing-angle
 * threshold so the fracture planes keep their sharp creases instead of being
 * averaged into a bread roll.
 *
 * Eight base meshes are instanced across the map in clusters — a car-sized
 * boulder with a skirt of angular talus around it reads as geology; evenly
 * spaced ellipsoids read as a particle system.
 */

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

/**
 * Rebuild normals with a smoothing-angle threshold.
 *
 * `computeVertexNormals` averages every face touching a vertex, which rounds
 * off exactly the arrises that make a rock read as fractured stone. This walks
 * the same adjacency but only averages faces whose normals are within
 * `angleDeg` of each other, and emits a non-indexed mesh so a vertex on a
 * crease can carry one normal per side.
 *
 * @param {THREE.BufferGeometry} geo indexed geometry
 * @param {number} angleDeg crease threshold in degrees
 * @returns {THREE.BufferGeometry} non-indexed geometry with split normals
 */
function splitNormals(geo, angleDeg) {
  const pos = geo.attributes.position;
  const idx = geo.index.array;
  const nTri = idx.length / 3;
  const fn = new Float32Array(nTri * 3);            // face normals, area-scaled
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ab = new THREE.Vector3(), ac = new THREE.Vector3(), cr = new THREE.Vector3();
  const adj = new Map();                            // vertex index -> [tri...]
  for (let t = 0; t < nTri; t++) {
    const i0 = idx[t * 3], i1 = idx[t * 3 + 1], i2 = idx[t * 3 + 2];
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    ab.subVectors(b, a); ac.subVectors(c, a);
    cr.crossVectors(ab, ac);
    fn[t * 3] = cr.x; fn[t * 3 + 1] = cr.y; fn[t * 3 + 2] = cr.z;
    for (const i of [i0, i1, i2]) {
      let l = adj.get(i);
      if (!l) { l = []; adj.set(i, l); }
      l.push(t);
    }
  }
  const unit = new Float32Array(nTri * 3);
  for (let t = 0; t < nTri; t++) {
    const l = Math.hypot(fn[t * 3], fn[t * 3 + 1], fn[t * 3 + 2]) || 1;
    unit[t * 3] = fn[t * 3] / l;
    unit[t * 3 + 1] = fn[t * 3 + 1] / l;
    unit[t * 3 + 2] = fn[t * 3 + 2] / l;
  }
  const cosT = Math.cos((angleDeg * Math.PI) / 180);

  const srcCol = geo.attributes.color;
  const out = new THREE.BufferGeometry();
  const P = new Float32Array(nTri * 9);
  const N = new Float32Array(nTri * 9);
  const C = srcCol ? new Float32Array(nTri * 9) : null;
  for (let t = 0; t < nTri; t++) {
    for (let k = 0; k < 3; k++) {
      const vi = idx[t * 3 + k];
      const o = (t * 3 + k) * 3;
      P[o] = pos.getX(vi); P[o + 1] = pos.getY(vi); P[o + 2] = pos.getZ(vi);
      if (C) { C[o] = srcCol.getX(vi); C[o + 1] = srcCol.getY(vi); C[o + 2] = srcCol.getZ(vi); }
      let nx = 0, ny = 0, nz = 0;
      for (const u of adj.get(vi)) {
        const d = unit[u * 3] * unit[t * 3] + unit[u * 3 + 1] * unit[t * 3 + 1]
          + unit[u * 3 + 2] * unit[t * 3 + 2];
        if (d < cosT) continue;
        nx += fn[u * 3]; ny += fn[u * 3 + 1]; nz += fn[u * 3 + 2];
      }
      const l = Math.hypot(nx, ny, nz) || 1;
      N[o] = nx / l; N[o + 1] = ny / l; N[o + 2] = nz / l;
    }
  }
  out.setAttribute('position', new THREE.BufferAttribute(P, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  if (C) out.setAttribute('color', new THREE.BufferAttribute(C, 3));
  // Triplanar UVs baked per face: project each triangle down its own dominant
  // axis. A single planar projection turns every near-horizontal facet — the
  // top of a slab, a bedding ledge — into a smear of stretched stripes, which
  // is the single loudest "this is a primitive" tell on a big rock.
  const UV = new Float32Array(nTri * 6);
  const K = 0.62;
  for (let t = 0; t < nTri; t++) {
    const ax = Math.abs(unit[t * 3]), ay = Math.abs(unit[t * 3 + 1]), az = Math.abs(unit[t * 3 + 2]);
    const axis = ax > ay && ax > az ? 0 : ay > az ? 1 : 2;
    for (let k = 0; k < 3; k++) {
      const i = t * 3 + k, o = i * 3;
      const x = P[o], y = P[o + 1], z = P[o + 2];
      const u = axis === 0 ? z : x;
      const v = axis === 1 ? z : y;
      UV[i * 2] = u * K; UV[i * 2 + 1] = v * K;
    }
  }
  out.setAttribute('uv', new THREE.BufferAttribute(UV, 2));
  out.computeBoundingSphere();
  return out;
}

/**
 * Build one rock base mesh.
 *
 * @param {number} seed
 * @param {object} o
 * @param {number} [o.detail] icosphere subdivision
 * @param {number} [o.warp] noise amplitude before cutting
 * @param {number[]} [o.stretch] xyz scale applied to the blank
 * @param {number} [o.planes] number of fracture half-spaces to cut with
 * @param {number} [o.upright] 0 = isotropic cut normals, 1 = steep/vertical
 * @param {number} [o.bite] how deep each cut goes (fraction of the extent)
 * @param {number} [o.bedding] strata ledge amplitude
 * @param {number} [o.beds] number of bedding planes
 * @param {number} [o.chips] shallow corner chips
 * @param {number} [o.round] 0 = fully faceted, 1 = river-worn (blend back)
 * @param {number} [o.crease] normal smoothing angle in degrees
 * @param {number} [o.flat] flatten the underside (for slabs sitting in soil)
 */
function rockGeometry(seed, {
  detail = 2, warp = 0.26, stretch = [1, 1, 1], planes = 7, upright = 0.35,
  bite = 0.78, bedding = 0, beds = 5, chips = 3, round = 0.06, crease = 30,
  flat = 0,
} = {}) {
  // PolyhedronGeometry is non-indexed and its UV seam duplicates a whole
  // column of vertices; weld on position alone so the crease walk below sees
  // a real adjacency graph.
  const raw = new THREE.IcosahedronGeometry(1, detail);
  raw.deleteAttribute('uv');
  raw.deleteAttribute('normal');
  const geo = mergeVertices(raw, 1e-4);
  raw.dispose();
  const n = new Noise(seed);
  const rng = new Rng(seed * 7 + 3);
  const pos = geo.attributes.position;
  const count = pos.count;
  const v = new THREE.Vector3();

  // --- blank: a noise-warped, stretched ellipsoid ------------------------
  const base = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(pos, i);
    const big = n.fbm3(v.x * 0.9, v.y * 0.9, v.z * 0.9, 3);
    const mid = n.fbm3(v.x * 2.7 + 11, v.y * 2.7, v.z * 2.7 - 4, 3);
    const r = 1 + big * warp + mid * warp * 0.4;
    v.multiplyScalar(r);
    v.x *= stretch[0]; v.y *= stretch[1]; v.z *= stretch[2];
    if (flat > 0 && v.y < 0) v.y *= 1 - flat;
    base[i * 3] = v.x; base[i * 3 + 1] = v.y; base[i * 3 + 2] = v.z;
  }
  const P = base.slice();

  // --- fracture: cut with half-spaces ------------------------------------
  // Vertices past the plane are projected *onto* it, so the cut leaves a
  // genuinely flat facet rather than a dent, and the ring where it meets the
  // old surface becomes a hard arris.
  const cut = (nx, ny, nz, frac) => {
    let hi = -Infinity, lo = Infinity;
    for (let i = 0; i < count; i++) {
      const d = P[i * 3] * nx + P[i * 3 + 1] * ny + P[i * 3 + 2] * nz;
      if (d > hi) hi = d;
      if (d < lo) lo = d;
    }
    const dPlane = lo + (hi - lo) * frac;
    for (let i = 0; i < count; i++) {
      const d = P[i * 3] * nx + P[i * 3 + 1] * ny + P[i * 3 + 2] * nz;
      if (d <= dPlane) continue;
      const e = d - dPlane;
      P[i * 3] -= nx * e; P[i * 3 + 1] -= ny * e; P[i * 3 + 2] -= nz * e;
    }
  };

  for (let k = 0; k < planes; k++) {
    // bias toward steep planes: joint sets in real rock are near-vertical
    const th = rng.next() * Math.PI * 2;
    const yb = rng.gauss(0, 1) * (1 - upright) * 0.9;
    const l = Math.hypot(Math.cos(th), yb, Math.sin(th)) || 1;
    cut(Math.cos(th) / l, yb / l, Math.sin(th) / l, bite + rng.gauss(0, 0.07));
  }
  // chipped corners: shallow shaves that only take the tip off
  for (let k = 0; k < chips; k++) {
    const th = rng.next() * Math.PI * 2;
    const ph = Math.acos(rng.range(-1, 1));
    cut(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th),
      rng.range(0.90, 0.985));
  }

  // --- bedding: horizontal strata ledges ---------------------------------
  if (bedding > 0) {
    let yMin = Infinity, yMax = -Infinity;
    for (let i = 0; i < count; i++) {
      yMin = Math.min(yMin, P[i * 3 + 1]); yMax = Math.max(yMax, P[i * 3 + 1]);
    }
    const h = Math.max(1e-4, yMax - yMin);
    for (let i = 0; i < count; i++) {
      const t = ((P[i * 3 + 1] - yMin) / h) * beds;
      const bed = Math.floor(t);
      // sawtooth inside each bed: a hard step at every bedding plane, then the
      // face weathers back until the next one
      const f = t - bed;
      const k = 1 + bedding * (0.5 - f) + bedding * 0.45 * ((bed % 2) - 0.5);
      P[i * 3] *= k; P[i * 3 + 2] *= k;
    }
  }

  // --- optional blend back toward the smooth blank -----------------------
  for (let i = 0; i < count * 3; i++) P[i] += (base[i] - P[i]) * round;

  // --- normalise scale so `size` means the same thing for every kind -----
  let rad = 0;
  for (let i = 0; i < count; i++) {
    rad = Math.max(rad, Math.hypot(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]));
  }
  const inv = 1 / (rad || 1);
  for (let i = 0; i < count * 3; i++) P[i] *= inv;
  pos.array.set(P);
  pos.needsUpdate = true;

  // --- vertex colour: dust on the ledges, grime in the crevices ----------
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const len = Math.hypot(x, y, z) || 1;
    const up = THREE.MathUtils.clamp(y / len, -1, 1);
    // cavity: points that sit well inside the hull are in a re-entrant corner
    const cav = THREE.MathUtils.clamp((len - 0.62) / 0.38, 0, 1);
    const grain = n.fbm3(x * 3.1 + 5, y * 3.1, z * 3.1 - 7, 3) * 0.5 + 0.5;
    const k = (0.44 + 0.26 * Math.max(0, up) + grain * 0.2) * (0.58 + 0.42 * cav);
    col[i * 3] = k * 1.06; col[i * 3 + 1] = k; col[i * 3 + 2] = k * 0.9;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const out = splitNormals(geo, crease);
  geo.dispose();
  return out;
}

const KINDS = [
  // car-sized granite: few, huge, flat conchoidal faces and hard arrises
  {
    key: 'granite', seed: 101, size: [2.2, 6.0], bury: 0.26, w: 1.0,
    opts: {
      detail: 2, warp: 0.19, stretch: [1.16, 0.86, 1.0], planes: 9,
      upright: 0.5, bite: 0.74, chips: 4, round: 0.03, crease: 26,
    },
  },
  // bedded sandstone: strata ledges, undercut base
  {
    key: 'bedded', seed: 202, size: [1.8, 5.4], bury: 0.24, w: 1.0,
    opts: {
      detail: 2, warp: 0.2, stretch: [1.08, 0.94, 1.02], planes: 6,
      upright: 0.72, bite: 0.8, bedding: 0.1, beds: 6, chips: 3,
      round: 0.05, crease: 28,
    },
  },
  // river-worn: the only genuinely rounded stone in the set
  {
    key: 'worn', seed: 303, size: [1.2, 3.4], bury: 0.32, w: 0.9,
    opts: {
      detail: 2, warp: 0.33, stretch: [1.24, 0.82, 1.0], planes: 3,
      upright: 0.25, bite: 0.86, chips: 2, round: 0.66, crease: 62,
    },
  },
  // tabular slab lying in the soil
  {
    key: 'slab', seed: 404, size: [1.8, 5.4], bury: 0.4, w: 0.6,
    opts: {
      detail: 2, warp: 0.17, stretch: [1.35, 0.68, 1.18], planes: 5,
      upright: 0.55, bite: 0.86, bedding: 0.08, beds: 4, chips: 3,
      round: 0.06, crease: 25, flat: 0.2,
    },
  },
  // upright fin / broken column
  {
    key: 'spire', seed: 505, size: [1.5, 4.0], bury: 0.22, w: 0.55,
    opts: {
      detail: 2, warp: 0.2, stretch: [0.72, 1.8, 0.8], planes: 7,
      upright: 0.7, bite: 0.85, bedding: 0.05, beds: 5, chips: 3,
      round: 0.03, crease: 24,
    },
  },
  // freshly fractured angular talus — all corners, no curves
  {
    key: 'talus', seed: 606, size: [0.5, 1.9], bury: 0.22, w: 1.6,
    opts: {
      detail: 2, warp: 0.14, stretch: [1.1, 0.8, 0.95], planes: 11,
      upright: 0.4, bite: 0.74, chips: 4, round: 0.0, crease: 22,
    },
  },
  {
    key: 'cobble', seed: 707, size: [0.3, 1.05], bury: 0.32, w: 2.2,
    opts: {
      detail: 1, warp: 0.28, stretch: [1.14, 0.78, 1.0], planes: 5,
      upright: 0.3, bite: 0.82, chips: 3, round: 0.32, crease: 34,
    },
  },
  {
    key: 'pebble', seed: 808, size: [0.07, 0.3], bury: 0.42, w: 4.0,
    opts: {
      detail: 1, warp: 0.3, stretch: [1.2, 0.7, 1.0], planes: 4,
      upright: 0.3, bite: 0.84, chips: 2, round: 0.4, crease: 40,
    },
  },
];

const K = {};
for (let i = 0; i < KINDS.length; i++) K[KINDS[i].key] = KINDS[i];

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
    const mat = rockMaterial(0x6a5849, 0.93);
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
      // one anchor rock and a scatter of talus around it
      const rBig = rng.next();
      const anchorKind = rBig < 0.15 ? K.granite : rBig < 0.28 ? K.bedded
        : rBig < 0.37 ? K.slab : rBig < 0.43 ? K.spire
          : rBig < 0.58 ? K.worn : K.cobble;
      buckets.get(anchorKind.key).push(this._item(anchorKind, c.x, c.z, rng, c.w));
      const debris = 2 + Math.floor(rng.next() * 5);
      for (let i = 0; i < debris; i++) {
        const a = rng.next() * Math.PI * 2;
        const d = Math.abs(rng.gauss(0, 1)) * (2.2 + rBig * 5);
        const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d;
        if (eco.roadDist(x, z) < 4.6) continue;
        // spalled fragments cluster right at the foot of a big block
        const r = rng.next();
        const kind = r < 0.4 ? K.pebble : r < 0.66 ? K.cobble : K.talus;
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
        const r = rng.next();
        const kind = r < 0.42 ? K.granite : r < 0.62 ? K.slab
          : r < 0.82 ? K.bedded : K.spire;
        const it = this._item(kind, px, pz, rng, 1);
        it.s = Math.max(it.s, kind.size[1] * rng.range(0.6, 1.05));
        it.bury = kind.bury * rng.range(0.35, 0.8);
        // bedrock is not tipped over: keep strata roughly level
        it.pitch *= 0.35; it.roll *= 0.35;
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
    const t = Math.pow(rng.next(), 1.65);
    const size = kind.size[0] + (kind.size[1] - kind.size[0]) * t * (0.6 + w * 0.7);
    const nrm = this.eco.normal(x, z);
    // A block that has just split off sits at a jaunty angle; a boulder that
    // has been there a million years has settled flat. Big stone settles.
    const settle = THREE.MathUtils.clamp(1 - size / 5, 0.18, 1);
    return {
      x, z, y: this.eco.height(x, z),
      // Sink along the surface normal, not straight down: on a slope a purely
      // vertical offset leaves the rock hanging off the face. Ecology.normal
      // hands back a shared vector, so copy the components out.
      nx: nrm.x, ny: nrm.y, nz: nrm.z,
      s: size,
      sx: 1 + rng.gauss(0, 0.16), sy: 1 + rng.gauss(0, 0.13), sz: 1 + rng.gauss(0, 0.16),
      yaw: rng.next() * Math.PI * 2,
      pitch: rng.gauss(0, 0.3) * settle, roll: rng.gauss(0, 0.3) * settle,
      bury: kind.bury * rng.range(0.7, 1.5),
      tint: 0.7 + rng.next() * 0.34,
      // Leide is rust-ochre badlands, so bias the spread warm rather than
      // letting half the field go cold grey.
      warm: 0.035 + rng.gauss(0, 0.07),
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
        _s.set(it.s * it.sx, it.s * it.sy, it.s * it.sz);
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
