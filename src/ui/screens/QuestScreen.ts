import { el, clear, clamp, commas, easeOut, easeOutQuint } from '../UIKit.ts';
import { icon } from '../Icons.ts';
import { ensureInteractCss } from '../../game/interaction/interact.css.ts';
import { rpg } from '../GameData.ts';

/** Tabs, and the quest-log status each one gathers. */
const TABS = [
  { name: 'Active', status: 'active' },
  { name: 'Available', status: 'available' },
  { name: 'Completed', status: 'complete' },
];

const TYPE_LABEL = { main: 'Main Quest', side: 'Side Quest', hunt: 'Bounty', story: 'Main Quest' };
const REGION = { leide: 'Leide', duscae: 'Duscae', cleigne: 'Cleigne', insomnia: 'Insomnia' };

/** Rows the column can hold before the list would need to scroll. */
const MAX_ROWS = 16;

/**
 * The quest log.
 *
 * Everything on this screen is `rpg.quests`: the authored quest table, the real
 * per-objective progress counters, the tracked quest and the reward bundles.
 * Enter tracks an active quest (which is what the compass strip and the pause
 * menu's "Tracking" block read) or accepts an available one.
 *
 * Controls: ↑↓ pick, ←→ change tab, Enter track/accept. Everything animates
 * from `game.time`; no CSS transitions.
 */
export class QuestScreen {
  /** @param {import('../Menus.ts').Menus} menus */
  constructor(menus) {
    ensureInteractCss();
    this.menus = menus;
    this.title = 'Quests';
    this.sub = 'The journey so far';
    this.tab = 0;
    this.i = 0;
    this.scroll = 0;
    this._msg = null;
    this._msgAge = 9;
  }

  get rpg() { return rpg(this.game); }

  /** @param {HTMLElement} root @param {object} game */
  build(root, game) {
    this.game = game;
    this.cols = el('div.cols');

    const l = el('div.col-l');
    this.tabsEl = el('div.tabs');
    this.tabNodes = TABS.map((t) => {
      const n = el('div.tab', { text: t.name });
      this.tabsEl.appendChild(n);
      return n;
    });
    l.appendChild(this.tabsEl);
    this.list = el('div.qlist');
    l.appendChild(this.list);
    this.empty = el('div.shop-empty');
    this.empty.style.display = 'none';
    l.appendChild(this.empty);

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

    this.dObj = el('div.q-objs');
    this.dObjList = el('div');
    this.dObj.appendChild(el('div.k', { text: 'Objectives' }));
    this.dObj.appendChild(this.dObjList);
    this.detail.appendChild(this.dObj);

    this.dSpecs = el('div.dt-specs');
    this.specVals = [['Region', ''], ['Level', ''], ['Reward', ''], ['Status', '']].map(([k]) => {
      const v = el('div.v');
      this.dSpecs.appendChild(el('div.dt-spec', {}, [el('div.k', { text: k }), v]));
      return v;
    });
    this.detail.appendChild(el('div.rule', { style: 'margin-top:24px;max-width:420px' }));
    this.detail.appendChild(this.dSpecs);

    this.act = el('div.q-act');
    this.actLb = el('div.lb');
    this.act.appendChild(this.actLb);
    this.detail.appendChild(this.act);

    this.msg = el('div.shop-msg');
    this.detail.appendChild(this.msg);
    r.appendChild(this.detail);

    this.cols.appendChild(l);
    this.cols.appendChild(r);
    root.appendChild(this.cols);

    this.tally = el('div.q-tally', {}, [
      el('div.k', { text: 'Quest Log' }),
      this.tallyV = el('div.v'),
      this.tallyD = el('div.d'),
    ]);
    root.appendChild(this.tally);
  }

  enter(game) {
    if (game) this.game = game;
    this._sig = null;
    this._msg = null;
    this._msgAge = 9;
  }

  /* -------------------------------------------------------------- data */

  /** Rows for the current tab, straight off the log. */
  rows() {
    const r = this.rpg;
    if (!r || !r.quests) return [];
    const list = r.quests.byStatus(TABS[this.tab].status) || [];
    const rank = { main: 0, story: 0, side: 1, hunt: 2 };
    return list.slice().sort((a, b) =>
      (rank[a.type] ?? 9) - (rank[b.type] ?? 9) || (a.level || 0) - (b.level || 0));
  }

