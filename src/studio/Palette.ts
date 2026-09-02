import { el } from '../ui/UIKit.ts';
import { parseQuery, matches } from './List.ts';

/**
 * ⌘K: one search box over everything the studio can reach.
 *
 * ## Why a palette and not more menus
 *
 * The studio's addressable surface is six sections, 56 models, 170
 * destinations, 166 framings and a dozen look knobs — well over four hundred
 * things, reachable today only by picking a section, then a family, then
 * scrolling. A palette collapses that to typing the name, which is the one
 * navigation model that does not get slower as the content grows. Every entry
 * is also reachable the long way; this accelerates, it does not gatekeep.
 *
 * ## It shares the list's grammar deliberately
 *
 * `parseQuery` and `matches` come from `List.ts`, so `hero -closeup` means the
 * same thing in the palette as it does in a section's filter box. A tool with
 * two search syntaxes has one the user does not know.
 *
 * ## Desktop only, and that is the point
 *
 * `⌘K` needs a keyboard. The mobile shell's answer to the same problem is the
 * per-section filter field, which a thumb can actually reach — inventing a
 * palette for a device with no `⌘` would be the desktop shell scaled down,
 * which the mobile shell exists not to be.
 */

/** One thing the palette can go to. */
export interface Command {
  /** Stable id, and part of what a query matches. */
  id: string;
  /** What the row reads. */
  label: string;
  /** The band, e.g. `Models · Enemies`. */
  group: string;
  /** Extra searchable text that is not shown. */
  hint?: string;
  run(): void;
}

export class Palette {
  root: HTMLElement;
  input: HTMLInputElement;
  list: HTMLElement;
  open: boolean;
  /** Rebuilt every open, because the studio's contents change under it. */
  _source: () => Command[];
  _rows: Command[];
  _at: number;
  _onKey: (e: KeyboardEvent) => void;

  constructor(parent: HTMLElement, source: () => Command[]) {
    this._source = source;
    this._rows = [];
    this._at = 0;
    this.open = false;

    this.input = el('input.st-pal-in', {
      type: 'text',
      placeholder: 'Go to…   (space-separated terms, -term excludes)',
      autocomplete: 'off',
      spellcheck: 'false',
    }) as HTMLInputElement;
    this.list = el('div.st-pal-list');
    this.root = el('div.st-pal.st-ui', {}, [
      el('div.st-pal-box', {}, [this.input, this.list]),
    ]);
    this.root.hidden = true;
    parent.appendChild(this.root);

    this.input.addEventListener('input', () => { this._at = 0; this._render(); });
    // A click on the backdrop, not on the box, closes it.
    this.root.addEventListener('pointerdown', (e) => { if (e.target === this.root) this.hide(); });

    this._onKey = (e) => this._key(e);
    window.addEventListener('keydown', this._onKey);
  }

  dispose() {
    window.removeEventListener('keydown', this._onKey);
    this.root.remove();
  }

  show() {
    if (this.open) return;
    this.open = true;
    this.root.hidden = false;
    this.input.value = '';
    this._at = 0;
    this._render();
    this.input.focus();
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.root.hidden = true;
  }

  _key(e: KeyboardEvent) {
    // Open on ⌘K / Ctrl+K from anywhere, including from inside another field —
    // there is nowhere in this shell where that chord means something else.
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (this.open) this.hide(); else this.show();
      return;
    }
    if (!this.open) return;
    if (e.key === 'Escape') { e.preventDefault(); this.hide(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); this._move(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); this._move(-1); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const row = this._rows[this._at];
      if (row) { this.hide(); row.run(); }
    }
  }

  _move(d: number) {
    if (!this._rows.length) return;
    this._at = (this._at + d + this._rows.length) % this._rows.length;
    this._render();
  }

  /**
   * Draw the matches.
   *
   * Capped at 60. A palette that renders four hundred rows to show you the top
   * eight has spent the latency it existed to save, and nobody scrolls a
   * palette — they type another word.
   */
  _render() {
    const q = parseQuery(this.input.value);
    const all = this._source();
    this._rows = all
      .filter((c) => matches(`${c.id} ${c.label} ${c.group} ${c.hint || ''}`, q))
      .slice(0, 60);
    if (this._at >= this._rows.length) this._at = 0;

    this.list.textContent = '';
    if (!this._rows.length) {
      this.list.appendChild(el('div.st-pal-none', {
        text: `Nothing matches — ${all.length} things are reachable`,
      }));
      return;
    }
    this._rows.forEach((c, i) => {
      const row = el('button.st-pal-row.st-ui', {}, [
        el('span', { text: c.label }),
        el('span.st-n', { text: c.group }),
      ]);
      row.classList.toggle('on', i === this._at);
      row.addEventListener('click', () => { this.hide(); c.run(); });
      this.list.appendChild(row);
    });
  }
}
