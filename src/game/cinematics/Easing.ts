/**
 * Easing curves for cinematic camera moves.
 *
 * A camera move reads as *directed* rather than *animated* almost entirely
 * because of its acceleration profile: a dolly that starts and stops on a
 * cosine feels like a crane operator, a linear one feels like a spreadsheet.
 * Every curve here is C0 at 0 and 1 so a keyframe chain never pops.
 */

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

export const EASE = {
  linear: (t) => clamp01(t),
  in: (t) => { t = clamp01(t); return t * t; },
  out: (t) => { t = clamp01(t); return 1 - (1 - t) * (1 - t); },
  inOut: (t) => { t = clamp01(t); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
  inCubic: (t) => { t = clamp01(t); return t * t * t; },
  outCubic: (t) => { t = clamp01(t); return 1 - Math.pow(1 - t, 3); },
  inOutCubic: (t) => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
  outQuint: (t) => 1 - Math.pow(1 - clamp01(t), 5),
  inOutSine: (t) => -(Math.cos(Math.PI * clamp01(t)) - 1) / 2,
  outSine: (t) => Math.sin((clamp01(t) * Math.PI) / 2),
  inSine: (t) => 1 - Math.cos((clamp01(t) * Math.PI) / 2),
  /** Long slow settle — the workhorse for a held push-in. */
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -9 * clamp01(t))),
  /** Almost linear in the middle, kissed off at both ends. Crane moves. */
  crane: (t) => { t = clamp01(t); return t * t * (3 - 2 * t); },
};

/** Resolve an ease by name (or pass a function straight through). */
export function ease(nameOrFn) {
  if (typeof nameOrFn === 'function') return nameOrFn;
  return EASE[nameOrFn] || EASE.inOutSine;
}

export { clamp01 };

/** Scalar lerp. */
export const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Catmull-Rom through four scalars. Used for camera paths with three or more
 * keys so the dolly curves instead of hinging at every keyframe.
 */
export function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
