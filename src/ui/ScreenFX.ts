import { el, letters, clamp, commas, easeOut, easeOutQuint, Clip } from './UIKit.ts';
import { clock } from './UIKit.ts';
import type { Game } from '../game/Game.ts';

/** What a finished encounter was worth, as `encounter:victory` carries it. */
export interface VictorySpoils {
  /** The encounter's name — the species, or the boss. */
  name?: string;
  kills?: number;
  exp?: number;
  gil?: number;
  drops?: string[];
}

/**
 * Full-screen framing effects that sit above the HUD: low-HP vignette pulse,
 * damage-taken red flash, the FFXV area title card, the level-up flourish and
 * the end-of-encounter spoils card.
 */
export class ScreenFX {
  card!: HTMLElement;
  cardMeta!: HTMLElement;
  cardName!: HTMLElement;
  cardRule!: HTMLElement;
  /** The area title currently on screen, per-letter, or null. */
  cardState!: { chars: HTMLElement[], clip: Clip } | null;
  cardSub!: HTMLElement;
  cine!: HTMLElement;
  cineAmt!: number;
  flash!: HTMLElement;
  flashAmt!: number;
  low!: HTMLElement;
  lu!: HTMLElement;
  luN!: HTMLElement;
  luState!: Clip | null;
  luT!: HTMLElement;
  root!: HTMLElement;
  /** The victory card and its four value cells. */
  vic!: HTMLElement;
  vicName!: HTMLElement;
  vicRule!: HTMLElement;
  vicStats!: HTMLElement;
  vicWord!: HTMLElement;
  vicCells!: Array<{ row: HTMLElement, label: HTMLElement, value: HTMLElement }>;
  /** The card currently on screen, per-letter, or null. */
  vicState!: { chars: HTMLElement[], rows: number, clip: Clip } | null;
  constructor(parent: HTMLElement) {
    this.root = el('div', { id: 'screenfx' });
    parent.appendChild(this.root);

    this.cine = el('div.vig.cine');
    this.low = el('div.vig.low');
    this.flash = el('div.vig.flash');
    this.root.appendChild(this.cine);
    this.root.appendChild(this.low);
    this.root.appendChild(this.flash);

    this.card = el('div.areacard');
    this.cardSub = el('div.ac-sub');
    this.cardName = el('div.ac-name');
    this.cardRule = el('div.ac-rule');
    this.cardMeta = el('div.ac-meta');
    this.card.appendChild(this.cardSub);
    this.card.appendChild(this.cardName);
    this.card.appendChild(this.cardRule);
    this.card.appendChild(this.cardMeta);
    this.root.appendChild(this.card);
    this.cardState = null;

    this.lu = el('div.levelup');
    this.luT = el('div.lu-t', { text: 'Level Up' });
    this.luN = el('div.lu-n');
    this.lu.appendChild(this.luT);
    this.lu.appendChild(this.luN);
    this.root.appendChild(this.lu);
    this.luState = null;

    this.vic = el('div.victory');
    this.vicName = el('div.vc-sub');
    this.vicWord = el('div.vc-word');
    this.vicRule = el('div.vc-rule');
    this.vicStats = el('div.vc-stats');
    this.vic.appendChild(this.vicName);
    this.vic.appendChild(this.vicWord);
    this.vic.appendChild(this.vicRule);
    this.vic.appendChild(this.vicStats);
    this.root.appendChild(this.vic);
    // Four fixed cells, built once. A fight ending is not the moment to be
    // creating DOM, and the labels never change.
    this.vicCells = ['Felled', 'EXP', 'Gil', 'Spoils'].map((name) => {
      const label = el('div.vc-lb', { text: name });
      const value = el('div.vc-vl');
      const row = el('div.vc-cell', {}, [label, value]);
      this.vicStats.appendChild(row);
      return { row, label, value };
    });
    this.vicState = null;

    this.flashAmt = 0;
    window.addEventListener('ffxv-area', (e) => this.areaTitle(e.detail?.name ?? '', e.detail?.sub, e.detail?.meta));
    window.addEventListener('ffxv-hit', (e) => this.hit(e.detail?.amount ?? 0.6));
  }

