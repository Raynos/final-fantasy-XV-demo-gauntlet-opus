import * as THREE from 'three';
import { Rng } from '../../util/Rng.ts';
import type { Game } from '../../game/Game.ts';
import type { Character } from '../../characters/rig/Character.ts';
import type { Player } from '../../characters/Player.ts';
import type { Party } from '../../characters/Party.ts';
import type { Ground } from '../Terrain.ts';

/**
 * Four men in a car.
 *
 * The party rigs are procedural and driven by a locomotion animator, so
 * "sitting down" is a matter of letting that animator run — breathing, blinks,
 * head and eye tracking, hair and coat springs all still want to happen — and
 * then overwriting the bones that a seat actually changes: pelvis, legs, spine
 * lean and arms. Everything above the collarbones is left alone, which is why
 * they still glance around at each other and out at the scenery.
 *
 * Nothing here reparents anybody. `Player` and `Party` keep their roots as
 * direct children of the scene (so `player.position` remains a true world
 * position for combat, the HUD and the map); this module simply writes the
 * seat's world transform onto those roots in `lateUpdate`, after both systems
 * have had their turn. On exit it puts them back on their feet and hands the
 * roots back untouched.
 *
 * The two systems are neutralised, not disabled: `Party` gets a per-member
 * `speedMul` of zero so nobody tries to jog after a moving car, and both get a
 * stub terrain whose ground is a kilometre down, which turns the foot IK into
 * a no-op instead of planting boots on the road at 100 km/h.
 */

/** Ground a kilometre below the world: makes `footIK` do nothing at all. */
const NO_GROUND = {
  heightAt: () => -1000,
  normalAt: (_x: number, _z: number, out?: THREE.Vector3) => (out || new THREE.Vector3()).set(0, 1, 0),
};

const SCALE = 1.14;              // the Regalia body scale, from Regalia.ts
const WHEEL_R = 0.4765;

/**
 * Seat anchors, authored in the car mesh's own frame (+X forward, +Y up,
 * +Z toward the car's left) and converted to the chassis frame below.
 */
const SEATS = [
  { id: 'driver', mx: -0.40, mz: 0.44, my: 0.925 },
  { id: 'front', mx: -0.40, mz: -0.44, my: 0.925 },
  { id: 'rearL', mx: -1.24, mz: 0.44, my: 0.925 },
  { id: 'rearR', mx: -1.24, mz: -0.44, my: 0.925 },
];

/**
 * Seated poses. XYZ Euler radians per bone, in the same convention the
 * animator uses (negative X on a thigh swings the leg forward).
 */
const BASE_SIT = {
  hips: [0.06, 0, 0],
  spine01: [-0.05, 0, 0], spine02: [-0.06, 0, 0], spine03: [-0.04, 0, 0],
  thighL: [-1.36, 0.10, 0.13], thighR: [-1.36, -0.10, -0.13],
  shinL: [1.18, 0, 0], shinR: [1.18, 0, 0],
  footL: [0.16, 0, 0], footR: [0.16, 0, 0],
  toeL: [0, 0, 0], toeR: [0, 0, 0],
};

/** Hands on the wheel: elbows out, forearms up, wrists rolled over the rim. */
const POSE_DRIVER = {
  ...BASE_SIT,
  spine01: [-0.10, 0, 0], spine02: [-0.10, 0, 0], spine03: [-0.06, 0, 0],
  clavicleL: [-0.10, 0, -0.06], clavicleR: [-0.10, 0, 0.06],
  upperArmL: [-1.02, 0.30, 0.60], lowerArmL: [-0.72, 0.22, 0.12], handL: [0.10, 0, 0.55],
  upperArmR: [-1.02, -0.30, -0.60], lowerArmR: [-0.72, -0.22, -0.12], handR: [0.10, 0, -0.55],
  fingersL: [-0.85, 0, 0], fingersR: [-0.85, 0, 0],
  thumbL: [-0.4, 0, 0], thumbR: [-0.4, 0, 0],
};

