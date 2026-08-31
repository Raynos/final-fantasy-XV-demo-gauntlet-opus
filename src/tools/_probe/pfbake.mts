/**
 * Portrait-bake tuning rig.
 *
 * `src/ui/Portraits.ts` renders a head into a 288x336 plate, and every knob it
 * has — lens distance, three-quarter swing, how far the lens dips below the eye
 * line, headroom, fov, and the exposure normalisation — is a *look* decision.
 * Booting the game per attempt is the wrong price, so this evaluates a whole
 * sweep in one boot and hands back the plates as data URLs; the caller writes
 * them out and reads a contact sheet.
 *
 *   node src/tools/framecam.mts --probe src/tools/_probe/pfbake.mts \
 *     --out tmp/shots/pfbake > tmp/l12b/pf.json
 *
 * Evaluated as a function body in the page with `new Function`, so the top-level
 * `return` is correct and there are **no type annotations anywhere below**: the
 * body is handed to the JS parser verbatim, never to esbuild, and a single `:`
 * annotation fails it with `Missing initializer in const declaration`.
 */
const g = window.GAME;
const P = await import('/ui/Portraits.ts');
const D = P.DEFAULT_BAKE;

/** `gain = 1` exactly: the plate as the renderer handed it over, ungraded. */
const RAW = { ...D, targetLuma: 10, maxGain: 1 };

const variants = [
  ['raw', RAW],
  ['g24', { ...D, targetLuma: 0.24, maxGain: 2.0 }],
  ['g18', { ...D, targetLuma: 0.18, maxGain: 1.6 }],
  ['g30', { ...D, targetLuma: 0.30, maxGain: 6 }],
  // framing candidates, all on the raw grade so the two axes stay separate
  ['f_near', { ...RAW, dist: 0.50, fov: 26 }],
  ['f_flat', { ...RAW, dip: 0.02, aimUp: 0.06 }],
  ['f_front', { ...RAW, swing: 0.22 }],
  ['f_wide', { ...RAW, swing: 0.62 }],
];

const out = {};
const ids = ['noctis', 'gladio', 'ignis', 'prompto'];
for (const [vn, o] of variants) {
  for (const id of ids) {
    // Only the grade sweep needs all four faces; a framing reads off two.
    if (vn.startsWith('f_') && id !== 'noctis' && id !== 'gladio') continue;
    const ch = P.heroCharacter(g, id);
    if (!ch) { out[`${vn}_${id}`] = 'MISSING'; continue; }
    out[`${vn}_${id}`] = P.bake(g, ch, o) || 'NULL';
  }
}
return { plates: out };
