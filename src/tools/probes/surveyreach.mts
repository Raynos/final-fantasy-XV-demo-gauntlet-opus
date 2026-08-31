/*
 * Can a first-time player learn what ANY place in Lucis is?
 *
 * A blind 30-minute playtest cycled 120 points on the world map with the arrow
 * keys and every single one except Hammerhead, Hammerhead Parking and Redlyn
 * Haven read `UNSURVEYED SITE - UNKNOWN`. That is the whole map, and it is the
 * whole design document the map is supposed to be: 124 places, each with a
 * `does` line saying what the player actually does there, and the player saw
 * three of them.
 *
 * The fog of war is deliberate and now persists across boots, so the answer is
 * NOT to reveal everything. The question this probe asks is narrower and
 * measurable:
 *
 *   1. How many POIs are *listed* at boot? (`fog.at(p) > 0.5` -- the road
 *      corridor `FogOfWar.revealRoads(260)` inks in at boot.) This is the 120
 *      the player cycled through.
 *   2. How many are *known* at boot? (`worldMap.discovered`.) This is the 3.
 *   3. **How many could EVER be discovered by driving?** For each POI, the
 *      minimum distance from its pin to any drivable route polyline, against
 *      its own discovery radius `r`. A POI whose `r` does not reach the road
 *      cannot be found by the road trip at any speed, for any length of
 *      session -- it needs a deliberate walk into the wilderness at a pin the
 *      player has been told nothing about, which is the loop that does not
 *      close.
 *   4. What a real drive actually finds: hand the car to Ignis and let him
 *      drive for five simulated minutes from the start, counting discoveries.
 *
 * Run: node src/tools/probe.mts src/tools/probes/surveyreach.mts --dirty
 */
const g = window.GAME;
const { worldMap } = await import('/world/map/WorldMap.ts');
const { fog } = await import('/world/map/FogOfWar.ts');
const { routeClass } = await import('/world/map/MapDraw.ts');
const out = [];
const step = (n) => { for (let i = 0; i < n; i++) g.frame(1 / 60); };

const pois = worldMap.pois;
out.push(`POIs: ${pois.length}`);
out.push(`known at boot: ${worldMap.discovered.size}  [${[...worldMap.discovered].join(', ')}]`);
const listed = pois.filter((p) => fog.at(p.x, p.z) > 0.5);
out.push(`listed at boot (fog > 0.5): ${listed.length}`);

/* ---- 3. reach from the road ------------------------------------------ */
// Point-to-segment over every drivable route. `trail` routes are excluded the
// same way `revealRoads` excludes them: they are not roads a car uses.
const segs = [];
for (const route of worldMap.roadGraph.routes) {
  if (routeClass(route) === 'trail') continue;
  const pts = route.pts;
  for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]);
}
const distToRoad = (x, z) => {
  let best = Infinity;
  for (const [a, b] of segs) {
    const vx = b.x - a.x, vz = b.z - a.z;
    const L2 = vx * vx + vz * vz;
    let t = L2 > 0 ? ((x - a.x) * vx + (z - a.z) * vz) / L2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = x - (a.x + vx * t), dz = z - (a.z + vz * t);
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d < best) best = d;
  }
  return best;
};

const rows = pois.map((p) => ({ p, d: distToRoad(p.x, p.z) }));
const reachable = rows.filter((r) => r.d <= r.p.r);
out.push('');
out.push(`--- reach from the drivable road network (${segs.length} segments) ---`);
out.push(`discoverable by driving alone: ${reachable.length}/${pois.length}`);
const byType = {};
for (const { p, d } of rows) {
  const t = byType[p.type] || (byType[p.type] = { n: 0, hit: 0, worst: 0 });
  t.n++;
  if (d <= p.r) t.hit++;
  else t.worst = Math.max(t.worst, d - p.r);
}
for (const k of Object.keys(byType).sort()) {
  const t = byType[k];
  out.push(`  ${k.padEnd(11)} ${String(t.hit).padStart(3)}/${String(t.n).padEnd(3)}`
    + `  worst shortfall ${t.worst.toFixed(0)} m`);
}

// What multiplier on `r` would bring the whole map within reach of the road?
for (const k of [1, 1.5, 2, 3, 4, 6, 8]) {
  const n = rows.filter((r) => r.d <= r.p.r * k).length;
  out.push(`  r x ${String(k).padEnd(4)} -> ${n}/${pois.length} reachable from a road`);
}
// And how far the unreachable ones actually are.
const miss = rows.filter((r) => r.d > r.p.r).sort((a, b) => (b.d - b.p.r) - (a.d - a.p.r));
out.push(`  furthest 8 out of reach:`);
for (const m of miss.slice(0, 8)) {
  out.push(`    ${m.p.id.padEnd(26)} r=${String(m.p.r).padStart(4)}  road ${m.d.toFixed(0)} m`);
}

/* ---- 4. what a real drive finds -------------------------------------- */
out.push('');
out.push('--- a five-minute road trip, driven ---');
const reg = g.get('Regalia');
const player = g.get('Player');
g.get('Director')?.play?.();
g.get('Menus')?.setScreen?.(null);
step(20);
const p0 = { x: player.position.x, z: player.position.z };
out.push(`start at ${p0.x.toFixed(0)}, ${p0.z.toFixed(0)}`);
const before = new Set(worldMap.discovered);
if (reg) {
  const carPos = (reg.body && reg.body.pos) || (reg.root && reg.root.position);
  if (carPos) { player.position.set(carPos.x + 2.4, player.position.y, carPos.z); step(10); }
  reg.enter?.(false);
  step(20);
  reg.setAutoDrive?.(true);
}
let dist = 0;
let px = player.position.x, pz = player.position.z;
for (let f = 0; f < 60 * 300; f++) {
  g.frame(1 / 60);
  if ((f & 15) === 0) {
    dist += Math.hypot(player.position.x - px, player.position.z - pz);
    px = player.position.x; pz = player.position.z;
  }
}
const found = [...worldMap.discovered].filter((id) => !before.has(id));
out.push(`driving=${reg?.isDriving} travelled ${(dist / 1000).toFixed(2)} km`);
out.push(`ended at ${player.position.x.toFixed(0)}, ${player.position.z.toFixed(0)}`);
out.push(`newly discovered in 5 minutes: ${found.length}  [${found.join(', ')}]`);

return out.join('\n');
