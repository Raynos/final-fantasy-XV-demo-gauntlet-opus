import { STATES, LAYERS, voiceChord } from './Themes.ts';
import { ftom, clamp, EPS, makeRng } from './Dsp.ts';
import type { MusicState } from './Themes.ts';
import type { AudioGraph } from './Graph.ts';
import type { Instruments } from './Instruments.ts';

/** Reference pitches. A2 in the bass, A3 in the middle, A4 for the tune. */
const A2 = 110, A3 = 220, A4 = 440;

/**
 * The adaptive score.
 *
 * A single musical clock runs the whole game. Each game state (field, night,
 * tension, combat, boss, camp, victory) supplies a tempo, a chord chart and a
 * set of *layer* weights; changing state does not cut the music, it changes the
 * chart at the next bar line and cross-fades the layers. Because bass and pad
 * exist in every state they simply continue through the change, which is what
 * makes an encounter feel like the same piece of music getting serious rather
 * than a different track starting.
 *
 * Scheduling is look-ahead: a timer wakes up every 60 ms and schedules any bar
 * that starts inside the next ~700 ms, so the sample-accurate Web Audio clock —
 * not `setInterval` — decides when a note sounds. The same `_scheduleUntil`
 * drives the offline verification render, where it is called once with a
 * horizon of the whole session.
 */
