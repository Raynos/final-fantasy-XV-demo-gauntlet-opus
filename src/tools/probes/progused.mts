// Of the 271 programs this page compiles at boot, how many does a real frame
// ever BIND?
//
// The program count on its own cannot tell waste from content: 271 programs
// might be 271 genuinely different surfaces. The only thing that separates
// them is whether the GPU is ever asked to run one. So hook `gl.useProgram`,
// pose a spread of the corpus, and take the set difference.
//
// `renderer.info.programs` holds three's `WebGLProgram` wrappers, each with a
// `.program` (the raw GL object) and the `.cacheKey` three derived for it, so
// the used set maps back to named, attributable rows.
//
// Anything compiled at boot and never bound across the whole spread is boot
// cost with no draw behind it. Anything compiled DURING the spread is a
// warm-up miss -- a hitch waiting for a player.
//
// Run: node src/tools/probe.mts src/tools/probes/progused.mts --dirty
const g = window.GAME;
const gl = g.renderer.getContext();

const SHOTS = String(window.__PU_SHOTS || [
  'hero_full', 'town_forecourt', 'vista_dusk', 'vista_night', 'storm',
  'zone_longwythe', 'poi_haven', 'town_diner', 'setpiece_deadeye',
  'party_walk', 'boss_astral', 'daycycle_dawn',
].join(',')).split(',').filter(Boolean);

/**
 * cacheKey -> the fields we want to attribute an unused program with.
 *
 * `rt` is the one that matters most: three keys BOTH `outputColorSpace` and
 * `toneMapping` on whether a render target was bound at compile time, so every
 * material compiled to the canvas is a twin of the same material compiled to a
 * target. This game renders every scene pixel through `EffectComposer`, which
 * owns a target, so `rt: 0` should never be bound by a real frame.
 */
const PREC = { highp: 1, mediump: 1, lowp: 1 };
function tag(p) {
  const k = String(p.cacheKey);
  const t = k.split(',');
  let base = -1;
  for (let i = 0; i < t.length - 52 + 1; i++) if (PREC[t[i]] && (t.length - i) >= 52) { base = i; break; }
  const head = base >= 0 ? t.slice(0, base).join(',') : k.split(',highp,')[0];
  return {
    name: p.name || '',
    kind: head.split(',')[0],
    csm: /USE_CSM/.test(k) ? 1 : 0,
    atmo: /atmo1\|/.test(k) ? 1 : 0,
    rt: base >= 0 ? (t[base + 1] === 'srgb-linear' && t[base + 44] === '0' ? 1 : 0) : -1,
    used: p.usedTimes,
  };
}

const before = (g.renderer.info.programs || []).slice();
const idOf = new Map();
for (const p of before) idOf.set(p.program, p);

const bound = new Set();
const raw = gl.useProgram.bind(gl);
gl.useProgram = function (prog) { if (prog) bound.add(prog); return raw(prog); };

const posed = [];
try {
  for (const n of SHOTS) {
    const p0 = (g.renderer.info.programs || []).length;
    try {
      g.resetClock();
      g.applyShot(n); g.settle(60);
      g.applyShot(n); g.settle(8);
    } catch (e) { posed.push({ shot: n, error: String(e && e.message || e) }); continue; }
    const p1 = (g.renderer.info.programs || []).length;
    posed.push({ shot: n, newPrograms: p1 - p0, bound: bound.size });
  }
} finally {
  gl.useProgram = raw;
}

const after = (g.renderer.info.programs || []).slice();
const bornDuring = after.filter((p) => !idOf.has(p.program));

const usedRows = [], unusedRows = [];
for (const p of after) (bound.has(p.program) ? usedRows : unusedRows).push(tag(p));

const xtab = (rows, fn) => { const h = {}; for (const r of rows) { const k = fn(r); h[k] = (h[k] || 0) + 1; } return h; };
const cls = (r) => r.kind + (r.csm ? '+csm' : '') + (r.atmo ? '+atmo' : '') + (r.rt ? '+rt' : '+canvas');

return {
  programsAtStart: before.length,
  programsAtEnd: after.length,
  compiledDuringPoses: bornDuring.length,
  bornDuring: bornDuring.slice(0, 30).map(tag),
  boundTotal: bound.size,
  usedOfHeld: usedRows.length,
  unusedOfHeld: unusedRows.length,
  usedByClass: xtab(usedRows, cls),
  unusedByClass: xtab(unusedRows, cls),
  unusedNames: xtab(unusedRows, (r) => r.name || '(unnamed)'),
  posed,
};
