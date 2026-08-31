import './title.css';
import { demoActive } from '../../engine/Device.ts';
import * as THREE from 'three';
import { clamp, easeOut, easeOutQuint, el, lerp, letters, svg, uiScale } from '../../ui/UIKit.ts';
import { Noise } from '../../util/Noise.ts';
import type { Game } from '../Game.ts';

/**
 * The title screen: an attract camera over Leide, the logo lockup, and three
 * lines of menu.
 *
 * The crest is drawn rather than loaded — a downward crystal caught inside a
 * pair of swept wings under a broken crown arc, which is the shape Lucis puts
 * on everything it owns. Everything is thin strokes and negative space so it
 * survives being sat over a bright dusk sky.
 *
 * The attract camera is a single very slow move that ping-pongs on a cosine, so
 * it loops forever with no seam and no state to reset.
 */
/** What the title screen's menu can answer with. */
export type TitleChoice = 'new' | 'continue' | 'extras';

/** One menu row as authored. */
interface TitleItem {
  id: TitleChoice;
  title: string;
  desc: string;
}

/** One menu row as built: its elements, plus the damped highlight amount. */
interface TitleRow {
  row: HTMLElement;
  bg: HTMLElement;
  /** The two marks that slide out either side of the highlighted row. */
  ml: HTMLElement;
  mr: HTMLElement;
  t: HTMLElement;
  d: HTMLElement;
  it: TitleItem;
  /** Highlight amount, damped toward 0/1 each frame. */
  _k?: number;
}

export class TitleScreen {
  /** The pick being committed, held while the screen fades to black. */
  chosen!: TitleChoice | null;
  onChoose!: ((pick: TitleChoice) => void) | null;
  shown!: boolean;
  _camPos!: THREE.Vector3;
  _camTgt!: THREE.Vector3;
  /** Last-frame gamepad button states, for edge detection. */
  _gp!: Record<string, boolean> | null;
  /** HUD visibility saved on `show`, restored on `hide`. */
  _hudWas!: boolean | undefined;
  _noise!: Noise;
  _onResize!: () => void;
  a!: number;
  crest!: SVGElement;
  fade!: HTMLElement;
  fadeOut!: number;
  ff!: HTMLElement;
  foot!: HTMLElement;
  game!: Game;
  index!: number;
  items!: TitleItem[];
  mark!: HTMLElement;
  menu!: HTMLElement;
  root!: HTMLElement;
  rows!: TitleRow[];
  rule!: HTMLElement;
  t!: number;
  tag!: HTMLElement;
  xv!: HTMLElement;
  xvChars!: HTMLElement[];
  constructor(parent: HTMLElement, game: Game) {
    this.game = game;
    this.root = el('div', { id: 'title' });
    parent.appendChild(this.root);

    this.root.appendChild(el('div.ti-scrim'));
    this.root.appendChild(el('div.ti-grain'));

    // ---- logo lockup -----------------------------------------------------
    this.mark = el('div.ti-mark');
    this.crest = crestSvg();
    this.mark.appendChild(this.crest);
    this.ff = el('div.ti-ff', { text: 'Final Fantasy' });
    this.mark.appendChild(this.ff);
    this.xv = el('div.ti-xv');
    const xvL = letters('XV', 'span.ch');
    this.xv.appendChild(xvL.node);
    this.xvChars = xvL.chars;
    this.mark.appendChild(this.xv);
    this.rule = el('div.ti-rule');
    this.mark.appendChild(this.rule);
    this.tag = el('div.ti-tag', { text: 'A Final Fantasy for Fans and First-Timers' });
    this.mark.appendChild(this.tag);
    this.root.appendChild(this.mark);

    // ---- menu ------------------------------------------------------------
    this.items = [
      { id: 'new', title: 'New Game', desc: 'Chapter I — Departure' },
      { id: 'continue', title: 'Continue', desc: 'Load the last save' },
      { id: 'extras', title: 'Extras', desc: 'Not in this build' },
    ];
    this.menu = el('div.ti-menu');
    this.rows = this.items.map((it): TitleRow => {
      const row = el('div.ti-row');
      const bg = el('div.tr-bg');
      const ml = el('div.tr-m.l');
      const mr = el('div.tr-m.r');
      const t = el('div.tr-t', { text: it.title });
      const d = el('div.tr-d', { text: it.desc });
      row.appendChild(bg); row.appendChild(ml); row.appendChild(mr);
      row.appendChild(t); row.appendChild(d);
      this.menu.appendChild(row);
      return { row, bg, ml, mr, t, d, it };
    });
    this.root.appendChild(this.menu);

    this.foot = el('div.ti-foot', {}, [
      el('div.fk', {}, [el('b', { text: '↑↓' }), 'Select']),
      el('div.fk', {}, [el('b', { text: 'Enter' }), 'Confirm']),
    ]);
    this.root.appendChild(this.foot);
    this.root.appendChild(el('div.ti-ver', { text: 'Eos build — Leide' }));

    this.fade = el('div.ti-fade');
    this.root.appendChild(this.fade);

    this.index = 0;
    this.a = 0;                 // 0..1 shown amount
    this.shown = false;
    this.t = 0;
    this.chosen = null;
    this.onChoose = null;
    this.fadeOut = 0;
    this._noise = new Noise(4041);
    this._camPos = new THREE.Vector3();
    this._camTgt = new THREE.Vector3();
    this._scale();
    this._onResize = () => this._scale();
    window.addEventListener('resize', this._onResize);
    this.root.style.display = 'none';
  }

