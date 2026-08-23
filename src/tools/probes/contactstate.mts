// Is the contact-shadow pass actually running, and does `?post=nocontact`
// reach it? A `--ablate` that moves 0.000/255 is either a pass that does
// nothing or a token that never lands, and `BRIEF.md` says never to read the
// null as innocence.
const g = window.GAME;
const out = {};
const fx = g.post;
const c = fx && fx.contact;
out.hasPass = !!c;
if (c) {
  out.contact = {
    enabled: c.enabled,
    length: c.length,
    thickness: c.thickness,
    bias: c.bias,
    maxDistance: c.maxDistance,
    strength: c.strength,
    inChain: fx.composer && fx.composer.passes ? fx.composer.passes.some((p) => p === c) : null,
  };
}
out.query = location.search;
if (fx && fx.composer && fx.composer.passes) {
  out.passes = fx.composer.passes.map((p) => ({
    name: p.constructor && p.constructor.name, enabled: p.enabled !== false,
  }));
}
for (const shot of ['hero_full', 'zone_fallgrove']) {
  g.applyShot(shot);
  g.settle(40);
  g.applyShot(shot);
  g.settle(8);
  const s = {};
  if (c) { s.enabled = c.enabled; s.maxDistance = c.maxDistance; }
  const sky = g.get('Sky');
  if (sky && sky.sunDir) s.sunElevDeg = +(Math.asin(Math.max(-1, Math.min(1, sky.sunDir.y))) * 180 / Math.PI).toFixed(1);
  s.camY = +g.camera.position.y.toFixed(1);
  out[shot] = s;
}
return out;
