/*
 * Where does a fishing camp's deck sit, against its water AND against its bank?
 *
 *   node src/tools/probe.mts src/tools/probes/fishdeck.mts
 *
 * `_fishing` sets `deck = max(1.4, water.level + 1.5 - base)` — one number that
 * has to satisfy two different things. The jetty has to clear the water; the
 * shack, the rod stands, the bench and the crate stand on the **bank**, and
 * they are placed off the same `deck`. When the two disagree the camp is lifted
 * bodily into the air, which is what `floatcheck`'s per-mesh diagnostic reports
 * at `archaeans_mirror`, `maidenwater`, `malacchi_pond` and `vesperpool_dock`:
 * 3 of 5 meshes floating, worst 6.4–7.6 m. Its own gate cannot fail on it,
 * because the jetty piles run 3.4 m below the deck and one of them still
 * reaches the ground.
 *
 * This prints, per pin: the seat, the water it found and how far away, the deck
 * that falls out, and the drawn ground under the shack and under the far end of
 * the jetty. `bankAir` is the number that matters — how far the shack's sill
 * stands above the ground it is supposedly sitting on.
 */
const g = window.GAME;
const props = g.get('Props');
const terrain = g.get('Terrain');
const cell0 = terrain.clipmap ? terrain.clipmap.cell0 : 1.5;
const pk = props.poiKits;

for (const s of pk.sites) {
  if (s.group) continue;
  try { pk._make(s, g); } catch (e) { void e; }
}

const rows = [];
for (const b of pk.built) {
  if (b.poi.type !== 'fishing') continue;
  const p = b.poi;
  const base = b.group.position.y;
  const w = pk._waterNear(p.x, p.z);
  const deck = w ? Math.max(1.4, w.level + 1.5 - base) : 0.9;
  // The shack sits at local (3.6, deck + 1.2, -3.5) before the site yaw; the
  // radius is what matters here, not the bearing, so sample a ring at it.
  const ringLow = (rad) => {
    let lo = 1e9;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      lo = Math.min(lo, terrain.drawnHeightAt(p.x + Math.cos(a) * rad, p.z + Math.sin(a) * rad, cell0));
    }
    return lo;
  };
  const shackGround = ringLow(5.0);
  const tipGround = ringLow(20.0);
  rows.push(`${(p.id + '                    ').slice(0, 20)} `
    + `base=${base.toFixed(1)} water=${w ? w.level.toFixed(1) : 'none'} `
    + `dist=${w ? w.dist : '-'} deck=${deck.toFixed(2)} `
    + `shackGround=${shackGround.toFixed(1)} bankAir=${(base + deck - 0.5 - shackGround).toFixed(2)} `
    + `tipGround=${tipGround.toFixed(1)} pileAir=${(base + deck - 3.4 - tipGround).toFixed(2)}`);
}
return rows;
