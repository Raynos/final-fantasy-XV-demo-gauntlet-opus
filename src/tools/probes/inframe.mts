/**
 * **Is this world position in any judged frame, and how big would the defect be?**
 *
 *   node src/tools/probes/inframe.mts -1030,48,1459,14.3 286,36,-733,9.1
 *
 * Bare Node, no browser, no build: it parses `pos`/`target`/`fov` straight out
 * of `src/game/Shots.ts`.
 *
 * Every float, open joint and misplaced prop this repo has measured arrives as
 * a world coordinate and a size in metres, and the question that decides
 * whether it is worth fixing is always the same one — **is it in a frame, and
 * at how many pixels?** That has been answered by hand, per defect, in at least
 * three handoffs, and by "capture the nearest-looking shot and squint" in
 * several more. A 14 m void at 550 m behind a closed canopy and a 1 m void at
 * 1.5 km are both "still open" and neither is worth a lane.
 *
 * For each subject it reports the shot that frames it best: range, angle off
 * the camera axis against that shot's own **horizontal** half-angle (16:9, so
 * the horizontal one is the bound a point has to be inside), and the subject's
 * apparent height in pixels of a 1600x900 capture.
 *
 * **It answers "could be in frame", not "is visible".** It knows nothing about
 * occlusion — a canopy, a ridge, or being a dungeon interior shot where the
 * outdoor world is not drawn at all. Both of those came up the first time this
 * was run, and both are settled by looking at the shot it names, which is the
 * point: it turns "look at 142 frames" into "look at one".
 */
import { readFileSync } from 'node:fs';

interface Shot { name: string; pos: number[]; tgt: number[]; fov: number }

const src = readFileSync(new URL('../../game/Shots.ts', import.meta.url), 'utf8');
const header = /^\s{2}([a-z0-9_]+):\s*\{/gmi;
const at: Array<[string, number]> = [];
let m: RegExpExecArray | null;
while ((m = header.exec(src))) at.push([m[1], m.index]);

const shots: Shot[] = [];
for (let i = 0; i < at.length; i++) {
  const body = src.slice(at[i][1], i + 1 < at.length ? at[i + 1][1] : src.length);
  const p = body.match(/pos:\s*\[([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\]/);
  const t = body.match(/target:\s*\[([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\]/);
  const f = body.match(/fov:\s*([\d.]+)/);
  if (p && t) {
    shots.push({
      name: at[i][0], fov: f ? Number(f[1]) : 45,
      pos: p.slice(1, 4).map(Number), tgt: t.slice(1, 4).map(Number),
    });
  }
}

const subjects = process.argv.slice(2).map((a) => a.split(',').map(Number));
if (!subjects.length) {
  console.log('usage: node src/tools/probes/inframe.mts x,y,z[,sizeM] ...');
  process.exit(2);
}

const H = 900;
console.log(`${shots.length} shots in Shots.ts carry a pos/target pair\n`);
for (const s of subjects) {
  const [sx, sy, sz, size = 1] = s;
  let best: { shot: Shot; d: number; ang: number; halfH: number; px: number } | null = null;
  for (const sh of shots) {
    const dx = sx - sh.pos[0], dy = sy - sh.pos[1], dz = sz - sh.pos[2];
    const d = Math.hypot(dx, dy, dz);
    const ax = sh.tgt[0] - sh.pos[0], ay = sh.tgt[1] - sh.pos[1], az = sh.tgt[2] - sh.pos[2];
    const al = Math.hypot(ax, ay, az) || 1;
    const cos = (dx * ax + dy * ay + dz * az) / (d * al);
    const ang = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
    const halfV = sh.fov / 2;
    const halfH = Math.atan(Math.tan(halfV * Math.PI / 180) * 16 / 9) * 180 / Math.PI;
    if (ang >= halfH) continue;
    // Apparent height in pixels: the vertical FOV is the one the frame's 900
    // rows subtend, whatever the aspect does to the horizontal bound above.
    const px = (size / d) / (2 * Math.tan(halfV * Math.PI / 180)) * H;
    if (!best || px > best.px) best = { shot: sh, d, ang, halfH, px };
  }
  const head = `${size} m at ${sx},${sz}`.padEnd(28);
  if (!best) { console.log(`${head} in NO shot's frustum`); continue; }
  console.log(`${head} best: ${best.shot.name.padEnd(24)} range ${best.d.toFixed(0).padStart(5)} m`
    + `  off-axis ${best.ang.toFixed(1).padStart(5)} of ${best.halfH.toFixed(1)} deg`
    + `  -> ${best.px.toFixed(2).padStart(6)} px`);
}
