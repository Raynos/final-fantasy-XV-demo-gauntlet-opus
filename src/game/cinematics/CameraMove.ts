import * as THREE from 'three';
import { Noise } from '../../util/Noise.ts';
import { ease, lerp, catmull, clamp01 } from './Easing.ts';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * A single cinematic set-up: one continuous camera move between two cuts.
 *
 * A shot is a list of keyframes over its own local clock. Each key carries a
 * camera position, a look-at target, a focal length (as vertical FOV) and an
 * optional dutch roll; the sampler eases between them and — with three or more
 * keys — runs a Catmull-Rom through the positions so a dolly curves rather than
 * hinging at every key.
 *
 * On top of that sit the two layers that separate a *filmed* shot from a lerped
 * one:
 *
 * - **Handheld.** Low-frequency simplex on all three axes plus a slow roll
 *   wobble, scaled by `handheld`. A locked-off tripod shot sets it to 0; a
 *   shoulder-mounted follow wants 1.
 * - **Breathe.** A sub-hertz drift on the boom arm. Even a "static" shot in a
 *   real film has it, and its absence is the single loudest tell.
 *
 * ```js
 * const shot = new Shot({
 *   t0: 0, t1: 7.5, handheld: 0.5, fov: 34,
 *   keys: [
 *     { t: 0,   pos: [..], target: [..] },
 *     { t: 7.5, pos: [..], target: [..], ease: 'outExpo' },
 *   ],
 * });
 * shot.sample(t, out);   // out: { pos, target, fov, roll }
 * ```
 */
export class Shot {
  /**
   * @param {object} def
   * @param {number} def.t0 scene time this shot cuts in
   * @param {number} def.t1 scene time it cuts out
   * @param {Array<object>} def.keys keyframes, `t` relative to `t0`
   * @param {number} [def.fov] default vertical FOV for keys that omit one
   * @param {number} [def.handheld] 0..1 operator noise
   * @param {number} [def.breathe] 0..1 slow boom drift
   * @param {number|'auto'|'subject'} [def.focus] DOF focus: metres, or a mode
   * @param {number} [def.fStop] lens aperture for this shot
   * @param {string|string[]} [def.aim] staged actor id(s) to track live; the
   *   keyframed targets are then only a fallback
   * @param {number} [def.aimU] metres above the actor's staged foot position to aim
   *   at — roughly 1.5 for a head, 1.3 for a chest
   * @param {number} [def.seed] noise seed so two shots never wobble in sync
   */
  constructor(def) {
    this.t0 = def.t0;
    this.t1 = def.t1;
    this.dur = Math.max(0.001, def.t1 - def.t0);
    this.keys = (def.keys || []).map((k, i, a) => ({
      t: k.t ?? (i / Math.max(1, a.length - 1)) * (def.t1 - def.t0),
      pos: new THREE.Vector3().fromArray(k.pos),
      target: new THREE.Vector3().fromArray(k.target),
      fov: k.fov ?? def.fov ?? 40,
      roll: k.roll ?? 0,
      ease: ease(k.ease || def.ease || 'inOutSine'),
    }));
    this.handheld = def.handheld ?? 0.35;
    this.breathe = def.breathe ?? 1;
    this.focus = def.focus ?? 'auto';
    this.fStop = def.fStop ?? null;
    this.aim = def.aim || null;
    this.aimU = def.aimU ?? 1.45;
    this.spline = def.spline !== false && this.keys.length > 2;
    this.label = def.label || '';
    this._noise = new Noise((def.seed ?? 7717) | 0);
    this._out = {
      pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 40, roll: 0,
    };
  }

  /** True while scene time `t` belongs to this shot. */
  covers(t) { return t >= this.t0 && t < this.t1; }

  /**
   * Sample the move.
   * @param {number} t scene time
   * @returns {{pos:THREE.Vector3, target:THREE.Vector3, fov:number, roll:number}}
   */
  sample(t) {
    const local = t - this.t0;
    const keys = this.keys;
    const out = this._out;
    if (!keys.length) return out;
    if (keys.length === 1) {
      out.pos.copy(keys[0].pos);
      out.target.copy(keys[0].target);
      out.fov = keys[0].fov;
      out.roll = keys[0].roll;
      return this._layers(out, local);
    }

    let i = 0;
    while (i < keys.length - 2 && keys[i + 1].t <= local) i++;
    const a = keys[i], b = keys[i + 1];
    const span = Math.max(1e-4, b.t - a.t);
    const raw = clamp01((local - a.t) / span);
    const f = b.ease(raw);

    if (this.spline) {
      // Global arc parameter so the spline runs through every key, not just
      // this segment. Easing is still per-segment: the *shape* of the path and
      // the *pacing* along it are separate authoring concerns.
      const p0 = keys[Math.max(0, i - 1)], p3 = keys[Math.min(keys.length - 1, i + 2)];
      out.pos.set(
        catmull(p0.pos.x, a.pos.x, b.pos.x, p3.pos.x, f),
        catmull(p0.pos.y, a.pos.y, b.pos.y, p3.pos.y, f),
        catmull(p0.pos.z, a.pos.z, b.pos.z, p3.pos.z, f),
      );
      out.target.set(
        catmull(p0.target.x, a.target.x, b.target.x, p3.target.x, f),
        catmull(p0.target.y, a.target.y, b.target.y, p3.target.y, f),
        catmull(p0.target.z, a.target.z, b.target.z, p3.target.z, f),
      );
    } else {
      out.pos.lerpVectors(a.pos, b.pos, f);
      out.target.lerpVectors(a.target, b.target, f);
    }
    out.fov = lerp(a.fov, b.fov, f);
    out.roll = lerp(a.roll, b.roll, f);
    return this._layers(out, local);
  }

