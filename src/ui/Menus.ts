import './ui.css';
import { demoActive } from '../engine/Device.ts';
import { clamp, easeOut, easeOutQuint, el, uiScale } from './UIKit.ts';
import { button } from './Icons.ts';
import { MainScreen } from './screens/MainScreen.ts';
import { InventoryScreen } from './screens/InventoryScreen.ts';
import { AscensionScreen } from './screens/AscensionScreen.ts';
import { ElemancyScreen } from './screens/ElemancyScreen.ts';
import { MapScreen } from './screens/MapScreen.ts';
import { WorldMapScreen } from './screens/WorldMapScreen.ts';
import { GearScreen } from './screens/GearScreen.ts';
import { PhotoScreen } from './screens/PhotoScreen.ts';
import { QuestScreen } from './screens/QuestScreen.ts';
import { ArchiveScreen } from './screens/ArchiveScreen.ts';
import { SystemScreen } from './screens/SystemScreen.ts';
import { ControlsScreen } from './screens/ControlsScreen.ts';
import { ArmigerScreen } from './screens/ArmigerScreen.ts';
import type { ShopScreen } from './screens/ShopScreen.ts';
import type { HuntBoardScreen } from './screens/HuntBoardScreen.ts';
import type { Game } from '../game/Game.ts';

/**
 * Footer prompt sets.
 *
 * Escape is deliberately *not* the headline back key anywhere. Browsers
 * reserve it to release pointer lock and swallow the keydown, so a footer that
 * promises "Esc — Back" is promising something the browser will eat. Tab and
 * Backspace are advertised instead, because those always arrive.
 */
/**
 * Every screen slot the menu stack answers to, and the class that fills it.
 *
 * A closed set, declared once: the names are also CSS class suffixes
 * (`.s-inventory`), `FOOT` keys and the strings `MainScreen`'s rows point at,
 * and a typo in any of those used to be silent.
 *
 * The two optional slots are the town counters. `Hammerhead._registerScreens`
 * adds them once Hammerhead is built, so a session that never reaches the
 * outpost genuinely has no `shop` — which is why `MainScreen._live` has to ask
 * before drawing a row live, and why these two are optional rather than a lie.
 *
 * Keyed to the concrete classes rather than to {@link MenuScreen} because
 * callers outside the stack reach for screen-specific verbs: `NpcDialogue`
 * calls `screens.shop.setShop(id)` before opening it.
 */
export interface ScreenMap {
  main: MainScreen;
  inventory: InventoryScreen;
  ascension: AscensionScreen;
  elemancy: ElemancyScreen;
  armiger: ArmigerScreen;
  map: MapScreen;
  world: WorldMapScreen;
  map_wide: WorldMapScreen;
  gear: GearScreen;
  quests: QuestScreen;
  archives: ArchiveScreen;
  system: SystemScreen;
  controls: ControlsScreen;
  photo: PhotoScreen;
  /** Registered by `Hammerhead._registerScreens`. */
  shop?: ShopScreen;
  /** Registered by `Hammerhead._registerScreens`. */
  hunts?: HuntBoardScreen;
}

/** One menu screen slot. */
export type ScreenName = keyof ScreenMap;

/**
 * What `Menus` requires of a screen.
 *
 * `node` is the important one. `Menus.init` creates it and assigns it onto the
 * screen, and `hide`/`show` then read `node.style.display` — so it is not
 * optional, it is simply written by the owner rather than the constructor.
 * Every screen class declares `node!: HTMLElement` to say so.
 *
 * The verbs are optional because `Menus` guards each one: a screen with no
 * `nav` is a screen the arrow keys do nothing on, which is the correct
 * behaviour for the controls card and the map.
 */
