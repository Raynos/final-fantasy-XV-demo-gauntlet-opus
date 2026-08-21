import * as THREE from 'three';

/**
 * The Regalia's chassis: an arcade-sim vehicle model.
 *
 * Planar dynamics are a two-axle bicycle model with a saturating tyre — slip
 * angles front and rear, lateral force `-mu*Fz*tanh(C*alpha/(mu*Fz))`, load
 * transfer front/rear under acceleration, and a friction circle that steals
 * lateral grip from a driven or braked axle. That saturation is the whole
 * point: below the limit the car is planted and the steering is linear, and
 * past it the tail lets go progressively instead of snapping. The handbrake
 * simply collapses rear mu.
 *
 * Vertically it is a heave/pitch/roll body riding four independent springs.
 * Each wheel samples `Terrain.heightAt` at its own contact patch; the mean
 * drives a critically-damped heave spring, the front/rear and left/right
 * differences drive the terrain component of pitch and roll, and body
 * acceleration adds the weight transfer on top. A wheel that cannot reach the
 * ground within its travel loses its grip contribution, so cresting a rise
 * genuinely goes light.
 *
 * It never integrates through the ground: the chassis height is spring-bound
 * to the sampled surface and hard-clamped above the highest wheel, and the
 * step is sub-divided so no single sub-step moves more than ~0.8 m.
 *
 * The Regalia is 1.9 tonnes of land yacht on a 4 m wheelbase. It should feel
 * heavy, deliberate and a little lazy on turn-in — never like a hot hatch.
 */

const G = 9.81;

/** Longitudinal drive force available at a given road speed, newtons. */
function engineCurve(v: any, maxForce: any, vMax: any) {
  if (v < 0) return maxForce;                       // rolling backwards: full shove
  const t = Math.min(1, v / vMax);
  // flat-ish to 35% of vMax then falling away; zero at vMax
  return maxForce * (1 - t * t * t) * (0.55 + 0.45 * (1 - t * 0.5));
}

export class VehicleBody {
  _axPrev!: any;
  _fwd!: THREE.Vector3;
  _gy!: number[];
  _gyF!: number;
  _gyL!: number;
  _gyR!: number;
  _gyRt!: number;
  _hit!: any;
  _n!: THREE.Vector3;
  _noiseT!: number;
  a!: number;
  airborne!: boolean;
  b!: number;
  bound!: any;
  brakeForce!: number;
  chassisY!: number;
  collision!: any;
  cornerF!: number;
  cornerR!: number;
  dragK!: number;
  hCG!: number;
  halfTrack!: number;
  handbrakeForce!: number;
  heading!: number;
  heaveV!: number;
  izz!: number;
  landImpact!: number;
  mass!: number;
  maxForce!: number;
  muDirt!: number;
  muRoad!: number;
  muShoulder!: number;
  muTypeD!: number;
  odometer!: number;
  offRoadMode!: boolean;
  pitch!: number;
  pos!: THREE.Vector3;
  reverseForce!: number;
  road!: any;
  roadDist!: number;
  roadLat!: number;
  roadS!: number;
  roll!: number;
  rollK!: number;
  rough!: number;
  slide!: number;
  speed!: number;
  spin!: number;
  steer!: number;
  steerMaxHigh!: number;
  steerMaxLow!: number;
  steerRate!: number;
  steerReturn!: number;
  terrain!: any;
  travel!: number;
  vLat!: number;
  vLong!: number;
  vMax!: number;
  vMaxReverse!: number;
  vel!: THREE.Vector3;
  wetness!: number;
  wheelR!: number;
  wheels!: any[];
  yawDamp!: number;
  yawRate!: number;
  /** Highest support under a wheel: town slabs and pads before raw terrain. */
  _groundAt(t: any, x: any, z: any, fromY: any) {
    if (this.collision && this.collision.ready) {
      const g = this.collision.groundAt(x, z, fromY, 1.2, 4);
      if (g) return g.y;
    }
    return t ? t.heightAt(x, z) : 0;
  }

