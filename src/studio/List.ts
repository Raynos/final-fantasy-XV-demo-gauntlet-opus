/**
 * The studio's list engine: keyed reconcile, search, scroll retention,
 * windowing.
 *
 * ## The four things it exists to stop
 *
 * Both shells used to answer every interaction by clearing a container and
 * rebuilding it, and the v2 plan's own audit lists what that cost:
 *
 *  - **Scroll is lost on every keypress.** Stepping to the next asset in a
 *    23-row family rebuilt the list and returned it to the top, so a review
 *    pass over the roster meant re-scrolling after every single verdict. This
 *    is the one that made the tool tiring to use.
 *  - **Every row is rebuilt to change one row's class.** 170 destinations is
 *    170 elements and 340 children discarded to move a highlight.
 *  - **No search.** The World Explorer's list is 170 rows and the Shot Gallery's
 *    is 166; finding `vista_dawn` meant scrolling past everything.
 *  - **No windowing.** Two of the four lists are over 160 rows, and on a phone
 *    that is 160 live DOM nodes inside a scroller that is redrawn constantly.
 *
 * ## How it reconciles
 *
 * By **key**, against the nodes already in the container. A row whose key is
 * still present is moved rather than recreated, and only its mutable parts are
 * rewritten — which is what preserves both the scroll offset and any focus the
 * platform is holding. `makeRow` builds; `syncRow` updates. Nothing else in
 * either shell needs to know a diff happened.
 *
 * ## The search grammar, and why `-` earns its place
 *
 * Space-separated terms, all of which must match, and a term starting with `-`
 * must NOT match. That is the whole grammar. It is here because the useful
 * query on this corpus is subtractive: `hero -closeup` and `vista -night` are
 * how you get to a band of a 166-row list, and a plain substring filter cannot
 * express either.
 */

/** One row's identity and its rendered form. */
export interface ListRow<T> {
  /** Stable across redraws. The reconcile is keyed on this. */
  key: string;
  item: T;
  /** Everything a query is matched against, lowercased by `render`. */
  text: string;
}

export interface ListOpts<T> {
  /** Build the element for a row seen for the first time. */
  make(row: ListRow<T>): HTMLElement;
  /** Update an element that is being kept. Called for every visible row. */
  sync(node: HTMLElement, row: ListRow<T>): void;
  /**
   * Rows above which the list windows.
   *
   * 200 is the plan's number and it is a real threshold rather than a round
   * one: the two lists that exceed it are 170 destinations and 166 shots, so a
   * lower value would window the model families for no reason and a higher one
   * would never engage at all.
   */
  window?: number;
  /** A sticky, non-selectable band header. Returns null for no header. */
  group?(row: ListRow<T>): string | null;
}

/**
 * Parse a query into required and excluded terms.
 *
 * Exported because both shells show the parse back to the reviewer — a query
 * that silently matched nothing is indistinguishable from a broken list, and
 * saying "2 terms, 1 excluded, 0 rows" is the difference.
 */
export function parseQuery(q: string): { want: string[], not: string[] } {
  const want: string[] = [];
  const not: string[] = [];
  for (const raw of String(q || '').toLowerCase().split(/\s+/)) {
    if (!raw) continue;
    if (raw.startsWith('-')) { if (raw.length > 1) not.push(raw.slice(1)); }
    else want.push(raw);
  }
  return { want, not };
}

/** Does one row's text satisfy the query? @see the grammar in the header */
export function matches(text: string, q: { want: string[], not: string[] }): boolean {
  const t = text.toLowerCase();
  for (const n of q.not) if (t.includes(n)) return false;
  for (const w of q.want) if (!t.includes(w)) return false;
  return true;
}

export class StudioList<T> {
  root: HTMLElement;
  opts: ListOpts<T>;
  /** Live nodes by key, so a redraw can move rather than rebuild. */
  _nodes: Map<string, HTMLElement>;
  /** Group headers by label, same reason. */
  _heads: Map<string, HTMLElement>;
  /** Every row the caller last handed over, before filtering. */
  _all: Array<ListRow<T>>;
  query: string;
  /** Windowing state: the first index currently rendered. */
  _from: number;
  _onScroll: () => void;

