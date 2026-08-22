import { el, clamp, commas, easeOut, easeOutQuint } from '../UIKit.ts';
import type { CachedNode } from '../UIKit.ts';
import { icon } from '../Icons.ts';
import { ensureInteractCss } from '../../game/interaction/interact.css.ts';
import { ITEM_TABS, readItems, hudState, rpg } from '../GameData.ts';
import type { Menus } from '../Menus.ts';
import type { Game } from '../../game/Game.ts';

/** Rows the column can hold before the list would need to scroll. */
const MAX_ROWS = 22;

/**
 * Items: category tabs, the party's real bag, and a detail column.
 *
 * Every stack comes from `Inventory` — 137 authored item definitions, real
 * counts, real prices, real use effects — and the tabs actually filter, which
 * the placeholder list never did.
 */
export class InventoryScreen {
  _age!: number;
  _cur!: any;
  _gil!: string;
  _key!: string | null;
  _msg!: any;
  _msgAge!: number;
  act!: HTMLElement;
  actLb!: HTMLElement;
  cols!: HTMLElement;
  dD!: HTMLElement;
  dI!: HTMLElement;
  dK!: HTMLElement;
  dN!: HTMLElement;
  dRule!: HTMLElement;
  dSpecs!: HTMLElement;
  detail!: HTMLElement;
  game!: Game;
  gil!: HTMLElement;
  gilVal!: ChildNode | null;
  i!: number;
  items!: any[];
  list!: HTMLElement;
  menus!: Menus;
  msg!: HTMLElement;
  rows!: any[];
  specVals!: HTMLElement[];
  sub!: string;
  tab!: number;
  tabNodes!: CachedNode[];
  tabsEl!: HTMLElement;
  title!: string;
  constructor(menus: import('../Menus.ts').Menus) {
    ensureInteractCss();
    this.menus = menus;
    this.title = 'Items';
    this.sub = 'Carried by the retinue';
    this.i = 0;
    this.tab = 0;
    this.items = [];
    this._msg = null;
    this._msgAge = 9;
  }

  build(root: HTMLElement, game: Game) {
    this.game = game;
    this.cols = el('div.cols');
    const l = el('div.col-l');
    this.tabsEl = el('div.tabs');
    this.tabNodes = ITEM_TABS.map((t) => {
      const n = el('div.tab', { text: t.name });
      this.tabsEl.appendChild(n);
      return n;
    });
    l.appendChild(this.tabsEl);
    this.list = el('div.ilist');
    l.appendChild(this.list);
    this.rows = [];

    const r = el('div.col-r');
    this.detail = el('div.detail');
    this.dRule = el('div.rule.v');
    this.dK = el('div.dt-k');
    this.dN = el('div.dt-n');
    this.dD = el('div.t-body.dt-d');
    this.dI = el('div.dt-ico');
    this.detail.appendChild(this.dRule);
    this.detail.appendChild(this.dI);
    this.detail.appendChild(this.dK);
    this.detail.appendChild(this.dN);
    this.detail.appendChild(this.dD);

    this.dSpecs = el('div.dt-specs');
    this.specVals = [['Effect', ''], ['Target', ''], ['In Battle', ''], ['Held', '']].map(([k]) => {
      const v = el('div.v');
      this.dSpecs.appendChild(el('div.dt-spec', {}, [el('div.k', { text: k }), v]));
      return v;
    });
    this.detail.appendChild(el('div.rule', { style: 'margin-top:30px;max-width:400px' }));
    this.detail.appendChild(this.dSpecs);
    this.act = el('div.q-act', {}, [this.actLb = el('div.lb')]);
    this.detail.appendChild(this.act);
    this.msg = el('div.shop-msg');
    this.detail.appendChild(this.msg);
    r.appendChild(this.detail);

    this.cols.appendChild(l);
    this.cols.appendChild(r);
    root.appendChild(this.cols);

    this.gil = el('div.inv-gil', {}, [
      el('div.k', { text: 'Gil' }), el('div.v', { text: '0' }),
    ]);
    root.appendChild(this.gil);
    this.gilVal = this.gil.lastChild;
  }

  /** Rebuild the row list for the current tab. */
  _rebuild(items: any, key: string, game: Game) {
    this.items = items;
    this.list.textContent = '';
    this.rows = this.items.slice(0, MAX_ROWS).map((it) => {
      const row = el('div.irow', {}, [
        el('div.mr-bg'),
        icon(it.icon, { size: 17, stroke: 1.15 }),
        el('div.in', { text: it.name }),
        el('div.iq', {}, [el('span', { text: '×' }), el('b', { text: String(it.qty) })]),
      ]);
      this.list.appendChild(row);
      this.list.appendChild(el('div.rule', { style: 'opacity:.4' }));
      return { row, it, bg: row.firstChild };
    });
    if (!this.rows.length) {
      this.list.appendChild(el('div.irow', {}, [el('div.in', { text: '— nothing of this kind —' })]));
    }
    this.i = clamp(this.i, 0, Math.max(0, this.rows.length - 1));
    this._cur = null;
    this._key = key;
    // the header count is the whole bag, not just this tab
    const all = readItems(game, -1);
    const sub = `${all.length} entries  ·  ${commas(all.reduce((s, x) => s + x.qty, 0))} carried`;
    this.sub = sub;
    if (this.menus.name === 'inventory') this.menus.headS.textContent = sub;
  }

  nav(dx: number, dy: number) {
    if (dy && this.rows.length) this.i = (this.i + dy + this.rows.length) % this.rows.length;
    if (dx) { this.tab = (this.tab + dx + ITEM_TABS.length) % ITEM_TABS.length; this.i = 0; this._key = null; }
  }

