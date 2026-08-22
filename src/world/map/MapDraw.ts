import { worldMap, WORLD, ZONES } from './WorldMap.ts';

/**
 * VECTOR FURNITURE — everything on the chart that is *not* the baked relief.
 *
 * Roads, zone borders, letterspaced type and label collision live here so the
 * minimap and the world-map screen draw them the same way at different zooms.
 *
 * Roads are drawn live rather than baked because a baked road scales with the
 * chart: a 3 px highway becomes a 12 px white band under minimap magnification
 * and vanishes when the whole continent is on screen. Drawn in screen space, a
 * highway is a highway at every zoom, which is the entire point of a map.
 */

/**
 * Road hierarchy. `w` is the running-surface width and `casing` the dark
 * under-stroke that lifts the road off the terrain; both are multiplied by the
 * caller's scale and clamped so a track never out-weighs a highway.
 */
export const ROAD_STYLE = {
  highway: { rank: 3, w: 2.5, min: 1.5, max: 7.0, col: [242, 248, 255], a: 0.92, casing: 2.6, casingA: 0.66 },
  road: { rank: 2, w: 1.7, min: 1.1, max: 4.6, col: [226, 240, 255], a: 0.76, casing: 2.2, casingA: 0.56 },
  track: { rank: 1, w: 1.15, min: 0.8, max: 2.8, col: [214, 230, 250], a: 0.56, casing: 1.7, casingA: 0.42, dash: [5, 4.5] },
  trail: { rank: 0, w: 0.85, min: 0.6, max: 1.8, col: [200, 220, 246], a: 0.34, casing: 0, casingA: 0, dash: [2, 4] },
};

const ORDER = ['trail', 'track', 'road', 'highway'];

/**
 * The class id of a route. `RoadGraph` replaces the class *name* on a route
 * record with the class *definition*, so anything reading it has to cope with
 * both — one letter of difference that silently drew every highway in Lucis as
 * a dirt track.
 */
export function routeClass(route: {cls:string|{id:string}}): string {
  return typeof route.cls === 'string' ? route.cls : (route.cls && route.cls.id) || 'track';
}

/** Cached decimated route geometry, one entry per level of detail. */
let _lods: any = null;

function lods() {
  if (_lods) return _lods;
  _lods = [];
  for (const stride of [1, 3, 8]) {
    const byCls: Record<string, { pts: Float32Array, n: number, route: any }[]> = { highway: [], road: [], track: [], trail: [] };
    for (const r of worldMap.roadGraph.routes) {
      const src = r.pts;
      const out = new Float32Array(Math.ceil(src.length / stride) * 2 + 2);
      let n = 0;
      for (let i = 0; i < src.length; i += stride) { out[n++] = src[i].x; out[n++] = src[i].z; }
      const last = src[src.length - 1];
      if (out[n - 2] !== last.x || out[n - 1] !== last.z) { out[n++] = last.x; out[n++] = last.z; }
      (byCls[routeClass(r)] || byCls.track).push({ pts: out, n, route: r });
    }
    _lods.push(byCls);
  }
  return _lods;
}

/**
 * Stroke the whole road network in screen space, casings first so junctions
 * between two roads of the same class merge into one clean joint.
 *
 * @param sx world x -> canvas x
 * @param sy world z -> canvas y
 */
export function drawRoads(c: CanvasRenderingContext2D, sx: ((a0: number) => number), sy: ((a0: number) => number), opt: any = {}) {
  const scale = opt.scale || 1;
  const alpha = opt.alpha == null ? 1 : opt.alpha;
  const b = opt.bounds;
  const set = lods()[opt.lod || 0];
  c.save();
  c.lineCap = 'round';
  c.lineJoin = 'round';

  for (let pass = 0; pass < 2; pass++) {
    for (const cls of ORDER) {
      const st = ROAD_STYLE[cls as keyof typeof ROAD_STYLE];
      if (pass === 0 && !st.casing) continue;
      const w = Math.min(st.max, Math.max(st.min, st.w * scale));
      // One path per class per pass: overlapping strokes then composite once,
      // so a translucent highway has no bright seam where two edges meet.
      c.beginPath();
      let any = false;
      for (const r of set[cls]) {
        const p = r.pts;
        let pen = false;
        for (let i = 0; i < r.n; i += 2) {
          const x = p[i], z = p[i + 1];
          if (b && (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1)) {
            // one point past the edge keeps the stroke running off screen
            if (pen) { c.lineTo(sx(x), sy(z)); pen = false; }
            continue;
          }
          if (!pen) { c.moveTo(sx(x), sy(z)); pen = true; any = true; } else c.lineTo(sx(x), sy(z));
        }
      }
      if (!any) continue;
      if (pass === 0) {
        c.strokeStyle = `rgba(6,11,19,${(st.casingA * alpha).toFixed(3)})`;
        c.lineWidth = w + st.casing * Math.min(1.6, Math.max(0.7, scale));
        c.setLineDash([]);
      } else {
        c.strokeStyle = `rgba(${st.col[0]},${st.col[1]},${st.col[2]},${(st.a * alpha).toFixed(3)})`;
        c.lineWidth = w;
        c.setLineDash(st.dash ? st.dash.map((v: any) => v * Math.min(2.2, Math.max(0.6, scale))) : []);
      }
      c.stroke();
    }
  }
  c.setLineDash([]);
  c.restore();
}

