import './cinematics.css';
import { el, letters, clamp, easeOut, easeOutQuint, Clip } from '../../ui/UIKit.ts';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/**
 * The cinematic screen layer: matte bars, fades, cutscene dialogue, the skip
 * prompt, the chapter card and the objective handoff.
 *
 * Deliberately separate from the HUD's own subtitle stack. The HUD hides
 * wholesale during a cutscene (`hud.setVisible(false)` sets `display:none` on
 * its root, subtitles included), so a cutscene that spoke through `ffxv-say`
 * would be mute exactly when it mattered. Out of cutscene, story lines still go
 * through `ffxv-say` / `ffxv-banter` so they sit in the HUD where they belong.
 *
 * Every animated property is written per frame from the accumulated `dt` the
 * caller passes in — no CSS transitions, so a capture after N fixed steps is
 * byte-identical.
 */
export class Letterbox {
  line!: HTMLElement;
  lineR!: HTMLElement;
  lineT!: HTMLElement;
  _onResize!: any;
  active!: boolean;
  bar!: number;
  barMax!: number;
  barTarget!: number;
  bot!: HTMLElement;
  chap!: HTMLElement;
  chapK!: HTMLElement;
  chapN!: HTMLElement;
  chapR!: HTMLElement;
  chapS!: HTMLElement;
  chapState!: any;
  chars!: any[];
  fade!: HTMLElement;
  fadeAmt!: number;
  fadeGoal!: number;
  fadeRate!: number;
  lineSp!: HTMLElement;
  lineState!: Clip | null;
  obj!: HTMLElement;
  objK!: HTMLElement;
  objR!: HTMLElement;
  objS!: HTMLElement;
  objState!: Clip | null;
  objT!: HTMLElement;
  root!: HTMLElement;
  skip!: HTMLElement;
  skipShown!: number;
  top!: HTMLElement;
  uiScale!: number;
  constructor(parent: HTMLElement) {
    this.root = el('div', { id: 'cine' });
    parent.appendChild(this.root);

    this.top = el('div.cine-bar.top');
    this.bot = el('div.cine-bar.bot');
    this.fade = el('div.cine-fade');
    this.root.appendChild(this.top);
    this.root.appendChild(this.bot);
    this.root.appendChild(this.fade);

    this.line = el('div.cine-line');
    this.lineSp = el('div.cl-sp');
    this.lineR = el('div.cl-r');
    this.lineT = el('div.cl-t');
    this.line.appendChild(this.lineSp);
    this.line.appendChild(this.lineR);
    this.line.appendChild(this.lineT);
    this.root.appendChild(this.line);
    this.lineState = null;
    this.chars = [];

    this.skip = el('div.cine-skip', {}, [
      el('div.sk-k', { text: 'ESC' }),
      el('div.sk-l', { text: 'Skip' }),
    ]);
    this.root.appendChild(this.skip);

    this.chap = el('div.chapcard');
    this.chapK = el('div.cc-k');
    this.chapN = el('div.cc-n');
    this.chapR = el('div.cc-r');
    this.chapS = el('div.cc-s');
    this.chap.appendChild(this.chapK);
    this.chap.appendChild(this.chapR);
    this.chap.appendChild(this.chapN);
    this.chap.appendChild(this.chapS);
    this.root.appendChild(this.chap);
    this.chapState = null;

    this.obj = el('div.objcard');
    this.objK = el('div.ob-k');
    this.objR = el('div.ob-r');
    this.objT = el('div.ob-t');
    this.objS = el('div.ob-s');
    this.obj.appendChild(this.objK);
    this.obj.appendChild(this.objR);
    this.obj.appendChild(this.objT);
    this.obj.appendChild(this.objS);
    this.root.appendChild(this.obj);
    this.objState = null;

    /** 0..1 target matte height, as a fraction of the viewport. */
    this.barTarget = 0;
    this.bar = 0;
    this.barMax = 0.115;                 // ~2.39:1 out of 16:9
    this.fadeAmt = 0;
    this.fadeGoal = 0;
    this.fadeRate = 1;
    this.skipShown = 0;
    this.active = false;

    this._scale();
    this._onResize = () => this._scale();
    window.addEventListener('resize', this._onResize);
    this.root.style.display = 'none';
  }

  /** The UI is authored at 1600x900; scale it the way the HUD does. */
  _scale() {
    const s = clamp(Math.min(window.innerWidth / 1600, window.innerHeight / 900), 0.72, 1.5);
    // bars and fades must stay in *screen* units, so only the type is zoomed
    for (const n of [this.line, this.chap, this.obj, this.skip]) n.style.zoom = s.toFixed(4);
    this.uiScale = s;
  }

  /* ------------------------------------------------------------- matte -- */

