import { el, clear, clamp, commas, easeOut } from '../UIKit.ts';
import { icon, portrait } from '../Icons.ts';
import { ensureInteractCss } from '../../game/interaction/interact.css.ts';
import { Bar } from '../Bar.ts';
import { readGear, readParty, rpg } from '../GameData.ts';
import type { Menus } from '../Menus.ts';

const SLOT_ICON = { Weapon: 'sword', Accessory: 'ap' };

/** Which weapon classes each member is allowed to carry. Mirrors Inventory. */
const CLASS_OK = {
  noctis: ['sword', 'greatsword', 'polearm', 'dagger', 'firearm', 'shield'],
  gladio: ['greatsword', 'shield'],
  ignis: ['dagger', 'polearm'],
  prompto: ['firearm', 'machinery'],
};

/**
 * Gear: one card per party member with their real equipment slots.
 *
 * Slot counts come from `Inventory.SLOT_LAYOUT` (Noctis carries four armaments,
 * everyone else two, all four have three accessory slots), the contents from
 * `Inventory.equipped()`, the attributes from the member's `Stats` block with
 * gear, buffs and Ascension folded in, and the technique list from `PartyState`.
 */
export class GearScreen {
  _key!: any;
  _msg!: any;
  _msgAge!: number;
  cards!: any[];
  game!: any;
  grid!: HTMLElement;
  i!: number;
  j!: number;
  menus!: Menus;
  msg!: HTMLElement;
  pick!: HTMLElement;
  pickH!: HTMLElement;
  pickList!: HTMLElement;
  picker!: any;
  sub!: string;
  title!: string;
  constructor(menus: import('../Menus.ts').Menus) {
    ensureInteractCss();
    this.menus = menus;
    this.title = 'Gear';
    this.sub = 'Four armaments, two accessories, one very tired advisor';
    this.i = 0;
    this.j = 0;
    /** The equip picker, or null when the grid has focus. */
    this.picker = null;
    this._msg = null;
    this._msgAge = 9;
  }

  build(root: HTMLElement, game: any) {
    this.game = game;
    this.grid = el('div.gear-grid');
    root.appendChild(this.grid);
    this.cards = [];

    // The equip picker. It lives here rather than in a second screen because
    // choosing a sword is a modal step inside Gear, not a place you navigate
    // to — and Backspace/B out of it returns to the slot you were on.
    this.pick = el('div.equip-pick.plate');
    this.pickH = el('div.ep-h');
    this.pickList = el('div.ep-list');
    this.pick.appendChild(this.pickH);
    this.pick.appendChild(el('div.rule', { style: 'margin:10px 0 4px' }));
    this.pick.appendChild(this.pickList);
    this.pick.style.display = 'none';
    root.appendChild(this.pick);

    this.msg = el('div.gear-msg');
    root.appendChild(this.msg);
  }

  _build(game: any, party: any) {
    const r = rpg(game);
    party.forEach((p: any) => {
      const list = readGear(game, p.id);
      const bar = new Bar({ cls: 'slim' });
      const hpVal = el('div.gv');
      const slots = list.map((s: any) => {
        const n = el('div.gslot', {}, [
          el('div.gs-k', {}, [icon(SLOT_ICON[s.slot as keyof typeof SLOT_ICON] || 'sword', { size: 11, stroke: 1.3 }), el('span', { text: ` ${s.slot}` })]),
          el('div.gs-n', { text: s.name }),
          el('div.gs-s', { text: s.stat }),
        ]);
        return { n, s, nm: n.childNodes[1], st: n.childNodes[2] };
      });

      const statNodes = ['Str', 'Vit', 'Mag', 'Spr'].map((k) => {
        const v = el('span.v', { text: '0' });
        return { node: el('div.gstat', {}, [el('span.k', { text: k }), v]), v };
      });

      const techs = r ? r.party.techniquesFor(p.id).slice(0, 3) : [];
      const card = el('div.gcard.plate', {}, [
        el('div.gc-h', {}, [
          el('div.pfw', {}, [portrait(p.hue, 0.55)]),
          el('div', {}, [el('div.gc-nm', { text: p.name }), el('div.gc-lv', { text: `Level ${p.level}` })]),
        ]),
        el('div.rule', { style: 'margin-top:16px' }),
        el('div.gc-hp', {}, [el('span.k', { text: 'HP' }), bar.node, hpVal]),
        el('div.gc-slots', {}, slots.map((s: any) => s.n)),
        el('div.rule', { style: 'margin-top:26px' }),
        el('div.gc-abil', {}, [
          el('div.k', { text: 'Techniques' }),
          ...(techs.length ? techs : [{ name: '—', bars: 0 }]).map((t: any) => el('div.ab', {}, [
            icon('ascension', { size: 11, stroke: 1.3 }),
            el('span', { text: t.bars ? `${t.name}   ·   ${t.bars} bar${t.bars === 1 ? '' : 's'}` : t.name }),
          ])),
        ]),
        el('div.rule', { style: 'margin-top:auto' }),
        el('div.gc-stats', {}, statNodes.map((s) => s.node)),
      ]);
      this.grid.appendChild(card);
      this.cards.push({ card, bar, hpVal, slots, statNodes, p, lvEl: card.firstChild!.lastChild!.lastChild });
    });
  }

