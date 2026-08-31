import { el, damp, easeOut } from './UIKit.ts';
import { demoActive } from '../engine/Device.ts';
import { worldMap, POI_TYPES } from '../world/map/WorldMap.ts';
import { getChart } from '../world/map/Chart.ts';
import { drawRoads } from '../world/map/MapDraw.ts';
import { drawGlyph, POI_GLYPH } from '../world/map/MapGlyphs.ts';
import { fog } from '../world/map/FogOfWar.ts';
import type { Chart } from '../world/map/Chart.ts';
import type { FogOfWar } from '../world/map/FogOfWar.ts';
import type { WorldMap, Poi } from '../world/map/WorldMap.ts';
import type { Terrain } from '../world/Terrain.ts';
import type { Game } from '../game/Game.ts';

/**
 * The field minimap.
 *
 * A real chart, not a radar. The relief of the whole continent is baked once
 * into an off-screen image by `world/map/Chart.ts` — the same image the
 * world-map screen shows, which is why the two never disagree about where a
 * ridge is — and every frame blits the piece of it under the player, rotated
 * to heading. The unsurveyed haze is a second baked sheet blitted the same
 * way. Only the vector furniture is redrawn: roads, discovered points of
 * interest, the quest waypoint, party and enemy blips, the compass rose.
 *
 * Per-frame cost is two `drawImage` calls, one clipped road path and a handful
 * of glyphs; `cost` carries a rolling average in milliseconds.
 *
 * Design rules of this UI layer: thin pale type, low-opacity dark plates,
 * angular corner cuts, hairlines that fade at the ends, and **no CSS
 * transitions or keyframes** — every animated value is written per frame from
 * `game.time.now` so captures are deterministic.
 *
 * Registration (Game.ts system order, after HUD):
 *   ['Minimap', () => new Minimap()],
 */

const SIZE = 216;              // css px of the map disc
const DPR_CAP = 2;
const RANGE_STEPS = [140, 260, 480, 900];

export class Minimap {
  _onResize!: () => void;
  _a!: number;
  /** `game.time.now` of the last discovery sweep; they run at 2.5 Hz. */
  _discAt!: number | null;
  /**
   * The most recently discovered point, for a "location discovered" flourish.
   *
   * **Nothing reads this.** It is written on every discovery and never drawn,
   * so the flourish it was added for has never appeared. Left in place rather
   * than deleted because the fix is to draw it, not to forget it.
   */
  _flash!: { at: number, poi: Poi } | null;
  _heading!: number;
  canvas!: HTMLCanvasElement;
  chart!: Chart;
  cost!: number;
  ctx!: CanvasRenderingContext2D;
  dpr!: number;
  fog!: FogOfWar;
  frame!: HTMLElement;
  game!: Game;
  map!: WorldMap;
  range!: number;
  regionEl!: HTMLElement;
  root!: HTMLElement;
  rotate!: boolean;
  scaleEl!: HTMLElement;
  terrain!: Terrain | undefined;
  visible!: boolean;
  /**
   * The tracked quest's world position, drawn as a pulsing ring on the rim.
   *
   * **Nothing in the repo assigns this.** `GameData.readQuest().waypoint` and
   * `readMarkers()` both publish exactly what it wants and neither is wired to
   * it, so the quest ring has never been drawn on the minimap.
   */
  waypoint!: { x: number, z: number } | null;
  zoneEl!: HTMLElement;
  constructor() {
    /** Metres from the player edge-to-centre. */
    this.range = 480;
    /** North-locked (false) or rotating with the player (true). */
    this.rotate = true;
    this.visible = true;
    /** Rolling average of the per-frame draw cost, ms. */
    this.cost = 0;
    this._heading = 0;
    this._a = 0;
    this._discAt = null;
    this._flash = null;
    this.waypoint = null;
  }

