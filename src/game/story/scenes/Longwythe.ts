import * as THREE from 'three';
import {
  frameAt, arrange, wide, twoShot, single, ots, lowAngle, attend, poiPoint,
} from './SceneKit.ts';
import type { SceneCtx, SceneData, SceneDef, ShotDef } from '../../cinematics/Scene.ts';

/**
 * CHAPTER I — the Longwythe hunt. The last beat before the player is ever asked
 * to fight, and therefore the one that has to make the fight mean something:
 * a bounty taken for car money turns out to be four people who have never done
 * this walking into open ground at dusk.
 *
 * Ends by materialising the Engine Blade in Noctis' hand, which is the game's
 * signature and the cleanest possible hand-off into combat.
 *
 * ### Where it is staged
 * On open ground beside **Longwythe Rest Area**, with **Longwythe Peak** —
 * the 430 m black horn the whole region is named for, 1.3 km due south and
 * unobstructed all the way (measured: nothing on the sight line rises within
 * 3 m of it) — standing directly behind the party.
 *
 * The scene axis therefore points *away* from the peak, so the four of them
 * face the camera and the mountain is the backdrop of every set-up rather than
 * something they have their backs to. The old staging used the roadside
 * `regalia` Ecology site 1.1 km west, where nothing named Longwythe is in
 * frame at all.
 */

const DUR = 34;

/** Longwythe Peak, which every actor in the first beat is looking at. */
interface LongwytheData extends SceneData {
  peak?: THREE.Vector3 | null;
}

type Ctx = SceneCtx<LongwytheData>;

