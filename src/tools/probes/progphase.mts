// Which system's `init()` compiles the shader programs that are later thrown
// away?
//
// `MaterialPatch.patch` installs BOTH the CSM hook and the atmosphere injection
// and prepends `atmo1|` to the cache key, so a lit material compiled before the
// patch reaches it keys apart from the same material after. `progused.mts`
// shows 60 bare `physical` programs that no frame in the corpus ever binds.
// This says who paid for them, by reading the per-phase program count
// `BootProfile` records at the end of every system's `init()`.
//
// Run: node src/tools/probe.mts src/tools/probes/progphase.mts --dirty
const b = window.BOOT_PROFILE;
if (!b) return { error: 'no BOOT_PROFILE on this page' };
const rows = [];
let prev = 0;
for (const m of b.marks) {
  if (m.progs === undefined) { rows.push({ name: m.name, ms: m.ms }); continue; }
  rows.push({ name: m.name, ms: m.ms, progs: m.progs, d: m.progs - prev });
  prev = m.progs;
}
const g = window.GAME;
const sky = g.get('Sky');
return {
  total: b.total,
  ready: b.ready,
  marks: rows.filter((r) => r.d === undefined || r.d !== 0 || r.ms > 40),
  compilers: rows.filter((r) => r.d > 0),
  patchCount: sky && sky.patch ? sky.patch.count : null,
  programsNow: g.renderer.info.programs.length,
  warmup: b.warmup ? b.warmup.steps : null,
};
