import { el, clamp, damp, easeOut } from './UIKit.js';
import { worldMap, WORLD, POI_TYPES } from '../world/map/WorldMap.js';
import { drawWorldRaster, drawRoads, POI_GLYPH, drawGlyph } from '../world/map/MapRaster.js';

/**
 * The field minimap.
 *
 * A real chart, not a radar: the terrain silhouette and the whole road network
 * are rasterised **once** into an off-screen world image at build time, and
 * every frame just blits the piece of it under the player, rotated to heading.
 * Everything else — discovered points of interest, the quest waypoint, party
 * and enemy blips, the compass ring — is drawn on top in vector.
 *
 * Design rules of this UI layer: thin pale type, low-opacity dark plates,
 * angular corner cuts, hairlines that fade at the ends, and **no CSS
 * transitions or keyframes** — every animated value is written per frame from
 * `game.time.now` so captures are deterministic.
 *
 * Registration (Game.js system order, after HUD):
 *   ['Minimap', () => new Minimap()],
 */

const SIZE = 208;              // css px of the map disc
const DPR_CAP = 2;
const RANGE_STEPS = [140, 260, 480, 900];

export class Minimap {
  constructor() {
    /** Metres from the player edge-to-centre. */
    this.range = 480;
    /** North-locked (false) or rotating with the player (true). */
    this.rotate = true;
    this.visible = true;
    this._heading = 0;
    this._a = 0;
    this._pulse = 0;
  }

  /** @param {object} game */
  async init(game) {
    this.game = game;
    this.map = worldMap;
    this.terrain = game.get('Terrain');

    this.root = el('div', { id: 'minimap' });
    this.root.appendChild(styleTag());

    this.frame = el('div.mm-frame');
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'mm-canvas';
    this.frame.appendChild(this.canvas);
    this.root.appendChild(this.frame);

    this.zoneEl = el('div.mm-zone', { text: '' });
    this.regionEl = el('div.mm-region', { text: '' });
    this.scaleEl = el('div.mm-scale', { text: '' });
    this.root.appendChild(el('div.mm-caption', {}, [
      this.scaleEl,
      el('div.mm-names', {}, [this.zoneEl, this.regionEl]),
    ]));

    game.uiRoot.appendChild(this.root);

    this.ctx = this.canvas.getContext('2d');
    this._resize();
    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);

    // The static world image. 6 m per pixel over the whole 8.2 km field is
    // 1366 px square — one 7 MB raster built once, instead of thousands of
    // heightfield samples every frame.
    this.world = drawWorldRaster(this.terrain, { pixelsPerMetre: 1 / 6 });

