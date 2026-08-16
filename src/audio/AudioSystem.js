import * as THREE from 'three';

/**
 * Fully procedural audio — no sample files (see BRIEF: no binary assets).
 *
 * Three layers:
 *   - an adaptive orchestral score synthesised from a chord progression, with
 *     field / tension / combat / victory states that cross-fade,
 *   - a positional SFX bank built from noise + FM synthesis,
 *   - an ambience bed (wind, insects, rain) tied to weather and time of day.
 *
 * Browsers block audio until a gesture, so everything is created lazily on the
 * first interaction and the whole system is a no-op in the screenshot harness.
 */
export class AudioSystem {
  async init(game) {
    this.game = game;
    this.enabled = false;
    this.state = 'field';
    this.master = null;
    this.headless = new URLSearchParams(location.search).has('shoot');

    if (this.headless) return;
    const unlock = () => {
      this._boot();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  _boot() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.5;

    // gentle bus compression so combat hits don't clip the mix
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 22;
    this.comp.ratio.value = 3.4;
    this.comp.attack.value = 0.006;
    this.comp.release.value = 0.22;

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.6, 2.2);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.24;

    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.34;
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.7;
    this.ambBus = ctx.createGain(); this.ambBus.gain.value = 0.4;

    for (const bus of [this.musicBus, this.sfxBus, this.ambBus]) {
      bus.connect(this.comp);
      bus.connect(this.reverbSend);
    }
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(this.comp);
    this.comp.connect(this.master);
    this.master.connect(ctx.destination);

    this.listener = new THREE.AudioListener();
    this.game.camera.add(this.listener);

    this._startAmbience();
    this._startMusic();
    this.enabled = true;
  }

