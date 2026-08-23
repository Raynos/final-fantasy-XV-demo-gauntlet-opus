import { el } from '../../ui/UIKit.ts';
import { ensureFishingCss } from './fishing.css.ts';

/** Where a cast is in its life. */
export type FishingPhase = 'cast' | 'flight' | 'wait' | 'bite' | 'fight' | 'landed' | 'lost';

/**
 * Everything the overlay draws, recomputed by `Fishing` every frame.
 *
 * Deliberately a flat value object rather than a reference to the `Fishing`
 * instance: the HUD is a pure function of this, which is what makes the whole
 * minigame testable from a probe (`probes/fishloop.mts` reads exactly these
 * fields and never touches the DOM).
 */
export interface FishingView {
  phase: FishingPhase;
  /** The name of the place, for the caption. */
  spot: string;
  /** Cast charge, 0..1. */
  power: number;
  /** Line tension, 0..1. 1 is the instant before it goes. */
  tension: number;
  /** How long it has been in the snap band, 0..1 of the way to a break. */
  strain: number;
  /** Metres of line still out. */
  line: number;
  /** Metres of line out at the moment it was hooked, for the bar's scale. */
  line0: number;
  /** What the fish has left, 0..1. */
  stamina: number;
  fishName: string;
  /** Mass in kg — only meaningful once it is landed. */
  kg: number;
  /** Which way it is running: -1 left, +1 right, 0 sulking. */
  run: -1 | 0 | 1;
  /** Which way the player is leaning on the rod. */
  tilt: -1 | 0 | 1;
  reeling: boolean;
  /** One line of guidance under the caption. */
  note: string;
}

/** The caption and its tone for each phase. */
const CAPTION: Record<FishingPhase, [string, string]> = {
  cast:   ['Cast', ''],
  flight: ['Cast', ''],
  wait:   ['Waiting', ''],
  bite:   ['Bite!', 'hot'],
  fight:  ['On the line', ''],
  landed: ['Landed', 'good'],
  lost:   ['Lost it', 'bad'],
};

/**
 * The fishing overlay.
 *
 * An overlay and not a `Menus` screen, on purpose. A screen curtains the world
 * and takes `input.enabled` through `Menus`; a fishing minigame where you
 * cannot see the water is not a fishing minigame. This draws over the live
 * frame, and `Fishing` takes the stick itself.
 */
export class FishingHud {
  root: HTMLElement;
  _cap: HTMLElement;
  _sub: HTMLElement;
  _gauge: HTMLElement;
  _fill: HTMLElement;
  _band: HTMLElement;
  _tick: HTMLElement;
  _rowLine: HTMLElement;
  _lineV: HTMLElement;
  _fishNm: HTMLElement;
  _stam: HTMLElement;
  _run: HTMLElement;
  _runL: HTMLElement;
  _runR: HTMLElement;
  _runMid: HTMLElement;
  _keys: HTMLElement;
  _keyE: HTMLElement;
  _keyA: HTMLElement;
  _keyD: HTMLElement;
  _cast: HTMLElement;
  _castF: HTMLElement;
  _card: HTMLElement;
  _cardNm: HTMLElement;
  _cardKg: HTMLElement;
  _live: HTMLElement;
  _veil: HTMLElement;

  constructor(host: HTMLElement) {
    ensureFishingCss();
    this._veil = el('div.fsh-veil');

    this._cap = el('div.fsh-cap', { text: 'Cast' });
    this._sub = el('div.fsh-sub', { text: '' });

    this._fill = el('div.fill');
    this._band = el('div.band');
    this._tick = el('div.tick');
    this._gauge = el('div.fsh-gauge', {}, [el('div.bed'), this._band, this._fill, this._tick]);

    this._lineV = el('div.v', { html: '0<small>M</small>' });
    this._fishNm = el('div.k', { text: '' });
    this._stam = el('div.f');
    this._rowLine = el('div.fsh-row', {}, [
      el('div.fsh-num', {}, [el('div.k', { text: 'Line out' }), this._lineV]),
      el('div.fsh-num.r', {}, [this._fishNm, el('div.fsh-stam', {}, [this._stam])]),
    ]);

    this._runL = el('div.ch', { text: '◀◀' });
    this._runMid = el('div.mid', { text: 'holding' });
    this._runR = el('div.ch', { text: '▶▶' });
    this._run = el('div.fsh-run', {}, [this._runL, this._runMid, this._runR]);

    const kk = (cap: string, lb: string) => {
      const node = el('div.kk', {}, [el('div.cap', { text: cap }), el('div.lb', { text: lb })]);
      return node;
    };
    this._keyA = kk('A', 'Lean left');
    this._keyE = kk('E', 'Reel');
    this._keyD = kk('D', 'Lean right');
    this._keys = el('div.fsh-keys', {}, [this._keyA, this._keyE, this._keyD]);

    this._castF = el('div.f');
    this._cast = el('div.fsh-cast', {}, [el('div.bed'), this._castF]);

    this._cardNm = el('div.nm', { text: '' });
    this._cardKg = el('div.kg', { text: '' });
    this._card = el('div.fsh-card', {}, [this._cardNm, this._cardKg]);

    this._live = el('div', { style: 'display:flex;flex-direction:column;align-items:center;gap:13px;width:100%' }, [
      this._gauge, this._rowLine, this._run,
    ]);

    this.root = el('div#fishing.off', {}, [
      this._veil,
      el('div.fsh', {}, [this._cap, this._sub, this._cast, this._card, this._live, this._keys]),
    ]);
    host.appendChild(this.root);
  }

