import { el, clear, clamp, easeOut, easeOutQuint } from '../../ui/UIKit.ts';
import { button, portrait } from '../../ui/Icons.ts';
import { ensureInteractCss } from './interact.css.ts';

/**
 * Conversations.
 *
 * A script is a map of nodes. Each node is a speaker plus one or more lines,
 * and either a `next` node id or a list of `choices`. Handlers can run on the
 * way into a node (`enter`) or when a choice is taken (`action`), which is how
 * a conversation opens a shop, accepts a hunt or books a caravan bed.
 *
 * ```js
 * dialogue.start({
 *   speaker: 'Cindy', role: 'Hammerhead Mechanic', hue: 44,
 *   start: 'hello',
 *   nodes: {
 *     hello: { lines: ["Y'all look like you could use a hand."], next: 'menu' },
 *     menu: {
 *       choices: [
 *         { label: 'About the car', next: 'car' },
 *         { label: 'Never mind', end: true },
 *       ],
 *     },
 *     car: { lines: ['She just needs parts.'], next: 'menu' },
 *   },
 * });
 * ```
 *
 * Type-on is per frame from `game.time`, so a capture at N fixed steps is
 * always the same frame of the same sentence.
 */

/** Characters revealed per second while a line types on. */
const TYPE_RATE = 46;

export class Dialogue {
  _full!: any;
  _gp!: any;
  _lineIdx!: number;
  _lines!: any;
  _portraitHue!: any;
  _sel!: number;
  _typed!: number;
  a!: number;
  active!: boolean;
  chNodes!: any[];
  choices!: any;
  foot!: any;
  footLb!: any;
  game!: any;
  head!: any;
  line!: any;
  nm!: any;
  node!: any;
  nodeId!: any;
  pf!: any;
  role!: any;
  root!: any;
  rule!: any;
  script!: any;
  wrap!: any;
  constructor(parent: HTMLElement) {
    ensureInteractCss();
    this.root = el('div', { id: 'dialogue' });
    parent.appendChild(this.root);

    this.wrap = el('div.dlg');
    this.pf = el('div.dlg-pf');
    this.nm = el('div.dlg-nm');
    this.role = el('div.dlg-role');
    this.head = el('div.dlg-head', {}, [this.pf, el('div.dlg-who', {}, [this.nm, this.role])]);
    this.rule = el('div.dlg-rule');
    this.line = el('div.dlg-line');
    this.choices = el('div.dlg-choices');
    this.footLb = el('div.lb', { text: 'Continue' });
    this.foot = el('div.dlg-foot', {}, [this.footLb, button('E', { size: 21 })]);
    this.wrap.appendChild(this.head);
    this.wrap.appendChild(this.rule);
    this.wrap.appendChild(this.line);
    this.wrap.appendChild(this.choices);
    this.wrap.appendChild(this.foot);
    this.root.appendChild(this.wrap);
    this.root.style.display = 'none';

    this.active = false;
    this.a = 0;
    this._sel = 0;
    this._typed = 0;
    this._portraitHue = null;
    this._scale();
    window.addEventListener('resize', () => this._scale());
  }

  _scale() {
    const s = clamp(Math.min(window.innerWidth / 1600, window.innerHeight / 900), 0.72, 1.5);
    this.root.style.zoom = s.toFixed(4);
  }

  /**
   * Begin a conversation.
   * @param script `{ speaker, role, hue, start, nodes, onEnd }`
   */
  start(script: any, game: any) {
    if (!script || !script.nodes) return false;
    this.script = script;
    this.game = game;
    this.active = true;
    this.root.style.display = '';
    this._goto(script.start || Object.keys(script.nodes)[0]);
    return true;
  }

  /** End the conversation and hand input back to the field. */
  end() {
    if (!this.active) return;
    this.active = false;
    this.node = null;
    if (this.script?.onEnd) this.script.onEnd(this.game);
    this.script = null;
  }

  _goto(id: any) {
    const node = this.script.nodes[id];
    if (!node) { this.end(); return; }
    this.node = node;
    this.nodeId = id;
    this._lineIdx = 0;
    this._typed = 0;
    this._sel = 0;
    if (node.enter) node.enter(this.game, this);

    // Speaker can be overridden per node (Cid butting in on Cindy's line).
    const speaker = node.speaker || this.script.speaker || '';
    const role = node.role || this.script.role || '';
    const hue = node.hue ?? this.script.hue ?? 210;
    this.nm.textContent = speaker;
    this.role.textContent = role;
    this.role.style.display = role ? '' : 'none';
    if (this._portraitHue !== hue) {
      this._portraitHue = hue;
      clear(this.pf);
      this.pf.appendChild(portrait(hue, node.tone ?? this.script.tone ?? 0.5));
    }

    // `lines` may be a function so a node can read live state (gil, banked EXP,
    // who levelled overnight) at the moment it is shown rather than at author
    // time — which is the whole reason the shop and rest flows can talk numbers.
    const raw = typeof node.lines === 'function' ? node.lines(this.game, this) : node.lines;
    this._lines = raw ? (Array.isArray(raw) ? raw : [raw]) : [];
    this._renderChoices();
    this._syncLine();
  }

  _syncLine() {
    this._full = this._lines[this._lineIdx] || '';
    this._typed = 0;
  }

