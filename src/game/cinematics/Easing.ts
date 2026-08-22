/**
 * Easing curves for cinematic camera moves.
 *
 * A camera move reads as *directed* rather than *animated* almost entirely
 * because of its acceleration profile: a dolly that starts and stops on a
 * cosine feels like a crane operator, a linear one feels like a spreadsheet.
 * Every curve here is C0 at 0 and 1 so a keyframe chain never pops.
 */

const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

export const EASE = {
  linear: (t: number) => clamp01(t),
  in: (t: number) => { t = clamp01(t); return t * t; },
  out: (t: number) => { t = clamp01(t); return 1 - (1 - t) * (1 - t); },
  inOut: (t: number) => { t = clamp01(t); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
  inCubic: (t: number) => { t = clamp01(t); return t * t * t; },
  outCubic: (t: number) => { t = clamp01(t); return 1 - Math.pow(1 - t, 3); },
  inOutCubic: (t: number) => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
  outQuint: (t: number) => 1 - Math.pow(1 - clamp01(t), 5),
  inOutSine: (t: number) => -(Math.cos(Math.PI * clamp01(t)) - 1) / 2,
  outSine: (t: number) => Math.sin((clamp01(t) * Math.PI) / 2),
  inSine: (t: number) => 1 - Math.cos((clamp01(t) * Math.PI) / 2),
  /** Long slow settle — the workhorse for a held push-in. */
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -9 * clamp01(t))),
  /** Almost linear in the middle, kissed off at both ends. Crane moves. */
  crane: (t: number) => { t = clamp01(t); return t * t * (3 - 2 * t); },
};

/** Resolve an ease by name (or pass a function straight through). */
export function ease(nameOrFn: any) {
  if (typeof nameOrFn === 'function') return nameOrFn;
  return EASE[nameOrFn as keyof typeof EASE] || EASE.inOutSine;
}

export { clamp01 };

/** Scalar lerp. */
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Catmull-Rom through four scalars. Used for camera paths with three or more
 * keys so the dolly curves instead of hinging at every keyframe.
 */
export function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
