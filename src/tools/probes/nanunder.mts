/*
 * Is the water surface, seen from UNDERNEATH, free of NaN?
 *
 *   node src/tools/probe.mts src/tools/probes/nanunder.mts --dirty
 *
 * The instrument for lane 23's task 73, and it exists because `nanscan.mts`
 * cannot answer the question: it walks the shot corpus, and no shot in the
 * corpus has ever put the camera under a water surface. Every framing the
 * water shader has ever been judged on was taken from above.
 *
 * That matters more here than anywhere else in the renderer, because the lake
 * fragment has three separate ways to produce a NaN that only a from-below
 * view can reach:
 *
 *  - `V` flips sign, so `dot(N, V)` goes negative and every `normalize()` of a
 *    term derived from it can be handed a zero vector;
 *  - `refract(-V, N, 0.7502)` total-internally-reflects from the dense side and
 *    returns exactly `vec3(0)`, and `R.xz / max(-R.y, 0.10)` then marches a
 *    ray that does not exist;
 *  - `sampleNormal` normalizes `tex*2-1`, which is the zero vector on a
 *    (0.5,0.5,0.5) texel.
 *
 * A NaN from any of those survives the whole composer as pure 0,0,0 and lands
 * on the canvas as a black hole that no gate in the suite can see: it is not a
 * page error, it moves no draw count, and against a baseline with the same
 * hole in it, it is not even a pixel diff. So this reads the half-float scene
 * target directly, exactly as nanscan does, on framings derived live from
 * `Water.bodies` rather than written down.
 *
 * The framings are derived and not authored on purpose. `--build <sha>` is not
 * a bisect on this trunk -- `src/public/baked/` is one shared directory
 * symlinked into every materialised tree, so it pins the code and not the
 * content -- which means a world coordinate written into a probe is a claim
 * about a bake that may already have moved under it.
 */
const g = window.GAME;
const r = g.renderer;
const rt = g.post.rtScene;
const water = g.get('Water');
const terr = g.get('Terrain');

const M = await import('/game/Shots.ts');

const h2f = (h) => {
  const s = (h & 0x8000) ? -1 : 1, e = (h & 0x7c00) >> 10, f = h & 0x03ff;
  if (e === 0) return s * 6.103515625e-5 * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * Math.pow(2, e - 15) * (1 + f / 1024);
};

const buf = new Uint16Array(rt.width * rt.height * 4);
/** NaN pixel count and their bounding box in canvas space, plus the black area. */
const scan = () => {
  r.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, buf);
  let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, black = 0;
  const px = rt.width * rt.height;
  for (let i = 0; i < px; i++) {
    const a = h2f(buf[i * 4]), b = h2f(buf[i * 4 + 1]), c = h2f(buf[i * 4 + 2]);
    const v = a + b + c;
    if (Number.isNaN(v)) {
      n++;
      const x = i % rt.width, y = rt.height - 1 - ((i / rt.width) | 0);
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      continue;
    }
    // A pure-black pixel is the *symptom* a NaN produces after the composer,
    // and it is also what a surface that has gone fully opaque and unlit looks
    // like from below. Counted separately so the two can be told apart.
    if (v <= 1e-6) black++;
  }
  return { n, box: n ? [x0, y0, x1, y1] : null, blackPct: +(100 * black / px).toFixed(2) };
};

/** The body whose bbox contains this point, or null. */
const bodyAt = (x, z) => water.bodies.find(
  (b) => Math.abs(x - b.cx) < b.w * 0.5 && Math.abs(z - b.cz) < b.d * 0.5) || null;

/**
 * A framing under a named body: sink the lens to the middle of the water
 * column and look up at a grazing angle, which is where the Snell window and
 * the underside of the surface both live.
 *
 * The depth is found by walking outward from the seed until the bed is at
 * least `wantDeep` under the level, so the camera can never be authored into
 * the mud by a bake that moved.
 */
