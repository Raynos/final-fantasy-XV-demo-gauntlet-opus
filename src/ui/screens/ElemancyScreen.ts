import { el, clamp, commas, easeOut, easeOutQuint } from '../UIKit.ts';
import { icon } from '../Icons.ts';
import { ensureInteractCss } from '../../game/interaction/interact.css.ts';
import { rpg } from '../GameData.ts';
import type { Menus } from '../Menus.ts';
import type { Game } from '../../game/Game.ts';
import type { MagicElement } from '../../game/rpg/Elemancy.ts';

/**
 * Elemancy — the flask.
 *
 * **This screen exists because the model underneath it was complete and had no
 * door.** `RpgSystem.craftSpell` was called from exactly one place in the
 * repository — `src/tools/combatloop.mts` — so "Craft your first spell" passed
 * the quest audit (`craft` has a notifier) and was uncompletable in play. Every
 * number on this screen is the real `Elemancy` model: the energy stocks are
 * `elemancy.energy`, the preview is `elemancy.preview()` with Noctis' live
 * Magic stat, and Enter spends real energy and a real catalyst item through
 * `RpgSystem.craftSpell`.
 *
 * Controls: ↑↓ pick a row, ←→ dial it, Enter craft.
 *
 * The four rows are the four decisions FFXV's flask asks for — how much fire,
 * how much ice, how much lightning, and what to throw in with it — and the
 * right-hand panel is the preview those four produce, recomputed every frame.
 * A crafting screen where you cannot see what you are about to make is a form,
 * not a decision.
 *
 * No CSS transitions; everything animated is written per frame, like the rest
 * of `src/ui/`.
 */

/** How much one press of ←→ moves an element. */
const STEP = 5;

/** The three flask rows, in FFXV's order. */
const ELEMENTS: MagicElement[] = ['fire', 'ice', 'lightning'];

const ELEMENT_META: Record<MagicElement, { label: string, icon: string, hue: string }> = {
  fire: { label: 'Fire', icon: 'fire', hue: '#ff8a3c' },
  ice: { label: 'Ice', icon: 'ice', hue: '#7fd6ff' },
  lightning: { label: 'Lightning', icon: 'lightning', hue: '#c8b6ff' },
};

/** A catalyst the player is actually carrying, as the catalyst row cycles them. */
interface CatalystChoice {
  id: string | null;
  name: string;
  held: number;
  effect: string;
}

export class ElemancyScreen {
  /** The screen root. Created and assigned by whoever registers the screen. */
  node!: HTMLElement;
  menus: Menus;
  game!: Game;
  title = 'Elemancy';
  sub = 'Draw, mix, and carry it';

  /** Selected row: 0..2 elements, 3 catalyst. */
  i = 0;
  /** Units of each element dialled into the flask. */
  mix: Record<MagicElement, number> = { fire: 0, ice: 0, lightning: 0 };
  /** Index into `_catalysts()`; 0 is always "nothing". */
  ci = 0;
  /** Catalyst units, 1..3. */
  cn = 1;

  _msg: { text: string, ok: boolean } | null = null;
  _msgAge = 9;
  _cur: string | null = null;
  _age = 0;

  rows!: Array<{ node: HTMLElement, bg: HTMLElement, k: HTMLElement, v: HTMLElement, d: HTMLElement, ico: HTMLElement, _on?: boolean }>;
  list!: HTMLElement;
  cols!: HTMLElement;
  detail!: HTMLElement;
  dRule!: HTMLElement;
  dK!: HTMLElement;
  dN!: HTMLElement;
  dD!: HTMLElement;
  dI!: HTMLElement;
  specVals!: HTMLElement[];
  act!: HTMLElement;
  actLb!: HTMLElement;
  msg!: HTMLElement;
  carried!: HTMLElement;
  stock!: HTMLElement;
  stockV!: HTMLElement;
  stockD!: HTMLElement;

  constructor(menus: Menus) {
    ensureInteractCss();
    this.menus = menus;
  }

