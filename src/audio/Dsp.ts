/**
 * Low-level DSP helpers shared by every part of the audio stack.
 *
 * Everything here is *generated* — there are no sample files anywhere in this
 * project (see BRIEF: no binary assets), so noise beds, impulse responses and
 * harmonic spectra are all computed at boot from a deterministic PRNG. Using a
 * seeded generator rather than `Math.random()` matters: the offline verification
 * render in `tools`-land has to produce the same buffer twice.
 */

/** xorshift32 — cheap, deterministic, good enough for noise. */
export function makeRng(seed = 1) {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** Bipolar white noise from a unit-range rng. */
const bi = (rng) => rng() * 2 - 1;

/**
 * A looping noise bed.
 */
export function noiseBuffer(ctx: BaseAudioContext, seconds: number, color: 'white' | 'pink' | 'brown' = 'pink', seed: number = 1, channels: number = 1) {
  const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(channels, len, ctx.sampleRate);
  for (let c = 0; c < channels; c++) {
    const rng = makeRng(seed + c * 7919);
    const d = buf.getChannelData(c);
    if (color === 'white') {
      for (let i = 0; i < len; i++) d[i] = bi(rng) * 0.5;
    } else if (color === 'brown') {
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + bi(rng) * 0.045) * 0.998;
        d[i] = last * 3.2;
      }
    } else {
      // Paul Kellet's pink filter — one-pole cascade, ~-3 dB/octave.
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = bi(rng);
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.09;
        b6 = w * 0.115926;
      }
    }
    // Remove DC. Brown noise is an integrated random walk, so it wanders far
    // from zero; left in, that offset eats headroom on the master bus and shows
    // up as a measurable DC bias on the rendered mix.
    let mean = 0;
    for (let i = 0; i < len; i++) mean += d[i];
    mean /= len;
    let hp = 0;
    const hpK = 1 - Math.exp(-2 * Math.PI * 18 / ctx.sampleRate);   // 18 Hz
    for (let i = 0; i < len; i++) {
      const v = d[i] - mean;
      hp += (v - hp) * hpK;
      d[i] = v - hp;
    }

    // Fade the seam so a looping bed has no tick at the wrap point.
    const fade = Math.min(2048, (len / 8) | 0);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[i] *= k;
      d[len - 1 - i] = d[len - 1 - i] * k + d[fade - 1 - i] * (1 - k);
    }
  }
  return buf;
}

/**
 * A synthesised room. Exponentially decaying noise with progressive high-
 * frequency damping (air absorption), a pre-delay, and a handful of discrete
 * early reflections — the early pattern is what actually tells the ear whether
 * it is standing in a canyon or a tent.
 *
 * @param {object} o
 * */
export function impulseResponse(ctx: BaseAudioContext, o: { seconds: number, decay: number, predelay: number, damp: number, early: number[][], width: number, seed: number } = {}) {
  const seconds = o.seconds ?? 2.4;
  const decay = o.decay ?? 2.4;
  const predelay = o.predelay ?? 0.012;
  const damp = o.damp ?? 0.45;
  const early = o.early || [[0.011, 0.42], [0.019, 0.31], [0.031, 0.26], [0.047, 0.18], [0.068, 0.12]];
  const width = o.width ?? 1;
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(sr * seconds));
  const buf = ctx.createBuffer(2, len, sr);
  const pre = Math.floor(predelay * sr);

  for (let c = 0; c < 2; c++) {
    const rng = makeRng((o.seed ?? 7) + c * 104729);
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / (len - pre);
      const env = Math.pow(1 - t, decay);
      // The damping coefficient itself decays: late reflections are darker.
      const a = 1 - damp * (0.35 + 0.65 * t);
      lp += (bi(rng) - lp) * a;
      d[i] = lp * env;
    }
    // Discrete early reflections, jittered per channel for stereo width.
    for (let e = 0; e < early.length; e++) {
      const jitter = 1 + (c === 0 ? -1 : 1) * width * 0.11 * (rng() - 0.5);
      const idx = Math.floor(early[e][0] * jitter * sr);
      if (idx > 0 && idx < len) d[idx] += early[e][1] * (c === 0 ? 1 : 0.92);
    }
    // Direct-ish first arrival keeps the convolver from sounding like a wash.
    d[0] += 0.25;
  }
  // Normalise so swapping IRs never changes the send level.
  let peak = 1e-6;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
  }
  const g = 0.62 / peak;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] *= g;
  }
  return buf;
}

/**
 * Waveshaper curve for the master bus: unity slope at zero, asymptotically
 * bounded at the extremes.
 *
 * The obvious `tanh(kx)/tanh(k)` is wrong here — its slope at the origin is
 * `k/tanh(k)`, so it quietly applies several dB of makeup to everything below
 * the knee and the whole mix comes out the same loudness no matter what is
 * playing. That defeats the point of an adaptive score, and it is exactly what
 * the verification render measured before this was fixed.
 *
 * @param k knee sharpness — higher clips harder near full scale
 */
