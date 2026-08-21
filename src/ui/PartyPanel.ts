import { el, clamp, commas, easeOut } from './UIKit.ts';
import { icon, portrait } from './Icons.ts';
import { Bar } from './Bar.ts';
import { readParty } from './GameData.ts';

const BAD_STATUS = new Set(['poison', 'stone', 'toad']);

/**
 * Bottom-left party status stack: three companions above, Noctis at the bottom
 * with a larger plate, an MP gauge and a level readout.
 *
 * ### This class owns the whole bottom-left corner
 *
 * Four things want to live here — the Armiger gauge, the technique rail, the
 * toast column and the party stack — and until now three of them were parked at
 * hand-measured `bottom:` offsets while the fourth (toasts) grew inside the same
 * bottom-anchored box. Every toast therefore shoved the party stack *up* by
 * ~33 px, and after one or two pickups the DAWNHAMMER / REGROUP / STARSHELL rail
 * was drawing straight through the party's HP numbers.
 *
 * So the corner is one bottom-anchored flex column with a fixed slot order, and
 * flow — not arithmetic — keeps the four apart:
 *
 * ```
 *   .bl-combat   Armiger gauge + technique rail   (combat only, display:none otherwise)
 *   .bl-banter   party banter bubbles              (field only, transient)
 *   .bl-notice   toast column                     (transient)
 *   .party       party stack                      (always, pinned to the bottom)
 * ```
 *
 * `CombatHUD` fills `combatSlot`, `Subtitles` fills `banterSlot` and `Toasts`
 * fills `noticeSlot`; nothing in any of them needs to know how tall the others
 * are. The banter bubbles were the last thing down here still pinned to a
 * hand-measured `bottom:` — at `268px` they sat 33 px above the party stack and
 * a single toast printed straight through them.
 */
export class PartyPanel {
  banterSlot!: any;
  built!: boolean;
  combatSlot!: any;
  list!: any;
  noticeSlot!: any;
  root!: any;
  rows!: any[];
  constructor(parent: HTMLElement) {
    this.root = el('div.hud-corner.bl');
    /** Armiger + technique rail live here — see the class note. */
    this.combatSlot = el('div.bl-combat');
    /** Party banter bubbles live here. */
    this.banterSlot = el('div.bl-banter');
    /** The toast column lives here. */
    this.noticeSlot = el('div.bl-notice');
    this.list = el('div.party');
    this.root.appendChild(this.combatSlot);
    this.root.appendChild(this.banterSlot);
    this.root.appendChild(this.noticeSlot);
    this.root.appendChild(this.list);
    parent.appendChild(this.root);
    this.rows = [];
    this.built = false;
  }

  _build(party: any) {
    // companions first (stacked above), lead last so it sits at the bottom
    const order = [1, 2, 3, 0];
    for (const idx of order) {
      const p = party[idx];
      const lead = idx === 0;
      const pfPlate = el('div.pf-plate', {}, [portrait(p.hue, lead ? 0.62 : 0.4)]);
      const nm = el('span.nm', { text: p.name });
      const lv = el('span.lv', {}, [el('span', { text: 'LV ' }), el('b', { text: String(p.level) })]);
      const sts = el('div.sts');
      const head = el('div.party-head', {}, lead ? [nm, lv, sts] : [nm, sts]);

      const hpBar = new Bar({ cls: 'cut' });
      const hpVal = el('div.val');
      const hpLine = el('div.hp-line', {}, [hpBar.node, hpVal]);

      const body = el('div.party-body', {}, [head, hpLine]);
      let mpBar = null; let mpVal = null;
      if (lead) {
        mpBar = new Bar({ cls: 'slim', chase: false }).tint('mp');
        mpVal = el('div.val');
        body.appendChild(el('div.mp-line', {}, [el('span.tag', { text: 'MP' }), mpBar.node, mpVal]));
      }

      const row = el(`div.party-row${lead ? '.lead' : ''}`, {}, [pfPlate, body]);
      this.list.appendChild(row);
      this.rows.push({ idx, lead, row, hpBar, hpVal, mpBar, mpVal, sts, stsKey: '', flash: 0, lastHp: p.hp });
    }
    this.built = true;
  }

  /**
   * @param dt seconds
   * @param appear 0..1 master reveal
   */
  update(dt: number, game: any, appear: number) {
    const party = readParty(game);
    if (!this.built) this._build(party);

    for (let i = 0; i < this.rows.length; i++) {
      const r = this.rows[i];
      const p = party[r.idx] || {};
      const maxHp = p.maxHp || 1;
      const hp = clamp(p.hp ?? maxHp, 0, maxHp);

      // staggered reveal — rows slide in from the left, lead first
      const stagger = clamp((appear - 0.06 * (this.rows.length - 1 - i)) / 0.72, 0, 1);
      const e = easeOut(stagger);
      r.row.style.opacity = e.toFixed(3);
      r.row.style.transform = `translateX(${((1 - e) * -26).toFixed(2)}px)`;

      r.hpBar.set(hp / maxHp, dt);
      const txt = commas(hp);
      if (r._hpTxt !== txt) {
        r.hpVal.textContent = '';
        r.hpVal.appendChild(document.createTextNode(txt));
        r.hpVal.appendChild(el('span.max', { text: ` / ${commas(maxHp)}` }));
        r._hpTxt = txt;
      }
      // critical HP: the number and bar breathe
      const crit = hp / maxHp < 0.25;
      if (crit) {
        const pulse = 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(game.time.now * 6.2));
        r.hpVal.style.color = `rgba(255,${Math.round(140 + 70 * pulse)},${Math.round(120 + 60 * pulse)},1)`;
      } else if (r._crit) r.hpVal.style.color = '';
      r._crit = crit;

      if (r.mpBar) {
        const maxMp = p.maxMp || 1;
        const mp = clamp(p.mp ?? maxMp, 0, maxMp);
        r.mpBar.set(mp / maxMp, dt);
        const mtxt = `${Math.round(mp)} / ${Math.round(maxMp)}`;
        if (r._mpTxt !== mtxt) { r.mpVal.textContent = mtxt; r._mpTxt = mtxt; }
      }

      const key = (p.status || []).join(',');
      if (key !== r.stsKey) {
        r.sts.textContent = '';
        for (const s of p.status || []) {
          r.sts.appendChild(icon(s, { size: 13, stroke: 1.35, cls: BAD_STATUS.has(s) ? 'bad' : '' }));
        }
        r.stsKey = key;
      }
    }
  }
}