  nav(dx: any, dy: any) {
    if (this.picker) {
      const n = this.picker.rows.length || 1;
      if (dy) this.picker.i = (this.picker.i + dy + n) % n;
      return;
    }
    if (dx) this.i = clamp(this.i + dx, 0, Math.max(0, this.cards.length - 1));
    const n = this.cards[this.i]?.slots.length || 1;
    if (dy) this.j = (this.j + dy + n) % n;
  }

  /**
   * Open the picker for the highlighted slot, or equip the highlighted item.
   *
   * Everything goes through `Inventory.equip`, so a swap really does move the
   * old armament back into the bag, really does re-derive every stat block,
   * and really does change what the party fights with.
   */
  accept() {
    if (this.picker) { this._equipChosen(); return; }
    const r = rpg(this.game);
    const card = this.cards[this.i];
    if (!r || !card) return;
    const layout = readGear(this.game, card.p.id);
    const slot = layout[this.j];
    if (!slot) return;
    const kind = slot.slot === 'Weapon' ? 'weapon' : 'accessory';
    const index = layout.slice(0, this.j).filter((s: any) => s.slot === slot.slot).length;
    const options = this._candidates(r, card.p.id, kind, slot);
    this.picker = { charId: card.p.id, kind, index, rows: options, i: 0, slotName: slot.slot };
    this._renderPicker();
  }

  /** Back out of the picker. Menus calls this before it pops the screen. */
  back() {
    if (!this.picker) return false;
    this.picker = null;
    this.pick.style.display = 'none';
    return true;
  }

  /** Everything in the bag this member is allowed to put in this slot. */
  _candidates(r: any, charId: any, kind: string, slot: any) {
    const rows = [];
    if (!slot.empty) rows.push({ id: null, name: '— Remove —', stat: 'Back into the bag', count: 0 });
    const allowed = CLASS_OK[charId as keyof typeof CLASS_OK] || CLASS_OK.noctis;
    for (const e of r.inventory.list(kind)) {
      const def = e.def;
      if (kind === 'weapon') {
        if (!allowed.includes(def.class)) continue;
        if (def.wielders && !def.wielders.includes(charId)) continue;
      }
      rows.push({
        id: def.id,
        name: def.name,
        stat: kind === 'weapon' ? `ATK +${def.attack}` : (def.special || 'Passive'),
        count: e.count,
      });
    }
    if (rows.length === 0) rows.push({ id: null, name: '— Nothing to fit here —', stat: '', count: 0, dead: true });
    return rows;
  }

  _renderPicker() {
    const p = this.picker;
    this.pick.style.display = '';
    this.pickH.textContent = `${p.charId.toUpperCase()}  ·  ${p.slotName} slot ${p.index + 1}`;
    clear(this.pickList);
    p.nodes = p.rows.map((row: any) => {
      const bg = el('div.mr-bg');
      const node = el('div.eprow', {}, [
        bg,
        el('div.ep-n', { text: row.name }),
        el('div.ep-s', { text: row.stat }),
        el('div.ep-q', { text: row.count ? `×${row.count}` : '' }),
      ]);
      this.pickList.appendChild(node);
      return { node, bg, row };
    });
  }

