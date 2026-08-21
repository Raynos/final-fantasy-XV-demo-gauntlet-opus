import { el, clear, clamp, commas, easeOut, easeOutQuint } from '../UIKit.ts';
import { icon } from '../Icons.ts';
import { ensureInteractCss } from '../../game/interaction/interact.css.ts';
import { TYPES, entry as bestiaryEntry } from '../../characters/enemies/Bestiary.ts';
import { attachKillLog, killsOf, totalKills, speciesRecorded } from '../KillLog.ts';
import { rpg } from '../GameData.ts';

const FACTION = { beast: 'Beast', daemon: 'Daemon', imperial: 'Imperial', astral: 'Astral' };
const FACTION_TABS = [
  { name: 'All', f: null },
  { name: 'Beasts', f: 'beast' },
  { name: 'Daemons', f: 'daemon' },
  { name: 'Imperials', f: 'imperial' },
  { name: 'Datalog', f: 'datalog' },
];

const ELEMENT_ICON = { fire: 'fire', ice: 'ice', lightning: 'lightning', dark: 'poison', light: 'haste' };
const MAX_ROWS = 16;

/**
 * Archives — the bestiary and the datalog.
 *
 * The species list is the real spawn registry (`characters/enemies/Bestiary.js`)
 * and the kill counts are the real ones: `KillLog` counts `combat:death`, so an
 * entry only opens up once the party has actually killed one of the things. An
 * unrecorded species is drawn locked, with its silhouette and nothing else,
 * because a bestiary you can only half read is what makes filling it in worth
 * doing.
 *
 * The Datalog tab is the same idea applied to the journey: chapter, quests,
 * havens discovered, distance driven — every figure read live off `rpg`.
 *
 * Controls: ↑↓ pick, ←→ change section. No CSS transitions.
 */
export class ArchiveScreen {
  /** @param {import('../Menus.ts').Menus} menus */
  constructor(menus) {
    ensureInteractCss();
    this.menus = menus;
    this.title = 'Archives';
    this.sub = 'Datalog & bestiary';
    this.tab = 0;
    this.i = 0;
    this.scroll = 0;
  }

  get rpg() { return rpg(this.game); }
  get datalog() { return FACTION_TABS[this.tab].f === 'datalog'; }

  /** @param {HTMLElement} root @param {object} game */
  build(root, game) {
    this.game = game;
    attachKillLog();

    this.cols = el('div.cols');
    const l = el('div.col-l');
    this.tabsEl = el('div.tabs');
    this.tabNodes = FACTION_TABS.map((t) => {
      const n = el('div.tab', { text: t.name });
      this.tabsEl.appendChild(n);
      return n;
    });
    l.appendChild(this.tabsEl);
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

    this.dWeak = el('div.arc-weak');
    this.detail.appendChild(this.dWeak);

    this.dSpecs = el('div.dt-specs');
    this.specVals = [['Level', ''], ['Vitality', ''], ['Weak to', ''], ['Felled', '']].map(([k]) => {
      const v = el('div.v');
      this.dSpecs.appendChild(el('div.dt-spec', {}, [el('div.k', { text: k }), v]));
      return v;
    });
    this.detail.appendChild(el('div.rule', { style: 'margin-top:24px;max-width:420px' }));
    this.detail.appendChild(this.dSpecs);
    this.dDrops = el('div.arc-drops');
    this.detail.appendChild(this.dDrops);
    r.appendChild(this.detail);

    this.cols.appendChild(l);
    this.cols.appendChild(r);
    root.appendChild(this.cols);

    this.tally = el('div.q-tally', {}, [
      el('div.k', { text: 'Recorded' }),
      this.tallyV = el('div.v'),
      this.tallyD = el('div.d'),
    ]);
    root.appendChild(this.tally);
  }

  enter(game) { if (game) this.game = game; this._sig = null; }

  /* -------------------------------------------------------------- data */

  /** Rows for the current section. */
  rows() {
    if (this.datalog) return this._datalogRows();
    const f = FACTION_TABS[this.tab].f;
    const out = [];
    for (const key of Object.keys(TYPES)) {
      const e = bestiaryEntry(key);
      if (!e) continue;
      if (f && (e.faction || 'beast') !== f) continue;
      const kills = killsOf(key);
      out.push({ kind: 'beast', key, e, kills, known: kills > 0 });
    }
    out.sort((a, b) => (b.kills - a.kills) || (a.e.level || 0) - (b.e.level || 0) || a.e.name.localeCompare(b.e.name));
    return out;
  }