export interface MenuScreen {
  /** The screen's root element. Assigned by whoever registers the screen. */
  node: HTMLElement;
  /** Printed in the menu header; falls back to the slot name. */
  title?: string;
  /** The subtitle under it. */
  sub?: string;
  /** `false` hides the menu header and footer (photo mode). */
  chrome?: boolean;
  /** `false` leaves the world un-blurred behind the screen (photo mode). */
  scrim?: boolean;
  build(root: HTMLElement, game: Game): void;
  update(dt: number, game: Game, a: number): void;
  enter?(game: Game): void;
  exit?(): void;
  nav?(dx: number, dy: number): void;
  accept?(): void;
  /** Return true to swallow the back press (a modal the screen owns). */
  back?(): boolean | void;
}

const FOOT = {
  default: [['↑↓', 'Select'], ['Enter', 'Confirm'], ['Bksp', 'Back'], ['Tab', 'Close']],
  main: [['↑↓', 'Select'], ['Enter', 'Confirm'], ['H', 'Controls'], ['Tab', 'Close']],
  elemancy: [['↑↓', 'Row'], ['←→', 'Dial'], ['Enter', 'Craft'], ['Bksp', 'Back']],
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
  // `Navigate` was one word for two different axes, and a playtester read the
  // whole chart without ever working out that up/down moves the FILTER rail --
  // they cycled all 139 points one at a time with left/right instead. Name the
  // axes separately; the footer is the only place either is written down.
  world: [['←→', 'Place'], ['↑↓', 'Filter'], ['Enter', 'Travel'], ['I', 'Drive'], ['M', 'Close']],
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
  _inputWas!: boolean;
  _foot!: string;
  _gpPrev!: Record<string, boolean | undefined>;
  _lockHeld!: boolean | null;
  _onResize!: () => void;
  a!: number;
  foot!: HTMLElement;
  footRule!: HTMLElement;
  game!: Game;
  grain!: HTMLElement;
  head!: HTMLElement;
  headR!: HTMLElement;
  headS!: HTMLElement;
  headT!: HTMLElement;
  name!: ScreenName | null;
  open!: boolean;
  pending!: ScreenName | null;
  root!: HTMLElement;
  screens!: ScreenMap;
  scrim!: HTMLElement;
  shown!: ScreenName | null;
  stack!: ScreenName[];
  wrap!: HTMLElement;
  async init(game: Game) {
    this.game = game;
    this.root = el('div', { id: 'menus' });
    game.uiRoot.appendChild(this.root);

    this.scrim = el('div.menu-scrim');
    this.grain = el('div.menu-grain');
    this.wrap = el('div.menu-wrap');
    // The scrim goes in `uiRoot`, NOT in `#menus`. Its `backdrop-filter` can
    // only sample the backdrop of its own compositing layer, and inside
    // `#menus` that backdrop is empty -- so the blur this menu has always
    // declared has never rendered. See the block on `.menu-scrim` in `ui.css`
    // for the six-arm measurement; nothing but re-homing moves it.
    game.uiRoot.insertBefore(this.scrim, this.root);
    // Hidden from the first frame. `lateUpdate` sets this every frame, but it
    // has not run yet at the end of `init()`, and a full-screen scrim over the
    // game for one frame is exactly the kind of thing a capture would find.
    this.scrim.style.display = 'none';
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
      elemancy: new ElemancyScreen(this),
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
    for (const k of this.screenNames) {
      const s: MenuScreen | undefined = this.screens[k];
      if (!s) continue;
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
    const s = uiScale(demoActive());
    this.wrap.style.zoom = s.toFixed(4);
  }

  _renderFoot(kind: string) {
    if (this._foot === kind) return;
    this._foot = kind;
    this._paint(FOOT[kind as keyof typeof FOOT] || FOOT.default);
  }

  /**
   * Let the open screen replace the legend with a live one.
   *
   * The chrome legend is a static table per screen, so the world map advertised
   * `Enter TRAVEL` in the same weight as `M CLOSE` on every pin, including the
   * ones Enter would refuse. A blind playtester pressed it on an unsurveyed
   * haven, got nothing they could perceive, and spent their most confused
   * minute believing they had found a crash. **An affordance drawn as available
   * must either work or say why it did not** — this is the "drawn as available"
   * half, and a third element in a row dims the key rather than removing it, so
   * the legend does not reflow under the player's eyes as the selection steps
   * and the key stays discoverable for when it *will* work.
   *
   * Safe to call every frame: the rows are rebuilt only when the signature
   * changes.
   */
  setFoot(rows: [string, string, boolean?][]) {
    const sig = rows.map((r) => `${r[0]}\u0001${r[1]}\u0001${r[2] === false ? 0 : 1}`).join('\u0002');
    if (this._foot === sig) return;
    this._foot = sig;
    this._paint(rows);
  }

  _paint(rows: readonly (readonly (string | boolean | undefined)[])[]) {
    while (this.foot.childNodes.length > 1) this.foot.removeChild(this.foot.lastChild!);
    for (const row of rows) {
      const key = String(row[0]), label = String(row[1]);
      const on = row[2] !== false;
      this.foot.appendChild(el(`div.prompt.key${on ? '' : '.off'}`, {}, [
        button(key, { size: key.length > 2 ? 24 : 20 }), el('div.lb', { text: label }),
      ]));
    }
  }

  /**
   * Show a screen, or `null` to close. Transitions are animated; calling this
   * with the current name is a no-op.
   */
  /**
   * Every screen currently registered. `Object.keys` widens to `string[]`,
   * and the keys of `screens` are exactly `ScreenName` by construction -- this
   * getter is the one place that says so, rather than each caller asserting.
   */
  /**
   * Close, instantly and completely, so a reset page is not still in a menu.
   *
   * `open` is *derived* — `update()` computes it from the open amount `a`, so
   * `setScreen('main')` on its own leaves `a` wherever the last caller's
   * animation had it and `open` reads true forever after. `resetcheck` sees
   * exactly that: `menus.open  false -> true` surviving a reset for the
   * `combat` and `creatures` workloads, on a page the next gate would inherit.
   *
   * Everything here is state `update()` would otherwise have to animate down
   * over frames that a stopped render loop is never going to run.
   */
  reset() {
    this.pending = null;
    this.name = null;
    this.stack.length = 0;
    this.a = 0;
    this.open = false;
    this._hideShown();
    this.root.style.display = 'none';
    this.root.classList.remove('on');
    // Hand back what a menu takes from Input while it is up. `_lockHeld` is
    // nulled rather than set, so the next `_pointerLock` re-asserts whatever is
    // true then instead of trusting a value from before the reset.
    this._lockHeld = null;
    this._inputWas = false;
  }

  get screenNames(): ScreenName[] { return Object.keys(this.screens) as ScreenName[]; }

  setScreen(name: ScreenName | null) {
    if (name === this.name && !this.pending) return;
    if (!name) { this.pending = null; this.name = null; this.stack.length = 0; return; }
    const s: MenuScreen | undefined = this.screens[name];
    if (!s) { console.warn(`[Menus] unknown screen: ${name}`); return; }
    if (this.name && this.a > 0.02) { this.pending = name; }
    else { this._activate(name); }
  }

  /** Push a screen, remembering where to return to on back. */
  push(name: ScreenName) { if (this.name) this.stack.push(this.name); this.setScreen(name); }

  /**
   * Go back one level: first to whatever modal the current screen is holding
   * (an equip picker, say), then up the stack, then out of the menu entirely.
   */
  back() {
    const s: MenuScreen | null = this.name ? this.screens[this.name] ?? null : null;
    if (s && s.back && s.back()) return;
    this.setScreen(this.stack.length ? this.stack.pop() ?? null : null);
  }

  /** Take the currently displayed screen off-screen. */
  _hideShown() {
    const s: MenuScreen | null = this.shown ? this.screens[this.shown] ?? null : null;
    if (!s) return;
    s.node.style.display = 'none';
    if (s.exit) s.exit();
    this.shown = null;
  }

  _activate(name: ScreenName) {
    this._hideShown();
    this.name = name;
    this.shown = name;
    this.pending = null;
    // Unreachable in practice -- `setScreen` refuses an unknown name before it
    // ever gets here -- but it is what makes the slot's absence a return
    // rather than a throw.
    const s: MenuScreen | undefined = this.screens[name];
    if (!s) return;
    s.node.style.display = '';
    if (s.enter) s.enter(this.game);
    this.headT.textContent = s.title || name;
    this.headS.textContent = s.sub || '';
    this._renderFoot(FOOT[name as keyof typeof FOOT] ? name : 'default');
    this.head.style.display = s.chrome === false ? 'none' : '';
    this.foot.style.display = s.chrome === false ? 'none' : '';
  }

  /**
   * True while anything other than plain gameplay owns the screen: a menu, a
   * conversation, a shop, the title card or a playing cutscene. This is what
   * decides whether the pointer may be locked.
   */
  _uiBusy(game: Game) {
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
  _pointerLock(game: Game) {
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
  update(dt: number, game: Game) {
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
    // The scrim is outside `this.root` now (see `init`), so it does not inherit
    // that hide and has to be told separately. Without this line a closed menu
    // leaves a full-screen blur over the game.
    this.scrim.style.display = this.open ? '' : 'none';
    this.root.classList.toggle('on', this.a > 0.5);
    const hud = game.get?.('HUD');
    if (hud?.setMenuOpen) hud.setMenuOpen(this.a > 0.12);
    if (!this.open) return;

    const e = easeOutQuint(this.a);
    // photo mode is a camera — it must not blur or dim the frame it is framing
    const cur: MenuScreen | null = this.name ? this.screens[this.name] ?? null : null;
    const clean = cur?.scrim === false;
    this.scrim.style.opacity = (e * (clean ? 0.30 : 1)).toFixed(3);
    this.scrim.style.backdropFilter = clean ? 'none'
      : `blur(${(e * 26).toFixed(1)}px) saturate(${(1 - e * 0.42).toFixed(3)}) brightness(${(1 - e * 0.46).toFixed(3)})`;
    // Safari only honours the prefixed property, which `lib.dom` does not declare.
    this.scrim.style.setProperty('-webkit-backdrop-filter', this.scrim.style.backdropFilter);
    this.grain.style.opacity = (e * (clean ? 0 : 0.5)).toFixed(3);

    this.headT.style.opacity = easeOut(clamp((this.a - 0.1) / 0.6, 0, 1)).toFixed(3);
    this.headT.style.letterSpacing = `${(0.62 - 0.18 * e).toFixed(3)}em`;
    this.headS.style.opacity = easeOut(clamp((this.a - 0.25) / 0.6, 0, 1)).toFixed(3);
    this.headR.style.width = `${(easeOutQuint(clamp((this.a - 0.2) / 0.7, 0, 1)) * 300).toFixed(0)}px`;
    this.foot.style.opacity = easeOut(clamp((this.a - 0.3) / 0.6, 0, 1)).toFixed(3);
    this.foot.style.transform = `translateY(${((1 - e) * 12).toFixed(2)}px)`;

    const s: MenuScreen | null = this.name ? this.screens[this.name] ?? null : null;
    if (s) s.update(dt, game, this.a);
  }

  /**
   * Open a screen straight from a global hotkey: no stack, and pressing the
   * same key again closes it.
   */
  toggleScreen(name: ScreenName) {
    // Already here: go back the way we came, so H out of the controls card
    // returns you to the shop you were reading it from rather than the field.
    if (this.name === name) { this.back(); return; }
    if (this.name) { this.push(name); return; }
    this.stack.length = 0;
    this.setScreen(name);
  }

  _input(game: Game) {
    const inp = game.input;
    if (!inp) return;
    const down = (c: string) => inp.keyDown?.(c);
    const gp = (i: number) => inp.gamepad?.buttons?.[i]?.pressed;
    const edge = (k: string, v: boolean | undefined) => { const p = this._gpPrev?.[k]; (this._gpPrev = this._gpPrev || {})[k] = v; return !!v && !p; };
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
    const s: MenuScreen | null = this.name ? this.screens[this.name] ?? null : null;
    if ((dx || dy) && s?.nav) s.nav(dx, dy);
    if ((down('Enter') || down('Space') || b.a) && s?.accept) s.accept();
  }
}