export function softClipCurve(k: number = 3, n = 1024) {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = x / Math.pow(1 + Math.pow(Math.abs(x), k), 1 / k);
  }
  return c;
}

/* --------------------------------------------------------------- spectra */

const WAVE_CACHE = new WeakMap();

/**
 * Harmonic spectra for the orchestral toolkit. A PeriodicWave costs one
 * oscillator instead of the four or five an additive stack would need, which is
 * the difference between a 40-voice string section and a dropped frame.
 */
const SPECTRA = {
  // Bowed string: strong odd/even mix, gentle rolloff, slight 2nd-formant bump.
  string: (n) => (1 / Math.pow(n, 1.08)) * Math.exp(-n / 15) * (n === 3 ? 1.35 : 1),
  // Brass: bright, slow rolloff, formant plateau around the 4th–7th partial.
  brass: (n) => (1 / Math.pow(n, 0.72)) * Math.exp(-n / 22) * (n >= 3 && n <= 8 ? 1.5 : 1),
  // Clarinet-ish reed: odd harmonics dominate.
  reed: (n) => (n % 2 === 1 ? 1 / Math.pow(n, 1.35) : 0.14 / Math.pow(n, 1.6)) * Math.exp(-n / 18),
  // Flute: nearly a sine with a whisper of 2nd and 3rd.
  flute: (n) => (n === 1 ? 1 : n === 2 ? 0.18 : n === 3 ? 0.07 : 0.02 / n) * Math.exp(-n / 6),
  // Choir "ah": fundamental plus a formant cluster.
  choir: (n) => (1 / Math.pow(n, 1.25)) * Math.exp(-n / 11)
    * (n >= 2 && n <= 4 ? 1.6 : n >= 7 && n <= 9 ? 1.25 : 1),
  // Soft pad — a filtered saw without the fizz.
  pad: (n) => (1 / Math.pow(n, 1.35)) * Math.exp(-n / 9),
  organ: (n) => ([0, 1, 0.5, 0.32, 0.24, 0.05, 0.12, 0.03, 0.09][n] ?? 0),
};

/**
 * Cached PeriodicWave for a named timbre.
 */
export function wave(ctx: BaseAudioContext, name: keyof SPECTRA) {
  let map = WAVE_CACHE.get(ctx);
  if (!map) { map = new Map(); WAVE_CACHE.set(ctx, map); }
  let w = map.get(name);
  if (w) return w;
  const fn = SPECTRA[name] || SPECTRA.pad;
  const N = 32;
  const real = new Float32Array(N);
  const imag = new Float32Array(N);
  for (let n = 1; n < N; n++) imag[n] = fn(n);
  w = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
  map.set(name, w);
  return w;
}

/* ------------------------------------------------------------- envelopes */

/** Exponential ramps hate zero; this is the floor everything ramps to. */
export const EPS = 0.0001;

/**
 * Standard ADSR onto a gain param.
 * @param t start time
 * @param dur total note length (attack..release start)
 * @param o {a, d, s, r, peak}
 */
export function adsr(p: AudioParam, t: number, dur: number, o: any = {}) {
  const a = o.a ?? 0.01;
  const d = o.d ?? 0.12;
  const s = o.s ?? 0.6;
  const r = o.r ?? 0.25;
  const peak = Math.max(EPS, o.peak ?? 0.3);
  const sus = Math.max(EPS, peak * s);
  const body = Math.max(0.02, dur);
  p.setValueAtTime(EPS, t);
  if (a < 0.004) p.setValueAtTime(peak, t + a);
  else p.exponentialRampToValueAtTime(peak, t + a);
  p.exponentialRampToValueAtTime(sus, t + a + d);
  p.setValueAtTime(sus, t + body);
  p.exponentialRampToValueAtTime(EPS, t + body + r);
  return t + body + r;
}

/** Percussive envelope: instant attack, exponential fall. */
export function hit(p, t, peak, decay) {
  p.setValueAtTime(Math.max(EPS, peak), t);
  p.exponentialRampToValueAtTime(EPS, t + decay);
  return t + decay;
}

/** Safe exponential ramp that tolerates a zero target. */
export function expTo(p, v, t) { p.exponentialRampToValueAtTime(Math.max(EPS, v), t); }

/** Equal-tempered frequency from a semitone offset above a reference. */
export function ftom(ref, semis) { return ref * Math.pow(2, semis / 12); }

/** Random within a range from a supplied rng. */
export function rr(rng, a, b) { return a + (b - a) * rng(); }

/** Clamp. */
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

/** Linear interpolation. */
export function lerp(a, b, t) { return a + (b - a) * t; }
