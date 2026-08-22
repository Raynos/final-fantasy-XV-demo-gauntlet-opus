import { el, letters, clamp, easeOut, easeOutQuint, Clip } from './UIKit.ts';
import { clock } from './UIKit.ts';

/**
 * Full-screen framing effects that sit above the HUD: low-HP vignette pulse,
 * damage-taken red flash, the FFXV area title card, and the level-up flourish.
 */
export class ScreenFX {
  card!: any;
  cardMeta!: any;
  cardName!: any;
  cardRule!: any;
  cardState!: any;
  cardSub!: any;
  cine!: any;
  cineAmt!: any;
  flash!: any;
  flashAmt!: number;
  low!: any;
  lu!: any;
  luN!: any;
  luState!: Clip | null;
  luT!: any;
  root!: any;
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

  /** Red damage flash. @param amount 0..1 */
  hit(amount: number = 0.6) { this.flashAmt = Math.max(this.flashAmt, clamp(amount, 0, 1)); }

  /** Level-up flourish. @param level */
  levelUp(level: number) {
    this.luN.textContent = String(level);
    this.luState = new Clip(0.5, 2.0);
  }

  /** Cinematic edge darkening strength (0..1). */
  setCinematic(v: any) { this.cineAmt = clamp(v, 0, 1); }

  /**
   * @param dt seconds
   */
  update(dt: number, game: any) {
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
  }

  _updateCard(dt: any) {
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

  _updateLevel(dt: any) {
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
