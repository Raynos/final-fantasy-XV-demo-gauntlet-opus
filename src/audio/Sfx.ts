import { noiseBuffer, hit, expTo, EPS, makeRng, clamp, ftom } from './Dsp.ts';
import type { RngFn } from './Dsp.ts';
import type { AudioGraph, MixBus, PanOpts, Vec3, VoiceSlot } from './Graph.ts';
import type { Instruments } from './Instruments.ts';

/**
 * The SFX bank — every non-musical sound in the game.
 *
 * Each entry is a short synthesis program built from three primitives (a noise
 * layer, a tone layer and an FM layer) assembled into a `Shot`. A Shot owns one
 * voice slot, one output gain, one optional panner, and reaps every node it
 * created when its longest source ends. Nothing here allocates a buffer per
 * play: the noise beds are made once and shared, and a play is a handful of
 * oscillators plus filters.
 *
 * Names are hierarchical — `swing:greatsword`, `impact:metal`, `voc:goblin:hurt`
 * — with the legacy short names (`hit`, `swing`, `warp`, `step`, `magic`, `ui`,
 * `parry`) kept working because other systems already call them.
 */

/* ------------------------------------------------------------ vocabulary */

/** Weapon classes the swing bank is written for. */
export type WeaponKind = 'sword' | 'greatsword' | 'polearm' | 'daggers' | 'firearm' | 'shield';
/** What a blow landed on. */
export type ImpactMaterial = 'flesh' | 'metal' | 'armour' | 'stone' | 'wood' | 'crystal' | 'ground';
/** Ground types, matching `Terrain.sampleMaterial().name`. */
export type SurfaceName = 'grass' | 'dirt' | 'sand' | 'gravel' | 'rock' | 'road' | 'water' | 'wood';
/** Creatures with a voice in the bank. */
export type SpeciesName = 'sabertusk' | 'goblin' | 'mt' | 'irongiant' | 'daemon';
/**
 * What a creature is saying. Spelled as a list rather than a union because
 * `asMood` narrows a runtime name against it, and a union and a list that can
 * disagree is exactly the drift this pass exists to remove. Same for the two
 * sets below; the rest are the keys of their own tables.
 */
export const VOCAL_MOODS = ['aggro', 'hurt', 'death', 'idle'] as const;
export type VocalMood = typeof VOCAL_MOODS[number];
/** Elemancy. Each is a different physical process, not a preset. */
export const SPELL_ELEMENTS = ['fire', 'ice', 'lightning'] as const;
export type SpellElement = typeof SPELL_ELEMENTS[number];
/** Menu and HUD cues. */
export const UI_CUES = ['move', 'confirm', 'cancel', 'open', 'close', 'error'] as const;
export type UiCue = typeof UI_CUES[number];

/**
 * Everything `Sfx.play` accepts.
 *
 * The first block places the shot in the mix and is understood by every
 * synthesis program; the rest are the per-sound knobs, which the hierarchical
 * name usually supplies instead (`impact:metal` sets `material`).
 */
export interface PlayOpts extends PanOpts {
  /** Linear gain on the shot's own output, ahead of the bus. */
  volume?: number;
  /** Absolute context time. Defaults to now; the offline render sets it. */
  at?: number;
  /** Extra short-reverb send, 0..1, on top of the bus send. */
  send?: number;
  /** Drop a repeat of the same name within this many seconds. `Sfx.play`. */
  minGap?: number;
  /** World position. Omit for a 2D sound. */
  pos?: Vec3;
  /** Land somewhere other than this shot's usual bus. */
  dest?: AudioNode;

  /** Weapon class (`swing`) or menu cue (`ui`) -- see `SwingOpts`/`UiOpts`. */
  kind?: WeaponKind | UiCue;
  /** What was struck. `impact`. */
  material?: ImpactMaterial;
  /** What was stepped on. `step`. */
  surface?: SurfaceName;
  /** Whose voice, and what it is saying. `vocal`. */
  species?: SpeciesName;
  mood?: VocalMood;
  /** `spell`. */
  element?: SpellElement;

  /** Size of the blow: scales body, transient and ring together. `impact`. */
  scale?: number;
  /** A blindside or a critical -- adds a sub and ducks the mix. `impact`. */
  crit?: boolean;
  /** Step in the combo ladder, 0..5. `combo`. */
  index?: number;
  /** Metres to the strike. `thunder`. */
  distance?: number;
  /** Running rather than walking. `step`. */
  run?: boolean;
  /** Body weight multiplier. `step`. */
  weight?: number;
}

/** `swing`, whose `kind` is a weapon rather than a menu cue. */
export type SwingOpts = PlayOpts & { kind?: WeaponKind };
/** `ui`, whose `kind` is a menu cue rather than a weapon. */
export type UiOpts = PlayOpts & { kind?: UiCue };

/** A filtered noise burst. */
interface NoiseOpts {
  dur?: number;
  type?: BiquadFilterType;
  Q?: number;
  /** Filter sweep, `f0` at the start to `f1` at the end. */
  f0?: number;
  f1?: number;
  gain?: number;
  /** Longer than ~4 ms gets a real attack ramp instead of an instant hit. */
  attack?: number;
  /** Which noise bed; the white one unless stated. */
  buffer?: AudioBuffer;
  rate?: number;
  /** Offset into the bed, so repeats are not identical. */
  offset?: number;
  loop?: boolean;
  /** Route somewhere other than the shot's own output. */
  to?: AudioNode;
}

/** A pitched tone with an optional glide and filter. */
interface ToneOpts {
  f0: number;
  f1?: number;
  /** Seconds to reach `f1`; the whole note unless stated. */
  glide?: number;
  dur?: number;
  gain?: number;
  type?: OscillatorType;
  attack?: number;
  filter?: BiquadFilterType;
  filterF?: number;
  filterQ?: number;
  to?: AudioNode;
}

/** Two-operator FM -- bells, clanks, anything metallic or crystalline. */
interface FmOpts {
  f0: number;
  f1?: number;
  dur?: number;
  gain?: number;
  /** Modulator frequency as a multiple of the carrier. Inharmonic = metallic. */
  ratio?: number;
  /** Modulation index, in units of the carrier frequency. */
  index?: number;
  /** How much of `dur` the index takes to fall away. */
  indexDecay?: number;
  modType?: OscillatorType;
  to?: AudioNode;
}

/** One formant: `[centre Hz, gain, Q]`. */
export type Formant = [number, number, number];
/** One pitch breakpoint: `[fraction of the note, Hz]`. */
export type PitchPoint = [number, number];

/** A formant-filtered buzz: a larynx is a buzzing source and a resonant tube. */
interface VoxOpts {
  f0: number;
  /** Where the pitch ends when there is no `pitch` contour. */
  f1?: number;
  dur?: number;
  gain?: number;
  type?: OscillatorType;
  pitch?: PitchPoint[];
  formants?: Formant[];
  /** Sub-audio amplitude modulation, Hz. A big animal's folds beat slowly. */
  growl?: number;
  /** Breath under the voice, 0..1. */
  rasp?: number;
  attack?: number;
  /** Fraction of the note held at full before the release. */
  hold?: number;
  /** Multiply every formant by this across the note. */
  formantSweep?: number;
  to?: AudioNode;
}

class Shot {
  ctx!: BaseAudioContext;
  handle!: VoiceSlot | null;
  /** The source that ends last; its `onended` tears the shot down. */
  last!: AudioScheduledSourceNode | null;
  lastEnd!: number;
  nodes!: AudioNode[];
  ok!: boolean;
  out!: GainNode;
  sfx!: Sfx;
  constructor(sfx: Sfx, o: PlayOpts, bus: MixBus, priority: number) {
    this.sfx = sfx;
    this.ctx = sfx.ctx;
    this.handle = sfx.graph.take(priority, o.at ?? sfx.now);
    this.ok = !!this.handle;
    if (!this.ok) return;
    this.nodes = [];
    this.last = null;
    this.lastEnd = -1;
    const g = this.ctx.createGain();
    g.gain.value = o.volume ?? 1;
    this.out = g;
    this.nodes.push(g);
    const graph = sfx.graph;
    const dest = o.dest ?? graph.bus[bus];
    if (o.pos) {
      const p = graph.panner(o.pos, o);
      g.connect(p);
      p.connect(dest);
      this.nodes.push(p);
    } else {
      g.connect(dest);
    }
    // Extra reverb for sounds that want to feel like they are in the world.
    if (o.send) {
      const s = this.ctx.createGain();
      s.gain.value = o.send;
      g.connect(s);
      s.connect(graph.sendShort);
      this.nodes.push(s);
    }
  }