  /* ------------------------------------------------------------ input */

  nav(dx, dy) {
    const rows = this._rows || [];
    if (dy && rows.length) this.i = (this.i + dy + rows.length) % rows.length;
    if (dx) { this.tab = (this.tab + dx + TABS.length) % TABS.length; this.i = 0; this.scroll = 0; }
  }

  accept() {
    const row = (this._rows || [])[this.i];
    const r = this.rpg;
    if (!row || !r?.quests) return;
    if (row.status === 'active') {
      r.quests.track(row.id);
      this._say(`Tracking “${row.name}”.`, true);
      return;
    }
    if (row.status === 'complete') { this._say('Already finished.', false); return; }
    const res = r.quests.accept(row.id);
    if (res.ok) {
      r.quests.track(row.id);
      this._say(`Accepted — “${row.name}”.`, true);
      this._sig = null;
    } else {
      this._say(`Cannot take that one. (${res.reason})`, false);
    }
  }

  _say(text, ok) { this._msg = { text, ok }; this._msgAge = 0; }

  /* ----------------------------------------------------------- render */

  _renderRows(rows, tracked) {
    clear(this.list);
    this.rowNodes = [];
    const view = rows.slice(this.scroll, this.scroll + MAX_ROWS);
    for (const q of view) {
      const bg = el('div.mr-bg');
      const done = (q.objectives || []).filter((o) => o.done).length;
      const node = el('div.qrow', {}, [
        bg,
        icon(q.type === 'hunt' ? 'armiger' : 'quests', { size: 16, stroke: 1.15 }),
        el('div.qn', { text: q.name }),
        q.id === tracked ? el('div.qflag', { text: 'Tracking' }) : null,
        el('div.qp', { text: q.status === 'complete' ? 'Done' : `${done}/${(q.objectives || []).length}` }),
      ]);
      if (q.id === tracked) node.classList.add('tracked');
      this.list.appendChild(node);
      this.list.appendChild(el('div.rule', { style: 'opacity:.34' }));
      this.rowNodes.push({ node, bg, q });
    }
  }

  _renderDetail(q, r) {
    this.dK.textContent = `${TYPE_LABEL[q.type] || 'Quest'}${q.rank ? `  ·  ${q.rank.name}` : ''}`;
    this.dN.textContent = q.name;
    this.dD.textContent = q.summary || '';
    clear(this.dI);
    this.dI.appendChild(icon(q.type === 'hunt' ? 'armiger' : 'quests', { size: 104, stroke: 0.46 }));

    clear(this.dObjList);
    for (const o of q.objectives || []) {
      const node = el('div.hc-ob', {}, [el('div.d'), el('div', { text: o.label || o.desc })]);
      if (o.done) node.classList.add('done');
      this.dObjList.appendChild(node);
    }

    const rewards = r?.quests?.rewardsFor?.(q.id) || q.rewards || {};
    const items = (rewards.items || [])
      .map((it) => `${r?.tables?.items?.[it.id]?.name || it.id}${it.count > 1 ? ` ×${it.count}` : ''}`)
      .join(', ');
    this.specVals[0].textContent = REGION[q.region] || q.region || '—';
    this.specVals[1].textContent = q.level ? `Lv ${q.level}` : '—';
    this.specVals[2].textContent = `${commas(rewards.gil || 0)} gil${items ? `, ${items}` : ''}`;
    this.specVals[3].textContent = q.status === 'complete' ? 'Complete'
      : q.status === 'active' ? 'In progress' : 'Not yet accepted';

    const tracked = r?.quests?.tracked === q.id;
    if (q.status === 'complete') { this.actLb.textContent = 'Reward already claimed'; this.actLb.className = 'lb no'; }
    else if (q.status === 'active') {
      this.actLb.textContent = tracked ? 'Enter — already tracking this' : 'Enter — track this quest';
      this.actLb.className = tracked ? 'lb no' : 'lb go';
    } else { this.actLb.textContent = 'Enter — accept this quest'; this.actLb.className = 'lb go'; }
  }

