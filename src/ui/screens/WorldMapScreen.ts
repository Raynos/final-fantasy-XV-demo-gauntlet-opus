import { el, clamp, easeOut, easeOutQuint, damp } from '../UIKit.ts';
import { worldMap, WORLD, POI_TYPES, REGIONS } from '../../world/map/WorldMap.ts';
import { getChart } from '../../world/map/Chart.ts';
import {
  drawRoads, drawJunctions, drawZoneBorders, spacedText, spacedWidth, LabelPlacer, routeClass,
} from '../../world/map/MapDraw.ts';
import { drawGlyph, glyphSvg, POI_GLYPH } from '../../world/map/MapGlyphs.ts';
import { fog } from '../../world/map/FogOfWar.ts';

/**
 * THE CHART OF LUCIS — the full-screen atlas.
 *
 * The relief is the real heightfield, baked once by `world/map/Chart.js`; the
 * roads are the real road graph; the nineteen regions are the real zone
 * fields, bordered where their influence changes hands. Everything else is
 * atlas convention: type that fades in by zoom the way sheet labels do, a
 * measured line from the player to whatever is selected, distance and drive
 * time to it, and unsurveyed country under a parchment haze.
 *
 * Controls
 *   ↑↓        step the filter rail          ←→   step the selection
 *   Enter     fast travel, where allowed    wheel / +- zoom about the cursor
 *   drag      pan                           click  select
 *
 * No CSS transitions or keyframes: every animated value is written per frame
 * from `dt` and `game.time.now`, so a capture after N fixed steps is
 * reproducible.
 */

const FILTERS = [
  { id: 'all', label: 'All Points', types: null, glyph: 'quest' },
  { id: 'settle', label: 'Settlements', types: ['town', 'outpost', 'reststop'], glyph: 'town' },
  { id: 'haven', label: 'Havens', types: ['haven'], glyph: 'haven' },
  { id: 'parking', label: 'Parking', types: ['parking'], glyph: 'parking' },
  { id: 'dungeon', label: 'Dungeons', types: ['dungeon', 'menace'], glyph: 'dungeon' },
  { id: 'tomb', label: 'Royal Tombs', types: ['tomb'], glyph: 'tomb' },
  { id: 'imperial', label: 'Imperial', types: ['imperial'], glyph: 'imperial' },
  { id: 'chocobo', label: 'Chocobo', types: ['chocobo'], glyph: 'chocobo' },
  { id: 'fishing', label: 'Fishing', types: ['fishing'], glyph: 'fishing' },
  { id: 'landmark', label: 'Landmarks', types: ['landmark'], glyph: 'landmark' },
];

/**
 * Css px per world metre.
 *
 * Step 0 is the fit-all: `WORLD.size` is 8192 m and the sheet is 1520x676, so
 * the continent fits at `676 / 8192 = 0.0825` px/m (height binds, not width —
 * width would allow 0.1855). The old first step of 0.118 was documented as
 * "fits the whole continent" and did not: it puts the field 967 px tall in a
 * 676 px box, so a third of Lucis was always off the sheet and the region
 * names — which fade out above 0.205 px/m — had nowhere legible to land.
 */
const ZOOMS = [0.0825, 0.118, 0.175, 0.26, 0.38, 0.55];

/** Default step. Index 3 (0.26 px/m) is the scale the chart opens at. */
const HOME_ZOOM = 3;

/** Chart geometry inside the 1600×900 menu space. */
const BOX = { x: 40, y: 132, w: 1520, h: 676 };

/**
 * The atlas sheet is square, because Lucis is: at the fit-all scale the
 * continent is 676x676 inside a 1520-wide frame, and the 422 px of empty sheet
 * either side reads as a printing error rather than as margin. Hugging the
 * landmass puts the filter rail, the sheet and the detail card on three even
 * columns instead.
 */
const ATLAS_BOX = { x: Math.round((1600 - BOX.h) / 2), y: BOX.y, w: BOX.h, h: BOX.h };

const SETTLED = ['town', 'outpost', 'reststop', 'chocobo'];

export class WorldMapScreen {
  _drag!: any;
  _onResize!: any;
  card!: any;
  _a!: number;
  _cardKey!: string;
  _cursor!: any;
  _keys!: any;
  _regionPlaced!: any[] | null;
  _rowEls!: any;
  _screenPos!: Map<any, any>;
  atlas!: boolean;
  cam!: any;
  camT!: any;
  canvas!: any;
  cardDoes!: any;
  cardFt!: any;
  cardGlyph!: any;
  cardName!: any;
  cardRows!: any;
  cardType!: any;
  chart!: any;
  ctx!: any;
  dpr!: any;
  filter!: number;
  filterEls!: any;
  game!: any;
  h!: any;
  hover!: any;
  list!: any;
  map!: any;
  menus!: any;
  rail!: any;
  scaleBar!: any;
  scaleLine!: any;
  scaleTxt!: any;
  sel!: number;
  sub!: any;
  survey!: any;
  surveyV!: any;
  title!: any;
  w!: any;
  wrap!: any;
  zoom!: any;
  zoomI!: number;
  /**
   * @param [opts] `atlas: true` registers the second,
   *   fully-surveyed variant: the whole continent at the fit-all scale with no
   *   unsurveyed haze and every point plotted. It reads the fog as fully
   *   revealed rather than calling `fog.revealAll()`, because the mask is
   *   shared with the minimap and the ordinary chart — mutating it here would
   *   make `menu_world` depend on whether `menu_map_wide` was captured first,
   *   which is exactly the order-dependence the capture harness forbids.
   */
  constructor(menus: import('../Menus.ts').Menus, opts: {atlas?:boolean} = {}) {
    this.menus = menus;
    this.atlas = !!opts.atlas;
    this.title = this.atlas ? 'Atlas' : 'Map';
    this.sub = this.atlas
      ? 'Lucis  ·  The full survey'
      : 'Lucis  ·  Leide · Duscae · Cleigne';
    this.filter = 0;
    this.zoomI = this.atlas ? 0 : HOME_ZOOM;
    this.zoom = ZOOMS[this.zoomI];
    this.cam = { x: 0, z: 0 };
    this.camT = { x: 0, z: 0 };
    this.sel = 0;
    this.hover = null;
    this._a = 0;
    this._drag = null;
    this._screenPos = new Map();
  }

