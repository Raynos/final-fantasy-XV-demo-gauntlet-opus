import { el, clamp, commas, easeOut, easeOutQuint } from '../UIKit.js';
import { icon, portrait } from '../Icons.js';
import { Bar } from '../Bar.js';
import { readParty, readQuest, hudState } from '../GameData.js';

const ENTRIES = [
  { key: 'items', label: 'Items', icon: 'items', hint: 'Consumables & treasures', to: 'inventory',
    body: 'Potions, elixirs and the odd hunt trophy. Ignis keeps the inventory in order — mostly.' },
  { key: 'ascension', label: 'Ascension', icon: 'ascension', hint: 'Spend AP on the grid', to: 'ascension',
    body: 'Channel the accumulated Ability Points of the retinue into the Astral constellations. Unlocked nodes are permanent.' },
  { key: 'armiger', label: 'Armiger', icon: 'armiger', hint: 'The royal arms', to: null,
    body: 'Thirteen weapons of the Lucian kings orbit the heir. Fill the gauge in battle to call them all at once.' },
  { key: 'gear', label: 'Gear', icon: 'gear', hint: 'Weapons & accessories', to: 'gear',
    body: 'Equip up to four armaments and two accessories per member. Loadouts change what each ally does in the field.' },
  { key: 'map', label: 'Map', icon: 'map', hint: 'Survey Lucis', to: 'map',
    body: 'The road network of Leide, Duscae and Cleigne, with every haven, outpost and hunt the party has heard about.' },
  { key: 'quests', label: 'Quests', icon: 'quests', hint: 'Track objectives', to: null,
    body: 'One main quest, eleven side quests, four hunts outstanding. Cid is still waiting on that rare metal.' },
  { key: 'archives', label: 'Archives', icon: 'archives', hint: 'Datalog & bestiary', to: null,
    body: 'Everything the retinue has learned about Eos: her people, her daemons, and the Crystal at the centre of it.' },
  { key: 'system', label: 'System', icon: 'system', hint: 'Save, load, settings', to: null,
    body: 'Save the journey, adjust the camera, or turn the difficulty down and admit nothing to Gladio.' },
];

/** The FFXV-style pause menu: a vertical list over a blurred game frame. */
export class MainScreen {
  /** @param {import('../Menus.js').Menus} menus */
  constructor(menus) {
    this.menus = menus;
    this.title = 'Main Menu';
    this.sub = 'Lucis  ·  Leide  ·  Longwythe Region';
    this.i = 0;
  }

  /** @param {HTMLElement} root */
  build(root, game) {
    this.list = el('div.mlist');
    this.rows = ENTRIES.map((e2) => {
      const row = el('div.mrow', {}, [
        el('div.mr-bg'), el('div.mr-bar'),
        icon(e2.icon, { size: 18, stroke: 1.15 }),
        el('div', {}, [el('div.mr-t', { text: e2.label }), el('div.mr-d', { text: e2.hint })]),
      ]);
      this.list.appendChild(row);
      return { row, e: e2, bg: row.firstChild, bar: row.childNodes[1] };
    });
    root.appendChild(this.list);

    this.preview = el('div.mpreview');
    this.pvT = el('div.mpv-t');
    this.pvR = el('div.rule');
    this.pvB = el('div.t-body.mpv-b');
    this.preview.appendChild(this.pvT);
    this.preview.appendChild(this.pvR);
    this.preview.appendChild(this.pvB);

    this.stats = el('div.mpv-stats');
    this.statNodes = [['Gil', '—'], ['Play Time', '—'], ['Party Level', '—'], ['AP', '—']].map(([k, v]) => {
      const vn = el('div.v', { text: v });
      this.stats.appendChild(el('div.mpv-stat', {}, [el('div.k', { text: k }), vn]));
      return vn;
    });
    this.preview.appendChild(this.stats);

    this.trackQ = el('div.q', { text: '—' });
    this.trackS = el('div.s', { text: '' });
    this.track = el('div.mpv-track', {}, [
      el('div.rule', { style: 'margin-bottom:16px' }),
      el('div.k', { text: 'Tracking' }),
      this.trackQ, this.trackS,
    ]);
    this.preview.appendChild(this.track);

    this.mark = el('div.mpv-mark');
    this.preview.appendChild(this.mark);
    root.appendChild(this.preview);

    this.partyWrap = el('div.mparty');
    root.appendChild(this.partyWrap);
    this.cards = [];
  }

  _buildCards(party) {
    for (const p of party) {
      const bar = new Bar({ cls: 'slim' });
      const hp = el('div.lv');
      const card = el('div.mp-card', {}, [
        el('div.pfw', {}, [portrait(p.hue, 0.55)]),
        el('div.nm', { text: p.name }),
        hp, bar.node,
      ]);
      this.partyWrap.appendChild(card);
      this.cards.push({ card, bar, hp, p });
    }
  }

  nav(dx, dy) {
    if (dy) this.i = (this.i + dy + ENTRIES.length) % ENTRIES.length;
  }

