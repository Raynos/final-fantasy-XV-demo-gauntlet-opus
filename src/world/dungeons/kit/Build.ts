import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Low-level geometry emitters for interiors.
 *
 * Everything an interior is made of — a concrete wall, a hewn rock ceiling, a
 * cave tube — is a tessellated patch with two extras that ordinary primitives
 * do not give us:
 *
 *   - **displacement**, so a "wall" can be a rough rock face rather than a
 *     plane, and
 *   - **baked vertex occlusion**, written into the colour attribute. Interiors
 *     are lit by a handful of unshadowed point lights; without corner darkening
 *     every room photographs as a flat grey box. This is the cheapest single
 *     thing that stops that happening.
 *
 * UVs are emitted in metres divided by `uvScale`, so one texture tile is a
 * fixed real-world size no matter how big the surface is.
 */
export class SurfaceBuilder {
  _needsNormals!: boolean;
  col!: any[];
  idx!: any[];
  nrm!: any[];
  pos!: any[];
  uv!: any[];
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
  }

  get empty() { return this.idx.length === 0; }

  _push(p: number[], n: number[], u: number[], c: any) {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    this.uv.push(u[0], u[1]);
    this.col.push(c, c, c);
    return this.pos.length / 3 - 1;
  }

  /**
   * Tessellated planar patch.
   *
   * @param {object} o
   * */
  patch(o: { origin: number[], uAxis: number[], vAxis: number[], uLen: number, vLen: number, cell?: number, uvScale?: number, displace?: (x: number,y: number,z: number)=>number, ao?: (x: number,y: number,z: number)=>number, flip?: boolean, uvOffset?: number[] }) {
    const {
      origin, uAxis, vAxis, uLen, vLen,
      cell = 1.4, uvScale = 3.0, displace = null, ao = null, flip = false,
      uvOffset = [0, 0],
    } = o;
    const nu = Math.max(1, Math.round(uLen / cell));
    const nv = Math.max(1, Math.round(vLen / cell));
    // The front face of the default winding below is (v x u), not (u x v);
    // getting that backwards makes every unflipped surface light as if it were
    // facing away from the room it encloses.
    const n = flip ? cross(uAxis, vAxis) : cross(vAxis, uAxis);
    const base = this.pos.length / 3;

    for (let j = 0; j <= nv; j++) {
      const tv = (j / nv) * vLen;
      for (let i = 0; i <= nu; i++) {
        const tu = (i / nu) * uLen;
        let x = origin[0] + uAxis[0] * tu + vAxis[0] * tv;
        let y = origin[1] + uAxis[1] * tu + vAxis[1] * tv;
        let z = origin[2] + uAxis[2] * tu + vAxis[2] * tv;
        if (displace) {
          const d = displace(x, y, z);
          x += n[0] * d; y += n[1] * d; z += n[2] * d;
        }
        this._push(
          [x, y, z], n,
          [(tu + uvOffset[0]) / uvScale, (tv + uvOffset[1]) / uvScale],
          ao ? ao(x, y, z) : 1
        );
      }
    }
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const a = base + j * (nu + 1) + i;
        const b = a + 1;
        const c = a + (nu + 1);
        const d = c + 1;
        if (flip) this.idx.push(a, b, c, b, d, c);
        else this.idx.push(a, c, b, b, c, d);
      }
    }
    // displacement breaks the flat normals; recompute at the end for those cases
    if (displace) this._needsNormals = true;
    return this;
  }

  /**
   * Closed tube swept along a polyline — the backbone of every natural cave
   * passage. `radius(t, theta, x, y, z)` returns metres from the centreline.
   *
   * @param path world-space points
   */
  tube(path: number[][], radius: (t:number, theta:number, x:number, y:number, z:number)=>number, { sides = 14, ao = null, uvScale = 3.0, capStart = false, capEnd = false, flatten = 0.0 }: any = {}) {
    const base = this.pos.length / 3;
    const rings = path.length;
    // Cumulative arc length, so the texture advances with the metre and not
    // with the ring index — otherwise every bend in a passage smears the map.
    const arc = [0];
    for (let i = 1; i < rings; i++) {
      arc.push(arc[i - 1] + Math.hypot(
        path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]
      ));
    }
    // one stable reference frame; caves do not need parallel transport
    for (let i = 0; i < rings; i++) {
      const p = path[i];
      const prev = path[Math.max(0, i - 1)];
      const next = path[Math.min(rings - 1, i + 1)];
      const dir = norm([next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]]);
      const up = Math.abs(dir[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
      const right = norm(cross(dir, up));
      const realUp = norm(cross(right, dir));
      const t = i / (rings - 1);
      for (let j = 0; j < sides; j++) {
        const th = (j / sides) * Math.PI * 2;
        const ct = Math.cos(th), st = Math.sin(th);
        const r = radius(t, th, p[0], p[1], p[2]);
        // flatten squashes the floor of the tube so you can walk in it
        const sq = 1 - flatten * Math.max(0, -st);
        const x = p[0] + right[0] * ct * r + realUp[0] * st * r * sq;
        const y = p[1] + right[1] * ct * r + realUp[1] * st * r * sq;
        const z = p[2] + right[2] * ct * r + realUp[2] * st * r * sq;
        this._push([x, y, z], [0, 1, 0], [(th * r) / uvScale, arc[i] / uvScale], ao ? ao(x, y, z) : 1);
      }
    }
    for (let i = 0; i < rings - 1; i++) {
      for (let j = 0; j < sides; j++) {
        const a = base + i * sides + j;
        const b = base + i * sides + ((j + 1) % sides);
        const c = a + sides;
        const d = b + sides;
        // wound so the *inside* of the tube faces the camera
        this.idx.push(a, b, c, b, d, c);
      }
    }
    if (capStart) this._cap(base, sides, path[0], true, ao);
    if (capEnd) this._cap(base + (rings - 1) * sides, sides, path[rings - 1], false, ao);
    this._needsNormals = true;
    return this;
  }

  _cap(ringStart: number, sides: any, centre: number[], front: boolean, ao: any) {
    const c = this._push(centre, [0, 1, 0], [0.5, 0.5], ao ? ao(centre[0], centre[1], centre[2]) : 1);
    for (let j = 0; j < sides; j++) {
      const a = ringStart + j;
      const b = ringStart + ((j + 1) % sides);
      if (front) this.idx.push(c, b, a); else this.idx.push(c, a, b);
    }
  }

  /** Emit the accumulated triangles as a geometry. */
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx.length > 65535
      ? new THREE.Uint32BufferAttribute(this.idx, 1)
      : new THREE.Uint16BufferAttribute(this.idx, 1));
    if (this._needsNormals) g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * Accumulates geometry per material and emits one merged, colour-carrying mesh
 * each. `PartBuilder` in world/props does the same job but strips the colour
 * attribute, and baked occlusion is the whole reason interiors read as rooms.
 */
