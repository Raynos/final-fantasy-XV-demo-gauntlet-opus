// Three frames of the same page, one shot, differing only in the grain term:
// full amplitude everywhere, the sky mask at 0.3, and no grain at all. Same
// TAA history, same exposure, same boot -- which two cold captures are not.
const g = window.GAME;
const u = g.post.grade.uniforms;
g.resetClock();
g.applyShot('vista_noon'); g.settle(40); g.applyShot('vista_noon'); g.settle(12);

const grain0 = u.uGrain.value;
const shot = async (name, sky, grain) => {
  u.uGrainSky.value = sky;
  // `_applyGrade` re-reads the preset every frame, so uGrain has to be pinned
  // after the update rather than before it. settle() runs updates; frame the
  // pin in between by writing it and drawing exactly one frame.
  for (let i = 0; i < 8; i++) { g.frame(1 / 60); u.uGrain.value = grain; g.post.render ? null : null; }
  u.uGrain.value = grain;
  await window.__shot(name);
};

await shot('skyfull', 1.0, grain0);
await shot('skymask', 0.3, grain0);
await shot('nograin', 1.0, 0);
u.uGrain.value = grain0; u.uGrainSky.value = 0.3;
return { grain0, note: 'three frames written next to --shot' };
