import * as THREE from 'three';
import { collectMeshes, objectBox } from './Harvest.ts';
import { RockField } from './RockField.ts';
import type { Game } from '../../game/Game.ts';
import type { Terrain } from '../Terrain.ts';
import type { BoxProxy } from './Harvest.ts';

/** Broadphase cell, metres. Small enough that a town cell holds tens of tris. */
const CELL = 2.5;
const INV_CELL = 1 / CELL;
/**
 * Second, coarse level. A mesa flank or a landmark's ground apron is one
 * triangle tens of metres across; inserting it into every 2.5 m cell it touches
 * is thousands of entries for a shape a character can only ever touch in one
 * place, and scanning them all from a flat overflow list costs more than the
 * fine grid saves. They get their own 40 m grid instead.
 */
const COARSE = CELL * 16;
const INV_COARSE = 1 / COARSE;
/** Cell index bias so the key packs into a positive 32-bit-ish integer. */
const KEY_OFF = 16384;
const cellKey = (ix: number, iz: number) => (ix + KEY_OFF) * 32768 + (iz + KEY_OFF);

/** cos of the steepest surface a character may stand on. */
const WALKABLE_Y = Math.cos(50 * Math.PI / 180);
/** Triangles below this get treated as ceilings and dropped entirely. */
const CEILING_Y = -0.35;
/** Anything whose lowest vertex is this far above local ground is unreachable. */
const REACH = 6.5;
/** Anything wholly this far under the terrain is backing geometry. */
const BURIED = 0.4;

/**
 * The static collision world: a triangle soup in a uniform XZ grid, split into
 * a *floor* set (things you stand on) and a *wall* set (things that stop you).
 *
 * The split is what makes this cheap. A ground query only ever walks floor
 * triangles and only ever does a 2-D point-in-triangle test; a wall query only
 * ever walks wall triangles and skips any whose top is inside the character's
 * step-up height — which is exactly why a kerb, a stair tread and the haven's
 * stepped rock are climbed rather than bumped into.
 *
 * Built **incrementally** off the first few frames, because the sources that
 * feed it (the town, the dungeons' entrances, the props) are constructed after
 * `Player.init` and a 100 ms harvest in one frame would show up as a hitch in
 * `src/tools/gameplay.mts`.
 *
 * Query API:
 *   groundAt(x, z, fromY, stepUp, stepDown) -> {y, nx, ny, nz, onProp}
 *   resolve(pos, radius, height, stepUp)    -> pushes pos out of walls
 *   blocked(x, z, feetY, radius, height, stepUp) -> boolean
 */
/** What a ground query answers: the support height and its normal. */
export interface GroundHit {
  y: number;
  nx: number;
  ny: number;
  nz: number;
  /** True when the support came from a prop rather than the heightfield. */
  onProp: boolean;
}

/** What the harvest built, for the dev overlay and `gameplay.mts`. */
export interface CollisionStats {
  floorTris: number;
  wallTris: number;
  rockProxies: number;
  /** Wall-clock milliseconds the incremental harvest took in total. */
  buildMs: number;
  /** Floor and wall triangles contributed, per source name. */
  sources: Record<string, { floor: number, wall: number }>;
  cells?: number;
  coarseCells?: number;
}

/** Cell key -> indices of the triangles overlapping it. */
type TriGrid = Map<number, Int32Array>;

