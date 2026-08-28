/**
 * Which shots carry NaN pixels in the linear scene target?
 *
 *   node src/tools/probe.mts src/tools/probes/nanscan.mts --build <ref>
 *
 * A NaN written by any material survives the composer and lands on the canvas
 * as a hole of pure 0,0,0 that reads as a solid black blob — the Nebulawood
 * canopy defect. It is invisible to every gate in the suite: it is not a page
 * error, it does not move a draw count, and against a *baseline that has the
 * same hole in it* it is not even a pixel diff. So look for the NaN itself.
 *
 * `rtScene` is HalfFloatType, so the readback is a `Uint16Array` decoded here;
 * an exponent of 31 with a non-zero mantissa is the only thing being counted.
 * The canvas cannot be used for this — 8-bit output has no NaN, only black.
 */
const g = window.GAME;
const r = g.renderer;
const p = g.post;
const rt = p.rtScene;

const M = await import('/game/Shots.ts');
const names = Object.keys(M.SHOTS).filter((n) => n !== M.PROBE_SHOT && M.SHOTS[n]);

const h2f = (h) => {
  const s = (h & 0x8000) ? -1 : 1, e = (h & 0x7c00) >> 10, f = h & 0x03ff;
  if (e === 0) return s * 6.103515625e-5 * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * Math.pow(2, e - 15) * (1 + f / 1024);
};

const buf = new Uint16Array(rt.width * rt.height * 4);
/** NaN pixel count and their bounding box, in canvas space. */
const scan = () => {
  r.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, buf);
  let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
  for (let i = 0; i < rt.width * rt.height; i++) {
    const v = h2f(buf[i * 4]) + h2f(buf[i * 4 + 1]) + h2f(buf[i * 4 + 2]);
    if (!Number.isNaN(v)) continue;
    n++;
    const x = i % rt.width, y = rt.height - 1 - ((i / rt.width) | 0);
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return n ? { n, box: [x0, y0, x1, y1] } : { n: 0 };
};

const hits = [];
for (const name of names) {
  // The daemon's own pose, so a NaN found here is one a capture would show.
  g.resetClock();
  g.applyShot(name);
  g.settle(40);
  g.applyShot(name);
  g.settle(8);
  const s = scan();
  if (s.n) { hits.push({ name, ...s }); console.log(`[nanscan] ${name} ${s.n} px ${s.box}`); }
}
console.log(`[nanscan] ${hits.length} of ${names.length} shots carry NaN`);
return { shots: names.length, hits };