  _scale() {
    const s = uiScale(demoActive());
    this.root.style.zoom = s.toFixed(4);
  }

  /** Show the title screen and take over the camera. */
  show() {
    this.shown = true;
    this.t = 0;
    this.chosen = null;
    this.fadeOut = 0;
    this.index = this.canContinue() ? 1 : 0;
    this.root.style.display = '';
    this.root.style.pointerEvents = 'none';
    // Golden hour, always. The title screen is the one frame every player sees,
    // and Leide only looks like itself with the sun on the deck.
    const sky = this.game.get('Sky');
    if (sky && sky.setTimeOfDay) sky.setTimeOfDay(18.55);
    const weather = this.game.get('Weather');
    if (weather && weather.set) weather.set('clear');
    const hud = this.game.get('HUD');
    if (hud && this._hudWas === undefined) { this._hudWas = hud.visible; hud.setVisible(false); }
    const menus = this.game.get('Menus');
    if (menus) menus.setScreen(null);
  }

  /** Hide it and hand the camera back. */
  hide() {
    this.shown = false;
    const hud = this.game.get('HUD');
    // Only restore if we actually hid it. Restoring unconditionally made a
    // no-op hide() turn the HUD on for callers that never showed the title.
    if (hud && this._hudWas !== undefined) hud.setVisible(this._hudWas);
    this._hudWas = undefined;
    const rig = this.game.get('CameraRig');
    if (rig) rig.clearShot();
  }

  /** Is there a save worth offering? */
  canContinue() {
    const rpg = this.game.get('Rpg');
    try { return !!(rpg && rpg.listSaves && rpg.listSaves().length); } catch { return false; }
  }

  /* -------------------------------------------------------------- input -- */

  _input(game: Game) {
    const inp = game.input;
    if (!inp || this.chosen) return;
    const down = (k: string) => inp.keyDown && inp.keyDown(k);
    const gp = (i: number) => !!inp.gamepad?.buttons?.[i]?.pressed;
    const edge = (k: string, v: boolean) => { const p = this._gp && this._gp[k]; (this._gp = this._gp || {})[k] = v; return v && !p; };

    let d = 0;
    if (down('ArrowUp') || down('KeyW') || edge('u', gp(12))) d -= 1;
    if (down('ArrowDown') || down('KeyS') || edge('d', gp(13))) d += 1;
    if (d) {
      const n = this.items.length;
      let i = this.index;
      for (let k = 0; k < n; k++) {
        i = (i + d + n) % n;
        if (this._enabled(i)) break;
      }
      this.index = i;
    }
    if (down('Enter') || down('Space') || edge('a', gp(0))) this.choose();
  }

  _enabled(i: number) {
    const id = this.items[i].id;
    if (id === 'continue') return this.canContinue();
    if (id === 'extras') return false;
    return true;
  }

