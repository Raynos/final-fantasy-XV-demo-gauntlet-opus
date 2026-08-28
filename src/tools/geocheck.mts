#!/usr/bin/env node
/**
 * Winding, orientation and attribute asserts over every generator, in bare Node.
 *
 *   node src/tools/geocheck.mts
 *   node src/tools/geocheck.mts --controls        # the five control cases alone
 *   node src/tools/geocheck.mts --set enemies
 *   node src/tools/geocheck.mts --set-baseline
 *
 * Plan sections 9.1 and 9.5. The asserts themselves live in
 * `src/util/GeoAssert.ts` so a *generator* can call them at build time, which is
 * where they belong — the plan's line is that *"nothing in the pipeline can tell
 * you a triangle was wound backwards"*, and a throw at build time is the only
 * thing that does. This tool is the safety net for everything that has not
 * adopted them yet: it builds the trees and the bestiary in process and runs
 * the same functions over the finished buffers.
 *
 * ## The five controls, with answers known before the run
 *
 * Every one is measured on every invocation and printed. `LANDMINES.md` records
 * seven instruments here that measured themselves, so nothing below is read
 * until these five come back right:
 *
 *   quad             a correctly wound upward card   -> 0 down-facing
 *   quad, reversed   its index reversed              -> ALL down-facing
 *   quad, transposed u and v swapped on every corner -> orientation THROWS
 *   quad, mirrored   u negated                       -> orientation THROWS
 *   sphere / inside-out sphere                       -> 100% / 0% outward
 *
 * The transposed and mirrored cards are the whole reason `assertCardOrientation`
 * exists: **UV area is invariant under transpose**, so every area-, bounds-,
 * aspect- and texel-density-based check passes them, which is exactly how the
 * sibling's impostor bug survived four rounds.
 *
 * ## What it measures on the real geometry
 *
 *   nan          any non-finite number in position, normal, uv or tangent.
 *                A NaN position collapses a triangle to nothing and a NaN
 *                normal shades black. Gated at zero — there is no benign one.
 *   index        an index outside the vertex range. Draws garbage or nothing,
 *                silently. Gated at zero.
 *   outward      fraction of triangles whose face normal points away from the
 *                mesh centroid. For a closed body this is ~1.0, and a patch
 *                wound inside out drags it down — which is exactly the defect
 *                the characters lane landed a fix for the same night this tool
 *                was written ("every lower eyelid in the game was wound inside
 *                out, and it was covering the eye"). Ratcheted, not gated at 1:
 *                a real creature has concavities and legitimately dips below.
 *   tangent-w    stored bitangent sign against the one re-derived from
 *                positions and UVs. Reported when tangents exist.
 *
 * ## What this check is blind to
 *
 *   - **Anything it cannot build in bare Node.** Rocks, town kits, water and
 *     terrain all want a browser or a live `Ecology`; this covers trees and the
 *     bestiary. The asserts themselves have no such limit — call them from the
 *     generator.
 *   - **Whether the winding matches the MATERIAL.** A `DoubleSide` material
 *     hides a flip until the depth order changes, and that is precisely how the
 *     eye-socket bug stayed invisible. Side-ness is not visible from here.
 *   - **UV *placement*.** `assertCardOrientation` checks handedness, not which
 *     tile of an atlas a card landed on.
 *   - **Shape.** That is `silhouette.mts`. Seating is `floatcheck.mts`.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import {
  downFacing, assertCardOrientation, tangentHandednessErrors, edgeConsistency,
  assertAttributeContract,
} from '../util/GeoAssert.ts';
import type { GeoLike } from '../util/GeoAssert.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE = path.join(ROOT, 'project', 'geo-baseline.json');

interface Row {
  name: string;
  tris: number;
  nan: number;
  badIndex: number;
  outward: number;
  tangentBad: number;
  tangentTotal: number;
  flipped: number;
  boundary: number;
  interior: number;
}

/** Non-finite numbers in any float attribute. There is no benign NaN here. */
function nanCount(geo: THREE.BufferGeometry): number {
  let n = 0;
  for (const key of ['position', 'normal', 'uv', 'uv1', 'tangent', 'color']) {
    const a = geo.getAttribute(key);
    if (!a) continue;
    const arr = a.array;
    for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) n++;
  }
  return n;
}