  /**
   * Show the area title card.
   * @param name large region name
   * @param [sub] small line above it
   * @param [meta] small line below the rule
   */
  areaTitle(name: string, sub: string = '', meta: string = '') {
    if (!name) return;
    this.cardSub.textContent = sub;
    this.cardMeta.textContent = meta;
    this.cardName.textContent = '';
    const l = letters(String(name).toUpperCase());
    this.cardName.appendChild(l.node);
    this.cardState = { chars: l.chars, clip: new Clip(1.15, 2.6) };
  }

  /**
   * The end of a fight.
   *
   * Nothing marked one before this: `encounter:victory` carried kills, EXP,
   * gil and drops, the toasts printed a few of them one at a time down the
   * left edge, and the party simply stood up. This is the beat — the species
   * you just fought, the word, a hairline, and what the fight was worth.
   *
   * Lives on `ScreenFX` rather than on `CombatHUD` because the combat layer's
   * reveal is already collapsing by the time a victory resolves: anything
   * drawn there is faded out on the frame it would appear.
   *
   * @param s the `encounter:victory` payload
   */
  victory(s: VictorySpoils) {
    if (!s) return;
    const kills = Math.max(0, Math.round(s.kills ?? 0));
    const exp = Math.max(0, Math.round(s.exp ?? 0));
    const gil = Math.max(0, Math.round(s.gil ?? 0));
    const drops = Array.isArray(s.drops) ? s.drops : [];
    this.vicName.textContent = s.name ? String(s.name).toUpperCase() : '';
    this.vicWord.textContent = '';
    const l = letters('VICTORY');
    this.vicWord.appendChild(l.node);
    const vals = [
      String(kills),
      exp ? commas(exp) : '\u2014',
      gil ? commas(gil) : '\u2014',
      drops.length ? String(drops.length) : '\u2014',
    ];
    let rows = 0;
    for (let i = 0; i < this.vicCells.length; i++) {
      // A cell with nothing in it is not shown at all — an em-dash row of
      // zeroes is the chunky game-UI the brief rules out.
      const on = vals[i] !== '\u2014';
      this.vicCells[i].row.style.display = on ? '' : 'none';
      this.vicCells[i].value.textContent = vals[i];
      if (on) rows++;
    }
    this.vicState = { chars: l.chars, rows, clip: new Clip(0.9, 2.5) };
  }

  /** Red damage flash. @param amount 0..1 */
  hit(amount: number = 0.6) { this.flashAmt = Math.max(this.flashAmt, clamp(amount, 0, 1)); }

  /** Level-up flourish. @param level */
  levelUp(level: number) {
    this.luN.textContent = String(level);
    this.luState = new Clip(0.5, 2.0);
  }

  /** Cinematic edge darkening strength (0..1). */
  setCinematic(v: number) { this.cineAmt = clamp(v, 0, 1); }

