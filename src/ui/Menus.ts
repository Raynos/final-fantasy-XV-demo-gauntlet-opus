import './ui.css';
import { el, clamp, easeOut, easeOutQuint } from './UIKit.ts';
import { button } from './Icons.ts';
import { MainScreen } from './screens/MainScreen.ts';
import { InventoryScreen } from './screens/InventoryScreen.ts';
import { AscensionScreen } from './screens/AscensionScreen.ts';
import { MapScreen } from './screens/MapScreen.ts';
import { WorldMapScreen } from './screens/WorldMapScreen.ts';
import { GearScreen } from './screens/GearScreen.ts';
import { PhotoScreen } from './screens/PhotoScreen.ts';
import { QuestScreen } from './screens/QuestScreen.ts';
import { ArchiveScreen } from './screens/ArchiveScreen.ts';
import { SystemScreen } from './screens/SystemScreen.ts';
import { ControlsScreen } from './screens/ControlsScreen.ts';
import { ArmigerScreen } from './screens/ArmigerScreen.ts';

/**
 * Footer prompt sets.
 *
 * Escape is deliberately *not* the headline back key anywhere. Browsers
 * reserve it to release pointer lock and swallow the keydown, so a footer that
 * promises "Esc — Back" is promising something the browser will eat. Tab and
 * Backspace are advertised instead, because those always arrive.
 */
const FOOT = {
  default: [['↑↓', 'Select'], ['Enter', 'Confirm'], ['Bksp', 'Back'], ['Tab', 'Close']],
  main: [['↑↓', 'Select'], ['Enter', 'Confirm'], ['H', 'Controls'], ['Tab', 'Close']],
  ascension: [['↑↓←→', 'Navigate'], ['Enter', 'Unlock'], ['Bksp', 'Back'], ['Tab', 'Close']],
  photo: [['↑↓', 'Filter'], ['←→', 'Aperture'], ['Space', 'Shoot'], ['Bksp', 'Exit']],
  inventory: [['↑↓', 'Select'], ['←→', 'Category'], ['Enter', 'Use'], ['Bksp', 'Back']],
  gear: [['←→', 'Member'], ['↑↓', 'Slot'], ['Enter', 'Equip'], ['Bksp', 'Back']],
  quests: [['↑↓', 'Select'], ['←→', 'Tab'], ['Enter', 'Track'], ['Bksp', 'Back']],
  archives: [['↑↓', 'Select'], ['←→', 'Section'], ['Bksp', 'Back'], ['Tab', 'Close']],
  system: [['↑↓', 'Select'], ['←→', 'Adjust'], ['Enter', 'Confirm'], ['Bksp', 'Back']],
  controls: [['←→', 'Column'], ['↑↓', 'Row'], ['H', 'Close'], ['Tab', 'Close']],
  armiger: [['↑↓', 'Select'], ['Enter', 'Unlock'], ['Bksp', 'Back'], ['Tab', 'Close']],
  shop: [['↑↓', 'Select'], ['←→', 'Shelf'], ['Enter', 'Deal'], ['Bksp', 'Leave']],
  hunts: [['↑↓', 'Select'], ['←→', 'Ledger'], ['Enter', 'Accept'], ['Bksp', 'Leave']],
  world: [['↑↓←→', 'Navigate'], ['Enter', 'Select'], ['M', 'Close'], ['Tab', 'Close']],
  map_wide: [['↑↓←→', 'Navigate'], ['Enter', 'Select'], ['Bksp', 'Back'], ['Tab', 'Close']],
  map: [['↑↓', 'Marker'], ['Bksp', 'Back'], ['Tab', 'Close']],
};

