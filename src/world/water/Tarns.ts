import { worldMap } from '../map/WorldMap.ts';

/**
 * WHERE THE INLAND WATER IS, decided once and read by everything that draws it.
 *
 * The world used to have exactly one water level — `Water.level`, −6.5 m — and
 * every system that wanted to know "is this wet?" compared a ground height
 * against it. That is correct for a sea and wrong for everything else, and it
 * has now produced the same bug three times in three different files:
 *
 * | file | symptom |
 * |---|---|
 * | `Water.ts` | seven of ten fishing pins were a jetty on dry rock, until `_findTarns` |
 * | `Fishing.ts` | `_survey` tested `heightAt < water.level` and called four tarns dry **with water six metres from the pin** (`2b344e7`) |
 * | `Chart.ts` | the world map painted no blue under any tarn: `rasterChart` had `if (h < WORLD.seaLevel)` and nothing else |
 *
 * Three copies of one predicate is why. This module is the single copy: the
 * arithmetic that finds an inland basin, taking its ground height as a function
 * so the *same* code can run against the live `Terrain` in the game and against
 * the baked elevation grid inside a Node-side chart bake, with no `Terrain`
 * import and no DOM.
 *
 * ### The arithmetic, and why each step is there
 *
 * A tarn is authored as a **fishing pin**, not as a lake: the map advertises
 * ten places to fish, and the terrain is what decides whether each one can hold
 * water. So for every pin the sea does not already reach:
 *
 * 1. **Sample a 105 m disc** around the pin on a 45×45 lattice.
 * 2. **Take the 26th percentile of those heights as the wanted surface.** A
 *    quarter of the disc under water reads as a pond; a tenth reads as a
 *    puddle with a jetty beside it.
 * 3. **Refuse to spill.** Take the lowest point on the outer rim (`r > 0.86 R`)
 *    and cap the surface 35 cm below it. Water that runs out of its basin down
 *    a hillside is worse than no water — it is a sheet of sky lying on a slope.
 * 4. **Reject a pin with no hollow at all**: if the capped level is within
 *    40 cm of the deepest sample there is nothing to fill, and `caem_shore`
 *    and `rachsia_bridge` fail here honestly. They are drawn as unavailable.
 * 5. **Measure the extent from the water, not from the disc** — the bounding
 *    box of the samples actually below the level, padded by 8 m.
 *
 * Steps 2 and 3 are why the level is *measured* rather than authored: an
 * authored number is a number that goes stale the next time the heightfield
 * moves, and this heightfield moves whenever `Field._tarnBasins` re-carves.
 */

/** One inland body: where it is, how big, and the height of its surface. */
export interface TarnBasin {
  /** Centre, world metres. */
  cx: number;
  cz: number;
  /** Extent in x and z, world metres. */
  w: number;
  d: number;
  /** World Y of this body's surface — measured, per body. */
  level: number;
  /** The fishing pin's id. */
  name: string;
  /** Metres of depth that count as "shore", for the foam margin. */
  foamBand: number;
  /** Deepest sample in the disc. The chart ramps its blue against this. */
  floor: number;
}

/** Sample disc radius, m, and the half-count of the lattice across it. */
const R = 105;
const N = 22;

/**
 * Every fishing pin that can hold water, with the surface height it holds it at.
 *
 * @param heightAt ground height at a world position — `Terrain.heightAt` in the
 *   game, a bilinear read of the baked DEM in the chart bake
 * @param seaLevel the global sea plane; a pin within 4 m of it is coastal and
 *   is left to the sea's own basin scan
 * @param covered optional: a pin already inside a body found by that scan
 */
export function findTarns(
  heightAt: (x: number, z: number) => number,
  seaLevel: number,
  covered?: (x: number, z: number) => boolean,
): TarnBasin[] {
  const out: TarnBasin[] = [];
  for (const poi of worldMap.poisOfType('fishing')) {
    if (covered && covered(poi.x, poi.z)) continue;
    // Sea-adjacent pins have no business being a tarn even if the coarse
    // basin scan missed them by a cell.
    if (heightAt(poi.x, poi.z) < seaLevel + 4) continue;

    const hs: number[] = [];
    let rim = -Infinity;
    for (let j = -N; j <= N; j++) {
      for (let i = -N; i <= N; i++) {
        const dx = (i / N) * R, dz = (j / N) * R;
        const r = Math.hypot(dx, dz);
        if (r > R) continue;
        const h = heightAt(poi.x + dx, poi.z + dz);
        hs.push(h);
        if (r > R * 0.86) rim = Math.max(rim, -h);   // lowest point on the rim
      }
    }
    if (hs.length < 64) continue;
    hs.sort((a, b) => a - b);
    // A quarter of the disc under water reads as a pond rather than a puddle.
    const wanted = hs[Math.floor(hs.length * 0.26)];
    const spill = -rim;                               // the rim's lowest height
    const level = Math.min(wanted, spill - 0.35);
    // Below the basin floor means there is no hollow here at all.
    if (level <= hs[0] + 0.4) continue;

    // Extent: how far the water actually reaches, not the sample disc.
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let j = -N; j <= N; j++) {
      for (let i = -N; i <= N; i++) {
        const dx = (i / N) * R, dz = (j / N) * R;
        if (Math.hypot(dx, dz) > R) continue;
        if (heightAt(poi.x + dx, poi.z + dz) >= level) continue;
        minX = Math.min(minX, dx); maxX = Math.max(maxX, dx);
        minZ = Math.min(minZ, dz); maxZ = Math.max(maxZ, dz);
      }
    }
    if (!(maxX > minX)) continue;
    const pad = 8;
    /*
     * The foam band, as **the depth of the shallowest sixth of this body's own
     * wet area** — so a sixth of the surface foams, by construction, whatever
     * the body turns out to be.
     *
     * The rule it replaces was "a third of the deepest point", and the intent
     * behind that — a narrow rim rather than a pond foaming bank to bank — was
     * exactly right. The arithmetic does not deliver it. These basins run
     * 4.0-4.4 m at their deepest and **1.4 m at their median**, so a third of
     * the maximum lands at the median depth, and it was then clamped to the
     * sea's own 1.35 m anyway. Measured over all four bodies on a 81x81 lattice
     * (`tmp/water/tarnlook.mts`): **45.7-48.0% of every tarn was inside its own
     * foam band.** Half a pond of white water is the mouldy-puddle failure the
     * band exists to prevent, arrived at from the other direction.
     *
     * A quantile of the *area* cannot make that mistake, because it is stated
     * in the units the defect is measured in. `hs` is ascending, so the
     * submerged samples are its first `k` and the shallowest of them is last.
     */
    let k = 0;
    while (k < hs.length && hs[k] < level) k++;
    const band = k > 6 ? level - hs[k - 1 - Math.floor(k * 0.16)] : (level - hs[0]) * 0.34;
    out.push({
      cx: poi.x + (minX + maxX) / 2, cz: poi.z + (minZ + maxZ) / 2,
      w: (maxX - minX) + pad, d: (maxZ - minZ) + pad,
      level, name: poi.id, floor: hs[0],
      foamBand: Math.max(0.12, Math.min(1.35, band)),
    });
  }
  return out;
}
