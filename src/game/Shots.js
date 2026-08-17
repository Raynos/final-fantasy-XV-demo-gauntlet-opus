/**
 * Named cinematic shots used by the screenshot harness and the photo mode.
 * Each shot may set camera, world time-of-day, weather and gameplay state so
 * captures are reproducible frame-for-frame.
 *
 * Framing notes — every vista is composed rather than pointed:
 *   - the camera sits on high ground so the foreground reads as a plane the eye
 *     travels across, instead of a mound filling the bottom third,
 *   - a hero landmark sits off-centre (mesa / buttes / scarp), never dead centre.
 *     `target` is the point the frame centres on, so putting a landform at a
 *     third means aiming *beside* it: `tools/corpus.mjs --frame` solves the aim
 *     point for a subject, a fov and a screen position,
 *   - the highway runs diagonally through frame as a leading line, and
 *   - a man-made prop (obelisk, haven, the Regalia, a headframe) sits in the
 *     midground to give the landscape scale and to make the world look inhabited.
 *
 * ### Deriving coordinates
 * Every number below was measured against the *live* world, not read out of a
 * source file, because both have moved under this file before:
 *   - `Ecology._layoutSites()` places props by arc length along the road, so
 *     the "z = 44" fuel stop actually stands at **x 576**; Hammerhead is built
 *     on that site and its pad is **(576, 16.2, 10)**, 600 m east of where the
 *     previous revision of this file aimed,
 *   - dungeon interiors sit at their def `origin` and a room's world position
 *     is `origin + (room.x, room.y, room.z)` — a camera one room-width out is
 *     outside the shell, looking at the back of it.
 * Derive, then look at the contact sheet: `node tools/corpus.mjs`.
 *
 * ### Live world anchors (8192 m world, north = -Z)
 * Landforms (`src/world/map/WorldMap.js` LANDFORMS):
 *   blackrockMesa (-430,-560) h163   northMesa   (-980,-1240) h410
 *   eastButtes    ( 560,-420) h104   westScarp   ( -640,  430) h137
 *   longwythePeak ( 900,-1180) h445  discCrater  (-1020,-2160) rim 210
 *   crownScarp    (3320, -900) h320  keycatrichRim (300,-1740) h156
 *   taelparCanyon x≈-2300, depth 235 · lestallumTerrace (-3060,-680) h122
 *   ravatoghCone  (-3420,-3160) h720 · vesperBasin (-3020,-2360) −20
 *   galdinShelf sea −46 · caemHeadland (-2500,1980) h100
 * Built geometry — the whole list of man-made things that actually exist:
 *   Hammerhead pad (576,16.2,10): pylon (600.6,38.4) pump (578.8,32.4)
 *     huntBoard (586,13.2) diner (593.6,10) garageBay (568,14.5)
 *     caravan (550.8,27.2) regaliaBay (570.8,23.2) culless (603.4,22.5)
 *   haven camp (-99.6,7.1,-59.7) · obelisks (-104,-138) (168,-206) (-238,96)
 *   imperial blockade (1198.9,72) · layby + shelter (-769.7,-45.2)
 *   comms mast (-158,-325) · water tower (261.8,-239) · Solheim ruins (-500,330)
 *   windpumps (-252,78) (30,-91) · dead truck (-850,-67) · wrecks (483,48)
 *     (-1000,-113) · shack (1390,81) · crashed dropship (-60,-230)
 *   dungeon mouths: Keycatrich (-112.8,18.1,-229.1) Balouve (293.6,10.5,-232.2)
 *     Fociaugh (110.3,12.9,355.6)
 *   Megastructures: viaduct (-1010,-740)→(-790,300) · dreadnought (-1240,470,-1560)
 *     escort flight (-820,300,-980) · Insomnia (2560,150,-3180) · meteor (-2010,1890)
 *   Regalia parked (-19.2,12) · party spawn ≈ (1, 8.4, 1)
 * Party formation, in world deltas from Noctis at spawn:
 *   Gladiolus (-2.35,-0.29,-0.79) · Ignis (0.13,-0.49,-2.86)
 *   Prompto (-1.39,-0.95,-3.37)
 *
 * ### Shot fields (see `Game.applyShot`)
 *   pos / target / fov                    absolute camera
 *   follow:'player' + offset / lookOffset camera pinned to the party, world axes
 *   time (hours) · weather 'clear'|'overcast'|'storm'|'fog'
 *   scenario 'field'|'combat'|'warp'|'boss_field'|'boss_imperial'|'boss_astral'
 *            |'daemons'          (src/game/Director.js)
 *   story 'title' | {scene, at}  · hud · menu · dungeon
 *
 * ### Order matters
 * The harness renders in file order on one page, so anything that displaces the
 * party is filed late: the cutscenes (`Cinematics.stage` leaves the cast where
 * the scene put them) and the dungeons (leaving puts the party at the mouth)
 * come after every `follow:` shot. Combat scenarios turn Noctis to face -Z and
 * nothing turns him back, so the character framings run before them.
 *
 * Add shots here — tools/shoot.mjs discovers them automatically, and
 * `tools/corpus.mjs` files them into per-category contact sheets by the
 * `// --- name ---` headers below.
 */
