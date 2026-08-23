#!/usr/bin/env node
/**
 * Does anything we place stand in the air?
 *
 *   node src/tools/floatcheck.mts
 *   node src/tools/floatcheck.mts --worst 40      # the 40 worst, not the 20
 *   node src/tools/floatcheck.mts --json tmp/float.json
 *
 * Plan section 13's definition-of-done box: *"`seatHeightAt` + `proudOf` runs in
 * `integration.mts` or a new check — zero floating instances across the POI
 * corpus."* This is the new check. `seatcheck.mts` proves the seat *model* is
 * the renderer's arithmetic; this proves the things we actually placed obey it.
 *
 * It builds **every POI in the world in one boot** — `PoiKits._make` per site,
 * without moving the camera — so "the POI corpus" is all 124 of them and not
 * the handful that happen to have streamed in around spawn. Then it pushes each
 * variant's support points through the **final instance matrix** and measures
 * them against `Terrain.drawnHeightAt` at the finest ring, which is the ground
 * drawn under an object when the player is standing next to it.
 *
 * ## The two gates, and why they are the ones that can be gated
 *
 * **1. No POI compound floats.** A POI is a merged mesh per material, so its
 * pieces have no individual matrices left to test. What *can* be tested with no
 * false positive is the compound: if the lowest support point of *every* mesh
 * in a POI is above the ground, then nothing in that POI touches the ground and
 * the whole settlement is on stilts. That is the bug that has shipped here —
 * `handoff/modeling.md` records a `Math.min` over eight seat probes that put the
 * entire mesa compound *inside* the ridge, the same failure with the sign
 * flipped. The buried half is gated too, at `MAX_SINK` of the compound's height.
 *
 * **2. No placed instance floats.** `Rocks` and `Debris` are real
 * `InstancedMesh`es with real per-instance matrices, and a rock is *always*
 * meant to touch the ground — there is no such thing as a rock that is
 * deliberately in the air. So every live instance is tested individually and
 * the gate is zero.
 *
 * ## What this check is BLIND to, per plan section 9.3
 *
 *   - **Individual POI pieces that are meant to be off the ground.** A canopy
 *     roof, a sign board, a hanging lamp and a misplaced oil drum are the same
 *     measurement. Per-mesh floats are printed as a *diagnostic*, never gated,
 *     and a lane reading them has to know which of its pieces is cantilevered.
 *     Gating those would be a check that cries wolf, which is worse than none.
 *   - **`PoiKits._base` floats on purpose.** It seats a compound at the ring
 *     *average* rather than its minimum, so a deck on a hillside is proud on
 *     the downhill side by design and `_apron` covers the gap. So a compound
 *     passes as soon as *something* in it reaches the ground.
 *   - **Streaming.** Rocks and debris exist only near the camera, so gate 2
 *     covers the tiles live at spawn, and the count is printed so a run that
 *     measured nothing cannot be read as a run that passed.
 *   - **Props burying each other**, whether the object is upright at all (that
 *     is `seatPlane().residual`), and anything that moves after boot.
 *
 * ## Calibration
 *
 * Printed every run, on two cases whose answers are known, because
 * `LANDMINES.md` records seven instruments here that measured themselves:
 *
 *   known-floating   a POI's own geometry lifted 2.0 m. Must read 2.0 m float.
 *   known-seated     the same geometry dropped onto `seatY` at its own cull
 *                    distance. Must read zero float.
 *
 * If the lifted case does not come back as floating, the instrument is broken
 * and the run is VOID rather than a pass.
 */
import { harnessArgs, announceBuild, lease, pageOpts } from './harness.mts';
import { writeFile } from 'node:fs/promises';

interface Opts { worst: number; json: string | null; }

function parseArgs(argv: string[]): Opts {
  const o: Opts = { worst: 20, json: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--worst') o.worst = Number(argv[++i]);
    else if (argv[i] === '--json') o.json = argv[++i];
  }
  return o;
}

const opts = parseArgs(process.argv.slice(2));
const ha = harnessArgs(process.argv.slice(2));
announceBuild(ha);
const leased = await lease(pageOpts(ha));
const page = leased.page;
const errors: string[] = [];
page.on('pageerror', (e) => { errors.push(String(e).split('\n')[0]); });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().split('\n')[0]); });

