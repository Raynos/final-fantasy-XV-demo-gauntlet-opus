/*
 * The stone field by SLOPE BAND, and what each group's cap is doing.
 *
 *   node src/tools/probe.mts src/tools/_probe/rockslope.mts --set __SHOT=vista_noon
 *
 * The judge's "no boulder or scrub scatter breaking the silhouette" was read as
 * a range problem and is not one — the field reaches 1150 m. It is a SLOPE
 * problem: the flats carry the stone and the faces, which are the only part of
 * a frame read against sky, carry almost none of it and none of the size.
 *
 * `emit` drops an instance silently once a group's cap is full, so any change
 * that puts more or bigger stone on a face has to be checked against the caps
 * and not only against the frame — hence the second table.
 */
const g = window.GAME;
const { SHOTS } = await import('/game/Shots.ts');
const shot = String(window.__SHOT || 'vista_noon');
if (!SHOTS[shot]) return `no such shot: ${shot}`;
g.applyShot(shot);
g.settle(40);
g.applyShot(shot);
g.settle(10);

const props = g.get('Props');
const rocks = props && props.rocks;
if (!rocks) return 'no Rocks system (Props.rocks)';
const cam = g.camera.position;

const BANDS = [0, 0.2, 0.33, 0.46, 0.6, 0.7, 1.01];
const rows = BANDS.slice(0, -1).map((lo, i) => ({ lo, hi: BANDS[i + 1], n: 0, size: 0, far: 0 }));
let total = 0, farthest = 0;
const eco = rocks.eco;
for (const arr of rocks.stream.live.values()) {
  for (const it of arr) {
    const d = Math.hypot(it.x - cam.x, it.z - cam.z);
    total++;
    if (d > farthest) farthest = d;
    // slope01 is the same measure the placement tests use
    const s = eco.slope01(it.x, it.z);
    const r = rows.find((b) => s >= b.lo && s < b.hi);
    if (!r) continue;
    r.n++; r.size += it.s; if (d > r.far) r.far = d;
  }
}

const out = [`${shot}: ${total} rock instances live, farthest ${farthest.toFixed(0)} m`];
out.push('  slope band      n    mean size   farthest');
for (const r of rows) {
  out.push(`  ${r.lo.toFixed(2)}-${r.hi.toFixed(2)}  ${String(r.n).padStart(6)}   ${(r.n ? r.size / r.n : 0).toFixed(2)} m   ${r.far.toFixed(0)} m`);
}
out.push('  group          near  cap   far   cap   drawn');
for (const grp of rocks.groups) {
  out.push(`  ${String(grp.key).padEnd(10)} ${String(grp.nw).padStart(6)} ${String(grp.nearMax).padStart(5)} `
    + `${String(grp.fw).padStart(5)} ${String(grp.farMax).padStart(5)} ${String(grp.w).padStart(7)}`
    + (grp.nw >= grp.nearMax || (grp.hasFar && grp.fw >= grp.farMax) ? '   CAPPED' : ''));
}
return out.join('\n');
