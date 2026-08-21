import * as THREE from 'three';
import { WALKABLE_Y } from './CollisionWorld.ts';

/** Below this the surface no longer holds a character at all. */
const SLIDE_Y = Math.cos(58 * Math.PI / 180);
const GRAVITY = 19.5;

/**
 * Capsule-vs-world movement for a walking character.
 *
 * Three things happen every step, in this order, and the order is the whole
 * design:
 *
 * 1. **Slope response.** The surface under the feet decides how much of the
 *    wish velocity survives. Anything under 50° is walked normally; between 50°
 *    and 58° authority fades out and gravity along the slope fades in, so there
 *    is no line on the ground where the character flips between states and
 *    jitters.
 * 2. **Horizontal move, then wall resolution.** Substepped so a sprint never
 *    steps further than the capsule radius, then pushed out of every wall
 *    triangle whose top is more than `stepUp` above the feet. Walls *below*
 *    that line are deliberately not collided with — that is what makes a stair
 *    riser, a kerb and the haven's stepped rock climbable without a jump.
 * 3. **Ground snap.** The highest support under the footprint inside
 *    [feet − stepDown, feet + stepUp] wins, so standing on the haven platform,
 *    the town's graded pad, a boulder or a dungeon floor all work; with nothing
 *    in range the character falls under gravity until something catches them.
 */
export class CharacterController {
  constructor(world: import('./CollisionWorld.ts').CollisionWorld, opts: {radius?:number, height?:number, stepUp?:number, stepDown?:number} = {}) {
    this.world = world;
    this.radius = opts.radius != null ? opts.radius : 0.36;
    this.height = opts.height != null ? opts.height : 1.78;
    this.stepUp = opts.stepUp != null ? opts.stepUp : 0.45;
    this.stepDown = opts.stepDown != null ? opts.stepDown : 0.55;
    /**
     * How high a character will scramble when they are *pushing* at a ledge.
     *
     * A free step-up of `stepUp` is instant and silent — kerbs, stair treads,
     * the town's kerb lip. Above that the allowance grows only while the
     * character is stuck walking into something, and decays again the moment
     * they are moving freely, which is what gets them onto the haven rock: the
     * authored steps stop 1.15 m short of the deck (the top tread is buried
     * inside the plinth), so a fixed 0.45 m limit leaves the campsite exactly
     * as unreachable as it was before. Anything taller than this is a wall.
     */
    this.climbMax = opts.climbMax != null ? opts.climbMax : 1.25;
    this.climb = this.stepUp;
    this._hold = 0;
    /** Cap on how fast the feet may rise onto a ledge, m/s — stops the pop. */
    this.riseRate = opts.riseRate != null ? opts.riseRate : 6.0;
    this.vy = 0;
    this.grounded = true;
    this.onProp = false;
    /** How much of the wanted move actually happened last step, 0..1. */
    this.progress = 1;
    this.normal = new THREE.Vector3(0, 1, 0);
    this._g = { y: 0, nx: 0, ny: 1, nz: 0, onProp: false };
    this._from = new THREE.Vector3();
  }

  /**
   * Advance one character.
   * @param pos feet position, mutated in place
   * @param vx desired world velocity X
   * @param vz desired world velocity Z
   * @returns pos
   */
  move(pos: THREE.Vector3, vx: number, vz: number, dt: number): THREE.Vector3 {
    const world = this.world;
    if (dt <= 0) return pos;
    this._from.copy(pos);

    // ---- 1. slope response --------------------------------------------
    const n = this.normal;
    if (this.grounded && n.y < WALKABLE_Y) {
      const grip = THREE.MathUtils.clamp((n.y - SLIDE_Y) / (WALKABLE_Y - SLIDE_Y), 0, 1);
      const dl = Math.hypot(n.x, n.z) || 1;
      const dx = n.x / dl, dz = n.z / dl;              // horizontal normal = downhill
      const up = vx * -dx + vz * -dz;                  // component pointing uphill
      if (up > 0) { vx += dx * up * (1 - grip); vz += dz * up * (1 - grip); }
      const slide = GRAVITY * (1 - n.y) * (1 - grip);
      vx += dx * slide * dt * 6;
      vz += dz * slide * dt * 6;
    }

    // ---- 2. horizontal move, substepped, then wall resolution ----------
    const want = Math.hypot(vx, vz) * dt;
    const step = this.climb;
    const steps = Math.min(4, Math.max(1, Math.ceil(want / (this.radius * 0.75))));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      pos.x += vx * h;
      pos.z += vz * h;
      world.resolve(pos, this.radius, this.height, step);
    }