  /** The journey, in numbers that are all real. */
  _datalogRows() {
    const r = this.rpg;
    const out = [];
    const add = (name, value, desc) => out.push({ kind: 'log', key: name, name, value, desc });
    if (!r) {
      add('Journey', '—', 'No save is loaded.');
      return out;
    }
    const secs = Math.max(0, Math.floor(r.playTime || 0));
    const havens = (r.day.havens() || []);
    add('Chapter', String(r.chapter), 'How far along the road the story has come.');
    add('Play Time', `${String(Math.floor(secs / 3600)).padStart(2, '0')}:${String(Math.floor(secs / 60) % 60).padStart(2, '0')}`,
      'Time spent on the road, camp fires and all.');
    add('Quests Finished', String(r.quests.completed.length),
      `${r.quests.active.length} in hand, ${r.quests.available.length} waiting to be taken.`);
    add('Hunter Points', String(r.quests.hunterPoints || 0), 'Earned bounty by bounty at the boards of Lucis.');
    add('Havens Found', `${havens.filter((h) => h.discovered).length} / ${havens.length}`,
      'Runic outcrops where daemons will not follow. Rest at one to bank the day\'s EXP.');
    add('Ascension', `${r.ascension.unlocked.size} / ${r.ascension.allNodes.length}`,
      `${commas(r.ascension.ap)} AP unspent across nine constellations.`);
    add('Gil', commas(r.inventory.gil), 'Everything the retinue has to its name.');
    add('Bestiary', `${speciesRecorded()} / ${Object.keys(TYPES).length}`,
      `${commas(totalKills())} kills recorded in total.`);
    add('Time of Day', r.day.clockString || '—', `Day ${r.day.day}. Daemons rise after dark.`);
    return out;
  }

  /* ------------------------------------------------------------ input */

  nav(dx, dy) {
    const rows = this._rows || [];
    if (dy && rows.length) this.i = (this.i + dy + rows.length) % rows.length;
    if (dx) { this.tab = (this.tab + dx + FACTION_TABS.length) % FACTION_TABS.length; this.i = 0; this.scroll = 0; }
  }

  /** Nothing to confirm here — the archive is a reference, not a shop. */
  accept() {}

  /* ----------------------------------------------------------- render */

  _renderRows(rows) {
    clear(this.list);
    this.rowNodes = [];
    for (const row of rows.slice(this.scroll, this.scroll + MAX_ROWS)) {
      const bg = el('div.mr-bg');
      const node = row.kind === 'log'
        ? el('div.qrow', {}, [bg, icon('archives', { size: 16, stroke: 1.15 }),
          el('div.qn', { text: row.name }), el('div.qp', { text: row.value })])
        : el('div.qrow', {}, [
          bg,
          icon(row.known ? 'armiger' : 'archives', { size: 16, stroke: 1.15 }),
          el('div.qn', { text: row.known ? row.e.name : '— Unrecorded —' }),
          el('div.qp', { text: row.known ? `×${row.kills}` : '' }),
        ]);
      if (row.kind === 'beast' && !row.known) node.classList.add('locked');
      this.list.appendChild(node);
      this.list.appendChild(el('div.rule', { style: 'opacity:.34' }));
      this.rowNodes.push({ node, bg, row });
    }
  }