  /** @param v 0 = no matte, 1 = full 2.39:1 bars */
  setBars(v: number) { this.barTarget = clamp(v, 0, 1); }

  /** Snap the matte with no travel (used on a hard cut into a scene). */
  snapBars(v: number) { this.barTarget = this.bar = clamp(v, 0, 1); }

  /**
   * Fade to or from a flat colour.
   * @param to 0 = clear, 1 = opaque
   * @param [dur=1] seconds
   * @param [colour='black']
   */
  setFade(to: number, dur: number = 1, colour: 'black' | 'white' = 'black') {
    this.fade.classList.toggle('white', colour === 'white');
    this.fadeGoal = clamp(to, 0, 1);
    this.fadeRate = 1 / Math.max(0.016, dur);
  }

  /** Jump the fade with no travel. */
  snapFade(v: number, colour = 'black') {
    this.fade.classList.toggle('white', colour === 'white');
    this.fadeAmt = this.fadeGoal = clamp(v, 0, 1);
  }

  /* ---------------------------------------------------------- dialogue -- */

  /**
   * Show one cutscene line.
   * @param who speaker name; null renders as an aside
   * @param [dur] seconds on screen; defaults to reading speed
   */
  say(who: string | null, text: string, dur?: number) {
    if (!text) return;
    this.lineSp.textContent = who || '';
    this.lineSp.style.display = who ? '' : 'none';
    this.line.classList.toggle('aside', !who);
    while (this.lineT.firstChild) this.lineT.removeChild(this.lineT.firstChild);
    this.chars = [];
    for (const ch of text) {
      const s = el('span.ch', { text: ch });
      this.lineT.appendChild(s);
      this.chars.push(s);
    }
    // 13.5 characters a second is a comfortable read and roughly the pace a
    // performance would land on; the floor stops one-word lines flashing past.
    const secs = dur ?? clamp(1.15 + text.length / 13.5, 2.0, 8.5);
    this.lineState = new Clip(0.42, secs);
  }

  /** Clear the current line immediately. */
  clearLine() { this.lineState = null; this.line.style.opacity = '0'; }

  /* ------------------------------------------------------------- cards -- */

  /**
   * The chapter card. `kind` picks the wording: `open` for a chapter start,
   * `complete` for the closing flourish.
   * @param n chapter number
   * @param name chapter title
   * @param [sub] region / subtitle line
   * @param [kind='open']
   */
  chapterCard(n: number, name: string, sub: string = '', kind: 'open' | 'complete' = 'open') {
    this.chapK.textContent = kind === 'complete'
      ? `Chapter ${ROMAN[n] || n} Complete`
      : `Chapter ${ROMAN[n] || n}`;
    this.chapS.textContent = sub;
    while (this.chapN.firstChild) this.chapN.removeChild(this.chapN.firstChild);
    const l = letters(String(name).toUpperCase(), 'span.ch');
    this.chapN.appendChild(l.node);
    this.chapState = { chars: l.chars, clip: new Clip(1.35, kind === 'complete' ? 2.9 : 2.4) };
    this.root.style.display = '';
  }

  /**
   * The objective handoff that follows a chapter transition.
   * @param title quest name
   * @param sub current objective
   */
  objective(title: string, sub: string) {
    this.objK.textContent = 'Objective';
    this.objT.textContent = title;
    this.objS.textContent = sub || '';
    this.objState = new Clip(0.9, 3.2);
    this.root.style.display = '';
  }

  /* -------------------------------------------------------------- tick -- */

  /**
   * @param dt seconds
   * @param playing true while a cutscene owns the screen
   */
  update(dt: number, playing: boolean) {
    const busy = playing || this.bar > 0.002 || this.fadeAmt > 0.002
      || this.lineState || this.chapState || this.objState;
    this.root.style.display = busy ? '' : 'none';
    if (!busy) { this.active = false; return; }
    this.active = true;

    // ---- matte: 0.55 s in, 0.4 s out. Bars close faster than they open, which
    // is what makes a cutscene feel like it *begins* rather than fades up.
    const rate = this.barTarget > this.bar ? dt / 0.55 : -dt / 0.40;
    this.bar = clamp(this.bar + rate, 0, 1);
    const h = (easeOutQuint(this.bar) * this.barMax * 100).toFixed(3);
    this.top.style.height = `${h}%`;
    this.bot.style.height = `${h}%`;

    // ---- fade
    const fr = this.fadeGoal > this.fadeAmt ? dt * this.fadeRate : -dt * this.fadeRate;
    this.fadeAmt = clamp(this.fadeAmt + fr, 0, 1);
    this.fade.style.opacity = this.fadeAmt.toFixed(4);

    // ---- skip prompt rides just inside the lower bar
    const sk = clamp(this.skipShown + (playing ? dt / 0.8 : -dt / 0.3), 0, 1);
    this.skipShown = sk;
    this.skip.style.opacity = (easeOut(sk) * 0.9).toFixed(3);
    this.skip.style.bottom = `${(this.bar * this.barMax * 100 * 0.5 + 1.6).toFixed(2)}%`;

    this._line(dt);
    this._chapter(dt);
    this._objective(dt);
  }

