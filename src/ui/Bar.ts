import { el, clamp, damp } from './UIKit.ts';

/**
 * A gauge with a delayed "damage chase" secondary fill: the white bar snaps to
 * the new value, a dull red bar hangs behind it for a beat and then slides
 * down to meet it. Used for party HP and enemy HP.
 */
export class Bar {
  /**
   * @param {object} [opts] `{ cls, chase, delay, speed }`
   */
  constructor(opts = {}) {
    const { cls = '', chase = true, delay = 0.42, speed = 2.6 } = opts;
    this.delay = delay;
    this.speed = speed;
    this.node = el(`div.gauge.${cls}`.replace(/\.$/, ''));
    if (chase) { this.chaseEl = el('i.chase'); this.node.appendChild(this.chaseEl); }
    this.fill = el('i.fill');
    this.node.appendChild(this.fill);
    this.v = 1; this.c = 1; this.hold = 0;
    this._lastV = -1; this._lastC = -1;
  }

  /** Add extra classes to the fill element (e.g. `mp`, `hostile`, `armiger`). */
  tint(name) { this.fill.classList.add(name); return this; }

  /** Jump both bars to `v` (0..1) with no chase animation. */
  reset(v) { this.v = this.c = clamp(v, 0, 1); this.hold = 0; this._write(); }

  /**
   * @param {number} v target 0..1
   * @param {number} dt seconds
   */
  set(v, dt) {
    const nv = clamp(v, 0, 1);
    // the first real value snaps: a bar should not chase down from full on boot
    if (!this._init) { this._init = true; this.reset(nv); return; }
    if (nv < this.v - 1e-4) this.hold = this.delay;
    if (nv > this.c) this.c = nv;
    this.v = nv;
    if (this.chaseEl) {
      if (this.hold > 0) this.hold -= dt;
      else if (this.c > this.v) this.c = Math.max(this.v, damp(this.c, this.v - 0.004, this.speed, dt));
    } else this.c = this.v;
    this._write();
  }

  _write() {
    const a = Math.round(this.v * 10000) / 100;
    if (a !== this._lastV) { this.fill.style.width = `${a}%`; this._lastV = a; }
    if (this.chaseEl) {
      const b = Math.round(this.c * 10000) / 100;
      if (b !== this._lastC) { this.chaseEl.style.width = `${b}%`; this._lastC = b; }
    }
  }
}
