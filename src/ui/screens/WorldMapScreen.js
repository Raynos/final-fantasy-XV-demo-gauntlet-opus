import { el, clamp, easeOut, easeOutQuint, damp } from '../UIKit.js';
import { worldMap, WORLD, POI_TYPES } from '../../world/map/WorldMap.js';
import { drawWorldRaster, drawRoads, POI_GLYPH, drawGlyph } from '../../world/map/MapRaster.js';

/**
 * The full-screen chart of Lucis.
 *
 * Pan, zoom, filter by type, fog of war over everything nobody has walked,
 * quest markers, fast travel where the map allows it, and — the FFXV habit —
 * a distance and an estimated travel time to whatever the cursor is on, by
 * road for the car and in a straight line on foot.
 *
 * Registration (`src/ui/Menus.js`):
 *   import { WorldMapScreen } from './screens/WorldMapScreen.js';
 *   ...
 *   this.screens = { ..., world: new WorldMapScreen(this) };
 * and, to open it, `menus.setScreen('world')`.
 *
 * No CSS transitions or keyframes: every animated value is written per frame
 * from `game.time.now`, so a capture after N fixed steps is reproducible.
 */

const FILTERS = [
  { id: 'all', label: 'All', types: null },
  { id: 'settle', label: 'Settlements', types: ['town', 'outpost', 'reststop', 'chocobo'] },
  { id: 'haven', label: 'Havens', types: ['haven', 'parking'] },
  { id: 'dungeon', label: 'Dungeons', types: ['dungeon', 'menace', 'tomb'] },
  { id: 'hostile', label: 'Imperial', types: ['imperial'] },
  { id: 'leisure', label: 'Fishing', types: ['fishing'] },
  { id: 'sights', label: 'Landmarks', types: ['landmark'] },
];

const ZOOMS = [0.055, 0.085, 0.13, 0.20, 0.32];

export class WorldMapScreen {
  /** @param {import('../Menus.js').Menus} menus */
  constructor(menus) {
    this.menus = menus;
    this.title = 'Map';
    this.sub = 'Lucis  ·  Leide · Duscae · Cleigne';
    this.filter = 0;
    this.zoomI = 2;
    this.cam = { x: 0, z: 0 };
    this.camT = { x: 0, z: 0 };
    this.sel = 0;
    this._a = 0;
  }

  /** @param {HTMLElement} root @param {object} game */
  build(root, game) {
    this.game = game;
    this.map = worldMap;
    root.appendChild(styleTag());

    this.wrap = el('div.wm-wrap');
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'wm-canvas';
    this.wrap.appendChild(this.canvas);
    root.appendChild(this.wrap);
    this.ctx = this.canvas.getContext('2d');

    // filter rail
    this.filterEls = FILTERS.map((f, i) => {
      const n = el('div.wm-filter', {}, [
        el('div.wm-fdot'), el('div.wm-flabel', { text: f.label.toUpperCase() }),
      ]);
      if (i === 0) n.classList.add('on');
      return n;
    });
    this.rail = el('div.wm-rail', {}, this.filterEls);
    root.appendChild(this.rail);

    // read-out card for the selected point
    this.cardName = el('div.wm-name', { text: '' });
    this.cardType = el('div.wm-type', { text: '' });
    this.cardDoes = el('div.wm-does', { text: '' });
    this.cardRows = el('div.wm-rows');
    this.card = el('div.wm-card', {}, [
      this.cardName, this.cardType, el('div.wm-rule'), this.cardDoes, this.cardRows,
    ]);
    root.appendChild(this.card);

    // scale bar + legend
    this.scaleBar = el('div.wm-scalebar', {}, [
      el('div.wm-scaleline'), this.scaleTxt = el('div.wm-scaletxt', { text: '1 KM' }),
    ]);
    root.appendChild(this.scaleBar);

    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
    this._resize();
  }

