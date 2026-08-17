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
 * World anchors these were composed against (8192 m world, north = -Z):
 *   blackrockMesa (-430,-560) h163   northMesa (-980,-1240) h410
 *   eastButtes    ( 560,-420) h102   westScarp (-640, 430) h137
 *   longwythePeak ( 900,-1180) h445  discCauthess (-1020,-2160) h253
 *   hammerhead (60,18) h8   regalia (-19,14)   haven (-62,-46)
 * The highway runs x=3520 @ z=512, x=60 @ z=18, x=-2960 @ z=-700.
 *
 * Add shots here — tools/shoot.mjs discovers them automatically.
 */
export const SHOTS = {
  // --- landscape / vista ------------------------------------------------
  vista_dawn: {
    doc: 'Dawn over the basin from the western ridge, sun rising behind the buttes',
    time: 6.4, weather: 'clear',
    pos: [-660, 92, 400], target: [560, 90, -420], fov: 44,
  },
  vista_noon: {
    doc: 'Harsh midday over the badlands, Blackrock Mesa off to the left',
    time: 12.5, weather: 'clear',
    pos: [180, 40, -300], target: [-430, 120, -560], fov: 46,
  },
  vista_dusk: {
    doc: 'Golden hour looking west into the sun across the West Scarp',
    time: 18.7, weather: 'clear',
    pos: [430, 40, -60], target: [-640, 140, 430], fov: 42,
  },
  vista_night: {
    doc: 'Night over the haven, campfire as the one warm accent under the moon',
    time: 23.2, weather: 'clear',
    pos: [70, 22, 60], target: [-104, 12, -138], fov: 46,
  },
  storm: {
    doc: 'Storm front rolling over the basin — framed to show the cloud deck',
    time: 15.0, weather: 'storm',
    pos: [-700, 120, 340], target: [320, 80, -320], fov: 48,
  },

  // --- the world is inhabited -------------------------------------------
  regalia_road: {
    doc: 'The Regalia parked on the highway, telegraph poles receding',
    time: 17.4, weather: 'clear',
    pos: [16, 11.5, 48], target: [-19, 8.4, 14], fov: 40,
  },
  regalia_drive: {
    doc: 'Chase camera behind the Regalia at speed',
    time: 16.8, weather: 'clear', pos: [66, 11, 42], target: [40, 7, 2], fov: 52,
  },
  regalia_cruise: {
    doc: 'Low cinematic three-quarter on the highway',
    time: 18.4, weather: 'clear', pos: [66, 11, 42], target: [40, 7, 2], fov: 42,
  },
  regalia_night: {
    doc: 'Night drive, headlights carving the badlands',
    time: 22.6, weather: 'clear', pos: [66, 11, 42], target: [40, 7, 2], fov: 52,
  },
  regalia_cockpit: {
    doc: 'Over the bonnet at dusk',
    time: 17.9, weather: 'clear', pos: [66, 11, 42], target: [40, 7, 2], fov: 62,
  },
  haven_dusk: {
    doc: 'The haven and its campfire at blue hour, mesa behind',
    time: 20.1, weather: 'clear',
    pos: [8, 13, 18], target: [-62, 8, -46], fov: 44,
  },
  mesa_landmark: {
    doc: 'Blackrock Mesa close enough to read its strata, obelisk for scale',
    time: 16.0, weather: 'clear',
    pos: [-40, 42, -300], target: [-430, 130, -560], fov: 40,
  },


  // --- Hammerhead -------------------------------------------------------
  // Framed against the live anchors, not the town agent's worktree numbers —
  // merging the terrain reshape moved the graded pad ~84 m west of where it
  // measured them. Pad y=13.5; origin (-92.8, 77.1). pylon (-124,56)
  // pump (-101,56) huntBoard (-103,77) diner (-110,82) garageBay (-86,70)
  // caravan (-73,54) regaliaBay (-91,63)
  town_approach: {
    doc: 'Coming off the highway toward the Hammerhead pylon',
    time: 17.2, weather: 'clear',
    pos: [-146, 22, 22], target: [-104, 16, 64], fov: 46,
  },
  town_forecourt: {
    doc: 'Standing on the forecourt between the pumps and the garage',
    time: 16.0, weather: 'clear',
    pos: [-114, 16.5, 49], target: [-90, 15, 73], fov: 52,
  },
  town_wide: {
    doc: 'The whole truck stop read against the badlands',
    time: 18.2, weather: 'clear',
    pos: [-34, 36, 26], target: [-100, 17, 68], fov: 40,
  },
  town_garage: {
    doc: "Cid's garage, roller bay open with a car on the lift",
    time: 15.4, weather: 'clear',
    pos: [-97, 16, 61], target: [-84, 14.6, 72], fov: 44,
  },
  town_board: {
    doc: 'The hunt board with Dave beside it',
    time: 16.8, weather: 'clear',
    pos: [-98.5, 15.4, 69], target: [-103.4, 14.4, 77], fov: 40,
  },
  town_caravan: {
    doc: 'The caravan and its awning',
    time: 16.2, weather: 'clear',
    pos: [-85, 16, 46], target: [-72.5, 14.4, 54.5], fov: 44,
  },
  town_night: {
    doc: 'Hammerhead after dark under the floodlights',
    time: 21.6, weather: 'clear',
    pos: [-121, 19, 40], target: [-97, 15.5, 70], fov: 48,
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

  boss_field: {
    doc: 'Bloodhorn mid-charge',
    time: 16.2, weather: 'clear', scenario: 'boss_field', follow: 'player',
    offset: [-7.2, 3.6, 9.0], lookOffset: [0, 1.8, -6], fov: 46,
  },
  boss_imperial: {
    doc: 'MA-X Cuirass venting',
    time: 17.4, weather: 'clear', scenario: 'boss_imperial', follow: 'player',
    offset: [-8.4, 4.4, 10.5], lookOffset: [0, 3, -9], fov: 48,
  },
  boss_astral: {
    doc: 'Titan winding up the slam',
    time: 15.0, weather: 'clear', scenario: 'boss_astral', follow: 'player',
    offset: [10, 5.5, 20], lookOffset: [2, 16, -34], fov: 52,
  },
  daemon_night: {
    doc: 'A daemon pack after dark',
    time: 23.0, weather: 'clear', scenario: 'daemons', follow: 'player',
    offset: [4.5, 3.2, 8.5], lookOffset: [0, 1.5, -6], fov: 48,
  },

  // --- story ------------------------------------------------------------
  menu_title: {
    doc: 'Title screen over the attract camera',
    time: 18.55, weather: 'clear', story: 'title',
    pos: [330, 38, -58], target: [-336, 52, 272], fov: 42,
  },
  cine_opening: {
    doc: 'Chapter I: the four pushing the Regalia at dusk',
    time: 18.25, weather: 'clear', story: { scene: 'ch1_opening_push', at: 25 },
    pos: [0, 0, 0], target: [0, 0, 0], fov: 36,
  },
  cine_fall: {
    doc: 'Chapter III: the morning Insomnia falls',
    time: 6.4, weather: 'overcast', story: { scene: 'ch3_the_fall', at: 22 },
    pos: [0, 0, 0], target: [0, 0, 0], fov: 26,
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
  menu_ascension: {
    doc: 'The Ascension grid — 106 real nodes across nine constellations',
    time: 17.0, weather: 'clear', follow: 'player', hud: true, menu: 'ascension',
    offset: [1.7, 2.35, 5.4], lookOffset: [0, 1.35, 0], fov: 50,
  },
  menu_inventory: {
    doc: 'The item list, read from the party\'s real bag',
    time: 17.0, weather: 'clear', follow: 'player', hud: true, menu: 'inventory',
    offset: [1.7, 2.35, 5.4], lookOffset: [0, 1.35, 0], fov: 50,
  },
  menu_gear: {
    doc: 'Equipment cards for the four of them',
    time: 17.0, weather: 'clear', follow: 'player', hud: true, menu: 'gear',
    offset: [1.7, 2.35, 5.4], lookOffset: [0, 1.35, 0], fov: 50,
  },
  menu_map: {
    doc: 'The chart of Lucis with live quest waypoints and havens',
    time: 17.0, weather: 'clear', follow: 'player', hud: true, menu: 'map',
    offset: [1.7, 2.35, 5.4], lookOffset: [0, 1.35, 0], fov: 50,
  },
  menu_shop: {
    doc: 'A shop counter trading against the real gil economy',
    time: 17.0, weather: 'clear', follow: 'player', hud: true, menu: 'shop',
    offset: [1.7, 2.35, 5.4], lookOffset: [0, 1.35, 0], fov: 50,
  },
  menu_hunts: {
    doc: 'The hunt board — 12 hunts, star ranks, hunter-rank ladder',
    time: 17.0, weather: 'clear', follow: 'player', hud: true, menu: 'hunts',
    offset: [1.7, 2.35, 5.4], lookOffset: [0, 1.35, 0], fov: 50,
  },
};
