import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * A position / rotation / scale triple, written as an array literal at every
 * call site in the prop kits. Not a tuple: the kits index it and pass slices
 * around, and a `[number, number, number]` would only make those sites cast.
 */
export type Vec3 = number[];

/** One cross-section of a {@link loft}: a station at `x`, and its ring of `[y,z]`. */
export interface LoftSection { x: number; pts: number[][] }

/**
 * Accumulates transformed geometry per material and emits one merged mesh per
 * material. Keeping a whole structure (car, shack, campsite) to a handful of
 * draw calls is the whole point.
 */
export class PartBuilder {
  byMat!: Map<THREE.Material, THREE.BufferGeometry[]>;
  constructor() { this.byMat = new Map(); }

  /**
   * @param geo consumed (cloned internally when transformed)
   * @param matrix optional transform
   */
  add(mat: THREE.Material, geo: THREE.BufferGeometry, matrix?: THREE.Matrix4 | null) {
    const g = prep(matrix ? geo.clone().applyMatrix4(matrix) : geo);
    let list = this.byMat.get(mat);
    if (!list) { list = []; this.byMat.set(mat, list); }
    list.push(g);
    return this;
  }

  /** Convenience: place a primitive with position / rotation / scale. */
  place(mat: THREE.Material, geo: THREE.BufferGeometry, pos: Vec3 = [0, 0, 0], rot: Vec3 = [0, 0, 0], scale: Vec3 = [1, 1, 1]) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(pos[0], pos[1], pos[2]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])),
      new THREE.Vector3(scale[0], scale[1], scale[2])
    );
    return this.add(mat, geo, m);
  }

  build(parent: THREE.Object3D, { cast = true, receive = true, name = 'part' }: {cast?:boolean, receive?:boolean, name?:string} = {}): THREE.Object3D {
    for (const [mat, list] of this.byMat) {
      // If the material reads vertex colours -- or if any piece in this batch
      // carries them -- then every piece must have them. `mergeGeometries`
      // returns null on an attribute mismatch and does so silently, and a
      // material with `vertexColors` and no `color` attribute draws BLACK,
      // because GLSL reads an absent attribute as zero. Both failures are
      // invisible until something in the frame is missing or is a silhouette.
      const wantsColor = (mat as THREE.Material & { vertexColors?: boolean }).vertexColors === true;
      if ((wantsColor || list.some(g => g.attributes.color)) && list.some(g => !g.attributes.color)) {
        for (const g of list) {
          if (g.attributes.color) continue;
          const n = g.attributes.position.count;
          const white = new Float32Array(n * 3).fill(1);
          g.setAttribute('color', new THREE.BufferAttribute(white, 3));
        }
      }
      const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!merged) {
        // A null merge used to `continue`, which deletes a whole structure and
        // says nothing -- the systemic failure plan section 5.5 exists to fix,
        // and the one our own `Debris` found independently. `prep` should make
        // it unreachable; if it happens anyway the pieces still ship, at one
        // draw call each, and the console says which material it was.
        console.warn(`[PartBuilder] merge returned null for ${mat.name || mat.type} (${list.length} pieces); drawing them unmerged`);
        for (const g of list) {
          g.computeBoundingSphere();
          const m = new THREE.Mesh(g, mat);
          m.castShadow = cast; m.receiveShadow = receive;
          m.name = `${name}_unmerged`;
          parent.add(m);
        }
        continue;
      }
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

/** Attributes a merged prop geometry is allowed to carry, and the only ones. */
export const KEEP = ['position', 'normal', 'uv', 'color'] as const;

/**
 * Normalise one piece so a merge cannot fail on it, and so nothing it is
 * missing reads back as zero.
 *
 * Plan section 5.5. Three things have to agree across a merge batch — the index,
 * the attribute set, and what each attribute *means* — and `mergeGeometries`
 * enforces none of them: it returns **null**, without throwing and without
 * logging, and a whole building disappears. The sibling's audit records a
 * variation stamp that existed only on the unmerged pieces silently pinning
 * every merged surface to one value for four rounds.
 *
 * The part people get wrong is the third one. Synthesising a *zero* UV for a
 * piece that has none makes the merge succeed and makes the piece sample one
 * texel of its map forever — a flat patch of colour that reads as a shading
 * decision rather than as missing data, which is exactly section 9.5's
 * "undeclared attributes read as zero, silently". So a missing UV is
 * synthesised as a **planar projection in the piece's own frame**, which is
 * wrong in the same way a box projection is wrong and is at least *varying*: a
 * seam is a bug you can see, and a flat patch is not.
 *
 * Our object-level variation stamp is `BuildKit.bakeTone`, which writes value,
 * warmth, grime and the chamfer lift into `attributes.color` **before** the
 * merge and on the finished, placed piece. `color` is on {@link KEEP} for that
 * reason and this function must never drop it.
 */
export function prep(g: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const k of Object.keys(g.attributes)) {
    if (!(KEEP as readonly string[]).includes(k)) g.deleteAttribute(k);
  }
  const pos = g.attributes.position;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) {
    g.computeBoundingBox();
    const bb = g.boundingBox;
    const sx = bb ? Math.max(1e-3, bb.max.x - bb.min.x) : 1;
    const sy = bb ? Math.max(1e-3, bb.max.y - bb.min.y) : 1;
    const sz = bb ? Math.max(1e-3, bb.max.z - bb.min.z) : 1;
    // Project on the two widest axes, so the piece's largest face is the one
    // that comes out undistorted.
    const drop = sx <= sy && sx <= sz ? 0 : sy <= sz ? 1 : 2;
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      uv[i * 2] = drop === 0 ? z / sz : x / sx;
      uv[i * 2 + 1] = drop === 1 ? z / sz : y / sy;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  }
  if (!g.index) {
    const n = pos.count;
    const idx = new Uint32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  return g;
}

/**
 * Loft a closed tube through a list of cross-sections.
 * @param sections rings of [y,z]
 */
/**
 * A box whose UVs are a world-space projection rather than 0..1 per face.
 *
 * `PropMaterials`' maps are tiles authored for a roughly metre-sized part:
 * `paintedMaterial`'s chipping is `fbm2(u * 11)`, so one chip is a tenth of a
 * tile. A plain `BoxGeometry` puts exactly one tile on every face whatever the
 * face is, so a 6.1 m shipping container gets 60 cm paint chips — which is what
 * turns the stacked containers at the mesa outpost into a red-and-black
 * checkerboard, and it is the same defect the town's canopy soffit had.
 *
 * The dominant axis of each face normal picks which two coordinates become U
 * and V, so all six faces come out at the same texels per metre.
 *
 * @param mpt metres of world per texture tile
 */
export function texelBox(w: number, h: number, d: number, mpt = 2.0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const pos = g.attributes.position, nrm = g.attributes.normal, uv = g.attributes.uv;
  const s = 1 / mpt;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i)), nz = Math.abs(nrm.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (ny >= nx && ny >= nz) uv.setXY(i, x * s, z * s);
    else if (nx >= nz) uv.setXY(i, z * s, y * s);
    else uv.setXY(i, x * s, y * s);
  }
  uv.needsUpdate = true;
  return g;
}

export function loft(sections: LoftSection[], { caps = true }: {caps?:boolean, vScale?:number} = {}) {
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
    const extra: { x: number, y: number, z: number, ring: number, flip: boolean }[] = [];
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
export function ring(n: number, halfWidth: number, yLow: number, yHigh: number, power = 3.6, shear = 0) {
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
export function loftBand(sections: LoftSection[], j0: number, j1: number, offsetOut = 0) {
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
