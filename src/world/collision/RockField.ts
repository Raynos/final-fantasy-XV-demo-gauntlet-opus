import * as THREE from 'three';
import { placedScale } from '../props/Rocks.ts';
import { TileStream } from '../props/TileStream.ts';
import type { Rocks } from '../props/Rocks.ts';
import type { StoneKind } from '../props/ZoneDress.ts';
import type { Game } from '../../game/Game.ts';

/**
 * Boulders, as something a character cannot walk into.
 *
 * **Why this exists, and why it is not in `Harvest`.** The blind playtest's
 * number-one complaint was "my whole screen became a wall of blurred brown
 * mud — no character, no enemy, no horizon", and lane 12a found the frame it
 * came from and then found the literal cause underneath it: the fight was
 * inside a rock, and so was Noctis. `probes/fightcam.mts` measured **his own
 * chest inside a boulder on 31.5% of combat frames**, and 64% / 58% / 93% /
 * 100% in the four fights that happened in a tor. That is not a camera bug.
 * Nothing in this project has ever stopped a character entering a boulder:
 * `Harvest.collectRockProxies` returned `[]` from the day it was written and
 * `CollisionWorld.stats.rockProxies` read 0 in a live page.
 *
 * The reason it cannot simply be un-stubbed is timing, not typing.
 * `CollisionWorld` bakes a **static** triangle soup off the first few frames.
 * Rocks are **streamed**: `Rocks.stream` (56 m cells) and `Rocks.outcrops`
 * (176 m cells) generate and drop cells around the camera for the whole life of
 * the session, so a harvest that runs once at boot could only ever collide the
 * handful of boulders that happened to be near spawn — and would then hold
 * stale geometry for every other boulder in an 8 km world. The rock half has to
 * be *queried*, not baked.
 *
 * **The shape.** `CameraOccluders` is the working precedent and this reuses its
 * finding: the proxy is the placed hull's own **ellipsoid**, semi-axes
 * `s * j{x,y,z} * ext[0..2]` in the instance's rotated frame, read through
 * {@link placedScale} — the same function `Rocks.update` composes its instance
 * matrices through, so the proxy is the hull the renderer draws and not the
 * recipe it was drawn from. A bounding *sphere* is far too fat to walk beside:
 * `hullExtents` measures vertical half-extents from 0.447 (`slab`) to 0.988
 * (`spire`), so a slab's bounding sphere is 2.2x its own thickness and a
 * character would be held a metre off a flat rock. `probes/camproxy.mts` grades
 * the ellipsoid against the drawn `InstancedMesh` triangles at **99.08%
 * agreement, 0.00% mesh-only** — it never misses a rock the renderer draws,
 * which is the property that matters here too.
 *
 * **The window.** Not a window: a **per-stream-cell cache**. `CameraOccluders`
 * keeps one focus-centred window because the lens is one point; characters are
 * not — the player, three party members, a den of enemies, a chocobo and any
 * NPC all query this, and they are not within one arm of each other. So
 * proxies are built lazily for a whole stream cell the first time a query
 * touches it, bucketed into {@link SUB}-metre sub-cells, and held until the
 * stream drops the cell. Cache validity is the *identity* of the live array:
 * `TileStream` hands out a fresh array per generated cell and deletes the entry
 * when the cell leaves, so `live.get(key) === cached.arr` is an exact test with
 * no versioning to keep in step.
 */
export class RockField {
  /** Per stream cell, keyed by {@link TileStream.key}. */
  _cells = new Map<number, CellProxies>();
  _rocks: Rocks | null = null;
  _game: Game | null = null;
  /** Cells built since boot, and the wall clock of the last build, ms. */
  builds = 0;
  lastMs = 0;
  /** Proxies held by the cache right now — the memory, in one number. */
  proxies = 0;
  /** Push-outs applied since boot: the only proof this is doing anything. */
  hits = 0;

  init(game: Game) { this._game = game; return this; }

  /** The `Rocks` system, once `Props` has built it. `Props` owns the instance. */
  _get(): Rocks | null {
    if (this._rocks) return this._rocks;
    const props = this._game?.get('Props');
    this._rocks = props?.rocks ?? null;
    return this._rocks;
  }

