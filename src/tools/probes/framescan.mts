/*
 * Is the frame a picture, or is it a rectangle of one colour?
 *
 * Runs every shot in `Shots.ts` and reads the **default framebuffer** — the
 * eight-bit frame a capture would write — with `gl.readPixels`, plus the linear
 * scene target for the radiance that produced it. Both, because they fail in
 * different directions and the pair is what names the cause:
 *
 *   - `white` / `black` are what a reader sees. A frame that is 95% clipped
 *     white or 99% crushed black is not a frame; it is the absence of one, and
 *     no gate in this repo could see it before this one.
 *   - `sceneMean` is the linear radiance the scene handed the post chain. A
 *     healthy shot in this project sits around 0.3-3. The whiteout of
 *     2026-08-31 read **1 185** on `lest_market_day`, because a Float16 vertex
 *     colour came back out of `geo.bin.gz` as an unnormalised `UNSIGNED_SHORT`
 *     and a whole city radiated four thousand times over. The display number
 *     says a frame is broken; this one says the scene is.
 *
 * `nan` subsumes `probes/nanscan.mts`: the same read, one extra counter.
 *
 * The readback is the cost — one 1600x900 RGBA read per shot per buffer — so it
 * is downsampled by `STRIDE` on the display side, where the statistic is a
 * fraction and a sixteenth of the pixels answers it to well under a percent.
 */
const g = window.GAME;
const r = g.renderer;
const p = g.post;
const rt = p.rtScene;
const gl = r.getContext();

const M = await import('/game/Shots.ts');
const names = Object.keys(M.SHOTS).filter((n) => n !== M.PROBE_SHOT && M.SHOTS[n]);

const h2f = (h) => {
  const s = (h & 0x8000) ? -1 : 1, e = (h & 0x7c00) >> 10, f = h & 0x03ff;
  if (e === 0) return s * 6.103515625e-5 * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * Math.pow(2, e - 15) * (1 + f / 1024);
};

const hdr = new Uint16Array(rt.width * rt.height * 4);
const dw = gl.drawingBufferWidth, dh = gl.drawingBufferHeight;
const ldr = new Uint8Array(dw * dh * 4);
/** Every fourth pixel on each axis: the statistic is a fraction, not a pixel. */
const STRIDE = 4;

const rows = [];
for (const name of names) {
  g.resetClock();
  g.applyShot(name);
  g.settle(40);
  g.applyShot(name);
  g.settle(8);

  r.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, hdr);
  let nan = 0, sum = 0, n = 0, max = 0;
  for (let i = 0; i < rt.width * rt.height; i++) {
    const a = h2f(hdr[i * 4]), b = h2f(hdr[i * 4 + 1]), c = h2f(hdr[i * 4 + 2]);
    if (Number.isNaN(a + b + c)) { nan++; continue; }
    const v = Math.max(a, b, c);
    if (v > max) max = v;
    sum += v; n++;
  }

  // The composited eight-bit frame, straight off the default framebuffer.
  // `readRenderTargetPixels(null, ...)` is not a thing; this is.
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.readPixels(0, 0, dw, dh, gl.RGBA, gl.UNSIGNED_BYTE, ldr);
  let white = 0, black = 0, seen = 0;
  for (let y = 0; y < dh; y += STRIDE) {
    for (let x = 0; x < dw; x += STRIDE) {
      const i = (y * dw + x) * 4;
      const mx = Math.max(ldr[i], ldr[i + 1], ldr[i + 2]);
      if (mx >= 250) white++; else if (mx <= 3) black++;
      seen++;
    }
  }
  rows.push({
    name, nan,
    sceneMean: n ? sum / n : 0, sceneMax: max,
    white: white / seen * 100, black: black / seen * 100,
  });
}
return { shots: names.length, rows, w: dw, h: dh };