  _track(src: AudioScheduledSourceNode, end: number) {
    this.nodes.push(src);
    if (end > this.lastEnd) { this.lastEnd = end; this.last = src; }
  }

  /** A filtered noise burst. */
  noise(t: number, o: NoiseOpts) {
    if (!this.ok) return this;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = o.buffer ?? this.sfx.white;
    src.playbackRate.value = o.rate ?? (0.85 + this.sfx.rng() * 0.3);
    if (o.loop) src.loop = true;
    const dur = o.dur ?? 0.15;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.Q.value = o.Q ?? 1.2;
    f.frequency.setValueAtTime(Math.max(20, o.f0 ?? 1200), t);
    if (o.f1 != null) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + dur);
    src.connect(f);
    this.nodes.push(f);
    const g = ctx.createGain();
    const a = o.attack ?? 0.002;
    if (a > 0.004) {
      g.gain.setValueAtTime(EPS, t);
      g.gain.exponentialRampToValueAtTime(Math.max(EPS, o.gain ?? 0.5), t + a);
      expTo(g.gain, EPS, t + dur);
    } else {
      hit(g.gain, t, o.gain ?? 0.5, dur);
    }
    f.connect(g);
    g.connect(o.to ?? this.out);
    this.nodes.push(g);
    src.start(t, o.offset ?? this.sfx.rng() * 1.5);
    src.stop(t + dur + 0.03);
    this._track(src, t + dur);
    return this;
  }

  /** A pitched tone with an optional glide. */
  tone(t: number, o: ToneOpts) {
    if (!this.ok) return this;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    const dur = o.dur ?? 0.2;
    osc.frequency.setValueAtTime(Math.max(1, o.f0), t);
    if (o.f1 != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + (o.glide ?? dur));
    const g = ctx.createGain();
    const a = o.attack ?? 0;
    if (a > 0.004) {
      g.gain.setValueAtTime(EPS, t);
      g.gain.exponentialRampToValueAtTime(Math.max(EPS, o.gain ?? 0.4), t + a);
      expTo(g.gain, EPS, t + dur);
    } else {
      hit(g.gain, t, o.gain ?? 0.4, dur);
    }
    let node: AudioNode = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter;
      f.frequency.value = o.filterF ?? 2000;
      f.Q.value = o.filterQ ?? 1;
      osc.connect(f); node = f;
      this.nodes.push(f);
    }
    node.connect(g);
    g.connect(o.to ?? this.out);
    this.nodes.push(g);
    osc.start(t);
    osc.stop(t + dur + 0.03);
    this._track(osc, t + dur);
    return this;
  }

  /** Two-operator FM — bells, clanks, magic, anything metallic or crystalline. */
  fm(t: number, o: FmOpts) {
    if (!this.ok) return this;
    const ctx = this.ctx;
    const dur = o.dur ?? 0.5;
    const car = ctx.createOscillator();
    car.type = 'sine';
    car.frequency.setValueAtTime(o.f0, t);
    if (o.f1 != null) car.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + dur);
    const mod = ctx.createOscillator();
    mod.type = o.modType ?? 'sine';
    mod.frequency.setValueAtTime(o.f0 * (o.ratio ?? 1.41), t);
    if (o.f1 != null) mod.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1 * (o.ratio ?? 1.41)), t + dur);
    const mg = ctx.createGain();
    hit(mg.gain, t, o.f0 * (o.index ?? 2), dur * (o.indexDecay ?? 0.3));
    mod.connect(mg); mg.connect(car.frequency);
    const g = ctx.createGain();
    hit(g.gain, t, o.gain ?? 0.4, dur);
    car.connect(g); g.connect(o.to ?? this.out);
    car.start(t); mod.start(t);
    car.stop(t + dur + 0.03); mod.stop(t + dur + 0.03);
    this.nodes.push(mod, mg, g);
    this._track(car, t + dur);
    return this;
  }

  /**
   * A formant-filtered buzz — the basis of every creature vocalisation. A
   * larynx is a buzzing source and a resonant tube; so is this.
   */
  vox(t: number, o: VoxOpts) {
    if (!this.ok) return this;
    const ctx = this.ctx;
    const dur = o.dur ?? 0.4;
    const src = ctx.createOscillator();
    src.type = o.type ?? 'sawtooth';
    const f = o.f0;
    src.frequency.setValueAtTime(f, t);
    for (const [k, v] of (o.pitch ?? [[1, o.f1 ?? f]] as PitchPoint[])) {
      src.frequency.exponentialRampToValueAtTime(Math.max(20, v), t + dur * k);
    }
    // Growl: amplitude-modulate the source at a sub-audio rate.
    let node: AudioNode = src;
    const sum = ctx.createGain();
    sum.gain.value = 1;
    this.nodes.push(sum);
    if (o.growl) {
      const lfo = ctx.createOscillator();
      lfo.type = 'sawtooth';
      lfo.frequency.setValueAtTime(o.growl, t);
      lfo.frequency.linearRampToValueAtTime(o.growl * 0.6, t + dur);
      const lg = ctx.createGain();
      lg.gain.value = 0.55;
      const dc = ctx.createGain();
      dc.gain.value = 1;
      lfo.connect(lg); lg.connect(sum.gain);
      lfo.start(t); lfo.stop(t + dur + 0.03);
      this.nodes.push(lfo, lg, dc);
    }
    node.connect(sum);
    node = sum;

    const mix = ctx.createGain();
    for (const [freq, amp, q] of (o.formants ?? DEFAULT_FORMANTS)) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(freq, t);
      if (o.formantSweep) bp.frequency.exponentialRampToValueAtTime(freq * o.formantSweep, t + dur);
      bp.Q.value = q;
      const bg = ctx.createGain();
      bg.gain.value = amp;
      node.connect(bp); bp.connect(bg); bg.connect(mix);
      this.nodes.push(bp, bg);
    }
    // Breath / rasp under the voice.
    if (o.rasp !== 0) {
      const n = ctx.createBufferSource();
      n.buffer = this.sfx.pink;
      const nf = ctx.createBiquadFilter();
      nf.type = 'bandpass';
      nf.frequency.value = (o.formants ? o.formants[0][0] : DEFAULT_FORMANTS[0][0]) * 2.4;
      nf.Q.value = 0.8;
      const ng = ctx.createGain();
      ng.gain.value = o.rasp ?? 0.35;
      n.connect(nf); nf.connect(ng); ng.connect(mix);
      n.start(t, this.sfx.rng() * 2);
      n.stop(t + dur + 0.03);
      this.nodes.push(n, nf, ng);
    }
    const g = ctx.createGain();
    const a = o.attack ?? 0.03;
    g.gain.setValueAtTime(EPS, t);
    g.gain.exponentialRampToValueAtTime(Math.max(EPS, o.gain ?? 0.5), t + a);
    g.gain.setValueAtTime(Math.max(EPS, o.gain ?? 0.5), t + dur * (o.hold ?? 0.5));
    expTo(g.gain, EPS, t + dur);
    mix.connect(g); g.connect(o.to ?? this.out);
    this.nodes.push(mix, g);
    src.start(t); src.stop(t + dur + 0.03);
    this._track(src, t + dur);
    return this;
  }

  /** Close the shot: schedules the teardown. Always call this. */
  done() {
    if (!this.ok) return false;
    if (!this.last) { this.sfx.graph.release(this.nodes, this.handle); return true; }
    this.sfx.graph.reap(this.last, this.nodes, this.lastEnd, this.handle);
    return true;
  }
}

/* ------------------------------------------------------------------------ */

