import { wave, noiseBuffer, adsr, hit, expTo, EPS, makeRng, clamp } from './Dsp.ts';
import type { AudioGraph } from './Graph.ts';
import { canDetune, canStop } from './nodes.ts';

/**
 * The orchestra.
 *
 * Every instrument here is a *playing technique*, not a waveform: a bowed
 * string has a bow-noise transient and a delayed vibrato, brass gets brighter as
 * it gets louder (that is what makes brass sound like brass), a piano note is
 * an inharmonic partial stack with a hammer thump, and the plucked instruments
 * are real Karplus–Strong strings rendered into a buffer once per anchor pitch
 * and repitched — one node per note instead of a feedback loop the Web Audio
 * render quantum will not let us build above 375 Hz anyway.
 *
 * Voice discipline: every method asks the graph for a slot first and returns
 * false if the budget is spent, and every method reaps its own nodes on the
 * source's `onended`. Nothing here holds a reference after the note dies.
 */
export class Instruments {
  _plucks!: Map<any, any>;
  ctx!: BaseAudioContext;
  graph!: AudioGraph;
  noise!: AudioBuffer;
  pinkNoise!: AudioBuffer;
  rng!: any;
  vibFast!: OscillatorNode;
  vibSlow!: OscillatorNode;
  constructor(graph: import('./Graph.ts').AudioGraph) {
    this.graph = graph;
    const ctx = graph.ctx;
    this.ctx = ctx;
    this.rng = makeRng(0xA1D10);

    // Shared beds: one buffer for all breath/bow/hammer noise.
    this.noise = noiseBuffer(ctx, 2.0, 'white', 4242);
    this.pinkNoise = noiseBuffer(ctx, 3.0, 'pink', 9182);

    // Two shared vibrato LFOs. One oscillator for the whole string section
    // costs one node; forty of them costs forty.
    this.vibFast = ctx.createOscillator();
    this.vibFast.frequency.value = 5.4;
    this.vibFast.start();
    this.vibSlow = ctx.createOscillator();
    this.vibSlow.frequency.value = 4.1;
    this.vibSlow.start();

    /** @type {Map<string, AudioBuffer>} rendered pluck/strike anchors */
    this._plucks = new Map();
  }

  /** Where a note lands unless the caller says otherwise. */
  _out(o: any) { return o.dest || this.graph.bus.music; }

  /**
   * Common tail of every voice: attach the chain to its destination (through a
   * panner when the sound has a place in the world) and schedule the teardown.
   */
  _finish(node: GainNode, o: any, src: any, nodes: any, extraGain: number, handle: any, end: number) {
    const g = this.ctx.createGain();
    g.gain.value = (o.gain ?? 1) * (extraGain ?? 1);
    node.connect(g);
    nodes.push(g);
    if (o.pos) {
      const p = this.graph.panner(o.pos, o);
      g.connect(p);
      p.connect(this._out(o));
      nodes.push(p);
    } else {
      g.connect(this._out(o));
    }
    this.graph.reap(src, nodes, end, handle);
  }

  /* --------------------------------------------------------- sustained */

