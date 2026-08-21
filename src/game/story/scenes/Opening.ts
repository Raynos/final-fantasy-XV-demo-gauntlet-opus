import * as THREE from 'three';
import { Frame } from '../../cinematics/CameraMove.ts';
import { RoadPath } from '../../cinematics/RoadPath.ts';
import { takeCar, releaseCar } from './SceneKit.ts';

/**
 * CHAPTER I — "Departure": the four push the broken-down Regalia up the Leide
 * highway at dusk.
 *
 * This is the whole game's tone in one shot: no fight, no spectacle, four
 * people and a car and a very long road. Everything here is staged relative to
 * the *real* world — the Regalia's parked position and the fuel stop the
 * Ecology laid down — so nothing needs re-tuning when the world moves.
 *
 * The push runs backwards in time: `carF(t)` is metres relative to the
 * Regalia's home position and reaches **0 at t = ARRIVE**. The car therefore
 * ends the scene exactly where the world already had it parked, which means the
 * cutscene can restore the prop with no seam at all.
 */

const SPEED = 1.05;          // metres/second — a car in neutral, four tired men
const ARRIVE = 66;           // scene time at which the car reaches its home spot
const DUR = 72;

/** Forward distance of the car, in scene-frame metres (negative = further back). */
const carF = (t) => (Math.min(t, ARRIVE) - ARRIVE) * SPEED;

/**
 * Where each of the four stands, as [forward-of-car, left-of-centre].
 *
 * Tight: the Regalia is 2.1 m across the beam, so shoulders have to be inside
 * that or the outside two are visibly pushing thin air. Gladio takes the middle
 * because he is doing most of the work, and Prompto is furthest back because he
 * is doing the least.
 *
 * Noctis is on the **outside** of the line, which is a blocking decision rather
 * than a characterisation one: the scene has to get a clean single on his face
 * for the beat it exists for, and a camera pointed at the inside of a four-man
 * line always has somebody's shoulder in the way.
 */
const SLOTS = {
  noctis: [-3.34, 1.12],
  ignis: [-3.40, 0.40],
  gladio: [-3.26, -0.36],
  prompto: [-3.62, -1.10],
};

/** Chest height used when aiming at the group rather than at one of them. */
const CHEST = 1.30;

