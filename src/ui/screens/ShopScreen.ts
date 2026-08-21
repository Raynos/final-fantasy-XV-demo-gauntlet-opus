import { el, clear, clamp, commas, easeOut, easeOutQuint } from '../UIKit.ts';
import { icon, button } from '../Icons.ts';
import { ensureInteractCss } from '../../game/interaction/interact.css.ts';
import { TOWN_SHOPS, stockFor } from '../../world/town/Shops.ts';

/**
 * The shop counter.
 *
 * Reads `game.get('RpgSystem').inventory` and `rpg.tables.items` directly, so
 * prices, stack limits, gil and the sell-back list are the real economy rather
 * than a mirror of it. Three counters share this screen — the diner, the garage
 * and the Culless van — selected with `setShop(id)` before the screen opens.
 *
 * Controls: ↑↓ pick, ←→ change shelf, Q/E quantity (hold Shift for ten),
 * Enter to deal. Everything animates from `game.time`; no CSS transitions.
 */

/** Which icon reads for a given item definition. */
function iconFor(def: any) {
  if (!def) return 'items';
  if (def.category === 'weapon') {
    return ({
      sword: 'sword', greatsword: 'greatsword', polearm: 'lance', dagger: 'daggers',
      firearm: 'firearm', shield: 'shield', machinery: 'machinery',
    })[def.class] || 'sword';
  }
  if (def.category === 'accessory') return 'gear';
  if (def.category === 'catalyst') return 'fire';
  if (def.category === 'treasure') return 'ap';
  if (def.category === 'ingredient') return 'items';
  if (def.category === 'key') return 'archives';
  return 'potion';
}

/** One line of plain English about what an item does. */
function effectOf(def: any) {
  if (!def) return '—';
  if (def.use) {
    const u = def.use;
    if (u.type === 'heal') return `Restore ${commas(u.amount)} HP`;
    if (u.type === 'mp') return `Restore ${u.amount >= 999 ? 'all' : u.amount} MP`;
    if (u.type === 'full') return u.revive ? 'Full restore & revive' : 'Full restore';
    if (u.type === 'revive') return `Revive at ${Math.round((u.percent || 0.5) * 100)}% HP`;
    if (u.type === 'cure') return `Cure ${u.status.includes('*') ? 'all ailments' : u.status.join(', ')}`;
  }
  if (def.catalyst) return `${def.catalyst.effect} · potency +${def.catalyst.potency}`;
  if (def.category === 'weapon') return `Attack ${def.attack}`;
  if (def.category === 'accessory') {
    const m = def.mods || {};
    const parts = [];
    for (const k of ['hp', 'mp', 'strength', 'vitality', 'magic', 'spirit', 'defense']) {
      if (m[k]) parts.push(`${k.toUpperCase()} +${m[k]}`);
    }
    if (m.critRate) parts.push(`CRIT +${Math.round(m.critRate * 100)}%`);
    if (m.resist) parts.push(Object.keys(m.resist).map((r) => `${r} ${m.resist[r]}%`).join(' · '));
    return parts.join('  ') || '—';
  }
  if (def.tags && def.tags.length) return def.tags.join(' · ');
  return 'Sells for gil';
}

const MAX_ROWS = 14;

export class ShopScreen {
  _rows!: any;
  shopId!: string;
  _age!: number;
  _cur!: any;
  _msg!: any;
  _msgAge!: number;
  _ownerFor!: any;
  _sig!: any;
  _tabSig!: any;
  cols!: any;
  dD!: any;
  dI!: any;
  dK!: any;
  dN!: any;
  dRule!: any;
  dSpecs!: any;
  detail!: any;
  empty!: any;
  game!: any;
  gilBox!: any;
  gilD!: any;
  gilV!: any;
  i!: number;
  list!: any;
  menus!: any;
  msg!: any;
  owner!: any;
  ownerN!: any;
  ownerQ!: any;
  qHint!: any;
  qN!: any;
  qRow!: any;
  qTot!: any;
  qty!: number;
  rowNodes!: any[];
  scroll!: number;
  specVals!: any;
  sub!: string;
  tab!: number;
  tabNodes!: any;
  tabsEl!: any;
  title!: string;
  constructor(menus: import('../Menus.ts').Menus) {
    ensureInteractCss();
    this.menus = menus;
    this.title = 'Shop';
    this.sub = '';
    this.shopId = 'crowsnest';
    this.tab = 0;
    this.i = 0;
    this.qty = 1;
    this.scroll = 0;
    this._msg = null;
    this._msgAge = 9;
  }

