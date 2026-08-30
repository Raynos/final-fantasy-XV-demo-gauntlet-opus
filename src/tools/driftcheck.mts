#!/usr/bin/env node
/**
 * Does the *rendered* terrain surface stay put while the camera travels?
 *
 * `src/tools/heightcheck.mts` answers a narrower question: it evaluates the shared
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
 *   node src/tools/driftcheck.mts                 # default home shot + full tour
 *   node src/tools/driftcheck.mts --home hero_full
 *   node src/tools/driftcheck.mts --span 320 --res 192
 *   node src/tools/driftcheck.mts --tol 0.05      # fail above this drift, metres
 *
 * Exits non-zero if the surface moved by more than `--tol` metres between the
 * two probes, or if it disagrees with `Terrain.heightAt()` by more than
 * `--tol-cpu`.
 */
import type * as THREE from 'three';
import { harnessArgs, announceBuild, lease, pageOpts, isHarnessFlag } from './harness.mts';



function parseArgs(argv: string[]) {
  const o = {
    // `tol` is the real gate and it is strict: the rendered ground must not
    // move at all. `tolCpu` cannot be: the finest clipmap cell is 1.5 m, so the
    // drawn surface is a 1.5 m triangle mesh through a continuous field, and in
    // the roughest ground inside 100 m that chord sags a measured ~0.37 m below
    // `heightAt()`. 0.45 leaves headroom over the tessellation floor without
    // admitting a real offset.
    /**
     * **The probe rect has to CROSS a ring boundary, or the morph band is not
     * in it and this tool is not testing what its header says it tests.**
     *
     * `Clipmap` is built `levels: 7, n: 48, cell0: 1.5`, and a level reaches
     * `2n` cells from the centre — so level 0 extends +/-144 m and its morph
     * band is the outer few cells of that. The old default of 200 m is
     * +/-100 m: entirely inside level 0, where `aClip.x` is 0 for every vertex,
     * so `TERRAIN_VERT_BEGIN`'s whole morph branch was dead code under the
     * probe.
     *
     * That was measured, not reasoned: injecting `tfH += aClip.x * 5.0` into
     * the real vertex chunk — a FIVE METRE error in the morph band — moved not
     * one number this tool prints. The control arm, an unconditional
     * `tfH += 3.0`, moved `gpu vs heightAt` to `mean 3.000 worst 3.369` and
     * failed, so the instrument and the live build were both fine. The probe
     * simply never sampled a morphing vertex.
     *
     * 340 m clears +/-144 m with 26 m of margin on each side, which is more
     * than one level-0 morph band. `res` rises with it to keep the texel
     * roughly at the finest cell: 340/192 = 1.77 m against a 1.5 m cell.
     */
    home: 'hero_full', span: 340, res: 192, tol: 0.05, tolCpu: 0.45,
    settle: 60, tourSettle: 40, tour: null as string[] | null,
    /**
     * The chord-sag allowance, as a multiple of the field's OWN local curvature.
     *
     * See `SAG` below. `0` disables the allowance entirely, which turns
     * `--tol-cpu` back into the flat constant it used to be.
     */
    sagK: 3.0,
    /**
     * GLSL appended to the probe's vertex shader, after `TERRAIN_VERT_BEGIN`.
     *
     * **This is the falsification arm, and it is a first-class flag because a
     * gate nobody has watched fail is a gate nobody has tested.** The tool's own
     * header records the control that proved the probe rect was wrong -- an
     * unconditional `tfH += 3.0` -- and that control had to be applied by hand
     * editing a shared engine file, which is not something a lane can do on this
     * trunk. Now it is one flag:
     *
     *   node src/tools/driftcheck.mts --inject 'tfH += 3.0;'
     *
     * `transformed` and `vTW` are re-derived from `tfH` after the injection, so
     * an injection that only moves `tfH` moves the read-back surface.
     */
    inject: '',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--home') o.home = argv[++i];
    else if (a === '--span') o.span = Number(argv[++i]);
    else if (a === '--res') o.res = Number(argv[++i]);
    else if (a === '--tol') o.tol = Number(argv[++i]);
    else if (a === '--tol-cpu') o.tolCpu = Number(argv[++i]);
    else if (a === '--settle') o.settle = Number(argv[++i]);
    else if (a === '--tour-settle') o.tourSettle = Number(argv[++i]);
    else if (a === '--tour') o.tour = argv[++i].split(',');
    else if (a === '--inject') o.inject = argv[++i];
    else if (a === '--sag-k') o.sagK = Number(argv[++i]);
    // `--build`, `--dirty`, `--q`, `--w`/`--h` belong to `harnessArgs`, which
    // parses the same argv a few lines below. Without this the tool could not
    // be pointed at the working tree at all -- `--dirty` threw -- so every
    // experiment on its own constants had to go through a commit first.
    else if (isHarnessFlag(a)) { if (isHarnessFlag(a) === 'value') i++; }
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

const ha = harnessArgs(process.argv.slice(2), { q: 'ultra', w: 1280, h: 720 });
announceBuild(ha);
const leased = await lease(pageOpts(ha));
const page = leased.page;
const errors: string[] = [];
page.on('pageerror', (e) => { errors.push(String(e).split('\n')[0]); });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().split('\n')[0]); });