export class Sfx {
  played!: number;
  /** Cue name -> the time it last played, for the de-dupe in `play`. */
  _recent!: Map<string, number>;
  brown!: AudioBuffer;
  ctx!: BaseAudioContext;
  graph!: AudioGraph;
  inst!: Instruments;
  pink!: AudioBuffer;
  rng!: RngFn;
  white!: AudioBuffer;
  constructor(graph: import('./Graph.ts').AudioGraph, inst: import('./Instruments.ts').Instruments) {
    this.graph = graph;
    this.inst = inst;
    this.ctx = graph.ctx;
    this.rng = makeRng(0x5F0C71);
    this.white = noiseBuffer(this.ctx, 2.0, 'white', 1234);
    this.pink = noiseBuffer(this.ctx, 2.5, 'pink', 5678);
    this.brown = noiseBuffer(this.ctx, 4.0, 'brown', 9012);
    /** Names played this frame, so a burst of identical events is one sound. */
    this._recent = new Map();
    this.played = 0;
  }

  get now() { return this.ctx.currentTime; }

  /**
   * Play a sound.
   * @param name e.g. `swing:sword`, `impact:metal`, `voc:goblin:hurt`
   * @param [pos] world position, or null for 2D
   */
  play(name: string, pos?: Vec3 | null, o: PlayOpts = {}) {
    const t = Math.max(0, o.at ?? this.now);
    const opt = pos ? { ...o, pos } : { ...o };
    // De-dupe: eight enemies hit in one frame must not be eight identical
    // transients stacking into a click.
    const key = name;
    const prev = this._recent.get(key);
    if (prev != null && t - prev < (o.minGap ?? 0.012)) return false;
    this._recent.set(key, t);
    if (this._recent.size > 96) this._recent.clear();

    const fn = this._route(name);
    if (!fn) return false;
    this.played++;
    return fn.call(this, t, opt);
  }

  /**
   * Resolve a (possibly legacy) name to a synthesis program.
   *
   * The tail of the name is a *runtime* string -- `swing:${d.weapon}` is built
   * from combat data -- so this is the one place it becomes one of the closed
   * sets, through the `as*` guards at the bottom of the file. A name the bank
   * does not know falls back to that set's default, exactly as the old
   * `TABLE[name] || TABLE.default` lookups did inside each program.
   */
  _route(name: string): ((t: number, o: PlayOpts) => boolean) | null {
    const parts = name.split(':');
    const head = parts[0];
    switch (head) {
      case 'swing': return (t, o) => this.swing(t, { ...o, kind: asWeaponKind(o.kind ?? parts[1]) });
      case 'impact': return (t, o) => this.impact(t, { ...o, material: asMaterial(o.material ?? parts[1]) });
      case 'hit': return (t, o) => this.impact(t, { ...o, material: o.material ?? 'flesh' });
      case 'step': return (t, o) => this.step(t, { ...o, surface: asSurface(o.surface ?? parts[1]) });
      case 'voc': return (t, o) => this.vocal(t, {
        ...o, species: asSpecies(o.species ?? parts[1]), mood: asMood(o.mood ?? parts[2]),
      });
      case 'spell':
      case 'magic': return (t, o) => this.spell(t, { ...o, element: asElement(o.element ?? parts[1]) });
      case 'ui': return (t, o) => this.ui(t, { ...o, kind: asUiCue(o.kind ?? parts[1]) });
      case 'warp': return (t, o) => (parts[1] === 'impact' ? this.warpImpact(t, o) : this.warpStart(t, o));
      case 'parry': return (t, o) => this.parry(t, o);
      case 'armiger': return (t, o) => this.armiger(t, o);
      case 'armigerHit': return (t, o) => this.armigerHit(t, o);
      case 'thunder': return (t, o) => this.thunder(t, o);
      case 'gunshot': return (t, o) => this.gunshot(t, o);
      case 'cloth': return (t, o) => this.cloth(t, o);
      case 'grunt': return (t, o) => this.grunt(t, o);
      case 'death': return (t, o) => this.playerDeath(t, o);
      case 'stagger': return (t, o) => this.stagger(t, o);
      case 'link': return (t, o) => this.link(t, o);
      case 'lockon': return (t, o) => this.lockon(t, o);
      case 'stasis': return (t, o) => this.stasis(t, o);
      case 'combo': return (t, o) => this.comboTick(t, o);
      case 'levelup': return (t, o) => this.levelUp(t, o);
      case 'quest': return (t, o) => this.questSting(t, o);
      case 'item': return (t, o) => this.itemPickup(t, o);
      case 'materialise': return (t, o) => this.materialise(t, o);
      case 'splash': return (t, o) => this.splash(t, o);
      case 'reel': return (t, o) => this.reelClick(t, o);
      case 'line': return (t, o) => this.lineStrain(t, o);
      case 'cast': return (t, o) => this.castWhirr(t, o);
      case 'howl': return (t, o) => this.daemonHowl(t, o);
      default: return null;
    }
  }

  /* ------------------------------------------------------------ weapons */

  /** Per-class weapon swings. Mass is mostly in the length and the low end. */
  swing(t: number, o: SwingOpts = {}) {
    const K = SWING[o.kind ?? 'sword'];
    const s = new Shot(this, { send: 0.14, ...o }, 'sfx', 2);
    if (!s.ok) return false;
    for (let i = 0; i < K.strokes; i++) {
      const st = t + i * K.gap;
      s.noise(st, {
        dur: K.dur, type: 'bandpass', Q: K.Q,
        f0: K.f0 * (0.92 + this.rng() * 0.16), f1: K.f1,
        gain: 0.55 * (i === 0 ? 1 : 0.8), attack: K.dur * 0.22,
      });
      // Air pressure under a heavy blade.
      if (K.body) s.tone(st + 0.01, { f0: K.body, f1: K.body * 0.55, dur: K.dur * 1.2, gain: 0.22, type: 'sine' });
      // Edge whistle: the tip moving faster than the rest of the blade.
      s.noise(st + K.dur * 0.35, {
        dur: K.dur * 0.5, type: 'bandpass', Q: 7,
        f0: K.f0 * 2.6, f1: K.f0 * 1.1, gain: 0.16,
      });
    }
    return s.done();
  }

  /** Impact, coloured by what was struck. */
  impact(t: number, o: PlayOpts = {}) {
    const M = MATERIAL[o.material ?? 'flesh'];
    const scale = o.scale ?? 1;
    const s = new Shot(this, { send: M.send, ...o }, 'sfx', 3);
    if (!s.ok) return false;
    // Body: the low thump that gives the hit its weight.
    if (M.body) {
      s.tone(t, {
        f0: M.body * 2.4 * scale, f1: M.body * 0.65, dur: M.bodyDur * scale,
        gain: 0.85 * scale, type: 'sine', glide: M.bodyDur * 0.5,
      });
    }
    // Transient: the character of the surface.
    s.noise(t, {
      dur: M.crackDur, type: M.filter, Q: M.Q, f0: M.f0, f1: M.f1,
      gain: M.crack * scale, buffer: M.pink ? this.pink : this.white,
    });
    // Ring: metal and crystal keep sounding after the contact.
    if (M.ring) {
      s.fm(t, {
        f0: M.ring * (0.94 + this.rng() * 0.12), ratio: M.ratio ?? 1.7,
        index: 3.2, indexDecay: 0.16, dur: M.ringDur, gain: 0.3 * scale,
      });
    }
    if (o.crit || scale > 1.35) {
      // A crit gets an extra sub and a brief duck so it lands in the mix.
      s.tone(t, { f0: 90, f1: 42, dur: 0.35, gain: 0.7, type: 'sine' });
      this.graph.duck(0.72, 0.08, 0.3, t);
    }
    return s.done();
  }

