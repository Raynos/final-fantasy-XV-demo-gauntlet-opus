/**
 * Tiny DOM/SVG construction and animation helpers shared by every UI module.
 *
 * Design rule for this whole directory: **no CSS transitions or keyframe
 * animations**. Every animated property is written per-frame from
 * `game.time.now`, so a screenshot taken after N fixed sim steps is always
 * byte-identical. CSS is used for static appearance only.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Attributes `el()` and `svg()` accept.
 *
 * Four keys are handled specially; everything else goes through
 * `setAttribute`, which is why the index signature is what a DOM attribute
 * value can be rather than `any`. `null`/`false` skips the attribute, which is
 * how a conditional attribute is written inline.
 */
export interface ElAttrs {
  /** Sets `textContent`. */
  text?: string | number | null | false;
  /** Sets `innerHTML`. */
  html?: string | null | false;
  /** A `cssText` string. Ignored on SVG nodes, which have no `style` string. */
  style?: string | null | false;
  /** Appended to the classes already parsed out of the tag. */
  class?: string | null | false;
  [attr: string]: string | number | boolean | null | undefined;
}

/**
 * Create an HTML element.
 * @param tag e.g. `div.party-row.is-lead`
 * @param [attrs] attributes; `text` sets textContent, `style` a cssText string
 */
export function el(tag: string, attrs: ElAttrs = {}, kids: Array<Node | string | null | false> = []): HTMLElement {
  const [name, ...classes] = tag.split('.');
  const node = document.createElement(name || 'div');
  if (classes.length) node.className = classes.join(' ');
  applyAttrs(node, attrs);
  append(node, kids);
  return node;
}

/**
 * Create an SVG element in the SVG namespace.
 * @param tag e.g. `path.glyph`
 */
export function svg(tag: string, attrs: ElAttrs = {}, kids: Array<Node | string> = []): SVGElement {
  const [name, ...classes] = tag.split('.');
  const node = document.createElementNS(SVG_NS, name);
  if (classes.length) node.setAttribute('class', classes.join(' '));
  applyAttrs(node, attrs, true);
  append(node, kids);
  return node;
}

function applyAttrs(node: HTMLElement | SVGElement, attrs: ElAttrs, isSvg?: boolean) {
  for (const k of Object.keys(attrs)) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'text') node.textContent = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else if (k === 'style' && !isSvg) (node as HTMLElement).style.cssText = String(v);
    else if (k === 'class') node.setAttribute('class', [node.getAttribute('class'), v].filter(Boolean).join(' '));
    else node.setAttribute(k, String(v));
  }
}

function append(node: Element, kids: Array<Node | string | null | false> | Node | string) {
  const list = Array.isArray(kids) ? kids : [kids];
  for (const k of list) {
    if (k == null || k === false) continue;
    node.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
  }
}

/** Remove every child of `node`. */
export function clear(node: HTMLElement) { while (node.firstChild) node.removeChild(node.firstChild); }

/** Toggle a class without touching the rest of the class list. */
export function cls(node: Element, name: string, on: unknown) { node.classList.toggle(name, !!on); }

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/**
 * The `zoom` every UI surface applies, in one place.
 *
 * Six files carried a byte-identical copy of this — HUD, Menus, TitleScreen,
 * Letterbox, Dialogue, InteractPrompt — and all six had the same bug, which
 * only bites on a small screen and so had never been seen: the floor was a
 * plain `clamp(fit, 0.72, 1.5)`, and a clamp with a floor *raises* a value
 * below it. At 844x390 the honest fit is 0.433, so the old code returned 0.72
 * and the root's layout box became 390/0.72 = 542 px against a design authored
 * at 900. Everything vertical then overflows off-screen. The floor may never
 * exceed the fit, hence `Math.min(FLOOR, fit)`.
 *
 * On any viewport at or above 1152x648 — which is every capture this project
 * takes — `fit >= 0.72` and this returns exactly what it always returned, so
 * the corpus is bit-identical.
 *
 * The design box is the second half. A phone at the honest 0.433 is legible in
 * the sense that it fits and unreadable in the sense that matters, so the demo
 * authors against a smaller box: 844x390 against 1100x620 gives 0.629, a 1.45x
 * larger UI. That number is a **tuning value read off `ui-shoot` at a phone
 * viewport**, not a derivation — change it by looking, not by arithmetic.
 */
const DESIGN = { w: 1600, h: 900 };
const DESIGN_PHONE = { w: 1100, h: 620 };
const SCALE_FLOOR = 0.72;
const SCALE_CEIL = 1.5;

export function uiScale(phone = false): number {
  const d = phone ? DESIGN_PHONE : DESIGN;
  const fit = Math.min(window.innerWidth / d.w, window.innerHeight / d.h);
  return clamp(fit, Math.min(SCALE_FLOOR, fit), SCALE_CEIL);
}
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Frame-rate independent exponential approach. */
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeOutQuint = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 5);
export const easeIn = (t: number) => Math.pow(clamp(t, 0, 1), 3);
/** Overshoot ease used for pop-in of damage numbers and callouts. */
export function easeBack(t: number) {
  const c = 1.70158 + 1;
  const x = clamp(t, 0, 1) - 1;
  return 1 + c * x * x * x + 1.70158 * x * x;
}

/** Deterministic 32-bit hash-based RNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 1234567 -> "1,234,567" */
export function commas(n: number) {
  const v = Math.max(0, Math.round(n));
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Fractional hours -> "17:42" */
export function clock(hours: number) {
  const h = ((hours % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Split a string into per-character spans so it can be revealed letter by
 * letter (used by the area title card and menu headings).
 */
export function letters(text: string, tag = 'span.ltr'): {node: HTMLElement, chars: HTMLElement[]} {
  const node = el('span.letters');
  const chars = [];
  for (const ch of text) {
    const s = el(tag, { text: ch === ' ' ? ' ' : ch });
    node.appendChild(s);
    chars.push(s);
  }
  return { node, chars };
}

/**
 * An element that remembers what it last rendered, so a frame loop can skip the
 * DOM write when nothing changed. Every screen that redraws at 60 Hz uses this:
 * `if (n._v !== v) { n.textContent = v; n._v = v; }`.
 */
export interface CachedNode extends HTMLElement {
  /** Last value written into this node. */
  _v?: string | number;
  /** Last `on` state toggled onto this node. */
  _on?: boolean;
  /** A child this node updates in place -- a count chip, a value cell. */
  _count?: HTMLElement;
}

/**
 * A one-shot normalised timeline. `t` runs 0..1 over `dur` seconds and then
 * stays at 1; `alive` stays true until `dur + hold` has elapsed.
 */
export class Clip {
  age!: number;
  dur!: number;
  hold!: number;
  /** The shot this clip was raised in; a shot change clears it. `Subtitles`. */
  shot?: string | null;
  constructor(dur: number, hold = 0) { this.dur = dur; this.hold = hold; this.age = 0; }
  step(dt: number) { this.age += dt; return this; }
  get t() { return clamp(this.age / this.dur, 0, 1); }
  get alive() { return this.age < this.dur + this.hold; }
}
