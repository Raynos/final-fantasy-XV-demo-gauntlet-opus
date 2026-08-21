import { el, clear, clamp, commas, easeOut, easeOutQuint } from '../UIKit.ts';
import { icon, button } from '../Icons.ts';
import { ensureInteractCss } from '../../game/interaction/interact.css.ts';

/**
 * The bounty board on the wall of the Crow's Nest.
 *
 * Reads the real quest log: all twelve authored hunts with their star ranks,
 * their tipsters, the ledger each one is pinned in, their level, their reward
 * bundle and their objectives. Accepting one puts it in `rpg.quests` as an
 * active quest and points the compass at it.
 *
 * Hunter rank is FFXV's ladder — Apprentice, Trapper, Chaser, Ranger, Warrior —
 * earned in hunter points, which `QuestLog.complete` already awards per the
 * hunt's rank. Higher-rank bounties are visible from the start and locked until
 * you have earned the right to take them, because a board you can only half
 * read is what makes the other half worth working towards.
 *
 * Controls: ↑↓ pick, ←→ change ledger, Enter accept (or track, if already
 * taken). Everything animates from `game.time`; no CSS transitions.
 */

/** Hunter ranks, in points. FFXV's ladder, with our own thresholds. */
export const HUNTER_RANKS = [
  { at: 0, name: 'Unranked', reward: null },
  { at: 5, name: 'Apprentice', reward: 'Bronze Bangle' },
  { at: 15, name: 'Trapper', reward: 'Titanium Bangle' },
  { at: 30, name: 'Chaser', reward: 'Heliodor Bracelet' },
  { at: 50, name: 'Ranger', reward: 'Silver Bangle' },
  { at: 80, name: 'Warrior', reward: "Champion's Anklet" },
  { at: 120, name: 'Legend', reward: 'Ribbon' },
];

/** Hunter points needed before a bounty of this rank may be taken. */
const RANK_GATE = { 1: 0, 2: 5, 3: 15, 4: 30, 5: 50, 6: 75, 8: 110, 10: 150 };

/** Which ledger a hunt is pinned in. */
function ledgerOf(hunt, tipsters) {
  return tipsters?.[hunt.tipster]?.tome || 'Bounty Ledger';
}

export class HuntBoardScreen {
  constructor(menus: import('../Menus.ts').Menus) {
    ensureInteractCss();
    this.menus = menus;
    this.title = 'Bounty Board';
    this.sub = 'Hammerhead · Leide';
    this.tab = 0;
    this.i = 0;
    this._msg = null;
    this._msgAge = 9;
  }

  get rpg() { return this.game?.get?.('RpgSystem') || this.game?.get?.('Rpg') || null; }

  /** @param root @param game */
  build(root: HTMLElement, game: any) {
    this.game = game;
    this.cols = el('div.hunt-cols');

    const l = el('div.hunt-l');
    this.tabsEl = el('div.tabs');
    l.appendChild(this.tabsEl);
    this.list = el('div.hunt-list');
    l.appendChild(this.list);
    this.empty = el('div.shop-empty');
    this.empty.style.display = 'none';
    l.appendChild(this.empty);

    const r = el('div.hunt-r');
    this.card = el('div.hunt-card');
    this.cRule = el('div.rule.v');
    this.cK = el('div.hc-k');
    this.cN = el('div.hc-n');
    this.cStars = el('div.hc-stars');
    this.cD = el('div.t-body.hc-d');
    this.cGrid = el('div.hc-grid');
    this.cVals = [['Mark', ''], ['Level', ''], ['Tipster', ''], ['Reward', ''], ['Region', ''], ['Conditions', '']]
      .map(([k]) => {
        const v = el('div.v');
        this.cGrid.appendChild(el('div.hc-c', {}, [el('div.k', { text: k }), v]));
        return v;
      });
    this.cObj = el('div.hc-obj');
    this.cObjList = el('div');
    this.cObj.appendChild(el('div.k', { text: 'Objectives' }));
    this.cObj.appendChild(this.cObjList);
    this.cAct = el('div.hc-act');
    this.cActLb = el('div.lb');
    this.cAct.appendChild(button('Enter', { size: 24 }));
    this.cAct.appendChild(this.cActLb);
    this.cMark = el('div.hc-mark');
    this.cMark.appendChild(icon('quests', { size: 150, stroke: 0.34 }));

    this.card.appendChild(this.cRule);
    this.card.appendChild(this.cMark);
    this.card.appendChild(this.cK);
    this.card.appendChild(this.cN);
    this.card.appendChild(this.cStars);
    this.card.appendChild(this.cD);
    this.card.appendChild(this.cGrid);
    this.card.appendChild(this.cObj);
    this.card.appendChild(this.cAct);
    r.appendChild(this.card);

    this.cols.appendChild(l);
    this.cols.appendChild(r);
    root.appendChild(this.cols);

    this.rankBox = el('div.hunt-rank', {}, [
      el('div.k', { text: 'Hunter Rank' }),
      this.rankV = el('div.v'),
      this.rankP = el('div.p'),
      this.rankGauge = el('div.gauge.slim', {}, [this.rankFill = el('i.fill')]),
    ]);
    root.appendChild(this.rankBox);

    this.msg = el('div.shop-msg', { style: 'left:auto;right:0;bottom:-30px;text-align:right' });
    this.card.appendChild(this.msg);
  }