/**
 * Full-screen menu stack.
 *
 * `setScreen(name|null)` is the whole public surface. Screens cross-fade through
 * a shared chrome (blurred game frame, heading, footer prompts) and are driven
 * per frame from `game.time`, never CSS transitions, so captures stay
 * deterministic.
 *
 * ### Getting out again
 *
 * The single worst thing about the old build was that Escape — the key every
 * player reaches for — is claimed by the browser to release pointer lock, so it
 * never reached the menu. Three things fix that here:
 *
 *  1. **Tab, Backspace and gamepad B/Circle all work as back/close on every
 *     screen**, and the footer says so. Escape still works when it survives.
 *  2. **Pointer lock is only held during gameplay.** Whenever a menu, shop,
 *     conversation or cutscene is up, `Input.setPointerLockAllowed(false)`
 *     releases the mouse; closing everything hands it back, re-acquired on the
 *     next click on the canvas (the user gesture browsers demand).
 *  3. **An unexpected lock exit opens the pause menu** instead of dumping the
 *     player into a live world with a dead mouse — so pressing Escape out of
 *     pointer lock does, in practice, open the menu after all.
 *
 * ### Global bindings this owns
 * `Tab` menu · `H` controls card · `M` world map · `C` photo mode. All three of
 * the latter toggle: press again (or Tab / Backspace / B) to close.
 */
export class Menus {
  _foot!: any;
  _gpPrev!: any;
  _lockHeld!: boolean | null;
  _onResize!: any;
  a!: number;
  foot!: any;
  footRule!: any;
  game!: any;
  grain!: any;
  head!: any;
  headR!: any;
  headS!: any;
  headT!: any;
  name!: any;
  open!: boolean;
  pending!: any;
  root!: any;
  screens!: any;
  scrim!: any;
  shown!: any;
  stack!: any[];
  wrap!: any;
  async init(game: any) {
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
      armiger: new ArmigerScreen(this),
      map: new MapScreen(this),
      world: new WorldMapScreen(this),
      // the same chart at the fit-all scale with the survey complete — the
      // continent on one sheet, which is what `menu_map_wide` wants
      map_wide: new WorldMapScreen(this, { atlas: true }),
      gear: new GearScreen(this),
      quests: new QuestScreen(this),
      archives: new ArchiveScreen(this),
      system: new SystemScreen(this),
      controls: new ControlsScreen(this),
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
    this._lockHeld = null;   // what we last told Input about pointer lock
    this._inputWas = false;  // did we take `input.enabled` away?
    this._scale();
    this._onResize = () => this._scale();
    window.addEventListener('resize', this._onResize);
    this._renderFoot('default');
  }

  _scale() {
    const s = clamp(Math.min(window.innerWidth / 1600, window.innerHeight / 900), 0.72, 1.5);
    this.wrap.style.zoom = s.toFixed(4);
  }

