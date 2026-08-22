import * as THREE from 'three';
import { Frame } from '../../cinematics/CameraMove.ts';
import { worldMap } from '../../../world/map/WorldMap.ts';
import type {
  ActorId, PoseName, SceneCtx, ShotDef, StageFrame,
} from '../../cinematics/Scene.ts';
import type { LookTarget } from '../../cinematics/Stage.ts';
import type { EcoSite, SiteType } from '../../../world/props/EcoSites.ts';

/**
 * Shared staging vocabulary for the dialogue scenes.
 *
 * Every scene that is four people standing somewhere talking uses the same
 * three moves — build a frame at a place, arrange the four in a loose arc, cut
 * between a wide, a two-shot and a single — so those live here once instead of
 * five times.
 *
 * ### Anchoring
 * A scene never hard-codes a coordinate. It asks for the place by name and gets
 * whatever the world currently says that place is:
 *
 * | helper | source | example |
 * |---|---|---|
 * | {@link townAnchor} | `Town.anchors` | `'garageBay'`, `'caravan'`, `'pylon'` |
 * | {@link poiPoint} | `WorldMap` POI table | `'longwythe_peak'`, `'disc_overlook'` |
 * | {@link frameAt} `siteType` | `Props.ecology.sites` | `'regalia'`, `'layby'` |
 *
 * All three resolve live, every time the scene is staged, because coordinates
 * in this project go stale every time the terrain or the world size changes.
 */

/* ------------------------------------------------------------------------ */
/* Option bags                                                               */
/* ------------------------------------------------------------------------ */

/** Where {@link frameAt} anchors a scene, and which way it faces. */
export interface FrameOpts {
  /** An explicit anchor, from {@link townAnchor} or {@link poiPoint}. */
  origin?: THREE.Vector3;
  /** `[x, z]` used when neither the origin nor the named site resolves. */
  fallback?: number[];
  /** A world point to face, as `[x, z]` or a `Vector3`. */
  facing?: THREE.Vector3 | number[];
  /** `[forward, left]` metres to shift the finished frame by. */
  offset?: number[];
  /** Pin to a built surface (a graded pad, a deck) instead of the terrain. */
  floor?: number | null;
}

/** How {@link arrange} lays the four of them out. */
export interface ArrangeOpts {
  /** Multiplier on every slot offset. */
  spread?: number;
  /** Metres up-frame the whole arc sits. */
  at?: number;
  /** Per-actor `[forward, left]`, scene-local metres. */
  slots?: Partial<Record<ActorId, number[]>>;
  poses?: Partial<Record<ActorId, PoseName | null>>;
  /** Point everyone's gaze at one thing. */
  look?: LookTarget;
  /**
   * Metres to lift everyone off `Terrain.heightAt`, for the spots where the
   * sampler and the rendered surface disagree. Measured per scene.
   */
  lift?: number;
}

/** What every set-up builder takes: when it runs, and how it is shot. */
interface BaseShotOpts {
  t0: number;
  t1: number;
  fov?: number;
  handheld?: number;
  fStop?: number;
  focus?: number | 'auto' | ActorId;
  aim?: ActorId | ActorId[] | 'crew' | null;
  aimU?: number;
  /** Metres above the ground the look-at sits. */
  targetU?: number;
  /** Camera position, scene-local metres: up-frame, screen-left, above ground. */
  camF: number;
  camL: number;
  camU?: number;
}

/** @see single */
export interface SingleOpts extends BaseShotOpts {
  /** The subject, scene-local metres. */
  f: number;
  l: number;
  /** How far the lens creeps in over the take, as a fraction. */
  push?: number;
}

/** @see wide */
export interface WideOpts extends BaseShotOpts {
  /** The look-at, scene-local metres. Both default to the frame origin. */
  f?: number;
  l?: number;
  breathe?: number;
  /** Metres the camera drifts over the take. */
  driftF?: number;
  driftL?: number;
  driftU?: number;
  /** Metres the look-at drifts up-frame over the take. */
  targetDriftF?: number;
}

