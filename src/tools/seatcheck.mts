#!/usr/bin/env node
/**
 * Does `Terrain.drawnHeightAt` really describe the surface the clipmap draws,
 * and how far is that from `heightAt` at each ring?
 *
 * `heightcheck.mts` proves the CPU field agrees with the GPU field. That is a
 * pure function of position and is blind to the clipmap: vertices land on a
 * lattice of `cell` metres and everything between them is a chord across the
 * real relief. `driftcheck.mts` proves the drawn surface does not MOVE. Neither
 * answers the question a prop needs answered — *where is the mesh I am supposed
 * to be sitting on* — which is what `seatHeightAt` / `drawnEnvelope` exist for.
 *
 * This renders the real clipmap meshes through the real vertex chunks into a
 * float target from straight above (the `driftcheck` rig) at bands of
 * increasing distance from the camera, and for every covered texel compares the
 * rasterised Y against three CPU answers:
 *
 *   heightAt        the continuous field — what everything is seated on today
 *   drawnHeightAt   the model of the rasterised surface
 *   seatHeightAt    where a body of `--size` metres should actually sit
 *
 * A `drawnHeightAt` residual near zero is the whole point: it means the model
 * is the renderer's arithmetic rather than an approximation of it, and the
 * `heightAt` column beside it is then a measurement of the floating-prop bug
 * rather than an estimate of it.
 *
 *   node src/tools/seatcheck.mts
 *   node src/tools/seatcheck.mts --home vista_dawn --size 2
 *   node src/tools/seatcheck.mts --bands 60,200,400,800,1600 --span 120
 *
 * Assumes a dev server is already up on `PORT` (like `heightcheck`/`driftcheck`).
 */
import { chromium } from 'playwright';
import { CHROMIUM_ARGS } from './chromium.mts';
import type * as THREE from 'three';

const PORT = Number(process.env.PORT || 5173);

function parseArgs(argv: string[]) {
  const o = {
    home: 'hero_full', span: 100, res: 128, size: 1.5, settle: 60,
    bands: [60, 150, 300, 600, 1200, 2400],
    tol: 0.05,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--home') o.home = argv[++i];
    else if (a === '--span') o.span = Number(argv[++i]);
    else if (a === '--res') o.res = Number(argv[++i]);
    else if (a === '--size') o.size = Number(argv[++i]);
    else if (a === '--settle') o.settle = Number(argv[++i]);
    else if (a === '--tol') o.tol = Number(argv[++i]);
    else if (a === '--bands') o.bands = argv[++i].split(',').map(Number);
    else throw new Error(`unknown flag ${a}`);
  }
  return o;
}

const cfg = parseArgs(process.argv.slice(2));

