import { el, clamp, commas, easeOut, easeOutQuint } from '../UIKit.ts';
import { icon } from '../Icons.ts';
import { ensureInteractCss } from '../../game/interaction/interact.css.ts';
import { Bar } from '../Bar.ts';
import { readAscension, readArmiger, rpg } from '../GameData.ts';
import type { Menus } from '../Menus.ts';

/**
 * The Armiger — the arsenal of the Lucian kings.
 *
 * Real state, all of it: the gauge is `CombatBridge.armiger`, the ability list
 * is the nine authored nodes of the Armiger constellation in
 * `src/game/rpg/Ascension.js` with their live unlock state and AP cost, and
 * Enter spends real AP on the selected one through `RpgSystem.unlockNode`.
 * Whether the Armiger can be called at all is the `armiger` flag that
 * `arm_awaken` grants, so this screen is honest about being locked before it.
 *
 * Controls: ↑↓ pick an ability, Enter unlock. No CSS transitions.
 */
export class ArmigerScreen {
  _age!: number;
  _cur!: string | null;
  _msg!: any;
  _msgAge!: number;
  _rows!: any;
  _sig!: any;
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
  game!: any;
  gauge!: HTMLElement;
  gaugeBar!: Bar;
  gaugeD!: HTMLElement;
  gaugeV!: HTMLElement;
  i!: number;
  list!: HTMLElement;
  menus!: Menus;
  msg!: HTMLElement;
  rowNodes!: any;
  specVals!: HTMLElement[];
  src!: any;
  sub!: string;
  title!: string;
  constructor(menus: import('../Menus.ts').Menus) {
    ensureInteractCss();
    this.menus = menus;
    this.title = 'Armiger';
    this.sub = 'Thirteen blades of the Lucii';
    this.i = 0;
    this._msg = null;
    this._msgAge = 9;
  }

  /** @param root @param game */
  build(root: HTMLElement, game: any) {
    this.game = game;
    this.cols = el('div.cols');

    const l = el('div.col-l');
    l.appendChild(el('div.tabs', {}, [el('div.tab.on', { text: 'Royal Arms' })]));
    this.list = el('div.qlist');
    l.appendChild(this.list);

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
    this.specVals = [['Cost', ''], ['State', ''], ['Requires', ''], ['AP on hand', '']].map(([k]) => {
      const v = el('div.v');
      this.dSpecs.appendChild(el('div.dt-spec', {}, [el('div.k', { text: k }), v]));
      return v;
    });
    this.detail.appendChild(el('div.rule', { style: 'margin-top:24px;max-width:420px' }));
    this.detail.appendChild(this.dSpecs);
    this.act = el('div.q-act', {}, [this.actLb = el('div.lb')]);
    this.detail.appendChild(this.act);
    this.msg = el('div.shop-msg');
    this.detail.appendChild(this.msg);
    r.appendChild(this.detail);

    this.cols.appendChild(l);
    this.cols.appendChild(r);
    root.appendChild(this.cols);

    // the gauge, top right, where every screen puts its headline reading
    this.gaugeBar = new Bar({ cls: 'tall', chase: false });
    this.gaugeBar.tint('armiger');
    this.gauge = el('div.arm-gauge', {}, [
      el('div.k', { text: 'Armiger Gauge' }),
      this.gaugeV = el('div.v'),
      this.gaugeBar.node,
      this.gaugeD = el('div.d'),
    ]);
    root.appendChild(this.gauge);
  }

  enter(game: any) { if (game) this.game = game; this._sig = null; this._msg = null; this._msgAge = 9; }

  /* -------------------------------------------------------------- data */

  /** The Armiger constellation, with every node's live state. */
  _nodes() {
    const src = this.src = readAscension(this.game);
    const con = (src.constellations || []).find((c: any) => c.id === 'armiger');
    const ids = con ? con.nodeIds : Object.keys(src.nodes).filter((id) => id.startsWith('arm_'));
    return ids.filter((id: any) => src.nodes[id]).map((id: any) => {
      const def = src.nodes[id];
      const done = src.isUnlocked(id);
      const can = done ? { ok: false, reason: 'owned' } : src.canUnlock(id);
      return { id, def, done, can };
    }).sort((a: any, b: any) => a.def.ap - b.def.ap);
  }

  nav(dx: any, dy: number) {
    const n = (this._rows || []).length || 1;
    if (dy) this.i = (this.i + dy + n) % n;
  }

  accept() {
    const row = (this._rows || [])[this.i];
    if (!row) return;
    if (row.done) { this._say('Already yours.', false); return; }
    if (!row.can.ok) {
      this._say(row.can.reason === 'not-enough-ap'
        ? `Not enough AP — ${row.def.ap} needed.`
        : `Unlock ${row.can.missing.map((id: any) => this.src.nodes[id]?.name || id).join(', ')} first.`, false);
      return;
    }
    if (this.src.unlock(row.id)) { this._say(`${row.def.name} unlocked.`, true); this._sig = null; }
  }

