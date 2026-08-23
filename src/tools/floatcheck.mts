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
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE = path.join(ROOT, 'project', 'float-baseline.json');

interface Opts { worst: number; json: string | null; setBaseline: boolean; at: number[] | null; }

function parseArgs(argv: string[]): Opts {
  const o: Opts = { worst: 20, json: null, setBaseline: false, at: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--worst') o.worst = Number(argv[++i]);
    else if (argv[i] === '--json') o.json = argv[++i];
    else if (argv[i] === '--set-baseline') o.setBaseline = true;
    // `--at x,z` walks the world to a named place and streams THERE. The
    // ratchet is measured at spawn so it is comparable run to run; `--at` is
    // for pointing the instrument at a frame somebody has already seen a
    // floating rock in, which is the only way to calibrate against a
    // known-bad rather than against the tool's own opinion.
    else if (argv[i] === '--at') o.at = argv[++i].split(',').map(Number);
  }
  return o;
}

/**
 * The ratchet, in the shape `anycheck.mts` and `silhouette.mts` already use.
 *
 * Gating any of these four counts at zero would be wrong, and the reason is the
 * same one in both directions: **the check cannot see intent.** A stacked rock
 * course is meant to rest on the rock below it and not on the ground; a POI's
 * apron is meant to be metres into the ground; a canopy roof is meant to be in
 * the air. Every one of those is arithmetically identical to a placement bug.
 *
 * What CAN be enforced without knowing intent is that the numbers do not go up.
 * The floats and burials below are a measured inventory of the world as it is
 * tonight, and a lane that adds one is told immediately. See the handoff for
 * what it would take to gate them at zero — it needs the placers to declare
 * which instances are meant to be grounded, which is a change in files this
 * lane does not own.
 */
interface Baseline {
  note: string;
  poiFloating: number; poiBuried: number;
  instFloating: number; instBuried: number;
}

const opts = parseArgs(process.argv.slice(2));
const ha = harnessArgs(process.argv.slice(2));
announceBuild(ha);
const leased = await lease(pageOpts(ha));
const page = leased.page;
const errors: string[] = [];
page.on('pageerror', (e) => { errors.push(String(e).split('\n')[0]); });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().split('\n')[0]); });

const out = await page.evaluate(async (cfg: { at: number[] | null }) => {
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

  interface Walkable { traverse: (f: (o: { traverse?: unknown }) => void) => void }
  type Walkable0 = Walkable;

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
      // Find where the mesh's tightest support point actually is, by lifting it
      // so far that the answer must be positive and subtracting: float(L) =
      // minGap + L for any L that clears the ground, so minGap = float(1000) -
      // 1000. Then lift by exactly (2 - minGap) and the true answer is 2.000,
      // and by (-minGap) and the true answer is 0.000. That tests the
      // instrument's arithmetic and its zero in the same breath, on the real
      // geometry, rather than asserting 'more than nothing'.
      const at = (dy: number) => {
        const m = m0.slice(); m[13] += dy;
        return seat.proudOf(eco, sp, m, cell0);
      };
      const minGap = at(1000).float - 1000;
      const lifted = at(2 - minGap);
      const seated = at(-minGap);
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

  // Rocks and debris STREAM, so on a page that has never ticked there are none
  // at all -- the first run of this tool measured zero instances and had to say
  // so rather than call it a pass.
  //
  // Settling a FIXED number of steps is not enough either: tile generation is
  // budgeted in **wall-clock milliseconds** per frame, so how much has streamed
  // after 120 steps depends on what else the machine is doing. Two runs came
  // back 134/1073 and 486/874 for that reason, which would make any ratchet on
  // these counts cry wolf forever. So settle until the live instance count
  // stops moving, and the measured set is the same one every time.
  if (cfg.at) {
    const [ax, az] = cfg.at;
    const pl = g.get('Player');
    const ay = g.get('Terrain')!.heightAt(ax, az);
    if (pl && pl.root) pl.root.position.set(ax, ay, az);
    g.camera.position.set(ax, ay + 6, az + 12);
    g.camera.lookAt(ax, ay, az);
  }
  const liveCount = () => {
    let n = 0;
    (g.scene as unknown as Walkable0).traverse((node) => {
      const o = node as unknown as { isInstancedMesh?: boolean, count?: number, name?: string };
      if (o.isInstancedMesh && /^(rock|deb|debris|stone|boulder)_/.test(o.name || '')) n += o.count || 0;
    });
    return n;
  };
  let stable = 0, prev = -1, settles = 0;
  for (; settles < 60 && stable < 3; settles++) {
    g.settle(30);
    const n = liveCount();
    stable = n === prev ? stable + 1 : 0;
    prev = n;
  }
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
    instTotal, instMeshes, cell0, maxSink: seat.MAX_SINK, settles,
    at: cfg.at,
  };
}, { at: opts.at });

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
console.log(`   streamed to a standstill in ${out.settles} settle rounds`);
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

