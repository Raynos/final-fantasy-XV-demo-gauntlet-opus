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
 * Create an HTML element.
 * @param tag e.g. `div.party-row.is-lead`
 * @param [attrs] attributes; `text` sets textContent, `style` a cssText string
 */
export function el(tag: string, attrs: any = {}, kids: Array<Node | string | null | false> = []): HTMLElement {
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
export function svg(tag: string, attrs: any = {}, kids: Array<Node | string> = []): SVGElement {
  const [name, ...classes] = tag.split('.');
  const node = document.createElementNS(SVG_NS, name);
  if (classes.length) node.setAttribute('class', classes.join(' '));
  applyAttrs(node, attrs, true);
  append(node, kids);
  return node;
}

function applyAttrs(node: any, attrs: any, isSvg?: boolean) {
  for (const k of Object.keys(attrs)) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'style' && !isSvg) node.style.cssText = v;
    else if (k === 'class') node.setAttribute('class', [node.getAttribute('class'), v].filter(Boolean).join(' '));
    else node.setAttribute(k, v);
  }
}

function append(node: any, kids: any) {
  const list = Array.isArray(kids) ? kids : [kids];
  for (const k of list) {
    if (k == null || k === false) continue;
    node.appendChild(typeof k === 'string' ? document.createTextNode(k) : k);
  }
}

/** Remove every child of `node`. */
export function clear(node: HTMLElement) { while (node.firstChild) node.removeChild(node.firstChild); }

/** Toggle a class without touching the rest of the class list. */
export function cls(node: any, name: any, on: any) { node.classList.toggle(name, !!on); }

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Frame-rate independent exponential approach. */
export const damp = (a: any, b: any, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const easeOut = (t: any) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeOutQuint = (t: any) => 1 - Math.pow(1 - clamp(t, 0, 1), 5);
export const easeIn = (t: any) => Math.pow(clamp(t, 0, 1), 3);
/** Overshoot ease used for pop-in of damage numbers and callouts. */
export function easeBack(t: any) {
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
  shot?: any;
  constructor(dur: number, hold = 0) { this.dur = dur; this.hold = hold; this.age = 0; }
  step(dt: number) { this.age += dt; return this; }
  get t() { return clamp(this.age / this.dur, 0, 1); }
  get alive() { return this.age < this.dur + this.hold; }
}