function underShot(name, seedX, seedZ, wantDeep, aimUp) {
  const b = bodyAt(seedX, seedZ);
  if (!b) return { name, error: `no water body at ${seedX},${seedZ}` };
  let bx = seedX, bz = seedZ, bd = b.level - terr.heightAt(seedX, seedZ);
  for (let ring = 1; ring <= 6 && bd < wantDeep; ring++) {
    for (let a = 0; a < 12; a++) {
      const th = a * Math.PI / 6, rr = ring * 18;
      const x = seedX + Math.cos(th) * rr, z = seedZ + Math.sin(th) * rr;
      if (Math.abs(x - b.cx) > b.w * 0.5 || Math.abs(z - b.cz) > b.d * 0.5) continue;
      const d = b.level - terr.heightAt(x, z);
      if (d > bd) { bd = d; bx = x; bz = z; }
    }
  }
  const bed = b.level - bd;
  // Halfway down the column, but never within 1.5 m of either boundary: at the
  // surface the shot would be an above-water frame, on the bed it would be a
  // picture of silt.
  const eye = Math.min(b.level - 1.5, Math.max(bed + 1.5, b.level - bd * 0.45));
  return {
    spec: {
      name, doc: `under ${b.name}: eye ${(b.level - eye).toFixed(1)} m down, bed ${bd.toFixed(1)} m`,
      time: 11.5, weather: 'clear', fov: 58,
      pos: [+bx.toFixed(1), +eye.toFixed(2), +bz.toFixed(1)],
      target: [+(bx + 46).toFixed(1), +(eye + aimUp).toFixed(2), +(bz + 30).toFixed(1)],
    },
    body: b.name, level: +b.level.toFixed(2), bed: +bed.toFixed(2), depth: +bd.toFixed(2),
  };
}

// The two the plan names. Seeds only -- the deep point is found from the bake.
const framings = [
  underShot('under_alstor', -1355, 745, 12, 5.5),
  underShot('under_vesper', -2940, -2280, 14, 9.0),
];

/*
 * `specs` is what makes this file work under BOTH runners in one boot:
 * `probe.mts` prints the NaN report and stops, while `framecam.mts --probe`
 * prints the same report and then shoots every spec, because it pushes
 * `value.specs` into its own capture list. One derivation, one boot, a number
 * and a picture -- which matters because these two framings are the only way
 * anyone has ever seen this shader from underneath.
 */
const out = { framings: [], hits: [], surface: null, specs: [] };
for (const f of framings) {
  if (f.error) { out.framings.push(f); continue; }
  M.SHOTS[M.PROBE_SHOT] = f.spec;
  g.resetClock();
  g.applyShot(M.PROBE_SHOT);
  g.settle(40);
  g.applyShot(M.PROBE_SHOT);
  g.settle(8);
  const s = scan();
  const cam = g.camera.position;
  out.framings.push({
    name: f.spec.name, doc: f.spec.doc, body: f.body, level: f.level,
    bed: f.bed, depth: f.depth, pos: f.spec.pos, target: f.spec.target,
    // Where the lens ACTUALLY ended up: CameraRig clamps a framed shot to
    // heightAt + 1.35, and a shot that was silently lifted out of the water is
    // not a from-below test at all.
    camY: +cam.y.toFixed(2), underBy: +(f.level - cam.y).toFixed(2),
    nan: s.n, box: s.box, blackPct: s.blackPct,
  });
  if (s.n) out.hits.push(f.spec.name);
  out.specs.push(f.spec);
  console.log(`[nanunder] ${f.spec.name} under ${(f.level - cam.y).toFixed(2)} m `
    + `nan=${s.n} black=${s.blackPct}%`);
}

/** Is the surface mesh even drawn from down there? Water._visible tests a slab. */
const surf = [];
for (const b of water.bodies) surf.push({ name: b.name, visible: b.mesh.visible });
out.surface = surf.filter((s) => s.visible).length + '/' + surf.length + ' body meshes visible';
console.log(`[nanunder] ${out.hits.length} of ${framings.length} underwater framings carry NaN`);
return out;
