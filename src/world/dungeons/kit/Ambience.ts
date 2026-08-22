import type * as THREE from 'three';
import type { AudioSystem } from '../../../audio/AudioSystem.ts';
/**
 * Per-dungeon ambient audio.
 *
 * Hooks into whatever `AudioSystem` has already built — its context, its
 * ambience bus and its convolution reverb — rather than owning a second audio
 * graph. Every dungeon declares a small descriptor (`bed`, `drip`, `hum`,
 * `reverb`) and this turns it into a layered synth bed: a low room tone, a
 * filtered air movement, and sparse one-shots (drips, settling rock, a
 * generator's mains hum) scheduled off the game clock.
 *
 * Entirely optional. The screenshot harness runs with audio disabled, and every
 * call here degrades to a no-op if the audio system never booted.
 */
/** Which bed the room tone and air layer are voiced as. */
export type AmbienceBed = 'trench' | 'mine' | 'cave';

/** The small descriptor a dungeon declares its ambience with. */
export interface AmbienceDesc {
  bed?: AmbienceBed;
  /** Room-tone fundamental, Hz. */
  tone?: number;
  /** Centre of the air band, Hz. */
  air?: number;
  /** Drips per second. `0` silences the one-shots. */
  drip?: number;
  /** Multiplies the drip's peak gain. */
  dripGain?: number;
  /** Mains hum fundamental, Hz. Omit where there is no machinery. */
  hum?: number;
  /** Output gain, 0..1. */
  gain?: number;
}

/** What the ambience needs from the audio system before it may make a sound. */
export interface AmbienceHost {
  audio: AudioSystem;
  ctx: AudioContext;
}

/** The live graph, while the bed is playing. */
interface AmbienceNodes {
  out: GainNode;
  /** Everything that must be `stop()`ed on the way out. */
  sources: AudioScheduledSourceNode[];
}

export class DungeonAmbience {
  /** See `ready`. Off because it has always been off, not because it should be. */
  static readonly ENABLED = false;

  _nextOneShot!: number;
  audio!: AudioSystem | null;
  desc!: AmbienceDesc | null;
  nodes!: AmbienceNodes | null;
  /** @param audio the game's AudioSystem (may be a stub) */
  constructor(audio: AudioSystem | null) {
    this.audio = audio;
    this.nodes = null;
    this.desc = null;
    this._nextOneShot = 0;
  }

  /**
   * Never true today, and deliberately so.
   *
   * This getter tested `a.ambBus`, and `AudioSystem` has never had an `ambBus`
   * -- so it has always been `undefined`, `ready` has always been false, and
   * the dungeon ambience below has never played a note. The real bus is
   * `graph.bus.amb`, and the reference is corrected, but *enabling* a system
   * that has been dark since it was written changes what the game does, which
   * is not something a typing pass gets to decide. Flip `ENABLED` to turn it
   * on, listen to it, and put the result in the commit message.
   */
  get ready() { return this._live() !== null; }

  /**
   * The live graph, or null when the bed must not play.
   *
   * The one place the "is there audio to hang this on" reasoning lives. Every
   * method below narrows through it rather than asserting its way past the
   * getter, which the compiler cannot see through.
   */
  _live(): AmbienceHost | null {
    const a = this.audio;
    if (!DungeonAmbience.ENABLED || !a || !a.ctx || !a.graph || !a.enabled) return null;
    return { audio: a, ctx: a.ctx };
  }

  start(desc: AmbienceDesc) {
    this.desc = desc;
    this.stop();
    const live = this._live();
    if (!live) return;
    const ctx = live.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(live.audio.graph.bus.amb);

    // --- room tone: a low, breathing rumble ------------------------------
    const tone = ctx.createOscillator();
    tone.type = 'sine';
    tone.frequency.value = desc.tone || 42;
    const toneGain = ctx.createGain();
    toneGain.gain.value = 0.16;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.07;
    lfo.connect(lfoGain); lfoGain.connect(toneGain.gain);
    tone.connect(toneGain); toneGain.connect(out);
    tone.start(); lfo.start();

    // --- air: filtered noise, narrow for a mine, wide for a cave ---------
    const noise = ctx.createBufferSource();
    noise.buffer = this._noise(ctx, 5);
    noise.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = desc.air || 240;
    band.Q.value = desc.bed === 'cave' ? 0.8 : 2.4;
    const airGain = ctx.createGain();
    airGain.gain.value = desc.bed === 'trench' ? 0.10 : 0.16;
    noise.connect(band); band.connect(airGain); airGain.connect(out);
    noise.start();

    // --- mains hum: only where there is machinery running ----------------
    let humNodes: AudioScheduledSourceNode[] | null = null;
    if (desc.hum) {
      const h = ctx.createOscillator();
      h.type = 'sawtooth';
      h.frequency.value = desc.hum;
      const hf = ctx.createBiquadFilter();
      hf.type = 'lowpass'; hf.frequency.value = 320;
      const hg = ctx.createGain(); hg.gain.value = 0.045;
      h.connect(hf); hf.connect(hg); hg.connect(out);
      h.start();
      humNodes = [h];
    }

    out.gain.setTargetAtTime(desc.gain != null ? desc.gain : 0.9, ctx.currentTime, 0.8);
    this.nodes = { out, sources: [tone, lfo, noise, ...(humNodes || [])] };
  }

  /** Sparse one-shots: water drips, settling rock, a relay clicking over. */
  update(dt: number, now: number, listenerPos: THREE.Vector3) {
    const live = this._live();
    const nodes = this.nodes;
    if (!live || !nodes || !this.desc) return;
    if (now < this._nextOneShot) return;
    const d = this.desc;
    const rate = d.drip || 0;
    if (rate <= 0) { this._nextOneShot = now + 3; return; }
    this._nextOneShot = now + (0.35 + Math.random() * 2.2) / rate;
    const ctx = live.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const f0 = 900 + Math.random() * 1600;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.35, t + 0.09);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.10 * (d.dripGain || 1), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(g); g.connect(nodes.out);
    osc.start(t); osc.stop(t + 0.3);
    void listenerPos;
  }

  stop() {
    const nodes = this.nodes;
    // `nodes` is only ever set while `_live()` was answering, so the context
    // that built them is still the one that has to fade them out.
    const ctx = this.audio?.ctx;
    if (!nodes || !ctx) return;
    const { out, sources } = nodes;
    out.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
    setTimeout(() => {
      for (const s of sources) { try { s.stop(); } catch (e) { void e; } }
      try { out.disconnect(); } catch (e) { void e; }
    }, 900);
    this.nodes = null;
  }

  _noise(ctx: AudioContext, seconds: number) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.03 * w) / 1.03;
      d[i] = last * 3.2;
    }
    return buf;
  }
}