  /** Pick which counter this is. Call before `Menus.setScreen('shop')`. */
  setShop(id: any) {
    if (!TOWN_SHOPS[id]) return;
    this.shopId = id;
    this.tab = 0;
    this.i = 0;
    this.qty = 1;
    this.scroll = 0;
    this._msg = null;
    const s = TOWN_SHOPS[id];
    this.title = s.name;
    this.sub = s.sub;
  }

  get shop() { return TOWN_SHOPS[this.shopId] || TOWN_SHOPS.crowsnest; }
  get tabName() { return this.shop.tabs[this.tab] || this.shop.tabs[0]; }
  get selling() { return this.tabName === 'Sell'; }

  /** @param root @param game */
  build(root: HTMLElement, game: any) {
    this.game = game;
    this.cols = el('div.shop-cols');

    const l = el('div.shop-l');
    this.tabsEl = el('div.tabs');
    l.appendChild(this.tabsEl);
    this.list = el('div.shop-list');
    l.appendChild(this.list);
    this.empty = el('div.shop-empty');
    this.empty.style.display = 'none';
    l.appendChild(this.empty);

    const r = el('div.shop-r');
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
    this.specVals = [['Effect', ''], ['Held', ''], ['Unit', ''], ['Stack', '']].map(([k]) => {
      const v = el('div.v');
      this.dSpecs.appendChild(el('div.dt-spec', {}, [el('div.k', { text: k }), v]));
      return v;
    });
    this.detail.appendChild(el('div.rule', { style: 'margin-top:26px;max-width:420px' }));
    this.detail.appendChild(this.dSpecs);

    this.qN = el('div.n');
    this.qTot = el('div.tot');
    this.qRow = el('div.shop-qty', {}, [
      el('div.k', { text: 'Quantity' }), this.qN,
      button('Q', { size: 20 }), button('E', { size: 20 }), this.qTot,
    ]);
    this.detail.appendChild(this.qRow);
    // The screen owns two keys the shared menu footer knows nothing about, so
    // it advertises them itself rather than silently expecting the player to
    // discover them.
    this.qHint = el('div.ix-hint', {
      text: 'Q / E adjust  ·  hold Shift for ten  ·  ←→ change shelf',
      style: 'margin-top:12px;letter-spacing:.2em',
    });
    this.detail.appendChild(this.qHint);
    this.msg = el('div.shop-msg');
    this.detail.appendChild(this.msg);

    this.owner = el('div.shop-owner');
    this.ownerQ = el('div.q');
    this.ownerN = el('div.n');
    this.owner.appendChild(this.ownerQ);
    this.owner.appendChild(this.ownerN);
    r.appendChild(this.detail);
    r.appendChild(this.owner);

    this.cols.appendChild(l);
    this.cols.appendChild(r);
    root.appendChild(this.cols);

    this.gilBox = el('div.shop-gil', {}, [
      el('div.k', { text: 'Gil on hand' }),
      this.gilV = el('div.v'),
      this.gilD = el('div.d'),
    ]);
    root.appendChild(this.gilBox);
  }

  /* -------------------------------------------------------------- data */

  get rpg() { return this.game?.get?.('RpgSystem') || this.game?.get?.('Rpg') || null; }

  /** Rows for the current tab: `{ def, price, held, kind }`. */
  rows() {
    const rpg = this.rpg;
    const inv = rpg?.inventory;
    const items = rpg?.tables?.items;
    if (!inv || !items) return [];
    if (this.selling) {
      return inv.sellable(this.shop.sellCategories).map((e: any) => ({
        def: e.def, price: e.unitPrice, held: e.count, kind: 'sell',
      }));
    }
    return stockFor(this.shop, this.tabName, items).map((def) => ({
      def, price: def.price, held: inv.count(def.id), kind: 'buy',
    }));
  }

  /* ------------------------------------------------------------ input */

  nav(dx: any, dy: any) {
    const rows = this._rows || [];
    if (dy && rows.length) this.i = (this.i + dy + rows.length) % rows.length;
    if (dx) {
      const n = this.shop.tabs.length;
      this.tab = (this.tab + dx + n) % n;
      this.i = 0; this.scroll = 0; this.qty = 1;
    }
    if (dy) this.qty = 1;
  }

