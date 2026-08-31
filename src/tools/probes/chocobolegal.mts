/*
 * Stand the bird where it must refuse: water, and anything over 50 degrees.
 *
 *   node src/tools/probe.mts src/tools/probes/chocobolegal.mts --ttl 90
 *
 * `ChocoboSystem.canStandAt` has been in the tree since task 70 and **nobody
 * had ever exercised it**. A refusal that is never taken is a branch, not a
 * rule: the handoff's own "not done / owed" list carried "mount legality is
 * coded but never exercised — nobody has stood the bird on a 55 degree slope
 * or at a lake edge and watched it refuse".
 *
 * Three arms, and the control is the point of the probe:
 *
 *   dry    a spot at Wiz Chocobo Post. `canStandAt` true and `mountAt` puts
 *          the player in the saddle. Without this, a probe that only shows
 *          refusals is indistinguishable from a `canStandAt` that returns
 *          false everywhere.
 *   wet    the wettest point found on a world sweep. Refused, and the number
 *          that refuses it is `y < water.level + 0.35`.
 *   steep  the steepest point found on the same sweep. Refused, and the number
 *          that refuses it is `normalAt().y < WALKABLE_Y = cos(50 deg)`.
 *
 * **`Terrain.heightAt` answers differently before and after the clipmap has
 * settled at a place** (LANDMINES: 12.93 m at Galdin before, -0.4 m after), so
 * every candidate is measured twice: once off the cold sweep, and again after
 * the player has been teleported to within 30 m and the world given 90 frames.
 * The verdict is taken from the settled read, and both are printed — if they
 * disagree about legality, that disagreement is the finding.
 */
const g = window.GAME;
const out = [];
const terr = g.get('Terrain');
const player = g.get('Player');
const cb = g.get('Chocobo');
const water = g.get('Water');
const step = (n = 1) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };
if (!cb) return 'no Chocobo system registered';
if (!terr) return 'no Terrain';

g.get('Director')?.play?.();
g.get('Cinematics')?.stop?.({ skipped: true });
g.get('Menus')?.setScreen?.(null);
step(10);

// No `import('three')` in a probe body — it is evaluated inside the page, where
// a bare specifier does not resolve. Borrow a Vector3 from something that has
// one, the way `chocoborace.mts` borrows its matrix arithmetic.
const nrm = player.position.clone();
const WALKABLE_Y = Math.cos(50 * Math.PI / 180);
const level = water ? water.level : null;
out.push(`WALKABLE_Y = cos(50 deg) = ${WALKABLE_Y.toFixed(4)}; water level ${level === null ? 'no Water system' : level.toFixed(2) + ' m'}`);

/** Everything `canStandAt` looks at, plus the angle it implies. */
const probeAt = (x, z) => {
  const y = terr.heightAt(x, z);
  terr.normalAt(x, z, nrm);
  const deg = Math.acos(Math.min(1, Math.max(-1, nrm.y))) * 180 / Math.PI;
  return { x, z, y, ny: nrm.y, deg, wet: level !== null && y < level + 0.35, ok: cb.canStandAt(x, z) };
};
const fmt = (p) => `(${p.x.toFixed(0)}, ${p.z.toFixed(0)}) h=${p.y.toFixed(2)} n.y=${p.ny.toFixed(3)} slope=${p.deg.toFixed(1)} deg${p.wet ? ' WET' : ''} -> canStandAt ${p.ok}`;

/* -- the sweep ------------------------------------------------------------ */

let wet = null, steep = null, n = 0;
for (let x = -3800; x <= 3800; x += 95) {
  for (let z = -3800; z <= 3800; z += 95) {
    n++;
    const y = terr.heightAt(x, z);
    if (level !== null && (!wet || y < wet.y)) wet = { x, z, y };
    terr.normalAt(x, z, nrm);
    if (!steep || nrm.y < steep.ny) steep = { x, z, y, ny: nrm.y };
  }
}
out.push(`swept ${n} points on a 95 m lattice: lowest ${wet ? wet.y.toFixed(1) : 'n/a'} m, steepest n.y ${steep.ny.toFixed(3)} (${(Math.acos(steep.ny) * 180 / Math.PI).toFixed(1)} deg)`);

/* -- three arms, each measured cold and then settled ---------------------- */

const arms = [
  ['dry', null],
  ['wet', wet],
  ['steep', steep],
];
const wm = (await import('/world/map/WorldMap.ts')).worldMap;
const wiz = wm.poiById('wiz_chocobo');
arms[0][1] = { x: wiz.x + 12, z: wiz.z + 12 };

for (const [name, c] of arms) {
  if (!c) { out.push(`${name}: no candidate`); continue; }
  const cold = probeAt(c.x, c.z);
  // Stand the player 30 m off — inside the streaming radius, outside the spot
  // itself, so the clipmap resolves the ground the verdict is taken on.
  const px = c.x + 30, pz = c.z + 30;
  player.root.position.set(px, terr.heightAt(px, pz), pz);
  player.velocity?.set?.(0, 0, 0);
  g.get('Party')?.snap?.();
  step(90);
  const hot = probeAt(c.x, c.z);
  out.push(`${name} cold:    ${fmt(cold)}`);
  out.push(`${name} settled: ${fmt(hot)}`);
  if (cold.ok !== hot.ok) out.push(`${name}: !! cold and settled DISAGREE about legality`);

  // And the verb itself, not just the predicate.
  if (cb.state === 'ridden') cb.dismount();
  step(4);
  const before = cb.state;
  const got = cb.mountAt(c.x, c.z, 0);
  step(4);
  out.push(`${name}: mountAt -> ${got}, state ${before} -> ${cb.state}`
    + (got ? ` bird at (${cb.bird.root.position.x.toFixed(0)}, ${cb.bird.root.position.z.toFixed(0)})` : ''));
  const want = name === 'dry';
  if (got !== want) out.push(`${name}: !! FAIL — expected mountAt ${want}`);
  if (!got && cb.state !== before) out.push(`${name}: !! FAIL — a refused mountAt changed the state`);
}
if (cb.state === 'ridden') cb.dismount();
return out.join('\n');
