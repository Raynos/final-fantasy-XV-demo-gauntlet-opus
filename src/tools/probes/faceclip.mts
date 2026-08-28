/**
 * Is the face clipped, and *what* clips it — read off the HDR buffer, not the JPEG.
 *
 *   node src/tools/probe.mts src/tools/probes/faceclip.mts
 *   node src/tools/probe.mts src/tools/probes/faceclip.mts --set __FC_SHOTS=hero_portrait,vista_dusk
 *
 * The round-14 head lane found that filling the face canvas with pure #00ff00
 * renders WHITE on the lit half and inferred a clip. This reads the actual
 * numbers instead: the scene-linear radiance at a face texel and at a ground
 * texel, the adapted exposure multiplier, the band the integrator may sit in,
 * and the scene exposure the Sky published. That says *which* of albedo,
 * lighting and exposure is responsible before anybody re-tints anything.
 *
 * The second half is the ablation that names the driver: re-meter the same
 * frame with the party hidden. `Exposure`'s metering is centre-weighted, and in
 * a portrait the centre of the frame is a black jacket.
 */
const g = window.GAME;
const shots = String(window.__FC_SHOTS || 'hero_portrait').split(',');
const r = g.renderer;
const fx = g.post;

/** half-float decode */
function h2f(h) {
  const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
  if (e === 0) return s * Math.pow(2, -14) * (m / 1024);
  if (e === 31) return m ? NaN : s * Infinity;
  return s * Math.pow(2, e - 15) * (1 + m / 1024);
}

function readAdapted() {
  const a = fx.exposure.adapt[fx.exposure.pingpong];
  const half = a.texture.type === 1016;
  const b = half ? new Uint16Array(4) : new Float32Array(4);
  r.readRenderTargetPixels(a, 0, 0, 1, 1, b);
  return half ? h2f(b[0]) : b[0];
}

function readBox(x0, y0, w, h) {
  const rt = fx.rtScene;
  const H = rt.height;
  const type = rt.texture.type;
  const n = w * h * 4;
  const buf = type === 1016 ? new Uint16Array(n) : new Float32Array(n);
  r.readRenderTargetPixels(rt, x0, H - y0 - h, w, h, buf);
  const cv = (v) => (type === 1016 ? h2f(v) : v);
  const mean = [0, 0, 0];
  let max = 0;
  for (let i = 0; i < n; i += 4) {
    mean[0] += cv(buf[i]); mean[1] += cv(buf[i + 1]); mean[2] += cv(buf[i + 2]);
    max = Math.max(max, cv(buf[i]));
  }
  const cnt = n / 4;
  return { mean: mean.map((v) => v / cnt), max };
}

const BOXES = {
  hero_portrait: { face: [760, 470, 60, 40], ground: [1100, 620, 120, 80] },
  hero_profile: { face: [820, 300, 60, 60], ground: [1150, 600, 120, 80] },
  hero_full: { face: [780, 220, 30, 30], ground: [1200, 700, 120, 80] },
};

const lines = [];
for (const shot of shots) {
  g.applyShot(shot);
  g.settle(30);
  g.frame(1 / 60);
  const ex = fx.exposure;
  const E = readAdapted();
  const rt = fx.rtScene;
  const sx = rt.width / 1600, sy = rt.height / 900;
  const bx = BOXES[shot] || BOXES.hero_portrait;
  const sc = (b) => [Math.round(b[0] * sx), Math.round(b[1] * sy),
    Math.max(1, Math.round(b[2] * sx)), Math.max(1, Math.round(b[3] * sy))];
  const face = readBox(...sc(bx.face));
  const grd = readBox(...sc(bx.ground));

  // ablation: same pose, party hidden, re-meter from scratch
  const hidden = [];
  g.scene.traverse((o) => {
    if (o.visible && o.userData && o.userData.isCharacter) { o.visible = false; hidden.push(o); }
  });
  if (!hidden.length) {
    for (const key of ['Player', 'Party']) {
      const sys = g.get(key);
      const root = sys && (sys.root || sys.group);
      if (root && root.visible) { root.visible = false; hidden.push(root); }
      if (sys && sys.members) for (const m of sys.members) {
        const rr = m && (m.root || m.group);
        if (rr && rr.visible) { rr.visible = false; hidden.push(rr); }
      }
    }
  }
  fx.exposure.reset();
  g.frame(1 / 60);
  for (let i = 0; i < 20; i++) g.frame(1 / 60);
  const Enp = readAdapted();
  for (const o of hidden) o.visible = true;
  fx.exposure.reset();
  g.frame(1 / 60);

  lines.push(`--- ${shot}`);
  lines.push(`  exposure adapted=${E.toFixed(4)}  base=${ex.base.toFixed(4)}  adapted/base=${(E / ex.base).toFixed(3)}`
    + `  band=[${ex.bounds.map((v) => v.toFixed(3)).join(', ')}]  key=${ex.key.toFixed(4)}`);
  lines.push(`  party HIDDEN -> adapted=${Enp.toFixed(4)}  (${hidden.length} roots)   delta = ${((Enp / E - 1) * 100).toFixed(1)}%`);
  lines.push(`  face  HDR ${face.mean.map((v) => v.toFixed(3)).join(' ')}  maxR ${face.max.toFixed(2)}   x E -> `
    + `${face.mean.map((v) => (v * E).toFixed(3)).join(' ')}`);
  lines.push(`  grnd  HDR ${grd.mean.map((v) => v.toFixed(3)).join(' ')}                x E -> `
    + `${grd.mean.map((v) => (v * E).toFixed(3)).join(' ')}`);
  lines.push(`  face/ground radiance ratio R = ${(face.mean[0] / grd.mean[0]).toFixed(2)}`);
}

return lines.join('\n');
