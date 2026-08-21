import * as THREE from 'three';
import * as M from './kit/InteriorMaterials.ts';

/**
 * **Balouve Mines** — a hewn, abandoned workings that keeps going down.
 *
 * Identity: scale and gravity. Everything is timber and rock and rusted rail;
 * the light is warm oil-lamp orange and there is never enough of it. The
 * dungeon is built around one idea — the main shaft, a nineteen-metre drop with
 * a timber gallery spiralling down its walls, a lift cage hanging in the middle
 * of it and a column of dusty daylight falling from the headgear far above.
 * Everything before the shaft is a low, cramped drift; everything after it
 * opens into the cavern at the bottom where the Iron Giant is waiting.
 *
 * Critical path: adit -> level one landing -> main shaft (descend) -> the Deep.
 * Branches: a worked stope, a fallen drift, and an ore gallery hanging half way
 * down the shaft wall.
 */
export const BALOUVE = {
  id: 'balouve',
  name: 'Balouve Mines',
  region: 'Leide',
  style: 'mine',
  seed: 5150,
  corridorWidth: 3.6,
  corridorHeight: 3.4,

  entrance: { x: 294, z: -232, heading: -2.05, kind: 'mine' },
  origin: [294, -34, -232],
  spawn: [0, 2.6],
  exit: { at: [0, 3.8], facing: 0, w: 3.6, h: 3.2, color: 0xf0e0c0, intensity: 260 },

  wallMat: () => M.mineRock(),
  floorMat: () => M.caveSilt(),
  ceilMat: () => M.mineRock(),

  /** Warm, dusty, and thicker than the trench — you can see the air. */
  atmosphere: {
    fog: [0.040, 0.031, 0.022],
    density: 0.024, height: 34, haze: 0.0022,
    exposure: 1.30, grade: 'night', gradeMix: 0.50,
  },
  lighting: {
    poolSize: 14, gain: 14,
    ambientSky: 0x35291a, ambientGround: 0x18120c, ambientIntensity: 0.52,
    lampColor: 0xc0a888, lampIntensity: 0.45, lampRange: 9,
    moteColor: 0xe0bb84, moteCount: 560, moteBox: 30,
  },
  ambience: { bed: 'mine', tone: 32, air: 150, drip: 0.9, gain: 0.9 },

  // ------------------------------------------------------------------ layout

  author(L) {
    L.room('adit', { x: 0, z: 0, w: 11, d: 9, y: 0, h: 4.4, kind: 'entry', name: 'The Adit' });
    L.room('landing', { x: 0, z: -28, w: 14, d: 13, y: -2.0, h: 4.8, kind: 'junction', name: 'Level One' });
    L.room('stope', {
      x: -21, z: -28, w: 14, d: 12, y: -2.0, h: 5.6, kind: 'treasure', name: 'Worked Stope',
      platforms: [{ x: -25.5, z: -28, w: 4.0, d: 8.0, y: -0.4 }],
      ramps: [{ x: -21.5, z: -28, w: 4.0, d: 8.0, y0: -2.0, y1: -0.4, axis: 'x' }],
    });
    L.room('fallen', { x: 17, z: -28, w: 9, d: 8, y: -2.0, h: 3.4, kind: 'dead-end', name: 'Fallen Drift' });

    // The main shaft. The floor is nineteen metres below the drift you arrive
    // on; the four ramps are the timber gallery that spirals down its walls.
    L.room('shaft', {
      x: 0, z: -48, w: 18, d: 18, y: -16, h: 19, kind: 'shaft', name: 'Main Shaft',
      // the arrival stage, then a gallery spiralling one and a quarter turns
      // down the walls; it passes under itself on the north side, which is why
      // the top stage and the bottom leg sit at different Z
      platforms: [{ x: 3.75, z: -40.0, w: 7.5, d: 2.0, y: -2.0 }],
      ramps: [
        { x: 7.4, z: -48.5, w: 3.4, d: 17, y0: -5.5, y1: -2.0, axis: 'z' },
        { x: 0, z: -55.8, w: 15, d: 2.4, y0: -9.0, y1: -5.5, axis: 'x' },
        { x: -7.4, z: -48.5, w: 3.4, d: 17, y0: -9.0, y1: -12.5, axis: 'z' },
        { x: -3.75, z: -42.4, w: 7.5, d: 2.0, y0: -12.5, y1: -16.0, axis: 'x' },
      ],
    });
    L.room('gallery', { x: -26, z: -52, w: 11, d: 9, y: -10.0, h: 3.8, kind: 'treasure', name: 'Ore Gallery' });
    L.room('deep', {
      x: -6, z: -80, w: 46, d: 40, y: -19.5, h: 24, kind: 'boss', style: 'cave', name: 'The Deep',
      platforms: [
        { x: -6, z: -95, w: 16, d: 6, y: -18.0 },
        { x: 0, z: -62.5, w: 7, d: 5, y: -18.4 },
      ],
      ramps: [
        { x: -6, z: -90.5, w: 16, d: 3.2, y0: -19.5, y1: -18.0, axis: 'z' },
        { x: 0, z: -66.5, w: 7, d: 3.2, y0: -19.5, y1: -18.4, axis: 'z' },
      ],
    });
    L.room('crib', { x: 26, z: -80, w: 9, d: 8, y: -19.0, h: 3.6, kind: 'treasure', name: 'Powder Crib' });

    L.link('adit', 'landing', { critical: true, kind: 'rail', width: 3.8 });
    L.link('landing', 'stope', { width: 3.4 });
    L.link('landing', 'fallen', { width: 2.9, height: 3.0 });
    L.link('landing', 'shaft', { critical: true, width: 3.6, via: [[0, -38, -2.0], [0, -39.5, -2.0]] });
    L.link('shaft', 'gallery', { width: 3.0, height: 3.2, via: [[-10, -48, -10.2], [-10, -52, -10.0], [-20, -52, -10.0]] });
    L.link('shaft', 'deep', { critical: true, width: 4.2, height: 4.4, via: [[0, -58.5, -16.0], [0, -60.6, -19.3]] });
    L.link('deep', 'crib', { width: 2.9, height: 3.2 });

    L.exitAt = [0, 3.8];

    L.door({ at: [0, -59.0], facing: 'z', w: 4.2, h: 4.4, name: 'Powder Gate', kind: 'blast', key: 'balouve_key' });

    L.chest({ at: [-25.0, -25.4], name: 'Prospector\'s Kit', items: ['hi_potion', 'ether', 'earth_gemstone'], gil: 380 });
    L.chest({ at: [-24.6, -30.8], name: 'Old Pay Chest', items: ['debased_banknote', 'debased_silver'], gil: 1200 });
    L.chest({ at: [19.2, -26.2], name: 'Buried Toolbox', items: ['balouve_key', 'rusted_bit'], gil: 120 });
    L.chest({ at: [-28.0, -50.0], name: 'Gallery Cache', items: ['mega_potion', 'phoenix_down', 'zu_beak'], gil: 900 });
    L.chest({ at: [27.4, -78.4], name: 'Powder Crib', items: ['hi_elixir', 'adamantite'], gil: 4200, big: true });
    L.chest({ at: [-6, -95.4], name: 'The Giant\'s Hoard', items: ['megalixir', 'dragoon_lance', 'behemoth_horn'], gil: 6800, big: true });

    L.hazard({ at: [0, -48], r: 5.0, kind: 'fall', dps: 0, name: 'Open Shaft' });
    L.hazard({ at: [-14, -70], r: 3.2, kind: 'firedamp', dps: 35, name: 'Firedamp Pocket' });

    L.encounter({ at: [0, -28], r: 8, kind: 'goblin-pack', count: 4, name: 'Goblins' });
    L.encounter({ at: [-6, -80], r: 16, kind: 'iron-giant', boss: true, count: 1, name: 'Iron Giant' });
  },

  // ----------------------------------------------------------------- dressing

  dress(kit, L) {
    // ---- adit ------------------------------------------------------------
    kit.timberFrame(0, 0, 1.6, { rot: 0, width: 4.6, height: 3.4 });
    kit.timberFrame(0, 0, -1.6, { rot: 0, width: 4.6, height: 3.4 });
    kit.railTrack([[0, 0, 4.0], [0, 0, -4.5], [0, -0.6, -9]], {});
    kit.minecart(-3.6, 0, -2.0, { rot: 0.25, ore: true });
    kit.lantern(3.2, 3.4, -2.2, { drop: 0.9, intensity: 6.0, range: 12 });
    kit.oreHeap(4.2, 0, 2.0, { radius: 1.5 });
    kit.ladder(-4.8, 0, 3.2, { height: 3.8, rot: 0 });

    // ---- the drift down to level one: timber sets and rail ---------------
    for (let i = 0; i < 8; i++) {
      const z = -6.5 - i * 2.3;
      const y = -0.15 - i * 0.22;
      kit.timberFrame(0, y, z, { rot: 0, width: 3.9, height: 3.0, lagging: i % 2 === 0 });
    }
    kit.railTrack([[0, -0.6, -9], [0, -1.9, -21.5]], {});
    kit.lantern(1.5, 1.0, -12.0, { drop: 0.8, intensity: 5.0, range: 10 });
    kit.lantern(-1.5, 0.2, -19.0, { drop: 0.8, intensity: 5.0, range: 10 });
    kit.oreVein(1.75, -0.9, -15.0, { rot: Math.PI / 2, len: 5, count: 9 });
    kit.oreHeap(-1.4, -1.5, -17.5, { radius: 0.9, count: 8 });

    // ---- level one landing ----------------------------------------------
    kit.timberFrame(0, -2.0, -22.5, { rot: 0, width: 4.4, height: 3.6 });
    kit.timberFrame(0, -2.0, -33.5, { rot: 0, width: 4.4, height: 3.6 });
    kit.railTrack([[0, -2.0, -22.0], [0, -2.0, -33.0]], {});
    kit.railTrack([[-1.6, -2.0, -26.0], [-7.0, -2.0, -28.0], [-14.0, -2.0, -28.0]], {});
    kit.minecart(-2.6, -2.0, -30.4, { rot: -0.2, ore: true });
    kit.minecart(3.4, -2.0, -25.0, { rot: 1.7, tipped: true });
    kit.lantern(-4.6, 1.6, -26.0, { drop: 1.0, intensity: 7.0, range: 14 });
    kit.lantern(4.6, 1.6, -31.0, { drop: 1.0, intensity: 6.0, range: 13 });
    kit.oreHeap(5.4, -2.0, -27.0, { radius: 2.0, count: 18 });
    kit.ladder(6.6, -2.0, -32.4, { height: 4.4, rot: 0 });
    kit.catwalk(-6.4, -0.4, -32.0, { rot: Math.PI / 2, len: 6, w: 1.4 });

    // ---- worked stope -----------------------------------------------------
    kit.oreVein(-27.6, -0.6, -28, { rot: 0, len: 8, count: 16 });
    kit.oreVein(-21, 1.2, -33.6, { rot: Math.PI / 2, len: 9, count: 12 });
    kit.oreHeap(-18.0, -2.0, -25.0, { radius: 2.4, count: 22 });
    kit.lantern(-21.0, 1.8, -25.0, { drop: 1.1, intensity: 6.5, range: 13 });
    kit.timberFrame(-16.0, -2.0, -28, { rot: Math.PI / 2, width: 4.6, height: 3.8 });
    kit.ladder(-21.6, -2.0, -22.6, { height: 4.6, rot: 0 });
    kit.minecart(-17.4, -2.0, -31.6, { rot: 0.9 });

    // ---- fallen drift ----------------------------------------------------
    kit.collapse(20.4, -2.0, -28, { rot: 0, width: 6, mat: M.mineRock() });
    kit.timberFrame(13.4, -2.0, -28, { rot: Math.PI / 2, width: 3.4, height: 3.0 });
    kit.lantern(16.0, 0.4, -30.2, { drop: 0.7, intensity: 3.6, range: 8 });
    kit.oreHeap(15.0, -2.0, -25.6, { radius: 1.4, count: 10 });

    // ---- the main shaft: the set piece ------------------------------------
    // the timber gallery: one and a quarter turns of catwalk and framing down
    // the four walls, lit by a lantern at every stage
    const legs = [
      { a: [7.4, -40.0, -2.0], b: [7.4, -57.0, -5.5], rot: 0 },
      { a: [7.5, -55.8, -5.5], b: [-7.5, -55.8, -9.0], rot: Math.PI / 2 },
      { a: [-7.4, -57.0, -9.0], b: [-7.4, -40.0, -12.5], rot: 0 },
      { a: [-7.5, -42.4, -12.5], b: [0.0, -42.4, -16.0], rot: Math.PI / 2 },
    ];
    for (const g of legs) {
      const n = 7;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = g.a[0] + (g.b[0] - g.a[0]) * t;
        const z = g.a[1] + (g.b[1] - g.a[1]) * t;
        const y = g.a[2] + (g.b[2] - g.a[2]) * t;
        kit.catwalk(x, y + 0.06, z, { rot: g.rot, len: 3.0, w: 2.9 });
        if (i % 2 === 0) kit.timberFrame(x, y, z, { rot: g.rot + Math.PI / 2, width: 2.8, height: 2.7, lagging: false });
      }
      kit.lantern(g.a[0], g.a[2] + 2.5, g.a[1], { drop: 1.0, intensity: 15, range: 20 });
      kit.lantern(g.b[0], g.b[2] + 2.5, g.b[1], { drop: 1.0, intensity: 12, range: 18 });
    }
    kit.catwalk(3.75, -1.94, -40.0, { rot: Math.PI / 2, len: 7.5, w: 2.4 });
    kit.timberFrame(3.75, -2.0, -40.0, { rot: 0, width: 4.4, height: 3.2 });
    kit.lantern(1.0, 0.6, -40.6, { drop: 1.0, intensity: 14, range: 20 });
    kit.lantern(-6.6, -9.6, -50.0, { drop: 1.0, intensity: 7.0, range: 14 });
    kit.liftCage(0, -16, -48, { w: 3.4, d: 3.4, h: 2.9, y1: -6.0, speed: 0.22 });
    kit.oreHeap(4.0, -16, -45.0, { radius: 2.6, count: 20 });
    kit.oreHeap(-4.5, -16, -51.5, { radius: 2.2, count: 16 });
    kit.minecart(3.2, -16, -52.2, { rot: 2.4, tipped: true });
    kit.timberFrame(0, -16, -44.0, { rot: 0, width: 5.2, height: 4.0 });
    kit.lantern(-3.0, -13.2, -54.0, { drop: 0.9, intensity: 14, range: 20 });
    kit.brazier(4.4, -16, -50.0, { intensity: 12, range: 20 });

    // ---- ore gallery ------------------------------------------------------
    kit.oreVein(-30.6, -8.6, -52, { rot: 0, len: 7, count: 13 });
    kit.lantern(-26.0, -6.6, -50.0, { drop: 1.0, intensity: 6.0, range: 12 });
    kit.timberFrame(-21.4, -10.0, -52, { rot: Math.PI / 2, width: 3.2, height: 3.0 });
    kit.oreHeap(-24.0, -10.0, -54.4, { radius: 1.6, count: 12 });
    kit.minecart(-27.6, -10.0, -54.0, { rot: 0.4, ore: true });

    // ---- the descent to the Deep ------------------------------------------
    for (let i = 0; i < 5; i++) {
      kit.timberFrame(0, -16.2 - i * 0.75, -59.5 - i * 2.2, { rot: 0, width: 4.4, height: 3.4, lagging: i % 2 === 0 });
    }
    kit.lantern(1.8, -14.4, -61.0, { drop: 0.8, intensity: 5.0, range: 11 });
    kit.railTrack([[0, -16.2, -59], [0, -19.0, -66]], {});

    // ---- the Deep: the boss cavern ---------------------------------------
    kit.boulder(-18, -19.5, -72, { r: 2.6, mat: M.mineRock() });
    kit.boulder(6, -19.5, -68, { r: 2.0, mat: M.mineRock() });
    kit.boulder(-14, -19.5, -90, { r: 3.1, mat: M.mineRock() });
    kit.boulder(12, -19.5, -88, { r: 2.2, mat: M.mineRock() });
    kit.oreVein(-24, -14.0, -80, { rot: Math.PI / 2, len: 14, count: 22 });
    kit.oreVein(13, -13.0, -76, { rot: Math.PI / 2, len: 12, count: 18 });
    kit.oreHeap(-6, -19.5, -72, { radius: 4.5, count: 30 });
    kit.dripField(-6, -19.5 + 22, -80, { count: 22, radius: 15, len: 2.4, r: 0.34 });
    // burning wreckage, the only light down here
    for (const [x, z, s] of [[-16, -74, 1.2], [8, -76, 1.0], [-12, -88, 1.1], [10, -90, 0.9], [-6, -93, 1.4], [-2, -70, 1.6], [-18, -82, 1.0]]) {
      kit.brazier(x, -19.5, z, { intensity: 18 * s, range: 28 * s });
      kit.oreHeap(x + 1.9, -19.5, z - 0.7, { radius: 1.5, count: 8, scale: 1.2 });
      kit.boulder(x + 1.6, -19.5, z + 1.6, { r: 0.7, mat: M.mineRock() });
    }
    kit.timberFrame(-6, -19.5, -66.5, { rot: 0, width: 5.2, height: 4.2 });
    kit.minecart(-13.5, -19.5, -78.0, { rot: 1.1, tipped: true });
    kit.catwalk(-6, -16.0, -95, { rot: Math.PI / 2, len: 15, w: 2.0 });
    kit.lantern(-6, -16.4, -95.5, { drop: 0.6, intensity: 7.0, range: 16, color: 0xffb055 });

    // ---- powder crib -----------------------------------------------------
    kit.lantern(26, -16.4, -80, { drop: 0.9, intensity: 5.0, range: 10 });
    kit.timberFrame(21.6, -19.0, -80, { rot: Math.PI / 2, width: 3.2, height: 3.0 });
    kit.oreHeap(28.0, -19.0, -82.0, { radius: 1.4, count: 10 });
    void L;
  },

  /**
   * The column of daylight falling nineteen metres down the shaft from the
   * headgear. This is the shot the whole dungeon is built around.
   */
  extras(dungeon) {
    const rig = dungeon.rig;
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 5.2, 21, 16, 1, true),
      M.shaftMaterial(0xe8dcc0, 0.055)
    );
    shaft.position.set(0.5, -6.0, -48);
    shaft.renderOrder = 4;
    rig.addShaft(shaft);

    const pool = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 4.6, 4.5, 14, 1, true),
      M.shaftMaterial(0xf0e2c4, 0.045)
    );
    pool.position.set(0.5, -14.2, -48);
    pool.renderOrder = 4;
    rig.addShaft(pool);

    // the sky seen from the bottom of the shaft
    rig.add({ pos: [0.5, 1.2, -48], color: 0xd8e4f4, intensity: 9, range: 34, flicker: 0, glow: 0.9, glowSize: 4.0 });
  },
};