export class CollisionWorld {
  /** Oriented-box proxies for the things that move. */
  _dyn!: BoxProxy[];
  /** Reused answer for `groundAt`, so a query per frame allocates nothing. */
  _ground!: GroundHit;
  /** The incremental harvest, or null when it is not running. */
  _job!: Generator<void, void> | null;
  _n!: THREE.Vector3;
  _t0!: number;
  _v!: THREE.Vector3;
  enabled!: boolean;
  floor!: Float32Array;
  floorCoarse!: TriGrid;
  floorGrid!: TriGrid;
  floorN!: Float32Array;
  game!: Game;
  ready!: boolean;
  /**
   * The boulders, which are **not** in the baked soup and never could be.
   *
   * Everything else this class holds is harvested once off the first few frames
   * and is then static for the session. Rocks stream: `Rocks.stream` and
   * `Rocks.outcrops` generate and drop cells around the camera forever, so a
   * one-shot harvest could only collide the boulders near spawn — which is
   * exactly what `Harvest.collectRockProxies` was, and it returned `[]` for its
   * whole life. `RockField` answers them per stream cell instead.
   */
  rocks!: RockField;
  /**
   * Ablation knob for the boulder push-out — `probes/rockwalk.mts` runs the
   * same route with it off to get the paired before.
   */
  rockPush!: boolean;
  stats!: CollisionStats;
  terrain!: Terrain | null;
  wall!: Float32Array;
  wallCoarse!: TriGrid;
  wallGrid!: TriGrid;
  wallN!: Float32Array;
  constructor() {
    this.ready = false;
    this.enabled = true;
    /** Populated once the harvest finishes. */
    this.stats = { floorTris: 0, wallTris: 0, rockProxies: 0, buildMs: 0, sources: {} };
    this._ground = { y: 0, nx: 0, ny: 1, nz: 0, onProp: false };
    this._dyn = [];
    this._v = new THREE.Vector3();
    this._n = new THREE.Vector3();
    this.rocks = new RockField();
    this.rockPush = true;
  }

  init(game: Game) {
    if (this.game) return this;
    this.game = game;
    this.rocks.init(game);
    this.terrain = game.get('Terrain') ?? null;
    this._job = null;
    this._t0 = 0;
    return this;
  }

  /**
   * Do up to `budgetMs` of harvesting. Safe (and free) to call every frame.
   * @returns true once the world is queryable
   */
  ensure(budgetMs: number = 4): boolean {
    if (this.ready || !this.game) return this.ready;
    const t = performance.now();
    if (!this._job) { this._job = this._startJob(); this._t0 = t; }
    const deadline = t + budgetMs;
    while (performance.now() < deadline) {
      if (this._job.next().done) {
        this.stats.buildMs = +(performance.now() - this._t0).toFixed(1);
        this.ready = true;
        this._job = null;
        return true;
      }
    }
    return false;
  }

  /* ------------------------------------------------------------- harvesting */

  * _startJob() {
    const game = this.game;
    const terrain = this.terrain;
    const floors: number[] = [];
    const walls: number[] = [];
    const wallMeta: number[] = [];               // nx, ny, nz, yMax per wall triangle
    const floorMeta: number[] = [];              // nx, ny, nz, d  (plane) per floor tri
    const sources = this.stats.sources;

    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), n = new THREE.Vector3();

    const emit = (source: string) => {
      // classify + cull the triangle sitting in a/b/c
      e1.subVectors(b, a); e2.subVectors(c, a);
      n.crossVectors(e1, e2);
      const len = n.length();
      if (len < 1e-7) return;
      n.multiplyScalar(1 / len);
      if (n.y < CEILING_Y) return;
      const yMin = Math.min(a.y, b.y, c.y);
      const yMax = Math.max(a.y, b.y, c.y);
      const cx = (a.x + b.x + c.x) / 3, cz = (a.z + b.z + c.z) / 3;
      // no heightfield means nothing to bury a triangle against; keep it
      const g = terrain ? terrain.heightAt(cx, cz) : -Infinity;
      if (yMax < g - BURIED) return;
      if (yMin > g + REACH) return;
      const rec = sources[source] || (sources[source] = { floor: 0, wall: 0 });
      if (n.y >= WALKABLE_Y) {
        floors.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        floorMeta.push(n.x, n.y, n.z, n.x * a.x + n.y * a.y + n.z * a.z);
        rec.floor++;
      } else {
        walls.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        wallMeta.push(n.x, n.y, n.z, yMax);
        rec.wall++;
      }
    };

    // ---- 1. merged static meshes ------------------------------------------
    const meshes = collectMeshes(game);
    for (const { mesh, source } of meshes) {
      const geo = mesh.geometry;
      const p = geo.attributes.position;
      const idx = geo.index;
      const total = idx ? idx.count : p.count;
      const mw = mesh.matrixWorld;
      for (let i = 0; i < total; i += 3) {
        const i0 = idx ? idx.getX(i) : i;
        const i1 = idx ? idx.getX(i + 1) : i + 1;
        const i2 = idx ? idx.getX(i + 2) : i + 2;
        a.fromBufferAttribute(p, i0).applyMatrix4(mw);
        b.fromBufferAttribute(p, i1).applyMatrix4(mw);
        c.fromBufferAttribute(p, i2).applyMatrix4(mw);
        emit(source);
        if ((i % 1200) === 0) yield;
      }
      yield;
    }