  /**
   * Bowed strings. `unison` fattens it into a section.
   * @param f frequency
   * @param t start time
   * @param dur seconds of sustain
   * @param [o] {gain, dest, pos, unison, bright, vib, attack, priority}
   */
  strings(f: number, t: number, dur: number, o: any = {}) {
    const slot = this.graph.take(o.priority ?? 1, t);
    if (!slot) return false;
    const ctx = this.ctx;
    const nodes: AudioNode[] = [];
    const unison = o.unison ?? 2;
    const w = wave(ctx, 'string');
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.Q.value = 0.9;
    const bright = o.bright ?? 1;
    // The bow "digs in": the cutoff opens through the attack and slowly closes.
    // Every ramp here *ends*. A BiquadFilter whose frequency has pending
    // automation recomputes its coefficients every sample instead of once per
    // render quantum, so an open-ended `setTargetAtTime` would make one string
    // voice cost as much as ten — measured, not guessed (see src/tools/profile.mjs).
    filt.frequency.setValueAtTime(clamp(f * 1.6, 90, 12000), t);
    filt.frequency.linearRampToValueAtTime(clamp(f * 7.5 * bright, 220, 15000), t + 0.22);
    filt.frequency.linearRampToValueAtTime(clamp(f * 4.0 * bright, 180, 12000), t + 0.75);
    nodes.push(filt);

    const env = ctx.createGain();
    nodes.push(env);
    filt.connect(env);

    let last: any = null;
    const spread = o.spread ?? 9;
    for (let i = 0; i < unison; i++) {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(w);
      osc.frequency.value = f;
      osc.detune.value = (i - (unison - 1) / 2) * spread;
      osc.connect(filt);
      osc.start(t);
      nodes.push(osc);
      last = osc;
    }

    // Vibrato arrives late, as a player's does.
    if (dur > 0.5 && o.vib !== 0) {
      const vg = ctx.createGain();
      vg.gain.setValueAtTime(EPS, t);
      vg.gain.setValueAtTime(EPS, t + Math.min(0.45, dur * 0.4));
      vg.gain.linearRampToValueAtTime((o.vib ?? 1) * 7, t + Math.min(0.95, dur * 0.8));
      this.vibFast.connect(vg);
      for (const n of nodes) if (canDetune(n)) vg.connect(n.detune);
      nodes.push(vg);
    }

    // Bow scrape — the attack transient that says "horsehair on gut". Short
    // notes (a chop, a riff) skip it: three nodes each, forty times a bar.
    const bow = dur < 0.24 || o.bow === false ? null : ctx.createBufferSource();
    if (bow) {
      bow.buffer = this.noise;
      bow.playbackRate.value = 0.8 + this.rng() * 0.4;
      const bf = ctx.createBiquadFilter();
      bf.type = 'bandpass';
      bf.frequency.value = clamp(f * 4.5, 400, 6000);
      bf.Q.value = 1.4;
      const bg = ctx.createGain();
      hit(bg.gain, t, 0.055 * bright, 0.10);
      bow.connect(bf); bf.connect(bg); bg.connect(env);
      bow.start(t, this.rng() * 1.5);
      bow.stop(t + 0.16);
      nodes.push(bow, bf, bg);
    }

    const a = o.attack ?? clamp(0.11 - dur * 0.01, 0.045, 0.16);
    const end = adsr(env.gain, t, dur, { a, d: 0.22, s: 0.86, r: o.release ?? 0.42, peak: 0.30 });
    for (const n of nodes) if (canStop(n) && n !== bow) n.stop(end + 0.05);
    this._finish(env, o, last, nodes, 1, slot, end);
    return true;
  }

