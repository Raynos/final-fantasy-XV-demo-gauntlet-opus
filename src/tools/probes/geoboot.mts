// geometry-bake: the boot profile, and whether the geometry cache was live.
//
//   node src/tools/probe.mts src/tools/probes/geoboot.mts --dirty
const p = window.BOOT_PROFILE || { marks: [], total: 0 };
const want = /poiPrebuild|Props\.mega|Props\.rocks|Water\.shore|Water\.geobake|Props\.geobake|Props\.texbake|Sky\.texbake|trees\.build|bushes\.build/;
return {
  total: +(p.total || 0).toFixed(0),
  nav: p.nav,
  marks: p.marks.filter((m) => want.test(m.name)).map((m) => `${m.name.trim()} ${m.ms}`),
  systems: p.marks.filter((m) => !m.name.startsWith('  ')).map((m) => `${m.name} ${m.ms}`),
};
