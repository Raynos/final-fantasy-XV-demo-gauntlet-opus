import * as THREE from 'three';
import * as M from './kit/InteriorMaterials.js';

/**
 * **Fociaugh Hollow** — a limestone cave system with no architecture in it at
 * all.
 *
 * Identity: everything here is grown, not built. There is not one straight line
 * or right angle in the dungeon: the passages are swept tubes that pinch and
 * bulge, the chambers are lofted domes, and the only light is bioluminescent —
 * cold blue-green fungus clustered wherever water runs, doubled in the still
 * pools underneath it. Wet flowstone reads glossy in the highlights and near
 * black in the shadows, which is what makes the fungus glow instead of merely
 * being green.
 *
 * Critical path: cave mouth -> dripstone gallery -> the narrows -> the Hollow.
 * Branches: a still-water chamber, a sump shelf above the narrows, and a
 * spawning alcove off the boss chamber.
 */
export const FOCIAUGH = {
  id: 'fociaugh',
  name: 'Fociaugh Hollow',
  region: 'Duscae',
  style: 'cave',
  seed: 71177,
  corridorWidth: 3.0,
  corridorHeight: 3.2,

  entrance: { x: 110, z: 356, heading: 2.60, kind: 'cave' },
  origin: [110, -22, 356],
  spawn: [0, 2.4],
  exit: { at: [0, 4.0], facing: 0, w: 3.4, h: 3.4, color: 0xcfe8d8, intensity: 240 },

  wallMat: () => M.wetLimestone(),
  floorMat: () => M.caveSilt(),
  ceilMat: () => M.wetLimestone(),

  /** Cold, damp, tinted toward the bioluminescence. */
  atmosphere: {
    fog: [0.016, 0.032, 0.036],
    density: 0.026, height: 30, haze: 0.0024,
    exposure: 1.46, grade: 'night', gradeMix: 0.70,
  },
  lighting: {
    poolSize: 14, gain: 13,
    ambientSky: 0x1e3f48, ambientGround: 0x0d1618, ambientIntensity: 0.58,
    lampColor: 0x86c8d8, lampIntensity: 0.22, lampRange: 8,
    moteColor: 0x86e8d0, moteCount: 620, moteBox: 24,
  },
  ambience: { bed: 'cave', tone: 46, air: 320, drip: 2.2, dripGain: 1.3, gain: 0.95 },

  // ------------------------------------------------------------------ layout

  author(L) {
    L.room('mouth', { x: 0, z: 0, w: 13, d: 11, y: 0, h: 7.5, kind: 'entry', name: 'Cave Mouth' });
    L.room('gallery', {
      x: 0, z: -24, w: 20, d: 17, y: -5.0, h: 10.0, kind: 'hall', name: 'Dripstone Gallery',
      platforms: [{ x: -7.0, z: -28.5, w: 6, d: 6, y: -3.4 }],
      ramps: [{ x: -7.0, z: -23.0, w: 6, d: 5.4, y0: -5.0, y1: -3.4, axis: 'z' }],
    });
    L.room('still', { x: -21, z: -30, w: 17, d: 15, y: -7.2, h: 8.0, kind: 'treasure', name: 'Still Water' });
    L.room('narrows', {
      x: 7, z: -46, w: 15, d: 13, y: -11.0, h: 7.5, kind: 'junction', name: 'The Narrows',
      platforms: [{ x: 11.0, z: -46, w: 5, d: 8, y: -9.6 }],
      ramps: [{ x: 6.0, z: -46, w: 5, d: 8, y0: -11.0, y1: -9.6, axis: 'x' }],
    });
    L.room('shelf', { x: 25, z: -46, w: 11, d: 10, y: -9.6, h: 5.5, kind: 'treasure', name: 'Sump Shelf' });
    L.room('hollow', {
      x: 0, z: -70, w: 42, d: 36, y: -17.5, h: 21, kind: 'boss', name: 'The Hollow',
      platforms: [
        { x: 0, z: -84, w: 14, d: 6, y: -16.2 },
        { x: 2, z: -54.5, w: 7, d: 5, y: -16.4 },
      ],
      ramps: [
        { x: 0, z: -79.6, w: 14, d: 3.2, y0: -17.5, y1: -16.2, axis: 'z' },
        { x: 2, z: -58.6, w: 7, d: 3.2, y0: -17.5, y1: -16.4, axis: 'z' },
      ],
    });
    L.room('alcove', { x: 24, z: -70, w: 10, d: 9, y: -17.0, h: 5.5, kind: 'treasure', name: 'Spawning Pool' });

    L.link('mouth', 'gallery', { critical: true, width: 3.2 });
    L.link('gallery', 'still', { width: 2.6 });
    L.link('gallery', 'narrows', { critical: true, width: 2.4, via: [[0, -36], [7, -36]] });
    L.link('narrows', 'shelf', { width: 2.4 });
    L.link('narrows', 'hollow', { critical: true, width: 3.0, via: [[2, -52.5, -16.2], [2, -54.6, -16.5]] });
    L.link('hollow', 'alcove', { width: 2.4 });

    L.exitAt = [0, 4.0];

    // The one obstruction in the whole dungeon is a natural one: a flowstone
    // curtain that has to be broken through.
    L.door({ at: [2, -51.0], facing: 'z', w: 3.0, h: 3.2, key: 'fociaugh_sigil', name: 'Flowstone Curtain', kind: 'stone' });

    L.chest({ at: [-23.4, -27.6], name: 'Silt Cache', items: ['hi_potion', 'phoenix_down', 'vesproom'], gil: 260 });
    L.chest({ at: [-19.0, -33.8], name: 'Drowned Pack', items: ['fociaugh_sigil', 'beautiful_bottle'], gil: 400 });
    L.chest({ at: [-7.6, -29.8], name: 'Ledge Cache', items: ['ether', 'rainbow_frog'], gil: 180 });
    L.chest({ at: [26.6, -44.0], name: 'Sump Shelf', items: ['mega_potion', 'remedy', 'coeurl_whiskers'], gil: 1100 });
    L.chest({ at: [25.4, -68.4], name: 'Spawning Pool', items: ['hi_elixir', 'malmashroom', 'venom_fang'], gil: 900 });
    L.chest({ at: [0, -85.0], name: 'The Hollow\'s Heart', items: ['megalixir', 'flesh_harvester', 'moogle_charm_frag'], gil: 5400, big: true });

    L.hazard({ at: [-21, -30], r: 5.5, kind: 'deep-water', dps: 12, name: 'Cold Water' });
    L.hazard({ at: [24, -70], r: 4.0, kind: 'spores', dps: 28, name: 'Spore Bloom' });

    L.encounter({ at: [0, -24], r: 8, kind: 'sabertusk-pack', count: 3, name: 'Sabertusks' });
    L.encounter({ at: [0, -70], r: 14, kind: 'mindflayer', boss: true, count: 1, name: 'Mindflayer' });
  },

  // ----------------------------------------------------------------- dressing

  dress(kit, L) {
    const F = (x, y, z, o) => kit.fungus(x, y, z, o);

    // ---- cave mouth: daylight dying about six metres in -------------------
    kit.dripField(0, 7.0, -1.5, { count: 14, radius: 5.0, len: 1.5, r: 0.24 });
    kit.boulder(-4.6, 0, -2.6, { r: 1.3 });
    kit.boulder(4.4, 0, 1.2, { r: 1.0 });
    kit.boulder(3.2, 0, -4.0, { r: 0.7 });
    F(-5.2, 0.2, -4.4, { count: 6, scale: 0.9, intensity: 1.2, range: 6 });
    kit.column(5.6, 0, -3.4, { h: 7.4, r: 0.5 });

    // ---- the squeeze down ------------------------------------------------
    for (let i = 0; i < 7; i++) {
      const z = -7 - i * 2.1;
      const y = -0.7 - i * 0.62;
      F(i % 2 ? 1.3 : -1.3, y + (i % 3 === 0 ? 1.8 : 0.1), z, {
        count: 5, scale: 0.7, intensity: 0.85, range: 5, glow: 0.8,
        up: i % 3 === 0, color: i === 4 ? 0x9a72ff : 0x63ffd0,
      });
    }
    kit.dripField(0, 1.6, -12, { count: 10, radius: 2.2, len: 1.1, r: 0.17 });
    kit.boulder(1.2, -3.4, -14.5, { r: 0.6 });

    // ---- dripstone gallery: the first room that opens up ------------------
    kit.dripField(0, 4.4, -24, { count: 34, radius: 9.0, len: 2.4, r: 0.32 });
    kit.dripField(3, -5.0, -21, { count: 14, radius: 6.0, len: 1.2, r: 0.28, up: true });
    kit.column(-6.2, -5.0, -19.4, { h: 9.6, r: 0.72 });
    kit.column(6.8, -5.0, -27.0, { h: 9.6, r: 0.62 });
    kit.column(2.4, -5.0, -30.2, { h: 9.6, r: 0.48 });
    kit.pool(4.5, -5.0, -26.0, { w: 7.5, d: 6.5, depth: 0.1 });
    F(4.5, -4.75, -26.0, { count: 12, spread: 3.4, scale: 1.35, intensity: 8.0, range: 16, glow: 1.8 });
    F(-6.4, -4.8, -20.4, { count: 9, spread: 1.5, scale: 1.1, intensity: 5.5, range: 13, color: 0x9a72ff });
    F(0, 3.6, -24, { count: 10, spread: 3.0, scale: 0.9, intensity: 2.6, range: 10, up: true, color: 0x8fd0ff });
    F(-7.0, -3.2, -29.0, { count: 8, spread: 2.0, scale: 1.0, intensity: 3.0, range: 9 });
    kit.boulder(7.6, -5.0, -20.0, { r: 1.6 });
    kit.boulder(-8.2, -5.0, -27.6, { r: 1.2 });

    // ---- still water: a black mirror -------------------------------------
    kit.pool(-21, -7.2, -30, { w: 13.5, d: 11.5, depth: 0.16 });
    F(-25.6, -6.9, -26.0, { count: 12, spread: 2.6, scale: 1.45, intensity: 8.5, range: 17, glow: 1.9 });
    F(-16.4, -6.9, -33.6, { count: 10, spread: 2.2, scale: 1.15, intensity: 5.5, range: 14, color: 0x9a72ff });
    F(-21, 0.0, -30, { count: 14, spread: 5.0, scale: 0.8, intensity: 2.4, range: 10, up: true, color: 0x8fd0ff });
    kit.dripField(-21, 0.4, -30, { count: 22, radius: 7.0, len: 2.0, r: 0.26 });
    kit.column(-24.4, -7.2, -33.0, { h: 7.6, r: 0.55 });
    kit.boulder(-17.0, -7.2, -26.4, { r: 1.4 });

    // ---- the narrows ------------------------------------------------------
    kit.dripField(7, -4.4, -46, { count: 20, radius: 6.5, len: 1.8, r: 0.26 });
    F(3.2, -10.8, -42.4, { count: 8, spread: 1.8, scale: 1.0, intensity: 3.2, range: 10 });
    F(11.0, -9.35, -49.0, { count: 9, spread: 1.9, scale: 1.05, intensity: 3.4, range: 10 });
    kit.column(4.0, -11.0, -50.0, { h: 7.2, r: 0.5 });
    kit.boulder(2.6, -11.0, -47.6, { r: 1.1 });
    kit.pool(8.0, -11.0, -43.0, { w: 5.0, d: 4.4, depth: 0.09 });

    // ---- sump shelf --------------------------------------------------------
    F(28.0, -9.35, -43.2, { count: 10, spread: 2.0, scale: 1.15, intensity: 4.0, range: 11, glow: 1.5 });
    kit.dripField(25, -5.0, -46, { count: 12, radius: 4.0, len: 1.4, r: 0.22 });
    kit.pool(25, -9.6, -48.0, { w: 6.0, d: 4.0, depth: 0.08 });
    kit.boulder(22.4, -9.6, -43.0, { r: 0.9 });

    // ---- the Hollow: the boss chamber -------------------------------------
    kit.dripField(0, -0.5, -70, { count: 44, radius: 16.0, len: 3.2, r: 0.42 });
    kit.column(-11.0, -17.5, -62.0, { h: 20.5, r: 1.05 });
    kit.column(10.4, -17.5, -64.0, { h: 20.5, r: 0.9 });
    kit.column(-13.5, -17.5, -78.0, { h: 20.5, r: 1.2 });
    kit.column(12.6, -17.5, -76.5, { h: 20.5, r: 0.85 });
    kit.pool(-7.0, -17.5, -73.0, { w: 12.0, d: 9.0, depth: 0.13 });
    // the ring of bioluminescence around the arena — this is the whole shot
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.3;
      const rr = 13.5 + (i % 3) * 1.6;
      const x = Math.cos(a) * rr, z = -70 + Math.sin(a) * rr * 0.86;
      F(x, -17.3, z, {
        count: 9, spread: 2.2, scale: 1.1 + (i % 3) * 0.12,
        intensity: 3.6, range: 13, glow: 1.5,
        color: i % 4 === 0 ? 0x9a72ff : (i % 3 === 0 ? 0x8fd0ff : 0x63ffd0),
      });
    }
    // two hero clusters: the arena needs a brightest point and a second read
    F(-9.5, -17.2, -66.0, { count: 14, spread: 2.6, scale: 1.7, intensity: 9.0, range: 20, glow: 2.0, color: 0x74ffdc });
    F(9.0, -16.8, -76.0, { count: 11, spread: 2.2, scale: 1.5, intensity: 7.0, range: 18, glow: 1.7, color: 0x9a72ff });
    F(0, -16.0, -84.0, { count: 16, spread: 5.0, scale: 1.5, intensity: 6.0, range: 20, glow: 2.2, color: 0xa0ffe0 });
    F(0, 1.6, -70, { count: 18, spread: 8.0, scale: 0.9, intensity: 2.6, range: 14, up: true, color: 0x8fd0ff });
    kit.boulder(-6.0, -17.5, -60.0, { r: 2.4 });
    kit.boulder(7.4, -17.5, -80.0, { r: 2.0 });
    kit.boulder(-9.0, -17.5, -80.6, { r: 1.6 });
    kit.dripField(0, -17.5, -70, { count: 26, radius: 17.0, len: 1.6, r: 0.34, up: true });

    // ---- spawning pool -----------------------------------------------------
    kit.pool(24, -17.0, -70, { w: 8.0, d: 7.0, depth: 0.2, tint: 0x0a1a12 });
    F(24, -16.8, -70, { count: 16, spread: 3.4, scale: 1.3, intensity: 5.0, range: 14, glow: 1.9, color: 0x9dff7a });
    kit.dripField(24, -12.0, -70, { count: 14, radius: 4.0, len: 1.6, r: 0.24 });
    void L;
  },

  /**
   * The one shaft of daylight, falling through the collapse at the mouth, and a
   * second, weaker one through a fissure over the Hollow.
   */
  extras(dungeon) {
    const rig = dungeon.rig;
    const a = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 3.8, 9.5, 12, 1, true),
      M.shaftMaterial(0xd8ead8, 0.11)
    );
    a.position.set(0.4, 3.4, 0.6);
    a.rotation.x = 0.22;
    a.renderOrder = 4;
    rig.addShaft(a);

    const b = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 4.0, 22, 12, 1, true),
      M.shaftMaterial(0xbcd8e8, 0.05)
    );
    b.position.set(-4.0, -7.0, -66.0);
    b.rotation.z = 0.12;
    b.renderOrder = 4;
    rig.addShaft(b);
    rig.add({ pos: [-4.0, -2.0, -66.0], color: 0xbcd8e8, intensity: 4.0, range: 26, flicker: 0, glow: 0.8, glowSize: 2.6 });
  },
};
