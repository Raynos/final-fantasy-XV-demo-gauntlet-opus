import { el, clamp, commas, easeOut, easeOutQuint } from '../UIKit.js';
import { icon } from '../Icons.js';
import { ITEM_TABS, readItems, hudState } from '../GameData.js';

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
  /** @param {import('../Menus.js').Menus} menus */
  constructor(menus) {
    this.menus = menus;
    this.title = 'Items';
    this.sub = 'Carried by the retinue';
    this.i = 0;
    this.tab = 0;
    this.items = [];
  }

  /** @param {HTMLElement} root */
  build(root, game) {
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
  _rebuild(items, key, game) {
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

  nav(dx, dy) {
    if (dy && this.rows.length) this.i = (this.i + dy + this.rows.length) % this.rows.length;
    if (dx) { this.tab = (this.tab + dx + ITEM_TABS.length) % ITEM_TABS.length; this.i = 0; this._key = null; }
  }

  accept() { /* using an item is the combat system's business */ }

  enter(game) { if (game) this.game = game; this._key = null; }

  /** @param {number} dt @param {object} game @param {number} a */
  update(dt, game, a) {
    // rebuild when the tab changes or the bag does
    const items = readItems(game, this.tab);
    const key = `${this.tab}|${items.map((x) => `${x.id}${x.qty}`).join()}`;
    if (this._key !== key) this._rebuild(items, key, game);

    const hs = hudState(game);
    const gil = commas(hs ? hs.gil : 0);
    if (this._gil !== gil) { this.gilVal.textContent = gil; this._gil = gil; }

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
    }
    this._age = (this._age || 0) + dt;
    const d = easeOut(clamp(this._age / 0.24, 0, 1)) * easeOut(clamp((a - 0.24) / 0.55, 0, 1));
    this.detail.style.opacity = (it ? d : 0).toFixed(3);
    this.detail.style.transform = `translateX(${((1 - d) * 16).toFixed(2)}px)`;
    this.dRule.style.height = `${(easeOutQuint(clamp((a - 0.2) / 0.7, 0, 1)) * 100).toFixed(0)}%`;
  }
}