  _renderChoices() {
    clear(this.choices);
    this.chNodes = [];
    const list = this._visibleChoices();
    for (const c of list) {
      const bg = el('div.dlg-bg');
      const row = el('div.dlg-ch', {}, [
        bg, el('div.dlg-dot'), el('div.dlg-t', { text: c.label }),
        c.note ? el('div.dlg-note', { text: c.note }) : null,
      ]);
      this.choices.appendChild(row);
      this.chNodes.push({ row, bg, def: c });
    }
    this.choices.style.display = list.length ? '' : 'none';
  }

  /** Choices whose `when` predicate passes right now. */
  _visibleChoices() {
    const raw = this.node?.choices || [];
    return raw.filter((c: any) => !c.when || c.when(this.game));
  }

  /** True when the current line has finished typing. */
  get _lineDone() { return this._typed >= this._full.length; }

  _advance() {
    if (!this._lineDone) { this._typed = this._full.length; return; }
    if (this._lineIdx < this._lines.length - 1) {
      this._lineIdx++;
      this._syncLine();
      return;
    }
    // Lines exhausted — offer the choices, or follow `next`, or close.
    if (this.chNodes && this.chNodes.length) {
      this._pick();
      return;
    }
    if (this.node.next) { this._goto(this.node.next); return; }
    this.end();
  }

  _pick() {
    const c = this.chNodes[this._sel];
    if (!c) { this.end(); return; }
    if (c.def.action) {
      const r = c.def.action(this.game, this);
      // An action may redirect: return a node id to jump there.
      if (typeof r === 'string') { this._goto(r); return; }
    }
    if (c.def.end) { this.end(); return; }
    if (c.def.next) { this._goto(c.def.next); return; }
    this.end();
  }

  update(dt: any, game: any) {
    const target = this.active ? 1 : 0;
    const rate = dt / 0.22;
    this.a = clamp(this.a + (target > this.a ? rate : -rate * 1.6), 0, 1);
    if (this.a <= 0.002 && !this.active) { this.root.style.display = 'none'; return; }
    this.root.style.display = '';

    if (this.active) this._input(game);

    // type-on
    if (this.active && this._full) {
      this._typed = Math.min(this._full.length, this._typed + TYPE_RATE * dt);
    }
    const shown = this._full ? this._full.slice(0, Math.floor(this._typed)) : '';
    if (this.line.textContent !== shown) this.line.textContent = shown;

    const e = easeOutQuint(this.a);
    this.wrap.style.opacity = easeOut(this.a).toFixed(3);
    this.wrap.style.transform = `translateX(-50%) translateY(${((1 - e) * 22).toFixed(2)}px)`;
    this.head.style.opacity = easeOut(clamp((this.a - 0.12) / 0.6, 0, 1)).toFixed(3);
    this.rule.style.width = `${(easeOutQuint(clamp((this.a - 0.08) / 0.8, 0, 1)) * 100).toFixed(1)}%`;

    const hasChoices = !!(this.chNodes && this.chNodes.length);
    const choosing = hasChoices && this._lineDone && this._lineIdx >= this._lines.length - 1;
    for (let i = 0; i < (this.chNodes || []).length; i++) {
      const c = this.chNodes[i];
      const t = easeOut(clamp((this.a - 0.2 - i * 0.05) / 0.5, 0, 1)) * (choosing ? 1 : 0.24);
      c.row.style.opacity = t.toFixed(3);
      c.row.style.transform = `translateX(${((1 - t) * -18).toFixed(2)}px)`;
      const on = choosing && i === this._sel;
      if (c._on !== on) { c.row.classList.toggle('on', on); c._on = on; }
      c.bg.style.opacity = on
        ? (0.62 + 0.22 * (0.5 + 0.5 * Math.sin(game.time.now * 2.6))).toFixed(3) : '0';
    }

    const foot = choosing ? 'Select' : (this._lineDone ? 'Continue' : 'Skip');
    if (this.footLb.textContent !== foot) this.footLb.textContent = foot;
    this.foot.style.opacity = easeOut(clamp((this.a - 0.3) / 0.5, 0, 1)).toFixed(3);
  }

  _input(game: any) {
    const inp = game.input;
    if (!inp) return;
    const down = (c: any) => inp.keyDown?.(c);
    const gp = (i: any) => !!inp.gamepad?.buttons?.[i]?.pressed;
    const edge = (k: any, v: any) => { const p = this._gp?.[k]; (this._gp = this._gp || {})[k] = v; return v && !p; };

    const hasChoices = !!(this.chNodes && this.chNodes.length);
    const choosing = hasChoices && this._lineDone && this._lineIdx >= this._lines.length - 1;
    if (choosing) {
      let dy = 0;
      if (down('ArrowUp') || down('KeyW') || edge('u', gp(12))) dy -= 1;
      if (down('ArrowDown') || down('KeyS') || edge('d', gp(13))) dy += 1;
      if (dy) this._sel = (this._sel + dy + this.chNodes.length) % this.chNodes.length;
    }
    if (down('Escape') || edge('b', gp(1))) {
      // Escape always leaves — a conversation must never trap the player.
      this.end();
      return;
    }
    if (down('KeyE') || down('Enter') || down('Space') || edge('a', gp(0))) this._advance();
  }
}
