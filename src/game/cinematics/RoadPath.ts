import * as THREE from 'three';

/**
 * A staging frame that follows the highway instead of a straight line.
 *
 * {@link Frame} is enough for a scene that happens in one spot. A scene that
 * *travels* — the opening pushes the Regalia seventy metres — cannot use one:
 * the road curves, so a straight frame walks the car off the tarmac and into
 * the scrub over the length of the move, and every shot framed against that
 * frame is then wrong by a few metres in a way that reads as bad composition
 * rather than as a bug.
 *
 * This resamples `Ecology.roadSamples()` by arc length and exposes the same
 * `(forward, left, up)` vocabulary, with `forward` measured *along the road*
 * from an anchor point and `left` measured perpendicular to the local tangent.
 * It also remembers the lane offset of the anchor, so a car parked 1.6 m right
 * of the centreline stays 1.6 m right of the centreline for the whole push.
 */
export class RoadPath {
  _t!: THREE.Vector3;
  _v!: THREE.Vector3;
  fwd!: any;
  i0!: any;
  lane!: number;
  origin!: any;
  pts!: any;
  right!: THREE.Vector3;
  s0!: any;
  sign!: number;
  terrain!: any;
  up!: THREE.Vector3;
  /**
   * @param {object} opts
   * 
   */
  constructor(samples: Array<{x:number,z:number,s:number,tx:number,tz:number}>, { origin, toward, terrain }: { origin?: THREE.Vector3, toward?: THREE.Vector3, terrain?: any } = {}) {
    // arc-length order, de-duplicated
    this.pts = samples.slice().sort((a, b) => a.s - b.s);
    this.terrain = terrain || null;
    this.origin = origin ? origin.clone() : new THREE.Vector3();

    // nearest sample to the anchor
    let best = 0, bestD = Infinity;
    for (let i = 0; i < this.pts.length; i++) {
      const d = (this.pts[i].x - this.origin.x) ** 2 + (this.pts[i].z - this.origin.z) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    this.i0 = best;
    this.s0 = this.pts[best] ? this.pts[best].s : 0;

    // run the path in whichever direction points at `toward`
    this.sign = 1;
    if (toward) {
      const t = this._tangentAtS(this.s0);
      if (t.x * (toward.x - this.origin.x) + t.z * (toward.z - this.origin.z) < 0) this.sign = -1;
    }

    // lane: how far off the centreline the anchor actually sits
    const c = this.pts[best];
    if (c) {
      const t = this._tangentAtS(this.s0);
      const lx = t.z, lz = -t.x;                       // screen-left of the tangent
      this.lane = (this.origin.x - c.x) * lx + (this.origin.z - c.z) * lz;
    } else {
      this.lane = 0;
    }

    this._v = new THREE.Vector3();
    this._t = new THREE.Vector3();
    /** Compatibility with {@link Frame}: the tangent at the anchor. */
    this.fwd = this.tangent(0).clone();
    this.right = new THREE.Vector3(this.fwd.z, 0, -this.fwd.x);
    this.up = new THREE.Vector3(0, 1, 0);
  }

  /** Centreline point at arc length `s`, linearly interpolated. */
  _atS(s: any, out = new THREE.Vector3()) {
    const p = this.pts;
    if (!p.length) return out.copy(this.origin);
    if (s <= p[0].s) return out.set(p[0].x, 0, p[0].z);
    if (s >= p[p.length - 1].s) return out.set(p[p.length - 1].x, 0, p[p.length - 1].z);
    let lo = 0, hi = p.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m].s <= s) lo = m; else hi = m; }
    const k = (s - p[lo].s) / Math.max(1e-6, p[hi].s - p[lo].s);
    return out.set(p[lo].x + (p[hi].x - p[lo].x) * k, 0, p[lo].z + (p[hi].z - p[lo].z) * k);
  }

  _tangentAtS(s: any, out = new THREE.Vector3()) {
    const p = this.pts;
    if (p.length < 2) return out.set(0, 0, 1);
    let lo = 0, hi = p.length - 1;
    if (s > p[0].s && s < p[hi].s) {
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p[m].s <= s) lo = m; else hi = m; }
    } else if (s >= p[hi].s) { lo = hi - 1; }
    const a = p[lo], b = p[lo + 1] || p[lo];
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    return out.set(dx / len, 0, dz / len);
  }

  /** Unit tangent `f` metres along the path, already signed toward the goal. */
  tangent(f: any, out = this._t) {
    this._tangentAtS(this.s0 + f * this.sign, out);
    if (this.sign < 0) out.negate();
    return out;
  }

  /** Yaw that faces an actor's +Z axis down the path at `f`. */
  yawAt(f: any) { const t = this.tangent(f, this._t); return Math.atan2(t.x, t.z); }

  /**
   * A world point: `f` metres along the road, `l` metres to the screen-left of
   * it (lane offset included), `u` metres above the origin plane.
   * @returns `[x, y, z]`
   */
  at(f: any, l = 0, u = 0): number[] {
    const c = this._atS(this.s0 + f * this.sign, this._v);
    const t = this.tangent(f, this._t);
    const lx = t.z, lz = -t.x;
    const off = this.lane + l;
    return [c.x + lx * off, this.origin.y + u, c.z + lz * off];
  }

  /** Same as {@link at}, but `u` is measured from the terrain at that point. */
  ground(terrain: any, f: any, l = 0, u = 0) {
    const p = this.at(f, l, 0);
    const t = terrain || this.terrain;
    const y = t && t.heightAt ? t.heightAt(p[0], p[2]) : this.origin.y;
    return [p[0], y + u, p[2]];
  }

  /** Vector3 form of {@link at}. */
  vec(f: any, l = 0, u = 0) { return new THREE.Vector3().fromArray(this.at(f, l, u)); }

  /** Frame-compatible yaw at the anchor. */
  get yaw() { return this.yawAt(0); }
}

export default RoadPath;
