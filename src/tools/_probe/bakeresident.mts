/*
 * lane13: which of the four bake containers is still resident after boot, and
 * how many bytes each one is pinning.
 *
 *   node src/tools/probe.mts src/tools/_probe/bakeresident.mts
 *
 * Dev build only — it reaches the modules by their source URL, which is the
 * same module instance the game imported.
 */
const out = [];
const MB = (b) => `${(b / 1e6).toFixed(1)} MB`;
try {
  const gb = await import('/engine/GeoBake.ts');
  out.push(`GeoBake  ready(container resident) = ${gb.geoBakeReady()}`);
} catch (e) { out.push(`GeoBake  import failed: ${e.message}`); }
try {
  const tb = await import('/engine/TexBake.ts');
  out.push(`TexBake  ready(container resident) = ${tb.texBakeReady()}`);
  if (tb.compactTexBake) out.push(`TexBake  a second compaction would still hold ${MB(tb.compactTexBake())}`);
} catch (e) { out.push(`TexBake  import failed: ${e.message}`); }
try {
  const fb = await import('/world/terrain/FieldBake.ts');
  out.push(`FieldBake exports: ${Object.keys(fb).join(', ')}`);
} catch (e) { out.push(`FieldBake import failed: ${e.message}`); }
return out.join('\n');
