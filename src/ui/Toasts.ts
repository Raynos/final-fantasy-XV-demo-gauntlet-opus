import { el, clamp, easeOut, easeOutQuint, Clip } from './UIKit.ts';
import { icon } from './Icons.ts';

/**
 * The quiet notification column: item pickups, AP awards, quest ticks, buffs.
 *
 * Sits above the party stack in the bottom-left, one hairline-ruled line per
 * event, oldest fading out first. Restrained on purpose — FFXV's pickup
 * feedback is a small pale line, never a banner.
 *
 * Like everything in `src/ui`, it animates per frame off `game.time` and uses
 * no CSS transitions, so a capture after N fixed steps is reproducible.
 */
export class Toasts {
  /** @param {HTMLElement} parent */
  constructor(parent) {
    this.root = el('div.toasts');
    // `parent` is the bottom-left corner's notice slot, which sits above the
    // party stack and below the combat rail — see `PartyPanel`'s class note.
    parent.appendChild(this.root);
    /** @type {Array<{node:HTMLElement, clip:Clip}>} */
    this.items = [];
    this.max = 5;
  }

  /**
   * Push a line.
   * @param {string} label small uppercase key ("Obtained", "Ability Points")
   * @param {string} value the thing itself ("Potion  ×3")
   * @param {string} [ico] icon key from `Icons.js`
   * @param {string} [tone] '' | 'gold' | 'ice'
   */
  push(label, value, ico = 'items', tone = '') {
    const node = el(`div.toast${tone ? `.${tone}` : ''}`, {}, [
      el('div.tz-ico', {}, [icon(ico, { size: 14, stroke: 1.2 })]),
      el('div.tz-body', {}, [
        el('div.tz-k', { text: label }),
        el('div.tz-v', { text: value }),
      ]),
    ]);
    this.root.appendChild(node);
    this.items.push({ node, clip: new Clip(0.26, 3.4) });
    while (this.items.length > this.max) this._retire(this.items.shift());
  }

  _retire(t) { if (t && t.node.parentNode) t.node.parentNode.removeChild(t.node); }

  /** Drop everything immediately — used by the capture harness between shots. */
  clear() {
    for (const t of this.items) this._retire(t);
    this.items.length = 0;
  }

  /**
   * @param {number} dt seconds
   * @param {number} appear 0..1 master HUD reveal
   */
  update(dt, appear) {
    if (!this.items.length) { this.root.style.display = 'none'; return; }
    this.root.style.display = '';
    for (let i = this.items.length - 1; i >= 0; i--) {
      const t = this.items[i];
      t.clip.step(dt);
      if (!t.clip.alive) { this._retire(t); this.items.splice(i, 1); continue; }
      const age = t.clip.age;
      const out = clamp((age - (t.clip.dur + t.clip.hold - 0.5)) / 0.5, 0, 1);
      const inn = easeOutQuint(clamp(age / 0.26, 0, 1));
      t.node.style.opacity = (inn * (1 - out) * easeOut(appear)).toFixed(3);
      t.node.style.transform = `translateX(${((1 - inn) * -20 - out * 8).toFixed(2)}px)`;
    }
  }
}