const browser = await chromium.launch({ args: CHROMIUM_ARGS });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors: string[] = [];
page.on('pageerror', (e) => { errors.push(String(e).split('\n')[0]); });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().split('\n')[0]); });
await page.goto(`http://127.0.0.1:${PORT}/?q=ultra&shoot=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 180000 });
await page.evaluate(() => { window.GAME.stop(); document.getElementById('boot')?.remove(); });

const out = await page.evaluate(async (c) => {
  const g = window.GAME;
  const t = g.get('Terrain')!;
  const tm = await import('/world/terrain/TerrainMaterial.ts');

  const classOf = <T extends object>(o: T) => o.constructor as new (...args: readonly unknown[]) => T;
  interface SceneNode {
    type: string;
    isLight?: boolean;
    color?: THREE.Color;
    shadow?: { camera?: { isOrthographicCamera?: boolean } & THREE.OrthographicCamera };
  }
  interface ClipmapMesh { material: unknown }
  interface ClipmapRing { cell: number; level: number; meshes: ClipmapMesh[] }
  type OrthoCtor = new (l: number, r: number, t: number, b: number, n: number, f: number)
    => THREE.OrthographicCamera;

  const Scene = classOf(g.scene);
  const ShaderMaterial = classOf(g.post.taa.material);
  const RenderTarget = classOf(g.post.rtScene);
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
  const OrthographicCamera: OrthoCtor = orthoCtor;
  const Color: new () => THREE.Color = colorCtor;
  const FloatType = 1015, RGBAFormat = 1023, NearestFilter = 1003, DoubleSide = 2;

  // One material per level: the morph band in VERT_BEGIN is a function of
  // uCell, so a single material would mis-morph six of the seven rings.
  const probeMats = t.clipmap.rings.map((ring: ClipmapRing) => {
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
    m.customProgramCacheKey = () => `terrain-seat-probe-${ring.level}`;
    return m;
  });
  const probeScene = new Scene();
  const R = c.res;
  const rt = new RenderTarget(R, R, {
    type: FloatType, format: RGBAFormat,
    minFilter: NearestFilter, magFilter: NearestFilter,
    depthBuffer: true, stencilBuffer: false,
  });

  const probe = (cx: number, cz: number, span: number) => {
    const cam = new OrthographicCamera(-span / 2, span / 2, span / 2, -span / 2, 1, 4000);
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
    return buf;
  };

  g.applyShot(c.home);
  g.settle(c.settle);
  g.applyShot(c.home);
  g.settle(8);

  // Walk away from the camera along its own view direction, so each band is
  // drawn by a coarser ring than the last — which is the variable under test.
  const cam = g.camera;
  const fwd = { x: 0, z: 0 };
  {
    const d = cam.getWorldDirection(new (classOf(cam.position))(0, 0, 0));
    const L = Math.hypot(d.x, d.z) || 1;
    fwd.x = d.x / L; fwd.z = d.z / L;
  }

  const stat = (xs: number[]) => {
    if (!xs.length) return { mean: 0, worst: 0, p99: 0, n: 0 };
    const abs = xs.map(Math.abs).sort((a, b) => a - b);
    let s = 0, w = 0;
    for (const v of xs) { s += v; if (Math.abs(v) > Math.abs(w)) w = v; }
    return { mean: s / xs.length, worst: w, p99: abs[Math.floor(abs.length * 0.99)], n: xs.length };
  };

  const rows = [];
  for (const dist of c.bands) {
    const cx = cam.position.x + fwd.x * dist;
    const cz = cam.position.z + fwd.z * dist;
    const buf = probe(cx, cz, c.span);
    const vsField: number[] = [];
    const vsModel: number[] = [];
    const seatGap: number[] = [];
    let cell = 0;
    for (let i = 0; i < R * R; i++) {
      if (buf[i * 4 + 3] < 0.5) continue;
      const y = buf[i * 4], wx = buf[i * 4 + 1], wz = buf[i * 4 + 2];
      cell = t.clipSpacingAt(wx, wz);
      vsField.push(y - t.heightAt(wx, wz));
      vsModel.push(y - t.drawnHeightAt(wx, wz));
      seatGap.push(t.seatHeightAt(wx, wz, c.size) - y);
    }
    rows.push({
      dist, cell, covered: vsField.length,
      vsField: stat(vsField), vsModel: stat(vsModel), seatGap: stat(seatGap),
    });
  }
  return { shot: c.home, camera: { x: cam.position.x, z: cam.position.z }, rows };
}, cfg);

await browser.close();

console.log(`seatcheck — ${out.shot}, camera at ${out.camera.x.toFixed(0)}, ${out.camera.z.toFixed(0)}\n`);
console.log('The GPU column is the rasterised clipmap surface. Positive means the');
console.log('drawn mesh is ABOVE the CPU answer; negative means a prop seated on it floats.\n');
console.log(' dist   ring    texels    GPU-heightAt          GPU-drawnHeightAt        seat-GPU');
console.log('                            mean   worst          mean     worst        mean   worst');
console.log('-'.repeat(88));
const f = (v: number, w = 6) => v.toFixed(3).padStart(w);
for (const r of out.rows) {
  console.log(
    `${String(r.dist).padStart(5)} ${r.cell.toFixed(1).padStart(6)} ${String(r.covered).padStart(9)}  ` +
    `${f(r.vsField.mean)} ${f(r.vsField.worst)}      ` +
    `${f(r.vsModel.mean)} ${f(r.vsModel.worst)}      ` +
    `${f(r.seatGap.mean)} ${f(r.seatGap.worst)}`,
  );
}
console.log('-'.repeat(88));

const modelWorst = out.rows.reduce((a, r) => Math.max(a, Math.abs(r.vsModel.p99)), 0);
const fieldWorst = out.rows.reduce((a, r) => Math.max(a, Math.abs(r.vsField.p99)), 0);
console.log(`model residual p99 ${modelWorst.toFixed(3)} m   vs   heightAt error p99 ${fieldWorst.toFixed(3)} m`);
if (errors.length) {
  console.error(`\n${errors.length} page error(s):`);
  for (const e of [...new Set(errors)].slice(0, 6)) console.error('  ' + e);
  process.exit(1);
}
if (modelWorst > cfg.tol) {
  console.error(`\nFAIL: drawnHeightAt is ${modelWorst.toFixed(3)} m off the rasterised surface (tol ${cfg.tol} m).`);
  console.error('The model is not the renderer\'s arithmetic, so nothing seated through it is trustworthy.');
  process.exit(2);
}
console.log(`\nPASS: drawnHeightAt tracks the rasterised surface within ${cfg.tol} m.`);
