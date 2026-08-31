import type { Game } from '../../game/Game.ts';
import type { PadLike } from '../../engine/Input.ts';
import { el } from '../UIKit.ts';
import { readArmiger } from '../GameData.ts';
import { ensureTouchCss } from './touch.css.ts';
import { Stick } from './Stick.ts';
import { TouchButton } from './TouchButton.ts';
import { VirtualPad, mergePads } from './VirtualPad.ts';
import { RotateGate } from './Rotate.ts';
import { DPAD, MODES, PAD, SLOTS, type TouchMode } from './layouts.ts';

/**
 * The on-screen control layer.
 *
 * Owns three things and nothing else: the DOM, a {@link VirtualPad}, and a
 * per-frame pass that picks a mode and relabels the buttons. It reaches into
 * the game only to *read* — `Interaction.current.verb`, the chocobo's state,
 * whether the car is being driven — and drives everything through the pad or a
 * synthesised key, so no gameplay system knows it exists.
 *
 * It runs its own `requestAnimationFrame` rather than being ticked by `Game`,
 * for two reasons: nothing in `Game.ts` needs to change to install it, and the
 * labels must keep updating while the game is paused behind a menu.
 */

/** Metres. `RegaliaSystem._input` offers "Drive" inside this radius. */
const CAR_NEAR = 6.5;
/** `ChocoboSystem`'s SUMMON_DIST and ARRIVE_DIST, for the run-in ring. */
const SUMMON_DIST = 22;
const ARRIVE_DIST = 3.2;

export class TouchControls {
  game: Game;
  root: HTMLElement;
  pad: VirtualPad;
  sticks: Stick[];
  buttons: Map<string, TouchButton>;
  dpad: TouchButton[];
  mode: TouchMode;
  rotate: RotateGate;
  _raf: number;
  _onVis: () => void;

  constructor(game: Game) {
    this.game = game;
    this.pad = new VirtualPad();
    this.buttons = new Map();
    this.dpad = [];
    this.mode = 'field';
    this._raf = 0;

    // The triggers ramp so the car does not snap to full throttle on touch;
    // the d-pad repeats so a held finger scrolls a menu the way a held key
    // does. Both are properties of the *index*, not of the button on top.
    this.pad.configure(PAD.rt, { ramp: 0.25 });
    this.pad.configure(PAD.lt, { ramp: 0.25 });
    for (const i of [DPAD.up, DPAD.down, DPAD.left, DPAD.right]) this.pad.configure(i, { repeat: true });

    ensureTouchCss();
    this.root = el('div', { id: 'touch' });

    // The left stick's rim is sprint — see `Stick.SPRINT_AT`. `Player` and
    // `ChocoboSystem` both read pad 10, so one gesture sprints on foot and
    // mounted, and no screen is spent on a pill the left thumb could not
    // reach without letting go of the stick.
    // Only the LEFT stick draws a base. The right side is drag-anywhere to
    // look, and drawing a home for it put a second joystick under the ATTACK
    // button — the fan is the only thing that should be visible over there.
    // BOTH sticks draw a home. The right one is drag-anywhere-on-that-half,
    // so a home is not strictly needed to use it -- but "I can't turn the
    // camera" was the first thing said about a build that drew nothing there,
    // and a control nobody can find is a control that does not exist. Its base
    // sits low and inboard of the fan (see `.tc-rest-right`) so it reads as the
    // camera stick rather than as a button somebody forgot to label.
    this.sticks = [
      new Stick(this.pad, 'left', 0, PAD.l3, true),
      new Stick(this.pad, 'right', 2, -1, true),
    ];
    for (const s of this.sticks) this.root.appendChild(s.root);

    const clusters: Record<string, HTMLElement> = {};
    for (const name of ['fan', 'rail', 'top', 'left']) {
      const c = el(`div.tc-cluster.tc-${name}`);
      clusters[name] = c;
      this.root.appendChild(c);
    }

    for (const def of SLOTS) {
      const b = new TouchButton(this.pad, {
        id: def.id, label: def.label, pad: def.pad, key: def.key, cls: def.cls,
        icon: def.icon, family: def.family, showLabel: def.showLabel,
      });
      b.node.style.left = `${def.left}px`;
      b.node.style.top = `${def.top}px`;
      clusters[def.cluster].appendChild(b.node);
      this.buttons.set(def.id, b);
    }

    // The menu d-pad, in the left cluster, which nothing else occupies now
    // that sprint is a stick gesture.
    const cross: Array<[string, number, number, number, string]> = [
      ['up', DPAD.up, 58, 0, '▲'],
      ['left', DPAD.left, 0, 58, '◀'],
      ['right', DPAD.right, 116, 58, '▶'],
      ['down', DPAD.down, 58, 116, '▼'],
    ];
    for (const [name, idx, left, top, glyph] of cross) {
      const b = new TouchButton(this.pad, { id: `dpad-${name}`, label: glyph, pad: idx, cls: 'tc-sm', showLabel: true });
      b.node.style.left = `${left}px`;
      b.node.style.top = `${top}px`;
      clusters.left.appendChild(b.node);
      this.dpad.push(b);
    }

    game.uiRoot.appendChild(this.root);
    // Portrait is not a layout to tune, it is a different design -- the HUD,
    // the letterbox, the compass strip and the camera framing are all 16:9,
    // and a portrait phone is 1:2.2. It gets an honest gate, with a way past.
    this.rotate = new RotateGate(game.uiRoot);
    // The HUD has to give up the bottom-centre and the key legend; the rules
    // live in `touch.css.ts` behind this class so the touch layer owns its own
    // layout consequences instead of editing six HUD modules.
    document.documentElement.classList.add('has-touch');

    // Take over input. `touchMode` kills the mouse path — a handset synthesises
    // a compatibility mousedown on the canvas after any tap, and there is no
    // pointer lock to be had.
    game.input.touchMode = true;
    game.input.padSource = (real: PadLike | null) => {
      this.pad.poll(performance.now());
      return real ? mergePads(real, this.pad) : this.pad;
    };

    // A finger cannot send an up event through a backgrounded tab, so anything
    // held when the page hides would stay held on the way back.
    this._onVis = () => { if (document.hidden) this.releaseAll(); };
    document.addEventListener('visibilitychange', this._onVis);

    // The other half of stopping iOS zoom. `touch-action` handles double-tap;
    // pinch arrives as Safari's non-standard `gesture*` events, which no CSS
    // reaches. Both are meaningless here -- there is nothing on this page to
    // zoom into -- and a game that zooms out from under a thumb mid-fight is
    // the most annoying possible bug.
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
      document.addEventListener(type, (e: Event) => e.preventDefault(), { passive: false });
    }
    // Belt and braces for the double-tap that slips past `touch-action` on
    // older iOS: a second tap inside 320 ms at the same spot is a zoom
    // gesture, and never something this game wants.
    let lastTap = 0;
    document.addEventListener('touchend', (e: TouchEvent) => {
      const now = performance.now();
      if (now - lastTap < 320) e.preventDefault();
      lastTap = now;
    }, { passive: false });

