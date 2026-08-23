/*
 * Does vegetation concealment reach the perception model, and does it matter?
 *
 * Sibling-ports Wave 4. Two questions this repo has learned to ask separately:
 * is the term WIRED (a sampler actually bound to the live Ecology, not null),
 * and does it CHANGE AN ANSWER (a detection strength that differs with it on
 * and off). A system can pass the first and fail the second, and six have.
 */
const g = window.GAME;
const en = g.get('Enemies');
const veg = g.get('Vegetation');
if (!en || !veg) return `missing ${!en ? 'Enemies' : 'Vegetation'}`;

// Tick once: the sampler is bound in `Enemies.update`, and a freshly settled
// capture may not have run it since the pack spawned. Checking before this ran
// reports a live system as dead -- which it did, the first time.
en.update(0.016, g);

const ctx = en._ctx;
const out = [];
out.push(`concealment bound: ${typeof ctx.concealment === 'function' ? 'YES' : 'NO (null)'}`);
if (typeof ctx.concealment !== 'function') return out.join('\n');

// What range of cover does the world actually offer?
let lo = 1, hi = 0, sum = 0, n = 0;
for (let x = -1200; x <= 1200; x += 60) {
  for (let z = -1200; z <= 1200; z += 60) {
    const c = ctx.concealment(x, z);
    lo = Math.min(lo, c); hi = Math.max(hi, c); sum += c; n++;
  }
}
out.push(`cover over ${n} world points: min ${lo.toFixed(3)} max ${hi.toFixed(3)} mean ${(sum / n).toFixed(3)}`);

// Now the one that matters: a real enemy, a real threat, cover on vs off.
const proto = en.species[0];
const e = en.list[0] || null;
if (!e) { out.push('no live enemy to test against — spawn one first'); return out.join('\n'); }

// find the most-covered point near the enemy and stand a still target there
let best = null, bestC = -1;
for (let a = 0; a < 24; a++) {
  for (const r of [12, 18, 25, 32]) {
    const x = e.root.position.x + Math.cos(a / 24 * 6.283) * r;
    const z = e.root.position.z + Math.sin(a / 24 * 6.283) * r;
    const c = ctx.concealment(x, z);
    if (c > bestC) { bestC = c; best = { x, z, r }; }
  }
}
const terr = g.get('Terrain');
const mk = (speed) => ({ position: { x: best.x, y: terr.heightAt(best.x, best.z) + 1, z: best.z }, speed });
// point the enemy at the target so sight, not hearing, is what answers
e.heading = Math.atan2(best.x - e.root.position.x, best.z - e.root.position.z);

for (const speed of [0, 2, 6]) {
  const t = mk(speed);
  const withCover = e.perceives(t, ctx);
  const noCover = e.perceives(t, Object.assign({}, ctx, { concealment: null }));
  out.push(`speed ${speed} m/s at ${best.r} m (cover ${bestC.toFixed(2)}): `
    + `perceives ${withCover.toFixed(3)} vs ${noCover.toFixed(3)} uncovered`
    + `  -> ${((1 - withCover / (noCover || 1)) * 100).toFixed(1)}% suppressed`);
}
return out.join('\n');
