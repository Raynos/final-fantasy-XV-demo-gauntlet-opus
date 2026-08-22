import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Noise } from '../../util/Noise.ts';
import { Rng } from '../../util/Rng.ts';
import { hash3 } from '../veg/Ecology.ts';
import { rockMaterial } from './PropMaterials.ts';
import { TileStream } from './TileStream.ts';
import { dressAt, pickWeighted, type Dress, type StoneKind } from './ZoneDress.ts';
import type { Ecology } from '../veg/Ecology.ts';

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
 * @param geo indexed geometry
 * @param angleDeg crease threshold in degrees
 * @returns non-indexed geometry with split normals
 */
function splitNormals(geo: THREE.BufferGeometry, angleDeg: number): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  const idx = geo.index!.array;
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
 * @param {object} o
 * */
function rockGeometry(seed: number, {
  detail = 2, warp = 0.26, stretch = [1, 1, 1], planes = 7, upright = 0.35,
  bite = 0.78, bedding = 0, beds = 5, chips = 3, round = 0.06, crease = 30,
  flat = 0,
}: { detail?: number, warp?: number, stretch?: number[], planes?: number, upright?: number, bite?: number, bedding?: number, beds?: number, chips?: number, round?: number, crease?: number, flat?: number } = {}) {
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
  const cut = (nx: number, ny: number, nz: number, frac: number) => {
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

/** The shape parameters {@link rockGeometry} takes; see its own defaults. */
type RockShape = Parameters<typeof rockGeometry>[1];

/** One kind of stone: how it is shaped, how big, and how deep it sits. */
interface RockKindDef {
  key: StoneKind;
  seed: number;
  /** Min and max long axis, metres. */
  size: [number, number];
  /** Fraction of the stone that sits below ground. */
  bury: number;
  /** Scatter weight relative to the other kinds. */
  w: number;
  opts: RockShape;
}

const KINDS: RockKindDef[] = [
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

/** {@link KINDS} indexed by key, for the weighted picks below. */
const K = new Map<string, RockKindDef>();
for (const k of KINDS) K.set(k.key, k);
/** The two fallbacks the pickers use when a weight table names a kind we do
 * not build. Named rather than reached for through the map so they are not
 * `RockKindDef | undefined`. */
const K_COBBLE = KINDS.find((k) => k.key === 'cobble')!;
const K_PEBBLE = KINDS.find((k) => k.key === 'pebble')!;

/** Kinds big enough to be worth a distant LOD and a long draw range. */
const BIG = new Set(['granite', 'bedded', 'worn', 'slab', 'spire']);

/** A kind that {@link KINDS} definitely declares. */
function kindOf(key: StoneKind): RockKindDef {
  const k = K.get(key);
  if (!k) throw new Error(`Rocks: no kind '${key}'`);
  return k;
}

/** An instanced mesh that definitely carries a per-instance colour buffer. */
type TintedMesh = THREE.InstancedMesh & { instanceColor: THREE.InstancedBufferAttribute };

/** One kind's two instanced tiers, and how many slots each has written. */
interface RockGroup {
  kind: RockKindDef;
  key: StoneKind;
  /** Ranges, metres: near tier, far tier, and far tier for outcrop stones. */
  nearRange: number;
  farRange: number;
  outRange: number;
  near: TintedMesh;
  far: TintedMesh | null;
  nearMax: number;
  farMax: number;
  /** Slots written this frame, near and far. */
  nw: number;
  fw: number;
}

/** One scattered stone, as a streamed cell holds it. */
interface RockInstance {
  k: StoneKind;
  x: number;
  z: number;
  y: number;
  /** Terrain normal at the stone, which is the direction it sinks along. */
  nx: number;
  ny: number;
  nz: number;
  /** Long axis, metres, and the per-axis jitter on top of it. */
  s: number;
  sx: number;
  sy: number;
  sz: number;
  yaw: number;
  pitch: number;
  roll: number;
  bury: number;
  /** Instance tint. */
  cr: number;
  cg: number;
  cb: number;
  /** Placed by the outcrop pass, so it draws out to `outRange`. */
  far: boolean;
}

export class Rocks {
  _last!: THREE.Vector3;
  byKey!: Map<StoneKind, RockGroup>;
  cell!: number;
  eco!: Ecology;
  groups!: RockGroup[];
  outcrops!: TileStream<RockInstance>;
  quality!: number;
  radius!: number;
  scene!: THREE.Scene;
  stream!: TileStream<RockInstance>;
  constructor(eco: import('../veg/Ecology.ts').Ecology, scene: THREE.Scene, { quality = 1, radius = 560 }: {quality?:number, radius?:number} = {}) {
    this.eco = eco;
    this.scene = scene;
    this.quality = quality;
    this.radius = radius * (quality < 0.7 ? 0.75 : 1);
    this.cell = 56;
    this.groups = [];
    this._last = new THREE.Vector3(1e9, 0, 1e9);
  }

  // --------------------------------------------------------------- density

  /**
   * How much stone this square metre of Lucis wants, 0..1.
   *
   * The shape is the same everywhere — scree gathers on slopes, nothing rests
   * on a cliff face, the carriageway is swept — but the *amount* is the zone's
   * business: Ravatogh is a scree field, Alstor Slough is mud.
   */
  _density(x: number, z: number) {
    const eco = this.eco;
    const slope = eco.slope01(x, z);
    // Scree gathers on slopes, but nothing rests on a cliff face. The cut-off
    // used to be so early that the ash cone of Ravatogh and the walls of
    // Taelpar Crag — the two most dramatic slopes in the game — came out
    // completely bare, which is the opposite of how a volcano looks.
    const rests = 1 - THREE.MathUtils.smoothstep(slope, 0.46, 0.70);
    if (rests <= 0.01) return 0;
    const p = eco.patch(x + 610, z - 340, 0.011, 3);
    const rd = THREE.MathUtils.smoothstep(eco.roadDist(x, z), 4.5, 9);
    const d = dressAt(x, z);
    return THREE.MathUtils.clamp(
      (0.5 + 0.5 * THREE.MathUtils.smoothstep(slope, 0.06, 0.45)) * rests
      * (0.32 + 0.68 * THREE.MathUtils.smoothstep(p, 0.26, 0.74))
      * rd * d.rockD * (1 - eco.siteBlock(x, z) * 0.85), 0, 1);
  }

  // ------------------------------------------------------------ generation

  /**
   * The boulder field of one 56 m cell: a jittered cluster centre, a handful
   * of anchor blocks around it, and spalled fragments at the foot of each.
   * Pure function of (cx, cz) — this is what lets the window move.
   */
  _genCell(cx: number, cz: number, out: RockInstance[]) {
    const c = this.cell, eco = this.eco;
    const rng = new Rng(hash3(cx, cz, 0x40c8));
    const seedX = (cx + rng.next()) * c, seedZ = (cz + rng.next()) * c;
    const bias = this._density(seedX, seedZ);
    if (bias <= 0.004 && rng.next() > 0.22) return;
    const dress = dressAt(seedX, seedZ);
    const n = Math.round(9 * (bias * 0.78 + 0.22) * rng.range(0.4, 1.6));
    for (let i = 0; i < n; i++) {
      const a = rng.next() * Math.PI * 2;
      const r = Math.abs(rng.gauss(0, 1)) * 14;
      const x = seedX + Math.cos(a) * r, z = seedZ + Math.sin(a) * r;
      const d = this._density(x, z);
      if (d <= 0.004 || rng.next() > d) continue;
      const anchor = K.get(pickWeighted(dress.kinds, rng.next())) ?? K_COBBLE;
      out.push(this._item(anchor, x, z, rng, d, dress));
      const frags = 2 + Math.floor(rng.next() * 5);
      for (let j = 0; j < frags; j++) {
        const fa = rng.next() * Math.PI * 2;
        const fd = Math.abs(rng.gauss(0, 1)) * (2.2 + anchor.size[1] * 0.9);
        const fx = x + Math.cos(fa) * fd, fz = z + Math.sin(fa) * fd;
        if (eco.roadDist(fx, fz) < 4.6) continue;
        const kind = K.get(pickWeighted(dress.frag, rng.next())) ?? K_PEBBLE;
        out.push(this._item(kind, fx, fz, rng, d * 0.7, dress));
      }
    }
  }

  /**
   * Bedrock knots: a line of large blocks pushing through the soil. These
   * carry a far longer draw range than loose boulders because at four hundred
   * metres an outcrop is a landform, not a pebble — it is what stops the
   * middle distance reading as an empty dust bowl.
   */
  _genOutcrop(cx: number, cz: number, out: RockInstance[]) {
    const c = 176, eco = this.eco;
    const rng = new Rng(hash3(cx, cz, 0x0c1f));
    for (let m = 0; m < 2; m++) {
      const ox = (cx + rng.next()) * c, oz = (cz + rng.next()) * c;
      const p = eco.patch(ox - 800, oz + 950, 0.007, 3);
      const dress = dressAt(ox, oz);
      const q = THREE.MathUtils.smoothstep(p, 0.42, 0.78)
        * THREE.MathUtils.smoothstep(eco.roadDist(ox, oz), 9, 26)
        * (1 - eco.siteBlock(ox, oz)) * dress.rockD
        * (1 - THREE.MathUtils.smoothstep(eco.slope01(ox, oz), 0.58, 0.8));
      if (rng.next() > q * 1.5) continue;
      // A crag, not a pile of pebbles: the tor is two to three times the size
      // of a loose boulder, which is what makes it legible at half a kilometre
      // and stops the middle distance reading as an empty dust bowl.
      const grand = rng.range(1.3, 2.15);
      const n = 5 + Math.floor(rng.next() * 7);
      const axis = rng.next() * Math.PI * 2;
      const spanX = 9 * grand, jit = 2.4 * grand;
      for (let i = 0; i < n; i++) {
        const t = (i / n - 0.5) * 2;
        const px = ox + Math.cos(axis) * t * spanX + rng.gauss(0, jit);
        const pz = oz + Math.sin(axis) * t * spanX + rng.gauss(0, jit);
        const r = rng.next();
        const kind = kindOf(r < 0.42 ? 'granite' : r < 0.62 ? 'slab'
          : r < 0.82 ? 'bedded' : 'spire');
        const it = this._item(kind, px, pz, rng, 1, dress);
        // hard ceiling: past about eleven metres a "boulder" is a landform,
        // and landforms belong to the heightfield, not to the prop layer
        const flatness = 1 - THREE.MathUtils.clamp((eco.slope01(px, pz) - 0.14) / 0.4, 0, 1) * 0.6;
        it.s = Math.min(11, Math.max(it.s, kind.size[1] * rng.range(0.7, 1.25) * dress.rockS * grand * flatness));
        it.bury = kind.bury * rng.range(0.35, 0.8);
        it.pitch *= 0.35; it.roll *= 0.35;
        it.far = true;
        out.push(it);
      }
    }
  }

  _item(kind: RockKindDef, x: number, z: number, rng: Rng, w: number, dress: Dress): RockInstance {
    const t = Math.pow(rng.next(), 1.65);
    const nrm = this.eco.normal(x, z);
    // A five metre block centred on a forty-degree face overhangs it by half
    // its own width and reads as floating. Steep ground gets talus, not
    // boulders — which is also what a real scree slope looks like.
    const steep = THREE.MathUtils.clamp((1 - nrm.y - 0.16) / 0.4, 0, 1);
    const size = (kind.size[0] + (kind.size[1] - kind.size[0]) * t * (0.6 + w * 0.7))
      * (BIG.has(kind.key) ? dress.rockS : 1) * (1 - steep * 0.62);
    const settle = THREE.MathUtils.clamp(1 - size / 5, 0.18, 1);
    // The instance tint multiplies a deliberately dark base material, so the
    // old 0.7..1.04 range rendered every boulder past a hundred metres as a
    // black speck on an ochre hillside. Stone reflects far more light than
    // that; the range is now centred well above 1.
    const tone = (1.02 + rng.next() * 0.46) * dress.bright;
    const v = 1 + rng.gauss(0, 0.05);
    return {
      k: kind.key, x, z, y: this.eco.height(x, z),
      nx: nrm.x, ny: nrm.y, nz: nrm.z,
      s: size,
      sx: 1 + rng.gauss(0, 0.16), sy: 1 + rng.gauss(0, 0.13), sz: 1 + rng.gauss(0, 0.16),
      yaw: rng.next() * Math.PI * 2,
      pitch: rng.gauss(0, 0.3) * settle, roll: rng.gauss(0, 0.3) * settle,
      bury: kind.bury * rng.range(0.7, 1.5),
      cr: tone * dress.tint[0] * v,
      cg: tone * dress.tint[1] * v,
      cb: tone * dress.tint[2] * v,
      far: false,
    };
  }

  // ----------------------------------------------------------------- build

  build() {
    const mat = rockMaterial(0x6a5849, 0.93);
    const q = this.quality;
    // Instance budgets. A boulder at four hundred metres is four pixels, so
    // the far tier runs a detail-1 blank (80 triangles against 320) and takes
    // the great majority of the count.
    const CAP: Record<StoneKind, [number, number]> = {
      granite: [130, 760], bedded: [140, 800], worn: [130, 520],
      slab: [110, 620], spire: [90, 480],
      talus: [420, 0], cobble: [520, 0], pebble: [700, 0],
    };
    for (const k of KINDS) {
      const [nearCap, farCap] = CAP[k.key];
      const nearMax = Math.max(8, Math.round(nearCap * q));
      const g: RockGroup = {
        kind: k, key: k.key,
        nearRange: BIG.has(k.key) ? 165 : (k.key === 'talus' ? 130 : k.key === 'cobble' ? 105 : 62),
        farRange: BIG.has(k.key) ? 430 : 0,
        outRange: BIG.has(k.key) ? 1150 : 0,
        near: this._mesh(rockGeometry(k.seed, k.opts), mat, nearMax, `rock_${k.key}`),
        far: null,
        nearMax, farMax: 0, nw: 0, fw: 0,
      };
      if (farCap) {
        g.farMax = Math.max(8, Math.round(farCap * q));
        g.far = this._mesh(rockGeometry(k.seed, { ...k.opts, detail: 1, chips: 1 }),
          mat, g.farMax, `rock_${k.key}_far`);
        g.far.castShadow = false;
      }
      this.groups.push(g);
    }
    this.byKey = new Map(this.groups.map((g) => [g.key, g]));

    this.stream = new TileStream({
      cell: this.cell, radius: this.radius,
      gen: (cx, cz, out) => this._genCell(cx, cz, out),
      budget: 12,
    });
    // Outcrops carry the middle distance, so their window is far wider than
    // the boulder field's and they draw out to a kilometre. At that range they
    // are the only thing between the foreground and the skyline.
    this.outcrops = new TileStream({
      cell: 176, radius: Math.max(1250, this.radius),
      gen: (cx, cz, out) => this._genOutcrop(cx, cz, out),
      budget: 7,
    });
    const o = new THREE.Vector3();
    this.stream.flush(o);
    this.outcrops.flush(o);
    this.update(o);
  }

  _mesh(geo: THREE.BufferGeometry, mat: THREE.Material, max: number, name: string): TintedMesh {
    const mesh = new THREE.InstancedMesh(geo, mat, max);
    mesh.castShadow = true; mesh.receiveShadow = true;
    const instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    mesh.instanceColor = instanceColor;
    mesh.count = 0; mesh.frustumCulled = false;
    mesh.name = name;
    this.scene.add(mesh);
    // `Object.assign` rather than an assertion: three declares `instanceColor`
    // nullable and we have just made it not so, right here.
    return Object.assign(mesh, { instanceColor });
  }

  // ---------------------------------------------------------------- update

  update(camPos: THREE.Vector3) {
    const moved = this._last.distanceToSquared(camPos) >= 121;
    const a = this.stream.update(camPos);
    const b = this.outcrops.update(camPos);
    if (!moved && !a && !b) return;
    this._last.copy(camPos);

    for (const g of this.groups) { g.nw = 0; g.fw = 0; }
    const cx = camPos.x, cz = camPos.z;

    const emit = (arr: RockInstance[]) => {
      for (let i = 0; i < arr.length; i++) {
        const it = arr[i];
        const g = this.byKey.get(it.k);
        if (!g) continue;
        const dx = it.x - cx, dz = it.z - cz;
        const d2 = dx * dx + dz * dz;
        let mesh: TintedMesh | null = null, slot = 0;
        if (d2 < g.nearRange * g.nearRange && g.nw < g.nearMax) {
          mesh = g.near; slot = g.nw++;
        } else if (g.far) {
          const lim = it.far ? g.outRange : g.farRange;
          if (d2 > lim * lim || g.fw >= g.farMax) continue;
          mesh = g.far; slot = g.fw++;
        } else continue;
        _e.set(it.pitch, it.yaw, it.roll);
        _q.setFromEuler(_e);
        const sink = it.s * it.bury;
        _p.set(it.x - it.nx * sink, it.y - it.ny * sink, it.z - it.nz * sink);
        _s.set(it.s * it.sx, it.s * it.sy, it.s * it.sz);
        _m.compose(_p, _q, _s);
        _m.toArray(mesh.instanceMatrix.array, slot * 16);
        const c = mesh.instanceColor.array;
        c[slot * 3] = it.cr; c[slot * 3 + 1] = it.cg; c[slot * 3 + 2] = it.cb;
      }
    };
    for (const arr of this.stream.live.values()) emit(arr);
    for (const arr of this.outcrops.live.values()) emit(arr);

    for (const g of this.groups) {
      g.near.count = g.nw;
      g.near.visible = g.nw > 0;
      g.near.instanceMatrix.needsUpdate = true;
      g.near.instanceColor.needsUpdate = true;
      if (g.far) {
        g.far.count = g.fw;
        g.far.visible = g.fw > 0;
        g.far.instanceMatrix.needsUpdate = true;
        g.far.instanceColor.needsUpdate = true;
      }
    }
  }
}
