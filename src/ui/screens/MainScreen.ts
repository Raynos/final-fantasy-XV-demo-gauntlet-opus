import { el, clamp, commas, easeOut, easeOutQuint } from '../UIKit.ts';
import type { CachedNode } from '../UIKit.ts';
import { icon, portrait } from '../Icons.ts';
import { Bar } from '../Bar.ts';
import { readParty, readQuest, hudState } from '../GameData.ts';
import type { PartyView } from '../GameData.ts';
import type { Menus, ScreenName } from '../Menus.ts';
import type { Game } from '../../game/Game.ts';

/**
 * Every row of the pause menu, and the screen it opens.
 *
 * `to` is not optional any more. A row that led nowhere used to look exactly
 * like a row that worked — same weight, same hover, same nothing when you
 * pressed Enter — which is how half this menu came to read as dead. Every row
 * now resolves to a real screen; anything that ever cannot (a screen a build
 * did not register) is drawn disabled with the reason printed, never live.
 */
interface MenuEntry {
  key: string;
  label: string;
  /** Icon key for `Icons.ts`. */
  icon: string;
  hint: string;
  /** The screen this row opens. Never optional -- see above. */
  to: ScreenName;
  /** The preview blurb, unless `_body` can report real state instead. */
  body: string;
}

const ENTRIES: MenuEntry[] = [
  { key: 'items', label: 'Items', icon: 'items', hint: 'Consumables & treasures', to: 'inventory',
    body: 'Potions, elixirs and the odd hunt trophy. Ignis keeps the inventory in order — mostly.' },
  { key: 'ascension', label: 'Ascension', icon: 'ascension', hint: 'Spend AP on the grid', to: 'ascension',
    body: 'Channel the accumulated Ability Points of the retinue into the Astral constellations. Unlocked nodes are permanent.' },
  { key: 'elemancy', label: 'Elemancy', icon: 'fire', hint: 'Craft spells from drawn energy', to: 'elemancy',
    body: 'Fire, ice and lightning drawn from the deposits of Lucis, mixed in the flask and carried as spells. A catalyst thrown in gives the spell a second job.' },
  { key: 'armiger', label: 'Armiger', icon: 'armiger', hint: 'The royal arms', to: 'armiger',
    body: 'Thirteen weapons of the Lucian kings orbit the heir. Fill the gauge in battle to call them all at once.' },
  { key: 'gear', label: 'Gear', icon: 'gear', hint: 'Weapons & accessories', to: 'gear',
    body: 'Equip up to four armaments and two accessories per member. Loadouts change what each ally does in the field.' },
  { key: 'map', label: 'Map', icon: 'map', hint: 'Survey Lucis', to: 'map',
    body: 'The road network of Leide, Duscae and Cleigne, with every haven, outpost and hunt the party has heard about.' },
  { key: 'quests', label: 'Quests', icon: 'quests', hint: 'Track objectives', to: 'quests',
    body: 'Every contract in hand, every lead not yet followed, and every objective still outstanding.' },
  { key: 'archives', label: 'Archives', icon: 'archives', hint: 'Datalog & bestiary', to: 'archives',
    body: 'Everything the retinue has learned about Eos: her people, her daemons, and the Crystal at the centre of it.' },
  { key: 'help', label: 'Controls', icon: 'camera', hint: 'Bindings, on foot and driving', to: 'controls',
    body: 'The whole control sheet — movement, camera, attack, dodge, warp, weapon swap, photo mode, and how to drive the Regalia.' },
  { key: 'system', label: 'System', icon: 'system', hint: 'Save, settings, title', to: 'system',
    body: 'Volume, graphics tier, camera inversion and look sensitivity — plus a save slot and the road back to the title screen.' },
];