  accept() {
    const rows = this._rows || [];
    const row = rows[this.i];
    const rpg = this.rpg;
    if (!row || !rpg?.inventory) return;
    const n = Math.max(1, this.qty);
    const res = row.kind === 'buy' ? rpg.inventory.buy(row.def.id, n) : rpg.inventory.sell(row.def.id, n);
    if (res.ok) {
      this._say(row.kind === 'buy'
        ? `Bought ${row.def.name}${n > 1 ? ` ×${n}` : ''} — ${commas(res.cost)} gil`
        : `Sold ${row.def.name}${n > 1 ? ` ×${n}` : ''} — +${commas(res.gil)} gil`, true);
      this.qty = 1;
    } else {
      this._say(({
        'not-enough-gil': this.shop.brokeLine,
        'no-room': 'You are carrying as many as you can.',
        'not-enough': 'You do not have that many.',
        'not-sellable': 'Nobody will give you gil for that.',
        'not-for-sale': 'Not for sale.',
      })[res.reason] || 'Nothing doing.', false);
    }
  }

  _say(text: any, ok: any) { this._msg = { text, ok }; this._msgAge = 0; }

  /** Extra keys this screen owns, polled rather than bound (Menus is shared). */
  _extraInput(game: any) {
    const inp = game.input;
    if (!inp) return;
    const step = (inp.key?.('ShiftLeft') || inp.key?.('ShiftRight')) ? 10 : 1;
    const row = (this._rows || [])[this.i];
    const cap = row ? (row.kind === 'sell' ? row.held : Math.max(1, (row.def.stack ?? 99) - row.held)) : 1;
    if (inp.keyDown?.('KeyE')) this.qty = clamp(this.qty + step, 1, Math.max(1, Math.min(99, cap)));
    if (inp.keyDown?.('KeyQ')) this.qty = clamp(this.qty - step, 1, Math.max(1, Math.min(99, cap)));
  }

  enter() { this.qty = 1; this._msg = null; this._msgAge = 9; this._sig = null; }

  /* ----------------------------------------------------------- render */

  _renderRows(rows: any) {
    clear(this.list);
    this.rowNodes = [];
    const view = rows.slice(this.scroll, this.scroll + MAX_ROWS);
    for (const r of view) {
      const bg = el('div.mr-bg');
      const node = el('div.srow', {}, [
        bg,
        icon(iconFor(r.def), { size: 17, stroke: 1.15 }),
        el('div.sn', { text: r.def.name }),
        el('div.sh', { text: r.held ? `×${r.held}` : '' }),
        el('div.sp', {}, [
          document.createTextNode(commas(r.price)),
          el('small', { text: 'G' }),
        ]),
      ]);
      this.list.appendChild(node);
      this.list.appendChild(el('div.rule', { style: 'opacity:.34' }));
      this.rowNodes.push({ node, bg, r });
    }
  }