export class Score {
  bar!: number;
  intensity!: number;
  state!: MusicState;
  _at!: number | null;
  _queue!: any[];
  /** See `Radio._timer`: the handle type differs between DOM and node. */
  _timer!: ReturnType<typeof setInterval> | null;
  ctx!: any;
  cycle!: number;
  filter!: any;
  graph!: AudioGraph;
  inst!: Instruments;
  layer!: any;
  lookahead!: number;
  nextBarTime!: number;
  notesScheduled!: number;
  oneShotBarsLeft!: number;
  pending!: any;
  phrase!: number;
  phraseBar!: number;
  returnTo!: string;
  rng!: any;
  running!: boolean;
  stateName!: string;
  constructor(graph: import('./Graph.ts').AudioGraph, inst: import('./Instruments.ts').Instruments) {
    this.graph = graph;
    this.inst = inst;
    const ctx = graph.ctx;
    this.ctx = ctx;
    this.rng = makeRng(0x50FA);

    /** Tone control used for menus / underwater / "muffled" moments. */
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 20000;
    this.filter.Q.value = 0.5;
    this.filter.connect(graph.bus.music);

    /** @type {Record<string, GainNode>} one gain per arrangement layer */
    this.layer = {};
    for (const name of LAYERS) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.filter);
      this.layer[name] = g;
    }

    this.stateName = 'silence';
    this.state = STATES.silence;
    this.pending = null;
    this.returnTo = 'field';

    /** 0..1 — how hot the fight is. Adds brass, choir and double-time percussion. */
    this.intensity = 0;

    this.bar = 0;                // absolute bar counter
    this.phrase = 0;             // index into state.melody
    this.phraseBar = 0;          // bar inside the current melodic phrase
    this.cycle = 0;              // how many phrases we have been through
    this.oneShotBarsLeft = 0;

    this.nextBarTime = 0;
    this.lookahead = 0.7;
    this.running = false;
    this._timer = null;
    this._queue = [];
    this.notesScheduled = 0;
  }

  /* -------------------------------------------------------------- clock */

  /** Seconds per beat at the current tempo. */
  get beatDur() { return 60 / this.state.tempo; }

  /**
   * "Now" for parameter automation. While `_scheduleUntil` is walking the bar
   * line this is the bar's *scheduled* time, not the wall clock — which is what
   * makes the whole system renderable through an OfflineAudioContext, where
   * `currentTime` never advances.
   */
  get clock() { return this._at != null ? this._at : this.ctx.currentTime; }

  /** Begin the realtime scheduler. */
  start(state = 'field', at: any = null) {
    if (this.running) return;
    this.running = true;
    this.nextBarTime = (at ?? this.ctx.currentTime) + 0.12;
    this.setState(state, { immediate: true });
    this._timer = setInterval(() => {
      this._scheduleUntil(this.ctx.currentTime + this.lookahead);
    }, 60);
  }

  stop() {
    this.running = false;
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    const t = this.ctx.currentTime;
    for (const name of LAYERS) {
      this.layer[name].gain.cancelScheduledValues(t);
      this.layer[name].gain.setTargetAtTime(0, t, 0.4);
    }
  }

  /** Queue a command onto the musical timeline (used by the offline render). */
  at(time: any, fn: any) { this._queue.push({ time, fn }); this._queue.sort((a, b) => a.time - b.time); }

  /**
   * Change state. The chart swaps at the next bar line and the layers
   * cross-fade, so nothing ever cuts.
   * @param [o] {immediate, fade}
   */
  setState(name: keyof typeof STATES, o: any = {}) {
    if (!STATES[name]) return;
    if (name === this.stateName && !o.force) { this.pending = null; return; }
    if (o.immediate) this._applyState(name, o.fade ?? 0.6);
    else this.pending = { name, fade: o.fade ?? 2.6 };
  }

  /** The state we will fall back to when a one-shot (victory) finishes. */
  setReturnState(name: any) { if (STATES[name]) this.returnTo = name; }

  _applyState(name: any, fade = 2.4) {
    const prev = this.stateName;
    const st = STATES[name];
    this.stateName = name;
    this.state = st;
    this.pending = null;
    this.phrase = 0;
    this.phraseBar = 0;
    this.cycle = 0;
    this.oneShotBarsLeft = st.oneShot ? (st.bars || st.prog.length) : 0;
    if (st.oneShot) this.returnTo = (prev === 'victory' ? 'field' : prev);
    this._fadeLayers(fade);
    this.graph.setMusicReverb(st.reverb ?? 0.8, Math.max(0.5, fade * 0.5), this.clock);
  }

  _fadeLayers(fade: number) {
    const t = this.clock;
    const L = this.state.layers;
    for (const name of LAYERS) {
      const target = this._layerTarget(name, L![name] ?? 0);
      const g = this.layer[name].gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(EPS, g.value), t);
      g.linearRampToValueAtTime(Math.max(0, target), t + fade);
    }
  }

  /** Intensity reshapes the arrangement inside a state without changing it. */
  _layerTarget(name: string, base: number) {
    if (base <= 0) return 0;
    const i = this.intensity;
    if (this.stateName === 'combat' || this.stateName === 'boss') {
      if (name === 'brass') return base * (0.45 + 0.55 * i);
      if (name === 'choir') return base * (0.2 + 0.8 * i);
      if (name === 'melody') return base * (0.6 + 0.4 * i);
      if (name === 'perc') return base * (0.7 + 0.3 * i);
    }
    if (this.stateName === 'tension') {
      if (name === 'perc') return base * (0.4 + 0.6 * i);
      if (name === 'strings') return base * (0.6 + 0.4 * i);
    }
    return base;
  }

  /**
   * How hot the fight is, 0..1. Called from the game each frame; only a real
   * change is pushed at the graph, so this is free to call every tick.
   */
  setIntensity(v: any) {
    const n = clamp(v, 0, 1);
    if (Math.abs(n - this.intensity) < 0.08) return;
    this.intensity = n;
    const t = this.clock;
    const L = this.state.layers;
    for (const name of LAYERS) {
      const target = this._layerTarget(name, L![name] ?? 0);
      this.layer[name].gain.setTargetAtTime(target, t, 1.2);
    }
  }

  /** Muffle the score (menus, pause, underwater). @param hz */
  setFilter(hz: number, glide = 0.25) {
    this.filter.frequency.setTargetAtTime(clamp(hz, 180, 20000), this.clock, glide);
  }

  /**
   * Fire the victory fanfare, then land on `after`.
   *
   * The state to return to is set *after* `setState`, because `_applyState`
   * derives a default from whatever was playing — and what was playing is the
   * combat cue we have just won, which is the one place we must not go back to.
   * @param [after] the cue to resolve into
   */
  victory(after: string = 'field') {
    if (this.stateName === 'victory') return;
    this.setState('victory', { immediate: true, fade: 0.35 });
    this.returnTo = STATES[after] ? after : 'field';
  }

  /* ---------------------------------------------------------- scheduling */

  /**
   * Schedule every bar that begins before `horizon`. Safe to call with a
   * horizon far in the future: that is exactly what the offline render does.
   */
  _scheduleUntil(horizon: any) {
    let guard = 0;
    while (this.nextBarTime < horizon && guard++ < 4096) {
      const t = this.nextBarTime;
      this._at = t;
      while (this._queue.length && this._queue[0].time <= t) this._queue.shift().fn(this);

      if (this.pending) this._applyState(this.pending.name, this.pending.fade);

      if (this.state.oneShot) {
        this.oneShotBarsLeft--;
        if (this.oneShotBarsLeft < 0) { this._applyState(this.returnTo, 1.6); }
      }

      const meter = this.state.meter;
      this._bar(t);
      this.nextBarTime = t + meter * this.beatDur;
      this.bar++;
      this.phraseBar++;
      const mel = this.state.melody;
      const phrase = mel && mel.length ? mel[this.phrase % mel.length] : null;
      const phraseBars = phrase ? phrase.bars : 8;
      if (this.phraseBar >= phraseBars) {
        this.phraseBar = 0;
        this.phrase++;
        if (mel && mel.length && this.phrase % mel.length === 0) this.cycle++;
      }
    }
    this._at = null;
  }

  /** Arrange and schedule one bar starting at `t`. */
  _bar(t: number) {
    const st = this.state;
    const beat = this.beatDur;
    const meter = st.meter;
    const barLen = meter * beat;
    const chord = st.prog[this.bar % st.prog.length];
    const next = st.prog[(this.bar + 1) % st.prog.length];
    const tonic = st.tonic;
    const first = (this.bar % st.prog.length) === 0;

    this._bass(t, barLen, beat, chord, tonic, meter);
    this._pad(t, barLen, chord, tonic);
    this._strings(t, barLen, beat, chord, tonic, meter);
    this._harp(t, barLen, beat, chord, tonic, meter);
    this._choir(t, barLen, chord, tonic, first);
    this._brass(t, barLen, beat, chord, next, tonic, meter);
    this._perc(t, beat, meter, first);
    this._melody(t, beat, meter, tonic);
  }

  /* ------------------------------------------------------------- layers */

  _bass(t: any, barLen: number, beat: number, chord: any, tonic: number, meter: number) {
    if ((this.state.layers!.bass ?? 0) <= 0) return;
    const dest = this.layer.bass;
    const root = ftom(A2, tonic + chord.r);
    const riff = this.state.riff;
    if (riff) {
      // Driving eighths. The riff is the engine of the combat cue — played
      // pizzicato (a rendered Karplus-Strong string, two nodes) rather than
      // bowed, which is both the right articulation and a tenth of the cost.
      const step = beat / 2;
      const n = meter * 2;
      for (let i = 0; i < n; i++) {
        const semi = riff[i % riff.length];
        const accent = i % 4 === 0 ? 1 : i % 2 === 0 ? 0.8 : 0.62;
        this.inst.pluck('pizz', ftom(A2, tonic + chord.r + semi), t + i * step, {
          dest, gain: 2.6 * accent, dur: step * 0.9, priority: 2,
        });
        this.notesScheduled++;
      }
      // Sub-octave anchor so the low end does not disappear between eighths.
      // A sustained sub-octave under the eighths. Without it the cue is all
      // transient and no body, and it measures quieter than the tension bed it
      // is supposed to escalate from.
      this.inst.pad(root / 2, t, barLen * 0.95, { dest, gain: 1.1, attack: 0.02, release: 0.2, priority: 2 });
      this.inst.strings(root, t, barLen * 0.9, {
        dest, gain: 0.75, unison: 2, spread: 5, attack: 0.02, release: 0.25,
        bright: 1.2, vib: 0, bow: false, priority: 2,
      });
      this.notesScheduled++;
    } else {
      this.inst.strings(root, t, barLen * 0.92, {
        dest, gain: 0.9, unison: 2, spread: 5, attack: 0.09, release: 0.5, bright: 0.6, priority: 2,
      });
      this.inst.pad(root / 2, t, barLen * 0.9, { dest, gain: 0.42, attack: 0.35, release: 0.6, priority: 1 });
      this.notesScheduled += 3;
    }
  }

  _pad(t: any, barLen: number, chord: any, tonic: number) {
    if ((this.state.layers!.pad ?? 0) <= 0) return;
    const dest = this.layer.pad;
    // Three voices maximum: a fourth costs a voice and adds nothing you can
    // hear under the strings.
    const notes = voiceChord(chord, 0).slice(0, 3);
    for (let i = 0; i < notes.length; i++) {
      this.inst.pad(ftom(A3, tonic + notes[i]), t + i * 0.012, barLen * 1.05, {
        dest, gain: 0.55 / (1 + i * 0.22), attack: 0.5, release: 0.9, priority: 0,
      });
      this.notesScheduled++;
    }
  }

  _strings(t: any, barLen: number, beat: number, chord: any, tonic: number, meter: number) {
    if ((this.state.layers!.strings ?? 0) <= 0) return;
    const dest = this.layer.strings;
    const notes = voiceChord(chord, 12);
    if (this.state.riff) {
      // Rhythmic chops on the backbeat, the way an action cue carries a chart.
      for (let b = 0; b < meter; b++) {
        const on = b % 2 === 1;
        if (!on) continue;
        for (let i = 0; i < Math.min(3, notes.length); i++) {
          this.inst.strings(ftom(A3, tonic + notes[i]), t + b * beat, beat * 0.52, {
            dest, gain: 0.95 / (1 + i * 0.2), unison: 2, spread: 11, attack: 0.008,
            release: 0.14, bright: 1.4, vib: 0, priority: 1,
          });
          this.notesScheduled++;
        }
      }
    } else {
      for (let i = 0; i < Math.min(3, notes.length); i++) {
        this.inst.strings(ftom(A3, tonic + notes[i]), t + i * 0.02, barLen * 0.98, {
          dest, gain: 0.5 / (1 + i * 0.24), unison: 2,
          spread: 8, attack: 0.13, release: 0.6, bright: 0.9, priority: 1,
        });
        this.notesScheduled++;
      }
    }
  }

  _harp(t: any, barLen: number, beat: number, chord: any, tonic: number, meter: number) {
    if ((this.state.layers!.harp ?? 0) <= 0) return;
    const dest = this.layer.harp;
    const notes = voiceChord(chord, 12);
    const up = notes.concat(notes.map((n) => n + 12));
    // Broken-chord figuration: up the chord across the bar, an extra sweep at
    // the top of a phrase.
    const count = meter === 3 ? 6 : 7;
    const step = barLen / count;
    for (let i = 0; i < count; i++) {
      const n = up[i % up.length];
      this.inst.pluck('harp', ftom(A3, tonic + n), t + i * step, {
        dest, gain: 0.5 * (i === 0 ? 1.25 : 0.8 + 0.2 * this.rng()), priority: 0,
      });
      this.notesScheduled++;
    }
  }

  _choir(t: any, barLen: number, chord: any, tonic: number, first: boolean) {
    if ((this.state.layers!.choir ?? 0) <= 0) return;
    const dest = this.layer.choir;
    // The choir is expensive (three formant filters a voice) — two notes only.
    const notes = voiceChord(chord, 0);
    const pick = [notes[0], notes[notes.length - 1]];
    for (let i = 0; i < pick.length; i++) {
      this.inst.choir(ftom(A3, tonic + pick[i]), t + i * 0.03, barLen * (this.state.riff ? 0.9 : 1.6), {
        dest, gain: (this.state.riff ? 0.85 : 0.6) / (1 + i * 0.3), vowel: this.stateName === 'boss' ? 'ah' : 'oo',
        attack: this.state.riff ? 0.12 : 0.5, release: 1.0, priority: 2,
      });
      this.notesScheduled++;
    }
  }

  _brass(t: any, barLen: number, beat: number, chord: any, next: any, tonic: number, meter: number) {
    if ((this.state.layers!.brass ?? 0) <= 0) return;
    const dest = this.layer.brass;
    const notes = voiceChord(chord, 0);
    if (this.stateName === 'boss') {
      // Low cluster, held, with the fifth stacked on top — weight, not tune.
      this.inst.brass(ftom(A2, tonic + chord.r), t, barLen * 0.95,
        { dest, gain: 1.15, power: 1.15, attack: 0.09, release: 0.4, priority: 2 });
      this.inst.brass(ftom(A2, tonic + notes[notes.length - 1]), t + 0.02, barLen * 0.9,
        { dest, gain: 0.8, power: 1.0, attack: 0.12, release: 0.4, priority: 2 });
      this.notesScheduled += 2;
    } else if (this.stateName === 'victory') {
      for (let i = 0; i < notes.length; i++) {
        this.inst.brass(ftom(A3, tonic + notes[i]), t, barLen * 0.9, {
          dest, gain: 0.95 / (1 + i * 0.25), power: 1.2, attack: 0.02, release: 0.3, priority: 3,
        });
        this.notesScheduled++;
      }
    } else {
      // Stabs on 1 and 3 — the punctuation of the combat cue.
      for (const b of (meter >= 4 ? [0, 2] : [0])) {
        for (let i = 0; i < 2; i++) {
          this.inst.brass(ftom(A2, tonic + notes[i] + 12), t + b * beat, beat * 0.72, {
            dest, gain: 1.0 / (1 + i * 0.3), power: 1.1, attack: 0.018, release: 0.2, priority: 2,
          });
          this.notesScheduled++;
        }
      }
    }
  }

  _perc(t: any, beat: number, meter: number, first: boolean) {
    if ((this.state.layers!.perc ?? 0) <= 0) return;
    const dest = this.layer.perc;
    const s = this.stateName;
    if (s === 'combat') {
      for (let b = 0; b < meter; b++) {
        if (b === 0 || b === 2) this.inst.drum(t + b * beat, { dest, gain: 1.4, freq: 58, decay: 0.45, priority: 2 });
        if (b === 1 || b === 3) this.inst.snare(t + b * beat, { dest, gain: 1.1, priority: 1 });
        // Sixteenth ghost notes ride under it at high intensity.
        if (this.intensity > 0.55) {
          this.inst.snare(t + (b + 0.5) * beat, { dest, gain: 0.22, decay: 0.06, bright: true, priority: 0 });
        }
      }
      if (first) this.inst.cymbal(t, { dest, gain: 0.8, decay: 1.8, priority: 2 });
      this.notesScheduled += meter + 1;
    } else if (s === 'boss') {
      this.inst.timpani(55, t, { dest, gain: 1.35, decay: 1.6, priority: 3 });
      this.inst.drum(t, { dest, gain: 1.2, freq: 46, decay: 0.7, priority: 2 });
      this.inst.timpani(82.4, t + 2 * beat, { dest, gain: 0.95, decay: 1.1, priority: 2 });
      if (first) {
        this.inst.gong(55, t, { dest, gain: 0.55, decay: 5, priority: 3 });
        // The swell leads into the bar; at the very start of a session there is
        // no room for it, and a negative schedule time throws.
        this.inst.cymbal(Math.max(0, t - beat * 0.5), { dest, gain: 0.5, decay: 1.4, swell: true, priority: 1 });
      }
      this.notesScheduled += 4;
    } else if (s === 'tension') {
      // A heartbeat, not a groove.
      this.inst.drum(t, { dest, gain: 0.55, freq: 42, decay: 0.5, priority: 1 });
      this.inst.drum(t + beat * 0.42, { dest, gain: 0.32, freq: 40, decay: 0.4, priority: 0 });
      this.notesScheduled += 2;
    } else if (s === 'victory') {
      this.inst.timpani(110, t, { dest, gain: 1.25, decay: 0.8, priority: 3 });
      for (let b = 0; b < meter; b++) {
        this.inst.drum(t + b * beat, { dest, gain: 0.85, freq: 70, decay: 0.25, priority: 2 });
      }
      if (first) this.inst.cymbal(t, { dest, gain: 1.0, decay: 2.4, priority: 3 });
      this.notesScheduled += meter + 2;
    }
  }

  /**
   * The tune. Which instrument carries it is the state's whole personality:
   * strings on the field, brass in combat, choir at a boss, flute at camp.
   */
  _melody(t: any, beat: number, meter: number, tonic: number) {
    const weight = this.state.layers!.melody ?? 0;
    if (weight <= 0) return;
    const mel = this.state.melody;
    if (!mel || !mel.length) return;
    // Let the theme breathe: every third pass through the melodic material is
    // instrumental, so the motif never turns into wallpaper.
    if (!this.state.oneShot && this.stateName !== 'combat' && this.cycle % 3 === 2) return;
    const phrase = mel[this.phrase % mel.length];
    const barStartBeat = this.phraseBar * meter;
    const dest = this.layer.melody;
    const s = this.stateName;

    for (const [semi, start, len, vel] of phrase.notes) {
      if (start < barStartBeat || start >= barStartBeat + meter) continue;
      const at = t + (start - barStartBeat) * beat;
      const dur = len * beat;
      const f = ftom(A4, tonic + semi);
      const g = 0.9 * vel;
      if (s === 'combat') {
        this.inst.brass(f, at, dur * 0.9, { dest, gain: g * 1.3, power: 1.2, attack: 0.02, release: 0.16, priority: 3 });
        this.inst.strings(f / 2, at, dur * 0.9, { dest, gain: g * 0.6, unison: 2, attack: 0.01, bright: 1.4, vib: 0, bow: false, priority: 1 });
      } else if (s === 'boss') {
        this.inst.choir(f / 2, at, dur * 0.85, { dest, gain: g * 0.9, vowel: 'ah', attack: 0.18, release: 0.7, priority: 3 });
        this.inst.brass(f / 2, at, dur * 0.85, { dest, gain: g * 0.5, power: 1.15, attack: 0.06, priority: 2 });
      } else if (s === 'victory') {
        this.inst.brass(f, at, dur * 0.92, { dest, gain: g * 1.25, power: 1.3, attack: 0.012, release: 0.2, priority: 3 });
        this.inst.brass(f / 2, at, dur * 0.92, { dest, gain: g * 0.75, power: 1.1, attack: 0.014, release: 0.2, priority: 2 });
      } else if (s === 'camp') {
        this.inst.wood(f, at, dur * 0.9, { dest, gain: g * 0.9, priority: 3 });
        this.inst.pluck('harp', f / 2, at, { dest, gain: g * 0.35, priority: 0 });
      } else if (s === 'night') {
        this.inst.wood(f / 2, at, dur * 0.9, { dest, gain: g * 0.7, reed: true, priority: 2 });
      } else {
        // Field: the theme on unison strings, doubled quietly by a flute.
        this.inst.strings(f, at, dur * 0.94, {
          dest, gain: g * 1.25, unison: 2, spread: 7, attack: 0.075, release: 0.45, bright: 1.1, priority: 3,
        });
        if ((this.state.layers!.wood ?? 0) > 0 && vel > 0.8) {
          this.inst.wood(f * 2, at, dur * 0.9, { dest: this.layer.wood, gain: g * 0.5, priority: 1 });
        }
      }
      this.notesScheduled++;
    }
  }

  stats() {
    return {
      state: this.stateName,
      pending: this.pending && this.pending.name,
      bar: this.bar,
      phrase: this.phrase,
      cycle: this.cycle,
      intensity: +this.intensity.toFixed(2),
      tempo: this.state.tempo,
      notesScheduled: this.notesScheduled,
      layers: Object.fromEntries(LAYERS.map((n) => [n, +this.layer[n].gain.value.toFixed(3)])),
    };
  }
}
