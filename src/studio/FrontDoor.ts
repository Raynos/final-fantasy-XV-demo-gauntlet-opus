import './frontdoor.css';
import { demoActive } from '../engine/Device.ts';
import { el, uiScale } from '../ui/UIKit.ts';

/**
 * The front door: PLAY, or GAME STUDIO. Shown before anything is booted.
 *
 * ## Why it owns no game
 *
 * In v1 this was a stage of `TitleScreen`, which meant `main.ts` had to await
 * the whole of `game.init()` — thirty systems, terrain, vegetation, props,
 * a shader compile — before it could draw two rows of text. Six and a half
 * seconds to reach a menu that is a crest, two labels and a fade.
 *
 * So the door moved in front of the boot. It renders from a static backdrop it
 * draws itself, takes the choice, and only then does anything expensive start.
 * That is worth roughly **6.2 of the 6.5 seconds** before a person can act.
 *
 * The attract camera over Leide is not lost — it moves to where it belongs,
 * behind the *title* screen, which is shown while the full game boots after
 * PLAY is chosen. A vista during a load is exactly what a game does with one.
 *
 * ## Why it does not share the title screen's CSS
 *
 * `title.css` is 84 lines all scoped under `#title`, and `TitleScreen` builds
 * its crest, its rows and its animation clock in one constructor against a live
 * `Game`. Reusing it here would mean either constructing a `Game` (the thing
 * this file exists to avoid) or refactoring a file another lane owns. The
 * shared thing that actually matters is the *voice* — thin pale-blue type,
 * generous letterspacing, angular corner cuts — and that comes from `ui.css`'s
 * custom properties, which both files read.
 */

export type DoorChoice = 'play' | 'studio';

export class FrontDoor {
  root: HTMLElement;
  rows: HTMLElement[];
  index: number;
  _onKey: (e: KeyboardEvent) => void;
  _onResize: () => void;
  _resolve: ((c: DoorChoice) => void) | null;

  constructor() {
    this.index = 0;
    this.rows = [];
    this._resolve = null;

    this.root = el('div', { id: 'door' });
    this.root.appendChild(el('div.fd-sky'));
    this.root.appendChild(el('div.fd-grain'));

    const mark = el('div.fd-mark', {}, [
      crest(),
      el('div.fd-ff', { text: 'Final Fantasy' }),
      el('div.fd-xv', { text: 'XV' }),
      el('div.fd-rule'),
      el('div.fd-tag', { text: 'A Final Fantasy for Fans and First-Timers' }),
    ]);
    this.root.appendChild(mark);

    const items: Array<{ id: DoorChoice, title: string, desc: string }> = [
      {
        id: 'play',
        title: 'Play',
        // The phone build is a boot mode, decided in `Device.ts` before this
        // renders, so the row says which one you are in rather than offering
        // a choice that was already taken.
        desc: demoActive() ? 'All of Eos, cut to fit a handset' : 'Chapter I — Departure',
      },
      { id: 'studio', title: 'Game Studio', desc: 'Explore the models and the world' },
    ];

    const menu = el('div.fd-menu');
    for (const it of items) {
      const row = el('button.fd-row', {}, [
        el('div.fd-row-t', { text: it.title }),
        el('div.fd-row-d', { text: it.desc }),
      ]);
      row.addEventListener('click', () => this._choose(it.id));
      row.addEventListener('mouseenter', () => this._highlight(items.indexOf(it)));
      menu.appendChild(row);
      this.rows.push(row);
    }
    this.root.appendChild(menu);

    this.root.appendChild(el('div.fd-foot', {}, [
      el('div.fk', {}, [el('b', { text: '↑↓' }), 'Select']),
      el('div.fk', {}, [el('b', { text: 'Enter' }), 'Confirm']),
    ]));

    this._onKey = (e) => this._key(e, items);
    this._onResize = () => this._scale();
    this._scale();
    this._highlight(0);
  }

  _scale() {
    this.root.style.zoom = uiScale(demoActive()).toFixed(4);
  }

  _highlight(i: number) {
    this.index = i;
    this.rows.forEach((r, n) => r.classList.toggle('on', n === i));
  }

  _key(e: KeyboardEvent, items: Array<{ id: DoorChoice }>) {
    if (e.key === 'ArrowDown' || e.key === 's') this._highlight((this.index + 1) % this.rows.length);
    else if (e.key === 'ArrowUp' || e.key === 'w') this._highlight((this.index + this.rows.length - 1) % this.rows.length);
    else if (e.key === 'Enter' || e.key === ' ') this._choose(items[this.index].id);
  }

  _choose(id: DoorChoice) {
    if (!this._resolve) return;
    const done = this._resolve;
    this._resolve = null;
    // Fade the door, resolve immediately: the caller has a boot to get on with
    // and there is no reason to spend 400 ms of a 6.5 s load on a transition.
    this.root.classList.add('going');
    done(id);
  }

  /** Show the door and resolve with what was picked. */
  ask(parent: HTMLElement): Promise<DoorChoice> {
    parent.appendChild(this.root);
    window.addEventListener('keydown', this._onKey);
    window.addEventListener('resize', this._onResize);
    // Two frames, so the CSS transition has a "before" to animate from.
    requestAnimationFrame(() => requestAnimationFrame(() => this.root.classList.add('in')));
    return new Promise<DoorChoice>((resolve) => { this._resolve = resolve; });
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey);
    window.removeEventListener('resize', this._onResize);
    this.root.remove();
  }
}

/**
 * The Lucian crest, drawn rather than loaded: a downward crystal held inside
 * swept wings under a broken crown arc.
 *
 * Redrawn here rather than imported because `TitleScreen`'s copy is a private
 * function in a file this one deliberately does not depend on — see the class
 * header. BRIEF rule 1 forbids a binary asset either way, so it is strokes.
 */
function crest(): SVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const S = document.createElementNS(NS, 'svg');
  S.setAttribute('class', 'fd-crest');
  S.setAttribute('viewBox', '0 0 168 104');
  S.setAttribute('fill', 'none');
  const stroke = (d: string, w = 1.1, o = 1) => {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', String(w));
    p.setAttribute('stroke-opacity', String(o));
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    p.setAttribute('fill', 'none');
    S.appendChild(p);
  };
  stroke('M40 26 Q60 8 80 17', 1.0, 0.75);
  stroke('M128 26 Q108 8 88 17', 1.0, 0.75);
  stroke('M84 6 L84 14', 1.4, 0.95);
  for (let i = 0; i < 4; i++) {
    const y = 32 + i * 8.5;
    const len = 56 - i * 9;
    const drop = 10 + i * 4.5;
    const o = 0.9 - i * 0.13;
    stroke(`M74 ${y} C ${74 - len * 0.45} ${y - 3}, ${74 - len * 0.8} ${y + drop * 0.3}, ${74 - len} ${y + drop}`, 1.0, o);
    stroke(`M94 ${y} C ${94 + len * 0.45} ${y - 3}, ${94 + len * 0.8} ${y + drop * 0.3}, ${94 + len} ${y + drop}`, 1.0, o);
  }
  stroke('M84 20 L95 42 L84 96 L73 42 Z', 1.25, 1);
  stroke('M73 42 L95 42', 0.85, 0.55);
  stroke('M84 20 L84 96', 0.7, 0.42);
  stroke('M64 30 L64 62', 0.7, 0.32);
  stroke('M104 30 L104 62', 0.7, 0.32);
  return S;
}