/** Riding shotgun: one elbow on the sill, the other hand on a knee. */
const POSE_FRONT = {
  ...BASE_SIT,
  spine03: [-0.02, -0.10, 0],
  clavicleL: [-0.04, 0, -0.02], clavicleR: [-0.12, 0, 0.10],
  upperArmL: [-0.42, 0.16, 0.34], lowerArmL: [-0.95, 0.30, 0.10], handL: [0.2, 0, 0.3],
  upperArmR: [-0.30, -0.34, -0.72], lowerArmR: [-0.55, -0.20, -0.10], handR: [0.1, 0, -0.2],
  fingersL: [-0.5, 0, 0], fingersR: [-0.35, 0, 0],
};

/**
 * Back seat, one arm along the bench top and the other on a knee — Gladio.
 * The upper arms go *back and slightly out*, and the elbows do the work; an
 * arm rotated out on Z alone gives a scarecrow, not a man taking up room.
 */
const POSE_REAR_SPRAWL = {
  ...BASE_SIT,
  hips: [0.10, 0, 0],
  spine01: [0.05, 0, 0], spine02: [0.05, 0, 0], spine03: [0.03, -0.06, 0],
  thighL: [-1.30, 0.16, 0.22], thighR: [-1.30, -0.16, -0.22],
  clavicleL: [-0.12, 0, -0.08], clavicleR: [-0.12, 0, 0.08],
  upperArmL: [0.55, 0.20, 0.46], lowerArmL: [-1.55, 0.75, 0.25],
  upperArmR: [0.55, -0.20, -0.46], lowerArmR: [-1.55, -0.75, -0.25],
  handL: [0, 0, 0.15], handR: [0, 0, -0.15],
  fingersL: [-0.35, 0, 0], fingersR: [-0.35, 0, 0],
};

/** Back seat, camera to the eye — Prompto, permanently mid-shot. */
const POSE_REAR_CAMERA = {
  ...BASE_SIT,
  spine02: [-0.12, 0.05, 0], spine03: [-0.12, 0.08, 0],
  clavicleL: [-0.20, 0, -0.12], clavicleR: [-0.20, 0, 0.12],
  upperArmL: [-1.05, 0.20, 0.30], lowerArmL: [-1.85, 0.55, 0.10], handL: [0.25, 0, 0.30],
  upperArmR: [-1.05, -0.20, -0.30], lowerArmR: [-1.85, -0.55, -0.10], handR: [0.25, 0, -0.30],
  fingersL: [-1.05, 0, 0], fingersR: [-1.05, 0, 0],
};

/** Back seat, arms folded, slouched — Noctis riding along. */
const POSE_REAR_SLOUCH = {
  ...BASE_SIT,
  hips: [0.14, 0, 0],
  spine01: [0.06, 0, 0], spine02: [0.06, 0, 0], spine03: [0.02, 0, 0],
  upperArmL: [-0.55, 0.30, 0.60], lowerArmL: [-1.55, 0.55, 0.25], handL: [0.2, 0, 0.3],
  upperArmR: [-0.55, -0.30, -0.60], lowerArmR: [-1.55, -0.55, -0.25], handR: [0.2, 0, -0.3],
  fingersL: [-0.6, 0, 0], fingersR: [-0.6, 0, 0],
};

const POSES = {
  driver: POSE_DRIVER,
  front: POSE_FRONT,
  rearSprawl: POSE_REAR_SPRAWL,
  rearCamera: POSE_REAR_CAMERA,
  rearSlouch: POSE_REAR_SLOUCH,
};

const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _up = new THREE.Vector3();

/**
 * One authored seated pose: bone name -> `[x, y, z]` euler, YXZ. Everything
 * above the collarbones is deliberately absent, so the animator keeps it.
 */
export type SeatPose = Record<string, number[]>;

