import * as THREE from 'three';
import { placedScale } from '../world/props/Rocks.ts';
import type { StoneKind } from '../world/props/ZoneDress.ts';
import type { Rocks } from '../world/props/Rocks.ts';
import { TileStream } from '../world/props/TileStream.ts';
import type { Game } from './Game.ts';

/**
 * The handful of solid things near the lens, as spheres.
 *
 * **Why this exists.** The blind playtest's number-one complaint was "fights
 * happen inside a hill and I can't see any of them", and lane 11 filed the same
 * defect from its own `f-engage` frame: the camera fully inside a boulder at
 * the moment an encounter starts. `probes/camview.mts` then measured the
 * heightfield on its own and found it nearly innocent — 0.00% of 2592 sampled
 * combat poses put Noctis behind the ground, mean 1.6% of frame within 3 m. The
 * "hill" is not terrain. It is `Rocks`: a tor or an outcrop, brown, faceted and
 * the size of a house, and `CameraRig` has never had any collision against one.
 *
 * **Why not the collision world.** `CollisionWorld` is the obvious home and
 * cannot help: `Harvest.collectRockProxies` returns `[]` and has since it was
 * written (`CollisionWorld.stats.rockProxies` reads 0 in a live page — verified,
 * not inferred). Wiring it up would give *characters* boulder collision too,
 * which is a real gameplay change wanting its own commit and its own perf
 * number; it is filed as residue. The camera needs an answer tonight and needs
 * it only within one arm's length, so it gets its own, much smaller one.
 *
 * **Why ellipsoids, and not spheres.** A sphere is the cheap proxy and it was
 * the first one here, radius `s * max(jx, jy, jz)`, which is a true bounding
 * sphere because `rockGeometry` normalises every hull to bounding radius 1. It
 * is far too fat to reason with. `hullExtents` measures the per-axis half-
 * extents and they run **0.447 (`slab`) to 0.988 (`spire`)** in the vertical
 * alone, so the bounding sphere of a slab is 2.2x its own thickness: a lens
 * standing beside a flat rock reads as inside it, the arm pushes in for nothing,
 * and — worse — the *measurement* of how often the lens is buried is inflated
 * by the same factor. An instrument that cannot be trusted about the size of
 * the defect cannot be trusted about the size of the fix.
 *
 * So a proxy is the placed hull's own ellipsoid: semi-axes
 * `s * j{x,y,z} * ext[0..2]` in the instance's own rotated frame, read through
 * `placedScale` — the same function `Rocks.update` composes its matrices
 * through, so the proxy is the hull the game draws and not the recipe it was
 * drawn from. Ray-against-ellipsoid is ray-against-unit-sphere after an affine
 * change of frame, and `t` survives the change unaltered because the change is
 * affine, so it costs one 3x3 rotate of the origin and the direction.
 *
 * **Cost.** The window is rebuilt only when the focus moves more than
 * `MOVE` metres or `PERIOD` seconds pass, and it walks only the 56 m stream
 * cells (and 176 m outcrop cells) that a `radius`-metre disc touches — two by
 * two of them at an arm's length. `probes/camcost.mts` prices it.
 */
export class CameraOccluders {
  /**
   * Packed proxies, {@link STRIDE} floats each: centre (3), semi-axes (3), and
   * the *inverse* rotation as a 3x3 in row-major order (9). The inverse of a
   * rotation is its transpose, so this is stored rather than derived.
   */
  data: Float32Array;
  /** How many proxies `data` holds. */
  count = 0;
  /** Instances examined on the last rebuild — the cost, in one number. */
  scanned = 0;
  /**
   * True when the last {@link CameraOccluders.arm} call took the far-face
   * branch, i.e. the focus itself is inside a proxy.
   *
   * The rig reads it to decide how fast the arm may lengthen. Its normal
   * recovery is 3.2/s — deliberately slow, so a camera that has been crowded by
   * a hillside eases back out instead of snapping. That rate is exactly wrong
   * here: the arm is trying to leave a rock, and half a second of easing is
   * thirty frames of the inside of one.
   */
  exiting = false;
  /** Rebuilds since `init`, and the last rebuild's wall clock in ms. */
  rebuilds = 0;
  lastMs = 0;
  _at = new THREE.Vector3(NaN, NaN, NaN);
  _t = -1e9;
  _rocks: Rocks | null = null;
  /** Ceiling on proxies kept; the window has never come near it. */
  max: number;

  constructor(max = 128) {
    this.max = max;
    this.data = new Float32Array(max * STRIDE);
  }

