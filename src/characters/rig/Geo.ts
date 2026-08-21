import * as THREE from 'three';

/**
 * Low-level procedural geometry toolkit for characters.
 *
 * Everything a character is made of — body, garments, hair, face — is built by
 * accumulating triangles into a `MeshBuilder`, which emits a BufferGeometry
 * carrying the attribute set every character mesh shares:
 *
 *   position, normal, uv, color, aMat(roughness,metalness,thickness),
 *   aTan(strand/flow direction), skinIndex, skinWeight
 *
 * Because the attribute layout is uniform, parts can be merged aggressively:
 * a whole outfit collapses into one draw call while still varying colour and
 * material response per vertex.
 */

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _t = new THREE.Vector3();
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();

export const clamp01 = (x: any) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const smooth = (x: any) => { const t = clamp01(x); return t * t * (3 - 2 * t); };
export const smoothIn = (a: any, b: any, x: any) => smooth((x - a) / (b - a));
export const lerp = (a: any, b: any, t: any) => a + (b - a) * t;

/** Cosine bump centred on `c` with half-width `w`, in units of the input. */
export function bump(x: any, c: any, w: any, amp = 1) {
  const d = Math.abs(x - c) / w;
  return d >= 1 ? 0 : amp * 0.5 * (1 + Math.cos(d * Math.PI));
}

/** Angular cosine bump — handles wrap-around at 2π. */
export function abump(theta: any, c: any, w: any, amp = 1) {
  let d = Math.abs(theta - c) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  d /= w;
  return d >= 1 ? 0 : amp * 0.5 * (1 + Math.cos(d * Math.PI));
}

/** Catmull-Rom through a scalar array, `u` in [0,1] over (n-1) spans. */
export function crScalar(vals: any, u: any) {
  const n = vals.length;
  if (n === 1) return vals[0];
  const p = clamp01(u) * (n - 1);
  const i = Math.min(n - 2, Math.floor(p));
  const t = p - i;
  const v0 = vals[Math.max(0, i - 1)], v1 = vals[i], v2 = vals[i + 1], v3 = vals[Math.min(n - 1, i + 2)];
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * v1) + (-v0 + v2) * t + (2 * v0 - 5 * v1 + 4 * v2 - v3) * t2 + (-v0 + 3 * v1 - 3 * v2 + v3) * t3);
}

/**
 * Accumulates triangles with a full character attribute set.
 * Vertices inherit the builder's current colour / material / skin binding, so
 * emitting geometry stays terse.
 */
export class MeshBuilder {
  _c!: number[];
  _g!: number;
  _m!: number[];
  _s!: number[];
  _t!: number[];
  col!: any[];
  grp!: any[];
  idx!: any[];
  mp!: any[];
  name!: any;
  pos!: any[];
  si!: any[];
  sw!: any[];
  tn!: any[];
  uv!: any[];
  constructor(name = 'part') {
    this.name = name;
    this.pos = [];
    this.uv = [];
    this.col = [];
    this.mp = [];
    this.tn = [];
    this.si = [];
    this.sw = [];
    this.grp = [];
    this.idx = [];
    this._g = 0;
    this._c = [1, 1, 1];
    this._m = [0.7, 0, 0];
    this._t = [0, 1, 0];
    this._s = [0, 0, 0, 0, 1, 0, 0, 0];
  }

  /** Smoothing group: normals are only averaged between vertices sharing one. */
  group(g: any) { this._g = g; return this; }

  /** Base colour for subsequent vertices (linear-ish sRGB THREE.Color or hex). */
  color(c: any) {
    const col = c instanceof THREE.Color ? c : new THREE.Color().setHex(c, THREE.SRGBColorSpace);
    this._c = [col.r, col.g, col.b];
    return this;
  }

  tint(mul: any) { this._c = [this._c[0] * mul, this._c[1] * mul, this._c[2] * mul]; return this; }

  /**
   * Per-vertex roughness / metalness / translucent thickness.
   * `thick` is 0 for opaque bulk and 1 for a paper-thin part light shines
   * through (ear rims, nostril wings, fingers, the web of the hand).
   */
  mat(rough: any, metal = 0, thick = this._m[2]) { this._m = [rough, metal, thick]; return this; }