  /** @param dt @param game @param a */
  update(dt: number, game: any, a: number) {
    this.game = game;
    this._extraInput(game);
    const shop = this.shop;
    const rpg = this.rpg;
    const rows = this._rows = this.rows();
    if (this.i >= rows.length) this.i = Math.max(0, rows.length - 1);
    // keep the cursor inside the window
    if (this.i < this.scroll) this.scroll = this.i;
    if (this.i >= this.scroll + MAX_ROWS) this.scroll = this.i - MAX_ROWS + 1;
    this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, rows.length - MAX_ROWS)));

    // tabs
    const tabSig = `${this.shopId}|${shop.tabs.join()}`;
    if (this._tabSig !== tabSig) {
      this._tabSig = tabSig;
      clear(this.tabsEl);
      this.tabNodes = shop.tabs.map((t: any) => {
        const n = el('div.tab', { text: t });
        this.tabsEl.appendChild(n);
        return n;
      });
      this.title = shop.name;
      this.sub = shop.sub;
      if (this.menus?.headT) { this.menus.headT.textContent = this.title; this.menus.headS.textContent = this.sub; }
    }
    for (let i = 0; i < this.tabNodes.length; i++) {
      const on = i === this.tab;
      if (this.tabNodes[i]._on !== on) { this.tabNodes[i].classList.toggle('on', on); this.tabNodes[i]._on = on; }
    }
    this.tabsEl.style.opacity = easeOut(clamp((a - 0.1) / 0.5, 0, 1)).toFixed(3);

    const sig = `${this.shopId}|${this.tab}|${this.scroll}|${rows.length}|${rows.map((r: any) => r.def.id + ':' + r.held).join()}`;
    if (sig !== this._sig) { this._sig = sig; this._renderRows(rows); }

    const gil = rpg?.inventory?.gil ?? 0;
    const empty = rows.length === 0;
    this.empty.style.display = empty ? '' : 'none';
    this.empty.textContent = this.selling ? shop.emptyLine : 'This shelf is bare.';

    for (let i = 0; i < (this.rowNodes || []).length; i++) {
      const rn = this.rowNodes[i];
      const idx = i + this.scroll;
      const t = easeOut(clamp((a - 0.14 - i * 0.022) / 0.55, 0, 1));
      rn.node.style.opacity = t.toFixed(3);
      rn.node.style.transform = `translateX(${((1 - t) * -24).toFixed(2)}px)`;
      const on = idx === this.i;
      if (rn._on !== on) { rn.node.classList.toggle('on', on); rn._on = on; }
      const poor = rn.r.kind === 'buy' && rn.r.price > gil;
      if (rn._poor !== poor) { rn.node.classList.toggle('poor', poor); rn._poor = poor; }
      rn.bg.style.opacity = on ? (0.6 + 0.2 * (0.5 + 0.5 * Math.sin(game.time.now * 2.6))).toFixed(3) : '0';
    }

    // gil readout
    this.gilV.textContent = '';
    this.gilV.appendChild(document.createTextNode(commas(gil)));
    this.gilV.appendChild(el('small', { text: 'G' }));
    const row = rows[this.i];
    const total = row ? row.price * Math.max(1, this.qty) : 0;
    this.gilD.textContent = row
      ? (row.kind === 'buy' ? `− ${commas(total)}  →  ${commas(Math.max(0, gil - total))}` : `+ ${commas(total)}  →  ${commas(gil + total)}`)
      : '';
    this.gilD.style.color = row && row.kind === 'buy' && total > gil ? 'var(--danger)' : '';
    this.gilBox.style.opacity = easeOut(clamp((a - 0.16) / 0.55, 0, 1)).toFixed(3);

    // detail column
    const key = row ? `${row.def.id}|${row.kind}` : 'none';
    if (this._cur !== key) {
      this._cur = key;
      this._age = 0;
      if (row) {
        const d = row.def;
        this.dK.textContent = row.kind === 'sell' ? `Sell · ${d.category}` : d.category;
        this.dN.textContent = d.name;
        this.dD.textContent = d.desc || '';
        clear(this.dI);
        this.dI.appendChild(icon(iconFor(d), { size: 104, stroke: 0.46 }));
        this.specVals[0].textContent = effectOf(d);
        this.specVals[1].textContent = `×${row.held}`;
        this.specVals[2].textContent = `${commas(row.price)} gil`;
        this.specVals[3].textContent = `${d.stack ?? 99} max`;
      } else {
        this.dK.textContent = '';
        this.dN.textContent = '';
        this.dD.textContent = '';
        clear(this.dI);
        for (const v of this.specVals) v.textContent = '';
      }
    } else if (row) {
      this.specVals[1].textContent = `×${row.held}`;
    }
    this._age = (this._age || 0) + dt;
    const de = easeOut(clamp(this._age / 0.22, 0, 1)) * easeOut(clamp((a - 0.24) / 0.55, 0, 1)) * (row ? 1 : 0);
    this.detail.style.opacity = de.toFixed(3);
    this.detail.style.transform = `translateX(${((1 - de) * 16).toFixed(2)}px)`;
    this.dRule.style.height = `${(easeOutQuint(clamp((a - 0.2) / 0.7, 0, 1)) * 100).toFixed(0)}%`;

    this.qN.textContent = `×${Math.max(1, this.qty)}`;
    this.qTot.textContent = row ? `${commas(total)} gil` : '';
    this.qRow.style.opacity = row ? '1' : '0';

    // transaction message, fading on its own clock
    this._msgAge += dt;
    if (this._msg) {
      this.msg.textContent = this._msg.text;
      this.msg.className = `shop-msg ${this._msg.ok ? 'ok' : 'bad'}`;
      this.msg.style.opacity = easeOut(clamp((2.6 - this._msgAge) / 0.7, 0, 1)).toFixed(3);
    } else {
      this.msg.style.opacity = '0';
    }

    // the owner's line, sitting bottom-right like a caption
    if (this._ownerFor !== this.shopId) {
      this._ownerFor = this.shopId;
      this.ownerQ.textContent = `“${shop.greeting}”`;
      this.ownerN.textContent = `${shop.owner} · ${shop.ownerRole}`;
    }
    this.owner.style.opacity = easeOut(clamp((a - 0.42) / 0.5, 0, 1)).toFixed(3);
  }
}

export default ShopScreen;