  /**
   * Bring the window to `focus`, cheaply.
   *
   * @param radius how far from `focus` a proxy is worth keeping — one arm plus
   *   the biggest step the damping can take in a frame.
   * @param now seconds; the rebuild is rate-limited against it.
   */
  update(game: Game, focus: THREE.Vector3, radius: number, now: number) {
    if (!this._rocks) {
      // `Props` owns the instance; there is no `Rocks` system key.
      this._rocks = game.get('Props')?.rocks ?? null;
      if (!this._rocks) return;
    }
    const moved = this._at.distanceToSquared(focus);
    if (moved < MOVE * MOVE && now - this._t < PERIOD) return;
    this._at.copy(focus);
    this._t = now;
    this._gather(this._rocks, focus, radius);
  }

  _gather(rocks: Rocks, focus: THREE.Vector3, radius: number) {
    const t0 = performance.now();
    const d = this.data;
    let n = 0, scanned = 0;
    const streams: [Map<number, unknown[]>, number][] = [
      [rocks.stream.live as Map<number, unknown[]>, rocks.stream.cell],
      [rocks.outcrops.live as Map<number, unknown[]>, rocks.outcrops.cell],
    ];
    for (const [live, cell] of streams) {
      const x0 = Math.floor((focus.x - radius) / cell), x1 = Math.floor((focus.x + radius) / cell);
      const z0 = Math.floor((focus.z - radius) / cell), z1 = Math.floor((focus.z + radius) / cell);
      for (let cx = x0; cx <= x1; cx++) {
        for (let cz = z0; cz <= z1; cz++) {
          const arr = live.get(TileStream.key(cx, cz));
          if (!arr) continue;
          for (let i = 0; i < arr.length; i++) {
            const it = arr[i] as RockLike;
            scanned++;
            // Cheap XZ reject on the bounding radius, before any placement
            // arithmetic: `s` IS the bounding radius, the hull being normalised.
            const dx = it.x - focus.x, dz = it.z - focus.z;
            const reach = radius + it.s;
            if (dx * dx + dz * dz > reach * reach) continue;
            const ex = rocks.ext.get(it.k) ?? UNIT;
            const ps = placedScale(ex, it.s, it.sx, it.sy, it.sz, it.bury);
            const ax = it.s * ps.jx * ex[0], ay = it.s * ps.jy * ex[1], az = it.s * ps.jz * ex[2];
            if (Math.max(ax, ay, az) < MIN_R) continue;
            const px = it.x - it.nx * ps.sink;
            const py = it.y - it.ny * ps.sink;
            const pz = it.z - it.nz * ps.sink;
            const ddx = px - focus.x, ddy = py - focus.y, ddz = pz - focus.z;
            if (Math.hypot(ddx, ddy, ddz) - it.s > radius) continue;
            if (n >= this.max) continue;
            _e.set(it.pitch, it.yaw, it.roll);
            _m.makeRotationFromEuler(_e);
            const o = n * STRIDE, e = _m.elements;
            d[o] = px; d[o + 1] = py; d[o + 2] = pz;
            d[o + 3] = ax; d[o + 4] = ay; d[o + 5] = az;
            // `elements` is column-major, so reading it in this order IS the
            // transpose, which for a rotation is the inverse.
            d[o + 6] = e[0]; d[o + 7] = e[1]; d[o + 8] = e[2];
            d[o + 9] = e[4]; d[o + 10] = e[5]; d[o + 11] = e[6];
            d[o + 12] = e[8]; d[o + 13] = e[9]; d[o + 14] = e[10];
            n++;
          }
        }
      }
    }
    this.count = n;
    this.scanned = scanned;
    this.rebuilds++;
    this.lastMs = performance.now() - t0;
  }

  /**
   * Put a world point into proxy `i`'s frame, scaled so the proxy is the unit
   * sphere. Writes `_u`; `probe` inflates each semi-axis.
   */
  _local(i: number, x: number, y: number, z: number, probe: number, dir: boolean) {
    const d = this.data, o = i * STRIDE;
    const mx = dir ? x : x - d[o], my = dir ? y : y - d[o + 1], mz = dir ? z : z - d[o + 2];
    // inverse rotation, stored row-major
    const lx = d[o + 6] * mx + d[o + 7] * my + d[o + 8] * mz;
    const ly = d[o + 9] * mx + d[o + 10] * my + d[o + 11] * mz;
    const lz = d[o + 12] * mx + d[o + 13] * my + d[o + 14] * mz;
    _u.set(lx / (d[o + 3] + probe), ly / (d[o + 4] + probe), lz / (d[o + 5] + probe));
    return _u;
  }

