import * as THREE from 'three';
import type { SkinWeights } from './Geo.ts';

/**
 * Humanoid skeleton generator.
 *
 * 34 bones, built in a relaxed A-pose with *identity* bind rotations: every
 * bone's local frame is world-aligned at bind time, so posing code can think in
 * plain anatomical terms (rotate X to swing a limb forward, Z to abduct, Y to
 * twist) without carrying joint-orientation matrices around.
 *
 * The character faces +Z. Its right-hand side is -X.
 */

/**
 * A character's body proportions, as an author writes them in `Cast.ts` /
 * `NpcCast.ts`. Every field has a default, so an author writes only what
 * differs from the reference build.
 */
export interface BodyProfileSpec {
  /** Standing height in metres. */
  height?: number;
  /** Biacromial (shoulder) width multiplier. */
  shoulder?: number;
  /** 0 lean .. 1 heavy — drives limb and torso girth. */
  muscle?: number;
  hip?: number;
  neck?: number;
  headScale?: number;
  armScale?: number;
  legScale?: number;
}

/** A `BodyProfileSpec` with every default filled in. */
export type BodyProfile = Required<BodyProfileSpec>;

/** The two sides of the rig. The character faces +Z, so its right is −X. */
export type Side = 'L' | 'R';

/** Both sides, for the many builders that mirror their work. */
export const SIDES: readonly Side[] = ['L', 'R'];

/**
 * Derived dimensions the mesh builders author against. Everything here is in
 * world bind space, already scaled by `height`.
 */
export interface RigDims {
  /** height / 1.80 — the uniform scale every authored constant is in. */
  s: number;
  height: number;
  shoulderY: number;
  hipY: number;
  kneeY: number;
  ankleY: number;
  headOrigin: THREE.Vector3;
  headScale: number;
  chinY: number;
  headTopY: number;
  eyeY: number;
  eyeZ: number;
  shoulderX: number;
  armLen: number;
}

/** What `buildSkeleton` hands to every geometry and animation builder. */
export interface Rig {
  bones: THREE.Bone[];
  /** bone name -> index into `bones`, i.e. into the skin-index attribute. */
  index: Record<string, number>;
  byName: Record<string, THREE.Bone>;
  root: THREE.Bone;
  skeleton: THREE.Skeleton;
  /** Bind-pose world positions, for geometry authoring. */
  P: Record<string, THREE.Vector3>;
  profile: BodyProfile;
  dims: RigDims;
}

export const DEFAULT_PROFILE: BodyProfile = {
  height: 1.80,
  shoulder: 1.0,     // biacromial width multiplier
  muscle: 0.35,      // 0 lean .. 1 heavy — drives limb/torso girth
  hip: 1.0,
  neck: 1.0,
  headScale: 1.0,
  armScale: 1.0,
  legScale: 1.0,
};

/**
 * @param profile see DEFAULT_PROFILE
 */