/** @see twoShot */
export interface TwoShotOpts extends BaseShotOpts {
  f: number;
  l: number;
  driftF?: number;
  driftL?: number;
}

/** @see ots */
export interface OtsOpts extends Omit<BaseShotOpts, 'camF' | 'camL'> {
  /** The near shoulder, scene-local metres. */
  nearF: number;
  nearL: number;
  /** The subject held clean, scene-local metres. */
  farF: number;
  farL: number;
  /** Metres up-frame of the near shoulder the camera sits. */
  back?: number;
  /** Metres past him, away from the subject. */
  side?: number;
  driftF?: number;
  driftL?: number;
}

/**
 * A named world-space anchor published by the town system — the garage bay, the
 * caravan, the pylon sign — ground truth for anything staged in Hammerhead.
 *
 * @param ctx cinematic context
 * @param [name] key in `Town.anchors`; omit for the town origin
 * @returns null when the town has not been built
 */
export function townAnchor(ctx: SceneCtx, name?: string): THREE.Vector3 | null {
  const town = ctx.game.get('Town');
  if (!town) return null;
  const a = name && town.anchors ? town.anchors[name] : null;
  if (a) return a.clone();
  return town.origin ? town.origin.clone() : null;
}

/**
 * A world point for a `WorldMap` point of interest, snapped to the terrain.
 *
 * POIs written as `at: 'n_hammerhead'` inherit their position from a road node,
 * so this is the only honest way to ask where one of them ended up.
 *
 * @param ctx cinematic context
 * @param id POI id, e.g. `'longwythe_peak'`
 */
export function poiPoint(ctx: SceneCtx, id: string): THREE.Vector3 | null {
  const p = worldMap.byId ? worldMap.byId.get(id) : null;
  if (!p) return null;
  const terrain = ctx.terrain || ctx.game.get('Terrain');
  const y = terrain && terrain.heightAt ? terrain.heightAt(p.x, p.z) : 0;
  return new THREE.Vector3(p.x, y, p.z);
}

/**
 * Borrow the Regalia for the length of a scene.
 *
 * There are two Regalias. `Props.regalia` is the static prop the world builds
 * at the roadside breakdown site; `Regalia` (the vehicle sim) builds a second,
 * drivable one and **leaves the prop hidden**, writing its own root transform
 * from `body.pos` every frame. A cutscene that moves `Props.regalia` therefore
 * moves an invisible object and stages its actors around nothing — which is
 * exactly what the opening did: four men pushing empty air while the real car
 * sat parked forty metres up the road.
 *
 * This shows the prop, hides the drivable one so there is never a duplicate in
 * shot, and returns the object the scene should position.
 * {@link releaseCar} puts both back.
 *
 * @param ctx cinematic context
 */
export function takeCar(ctx: SceneCtx): THREE.Object3D | null {
  const props = ctx.game.get('Props');
  const car = props && props.regalia;
  if (!car) return null;
  const sim = ctx.game.get('Regalia');
  const simRoot = sim && sim.root ? sim.root : null;
  const held = { car, pos: car.position.clone(), rot: car.rotation.clone(), visible: car.visible };
  // `simVisible` exists exactly when `sim` does -- see `CarHold`.
  ctx.data._car = simRoot
    ? { ...held, sim: simRoot, simVisible: simRoot.visible }
    : { ...held, sim: null, simVisible: null };
  car.visible = true;
  if (simRoot) simRoot.visible = false;
  return car;
}

/** Undo {@link takeCar}. Safe to call when it was never called. */
export function releaseCar(ctx: SceneCtx) {
  const s = ctx.data && ctx.data._car;
  if (!s) return;
  s.car.position.copy(s.pos);
  s.car.rotation.copy(s.rot);
  s.car.visible = s.visible;
  if (s.sim) s.sim.visible = s.simVisible;
  ctx.data._car = null;
}

/**
 * Point a car's nose up-frame. The hull's forward axis is local +X, so the yaw
 * that drives it along the scene axis is a quarter turn off the "face along +Z"
 * convention the actors use.
 *
 * @param [turn] extra yaw, radians (a quarter turn parks it broadside)
 */
