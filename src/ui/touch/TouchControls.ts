import type { Game } from '../../game/Game.ts';
import type { PadLike } from '../../engine/Input.ts';
import { el } from '../UIKit.ts';
import { readArmiger } from '../GameData.ts';
import { ensureTouchCss } from './touch.css.ts';
import { Stick } from './Stick.ts';
import { TouchButton } from './TouchButton.ts';
import { VirtualPad, mergePads } from './VirtualPad.ts';
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

    this.sticks = [new Stick(this.pad, 'left', 0), new Stick(this.pad, 'right', 2)];
    for (const s of this.sticks) this.root.appendChild(s.root);

    const clusters: Record<string, HTMLElement> = {};
    for (const name of ['right', 'left', 'top']) {
      const c = el(`div.tc-cluster.tc-${name}`);
      clusters[name] = c;
      this.root.appendChild(c);
    }

    for (const def of SLOTS) {
      const b = new TouchButton(this.pad, {
        id: def.id, label: def.label, pad: def.pad, key: def.key, cls: def.cls, toggle: def.toggle,
      });
      b.node.style.left = `${def.left}px`;
      b.node.style.top = `${def.top}px`;
      clusters[def.cluster].appendChild(b.node);
      this.buttons.set(def.id, b);
    }

    // The menu d-pad. It shares the left cluster with SPRINT, which is off in
    // every mode the d-pad is on in, so the two never collide.
    const cross: Array<[string, number, number, number, string]> = [
      ['up', DPAD.up, 58, 0, '▲'],
      ['left', DPAD.left, 0, 58, '◀'],
      ['right', DPAD.right, 116, 58, '▶'],
      ['down', DPAD.down, 58, 116, '▼'],
    ];
    for (const [name, idx, left, top, glyph] of cross) {
      const b = new TouchButton(this.pad, { id: `dpad-${name}`, label: glyph, pad: idx, cls: 'tc-sm' });
      b.node.style.left = `${left}px`;
      b.node.style.top = `${top}px`;
      clusters.left.appendChild(b.node);
      this.dpad.push(b);
    }

    game.uiRoot.appendChild(this.root);
    // The HUD has to give up the bottom-right corner and the key legend; the
    // rules live in `touch.css.ts` behind this class so the touch layer owns
    // its own layout consequences instead of editing six HUD modules.
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

    const tick = () => { this._raf = requestAnimationFrame(tick); this.update(); };
    this._raf = requestAnimationFrame(tick);
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

    // In `ui` the sticks come off entirely: `Input.update` already zeroes
    // `move`/`look` when `enabled` is false, but an invisible catcher over a
    // menu still eats taps meant for the screen behind it.
    const wantSticks = mode !== 'ui' && mode !== 'cine';
    for (const s of this.sticks) {
      if (s.root.hidden === wantSticks) { s.root.hidden = !wantSticks; if (!wantSticks) s.reset(); }
    }
    for (const b of this.dpad) b.node.hidden = mode !== 'ui';

    this._live(mode);
  }

  /** Labels, pad indices and enabled-ness for a mode. Runs on mode change. */
  _applyMode(mode: TouchMode) {
    const over = MODES[mode] || {};
    for (const def of SLOTS) {
      const b = this.buttons.get(def.id);
      if (!b) continue;
      const st = over[def.id] || {};
      b.setLabel(st.label != null ? st.label : def.label);
      b.setPad(st.pad != null ? st.pad : def.pad);
      b.setEnabled(!st.off);
      b.node.hidden = !!st.off;
      b.setRing(-1);
    }
  }

  /**
   * The per-frame half: the three labels that follow live game state.
   *
   * This is what makes the touch build read *better* than the keyboard one. On
   * a keyboard `Digit6` is one key doing three jobs and you have to remember
   * which; here the button says which, and INTERACT names the verb it will
   * perform rather than a letter you have to map.
   */
  _live(mode: TouchMode) {
    const g = this.game;

    // INTERACT takes its name from whatever it would actually do.
    const act = this.buttons.get('interact');
    if (act && (mode === 'field' || mode === 'ride')) {
      const ix = g.get('Interaction');
      const cur = ix ? ix.current : null;
      act.setLabel(cur ? String(cur.verb || 'Interact').toUpperCase() : 'INTERACT');
      act.setEnabled(!!cur);
      act.node.hidden = false;
    }

    // ARMIGER is dark until the gauge can pay for it. `readArmiger` is the
    // same accessor `CombatHUD` uses, so the button and the bar cannot
    // disagree about whether the burst is available.
    const arm = this.buttons.get('armiger');
    if (arm && mode === 'field') {
      const gauge = readArmiger(g);
      arm.setEnabled(gauge != null && gauge > 0.995);
    }

    // The chocobo button: four states, and a ring for the one that used to
    // leave a playtester standing still wondering whether it had worked.
    const cb = this.buttons.get('chocobo');
    const cho = g.get('Chocobo');
    if (cb && cho && mode !== 'ui' && !cb.node.hidden) {
      const st = cho.state;
      if (st === 'ridden') { cb.setLabel('DISMOUNT'); cb.setEnabled(true); cb.setRing(-1); }
      else if (st === 'waiting') { cb.setLabel('DISMISS'); cb.setEnabled(true); cb.setRing(-1); }
      else if (st === 'arriving') {
        // Disabled on purpose: the whistle key's `arriving` branch is
        // `dismiss()`, so a second impatient tap would send the bird away
        // again. The ring answers the impatience instead.
        cb.setLabel('COMING');
        cb.setEnabled(false);
        const bird = cho.bird, player = g.get('Player');
        if (bird && player) {
          const d = Math.hypot(bird.root.position.x - player.position.x, bird.root.position.z - player.position.z);
          cb.setRing(1 - Math.max(0, Math.min(1, (d - ARRIVE_DIST) / (SUMMON_DIST - ARRIVE_DIST))));
        }
      } else { cb.setLabel('CHOCOBO'); cb.setEnabled(true); cb.setRing(-1); }
    }

    // The car button, the same shape. `KeyF` is enter *and* exit in
    // `RegaliaSystem._input`, so one button covers both — and without an EXIT
    // a phone player who got in could never get out.
    const carB = this.buttons.get('car');
    const car = g.get('Regalia');
    if (carB && car && !carB.node.hidden) {
      if (mode === 'drive') { carB.setLabel('EXIT'); carB.setEnabled(true); }
      else {
        const near = car.distanceToPlayer ? car.distanceToPlayer() < CAR_NEAR : false;
        carB.setLabel(near ? 'DRIVE' : 'CAR');
        carB.setEnabled(near);
      }
    }
  }

  dispose() {
    cancelAnimationFrame(this._raf);
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
