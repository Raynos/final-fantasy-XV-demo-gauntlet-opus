/**
 * **Is the Meteor's fissure glow dim, or is it buried inside the rock?**
 *
 *   node src/tools/probe.mts src/tools/probes/meteorglow.mts --dirty \
 *     --shot tmp/p4/glow.png --set __MG_SHOT=zone_mencemoor
 *
 * §WS-13 says the Disc "reads as a pale grey dome, not a meteorite, and the
 * fissure glow its own doc promises is not visible from there". There are two
 * completely different reasons that could be true and they have opposite fixes:
 * the 22 emissive slabs are **too faint** at 1.7 km under a bright sky, or they
 * are **occluded** — `_meteorParts` puts them at the midpoints between
 * neighbouring masses on the theory that a midpoint is a cleft, and the masses
 * run r 165–300 m at centres 300–360 m apart, so a midpoint may be solidly
 * inside both of them.
 *
 * A positive control settles it in one pair of captures, which is the idiom
 * `BRIEF.md` asks for: crank `meteorGlow.emissiveIntensity` by `__MG_GAIN`
 * (default 40x) and re-shoot. **If the glow is merely dim it lights up; if it
 * is entombed, forty times nothing is still nothing.** Set `__MG_GAIN=1` for
 * the control arm, so both frames come off the same page with the same TAA
 * history and the only difference is the uniform.
 *
 * It also reports each slab's world position and its distance to the centre of
 * every mass, so a positive verdict comes with the arithmetic that explains it.
 */
const g = window.GAME;
const SHOT = String(window.__MG_SHOT || 'zone_mencemoor');
const GAIN = Number(window.__MG_GAIN ?? 40);

const mega = g.get('Megastructures') || (g.get('Props') && g.get('Props').mega);
const mats = mega && mega.mats;
if (!mats || !mats.meteorGlow) return { error: 'no Megastructures.mats.meteorGlow' };

g.resetClock();
g.applyShot(SHOT); g.settle(60);
// After `applyShot`, which re-applies the quality tier and the time of day —
// `Megastructures` ramps this uniform off the day cycle every frame, so setting
// it before the settle would be overwritten.
const was = mats.meteorGlow.emissiveIntensity;
// **Not `emissiveIntensity`.** `Megastructures.update` writes that uniform
// every frame off the day cycle (`1.6 + 1.4 * night`), so a value set here is
// gone by the next settle -- the first run of this probe reported
// "1.6 -> 1.6" and photographed the control twice. The emissive COLOUR is
// nothing else's business, so the gain rides there.
mats.meteorGlow.emissive.multiplyScalar(GAIN);
mats.meteorGlow.needsUpdate = true;
g.settle(4);

// Where the slabs actually are, and how deep inside a mass each one sits.
const scene = g.scene;
scene.updateMatrixWorld(true);
let glow = null, stone = null;
scene.traverse((o) => {
  if (!o.isMesh) return;
  if (o.name === 'meteor_mega_meteorGlow') glow = o;
  if (o.name === 'meteor_mega_stone') stone = o;
});

const bb = (o) => {
  if (!o) return null;
  if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
  const b = o.geometry.boundingBox;
  return {
    min: [+b.min.x.toFixed(0), +b.min.y.toFixed(0), +b.min.z.toFixed(0)],
    max: [+b.max.x.toFixed(0), +b.max.y.toFixed(0), +b.max.z.toFixed(0)],
    verts: o.geometry.attributes.position.count,
  };
};

/*
 * Both meshes are one merged geometry each, so a per-slab position has to come
 * off the position buffer: the glow slabs are boxes, so their 24-vertex groups
 * are contiguous and a centroid per group is exact.
 */
const slabs = [];
if (glow) {
  const p = glow.geometry.attributes.position;
  const per = 24;
  for (let s = 0; s + per <= p.count; s += per) {
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < per; i++) { cx += p.getX(s + i); cy += p.getY(s + i); cz += p.getZ(s + i); }
    slabs.push([+(cx / per).toFixed(0), +(cy / per).toFixed(0), +(cz / per).toFixed(0)]);
  }
}

const cam = g.camera;
return {
  shot: SHOT, gain: GAIN, emissiveWas: was, emissive: '#' + mats.meteorGlow.emissive.getHexString(), emissiveRgb: [mats.meteorGlow.emissive.r, mats.meteorGlow.emissive.g, mats.meteorGlow.emissive.b],
  camera: [Math.round(cam.position.x), Math.round(cam.position.y), Math.round(cam.position.z)],
  glowBox: bb(glow), stoneBox: bb(stone),
  slabCount: slabs.length,
  slabs: slabs.slice(0, 24),
};
