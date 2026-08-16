export class Time {
  constructor() {
    this.now = 0;          // seconds since start (scaled)
    this.raw = 0;          // unscaled seconds since start
    this.dt = 0;           // scaled delta, clamped
    this.rawDt = 0;
    this.scale = 1;        // global time scale (slow-mo on parry etc.)
    this.frame = 0;
    this._last = performance.now() / 1000;
    this._fpsAcc = 0; this._fpsFrames = 0; this.fps = 60;
  }

  tick() {
    const t = performance.now() / 1000;
    let d = t - this._last;
    this._last = t;
    if (d > 0.1) d = 0.1;      // never simulate more than 100ms in a step
    this.rawDt = d;
    this.raw += d;
    this.dt = d * this.scale;
    this.now += this.dt;
    this.frame++;
    this._fpsAcc += d; this._fpsFrames++;
    if (this._fpsAcc >= 0.5) {
      this.fps = this._fpsFrames / this._fpsAcc;
      this._fpsAcc = 0; this._fpsFrames = 0;
    }
    return this.dt;
  }
}
