import { worldMap, WORLD } from './WorldMap.js';

/**
 * Cartography: turns the live heightfield and road graph into one static
 * off-screen image that both the minimap and the world-map screen blit.
 *
 * Rasterising once at load costs a few milliseconds and removes the terrain
 * from the per-frame budget entirely — the minimap then only ever draws its
 * own vector furniture on top.
 *
 * The chart is *hillshaded*, not flat-shaded: a raking north-west light over
 * the real gradient is what lets a player read a ridge, a gorge and a lake
 * basin at a glance, which a height ramp alone never does.
 */

/** Per-class stroke styling for the road network. */
export const ROAD_STYLE = {
  highway: { w: 2.6, col: 'rgba(238,246,255,0.80)', halo: 'rgba(8,14,24,0.55)', haloW: 5.2 },
  road: { w: 1.8, col: 'rgba(226,240,255,0.62)', halo: 'rgba(8,14,24,0.45)', haloW: 4.0 },
  track: { w: 1.1, col: 'rgba(214,232,252,0.42)', halo: 'rgba(8,14,24,0.32)', haloW: 2.8, dash: [4, 4] },
  trail: { w: 0.8, col: 'rgba(200,220,246,0.26)', halo: null, haloW: 0, dash: [2, 4] },
};

/** Which glyph each POI type draws. */
export const POI_GLYPH = {
  town: 'town', outpost: 'outpost', reststop: 'rest', parking: 'parking',
  haven: 'haven', dungeon: 'dungeon', menace: 'menace', tomb: 'tomb',
  imperial: 'imperial', chocobo: 'chocobo', fishing: 'fishing', landmark: 'landmark',
};

/**
 * Draw one map glyph centred on (x, y). Deliberately geometric and hairline —
 * the same visual language as the rest of the HUD.
 * @param {CanvasRenderingContext2D} c
 * @param {string} kind see {@link POI_GLYPH}
 * @param {number} r nominal radius in canvas px
 */
