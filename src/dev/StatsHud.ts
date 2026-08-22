/**
 * Frame-cost readout: the `stat unit` equivalent.
 *
 * Everything here already existed and was read by nobody. `Time.fps` is a 0.5 s
 * rolling average, and `Game.frame()` calls `renderer.info.reset()` every frame
 * immediately before post runs — so `render.calls` / `render.triangles` are
 * live, accurate, and free. No `stats.js`, no `stats-gl`, no new dependency.
 *
 * The graph matters more than the number. A mean of 58 fps and a mean of 58 fps
 * with a 34 ms spike every two seconds read identically as text and completely
 * differently as a plot, and this project's actual perf failure is hitching
 * (`src/tools/gameplay.mjs` gates on "no frame over 33 ms"), not throughput.
 */
const W = 132;
const H = 34;

export class StatsHud {
  _acc!: number;
  canvas!: any;
  ctx!: any;
  head!: number;
  node!: HTMLDivElement;
  rows!: any;
  samples!: any;
  visible!: boolean;
  constructor(root: HTMLElement) {
    this.node = document.createElement('div');
    this.node.className = 'dev-stats';
    this.node.innerHTML = `
      <canvas class="dev-graph" width="${W}" height="${H}"></canvas>
      <div class="dev-stat-rows"></div>`;
    root.appendChild(this.node);

    this.canvas = this.node.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.rows = this.node.querySelector('.dev-stat-rows');
    this.samples = new Array(W).fill(0);
    this.head = 0;
    this._acc = 0;
    this.visible = true;
  }

  setVisible(v: any) {
    this.visible = !!v;
    this.node.style.display = v ? '' : 'none';
  }

  /**
   * @param dt seconds of wall clock for the frame just rendered
   */
  update(dt: number, game: any) {
    if (!this.visible) return;
    const ms = dt * 1000;
    this.samples[this.head] = ms;
    this.head = (this.head + 1) % W;

    // Text at 5 Hz. Retyping six numbers every frame is a measurable cost in
    // itself, and a value that flickers faster than you can read is useless.
    this._acc += dt;
    if (this._acc < 0.2) { this._draw(); return; }
    this._acc = 0;

    const info = game.renderer ? game.renderer.info : null;
    const r = info ? info.render : null;
    const m = info ? info.memory : null;
    let worst = 0;
    for (const s of this.samples) if (s > worst) worst = s;

    const row = (k: any, v: any) => `<div><span>${k}</span><b>${v}</b></div>`;
    this.rows.innerHTML = [
      row('fps', (game.time.fps || 0).toFixed(1)),
      row('frame', `${ms.toFixed(1)} ms`),
      row('worst', `${worst.toFixed(1)} ms`),
      row('calls', r ? r.calls : '-'),
      row('tris', r ? (r.triangles / 1e6).toFixed(2) + 'M' : '-'),
      row('geo/tex', m ? `${m.geometries}/${m.textures}` : '-'),
    ].join('');
    this._draw();
  }

  _draw() {
    const c = this.ctx;
    c.clearRect(0, 0, W, H);
    // 16.7 ms and 33.3 ms rules: the 60 fps target and the hitch threshold
    // `src/tools/gameplay.mjs` fails on. Scale pins 33.3 ms to two-thirds height so
    // both lines stay on screen while a bad frame still visibly clips.
    const scale = H / 50;
    c.fillStyle = 'rgba(255,255,255,0.10)';
    c.fillRect(0, H - 16.7 * scale, W, 1);
    c.fillStyle = 'rgba(255,120,120,0.22)';
    c.fillRect(0, H - 33.3 * scale, W, 1);

    for (let i = 0; i < W; i++) {
      const v = this.samples[(this.head + i) % W];
      if (!v) continue;
      const h = Math.min(H, v * scale);
      c.fillStyle = v > 33.3 ? '#ff6b6b' : (v > 16.7 ? '#ffd166' : '#7ee081');
      c.fillRect(i, H - h, 1, h);
    }
  }
}
