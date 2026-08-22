/**
 * THE MAP LEGEND — one procedural glyph per point-of-interest type.
 *
 * Every glyph is a stroke drawing inside the same 24×24 box at the same
 * nominal weight as `ui/Icons.js`, so a haven on the chart, a haven in the
 * filter rail and a haven in the detail card are the *same mark*. They are
 * stored as SVG path data and rendered two ways: as `Path2D` on the chart
 * canvas (minimap and world map) and as inline `<svg>` in the DOM legend.
 *
 * Reading rules, in order of importance:
 *   - silhouette first: a glyph must be identifiable as a black-on-white
 *     shape at 11 px, before colour or label help;
 *   - one stroke weight across the whole set, kept constant in *device*
 *     pixels no matter what radius the caller asks for;
 *   - a dark halo under everything, because the chart underneath is not a
 *     uniform value.
 */

/** One glyph: a stroke path, its weight, and optionally a dash and a fill. */
export interface Glyph {
  /** SVG path data, in a 24x24 box. */
  d: string;
  /** Stroke weight, before the per-zoom division. */
  w: number;
  /** Dash pattern, in the same units. */
  dash?: number[];
  /** A second path drawn filled, under the stroke. */
  fill?: string;
}

/** 24x24 stroke paths, one per POI type plus the map's own markers. */
export const GLYPH: Record<string, Glyph> = {
  // a skyline: two blocks and a doorway
  town: { d: 'M3.4 20.2h17.2M6.2 20.2V10.6l4.2-3.3 4.2 3.3v9.6M14.6 20.2v-6.5l3.3-2.5 3.3 2.5v6.5M9.2 20.2v-3.5h2.4v3.5', w: 1.15 },
  // a single hut under a pitched roof
  outpost: { d: 'M4.6 20.2h14.8M7.4 20.2v-8.8L12 7.8l4.6 3.6v8.8M10.3 20.2v-3.7h3.4v3.7', w: 1.15 },
  // the caravan every rest area in Lucis parks on its apron
  reststop: { d: 'M3.4 16V9.6h11.4l4.6 3.4V16M3.4 16h17M3.4 16V9.6M6.6 16a2.1 2.1 0 1 0 4.2 0M14 16a2.1 2.1 0 1 0 4.2 0M3.4 19.2h17.2', w: 1.15 },
  // the parking plate
  parking: { d: 'M5.4 4.4h13.2v15.2H5.4ZM9.6 16.6V7.6h3.6a2.9 2.9 0 0 1 0 5.8H9.6', w: 1.15 },
  // the runed camp circle with its tent
  haven: { d: 'M12 2.8a9.2 9.2 0 1 0 0 18.4 9.2 9.2 0 0 0 0-18.4M12 6.6 17.4 16.6H6.6Z', w: 1.15, fill: 'M12 10.6 15.2 16.6H8.8Z' },
  // a cave mouth with a second arch behind it
  dungeon: { d: 'M4.2 20.2v-6.4a7.8 7.8 0 0 1 15.6 0v6.4M9.2 20.2v-5.4a2.8 2.8 0 0 1 5.6 0v5.4M2.6 20.2h18.8', w: 1.15 },
  // the endless descent: an inverted vault, narrowing
  menace: { d: 'M3.8 5.6h16.4L12 20.8ZM7.4 10.2h9.2M9.6 14h4.8', w: 1.15 },
  // a royal monolith carrying the arm
  tomb: { d: 'M12 2.8 6.4 8.6v11.6h11.2V8.6ZM12 6.8v10.4M9 11h6M6.4 20.2h11.2', w: 1.15 },
  // the imperial diamond and its double chevron
  imperial: { d: 'M12 2.6 21.4 12 12 21.4 2.6 12ZM7.6 12.6 12 8.2l4.4 4.4M7.6 16.2 12 11.8l4.4 4.4', w: 1.15 },
  // a chocobo: crest, eye, beak
  chocobo: { d: 'M15.4 5.8a4.6 4.6 0 1 0 0 9.2 4.6 4.6 0 0 0 0-9.2M11 9.4 5.4 11.2 11 13.2M16.8 5.9 15.6 2.2 12.9 4.6M14.8 15v5.4M17.8 14.4v5.8', w: 1.15, fill: 'M16.6 9.2a1 1 0 1 0 0 2 1 1 0 0 0 0-2' },
  // a fish, tail to the west
  fishing: { d: 'M5.6 12c2.9-3.5 6.6-5.2 10-5.2 3.4 0 5.8 2.3 5.8 5.2s-2.4 5.2-5.8 5.2c-3.4 0-7.1-1.7-10-5.2ZM5.6 12 2.2 8.2v7.6ZM12.4 8.4c1.4 2.4 1.4 4.8 0 7.2', w: 1.15, fill: 'M18.2 10.8a1 1 0 1 0 0 2 1 1 0 0 0 0-2' },
  // a landform worth stopping the car for
  landmark: { d: 'M2.4 19.6h19.2L14.8 6.2l-3.6 6.2-2.4-2.8ZM12.2 11.6l2.6-4.6 2.6 5.2', w: 1.15 },
  // the tracked objective
  quest: { d: 'M12 3 20.2 12 12 21 3.8 12Z', w: 1.15, fill: 'M12 6.6 16.6 12 12 17.4 7.4 12Z' },
  // surveyed from a distance but never visited
  unknown: { d: 'M12 3.6a8.4 8.4 0 1 0 0 16.8 8.4 8.4 0 0 0 0-16.8', w: 1.05, dash: [2.4, 2.6], fill: 'M12 10.2 13.8 12 12 13.8 10.2 12Z' },
  dot: { d: 'M12 9.4 14.6 12 12 14.6 9.4 12Z', w: 1.1 },
};

