import * as THREE from 'three';

/**
 * Camera-centred geometry clipmap.
 *
 * Each level is a square ring of `4n x 4n` cells with the middle `2(n-4)`
 * square removed; the next finer level sits inside that hole with a four-cell
 * overlap. Every level snaps to a multiple of twice its own cell size, so all
 * level lattices are subsets of one global grid — that is what lets the outer
 * band of a fine level morph exactly onto the coarse level's edge and stay
 * crack-free.
 */
/** One level of the clipmap: its one joined mesh, and where it last snapped. */
export interface ClipmapRing {
  /** Cell size at this level, metres. */
  cell: number;
  level: number;
  /** One entry — the level's four quadrants, joined. See {@link joinQuadrants}. */
  meshes: THREE.Mesh[];
  /** Snap grid, so a level only ever moves in whole cells. */
  snap: number;
  /** Where the ring currently sits; NaN until the first `update`. */
  x: number;
  z: number;
}

/** How the clipmap is built, and what it draws each level with. */
export interface ClipmapOpts {
  levels: number;
  /** Grid resolution of one quadrant. */
  n: number;
  /** Cell size of the finest level, metres. */
  cell0: number;
  /** Built once per level: the surface material and its shadow-depth twin. */
  makeMaterial: (cell: number, level: number) => { surface: THREE.Material, depth: THREE.Material | null };
  castShadow?: boolean;
}

export class Clipmap {
  castShadow!: boolean;
  cell0!: number;
  group!: THREE.Group;
  levels!: number;
  n!: number;
  rings!: ClipmapRing[];
  triangles!: number;
  /**
   * @param {object} opts
   * */
  constructor({ levels = 7, n = 48, cell0 = 1.5, makeMaterial, castShadow = false }: ClipmapOpts) {
    this.castShadow = castShadow;
    this.levels = levels;
    this.n = n;
    this.cell0 = cell0;
    this.group = new THREE.Group();
    this.group.name = 'TerrainClipmap';
    this.rings = [];
    this.triangles = 0;

    for (let L = 0; L < levels; L++) {
      const cell = cell0 * Math.pow(2, L);
      const mats = makeMaterial(cell, L);
      const ring: ClipmapRing = { cell, level: L, meshes: [], snap: cell * 2, x: NaN, z: NaN };
      // The four quadrants of a level are built separately because the index
      // winding has to mirror, and then joined into ONE mesh: they share a
      // material, a `renderOrder`, a depth material and — because a level snaps
      // as a unit — a position, so nothing distinguishes them at submission
      // time except the draw call each one costs. See {@link joinQuadrants}.
      const quads: THREE.BufferGeometry[] = [];
      for (let qz = 0; qz < 2; qz++) {
        for (let qx = 0; qx < 2; qx++) {
          const geo = this._quadrant(L, cell, qx ? 1 : -1, qz ? 1 : -1);
          if (geo) quads.push(geo);
        }
      }
      const geo = joinQuadrants(quads);
      if (geo) {
        this.triangles += geo.index!.count / 3;
        const mesh = new THREE.Mesh(geo, mats.surface);
        mesh.name = `terrain-L${L}`;
        mesh.matrixAutoUpdate = false;
        mesh.receiveShadow = true;
        mesh.castShadow = this.castShadow && L <= 1;
        if (mats.depth) mesh.customDepthMaterial = mats.depth;
        mesh.renderOrder = -10 + (levels - L);
        ring.meshes.push(mesh);
        this.group.add(mesh);
      }
      this.rings.push(ring);
    }
  }

  /** One quadrant of one ring, in level-local metres. */
  _quadrant(level: number, cell: number, sx: number, sz: number) {
    const n = this.n;
    const outer = 2 * n;              // cells from centre to edge
    const hole = level === 0 ? 0 : n - 4;
    const V = outer + 1;

    const pos = new Float32Array(V * V * 3);
    const clip = new Float32Array(V * V * 2);
    const ramp0 = outer - 16, ramp1 = outer - 2;
    for (let j = 0; j <= outer; j++) {
      for (let i = 0; i <= outer; i++) {
        const k = j * V + i;
        pos[k * 3] = sx * i * cell;
        pos[k * 3 + 1] = 0;
        pos[k * 3 + 2] = sz * j * cell;
        const e = Math.max(i, j);
        const t = Math.max(0, Math.min(1, (e - ramp0) / (ramp1 - ramp0)));
        clip[k * 2] = t * t * (3 - 2 * t);
        clip[k * 2 + 1] = 1;
      }
    }

    const idx = [];
    for (let j = 0; j < outer; j++) {
      for (let i = 0; i < outer; i++) {
        if (i < hole && j < hole) continue;
        const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
        // wind so the quadrant mirroring keeps front faces up
        if (sx * sz > 0) { idx.push(a, c, b, b, c, d); }
        else { idx.push(a, b, c, b, d, c); }
      }
    }
    if (!idx.length) return null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aClip', new THREE.BufferAttribute(clip, 2));
    geo.setIndex(idx.length > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));

