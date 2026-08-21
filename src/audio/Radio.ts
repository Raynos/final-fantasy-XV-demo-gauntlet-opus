import { Rng } from '../util/Rng.ts';

/**
 * The Regalia's radio.
 *
 * FFXV lets you buy albums of classic Final Fantasy music and play them while
 * you drive; the car's stereo is a real part of the road trip. There are no
 * audio files in this project and there never will be (see BRIEF), so every
 * station here is *synthesised*, in the same lazily-booted WebAudio style as
 * `AudioSystem` — it borrows that system's context, master chain and reverb
 * when one exists rather than opening a second output.
 *
 * Each station is a small arrangement spec: tempo, metre, a chord loop, a
 * scale, which voices play and what the drums do. A shared scheduler walks the
 * loop a bar at a time with a half-second lookahead and renders it through five
 * synth voices (pluck, pad, lead, bass, and a noise/oscillator drum kit).
 * Melodies are generated per bar from a per-station seeded RNG, so the same
 * station always plays the same tune — deterministic, like everything else.
 *
 *   radio.setEngaged(true)   // player got in the car
 *   radio.next()             // station up
 *   radio.duck(3.2)          // Ignis is talking; get out of the way
 */

/* ---------------------------------------------------------------- stations */

const MINOR = [0, 2, 3, 5, 7, 8, 10];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];

/**
 * @typedef {{id:string, name:string, album:string, bpm:number, beats:number,
 *            root:number, scale:number[], chords:number[][],
 *            voices:string[], drums:string, mood:number}} Station
 */

export const STATIONS: Station[] = [
  {
    id: 'prelude',
    name: 'Prelude of the Crystal',
    album: 'Memories of Eos',
    bpm: 96, beats: 4, root: 65.41, scale: MAJOR,       // C2
    chords: [[0, 4, 7, 11], [0, 4, 7, 11], [-3, 2, 5, 9], [-3, 2, 5, 9]],
    voices: ['arp', 'pad'], drums: 'none', mood: 0.15,
  },
  {
    id: 'wanderer',
    name: "Wanderer's March",
    album: 'Memories of Eos',
    bpm: 132, beats: 3, root: 58.27, scale: MINOR,      // Bb1
    chords: [[0, 3, 7], [-2, 3, 5], [-4, 0, 3], [-5, 2, 7]],
    voices: ['lead', 'pad', 'bass'], drums: 'march', mood: 0.55,
  },
  {
    id: 'circuit',
    name: 'Iron Circuit',
    album: 'Steel & Sand',
    bpm: 148, beats: 4, root: 55.00, scale: DORIAN,     // A1
    chords: [[0, 3, 7, 10], [0, 3, 7, 10], [-2, 1, 5, 8], [-4, -1, 3, 6]],
    voices: ['riff', 'bass', 'lead'], drums: 'rock', mood: 0.9,
  },
  {
    id: 'bluefields',
    name: 'Blue Fields',
    album: 'Long Way Home',
    bpm: 74, beats: 4, root: 61.74, scale: MAJOR,       // B1
    chords: [[0, 4, 7, 11], [-3, 0, 4, 9], [-5, -1, 2, 7], [-7, -3, 0, 4]],
    voices: ['pad', 'lead', 'bass'], drums: 'brush', mood: 0.3,
  },
  {
    id: 'highwind',
    name: 'Highwind Reel',
    album: 'Steel & Sand',
    bpm: 168, beats: 4, root: 73.42, scale: MINOR,      // D2
    chords: [[0, 3, 7], [5, 8, 12], [3, 7, 10], [-2, 2, 5]],
    voices: ['arp', 'lead', 'bass'], drums: 'rock', mood: 0.95,
  },
  {
    id: 'somnus',
    name: 'Somnus (Regalia Mix)',
    album: 'Lucis',
    bpm: 62, beats: 4, root: 55.00, scale: MINOR,
    chords: [[0, 3, 7, 10], [-2, 3, 5, 10], [-4, 0, 3, 7], [-5, 2, 5, 9]],
    voices: ['pad', 'arp'], drums: 'none', mood: 0.05,
  },
];

