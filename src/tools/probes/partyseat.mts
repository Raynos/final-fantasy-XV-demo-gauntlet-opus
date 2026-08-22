/**
 * Is the "party sinks into the ground after a few dozen distant shots" bug in
 * `Shots.ts` the seating gap?
 *
 * `Shots.ts` says the terrain under the party renders ~1.5 m ABOVE `heightAt`
 * once the camera has been kilometres away, and files the character portraits
 * first as a workaround. `Terrain.drawnHeightAt` now models the rasterised
 * surface exactly, so this asks it directly: put the camera near the party,
 * read both surfaces; put the camera far away, read them again.
 */
const g = window.GAME;
const t = g.get('Terrain');
const player = g.get('Player');

const read = (label) => {
  const p = player.position;
  const cell = t.clipSpacingAt(p.x, p.z);
  const camD = Math.hypot(g.camera.position.x - p.x, g.camera.position.z - p.z);
  return {
    where: label,
    camDist: +camD.toFixed(0),
    ringCell: cell,
    playerY: +p.y.toFixed(3),
    heightAt: +t.heightAt(p.x, p.z).toFixed(3),
    drawn: +t.drawnHeightAt(p.x, p.z).toFixed(3),
    drawnMinusField: +(t.drawnHeightAt(p.x, p.z) - t.heightAt(p.x, p.z)).toFixed(3),
    seat15: +t.seatHeightAt(p.x, p.z, 1.8).toFixed(3),
  };
};

const rows = [];
g.applyShot('hero_full');
g.settle(60);
rows.push(read('hero_full (camera on the party)'));

for (const s of ['vista_dawn', 'zone_ravatogh', 'zone_galdin', 'landmark_insomnia']) {
  try { g.applyShot(s); } catch (e) { continue; }
  g.settle(40);
  rows.push(read(s + ' (camera away, party off screen)'));
}

g.applyShot('hero_full');
g.settle(60);
rows.push(read('hero_full again'));

return rows;