/** One person in the car, and where they are sitting. */
export interface Rider {
  key: string;
  char: Character;
  /** Their scene root, which this module writes the seat transform onto. */
  root: THREE.Object3D;
  /** `SEATS` id. */
  seat: string;
  pose: SeatPose;
  /** This rig's own hip height, so a tall man does not sit on the boot lid. */
  hipY: number;
}

/**
 * What `Player` and `Party` were doing before everyone got in, so `exit` can
 * hand them back untouched. `terrain` is whatever those systems were carrying.
 */
interface SavedWalkers {
  playerTerrain: Ground | undefined;
  partyTerrain: Ground | undefined;
  speedMul: number[];
}

/** How the car is moving, as the seated poses read it. */
export interface OccupantCtx {
  /** m/s. */
  speed: number;
  /** Lateral acceleration, m/s^2. Everyone leans against it. */
  lateralG: number;
  /** Longitudinal acceleration, m/s^2. */
  longG: number;
  /** 0..1 how far the car is sideways. */
  slide: number;
  /** 0..1 surface roughness; shakes the whole cabin. */
  rough: number;
  /** -1..1 steering, so the driver's arms follow the wheel. */
  steer?: number;
  /** True when Ignis has it. */
  auto: boolean;
}

export class Occupants {
  _gaze!: THREE.Vector3[];
  _saved!: SavedWalkers | null;
  _t!: number;
  anchors!: Record<string, THREE.Object3D>;
  game!: Game;
  party!: Party | null;
  player!: Player | null;
  riders!: Rider[];
  rng!: Rng;
  seated!: boolean;
  tilt!: THREE.Object3D;
  /**
   * @param tilt the chassis node the seats hang off
   */
  constructor(tilt: THREE.Object3D) {
    this.tilt = tilt;
    this.seated = false;
    this.anchors = {};
    this.rng = new Rng(60613);
    this._t = 0;
    // one gaze target per rider, reused — `setLookTarget` only stores the
    // reference, so a fresh Vector3 a frame would be pure garbage
    this._gaze = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    this.riders = [];

    for (const s of SEATS) {
      const o = new THREE.Object3D();
      // mesh frame -> chassis frame: +X forward becomes +Z, +Z left becomes -X
      o.position.set(-s.mz * SCALE, s.my * SCALE - WHEEL_R, s.mx * SCALE);
      o.name = `seat_${s.id}`;
      tilt.add(o);
      this.anchors[s.id] = o;
    }
  }

  /** Wire up to Player and Party. Safe to call once at init. */
  attach(game: Game) {
    this.game = game;
    this.player = game.get('Player') ?? null;
    this.party = game.get('Party') ?? null;
  }

  /**
   * Put everyone in the car.
   * @param playerDrives true if Noctis has the wheel
   */
  enter(playerDrives: boolean) {
    const p = this.player, party = this.party;
    if (!p || !party) return;
    this.riders.length = 0;

    const gladio = party.get('gladio');
    const ignis = party.get('ignis');
    const prompto = party.get('prompto');

    const push = (key: string, char: Character | null | undefined, root: THREE.Object3D | null | undefined, seat: string, pose: keyof typeof POSES) => {
      if (!char || !root) return;
      // A character root is at the soles; the seat anchor is at the top of the
      // squab. The offset between them is that rig's own hip height — and it
      // differs by 14 cm between Gladio and Prompto, so it has to be per
      // rider or the tall one ends up sitting on the boot lid.
      this.riders.push({
        key, char, root, seat, pose: POSES[pose],
        hipY: char.rig && char.rig.P && char.rig.P.hips ? char.rig.P.hips.y : 0.98,
      });
    };

    if (playerDrives) {
      push('noctis', p.character, p.root, 'driver', 'driver');
      push('ignis', ignis && ignis.character, ignis && ignis.root, 'front', 'front');
    } else {
      push('ignis', ignis && ignis.character, ignis && ignis.root, 'driver', 'driver');
      push('noctis', p.character, p.root, 'front', 'front');
    }
    push('gladio', gladio && gladio.character, gladio && gladio.root, 'rearL', 'rearSprawl');
    push('prompto', prompto && prompto.character, prompto && prompto.root, 'rearR', 'rearCamera');

    // Neutralise the walkers: no ground for the foot IK to find, no reason for
    // the party to chase a car they are already sitting in.
    if (!this._saved) {
      this._saved = {
        playerTerrain: p.terrain,
        partyTerrain: party.terrain,
        speedMul: party.members.map((m) => m.speedMul),
      };
    }
    p.terrain = NO_GROUND;
    party.terrain = NO_GROUND;
    for (const m of party.members) m.speedMul = 0;
    for (const r of this.riders) if (r.char.groundShadow) r.char.groundShadow.visible = false;

    this.seated = true;
  }

