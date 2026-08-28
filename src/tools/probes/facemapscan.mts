/**
 * A scanline out of the *shipped* painted face map, in texels.
 *
 *   node src/tools/probe.mts src/tools/probes/facemapscan.mts --dirty
 *
 * A hard vertical hairline runs down the midline of every front view of every
 * head in this repo. It survives hiding the hair, negating the shell's normals
 * and every hour of the day, and it **disappears when the map is replaced by a
 * flat colour** — so it is painted, not shaded. This reads the texels.
 */
const g = window.GAME;
const ch = g.get('Player').character;
const map = ch.faceMat.map;
const src = map.mipmaps ? map.mipmaps[0] : map.image;
const S = src.width;
const cv = document.createElement('canvas');
cv.width = S; cv.height = src.height;
const cx = cv.getContext('2d');
cx.drawImage(src, 0, 0);
const L = [`map ${S}x${src.height}  flipY ${map.flipY}`];
// v is (y - yMin)/(yMax - yMin) and the canvas is drawn at (1 - v) * S
const Y_MIN = -0.122, Y_MAX = 0.116;
const rowOf = (y) => Math.round((1 - (y - Y_MIN) / (Y_MAX - Y_MIN)) * src.height);
for (const [name, y] of [['crown', 0.090], ['forehead', 0.045], ['brow', 0.010],
  ['nasion', -0.006], ['nose', -0.033], ['mouth', -0.064], ['chin', -0.100]]) {
  const r = Math.max(0, Math.min(src.height - 1, rowOf(y)));
  const d = cx.getImageData(0, r, S, 1).data;
  const x0 = Math.round(0.485 * S), x1 = Math.round(0.515 * S);
  const vals = [];
  for (let x = x0; x <= x1; x += 1) {
    const i = x * 4;
    vals.push((0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]).toFixed(0).padStart(4));
  }
  L.push(`${name.padEnd(9)} row ${String(r).padStart(4)}  u 0.485..0.515 (x ${x0}..${x1}, step 1):`);
  L.push('  ' + vals.join(''));
}
return L.join('\n');