  /** Firearm: a crack, a body thump and a tail that the space answers. */
  gunshot(t: number, o: PlayOpts = {}) {
    const s = new Shot(this, { send: 0.5, ...o }, 'sfx', 3);
    if (!s.ok) return false;
    s.noise(t, { dur: 0.035, type: 'highpass', f0: 2600, gain: 1.0, Q: 0.5 });
    s.noise(t, { dur: 0.14, type: 'bandpass', f0: 900, f1: 260, Q: 0.8, gain: 0.75 });
    s.tone(t, { f0: 180, f1: 55, dur: 0.18, gain: 0.6, type: 'triangle' });
    s.noise(t + 0.03, { dur: 0.5, type: 'lowpass', f0: 1400, f1: 300, gain: 0.16, buffer: this.brown });
    this.graph.duck(0.8, 0.04, 0.2, t);
    return s.done();
  }

  /* --------------------------------------------------------------- warp */

  /** The wind-up: a sub drop and a rising crystal shimmer. */
  warpStart(t: number, o: PlayOpts = {}) {
    const s = new Shot(this, { send: 0.3, ...o }, 'sfx', 3);
    if (!s.ok) return false;
    s.noise(t, { dur: 0.30, type: 'bandpass', Q: 1.6, f0: 280, f1: 5200, gain: 0.55, attack: 0.06 });
    for (let i = 0; i < 4; i++) {
      const f = 620 + i * 410;
      s.tone(t + i * 0.012, {
        f0: f, f1: f * 3.1, dur: 0.34, gain: 0.16 / (1 + i * 0.3), type: 'triangle', attack: 0.03,
      });
    }
    s.tone(t, { f0: 150, f1: 44, dur: 0.28, gain: 0.4, type: 'sine' });
    return s.done();
  }

  /** The landing: a hard impact plus shattering crystal. */
  warpImpact(t: number, o: PlayOpts = {}) {
    const s = new Shot(this, { send: 0.42, ...o }, 'sfx', 3);
    if (!s.ok) return false;
    s.tone(t, { f0: 210, f1: 38, dur: 0.45, gain: 1.0, type: 'sine', glide: 0.14 });
    s.noise(t, { dur: 0.09, type: 'highpass', f0: 1800, gain: 0.8 });
    s.noise(t, { dur: 0.3, type: 'bandpass', f0: 620, f1: 180, Q: 0.9, gain: 0.5 });
    for (let i = 0; i < 5; i++) {
      s.fm(t + this.rng() * 0.05, {
        f0: 1400 + this.rng() * 2400, ratio: 1.87, index: 2.6, indexDecay: 0.2,
        dur: 0.5 + this.rng() * 0.5, gain: 0.14,
      });
    }
    this.graph.duck(0.6, 0.1, 0.42, t);
    return s.done();
  }

  /** The blade assembling out of blue light. */
  materialise(t: number, o: PlayOpts = {}) {
    const s = new Shot(this, { send: 0.32, ...o }, 'sfx', 2);
    if (!s.ok) return false;
    for (let i = 0; i < 4; i++) {
      const f = 900 + i * 620;
      s.tone(t + i * 0.03, { f0: f * 0.55, f1: f, dur: 0.42, gain: 0.13, type: 'triangle', attack: 0.05 });
    }
    s.noise(t, { dur: 0.34, type: 'highpass', f0: 3600, gain: 0.22, attack: 0.09 });
    s.fm(t + 0.05, { f0: 2100, ratio: 1.5, index: 1.6, dur: 0.7, gain: 0.14 });
    return s.done();
  }

  /** Perfect parry: a bright ring, a shimmer and a hole punched in the mix. */
  parry(t: number, o: PlayOpts = {}) {
    const s = new Shot(this, { send: 0.55, ...o }, 'sfx', 3);
    if (!s.ok) return false;
    s.noise(t, { dur: 0.05, type: 'highpass', f0: 4200, gain: 0.9 });
    s.fm(t, { f0: 2350, ratio: 2.41, index: 4.5, indexDecay: 0.1, dur: 1.5, gain: 0.42 });
    s.fm(t + 0.004, { f0: 3520, ratio: 1.73, index: 3.0, indexDecay: 0.12, dur: 1.1, gain: 0.24 });
    s.tone(t, { f0: 160, f1: 60, dur: 0.3, gain: 0.55, type: 'sine' });
    // The rising shimmer that plays under the slow-motion counter window.
    for (let i = 0; i < 3; i++) {
      s.tone(t + 0.04 + i * 0.05, {
        f0: 1200 + i * 700, f1: (1200 + i * 700) * 2.4, dur: 0.75, gain: 0.1, type: 'sine', attack: 0.12,
      });
    }
    this.graph.duck(0.45, 0.18, 0.7, t);
    return s.done();
  }

  /** Armiger: thirteen phantom weapons deciding to exist at once. */
  armiger(t: number, o: PlayOpts = {}) {
    const s = new Shot(this, { send: 0.6, volume: 1.1, ...o }, 'sfx', 3);
    if (!s.ok) return false;
    // A rising swell into a crystalline chord.
    s.noise(t, { dur: 0.9, type: 'bandpass', Q: 0.8, f0: 300, f1: 4800, gain: 0.5, attack: 0.6 });
    const chord = [0, 7, 12, 15, 19, 24];
    for (let i = 0; i < chord.length; i++) {
      s.fm(t + 0.55 + i * 0.018, {
        f0: ftom(220, chord[i]), ratio: 2.0, index: 2.2, indexDecay: 0.22,
        dur: 2.6 - i * 0.15, gain: 0.2 / (1 + i * 0.18),
      });
    }
    s.tone(t + 0.5, { f0: 120, f1: 33, dur: 1.4, gain: 0.8, type: 'sine' });
    s.noise(t + 0.55, { dur: 1.6, type: 'highpass', f0: 5200, gain: 0.22, buffer: this.pink });
    this.graph.duck(0.5, 0.5, 1.4, t);
    return s.done();
  }

  /** One phantom weapon striking home during the Armiger burst. */
  armigerHit(t: number, o: PlayOpts = {}) {
    const s = new Shot(this, { send: 0.3, ...o }, 'sfx', 1);
    if (!s.ok) return false;
    s.noise(t, { dur: 0.11, type: 'bandpass', f0: 2600, f1: 700, Q: 1.6, gain: 0.5 });
    s.fm(t, { f0: 1500 + this.rng() * 900, ratio: 1.87, index: 2.4, dur: 0.5, gain: 0.2 });
    s.tone(t, { f0: 190, f1: 60, dur: 0.16, gain: 0.4, type: 'sine' });
    return s.done();
  }

  /* -------------------------------------------------------------- magic */

  /** Elemancy. Each element is a different physical process, not a preset. */
  spell(t: number, o: PlayOpts = {}) {
    const s = new Shot(this, { send: 0.4, ...o }, 'sfx', 3);
    if (!s.ok) return false;
    const el = o.element ?? 'fire';
    if (el === 'fire') {
      // Ignition whoosh, then combustion roar, then the boom.
      s.noise(t, { dur: 0.5, type: 'bandpass', Q: 0.7, f0: 420, f1: 2600, gain: 0.5, attack: 0.14 });
      s.noise(t + 0.16, { dur: 1.4, type: 'lowpass', f0: 2200, f1: 400, gain: 0.55, buffer: this.brown, attack: 0.12 });
      s.tone(t + 0.18, { f0: 140, f1: 34, dur: 0.9, gain: 0.9, type: 'sine' });
      for (let i = 0; i < 6; i++) {
        s.noise(t + 0.2 + this.rng() * 0.7, { dur: 0.05, type: 'bandpass', f0: 1800 + this.rng() * 3000, Q: 4, gain: 0.18 });
      }
    } else if (el === 'ice') {
      // Crystallisation: a rising glassy cluster, then a shatter.
      s.noise(t, { dur: 0.4, type: 'highpass', f0: 3000, gain: 0.32, attack: 0.2 });
      for (let i = 0; i < 5; i++) {
        s.fm(t + i * 0.035, {
          f0: 1800 + i * 640, ratio: 2.73, index: 2.0, indexDecay: 0.18,
          dur: 1.4 - i * 0.12, gain: 0.2 / (1 + i * 0.2),
        });
      }
      s.tone(t + 0.32, { f0: 110, f1: 42, dur: 0.7, gain: 0.65, type: 'sine' });
      for (let i = 0; i < 9; i++) {
        s.noise(t + 0.34 + this.rng() * 0.45, { dur: 0.04, type: 'bandpass', f0: 4200 + this.rng() * 4000, Q: 6, gain: 0.2 });
      }
    } else {
      // Lightning: a gated crack, an arc buzz, then a rolling tail.
      s.noise(t, { dur: 0.03, type: 'highpass', f0: 5000, gain: 1.0 });
      for (let i = 0; i < 5; i++) {
        s.noise(t + 0.02 + i * 0.028 + this.rng() * 0.012, {
          dur: 0.02, type: 'bandpass', f0: 2400 + this.rng() * 4000, Q: 2, gain: 0.55 - i * 0.08,
        });
      }
      s.tone(t, { f0: 260, f1: 40, dur: 0.5, gain: 0.7, type: 'sawtooth', filter: 'lowpass', filterF: 900 });
      s.noise(t + 0.06, { dur: 1.5, type: 'lowpass', f0: 900, f1: 180, gain: 0.35, buffer: this.brown });
    }
    this.graph.duck(0.68, 0.2, 0.7, t);
    return s.done();
  }

