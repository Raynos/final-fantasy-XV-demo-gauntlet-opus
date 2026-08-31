import { el, svg } from '../UIKit.ts';

/**
 * "Turn your phone sideways."
 *
 * The first device report was *"it doesn't tell me to flip phone, it's just
 * whack"*, and the frame showed exactly why: in portrait the control fan, the
 * minimap and the party bars all land in the middle third of a 390x844 screen,
 * on top of the character. Nothing was wrong with the layout — it was authored
 * against 844x390 and simply never told anybody.
 *
 * This is not a preference. The HUD, the letterbox, the compass strip and the
 * camera's own framing are all authored 16:9, and a portrait phone is 1:2.2 —
 * that is not a layout you tune, it is a different design. So portrait gets an
 * honest gate rather than a bad game.
 *
 * **With a way through.** A gate a player cannot dismiss is a gate that traps
 * anybody whose rotation lock is on — which is most people, most of the time,
 * and it is a setting a web page cannot read or change. So the card carries
 * "play anyway", the choice sticks for the session, and the gate never returns
 * once it has been dismissed.
 */

/** Below this aspect the page is portrait enough to be unplayable. */
const MIN_ASPECT = 1.15;
const KEY = 'ffxv:rotated';

const CSS = `
#rotate {
  position: fixed; inset: 0; z-index: 40;
  display: none;
  align-items: center; justify-content: center;
  background: #05080e;
  color: var(--ink, #eef4fd);
  font-family: var(--ui-font, system-ui);
  text-align: center;
  padding: 24px;
  zoom: 1;
}
#rotate.on { display: flex; }
#rotate .rot-in { max-width: 340px; }
#rotate .rot-ico { width: 96px; height: 96px; margin: 0 auto 26px; display: block;
  fill: none; stroke: var(--gold, #e8cf98); stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
#rotate h2 { margin: 0 0 12px; font-size: 17px; font-weight: 500;
  letter-spacing: 0.22em; text-transform: uppercase; color: var(--ink, #eef4fd); }
#rotate p { margin: 0 0 28px; font-size: 13px; line-height: 1.65;
  color: var(--ink-3, rgba(210,224,246,.56)); letter-spacing: 0.01em; }
#rotate button {
  -webkit-appearance: none; appearance: none;
  background: transparent; cursor: pointer;
  border: 1px solid var(--hair, rgba(206,224,250,.26));
  color: var(--ink-2, rgba(228,238,252,.72));
  font: inherit; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase;
  padding: 12px 22px;
}
#rotate button:active { background: rgba(182,214,248,.16); }
`;

export class RotateGate {
  root: HTMLElement;
  _dismissed: boolean;
  _onResize: () => void;

  constructor(host: HTMLElement) {
    let seen = false;
    try { seen = sessionStorage.getItem(KEY) === '1'; } catch { /* private mode */ }
    this._dismissed = seen;

    const style = document.createElement('style');
    style.id = 'rotate-css';
    style.textContent = CSS;
    document.head.appendChild(style);

    // A phone, on its side, with an arrow around it.
    const ico = svg('svg.rot-ico', { viewBox: '0 0 48 48' }, [
      svg('rect', { x: '9', y: '15', width: '30', height: '18', rx: '3' }),
      svg('path', { d: 'M15 15 v18' }),
      svg('path', { d: 'M24 6 a12 12 0 0 1 11 8 M35 14 h-6 M35 14 v-6' }),
      svg('path', { d: 'M24 42 a12 12 0 0 1 -11 -8 M13 34 h6 M13 34 v6' }),
    ]);

    const play = el('button', { text: 'Play anyway', type: 'button' });
    play.addEventListener('click', () => {
      this._dismissed = true;
      try { sessionStorage.setItem(KEY, '1'); } catch { /* private mode */ }
      this.check();
    });

    this.root = el('div', { id: 'rotate' }, [
      el('div.rot-in', {}, [
        ico,
        el('h2', { text: 'Turn your phone sideways' }),
        el('p', { text: 'Eos needs a wide screen.' }),
        play,
      ]),
    ]);
    host.appendChild(this.root);

    this._onResize = () => this.check();
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    this.check();
  }

  /** Is the viewport too tall and narrow to play in? */
  get portrait(): boolean {
    return window.innerWidth / Math.max(1, window.innerHeight) < MIN_ASPECT;
  }

  check() {
    const on = this.portrait && !this._dismissed;
    this.root.classList.toggle('on', on);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    this.root.remove();
  }
}
