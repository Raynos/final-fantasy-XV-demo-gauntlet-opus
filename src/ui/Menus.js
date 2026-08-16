import './ui.css';
import { el, clamp, easeOut, easeOutQuint } from './UIKit.js';
import { button } from './Icons.js';
import { MainScreen } from './screens/MainScreen.js';
import { InventoryScreen } from './screens/InventoryScreen.js';
import { AscensionScreen } from './screens/AscensionScreen.js';
import { MapScreen } from './screens/MapScreen.js';
import { GearScreen } from './screens/GearScreen.js';
import { PhotoScreen } from './screens/PhotoScreen.js';

const FOOT = {
  default: [['↑↓', 'Select'], ['Enter', 'Confirm'], ['Esc', 'Back']],
  main: [['↑↓', 'Select'], ['Enter', 'Confirm'], ['Tab', 'Close']],
  ascension: [['↑↓←→', 'Navigate'], ['Enter', 'Unlock'], ['Esc', 'Back']],
  photo: [['↑↓', 'Filter'], ['←→', 'Aperture'], ['Space', 'Shoot'], ['Esc', 'Exit']],
};

/**
 * Full-screen menu stack.
 *
 * `setScreen(name|null)` is the whole public surface — `main`, `inventory`,
 * `ascension`, `map`, `gear`, `photo`. Screens cross-fade through a shared
 * chrome (blurred game frame, heading, footer prompts) and are driven per
 * frame from `game.time`, never CSS transitions, so captures are deterministic.
 *
 * Keyboard: Tab toggles the main menu, arrows/WASD navigate, Enter confirms,
 * Escape goes back. Gamepad: d-pad + A/B, Start toggles.
 */
export class Menus {
  /** @param {object} game */
  async init(game) {
    this.game = game;
    this.root = el('div', { id: 'menus' });
    game.uiRoot.appendChild(this.root);

    this.scrim = el('div.menu-scrim');
    this.grain = el('div.menu-grain');
    this.wrap = el('div.menu-wrap');
    this.root.appendChild(this.scrim);
    this.root.appendChild(this.grain);
    this.root.appendChild(this.wrap);

    this.head = el('div.menu-head');
    this.headT = el('div.mh-t');
    this.headS = el('div.mh-s');
    this.headR = el('div.mh-r');
    this.head.appendChild(this.headT);
    this.head.appendChild(this.headS);
    this.head.appendChild(this.headR);
    this.wrap.appendChild(this.head);

    this.foot = el('div.menu-foot');
    this.footRule = el('div.rule');
    this.foot.appendChild(this.footRule);
    this.wrap.appendChild(this.foot);

    this.screens = {
      main: new MainScreen(this),
      inventory: new InventoryScreen(this),
      ascension: new AscensionScreen(this),
      map: new MapScreen(this),
      gear: new GearScreen(this),
      photo: new PhotoScreen(this),
    };
    for (const k of Object.keys(this.screens)) {
      const s = this.screens[k];
      s.node = el(`div.screen.s-${k}`);
      s.node.style.display = 'none';
      this.wrap.appendChild(s.node);
      s.build(s.node, game);
    }

    this.name = null;
    this.shown = null;
    this.pending = null;
    this.a = 0;              // 0..1 open amount
    this.stack = [];
    this.open = false;
    this._scale();
    this._onResize = () => this._scale();
    window.addEventListener('resize', this._onResize);
    this._renderFoot('default');
  }

  _scale() {
    const s = clamp(Math.min(window.innerWidth / 1600, window.innerHeight / 900), 0.72, 1.5);
    this.wrap.style.zoom = s.toFixed(4);
  }

  _renderFoot(kind) {
    if (this._foot === kind) return;
    this._foot = kind;
    while (this.foot.childNodes.length > 1) this.foot.removeChild(this.foot.lastChild);
    for (const [key, label] of FOOT[kind] || FOOT.default) {
      this.foot.appendChild(el('div.prompt.key', {}, [
        button(key, { size: key.length > 2 ? 24 : 20 }), el('div.lb', { text: label }),
      ]));
    }
  }

  /**
   * Show a screen, or `null` to close. Transitions are animated; calling this
   * with the current name is a no-op.
   * @param {string|null} name
   */
  setScreen(name) {
    if (name === this.name && !this.pending) return;
    if (!name) { this.pending = null; this.name = null; this.stack.length = 0; return; }
    const s = this.screens[name];
    if (!s) { console.warn(`[Menus] unknown screen: ${name}`); return; }
    if (this.name && this.a > 0.02) { this.pending = name; }
    else { this._activate(name); }
  }

  /** Push a screen, remembering where to return to on Escape. */
  push(name) { if (this.name) this.stack.push(this.name); this.setScreen(name); }

