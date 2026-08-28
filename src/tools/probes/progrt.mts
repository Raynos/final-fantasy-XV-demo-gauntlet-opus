// Is half the program set a duplicate of the other half, differing only in
// whether a render target was bound when it compiled?
//
// three's `getParameters` reads two fields off the CURRENT render target:
//
//   outputColorSpace : renderer.outputColorSpace  when target === null,
//                      LinearSRGBColorSpace       otherwise
//   toneMapping      : renderer.toneMapping       when target === null,
//                      NoToneMapping              otherwise
//
// Both are in the program cache key. So the same material compiles to two
// different programs depending on whether it was compiled to the canvas or to
// a target -- and this game renders every scene pixel THROUGH PostFX, i.e.
// into a target. Anything compiled with no target bound is therefore a shape
// the shipped frame never asks for.
//
// Held separately, neither field looks like much (the single-field collapse
// says 4 and 1). They have to be held constant TOGETHER, because they are the
// same underlying condition.
//
// Run: node src/tools/probe.mts src/tools/probes/progrt.mts --dirty
const g = window.GAME;
const progs = g.renderer.info.programs || [];

// tail layout: 48 params, maskA, maskB, outputColorSpace, custom.
// outColorSpace is params[1], toneMapping is params[44].
const PREC = { highp: 1, mediump: 1, lowp: 1 };
const TAIL = 52;
function split(k) {
  const t = String(k).split(',');
  for (let i = 0; i < t.length - TAIL + 1; i++) if (PREC[t[i]] && (t.length - i) >= TAIL) return { t, base: i };
  return null;
}

const rows = [];
for (const p of progs) {
  const s = split(p.cacheKey);
  if (!s) continue;
  const { t, base } = s;
  const norm = t.slice();
  norm[base + 1] = 'CS';        // outputColorSpace (the parameter)
  norm[base + 44] = 'TM';       // toneMapping
  rows.push({
    name: p.name || '(unnamed)',
    kind: t.slice(0, base).join(',').split(',')[0],
    cs: t[base + 1],
    tm: t[base + 44],
    used: p.usedTimes,
    norm: norm.join(','),
  });
}

const xtab = (rs, fn) => { const h = {}; for (const r of rs) { const k = fn(r); h[k] = (h[k] || 0) + 1; } return h; };

// how many programs survive if "was a render target bound" is held constant
const classes = new Map();
for (const r of rows) {
  const c = classes.get(r.norm) || [];
  c.push(r); classes.set(r.norm, c);
}
const twins = [...classes.values()].filter((c) => c.length > 1);

return {
  programs: progs.length,
  decoded: rows.length,
  byColorSpace: xtab(rows, (r) => r.cs),
  byToneMapping: xtab(rows, (r) => r.tm),
  byPair: xtab(rows, (r) => r.cs + '/' + r.tm),
  byPairAndKind: xtab(rows, (r) => r.cs + '/' + r.tm + '/' + r.kind),
  distinctIgnoringTarget: classes.size,
  savesIfTargetHeldConstant: rows.length - classes.size,
  twinPairs: twins.length,
  twinExamples: twins.slice(0, 12).map((c) => ({ n: c.length, kind: c[0].kind, names: c.map((r) => r.name), pairs: c.map((r) => r.cs + '/' + r.tm) })),
};