  enter() { this._msg = null; this._msgAge = 9; this._sig = null; }

  /* -------------------------------------------------------------- data */

  get hunterPoints() { return this.rpg?.quests?.hunterPoints ?? 0; }

  /** Current rank and the next rung. */
  rank() {
    const p = this.hunterPoints;
    let cur = HUNTER_RANKS[0], next = HUNTER_RANKS[1];
    for (let i = 0; i < HUNTER_RANKS.length; i++) {
      if (p >= HUNTER_RANKS[i].at) { cur = HUNTER_RANKS[i]; next = HUNTER_RANKS[i + 1] || null; }
    }
    return { cur, next, points: p };
  }

  /** Ledger tabs, derived from the hunts that exist. */
  ledgers() {
    const rpg = this.rpg;
    const hunts = rpg?.tables?.hunts || [];
    const tips = rpg?.tables?.tipsters;
    const seen = [];
    for (const h of hunts) {
      const t = ledgerOf(h, tips);
      if (!seen.includes(t)) seen.push(t);
    }
    return [...seen, 'Accepted'];
  }

  /** Rows for the current ledger. */
  rows() {
    const rpg = this.rpg;
    const hunts = rpg?.tables?.hunts || [];
    const log = rpg?.quests;
    if (!log) return [];
    const tips = rpg.tables?.tipsters;
    const tabs = this._tabs || this.ledgers();
    const tab = tabs[this.tab] || tabs[0];
    const pts = this.hunterPoints;

    const out = [];
    for (const h of hunts) {
      const status = log.status(h.id);
      if (tab === 'Accepted') { if (status !== 'active') continue; }
      else if (ledgerOf(h, tips) !== tab) continue;
      const gate = RANK_GATE[h.rank] ?? 0;
      const view = log.view(h.id) || { ...h, status };
      const blockedByRank = pts < gate;
      const blockedByChain = status === 'locked';
      out.push({
        h, view, status,
        gate,
        locked: blockedByRank || blockedByChain,
        why: blockedByRank
          ? `Requires ${gate} hunter points`
          : blockedByChain
            ? `Requires: ${(h.requires || []).map((r) => rpg.tables.quests?.[r]?.name || r).join(', ') || 'a prior contract'}`
            : '',
      });
    }
    out.sort((a, b) => (a.h.rank - b.h.rank) || (a.h.level - b.h.level));
    return out;
  }

  /* ------------------------------------------------------------ input */

  nav(dx, dy) {
    const rows = this._rows || [];
    if (dy && rows.length) this.i = (this.i + dy + rows.length) % rows.length;
    if (dx) {
      const n = (this._tabs || this.ledgers()).length;
      this.tab = (this.tab + dx + n) % n;
      this.i = 0;
    }
  }

  accept() {
    const row = (this._rows || [])[this.i];
    const rpg = this.rpg;
    if (!row || !rpg?.quests) return;
    if (row.status === 'active') {
      rpg.quests.track(row.h.id);
      this._say(`Tracking “${row.h.name}”.`, true);
      return;
    }
    if (row.status === 'complete') { this._say('Already claimed.', false); return; }
    if (row.locked) { this._say(row.why, false); return; }
    const res = rpg.quests.accept(row.h.id);
    if (res.ok) {
      rpg.quests.track(row.h.id);
      this._say(`Contract taken — “${row.h.name}”.`, true);
      const hud = this.game?.get?.('HUD');
      if (hud?.callOut) hud.callOut('HUNT ACCEPTED', row.h.name);
    } else {
      this._say(`Cannot take that one. (${res.reason})`, false);
    }
  }