/** POI type -> glyph key. Every one of the twelve types has its own mark. */
export const POI_GLYPH = {
  town: 'town', outpost: 'outpost', reststop: 'reststop', parking: 'parking',
  haven: 'haven', dungeon: 'dungeon', menace: 'menace', tomb: 'tomb',
  imperial: 'imperial', chocobo: 'chocobo', fishing: 'fishing', landmark: 'landmark',
};

const _p2d = new Map();
function path2d(key: string, d: string) {
  let p = _p2d.get(key);
  if (!p) { p = new Path2D(d); _p2d.set(key, p); }
  return p;
}

/**
 * Draw a glyph centred on (x, y).
 *
 * `r` is the half-height in canvas px — the glyph fills a 2r box — and
 * `weight` is the stroke width in canvas px, held constant however the glyph
 * is scaled, which is what keeps the whole set at one visual density.
 *
 * @param kind key of {@link GLYPH}
 * @param x @param y @param r
 */
export function drawGlyph(c: CanvasRenderingContext2D, kind: string, x: number, y: number, r: number, colour: string, opt: {alpha?:number, weight?:number, halo?:number} = {}) {
  const g = GLYPH[kind as keyof typeof GLYPH] || GLYPH.dot;
  const alpha = opt.alpha == null ? 1 : opt.alpha;
  if (alpha <= 0.004) return;
  const weight = opt.weight || 1.25;
  const s = r / 11;
  c.save();
  c.translate(x, y);
  c.scale(s, s);
  c.globalAlpha = alpha;
  c.lineJoin = 'round';
  c.lineCap = 'round';
  c.translate(-12, -12);

  // dark halo first, as a fatter under-stroke: cheaper and crisper than a
  // canvas shadow, and it does not bleed into neighbouring glyphs
  const p = path2d(kind, g.d);
  if (opt.halo !== 0) {
    c.strokeStyle = `rgba(4,8,14,${opt.halo == null ? 0.72 : opt.halo})`;
    c.lineWidth = (weight + 1.7) / s;
    c.setLineDash([]);
    c.stroke(p);
  }
  c.strokeStyle = colour;
  c.fillStyle = colour;
  c.lineWidth = weight / s;
  if (g.dash) c.setLineDash(g.dash.map((v: any) => v));
  c.stroke(p);
  c.setLineDash([]);
  if (g.fill) c.fill(path2d(`${kind}:f`, g.fill));
  c.restore();
}

/**
 * The same glyph as an inline SVG, for the filter rail and the legend.
 * @param kind @param [opt]
 */
export function glyphSvg(kind: string, opt: {size?:number, stroke?:number} = {}): SVGElement {
  const g = GLYPH[kind as keyof typeof GLYPH] || GLYPH.dot;
  const { size = 16, stroke = 1.15 } = opt;
  const root = svgEl('svg', {
    class: 'mapglyph', viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': 'true',
  });
  root.appendChild(svgEl('path', {
    d: g.d, fill: 'none', stroke: 'currentColor', 'stroke-width': stroke,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    'stroke-dasharray': g.dash ? g.dash.join(' ') : null,
  }));
  if (g.fill) root.appendChild(svgEl('path', { d: g.fill, fill: 'currentColor', stroke: 'none' }));
  return root;
}

/** Minimal namespaced element helper — this module must not depend on the UI. */
function svgEl(tag: string, attrs: any) {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const k of Object.keys(attrs)) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
  return n;
}
