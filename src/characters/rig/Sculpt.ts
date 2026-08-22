import * as THREE from 'three';
import { crScalar, clamp01, smooth, lerp, applyBrushes, expandMirrors } from './Geo.ts';

/**
 * Creature sculpting toolkit — the bestiary's answer to `rig/Geo.js`.
 *
 * The party characters get their quality from three things the enemies never
 * had: sweeps whose cross-section is *shaped* per-angle (so a thigh is not a
 * cylinder), sculpt brushes that push a skull into brow ridges and cheekbones,
 * and per-vertex material response so fur, hide, chitin and painted steel read
 * differently under the same light. This module gives creatures the same three,
 * emitting geometry in the attribute layout the one-draw-call enemy merge
 * expects:
 *
 *   position, normal, uv, color, aEmissive, aMat(roughness, metalness)
 *
 * Skin binding is stamped afterwards by `enemies/RigBuilder.js`, so a part can
 * be authored in world bind space and then bound rigidly, across two bones, or
 * smoothly along a whole limb chain.
 */

const _a = new THREE.Vector3();
const _t = new THREE.Vector3();
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();

/** Accumulates triangles carrying colour, emissive and material response. */
export class CBuilder {
  _c!: number[];
  _e!: number[];
  _g!: number;
  _m!: number[];
  col!: any[];
  emi!: any[];
  grp!: any[];
  idx!: any[];
  mp!: any[];
  pos!: any[];
  uv!: any[];
  constructor() {
    this.pos = [];
    this.uv = [];
    this.col = [];
    this.emi = [];
    this.mp = [];
    this.grp = [];
    this.idx = [];
    this._g = 0;
    this._c = [1, 1, 1];
    this._e = [0, 0, 0];
    this._m = [0.8, 0];
  }

  /** Smoothing group — normals only average between vertices sharing one. */
  group(g: number) { this._g = g; return this; }

  /** Base colour for subsequent vertices. */
  color(c: any) {
    const col = c instanceof THREE.Color ? c : _col.setHex(c, THREE.SRGBColorSpace);
    this._c = [col.r, col.g, col.b];
    return this;
  }

  /** Multiply the current colour — cheap value variation within one part. */
  tint(k: any) { this._c = [this._c[0] * k, this._c[1] * k, this._c[2] * k]; return this; }

  /** Emissive radiance added on top of the lit result (eyes, magitek seams). */
  glow(c: any, strength = 1) {
    if (!c) { this._e = [0, 0, 0]; return this; }
    const col = c instanceof THREE.Color ? c : _col.setHex(c, THREE.SRGBColorSpace);
    this._e = [col.r * strength, col.g * strength, col.b * strength];
    return this;
  }

  /** Per-vertex roughness / metalness. This is what separates hide from steel. */
  mat(rough: any, metal = 0) { this._m = [rough, metal]; return this; }

  v(x: any, y: any, z: any, u = 0, w = 0) {
    this.pos.push(x, y, z);
    this.uv.push(u, w);
    this.col.push(this._c[0], this._c[1], this._c[2]);
    this.emi.push(this._e[0], this._e[1], this._e[2]);
    this.mp.push(this._m[0], this._m[1]);
    this.grp.push(this._g);
    return this.pos.length / 3 - 1;
  }

  vv(p: THREE.Vector3, u = 0, w = 0) { return this.v(p.x, p.y, p.z, u, w); }

  tri(a: any, b: any, c: any) { this.idx.push(a, b, c); return this; }
  quad(a: number, b: number, c: number, d: number) { this.idx.push(a, b, c, a, c, d); return this; }

  get count() { return this.pos.length / 3; }

  /** Darken vertex colours near a point — baked contact occlusion in creases. */
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

  /** Finalise into a BufferGeometry with group-aware smoothed normals. */
  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setAttribute('aEmissive', new THREE.Float32BufferAttribute(this.emi, 3));
    geo.setAttribute('aMat', new THREE.Float32BufferAttribute(this.mp, 2));
    geo.setIndex(this.idx);
    smoothNormals(geo, this.grp);
    return geo;
  }
}

const _col = new THREE.Color();

/** Area-weighted normals, welded across coincident vertices in a group. */
export function smoothNormals(geo: any, groups: any) {
  const pos = geo.attributes.position.array;
  const idx = geo.index.array;
  const n = pos.length / 3;
  const nrm = new Float32Array(n * 3);
  const ax = new THREE.Vector3(), bx = new THREE.Vector3(), cx = new THREE.Vector3();

  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    ax.set(pos[a], pos[a + 1], pos[a + 2]);
    bx.set(pos[b], pos[b + 1], pos[b + 2]);
    cx.set(pos[c], pos[c + 1], pos[c + 2]);
    bx.sub(ax); cx.sub(ax); bx.cross(cx);
    for (const o of [a, b, c]) { nrm[o] += bx.x; nrm[o + 1] += bx.y; nrm[o + 2] += bx.z; }
  }

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

