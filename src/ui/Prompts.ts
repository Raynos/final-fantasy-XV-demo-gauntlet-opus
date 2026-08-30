import { el, clamp, easeOut } from './UIKit.ts';
import { button } from './Icons.ts';
import type { Game } from '../game/Game.ts';

/**
 * Contextual button prompts, one set per situation.
 *
 * These are the game's only permanently-visible controls documentation, so
 * every entry has to be a binding that genuinely exists — the old set promised
 * "Q — Camp", which was bound to nothing at all, and omitted driving entirely,
 * which is how a fully drivable Regalia went unnoticed.
 *
 * It went on lying after that, in three pairs that survived because nobody
 * read the strip against the code: `Y — Lock-On` (the key is `V`), `R —
 * Point-Warp` (`E`) and `X — Armiger` (`R`). The controls card repeated the
 * same three, so the two documents agreed with each other and with nothing
 * else. Every pair here is checked against the `input.keyDown` call that
 * implements it in `CombatSystem._readInput` / `RegaliaSystem._controlKeys`.
 */
const SETS = {
  field: [
    ['E', 'Interact'], ['Tab', 'Menu'], ['M', 'Map'], ['C', 'Photo'], ['H', 'Controls'],
  ],
  combat: [
    ['LMB', 'Attack'], ['Space', 'Dodge'], ['Q', 'Warp-Strike'], ['V', 'Lock-On'], ['H', 'Controls'],
  ],
  warp: [
    ['Q', 'Warp-Strike'], ['E', 'Point-Warp'], ['R', 'Armiger'], ['H', 'Controls'],
  ],
  /** Standing beside the parked Regalia. */
  car: [
    ['F', 'Drive'], ['E', 'Interact'], ['Tab', 'Menu'], ['H', 'Controls'],
  ],
  /** Behind the wheel. */
  driving: [
    ['W', 'Accelerate'], ['S', 'Brake'], ['Space', 'Handbrake'], ['I', 'Ignis Drives'],
    ['V', 'Camera'], ['F', 'Get Out'],
  ],
};

/**
 * Bottom-centre contextual button prompts. The set swaps with the gameplay
 * mode and cross-fades rather than snapping.
 */
export class Prompts {
  mode!: string | null;
  root!: HTMLElement;
  row!: HTMLElement;
  constructor(parent: HTMLElement) {
    this.root = el('div.hud-corner.bc');
    this.row = el('div.prompts');
    this.root.appendChild(this.row);
    parent.appendChild(this.root);
    this.mode = null;
  }

  _render(mode: string) {
    this.row.textContent = '';
    for (const [key, label] of SETS[mode as keyof typeof SETS] || SETS.field) {
      this.row.appendChild(el('div.prompt.key', {}, [
        button(key, { size: key.length > 2 ? 23 : key.length > 1 ? 22 : 19 }),
        el('div.lb', { text: label }),
      ]));
    }
    this.mode = mode;
  }

  /**
   * The car outranks the Director's scenario: if you are in the Regalia, or
   * standing next to it, that is unambiguously what the prompt strip is for.
   * @param mode the Director's scenario
   */
  _resolve(game: Game, mode: string) {
    const car = game.get?.('Regalia');
    if (car && car.enabled) {
      if (car.isDriving) return 'driving';
      if (mode !== 'combat' && car.distanceToPlayer && car.distanceToPlayer() < 7.5) return 'car';
    }
    return SETS[mode as keyof typeof SETS] ? mode : 'field';
  }

  /**
   * @param dt seconds
   * @param mode `field` | `combat` | `warp`
   * @param appear 0..1
   */
  update(dt: number, game: Game, mode: string, appear: number) {
    const set = this._resolve(game, mode);
    if (set !== this.mode) this._render(set);
    const e = easeOut(clamp((appear - 0.18) / 0.62, 0, 1));
    this.root.style.opacity = e.toFixed(3);
    this.root.style.transform = `translateX(-50%) translateY(${((1 - e) * 14).toFixed(2)}px)`;
  }
}