  _equipChosen() {
    const p = this.picker;
    const row = p.rows[p.i];
    const r = rpg(this.game);
    if (!r || !row) return;
    if (row.dead) { this.back(); return; }
    const res = r.inventory.equip(p.charId, p.kind, p.index, row.id);
    if (res.ok) {
      this._say(row.id ? `Equipped ${row.name}.` : 'Slot cleared.', true);
      if (r.refreshGear) r.refreshGear();
    } else {
      this._say((({
        'class-not-allowed': 'They cannot wield that.',
        'not-your-weapon': 'That blade answers to someone else.',
        'already-equipped': 'Already worn in another slot.',
        'not-owned': 'None left in the bag.',
      }) as any)[res.reason] || `Cannot equip that. (${res.reason})`, false);
    }
    this.back();
  }

  _say(text: any, ok: boolean) { this._msg = { text, ok }; this._msgAge = 0; }

  enter(game: any) {
    if (game) this.game = game;
    this._key = null;
    this.picker = null;
    this.pick.style.display = 'none';
    this._msg = null;
    this._msgAge = 9;
  }

  /** @param dt @param game @param a */
  update(dt: number, game: any, a: number) {
    const party = readParty(game);
    if (!this.cards.length) this._build(game, party);
    const r = rpg(game);

    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i];
      const p = party[i] || c.p;
      const t = easeOut(clamp((a - 0.1 - i * 0.06) / 0.6, 0, 1));
      c.card.style.opacity = t.toFixed(3);
      c.card.style.transform = `translateY(${((1 - t) * 26).toFixed(2)}px)`;
      c.bar.set(clamp((p.hp ?? 1) / (p.maxHp || 1), 0, 1), dt);
      const txt = `${commas(p.hp)} / ${commas(p.maxHp)}`;
      if (c._t !== txt) { c.hpVal.textContent = txt; c._t = txt; }
      const lv = `Level ${p.level}`;
      if (c._lv !== lv) { c.lvEl.textContent = lv; c._lv = lv; }

      // real derived attributes off the member's Stats block
      if (r) {
        const s = r.party.stats[p.id];
        const vals = [s.strength, s.vitality, s.magic, s.spirit];
        for (let k = 0; k < c.statNodes.length; k++) {
          const v = String(vals[k]);
          if (c.statNodes[k]._v !== v) { c.statNodes[k].v.textContent = v; c.statNodes[k]._v = v; }
        }
        // equipment can change from anywhere, so re-read the slot labels
        const gear = readGear(game, p.id);
        for (let k = 0; k < c.slots.length; k++) {
          const g = gear[k];
          if (!g) continue;
          if (c.slots[k]._n !== g.name) { c.slots[k].nm.textContent = g.name; c.slots[k]._n = g.name; }
          if (c.slots[k]._s !== g.stat) { c.slots[k].st.textContent = g.stat; c.slots[k]._s = g.stat; }
          c.slots[k].n.classList.toggle('empty', !!g.empty);
        }
      }

      for (let j = 0; j < c.slots.length; j++) {
        const on = i === this.i && j === this.j && !this.picker;
        if (c.slots[j]._on !== on) {
          c.slots[j].n.classList.toggle('on', on);
          c.slots[j]._on = on;
        }
        if (on) {
          const pulse = 0.5 + 0.5 * Math.sin(game.time.now * 2.6);
          c.slots[j].n.style.setProperty('--sel', (0.5 + 0.35 * pulse).toFixed(3));
        }
      }
    }

    // the equip picker
    if (this.picker) {
      const pk = this.picker;
      for (let i = 0; i < pk.nodes.length; i++) {
        const n = pk.nodes[i];
        const on = i === pk.i;
        if (n._on !== on) { n.node.classList.toggle('on', on); n._on = on; }
        n.bg.style.opacity = on ? (0.6 + 0.2 * (0.5 + 0.5 * Math.sin(game.time.now * 2.6))).toFixed(3) : '0';
      }
      this.pick.style.opacity = easeOut(clamp(a * 1.4, 0, 1)).toFixed(3);
    }

    this._msgAge = (this._msgAge || 0) + dt;
    this.msg.style.opacity = this._msg ? easeOut(clamp((2.6 - this._msgAge) / 0.7, 0, 1)).toFixed(3) : '0';
    if (this._msg) {
      this.msg.textContent = this._msg.text;
      this.msg.className = `gear-msg ${this._msg.ok ? 'ok' : 'bad'}`;
    }
  }
}