  /** Hide the whole layer. */
  hide() { this.root.classList.add('off'); }

  /**
   * Redraw from the view. Called every frame while a cast is live; every
   * animated value is written here rather than by CSS, so a frame captured
   * after N fixed steps is reproducible.
   */
  draw(v: FishingView) {
    this.root.classList.remove('off');
    const [cap, tone] = CAPTION[v.phase];
    this._cap.textContent = v.phase === 'wait' || v.phase === 'cast' || v.phase === 'flight'
      ? `${cap} · ${v.spot}` : cap;
    this._cap.className = `fsh-cap${tone ? ` ${tone}` : ''}`;
    this._sub.textContent = v.note;

    const casting = v.phase === 'cast' || v.phase === 'flight';
    const fighting = v.phase === 'fight' || v.phase === 'bite';
    const over = v.phase === 'landed' || v.phase === 'lost';

    this._cast.style.display = casting ? '' : 'none';
    this._castF.style.width = `${(v.power * 100).toFixed(1)}%`;
    this._live.style.display = fighting ? '' : 'none';
    this._card.style.display = over ? '' : 'none';
    this._keys.style.display = fighting ? '' : 'none';

    if (fighting) {
      const t = Math.min(1, Math.max(0, v.tension));
      this._fill.style.width = `${(t * 99).toFixed(1)}%`;
      // Ice while there is room, gold as it closes on the band, red inside it.
      // The strain timer bleeds the red toward white so the last half-second
      // before a snap is unmistakable without a keyframe.
      const col = t < 0.55 ? 'var(--ice)'
        : t < 0.82 ? 'var(--gold)'
          : `rgb(${226 + Math.round(v.strain * 29)}, ${92 - Math.round(v.strain * 40)}, ${86 - Math.round(v.strain * 40)})`;
      this._fill.style.background = col;
      this._fill.style.boxShadow = t > 0.82 ? `0 0 ${(8 + v.strain * 22).toFixed(0)}px rgba(226,92,86,.85)` : 'none';
      this._tick.style.left = `${(82).toFixed(0)}%`;

      this._lineV.innerHTML = `${v.line.toFixed(1)}<small>M</small>`;
      this._fishNm.textContent = v.fishName;
      this._stam.style.width = `${(Math.max(0, v.stamina) * 100).toFixed(1)}%`;
      this._stam.style.background = v.stamina > 0.4 ? 'var(--ice)' : 'var(--gold)';

      const counterL = v.run === 1 && v.tilt === -1;
      const counterR = v.run === -1 && v.tilt === 1;
      this._runL.className = `ch${v.run === -1 ? ' on' : counterL ? ' counter' : ''}`;
      this._runR.className = `ch${v.run === 1 ? ' on' : counterR ? ' counter' : ''}`;
      this._runMid.textContent = v.run === 0 ? 'tiring' : 'running';
      this._keyE.className = `kk${v.reeling ? ' on' : ''}`;
      this._keyA.className = `kk${v.tilt === -1 ? ' on' : ''}`;
      this._keyD.className = `kk${v.tilt === 1 ? ' on' : ''}`;
    }

    if (over) {
      this._cardNm.textContent = v.fishName;
      this._cardKg.textContent = v.phase === 'landed'
        ? `${v.kg.toFixed(1)} kg`
        : '';
      this._cardKg.className = v.phase === 'landed' ? 'kg' : 'no';
      if (v.phase === 'lost') this._cardKg.textContent = 'The line went slack.';
    }
  }

  dispose() { this.root.remove(); }
}
