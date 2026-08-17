import * as THREE from 'three';
import * as M from './kit/InteriorMaterials.js';

/**
 * **Keycatrich Trench** — an imperial-occupied trench network driven into the
 * Leide badlands, half of it collapsed and all of it still on emergency power.
 *
 * Identity: hard geometry and hard light. Poured concrete with shuttering
 * seams, rebar bursting out of every breach, and a chain of caged emergency
 * strips that give each corridor one direction and one colour — sodium amber —
 * against the cold blue of Niflheim machinery. Tight runs open into two rooms
 * big enough to fight in: the barracks hall and, at the bottom, the command
 * chamber.
 *
 * Critical path: entry -> guard post -> barracks -> generator room -> (blast
 * door) -> command chamber. Branches: a collapsed sap, a locked store, a
 * flooded sump that holds the keycard, and a vault behind the boss.
 */
export const KEYCATRICH = {
  id: 'keycatrich',
  name: 'Keycatrich Trench',
  region: 'Leide',
  style: 'bunker',
  seed: 90210,
  corridorWidth: 3.4,
  corridorHeight: 3.5,

  /** Where the entrance sits in the world, and which way it faces. */
  entrance: { x: -112, z: -228, heading: 0.62, kind: 'bunker' },
  /** Interior origin: directly under the entrance, well below the badlands. */
  origin: [-112, -46, -228],
  spawn: [0, 2.5],
  exit: { at: [0, 3.6], facing: 0, w: 3.6, h: 3.4, color: 0xcfe0f6, intensity: 150 },

  wallMat: () => M.trenchConcrete(),
  floorMat: () => M.trenchFloor(),
  ceilMat: () => M.trenchConcrete(),

  /** Cold, thin, slightly dusty air. */
  atmosphere: {
    fog: [0.030, 0.031, 0.036],
    density: 0.020, height: 26, haze: 0.0018,
    exposure: 1.28, grade: 'night', gradeMix: 0.66,
  },
  lighting: {
    poolSize: 12, gain: 11,
    ambientSky: 0x2c3c4c, ambientGround: 0x2a1c10, ambientIntensity: 0.62,
    lampColor: 0xa8c2dc, lampIntensity: 0.5, lampRange: 9,
    moteColor: 0xcbb086, moteCount: 460, moteBox: 26,
  },
  ambience: { bed: 'trench', tone: 38, air: 190, drip: 0.35, hum: 60, gain: 0.85 },

  // ------------------------------------------------------------------ layout

  author(L) {
    L.room('entry', { x: 0, z: 0, w: 11, d: 9, y: 0, h: 4.2, kind: 'entry', name: 'Trench Head' });
    L.room('guard', { x: 0, z: -24, w: 10, d: 10, y: -1.6, h: 4.0, kind: 'junction', name: 'Guard Post' });
    L.room('sap', { x: -14, z: -24, w: 8, d: 6.5, y: -1.6, h: 3.2, kind: 'dead-end', name: 'Collapsed Sap' });
    L.room('barracks', {
      x: 0, z: -42, w: 22, d: 16, y: -3.2, h: 5.6, kind: 'hall', name: 'Barracks Hall',
      platforms: [{ x: -8.2, z: -47.0, w: 5.6, d: 6.0, y: -1.5 }],
      ramps: [{ x: -8.2, z: -40.6, w: 5.6, d: 6.4, y0: -3.2, y1: -1.5, axis: 'z' }],
    });
    L.room('store', { x: 18, z: -42, w: 9, d: 9, y: -3.2, h: 3.6, kind: 'treasure', name: 'Quartermaster' });
    L.room('generator', { x: -2, z: -63, w: 18, d: 15, y: -5.6, h: 6.6, kind: 'hall', name: 'Generator Room' });
    L.room('sump', { x: 16, z: -63, w: 10, d: 9, y: -6.6, h: 3.4, kind: 'treasure', name: 'Flooded Sump' });
    L.room('command', {
      x: -4, z: -96, w: 28, d: 24, y: -9.4, h: 9.0, kind: 'boss', name: 'Command Chamber',
      platforms: [{ x: -4, z: -105, w: 12, d: 4.5, y: -8.2 }],
      ramps: [{ x: -4, z: -101.4, w: 12, d: 3.2, y0: -9.4, y1: -8.2, axis: 'z' }],
    });
    L.room('vault', { x: 20, z: -96, w: 9, d: 9, y: -9.4, h: 3.8, kind: 'treasure', name: 'Vault' });

    L.link('entry', 'guard', { critical: true });
    L.link('guard', 'sap', { width: 2.8, height: 2.9 });
    L.link('guard', 'barracks', { critical: true });
    L.link('barracks', 'store', { width: 2.9, height: 3.0 });
    L.link('barracks', 'generator', { critical: true, width: 3.6 });
    L.link('generator', 'sump', { width: 2.9, height: 3.0 });
    L.link('generator', 'command', { critical: true, width: 3.8, height: 4.0 });
    L.link('command', 'vault', { width: 2.9, height: 3.2 });

    L.exitAt = [0, 3.6];

    // --- doors -----------------------------------------------------------
    L.door({ at: [13.6, -42], facing: 'x', w: 2.9, h: 3.0, key: 'trench_keycard', name: 'Store Room', kind: 'magitek' });
    L.door({ at: [-4, -81.4], facing: 'z', w: 3.8, h: 4.0, name: 'Blast Door', kind: 'blast' });

    // --- treasure --------------------------------------------------------
    L.chest({ at: [-15.4, -25.6], name: 'Buried Cache', items: ['hi_potion', 'hi_potion', 'debased_silver'], gil: 420 });
    L.chest({ at: [19.6, -40.4], name: 'Quartermaster Locker', items: ['mega_potion', 'remedy', 'magitek_booster'], gil: 900, magitek: true });
    L.chest({ at: [16.4, -44.2], name: 'Ration Crate', items: ['ether', 'antidote', 'luncheon_meat'], rot: 0.4 });
    L.chest({ at: [18.6, -65.4], name: 'Sunken Strongbox', items: ['trench_keycard', 'imperial_relay'], gil: 300, magitek: true });
    L.chest({ at: [21.4, -94.4], name: 'Imperial Vault', items: ['elixir', 'mythril_shaft', 'iron_duke'], gil: 3200, big: true, magitek: true });
    L.chest({ at: [18.6, -98.2], name: 'Officer\'s Case', items: ['hi_elixir', 'sky_gemstone'], gil: 1500, magitek: true });

    // --- hazards ---------------------------------------------------------
    L.hazard({ at: [16, -63], r: 4.4, kind: 'electrified-water', dps: 55, name: 'Live Water' });
    L.hazard({ at: [-2, -69.5], r: 2.4, kind: 'steam-vent', dps: 30, name: 'Ruptured Line' });

    // --- encounters ------------------------------------------------------
    L.encounter({ at: [0, -42], r: 9, kind: 'mt-squad', count: 5, name: 'MT Patrol' });
    L.encounter({ at: [-4, -96], r: 12, kind: 'mt-commander', boss: true, count: 1, name: 'Magitek Commander' });
  },

  // ----------------------------------------------------------------- dressing

  dress(kit, L) {
    const strip = (x, z, y, rot, live = true, o = {}) => {
      if (live) kit.emergencyStrip(x, y, z, { rot, ...o });
      else kit.deadStrip(x, y, z, { rot });
    };

    // ---- entry: the one place daylight reaches -------------------------
    strip(-4.8, -1.5, 2.9, 0, true, { intensity: 6.5, range: 13 });
    strip(4.8, -1.5, 2.9, 0, true, { intensity: 6.5, range: 13 });
    kit.sandbags(-3.4, 0, 1.0, { rot: 0, rows: 3, per: 5 });
    kit.magitekCrate(4.2, 0, -2.4, { stack: 2, rot: 0.3 });
    kit.magitekCrate(3.0, 0, -3.4, { stack: 1, rot: -0.5 });
    kit.pipeRun(0, 4.0, -1, { len: 8, rot: 0 });
    kit.rubble(-4.0, 0, -3.0, { count: 8, radius: 1.6 });

    // ---- the long run down to the guard post ---------------------------
    for (let i = 0; i < 6; i++) {
      const z = -5.5 - i * 3.1;
      const live = i !== 2 && i !== 4;
      strip(i % 2 ? 1.6 : -1.6, z, -0.2 - i * 0.24 + 2.9, i % 2 ? Math.PI : 0, live,
        { intensity: 5.0, range: 11, flicker: i === 3 ? 0.45 : 0.09 });
    }
    kit.pipeRun(1.1, 2.9, -12, { len: 15, rot: Math.PI / 2 });
    kit.cableRun(-1.55, 1.4, -12, { len: 14, rot: Math.PI / 2 });
    kit.rubble(0.8, -0.9, -13.5, { count: 10, radius: 1.3 });
    kit.rebar(-1.6, -1.0, -17.5, { count: 6, rot: 1.57 });

    // ---- guard post -----------------------------------------------------
    kit.sandbags(0, -1.6, -20.2, { rot: 0, rows: 3, per: 6 });
    kit.floodLight(3.4, -1.6, -21.6, { rot: Math.PI, intensity: 10, range: 17 });
    kit.magitekCrate(-3.8, -1.6, -26.6, { stack: 3, rot: 0.2 });
    kit.magitekCrate(-2.4, -1.6, -27.2, { stack: 1, rot: -0.3 });
    strip(0, -28.6, 1.3, 0, true, { intensity: 5.5 });
    kit.rebar(4.7, -1.6, -25.5, { count: 7, rot: 3.0 });
    kit.pipeRun(0, 2.2, -24, { len: 9, rot: 0 });

    // ---- collapsed sap: a dead end that reads as one --------------------
    kit.collapse(-17.4, -1.6, -24, { rot: 0, width: 6 });
    strip(-14, -21.2, 1.1, Math.PI, false);
    kit.lantern(-13.2, -0.1, -25.4, { drop: 0.7, intensity: 4.0, range: 8 });
    kit.rubble(-12.6, -1.6, -23.2, { count: 12, radius: 2.2 });

    // ---- barracks hall: the first fight ---------------------------------
    for (const [x, z] of [[-10.6, -37], [-10.6, -47], [10.6, -37], [10.6, -47]]) {
      strip(x * 0.95, z, 0.9, x < 0 ? 0 : Math.PI, true, { intensity: 6.0, range: 15, flicker: 0.12 });
    }
    strip(0, -49.6, 1.0, 0, false);
    kit.floodLight(-7.5, -3.2, -38.5, { rot: -0.9, intensity: 13, range: 21 });
    kit.brazier(6.5, -3.2, -38.0, { intensity: 10, range: 17 });
    // bunk frames along the east wall
    for (let i = 0; i < 4; i++) {
      const z = -36.5 - i * 3.0;
      kit.catwalk(9.2, -2.5, z, { rot: Math.PI / 2, len: 2.0, w: 1.1 });
      kit.catwalk(9.2, -1.4, z, { rot: Math.PI / 2, len: 2.0, w: 1.1 });
    }
    kit.catwalk(-8.2, 0.0, -44.0, { rot: 0, len: 6.0, w: 5.4 });
    kit.magitekCrate(6.2, -3.2, -47.6, { stack: 3, rot: 0.15 });
    kit.magitekCrate(7.6, -3.2, -46.4, { stack: 2, rot: -0.4 });
    kit.magitekCrate(-6.0, -3.2, -48.2, { stack: 1, rot: 0.8 });
    kit.pipeRun(0, 2.0, -42, { len: 20, rot: Math.PI / 2 });
    kit.cableRun(0, 1.2, -42, { len: 18, rot: Math.PI / 2 });
    kit.rubble(3.0, -3.2, -40.0, { count: 14, radius: 3.0 });
    kit.rebar(10.8, -3.2, -44.5, { count: 8, rot: 3.14 });

    // ---- quartermaster's store ------------------------------------------
    strip(18, -46.2, 0.9, 0, true, { intensity: 4.5, range: 10, color: 0x8fd8ff });
    kit.magitekCrate(15.4, -3.2, -39.4, { stack: 3, rot: 0.1 });
    kit.magitekCrate(20.8, -3.2, -44.6, { stack: 2, rot: -0.2 });
    kit.magitekCrate(21.4, -3.2, -39.0, { stack: 1, rot: 0.5 });

    // ---- descent to the generator ---------------------------------------
    strip(1.7, -53.0, -1.6, Math.PI, true, { intensity: 5.0, flicker: 0.4 });
    kit.rubble(-0.8, -4.4, -52.0, { count: 9, radius: 1.4 });

    // ---- generator room: the heart --------------------------------------
    kit.generator(-4.5, -5.6, -66.5, { rot: 0 });
    kit.pipeRun(-4.5, -0.4, -60.5, { len: 12, rot: 0 });
    kit.pipeRun(2.0, -0.2, -63, { len: 13, rot: Math.PI / 2 });
    kit.catwalk(5.5, -2.4, -63, { rot: Math.PI / 2, len: 13, w: 1.6 });
    kit.floodLight(-9.0, -5.6, -58.0, { rot: 2.2, intensity: 11, range: 18 });
    kit.brazier(5.0, -5.6, -68.5, { intensity: 9, range: 16 });
    strip(-10.6, -63, -2.4, 0, true, { intensity: 5.5, range: 13 });
    strip(6.6, -68.5, -2.4, Math.PI, false);
    kit.magitekCrate(4.2, -5.6, -58.4, { stack: 2, rot: 0.3 });
    kit.rebar(-10.8, -5.6, -68.5, { count: 6, rot: 0 });
    kit.rubble(0.5, -5.6, -69.0, { count: 12, radius: 2.4 });
    kit.cableRun(-10.6, -3.4, -63, { len: 12, rot: Math.PI / 2 });

    // ---- flooded sump ----------------------------------------------------
    kit.pool(16, -6.6, -63, { w: 9.4, d: 8.4, depth: 0.34, tint: 0x0a1a1e });
    strip(16, -66.8, -3.6, 0, true, { intensity: 4.0, range: 9, flicker: 0.55, color: 0x9fd8ff });
    kit.rebar(20.4, -6.6, -61.0, { count: 5, rot: 3.14 });
    kit.magitekCrate(19.6, -6.2, -66.0, { stack: 1, rot: 0.6 });

    // ---- the long descent to command ------------------------------------
    for (let i = 0; i < 4; i++) {
      const z = -73 - i * 2.6;
      strip(i % 2 ? 1.8 : -1.8, z, -6.0 - i * 0.9 + 2.6, i % 2 ? Math.PI : 0, i !== 1,
        { intensity: 4.5, range: 11, flicker: 0.3 });
    }
    kit.pipeRun(1.2, -6.0, -76, { len: 12, rot: Math.PI / 2 });

    // ---- command chamber: the boss --------------------------------------
    // Four magitek pylons stand the room up and put a cold vertical beat in
    // each quarter; the braziers and floods are the warm counter-light that
    // stops it going monochrome.
    for (const [x, z] of [[-12.5, -90.5], [4.5, -90.5], [-12.5, -101.5], [4.5, -101.5]]) {
      kit.magitekPylon(x, -9.4, z, { h: 7.6, r: 0.78, intensity: 5.0, range: 15 });
    }
    for (const [x, z, r] of [[-17.4, -90, 0], [-17.4, -102, 0], [9.4, -90, Math.PI], [9.4, -102, Math.PI],
      [-17.4, -96, 0], [9.4, -96, Math.PI]]) {
      kit.emergencyStrip(x, -5.0, z, { rot: r, intensity: 8.0, range: 21, flicker: 0.08, len: 2.6 });
    }
    kit.floodLight(-14.0, -9.4, -87.0, { rot: -0.7, intensity: 15, range: 26 });
    kit.floodLight(6.0, -9.4, -87.0, { rot: 0.7, intensity: 15, range: 26 });
    kit.brazier(-10.5, -9.4, -94.0, { intensity: 13, range: 20 });
    kit.brazier(2.5, -9.4, -99.5, { intensity: 11, range: 18 });
    kit.brazier(-15.0, -9.4, -104.0, { intensity: 9, range: 16 });
    // the dais at the back, lit cold
    kit.magitekCrate(-9.5, -8.2, -105.4, { stack: 3, rot: 0 });
    kit.magitekCrate(1.5, -8.2, -105.4, { stack: 3, rot: 0 });
    kit.magitekCrate(-4, -8.2, -106.4, { stack: 2, rot: 0 });
    kit.emergencyStrip(-4, -4.6, -106.8, { rot: 0, intensity: 9.0, range: 20, len: 3.0, color: 0x8fd8ff });
    kit.catwalk(-4, -1.0, -105, { rot: Math.PI / 2, len: 11, w: 2.0 });
    kit.pipeRun(-4, -1.2, -96, { len: 22, rot: Math.PI / 2 });
    kit.cableRun(-17.6, -6.0, -96, { len: 20, rot: Math.PI / 2 });
    kit.rubble(-11, -9.4, -92, { count: 16, radius: 3.4 });
    kit.rubble(6, -9.4, -100, { count: 12, radius: 2.6 });
    kit.rebar(9.6, -9.4, -94, { count: 9, rot: 3.14 });
    kit.sandbags(-2.0, -9.4, -88.0, { rot: 0, rows: 3, per: 7 });
    kit.collapse(-17.0, -9.4, -104.5, { rot: 0, width: 5 });

    // ---- vault ----------------------------------------------------------
    kit.emergencyStrip(20, -6.0, -99.6, { rot: 0, intensity: 5.0, range: 11, color: 0x8fd8ff });
    kit.magitekCrate(22.4, -9.4, -93.4, { stack: 2, rot: 0.2 });
    kit.magitekCrate(17.4, -9.4, -93.0, { stack: 1, rot: -0.3 });
  },

  /**
   * The shaft of light the entrance throws down the first corridor. Built after
   * the shell so it can be positioned against the finished geometry.
   */
  extras(dungeon) {
    const rig = dungeon.rig;
    const geo = new THREE.CylinderGeometry(0.9, 3.4, 9, 12, 1, true);
    const mesh = new THREE.Mesh(geo, M.shaftMaterial(0xdce8ff, 0.10));
    mesh.position.set(0, 2.6, 1.2);
    mesh.rotation.x = 0.30;
    mesh.renderOrder = 4;
    rig.addShaft(mesh);
  },
};