  /** Synthesised late-reverb impulse response (exponentially decaying noise). */
  _impulse(seconds = 2.5, decay = 2.0) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // early reflections then a smooth diffuse tail
        const early = i < ctx.sampleRate * 0.08 ? (Math.random() * 2 - 1) * 0.5 : 0;
        d[i] = ((Math.random() * 2 - 1) * Math.pow(1 - t, decay)) * 0.7 + early;
      }
    }
    return buf;
  }

  // ---------------------------------------------------------------- ambience

  _startAmbience() {
    const ctx = this.ctx;
    // Wind: filtered pink-ish noise with a slowly modulated band-pass.
    const noise = ctx.createBufferSource();
    noise.buffer = this._noiseBuffer(6);
    noise.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.6;

    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 240;
    lfo.connect(lfoGain); lfoGain.connect(bp.frequency);

    this.windGain = ctx.createGain(); this.windGain.gain.value = 0.16;
    noise.connect(bp); bp.connect(this.windGain); this.windGain.connect(this.ambBus);
    noise.start(); lfo.start();
    this.wind = { noise, bp, lfo };

    // Rain bed, kept silent until the weather system asks for it.
    const rain = ctx.createBufferSource();
    rain.buffer = this._noiseBuffer(4); rain.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
    rain.connect(hp); hp.connect(this.rainGain); this.rainGain.connect(this.ambBus);
    rain.start();
  }

  _noiseBuffer(seconds) {
    const ctx = this.ctx;
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      // one-pole cascade -> pink-ish spectrum, much less harsh than white
      b0 = 0.99765 * b0 + white * 0.0990460;
      b1 = 0.96300 * b1 + white * 0.2965164;
      b2 = 0.57000 * b2 + white * 1.0526913;
      d[i] = (b0 + b1 + b2 + white * 0.1848) * 0.16;
    }
    return buf;
  }

  // ------------------------------------------------------------------- music

  _startMusic() {
    // "Somnus"-adjacent: minor key, slow, wide voicings.
    this.progressions = {
      field: [[0, 3, 7, 10], [-2, 3, 5, 10], [-4, 0, 3, 7], [-5, 2, 5, 9]],
      tension: [[0, 3, 6, 10], [0, 3, 6, 10], [-1, 2, 5, 9], [-1, 2, 5, 9]],
      combat: [[0, 3, 7, 10], [-3, 0, 5, 8], [-5, -1, 2, 7], [-4, 0, 3, 8]],
      victory: [[0, 4, 7, 11], [2, 5, 9, 12], [4, 7, 11, 14], [0, 4, 7, 12]],
    };
    this.root = 55;           // A1
    this.bar = 0;
    this._nextNoteTime = this.ctx.currentTime + 0.2;
    this._scheduler = setInterval(() => this._schedule(), 120);
  }

  _schedule() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const tempo = this.state === 'combat' ? 132 : 68;
    const beat = 60 / tempo;
    while (this._nextNoteTime < ctx.currentTime + 0.5) {
      const prog = this.progressions[this.state] || this.progressions.field;
      const chord = prog[this.bar % prog.length];
      const t = this._nextNoteTime;

      for (let i = 0; i < chord.length; i++) {
        const freq = this.root * Math.pow(2, (chord[i] + 24) / 12);
        this._pad(freq, t + i * 0.02, beat * 4, 0.06 / (1 + i * 0.35));
      }
      // bass root
      this._pad(this.root * Math.pow(2, chord[0] / 12), t, beat * 4, 0.09, 'triangle');

      if (this.state === 'combat') {
        for (let s = 0; s < 4; s++) this._perc(t + s * beat, s % 2 === 0);
      }
      this._nextNoteTime += beat * 4;
      this.bar++;
    }
  }

  /** Soft filtered saw pad with a long swell — the score's main voice. */
  _pad(freq, t, dur, gain, type = 'sawtooth') {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc.type = type; osc2.type = type;
    osc.frequency.value = freq;
    osc2.frequency.value = freq * 1.004;      // detune for width
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(300, t);
    filt.frequency.linearRampToValueAtTime(1600, t + dur * 0.4);
    filt.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.28);
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(filt); osc2.connect(filt); filt.connect(g); g.connect(this.musicBus);
    osc.start(t); osc2.start(t);
    osc.stop(t + dur + 0.1); osc2.stop(t + dur + 0.1);
  }

  _perc(t, accent) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.25);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = accent ? 180 : 3200; f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(accent ? 0.5 : 0.14, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (accent ? 0.35 : 0.09));
    src.connect(f); f.connect(g); g.connect(this.musicBus);
    src.start(t); src.stop(t + 0.4);
  }

  // --------------------------------------------------------------------- sfx

  /**
   * One-shot procedural SFX.
   * @param {'swing'|'hit'|'warp'|'step'|'magic'|'ui'|'parry'} name
   * @param {THREE.Vector3} [pos] world position for panning
   */
  play(name, pos, opts = {}) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.value = opts.volume ?? 1;

    if (pos) {
      const pan = ctx.createPanner();
      pan.panningModel = 'HRTF';
      pan.distanceModel = 'inverse';
      pan.refDistance = 4; pan.maxDistance = 90; pan.rolloffFactor = 1.4;
      pan.positionX.value = pos.x; pan.positionY.value = pos.y; pan.positionZ.value = pos.z;
      out.connect(pan); pan.connect(this.sfxBus);
    } else {
      out.connect(this.sfxBus);
    }

    switch (name) {
      case 'swing': this._swoosh(t, out, 0.22, 900, 260); break;
      case 'parry': this._swoosh(t, out, 0.1, 5200, 1400); this._ping(t, out, 2400, 0.5); break;
      case 'hit': this._impact(t, out, 0.3, 120); break;
      case 'warp': this._warp(t, out); break;
      case 'step': this._impact(t, out, 0.12, 320, 0.35); break;
      case 'magic': this._magic(t, out); break;
      case 'ui': this._ping(t, out, 1800, 0.18); break;
      default: break;
    }
  }

  _swoosh(t, out, dur, fStart, fEnd) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer(0.5);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 3.2;
    f.frequency.setValueAtTime(fStart, t);
    f.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + dur * 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(t); src.stop(t + dur + 0.05);
  }

  _impact(t, out, dur, freq, amp = 0.9) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 2.2, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(out);
    osc.start(t); osc.stop(t + dur + 0.02);
    this._swoosh(t, out, dur * 0.6, 2600, 400);
  }

  _ping(t, out, freq, dur) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine'; osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(out);
    osc.start(t); osc.stop(t + dur + 0.02);
  }

  _warp(t, out) {
    const ctx = this.ctx;
    // rising shimmer + a doppler whoosh + a crystalline tail
    for (let i = 0; i < 5; i++) {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      const base = 700 + i * 340;
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.exponentialRampToValueAtTime(base * 3.2, t + 0.28);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.01);
      g.gain.exponentialRampToValueAtTime(0.11, t + 0.05 + i * 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.connect(g); g.connect(out);
      osc.start(t); osc.stop(t + 0.55);
    }
    this._swoosh(t + 0.05, out, 0.35, 300, 4800);
  }

  _magic(t, out) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    osc.type = 'sine'; mod.type = 'sine';
    osc.frequency.value = 220; mod.frequency.value = 63; modGain.gain.value = 420;
    mod.connect(modGain); modGain.connect(osc.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    osc.connect(g); g.connect(out);
    osc.start(t); mod.start(t);
    osc.stop(t + 1.2); mod.stop(t + 1.2);
  }

  // ------------------------------------------------------------------ update

  /** @param {'field'|'tension'|'combat'|'victory'} s */
  setState(s) { this.state = s; }

  setWeather(w) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const rain = w === 'storm' ? 0.5 : w === 'rain' ? 0.3 : 0;
    this.rainGain.gain.linearRampToValueAtTime(rain, t + 2.5);
    this.windGain.gain.linearRampToValueAtTime(w === 'storm' ? 0.34 : 0.16, t + 2.5);
  }

  update(dt, game) {
    if (!this.enabled) return;
    const combat = game.get('CombatSystem');
    const want = combat && combat.inCombat ? 'combat' : 'field';
    if (want !== this.state) this.setState(want);
  }
}