  /** Handheld + breathe, applied in world space around the sampled boom. */
  _layers(out, local) {
    const n = this._noise;
    const hh = this.handheld;
    if (this.breathe > 0) {
      const b = this.breathe;
      out.pos.x += n.simplex2(local * 0.11, 3.1) * 0.085 * b;
      out.pos.y += n.simplex2(local * 0.09, 17.4) * 0.070 * b;
      out.pos.z += n.simplex2(local * 0.10, 41.7) * 0.085 * b;
      out.target.x += n.simplex2(local * 0.08, 61.3) * 0.045 * b;
      out.target.y += n.simplex2(local * 0.07, 77.9) * 0.038 * b;
    }
    if (hh > 0) {
      out.pos.x += n.simplex2(local * 0.72, 101.3) * 0.032 * hh;
      out.pos.y += n.simplex2(local * 0.61, 131.7) * 0.040 * hh;
      out.pos.z += n.simplex2(local * 0.68, 157.1) * 0.032 * hh;
      out.target.x += n.simplex2(local * 0.55, 181.9) * 0.052 * hh;
      out.target.y += n.simplex2(local * 0.49, 199.3) * 0.044 * hh;
      out.roll += n.simplex2(local * 0.37, 223.7) * 0.010 * hh;
    }
    return out;
  }
}

/**
 * A staging frame: an origin plus an orthonormal basis, so a whole scene can be
 * authored in "metres forward / metres left / metres up" and then dropped
 * wherever the world actually put the prop it is staged around.
 *
 * This is the difference between a cutscene that works and one that has to be
 * re-tuned every time another agent moves a landmark.
 */
export class Frame {
  /**
   * @param {THREE.Vector3} origin
   * @param {THREE.Vector3} forward world direction the scene faces
   */
  constructor(origin, forward) {
    this.origin = origin.clone();
    this.fwd = forward.clone().setY(0).normalize();
    if (this.fwd.lengthSq() < 1e-6) this.fwd.set(0, 0, 1);
    this.right = new THREE.Vector3().crossVectors(this.fwd, UP).normalize().negate();
    this.up = UP.clone();
    /**
     * Surface `ground()` resolves against, when the scene does not stand on the
     * terrain. Null means "ask the terrain".
     * @type {number|null}
     */
    this.floor = null;
    this._v = new THREE.Vector3();
  }

  /**
   * Pin the frame to a built surface instead of the terrain heightfield.
   *
   * Hammerhead's apron is a graded pad three metres above the ground it was cut
   * into, so a scene staged on it and snapped to `Terrain.heightAt` puts four
   * actors and the camera underneath the tarmac. Anything authored on a deck,
   * a pad or a bridge wants this.
   *
   * @param {number|null} y world height of the surface
   * @returns {Frame} this
   */
  setFloor(y) { this.floor = y ?? null; return this; }

  /**
   * A world point from scene-local coordinates.
   * @param {number} f metres forward along the scene axis
   * @param {number} r metres to the left of it (screen-left when looking along +f)
   * @param {number} u metres up
   * @returns {number[]} `[x, y, z]`, ready for a keyframe
   */
  at(f, r, u = 0) {
    const v = this._v.copy(this.origin)
      .addScaledVector(this.fwd, f)
      .addScaledVector(this.right, r)
      .addScaledVector(this.up, u);
    return [v.x, v.y, v.z];
  }

  /**
   * Same as {@link at} but snapped to the ground, plus `u` metres. "The ground"
   * is {@link setFloor}'s surface if one was set, else the terrain.
   */
  ground(terrain, f, r, u = 0) {
    const v = this._v.copy(this.origin).addScaledVector(this.fwd, f).addScaledVector(this.right, r);
    if (this.floor != null) return [v.x, this.floor + u, v.z];
    const y = terrain && terrain.heightAt ? terrain.heightAt(v.x, v.z) : this.origin.y;
    return [v.x, y + u, v.z];
  }

  /** Vector3 form of {@link at}. */
  vec(f, r, u = 0) { return new THREE.Vector3().fromArray(this.at(f, r, u)); }

  /** Yaw (radians) that makes an actor's +Z axis face along the scene axis. */
  get yaw() { return Math.atan2(this.fwd.x, this.fwd.z); }
}

export { UP };