  _renderFoot(kind: any) {
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
   */
  setScreen(name: string | null) {
    if (name === this.name && !this.pending) return;
    if (!name) { this.pending = null; this.name = null; this.stack.length = 0; return; }
    const s = this.screens[name];
    if (!s) { console.warn(`[Menus] unknown screen: ${name}`); return; }
    if (this.name && this.a > 0.02) { this.pending = name; }
    else { this._activate(name); }
  }

  /** Push a screen, remembering where to return to on back. */
  push(name: any) { if (this.name) this.stack.push(this.name); this.setScreen(name); }

  /**
   * Go back one level: first to whatever modal the current screen is holding
   * (an equip picker, say), then up the stack, then out of the menu entirely.
   */
  back() {
    const s = this.screens[this.name];
    if (s && s.back && s.back()) return;
    this.setScreen(this.stack.length ? this.stack.pop() : null);
  }

  /** Take the currently displayed screen off-screen. */
  _hideShown() {
    const s = this.screens[this.shown];
    if (!s) return;
    s.node.style.display = 'none';
    if (s.exit) s.exit();
    this.shown = null;
  }

  _activate(name: any) {
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

  /**
   * True while anything other than plain gameplay owns the screen: a menu, a
   * conversation, a shop, the title card or a playing cutscene. This is what
   * decides whether the pointer may be locked.
   */
  _uiBusy(game: any) {
    if (this.name) return true;
    const ix = game.get?.('Interaction');
    if (ix && ix.talking) return true;
    const story = game.get?.('Story');
    if (story && (story.title?.shown || story.cine?.playing)) return true;
    return false;
  }

  /**
   * Keep the browser's pointer lock in step with what is on screen, and turn an
   * unexpected exit into an opened pause menu.
   */
  _pointerLock(game: any) {
    const inp = game.input;
    if (!inp || !inp.setPointerLockAllowed) return;
    const busy = this._uiBusy(game);
    if (this._lockHeld !== !busy) {
      this._lockHeld = !busy;
      inp.setPointerLockAllowed(!busy);
    }
    // Escape (or any other route out of the lock) while gameplay wanted it:
    // treat it as the pause request the player almost certainly meant.
    if (inp.consumeLockLost && inp.consumeLockLost() && !busy && !game.currentShot) {
      this.stack.length = 0;
      this.setScreen('main');
    }
    // While a screen is up, gameplay must not read the stick — otherwise the
    // party walks off while you are reading the quest log.
    if (this.name && inp.enabled !== false) { inp.enabled = false; this._inputWas = true; }
    else if (!this.name && this._inputWas) { inp.enabled = true; this._inputWas = false; }
  }

  /** @param dt @param game */
  update(dt: number, game: any) {
    this._input(game);
    this._pointerLock(game);

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

  /**
   * Open a screen straight from a global hotkey: no stack, and pressing the
   * same key again closes it.
   */
  toggleScreen(name: string) {
    // Already here: go back the way we came, so H out of the controls card
    // returns you to the shop you were reading it from rather than the field.
    if (this.name === name) { this.back(); return; }
    if (this.name) { this.push(name); return; }
    this.stack.length = 0;
    this.setScreen(name);
  }

  _input(game: any) {
    const inp = game.input;
    if (!inp) return;
    const down = (c: any) => inp.keyDown?.(c);
    const gp = (i: any) => inp.gamepad?.buttons?.[i]?.pressed;
    const edge = (k: any, v: any) => { const p = this._gpPrev?.[k]; (this._gpPrev = this._gpPrev || {})[k] = v; return v && !p; };
    // read every pad edge every frame, or a button held across a frame where it
    // was not consulted reads as a fresh press the next time it is
    const b = {
      a: edge('a', gp(0)), back: edge('b', gp(1)), start: edge('start', gp(9)),
      up: edge('dU', gp(12)), down: edge('dD', gp(13)),
      left: edge('dL', gp(14)), right: edge('dR', gp(15)),
    };

    // ---- global toggles: work from gameplay *and* from any other screen ----
    // Keyboard only, on purpose: every spare pad face button is a combat verb,
    // and a controller player reaches these in one more press through Start.
    if (down('KeyH')) { this.toggleScreen('controls'); return; }
    if (down('KeyM')) { this.toggleScreen('world'); return; }
    if (down('KeyC') && (!this.name || this.name === 'photo')) { this.toggleScreen('photo'); return; }

    if (down('Tab') || b.start) {
      if (this.name) this.setScreen(null); else { this.stack.length = 0; this.setScreen('main'); }
      return;
    }
    if (!this.name) return;

    // Escape is included but never load-bearing: the browser eats it while the
    // pointer is locked, which is why Backspace and B exist here.
    if (down('Escape') || down('Backspace') || b.back) { this.back(); return; }

    let dx = 0, dy = 0;
    if (down('ArrowUp') || down('KeyW') || b.up) dy -= 1;
    if (down('ArrowDown') || down('KeyS') || b.down) dy += 1;
    if (down('ArrowLeft') || down('KeyA') || b.left) dx -= 1;
    if (down('ArrowRight') || down('KeyD') || b.right) dx += 1;
    const s = this.screens[this.name];
    if ((dx || dy) && s?.nav) s.nav(dx, dy);
    if ((down('Enter') || down('Space') || b.a) && s?.accept) s.accept();
  }
}
