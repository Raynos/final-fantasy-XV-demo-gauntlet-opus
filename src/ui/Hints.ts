import { el, clamp, easeOut, easeOutQuint } from './UIKit.ts';
import { button, icon } from './Icons.ts';
import { readQuest } from './GameData.ts';
import { bands, hits, PRIORITY } from './Layers.ts';
import type { Game } from '../game/Game.ts';

/**
 * First-run hints.
 *
 * A demo build has no manual and no tutorial, so the first thing a new player
 * does is stand still and wonder. Each hint here fires **once**, on the first
 * frame its condition is true, sits for a few seconds and leaves. They are
 * deliberately few: one on boot, one the first time something is interactable,
 * one the first time the Regalia is within reach, and one the first time a
 * menu opens.
 *
 * The card lives in its own layer above the menus so the menu hint is visible
 * over a full-screen screen, and everything animates from `game.time` — no CSS
 * transitions, so a capture is reproducible.
 *
 * ### Suspension, which is the whole of the 2026-08-31 fix
 *
 * Being on top is permission to be *seen*, not permission to be *anywhere*.
 * Having won the z-fight on purpose, this card then had nothing stopping it
 * landing on the content underneath, and a blind playtest found it six for
 * six: over the COMBAT and DRIVING column headers on Controls, over the
 * selected item's name and the KEY ITEMS tab on Items, over the quest title and
 * its first line on Quests, over Gladiolus's name and the whole of Ignis's
 * header and portrait on Gear, and over the Map and the camp meal menu. Lane 11
 * separately found it hiding a live `Claim` prompt outright in both tomb
 * frames. Its own capture harness could never have caught any of it —
 * `HUD.update` writes `hints.muted = !!game.currentShot` every frame, so the
 * card is switched off in every shot this project has ever taken.
 *
 * So the card now **suspends** rather than covers. While a full-screen screen
 * or a conversation owns the reading band (`Layers.ts`), or while a live
 * interact prompt would be underneath it, the card fades out and **its hold
 * timer stops**. Nothing is lost and nothing is covered: the hint comes back,
 * with its full nine seconds, the moment the way is clear. One mechanism for
 * both cases, because the losing behaviour is the same in both — this is
 * teaching, and teaching can wait.
 */

/** How long a hint stays up once it has appeared, in seconds. */
const HOLD = 9;

/** One teaching card: what it says and which key prompts it draws. */
export interface Hint {
  id: string;
  title: string;
  text: string;
  /** Key labels for `Icons.button`. */
  keys: string[];
  /** Icon key. */
  ico: string;
}

export class Hints {
  a!: number;
  age!: number;
  body!: HTMLElement;
  card!: HTMLElement;
  /** The hint on screen, or null. */
  cur!: Hint | null;
  icoW!: HTMLElement;
  keys!: HTMLElement;
  muted!: boolean;
  /** Hints waiting behind `cur`. */
  queue!: Hint[];
  root!: HTMLElement;
  /** Ids already shown once; a hint never repeats. */
  seen!: Set<string>;
  /** True while the card is yielding to something with a better claim. */
  suspended!: boolean;
  /** `#interact .ix-body`, looked up lazily — it is built by another system. */
  _ixBody!: HTMLElement | null;
  ttl!: HTMLElement;
  txt!: HTMLElement;
  /** @param parent usually `game.uiRoot` */
  constructor(parent: HTMLElement) {
    this.root = el('div', { id: 'hints' });
    this.card = el('div.hint.plate');
    this.icoW = el('div.hn-i');
    this.body = el('div.hn-b');
    this.ttl = el('div.hn-t');
    this.txt = el('div.hn-x');
    this.keys = el('div.hn-k');
    this.body.appendChild(this.ttl);
    this.body.appendChild(this.txt);
    this.body.appendChild(this.keys);
    this.card.appendChild(this.icoW);
    this.card.appendChild(this.body);
    this.root.appendChild(this.card);
    parent.appendChild(this.root);

    /** @type {Set<string>} hints already shown this session */
    this.seen = new Set();
    /** Hints that came true while another was still on screen. */
    this.queue = [];
    this.cur = null;
    this.age = 0;
    this.a = 0;
    this.root.style.display = 'none';
    /** Suppressed entirely during a capture. */
    this.muted = false;
    this.suspended = false;
    this._ixBody = null;
  }

  /**
   * Queue a hint. The first call for a given `id` wins; later ones are ignored,
   * which is what makes these first-run rather than nagging.
   * @param [keys] key glyphs to print along the bottom
   * @param [ico] icon key
   */
  show(id: string, title: string, text: string, keys: Array<string> = [], ico: string = 'system') {
    if (this.muted || this.seen.has(id)) return false;
    this.seen.add(id);
    // One at a time. Two conditions can come true on the same frame (boot, and
    // the car already being in reach) and a hint that is replaced before it can
    // be read is worse than one that waits its turn.
    if (this.cur) { this.queue.push({ id, title, text, keys, ico }); return true; }
    this._present({ id, title, text, keys, ico });
    return true;
  }

  /** Put a hint on screen now. */
  _present({ id, title, text, keys, ico }: Hint) {
    this.cur = { id, title, text, keys, ico };
    this.age = 0;
    this.ttl.textContent = title;
    this.txt.textContent = text;
    this.icoW.textContent = '';
    this.icoW.appendChild(icon(ico, { size: 22, stroke: 1.05 }));
    this.keys.textContent = '';
    for (const k of keys) this.keys.appendChild(button(k, { size: k.length > 2 ? 24 : 21 }));
  }