  _resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(1600 * 0.76), h = Math.round(900 * 0.80);
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  /** Called by Menus when the screen becomes visible. */
  enter(game) {
    this.game = game;
    const t = game.get('Terrain');
    if (!this.world) this.world = drawWorldRaster(t, { pixelsPerMetre: 1 / 6 });
    this.minimap = game.get('Minimap');
    const p = game.get('Player');
    if (p) { this.cam.x = this.camT.x = p.position.x; this.cam.z = this.camT.z = p.position.z; }
    this._rebuildList();
    // start on the nearest discovered point so the card is never empty
    const near = this.map.nearestPOI(this.cam.x, this.cam.z, { discoveredOnly: true });
    if (near) {
      const i = this.list.indexOf(near.poi);
      if (i >= 0) this.sel = i;
    }
  }

  _rebuildList() {
    const f = FILTERS[this.filter];
    this.list = this.map.pois.filter((p) => this.map.discovered.has(p.id)
      && (!f.types || f.types.includes(p.type)));
    if (!this.list.length) this.list = this.map.pois.filter((p) => this.map.discovered.has(p.id));
    this.sel = clamp(this.sel, 0, Math.max(0, this.list.length - 1));
  }

  /**
   * D-pad: left/right steps the selection along the list, up/down changes the
   * filter. Holding a direction pans because `Menus` repeats the edge.
   */
  nav(dx, dy) {
    if (dy) {
      this.filter = (this.filter + (dy > 0 ? 1 : -1) + FILTERS.length) % FILTERS.length;
      for (let i = 0; i < this.filterEls.length; i++) {
        this.filterEls[i].classList.toggle('on', i === this.filter);
      }
      this._rebuildList();
    }
    if (dx && this.list.length) {
      this.sel = (this.sel + (dx > 0 ? 1 : -1) + this.list.length) % this.list.length;
    }
    const p = this.list[this.sel];
    if (p) { this.camT.x = p.x; this.camT.z = p.z; }
  }