/**
 * Sweep a tube along a Catmull-Rom centreline with elliptical, *shaped* rings.
 *
 * `shape(theta, u)` returns a radial multiplier, which is where anatomy comes
 * from: a flat back and a rounded belly, a keeled chest, a triangular shin, a
 * muscle bulge on the front of a thigh — all one sweep, no extra parts, no
 * visible seams between primitives.
 *
 * @param {Object} o
 * @returns the ring index grid, so callers can stitch to it
 */
export function sweep(B: CBuilder, o: { nodes: any[], steps?: number, seg?: number, shape?: (theta:number,u:number)=>number, offset?: (theta:number,u:number,out:THREE.Vector3)=>void, colorAt?: (theta:number,u:number)=>number|THREE.Color, matAt?: (theta:number,u:number)=>number[], ref?: any, capStart?: any, capEnd?: any, glowAt?: any, theta0?: any, theta1?: any, uvScale?: any }): number[][] {
  const nodes = o.nodes;
  const steps = o.steps || 14;
  const seg = o.seg || 12;
  const t0 = o.theta0 ?? 0;
  const t1 = o.theta1 ?? Math.PI * 2;
  const closed = (t1 - t0) >= Math.PI * 2 - 1e-6;
  const shape = o.shape;
  const offset = o.offset;
  const ref = o.ref ? _a.clone().fromArray(o.ref) : new THREE.Vector3(0, 1, 0);
  const uvS = o.uvScale || [1, 1];

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
    _f.copy(ref).addScaledVector(tan, -ref.dot(tan));
    if (_f.lengthSq() < 1e-6) _f.set(0, 0, 1).addScaledVector(tan, -tan.z);
    if (_f.lengthSq() < 1e-6) _f.set(1, 0, 0);
    _f.normalize();
    _r.crossVectors(_f, tan).normalize();

    const rx = crScalar(rxs, u), rz = crScalar(rzs, u);
    const row = [];
    for (let j = 0; j < cols; j++) {
      const th = t0 + (t1 - t0) * (j / seg);
      if (o.colorAt) B.color(o.colorAt(th, u));
      if (o.matAt) { const q = o.matAt(th, u); B.mat(q[0], q[1] || 0); }
      if (o.glowAt) { const g = o.glowAt(th, u); B.glow(g ? g[0] : null, g ? g[1] : 0); }
      const m = shape ? shape(th, u) : 1;
      let x = Math.sin(th) * rx * m;
      let z = Math.cos(th) * rz * m;
      let yo = 0;
      if (offset) {
        _t.set(0, 0, 0);
        offset(th, u, _t);
        x += _t.x; yo = _t.y; z += _t.z;
      }
      row.push(B.v(
        p.x + _r.x * x + _f.x * z + tan.x * yo,
        p.y + _r.y * x + _f.y * z + tan.y * yo,
        p.z + _r.z * x + _f.z * z + tan.z * yo,
        (j / seg) * uvS[0], u * uvS[1]
      ));
    }
    rings.push(row);
  }

  for (let i = 0; i < steps; i++) {
    const A = rings[i], C = rings[i + 1];
    for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % cols;
      if (!closed && j + 1 >= cols) break;
      // wound so the face normal points *out* of the tube: with the ring frame
      // (side = front x tangent) the naive order faces inward, which lights a
      // creature entirely from inside and renders it black
      B.quad(A[j2], A[j], C[j], C[j2]);
    }
  }

  if (closed && o.capStart !== false) capRing(B, rings[0], curve.getPoint(0), curve.getTangent(0).normalize(), -1, o.capStart);
  if (closed && o.capEnd !== false) capRing(B, rings[steps], curve.getPoint(1), curve.getTangent(1).normalize(), 1, o.capEnd);
  return rings;
}

