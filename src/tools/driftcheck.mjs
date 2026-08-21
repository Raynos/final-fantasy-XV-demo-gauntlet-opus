#!/usr/bin/env node
/**
 * Does the *rendered* terrain surface stay put while the camera travels?
 *
 * `src/tools/heightcheck.mjs` answers a narrower question: it evaluates the shared
 * `tf_height()` field in a fragment shader and compares it to
 * `Terrain.heightAt()`. That is a pure function of world position, so it is
 * blind to everything the clipmap does on top of it — the LOD morph band, the
 * ring re-centring, the per-level cell size. This tool probes the actual
 * geometry instead: the real clipmap meshes are re-rendered through the real
 * vertex chunks (`TERRAIN_VERT_PARS` / `TERRAIN_VERT_BEGIN`) into a float
 * target from a top-down orthographic camera, so each texel reads back the
 * world-space Y of the triangle the renderer would have drawn at that world
 * X/Z, morph and all.
 *
 * It then does it twice: once at a fresh boot, and again after driving the
 * camera thousands of metres around the world and coming back. A shipped bug
 * had the ground under the party climbing ~1.5 m over a long capture run while
 * `heightAt()` never moved, which buried the whole cast; a boot-time probe
 * could not see it. This is the regression test for that class of bug.
 *
 *   node src/tools/driftcheck.mjs                 # default home shot + full tour
 *   node src/tools/driftcheck.mjs --home hero_full
 *   node src/tools/driftcheck.mjs --span 320 --res 192
 *   node src/tools/driftcheck.mjs --tol 0.05      # fail above this drift, metres
 *
 * Exits non-zero if the surface moved by more than `--tol` metres between the
 * two probes, or if it disagrees with `Terrain.heightAt()` by more than
 * `--tol-cpu`.
 */
import { chromium } from 'playwright';
import { CHROMIUM_ARGS } from './chromium.mjs';

const PORT = Number(process.env.PORT || 5173);

function parseArgs(argv) {
  const o = {
    // `tol` is the real gate and it is strict: the rendered ground must not
    // move at all. `tolCpu` cannot be: the finest clipmap cell is 1.5 m, so the
    // drawn surface is a 1.5 m triangle mesh through a continuous field, and in
    // the roughest ground inside 100 m that chord sags a measured ~0.37 m below
    // `heightAt()`. 0.45 leaves headroom over the tessellation floor without
    // admitting a real offset.
    home: 'hero_full', span: 200, res: 160, tol: 0.05, tolCpu: 0.45,
    settle: 60, tourSettle: 40, tour: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--home') o.home = argv[++i];
    else if (a === '--span') o.span = Number(argv[++i]);
    else if (a === '--res') o.res = Number(argv[++i]);
    else if (a === '--tol') o.tol = Number(argv[++i]);
    else if (a === '--tol-cpu') o.tolCpu = Number(argv[++i]);
    else if (a === '--settle') o.settle = Number(argv[++i]);
    else if (a === '--tour') o.tour = argv[++i].split(',');
    else throw new Error(`unknown flag ${a}`);
  }
  return o;
}

/**
 * The tour: a few thousand metres of travel in the order a capture run makes
 * it, with stops long enough for every LOD ring to re-centre and settle.
 */
const DEFAULT_TOUR = [
  'vista_dawn', 'zone_longwythe', 'zone_three_valleys', 'zone_ostium_gorge',
  'zone_vannath', 'zone_galdin', 'zone_keycatrich', 'zone_callaegh',
  'zone_alstor', 'zone_malacchi', 'zone_nebulawood', 'zone_mencemoor',
  'zone_taelpar', 'zone_fallgrove', 'zone_lestallum', 'zone_pallareth',
  'zone_vesperpool', 'zone_ravatogh', 'zone_malmalam', 'zone_cape_caem',
  'landmark_insomnia', 'mesa_landmark', 'road_viaduct', 'solheim_ruins',
  'vista_noon', 'vista_dusk', 'windpump_flats', 'watertower_bench',
];

const opts = parseArgs(process.argv.slice(2));
const tour = opts.tour || DEFAULT_TOUR;