  /* ---------------------------------------------------------- creatures */

  /**
   * Enemy vocalisations. Body size sets the pitch and the formants; the mood
   * sets the contour.
   */
  vocal(t: number, o: PlayOpts = {}) {
    const V = SPECIES[o.species ?? 'goblin'];
    const mood = o.mood ?? 'aggro';
    const s = new Shot(this, { send: 0.3, hrtf: true, ...o }, 'sfx', 2);
    if (!s.ok) return false;
    const jitter = 0.92 + this.rng() * 0.16;
    // The call is read inside the branch, not before it: a machine's call is a
    // swept tone and a throated one is a pitch contour, and they share no
    // fields worth pretending are the same.
    if (V.machine) {
      // MT soldiers do not have a larynx: servo whine, ring-modulated buzz.
      const M = V[mood];
      s.tone(t, { f0: M.f0 * jitter, f1: M.f1 * jitter, dur: M.dur, gain: 0.3, type: 'square', filter: 'bandpass', filterF: 1400, filterQ: 5 });
      s.noise(t, { dur: M.dur, type: 'bandpass', f0: 2400, f1: 900, Q: 3, gain: 0.28, attack: 0.02 });
      if (mood === 'death') {
        s.noise(t + M.dur * 0.6, { dur: 0.5, type: 'bandpass', f0: 3200, f1: 400, Q: 1.5, gain: 0.5 });
        s.fm(t + M.dur * 0.6, { f0: 320, ratio: 1.63, index: 3.5, dur: 0.9, gain: 0.35 });
      }
    } else {
      const M = V[mood];
      s.vox(t, {
        f0: M.f0 * jitter, dur: M.dur, gain: M.gain,
        pitch: M.pitch, formants: V.formants, growl: V.growl,
        rasp: V.rasp, attack: M.attack ?? 0.03, hold: M.hold,
        formantSweep: M.formantSweep,
      });
      if (V.sub) s.tone(t, { f0: V.sub * jitter, f1: V.sub * 0.7, dur: M.dur, gain: 0.5, type: 'sine', attack: 0.04 });
    }
    return s.done();
  }

  /** The howl that tells you it is past nineteen hundred and you are outside. */
  daemonHowl(t: number, o: PlayOpts = {}) {
    const s = new Shot(this, { send: 0.85, volume: 0.55, ...o }, 'amb', 1);
    if (!s.ok) return false;
    const f = 62 + this.rng() * 26;
    s.vox(t, {
      f0: f, dur: 2.6, gain: 0.5, attack: 0.5, hold: 0.55,
      pitch: [[0.3, f * 1.6], [0.6, f * 1.45], [1, f * 0.8]],
      formants: [[240, 1, 5], [640, 0.55, 7], [1500, 0.18, 9]],
      growl: 22, rasp: 0.5,
    });
    s.tone(t, { f0: f * 0.5, f1: f * 0.4, dur: 2.8, gain: 0.35, type: 'sine', attack: 0.6 });
    return s.done();
  }

  /* ------------------------------------------------------------- player */

  /**
   * Footstep. Surface names match `Terrain.sampleMaterial().name`.
   * @param o {surface, run, weight}
   */
  step(t: number, o: PlayOpts = {}) {
    const S = SURFACE[o.surface ?? 'dirt'];
    const run = !!o.run;
    const w = (o.weight ?? 1) * (run ? 1.25 : 0.85);
    const s = new Shot(this, { send: 0.12, volume: (o.volume ?? 1) * w, ...o }, 'sfx', 1);
    if (!s.ok) return false;
    const r = this.rng();
    if (S.grains) {
      // Loose ground is many small contacts, not one.
      for (let i = 0; i < S.grains; i++) {
        s.noise(t + i * 0.006 * (1 + r), {
          dur: 0.03 + this.rng() * 0.03, type: 'bandpass', Q: 2.4,
          f0: S.f0 * (0.7 + this.rng() * 0.9), gain: 0.28 / (1 + i * 0.4),
        });
      }
    }
    s.noise(t, {
      dur: S.dur * (run ? 0.8 : 1), type: S.filter || 'bandpass', Q: S.Q ?? 1.1,
      f0: S.f0 * (0.9 + r * 0.2), f1: S.f1, gain: S.crack * (run ? 1.2 : 1),
      buffer: S.pink ? this.pink : this.white,
    });
    if (S.thud) {
      s.tone(t, { f0: S.thud * (0.92 + r * 0.16), f1: S.thud * 0.55, dur: S.thudDur ?? 0.09, gain: 0.5 * w, type: 'sine' });
    }
    return s.done();
  }

  /** Cloth and gear movement — quiet, but its absence is loud. */
  cloth(t: number, o: PlayOpts = {}) {
    const s = new Shot(this, { volume: (o.volume ?? 1) * 0.5, ...o }, 'sfx', 0);
    if (!s.ok) return false;
    s.noise(t, {
      dur: 0.13 + this.rng() * 0.08, type: 'bandpass', Q: 0.9,
      f0: 1500 + this.rng() * 900, f1: 700, gain: 0.16, attack: 0.03, buffer: this.pink,
    });
    return s.done();
  }

  /** Player takes a hit. */
  grunt(t: number, o: PlayOpts = {}) {
    const s = new Shot(this, { volume: 0.9, ...o }, 'voice', 3);
    if (!s.ok) return false;
    const f = 132 * (0.94 + this.rng() * 0.12);
    s.vox(t, {
      f0: f, dur: 0.30, gain: 0.55, attack: 0.012, hold: 0.3,
      pitch: [[0.25, f * 1.15], [1, f * 0.72]],
      formants: [[600, 1, 6], [1220, 0.42, 8], [2500, 0.12, 9]],
      rasp: 0.28,
    });
    this.graph.duck(0.8, 0.06, 0.25, t);
    return s.done();
  }

  playerDeath(t: number, o: PlayOpts = {}) {
    const s = new Shot(this, { volume: 1, ...o }, 'voice', 3);
    if (!s.ok) return false;
    const f = 122;
    s.vox(t, {
      f0: f, dur: 1.1, gain: 0.6, attack: 0.02, hold: 0.35,
      pitch: [[0.2, f * 1.2], [1, f * 0.55]],
      formants: [[560, 1, 5], [1100, 0.45, 7], [2400, 0.14, 9]],
      rasp: 0.4,
    });
    this.graph.duck(0.35, 0.6, 1.6, t);
    return s.done();
  }

  /** Enemy poise broken — the sound of something losing its footing. */
  stagger(t: number, o: PlayOpts = {}) {
    const s = new Shot(this, { send: 0.35, ...o }, 'sfx', 2);
    if (!s.ok) return false;
    s.tone(t, { f0: 320, f1: 84, dur: 0.55, gain: 0.55, type: 'triangle', filter: 'lowpass', filterF: 1400 });
    s.noise(t, { dur: 0.4, type: 'bandpass', f0: 900, f1: 260, Q: 0.8, gain: 0.35, buffer: this.pink });
    return s.done();
  }

