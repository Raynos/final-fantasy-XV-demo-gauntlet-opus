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
export class Clipmap {
  castShadow!: any;
  cell0!: any;
  group!: THREE.Group;
  levels!: any;
  n!: any;
  rings!: any[];
  triangles!: number;
  /**
   * @param {object} opts
   * */
  constructor({ levels = 7, n = 48, cell0 = 1.5, makeMaterial, castShadow = false }: { levels: number, n: number, cell0: number, makeMaterial: ((a0: number, a1: number) => {surface: THREE.Material, depth: any}), castShadow?: boolean }) {
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
      const ring: { cell: number, level: number, meshes: THREE.Mesh[], snap: number, x: number, z: number } =
        { cell, level: L, meshes: [], snap: cell * 2, x: NaN, z: NaN };
      for (let qz = 0; qz < 2; qz++) {
        for (let qx = 0; qx < 2; qx++) {
          const geo = this._quadrant(L, cell, qx ? 1 : -1, qz ? 1 : -1);
          if (!geo) continue;
          this.triangles += geo.index!.count / 3;
          const mesh = new THREE.Mesh(geo, mats.surface);
          mesh.name = `terrain-L${L}-${qx}${qz}`;
          mesh.matrixAutoUpdate = false;
          mesh.receiveShadow = true;
          mesh.castShadow = this.castShadow && L <= 1;
          if (mats.depth) mesh.customDepthMaterial = mats.depth;
          mesh.renderOrder = -10 + (levels - L);
          ring.meshes.push(mesh);
          this.group.add(mesh);
        }
      }
      this.rings.push(ring);
    }
  }

  /** One quadrant of one ring, in level-local metres. */
  _quadrant(level: any, cell: any, sx: any, sz: any) {
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
  update(camX: any, camZ: any) {
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
