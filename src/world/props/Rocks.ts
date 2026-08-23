import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Noise } from '../../util/Noise.ts';
import { Rng } from '../../util/Rng.ts';
import { hash3 } from '../veg/Ecology.ts';
import { rockMaterial } from './PropMaterials.ts';
import { TileStream } from './TileStream.ts';
import { seatY } from './Seat.ts';
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
function splitNormals(geo: THREE.BufferGeometry, angleDeg: number, uvScale = 0.62): THREE.BufferGeometry {
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
  const K = uvScale;
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
export function rockGeometry(seed: number, {
  detail = 2, warp = 0.26, stretch = [1, 1, 1], planes = 7, upright = 0.35,
  bite = 0.78, bedding = 0, beds = 5, chips = 3, round = 0.06, crease = 30,
  flat = 0, weather = 0.16, upBias = 0.55, joints = true, size = 1, gully = 0,
  gullyFreq = 2.4, uvScale = 0.62,
}: { detail?: number, warp?: number, stretch?: number[], planes?: number, upright?: number, bite?: number, bedding?: number, beds?: number, chips?: number, round?: number, crease?: number, flat?: number, weather?: number, upBias?: number, joints?: boolean, size?: number, gully?: number, gullyFreq?: number, uvScale?: number } = {}) {
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

  // Cut directions come from a **geologic frame**, not from a sphere.
  //
  // Rock does not fracture isotropically. A block is bounded by one bedding
  // plane -- near-horizontal, tilted a few degrees -- and by two *conjugate*
  // shear sets, which share a strike and lean about 55 degrees off the bedding
  // normal in opposite directions. Three modal directions with a little scatter
  // is what makes a block read as geology rather than as a randomly whittled
  // ball; the `upright` scalar this replaces is a one-parameter approximation
  // of the same idea and cannot produce the conjugate pair at all.
  //
  // The order matters as much as the directions: the shear cuts go **last and
  // deepest**, so they own the silhouette, and everything before them is
  // reduced to detail on the faces they leave.
  const strike = rng.next() * Math.PI * 2;
  const dip = rng.gauss(0, 0.16);                       // bedding tilt, radians
  const bedN: [number, number, number] = [Math.sin(dip) * Math.cos(strike), Math.cos(dip), Math.sin(dip) * Math.sin(strike)];
  const sx0 = Math.cos(strike + Math.PI / 2), sz0 = Math.sin(strike + Math.PI / 2);
  const shearAt = (sign: number, jitter: number): [number, number, number] => {
    // Rotate the bedding normal `sign * 55 deg` about the strike line.
    const a = sign * (0.96 + jitter);                   // 55 deg = 0.96 rad
    const ca = Math.cos(a), sa = Math.sin(a);
    // Rodrigues rotation about the horizontal strike axis (sx0, 0, sz0).
    const kx = sx0, ky = 0, kz = sz0;
    const dot = kx * bedN[0] + ky * bedN[1] + kz * bedN[2];
    const cx = ky * bedN[2] - kz * bedN[1];
    const cy = kz * bedN[0] - kx * bedN[2];
    const cz = kx * bedN[1] - ky * bedN[0];
    const vx = bedN[0] * ca + cx * sa + kx * dot * (1 - ca);
    const vy = bedN[1] * ca + cy * sa + ky * dot * (1 - ca);
    const vz = bedN[2] * ca + cz * sa + kz * dot * (1 - ca);
    const l = Math.hypot(vx, vy, vz) || 1;
    return [vx / l, vy / l, vz / l];
  };
  const jitterDir = (d: [number, number, number], sd: number): [number, number, number] => {
    const x = d[0] + rng.gauss(0, sd), y = d[1] + rng.gauss(0, sd), z = d[2] + rng.gauss(0, sd);
    const l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l];
  };
  if (joints) {
    // Bedding first and shallowest, and only from above: it truncates the crown
    // the way a block that has shed its cap does. Cutting the base as well
    // sounds symmetric and is wrong -- the scale normalisation that follows
    // divides by the largest radius, so taking both ends off turns every block
    // into a disc. (Measured: it removed two of the three boulders visible in
    // `poi_fishing` outright.) The base is buried anyway.
    {
      const d = jitterDir(bedN, 0.09);
      cut(d[0], d[1], d[2], bite + 0.17 + rng.gauss(0, 0.05));
    }
    // Then the two conjugate shear sets, alternating, each cut deeper than the
    // last so the final pair carries the outline.
    const nShear = Math.max(2, planes - 2);
    for (let k = 0; k < nShear; k++) {
      const set = k % 2 === 0 ? 1 : -1;
      const yaw = Math.floor(k / 2) * Math.PI;          // both ends of each set
      const base = shearAt(set, rng.gauss(0, 0.12));
      const d = jitterDir([
        base[0] * Math.cos(yaw) - base[2] * Math.sin(yaw), base[1],
        base[0] * Math.sin(yaw) + base[2] * Math.cos(yaw),
      ], 0.07);
      const depth = bite + 0.16 - (0.14 * k) / Math.max(1, nShear - 1);
      cut(d[0], d[1], d[2], depth + rng.gauss(0, 0.04));
    }
  } else {
    for (let k = 0; k < planes; k++) {
      const th = rng.next() * Math.PI * 2;
      const yb = rng.gauss(0, 1) * (1 - upright) * 0.9;
      const l = Math.hypot(Math.cos(th), yb, Math.sin(th)) || 1;
      cut(Math.cos(th) / l, yb / l, Math.sin(th) / l, bite + rng.gauss(0, 0.07));
    }
  }
  // chipped corners: shallow shaves that only take the tip off
  for (let k = 0; k < chips; k++) {
    const th = rng.next() * Math.PI * 2;
    const ph = Math.acos(rng.range(-1, 1));
    cut(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th),
      rng.range(0.90, 0.985));
  }

  // --- bedding: horizontal strata ledges ---------------------------------
  // Strata have to step the SILHOUETTE, not bend the surface.
  //
  // The sawtooth this replaces scaled the radius smoothly across each bed, so
  // the outline stayed a continuous curve and the strata only ever read as
  // shading. What sells sedimentary rock is that the outline *steps*: a hard
  // bed is a course that stands proud and a soft one is recessed, and the
  // boundary between them is a near-vertical riser you can see against the sky.
  // So the radial scale is constant WITHIN a bed and jumps between beds, which
  // makes the triangles spanning a bedding plane into the riser. Each bed draws
  // its own resistance from the seed, so the courses differ rather than
  // alternating, and the weathering taper inside a bed only rounds its head.
  if (bedding > 0) {
    let yMin = Infinity, yMax = -Infinity;
    for (let i = 0; i < count; i++) {
      yMin = Math.min(yMin, P[i * 3 + 1]); yMax = Math.max(yMax, P[i * 3 + 1]);
    }
    const h = Math.max(1e-4, yMax - yMin);
    const nb = Math.max(2, Math.round(beds));
    const resist = new Float32Array(nb + 2);
    for (let b = 0; b <= nb + 1; b++) {
      const q = Math.sin(seed * 12.9898 + b * 78.233) * 43758.5453;
      resist[b] = q - Math.floor(q);
    }
    for (let i = 0; i < count; i++) {
      const t = ((P[i * 3 + 1] - yMin) / h) * nb;
      const bed = Math.min(nb - 1, Math.max(0, Math.floor(t)));
      const f = t - Math.floor(t);
      // Per-bed resistance: the step. Plus a small taper over the top fifth of
      // each bed so the course has a weathered head rather than a knife edge.
      const step = 1 + bedding * (resist[bed] - 0.5) * 2;
      const head = f > 0.8 ? -bedding * 0.35 * ((f - 0.8) / 0.2) : 0;
      const k = step + head;
      P[i * 3] *= k; P[i * 3 + 2] *= k;
    }
  }

  // --- gullies: ridged incision, for masses big enough to have drainage ---
  //
  // A rock the size of a mountain does not have a mountain's surface, and this
  // is why an enlarged boulder never reads as one: the only relief on it is at
  // the scale of the blank's own fbm, so at a kilometre it is a smooth dome
  // with facets. What a 500 m mass has, and a 3 m one does not, is *channels* --
  // water has run down it for a long time. Ridged noise (1 - |fbm|) cuts
  // creases rather than adding lumps, which is the difference between a gully
  // and a bump, and the cut is proportional to how far down the mass a point
  // is, because drainage concentrates toward the base.
  if (gully > 0) {
    let yMin = Infinity, yMax = -Infinity;
    for (let i = 0; i < count; i++) {
      yMin = Math.min(yMin, P[i * 3 + 1]); yMax = Math.max(yMax, P[i * 3 + 1]);
    }
    const hh = Math.max(1e-4, yMax - yMin);
    for (let i = 0; i < count; i++) {
      const x = P[i * 3] / size, y = P[i * 3 + 1] / size, z = P[i * 3 + 2] / size;
      const f = n.fbm3(x * gullyFreq + 31, y * gullyFreq * 0.55, z * gullyFreq - 17, 4);
      // Narrow: the crease is only where the field crosses zero. At a gentle
      // slope this is a broad uniform shrink and does nothing visible -- which
      // is what 2.2 measured as.
      const ridge = 1 - Math.abs(f) * 7.0;
      const down = 1 - (P[i * 3 + 1] - yMin) / hh;         // deepest toward the foot
      const k = 1 - gully * Math.max(0, ridge) * (0.35 + 0.65 * down);
      P[i * 3] *= k; P[i * 3 + 2] *= k;
    }
  }

  // --- chamfer the arrises, and weather the exposed ones -----------------
  //
  // The cut pipeline goes straight from arris to render, and a mathematically
  // perfect edge is the same tell on a rock that it is on a building: it makes
  // a one-pixel lit-to-shaded transition at every distance. A real worn arris
  // is a narrow chamfer band, and it catches a bright sliver of sun along its
  // whole length -- which is most of the difference between a low-poly asset
  // and a rock.
  //
  // On this topology the chamfer IS a convexity-weighted Laplacian: pull each
  // vertex toward the average of its neighbours in proportion to how far it
  // stands proud of them along its own normal. A vertex in the middle of a
  // cleave face is coplanar with its ring and does not move at all, so the
  // fracture planes stay planar; a vertex on an arris or a corner is strongly
  // convex and gets rounded by a fraction of the local edge length. Weighted by
  // upness as well, because it is the exposed tops that blunt while the
  // sheltered cleave faces keep their edges. `weather` above about 0.45 eats
  // the facets entirely -- the whole point is that it is a band, not a smooth.
  if (weather > 0) {
    const idx0 = geo.index!.array;
    const nbrSum = new Float32Array(count * 3);
    const nbrCnt = new Float32Array(count);
    const nrm = new Float32Array(count * 3);
    const add = (a: number, b: number) => {
      nbrSum[a * 3] += P[b * 3]; nbrSum[a * 3 + 1] += P[b * 3 + 1]; nbrSum[a * 3 + 2] += P[b * 3 + 2];
      nbrCnt[a] += 1;
    };
    for (let t = 0; t < idx0.length; t += 3) {
      const i0 = idx0[t], i1 = idx0[t + 1], i2 = idx0[t + 2];
      add(i0, i1); add(i0, i2); add(i1, i0); add(i1, i2); add(i2, i0); add(i2, i1);
      const ax = P[i1 * 3] - P[i0 * 3], ay = P[i1 * 3 + 1] - P[i0 * 3 + 1], az = P[i1 * 3 + 2] - P[i0 * 3 + 2];
      const bx = P[i2 * 3] - P[i0 * 3], by = P[i2 * 3 + 1] - P[i0 * 3 + 1], bz = P[i2 * 3 + 2] - P[i0 * 3 + 2];
      const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
      for (const i of [i0, i1, i2]) { nrm[i * 3] += cx; nrm[i * 3 + 1] += cy; nrm[i * 3 + 2] += cz; }
    }
    const D = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const c = nbrCnt[i] || 1;
      const mx = nbrSum[i * 3] / c - P[i * 3];
      const my = nbrSum[i * 3 + 1] / c - P[i * 3 + 1];
      const mz = nbrSum[i * 3 + 2] / c - P[i * 3 + 2];
      const nl = Math.hypot(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]) || 1;
      const nx = nrm[i * 3] / nl, ny = nrm[i * 3 + 1] / nl, nz = nrm[i * 3 + 2] / nl;
      // Convexity: how far the vertex stands proud of its own neighbour ring,
      // normalised by the ring radius so it is scale-free.
      const ring = Math.hypot(mx, my, mz) || 1e-6;
      const conv = Math.max(0, -(mx * nx + my * ny + mz * nz) / ring);
      const up = 1 - upBias + upBias * Math.max(0, ny);
      const k = weather * conv * up;
      D[i * 3] = mx * k; D[i * 3 + 1] = my * k; D[i * 3 + 2] = mz * k;
    }
    for (let i = 0; i < count * 3; i++) P[i] += D[i];
  }

  // --- optional blend back toward the smooth blank -----------------------
  for (let i = 0; i < count * 3; i++) P[i] += (base[i] - P[i]) * round;

  // --- normalise scale so `size` means the same thing for every kind -----
  let rad = 0;
  for (let i = 0; i < count; i++) {
    rad = Math.max(rad, Math.hypot(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]));
  }
  // `size` is applied HERE rather than by the caller, because the triplanar UVs
  // `splitNormals` bakes are read straight off the positions. Scaling a
  // unit-radius mesh afterwards scales its UVs with it, so a 330 m meteor shard
  // would carry exactly one tile of a texture authored for a one-metre part --
  // the same stretch `poiMaterials` documents for walls. Baking at world size
  // gives it two hundred.
  const inv = size / (rad || 1);
  for (let i = 0; i < count * 3; i++) P[i] *= inv;
  pos.array.set(P);
  pos.needsUpdate = true;

  // --- vertex colour: dust on the ledges, grime in the crevices ----------
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    const len = Math.hypot(x, y, z) || 1;
    const up = THREE.MathUtils.clamp(y / len, -1, 1);
    // cavity: points that sit well inside the hull are in a re-entrant corner.
    // Measured against `size`, so the bake means the same thing at 1 m and 330.
    const cav = THREE.MathUtils.clamp((len / size - 0.62) / 0.38, 0, 1);
    const grain = n.fbm3((x / size) * 3.1 + 5, (y / size) * 3.1, (z / size) * 3.1 - 7, 3) * 0.5 + 0.5;
    const k = (0.44 + 0.26 * Math.max(0, up) + grain * 0.2) * (0.58 + 0.42 * cav);
    col[i * 3] = k * 1.06; col[i * 3 + 1] = k; col[i * 3 + 2] = k * 0.9;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

  const out = splitNormals(geo, crease, uvScale);
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
      upright: 0.72, bite: 0.8, bedding: 0.045, beds: 6, chips: 3,
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
      upright: 0.55, bite: 0.86, bedding: 0.04, beds: 4, chips: 3,
      round: 0.06, crease: 25, flat: 0.2,
    },
  },
  // upright fin / broken column
  {
    key: 'spire', seed: 505, size: [1.5, 4.0], bury: 0.22, w: 0.55,
    opts: {
      detail: 2, warp: 0.2, stretch: [0.72, 1.8, 0.8], planes: 7,
      upright: 0.7, bite: 0.85, bedding: 0.03, beds: 5, chips: 3,
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

/**
 * How far each kind is still drawn — the number {@link seatY} needs.
 *
 * This is the *outermost* range in `build`'s table (outcrops for the big kinds,
 * the near range for the small ones), because seating has to be right at the
 * last range the stone is visible at, not the first. Placement happens once at
 * scatter time, so it cannot be the live camera's spacing: a rock 6 km from
 * spawn is under the coarsest ring in the stack at build time and that has
 * nothing to do with how it will be seen.
 */
const CULL: Record<StoneKind, number> = {
  granite: 1150, bedded: 1150, worn: 1150, slab: 1150, spire: 1150,
  talus: 130, cobble: 105, pebble: 62,
};

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
      // Seated on the surface the clipmap will DRAW at the range this kind is
      // still drawn at, not on the analytic field. `Seat.seatY` carries the
      // numbers; the short version is that a rock seated on `heightAt` and
      // visible at 150 m is over a quarter of a metre out across 57% of the
      // world, and a boulder that floats is louder than one slightly buried.
      k: kind.key, x, z, y: seatY(this.eco, x, z, kind.size[1], CULL[kind.key]),
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
        g.far.castShadow = true;
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