  /** Fast travel to the selected point, if it allows it. */
  accept() {
    const p = this.list[this.sel];
    if (!p || !p.travel) return;
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

  /** Zoom out one step, then in again (bound by whoever wires the key). */
  zoom(dir) { this.zoomI = clamp(this.zoomI + dir, 0, ZOOMS.length - 1); }

  /** @param {number} dt @param {object} game @param {number} a */
  update(dt, game, a) {
    this._a = a;
    const t = game.time.now;
    const rev = easeOutQuint(clamp((a - 0.05) / 0.85, 0, 1));
    this.wrap.style.opacity = rev.toFixed(3);
    this.rail.style.opacity = easeOut(clamp((rev - 0.2) / 0.6, 0, 1)).toFixed(3);
    this.card.style.opacity = easeOut(clamp((rev - 0.34) / 0.55, 0, 1)).toFixed(3);
    this.scaleBar.style.opacity = easeOut(clamp((rev - 0.4) / 0.5, 0, 1)).toFixed(3);
    this.card.style.transform = `translateX(${((1 - rev) * 22).toFixed(2)}px)`;

    this.cam.x = damp(this.cam.x, this.camT.x, 7, dt);
    this.cam.z = damp(this.cam.z, this.camT.z, 7, dt);

    this._draw(game, t, rev);
    this._card(game);
  }

  _card(game) {
    const p = this.list?.[this.sel];
    if (!p) { this.cardName.textContent = ''; return; }
    const player = game.get('Player');
    const px = player?.position?.x ?? 0, pz = player?.position?.z ?? 0;
    const drive = this.map.travel(px, pz, p.x, p.z, 'drive');
    const walk = this.map.travel(px, pz, p.x, p.z, 'walk');
    const zone = this.map.zoneById.get(p.zone);
    const region = zone ? this.map.regionById.get(zone.region) : null;

    this.cardName.textContent = p.name.toUpperCase();
    this.cardType.textContent = `${POI_TYPES[p.type].label}  ·  ${zone ? zone.name : ''}`
      + `${region ? `, ${region.name}` : ''}`;
    this.cardDoes.textContent = p.does || '';

    const rows = [
      ['Distance', `${(Math.hypot(p.x - px, p.z - pz) / 1000).toFixed(2)} km`],
      ['By road', `${(drive.dist / 1000).toFixed(2)} km  ·  ${fmtTime(drive.seconds)}`],
      ['On foot', fmtTime(walk.seconds)],
      ['Level', p.lv ? `${p.lv}` : '—'],
      ['Fast travel', p.travel ? 'Available' : 'Not available'],
    ];
    while (this.cardRows.firstChild) this.cardRows.removeChild(this.cardRows.firstChild);
    for (const [k, v] of rows) {
      this.cardRows.appendChild(el('div.wm-row', {}, [
        el('div.wm-k', { text: k.toUpperCase() }), el('div.wm-v', { text: v }),
      ]));
    }
  }

  _draw(game, t, rev) {
    const c = this.ctx, dpr = this.dpr;
    const W = this.w * dpr, H = this.h * dpr;
    const ppm = ZOOMS[this.zoomI] * dpr;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, W, H);

    c.save();
    c.beginPath();
    c.rect(0, 0, W, H);
    c.clip();
    c.fillStyle = 'rgba(5,9,16,0.92)';
    c.fillRect(0, 0, W, H);

    const sx = (wx) => W / 2 + (wx - this.cam.x) * ppm;
    const sy = (wz) => H / 2 + (wz - this.cam.z) * ppm;

    // graticule, 500 m
    c.strokeStyle = 'rgba(160,196,240,0.055)';
    c.lineWidth = 1;
    c.beginPath();
    for (let g = -WORLD.half; g <= WORLD.half; g += 500) {
      c.moveTo(sx(g), 0); c.lineTo(sx(g), H);
      c.moveTo(0, sy(g)); c.lineTo(W, sy(g));
    }
    c.stroke();

    // the chart
    c.save();
    c.translate(W / 2, H / 2);
    c.scale(ppm / this.world.ppm, ppm / this.world.ppm);
    c.translate(-this.world.toPx(this.cam.x), -this.world.toPz(this.cam.z));
    c.globalAlpha = 0.96 * rev;
    c.drawImage(this.world.canvas, 0, 0);
    c.globalAlpha = 1;
    c.restore();

    drawRoads(c, sx, sy, { scale: dpr * (0.7 + ppm * 2.4), alpha: 0.92 });

    this._drawFog(c, W, H, ppm, sx, sy);

    // zone names
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const z of this.map.zones) {
      if (ppm > 0.30 * dpr || !this._zoneSeen(z)) continue;
      const x = sx(z.cx), y = sy(z.cz);
      if (x < -100 || x > W + 100 || y < -60 || y > H + 60) continue;
      c.font = `200 ${Math.round(11 * dpr)}px "Helvetica Neue", Inter, system-ui, sans-serif`;
      c.fillStyle = 'rgba(232,244,255,0.42)';
      c.save();
      c.translate(x, y);
      spaced(c, z.name.toUpperCase(), 5.2 * dpr);
      c.restore();
    }