  /**
   * Use the selected item on the party.
   *
   * The bag is real and so is the effect: this runs `Inventory.use`, which
   * spends the stack and applies the heal / revive / MP restore to actual
   * `Stats` blocks. Targeting follows the item definition — a party item hits
   * everyone, a revive picks a downed member, everything else picks whoever is
   * furthest from full — because asking a player to build a target cursor for
   * a potion is how a menu stops being used.
   */
  accept() {
    const r = rpg(this.game);
    const it = this.items[this.i];
    if (!r || !it) return;
    const def = r.tables?.items?.[it.id];
    if (!def || !def.use) { this._say(`${it.name} is not something you can use.`, false); return; }

    const roster = r.party.roster;
    const alive = roster.filter((s: any) => !s.ko);
    let targets;
    if (def.use.target === 'party') targets = roster;
    else if (def.use.type === 'revive') targets = roster.filter((s: any) => s.ko).slice(0, 1);
    else {
      const pool = alive.length ? alive : roster;
      targets = [pool.slice().sort((a: any, b: any) => (a.hp / a.maxHp) - (b.hp / b.maxHp))[0]];
    }

    const res = r.inventory.use(it.id, targets.filter(Boolean), { curativePower: r.ascension.value('curativePower') || 0 });
    if (res.ok) {
      const results = res.results || [];
      const healed = results.reduce((s: any, x: any) => s + (x.healed || 0), 0);
      const revived = results.some((x: any) => x.revived);
      this._say(revived ? `${it.name} — back on their feet.`
        : healed ? `${it.name} — ${commas(healed)} HP restored.`
          : `${it.name} used.`, true);
      this._key = null;
    } else {
      const why: Record<string, string> = {
        'not-usable': 'Nothing to use it on.',
        'none-left': 'None left.',
        'no-target': 'Nobody needs it.',
      };
      this._say(why[res.reason ?? ''] || 'Nothing doing.', false);
    }
  }

  _say(text: any, ok: boolean) { this._msg = { text, ok }; this._msgAge = 0; }

  enter(game: Game) { if (game) this.game = game; this._key = null; this._msg = null; this._msgAge = 9; }

  /** @param dt @param game @param a */
  update(dt: number, game: Game, a: number) {
    // rebuild when the tab changes or the bag does
    const items = readItems(game, this.tab);
    const key = `${this.tab}|${items.map((x) => `${x.id}${x.qty}`).join()}`;
    if (this._key !== key) this._rebuild(items, key, game);

    const hs = hudState(game);
    const gil = commas(hs ? hs.gil : 0);
    if (this._gil !== gil) { this.gilVal!.textContent = gil; this._gil = gil; }

    for (let i = 0; i < this.tabNodes.length; i++) {
      const on = i === this.tab;
      if (this.tabNodes[i]._on !== on) { this.tabNodes[i].classList.toggle('on', on); this.tabNodes[i]._on = on; }
    }
    this.tabsEl.style.opacity = easeOut(clamp((a - 0.1) / 0.5, 0, 1)).toFixed(3);
    this.gil.style.opacity = easeOut(clamp((a - 0.3) / 0.5, 0, 1)).toFixed(3);

    for (let i = 0; i < this.rows.length; i++) {
      const r = this.rows[i];
      const t = easeOut(clamp((a - 0.14 - i * 0.022) / 0.55, 0, 1));
      r.row.style.opacity = t.toFixed(3);
      r.row.style.transform = `translateX(${((1 - t) * -26).toFixed(2)}px)`;
      const on = i === this.i;
      if (r._on !== on) { r.row.classList.toggle('on', on); r._on = on; }
      r.bg.style.opacity = on ? (0.6 + 0.2 * (0.5 + 0.5 * Math.sin(game.time.now * 2.6))).toFixed(3) : '0';
    }

    const it = this.items[this.i];
    if (it && this._cur !== it.id) {
      this.dK.textContent = it.tag;
      this.dN.textContent = it.name;
      this.dD.textContent = it.desc;
      this.dI.textContent = '';
      this.dI.appendChild(icon(it.icon, { size: 108, stroke: 0.46 }));
      this.specVals[0].textContent = it.effect || '—';
      this.specVals[1].textContent = it.target || '—';
      this.specVals[2].textContent = it.field ? 'Yes' : 'No';
      this.specVals[3].textContent = `×${it.qty}`;
      this._cur = it.id;
      this._age = 0;
      // Say what Enter will do on this row, every row, so nothing in the list
      // is a mystery box.
      const usable = it.field;
      this.actLb.textContent = usable ? 'Enter — use it' : 'Cannot be used here';
      this.actLb.className = usable ? 'lb go' : 'lb no';
    }
    this._age = (this._age || 0) + dt;
    const d = easeOut(clamp(this._age / 0.24, 0, 1)) * easeOut(clamp((a - 0.24) / 0.55, 0, 1));
    this.detail.style.opacity = (it ? d : 0).toFixed(3);
    this.detail.style.transform = `translateX(${((1 - d) * 16).toFixed(2)}px)`;
    this.dRule.style.height = `${(easeOutQuint(clamp((a - 0.2) / 0.7, 0, 1)) * 100).toFixed(0)}%`;

    this._msgAge += dt;
    this.msg.style.opacity = this._msg ? easeOut(clamp((2.6 - this._msgAge) / 0.7, 0, 1)).toFixed(3) : '0';
    if (this._msg) {
      this.msg.textContent = this._msg.text;
      this.msg.className = `shop-msg ${this._msg.ok ? 'ok' : 'bad'}`;
    }
  }
}