const browser = await chromium.launch({ args: CHROMIUM_ARGS });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => { errors.push(String(e).split('\n')[0]); });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().split('\n')[0]); });
await page.goto(`http://127.0.0.1:${PORT}/?q=ultra&shoot=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 180000 });
await page.evaluate(() => { window.GAME.stop(); document.getElementById('boot')?.remove(); });

const out = await page.evaluate(async (cfg) => {
  const g = window.GAME;
  const t = g.get('Terrain');
  const tm = await import('/world/terrain/TerrainMaterial.ts');

  // Constructors are harvested from live objects rather than imported: a bare
  // `three` specifier does not resolve inside `page.evaluate`, because the
  // browser is doing the import, not vite. Same trick as src/tools/heightcheck.mjs.
  const surf0 = t.clipmap.rings[0].meshes[0].material;
  const Scene = g.scene.constructor;
  const ShaderMaterial = g.post.taa.material.constructor;
  const RenderTarget = g.post.rtScene.constructor;
  const Color = surf0.color.constructor;
  let OrthographicCamera = null;
  g.scene.traverse((o) => {
    if (!OrthographicCamera && o.isLight && o.shadow && o.shadow.camera
        && o.shadow.camera.isOrthographicCamera) OrthographicCamera = o.shadow.camera.constructor;
  });
  if (!OrthographicCamera) throw new Error('no orthographic camera to clone a constructor from');
  const FloatType = 1015, RGBAFormat = 1023, NearestFilter = 1003, DoubleSide = 2;

  // ---- probe rig ---------------------------------------------------------
  // One material per LOD level: the morph band in VERT_BEGIN is a function of
  // uCell, so a single material would mis-morph six of the seven rings.
  const probeMats = t.clipmap.rings.map((ring) => {
    const m = new ShaderMaterial({
      uniforms: Object.assign({}, t.res.uniforms, { uCell: { value: ring.cell } }),
      vertexShader: `
        ${tm.TERRAIN_VERT_PARS}
        void main() {
          ${tm.TERRAIN_VERT_BEGIN}
          gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
        }`,
      fragmentShader: `
        precision highp float;
        varying vec3 vTW;
        varying float vTDist;
        void main() { gl_FragColor = vec4(vTW.y, vTW.x, vTW.z, 1.0); }`,
      side: DoubleSide,
    });
    m.customProgramCacheKey = () => `terrain-drift-probe-${ring.level}`;
    return m;
  });
  const probeScene = new Scene();
  const R = cfg.res;
  const rt = new RenderTarget(R, R, {
    type: FloatType, format: RGBAFormat,
    minFilter: NearestFilter, magFilter: NearestFilter,
    depthBuffer: true, stencilBuffer: false,
  });

  /**
   * Read back the world-space Y of the rendered terrain over a fixed world
   * rect, straight down. Returns Float32 grids of y / x / z.
   */
  const probe = (cx, cz, span) => {
    const cam = new OrthographicCamera(-span / 2, span / 2, span / 2, -span / 2, 1, 4000);
    cam.up.set(0, 0, -1);
    cam.position.set(cx, 2000, cz);
    cam.lookAt(cx, 0, cz);
    cam.updateMatrixWorld(true);

    const parent = t.clipmap.group.parent;
    probeScene.add(t.clipmap.group);
    const saved = [];
    t.clipmap.rings.forEach((ring, L) => {
      for (const m of ring.meshes) { saved.push([m, m.material]); m.material = probeMats[L]; }
    });

    const prevRT = g.renderer.getRenderTarget();
    const prevClear = g.renderer.getClearColor(new Color());
    const prevAlpha = g.renderer.getClearAlpha();
    g.renderer.setRenderTarget(rt);
    g.renderer.setClearColor(0x000000, 0);
    g.renderer.clear(true, true, false);
    g.renderer.render(probeScene, cam);
    g.renderer.setRenderTarget(prevRT);
    g.renderer.setClearColor(prevClear, prevAlpha);

    for (const [m, mat] of saved) m.material = mat;
    if (parent) parent.add(t.clipmap.group);

    const buf = new Float32Array(R * R * 4);
    g.renderer.readRenderTargetPixels(rt, 0, 0, R, R, buf);
    const y = new Float32Array(R * R), wx = new Float32Array(R * R), wz = new Float32Array(R * R);
    let covered = 0;
    for (let i = 0; i < R * R; i++) {
      const a = buf[i * 4 + 3];
      if (a < 0.5) { y[i] = NaN; continue; }
      covered++;
      y[i] = buf[i * 4]; wx[i] = buf[i * 4 + 1]; wz[i] = buf[i * 4 + 2];
    }
    return { y, wx, wz, covered };
  };

  const goHome = () => {
    g.applyShot(cfg.home); g.settle(cfg.settle);
    g.applyShot(cfg.home); g.settle(8);
  };

  // ---- baseline, at a fresh boot -----------------------------------------
  goHome();
  const player = g.get('Player');
  const p0 = (player ? player.position : g.camera.position).clone();
  const rect = { cx: p0.x, cz: p0.z, span: cfg.span };
  const before = probe(rect.cx, rect.cz, rect.span);
  const camBefore = g.camera.position.clone();

  // ---- travel -------------------------------------------------------------
  // Somewhere along the way, with the camera kilometres from home, probe the
  // *same* rect again. That reads the ground under the party while it is being
  // drawn by the coarsest rings that still cover it, which is the strongest
  // form of the question "does where the ground is depend on where I am
  // standing?". Reported, not gated: at that range the party is not on screen
  // and a coarse ring is allowed to be coarse.
  let travelled = 0;
  let prev = g.camera.position.clone();
  const visited = [];
  let far = null, farAt = null, farDist = 0;
  for (const s of cfg.tour) {
    try { g.applyShot(s); } catch (e) { continue; }
    g.settle(cfg.tourSettle);
    travelled += g.camera.position.distanceTo(prev);
    prev = g.camera.position.clone();
    visited.push(s);
    const d = Math.hypot(g.camera.position.x - rect.cx, g.camera.position.z - rect.cz);
    if (d > farDist) { farDist = d; far = probe(rect.cx, rect.cz, rect.span); farAt = s; }
  }

  // ---- back home, same rect ----------------------------------------------
  goHome();
  const after = probe(rect.cx, rect.cz, rect.span);
  const camAfter = g.camera.position.clone();
  const p1 = (player ? player.position : g.camera.position).clone();

  // ---- compare ------------------------------------------------------------
  let n = 0, sum = 0, worst = 0, worstAt = null;
  let cpuSum = 0, cpuWorst = 0, cpuWorstAt = null, cpuN = 0;
  const cpuAbs = [];
  const hist = {};
  for (let i = 0; i < R * R; i++) {
    if (Number.isNaN(before.y[i]) || Number.isNaN(after.y[i])) continue;
    const d = after.y[i] - before.y[i];
    n++; sum += d;
    if (Math.abs(d) > Math.abs(worst)) { worst = d; worstAt = [after.wx[i], after.wz[i]]; }
    const b = Math.round(d * 10) / 10;
    hist[b] = (hist[b] || 0) + 1;
    const cpu = t.heightAt(after.wx[i], after.wz[i]);
    const dc = after.y[i] - cpu;
    cpuN++; cpuSum += dc; cpuAbs.push(Math.abs(dc));
    if (Math.abs(dc) > Math.abs(cpuWorst)) { cpuWorst = dc; cpuWorstAt = [after.wx[i], after.wz[i]]; }
  }
  cpuAbs.sort((a, b) => a - b);
  const cpuP99 = cpuAbs.length ? cpuAbs[Math.floor(cpuAbs.length * 0.99)] : 0;
  const cpuOver = cpuAbs.filter((v) => v > 0.1).length;
  // and the boot-time GPU-vs-CPU agreement, for reference
  let cpu0Sum = 0, cpu0Worst = 0, cpu0N = 0;
  for (let i = 0; i < R * R; i++) {
    if (Number.isNaN(before.y[i])) continue;
    const dc = before.y[i] - t.heightAt(before.wx[i], before.wz[i]);
    cpu0N++; cpu0Sum += dc;
    if (Math.abs(dc) > Math.abs(cpu0Worst)) cpu0Worst = dc;
  }
  // the coarse-LOD spread, from the mid-tour probe
  let lodWorst = 0, lodSum = 0, lodN = 0;
  if (far) {
    for (let i = 0; i < R * R; i++) {
      if (Number.isNaN(before.y[i]) || Number.isNaN(far.y[i])) continue;
      const d = far.y[i] - before.y[i];
      lodN++; lodSum += d;
      if (Math.abs(d) > Math.abs(lodWorst)) lodWorst = d;
    }
  }

  return {
    home: cfg.home, rect, visited: visited.length, travelled,
    coverage: [before.covered / (R * R), after.covered / (R * R)],
    compared: n,
    driftMean: n ? sum / n : 0, driftWorst: worst, driftWorstAt: worstAt,
    cpuMeanAfter: cpuN ? cpuSum / cpuN : 0, cpuWorstAfter: cpuWorst, cpuWorstAtAfter: cpuWorstAt,
    cpuP99, cpuOver, cpuN,
    cpuMeanBefore: cpu0N ? cpu0Sum / cpu0N : 0, cpuWorstBefore: cpu0Worst,
    lodWorst, lodMean: lodN ? lodSum / lodN : 0, farAt, farDist,
    hist,
    player: [[p0.x, p0.y, p0.z], [p1.x, p1.y, p1.z]],
    cam: [[camBefore.x, camBefore.y, camBefore.z], [camAfter.x, camAfter.y, camAfter.z]],
    heightAtPlayer: [t.heightAt(p0.x, p0.z), t.heightAt(p1.x, p1.z)],
  };
}, { ...opts, tour });

await browser.close();

const f = (v, d = 3) => (v == null ? 'n/a' : Number(v).toFixed(d));
console.log(`home shot        ${out.home}`);
console.log(`probe rect       ${f(out.rect.span, 0)} m square at (${f(out.rect.cx, 1)}, ${f(out.rect.cz, 1)}), coverage ${f(out.coverage[0] * 100, 1)}% / ${f(out.coverage[1] * 100, 1)}%`);
console.log(`travelled        ${f(out.travelled, 0)} m over ${out.visited} stops`);
console.log(`camera           before (${out.cam[0].map((v) => f(v, 1)).join(', ')})  after (${out.cam[1].map((v) => f(v, 1)).join(', ')})`);
console.log(`player           before (${out.player[0].map((v) => f(v, 2)).join(', ')})  after (${out.player[1].map((v) => f(v, 2)).join(', ')})`);
console.log('');
console.log(`SURFACE DRIFT    mean ${f(out.driftMean)} m   worst ${f(out.driftWorst)} m at (${out.driftWorstAt ? out.driftWorstAt.map((v) => f(v, 1)).join(', ') : '-'})   over ${out.compared} texels`);
console.log(`gpu vs heightAt  boot: mean ${f(out.cpuMeanBefore)} worst ${f(out.cpuWorstBefore)}   after travel: mean ${f(out.cpuMeanAfter)} worst ${f(out.cpuWorstAfter)} at (${out.cpuWorstAtAfter ? out.cpuWorstAtAfter.map((v) => f(v, 1)).join(', ') : '-'})`);
console.log(`                 p99 |err| ${f(out.cpuP99)} m; ${out.cpuOver}/${out.cpuN} texels over 0.1 m (1.5 m tessellation floor)`);
console.log(`coarse-LOD spread  mean ${f(out.lodMean)} m  worst ${f(out.lodWorst)} m, with the camera ${f(out.farDist, 0)} m away at ${out.farAt} (reported, not gated)`);
const bins = Object.keys(out.hist).map(Number).sort((a, b) => a - b);
if (bins.length > 1) console.log(`drift histogram  ${bins.map((b) => `${b.toFixed(1)}:${out.hist[b]}`).join('  ')}`);
if (errors.length) console.log(`\npage errors:\n  ${errors.slice(0, 8).join('\n  ')}`);

const bad = Math.abs(out.driftWorst) > opts.tol || Math.abs(out.cpuWorstAfter) > opts.tolCpu;
console.log(`\n${bad ? 'FAIL' : 'PASS'}  (tolerance ${opts.tol} m drift, ${opts.tolCpu} m vs heightAt)`);
process.exit(bad || errors.length ? 1 : 0);