    const tick = () => { this._raf = requestAnimationFrame(tick); this.update(); };
    this._raf = requestAnimationFrame(tick);
    this._applyMode('field');
    this.update();
  }

  releaseAll() {
    for (const s of this.sticks) s.reset();
    for (const b of this.buttons.values()) b.release();
    for (const b of this.dpad) b.release();
    this.pad.releaseAll();
  }

  /** Which control set the live game state calls for. */
  _pickMode(): TouchMode {
    const g = this.game;
    // A live cutscene outranks everything, including a menu it just closed.
    const cine = g.get('Cinematics');
    if (cine && cine.playing) return 'cine';
    const menus = g.get('Menus');
    const story = g.get('Story');
    if ((menus && menus.open) || (story && story.title && story.title.shown)) return 'ui';
    const car = g.get('Regalia');
    if (car && car.isDriving) return 'drive';
    const cho = g.get('Chocobo');
    if (cho && cho.isRiding) return 'ride';
    const swim = g.get('Swim');
    if (swim && swim.swimming) return 'swim';
    return 'field';
  }

  update() {
    const g = this.game;

    // `currentShot` is set only by `Game.applyShot`, i.e. by the capture
    // harness. The whole layer comes off so no posed frame can ever contain
    // it. A *played* cutscene is a different thing and keeps one button — see
    // the `cine` mode.
    const hidden = !!g.currentShot;
    if (hidden !== this.root.hidden) {
      this.root.hidden = hidden;
      if (hidden) this.releaseAll();
    }
    if (hidden) return;

    const mode = this._pickMode();
    if (mode !== this.mode) {
      this.mode = mode;
      this.releaseAll();
      this._applyMode(mode);
    }

    // In `ui` and `cine` the sticks come off entirely: `Input.update` already
    // zeroes move/look when `enabled` is false, but an invisible catcher over a
    // menu still eats taps meant for the screen behind it.
    const wantSticks = mode !== 'ui' && mode !== 'cine';
    for (const s of this.sticks) {
      if (s.root.hidden === wantSticks) { s.root.hidden = !wantSticks; if (!wantSticks) s.reset(); }
    }
    for (const b of this.dpad) b.setShown(mode === 'ui');

    this._live(mode);
  }

  /** Labels, glyphs, pad indices and presence for a mode. On mode change. */
  _applyMode(mode: TouchMode) {
    const over = MODES[mode] || {};
    for (const def of SLOTS) {
      const b = this.buttons.get(def.id);
      if (!b) continue;
      const st = over[def.id] || {};
      b.setLabel(st.label != null ? st.label : def.label);
      b.setIcon(st.icon != null ? st.icon : (def.icon || ''));
      b.setPad(st.pad != null ? st.pad : def.pad);
      b.setSub('');
      b.setRing(-1);
      b.setShown(!st.off);
      b.setEnabled(!st.off, def.id === 'interact');
    }
  }

  /**
   * The per-frame half: the labels that follow live game state.
   *
   * This is what makes the touch build read *better* than the keyboard one. On
   * a keyboard `Digit6` is one key doing three jobs and you have to remember
   * which; here the button says which, and INTERACT names the verb it will
   * perform rather than a letter you have to map.
   */
  _live(mode: TouchMode) {
    const g = this.game;

    // INTERACT takes its name from whatever it would actually do, and is the
    // one slot that dims in place rather than vanishing — the player has to
    // know where the contextual verb will appear before there is one.
    const act = this.buttons.get('interact');
    if (act && (mode === 'field' || mode === 'ride')) {
      const ix = g.get('Interaction');
      const cur = ix ? ix.current : null;
      act.setLabel(cur ? String(cur.verb || 'Interact').toUpperCase() : 'INTERACT');
      act.setEnabled(!!cur, true);
    }

    // ARMIGER is not on screen at all until the gauge can pay for it.
    // `readArmiger` is the accessor `CombatHUD` uses, so the button and the bar
    // cannot disagree about whether the burst is available.
    const arm = this.buttons.get('armiger');
    if (arm && mode === 'field') {
      const gauge = readArmiger(g);
      arm.setShown(gauge != null && gauge > 0.995);
    }

    // The chocobo button: four states, and a ring for the one that used to
    // leave a playtester standing still wondering whether it had worked.
    const cb = this.buttons.get('chocobo');
    const cho = g.get('Chocobo');
    if (cb && cho && !cb.node.hidden) {
      const st = cho.state;
      if (st === 'ridden') { cb.setLabel('DISMOUNT'); cb.setSub(''); cb.setEnabled(true); cb.setRing(-1); }
      else if (st === 'waiting') { cb.setLabel('DISMISS'); cb.setSub(''); cb.setEnabled(true); cb.setRing(-1); }
      else if (st === 'arriving') {
        // Disabled on purpose: the whistle key's `arriving` branch is
        // `dismiss()`, so a second impatient tap would send the bird away
        // again. The ring answers the impatience instead.
        cb.setLabel('COMING');
        cb.setEnabled(false, true);
        const bird = cho.bird, player = g.get('Player');
        if (bird && player) {
          const d = Math.hypot(bird.root.position.x - player.position.x, bird.root.position.z - player.position.z);
          cb.setSub(`${Math.round(d)} m`);
          cb.setRing(1 - Math.max(0, Math.min(1, (d - ARRIVE_DIST) / (SUMMON_DIST - ARRIVE_DIST))));
        }
      } else { cb.setLabel('CHOCOBO'); cb.setSub(''); cb.setEnabled(true); cb.setRing(-1); }
    }

    // The car button, the same shape. `KeyF` is enter *and* exit in
    // `RegaliaSystem._input`, so one button covers both — and without an EXIT
    // a phone player who got in could never get out. Out of range it stays on
    // screen and prints the distance, which is more use than a ghost disc.
    const carB = this.buttons.get('car');
    const car = g.get('Regalia');
    if (carB && car && !carB.node.hidden) {
      if (mode === 'drive') { carB.setLabel('EXIT'); carB.setIcon('exit'); carB.setSub(''); carB.setKey('KeyF'); carB.setEnabled(true); }
      else {
        const d = car.distanceToPlayer ? car.distanceToPlayer() : 1e5;
        // Three states, and the far one is no longer dead. The car was the one
        // thing in the world you had to walk back to; now the same button that
        // gets you in also calls it, so it is never a dim disc taking up room.
        if (d < CAR_NEAR) { carB.setLabel('DRIVE'); carB.setIcon('car'); carB.setSub(''); carB.setKey('KeyF'); }
        else { carB.setLabel('CALL'); carB.setIcon('summon'); carB.setSub(`${d > 9999 ? '—' : Math.round(d)} m`); carB.setKey('Digit7'); }
        carB.setEnabled(true);
      }
    }
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    this.rotate.dispose();
    document.removeEventListener('visibilitychange', this._onVis);
    this.game.input.padSource = null;
    this.game.input.touchMode = false;
    document.documentElement.classList.remove('has-touch');
    this.root.remove();
  }
}

/** Build and install the layer. Returns it so `touchcheck` can poke at it. */
export function installTouchControls(game: Game): TouchControls {
  const tc = new TouchControls(game);
  window.TOUCH = tc;
  return tc;
}