export const OPENING = {
  id: 'ch1_opening_push',
  chapter: 1,
  letterbox: 1,
  openFromBlack: true,
  duration: DUR,
  restorePositions: false,

  /* ------------------------------------------------------------- staging -- */
  stage(ctx) {
    const { game, stage, terrain } = ctx;
    const props = game.get('Props');
    const eco = props && props.ecology;
    const sky = game.get('Sky');

    // Dusk. The signature FFXV light: sun on the deck, everything rim-lit,
    // shadows running the length of the road.
    if (sky && sky.setTimeOfDay) sky.setTimeOfDay(18.25);
    const weather = game.get('Weather');
    if (weather && weather.set) weather.set('clear');

    // ---- anchor on the parked Regalia and the fuel stop up the road --------
    const site = eco && eco.sites.find((s) => s.type === 'regalia');
    const stop = eco && eco.sites.find((s) => s.type === 'reststop');
    const origin = new THREE.Vector3(
      site ? site.x : 0,
      0,
      site ? site.z : 0,
    );
    origin.y = terrain && terrain.heightAt ? terrain.heightAt(origin.x, origin.z) : 0;

    if (stop) ctx.data.stop = new THREE.Vector3(stop.x, terrain ? terrain.heightAt(stop.x, stop.z) : 0, stop.z);

    // The push follows the *road*, not a straight line: over seventy metres the
    // highway bends far enough that a straight frame walks the Regalia off the
    // tarmac and into the scrub, and every shot composed against it is then
    // subtly wrong.
    const samples = eco && eco.roadSamples ? eco.roadSamples({ step: 4, radius: 900 }) : [];
    const F = samples.length > 2
      ? new RoadPath(samples, { origin, toward: ctx.data.stop || undefined, terrain })
      : new Frame(origin, new THREE.Vector3(0, 0, 1));
    ctx.data.F = F;

    // Which side of the road do we shoot from? The one the low sun is on, so
    // the four of them are keyed rather than reduced to four black shapes.
    let side = 1;
    if (sky && sky.sun) {
      const sp = sky.sun.position;
      const tp = sky.sun.target ? sky.sun.target.position : { x: 0, z: 0 };
      const sunDir = new THREE.Vector3(sp.x - tp.x, 0, sp.z - tp.z).normalize();
      side = sunDir.dot(F.right) >= 0 ? 1 : -1;
      ctx.data.sunAhead = sunDir.dot(F.fwd);
      ctx.data.sunLat = sunDir.dot(F.right);
    }
    ctx.data.side = side;

    // Hammerhead, expressed in scene-frame coordinates, so shots can aim at it.
    if (ctx.data.stop) {
      const d = new THREE.Vector3().subVectors(ctx.data.stop, origin);
      ctx.data.stopF = d.dot(F.fwd);
      ctx.data.stopL = d.dot(F.right);
    } else {
      ctx.data.stopF = 40; ctx.data.stopL = 0;
    }

    // ---- take the car ------------------------------------------------------
    // Through `takeCar`, not by grabbing `props.regalia` directly. There are
    // TWO Regalias: the static prop, which `RegaliaSystem` hides at init, and
    // the sim's own drivable root, which it rewrites from `body.pos` every
    // tick. Moving the prop by hand moved an *invisible* object, so the whole
    // opening staged four men pushing empty air while the real car sat parked
    // forty metres up the road. `takeCar` shows the prop and hides the sim root
    // so there is never a duplicate in shot.
    const car = takeCar(ctx);
    if (car) {
      ctx.data.car = car;
      // `releaseCar` restores position, rotation and visibility but not the
      // hull's inner child, which this scene spins as the wheels.
      ctx.data.carHome = {
        inner: car.children[0] ? car.children[0].rotation.clone() : null,
      };
    }

    // ---- everyone into position -------------------------------------------
    placeCrew(ctx, 0);
    stage.pose('noctis', 'push');
    stage.pose('gladio', 'push_heavy');
    stage.pose('ignis', 'push');
    stage.pose('prompto', 'push_tired');
  },

  /* ---------------------------------------------------------- per frame -- */
  tick(t, dt, ctx) {
    placeCrew(ctx, t);
  },

  /* -------------------------------------------------------------- shots -- */
  buildShots,

  /* --------------------------------------------------------------- cues -- */
  cues: [
    { t: 0.0, fade: { to: 0, dur: 3.4 }, music: 'field' },
    {
      t: 2.6, presentational: true,
      say: [null, 'The road out of Insomnia. Six hours gone, and the tank went dry an hour ago.'],
      dur: 5.4,
    },

    // --- profile: the push, and the complaining -----------------------------
    { t: 10.6, presentational: true, say: ['Prompto', "When they said 'road trip', I pictured more road. Less pushing."], dur: 4.2 },
    { t: 15.2, presentational: true, say: ['Gladiolus', 'Push harder. Ends sooner.'], dur: 2.6 },

    // --- from behind: whose fault is this -----------------------------------
    { t: 20.0, presentational: true, say: ['Ignis', 'For the record, I did suggest we stop for fuel.'], dur: 3.6 },
    { t: 23.9, presentational: true, say: ['Noctis', 'For the record, nobody was listening.'], dur: 3.2 },
    { t: 27.4, presentational: true, say: ['Prompto', 'I was listening! I just... was not driving.'], dur: 3.4 },

    // --- two-shot: Gladio and Prompto ---------------------------------------
    { t: 31.2, presentational: true, say: ['Gladiolus', 'Four of us. One car. Nobody checks the tank.'], dur: 3.6 },
    { t: 35.0, presentational: true, say: ['Prompto', "This is character-building. This is the part we tell people about later."], dur: 4.4 },
    { t: 39.6, presentational: true, say: ['Gladiolus', 'This is the part where you push.'], dur: 2.8 },

    // --- close on Noctis: the beat the whole scene exists for ----------------
    { t: 44.4, presentational: true, say: ['Noctis', 'Dad gave me a car.'], dur: 2.8 },
    { t: 47.6, presentational: true, say: ['Ignis', 'His Majesty gave you a great deal more than a car.'], dur: 4.0 },
    { t: 52.0, presentational: true, say: ['Noctis', 'Yeah. I know.'], dur: 2.6 },

    // --- the crane, and Hammerhead ------------------------------------------
    { t: 57.4, presentational: true, say: ['Ignis', 'Hammerhead. Straight on, and do not stop.'], dur: 3.6 },
    { t: 61.2, presentational: true, say: ['Prompto', "Define 'straight on'."], dur: 2.4 },
    { t: 63.8, presentational: true, say: ['Gladiolus', 'That way. Until the lights get bigger.'], dur: 3.2 },

    // --- title ---------------------------------------------------------------
    {
      t: 65.2,
      chapter: { n: 1, name: 'Departure', sub: 'Leide — The Longwythe Region' },
    },
    { t: 69.2, presentational: true, say: ['Noctis', "Let's go."], dur: 2.4 },
  ],

  /* ---------------------------------------------------------------- end -- */
  onEnd(ctx) {
    const { game, stage } = ctx;
    // Park the car exactly where the world had it, then leave the four of them
    // standing beside it facing Hammerhead. Whether the scene played out or was
    // skipped, this is the same hand-off.
    releaseCar(ctx);
    restoreInner(ctx);
    const F = ctx.data.F;
    if (!F) return;
    const terrain = game.get('Terrain');
    const yaw = F.yaw;
    const spots = { noctis: [-4.6, 0.6], gladio: [-5.4, -1.5], ignis: [-4.4, 2.1], prompto: [-6.0, -2.6] };
    for (const id of Object.keys(spots)) {
      const [f, l] = spots[id];
      stage.place(id, F.ground(terrain, f, l, 0), yaw);
      const a = stage.actor(id);
      if (a) { a.root.position.copy(a.pos); a.root.rotation.y = yaw; }
    }
    const player = game.get('Player');
    if (player) { player.heading = yaw; player.velocity.set(0, 0, 0); player.speed = 0; }
  },
};