  /**
   * Proxies for one stream cell, built on first touch and cached against the
   * identity of the live array they came from.
   */
  _cell(live: Map<number, unknown[]>, which: number, cx: number, cz: number): CellProxies | null {
    const raw = TileStream.key(cx, cz);
    // **The two streams share a coordinate space and therefore share a key.**
    // Boulder cell (2, 3) and outcrop cell (2, 3) both hash to the same
    // `TileStream.key`, so a cache keyed on it alone has the two evicting each
    // other on every alternating query: measured 2616 rebuilds of ~137 distinct
    // cells in one sweep, nineteen apiece, all of them correct and all of them
    // wasted. `which` is the stream.
    const key = which * 0x80000000 + raw;
    const arr = live.get(raw);
    if (!arr) { if (this._cells.has(key)) this._drop(key); return null; }
    const got = this._cells.get(key);
    if (got && got.arr === arr) return got;
    if (got) this._drop(key);
    const built = this._build(arr as RockLike[]);
    built.raw = raw;
    built.live = live;
    this._cells.set(key, built);
    this.proxies += built.count;
    // The cache only ever holds what something has walked past, so it is small;
    // this is a leak stop, not a policy. Each record carries the `live` map it
    // came from, because pruning one stream's cells against the other stream's
    // live set is how the eviction storm above started.
    if (this._cells.size > MAX_CELLS) this._prune();
    return built;
  }

  _drop(key: number) {
    const old = this._cells.get(key);
    if (old) { this.proxies -= old.count; this._cells.delete(key); }
  }

  _prune() {
    for (const [key, rec] of [...this._cells]) {
      if (rec.live && rec.live.get(rec.raw) !== rec.arr) this._drop(key);
    }
  }

  /**
   * Pack one cell's boulders into ellipsoid proxies plus a sub-cell index.
   *
   * The per-axis half-extents are stored in world space alongside the local
   * frame ({@link hx}, {@link hy}, {@link hz} on the record) because every
   * query rejects on them first and a rejected proxy must not cost a rotate.
   */
  _build(arr: RockLike[]): CellProxies {
    const t0 = performance.now();
    const rocks = this._rocks;
    const data: number[] = [];
    const cells = new Map<number, number[]>();
    let n = 0;
    for (let i = 0; i < arr.length; i++) {
      const it = arr[i];
      const ex = (rocks && rocks.ext.get(it.k)) ?? UNIT;
      const ps = placedScale(ex, it.s, it.sx, it.sy, it.sz, it.bury);
      const ax = it.s * ps.jx * ex[0], ay = it.s * ps.jy * ex[1], az = it.s * ps.jz * ex[2];
      // Ankle-high scree is stepped over, not walked round. Colliding with it
      // would only make a walk twitch — the same idea as the dead harvest's
      // 0.34 m knee-high cull, set at a walker's scale rather than a lens's.
      if (Math.max(ax, ay, az) < MIN_R) continue;
      const px = it.x - it.nx * ps.sink;
      const py = it.y - it.ny * ps.sink;
      const pz = it.z - it.nz * ps.sink;
      _e.set(it.pitch, it.yaw, it.roll);
      _m.makeRotationFromEuler(_e);
      const e = _m.elements;
      // World half-extents: the ellipsoid's support along each world axis is
      // the norm of that ROW of `R * diag(a, b, c)`.
      const hx = Math.hypot(ax * e[0], ay * e[4], az * e[8]);
      const hy = Math.hypot(ax * e[1], ay * e[5], az * e[9]);
      const hz = Math.hypot(ax * e[2], ay * e[6], az * e[10]);
      const o = n * STRIDE;
      data[o] = px; data[o + 1] = py; data[o + 2] = pz;
      data[o + 3] = ax; data[o + 4] = ay; data[o + 5] = az;
      // `elements` is column-major, so reading it in this order IS the
      // transpose, which for a rotation is the inverse.
      data[o + 6] = e[0]; data[o + 7] = e[1]; data[o + 8] = e[2];
      data[o + 9] = e[4]; data[o + 10] = e[5]; data[o + 11] = e[6];
      data[o + 12] = e[8]; data[o + 13] = e[9]; data[o + 14] = e[10];
      data[o + 15] = hx; data[o + 16] = hy; data[o + 17] = hz;
      // Index into every sub-cell the footprint touches, so a query looks at
      // one bucket and not at a whole 56 m tile of boulder field.
      const ix0 = Math.floor((px - hx) / SUB), ix1 = Math.floor((px + hx) / SUB);
      const iz0 = Math.floor((pz - hz) / SUB), iz1 = Math.floor((pz + hz) / SUB);
      for (let ix = ix0; ix <= ix1; ix++) {
        for (let iz = iz0; iz <= iz1; iz++) {
          const k = subKey(ix, iz);
          const list = cells.get(k);
          if (list) list.push(n); else cells.set(k, [n]);
        }
      }
      n++;
    }
    const grid = new Map<number, Int32Array>();
    for (const [k, list] of cells) grid.set(k, Int32Array.from(list));
    this.builds++;
    this.lastMs = performance.now() - t0;
    return { arr, raw: 0, live: null, data: new Float32Array(data), count: n, grid, mark: new Int32Array(n), stamp: 0 };
  }

