import * as THREE from 'three';
import { el, clamp, easeOut, easeOutQuint } from '../../ui/UIKit.ts';
import { button } from '../../ui/Icons.ts';
import { ensureInteractCss } from './interact.css.ts';

/**
 * The contextual prompt that floats over whatever the player is standing in
 * front of: a diamond node on the object, a hairline stem, and a plate carrying
 * the button glyph, the verb and the subject.
 *
 * The node is projected from world space every frame; the plate grows out of it
 * horizontally. Nothing here uses a CSS transition — the grow, the fade and the
 * node's slow pulse are all written from `game.time`.
 */

const _v = new THREE.Vector3();

export class InteractPrompt {
  _age!: number;
  _key!: any;
  _sig!: string | null;
  body!: HTMLElement;
  dot!: HTMLElement;
  hint!: HTMLElement;
  keyWrap!: HTMLElement;
  node!: HTMLElement;
  ring!: HTMLElement;
  root!: HTMLElement;
  stem!: HTMLElement;
  sub!: HTMLElement;
  txt!: HTMLElement;
  uiScale!: any;
  verb!: HTMLElement;
  /** @param parent usually `game.uiRoot` */
  constructor(parent: HTMLElement) {
    ensureInteractCss();
    this.root = el('div', { id: 'interact' });
    parent.appendChild(this.root);

    this.node = el('div.ix');
    this.stem = el('div.ix-stem');
    this.ring = el('div.ix-ring');
    this.dot = el('div.ix-node');
    this.body = el('div.ix-body');
    this.keyWrap = el('div');
    this.verb = el('div.ix-verb');
    this.sub = el('div.ix-sub');
    this.hint = el('div.ix-hint');
    this.txt = el('div.ix-txt', {}, [this.verb, this.sub, this.hint]);
    this.body.appendChild(this.keyWrap);
    this.body.appendChild(this.txt);
    this.node.appendChild(this.stem);
    this.node.appendChild(this.ring);
    this.node.appendChild(this.dot);
    this.node.appendChild(this.body);
    this.root.appendChild(this.node);

    this.root.style.display = 'none';
    this._key = null;
    this._sig = null;
    this._age = 0;
    this._scale();
    window.addEventListener('resize', () => this._scale());
  }

  /** Authored at 1600x900 like the rest of the UI. */
  _scale() {
    const s = clamp(Math.min(window.innerWidth / 1600, window.innerHeight / 900), 0.72, 1.5);
    this.root.style.zoom = s.toFixed(4);
    this.uiScale = s;
  }

  _render(item: any) {
    const sig = `${item.key}|${item.verb}|${item.label}|${item.hint}`;
    if (sig === this._sig) return;
    this._sig = sig;
    if (this._key !== item.key) {
      this._key = item.key;
      this.keyWrap.textContent = '';
      this.keyWrap.appendChild(button(item.key, { size: item.key.length > 1 ? 24 : 21 }));
    }
    this.verb.textContent = item.verb;
    this.sub.textContent = item.label;
    this.sub.style.display = item.label ? '' : 'none';
    this.hint.textContent = item.hint;
    this.hint.style.display = item.hint ? '' : 'none';
    this._age = 0;
  }

  /**
   * @param item the selected interactable
   * @param appear 0..1
   */
  update(dt: number, game: any, item: any | null, appear: number) {
    if (appear <= 0.002 || !item) { this.root.style.display = 'none'; return; }
    this.root.style.display = '';
    this._render(item);
    this._age += dt;

    // Project the anchor. Behind the camera or off-screen -> hide.
    _v.copy(item.pos);
    _v.y += item.yOffset;
    _v.project(game.camera);
    if (_v.z > 1 || Math.abs(_v.x) > 1.35 || Math.abs(_v.y) > 1.35) {
      this.root.style.display = 'none';
      return;
    }
    const s = this.uiScale || 1;
    const x = (_v.x * 0.5 + 0.5) * window.innerWidth / s;
    const y = (-_v.y * 0.5 + 0.5) * window.innerHeight / s;
    this.node.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;

    const e = easeOutQuint(appear);
    const t = game.time.now;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);

    this.stem.style.height = `${(e * 34).toFixed(1)}px`;
    this.stem.style.opacity = e.toFixed(3);
    this.dot.style.transform = `rotate(45deg) scale(${(0.55 + 0.45 * e + 0.10 * pulse * e).toFixed(3)})`;
    this.dot.style.opacity = (0.72 + 0.28 * pulse).toFixed(3);
    this.ring.style.opacity = (e * (0.30 + 0.32 * (1 - pulse))).toFixed(3);
    this.ring.style.transform = `rotate(45deg) scale(${(0.86 + 0.30 * pulse).toFixed(3)})`;

    const grow = easeOut(clamp((appear - 0.10) / 0.7, 0, 1));
    this.body.style.opacity = grow.toFixed(3);
    this.body.style.transform = `translateX(${((1 - grow) * -14).toFixed(2)}px)`;
    // The plate wipes open left-to-right through a mask rather than scaling —
    // a scaleX would squash the type, and a width animation would reflow it.
    const wipe = (grow * 118).toFixed(1);
    const mask = `linear-gradient(90deg, #000 0, #000 ${wipe}%, transparent ${wipe}%)`;
    this.body.style.webkitMaskImage = mask;
    this.body.style.maskImage = mask;
    this.verb.style.letterSpacing = `${(0.34 - 0.08 * grow).toFixed(3)}em`;
  }
}
