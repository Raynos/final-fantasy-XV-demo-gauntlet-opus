import * as THREE from 'three';
import { frameAt, arrange, wide, attend } from './SceneKit.js';

/**
 * CHAPTER II — the imperial blockade.
 *
 * The Ecology already straddles the carriageway with a checkpoint at road z=72;
 * this scene stands the party off it at dusk and puts magitek troopers on the
 * barrier, frozen in authored poses the way `Director` freezes its capture
 * tableaux. Then a dropship goes over low enough to shake the lens.
 *
 * The point of the beat: the empire is *already here*, on a Lucian road, an
 * hour outside the Wall, and nobody in Insomnia mentioned it.
 */

const DUR = 38;

export const BLOCKADE = {
  id: 'ch2_blockade',
  chapter: 2,
  letterbox: 1,
  duration: DUR,

  stage(ctx) {
    const { game, stage } = ctx;
    const sky = game.get('Sky');
    if (sky && sky.setTimeOfDay) sky.setTimeOfDay(18.9);

    const F = frameAt(ctx, 'blockade', { fallback: [0, 72] });
    ctx.data.F = F;
    // Stand them off the barrier, on the carriageway. Off the tarmac the
    // rendered terrain and `Terrain.heightAt` diverge enough to sink an actor
    // to the waist, so `lift` puts them back on the visible surface.
    arrange(ctx, F, {
      at: -26, lift: 0.95,
      slots: {
        noctis: [0.60, 0.80],
        gladio: [0.20, -0.45],
        ignis: [-0.30, 1.15],
        prompto: [-1.05, -1.05],
      },
      poses: { gladio: 'folded', ignis: 'glasses', prompto: 'breathe', noctis: 'pockets' },
    });

    // troopers on the line. Frozen, so they read as a *posted guard* rather
    // than as an encounter that has already noticed you.
    const enemies = game.get('Enemies');
    ctx.data.spawned = [];
    if (enemies && enemies.spawn) {
      const put = (f, l, state, at) => {
        const p = F.ground(ctx.terrain, f, l, 0.95);
        const e = enemies.spawn('mt', { pos: new THREE.Vector3(p[0], p[1], p[2]) });
        if (!e) return;
        e.heading = F.yaw + Math.PI;
        e.root.rotation.y = e.heading;
        e.stateTime = at;
        if (e.freeze) e.freeze(state, at);
        ctx.data.spawned.push(e);
      };
      put(1.5, 3.2, 'idle', 0.6);
      put(0.4, -3.6, 'idle', 1.9);
      put(-2.4, 5.4, 'idle', 3.1);
      if (enemies.frozen !== undefined) enemies.frozen = true;
    }
  },

  buildShots(ctx) {
    const F = ctx.data.F;
    return [
      // the checkpoint, lit, straddling a road that is supposed to be ours
      wide(ctx, F, { t0: 0, t1: 8.4, camF: -38.0, camL: -7.0, camU: 3.0, f: 1.0, l: 0.0, targetU: 3.0, fov: 34, driftF: 2.8, driftL: 2.0, driftU: 0.4, fStop: 8.0 }),
      // Ignis, reading it
      wide(ctx, F, { t0: 8.4, t1: 15.0, camF: -36.4, camL: 5.0, camU: 2.05, f: -26.3, l: 1.15, targetU: 1.5, fov: 30, driftF: 0.8, driftL: -0.6, aim: 'ignis', aimU: 1.30, fStop: 3.0, focus: 'ignis' }),
      // the two of them, disagreeing about what to do
      wide(ctx, F, { t0: 15.0, t1: 23.0, camF: -37.0, camL: -4.8, camU: 1.95, f: -25.8, l: -0.45, targetU: 1.5, fov: 30, driftF: 0.9, driftL: 0.7, aim: ['gladio', 'noctis'], aimU: 1.28, fStop: 3.2, focus: 'gladio' }),
      // the dropship: crane up off their heads, hard tilt to the sky
      {
        t0: 23.0, t1: 31.0, fov: 52, handheld: 1.0, breathe: 0.6, fStop: 5.0,
        keys: [
          { t: 0, pos: F.ground(ctx.terrain, -34.0, -5.0, 2.4), target: F.ground(ctx.terrain, -25.5, 0, 1.9) },
          { t: 3.2, pos: F.ground(ctx.terrain, -34.6, -5.2, 2.7), target: F.ground(ctx.terrain, -14.0, -2.0, 16.0), ease: 'in' },
          { t: 8.0, pos: F.ground(ctx.terrain, -35.4, -5.6, 2.9), target: F.ground(ctx.terrain, 6.0, -4.0, 24.0), ease: 'outCubic' },
        ],
      },
      // back down, quiet, decision made
      wide(ctx, F, { t0: 31.0, t1: DUR, camF: -40.0, camL: -8.4, camU: 3.4, f: -26.0, l: 0.0, targetU: 1.7, fov: 34, driftF: 2.0, driftL: 1.4, driftU: 0.5, aim: 'crew', aimU: 1.44, fStop: 7.0 }),
    ];
  },

  tick(t, dt, ctx) {
    const s = ctx.stage;
    if (t > 8.0 && t < 15.0) attend(ctx, 'ignis');
    else if (t >= 15.0 && t < 23.0) attend(ctx, 'gladio');
    else if (t >= 23.0 && t < 30.0) {
      // everyone looks up at the dropship
      const F = ctx.data.F;
      const up = F.at(20, -6, 30);
      for (const id of s.ids) s.look(id, up);
      if (t > 23.4 && t < 25.4) { s.pose('prompto', 'brace'); s.pose('noctis', 'awe'); }
    } else if (t >= 30.0) {
      for (const id of s.ids) s.look(id, null);
      s.pose('prompto', 'breathe');
      s.pose('noctis', 'pockets');
    }
  },

  cues: [
    { t: 0.0, fade: { to: 0, dur: 1.6 } },
    { t: 2.2, presentational: true, say: ['Ignis', 'Down. All of you.'], dur: 2.2 },
    { t: 9.0, presentational: true, say: ['Ignis', 'Imperial. On a Lucian road, an hour outside the Wall.'], dur: 4.4 },
    { t: 13.8, presentational: true, say: ['Prompto', 'Are they — are they allowed to do that?'], dur: 3.0 },
    { t: 17.0, presentational: true, say: ['Noctis', 'Apparently.'], dur: 1.8 },
    { t: 19.2, presentational: true, say: ['Gladiolus', 'Or we go through them.'], dur: 2.4 },
    { t: 21.8, presentational: true, say: ['Ignis', 'Around.'], dur: 1.6 },
    {
      t: 23.6, shake: 0.55, slowmo: { scale: 0.42, dur: 1.6 }, sfx: 'warp',
      fn: (ctx) => {
        // a low pass: dust off the shoulder, a hard downwash
        const F = ctx.data.F;
        const vfx = ctx.vfx;
        if (!vfx || !vfx.dustPuff) return;
        const p = F.at(-8, -3, 0.2);
        vfx.dustPuff({
          pos: { x: p[0], y: p[1], z: p[2] }, count: 34, radius: 6.0, speed: 7.5,
          life: 2.6, t0: vfx.clock, size: 1.6, grow: 3.4, up: 1.4, intensity: 0.5,
        });
      },
    },
    { t: 26.4, presentational: true, say: ['Prompto', 'That is a very large ship!'], dur: 2.8 },
    { t: 29.6, presentational: true, say: ['Gladiolus', "They're not hiding it any more."], dur: 3.0 },
    { t: 33.0, presentational: true, say: ['Ignis', 'No. They are not.'], dur: 2.4 },
    { t: 35.0, objective: { title: 'No Turning Back', sub: 'Drive to Galdin Quay' } },
  ],

  onEnd(ctx) {
    const enemies = ctx.game.get('Enemies');
    if (enemies && enemies.clear) { enemies.clear(); enemies.frozen = false; }
    const rpg = ctx.game.get('Rpg');
    if (rpg && rpg.quests.status('main_ch2_galdin') === 'available') rpg.quests.accept('main_ch2_galdin');
  },
};

export default BLOCKADE;
