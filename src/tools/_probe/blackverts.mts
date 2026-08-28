/* How much of each species renders at near-zero albedo?
 *
 * The `Palette.mixc` failure mode this exists to catch is NOT a NaN — `geocheck`
 * gates those at zero — it is a *finite but wrong* colour: two scratch registers
 * cannot survive a nested blend, so the outer call blends a colour with itself
 * and a body part comes back flat and dark with no error anywhere. Four species
 * shipped like that for weeks. This prints the fraction of vertices under a
 * reflectance nothing in nature has, which is the cheapest corpus-wide read on
 * it and needs no browser. */
import { BESTIARY } from '../../characters/enemies/Bestiary.ts';

interface Attr { array: ArrayLike<number>, count: number }
interface Obj { traverse: (f: (o: Obj) => void) => void }
interface MeshLike extends Obj { isMesh?: boolean; isSkinnedMesh?: boolean; geometry: { attributes: Record<string, Attr> } }

const rows: [string, number, number, number][] = [];
for (const [key, def] of Object.entries(BESTIARY as Record<string, { protoKey?: string, buildPrototype: () => { group: Obj } }>)) {
  if (def.protoKey && def.protoKey !== key) continue;
  const proto = def.buildPrototype();
  let dark = 0, n = 0, sum = 0;
  proto.group.traverse((o: Obj) => {
    const m = o as MeshLike;
    if (!(m.isMesh || m.isSkinnedMesh) || !m.geometry) return;
    const c = m.geometry.attributes.color;
    if (!c) return;
    for (let i = 0; i < c.count; i++) {
      const l = 0.2126 * c.array[i * 3] + 0.7152 * c.array[i * 3 + 1] + 0.0722 * c.array[i * 3 + 2];
      sum += l; n++;
      if (l < 0.004) dark++;
    }
  });
  rows.push([key, n, dark, n ? sum / n : 0]);
}
rows.sort((a, b) => (b[2] / Math.max(1, b[1])) - (a[2] / Math.max(1, a[1])));
console.log('species              verts   under 0.4% linear     mean luma');
for (const [k, n, d, mean] of rows) {
  console.log(`  ${k.padEnd(18)}${String(n).padStart(6)}   ${String(d).padStart(6)} (${(100 * d / Math.max(1, n)).toFixed(1)}%)        ${mean.toFixed(3)}`);
}