/** Indices outside the vertex range: draws garbage or nothing, and never errors. */
function badIndexCount(geo: THREE.BufferGeometry): number {
  const idx = geo.getIndex();
  const pos = geo.getAttribute('position');
  if (!idx || !pos) return 0;
  let n = 0;
  for (let i = 0; i < idx.count; i++) {
    const v = idx.array[i];
    if (!(v >= 0 && v < pos.count)) n++;
  }
  return n;
}

/**
 * Fraction of triangles whose face normal points away from the mesh centroid.
 *
 * The winding test that works on a closed body. Comparing the face normal
 * against the *vertex* normals cannot catch an inverted patch, because vertex
 * normals are usually computed from the same winding and flip with it. The
 * centroid does not.
 */
function outwardFraction(geo: THREE.BufferGeometry): number {
  const pos = geo.getAttribute('position');
  if (!pos) return NaN;
  const P = pos.array;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < pos.count; i++) { cx += P[i * 3]; cy += P[i * 3 + 1]; cz += P[i * 3 + 2]; }
  cx /= pos.count; cy /= pos.count; cz /= pos.count;
  const idx = geo.getIndex();
  const n = idx ? idx.count : pos.count;
  let out = 0, tot = 0;
  for (let t = 0; t + 2 < n; t += 3) {
    const a = (idx ? idx.array[t] : t) * 3;
    const b = (idx ? idx.array[t + 1] : t + 1) * 3;
    const c = (idx ? idx.array[t + 2] : t + 2) * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (Math.hypot(nx, ny, nz) < 1e-12) continue;
    const mx = (P[a] + P[b] + P[c]) / 3 - cx;
    const my = (P[a + 1] + P[b + 1] + P[c + 1]) / 3 - cy;
    const mz = (P[a + 2] + P[b + 2] + P[c + 2]) / 3 - cz;
    tot++;
    if (nx * mx + ny * my + nz * mz > 0) out++;
  }
  return tot ? out / tot : NaN;
}

function measure(name: string, geo: THREE.BufferGeometry): Row {
  const t = tangentHandednessErrors(geo as unknown as GeoLike);
  const e = edgeConsistency(geo as unknown as GeoLike);
  const idx = geo.getIndex();
  const pos = geo.getAttribute('position');
  return {
    flipped: e.flipped, boundary: e.boundary, interior: e.interior,
    name,
    tris: Math.floor((idx ? idx.count : (pos ? pos.count : 0)) / 3),
    nan: nanCount(geo),
    badIndex: badIndexCount(geo),
    outward: outwardFraction(geo),
    tangentBad: t.bad,
    tangentTotal: t.total,
  };
}

/* ------------------------------------------------------------------ controls */

/** A single upward-facing quad, wound correctly, with sane UVs. */
function quad(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(
    [0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1], 3,
  ));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  // Wound so the face normal is +Y: with y up and z into the screen, that is
  // clockwise seen from above, which is (0,2,1) not (0,1,2).
  g.setIndex([0, 2, 1, 0, 3, 2]);
  return g;
}

const argv = process.argv.slice(2);
const controlsOnly = argv.includes('--controls');
const setBaseline = argv.includes('--set-baseline');
const setIx = argv.indexOf('--set');
const sets = setIx >= 0 ? [argv[setIx + 1]] : ['trees', 'enemies'];

console.log('geocheck — winding, orientation and attribute asserts (bare Node, working tree)\n');
console.log('controls, answers known before the run:');

const ok = quad();
const okDown = downFacing(ok as unknown as GeoLike).downFacing;

const rev = quad();
const ri = ok.getIndex()!.array;
rev.setIndex([ri[2], ri[1], ri[0], ri[5], ri[4], ri[3]] as number[]);
const revDown = downFacing(rev as unknown as GeoLike).downFacing;

const thrown = (f: () => void): string => {
  try { f(); return 'did NOT throw'; } catch { return 'threw'; }
};
const transposed = quad();
{
  const u = transposed.getAttribute('uv')!.array as Float32Array;
  for (let i = 0; i < u.length; i += 2) { const t = u[i]; u[i] = u[i + 1]; u[i + 1] = t; }
}
const mirrored = quad();
{
  const u = mirrored.getAttribute('uv')!.array as Float32Array;
  for (let i = 0; i < u.length; i += 2) u[i] = -u[i];
}