  /**
   * The preview blurb. Three of the eight entries can report real state, so
   * they do rather than repeating an authored count that would drift.
   * @param {object} entry
   * @param {object} game
   */
  _body(entry, game) {
    const r = game?.get?.('Rpg');
    if (!r) return entry.body;
    if (entry.key === 'quests') {
      const q = r.quests;
      const hunts = q.active.filter((x) => x.type === 'hunt').length;
      return `${q.active.length} active, ${q.available.length} available, ${q.completed.length} finished — `
        + `${hunts} of them bount${hunts === 1 ? 'y' : 'ies'}. Chapter ${r.chapter}.`;
    }
    if (entry.key === 'ascension') {
      const a = r.ascension;
      return `${a.unlocked.size} of ${a.allNodes.length} nodes unlocked across nine constellations, `
        + `${a.ap} AP unspent. ${entry.body}`;
    }
    if (entry.key === 'items') {
      const list = r.inventory.list();
      return `${list.length} kinds of thing in the bag and ${commas(r.inventory.gil)} gil. ${entry.body}`;
    }
    return entry.body;
  }

  accept() {
    const to = ENTRIES[this.i].to;
    if (to) this.menus.push(to);
  }

  /** @param {number} dt @param {object} game @param {number} a 0..1 */
  update(dt, game, a) {
    const party = readParty(game);
    if (!this.cards.length) this._buildCards(party);

    const e = easeOutQuint(a);
    for (let i = 0; i < this.rows.length; i++) {
      const r = this.rows[i];
      const t = easeOut(clamp((a - 0.12 - i * 0.032) / 0.6, 0, 1));
      r.row.style.opacity = t.toFixed(3);
      r.row.style.transform = `translateX(${((1 - t) * -34).toFixed(2)}px)`;
      const on = i === this.i;
      if (r._on !== on) { r.row.classList.toggle('on', on); r._on = on; }
      const glow = on ? 0.5 + 0.5 * Math.sin(game.time.now * 2.6) : 0;
      r.bg.style.opacity = on ? (0.62 + 0.22 * glow).toFixed(3) : '0';
      r.bar.style.opacity = on ? '1' : '0';
    }

    const cur = ENTRIES[this.i];
    if (this._cur !== cur.key) {
      this.pvT.textContent = cur.label;
      this.pvB.textContent = this._body(cur, game);
      this.mark.textContent = '';
      this.mark.appendChild(icon(cur.icon, { size: 210, stroke: 0.34 }));
      this._cur = cur.key;
      this._pvAge = 0;
    }
    this._pvAge = (this._pvAge || 0) + dt;
    const pv = easeOut(clamp(this._pvAge / 0.26, 0, 1)) * easeOut(clamp((a - 0.2) / 0.6, 0, 1));
    this.preview.style.opacity = pv.toFixed(3);
    this.preview.style.transform = `translateY(${((1 - pv) * 12).toFixed(2)}px)`;
    this.pvR.style.width = `${(easeOutQuint(clamp((a - 0.28) / 0.7, 0, 1)) * 100).toFixed(0)}%`;

    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i];
      const p = party[i] || c.p;
      const t = easeOut(clamp((a - 0.24 - i * 0.05) / 0.62, 0, 1));
      c.card.style.opacity = t.toFixed(3);
      c.card.style.transform = `translateY(${((1 - t) * 26).toFixed(2)}px)`;
      c.bar.set(clamp((p.hp ?? 1) / (p.maxHp || 1), 0, 1), dt);
      const txt = `LV ${p.level}    ${commas(p.hp)} / ${commas(p.maxHp)}`;
      if (c._t !== txt) { c.hp.textContent = txt; c._t = txt; }
    }
    // the save summary, straight off the model
    const hs = hudState(game);
    if (hs) {
      const avg = Math.round(party.reduce((s2, p) => s2 + p.level, 0) / Math.max(1, party.length));
      const secs = Math.max(0, Math.floor(game.get('Rpg').playTime));
      const play = `${String(Math.floor(secs / 3600)).padStart(2, '0')}:${String(Math.floor(secs / 60) % 60).padStart(2, '0')}`;
      const vals = [commas(hs.gil), play, String(avg), commas(hs.ap)];
      for (let i = 0; i < this.statNodes.length; i++) {
        if (this.statNodes[i]._v !== vals[i]) { this.statNodes[i].textContent = vals[i]; this.statNodes[i]._v = vals[i]; }
      }
      // the region subtitle follows the tracked quest's region
      const q = readQuest(game);
      const qs = q.live && q.waypoint ? `${q.step}  ·  ${commas(q.dist)} m` : q.step;
      if (this._q !== q.title) { this.trackQ.textContent = q.title; this._q = q.title; }
      if (this._qs !== qs) { this.trackS.textContent = qs; this._qs = qs; }
    }
    this.stats.style.opacity = easeOut(clamp((a - 0.4) / 0.5, 0, 1)).toFixed(3);
    void e;
  }
}
