import { el } from '../UIKit.ts';
import type { VirtualPad } from './VirtualPad.ts';

/**
 * A floating-origin thumbstick.
 *
 * Floating rather than fixed because a thumb does not land where a printed
 * circle is: the origin is wherever the finger first touched inside the zone,
 * and the knob is drawn relative to that. The visible ring only appears on
 * touch, so at rest the screen is clean.
 *
 * Writes a pair of `axes` on the shared {@link VirtualPad}. The left stick
 * writes `[0]`/`[1]` (locomotion — `Input.update` negates `[1]`, so forward is
 * negative, as a real stick reports it) and the right writes `[2]`/`[3]`
 * (camera, already scaled by `18 * lookScale` in `Input.update`).
 */

/** Finger travel, in px, that reads as full deflection. */
const RADIUS = 46;

export class Stick {
  root: HTMLElement;
  ring: HTMLElement;
  knob: HTMLElement;
  pad: VirtualPad;
  ax: number;
  ay: number;
  /** `pointerId` of the finger that owns this stick, or -1. */
  id: number;
  ox: number;
  oy: number;

  /**
   * @param side which half of the screen the zone occupies
   * @param axis index of the X axis this stick writes; Y is `axis + 1`
   */
  constructor(pad: VirtualPad, side: 'left' | 'right', axis: number) {
    this.pad = pad;
    this.ax = axis;
    this.ay = axis + 1;
    this.id = -1;
    this.ox = 0;
    this.oy = 0;

    this.root = el(`div.tc-zone.tc-zone-${side}`);
    this.ring = el('div.tc-ring');
    this.knob = el('div.tc-knob');
    this.root.appendChild(this.ring);
    this.root.appendChild(this.knob);
    this._hide();

    this.root.addEventListener('pointerdown', (e: PointerEvent) => {
      if (this.id !== -1) return;
      this.id = e.pointerId;
      this.ox = e.clientX;
      this.oy = e.clientY;
      this.root.setPointerCapture(e.pointerId);
      this._show();
      this._move(0, 0);
      e.preventDefault();
    });
    this.root.addEventListener('pointermove', (e: PointerEvent) => {
      if (e.pointerId !== this.id) return;
      this._move(e.clientX - this.ox, e.clientY - this.oy);
      e.preventDefault();
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId !== this.id) return;
      this.id = -1;
      this.pad.axes[this.ax] = 0;
      this.pad.axes[this.ay] = 0;
      this._hide();
    };
    this.root.addEventListener('pointerup', up);
    this.root.addEventListener('pointercancel', up);
  }

  /** Drop the finger without waiting for an event — a layout change, a hide. */
  reset() {
    this.id = -1;
    this.pad.axes[this.ax] = 0;
    this.pad.axes[this.ay] = 0;
    this._hide();
  }

  _show() {
    this.ring.style.display = 'block';
    this.knob.style.display = 'block';
    this.ring.style.left = `${this.ox}px`;
    this.ring.style.top = `${this.oy}px`;
  }

  _hide() {
    this.ring.style.display = 'none';
    this.knob.style.display = 'none';
  }

  _move(dx: number, dy: number) {
    const d = Math.hypot(dx, dy);
    // Past the ring the stick stays at full deflection and the knob stops at
    // the rim, rather than the finger dragging the origin with it: a player
    // sprinting forward should not have to keep their thumb still.
    const k = d > RADIUS ? RADIUS / d : 1;
    const kx = dx * k, ky = dy * k;
    this.pad.axes[this.ax] = kx / RADIUS;
    this.pad.axes[this.ay] = ky / RADIUS;
    this.knob.style.left = `${this.ox + kx}px`;
    this.knob.style.top = `${this.oy + ky}px`;
  }
}