  /** Put everyone back on their feet beside the car. */
  exit(worldPos: THREE.Vector3, heading: number) {
    const p = this.player, party = this.party;
    if (!p || !party || !this._saved) { this.seated = false; return; }
    p.terrain = this._saved.playerTerrain;
    party.terrain = this._saved.partyTerrain;
    const saved = this._saved;
    party.members.forEach((m, i) => { m.speedMul = saved.speedMul[i] ?? 1; });
    this._saved = null;

    const terrain = p.terrain;
    // step out onto the left of the car, spread around it
    const spots = [[-2.6, 0.4], [-2.6, -1.4], [2.6, 0.2], [2.6, -1.6]];
    const cos = Math.cos(heading), sin = Math.sin(heading);
    for (let i = 0; i < this.riders.length; i++) {
      const r = this.riders[i];
      const [ox, oz] = spots[i % spots.length];
      const x = worldPos.x + ox * cos + oz * sin;
      const z = worldPos.z - ox * sin + oz * cos;
      r.root.position.set(x, terrain ? terrain.heightAt(x, z) : worldPos.y, z);
      r.root.rotation.set(0, heading + (ox > 0 ? -1.2 : 1.2), 0);
      r.root.quaternion.setFromEuler(r.root.rotation);
      if (r.char.groundShadow) r.char.groundShadow.visible = true;
      r.char.setLookTarget(null);
    }
    if (p) { p.velocity.set(0, 0, 0); p.speed = 0; p.heading = heading; }
    this.riders.length = 0;
    this.seated = false;
  }

  /**
   * Write the seat transforms and the seated poses. Runs in `lateUpdate`, so
   * it always has the last word over Player and Party.
   *
   * @param ctx { speed, lateralG, longG, slide, rough, night, auto }
   */
  update(dt: number, ctx: OccupantCtx) {
    if (!this.seated) return;
    this._t += dt;
    this.tilt.updateMatrixWorld(true);

    // A shared body sway: everyone leans the same way against the same corner,
    // which is most of what makes four seated figures read as passengers in one
    // moving object rather than four statues bolted to a mesh.
    const leanZ = clamp(-ctx.lateralG * 0.055, -0.16, 0.16);
    const leanX = clamp(ctx.longG * 0.035, -0.10, 0.10);
    const jog = ctx.rough * Math.min(1, ctx.speed / 12);

    for (let i = 0; i < this.riders.length; i++) {
      const r = this.riders[i];
      const a = this.anchors[r.seat];
      a.getWorldPosition(_v);
      a.getWorldQuaternion(_q);
      _up.set(0, 1, 0).applyQuaternion(_q);
      r.root.position.copy(_v).addScaledVector(_up, -r.hipY);
      r.root.quaternion.copy(_q);
      // the animator writes rotation.y directly; keep the Euler in sync so a
      // later read of it is not a lie
      r.root.rotation.setFromQuaternion(_q, 'YXZ');

      this._applyPose(r, i, leanX, leanZ, jog, ctx);
      r.root.updateMatrixWorld(true);
    }
  }