  _line(dt: number) {
    const s = this.lineState;
    if (!s) { this.line.style.opacity = '0'; return; }
    s.step(dt);
    if (!s.alive) { this.lineState = null; this.line.style.opacity = '0'; return; }
    const age = s.age;
    const out = clamp((age - (s.dur + s.hold - 0.42)) / 0.42, 0, 1);
    this.lineSp.style.opacity = easeOut(clamp(age / 0.28, 0, 1)).toFixed(3);
    this.lineR.style.width = `${(easeOutQuint(clamp((age - 0.08) / 0.46, 0, 1)) * 58).toFixed(0)}px`;
    for (let i = 0; i < this.chars.length; i++) {
      const t = clamp((age - 0.18 - i * 0.0115) / 0.22, 0, 1);
      this.chars[i].style.opacity = t.toFixed(3);
    }
    this.line.style.opacity = (1 - out).toFixed(3);
    // rides up 8 px on entry, sinks 5 px on exit — reads as a beat, not a swap
    const rise = (1 - easeOut(clamp(age / 0.36, 0, 1))) * 8 + out * 5;
    this.line.style.transform = `translateX(-50%) translateY(${rise.toFixed(2)}px)`;
    // the line sits above the lower matte, wherever the matte currently is
    this.line.style.bottom = `${(9.5 + this.bar * this.barMax * 100 * 0.62).toFixed(2)}%`;
  }

  _chapter(dt: number) {
    const s = this.chapState;
    if (!s) { this.chap.style.opacity = '0'; return; }
    s.clip.step(dt);
    if (!s.clip.alive) { this.chapState = null; this.chap.style.opacity = '0'; return; }
    const age = s.clip.age;
    const out = clamp((age - (s.clip.dur + s.clip.hold - 0.85)) / 0.85, 0, 1);
    this.chapK.style.opacity = easeOut(clamp(age / 0.5, 0, 1)).toFixed(3);
    this.chapK.style.letterSpacing = `${(0.44 + 0.22 * easeOutQuint(clamp(age / 1.2, 0, 1))).toFixed(3)}em`;
    this.chapR.style.width = `${(easeOutQuint(clamp((age - 0.22) / 1.0, 0, 1)) * 300).toFixed(0)}px`;
    for (let i = 0; i < s.chars.length; i++) {
      const lt = clamp((age - 0.42 - i * 0.042) / 0.6, 0, 1);
      const e = easeOutQuint(lt);
      s.chars[i].style.opacity = e.toFixed(3);
      s.chars[i].style.transform = `translateY(${((1 - e) * 14).toFixed(2)}px)`;
      s.chars[i].style.filter = lt < 1 ? `blur(${((1 - e) * 4.5).toFixed(2)}px)` : '';
    }
    this.chapS.style.opacity = easeOut(clamp((age - 0.95) / 0.6, 0, 1)).toFixed(3);
    this.chap.style.opacity = (1 - out).toFixed(3);
    this.chap.style.transform = `translateY(${(-out * 8).toFixed(2)}px)`;
  }

  _objective(dt: number) {
    const s = this.objState;
    if (!s) { this.obj.style.opacity = '0'; return; }
    s.step(dt);
    if (!s.alive) { this.objState = null; this.obj.style.opacity = '0'; return; }
    const age = s.age;
    const out = clamp((age - (s.dur + s.hold - 0.6)) / 0.6, 0, 1);
    const e = easeOutQuint(s.t);
    this.objK.style.opacity = easeOut(clamp(age / 0.3, 0, 1)).toFixed(3);
    this.objR.style.width = `${(e * 210).toFixed(0)}px`;
    this.objT.style.opacity = easeOut(clamp((age - 0.22) / 0.5, 0, 1)).toFixed(3);
    this.objS.style.opacity = easeOut(clamp((age - 0.44) / 0.5, 0, 1)).toFixed(3);
    this.obj.style.opacity = (1 - out).toFixed(3);
    this.obj.style.transform = `translateX(${((1 - e) * -14).toFixed(2)}px)`;
  }

  /** Wipe every transient so a scene never inherits the previous one's state. */
  reset() {
    this.lineState = null;
    this.chapState = null;
    this.objState = null;
    this.skipShown = 0;
    this.bar = this.barTarget = 0;
    this.fadeAmt = this.fadeGoal = 0;
  }
}

export { ROMAN };
export default Letterbox;