    // ---- 2. the boulders are NOT harvested here ---------------------------
    // They stream. See `this.rocks` (`RockField`), queried per stream cell from
    // `_resolvePass`. `stats.rockProxies` now reports what that cache holds
    // rather than the 0 the dead `collectRockProxies` reported for its whole
    // life; it is a live number, so it moves as the player moves.

    // ---- 3. the parked Regalia and anything else that moves ---------------
    this._dyn = [];
    const props = game.get('Props');
    const reg = game.get('Regalia');
    for (const obj of [props && props.regalia, reg && reg.root]) {
      const box = objectBox(obj, 0.94);
      if (box) this._dyn.push(box);
    }
    yield;

    // ---- 4. bake the grids ------------------------------------------------
    this.floor = new Float32Array(floors);
    floors.length = 0;
    yield;
    this.floorN = new Float32Array(floorMeta);
    yield;
    this.wall = new Float32Array(walls);
    walls.length = 0;
    yield;
    this.wallN = new Float32Array(wallMeta);
    yield;
    this.stats.floorTris = this.floor.length / 9;
    this.stats.wallTris = this.wall.length / 9;

    const f = yield* this._grid(this.floor);
    this.floorGrid = f.grid; this.floorCoarse = f.coarse;
    const w = yield* this._grid(this.wall);
    this.wallGrid = w.grid; this.wallCoarse = w.coarse;
    this.stats.cells = f.grid.size + w.grid.size;
    this.stats.coarseCells = f.coarse.size + w.coarse.size;
  }

  /**
   * Bucket a triangle array into a two-level sparse uniform grid.
   */
  * _grid(tri: Float32Array): Generator<void, {grid: TriGrid, coarse: TriGrid}> {
    const SPAN = 16;
    const fine = new Map<number, number[]>();
    const big = new Map<number, number[]>();
    const n = tri.length / 9;
    let work = 0;
    for (let t = 0; t < n; t++) {
      const o = t * 9;
      const x0 = Math.min(tri[o], tri[o + 3], tri[o + 6]);
      const x1 = Math.max(tri[o], tri[o + 3], tri[o + 6]);
      const z0 = Math.min(tri[o + 2], tri[o + 5], tri[o + 8]);
      const z1 = Math.max(tri[o + 2], tri[o + 5], tri[o + 8]);
      const wide = (x1 - x0) > SPAN * CELL || (z1 - z0) > SPAN * CELL;
      const inv = wide ? INV_COARSE : INV_CELL;
      const into = wide ? big : fine;
      const ix0 = Math.floor(x0 * inv), ix1 = Math.min(Math.floor(x1 * inv), Math.floor(x0 * inv) + SPAN);
      const iz0 = Math.floor(z0 * inv), iz1 = Math.min(Math.floor(z1 * inv), Math.floor(z0 * inv) + SPAN);
      for (let ix = ix0; ix <= ix1; ix++) {
        for (let iz = iz0; iz <= iz1; iz++) {
          const k = cellKey(ix, iz);
          const list = into.get(k);
          if (list) list.push(t); else into.set(k, [t]);
          work++;
        }
      }
      if (work > 3000) { work = 0; yield; }
    }
    const bake = function* (src: Map<number, number[]>): Generator<void, TriGrid> {
      const out: TriGrid = new Map();
      let i = 0;
      for (const [k, list] of src) {
        out.set(k, Int32Array.from(list));
        if (((i++) & 1023) === 0) yield;
      }
      return out;
    };
    const grid = yield* bake(fine);
    const coarse = yield* bake(big);
    yield;
    return { grid, coarse };
  }

  /* ---------------------------------------------------------------- queries */

  /**
   * The surface a character standing at (x, z) is supported by.
   *
   * Prefers the *highest* prop surface within reach of the feet, so standing on
   * the haven platform, the town's graded pad or a boulder works; falls back to
   * the terrain heightfield (which `Dungeons` redirects to the dungeon floor).
   *
   * @param fromY current feet height
   * @param stepUp how far up a surface may be and still support
   * @param stepDown how far down to look before it counts as a drop
   */
  groundAt(x: number, z: number, fromY: number, stepUp: number = 0.45, stepDown: number = 2.0): {y:number, nx:number, ny:number, nz:number, onProp:boolean} {
    const g = this._ground;
    const t = this.terrain;
    g.y = t ? t.heightAt(x, z) : 0;
    g.onProp = false;
    if (t) { t.normalAt(x, z, this._n); g.nx = this._n.x; g.ny = this._n.y; g.nz = this._n.z; }
    else { g.nx = 0; g.ny = 1; g.nz = 0; }
    if (!this.ready || !this.enabled) return g;

    const hi = fromY + stepUp;
    const lo = fromY - stepDown;
    const tri = this.floor, meta = this.floorN;
    const cell = this.floorGrid.get(cellKey(Math.floor(x * INV_CELL), Math.floor(z * INV_CELL)));
    const big = this.floorCoarse.get(cellKey(Math.floor(x * INV_COARSE), Math.floor(z * INV_COARSE)));
    for (let pass = 0; pass < 2; pass++) {
      const list = pass === 0 ? cell : big;
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const t3 = list[i], o = t3 * 9, m = t3 * 4;
        const ny = meta[m + 1];
        if (ny < 1e-3) continue;
        const y = (meta[m + 3] - meta[m] * x - meta[m + 2] * z) / ny;
        if (y > hi || y < lo || y <= g.y) continue;
        if (!inTri2D(x, z, tri[o], tri[o + 2], tri[o + 3], tri[o + 5], tri[o + 6], tri[o + 8])) continue;
        g.y = y; g.nx = meta[m]; g.ny = ny; g.nz = meta[m + 2]; g.onProp = true;
      }
    }
    return g;
  }

  /**
   * `groundAt` over the character's whole footprint, keeping the highest
   * support. Sampling a single point drops a character off a platform the
   * moment their centre crosses the lip; sampling the disc keeps them on it
   * until their feet genuinely leave.
   */
  groundDisc(x: number, z: number, fromY: number, radius: number, stepUp = 0.45, stepDown = 2.0, out: GroundHit = { y: 0, nx: 0, ny: 1, nz: 0, onProp: false }): GroundHit {
    const g = this.groundAt(x, z, fromY, stepUp, stepDown);
    out.y = g.y; out.nx = g.nx; out.ny = g.ny; out.nz = g.nz; out.onProp = g.onProp;
    if (!this.ready || !this.enabled) return out;
    const r = radius * 0.72;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI * 0.5 + Math.PI * 0.25;
      const s = this.groundAt(x + Math.cos(a) * r, z + Math.sin(a) * r, fromY, stepUp, stepDown);
      if (s.onProp && s.y > out.y) {
        out.y = s.y; out.nx = s.nx; out.ny = s.ny; out.nz = s.nz; out.onProp = true;
      }
    }
    return out;
  }

  /**
   * Push a character capsule out of every wall it overlaps.
   *
   * Walls whose top is within `stepUp` of the feet are ignored outright — that
   * is the step-up rule, and it is what turns a stair riser from an obstacle
   * into a floor the ground query then finds.
   *
   * @param pos feet position, mutated in place
   * @returns total horizontal correction applied, metres
   */
  resolve(pos: THREE.Vector3, radius: number, height: number, stepUp: number): number {
    if (!this.enabled) return this._resolveDynamic(pos, radius, height, stepUp);
    let moved = 0;
    for (let pass = 0; pass < 3; pass++) {
      const d = this._resolvePass(pos, radius, height, stepUp);
      moved += d;
      if (d < 1e-4) break;
    }
    return moved + this._resolveDynamic(pos, radius, height, stepUp);
  }

  _resolvePass(pos: THREE.Vector3, radius: number, height: number, stepUp: number) {
    // The boulders do not wait for the harvest: `RockField` reads the live
    // stream, so it answers from the first frame, which is also the frame a
    // den can already have spawned a voretooth standing inside a tor.
    let rock = 0;
    if (this.rockPush) {
      rock = this.rocks.push(pos, radius, height, stepUp);
      // Live, not baked: it moves as the player moves, and it is the number
      // that read 0 for the whole life of the stub this replaced.
      this.stats.rockProxies = this.rocks.proxies;
    }
    if (!this.ready) return rock;
    const tri = this.wall, meta = this.wallN, grid = this.wallGrid;
    const ax = pos.x, az = pos.z;
    const ay0 = pos.y + Math.min(0.18, stepUp * 0.4);
    const ay1 = pos.y + height;
    const skipTop = pos.y + stepUp;
    const ix0 = Math.floor((ax - radius) * INV_CELL), ix1 = Math.floor((ax + radius) * INV_CELL);
    const iz0 = Math.floor((az - radius) * INV_CELL), iz1 = Math.floor((az + radius) * INV_CELL);
    let total = 0;
    const sweep = (list: ArrayLike<number>) => {
      for (let i = 0; i < list.length; i++) {
        const t3 = list[i], o = t3 * 9, m = t3 * 4;
        if (meta[m + 3] <= skipTop) continue;                 // steppable
        if (Math.min(tri[o + 1], tri[o + 4], tri[o + 7]) >= ay1) continue;
        total += pushOut(pos, radius, ay0, ay1, tri, o, meta[m], meta[m + 1], meta[m + 2]);
      }
    };
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const list = grid.get(cellKey(ix, iz));
        if (list) sweep(list);
      }
    }
    const big = this.wallCoarse.get(cellKey(Math.floor(ax * INV_COARSE), Math.floor(az * INV_COARSE)));
    if (big) sweep(big);
    return total + rock;
  }

  /** Oriented-box proxies for the two Regalias, tested in the box's own frame. */
  _resolveDynamic(pos: THREE.Vector3, radius: number, height: number, stepUp: number) {
    let total = 0;
    for (const b of this._dyn) {
      const obj = b.obj;
      // `_dyn` is only ever filled from `objectBox`, which carries the object
      if (!obj || !obj.visible || !obj.parent) continue;
      obj.updateMatrixWorld();
      const mw = obj.matrixWorld.elements;
      // world -> local, assuming the object carries only rotation/translation
      const dx = pos.x - mw[12], dy = pos.y - mw[13], dz = pos.z - mw[14];
      const lx = dx * mw[0] + dy * mw[1] + dz * mw[2] - b.cx;
      const ly = dx * mw[4] + dy * mw[5] + dz * mw[6] - b.cy;
      const lz = dx * mw[8] + dy * mw[9] + dz * mw[10] - b.cz;
      if (ly + stepUp >= b.hy || ly + height <= -b.hy) continue;
      const ox = b.hx + radius - Math.abs(lx);
      const oz = b.hz + radius - Math.abs(lz);
      if (ox <= 0 || oz <= 0) continue;
      let px = 0, pz = 0;
      if (ox < oz) px = Math.sign(lx || 1) * ox; else pz = Math.sign(lz || 1) * oz;
      pos.x += px * mw[0] + pz * mw[8];
      pos.z += px * mw[2] + pz * mw[10];
      total += Math.abs(px) + Math.abs(pz);
    }
    return total;
  }

  /**
   * Would a capsule at (x, z) be inside a wall? Used by the companions' steering
   * to pick a way round rather than a way through.
   */
  blocked(x: number, z: number, feetY: number, radius: number, height: number, stepUp: number): boolean {
    if (!this.enabled) return false;
    this._v.set(x, feetY, z);
    const before = this._v.x + this._v.z;
    this._resolvePass(this._v, radius, height, stepUp);
    return Math.abs(this._v.x + this._v.z - before) > 1e-4;
  }
}