  /** Party link-strike: an ally arriving. */
  link(t: number, o: PlayOpts = {}) {
    const s = new Shot(this, { send: 0.3, ...o }, 'sfx', 2);
    if (!s.ok) return false;
    s.noise(t, { dur: 0.22, type: 'bandpass', Q: 1.4, f0: 500, f1: 3400, gain: 0.42, attack: 0.05 });
    s.fm(t + 0.14, { f0: 880, ratio: 1.5, index: 2.6, dur: 0.7, gain: 0.26 });
    s.tone(t + 0.14, { f0: 170, f1: 55, dur: 0.3, gain: 0.5, type: 'sine' });
    return s.done();
  }

  lockon(t: number, o: PlayOpts = {}) {
    const s = new Shot(this, { volume: 0.7, ...o }, 'ui', 1);
    if (!s.ok) return false;
    s.tone(t, { f0: 1760, dur: 0.06, gain: 0.28, type: 'sine' });
    s.tone(t + 0.05, { f0: 2640, dur: 0.1, gain: 0.2, type: 'sine' });
    return s.done();
  }

  /** Out of MP — the world going quiet and cold for a second. */
  stasis(t: number, o: PlayOpts = {}) {
    const s = new Shot(this, { send: 0.4, ...o }, 'sfx', 2);
    if (!s.ok) return false;
    s.tone(t, { f0: 420, f1: 90, dur: 1.1, gain: 0.35, type: 'triangle', filter: 'lowpass', filterF: 900 });
    s.noise(t, { dur: 0.9, type: 'lowpass', f0: 1200, f1: 240, gain: 0.22, buffer: this.pink });
    this.graph.duck(0.7, 0.25, 0.9, t);
    return s.done();
  }

  /** A rising pitch per combo step — the ladder that makes a combo feel long. */
  comboTick(t: number, o: PlayOpts = {}) {
    const s = new Shot(this, { volume: 0.4, ...o }, 'ui', 0);
    if (!s.ok) return false;
    const step = clamp(o.index ?? 0, 0, 5);
    s.tone(t, { f0: ftom(1320, step * 2), dur: 0.05, gain: 0.12, type: 'sine' });
    return s.done();
  }

  /* ------------------------------------------------------------ weather */

  /**
   * Thunder. Distance is the whole design: near strikes are a crack plus a
   * rumble, far strikes are only the rumble, and everything in between gets
   * darker and longer as it travels.
   * @param o {distance metres}
   */
  thunder(t: number, o: PlayOpts = {}) {
    const d = clamp(o.distance ?? 900, 60, 3400);
    const near = 1 - d / 3400;
    const s = new Shot(this, { send: 0.7, volume: (o.volume ?? 1) * (0.45 + 0.75 * near), ...o }, 'amb', 3);
    if (!s.ok) return false;
    if (near > 0.55) {
      // The crack of the return stroke.
      s.noise(t, { dur: 0.05, type: 'highpass', f0: 2600 * near, gain: 0.9 * near });
      s.noise(t + 0.02, { dur: 0.35, type: 'bandpass', f0: 1400, f1: 300, Q: 0.6, gain: 0.7 * near });
    }
    // The rumble: brown noise, a long swell, and a wobble as the wavefront
    // reflects off the ground and the cloud base.
    const len = 2.2 + 4.2 * (1 - near);
    s.noise(t + 0.05, {
      dur: len, type: 'lowpass', f0: 260 + 700 * near, f1: 70 + 120 * near,
      gain: 0.85, attack: 0.18 + 0.5 * (1 - near), buffer: this.brown, rate: 0.6 + 0.3 * near,
    });
    s.noise(t + 0.3 + this.rng() * 0.5, {
      dur: len * 0.7, type: 'lowpass', f0: 180, f1: 60, gain: 0.5,
      attack: 0.4, buffer: this.brown, rate: 0.5,
    });
    s.tone(t + 0.06, { f0: 44, f1: 26, dur: len * 0.6, gain: 0.5 * near, type: 'sine', attack: 0.25 });
    this.graph.duck(0.75, 0.4, 1.6, t);
    return s.done();
  }

  /** Something entering water. */
  splash(t: number, o: PlayOpts = {}) {
    const s = new Shot(this, { send: 0.3, ...o }, 'sfx', 1);
    if (!s.ok) return false;
    s.noise(t, { dur: 0.25, type: 'bandpass', Q: 0.8, f0: 900, f1: 4200, gain: 0.55, attack: 0.02 });
    s.noise(t + 0.05, { dur: 0.4, type: 'lowpass', f0: 2200, f1: 500, gain: 0.3, buffer: this.pink });
    for (let i = 0; i < 4; i++) {
      s.tone(t + 0.08 + this.rng() * 0.25, {
        f0: 900 + this.rng() * 1800, f1: 2400 + this.rng() * 2000, dur: 0.07, gain: 0.12, type: 'sine',
      });
    }
    return s.done();
  }

  /* -------------------------------------------------------------- fishing */

  /**
   * One click of a reel pawl. Called once per notch, not held.
   *
   * A reel is a ratchet: the sound is a *rate*, and the only honest way to
   * build one is a single short click that the caller fires as fast as the
   * spool is turning. A looped whirr sample would be the wrong shape -- it
   * cannot speed up with the retrieve, which is the whole information the
   * sound carries. `scale` shifts the pitch, so a fast retrieve is brighter.
   */
  reelClick(t: number, o: PlayOpts = {}) {
    const s = new Shot(this, { send: 0.1, volume: o.volume ?? 0.5, ...o }, 'sfx', 4);
    if (!s.ok) return false;
    const k = o.scale ?? 1;
    s.noise(t, { dur: 0.022, type: 'bandpass', Q: 3.2, f0: 2300 * k, f1: 1500 * k, gain: 0.30, attack: 0.001 });
    s.tone(t, { f0: 5200 * k, dur: 0.012, gain: 0.10, type: 'square', filter: 'bandpass', filterF: 5200 * k });
    return s.done();
  }

  /**
   * Monofilament under load: the thin whine off a line being taken.
   *
   * Two detuned partials plus a breath of noise, gliding up with `scale` -- a
   * line sings higher the tighter it is, which is the cue that tells a player
   * to give some back before they can read the gauge. `dur` is short and the
   * caller re-triggers, so tension changes are heard rather than crossfaded.
   */
  lineStrain(t: number, o: PlayOpts = {}) {
    const s = new Shot(this, { send: 0.22, volume: o.volume ?? 0.5, ...o }, 'sfx', 3);
    if (!s.ok) return false;
    const k = o.scale ?? 1;
    s.tone(t, { f0: 1180 * k, f1: 1320 * k, dur: 0.34, gain: 0.10, type: 'sine', attack: 0.08 });
    s.tone(t + 0.01, { f0: 1187 * k, f1: 1333 * k, dur: 0.34, gain: 0.07, type: 'triangle', attack: 0.09 });
    s.noise(t, { dur: 0.3, type: 'bandpass', Q: 6.0, f0: 2400 * k, f1: 3100 * k, gain: 0.05, attack: 0.1 });
    return s.done();
  }

  /**
   * The cast: line stripping off the spool, then nothing until it lands.
   *
   * A descending band of noise, because the spool slows through the flight.
   * The splash at the far end is `splash`, fired separately at the float's own
   * position -- two events, two places, which is what makes a cast read as
   * having gone somewhere.
   */
  castWhirr(t: number, o: PlayOpts = {}) {
    const s = new Shot(this, { send: 0.18, volume: o.volume ?? 0.7, ...o }, 'sfx', 2);
    if (!s.ok) return false;
    const k = o.scale ?? 1;
    s.noise(t, { dur: 0.42, type: 'bandpass', Q: 1.6, f0: 3400 * k, f1: 1100 * k, gain: 0.24, attack: 0.012 });
    s.tone(t, { f0: 620 * k, f1: 240 * k, dur: 0.3, gain: 0.07, type: 'sawtooth', filter: 'lowpass', filterF: 2600 });
    return s.done();
  }

  /* ----------------------------------------------------------------- UI */

