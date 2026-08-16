import { el, clamp, commas, easeOut } from '../UIKit.js';
import { icon, portrait } from '../Icons.js';
import { Bar } from '../Bar.js';
import { GEAR, readParty } from '../GameData.js';

const SLOT_ICON = { Weapon: 'sword', Accessory: 'ap' };

const ABILITIES = {
  noctis: ['Warp-Strike', 'Armiger Release', 'Point-Warp'],
  gladiolus: ['Tempest', 'Impulse', 'Dawnhammer'],
  ignis: ['Enhancement', 'Regroup', 'Overwhelm'],
  prompto: ['Starshell', 'Piercer', 'Gravisphere'],
};

/** Gear: one card per party member with their four equipment slots. */
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
  build(root) {
    this.grid = el('div.gear-grid');
    root.appendChild(this.grid);
    this.cards = [];
  }

  _build(party) {
    party.forEach((p, ci) => {
      const list = GEAR[p.id] || GEAR.noctis;
      const bar = new Bar({ cls: 'slim' });
      const hpVal = el('div.gv');
      const slots = list.map((s) => {
        const n = el('div.gslot', {}, [
          el('div.gs-k', {}, [icon(SLOT_ICON[s.slot] || 'sword', { size: 11, stroke: 1.3 }), el('span', { text: ` ${s.slot}` })]),
          el('div.gs-n', { text: s.name }),
          el('div.gs-s', { text: s.stat }),
        ]);
        return { n, s };
      });
      // derived attributes — deterministic per member, not read from anywhere
      const stats = [
        ['Str', 168 + ci * 34], ['Vit', 142 + ci * 26],
        ['Mag', 196 - ci * 22], ['Spr', 118 + ci * 18],
      ].map(([k, v]) => el('div.gstat', {}, [el('span.k', { text: k }), el('span.v', { text: String(v) })]));

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
          ...(ABILITIES[p.id] || ABILITIES.noctis).map((a) => el('div.ab', {}, [
            icon('ascension', { size: 11, stroke: 1.3 }), el('span', { text: a }),
          ])),
        ]),
        el('div.rule', { style: 'margin-top:auto' }),
        el('div.gc-stats', {}, stats),
      ]);
      this.grid.appendChild(card);
      this.cards.push({ card, bar, hpVal, slots, p });
    });
  }

  nav(dx, dy) {
    if (dx) this.i = clamp(this.i + dx, 0, Math.max(0, this.cards.length - 1));
    if (dy) this.j = (this.j + dy + 4) % 4;
  }

  /** @param {number} dt @param {object} game @param {number} a */
  update(dt, game, a) {
    const party = readParty(game);
    if (!this.cards.length) this._build(party);
    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i];
      const p = party[i] || c.p;
      const t = easeOut(clamp((a - 0.1 - i * 0.06) / 0.6, 0, 1));
      c.card.style.opacity = t.toFixed(3);
      c.card.style.transform = `translateY(${((1 - t) * 26).toFixed(2)}px)`;
      c.bar.set(clamp((p.hp ?? 1) / (p.maxHp || 1), 0, 1), dt);
      const txt = `${commas(p.hp)} / ${commas(p.maxHp)}`;
      if (c._t !== txt) { c.hpVal.textContent = txt; c._t = txt; }
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
