/**
 * Named cinematic shots used by the screenshot harness and the photo mode.
 * Each shot may set camera, world time-of-day, weather and gameplay state so
 * captures are reproducible frame-for-frame.
 *
 * Add shots here — tools/shoot.mjs discovers them automatically.
 */
export const SHOTS = {
  // --- landscape / vista ------------------------------------------------
  vista_dawn: {
    doc: 'Wide establishing vista of the Leide badlands at dawn',
    time: 6.4, weather: 'clear',
    pos: [42, 26, 78], target: [-10, 6, -20], fov: 42,
  },
  vista_noon: {
    doc: 'Harsh midday sun over open grassland',
    time: 12.5, weather: 'clear',
    pos: [-60, 18, 60], target: [10, 4, -10], fov: 46,
  },
  vista_dusk: {
    doc: 'Golden hour, long shadows, sun near the horizon',
    time: 18.7, weather: 'clear',
    pos: [80, 22, -40], target: [0, 6, 10], fov: 40,
  },
  vista_night: {
    doc: 'Night under the Eos starfield with a bright moon',
    time: 23.2, weather: 'clear',
    pos: [30, 20, 55], target: [-6, 5, -5], fov: 44,
  },
  storm: {
    doc: 'Heavy rain and overcast storm light',
    time: 15.0, weather: 'storm',
    pos: [26, 12, 44], target: [-4, 3, 0], fov: 44,
  },

  // --- character --------------------------------------------------------
  hero_closeup: {
    doc: 'Over-shoulder close-up of Noctis, shallow depth of field',
    time: 17.6, weather: 'clear', follow: 'player',
    offset: [1.2, 1.75, 2.4], lookOffset: [0, 1.62, 0], fov: 34,
  },
  hero_full: {
    doc: 'Full-body hero shot showing outfit and silhouette',
    time: 10.0, weather: 'clear', follow: 'player',
    offset: [2.0, 1.5, 3.4], lookOffset: [0, 1.0, 0], fov: 38,
  },
  party_walk: {
    doc: 'The four-man party walking the road together',
    time: 16.2, weather: 'clear', follow: 'player',
    offset: [4.5, 2.4, 6.5], lookOffset: [0, 1.2, 0], fov: 40,
  },

  // --- combat -----------------------------------------------------------
  combat_wide: {
    doc: 'Mid-fight wide shot with enemies, VFX and party',
    time: 15.5, weather: 'clear', scenario: 'combat', follow: 'player',
    offset: [5.5, 3.6, 7.0], lookOffset: [0, 1.3, 0], fov: 46,
  },
  warp_strike: {
    doc: 'Warp-strike moment: blue crystal shards, motion streaks',
    time: 20.0, weather: 'clear', scenario: 'warp', follow: 'player',
    offset: [3.2, 2.4, 4.4], lookOffset: [0, 1.4, 0], fov: 50,
  },

  // --- UI ---------------------------------------------------------------
  hud_field: {
    doc: 'Gameplay framing with the full field HUD visible',
    time: 14.0, weather: 'clear', follow: 'player', hud: true,
    offset: [1.6, 2.0, 5.2], lookOffset: [0, 1.2, 0], fov: 50,
  },
  menu_main: {
    doc: 'Main menu / pause screen',
    time: 17.0, weather: 'clear', follow: 'player', hud: true, menu: 'main',
    offset: [1.6, 2.0, 5.2], lookOffset: [0, 1.2, 0], fov: 50,
  },
};
