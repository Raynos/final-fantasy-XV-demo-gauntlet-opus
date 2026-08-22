import { impulseResponse, softClipCurve, EPS, clamp } from './Dsp.ts';
import type * as THREE from 'three';

/**
 * The mix. Every sound in the game lands on one of five buses, and the buses
 * land on a limiter before the speakers:
 *
 *   music ─┐
 *   amb   ─┤── duck ──┐
 *   sfx   ─┼──────────┼── glue comp ── saturator ── master ── out
 *   ui    ─┤          │
 *   voice ─┴──────────┘   (voice also drives the duck)
 *
 * `music` and `amb` sit behind a ducking gain that dialogue, banter and the
 * heaviest combat hits pull down, so a line of Ignis explaining the plan is
 * never buried under a string section. Two convolution reverbs run: a long hall
 * for score and ambience, and a short room for SFX whose impulse response is
 * swapped when the player moves between outdoors / interior / cave.
 */

/** Reverb characters, all synthesised (see Dsp.impulseResponse). */
const SPACES = {
  outdoor: { seconds: 1.1, decay: 3.6, predelay: 0.020, damp: 0.62, seed: 11,
    early: [[0.031, 0.20], [0.058, 0.15], [0.091, 0.11], [0.140, 0.07]] },
  canyon: { seconds: 2.0, decay: 2.4, predelay: 0.045, damp: 0.40, seed: 23,
    early: [[0.048, 0.36], [0.093, 0.28], [0.151, 0.21], [0.223, 0.13], [0.310, 0.08]] },
  interior: { seconds: 0.85, decay: 3.0, predelay: 0.007, damp: 0.55, seed: 31,
    early: [[0.007, 0.44], [0.013, 0.33], [0.021, 0.27], [0.033, 0.19], [0.049, 0.12]] },
  cave: { seconds: 2.6, decay: 1.9, predelay: 0.030, damp: 0.30, seed: 47,
    early: [[0.026, 0.38], [0.055, 0.31], [0.088, 0.26], [0.132, 0.20], [0.190, 0.14]] },
  hall: { seconds: 2.1, decay: 2.3, predelay: 0.018, damp: 0.42, seed: 59,
    early: [[0.015, 0.30], [0.027, 0.24], [0.043, 0.19], [0.066, 0.14], [0.098, 0.09]] },
};

export const BUSES = ['music', 'sfx', 'amb', 'ui', 'voice'];

/**
 * Default trim per bus, before the user's own volume sliders.
 *
 * Deliberately conservative: the programme should sit around -20 dBFS RMS so
 * the limiter is idle most of the time and a boss cue can actually be louder
 * than a field cue. A hot mix that is always against the limiter has no
 * dynamics left to spend, which is the thing an adaptive score exists to do.
 */
const BUS_TRIM = { music: 0.13, sfx: 0.32, amb: 0.20, ui: 0.24, voice: 0.55 };

