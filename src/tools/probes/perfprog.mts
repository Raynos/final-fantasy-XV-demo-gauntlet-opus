// perf-r2: which programs exist at boot, and what is the town's state?
const g = window.GAME;
const names = g.renderer.info.programs.map((p) => p.name).sort();
const town = g.get('Town');
const counts = {};
for (const n of names) counts[n] = (counts[n] || 0) + 1;
return {
  total: names.length,
  townish: names.filter((n) => /town|sign|hh/i.test(n)),
  townState: town ? {
    hasShell: !!town.shell,
    shellVisible: town.shell && town.shell.visible,
    clutterVisible: town.clutter && town.clutter.visible,
    cast: town._cast,
    mats: town.mats ? Object.keys(town.mats).length : 0,
    matNames: town.mats ? Object.values(town.mats).map((m) => m && m.name).filter(Boolean) : [],
  } : null,
  warmup: g.post && g.post.warmupReport ? g.post.warmupReport.steps : null,
};
