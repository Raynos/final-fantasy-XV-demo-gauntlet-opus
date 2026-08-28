// Is there a beach? — shore run-out, measured, per stretch of coast.
//
// `handoff/water-content.md` closed the foam lace and then said the land behind
// it is still wrong: *"698 of 6 280 shore points have a run-out gentler than
// 4 m"*, i.e. 11% of the world's coastline rises less than four metres over the
// first stretch of ground behind the waterline. That number has no instrument
// in the repo, so this is it — otherwise a `Field.ts` beach grade has no before
// and no after and the item closes on an opinion.
//
// ## What a "run-out" is here
//
// Walk inland from the waterline along the local uphill and record the
// HORIZONTAL distance it takes to gain `RISE` metres of elevation. A beach is a
// long run-out (a 4 m rise over 40-60 m of sand); a cliff is a short one. The
// statistic is a distance in metres, which is the unit the fix is authored in.
//
// Shore points are found on a lattice: a cell below the sea plane with a
// neighbour above it. The lattice is deterministic, so two builds compare the
// same points — never a random cloud, which is the mistake `scatterstat`'s
// docstring records from the other side.
//
//   node src/tools/probe.mts src/tools/probes/beachrun.mts
//
// Prints the whole coast and then the named stretches, because the world-wide
// number is not the one being fixed: Cape Caem is *correctly* steep and
// averaging it with Galdin Quay hides both.
const g = window.GAME;
const terr = g.get('Terrain');
const { WORLD } = await import('/world/map/WorldMap.ts');
const SEA = WORLD.seaLevel;

/** Metres of rise a run-out is measured over. */
const RISE = 4;
/** Lattice pitch for finding the waterline, metres. */
const STEP = 8;
/** March step inland, metres, and how far we give up at. */
const MARCH = 2, GIVE_UP = 240;

const h = (x, z) => terr.heightAt(x, z);

/** Steepest-ascent unit direction at a point. */
function uphill(x, z) {
  const e = 6;
  const gx = h(x + e, z) - h(x - e, z);
  const gz = h(x, z + e) - h(x, z - e);
  const m = Math.hypot(gx, gz);
  return m < 1e-5 ? null : [gx / m, gz / m];
}

/**
 * Horizontal metres from the waterline to `SEA + RISE`, marching inland.
 * Re-aims every step, so it follows the ground rather than a straight line.
 */
function runOut(x0, z0) {
  let x = x0, z = z0, d = 0;
  for (let k = 0; k < GIVE_UP / MARCH; k++) {
    const u = uphill(x, z);
    if (!u) return GIVE_UP;
    x += u[0] * MARCH; z += u[1] * MARCH; d += MARCH;
    if (h(x, z) >= SEA + RISE) return d;
  }
  return GIVE_UP;
}

const pct = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : NaN);

function survey(name, x0, z0, x1, z1) {
  const runs = [];
  for (let z = z0; z <= z1; z += STEP) {
    for (let x = x0; x <= x1; x += STEP) {
      const c = h(x, z);
      if (c >= SEA) continue;
      // a wet cell with a dry neighbour is a waterline cell
      if (h(x + STEP, z) < SEA && h(x - STEP, z) < SEA
        && h(x, z + STEP) < SEA && h(x, z - STEP) < SEA) continue;
      runs.push(runOut(x, z));
    }
  }
  runs.sort((a, b) => a - b);
  const gentle = runs.filter((r) => r >= 40).length;
  const steep = runs.filter((r) => r < 12).length;
  return `${name.padEnd(16)} n=${String(runs.length).padStart(5)}   `
    + `p10 ${pct(runs, 0.1).toFixed(0).padStart(4)}  p50 ${pct(runs, 0.5).toFixed(0).padStart(4)}  `
    + `p90 ${pct(runs, 0.9).toFixed(0).padStart(4)} m   `
    + `>=40m ${(100 * gentle / Math.max(1, runs.length)).toFixed(1).padStart(5)}%   `
    + `<12m ${(100 * steep / Math.max(1, runs.length)).toFixed(1).padStart(5)}%`;
}

const out = [`run-out = horizontal metres from the waterline to SEA+${RISE} (${SEA}m + ${RISE})`];
out.push(survey('WHOLE COAST', -4000, -4000, 4000, 4000));
out.push(survey('galdin bay', 1900, 2000, 3300, 3500));
out.push(survey('galdin quay', 2100, 2200, 2700, 2800));
out.push(survey('cape caem', -1500, 2200, -600, 3000));

// A transect through the shot's own view axis, so the profile can be read.
out.push('');
out.push('transect zone_galdin, (2380,2440) -> (2600,2680), 8 m steps:');
const row = [];
for (let t = 0; t <= 40; t++) {
  const x = 2380 + (2600 - 2380) * (t / 40) * 1.6;
  const z = 2440 + (2680 - 2440) * (t / 40) * 1.6;
  row.push(h(x, z).toFixed(1));
}
out.push('  ' + row.join(' '));

return out.join('\n');
