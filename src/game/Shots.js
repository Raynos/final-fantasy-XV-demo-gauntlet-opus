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
 * World anchors these were composed against (8192 m world, north = -Z).
 * Every coordinate below was derived live from `src/world/terrain/Field.js`
 * (the same heightfield the game runs) rather than authored by eye — see
 * `tools/corpus.mjs --scout`. Landforms, from `src/world/map/WorldMap.js`:
 *   blackrockMesa (-430,-560) h163   northMesa   (-980,-1240) h410
 *   eastButtes    ( 560,-420) h102   westScarp   ( -640,  430) h137
 *   longwythePeak ( 900,-1180) h445  discCrater  (-1020,-2160) rim 210
 *   crownScarp    (3320, -900) h320  keycatrichRim (300,-1740) h156
 *   taelparCanyon x≈-2300, depth 235 · lestallumTerrace (-3060,-680) h122
 *   ravatoghCone  (-3420,-3160) h720 · vesperBasin (-3020,-2360) −20
 *   galdinShelf   sea −46 · caemHeadland (-2500,1980) h100
 * Man-made objects that exist as geometry (Props/Megastructures) and are worth
 * composing against, because most of the 124 map POIs are terrain pads only:
 *   Hammerhead town (-100,68) · haven camp (-62,-46) · obelisks (-104,-138),
 *   (168,-206), (-238,96) · fuel stop (road z=44) · imperial blockade (z=72)
 *   · layby (z=-60) · comms mast (-150,-350) · water tower (268,-258)
 *   · Solheim ruins (-500,330) · windpumps (-252,78) & (30,-91)
 *   · crashed dropship (-60,-230) · dungeon mouths (-112,-228), (294,-232),
 *     (110,356) · viaduct (-1010,-740)→(-790,300) · dreadnought (-1240,-1560)
 *   · escort flight (-820,-980) · meteor (-2010,1890) · Insomnia (2560,-3180)
 * The highway runs x=3520 @ z=512, x=60 @ z=18, x=-2960 @ z=-700.
 *
 * Shot fields (see `Game.applyShot`):
 *   pos/target/fov          absolute camera
 *   follow:'player' + offset/lookOffset   camera pinned to the party
 *   time (hours) · weather ('clear'|'overcast'|'storm'|'fog')
 *   scenario  ('field'|'combat'|'warp'|'boss_field'|'boss_imperial'
 *              |'boss_astral'|'daemons')
 *   story ('title' | {scene, at}) · hud · menu · dungeon
 *
 * Add shots here — tools/shoot.mjs discovers them automatically, and
 * `tools/corpus.mjs` groups them into per-category contact sheets using the
 * `// --- name ---` comment headers below.
 */