/** Dome a sweep end so it reads as an end of a limb, not an open pipe. */
function capRing(B: CBuilder, ring: number[], p: THREE.Vector3, tan: THREE.Vector3, sign: number, height: any) {
  const n = ring.length;
  // measure the ring radius so the dome matches the tube it closes
  let rad = 0;
  const cx = p.x, cy = p.y, cz = p.z;
  for (const i of ring) {
    const d = Math.hypot(B.pos[i * 3] - cx, B.pos[i * 3 + 1] - cy, B.pos[i * 3 + 2] - cz);
    rad += d;
  }
  rad /= n;
  const h = (typeof height === 'number' ? height : 0.85) * rad;
  const layers = 3;
  let prev = ring;
  for (let k = 1; k <= layers; k++) {
    const a = (k / (layers + 1)) * Math.PI * 0.5;
    const s = Math.cos(a), lift = Math.sin(a) * h * sign;
    const row = [];
    for (let j = 0; j < n; j++) {
      const i = ring[j];
      row.push(B.v(
        cx + (B.pos[i * 3] - cx) * s + tan.x * lift,
        cy + (B.pos[i * 3 + 1] - cy) * s + tan.y * lift,
        cz + (B.pos[i * 3 + 2] - cz) * s + tan.z * lift,
        j / n, sign > 0 ? 1 + k * 0.02 : -k * 0.02
      ));
    }
    for (let j = 0; j < n; j++) {
      const j2 = (j + 1) % n;
      if (sign > 0) B.quad(prev[j2], prev[j], row[j], row[j2]);
      else B.quad(prev[j], prev[j2], row[j2], row[j]);
    }
    prev = row;
  }
  const tip = B.v(cx + tan.x * h * sign, cy + tan.y * h * sign, cz + tan.z * h * sign, 0.5, sign > 0 ? 1.1 : -0.1);
  for (let j = 0; j < n; j++) {
    const j2 = (j + 1) % n;
    if (sign > 0) B.tri(prev[j2], prev[j], tip);
    else B.tri(prev[j], prev[j2], tip);
  }
}

/**
 * A sphere pushed around by sculpt brushes — how a skull gets a brow ridge, an
 * eye socket, a cheekbone and a muzzle without any modelling data.
 *
 * brush: {p:[x,y,z], r:[rx,ry,rz], amt, dir:[x,y,z]|'normal', mirror?, pow?}
 */
export function sculptBlob(B: CBuilder, o: any) {
  const segU = o.segU || 16, segV = o.segV || 12;
  const scale = new THREE.Vector3().fromArray(o.scale);
  const center = new THREE.Vector3().fromArray(o.center || [0, 0, 0]);
  const brushes = expandMirrors(o.brushes || []);
  const rot = o.rot ? new THREE.Quaternion().setFromEuler(new THREE.Euler().fromArray(o.rot)) : null;
  const rows = [];
  const nrm = new THREE.Vector3();
  for (let v = 0; v <= segV; v++) {
    const phi = (v / segV) * Math.PI;
    const row = [];
    for (let u = 0; u <= segU; u++) {
      const th = (u / segU) * Math.PI * 2;
      const nx = Math.sin(phi) * Math.sin(th);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.cos(th);
      const p = new THREE.Vector3(nx * scale.x, ny * scale.y, nz * scale.z);
      nrm.set(nx / scale.x, ny / scale.y, nz / scale.z).normalize();
      applyBrushes(p, nrm, brushes);
      if (rot) p.applyQuaternion(rot);
      p.add(center);
      if (o.colorAt) B.color(o.colorAt(u / segU, v / segV, p));
      if (o.matAt) { const q = o.matAt(u / segU, v / segV, p); B.mat(q[0], q[1] || 0); }
      row.push(B.vv(p, u / segU, v / segV));
    }
    rows.push(row);
  }
  for (let v = 0; v < segV; v++) {
    for (let u = 0; u < segU; u++) B.quad(rows[v][u + 1], rows[v][u], rows[v + 1][u], rows[v + 1][u + 1]);
  }
  return rows;
}

/**
 * Bevelled box built as a superellipsoid — the magitek panel primitive.
 * `power` 2 is a pill, 8 is a hard-edged plate with a crisp chamfer.
 */
