#!/usr/bin/env node
/**
 * Does every creature in the bestiary actually stand on the ground, in every
 * pose it can hold, for as long as the pose is held?
 *
 * The measurement is the *skinned* bounding box, not the object transform:
 * `Box3.setFromObject` on a `SkinnedMesh` reads `geometry.boundingBox`, which
 * is the bind pose, so it is blind to a skeleton that has folded through the
 * floor. Here every vertex is pushed through `applyBoneTransform` and the
 * mesh's world matrix, which is exactly what the rasteriser will draw.
 *
 * Three numbers per species/pose:
 *
 *   `foot`  bbox.min.y − root.y. Zero means the lowest drawn vertex is exactly
 *           on the root, which sits on the terrain. Negative is underground.
 *   `top`   bbox.max.y − root.y, cross-checked against the declared height.
 *   `drift` how far `foot` moved between holding the pose for one frame and
 *           holding it for `--hold` frames. **This must be zero.** A pose
 *           function that writes `visual.position.y -= drop` is only correct if
 *           something resets the transform first; if nothing does, holding the
 *           pose integrates it once per frame and the creature sinks. That is
 *           the shape of bug this tool exists to catch — the same one that once
 *           sank the party ~10 m through an idle layer in `rig/Anim.ts`.
 *
 * Poses are driven through the same path a screenshot scenario uses
 * (`Enemy.freeze` + `Enemies.update` with `frozen = true`) so the tool measures
 * the code that produces the bestiary shots rather than an idealised call.
 *
 *   node src/tools/creaturecheck.mts                # whole roster, every pose
 *   node src/tools/creaturecheck.mts --species sabertusk,irongiant
 *   node src/tools/creaturecheck.mts --hold 240     # frames to hold each pose
 *   node src/tools/creaturecheck.mts --tol 0.25     # fail above this |foot|, metres
 *   node src/tools/creaturecheck.mts --json out.json
 *
 * Exits non-zero if any pose drifts, or if any pose leaves the model further
 * off the ground than `--tol` (airborne poses — a pounce, a leap — are exempt
 * by name, because being off the ground is the point of them).
 */
import { chromium } from 'playwright';
import { CHROMIUM_ARGS } from './chromium.mts';
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.PORT || 5173);

function parseArgs(argv: string[]) {
  const o: { hold: number, tol: number, driftTol: number, species: string[] | null, json: string | null, quiet: boolean } =
    { hold: 240, tol: 0.25, driftTol: 0.002, species: null, json: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--hold') o.hold = Number(argv[++i]);
    else if (a === '--tol') o.tol = Number(argv[++i]);
    else if (a === '--drift-tol') o.driftTol = Number(argv[++i]);
    else if (a === '--species') o.species = argv[++i].split(',');
    else if (a === '--json') o.json = argv[++i];
    else if (a === '--quiet') o.quiet = true;
    else throw new Error(`unknown flag ${a}`);
  }
  return o;
}

const opts = parseArgs(process.argv.slice(2));

const portOpen = (p: number) => new Promise<boolean>((res) => {
  const s = net.connect(p, '127.0.0.1');
  s.on('connect', () => { s.destroy(); res(true); });
  s.on('error', () => res(false));
  setTimeout(() => { s.destroy(); res(false); }, 800);
});
async function ensureServer() {
  if (await portOpen(PORT)) return null;
  const proc = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 300));
    if (await portOpen(PORT)) return proc;
  }
  throw new Error('vite failed to start');
}

const server = await ensureServer();
const browser = await chromium.launch({ args: CHROMIUM_ARGS });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e).split('\n')[0]));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().split('\n')[0]); });

