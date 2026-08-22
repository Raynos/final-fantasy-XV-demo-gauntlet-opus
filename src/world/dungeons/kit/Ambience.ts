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
export class DungeonAmbience {
  /** See `ready`. Off because it has always been off, not because it should be. */
  static readonly ENABLED = false;

  _nextOneShot!: number;
  audio!: AudioSystem | null;
  desc!: any;
  nodes!: any;
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
  get ready() {
    const a = this.audio;
    return DungeonAmbience.ENABLED && !!(a && a.ctx && a.graph && a.enabled);
  }

  start(desc: any) {
    this.desc = desc;
    this.stop();
    if (!this.ready) return;
    const ctx = this.audio!.ctx;
    const out = ctx!.createGain();
    out.gain.value = 0;
    out.connect(this.audio!.graph.bus.amb);

    // --- room tone: a low, breathing rumble ------------------------------
    const tone = ctx!.createOscillator();
    tone.type = 'sine';
    tone.frequency.value = desc.tone || 42;
    const toneGain = ctx!.createGain();
    toneGain.gain.value = 0.16;
    const lfo = ctx!.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx!.createGain();
    lfoGain.gain.value = 0.07;
    lfo.connect(lfoGain); lfoGain.connect(toneGain.gain);
    tone.connect(toneGain); toneGain.connect(out);
    tone.start(); lfo.start();

    // --- air: filtered noise, narrow for a mine, wide for a cave ---------
    const noise = ctx!.createBufferSource();
    noise.buffer = this._noise(ctx, 5);
    noise.loop = true;
    const band = ctx!.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = desc.air || 240;
    band.Q.value = desc.bed === 'cave' ? 0.8 : 2.4;
    const airGain = ctx!.createGain();
    airGain.gain.value = desc.bed === 'trench' ? 0.10 : 0.16;
    noise.connect(band); band.connect(airGain); airGain.connect(out);
    noise.start();

    // --- mains hum: only where there is machinery running ----------------
    let humNodes: any = null;
    if (desc.hum) {
      const h = ctx!.createOscillator();
      h.type = 'sawtooth';
      h.frequency.value = desc.hum;
      const hf = ctx!.createBiquadFilter();
      hf.type = 'lowpass'; hf.frequency.value = 320;
      const hg = ctx!.createGain(); hg.gain.value = 0.045;
      h.connect(hf); hf.connect(hg); hg.connect(out);
      h.start();
      humNodes = [h];
    }

    out.gain.setTargetAtTime(desc.gain != null ? desc.gain : 0.9, ctx!.currentTime, 0.8);
    this.nodes = { out, sources: [tone, lfo, noise, ...(humNodes || [])] };
  }

  /** Sparse one-shots: water drips, settling rock, a relay clicking over. */
  update(dt: any, now: number, listenerPos: any) {
    if (!this.ready || !this.nodes || !this.desc) return;
    if (now < this._nextOneShot) return;
    const d = this.desc;
    const rate = d.drip || 0;
    if (rate <= 0) { this._nextOneShot = now + 3; return; }
    this._nextOneShot = now + (0.35 + Math.random() * 2.2) / rate;
    const ctx = this.audio!.ctx;
    const t = ctx!.currentTime;
    const osc = ctx!.createOscillator();
    const g = ctx!.createGain();
    const f0 = 900 + Math.random() * 1600;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.35, t + 0.09);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.10 * (d.dripGain || 1), t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(g); g.connect(this.nodes.out);
    osc.start(t); osc.stop(t + 0.3);
    void listenerPos;
  }

  stop() {
    if (!this.nodes) return;
    const ctx = this.audio!.ctx;
    const { out, sources } = this.nodes;
    out.gain.setTargetAtTime(0, ctx!.currentTime, 0.25);
    setTimeout(() => {
      for (const s of sources) { try { s.stop(); } catch (e) { void e; } }
      try { out.disconnect(); } catch (e) { void e; }
    }, 900);
    this.nodes = null;
  }

  _noise(ctx: AudioContext | null, seconds: number) {
    const len = Math.floor(ctx!.sampleRate * seconds);
    const buf = ctx!.createBuffer(1, len, ctx!.sampleRate);
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