export function plate(B: CBuilder, o: any) {
  const s = o.size;
  const c = o.center || [0, 0, 0];
  const pw = o.power ?? 7;
  const segU = o.segU || 14, segV = o.segV || 10;
  const rot = o.rot ? new THREE.Quaternion().setFromEuler(new THREE.Euler().fromArray(o.rot)) : null;
  const rows = [];
  for (let v = 0; v <= segV; v++) {
    const phi = (v / segV) * Math.PI;
    const row = [];
    for (let u = 0; u <= segU; u++) {
      const th = (u / segU) * Math.PI * 2;
      const nx = Math.sin(phi) * Math.sin(th);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.cos(th);
      const l = Math.pow(
        Math.pow(Math.abs(nx), pw) + Math.pow(Math.abs(ny), pw) + Math.pow(Math.abs(nz), pw),
        -1 / pw
      );
      const p = new THREE.Vector3(nx * l * s[0] * 0.5, ny * l * s[1] * 0.5, nz * l * s[2] * 0.5);
      if (rot) p.applyQuaternion(rot);
      p.x += c[0]; p.y += c[1]; p.z += c[2];
      if (o.colorAt) B.color(o.colorAt(u / segU, v / segV, p));
      if (o.matAt) { const q = o.matAt(u / segU, v / segV, p); B.mat(q[0], q[1] || 0); }
      if (o.glowAt) { const g = o.glowAt(u / segU, v / segV, p); B.glow(g ? g[0] : null, g ? g[1] : 0); }
      row.push(B.vv(p, u / segU, v / segV));
    }
    rows.push(row);
  }
  for (let v = 0; v < segV; v++) {
    for (let u = 0; u < segU; u++) B.quad(rows[v][u + 1], rows[v][u], rows[v + 1][u], rows[v + 1][u + 1]);
  }
  return rows;
}

/**
 * A tapered horn / tusk / claw / spine swept along an arc, with an optional
 * twist and an elliptical section — the single most-reused creature detail.
 * @param o {from:[x,y,z], dir:[x,y,z], len, r0, r1, curve:[x,y,z], seg, steps, flat}
 */
export function horn(B: CBuilder, o: any) {
  const from = new THREE.Vector3().fromArray(o.from);
  const dir = new THREE.Vector3().fromArray(o.dir).normalize();
  const curve = o.curve ? new THREE.Vector3().fromArray(o.curve) : new THREE.Vector3();
  const steps = o.steps || 8;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([
      from.x + dir.x * o.len * t + curve.x * t * t,
      from.y + dir.y * o.len * t + curve.y * t * t,
      from.z + dir.z * o.len * t + curve.z * t * t,
    ]);
  }
  const r0 = o.r0, r1 = o.r1 ?? 0.02 * o.len;
  const flat = o.flat ?? 1;
  const nodes = pts.map((p, i) => {
    const t = i / steps;
    const r = lerp(r0, r1, Math.pow(t, o.taper ?? 0.85));
    return { p, rx: r, rz: r * flat };
  });
  return sweep(B, {
    nodes, steps, seg: o.seg || 6,
    ref: o.ref, capStart: 0.5, capEnd: 0.15,
    colorAt: o.colorAt, matAt: o.matAt,
  });
}

/**
 * Merge geometries in the creature attribute layout into one buffer, filling
 * in whatever a part left unset. Unlike the GeoKit merge this keeps `aMat`,
 * which is the whole point — per-vertex roughness is what stops a creature
 * reading as one plastic colour.
 * @param defMat default [roughness, metalness]
 */
export function mergeCreature(list: THREE.BufferGeometry[], defMat: number[] = [0.8, 0]) {
  const geos = list.filter((g) => g && g.attributes.position.count);
  let vc = 0, ic = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    if (!g.index) g.setIndex(Array.from({ length: n }, (_, i) => i));
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(fill(n, 3, [1, 1, 1]), 3));
    if (!g.attributes.aEmissive) g.setAttribute('aEmissive', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    if (!g.attributes.aMat) g.setAttribute('aMat', new THREE.BufferAttribute(fill(n, 2, defMat), 2));
    vc += n;
    ic += g.index!.count;
  }
  const out = new THREE.BufferGeometry();
  const specs: [string, number, Float32ArrayConstructor | Uint16ArrayConstructor][] = [
    ['position', 3, Float32Array], ['normal', 3, Float32Array], ['uv', 2, Float32Array],
    ['color', 3, Float32Array], ['aEmissive', 3, Float32Array], ['aMat', 2, Float32Array],
    ['skinIndex', 4, Uint16Array], ['skinWeight', 4, Float32Array],
  ];
  for (const [name, size, Type] of specs) {
    if (!geos[0].attributes[name]) continue;
    const arr = new Type(vc * size);
    let off = 0;
    for (const g of geos) {
      const src = g.attributes[name].array;
      arr.set(src, off);
      off += src.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  const iarr = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
  let io = 0, vo = 0;
  for (const g of geos) {
    const s = g.index!.array;
    for (let i = 0; i < s.length; i++) iarr[io + i] = s[i] + vo;
    io += s.length; vo += g.attributes.position.count;
  }
  out.setIndex(new THREE.BufferAttribute(iarr, 1));
  for (const g of geos) g.dispose();
  return out;
}

function fill(n: number, size: number, vals: number[]) {
  const a = new Float32Array(n * size);
  for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) a[i * size + k] = vals[k];
  return a;
}

export { clamp01, smooth, lerp, crScalar, applyBrushes };