    // ---- 3. ground snap / fall ----------------------------------------
    const reach = this.grounded
      ? this.stepDown
      : Math.max(1.5, Math.abs(this.vy) * dt * 1.6);
    const g = world.groundDisc(pos.x, pos.z, pos.y, this.radius, step, reach, this._g);
    const canSnap = this.grounded
      && g.y >= pos.y - this.stepDown - 1e-4
      && g.y <= pos.y + step + 1e-4;
    if (canSnap) {
      pos.y = g.y > pos.y + this.stepUp
        ? Math.min(g.y, pos.y + this.riseRate * dt)   // scrambling: rise, don't pop
        : g.y;
      this.vy = 0;
      this.onProp = g.onProp;
      this.normal.set(g.nx, g.ny, g.nz);
    } else {
      this.vy -= GRAVITY * dt;
      const ny = pos.y + this.vy * dt;
      if (ny <= g.y) {
        pos.y = g.y;
        this.vy = 0;
        this.grounded = true;
        this.onProp = g.onProp;
        this.normal.set(g.nx, g.ny, g.nz);
      } else {
        pos.y = ny;
        this.grounded = false;
        this.normal.set(0, 1, 0);
      }
    }

    // Progress is measured *along the wish direction*: a character grinding
    // sideways down a wall has covered ground but has got nowhere, and scoring
    // that as progress is what stops the scramble allowance from ever building.
    if (want > 1e-5) {
      const inv = 1 / (want / dt);
      const got = (pos.x - this._from.x) * vx * inv + (pos.z - this._from.z) * vz * inv;
      this.progress = THREE.MathUtils.clamp(got / want, 0, 1);
    } else {
      this.progress = 1;
    }

    // ---- 4. the scramble allowance -------------------------------------
    // Grows only while a real effort to move is being stopped by a ledge, and
    // decays back to the free step-up once the way is clear, so it never
    // quietly becomes a 1.25 m stride for someone strolling past a wall.
    const pushing = this.grounded && want > 0.6 * dt && this.progress < 0.55
      && this._ledgeAhead(pos, vx, vz, want / dt);
    if (pushing) {
      this.climb = Math.min(this.climbMax, this.climb + 3.2 * dt);
      // Hold it there for a moment. The frame the allowance finally clears the
      // ledge the character moves freely again, but the feet are still 0.5 m
      // below the tread and take several frames to rise; decaying immediately
      // would drop the allowance back under the ledge mid-climb and shove them
      // off it, which is exactly the stutter this replaced.
      this._hold = 0.55;
    } else if (this._hold > 0) {
      this._hold -= dt;
    } else {
      this.climb = Math.max(this.stepUp, this.climb - 2.4 * dt);
    }
    return pos;
  }

  /**
   * Is the thing in the way a *ledge* — something with a walkable top the
   * character could stand on — rather than a wall?
   *
   * Without this gate the scramble allowance grows against everything, and a
   * character leaning on the Crow's Nest ends up 0.1 m inside its stub wall
   * with the glazing above holding them there. With it, the allowance only
   * ever builds where there is somewhere to end up.
   */
  _ledgeAhead(pos, vx, vz, speed): boolean {
    const w = this.world;
    if (!w.ready || !w.enabled || speed < 1e-3) return false;
    const ahead = this.radius + 0.30;
    const px = pos.x + (vx / speed) * ahead;
    const pz = pos.z + (vz / speed) * ahead;
    const led = w.groundAt(px, pz, pos.y, this.climbMax, 0.15);
    if (!led.onProp || led.y <= pos.y + 0.02 || led.ny < WALKABLE_Y) return false;
    return !w.blocked(px, pz, led.y, this.radius, this.height, this.stepUp);
  }

  /**
   * Nudge a heading so it goes *around* an obstacle rather than into it.
   * Companions use this: they steer to a formation slot in the player's frame,
   * and without it they walk that slot straight through the Crow's Nest.
   *
   * @param pos feet position
   * @param dx unit direction X
   * @param dz unit direction Z
   * @param look metres to probe ahead
   * @returns [dx, dz] — the original direction when nothing is in the way
   */
  avoid(pos: THREE.Vector3, dx: number, dz: number, look: number = 1.8): number[] {
    const w = this.world;
    if (!w.ready || !w.enabled) return [dx, dz];
    if (!w.blocked(pos.x + dx * look, pos.z + dz * look, pos.y, this.radius, this.height, this.stepUp)) {
      return [dx, dz];
    }
    for (const a of [0.6, -0.6, 1.15, -1.15, 1.75, -1.75]) {
      const c = Math.cos(a), s = Math.sin(a);
      const tx = dx * c - dz * s, tz = dx * s + dz * c;
      if (!w.blocked(pos.x + tx * look, pos.z + tz * look, pos.y, this.radius, this.height, this.stepUp)) {
        return [tx, tz];
      }
    }
    return [dx, dz];
  }
}
