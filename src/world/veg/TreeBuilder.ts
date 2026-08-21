import * as THREE from 'three';
import { Rng } from '../../util/Rng.ts';

/**
 * Recursive procedural tree -> real branch geometry + leaf cards.
 *
 * Each species is a parameter set; the recursion walks a curved branch, emits
 * tapered tube segments with a stable frame, and drops alpha-cut leaf cards on
 * the outer orders. Every vertex carries `aFlex` — normalised distance along
 * the branch hierarchy — so the wind shader keeps the trunk near-rigid while
 * the tips whip.
 */

export const TREE_SPECIES = {
  // Gnarled dead desert tree — the Leide silhouette.
  dead: {
    height: 6.6, trunkR: 0.35, depth: 4, kids: [2, 3], spread: [0.6, 1.35],
    lenFall: 0.76, radFall: 0.62, curl: 0.75, droop: 0.02, upBias: 0.12,
    trunkFrac: 0.4,
    leafDepth: 99, leafCount: 0, leafSize: 0, leafKind: 'dry',
    bark: 0x8a7e72, barkRough: 0.95,   // sun-silvered driftwood, not orange
  },
  // Broad flat-topped savanna tree.
  savanna: {
    height: 8.4, trunkR: 0.42, depth: 4, kids: [2, 3], spread: [0.5, 1.0],
    lenFall: 0.78, radFall: 0.64, curl: 0.34, droop: 0.0, upBias: 0.34,
    trunkFrac: 0.46, flatten: 0.6,
    leafDepth: 3, leafCount: 17, leafSize: 1.12, leafKind: 'broad',
    bark: 0x8d7b63, barkRough: 0.9,
  },
  // Tall conifer for the wet green region.
  conifer: {
    height: 14.0, trunkR: 0.46, depth: 3, kids: [2, 3], spread: [0.55, 0.9],
    lenFall: 0.3, radFall: 0.4, curl: 0.1, droop: 0.1, upBias: 0.1,
    trunkFrac: 0.93, whorl: true,
    leafDepth: 1, leafCount: 11, leafSize: 0.90, leafKind: 'conifer',
    bark: 0x6d5a47, barkRough: 0.95,
  },
  // Dense round broadleaf.
  broadleaf: {
    height: 9.4, trunkR: 0.40, depth: 4, kids: [2, 3], spread: [0.45, 0.95],
    lenFall: 0.76, radFall: 0.66, curl: 0.46, droop: 0.05, upBias: 0.38,
    trunkFrac: 0.42,
    leafDepth: 3, leafCount: 17, leafSize: 1.02, leafKind: 'broad',
    bark: 0x87715a, barkRough: 0.9,
  },
  // The Duscae canopy tree: a long clear bole and a wide flat crown that
  // starts above head height, so a stand of them closes overhead and you walk
  // *under* the forest rather than through a hedge. This is the silhouette the
  // green basin is built on and it did not exist.
  duscae: {
    height: 19.0, trunkR: 0.60, depth: 4, kids: [2, 3], spread: [0.55, 1.05],
    lenFall: 0.74, radFall: 0.66, curl: 0.32, droop: 0.03, upBias: 0.22,
    trunkFrac: 0.46, flatten: 0.30,
    leafDepth: 3, leafCount: 30, leafSize: 1.35, leafKind: 'broad',
    bark: 0x6b5a48, barkRough: 0.92,
  },
  // Malmalam: branches from the ankle up, high curl, leaves from depth 2 — a
  // tangle rather than a tree, and dark enough to swallow the road.
  // Depth is 3, not 4, on purpose: a fourth order at kids 3-4 is ~60 extra
  // branches and 2 700 leaf cards, which made one thicket tree 7 500 triangles
  // — three times a Duscae canopy tree, for a plant a third the height.
  thicket: {
    height: 7.8, trunkR: 0.30, depth: 3, kids: [3, 4], spread: [0.85, 1.55],
    lenFall: 0.74, radFall: 0.60, curl: 0.95, droop: 0.06, upBias: 0.30,
    trunkFrac: 0.26,
    leafDepth: 2, leafCount: 14, leafSize: 1.0, leafKind: 'broad',
    bark: 0x584a3b, barkRough: 0.95,
  },
  // Wetland willow: negative upBias and a strong droop, so the crown weeps
  // toward the water instead of reaching for the sun.
  swamp: {
    height: 9.2, trunkR: 0.40, depth: 4, kids: [2, 3], spread: [0.7, 1.35],
    lenFall: 0.78, radFall: 0.62, curl: 0.55, droop: -0.24, upBias: 0.10,
    trunkFrac: 0.30,
    leafDepth: 3, leafCount: 18, leafSize: 1.18, leafKind: 'broad',
    bark: 0x6d6152, barkRough: 0.93,
  },
};