/* -------------------------------------------------------------------------- */
/* staging helpers                                                            */
/* -------------------------------------------------------------------------- */

/** Drive the car and the four pushers to their positions at scene time `t`. */
function placeCrew(ctx, t) {
  const { stage, terrain } = ctx;
  const F = ctx.data.F;
  if (!F) return;
  const f = carF(t);
  const yawAt = (ff) => (F.yawAt ? F.yawAt(ff) : F.yaw);

  // ---- the Regalia -------------------------------------------------------
  const car = ctx.data.car;
  if (car && terrain) {
    const p = F.ground(terrain, f, 0, 0.015);
    car.position.set(p[0], p[1], p[2]);
    // the hull's nose is local +X, so the yaw that points it down the road is
    // a quarter turn off the "face along +Z" convention the actors use
    const y = yawAt(f);
    const fwd = { x: Math.sin(y), z: Math.cos(y) };
    car.rotation.set(0, Math.atan2(-fwd.z, fwd.x), 0);
    const inner = car.children[0];
    if (inner) {
      const yF = height(terrain, F, f + 1.75, 0);
      const yR = height(terrain, F, f - 1.75, 0);
      const yL = height(terrain, F, f, 0.82);
      const yRt = height(terrain, F, f, -0.82);
      inner.rotation.z = Math.atan2(yF - yR, 3.5);
      inner.rotation.x = Math.atan2(yRt - yL, 1.64);
    }
  }

  // ---- the four ----------------------------------------------------------
  // A shared cadence with a per-man phase offset: they are pushing one object,
  // so the effort has to look coupled, but four identical strides is a chorus
  // line. The gentle speed modulation is the heave-and-recover of a real push.
  const heave = 1 + 0.12 * Math.sin(t * 1.35);
  const dir = new THREE.Vector3();
  let i = 0;
  for (const id of Object.keys(SLOTS)) {
    const [df, dl] = SLOTS[id];
    const bob = 0.06 * Math.sin(t * 1.35 + i * 0.9);
    const yaw = yawAt(f + df);
    dir.set(Math.sin(yaw), 0, Math.cos(yaw));
    stage.place(id, F.ground(terrain, f + df + bob, dl, 0), yaw);
    stage.walk(id, dir, t < ARRIVE ? SPEED * heave * (0.94 + 0.05 * i) : 0);
    i++;
  }
}