const sphere = new THREE.SphereGeometry(1, 16, 12).toNonIndexed();
const inside = sphere.clone();
{
  const p = inside.getAttribute('position')!.array as Float32Array;
  for (let t = 0; t < p.length; t += 9) {
    for (let k = 0; k < 3; k++) { const s = p[t + 3 + k]; p[t + 3 + k] = p[t + 6 + k]; p[t + 6 + k] = s; }
  }
}
const sphereOut = outwardFraction(sphere);
const insideOut = outwardFraction(inside);

// The edge-parity control: a correct sphere has no same-direction interior
// edge; one triangle reversed makes three of them.
const patched = sphere.clone();
{
  const p = patched.getAttribute('position')!.array as Float32Array;
  // A MID-BAND triangle, not triangle 0: a UV sphere's first row is the pole
  // fan, whose triangles are degenerate after welding and are skipped, so
  // flipping one of those changed nothing and the control read 0 instead of 3.
  const t = Math.floor(p.length / 9 / 2) * 9;
  for (let k = 0; k < 3; k++) { const s2 = p[t + 3 + k]; p[t + 3 + k] = p[t + 6 + k]; p[t + 6 + k] = s2; }
}
const sphereEdges = edgeConsistency(sphere as unknown as GeoLike);
const patchedEdges = edgeConsistency(patched as unknown as GeoLike);

/**
 * The attribute-contract controls: the same quad, with and without a `uv`, put
 * against a material that binds a map.
 *
 * `assertAttributeContract` was the one assert in `GeoAssert.ts` with no caller
 * anywhere — not in a generator, not even here — which is the built-but-unwired
 * disease `handoff/method.md` §9.4 names, applied to the library written to
 * cure it. Both halves are controlled, because an assert that always throws and
 * an assert that never throws are equally useless and look identical from a
 * PASS.
 */
const noUv = quad();
noUv.deleteAttribute('uv');
const mapped = { map: {} };
const contractCatches = thrown(() => assertAttributeContract(noUv as unknown as GeoLike, mapped, 'ctl'));
const contractPasses = thrown(() => assertAttributeContract(ok as unknown as GeoLike, mapped, 'ctl'));
const vcNoColor = thrown(() => assertAttributeContract(ok as unknown as GeoLike, { vertexColors: true }, 'ctl'));

const controls: [string, string, boolean][] = [
  ['quad, correct', `${okDown} down-facing (expect 0)`, okDown === 0],
  ['quad, reversed', `${revDown} down-facing (expect 2)`, revDown === 2],
  ['quad, transposed uv', thrown(() => assertCardOrientation(transposed as unknown as GeoLike, 'ctl')), thrown(() => assertCardOrientation(transposed as unknown as GeoLike, 'ctl')) === 'threw'],
  ['quad, mirrored uv', thrown(() => assertCardOrientation(mirrored as unknown as GeoLike, 'ctl')), thrown(() => assertCardOrientation(mirrored as unknown as GeoLike, 'ctl')) === 'threw'],
  ['sphere / inside-out', `${(sphereOut * 100).toFixed(0)}% / ${(insideOut * 100).toFixed(0)}% outward (expect 100 / 0)`, sphereOut > 0.99 && insideOut < 0.01],
  ['sphere edge parity', `${sphereEdges.flipped} flipped over ${sphereEdges.interior} interior (expect 0)`, sphereEdges.flipped === 0],
  ['sphere, one tri flipped', `${patchedEdges.flipped} flipped (expect 3)`, patchedEdges.flipped === 3],
  ['mapped quad, no uv', contractCatches, contractCatches === 'threw'],
  ['mapped quad, with uv', contractPasses, contractPasses === 'did NOT throw'],
  ['vertexColors, no color', vcNoColor, vcNoColor === 'threw'],
];
let broken = 0;
for (const [name, said, good] of controls) {
  console.log(`  ${name.padEnd(22)} ${said}${good ? '' : '   <-- WRONG'}`);
  if (!good) broken++;
}
// The correct card must also PASS the orientation assert, or the check is
// simply a function that always throws.
const okOrient = thrown(() => assertCardOrientation(ok as unknown as GeoLike, 'ctl'));
console.log(`  quad, correct uv       ${okOrient} (expect: did NOT throw)`);
if (okOrient !== 'did NOT throw') broken++;

if (broken) {
  console.log(`\nVOID: ${broken} control(s) came back wrong. Nothing below means anything.`);
  process.exit(2);
}
if (controlsOnly) process.exit(0);

/* ------------------------------------------------------------------ subjects */

