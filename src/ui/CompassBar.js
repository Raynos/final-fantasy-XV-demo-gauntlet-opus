import { el, svg, clamp, easeOut, clock } from './UIKit.js';
import { icon } from './Icons.js';
import { QUEST, MAP_PINS } from './GameData.js';

const W = 330, H = 34, SPAN = 78;      // degrees of heading visible across the strip
const CARDINAL = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
const DAYS = ['M.E. 756  ·  DAY 41'];

const wrap180 = (d) => { let x = ((d + 180) % 360 + 360) % 360 - 180; return x; };

/**
 * Top-right compass strip with cardinal ticks and world-space quest markers,
 * plus the in-game clock, current region and the tracked objective.
 */
export class CompassBar {
  /** @param {HTMLElement} parent */
  constructor(parent) {
    this.root = el('div.hud-corner.tr');
    this.box = el('div.compass');

    this.timeEl = el('div.clock-time', { text: '00:00' });
    this.dayEl = el('div.clock-day', { text: DAYS[0] });
    this.locEl = el('div.loc-name', { text: 'Leide' });
    this.locSub = el('div.loc-sub', { text: 'Longwythe Region' });

    this.box.appendChild(el('div.compass-head', {}, [
      el('div', {}, [this.timeEl, this.dayEl]),
      el('div', {}, [this.locEl, this.locSub]),
    ]));
    this.box.appendChild(el('div.rule'));

    this.strip = el('div.compass-strip');
    this.svg = svg('svg.ticks', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none' });
    this.strip.appendChild(this.svg);
    this.strip.appendChild(el('div.compass-needle'));
    this.box.appendChild(this.strip);
    this.box.appendChild(el('div.rule'));

    this.qName = el('div.qt', { text: QUEST.title });
    this.qDist = el('div.qd', { text: `${QUEST.dist} m` });
    this.box.appendChild(el('div.quest-line', {}, [
      icon('compassPin', { size: 13, stroke: 1.3 }), this.qName, this.qDist,
    ]));
    this.box.appendChild(el('div.quest-step', { text: QUEST.step }));

    this.root.appendChild(this.box);
    parent.appendChild(this.root);
    this._buildTicks();
  }

  _buildTicks() {
    this.ticks = [];
    for (let deg = 0; deg < 360; deg += 15) {
      const card = CARDINAL[deg];
      const g = svg('g');
      const isMajor = deg % 45 === 0;
      g.appendChild(svg('line', {
        x1: 0, y1: isMajor ? 2 : 6, x2: 0, y2: isMajor ? 11 : 10,
        stroke: isMajor ? 'rgba(238,247,255,.88)' : 'rgba(206,226,250,.46)', 'stroke-width': 1,
      }));
      if (card) {
        g.appendChild(svg('text', {
          x: 0, y: 25, 'text-anchor': 'middle', fill: card.length === 1 ? '#ffffff' : 'rgba(206,224,248,.66)',
          'font-size': card.length === 1 ? 12 : 8.5, 'font-weight': card.length === 1 ? 400 : 300,
          'letter-spacing': 1.6, 'font-family': 'inherit',
        }, [card]));
      }
      this.svg.appendChild(g);
      this.ticks.push({ deg, g });
    }
    // world markers: quest pins projected onto the strip by bearing
    this.marks = MAP_PINS.slice(0, 4).map((p, i) => {
      const bearing = (i * 71 + 24) % 360;
      const g = svg('g');
      const col = p.kind === 'quest' ? '#e8cf98' : p.kind === 'hunt' ? '#e0644a' : '#b6d6f8';
      g.appendChild(svg('path', {
        d: 'M0 -4 3.1 0 0 4 -3.1 0Z', fill: col, opacity: 0.95,
        transform: 'translate(0 6)',
      }));
      this.svg.appendChild(g);
      return { bearing, g };
    });
  }

  /**
   * @param {number} dt seconds
   * @param {object} game
   * @param {number} appear 0..1 master reveal
   */
  update(dt, game, appear) {
    const e = easeOut(clamp((appear - 0.04) / 0.7, 0, 1));
    this.root.style.opacity = e.toFixed(3);
    this.root.style.transform = `translateY(${((1 - e) * -18).toFixed(2)}px)`;

    // heading: camera forward, north = -Z
    let yaw = 0;
    const cam = game.camera;
    if (cam) {
      const m = cam.matrixWorld.elements;
      yaw = Math.atan2(-m[8], -m[10]) * 180 / Math.PI;
    }
    for (const t of this.ticks) {
      const d = wrap180(t.deg - yaw);
      if (Math.abs(d) > SPAN * 0.5 + 8) { if (t._vis !== false) { t.g.style.display = 'none'; t._vis = false; } continue; }
      if (t._vis === false) { t.g.style.display = ''; t._vis = true; }
      const x = W * 0.5 + (d / SPAN) * W;
      t.g.setAttribute('transform', `translate(${x.toFixed(2)} 0)`);
    }
    for (const mk of this.marks) {
      const d = wrap180(mk.bearing - yaw);
      const clamped = clamp(d, -SPAN * 0.5, SPAN * 0.5);
      const x = W * 0.5 + (clamped / SPAN) * W;
      mk.g.setAttribute('transform', `translate(${x.toFixed(2)} 0)`);
      mk.g.setAttribute('opacity', Math.abs(d) > SPAN * 0.5 ? 0.34 : 1);
    }

    const sky = game.get?.('Sky');
    const hours = typeof sky?.timeOfDay === 'number' ? sky.timeOfDay
      : typeof sky?.hours === 'number' ? sky.hours : 14.0;
    const txt = clock(hours);
    if (txt !== this._time) { this.timeEl.textContent = txt; this._time = txt; }

    const dir = game.get?.('Director');
    const area = dir?.areaName || dir?.region;
    if (area && area !== this._area) {
      this.locEl.textContent = area;
      if (dir?.areaSub) this.locSub.textContent = dir.areaSub;
      this._area = area;
    }

    // distance to the tracked objective ticks down as the player walks
    const p = game.get?.('Player')?.position;
    if (p) {
      const d = Math.round(QUEST.dist - Math.hypot(p.x, p.z) * 3.2);
      const s = `${Math.max(30, d)} m`;
      if (s !== this._dist) { this.qDist.textContent = s; this._dist = s; }
    }
  }
}
