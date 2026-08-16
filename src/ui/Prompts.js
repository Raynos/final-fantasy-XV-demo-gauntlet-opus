import { el, clamp, easeOut } from './UIKit.js';
import { button } from './Icons.js';

const SETS = {
  field: [
    ['E', 'Interact'], ['Tab', 'Menu'], ['C', 'Photo'], ['Q', 'Camp'],
  ],
  combat: [
    ['LMB', 'Attack'], ['RMB', 'Warp-Strike'], ['Q', 'Techniques'], ['E', 'Item'],
  ],
  warp: [
    ['RMB', 'Warp'], ['Space', 'Point-Warp'],
  ],
};

/**
 * Bottom-centre contextual button prompts. The set swaps with the gameplay
 * mode and cross-fades rather than snapping.
 */
export class Prompts {
  /** @param {HTMLElement} parent */
  constructor(parent) {
    this.root = el('div.hud-corner.bc');
    this.row = el('div.prompts');
    this.root.appendChild(this.row);
    parent.appendChild(this.root);
    this.mode = null;
  }

  _render(mode) {
    this.row.textContent = '';
    for (const [key, label] of SETS[mode] || SETS.field) {
      this.row.appendChild(el('div.prompt.key', {}, [
        button(key, { size: key.length > 1 ? 22 : 19 }),
        el('div.lb', { text: label }),
      ]));
    }
    this.mode = mode;
  }

  /**
   * @param {number} dt seconds
   * @param {object} game
   * @param {string} mode `field` | `combat` | `warp`
   * @param {number} appear 0..1
   */
  update(dt, game, mode, appear) {
    if (mode !== this.mode) this._render(mode);
    const e = easeOut(clamp((appear - 0.18) / 0.62, 0, 1));
    this.root.style.opacity = e.toFixed(3);
    this.root.style.transform = `translateX(-50%) translateY(${((1 - e) * 14).toFixed(2)}px)`;
  }
}