export function aimCar(car: THREE.Object3D | null, F: StageFrame, turn: number = 0) {
  if (!car) return;
  const c = Math.cos(turn), s = Math.sin(turn);
  const fx = F.fwd.x * c - F.fwd.z * s;
  const fz = F.fwd.x * s + F.fwd.z * c;
  car.rotation.set(0, Math.atan2(-fz, fx), 0);
}

/**
 * A scene frame anchored on a place, facing whatever direction the scene wants
 * to look.
 *
 * The anchor resolves in order: an explicit `origin` (from {@link townAnchor}
 * or {@link poiPoint}), then the named Ecology site, then `fallback`. A scene
 * therefore degrades to something sane if the town has not been built or a POI
 * has been renamed, instead of staging itself at the world origin.
 *
 * @param ctx cinematic context
 * @param siteType Ecology site type, e.g. `'reststop'`
 * @param [opts] `{ origin:Vector3, fallback:[x,z], facing:[x,z]|Vector3, offset:[f,l] }`
 */
export function frameAt(ctx: SceneCtx, siteType: SiteType | null, opts: FrameOpts = {}): Frame {
  const { game, terrain } = ctx;
  const props = game.get('Props');
  const eco = props && props.ecology;
  const site: EcoSite | null = siteType && eco
    ? eco.sites.find((s: EcoSite) => s.type === siteType) || null
    : null;
  const fb = opts.fallback || [0, 0];
  const o = opts.origin
    ? new THREE.Vector3(opts.origin.x, 0, opts.origin.z)
    : new THREE.Vector3(site ? site.x : fb[0], 0, site ? site.z : fb[1]);
  // A frame with a floor keeps its origin *on* that floor, so `at()` and
  // `ground()` agree; otherwise anything placed with `at()` — a car, a look
  // target — resolves three metres under the tarmac.
  o.y = opts.floor ?? (terrain && terrain.heightAt ? terrain.heightAt(o.x, o.z) : 0);

  let fwd;
  if (opts.facing) {
    const [fx, fz] = Array.isArray(opts.facing)
      ? [opts.facing[0], opts.facing[1]]
      : [opts.facing.x, opts.facing.z];
    fwd = new THREE.Vector3(fx - o.x, 0, fz - o.z);
  } else if (eco && eco.roadTangent) {
    const t = eco.roadTangent(o.z, new THREE.Vector2());
    fwd = new THREE.Vector3(t.x, 0, t.y);
  } else {
    fwd = new THREE.Vector3(0, 0, 1);
  }
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1);
  const F = new Frame(o, fwd).setFloor(opts.floor ?? null);
  if (opts.offset) {
    const [f, l] = opts.offset;
    const p = F.vec(f, l, 0);
    p.y = opts.floor ?? (terrain && terrain.heightAt ? terrain.heightAt(p.x, p.z) : o.y);
    return new Frame(p, fwd).setFloor(opts.floor ?? null);
  }
  return F;
}

/**
 * The four in a loose conversational arc, all facing `f` metres up-frame.
 * Slots are deliberately uneven — a symmetric line-up is the surest way to make
 * four characters read as a menu screen.
 *
 * @param [opts] `{ spread, at, poses, look }`
 */
export function arrange(ctx: SceneCtx, F: StageFrame, opts: ArrangeOpts = {}) {
  const { stage, terrain } = ctx;
  const spread = opts.spread ?? 1.0;
  const at = opts.at ?? 0;
  const slots = opts.slots || {
    noctis: [0.35, 0.15],
    ignis: [-0.55, 1.42],
    gladio: [-0.30, -1.32],
    prompto: [-1.40, -0.55],
  };
  const poses = opts.poses || {};
  // `lift` compensates for spots where `Terrain.heightAt` disagrees with the
  // rendered surface — off the carriageway the displaced mesh can sit most of a
  // metre above the sampler, and a character placed on the sampled height then
  // has its foot IK fold its legs up to reach daylight, which reads as four men
  // sitting in the dirt. Measured per scene, from a screenshot.
  const lift = opts.lift ?? 0;
  // A frame pinned to a built surface has already answered "how high is the
  // ground here"; re-snapping to the terrain would drop the actor through it.
  const snap = lift === 0 && F.floor == null;
  for (const id of Object.keys(slots) as ActorId[]) {
    const slot = slots[id];
    if (!slot) continue;
    const [df, dl] = slot;
    stage.place(id, F.ground(terrain, at + df * spread, dl * spread, lift), F.yaw, snap);
    stage.walk(id, null, 0);
    stage.pose(id, poses[id] ?? null);
    if (opts.look) stage.look(id, opts.look);
  }
}