    // the road network is already in the raster; draw POIs on top
    const f = FILTERS[this.filter];
    for (const p of this.map.pois) {
      if (!this.map.discovered.has(p.id)) continue;
      const dim = f.types && !f.types.includes(p.type);
      const x = sx(p.x), y = sy(p.z);
      if (x < -40 || x > W + 40 || y < -40 || y > H + 40) continue;
      const def = POI_TYPES[p.type];
      const on = this.list?.[this.sel] === p;
      drawGlyph(c, POI_GLYPH[p.type] || 'dot', x, y, (on ? 8.2 : 6.0) * dpr, def.colour,
        dim ? 0.20 : on ? 1 : 0.78);
      const named = ['town', 'outpost', 'reststop', 'chocobo'].includes(p.type);
      if (!dim && (on || named || (ppm > 0.24 * dpr && p.type === 'landmark'))) {
        c.font = `300 ${Math.round(9.5 * dpr)}px "Helvetica Neue", Inter, system-ui, sans-serif`;
        c.fillStyle = on ? 'rgba(240,248,255,0.95)' : 'rgba(216,232,252,0.62)';
        c.textAlign = 'left';
        c.shadowColor = 'rgba(4,8,14,0.95)';
        c.shadowBlur = 5 * dpr;
        c.fillText(p.name.toUpperCase(), x + 12 * dpr, y + 1);
        c.shadowBlur = 0;
      }
      if (on) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 2.6);
        c.strokeStyle = `rgba(226,242,255,${(0.30 + 0.42 * (1 - pulse)).toFixed(3)})`;
        c.lineWidth = 1.1 * dpr;
        c.beginPath();
        c.arc(x, y, (13 + 8 * pulse) * dpr, 0, Math.PI * 2);
        c.stroke();
      }
    }

    // the player
    const player = game.get('Player');
    if (player?.position) {
      const x = sx(player.position.x), y = sy(player.position.z);
      c.save();
      c.translate(x, y);
      c.rotate(player.heading || 0);
      c.fillStyle = '#f2f8ff';
      c.strokeStyle = 'rgba(6,10,18,0.9)';
      c.lineWidth = 1.3 * dpr;
      c.beginPath();
      c.moveTo(0, -9 * dpr); c.lineTo(6 * dpr, 7 * dpr);
      c.lineTo(0, 3 * dpr); c.lineTo(-6 * dpr, 7 * dpr);
      c.closePath();
      c.fill(); c.stroke();
      c.restore();
      const pr = (13 + 7 * (0.5 + 0.5 * Math.sin(t * 2.2))) * dpr;
      c.strokeStyle = `rgba(226,242,255,${(0.75 - (pr / dpr - 13) / 14).toFixed(3)})`;
      c.lineWidth = 1.1 * dpr;
      c.beginPath();
      c.arc(x, y, pr, 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();

    // frame hairline with the house corner cut
    c.strokeStyle = 'rgba(206,224,250,0.22)';
    c.lineWidth = 1;
    const cut = 14 * dpr;
    c.beginPath();
    c.moveTo(cut, 0.5); c.lineTo(W - 0.5, 0.5); c.lineTo(W - 0.5, H - cut);
    c.lineTo(W - cut, H - 0.5); c.lineTo(0.5, H - 0.5); c.lineTo(0.5, cut);
    c.closePath();
    c.stroke();

    const km = 1000 * ZOOMS[this.zoomI];
    this.scaleTxt.textContent = km > 90 ? '1 KM' : '5 KM';
    this.scaleBar.firstChild.style.width = `${(km > 90 ? km : km * 5).toFixed(0)}px`;
  }

  _zoneSeen(z) {
    if (!this.minimap) return true;
    return this.minimap.fogAt(z.cx, z.cz) > 0.5;
  }

  _drawFog(c, W, H, ppm, sx, sy) {
    const mm = this.minimap;
    if (!mm || !mm.fog) return;
    const cell = mm.fogCell;
    c.fillStyle = 'rgba(5,9,16,0.86)';
    for (let j = 0; j < mm.fogN; j++) {
      const wz = -WORLD.half + j * cell;
      const y = sy(wz);
      if (y < -cell * ppm || y > H + cell * ppm) continue;
      let run = -1;
      for (let i = 0; i <= mm.fogN; i++) {
        const unseen = i < mm.fogN && !mm.fog[j * mm.fogN + i];
        if (unseen && run < 0) run = i;
        if (!unseen && run >= 0) {
          const x0 = sx(-WORLD.half + run * cell), x1 = sx(-WORLD.half + i * cell);
          c.fillRect(x0, y, x1 - x0 + 1, cell * ppm + 1);
          run = -1;
        }
      }
    }
  }

  exit() { }
}

function fmtTime(sec) {
  if (!isFinite(sec)) return '—';
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  if (m >= 60) return `${Math.floor(m / 60)} h ${m % 60} min`;
  return m ? `${m} min ${String(s).padStart(2, '0')} s` : `${s} s`;
}

