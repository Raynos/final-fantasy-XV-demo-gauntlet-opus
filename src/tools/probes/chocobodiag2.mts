/*
 * Isolate the zero-weight bug: is it `attachChain`, or is it `mergeCreature`?
 *
 *   node src/tools/probe.mts src/tools/probes/chocobodiag2.mts --dirty
 *
 * `chocobodiag.mts` measured 2720 of 6883 merged vertices at weightSum 0.
 * Both candidates write `w[i*4] = 1-k; w[i*4+1] = k`, which sums to 1 by
 * construction, so one of the two assumptions behind that sentence is false.
 * This checks the attribute at each stage instead of arguing about it.
 */
const g = window.GAME;
const out = [];
const RB = await import('/characters/enemies/RigBuilder.ts');
const GK = await import('/combat/GeoKit.ts');
const V3 = g.camera.position.constructor;

const sum4 = (a, i) => a[i * 4] + a[i * 4 + 1] + a[i * 4 + 2] + a[i * 4 + 3];

/* ---- stage 1: attachChain, straight out of the box ---- */
const rig = new RB.Rig();
rig.bone('root', null, [0, 0, 0]);
rig.bone('hips', 'root', [0, 1.30, -0.24]);
rig.bone('spine', 'hips', [0, 1.35, 0.06]);
rig.bone('chest', 'spine', [0, 1.36, 0.36]);
const P = (x, y, z) => new V3(x, y, z);
const barrel = GK.tube([
  P(0, 1.31, -0.54), P(0, 1.34, -0.22), P(0, 1.36, 0.08), P(0, 1.35, 0.36), P(0, 1.31, 0.56),
], [[0.23, 0.25], [0.34, 0.35], [0.37, 0.38], [0.34, 0.36], [0.24, 0.27]], { radialSeg: 14 });
GK.tint(barrel, 0xf2c73c);
rig.attachChain(barrel, ['hips', 'spine', 'chest'], 1.0);
{
  const w = barrel.attributes.skinWeight.array;
  const n = barrel.attributes.position.count;
  let bad = 0, first = -1;
  for (let i = 0; i < n; i++) { const s = sum4(w, i); if (s < 0.5) { bad++; if (first < 0) first = i; } }
  out.push(`stage1 attachChain: ${n} verts, ${bad} with weightSum<0.5, first ${first}`);
  out.push(`  w[0..7] = ${Array.from(w.slice(0, 8)).map((x) => x.toFixed(2)).join(' ')}`);
  out.push(`  w[56..63] = ${Array.from(w.slice(56, 64)).map((x) => x.toFixed(2)).join(' ')}`);
  out.push(`  skinWeight itemSize ${barrel.attributes.skinWeight.itemSize} count ${barrel.attributes.skinWeight.count} arraylen ${w.length}`);
}

/* ---- stage 2: attach, for contrast ---- */
const head = GK.blob(0.135, 0.125, 0.155, 14, 10);
GK.tint(head, 0xf2c73c);
rig.attach(head, 'chest');
{
  const w = head.attributes.skinWeight.array;
  const n = head.attributes.position.count;
  let bad = 0;
  for (let i = 0; i < n; i++) if (sum4(w, i) < 0.5) bad++;
  out.push(`stage2 attach:      ${n} verts, ${bad} with weightSum<0.5`);
}

/* ---- stage 3: after build/merge ---- */
const mat = RB.creatureMaterial({});
const built = rig.build(mat, { radius: 1.9 });
{
  const sw = built.mesh.geometry.attributes.skinWeight;
  const n = sw.count;
  let bad = 0, first = -1;
  for (let i = 0; i < n; i++) {
    const s = sw.getX(i) + sw.getY(i) + sw.getZ(i) + sw.getW(i);
    if (s < 0.5) { bad++; if (first < 0) first = i; }
  }
  out.push(`stage3 after merge: ${n} verts, ${bad} with weightSum<0.5, first ${first}`);
}

/* ---- stage 4: WHERE, exactly ---- */
{
  const geo2 = built.mesh.geometry;
  const sw = geo2.attributes.skinWeight, si = geo2.attributes.skinIndex;
  const bad = [];
  for (let i = 0; i < sw.count; i++) {
    const s = sw.getX(i) + sw.getY(i) + sw.getZ(i) + sw.getW(i);
    if (s < 0.5) bad.push(i);
  }
  out.push(`stage4 bad indices (first 50): ${bad.slice(0, 50).join(',')}`);
  out.push(`stage4 bad indices (last 10): ${bad.slice(-10).join(',')}`);
  const dump = (a, lo, hi) => {
    const r = [];
    for (let i = lo; i < hi; i++) r.push(`${i}:[${a.getX(i).toFixed(2)},${a.getY(i).toFixed(2)},${a.getZ(i).toFixed(2)},${a.getW(i).toFixed(2)}]`);
    return r.join(' ');
  };
  out.push(`merged sw 12..18: ${dump(sw, 12, 19)}`);
  out.push(`merged si 12..18: ${dump(si, 12, 19)}`);
  out.push(`merged counts: pos ${geo2.attributes.position.count} sw ${sw.count} si ${si.count} sw.itemSize ${sw.itemSize} arraylen ${sw.array.length}`);
  out.push(`merged sw array is ${sw.array.constructor.name}, si array is ${si.array.constructor.name}`);
}
return out.join('\n');