  build(root: HTMLElement, game: Game) {
    this.game = game;
    this.cols = el('div.cols');

    const l = el('div.col-l');
    l.appendChild(el('div.tabs', {}, [el('div.tab.on', { text: 'The Flask' })]));
    this.list = el('div.qlist');
    l.appendChild(this.list);
    this.carried = el('div.t-body', { style: 'margin-top:22px;max-width:440px' });
    l.appendChild(this.carried);

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
    const specs = el('div.dt-specs');
    this.specVals = [['Potency', ''], ['Casts', ''], ['Energy', ''], ['Catalyst', '']].map(([k]) => {
      const v = el('div.v');
      specs.appendChild(el('div.dt-spec', {}, [el('div.k', { text: k }), v]));
      return v;
    });
    this.detail.appendChild(el('div.rule', { style: 'margin-top:24px;max-width:420px' }));
    this.detail.appendChild(specs);
    this.act = el('div.q-act', {}, [this.actLb = el('div.lb')]);
    this.detail.appendChild(this.act);
    this.msg = el('div.shop-msg');
    this.detail.appendChild(this.msg);
    r.appendChild(this.detail);

    this.cols.appendChild(l);
    this.cols.appendChild(r);
    root.appendChild(this.cols);

    // Top right, where every screen puts its headline reading: the flask stock.
    this.stock = el('div.shop-gil', {}, [
      el('div.k', { text: 'Energy in hand' }),
      this.stockV = el('div.v'),
      this.stockD = el('div.d'),
    ]);
    root.appendChild(this.stock);
  }

  enter(game: Game) {
    if (game) this.game = game;
    this.mix = { fire: 0, ice: 0, lightning: 0 };
    this.ci = 0; this.cn = 1; this.i = 0;
    this._msg = null; this._msgAge = 9; this._cur = null;
  }

  /* -------------------------------------------------------------- data */

  _elemancy() { return rpg(this.game)?.elemancy ?? null; }

  /**
   * "Nothing", then every catalyst item actually in the bag.
   *
   * Read off `Inventory` rather than off the catalyst table, because a screen
   * that offers a catalyst you do not have is a screen that answers
   * `not-enough-catalyst` and looks broken.
   */
  _catalysts(): CatalystChoice[] {
    const r = rpg(this.game);
    const out: CatalystChoice[] = [{ id: null, name: 'Nothing', held: 0, effect: 'A plain elemental flask.' }];
    if (!r) return out;
    for (const stack of r.inventory.list('catalyst')) {
      const c = stack.def.catalyst;
      if (!c) continue;
      out.push({ id: stack.id, name: stack.def.name, held: stack.count, effect: c.effect });
    }
    return out;
  }

  /** The four rows, resolved against live state. */
  _rows() {
    const em = this._elemancy();
    const cats = this._catalysts();
    const cat = cats[Math.min(this.ci, cats.length - 1)];
    return { em, cats, cat };
  }

  /* -------------------------------------------------------------- input */

  nav(dx: number, dy: number) {
    if (dy) this.i = (this.i + dy + 4) % 4;
    if (!dx) return;
    const { em, cats } = this._rows();
    if (this.i < 3) {
      const e = ELEMENTS[this.i];
      const held = em ? em.energy[e] : 0;
      this.mix[e] = clamp(this.mix[e] + dx * STEP, 0, held);
    } else {
      const n = cats.length;
      this.ci = (this.ci + dx + n) % n;
      this.cn = 1;
    }
  }