    const ext = outer * cell;
    const cx = sx * ext * 0.5, cz = sz * ext * 0.5;
    geo.boundingBox = new THREE.Box3(
      new THREE.Vector3(Math.min(0, sx * ext), -60, Math.min(0, sz * ext)),
      new THREE.Vector3(Math.max(0, sx * ext), 780, Math.max(0, sz * ext))
    );
    geo.boundingSphere = new THREE.Sphere(
      new THREE.Vector3(cx, 360, cz),
      Math.hypot(ext * 0.5, ext * 0.5, 420)
    );
    return geo;
  }

  /** Re-centre every ring on the camera. Cheap: only matrices change. */
  update(camX: number, camZ: number) {
    for (const ring of this.rings) {
      const x = Math.round(camX / ring.snap) * ring.snap;
      const z = Math.round(camZ / ring.snap) * ring.snap;
      if (x === ring.x && z === ring.z) continue;
      ring.x = x; ring.z = z;
      for (const m of ring.meshes) {
        m.position.set(x, 0, z);
        m.updateMatrix();
        m.updateMatrixWorld(true);
      }
    }
  }

  dispose() {
    for (const ring of this.rings) for (const m of ring.meshes) m.geometry.dispose();
  }
}

/**
 * The four quadrants of one level, concatenated into a single geometry.
 *
 * **Why.** A clipmap level is four meshes for one reason only — the quadrant
 * mirroring has to flip the triangle winding, so the index buffers differ — and
 * for no reason that survives to submission time: all four share the level's
 * material, its optional depth material, its `renderOrder`, and its position,
 * because a level snaps to its own grid as a unit. Four meshes therefore cost
 * four draw calls in *every* pass that walks the scene, and this scene has
 * three: colour, up to three shadow cascades on the two casting levels, and the
 * velocity pass. Measured with a `renderBufferDirect` wrapper on
 * `town_forecourt`'s peak frame, seven levels cost **80 draws** — 28 colour, 24
 * shadow, 28 velocity — and after this join they cost **20**.
 *
 * **And why not simply let the frustum cull them.** It cannot. Every quadrant's
 * bounding sphere is centred half its own extent from the camera with a radius
 * slightly larger than that distance (the level's height range is ±420 m), so
 * the sphere contains the camera and no quadrant is ever culled — the probe
 * above counts all 28 in every frame of every shot measured, including the ones
 * behind the camera. Splitting a level buys granularity that the bounds cannot
 * express, so it buys nothing.
 *
 * Positions are already in the level's local frame — the quadrants differ only
 * in the sign they scale `i` and `j` by — so no matrix is applied here.
 */
function joinQuadrants(parts: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  let verts = 0, indices = 0;
  for (const p of parts) { verts += p.getAttribute('position').count; indices += p.index!.count; }
  const pos = new Float32Array(verts * 3);
  const clip = new Float32Array(verts * 2);
  // Uint16 while it fits, exactly as `_quadrant` chooses: four levels of 97x97
  // is 37 636 vertices, so at the shipped `n = 48` it always does — but `n` is
  // an option, and a silently truncated index is a terrain full of holes.
  const idx = verts > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  let vo = 0, io = 0;
  const box = new THREE.Box3();
  for (const p of parts) {
    const pp = p.getAttribute('position') as THREE.BufferAttribute;
    const pc = p.getAttribute('aClip') as THREE.BufferAttribute;
    pos.set(pp.array as Float32Array, vo * 3);
    clip.set(pc.array as Float32Array, vo * 2);
    const pi = p.index!.array;
    for (let i = 0; i < pi.length; i++) idx[io + i] = pi[i] + vo;
    if (p.boundingBox) box.union(p.boundingBox);
    vo += pp.count;
    io += pi.length;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aClip', new THREE.BufferAttribute(clip, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingBox = box;
  g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  return g;
}
