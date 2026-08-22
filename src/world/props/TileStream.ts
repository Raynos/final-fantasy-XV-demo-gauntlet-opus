import type * as THREE from 'three';
/**
 * Camera-relative scatter streaming.
 *
 * The world is 8192 m on a side. A one-shot scatter over a 380 m disc around
 * the origin — which is what every prop layer used to do — populates 0.2% of
 * it and leaves the other nineteen zones as bare terrain and sky. A one-shot
 * scatter over the whole map is not the fix either: at Leide's boulder density
 * that is several million instances, none of which fit in a buffer or a frame.
 *
 * So the scatter is *streamed*. Space is cut into square cells; a cell's
 * contents are a pure function of its integer coordinates and the layer seed,
 * so a cell generated while driving east contains exactly what it contained
 * when the player drove west through it an hour earlier. Cells enter as the
 * camera approaches and are dropped behind it, with a budget per update so a
 * fast car never pays for a hundred cells in one frame.
 *
 * Determinism is the whole trick: because content is position-derived, the
 * streaming window can move without anything popping into a *different* shape.
 * The only visible event is a cell appearing at the far edge of the radius,
 * which is why the radius is comfortably past the distance at which the
 * instances themselves fade out.
 */
export class TileStream {
  _first!: number;
  _pendCx!: number;
  _pendCz!: number;
  _pending!: any[];
  budget!: any;
  cell!: number;
  dirty!: boolean;
  gen!: any;
  keep2!: number;
  live!: Map<any, any>;
  radius!: number;
  /**
   * @param {object} o
   * */
  constructor({ cell, radius, gen, budget = 20, keep = 1.22 }: { cell: number, radius: number, gen: (cx: number, cz: number, out: any[]) => void, budget?: number, keep?: number }) {
    this.cell = cell;
    this.radius = radius;
    this.gen = gen;
    this.budget = budget;
    this.keep2 = (radius * keep) * (radius * keep);
    /** @type {Map<number, Array>} live cells, key packed from cell coords */
    this.live = new Map();
    this.dirty = false;
    this._pending = [];
    this._pendCx = 0; this._pendCz = 0;
  }

  static key(cx: any, cz: any) { return ((cx & 0x3fff) << 15) | (cz & 0x3fff) | 0x40000000; }

  /**
   * Bring the window to `camPos`. Cheap when the camera has not crossed a
   * cell boundary and there is no backlog.
   * @returns true if `items` changed this call
   */
  update(camPos: {x:number, z:number}): boolean {
    const c = this.cell;
    const cx = Math.floor(camPos.x / c), cz = Math.floor(camPos.z / c);
    let changed = false;

    if (cx !== this._pendCx || cz !== this._pendCz || this._first === undefined) {
      this._first = 1;
      this._pendCx = cx; this._pendCz = cz;
      // rebuild the wanted list, nearest first so the hole in front of the
      // camera fills before the one behind it
      const n = Math.ceil(this.radius / c);
      const want: any[] = [];
      for (let dz = -n; dz <= n; dz++) {
        for (let dx = -n; dx <= n; dx++) {
          const d2 = (dx * dx + dz * dz) * c * c;
          if (d2 > this.radius * this.radius) continue;
          const k = TileStream.key(cx + dx, cz + dz);
          if (this.live.has(k)) continue;
          want.push(d2, cx + dx, cz + dz);
        }
      }
      // insertion order by distance without allocating objects
      const tri = [];
      for (let i = 0; i < want.length; i += 3) tri.push(i);
      tri.sort((a, b) => want[a] - want[b]);
      this._pending = tri.map((i) => [want[i + 1], want[i + 2]]);

      // evict what fell out of the keep radius
      const ox = camPos.x, oz = camPos.z;
      for (const [k, arr] of this.live) {
        const kx = ((k >> 15) & 0x3fff), kz = (k & 0x3fff);
        const scx = kx > 0x1fff ? kx - 0x4000 : kx;
        const scz = kz > 0x1fff ? kz - 0x4000 : kz;
        const px = (scx + 0.5) * c - ox, pz = (scz + 0.5) * c - oz;
        if (px * px + pz * pz > this.keep2) { this.live.delete(k); changed = true; }
        else void arr;
      }
    }

    let made = 0;
    while (this._pending.length && made < this.budget) {
      const [gx, gz] = this._pending.shift();
      const k = TileStream.key(gx, gz);
      if (this.live.has(k)) continue;
      const out: any[] = [];
      this.gen(gx, gz, out);
      this.live.set(k, out);
      made++; changed = true;
    }

    if (changed) this.dirty = true;
    return changed;
  }

  /** True while cells are still queued — used to hold a shot until settled. */
  get settling() { return this._pending.length > 0; }

  /** Drain the whole backlog now. Used once at build time. */
  flush(camPos: THREE.Vector3, maxCells = 4000) {
    const b = this.budget;
    this.budget = maxCells;
    this.update(camPos);
    this.budget = b;
  }
}