const out = await page.evaluate(async () => {
  const g = window.GAME;
  const seat = await import('/world/props/Seat.ts');
  const props = g.get('Props')!;
  const terrain = g.get('Terrain')!;
  const eco = props.ecology;
  const cell0 = terrain.clipmap ? terrain.clipmap.cell0 : 1.5;

  /** `out = a * b`, both column-major flat 16s, three.js order. */
  const mul16 = (a: ArrayLike<number>, b: ArrayLike<number>): number[] => {
    const r = new Array<number>(16);
    for (let c = 0; c < 4; c++) {
      for (let row = 0; row < 4; row++) {
        r[c * 4 + row] = a[row] * b[c * 4]
          + a[4 + row] * b[c * 4 + 1]
          + a[8 + row] * b[c * 4 + 2]
          + a[12 + row] * b[c * 4 + 3];
      }
    }
    return r;
  };

  /** The shape of a `Mesh` this check needs, without importing three. */
  interface MeshLike {
    isMesh?: boolean;
    isInstancedMesh?: boolean;
    count?: number;
    name?: string;
    geometry?: { attributes: { position?: { array: ArrayLike<number> } } };
    instanceMatrix?: { array: ArrayLike<number> };
    matrixWorld: { elements: number[] };
    updateMatrixWorld: (force: boolean) => void;
  }

  /** Support points for a geometry, cached — this is the expensive half. */
  const cache = new Map<string, { pts: number[], height: number }>();
  let uid = 0;
  const ids = new WeakMap<object, string>();
  const supportOf = (geo: { attributes: { position?: { array: ArrayLike<number> } } }) => {
    let id = ids.get(geo);
    if (!id) { id = `g${uid++}`; ids.set(geo, id); }
    let s = cache.get(id);
    if (!s) {
      const pos = geo.attributes.position;
      s = pos ? seat.supportPoints(pos.array, 4) : { pts: [], height: 0 };
      cache.set(id, s);
    }
    return s;
  };

  /* -------------------------------------------------- 1. the whole POI corpus */
  // Build every site. `_make` is what `update()` calls one-per-frame; calling
  // it directly is the difference between "the POI corpus" and "the four POIs
  // that streamed in around spawn". This runs BEFORE the calibration on
  // purpose: on a `?shoot=1` page nothing has ticked, `built` is empty, and a
  // calibration with no subject reported VOID on the first run of this tool.
  const pk = props.poiKits;
  let builtNow = 0;
  for (const s of pk.sites) {
    if (s.group) continue;
    try { pk._make(s, g); builtNow++; } catch (e) { /* reported via pageerror */ }
  }

  /* ------------------------------------------------------------ calibration */
  // Take a real POI's first mesh, and read it twice: as placed, and lifted 2 m.
  const built0 = pk.built.length ? pk.built[0] : null;
  const calib = { lifted: -1, seated: -1, ok: false, subject: 'none' };
  if (built0) {
    let probe: MeshLike | null = null;
    built0.group.updateMatrixWorld(true);
    built0.group.traverse((o) => {
      const m = o as unknown as MeshLike;
      if (!probe && m.isMesh && m.geometry) probe = m;
    });
    if (probe !== null) {
      const found: MeshLike = probe;
      const sp = supportOf(found.geometry!);
      const m0 = found.matrixWorld.elements.slice();
      // Read it as placed first. A POI's first mesh is usually its graded pad,
      // which is sunk metres deep -- lifting a fixed 2 m off THAT still leaves
      // it underground, and the first run of this tool reported VOID for
      // exactly that reason. So lift it clear of its own sink and then by a
      // known 2 m, which makes the expected answer exactly 2.000 rather than
      // 'more than nothing'.
      const placed = seat.proudOf(eco, sp, m0, cell0);
      const lift = placed.sink + 2.0;
      const m = m0.slice(); m[13] += lift;
      const lifted = seat.proudOf(eco, sp, m, cell0);
      const mSeated = m0.slice(); mSeated[13] += placed.sink;
      const seated = seat.proudOf(eco, sp, mSeated, cell0);
      calib.lifted = lifted.float;
      calib.seated = seated.float;
      calib.subject = built0.group.name;
      calib.ok = Math.abs(lifted.float - 2.0) < 0.02 && lifted.why === 'float'
        && seated.float < 0.01;
    }
  }

  interface PoiRow {
    id: string; type: string; x: number; z: number;
    float: number; meshes: number;
    /** The tallest mesh in the compound -- the main structure, not the apron. */
    mainHeight: number; mainSink: number; mainFloat: number;
    proudMeshes: number; worstMeshFloat: number; planeResidual: number;
  }
  const pois: PoiRow[] = [];
  for (const b of pk.built) {
    b.group.updateMatrixWorld(true);
    let compoundFloat = Infinity;
    let mainHeight = 0, mainSink = 0, mainFloat = 0;
    let meshes = 0, proudMeshes = 0, worstMeshFloat = 0;
    b.group.traverse((node) => {
      const o = node as unknown as MeshLike;
      if (!o.isMesh || !o.geometry) return;
      const sp = supportOf(o.geometry);
      if (!sp.pts.length) return;
      const p = seat.proudOf(eco, sp, o.matrixWorld.elements, cell0);
      meshes++;
      if (p.float < compoundFloat) compoundFloat = p.float;
      if (p.float > 0.05) { proudMeshes++; worstMeshFloat = Math.max(worstMeshFloat, p.float); }
      // The burial test is on the TALLEST mesh and against ITS OWN height.
      // The first version took the max sink and the max height across the
      // compound and paired them, which flagged 92 of 113 POIs -- because a
      // POI's graded apron is a thin plate that is MEANT to be metres into the
      // ground, and pairing its sink with the main hall's height reads every
      // correctly-built settlement as buried. An instrument measuring itself.
      if (p.height > mainHeight) { mainHeight = p.height; mainSink = p.sink; mainFloat = p.float; }
    });
    if (!meshes) continue;
    const plane = seat.seatPlane(eco, b.poi.x, b.poi.z, b.radius || 20, b.draw || 900);
    pois.push({
      id: b.poi.id, type: b.poi.type, x: Math.round(b.poi.x), z: Math.round(b.poi.z),
      float: compoundFloat === Infinity ? 0 : compoundFloat,
      mainHeight, mainSink, mainFloat, meshes, proudMeshes, worstMeshFloat,
      planeResidual: plane.residual,
    });
  }

  /* --------------------------------------------- 2. real per-instance placement */
  interface InstRow { name: string; i: number; float: number; sink: number; height: number; x: number; z: number; }
  const insts: InstRow[] = [];
  let instTotal = 0, instMeshes = 0;
  interface Walkable { traverse: (f: (o: { traverse?: unknown }) => void) => void }
  // Rocks and debris STREAM, so on a page that has never ticked there are none
  // at all -- the first run of this tool measured zero instances and had to say
  // so rather than call it a pass. Settle the sim first, then read whatever the
  // streamer built around spawn.
  g.settle(120);
  const rootsToWalk: { name: string, obj: Walkable }[] = [{ name: 'scene', obj: g.scene as unknown as Walkable }];
  for (const r of rootsToWalk) {
    r.obj.traverse((node) => {
      const o = node as unknown as MeshLike;
      const nm = o.name || '';
      if (!/^(rock|deb|debris|stone|boulder)_/.test(nm)) return;
      if (!o.isInstancedMesh || !o.geometry || !o.instanceMatrix) return;
      o.updateMatrixWorld(true);
      const sp = supportOf(o.geometry);
      if (!sp.pts.length) return;
      instMeshes++;
      const arr = o.instanceMatrix.array;
      for (let i = 0; i < (o.count || 0); i++) {
        const local = Array.prototype.slice.call(arr, i * 16, i * 16 + 16) as number[];
        const world = mul16(o.matrixWorld.elements, local);
        const p = seat.proudOf(eco, sp, world, cell0);
        instTotal++;
        if (!p.ok) {
          insts.push({
            name: o.name || '(anon)', i, float: p.float, sink: p.sink,
            height: p.height, x: Math.round(p.x), z: Math.round(p.z),
          });
        }
      }
    });
  }

  return {
    calib, builtNow, poiSites: pk.sites.length, pois, insts,
    instTotal, instMeshes, cell0, maxSink: seat.MAX_SINK,
  };
});