export const SHOTS = {
  // --- vista ------------------------------------------------------------
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
  vista_fog: {
    doc: 'Valley fog drowning the Hammerhead pan, the mesa floating clear of it',
    time: 7.1, weather: 'fog',
    pos: [180, 40, -300], target: [-430, 120, -560], fov: 46,
  },
  vista_overcast: {
    doc: 'Flat overcast light over the badlands — the same frame as vista_noon',
    time: 13.0, weather: 'overcast',
    pos: [180, 40, -300], target: [-430, 120, -560], fov: 46,
  },

  // --- daycycle ---------------------------------------------------------
  // One composition, six hours apart, so the day cycle is directly comparable.
  daycycle_dawn: {
    doc: 'The East Buttes at first light — comparison frame 1 of 4',
    time: 5.9, weather: 'clear',
    pos: [120, 34, -180], target: [560, 96, -420], fov: 40,
  },
  daycycle_noon: {
    doc: 'The same East Buttes frame at midday — comparison frame 2 of 4',
    time: 12.4, weather: 'clear',
    pos: [120, 34, -180], target: [560, 96, -420], fov: 40,
  },
  daycycle_dusk: {
    doc: 'The same East Buttes frame at golden hour — comparison frame 3 of 4',
    time: 18.9, weather: 'clear',
    pos: [120, 34, -180], target: [560, 96, -420], fov: 40,
  },
  daycycle_night: {
    doc: 'The same East Buttes frame under the moon — comparison frame 4 of 4',
    time: 0.6, weather: 'clear',
    pos: [120, 34, -180], target: [560, 96, -420], fov: 40,
  },

  // --- zones : Leide ----------------------------------------------------
  zone_longwythe: {
    doc: 'Longwythe: the black horn over the scrub pan, road cut across the flat',
    time: 8.2, weather: 'clear',
    pos: [330, 46, -640], target: [900, 400, -1180], fov: 40,
  },
  zone_three_valleys: {
    doc: 'The Three Valleys: three hogback fins in parallel, wash floors between',
    time: 16.6, weather: 'clear',
    pos: [900, 68, 1640], target: [1320, 78, 1000], fov: 44,
  },
  zone_ostium_gorge: {
    doc: 'Ostium Gorge: the Wall of Insomnia under the 320 m crown scarp',
    time: 9.4, weather: 'overcast',
    pos: [3342, 452, -756], target: [3520, 30, 512], fov: 44,
  },
  zone_vannath: {
    doc: 'Vannath Coast: the fast dry prairie the Galdin road crosses',
    time: 17.2, weather: 'clear',
    pos: [2796, 176, 1203], target: [2060, 22, 1280], fov: 46,
  },
  zone_galdin: {
    doc: 'Galdin Coast: Angelgard standing sheer out of the turquoise shallows',
    time: 17.8, weather: 'clear',
    pos: [2200, 34, 2140], target: [3010, 60, 3120], fov: 42,
  },
  zone_keycatrich: {
    doc: 'Keycatrich: the dust-choked rim the ruined spa town shelters under',
    time: 15.2, weather: 'clear',
    pos: [909, 448, -1191], target: [300, 200, -1740], fov: 42,
  },
  zone_callaegh: {
    doc: 'The Callaegh Steps: mine spoil benches above the Balouve shaft heads',
    time: 10.4, weather: 'clear',
    pos: [3497, 190, 1028], target: [2940, 158, 1300], fov: 44,
  },

  // --- zones : Duscae ---------------------------------------------------
  zone_alstor: {
    doc: 'Alstor Slough: standing water under the green haze, causeway beyond',
    time: 8.8, weather: 'overcast',
    pos: [-800, 152, 414], target: [-1320, -16, 820], fov: 44,
  },
  zone_malacchi: {
    doc: 'The Malacchi Hills: open chocobo prairie broken by lone broadleaf stands',
    time: 16.0, weather: 'clear',
    pos: [-2380, 24, 560], target: [-1900, 27, 220], fov: 46,
  },
  zone_nebulawood: {
    doc: 'The Nebulawood: the flat wet forest floor, dreadnought hanging over it',
    time: 11.5, weather: 'overcast',
    pos: [-1081, 256, -977], target: [-1620, 52, -1240], fov: 44,
  },
  zone_mencemoor: {
    doc: 'Mencemoor: the Disc of Cauthess crater from the spur on its rim',
    time: 17.0, weather: 'clear',
    pos: [-895, 468, -1269], target: [-1020, 253, -2160], fov: 42,
  },
  zone_taelpar: {
    doc: 'Taelpar Crag: the 235 m gorge and the neck the highway crosses on',
    time: 15.4, weather: 'clear',
    pos: [-2634, 132, -251], target: [-2300, 20, -700], fov: 44,
  },
  zone_fallgrove: {
    doc: 'The Fallgrove: grazed downland running south to the meteor shards',
    time: 17.4, weather: 'clear',
    pos: [-591, 166, 544], target: [-1400, 40, 1500], fov: 44,
  },

  // --- zones : Cleigne --------------------------------------------------
  zone_lestallum: {
    doc: 'The Lestallum Shelf: the basalt terrace 120 m above the plain',
    time: 18.0, weather: 'clear',
    pos: [-3601, 304, -330], target: [-2960, 122, -700], fov: 44,
  },
  zone_pallareth: {
    doc: 'Pallareth Pass: the canyon floor between a 320 m and a 250 m wall',
    time: 9.8, weather: 'clear',
    pos: [-2204, 314, -3437], target: [-1950, 93, -2960], fov: 46,
  },
  zone_vesperpool: {
    doc: 'The Vesperpool: dead trunks standing in black water below the causeway',
    time: 7.6, weather: 'fog',
    pos: [-2660, 60, -2080], target: [-3020, -21, -2360], fov: 44,
  },
  zone_ravatogh: {
    doc: 'The Rock of Ravatogh: 720 m of ash cone, the highest point in Lucis',
    time: 18.4, weather: 'clear',
    pos: [-1862, 434, -2531], target: [-3420, 500, -3160], fov: 40,
  },
  zone_malmalam: {
    doc: 'Malmalam Thicket: the shallow bowl the canopy closes over',
    time: 12.8, weather: 'overcast',
    pos: [-3499, 142, 2198], target: [-3260, 41, 1540], fov: 44,
  },
  zone_cape_caem: {
    doc: 'Cape Caem: the flat-topped headland and its cliffs into the sea',
    time: 18.2, weather: 'clear',
    pos: [-3525, 138, 2480], target: [-2500, 60, 1980], fov: 42,
  },

  // --- points of interest -----------------------------------------------
  poi_haven: {
    doc: 'A haven: the rune-marked camp rock and its fire, obelisk beyond',
    time: 19.6, weather: 'clear',
    pos: [-20, 11.5, 10], target: [-62, 9.5, -46], fov: 44,
  },
  poi_reststop: {
    doc: 'Coernix-style fuel stop on Route 1, canopy lit against the badlands',
    time: 18.8, weather: 'clear',
    pos: [78, 12.5, 110], target: [10, 9.5, 44], fov: 44,
  },
  poi_parking: {
    doc: 'The gravel lay-by and its bus shelter, highway running past',
    time: 16.4, weather: 'clear',
    pos: [-62, 11.5, -6], target: [-10, 9.5, -60], fov: 46,
  },
  poi_imperial: {
    doc: 'Imperial roadblock straddling the carriageway north of Hammerhead',
    time: 15.0, weather: 'overcast',
    pos: [96, 12.0, 132], target: [45, 9.5, 72], fov: 42,
  },
  poi_imperial_wreck: {
    doc: 'A crashed magitek dropship ploughed into the basin floor, still smoking',
    time: 17.6, weather: 'clear',
    pos: [-10, 13.0, -190], target: [-60, 16.5, -230], fov: 46,
  },
  poi_landmark: {
    doc: 'Blackrock Mesa read against the comms mast at its foot for scale',
    time: 16.2, weather: 'clear',
    pos: [-96, 32.0, -292], target: [-260, 90, -430], fov: 42,
  },
  poi_tomb: {
    doc: 'The Tomb of the Wise site under the Keycatrich rim (terrain pad only)',
    time: 8.6, weather: 'clear',
    pos: [-40, 100, -1440], target: [200, 175, -1700], fov: 42,
  },
  poi_menace: {
    doc: 'The Menace Beneath Keycatrich, in the shadow of the rim (pad only)',
    time: 21.4, weather: 'clear',
    pos: [-60, 112, -1380], target: [200, 165, -1690], fov: 44,
  },
  poi_chocobo: {
    doc: 'Wiz Chocobo Post: the level prairie the paddocks are laid out on',
    time: 9.2, weather: 'clear',
    pos: [-1900, 32, 700], target: [-2050, 26, 460], fov: 46,
  },
  poi_fishing: {
    doc: 'The Vesperpool East Bank fishing spot — drowned forest, black water',
    time: 6.9, weather: 'clear',
    pos: [-2640, 50, -2210], target: [-2900, -12, -2400], fov: 44,
  },
  poi_dungeon_mouth: {
    doc: 'The Keycatrich Trench blockhouse: an imperial door into the badlands',
    time: 16.8, weather: 'clear',
    pos: [-70, 11.5, -186], target: [-112, 20.5, -228], fov: 46,
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
  road_viaduct: {
    doc: 'The Solheim viaduct marching north-west out of the basin',
    time: 17.0, weather: 'clear',
    pos: [-771, 160, 386], target: [-940, 60, -300], fov: 42,
  },
  windpump_flats: {
    doc: 'Windpump and stock pens on the flats — the world is worked, not empty',
    time: 7.8, weather: 'clear',
    pos: [-190, 12, 140], target: [-252, 14, 78], fov: 46,
  },
  watertower_bench: {
    doc: 'Water tower on the East Buttes bench, buttes stacked behind it',
    time: 16.6, weather: 'clear',
    pos: [352, 16, -206], target: [268, 14, -258], fov: 44,
  },
  solheim_ruins: {
    doc: 'Solheim column ruins under the Spire Ridge fangs',
    time: 18.6, weather: 'clear',
    pos: [-424, 34, 268], target: [-520, 92, 340], fov: 42,
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
  town_diner: {
    doc: "Takka's diner: the shopfront, its sign and the people outside it",
    time: 18.4, weather: 'clear',
    pos: [-99, 16.2, 88], target: [-110.5, 15.0, 82], fov: 48,
  },
  town_shops: {
    doc: 'The pump island and shop row, awnings and price boards',
    time: 15.0, weather: 'clear',
    pos: [-118, 16.4, 68], target: [-101, 14.8, 56], fov: 50,
  },
  town_npcs: {
    doc: 'People at work on the forecourt — mechanics, a hunter, Cindy',
    time: 16.4, weather: 'clear',
    pos: [-80, 15.8, 64], target: [-95, 14.8, 58], fov: 46,
  },
  town_pylon: {
    doc: 'The Hammerhead pylon and its wrench sign against a dusty sky',
    time: 19.2, weather: 'overcast',
    pos: [-141, 17.5, 66], target: [-124, 24, 56], fov: 44,
  },

  // --- dungeons : Keycatrich Trench --------------------------------------
  // Interiors sit at their def `origin`; a room's world position is
  // origin + (room.x, room.y, room.z). Keycatrich origin (-112,-46,-228).
  dun_keycatrich_entry: {
    doc: 'Keycatrich Trench, the trench head: concrete, rebar and sodium strips',
    time: 12.0, dungeon: 'keycatrich',
    pos: [-112, -42.4, -216], target: [-112, -44.2, -244], fov: 52,
  },
  dun_keycatrich_corridor: {
    doc: 'Keycatrich: a caged emergency strip running the length of a corridor',
    time: 12.0, dungeon: 'keycatrich',
    pos: [-112, -44.2, -240], target: [-112, -45.6, -262], fov: 46,
  },
  dun_keycatrich_hall: {
    doc: 'Keycatrich: the barracks hall, big enough to fight in',
    time: 12.0, dungeon: 'keycatrich',
    pos: [-104, -45.6, -262], target: [-114, -47.6, -274], fov: 54,
  },
  dun_keycatrich_boss: {
    doc: 'Keycatrich: the command chamber at the bottom of the trench',
    time: 12.0, dungeon: 'keycatrich',
    pos: [-104, -50.5, -312], target: [-118, -53.4, -328], fov: 54,
  },

  // --- dungeons : Balouve Mines ------------------------------------------
  // Balouve origin (294,-34,-232).
  dun_balouve_entry: {
    doc: 'Balouve Mines, the adit: rail, timber and a headframe over the dark',
    time: 12.0, dungeon: 'balouve',
    pos: [294, -30.0, -220], target: [294, -32.0, -248], fov: 52,
  },
  dun_balouve_drift: {
    doc: 'Balouve: the level-one drift, ore rail underfoot',
    time: 12.0, dungeon: 'balouve',
    pos: [294, -32.6, -246], target: [294, -34.4, -266], fov: 46,
  },
  dun_balouve_shaft: {
    doc: 'Balouve: the main shaft, nineteen metres of timber gallery spiralling down',
    time: 12.0, dungeon: 'balouve',
    pos: [298, -35.5, -272], target: [294, -49.0, -284], fov: 58,
  },
  dun_balouve_boss: {
    doc: 'Balouve: The Deep — forty metres of worked-out cavern',
    time: 12.0, dungeon: 'balouve',
    pos: [300, -48.0, -296], target: [286, -52.5, -318], fov: 56,
  },

  // --- dungeons : Fociaugh Hollow ----------------------------------------
  // Fociaugh origin (110,-22,356).
  dun_fociaugh_entry: {
    doc: 'Fociaugh Hollow, the cave mouth: daylight dying against wet limestone',
    time: 12.0, dungeon: 'fociaugh',
    pos: [110, -18.0, 368], target: [110, -20.5, 342], fov: 52,
  },
  dun_fociaugh_narrows: {
    doc: 'Fociaugh: the Narrows, a squeeze between dripstone columns',
    time: 12.0, dungeon: 'fociaugh',
    pos: [113, -31.0, 322], target: [117, -32.6, 308], fov: 48,
  },
  dun_fociaugh_gallery: {
    doc: 'Fociaugh: the Dripstone Gallery, ten metres of ceiling above the ledge',
    time: 12.0, dungeon: 'fociaugh',
    pos: [118, -24.5, 342], target: [106, -27.0, 330], fov: 56,
  },
  dun_fociaugh_boss: {
    doc: 'Fociaugh: The Hollow — the spawning chamber at the bottom',
    time: 12.0, dungeon: 'fociaugh',
    pos: [122, -34.0, 300], target: [106, -39.0, 282], fov: 56,
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
  hero_face: {
    doc: 'Noctis in tight portrait — face, hair and the Lucian black',
    time: 16.4, weather: 'clear', follow: 'player',
    offset: [0.72, 1.78, 1.55], lookOffset: [0, 1.66, 0], fov: 30,
  },
  gladio_closeup: {
    doc: 'Gladiolus at his shield slot, off the left shoulder',
    time: 16.2, weather: 'clear', follow: 'player',
    offset: [-3.4, 1.85, 1.35], lookOffset: [-1.95, 1.55, -0.95], fov: 34,
  },
  ignis_closeup: {
    doc: 'Ignis at the strategist slot, off the right shoulder',
    time: 16.2, weather: 'clear', follow: 'player',
    offset: [3.35, 1.85, 0.95], lookOffset: [1.85, 1.55, -1.45], fov: 34,
  },
  prompto_closeup: {
    doc: 'Prompto trailing the formation with the camera round his neck',
    time: 16.2, weather: 'clear', follow: 'player',
    offset: [2.55, 1.80, -0.55], lookOffset: [0.85, 1.52, -2.75], fov: 34,
  },
  party_walk: {
    doc: 'The four-man party walking the road together',
    time: 16.2, weather: 'clear', follow: 'player',
    offset: [4.8, 2.75, 6.8], lookOffset: [0, 1.35, 0], fov: 42,
  },
  party_formation: {
    doc: 'The retinue in formation, read head-on: four silhouettes, four builds',
    time: 15.4, weather: 'clear', follow: 'player',
    offset: [0.9, 2.05, 7.4], lookOffset: [0.2, 1.35, -1.4], fov: 36,
  },
  party_dawn: {
    doc: 'The party on the move at first light, long shadows off the four of them',
    time: 6.6, weather: 'clear', follow: 'player',
    offset: [6.2, 2.4, 4.4], lookOffset: [0, 1.3, -0.8], fov: 40,
  },

  // --- combat -----------------------------------------------------------
  combat_wide: {
    doc: 'Mid-fight wide shot with enemies, VFX and party',
    time: 15.5, weather: 'clear', scenario: 'combat', follow: 'player',
    offset: [5.5, 4.0, 7.0], lookOffset: [0, 1.45, 0], fov: 46,
  },
  combat_hud: {
    doc: 'The combat HUD over a live fight: gauges, lock-on, damage numbers',
    time: 15.5, weather: 'clear', scenario: 'combat', follow: 'player', hud: true,
    offset: [4.2, 3.1, 6.2], lookOffset: [-0.6, 1.5, -3.0], fov: 48,
  },
  combat_stagger: {
    doc: 'A goblin taken off its feet — the stagger pose and its damage number',
    time: 15.5, weather: 'clear', scenario: 'combat', follow: 'player',
    offset: [6.4, 2.4, 2.6], lookOffset: [2.9, 1.05, -2.3], fov: 38,
  },
  combat_armiger: {
    doc: 'Armiger up: the phantom royal arms orbiting Noctis mid-swing',
    time: 15.5, weather: 'clear', scenario: 'combat', follow: 'player',
    offset: [3.4, 2.35, 4.6], lookOffset: [0, 1.55, -0.6], fov: 42,
  },
  combat_magic_fire: {
    doc: 'Fire flask landing on an MT trooper at the back of the fight',
    time: 15.5, weather: 'clear', scenario: 'combat', follow: 'player',
    offset: [6.0, 3.6, 2.2], lookOffset: [-2.0, 1.6, -12.0], fov: 40,
  },
  combat_magic_ice: {
    doc: 'Blizzard bloom on the left flank, frost spreading over the dirt',
    time: 15.5, weather: 'clear', scenario: 'combat', follow: 'player',
    offset: [2.4, 2.8, 4.2], lookOffset: [-7.2, 1.0, -6.4], fov: 40,
  },
  warp_strike: {
    doc: 'Warp-strike moment: blue crystal shards, motion streaks',
    time: 20.0, weather: 'clear', scenario: 'warp', follow: 'player',
    offset: [3.2, 2.5, 4.4], lookOffset: [0, 1.45, 0], fov: 50,
  },
  warp_wide: {
    doc: 'The whole warp arc read across the field, launch point to impact',
    time: 19.4, weather: 'clear', scenario: 'warp', follow: 'player',
    offset: [11.0, 5.4, 3.0], lookOffset: [0, 2.6, -8.0], fov: 46,
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
  daemon_storm: {
    doc: 'The same pack in a downpour — daemons are what the rain brings out',
    time: 1.4, weather: 'storm', scenario: 'daemons', follow: 'player',
    offset: [6.0, 3.4, 6.0], lookOffset: [-1.0, 1.5, -7.0], fov: 50,
  },

  // --- bestiary ---------------------------------------------------------
  // Each frames one species out of a posed scenario, close enough to read the
  // silhouette, the material and the animation pose.
  bestiary_sabertusk: {
    doc: 'Sabertusk caught airborne mid-pounce, the sword arc behind it',
    time: 15.5, weather: 'clear', scenario: 'combat', follow: 'player',
    offset: [3.6, 2.3, 0.6], lookOffset: [-2.0, 1.5, -3.6], fov: 40,
  },
  bestiary_goblin: {
    doc: 'Goblin: the small, quick, ugly one you meet first',
    time: 15.5, weather: 'clear', scenario: 'combat', follow: 'player',
    offset: [5.9, 2.0, 1.2], lookOffset: [2.9, 0.9, -2.3], fov: 36,
  },
  bestiary_mt: {
    doc: 'Magitek trooper mid-attack — the imperial rank and file',
    time: 15.5, weather: 'clear', scenario: 'combat', follow: 'player',
    offset: [2.4, 2.6, -4.5], lookOffset: [-2.0, 1.4, -12.0], fov: 40,
  },
  bestiary_irongiant: {
    doc: 'Iron Giant winding up: six metres of rusted plate and one huge blade',
    time: 15.5, weather: 'clear', scenario: 'combat', follow: 'player',
    offset: [-5.5, 3.2, -2.0], lookOffset: [-14.0, 3.0, -10.0], fov: 42,
  },
  bestiary_dualhorn: {
    doc: 'Dualhorn on the flank of the Bloodhorn fight',
    time: 16.2, weather: 'clear', scenario: 'boss_field', follow: 'player',
    offset: [-14.0, 3.0, -3.6], lookOffset: [-8.5, 1.7, -9.0], fov: 40,
  },
  bestiary_bloodhorn: {
    doc: 'Bloodhorn, the field mark: scarred hide and a broken horn',
    time: 16.2, weather: 'clear', scenario: 'boss_field', follow: 'player',
    offset: [4.5, 3.4, -6.0], lookOffset: [-1.5, 2.2, -13.0], fov: 42,
  },
  bestiary_magitek_armour: {
    doc: 'MA-X Cuirass at close range, vents open',
    time: 17.4, weather: 'clear', scenario: 'boss_imperial', follow: 'player',
    offset: [5.5, 4.2, -9.0], lookOffset: [-1.5, 3.4, -17.0], fov: 44,
  },
  bestiary_axeman: {
    doc: 'Imperial axeman: the heavy variant of the magitek line',
    time: 17.4, weather: 'clear', scenario: 'boss_imperial', follow: 'player',
    offset: [15.5, 2.8, -14.5], lookOffset: [10.5, 1.5, -20.0], fov: 38,
  },
  bestiary_titan: {
    doc: 'Titan: the Archaean, filling frame from a hundred metres away',
    time: 15.0, weather: 'clear', scenario: 'boss_astral', follow: 'player',
    offset: [14, 7.0, 6.0], lookOffset: [4, 18, -46], fov: 46,
  },
  bestiary_hobgoblin: {
    doc: 'Hobgoblin: the daemon that grows out of a goblin',
    time: 23.0, weather: 'clear', scenario: 'daemons', follow: 'player',
    offset: [0.4, 2.5, -1.4], lookOffset: [-6.4, 1.7, -8.0], fov: 38,
  },
  bestiary_bussemand: {
    doc: 'Bussemand mid-telegraph, night mist coming off it',
    time: 23.0, weather: 'clear', scenario: 'daemons', follow: 'player',
    offset: [10.4, 3.0, -5.2], lookOffset: [5.5, 2.0, -11.0], fov: 40,
  },
  bestiary_necromancer: {
    doc: 'Necromancer casting at the back of a daemon pack',
    time: 23.0, weather: 'clear', scenario: 'daemons', follow: 'player',
    offset: [-5.6, 2.9, -8.6], lookOffset: [-10.5, 1.8, -14.0], fov: 40,
  },
  bestiary_arachne: {
    doc: 'Arachne stalking in from the flank',
    time: 23.0, weather: 'clear', scenario: 'daemons', follow: 'player',
    offset: [13.6, 3.2, -10.4], lookOffset: [9.0, 1.7, -15.5], fov: 40,
  },

  // --- story ------------------------------------------------------------
  menu_title: {
    doc: 'Title screen over the attract camera',
    time: 18.55, weather: 'clear', story: 'title',
    pos: [430, 40, -60], target: [-640, 140, 430], fov: 42,
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
  cine_hammerhead: {
    doc: 'Chapter I at Hammerhead: Cindy, Cid and the car that needs paying for',
    time: 16.4, weather: 'clear', story: { scene: 'ch1_hammerhead', at: 14 },
    pos: [0, 0, 0], target: [0, 0, 0], fov: 34,
  },
  cine_longwythe: {
    doc: 'Chapter I: the Longwythe hunt briefing',
    time: 18.0, weather: 'clear', story: { scene: 'ch1_longwythe_hunt', at: 12 },
    pos: [0, 0, 0], target: [0, 0, 0], fov: 34,
  },
  cine_blockade: {
    doc: 'Chapter II: the imperial blockade on Route 1',
    time: 15.2, weather: 'overcast', story: { scene: 'ch2_blockade', at: 16 },
    pos: [0, 0, 0], target: [0, 0, 0], fov: 34,
  },
  cine_astral: {
    doc: 'Chapter V: the Archaean wakes under the Disc',
    time: 15.0, weather: 'storm', story: { scene: 'ch5_astral_awakening', at: 18 },
    pos: [0, 0, 0], target: [0, 0, 0], fov: 34,
  },

  // --- UI ---------------------------------------------------------------
  hud_field: {
    doc: 'Gameplay framing with the full field HUD visible',
    time: 14.0, weather: 'clear', follow: 'player', hud: true,
    offset: [1.7, 2.35, 5.4], lookOffset: [0, 1.35, 0], fov: 50,
  },
  hud_night: {
    doc: 'The field HUD after dark, compass and minimap carrying the frame',
    time: 22.4, weather: 'clear', follow: 'player', hud: true,
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
  menu_world: {
    doc: 'The world map: 19 zones, 124 POIs and the fast-travel network',
    time: 17.0, weather: 'clear', follow: 'player', hud: true, menu: 'world',
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
  menu_photo: {
    doc: "Photo mode over a vista — Prompto's viewfinder, dials and filters",
    time: 18.4, weather: 'clear', follow: 'player', hud: true, menu: 'photo',
    offset: [2.6, 2.6, 5.8], lookOffset: [0, 1.35, 0], fov: 46,
  },
};