  /** Translucent thickness alone, leaving roughness/metalness as they are. */
  thick(t: any) { this._m = [this._m[0], this._m[1], t]; return this; }

  /**
   * Flow direction for anisotropic shading — the strand tangent on hair, the
   * weave direction on cloth. Object space; the shader skins and view-transforms
   * it. Defaults to +Y, which is what an unset surface gets.
   */
  tang(x: any, y: any, z: any) {
    const l = Math.hypot(x, y, z) || 1;
    this._t = [x / l, y / l, z / l];
    return this;
  }

  /** Skin binding: array of [boneIndex, weight]; normalised, max 4. */
  skin(pairs: any) {
    const p = pairs.slice().sort((a: any, b: any) => b[1] - a[1]).slice(0, 4);
    let sum = 0;
    for (const q of p) sum += q[1];
    if (sum <= 0) { this._s = [0, 0, 0, 0, 1, 0, 0, 0]; return this; }
    const out = [0, 0, 0, 0, 0, 0, 0, 0];
    for (let i = 0; i < p.length; i++) { out[i] = p[i][0]; out[4 + i] = p[i][1] / sum; }
    this._s = out;
    return this;
  }

  /** Emit a vertex; returns its index. */
  v(x: any, y: any, z: any, u = 0, w = 0) {
    this.pos.push(x, y, z);
    this.uv.push(u, w);
    this.col.push(this._c[0], this._c[1], this._c[2]);
    this.mp.push(this._m[0], this._m[1], this._m[2]);
    this.tn.push(this._t[0], this._t[1], this._t[2]);
    this.si.push(this._s[0], this._s[1], this._s[2], this._s[3]);
    this.sw.push(this._s[4], this._s[5], this._s[6], this._s[7]);
    this.grp.push(this._g);
    return this.pos.length / 3 - 1;
  }

  vv(p: any, u = 0, w = 0) { return this.v(p.x, p.y, p.z, u, w); }

  tri(a: any, b: any, c: any) { this.idx.push(a, b, c); return this; }
  quad(a: any, b: any, c: any, d: any) { this.idx.push(a, b, c, a, c, d); return this; }

  get count() { return this.pos.length / 3; }

  /** Darken vertex colours near a world point — cheap baked contact occlusion. */
  occlude(px: any, py: any, pz: any, radius: any, amount: any) {
    const n = this.count;
    for (let i = 0; i < n; i++) {
      const dx = this.pos[i * 3] - px, dy = this.pos[i * 3 + 1] - py, dz = this.pos[i * 3 + 2] - pz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) / radius;
      if (d >= 1) continue;
      const k = 1 - amount * (1 - d) * (1 - d);
      this.col[i * 3] *= k; this.col[i * 3 + 1] *= k; this.col[i * 3 + 2] *= k;
    }
    return this;
  }

  /** Finalise into a BufferGeometry with smoothed, group-aware normals. */
  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setAttribute('aMat', new THREE.Float32BufferAttribute(this.mp, 3));
    geo.setAttribute('aTan', new THREE.Float32BufferAttribute(this.tn, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    geo.setIndex(this.idx);
    computeSmoothNormals(geo, this.grp);
    return geo;
  }
}

/**
 * Area-weighted vertex normals that also average across coincident vertices
 * sharing a smoothing group — this is what removes the seam you would
 * otherwise see where a swept tube wraps back on itself.
 */
