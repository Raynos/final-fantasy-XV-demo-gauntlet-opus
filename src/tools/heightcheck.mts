#!/usr/bin/env node
/**
 * Does the GPU's terrain surface agree with `Terrain.heightAt()`?
 *
 * Renders the terrain vertex shader's own `tf_height()` into a float target at
 * chosen world positions and reads it back, so the comparison is against the
 * actual displaced surface rather than an inference from depth.
 */
import { chromium } from 'playwright';
import { CHROMIUM_ARGS } from './chromium.mts';
const PORT = Number(process.env.PORT || 5321);
const SHOT = process.argv[2] || 'hero_closeup';
const browser = await chromium.launch({ args: CHROMIUM_ARGS });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.error('PAGEERR', String(e).split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE', m.text().split('\n')[0]); });
await page.goto(`http://127.0.0.1:${PORT}/?q=ultra&shoot=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 180000 });
await page.evaluate(() => { window.GAME.stop(); document.getElementById('boot')?.remove(); });
const out = await page.evaluate(async (shot) => {
  const g = window.GAME;
  const t = g.get('Terrain')!;
  g.applyShot(shot); g.settle(30);
  const tm = await import('/world/terrain/TerrainMaterial.ts');
  const fld = await import('/world/terrain/Field.ts');
  const FIELD = tm.TERRAIN_FIELD_GLSL;

  /**
   * The class a live object came from, as a constructor.
   *
   * A bare `three` specifier does not resolve inside `page.evaluate` -- the
   * browser is doing the import, not vite -- and the probe rig must use the
   * *page's* three anyway, not a second copy. `Object.constructor` is typed
   * `Function`, which has no construct signature; this is the one place that
   * says otherwise, and the type argument keeps it checked: hand it the wrong
   * instance and every `new` below stops compiling. Same trick as
   * `src/tools/driftcheck.mts`.
   */
  const classOf = <T extends object>(o: T) => o.constructor as new (...args: readonly unknown[]) => T;

  const mesh0 = t.clipmap.rings[0].meshes[0];
  const Mesh = classOf(mesh0);
  const BufferGeometry = classOf(mesh0.geometry);
  const BufferAttribute = classOf(mesh0.geometry.attributes.position);
  const Scene = classOf(g.scene);
  const ShaderMaterial = classOf(g.post.taa.material);
  const RT = classOf(g.post.rtScene);
  const V2 = classOf(g.post.jitterUv);
  const res = t.res;

  const NP = 64;
  // `V2` is three's Vector2, resolved off the page's own module graph.
  const pts: Array<{ set(x: number, y: number): void }> = [];
  for (let i = 0; i < NP; i++) pts.push(new V2(0, 0));

  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const mat = new ShaderMaterial({
    uniforms: {
      uHeightTex: res.uniforms.uHeightTex,
      uFarHeightTex: res.uniforms.uFarHeightTex,
      uField: res.uniforms.uField,
      uFarP: res.uniforms.uFarP,
      uPts: { value: pts },
    },
    vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `
      precision highp float;
      ${FIELD}
      uniform vec2 uPts[${NP}];
      void main() {
        int i = int(floor(gl_FragCoord.x));
        vec2 p = uPts[i];
        gl_FragColor = vec4(tf_height(p), tf_micro(p), tf_grid(uHeightTex, p, uField), 1.0);
      }`,
    depthTest: false, depthWrite: false,
  });
  const scene = new Scene();
  const quad = new Mesh(geo, mat);
  quad.frustumCulled = false;
  scene.add(quad);
  const rt = new RT(NP, 1, { type: 1015, format: 1023, minFilter: 1003, magFilter: 1003, depthBuffer: false, stencilBuffer: false });

  const sample = (list: number[][]) => {
    for (let i = 0; i < NP; i++) pts[i].set(list[i] ? list[i][0] : 0, list[i] ? list[i][1] : 0);
    mat.uniforms.uPts.value = pts;
    mat.uniformsNeedUpdate = true;
    const prev = g.renderer.getRenderTarget();
    g.renderer.setRenderTarget(rt);
    g.renderer.render(scene, g.camera);
    g.renderer.setRenderTarget(prev);
    const buf = new Float32Array(NP * 4);
    g.renderer.readRenderTargetPixels(rt, 0, 0, NP, 1, buf);
    return buf;
  };

  const cam = g.camera.position.clone();
  const player = g.get('Player')!;
  const pp = player ? player.position.clone() : cam;
  const list = [];
  // a ring of probes around the player plus a few at range
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = 1 + (i % 4) * 3;
    list.push([pp.x + Math.cos(a) * r, pp.z + Math.sin(a) * r]);
  }
  for (let i = 0; i < 20; i++) list.push([pp.x + (i - 10) * 17.3, pp.z + (i - 10) * 9.1]);
  for (let i = 0; i < 20; i++) list.push([(i - 10) * 311.7, (i * 7 - 70) * 41.3]);
  const buf = sample(list);

  const rows = [];
  let worst = 0, worstAt = null;
  for (let i = 0; i < list.length; i++) {
    const [x, z] = list[i];
    const gpuH = buf[i * 4], gpuMicro = buf[i * 4 + 1], gpuGrid = buf[i * 4 + 2];
    const cpuH = t.heightAt(x, z);
    const cpuMicro = fld.microDetail(x, z);
    const cpuGrid = t.field.rawHeightAt(x, z);
    const d = gpuH - cpuH;
    if (Math.abs(d) > Math.abs(worst)) { worst = d; worstAt = [x, z]; }
    if (i < 14 || Math.abs(d) > 0.05) {
      rows.push(`(${x.toFixed(1)}, ${z.toFixed(1)})  gpu ${gpuH.toFixed(3)}  cpu ${cpuH.toFixed(3)}  d ${d.toFixed(3)}   | micro gpu ${gpuMicro.toFixed(3)} cpu ${cpuMicro.toFixed(3)} d ${(gpuMicro - cpuMicro).toFixed(3)} | grid gpu ${gpuGrid.toFixed(3)} cpu ${cpuGrid.toFixed(3)} d ${(gpuGrid - cpuGrid).toFixed(3)}`);
    }
  }
  const groundAtPlayer = t.heightAt(pp.x, pp.z);
  const gpuAtPlayer = sample([[pp.x, pp.z]])[0];
  return {
    shot, cam: [cam.x, cam.y, cam.z], player: [pp.x, pp.y, pp.z],
    cpuGroundAtPlayer: groundAtPlayer, gpuGroundAtPlayer: gpuAtPlayer,
    worst, worstAt, rows,
  };
}, SHOT);
console.log(`shot ${out.shot}`);
console.log(`camera  (${out.cam.map((v) => v.toFixed(2)).join(', ')})`);
console.log(`player  (${out.player.map((v) => v.toFixed(2)).join(', ')})   cpu ground ${out.cpuGroundAtPlayer.toFixed(3)}  gpu ground ${out.gpuGroundAtPlayer.toFixed(3)}`);
console.log(`worst |gpu - cpu| = ${out.worst.toFixed(3)} m at ${out.worstAt && out.worstAt.map((v) => v.toFixed(1)).join(', ')}\n`);
console.log(out.rows.join('\n'));
await browser.close();