/** The FFXV-style pause menu: a vertical list over a blurred game frame. */
export class MainScreen {
  /** The screen root. Created and assigned by whoever registers the screen
   *  (`Menus.init`, or `Hammerhead._registerScreens` for the two town
   *  counters), never by this constructor. */
  node!: HTMLElement;
  _cur!: string;
  _pvAge!: number;
  _q!: string;
  _qs!: string;
  cards!: Array<{ card: HTMLElement, bar: Bar, hp: HTMLElement, p: PartyView, _t?: string }>;
  i!: number;
  list!: HTMLElement;
  mark!: HTMLElement;
  menus!: Menus;
  partyWrap!: HTMLElement;
  preview!: HTMLElement;
  pvB!: HTMLElement;
  pvR!: HTMLElement;
  pvT!: HTMLElement;
  rows!: Array<{ e: MenuEntry, row: HTMLElement, bg: HTMLElement, bar: HTMLElement, _on?: boolean, _live?: boolean }>;
  statNodes!: CachedNode[];
  stats!: HTMLElement;
  sub!: string;
  title!: string;
  track!: HTMLElement;
  trackQ!: HTMLElement;
  trackS!: HTMLElement;
  constructor(menus: import('../Menus.ts').Menus) {
    this.menus = menus;
    this.title = 'Main Menu';
    this.sub = 'Lucis  ·  Leide  ·  Longwythe Region';
    this.i = 0;
  }

  build(root: HTMLElement, game: Game) {
    this.list = el('div.mlist');
    this.rows = ENTRIES.map((e2) => {
      const bg = el('div.mr-bg');
      const bar = el('div.mr-bar');
      const row = el('div.mrow', {}, [
        bg, bar,
        icon(e2.icon, { size: 18, stroke: 1.15 }),
        el('div', {}, [el('div.mr-t', { text: e2.label }), el('div.mr-d', { text: e2.hint })]),
        el('div.mr-x', { text: 'Unavailable' }),
      ]);
      this.list.appendChild(row);
      return { row, e: e2, bg, bar };
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

  _buildCards(party: PartyView[]) {
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

  nav(dx: number, dy: number) {
    if (dy) this.i = (this.i + dy + ENTRIES.length) % ENTRIES.length;
  }

  /**
   * The preview blurb. Three of the eight entries can report real state, so
   * they do rather than repeating an authored count that would drift.
   */
  _body(entry: MenuEntry, game: Game): string {
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

  /** True when the menu stack actually carries the screen this row points at. */
  _live(e2: MenuEntry) { return !!(e2.to && this.menus.screens && this.menus.screens[e2.to]); }

  accept() {
    const e2 = ENTRIES[this.i];
    if (this._live(e2)) this.menus.push(e2.to);
  }

  /** @param dt @param game @param a 0..1 */
  update(dt: number, game: Game, a: number) {
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
      // A row whose screen is missing is drawn dead rather than merely inert:
      // dimmed and marked, with the reason printed in the preview. Nothing in
      // this list is allowed to look pressable and then do nothing.
      const live = this._live(r.e);
      if (r._live !== live) { r.row.classList.toggle('disabled', !live); r._live = live; }
      const glow = on ? 0.5 + 0.5 * Math.sin(game.time.now * 2.6) : 0;
      r.bg.style.opacity = on && live ? (0.62 + 0.22 * glow).toFixed(3) : '0';
      r.bar.style.opacity = on && live ? '1' : '0';
    }

    const cur = ENTRIES[this.i];
    if (this._cur !== cur.key) {
      this.pvT.textContent = cur.label;
      this.pvB.textContent = this._live(cur)
        ? this._body(cur, game)
        : `${cur.body}  ·  Unavailable in this build: no “${cur.to}” screen is registered.`;
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
      // `hudState` is non-null only when Rpg is registered, but the registry
      // cannot say so; read it once and fall back to zero.
      const rpgSys = game.get('Rpg');
      const secs = Math.max(0, Math.floor(rpgSys ? rpgSys.playTime : 0));
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