  _renderDetail(row) {
    clear(this.dWeak);
    clear(this.dDrops);
    if (row.kind === 'log') {
      this.dK.textContent = 'Datalog';
      this.dN.textContent = row.name;
      this.dD.textContent = row.desc;
      clear(this.dI);
      this.dI.appendChild(icon('archives', { size: 104, stroke: 0.46 }));
      this.specVals[0].textContent = row.value;
      this.specVals[1].textContent = '—';
      this.specVals[2].textContent = '—';
      this.specVals[3].textContent = '—';
      this.dSpecs.style.display = 'none';
      return;
    }
    this.dSpecs.style.display = '';
    const e = row.e;
    this.dK.textContent = `${FACTION[e.faction] || 'Beast'}${e.expClass === 'boss' ? '  ·  Mark' : ''}`;
    this.dN.textContent = row.known ? e.name : 'Unrecorded';
    this.dD.textContent = row.known
      ? `Felled ${row.kills === 1 ? 'once' : `${commas(row.kills)} times`} by the retinue. `
        + `${e.weakToWeapons.length ? `Flinches from ${e.weakToWeapons.join(', ')}.` : 'No armament it particularly fears.'}`
      : 'Nothing recorded. Kill one and this page writes itself.';
    clear(this.dI);
    this.dI.appendChild(icon(row.known ? 'armiger' : 'archives', { size: 104, stroke: 0.46 }));

    this.specVals[0].textContent = row.known ? `Lv ${e.level}` : '—';
    this.specVals[1].textContent = row.known ? commas(e.hp) : '—';
    this.specVals[2].textContent = row.known ? (e.weak.length ? e.weak.join(', ') : 'nothing') : '—';
    this.specVals[3].textContent = row.known ? `×${commas(row.kills)}` : '—';

    if (row.known) {
      for (const el2 of e.weak) {
        this.dWeak.appendChild(el('div.aw', {}, [icon(ELEMENT_ICON[el2] || 'fire', { size: 14, stroke: 1.2 }), el('span', { text: el2 })]));
      }
      for (const el2 of e.strong) {
        const n = el('div.aw.res', {}, [icon(ELEMENT_ICON[el2] || 'shield', { size: 14, stroke: 1.2 }), el('span', { text: el2 })]);
        this.dWeak.appendChild(n);
      }
      if (e.drops.length) {
        this.dDrops.appendChild(el('div.k', { text: 'Spoils' }));
        for (const d of e.drops.slice(0, 4)) {
          const nm = this.rpg?.tables?.items?.[d.id]?.name || d.id.replace(/_/g, ' ');
          this.dDrops.appendChild(el('div.ad', {}, [
            el('div.n', { text: nm }),
            el('div.p', { text: `${Math.round((d.chance ?? 0.3) * 100)}%` }),
          ]));
        }
      }
    }
  }

  /** @param {number} dt @param {object} game @param {number} a */
  update(dt, game, a) {
    this.game = game;
    const rows = this._rows = this.rows();
    if (this.i >= rows.length) this.i = Math.max(0, rows.length - 1);
    if (this.i < this.scroll) this.scroll = this.i;
    if (this.i >= this.scroll + MAX_ROWS) this.scroll = this.i - MAX_ROWS + 1;
    this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, rows.length - MAX_ROWS)));

    for (let i = 0; i < this.tabNodes.length; i++) {
      const on = i === this.tab;
      if (this.tabNodes[i]._on !== on) { this.tabNodes[i].classList.toggle('on', on); this.tabNodes[i]._on = on; }
    }
    this.tabsEl.style.opacity = easeOut(clamp((a - 0.1) / 0.5, 0, 1)).toFixed(3);

    const sig = `${this.tab}|${this.scroll}|${rows.map((r) => `${r.key}${r.kills ?? r.value}`).join()}`;
    if (sig !== this._sig) { this._sig = sig; this._renderRows(rows); this._cur = null; }

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

    const row = rows[this.i];
    const key = row ? `${row.key}|${row.kills ?? row.value}` : 'none';
    if (this._cur !== key) { this._cur = key; this._age = 0; if (row) this._renderDetail(row); }
    this._age = (this._age || 0) + dt;
    const de = easeOut(clamp(this._age / 0.22, 0, 1)) * easeOut(clamp((a - 0.24) / 0.55, 0, 1)) * (row ? 1 : 0);
    this.detail.style.opacity = de.toFixed(3);
    this.detail.style.transform = `translateX(${((1 - de) * 16).toFixed(2)}px)`;
    this.dRule.style.height = `${(easeOutQuint(clamp((a - 0.2) / 0.7, 0, 1)) * 100).toFixed(0)}%`;

    const total = Object.keys(TYPES).length;
    this.tallyV.textContent = `${speciesRecorded()} / ${total}`;
    this.tallyD.textContent = `${commas(totalKills())} felled`;
    this.tally.style.opacity = easeOut(clamp((a - 0.16) / 0.55, 0, 1)).toFixed(3);
  }
}

export default ArchiveScreen;