  /**
   * @param {object} opts
   * */
  constructor({ terrain, road, collision = null }: { terrain: any, road: import('./RoadPath.ts').RoadPath, collision?: any }) {
    this.terrain = terrain;
    this.road = road;
    this.collision = collision;
    /** Half-extent of the drivable world, metres. 0 disables the clamp. */
    this.bound = terrain && terrain.size ? terrain.size * 0.5 - 60 : 0;

    // --- geometry (metres) ------------------------------------------------
    this.a = 1.98;              // CG to front axle
    this.b = 2.05;              // CG to rear axle
    this.halfTrack = 0.90;
    this.wheelR = 0.4765;
    this.hCG = 0.62;
    this.travel = 0.17;         // suspension travel each way

    // --- mass ---------------------------------------------------------------
    this.mass = 1920;
    this.izz = this.mass * 1.82 * 1.82;

    // --- powertrain -----------------------------------------------------------
    this.maxForce = 9600;
    this.vMax = 56;             // ~200 km/h
    this.reverseForce = 4200;
    this.vMaxReverse = 12;
    this.brakeForce = 17500;
    this.handbrakeForce = 9000;
    this.dragK = 0.52;          // 0.5*rho*Cd*A
    this.rollK = 0.016;

    // --- tyres ----------------------------------------------------------------
    this.cornerF = 12.5;        // cornering stiffness / N per rad, normalised
    this.cornerR = 14.0;
    this.muRoad = 1.16;
    this.muShoulder = 0.80;
    this.muDirt = 0.56;
    this.muTypeD = 0.98;        // off-road tyres fitted
    this.yawDamp = 0.55;

    // --- steering -------------------------------------------------------------
    this.steerMaxLow = 0.60;    // rad at standstill
    this.steerMaxHigh = 0.115;  // rad at vMax
    this.steerRate = 3.2;       // rad/s of wheel movement
    this.steerReturn = 4.6;

    // --- state ----------------------------------------------------------------
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.yawRate = 0;
    this.vLong = 0;
    this.vLat = 0;
    this.steer = 0;
    this.pitch = 0;
    this.roll = 0;
    this.chassisY = 0;
    this.heaveV = 0;
    this.speed = 0;
    /** 0..1 how far past the limit the rear tyres are. */
    this.slide = 0;
    /** 0..1 wheelspin under power. */
    this.spin = 0;
    /** 0..1 how rough the surface under the tyres is. */
    this.rough = 0;
    /** true once all four wheels are off the ground. */
    this.airborne = false;
    /** Vertical speed at the last touchdown, m/s. Zero on any other frame. */
    this.landImpact = 0;
    /** Signed lateral offset from the road centreline, metres (+ = left). */
    this.roadLat = 0;
    /** Distance from the centreline. */
    this.roadDist = 0;
    /** Arc length along the highway. */
    this.roadS = 0;
    /** Metres travelled since reset — drives fuel and AP. */
    this.odometer = 0;
    /** Lift the road restriction (the Type-D off-road package). */
    this.offRoadMode = false;
    /** Extra grip loss from rain, 0..1. Driven by Weather. */
    this.wetness = 0;

    this.wheels = [];
    for (let i = 0; i < 4; i++) {
      this.wheels.push({
        front: i < 2,
        side: i % 2 === 0 ? 1 : -1,    // +1 = left
        contactY: 0, travel: 0, spinAngle: 0, load: 0, grounded: true,
      });
    }

    this._hit = null;
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._n = new THREE.Vector3();
    this._gy = [0, 0, 0, 0];
    this._noiseT = 0;
  }

  /** Place the car, at rest, facing `heading`. */
  reset(x: any, z: any, heading: any) {
    this.pos.set(x, 0, z);
    this.heading = heading;
    this.yawRate = 0;
    this.vLong = 0; this.vLat = 0;
    this.vel.set(0, 0, 0);
    this.steer = 0;
    this.pitch = 0; this.roll = 0;
    this.heaveV = 0;
    this._sampleGround();
    this.chassisY = this._groundAvg + this.wheelR;
    this.pos.y = this.chassisY;
  }

  /** Unit forward vector in world space. @returns */
  forward(): THREE.Vector3 { return this._fwd.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }

  /** Unit right vector in world space. @returns */
  right(): THREE.Vector3 { return this._right.set(Math.cos(this.heading), 0, -Math.sin(this.heading)); }

  /** Local (forward, right) offset of a wheel from the CG. */
  _wheelOffset(w: any, out: any) {
    out.x = w.front ? this.a : -this.b;              // forward
    out.y = -w.side * this.halfTrack;                // right (+side is left)
    return out;
  }