await leased.release();

const pad = (s: string | number, n: number) => String(s).padEnd(n);
console.log('floatcheck — proudOf over the final instance matrices\n');
console.log(`ground judged against the finest clipmap ring, cell ${out.cell0} m — the surface`);
console.log('drawn under an object when the player is standing next to it.\n');

console.log('calibration, on a case whose answer is known:');
console.log(`  known-floating   ${out.calib.subject}, lifted clear of its own sink + 2.000 m`);
console.log(`                   -> float ${out.calib.lifted.toFixed(3)} m   (true answer 2.000)`);
console.log(`  known-seated     the same mesh dropped exactly onto the ground`);
console.log(`                   -> float ${out.calib.seated.toFixed(3)} m   (true answer 0.000)`);
if (!out.calib.ok) {
  console.log('\nVOID: the instrument did not reproduce a known lift. Nothing below means anything.');
  process.exit(2);
}

console.log(`\n1. POI corpus — ${out.pois.length} of ${out.poiSites} sites carry geometry (${out.builtNow} force-built this run)`);
const floating = out.pois.filter((p) => p.float > 0.002);
const buried = out.pois.filter((p) => p.mainHeight > 1e-6 && p.mainSink > out.maxSink * p.mainHeight);
console.log(`   compounds entirely in the air: ${floating.length}`);
console.log(`   compounds buried past ${(out.maxSink * 100).toFixed(0)}% of their height: ${buried.length}`);
for (const p of floating.slice(0, opts.worst)) {
  console.log(`   FLOAT  ${pad(p.id, 26)} ${pad(p.type, 10)} ${p.float.toFixed(2)} m at (${p.x}, ${p.z})`);
}
for (const p of buried.slice(0, opts.worst)) {
  console.log(`   BURIED ${pad(p.id, 26)} ${pad(p.type, 10)} its tallest mesh is ${p.mainSink.toFixed(2)} m into the ground and only ${p.mainHeight.toFixed(1)} m tall, at (${p.x}, ${p.z})`);
}