  /**
   * Sweep a sphere of radius `probe` from `o` along the unit `dir` and return
   * the first distance at which it touches a proxy, or `len` if it never does.
   *
   * An origin already inside a proxy returns 0 — {@link CameraOccluders.arm}
   * is what decides what to do about that.
   */
  sweep(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, len: number, probe: number) {
    let best = len;
    for (let i = 0; i < this.count; i++) {
      const p = this._local(i, ox, oy, oz, probe, false);
      const px = p.x, py = p.y, pz = p.z;
      const c = px * px + py * py + pz * pz - 1;
      if (c <= 0) return 0;                              // origin inside
      const q = this._local(i, dx, dy, dz, probe, true);
      // `dir` is a unit vector in WORLD space and is not one here, so the
      // quadratic keeps its leading coefficient. `t` is unchanged by the
      // change of frame because the change is affine.
      const a = q.x * q.x + q.y * q.y + q.z * q.z;
      const b = px * q.x + py * q.y + pz * q.z;
      if (b > 0) continue;                               // pointing away
      const disc = b * b - a * c;
      if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / a;
      if (t >= 0 && t < best) best = t;
    }
    return best;
  }

  /**
   * The arm length to use, given what the arm wants and what the terrain allows.
   *
   * Two cases, and the second is the one that matters here. Normally the focus
   * is in open air, the sweep finds where the arm would enter a rock, and the
   * arm stops short of it — `minLen` rather than the rig's `minDistance`,
   * because a boulder crowding Noctis' shoulder is not a comfort question.
   *
   * But **Noctis can be standing inside the rock**: `Harvest.collectRockProxies`
   * returns `[]`, so characters have no boulder collision either, and
   * `probes/fightcam.mts` measures him inside one on a third to all of the
   * combat frames of a fight that happens in a tor. Shortening the arm there
   * keeps the lens inside the rock with him and measured *worse* than no
   * push-out at all. When the focus is inside, the right answer is the
   * opposite: run the arm OUT through the far face and stand the camera beyond
   * it, which is the only place in that direction from which the fight is
   * visible at all.
   *
   * @param terrainD what the terrain sweep already allows
   * @returns metres along `dir`
   */
  arm(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
    wanted: number, terrainD: number, probe: number, minLen: number) {
    const entry = this.sweep(ox, oy, oz, dx, dy, dz, wanted, probe);
    this.exiting = false;
    if (entry >= minLen) return Math.min(terrainD, Math.max(minLen, entry - 0.04));
    this.exiting = true;

    // Focus inside the union: march for the far face. A 0.2 m step is finer
    // than any proxy this keeps (`MIN_R` is 0.55) so it cannot tunnel one.
    let exit = -1;
    for (let t = 0.2; t <= wanted; t += 0.2) {
      if (!this.inside(ox + dx * t, oy + dy * t, oz + dz * t, probe)) { exit = t; break; }
    }
    // Still inside at full stretch — an outcrop the size of a house. Nothing in
    // this direction helps, so leave the arm where it wanted to be and let the
    // radial push in `lateUpdate` have the last word.
    if (exit < 0) return Math.min(terrainD, wanted);
    // The terrain limit is deliberately NOT applied on this branch: the ground
    // floor lifts a lens that ends up low, and a frame of hillside is a frame.
    // A frame of the inside of a boulder is not.
    const after = this.sweep(ox + dx * exit, oy + dy * exit, oz + dz * exit,
      dx, dy, dz, wanted - exit, probe);
    return Math.min(wanted, exit + Math.min(0.35, after));
  }

  /** Is a sphere of radius `probe` at this point inside a proxy? */
  inside(x: number, y: number, z: number, probe: number) {
    for (let i = 0; i < this.count; i++) {
      if (this._local(i, x, y, z, probe, false).lengthSq() < 1) return true;
    }
    return false;
  }
}

/** Floats per packed proxy. */
const STRIDE = 16;
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _u = new THREE.Vector3();

/** Metres the focus may move before the window is rebuilt. */
const MOVE = 2.0;
/** Seconds between rebuilds when the focus is standing still. */
const PERIOD = 0.5;
/**
 * Smallest proxy worth keeping — its LARGEST semi-axis, metres.
 *
 * Pebbles and scree are ankle-high and the lens never reaches them; colliding
 * with one would only make the arm twitch. This is the same idea as
 * `collectRockProxies`' old 0.34 m knee-high cull, set at the camera's own
 * scale rather than a walker's.
 */
const MIN_R = 0.55;
/** `HullExt` for a kind with no measured hull: a unit ball. */
const UNIT = [1, 1, 1, 0, 0, 0, 0] as const;

/** The fields of a `RockInstance` this file reads. `Rocks` does not export it. */
interface RockLike {
  k: StoneKind;
  x: number; y: number; z: number;
  nx: number; ny: number; nz: number;
  s: number; sx: number; sy: number; sz: number;
  yaw: number; pitch: number; roll: number;
  bury: number;
}