/**
 * A held single: camera at eye height, slightly off the actor's axis, drifting
 * in by a few centimetres over the length of the take.
 *
 * @param o `{ t0, t1, f, l, camF, camL, camU, fov, fStop, focus, targetU }`
 */
export function single(ctx: SceneCtx, F: StageFrame, o: SingleOpts): ShotDef {
  const terrain = ctx.game.get('Terrain');
  const G = (f: number, l: number, u: number) => F.ground(terrain, f, l, u);
  // Targets, like positions, resolve against the terrain: a look-at held above
  // the frame's flat origin plane drifts off the actors as the ground moves.
  const A = (f: number, l: number, u: number) => F.ground(terrain, f, l, u);
  const push = o.push ?? 0.35;
  return {
    t0: o.t0, t1: o.t1, fov: o.fov ?? 40, handheld: o.handheld ?? 0.5, breathe: 0.6,
    fStop: o.fStop ?? 2.4, focus: o.focus ?? 'auto', aim: o.aim || null, aimU: o.aimU ?? 1.52,
    keys: [
      { t: 0, pos: G(o.camF, o.camL, o.camU ?? 1.66), target: A(o.f, o.l, o.targetU ?? 1.6) },
      {
        t: o.t1 - o.t0, ease: 'outExpo',
        pos: G(o.camF + (o.f - o.camF) * push * 0.14, o.camL + (o.l - o.camL) * push * 0.14, (o.camU ?? 1.66) - 0.02),
        target: A(o.f, o.l, o.targetU ?? 1.6),
      },
    ],
  };
}

/**
 * A wide establishing set-up with a slow lateral drift, the shot that tells the
 * player where they are before anybody opens their mouth.
 */
export function wide(ctx: SceneCtx, F: StageFrame, o: WideOpts): ShotDef {
  const terrain = ctx.game.get('Terrain');
  const G = (f: number, l: number, u: number) => F.ground(terrain, f, l, u);
  // Targets, like positions, resolve against the terrain: a look-at held above
  // the frame's flat origin plane drifts off the actors as the ground moves.
  const A = (f: number, l: number, u: number) => F.ground(terrain, f, l, u);
  return {
    t0: o.t0, t1: o.t1, fov: o.fov ?? 46, handheld: o.handheld ?? 0.22, breathe: 1.0,
    fStop: o.fStop ?? 6.0, focus: o.focus ?? 'auto', aim: o.aim || null, aimU: o.aimU ?? 1.30,
    keys: [
      { t: 0, pos: G(o.camF, o.camL, o.camU ?? 2.4), target: A(o.f ?? 0, o.l ?? 0, o.targetU ?? 1.5) },
      {
        t: o.t1 - o.t0, ease: 'inOutSine',
        pos: G(o.camF + (o.driftF ?? 1.6), o.camL + (o.driftL ?? -1.2), (o.camU ?? 2.4) + (o.driftU ?? 0.35)),
        target: A((o.f ?? 0) + (o.targetDriftF ?? 0), o.l ?? 0, o.targetU ?? 1.5),
      },
    ],
  };
}

