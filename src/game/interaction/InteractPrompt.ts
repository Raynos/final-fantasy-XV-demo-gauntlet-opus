import * as THREE from 'three';
import { demoActive } from '../../engine/Device.ts';
import { clamp, easeOut, easeOutQuint, el, uiScale } from '../../ui/UIKit.ts';
import { button } from '../../ui/Icons.ts';
import { ensureInteractCss } from './interact.css.ts';
import type { Game } from '../Game.ts';
import type { Interactable } from './Interactables.ts';

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
  /** Key cap currently rendered, so a re-render only rebuilds when it changes. */
  _key!: string | null;
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
  uiScale!: number;
  verb!: HTMLElement;
  /** Pool of far markers, grown on demand and never shrunk. */
  _far!: { node: HTMLElement, dot: HTMLElement, txt: HTMLElement, _label?: string }[];
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

    this._far = [];
    this.root.style.display = 'none';
    this._key = null;
    this._sig = null;
    this._age = 0;
    this._scale();
    window.addEventListener('resize', () => this._scale());
  }

  /** Authored at 1600x900 like the rest of the UI. */
  _scale() {
    const s = uiScale(demoActive());
    this.root.style.zoom = s.toFixed(4);
    this.uiScale = s;
  }

  /**
   * Draw the small diamonds over everything else within sight.
   *
   * The prompt itself only ever renders the ONE thing already in reach, and
   * reach is 2.6-3.8 m. A player who fast-travels into the middle of
   * Hammerhead lands 6.2 m from the nearest counter and 31 m from the
   * furthest, so the screen says nothing at all, and `E` with no prompt up
   * falls through to a warp-strike -- which moves them, without explaining
   * anything. "I stood in it and pressed INTERACT ten times. Nothing. No
   * prompt ever appeared telling me what was interactive or where to stand."
   *
   * These are deliberately not prompts: no key cap, no verb, no plate. A
   * diamond, and a label only on the nearest few, fading out with distance.
   * They are the affordance; the prompt is still the offer.
   *
   * @param list nearest-first, already filtered and capped by the caller
   * @param far  the distance at which a marker has faded to nothing
   */
  updateMarkers(game: Game, list: Interactable[], far: number) {
    for (let i = 0; i < list.length; i++) {
      if (i >= this._far.length) {
        const dot = el('div.ix-far-d');
        const txt = el('div.ix-far-t');
        const node = el('div.ix-far', {}, [dot, txt]);
        this.root.appendChild(node);
        this._far.push({ node, dot, txt });
      }
      const m = this._far[i];
      const item = list[i];
      _v.copy(item.pos);
      _v.y += item.yOffset;
      const d = game.camera.position.distanceTo(_v);
      _v.project(game.camera);
      if (_v.z > 1 || Math.abs(_v.x) > 1 || Math.abs(_v.y) > 1) { m.node.style.display = 'none'; continue; }
      m.node.style.display = '';
      const s = this.uiScale || 1;
      const x = (_v.x * 0.5 + 0.5) * window.innerWidth / s;
      const y = (-_v.y * 0.5 + 0.5) * window.innerHeight / s;
      m.node.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      // Full presence at the item's own reach, gone by `far`. A marker that
      // holds its opacity all the way out reads as a HUD element rather than
      // as something standing in the world.
      const t = clamp(1 - (d - item.radius) / Math.max(1, far - item.radius), 0, 1);
      const a = 0.20 + 0.62 * easeOut(t);
      const pulse = 0.5 + 0.5 * Math.sin(game.time.now * 2.0 + i * 1.7);
      m.dot.style.opacity = (a * (0.78 + 0.22 * pulse)).toFixed(3);
      const label = t > 0.42 ? (item.label || item.verb) : '';
      if (m._label !== label) { m._label = label; m.txt.textContent = label; }
      m.txt.style.opacity = (clamp((t - 0.42) / 0.3, 0, 1) * 0.9).toFixed(3);
    }
    for (let i = list.length; i < this._far.length; i++) this._far[i].node.style.display = 'none';
  }

  _render(item: Interactable) {
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
  update(dt: number, game: Game, item: Interactable | null, appear: number) {
    // NOT `this.root`: the far markers are children of the same root, and
    // hiding the root because nothing is in reach hides exactly the affordance
    // that exists for the case where nothing is in reach.
    if (appear <= 0.002 || !item) { this.node.style.display = 'none'; return; }
    this.root.style.display = '';
    this.node.style.display = '';
    this._render(item);
    this._age += dt;

    // Project the anchor. Behind the camera or off-screen -> hide.
    _v.copy(item.pos);
    _v.y += item.yOffset;
    _v.project(game.camera);
    if (_v.z > 1 || Math.abs(_v.x) > 1.35 || Math.abs(_v.y) > 1.35) {
      this.node.style.display = 'none';
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
