import { frameAt, arrange, wide, attend } from './SceneKit.ts';

/**
 * CHAPTER III — "The Open World": the morning the news comes through.
 *
 * The hardest beat in the early game and the cheapest to stage — four people on
 * a rise at dawn, one of them holding a phone, and a column of smoke a hundred
 * kilometres behind them where a city used to be. No effect in the engine is
 * going to do more work here than three seconds of nobody saying anything, so
 * the timeline is built around the silences rather than around the lines.
 */

const DUR = 46;

export const THE_FALL = {
  id: 'ch3_the_fall',
  chapter: 3,
  letterbox: 1,
  openFromBlack: true,
  duration: DUR,

  stage(ctx: any) {
    const { game } = ctx;
    const sky = game.get('Sky');
    // First light. Everything is grey and pink and far too calm.
    if (sky && sky.setTimeOfDay) sky.setTimeOfDay(6.4);
    const weather = game.get('Weather');
    if (weather && weather.set) weather.set('overcast');

    // On the highway by the dead truck, facing back the way they came. Staged
    // on the carriageway: off the tarmac the rendered terrain and
    // `Terrain.heightAt` diverge enough to sink an actor to the waist.
    const F = frameAt(ctx, 'truck', { fallback: [0, -74], offset: [0, 7.4] });
    ctx.data.F = F;
    arrange(ctx, F, {
      at: -4.0, lift: 0.95,
      slots: {
        noctis: [0.60, 0.80],
        prompto: [0.20, -0.45],
        ignis: [-0.30, 1.15],
        gladio: [-1.05, -1.05],
      },
      poses: { prompto: 'photograph', ignis: 'folded', gladio: 'hips', noctis: 'pockets' },
    });
  },

  buildShots(ctx: any) {
    const F = ctx.data.F;
    return [
      // the horizon they are all looking at
      wide(ctx, F, { t0: 0, t1: 9.5, camF: -16.0, camL: -7.0, camU: 2.7, f: -4.0, l: 0.3, targetU: 1.7, fov: 38, driftF: 2.2, driftL: 1.5, driftU: 0.2, aim: 'crew', aimU: 1.36, fStop: 7.0 }),
      // Prompto with the phone, reading it a second time
      wide(ctx, F, { t0: 9.5, t1: 18.0, camF: -11.4, camL: 5.2, camU: 2.0, f: -3.8, l: -0.45, targetU: 1.5, fov: 29, driftF: 0.8, driftL: -0.6, driftU: 0.04, aim: 'prompto', aimU: 1.28, fStop: 2.8, focus: 'prompto' }),
      // Noctis. Held long, on purpose.
      wide(ctx, F, { t0: 18.0, t1: 30.0, camF: -12.8, camL: 6.2, camU: 2.0, f: -3.4, l: 0.8, targetU: 1.5, fov: 26, driftF: 1.4, driftL: -1.0, driftU: 0.05, aim: 'noctis', aimU: 1.26, fStop: 2.6, focus: 'noctis' }),
      // Ignis, who has already worked out what this means for all of them
      wide(ctx, F, { t0: 30.0, t1: 37.0, camF: -10.6, camL: -4.8, camU: 1.95, f: -4.3, l: 1.15, targetU: 1.5, fov: 30, driftF: 0.8, driftL: 0.6, aim: ['ignis', 'noctis'], aimU: 1.28, fStop: 3.0, focus: 'ignis' }),
      // four backs, one horizon
      wide(ctx, F, { t0: 37.0, t1: DUR, camF: -18.5, camL: -6.0, camU: 3.6, f: -4.0, l: 0.2, targetU: 1.7, fov: 36, driftF: -2.6, driftL: -1.2, driftU: 0.9, aim: 'crew', aimU: 1.44, fStop: 8.0 }),
    ];
  },

  tick(t: any, dt: any, ctx: any) {
    const s = ctx.stage;
    const F = ctx.data.F;
    const far = F.at(140, -10, 22);
    if (t < 9.5) { for (const id of s.ids) s.look(id, far); }
    else if (t < 18.0) { attend(ctx, 'prompto'); s.look('prompto', null); }
    else if (t < 30.0) {
      attend(ctx, 'noctis');
      s.look('noctis', far);
      if (t > 22.0) s.pose('noctis', null);
      if (t > 25.5) s.pose('gladio', null);        // his hand comes off his hip
    } else if (t < 37.0) attend(ctx, 'ignis');
    else { for (const id of s.ids) s.look(id, far); }
  },

  cues: [
    { t: 0.0, fade: { to: 0, dur: 4.0 } },
    { t: 3.0, presentational: true, say: [null, 'Insomnia. One hundred and ten kilometres behind them, and still burning.'], dur: 5.6 },
    { t: 10.4, presentational: true, say: ['Prompto', "It's on every channel. Every one."], dur: 3.2 },
    { t: 14.0, presentational: true, say: ['Prompto', 'It says the treaty signing was the attack. It says the city fell in a night.'], dur: 5.2 },
    { t: 19.8, presentational: true, say: ['Prompto', '...It says the King is dead.'], dur: 3.4 },
    // four seconds of nothing. This is the shot.
    { t: 26.4, presentational: true, say: ['Ignis', 'Noct.'], dur: 1.8 },
    { t: 28.6, presentational: true, say: ['Noctis', 'Read it again.'], dur: 2.2 },
    { t: 31.2, presentational: true, say: ['Prompto', 'Noct—'], dur: 1.4 },
    { t: 32.8, presentational: true, say: ['Noctis', 'Read it again.'], dur: 2.4 },
    { t: 36.4, presentational: true, say: ['Gladiolus', "...We're not doing this on the roadside."], dur: 3.6 },
    { t: 40.2, presentational: true, say: ['Ignis', 'We go back. As far as they will let us.'], dur: 3.8 },
    {
      t: 41.0,
      chapter: { n: 3, name: 'The Open World', sub: 'Leide — after the fall', kind: 'open' },
    },
  ],

  onEnd(ctx: any) {
    const rpg = ctx.game.get('Rpg');
    const weather = ctx.game.get('Weather');
    if (weather && weather.set) weather.set('clear');
    if (rpg && rpg.quests.status('main_ch3_openworld') === 'available') rpg.quests.accept('main_ch3_openworld');
  },
};

export default THE_FALL;
