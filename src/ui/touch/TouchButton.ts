import { el, svg } from '../UIKit.ts';
import { GLYPHS } from './layouts.ts';
import type { VirtualPad } from './VirtualPad.ts';

/**
 * One on-screen button.
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
 *
 * ### The glyph
 *
 * A 9 px word in a 54 px circle is not readable in the half-second a dodge
 * gets. Every button carries a stroke glyph, and the smaller tiers carry
 * *only* the glyph — the word is a caption for the ones big enough to hold it.
 */
export interface ButtonSpec {
  /** Stable id — the layout diffs on this, and `touchcheck` selects on it. */
  id: string;
  label: string;
  /** Gamepad button index this press lands on. */
  pad?: number;
  /** `KeyboardEvent.code` to synthesise instead of a pad press. */
  key?: string;
  /** Diameter class, `tc-xl` … `tc-xs`. */
  cls?: string;
  /** Key into {@link GLYPHS}. */
  icon?: string;
  /** Visual family: the gold primary, the rail's world verbs, a utility. */
  family?: 'primary' | 'world' | 'utility';
  /** Draw the word under the glyph. Off on the small tiers. */
  showLabel?: boolean;
  /** Called on press, after the pad/key channel has fired. */
  onPress?: () => void;
}

export class TouchButton {
  node: HTMLElement;
  labelNode: HTMLElement;
  subNode: HTMLElement;
  ringNode: HTMLElement;
  iconNode: SVGElement;
  iconPath: SVGElement;
  spec: ButtonSpec;
  pad: VirtualPad;
  id: number;
  enabled: boolean;
  _label: string;
  _sub: string;
  _icon: string;
  _ring: number;

  constructor(pad: VirtualPad, spec: ButtonSpec) {
    this.pad = pad;
    this.spec = spec;
    this.id = -1;
    this.enabled = true;
    this._label = '';
    this._sub = '';
    this._icon = '';
    this._ring = -1;

    const fam = spec.family ? ` tc-${spec.family}` : '';
    this.node = el(`div.tc-btn.${spec.cls || 'tc-md'}${fam}`, { 'data-tc': spec.id });
    this.ringNode = el('div.tc-btn-ring');
    this.iconPath = svg('path');
    this.iconNode = svg('svg.tc-glyph', { viewBox: '0 0 24 24' }, [this.iconPath]);
    this.labelNode = el('div.tc-btn-label');
    this.subNode = el('div.tc-btn-sub');
    this.node.appendChild(this.ringNode);
    this.node.appendChild(this.iconNode);
    if (spec.showLabel) this.node.appendChild(this.labelNode);
    this.node.appendChild(this.subNode);
    this.setIcon(spec.icon || '');
    this.setLabel(spec.label);
    this.setSub('');
    this.setRing(-1);

    this.node.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!this.enabled || this.id !== -1) return;
      this.id = e.pointerId;
      // A synthetic PointerEvent has no active pointer to capture, and the call
      // throws NotFoundError rather than no-opping. `touchcheck` drives this
      // layer with synthetic events, so the capture is best-effort.
      try { this.node.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
      this.node.classList.add('is-down');
      this._down();
      if (spec.onPress) spec.onPress();
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId !== this.id) return;
      e.preventDefault();
      this.id = -1;
      this.node.classList.remove('is-down');
      this._up();
    };
    this.node.addEventListener('pointerup', up);
    this.node.addEventListener('pointercancel', up);
  }

  setLabel(text: string) {
    if (text === this._label) return;
    this._label = text;
    this.labelNode.textContent = text;
    // A word longer than the circle steps its own size down rather than the
    // button growing: the geometry is the thing that must not move.
    this.node.classList.toggle('is-long', text.length > 6);
  }

  /** A second line under the label — the car's distance, the bird's state. */
  setSub(text: string) {
    if (text === this._sub) return;
    this._sub = text;
    this.subNode.textContent = text;
    this.subNode.style.display = text ? '' : 'none';
  }

  setIcon(name: string) {
    if (name === this._icon) return;
    this._icon = name;
    const d = GLYPHS[name];
    this.iconPath.setAttribute('d', d || '');
    this.iconNode.style.display = d ? '' : 'none';
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

  /** Re-point the synthesised key. CAR is `Digit7` when far and `KeyF` when near. */
  setKey(code: string | undefined) {
    if (code === this.spec.key) return;
    if (this.spec.key) window.dispatchEvent(new KeyboardEvent('keyup', { code: this.spec.key, bubbles: true }));
    this.spec.key = code;
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

  /**
   * `dim` keeps the slot on screen at reduced weight; `false` for `dim` with
   * `setShown(false)` takes it away entirely. INTERACT is the only slot that
   * dims — the player has to know where the contextual verb will appear before
   * there is one. Everything else is shown or gone.
   */
  setEnabled(v: boolean, dim = false) {
    if (v === this.enabled && this.node.classList.contains('is-dim') === (!v && dim)) return;
    this.enabled = v;
    this.node.classList.toggle('is-dim', !v && dim);
    if (!v) this.release();
  }

  setShown(v: boolean) {
    if (this.node.hidden === !v) return;
    this.node.hidden = !v;
    if (!v) this.release();
  }

  /** Let go without an event — a mode change, a hide, a disable. */
  release() {
    this.id = -1;
    this.node.classList.remove('is-down');
    this._up();
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