/** Terrain height at a scene-frame offset. */
function height(terrain, F, f, l) {
  const p = F.at(f, l, 0);
  return terrain.heightAt(p[0], p[2]);
}

/** Unwind the wheel spin. `releaseCar` handles everything else. */
function restoreInner(ctx) {
  const car = ctx.data.car;
  const home = ctx.data.carHome;
  if (!car || !home || !home.inner || !car.children[0]) return;
  car.children[0].rotation.copy(home.inner);
}

/* -------------------------------------------------------------------------- */
/* the seven set-ups                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The camera set-ups, built once staging has resolved the scene frame so every
 * keyframe can be written in scene-local metres: `G(f, l, u)` is "f metres up
 * the road, l metres to the shooting side, u metres above the ground there".
 */
function buildShots(ctx: any) {
  const F = ctx.data.F;
  const S = ctx.data.side || 1;
  const terrain = ctx.game.get('Terrain');
  /**
   * Both camera positions *and* look-at targets resolve against the terrain,
   * never against the frame's flat origin plane. The road climbs and falls over
   * the seventy metres this scene covers, and a target held at a fixed height
   * above the origin drifts metres above the actors' heads by the far end of
   * the move — the sort of error that reads as "the framing is a bit off" and
   * is actually a coordinate bug.
   */
  const G = (f, l, u) => F.ground(terrain, f, l * S, u);
  /** The centre of the pushing line at scene time `t`. */
  const crew = (t, u) => G(carF(t) - 3.4, 0, u);
  /** One of the four, exactly where `placeCrew` will put him. */
  const man = (t, id, u) => G(carF(t) + SLOTS[id][0], SLOTS[id][1] / S, u);
  const stopF = ctx.data.stopF ?? 40;
  const stopL = (ctx.data.stopL ?? 0) / (S || 1);

  return [
    /* 1 — THE ROAD. Long lens from up the highway, camera almost on the tarmac,
       backing off at half the car's pace so the Regalia closes on us without
       ever filling the frame. No cut for nine seconds: the scene has to earn
       its patience early or none of the rest of it reads as deliberate. */
    {
      t0: 0, t1: 9.4, fov: 34, handheld: 0.16, breathe: 1.0, focus: 'auto', fStop: 9.0,
      keys: [
        { t: 0, pos: G(carF(0) + 13.6, 4.2, 1.30), target: G(carF(0) - 0.6, 0.2, 1.32) },
        { t: 9.4, pos: G(carF(9.4) + 9.9, 3.6, 1.32), target: G(carF(9.4) - 0.6, 0.2, 1.32), ease: 'inOutSine' },
      ],
    },

    /* 2 — PROFILE. Tracking dolly running alongside at their own pace and a
       little behind the rear axle, so the car leads the frame and the four of
       them follow it in silhouette. */
    {
      t0: 9.4, t1: 19.6, fov: 36, handheld: 0.5, breathe: 0.7, fStop: 4.5, focus: 'noctis',
      aim: 'crew', aimU: 1.26,
      keys: [
        { t: 0, pos: G(carF(9.4) - 6.6, 6.6, 1.82), target: G(carF(9.4) - 2.2, 0, 1.30) },
        { t: 10.2, pos: G(carF(19.6) - 6.2, 6.3, 1.78), target: G(carF(19.6) - 2.2, 0, 1.30), ease: 'linear' },
      ],
    },

    /* 3 — BEHIND. Hip height, in their wake, looking past four backs and over
       the roof at the road they still have to walk. */
    {
      t0: 19.6, t1: 30.4, fov: 36, handheld: 0.55, breathe: 0.8, fStop: 4.0, focus: 'noctis',
      keys: [
        { t: 0, pos: G(carF(19.6) - 9.8, -1.4, 1.08), target: G(carF(19.6) + 2.6, 0.1, 1.62) },
        { t: 10.8, pos: G(carF(30.4) - 8.0, -1.3, 1.12), target: G(carF(30.4) + 2.8, 0.1, 1.58), ease: 'inOutSine' },
      ],
    },

    /* 4 — TWO-SHOT. Gladio and Prompto from outside the wing, front three-
       quarter. The twenty-five centimetres between their heads is the joke. */
    {
      t0: 30.4, t1: 42.6, fov: 40, handheld: 0.6, breathe: 0.6, fStop: 4.5, focus: 'gladio',
      aim: ['gladio', 'prompto'], aimU: 1.40,
      keys: [
        { t: 0, pos: G(carF(30.4) - 1.45, -3.55, 1.58), target: G(carF(30.4) - 3.5, -0.72, 1.50) },
        { t: 12.2, pos: G(carF(42.6) - 1.70, -3.30, 1.55), target: G(carF(42.6) - 3.5, -0.72, 1.48), ease: 'linear' },
      ],
    },

    /* 5 — NOCTIS. Just outside the rear wing, level with his shoulder, wide
       open: the road behind him goes to mush and there is nothing in focus in
       the frame except his face. Ignis's shoulder rakes the near edge. */
    {
      t0: 42.6, t1: 55.0, fov: 34, handheld: 0.42, breathe: 0.5, focus: 'noctis', fStop: 2.4,
      aim: 'noctis', aimU: 1.46,
      keys: [
        { t: 0, pos: G(carF(42.6) - 1.85, 1.98, 1.62), target: man(42.6, 'noctis', 1.46) },
        { t: 12.4, pos: G(carF(55.0) - 2.05, 1.90, 1.60), target: man(55.0, 'noctis', 1.45), ease: 'linear' },
      ],
    },

    /* 6 — THE CRANE. Up and back off their shoulders until the basin is under
       us and the fuel stop's canopy comes over the rise. */
    {
      t0: 55.0, t1: 64.4, fov: 42, handheld: 0.22, breathe: 0.9, fStop: 7.0,
      keys: [
        { t: 0, pos: G(carF(55.0) - 8.6, -1.2, 1.72), target: crew(55.0, 1.45) },
        { t: 4.6, pos: G(carF(59.6) - 9.8, -1.6, 3.0), target: crew(59.6, 1.55), fov: 42 },
        { t: 9.4, pos: G(carF(64.4) - 11.2, -2.0, 3.9), target: G(carF(64.4) + 10.0, stopL * 0.10, 1.9), fov: 42, ease: 'crane' },
      ],
    },

    /* 7 — HORIZON. Long lens down the highway: four small figures walking into
       a lit canopy at the end of a very long day. The title card lands here. */
    {
      t0: 64.4, t1: 72.0, fov: 36, handheld: 0.30, breathe: 1.0, fStop: 8.0,
      keys: [
        { t: 0, pos: G(carF(64.4) - 15.6, -0.5, 3.2), target: G(carF(64.4) + 44.0, stopL * 0.12, 3.6) },
        { t: 7.6, pos: G(carF(66) - 13.4, -0.6, 3.1), target: G(carF(66) + 44.0, stopL * 0.12, 3.6), ease: 'inOutSine' },
      ],
    },
  ];
}

export default OPENING;
