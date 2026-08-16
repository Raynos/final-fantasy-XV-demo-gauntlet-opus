import { el, svg, clamp, rng, easeOut, easeOutQuint } from '../UIKit.js';

const W = 1600, H = 900;
const HUB = { x: 848, y: 438 };
// keep every label inside this box so nothing collides with the chrome
const SAFE = { x0: 210, x1: 1410, y0: 132, y1: 700 };

const CLUSTERS = [
  { name: 'Armiger', hue: 205, ang: -95, names: ['Point-Warp Range', 'Armiger Chain', 'Royal Arms Mastery', 'Warp Recovery', 'Phantom Sword', 'Sovereign Soul', 'Kings\' Favour', 'Blade Storm'] },
  { name: 'Combat', hue: 24, ang: -32, names: ['Airstep', 'Parry Window', 'Blindside Bonus', 'Chain Finisher', 'Counterstance', 'Aerial Reach', 'Hard Edge', 'Riposte'] },
  { name: 'Teamwork', hue: 152, ang: 34, names: ['Link-Strike', 'Tech Bar +1', 'Cross Chain', 'Ally Rally', 'Gladio: Tempest', 'Ignis: Enhance', 'Prompto: Starshell', 'Shared Resolve'] },
  { name: 'Recovery', hue: 108, ang: 104, names: ['Health Regen', 'Item Range', 'Downed Grace', 'Camp Feast', 'Second Wind', 'Vitality', 'Rescue Reach', 'Restoration'] },
  { name: 'Magic', hue: 268, ang: 168, names: ['Elemancy Draw', 'Spellcraft Slots', 'Ruinous Blast', 'Freeze Duration', 'Thunder Chain', 'Flask Capacity', 'Magic Affinity', 'Catalyst Lore'] },
  { name: 'Wanderlust', hue: 44, ang: -158, names: ['Photo Framing', 'Gil Bonus', 'Fishing Line', 'Chocobo Bond', 'Treasure Sense', 'Regalia Tune-up', 'Survival Lore', 'Cartography'] },
];

const DESCS = [
  'Extends the reach of a point-warp, letting Noctis anchor to distant vantages mid-fight.',
  'Adds a further blade to the armiger rotation, lengthening the chain before the gauge empties.',
  'Sharpens the timing window on a parry; a clean read opens the enemy for a link-strike.',
  'The retinue closes in faster after a stagger, converting knock-downs into chained finishers.',
  'Draws more raw elemancy from a deposit, deepening every flask crafted at camp.',
  'Prompto keeps the camera ready — better framing, and the party notices the view.',
];

/**
 * The Ascension grid: a constellation node-graph of unlockable abilities.
 * Everything is generated procedurally from a fixed seed, so the layout is
 * identical on every run.
 */
export class AscensionScreen {
  /** @param {import('../Menus.js').Menus} menus */
  constructor(menus) {
    this.menus = menus;
    this.title = 'Ascension';
    this.sub = 'The Astral constellations of the Lucian line';
    this.ap = 148;
  }