  /** Pop back to the previous screen, or close. */
  back() { this.setScreen(this.stack.length ? this.stack.pop() : null); }

  /** Take the currently displayed screen off-screen. */
  _hideShown() {
    const s = this.screens[this.shown];
    if (!s) return;
    s.node.style.display = 'none';
    if (s.exit) s.exit();
    this.shown = null;
  }

  _activate(name) {
    this._hideShown();
    this.name = name;
    this.shown = name;
    this.pending = null;
    const s = this.screens[name];
    s.node.style.display = '';
    if (s.enter) s.enter(this.game);
    this.headT.textContent = s.title || name;
    this.headS.textContent = s.sub || '';
    this._renderFoot(FOOT[name] ? name : 'default');
    this.head.style.display = s.chrome === false ? 'none' : '';
    this.foot.style.display = s.chrome === false ? 'none' : '';
  }

  /** @param {number} dt @param {object} game */
  update(dt, game) {
    this._input(game);

    // a queued screen swap drives the current one out first, then back in
    const target = this.name && !this.pending ? 1 : 0;
    const rate = dt / 0.34;
    this.a = clamp(this.a + (target > this.a ? rate : -rate * 1.5), 0, 1);
    if (this.pending && this.a < 0.06) this._activate(this.pending);

    this.open = this.a > 0.004;
    if (!this.open && !this.pending) this._hideShown();
    this.root.style.display = this.open ? '' : 'none';
    this.root.classList.toggle('on', this.a > 0.5);
    const hud = game.get?.('HUD');
    if (hud?.setMenuOpen) hud.setMenuOpen(this.a > 0.12);
    if (!this.open) return;

    const e = easeOutQuint(this.a);
    // photo mode is a camera — it must not blur or dim the frame it is framing
    const clean = this.screens[this.name]?.scrim === false;
    this.scrim.style.opacity = (e * (clean ? 0.30 : 1)).toFixed(3);
    this.scrim.style.backdropFilter = clean ? 'none'
      : `blur(${(e * 26).toFixed(1)}px) saturate(${(1 - e * 0.42).toFixed(3)}) brightness(${(1 - e * 0.46).toFixed(3)})`;
    this.scrim.style.webkitBackdropFilter = this.scrim.style.backdropFilter;
    this.grain.style.opacity = (e * (clean ? 0 : 0.5)).toFixed(3);

    this.headT.style.opacity = easeOut(clamp((this.a - 0.1) / 0.6, 0, 1)).toFixed(3);
    this.headT.style.letterSpacing = `${(0.62 - 0.18 * e).toFixed(3)}em`;
    this.headS.style.opacity = easeOut(clamp((this.a - 0.25) / 0.6, 0, 1)).toFixed(3);
    this.headR.style.width = `${(easeOutQuint(clamp((this.a - 0.2) / 0.7, 0, 1)) * 300).toFixed(0)}px`;
    this.foot.style.opacity = easeOut(clamp((this.a - 0.3) / 0.6, 0, 1)).toFixed(3);
    this.foot.style.transform = `translateY(${((1 - e) * 12).toFixed(2)}px)`;

    const s = this.screens[this.name];
    if (s) s.update(dt, game, this.a);
  }

  _input(game) {
    const inp = game.input;
    if (!inp) return;
    const down = (c) => inp.keyDown?.(c);
    const gp = (i) => inp.gamepad?.buttons?.[i]?.pressed;
    const edge = (k, v) => { const p = this._gpPrev?.[k]; (this._gpPrev = this._gpPrev || {})[k] = v; return v && !p; };

    if (down('Tab') || edge('start', gp(9))) {
      if (this.name) this.setScreen(null); else { this.stack.length = 0; this.setScreen('main'); }
      return;
    }
    if (down('KeyC') && !this.name) { this.stack.length = 0; this.setScreen('photo'); return; }
    if (!this.name) return;

    if (down('Escape') || edge('b', gp(1))) { this.back(); return; }

    let dx = 0, dy = 0;
    if (down('ArrowUp') || down('KeyW') || edge('dU', gp(12))) dy -= 1;
    if (down('ArrowDown') || down('KeyS') || edge('dD', gp(13))) dy += 1;
    if (down('ArrowLeft') || down('KeyA') || edge('dL', gp(14))) dx -= 1;
    if (down('ArrowRight') || down('KeyD') || edge('dR', gp(15))) dx += 1;
    const s = this.screens[this.name];
    if ((dx || dy) && s?.nav) s.nav(dx, dy);
    if ((down('Enter') || down('Space') || edge('a', gp(0))) && s?.accept) s.accept();
  }
}
