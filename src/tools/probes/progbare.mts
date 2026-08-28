// The 60 lit programs nothing ever draws: who are they?
//
// `progused.mts` shows 60 `physical` programs with neither the CSM defines nor
// the `atmo1|` cache-key prefix, and no frame in a twelve-shot spread binds one
// of them. `progphase.mts` shows they are NOT compiled by any system's init --
// 267 of 271 programs are born inside `postfx+compile+warmup`, and
// `Warmup._compileScene` runs `_patchAll()` (which is `MaterialPatch.scan`)
// BEFORE `renderer.compile`. So a lit material reached the compiler unpatched
// even though the patch had just walked the scene.
//
// This names them, and cross-references the live scene: for every material in
// the graph, is it patched, and does its `customProgramCacheKey` actually
// return the `atmo1|` prefix (a CLONE of a patched material inherits
// `userData.__atmo` through `Material.copy`, which makes `patch()` skip it,
// but does NOT inherit the assigned `onBeforeCompile` / `customProgramCacheKey`).
//
// Run: node src/tools/probe.mts src/tools/probes/progbare.mts --dirty
const g = window.GAME;
const progs = g.renderer.info.programs || [];
const bareLit = [];
for (const p of progs) {
  const k = String(p.cacheKey);
  if (!/^physical/.test(k)) continue;
  if (/atmo1\|/.test(k)) continue;
  bareLit.push({ name: p.name || '(unnamed)', used: p.usedTimes, custom: k.slice(k.lastIndexOf(',') - 40) });
}

// Every material in the graph, and whether it is REALLY patched.
const seen = new Set();
const mats = [];
g.scene.traverse((o) => {
  const l = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []);
  for (const m of l) {
    if (!m || seen.has(m)) continue;
    seen.add(m);
    let key = '';
    try { key = m.customProgramCacheKey ? String(m.customProgramCacheKey()) : ''; } catch (e) { key = 'ERR'; }
    mats.push({
      name: m.name || '(unnamed)',
      type: m.type,
      flagged: !!(m.userData && m.userData.__atmo),
      keyed: /^atmo1\|/.test(key),
      visible: o.visible,
      lit: !!(m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial),
    });
  }
});

const lit = mats.filter((m) => m.lit);
const liar = lit.filter((m) => m.flagged && !m.keyed);   // patched-flag without the patch
const missed = lit.filter((m) => !m.flagged);            // never seen by the scan

const xtab = (rows, fn) => { const h = {}; for (const r of rows) { const k = fn(r); h[k] = (h[k] || 0) + 1; } return h; };

return {
  programs: progs.length,
  bareLitPrograms: bareLit.length,
  bareLitUsedTimes: bareLit.reduce((a, r) => a + r.used, 0),
  bareLitNames: xtab(bareLit, (r) => r.name),
  sceneMaterials: mats.length,
  litMaterials: lit.length,
  flaggedButUnpatched: liar.length,
  flaggedButUnpatchedNames: xtab(liar, (r) => r.name + '/' + r.type),
  neverScanned: missed.length,
  neverScannedNames: xtab(missed, (r) => r.name + '/' + r.type),
  patchCount: g.get('Sky') && g.get('Sky').patch ? g.get('Sky').patch.count : null,
};
