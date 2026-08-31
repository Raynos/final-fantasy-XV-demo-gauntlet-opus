// Is the new UI scale a no-op on every viewport the corpus uses?
//
// The old expression was `clamp(fit, 0.72, 1.5)`, which RAISES any fit below
// 0.72 — that is the bug, and it only bites under 1152x648. The new one is
// `clamp(fit, min(0.72, fit), 1.5)`. Above the knee they must agree exactly,
// or 166 shots re-baseline.
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const oldS = (w, h) => clamp(Math.min(w / 1600, h / 900), 0.72, 1.5);
const newS = (w, h, d = { w: 1600, h: 900 }) => {
  const fit = Math.min(w / d.w, h / d.h);
  return clamp(fit, Math.min(0.72, fit), 1.5);
};
const PHONE = { w: 1100, h: 620 };

const cases = [
  [1600, 900], [1920, 1080], [1280, 720], [1152, 648],   // at and above the knee
  [844, 390], [390, 844], [932, 430], [800, 600],        // below it
];
const rows = cases.map(([w, h]) => ({
  vp: `${w}x${h}`,
  old: +oldS(w, h).toFixed(4),
  now: +newS(w, h).toFixed(4),
  same: oldS(w, h) === newS(w, h),
  phoneBox: +newS(w, h, PHONE).toFixed(4),
}));

return {
  live: { w: window.innerWidth, h: window.innerHeight },
  liveAgrees: oldS(window.innerWidth, window.innerHeight) === newS(window.innerWidth, window.innerHeight),
  rows,
  atOrAboveKneeAllAgree: rows.slice(0, 4).every((r) => r.same),
  belowKneeAllDiffer: rows.slice(4).every((r) => !r.same),
};
