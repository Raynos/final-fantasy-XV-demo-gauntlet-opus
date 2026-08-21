import { el, clamp, easeOut, easeOutQuint } from '../UIKit.ts';
import { icon } from '../Icons.ts';

const FILTERS = [
  'None', 'Vintage', 'Monochrome', 'Cross Process', 'Sepia Wash',
  'Golden Hour', 'Neon Fringe', 'Sunbleach',
];
const FRAMES = ['3:2 Full', '16:9 Wide', '1:1 Square', 'Polaroid'];

/**
 * Prompto's camera. A framing overlay with rule-of-thirds guides and corner
 * marks, a filter list on the left, and aperture / exposure dials on the right.
 * Chrome-free: the shared menu heading and footer are suppressed.
 */
export class PhotoScreen {
  /** @param {import('../Menus.ts').Menus} menus */
  constructor(menus) {
    this.menus = menus;
    this.title = 'Photo';
    this.chrome = false;
    this.scrim = false;
    this.filter = 5;
    this.frame = 1;
    this.aperture = 2.8;
    this.exposure = 0.0;
  }

  /** @param {HTMLElement} root */
  build(root) {
    this.frameEl = el('div.photo-frame');
    this.bars = ['t', 'b'].map((k) => {
      const b = el('div.bar');
      this.frameEl.appendChild(b);
      return { b, k };
    });

    this.grid = el('div.photo-grid');
    this.gridLines = [];
    for (let i = 1; i <= 2; i++) {
      const v = el('i', { style: `left:${(i * 100 / 3).toFixed(3)}%;top:0;bottom:0;width:1px` });
      const h = el('i', { style: `top:${(i * 100 / 3).toFixed(3)}%;left:0;right:0;height:1px` });
      this.grid.appendChild(v); this.grid.appendChild(h);
      this.gridLines.push(v, h);
    }
    this.frameEl.appendChild(this.grid);

    this.corners = [[0, 0, '4px 0 0 4px'], [1, 0, '4px 4px 0 0'], [0, 1, '0 0 4px 4px'], [1, 1, '0 4px 4px 0']]
      .map(([x, y]) => {
        const c = el('div.photo-corner');
        c.style.left = x ? 'auto' : '0'; c.style.right = x ? '0' : 'auto';
        c.style.top = y ? 'auto' : '0'; c.style.bottom = y ? '0' : 'auto';
        c.style.borderTopWidth = y ? '0' : '1.5px';
        c.style.borderBottomWidth = y ? '1.5px' : '0';
        c.style.borderLeftWidth = x ? '0' : '1.5px';
        c.style.borderRightWidth = x ? '1.5px' : '0';
        this.frameEl.appendChild(c);
        return c;
      });
    root.appendChild(this.frameEl);

    this.title2 = el('div.photo-title', {}, [
      el('div.pt', { text: 'Photo Mode' }),
      el('div.ps', { text: 'Prompto Argentum  ·  shot 128 of 200' }),
    ]);
    root.appendChild(this.title2);

    this.side = el('div.photo-side.plate');
    this.side.appendChild(el('div.ph-k', { text: 'Filter' }));
    this.rows = FILTERS.map((f) => {
      const r = el('div.ph-row', {}, [el('div.dot'), el('div.n', { text: f })]);
      this.side.appendChild(r);
      return r;
    });
    root.appendChild(this.side);

    this.dials = el('div.photo-dials.plate');
    this.apV = el('div.v', { text: 'f/2.8' });
    this.exV = el('div.v', { text: '±0.0 EV' });
    this.frV = el('div.v', { text: FRAMES[this.frame] });
    this.apBar = el('div.gauge.slim', {}, [el('i.fill')]);
    this.exBar = el('div.gauge.slim', {}, [el('i.fill')]);
    this.dials.appendChild(el('div.dial', {}, [el('div.k', { text: 'Aperture' }), this.apV, this.apBar]));
    this.dials.appendChild(el('div.dial', {}, [el('div.k', { text: 'Exposure' }), this.exV, this.exBar]));
    this.dials.appendChild(el('div.dial', {}, [el('div.k', { text: 'Framing' }), this.frV]));
    this.dials.appendChild(el('div.ph-shoot', {}, [icon('camera', { size: 22, stroke: 1.1 }), el('span', { text: 'Space  ·  Shoot' })]));
    root.appendChild(this.dials);
  }

  nav(dx, dy) {
    if (dy) this.filter = (this.filter + dy + FILTERS.length) % FILTERS.length;
    if (dx) this.aperture = clamp(Math.round((this.aperture + dx * 0.4) * 10) / 10, 1.2, 16);
  }

  accept() { this.flashAt = 0; }

  enter() { this.age = 0; }

  /** @param {number} dt @param {object} game @param {number} a */
  update(dt, game, a) {
    const e = easeOutQuint(clamp((a - 0.05) / 0.8, 0, 1));
    // letterbox to the chosen framing
    const inset = (1 - e) * 0 + 42;
    this.bars[0].b.style.cssText = `left:0;right:0;top:0;height:${(inset * e).toFixed(1)}px`;
    this.bars[1].b.style.cssText = `left:0;right:0;bottom:0;height:${(inset * e).toFixed(1)}px`;
    for (const g of this.gridLines) g.style.opacity = (e * 0.55).toFixed(3);
    this.grid.style.top = `${(inset * e).toFixed(1)}px`;
    this.grid.style.bottom = `${(inset * e).toFixed(1)}px`;
    for (const c of this.corners) {
      c.style.opacity = e.toFixed(3);
      c.style.margin = `${(inset * e + 26).toFixed(1)}px 26px`;
    }
    this.title2.style.opacity = easeOut(clamp((a - 0.2) / 0.5, 0, 1)).toFixed(3);

    for (let i = 0; i < this.rows.length; i++) {
      const on = i === this.filter;
      if (this.rows[i]._on !== on) { this.rows[i].classList.toggle('on', on); this.rows[i]._on = on; }
      const t = easeOut(clamp((a - 0.14 - i * 0.028) / 0.5, 0, 1));
      this.rows[i].style.opacity = t.toFixed(3);
      this.rows[i].style.transform = `translateX(${((1 - t) * -14).toFixed(2)}px)`;
    }
    const s = easeOut(clamp((a - 0.15) / 0.6, 0, 1));
    this.side.style.opacity = s.toFixed(3);
    this.dials.style.opacity = s.toFixed(3);
    this.dials.style.transform = `translateY(-50%) translateX(${((1 - s) * 18).toFixed(2)}px)`;
    this.side.style.transform = `translateY(-50%) translateX(${((1 - s) * -18).toFixed(2)}px)`;

    const ap = `f/${this.aperture.toFixed(1)}`;
    if (ap !== this._ap) { this.apV.textContent = ap; this._ap = ap; }
    this.apBar.firstChild.style.width = `${(clamp((16 - this.aperture) / 14.8, 0, 1) * 100).toFixed(1)}%`;
    this.exBar.firstChild.style.width = '50%';
    this.frV.textContent = FRAMES[this.frame];
  }
}
