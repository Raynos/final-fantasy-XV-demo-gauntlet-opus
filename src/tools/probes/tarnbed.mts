// How much of each tarn's own hollow is DRY? — the emergent-bed measurement.
//
// The water lane left this open: *"a fifth of each tarn basin is emergent
// bed, which is why tarns read as flooded ground"*, and separately closed
// `microDetail` as its cause (50.0% vs 49.7% wet — a measured negative). The
// bowl is `Field._tarnBasins`' and the level is `Tarns.findTarns`', so the
// number needs both, which is why it lives in a page probe.
//
// ## The statistic
//
// A tarn's **hollow** is every point inside the sample disc that sits below
// its own rim shelf — the ground `Field._tarnBasins` dished out. Of that,
// the part below the body's measured `level` is water and the rest is
// **emergent bed**: dished ground, visibly a lake floor, with no water on it.
// That is the thing that reads as flooded pasture rather than as a tarn.
//
// Reported as a percentage of the hollow, plus the depth profile, because the
// two fixes are different: a wide shallow skirt wants a steeper bowl wall, and
// a level that sits well below the rim wants `findTarns`' quantile.
//
//   node src/tools/probe.mts src/tools/probes/tarnbed.mts
const g = window.GAME;
const terr = g.get('Terrain');
const { WORLD } = await import('/world/map/WorldMap.ts');
const { findTarns } = await import('/world/water/Tarns.ts');

const h = (x, z) => terr.heightAt(x, z);
const tarns = findTarns(h, WORLD.seaLevel);

/** Sample radius and pitch, metres — 105 is the disc `findTarns` itself uses. */
const R = 105, STEP = 3;
/**
 * The annulus the rim shelf is read from — and it has to be INSIDE
 * `_tarnBasins`' own levelling radius (`flat` = 118 m), not outside it.
 *
 * Read at 112-128 m this probe lied by 2.2 m on `crestholm_reservoir`: past
 * 118 the pass releases its levelling back to the natural hillside, so the
 * "rim" it measured was the slope above the site, every point of the flat
 * apron counted as hollow, and the answer came out 68.7% emergent for a
 * geometry whose dish is only 56 m across. A shelf statistic taken off the
 * ground the shelf pass does not touch is a statistic about the hillside.
 */
const RIM0 = 80, RIM1 = 100;
/** Metres below the shelf that count as "in the hollow" at all. */
const LIP = 0.15;

const pct = (a, p) => (a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : NaN);

const out = [`${tarns.length} bodies from findTarns; hollow = ground below its own rim shelf`];
out.push('name                 shelf   level   hollow m2   WET%   EMERGENT%   emergent ring m   maxdepth');
let totHollow = 0, totWet = 0;
for (const t of tarns) {
  let rimSum = 0, rimN = 0;
  for (let a = 0; a < 64; a++) {
    const th = (a / 64) * Math.PI * 2;
    for (let rr = RIM0; rr <= RIM1; rr += 4) {
      rimSum += h(t.cx + Math.cos(th) * rr, t.cz + Math.sin(th) * rr); rimN++;
    }
  }
  const shelf = rimSum / rimN;
  let hollow = 0, wet = 0, deepest = 0;
  let wetR = 0, holR = 0;
  for (let dz = -R; dz <= R; dz += STEP) {
    for (let dx = -R; dx <= R; dx += STEP) {
      const r = Math.hypot(dx, dz);
      if (r > R) continue;
      const y = h(t.cx + dx, t.cz + dz);
      if (y >= shelf - LIP) continue;
      hollow++;
      holR = Math.max(holR, r);
      if (y < t.level) { wet++; wetR = Math.max(wetR, r); deepest = Math.max(deepest, t.level - y); }
    }
  }
  const cell = STEP * STEP;
  totHollow += hollow; totWet += wet;
  const em = hollow ? 100 * (hollow - wet) / hollow : 0;
  out.push(`${t.name.padEnd(20)} ${shelf.toFixed(1).padStart(6)}  ${t.level.toFixed(1).padStart(6)}  `
    + `${String(hollow * cell).padStart(9)}   ${(100 * wet / Math.max(1, hollow)).toFixed(1).padStart(4)}   `
    + `${em.toFixed(1).padStart(9)}   ${(holR - wetR).toFixed(0).padStart(15)}   ${deepest.toFixed(2).padStart(6)}`);
}
out.push(`ALL BODIES           wet ${(100 * totWet / Math.max(1, totHollow)).toFixed(1)}%  `
  + `emergent ${(100 * (totHollow - totWet) / Math.max(1, totHollow)).toFixed(1)}%`);

// The profile of one basin, so the bowl's shape can be read rather than guessed.
if (tarns.length) {
  const t = tarns[0];
  const row = [];
  for (let r = 0; r <= 130; r += 5) {
    let s = 0;
    for (let a = 0; a < 16; a++) {
      const th = (a / 16) * Math.PI * 2;
      s += h(t.cx + Math.cos(th) * r, t.cz + Math.sin(th) * r);
    }
    row.push((s / 16 - t.level).toFixed(2));
  }
  out.push('');
  out.push(`${t.name}: mean ring height minus water level, r = 0..130 m step 5:`);
  out.push('  ' + row.join(' '));
}

return out.join('\n');