/* ------------------------------------------------------------------ helpers */

/** 2-D point-in-triangle, XZ plane. */
function inTri2D(px: number, pz: number, ax: number, az: number, bx: number, bz: number, cx: number, cz: number) {
  const d1 = (px - bx) * (az - bz) - (ax - bx) * (pz - bz);
  const d2 = (px - cx) * (bz - cz) - (bx - cx) * (pz - cz);
  const d3 = (px - ax) * (cz - az) - (cx - ax) * (pz - az);
  const neg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const posi = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(neg && posi);
}

const _p = new THREE.Vector3();
const _c = new THREE.Vector3();
const _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vc = new THREE.Vector3();
const _ab = new THREE.Vector3(), _ac = new THREE.Vector3(), _ap = new THREE.Vector3();
const _bp = new THREE.Vector3(), _cp = new THREE.Vector3(), _bc = new THREE.Vector3();

/**
 * Push a vertical capsule segment [y0, y1] at (pos.x, pos.z) out of one
 * triangle, horizontally. Returns the distance moved.
 */
function pushOut(pos: THREE.Vector3, radius: number, y0: number, y1: number, tri: Float32Array, o: number, nx: number, ny: number, nz: number) {
  _va.set(tri[o], tri[o + 1], tri[o + 2]);
  _vb.set(tri[o + 3], tri[o + 4], tri[o + 5]);
  _vc.set(tri[o + 6], tri[o + 7], tri[o + 8]);

  // The capsule axis is vertical, so the nearest axis point to the triangle is
  // just the triangle's own height clamped into [y0, y1].
  const ty = (_va.y + _vb.y + _vc.y) / 3;
  _p.set(pos.x, Math.min(y1, Math.max(y0, ty)), pos.z);
  closestOnTriangle(_p, _va, _vb, _vc, _c);
  // re-clamp against the actual contact height for slanted faces
  const py = Math.min(y1, Math.max(y0, _c.y));
  if (py !== _p.y) {
    _p.y = py;
    closestOnTriangle(_p, _va, _vb, _vc, _c);
  }

  const dx = _p.x - _c.x, dy = _p.y - _c.y, dz = _p.z - _c.z;
  if (dx * dx + dy * dy + dz * dz >= radius * radius) return 0;

  // Which side of the face is the capsule on? Behind it means we already
  // tunnelled, and only the plane normal knows the way back out.
  const s = nx * (_p.x - _va.x) + ny * (_p.y - _va.y) + nz * (_p.z - _va.z);
  const dh = Math.hypot(dx, dz);
  let ux, uz, pen;
  if (s < -0.005) {
    ux = nx; uz = nz; pen = radius - s;
  } else if (dh < 1e-4) {
    ux = nx; uz = nz; pen = radius;
  } else {
    // Horizontal penetration only. Taking the 3-D distance here inflates the
    // correction for any contact that is mostly above or below the sample and
    // makes a character bounce off the seam between two triangles of the same
    // wall — which then reads as jitter, and hides genuine blocking.
    ux = dx / dh; uz = dz / dh;
    pen = Math.sqrt(Math.max(0, radius * radius - dy * dy)) - dh;
  }
  if (pen <= 1e-5) return 0;
  const hl = Math.hypot(ux, uz);
  if (hl < 0.12) return 0;                    // near-horizontal face: not a wall
  ux /= hl; uz /= hl;
  pen = Math.min(pen, 0.5);
  pos.x += ux * pen;
  pos.z += uz * pen;
  return pen;
}

/** Closest point on a triangle to a point (Ericson, Real-Time Collision Detection). */
function closestOnTriangle(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, out: THREE.Vector3) {
  _ab.subVectors(b, a); _ac.subVectors(c, a); _ap.subVectors(p, a);
  const d1 = _ab.dot(_ap), d2 = _ac.dot(_ap);
  if (d1 <= 0 && d2 <= 0) return out.copy(a);

  _bp.subVectors(p, b);
  const d3 = _ab.dot(_bp), d4 = _ac.dot(_bp);
  if (d3 >= 0 && d4 <= d3) return out.copy(b);

  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return out.copy(a).addScaledVector(_ab, v);
  }

  _cp.subVectors(p, c);
  const d5 = _ab.dot(_cp), d6 = _ac.dot(_cp);
  if (d6 >= 0 && d5 <= d6) return out.copy(c);

  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return out.copy(a).addScaledVector(_ac, w);
  }

  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
    const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
    return out.copy(b).addScaledVector(_bc.subVectors(c, b), w);
  }

  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  return out.copy(a).addScaledVector(_ab, v).addScaledVector(_ac, w);
}

export { WALKABLE_Y };
