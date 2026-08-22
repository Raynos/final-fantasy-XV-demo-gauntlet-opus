import * as THREE from 'three';
import { frameAt, arrange, wide, attend, poiPoint } from './SceneKit.ts';

/**
 * CHAPTER V — "Dark Clouds": the Archaean wakes.
 *
 * There is no Titan in this build, and pretending otherwise with a badly-shaped
 * silhouette would cost more than it bought. So the Astral is staged the way
 * the best version of this scene actually works: entirely as *effect on the
 * world*. The ground goes, the light goes wrong, dust comes off the basin in a
 * ring, the lens shakes hard enough to lose the frame — and the only thing the
 * camera ever looks at is four people finding out how small they are.
 *
 * The voice Noctis hears is the one thing nobody else in the scene reacts to.
 */

const DUR = 40;

export const ASTRAL = {
  id: 'ch5_astral_awakening',
  chapter: 5,
  letterbox: 1,
  duration: DUR,

  stage(ctx: any) {
    const { game } = ctx;
    const sky = game.get('Sky');
    if (sky && sky.setTimeOfDay) sky.setTimeOfDay(13.4);
    const weather = game.get('Weather');
    // `storm`, matching what `Shots.js` asks for. The scene used to set
    // `overcast` and the scene wins, so the two disagreed and the shot never
    // got the weather it was authored against.
    if (weather && weather.set) weather.set('storm');

    // On the crater floor of the Disc of Cauthess, 420 m out from the centre on
    // the `disc_overlook` bearing.
    //
    // This used to sit at the `layby` Ecology site, which a later biomes pass
    // turned into dark closed-canopy forest -- so the Archaean waking was
    // staged in a wood, with a clipped trunk blacking out the left fifth of
    // frame. The crater is the right place and it was measured: the floor runs
    // flat at 3-4 m from 300-500 m out, while the meteor mass rises to 253 m at
    // the centre and the rim wall to 269 m at 850 m. From here the Disc
    // subtends ~31 degrees of elevation and the rim rings the horizon.
    const disc = poiPoint(ctx, 'disc_cauthess');
    const F = frameAt(ctx, null, {
      origin: new THREE.Vector3(-1122, 0, -1752),
      facing: disc || [-1020, -2160],
    });
    ctx.data.F = F;
    arrange(ctx, F, {
      at: -4.0, lift: 0.95,
      slots: {
        noctis: [0.60, 0.80],
        gladio: [0.20, -0.45],
        ignis: [-0.30, 1.15],
        prompto: [-1.05, -1.05],
      },
      poses: { gladio: 'hips', ignis: 'folded', prompto: 'breathe', noctis: 'pockets' },
    });
  },

  buildShots(ctx: any) {
    const F = ctx.data.F;
    const T = ctx.terrain;
    return [
      // a horizon that is about to stop being a horizon
      wide(ctx, F, { t0: 0, t1: 8.0, camF: -17.0, camL: -7.4, camU: 3.0, f: -4.0, l: 0.3, targetU: 1.8, fov: 38, driftF: 2.2, driftL: 1.6, driftU: 0.3, aim: 'crew', aimU: 1.40, fStop: 8.0 }),
      // the first tremor, low and close on the line of them
      wide(ctx, F, { t0: 8.0, t1: 16.5, camF: -10.8, camL: -4.8, camU: 1.55, f: -4.0, l: 0.2, targetU: 1.4, fov: 32, driftF: 0.9, driftL: 0.7, driftU: 0.05, handheld: 1.0, aim: 'crew', aimU: 1.24, fStop: 4.0 }),
      // Noctis, hearing something the others do not
      wide(ctx, F, { t0: 16.5, t1: 25.0, camF: -12.4, camL: 6.0, camU: 2.0, f: -3.4, l: 0.8, targetU: 1.5, fov: 26, driftF: 1.2, driftL: -0.8, driftU: 0.04, handheld: 0.8, aim: 'noctis', aimU: 1.26, fStop: 2.6, focus: 'noctis' }),
      // the shockwave: hard tilt to a sky that has gone the wrong colour
      {
        t0: 25.0, t1: 33.0, fov: 56, handheld: 1.6, breathe: 0.4, fStop: 5.5,
        keys: [
          { t: 0, pos: F.ground(T, -12.0, -5.0, 1.9), target: F.ground(T, -4.0, 0.2, 1.5) },
          { t: 2.6, pos: F.ground(T, -12.6, -5.4, 2.1), target: F.ground(T, 24.0, 8.0, 22.0), ease: 'in' },
          { t: 8.0, pos: F.ground(T, -13.6, -6.0, 2.4), target: F.ground(T, 70.0, 14.0, 34.0), ease: 'outCubic' },
        ],
      },
      // and back to four people, considerably smaller than they were
      wide(ctx, F, { t0: 33.0, t1: DUR, camF: -26.0, camL: -10.0, camU: 5.4, f: -4.0, l: 0.2, targetU: 1.8, fov: 34, driftF: -3.4, driftL: -1.6, driftU: 1.4, aim: 'crew', aimU: 1.50, fStop: 8.0 }),
    ];
  },

  tick(t: number, dt: any, ctx: any) {
    const s = ctx.stage;
    const F = ctx.data.F;
    const far = F.at(150, 18, 30);
    if (t < 8.0) { for (const id of s.ids) s.look(id, far); }
    else if (t < 16.5) {
      attend(ctx, 'gladio');
      if (t > 11.0) { s.pose('gladio', null); s.pose('ignis', null); }
    } else if (t < 25.0) {
      s.look('noctis', null);
      attend(ctx, 'noctis');
      if (t > 18.0) s.pose('noctis', 'awe');
    } else if (t < 33.0) {
      for (const id of s.ids) s.look(id, far);
      s.pose('prompto', 'brace');
      s.pose('gladio', 'brace');
      s.pose('ignis', 'brace');
      s.pose('noctis', 'awe');
    } else {
      for (const id of s.ids) s.look(id, far);
    }
  },

  cues: [
    { t: 0.0, fade: { to: 0, dur: 1.8 } },
    { t: 8.4, shake: 0.35, presentational: false },
    { t: 9.0, presentational: true, say: ['Gladiolus', "That's not thunder."], dur: 2.6 },
    { t: 12.0, presentational: true, say: ['Ignis', 'No. That is beneath us.'], dur: 2.8 },
    { t: 14.2, shake: 0.5 },
    { t: 15.0, presentational: true, say: ['Prompto', 'The ground — the ground is moving, the ground is actually—'], dur: 4.2 },
    { t: 19.4, presentational: true, say: [null, 'KING OF LIGHT. COME TO ME.'], dur: 3.6 },
    { t: 23.2, presentational: true, say: ['Noctis', '...You heard that.'], dur: 2.4 },
    {
      t: 25.4, shake: 0.95, slowmo: { scale: 0.35, dur: 2.2 }, sfx: 'hit',
      fn: (ctx: any) => {
        const vfx = ctx.vfx;
        const F = ctx.data.F;
        if (!vfx) return;
        const p = F.at(70, 8, 1.0);
        if (vfx.dustPuff) {
          vfx.dustPuff({
            pos: { x: p[0], y: p[1], z: p[2] }, count: 44, radius: 26.0, speed: 16.0,
            life: 4.5, t0: vfx.clock, size: 5.0, grow: 4.0, up: 1.2, intensity: 0.55,
          });
        }
        if (vfx.flash) {
          vfx.flash({ pos: { x: p[0], y: p[1] + 20, z: p[2] }, color: 0xffb060, intensity: 90, distance: 260, life: 1.6, t0: vfx.clock, priority: 8 });
        }
      },
    },
    { t: 29.0, presentational: true, say: ['Ignis', 'I heard nothing. Noct — what did you hear?'], dur: 4.0 },
    { t: 33.4, presentational: true, say: ['Noctis', 'He said my name.'], dur: 2.6 },
    { t: 36.0, chapter: { n: 5, name: 'Dark Clouds', sub: 'Duscae — the Disc of Cauthess' } },
  ],

  onEnd(ctx: any) {
    const weather = ctx.game.get('Weather');
    if (weather && weather.set) weather.set('clear');
    const rpg = ctx.game.get('Rpg');
    if (rpg) rpg.quests.setFlag('astral-called');
  },
};

export default ASTRAL;
