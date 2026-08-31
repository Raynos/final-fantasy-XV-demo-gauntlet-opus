import { el, clamp, easeOut } from './UIKit.ts';
import { button } from './Icons.ts';
import type { Game } from '../game/Game.ts';

/** Seconds of continuous slipping before the traversal note appears. */
const SLIP_DELAY = 0.55;

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
 *
 * It also carries the **traversal note**, which is a different kind of thing
 * living in the same corner on purpose. A blind playtest's complaint #3 was
 * that a slope refuses input *silently*: "running at a hill, I simply stopped.
 * Ten seconds of sprint moved me one metre. No slide, no stumble, no 'too
 * steep', no animation change." `CharacterController` now makes the refusal
 * physical — you slide — and publishes `slip`; this is the half that says the
 * rule out loud, because a limit the player cannot learn is not a limit, it is
 * a bug they will blame on the controls.
 *
 * It lives here, in flow above the button row, rather than as its own
 * absolutely-positioned overlay for the reason `PartyPanel`'s class note gives
 * for the bottom-left column: a corner has one owner, and two elements placed
 * in the same corner by hand-measured offsets is exactly the class of defect
 * `src/ui/Layers.ts` exists to stop. It collapses to `display: none` when
 * silent so it reserves no height and the button row does not move.
 */
export class Prompts {
  mode!: string | null;
  root!: HTMLElement;
  row!: HTMLElement;
  /** The "too steep" note. */
  slipBox!: HTMLElement;
  /** 0..1 reveal of `slipBox`. */
  slipA!: number;
  /** Seconds of continuous slipping so far. */
  _slipFor!: number;
  constructor(parent: HTMLElement) {
    this.root = el('div.hud-corner.bc');
    this.slipBox = el('div.slip-note', {}, [
      el('div.sn-t', { text: 'Too steep' }),
      el('div.sn-x', { text: 'This face will not hold — find a way around' }),
    ]);
    this.row = el('div.prompts');
    this.root.appendChild(this.slipBox);
    this.root.appendChild(this.row);
    parent.appendChild(this.root);
    this.mode = null;
    this.slipA = 0;
    this._slipFor = 0;
    this.slipBox.style.display = 'none';
  }

  /**
   * The traversal note.
   *
   * **Delayed on purpose.** `slip` is up the instant a foot lands on ground
   * that will not hold it, and a character crossing a gully clips one for a
   * few frames without ever being stopped by it. Telling them about it would
   * be a message that flashes for a tenth of a second, which teaches nothing
   * and reads as a glitch. `SLIP_DELAY` is roughly how long it takes to notice
   * you are not getting anywhere.
   *
   * @param dt seconds
   */
  _slip(dt: number, game: Game, appear: number) {
    const body = game.get?.('Player')?.body;
    const slipping = !!body && body.slip > 0.5 && !body.swim;
    this._slipFor = slipping ? this._slipFor + dt : 0;
    const target = this._slipFor > SLIP_DELAY ? 1 : 0;
    const rate = dt / (target ? 0.30 : 0.55);
    this.slipA = clamp(this.slipA + (target > this.slipA ? rate : -rate), 0, 1);
    const a = this.slipA * appear;
    if (a <= 0.002) { this.slipBox.style.display = 'none'; return; }
    this.slipBox.style.display = '';
    const e = easeOut(this.slipA);
    this.slipBox.style.opacity = a.toFixed(3);
    this.slipBox.style.transform = `translateY(${((1 - e) * 8).toFixed(2)}px)`;
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
    this._slip(dt, game, appear);
    const set = this._resolve(game, mode);
    if (set !== this.mode) this._render(set);
    const e = easeOut(clamp((appear - 0.18) / 0.62, 0, 1));
    this.root.style.opacity = e.toFixed(3);
    this.root.style.transform = `translateX(-50%) translateY(${((1 - e) * 14).toFixed(2)}px)`;
  }
}
