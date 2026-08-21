import './ui.css';
import { el, clamp } from './UIKit.js';
import { PartyPanel } from './PartyPanel.js';
import { WeaponWheel } from './WeaponWheel.js';
import { CompassBar } from './CompassBar.js';
import { CombatHUD } from './CombatHUD.js';
import { Prompts } from './Prompts.js';
import { ScreenFX } from './ScreenFX.js';
import { Subtitles } from './Subtitles.js';
import { Toasts } from './Toasts.js';
import { Hints } from './Hints.js';
import { HudBridge } from './HudBridge.js';
import { SHOTS } from '../game/Shots.js';
import { BANTER } from './GameData.js';

/**
 * The heads-up display.
 *
 * Layout is DOM/CSS over the canvas for crisp type, composited into the frame
 * with blur-behind plates, drop shadows and hairlines. Every animated value is
 * written per frame from `game.time` — there are no CSS transitions anywhere in
 * `src/ui`, so a capture after N fixed sim steps is reproducible.
 *
 * Cross-system reads are all optional-chained: `Combat`, `Enemies`, `Party` and
 * `Director` are being built in parallel, so the HUD falls back to plausible
 * data from `GameData.js` and still renders.
 *
 * ### API other systems can call
 * - `hud.damage({ world, amount, crit, kind })` — floating damage number
 * - `hud.callOut(word, sub)` — BLINDSIDE! / PARRY! / LINK-STRIKE banner
 * - `hud.setLockOn(target|null)` — target needs `.position` (or `.pos`) and `.height`
 * - `hud.setArmiger(0..1)`
 * - `hud.areaTitle(name, sub, meta)` — region title card
 * - `hud.say(who, line)` / `hud.banter(who, line)`
 * - `hud.levelUp(n)` / `hud.hit(0..1)`
 *
 * The same things are reachable as window CustomEvents so nothing has to import
 * the HUD: `ffxv-damage`, `ffxv-callout`, `ffxv-area`, `ffxv-say`,
 * `ffxv-banter`, `ffxv-hit`.
 */
export class HUD {
  /** @param {object} game */
  async init(game) {
    this.game = game;
    this.root = el('div', { id: 'hud' });
    game.uiRoot.appendChild(this.root);

    // `PartyPanel` owns the bottom-left corner and hands out the two slots the
    // Armiger/technique rail and the toast column live in, so nothing down
    // there is positioned by hand-measured offsets any more.
    this.party = new PartyPanel(this.root);
    this.wheel = new WeaponWheel(this.root);
    this.compass = new CompassBar(this.root);
    this.combat = new CombatHUD(this.root, this.party.combatSlot);
    this.prompts = new Prompts(this.root);
    this.subtitles = new Subtitles(this.root);
    this.toasts = new Toasts(this.party.noticeSlot);
    this.fx = new ScreenFX(game.uiRoot);
    // Hints sit in their own layer above the menus, so the "how do I get out
    // of here" hint is readable over a full-screen screen. They never appear
    // during a capture.
    this.hints = new Hints(game.uiRoot);

    this.visible = true;
    this.menuOpen = false;
    this.fieldA = 0;
    this.combatA = 0;
    this.mode = 'field';
    this._banterAt = 0.30;

    this._onResize = () => this._scale();
    window.addEventListener('resize', this._onResize);
    this._scale();

    window.addEventListener('ffxv-damage', (e) => this.combat.damage(e.detail));
    window.addEventListener('ffxv-callout', (e) => this.combat.callOut(e.detail?.word, e.detail?.sub));

    // Combat and RPG events -> damage numbers, call-outs, toasts, level-ups.
    this.bridge = new HudBridge(this);
    this.bridge.attach(game);
  }

  /** Push a line onto the notification column. @param {string} k @param {string} v */
  toast(k, v, ico, tone) { this.toasts.push(k, v, ico, tone); }

  /** UI is authored at 1600x900; scale it crisply for other viewport sizes. */
  _scale() {
    const s = clamp(Math.min(window.innerWidth / 1600, window.innerHeight / 900), 0.72, 1.5);
    this.root.style.zoom = s.toFixed(4);
    this.fx.root.style.zoom = s.toFixed(4);
    if (this.hints) this.hints.root.style.zoom = s.toFixed(4);
    this.uiScale = s;
  }

  /** @param {boolean} v show/hide the field HUD */
  setVisible(v) { this.visible = !!v; }

  /** Menus dim and suppress the HUD while open. @param {boolean} v */
  setMenuOpen(v) { this.menuOpen = !!v; }

