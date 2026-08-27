// Is drawcheck's +15 a lazily-built enemy prototype?
//
// Two full-corpus passes disagreed on 25 of 142 shots, and **nine of them
// differed by exactly +15** with `setpiece_deadeye` at -60 = 4x15. A shared
// constant across unrelated shots is not noise: it is one thing being present
// or absent. `Enemies.prototype()` builds a species' geometry on first spawn
// and caches it forever, so whether it exists is a function of run history --
// exactly the shape required.
//
// Three arms on ONE page, so nothing else can differ:
//   1. COLD    pose each shot with the prototype cache as boot left it.
//   2. WARM    call GAME.warmup() -- build every species -- and pose again.
//   3. AGAIN   pose a third time, to show WARM is a floor and not a drift.
//
// If arm 2 minus arm 1 is +15 on the nine shots, the diagnosis is proved and
// `warmup()` in the daemon's /shots path is the fix.
//
// Run: node src/tools/probe.mts src/tools/probes/warmquantum.mts --dirty
const g = window.GAME;
const SHOTS = String(window.__WQ_SHOTS || [
  'storm', 'town_diner', 'vista_dawn', 'vista_dusk', 'vista_night',
  'zone_callaegh', 'zone_cape_caem', 'zone_lestallum', 'poi_dungeon_mouth',
  'setpiece_deadeye', 'town_wide', 'hero_closeup',
].join(',')).split(',');

/** Exactly the pose `routeShots` performs, so these are the gate's numbers. */
function pose(n) {
  g.resetClock();
  g.applyShot(n); g.settle(60);
  g.applyShot(n); g.settle(8);
  return g.renderer.info.render.calls;
}

const protos = () => {
  const e = g.get('Enemies');
  return e && e.prototypes ? e.prototypes.size : -1;
};

const cold = {};
const protosAtStart = protos();
for (const n of SHOTS) cold[n] = pose(n);

// Build every species' prototype. This is the whole treatment.
const t0 = performance.now();
g.warmup();
const warmMs = performance.now() - t0;
const protosAfter = protos();

const warm = {};
for (const n of SHOTS) warm[n] = pose(n);

const again = {};
for (const n of SHOTS) again[n] = pose(n);

const rows = SHOTS.map((n) => ({
  shot: n,
  cold: cold[n],
  warm: warm[n],
  again: again[n],
  deltaWarm: warm[n] - cold[n],
  stableAfterWarm: warm[n] === again[n],
}));

const moved = rows.filter((r) => r.deltaWarm !== 0);
const quanta = [...new Set(moved.map((r) => r.deltaWarm))].sort((a, b) => a - b);

return {
  prototypesBeforeWarmup: protosAtStart,
  prototypesAfterWarmup: protosAfter,
  warmupMs: +warmMs.toFixed(1),
  rows,
  shotsMoved: moved.length,
  distinctDeltas: quanta,
  // The reading that matters: does warming make a second pass reproduce the first?
  stableAfterWarmup: rows.every((r) => r.stableAfterWarm),
  verdict: moved.length === 0
    ? 'warmup changed nothing — the prototypes were already built, look elsewhere'
    : `warmup moved ${moved.length}/${rows.length} shots by ${quanta.join(', ')} calls `
      + `(${protosAfter - protosAtStart} prototypes built) — lazy construction IS the variable`,
};
