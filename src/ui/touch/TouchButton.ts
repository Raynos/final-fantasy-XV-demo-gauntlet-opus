import { el } from '../UIKit.ts';
import type { VirtualPad } from './VirtualPad.ts';

/**
 * One round on-screen button.
 *
 * A button drives the game through exactly one of two channels:
 *
 *  - **a pad index**, for the ~14 verbs that already have a gamepad binding.
 *    This is the cheap path: the press lands in `VirtualPad` and every existing
 *    consumer sees it as a controller press.
 *  - **a `KeyboardEvent.code`**, for the verbs that have none — the chocobo
 *    whistle (`Digit6`) and, load-bearingly, leaving the car (`KeyF`, which
 *    `RegaliaSystem._input` reads for both enter *and* exit). Synthesised key
 *    events are the same channel `uxcheck` has always driven the game with, so
 *    this is a proven path rather than a new one.
 *
 * Sizes are px and the root sets `zoom: 1`: a thumb is a physical size and must
 * not scale with the UI design grid.
 */
export interface ButtonSpec {
  /** Stable id — the layout diffs on this, and `touchcheck` selects on it. */
  id: string;
  label: string;
  /** Gamepad button index this press lands on. */
  pad?: number;
  /** `KeyboardEvent.code` to synthesise instead of a pad press. */
  key?: string;
  /** Extra classes: `tc-lg` for the primary action, `tc-sm` for the arc. */
  cls?: string;
  /** Called on press, after the pad/key channel has fired. */
  onPress?: () => void;
  /** Held-toggle rather than momentary — the sprint pill. */
  toggle?: boolean;
}

export class TouchButton {
  node: HTMLElement;
  labelNode: HTMLElement;
  ringNode: HTMLElement;
  spec: ButtonSpec;
  pad: VirtualPad;
  id: number;
  enabled: boolean;
  /** For `toggle` buttons: the latched state. */
  on: boolean;
  _label: string;
  _ring: number;

  constructor(pad: VirtualPad, spec: ButtonSpec) {
    this.pad = pad;
    this.spec = spec;
    this.id = -1;
    this.enabled = true;
    this.on = false;
    this._label = '';
    this._ring = -1;

    this.node = el(`div.tc-btn.${spec.cls || 'tc-md'}`, { 'data-tc': spec.id });
    this.ringNode = el('div.tc-btn-ring');
    this.labelNode = el('div.tc-btn-label');
    this.node.appendChild(this.ringNode);
    this.node.appendChild(this.labelNode);
    this.setLabel(spec.label);
    this.setRing(-1);

    this.node.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.enabled || this.id !== -1) return;
      this.id = e.pointerId;
      try { this.node.setPointerCapture(e.pointerId); } catch { /* synthetic event, see Stick */ }
      this.node.classList.add('is-down');
      if (spec.toggle) { this.on = !this.on; this.node.classList.toggle('is-on', this.on); this._write(); }
      else this._down();
      if (spec.onPress) spec.onPress();
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId !== this.id) return;
      e.preventDefault();
      this.id = -1;
      this.node.classList.remove('is-down');
      if (!spec.toggle) this._up();
    };
    this.node.addEventListener('pointerup', up);
    this.node.addEventListener('pointercancel', up);
  }

  setLabel(text: string) {
    if (text === this._label) return;
    this._label = text;
    this.labelNode.textContent = text;
  }

  /** 0..1 fills the progress ring; a negative number hides it. */
  setRing(t: number) {
    const v = t < 0 ? -1 : Math.max(0, Math.min(1, t));
    if (Math.abs(v - this._ring) < 0.01) return;
    this._ring = v;
    if (v < 0) { this.ringNode.style.display = 'none'; return; }
    this.ringNode.style.display = 'block';
    // A conic gradient is the cheapest ring that does not need SVG or a
    // per-frame path rewrite; only the one custom property changes.
    this.ringNode.style.setProperty('--t', `${(v * 360).toFixed(1)}deg`);
  }

  /**
   * Re-point the button at a different pad index. The drive layout reuses the
   * same three physical buttons as throttle, brake and handbrake, and a button
   * that changed index while held would leave the old one stuck down.
   */
  setPad(i: number | undefined) {
    if (i === this.spec.pad) return;
    if (this.spec.pad != null) this.pad.release(this.spec.pad);
    this.spec.pad = i;
  }

  setEnabled(v: boolean) {
    if (v === this.enabled) return;
    this.enabled = v;
    this.node.classList.toggle('is-off', !v);
    if (!v) this.release();
  }

  /** Let go without an event — a mode change, a hide, a disable. */
  release() {
    this.id = -1;
    this.node.classList.remove('is-down');
    if (this.spec.toggle) { this.on = false; this.node.classList.remove('is-on'); this._write(); }
    else this._up();
  }

  _write() {
    if (this.spec.pad == null) return;
    if (this.on) this.pad.press(this.spec.pad, performance.now());
    else this.pad.release(this.spec.pad);
  }

  _down() {
    if (this.spec.pad != null) this.pad.press(this.spec.pad, performance.now());
    if (this.spec.key) window.dispatchEvent(new KeyboardEvent('keydown', { code: this.spec.key, bubbles: true }));
  }

  _up() {
    if (this.spec.pad != null) this.pad.release(this.spec.pad);
    if (this.spec.key) window.dispatchEvent(new KeyboardEvent('keyup', { code: this.spec.key, bubbles: true }));
  }
}
