import {
  frameAt, arrange, wide, twoShot, ots, lowAngle, attend, townAnchor,
  takeCar, releaseCar, aimCar,
} from './SceneKit.ts';

/**
 * CHAPTER I — "The Pauper Prince": Hammerhead, and the bill.
 *
 * Cindy and Cid are staged as voices rather than bodies: she is under the car
 * and he is inside the garage, which is both where they would actually be and
 * an honest answer to the fact that this project has four modelled characters.
 * The camera stays on the four reacting, which is the better cut anyway — the
 * scene is about the prince discovering he is broke, not about the mechanic.
 *
 * ### Where it is staged
 * On the **garage apron at Hammerhead**, anchored on `Town.anchors.regaliaBay`
 * and `.garageBay`, with the Regalia towed onto the bay for the length of the
 * scene and put back afterwards. The previous staging used the roadside
 * `regalia` Ecology site 600 m short of the town, so a scene documented as
 * "Chapter I *at Hammerhead*" played out on empty highway with none of the
 * town — canopy, garage, SERVICE shed, pylon, mesas — anywhere in frame.
 *
 * The apron is a **graded pad three metres above the terrain it was cut into**,
 * so the frame is pinned to `Town`'s pad height with `Frame.setFloor` rather
 * than snapped to `Terrain.heightAt`, which would bury the whole scene.
 */

const DUR = 44;

export const HAMMERHEAD = {
  id: 'ch1_hammerhead',
  chapter: 1,
  letterbox: 1,
  duration: DUR,

  stage(ctx: any) {
    const { game, stage } = ctx;
    const sky = game.get('Sky');
    // Late blue-gold: the canopy strip has to read as the brightest thing on
    // this forecourt without the rest of the frame going to black.
    if (sky && sky.setTimeOfDay) sky.setTimeOfDay(17.9);

    // The apron in front of Cid's garage. The frame runs *out* of the open bay
    // toward the pumps, so a camera set up under the canopy shoots back at four
    // faces with the SERVICE shed behind them. Both ends come from the town, so
    // the scene follows Hammerhead if Hammerhead ever moves.
    const door = townAnchor(ctx, 'garageBay');
    const pump = townAnchor(ctx, 'pump');
    const F = frameAt(ctx, 'regalia', {
      origin: door || undefined,
      facing: pump || undefined,
      floor: door ? door.y : null,
      fallback: [0, 14],
    });
    ctx.data.F = F;

    // Tow the Regalia onto the bay, broadside, bonnet up so Cindy can be under
    // it. Put back in `onEnd`, whether the scene played out or was skipped.
    const car = takeCar(ctx);
    if (car) {
      const p = F.at(2.2, -2.9, 0.015);
      car.position.set(p[0], p[1], p[2]);
      aimCar(car, F, Math.PI * 0.62);
      ctx.data.carAt = [2.2, -2.9];
    }

    // The four of them stood clear of the bay, facing down the apron — which
    // means facing the camera for every set-up that shoots back from under the
    // canopy, and no more four-backs-in-a-row.
    arrange(ctx, F, {
      at: 3.6,
      slots: {
        noctis: [0.50, 0.20],
        ignis: [-0.10, 1.40],
        gladio: [0.16, -1.28],
        prompto: [-1.10, -0.38],
      },
      poses: { noctis: 'pockets', gladio: 'hips', ignis: 'folded', prompto: 'breathe' },
    });
    // everyone's attention is on the car and the woman under it
    for (const id of stage.ids) stage.look(id, F.at(2.2, -2.9, 0.6));
  },

  buildShots(ctx: any) {
    const F = ctx.data.F;
    return [
      // 1 — THE PLACE. Three-quarter wide from out on the forecourt: canopy
      // overhead, the SERVICE shed and the mesa behind it, and four people
      // stood around a car that is not going anywhere.
      wide(ctx, F, {
        t0: 0, t1: 9.0, camF: 12.8, camL: -8.4, camU: 2.05, f: 3.4, l: 0.1, targetU: 2.50,
        fov: 46, driftF: -2.2, driftL: 2.0, driftU: -0.16, aim: 'crew', aimU: 1.46, fStop: 7.0,
      }),
      // 2 — THE VERDICT. Back up the apron from under the canopy: four faces,
      // the open bay behind them. This is the frame `cine_hammerhead` parks on,
      // so it carries the scene.
      wide(ctx, F, {
        t0: 9.0, t1: 17.5, camF: 10.8, camL: 2.4, camU: 1.82, f: 3.6, l: 0.1, targetU: 1.62,
        fov: 36, driftF: -0.9, driftL: -0.5, driftU: 0.06, aim: 'crew', aimU: 1.40, fStop: 3.6,
      }),
      // 3 — THE PRICE. Dirty single: Noctis clean, Ignis raking the far edge,
      // Insomnia's towers on the horizon behind him. Cindy names the figure
      // over this and the frame never leaves his face.
      ots(ctx, F, {
        t0: 17.5, t1: 25.0,
        nearF: 3.50, nearL: 1.40, farF: 4.10, farL: 0.20,
        back: 1.65, side: 1.10, camU: 1.64, fov: 36, aim: 'noctis', aimU: 1.50, fStop: 2.8,
      }),
      // 4 — GLADIO AND NOCTIS. Two-shot on the other side of the arc for
      // "the Crown Prince of Lucis is broke", so the reply lands in the same
      // frame as the joke.
      twoShot(ctx, F, {
        t0: 25.0, t1: 34.0, f: 3.94, l: -0.54, camF: 7.6, camL: -2.9, camU: 1.68,
        fov: 34, targetU: 1.52, fStop: 2.8, focus: 'noctis',
        aim: ['gladio', 'noctis'], aimU: 1.46, driftF: -0.6, driftL: 0.4,
      }),
      // 5 — THE JOB. Off the deck at the far end of the apron, rising: four of
      // them under the SERVICE sign with a bill to work off.
      lowAngle(ctx, F, {
        t0: 34.0, t1: DUR, camF: 12.4, camL: -4.4, camU: 0.62, f: 3.6, l: 0.1, targetU: 2.55,
        fov: 40, driftF: 1.6, driftL: -1.0, driftU: 0.55, aim: 'crew', aimU: 1.62, fStop: 7.0,
      }),
    ];
  },

  tick(t: number, dt: any, ctx: any) {
    // Heads turn to whoever is speaking. Nothing sells a conversation like
    // three people looking at the fourth a beat before he talks.
    const s = ctx.stage;
    const F = ctx.data.F;
    const [cf, cl] = ctx.data.carAt || [2.2, -2.9];
    const car = F.at(cf, cl, 0.6);
    if (t > 17.0 && t < 25.0) attend(ctx, 'ignis');
    else if (t >= 25.0 && t < 34.0) attend(ctx, 'noctis');
    else if (t >= 34.0) { for (const id of s.ids) s.look(id, null); }
    else for (const id of s.ids) s.look(id, car);
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

  onEnd(ctx: any) {
    // Put the Regalia back where the world had it, played or skipped.
    releaseCar(ctx);

    const rpg = ctx.game.get('Rpg');
    if (!rpg) return;
    // Whether watched or skipped, the chapter moves on.
    rpg.quests.forceObjective('main_ch1_departure', 'cindy');
    if (rpg.quests.status('main_ch1_pauper') === 'available') rpg.quests.accept('main_ch1_pauper');
  },
};

export default HAMMERHEAD;
