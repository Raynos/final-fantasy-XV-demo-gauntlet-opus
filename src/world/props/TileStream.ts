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
/**
 * @typeParam T what one scattered item is. The stream never looks inside one:
 *   it only hands the generator an array to fill and keeps the arrays keyed by
 *   cell, so the layer that owns the items keeps its own type all the way
 *   through `live`.
 */
export class TileStream<T> {
  _first!: number;
  _pendCx!: number;
  _pendCz!: number;
  /** Cells still queued to generate, nearest first, as `[cx, cz]`. */
  _pending!: [number, number][];
  /** True only inside {@link TileStream.flush}: both budgets are then ignored. */
  _unbounded!: boolean;
  budget!: number;
  /**
   * Wall-clock ceiling on one `update`, milliseconds; 0 disables it.
   *
   * **A cell count cannot bound a cost.** `budget: 12` was written when a rock
   * cell was a jittered lattice at 0.1 ms; the Matern cluster sampler that
   * replaced it costs 0.34 ms, so the same twelve cells went from 1.2 ms to
   * 4.1 ms of frame without one number in the file changing. Measured on
   * `streaming-traverse`: rock cell generation 0.77 -> 2.56 ms per frame across
   * the identical 1368 cells (`src/tools/probes/perftile.mts`, run against the
   * certified baseline with `--build`). A millisecond budget is the only kind
   * that survives somebody making a cell dearer.
   *
   * The count stays as the *other* cap, because a budget of pure wall clock
   * would let a machine having a good second generate a hundred cells and a
   * capture depend on how fast the box was. Determinism is protected properly
   * by {@link Props.converge}, which flushes every stream before a posed shot
   * so no capture depends on either budget.
   */
  budgetMs!: number;
  cell!: number;
  dirty!: boolean;
  gen!: (cx: number, cz: number, out: T[]) => void;
  keep2!: number;
  /** Live cells, keyed by {@link TileStream.key}. */
  live!: Map<number, T[]>;
  radius!: number;
  constructor({ cell, radius, gen, budget = 20, budgetMs = 0, keep = 1.22 }: { cell: number, radius: number, gen: (cx: number, cz: number, out: T[]) => void, budget?: number, budgetMs?: number, keep?: number }) {
    this.cell = cell;
    this.radius = radius;
    this.gen = gen;
    this.budget = budget;
    this.budgetMs = budgetMs;
    this.keep2 = (radius * keep) * (radius * keep);
    this.live = new Map();
    this.dirty = false;
    this._unbounded = false;
    this._pending = [];
    this._pendCx = 0; this._pendCz = 0;
  }

  static key(cx: number, cz: number) { return ((cx & 0x3fff) << 15) | (cz & 0x3fff) | 0x40000000; }

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
      const want: number[] = [];
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
      this._pending = tri.map((i): [number, number] => [want[i + 1], want[i + 2]]);

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

    // Both caps, and the *first* one to bite wins. The deadline is read once,
    // before any generation, and checked after each cell so at least one cell
    // always lands: a stream that could never make progress would never fill.
    const deadline = this._unbounded || !this.budgetMs ? Infinity : performance.now() + this.budgetMs;
    let made = 0;
    while (made < this.budget) {
      const next = this._pending.shift();
      if (!next) break;
      const [gx, gz] = next;
      const k = TileStream.key(gx, gz);
      if (this.live.has(k)) continue;
      const out: T[] = [];
      this.gen(gx, gz, out);
      this.live.set(k, out);
      made++; changed = true;
      if (performance.now() > deadline) break;
    }

    if (changed) this.dirty = true;
    return changed;
  }

  /** True while cells are still queued — used to hold a shot until settled. */
  get settling() { return this._pending.length > 0; }

  /**
   * Drain the whole backlog now. Used at build time and from
   * {@link Props.converge}, which is what keeps a posed capture independent of
   * either budget — and therefore of the machine.
   */
  flush(camPos: { x: number, z: number }, maxCells = 4000) {
    const b = this.budget;
    this.budget = maxCells;
    this._unbounded = true;
    try { this.update(camPos); } finally { this.budget = b; this._unbounded = false; }
  }
}