/** Draw letter-spaced text centred on the origin — canvas has no tracking. */
function spaced(c, text, spacing) {
  let total = 0;
  for (const ch of text) total += c.measureText(ch).width + spacing;
  total -= spacing;
  let x = -total / 2;
  c.textAlign = 'left';
  for (const ch of text) {
    c.fillText(ch, x, 0);
    x += c.measureText(ch).width + spacing;
  }
  c.textAlign = 'center';
}

function styleTag() {
  const s = document.createElement('style');
  s.textContent = `
.s-world .wm-wrap {
  position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%);
}
.s-world .wm-canvas { display: block; }
.s-world .wm-rail {
  position: absolute; left: 64px; top: 176px;
  display: flex; flex-direction: column; gap: 13px;
}
.s-world .wm-filter { display: flex; align-items: center; gap: 11px; }
.s-world .wm-fdot {
  width: 7px; height: 7px; flex: none; transform: rotate(45deg);
  background: transparent; box-shadow: inset 0 0 0 1px rgba(206,224,250,.42);
}
.s-world .wm-filter.on .wm-fdot { background: var(--ice, #b6d6f8); box-shadow: 0 0 8px rgba(150,200,250,.6); }
.s-world .wm-flabel {
  font-size: 8.5px; letter-spacing: .30em; color: var(--ink-4, rgba(198,214,240,.34));
  text-shadow: 0 1px 2px rgba(0,0,0,.72);
}
.s-world .wm-filter.on .wm-flabel { color: var(--ink, #eef4fd); }
.s-world .wm-card {
  position: absolute; right: 58px; top: 168px; width: 320px;
  padding: 18px 20px 16px;
  background: linear-gradient(104deg, rgba(9,14,24,.62) 0%, rgba(9,14,24,.34) 62%, rgba(9,14,24,.20) 100%);
  clip-path: polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 9px 100%, 0 calc(100% - 9px));
  box-shadow: 0 10px 34px rgba(0,0,0,.42);
}
.s-world .wm-name {
  font-size: 15px; font-weight: 200; letter-spacing: .20em; color: var(--ink, #eef4fd);
  text-shadow: 0 2px 6px rgba(0,0,0,.78);
}
.s-world .wm-type {
  margin-top: 5px; font-size: 8.5px; letter-spacing: .24em; text-transform: uppercase;
  color: var(--ink-3, rgba(210,224,246,.56)); text-shadow: 0 1px 2px rgba(0,0,0,.72);
}
.s-world .wm-rule {
  height: 1px; margin: 13px 0 12px;
  background: linear-gradient(90deg, transparent, rgba(206,224,250,.26) 6%, rgba(206,224,250,.26) 78%, transparent);
}
.s-world .wm-does {
  font-size: 11.5px; font-weight: 300; letter-spacing: .035em; line-height: 1.62;
  color: var(--ink-2, rgba(228,238,252,.72)); text-shadow: 0 1px 2px rgba(0,0,0,.72);
  min-height: 56px;
}
.s-world .wm-rows { margin-top: 12px; display: flex; flex-direction: column; gap: 7px; }
.s-world .wm-row { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; }
.s-world .wm-k {
  font-size: 8px; letter-spacing: .28em; color: var(--ink-4, rgba(198,214,240,.34));
  text-shadow: 0 1px 2px rgba(0,0,0,.72);
}
.s-world .wm-v {
  font-size: 11px; font-weight: 300; letter-spacing: .04em; color: var(--ink, #eef4fd);
  text-shadow: 0 1px 2px rgba(0,0,0,.72); font-variant-numeric: tabular-nums;
}
.s-world .wm-scalebar { position: absolute; left: 64px; bottom: 118px; }
.s-world .wm-scaleline {
  height: 1px; width: 130px; background: rgba(216,234,255,.6);
  box-shadow: 0 -4px 0 -3px rgba(216,234,255,.6), 0 4px 0 -3px rgba(216,234,255,.6);
}
.s-world .wm-scaletxt {
  margin-top: 6px; font-size: 8px; letter-spacing: .3em;
  color: var(--ink-4, rgba(198,214,240,.34)); text-shadow: 0 1px 2px rgba(0,0,0,.72);
}
`;
  return s;
}
