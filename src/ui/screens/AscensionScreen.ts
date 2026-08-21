import { el, svg, clamp, rng, easeOut, easeOutQuint } from '../UIKit.ts';
import { readAscension } from '../GameData.ts';

const W = 1600, H = 900;
// keep every node and label inside this box so nothing collides with the chrome
const SAFE = { x0: 316, x1: 1306, y0: 152, y1: 616 };

/** Nodes at or above this AP cost are drawn as constellation capstones. */
const CAPSTONE_AP = 88;

/**
 * The Ascension grid — the real one.
 *
 * Every node, edge, cost, prerequisite and constellation on this screen comes
 * from `src/game/rpg/Ascension.js`: 106 authored nodes across nine
 * constellations, laid out from the normalised `pos` the data already carries.
 * Confirming a node calls `RpgSystem.unlockNode()`, which spends real AP and
 * applies the node's effect to every party member's stat block.
 *
 * The layout transform is anisotropic on purpose — the authored star map is
 * nearly square and the screen is not, so x is stretched further than y, which
 * is also what makes the constellations read as constellations.
 */
export class AscensionScreen {
  /** @param {import('../Menus.ts').Menus} menus */
  constructor(menus) {
    this.menus = menus;
    this.title = 'Ascension';
    this.sub = 'The Astral constellations of the Lucian line';
    this.ap = 0;
  }

