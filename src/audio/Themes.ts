/**
 * The written music.
 *
 * This file is the score, not the synth: chord charts, melodies and the
 * arrangement weights per game state. Everything is expressed in semitones
 * above the key's tonic and in beats from the start of a phrase, so the same
 * material can be transposed, augmented or re-orchestrated by `Score.js`.
 *
 * One motif runs through the whole game — `SOMNUS`, a rising fifth that steps
 * back down through the minor sixth. You hear it whole and lyrical on the
 * field, in fragments over the tension bed, compressed into a brass call in
 * combat, doubled in length under a choir at a boss, on solo flute at camp, and
 * turned to the major for the victory fanfare. That recurrence is what makes a
 * soundtrack feel like a soundtrack instead of a playlist.
 */

/** Chord shapes, semitones above the chord root. */
export const CHORDS = {
  min: [0, 3, 7],
  maj: [0, 4, 7],
  min7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  dom7: [0, 4, 7, 10],
  min9: [0, 3, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  add9: [0, 4, 7, 14],
  min6: [0, 3, 7, 9],
  maj6: [0, 4, 7, 9],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  dim: [0, 3, 6],
  five: [0, 7],
  minAdd11: [0, 3, 7, 17],
};

/** Shorthand: `c(0,'min')` is the tonic minor triad. */
const c = (r: any, q: any) => ({ r, q });

/* ------------------------------------------------------------------ motifs */

/**
 * The Somnus motif — 8 bars of 4/4, notes as [semitone, startBeat, lengthBeats, velocity].
 * Degrees are relative to the tonic with the melody sitting an octave up.
 */
export const SOMNUS = {
  bars: 8, beats: 32,
  notes: [
    [7, 0, 2.5, 0.85], [12, 2.5, 1.5, 0.95],
    [10, 4, 1, 0.75], [12, 5, 1, 0.8], [10, 6, 1, 0.72], [8, 7, 1, 0.7],
    [7, 8, 3, 0.8], [5, 11, 1, 0.7],
    [3, 12, 2, 0.72], [5, 14, 2, 0.74],
    [7, 16, 2.5, 0.86], [8, 18.5, 1.5, 0.9],
    [10, 20, 1, 0.8], [12, 21, 2, 0.9], [14, 23, 1, 0.85],
    [15, 24, 3, 1.0], [12, 27, 1, 0.8],
    [10, 28, 2, 0.72], [7, 30, 2, 0.68],
  ],
};

/** A quieter answering phrase — same shape, resolved down to the tonic. */
export const SOMNUS_ANSWER = {
  bars: 8, beats: 32,
  notes: [
    [7, 0, 1.5, 0.7], [8, 1.5, 1, 0.72], [7, 2.5, 1.5, 0.75],
    [5, 4, 2, 0.68], [3, 6, 2, 0.66],
    [5, 8, 1, 0.7], [7, 9, 1, 0.74], [8, 10, 2, 0.78],
    [7, 12, 3, 0.72], [5, 15, 1, 0.66],
    [3, 16, 2, 0.68], [2, 18, 2, 0.64],
    [0, 20, 3, 0.7], [3, 23, 1, 0.66],
    [5, 24, 2, 0.72], [3, 26, 2, 0.68],
    [2, 28, 1.5, 0.62], [0, 29.5, 2.5, 0.7],
  ],
};

/** The motif compressed into a brass call for combat — same pitches, half the time. */
export const SOMNUS_CALL = {
  bars: 4, beats: 16,
  notes: [
    [7, 0, 1, 0.95], [12, 1, 1, 1.0], [10, 2, 0.5, 0.85], [12, 2.5, 1.5, 0.95],
    [7, 4, 1.5, 0.85], [5, 5.5, 0.5, 0.8], [3, 6, 2, 0.9],
    [7, 8, 1, 0.95], [12, 9, 1, 1.0], [14, 10, 1, 0.95], [15, 11, 1, 1.0],
    [12, 12, 2, 0.95], [10, 14, 1, 0.85], [7, 15, 1, 0.8],
  ],
};

/** The motif in augmentation, for the choir at a boss — one note per bar. */
export const SOMNUS_AUG = {
  bars: 8, beats: 32,
  notes: [
    [7, 0, 4, 0.9], [12, 4, 4, 1.0],
    [10, 8, 4, 0.85], [8, 12, 4, 0.85],
    [7, 16, 4, 0.95], [15, 20, 4, 1.0],
    [12, 24, 4, 0.9], [10, 28, 4, 0.8],
  ],
};

/** Turned to the major and given a dotted fanfare rhythm. */
export const VICTORY_FANFARE = {
  bars: 6, beats: 24,
  notes: [
    [0, 0, 0.33, 1], [0, 0.33, 0.33, 1], [0, 0.66, 0.34, 1], [4, 1, 1, 1],
    [0, 2, 0.33, 0.95], [0, 2.33, 0.33, 0.95], [0, 2.66, 0.34, 0.95], [7, 3, 1, 1],
    [4, 4, 0.5, 0.9], [7, 4.5, 0.5, 0.95], [12, 5, 2, 1], [11, 7, 1, 0.9],
    [12, 8, 1, 1], [14, 9, 1, 0.95], [16, 10, 2, 1],
    [14, 12, 1, 0.9], [12, 13, 1, 0.9], [9, 14, 2, 0.85],
    [7, 16, 1, 0.9], [9, 17, 1, 0.9], [12, 18, 2, 1],
    [12, 20, 4, 1],
  ],
};

/** The combat ostinato: eighth notes under everything, Phrygian-inflected. */
export const COMBAT_RIFF = [0, 0, 3, 0, 5, 3, 0, -2];
export const BOSS_RIFF = [0, 0, 1, 0, 0, -2, 1, 0];

/* ------------------------------------------------------------- states */

/**
 * @typedef {object} MusicState
 * @property {number} tempo          BPM
 * @property {number} meter          beats per bar
 * @property {number} tonic          semitones above A (the key)
 * @property {{r:number,q:string}[]} prog  chord chart, one entry per bar
 * @property {Record<string, number>} layers  target gain per arrangement layer
 * @property {number} reverb         music send depth 0..1
 */

export const STATES: Record<string, MusicState> = {
  /** Leide by day: open, wistful, the theme sung by strings over a harp bed. */
  field: {
    tempo: 74, meter: 4, tonic: 0, reverb: 0.85,
    prog: [c(0, 'min'), c(8, 'maj'), c(3, 'maj'), c(10, 'maj'),
      c(0, 'min'), c(10, 'maj'), c(5, 'min7'), c(7, 'min')],
    layers: { bass: 0.15, pad: 0.12, strings: 0.156, melody: 0.215, harp: 0.117, wood: 0.078, perc: 0, choir: 0, brass: 0 },
    melody: [SOMNUS, SOMNUS_ANSWER],
  },

  /** The same country after dark — the theme withdraws and the choir comes up. */
  night: {
    tempo: 62, meter: 4, tonic: 0, reverb: 1.0,
    prog: [c(0, 'min9'), c(7, 'min'), c(8, 'maj7'), c(3, 'maj'),
      c(0, 'min9'), c(5, 'min7'), c(1, 'maj7'), c(7, 'maj')],
    layers: { bass: 0.132, pad: 0.106, strings: 0.088, melody: 0.088, harp: 0.088, wood: 0, perc: 0, choir: 0.088, brass: 0 },
    melody: [SOMNUS_ANSWER],
  },

  /** Something is out there. No melody, no resolution — just weight. */
  tension: {
    tempo: 66, meter: 4, tonic: 0, reverb: 0.9,
    prog: [c(0, 'minAdd11'), c(0, 'minAdd11'), c(1, 'maj7'), c(1, 'maj7'),
      c(0, 'minAdd11'), c(0, 'minAdd11'), c(11, 'dim'), c(11, 'dim')],
    layers: { bass: 0.11, pad: 0.08, strings: 0.075, melody: 0, harp: 0.04, wood: 0, perc: 0.11, choir: 0.055, brass: 0 },
    melody: [],
  },

  /** Stand your ground: driving eighths, brass calling the motif. */
  combat: {
    tempo: 152, meter: 4, tonic: 0, reverb: 0.55,
    prog: [c(0, 'min'), c(1, 'maj'), c(0, 'min'), c(10, 'min'),
      c(0, 'min'), c(1, 'maj'), c(8, 'maj'), c(7, 'maj')],
    layers: { bass: 0.42, pad: 0.12, strings: 0.36, melody: 0.40, harp: 0, wood: 0, perc: 0.46, choir: 0.16, brass: 0.42 },
    melody: [SOMNUS_CALL],
    riff: COMBAT_RIFF,
  },

  /** A boss: half-time, a tritone pedal, and the motif sung in augmentation. */
  boss: {
    tempo: 138, meter: 4, tonic: 0, reverb: 0.75,
    prog: [c(0, 'min'), c(0, 'min'), c(6, 'maj'), c(6, 'maj'),
      c(0, 'min'), c(8, 'maj'), c(1, 'maj'), c(7, 'maj')],
    layers: { bass: 0.35, pad: 0.16, strings: 0.30, melody: 0.27, harp: 0, wood: 0, perc: 0.38, choir: 0.32, brass: 0.37 },
    melody: [SOMNUS_AUG],
    riff: BOSS_RIFF,
  },

  /** The fire at a haven. Three-four, harp, one flute carrying the theme. */
  camp: {
    tempo: 58, meter: 3, tonic: 0, reverb: 0.7,
    prog: [c(0, 'min9'), c(8, 'maj7'), c(3, 'maj7'), c(10, 'maj6'),
      c(0, 'min9'), c(5, 'min7'), c(8, 'maj7'), c(7, 'sus4')],
    layers: { bass: 0.20, pad: 0.16, strings: 0.15, melody: 0.30, harp: 0.26, wood: 0.29, perc: 0, choir: 0.055, brass: 0 },
    melody: [SOMNUS, SOMNUS_ANSWER],
  },

  /** Six bars of brass and timpani, then back to whatever we came from. */
  victory: {
    tempo: 132, meter: 4, tonic: 0, reverb: 0.7, oneShot: true, bars: 6,
    prog: [c(0, 'maj'), c(5, 'maj'), c(0, 'maj'), c(7, 'dom7'), c(0, 'maj'), c(0, 'maj6')],
    layers: { bass: 0.40, pad: 0.14, strings: 0.31, melody: 0.43, harp: 0.18, wood: 0, perc: 0.45, choir: 0.16, brass: 0.45 },
    melody: [VICTORY_FANFARE],
    major: true,
  },

  /** Nothing playing — used when the radio takes over, or on the title. */
  silence: {
    tempo: 74, meter: 4, tonic: 0, reverb: 0.8,
    prog: [c(0, 'min')],
    layers: { bass: 0, pad: 0, strings: 0, melody: 0, harp: 0, wood: 0, perc: 0, choir: 0, brass: 0 },
    melody: [],
  },
};

export const LAYERS = ['bass', 'pad', 'strings', 'melody', 'harp', 'wood', 'perc', 'choir', 'brass'];

/**
 * Voice a chord into semitone offsets: root in the bass, then the shape spread
 * across `octaves`, dropping the doubled root so the middle does not muddy.
 * @param octave base octave offset in semitones
 */
export function voiceChord(chord: {r:number,q:string}, octave: number = 0, spread = 1) {
  const shape = CHORDS[chord.q as keyof typeof CHORDS] || CHORDS.min;
  const out = [];
  for (let i = 0; i < shape.length; i++) {
    out.push(chord.r + shape[i] + octave + (spread > 1 && i > 1 ? 12 : 0));
  }
  return out;
}
