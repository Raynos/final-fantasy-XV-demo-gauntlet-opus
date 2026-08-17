import { el, svg, clamp, rng, easeOut, easeOutQuint } from '../UIKit.js';
import { REGIONS, MAP_PINS, readMarkers, worldToChart } from '../GameData.js';

const W = 1600, H = 900;
const PIN_COL = { quest: '#e8cf98', hunt: '#e0644a', haven: '#b6d6f8', deposit: '#a68fd0' };
const PIN_LABEL = { quest: 'Quest', hunt: 'Hunt', haven: 'Haven', deposit: 'Elemental Deposit' };
/** Marker slots reserved on the chart; the rest of the list is dropped. */
const MAX_PINS = 14;

/** Closed blobby coastline from a seeded radial noise walk. */
function blob(cx, cy, rx, ry, seed, wob = 0.22, pts = 30) {
  const r = rng(seed);
  const amp = [];
  for (let i = 0; i < 5; i++) amp.push((r() - 0.5) * wob);
  const out = [];
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    let k = 1;
    for (let h = 0; h < amp.length; h++) k += amp[h] * Math.sin(a * (h + 2) + amp[h] * 9);
    out.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  let d = `M${out[0][0].toFixed(1)} ${out[0][1].toFixed(1)}`;
  for (let i = 0; i < out.length; i++) {
    const p0 = out[i], p1 = out[(i + 1) % out.length];
    const mx = (p0[0] + p1[0]) / 2, my = (p0[1] + p1[1]) / 2;
    d += ` Q${p0[0].toFixed(1)} ${p0[1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  return `${d}Z`;
}

/** World map: a stylised chart of Lucis with contours, roads and quest pins. */
export class MapScreen {
  /** @param {import('../Menus.js').Menus} menus */
  constructor(menus) {
    this.menus = menus;
    this.title = 'Map';
    this.sub = 'Lucis  ·  scale 1 : 240 000';
    this.i = 0;
  }

  /** @param {HTMLElement} root */
  build(root) {
    this.wrap = el('div.mapwrap');
    this.svg = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });
    this.wrap.appendChild(this.svg);
    root.appendChild(this.wrap);

    const defs = svg('defs', {}, [
      svg('radialGradient', { id: 'mapGlow', cx: '48%', cy: '46%', r: '56%' }, [
        svg('stop', { offset: 0, 'stop-color': 'rgba(88,140,200,.16)' }),
        svg('stop', { offset: 1, 'stop-color': 'rgba(8,14,24,0)' }),
      ]),
      svg('linearGradient', { id: 'mapLand', x1: 0, y1: 0, x2: 0, y2: 1 }, [
        svg('stop', { offset: 0, 'stop-color': 'rgba(126,166,214,.16)' }),
        svg('stop', { offset: 1, 'stop-color': 'rgba(58,92,138,.07)' }),
      ]),
    ]);
    this.svg.appendChild(defs);
    this.svg.appendChild(svg('rect', { width: W, height: H, fill: 'url(#mapGlow)' }));

    // graticule
    const grid = svg('g', { opacity: 0.5 });
    for (let x = 120; x < W; x += 96) grid.appendChild(svg('line', { x1: x, y1: 90, x2: x, y2: H - 120, stroke: 'rgba(160,196,240,.055)', 'stroke-width': 1 }));
    for (let y = 120; y < H - 100; y += 96) grid.appendChild(svg('line', { x1: 110, y1: y, x2: W - 110, y2: y, stroke: 'rgba(160,196,240,.055)', 'stroke-width': 1 }));
    this.svg.appendChild(grid);
    this.grid = grid;

    // landmass + contour rings
    this.landG = svg('g');
    const land = blob(760, 440, 430, 268, 4242, 0.20, 34);
    this.landG.appendChild(svg('path', { d: land, fill: 'url(#mapLand)', stroke: 'rgba(190,222,255,.42)', 'stroke-width': 1.4 }));
    for (let i = 1; i <= 4; i++) {
      this.landG.appendChild(svg('path', {
        d: blob(760 + i * 6, 440 - i * 10, 430 - i * 62, 268 - i * 42, 4242 + i * 17, 0.24, 30),
        fill: 'none', stroke: `rgba(178,214,252,${(0.20 - i * 0.03).toFixed(3)})`, 'stroke-width': 1,
      }));
    }
    // a couple of offshore islands
    this.landG.appendChild(svg('path', { d: blob(1258, 690, 62, 34, 991, 0.3, 18), fill: 'url(#mapLand)', stroke: 'rgba(190,222,255,.30)', 'stroke-width': 1 }));
    this.landG.appendChild(svg('path', { d: blob(348, 712, 44, 26, 771, 0.34, 16), fill: 'url(#mapLand)', stroke: 'rgba(190,222,255,.30)', 'stroke-width': 1 }));
    this.svg.appendChild(this.landG);

    // road network
    this.roads = svg('g');
    const rd = [
      'M424 596 Q548 546 640 494 T872 396 Q968 356 1060 336',
      'M640 494 Q690 408 762 356 T884 296',
      'M872 396 Q898 472 962 516 T1058 552',
      'M548 546 Q516 462 476 414',
      'M600 660 Q636 596 640 494',
    ];
    for (const d of rd) {
      this.roads.appendChild(svg('path', { d, fill: 'none', stroke: 'rgba(226,240,255,.20)', 'stroke-width': 4, 'stroke-linecap': 'round' }));
      this.roads.appendChild(svg('path', { d, fill: 'none', stroke: 'rgba(232,244,255,.62)', 'stroke-width': 1.1, 'stroke-dasharray': '9 7' }));
    }
    this.svg.appendChild(this.roads);

    // region names
    this.regionG = svg('g');
    this.regionEls = REGIONS.map((r2) => {
      const g = svg('g');
      g.appendChild(svg('text', {
        x: (r2.x * W).toFixed(0), y: (r2.y * H).toFixed(0), 'text-anchor': 'middle',
        fill: 'rgba(232,244,255,.52)', 'font-size': 19, 'font-weight': 200,
        'letter-spacing': 8.5, 'font-family': 'inherit',
      }, [r2.name.toUpperCase()]));
      g.appendChild(svg('text', {
        x: (r2.x * W).toFixed(0), y: (r2.y * H + 20).toFixed(0), 'text-anchor': 'middle',
        fill: 'rgba(190,214,246,.30)', 'font-size': 9, 'letter-spacing': 4.2, 'font-family': 'inherit',
      }, [r2.sub.toUpperCase()]));
      this.regionG.appendChild(g);
      return g;
    });
    this.svg.appendChild(this.regionG);

    // Pins — a fixed pool, reassigned each frame from the live marker list so
    // waypoints can appear and vanish without touching the DOM.
    this.pinG = svg('g');
    this.pinEls = [];
    for (let i = 0; i < MAX_PINS; i++) {
      const g = svg('g', { opacity: 0 });
      const ring = svg('circle', { r: 15, fill: 'none', stroke: '#b6d6f8', 'stroke-width': 1, opacity: 0.30 });
      const head = svg('path', { d: 'M0 -7 5.4 0 0 7 -5.4 0Z', fill: '#b6d6f8', opacity: 0.95 });
      const label = svg('text', {
        x: 22, y: 4, fill: 'rgba(224,238,255,.78)', 'font-size': 10,
        'letter-spacing': 2.2, 'font-family': 'inherit',
        stroke: 'rgba(5,9,16,.85)', 'stroke-width': 2.6, 'paint-order': 'stroke fill',
      }, ['']);
      g.appendChild(ring); g.appendChild(head); g.appendChild(label);
      this.pinG.appendChild(g);
      this.pinEls.push({ g, ring, head, label, key: '' });
    }
    this.svg.appendChild(this.pinG);
    this.pins = [];

    // player marker
    this.player = svg('g', { transform: 'translate(596 508) rotate(38)' });
    this.player.appendChild(svg('path', { d: 'M0 -34 A34 34 0 0 1 21 -26 L0 0Z', fill: 'rgba(180,220,255,.13)' }));
    this.player.appendChild(svg('path', { d: 'M0 -8.5 6 6 0 2.4 -6 6Z', fill: '#f2f8ff', stroke: 'rgba(8,14,24,.85)', 'stroke-width': 1.2, 'stroke-linejoin': 'round' }));
    this.playerRing = svg('circle', { r: 13, fill: 'none', stroke: 'rgba(226,242,255,.7)', 'stroke-width': 1.1 });
    this.player.appendChild(this.playerRing);
    this.svg.appendChild(this.player);

    // scale bar
    const sc = svg('g', { transform: `translate(${W - 300} ${H - 130})` });
    sc.appendChild(svg('line', { x1: 0, y1: 0, x2: 160, y2: 0, stroke: 'rgba(216,234,255,.6)', 'stroke-width': 1 }));
    sc.appendChild(svg('line', { x1: 0, y1: -5, x2: 0, y2: 5, stroke: 'rgba(216,234,255,.6)', 'stroke-width': 1 }));
    sc.appendChild(svg('line', { x1: 160, y1: -5, x2: 160, y2: 5, stroke: 'rgba(216,234,255,.6)', 'stroke-width': 1 }));
    sc.appendChild(svg('text', { x: 80, y: -11, 'text-anchor': 'middle', fill: 'rgba(200,222,250,.6)', 'font-size': 9, 'letter-spacing': 3, 'font-family': 'inherit' }, ['5 KM']));
    this.svg.appendChild(sc);
    this.scale = sc;

    this.legend = el('div.map-legend', {}, Object.keys(PIN_COL).map((k) => el('div.lg', {}, [
      el('div.sw', { style: `width:9px;height:9px;transform:rotate(45deg);background:${PIN_COL[k]}` }),
      PIN_LABEL[k],
    ])));
    root.appendChild(this.legend);
  }

  nav(dx, dy) {
    const n = this.pins.length || 1;
    if (dx || dy) this.i = (this.i + (dy || dx) + n) % n;
  }

  /**
   * The markers to draw: live quest waypoints, discovered havens and elemental
   * deposits, projected from real world XZ. Falls back to the chart literals
   * only when no RPG system is registered.
   * @param {object} game
   */
  _markers(game) {
    const live = readMarkers(game);
    if (live && live.length) {
      const rank = { quest: 0, hunt: 1, haven: 2, deposit: 3 };
      const sorted = live.slice().sort((a, b) =>
        (b.tracked ? 1 : 0) - (a.tracked ? 1 : 0) || (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9));
      return sorted.slice(0, MAX_PINS).map((m) => {
        const c = worldToChart(m.x, m.z);
        return { kind: m.kind, name: m.name, x: c.x, y: c.y, tracked: !!m.tracked };
      });
    }
    return MAP_PINS.slice(0, MAX_PINS).map((p) => ({ kind: p.kind, name: p.name, x: p.x * W, y: p.y * H }));
  }

  /** @param {number} dt @param {object} game @param {number} a */
  update(dt, game, a) {
    const t = game.time.now;
    const rev = easeOutQuint(clamp((a - 0.05) / 0.85, 0, 1));
    this.grid.setAttribute('opacity', (rev * 0.5).toFixed(3));
    this.landG.setAttribute('opacity', rev.toFixed(3));
    this.roads.setAttribute('opacity', easeOut(clamp((rev - 0.2) / 0.6, 0, 1)).toFixed(3));
    this.scale.setAttribute('opacity', easeOut(clamp((rev - 0.4) / 0.5, 0, 1)).toFixed(3));
    const zoom = 0.965 + 0.035 * rev;
    this.svg.style.transform = `scale(${zoom.toFixed(4)})`;

    for (let i = 0; i < this.regionEls.length; i++) {
      this.regionEls[i].setAttribute('opacity', easeOut(clamp((rev - 0.24 - i * 0.06) / 0.5, 0, 1)).toFixed(3));
    }
    this.pins = this._markers(game);
    if (this.i >= this.pins.length) this.i = 0;
    for (let i = 0; i < this.pinEls.length; i++) {
      const pe = this.pinEls[i];
      const p = this.pins[i];
      if (!p) { if (pe._vis !== false) { pe.g.setAttribute('opacity', 0); pe._vis = false; } continue; }
      pe._vis = true;
      const key = `${p.kind}|${p.name}|${p.x > 800 ? 'l' : 'r'}`;
      if (pe.key !== key) {
        const col = PIN_COL[p.kind] || '#b6d6f8';
        pe.ring.setAttribute('stroke', col);
        pe.head.setAttribute('fill', col);
        // Deposits are legible from their colour alone; labelling all ten of
        // them turns the chart into a wall of text.
        pe.label.textContent = p.kind === 'deposit' ? '' : p.name.toUpperCase();
        // label on the side that points away from the middle of the chart
        const left = p.x > 800;
        pe.label.setAttribute('x', left ? -22 : 22);
        pe.label.setAttribute('text-anchor', left ? 'end' : 'start');
        pe.key = key;
      }
      const s = easeOut(clamp((rev - 0.34 - i * 0.035) / 0.45, 0, 1));
      const on = i === this.i;
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.6 + i);
      pe.g.setAttribute('opacity', (s * (on ? 1 : p.tracked ? 0.9 : 0.66)).toFixed(3));
      pe.g.setAttribute('transform',
        `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) scale(${(s * (on ? 1.22 : 1)).toFixed(3)})`);
      pe.ring.setAttribute('r', (on ? 15 + 7 * pulse : 15).toFixed(1));
      pe.ring.setAttribute('opacity', (on ? 0.30 + 0.4 * (1 - pulse) : 0.22).toFixed(3));
    }

    // the player marker sits at the party's real position, facing the camera
    const pp = game.get?.('Player')?.position;
    if (pp) {
      const c = worldToChart(pp.x, pp.z);
      const cam = game.camera;
      let yaw = 0;
      if (cam) {
        const m = cam.matrixWorld.elements;
        yaw = Math.atan2(-m[8], -m[10]) * 180 / Math.PI;
      }
      this.player.setAttribute('transform', `translate(${c.x.toFixed(1)} ${c.y.toFixed(1)}) rotate(${(180 - yaw).toFixed(1)})`);
    }
    const pr = 12 + 6 * (0.5 + 0.5 * Math.sin(t * 2.2));
    this.playerRing.setAttribute('r', pr.toFixed(1));
    this.playerRing.setAttribute('opacity', (0.8 - (pr - 12) / 12).toFixed(3));
    this.player.setAttribute('opacity', easeOut(clamp((rev - 0.45) / 0.4, 0, 1)).toFixed(3));
    this.legend.style.opacity = easeOut(clamp((a - 0.35) / 0.5, 0, 1)).toFixed(3);
  }
}
