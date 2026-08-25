/*
 * What the sky's SH probe delivers, and from which direction.
 *
 * Sibling-ports 3.8(a). The A/B capture said the probe moved shadow warmth by
 * 0.6 of a 15.7-point gap it was predicted to close a quarter of. That is a
 * number about a *frame*, and a frame cannot distinguish "the probe is nearly
 * flat" from "the probe is strongly directional and something downstream eats
 * it". So ask the probe.
 *
 * Read as irradiance at six cardinal normals: the sky's own light arriving on
 * a surface facing each way. If +Y and -Y come back the same colour the probe
 * has no directionality worth having and the whole change is a wash; if they
 * differ and the frame does not, the loss is downstream of here.
 */
const g = window.GAME;
const sky = g.get('Sky');
if (!sky || !sky.probe) return 'no Sky.probe';

/* `shGetIrradianceAt` from three's `lights_pars_begin`, on the CPU. */
function irradianceAt(c, n) {
  const x = n[0], y = n[1], z = n[2];
  const out = [0, 0, 0];
  const add = (k, w) => { out[0] += c[k].x * w; out[1] += c[k].y * w; out[2] += c[k].z * w; };
  add(0, 0.886227);
  add(1, 2.0 * 0.511664 * y);
  add(2, 2.0 * 0.511664 * z);
  add(3, 2.0 * 0.511664 * x);
  add(4, 2.0 * 0.429043 * x * y);
  add(5, 2.0 * 0.429043 * y * z);
  add(6, 0.743125 * z * z - 0.247708);
  add(7, 2.0 * 0.429043 * x * z);
  add(8, 0.429043 * (x * x - y * y));
  return out;
}

const DIRS = [
  ['+Y up   ', [0, 1, 0]],
  ['-Y down ', [0, -1, 0]],
  ['+X east ', [1, 0, 0]],
  ['-X west ', [-1, 0, 0]],
  ['+Z south', [0, 0, 1]],
  ['-Z north', [0, 0, -1]],
];

const rows = [];
for (const h of [7.0, 12.0, 17.5, 22.0]) {
  sky.setTimeOfDay(h);
  const c = sky.probe.light.sh.coefficients;
  const I = sky.probe.light.intensity;
  const ga = sky.probe.groundAlbedo;
  const gr = sky.probe.groundRadiance;
  rows.push(`\n--- ${h.toFixed(1)}h  intensity ${I.toFixed(3)}  albedo `
    + `${ga.r.toFixed(3)},${ga.g.toFixed(3)},${ga.b.toFixed(3)}  groundRad `
    + `${gr.r.toFixed(4)},${gr.g.toFixed(4)},${gr.b.toFixed(4)}  `
    + `fill ${sky.fill.intensity.toFixed(3)}  env ${(sky._envIntensity ?? 1).toFixed(3)}`);
  rows.push('  normal      R        G        B       luma     R-B(/255)');
  for (const [name, n] of DIRS) {
    const e = irradianceAt(c, n).map((v) => v * I);
    const luma = 0.2126 * e[0] + 0.7152 * e[1] + 0.0722 * e[2];
    // R-B on the 0-255 scale imagestats reports, so the two are comparable
    const rb = (e[0] - e[2]) * 255;
    rows.push(`  ${name}  ${e[0].toFixed(4)}   ${e[1].toFixed(4)}   ${e[2].toFixed(4)}  `
      + `${luma.toFixed(4)}   ${rb >= 0 ? '+' : ''}${rb.toFixed(1)}`);
  }
}

return rows.join('\n');