  /** Menu and HUD sounds. Restrained and glassy, to match the UI. */
  ui(t: number, o: UiOpts = {}) {
    const kind = o.kind ?? 'move';
    const s = new Shot(this, { volume: o.volume ?? 1, ...o }, 'ui', 1);
    if (!s.ok) return false;
    switch (kind) {
      case 'move':
        s.tone(t, { f0: 2100, dur: 0.035, gain: 0.16, type: 'sine' });
        s.noise(t, { dur: 0.02, type: 'highpass', f0: 6000, gain: 0.1 });
        break;
      case 'confirm':
        s.fm(t, { f0: 1320, ratio: 2.0, index: 1.2, dur: 0.35, gain: 0.22 });
        s.fm(t + 0.045, { f0: 1980, ratio: 2.0, index: 1.0, dur: 0.5, gain: 0.16 });
        break;
      case 'cancel':
        s.tone(t, { f0: 880, f1: 620, dur: 0.14, gain: 0.2, type: 'triangle' });
        break;
      case 'open':
        s.noise(t, { dur: 0.22, type: 'bandpass', Q: 1.1, f0: 900, f1: 4200, gain: 0.22, attack: 0.05 });
        s.tone(t, { f0: 220, f1: 440, dur: 0.3, gain: 0.14, type: 'sine', attack: 0.06 });
        break;
      case 'close':
        s.noise(t, { dur: 0.2, type: 'bandpass', Q: 1.1, f0: 3600, f1: 700, gain: 0.2, attack: 0.03 });
        s.tone(t, { f0: 440, f1: 200, dur: 0.26, gain: 0.13, type: 'sine' });
        break;
      case 'error':
        s.tone(t, { f0: 240, dur: 0.18, gain: 0.25, type: 'square', filter: 'lowpass', filterF: 1200 });
        break;
      default:
        s.tone(t, { f0: 1800, dur: 0.06, gain: 0.16, type: 'sine' });
    }
    return s.done();
  }

  /** Item pickup: a small ascending glassy triad. */
  itemPickup(t: number, o: PlayOpts = {}) {
    const s = new Shot(this, { volume: 0.9, ...o }, 'ui', 1);
    if (!s.ok) return false;
    const base = 1046;
    [0, 4, 7].forEach((n, i) => {
      s.fm(t + i * 0.055, { f0: ftom(base, n), ratio: 2.0, index: 1.1, dur: 0.5 - i * 0.08, gain: 0.16 });
    });
    return s.done();
  }

  /**
   * Level-up. A real flourish: a harp run under a held string chord and a bell,
   * played on the music bus so it sits inside the score rather than on top.
   */
  levelUp(t: number, o: PlayOpts = {}) {
    const inst = this.inst;
    const dest = this.graph.bus.ui;
    const root = 261.6;
    const run = [0, 4, 7, 12, 16, 19, 24];
    for (let i = 0; i < run.length; i++) {
      inst.pluck('harp', ftom(root, run[i]), t + i * 0.055, { dest, gain: 0.7, priority: 2 });
    }
    for (const n of [0, 7, 16, 24]) {
      inst.strings(ftom(root, n), t + 0.25, 1.6, { dest, gain: 0.5, unison: 2, attack: 0.08, release: 0.7, priority: 2 });
    }
    inst.bell(ftom(root, 24), t + 0.3, { dest, gain: 0.5, decay: 2.6, priority: 2 });
    this.graph.duck(0.6, 0.5, 1.4, t);
    return true;
  }

  /** Quest updated / objective complete — two notes and a shimmer. */
  questSting(t: number, o: PlayOpts = {}) {
    const inst = this.inst;
    const dest = this.graph.bus.ui;
    inst.bell(880, t, { dest, gain: 0.34, decay: 1.6, priority: 2 });
    inst.bell(1318.5, t + 0.14, { dest, gain: 0.3, decay: 2.2, priority: 2 });
    const s = new Shot(this, { volume: 0.7, ...o }, 'ui', 1);
    if (s.ok) {
      s.noise(t, { dur: 0.7, type: 'highpass', f0: 5200, gain: 0.12, attack: 0.25, buffer: this.pink });
      s.done();
    }
    this.graph.duck(0.75, 0.25, 0.8, t);
    return true;
  }

  stats() { return { played: this.played }; }
}

/* ------------------------------------------------------------------ tables */

/** Swing character per weapon class. Heavier = lower, longer, more body. */
/** One weapon's swing: how many strokes, and the filtered noise burst each is. */
interface SwingVoice {
  strokes: number; gap: number; dur: number;
  /** Filter sweep, Hz. */
  f0: number; f1: number; Q: number;
  /** Body resonance, Hz. 0 for a weapon with no heft. */
  body: number;
}

const SWING: Record<WeaponKind, SwingVoice> = {
  sword: { strokes: 1, gap: 0, dur: 0.20, f0: 1500, f1: 380, Q: 2.6, body: 210 },
  greatsword: { strokes: 1, gap: 0, dur: 0.38, f0: 760, f1: 150, Q: 1.6, body: 96 },
  polearm: { strokes: 2, gap: 0.11, dur: 0.24, f0: 1180, f1: 300, Q: 3.2, body: 150 },
  daggers: { strokes: 2, gap: 0.085, dur: 0.10, f0: 2900, f1: 950, Q: 4.5, body: 0 },
  firearm: { strokes: 1, gap: 0, dur: 0.09, f0: 2200, f1: 900, Q: 3, body: 0 },
  shield: { strokes: 1, gap: 0, dur: 0.26, f0: 620, f1: 180, Q: 1.4, body: 120 },
};

/** What was struck. */
/** What an impact sounds like against one material. */
interface MaterialVoice {
  body: number; bodyDur: number; crack: number; crackDur: number;
  filter: BiquadFilterType; f0: number; f1?: number; Q: number;
  /** Reverb send, 0..1. */
  send: number;
  pink?: boolean;
  /** Metallic ring partial, Hz, with its inharmonic ratio and decay. */
  ring?: number; ratio?: number; ringDur?: number;
}

const MATERIAL: Record<ImpactMaterial, MaterialVoice> = {
  flesh: { body: 105, bodyDur: 0.20, crack: 0.55, crackDur: 0.13, filter: 'lowpass', f0: 1300, f1: 380, Q: 0.7, send: 0.16, pink: true },
  metal: { body: 130, bodyDur: 0.12, crack: 0.8, crackDur: 0.05, filter: 'highpass', f0: 3200, Q: 0.6, ring: 1750, ratio: 1.71, ringDur: 1.1, send: 0.38 },
  armour: { body: 118, bodyDur: 0.15, crack: 0.62, crackDur: 0.07, filter: 'bandpass', f0: 1900, f1: 700, Q: 1.4, ring: 900, ratio: 2.3, ringDur: 0.45, send: 0.3 },
  stone: { body: 78, bodyDur: 0.16, crack: 0.72, crackDur: 0.09, filter: 'bandpass', f0: 1050, f1: 320, Q: 0.9, send: 0.3 },
  wood: { body: 150, bodyDur: 0.10, crack: 0.6, crackDur: 0.07, filter: 'bandpass', f0: 620, f1: 240, Q: 1.6, ring: 330, ratio: 1.3, ringDur: 0.2, send: 0.2 },
  crystal: { body: 190, bodyDur: 0.08, crack: 0.5, crackDur: 0.04, filter: 'highpass', f0: 4600, Q: 0.6, ring: 2900, ratio: 2.41, ringDur: 1.6, send: 0.5 },
  ground: { body: 70, bodyDur: 0.18, crack: 0.5, crackDur: 0.12, filter: 'lowpass', f0: 900, f1: 220, Q: 0.7, send: 0.2, pink: true },
};

/** Footstep character per `Terrain.sampleMaterial()` name. */
/** One footstep: a filtered noise burst, a thud, and optional loose grains. */
interface SurfaceVoice {
  dur: number; f0: number; f1: number; Q: number; crack: number;
  thud: number; thudDur?: number;
  pink?: boolean;
  /** Grain count for a loose surface. */
  grains?: number;
  /** Filter type for the noise burst; `bandpass` unless stated. */
  filter?: BiquadFilterType;
}

