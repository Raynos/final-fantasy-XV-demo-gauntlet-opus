/**
 * The judge's own statistic: how far is an instance from another copy of the
 * SAME asset?
 *
 * Round 13's prescription is *"reject any placement within N metres of another
 * copy of the same asset"*. That is a nearest-neighbour question restricted to
 * one mesh, and nothing in the tree measures it: `scatterstat` measures ALL
 * points (and its `same-sp` column is species, not mesh), `silhouette` measures
 * shapes in isolation.
 *
 * A "copy" here is the literal drawn mesh: `species_variant` for a tree,
 * `kind_variant` for a bush. Reported against the all-asset NN over the same
 * points, because the only meaningful reading is the RATIO: if copies are no
 * closer than any other pair, the scatter is already decorrelated in identity
 * and the judge's rule buys nothing.
 */
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import { Field } from '../../world/terrain/Field.ts';
import { applyBakedField } from '../../world/terrain/FieldBake.ts';
import { Terrain } from '../../world/Terrain.ts';
import { Ecology } from '../../world/veg/Ecology.ts';
import { Trees } from '../../world/veg/Trees.ts';
import { Bushes } from '../../world/veg/Bushes.ts';
import { Noise } from '../../util/Noise.ts';
import type { Game } from '../../game/Game.ts';

const field = new Field(1337);
const baked = resolve('src/public/baked/terrain.bin.gz');
if (existsSync(baked)) applyBakedField(field, new Uint8Array(gunzipSync(readFileSync(baked))));
else field.build();
const terrain = new Terrain();
terrain.field = field;
terrain.road = field.roadSpline;
const eco = new Ecology({ get: () => terrain } as unknown as Game, 1337);

interface P { x: number, z: number, id: string }

function nn(pts: P[], sameOnly: boolean) {
  const out: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    let best = Infinity;
    for (let j = 0; j < pts.length; j++) {
      if (i === j) continue;
      if (sameOnly && pts[j].id !== pts[i].id) continue;
      const d = Math.hypot(pts[i].x - pts[j].x, pts[i].z - pts[j].z);
      if (d < best) best = d;
    }
    if (Number.isFinite(best)) out.push(best);
  }
  out.sort((a, b) => a - b);
  return out;
}
const q = (a: number[], p: number) => a.length ? a[Math.min(a.length - 1, Math.floor(a.length * p))] : NaN;

const ZONES: Array<[string, number, number]> = [
  ['fallgrove', -800, 1560], ['nebulawood', -1560, -1180],
  ['longwythe', 380, -260], ['three_valleys', 1360, 1160],
];
const WIN = 320;

const t = Object.create(Trees.prototype) as Trees;
t.eco = eco;
t._nClump = new Noise(0x4c17);
t.byKey = { get: () => ({ height: 12 }) } as unknown as Trees['byKey'];
const b = Object.create(Bushes.prototype) as Bushes;
b.eco = eco;
b._nClump = new Noise(0x9d31);
b.kinds = { get: () => ({ variants: [0, 1, 2], scale: [1, 2], tint: [1, 1, 1] }) } as unknown as Bushes['kinds'];

console.log('class   zone            n  assets   all-NN p05/p50   same-asset NN p05/p50   ratio   <1.5m  <3m');
for (const [zn, cx, cz] of ZONES) {
  for (const cls of ['trees', 'bushes'] as const) {
    const pts: P[] = [];
    const TILE = cls === 'trees' ? 64 : 32;
    for (let j = Math.floor((cz - WIN / 2) / TILE); j <= Math.floor((cz + WIN / 2) / TILE); j++)
      for (let i = Math.floor((cx - WIN / 2) / TILE); i <= Math.floor((cx + WIN / 2) / TILE); i++) {
        if (cls === 'trees') for (const p of t._makeTile(i, j)) pts.push({ x: p.x, z: p.z, id: `${p.sp}_${p.vi ?? 0}` });
        else for (const p of b._makeTile(i, j)) pts.push({ x: p.x, z: p.z, id: `${p.kind}_${p.vi ?? 0}` });
      }
    if (pts.length < 30) { console.log(`${cls.padEnd(7)} ${zn.padEnd(14)} ${String(pts.length).padStart(5)}  (too few)`); continue; }
    const all = nn(pts, false), same = nn(pts, true);
    const assets = new Set(pts.map((p) => p.id)).size;
    console.log(
      `${cls.padEnd(7)} ${zn.padEnd(14)} ${String(pts.length).padStart(5)} ${String(assets).padStart(6)}   `
      + `${q(all, 0.05).toFixed(2).padStart(5)} ${q(all, 0.5).toFixed(2).padStart(6)}        `
      + `${q(same, 0.05).toFixed(2).padStart(5)} ${q(same, 0.5).toFixed(2).padStart(6)}          `
      + `${(q(same, 0.5) / q(all, 0.5)).toFixed(2)}   `
      + `${(100 * all.filter((d) => d < 1.5).length / all.length).toFixed(1).padStart(5)}% `
      + `${(100 * all.filter((d) => d < 3).length / all.length).toFixed(1).padStart(5)}%`,
    );
  }
}