  /** @param {HTMLElement} root */
  build(root, game) {
    this.game = game;
    this.wrap = el('div.asc');
    this.svg = svg('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'xMidYMid meet' });
    this.wrap.appendChild(this.svg);
    root.appendChild(this.wrap);

    this._defs();
    this._graph(game);
    this._draw();
    this._chrome(root);
    this.sel = Math.max(0, this.nodes.findIndex((n) => n.state === 'open'));
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
      svg('feGaussianBlur', { stdDeviation: 4, result: 'b' }),
      svg('feMerge', {}, [svg('feMergeNode', { in: 'b' }), svg('feMergeNode', { in: 'SourceGraphic' })]),
    ]);
    defs.appendChild(g1); defs.appendChild(g2); defs.appendChild(blur);
    this.svg.appendChild(defs);
    this.svg.appendChild(svg('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#ascNeb)' }));
  }

  /** Read the authored graph and fit its normalised layout to the safe box. */
  _graph(game) {
    const src = readAscension(game);
    this.src = src;
    this.ap = src.ap;

    const ids = Object.keys(src.nodes);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const id of ids) {
      const [x, y] = src.nodes[id].pos;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    const sx = (SAFE.x1 - SAFE.x0) / Math.max(1e-3, x1 - x0);
    const sy = (SAFE.y1 - SAFE.y0) / Math.max(1e-3, y1 - y0);
    const cx = (SAFE.x0 + SAFE.x1) / 2, cy = (SAFE.y0 + SAFE.y1) / 2;
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    /** normalised layout space -> screen */
    this.place = (p) => [cx + (p[0] - mx) * sx, cy + (p[1] - my) * sy];

    this.byId = new Map();
    this.nodes = ids.map((id, i) => {
      const n = src.nodes[id];
      const [x, y] = this.place(n.pos);
      this.byId.set(id, i);
      return {
        id, x, y, def: n,
        major: n.ap >= CAPSTONE_AP,
        state: 'locked',
        dist: Math.hypot(x - cx, y - cy),
      };
    });

    this.edges = src.edges
      .filter((e) => this.byId.has(e.from) && this.byId.has(e.to))
      .map((e) => {
        const a = this.nodes[this.byId.get(e.from)];
        const b = this.nodes[this.byId.get(e.to)];
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        return {
          a: this.byId.get(e.from), b: this.byId.get(e.to),
          cx: (a.x + b.x) / 2 - dy * 0.07, cy: (a.y + b.y) / 2 + dx * 0.07,
          len: len * 1.06, color: a.def.color,
        };
      });

    // Constellation names live in the page margins, not on top of their own
    // nodes: the outer constellations put their label to the left or right of
    // their bounding box, the three central ones sit above theirs.
    this.constellations = src.constellations.map((c) => {
      const pts = c.nodeIds.filter((id) => this.byId.has(id)).map((id) => this.nodes[this.byId.get(id)]);
      const ax = pts.reduce((a, p) => a + p.x, 0) / Math.max(1, pts.length);
      const ay = pts.reduce((a, p) => a + p.y, 0) / Math.max(1, pts.length);
      const bw = Math.max(...pts.map((p) => Math.abs(p.x - ax)), 10);
      const bh = Math.max(...pts.map((p) => Math.abs(p.y - ay)), 10);
      const side = Math.abs(c.origin[0]) >= 1.0 ? Math.sign(c.origin[0]) : 0;
      const lx = side ? clamp(ax + side * (bw + 26), 132, W - 132) : clamp(ax, 160, W - 160);
      const ly = side ? clamp(ay - 4, 150, H - 190) : clamp(ay - bh - 24, 142, H - 200);
      return {
        ...c, ax, ay, lx, ly, owned: 0,
        anchor: side > 0 ? 'start' : side < 0 ? 'end' : 'middle',
      };
    });

    this._syncStates();
  }

  /** Re-read every node's state from the live Ascension. */
  _syncStates() {
    const s = this.src;
    this.ap = s.ap;
    for (const n of this.nodes) {
      if (s.isUnlocked(n.id)) { n.state = 'done'; continue; }
      const c = s.canUnlock(n.id);
      n.state = c.ok ? 'open' : c.reason === 'not-enough-ap' ? 'reach' : 'locked';
    }
    for (const c of this.constellations) {
      c.owned = c.nodeIds.filter((id) => s.isUnlocked(id)).length;
    }
  }

  _nodeFill(st) {
    return st === 'done' ? 'url(#ascNode)'
      : st === 'open' ? 'rgba(24,42,68,.88)'
        : st === 'reach' ? 'rgba(18,30,50,.80)' : 'rgba(14,20,32,.72)';
  }

  _nodeStroke(n) {
    return n.state === 'done' ? 'rgba(226,242,255,.92)'
      : n.state === 'open' ? 'rgba(206,232,255,.95)'
        : n.state === 'reach' ? n.def.color : 'rgba(150,178,214,.28)';
  }

  _draw() {
    // starfield dust
    const stars = svg('g', { opacity: 0.55 });
    const r = rng(77713);
    for (let i = 0; i < 130; i++) {
      const x = r() * W, y = r() * H;
      const d = Math.hypot(x - W * 0.5, y - H * 0.48) / 700;
      stars.appendChild(svg('circle', {
        cx: x.toFixed(1), cy: y.toFixed(1), r: (0.5 + r() * 1.1).toFixed(2),
        fill: '#cfe2fb', opacity: (0.10 + r() * 0.42 * clamp(1.2 - d, 0.2, 1)).toFixed(3),
      }));
    }
    this.svg.appendChild(stars);

    this.edgeG = svg('g');
    this.svg.appendChild(this.edgeG);
    this.edgeEls = this.edges.map((e2) => {
      const a = this.nodes[e2.a], b = this.nodes[e2.b];
      const p = svg('path', {
        d: `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${e2.cx.toFixed(1)} ${e2.cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
        fill: 'none', stroke: 'rgba(150,178,214,.16)', 'stroke-width': 1,
        'stroke-dasharray': e2.len.toFixed(1), 'stroke-dashoffset': e2.len.toFixed(1),
      });
      this.edgeG.appendChild(p);
      return p;
    });

    // energy flowing along the edges the party has actually bought
    this.flowG = svg('g');
    this.svg.appendChild(this.flowG);
    this.flows = this.edges.map((e2, i) => {
      const a = this.nodes[e2.a], b = this.nodes[e2.b];
      const p = svg('path', {
        d: `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${e2.cx.toFixed(1)} ${e2.cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
        fill: 'none', stroke: 'rgba(216,238,255,.85)', 'stroke-width': 1.4, 'stroke-linecap': 'round',
        'stroke-dasharray': `12 ${(e2.len - 12).toFixed(1)}`, opacity: 0,
      });
      this.flowG.appendChild(p);
      return { p, e: e2, len: e2.len, phase: (i * 37 % 100) / 100 };
    });

    this.nodeG = svg('g');
    this.svg.appendChild(this.nodeG);
    this.nodeEls = this.nodes.map((n) => {
      const s = n.major ? 10.5 : 7;
      const g = svg('g', { transform: `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})` });
      const halo = svg('path', {
        d: `M0 ${-s * 2.2} ${s * 2.2} 0 0 ${s * 2.2} ${-s * 2.2} 0Z`,
        fill: 'none', stroke: n.def.color, 'stroke-width': 1, opacity: 0,
      });
      const body = svg('path', {
        d: `M0 ${-s} ${s} 0 0 ${s} ${-s} 0Z`,
        fill: this._nodeFill(n.state), stroke: this._nodeStroke(n),
        'stroke-width': n.state === 'locked' ? 0.9 : 1.3,
      });
      const pip = svg('circle', { r: (s * 0.3).toFixed(2), fill: 'rgba(226,242,255,.95)', opacity: 0 });
      g.appendChild(halo); g.appendChild(body); g.appendChild(pip);
      this.nodeG.appendChild(g);
      return { g, halo, body, pip, s, key: '' };
    });

    // constellation labels, with how much of each the party owns
    this.labelG = svg('g');
    this.svg.appendChild(this.labelG);
    this.labels = this.constellations.map((c) => {
      const g = svg('g');
      const t = svg('text', {
        x: c.lx.toFixed(1), y: c.ly.toFixed(1), 'text-anchor': c.anchor,
        fill: 'rgba(228,240,255,.86)', 'font-size': 10.5, 'font-weight': 400,
        'letter-spacing': 3.8, 'font-family': 'inherit',
        stroke: 'rgba(5,9,16,.9)', 'stroke-width': 3.4, 'paint-order': 'stroke fill',
      }, [c.name.toUpperCase()]);
      const sub = svg('text', {
        x: c.lx.toFixed(1), y: (c.ly + 13).toFixed(1), 'text-anchor': c.anchor,
        fill: c.color, 'font-size': 8, 'letter-spacing': 2.4, 'font-family': 'inherit',
        opacity: 0.72, stroke: 'rgba(5,9,16,.9)', 'stroke-width': 3, 'paint-order': 'stroke fill',
      }, [`0 / ${c.nodeIds.length}`]);
      g.appendChild(t); g.appendChild(sub);
      this.labelG.appendChild(g);
      return { g, sub, c, key: '' };
    });

    // selection bracket
    this.bracket = svg('g', { opacity: 0 });
    for (let i = 0; i < 4; i++) {
      this.bracket.appendChild(svg('path', {
        d: 'M-8 -18 L-18 -18 L-18 -8', fill: 'none', stroke: 'rgba(238,248,255,.95)',
        'stroke-width': 1.6, transform: `rotate(${i * 90})`,
      }));
    }
    this.svg.appendChild(this.bracket);
  }

  _chrome(root) {
    const hud = el('div.asc-hud', {}, [
      el('div.ap-k', { text: 'Ability Points' }),
      el('div.ap-v', { text: String(this.ap) }),
      el('div.ap-sub', { text: '' }),
    ]);
    root.appendChild(hud);
    this.apEl = hud.childNodes[1];
    this.apSub = hud.childNodes[2];
    this.apHud = hud;

    this.card = el('div.asc-node-card.plate');
    this.cK = el('div.an-k');
    this.cN = el('div.an-n');
    this.cC2 = el('div.an-con');
    this.cD = el('div.t-body', { style: 'margin-top:12px' });
    this.cReq = el('div.an-req');
    this.cC = el('div.an-c', {}, [el('span.k', { text: 'Cost' }), el('span.v', { text: '—' })]);
    this.card.appendChild(this.cK);
    this.card.appendChild(this.cN);
    this.card.appendChild(this.cC2);
    this.card.appendChild(this.cD);
    this.card.appendChild(this.cReq);
    this.card.appendChild(this.cC);
    root.appendChild(this.card);

    this.legend = el('div.asc-legend', {}, [
      el('div.lg', {}, [el('div.sw', { style: 'background:linear-gradient(135deg,#fff,#6d9dd4);box-shadow:0 0 10px rgba(180,220,255,.7)' }), 'Unlocked']),
      el('div.lg', {}, [el('div.sw', { style: 'background:rgba(24,42,68,.9);box-shadow:inset 0 0 0 1px rgba(206,232,255,.95)' }), 'Available']),
      el('div.lg', {}, [el('div.sw', { style: 'background:rgba(18,30,50,.8);box-shadow:inset 0 0 0 1px rgba(200,160,120,.9)' }), 'Not enough AP']),
      el('div.lg', {}, [el('div.sw', { style: 'background:rgba(14,20,32,.7);box-shadow:inset 0 0 0 1px rgba(150,178,214,.3)' }), 'Locked']),
    ]);
    root.appendChild(this.legend);
  }

  /** Move the selection to the nearest node in a screen direction. */
  nav(dx, dy) {
    const cur = this.nodes[this.sel];
    if (!cur) return;
    let best = -1, bestScore = Infinity;
    for (let i = 0; i < this.nodes.length; i++) {
      if (i === this.sel) continue;
      const n = this.nodes[i];
      const vx = n.x - cur.x, vy = n.y - cur.y;
      const along = vx * dx + vy * dy;
      if (along <= 6) continue;
      const off = Math.abs(vx * dy - vy * dx);
      const score = along + off * 2.4;
      if (score < bestScore) { bestScore = score; best = i; }
    }
    if (best >= 0) { this.sel = best; this._selAge = 0; }
  }

  /** Buy the selected node. Real AP, real prerequisites, real effects. */
  accept() {
    const n = this.nodes[this.sel];
    if (!n) return;
    if (!this.src.unlock(n.id)) return;
    this._syncStates();
    this._restyleAll();
    this._curKey = null;
  }

  _restyleAll() {
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const e = this.nodeEls[i];
      const key = n.state;
      if (e.key === key) continue;
      e.key = key;
      e.body.setAttribute('fill', this._nodeFill(n.state));
      e.body.setAttribute('stroke', this._nodeStroke(n));
      e.body.setAttribute('stroke-width', n.state === 'locked' ? 0.9 : 1.3);
      if (n.state === 'done') e.body.setAttribute('filter', 'url(#ascGlow)');
      else e.body.removeAttribute('filter');
      e.pip.setAttribute('opacity', n.state === 'open' ? 1 : 0);
    }
    for (const l of this.labels) {
      const key = `${l.c.owned}/${l.c.nodeIds.length}`;
      if (l.key === key) continue;
      l.key = key;
      l.sub.textContent = key;
    }
  }

  enter(game) {
    this._selAge = 0;
    if (game) this.game = game;
    this._syncStates();
    this._restyleAll();
    this._curKey = null;
    if (this.nodes[this.sel]?.state === 'locked') {
      const open = this.nodes.findIndex((n) => n.state === 'open');
      if (open >= 0) this.sel = open;
    }
  }

  /** @param {number} dt @param {object} game @param {number} a */
  update(dt, game, a) {
    const t = game.time.now;
    const rev = easeOutQuint(clamp((a - 0.06) / 0.82, 0, 1));
    if (this._ap !== this.src.ap) { this._syncStates(); this._restyleAll(); }

    for (let i = 0; i < this.edgeEls.length; i++) {
      const e2 = this.edges[i];
      const b = this.nodes[e2.b];
      const d = clamp((rev - 0.06 - b.dist / 2800) / 0.7, 0, 1);
      this.edgeEls[i].setAttribute('stroke-dashoffset', (e2.len * (1 - easeOut(d))).toFixed(1));
      const lit = this.nodes[e2.a].state === 'done';
      if (this.edgeEls[i]._lit !== lit) {
        this.edgeEls[i].setAttribute('stroke', lit ? 'rgba(172,210,252,.52)' : 'rgba(150,178,214,.14)');
        this.edgeEls[i].setAttribute('stroke-width', lit ? 1.25 : 0.9);
        this.edgeEls[i]._lit = lit;
      }
    }
    // only edges between two owned nodes carry light
    for (const f of this.flows) {
      const on = this.nodes[f.e.a].state === 'done' && this.nodes[f.e.b].state === 'done';
      if (!on) { if (f._on !== false) { f.p.setAttribute('opacity', 0); f._on = false; } continue; }
      f._on = true;
      const p = ((t * 0.22 + f.phase) % 1);
      f.p.setAttribute('stroke-dashoffset', (f.len * (1 - p)).toFixed(1));
      f.p.setAttribute('opacity', (rev * (0.30 + 0.45 * Math.sin(Math.PI * p))).toFixed(3));
    }

    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const e = this.nodeEls[i];
      const d = clamp((rev - n.dist / 1700) / 0.55, 0, 1);
      const s = easeOut(d);
      const sel = i === this.sel;
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.4 + i * 0.7);
      const scale = s * (n.state === 'open' ? 1 + 0.06 * pulse : 1) * (sel ? 1.24 : 1);
      e.g.setAttribute('transform', `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)}) scale(${scale.toFixed(3)})`);
      e.g.setAttribute('opacity', (s * (n.state === 'locked' ? 0.66 : 1)).toFixed(3));
      e.halo.setAttribute('opacity', n.state === 'open' ? (0.18 + 0.36 * pulse).toFixed(3) : '0');
    }
    for (const l of this.labels) l.g.setAttribute('opacity', easeOut(clamp((rev - 0.4) / 0.5, 0, 1)).toFixed(3));

    const cur = this.nodes[this.sel];
    this._selAge = (this._selAge || 0) + dt;
    const bt = easeOut(clamp(this._selAge / 0.2, 0, 1));
    if (cur) {
      this.bracket.setAttribute('transform',
        `translate(${cur.x.toFixed(1)} ${cur.y.toFixed(1)}) rotate(${(t * 12).toFixed(2)}) scale(${(1.5 - 0.5 * bt).toFixed(3)})`);
      this.bracket.setAttribute('opacity', (bt * rev).toFixed(3));
    }

    const key = cur ? `${cur.id}|${cur.state}` : '';
    if (this._curKey !== key && cur) {
      const def = cur.def;
      const check = this.src.canUnlock(cur.id);
      this.cK.textContent = cur.state === 'done' ? 'Unlocked'
        : cur.state === 'open' ? 'Available'
          : cur.state === 'reach' ? 'Not enough AP' : 'Locked';
      this.cN.textContent = def.name;
      this.cC2.textContent = def.constellationName;
      this.cC2.style.color = def.color;
      this.cD.textContent = def.desc;
      const missing = (check.missing || []).map((m) => this.src.nodes[m]?.name).filter(Boolean);
      this.cReq.textContent = missing.length ? `Requires  ·  ${missing.join('  ·  ')}` : '';
      this.cReq.style.display = missing.length ? '' : 'none';
      this.cC.lastChild.textContent = cur.state === 'done' ? 'Owned' : `${def.ap} AP`;
      this.cC.lastChild.style.color = cur.state === 'reach' ? 'var(--danger)' : '';
      this._curKey = key;
    }
    if (this._ap !== this.src.ap) {
      this.apEl.textContent = String(this.src.ap);
      this.apSub.textContent = `${this.src.unlockedCount} / ${this.nodes.length} nodes`;
      this._ap = this.src.ap;
    }

    const c = easeOut(clamp((a - 0.3) / 0.55, 0, 1));
    this.card.style.opacity = c.toFixed(3);
    this.card.style.transform = `translateY(${((1 - c) * 20).toFixed(2)}px)`;
    this.legend.style.opacity = c.toFixed(3);
    this.apHud.style.opacity = easeOut(clamp((a - 0.2) / 0.55, 0, 1)).toFixed(3);
  }
}
