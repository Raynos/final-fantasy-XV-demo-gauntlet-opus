import * as THREE from 'three';
import { WALKABLE_Y } from './CollisionWorld.ts';
import type { CollisionWorld, GroundHit } from './CollisionWorld.ts';

/** Below this the surface no longer holds a character at all. */
const SLIDE_Y = Math.cos(58 * Math.PI / 180);
const GRAVITY = 19.5;
/**
 * Terminal speed of a slide, m/s.
 *
 * Measured, not chosen. At 6.5 the slide did its job — six of six dead-stops
 * became slides — and then kept going: a climb that merely *brushed* a
 * refusing patch on the way up a 48° face was swept off it, `slopewalk`'s
 * 48.2° site going from `along 42.9 m, dY +18.1` to `along 21.0 m, dY −45.7`.
 * 3.5 is half the 7 m/s sprint, so it cannot be out-walked on ground that
 * refuses (where the uphill authority is zero anyway) and is comfortably
 * out-walked the moment the ground holds again.
 */
const SLIDE_MAX = 3.5;
/**
 * How fast a slide bleeds off once the ground is walkable again, per second.
 * At 8 it is down to 9% within a third of a second, which is what keeps a
 * slide from following you onto ground you can stand on.
 */
const SLIDE_BRAKE = 8.0;
/** Seconds `slip` stays raised after the ground turns walkable again. */
const SLIP_HOLD = 0.9;
/**
 * How long the ground has to keep refusing before it counts as a refusal.
 *
 * **This is not a debounce; it is the difference between a hillside and a
 * facet.** `Terrain.normalAt` is a finite difference over one cell, and this
 * field is incised — `Field._addDetail`'s gully cuts 4.8 m amplified by
 * `(0.4 + 0.9*slope)` so it bites the flanks. The consequence, measured: a
 * 41.6° hillside that `slopewalk` climbs 12.4 m without difficulty spends
 * **54% of its frames** with a sub-metre facet steeper than 58° under the
 * feet. Building slide momentum on those swept a climb off a 48.2° face
 * (`dY +18.1` → `−24.6`), and publishing `slip` from them would have put "too
 * steep" on screen while the player was walking up the hill.
 *
 * A leaky counter rather than a reset, so alternating facets hover near zero
 * and only a face that keeps refusing ever crosses.
 */