  /**
   * Run `fn` over every proxy whose world AABB is within `pad` of (x, z).
   *
   * Both streams are walked, because a tor lives in `outcrops` and a boulder in
   * `stream`, and a character can be standing against one of each.
   */
  _near(x: number, z: number, pad: number, fn: (d: Float32Array, o: number) => void) {
    const rocks = this._get();
    if (!rocks) return;
    const stamp = ++_stamp;
    const ix0 = Math.floor((x - pad) / SUB), ix1 = Math.floor((x + pad) / SUB);
    const iz0 = Math.floor((z - pad) / SUB), iz1 = Math.floor((z + pad) / SUB);
    for (let s = 0; s < 2; s++) {
      const st = s === 0 ? rocks.stream : rocks.outcrops;
      const live = st.live as unknown as Map<number, unknown[]>;
      const cell = st.cell;
      const cx0 = Math.floor((x - pad) / cell), cx1 = Math.floor((x + pad) / cell);
      const cz0 = Math.floor((z - pad) / cell), cz1 = Math.floor((z + pad) / cell);
      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cz = cz0; cz <= cz1; cz++) {
          const c = this._cell(live, s, cx, cz);
          if (!c || !c.count) continue;
          for (let ix = ix0; ix <= ix1; ix++) {
            for (let iz = iz0; iz <= iz1; iz++) {
              const list: Int32Array | undefined = c.grid.get(subKey(ix, iz));
              if (!list) continue;
              for (let i = 0; i < list.length; i++) {
                // A proxy wider than `SUB` sits in several buckets and the
                // query reads several: without the stamp its push is applied
                // twice and a character beside a tor is thrown clear of it.
                const j = list[i];
                if (c.mark[j] === stamp) continue;
                c.mark[j] = stamp;
                fn(c.data, j * STRIDE);
              }
            }
          }
        }
      }
    }
  }

  /**
   * Push a vertical capsule out of every boulder it is inside, horizontally.
   *
   * The step-up rule is the wall soup's, deliberately: a proxy whose crown is
   * within `stepUp` of the feet is *not* an obstacle, it is a kerb, and
   * colliding with it would stop a character dead at the foot of every piece of
   * scree in Leide. Everything taller is a wall.
   *
   * The escape is solved **horizontally** rather than along the ellipsoid's
   * gradient, for the reason `pushOut` gives about wall triangles: a correction
   * that is mostly vertical, applied to a walker who cannot move vertically,
   * either does nothing or reads as jitter. The gradient is used only to choose
   * the *direction*; the distance is the real ray-to-surface length along it.
   *
   * @param pos feet position, mutated in place
   * @returns total horizontal correction applied, metres
   */
  push(pos: THREE.Vector3, radius: number, height: number, stepUp: number): number {
    const ay0 = pos.y + Math.min(0.18, stepUp * 0.4);
    const ay1 = pos.y + height;
    const skipTop = pos.y + stepUp;
    let total = 0;
    // The bucket range is fixed from `pos` as it was on entry, and `pos` moves
    // underneath it as proxies push. That is deliberate and matches the wall
    // soup: `CollisionWorld.resolve` runs this pass up to three times and stops
    // when a pass moves less than 0.1 mm, so a correction that carries the
    // capsule into a new bucket is picked up by the next pass rather than by a
    // re-query inside this one.
    this._near(pos.x, pos.z, radius + PAD, (d, o) => {
      const cy = d[o + 1];
      if (cy + d[o + 16] <= skipTop) return;            // steppable: a kerb
      if (cy - d[o + 16] >= ay1) return;                // overhead: not a wall
      const ax = d[o + 3] + radius, ay = d[o + 4] + radius, az = d[o + 5] + radius;
      const dx = pos.x - d[o], dz = pos.z - d[o + 2];
      if (Math.abs(dx) > d[o + 15] + radius || Math.abs(dz) > d[o + 17] + radius) return;
      // The widest cross-section of an ellipsoid is at its own centre height,
      // so the capsule's deepest sample is its axis clamped to that plane.
      const dy = Math.min(ay1, Math.max(ay0, cy)) - cy;
      const lx = (d[o + 6] * dx + d[o + 7] * dy + d[o + 8] * dz) / ax;
      const ly = (d[o + 9] * dx + d[o + 10] * dy + d[o + 11] * dz) / ay;
      const lz = (d[o + 12] * dx + d[o + 13] * dy + d[o + 14] * dz) / az;
      const L2 = lx * lx + ly * ly + lz * lz;
      if (L2 >= 1) return;                              // outside
      // Gradient of the ellipsoid at the sample, back in world space: R S u.
      const gx = lx * ax, gy = ly * ay, gz = lz * az;
      let nx = d[o + 6] * gx + d[o + 9] * gy + d[o + 12] * gz;
      let nz = d[o + 8] * gx + d[o + 11] * gy + d[o + 14] * gz;
      let hl = Math.hypot(nx, nz);
      if (hl < 1e-4) { nx = dx; nz = dz; hl = Math.hypot(nx, nz); }
      if (hl < 1e-4) { nx = 1; nz = 0; hl = 1; }
      nx /= hl; nz /= hl;
      // Distance to the surface along that horizontal direction: a ray from a
      // point inside the unit sphere, in the proxy's own frame.
      const qx = (d[o + 6] * nx + d[o + 8] * nz) / ax;
      const qy = (d[o + 9] * nx + d[o + 11] * nz) / ay;
      const qz = (d[o + 12] * nx + d[o + 14] * nz) / az;
      const A = qx * qx + qy * qy + qz * qz;
      if (A < 1e-12) return;
      const B = lx * qx + ly * qy + lz * qz;
      const disc = B * B - A * (L2 - 1);
      if (disc <= 0) return;
      const t = (-B + Math.sqrt(disc)) / A;
      if (t <= 1e-5) return;
      const pen = Math.min(t, MAX_PUSH);
      pos.x += nx * pen;
      pos.z += nz * pen;
      total += pen;
      this.hits++;
    });
    return total;
  }

  /**
   * Is a sphere of radius `r` at this point inside a boulder?
   *
   * The instrument half: `probes/rockwalk.mts` asks it of a character's chest,
   * which is the quantity `probes/fightcam.mts` reports as `heroInRock`.
   */
  inside(x: number, y: number, z: number, r = 0): boolean {
    let hit = false;
    this._near(x, z, r + PAD, (d, o) => {
      if (hit) return;
      const dx = x - d[o], dy = y - d[o + 1], dz = z - d[o + 2];
      if (Math.abs(dx) > d[o + 15] + r || Math.abs(dy) > d[o + 16] + r || Math.abs(dz) > d[o + 17] + r) return;
      const ax = d[o + 3] + r, ay = d[o + 4] + r, az = d[o + 5] + r;
      const lx = (d[o + 6] * dx + d[o + 7] * dy + d[o + 8] * dz) / ax;
      const ly = (d[o + 9] * dx + d[o + 10] * dy + d[o + 11] * dz) / ay;
      const lz = (d[o + 12] * dx + d[o + 13] * dy + d[o + 14] * dz) / az;
      if (lx * lx + ly * ly + lz * lz < 1) hit = true;
    });
    return hit;
  }
}

