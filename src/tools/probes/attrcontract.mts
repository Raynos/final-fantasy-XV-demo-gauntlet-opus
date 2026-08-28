/**
 * Did `PartBuilder.build`'s attribute-contract check actually run, over what,
 * and can it still tell a broken mesh from a whole one?
 *
 *   node src/tools/probe.mts src/tools/probes/attrcontract.mts
 *
 * `assertAttributeContract` is wired into `PartBuilder.build` -- see the block
 * there for why it is `try`/`catch` + `console.error` and never a throw. A wired
 * assert reporting zero failures proves nothing on its own: `geocheck` had to
 * learn that and now prints its pair count beside its verdict. So this reports
 * three things and none of them alone is the answer.
 *
 * 1. `checked` / `binding` -- the population. `binding` is the number that
 *    matters: pairs whose material asks for a map, an aoMap, a normalMap or
 *    `vertexColors`. A contract check over materials that bind nothing is
 *    vacuous.
 * 2. `broken` -- the verdict.
 * 3. **A positive control.** `PartBuilder.prep` guarantees `uv` and `normal` on
 *    every piece and `build` synthesises white `color` for any batch that needs
 *    it, so at THIS call site three of the four arms are unreachable by
 *    construction and the check is a **ratchet on those guarantees**, not a
 *    bug-hunt. That is worth knowing and it is also exactly the shape of a
 *    check that has quietly stopped working. The control strips `uv` off a real
 *    prepped geometry and asserts against a mapped material: if that does not
 *    throw, the instrument is broken and the zero above means nothing.
 *
 * The one arm nothing here guarantees is `aoMap` -> `uv1`. No prop material
 * binds an aoMap today; the day one does, this fires.
 */
const pb = await import('/world/props/PartBuilder.ts');
const ga = await import('/util/GeoAssert.ts');
const c = pb.ATTR_CONTRACT;

// **The positive control, on a real shipped geometry.** Take a merged prop mesh
// out of the scene, clone it, strip its `uv`, and assert against a mapped
// material. If that does not throw, the instrument is broken and the zero above
// means nothing. Using a shipped mesh rather than a fresh primitive also avoids
// needing `three` in here -- a page module cannot resolve a bare specifier.
let victim = null;
window.GAME.scene.traverse((o) => {
  if (!victim && o.isMesh && o.geometry && o.geometry.getAttribute('uv')
    && /_part|_out_|_mega_|_kit/.test(o.name || '')) victim = o;
});
let control = 'NO VICTIM - could not find a merged prop mesh with a uv';
if (victim) {
  const g = victim.geometry.clone();
  g.deleteAttribute('uv');
  control = 'DID NOT THROW - the instrument is broken';
  try { ga.assertAttributeContract(g, { map: {} }, 'control'); }
  catch (e) { control = 'throws on ' + victim.name + ': ' + String(e.message).slice(0, 70); }
}

return {
  checked: c.checked,
  binding: c.binding,
  broken: c.broken,
  control,
  verdict: c.broken > 0 ? `BROKEN - ${c.broken} pairs`
    : c.binding === 0 ? 'VACUOUS - nothing in this scene binds an attribute'
      : control.startsWith('throws') ? `ok - 0 broken of ${c.checked} mesh/material pairs, ${c.binding} of which bind an attribute`
        : 'INSTRUMENT BROKEN - ' + control,
};