export function drawGlyph(c, kind, x, y, r, colour, alpha = 1) {
  c.save();
  c.translate(x, y);
  c.globalAlpha = alpha;
  c.lineWidth = Math.max(0.9, r * 0.22);
  c.strokeStyle = colour;
  c.fillStyle = colour;
  c.lineJoin = 'round';

  // a dark halo so a pale glyph survives a pale patch of chart
  c.shadowColor = 'rgba(4,8,14,0.9)';
  c.shadowBlur = r * 0.9;

  switch (kind) {
    case 'town':
      c.beginPath();
      c.moveTo(0, -r); c.lineTo(r, 0); c.lineTo(0, r); c.lineTo(-r, 0); c.closePath();
      c.fill();
      c.beginPath(); c.arc(0, 0, r * 1.7, 0, Math.PI * 2); c.stroke();
      break;
    case 'outpost':
      c.beginPath();
      c.moveTo(0, -r); c.lineTo(r, 0); c.lineTo(0, r); c.lineTo(-r, 0); c.closePath();
      c.stroke();
      c.beginPath(); c.arc(0, 0, r * 0.34, 0, Math.PI * 2); c.fill();
      break;
    case 'rest':
      c.beginPath();
      c.rect(-r * 0.9, -r * 0.7, r * 1.8, r * 1.4);
      c.stroke();
      c.beginPath(); c.moveTo(-r * 0.9, -r * 0.7); c.lineTo(0, -r * 1.4); c.lineTo(r * 0.9, -r * 0.7);
      c.stroke();
      break;
    case 'parking':
      c.beginPath(); c.arc(0, 0, r * 0.72, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(-r * 0.24, r * 0.4); c.lineTo(-r * 0.24, -r * 0.4);
      c.lineTo(r * 0.1, -r * 0.4); c.stroke();
      break;
    case 'haven':
      // the runic camp circle
      c.beginPath(); c.arc(0, 0, r * 0.92, 0, Math.PI * 2); c.stroke();
      c.beginPath();
      c.moveTo(0, -r * 0.55); c.lineTo(r * 0.5, r * 0.4); c.lineTo(-r * 0.5, r * 0.4); c.closePath();
      c.fill();
      break;
    case 'dungeon':
      c.beginPath();
      c.moveTo(-r, r); c.lineTo(-r * 0.55, -r * 0.5); c.lineTo(0, r * 0.1);
      c.lineTo(r * 0.55, -r * 0.5); c.lineTo(r, r);
      c.stroke();
      break;
    case 'menace':
      c.beginPath();
      c.moveTo(-r, -r * 0.6); c.lineTo(r, -r * 0.6); c.lineTo(0, r); c.closePath();
      c.stroke();
      c.beginPath(); c.moveTo(0, -r * 0.2); c.lineTo(0, r * 0.4); c.stroke();
      break;
    case 'tomb':
      c.beginPath();
      c.moveTo(0, -r * 1.2); c.lineTo(0, r * 0.9);
      c.moveTo(-r * 0.7, -r * 0.35); c.lineTo(r * 0.7, -r * 0.35);
      c.stroke();
      break;
    case 'imperial':
      c.beginPath();
      c.rect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
      c.stroke();
      c.beginPath();
      c.moveTo(-r * 0.85, -r * 0.85); c.lineTo(r * 0.85, r * 0.85);
      c.moveTo(r * 0.85, -r * 0.85); c.lineTo(-r * 0.85, r * 0.85);
      c.stroke();
      break;
    case 'chocobo':
      c.beginPath();
      c.moveTo(-r * 0.2, r); c.lineTo(-r * 0.2, -r * 0.2);
      c.quadraticCurveTo(-r * 0.2, -r, r * 0.6, -r * 0.9);
      c.stroke();
      c.beginPath(); c.arc(r * 0.55, -r * 0.85, r * 0.22, 0, Math.PI * 2); c.fill();
      break;
    case 'fishing':
      c.beginPath();
      c.moveTo(-r, -r * 0.9); c.quadraticCurveTo(r * 0.7, -r * 0.2, r * 0.2, r * 0.9);
      c.stroke();
      c.beginPath(); c.arc(r * 0.2, r * 0.9, r * 0.2, 0, Math.PI * 2); c.fill();
      break;
    case 'landmark':
      c.beginPath();
      c.moveTo(0, -r * 1.1); c.lineTo(r * 0.95, r * 0.75); c.lineTo(-r * 0.95, r * 0.75);
      c.closePath();
      c.stroke();
      break;
    case 'quest':
      c.beginPath();
      c.moveTo(0, -r); c.lineTo(r * 0.62, 0); c.lineTo(0, r); c.lineTo(-r * 0.62, 0);
      c.closePath();
      c.fill();
      break;
    default:
      c.beginPath(); c.arc(0, 0, r * 0.5, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => a + (b - a) * t;

/**
 * Rasterise the whole world into one hillshaded chart.
 *
 * @param {object} terrain the live `Terrain` system
 * @param {{pixelsPerMetre?:number}} [opt]
 * @returns {{canvas:HTMLCanvasElement, ppm:number, size:number,
 *            toPx:function(number):number, toPz:function(number):number}}
 */
export function drawWorldRaster(terrain, opt = {}) {
  const ppm = opt.pixelsPerMetre || 1 / 8;
  const size = Math.round(WORLD.size * ppm);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const c = canvas.getContext('2d');

  const toPx = (x) => (x + WORLD.half) * ppm;
  const toPz = (z) => (z + WORLD.half) * ppm;

  // ---- terrain layer, straight off the CPU heightfield -------------------
  const field = terrain && terrain.field;
  const img = c.createImageData(size, size);
  const d = img.data;
  const mPerPx = 1 / ppm;
  const sample = field
    ? (x, z) => field.rawHeightAt(x, z)
    : (x, z) => (terrain ? terrain.heightAt(x, z) : 0);

  // A 24 m shading baseline rather than one pixel: at 6 m per pixel the raw
  // gradient picks up every erosion runnel and the chart turns into a
  // fingerprint. Widening it leaves the landforms and drops the noise.
  const E = 12;
  const bio = {};
  for (let j = 0; j < size; j++) {
    const z = -WORLD.half + j * mPerPx;
    for (let i = 0; i < size; i++) {
      const x = -WORLD.half + i * mPerPx;
      const h = sample(x, z);
      const gx = (sample(x + E, z) - sample(x - E, z)) / (2 * E);
      const gz = (sample(x, z + E) - sample(x, z - E)) / (2 * E);

      // raking light from the north-west, the cartographic convention
      const shade = clamp01(0.50 + 1.45 * (-gx * 0.62 - gz * 0.62) / Math.sqrt(1 + gx * gx + gz * gz));
      const slope = clamp01(Math.hypot(gx, gz) * 1.3);

      // The chart is a *drawing*, not a photograph: near-monochrome cool
      // grey-blue, with only enough regional tint to tell ochre badland from
      // green wetland, so pale UI type and glyphs stay legible on top of it.
      let r, g, b;
      if (h < WORLD.seaLevel) {
        const dep = clamp01((WORLD.seaLevel - h) / 30);
        r = mix(30, 10, dep); g = mix(56, 22, dep); b = mix(80, 40, dep);
      } else {
        worldMap.biomeAt(x, z, bio);
        const wet = clamp01(bio.moist);
        const lowR = mix(74, 52, wet), lowG = mix(66, 68, wet), lowB = mix(54, 58, wet);
        const alt = clamp01((h - 30) / 340);
        const bare = Math.max(alt * 0.75, slope * 0.85);
        r = mix(lowR, 116, bare); g = mix(lowG, 122, bare); b = mix(lowB, 132, bare);
        const cap = clamp01((h - 400) / 230);
        r = mix(r, 176, cap); g = mix(g, 188, cap); b = mix(b, 202, cap);
      }
      const k = (0.40 + 0.86 * shade) * 0.88;
      // the map sheet fades out at the frontier rather than being guillotined
      const edge = clamp01(Math.min(
        (WORLD.half - Math.abs(x)) / 340, (WORLD.half - Math.abs(z)) / 340));
      const o = (j * size + i) * 4;
      d[o] = clamp01(r * k / 255) * 255;
      d[o + 1] = clamp01(g * k / 255) * 255;
      d[o + 2] = clamp01(b * k / 255) * 255;
      d[o + 3] = 255 * (edge * edge * (3 - 2 * edge));
    }
  }
  c.putImageData(img, 0, 0);

  // ---- contour hint: a faint 60 m banding so relief reads at low zoom ----
  c.save();
  c.globalAlpha = 0.055;
  c.globalCompositeOperation = 'overlay';
  const cimg = c.createImageData(size, size);
  const cd = cimg.data;
  for (let j = 0; j < size; j++) {
    const z = -WORLD.half + j * mPerPx;
    for (let i = 0; i < size; i++) {
      const h = sample(-WORLD.half + i * mPerPx, z);
      const band = Math.abs(((h / 100) % 1)) < 0.045 ? 255 : 0;
      const o = (j * size + i) * 4;
      cd[o] = cd[o + 1] = cd[o + 2] = 255;
      cd[o + 3] = band ? 90 : 0;
    }
  }
  const tmp = document.createElement('canvas');
  tmp.width = size; tmp.height = size;
  tmp.getContext('2d').putImageData(cimg, 0, 0);
  c.drawImage(tmp, 0, 0);
  c.restore();

  return { canvas, ppm, size, toPx, toPz };
}

/**
 * Stroke the road network in screen space.
 *
 * Roads are drawn every frame rather than baked into the raster because a
 * baked road scales with the zoom: at minimap magnification a 3 px highway
 * becomes a 12 px white band across the whole chart. Drawn live, a highway is
 * a highway at every zoom, which is what a map is for.
 *
 * @param {CanvasRenderingContext2D} c
 * @param {function(number):number} sx world x -> canvas x
 * @param {function(number):number} sy world z -> canvas y
 * @param {{scale?:number, alpha?:number, bounds?:{x0:number,x1:number,z0:number,z1:number}}} [opt]
 */
export function drawRoads(c, sx, sy, opt = {}) {
  const scale = opt.scale || 1;
  const alpha = opt.alpha == null ? 1 : opt.alpha;
  const b = opt.bounds;
  const g = worldMap.roadGraph;
  c.save();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  c.globalAlpha = alpha;
  for (const pass of ['halo', 'core']) {
    for (const e of g.edges) {
      const st = ROAD_STYLE[e.cls];
      if (pass === 'halo' && !st.halo) continue;
      if (b) {
        let inside = false;
        for (let i = 0; i < e.pts.length; i += 6) {
          const q = e.pts[i];
          if (q.x > b.x0 && q.x < b.x1 && q.z > b.z0 && q.z < b.z1) { inside = true; break; }
        }
        if (!inside) continue;
      }
      c.strokeStyle = pass === 'halo' ? st.halo : st.col;
      c.lineWidth = (pass === 'halo' ? st.haloW : st.w) * scale;
      c.setLineDash(pass === 'core' && st.dash ? st.dash.map((v) => v * scale) : []);
      c.beginPath();
      const pts = e.pts;
      c.moveTo(sx(pts[0].x), sy(pts[0].z));
      for (let i = 1; i < pts.length; i++) c.lineTo(sx(pts[i].x), sy(pts[i].z));
      c.stroke();
    }
  }
  c.setLineDash([]);
  c.restore();
}