const out = await page.evaluate(async (cfg) => {
  const g = window.GAME;
  const t = g.get('Terrain')!;
  const tm = await import('/world/terrain/TerrainMaterial.ts');

  /**
   * The class a live object came from, as a constructor.
   *
   * Constructors are harvested from live objects rather than imported: a bare
   * `three` specifier does not resolve inside `page.evaluate`, because the
   * browser is doing the import, not vite -- and the probe rig must use the
   * *page's* three, not a second copy. `Object.constructor` is typed
   * `Function`, which has no construct signature; this is the one place that
   * says otherwise, and the type argument keeps it checked: hand it the wrong
   * instance and every `new` below stops compiling.
   */
  const classOf = <T extends object>(o: T) => o.constructor as new (...args: readonly unknown[]) => T;
  /** A scene node as the sun search reads it. */
  interface SceneNode {
    /** Every `Object3D` has one. Present so this is not an all-optional
     *  "weak type", which `Scene.traverse`'s callback could not be given. */
    type: string;
    isLight?: boolean;
    color?: THREE.Color;
    shadow?: { camera?: { isOrthographicCamera?: boolean } & THREE.OrthographicCamera };
  }

  /** One mesh of a clipmap ring, with the material the probe swaps out. */
  interface ClipmapMesh { material: unknown }

  /** One LOD ring of the terrain clipmap. */
  interface ClipmapRing { cell: number; level: number; meshes: ClipmapMesh[] }

  type OrthoCtor = new (l: number, r: number, t: number, b: number, n: number, f: number)
    => THREE.OrthographicCamera;

  const Scene = classOf(g.scene);
  const ShaderMaterial = classOf(g.post.taa.material);
  const RenderTarget = classOf(g.post.rtScene);
  // The sun's shadow camera is the only orthographic camera in the scene, and
  // its `color` is the only `THREE.Color` reachable without guessing: the
  // terrain material is a `ShaderMaterial` and has no `color` at all, which is
  // what `surf0.color.constructor` had been reaching for.
  let orthoCtor: OrthoCtor | null = null;
  let colorCtor: (new () => THREE.Color) | null = null;
  g.scene.traverse((obj) => {
    const o: SceneNode = obj;
    if (!orthoCtor && o.isLight && o.shadow && o.shadow.camera
        && o.shadow.camera.isOrthographicCamera) orthoCtor = classOf(o.shadow.camera);
    if (!colorCtor && o.color) colorCtor = classOf(o.color);
  });
  if (!orthoCtor) throw new Error('no orthographic camera to clone a constructor from');
  if (!colorCtor) throw new Error('no light to lift a Color constructor from');
  // `const` so the narrowing above survives into the render closures below.
  const OrthographicCamera: OrthoCtor = orthoCtor;
  const Color: new () => THREE.Color = colorCtor;
  const FloatType = 1015, RGBAFormat = 1023, NearestFilter = 1003, DoubleSide = 2;

  // ---- probe rig ---------------------------------------------------------
  // One material per LOD level: the morph band in VERT_BEGIN is a function of
  // uCell, so a single material would mis-morph six of the seven rings.
  const probeMats = t.clipmap.rings.map((ring: ClipmapRing) => {
    const m = new ShaderMaterial({
      uniforms: Object.assign({}, t.res.uniforms, { uCell: { value: ring.cell } }),
      vertexShader: `
        ${tm.TERRAIN_VERT_PARS}
        void main() {
          ${tm.TERRAIN_VERT_BEGIN}
          ${cfg.inject ? `${cfg.inject}
          // Re-derive what VERT_BEGIN derives from tfH, so an injection that
          // moves tfH moves the surface that is read back. ONLY under an
          // injection: with none, the probe has to compile the shipped chunk
          // unaltered, or the control arm and the measurement arm are not
          // running the same program and neither one means anything.
          transformed.y = tfH; vTW.y = tfH;` : ''}
          gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
        }`,
      fragmentShader: `
        precision highp float;
        varying vec3 vTW;
        varying float vTDist;
        void main() { gl_FragColor = vec4(vTW.y, vTW.x, vTW.z, 1.0); }`,
      side: DoubleSide,
    });
    // The injection is part of the program, so it has to be part of the key --
    // otherwise three serves the un-injected program back from its cache and the
    // falsification arm silently measures the control it was supposed to break.
    m.customProgramCacheKey = () => `terrain-drift-probe-${ring.level}-${cfg.inject}`;
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
  const probe = (cx: number, cz: number, span: number) => {
    const cam = new OrthographicCamera!(-span / 2, span / 2, span / 2, -span / 2, 1, 4000);
    cam.up.set(0, 0, -1);
    cam.position.set(cx, 2000, cz);
    cam.lookAt(cx, 0, cz);
    cam.updateMatrixWorld(true);

    const parent = t.clipmap.group.parent;
    probeScene.add(t.clipmap.group);
    const saved: Array<[ClipmapMesh, unknown]> = [];
    t.clipmap.rings.forEach((ring: ClipmapRing, L: number) => {
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
  const player = g.get('Player')!;
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
  /**
   * **The two arms have different scopes, because they measure different things.**
   *
   * SURFACE DRIFT is boot-versus-after-travel at the same world texel. It is
   * cell-independent — whatever the tessellation does, it must do the same
   * thing both times — so it runs over the WHOLE rect, morph band included.
   * That is the regression this tool exists for and it is now actually covered.
   *
   * `gpu vs heightAt` compares a triangle mesh to a continuous field, so its
   * floor is the chord sag, and chord sag scales with the square of the cell.
   * Inside the level-0 ring the cell is 1.5 m and the sag is a measured
   * ~0.37 m, which is what `tolCpu` 0.45 was fitted to. In the morph band the
   * surface is blending toward the 3 m lattice and the sag is roughly four
   * times that: widening the rect to cross the boundary took the worst from
   * 0.369 m to 0.956 m on a CLEAN tree.
   *
   * Raising `tolCpu` to swallow that would weaken the check everywhere to
   * accommodate a place where it does not apply. So this arm keeps the radius
   * its tolerance was measured at, and the drift arm gets the full rect.
   */
  const CPU_RADIUS = 100;
  const cpuAbs = [];
  const hist: Record<string, number> = {};
  const cpuHist: Record<string, number> = {};

  /**
   * **The chord-sag floor, measured per texel from the field's own curvature.**
   *
   * `tolCpu` is a single constant fitted to one measurement of one place, and
   * that is the disease `imgdiff` already had ("the noise floor is per-shot, not
   * the constant everyone quotes") and `drawcheck` still has ("its tolerance is
   * smaller than its own reproducibility"). On 2026-08-31 it went red at
   * `worst -0.520` with `mean -0.001`, `p99 0.229` and the boot arm reading
   * *identically* to the after-travel arm — a purely static, one-texel excursion
   * 16% past a constant nobody had ever measured a floor for.
   *
   * There is an exact floor available and it does not have to be guessed.
   * Linear interpolation of `f` across a cell of width `h` is in error by at
   * most `(h^2/8)·max|f''|`, and the central second difference of `f` at
   * spacing `h` **is** `h^2 f''` to leading order. So:
   *
   *     sag(x, z) = max(|D2x|, |D2z|) / 8,   D2x = f(x-h,z) + f(x+h,z) - 2 f(x,z)
   *
   * is the drawn surface's own permitted deviation *at that texel*, computed
   * from `heightAt` — the very function the arm is comparing against — with no
   * constant fitted to anything. Where the ground is smooth it is ~0 and the arm
   * is as strict as `heightcheck`; over a 1.5 m gully lip it is large, and it is
   * large for a reason that is a theorem rather than an excuse.
   *
   * **This is an exemption, so it was falsified rather than argued.** Run, on a
   * clean tree with fresh bakes and a quiet daemon, 2026-08-31 at `a8c4918`:
   *
   *     baseline                      0 of 12544 texels violate   PASS
   *     --inject 'tfH += 3.0;'    12544 of 12544 texels violate   FAIL
   *
   * Perfect separation, and the control's error histogram is the baseline's
   * shifted by exactly +3.0 with the SAME COUNT IN EVERY BIN --
   * `1 38 493 2836 5838 2809 499 28 2` both times. That is the strongest form
   * this control can take: it says the injection was a pure offset, that the
   * probe read it, and that not one texel escaped the predicate through the
   * curvature door. `project/LANDMINES.md` §"An exemption whose stated reason is
   * not true of the code" is the failure mode this is written against.
   *
   * The same histogram, un-injected, is also the proof that the red this gate
   * used to throw was chord error: `-0.4:1 -0.3:38 -0.2:493 -0.1:2836 0.0:5838
   * 0.1:2809 0.2:499 0.3:28 0.4:2` is symmetric to within a couple of texels per
   * bin at every magnitude. An offset cannot make that shape.
   *
   * `sagK` is the headroom multiplier on that bound, and it is the only fitted
   * number left — a texel is a violation only when it is past BOTH `tolCpu` and
   * `sagK * sag`.
   *
   * **The AND is load-bearing, and this is the honest reason.** `sag` is an
   * *estimate* of the chord bound, not a proof of it: a central second
   * difference at spacing `h` vanishes at an inflection point while the function
   * still curves inside the cell, so a texel can carry a real 0.114 m error
   * against a bound of 0.001. Measured on a clean tree, 2026-08-31: the ratio
   * `|err| / sag` runs **p50 1.20, p99 8.51, worst 84.80**. Gating on the ratio
   * alone would therefore cry wolf on a few percent of texels, and gating on the
   * flat tolerance alone is what put this gate red on one gully lip. Requiring
   * both is what makes each one cover the other's blind spot, and it is why
   * `tolCpu` was NOT widened to accommodate the curvature argument.
   */
  const CELL0 = t.clipmap.rings[0].cell;
  const sagAt = (x: number, z: number) => {
    const h0 = t.heightAt(x, z);
    const d2x = t.heightAt(x - CELL0, z) + t.heightAt(x + CELL0, z) - 2 * h0;
    const d2z = t.heightAt(x, z - CELL0) + t.heightAt(x, z + CELL0) - 2 * h0;
    return Math.max(Math.abs(d2x), Math.abs(d2z)) / 8;
  };
  /** |err| as a multiple of that texel's own sag bound. */
  const ratios: number[] = [];
  let violations = 0, worstRatio = 0, worstRatioAt = null, worstRatioErr = 0;
  let worstSag = 0;
  for (let i = 0; i < R * R; i++) {
    if (Number.isNaN(before.y[i]) || Number.isNaN(after.y[i])) continue;
    const d = after.y[i] - before.y[i];
    n++; sum += d;
    if (Math.abs(d) > Math.abs(worst)) { worst = d; worstAt = [after.wx[i], after.wz[i]]; }
    const b = Math.round(d * 10) / 10;
    hist[b] = (hist[b] || 0) + 1;
    if (Math.abs(after.wx[i] - rect.cx) > CPU_RADIUS || Math.abs(after.wz[i] - rect.cz) > CPU_RADIUS) continue;
    const cpu = t.heightAt(after.wx[i], after.wz[i]);
    const dc = after.y[i] - cpu;
    cpuN++; cpuSum += dc; cpuAbs.push(Math.abs(dc));
    const cb = Math.round(dc * 10) / 10;
    cpuHist[cb] = (cpuHist[cb] || 0) + 1;
    const sag = sagAt(after.wx[i], after.wz[i]);
    // A floor on the floor: a perfectly flat texel would divide by zero, and
    // the read-back is a float32 render target, so 1 mm is the smallest
    // deviation worth calling non-zero at all.
    const ratio = Math.abs(dc) / Math.max(sag, 0.001);
    ratios.push(ratio);
    if (Math.abs(dc) > cfg.tolCpu && (cfg.sagK <= 0 || Math.abs(dc) > cfg.sagK * sag)) violations++;
    if (ratio > worstRatio) {
      worstRatio = ratio; worstRatioAt = [after.wx[i], after.wz[i]]; worstRatioErr = dc;
    }
    if (Math.abs(dc) > Math.abs(cpuWorst)) {
      cpuWorst = dc; cpuWorstAt = [after.wx[i], after.wz[i]]; worstSag = sag;
    }
  }
  ratios.sort((a, b) => a - b);
  cpuAbs.sort((a, b) => a - b);
  const cpuP99 = cpuAbs.length ? cpuAbs[Math.floor(cpuAbs.length * 0.99)] : 0;
  const cpuOver = cpuAbs.filter((v) => v > 0.1).length;
  // and the boot-time GPU-vs-CPU agreement, for reference
  let cpu0Sum = 0, cpu0Worst = 0, cpu0N = 0;
  for (let i = 0; i < R * R; i++) {
    if (Number.isNaN(before.y[i])) continue;
    if (Math.abs(before.wx[i] - rect.cx) > CPU_RADIUS || Math.abs(before.wz[i] - rect.cz) > CPU_RADIUS) continue;
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
    cpuP99, cpuOver, cpuN, cpuHist,
    cell0: CELL0, violations, worstSag,
    ratioP50: ratios.length ? ratios[Math.floor(ratios.length * 0.5)] : 0,
    ratioP99: ratios.length ? ratios[Math.floor(ratios.length * 0.99)] : 0,
    worstRatio, worstRatioAt, worstRatioErr,
    cpuMeanBefore: cpu0N ? cpu0Sum / cpu0N : 0, cpuWorstBefore: cpu0Worst,
    lodWorst, lodMean: lodN ? lodSum / lodN : 0, farAt, farDist,
    hist,
    player: [[p0.x, p0.y, p0.z], [p1.x, p1.y, p1.z]],
    cam: [[camBefore.x, camBefore.y, camBefore.z], [camAfter.x, camAfter.y, camAfter.z]],
    heightAtPlayer: [t.heightAt(p0.x, p0.z), t.heightAt(p1.x, p1.z)],
  };
}, { ...opts, tour });

await leased.release();

const f = (v: number | null | undefined, d = 3) => (v == null ? 'n/a' : Number(v).toFixed(d));
console.log(`home shot        ${out.home}`);
console.log(`probe rect       ${f(out.rect.span, 0)} m square at (${f(out.rect.cx, 1)}, ${f(out.rect.cz, 1)}), coverage ${f(out.coverage[0] * 100, 1)}% / ${f(out.coverage[1] * 100, 1)}%`);
console.log(`travelled        ${f(out.travelled, 0)} m over ${out.visited} stops`);
console.log(`camera           before (${out.cam[0].map((v) => f(v, 1)).join(', ')})  after (${out.cam[1].map((v) => f(v, 1)).join(', ')})`);
console.log(`player           before (${out.player[0].map((v) => f(v, 2)).join(', ')})  after (${out.player[1].map((v) => f(v, 2)).join(', ')})`);
console.log('');
console.log(`SURFACE DRIFT    mean ${f(out.driftMean)} m   worst ${f(out.driftWorst)} m at (${out.driftWorstAt ? out.driftWorstAt.map((v) => f(v, 1)).join(', ') : '-'})   over ${out.compared} texels`);
console.log(`gpu vs heightAt  boot: mean ${f(out.cpuMeanBefore)} worst ${f(out.cpuWorstBefore)}   after travel: mean ${f(out.cpuMeanAfter)} worst ${f(out.cpuWorstAfter)} at (${out.cpuWorstAtAfter ? out.cpuWorstAtAfter.map((v) => f(v, 1)).join(', ') : '-'})`);
console.log(`                 p99 |err| ${f(out.cpuP99)} m; ${out.cpuOver}/${out.cpuN} texels over 0.1 m (${f(out.cell0, 1)} m tessellation floor)`);
console.log(`vs its own sag   |err| / (local chord bound): p50 ${f(out.ratioP50, 2)}  p99 ${f(out.ratioP99, 2)}  worst ${f(out.worstRatio, 2)} (err ${f(out.worstRatioErr)} m at (${out.worstRatioAt ? out.worstRatioAt.map((v) => f(v, 1)).join(', ') : '-'}))`);
console.log(`                 worst |err| texel above has a sag bound of ${f(out.worstSag)} m, i.e. ${f(Math.abs(out.cpuWorstAfter) / Math.max(out.worstSag, 1e-6), 2)}x it`);
console.log(`                 ${out.violations} texels past BOTH ${opts.tolCpu} m and ${opts.sagK}x their own sag bound${opts.inject ? `   [injected: ${opts.inject}]` : ''}`);
const cbins = Object.keys(out.cpuHist).map(Number).sort((a, b) => a - b);
if (cbins.length > 1) console.log(`gpu-vs-cpu hist  ${cbins.map((b) => `${b.toFixed(1)}:${out.cpuHist[String(b)]}`).join('  ')}`);
console.log(`coarse-LOD spread  mean ${f(out.lodMean)} m  worst ${f(out.lodWorst)} m, with the camera ${f(out.farDist, 0)} m away at ${out.farAt} (reported, not gated)`);
const bins = Object.keys(out.hist).map(Number).sort((a, b) => a - b);
if (bins.length > 1) console.log(`drift histogram  ${bins.map((b) => `${b.toFixed(1)}:${out.hist[String(b)]}`).join('  ')}`);
if (errors.length) console.log(`\npage errors:\n  ${errors.slice(0, 8).join('\n  ')}`);

// Plan section 9.3: the blind spots belong in the output, beside the verdict.
console.log('\nblind to: everything outside ONE probe rect. The tour is thousands of metres');
console.log('          and the comparison is a single span-metre square, so a surface that');
console.log('          moved only where the camera stopped is invisible here.');
console.log('          Also blind to: anything that is not the terrain -- water, roads,');
console.log('          props and every seated object ride the drift and are not read;');
console.log('          drift that RECOVERS, since the probe is before-and-after and not');
console.log('          continuous, so a surface that climbed and came back reads zero;');
console.log('          the shading of the ground, which is `heightcheck` and a capture;');
console.log('          and drift below the 1.5 m tessellation floor the `--tol-cpu`');
console.log('          headroom already concedes.');

/**
 * **Two predicates, and only the drift one is a flat constant.**
 *
 * SURFACE DRIFT keeps `--tol`: the rendered ground must not move at all, that
 * is cell-independent, and 0.05 m is not a fitted number, it is "zero plus
 * float32".
 *
 * `gpu vs heightAt` no longer gates on `worst`. A worst-of-12544 statistic has
 * no floor anyone ever measured, and on 2026-08-31 it went red at -0.520 m
 * against a `tolCpu` fitted to a ~0.37 m observation, with `mean -0.001`,
 * `p99 0.229`, the boot and after-travel arms bit-identical, and `heightcheck`
 * reading 0.000 everywhere. That is a single triangle over a single gully lip,
 * which is the one thing this arm's floor is *made* of.
 *
 * A texel is now a violation only when it is past BOTH the flat `--tol-cpu`
 * AND `--sag-k` times the chord bound computed from the field's own curvature
 * at that texel (see `sagAt`). An offset bug -- a shader adding height, a CPU
 * function fallen behind, a mis-decoded attribute -- has no curvature to hide
 * behind and violates everywhere; run `--inject 'tfH += 3.0;'` and watch it.
 */
const bad = Math.abs(out.driftWorst) > opts.tol || out.violations > 0;
console.log(`\n${bad ? 'FAIL' : 'PASS'}  (tolerance ${opts.tol} m drift; vs heightAt: past ${opts.tolCpu} m AND ${opts.sagK}x the texel's own chord bound)`);
process.exit(bad || errors.length ? 1 : 0);