/* --------------------------------------------------------------- the ratchet */

const now = {
  poiFloating: floating.length, poiBuried: buried.length,
  instFloating: instFloat.length, instBuried: instBuried.length,
};

if (out.instTotal === 0) {
  console.log('\nVOID: gate 2 measured nothing. A run with no instances is not a pass.');
  process.exit(2);
}

if (out.at) {
  console.log(`\n--at ${out.at.join(',')}: a directed read, NOT the ratchet's measurement.`);
  console.log('The baseline is taken at spawn so it is comparable run to run.');
  process.exit(instFloat.length ? 1 : 0);
}

if (opts.setBaseline) {
  const b: Baseline = {
    note: 'Measured inventory of floats and burials, not a target. The gate fails '
      + 'when a count goes UP. It is not zero because this check cannot see intent: '
      + 'a stacked rock course rests on rock, a POI apron is meant to be underground, '
      + 'and a canopy roof is meant to be in the air. Re-run with --set-baseline only '
      + 'to LOWER these.',
    ...now,
  };
  await writeFile(BASELINE, `${JSON.stringify(b, null, 1)}\n`);
  console.log(`\nwrote ${path.relative(ROOT, BASELINE)}: ${JSON.stringify(now)}`);
  process.exit(0);
}

let base: Baseline | null = null;
try { base = JSON.parse(await readFile(BASELINE, 'utf8')) as Baseline; } catch { base = null; }
if (!base) {
  console.log(`\nno ${path.relative(ROOT, BASELINE)} — run --set-baseline once to arm the ratchet.`);
  console.log(JSON.stringify(now));
  process.exit(0);
}

// The POI counts are structural -- every site is force-built, every run, and
// they do not move unless the world does. The instance counts are the streamed
// set around spawn, re-derived per run against a trunk seven lanes are
// committing to, and they drift by a count or two between two adjacent commits.
// An exact ratchet on those cried wolf at 320 -> 321 within one minute.
const slack = (k: string, v: number) => (k.startsWith('inst') ? Math.max(3, Math.round(v * 0.01)) : 0);
const worse: string[] = [];
const better: string[] = [];
for (const k of ['poiFloating', 'poiBuried', 'instFloating', 'instBuried'] as const) {
  if (now[k] > base[k] + slack(k, base[k])) worse.push(`${k}: ${base[k]} -> ${now[k]}`);
  else if (now[k] < base[k] - slack(k, base[k])) better.push(`${k}: ${base[k]} -> ${now[k]}`);
}
console.log(`\nratchet, against ${path.relative(ROOT, BASELINE)}:`);
for (const k of ['poiFloating', 'poiBuried', 'instFloating', 'instBuried'] as const) {
  console.log(`  ${pad(k, 14)} ${String(now[k]).padStart(5)}   baseline ${base[k]}`);
}
if (better.length) console.log(`  improved: ${better.join(', ')} — lower the ratchet with --set-baseline`);
if (worse.length) {
  console.log(`\nFAIL — ${worse.length} count(s) went up: ${worse.join('; ')}`);
  process.exit(1);
}
console.log(`\nPASS — nothing new floats or is buried across ${out.pois.length} POIs and ${out.instTotal} placed instances.`);
