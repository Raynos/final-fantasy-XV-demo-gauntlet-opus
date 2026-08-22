import { el, svg, clamp, easeOut } from './UIKit.ts';
import { icon, dpad } from './Icons.ts';
import { readWeapons } from './GameData.ts';

const POS = { up: [84, 26], right: [142, 84], down: [84, 142], left: [26, 84] };

/**
 * Bottom-right weapon / action wheel: four equipped slots laid out on a
 * diamond around a d-pad hub, with the active slot lit and the weapon's name
 * called out above.
 */
export class WeaponWheel {
  _capKey!: any;
  active!: number;
  built!: boolean;
  cap!: HTMLElement;
  capKind!: HTMLElement;
  capName!: HTMLElement;
  col!: HTMLElement;
  hub!: HTMLElement;
  hubPad!: any;
  root!: HTMLElement;
  slots!: any[];
  spokes!: SVGElement;
  wheel!: HTMLElement;
  constructor(parent: HTMLElement) {
    this.root = el('div.hud-corner.br');
    this.col = el('div.wpn-col');
    this.cap = el('div.wpn-cap');
    this.capName = el('div.nm');
    this.capKind = el('div.kd');
    this.cap.appendChild(this.capName);
    this.cap.appendChild(this.capKind);

    this.wheel = el('div.wheel');
    this.spokes = svg('svg.wheel-spokes', { viewBox: '0 0 168 168' });
    this.wheel.appendChild(this.spokes);
    this.hub = el('div.wheel-hub');
    this.slots = [];

    this.col.appendChild(this.cap);
    this.col.appendChild(this.wheel);
    this.root.appendChild(this.col);
    parent.appendChild(this.root);
    this.active = 0;
    this.built = false;
  }

  _build(weapons: any) {
    for (const w of weapons) {
      const [x, y] = POS[w.slot as keyof typeof POS] || POS.up;
      this.spokes.appendChild(svg('line', {
        x1: 84, y1: 84, x2: x, y2: y,
        stroke: 'rgba(196,220,250,.16)', 'stroke-width': 1,
      }));
    }
    // faint diamond outline connecting the slots
    this.spokes.appendChild(svg('path', {
      d: 'M84 26 142 84 84 142 26 84Z', fill: 'none',
      stroke: 'rgba(196,220,250,.10)', 'stroke-width': 1,
    }));
    this.wheel.appendChild(this.hub);
    this.hub.appendChild(dpad('up', 26));
    this.hubPad = this.hub.firstChild;

    weapons.forEach((w: any, i: any) => {
      const [x, y] = POS[w.slot as keyof typeof POS] || POS.up;
      const node = el('div.wslot', { style: `left:${x}px;top:${y}px` }, [
        el('div.ring'),
        icon(w.key, { size: 21, stroke: 1.2 }),
        w.element ? el('div.wel', {}, [icon(w.element, { size: 11, stroke: 1.4 })]) : null,
      ]);
      this.wheel.appendChild(node);
      this.slots.push({ node, w, i });
    });
    this.built = true;
  }

  /** @param i index of the equipped slot to light up */
  setActive(i: number) { this.active = i; }

  /**
   * @param dt seconds
   * @param appear 0..1 master reveal
   */
  update(dt: number, game: any, appear: number) {
    const weapons = readWeapons(game);
    if (!this.built) this._build(weapons);

    const live = game?.get?.('Combat')?.activeWeapon;
    if (typeof live === 'number') this.active = live;
    const act = weapons[this.active] || weapons[0];

    if (this._capKey !== act.name) {
      this.capName.textContent = act.name;
      this.capKind.textContent = `${act.kind}   ·   ATK ${act.atk}`;
      this._capKey = act.name;
      const dir = act.slot || 'up';
      this.hub.replaceChild(dpad(dir, 26), this.hubPad);
      this.hubPad = this.hub.firstChild;
    }

    const e = easeOut(clamp((appear - 0.10) / 0.7, 0, 1));
    this.root.style.opacity = e.toFixed(3);
    this.root.style.transform = `translateX(${((1 - e) * 26).toFixed(2)}px)`;

    for (const s of this.slots) {
      const on = s.i === this.active;
      if (s._on !== on) { s.node.classList.toggle('on', on); s._on = on; }
      if (on) {
        const pulse = 0.5 + 0.5 * Math.sin(game.time.now * 2.1);
        s.node.style.boxShadow = `0 4px 16px rgba(0,0,0,.5), 0 0 ${(12 + 8 * pulse).toFixed(1)}px rgba(140,196,255,${(0.28 + 0.16 * pulse).toFixed(3)})`;
        s.node.style.transform = `scale(${(1.06 + 0.02 * pulse).toFixed(3)})`;
      } else if (s._hadGlow !== false) {
        s.node.style.boxShadow = ''; s.node.style.transform = '';
      }
      s._hadGlow = on;
    }
  }
}