  accept() {
    const r = rpg(this.game);
    const { cats } = this._rows();
    const cat = cats[Math.min(this.ci, cats.length - 1)];
    if (!r) return;
    const total = this.mix.fire + this.mix.ice + this.mix.lightning;
    if (total <= 0) { this._say('Dial some energy into the flask first.', false); return; }
    const res = r.craftSpell({ ...this.mix }, cat.id ? { id: cat.id, count: this.cn } : null);
    if (res.ok && 'spell' in res && res.spell) {
      this._say(`${res.spell.name} — ${res.spell.casts} casts, equipped.`, true);
      this.mix = { fire: 0, ice: 0, lightning: 0 };
      this.ci = 0;
      this._cur = null;
    } else {
      const why = 'reason' in res ? res.reason : 'unknown';
      this._say(why === 'not-enough-energy' ? 'Not enough energy drawn.'
        : why === 'not-enough-catalyst' ? `You do not have ${this.cn} ${cat.name}.`
          : why === 'no-energy' ? 'Dial some energy into the flask first.'
            : `Cannot craft (${why}).`, false);
    }
  }

  _say(text: string, ok: boolean) { this._msg = { text, ok }; this._msgAge = 0; }

  /* ----------------------------------------------------------- render */

  _build() {
    this.list.textContent = '';
    this.rows = [0, 1, 2, 3].map((i) => {
      const bg = el('div.mr-bg');
      const k = el('div.qn');
      // The dialled amount is the number the whole screen is about, so it is
      // set at the size of a headline rather than at the price column's 12.5px.
      const v = el('div.qp', { style: 'font-size:19px;font-weight:200;min-width:58px' });
      const d = el('div.hlv', { style: 'min-width:150px;text-align:right' });
      // `icon()` falls back to the `items` glyph for an unknown key and says
      // nothing about it, so every name here is one that exists in `Icons.ts`.
      const ico = el('div.rico', { style: 'display:flex;flex:none' });
      const node = el('div.qrow', {}, [bg, ico, k, d, v]);
      this.list.appendChild(node);
      ico.appendChild(icon(i < 3 ? ELEMENT_META[ELEMENTS[i]].icon : 'items', { size: 16, stroke: 1.15 }));
      this.list.appendChild(el('div.rule', { style: 'opacity:.34' }));
      return { node, bg, k, v, d, ico };
    });
  }

