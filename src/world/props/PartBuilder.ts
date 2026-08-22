import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Accumulates transformed geometry per material and emits one merged mesh per
 * material. Keeping a whole structure (car, shack, campsite) to a handful of
 * draw calls is the whole point.
 */
export class PartBuilder {
  byMat!: Map<any, any>;
  constructor() { this.byMat = new Map(); }

  /**
   * @param geo consumed (cloned internally when transformed)
   * @param matrix optional transform
   */
  add(mat: THREE.Material, geo: THREE.BufferGeometry, matrix?: THREE.Matrix4 | null) {
    const g = matrix ? geo.clone().applyMatrix4(matrix) : geo;
    // normalise attributes so merges never fail on a stray extra buffer
    const keep = ['position', 'normal', 'uv'];
    for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    if (!g.index) {
      const n = g.attributes.position.count;
      const idx = new Uint32Array(n);
      for (let i = 0; i < n; i++) idx[i] = i;
      g.setIndex(new THREE.BufferAttribute(idx, 1));
    }
    if (!this.byMat.has(mat)) this.byMat.set(mat, []);
    this.byMat.get(mat).push(g);
    return this;
  }

  /** Convenience: place a primitive with position / rotation / scale. */
  place(mat: any, geo: any, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1]) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(pos[0], pos[1], pos[2]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])),
      new THREE.Vector3(scale[0], scale[1], scale[2])
    );
    return this.add(mat, geo, m);
  }

  build(parent: THREE.Object3D, { cast = true, receive = true, name = 'part' }: {cast?:boolean, receive?:boolean, name?:string} = {}): THREE.Object3D {
    for (const [mat, list] of this.byMat) {
      const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = cast;
      mesh.receiveShadow = receive;
      mesh.name = `${name}_${mat.name || mat.uuid.slice(0, 4)}`;
      parent.add(mesh);
    }
    this.byMat.clear();
    return parent;
  }
}

/**
 * Loft a closed tube through a list of cross-sections.
 * @param sections rings of [y,z]
 */
export function loft(sections: {x:number, pts:number[][]}[], { caps = true }: {caps?:boolean, vScale?:number} = {}) {
  const N = sections[0].pts.length;
  const S = sections.length;
  const pos = new Float32Array(S * N * 3);
  const uv = new Float32Array(S * N * 2);
  const idx = [];
  for (let i = 0; i < S; i++) {
    const sec = sections[i];
    for (let j = 0; j < N; j++) {
      const k = (i * N + j) * 3;
      pos[k] = sec.x; pos[k + 1] = sec.pts[j][0]; pos[k + 2] = sec.pts[j][1];
      uv[(i * N + j) * 2] = i / (S - 1);
      uv[(i * N + j) * 2 + 1] = j / N;
    }
  }
  for (let i = 0; i < S - 1; i++) {
    for (let j = 0; j < N; j++) {
      const a = i * N + j, b = i * N + ((j + 1) % N);
      const c = (i + 1) * N + j, d = (i + 1) * N + ((j + 1) % N);
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);

  if (caps) {
    // fan-cap both ends by adding a centre vertex each
    const extra: any[] = [];
    const addCap = (i: number, flip: boolean) => {
      let cy = 0, cz = 0;
      for (let j = 0; j < N; j++) { cy += sections[i].pts[j][0]; cz += sections[i].pts[j][1]; }
      cy /= N; cz /= N;
      extra.push({ x: sections[i].x, y: cy, z: cz, ring: i, flip });
    };
    addCap(0, true); addCap(S - 1, false);
    const base = S * N;
    const p2 = new Float32Array((S * N + 2) * 3);
    const u2 = new Float32Array((S * N + 2) * 2);
    p2.set(pos); u2.set(uv);
    for (let e = 0; e < 2; e++) {
      const c = extra[e];
      p2[(base + e) * 3] = c.x; p2[(base + e) * 3 + 1] = c.y; p2[(base + e) * 3 + 2] = c.z;
      u2[(base + e) * 2] = 0.5; u2[(base + e) * 2 + 1] = 0.5;
      const ringStart = c.ring * N;
      for (let j = 0; j < N; j++) {
        const a = ringStart + j, b = ringStart + ((j + 1) % N);
        if (c.flip) idx.push(base + e, a, b); else idx.push(base + e, b, a);
      }
    }
    g.setAttribute('position', new THREE.BufferAttribute(p2, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(u2, 2));
    g.setIndex(idx);
  }
  g.computeVertexNormals();
  return g;
}

/** A superelliptic ring in the YZ plane, used for lofted car bodies. */
export function ring(n: number, halfWidth: number, yLow: any, yHigh: any, power = 3.6, shear = 0) {
  const pts = [];
  const cy = (yLow + yHigh) * 0.5, hh = (yHigh - yLow) * 0.5;
  const e = 2 / power;
  for (let j = 0; j < n; j++) {
    const th = -Math.PI / 2 + (j / n) * Math.PI * 2;
    const c = Math.cos(th), s = Math.sin(th);
    const z = Math.sign(c) * Math.pow(Math.abs(c), e) * halfWidth;
    const y = cy + Math.sign(s) * Math.pow(Math.abs(s), e) * hh;
    pts.push([y + shear * z, z]);
  }
  return pts;
}

/** Extract a contiguous band of a loft's rings as an open shell. */
export function loftBand(sections: any, j0: number, j1: number, offsetOut = 0) {
  const N = sections[0].pts.length;
  const S = sections.length;
  const cols = [];
  for (let j = j0; j <= j1; j++) cols.push(((j % N) + N) % N);
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < S; i++) {
    const sec = sections[i];
    let cy = 0, cz = 0;
    for (let j = 0; j < N; j++) { cy += sec.pts[j][0]; cz += sec.pts[j][1]; }
    cy /= N; cz /= N;
    for (let k = 0; k < cols.length; k++) {
      const [y, z] = sec.pts[cols[k]];
      const dy = y - cy, dz = z - cz;
      const l = Math.hypot(dy, dz) || 1;
      pos.push(sec.x, y + (dy / l) * offsetOut, z + (dz / l) * offsetOut);
      uv.push(i / (S - 1), k / (cols.length - 1));
    }
  }
  const W = cols.length;
  for (let i = 0; i < S - 1; i++) {
    for (let k = 0; k < W - 1; k++) {
      const a = i * W + k, b = a + 1, c = (i + 1) * W + k, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
