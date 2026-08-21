import { el, clamp, easeOut, easeOutQuint, Clip } from './UIKit.js';

/**
 * Lower-third dialogue subtitles with a speaker name, plus the party-banter
 * bubble stack that pops in the lower-left during exploration.
 *
 * ### Lines belong to the shot that spoke them
 *
 * A capture applies a shot, which tears down whatever scene was talking — but
 * the half-finished line it left on screen has no owner left to retire it, so
 * it burns into the next frame. `menu_title` captured after `cine_opening` came
 * back with "For the record, nobody was listening." across the title card.
 *
 * So every line and bubble is stamped with `game.currentShot` at the moment it
 * is spoken, and anything whose stamp no longer matches is dropped. Stamping at
 * *say* time rather than clearing on the transition is what makes cutscenes keep
 * working: `Game.applyShot` sets `currentShot` and then seeks the timeline, so a
 * beat that fires during the seek is already stamped with the new shot and
 * survives. In ordinary play `currentShot` is always `null` and this is inert.
 */
export class Subtitles {
  /**
   * @param {HTMLElement} parent full-screen layer for the lower third
   * @param {object} [game]
   * @param {HTMLElement} [banterParent] the bottom-left corner's banter slot,
   *   owned by `PartyPanel`. Without it the bubbles fall back to this layer and
   *   the stylesheet's absolute placement, which is what they used to do.
   */
  constructor(parent, game, banterParent) {
    this.game = game || null;
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
    if (banterParent) { this.banter.classList.add('inflow'); banterParent.appendChild(this.banter); }
    else this.root.appendChild(this.banter);
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
    this.cur.shot = this._shot();
  }

  /** The shot this line belongs to — see the class note. @returns {string|null} */
  _shot() { return this.game?.currentShot || null; }

  /** Drop the current line and every banter bubble immediately. */
  clear() {
    this.cur = null;
    this.subs.style.opacity = '0';
    for (const b of this.bubbles) if (b.node.parentNode) b.node.parentNode.removeChild(b.node);
    this.bubbles.length = 0;
  }

  /** Pop a party-banter bubble. @param {string} who @param {string} line */
  bant(who, line) {
    if (!line) return;
    const node = el('div.bb', {}, [
      el('div.bw', { text: who || '' }),
      el('div.bl', { text: line }),
    ]);
    this.banter.appendChild(node);
    this.bubbles.push({ node, clip: new Clip(0.4, 4.2), shot: this._shot() });
    while (this.bubbles.length > 3) {
      const old = this.bubbles.shift();
      if (old.node.parentNode) old.node.parentNode.removeChild(old.node);
    }
  }

  /** @param {number} dt seconds */
  update(dt) {
    // retire anything left over from a shot that is no longer on screen
    const shot = this._shot();
    if (this.cur && this.cur.shot !== shot) { this.cur = null; this.subs.style.opacity = '0'; }
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      if (this.bubbles[i].shot === shot) continue;
      const b = this.bubbles.splice(i, 1)[0];
      if (b.node.parentNode) b.node.parentNode.removeChild(b.node);
    }

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
