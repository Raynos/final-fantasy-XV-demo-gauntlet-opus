/*
 * Forward kinematics for a seated pose, on the CPU, off the page.
 *
 *   node src/tools/_probe/w3afk.mts            # every seat, plus the saddle
 *
 * A pose iteration through `probe.mts` costs ~90 s. The rig's bind rotations are
 * identity (`Skeleton.ts`), so a pose table is nothing but a chain of YXZ eulers
 * over known bind offsets — which means the real skeleton builder plus three's
 * own Euler maths answers "where does that hand end up" in milliseconds. This is
 * the loop the seated and mounted poses were authored in; `seatfit.mts` on the
 * page then confirms it against the live tree.
 *
 * FRAMES. The character faces +Z and its right is −X (`Skeleton.ts`). Seated in
 * the Regalia its root takes the chassis quaternion, and the chassis maps the
 * art frame by `pivot.rotation.y = -PI/2`: art +X (forward) -> chassis +Z, art
 * +Z -> chassis −X. So in the car's own art frame, times SCALE:
 *
 *     fore = +z_char      up = +y_char      lat = −x_char
 *
 * and `lat` positive is the side the DRIVER sits on. (`Occupants.ts` used to
 * call art +Z "the car's left"; it is the side the character's RIGHT hand is
 * on, which is what the numbers below actually key off.)
 */
import * as THREE from 'three';
import { buildSkeleton } from '../../characters/rig/Skeleton.ts';
import { POSES, SEATS, SCALE } from '../../world/vehicle/Occupants.ts';
import { POSE_RIDE } from '../../game/chocobo/Saddle.ts';

const e = new THREE.Euler(0, 0, 0, 'YXZ');

/** Cabin, in the art frame times SCALE — see `seatfit.mts` for the derivation. */
const WALL = 0.952, BELT = 1.106, SEAT_TOP = 0.925 * SCALE;
const WHEEL = { fore: -0.02 * SCALE, up: 1.17 * SCALE, lat: 0.44 * SCALE, r: 0.17 * SCALE };
/** Bird-local: barrel half-width at the rider's stations, from `seatfit.mts`. */
const BARREL = 0.448;

/** Apply a pose table to a fresh rig and return bone -> world position. */
export function fk(pose: Record<string, number[]>, profile = {}) {
  const rig = buildSkeleton(profile);
  for (const b of rig.bones) b.quaternion.identity();
  for (const name in pose) {
    const b = rig.byName[name]; if (!b) continue;
    const p = pose[name];
    b.quaternion.setFromEuler(e.set(p[0], p[1], p[2], 'YXZ'));
  }
  rig.root.updateMatrixWorld(true);
  const out: Record<string, THREE.Vector3> = {};
  for (const b of rig.bones) out[b.name] = b.getWorldPosition(new THREE.Vector3());
  return out;
}

const BONES = ['clavicleL', 'clavicleR', 'upperArmL', 'upperArmR', 'lowerArmL', 'lowerArmR',
  'handL', 'handR', 'fingersL', 'fingersR', 'fingerTipL', 'fingerTipR', 'thumbL', 'thumbR',
  'thighL', 'thighR', 'shinL', 'shinR', 'footL', 'footR', 'toeL', 'toeR', 'spine03', 'head'];