  /** Overwrite the seated bones on top of whatever the animator produced. */
  _applyPose(r: Rider, i: number, leanX: number, leanZ: number, jog: number, ctx: OccupantCtx) {
    const bones = r.char.rig.byName;
    const pose = r.pose;
    const t = this._t + i * 1.7;
    // per-rider fidget, so nobody is a mannequin
    const fx = Math.sin(t * 0.63 + i) * 0.016 + Math.sin(t * 1.9 + i * 2.1) * 0.004;
    const fz = Math.sin(t * 0.41 + i * 1.3) * 0.020;
    const bump = jog > 0.01 ? Math.sin(this._t * 34 + i * 1.1) * 0.012 * jog : 0;

    for (const name in pose) {
      const b = bones[name];
      if (!b) continue;
      const e = pose[name];
      let x = e[0], y = e[1], z = e[2];
      if (name === 'hips') { x += leanX + fx + bump; z += leanZ + fz; }
      else if (name === 'spine01' || name === 'spine02') { x += leanX * 0.5 + fx * 0.6; z += leanZ * 0.7; }
      else if (name === 'spine03') { x += leanX * 0.4; z += leanZ * 0.8; }
      _e.set(x, y, z, 'YXZ');
      b.quaternion.setFromEuler(_e);
    }
    // The driver's arms follow the wheel. It is a small movement and it is the
    // single clearest signal that the person in the seat is the one steering.
    if (r.seat === 'driver' && ctx.steer != null) {
      const s = clamp(ctx.steer, -1, 1);
      const uL = bones.upperArmL, uR = bones.upperArmR;
      const lL = bones.lowerArmL, lR = bones.lowerArmR;
      if (uL && uR && lL && lR) {
        const p = pose.upperArmL, q = pose.upperArmR;
        _e.set(p[0] - s * 0.30, p[1], p[2] - s * 0.10, 'YXZ'); uL.quaternion.setFromEuler(_e);
        _e.set(q[0] + s * 0.30, q[1], q[2] - s * 0.10, 'YXZ'); uR.quaternion.setFromEuler(_e);
        const pl = pose.lowerArmL, ql = pose.lowerArmR;
        _e.set(pl[0] + s * 0.22, pl[1], pl[2], 'YXZ'); lL.quaternion.setFromEuler(_e);
        _e.set(ql[0] - s * 0.22, ql[1], ql[2], 'YXZ'); lR.quaternion.setFromEuler(_e);
      }
    }
    // the pelvis must sit where the seat is, not where a walk cycle wants it
    const hips = bones.hips;
    if (hips) {
      const P = r.char.rig.P.hips;
      hips.position.set(P.x, P.y, P.z);
    }
  }

  /**
   * Give everyone something to look at: the road ahead, each other, or the
   * landmark going past. Cheap — it only sets a target the animator reads.
   * @param ahead a point out in front of the car
   * @param interest optional landmark
   */
  gaze(ahead: THREE.Vector3, interest: THREE.Vector3 | null) {
    if (!this.seated) return;
    for (let i = 0; i < this.riders.length; i++) {
      const r = this.riders[i];
      if (r.seat === 'driver') { r.char.setLookTarget(ahead); continue; }
      // everyone else drifts between the road, the view and the man next to them
      const phase = (this._t * 0.13 + i * 0.37) % 1;
      if (interest && phase < 0.42) r.char.setLookTarget(interest);
      else if (phase < 0.72) r.char.setLookTarget(ahead);
      else {
        const other = this.riders[(i + 1) % this.riders.length];
        const g = this._gaze[i];
        other.root.getWorldPosition(g);
        g.y += 1.5;
        r.char.setLookTarget(g);
      }
    }
  }
}

function clamp(v: number, a: number, b: number) { return v < a ? a : v > b ? b : v; }
