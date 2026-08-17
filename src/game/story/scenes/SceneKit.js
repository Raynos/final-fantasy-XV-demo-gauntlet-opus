import * as THREE from 'three';
import { Frame } from '../../cinematics/CameraMove.js';

/**
 * Shared staging vocabulary for the dialogue scenes.
 *
 * Every scene that is four people standing somewhere talking uses the same
 * three moves — build a frame at a place, arrange the four in a loose arc, cut
 * between a wide, a two-shot and a single — so those live here once instead of
 * five times.
 */

/**
 * A scene frame anchored on an Ecology site (or a fallback world point),
 * facing whatever direction the scene wants to look.
 *
 * @param {object} ctx cinematic context
 * @param {string} siteType Ecology site type, e.g. `'reststop'`
 * @param {object} [opts] `{ fallback:[x,z], facing:[x,z], offset:[f,l] }`
 * @returns {Frame}
 */
export function frameAt(ctx, siteType, opts = {}) {
  const { game, terrain } = ctx;
  const props = game.get('Props');
  const eco = props && props.ecology;
  const site = eco && eco.sites.find((s) => s.type === siteType);
  const fb = opts.fallback || [0, 0];
  const o = new THREE.Vector3(site ? site.x : fb[0], 0, site ? site.z : fb[1]);
  o.y = terrain && terrain.heightAt ? terrain.heightAt(o.x, o.z) : 0;

  let fwd;
  if (opts.facing) {
    fwd = new THREE.Vector3(opts.facing[0] - o.x, 0, opts.facing[1] - o.z);
  } else if (eco && eco.roadTangent) {
    const t = eco.roadTangent(o.z, new THREE.Vector2());
    fwd = new THREE.Vector3(t.x, 0, t.y);
  } else {
    fwd = new THREE.Vector3(0, 0, 1);
  }
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1);
  const F = new Frame(o, fwd);
  if (opts.offset) {
    const [f, l] = opts.offset;
    const p = F.vec(f, l, 0);
    p.y = terrain && terrain.heightAt ? terrain.heightAt(p.x, p.z) : o.y;
    return new Frame(p, fwd);
  }
  return F;
}

/**
 * The four in a loose conversational arc, all facing `f` metres up-frame.
 * Slots are deliberately uneven — a symmetric line-up is the surest way to make
 * four characters read as a menu screen.
 *
 * @param {object} ctx
 * @param {Frame} F
 * @param {object} [opts] `{ spread, at, poses, look }`
 */
export function arrange(ctx, F, opts = {}) {
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
  for (const id of Object.keys(slots)) {
    const [df, dl] = slots[id];
    stage.place(id, F.ground(terrain, at + df * spread, dl * spread, lift), F.yaw, lift === 0);
    stage.walk(id, null, 0);
    stage.pose(id, poses[id] ?? null);
    if (opts.look) stage.look(id, opts.look);
  }
}

/**
 * A held single: camera at eye height, slightly off the actor's axis, drifting
 * in by a few centimetres over the length of the take.
 *
 * @param {object} ctx
 * @param {Frame} F
 * @param {object} o `{ t0, t1, f, l, camF, camL, camU, fov, fStop, focus, targetU }`
 */
export function single(ctx, F, o) {
  const terrain = ctx.game.get('Terrain');
  const G = (f, l, u) => F.ground(terrain, f, l, u);
  // Targets, like positions, resolve against the terrain: a look-at held above
  // the frame's flat origin plane drifts off the actors as the ground moves.
  const A = (f, l, u) => F.ground(terrain, f, l, u);
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
export function wide(ctx, F, o) {
  const terrain = ctx.game.get('Terrain');
  const G = (f, l, u) => F.ground(terrain, f, l, u);
  // Targets, like positions, resolve against the terrain: a look-at held above
  // the frame's flat origin plane drifts off the actors as the ground moves.
  const A = (f, l, u) => F.ground(terrain, f, l, u);
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
export function twoShot(ctx, F, o) {
  const terrain = ctx.game.get('Terrain');
  const G = (f, l, u) => F.ground(terrain, f, l, u);
  // Targets, like positions, resolve against the terrain: a look-at held above
  // the frame's flat origin plane drifts off the actors as the ground moves.
  const A = (f, l, u) => F.ground(terrain, f, l, u);
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

/** Point every actor's gaze at one of them (or at a world point). */
export function attend(ctx, target, except = []) {
  for (const id of ctx.stage.ids) {
    if (except.includes(id) || id === target) continue;
    ctx.stage.look(id, target);
  }
}