  /** @param root @param game */
  build(root: HTMLElement, game: any) {
    this.game = game;
    this.map = worldMap;
    // the styles key off `.wm`, not the screen slot, so the same screen can be
    // registered under more than one name without losing its chrome
    root.classList.add('wm');
    const st = styleTag();
    if (st) root.appendChild(st);

    this.wrap = el('div.wm-wrap');
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'wm-canvas';
    this.wrap.appendChild(this.canvas);
    root.appendChild(this.wrap);
    this.ctx = this.canvas.getContext('2d');

    // ---- filter rail -----------------------------------------------------
    this.filterEls = FILTERS.map((f, i) => {
      const count = el('div.wm-fcount', { text: '' });
      const n = el('div.wm-filter', {}, [
        el('div.wm-fmark', {}, [glyphSvg(f.glyph, { size: 15 })]),
        el('div.wm-flabel', { text: f.label.toUpperCase() }),
        count,
      ]);
      n.addEventListener('pointerdown', () => this._setFilter(i));
      if (i === 0) n.classList.add('on');
      n._count = count;
      return n;
    });
    this.rail = el('div.wm-rail.plate', {}, [
      el('div.wm-rail-h', { text: 'Filter' }),
      el('div.rule'),
      ...this.filterEls,
    ]);
    root.appendChild(this.rail);

    // ---- detail card -----------------------------------------------------
    this.cardGlyph = el('div.wm-cglyph');
    this.cardName = el('div.wm-name', { text: '' });
    this.cardType = el('div.wm-type', { text: '' });
    this.cardDoes = el('div.wm-does', { text: '' });
    this.cardRows = el('div.wm-rows');
    this.cardFt = el('div.wm-ft', { text: '' });
    this.card = el('div.wm-card.plate', {}, [
      el('div.wm-chead', {}, [this.cardGlyph, el('div', {}, [this.cardName, this.cardType])]),
      el('div.rule'), this.cardDoes, this.cardRows, this.cardFt,
    ]);
    root.appendChild(this.card);

    // ---- scale bar and survey read-out -----------------------------------
    this.scaleLine = el('div.wm-scaleline');
    this.scaleTxt = el('div.wm-scaletxt', { text: '' });
    this.scaleBar = el('div.wm-scalebar', {}, [this.scaleTxt, this.scaleLine]);
    root.appendChild(this.scaleBar);

    this.surveyV = el('div.wm-surveyv', { text: '' });
    this.survey = el('div.wm-survey', {}, [
      el('div.wm-surveyk', { text: 'Surveyed' }), this.surveyV,
    ]);
    root.appendChild(this.survey);

    this._bindPointer();
    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
    this._resize();
  }