export function buildSkeleton(profile: BodyProfileSpec = {}): Rig {
  const p = { ...DEFAULT_PROFILE, ...profile };
  const s = p.height / 1.80;
  const sw = p.shoulder;

  // --- bind-pose world positions -----------------------------------------
  const Y = (v: number) => v * s;
  const shoulderY = Y(1.425);
  const shX = 0.178 * s * sw;

  // A-pose arm chain: down, 11° out, a touch forward, slight elbow break
  const armDir = (deg: number, fwd: number) => {
    const r = (deg * Math.PI) / 180;
    return [Math.sin(r), -Math.cos(r), fwd];
  };
  const ua = 0.305 * s * p.armScale, la = 0.265 * s * p.armScale, hd = 0.085 * s;
  const d1 = armDir(8, 0.055), d2 = armDir(6, 0.10), d3 = armDir(5, 0.10);
  const n1 = Math.hypot(...d1), n2 = Math.hypot(...d2), n3 = Math.hypot(...d3);
  const elbow = [shX + (d1[0] / n1) * ua, shoulderY + (d1[1] / n1) * ua, (d1[2] / n1) * ua + 0.01 * s];
  const wrist = [elbow[0] + (d2[0] / n2) * la, elbow[1] + (d2[1] / n2) * la, elbow[2] + (d2[2] / n2) * la];
  const twist = [(elbow[0] + wrist[0]) / 2, (elbow[1] + wrist[1]) / 2, (elbow[2] + wrist[2]) / 2];
  const knuck = [wrist[0] + (d3[0] / n3) * hd, wrist[1] + (d3[1] / n3) * hd, wrist[2] + (d3[2] / n3) * hd];
  const ftip = [knuck[0] + (d3[0] / n3) * hd * 0.85, knuck[1] + (d3[1] / n3) * hd * 0.85, knuck[2] + (d3[2] / n3) * hd * 0.85];
  const thumb = [wrist[0] - 0.012 * s, wrist[1] - 0.035 * s, wrist[2] + 0.038 * s];

  const hipX = 0.093 * s * p.hip;
  const legS = p.legScale;
  const hipY = Y(0.925);
  const kneeY = Y(0.925) - 0.433 * s * legS;
  const ankY = kneeY - 0.404 * s * legS;

  // head placement — the face builder authors in a canonical skull space whose
  // origin is derived here so eye and lid bones land on the sculpted features
  // (these offsets mirror FACE.eye / HR in Face.ts — keep them in step)
  const hs = p.headScale;
  const headOrigin = [0, Y(1.578) + 0.0900 * s * hs, 0.004 * s * hs];
  const eyeY = headOrigin[1] - 0.006 * s * hs;
  const eyeZ = headOrigin[2] + 0.0646 * s * hs;

  const defs: [string, string | null, number[]][] = [
    ['hips', null, [0, Y(0.985), -0.005 * s]],
    ['spine01', 'hips', [0, Y(1.085), 0.008 * s]],
    ['spine02', 'spine01', [0, Y(1.19), 0.014 * s]],
    ['spine03', 'spine02', [0, Y(1.315), 0.002 * s]],
    ['neck', 'spine03', [0, Y(1.462), -0.014 * s]],
    ['head', 'neck', [0, Y(1.578), 0.006 * s]],
    ['headEnd', 'head', [0, Y(1.73), 0.012 * s]],
    ['jaw', 'head', [0, Y(1.566), 0.022 * s]],
    ['eyeL', 'head', [0.0325 * hs * s, eyeY, eyeZ]],
    ['eyeR', 'head', [-0.0325 * hs * s, eyeY, eyeZ]],
    ['lidL', 'head', [0.0325 * hs * s, eyeY, eyeZ]],
    ['lidR', 'head', [-0.0325 * hs * s, eyeY, eyeZ]],
    // spring-driven bones for hair tails and coat skirts (no FK animation)
    ['tail', 'head', [0, headOrigin[1] - 0.02 * s, headOrigin[2] - 0.088 * s]],
    ['coatL', 'hips', [0.085 * s, Y(0.965), -0.045 * s]],
    ['coatR', 'hips', [-0.085 * s, Y(0.965), -0.045 * s]],
    ['coatF', 'hips', [0, Y(0.965), 0.075 * s]],
  ];

  for (const side of ['L', 'R']) {
    const m = side === 'L' ? 1 : -1;
    const mx = (a: number[]) => [a[0] * m, a[1], a[2]];
    defs.push(
      [`clavicle${side}`, 'spine03', mx([0.038 * s * sw, Y(1.432), 0.024 * s])],
      [`upperArm${side}`, `clavicle${side}`, mx([shX, shoulderY, 0.004 * s])],
      [`lowerArm${side}`, `upperArm${side}`, mx(elbow)],
      [`twist${side}`, `lowerArm${side}`, mx(twist)],
      [`hand${side}`, `lowerArm${side}`, mx(wrist)],
      [`fingers${side}`, `hand${side}`, mx(knuck)],
      [`fingerTip${side}`, `fingers${side}`, mx(ftip)],
      [`thumb${side}`, `hand${side}`, mx(thumb)],
      [`thigh${side}`, 'hips', mx([hipX, hipY, 0.004 * s])],
      [`shin${side}`, `thigh${side}`, mx([hipX * 1.04, kneeY, 0.014 * s])],
      [`foot${side}`, `shin${side}`, mx([hipX * 1.06, ankY, -0.022 * s])],
      [`toe${side}`, `foot${side}`, mx([hipX * 1.06, ankY * 0.36, 0.105 * s])]
    );
  }

  const byName: Record<string, THREE.Bone> = {};
  const bones: THREE.Bone[] = [];
  const index: Record<string, number> = {};
  /** Bind-pose world positions, for geometry authoring. */
  const P: Record<string, THREE.Vector3> = {};
  for (const [name, parent, wpos] of defs) {
    const b = new THREE.Bone();
    b.name = name;
    P[name] = new THREE.Vector3().fromArray(wpos);
    if (parent) {
      byName[parent].add(b);
      b.position.copy(P[name]).sub(P[parent]);
    } else {
      b.position.copy(P[name]);
    }
    byName[name] = b;
    index[name] = bones.length;
    bones.push(b);
  }

  const root = byName.hips;
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);

  // handy derived dimensions for the mesh builders
  const dims = {
    s,
    height: p.height,
    shoulderY,
    hipY,
    kneeY,
    ankleY: ankY,
    headOrigin: new THREE.Vector3().fromArray(headOrigin),
    headScale: s * hs,
    chinY: headOrigin[1] - 0.126 * s * hs,
    headTopY: headOrigin[1] + 0.116 * s * hs,
    eyeY,
    eyeZ,
    shoulderX: shX,
    armLen: ua + la,
  };

  return { bones, index, byName, root, skeleton, P, profile: p, dims };
}

/**
 * Convenience: skin-weight pair list from alternating bone name and weight —
 * `W(rig.index, 'hips', 0.7, 'spine01', 0.3)`.
 */
export function W(index: Record<string, number>, ...pairs: Array<string | number>): SkinWeights {
  const out: SkinWeights = [];
  // property access coerces the key to a string at runtime anyway, so String()
  // is exactly what the untyped version did — it is not a widening
  for (let i = 0; i < pairs.length; i += 2) out.push([index[String(pairs[i])], Number(pairs[i + 1])]);
  return out;
}