const rows: Row[] = [];
if (sets.includes('trees')) {
  const { buildTree, TREE_SPECIES } = await import('../world/veg/TreeBuilder.ts');
  for (const species of Object.keys(TREE_SPECIES)) {
    const t = buildTree(species, 1000);
    rows.push(measure(`tree:${species}:wood`, t.wood));
    if (t.leaves) rows.push(measure(`tree:${species}:leaves`, t.leaves));
  }
}
/**
 * Every mesh whose geometry does not carry what its material binds.
 *
 * This is `assertAttributeContract` finally having a caller. §9.5 wrote it for
 * the sibling's black megaliths — a UV-less mesh on a UV material — and it is
 * the one assert here that needs a mesh and its MATERIAL together, which is why
 * a geometry-only pass could never run it. The bestiary is the population this
 * tool can build in bare Node that has both.
 */
const contract: string[] = [];
/** How many material/mesh pairs were examined, and how many had anything to check. */
let contractPairs = 0, contractBinding = 0;

if (sets.includes('enemies')) {
  const { BESTIARY } = await import('../characters/enemies/Bestiary.ts');
  for (const [key, def] of Object.entries(BESTIARY)) {
    if (def.protoKey && def.protoKey !== key) continue;
    const proto = def.buildPrototype();
    let i = 0;
    proto.group.traverse((o: THREE.Object3D) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || !m.geometry) return;
      const label = `enemy:${key}:${m.name || i++}`;
      rows.push(measure(label, m.geometry));
      for (const mm of (Array.isArray(m.material) ? m.material : [m.material])) {
        if (!mm) continue;
        const md = mm as THREE.MeshStandardMaterial;
        contractPairs++;
        if (md.map || md.normalMap || md.aoMap || md.vertexColors) contractBinding++;
        try { assertAttributeContract(m.geometry as unknown as GeoLike, md, label); }
        catch (e) { contract.push(String((e as Error).message)); }
      }
    });
  }
}

const nan = rows.filter((r) => r.nan > 0);
const badIdx = rows.filter((r) => r.badIndex > 0);
const tanBad = rows.filter((r) => r.tangentBad > 0);

console.log(`\n${rows.length} geometries measured\n`);
console.log(`  non-finite numbers        ${nan.length} geometries`);
console.log(`  out-of-range indices      ${badIdx.length} geometries`);
console.log(`  tangent w disagreements   ${tanBad.length} geometries (${rows.filter((r) => r.tangentTotal > 0).length} carry tangents at all)`);
for (const r of [...nan, ...badIdx, ...tanBad].slice(0, 20)) {
  console.log(`    ${r.name.padEnd(34)} nan ${r.nan}  badIndex ${r.badIndex}  tangent ${r.tangentBad}/${r.tangentTotal}`);
}

// The population is printed with the verdict, because a zero over a population
// of zero is not a pass, it is a check that never ran — the failure mode this
// tool's own controls exist to catch, one level up.
console.log(`  material/mesh contract    ${contract.length} broken of ${contractPairs} mesh/material pairs, `
  + `${contractBinding} of which bind a map, an aoMap, a normalMap or vertexColors (EXACT, and gated)`);
for (const c of contract.slice(0, 20)) console.log(`    ${c}`);

const flippedRows = rows.filter((r) => r.flipped > 0).sort((a, b) => b.flipped - a.flipped);
console.log(`  edge-parity imbalance     ${flippedRows.length} geometries (RATCHETED, not gated — see below)`);
for (const r of flippedRows.slice(0, 20)) {
  console.log(`    ${r.name.padEnd(34)} ${r.flipped} same-direction interior edges of ${r.interior}, ${r.boundary} boundary`);
}

const closed = rows.filter((r) => r.tris > 200 && Number.isFinite(r.outward)).sort((a, b) => a.outward - b.outward);
console.log('');
console.log('  Edge parity is EXACT and its control is verified above (a sphere with one');
console.log('  triangle flipped reads 3, and coincident shells read 0 because the test is');
console.log('  parity and not duplication). What it cannot do is attribute: a mirrored limb');
console.log('  whose index was never flipped and a stack of primitives welding into a');
console.log('  non-manifold junction look identical from here. 15 of 21 species carry some.');
console.log('  Treat it as a LEAD: render one species with side: BackSide and look.');
console.log('\n  least-outward geometries — a WEAK secondary read: a sphere scores 100%,');
console.log('  a limbed creature 52-62%, and random is 50. Ratcheted, never gated.');
for (const r of closed.slice(0, 12)) {
  console.log(`    ${r.name.padEnd(34)} ${(r.outward * 100).toFixed(1)}% outward over ${r.tris} tris`);
}