  _resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const box = this.atlas ? ATLAS_BOX : BOX;
    this.w = box.w; this.h = box.h; this.dpr = dpr;
    this.canvas.width = Math.round(box.w * dpr);
    this.canvas.height = Math.round(box.h * dpr);
    this.canvas.style.width = `${box.w}px`;
    this.canvas.style.height = `${box.h}px`;
    if (this.atlas) {
      this.wrap.style.left = `${box.x}px`;
      this.wrap.style.top = `${box.y}px`;
      this.wrap.style.width = `${box.w}px`;
      this.wrap.style.height = `${box.h}px`;
    }
  }

  // ------------------------------------------------------------- lifecycle

  /** Called by Menus when the screen becomes visible. */
  enter(game: any) {
    this.game = game;
    const t = game.get('Terrain');
    if (!this.chart) this.chart = getChart(t);
    const p = game.get('Player');
    if (p) { this.cam.x = this.camT.x = p.position.x; this.cam.z = this.camT.z = p.position.z; }
    this.zoom = ZOOMS[this.zoomI];
    this._rebuildList();
    if (this.atlas) {
      // the atlas is a sheet of the whole continent, not a view of where the
      // player happens to be standing: centre the field, not the party
      this.cam.x = this.camT.x = 0;
      this.cam.z = this.camT.z = 0;
      this.zoomI = 0;
      this.zoom = ZOOMS[0];
    } else {
      const near = this.map.nearestPOI(this.cam.x, this.cam.z, { discoveredOnly: true });
      if (near) {
        const i = this.list.indexOf(near.poi);
        if (i >= 0) this.sel = i;
      }
      const sp = this.list[this.sel];
      if (sp) { this.camT.x = sp.x; this.camT.z = sp.z; }
    }
    this._keys = (e: any) => this._onKey(e);
    window.addEventListener('keydown', this._keys);
  }

  exit() {
    if (this._keys) window.removeEventListener('keydown', this._keys);
    this._keys = null;
    this.hover = null;
    this._drag = null;
  }

  /**
   * Has the player charted this point? On the atlas every point is charted by
   * definition — that is what "fully surveyed" means.
   * @param p @returns 
   */
  _known(p: any): boolean { return this.atlas || this.map.discovered.has(p.id); }

  _rebuildList() {
    const f = FILTERS[this.filter];
    const seen = (p: any) => this._known(p) || fog.at(p.x, p.z) > 0.5;
    this.list = this.map.pois.filter((p: any) => seen(p) && (!f.types || f.types.includes(p.type)));
    if (!this.list.length) this.list = this.map.pois.filter(seen);
    this.sel = clamp(this.sel, 0, Math.max(0, this.list.length - 1));
    for (let i = 0; i < FILTERS.length; i++) {
      const ff = FILTERS[i];
      const n = this.map.pois.filter((p: any) => seen(p) && (!ff.types || ff.types.includes(p.type))).length;
      this.filterEls[i]._count.textContent = String(n);
    }
  }

  _setFilter(i: any) {
    this.filter = (i + FILTERS.length) % FILTERS.length;
    for (let k = 0; k < this.filterEls.length; k++) {
      this.filterEls[k].classList.toggle('on', k === this.filter);
    }
    this._rebuildList();
    const p = this.list[this.sel];
    if (p) { this.camT.x = p.x; this.camT.z = p.z; }
  }

  // ----------------------------------------------------------------- input

  /**
   * D-pad: up/down steps the filter rail, left/right steps the selection and
   * pans the chart to it.
   */
  nav(dx: any, dy: any) {
    if (dy) this._setFilter(this.filter + (dy > 0 ? 1 : -1));
    if (dx && this.list.length) {
      this.sel = (this.sel + (dx > 0 ? 1 : -1) + this.list.length) % this.list.length;
    }
    const p = this.list[this.sel];
    if (p) { this.camT.x = p.x; this.camT.z = p.z; }
  }

  /** Fast travel to the selected point, if it allows it. */
  accept() {
    const p = this.list[this.sel];
    if (!p || !p.travel || !this.map.discovered.has(p.id)) return;
    const game = this.game;
    const player = game?.get('Player');
    const terrain = game?.get('Terrain');
    if (player && terrain && player.position) {
      player.position.set(p.x, terrain.heightAt(p.x, p.z) + 0.1, p.z);
      if (player.root) player.root.position.copy(player.position);
      if (player.velocity) player.velocity.set(0, 0, 0);
    }
    this.menus.setScreen(null);
  }

  /**
   * Step the scale. Passing a world position keeps that point pinned under the
   * cursor while the chart grows or shrinks around it.
   * @param dir -1 out, +1 in
   */
  zoomBy(dir: number, ax?: any, az?: any) {
    const i = clamp(this.zoomI + dir, 0, ZOOMS.length - 1);
    if (i === this.zoomI) return;
    const k = this.zoom / ZOOMS[i];
    this.zoomI = i;
    if (ax != null) {
      this.camT.x = clamp(ax - (ax - this.camT.x) * k, -WORLD.half, WORLD.half);
      this.camT.z = clamp(az - (az - this.camT.z) * k, -WORLD.half, WORLD.half);
    }
  }

  _onKey(e: any) {
    if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.code === 'KeyE') this.zoomBy(1);
    else if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.code === 'KeyQ') this.zoomBy(-1);
    else return;
    e.preventDefault();
  }

  _bindPointer() {
    const cv = this.canvas;
    const world = (ev: any) => {
      const r = cv.getBoundingClientRect();
      const px = (ev.clientX - r.left) / r.width * this.w;
      const py = (ev.clientY - r.top) / r.height * this.h;
      return {
        x: this.cam.x + (px - this.w / 2) / this.zoom,
        z: this.cam.z + (py - this.h / 2) / this.zoom,
        px, py,
      };
    };
    cv.addEventListener('pointerdown', (ev: any) => {
      const w = world(ev);
      this._drag = { x: w.x, z: w.z, cx: this.camT.x, cz: this.camT.z, moved: 0 };
      cv.setPointerCapture?.(ev.pointerId);
    });
    cv.addEventListener('pointermove', (ev: any) => {
      const w = world(ev);
      this._cursor = w;
      if (this._drag) {
        const dx = w.x - this._drag.x, dz = w.z - this._drag.z;
        this._drag.moved += Math.abs(dx) + Math.abs(dz);
        this.camT.x = clamp(this._drag.cx - dx, -WORLD.half, WORLD.half);
        this.camT.z = clamp(this._drag.cz - dz, -WORLD.half, WORLD.half);
        this.cam.x = this.camT.x; this.cam.z = this.camT.z;
        this._drag.x = this.cam.x + (w.px - this.w / 2) / this.zoom;
        this._drag.z = this.cam.z + (w.py - this.h / 2) / this.zoom;
      } else {
        this.hover = this._pick(w.px, w.py);
      }
    });
    cv.addEventListener('pointerup', (ev: any) => {
      const w = world(ev);
      if (this._drag && this._drag.moved < 12) {
        const hit = this._pick(w.px, w.py);
        if (hit) {
          const i = this.list.indexOf(hit);
          if (i >= 0) { this.sel = i; this.camT.x = hit.x; this.camT.z = hit.z; }
        }
      }
      this._drag = null;
      cv.releasePointerCapture?.(ev.pointerId);
    });
    cv.addEventListener('pointerleave', () => { this.hover = null; this._drag = null; });
    cv.addEventListener('wheel', (ev: any) => {
      const w = world(ev);
      this.zoomBy(ev.deltaY < 0 ? 1 : -1, w.x, w.z);
      ev.preventDefault();
    }, { passive: false });
  }

  /** Nearest drawn point within 16 css px of a chart position. */
  _pick(px: any, py: any) {
    let best: any = null, bd = 16 * 16;
    for (const [p, s] of this._screenPos) {
      const dx = s[0] - px, dy = s[1] - py;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // ------------------------------------------------------------------ frame

  /** @param dt @param game @param a */
  update(dt: number, game: any, a: number) {
    this._a = a;
    const t = game.time.now;
    const rev = easeOutQuint(clamp((a - 0.05) / 0.85, 0, 1));
    this.wrap.style.opacity = rev.toFixed(3);
    this.rail.style.opacity = easeOut(clamp((rev - 0.18) / 0.6, 0, 1)).toFixed(3);
    this.rail.style.transform = `translateX(${(-(1 - rev) * 18).toFixed(2)}px)`;
    this.card.style.opacity = easeOut(clamp((rev - 0.3) / 0.55, 0, 1)).toFixed(3);
    this.card.style.transform = `translateX(${((1 - rev) * 20).toFixed(2)}px)`;
    this.scaleBar.style.opacity = easeOut(clamp((rev - 0.4) / 0.5, 0, 1)).toFixed(3);
    this.survey.style.opacity = easeOut(clamp((rev - 0.44) / 0.5, 0, 1)).toFixed(3);

    this.cam.x = damp(this.cam.x, this.camT.x, 8, dt);
    this.cam.z = damp(this.cam.z, this.camT.z, 8, dt);
    this.zoom = damp(this.zoom, ZOOMS[this.zoomI], 9, dt);

    this._draw(game, t, rev);
    this._card(game);
  }

  _card(game: any) {
    const p = this.list?.[this.sel];
    if (!p) { this.cardName.textContent = ''; return; }
    const known = this._known(p);
    const player = game.get('Player');
    const px = player?.position?.x ?? 0, pz = player?.position?.z ?? 0;
    const zone = this.map.zoneById.get(p.zone);
    const region = zone ? this.map.regionById.get(zone.region) : null;
    const def = POI_TYPES[p.type as keyof typeof POI_TYPES];

    if (this._cardKey !== `${p.id}|${known}`) {
      this._cardKey = `${p.id}|${known}`;
      while (this.cardGlyph.firstChild) this.cardGlyph.removeChild(this.cardGlyph.firstChild);
      this.cardGlyph.appendChild(glyphSvg(known ? POI_GLYPH[p.type as keyof typeof POI_GLYPH] : 'unknown', { size: 26 }));
      this.cardGlyph.style.color = known ? def.colour : 'rgba(198,214,240,.42)';
      this.cardName.textContent = (known ? p.name : 'Unsurveyed Site').toUpperCase();
      this.cardType.textContent = `${known ? def.label : 'Unknown'}  ·  ${zone ? zone.name : 'The Frontier'}`
        + `${region ? `, ${region.name}` : ''}`;
      this.cardDoes.textContent = known ? (p.does || '')
        : 'Charted from a distance. Walk within sight of it to learn what it is.';
    }

    const drive = this.map.travel(px, pz, p.x, p.z, 'drive');
    const walk = this.map.travel(px, pz, p.x, p.z, 'walk');
    const choco = this.map.travel(px, pz, p.x, p.z, 'chocobo');
    const rows = [
      ['Direct', `${(Math.hypot(p.x - px, p.z - pz) / 1000).toFixed(2)} km`],
      ['By road', `${(drive.dist / 1000).toFixed(2)} km · ${fmtTime(drive.seconds)}`],
      ['By chocobo', fmtTime(choco.seconds)],
      ['On foot', fmtTime(walk.seconds)],
      ['Level', p.lv ? `${p.lv}` : '—'],
    ];
    if (!this._rowEls || this._rowEls.length !== rows.length) {
      while (this.cardRows.firstChild) this.cardRows.removeChild(this.cardRows.firstChild);
      this._rowEls = rows.map(() => {
        const k = el('div.wm-k'), v = el('div.wm-v');
        this.cardRows.appendChild(el('div.wm-row', {}, [k, v]));
        return [k, v];
      });
    }
    for (let i = 0; i < rows.length; i++) {
      this._rowEls[i][0].textContent = rows[i][0].toUpperCase();
      this._rowEls[i][1].textContent = rows[i][1];
    }
    this.cardFt.textContent = !known ? 'UNDISCOVERED'
      : p.travel ? 'FAST TRAVEL AVAILABLE  ·  ENTER' : 'NO FAST TRAVEL';
    this.cardFt.className = `wm-ft${known && p.travel ? ' on' : ''}`;
  }

  _draw(game: any, t: any, rev: any) {
    const c = this.ctx, dpr = this.dpr;
    const W = this.w * dpr, H = this.h * dpr;
    const ppm = this.zoom * dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W, H);

    c.save();
    c.beginPath();
    c.rect(0, 0, W, H);
    c.clip();

    // the sheet the chart is printed on
    const bg = c.createLinearGradient(0, 0, W * 0.4, H);
    bg.addColorStop(0, 'rgba(9,15,24,0.94)');
    bg.addColorStop(1, 'rgba(5,9,16,0.96)');
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);

    const sx = (wx: any) => W / 2 + (wx - this.cam.x) * ppm;
    const sy = (wz: any) => H / 2 + (wz - this.cam.z) * ppm;
    const bounds = {
      x0: this.cam.x - W / 2 / ppm - 200, x1: this.cam.x + W / 2 / ppm + 200,
      z0: this.cam.z - H / 2 / ppm - 200, z1: this.cam.z + H / 2 / ppm + 200,
    };

    // ---- graticule, 500 m ------------------------------------------------
    c.strokeStyle = 'rgba(150,190,240,0.05)';
    c.lineWidth = 1;
    c.beginPath();
    const gstep = ppm > 0.5 * dpr ? 500 : 1000;
    for (let g = -WORLD.half; g <= WORLD.half; g += gstep) {
      const x = sx(g), y = sy(g);
      if (x > -1 && x < W + 1) { c.moveTo(x, 0); c.lineTo(x, H); }
      if (y > -1 && y < H + 1) { c.moveTo(0, y); c.lineTo(W, y); }
    }
    c.stroke();

    // ---- the relief chart ------------------------------------------------
    if (this.chart) {
      const k = ppm / this.chart.ppm;
      c.save();
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.translate(W / 2, H / 2);
      c.scale(k, k);
      c.translate(-this.chart.toPx(this.cam.x), -this.chart.toPz(this.cam.z));
      c.globalAlpha = rev;
      c.filter = 'saturate(1.06)';
      c.drawImage(this.chart.canvas, 0, 0);
      c.filter = 'none';
      c.restore();
      c.globalAlpha = 1;
    }

    // ---- region borders and the road network -----------------------------
    const zoneFade = clamp((ppm / dpr - 0.17) / 0.12, 0, 1);
    drawZoneBorders(c, sx, sy, { alpha: 0.55 * rev, scale: dpr });
    drawRoads(c, sx, sy, {
      scale: dpr * (0.55 + this.zoom * 3.4),
      alpha: 0.95 * rev,
      lod: this.zoom > 0.4 ? 0 : 1,
      bounds,
    });
    drawJunctions(c, sx, sy, dpr * (0.5 + this.zoom * 1.6), 0.5 * rev);

    // ---- unsurveyed country ----------------------------------------------
    // the atlas is the surveyed sheet, so there is nothing to haze over
    if (!this.atlas) {
      const sheet = fog.sheet();
      c.save();
      const fk = ppm / sheet.ppm;
      c.imageSmoothingEnabled = true;
      c.translate(W / 2, H / 2);
      c.scale(fk, fk);
      c.translate(-sheet.toPx(this.cam.x), -sheet.toPz(this.cam.z));
      c.globalAlpha = 0.86 * rev;
      c.drawImage(sheet.canvas, 0, 0);
      c.restore();
      c.globalAlpha = 1;
    }

    // ---- type ------------------------------------------------------------
    // The chrome is reserved in the placer rather than tested for later, so a
    // label never ends up half under the filter rail or the detail card.
    const place = new LabelPlacer(3 * dpr);
    // On the atlas the rail, card, scale bar and survey read-out all sit
    // *outside* the square sheet, so reserving their footprints would blank out
    // a third of the continent for no reason. Only the compass is drawn into
    // the canvas either way.
    if (!this.atlas) {
      place.reserve(0, 0, 248 * dpr, 404 * dpr);                    // filter rail
      place.reserve((this.w - 356) * dpr, 0, W, 372 * dpr);         // detail card
      place.reserve(0, (this.h - 74) * dpr, 250 * dpr, H);          // scale bar
      place.reserve((this.w - 300) * dpr, (this.h - 78) * dpr, W, H); // survey
    }
    place.reserve((this.w - 96) * dpr, 0, W, 96 * dpr);           // compass
    const pp = game.get('Player')?.position;
    if (pp) place.reserve(sx(pp.x) - 12 * dpr, sy(pp.z) - 12 * dpr, sx(pp.x) + 12 * dpr, sy(pp.z) + 12 * dpr);
    c.textBaseline = 'middle';
    // on the atlas the names are reserved now and painted after the glyphs, so
    // a settlement symbol never lands in the middle of the word LEIDE
    this._regionLabels(c, sx, sy, ppm, dpr, rev, place, !this.atlas);
    this._zoneLabels(c, sx, sy, ppm, dpr, rev, place, zoneFade);
    this._routeLabels(c, sx, sy, ppm, dpr, rev, place);

    // ---- points of interest ----------------------------------------------
    this._pois(c, sx, sy, ppm, dpr, rev, t, place, W, H);
    if (this.atlas) this._regionLabels(c, sx, sy, ppm, dpr, rev, place, true);

    // ---- the player and the measured line --------------------------------
    this._player(c, sx, sy, ppm, dpr, t);

    c.restore();

    // ---- frame and vignette ---------------------------------------------
    const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.34, W / 2, H / 2, Math.max(W, H) * 0.72);
    vg.addColorStop(0, 'rgba(3,6,12,0)');
    vg.addColorStop(1, 'rgba(3,6,12,0.46)');
    c.fillStyle = vg;
    c.fillRect(0, 0, W, H);

    c.strokeStyle = 'rgba(206,224,250,0.20)';
    c.lineWidth = 1;
    const cut = 16 * dpr;
    c.beginPath();
    c.moveTo(cut, 0.5); c.lineTo(W - 0.5, 0.5); c.lineTo(W - 0.5, H - cut);
    c.lineTo(W - cut, H - 0.5); c.lineTo(0.5, H - 0.5); c.lineTo(0.5, cut);
    c.closePath();
    c.stroke();
    this._compass(c, W, H, dpr, rev);

    // ---- read-outs -------------------------------------------------------
    const span = this.w / this.zoom;                      // metres across
    const bar = span > 6000 ? 2000 : span > 2600 ? 1000 : 500;
    this.scaleLine.style.width = `${(bar * this.zoom).toFixed(1)}px`;
    this.scaleTxt.textContent = bar >= 1000 ? `${bar / 1000} KM` : `${bar} M`;
    let seen = 0;
    for (let i = 0; i < fog.mask.length; i++) if (fog.mask[i]) seen++;
    this.surveyV.textContent = this.atlas
      ? '100.0 %' : `${((seen / fog.mask.length) * 100).toFixed(1)} %`;
  }

  /**
   * Region names — the sheet's headline type.
   *
   * Split into a measure pass and a paint pass so the atlas can reserve their
   * boxes *before* the zone and route labels compete for the same ground, and
   * still paint them *after* the 124 point glyphs. Drawn in one pass they came
   * out with a settlement symbol sitting in the middle of every name.
   *
   * @param paint false = measure and reserve only, true = draw
   */
  _regionLabels(c: any, sx: any, sy: any, ppm: any, dpr: any, rev: any, place: any, paint: boolean = true) {
    const a = clamp(1 - (ppm / dpr - 0.145) / 0.06, 0, 1) * rev;
    if (a <= 0.01) { this._regionPlaced = []; return; }
    if (paint && this._regionPlaced) {
      for (const g of this._regionPlaced) this._paintRegion(c, g, dpr, a);
      this._regionPlaced = null;
      return;
    }
    const placed = [];
    for (const r of REGIONS) {
      const zs = this.map.zones.filter((z: any) => z.region === r.id);
      if (!zs.length) continue;
      // area-weighted, so a region's name lands over its own bulk rather than
      // at the arithmetic mean of its zone centres — at the fit-all scale the
      // three unweighted means crowd into the middle of the sheet
      let cx = 0, cz = 0, wsum = 0;
      for (const z of zs) {
        const w2 = Math.max(1, (z.rx || 1) * (z.rz || 1));
        cx += z.cx * w2; cz += z.cz * w2; wsum += w2;
      }
      cx /= wsum; cz /= wsum;
      const x = sx(cx);
      let y = sy(cz);
      // the rail and the card own the outer thirds of the chart sheet; on the
      // atlas they are outside it, so only a print margin is out of bounds
      const ml = (this.atlas ? 30 : 300) * dpr;
      const mr = (this.atlas ? 30 : 340) * dpr;
      if (x < ml || x > this.w * dpr - mr || y < 40 * dpr || y > (this.h - 40) * dpr) continue;
      c.font = `100 ${Math.round(32 * dpr)}px "Helvetica Neue", Inter, system-ui, sans-serif`;
      const w = spacedWidth(c, r.name.toUpperCase(), 16 * dpr);
      // the sub-line is usually the wider of the two ("The Ochre Marches" vs
      // "Leide"), so reserving only the name leaves its overhang unprotected
      // and a zone label lands straight on it
      c.font = `300 ${Math.round(9.5 * dpr)}px "Helvetica Neue", Inter, system-ui, sans-serif`;
      const ws = spacedWidth(c, r.sub.toUpperCase(), 6 * dpr);
      const wm = Math.max(w, ws);
      // Three region names over an 8192 m field land within ~50 px of each
      // other at the fit-all scale, and each block is ~52 px tall, so the
      // second one prints straight through the first one's sub-line. Nudge
      // along the vertical before giving up — a region name a little off its
      // centroid is still over its own country.
      let dy = 0;
      for (const off of [0, -40, 40, -76, 76, -112, 112]) {
        if (place.place(x - wm / 2, y + off - 22 * dpr, x + wm / 2, y + off + 30 * dpr)) { dy = off; break; }
      }
      // headline type wins a collision it cannot dodge
      if (dy === 0) place.reserve(x - wm / 2, y - 22 * dpr, x + wm / 2, y + 30 * dpr);
      y += dy;
      placed.push({ x, y, name: r.name.toUpperCase(), sub: r.sub.toUpperCase() });
      if (paint) this._paintRegion(c, placed[placed.length - 1], dpr, a);
    }
    this._regionPlaced = paint ? null : placed;
  }

  _paintRegion(c: any, g: {x:number,y:number,name:string,sub:string}, dpr: any, a: any) {
    // on the atlas the region names are the sheet's headline type, not a
    // watermark under a chart the player is navigating
    const rk = this.atlas ? 1.72 : 1;
    c.textBaseline = 'middle';
    c.font = `100 ${Math.round(32 * dpr)}px "Helvetica Neue", Inter, system-ui, sans-serif`;
    c.fillStyle = `rgba(240,248,255,${(0.46 * rk * a).toFixed(3)})`;
    c.shadowColor = 'rgba(3,7,14,0.9)';
    c.shadowBlur = 12 * dpr;
    spacedText(c, g.name, g.x, g.y, 16 * dpr);
    c.font = `300 ${Math.round(9.5 * dpr)}px "Helvetica Neue", Inter, system-ui, sans-serif`;
    c.fillStyle = `rgba(206,224,248,${(0.34 * rk * a).toFixed(3)})`;
    spacedText(c, g.sub, g.x, g.y + 24 * dpr, 6 * dpr);
    c.shadowBlur = 0;
  }

  _zoneLabels(c: any, sx: any, sy: any, ppm: any, dpr: any, rev: any, place: any, fade: any) {
    const a = fade * rev;
    if (a <= 0.01) return;
    // biggest zones first, so a small zone yields its label to a large one
    const zs = this.map.zones.slice().sort((p: any, q: any) => q.rx * q.rz - p.rx * p.rz);
    for (const z of zs) {
      if (!this.atlas && fog.at(z.cx, z.cz) < 0.4) continue;
      const x = sx(z.cx), y = sy(z.cz);
      // a label the sheet edge would slice in half is worse than no label
      const W = this.w * dpr, H = this.h * dpr;
      if (x < 96 * dpr || x > W - 96 * dpr || y < 26 * dpr || y > H - 26 * dpr) continue;
      c.font = `200 ${Math.round(12.5 * dpr)}px "Helvetica Neue", Inter, system-ui, sans-serif`;
      const label = z.name.toUpperCase();
      const w = spacedWidth(c, label, 6.4 * dpr);
      if (!place.place(x - w / 2, y - 9 * dpr, x + w / 2, y + 9 * dpr)) continue;
      c.shadowColor = 'rgba(3,7,14,0.92)';
      c.shadowBlur = 7 * dpr;
      c.fillStyle = `rgba(226,238,254,${(0.52 * a).toFixed(3)})`;
      spacedText(c, label, x, y, 6.4 * dpr);
      c.shadowBlur = 0;
      // a hairline under the label, the way a sheet underlines a district
      c.strokeStyle = `rgba(206,226,252,${(0.16 * a).toFixed(3)})`;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x - w / 2, y + 10 * dpr);
      c.lineTo(x + w / 2, y + 10 * dpr);
      c.stroke();
    }
  }

  _routeLabels(c: any, sx: any, sy: any, ppm: any, dpr: any, rev: any, place: any) {
    const a = clamp((ppm / dpr - 0.3) / 0.14, 0, 1) * rev;
    if (a <= 0.01) return;
    c.font = `300 ${Math.round(8.5 * dpr)}px "Helvetica Neue", Inter, system-ui, sans-serif`;
    for (const r of this.map.roadGraph.routes) {
      const rc = routeClass(r);
      if (rc === 'trail' || rc === 'track') continue;
      const pts = r.pts;
      for (let k = 1; k < 6; k++) {
        const p = pts[Math.floor((pts.length - 1) * (k / 6))];
        if (!p) continue;
        const x = sx(p.x), y = sy(p.z);
        if (x < 40 || x > this.w * dpr - 40 || y < 20 || y > this.h * dpr - 20) continue;
        if (!this.atlas && fog.at(p.x, p.z) < 0.5) continue;
        const label = r.name.split('—')[0].trim().toUpperCase();
        const w = spacedWidth(c, label, 3.4 * dpr);
        const ang = Math.atan2(p.tz || 0, p.tx || 1);
        const nx = -Math.sin(ang), ny = Math.cos(ang);
        const lx = x + nx * 9 * dpr, ly = y + ny * 9 * dpr;
        if (!place.place(lx - w / 2, ly - 7 * dpr, lx + w / 2, ly + 7 * dpr)) continue;
        c.save();
        c.translate(lx, ly);
        c.rotate(Math.abs(ang) > Math.PI / 2 ? ang + Math.PI : ang);
        c.fillStyle = `rgba(214,232,254,${(0.46 * a).toFixed(3)})`;
        c.shadowColor = 'rgba(3,7,14,0.95)';
        c.shadowBlur = 5 * dpr;
        spacedText(c, label, 0, 0, 3.4 * dpr);
        c.shadowBlur = 0;
        c.restore();
        break;
      }
    }
  }

  _pois(c: any, sx: any, sy: any, ppm: any, dpr: any, rev: any, t: any, place: any, W: any, H: any) {
    const f = FILTERS[this.filter];
    const selected = this.list?.[this.sel];
    this._screenPos.clear();
    // draw order: dimmed first, then normal, then the selection on top
    const rows = [];
    for (const p of this.map.pois) {
      const known = this._known(p);
      if (!known && fog.at(p.x, p.z) < 0.5) continue;
      const x = sx(p.x), y = sy(p.z);
      if (x < -60 || x > W + 60 || y < -60 || y > H + 60) continue;
      this._screenPos.set(p, [x / dpr, y / dpr]);
      const off = f.types && !f.types.includes(p.type);
      rows.push({ p, x, y, known, off, sel: p === selected, hover: p === this.hover });
    }
    rows.sort((a, b) => (a.off ? 0 : 1) - (b.off ? 0 : 1) || (a.sel ? 1 : 0) - (b.sel ? 1 : 0));

    for (const r of rows) {
      const def = POI_TYPES[r.p.type as keyof typeof POI_TYPES];
      const big = r.sel || r.hover;
      const zk = clamp(0.78 + this.zoom * 0.9, 0.78, 1.12);
      const rad = (!r.known ? 4.6 : r.sel ? 10 : r.hover ? 9 : SETTLED.includes(r.p.type) ? 8.4 : 7.4)
        * zk * dpr;
      r.rad = rad;
      const alpha = (r.off ? 0.14 : r.known ? (big ? 1 : 0.9) : 0.3) * rev;
      const colour = r.known ? def.colour : 'rgba(206,222,246,0.9)';
      drawGlyph(c, r.known ? (POI_GLYPH[r.p.type as keyof typeof POI_GLYPH] || 'dot') : 'unknown', r.x, r.y, rad, colour,
        { alpha, weight: 1.3 * dpr });
      place.reserve(r.x - rad, r.y - rad, r.x + rad, r.y + rad);
    }

    // labels in a second pass so a glyph never sits on top of a name
    c.textBaseline = 'middle';
    for (const r of rows) {
      if (r.off) continue;
      const named = SETTLED.includes(r.p.type);
      const show = r.sel || r.hover || (r.known && (named || ppm / dpr > 0.33));
      if (!show) continue;
      const label = (r.known ? r.p.name : 'Unsurveyed site').toUpperCase();
      const size = named ? 10.5 : 9.5;
      c.font = `${r.sel ? 400 : 300} ${Math.round(size * dpr)}px "Helvetica Neue", Inter, system-ui, sans-serif`;
      const sp = 2.2 * dpr;
      const w = spacedWidth(c, label, sp);
      // clear of the glyph's own reserved box, or the placer rejects every slot
      const gap = (r.rad || 8 * dpr) + 7 * dpr;
      const slots = [
        [r.x + gap, r.y], [r.x - gap - w, r.y],
        [r.x - w / 2, r.y - gap - 4 * dpr], [r.x - w / 2, r.y + gap + 4 * dpr],
      ];
      let put: any = null;
      for (const s of slots) {
        // a name the sheet edge slices in half is worse than no name
        if (s[0] < 6 * dpr || s[0] + w > W - 6 * dpr) continue;
        if (place.place(s[0], s[1] - 6.5 * dpr, s[0] + w, s[1] + 6.5 * dpr)) { put = s; break; }
      }
      // the selected point always carries its name, collision or not
      if (!put && r.sel) { put = slots[0]; place.reserve(put[0], put[1] - 6.5 * dpr, put[0] + w, put[1] + 6.5 * dpr); }
      if (!put) continue;
      const a = (r.sel ? 0.98 : r.hover ? 0.92 : named ? 0.80 : r.known ? 0.60 : 0.4) * rev;
      c.fillStyle = `rgba(240,248,255,${a.toFixed(3)})`;
      c.shadowColor = 'rgba(3,7,14,0.95)';
      c.shadowBlur = 6 * dpr;
      spacedText(c, label, put[0], put[1], sp, 'left');
      c.shadowBlur = 0;
    }

    // selection reticle
    if (selected) {
      const x = sx(selected.x), y = sy(selected.z);
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
      c.strokeStyle = `rgba(226,242,255,${(0.22 + 0.38 * (1 - pulse)).toFixed(3)})`;
      c.lineWidth = 1.1 * dpr;
      c.beginPath();
      c.arc(x, y, (15 + 9 * pulse) * dpr, 0, Math.PI * 2);
      c.stroke();
      // corner brackets, the house selection mark
      const s = 15 * dpr, g = 5.5 * dpr;
      c.strokeStyle = 'rgba(226,242,255,0.85)';
      c.lineWidth = 1.2 * dpr;
      c.beginPath();
      for (const [ox, oy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        c.moveTo(x + ox * s, y + oy * s - oy * g);
        c.lineTo(x + ox * s, y + oy * s);
        c.lineTo(x + ox * s - ox * g, y + oy * s);
      }
      c.stroke();
    }
  }

  _player(c: any, sx: any, sy: any, ppm: any, dpr: any, t: any) {
    const player = this.game?.get('Player');
    if (!player?.position) return;
    const px = sx(player.position.x), py = sy(player.position.z);
    const sel = this.list?.[this.sel];

    // the measured line: FFXV always tells you how far it is
    const far = sel && Math.hypot(sel.x - player.position.x, sel.z - player.position.z) > 200;
    if (far) {
      const tx = sx(sel.x), ty = sy(sel.z);
      c.save();
      c.setLineDash([4 * dpr, 5 * dpr]);
      c.lineDashOffset = -(t * 22 * dpr) % (9 * dpr);
      c.strokeStyle = 'rgba(206,228,252,0.34)';
      c.lineWidth = 1.1 * dpr;
      c.beginPath();
      c.moveTo(px, py);
      c.lineTo(tx, ty);
      c.stroke();
      c.setLineDash([]);
      const km = Math.hypot(sel.x - player.position.x, sel.z - player.position.z) / 1000;
      const mx = (px + tx) / 2, my = (py + ty) / 2;
      c.font = `300 ${Math.round(9 * dpr)}px "Helvetica Neue", Inter, system-ui, sans-serif`;
      c.textAlign = 'center';
      c.fillStyle = 'rgba(226,240,255,0.72)';
      c.shadowColor = 'rgba(3,7,14,0.95)';
      c.shadowBlur = 6 * dpr;
      c.fillText(`${km.toFixed(2)} KM`, mx, my - 7 * dpr);
      c.shadowBlur = 0;
      c.textAlign = 'left';
      c.restore();
    }

    c.save();
    c.translate(px, py);
    // view cone
    const head = player.heading || 0;
    c.save();
    c.rotate(head);
    const cone = c.createRadialGradient(0, 0, 0, 0, 0, 34 * dpr);
    cone.addColorStop(0, 'rgba(190,222,255,0.28)');
    cone.addColorStop(1, 'rgba(190,222,255,0)');
    c.fillStyle = cone;
    c.beginPath();
    c.moveTo(0, 0);
    c.arc(0, 0, 34 * dpr, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5);
    c.closePath();
    c.fill();
    c.fillStyle = '#f4f9ff';
    c.strokeStyle = 'rgba(6,10,18,0.92)';
    c.lineWidth = 1.4 * dpr;
    c.beginPath();
    c.moveTo(0, -9.5 * dpr); c.lineTo(6.4 * dpr, 7.4 * dpr);
    c.lineTo(0, 3.2 * dpr); c.lineTo(-6.4 * dpr, 7.4 * dpr);
    c.closePath();
    c.fill(); c.stroke();
    c.restore();
    const pr = (13 + 8 * (0.5 + 0.5 * Math.sin(t * 2.2))) * dpr;
    c.strokeStyle = `rgba(226,242,255,${(0.7 - (pr / dpr - 13) / 16).toFixed(3)})`;
    c.lineWidth = 1.1 * dpr;
    c.beginPath();
    c.arc(0, 0, pr, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }

  _compass(c: any, W: any, H: any, dpr: any, rev: any) {
    const R = 30 * dpr;
    const x = W - R - 30 * dpr, y = R + 30 * dpr;
    c.save();
    c.globalAlpha = rev;
    c.translate(x, y);
    c.strokeStyle = 'rgba(206,226,252,0.30)';
    c.lineWidth = 1;
    c.beginPath();
    c.arc(0, 0, R, 0, Math.PI * 2);
    c.stroke();
    for (let d = 0; d < 360; d += 15) {
      const a = (d * Math.PI) / 180 - Math.PI / 2;
      const major = d % 45 === 0;
      c.strokeStyle = major ? 'rgba(214,234,255,0.5)' : 'rgba(206,224,250,0.22)';
      c.beginPath();
      c.moveTo(Math.cos(a) * (R - (major ? 8 : 5) * dpr), Math.sin(a) * (R - (major ? 8 : 5) * dpr));
      c.lineTo(Math.cos(a) * R, Math.sin(a) * R);
      c.stroke();
    }
    // the needle
    c.fillStyle = 'rgba(240,248,255,0.92)';
    c.beginPath();
    c.moveTo(0, -R + 9 * dpr); c.lineTo(5 * dpr, 2 * dpr); c.lineTo(0, -2 * dpr); c.lineTo(-5 * dpr, 2 * dpr);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(150,186,232,0.5)';
    c.beginPath();
    c.moveTo(0, R - 9 * dpr); c.lineTo(5 * dpr, -2 * dpr); c.lineTo(0, 2 * dpr); c.lineTo(-5 * dpr, -2 * dpr);
    c.closePath();
    c.fill();
    c.font = `300 ${Math.round(9 * dpr)}px "Helvetica Neue", Inter, system-ui, sans-serif`;
    c.textAlign = 'center';
    c.fillStyle = 'rgba(238,246,255,0.85)';
    c.fillText('N', 0, -R - 9 * dpr);
    c.textAlign = 'left';
    c.restore();
  }
}

function fmtTime(sec: any) {
  if (!isFinite(sec)) return '—';
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  if (m >= 60) return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
  return m ? `${m} min ${String(s).padStart(2, '0')} s` : `${s} s`;
}

let _styled = false;

function styleTag() {
  if (_styled) return null;
  _styled = true;
  const s = document.createElement('style');
  s.textContent = `
.wm .wm-wrap {
  position: absolute; left: ${BOX.x}px; top: ${BOX.y}px;
  width: ${BOX.w}px; height: ${BOX.h}px; pointer-events: auto;
}
.wm .wm-canvas { display: block; width: 100%; height: 100%; cursor: crosshair; }

.wm .wm-rail {
  position: absolute; left: 64px; top: 168px; width: 214px; padding: 14px 4px 12px 16px;
  pointer-events: auto;
}
.wm .wm-rail-h {
  font-size: 8px; letter-spacing: .38em; text-transform: uppercase;
  color: var(--ink-4); margin-bottom: 10px; text-shadow: var(--sh-text);
}
.wm .wm-rail .rule { margin-bottom: 8px; }
.wm .wm-filter {
  display: flex; align-items: center; gap: 11px; padding: 5px 12px 5px 2px; position: relative;
}
.wm .wm-fmark { color: var(--ink-4); display: flex; width: 16px; }
.wm .wm-filter.on .wm-fmark { color: var(--ice); filter: drop-shadow(0 0 6px rgba(150,200,250,.55)); }
.wm .wm-flabel {
  flex: 1; font-size: 8.5px; letter-spacing: .28em; text-transform: uppercase;
  color: var(--ink-4); text-shadow: var(--sh-text);
}
.wm .wm-filter.on .wm-flabel { color: var(--ink); }
.wm .wm-fcount {
  font-size: 8.5px; letter-spacing: .12em; color: var(--ink-4); text-shadow: var(--sh-text);
}
.wm .wm-filter.on .wm-fcount { color: var(--ice); }

.wm .wm-card {
  position: absolute; right: 62px; top: 168px; width: 336px; padding: 18px 20px 15px;
}
.wm .wm-chead { display: flex; align-items: flex-start; gap: 13px; }
.wm .wm-cglyph { flex: none; margin-top: 1px; color: var(--ice); }
.wm .wm-name {
  font-size: 15.5px; font-weight: 200; letter-spacing: .19em; color: var(--ink);
  text-shadow: var(--sh-text-lg); line-height: 1.25;
}
.wm .wm-type {
  margin-top: 6px; font-size: 8.5px; letter-spacing: .24em; text-transform: uppercase;
  color: var(--ink-3); text-shadow: var(--sh-text);
}
.wm .wm-card .rule { margin: 13px 0 12px; }
.wm .wm-does {
  font-size: 11.5px; font-weight: 300; letter-spacing: .035em; line-height: 1.62;
  color: var(--ink-2); text-shadow: var(--sh-text); min-height: 58px;
}
.wm .wm-rows { margin-top: 13px; display: flex; flex-direction: column; gap: 7px; }
.wm .wm-row { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; }
.wm .wm-k {
  font-size: 8px; letter-spacing: .28em; text-transform: uppercase;
  color: var(--ink-4); text-shadow: var(--sh-text);
}
.wm .wm-v {
  font-size: 11px; font-weight: 300; letter-spacing: .04em; color: var(--ink);
  text-shadow: var(--sh-text); font-variant-numeric: tabular-nums;
}
.wm .wm-ft {
  margin-top: 15px; font-size: 8px; letter-spacing: .3em; color: var(--ink-4);
  text-shadow: var(--sh-text);
}
.wm .wm-ft.on { color: var(--gold); }

.wm .wm-scalebar { position: absolute; left: 66px; bottom: 118px; }
.wm .wm-scaleline {
  height: 1px; width: 130px; background: rgba(216,234,255,.55);
  box-shadow: 0 -4px 0 -3px rgba(216,234,255,.55), 0 4px 0 -3px rgba(216,234,255,.55);
}
.wm .wm-scaletxt {
  margin-bottom: 7px; font-size: 8px; letter-spacing: .3em;
  color: var(--ink-4); text-shadow: var(--sh-text);
}
.wm .wm-survey { position: absolute; right: 64px; bottom: 118px; text-align: right; }
.wm .wm-surveyk {
  font-size: 8px; letter-spacing: .3em; text-transform: uppercase;
  color: var(--ink-4); text-shadow: var(--sh-text);
}
.wm .wm-surveyv {
  margin-top: 6px; font-size: 17px; font-weight: 200; letter-spacing: .1em;
  color: var(--ink); text-shadow: var(--sh-text); font-variant-numeric: tabular-nums;
}
`;
  return s;
}
