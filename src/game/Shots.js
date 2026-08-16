/**
 * Named cinematic shots used by the screenshot harness and the photo mode.
 * Each shot may set camera, world time-of-day, weather and gameplay state so
 * captures are reproducible frame-for-frame.
 *
 * Framing notes — every vista is composed rather than pointed:
 *   - the camera sits on high ground so the foreground reads as a plane the eye
 *     travels across, instead of a mound filling the bottom third,
 *   - a hero landmark sits off-centre (mesa / buttes / scarp), never dead centre,
 *   - the dirt highway runs diagonally through frame as a leading line, and
 *   - a man-made prop (obelisk, haven, the Regalia, telegraph poles) sits in the
 *     midground to give the landscape scale and to make the world look inhabited.
 *
 * World anchors these were composed against:
 *   blackrockMesa (-215,-395) h108   northMesa (-640,-900) h168
 *   eastButtes    ( 305,-300) h60    westScarp (-350, 300) h86
 *   spireRidge    (-545, 350) h72    canyon    (  60, 430)
 *   haven (-22,-46)  regalia (47,14)  obelisks (-104,-138) (168,-206) (-238,96)
 *   shack (-296,110) truck (455,-81)
 * The highway runs NE->SW: x=738 at z=-200, x=132 at z=0, x=-651 at z=200.
 *
 * Add shots here — tools/shoot.mjs discovers them automatically.
 */
export const SHOTS = {
  // --- landscape / vista ------------------------------------------------
  vista_dawn: {
    doc: 'Dawn over the basin from the western ridge, sun rising behind the buttes',
    time: 6.4, weather: 'clear',
    pos: [-380, 70, 180], target: [168, 26, -206], fov: 44,
  },
  vista_noon: {
    doc: 'Harsh midday over the badlands, Blackrock Mesa off to the left',
    time: 12.5, weather: 'clear',
    pos: [420, 46, -140], target: [-215, 48, -395], fov: 46,
  },
  vista_dusk: {
    doc: 'Golden hour looking west into the sun across the West Scarp',
    time: 18.7, weather: 'clear',
    pos: [300, 34, -20], target: [-350, 52, 300], fov: 42,
  },
  vista_night: {
    doc: 'Night over the haven, campfire as the one warm accent under the moon',
    time: 23.2, weather: 'clear',
    pos: [92, 36, 96], target: [-104, 14, -138], fov: 46,
  },
  storm: {
    doc: 'Storm front rolling over the basin — framed to show the cloud deck',
    time: 15.0, weather: 'storm',
    pos: [-380, 74, 200], target: [120, 62, -160], fov: 48,
  },

  // --- the world is inhabited -------------------------------------------
  regalia_road: {
    doc: 'The Regalia parked on the highway, telegraph poles receding',
    time: 17.4, weather: 'clear',
    pos: [66, 11, 42], target: [40, 7, 2], fov: 40,
  },
  haven_dusk: {
    doc: 'The haven and its campfire at blue hour, mesa behind',
    time: 20.1, weather: 'clear',
    pos: [16, 13, -8], target: [-30, 6, -58], fov: 44,
  },
  mesa_landmark: {
    doc: 'Blackrock Mesa close enough to read its strata, obelisk for scale',
    time: 16.0, weather: 'clear',
    pos: [40, 30, -110], target: [-215, 60, -395], fov: 38,
  },

  // --- character --------------------------------------------------------
  hero_closeup: {
    doc: 'Over-shoulder close-up of Noctis, shallow depth of field',
    time: 17.6, weather: 'clear', follow: 'player',
    offset: [1.15, 1.72, 2.25], lookOffset: [0, 1.60, 0], fov: 34,
  },
  hero_full: {
    doc: 'Full-body hero shot showing outfit and silhouette',
    time: 10.0, weather: 'clear', follow: 'player',
    offset: [2.3, 1.95, 4.2], lookOffset: [0, 1.15, 0], fov: 40,
  },
  party_walk: {
    doc: 'The four-man party walking the road together',
    time: 16.2, weather: 'clear', follow: 'player',
    offset: [4.8, 2.75, 6.8], lookOffset: [0, 1.35, 0], fov: 42,
  },

  // --- combat -----------------------------------------------------------
  combat_wide: {
    doc: 'Mid-fight wide shot with enemies, VFX and party',
    time: 15.5, weather: 'clear', scenario: 'combat', follow: 'player',
    offset: [5.5, 4.0, 7.0], lookOffset: [0, 1.45, 0], fov: 46,
  },
  warp_strike: {
    doc: 'Warp-strike moment: blue crystal shards, motion streaks',
    time: 20.0, weather: 'clear', scenario: 'warp', follow: 'player',
    offset: [3.2, 2.5, 4.4], lookOffset: [0, 1.45, 0], fov: 50,
  },

  // --- UI ---------------------------------------------------------------
  hud_field: {
    doc: 'Gameplay framing with the full field HUD visible',
    time: 14.0, weather: 'clear', follow: 'player', hud: true,
    offset: [1.7, 2.35, 5.4], lookOffset: [0, 1.35, 0], fov: 50,
  },
  menu_main: {
    doc: 'Main menu / pause screen',
    time: 17.0, weather: 'clear', follow: 'player', hud: true, menu: 'main',
    offset: [1.7, 2.35, 5.4], lookOffset: [0, 1.35, 0], fov: 50,
  },
};
