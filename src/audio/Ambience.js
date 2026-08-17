import { noiseBuffer, makeRng, clamp, EPS, hit } from './Dsp.js';

/**
 * The world's own soundtrack.
 *
 * Continuous beds (wind, rain, cicadas, the mains hum of a fuel stop, water
 * against a shore) are built once and driven by parameters — `Weather`'s wind
 * strength and rain intensity, `Sky`'s hour, the distance to the nearest lake.
 * Intermittent life (birdsong, crickets, a daemon somewhere past the treeline,
 * a drop off a rock) is *scheduled* into a look-ahead window from a seeded RNG,
 * exactly like the score, which means the offline verification render produces
 * the same ambience the live game does.
 */
export class Ambience {
  /**
   * @param {import('./Graph.js').AudioGraph} graph
   * @param {import('./Sfx.js').Sfx} sfx
   */
  constructor(graph, sfx) {
    this.graph = graph;
    this.sfx = sfx;
    const ctx = graph.ctx;
    this.ctx = ctx;
    this.rng = makeRng(0xA3B1E);

    this.pink = noiseBuffer(ctx, 5.0, 'pink', 24680);
    this.brown = noiseBuffer(ctx, 6.0, 'brown', 13579);
    this.white = noiseBuffer(ctx, 4.0, 'white', 11223);

    this.hours = 12;
    this.wind = 1;
    this.rain = 0;
    this.indoors = 0;
    this.nightDepth = 0;

    const bus = graph.bus.amb;
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.out.connect(bus);

    /* ---- wind: three bands, because wind is not one sound ------------- */
    this.windSrc = ctx.createBufferSource();
    this.windSrc.buffer = this.pink;
    this.windSrc.loop = true;
    this.windBands = [];
    const BANDS = [
      { f: 95, q: 0.7, g: 0.55, type: 'lowpass' },     // the body you feel
      { f: 430, q: 0.9, g: 0.42, type: 'bandpass' },   // the moan around rock
      { f: 2200, q: 0.6, g: 0.20, type: 'bandpass' },  // grass and scrub hiss
    ];
    for (const b of BANDS) {
      const f = ctx.createBiquadFilter();
      f.type = b.type; f.frequency.value = b.f; f.Q.value = b.q;
      const g = ctx.createGain();
      g.gain.value = 0;
      this.windSrc.connect(f); f.connect(g); g.connect(this.out);
      this.windBands.push({ filter: f, gain: g, base: b.g, f: b.f });
    }
    // Two detuned LFOs so gusts never settle into an audible cycle.
    this.gustA = ctx.createOscillator(); this.gustA.frequency.value = 0.061;
    this.gustB = ctx.createOscillator(); this.gustB.frequency.value = 0.113;
    this.gustAG = ctx.createGain(); this.gustAG.gain.value = 160;
    this.gustBG = ctx.createGain(); this.gustBG.gain.value = 70;
    this.gustA.connect(this.gustAG); this.gustAG.connect(this.windBands[1].filter.frequency);
    this.gustB.connect(this.gustBG); this.gustBG.connect(this.windBands[2].filter.frequency);
    this.windSrc.start();
    this.gustA.start(); this.gustB.start();

    /* ---- rain --------------------------------------------------------- */
    this.rainSrc = ctx.createBufferSource();
    this.rainSrc.buffer = this.white;
    this.rainSrc.loop = true;
    this.rainHiss = this._band(this.rainSrc, 'highpass', 1500, 0.7);
    this.rainPatter = this._band(this.rainSrc, 'bandpass', 4200, 0.8);
    this.rainRoar = this._band(this.rainSrc, 'lowpass', 420, 0.7);
    this.rainSrc.start();

    /* ---- insects ------------------------------------------------------ */
    // Cicadas are a resonant band that pulses; crickets are scheduled chirps.
    this.cicadaSrc = ctx.createBufferSource();
    this.cicadaSrc.buffer = this.white;
    this.cicadaSrc.loop = true;
    this.cicada = this._band(this.cicadaSrc, 'bandpass', 5200, 14);
    const cLfo = ctx.createOscillator();
    cLfo.frequency.value = 11.5;
    const cLfoG = ctx.createGain();
    cLfoG.gain.value = 0.5;
    cLfo.connect(cLfoG); cLfoG.connect(this.cicada.gain.gain);
    cLfo.start();
    this.cicadaSrc.start();
    this.cicadaLfo = cLfo;

    /* ---- night air ---------------------------------------------------- */
    // A barely-there low bed. You do not hear it; you hear when it stops.
    this.nightSrc = ctx.createBufferSource();
    this.nightSrc.buffer = this.brown;
    this.nightSrc.loop = true;
    this.nightBed = this._band(this.nightSrc, 'lowpass', 180, 0.6);
    this.nightSrc.start();

    /* ---- positional beds, created on demand --------------------------- */
    this.water = null;
    this.hum = null;

    this._nextBird = 0;
    this._nextCricket = 0;
    this._nextHowl = 0;
    this._nextDrip = 0;
    this._nextCreak = 0;
    this.scheduledTo = 0;
  }

