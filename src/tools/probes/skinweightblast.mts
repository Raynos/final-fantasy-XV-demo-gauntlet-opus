/*
 * How many creatures did `mergeCreature`'s Uint8 skinWeight row break?
 *
 *   node src/tools/probe.mts src/tools/probes/skinweightblast.mts --dirty
 *
 * `Sculpt.ts:512` says of that row: "Nothing in this file or in
 * `CreatureGeo.ts` writes skin weights today, so the row is unreachable and
 * the guard above skips it." The guard is `if (!geos[0].attributes[name])
 * continue`, and `RigBuilder.attach/attachBlend/attachChain` DO write
 * skinWeight -- as `Float32BufferAttribute` -- and `Rig.build` calls
 * `mergeCreature`. So the row is reached by every creature in the bestiary,
 * and `arr.set(floatSrc, off)` into a `Uint8Array` truncates: a weight of 1.0
 * survives, and 0.98/0.02 becomes 0/0. A vertex whose weights sum to zero
 * skins to the mesh origin.
 *
 * This counts it, per species, rather than arguing about it.
 */
const out = [];
const B = await import('/characters/enemies/Bestiary.ts');
const species = B.BESTIARY || B.SPECIES || B.default;
const keys = Object.keys(species);
out.push(`species: ${keys.length}`);
let broken = 0, totalBad = 0, totalV = 0;
for (const k of keys) {
  const def = species[k];
  if (!def || !def.buildPrototype) continue;
  let proto;
  try { proto = def.buildPrototype(); } catch (e) { out.push(`${k}: BUILD FAILED ${String(e).slice(0, 80)}`); continue; }
  const sw = proto.mesh && proto.mesh.geometry.attributes.skinWeight;
  if (!sw) { out.push(`${k}: no skinWeight`); continue; }
  let bad = 0;
  for (let i = 0; i < sw.count; i++) {
    if (sw.getX(i) + sw.getY(i) + sw.getZ(i) + sw.getW(i) < 0.5) bad++;
  }
  totalBad += bad; totalV += sw.count;
  if (bad) broken++;
  out.push(`${k}: ${bad}/${sw.count} verts collapsed (${(bad / sw.count * 100).toFixed(1)}%)  array=${sw.array.constructor.name}`);
}
out.push('');
out.push(`${broken}/${keys.length} species affected; ${totalBad}/${totalV} vertices (${(totalBad / Math.max(1, totalV) * 100).toFixed(1)}%) skin to the mesh origin`);
return out.join('\n');