  _say(text: string, ok: boolean) { this._msg = { text, ok }; this._msgAge = 0; }

  /* ----------------------------------------------------------- render */

  _renderRows(rows: any) {
    this.list.textContent = '';
    this.rowNodes = rows.map((row: any) => {
      const bg = el('div.mr-bg');
      const node = el('div.qrow', {}, [
        bg,
        icon('armiger', { size: 16, stroke: 1.15 }),
        el('div.qn', { text: row.def.name }),
        el('div.qp', { text: row.done ? 'Owned' : `${row.def.ap} AP` }),
      ]);
      if (!row.done && !row.can.ok) node.classList.add('locked');
      if (row.done) node.classList.add('tracked');
      this.list.appendChild(node);
      this.list.appendChild(el('div.rule', { style: 'opacity:.34' }));
      return { node, bg, row };
    });
  }

  /** @param dt @param game @param a */
  update(dt: number, game: any, a: number) {
    this.game = game;
    const rows = this._rows = this._nodes();
    if (this.i >= rows.length) this.i = Math.max(0, rows.length - 1);

    const sig = rows.map((r: any) => `${r.id}${r.done}${r.can.ok}`).join();
    if (sig !== this._sig) { this._sig = sig; this._renderRows(rows); this._cur = null; }

    for (let i = 0; i < (this.rowNodes || []).length; i++) {
      const rn = this.rowNodes[i];
      const t = easeOut(clamp((a - 0.14 - i * 0.028) / 0.55, 0, 1));
      rn.node.style.opacity = t.toFixed(3);
      rn.node.style.transform = `translateX(${((1 - t) * -26).toFixed(2)}px)`;
      const on = i === this.i;
      if (rn._on !== on) { rn.node.classList.toggle('on', on); rn._on = on; }
      rn.bg.style.opacity = on ? (0.6 + 0.2 * (0.5 + 0.5 * Math.sin(game.time.now * 2.6))).toFixed(3) : '0';
    }

    const row = rows[this.i];
    const key = row ? `${row.id}|${row.done}|${row.can.ok}` : 'none';
    if (this._cur !== key) {
      this._cur = key;
      this._age = 0;
      if (row) {
        this.dK.textContent = 'Armiger Constellation';
        this.dN.textContent = row.def.name;
        this.dD.textContent = row.def.desc || '';
        this.dI.textContent = '';
        this.dI.appendChild(icon('armiger', { size: 104, stroke: 0.46 }));
        this.specVals[0].textContent = `${commas(row.def.ap)} AP`;
        this.specVals[1].textContent = row.done ? 'Unlocked' : row.can.ok ? 'Ready to unlock' : 'Locked';
        this.specVals[2].textContent = (row.def.req || []).length
          ? row.def.req.map((id: any) => this.src.nodes[id]?.name || id).join(', ') : 'nothing';
        this.specVals[3].textContent = commas(this.src.ap);
        this.actLb.textContent = row.done ? 'Already yours'
          : row.can.ok ? `Enter — spend ${row.def.ap} AP` : 'Locked';
        this.actLb.className = row.done || !row.can.ok ? 'lb no' : 'lb go';
      }
    }
    this._age = (this._age || 0) + dt;
    const de = easeOut(clamp(this._age / 0.22, 0, 1)) * easeOut(clamp((a - 0.24) / 0.55, 0, 1)) * (row ? 1 : 0);
    this.detail.style.opacity = de.toFixed(3);
    this.detail.style.transform = `translateX(${((1 - de) * 16).toFixed(2)}px)`;
    this.dRule.style.height = `${(easeOutQuint(clamp((a - 0.2) / 0.7, 0, 1)) * 100).toFixed(0)}%`;

    // the live gauge
    const g = readArmiger(game);
    const r = rpg(game);
    const awake = !!(r && r.ascension && r.ascension.isUnlocked && r.ascension.isUnlocked('arm_awaken'));
    this.gaugeBar.set(clamp(g ?? 0, 0, 1), dt);
    this.gaugeV.textContent = g == null ? '—' : `${Math.round(g * 100)}%`;
    this.gaugeD.textContent = awake
      ? 'Full gauge calls the royal arms. R, or L1 on a pad.'
      : 'Sealed until Armiger Awakening is unlocked.';
    this.gauge.style.opacity = easeOut(clamp((a - 0.16) / 0.55, 0, 1)).toFixed(3);

    this._msgAge += dt;
    this.msg.style.opacity = this._msg ? easeOut(clamp((2.6 - this._msgAge) / 0.7, 0, 1)).toFixed(3) : '0';
    if (this._msg) {
      this.msg.textContent = this._msg.text;
      this.msg.className = `shop-msg ${this._msg.ok ? 'ok' : 'bad'}`;
    }
  }
}

export default ArmigerScreen;