    /** Explored mask, 96 m cells. Fog of war for the parts nobody has seen. */
    this.fogN = 96;
    this.fogCell = WORLD.size / this.fogN;
    this.fog = new Uint8Array(this.fogN * this.fogN);
    this._revealAround(0, 0, 420);
  }

  _resize() {
    const dpr = Math.min(DPR_CAP, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.canvas.width = Math.round(SIZE * dpr);
    this.canvas.height = Math.round(SIZE * dpr);
    this.canvas.style.width = `${SIZE}px`;
    this.canvas.style.height = `${SIZE}px`;
  }

  /** @param {boolean} v */
  setVisible(v) { this.visible = !!v; }

  /** Cycle 140 m -> 260 m -> 480 m -> 900 m and back. */
  cycleRange() {
    const i = RANGE_STEPS.indexOf(this.range);
    this.range = RANGE_STEPS[(i + 1) % RANGE_STEPS.length];
  }

  /** Toggle between a rotating chart and a north-locked one. */
  toggleRotate() { this.rotate = !this.rotate; }

  _revealAround(x, z, r) {
    const c = this.fogCell, n = this.fogN;
    const i0 = Math.max(0, Math.floor((x - r + WORLD.half) / c));
    const i1 = Math.min(n - 1, Math.ceil((x + r + WORLD.half) / c));
    const j0 = Math.max(0, Math.floor((z - r + WORLD.half) / c));
    const j1 = Math.min(n - 1, Math.ceil((z + r + WORLD.half) / c));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const px = -WORLD.half + (i + 0.5) * c, pz = -WORLD.half + (j + 0.5) * c;
        if (Math.hypot(px - x, pz - z) <= r) this.fog[j * n + i] = 255;
      }
    }
  }

  /** 0..1 how explored the cell containing this point is. */
  fogAt(x, z) {
    const i = clamp(Math.floor((x + WORLD.half) / this.fogCell), 0, this.fogN - 1);
    const j = clamp(Math.floor((z + WORLD.half) / this.fogCell), 0, this.fogN - 1);
    return this.fog[j * this.fogN + i] / 255;
  }

  // ------------------------------------------------------------------ frame

  lateUpdate(dt, game) {
    if (!this.ctx || !this.world) return;
    const player = game.get('Player');
    const px = player?.position?.x ?? game.camera.position.x;
    const pz = player?.position?.z ?? game.camera.position.z;
    const heading = player?.heading ?? Math.atan2(
      game.camera.position.x - (game.camera.position.x + 1), 1);

    // discovery + fog
    this._revealAround(px, pz, 340);
    if (!this._discAt || game.time.now - this._discAt > 0.4) {
      this._discAt = game.time.now;
      const found = this.map.discoverAround(px, pz);
      if (found.length) this._flash = { at: game.time.now, poi: found[found.length - 1] };
    }

    const menus = game.get('Menus');
    const target = this.visible && !(menus && menus.open) ? 1 : 0;
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

    this._draw(game, px, pz);
    this._caption(px, pz);
  }

  _caption(px, pz) {
    const zone = this.map.zoneAt(px, pz);
    const region = zone ? this.map.regionById.get(zone.region) : null;
    this.zoneEl.textContent = (zone ? zone.name : 'The Frontier').toUpperCase();
    this.regionEl.textContent = (region ? region.name : 'Lucis').toUpperCase();
    this.scaleEl.textContent = `${this.range} M`;
  }

  _draw(game, px, pz) {
    const c = this.ctx, dpr = this.dpr, S = SIZE * dpr;
    const t = game.time.now;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, S, S);

    // clip to the disc
    c.save();
    c.beginPath();
    c.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2);
    c.clip();

    c.fillStyle = 'rgba(6,10,17,0.94)';
    c.fillRect(0, 0, S, S);

    // ---- the world image, rotated under the player ----
    const ppm = (S / 2) / this.range;           // canvas px per world metre
    c.save();
    c.translate(S / 2, S / 2);
    c.rotate(-this._heading);
    c.scale(ppm / this.world.ppm, ppm / this.world.ppm);
    c.translate(-this.world.toPx(px), -this.world.toPz(pz));
    c.imageSmoothingEnabled = true;
    c.globalAlpha = 0.88;
    c.drawImage(this.world.canvas, 0, 0);
    c.globalAlpha = 1;
    c.restore();

    // ---- the road network, in screen space so a highway is always a highway
    c.save();
    c.translate(S / 2, S / 2);
    c.rotate(-this._heading);
    const R = this.range * 1.6;
    drawRoads(c, (wx) => (wx - px) * ppm, (wz) => (wz - pz) * ppm, {
      scale: dpr * 0.9,
      alpha: 0.9,
      bounds: { x0: px - R, x1: px + R, z0: pz - R, z1: pz + R },
    });
    c.restore();

    // ---- fog of war ----
    this._drawFog(c, S, px, pz, ppm);

    // ---- points of interest ----
    c.save();
    c.translate(S / 2, S / 2);
    for (const p of this.map.pois) {
      if (!this.map.discovered.has(p.id)) continue;
      const dx = p.x - px, dz = p.z - pz;
      if (Math.hypot(dx, dz) > this.range * 1.5) continue;
      const ca = Math.cos(-this._heading), sa = Math.sin(-this._heading);
      const sx = (dx * ca - dz * sa) * ppm, sy = (dx * sa + dz * ca) * ppm;
      const r = Math.hypot(sx, sy);
      const lim = S / 2 - 9 * dpr;
      const k = r > lim ? lim / r : 1;
      const def = POI_TYPES[p.type];
      drawGlyph(c, POI_GLYPH[p.type] || 'dot', sx * k, sy * k, 5.2 * dpr, def.colour,
        r > lim ? 0.45 : 0.95);
    }
    c.restore();

    // ---- quest waypoint ----
    const q = this.waypoint || (this.game.questWaypoint || null);
    if (q) {
      c.save();
      c.translate(S / 2, S / 2);
      const ca = Math.cos(-this._heading), sa = Math.sin(-this._heading);
      const dx = q.x - px, dz = q.z - pz;
      let sx = (dx * ca - dz * sa) * ppm, sy = (dx * sa + dz * ca) * ppm;
      const r = Math.hypot(sx, sy), lim = S / 2 - 11 * dpr;
      if (r > lim) { sx *= lim / r; sy *= lim / r; }
      const pulse = 0.5 + 0.5 * Math.sin(t * 3.1);
      c.strokeStyle = `rgba(232,207,152,${(0.30 + 0.5 * (1 - pulse)).toFixed(3)})`;
      c.lineWidth = 1.1 * dpr;
      c.beginPath();
      c.arc(sx, sy, (7 + 5 * pulse) * dpr, 0, Math.PI * 2);
      c.stroke();
      drawGlyph(c, 'quest', sx, sy, 6.4 * dpr, '#e8cf98', 1);
      c.restore();
    }

    // ---- party and hostiles ----
    c.save();
    c.translate(S / 2, S / 2);
    const ca = Math.cos(-this._heading), sa = Math.sin(-this._heading);
    const blip = (wx, wz, col, rad) => {
      const dx = wx - px, dz = wz - pz;
      const sx = (dx * ca - dz * sa) * ppm, sy = (dx * sa + dz * ca) * ppm;
      if (Math.hypot(sx, sy) > S / 2 - 4 * dpr) return;
      c.fillStyle = col;
      c.beginPath();
      c.arc(sx, sy, rad * dpr, 0, Math.PI * 2);
      c.fill();
    };
    const party = game.get('Party');
    for (const m of (party?.members || party?.companions || [])) {
      const p = m.position || m.root?.position;
      if (p) blip(p.x, p.z, 'rgba(182,214,248,0.92)', 2.4);
    }
    const enemies = game.get('Enemies');
    for (const e of (enemies?.active || enemies?.list || enemies?.enemies || [])) {
      const p = e.position || e.root?.position;
      if (p && (e.hp === undefined || e.hp > 0)) blip(p.x, p.z, 'rgba(224,100,74,0.95)', 2.6);
    }
    c.restore();

    // ---- the player arrow, always dead centre ----
    c.save();
    c.translate(S / 2, S / 2);
    if (!this.rotate) c.rotate((game.get('Player')?.heading ?? 0));
    c.fillStyle = '#f2f8ff';
    c.strokeStyle = 'rgba(6,10,18,0.9)';
    c.lineWidth = 1.2 * dpr;
    c.beginPath();
    c.moveTo(0, -7 * dpr);
    c.lineTo(5 * dpr, 5.5 * dpr);
    c.lineTo(0, 2.4 * dpr);
    c.lineTo(-5 * dpr, 5.5 * dpr);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();

    // vignette so the chart sinks into the plate at the rim
    const g = c.createRadialGradient(S / 2, S / 2, S * 0.28, S / 2, S / 2, S / 2);
    g.addColorStop(0, 'rgba(4,8,14,0)');
    g.addColorStop(0.62, 'rgba(4,8,14,0.22)');
    g.addColorStop(1, 'rgba(4,8,14,0.86)');
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
    c.restore();

    this._drawCompass(c, S, dpr);
  }

  _drawFog(c, S, px, pz, ppm) {
    const dpr = this.dpr;
    const step = this.fogCell * ppm;
    c.save();
    c.translate(S / 2, S / 2);
    c.rotate(-this._heading);
    const reach = Math.ceil(this.range * 1.5 / this.fogCell) + 1;
    const ci = Math.floor((px + WORLD.half) / this.fogCell);
    const cj = Math.floor((pz + WORLD.half) / this.fogCell);
    c.fillStyle = 'rgba(5,9,16,0.80)';
    for (let j = cj - reach; j <= cj + reach; j++) {
      if (j < 0 || j >= this.fogN) continue;
      for (let i = ci - reach; i <= ci + reach; i++) {
        if (i < 0 || i >= this.fogN) continue;
        if (this.fog[j * this.fogN + i]) continue;
        const wx = -WORLD.half + i * this.fogCell, wz = -WORLD.half + j * this.fogCell;
        c.fillRect((wx - px) * ppm, (wz - pz) * ppm, step + 1, step + 1);
      }
    }
    c.restore();
    void dpr;
  }

  _drawCompass(c, S, dpr) {
    const R = S / 2 - 1;
    c.save();
    c.translate(S / 2, S / 2);
    c.strokeStyle = 'rgba(206,224,250,0.26)';
    c.lineWidth = 1 * dpr;
    c.beginPath();
    c.arc(0, 0, R - 0.5, 0, Math.PI * 2);
    c.stroke();

    const marks = [['N', 0], ['E', 90], ['S', 180], ['W', 270]];
    c.font = `${Math.round(8.5 * dpr)}px "Helvetica Neue", Inter, system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let d = 0; d < 360; d += 15) {
      const a = (d * Math.PI) / 180 - this._heading - Math.PI / 2;
      const major = d % 45 === 0;
      const r0 = R - (major ? 7 : 4) * dpr;
      c.strokeStyle = major ? 'rgba(214,234,255,0.52)' : 'rgba(206,224,250,0.22)';
      c.beginPath();
      c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      c.lineTo(Math.cos(a) * (R - 1.5 * dpr), Math.sin(a) * (R - 1.5 * dpr));
      c.stroke();
    }
    for (const [label, d] of marks) {
      const a = (d * Math.PI) / 180 - this._heading - Math.PI / 2;
      const r = R - 15 * dpr;
      c.fillStyle = label === 'N' ? 'rgba(232,244,255,0.92)' : 'rgba(206,224,250,0.55)';
      c.fillText(label, Math.cos(a) * r, Math.sin(a) * r);
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
  position: absolute; right: 34px; top: 300px;
  pointer-events: none; user-select: none;
  font-family: var(--ui-font, system-ui);
}
#minimap .mm-frame {
  position: relative; width: ${SIZE}px; height: ${SIZE}px;
  border-radius: 50%;
  background: radial-gradient(circle at 42% 34%, rgba(12,20,32,.62), rgba(5,9,16,.86));
  box-shadow: 0 10px 34px rgba(0,0,0,.5), inset 0 0 0 1px rgba(206,224,250,.16);
}
#minimap .mm-canvas { display: block; border-radius: 50%; }
#minimap .mm-caption {
  margin-top: 10px; width: ${SIZE}px;
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