export class AudioGraph {
  _duckDepth!: number;
  _duckUntil!: number;
  _live!: any[];
  _pendingReap!: any[];
  _preMuteVolume!: number;
  _spaceSwap!: any;
  bus!: any;
  ctx!: BaseAudioContext;
  dcBlock!: BiquadFilterNode;
  dropped!: number;
  duckGain!: GainNode;
  glue!: DynamicsCompressorNode;
  hasParamListener!: boolean;
  hrtfLive!: number;
  limiter!: DynamicsCompressorNode;
  master!: GainNode;
  maxVoices!: any;
  muted!: boolean;
  nodesFreed!: number;
  nodesMade!: number;
  offline!: boolean;
  peakVoices!: number;
  revLong!: ConvolverNode;
  revLongGain!: GainNode;
  revShort!: ConvolverNode;
  revShortGain!: GainNode;
  saturator!: WaveShaperNode;
  sendLong!: GainNode;
  sendShort!: GainNode;
  space!: string;
  voices!: number;
  volume!: any;
  /**
   * @param {object} [o]
   * */
  constructor(ctx: BaseAudioContext, o: { offline?: boolean, maxVoices?: any, masterVolume?: any } = {}) {
    this.ctx = ctx;
    this.offline = !!o.offline;

    /** @type {{end:number}[]} slots held by voices that have not finished yet */
    this._live = [];
    /** @type {object[]} teardowns waiting on `onended`, swept as a backstop */
    this._pendingReap = [];
    /** Live voice count, refreshed on every `take`. */
    this.voices = 0;
    /** HRTF panners in flight — each is a convolution, so they are rationed. */
    this.hrtfLive = 0;
    /** High-water mark, reported by the verification harness. */
    this.peakVoices = 0;
    /** Total nodes we have created, and how many have been released. */
    this.nodesMade = 0;
    this.nodesFreed = 0;
    /** Hard cap; requests past it are dropped rather than allowed to crackle. */
    this.maxVoices = o.maxVoices ?? 64;
    this.dropped = 0;

    const master = ctx.createGain();
    master.gain.value = o.masterVolume ?? 0.95;
    this.master = master;

    // Final safety net: a limiter, then a soft saturator. Between them nothing
    // reaches the DAC above 0 dBFS even when Armiger lands during a storm.
    const sat = ctx.createWaveShaper();
    sat.curve = softClipCurve(3);
    sat.oversample = '2x';
    this.saturator = sat;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2.0;
    limiter.knee.value = 2;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.16;
    this.limiter = limiter;

    // Bus glue: slower, gentler, gives the mix a single sense of loudness.
    const glue = ctx.createDynamicsCompressor();
    // Deliberately gentle. A hard bus compressor would make the field cue and
    // a boss fight the same loudness, and the whole point of an adaptive score
    // is that they are not.
    glue.threshold.value = -5;
    glue.knee.value = 14;
    glue.ratio.value = 1.6;
    glue.attack.value = 0.012;
    glue.release.value = 0.30;
    this.glue = glue;

    // A DC blocker before the limiter. Brown noise (thunder, spell tails) and
    // asymmetric transients bias the signal; left in, that bias eats headroom
    // and shows up as a measurable DC offset on the render.
    const dcBlock = ctx.createBiquadFilter();
    dcBlock.type = 'highpass';
    dcBlock.frequency.value = 24;
    dcBlock.Q.value = 0.5;
    this.dcBlock = dcBlock;

    glue.connect(dcBlock);
    dcBlock.connect(limiter);
    limiter.connect(sat);
    sat.connect(master);
    master.connect(ctx.destination);

    /** Ducking gain that music + ambience pass through. */
    this.duckGain = ctx.createGain();
    this.duckGain.gain.value = 1;
    this.duckGain.connect(glue);

    /** @type {Record<string, GainNode>} */
    this.bus = {};
    /** @type {Record<string, number>} user-facing 0..1 volumes */
    this.volume = {};
    for (const name of BUSES) {
      const g = ctx.createGain();
      this.volume[name] = 1;
      g.gain.value = BUS_TRIM[name as keyof typeof BUS_TRIM];
      g.connect(name === 'music' || name === 'amb' ? this.duckGain : glue);
      this.bus[name] = g;
    }

    /* ------------------------------------------------------------ reverb */

    this.revLong = ctx.createConvolver();
    this.revLong.normalize = false;
    this.revLong.buffer = impulseResponse(ctx, SPACES.hall);
    this.revLongGain = ctx.createGain();
    this.revLongGain.gain.value = 0.9;
    this.revLong.connect(this.revLongGain);
    this.revLongGain.connect(this.duckGain);

    this.revShort = ctx.createConvolver();
    this.revShort.normalize = false;
    this.revShort.buffer = impulseResponse(ctx, SPACES.outdoor);
    this.revShortGain = ctx.createGain();
    this.revShortGain.gain.value = 1.0;
    this.revShort.connect(this.revShortGain);
    this.revShortGain.connect(this.glue);

    /** Sends. Music/ambience feed the hall; SFX/UI feed the room. */
    this.sendLong = ctx.createGain();
    this.sendLong.gain.value = 0.30;
    this.sendLong.connect(this.revLong);
    this.bus.music.connect(this.sendLong);
    this.bus.amb.connect(this.sendLong);

    this.sendShort = ctx.createGain();
    this.sendShort.gain.value = 0.20;
    this.sendShort.connect(this.revShort);
    this.bus.sfx.connect(this.sendShort);
    this.bus.voice.connect(this.sendShort);

    this.space = 'outdoor';
    this._spaceSwap = null;

    this._duckUntil = 0;
    this._duckDepth = 1;
    this.muted = false;
    this._preMuteVolume = master.gain.value;

    /* ------------------------------------------------------- listener */
    const L = ctx.listener;
    this.hasParamListener = !!(L && L.positionX);
    if (this.hasParamListener) {
      L.positionX.value = 0; L.positionY.value = 1.6; L.positionZ.value = 0;
      L.forwardX.value = 0; L.forwardY.value = 0; L.forwardZ.value = -1;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else if (L && L.setPosition) {
      L.setPosition(0, 1.6, 0);
      L.setOrientation(0, 0, -1, 0, 1, 0);
    }
  }

  get now() { return this.ctx.currentTime; }

  /* ----------------------------------------------------------- volumes */

  /**
   * Set a bus (or master) volume, 0..1.
   * @param [glide] seconds
   */
  setVolume(name: 'master' | 'music' | 'sfx' | 'amb' | 'ui' | 'voice', v: number, glide: number = 0.08) {
    const t = this.now;
    const val = clamp(v, 0, 1);
    if (name === 'master') {
      this._preMuteVolume = val * 0.95;
      if (!this.muted) this.master.gain.setTargetAtTime(val * 0.95, t, glide);
      return;
    }
    const bus = this.bus[name];
    if (!bus) return;
    this.volume[name] = val;
    bus.gain.setTargetAtTime(BUS_TRIM[name] * val, t, glide);
  }

  /** @param [on] toggles when omitted */
  setMuted(on?: boolean) {
    this.muted = on === undefined ? !this.muted : !!on;
    this.master.gain.setTargetAtTime(this.muted ? EPS : this._preMuteVolume, this.now, 0.02);
    return this.muted;
  }

  /**
   * Pull music + ambience down. Dialogue does this for its whole line; a big
   * impact does it for a fifth of a second, which is what makes a warp-strike
   * land instead of merely being loud.
   * @param depth 0..1 — 1 is no duck, 0.35 is a hard duck
   * @param hold seconds at depth
   * @param release seconds back to unity
   */
  duck(depth: number, hold: number = 0.2, release: number = 0.45, at: any = null) {
    const t = at ?? this.now;
    const end = t + hold + release;
    // A deeper duck already running wins; never let a footstep undo a line.
    if (end < this._duckUntil && depth > this._duckDepth) return;
    this._duckUntil = end;
    this._duckDepth = depth;
    const g = this.duckGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(EPS, g.value), t);
    g.linearRampToValueAtTime(Math.max(EPS, depth), t + 0.035);
    g.setValueAtTime(Math.max(EPS, depth), t + 0.035 + hold);
    g.linearRampToValueAtTime(1, end);
  }