/**
 * Junction pips — a small tick where two named routes meet, which is what
 * makes a road network read as a network rather than as crossing lines.
 */
export function drawJunctions(c: any, sx: any, sy: any, scale: any, alpha: any) {
  const g = worldMap.roadGraph;
  c.save();
  c.globalAlpha = alpha;
  c.fillStyle = 'rgba(232,242,255,0.68)';
  for (const nd of g.nodes.values()) {
    if (nd.edges.length < 3) continue;
    c.beginPath();
    c.arc(sx(nd.x), sy(nd.z), 1.5 * scale, 0, Math.PI * 2);
    c.fill();
  }
  c.restore();
}

// ------------------------------------------------------------ zone borders

let _borders: any = null;

/**
 * Trace the boundary between zones of influence.
 *
 * Zones are overlapping elliptical fields, not polygons, so the border is
 * wherever the dominant zone changes. Sampling that on a lattice and joining
 * the dual-grid edges gives a closed polyline per border, which two rounds of
 * Chaikin smoothing turn from a staircase into a hand-inked line.
 *
 * @returns polylines as flat x,z pairs
 */
export function zoneBorders(): Array<Float32Array> {
  if (_borders) return _borders;
  const step = 48;
  const n = Math.ceil(WORLD.size / step);
  const ids = new Int8Array(n * n);

  // flattened zone table so the inner loop has no property lookups
  const nz = ZONES.length;
  const zc = new Float64Array(nz * 5);
  for (let i = 0; i < nz; i++) {
    const z = ZONES[i], o = i * 5;
    zc[o] = z.cx; zc[o + 1] = z.cz;
    zc[o + 2] = Math.cos(z.rot); zc[o + 3] = Math.sin(z.rot);
    zc[o + 4] = z.priority;
  }
  const rx = new Float64Array(nz), rz = new Float64Array(nz);
  for (let i = 0; i < nz; i++) { rx[i] = 1 / ZONES[i].rx; rz[i] = 1 / ZONES[i].rz; }

  for (let j = 0; j < n; j++) {
    const z = -WORLD.half + (j + 0.5) * step;
    for (let i = 0; i < n; i++) {
      const x = -WORLD.half + (i + 0.5) * step;
      let best = -1, bw = 0.02;
      for (let k = 0; k < nz; k++) {
        const o = k * 5;
        const dx = x - zc[o], dz = z - zc[o + 1];
        const u = (dx * zc[o + 2] + dz * zc[o + 3]) * rx[k];
        const v = (-dx * zc[o + 3] + dz * zc[o + 2]) * rz[k];
        const d2 = u * u + v * v;
        if (d2 > 3.6) continue;
        const w = zc[o + 4] * Math.exp(-d2 * 1.55);
        if (w > bw) { bw = w; best = k; }
      }
      ids[j * n + i] = best;
    }
  }

  // dual-grid segments between differing cells
  const segs: any[] = [];
  const key = (a: any, b: any) => a * 4096 + b;
  const at = new Map();
  const push = (ax: any, ay: any, bx: any, by: any) => {
    const idx = segs.length;
    segs.push([ax, ay, bx, by, false]);
    for (const k of [key(ax, ay), key(bx, by)]) {
      let l = at.get(k);
      if (!l) { l = []; at.set(k, l); }
      l.push(idx);
    }
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = ids[j * n + i];
      if (i < n - 1 && ids[j * n + i + 1] !== a) push(i + 1, j, i + 1, j + 1);
      if (j < n - 1 && ids[(j + 1) * n + i] !== a) push(i, j + 1, i + 1, j + 1);
    }
  }

  // walk chains of segments into polylines
  const out = [];
  const toWorld = (a: any) => -WORLD.half + a * step;
  for (let s = 0; s < segs.length; s++) {
    if (segs[s][4]) continue;
    const chain = [[segs[s][0], segs[s][1]], [segs[s][2], segs[s][3]]];
    segs[s][4] = true;
    for (let dir = 0; dir < 2; dir++) {
      for (;;) {
        const end = dir ? chain[0] : chain[chain.length - 1];
        const list = at.get(key(end[0], end[1])) || [];
        let next = -1;
        for (const idx of list) if (!segs[idx][4]) { next = idx; break; }
        if (next < 0) break;
        const sg = segs[next];
        sg[4] = true;
        const other = (sg[0] === end[0] && sg[1] === end[1]) ? [sg[2], sg[3]] : [sg[0], sg[1]];
        if (dir) chain.unshift(other); else chain.push(other);
      }
    }
    if (chain.length < 4) continue;
    let pts = chain.map((p) => [toWorld(p[0]), toWorld(p[1])]);
    pts = chaikin(chaikin(pts));
    const flat = new Float32Array(pts.length * 2);
    for (let i = 0; i < pts.length; i++) { flat[i * 2] = pts[i][0]; flat[i * 2 + 1] = pts[i][1]; }
    out.push(flat);
  }
  _borders = out;
  return out;
}