function seatReport(seatId: string, poseKey: keyof typeof POSES) {
  const seat = SEATS.find((s) => s.id === seatId)!;
  const P = fk(POSES[poseKey]);
  const h = P.hips;
  const car = (b: string) => ({
    fore: seat.mx * SCALE + (P[b].z - h.z),
    up: seat.my * SCALE + (P[b].y - h.y),
    lat: seat.mz * SCALE - (P[b].x - h.x),
  });
  const lines = [`--- ${seatId} (${String(poseKey)})  hips fore ${(seat.mx * SCALE).toFixed(2)} up ${(seat.my * SCALE).toFixed(3)} lat ${(seat.mz * SCALE).toFixed(2)}`];
  let worst = 0, wn = '';
  for (const b of BONES) {
    if (!P[b]) continue;
    const p = car(b);
    const over = Math.abs(p.lat) - WALL;
    if (over > worst) { worst = over; wn = b; }
  }
  const hl = car('handL'), hr = car('handR'), s3 = car('spine03');
  lines.push(`    handL fore ${hl.fore.toFixed(2)} up ${hl.up.toFixed(2)} lat ${hl.lat.toFixed(2)}   handR fore ${hr.fore.toFixed(2)} up ${hr.up.toFixed(2)} lat ${hr.lat.toFixed(2)}`);
  lines.push(`    shoulders up ${s3.up.toFixed(3)} (${(s3.up - BELT).toFixed(3)} over the belt)`);
  if (seatId === 'driver') {
    const d = (p: {fore:number,up:number,lat:number}) => Math.hypot(p.fore - WHEEL.fore, p.up - WHEEL.up, p.lat - WHEEL.lat) - WHEEL.r;
    lines.push(`    wheel: handL ${d(hl).toFixed(3)} m off the rim, handR ${d(hr).toFixed(3)}`);
  }
  lines.push(`    WORST outboard ${wn || '-'} ${worst.toFixed(3)} m past the door card (wall ${WALL})  ${worst <= 0.01 ? 'ok' : 'OUT'}`);
  return { text: lines.join('\n'), worst };
}

function rideReport() {
  const P = fk(POSE_RIDE);
  const h = P.hips;
  // bird-local, from `seatfit.mts`: +z forward, +x the rider's LEFT, seat y 1.86
  const bird = (b: string) => ({ x: P[b].x - h.x, y: 1.86 + (P[b].y - h.y), z: P[b].z - h.z });
  const lines = ['--- saddle (POSE_RIDE)  hips y 1.86, barrel half-width ' + BARREL];
  for (const b of ['handL', 'handR', 'lowerArmL', 'thighL', 'shinL', 'footL', 'toeL']) {
    const p = bird(b);
    lines.push(`    ${b.padEnd(10)} x ${p.x.toFixed(3).padStart(7)} y ${p.y.toFixed(3).padStart(7)} z ${p.z.toFixed(3).padStart(7)}   barrel clear ${(Math.abs(p.x) - BARREL).toFixed(3)}`);
  }
  const hl = bird('handL'), hr = bird('handR');
  lines.push(`    hands ${Math.abs(hl.x - hr.x).toFixed(2)} m apart, ${(hl.y - 1.86).toFixed(2)} m above the hips, ${hl.z.toFixed(2)} m forward`);
  return lines.join('\n');
}

const rows = [
  seatReport('driver', 'driver'),
  seatReport('front', 'front'),
  seatReport('rearL', 'rearSprawl'),
  seatReport('rearR', 'rearCamera'),
];
console.log(rows.map((r) => r.text).join('\n'));
console.log(`CAR VERDICT worst ${Math.max(...rows.map((r) => r.worst)).toFixed(3)} m`);
console.log(rideReport());


/* ---------------------------------------------------------------- solving */
/*
 * Authoring a seated pose by nudging euler triples and re-photographing is how
 * `POSE_RIDE` ended up with the arms 0.86 m apart. The FK above is exact and
 * costs microseconds, so the honest way round is to say where the hand has to
 * BE — on the wheel rim, on the door cap, on the rein, in the stirrup — and let
 * a hill-climb find the angles.
 *
 * Two things the first version of this got wrong, both worth writing down:
 *
 *  - **An unconstrained solve is not a pose.** It hit every target to the
 *    millimetre with 166 degrees of forearm yaw and the two arms doing
 *    different things: a contortionist, not a man. Joints need limits (an elbow
 *    flexes one way and does not hyperextend) and a roll/yaw regulariser, or
 *    the answer is correct and unusable.
 *  - **Symmetric intent must be solved once and mirrored**, not solved twice.
 *    The rig mirrors as `x -> -x`, so a pose mirrors as `[x, -y, -z]`.
 */