  /* ------------------------------------------------------------ spaces */

  /**
   * Cross-fade the short reverb to a different room.
   */
  setSpace(name: 'outdoor' | 'canyon' | 'interior' | 'cave') {
    if (!SPACES[name] || name === this.space) return;
    this.space = name;
    const ctx = this.ctx;
    const t = this.now;
    // Build the replacement on a second convolver and cross-fade, so the swap
    // does not chop the tail of whatever is currently ringing.
    const next = ctx.createConvolver();
    next.normalize = false;
    next.buffer = impulseResponse(ctx, SPACES[name]);
    const nextGain = ctx.createGain();
    nextGain.gain.setValueAtTime(EPS, t);
    nextGain.gain.linearRampToValueAtTime(1, t + 0.9);
    next.connect(nextGain);
    nextGain.connect(this.glue);
    this.sendShort.connect(next);

    const old = this.revShort;
    const oldGain = this.revShortGain;
    oldGain.gain.cancelScheduledValues(t);
    oldGain.gain.setValueAtTime(oldGain.gain.value, t);
    oldGain.gain.linearRampToValueAtTime(EPS, t + 0.9);

    this.revShort = next;
    this.revShortGain = nextGain;
    const drop = () => {
      try { this.sendShort.disconnect(old); } catch { /* already gone */ }
      try { old.disconnect(); oldGain.disconnect(); } catch { /* already gone */ }
    };
    if (this.offline) drop();
    else setTimeout(drop, 1200);
  }

  /** Reverb depth for music (0..1). Camp and interiors want a drier score. */
  setMusicReverb(v: number, glide = 1.2, at: number | null = null) {
    this.sendLong.gain.setTargetAtTime(clamp(v, 0, 1) * 0.5, at ?? this.now, glide);
  }

  /* ----------------------------------------------------------- voicing */

  /**
   * Ask for a voice slot.
   *
   * The budget is *time-based*, not callback-based: a voice occupies a slot
   * until its scheduled end, which is known the moment it is scheduled. Relying
   * on `onended` would work in the live game and fail completely in an
   * OfflineAudioContext, where nothing ends until the whole render is done —
   * which is exactly the bug the verification harness caught.
   *
   * @param [priority] 0..3, higher survives contention
   * @param [at] when the sound starts; defaults to now
   * @returns handle, or null when the budget is spent
   */
  take(priority: number = 1, at: number | null = null): {end:number} | null {
    const t = at ?? this.now;
    const live = this._compact(t);
    const headroom = this.maxVoices - live;
    if (headroom <= 0 || (headroom < 10 && priority < 1) || (headroom < 5 && priority < 2)) {
      this.dropped++;
      return null;
    }
    this.nodesMade++;
    // Provisional length; `reap` replaces it with the real scheduled end.
    const v = { end: t + 3 };
    this._live.push(v);
    if (this._live.length > this.peakVoices) this.peakVoices = this._live.length;
    return v;
  }