export class InteriorMerger {
  byMat!: Map<any, any>;
  constructor() { this.byMat = new Map(); }

  /** @param mat @param geo */
  add(mat: THREE.Material, geo: THREE.BufferGeometry, matrix?: THREE.Matrix4 | null) {
    let g = matrix ? geo.clone().applyMatrix4(matrix) : geo;
    const keep = ['position', 'normal', 'uv', 'color'];
    for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.color) {
      const n = g.attributes.position.count;
      const c = new Float32Array(n * 3).fill(1);
      g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
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

  /** Place a primitive with position / euler / scale and an optional flat tint. */
  place(mat: any, geo: any, pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], tint = 1) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(pos[0], pos[1], pos[2]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2])),
      new THREE.Vector3(scale[0], scale[1], scale[2])
    );
    const g = geo.clone().applyMatrix4(m);
    if (tint !== 1) {
      const n = g.attributes.position.count;
      const c = new Float32Array(n * 3).fill(tint);
      g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    }
    return this.add(mat, g, null);
  }

  build(parent: THREE.Object3D, name = 'interior'): {tris:number, calls:number} {
    let tris = 0, calls = 0;
    for (const [mat, list] of this.byMat) {
      const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      // Nothing inside casts or receives a shadow map: the key lights are
      // unshadowed point lights and the depth work would buy nothing. Baked
      // occlusion plus screen-space AO does the shaping.
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.name = `${name}_${mat.name || 'mat'}`;
      parent.add(mesh);
      tris += merged.index ? merged.index.count / 3 : merged.attributes.position.count / 3;
      calls++;
    }
    this.byMat.clear();
    return { tris: Math.round(tris), calls };
  }
}

/* ----------------------------------------------------------------- helpers */

export function cross(a: number[], b: number[]) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function norm(a: number[]) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

export function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function clamp(x: any, a: number, b: any) { return x < a ? a : x > b ? b : x; }