const _u = new THREE.Vector3(), _v = new THREE.Vector3();
const _r = new THREE.Vector3(), _n = new THREE.Vector3(), _ref = new THREE.Vector3();

class MeshAccum {
  constructor() { this.p = []; this.n = []; this.uv = []; this.f = []; this.i = []; this.c = []; }
  get verts() { return this.p.length / 3; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aFlex', new THREE.Float32BufferAttribute(this.f, 1));
    if (this.c.length === this.p.length) {
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    }
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return g;
  }
}

/** Perpendicular basis for a direction, stable enough for tube rings. */
function frame(dir, u, v) {
  const ref = Math.abs(dir.y) > 0.92 ? _ref.set(1, 0, 0) : _ref.set(0, 1, 0);
  u.crossVectors(dir, ref).normalize();
  v.crossVectors(dir, u).normalize();
}

/**
 * @param {string} name key of TREE_SPECIES
 * @param {number} seed deterministic seed
 * @param {object} over per-variant parameter overrides
 * @returns {{wood:THREE.BufferGeometry, leaves:THREE.BufferGeometry|null,
 *            height:number, radius:number, leafKind:string}}
 */
export function buildTree(name, seed, over = {}) {
  const S = { ...TREE_SPECIES[name], ...over };
  const rng = new Rng((seed >>> 0) || 1);
  const wood = new MeshAccum();
  const leaf = new MeshAccum();
  let maxY = 0, maxR = 0;
  const canopyY = S.height * 0.6;

  const tube = (p0, p1, r0, r1, sides, f0, f1, vOff) => {
    _r.copy(p1).sub(p0);
    const len = _r.length();
    if (len < 1e-4) return len;
    _r.divideScalar(len);
    frame(_r, _u, _v);
    const base = wood.verts;
    for (let ring = 0; ring < 2; ring++) {
      const px0 = ring === 0 ? p0.x : p1.x;
      const py0 = ring === 0 ? p0.y : p1.y;
      const pz0 = ring === 0 ? p0.z : p1.z;
      const r = ring === 0 ? r0 : r1;
      const f = ring === 0 ? f0 : f1;
      for (let s = 0; s <= sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const ox = _u.x * ca * r + _v.x * sa * r;
        const oy = _u.y * ca * r + _v.y * sa * r;
        const oz = _u.z * ca * r + _v.z * sa * r;
        const px = px0 + ox, py = py0 + oy, pz = pz0 + oz;
        wood.p.push(px, py, pz);
        _n.set(ox, oy, oz).normalize();
        wood.n.push(_n.x, _n.y, _n.z);
        wood.uv.push((s / sides) * 1.7, (vOff + ring * len) * 0.5);
        wood.f.push(f);
        if (py > maxY) maxY = py;
        const rr = Math.hypot(px, pz); if (rr > maxR) maxR = rr;
      }
    }
    const row = sides + 1;
    for (let s = 0; s < sides; s++) {
      const a = base + s, b = a + 1, c = a + row, d = c + 1;
      wood.i.push(a, c, b, b, c, d);
    }
    return len;
  };

  const addLeafCard = (px, py, pz, dir, size, f) => {
    frame(dir, _u, _v);
    const ang = rng.next() * Math.PI * 2;
    const bx = _u.x * Math.cos(ang) + _v.x * Math.sin(ang);
    const by = _u.y * Math.cos(ang) + _v.y * Math.sin(ang);
    const bz = _u.z * Math.cos(ang) + _v.z * Math.sin(ang);
    // second axis: perpendicular, biased upward so cards aren't all vertical
    let cx = by * dir.z - bz * dir.y;
    let cy = bz * dir.x - bx * dir.z + rng.range(0.3, 1.0);
    let cz = bx * dir.y - by * dir.x;
    const cl = Math.hypot(cx, cy, cz) || 1; cx /= cl; cy /= cl; cz /= cl;
    const hw = size * 0.55;
    const base = leaf.verts;
    const corners = [[-1, 0], [1, 0], [1, 1], [-1, 1]];
    // cards buried inside the canopy are darker; outer ones catch the sun
    const depthShade = THREE.MathUtils.clamp(
      0.52 + 0.62 * (Math.hypot(px, (py - canopyY) * 0.7, pz) / Math.max(1.2, S.height * 0.42)), 0.5, 1.22
    );
    const varia = rng.range(0.88, 1.1);
    for (let k = 0; k < 4; k++) {
      const sx = corners[k][0], sy = corners[k][1];
      const vx = px + bx * sx * hw + cx * sy * size;
      const vy = py + by * sx * hw + cy * sy * size;
      const vz = pz + bz * sx * hw + cz * sy * size;
      leaf.p.push(vx, vy, vz);
      _n.set(vx, (vy - canopyY) * 0.8, vz).normalize();
      leaf.n.push(_n.x * 0.6, _n.y * 0.5 + 0.62, _n.z * 0.6);
      leaf.uv.push(sx * 0.5 + 0.5, sy);
      // A shade, so it may darken and must not brighten: three factors each
      // allowed a little over one multiplied out to 1.42, and a leaf card whose
      // vertex colour is 1.42 blows to white the moment the sun is on it. That
      // is the blown, near-white canopy highlight in tmp/shots/veg0/
      // zone_malacchi.jpg. Luminance-only either way — the instance tint owns
      // the hue, the same contract the grass clump card is built on.
      const sh = Math.min(1, depthShade * varia * (0.86 + sy * 0.2));
      leaf.c.push(sh, sh, sh);
      leaf.f.push(Math.min(1, f + 0.2));
      if (vy > maxY) maxY = vy;
      const rr = Math.hypot(vx, vz); if (rr > maxR) maxR = rr;
    }
    leaf.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  /** @param {THREE.Vector3} p @param {THREE.Vector3} dir */
  const grow = (p, dir, len, rad, depth, flexStart) => {
    const sides = depth === 0 ? 8 : depth === 1 ? 5 : depth === 2 ? 4 : 3;
    const sub = depth === 0 ? 4 : depth === 1 ? 2 : 1;
    const flexEnd = Math.min(1, flexStart + len / S.height);
    const cur = p.clone();
    const d = dir.clone().normalize();
    const pts = [cur.clone()];
    const dirs = [d.clone()];
    let vOff = 0;
    for (let s = 0; s < sub; s++) {
      const t0 = s / sub, t1 = (s + 1) / sub;
      d.x += rng.gauss(0, S.curl * 0.15);
      d.z += rng.gauss(0, S.curl * 0.15);
      d.y += (S.droop - 0.04) * S.curl + rng.gauss(0, S.curl * 0.07);
      d.normalize();
      const nxt = cur.clone().addScaledVector(d, len / sub);
      const r0 = rad * (1 - t0 * 0.7), r1 = rad * (1 - t1 * 0.7);
      const f0 = flexStart + (flexEnd - flexStart) * t0;
      const f1 = flexStart + (flexEnd - flexStart) * t1;
      vOff += tube(cur, nxt, r0, r1, sides, f0, f1, vOff);
      cur.copy(nxt);
      pts.push(cur.clone());
      dirs.push(d.clone());
    }

    if (depth >= S.leafDepth && S.leafCount > 0) {
      const n = Math.round(S.leafCount * (0.55 + rng.next() * 0.95));
      for (let i = 0; i < n; i++) {
        const t = 0.2 + rng.next() * 0.85;
        const fi = Math.min(pts.length - 1.0001, t * (pts.length - 1));
        const si = Math.floor(fi);
        const a = pts[si], b = pts[si + 1] || pts[si];
        const k = fi - si;
        const lx = a.x + (b.x - a.x) * k + rng.gauss(0, len * 0.42);
        const ly = a.y + (b.y - a.y) * k + rng.gauss(0, len * 0.3);
        const lz = a.z + (b.z - a.z) * k + rng.gauss(0, len * 0.42);
        addLeafCard(lx, ly, lz, dirs[si], S.leafSize * (0.7 + rng.next() * 0.7), flexEnd);
      }
    }

    if (depth >= S.depth) return;

    const tip = pts[pts.length - 1];
    const kids = Math.round(rng.range(S.kids[0], S.kids[1]));
    const baseAng = rng.next() * Math.PI * 2;
    frame(d, _u, _v);
    const ux = _u.x, uy = _u.y, uz = _u.z, vx = _v.x, vy = _v.y, vz = _v.z;
    for (let k = 0; k < kids; k++) {
      const ang = baseAng + (k / kids) * Math.PI * 2 + rng.gauss(0, 0.45);
      const spread = rng.range(S.spread[0], S.spread[1]);
      const ca = Math.cos(ang) * spread, sa = Math.sin(ang) * spread;
      const child = new THREE.Vector3(
        d.x + ux * ca + vx * sa,
        d.y + uy * ca + vy * sa,
        d.z + uz * ca + vz * sa
      );
      child.y += S.upBias * (1 - depth / (S.depth + 1));
      if (S.flatten && depth >= 1) child.y *= 1 - S.flatten;
      child.normalize();
      grow(tip, child,
        len * S.lenFall * rng.range(0.8, 1.2),
        rad * S.radFall * rng.range(0.85, 1.1),
        depth + 1, flexEnd);
    }

    // conifer: whorls of short laterals straight off the trunk
    if (S.whorl && depth === 0) {
      const tiers = 11;
      for (let ti = 0; ti < tiers; ti++) {
        const t = 0.14 + (ti / tiers) * 0.84;
        const fi = Math.min(pts.length - 1.0001, t * (pts.length - 1));
        const si = Math.floor(fi);
        const a = pts[si], b = pts[si + 1] || pts[si];
        const kk = fi - si;
        const lp = new THREE.Vector3(
          a.x + (b.x - a.x) * kk, a.y + (b.y - a.y) * kk, a.z + (b.z - a.z) * kk
        );
        const arms = 4 + (ti % 3);
        const off = ti * 1.1;
        for (let aI = 0; aI < arms; aI++) {
          const aa = off + (aI / arms) * Math.PI * 2 + rng.gauss(0, 0.2);
          const dv = new THREE.Vector3(Math.cos(aa), 0.42 - t * 0.85, Math.sin(aa)).normalize();
          const L = (1 - t) * S.height * 0.28 + 0.6;
          grow(lp, dv, L, rad * 0.3 * (1 - t * 0.6) + 0.02, S.depth, 0.2 + t * 0.6);
        }
      }
    }
  };

  const up = new THREE.Vector3(rng.gauss(0, 0.05), 1, rng.gauss(0, 0.05)).normalize();
  grow(new THREE.Vector3(0, 0, 0), up, S.height * S.trunkFrac, S.trunkR, 0, 0);

  // Flare the base into the ground so trunks never read as posts stuck in dirt.
  const flareBase = wood.verts;
  const SIDES = 9;
  for (let ring = 0; ring < 2; ring++) {
    const y = ring === 0 ? -0.45 : 0.34;
    const r = ring === 0 ? S.trunkR * 2.05 : S.trunkR * 1.04;
    for (let s = 0; s <= SIDES; s++) {
      const a = (s / SIDES) * Math.PI * 2;
      const wob = 1 + Math.sin(a * 3 + seed * 0.7) * 0.16 + Math.sin(a * 5 - seed) * 0.07;
      wood.p.push(Math.cos(a) * r * wob, y, Math.sin(a) * r * wob);
      wood.n.push(Math.cos(a), 0.22, Math.sin(a));
      wood.uv.push((s / SIDES) * 1.7, y * 0.5);
      wood.f.push(0);
    }
  }
  for (let s = 0; s < SIDES; s++) {
    const a = flareBase + s, b = a + 1, c = a + SIDES + 1, d = c + 1;
    wood.i.push(a, c, b, b, c, d);
  }

  return {
    wood: wood.geometry(),
    leaves: leaf.verts > 0 ? leaf.geometry() : null,
    height: maxY,
    radius: maxR,
    leafKind: S.leafKind,
  };
}
