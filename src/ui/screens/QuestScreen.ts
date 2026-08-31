import { el, clear, clamp, commas, easeOut, easeOutQuint } from '../UIKit.ts';
import type { CachedNode } from '../UIKit.ts';
import { icon } from '../Icons.ts';
import { ensureInteractCss } from '../../game/interaction/interact.css.ts';
import { rpg } from '../GameData.ts';
import type { Menus } from '../Menus.ts';
import type { Game } from '../../game/Game.ts';
import type { QuestStatus, QuestView } from '../../game/rpg/Quests.ts';
import type { RpgSystem } from '../../game/rpg/RpgSystem.ts';

/** Tabs, and the quest-log status each one gathers. */
const TABS: Array<{ name: string, status: QuestStatus }> = [
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
  /** The screen root. Created and assigned by whoever registers the screen
   *  (`Menus.init`, or `Hammerhead._registerScreens` for the two town
   *  counters), never by this constructor. */
  node!: HTMLElement;
  /** The rows the last `_renderRows` drew, in tab order. */
  _rows!: QuestView[];
  _age!: number;
  _cur!: string | null;
  _msg!: { text: string, ok: boolean } | null;
  _msgAge!: number;
  _sig!: string | null;
  act!: HTMLElement;
  actLb!: HTMLElement;
  cols!: HTMLElement;
  dD!: HTMLElement;
  dI!: HTMLElement;
  dK!: HTMLElement;
  dN!: HTMLElement;
  dObj!: HTMLElement;
  dObjList!: HTMLElement;
  dRule!: HTMLElement;
  dSpecs!: HTMLElement;
  detail!: HTMLElement;
  empty!: HTMLElement;
  game!: Game;
  i!: number;
  list!: HTMLElement;
  menus!: Menus;
  msg!: HTMLElement;
  rowNodes!: Array<{ node: HTMLElement, bg: HTMLElement, q: QuestView, _on?: boolean }>;
  scroll!: number;
  specVals!: HTMLElement[];
  sub!: string;
  tab!: number;
  tabNodes!: CachedNode[];
  tabsEl!: HTMLElement;
  tally!: HTMLElement;
  tallyD!: HTMLElement;
  tallyV!: HTMLElement;
  title!: string;
  constructor(menus: import('../Menus.ts').Menus) {
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

  /** @param root @param game */
  build(root: HTMLElement, game: Game) {
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
      el('div.k', { text: 'Quests Active' }),
      this.tallyV = el('div.v'),
      this.tallyD = el('div.d'),
    ]);
    root.appendChild(this.tally);
  }

  enter(game: Game) {
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
      (rank[a.type as keyof typeof rank] ?? 9) - (rank[b.type as keyof typeof rank] ?? 9) || (a.level || 0) - (b.level || 0));
  }

  /* ------------------------------------------------------------ input */

  nav(dx: number, dy: number) {
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

  _say(text: string, ok: boolean) { this._msg = { text, ok }; this._msgAge = 0; }

  /* ----------------------------------------------------------- render */

  _renderRows(rows: QuestView[], tracked: string | null) {
    clear(this.list);
    this.rowNodes = [];
    const view = rows.slice(this.scroll, this.scroll + MAX_ROWS);
    for (const q of view) {
      const bg = el('div.mr-bg');
      /**
       * This badge and the HUD objective are two different counts wearing one
       * costume, and the playtest caught them in a single frame: the objective
       * strip said "Collect Rusted Bits from the wastes (2/3)" while this row,
       * for the same quest, said "0/2". Both were right. The HUD prints the
       * ITEM progress of the current objective (2 of 3 bits, `Quests.view`
       * bakes it into `o.label`); this printed OBJECTIVES COMPLETED over the
       * objective count (0 of 2 steps, because collecting 2 of 3 bits finishes
       * nothing). A player reads two bare `x/y` badges about one quest as the
       * game not knowing its own state.
       *
       * Naming the unit is the fix, not changing the number: a step counter
       * says "Step 1/2" and cannot be mistaken for a tally of bits.
       */
      const objs = q.objectives || [];
      const doneN = objs.filter((o) => o.done).length;
      const node = el('div.qrow', {}, [
        bg,
        icon(q.type === 'hunt' ? 'armiger' : 'quests', { size: 16, stroke: 1.15 }),
        el('div.qn', { text: q.name }),
        q.id === tracked ? el('div.qflag', { text: 'Tracking' }) : null,
        el('div.qp', {
          text: q.status === 'complete' || !objs.length ? 'Done'
            : `Step ${Math.min(doneN + 1, objs.length)}/${objs.length}`,
        }),
      ]);
      if (q.id === tracked) node.classList.add('tracked');
      this.list.appendChild(node);
      this.list.appendChild(el('div.rule', { style: 'opacity:.34' }));
      this.rowNodes.push({ node, bg, q });
    }
  }

  _renderDetail(q: QuestView, r: RpgSystem | null) {
    this.dK.textContent = `${TYPE_LABEL[q.type as keyof typeof TYPE_LABEL] || 'Quest'}${q.rank ? `  ·  ${q.rank.name}` : ''}`;
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
      .map((it: { id: string, count: number }) => `${r?.tables?.items?.[it.id]?.name || it.id}${it.count > 1 ? ` ×${it.count}` : ''}`)
      .join(', ');
    this.specVals[0].textContent = REGION[q.region as keyof typeof REGION] || q.region || '—';
    this.specVals[1].textContent = q.level ? `Lv ${q.level}` : '—';
    // "0 gil, Hi-Potion x2" was in the playtest's screenshot. Four quests in
    // the table are authored `gil: 0` on purpose -- `main_ch1_pauper`, whose
    // own summary is "repairs cost gil the prince does not have", is one of
    // them -- so the zero is true and printing it is still wrong: a reward
    // line lists what you get, and you do not get nothing. The item list
    // already had this guard; gil did not.
    const gilPart = rewards.gil ? `${commas(rewards.gil)} gil` : '';
    this.specVals[2].textContent = [gilPart, items].filter(Boolean).join(', ') || '—';
    this.specVals[3].textContent = q.status === 'complete' ? 'Complete'
      : q.status === 'active' ? 'In progress' : 'Not yet accepted';

    const tracked = r?.quests?.tracked === q.id;
    if (q.status === 'complete') { this.actLb.textContent = 'Reward already claimed'; this.actLb.className = 'lb no'; }
    else if (q.status === 'active') {
      this.actLb.textContent = tracked ? 'Enter — already tracking this' : 'Enter — track this quest';
      this.actLb.className = tracked ? 'lb no' : 'lb go';
    } else { this.actLb.textContent = 'Enter — accept this quest'; this.actLb.className = 'lb go'; }
  }

  /** @param dt @param game @param a */
  update(dt: number, game: Game, a: number) {
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

    /**
     * `q.progress` is the fraction of objectives DONE, so picking up the third
     * Rusted Bit moves `objectives[0].progress` and moves this signature by
     * nothing at all: the row list and the detail pane below both keep
     * rendering "(2/3)" after the bag says 3, while the HUD -- which has no
     * cache -- updates immediately. That is a second, real way for the log and
     * the objective strip to disagree, and it is invisible until you watch a
     * counter tick. Fold the objective counters into the key.
     */
    const objSig = (v: QuestView) => (v.objectives || []).map((o) => `${o.progress}${o.done ? '!' : ''}`).join('.');
    const sig = `${this.tab}|${this.scroll}|${tracked}|${rows.map((q) => q.id + q.status + q.progress + objSig(q)).join()}`;
    if (sig !== this._sig) { this._sig = sig; this._renderRows(rows, tracked); this._cur = null; }

    this.empty.style.display = rows.length ? 'none' : '';
    // Only the three tab statuses can appear here; `locked` and `failed` are
    // never a tab, so the record is deliberately partial.
    const EMPTY: Partial<Record<QuestStatus, string>> = {
      active: 'Nothing in hand. Take a contract from a bounty board.',
      available: 'No new leads. Talk to the people of Lucis.',
      complete: 'Nothing finished yet.',
    };
    this.empty.textContent = EMPTY[TABS[this.tab].status] ?? null;

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
    const key = q ? `${q.id}|${q.status}|${q.progress}|${objSig(q)}|${tracked === q.id}` : 'none';
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
      // "QUEST LOG 4 · 3 available · 2 finished · chapter 2" over a body listing
      // four ACTIVE quests reads as a total that ought to be nine. The number
      // was never wrong; it was unlabelled, sitting under the screen's own
      // name, beside three terms that all carry their unit. `k` names it now.
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