  /** @param {number} dt @param {object} game @param {number} a */
  update(dt, game, a) {
    this.game = game;
    const r = this.rpg;
    const rows = this._rows = this.rows();
    if (this.i >= rows.length) this.i = Math.max(0, rows.length - 1);
    if (this.i < this.scroll) this.scroll = this.i;
    if (this.i >= this.scroll + MAX_ROWS) this.scroll = this.i - MAX_ROWS + 1;
    this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, rows.length - MAX_ROWS)));

    const tracked = r?.quests?.tracked || null;
    for (let i = 0; i < this.tabNodes.length; i++) {
      const on = i === this.tab;
      if (this.tabNodes[i]._on !== on) { this.tabNodes[i].classList.toggle('on', on); this.tabNodes[i]._on = on; }
    }
    this.tabsEl.style.opacity = easeOut(clamp((a - 0.1) / 0.5, 0, 1)).toFixed(3);

    const sig = `${this.tab}|${this.scroll}|${tracked}|${rows.map((q) => q.id + q.status + q.progress).join()}`;
    if (sig !== this._sig) { this._sig = sig; this._renderRows(rows, tracked); this._cur = null; }

    this.empty.style.display = rows.length ? 'none' : '';
    this.empty.textContent = ({
      active: 'Nothing in hand. Take a contract from a bounty board.',
      available: 'No new leads. Talk to the people of Lucis.',
      complete: 'Nothing finished yet.',
    })[TABS[this.tab].status];

    for (let i = 0; i < (this.rowNodes || []).length; i++) {
      const rn = this.rowNodes[i];
      const idx = i + this.scroll;
      const t = easeOut(clamp((a - 0.14 - i * 0.022) / 0.55, 0, 1));
      rn.node.style.opacity = t.toFixed(3);
      rn.node.style.transform = `translateX(${((1 - t) * -24).toFixed(2)}px)`;
      const on = idx === this.i;
      if (rn._on !== on) { rn.node.classList.toggle('on', on); rn._on = on; }
      rn.bg.style.opacity = on ? (0.6 + 0.2 * (0.5 + 0.5 * Math.sin(game.time.now * 2.6))).toFixed(3) : '0';
    }

    const q = rows[this.i];
    const key = q ? `${q.id}|${q.status}|${q.progress}|${tracked === q.id}` : 'none';
    if (this._cur !== key) {
      this._cur = key;
      this._age = 0;
      if (q) this._renderDetail(q, r);
    }
    this._age = (this._age || 0) + dt;
    const de = easeOut(clamp(this._age / 0.22, 0, 1)) * easeOut(clamp((a - 0.24) / 0.55, 0, 1)) * (q ? 1 : 0);
    this.detail.style.opacity = de.toFixed(3);
    this.detail.style.transform = `translateX(${((1 - de) * 16).toFixed(2)}px)`;
    this.dRule.style.height = `${(easeOutQuint(clamp((a - 0.2) / 0.7, 0, 1)) * 100).toFixed(0)}%`;

    // the log tally, top right where every other screen puts its headline number
    if (r?.quests) {
      const act = r.quests.active.length;
      const done = r.quests.completed.length;
      const avail = r.quests.available.length;
      this.tallyV.textContent = String(act);
      this.tallyD.textContent = `${avail} available  ·  ${done} finished  ·  chapter ${r.chapter}`;
    } else {
      this.tallyV.textContent = '0';
      this.tallyD.textContent = 'no quest log';
    }
    this.tally.style.opacity = easeOut(clamp((a - 0.16) / 0.55, 0, 1)).toFixed(3);

    this._msgAge += dt;
    this.msg.style.opacity = this._msg
      ? easeOut(clamp((2.6 - this._msgAge) / 0.7, 0, 1)).toFixed(3) : '0';
    if (this._msg) {
      this.msg.textContent = this._msg.text;
      this.msg.className = `shop-msg ${this._msg.ok ? 'ok' : 'bad'}`;
    }
  }
}

export default QuestScreen;
