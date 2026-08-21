import { el, svg, clamp, easeOut, clock } from './UIKit.ts';
import { icon } from './Icons.ts';
import { QUEST, hudState, readQuest, readMarkers } from './GameData.ts';

const W = 330, H = 34, SPAN = 78;      // degrees of heading visible across the strip
const CARDINAL = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
const MARK_COL = { quest: '#e8cf98', hunt: '#e0644a', haven: '#b6d6f8', deposit: '#a68fd0' };
/** How many world markers the strip will carry at once. */
const MAX_MARKS = 8;

/** Region key -> what the location block prints. */
const REGION_NAME = {
  leide: ['Leide', 'Longwythe Region'],
  duscae: ['Duscae', 'Alstor Slough'],
  cleigne: ['Cleigne', 'Vesperpool'],
  insomnia: ['Insomnia', 'The Crown City'],
};

const wrap180 = (d: any) => { let x = ((d + 180) % 360 + 360) % 360 - 180; return x; };

/**
 * Top-right compass strip with cardinal ticks and world-space quest markers,
 * plus the in-game clock, current region and the tracked objective.
 */
export class CompassBar {
  _area!: any;
  _day!: any;
  _dist!: any;
  _qs!: any;
  _qt!: any;
  _sub!: any;
  _time!: any;
  box!: any;
  dayEl!: any;
  locEl!: any;
  locSub!: any;
  marks!: any[];
  qDist!: any;
  qName!: any;
  qStep!: any;
  root!: any;
  strip!: any;
  svg!: any;
  ticks!: any[];
  timeEl!: any;
  constructor(parent: HTMLElement) {
    this.root = el('div.hud-corner.tr');
    this.box = el('div.compass');

    this.timeEl = el('div.clock-time', { text: '00:00' });
    this.dayEl = el('div.clock-day', { text: 'M.E. 756  ·  DAY 1' });
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
    // A caption over the tracked quest. Without it the two lines below read as
    // decoration; with it they read as "this is the thing to go and do", which
    // is the one question a player of an unfamiliar build actually has.
    this.box.appendChild(el('div.q-cap', { text: 'Objective' }));
    this.box.appendChild(el('div.quest-line', {}, [
      icon('compassPin', { size: 13, stroke: 1.3 }), this.qName, this.qDist,
    ]));
    this.qStep = el('div.quest-step', { text: QUEST.step });
    this.box.appendChild(this.qStep);

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
    // World markers — quest waypoints and havens, projected onto the strip by
    // their real bearing from the player. Built once as a pool and reassigned
    // each frame so the marker list can change without touching the DOM.
    this.marks = [];
    for (let i = 0; i < MAX_MARKS; i++) {
      const g = svg('g', { opacity: 0 });
      const head = svg('path', {
        d: 'M0 -4 3.1 0 0 4 -3.1 0Z', fill: '#b6d6f8', opacity: 0.95,
        transform: 'translate(0 6)',
      });
      g.appendChild(head);
      this.svg.appendChild(g);
      this.marks.push({ g, head, col: '' });
    }
  }

  /**
   * @param dt seconds
   * @param appear 0..1 master reveal
   */
  update(dt: number, game: any, appear: number) {
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
    // world markers, sorted so the nearest few always get a slot
    const p = game.get?.('Player')?.position;
    const all = readMarkers(game);
    let list: any[] = [];
    if (all && p) {
      list = all
        .map((m) => ({ ...m, dist: Math.hypot(m.x - p.x, m.z - p.z) }))
        .sort((a, b) => (b.tracked ? 1 : 0) - (a.tracked ? 1 : 0) || a.dist - b.dist)
        .slice(0, MAX_MARKS);
    }
    for (let i = 0; i < this.marks.length; i++) {
      const mk = this.marks[i];
      const m = list[i];
      if (!m) { if (mk._on !== false) { mk.g.setAttribute('opacity', 0); mk._on = false; } continue; }
      mk._on = true;
      const col = MARK_COL[m.kind] || '#b6d6f8';
      if (mk.col !== col) { mk.head.setAttribute('fill', col); mk.col = col; }
      const bearing = Math.atan2(m.x - p.x, m.z - p.z) * 180 / Math.PI;
      const d = wrap180(bearing - yaw);
      const clamped = clamp(d, -SPAN * 0.5, SPAN * 0.5);
      const x = W * 0.5 + (clamped / SPAN) * W;
      mk.g.setAttribute('transform', `translate(${x.toFixed(2)} 0)`);
      mk.g.setAttribute('opacity', (Math.abs(d) > SPAN * 0.5 ? 0.34 : m.tracked ? 1 : 0.8).toFixed(2));
    }

    // clock: the RPG day cycle owns it and stays in step with the sky
    const hs = hudState(game);
    const sky = game.get?.('Sky');
    const hours = typeof sky?.timeOfDay === 'number' ? sky.timeOfDay
      : typeof sky?.hours === 'number' ? sky.hours : 14.0;
    const txt = hs ? hs.clock : clock(hours);
    if (txt !== this._time) { this.timeEl.textContent = txt; this._time = txt; }
    const day = hs ? `M.E. 756  ·  DAY ${hs.day}  ·  ${hs.phase.toUpperCase()}` : 'M.E. 756  ·  DAY 41';
    if (day !== this._day) { this.dayEl.textContent = day; this._day = day; }

    const dir = game.get?.('Director');
    const q = readQuest(game);
    const region = REGION_NAME[q.region] || REGION_NAME.leide;
    const area = dir?.areaName || dir?.region || region[0];
    const sub = dir?.areaSub || region[1];
    if (area !== this._area) { this.locEl.textContent = area; this._area = area; }
    if (sub !== this._sub) { this.locSub.textContent = sub; this._sub = sub; }

    // the tracked objective, its text, and the real metre distance to it
    if (q.title !== this._qt) { this.qName.textContent = q.title; this._qt = q.title; }
    if (q.step !== this._qs) { this.qStep.textContent = q.step; this._qs = q.step; }
    // a waypointed objective shows metres; a gather or craft objective has no
    // place to point at, and its own line already carries the count
    const dist = q.live
      ? (q.waypoint ? `${q.dist.toLocaleString()} m` : '')
      : `${Math.max(30, Math.round(QUEST.dist - Math.hypot(p?.x || 0, p?.z || 0) * 3.2))} m`;
    if (dist !== this._dist) { this.qDist.textContent = dist; this._dist = dist; }
  }
}