  async init(game: Game) {
    this.game = game;
    this.map = worldMap;
    this.terrain = game.get('Terrain');

    this.root = el('div', { id: 'minimap' });
    this.root.appendChild(styleTag());

    this.frame = el('div.mm-frame');
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'mm-canvas';
    this.frame.appendChild(this.canvas);
    this.frame.appendChild(el('div.mm-bezel'));
    this.root.appendChild(this.frame);

    this.zoneEl = el('div.mm-zone', { text: '' });
    this.regionEl = el('div.mm-region', { text: '' });
    this.scaleEl = el('div.mm-scale', { text: '' });
    this.root.appendChild(el('div.mm-caption', {}, [
      this.scaleEl,
      el('div.mm-names', {}, [this.zoneEl, this.regionEl]),
    ]));

    game.uiRoot.appendChild(this.root);

    this.ctx = this.canvas.getContext('2d')!;
    this._resize();
    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);

    // The static world image: 2048² at 4 m per pixel, straight off the
    // terrain's own elevation grid. One bake, shared with the map screens.
    //
    // The demo asks for 512² instead. That is a clean miss on the baked
    // `map/chart/rgba@2048` key — `ChartOpts.size` is a documented escape
    // hatch for exactly this — so the 6.27 MB of chart texels leave the first
    // frame entirely and a 512 chart rasterises in ~30 ms rather than 458.
    // At 390 px tall it is also the honest resolution: the full-screen map
    // never shows more than a quarter of the 2048 sheet's detail.
    this.chart = getChart(this.terrain, demoActive() ? { size: 512 } : undefined);