  /**
   * @param dt seconds
   */
  update(dt: number, game: Game) {
    const t = game.time.now;

    // low-HP vignette
    const st = game.get?.('Player')?.stats;
    const frac = st && st.maxHp ? clamp(st.hp / st.maxHp, 0, 1) : 1;
    const danger = clamp((0.32 - frac) / 0.32, 0, 1);
    const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 4.2));
    this.low.style.opacity = (danger * pulse).toFixed(3);

    // damage flash
    if (this.flashAmt > 0) this.flashAmt = Math.max(0, this.flashAmt - dt * 2.6);
    this.flash.style.opacity = (this.flashAmt * 0.85).toFixed(3);

    this.cine.style.opacity = (this.cineAmt ?? 0.55).toFixed(3);

    this._updateCard(dt);
    this._updateLevel(dt);
    this._updateVictory(dt);
  }

  /**
   * Drive the victory card. Same shape as `_updateCard`: every value written
   * from the clip's own age, no CSS transition, so a capture is deterministic.
   */
  _updateVictory(dt: number) {
    const s = this.vicState;
    if (!s) { this.vic.style.opacity = '0'; return; }
    s.clip.step(dt);
    if (!s.clip.alive) { this.vicState = null; this.vic.style.opacity = '0'; return; }
    const age = s.clip.age;
    const out = clamp((age - (s.clip.dur + s.clip.hold - 0.6)) / 0.6, 0, 1);
    this.vicName.style.opacity = (easeOut(clamp(age / 0.35, 0, 1)) * 0.9).toFixed(3);
    this.vicName.style.letterSpacing = `${(0.42 + 0.22 * easeOutQuint(clamp(age / 0.8, 0, 1))).toFixed(3)}em`;
    for (let i = 0; i < s.chars.length; i++) {
      const lt = clamp((age - 0.08 - i * 0.045) / 0.5, 0, 1);
      const e = easeOutQuint(lt);
      s.chars[i].style.opacity = e.toFixed(3);
      s.chars[i].style.transform = `translateY(${((1 - e) * 12).toFixed(2)}px)`;
      s.chars[i].style.filter = lt < 1 ? `blur(${((1 - e) * 4).toFixed(2)}px)` : '';
    }
    // even widths only: an odd box centred by `margin: auto` lands on a half
    // pixel and resamples every glyph above it
    const rw = easeOutQuint(clamp((age - 0.28) / 0.7, 0, 1)) * (86 * s.rows + 40);
    this.vicRule.style.width = `${Math.round(rw / 2) * 2}px`;
    this.vicStats.style.opacity = easeOut(clamp((age - 0.5) / 0.5, 0, 1)).toFixed(3);
    this.vic.style.opacity = (easeOut(clamp(age / 0.2, 0, 1)) * (1 - out)).toFixed(3);
    this.vic.style.transform = `translate(-50%, ${(-out * 9).toFixed(1)}px)`;
  }

  _updateCard(dt: number) {
    const s = this.cardState;
    if (!s) { this.card.style.opacity = '0'; return; }
    s.clip.step(dt);
    if (!s.clip.alive) { this.cardState = null; this.card.style.opacity = '0'; return; }
    const age = s.clip.age;
    const out = clamp((age - (s.clip.dur + s.clip.hold - 0.7)) / 0.7, 0, 1);
    this.cardSub.style.opacity = easeOut(clamp(age / 0.4, 0, 1)).toFixed(3);
    this.cardSub.style.letterSpacing = `${(0.36 + 0.20 * easeOutQuint(clamp(age / 0.9, 0, 1))).toFixed(3)}em`;
    // letters rise and fade in one by one
    for (let i = 0; i < s.chars.length; i++) {
      const lt = clamp((age - 0.10 - i * 0.035) / 0.55, 0, 1);
      const e = easeOutQuint(lt);
      s.chars[i].style.opacity = e.toFixed(3);
      s.chars[i].style.transform = `translateY(${((1 - e) * 16).toFixed(2)}px)`;
      s.chars[i].style.filter = lt < 1 ? `blur(${((1 - e) * 5).toFixed(2)}px)` : '';
    }
    this.cardRule.style.width = `${(easeOutQuint(clamp((age - 0.34) / 0.9, 0, 1)) * 420).toFixed(0)}px`;
    this.cardMeta.style.opacity = easeOut(clamp((age - 0.7) / 0.5, 0, 1)).toFixed(3);
    this.card.style.opacity = (1 - out).toFixed(3);
    this.card.style.transform = `translateY(${(-out * 10).toFixed(1)}px)`;
  }

  _updateLevel(dt: number) {
    const s = this.luState;
    if (!s) { this.lu.style.opacity = '0'; return; }
    s.step(dt);
    if (!s.alive) { this.luState = null; this.lu.style.opacity = '0'; return; }
    const age = s.age;
    const out = clamp((age - (s.dur + s.hold - 0.5)) / 0.5, 0, 1);
    const e = easeOutQuint(s.t);
    this.luT.style.letterSpacing = `${(0.9 - 0.3 * e).toFixed(3)}em`;
    this.luN.style.transform = `scale(${(1.5 - 0.5 * e).toFixed(3)})`;
    this.lu.style.opacity = (easeOut(clamp(age / 0.2, 0, 1)) * (1 - out)).toFixed(3);
  }
}

/** Convenience re-export so callers can format the world clock consistently. */
export { clock };