export function computeSmoothNormals(geo: any, groups: any) {
  const pos = geo.attributes.position.array;
  const idx = geo.index.array;
  const n = pos.length / 3;
  const nrm = new Float32Array(n * 3);

  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    _a.set(pos[a], pos[a + 1], pos[a + 2]);
    _b.set(pos[b], pos[b + 1], pos[b + 2]);
    _c.set(pos[c], pos[c + 1], pos[c + 2]);
    _b.sub(_a); _c.sub(_a); _b.cross(_c);
    for (const o of [a, b, c]) { nrm[o] += _b.x; nrm[o + 1] += _b.y; nrm[o + 2] += _b.z; }
  }

  // weld coincident vertices within a smoothing group
  const map = new Map();
  const q = 1e4;
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(pos[i * 3] * q)},${Math.round(pos[i * 3 + 1] * q)},${Math.round(pos[i * 3 + 2] * q)},${groups ? groups[i] : 0}`;
    const e = map.get(key);
    if (e) e.push(i); else map.set(key, [i]);
  }
  for (const list of map.values()) {
    if (list.length < 2) continue;
    let x = 0, y = 0, z = 0;
    for (const i of list) { x += nrm[i * 3]; y += nrm[i * 3 + 1]; z += nrm[i * 3 + 2]; }
    for (const i of list) { nrm[i * 3] = x; nrm[i * 3 + 1] = y; nrm[i * 3 + 2] = z; }
  }
  for (let i = 0; i < n; i++) {
    const x = nrm[i * 3], y = nrm[i * 3 + 1], z = nrm[i * 3 + 2];
    const l = Math.hypot(x, y, z) || 1;
    nrm[i * 3] = x / l; nrm[i * 3 + 1] = y / l; nrm[i * 3 + 2] = z / l;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return geo;
}

/** Merge geometries that share the character attribute layout. */
export function mergeParts(geos: any) {
  const list = geos.filter((g: any) => g && g.attributes.position.count);
  if (!list.length) return null;
  if (list.length === 1) return list[0];

  let vc = 0, ic = 0;
  for (const g of list) { vc += g.attributes.position.count; ic += g.index.count; }

  const out = new THREE.BufferGeometry();
  const specs = [
    ['position', 3, Float32Array], ['normal', 3, Float32Array], ['uv', 2, Float32Array],
    ['color', 3, Float32Array], ['aMat', 3, Float32Array], ['aTan', 3, Float32Array],
    ['skinIndex', 4, Uint16Array], ['skinWeight', 4, Float32Array],
  ];
  for (const [name, size, Type] of specs) {
    const arr = new Type(vc * size);
    let off = 0;
    for (const g of list) {
      const src = g.attributes[name].array;
      arr.set(src, off);
      off += src.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  const iarr = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
  let io = 0, vo = 0;
  for (const g of list) {
    const s = g.index.array;
    for (let i = 0; i < s.length; i++) iarr[io + i] = s[i] + vo;
    io += s.length; vo += g.attributes.position.count;
  }
  out.setIndex(new THREE.BufferAttribute(iarr, 1));
  return out;
}

/**
 * Sweep a closed (or partial) tube along a Catmull-Rom centreline.
 *
 * Nodes carry position, elliptical radii and an explicit skin-weight map; both
 * radius and weights are interpolated along the sweep, which gives predictable,
 * artefact-free deformation at shoulders, elbows, hips and knees.
 *
 * @param {Object} o
 * */
export function sweepTube(B: MeshBuilder, o: { nodes: any[], steps: number, seg: number, shape?: (theta:number,t:number)=>number, offset?: (theta:number,t:number,out:THREE.Vector3)=>void, uvScale?: number[], theta0?: number, ref?: any, colorAt?: any, matAt?: any, capStart?: any, capHeight?: any }) {
  const nodes = o.nodes;
  const steps = o.steps || 16;
  const seg = o.seg || 16;
  const t0 = o.theta0 ?? 0;
  const t1 = o.theta1 ?? Math.PI * 2;
  const closed = (t1 - t0) >= Math.PI * 2 - 1e-6;
  const shape = o.shape;
  const offset = o.offset;
  const ref = o.ref ? new THREE.Vector3().fromArray(o.ref) : new THREE.Vector3(0, 0, 1);
  const uvS = o.uvScale || [1, 1];
  const uvO = o.uvOffset || [0, 0];

  const curve = new THREE.CatmullRomCurve3(
    nodes.map((n) => new THREE.Vector3().fromArray(n.p)), false, 'centripetal', 0.5
  );
  const rxs = nodes.map((n) => n.rx);
  const rzs = nodes.map((n) => (n.rz ?? n.rx));

  const rings = [];
  const cols = closed ? seg : seg + 1;
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const p = curve.getPoint(u);
    const tan = curve.getTangent(u).normalize();
    // stable frame from a reference direction (no Frenet roll)
    _f.copy(ref).addScaledVector(tan, -ref.dot(tan));
    if (_f.lengthSq() < 1e-6) _f.set(1, 0, 0).addScaledVector(tan, -tan.x);
    _f.normalize();
    _r.crossVectors(_f, tan).normalize();

    const rx = crScalar(rxs, u), rz = crScalar(rzs, u);
    const w = weightsAt(nodes, u);
    B.skin(w);

    const row = [];
    for (let j = 0; j < cols; j++) {
      const th = t0 + (t1 - t0) * (j / seg);
      if (o.colorAt) B.color(o.colorAt(th, u));
      // per-vertex finish: a seam, a worn hem and a lit shoulder are all the
      // same cloth at different roughness, and on a near-black palette that
      // difference is the only thing separating the panels
      if (o.matAt) { const q = o.matAt(th, u); B.mat(q[0], q[1] ?? 0, q[2] ?? 0); }
      let m = shape ? shape(th, u) : 1;
      let x = Math.sin(th) * rx * m;
      let z = Math.cos(th) * rz * m;
      let yo = 0;
      if (offset) {
        _t.set(0, 0, 0);
        offset(th, u, _t);
        x += _t.x; yo = _t.y; z += _t.z;
      }
      const vx = p.x + _r.x * x + _f.x * z + tan.x * yo;
      const vy = p.y + _r.y * x + _f.y * z + tan.y * yo;
      const vz = p.z + _r.z * x + _f.z * z + tan.z * yo;
      row.push(B.v(vx, vy, vz, uvO[0] + (j / seg) * uvS[0], uvO[1] + u * uvS[1]));
    }
    rings.push(row);
  }

  for (let i = 0; i < steps; i++) {
    const A = rings[i], C = rings[i + 1];
    for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % cols;
      if (!closed && j + 1 >= cols) break;
      B.quad(A[j], A[j2], C[j2], C[j]);
    }
  }

  // Dome the start of the sweep. A sleeve that simply stops leaves an open
  // cylinder whose silhouette reads as a pauldron; a capped sleeve head reads
  // as a shoulder.
  if (o.capStart && closed) {
    const p0 = curve.getPoint(0);
    const tan0 = curve.getTangent(0).normalize();
    _f.copy(ref).addScaledVector(tan0, -ref.dot(tan0));
    if (_f.lengthSq() < 1e-6) _f.set(1, 0, 0).addScaledVector(tan0, -tan0.x);
    _f.normalize();
    _r.crossVectors(_f, tan0).normalize();
    const rx0 = crScalar(rxs, 0), rz0 = crScalar(rzs, 0);
    const h = (o.capHeight ?? 0.9) * (rx0 + rz0) * 0.5;
    const domeRows = [rings[0]];
    const layers = 3;
    for (let k = 1; k <= layers; k++) {
      const a = (k / (layers + 1)) * Math.PI * 0.5;
      const scale = Math.cos(a);
      const lift = Math.sin(a) * h;
      const w = weightsAt(nodes, 0);
      B.skin(w);
      const row = [];
      for (let j = 0; j < cols; j++) {
        const th = t0 + (t1 - t0) * (j / seg);
        const m = shape ? shape(th, 0) : 1;
        const x = Math.sin(th) * rx0 * m * scale;
        const z = Math.cos(th) * rz0 * m * scale;
        row.push(B.v(
          p0.x + _r.x * x + _f.x * z - tan0.x * lift,
          p0.y + _r.y * x + _f.y * z - tan0.y * lift,
          p0.z + _r.z * x + _f.z * z - tan0.z * lift,
          uvO[0] + (j / seg) * uvS[0], uvO[1] - 0.02 * k
        ));
      }
      domeRows.push(row);
    }
    const tip = B.v(p0.x - tan0.x * h, p0.y - tan0.y * h, p0.z - tan0.z * h, 0.5, uvO[1] - 0.1);
    for (let k = 0; k < domeRows.length - 1; k++) {
      const A = domeRows[k], C = domeRows[k + 1];
      for (let j = 0; j < seg; j++) {
        const j2 = (j + 1) % cols;
        B.quad(A[j2], A[j], C[j], C[j2]);
      }
    }
    const last = domeRows[domeRows.length - 1];
    for (let j = 0; j < seg; j++) B.tri(last[(j + 1) % cols], last[j], tip);
  }
  return rings;
}

/**
 * Sweep an open shell with thickness (a garment panel): outer surface, inner
 * surface and a rim joining them, so an open jacket shows real cloth edges.
 */
export function sweepShell(B: any, o: any) {
  const thick = o.thickness ?? 0.014;
  const rxs = o.nodes.map((n: any) => n.rx);
  const outer = sweepTube(B, o);
  const mark = B.idx.length;
  const inner = sweepTube(B, {
    ...o,
    shape: (th, t) => (o.shape ? o.shape(th, t) : 1) - thick / Math.max(0.02, crScalar(rxs, t)),
  });
  const steps = o.steps || 16;
  const cols = outer[0].length;
  // reverse winding on the inner surface so it faces the body
  const idx = B.idx;
  for (let i = mark; i < idx.length; i += 3) {
    const tmp = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = tmp;
  }
  // rim along both open edges
  for (let i = 0; i < steps; i++) {
    B.quad(outer[i][0], inner[i][0], inner[i + 1][0], outer[i + 1][0]);
    B.quad(inner[i][cols - 1], outer[i][cols - 1], outer[i + 1][cols - 1], inner[i + 1][cols - 1]);
  }
  // caps at the sweep ends
  for (let j = 0; j < cols - 1; j++) {
    B.quad(inner[0][j], outer[0][j], outer[0][j + 1], inner[0][j + 1]);
    B.quad(outer[steps][j], inner[steps][j], inner[steps][j + 1], outer[steps][j + 1]);
  }
  return { outer, inner };
}

/** Interpolated skin weights between node weight maps. */
export function weightsAt(nodes: any, u: any) {
  const n = nodes.length;
  const p = clamp01(u) * (n - 1);
  let i = Math.min(n - 2, Math.floor(p));
  if (i < 0) i = 0;
  const t = smooth(p - i);
  const a = nodes[i].w || [], b = nodes[i + 1].w || a;
  const acc = new Map();
  for (const [bi, bw] of a) acc.set(bi, (acc.get(bi) || 0) + bw * (1 - t));
  for (const [bi, bw] of b) acc.set(bi, (acc.get(bi) || 0) + bw * t);
  return [...acc.entries()];
}

/**
 * A UV sphere pushed around by a list of sculpt brushes. This is how heads get
 * brows, noses, cheekbones and jaws without any modelling data.
 *
 * brush: { p:[x,y,z], r:[rx,ry,rz], amt, dir:[x,y,z]|'normal', mirror?:bool, pow?:number }
 */
export function sculptSphere(B: any, o: any) {
  const segU = o.segU || 48, segV = o.segV || 36;
  const scale = new THREE.Vector3().fromArray(o.scale || [1, 1, 1]);
  const center = new THREE.Vector3().fromArray(o.center || [0, 0, 0]);
  const brushes = expandMirrors(o.brushes || []);

  const pts = [];
  for (let v = 0; v <= segV; v++) {
    const phi = (v / segV) * Math.PI;
    const row = [];
    for (let u = 0; u <= segU; u++) {
      const th = (u / segU) * Math.PI * 2;
      const nx = Math.sin(phi) * Math.sin(th);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.cos(th);
      const p = new THREE.Vector3(nx * scale.x, ny * scale.y, nz * scale.z).add(center);
      const nrm = new THREE.Vector3(nx / scale.x, ny / scale.y, nz / scale.z).normalize();
      applyBrushes(p, nrm, brushes);
      row.push(p);
    }
    pts.push(row);
  }
  return pts;
}

/** Duplicate every `mirror: true` brush onto the other side of the face. */
export function expandMirrors(list: any) {
  const out = [];
  for (const br of list) {
    out.push(br);
    if (br.mirror) {
      out.push({
        ...br,
        p: [-br.p[0], br.p[1], br.p[2]],
        dir: Array.isArray(br.dir) ? [-br.dir[0], br.dir[1], br.dir[2]] : br.dir,
      });
    }
  }
  return out;
}

/**
 * Sum every brush's displacement against the *original* position. Applying
 * them sequentially would make overlapping mirrored brushes (eye sockets,
 * cheeks) push a midline vertex differently from left to right and leave the
 * face subtly asymmetric.
 */
export function applyBrushes(p: any, nrm: any, brushes: any) {
  const d = new THREE.Vector3();
  const acc = _a.set(0, 0, 0);
  const px = p.x, py = p.y, pz = p.z;
  for (const br of brushes) {
    const dx = (px - br.p[0]) / br.r[0];
    const dy = (py - br.p[1]) / br.r[1];
    const dz = (pz - br.p[2]) / br.r[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist >= 1) continue;
    let w = 0.5 * (1 + Math.cos(dist * Math.PI));
    if (br.pow) w = Math.pow(w, br.pow);
    if (br.dir === 'normal' || !br.dir) d.copy(nrm);
    else d.set(br.dir[0], br.dir[1], br.dir[2]).normalize();
    acc.addScaledVector(d, br.amt * w);
  }
  p.add(acc);
  return p;
}

/** Cylindrical head/face UV — shared by mesh generation and texture painting. */
export function faceUV(x: any, y: any, z: any, o: any) {
  const u = 0.5 + Math.atan2(x, z) / (Math.PI * 2);
  const v = clamp01((y - o.y0) / (o.y1 - o.y0));
  return [u, v];
}

/** Rounded box, handy for props (cameras, buckles, soles). */
export function roundedBox(B: any, o: any) {
  const [sx, sy, sz] = o.size;
  const c = o.center || [0, 0, 0];
  const bev = o.bevel ?? Math.min(sx, sy, sz) * 0.18;
  const q = new THREE.Quaternion();
  if (o.rot) q.setFromEuler(new THREE.Euler().fromArray(o.rot));
  const seg = o.seg || 3;
  const push = (x: any, y: any, z: any) => {
    const p = new THREE.Vector3(x, y, z).applyQuaternion(q).add(new THREE.Vector3().fromArray(c));
    return B.vv(p, (x / sx) + 0.5, (y / sy) + 0.5);
  };
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  // a subdivided cube blended toward a superellipsoid gives the bevel
  const grid = [];
  const faces = [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 1, 0], [0, 0, -1]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [0, 0, -1], [1, 0, 0]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  ];
  for (const [n, a, b] of faces) {
    const rows = [];
    for (let i = 0; i <= seg; i++) {
      const row = [];
      for (let j = 0; j <= seg; j++) {
        const s = (i / seg) * 2 - 1, t = (j / seg) * 2 - 1;
        let x = n[0] * 1 + a[0] * s + b[0] * t;
        let y = n[1] * 1 + a[1] * s + b[1] * t;
        let z = n[2] * 1 + a[2] * s + b[2] * t;
        // round the cube toward a superellipsoid
        const k = bev / Math.max(hx, hy, hz);
        const l = Math.pow(Math.pow(Math.abs(x), 6) + Math.pow(Math.abs(y), 6) + Math.pow(Math.abs(z), 6), 1 / 6);
        const rx = lerp(x, x / l, k), ry = lerp(y, y / l, k), rz = lerp(z, z / l, k);
        row.push(push(rx * hx, ry * hy, rz * hz));
      }
      rows.push(row);
    }
    grid.push(rows);
    for (let i = 0; i < seg; i++) {
      for (let j = 0; j < seg; j++) B.quad(rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]);
    }
  }
  return grid;
}

/** Sphere/ellipsoid blob, welded, for muscle caps and joints. */
export function blob(B: any, o: any) {
  const segU = o.segU || 12, segV = o.segV || 8;
  const c = o.center;
  const s = o.scale;
  const q = o.rot ? new THREE.Quaternion().setFromEuler(new THREE.Euler().fromArray(o.rot)) : null;
  const rows = [];
  for (let v = 0; v <= segV; v++) {
    const phi = (v / segV) * Math.PI;
    const row = [];
    for (let u = 0; u <= segU; u++) {
      const th = (u / segU) * Math.PI * 2;
      const p = new THREE.Vector3(
        Math.sin(phi) * Math.sin(th) * s[0],
        Math.cos(phi) * s[1],
        Math.sin(phi) * Math.cos(th) * s[2]
      );
      if (q) p.applyQuaternion(q);
      p.add(new THREE.Vector3().fromArray(c));
      // `uv` pins every vertex to one texel. A blob that spans the whole 0..1
      // texture samples the *entire* face map, so a 2 cm ear picks up the lips
      // and the nostrils and renders as a mottled red lump.
      row.push(o.uv ? B.vv(p, o.uv[0], o.uv[1]) : B.vv(p, u / segU, v / segV));
    }
    rows.push(row);
  }
  for (let v = 0; v < segV; v++) {
    for (let u = 0; u < segU; u++) B.quad(rows[v][u], rows[v][u + 1], rows[v + 1][u + 1], rows[v + 1][u]);
  }
  return rows;
}

/**
 * Tapered ribbon along a curve — the unit hair cluster.
 *
 * The cross section is an ellipse sampled at `sides` points, `width` across and
 * `thick` deep. Four points is a flat diamond: two of its four facets face the
 * camera edge-on at any given moment, so the strand reads as a **faceted blade**
 * — a quill — no matter how the shading is tuned. Six or eight points on a
 * cross section that is at least half as deep as it is wide gives a rolled lock
 * with a continuous highlight running down it, which is what hair actually is.
 * The default stays at four for the callers that want a flat card (eyebrows,
 * hairline wisps) where the extra triangles buy nothing.
 */
export function ribbon(B: any, o: any) {
  const pts = o.points.map((p: any) => new THREE.Vector3().fromArray(p));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  const steps = o.steps || 8;
  const sides = o.sides || 4;
  const width = o.width || 0.02;
  const thick = o.thick ?? width * 0.45;
  const taper = o.taper || ((t: any) => 1 - t * t);
  const up = new THREE.Vector3().fromArray(o.up || [0, 0, 1]);
  const tipColor = o.tipColor;
  const baseColor = o.color;
  // cross-section angles, starting on the +width axis so u=0 lands on a
  // silhouette edge and the `hairStripe` map still runs across the clump
  const cs = [];
  for (let k = 0; k < sides; k++) {
    // clockwise in the (right, front) plane — matches the winding the old
    // four-point section had, so the outward face stays the outward face
    const a = -(k / sides) * Math.PI * 2;
    const f = ((k * 2) / sides) % 2;
    cs.push([Math.cos(a), Math.sin(a), f <= 1 ? f : 2 - f]);
  }
  const rows = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t).normalize();
    _f.copy(up).addScaledVector(tan, -up.dot(tan));
    if (_f.lengthSq() < 1e-6) _f.set(0, 1, 0).addScaledVector(tan, -tan.y);
    _f.normalize();
    _r.crossVectors(_f, tan).normalize();
    const k = taper(t);
    const w = width * k;
    const h = thick * k;
    if (baseColor && tipColor) {
      B.color(new THREE.Color().copy(baseColor).lerp(tipColor, t * t));
    }
    // the strand tangent drives the anisotropic highlight band in the shader
    B.tang(tan.x, tan.y, tan.z);
    const row = [];
    for (const [c, s2, u] of cs) {
      const vp = _t.copy(p).addScaledVector(_r, c * w).addScaledVector(_f, s2 * h);
      row.push(o.uv ? B.vv(vp, o.uv[0], o.uv[1]) : B.vv(vp, u, t));
    }
    rows.push(row);
  }
  for (let i = 0; i < steps; i++) {
    const a = rows[i], b = rows[i + 1];
    for (let k = 0; k < sides; k++) {
      const k2 = (k + 1) % sides;
      B.quad(a[k], a[k2], b[k2], b[k]);
    }
  }
  // close the tip with a fan rather than leaving an open pipe
  const last = rows[steps];
  const e = curve.getPoint(1);
  B.tang(0, 1, 0);
  const cap = o.uv ? B.vv(_t.copy(e), o.uv[0], o.uv[1]) : B.vv(_t.copy(e), 0.5, 1);
  for (let k = 0; k < sides; k++) B.tri(last[(k + 1) % sides], last[k], cap);
  return rows;
}
