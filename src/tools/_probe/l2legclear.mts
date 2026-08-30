/** Bind-pose radial clearance for pants and sleeve, per (theta, t). */
import * as THREE from 'three';
import { buildSkeleton } from '../../characters/rig/Skeleton.ts';
import { legNodes, armNodes, legShape, armShape } from '../../characters/rig/Anatomy.ts';
import { crScalar } from '../../characters/rig/Geo.ts';
import { CAST } from '../../characters/Cast.ts';

const CL = Number(process.argv[2] ?? 0.030);
const CASTR = CAST as unknown as Record<string, { profile: Record<string, number>, look: { outfit: Record<string, unknown>[] } }>;
const lerpN = (a: number, b: number, t: number) => a + (b - a) * t;

for (const key of ['noctis', 'gladio', 'ignis', 'prompto']) {
  const c = CASTR[key];
  const rig = buildSkeleton(c.profile as never);
  const m = rig.profile.muscle;
  for (const piece of c.look.outfit) {
    const o = piece as Record<string, number | undefined>;
    let nodes, shp, u0, u1, padAt: (t: number) => number;
    if (piece.type === 'pants') {
      nodes = legNodes(rig, 'L'); shp = legShape(m);
      u0 = o.u0 ?? 0.02; u1 = o.u1 ?? 0.93;
      padAt = (t: number) => lerpN((o.padHip ?? 0.014) + CL, (o.padAnkle ?? 0.012) + CL, t);
    } else if (piece.type === 'sleeve') {
      nodes = armNodes(rig, 'L'); shp = armShape(m, 1);
      u0 = o.u0 ?? 0.03; u1 = o.u1 ?? 0.88;
      const base = (o.pad ?? 0.014) + CL;
      padAt = (t: number) => base * (0.15 + 0.85 * sm(t * 2.4)) - 0.013 * (1 - sm(t * 2.6));
    } else continue;
    const rxs = nodes.map((n) => n.rx), rzs = nodes.map((n) => n.rz ?? n.rx);
    const damp = piece.type === 'pants' ? 0.94 : 0.94;
    const count = Math.max(piece.type === 'pants' ? 10 : 9, Math.ceil(Math.abs(u1 - u0) / 0.030) + 1);
    const dRx: number[] = [], dRz: number[] = [];
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1), u = u0 + (u1 - u0) * t;
      dRx.push(crScalar(rxs, u) + padAt(t)); dRz.push(crScalar(rzs, u) + padAt(t));
    }
    let worst = 1e9, wt = 0, wth = 0;
    for (let ti = 2; ti <= 24; ti++) {   // skip t<0.08: the sleeve root is meant to be buried
      const t = ti / 24, u = u0 + (u1 - u0) * t;
      for (let j = 0; j < 72; j++) {
        const th = (j / 72) * Math.PI * 2;
        const v = shp(th, u); const gv = v > 1 ? v : 1 + (v - 1) * damp;
        const s = Math.abs(Math.sin(th)), cs = Math.abs(Math.cos(th));
        const d = (crScalar(dRx, t) * gv - crScalar(rxs, u) * v) * s
                + (crScalar(dRz, t) * gv - crScalar(rzs, u) * v) * cs;
        if (d < worst) { worst = d; wt = t; wth = th; }
      }
    }
    console.log(`${key.padEnd(8)} ${piece.type.padEnd(7)} clearance=${(CL * 1000).toFixed(0)}mm  worst ${(worst * 1000).toFixed(1)} mm at t=${wt.toFixed(2)} th=${wth.toFixed(2)}`);
  }
}
function sm(x: number) { const c = x < 0 ? 0 : x > 1 ? 1 : x; return c * c * (3 - 2 * c); }