function chaikin(p: any) {
  const out = [p[0]];
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i], b = p[i + 1];
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
    out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
  }
  out.push(p[p.length - 1]);
  return out;
}

/**
 * Stroke the zone borders as a fine broken hairline, the way an atlas draws an
 * administrative boundary.
 */
export function drawZoneBorders(c: any, sx: any, sy: any, opt: any = {}) {
  const alpha = opt.alpha == null ? 1 : opt.alpha;
  if (alpha <= 0.004) return;
  const scale = opt.scale || 1;
  c.save();
  c.lineCap = 'butt';
  c.lineJoin = 'round';
  c.beginPath();
  for (const p of zoneBorders()) {
    c.moveTo(sx(p[0]), sy(p[1]));
    for (let i = 2; i < p.length; i += 2) c.lineTo(sx(p[i]), sy(p[i + 1]));
  }
  // A dotted hairline, not a dashed one: a dashed border at this weight reads
  // as another road, and the chart already has enough roads.
  c.setLineDash([1.6 * scale, 5.4 * scale]);
  c.lineWidth = 2.6 * scale;
  c.strokeStyle = `rgba(8,13,22,${(0.26 * alpha).toFixed(3)})`;
  c.stroke();
  c.lineWidth = 1.1 * scale;
  c.strokeStyle = `rgba(214,230,252,${(0.34 * alpha).toFixed(3)})`;
  c.stroke();
  c.setLineDash([]);
  c.restore();
}

// -------------------------------------------------------------------- type

/**
 * Draw letterspaced text — canvas has no tracking, so every glyph is placed by
 * hand. Returns the total advance so the caller can reserve the space.
 * @param text @param x @param y
 * @param spacing extra px between letters
 * @returns width of the run
 */
export function spacedText(c: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number, align: 'center' | 'left' = 'center'): number {
  let total = 0;
  for (const ch of text) total += c.measureText(ch).width + spacing;
  total -= spacing;
  let px = align === 'center' ? x - total / 2 : x;
  const prev = c.textAlign;
  c.textAlign = 'left';
  for (const ch of text) {
    c.fillText(ch, px, y);
    px += c.measureText(ch).width + spacing;
  }
  c.textAlign = prev;
  return total;
}

/** Width a `spacedText` run would take. */
export function spacedWidth(c: any, text: any, spacing: any) {
  let total = 0;
  for (const ch of text) total += c.measureText(ch).width + spacing;
  return total - spacing;
}

/**
 * Greedy label collision, highest priority first — the same rule a printed
 * atlas uses: a label that cannot be placed clear of its betters is dropped
 * rather than allowed to overlap.
 */
export class LabelPlacer {
  pad!: any;
  rects!: any[];
  constructor(pad = 3) { this.rects = []; this.pad = pad; }
  clear() { this.rects.length = 0; }
  /** @returns true if the box was free, in which case it is reserved */
  place(x0: any, y0: any, x1: any, y1: any): boolean {
    const p = this.pad;
    for (const r of this.rects) {
      if (x0 - p < r[2] && x1 + p > r[0] && y0 - p < r[3] && y1 + p > r[1]) return false;
    }
    this.rects.push([x0, y0, x1, y1]);
    return true;
  }
  /** Reserve a box without testing it (for marks that must always show). */
  reserve(x0: any, y0: any, x1: any, y1: any) { this.rects.push([x0, y0, x1, y1]); }
}
