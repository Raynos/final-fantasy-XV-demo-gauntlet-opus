/*
 * The Regalia, close, at noon, on pale gravel — the playtest's own framing.
 *
 * "It's a flat black silhouette from every angle, in full midday sun, on
 * bright pale gravel — no paint, no glass, no lights, no panel lines."
 *
 * `Shots.ts` has six posed Regalia frames and every one of them is either a
 * long lens at 17:24 or a bonnet camera pointing into a low sun, so none of
 * them is the frame the complaint is about. This one puts the camera three
 * quarters on at ~6 m with the sun overhead, which is the condition under
 * which a car with no environment map is unambiguously a cut-out.
 *
 * Two things this probe had to learn the hard way, both worth copying:
 *
 *  - `reg.root` is a group parked at the origin. `reg.body.pos` is where the
 *    car actually is. Aiming at the root photographs the party standing in a
 *    field, which looks exactly like a probe that worked.
 *  - **Writing `g.camera.position` and then calling `g.frame()` does nothing**
 *    — the camera rig owns the lens and overwrites it every tick. A framing
 *    has to go through `SHOTS.__probe` + `applyShot`, the trick `framecam.mts`
 *    and `citydraws.mts` use.
 *
 * Run: node src/tools/probe.mts src/tools/probes/carlook.mts --dirty \
 *        --shot tmp/shots/l12d-carlook/c.jpg
 */
const g = window.GAME;
const { SHOTS } = await import('/game/Shots.ts');

g.applyShot('regalia_road');
g.settle(30);
const reg = g.get('Regalia');
const bp = reg?.body?.pos;
if (!bp) return 'no drivable Regalia';
const cx = bp.x, cy = bp.y + 0.75, cz = bp.z;

const look = async (name, ax, ay, az, dist, time) => {
  const L = Math.hypot(ax, ay, az);
  SHOTS.__probe = {
    pos: [cx + ax / L * dist, cy + ay / L * dist, cz + az / L * dist],
    target: [cx, cy, cz],
    fov: 42, time, weather: 'clear', hud: false,
  };
  g.applyShot('__probe');
  g.settle(60);
  if (window.__shot) await window.__shot(name);
};

await look('front34_noon', 0.86, 0.34, 0.82, 6.2, 12.4);
await look('rear34_noon', -0.80, 0.30, -0.90, 6.4, 12.4);
await look('flank_noon', 0.06, 0.22, 1.0, 7.0, 12.4);
delete SHOTS.__probe;

const mats = reg.built?.envMats || [];
return mats.map((m) => `${String(m.name).padEnd(7)} envMap=${m.envMap ? 'live' : 'NULL'} `
  + `i=${m.envMapIntensity.toFixed(2)} base=${m.userData.baseEnvI}`).join('\n')
  + `\ncar at ${cx.toFixed(0)}, ${cz.toFixed(0)}`
  + `\nscene.environment=${g.scene.environment ? 'set' : 'null'} `
  + `intensity=${g.scene.environmentIntensity}`;