export const LONGWYTHE: SceneDef<LongwytheData> = {
  id: 'ch1_longwythe_hunt',
  chapter: 1,
  letterbox: 1,
  duration: DUR,

  stage(ctx: Ctx) {
    const { game } = ctx;
    const sky = game.get('Sky');
    if (sky && sky.setTimeOfDay) sky.setTimeOfDay(17.6);

    const rest = poiPoint(ctx, 'longwythe_rest');
    const peak = poiPoint(ctx, 'longwythe_peak');
    // Face away from the peak: the mountain belongs behind them, not in front.
    const away = rest && peak
      ? new THREE.Vector3().subVectors(rest, peak).multiplyScalar(2).add(rest)
      : null;
    const F = frameAt(ctx, 'regalia', {
      origin: rest || undefined,
      facing: away || undefined,
      offset: [30, -10],
      fallback: [1120, 62],
    });
    ctx.data.F = F;
    ctx.data.peak = peak;

    arrange(ctx, F, {
      slots: {
        noctis: [0.42, 0.22],
        ignis: [-0.05, 1.44],
        gladio: [0.20, -1.30],
        prompto: [-1.12, -0.46],
      },
      poses: { gladio: 'hips', ignis: 'shade_eyes', prompto: 'breathe', noctis: 'pockets' },
    });
  },

  buildShots(ctx: Ctx): ShotDef[] {
    const F = ctx.data.F;
    if (!F) return [];
    return [
      // 1 — THE PEAK. Long, low and far back so the mountain gets its full
      // height in frame and the four of them are four small shapes under it.
      wide(ctx, F, {
        t0: 0, t1: 7.5, camF: 31.0, camL: 6.4, camU: 1.05, f: -0.2, l: 0.1, targetU: 3.30,
        fov: 46, driftF: -4.2, driftL: -1.6, driftU: 0.35, aim: 'crew', aimU: 2.20, fStop: 9.0,
      }),
      // 2 — IGNIS reading the scrub. Dirty single past Noctis' shoulder, the
      // peak's flank filling everything behind him.
      ots(ctx, F, {
        t0: 7.5, t1: 14.4,
        nearF: 0.42, nearL: 0.22, farF: -0.05, farL: 1.44,
        back: 1.7, side: 1.15, camU: 1.66, fov: 36, aim: 'ignis', aimU: 1.52, fStop: 2.6,
      }),
      // 3 — GLADIO, entirely unworried, with Prompto beside him.
      twoShot(ctx, F, {
        t0: 14.4, t1: 20.6, f: -0.46, l: -0.88, camF: 4.4, camL: -3.4, camU: 1.70,
        fov: 36, targetU: 1.50, fStop: 3.0, focus: 'gladio',
        aim: ['gladio', 'prompto'], aimU: 1.46, driftF: -0.5, driftL: 0.4,
      }),
      // 4 — PROMPTO, entirely worried. Tight, wide open, everything but his
      // face gone.
      single(ctx, F, {
        t0: 20.6, t1: 25.4, f: -1.12, l: -0.46, camF: 2.0, camL: -1.9, camU: 1.62,
        fov: 30, targetU: 1.54, fStop: 2.2, focus: 'prompto', aim: 'prompto', aimU: 1.50,
      }),
      // 5 — THE BLADE. Low off the ground on Noctis, the Engine Blade coming
      // out of blue light with a mountain behind him and nothing else in frame.
      lowAngle(ctx, F, {
        t0: 25.4, t1: DUR, camF: 4.6, camL: -1.25, camU: 0.66, f: 0.42, l: 0.22, targetU: 1.90,
        fov: 32, driftF: -0.7, driftL: 0.35, driftU: 0.45,
        aim: 'noctis', aimU: 1.44, fStop: 3.2, focus: 'noctis',
      }),
    ];
  },

  tick(t: number, dt: number, ctx: Ctx) {
    const s = ctx.stage;
    const peak = ctx.data.peak;
    if (t < 7.0) {
      // all four reading the ground they are about to fight over
      if (peak) for (const id of s.ids) s.look(id, peak);
    } else if (t < 14.4) attend(ctx, 'ignis');
    else if (t < 20.6) attend(ctx, 'gladio');
    else if (t < 25.4) attend(ctx, 'prompto');
    else attend(ctx, 'noctis', ['noctis']);
    if (t >= 25.4) s.look('noctis', null);
  },

  cues: [
    { t: 0.0, fade: { to: 0, dur: 1.4 } },
    { t: 1.6, presentational: true, say: [null, 'Longwythe. Two hours from Hammerhead, and nothing between here and the peak.'], dur: 4.8 },
    { t: 8.4, presentational: true, say: ['Ignis', 'Sabertusks. They run in a line and they turn the moment one of them falls.'], dur: 5.0 },
    { t: 13.8, presentational: true, say: ['Ignis', 'So: make one of them fall.'], dur: 2.6 },
    { t: 16.6, presentational: true, say: ['Gladiolus', 'Loudly. I like it.'], dur: 2.4 },
    { t: 21.4, presentational: true, say: ['Prompto', "First real one. Okay. We've — we've trained for this. Kind of."], dur: 4.4 },
    {
      t: 26.6, presentational: true, say: ['Noctis', 'Stay behind me.'], dur: 2.4,
      // the Engine Blade materialises out of blue crystal light
      fn: (ctx) => {
        const combat = ctx.game.get('Combat');
        if (combat && combat.setWeapon) combat.setWeapon('sword', { materialise: true });
        if (ctx.audio && ctx.audio.play) ctx.audio.play('warp');
      },
    },
    { t: 30.0, presentational: true, say: ['Gladiolus', "That's my line."], dur: 2.4 },
    { t: 31.4, objective: { title: 'Fangs of the Wasteland', sub: 'Cull the Sabertusk pack' } },
  ],

  onEnd(ctx: Ctx) {
    const rpg = ctx.game.get('Rpg');
    if (!rpg) return;
    if (rpg.quests.status('hunt_sabertusks') === 'available') rpg.quests.accept('hunt_sabertusks');
    rpg.quests.track('hunt_sabertusks');
  },
};

export default LONGWYTHE;