const proud = out.pois.filter((p) => p.proudMeshes > 0).sort((a, b) => b.worstMeshFloat - a.worstMeshFloat);
console.log(`\n   diagnostic, NOT gated — POIs with at least one mesh clear of the ground: ${proud.length}`);
console.log('   (a canopy roof and a misplaced drum are the same measurement here)');
for (const p of proud.slice(0, opts.worst)) {
  console.log(`     ${pad(p.id, 26)} ${pad(p.type, 10)} ${p.proudMeshes}/${p.meshes} meshes, worst ${p.worstMeshFloat.toFixed(2)} m`);
}

const knife = out.pois.filter((p) => p.planeResidual > 1.0).sort((a, b) => b.planeResidual - a.planeResidual);
console.log(`\n   knife edges, NOT gated — POIs whose 6-probe seat plane leaves > 1 m residual: ${knife.length}`);
console.log('   (a ridge under a footprint has a vertical average normal and fits flat)');
for (const p of knife.slice(0, opts.worst)) {
  console.log(`     ${pad(p.id, 26)} ${pad(p.type, 10)} residual ${p.planeResidual.toFixed(2)} m`);
}

console.log(`\n2. placed instances — ${out.instTotal} live across ${out.instMeshes} instanced meshes (rocks, debris)`);
if (out.instTotal === 0) {
  console.log('   MEASURED NOTHING. Streaming had not run; this is not a pass.');
}
const instFloat = out.insts.filter((i) => i.float > 0);
const instBuried = out.insts.filter((i) => i.float === 0);
console.log(`   floating: ${instFloat.length}   buried past ${(out.maxSink * 100).toFixed(0)}%: ${instBuried.length}`);
for (const i of out.insts.slice(0, opts.worst)) {
  const what = i.float > 0 ? `float ${i.float.toFixed(2)} m` : `sink ${i.sink.toFixed(2)} m of ${i.height.toFixed(1)} m`;
  console.log(`   ${pad(i.name, 24)} #${pad(i.i, 6)} ${what} at (${i.x}, ${i.z})`);
}

console.log('\nblind to: POI pieces meant to be off the ground (roofs, signs, lamps) —');
console.log('          those are reported, never gated; `PoiKits._base` seats on the ring');
console.log('          AVERAGE so a deck is proud downhill by design; streaming, so gate 2');
console.log('          sees only what is live; props burying each other; anything post-boot.');

if (opts.json) {
  await writeFile(opts.json, JSON.stringify(out, null, 1));
  console.log(`\nwrote ${opts.json}`);
}

if (errors.length) {
  console.log(`\n${errors.length} page errors:`);
  for (const e of errors.slice(0, 10)) console.log(`  ${e}`);
}

const fails = floating.length + buried.length + out.insts.length + (out.instTotal === 0 ? 1 : 0);
if (fails) {
  console.log(`\nFAIL — ${floating.length} floating compounds, ${buried.length} buried compounds, ${out.insts.length} bad instances.`);
  process.exit(1);
}
console.log(`\nPASS — 0 floating instances across ${out.pois.length} POIs and ${out.instTotal} placed instances.`);