  /**
   * Brass. The defining trick is that the spectrum tracks the envelope, so a
   * forte entry is bright and a soft pad is dark — same note, different animal.
   */
  brass(f: number, t: number, dur: number, o: any = {}) {
    const slot = this.graph.take(o.priority ?? 1, t);
    if (!slot) return false;
    const ctx = this.ctx;
    const nodes: AudioNode[] = [];
    const w = wave(ctx, 'brass');
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.Q.value = 1.6;
    const power = o.power ?? 1;
    filt.frequency.setValueAtTime(clamp(f * 1.2, 80, 8000), t);
    filt.frequency.linearRampToValueAtTime(clamp(f * (5 + 5 * power), 300, 14000), t + 0.075);
    filt.frequency.linearRampToValueAtTime(clamp(f * (2.4 + 1.6 * power), 200, 10000), t + 0.42);
    nodes.push(filt);

    const env = ctx.createGain();
    filt.connect(env);
    nodes.push(env);

    let last: any = null;
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(w);
      osc.frequency.value = f;
      osc.detune.setValueAtTime(-34 + i * 12, t);           // the lip "scoop"
      osc.detune.linearRampToValueAtTime(i * 12 - 5, t + 0.06);
      osc.connect(filt);
      osc.start(t);
      nodes.push(osc);
      last = osc;
    }
    if (dur > 0.7) {
      const vg = ctx.createGain();
      vg.gain.setValueAtTime(EPS, t);
      vg.gain.setValueAtTime(EPS, t + 0.35);
      vg.gain.linearRampToValueAtTime(5, t + 0.9);
      this.vibSlow.connect(vg);
      for (const n of nodes) if (canDetune(n)) vg.connect(n.detune);
      nodes.push(vg);
    }
    const end = adsr(env.gain, t, dur, {
      a: o.attack ?? 0.035, d: 0.10, s: 0.82, r: o.release ?? 0.30, peak: 0.30 * power,
    });
    for (const n of nodes) if (canStop(n)) n.stop(end + 0.05);
    this._finish(env, o, last, nodes, 1, slot, end);
    return true;
  }

  /** Flute / clarinet, with the breath noise that sells a wind instrument. */
  wood(f: number, t: number, dur: number, o: any = {}) {
    const slot = this.graph.take(o.priority ?? 1, t);
    if (!slot) return false;
    const ctx = this.ctx;
    const nodes: AudioNode[] = [];
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(wave(ctx, o.reed ? 'reed' : 'flute'));
    osc.frequency.value = f;
    const env = ctx.createGain();
    osc.connect(env);
    nodes.push(osc, env);

    const breath = ctx.createBufferSource();
    breath.buffer = this.pinkNoise;
    breath.loop = true;
    const bf = ctx.createBiquadFilter();
    bf.type = 'bandpass';
    bf.frequency.value = clamp(f * 2.6, 400, 9000);
    bf.Q.value = 0.9;
    const bg = ctx.createGain();
    bg.gain.setValueAtTime(EPS, t);
    bg.gain.linearRampToValueAtTime(0.10, t + 0.05);
    bg.gain.linearRampToValueAtTime(0.035, t + 0.28);
    breath.connect(bf); bf.connect(bg); bg.connect(env);
    breath.start(t, this.rng() * 2);
    nodes.push(breath, bf, bg);

    if (dur > 0.4) {
      const vg = ctx.createGain();
      vg.gain.setValueAtTime(EPS, t);
      vg.gain.setValueAtTime(EPS, t + 0.3);
      vg.gain.linearRampToValueAtTime(9, t + 0.8);
      this.vibFast.connect(vg);
      vg.connect(osc.detune);
      nodes.push(vg);
    }
    const end = adsr(env.gain, t, dur, { a: 0.06, d: 0.14, s: 0.85, r: 0.22, peak: 0.34 });
    osc.start(t);
    osc.stop(end + 0.05);
    breath.stop(end + 0.05);
    this._finish(env, o, osc, nodes, 1, slot, end);
    return true;
  }

  /**
   * Choir. Two detuned voices through a three-formant bank — a synthesised
   * vowel, not a pad with reverb on it.
   * @param {'ah'|'oo'|'mm'} [o.vowel]
   */
  choir(f: number, t: number, dur: number, o: any = {}) {
    const slot = this.graph.take(o.priority ?? 2, t);
    if (!slot) return false;
    const ctx = this.ctx;
    const nodes: AudioNode[] = [];
    const V = FORMANTS[(o.vowel || 'ah') as keyof typeof FORMANTS];
    const env = ctx.createGain();
    nodes.push(env);

    const sum = ctx.createGain();
    sum.gain.value = 0.5;
    nodes.push(sum);
    for (let i = 0; i < V.length; i++) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = V[i][0];
      bp.Q.value = V[i][2];
      const g = ctx.createGain();
      g.gain.value = V[i][1];
      bp.connect(g); g.connect(env);
      sum.connect(bp);
      nodes.push(bp, g);
    }
    // A little dry signal keeps the pitch legible under the formants.
    const dry = ctx.createGain();
    dry.gain.value = 0.35;
    sum.connect(dry); dry.connect(env);
    nodes.push(dry);

    const w = wave(ctx, 'choir');
    let last: any = null;
    for (let i = 0; i < 2; i++) {
      const osc = ctx.createOscillator();
      osc.setPeriodicWave(w);
      osc.frequency.value = f;
      osc.detune.value = (i - 0.5) * 16;
      osc.connect(sum);
      osc.start(t);
      nodes.push(osc);
      last = osc;
    }
    const vg = ctx.createGain();
    vg.gain.setValueAtTime(EPS, t);
    vg.gain.setValueAtTime(EPS, t + 0.5);
    vg.gain.linearRampToValueAtTime(8, t + 1.3);
    this.vibSlow.connect(vg);
    for (const n of nodes) if (canDetune(n)) vg.connect(n.detune);
    nodes.push(vg);

    const end = adsr(env.gain, t, dur, {
      a: o.attack ?? 0.30, d: 0.4, s: 0.9, r: o.release ?? 0.85, peak: 0.55,
    });
    for (const n of nodes) if (canStop(n)) n.stop(end + 0.05);
    this._finish(env, o, last, nodes, 1, slot, end);
    return true;
  }

  /** Warm sustained bed. The cheapest sustained voice we have — 4 nodes. */
  pad(f: number, t: number, dur: number, o: any = {}) {
    const slot = this.graph.take(o.priority ?? 0, t);
    if (!slot) return false;
    const ctx = this.ctx;
    const nodes: AudioNode[] = [];
    const osc = ctx.createOscillator();
    osc.setPeriodicWave(wave(ctx, 'pad'));
    osc.frequency.value = f;
    const osc2 = ctx.createOscillator();
    osc2.setPeriodicWave(wave(ctx, 'pad'));
    osc2.frequency.value = f;
    osc2.detune.value = o.detune ?? 8;
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(clamp(f * 2, 120, 6000), t);
    filt.frequency.linearRampToValueAtTime(clamp(f * 5, 240, 9000), t + dur * 0.5);
    filt.Q.value = 0.6;
    const env = ctx.createGain();
    osc.connect(filt); osc2.connect(filt); filt.connect(env);
    osc.start(t); osc2.start(t);
    nodes.push(osc, osc2, filt, env);
    const end = adsr(env.gain, t, dur, { a: o.attack ?? 0.6, d: 0.5, s: 0.9, r: o.release ?? 1.1, peak: 0.26 });
    osc.stop(end + 0.05); osc2.stop(end + 0.05);
    this._finish(env, o, osc, nodes, 1, slot, end);
    return true;
  }

  /* ------------------------------------------------------------ plucked */

  /**
   * Karplus–Strong string rendered offline into an anchor buffer, then
   * repitched. Used for harp, pizzicato strings and the piano's string body.
   * @param anchor MIDI note of the anchor
   */
  _pluckAnchor(kind: 'harp' | 'pizz' | 'piano', anchor: number) {
    const key = `${kind}:${anchor}`;
    const cached = this._plucks.get(key);
    if (cached) return cached;
    const ctx = this.ctx;
    const sr = ctx.sampleRate;
    const P = PLUCK[kind];
    const f = 440 * Math.pow(2, (anchor - 69) / 12);
    const len = Math.floor(sr * P.seconds);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const N = Math.max(2, Math.round(sr / f));
    const line = new Float32Array(N);
    const rng = makeRng(anchor * 977 + P.seed);
    // Excitation: a filtered noise burst — a bright pluck for harp, a duller
    // felt strike for the piano.
    let e = 0;
    for (let i = 0; i < N; i++) {
      const w = rng() * 2 - 1;
      e += (w - e) * P.exciteBright;
      line[i] = e;
    }
    let idx = 0, lp = 0, prev = 0;
    const damp = P.damp;
    const fb = Math.pow(0.001, 1 / (sr * P.decay));
    for (let i = 0; i < len; i++) {
      const s = line[idx];
      d[i] = s;
      // one-pole lowpass in the feedback path = frequency-dependent decay
      lp += (s - lp) * damp;
      // a touch of the previous sample gives the string a body resonance
      line[idx] = (lp * 0.86 + prev * 0.14) * fb;
      prev = s;
      idx = (idx + 1) % N;
    }
    // Body / soundboard thump.
    const thump = Math.floor(sr * 0.02);
    let t0 = 0;
    for (let i = 0; i < thump; i++) {
      t0 += ((rng() * 2 - 1) - t0) * 0.06;
      d[i] += t0 * P.body * Math.pow(1 - i / thump, 2);
    }
    let peak = 1e-6;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
    for (let i = 0; i < len; i++) d[i] *= 0.85 / peak;
    this._plucks.set(key, buf);
    return buf;
  }

  /**
   * Play a plucked/struck string.
   */
  pluck(kind: 'harp' | 'pizz' | 'piano', f: number, t: number, o: any = {}) {
    const slot = this.graph.take(o.priority ?? 1, t);
    if (!slot) return false;
    const ctx = this.ctx;
    const midi = 69 + 12 * Math.log2(f / 440);
    // Anchors every 4 semitones: ±2 semitones of repitch is inaudible drift.
    const anchor = Math.round(Math.round(midi / 4) * 4);
    const buf = this._pluckAnchor(kind, clamp(anchor, 24, 96));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = f / (440 * Math.pow(2, (clamp(anchor, 24, 96) - 69) / 12));
    const env = ctx.createGain();
    const peak = o.gain != null ? 1 : 1;
    env.gain.setValueAtTime(peak, t);
    // Note-off damping when the caller gives a length.
    if (o.dur) {
      env.gain.setValueAtTime(peak, t + o.dur);
      expTo(env.gain, EPS, t + o.dur + 0.16);
    }
    src.connect(env);
    const end = t + (o.dur ? o.dur + 0.2 : buf.duration / src.playbackRate.value);
    src.start(t);
    src.stop(end);
    this._finish(env, o, src, [src, env], 0.5, slot, end);
    return true;
  }

  /** Harp glissando / arpeggio helper: one call, n notes. */
  arp(freqs: any, t: number, step: number, o: any = {}) {
    for (let i = 0; i < freqs.length; i++) {
      this.pluck(o.kind || 'harp', freqs[i], t + i * step, {
        ...o, gain: (o.gain ?? 1) * (1 - i * 0.03),
      });
    }
  }

  /* -------------------------------------------------------- percussion */

  /** Timpani: a pitched membrane — fundamental plus two inharmonic partials. */
  timpani(f: number, t: number, o: any = {}) {
    const slot = this.graph.take(o.priority ?? 2, t);
    if (!slot) return false;
    const ctx = this.ctx;
    const nodes: AudioNode[] = [];
    const env = ctx.createGain();
    env.gain.value = 1;
    nodes.push(env);
    const decay = o.decay ?? 1.5;
    const parts = [[1, 1, decay], [1.504, 0.30, decay * 0.55], [1.742, 0.18, decay * 0.4]];
    let last: any = null;
    for (const [mult, amp, dec] of parts) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f * mult * 1.06, t);
      osc.frequency.exponentialRampToValueAtTime(f * mult, t + 0.09);
      const g = ctx.createGain();
      hit(g.gain, t, amp * 0.85, dec);
      osc.connect(g); g.connect(env);
      osc.start(t); osc.stop(t + dec + 0.05);
      nodes.push(osc, g);
      last = osc;
    }
    // Mallet contact.
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const lf = ctx.createBiquadFilter();
    lf.type = 'lowpass'; lf.frequency.value = 900;
    const ng = ctx.createGain();
    hit(ng.gain, t, 0.5, 0.06);
    n.connect(lf); lf.connect(ng); ng.connect(env);
    n.start(t, this.rng() * 1.5); n.stop(t + 0.1);
    nodes.push(n, lf, ng);
    this._finish(env, o, last, nodes, 0.9, slot, t + decay + 0.05);
    return true;
  }

  /** Taiko / bass drum — the combat pulse. */
  drum(t: number, o: any = {}) {
    const slot = this.graph.take(o.priority ?? 2, t);
    if (!slot) return false;
    const ctx = this.ctx;
    const nodes: AudioNode[] = [];
    const env = ctx.createGain();
    const f = o.freq ?? 62;
    const decay = o.decay ?? 0.42;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f * 3.2, t);
    osc.frequency.exponentialRampToValueAtTime(f, t + 0.055);
    const og = ctx.createGain();
    hit(og.gain, t, 1.0, decay);
    osc.connect(og); og.connect(env);
    osc.start(t); osc.stop(t + decay + 0.05);
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const bf = ctx.createBiquadFilter();
    bf.type = 'bandpass'; bf.frequency.value = 260; bf.Q.value = 0.8;
    const ng = ctx.createGain();
    hit(ng.gain, t, 0.55, 0.09);
    n.connect(bf); bf.connect(ng); ng.connect(env);
    n.start(t, this.rng() * 1.5); n.stop(t + 0.14);
    nodes.push(osc, og, n, bf, ng, env);
    this._finish(env, o, osc, nodes, 0.85, slot, t + decay + 0.05);
    return true;
  }

  /** Snare / field drum, used for the military feel of the MT encounters. */
  snare(t: number, o: any = {}) {
    const slot = this.graph.take(o.priority ?? 1, t);
    if (!slot) return false;
    const ctx = this.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    n.playbackRate.value = 1 + this.rng() * 0.3;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = o.bright ? 2200 : 1300;
    const bp = ctx.createBiquadFilter();
    bp.type = 'peaking'; bp.frequency.value = 220; bp.gain.value = 8; bp.Q.value = 1.2;
    const g = ctx.createGain();
    hit(g.gain, t, o.gain != null ? 1 : 1, o.decay ?? 0.13);
    n.connect(hp); hp.connect(bp); bp.connect(g);
    n.start(t, this.rng() * 1.5); n.stop(t + (o.decay ?? 0.13) + 0.05);
    this._finish(g, o, n, [n, hp, bp, g], 0.35, slot, t + (o.decay ?? 0.13) + 0.05);
    return true;
  }

  /** Cymbal swell or crash — noise through a resonant comb of bandpasses. */
  cymbal(t: number, o: any = {}) {
    const slot = this.graph.take(o.priority ?? 1, t);
    if (!slot) return false;
    const ctx = this.ctx;
    const nodes: AudioNode[] = [];
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    n.loop = true;
    n.playbackRate.value = 0.7 + this.rng() * 0.6;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 3400;
    const g = ctx.createGain();
    const dur = o.decay ?? 1.6;
    if (o.swell) {
      g.gain.setValueAtTime(EPS, t);
      g.gain.exponentialRampToValueAtTime(1, t + dur * 0.82);
      g.gain.exponentialRampToValueAtTime(EPS, t + dur * 1.15);
    } else {
      hit(g.gain, t, 1, dur);
    }
    n.connect(hp); hp.connect(g);
    n.start(t, this.rng() * 1.5);
    n.stop(t + dur * 1.2 + 0.05);
    nodes.push(n, hp, g);
    this._finish(g, o, n, nodes, 0.22, slot, t + dur * 1.2 + 0.05);
    return true;
  }

  /** Tubular bell / chime — 2-operator FM with a fast index decay. */
  bell(f: number, t: number, o: any = {}) {
    const slot = this.graph.take(o.priority ?? 2, t);
    if (!slot) return false;
    const ctx = this.ctx;
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = f * (o.ratio ?? 1.41);      // inharmonic = metallic
    const mg = ctx.createGain();
    const decay = o.decay ?? 2.4;
    hit(mg.gain, t, f * (o.index ?? 2.2), decay * 0.28);
    mod.connect(mg); mg.connect(carrier.frequency);
    const env = ctx.createGain();
    hit(env.gain, t, 1, decay);
    carrier.connect(env);
    carrier.start(t); mod.start(t);
    carrier.stop(t + decay + 0.05); mod.stop(t + decay + 0.05);
    this._finish(env, o, carrier, [carrier, mod, mg, env], 0.35, slot, t + decay + 0.05);
    return true;
  }

  /** Low gong / tam-tam for boss stingers. */
  gong(f: number, t: number, o: any = {}) {
    return this.bell(f, t, { ratio: 1.93, index: 4.5, decay: o.decay ?? 4.5, ...o });
  }
}

/** [centreHz, gain, Q] triples — measured-ish vowel formants. */
const FORMANTS = {
  ah: [[730, 1.0, 7], [1090, 0.5, 9], [2440, 0.22, 11]],
  oo: [[300, 1.0, 8], [870, 0.36, 10], [2240, 0.12, 12]],
  mm: [[280, 1.0, 9], [900, 0.20, 12], [2100, 0.06, 14]],
};

/** Karplus–Strong parameters per plucked instrument. */
const PLUCK = {
  harp: { seconds: 2.2, decay: 1.7, damp: 0.55, exciteBright: 0.85, body: 0.12, seed: 5 },
  pizz: { seconds: 0.9, decay: 0.55, damp: 0.30, exciteBright: 0.65, body: 0.20, seed: 17 },
  piano: { seconds: 2.6, decay: 2.6, damp: 0.30, exciteBright: 0.40, body: 0.34, seed: 29 },
};
