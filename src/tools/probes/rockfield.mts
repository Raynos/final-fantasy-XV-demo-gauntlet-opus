/**
 * What does the boulder field actually PLACE? — the drawn instances, headless.
 *
 * The judge's round-13 verdict names two things this file can answer with
 * numbers rather than with a frame: *"ten identical mushroom rocks, all
 * upright"* and *"ten boulders evenly ringed"*. Both are statements about the
 * instances `Rocks._genCell` / `_genOutcrop` emit, and both are invisible to
 * `silhouette.mts` (which grades one composed landform in isolation) and to
 * `scatterstat --set rocks` (which grades the SAMPLER's parent process, not the
 * stones the game draws).
 *
 * Runs the real generators against the real baked field. No browser, no scene.
 */
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { Field } from '../../world/terrain/Field.ts';
import { applyBakedField } from '../../world/terrain/FieldBake.ts';
import { Terrain } from '../../world/Terrain.ts';
import { Ecology } from '../../world/veg/Ecology.ts';
import { Rocks, KINDS, rockGeometry, hullExtents } from '../../world/props/Rocks.ts';
import type { Game } from '../../game/Game.ts';
import type { StoneKind } from '../../world/props/ZoneDress.ts';

const field = new Field(1337);
const baked = resolve('src/public/baked/terrain.bin.gz');
if (existsSync(baked)) applyBakedField(field, new Uint8Array(gunzipSync(readFileSync(baked))));
else field.build();
const terrain = new Terrain();
terrain.field = field;
terrain.road = field.roadSpline;
const eco = new Ecology({ get: () => terrain } as unknown as Game, 1337);

const rocks = Object.create(Rocks.prototype) as Rocks;
rocks.eco = eco;
rocks.cell = 56;
rocks.quality = 1;
rocks.radius = 560;
rocks.ext = new Map();
rocks.hy = new Map();
for (const k of KINDS) {
  const g = rockGeometry(k.seed, k.opts);
  const e = hullExtents(g);
  rocks.ext.set(k.key, e);
  rocks.hy.set(k.key, e[1]);
}

interface Inst {
  k: StoneKind; x: number; z: number; y: number; s: number;
  sx: number; sy: number; sz: number; yaw: number; pitch: number; roll: number; far: boolean;
}

const ZONES: Array<[string, number, number]> = [
  ['longwythe', 380, -260],
  ['three_valleys', 1360, 1160],
  ['fallgrove', -800, 1560],
];

const WIN = 512;
function gather(cx: number, cz: number) {
  const near: Inst[] = [], far: Inst[] = [];
  const c = 56;
  for (let j = Math.floor((cz - WIN / 2) / c); j <= Math.floor((cz + WIN / 2) / c); j++)
    for (let i = Math.floor((cx - WIN / 2) / c); i <= Math.floor((cx + WIN / 2) / c); i++)
      rocks._genCell(i, j, near as never);
  const oc = 176;
  for (let j = Math.floor((cz - WIN / 2) / oc); j <= Math.floor((cz + WIN / 2) / oc); j++)
    for (let i = Math.floor((cx - WIN / 2) / oc); i <= Math.floor((cx + WIN / 2) / oc); i++)
      rocks._genOutcrop(i, j, far as never);
  return { near, far };
}

const sd = (a: number[]) => {
  if (a.length < 2) return NaN;
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1));
};

console.log('zone            set     n   tilt mean/sd (deg)  >5deg  >10deg  aniso mean  aniso>1.4  s p50   s p95');
for (const [zn, cx, cz] of ZONES) {
  const g = gather(cx, cz);
  for (const [name, set] of [['near', g.near], ['far', g.far]] as Array<[string, Inst[]]>) {
    const inWin = set.filter((p) => Math.abs(p.x - cx) < WIN / 2 && Math.abs(p.z - cz) < WIN / 2);
    if (!inWin.length) continue;
    const tilt = inWin.map((p) => Math.hypot(p.pitch, p.roll) * 180 / Math.PI);
    const big = inWin.filter((p) => p.s > 2.0);
    const aniso = big.map((p) => {
      const a = [Math.abs(p.sx), Math.abs(p.sy), Math.abs(p.sz)];
      return Math.max(...a) / Math.min(...a);
    });
    const ss = inWin.map((p) => p.s).sort((a, b) => a - b);
    console.log(
      `${zn.padEnd(15)} ${name.padEnd(5)} ${String(inWin.length).padStart(5)}   `
      + `${(tilt.reduce((a, b) => a + b, 0) / tilt.length).toFixed(2).padStart(5)} `
      + `${sd(tilt).toFixed(2).padStart(6)}      `
      + `${(100 * tilt.filter((t) => t > 5).length / tilt.length).toFixed(1).padStart(5)}% `
      + `${(100 * tilt.filter((t) => t > 10).length / tilt.length).toFixed(1).padStart(5)}%   `
      + `${(aniso.reduce((a, b) => a + b, 0) / Math.max(1, aniso.length)).toFixed(3)}     `
      + `${(100 * aniso.filter((a) => a > 1.4).length / Math.max(1, aniso.length)).toFixed(1).padStart(5)}%  `
      + `${ss[Math.floor(ss.length * 0.5)].toFixed(2).padStart(6)} ${ss[Math.floor(ss.length * 0.95)].toFixed(2).padStart(6)}`,
    );
  }
}

/* ------------------------------------------------- the "evenly ringed" test */

// The judge's ab-04: *"ten boulders evenly ringed"*. `rockScatter` is a Matern
// process whose children are Gaussian about their parent with `spread` = 13 m
// and `mean` = 10 -- so "ten" is literally the mean child count. A 2D Gaussian
// is densest at the centre, but the radius-aware separation pass rejects the
// crowded middle first, and what survives can be an annulus. Measured directly:
// the radial profile of children about their own parent, normalised by area.
{
  const { maternScatter } = await import('../../world/veg/Cluster.ts');
  const parents: Array<{ x: number, z: number }> = [];
  const pts = maternScatter({
    seed: 1337 ^ 0x40c8, x0: 380 - 384, z0: -260 - 384, w: 768, h: 768,
    parentMin: 40, spread: 13, mean: 10,
    suitability: (x, z) => eco.rockSuit(x, z),
    reject: (x, z) => Math.hypot(x, z) > eco.worldRadius
      || eco.waterDepth(x, z) > 0.1 || eco.roadDist(x, z) < 4.6 || eco.cleared(x, z) > 0.06,
    radius: (x, z, u) => 0.7 + 4.2 * Math.pow(u, 1.65),
    slack: 1.1,
    parentsOut: parents,
  });
  const NB = 8, RMAX = 2.4;   // in units of `spread`
  const cnt = new Array(NB).fill(0);
  for (const p of pts) {
    const b = Math.floor(p.fromParent / RMAX * NB);
    if (b >= 0 && b < NB) cnt[b]++;
  }
  console.log(`\nradial profile of ${pts.length} children about ${parents.length} parents`);
  console.log('  r/spread   count   density (count / annulus area, arbitrary units)');
  for (let b = 0; b < NB; b++) {
    const r0 = b * RMAX / NB, r1 = (b + 1) * RMAX / NB;
    const area = Math.PI * (r1 * r1 - r0 * r0);
    const dens = cnt[b] / area;
    console.log(`  ${r0.toFixed(2)}-${r1.toFixed(2)} ${String(cnt[b]).padStart(6)}   `
      + `${dens.toFixed(1).padStart(7)}  ${'#'.repeat(Math.round(dens / 4))}`);
  }
}
