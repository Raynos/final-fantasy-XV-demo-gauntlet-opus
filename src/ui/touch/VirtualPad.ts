import type { PadLike } from '../../engine/Input.ts';

/**
 * A `Gamepad`-shaped object driven by fingers.
 *
 * ### Why a pad and not a fourth input source
 *
 * `Input.update()` already fuses a pad into the semantic `move`/`look` that
 * most of the game reads, and eight files outside `Input` read
 * `input.gamepad` directly — the Regalia steers off `axes[0]`, `Swim` reads
 * buttons 0 and 1, `Menus` reads the d-pad. Presenting touch *as a pad* means
 * all of that comes along for free, and the `enabled === false` zeroing at the
 * end of `Input.update` gives menu correctness with no extra code.
 *
 * ### The two frame-semantics details that make it correct
 *
 * **Tap latching.** `Input.endFrame()` snapshots the previous-button table
 * from the live pad, so a tap that began and ended entirely between two frames
 * would never be seen as a rising edge. Every press therefore *latches* until
 * the next `poll()`, and `poll()` runs exactly once per frame from
 * `Input.update`'s `padSource` hook. The result is exactly one rising edge per
 * tap, however brief the tap was.
 *
 * **Auto-repeat.** `Menus`, `Dialogue`, `Downed` and `TitleScreen` all read the
 * d-pad as an edge, so a finger held on a touch d-pad would move one row and
 * then stop. Buttons flagged `repeat` re-latch every {@link REPEAT_MS} after an
 * initial {@link REPEAT_DELAY_MS}, which is the behaviour a held key has.
 */

/** Standard-mapping button count. `Input.endFrame` walks 0..16. */
const N_BUTTONS = 17;
const REPEAT_DELAY_MS = 400;
const REPEAT_MS = 130;

interface Slot {
  /** A finger is on it right now. */
  held: boolean;
  /** A press has happened that no frame has seen yet. */
  latched: boolean;
  /** Held buttons that re-latch, for the edge-reading menu screens. */
  repeat: boolean;
  /** When the next auto-repeat is due, ms on the `performance.now` clock. */
  nextAt: number;
  /** 0..1 analogue ramp for the two triggers; 1 for a plain button. */
  value: number;
  /** Seconds to go 0 -> 1. 0 means instantaneous. */
  ramp: number;
}

export class VirtualPad implements PadLike {
  buttons: { pressed: boolean, value: number }[];
  axes: number[];
  _slots: Slot[];
  _last: number;

  constructor() {
    this.buttons = [];
    this._slots = [];
    for (let i = 0; i < N_BUTTONS; i++) {
      this.buttons.push({ pressed: false, value: 0 });
      this._slots.push({ held: false, latched: false, repeat: false, nextAt: 0, value: 0, ramp: 0 });
    }
    // [lx, ly, rx, ry]. `Input` negates axes[1], so forward is negative here,
    // exactly as a real stick reports it.
    this.axes = [0, 0, 0, 0];
    this._last = 0;
  }

  /** Mark a button as auto-repeating (menu d-pad) or analogue-ramped (throttle). */
  configure(i: number, opts: { repeat?: boolean, ramp?: number }) {
    const s = this._slots[i];
    if (!s) return;
    if (opts.repeat != null) s.repeat = opts.repeat;
    if (opts.ramp != null) s.ramp = opts.ramp;
  }

  press(i: number, now: number) {
    const s = this._slots[i];
    if (!s || s.held) return;
    s.held = true;
    s.latched = true;
    s.nextAt = now + REPEAT_DELAY_MS;
  }

  release(i: number) {
    const s = this._slots[i];
    if (!s) return;
    s.held = false;
  }

  /** Drop every finger — called when the layout changes or the page hides. */
  releaseAll() {
    for (const s of this._slots) { s.held = false; s.latched = false; s.value = 0; }
    this.axes[0] = this.axes[1] = this.axes[2] = this.axes[3] = 0;
  }

  /** True while a finger is on the button; drives the pressed look of the DOM. */
  isHeld(i: number) { return !!this._slots[i] && this._slots[i].held; }

  /**
   * Publish this frame's button state and clear the latches. Called once per
   * frame from `Input.update` via `padSource`, which is what makes the edge
   * exactly one frame wide.
   */
  poll(now: number) {
    const dt = this._last ? Math.min(0.1, (now - this._last) / 1000) : 0;
    this._last = now;
    for (let i = 0; i < N_BUTTONS; i++) {
      const s = this._slots[i];
      if (s.repeat && s.held && now >= s.nextAt) { s.latched = true; s.nextAt = now + REPEAT_MS; }
      const on = s.held || s.latched;
      s.latched = false;
      // A throttle that snaps to 1 on touch makes the car undriveable; a ramp
      // gives the same "squeeze" a real trigger has. Release is twice as fast
      // as press, so lifting off still feels immediate.
      if (s.ramp > 0) {
        const step = dt / s.ramp;
        s.value = on ? Math.min(1, s.value + step) : Math.max(0, s.value - step * 2);
      } else {
        s.value = on ? 1 : 0;
      }
      const b = this.buttons[i];
      b.pressed = s.ramp > 0 ? s.value > 0.02 : on;
      b.value = s.value;
    }
  }
}

/**
 * OR a hardware pad together with the virtual one, so a phone with a Bluetooth
 * controller attached works both ways at once rather than one cancelling the
 * other. Returns a plain object; neither input is mutated.
 */
export function mergePads(real: PadLike, touch: VirtualPad): PadLike {
  const buttons: { pressed: boolean, value: number }[] = [];
  for (let i = 0; i < N_BUTTONS; i++) {
    const a = real.buttons[i], b = touch.buttons[i];
    buttons.push({
      pressed: !!(a && a.pressed) || !!(b && b.pressed),
      value: Math.max(a ? a.value : 0, b ? b.value : 0),
    });
  }
  // Larger magnitude wins per axis: a resting hardware stick reads ~0, so the
  // finger always beats it, and vice versa.
  const axes = [0, 1, 2, 3].map((i) => {
    const a = real.axes[i] || 0, b = touch.axes[i] || 0;
    return Math.abs(b) > Math.abs(a) ? b : a;
  });
  return { buttons, axes };
}
