import { el, clamp, easeOut, easeOutQuint, Clip } from './UIKit.js';

/**
 * Lower-third dialogue subtitles with a speaker name, plus the party-banter
 * bubble stack that pops in the lower-left during exploration.
 */
export class Subtitles {
  /** @param {HTMLElement} parent */
  constructor(parent) {
    this.root = el('div.subs-layer');
    parent.appendChild(this.root);

    this.subs = el('div.subs');
    this.spk = el('div.sp');
    this.rule = el('div.sr');
    this.line = el('div.ln');
    this.subs.appendChild(this.spk);
    this.subs.appendChild(this.rule);
    this.subs.appendChild(this.line);
    this.root.appendChild(this.subs);
    this.cur = null;

    this.banter = el('div.banter');
    this.root.appendChild(this.banter);
    this.bubbles = [];

    window.addEventListener('ffxv-say', (e) => this.say(e.detail?.who, e.detail?.line, e.detail?.dur));
    window.addEventListener('ffxv-banter', (e) => this.bant(e.detail?.who, e.detail?.line));
  }

  /**
   * Show a lower-third subtitle.
   * @param {string} who speaker name
   * @param {string} line dialogue
   * @param {number} [dur] seconds on screen
   */
  say(who, line, dur) {
    if (!line) return;
    this.spk.textContent = who || '';
    this.line.textContent = '';
    this.chars = [];
    for (const ch of line) {
      const s = el('span', { text: ch });
      s.style.display = 'inline-block';
      s.style.whiteSpace = 'pre';
      this.line.appendChild(s);
      this.chars.push(s);
    }
    const secs = dur ?? clamp(1.4 + line.length * 0.045, 2.2, 7);
    this.cur = new Clip(0.34, secs);
  }

  /** Pop a party-banter bubble. @param {string} who @param {string} line */
  bant(who, line) {
    if (!line) return;
    const node = el('div.bb', {}, [
      el('div.bw', { text: who || '' }),
      el('div.bl', { text: line }),
    ]);
    this.banter.appendChild(node);
    this.bubbles.push({ node, clip: new Clip(0.4, 4.2) });
    while (this.bubbles.length > 3) {
      const old = this.bubbles.shift();
      if (old.node.parentNode) old.node.parentNode.removeChild(old.node);
    }
  }

  /** @param {number} dt seconds */
  update(dt) {
    const c = this.cur;
    if (!c) this.subs.style.opacity = '0';
    else {
      c.step(dt);
      if (!c.alive) { this.cur = null; this.subs.style.opacity = '0'; }
      else {
        const age = c.age;
        const out = clamp((age - (c.dur + c.hold - 0.35)) / 0.35, 0, 1);
        this.spk.style.opacity = easeOut(clamp(age / 0.24, 0, 1)).toFixed(3);
        this.rule.style.width = `${(easeOutQuint(clamp((age - 0.06) / 0.4, 0, 1)) * 46).toFixed(0)}px`;
        for (let i = 0; i < this.chars.length; i++) {
          const t = clamp((age - 0.16 - i * 0.011) / 0.2, 0, 1);
          this.chars[i].style.opacity = t.toFixed(3);
        }
        this.subs.style.opacity = (1 - out).toFixed(3);
        this.subs.style.transform = `translateX(-50%) translateY(${((1 - easeOut(clamp(age / 0.3, 0, 1))) * 10 + out * 6).toFixed(1)}px)`;
      }
    }

    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.clip.step(dt);
      if (!b.clip.alive) {
        if (b.node.parentNode) b.node.parentNode.removeChild(b.node);
        this.bubbles.splice(i, 1);
        continue;
      }
      const age = b.clip.age;
      const out = clamp((age - (b.clip.dur + b.clip.hold - 0.4)) / 0.4, 0, 1);
      const e = easeOutQuint(b.clip.t);
      b.node.style.opacity = ((1 - out) * e).toFixed(3);
      b.node.style.transform = `translateX(${((1 - e) * -18).toFixed(2)}px)`;
    }
  }
}