  /** @param {HTMLElement} root */
  build(root) {
    this.wrap = el('div.asc');
    this.svg = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });
    this.wrap.appendChild(this.svg);
    root.appendChild(this.wrap);

    this._defs();
    this._graph();
    this._draw();
    this._chrome(root);
    this.sel = this.nodes.findIndex((n) => n.state === 'open');
    if (this.sel < 0) this.sel = 1;
  }

  _defs() {
    const defs = svg('defs');
    const g1 = svg('radialGradient', { id: 'ascNeb', cx: '50%', cy: '48%', r: '58%' }, [
      svg('stop', { offset: 0, 'stop-color': 'rgba(96,150,214,.20)' }),
      svg('stop', { offset: 0.55, 'stop-color': 'rgba(52,86,140,.07)' }),
      svg('stop', { offset: 1, 'stop-color': 'rgba(10,16,28,0)' }),
    ]);
    const g2 = svg('radialGradient', { id: 'ascNode', cx: '38%', cy: '32%', r: '72%' }, [
      svg('stop', { offset: 0, 'stop-color': '#ffffff' }),
      svg('stop', { offset: 0.5, 'stop-color': '#cfe4ff' }),
      svg('stop', { offset: 1, 'stop-color': '#5d8cc4' }),
    ]);
    const blur = svg('filter', { id: 'ascGlow', x: '-140%', y: '-140%', width: '380%', height: '380%' }, [
      svg('feGaussianBlur', { stdDeviation: 5, result: 'b' }),
      svg('feMerge', {}, [svg('feMergeNode', { in: 'b' }), svg('feMergeNode', { in: 'SourceGraphic' })]),
    ]);
    defs.appendChild(g1); defs.appendChild(g2); defs.appendChild(blur);
    this.svg.appendChild(defs);
    this.svg.appendChild(svg('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#ascNeb)' }));
  }

  /** Deterministic constellation layout. */
  _graph() {
    const r = rng(0x5f3a19);
    this.nodes = [];
    this.edges = [];
    const hub = { x: HUB.x, y: HUB.y, tier: 0, cluster: -1, state: 'hub', name: 'The Crystal', ap: 0 };
    this.nodes.push(hub);

    CLUSTERS.forEach((c, ci) => {
      const base = (c.ang * Math.PI) / 180;
      const roots = [];
      // three tiers of nodes marching outward with a little branching
      let prevRing = [0];
      for (let tier = 1; tier <= 4; tier++) {
        const count = tier === 1 ? 1 : tier === 2 ? 2 : tier === 3 ? 3 : 2;
        const ring = [];
        const rad = 118 + tier * 76 + (r() - 0.5) * 20;
        for (let k = 0; k < count; k++) {
          const spread = (tier - 1) * 0.14;
          const a = base + (k - (count - 1) / 2) * spread + (r() - 0.5) * 0.06;
          const x = HUB.x + Math.cos(a) * rad * 1.34;
          const y = HUB.y + Math.sin(a) * rad * 0.74;
          const idx = this.nodes.length;
          const nameList = c.names;
          const state = tier === 1 ? 'done' : tier === 2 ? (k === 0 ? 'done' : 'open') : tier === 3 ? (k === 1 ? 'open' : 'locked') : 'locked';
          this.nodes.push({
            x, y, tier, cluster: ci, state,
            major: tier === 1 || (tier === 4 && k === 0),
            name: nameList[(tier - 1) * 2 + k] || nameList[k % nameList.length],
            ap: [0, 12, 28, 55, 99][tier],
            desc: DESCS[(ci + tier + k) % DESCS.length],
            dist: Math.hypot(x - HUB.x, y - HUB.y),
          });
          const parent = prevRing[Math.min(k, prevRing.length - 1)];
          this.edges.push({ a: parent, b: idx });
          ring.push(idx);
          if (tier === 1) roots.push(idx);
        }
        // occasional lateral link inside a ring for a woven look
        if (ring.length > 1 && r() > 0.45) this.edges.push({ a: ring[0], b: ring[1], weak: true });
        prevRing = ring;
      }
      c.rootIdx = roots[0];
      c.tipIdx = prevRing[0];
    });

    for (const e2 of this.edges) {
      const a = this.nodes[e2.a], b = this.nodes[e2.b];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const bow = e2.weak ? 0.16 : 0.075;
      e2.cx = mx - dy * bow; e2.cy = my + dx * bow;
      e2.len = len * 1.05;
      e2.lit = a.state !== 'locked' && b.state !== 'locked';
    }
  }

  _draw() {
    // starfield dust
    const stars = svg('g', { opacity: 0.55 });
    const r = rng(77713);
    for (let i = 0; i < 130; i++) {
      const x = r() * W, y = r() * H;
      const d = Math.hypot(x - HUB.x, y - HUB.y) / 700;
      stars.appendChild(svg('circle', {
        cx: x.toFixed(1), cy: y.toFixed(1), r: (0.5 + r() * 1.1).toFixed(2),
        fill: '#cfe2fb', opacity: (0.10 + r() * 0.42 * clamp(1.2 - d, 0.2, 1)).toFixed(3),
      }));
    }
    this.svg.appendChild(stars);

    this.edgeG = svg('g');
    this.svg.appendChild(this.edgeG);
    this.edgeEls = this.edges.map((e2) => {
      const p = svg('path', {
        d: `M${e2.a === 0 ? HUB.x : this.nodes[e2.a].x} ${this.nodes[e2.a].y} Q${e2.cx.toFixed(1)} ${e2.cy.toFixed(1)} ${this.nodes[e2.b].x.toFixed(1)} ${this.nodes[e2.b].y.toFixed(1)}`,
        fill: 'none',
        stroke: e2.lit ? 'rgba(168,208,252,.55)' : 'rgba(150,178,214,.16)',
        'stroke-width': e2.lit ? 1.3 : 1,
        'stroke-dasharray': e2.len.toFixed(1),
        'stroke-dashoffset': e2.len.toFixed(1),
      });
      this.edgeG.appendChild(p);
      return p;
    });

    // flowing energy along lit edges
    this.flowG = svg('g');
    this.svg.appendChild(this.flowG);
    this.flows = this.edges.filter((e2) => e2.lit && !e2.weak).slice(0, 18).map((e2) => {
      const p = svg('path', {
        d: `M${this.nodes[e2.a].x.toFixed(1)} ${this.nodes[e2.a].y.toFixed(1)} Q${e2.cx.toFixed(1)} ${e2.cy.toFixed(1)} ${this.nodes[e2.b].x.toFixed(1)} ${this.nodes[e2.b].y.toFixed(1)}`,
        fill: 'none', stroke: 'rgba(216,238,255,.85)', 'stroke-width': 1.5, 'stroke-linecap': 'round',
        'stroke-dasharray': `14 ${(e2.len - 14).toFixed(1)}`,
      });
      this.flowG.appendChild(p);
      return { p, len: e2.len, phase: (e2.a * 37 + e2.b * 13) % 100 / 100 };
    });

    this.nodeG = svg('g');
    this.svg.appendChild(this.nodeG);
    this.nodeEls = this.nodes.map((n, i) => {
      const g = svg('g', { transform: `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})` });
      if (n.state === 'hub') {
        g.appendChild(svg('circle', { r: 34, fill: 'rgba(140,196,255,.06)', stroke: 'rgba(180,216,255,.22)', 'stroke-width': 1 }));
        g.appendChild(svg('circle', { r: 22, fill: 'none', stroke: 'rgba(200,228,255,.34)', 'stroke-width': 1 }));
        g.appendChild(svg('path', {
          d: 'M0 -17 4.4 -4.4 17 0 4.4 4.4 0 17 -4.4 4.4 -17 0 -4.4 -4.4Z',
          fill: 'url(#ascNode)', filter: 'url(#ascGlow)',
        }));
      } else {
        const s = n.major ? 12.5 : 9;
        const halo = svg('path', {
          d: `M0 ${-s * 2.1} ${s * 2.1} 0 0 ${s * 2.1} ${-s * 2.1} 0Z`,
          fill: 'none', stroke: 'rgba(190,226,255,.5)', 'stroke-width': 1, opacity: 0,
        });
        g.appendChild(halo);
        const body = svg('path', {
          d: `M0 ${-s} ${s} 0 0 ${s} ${-s} 0Z`,
          fill: n.state === 'done' ? 'url(#ascNode)' : n.state === 'open' ? 'rgba(24,42,68,.85)' : 'rgba(14,20,32,.72)',
          stroke: n.state === 'done' ? 'rgba(226,242,255,.9)' : n.state === 'open' ? 'rgba(200,230,255,.9)' : 'rgba(150,178,214,.30)',
          'stroke-width': n.state === 'locked' ? 1 : 1.35,
          filter: n.state === 'done' ? 'url(#ascGlow)' : null,
        });
        g.appendChild(body);
        if (n.state === 'open') {
          g.appendChild(svg('circle', { r: s * 0.34, fill: 'rgba(226,242,255,.95)' }));
        }
        g.halo = halo;
      }
      this.nodeG.appendChild(g);
      return g;
    });

    // cluster labels
    this.labelG = svg('g');
    this.svg.appendChild(this.labelG);
    this.labels = CLUSTERS.map((c) => {
      const n = this.nodes[c.tipIdx];
      const dx = n.x - HUB.x, dy = n.y - HUB.y;
      const L = Math.hypot(dx, dy) || 1;
      const lx = clamp(n.x + (dx / L) * 40, SAFE.x0, SAFE.x1);
      const ly = clamp(n.y + (dy / L) * 34 + 4, SAFE.y0, SAFE.y1);
      const t = svg('text', {
        x: lx.toFixed(1), y: ly.toFixed(1),
        'text-anchor': dx > 30 ? 'start' : dx < -30 ? 'end' : 'middle',
        fill: 'rgba(224,238,255,.78)', 'font-size': 10.5, 'font-weight': 400,
        'letter-spacing': 3.8, 'font-family': 'inherit',
        stroke: 'rgba(5,9,16,.9)', 'stroke-width': 3.4, 'paint-order': 'stroke fill',
      }, [c.name.toUpperCase()]);
      this.labelG.appendChild(t);
      return t;
    });

    // selection bracket
    this.bracket = svg('g', { opacity: 0 });
    for (let i = 0; i < 4; i++) {
      this.bracket.appendChild(svg('path', {
        d: 'M-9 -20 L-20 -20 L-20 -9', fill: 'none', stroke: 'rgba(238,248,255,.95)',
        'stroke-width': 1.6, transform: `rotate(${i * 90})`,
      }));
    }
    this.svg.appendChild(this.bracket);
  }

  _chrome(root) {
    const hud = el('div.asc-hud', {}, [
      el('div.ap-k', { text: 'Ability Points' }),
      el('div.ap-v', { text: String(this.ap) }),
    ]);
    root.appendChild(hud);
    this.apEl = hud.lastChild;
    this.apHud = hud;

    this.card = el('div.asc-node-card.plate');
    this.cK = el('div.an-k');
    this.cN = el('div.an-n');
    this.cD = el('div.t-body', { style: 'margin-top:12px' });
    this.cC = el('div.an-c', {}, [el('span.k', { text: 'Cost' }), el('span.v', { text: '—' })]);
    this.card.appendChild(this.cK);
    this.card.appendChild(this.cN);
    this.card.appendChild(this.cD);
    this.card.appendChild(this.cC);
    root.appendChild(this.card);

    this.legend = el('div.asc-legend', {}, [
      el('div.lg', {}, [el('div.sw', { style: 'background:linear-gradient(135deg,#fff,#6d9dd4);box-shadow:0 0 10px rgba(180,220,255,.7)' }), 'Unlocked']),
      el('div.lg', {}, [el('div.sw', { style: 'background:rgba(24,42,68,.9);box-shadow:inset 0 0 0 1px rgba(200,230,255,.9)' }), 'Available']),
      el('div.lg', {}, [el('div.sw', { style: 'background:rgba(14,20,32,.7);box-shadow:inset 0 0 0 1px rgba(150,178,214,.35)' }), 'Locked']),
    ]);
    root.appendChild(this.legend);
  }

  /** Move the selection to the nearest node in a screen direction. */
  nav(dx, dy) {
    const cur = this.nodes[this.sel];
    let best = -1, bestScore = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      if (i === this.sel) continue;
      const n = this.nodes[i];
      const vx = n.x - cur.x, vy = n.y - cur.y;
      const along = vx * dx + vy * dy;
      if (along <= 12) continue;
      const off = Math.abs(vx * dy - vy * dx);
      const score = along + off * 2.4;
      if (score < bestScore) { bestScore = score; best = i; }
    }
    if (best >= 0) { this.sel = best; this._selAge = 0; }
  }

  /** Unlock the selected node if it is available and affordable. */
  accept() {
    const n = this.nodes[this.sel];
    if (!n || n.state !== 'open' || n.ap > this.ap) return;
    this.ap -= n.ap;
    n.state = 'done';
    this._restyle(this.sel);
    for (const e2 of this.edges) {
      if (e2.a === this.sel || e2.b === this.sel) {
        const other = this.nodes[e2.a === this.sel ? e2.b : e2.a];
        if (other.state === 'locked') { other.state = 'open'; this._restyle(e2.a === this.sel ? e2.b : e2.a); }
      }
    }
  }

  _restyle(i) {
    const n = this.nodes[i];
    const g = this.nodeEls[i];
    const body = g.querySelector('path:nth-of-type(2)') || g.lastChild;
    if (!body) return;
    body.setAttribute('fill', n.state === 'done' ? 'url(#ascNode)' : n.state === 'open' ? 'rgba(24,42,68,.85)' : 'rgba(14,20,32,.72)');
    body.setAttribute('stroke', n.state === 'done' ? 'rgba(226,242,255,.9)' : 'rgba(200,230,255,.9)');
    if (n.state === 'done') body.setAttribute('filter', 'url(#ascGlow)');
  }

  enter() { this._selAge = 0; }

  /** @param {number} dt @param {object} game @param {number} a */
  update(dt, game, a) {
    const t = game.time.now;
    const rev = easeOutQuint(clamp((a - 0.06) / 0.82, 0, 1));

    for (let i = 0; i < this.edgeEls.length; i++) {
      const e2 = this.edges[i];
      const d = clamp((rev - 0.08 - (this.nodes[e2.b].dist || 0) / 2600) / 0.7, 0, 1);
      this.edgeEls[i].setAttribute('stroke-dashoffset', (e2.len * (1 - easeOut(d))).toFixed(1));
    }
    for (const f of this.flows) {
      const p = ((t * 0.22 + f.phase) % 1);
      f.p.setAttribute('stroke-dashoffset', (f.len * (1 - p)).toFixed(1));
      f.p.setAttribute('opacity', (rev * (0.35 + 0.45 * Math.sin(Math.PI * p))).toFixed(3));
    }

    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const g = this.nodeEls[i];
      const d = clamp((rev - (n.dist || 0) / 1500) / 0.55, 0, 1);
      const s = easeOut(d);
      const sel = i === this.sel;
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + i * 0.7);
      const scale = s * (n.state === 'open' ? 1 + 0.05 * pulse : 1) * (sel ? 1.18 : 1);
      g.setAttribute('transform', `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)}) scale(${scale.toFixed(3)})`);
      g.setAttribute('opacity', s.toFixed(3));
      if (g.halo) g.halo.setAttribute('opacity', n.state === 'open' ? (0.16 + 0.34 * pulse).toFixed(3) : '0');
    }
    for (const l of this.labels) l.setAttribute('opacity', easeOut(clamp((rev - 0.4) / 0.5, 0, 1)).toFixed(3));

    const cur = this.nodes[this.sel];
    this._selAge = (this._selAge || 0) + dt;
    const bt = easeOut(clamp(this._selAge / 0.2, 0, 1));
    this.bracket.setAttribute('transform',
      `translate(${cur.x.toFixed(1)} ${cur.y.toFixed(1)}) rotate(${(t * 12).toFixed(2)}) scale(${(1.5 - 0.5 * bt).toFixed(3)})`);
    this.bracket.setAttribute('opacity', (bt * rev).toFixed(3));

    if (this._curName !== cur.name) {
      this.cK.textContent = cur.state === 'done' ? 'Unlocked' : cur.state === 'open' ? 'Available' : cur.state === 'hub' ? 'Origin' : 'Locked';
      this.cN.textContent = cur.name;
      this.cD.textContent = cur.desc || 'The heart of the grid. Every constellation reaches back to it.';
      this.cC.lastChild.textContent = cur.ap ? `${cur.ap} AP` : '—';
      this.cC.lastChild.style.color = cur.ap > this.ap ? 'var(--danger)' : '';
      this._curName = cur.name;
    }
    if (this._ap !== this.ap) { this.apEl.textContent = String(this.ap); this._ap = this.ap; }

    const c = easeOut(clamp((a - 0.3) / 0.55, 0, 1));
    this.card.style.opacity = c.toFixed(3);
    this.card.style.transform = `translateY(${((1 - c) * 20).toFixed(2)}px)`;
    this.legend.style.opacity = c.toFixed(3);
    this.apHud.style.opacity = easeOut(clamp((a - 0.2) / 0.55, 0, 1)).toFixed(3);
  }
}
