/* Do the Titan's emissive wedges sit IN the rock, or in mid-air?
 *
 * Bare Node: builds the prototype, splits the merged buffer into connected
 * components, and asks CONTAINMENT rather than proximity — a wedge rammed into
 * the gap between two plates has its corners inside the union of the rock
 * around it; a wedge floating in front of the hand does not. */
import { BESTIARY } from '../../characters/enemies/Bestiary.ts';

interface Attr { array: ArrayLike<number> }
interface Obj { traverse: (f: (o: Obj) => void) => void }
interface MeshLike extends Obj {
  isMesh?: boolean; isSkinnedMesh?: boolean;
  geometry: { attributes: Record<string, Attr>, index: Attr };
  skeleton?: { bones: { name: string }[] };
}
interface Proto { group: Obj }

const def = (BESTIARY as Record<string, { buildPrototype: () => Proto }>).titan;
const proto = def.buildPrototype();
let mesh: MeshLike | null = null;
proto.group.traverse((o: Obj) => {
  const m = o as MeshLike;
  if ((m.isSkinnedMesh || m.isMesh) && !mesh) mesh = m;
});
if (!mesh) throw new Error('no mesh');
const found: MeshLike = mesh;
const g = found.geometry;
const pos = g.attributes.position.array;
const emi = g.attributes.aEmissive.array;
const si = g.attributes.skinIndex.array;
const idx = g.index.array;
const n = pos.length / 3;
const parent = new Int32Array(n);
for (let i = 0; i < n; i++) parent[i] = i;
const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
const uni = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
for (let i = 0; i < idx.length; i += 3) { uni(idx[i], idx[i + 1]); uni(idx[i + 1], idx[i + 2]); }
const comps = new Map<number, number[]>();
for (let i = 0; i < n; i++) { const r = find(i); const a = comps.get(r); if (a) a.push(i); else comps.set(r, [i]); }
const bones = (found.skeleton?.bones || []).map((b: { name: string }) => b.name);

interface Comp { v: number[], emi: boolean, bone: number, box: number[] }
const list: Comp[] = [];
for (const v of comps.values()) {
  let e = 0;
  for (const i of v) e += emi[i * 3] + emi[i * 3 + 1] + emi[i * 3 + 2];
  const box = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const i of v) {
    for (let k = 0; k < 3; k++) {
      box[k] = Math.min(box[k], pos[i * 3 + k]);
      box[k + 3] = Math.max(box[k + 3], pos[i * 3 + k]);
    }
  }
  list.push({ v, emi: e / v.length > 0.02, bone: si[v[0] * 4], box });
}
const rock = list.filter((c) => !c.emi);
const glow = list.filter((c) => c.emi);
console.log(`${list.length} components: ${glow.length} emissive, ${rock.length} rock`);

const inBox = (b: number[], x: number, y: number, z: number) =>
  x >= b[0] && x <= b[3] && y >= b[1] && y <= b[4] && z >= b[2] && z <= b[5];
const clear = (b: number[], x: number, y: number, z: number) => Math.max(
  b[0] - x, x - b[3], b[1] - y, y - b[4], b[2] - z, z - b[5]);

const rows: string[] = [];
for (const c of glow) {
  let corners = 0, worst = -Infinity;
  for (let k = 0; k < 8; k++) {
    const x = c.box[(k & 1) ? 3 : 0], y = c.box[(k & 2) ? 4 : 1], z = c.box[(k & 4) ? 5 : 2];
    let out = Infinity;
    for (const r of rock) {
      if (inBox(r.box, x, y, z)) { out = 0; break; }
      out = Math.min(out, clear(r.box, x, y, z));
    }
    if (out <= 0) corners++;
    worst = Math.max(worst, out);
  }
  const cx = (c.box[0] + c.box[3]) / 2, cy = (c.box[1] + c.box[4]) / 2, cz = (c.box[2] + c.box[5]) / 2;
  rows.push(`${String(corners).padStart(2)}/8  ${String(bones[c.bone] ?? c.bone).padEnd(8)} `
    + `(${cx.toFixed(1).padStart(6)},${cy.toFixed(1).padStart(6)},${cz.toFixed(1).padStart(6)})  `
    + `${(c.box[3] - c.box[0]).toFixed(1)}x${(c.box[4] - c.box[1]).toFixed(1)}x${(c.box[5] - c.box[2]).toFixed(1)}`.padEnd(13)
    + (corners === 8 ? 'buried' : `worst corner ${worst.toFixed(2)} m outside every rock box`));
}
rows.sort();
console.log(' in    bone     centre                 size         verdict');
for (const r of rows) console.log('  ' + r);
