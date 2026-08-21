/**
 * Held poses for cinematic staging.
 *
 * These are authored in the same format the combat animator already uses
 * (`src/characters/rig/Anim.js` → `ACTIONS`): XYZ Euler radians per bone, two
 * keys, `hold: true`. Feeding them through that machinery rather than writing
 * bone quaternions directly buys the blend envelope, the override semantics and
 * the interaction with the gait layer for free — a posed character still walks,
 * breathes, blinks and plants its feet.
 *
 * Sign conventions, read off the existing action table:
 *   spine/neck  +X leans forward, −X arches back
 *   upperArm    −X raises the arm forward, +Z abducts the left arm outward
 *   lowerArm    −X bends the elbow
 */

/** Two-key hold: rest → pose, then park. */
function hold(pose, blend = 0.42) {
  return { dur: blend, hold: true, mask: 'upper', keys: [{ t: 0, pose: {} }, { t: blend, pose }] };
}

export const POSES = {
  /**
   * Both hands flat on the boot lid, shoulders under the load, head down.
   * The whole opening rests on this one silhouette, so it is deliberately
   * asymmetric: the arms are not quite level and the head is turned a few
   * degrees off axis, which is what stops four of them reading as a chorus line.
   */
  push: hold({
    spine01: [0.26, 0.02, 0], spine02: [0.22, 0.01, 0], spine03: [0.16, -0.02, 0],
    neck: [-0.20, 0.03, 0], head: [-0.17, 0.05, 0],
    clavicleL: [0, 0, -0.10], clavicleR: [0, 0, 0.08],
    // arms forward and *down* onto a boot lid at chest height, elbows soft
    upperArmL: [-1.02, 0.14, 0.14], lowerArmL: [-0.30, 0, 0], handL: [0.34, 0, 0],
    upperArmR: [-0.98, -0.12, -0.12], lowerArmR: [-0.34, 0, 0], handR: [0.32, 0, 0],
  }),

  /** Gladiolus: lower, wider, shoulder into it. He is doing most of the work. */
  push_heavy: hold({
    spine01: [0.38, -0.03, 0], spine02: [0.31, -0.02, 0], spine03: [0.22, 0.02, 0],
    neck: [-0.30, -0.04, 0], head: [-0.26, -0.06, 0],
    clavicleL: [0, 0, -0.16], clavicleR: [0, 0, 0.14],
    upperArmL: [-0.96, 0.20, 0.26], lowerArmL: [-0.42, 0, 0], handL: [0.36, 0, 0],
    upperArmR: [-0.94, -0.18, -0.24], lowerArmR: [-0.44, 0, 0], handR: [0.34, 0, 0],
    thighL: [-0.16, 0, 0.04], thighR: [0.10, 0, -0.04],
  }),

  /** Prompto: one hand on the car, the other braced on his own knee. Flagging. */
  push_tired: hold({
    spine01: [0.40, 0.10, 0.03], spine02: [0.33, 0.07, 0.02], spine03: [0.22, -0.06, 0],
    neck: [-0.36, -0.10, 0], head: [-0.32, -0.14, 0.03],
    clavicleL: [0, 0, -0.06], clavicleR: [0, 0, 0.14],
    upperArmL: [-1.06, 0.08, 0.10], lowerArmL: [-0.22, 0, 0], handL: [0.36, 0, 0],
    upperArmR: [-0.30, -0.26, -0.22], lowerArmR: [-1.20, 0, 0], handR: [0.20, 0, 0.25],
  }),

  /** Straightened up, hands off, catching breath. The release after the push. */
  breathe: hold({
    spine01: [-0.05, 0.02, 0], spine02: [-0.04, 0, 0], spine03: [-0.06, -0.03, 0],
    neck: [-0.10, 0, 0], head: [-0.06, 0.04, 0],
    upperArmL: [-0.30, 0.20, 0.30], lowerArmL: [-1.05, 0, 0], handL: [0.15, 0, 0.30],
    upperArmR: [-0.28, -0.20, -0.28], lowerArmR: [-1.02, 0, 0], handR: [0.15, 0, -0.30],
  }),

  /** Hands on hips, weight back — Gladio's default standing attitude. */
  hips: hold({
    spine03: [-0.04, 0.03, 0], neck: [0.03, -0.02, 0],
    upperArmL: [-0.18, 0.32, 0.52], lowerArmL: [-1.62, 0.15, 0], handL: [0.1, 0, 0.4],
    upperArmR: [-0.16, -0.32, -0.50], lowerArmR: [-1.60, -0.15, 0], handR: [0.1, 0, -0.4],
  }),

  /** Arms folded. Ignis waiting, Gladio unimpressed. */
  folded: hold({
    spine03: [0.04, 0.02, 0], neck: [-0.03, 0, 0],
    upperArmL: [-0.72, 0.36, 0.34], lowerArmL: [-1.86, 0.30, 0], handL: [0.2, 0, 0.35],
    upperArmR: [-0.70, -0.36, -0.32], lowerArmR: [-1.84, -0.30, 0], handR: [0.2, 0, -0.35],
  }),

  /** One hand adjusting the glasses. Ignis's tell, and the whole character. */
  glasses: hold({
    spine03: [0.02, -0.06, 0], neck: [0.05, 0.06, 0], head: [0.03, 0.05, 0],
    upperArmR: [-1.72, -0.34, -0.32], lowerArmR: [-1.62, -0.20, 0], handR: [0.28, 0, -0.15],
    upperArmL: [-0.10, 0.04, 0.10], lowerArmL: [-0.22, 0, 0],
  }, 0.55),

  /** Hands shading the eyes, reading the horizon. */
  shade_eyes: hold({
    spine03: [-0.06, 0.04, 0], neck: [-0.14, 0.02, 0], head: [-0.12, 0.03, 0],
    upperArmR: [-2.05, -0.20, -0.34], lowerArmR: [-1.40, 0, 0], handR: [0.42, 0, -0.10],
    upperArmL: [-0.08, 0, 0.10], lowerArmL: [-0.24, 0, 0],
  }, 0.5),

  /** Camera up to the eye. Prompto's answer to every landscape. */
  photograph: hold({
    spine03: [0.05, -0.04, 0], neck: [-0.05, 0.03, 0], head: [-0.04, 0.02, 0],
    upperArmL: [-1.60, 0.30, 0.30], lowerArmL: [-1.72, 0.22, 0], handL: [0.3, 0, 0.2],
    upperArmR: [-1.58, -0.28, -0.28], lowerArmR: [-1.70, -0.22, 0], handR: [0.3, 0, -0.2],
  }, 0.4),

  /** Pointing off down the road. */
  point: hold({
    spine03: [0.02, -0.16, 0], neck: [0, 0.14, 0], head: [-0.04, 0.12, 0],
    upperArmR: [-1.48, -0.10, -0.16], lowerArmR: [-0.10, 0, 0], handR: [0.05, 0, 0],
    upperArmL: [-0.06, 0, 0.08], lowerArmL: [-0.20, 0, 0],
  }, 0.4),

  /** Hands in pockets, shoulders down. Noctis, whenever nothing is required. */
  pockets: hold({
    spine01: [0.04, 0, 0], spine02: [0.05, 0.02, 0], spine03: [0.08, -0.03, 0],
    neck: [0.06, 0.02, 0], head: [0.06, 0.04, 0],
    clavicleL: [0, 0, 0.08], clavicleR: [0, 0, -0.08],
    upperArmL: [0.16, 0.10, 0.16], lowerArmL: [-0.62, 0.10, 0], handL: [0.2, 0, 0.2],
    upperArmR: [0.16, -0.10, -0.16], lowerArmR: [-0.60, -0.10, 0], handR: [0.2, 0, -0.2],
  }, 0.5),

  /** Looking up at something enormous. Used for the Astral. */
  awe: hold({
    spine01: [-0.10, 0, 0], spine02: [-0.09, 0.02, 0], spine03: [-0.11, -0.02, 0],
    neck: [-0.32, 0.02, 0], head: [-0.30, 0.04, 0],
    upperArmL: [0.10, 0.06, 0.20], lowerArmL: [-0.34, 0, 0],
    upperArmR: [0.10, -0.06, -0.20], lowerArmR: [-0.32, 0, 0],
  }, 0.6),

  /** Braced against a shockwave, forearm across the face. */
  brace: hold({
    spine01: [0.22, 0.06, 0], spine02: [0.20, 0.04, 0], spine03: [0.16, -0.04, 0],
    neck: [-0.10, -0.04, 0], head: [-0.12, -0.05, 0],
    upperArmL: [-1.72, 0.42, 0.46], lowerArmL: [-1.94, 0.30, 0], handL: [0.3, 0, 0.3],
    upperArmR: [-1.10, -0.30, -0.40], lowerArmR: [-1.30, -0.20, 0], handR: [0.25, 0, -0.2],
  }, 0.28),
};

/**
 * Install a held pose on a character by handing the animator an action
 * definition directly. `Character.play()` can only name poses that ship in
 * ACTIONS; cinematic poses live here instead, so they go in through the same
 * door the table would have used.
 *
 * @param {object} character a `Character` from `src/characters/rig/Character.js`
 * @param {string|null} name key in {@link POSES}, or null to release
 * @param {number} [speed=1]
 */
export function setPose(character, name, speed = 1) {
  const anim = character && character.anim;
  if (!anim) return;
  if (!name) {
    if (anim.action && anim.action.cinematic) anim.stopAction();
    return;
  }
  const def = POSES[name];
  if (!def) return;
  if (anim.action && anim.action.name === name) return;      // already held
  anim.action = { def, name, t: 0, speed, w: 0, hold: true, cinematic: true };
}
