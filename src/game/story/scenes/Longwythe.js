import { frameAt, arrange, wide, attend } from './SceneKit.js';

/**
 * CHAPTER I — the Longwythe hunt. The last beat before the player is ever asked
 * to fight, and therefore the one that has to make the fight mean something:
 * a bounty taken for car money turns out to be four people who have never done
 * this walking into open ground at dusk.
 *
 * Ends by materialising the Engine Blade in Noctis' hand, which is the game's
 * signature and the cleanest possible hand-off into combat.
 */

const DUR = 34;

export const LONGWYTHE = {
  id: 'ch1_longwythe_hunt',
  chapter: 1,
  letterbox: 1,
  duration: DUR,

  stage(ctx) {
    const { game, stage } = ctx;
    const sky = game.get('Sky');
    if (sky && sky.setTimeOfDay) sky.setTimeOfDay(17.6);

    // On the highway beside the abandoned outpost at Longwythe. Staged on the
    // carriageway rather than out in the scrub: off the road the rendered
    // terrain and `Terrain.heightAt` diverge by most of a metre, and a
    // cutscene actor placed on the sampled height sinks into the ground.
    const F = frameAt(ctx, 'regalia', { fallback: [0, 14], offset: [-34, 0] });
    ctx.data.F = F;
    arrange(ctx, F, {
      at: -4.0, lift: 0.95,
      slots: {
        noctis: [0.60, 0.80],
        ignis: [-0.30, 1.15],
        gladio: [0.20, -0.45],
        prompto: [-1.05, -1.05],
      },
      poses: { gladio: 'hips', ignis: 'shade_eyes', prompto: 'breathe', noctis: 'pockets' },
    });
  },

  buildShots(ctx) {
    const F = ctx.data.F;
    return [
      // the ground they are about to fight over
      wide(ctx, F, { t0: 0, t1: 7.5, camF: -16.0, camL: -7.0, camU: 2.6, f: -4.0, l: 0.3, targetU: 1.6, fov: 40, driftF: 2.4, driftL: 1.6, aim: 'crew', aimU: 1.32 }),
      // Ignis reading the scrub
      wide(ctx, F, { t0: 7.5, t1: 14.4, camF: -10.4, camL: 5.0, camU: 2.05, f: -4.3, l: 1.15, targetU: 1.5, fov: 30, driftF: 0.8, driftL: -0.6, driftU: 0.04, aim: 'ignis', aimU: 1.30, fStop: 3.0, focus: 'ignis' }),
      // Gladio, entirely unworried
      wide(ctx, F, { t0: 14.4, t1: 20.6, camF: -11.0, camL: -4.6, camU: 1.95, f: -3.8, l: -0.45, targetU: 1.5, fov: 32, driftF: 0.9, driftL: 0.6, driftU: 0.04, aim: ['gladio', 'prompto'], aimU: 1.26, fStop: 3.2, focus: 'gladio' }),
      // Prompto, entirely worried
      wide(ctx, F, { t0: 20.6, t1: 25.4, camF: -12.6, camL: 6.4, camU: 2.05, f: -5.05, l: -1.05, targetU: 1.5, fov: 27, driftF: 0.8, driftL: -0.5, aim: 'prompto', aimU: 1.28, fStop: 2.8, focus: 'prompto' }),
      // the blade
      wide(ctx, F, { t0: 25.4, t1: DUR, camF: -11.6, camL: 4.2, camU: 1.9, f: -3.4, l: 0.8, targetU: 1.5, fov: 28, driftF: 1.2, driftL: -0.8, driftU: 0.05, aim: 'noctis', aimU: 1.26, fStop: 2.6, focus: 'noctis' }),
    ];
  },

  tick(t, dt, ctx) {
    const s = ctx.stage;
    if (t > 7.0 && t < 14.4) attend(ctx, 'ignis');
    else if (t >= 14.4 && t < 20.6) attend(ctx, 'gladio');
    else if (t >= 20.6 && t < 25.4) attend(ctx, 'prompto');
    else if (t >= 25.4) attend(ctx, 'noctis', ['noctis']);
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

  onEnd(ctx) {
    const rpg = ctx.game.get('Rpg');
    if (!rpg) return;
    if (rpg.quests.status('hunt_sabertusks') === 'available') rpg.quests.accept('hunt_sabertusks');
    rpg.quests.track('hunt_sabertusks');
  },
};

export default LONGWYTHE;