  // ---- forwarded API --------------------------------------------------
  /** @param {object} ev see class docs */
  damage(ev) { this.combat.damage(ev); }
  /** @param {string} word @param {string} [sub] */
  callOut(word, sub) { this.combat.callOut(word, sub); }
  /** @param {object|null} t */
  setLockOn(t) { this.combat.setLockOn(t); }
  /** @param {number} v 0..1 */
  setArmiger(v) { this.combat.setArmiger(v); }
  /** @param {string} name @param {string} [sub] @param {string} [meta] */
  areaTitle(name, sub, meta) { this.fx.areaTitle(name, sub, meta); }
  /** @param {string} who @param {string} line @param {number} [dur] */
  say(who, line, dur) { this.subtitles.say(who, line, dur); }
  /** @param {string} who @param {string} line */
  banter(who, line) { this.subtitles.bant(who, line); }
  /** @param {number} n */
  levelUp(n) { this.fx.levelUp(n); }
  /** @param {number} amount 0..1 */
  hit(amount) { this.fx.hit(amount); }

  /** Rewind every demo/fallback animation. Used by the capture harness. */
  resetDemo() {
    this.combat.resetDemo();
    this.fx.cardState = null;
    this.fx.luState = null;
    this.fx.flashAmt = 0;
    this.subtitles.cur = null;
    for (const b of this.subtitles.bubbles) b.node.remove();
    this.subtitles.bubbles.length = 0;
    this.toasts.clear();
    this.hints.reset();
    if (this.bridge) this.bridge._lastCall = -99;
    this._banterAt = this.game.time.now + 0.30;
    this.fieldA = 0; this.combatA = 0;
  }

  /** Current gameplay mode, tolerant of a not-yet-written Director. */
  _resolveMode() {
    const g = this.game;
    const dir = g.get?.('Director');
    const s = dir?.scenario || dir?.mode || dir?.state;
    // `Director.play()` sets 'live' for a real, unscripted encounter. Without
    // this the combat HUD only ever appeared in the posed capture scenarios.
    if (s === 'live') return g.get?.('Combat')?.inCombat ? 'combat' : 'field';
    if (typeof s === 'string') return s;
    if (g.get?.('Combat')?.inCombat) return 'combat';
    const shot = SHOTS[g.currentShot];
    return shot?.scenario || 'field';
  }

  /** @param {number} dt @param {object} game */
  lateUpdate(dt, game) {
    // First-run hints run outside the HUD's own visibility, because the one
    // about closing a menu has to show while the HUD itself is faded out.
    this.hints.muted = !!game.currentShot;
    this.hints.update(dt, game);

    const mode = this._resolveMode();
    this.mode = mode;
    const fighting = mode === 'combat';

    // The combat layer follows combat state rather than the field toggle, so a
    // fight always shows its reticle/nameplates even if the field HUD is off.
    const fieldTarget = (this.visible || fighting) && !this.menuOpen ? 1 : 0;
    const combatTarget = fighting && !this.menuOpen ? 1 : 0;
    const rate = dt / 0.42;
    this.fieldA = clamp(this.fieldA + (fieldTarget > this.fieldA ? rate : -rate * 1.6), 0, 1);
    this.combatA = clamp(this.combatA + (combatTarget > this.combatA ? rate : -rate * 1.6), 0, 1);

    this.root.style.display = this.fieldA <= 0.001 && this.combatA <= 0.001 ? 'none' : '';

    this.party.update(dt, game, this.fieldA);
    this.wheel.update(dt, game, this.fieldA * (1 - this.combatA * 0.0));
    this.compass.update(dt, game, this.fieldA * (1 - this.combatA));
    this.prompts.update(dt, game, mode, this.fieldA);
    this.combat.update(dt, game, this.combatA);
    this.subtitles.update(dt);
    this.toasts.update(dt, this.fieldA);
    // the cinematic edge darkening is part of the HUD frame — it must not tint
    // shots that have the HUD switched off (vistas, hero shots, other agents')
    this.fx.setCinematic((0.46 + this.combatA * 0.12) * Math.max(this.fieldA, this.combatA));
    this.fx.update(dt, game);

    // banter belongs to exploration, and it yields to an area title card
    const busy = fighting || !!this.fx.cardState || !!this.subtitles.cur;
    this.subtitles.banter.style.display = busy ? 'none' : '';

    // ambient party banter while exploring — keeps the field frame alive
    if (!busy && !this.menuOpen && this.fieldA > 0.9 && game.time.now > this._banterAt) {
      const b = BANTER[(this._banterN = (this._banterN || 0) + 1) % BANTER.length];
      this.banter(b.who, b.line);
      this._banterAt = game.time.now + 14;
    }
  }
}
