/**
 * The mushroom census: is a course standing clear of the one below it?
 *
 * `silhouette.mts` cannot answer this. It minimises over azimuth AND mirror,
 * height-normalises, and grades ONE landform against ANOTHER — so a family
 * every member of which is a wide cap on a narrow neck scores as varied so long
 * as the caps differ. The judge's *"ten identical mushroom rocks"* is a
 * statement about the shape they all share, not about how far apart they are.
 *
 * Metric: for every course above the base, the ratio of its projected half-width
 * to the projected half-width of the course under it, **maximised over eight
 * viewing azimuths**, using each course's own rotated elliptical footprint. The
 * per-course yaw is a full turn and the cross-section is anisotropic, so two
 * courses at 90 degrees to each other present a wide cap on a narrow stalk from
 * some azimuths even when their plan widths agree.
 */
import * as THREE from 'three';
import { Rng } from '../../util/Rng.ts';
import { KINDS, rockGeometry, hullExtents, torPlan, stackPlan } from '../../world/props/Rocks.ts';
import type { StoneKind } from '../../world/props/ZoneDress.ts';

const ext = new Map<StoneKind, [number, number, number]>();
for (const k of KINDS) ext.set(k.key, hullExtents(rockGeometry(k.seed, k.opts)));

const AZ = 16;
/** Half-width of a course seen from azimuth `th`. */
function proj(a: number, b: number, yaw: number, th: number) {
  const phi = th + Math.PI / 2 - yaw;
  return Math.hypot(a * Math.cos(phi), b * Math.sin(phi));
}

const rows = new Map<string, number[]>();
const push = (k: string, v: number) => { const a = rows.get(k) ?? []; a.push(v); rows.set(k, a); };

for (let v = 0; v < 900; v++) {
  const plan = torPlan(new Rng(9001 + v * 7919), 1.05, ext);
  let worst = 1;
  for (let i = 1; i < plan.courses.length; i++) {
    const c = plan.courses[i], p = plan.courses[i - 1];
    const ec = ext.get(c.kind)!, ep = ext.get(p.kind)!;
    const ca = c.s * c.sx * ec[0], cb = c.s * c.sz * ec[2];
    const pa = p.s * p.sx * ep[0], pb = p.s * p.sz * ep[2];
    for (let t = 0; t < AZ; t++) {
      const th = t * Math.PI * 2 / AZ;
      worst = Math.max(worst, proj(ca, cb, c.yaw, th) / proj(pa, pb, p.yaw, th));
    }
  }
  push(`tor:${plan.form}`, worst);
}

// Two readings of the same generator, and the difference between them IS the
// finding. `stackPlan` leaves the cross-section isotropic; `Rocks._stack` then
// spreads the ANCHOR's own `sx`/`sz` -- two independent gaussians at sd 0.30 --
// over every course, while `corestones` yaws each course over a full turn. So
// the plan is clean and the thing the game draws is not.
for (const [label, real] of [['stack (plan)', false], ['stack (as drawn)', true]] as Array<[string, boolean]>) {
  for (let v = 0; v < 600; v++) {
    const rng = new Rng(4201 + v * 7919);
    const cs = stackPlan('granite', 4.4, 1, rng, ext);
    // `_item`'s per-axis jitter, inherited by every course of the stack.
    const jr = new Rng(77003 + v * 104729);
    const jx = real ? 1 + jr.gauss(0, 0.30) : 1;
    const jz = real ? 1 + jr.gauss(0, 0.30) : 1;
    let worst = 1;
    for (let i = 1; i < cs.length; i++) {
      const c = cs[i], p = cs[i - 1];
      const ec = ext.get(c.kind)!, ep = ext.get(p.kind)!;
      for (let t = 0; t < AZ; t++) {
        const th = t * Math.PI * 2 / AZ;
        worst = Math.max(worst, proj(c.s * jx * ec[0], c.s * jz * ec[2], c.yaw, th)
          / proj(p.s * jx * ep[0], p.s * jz * ep[2], p.yaw, th));
      }
    }
    push(label, worst);
  }
}

console.log('family            n    cap ratio: max over 8 az of w(i)/w(i-1), per object');
console.log('                       p50    p90    p99    max   >1.35  >1.6');
for (const [k, a] of rows) {
  a.sort((x, y) => x - y);
  const q = (p: number) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
  console.log(
    `${k.padEnd(16)} ${String(a.length).padStart(4)}  ${q(0.5).toFixed(3)}  ${q(0.9).toFixed(3)}  `
    + `${q(0.99).toFixed(3)}  ${a[a.length - 1].toFixed(3)}  `
    + `${(100 * a.filter((x) => x > 1.35).length / a.length).toFixed(1).padStart(5)}% `
    + `${(100 * a.filter((x) => x > 1.6).length / a.length).toFixed(1).padStart(5)}%`,
  );
}