export const SHOTS = {
  // --- vista ------------------------------------------------------------
  vista_dawn: {
    doc: 'Dawn from the top of the West Scarp, the whole basin between here and the buttes',
    time: 6.4, weather: 'clear',
    pos: [-640, 143, 430], target: [743, 116, -162], fov: 44,
  },
  vista_noon: {
    doc: 'Harsh midday over the badlands, Blackrock Mesa off to the left',
    time: 12.5, weather: 'clear',
    pos: [180, 40, -300], target: [-430, 120, -560], fov: 46,
  },
  vista_dusk: {
    doc: 'Golden hour looking west into the sun across the West Scarp',
    gait: 'walk',
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
    pos: [-460, 80, 420], target: [472, 109, -159], fov: 48,
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
  // One composition, four times, so the day cycle is directly comparable: the
  // East Buttes behind a water tower and a stand of savanna trees for scale.
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
    doc: 'Longwythe: the black horn on the right, the tutorial country under it',
    time: 8.2, weather: 'clear',
    pos: [330, 46, -640], target: [1006, 519, -1013], fov: 40,
  },
  zone_three_valleys: {
    doc: 'The Three Valleys: hogback fins running away from the Insomnia skyline',
    time: 16.6, weather: 'clear',
    pos: [900, 72, 1640], target: [1181, 147, 911], fov: 44,
  },
  zone_ostium_gorge: {
    doc: 'Ostium Gorge: the Wall of Insomnia under the 320 m crown scarp',
    time: 9.4, weather: 'overcast',
    pos: [3342, 452, -756], target: [3237, 94, 545], fov: 44,
  },
  zone_vannath: {
    doc: 'Vannath Coast: the fast dry prairie the Galdin road crosses',
    time: 17.2, weather: 'clear',
    pos: [2796, 176, 1203], target: [2074, 65, 1461], fov: 46,
  },
  zone_galdin: {
    doc: 'Galdin Coast: Angelgard standing sheer out of the turquoise shallows',
    time: 17.8, weather: 'clear',
    pos: [2420, 26, 2180], target: [2800, 173, 3246], fov: 40,
  },
  zone_keycatrich: {
    doc: 'Keycatrich: the dust-choked rim the ruined spa town shelters under',
    time: 15.2, weather: 'clear',
    pos: [640, 104, -1320], target: [217, 237, -1664], fov: 42,
  },
  zone_callaegh: {
    doc: 'The Callaegh Steps: mine spoil benches above the Balouve shaft heads',
    time: 10.4, weather: 'clear',
    pos: [3320, 88, 900], target: [3031, 194, 1379], fov: 44,
  },

  // --- zones : Duscae ---------------------------------------------------
  zone_alstor: {
    doc: 'Alstor Slough: standing water under the green haze, the road on its bank',
    time: 8.8, weather: 'overcast',
    pos: [-800, 152, 414], target: [-1396, -59, 705], fov: 44,
  },
  zone_malacchi: {
    doc: 'The Malacchi Hills: open chocobo prairie broken by lone broadleaf stands',
    time: 16.0, weather: 'clear',
    pos: [-2380, 30, 560], target: [-1823, 52, 329], fov: 46,
  },
  zone_nebulawood: {
    doc: 'The Nebulawood: wet forest floor with the Niflheim dreadnought over it',
    time: 11.5, weather: 'overcast',
    pos: [-1081, 256, -977], target: [-1364, 109, -1535], fov: 44,
  },
  zone_mencemoor: {
    doc: 'Mencemoor: the Disc of Cauthess crater seen from a spur of its rim',
    time: 17.0, weather: 'clear',
    pos: [-895, 468, -1269], target: [-846, 288, -2193], fov: 42,
  },
  zone_taelpar: {
    doc: 'Taelpar Crag: the 235 m gorge the highway crosses at its neck',
    time: 15.4, weather: 'clear',
    pos: [-2140, 90, -620], target: [-2253, -60, -827], fov: 46,
  },
  zone_fallgrove: {
    doc: 'The Fallgrove: grazed downland running south-west to the meteor shards',
    time: 17.4, weather: 'clear',
    pos: [-591, 166, 544], target: [-2300, 275, 1584], fov: 44,
  },

  // --- zones : Cleigne --------------------------------------------------
  zone_lestallum: {
    doc: 'The Lestallum Shelf: a level basalt terrace 120 m above the plain',
    time: 18.0, weather: 'clear',
    pos: [-3601, 304, -330], target: [-3040, 107, -831], fov: 44,
  },
  zone_pallareth: {
    doc: 'Pallareth Pass: the canyon floor between a 320 m and a 250 m wall',
    time: 9.8, weather: 'clear',
    pos: [-1700, 177, -3320], target: [-2159, 30, -3085], fov: 46,
  },
  zone_vesperpool: {
    doc: 'The Vesperpool: black water below the causeway bench, mist on it',
    time: 7.6, weather: 'fog',
    pos: [-2660, 60, -2080], target: [-2963, -50, -2425], fov: 44,
  },
  zone_ravatogh: {
    doc: 'The Rock of Ravatogh: 720 m of ash cone, the highest point in Lucis',
    time: 17.2, weather: 'clear',
    pos: [-2600, 122, -2700], target: [-3290, 662, -3317], fov: 42,
  },
  zone_malmalam: {
    doc: 'Malmalam Thicket: the shallow bowl the canopy closes over',
    time: 12.8, weather: 'overcast',
    pos: [-3260, 34, 2100], target: [-3398, 59, 1568], fov: 46,
  },
  zone_cape_caem: {
    doc: 'Cape Caem: the flat-topped headland and its cliffs into the sea',
    time: 18.2, weather: 'clear',
    pos: [-3525, 138, 2480], target: [-2396, 144, 2189], fov: 42,
  },

  // --- points of interest -----------------------------------------------
  // Of the 124 map POIs, only these types have built geometry today: haven,
  // parking (the lay-by), imperial (the roadblock and the crash site), the
  // three dungeon mouths, the landmark props and Hammerhead. Royal tombs,
  // menace lairs, chocobo posts and fishing stages are terrain pads and map
  // entries only — the three shots below say so in their doc rather than
  // pretending. The full type set is reviewable in `menu_map_wide`.
  poi_haven: {
    doc: 'A haven: the rune-marked camp rock and its fire on a raised flat',
    time: 18.4, weather: 'clear',
    pos: [-86, 9.9, -42], target: [-97, 9, -62], fov: 42,
  },
  poi_parking: {
    doc: 'A parking spot: the gravel lay-by and its bus shelter off Route 1',
    time: 16.4, weather: 'clear',
    pos: [-736, 41, -12], target: [-763, 29, -51], fov: 46,
  },
  poi_reststop: {
    doc: 'A rest stop: the Hammerhead caravan, where you cook and save',
    time: 19.0, weather: 'clear',
    pos: [563, 18.4, 37], target: [552, 18, 25], fov: 46,
  },
  poi_imperial: {
    doc: 'An imperial base: the roadblock straddling Route 1 north of Longwythe',
    time: 15.0, weather: 'overcast',
    pos: [1176, 16.9, 36], target: [1193, 18, 76], fov: 44,
  },
  poi_imperial_wreck: {
    doc: 'A crashed magitek dropship ploughed into the basin floor, still smoking',
    time: 17.6, weather: 'clear',
    pos: [-14, 12, -196], target: [-66, 19, -222], fov: 46,
  },
  poi_landmark: {
    doc: 'A landmark: Blackrock Mesa, with the comms mast at its foot for scale',
    time: 16.2, weather: 'clear',
    pos: [-250, 37.5, -230], target: [-481, 182, -525], fov: 40,
  },
  poi_dungeon_mouth: {
    doc: 'A dungeon entrance: the Keycatrich Trench blockhouse in the badlands',
    time: 16.8, weather: 'clear',
    pos: [-103, 16.5, -216], target: [-111, 21, -230], fov: 48,
  },
  poi_dungeon_mine: {
    doc: 'A dungeon entrance: the Balouve Mines headframe over its adit',
    time: 10.6, weather: 'clear',
    pos: [279, 13, -240], target: [295, 16, -235], fov: 48,
  },
  poi_dungeon_cave: {
    doc: 'A dungeon entrance: the Fociaugh Hollow cave mouth',
    time: 14.2, weather: 'overcast',
    pos: [119, 14.4, 342], target: [108, 15, 354], fov: 48,
  },
  poi_fishing: {
    doc: 'A fishing spot: Galdin Shoals, Angelgard offshore — no stage built yet',
    time: 7.4, weather: 'clear',
    pos: [2200, 17.5, 2260], target: [2843, 155, 3272], fov: 42,
  },
  poi_tomb: {
    doc: 'A royal tomb: the Tomb of the Wise site under the Keycatrich rim (pad only)',
    time: 8.6, weather: 'clear',
    pos: [640, 104, -1320], target: [95, 165, -1596], fov: 44,
  },
  poi_chocobo: {
    doc: 'A chocobo post: the Wiz paddock prairie in the Malacchi Hills (pad only)',
    time: 9.2, weather: 'clear',
    pos: [-1900, 28, 700], target: [-2093, 35, 487], fov: 46,
  },
  poi_menace: {
    doc: 'A menace lair: the Menace Beneath Keycatrich, under the rim (pad only)',
    time: 21.4, weather: 'clear',
    pos: [-40, 97, -1440], target: [163, 155, -1484], fov: 44,
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
    doc: 'The haven and its campfire at blue hour, the pan going cold behind it',
    time: 20.1, weather: 'clear',
    pos: [-66, 11, -24], target: [-104, 9, -57], fov: 44,
  },
  mesa_landmark: {
    doc: 'Blackrock Mesa close enough to read its strata, obelisk for scale',
    time: 16.0, weather: 'clear',
    pos: [-40, 26, -300], target: [-471, 180, -489], fov: 40,
  },
  obelisk_dusk: {
    doc: 'A ruined pylon against the last light — the shape you navigate by',
    time: 19.4, weather: 'clear',
    pos: [-70, 10.2, -104], target: [-98, 19, -143], fov: 44,
  },
  road_viaduct: {
    doc: 'The Solheim viaduct marching north out of the basin, road beneath it',
    time: 17.0, weather: 'clear',
    pos: [-880, 80, 120], target: [-879, 56, -360], fov: 42,
  },
  windpump_flats: {
    doc: 'Windpump and stock pens on the flats — the world is worked, not empty',
    time: 7.8, weather: 'clear',
    pos: [-208, 11.7, 124], target: [-244, 15, 70], fov: 46,
  },
  watertower_bench: {
    doc: 'Water tower on the East Buttes bench, buttes stacked behind it',
    time: 16.6, weather: 'clear',
    pos: [300, 15.4, -198], target: [255, 18, -233], fov: 44,
  },
  solheim_ruins: {
    doc: 'Solheim column ruins on the ridge under the Spire Ridge fangs',
    time: 18.6, weather: 'clear',
    pos: [-452, 45, 282], target: [-488, 95, 339], fov: 46,
  },
  roadside_wreck: {
    doc: 'A burnt-out car on the shoulder, telegraph line running past it',
    time: 15.6, weather: 'overcast',
    pos: [524, 23.9, 90], target: [490, 14, 42], fov: 46,
  },
  broken_truck: {
    doc: 'The broken-down haulier on the far shoulder, west of the Fallgrove turn',
    time: 8.4, weather: 'clear',
    pos: [-812, 31.7, -30], target: [-857, 28, -60], fov: 46,
  },
  abandoned_shack: {
    doc: 'An abandoned roadside outpost out on the Longwythe flats',
    time: 17.8, weather: 'clear',
    pos: [1348, 14.2, 124], target: [1383, 17, 74], fov: 46,
  },
  landmark_insomnia: {
    doc: 'The Crown City on the northern horizon, its spires still lit',
    time: 19.8, weather: 'clear',
    pos: [2900, 82, -2760], target: [2646, 352, -3237], fov: 44,
  },
  landmark_meteor: {
    doc: 'The Meteor of the Disc, fissures still burning in the south-west',
    time: 18.8, weather: 'clear',
    pos: [-1760, 87, 2150], target: [-2055, 102, 1933], fov: 44,
  },
  landmark_dreadnought: {
    doc: 'The Niflheim dreadnought hanging nose-down over the Nebulawood',
    time: 13.4, weather: 'overcast',
    pos: [-895, 468, -1269], target: [-1180, 470, -1520], fov: 40,
  },

  // --- Hammerhead -------------------------------------------------------
  // The town is built on the Ecology `reststop` site, pad centre (576, 16.2, 10)
  // and yaw ≈ π. Anchors and the eleven residents were read out of the running
  // game; see the header. Terrain around the pad sits ~3 m lower, so a camera
  // off the apron stands at y ≈ 17.5 to be eye-level with it.
  town_approach: {
    doc: 'Coming off the highway toward the Hammerhead pylon and its wrench sign',
    time: 17.2, weather: 'clear',
    pos: [644, 17.5, 66], target: [606, 28, 31], fov: 46,
  },
  town_wide: {
    doc: 'The whole truck stop read against the badlands from the east',
    time: 18.2, weather: 'clear',
    pos: [672, 42, -38], target: [586, 17, 30], fov: 40,
  },
  town_forecourt: {
    doc: 'Standing on the forecourt between the pumps and the garage',
    time: 16.0, weather: 'clear',
    pos: [592, 18.6, 32], target: [570, 18, 20], fov: 50,
  },
  town_garage: {
    doc: "Cid's garage, roller bay open with a car on the lift",
    time: 15.4, weather: 'clear',
    pos: [580, 18.4, 24], target: [566, 18, 9], fov: 46,
  },
  town_board: {
    doc: 'The hunt board with Dave beside it',
    time: 16.8, weather: 'clear',
    pos: [579, 17.9, 19.5], target: [585, 17, 13], fov: 40,
  },
  town_diner: {
    doc: "Takka's diner: the counter, the sign and the cook behind it",
    time: 18.4, weather: 'clear',
    pos: [598, 18.8, 22], target: [592, 18, 12], fov: 48,
  },
  town_shops: {
    doc: 'The pump island and shop row, awnings and price boards',
    time: 15.0, weather: 'clear',
    pos: [596, 18.6, 26], target: [578, 18, 30], fov: 50,
  },
  town_npcs: {
    doc: 'People at work on the apron — Cindy at the bay, two garage hands behind her',
    time: 16.4, weather: 'clear',
    pos: [574, 18.2, 20], target: [567, 17, 15], fov: 40,
  },
  town_caravan: {
    doc: 'The caravan and its awning at the west end of the lot',
    time: 16.2, weather: 'clear',
    pos: [563, 18.4, 37], target: [552, 18, 25], fov: 46,
  },
  town_regalia_bay: {
    doc: 'The Regalia bay, where the car goes when Cindy has it',
    time: 17.6, weather: 'clear',
    pos: [584, 18.8, 34], target: [573, 18, 21], fov: 48,
  },
  town_pylon: {
    doc: 'The Hammerhead pylon and its wrench sign, lit from the west',
    time: 19.2, weather: 'overcast',
    pos: [589, 19.4, 46], target: [601, 29, 40], fov: 44,
  },
  town_night: {
    doc: 'Hammerhead after dark under the floodlights, the one lit thing in Leide',
    time: 21.6, weather: 'clear',
    pos: [640, 29, 60], target: [578, 19, 31], fov: 46,
  },

  // --- character --------------------------------------------------------
  // `follow` offsets are world-axis deltas from Noctis, so these are composed
  // against the party's *measured* formation, not the slot vectors in Party.js,
  // which live in the player's frame. Measured at this point in the run order
  // (heading -1.58, so the four of them face -X):
  //   Gladiolus (0.82, 0.15, -1.89) · Ignis (1.16, 0.30, 1.89)
  //   Prompto (2.53, 0.34, 0.91)
  // That is fragile by construction: insert a shot that turns Noctis before
  // these and the three companion portraits swap round. The durable fix is a
  // two-line change in `Game.applyShot` letting `follow` name a party member
  // instead of only 'player' — see the corpus report.
  //
  // Every framing below also obeys one hard rule: **a character's root (their
  // feet) must stay inside the frame**. A SkinnedMesh is frustum-culled against
  // its *bind-pose* bounding sphere, which for these rigs sits at the origin
  // with a small radius while the posed vertices reach 2 m above it — so the
  // instant the root leaves the frustum the whole character disappears even
  // though they plainly fill the shot. That is why there is no head-and-
  // shoulders portrait here: it is not framable until the meshes stop being
  // culled (one line in `src/characters/rig/Character.js`, see the report).
  hero_closeup: {
    doc: 'Noctis in a medium three-quarter, the retinue behind his shoulder',
    time: 17.6, weather: 'clear', follow: 'player',
    offset: [1.9, 1.75, 3.2], lookOffset: [0, 1.05, 0], fov: 36,
  },
  hero_full: {
    doc: 'Full-body hero shot showing outfit and silhouette',
    time: 10.0, weather: 'clear', follow: 'player',
    offset: [2.3, 1.95, 4.2], lookOffset: [0, 1.15, 0], fov: 40,
  },
  hero_face: {
    doc: 'Noctis close, three-quarter on — face, hair and the Lucian black',
    time: 16.4, weather: 'clear', follow: 'player',
    offset: [2.6, 1.6, 2.9], lookOffset: [0, 0.95, 0], fov: 34,
  },
  gladio_closeup: {
    doc: 'Gladiolus, the shield: the build, the scar and the greatsword',
    time: 16.2, weather: 'clear', follow: 'player',
    offset: [-2.38, 1.85, -3.29], lookOffset: [0.82, 1.10, -1.89], fov: 34,
  },
  ignis_closeup: {
    doc: 'Ignis, the strategist: glasses, gloves and the daggers',
    time: 16.2, weather: 'clear', follow: 'player',
    offset: [-2.04, 2.00, 3.29], lookOffset: [1.16, 1.25, 1.89], fov: 34,
  },
  prompto_closeup: {
    doc: 'Prompto, the gunner: the wristbands, the camera and the grin',
    time: 16.2, weather: 'clear', follow: 'player',
    offset: [-0.87, 2.04, 2.41], lookOffset: [2.53, 1.29, 0.91], fov: 34,
  },
  party_formation: {
    doc: 'The retinue read head-on: four faces, four builds, four weapons',
    time: 15.4, weather: 'clear', follow: 'player',
    offset: [-6.5, 2.15, 0.6], lookOffset: [0.9, 1.35, 0.2], fov: 38,
  },
  party_walk: {
    doc: 'The four-man party walking the road together',
    gait: 'walk',
    time: 16.2, weather: 'clear', follow: 'player',
    offset: [4.8, 2.75, 6.8], lookOffset: [0, 1.35, 0], fov: 42,
  },
  party_dawn: {
    doc: 'The party on the move at first light, long shadows off the four of them',
    time: 6.6, weather: 'clear', follow: 'player',
    offset: [6.2, 2.4, 4.4], lookOffset: [-0.7, 1.2, -1.4], fov: 40,
  },

  // --- UI ---------------------------------------------------------------
  hud_field: {
    doc: 'Gameplay framing with the full field HUD visible',
    gait: 'walk',
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
  menu_map_wide: {
    doc: 'The atlas of Lucis fully surveyed, all 124 points shown',
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
  // Each of these frames one species out of a posed scenario, close enough to
  // read the silhouette, the material and the animation pose. Twelve of the
  // twenty-one species are reachable this way; the rest need a `cast` hook in
  // Director (see the corpus report).
  bestiary_sabertusk: {
    doc: 'Sabertusk caught airborne mid-pounce, jaws open',
    time: 15.5, weather: 'clear', scenario: 'combat', follow: 'player',
    offset: [-6.6, 2.2, -1.4], lookOffset: [-2.0, 1.4, -3.6], fov: 40,
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
    doc: 'Iron Giant winding up: rusted plate and one huge blade',
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
    doc: 'Titan: the Archaean, filling frame from fifty metres away',
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

  // --- dungeons : Keycatrich Trench --------------------------------------
  // Interior origin (-112, -46, -228); a room's world position is
  // origin + (room.x, room.y, room.z) and its floor is origin.y + room.y.
  // entry 11x9 @0 · guard 10x10 @-1.6 · barracks 22x16 @-3.2 · command 28x24 @-9.4
  dun_keycatrich_entry: {
    doc: 'Keycatrich Trench, the trench head: poured concrete, rebar, sodium strips',
    time: 12.0, dungeon: 'keycatrich',
    pos: [-113.5, -44.2, -225], target: [-112, -45.2, -239], fov: 54,
  },
  dun_keycatrich_corridor: {
    doc: 'Keycatrich: a caged emergency strip running the length of a corridor',
    time: 12.0, dungeon: 'keycatrich',
    pos: [-112.4, -45.0, -236], target: [-112, -46.4, -251], fov: 48,
  },
  dun_keycatrich_hall: {
    doc: 'Keycatrich: the barracks hall, big enough to fight in',
    time: 12.0, dungeon: 'keycatrich',
    pos: [-104, -46.6, -264], target: [-118, -48.4, -274], fov: 56,
  },
  dun_keycatrich_boss: {
    doc: 'Keycatrich: the command chamber at the bottom of the trench',
    time: 12.0, dungeon: 'keycatrich',
    pos: [-106, -51.4, -315], target: [-122, -54.0, -330], fov: 56,
  },

  // --- dungeons : Balouve Mines ------------------------------------------
  // Interior origin (294, -34, -232). adit 11x9 @0 · landing 14x13 @-2
  // · shaft 18x18 @-16 (19 m of headroom) · deep 46x40 @-19.5
  dun_balouve_entry: {
    doc: 'Balouve Mines, the adit: ore rail, timber sets and the dark past them',
    time: 12.0, dungeon: 'balouve',
    pos: [296, -32.0, -229], target: [294, -33.2, -243], fov: 54,
  },
  dun_balouve_drift: {
    doc: 'Balouve: the level-one drift, rail underfoot and lamps down the wall',
    time: 12.0, dungeon: 'balouve',
    pos: [297, -34.2, -252], target: [294, -35.6, -265], fov: 48,
  },
  dun_balouve_shaft: {
    doc: 'Balouve: the main shaft, timber gallery spiralling nineteen metres down',
    time: 12.0, dungeon: 'balouve',
    pos: [297.5, -34.4, -272], target: [292, -47.0, -282], fov: 60,
  },
  dun_balouve_boss: {
    doc: 'Balouve: The Deep — forty metres of worked-out cavern',
    time: 12.0, dungeon: 'balouve',
    pos: [300, -48.5, -298], target: [288, -52.0, -320], fov: 58,
  },

  // --- dungeons : Fociaugh Hollow ----------------------------------------
  // Interior origin (110, -22, 356). mouth 13x11 @0 · gallery 20x17 @-5
  // · narrows 15x13 @-11 · hollow 42x36 @-17.5
  dun_fociaugh_entry: {
    doc: 'Fociaugh Hollow, the cave mouth: daylight dying against wet limestone',
    time: 12.0, dungeon: 'fociaugh',
    pos: [112, -19.0, 359], target: [110, -21.0, 346], fov: 54,
  },
  dun_fociaugh_gallery: {
    doc: 'Fociaugh: the Dripstone Gallery, ten metres of ceiling over the ledge',
    time: 12.0, dungeon: 'fociaugh',
    pos: [117, -24.0, 338], target: [104, -26.4, 328], fov: 58,
  },
  dun_fociaugh_narrows: {
    doc: 'Fociaugh: the Narrows, a squeeze between dripstone columns',
    time: 12.0, dungeon: 'fociaugh',
    pos: [122, -30.6, 315], target: [112, -32.4, 306], fov: 50,
  },
  dun_fociaugh_boss: {
    doc: 'Fociaugh: The Hollow — the spawning chamber at the bottom',
    time: 12.0, dungeon: 'fociaugh',
    pos: [124, -34.0, 300], target: [106, -38.0, 278], fov: 58,
  },

  // --- story ------------------------------------------------------------
  // Filed last: `Cinematics.stage` leaves the cast wherever the scene put them
  // unless the scene asks for `restorePositions`, so a cutscene shot displaces
  // the party for every `follow:` shot after it.
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
  cine_hammerhead: {
    doc: 'Chapter I at Hammerhead: Cindy, Cid and a car that needs paying for',
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
  cine_fall: {
    doc: 'Chapter III: the morning Insomnia falls',
    time: 6.4, weather: 'overcast', story: { scene: 'ch3_the_fall', at: 22 },
    pos: [0, 0, 0], target: [0, 0, 0], fov: 26,
  },
  cine_astral: {
    doc: 'Chapter V: the Archaean wakes under the Disc',
    time: 15.0, weather: 'storm', story: { scene: 'ch5_astral_awakening', at: 18 },
    pos: [0, 0, 0], target: [0, 0, 0], fov: 34,
  },
};
