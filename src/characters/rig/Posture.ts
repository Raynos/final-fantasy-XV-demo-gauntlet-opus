/**
 * How each of the four *stands*.
 *
 * This is animation data, deliberately kept out of `Cast.ts` (which is
 * appearance — face, hair, outfit). A posture descriptor does not list Euler
 * angles; it describes a body, and `Anim.evalIdle` / `Anim.evalStance` resolve
 * it into a pose. That indirection is the point: the four of them are supposed
 * to be distinguishable *by posture alone* in a silhouette, and you cannot tune
 * that by hand-editing thirty rotations per character.
 *
 * Sign conventions follow the skeleton (`Skeleton.ts`): the character faces
 * **+Z**, their **left** is **+X**, and every bind rotation is identity, so a
 * field like `weight` can be read as a plain signed quantity — positive means
 * the *left* leg carries.
 */

/**
 * A resolved body: `POSTURE_DEFAULTS` with one character's overrides applied.
 * `Anim.evalIdle` / `Anim.evalStance` turn it into a pose.
 */
export interface Posture {
  /** signed rest bias; >0 = the left leg carries. */
  weight: number;
  /** how far the weight crosses over from `weight`, and how often (Hz). */
  shift: number;
  shiftRate: number;
  /** foot separation multiplier and toe splay in radians. */
  stanceW: number;
  toeOut: number;
  /** thoracic flexion + shoulder protraction (rounded, closed). */
  slouch: number;
  /** lumbar extension + shoulders back (open, presented). */
  chest: number;
  /** extra abduction: how far the arms hang clear of the ribs. */
  armOut: number;
  /** resting elbow flexion. Straight arms are the mannequin tell. */
  elbow: number;
  /** external rotation of the humerus. */
  armTwist: number;
  /** how differently the two arms hang. 0 = a shop dummy. */
  asym: number;
  breathRate: number;
  breathDepth: number;
  headRate: number;
  headAmp: number;
  headDown: number;
  headTilt: number;
  /** involuntary postural sway. Nobody is ever actually still. */
  fidget: number;
  /** how much of the legacy `look.idle` Euler bag still gets mixed in. */
  biasW: number;
  /** +1 = the left foot leads the fighting stance. */
  lead: number;
  /** how wide and how low the guard sits. */
  guard: number;
  /** key list into `GESTURES`. */
  gestures: string[];
  /** seconds between idle gestures, `[min, max]`. */
  gestureGap: number[];
}

/** Neutral body. Every character starts from this and overrides what differs. */
export const POSTURE_DEFAULTS: Posture = {
  // --- weight ------------------------------------------------------------
  /** signed rest bias; >0 = the left leg carries. */
  weight: 0,
  /** how far the weight crosses over from `weight`, and how often (Hz). */
  shift: 0.45,
  shiftRate: 0.055,

  // --- base of support ---------------------------------------------------
  /** foot separation multiplier and toe splay in radians. */
  stanceW: 1.0,
  toeOut: 0.20,

  // --- torso -------------------------------------------------------------
  /** thoracic flexion + shoulder protraction (rounded, closed). */
  slouch: 0,
  /** lumbar extension + shoulders back (open, presented). */
  chest: 0,

  // --- arms --------------------------------------------------------------
  /** extra abduction: how far the arms hang clear of the ribs. */
  armOut: 0,
  /** resting elbow flexion. Straight arms are the mannequin tell. */
  elbow: 0.38,
  /** external rotation of the humerus. */
  armTwist: 0.06,
  /** how differently the two arms hang. 0 = a shop dummy. */
  asym: 0.25,

  // --- breath ------------------------------------------------------------
  /** ~0.225 Hz is 13.5 breaths per minute — a resting adult. */
  breathRate: 0.225,
  breathDepth: 1.0,

  // --- head --------------------------------------------------------------
  headRate: 0.09,
  headAmp: 0.16,
  headDown: 0,
  headTilt: 0,

  // --- life --------------------------------------------------------------
  /** involuntary postural sway. Nobody is ever actually still. */
  fidget: 1.0,
  /** how much of the legacy `look.idle` Euler bag still gets mixed in. */
  biasW: 0.5,

  // --- combat ------------------------------------------------------------
  /** +1 = the left foot leads the fighting stance. */
  lead: 1,
  /** how wide and how low the guard sits. */
  guard: 1.0,

  /** key list into `GESTURES`. */
  gestures: [],
  /** seconds between idle gestures. */
  gestureGap: [6.5, 12.5],
};