    /** The shared survey mask. Exposed for the map screens' fog queries. */
    this.fog = fog;
    fog.revealRoads(260);
    fog.reveal(0, 0, 460);
  }

  _resize() {
    const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.canvas.width = Math.round(SIZE * dpr);
    this.canvas.height = Math.round(SIZE * dpr);
    this.canvas.style.width = `${SIZE}px`;
    this.canvas.style.height = `${SIZE}px`;
  }

  setVisible(v: boolean) { this.visible = !!v; }

  /** Cycle 140 m -> 260 m -> 480 m -> 900 m and back. */
  cycleRange() {
    const i = RANGE_STEPS.indexOf(this.range);
    this.range = RANGE_STEPS[(i + 1) % RANGE_STEPS.length];
  }

  /** Toggle between a rotating chart and a north-locked one. */
  toggleRotate() { this.rotate = !this.rotate; }

  /** 0..1 how surveyed the cell containing this point is. */
  fogAt(x: number, z: number) { return fog.at(x, z); }

  // ------------------------------------------------------------------ frame

  lateUpdate(dt: number, game: Game) {
    if (!this.ctx || !this.chart) return;
    const player = game.get('Player');
    const px = player?.position?.x ?? game.camera.position.x;
    const pz = player?.position?.z ?? game.camera.position.z;
    const heading = player?.heading ?? 0;

    // survey + discovery
    fog.reveal(px, pz, 420);
    if (!this._discAt || game.time.now - this._discAt > 0.4) {
      this._discAt = game.time.now;
      const found = this.map.discoverAround(px, pz);
      if (found.length) this._flash = { at: game.time.now, poi: found[found.length - 1] };
    }

    // The minimap is part of the field HUD, so it follows the HUD rather than
    // holding its own opinion — otherwise it draws over cinematic and vista
    // shots, which switch the HUD off but never knew to switch this off too.
    const menus = game.get('Menus');
    const hud = game.get('HUD');
    const hudOn = hud ? hud.visible !== false : true;
    const target = this.visible && hudOn && !(menus && menus.open) ? 1 : 0;
    this._a = damp(this._a, target, 9, dt);
    this.root.style.opacity = easeOut(this._a).toFixed(3);
    if (this._a < 0.004) { this.root.style.display = 'none'; return; }
    this.root.style.display = '';

    // The chart rotates smoothly; the player never spins on the spot.
    if (this.rotate) {
      let d = heading - this._heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this._heading += d * (1 - Math.exp(-9 * dt));
    } else {
      this._heading = 0;
    }

    const t0 = performance.now();
    this._draw(game, px, pz);
    this.cost = this.cost ? this.cost * 0.9 + (performance.now() - t0) * 0.1
      : performance.now() - t0;
    this._caption(px, pz);
  }

  _caption(px: number, pz: number) {
    const zone = this.map.zoneAt(px, pz);
    const region = zone ? this.map.regionById.get(zone.region) : null;
    this.zoneEl.textContent = (zone ? zone.name : 'The Frontier').toUpperCase();
    this.regionEl.textContent = (region ? region.name : 'Lucis').toUpperCase();
    this.scaleEl.textContent = `${this.range} M`;
  }

  _draw(game: Game, px: number, pz: number) {
    const c = this.ctx, dpr = this.dpr, S = SIZE * dpr;
    const t = game.time.now;
    const R = S / 2;
    const ppm = (S / 2) / this.range;           // canvas px per world metre
    const ca = Math.cos(-this._heading), sa = Math.sin(-this._heading);
    /** world -> disc-local px, with the chart rotation applied */
    const lx = (x: number, z: number) => (x - px) * ca * ppm - (z - pz) * sa * ppm;
    const ly = (x: number, z: number) => (x - px) * sa * ppm + (z - pz) * ca * ppm;

    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, S, S);

    c.save();
    c.beginPath();
    c.arc(R, R, R - 2 * dpr, 0, Math.PI * 2);
    c.clip();

    c.fillStyle = 'rgba(6,10,17,0.94)';
    c.fillRect(0, 0, S, S);

    // ---- the relief, rotated under the player ----
    c.save();
    c.translate(R, R);
    c.rotate(-this._heading);
    const k = ppm / this.chart.ppm;
    c.scale(k, k);
    c.translate(-this.chart.toPx(px), -this.chart.toPz(pz));
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = 'high';
    // a touch of saturation and contrast: the disc is small and sits against a
    // photographic frame, so the chart needs more bite here than on the sheet
    c.filter = 'saturate(1.14) contrast(1.06)';
    c.drawImage(this.chart.canvas, 0, 0);
    c.filter = 'none';
    c.restore();
    c.globalAlpha = 1;

    // ---- roads, in screen space so a highway is always a highway ----
    c.save();
    c.translate(R, R);
    c.rotate(-this._heading);
    const reach = this.range * 1.6;
    drawRoads(c, (wx) => (wx - px) * ppm, (wz) => (wz - pz) * ppm, {
      scale: dpr * (this.range < 300 ? 1.5 : 1.0),
      alpha: 0.95,
      lod: this.range > 500 ? 2 : 1,
      bounds: { x0: px - reach, x1: px + reach, z0: pz - reach, z1: pz + reach },
    });
    c.restore();

    // ---- unsurveyed haze ----
    const sheet = fog.sheet();
    c.save();
    c.translate(R, R);
    c.rotate(-this._heading);
    const fk = ppm / sheet.ppm;
    c.scale(fk, fk);
    c.translate(-sheet.toPx(px), -sheet.toPz(pz));
    c.globalAlpha = 0.52;
    c.drawImage(sheet.canvas, 0, 0);
    c.restore();
    c.globalAlpha = 1;

    // ---- points of interest ----
    c.save();
    c.translate(R, R);
    const lim = R - 11 * dpr;
    for (const p of this.map.pois) {
      if (!this.map.discovered.has(p.id)) continue;
      if (Math.abs(p.x - px) > this.range * 1.6 || Math.abs(p.z - pz) > this.range * 1.6) continue;
      const gx = lx(p.x, p.z), gy = ly(p.x, p.z);
      const r = Math.hypot(gx, gy);
      const edge = r > lim;
      const kk = edge ? lim / r : 1;
      drawGlyph(c, POI_GLYPH[p.type as keyof typeof POI_GLYPH] || 'dot', gx * kk, gy * kk, 6.2 * dpr,
        POI_TYPES[p.type as keyof typeof POI_TYPES].colour, { alpha: edge ? 0.42 : 0.96, weight: 1.2 * dpr });
    }
    c.restore();

    // ---- quest waypoint ----
    const q = this.waypoint || null;
    if (q) {
      c.save();
      c.translate(R, R);
      let gx = lx(q.x, q.z), gy = ly(q.x, q.z);
      const r = Math.hypot(gx, gy), qlim = R - 13 * dpr;
      if (r > qlim) { gx *= qlim / r; gy *= qlim / r; }
      const pulse = 0.5 + 0.5 * Math.sin(t * 3.1);
      c.strokeStyle = `rgba(232,207,152,${(0.28 + 0.48 * (1 - pulse)).toFixed(3)})`;
      c.lineWidth = 1.1 * dpr;
      c.beginPath();
      c.arc(gx, gy, (8 + 6 * pulse) * dpr, 0, Math.PI * 2);
      c.stroke();
      drawGlyph(c, 'quest', gx, gy, 6.6 * dpr, '#e8cf98', { weight: 1.2 * dpr });
      c.restore();
    }

    // ---- party and hostiles ----
    c.save();
    c.translate(R, R);
    const blip = (wx: number, wz: number, col: string, rad: number, ring?: string) => {
      const gx = lx(wx, wz), gy = ly(wx, wz);
      if (Math.hypot(gx, gy) > R - 5 * dpr) return;
      if (ring) {
        c.strokeStyle = ring;
        c.lineWidth = 1 * dpr;
        c.beginPath();
        c.arc(gx, gy, (rad + 2.6) * dpr, 0, Math.PI * 2);
        c.stroke();
      }
      c.fillStyle = col;
      c.strokeStyle = 'rgba(5,9,16,0.85)';
      c.lineWidth = 1 * dpr;
      c.beginPath();
      c.arc(gx, gy, rad * dpr, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    };
    const party = game.get('Party');
    for (const m of (party?.members || [])) {
      const p = m.root?.position;
      if (p) blip(p.x, p.z, 'rgba(182,214,248,0.95)', 2.5);
    }
    const enemies = game.get('Enemies');
    const hostilePulse = 0.5 + 0.5 * Math.sin(t * 4.2);
    for (const e of (enemies?.list || [])) {
      const p = e.position || e.root?.position;
      if (p && (e.hp === undefined || e.hp > 0)) {
        blip(p.x, p.z, 'rgba(224,100,74,0.96)', 2.7,
          `rgba(224,100,74,${(0.10 + 0.30 * hostilePulse).toFixed(3)})`);
      }
    }
    c.restore();

    // ---- the player, always dead centre ----
    c.save();
    c.translate(R, R);
    if (!this.rotate) c.rotate(game.get('Player')?.heading ?? 0);
    const cone = c.createRadialGradient(0, 0, 0, 0, 0, 44 * dpr);
    cone.addColorStop(0, 'rgba(196,226,255,0.30)');
    cone.addColorStop(1, 'rgba(196,226,255,0)');
    c.fillStyle = cone;
    c.beginPath();
    c.moveTo(0, 0);
    c.arc(0, 0, 44 * dpr, -Math.PI / 2 - 0.46, -Math.PI / 2 + 0.46);
    c.closePath();
    c.fill();
    c.fillStyle = '#f4f9ff';
    c.strokeStyle = 'rgba(6,10,18,0.9)';
    c.lineWidth = 1.2 * dpr;
    c.beginPath();
    c.moveTo(0, -7.4 * dpr);
    c.lineTo(5.2 * dpr, 5.8 * dpr);
    c.lineTo(0, 2.5 * dpr);
    c.lineTo(-5.2 * dpr, 5.8 * dpr);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();

    // vignette so the chart sinks into the plate at the rim
    const g = c.createRadialGradient(R, R, S * 0.30, R, R, S * 0.5);
    g.addColorStop(0, 'rgba(4,8,14,0)');
    g.addColorStop(0.68, 'rgba(4,8,14,0.10)');
    g.addColorStop(1, 'rgba(4,8,14,0.52)');
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    c.restore();

    this._compass(c, S, dpr);
  }

  /** The bezel: a graduated ring, cardinals, and four angular corner ticks. */
  _compass(c: CanvasRenderingContext2D, S: number, dpr: number) {
    const R = S / 2 - 2 * dpr;
    c.save();
    c.translate(S / 2, S / 2);

    c.strokeStyle = 'rgba(206,224,250,0.22)';
    c.lineWidth = 1 * dpr;
    c.beginPath();
    c.arc(0, 0, R - 8 * dpr, 0, Math.PI * 2);
    c.stroke();

    for (let d = 0; d < 360; d += 7.5) {
      const a = (d * Math.PI) / 180 - this._heading - Math.PI / 2;
      const major = d % 45 === 0;
      const mid = !major && d % 15 === 0;
      const r0 = R - (major ? 7.5 : mid ? 5 : 3) * dpr;
      c.strokeStyle = major ? 'rgba(220,238,255,0.62)'
        : mid ? 'rgba(206,224,250,0.30)' : 'rgba(206,224,250,0.16)';
      c.lineWidth = (major ? 1.3 : 1) * dpr;
      c.beginPath();
      c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      c.lineTo(Math.cos(a) * (R - 1.5 * dpr), Math.sin(a) * (R - 1.5 * dpr));
      c.stroke();
    }

    c.font = `300 ${Math.round(8.5 * dpr)}px "Helvetica Neue", Inter, system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const marks: [string, number][] = [['N', 0], ['E', 90], ['S', 180], ['W', 270]];
    for (const [label, d] of marks) {
      const a = (d * Math.PI) / 180 - this._heading - Math.PI / 2;
      const r = R - 16 * dpr;
      c.fillStyle = label === 'N' ? 'rgba(238,246,255,0.95)' : 'rgba(206,224,250,0.50)';
      c.fillText(label, Math.cos(a) * r, Math.sin(a) * r);
    }

    // the north pip: a small filled wedge riding the rim
    const an = -this._heading - Math.PI / 2;
    c.fillStyle = 'rgba(238,246,255,0.92)';
    c.beginPath();
    c.moveTo(Math.cos(an) * (R + 0.5 * dpr), Math.sin(an) * (R + 0.5 * dpr));
    c.lineTo(Math.cos(an + 0.075) * (R - 8 * dpr), Math.sin(an + 0.075) * (R - 8 * dpr));
    c.lineTo(Math.cos(an - 0.075) * (R - 8 * dpr), Math.sin(an - 0.075) * (R - 8 * dpr));
    c.closePath();
    c.fill();

    // four angular ticks on the diagonals — the house corner cut, curved
    c.strokeStyle = 'rgba(214,234,255,0.42)';
    c.lineWidth = 1.4 * dpr;
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      c.beginPath();
      c.arc(0, 0, R + 1.5 * dpr, a - 0.14, a + 0.14);
      c.stroke();
    }
    c.restore();
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.root?.remove();
  }
}

/**
 * Scoped styles. `ui.css` is owned by the HUD workstream, so this widget
 * carries its own rules and only *consumes* the shared design tokens.
 */
function styleTag() {
  const s = document.createElement('style');
  s.textContent = `
#minimap {
  position: absolute; right: 34px; top: 296px;
  pointer-events: none; user-select: none;
  font-family: var(--ui-font, system-ui);
}
#minimap .mm-frame {
  position: relative; width: ${SIZE}px; height: ${SIZE}px;
  border-radius: 50%;
  background: radial-gradient(circle at 42% 34%, rgba(12,20,32,.62), rgba(5,9,16,.88));
  box-shadow: 0 10px 34px rgba(0,0,0,.5), inset 0 0 0 1px rgba(206,224,250,.14);
}
#minimap .mm-canvas { display: block; border-radius: 50%; position: relative; z-index: 1; }
#minimap .mm-bezel {
  position: absolute; inset: -5px; border-radius: 50%; z-index: 0;
  box-shadow: inset 0 0 0 1px rgba(206,224,250,.10), 0 0 22px rgba(4,8,16,.55);
}
#minimap .mm-caption {
  margin-top: 12px; width: ${SIZE}px;
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
}
#minimap .mm-names { text-align: right; }
#minimap .mm-zone {
  font-size: 11px; font-weight: 300; letter-spacing: 0.26em; color: var(--ink, #eef4fd);
  text-shadow: 0 1px 2px rgba(0,0,0,.72), 0 0 14px rgba(0,0,0,.42);
}
#minimap .mm-region {
  font-size: 8px; letter-spacing: 0.34em; color: var(--ink-3, rgba(210,224,246,.56));
  margin-top: 3px; text-shadow: 0 1px 2px rgba(0,0,0,.72);
}
#minimap .mm-scale {
  font-size: 8px; letter-spacing: 0.3em; color: var(--ink-4, rgba(198,214,240,.34));
  text-shadow: 0 1px 2px rgba(0,0,0,.72); padding-top: 3px; white-space: nowrap;
}
`;
  return s;
}