const REFUSE_T = 0.35;

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
 *    jitters. Past 58° the surface does not hold anyone: the character
 *    **slides**, and the slide has momentum (see `slip`).
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
  _from!: THREE.Vector3;
  _g!: GroundHit;
  _hold!: number;
  /** Seconds of (leaky) continuous refusal — see `REFUSE_T`. */
  _refuseFor!: number;
  /** Seconds `slip` has left to run once the ground turns walkable again. */
  _slipFor!: number;
  /** Carried slide velocity, m/s, world X and Z. */
  _slx!: number;
  _slz!: number;
  climb!: number;
  /** Steepest slope the character will walk up, as `normal.y`. */
  climbMax!: number;
  grounded!: boolean;
  height!: number;
  normal!: THREE.Vector3;
  onProp!: boolean;
  progress!: number;
  radius!: number;
  /** How fast the feet are allowed to be lifted onto a step, m/s. */
  riseRate!: number;
  /**
   * How much footing is being lost right now, 0..1 — the signal the game had
   * no way of giving the player.
   *
   * 0 on ground that holds you and 1 on ground that does not (past 58°). The
   * 50-58° fade band deliberately reads 0: it is walkable, `slopewalk` shows
   * four of five sites in it climbing, and a warning that fires while you are
   * succeeding is a warning nobody believes the time it is true. It stays
   * raised for `SLIP_HOLD` after the ground turns walkable again, because a character oscillating across the contour
   * flickers it four times a second otherwise and a message that flickers is
   * noise. `src/ui/HUD.ts` reads it; nothing in the collision layer does.
   */
  slip!: number;
  stepDown!: number;
  stepUp!: number;
  /**
   * Swimming. **Owned by `world/swim/Swim.ts`**, which decides the state; this
   * class only carries it out.
   *
   * The branch lives here rather than in the swim system for one reason: `vy`
   * is the single vertical integrator, and buoyancy is a vertical velocity. A
   * swim system that wrote `pos.y` from `lateUpdate` would be racing `move()`'s
   * gravity every frame — the character would sink a frame's worth of 19.5
   * m/s² and be pulled back up again, which is a 3 mm jitter at 60 fps and a
   * 5 cm one whenever the frame is long. Gravity and buoyancy have to be the
   * same `if`.
   */
  swim!: boolean;
  /** World Y the feet are buoyed toward while `swim`. Set with `swim`. */
  swimY!: number;
  /** How fast the feet chase `swimY`, m/s. Bigger = more corklike. */
  swimRate!: number;
  vy!: number;
  world!: CollisionWorld;
  constructor(world: CollisionWorld, opts: {radius?: number, height?: number, stepUp?: number, stepDown?: number, climbMax?: number, riseRate?: number} = {}) {
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
    this.swim = false;
    this.swimY = 0;
    this.swimRate = 2.6;
    this.grounded = true;
    this.onProp = false;
    this.slip = 0;
    this._slipFor = 0;
    this._refuseFor = 0;
    this._slx = 0;
    this._slz = 0;
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
    if (this.swim) return this._swimStep(pos, vx, vz, dt);

    // ---- 1. slope response --------------------------------------------
    //
    // **The dead zone this replaced, and why it was worth a rewrite.** The
    // fade band was right; past it the response was a *balance*, and a balance
    // is the one thing a slope limit must never be. The downhill push was
    // recomputed from scratch each frame and `Player` rebuilds `velocity` from
    // heading and speed each frame too, so it could never accumulate: a
    // character walking at a cliff slid down until the push exactly cancelled
    // his own effort, and PARKED on that contour — upright, `grounded` true,
    // `progress` ~0 so the animator held the idle. `slopewalk` measured it at
    // six of fifteen real hillsides: 2.8 m of ground gained in ten seconds of
    // sprint over 31.9 m of path, which is grinding sideways along the contour
    // and is exactly what the playtest described as "W just stops working".
    // `longplay`'s own comment records the same thing costing it 27 of its 30
    // minutes.
    //
    // So: the fade band keeps its old behaviour verbatim — it is tested, and
    // `slopewalk` shows four of five sites between 47° and 58° do climb — and
    // past it the slide gets MOMENTUM. It accelerates under gravity along the
    // slope, is capped at `SLIDE_MAX`, and brakes only once the ground holds
    // again. It therefore cannot reach an equilibrium: it carries the
    // character off the contour and down into country he can walk on, which is
    // a refusal he can see happening to him.
    const n = this.normal;
    let grip = 1;
    if (this.grounded && n.y < WALKABLE_Y) {
      grip = THREE.MathUtils.clamp((n.y - SLIDE_Y) / (WALKABLE_Y - SLIDE_Y), 0, 1);
      const dl = Math.hypot(n.x, n.z) || 1;
      const dx = n.x / dl, dz = n.z / dl;              // horizontal normal = downhill
      const up = vx * -dx + vz * -dz;                  // component pointing uphill
      if (up > 0) { vx += dx * up * (1 - grip); vz += dz * up * (1 - grip); }
      if (grip > 0) {
        const slide = GRAVITY * (1 - n.y) * (1 - grip);
        vx += dx * slide * dt * 6;
        vz += dz * slide * dt * 6;
      } else if (this._refuseFor > REFUSE_T) {
        this._slx += dx * GRAVITY * (1 - n.y) * dt;
        this._slz += dz * GRAVITY * (1 - n.y) * dt;
      }
    }
    this._refuseFor = grip <= 0 && this.grounded
      ? Math.min(REFUSE_T * 3, this._refuseFor + dt)
      : Math.max(0, this._refuseFor - dt * 2);
    // The slide is carried, clamped and braked here rather than inside the
    // branch above, so a character who slides off a cliff onto flat ground
    // keeps going for a moment instead of stopping dead on the line.
    const sl = Math.hypot(this._slx, this._slz);
    if (sl > 1e-4) {
      if (sl > SLIDE_MAX) { this._slx *= SLIDE_MAX / sl; this._slz *= SLIDE_MAX / sl; }
      if (grip > 0 || !this.grounded) {
        const k = Math.max(0, 1 - SLIDE_BRAKE * dt);
        this._slx *= k;
        this._slz *= k;
      }
      vx += this._slx;
      vz += this._slz;
    } else {
      this._slx = 0;
      this._slz = 0;
    }
    // Published for the HUD. Held for a moment so a character oscillating
    // across the 58° contour does not flicker the message.
    //
    // **A refusal, not a steepness.** The first version published `1 - grip`,
    // so the fade band raised it too — and `slopewalk` promptly showed 78% slip
    // on a 41.6° hillside that climbed 12.3 m without complaint. Telling a
    // player "too steep" while they are successfully climbing is worse than
    // telling them nothing, because the next time it is true they will not
    // believe it. This is 1 only where the ground genuinely will not hold.
    if (this._refuseFor > REFUSE_T) this._slipFor = SLIP_HOLD;
    else if (this._slipFor > 0) this._slipFor -= dt;
    this.slip = this._slipFor > 0 ? 1 : 0;

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

    this._score(pos, vx, vz, want, dt);

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
   * How much of the wanted move actually happened, along the wish direction.
   *
   * Measured *along* it and not as a distance: a character grinding sideways
   * down a wall has covered ground but has got nowhere, and scoring that as
   * progress is what stops the scramble allowance from ever building. The
   * swimmer wants the same number for the same reason — the gait blend and the
   * velocity the party chases are both scaled by it — so it is a method now
   * rather than a paragraph inlined in one of the two branches.
   */
  _score(pos: THREE.Vector3, vx: number, vz: number, want: number, dt: number) {
    if (want > 1e-5) {
      const inv = 1 / (want / dt);
      const got = (pos.x - this._from.x) * vx * inv + (pos.z - this._from.z) * vz * inv;
      this.progress = THREE.MathUtils.clamp(got / want, 0, 1);
    } else {
      this.progress = 1;
    }
  }

  /**
   * One step of a swimmer: the horizontal move, then buoyancy instead of
   * gravity.
   *
   * Three deliberate differences from the walking path, and each one is a bug
   * that would otherwise be visible in the frame:
   *
   * - **No slope response.** The bed's normal is meaningless to something that
   *   is not touching it, and a 40° silt slope under a swimmer would otherwise
   *   push them downhill at `GRAVITY * (1 - n.y)` — a current that only exists
   *   where the bottom happens to be steep.
   * - **Walls still collide.** The horizontal half is unchanged, so a lake
   *   under a cliff still has an edge and a jetty piling is still a piling.
   *   Swimming is not noclip.
   * - **The bed is a floor, not a support.** `pos.y` is clamped up out of the
   *   ground rather than snapped onto it, so a dive that reaches the bottom
   *   stops there without the character being re-grounded and walked home. In
   *   shallow water the clamp *is* the floor-walk, which is correct: 40 cm of
   *   water is waded, and `Swim` will not have entered the state anyway.
   *
   * `grounded` stays true throughout. It is read by `Player` and by the
   * animator as "is this character being held up by something", and a swimmer
   * is; publishing `false` puts Noctis into a falling pose in the middle of a
   * lake.
   */
  _swimStep(pos: THREE.Vector3, vx: number, vz: number, dt: number): THREE.Vector3 {
    const world = this.world;
    const want = Math.hypot(vx, vz) * dt;
    const steps = Math.min(4, Math.max(1, Math.ceil(want / (this.radius * 0.75))));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      pos.x += vx * h;
      pos.z += vz * h;
      world.resolve(pos, this.radius, this.height, this.stepUp);
    }

    // Buoyancy. First-order on the position and then differentiated back into
    // `vy`, rather than a spring on `vy` integrated into the position: the
    // spring form overshoots, and an overshooting swimmer bobs their head
    // under the surface once per entry. This form cannot overshoot, and `vy`
    // still reads as the true vertical rate for anything that asks.
    const rise = THREE.MathUtils.clamp(
      THREE.MathUtils.damp(pos.y, this.swimY, this.swimRate, dt) - pos.y,
      -3.2 * dt, 3.2 * dt,
    );
    let ny = pos.y + rise;

    const g = world.groundDisc(pos.x, pos.z, pos.y, this.radius, this.stepUp, 2.0, this._g);
    if (ny < g.y) { ny = g.y; this.onProp = g.onProp; } else { this.onProp = false; }
    this.vy = (ny - pos.y) / dt;
    pos.y = ny;
    this.grounded = true;
    this.normal.set(0, 1, 0);
    // The scramble allowance is a walking affordance; hold it at the free
    // step-up so a swimmer who spent a while pushing at a bank does not climb
    // out of the water onto a 1.25 m ledge the moment they touch bottom.
    this.climb = this.stepUp;
    this._hold = 0;
    // Same reasoning as "no slope response" above, one step further: a slide
    // carried into the water would be a current that only exists where the
    // swimmer happened to enter, and `slip` is a statement about footing,
    // which a swimmer has none of and needs none of.
    this._slx = 0;
    this._slz = 0;
    this._slipFor = 0;
    this._refuseFor = 0;
    this.slip = 0;
    this._score(pos, vx, vz, want, dt);
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
  _ledgeAhead(pos: THREE.Vector3, vx: number, vz: number, speed: number): boolean {
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