let rows = [];
try {
  await page.goto(`http://127.0.0.1:${PORT}/?q=ultra&shoot=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction('window.GAME && window.GAME.ready === true', null, { timeout: 180000 });
  await page.evaluate(() => { window.GAME.stop(); document.getElementById('boot')?.remove(); });

  rows = await page.evaluate(async (cfg) => {
    const g = window.GAME;
    const enemies = g.get('Enemies')!;
    const terrain = g.get('Terrain')!;
    const bes = await import('/characters/enemies/Bestiary.ts');

    /**
     * Every pose vocabulary word any species answers to. `POSE_MAP` in
     * `EnemyBase` collapses the AI states onto these, and `Enemy.freeze`
     * passes whatever a scenario names straight through — so `pounce` and
     * `run` are real poses even though no AI state is called that.
     */
    const POSES = ['idle', 'approach', 'run', 'pounce', 'telegraph', 'attack',
      'flinch', 'stagger', 'death'] as const;
    /** Poses whose whole point is that the creature is off the ground. */
    const AIRBORNE = new Set(['pounce']);

    /**
     * Species/pose pairs that are *meant* not to stand on the ground, each
     * with the reason. These are exemptions, not a relaxed threshold: every
     * other pose is still held to `--tol`, and adding one here is a claim
     * about art direction that has been checked by eye in the bestiary shot.
     *
     * `*` exempts every pose of that species.
     */
    const INTENTIONAL = {
      // Modelled from the pelvis up: the arena the player fights in sits at
      // Titan's waist, so tens of metres of him are below the ground by
      // design and there is no foot to measure. See `TITAN.buriedBase`.
      titan: '*',
      // A floating daemon. The necromancer never touches the ground — it
      // hangs 0.3-0.7 m above it and its robe trails, which is the read.
      // Its death is the one pose where it comes down, so that one is
      // deliberately *not* exempt.
      necromancer: ['idle', 'approach', 'run', 'telegraph', 'attack', 'flinch', 'stagger'],
      // A leaping gait: the hobgoblin bounds rather than walks, so its
      // approach and run are airborne for most of the cycle on purpose.
      hobgoblin: ['approach', 'run'],
    };
    const exempt = (key: string, pose: string) => {
      const e = INTENTIONAL[key as keyof typeof INTENTIONAL];
      return e === '*' || (Array.isArray(e) && e.includes(pose));
    };

    /**
     * World-space AABB of what will actually be drawn. Skinned vertices are
     * transformed by the live skeleton; static children (weapons, shells) come
     * through their own world matrices.
     */
    /**
     * The parts of the page's three objects this sweep touches. Written down
     * structurally because the classes come from the page's own module graph,
     * not from a module this file could import.
     */
    interface DrawNode {
      geometry?: { attributes?: { position?: { count: number } } };
      isSkinnedMesh?: boolean;
      skeleton?: { update(): void };
      /** Optional: a plain `Object3D` has none, which is what `traverse` hands
       *  the callback. Guarded by `isSkinnedMesh` at the one call site. */
      applyBoneTransform?(i: number, v: Vec3Like): void;
      matrixWorld: unknown;
      traverse(fn: (o: DrawNode) => void): void;
    }
    interface Vec3Like {
      x: number; y: number; z: number;
      fromBufferAttribute(attr: unknown, i: number): void;
      applyMatrix4(m: unknown): void;
    }

    const drawnBox = (e: { root: { updateMatrixWorld(f: boolean): void }, visual: DrawNode }) => {
      e.root.updateMatrixWorld(true);
      const v: Vec3Like = g.scene.position.clone();
      let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
      let minZ = Infinity, maxZ = -Infinity, n = 0;
      e.visual.traverse((o) => {
        const geo = o.geometry;
        if (!geo || !geo.attributes || !geo.attributes.position) return;
        const pos = geo.attributes.position;
        if (o.isSkinnedMesh && o.skeleton) o.skeleton.update();
        // 3000 samples resolves a foot to well under a centimetre and keeps a
        // 26-species x 9-pose x 2-hold sweep inside a few seconds
        const step = Math.max(1, Math.floor(pos.count / 3000));
        for (let i = 0; i < pos.count; i += step) {
          v.fromBufferAttribute(pos, i);
          if (o.isSkinnedMesh) o.applyBoneTransform?.(i, v);
          v.applyMatrix4(o.matrixWorld);
          if (v.y < minY) minY = v.y;
          if (v.y > maxY) maxY = v.y;
          if (v.x < minX) minX = v.x;
          if (v.x > maxX) maxX = v.x;
          if (v.z < minZ) minZ = v.z;
          if (v.z > maxZ) maxZ = v.z;
          n++;
        }
      });
      return { minY, maxY, minX, maxX, minZ, maxZ, n };
    };

    const keys = cfg.species || bes.speciesKeys();
    const out = [];
    // A patch of ground the harness already trusts: the player's own footing.
    const player = g.get('Player')!;
    const base = player.position.clone();

    for (const key of keys) {
      for (const pose of POSES) {
        enemies.clear();
        enemies.frozen = false;
        let e;
        try {
          e = enemies.spawn(key, { pos: base });
        } catch (err) {
          out.push({ key, pose, error: String(err).slice(0, 120) });
          break;
        }
        const gy = terrain ? terrain.heightAt(e.root.position.x, e.root.position.z) : 0;
        e.stateTime = 0.42;
        e.freeze(pose, 3.1);
        enemies.frozen = true;

        enemies.update(1 / 60, g);
        const first = drawnBox(e);
        // What the pose itself wrote to the body transform, separately from
        // what the skeleton did. `foot - bodyY` is the pose's foot clearance
        // *before* its own crouch/settle offset, i.e. how much of a drop the
        // pose can actually afford before the feet leave the ground — the
        // number you want when deciding how far to cap one.
        const bodyY = e.visual.position.y;
        const bodyRoll = e.visual.rotation.z, bodyPitch = e.visual.rotation.x;
        for (let i = 0; i < cfg.hold; i++) enemies.update(1 / 60, g);
        const held = drawnBox(e);

        const ry = e.root.position.y;
        out.push({
          key,
          pose,
          airborne: AIRBORNE.has(pose) || exempt(key, pose),
          exempt: exempt(key, pose),
          samples: first.n,
          height: e.height * e.scale,
          bodyY: +bodyY.toFixed(4),
          bodyRoll: +bodyRoll.toFixed(4),
          bodyPitch: +bodyPitch.toFixed(4),
          headroom: +(first.minY - ry - bodyY).toFixed(4),
          foot: +(first.minY - ry).toFixed(4),
          top: +(first.maxY - ry).toFixed(4),
          width: +Math.max(first.maxX - first.minX, first.maxZ - first.minZ).toFixed(3),
          drift: +(held.minY - first.minY).toFixed(4),
          rootVsTerrain: +(ry - gy).toFixed(4),
          // The measured ground-correction curve `calibrateGround()` built for
          // this pose, so a wrong lift can be told apart from a wrong pose.
          cal: e.type._groundCal && e.type._groundCal[pose]
            ? Array.from(e.type._groundCal[pose], (n) => +n.toFixed(3)) : null,
        });
        enemies.clear();
        enemies.frozen = false;
      }
    }
    return out;
  }, { hold: opts.hold, species: opts.species });
} finally {
  await browser.close();
  if (server) server.kill();
}

/* ------------------------------------------------------------- reporting */

const bad = [];
const byKey = new Map();
for (const r of rows) {
  if (!byKey.has(r.key)) byKey.set(r.key, []);
  byKey.get(r.key).push(r);
  if (r.error) { bad.push(`${r.key}: ${r.error}`); continue; }
  if (Math.abs(r.drift!) > opts.driftTol) bad.push(`${r.key}/${r.pose}: drifts ${r.drift!.toFixed(3)} m over ${opts.hold} frames`);
  else if (!r.airborne && Math.abs(r.foot!) > opts.tol) bad.push(`${r.key}/${r.pose}: foot ${r.foot!.toFixed(3)} m off the ground`);
}

if (!opts.quiet) {
  const pad = (s: string | number, n: number) => String(s).padEnd(n);
  const num = (v: number, n = 8) => String(v.toFixed(3)).padStart(n);
  console.log(`${pad('species', 16)}${pad('pose', 11)}${'foot'.padStart(8)}${'bodyY'.padStart(8)}${'headrm'.padStart(8)}${'roll'.padStart(7)}${'top'.padStart(8)}${'height'.padStart(8)}${'drift'.padStart(9)}`);
  for (const [key, list] of byKey) {
    for (const r of list) {
      if (r.error) { console.log(`${pad(key, 16)}${pad(r.pose, 11)}  ERROR ${r.error}`); continue; }
      const flagD = Math.abs(r.drift) > opts.driftTol ? ' DRIFT' : '';
      const flagF = !r.airborne && Math.abs(r.foot) > opts.tol ? ' LOW' : '';
      if (r.exempt) { console.log(`${pad(key, 16)}${pad(r.pose, 11)}${num(r.foot)}${' '.repeat(31)}  exempt`); continue; }
      const roll = Math.abs(r.bodyRoll) > Math.abs(r.bodyPitch) ? r.bodyRoll : r.bodyPitch;
      console.log(`${pad(key, 16)}${pad(r.pose, 11)}${num(r.foot)}${num(r.bodyY)}${num(r.headroom)}${num(roll, 7)}${num(r.top)}${num(r.height)}${num(r.drift, 9)}${flagD}${flagF}`);
    }
  }
}

if (opts.json) await writeFile(opts.json, JSON.stringify(rows, null, 2));

const pageErrors = errors.filter((e) => !/favicon/.test(e));
if (pageErrors.length) {
  console.error(`\n${pageErrors.length} page error(s):`);
  for (const e of pageErrors.slice(0, 8)) console.error(`  ${e}`);
}
if (bad.length) {
  console.error(`\n${bad.length} failure(s):`);
  for (const b of bad) console.error(`  ${b}`);
}
console.log(`\n${rows.length} pose(s) probed across ${byKey.size} species · ${bad.length} failure(s)`);
process.exit(bad.length || pageErrors.length ? 1 : 0);