/** Floats per packed proxy: centre, semi-axes, inverse rotation, world half-extents. */
const STRIDE = 18;
/** Sub-cell for the per-stream-cell index, metres. */
const SUB = 8;
/**
 * Cached stream cells before a prune sweep.
 *
 * Gameplay touches a handful — a character stands in one 56 m cell and one
 * 176 m outcrop cell — so this is sized for the sweeps instead: a probe that
 * grades a 560 m square touches ~137 of them and must not evict its way through
 * the measurement it is taking.
 */
const MAX_CELLS = 192;
/**
 * Smallest boulder worth colliding with — its LARGEST semi-axis, metres.
 *
 * Below this a rock is scree and the step-up rule would skip it anyway; the
 * cull is here so it never costs a rotate. `CameraOccluders` uses 0.55 at the
 * lens's scale; a walker's ankle is lower.
 */
const MIN_R = 0.45;
/** Slack on the query disc, so a proxy just outside the radius still rejects. */
const PAD = 0.35;
/** Ceiling on one proxy's correction in one pass — the wall soup's, verbatim. */
const MAX_PUSH = 0.5;
/** `HullExt` for a kind with no measured hull: a unit ball. */
const UNIT = [1, 1, 1, 0, 0, 0, 0] as const;

const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
let _stamp = 0;
const SUB_OFF = 65536;
const subKey = (ix: number, iz: number) => (ix + SUB_OFF) * 262144 + (iz + SUB_OFF);

/** One cell's packed proxies plus its sub-cell index. */
interface CellProxies {
  /** The live array this was built from; cache validity is its identity. */
  arr: unknown[];
  /** The `TileStream` key and the live map it came from, for the prune. */
  raw: number;
  live: Map<number, unknown[]> | null;
  data: Float32Array;
  count: number;
  grid: Map<number, Int32Array>;
  /** Per-proxy visit stamp, so one query never touches a proxy twice. */
  mark: Int32Array;
  stamp: number;
}

/** The fields of a `RockInstance` this file reads. `Rocks` does not export it. */
interface RockLike {
  k: StoneKind;
  x: number; y: number; z: number;
  nx: number; ny: number; nz: number;
  s: number; sx: number; sy: number; sz: number;
  yaw: number; pitch: number; roll: number;
  bury: number;
}
