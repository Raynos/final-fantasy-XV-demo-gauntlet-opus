import { clamp, clear, easeOut, easeOutQuint, el, uiScale } from '../../ui/UIKit.ts';
import { demoActive } from '../../engine/Device.ts';
import { button, portrait } from '../../ui/Icons.ts';
import { ensureInteractCss } from './interact.css.ts';
import type { Game } from '../Game.ts';

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

/**
 * One row of a `choices` node, as `_renderChoices` and `_pick` read it.
 */
export interface DialogueChoice {
  label: string;
  /** node id to jump to when this row is taken. */
  next?: string;
  /**
   * Run on selection. Returning a node id redirects there; returning anything
   * else falls through to `end` / `next`.
   */
  action?: (game: Game, dlg: Dialogue) => string | null | void;
  /** close the conversation after `action`. */
  end?: boolean;
  /** small right-hand tag on the row — `Shop`, `Hunts`. */
  note?: string;
  /** shown only while this passes. */
  when?: (game: Game) => boolean;
}

/**
 * One node of a script: who is speaking, what they say, and where it goes.
 *
 * `speaker` / `role` / `hue` / `tone` are optional here and fall back to the
 * script's — a node only restates them when someone else butts in on the line.
 */
export interface DialogueNode {
  speaker?: string;
  role?: string;
  /** Portrait hue, 0..360. */
  hue?: number;
  /** Portrait expression, 0..1. */
  tone?: number;
  /**
   * The lines to speak, in order. A function is evaluated when the node is
   * *shown*, so a line can read live gil, banked EXP or the clock.
   */
  lines?: string | string[] | ((game: Game, dlg: Dialogue) => string | string[]);
  /** Node to follow when the lines run out. `null` ends the conversation. */
  next?: string | null;
  choices?: DialogueChoice[];
  /** Run on the way in, before the node renders. */
  enter?: (game: Game, dlg: Dialogue) => void;
}

/** A whole conversation, as an NPC or a prop authors it. */
export interface DialogueScript {
  speaker?: string;
  role?: string;
  hue?: number;
  tone?: number;
  /** Node to open on; defaults to the first key of `nodes`. */
  start?: string;
  nodes: Record<string, DialogueNode>;
  onEnd?: (game: Game) => void;
}

/** A rendered choice row, and the last `on` state written onto it. */
interface ChoiceRow {
  row: HTMLElement;
  bg: HTMLElement;
  def: DialogueChoice;
  _on?: boolean;
}

export class Dialogue {
  /** The line currently typing on, in full. */
  _full!: string;
  /** Last-frame gamepad button states, for edge detection. */
  _gp!: Record<string, boolean> | null;
  _lineIdx!: number;
  _lines!: string[];
  _portraitHue!: number | null;
  _sel!: number;
  _typed!: number;
  a!: number;
  active!: boolean;
  chNodes!: ChoiceRow[];
  choices!: HTMLElement;
  foot!: HTMLElement;
  footLb!: HTMLElement;
  game!: Game;
  head!: HTMLElement;
  line!: HTMLElement;
  nm!: HTMLElement;
  node!: DialogueNode | null;
  nodeId!: string | null;
  pf!: HTMLElement;
  role!: HTMLElement;
  root!: HTMLElement;
  rule!: HTMLElement;
  script!: DialogueScript | null;
  wrap!: HTMLElement;
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
    const s = uiScale(demoActive());
    this.root.style.zoom = s.toFixed(4);
  }

  /**
   * Begin a conversation.
   * @param script `{ speaker, role, hue, start, nodes, onEnd }`
   */
  start(script: DialogueScript, game: Game) {
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

  _goto(id: string) {
    const script = this.script;
    if (!script) return;
    const node = script.nodes[id];
    if (!node) { this.end(); return; }
    this.node = node;
    this.nodeId = id;
    this._lineIdx = 0;
    this._typed = 0;
    this._sel = 0;
    if (node.enter) node.enter(this.game, this);

    // Speaker can be overridden per node (Cid butting in on Cindy's line).
    const speaker = node.speaker || script.speaker || '';
    const role = node.role || script.role || '';
    const hue = node.hue ?? script.hue ?? 210;
    this.nm.textContent = speaker;
    this.role.textContent = role;
    this.role.style.display = role ? '' : 'none';
    if (this._portraitHue !== hue) {
      this._portraitHue = hue;
      clear(this.pf);
      this.pf.appendChild(portrait(hue, node.tone ?? script.tone ?? 0.5));
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
    return raw.filter((c) => !c.when || c.when(this.game));
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
    const next = this.node?.next;
    if (next) { this._goto(next); return; }
    this.end();
  }

  _pick() {
    const c = this.chNodes[this._sel];
    if (!c) { this.end(); return; }
    if (c.def.action) {
      const r: string | null | void = c.def.action(this.game, this);
      // An action may redirect: return a node id to jump there.
      if (typeof r === 'string') { this._goto(r); return; }
    }
    if (c.def.end) { this.end(); return; }
    if (c.def.next) { this._goto(c.def.next); return; }
    this.end();
  }

  update(dt: number, game: Game) {
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
      /**
       * The preview dim, and it is most of playtest complaint #7's fifth
       * clause -- "the meal options are dark grey text on sunlit sandstone and
       * nearly unreadable".
       *
       * A choice list is shown, greyed, while the speaker is still talking, and
       * it only comes up to full when `choosing`. 0.24 of an already
       * translucent `--ink-3` over a rock in full sun is not "greyed", it is
       * gone -- and a player looking at Ignis's cooking menu is looking at
       * exactly that state, because the cook node has two lines and the choices
       * are previewed under both of them. The row plate this file's CSS now
       * draws makes the dim state legible on its own, and 0.45 keeps it clearly
       * subordinate to the line being spoken without erasing it.
       */
      const t = easeOut(clamp((this.a - 0.2 - i * 0.05) / 0.5, 0, 1)) * (choosing ? 1 : 0.45);
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

  _input(game: Game) {
    const inp = game.input;
    if (!inp) return;
    const down = (c: string) => inp.keyDown?.(c);
    const gp = (i: number) => !!inp.gamepad?.buttons?.[i]?.pressed;
    const edge = (k: string, v: boolean) => { const p = this._gp?.[k]; (this._gp = this._gp || {})[k] = v; return v && !p; };

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