  constructor(root: HTMLElement, opts: ListOpts<T>) {
    this.root = root;
    this.opts = opts;
    this._nodes = new Map();
    this._heads = new Map();
    this._all = [];
    this.query = '';
    this._from = 0;
    this._onScroll = () => this._maybeWindow();
    this.root.addEventListener('scroll', this._onScroll, { passive: true });
  }

  dispose() { this.root.removeEventListener('scroll', this._onScroll); }

  /** What survives the current query. */
  visible(): Array<ListRow<T>> {
    if (!this.query.trim()) return this._all;
    const q = parseQuery(this.query);
    return this._all.filter((r) => matches(`${r.key} ${r.text}`, q));
  }

  /** How the shell reports the filter back. @see parseQuery */
  summary(): string {
    const n = this.visible().length;
    if (!this.query.trim()) return `${this._all.length} rows`;
    const q = parseQuery(this.query);
    return `${n} of ${this._all.length}`
      + (q.want.length ? ` · ${q.want.join(' ')}` : '')
      + (q.not.length ? ` · not ${q.not.join(' ')}` : '');
  }

  setQuery(q: string) {
    if (q === this.query) return;
    this.query = q;
    this._from = 0;
    this.root.scrollTop = 0;
    this.render(this._all);
  }

  /**
   * Draw, keeping what can be kept.
   *
   * The scroll offset is read and written around the reconcile rather than
   * left to chance: moving a node inside its own parent does not disturb the
   * offset, but appending a window's worth below the fold can, and a list that
   * jumps under a thumb is worse than one that rebuilds.
   */
  render(rows: Array<ListRow<T>>) {
    this._all = rows;
    const keep = this.visible();
    const win = this.opts.window ?? 200;
    const windowed = keep.length > win;
    const slice = windowed ? keep.slice(this._from, this._from + win) : keep;

    const wasScroll = this.root.scrollTop;
    const seen = new Set<string>();
    const heads = new Set<string>();
    let group = '';
    let cursor: ChildNode | null = this.root.firstChild;

    /** Put `node` at the cursor, moving it only if it is not already there. */
    const place = (node: HTMLElement) => {
      if (cursor === node) { cursor = node.nextSibling; return; }
      this.root.insertBefore(node, cursor);
    };

    for (const row of slice) {
      const label = this.opts.group ? this.opts.group(row) : null;
      if (label && label !== group) {
        group = label;
        heads.add(label);
        let h = this._heads.get(label);
        if (!h) {
          h = document.createElement('div');
          h.className = 'st-group';
          h.textContent = label;
          this._heads.set(label, h);
        }
        place(h);
      }
      seen.add(row.key);
      let node = this._nodes.get(row.key);
      if (!node) {
        node = this.opts.make(row);
        this._nodes.set(row.key, node);
      }
      this.opts.sync(node, row);
      place(node);
    }

    // Anything left over is genuinely gone, not merely scrolled past.
    for (const [key, node] of this._nodes) {
      if (seen.has(key)) continue;
      node.remove();
      this._nodes.delete(key);
    }
    for (const [label, node] of this._heads) {
      if (heads.has(label)) continue;
      node.remove();
      this._heads.delete(label);
    }
    if (this.root.scrollTop !== wasScroll) this.root.scrollTop = wasScroll;
  }

  /**
   * Scroll a row into view without stealing the scroll from a person mid-drag.
   *
   * `nearest`, never `center`: the common case is stepping to the next asset
   * with a key, and re-centring on every step makes the list crawl under a
   * highlight that never moves.
   */
  reveal(key: string) {
    const node = this._nodes.get(key);
    if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest' });
  }

  /**
   * Advance the window when the scroller nears an end.
   *
   * A page at a time, with a row of overlap, so the list never renders empty
   * mid-flick. Deliberately not a virtualiser with spacer elements: the
   * scrollbar being honest about a 170-row list matters less here than the
   * reconcile staying simple enough to reason about.
   */
  _maybeWindow() {
    const win = this.opts.window ?? 200;
    const keep = this.visible();
    if (keep.length <= win) return;
    const el = this.root;
    const nearEnd = el.scrollTop + el.clientHeight > el.scrollHeight - 240;
    const nearTop = el.scrollTop < 240;
    let from = this._from;
    if (nearEnd) from = Math.min(keep.length - win, this._from + win - 8);
    else if (nearTop) from = Math.max(0, this._from - win + 8);
    if (from === this._from) return;
    this._from = from;
    this.render(this._all);
  }
}