const SURFACE: Record<SurfaceName, SurfaceVoice> = {
  grass: { dur: 0.10, f0: 2200, f1: 900, Q: 1.0, crack: 0.30, thud: 92, thudDur: 0.07, pink: true },
  dirt: { dur: 0.085, f0: 1000, f1: 400, Q: 1.1, crack: 0.34, thud: 84, thudDur: 0.08, pink: true },
  sand: { dur: 0.14, f0: 1700, f1: 800, Q: 0.7, crack: 0.30, thud: 62, thudDur: 0.06, pink: true, grains: 0 },
  gravel: { dur: 0.07, f0: 3000, f1: 1200, Q: 1.8, crack: 0.26, thud: 78, thudDur: 0.06, grains: 4 },
  rock: { dur: 0.05, f0: 3800, f1: 1500, Q: 1.6, crack: 0.42, thud: 110, thudDur: 0.05 },
  road: { dur: 0.055, f0: 2000, f1: 800, Q: 1.4, crack: 0.36, thud: 100, thudDur: 0.05 },
  water: { dur: 0.20, f0: 1200, f1: 3600, Q: 0.7, crack: 0.45, thud: 0, pink: true },
  wood: { dur: 0.07, f0: 900, f1: 380, Q: 2.2, crack: 0.36, thud: 140, thudDur: 0.07 },
};

/**
 * Creature voices. `formants` place the resonances of the throat, `growl`
 * amplitude-modulates the source (a big animal's vocal folds beat slowly), and
 * `sub` adds the chest tone you feel rather than hear.
 */
/**
 * One call from a creature with a throat: a pitch contour through the formant
 * bank of its `ThroatVoice`.
 */
interface ThroatCall {
  /** Starting pitch, Hz. */
  f0: number;
  dur: number;
  gain: number;
  /** `[fraction of the call, Hz]` breakpoints. */
  pitch: PitchPoint[];
  attack?: number;
  /** Fraction of the call held at full before it falls away. */
  hold: number;
  /** Multiply the formants by this across the call. No species uses it yet. */
  formantSweep?: number;
}

/** One call from a machine: a swept tone, start to finish. */
interface MachineCall {
  f0: number;
  f1: number;
  dur: number;
}

/** A creature with a larynx. `formants` place the resonances of the throat. */
interface ThroatVoice {
  machine?: false;
  formants: Formant[];
  /** Sub-audio amplitude modulation: big animals beat slowly. */
  growl: number;
  rasp: number;
  /** Chest tone you feel rather than hear, Hz. 0 for a small animal. */
  sub: number;
  aggro: ThroatCall;
  hurt: ThroatCall;
  death: ThroatCall;
  idle: ThroatCall;
}

/** A machine: no vocal folds, so no formants and no growl either. */
interface MachineVoice {
  machine: true;
  aggro: MachineCall;
  hurt: MachineCall;
  death: MachineCall;
  idle: MachineCall;
}

/**
 * One creature voice. The two arms share no fields worth unifying, which is
 * why `vocal()` branches on `machine` before it reads the call.
 */
type SpeciesVoice = ThroatVoice | MachineVoice;

const SPECIES: Record<SpeciesName, SpeciesVoice> = {
  sabertusk: {
    formants: [[380, 1, 6], [900, 0.55, 8], [2100, 0.2, 9]],
    growl: 38, rasp: 0.45, sub: 58,
    aggro: { f0: 155, dur: 0.75, gain: 0.55, pitch: [[0.3, 210], [1, 120]], hold: 0.55 },
    hurt: { f0: 260, dur: 0.34, gain: 0.6, pitch: [[0.25, 420], [1, 200]], attack: 0.008, hold: 0.25 },
    death: { f0: 200, dur: 1.2, gain: 0.6, pitch: [[0.2, 300], [1, 78]], hold: 0.3 },
    idle: { f0: 120, dur: 0.6, gain: 0.22, pitch: [[1, 100]], hold: 0.6 },
  },
  goblin: {
    formants: [[720, 1, 8], [1600, 0.6, 10], [3100, 0.25, 11]],
    growl: 0, rasp: 0.3, sub: 0,
    aggro: { f0: 340, dur: 0.42, gain: 0.5, pitch: [[0.3, 520], [1, 300]], hold: 0.4 },
    hurt: { f0: 520, dur: 0.24, gain: 0.55, pitch: [[0.2, 780], [1, 360]], attack: 0.006, hold: 0.2 },
    death: { f0: 420, dur: 0.8, gain: 0.55, pitch: [[0.25, 620], [1, 150]], hold: 0.25 },
    idle: { f0: 300, dur: 0.3, gain: 0.2, pitch: [[1, 260]], hold: 0.4 },
  },
  mt: {
    machine: true,
    aggro: { f0: 620, f1: 1400, dur: 0.45 },
    hurt: { f0: 1400, f1: 500, dur: 0.2 },
    death: { f0: 900, f1: 120, dur: 0.9 },
    idle: { f0: 420, f1: 460, dur: 0.5 },
  },
  irongiant: {
    formants: [[180, 1, 5], [420, 0.6, 7], [1150, 0.2, 8]],
    growl: 16, rasp: 0.55, sub: 34,
    aggro: { f0: 72, dur: 1.6, gain: 0.7, pitch: [[0.35, 96], [1, 56]], hold: 0.6 },
    hurt: { f0: 92, dur: 0.6, gain: 0.65, pitch: [[0.2, 130], [1, 70]], attack: 0.01, hold: 0.3 },
    death: { f0: 84, dur: 2.4, gain: 0.7, pitch: [[0.25, 110], [1, 38]], hold: 0.35 },
    idle: { f0: 60, dur: 1.2, gain: 0.28, pitch: [[1, 54]], hold: 0.6 },
  },
  daemon: {
    formants: [[240, 1, 5], [640, 0.55, 7], [1500, 0.18, 9]],
    growl: 22, rasp: 0.5, sub: 30,
    aggro: { f0: 88, dur: 1.8, gain: 0.6, pitch: [[0.3, 130], [1, 64]], hold: 0.55 },
    hurt: { f0: 140, dur: 0.5, gain: 0.6, pitch: [[0.2, 200], [1, 96]], hold: 0.25 },
    death: { f0: 110, dur: 1.8, gain: 0.6, pitch: [[0.25, 160], [1, 42]], hold: 0.3 },
    idle: { f0: 70, dur: 1.4, gain: 0.24, pitch: [[1, 62]], hold: 0.6 },
  },
};

/** The formant bank `vox` falls back to when the caller gives none. */
const DEFAULT_FORMANTS: Formant[] = [[520, 1, 6], [1180, 0.5, 8], [2600, 0.15, 9]];

/* --------------------------------------------------------------- naming */

/**
 * Narrow the tail of a cue name to a key of the table that answers it.
 *
 * `swing:${d.weapon}` and `step:${terrain.sampleMaterial().name}` are built
 * from live game data, so the tail is a runtime string wherever it reaches
 * here. Each of these is a type guard over the table's own keys -- the same
 * shape as `nodes.ts`'s `canStop` -- so an unknown tail lands on the default
 * instead of being asserted into a union it is not in.
 */
function keyOf<T extends string>(table: Record<T, unknown>, fallback: T) {
  const has = (k: string): k is T => k in table;
  return (k: string | undefined): T => (k !== undefined && has(k) ? k : fallback);
}

/** The same guard where the set is a list rather than the keys of a table. */
function oneOf<T extends string>(names: readonly T[], fallback: T) {
  const set: ReadonlySet<string> = new Set(names);
  const has = (k: string): k is T => set.has(k);
  return (k: string | undefined): T => (k !== undefined && has(k) ? k : fallback);
}

const asWeaponKind = keyOf(SWING, 'sword');
const asMaterial = keyOf(MATERIAL, 'flesh');
const asSurface = keyOf(SURFACE, 'dirt');
const asSpecies = keyOf(SPECIES, 'goblin');
const asMood = oneOf(VOCAL_MOODS, 'aggro');
const asElement = oneOf(SPELL_ELEMENTS, 'fire');
const asUiCue = oneOf(UI_CUES, 'move');

export { SURFACE, MATERIAL, SPECIES, SWING };
