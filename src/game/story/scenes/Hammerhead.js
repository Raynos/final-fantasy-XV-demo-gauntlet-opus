import { frameAt, arrange, wide, attend } from './SceneKit.js';

/**
 * CHAPTER I — "The Pauper Prince": Hammerhead, and the bill.
 *
 * Cindy and Cid are staged as voices rather than bodies: she is under the car
 * and he is inside the garage, which is both where they would actually be and
 * an honest answer to the fact that this project has four modelled characters.
 * The camera stays on the four reacting, which is the better cut anyway — the
 * scene is about the prince discovering he is broke, not about the mechanic.
 */

const DUR = 44;

export const HAMMERHEAD = {
  id: 'ch1_hammerhead',
  chapter: 1,
  letterbox: 1,
  duration: DUR,

  stage(ctx) {
    const { game, stage } = ctx;
    const sky = game.get('Sky');
    // Late blue-gold: the canopy strip has to read as the brightest thing on
    // this road without the rest of the frame going to black.
    if (sky && sky.setTimeOfDay) sky.setTimeOfDay(17.9);

    // Staged at the Regalia, where the previous scene left it and where this
    // conversation would actually happen: Cindy is under the bonnet, the fuel
    // stop's canopy is up the road behind them, and the ground is the flat,
    // well-lit carriageway rather than the scrub bank behind the forecourt.
    const F = frameAt(ctx, 'regalia', { fallback: [0, 14], facing: null });
    ctx.data.F = F;
    // Keep everybody inside the carriageway. The rendered terrain mesh sits
    // roughly a metre above what `Terrain.heightAt` reports on the rough
    // shoulder here, so an actor placed a couple of metres off the tarmac
    // renders buried to the chest; on the road surface itself the two agree.
    arrange(ctx, F, {
      at: -4.0, lift: 0.95,
      slots: {
        noctis: [0.55, 0.85],
        ignis: [-0.30, 1.15],
        gladio: [0.20, -0.45],
        prompto: [-1.05, -1.05],
      },
      poses: { noctis: 'pockets', gladio: 'hips', ignis: 'folded', prompto: 'breathe' },
    });
    stage.look('noctis', F.at(1.5, 0.6, 1.0));
  },

  buildShots(ctx) {
    const F = ctx.data.F;
    return [
      // the car, the road, the light at the end of it
      wide(ctx, F, { t0: 0, t1: 9.0, camF: -16.0, camL: -7.0, camU: 2.6, f: 0.5, l: 0.4, targetU: 2.0, fov: 40, driftF: 2.4, driftL: 1.6, aim: 'crew', aimU: 1.32 }),
      // the four of them, waiting on a verdict
      wide(ctx, F, { t0: 9.0, t1: 17.5, camF: -11.6, camL: 5.6, camU: 2.0, f: -4.0, l: 0.3, targetU: 1.5, fov: 38, driftF: 1.2, driftL: -1.0, driftU: 0.1, aim: 'crew', aimU: 1.30 }),
      // Ignis and Noctis, taking the news like adults. Shot on a long lens from
      // the same side of the road as the establishing set-ups: the bank on the
      // far shoulder is high enough to eat the party's legs from over there,
      // and a compressed medium reads better against the badlands anyway.
      wide(ctx, F, { t0: 17.5, t1: 25.0, camF: -10.4, camL: 5.0, camU: 2.05, f: -4.0, l: 1.5, targetU: 1.5, fov: 30, driftF: 0.9, driftL: -0.7, driftU: 0.05, aim: ['ignis', 'noctis'], aimU: 1.22, fStop: 3.2, focus: 'ignis' }),
      // Noctis, saying it out loud
      wide(ctx, F, { t0: 25.0, t1: 34.0, camF: -12.6, camL: 6.4, camU: 2.05, f: -3.85, l: 1.05, targetU: 1.55, fov: 27, driftF: 1.1, driftL: -0.6, driftU: 0.04, fStop: 2.8, focus: 'noctis', aim: 'noctis', aimU: 1.24 }),
      // back out: the road, the job, the long way round
      wide(ctx, F, { t0: 34.0, t1: DUR, camF: -14.0, camL: -5.4, camU: 3.2, f: -4.2, l: 0.2, targetU: 1.6, fov: 38, driftF: -2.0, driftL: -1.4, driftU: 0.6, aim: 'crew', aimU: 1.36 }),
    ];
  },

  tick(t, dt, ctx) {
    // Heads turn to whoever is speaking. Nothing sells a conversation like
    // three people looking at the fourth a beat before he talks.
    const s = ctx.stage;
    if (t > 17.0 && t < 25.0) attend(ctx, 'ignis');
    else if (t >= 25.0 && t < 34.0) attend(ctx, 'noctis');
    else if (t >= 34.0) { for (const id of s.ids) s.look(id, null); }
  },

  cues: [
    { t: 0.0, fade: { to: 0, dur: 1.8 } },
    { t: 2.0, presentational: true, say: ['Cindy', "Well now. Y'all pushed her the whole way in?"], dur: 3.4 },
    { t: 5.6, presentational: true, say: ['Prompto', "Uphill. There was an uphill. Nobody mentions the uphill."], dur: 4.2 },
    { t: 10.2, presentational: true, say: ['Cindy', "She'll run again. Fuel line's gone and the pump's gone with it."], dur: 4.4 },
    { t: 15.0, presentational: true, say: ['Ignis', 'And the cost?'], dur: 2.0 },
    { t: 17.6, presentational: true, say: ['Cindy', "Fifteen hundred. That's parts and my hands, and I'm cheap for both."], dur: 4.6 },
    { t: 22.6, presentational: true, say: ['Gladiolus', 'Noct.'], dur: 1.6 },
    { t: 25.6, presentational: true, say: ['Noctis', "...I don't have fifteen hundred."], dur: 3.0 },
    { t: 29.0, presentational: true, say: ['Gladiolus', 'The Crown Prince of Lucis is broke.'], dur: 3.2 },
    { t: 32.4, presentational: true, say: ['Noctis', 'The Crown Prince of Lucis left in a hurry.'], dur: 3.4 },
    { t: 36.2, presentational: true, say: ['Cid', "Then earn it. Board's inside. Been there longer'n you have."], dur: 4.2 },
    { t: 40.6, presentational: true, say: ['Prompto', 'We are going to hunt monsters. For car money.'], dur: 3.4 },
    {
      t: 41.0,
      objective: { title: 'The Pauper Prince', sub: 'Ask Takka about hunting work' },
    },
  ],

  onEnd(ctx) {
    const rpg = ctx.game.get('Rpg');
    if (!rpg) return;
    // Whether watched or skipped, the chapter moves on.
    rpg.quests.forceObjective('main_ch1_departure', 'cindy');
    if (rpg.quests.status('main_ch1_pauper') === 'available') rpg.quests.accept('main_ch1_pauper');
  },
};

export default HAMMERHEAD;