  /** Commit the highlighted item. */
  choose(id?: TitleChoice) {
    const pick = id || this.items[this.index].id;
    if (!id && !this._enabled(this.index)) return;
    this.chosen = pick;
    const audio = this.game.get('Audio');
    if (audio && audio.play) audio.play('ui');
  }

  /* --------------------------------------------------------------- tick -- */

  update(dt: number, game: Game) {
    const busy = this.shown || this.a > 0.002;
    this.root.style.display = busy ? '' : 'none';
    if (!busy) return;
    if (this.shown) this._input(game);
    this.t += dt;

    const target = this.shown ? 1 : 0;
    this.a = clamp(this.a + (target > this.a ? dt / 1.4 : -dt / 0.5), 0, 1);
    const e = easeOutQuint(this.a);

    // ---- lockup: the crest draws itself, then the type arrives -----------
    this.crest.style.opacity = easeOut(clamp((this.t - 0.2) / 1.8, 0, 1) * this.a).toFixed(3);
    this.crest.style.transform = `scale(${(0.94 + 0.06 * easeOutQuint(clamp(this.t / 2.4, 0, 1))).toFixed(4)})`;
    this.ff.style.opacity = easeOut(clamp((this.t - 0.9) / 1.2, 0, 1) * this.a).toFixed(3);
    this.ff.style.letterSpacing = `${(1.10 - 0.24 * easeOutQuint(clamp((this.t - 0.9) / 2.2, 0, 1))).toFixed(3)}em`;
    for (let i = 0; i < this.xvChars.length; i++) {
      const t = clamp((this.t - 1.35 - i * 0.16) / 1.1, 0, 1);
      const q = easeOutQuint(t);
      this.xvChars[i].style.opacity = (q * this.a).toFixed(3);
      this.xvChars[i].style.transform = `translateY(${((1 - q) * 20).toFixed(2)}px)`;
      this.xvChars[i].style.filter = t < 1 ? `blur(${((1 - q) * 7).toFixed(2)}px)` : '';
    }
    this.rule.style.width = `${(easeOutQuint(clamp((this.t - 1.9) / 1.6, 0, 1)) * 300 * this.a).toFixed(0)}px`;
    this.tag.style.opacity = easeOut(clamp((this.t - 2.4) / 1.4, 0, 1) * this.a).toFixed(3);
    this.mark.style.opacity = e.toFixed(3);

    // ---- menu -------------------------------------------------------------
    const menuIn = clamp((this.t - 2.8) / 1.0, 0, 1);
    this.menu.style.opacity = (easeOut(menuIn) * this.a).toFixed(3);
    this.menu.style.transform = `translateX(-50%) translateY(${((1 - easeOut(menuIn)) * 14).toFixed(2)}px)`;
    // a slow breath on the highlight so a still frame still reads as "live"
    const pulse = 0.80 + 0.20 * (0.5 + 0.5 * Math.sin(this.t * 2.1));
    for (let i = 0; i < this.rows.length; i++) {
      const r = this.rows[i];
      const on = i === this.index && !!this.shown;
      const enabled = this._enabled(i);
      r.row.classList.toggle('on', on);
      r.row.classList.toggle('off', !enabled);
      const k = r._k = lerp(r._k ?? 0, on ? 1 : 0, 1 - Math.exp(-14 * dt));
      r.bg.style.opacity = (k * 0.9).toFixed(3);
      r.ml.style.opacity = (k * pulse).toFixed(3);
      r.mr.style.opacity = (k * pulse).toFixed(3);
      r.ml.style.left = `${(-6 - k * 6).toFixed(1)}px`;
      r.mr.style.right = `${(-6 - k * 6).toFixed(1)}px`;
      r.t.style.letterSpacing = `${(0.40 + 0.06 * k).toFixed(3)}em`;
    }
    this.foot.style.opacity = (easeOut(clamp((this.t - 3.4) / 1.2, 0, 1)) * this.a * 0.9).toFixed(3);

    // ---- commit: fade to black, then tell the story system ---------------
    if (this.chosen) {
      this.fadeOut = clamp(this.fadeOut + dt / 1.1, 0, 1);
      this.fade.style.opacity = this.fadeOut.toFixed(3);
      if (this.fadeOut >= 1) {
        const pick = this.chosen;
        this.chosen = null;
        this.hide();
        this.fade.style.opacity = '0';
        this.fadeOut = 0;
        if (this.onChoose) this.onChoose(pick);
      }
    } else {
      this.fade.style.opacity = (1 - this.a).toFixed(3);
    }
  }