  update(dt: number, game: Game, a: number) {
    this.game = game;
    if (!this.rows) this._build();
    const { em, cats } = this._rows();
    const cat = cats[Math.min(this.ci, cats.length - 1)];
    const r = rpg(game);

    // -- the four rows -------------------------------------------------
    for (let i = 0; i < 4; i++) {
      const rn = this.rows[i];
      if (i < 3) {
        const e = ELEMENTS[i];
        const held = em ? em.energy[e] : 0;
        const meta = ELEMENT_META[e];
        rn.k.textContent = meta.label;
        rn.k.style.color = this.mix[e] > 0 ? meta.hue : '';
        rn.d.textContent = `${held} in hand`;
        rn.v.textContent = `${this.mix[e]}`;
        rn.v.style.color = this.mix[e] > 0 ? '#fff' : '';
        rn.node.classList.toggle('locked', held <= 0);
      } else {
        rn.k.textContent = 'Catalyst';
        rn.k.style.color = '';
        rn.d.textContent = cat.id ? `${cat.held} held · ${cat.effect}` : `${cats.length - 1} kinds in the bag`;
        rn.v.textContent = cat.id ? `${cat.name}` : '—';
        rn.node.classList.toggle('locked', cats.length <= 1);
      }
      const t = easeOut(clamp((a - 0.14 - i * 0.028) / 0.55, 0, 1));
      rn.node.style.opacity = t.toFixed(3);
      rn.node.style.transform = `translateX(${((1 - t) * -26).toFixed(2)}px)`;
      const on = i === this.i;
      if (rn._on !== on) { rn.node.classList.toggle('on', on); rn._on = on; }
      rn.bg.style.opacity = on ? (0.6 + 0.2 * (0.5 + 0.5 * Math.sin(game.time.now * 2.6))).toFixed(3) : '0';
    }

    // -- the preview, recomputed live ----------------------------------
    const total = this.mix.fire + this.mix.ice + this.mix.lightning;
    const magic = r ? r.noctis.magic : 100;
    const pv = em && total > 0
      ? em.preview({ ...this.mix }, cat.id ? { id: cat.id, count: this.cn } : null, magic)
      : null;
    const key = `${this.mix.fire}/${this.mix.ice}/${this.mix.lightning}/${cat.id}/${this.cn}`;
    if (this._cur !== key) {
      this._cur = key;
      this._age = 0;
      const ok = !!pv && pv.ok !== false;
      this.dK.textContent = 'The Flask';
      this.dN.textContent = ok && pv && 'name' in pv ? String(pv.name) : 'Empty flask';
      this.dD.textContent = ok && pv
        ? (('effects' in pv && Array.isArray(pv.effects) && pv.effects.length)
          ? pv.effects.join(' · ')
          : 'A plain elemental spell. A catalyst gives it a second job.')
        : 'Draw energy from a deposit with T, then dial it in here. '
          + 'Fire, ice and lightning mix; a catalyst decides what else the spell does.';
      this.dI.textContent = '';
      // The glyph of whichever element dominates the mix, so the panel changes
      // as you dial rather than showing one generic sigil forever.
      const lead = ELEMENTS.reduce((best, e) => (this.mix[e] > this.mix[best] ? e : best), 'fire' as MagicElement);
      this.dI.appendChild(icon(total > 0 ? ELEMENT_META[lead].icon : 'items', { size: 104, stroke: 0.46 }));
      this.specVals[0].textContent = ok && pv && 'potency' in pv ? commas(Math.round(Number(pv.potency))) : '—';
      this.specVals[1].textContent = ok && pv && 'casts' in pv ? String(pv.casts) : '—';
      this.specVals[2].textContent = total > 0
        ? ELEMENTS.filter((e) => this.mix[e] > 0).map((e) => `${this.mix[e]} ${ELEMENT_META[e].label.toLowerCase()}`).join(' + ')
        : 'nothing dialled';
      this.specVals[3].textContent = cat.id ? `${this.cn} × ${cat.name}` : 'none';
      this.actLb.textContent = total > 0 ? 'Enter — craft it' : 'Dial energy with ← →';
      this.actLb.className = total > 0 ? 'lb go' : 'lb no';
    }
    this._age += dt;
    const de = easeOut(clamp(this._age / 0.22, 0, 1)) * easeOut(clamp((a - 0.24) / 0.55, 0, 1));
    this.detail.style.opacity = de.toFixed(3);
    this.detail.style.transform = `translateX(${((1 - de) * 16).toFixed(2)}px)`;
    this.dRule.style.height = `${(easeOutQuint(clamp((a - 0.2) / 0.7, 0, 1)) * 100).toFixed(0)}%`;

    // -- what is already carried ---------------------------------------
    const spells = em ? em.spells : [];
    this.carried.textContent = spells.length
      ? `Carrying: ${spells.map((s) => `${s.name} ×${s.remaining}`).join(' · ')}`
      : 'Nothing carried. A crafted spell goes straight into the first free quick-cast slot.';
    this.carried.style.opacity = easeOut(clamp((a - 0.3) / 0.55, 0, 1)).toFixed(3);

    // -- the stock readout ---------------------------------------------
    const held = em ? em.totalEnergy : 0;
    this.stockV.innerHTML = `${held}<small>UNITS</small>`;
    this.stockD.textContent = em
      ? `${em.energy.fire} fire · ${em.energy.ice} ice · ${em.energy.lightning} lightning  (cap ${em.cap} each)`
      : '';
    this.stock.style.opacity = easeOut(clamp((a - 0.16) / 0.55, 0, 1)).toFixed(3);

    this._msgAge += dt;
    this.msg.style.opacity = this._msg ? easeOut(clamp((2.6 - this._msgAge) / 0.7, 0, 1)).toFixed(3) : '0';
    if (this._msg) {
      this.msg.textContent = this._msg.text;
      this.msg.className = `shop-msg ${this._msg.ok ? 'ok' : 'bad'}`;
    }
  }
}

export default ElemancyScreen;