  /** Drop the current hint early — any deliberate input dismisses it. */
  dismiss() { if (this.cur) this.age = Math.max(this.age, HOLD); }

  /** Forget everything, so the harness and a fresh game start clean. */
  reset() {
    this.seen.clear(); this.queue.length = 0; this.cur = null; this.a = 0; this.age = 0;
    this.suspended = false;
    bands.release('notice', 'hint');
  }

  /**
   * Is something with a better claim in the way?
   *
   * Two questions, and they are different in kind. The reading band is a
   * *claim*: a full-screen screen or a conversation says it owns 150..812 and
   * this card is simply not allowed in there, whatever it happens to measure.
   * The interact prompt is a *rect*: it is world-anchored, so where it lands is
   * not knowable in advance and the only honest test is whether the two boxes
   * actually touch this frame. `getBoundingClientRect` bakes in the `zoom` both
   * layers carry, which is what makes the comparison valid across two roots.
   */
  _blocked(): boolean {
    if (!bands.free('reading', 'hint')) return true;
    if (!this._ixBody) this._ixBody = document.querySelector('#interact .ix-body');
    const ix = this._ixBody;
    if (!ix) return false;
    const root = ix.closest('#interact') as HTMLElement | null;
    if (!root || root.style.display === 'none') return false;
    const r = ix.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const c = this.card.getBoundingClientRect();
    // A card that is not laid out cannot be measured, and answering "false" to
    // that would unsuspend it, lay it out, and suspend it again next frame —
    // a 30 Hz strobe over the prompt it was supposed to be getting out of the
    // way of. `update` keeps the root displayed whenever a hint is current
    // precisely so this branch is not taken; the latch is the belt.
    if (c.width < 2) return this.suspended;
    return hits(c, r, 12);
  }

  /**
   * Work out which hint, if any, this frame has earned.
   */
  _poll(game: Game) {
    if (this.muted || game.currentShot) return;
    const story = game.get?.('Story');
    if (story && (story.title?.shown || story.cine?.playing)) return;

    const menus = game.get?.('Menus');
    if (menus && menus.name) {
      this.show('menu',
        'Getting back out',
        'Tab closes any screen and Backspace steps back one. Escape is claimed by the '
        + 'browser to release the mouse — when that happens the game opens this menu for you.',
        ['Tab', 'Bksp', 'B'], 'system');
      return;
    }

    // Boot: name the objective and point at the one key that explains the rest.
    const q = readQuest(game);
    this.show('boot',
      'Where you are',
      `${q.title} — ${q.step}. It is tracked on the compass, top right. `
      + 'H shows every control; Tab opens the menu; M opens the map.',
      ['H', 'Tab', 'M'], 'quests');

    // The Regalia, the moment it is close enough to get into.
    const car = game.get?.('Regalia');
    if (car && car.enabled && !car.isDriving && car.distanceToPlayer && car.distanceToPlayer() < 9) {
      this.show('car',
        'The Regalia',
        'Press F beside the car to get in, and F again to get out. W and S are throttle '
        + 'and brake, Space is the handbrake, I hands the wheel to Ignis and V cycles the camera.',
        ['F', 'I', 'V'], 'machinery');
    }

    // Anything you can walk up to and press a key at.
    const ix = game.get?.('Interaction');
    if (ix && ix.current) {
      this.show('interact',
        'Things you can use',
        'When a prompt floats over something — a counter, a board, a pump, a person — '
        + 'press E to use it. The prompt always names the key.',
        ['E'], 'items');
    }
  }

  /** @param dt @param game */
  update(dt: number, game: Game) {
    this._poll(game);
    if (!this.cur && this.a <= 0.001) {
      const next = this.queue.shift();
      if (next) this._present(next);
    }
    if (!this.cur && this.a <= 0.001) {
      this.root.style.display = 'none';
      this.suspended = false;
      bands.release('notice', 'hint');
      return;
    }
    // The claim is made before the block test and kept while the card is
    // suspended: the card has not gone away, it is waiting, and a claim it
    // dropped every time it yielded would let a second teaching card take the
    // band out from under it.
    bands.claim('notice', 'hint', PRIORITY.hint);
    this.suspended = this._blocked();
    // **The timer stops.** A hint that burnt its nine seconds behind a menu
    // would be a hint the player never got, which is the same defect as
    // covering the menu, one step further along.
    if (!this.suspended) this.age += dt;
    if (this.cur && this.age > HOLD) this.cur = null;

    const target = this.cur && !this.suspended ? 1 : 0;
    const rate = dt / 0.4;
    this.a = clamp(this.a + (target > this.a ? rate : -rate), 0, 1);
    // Displayed whenever a hint is CURRENT, not whenever it is visible. A
    // suspended card fades to nothing but stays laid out, because `_blocked`
    // has to be able to measure where it would be — see the note there.
    this.root.style.display = (this.cur || this.a > 0.001) ? '' : 'none';

    const e = easeOutQuint(this.a);
    this.card.style.opacity = easeOut(this.a).toFixed(3);
    this.card.style.transform = `translateX(-50%) translateY(${((1 - e) * -18).toFixed(2)}px)`;
    if (this.a <= 0.001) return;
    // a slow breath on the key glyphs so a still frame still reads as live
    this.keys.style.opacity = (0.82 + 0.18 * (0.5 + 0.5 * Math.sin(game.time.now * 2.1))).toFixed(3);
  }
}

export default Hints;