/* ------------------------------------------------------------------ radio */

export class Radio {
  _duck!: number;
  _next!: number;
  _noiseBuf!: any;
  _duckUntil!: number;
  _melodyRng!: Rng;
  _rng!: Rng;
  _timer!: any;
  bar!: number;
  ctx!: any;
  duckGain!: any;
  enabled!: boolean;
  engaged!: boolean;
  index!: number;
  on!: boolean;
  out!: any;
  send!: any;
  tone!: any;
  volume!: number;
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    this.enabled = false;
    this.engaged = false;
    this.index = 0;
    this.on = true;
    /** Master radio level before ducking. */
    this.volume = 0.34;
    this.bar = 0;
    this._duck = 1;
    this._duckUntil = 0;
    this._next = 0;
    this._timer = null;
    this._rng = new Rng(4242);
    this._melodyRng = new Rng(4242);
  }

  get station(): Station { return STATIONS[this.index]; }

  /**
   * Attach to a live AudioSystem. Safe to call repeatedly; a no-op until that
   * system has actually booted its context (which only happens after a user
   * gesture, per browser policy).
   * @param audio the AudioSystem instance
   * @returns true once attached
   */
  attach(audio: any): boolean {
    if (this.enabled || !audio || !audio.ctx) return this.enabled;
    const ctx = audio.ctx;
    this.ctx = ctx;

    this.out = ctx.createGain();
    this.out.gain.value = 0;                       // faded in on entering the car
    this.duckGain = ctx.createGain();
    this.duckGain.gain.value = 1;

    // a gentle cabin filter: a car stereo is not a concert hall
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 7200;
    this.tone.Q.value = 0.5;

    this.out.connect(this.duckGain);
    this.duckGain.connect(this.tone);
    this.tone.connect(audio.musicBus || ctx.destination);
    if (audio.reverbSend) {
      this.send = ctx.createGain();
      this.send.gain.value = 0.10;
      this.tone.connect(this.send);
      this.send.connect(audio.reverbSend);
    }

    this._next = ctx.currentTime + 0.15;
    this.bar = 0;
    this._timer = setInterval(() => this._schedule(), 120);
    this.enabled = true;
    return true;
  }

  /** Player got in or out of the car. */
  setEngaged(v: any) {
    this.engaged = !!v;
    this._applyGain();
  }

  /** Radio power. @param v */
  setOn(v: boolean) { this.on = !!v; this._applyGain(); }

  /** @param i station index, wrapped */
  setStation(i: number) {
    const n = STATIONS.length;
    this.index = ((i % n) + n) % n;
    this.bar = 0;
    this._melodyRng = new Rng(4242 + this.index * 977);
    // a beat of dead air, like a real tuner
    if (this.ctx) this._next = Math.max(this._next, this.ctx.currentTime + 0.28);
    return this.station;
  }

  next() { return this.setStation(this.index + 1); }
  prev() { return this.setStation(this.index - 1); }

  /**
   * Pull the music down under dialogue.
   * @param seconds how long to stay ducked
   * @param [amount] 0..1 residual level
   */
  duck(seconds: number, amount: number = 0.24) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this._duckUntil = Math.max(this._duckUntil, t + seconds);
    this.duckGain.gain.cancelScheduledValues(t);
    this.duckGain.gain.setTargetAtTime(amount, t, 0.09);
    this._duck = amount;
  }

  _applyGain() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const want = this.engaged && this.on ? this.volume : 0;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(want, t, 0.35);
  }

  update(dt: number) {
    void dt;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this._duck < 1 && t > this._duckUntil) {
      this.duckGain.gain.cancelScheduledValues(t);
      this.duckGain.gain.setTargetAtTime(1, t, 0.5);
      this._duck = 1;
    }
  }

  dispose() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  /* ------------------------------------------------------------ scheduling */

  _schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.engaged || !this.on) {
      // keep the clock rolling so the arrangement does not jump on return
      if (ctx) this._next = Math.max(this._next, ctx.currentTime);
      return;
    }
    const st = this.station;
    const beat = 60 / st.bpm;
    const barLen = beat * st.beats;
    let guard = 0;
    while (this._next < ctx.currentTime + 0.6 && guard++ < 8) {
      this._renderBar(st, this._next, beat);
      this._next += barLen;
      this.bar++;
    }
  }

  _renderBar(st: any, t0: any, beat: any) {
    const chord = st.chords[this.bar % st.chords.length];
    const barLen = beat * st.beats;
    const rng = this._melodyRng;

    for (const v of st.voices) {
      if (v === 'pad') this._voicePad(st, chord, t0, barLen);
      else if (v === 'arp') this._voiceArp(st, chord, t0, beat);
      else if (v === 'lead') this._voiceLead(st, chord, t0, beat, rng);
      else if (v === 'bass') this._voiceBass(st, chord, t0, beat);
      else if (v === 'riff') this._voiceRiff(st, chord, t0, beat);
    }
    if (st.drums !== 'none') this._drums(st, t0, beat);
  }

  _f(st: any, semis: any, octave = 0) { return st.root * Math.pow(2, semis / 12 + octave); }

  /* --------------------------------------------------------------- voices */

  _voicePad(st: any, chord: any, t: any, dur: any) {
    for (let i = 0; i < chord.length; i++) {
      this._osc({
        freq: this._f(st, chord[i], 2), t: t + i * 0.012, dur: dur * 1.02,
        type: 'sawtooth', gain: 0.055 / (1 + i * 0.4),
        attack: dur * 0.30, release: dur * 0.55, cut: 1500, detune: 1.004,
      });
    }
  }

  _voiceBass(st: any, chord: any, t: any, beat: any) {
    const n = st.beats;
    for (let b = 0; b < n; b++) {
      const semi = b % 2 === 0 ? chord[0] : chord[Math.min(1, chord.length - 1)];
      this._osc({
        freq: this._f(st, semi, 0), t: t + b * beat, dur: beat * 0.86,
        type: 'triangle', gain: 0.13, attack: 0.012, release: beat * 0.5, cut: 900,
      });
    }
  }

  _voiceArp(st: any, chord: any, t: any, beat: any) {
    const steps = st.beats * 2;
    for (let s = 0; s < steps; s++) {
      const up = Math.floor(s / chord.length) % 2 === 0;
      const k = up ? s % chord.length : chord.length - 1 - (s % chord.length);
      this._osc({
        freq: this._f(st, chord[k], 3), t: t + s * beat * 0.5, dur: beat * 0.6,
        type: 'triangle', gain: 0.075, attack: 0.006, release: beat * 0.45, cut: 4200,
      });
    }
  }

  _voiceRiff(st: any, chord: any, t: any, beat: any) {
    // driving eighths on the chord root and fifth — the rock stations' engine
    const steps = st.beats * 2;
    for (let s = 0; s < steps; s++) {
      const semi = s % 4 === 3 ? chord[Math.min(2, chord.length - 1)] : chord[0];
      this._osc({
        freq: this._f(st, semi, 1), t: t + s * beat * 0.5, dur: beat * 0.42,
        type: 'square', gain: 0.055, attack: 0.004, release: beat * 0.2, cut: 2100,
      });
    }
  }

  _voiceLead(st: any, chord: any, t: any, beat: any, rng: any) {
    // A phrase per bar: chord tones on the strong beats, scale steps between,
    // with a contour that rises then falls. Deterministic per station.
    const n = st.beats * 2;
    let last = chord[0] + 12;
    for (let s = 0; s < n; s++) {
      if (rng.next() < (s % 2 === 0 ? 0.12 : 0.42)) continue;    // rests
      const strong = s % 2 === 0;
      let semi;
      if (strong) semi = chord[Math.floor(rng.next() * chord.length)] + 12;
      else {
        const step = rng.next() < 0.5 ? 1 : -1;
        semi = this._nearestScale(st, last + step * (rng.next() < 0.7 ? 2 : 3));
      }
      last = semi;
      const dur = beat * (rng.next() < 0.25 ? 1.0 : 0.5);
      this._osc({
        freq: this._f(st, semi, 2), t: t + s * beat * 0.5, dur,
        type: st.mood > 0.7 ? 'sawtooth' : 'triangle',
        gain: 0.062, attack: 0.02, release: dur * 0.6, cut: 3000, vibrato: 5.2,
      });
    }
  }

  _nearestScale(st: any, semi: any) {
    const oct = Math.floor(semi / 12);
    const pc = ((semi % 12) + 12) % 12;
    let best = st.scale[0], bd = 99;
    for (const s of st.scale) { const d = Math.abs(s - pc); if (d < bd) { bd = d; best = s; } }
    return oct * 12 + best;
  }

  /* ---------------------------------------------------------------- drums */

  _drums(st: any, t: any, beat: any) {
    const kit = st.drums;
    const n = st.beats;
    for (let b = 0; b < n; b++) {
      const bt = t + b * beat;
      if (kit === 'march') {
        if (b === 0) this._kick(bt, 0.55);
        else this._snare(bt, 0.20, 0.055);
      } else if (kit === 'rock') {
        if (b === 0 || b === 2) this._kick(bt, 0.62);
        if (b === 1 || b === 3) this._snare(bt, 0.34, 0.10);
        this._hat(bt, 0.075);
        this._hat(bt + beat * 0.5, 0.05);
      } else if (kit === 'brush') {
        if (b === 0) this._kick(bt, 0.34);
        this._hat(bt + beat * 0.5, 0.03);
      }
    }
  }

  _kick(t: any, amp: any) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.14);
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(this.out);
    o.start(t); o.stop(t + 0.26);
  }

  _snare(t: any, amp: any, dur: any) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noise();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.06);
    src.connect(f); f.connect(g); g.connect(this.out);
    src.start(t); src.stop(t + dur + 0.12);
  }

  _hat(t: any, amp: any) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noise();
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 7200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(f); f.connect(g); g.connect(this.out);
    src.start(t); src.stop(t + 0.08);
  }

  /** One shared 0.4 s noise buffer for the whole kit. */
  _noise() {
    if (this._noiseBuf) return this._noiseBuf;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * 0.4);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    const rng = new Rng(90210);
    for (let i = 0; i < len; i++) d[i] = rng.next() * 2 - 1;
    this._noiseBuf = buf;
    return buf;
  }

  /* ----------------------------------------------------------- synth voice */

  /**
   * One filtered, enveloped oscillator (optionally detuned into two and given
   * a vibrato LFO). Everything above is built out of this.
   */
  _osc({ freq, t, dur, type = 'sawtooth', gain = 0.06, attack = 0.01,
    release = 0.2, cut = 2600, detune = 0, vibrato = 0 }: any) {
    const ctx = this.ctx;
    const end = t + dur;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;

    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(Math.max(200, cut * 0.45), t);
    f.frequency.linearRampToValueAtTime(cut, t + Math.max(0.02, attack));
    f.Q.value = 0.8;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.max(0.004, attack));
    g.gain.setValueAtTime(gain, Math.max(t + attack, end - release));
    g.gain.exponentialRampToValueAtTime(0.0001, end + 0.02);

    o.connect(f);
    let o2 = null;
    if (detune) {
      o2 = ctx.createOscillator();
      o2.type = type;
      o2.frequency.value = freq * detune;
      o2.connect(f);
    }
    let lfo = null, lg = null;
    if (vibrato) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = vibrato;
      lg = ctx.createGain();
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(freq * 0.006, end);
      lfo.connect(lg); lg.connect(o.frequency);
    }
    f.connect(g); g.connect(this.out);
    o.start(t); o.stop(end + 0.06);
    if (o2) { o2.start(t); o2.stop(end + 0.06); }
    if (lfo) { lfo.start(t); lfo.stop(end + 0.06); }
  }
}