type Targets = Record<string, [number, number, number]>;

/** Joint limits, radians, in the rig's own convention. */
const LIM: Record<string, number[][]> = {
  upperArm: [[-1.9, 1.5], [-0.7, 0.7], [-1.25, 1.25]],
  lowerArm: [[-2.45, 0.05], [-0.55, 0.55], [-0.35, 0.35]],
  thigh: [[-2.0, 0.6], [-0.7, 0.7], [-1.0, 1.0]],
  shin: [[-0.05, 2.4], [-0.35, 0.35], [-0.35, 0.35]],
  foot: [[-0.7, 0.9], [-0.5, 0.5], [-0.5, 0.5]],
};
const limOf = (b: string) => LIM[b.replace(/[LR]$/, '')] || [[-3, 3], [-3, 3], [-3, 3]];
const clampTo = (b: string, k: number, v: number) => {
  const l = limOf(b)[k];
  return v < l[0] ? l[0] : v > l[1] ? l[1] : v;
};

/** Mirror one bone's euler to the other side. */
const mirrorE = (e: number[]) => [e[0], -e[1], -e[2]];

function mulberry(a: number) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function solve(base: Record<string, number[]>, free: string[], targets: Targets,
  opts: { latLimit?: number, seatLat?: number, mirror?: boolean, seed?: number, reg?: number, relTo?: string } = {}) {
  const rng = mulberry(opts.seed ?? 12345);
  const reg = opts.reg ?? 0.06;
  const apply = (pose: Record<string, number[]>) => {
    if (!opts.mirror) return pose;
    const p = { ...pose };
    for (const b of free) {
      if (!b.endsWith('L')) continue;
      const other = b.slice(0, -1) + 'R';
      if (pose[other]) p[other] = mirrorE(pose[b]);
    }
    return p;
  };
  const cost = (posein: Record<string, number[]>) => {
    const pose = apply(posein);
    const P = fk(pose);
    const h = P.hips;
    let c = 0;
    for (const b in targets) {
      const t = targets[b]; const p = P[b];
      if (!p) continue;
      // a hand on a rein is placed against the SHOULDER, not the pelvis: an
      // arm reaching a hip-relative point is at full extension and reads as a
      // scarecrow however right the point is
      const o = opts.relTo ? P[opts.relTo.replace('*', b.endsWith('R') ? 'R' : 'L')] : h;
      c += (p.x - o.x - t[0]) ** 2 + (p.y - o.y - t[1]) ** 2 + (p.z - o.z - t[2]) ** 2;
    }
    for (const b of free) c += reg * (pose[b][1] ** 2 + pose[b][2] ** 2 * 0.5);
    if (opts.latLimit != null) {
      for (const b of BONES) {
        if (!P[b]) continue;
        const lat = (opts.seatLat ?? 0) - (P[b].x - h.x);
        const over = Math.abs(lat) - opts.latLimit;
        if (over > 0) c += 60 * over * over;
      }
    }
    return c;
  };
  let best = JSON.parse(JSON.stringify(base));
  let bc = cost(best);
  for (let restart = 0; restart < 10; restart++) {
    const cur = JSON.parse(JSON.stringify(best));
    let cc = bc;
    let step = 0.5;
    for (let iter = 0; iter < 6000; iter++) {
      const b = free[Math.floor(rng() * free.length)];
      const k = Math.floor(rng() * 3);
      const old = cur[b][k];
      cur[b][k] = clampTo(b, k, old + (rng() * 2 - 1) * step);
      const c = cost(cur);
      if (c < cc) cc = c; else cur[b][k] = old;
      if (iter % 500 === 499) step *= 0.72;
    }
    if (cc < bc) { bc = cc; best = cur; }
  }
  return { pose: apply(best), cost: bc };
}

