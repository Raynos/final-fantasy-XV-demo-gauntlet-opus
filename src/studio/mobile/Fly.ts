import { el } from '../../ui/UIKit.ts';
import { ensureTouchCss } from '../../ui/touch/touch.css.ts';
import { Stick } from '../../ui/touch/Stick.ts';
import { VirtualPad } from '../../ui/touch/VirtualPad.ts';
import type { Freecam } from '../../dev/Freecam.ts';

/**
 * Flying the World Explorer with two thumbs, the way the game already works.
 *
 * ## What this replaces, and why it was wrong
 *
 * The first pass invented a gesture set: drag anywhere to look, **hold for
 * 260 ms to fly forward**, pinch to change speed. Every one of those is a
 * mistake, and the middle one is the reason the report was *"the camera
 * controls are so confusing, wth is going on"*:
 *
 *  - **Look and travel were the same gesture.** Drag slowly to read a horizon
 *    — which is the whole activity — pause for a quarter second, and the camera
 *    launches forward. Nothing on screen said it would, and stopping meant
 *    lifting the finger that was aiming.
 *  - **There was no back, and no strafe.** Forward, up and down. You could not
 *    side-step a rock or back off a wall; the only way to undo an overshoot was
 *    to turn 180 degrees and hold again.
 *  - **Pinch changed speed invisibly**, two orders of magnitude of it, with the
 *    readout in a sheet that a pinching hand covers.
 *
 * ## What it is now
 *
 * The **game's own control layer**, not a lookalike: `Stick` and `VirtualPad`
 * from `src/ui/touch/`, the same classes `TouchControls` installs, so the left
 * thumb moves and the right half looks with exactly the deflection curve, the
 * floating origin and the rim behaviour a player has already learned. One
 * gesture vocabulary across the game and the studio, and no second
 * implementation to drift.
 *
 * The mapping, and it is deliberately the shortest one that is complete:
 *
 * | thumb | does |
 * |---|---|
 * | left stick | forward / back / strafe, in the plane you are looking along |
 * | left stick at the rim | **boost** — 4x, the same gesture that sprints in game |
 * | right half, drag | look |
 * | ▲ / ▼ on the right rail | climb and descend, world-up |
 *
 * Nothing is held to travel and nothing is a timer, so there is no state a
 * finger can enter by accident.
 *
 * ## Why it reads the pad rather than being driven by it
 *
 * `Stick` writes axes onto a `VirtualPad`, which is what `Input.padSource`
 * consumes in the game. The studio has no `Input` pumping, and `Freecam` takes
 * its travel from `axes` (see its docblock), so this owns a small
 * `requestAnimationFrame` that copies one into the other. That is also what
 * lets the boost live here rather than in `Freecam`: a review camera's boost is
 * a studio decision, not an engine one.
 */

/** Multiplier at full stick deflection. The same gesture sprints in game. */
const BOOST = 4;
/**
 * Look sensitivity, in `Freecam` pointer units per pixel of drag.
 *
 * `Freecam.sensitivity` is 0.0022 rad per unit, so 1.6 gives 0.0035 rad/px:
 * a 300 px drag across the short edge of a landscape handset turns 60°. Tuned
 * by dragging it, not derived — and the sign matches the mouse and the game's
 * right stick, where a rightward input turns the view right.
 */
const LOOK = 1.6;

export class FlyRig {
  root: HTMLElement;
  cam: Freecam;
  pad: VirtualPad;
  sticks: Stick[];
  _raf: number;
  _lift: number;

  constructor(parent: HTMLElement, cam: Freecam) {
    this.cam = cam;
    this.pad = new VirtualPad();
    this._raf = 0;
    this._lift = 0;

    ensureTouchCss();
    this.root = el('div', { id: 'studio-fly' });

    // Left draws a base, right draws nothing: the right side is not a stick
    // with a home, it is "drag anywhere on this half to look", and `Stick`'s
    // own docblock records what happened when it was given one.
    this.sticks = [
      new Stick(this.pad, 'left', 0, -1, true),
      new Stick(this.pad, 'right', 2, -1, false),
    ];
    for (const s of this.sticks) this.root.appendChild(s.root);

    // Altitude, on the rail a right thumb can reach without leaving the look
    // half. Two buttons rather than a third axis: a fly camera spends most of
    // its time level, and a stick that also climbed would make holding an
    // altitude a thing you had to concentrate on.
    const rail = el('div.sf-rail');
    for (const [glyph, dir, label] of [['▲', 1, 'Climb'], ['▼', -1, 'Descend']] as Array<[string, number, string]>) {
      const b = el('button.sf-lift', { text: glyph, 'aria-label': label });
      const set = (on: boolean) => { this._lift = on ? dir : 0; };
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); set(true); });
      for (const t of ['pointerup', 'pointercancel', 'pointerleave']) {
        b.addEventListener(t, () => set(false));
      }
      rail.appendChild(b);
    }
    this.root.appendChild(rail);

    parent.appendChild(this.root);

    const tick = () => { this._raf = requestAnimationFrame(tick); this._pump(); };
    this._raf = requestAnimationFrame(tick);
  }

  /**
   * One frame: the pad's axes into the camera's.
   *
   * The left stick reports Y **positive downward**, which for travel means a
   * forward push is negative — the same convention a real stick reports and the
   * same one `Input.update` negates. It is negated here rather than in `Stick`
   * so the game's own reading of that class is untouched.
   */
  _pump() {
    const a = this.pad.axes;
    const strafe = a[0] || 0;
    const fwd = -(a[1] || 0);
    const mag = Math.hypot(strafe, fwd);
    // The rim is boost. `Freecam` clamps `axes` to the unit box, so the extra
    // travel has to be a speed multiplier rather than a bigger axis.
    const boost = mag > 0.92 ? BOOST : 1;
    this.cam.axes.fwd = fwd;
    this.cam.axes.strafe = strafe;
    this.cam.axes.lift = this._lift;
    this.cam.boostMul = boost;

    const lx = a[2] || 0;
    const ly = a[3] || 0;
    // The right stick is a drag, so its deflection is a RATE, not a delta:
    // holding a finger off-centre keeps turning. Scaled by the ring radius so
    // a full-deflection hold turns at a readable speed rather than a spin.
    if (lx || ly) this.cam.look(lx * LOOK * 14, ly * LOOK * 14);
  }

  /** Let go of everything. Called when the section or the level changes. */
  release() {
    for (const s of this.sticks) s.reset();
    this._lift = 0;
    this.cam.axes.fwd = 0;
    this.cam.axes.strafe = 0;
    this.cam.axes.lift = 0;
    this.cam.boostMul = 1;
  }

  dispose() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    this.release();
    this.root.remove();
  }
}
