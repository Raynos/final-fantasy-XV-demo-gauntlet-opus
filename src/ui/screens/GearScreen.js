import { el, clamp, commas, easeOut } from '../UIKit.js';
import { icon, portrait } from '../Icons.js';
import { Bar } from '../Bar.js';
import { readGear, readParty, rpg } from '../GameData.js';

const SLOT_ICON = { Weapon: 'sword', Accessory: 'ap' };

/**
 * Gear: one card per party member with their real equipment slots.
 *
 * Slot counts come from `Inventory.SLOT_LAYOUT` (Noctis carries four armaments,
 * everyone else two, all four have three accessory slots), the contents from
 * `Inventory.equipped()`, the attributes from the member's `Stats` block with
 * gear, buffs and Ascension folded in, and the technique list from `PartyState`.
 */
export class GearScreen {
  /** @param {import('../Menus.js').Menus} menus */
  constructor(menus) {
    this.menus = menus;
    this.title = 'Gear';
    this.sub = 'Four armaments, two accessories, one very tired advisor';
    this.i = 0;
    this.j = 0;
  }

  /** @param {HTMLElement} root */
  build(root, game) {
    this.game = game;
    this.grid = el('div.gear-grid');
    root.appendChild(this.grid);
    this.cards = [];
  }

  _build(game, party) {
    const r = rpg(game);
    party.forEach((p) => {
      const list = readGear(game, p.id);
      const bar = new Bar({ cls: 'slim' });
      const hpVal = el('div.gv');
      const slots = list.map((s) => {
        const n = el('div.gslot', {}, [
          el('div.gs-k', {}, [icon(SLOT_ICON[s.slot] || 'sword', { size: 11, stroke: 1.3 }), el('span', { text: ` ${s.slot}` })]),
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
        el('div.gc-slots', {}, slots.map((s) => s.n)),
        el('div.rule', { style: 'margin-top:26px' }),
        el('div.gc-abil', {}, [
          el('div.k', { text: 'Techniques' }),
          ...(techs.length ? techs : [{ name: '—', bars: 0 }]).map((t) => el('div.ab', {}, [
            icon('ascension', { size: 11, stroke: 1.3 }),
            el('span', { text: t.bars ? `${t.name}   ·   ${t.bars} bar${t.bars === 1 ? '' : 's'}` : t.name }),
          ])),
        ]),
        el('div.rule', { style: 'margin-top:auto' }),
        el('div.gc-stats', {}, statNodes.map((s) => s.node)),
      ]);
      this.grid.appendChild(card);
      this.cards.push({ card, bar, hpVal, slots, statNodes, p, lvEl: card.firstChild.lastChild.lastChild });
    });
  }

  nav(dx, dy) {
    if (dx) this.i = clamp(this.i + dx, 0, Math.max(0, this.cards.length - 1));
    const n = this.cards[this.i]?.slots.length || 1;
    if (dy) this.j = (this.j + dy + n) % n;
  }

  enter(game) { if (game) this.game = game; this._key = null; }

  /** @param {number} dt @param {object} game @param {number} a */
  update(dt, game, a) {
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
        const on = i === this.i && j === this.j;
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
  }
}