/**
 * Per-character posture. The brief for each is one sentence of body language;
 * everything below it is that sentence, in numbers.
 */
export const POSTURE: Record<string, Partial<Posture>> = {
  // Bored royalty: hip-parked, shoulders rolled forward, chin down and turned
  // away from whoever is talking to him.
  noctis: {
    weight: -0.55, shift: 0.35, shiftRate: 0.048,
    stanceW: 0.98, toeOut: 0.26,
    slouch: 0.65, chest: 0,
    armOut: 0.02, elbow: 0.42, armTwist: 0.10, asym: 0.40,
    breathRate: 0.215, breathDepth: 1.0,
    headRate: 0.075, headAmp: 0.20, headDown: 0.10, headTilt: 0.04,
    fidget: 0.75, biasW: 0.45,
    lead: 1, guard: 1.0,
    gestures: ['pocket', 'shoulder_roll'], gestureGap: [7.5, 13.0],
  },

  // A wall. Square, heavy, chest open, feet planted wide; he does not fidget
  // and he does not shift his weight much, because he does not need to.
  gladio: {
    weight: 0.15, shift: 0.25, shiftRate: 0.038,
    stanceW: 1.55, toeOut: 0.42,
    slouch: 0, chest: 0.70,
    armOut: 0.20, elbow: 0.34, armTwist: 0.14, asym: 0.18,
    breathRate: 0.185, breathDepth: 1.5,
    headRate: 0.055, headAmp: 0.10, headDown: 0.045, headTilt: -0.02,
    fidget: 0.5, biasW: 0.4,
    lead: -1, guard: 1.35,
    gestures: ['neck_roll', 'knuckles'], gestureGap: [8.5, 14.0],
  },

  // Composed and vertical. Narrow base, no slouch, forearms carried forward
  // and precise; the stillest of the four, and the only one who looks like he
  // is listening rather than waiting.
  ignis: {
    weight: 0.30, shift: 0.30, shiftRate: 0.052,
    stanceW: 0.78, toeOut: 0.18,
    slouch: 0, chest: 0.30,
    armOut: 0.04, elbow: 0.50, armTwist: 0.20, asym: 0.20,
    breathRate: 0.20, breathDepth: 0.85,
    headRate: 0.065, headAmp: 0.11, headDown: 0.01, headTilt: 0.02,
    fidget: 0.6, biasW: 0.35,
    lead: 1, guard: 0.9,
    gestures: ['glasses', 'cuff'], gestureGap: [7.0, 12.0],
  },

  // Restless. Crosses his weight over twice as often as anyone else, loose
  // through the shoulders, head everywhere, arms doing different things.
  prompto: {
    weight: -0.10, shift: 0.85, shiftRate: 0.10,
    stanceW: 0.92, toeOut: 0.32,
    slouch: 0.30, chest: 0.05,
    armOut: 0.06, elbow: 0.40, armTwist: 0.04, asym: 0.60,
    breathRate: 0.26, breathDepth: 1.1,
    headRate: 0.14, headAmp: 0.28, headDown: -0.02, headTilt: 0.06,
    fidget: 1.6, biasW: 0.45,
    lead: 1, guard: 0.85,
    gestures: ['camera', 'neck_rub'], gestureGap: [5.5, 10.0],
  },
};

/**
 * Idle gestures — one-shot additive beats.
 *
 * Authored for the **off hand** (the one not holding a weapon) and mirrored by
 * `Anim.evalGesture`. Keeping them off the weapon hand is not squeamishness:
 * companion weapons are socketed rigidly to `handR` with no IK, so any gesture
 * that moved that arm would swing Gladiolus's two-metre greatsword through the
 * scenery.
 *
 * Channels are semantic, not bone names:
 *   `clav`/`arm`/`wrist` [x,y,z] on the off-side clavicle / upperArm / hand
 *   `elbow`  flexion in radians (applied as -x on the forearm)
 *   `fingers` extra curl
 *   `spine`/`neck`/`head` [x,y,z] on the body, y and z mirrored with the side
 *   `dur`    total length; `hold` is the fraction spent at full amplitude
 */