  _say(text, ok) { this._msg = { text, ok }; this._msgAge = 0; }

  /* ----------------------------------------------------------- render */

  _renderRows(rows) {
    clear(this.list);
    this.rowNodes = [];
    for (const r of rows) {
      const bg = el('div.mr-bg');
      const stars = r.view.rank?.stars || '★'.repeat(Math.min(6, r.h.rank || 1));
      const flag = r.status === 'active' ? 'Taken' : r.status === 'complete' ? 'Claimed' : r.locked ? 'Locked' : '';
      const node = el('div.hrow', {}, [
        bg,
        el('div.hstars', { text: stars }),
        el('div.hn', { text: r.h.name }),
        flag ? el('div.hflag', { text: flag }) : null,
        el('div.hlv', { text: `Lv ${r.h.level}` }),
      ]);
      if (r.locked) node.classList.add('locked');
      if (r.status === 'active') node.classList.add('active');
      this.list.appendChild(node);
      this.list.appendChild(el('div.rule', { style: 'opacity:.34' }));
      this.rowNodes.push({ node, bg, r });
    }
  }

  /** @param dt @param game @param a */
  update(dt: number, game: any, a: number) {
    this.game = game;
    const rpg = this.rpg;
    const tabs = this._tabs = this.ledgers();
    if (this.tab >= tabs.length) this.tab = 0;
    const rows = this._rows = this.rows();
    if (this.i >= rows.length) this.i = Math.max(0, rows.length - 1);

    // tabs
    const tabSig = tabs.join('|');
    if (this._tabSig !== tabSig) {
      this._tabSig = tabSig;
      clear(this.tabsEl);
      this.tabNodes = tabs.map((t) => {
        const n = el('div.tab', { text: t });
        this.tabsEl.appendChild(n);
        return n;
      });
    }
    for (let i = 0; i < this.tabNodes.length; i++) {
      const on = i === this.tab;
      if (this.tabNodes[i]._on !== on) { this.tabNodes[i].classList.toggle('on', on); this.tabNodes[i]._on = on; }
    }
    this.tabsEl.style.opacity = easeOut(clamp((a - 0.1) / 0.5, 0, 1)).toFixed(3);

    const sig = `${this.tab}|${rows.map((r) => r.h.id + r.status + r.locked).join()}`;
    if (sig !== this._sig) { this._sig = sig; this._renderRows(rows); }

    this.empty.style.display = rows.length ? 'none' : '';
    this.empty.textContent = tabs[this.tab] === 'Accepted'
      ? 'You are not carrying any contracts.'
      : 'Nothing pinned in this ledger yet.';

    for (let i = 0; i < (this.rowNodes || []).length; i++) {
      const rn = this.rowNodes[i];
      const t = easeOut(clamp((a - 0.14 - i * 0.024) / 0.55, 0, 1));
      rn.node.style.opacity = t.toFixed(3);
      rn.node.style.transform = `translateX(${((1 - t) * -24).toFixed(2)}px)`;
      const on = i === this.i;
      if (rn._on !== on) { rn.node.classList.toggle('on', on); rn._on = on; }
      rn.bg.style.opacity = on ? (0.6 + 0.2 * (0.5 + 0.5 * Math.sin(game.time.now * 2.6))).toFixed(3) : '0';
    }

    // hunter rank readout
    const { cur, next, points } = this.rank();
    this.rankV.textContent = cur.name;
    this.rankP.textContent = next
      ? `${points} / ${next.at} pts  ·  next: ${next.name}`
      : `${points} pts  ·  top of the ladder`;
    const lo = cur.at, hi = next ? next.at : Math.max(cur.at, points);
    const frac = hi > lo ? clamp((points - lo) / (hi - lo), 0, 1) : 1;
    this.rankFill.style.width = `${(frac * easeOutQuint(clamp((a - 0.2) / 0.7, 0, 1)) * 100).toFixed(1)}%`;
    this.rankBox.style.opacity = easeOut(clamp((a - 0.16) / 0.55, 0, 1)).toFixed(3);

    // the card
    const row = rows[this.i];
    const key = row ? `${row.h.id}|${row.status}|${row.locked}` : 'none';
    if (this._cur !== key) {
      this._cur = key;
      this._age = 0;
      if (row) this._renderCard(row, rpg);
    }
    this._age = (this._age || 0) + dt;
    const de = easeOut(clamp(this._age / 0.22, 0, 1)) * easeOut(clamp((a - 0.24) / 0.55, 0, 1)) * (row ? 1 : 0);
    this.card.style.opacity = de.toFixed(3);
    this.card.style.transform = `translateX(${((1 - de) * 16).toFixed(2)}px)`;
    this.cRule.style.height = `${(easeOutQuint(clamp((a - 0.2) / 0.7, 0, 1)) * 100).toFixed(0)}%`;
    // the star row breathes very slightly, so a static capture still has life
    this.cStars.style.opacity = (0.86 + 0.14 * (0.5 + 0.5 * Math.sin(game.time.now * 1.7))).toFixed(3);

    this._msgAge += dt;
    if (this._msg) {
      this.msg.textContent = this._msg.text;
      this.msg.className = `shop-msg ${this._msg.ok ? 'ok' : 'bad'}`;
      this.msg.style.cssText = 'left:auto;right:0;bottom:-30px;text-align:right';
      this.msg.style.opacity = easeOut(clamp((2.8 - this._msgAge) / 0.7, 0, 1)).toFixed(3);
    } else {
      this.msg.style.opacity = '0';
    }
  }

