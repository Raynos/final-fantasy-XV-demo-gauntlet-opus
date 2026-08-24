/**
 * Does a tor ever stand in a haven, or across Route 1?
 *
 * `Rocks._genOutcrop`'s tor branch `continue`s BEFORE that generator's `q`
 * test, so it never saw the road term, the site term or the POI term that
 * every other stone in the file is filtered by — and `q` itself read
 * `siteBlock` (the handful of authored landmarks near the origin) rather than
 * `cleared` (those plus the world map's 124 POIs), which is the same defect
 * `39d4d16` found in the vegetation one layer down.
 *
 * This calls the real generators and inspects what they EMIT, rather than
 * replaying the rule — a probe carrying its own copy of the rule is how
 * `2d91563` shipped a stacking table that had gone stale with no symptom.
 */
import { readFileSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { resolve } from 'node:path';
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

interface Inst { k: StoneKind; x: number; z: number; s: number; far: boolean }
const out: Inst[] = [];
const c = 176, R = 3000, n = Math.floor(R / c);
for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) rocks._genOutcrop(i, j, out as never);

// Only the blocks big enough to be a landform; a 1 m spall on a pad edge is
// dressing, a 12 m one is a mistake.
const big = out.filter((p) => p.s > 4 && Math.hypot(p.x, p.z) < R);
const onPad = big.filter((p) => eco.cleared(p.x, p.z) > 0.06);
const onRoad = big.filter((p) => eco.roadDist(p.x, p.z) < 12);
console.log(`outcrop + tor blocks over 4 m within ${R} m: ${big.length}`);
console.log(`  standing on a cleared pad (cleared > 0.06): ${onPad.length}`);
console.log(`  within 12 m of the carriageway:             ${onRoad.length}`);
for (const p of onPad.slice(0, 6)) console.log(`    pad  ${p.x.toFixed(0)},${p.z.toFixed(0)} s=${p.s.toFixed(1)} ${p.k}`);
for (const p of onRoad.slice(0, 6)) console.log(`    road ${p.x.toFixed(0)},${p.z.toFixed(0)} s=${p.s.toFixed(1)} ${p.k}`);