/**
 * One idle gesture. Every limb field is optional: a gesture drives only the
 * joints it is about, and `Anim.evalGesture` skips the rest.
 */
export interface Gesture {
  /** total length in seconds. */
  dur: number;
  /** fraction of `dur` spent at full amplitude (default 0.35). */
  hold?: number;
  /** `[x, y, z]` on the off-hand side; y and z are mirrored with the side. */
  clav?: number[];
  arm?: number[];
  /** flexion in radians, applied as −x on the forearm. */
  elbow?: number;
  wrist?: number[];
  /** extra finger curl. */
  fingers?: number;
  spine?: number[];
  neck?: number[];
  head?: number[];
}

export const GESTURES: Record<string, Gesture> = {
  /** Hand into the trouser pocket and left there for a beat. */
  pocket: {
    dur: 3.4, hold: 0.55,
    arm: [0.10, 0.20, -0.16], elbow: 0.75, wrist: [0.25, 0, -0.26], fingers: 0.15,
    spine: [0, 0.03, 0], head: [0.03, 0.05, 0],
  },
  /** A shrug that starts in one shoulder and dies out through the neck. */
  shoulder_roll: {
    dur: 1.6, hold: 0.25,
    clav: [-0.14, 0, 0.13], arm: [0.16, 0, 0.12], elbow: 0.20,
    spine: [0.03, 0.05, 0], neck: [-0.05, 0, 0], head: [-0.05, 0.07, 0.06],
  },
  /** Rolls his neck out, the way a big man does when he has been standing. */
  neck_roll: {
    dur: 2.2, hold: 0.30,
    clav: [-0.11, 0, 0.10], spine: [0, 0, 0.025],
    neck: [0.06, 0.16, 0.11], head: [0.07, 0.24, 0.18],
  },
  /** Works the knuckles of the weapon hand with the other. */
  knuckles: {
    dur: 2.4, hold: 0.42,
    arm: [-0.34, 0.36, -0.30], elbow: 1.15, wrist: [0.20, 0, 0.22], fingers: 0.50,
    spine: [0.05, 0.06, 0], head: [0.11, 0.10, 0],
  },
  /** Two fingers to the bridge of the glasses. Ignis's whole character in 1.8s. */
  glasses: {
    dur: 1.9, hold: 0.34,
    clav: [-0.07, 0, 0.06], arm: [-1.02, 0.30, -0.08], elbow: 1.60,
    wrist: [0.16, -0.10, 0.16], fingers: 0.38,
    spine: [0, 0.02, 0], neck: [0.03, 0, 0], head: [0.05, 0.03, 0],
  },
  /** Squares a cuff — small, exact, and entirely unnecessary. */
  cuff: {
    dur: 2.6, hold: 0.45,
    arm: [-0.44, 0.44, -0.32], elbow: 1.38, wrist: [0.10, 0, 0.22], fingers: 0.42,
    spine: [0.07, 0.05, 0], neck: [0.05, 0, 0], head: [0.15, 0.06, 0],
  },
  /** Checks the camera at his hip, chin down over it. */
  camera: {
    dur: 2.8, hold: 0.40,
    arm: [-0.32, 0.36, -0.26], elbow: 1.28, wrist: [0.20, 0, 0.22], fingers: 0.46,
    spine: [0.08, 0, 0], neck: [0.10, 0, 0], head: [0.24, 0.04, 0],
  },
  /**
   * The back-of-the-neck rub. Nervous energy with nowhere to go.
   *
   * The shoulder has to abduct most of the way to horizontal before the elbow
   * fold puts the hand anywhere near the neck; at half that the same numbers
   * read as a man flexing his bicep.
   */
  neck_rub: {
    dur: 2.3, hold: 0.30,
    clav: [-0.18, 0, 0.16], arm: [-0.18, 0.78, 1.52], elbow: 2.35,
    wrist: [0.20, 0, 0], fingers: 0.30,
    spine: [0.04, 0, 0], head: [0.13, 0.12, -0.08],
  },
};

/**
 * Resolve a character's posture against the defaults.
 * @param key `noctis` | `gladio` | `ignis` | `prompto`
 * @returns a complete posture descriptor
 */
export function resolvePosture(key: string): Posture {
  return { ...POSTURE_DEFAULTS, ...(POSTURE[key] || {}) };
}