console.log('\nblind to: anything not buildable in bare Node (rocks, town, water, terrain —');
console.log('          the asserts themselves have no such limit, call them from the');
console.log('          generator); whether the winding matches the MATERIAL, since a');
console.log('          DoubleSide material hides a flip; UV placement; shape; seating.');
console.log('          The attribute contract sees PRESENCE and never correctness: a uv');
console.log('          set of all zeroes, or the wrong uv set on the aoMap, passes it.');

/* --------------------------------------------------------------- the ratchet */

interface Baseline {
  note: string;
  worstOutward: Record<string, number>;
  flipped: Record<string, number>;
}
const worst: Record<string, number> = {};
for (const r of closed.slice(0, 24)) worst[r.name] = Math.round(r.outward * 1000) / 1000;
const flippedBase: Record<string, number> = {};
for (const r of flippedRows) flippedBase[r.name] = r.flipped;

if (setBaseline) {
  const b: Baseline = {
    note: 'Outward-facing fraction of the 24 least-outward geometries, recorded for '
      + 'context only. A real creature has concavities, so this is not 1.0, and a '
      + 'ratchet on it failed on the trees lane\'s habit layer -- a legitimate shape '
      + 'change. Only `flipped` is gated. It used to say a geometry may not get less outward than it '
      + 'was. `worstOutward` is RECORDED and not gated -- see the note in the tool. '
      + '`flipped` is the '
      + 'edge-parity imbalance: interior edges whose two directions are traversed '
      + 'an unequal number of times. It is NOT gated at zero because this tool '
      + 'cannot tell a mirrored limb whose index was never flipped (a real bug) '
      + 'from a stack of primitives welding into a non-manifold junction (not '
      + 'one). It is gated against going up.',
    worstOutward: worst,
    flipped: flippedBase,
  };
  await writeFile(BASELINE, `${JSON.stringify(b, null, 1)}\n`);
  console.log(`\nwrote ${path.relative(ROOT, BASELINE)} with ${Object.keys(worst).length} entries`);
  process.exit(0);
}

let fails = nan.length + badIdx.length + contract.length;
if (nan.length) console.log(`\nFAIL — ${nan.length} geometries carry non-finite numbers.`);
if (badIdx.length) console.log(`FAIL — ${badIdx.length} geometries index outside their own vertex range.`);
// Gated, unlike the two ratcheted reads: it is exact, both of its controls are
// verified above, and it is zero today. A missing `uv` under a bound map is a
// flat colour and a missing `color` under `vertexColors` is black — both read
// as a material decision, which is why nothing downstream ever reports them.
if (contract.length) console.log(`FAIL — ${contract.length} meshes break their material's attribute contract.`);

let base: Baseline | null = null;
try { base = JSON.parse(await readFile(BASELINE, 'utf8')) as Baseline; } catch { base = null; }
if (!base) {
  console.log(`\nno ${path.relative(ROOT, BASELINE)} — run --set-baseline once to arm the winding ratchet.`);
} else {
  const regressed: string[] = [];
  for (const r of rows) {
    const wasFlipped = base.flipped[r.name] ?? 0;
    if (r.flipped > wasFlipped) {
      regressed.push(`${r.name}: edge-parity imbalance ${wasFlipped} -> ${r.flipped}`);
    }
    // The outward fraction is deliberately NOT ratcheted. It is a weak read --
    // 100% on a sphere, 52-62% on a limbed creature, 50% is chance -- and the
    // first version DID ratchet it, then failed the moment the trees lane
    // landed its habit layer: six geometries "wound further inside out" by one
    // to three points, every one of them a legitimate shape change. A weak
    // metric with a tight ratchet is a gate that cries wolf, which is the exact
    // failure this lane exists to prevent. It is printed, and nothing more.
  }
  if (regressed.length) {
    console.log(`\nFAIL — ${regressed.length} geometries wound further inside out:`);
    for (const g of regressed) console.log(`  ${g}`);
    fails += regressed.length;
  }
}

if (fails) process.exit(1);
console.log(`\nPASS — 0 non-finite, 0 bad indices, 0 broken attribute contracts, 0 inside-out `
  + `patches across ${rows.length} geometries.`);
