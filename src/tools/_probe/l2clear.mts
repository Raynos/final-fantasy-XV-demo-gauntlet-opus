/** Bind-pose radial clearance: garment surface minus body surface, per (theta, u). */
import * as THREE from 'three';
import { buildSkeleton } from '../../characters/rig/Skeleton.ts';
import { torsoNodes, torsoShape, drape as drapeRaw } from '../../characters/rig/Anatomy.ts';
import { crScalar } from '../../characters/rig/Geo.ts';
import { CAST } from '../../characters/Cast.ts';

const SKIN_CLEARANCE = 0.030;
const CASTR = CAST as unknown as Record<string, { profile: Record<string, number>, look: { outfit: Record<string, unknown>[] } }>;

for (const key of ['noctis', 'gladio', 'ignis', 'prompto']) {
  const c = CASTR[key];
  const rig = buildSkeleton(c.profile as never);
  const m = rig.profile.muscle;
  const nodes = torsoNodes(rig);
  const tS = torsoShape(m);
  const rxs = nodes.map((n) => n.rx);
  const rzs = nodes.map((n) => n.rz ?? n.rx);
  const curve = new THREE.CatmullRomCurve3(nodes.map((n) => new THREE.Vector3().fromArray(n.p)), false, 'centripetal', 0.5);
  console.log(`\n===== ${key}  muscle=${m}  shoulder=${rig.profile.shoulder}`);
  for (const piece of c.look.outfit) {
    if (piece.type !== 'jacket' && piece.type !== 'shirt') continue;
    const o = piece as Record<string, number | undefined>;
    const isJ = piece.type === 'jacket';
    const u0 = o.u0 ?? (isJ ? 0.30 : 0.28), u1 = o.u1 ?? 0.96;
    const base = (o.pad ?? (isJ ? 0.026 : 0.010)) + SKIN_CLEARANCE;
    const padAt = (t: number) => (isJ ? base * (1 - 0.62 * sm((t - 0.70) / 0.30)) : base);
    const damp = isJ ? 0.90 : 0.92;
    const drapedRx: number[] = [], drapedRz: number[] = [], ys: number[] = [];
    const count = Math.max(isJ ? 12 : 10, Math.ceil(Math.abs(u1 - u0) / 0.030) + 1);
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1), u = u0 + (u1 - u0) * t;
      drapedRx.push(crScalar(rxs, u) + padAt(t));
      drapedRz.push(crScalar(rzs, u) + padAt(t));
      ys.push(curve.getPoint(u).y);
    }
    let worst = 1e9, wth = 0, wt = 0;
    const rows: string[] = [];
    for (let ti = 0; ti <= 24; ti++) {
      const t = ti / 24, u = u0 + (u1 - u0) * t;
      let mn = 1e9, mnth = 0;
      for (let j = 0; j < 72; j++) {
        const th = (j / 72) * Math.PI * 2;
        if (isJ) { const g = o.gap ?? 0.42; if (th < g || th > Math.PI * 2 - g) continue; }
        const v = tS(th, u);
        const gv = v > 1 ? v : 1 + (v - 1) * damp;
        // radial distance along the ellipse direction, approximated on each axis
        const gx = crScalar(drapedRx, t) * gv, gz = crScalar(drapedRz, t) * gv;
        const bx = crScalar(rxs, u) * v, bz = crScalar(rzs, u) * v;
        const s = Math.abs(Math.sin(th)), cs = Math.abs(Math.cos(th));
        const d = (gx - bx) * s + (gz - bz) * cs;
        if (d < mn) { mn = d; mnth = th; }
      }
      rows.push(`   t=${t.toFixed(2)} u=${u.toFixed(3)} y=${curve.getPoint(u).y.toFixed(3)}  min clearance ${(mn * 1000).toFixed(1)} mm @ th=${mnth.toFixed(2)}`);
      if (mn < worst) { worst = mn; wth = mnth; wt = t; }
    }
    console.log(` -- ${piece.type}: worst ${(worst * 1000).toFixed(1)} mm at t=${wt.toFixed(2)} th=${wth.toFixed(2)}`);
    if (worst < 0.004) for (const r of rows) console.log(r);
  }
}
function sm(x: number) { const c = x < 0 ? 0 : x > 1 ? 1 : x; return c * c * (3 - 2 * c); }