/** A two-shot: both actors in frame, camera outside the arc looking in. */
export function twoShot(ctx: SceneCtx, F: StageFrame, o: TwoShotOpts): ShotDef {
  const terrain = ctx.game.get('Terrain');
  const G = (f: number, l: number, u: number) => F.ground(terrain, f, l, u);
  // Targets, like positions, resolve against the terrain: a look-at held above
  // the frame's flat origin plane drifts off the actors as the ground moves.
  const A = (f: number, l: number, u: number) => F.ground(terrain, f, l, u);
  return {
    t0: o.t0, t1: o.t1, fov: o.fov ?? 44, handheld: o.handheld ?? 0.55, breathe: 0.7,
    fStop: o.fStop ?? 2.8, focus: o.focus ?? 'auto', aim: o.aim || null, aimU: o.aimU ?? 1.46,
    keys: [
      { t: 0, pos: G(o.camF, o.camL, o.camU ?? 1.62), target: A(o.f, o.l, o.targetU ?? 1.45) },
      {
        t: o.t1 - o.t0, ease: 'inOutSine',
        pos: G(o.camF + (o.driftF ?? -0.5), o.camL + (o.driftL ?? 0.35), (o.camU ?? 1.62) + 0.03),
        target: A(o.f, o.l, o.targetU ?? 1.45),
      },
    ],
  };
}

/**
 * A **dirty single**: the subject held clean in the middle of the frame with a
 * second actor's shoulder raking one edge, soft and dark. Television calls it
 * an over-the-shoulder; it is the shot that turns a line-up into a conversation.
 *
 * The camera is *derived* from the two actors, never authored: it sits `back`
 * metres up-frame of the near man and `side` metres laterally past him on the
 * side away from the subject, so the sightline to the subject clips the near
 * man's shoulder. Hand-placing that means re-tuning it every time a staging slot
 * moves twenty centimetres.
 *
 * Both actors face up-frame — this is a line-up, not two people squared off —
 * so `near` is whoever is closest to the lens, not whoever is talking.
 *
 * @param o `{ t0, t1, nearF, nearL, farF, farL, back, side, camU, fov }`
 */
export function ots(ctx: SceneCtx, F: StageFrame, o: OtsOpts): ShotDef {
  const terrain = ctx.game.get('Terrain');
  const G = (f: number, l: number, u: number) => F.ground(terrain, f, l, u);
  const back = o.back ?? 1.45;     // metres up-frame of the near shoulder
  const side = o.side ?? 0.95;     // metres past him, away from the subject
  const away = Math.sign(o.nearL - o.farL) || 1;
  const camF = o.nearF + back;
  const camL = o.nearL + away * side;
  const camU = o.camU ?? 1.62;
  // Focus is given in metres rather than by name: at f/2.2 the near shoulder is
  // inside the circle of confusion of anything focused by actor id, and the
  // wrong man ends up sharp.
  const dist = Math.hypot(camF - o.farF, camL - o.farL);
  return {
    t0: o.t0, t1: o.t1, fov: o.fov ?? 38, handheld: o.handheld ?? 0.6, breathe: 0.55,
    fStop: o.fStop ?? 2.4, focus: o.focus ?? dist, aim: o.aim || null, aimU: o.aimU ?? 1.50,
    keys: [
      { t: 0, pos: G(camF, camL, camU), target: G(o.farF, o.farL, o.targetU ?? 1.52) },
      {
        t: o.t1 - o.t0, ease: 'inOutSine',
        pos: G(camF + (o.driftF ?? -0.24), camL + (o.driftL ?? 0.14), camU + 0.025),
        target: G(o.farF, o.farL, o.targetU ?? 1.52),
      },
    ],
  };
}

/**
 * A low set-up that puts heads against sky instead of against ground: camera
 * near knee height, target above eye line. The cheapest way to make four people
 * standing in a field read as a composition rather than an inventory.
 *
 * @param o same keys as {@link wide}
 */
export function lowAngle(ctx: SceneCtx, F: StageFrame, o: WideOpts): ShotDef {
  return wide(ctx, F, {
    camU: 0.52, targetU: 1.86, fov: 34, fStop: 5.0, handheld: 0.3,
    driftU: 0.16, ...o,
  });
}

/** Point every actor's gaze at one of them (or at a world point). */
export function attend(ctx: SceneCtx, target: ActorId, except: ActorId[] = []) {
  for (const id of ctx.stage.ids) {
    if (except.includes(id) || id === target) continue;
    ctx.stage.look(id, target);
  }
}
