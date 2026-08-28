#!/usr/bin/env node
/* What LAYER_AVG claims each terrain layer averages, against what the recipes
 * actually synthesise.
 *
 * `albedoArray` is `SRGBColorSpace` with mipmaps, so the GPU decodes to linear
 * BEFORE filtering: the top mip a far pixel reads is the mean *linear* albedo.
 * `farCol` multiplies `uLayerAvg` straight into linear light, so LAYER_AVG has
 * to be that same mean linear albedo or the far LOD and the near detail paint
 * two different materials.
 *
 *   node src/tools/layeravg.mts [size]
 */
import { buildLayerData, LAYER_NAMES, LAYER_COUNT, LAYER_AVG } from '../world/terrain/Layers.ts';

const size = Number(process.argv[2] || 256);
const d = buildLayerData(size);
const px = size * size;
const toLin = (b: number) => { const s = b / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

console.log('layer     mean LINEAR albedo (what the far mip reads)   Y     | LAYER_AVG              Y     | ratio');
const meas: number[][] = [];
for (let L = 0; L < LAYER_COUNT; L++) {
  const off = L * px * 4;
  let R = 0, G = 0, B = 0;
  for (let i = 0; i < px; i++) {
    R += toLin(d.albedo[off + i * 4]); G += toLin(d.albedo[off + i * 4 + 1]); B += toLin(d.albedo[off + i * 4 + 2]);
  }
  R /= px; G /= px; B /= px;
  meas.push([R, G, B]);
  const a = LAYER_AVG[L];
  const yM = lum(R, G, B), yA = lum(a[0], a[1], a[2]);
  console.log(`${LAYER_NAMES[L].padEnd(8)} [${R.toFixed(3)}, ${G.toFixed(3)}, ${B.toFixed(3)}]  ${yM.toFixed(3)}   | ` +
    `[${a[0].toFixed(3)}, ${a[1].toFixed(3)}, ${a[2].toFixed(3)}]  ${yA.toFixed(3)}   | ${(yA / yM).toFixed(2)}x`);
}
const ys = meas.map((m) => lum(m[0], m[1], m[2]));
const ya = LAYER_AVG.map((a) => lum(a[0], a[1], a[2]));
console.log(`\nmeasured luma span ${Math.min(...ys).toFixed(3)}-${Math.max(...ys).toFixed(3)}  ratio ${(Math.max(...ys) / Math.min(...ys)).toFixed(2)}x`);
console.log(`LAYER_AVG  span    ${Math.min(...ya).toFixed(3)}-${Math.max(...ya).toFixed(3)}  ratio ${(Math.max(...ya) / Math.min(...ya)).toFixed(2)}x`);
console.log('\nLAYER_AVG as measured:');
for (let L = 0; L < LAYER_COUNT; L++) {
  console.log(`  [${meas[L][0].toFixed(3)}, ${meas[L][1].toFixed(3)}, ${meas[L][2].toFixed(3)}],   // ${LAYER_NAMES[L]}`);
}