  /** Sample the four contact patches. Five `heightAt` calls a step. */
  _sampleGround() {
    const t = this.terrain;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const rx = Math.cos(this.heading), rz = -Math.sin(this.heading);
    // Reference height under the middle of the car. A heightfield sampled at
    // clipmap resolution can hand back a single-cell spire; without a filter
    // against something stable, one such sample under one wheel throws the
    // whole chassis metres into the air for a frame.
    const c = this._groundAt(t, this.pos.x, this.pos.z, this.pos.y);
    const lo = c - 2.2, hiClamp = c + 2.2;
    let sum = 0, hi = -1e9;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      const lf = w.front ? this.a : -this.b;
      const lr = -w.side * this.halfTrack;
      const x = this.pos.x + fx * lf + rx * lr;
      const z = this.pos.z + fz * lf + rz * lr;
      let y = this._groundAt(t, x, z, this.pos.y);
      if (y < lo) y = lo; else if (y > hiClamp) y = hiClamp;
      this._gy[i] = y;
      w.contactY = y;
      sum += y;
      if (y > hi) hi = y;
    }
    this._groundAvg = sum * 0.25;
    this._groundMax = hi;
    // front/rear and left/right means for the terrain attitude
    this._gyF = (this._gy[0] + this._gy[1]) * 0.5;
    this._gyR = (this._gy[2] + this._gy[3]) * 0.5;
    this._gyL = (this._gy[0] + this._gy[2]) * 0.5;
    this._gyRt = (this._gy[1] + this._gy[3]) * 0.5;
  }

  /** Surface friction coefficient under the tyres right now. */
  _surfaceMu() {
    const d = this.roadDist;
    const w = this.road ? this.road.width : 4.6;
    const sh = this.road ? this.road.shoulder : 8.0;
    let mu;
    if (d <= w * 0.94) mu = this.muRoad;
    else if (d <= sh) {
      const t = (d - w * 0.94) / Math.max(0.01, sh - w * 0.94);
      mu = this.muRoad + (this.muShoulder - this.muRoad) * t;
    } else {
      mu = this.offRoadMode ? this.muTypeD : this.muDirt;
    }
    if (this.offRoadMode) mu = Math.max(mu, this.muTypeD * 0.92);
    return mu * (1 - 0.22 * this.wetness);
  }

  /**
   * Advance the vehicle.
   * @param dt seconds
   */
  step(dt: number, c: {throttle:number, brake:number, steer:number, handbrake:boolean}) {
    const d = Math.min(dt, 1 / 30);
    if (d <= 0) return;
    // never move more than ~0.8 m in one sub-step, so a 200 km/h car cannot
    // skip over a berm or leave the road query behind
    const n = Math.min(4, Math.max(1, Math.ceil((this.speed * d) / 0.8)));
    const sub = d / n;
    for (let i = 0; i < n; i++) this._substep(sub, c);
  }

  _substep(dt: any, c: any) {
    const throttle = clamp01(c.throttle || 0);
    const brake = clamp01(c.brake || 0);
    const hand = c.handbrake ? 1 : 0;
    this._noiseT += dt;

    // ---- steering: speed-sensitive lock, rate-limited ---------------------
    const spd = Math.abs(this.vLong);
    const lock = lerp(this.steerMaxLow, this.steerMaxHigh, clamp01(spd / this.vMax));
    const want = clamp(c.steer || 0, -1, 1) * lock;
    const rate = (Math.abs(want) < Math.abs(this.steer) ? this.steerReturn : this.steerRate);
    const dSteer = clamp(want - this.steer, -rate * dt, rate * dt);
    this.steer += dSteer;
    this.steer = clamp(this.steer, -lock, lock);
    const delta = this.steer;

    // ---- road frame -------------------------------------------------------
    if (this.road) {
      this._hit = this.road.nearest(this.pos.x, this.pos.z, this._hit || this.road.makeHit());
      this.roadLat = this._hit.lat;
      this.roadDist = this._hit.dist;
      this.roadS = this._hit.s;
    }

    // ---- loads ------------------------------------------------------------
    const L = this.a + this.b;
    const axPrev = this._axPrev || 0;
    const staticF = this.mass * G * (this.b / L);
    const staticR = this.mass * G * (this.a / L);
    const transfer = clamp(this.mass * axPrev * (this.hCG / L), -staticF * 0.7, staticR * 0.7);
    let FzF = Math.max(0, staticF - transfer);
    let FzR = Math.max(0, staticR + transfer);

    // a wheel hanging in the air carries nothing
    const fUp = (this.wheels[0].grounded ? 0.5 : 0) + (this.wheels[1].grounded ? 0.5 : 0);
    const rUp = (this.wheels[2].grounded ? 0.5 : 0) + (this.wheels[3].grounded ? 0.5 : 0);
    FzF *= fUp; FzR *= rUp;
    this.airborne = fUp + rUp < 0.01;

    const mu = this._surfaceMu();
    const muF = mu;
    const muR = mu * (1 - 0.62 * hand);

    // ---- longitudinal -----------------------------------------------------
    const vl = this.vLong;
    let Fx = 0;
    const reversing = throttle > 0.02 && vl < 0.6 && brake < 0.02 && c.gear === -1;
    if (c.gear === -1) {
      Fx -= throttle * this.reverseForce * (vl < -this.vMaxReverse ? 0 : 1);
    } else {
      Fx += throttle * engineCurve(vl, this.maxForce, this.vMax);
    }
    if (brake > 0.001) {
      const bf = brake * this.brakeForce;
      // brakes oppose motion and cannot reverse it inside a step
      const stop = Math.abs(vl) / Math.max(1e-4, dt) * this.mass;
      Fx -= Math.sign(vl) * Math.min(bf, stop);
    }
    if (hand) {
      const stop = Math.abs(vl) / Math.max(1e-4, dt) * this.mass;
      Fx -= Math.sign(vl) * Math.min(this.handbrakeForce, stop);
    }
    Fx -= this.dragK * vl * Math.abs(vl);
    Fx -= this.rollK * this.mass * G * Math.sign(vl) * Math.min(1, Math.abs(vl) * 2);
    // rough ground eats momentum
    this.rough = this.roadDist > (this.road ? this.road.width : 4.6)
      ? clamp01((this.roadDist - (this.road ? this.road.width : 4.6)) / 6) : 0;
    if (this.rough > 0 && !this.offRoadMode) Fx -= this.rough * 900 * Math.sign(vl);
    else if (this.rough > 0) Fx -= this.rough * 320 * Math.sign(vl);

    // ---- tyre slip angles --------------------------------------------------
    const u = Math.max(2.0, Math.abs(vl));
    const sgn = vl >= 0 ? 1 : -1;
    const alphaF = Math.atan2(this.vLat + this.a * this.yawRate, u) * sgn - delta;
    const alphaR = Math.atan2(this.vLat - this.b * this.yawRate, u) * sgn;

    // friction circle: whatever the drive/brake force is using is not
    // available sideways
    const capF = muF * FzF;
    const capR = muR * FzR;
    const usedR = Math.min(1, Math.abs(Fx) / Math.max(1, capR * 1.6));
    const usedF = brake > 0.01 ? Math.min(1, (brake * this.brakeForce * 0.45) / Math.max(1, capF * 1.6)) : 0;
    const availF = capF * Math.sqrt(Math.max(0.04, 1 - usedF * usedF));
    const availR = capR * Math.sqrt(Math.max(0.04, 1 - usedR * usedR));

    const FyF = -availF * Math.tanh((this.cornerF * alphaF * FzF) / Math.max(1, availF));
    const FyR = -availR * Math.tanh((this.cornerR * alphaR * FzR) / Math.max(1, availR));

    // how far past the limit the rear is — drives the slide feel and the dust
    const satR = Math.abs(this.cornerR * alphaR * FzR) / Math.max(1, availR);
    this.slide = clamp01((satR - 0.85) * 1.3) * clamp01(Math.abs(vl) / 4);
    this.spin = clamp01((Math.abs(Fx) / Math.max(1, capR * 1.15) - 0.85) * 2.2) * (throttle > 0.3 ? 1 : 0);

    // ---- rail: FFXV's Regalia is a road car ---------------------------------
    // The restoring pull has to be *world* space, resolved into the car's own
    // axes. A purely sideways nudge does nothing once the car is pointing away
    // from the road — which is exactly the case where it is most needed, and
    // is how a soft rail ends up letting you park in the mountains.
    let railFwd = 0, railLat = 0;
    const fxh = Math.sin(this.heading), fzh = Math.cos(this.heading);
    const rxh = Math.cos(this.heading), rzh = -Math.sin(this.heading);
    if (!this.offRoadMode && this.road && this._hit) {
      const edge = this.road.width * 1.05;
      const over = this.roadDist - edge;
      if (over > 0) {
        const dx = this._hit.x - this.pos.x, dz = this._hit.z - this.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        const k = Math.min(1, over / 8);
        // gentle at the verge, firm at the fence line, never a brick wall:
        // the hard stop is a position clamp further down, not a huge force
        const a = Math.min(6.0, 1.4 * k + 4.2 * k * k);
        const wx = (dx / d) * a, wz = (dz / d) * a;
        railFwd = wx * fxh + wz * fzh;
        railLat = wx * rxh + wz * rzh;
      }
    }

    // Gravity along the grade. This is what stops a 1.9 t saloon climbing a
    // scree slope — not an arbitrary penalty, just the hill weighing on it —
    // and it is also why the car runs away from you on a long descent.
    const grade = Math.atan2((this._gyF || 0) - (this._gyR || 0), L);
    Fx -= this.mass * G * Math.sin(grade);

    // ---- integrate ----------------------------------------------------------
    const ax = (Fx - FyF * Math.sin(delta)) / this.mass + this.vLat * this.yawRate;
    const ay = (FyF * Math.cos(delta) + FyR) / this.mass - this.vLong * this.yawRate;
    this._axPrev = ax;

    this.vLong += (ax + railFwd) * dt;
    this.vLat += (ay + railLat) * dt;

    let Mz = this.a * FyF * Math.cos(delta) - this.b * FyR;
    Mz -= this.yawDamp * this.izz * this.yawRate * 0.35;
    this.yawRate += (Mz / this.izz) * dt;

    // low-speed kinematic blend: the linear tyre model has nothing to bite on
    // below walking pace, and parking manoeuvres need to work
    const kin = clamp01(1 - Math.abs(vl) / 6);
    if (kin > 0) {
      const wKin = (vl * Math.tan(delta)) / L;
      this.yawRate = lerp(this.yawRate, wKin, kin * Math.min(1, dt * 12));
      this.vLat *= 1 - kin * Math.min(1, dt * 6);
    }

    this.heading += this.yawRate * dt;
    if (this.heading > Math.PI) this.heading -= Math.PI * 2;
    if (this.heading < -Math.PI) this.heading += Math.PI * 2;

    // stop cleanly instead of creeping
    if (Math.abs(this.vLong) < 0.06 && throttle < 0.02) { this.vLong = 0; this.yawRate *= 0.5; }

    const f = this.forward(), r = this.right();
    this.vel.set(f.x * this.vLong + r.x * this.vLat, 0, f.z * this.vLong + r.z * this.vLat);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    // The fence line. Past 24 m from the centreline the car is simply held —
    // its outward velocity is removed and its position projected back — which
    // reads as "the Regalia will not go there" without the rubber-band shove
    // that a force strong enough to do the same job would feel like.
    if (!this.offRoadMode && this._hit && this.roadDist > 24) {
      const dx = this.pos.x - this._hit.x, dz = this.pos.z - this._hit.z;
      const d = Math.hypot(dx, dz) || 1;
      const ox = dx / d, oz = dz / d;
      // Walk the car back in at a bounded rate rather than snapping it to the
      // line. Un-fitting the off-road package 40 m out would otherwise
      // teleport the whole car sideways in a single frame.
      const pull = Math.min(d - 24, 0.5);
      this.pos.x -= ox * pull;
      this.pos.z -= oz * pull;
      const vOut = this.vel.x * ox + this.vel.z * oz;
      if (vOut > 0) {
        this.vel.x -= ox * vOut; this.vel.z -= oz * vOut;
        this.vLong = this.vel.x * fxh + this.vel.z * fzh;
        this.vLat = this.vel.x * rxh + this.vel.z * rzh;
      }
    }
    // never leave the heightfield, even with the off-road package fitted:
    // outside it `heightAt` has nothing to stand on
    if (this.bound > 0) {
      if (Math.abs(this.pos.x) > this.bound) { this.pos.x = Math.sign(this.pos.x) * this.bound; this.vLong *= 0.4; }
      if (Math.abs(this.pos.z) > this.bound) { this.pos.z = Math.sign(this.pos.z) * this.bound; this.vLong *= 0.4; }
    }
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.odometer += this.speed * dt;

    // ---- vertical: heave spring + per-wheel travel ---------------------------
    this._sampleGround();
    let target = this._groundAvg + this.wheelR;
    // shoulder rumble and off-road chatter, deterministic in time
    if (this.rough > 0.02 && this.speed > 2) {
      const t = this._noiseT;
      target += Math.sin(t * 39.0) * 0.020 * this.rough * clamp01(this.speed / 14)
        + Math.sin(t * 17.3 + 1.7) * 0.014 * this.rough;
    }
    // Suspension while the tyres are on the ground; *gravity* once they are
    // not. A spring alone cannot model a jump: it can only pull the body back
    // at whatever rate its damping allows, so a car that crests a rise and
    // finds the ground 40 m lower floats down like a balloon instead of
    // falling. Beyond one travel's worth of gap the springs are topped out and
    // there is nothing holding the car up.
    const gap = this.chassisY - target;
    const k = 78, cD = 13.5;                      // ~1.4 Hz, well damped
    if (gap > this.travel) this.heaveV -= G * dt;
    else this.heaveV += (-k * gap - cD * this.heaveV) * dt;
    this.heaveV = clamp(this.heaveV, -48, 10);
    this.chassisY += this.heaveV * dt;
    // Ceiling. Six metres of air is already a spectacular jump; anything above
    // that is the heightfield having dropped out from under a car that was
    // faithfully following it, and the honest thing to do is put it back
    // within falling distance rather than let it glide down a cliff face.
    const roof = this._groundMax + this.wheelR + 6;
    if (this.chassisY > roof) this.chassisY = roof;
    const floor = this._groundMax + this.wheelR - this.travel * 0.85;
    if (this.chassisY < floor) {
      /** Vertical speed at the moment of touchdown — camera shake reads it. */
      this.landImpact = Math.max(0, -this.heaveV);
      this.chassisY = floor;
      this.heaveV = Math.max(0, this.heaveV * -0.18);   // a little rebound
    } else this.landImpact = 0;
    this.pos.y = this.chassisY;

    // ---- attitude ------------------------------------------------------------
    const pitchTerrain = -Math.atan2(this._gyF - this._gyR, L);
    const rollTerrain = Math.atan2(this._gyRt - this._gyL, this.halfTrack * 2);
    // weight transfer: nose dives under braking, squats under power, leans out
    const pitchLoad = clamp(-ax * 0.0125, -0.075, 0.075);
    const rollLoad = clamp(-ay * 0.0110, -0.085, 0.085);
    this.pitch = damp(this.pitch, pitchTerrain + pitchLoad, 9, dt);
    this.roll = damp(this.roll, rollTerrain + rollLoad, 9, dt);

    // ---- wheels --------------------------------------------------------------
    const sp = Math.sin(this.pitch), sr = Math.sin(this.roll);
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      const lf = w.front ? this.a : -this.b;
      const lr = -w.side * this.halfTrack;
      const hubY = this.chassisY - lf * sp + lr * sr;
      const wantY = w.contactY + this.wheelR;
      const t = clamp(wantY - hubY, -this.travel, this.travel);
      w.travel = damp(w.travel, t, 22, dt);
      w.grounded = wantY - hubY < this.travel * 0.99;
      w.load = w.grounded ? clamp01(1 - (wantY - hubY) / this.travel) : 0;
      // rolling: road speed plus the slip the driven axle is adding
      const slipK = w.front ? 0 : this.spin * 6;
      w.spinAngle += ((this.vLong * (1 + slipK)) / this.wheelR) * dt;
      if (w.spinAngle > Math.PI * 2) w.spinAngle -= Math.PI * 2;
      if (w.spinAngle < 0) w.spinAngle += Math.PI * 2;
    }
    void reversing;
  }

  /** Speed in km/h, for the HUD. */
  get kmh() { return this.speed * 3.6; }
}

function clamp(v: any, a: any, b: any) { return v < a ? a : v > b ? b : v; }
function clamp01(v: any) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function lerp(a: any, b: any, t: any) { return a + (b - a) * t; }
function damp(a: any, b: any, lambda: any, dt: any) { return b + (a - b) * Math.exp(-lambda * dt); }
