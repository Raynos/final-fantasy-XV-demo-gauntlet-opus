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
 * **Why spheres.** `rockGeometry` normalises every hull to bounding radius 1,
 * so `s * max(jx, jy, jz)` — read through `placedScale`, the same function
 * `Rocks.update` composes its matrices through — is a true bounding sphere of
 * the placed hull. A sphere sweeps against a ray in nine multiplies with no
 * rotation to invert, and being slightly loose is the *right* error for a
 * camera: the lens should stop short of a rock face, never graze it.
 *
 * **Cost.** The window is rebuilt only when the focus moves more than
 * `MOVE` metres or `PERIOD` seconds pass, and it walks only the 56 m stream
 * cells (and 176 m outcrop cells) that a `radius`-metre disc touches — two by
 * two of them at an arm's length. `probes/camcost.mts` prices it.
 */
export class CameraOccluders {
  /** Packed `x, y, z, r` per proxy. */
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
   * thirty frames of the inside of one. Measured: without this, the far-face
   * branch still left 4.39% of combat frames inside a rock, in 52 separate runs
   * on one fight — an oscillation, not a burial.
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
    this.data = new Float32Array(max * 4);
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
    const r2max = radius * radius;
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
            // Cheap XZ reject before any of the placement arithmetic.
            const dx = it.x - focus.x, dz = it.z - focus.z;
            if (dx * dx + dz * dz > r2max + it.s * it.s * 4) continue;
            const ex = rocks.ext.get(it.k) ?? UNIT;
            const ps = placedScale(ex, it.s, it.sx, it.sy, it.sz, it.bury);
            const rad = it.s * Math.max(ps.jx, ps.jy, ps.jz);
            if (rad < MIN_R) continue;
            const px = it.x - it.nx * ps.sink;
            const py = it.y - it.ny * ps.sink;
            const pz = it.z - it.nz * ps.sink;
            const ddx = px - focus.x, ddy = py - focus.y, ddz = pz - focus.z;
            const dist = Math.hypot(ddx, ddy, ddz) - rad;
            if (dist > radius) continue;
            if (n >= this.max) continue;
            d[n * 4] = px; d[n * 4 + 1] = py; d[n * 4 + 2] = pz; d[n * 4 + 3] = rad;
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
   * Sweep a sphere of radius `probe` from `o` along the unit `dir` and return
   * the first distance at which it touches a proxy, or `len` if it never does.
   *
   * An origin already inside a proxy returns 0 — the caller's own minimum-arm
   * clamp then decides what to do about it, exactly as the terrain sweep does.
   */
  sweep(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, len: number, probe: number) {
    const d = this.data;
    let best = len;
    for (let i = 0; i < this.count; i++) {
      const cx = d[i * 4], cy = d[i * 4 + 1], cz = d[i * 4 + 2], r = d[i * 4 + 3] + probe;
      const mx = ox - cx, my = oy - cy, mz = oz - cz;
      const c = mx * mx + my * my + mz * mz - r * r;
      if (c <= 0) return 0;                              // origin inside
      const b = mx * dx + my * dy + mz * dz;
      if (b > 0) continue;                               // pointing away
      const disc = b * b - c;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t >= 0 && t < best) best = t;
    }
    return best;
  }

  /**
   * Push a point out of every proxy it is inside, along the radial direction.
   * @returns metres moved
   */
  push(p: THREE.Vector3, probe: number) {
    const d = this.data;
    let moved = 0;
    for (let pass = 0; pass < 2; pass++) {
      let worst = -1, wi = -1;
      for (let i = 0; i < this.count; i++) {
        const r = d[i * 4 + 3] + probe;
        const mx = p.x - d[i * 4], my = p.y - d[i * 4 + 1], mz = p.z - d[i * 4 + 2];
        const pen = r - Math.hypot(mx, my, mz);
        if (pen > worst) { worst = pen; wi = i; }
      }
      if (wi < 0 || worst <= 0) break;
      const r = d[wi * 4 + 3] + probe;
      let mx = p.x - d[wi * 4], my = p.y - d[wi * 4 + 1], mz = p.z - d[wi * 4 + 2];
      let l = Math.hypot(mx, my, mz);
      // Dead centre: any direction is as good as another, so take up.
      if (l < 1e-4) { mx = 0; my = 1; mz = 0; l = 1; }
      const k = r / l;
      p.set(d[wi * 4] + mx * k, d[wi * 4 + 1] + my * k, d[wi * 4 + 2] + mz * k);
      moved += worst;
    }
    return moved;
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
   * `probes/fightcam.mts` measures him inside one on 31.5% of combat frames
   * across four real den fights (64% and 58% in the two that were fought in a
   * tor). The first version of this shortened the arm to 0.4 m there, which
   * keeps the lens inside the rock with him and measured *worse* than no
   * push-out at all — 55.4% against 30.6% on one round. When the focus is
   * inside, the right answer is the opposite: run the arm OUT through the far
   * face and stand the camera beyond it, which is the only place in that
   * direction from which the fight is visible at all.
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
    const d = this.data;
    for (let i = 0; i < this.count; i++) {
      const r = d[i * 4 + 3] + probe;
      const mx = x - d[i * 4], my = y - d[i * 4 + 1], mz = z - d[i * 4 + 2];
      if (mx * mx + my * my + mz * mz < r * r) return true;
    }
    return false;
  }
}

/** Metres the focus may move before the window is rebuilt. */
const MOVE = 2.0;
/** Seconds between rebuilds when the focus is standing still. */
const PERIOD = 0.5;
/**
 * Smallest proxy worth keeping, metres.
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
  bury: number;
}