  /** Drop finished voices and return how many are still sounding at `t`. */
  _compact(t: number) {
    const e = this._live;
    let k = 0;
    for (let i = 0; i < e.length; i++) if (e[i].end > t) e[k++] = e[i];
    e.length = k;
    this.voices = k;
    return k;
  }

  /** Release a voice slot and tear its nodes down. */
  release(nodes: any, handle: any) {
    if (handle) handle.end = -1;
    this.nodesFreed++;
    if (nodes) for (const n of nodes) { try { n.disconnect(); } catch { /* ok */ } }
  }

  /**
   * Wire a one-shot's teardown to its last source. Everything synthesised in
   * this project goes through here — that is the leak check.
   * @param src the node whose `onended` fires last
   * @param nodes everything to disconnect
   * @param [end] scheduled end time, for the voice budget
   * @param [handle] the slot returned by `take`
   */
  reap(src: AudioScheduledSourceNode, nodes: AudioNode[], end?: number, handle?: {end:number}) {
    if (handle && end != null && end > 0) handle.end = end;
    const entry = { end: end ?? (this.now + 3), nodes, handle, done: false };
    this._pendingReap.push(entry);
    src.onended = () => this._finalise(entry);
  }

  _finalise(entry: any) {
    if (entry.done) return;
    entry.done = true;
    this.release(entry.nodes, entry.handle);
    entry.nodes = null;
  }

  /**
   * Force-release anything whose scheduled end is well past.
   *
   * `onended` is the normal path, but it is a main-thread event: it does not
   * fire while the context is suspended, it can be starved by a long frame, and
   * an offline render only delivers it after the whole render finishes. Without
   * this sweep the node graph grows for as long as any of those is true, which
   * is precisely the leak the verification harness caught.
   *
   */
  sweep(now: number = this.now) {
    const p = this._pendingReap;
    let k = 0;
    for (let i = 0; i < p.length; i++) {
      const e = p[i];
      if (e.done) continue;
      if (e.end + 1.0 < now) { this._finalise(e); continue; }
      p[k++] = e;
    }
    p.length = k;
    return k;
  }

  /* ---------------------------------------------------------- panning */

  /**
   * A positional node for a world-space source.
   * @param [o] {hrtf, refDistance, maxDistance, rolloff}
   */
  panner(pos: {x:number,y:number,z:number}, o: any = {}) {
    const ctx = this.ctx;
    const p = ctx.createPanner();
    // HRTF is a per-source convolution. It is worth it for the handful of
    // sounds the player is meant to locate, and unaffordable once the mix is
    // busy — where nobody could localise anything anyway.
    p.panningModel = (o.hrtf && this._live.length < 14) ? 'HRTF' : 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = o.refDistance ?? 5;
    p.maxDistance = o.maxDistance ?? 220;
    p.rolloffFactor = o.rolloff ?? 1.25;
    if (p.positionX) {
      p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z;
    } else {
      p.setPosition(pos.x, pos.y, pos.z);
    }
    return p;
  }

  /** Move the listener to the camera. Called once a frame. */
  setListener(pos: THREE.Vector3, forward: THREE.Vector3, up: THREE.Vector3) {
    const L = this.ctx.listener;
    if (!L) return;
    if (this.hasParamListener) {
      const t = this.now;
      // setTargetAtTime, not setValueAtTime: a hard cut of listener position
      // on a camera cut is an audible zipper.
      L.positionX.setTargetAtTime(pos.x, t, 0.02);
      L.positionY.setTargetAtTime(pos.y, t, 0.02);
      L.positionZ.setTargetAtTime(pos.z, t, 0.02);
      L.forwardX.setTargetAtTime(forward.x, t, 0.03);
      L.forwardY.setTargetAtTime(forward.y, t, 0.03);
      L.forwardZ.setTargetAtTime(forward.z, t, 0.03);
      L.upX.setTargetAtTime(up.x, t, 0.05);
      L.upY.setTargetAtTime(up.y, t, 0.05);
      L.upZ.setTargetAtTime(up.z, t, 0.05);
    } else if (L.setPosition) {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  /** Snapshot for the verification harness / debug overlay. */
  stats() {
    return {
      voices: this.voices,
      peakVoices: this.peakVoices,
      nodesMade: this.nodesMade,
      nodesFreed: this.nodesFreed,
      leaked: this.nodesMade - this.nodesFreed,
      pendingReap: this._pendingReap.length,
      dropped: this.dropped,
      space: this.space,
      muted: this.muted,
      volumes: { ...this.volume },
    };
  }

  /** Tear the whole graph down (context close is the caller's business). */
  dispose() {
    try { this.master.disconnect(); } catch { /* ok */ }
  }
}

export { SPACES };