function emit(pose: Record<string, number[]>, names: string[]) {
  const all = [...names];
  for (const n of names) {
    const o = n.slice(0, -1) + 'R';
    if (n.endsWith('L') && pose[o] && !all.includes(o)) all.push(o);
  }
  return all.map((n) => `  ${n}: [${pose[n].map((v) => Number(v.toFixed(2))).join(', ')}],`).join('\n');
}

if (process.env.SOLVE) {
  const S = SCALE;
  const ride = { ...POSE_RIDE, hips: [-0.24, 0, 0], spine01: [-0.14, 0, 0], spine02: [-0.12, 0, 0], spine03: [-0.07, 0, 0] };
  const jobs: Array<[string, Record<string, number[]>, string[], Targets, Record<string, unknown>]> = [
    ['driver', POSES.driver, ['upperArmL', 'lowerArmL'],
      { handL: [0.167, 0.345, 0.433], handR: [-0.167, 0.345, 0.433] },
      { latLimit: 0.90, seatLat: 0.44 * S, mirror: true }],
    ['front', POSES.front, ['upperArmL', 'lowerArmL', 'upperArmR', 'lowerArmR'],
      { handL: [0.36, 0.09, 0.15], handR: [-0.16, -0.05, 0.40] },
      { latLimit: 0.90, seatLat: -0.44 * S }],
    ['rearSprawl', POSES.rearSprawl, ['upperArmL', 'lowerArmL', 'upperArmR', 'lowerArmR'],
      { handL: [0.17, -0.05, 0.38], handR: [-0.33, 0.13, -0.27] },
      { latLimit: 0.90, seatLat: 0.44 * S }],
    ['rearCamera', POSES.rearCamera, ['upperArmL', 'lowerArmL', 'upperArmR', 'lowerArmR'],
      { handL: [0.13, 0.44, 0.21], handR: [-0.10, 0.46, 0.23] },
      { latLimit: 0.90, seatLat: -0.44 * S }],
    ['rearSlouch', POSES.rearSlouch, ['upperArmL', 'lowerArmL', 'upperArmR', 'lowerArmR'],
      { handL: [-0.09, 0.26, 0.20], handR: [0.11, 0.22, 0.22] },
      { latLimit: 0.90, seatLat: -0.44 * S }],
    ['rideArms', ride, ['upperArmL', 'lowerArmL'],
      { handL: [-0.02, -0.30, 0.34], handR: [0.02, -0.30, 0.34] },
      { mirror: true, relTo: 'upperArm*' }],
    ['rideLegs', ride, ['thighL', 'shinL', 'footL'],
      { shinL: [0.42, -0.22, 0.24], footL: [0.45, -0.58, 0.05], toeL: [0.47, -0.65, 0.16],
        shinR: [-0.42, -0.22, 0.24], footR: [-0.45, -0.58, 0.05], toeR: [-0.47, -0.65, 0.16] },
      { mirror: true, reg: 0.02 }],
  ];
  for (const [name, base, free, targets, opts] of jobs) {
    const r = solve(base, free, targets, opts);
    console.log(`\n=== ${name}`);
    console.log(emit(r.pose, free));
    const P = fk(r.pose); const h = P.hips;
    for (const b in targets) {
      const t = targets[b];
      const o = opts.relTo ? P[String(opts.relTo).replace('*', b.endsWith('R') ? 'R' : 'L')] : h;
      const d = Math.hypot(P[b].x - o.x - t[0], P[b].y - o.y - t[1], P[b].z - o.z - t[2]);
      console.log(`    ${b} miss ${(d * 1000).toFixed(0)} mm  @ hips-rel ${(P[b].x - h.x).toFixed(3)},${(P[b].y - h.y).toFixed(3)},${(P[b].z - h.z).toFixed(3)}`);
    }
  }
}
