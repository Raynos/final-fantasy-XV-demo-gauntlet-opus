import type { RoadPath } from './RoadPath.ts';
/**
 * Ignis at the wheel.
 *
 * FFXV's default is that you set a destination on the map and Ignis drives.
 * This is that: pure-pursuit steering onto a look-ahead point on the highway
 * centreline, a speed target derived from the tightest curvature inside the
 * braking distance, and a throttle/brake controller in front of both.
 *
 * The look-ahead grows with speed, so the line straightens out as the car
 * gets quicker rather than sawing at the wheel; the corner speed comes from
 * `v = sqrt(aLat / k)` with a comfortable lateral limit, which is why he lifts
 * off *before* a bend and gets back on the power at the apex. He also drifts
 * a little toward the inside of a corner, the way a driver actually does.
 */

const CRUISE = 24.0;              // m/s, ~86 km/h — the Regalia's touring pace
const A_LAT = 5.6;                // comfortable lateral acceleration
const A_BRAKE = 4.2;              // how hard he is willing to slow

export class AutoDrive {
  _p!: any;
  _steerSmooth!: number;
  _targetSpeed!: number;
  arrived!: boolean;
  controls!: any;
  cruise!: number;
  destination!: string | null;
  dir!: number;
  enabled!: boolean;
  road!: RoadPath;
  targetS!: number;
  constructor(road: import('./RoadPath.ts').RoadPath) {
    this.road = road;
    this.enabled = false;
    /** Arc length of the destination along the highway. */
    this.targetS = road ? road.length * 0.5 : 0;
    /** +1 driving toward increasing arc length, -1 the other way. */
    this.dir = 1;
    /** Name of where we are going, for the HUD and the banter. */
    this.destination = null;
    /** True once the car has stopped at the destination. */
    this.arrived = false;
    this.cruise = CRUISE;
    this.controls = { throttle: 0, brake: 0, steer: 0, handbrake: false, gear: 1 };
    this._p = { x: 0, y: 0, z: 0, tx: 0, tz: 1 };
    this._steerSmooth = 0;
    this._targetSpeed = 0;
  }

  /**
   * Set the destination by arc length along the highway.
   * @param s metres along the spline
   */
  setTargetS(s: number, name: string | null = null) {
    this.targetS = Math.max(0, Math.min(this.road.length, s));
    this.destination = name;
    this.arrived = false;
  }

  /**
   * Set the destination from a world position — snapped to the nearest point
   * on the highway, because the Regalia does not go cross-country.
   * @param x @param z @param [name]
   */
  setTargetPos(x: number, z: number, name: string | null = null) {
    const hit = this.road.nearest(x, z, this.road.makeHit());
    this.setTargetS(hit.s, name);
  }

  /** Distance still to run, metres. @param s current arc length */
  remaining(s: number) { return Math.abs(this.targetS - s); }

  /**
   * Produce a frame of driver input.
   */
  update(dt: number, body: import('./VehicleBody.ts').VehicleBody): {throttle:number, brake:number, steer:number, handbrake:boolean, gear:number} {
    const c = this.controls;
    c.handbrake = false;
    c.gear = 1;
    if (!this.road || !this.road.pts.length) { c.throttle = 0; c.brake = 1; c.steer = 0; return c; }

    const s = body.roadS;
    const toGo = this.targetS - s;
    this.dir = toGo >= 0 ? 1 : -1;
    const dist = Math.abs(toGo);

    // ---- look-ahead point --------------------------------------------------
    const v = Math.max(0, body.vLong);
    const Ld = clamp(7 + v * 1.05, 9, 34);
    this.road.at(s + this.dir * Ld, this._p);

    // A driver cuts the corner: bias the aim point toward the inside by up to
    // 1.6 m, which is what stops the car tracking the exact centreline like a
    // tram and makes a bend read as a line through it.
    const k = this.road.curvature(s, Ld + 26);
    const kSign = this._turnSign(s, Ld);
    const inside = clamp(k * 900, 0, 1) * 1.6 * kSign;
    const nx = -this._p.tz, nz = this._p.tx;             // left normal
    const aimX = this._p.x + nx * inside;
    const aimZ = this._p.z + nz * inside;

    // ---- pure pursuit ------------------------------------------------------
    const dx = aimX - body.pos.x, dz = aimZ - body.pos.z;
    const fx = Math.sin(body.heading), fz = Math.cos(body.heading);
    const rx = Math.cos(body.heading), rz = -Math.sin(body.heading);
    const lf = dx * fx + dz * fz;
    const lr = dx * rx + dz * rz;
    const L2 = lf * lf + lr * lr;
    // required path curvature to reach the aim point, then the steer angle
    const kappa = L2 > 0.25 ? (2 * lr) / L2 : 0;
    const wheelbase = body.a + body.b;
    let delta = Math.atan(kappa * wheelbase);
    // if the aim point is behind us (spun round, or reversing out) turn hard
    if (lf < 0) delta = Math.sign(lr || 1) * 0.6;

    const lock = 0.6;
    let steer = clamp(delta / lock, -1, 1) * 1.35;
    // damp yaw oscillation: bleed off some steering when already rotating
    steer -= body.yawRate * 0.28;
    this._steerSmooth += (clamp(steer, -1, 1) - this._steerSmooth) * Math.min(1, dt * 9);
    c.steer = this._steerSmooth;

    // ---- speed target ------------------------------------------------------
    // slow for the tightest bend inside the braking distance, and for the
    // destination itself
    const brakeDist = (v * v) / (2 * A_BRAKE) + 12;
    const kAhead = this.road.curvature(s, Math.min(220, Math.max(50, brakeDist)));
    let want = kAhead > 1e-4 ? Math.sqrt(A_LAT / kAhead) : this.cruise;
    want = Math.min(want, this.cruise);
    // arrive: bleed to a stop over the last stretch
    const stopV = Math.sqrt(Math.max(0, 2 * A_BRAKE * Math.max(0, dist - 4)));
    want = Math.min(want, stopV);
    if (dist < 3.5) want = 0;
    // off the tarmac he backs right off
    if (body.roadDist > body.road.width * 1.4) want = Math.min(want, 9);
    this._targetSpeed = want;

    const err = want - v;
    if (err > 0.4) {
      c.throttle = clamp(err * 0.22, 0, 1);
      c.brake = 0;
    } else if (err < -0.8) {
      c.throttle = 0;
      c.brake = clamp(-err * 0.16, 0, 1);
    } else {
      c.throttle = clamp(0.12 + err * 0.1, 0, 0.35);
      c.brake = 0;
    }
    if (want === 0 && v < 0.6) { c.brake = 1; c.throttle = 0; this.arrived = true; }
    return c;
  }

  /**
   * Which way the road turns over the look-ahead: +1 for a left-hander.
   * @param s @param Ld
   */
  _turnSign(s: number, Ld: number) {
    const h0 = this.road.headingAt(s);
    const h1 = this.road.headingAt(s + this.dir * (Ld + 20));
    let d = (h1 - h0) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    // heading increases clockwise from above, so a positive delta is a right
    return d > 0 ? -1 : 1;
  }
}

function clamp(v: number, a: number, b: number) { return v < a ? a : v > b ? b : v; }