  _band(src, type, freq, q, dest = null) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(dest || this.out);
    return { filter: f, gain: g };
  }

  /* ---------------------------------------------------------- parameters */

  /**
   * @param {number} strength Weather.windStrength (0.3 still .. 3.4 storm)
   * @param {number} [at] explicit schedule time (offline render)
   */
  setWind(strength, at = null) {
    const t = at ?? this.ctx.currentTime;
    this.wind = strength;
    // Map the vegetation contract onto a listening curve: still air is almost
    // silent, a storm is a wall.
    const n = clamp((strength - 0.3) / 3.0, 0, 1);
    const loud = Math.pow(n, 1.35);
    const inside = 1 - this.indoors * 0.75;
    for (let i = 0; i < this.windBands.length; i++) {
      const b = this.windBands[i];
      // Higher bands come up faster: wind gets brighter as it gets stronger.
      const w = i === 0 ? 0.35 + 0.65 * loud : i === 1 ? loud : Math.pow(n, 1.9);
      b.gain.gain.setTargetAtTime(b.base * w * 0.85 * inside, t, 1.6);
      b.filter.frequency.setTargetAtTime(b.f * (1 + 0.35 * n), t, 2.0);
    }
    this.gustAG.gain.setTargetAtTime(120 + 320 * n, t, 2.0);
  }

  /** @param {number} intensity Weather.rainIntensity 0..1 */
  setRain(intensity, at = null) {
    const t = at ?? this.ctx.currentTime;
    this.rain = intensity;
    const i = clamp(intensity, 0, 1);
    const inside = 1 - this.indoors * 0.45;
    this.rainHiss.gain.gain.setTargetAtTime(0.30 * i * inside, t, 2.2);
    this.rainPatter.gain.gain.setTargetAtTime(0.20 * Math.pow(i, 1.4) * inside, t, 2.2);
    this.rainRoar.gain.gain.setTargetAtTime(0.34 * Math.pow(i, 1.7) * inside, t, 2.6);
  }

  /**
   * @param {number} hours 0..24
   * @param {number} [nightDepth] 0..1 from DayCycle — deepens the daemon layer
   */
  setTimeOfDay(hours, nightDepth = 0, at = null) {
    const t = at ?? this.ctx.currentTime;
    this.hours = ((hours % 24) + 24) % 24;
    this.nightDepth = nightDepth;
    const h = this.hours;
    // Cicadas belong to the heat of the afternoon.
    const heat = Math.max(0, 1 - Math.abs(h - 14.5) / 5.0);
    const dry = 1 - this.rain;
    this.cicada.gain.gain.setTargetAtTime(0.085 * heat * heat * dry, t, 4);
    this.cicadaLfo.frequency.setTargetAtTime(9 + 5 * heat, t, 4);
    // The night bed rises with the daemons.
    const night = h >= 19 || h < 5 ? 1 : h < 6 ? (6 - h) : h > 18 ? (h - 18) : 0;
    this.nightBed.gain.gain.setTargetAtTime(0.16 * clamp(night, 0, 1) * (0.5 + 0.5 * nightDepth), t, 5);
  }

  /** 0 = outdoors, 1 = fully enclosed. Muffles wind and rain. */
  setIndoors(v, at = null) {
    this.indoors = clamp(v, 0, 1);
    this.setWind(this.wind, at);
    this.setRain(this.rain, at);
  }

  /**
   * Water at a place. Pass null when the player walks away from the shore.
   * @param {{x:number,y:number,z:number}|null} pos nearest point on the water
   * @param {number} distance metres
   */
  setWater(pos, distance) {
    if (!pos || distance > 90) {
      if (this.water) this.water.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 1.2);
      return;
    }
    const ctx = this.ctx;
    if (!this.water) {
      const src = ctx.createBufferSource();
      src.buffer = this.pink;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.value = 0;
      // Slow swell: the lake breathing against the shore.
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.19;
      const lg = ctx.createGain();
      lg.gain.value = 0.45;
      lfo.connect(lg); lg.connect(g.gain);
      const p = this.graph.panner(pos, { refDistance: 10, maxDistance: 140, rolloff: 1.1 });
      src.connect(f); f.connect(g); g.connect(p); p.connect(this.out);
      src.start(); lfo.start();
      this.water = { src, filter: f, gain: g, panner: p, lfo };
    }
    const w = this.water;
    if (w.panner.positionX) {
      const t = this.ctx.currentTime;
      w.panner.positionX.setTargetAtTime(pos.x, t, 0.2);
      w.panner.positionY.setTargetAtTime(pos.y, t, 0.2);
      w.panner.positionZ.setTargetAtTime(pos.z, t, 0.2);
    } else w.panner.setPosition(pos.x, pos.y, pos.z);
    w.gain.gain.setTargetAtTime(0.55 * (1 - clamp(distance / 90, 0, 1)), this.ctx.currentTime, 1.0);
  }

  /**
   * The floodlights over a fuel stop: mains hum, its octave, and the ballast
   * buzz an octave and a fifth up, with a slow flicker.
   * @param {{x:number,y:number,z:number}|null} pos
   * @param {number} distance
   */
  setFloodlights(pos, distance) {
    const ctx = this.ctx;
    if (!pos || distance > 45) {
      if (this.hum) this.hum.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.9);
      return;
    }
    if (!this.hum) {
      const g = ctx.createGain();
      g.gain.value = 0;
      const p = this.graph.panner(pos, { refDistance: 6, maxDistance: 60, rolloff: 1.6 });
      g.connect(p); p.connect(this.out);
      const oscs = [];
      for (const [f, a] of [[50, 0.55], [100, 0.35], [150, 0.12], [300, 0.05]]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        const og = ctx.createGain();
        og.gain.value = a * 0.09;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = f * 3.5; lp.Q.value = 3;
        o.connect(lp); lp.connect(og); og.connect(g);
        o.start();
        oscs.push(o);
      }
      // Tube hiss + flicker.
      const n = ctx.createBufferSource();
      n.buffer = this.white; n.loop = true;
      const nf = ctx.createBiquadFilter();
      nf.type = 'bandpass'; nf.frequency.value = 6800; nf.Q.value = 1.2;
      const ng = ctx.createGain(); ng.gain.value = 0.012;
      n.connect(nf); nf.connect(ng); ng.connect(g);
      n.start();
      this.hum = { gain: g, panner: p, oscs, noise: n };
    }
    const h = this.hum;
    if (h.panner.positionX) {
      const t = ctx.currentTime;
      h.panner.positionX.setTargetAtTime(pos.x, t, 0.2);
      h.panner.positionY.setTargetAtTime(pos.y, t, 0.2);
      h.panner.positionZ.setTargetAtTime(pos.z, t, 0.2);
    } else h.panner.setPosition(pos.x, pos.y, pos.z);
    h.gain.gain.setTargetAtTime(0.9 * (1 - clamp(distance / 45, 0, 1)), ctx.currentTime, 0.8);
  }

  /* --------------------------------------------------------- scheduling */

  /**
   * Fill the one-shot layers out to `horizon`. Called with a short lookahead in
   * the live game and once with the whole session in the offline render.
   * @param {number} horizon absolute context time
   * @param {{x:number,y:number,z:number}} [origin] listener position
   */
  scheduleUntil(horizon, origin = ORIGIN) {
    const start = Math.max(this.scheduledTo, horizon - 4);
    if (horizon <= start) return;
    const h = this.hours;
    const rain = this.rain;
    const day = h > 5.2 && h < 19.4;
    const dawnChorus = Math.max(0, 1 - Math.abs(h - 6.4) / 1.8);
    const duskChorus = Math.max(0, 1 - Math.abs(h - 18.4) / 1.6);
    const birdRate = day ? (0.35 + 2.2 * Math.max(dawnChorus, duskChorus)) * (1 - rain * 0.85) : 0;
    const night = h >= 18.6 || h < 5.6;
    const cricketRate = night ? 2.6 * (1 - rain * 0.9) : 0;
    const howlRate = night ? 0.055 * (0.35 + this.nightDepth) : 0;
    const dripRate = rain > 0.15 ? 3.0 * rain : 0;

    if (this._nextBird < start) this._nextBird = start;
    if (this._nextCricket < start) this._nextCricket = start;
    if (this._nextHowl < start) this._nextHowl = start;
    if (this._nextDrip < start) this._nextDrip = start;

    let guard = 0;
    while (birdRate > 0 && this._nextBird < horizon && guard++ < 200) {
      this._bird(this._nextBird, origin);
      this._nextBird += -Math.log(1 - this.rng() * 0.999) / birdRate;
    }
    if (birdRate <= 0) this._nextBird = horizon;

    guard = 0;
    while (cricketRate > 0 && this._nextCricket < horizon && guard++ < 300) {
      this._cricket(this._nextCricket, origin);
      this._nextCricket += -Math.log(1 - this.rng() * 0.999) / cricketRate;
    }
    if (cricketRate <= 0) this._nextCricket = horizon;

    guard = 0;
    while (howlRate > 0 && this._nextHowl < horizon && guard++ < 20) {
      const a = this.rng() * Math.PI * 2;
      const d = 45 + this.rng() * 60;
      this.sfx.play('howl', {
        x: origin.x + Math.cos(a) * d, y: origin.y + 2, z: origin.z + Math.sin(a) * d,
      }, { at: this._nextHowl, refDistance: 30, maxDistance: 260, rolloff: 0.8 });
      this._nextHowl += -Math.log(1 - this.rng() * 0.999) / howlRate;
    }
    if (howlRate <= 0) this._nextHowl = horizon;

    guard = 0;
    while (dripRate > 0 && this._nextDrip < horizon && guard++ < 200) {
      this._drip(this._nextDrip, origin);
      this._nextDrip += -Math.log(1 - this.rng() * 0.999) / dripRate;
    }
    if (dripRate <= 0) this._nextDrip = horizon;

    this.scheduledTo = horizon;
  }

  /**
   * Birdsong: two to five syllables, each a fast frequency sweep. Real birds
   * chirp in units; a single sine blip sounds like a game menu.
   */
  _bird(t, origin) {
    const slot = this.graph.take(0, t);
    if (!slot) return;
    const ctx = this.ctx;
    const nodes = [];
    const out = ctx.createGain();
    out.gain.value = 0.16 + this.rng() * 0.12;
    const a = this.rng() * Math.PI * 2;
    const d = 8 + this.rng() * 30;
    const p = this.graph.panner({
      x: origin.x + Math.cos(a) * d, y: origin.y + 4 + this.rng() * 6, z: origin.z + Math.sin(a) * d,
    }, { refDistance: 6, maxDistance: 90, rolloff: 1.3 });
    out.connect(p); p.connect(this.out);
    nodes.push(out, p);

    const base = 2400 + this.rng() * 2600;
    const n = 2 + Math.floor(this.rng() * 4);
    const gap = 0.055 + this.rng() * 0.07;
    let last = null, lastEnd = 0;
    for (let i = 0; i < n; i++) {
      const st = t + i * gap;
      const dur = 0.035 + this.rng() * 0.05;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const f0 = base * (0.85 + this.rng() * 0.3);
      const up = this.rng() > 0.5;
      osc.frequency.setValueAtTime(up ? f0 * 0.7 : f0 * 1.35, st);
      osc.frequency.exponentialRampToValueAtTime(up ? f0 * 1.4 : f0 * 0.75, st + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(EPS, st);
      g.gain.exponentialRampToValueAtTime(0.5, st + dur * 0.25);
      g.gain.exponentialRampToValueAtTime(EPS, st + dur);
      osc.connect(g); g.connect(out);
      osc.start(st); osc.stop(st + dur + 0.02);
      nodes.push(osc, g);
      last = osc; lastEnd = st + dur;
    }
    if (last) this.graph.reap(last, nodes, lastEnd, slot); else this.graph.release(nodes, slot);
  }

  /** A cricket: a short burst of a resonant band, repeated in a trill. */
  _cricket(t, origin) {
    const slot = this.graph.take(0, t);
    if (!slot) return;
    const ctx = this.ctx;
    const nodes = [];
    const out = ctx.createGain();
    out.gain.value = 0.09 + this.rng() * 0.07;
    const a = this.rng() * Math.PI * 2;
    const d = 4 + this.rng() * 22;
    const p = this.graph.panner({
      x: origin.x + Math.cos(a) * d, y: origin.y + 0.2, z: origin.z + Math.sin(a) * d,
    }, { refDistance: 4, maxDistance: 45, rolloff: 1.6 });
    out.connect(p); p.connect(this.out);
    nodes.push(out, p);

    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 4200 + this.rng() * 1400;
    f.Q.value = 26;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(out);
    const pulses = 3 + Math.floor(this.rng() * 4);
    const rate = 0.045 + this.rng() * 0.02;
    for (let i = 0; i < pulses; i++) hit(g.gain, t + i * rate, 1, rate * 0.55);
    src.start(t, this.rng() * 3);
    src.stop(t + pulses * rate + 0.05);
    nodes.push(src, f, g);
    this.graph.reap(src, nodes, t + pulses * rate + 0.05, slot);
  }

  /** A drop off a rock or a leaf — what makes rain sound like a place. */
  _drip(t, origin) {
    const slot = this.graph.take(0, t);
    if (!slot) return;
    const ctx = this.ctx;
    const nodes = [];
    const a = this.rng() * Math.PI * 2;
    const d = 1.5 + this.rng() * 9;
    const out = ctx.createGain();
    out.gain.value = 0.10 + this.rng() * 0.12;
    const p = this.graph.panner({
      x: origin.x + Math.cos(a) * d, y: origin.y + 0.3, z: origin.z + Math.sin(a) * d,
    }, { refDistance: 3, maxDistance: 25, rolloff: 1.5 });
    out.connect(p); p.connect(this.out);
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const f = 900 + this.rng() * 1800;
    osc.frequency.setValueAtTime(f * 0.55, t);
    osc.frequency.exponentialRampToValueAtTime(f * 1.9, t + 0.035);
    const g = ctx.createGain();
    hit(g.gain, t, 0.6, 0.05);
    osc.connect(g); g.connect(out);
    osc.start(t); osc.stop(t + 0.08);
    nodes.push(out, p, osc, g);
    this.graph.reap(osc, nodes, t + 0.08, slot);
  }

  /** Realtime tick: keep the look-ahead window fed. */
  update(origin) {
    this.scheduleUntil(this.ctx.currentTime + 1.2, origin);
  }

  stats() {
    return {
      wind: +this.wind.toFixed(2),
      rain: +this.rain.toFixed(2),
      hours: +this.hours.toFixed(2),
      water: !!this.water,
      hum: !!this.hum,
    };
  }
}

const ORIGIN = { x: 0, y: 0, z: 0 };
