/*
 * Does anything grow through the water?
 *
 * Three populations against three surfaces, plus the two controls that decide
 * whether a fix is a fix or a world-wide strip:
 *
 * 1. **The river sheet.** Sampled on the sheet's own interior lanes, so every
 *    sample is a point the game actually draws water at, and its depth is the
 *    drawn surface minus the ground. Any sample carrying grass, scrub or tree
 *    density is a plant standing in the river.
 * 2. **The tarns.** `Water.bodies` above the sea plane, sampled on a lattice
 *    inside the measured waterline — NOT a circle: the bowl radius is warped
 *    per azimuth, so the test is `height < level`, never a radius.
 * 3. **The Vesperpool, the counter-example.** A drowned forest with its floor
 *    20 m below the sea plane. The naive fix ("below the water level, no
 *    plants") strips it. These counts must not move.
 * 4. **The world.** How much ground the local water surface raises at all. A
 *    fix that touches more than the water is a fix that moved the world.
 */
const g = window.GAME;
const w = g.get('Water');
const t = g.get('Terrain');
const eco = g.get('Vegetation').ecology;
const { WORLD } = await import('/world/map/WorldMap.ts');
const SEA = WORLD.seaLevel;
// So the same probe runs on the build that has the defect: before the fix
// `Ecology` had no `waterLevel` at all, and the sea plane was the whole answer.
const waterLevel = eco.waterLevel ? (x, z) => eco.waterLevel(x, z) : () => SEA;
const WATER_LANES = 11;

/** Grass, scrub and tree density at a point, and whether anything may root. */
function pops(x, z) {
  return [eco.grassDensity(x, z), eco.scrubDensity(x, z), eco.treeDensity(x, z)];
}
function tally(rows) {
  const n = rows.length;
  const hit = [0, 0, 0];
  const sum = [0, 0, 0];
  for (const r of rows) for (let k = 0; k < 3; k++) { if (r[k] > 0.02) hit[k]++; sum[k] += r[k]; }
  return {
    n,
    pct: hit.map((h) => (n ? +(100 * h / n).toFixed(2) : 0)),
    mean: sum.map((v) => (n ? +(v / n).toFixed(4) : 0)),
  };
}

const out = { river: null, tarns: [], vesperpool: null, world: null, mask: w.mask ? w.mask.stats : null };

// ---------------------------------------------------------------- the river
if (w.riverWater) {
  const pos = w.riverWater.geometry.getAttribute('position');
  const n = pos.count / WATER_LANES;
  const rows = [];
  let deep = 0, blocked = 0;
  let maxDepth = 0;
  for (let i = 0; i < n; i += 2) {
    // Lanes 3..7 of 11 are inside the rim ramp (which starts at |u*2-1| > 0.62),
    // so these are the samples the sheet draws as opaque water.
    for (let j = 3; j <= 7; j++) {
      const k = i * WATER_LANES + j;
      const x = pos.getX(k), z = pos.getZ(k);
      const depth = pos.getY(k) - t.heightAt(x, z);
      if (depth <= 0.15) continue;
      deep++;
      if (depth > maxDepth) maxDepth = depth;
      rows.push(pops(x, z));
      if (eco.rootBlocked(x, z)) blocked++;
    }
  }
  out.river = {
    ...tally(rows),
    submerged: deep,
    maxDepth: +maxDepth.toFixed(2),
    rootBlockedPct: deep ? +(100 * blocked / deep).toFixed(2) : 0,
  };
}

// ----------------------------------------------------------------- the tarns
for (const b of w.bodies) {
  if (b.level < SEA + 4) continue;                     // coastal, that is the sea
  const rows = [];
  let wet = 0, blocked = 0;
  const N = 40;
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const x = b.cx + (i / N - 0.5) * b.w, z = b.cz + (j / N - 0.5) * b.d;
      if (t.heightAt(x, z) > b.level - 0.15) continue;  // the waterline is the bed, not a circle
      wet++;
      rows.push(pops(x, z));
      if (eco.rootBlocked(x, z)) blocked++;
    }
  }
  out.tarns.push({
    name: b.name, level: +b.level.toFixed(1), ...tally(rows), wet,
    rootBlockedPct: wet ? +(100 * blocked / wet).toFixed(2) : 0,
  });
}

// ---------------------------------------------- the Vesperpool, the control
{
  const cx = -3020, cz = -2360, R = 640, N = 90;
  const rows = [];
  let above = 0;
  for (let j = -N; j <= N; j++) {
    for (let i = -N; i <= N; i++) {
      const x = cx + (i / N) * R, z = cz + (j / N) * R;
      if (Math.hypot(x - cx, z - cz) > R) continue;
      rows.push(pops(x, z));
      if (t.heightAt(x, z) > SEA) above++;
    }
  }
  out.vesperpool = { ...tally(rows), aboveSea: above };
}

// ----------------------------------------------------- the world, the control
{
  const R = 4000, N = 220;
  let raised = 0, total = 0, most = 0;
  for (let j = -N; j <= N; j++) {
    for (let i = -N; i <= N; i++) {
      const x = (i / N) * R, z = (j / N) * R;
      total++;
      const lv = waterLevel(x, z);
      if (lv > SEA + 1e-6) { raised++; if (lv - SEA > most) most = lv - SEA; }
    }
  }
  out.world = {
    samples: total, raised,
    raisedPct: +(100 * raised / total).toFixed(3),
    highestAboveSea: +most.toFixed(1),
  };
}

return out;