  _renderCard(row, rpg) {
    const h = row.h;
    const v = row.view;
    const tips = rpg?.tables?.tipsters || {};
    const regions = { leide: 'Leide', duscae: 'Duscae', cleigne: 'Cleigne', insomnia: 'Insomnia' };
    this.cK.textContent = `${ledgerOf(h, tips)} · ${v.rank?.name || `Rank ${h.rank}`}`;
    this.cN.textContent = h.name;
    this.cStars.textContent = v.rank?.stars || '★'.repeat(Math.min(6, h.rank || 1));
    this.cD.textContent = h.summary || '';

    const rewards = rpg?.quests?.rewardsFor?.(h.id) || h.rewards || {};
    const itemNames = (rewards.items || [])
      .map((it) => `${rpg?.tables?.items?.[it.id]?.name || it.id}${it.count > 1 ? ` ×${it.count}` : ''}`)
      .join(', ');
    const cond = [];
    if (h.timeOfDay && h.timeOfDay !== 'any') cond.push(h.timeOfDay === 'night' ? 'After dark only' : 'Daylight only');
    if (h.daemon) cond.push('Daemon');
    if (row.locked) cond.push(row.why);

    this.cVals[0].textContent = h.target || '—';
    this.cVals[1].textContent = `Lv ${h.level}`;
    this.cVals[2].textContent = tips[h.tipster]
      ? `${tips[h.tipster].name} · ${tips[h.tipster].place}` : '—';
    this.cVals[3].textContent = `${commas(rewards.gil || 0)} gil${itemNames ? `, ${itemNames}` : ''}`;
    this.cVals[3].className = 'v gold';
    this.cVals[4].textContent = regions[h.region] || h.region || '—';
    this.cVals[5].textContent = cond.join(' · ') || 'None';

    clear(this.cObjList);
    for (const o of (v.objectives || h.objectives || [])) {
      const node = el('div.hc-ob', {}, [el('div.d'), el('div', { text: o.label || o.desc })]);
      if (o.done) node.classList.add('done');
      this.cObjList.appendChild(node);
    }

    if (row.status === 'active') { this.cActLb.textContent = 'Track this hunt'; this.cActLb.className = 'lb go'; }
    else if (row.status === 'complete') { this.cActLb.textContent = 'Contract claimed'; this.cActLb.className = 'lb no'; }
    else if (row.locked) { this.cActLb.textContent = row.why; this.cActLb.className = 'lb no'; }
    else { this.cActLb.textContent = 'Accept the contract'; this.cActLb.className = 'lb go'; }
  }
}

export default HuntBoardScreen;