  /**
   * The attract camera. A single 96-second cosine ping-pong high over the
   * badlands: it never repeats a seam and it never needs resetting.
   */
  updateCamera(dt: number, game: Game) {
    if (!this.shown && this.a <= 0.002) return;
    const cam = game.camera;
    const k = 0.5 - 0.5 * Math.cos((this.t / 48) * Math.PI);      // 0..1..0
    const n = this._noise;

    // From above the eastern flats, drifting west across the basin toward the
    // West Scarp. Recomposed for the 8192 m world: the scarp moved to
    // (-640, 430) h137 and the old framing pointed at empty sky.
    this._camPos.set(
      lerp(430, 330, k),
      lerp(40, 34, k) + n.simplex2(this.t * 0.06, 3.7) * 0.7,
      lerp(-60, 60, k),
    );
    this._camTgt.set(
      lerp(-640, -690, k) + n.simplex2(this.t * 0.05, 21.3) * 1.6,
      lerp(140, 128, k),
      lerp(430, 490, k) + n.simplex2(this.t * 0.04, 47.1) * 1.6,
    );
    const terrain = game.get('Terrain');
    if (terrain && terrain.heightAt) {
      const h = terrain.heightAt(this._camPos.x, this._camPos.z) + 9;
      if (this._camPos.y < h) this._camPos.y = h;
    }
    cam.up.set(0, 1, 0);
    cam.position.copy(this._camPos);
    cam.lookAt(this._camTgt);
    const fov = lerp(42, 38, k);
    if (Math.abs(cam.fov - fov) > 1e-3) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld(true);
    if (game.post && game.post.setFocusDistance) {
      game.post.setFocusDistance(this._camPos.distanceTo(this._camTgt) * 0.5);
    }
  }
}

/**
 * The Lucian crest, drawn: a downward crystal held inside swept wings under a
 * broken crown arc. Strokes only, so it works over sky.
 */
function crestSvg() {
  const S = svg('svg.ti-crest', { width: 168, height: 104, viewBox: '0 0 168 104', fill: 'none' });
  const stroke = (d: string, w = 1.1, o = 1) => svg('path', {
    d, stroke: 'currentColor', 'stroke-width': w, 'stroke-opacity': o,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round', fill: 'none',
  });

  // crown arc, broken at the apex
  S.appendChild(stroke('M40 26 Q60 8 80 17', 1.0, 0.75));
  S.appendChild(stroke('M128 26 Q108 8 88 17', 1.0, 0.75));
  S.appendChild(stroke('M84 6 L84 14', 1.4, 0.95));

  // wings: four swept feathers a side, longest outboard
  for (let i = 0; i < 4; i++) {
    const y = 32 + i * 8.5;
    const len = 56 - i * 9;
    const drop = 10 + i * 4.5;
    S.appendChild(stroke(`M74 ${y} C ${74 - len * 0.45} ${y - 3}, ${74 - len * 0.8} ${y + drop * 0.3}, ${74 - len} ${y + drop}`, 1.0, 0.9 - i * 0.13));
    S.appendChild(stroke(`M94 ${y} C ${94 + len * 0.45} ${y - 3}, ${94 + len * 0.8} ${y + drop * 0.3}, ${94 + len} ${y + drop}`, 1.0, 0.9 - i * 0.13));
  }

  // the crystal: a long downward-pointing gem on the axis
  S.appendChild(stroke('M84 20 L95 42 L84 96 L73 42 Z', 1.25, 1));
  S.appendChild(stroke('M73 42 L95 42', 0.85, 0.55));
  S.appendChild(stroke('M84 20 L84 96', 0.7, 0.42));

  // two hairlines flanking the gem, the way an engraved seal is bounded
  S.appendChild(stroke('M64 30 L64 62', 0.7, 0.32));
  S.appendChild(stroke('M104 30 L104 62', 0.7, 0.32));
  return S;
}

export default TitleScreen;
