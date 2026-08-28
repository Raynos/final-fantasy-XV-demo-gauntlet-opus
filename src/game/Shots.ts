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
 *     third means aiming *beside* it,
 *   - the highway runs diagonally through frame as a leading line, and
 *   - a man-made prop (obelisk, haven, the Regalia, a headframe) sits in the
 *     midground to give the landscape scale and to make the world look inhabited.
 *
 * ### The two numbers that decide whether a frame works
 * With a vertical fov `F` and a camera-to-target distance `d`, the horizon
 * lands at `ndcY ≈ -pitch / (F/2)` where `pitch = asin((target.y - pos.y) / d)`.
 * So **a third of sky wants a pitch of about −0.33·(F/2)**, i.e. roughly −7° at
 * fov 44 — which is `target.y ≈ pos.y − 0.12·d` over level ground. Aim *up* and
 * the frame fills with sky; that is exactly how `zone_longwythe` came to be 75 %
 * sky (target y 519 against ground at 149) and `zone_ravatogh` to aim 190 m
 * above a summit that is 594 m, not the 720 m the old note here claimed.
 *
 * The other number is **camera clearance**: `pos.y − Terrain.heightAt(pos.xz)`.
 * Below ~2 m the camera is inside a boulder or the hill itself and the frame
 * renders black. Eight shots in this file were doing that.
 *
 * ### Deriving coordinates
 * Never write a camera by hand. `src/tools/framecam.mts` boots the game once and
 * applies a list of shot *recipes* — `camAt:[x,z]`, `eye` (metres above the
 * ground there), `aimAt:[x,z]`, `aimUp` — resolving them against the live
 * heightfield and printing the absolute `pos`/`target` to paste back here. A
 * camera derived that way cannot be buried, and twenty candidate framings cost
 * twenty frames instead of twenty boots. `--probe FILE` runs a snippet in the
 * page first, which is how the anchors below were measured rather than guessed.
 *
 * Coordinates in this project have gone stale three times. Re-measure.
 *
 * ### Live world anchors (8192 m world, north = -Z) — measured, not copied
 * Highest ground actually found near each landform (`peak` search, live):
 *   blackrockMesa (-570,-400) h180   eastButtes  ( 520, -500) h108
 *   westScarp     (-620, 570) h154   longwythePeak (900,-1180) h445
 *   keycatrichRim (  40,-1720) h242  discRim     (-1720,-2540) h388
 *   crownScarp    (3145,-1000) h505  callaeghBench (3060,1175) h180
 *   ravatoghCone  (-3430,-3170) h594 lestallumTerrace (-3410,-355) h162
 *   pallareth     (-1505,-3385) h324 caemHeadland (-2330,1830) h117
 *   angelgard     (3025, 3050) h50   meteor ridge (-2290,1880) h123
 * Lowest ground (basin floors):
 *   taelparFloor (-2280,-1040) h3 · rim (-2620,-740) h123 — the gorge crosses
 *     z at x ≈ -2200..-2250, and the neck the highway uses is at (-2286,-486)
 *   alstorBasin (-1355,745) h-18 · vesperBasin (-2940,-2280) h-22
 *   nebulaFloor (-1780,-1120) h26 · malmalamBowl (-2905,1910) h17
 *   sea level -6.5, so anything below it floods.
 * Built geometry — the man-made things that actually exist:
 *   Hammerhead pad (576,16.2,10): pylon (600.6,38.4) pump (578.8,32.4)
 *     huntBoard (586,13.2) diner (593.6,10) garageBay (568,14.5)
 *     caravan (550.8,27.2) regaliaBay (570.8,23.2) culless (603.4,22.5)
 *   haven camp (-99.6,7.1,-59.7) · obelisks (-104,-138) (168,-206) (-238,96)
 *   imperial blockade (1198.9,72) · layby + shelter (-769.7,-45.2)
 *   comms mast (-158,-325) ground h59 · water tower (261.8,-239)
 *   Solheim ruins (-500,330) h84 · windpumps (-252,78) (30,-91)
 *   dead truck (-850.2,-66.7) · wrecks (483.3,48.5) (-1000,-113)
 *   shack (1390.3,81.1) · crashed dropship (-60,-230)
 *   dungeon mouths: Keycatrich (-112.8,18.1,-229.1) Balouve (293.6,10.5,-232.2)
 *     Fociaugh (110.3,12.9,355.6)
 *   Megastructures: viaduct (-1010,-740)→(-790,300) · dreadnought (-1240,470,-1560)
 *     escort flight (-820,300,-980) · Insomnia (2560,150,-3180) · meteor (-2010,1890)
 *   Regalia parked (-19.3,8.6,14) · party spawn ≈ (0, 8.17, 0)
 * The 124 map POIs are in `WorldMap.ts` and every one of them has a *pad* but
 * only havens, parking, the roadblock, the three dungeon mouths, the landmark
 * props and Hammerhead have built geometry. Aim at the others and you get bare
 * ground; the shots that do so say so in their `doc`.
 *
 * ### Shot fields (see `Game.applyShot`)
 *   pos / target / fov                    absolute camera
 *   follow:'player'|'gladio'|'ignis'|'prompto' + offset / lookOffset
 *                                         camera pinned to that character,
 *                                         world axes, resolved every frame by
 *                                         `Game.followAnchor`
 *   time (hours) · weather 'clear'|'overcast'|'storm'|'fog'
 *   scenario 'field'|'combat'|'warp'|'boss_field'|'boss_imperial'|'boss_astral'
 *            |'daemons'          (src/game/Director.ts)
 *   story 'title' | {scene, at}  · hud · menu · dungeon
 *
 * ### Order matters — and it is load-bearing twice over
 * The harness renders in file order on one page.
 *
 * 1. **Character and UI shots come first.** After the camera has spent a few
 *    dozen shots kilometres away, the terrain under the party renders roughly
 *    1.5 m *above* what `Terrain.heightAt` reports, and the party sinks into
 *    the ground: at shot 16 they are buried to the shoulders, by shot 30 only
 *    their weapons show. The CPU positions never move (measured: player.y
 *    8.17, heightAt 8.20, constant), so this is a terrain LOD/streaming settle
 *    bug, not a framing one — but until it is fixed, filing the seven character
 *    portraits and the twelve UI frames at the top of the file is what keeps
 *    them showing characters.
 * 2. **Cutscenes and dungeons come last.** `Cinematics.stage` leaves the cast
 *    wherever the scene put it and leaving a dungeon puts the party at the
 *    mouth, so both displace every `follow:` shot after them. Combat scenarios
 *    turn Noctis to face -Z and nothing turns him back, so the character
 *    framings run before those too.
 *
 * Add shots here — src/tools/shoot.mts discovers them automatically, and
 * `src/tools/sheet.mts` tiles a shot directory into one contact sheet to review.
 */
import type { ScreenName } from '../ui/Menus.ts';

/** A world-space triple. Shots are authored as arrays, not `Vector3`s. */
export type Vec3 = readonly [number, number, number];

/**
 * The reproducible world states `Director.setScenario` can be asked for.
 *
 * The JSDoc this replaced said `'field'|'combat'|'warp'` and had done for a
 * long time, while the function grew four more branches -- the boss and daemon
 * scenarios that six shots in this file depend on. The comment was never
 * checked; this is.
 */
export type ScenarioName =
  | 'field' | 'combat' | 'warp'
  | 'boss_field' | 'boss_imperial' | 'boss_astral' | 'daemons'
  // The `setpiece_*` scenarios run a boss fight *live* rather than posing one.
  // `boss_field` and friends spawn the mark and freeze it directly, which is
  // exactly why `BossFight` — the system that actually runs a set piece — had
  // never executed in a capture, in play or in the harness. See `Director`.
  | 'setpiece_astral' | 'setpiece_field';

/** Everything a shot may set that is not the framing. */
export interface ShotState {
  /** What the shot is for. Read by `corpus.mts` when it indexes the sheets. */
  doc: string;
  /** Hour of day, 0..24. */
  time: number;
  /** Vertical field of view, degrees. */
  fov: number;
  weather?: 'clear' | 'fog' | 'overcast' | 'storm';
  /** `Director.setScenario` -- what is happening in the world. */
  scenario?: ScenarioName;
  /** HUD visible? Set last in `applyShot` and wins over the story system. */
  hud?: boolean;
  /** Enter this dungeon before framing. */
  dungeon?: string;
  /** Open this menu screen. */
  menu?: ScreenName;
  /** A story beat: either a screen name, or a scene seeked to `at` seconds. */
  story?: string | { scene: string, at?: number };
  /** Player gait for the shot, where standing still would read wrong. */
  gait?: string;
}

/**
 * A shot framed by absolute world coordinates.
 *
 * `pos`/`target` and `follow`/`offset` are the two framing modes, and mixing
 * them is what broke several shots historically -- an `offset` on a `pos` shot
 * is silently ignored, so the frame lands somewhere nobody authored. The `never`
 * members are what make that a compile error rather than a black frame.
 */
export interface FixedShot extends ShotState {
  pos: Vec3;
  target: Vec3;
  follow?: never;
  offset?: never;
  lookOffset?: never;
}

/** A shot framed relative to a character, resolved every frame. */
export interface FollowShot extends ShotState {
  /** `'player'` or a party member key -- see `Game.followAnchor`. */
  follow: string;
  /** Camera offset from the anchor, in world axes. */
  offset: Vec3;
  /** Aim point offset from the anchor. Defaults to `[0, 1.2, 0]`. */
  lookOffset?: Vec3;
  pos?: never;
  target?: never;
}

export type Shot = FixedShot | FollowShot;

/**
 * Which of the two framing modes a shot is. A plain `if (shot.follow)` does not
 * narrow the union — `FixedShot.follow` is `never | undefined`, and TypeScript
 * cannot rule out an empty-string `follow` on the other arm.
 */
export function isFollowShot(s: Shot): s is FollowShot { return s.follow != null; }

const SHOT_TABLE = {
  // --- character --------------------------------------------------------
  // These run FIRST in the file on purpose — see "Order matters" above. Left
  // where they were, the party is buried to the shoulders in terrain that has
  // drifted upward under them and the portraits show four floating weapons.
  //
  // `follow: 'gladio' | 'ignis' | 'prompto'` resolves the real party member
  // every frame through `Game.followAnchor`, so a companion portrait no longer
  // depends on a formation offset that drifts the moment anything moves. The
  // three portraits are placed on the character's *own* facing vector:
  //
  //     offset = [sin(h + swing) * d, eye, cos(h + swing) * d]
  //
  // with the party's measured heading **h = 0.471 rad** and a swing of about
  // −0.5 rad for a three-quarter. Guessing the sign of that swing is what put
  // Gladiolus behind his own greatsword; d ≈ 3 m and eye ≈ 2 m is what lifts
  // the lens clear of the foreground grass, which swallows anything framed
  // from 1.7 m.
  //
  // Every framing below also obeys one hard rule: **a character's root (their
  // feet) must stay inside the frame**. A SkinnedMesh is frustum-culled against
  // its *bind-pose* bounding sphere, which for these rigs sits at the origin
  // with a small radius while the posed vertices reach 2 m above it — so the
  // instant the root leaves the frustum the whole character disappears even
  // though they plainly fill the shot. That is why there is no head-and-
  // shoulders portrait here: it is not framable until the meshes stop being
  // culled (one line in `src/characters/rig/Character.ts`, see the report).
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
  /**
   * Head-and-shoulders, and the profile beside it.
   *
   * The corpus has never had either, on the strength of a claim that a portrait
   * was *impossible*: character meshes were said to be culled on their bind-pose
   * bounding sphere, which sits at the origin with a small radius while posed
   * vertices reach 2 m above it. It appeared in two handoffs and a comment in
   * this file, and it was never measured.
   *
   * It is wrong. `Character._skinned` sets `frustumCulled = false` on every
   * character mesh and `git log -S` puts it there since the commit that created
   * the party, so the renderer never tests that sphere and it cannot cull
   * anything. `src/tools/_probe/portrait.mts` proves it and emits these
   * framings; all sixteen render.
   *
   * That matters beyond two shots. Every character defect found in the last two
   * sessions — mitten hands, quill hair, an inverted scalp shell, a lavender
   * coat, Prompto's blond at R-B +66.5 against a plate's +6 — needed `framecam`
   * to see, because none of it is visible at the ranges the corpus frames. A
   * blind judge marking "painted-on eyes" and "seams at the jaw" is looking at
   * something no shipped shot shows. These two close that.
   */
  hero_portrait: {
    doc: 'Noctis head and shoulders: hair parting, brow, and both eyes',
    // Low and looking slightly up, which is not the obvious framing for a
    // portrait and is deliberate.
    //
    // The first version aimed at the head centre from above eye height and
    // caught Noctis with his head pitched down, showing **neither eye** — so
    // the corpus's only face shot could not answer the thing a blind judge kept
    // marking it on ("painted-on eyes"), and the face lane had to leave the eyes
    // ungraded because it could not see them.
    //
    // Dropping the camera 160 mm and lifting the target gets the eye region into
    // frame and roughly doubles the face's share of it. **It does not fully fix
    // the shot, and the camera cannot.** The head is pitched down in the settled
    // pose and the hair fringe hangs over the eye; two framings established that
    // and a third would not have helped. The remaining fix is a head-pitch
    // change in the settled pose or a shorter fringe, both in `src/characters/`.
    // Recorded here rather than iterated on, so the next character lane inherits
    // the diagnosis instead of the search.
    time: 16.2, weather: 'clear', follow: 'player',
    offset: [-0.024, 1.45, 1.100], lookOffset: [-0.002, 1.565, 0.07], fov: 30,
  },
  hero_profile: {
    doc: 'Noctis in profile — the head silhouette, which is where the sculpt is weakest',
    time: 16.2, weather: 'clear', follow: 'player',
    offset: [-0.936, 1.572, 0.546], lookOffset: [-0.002, 1.495, 0.07], fov: 30,
  },

  gladio_closeup: {
    doc: 'Gladiolus, the shield: the build, the scar and the greatsword',
    time: 16.2, weather: 'clear', follow: 'gladio',
    offset: [-0.24, 2.05, 2.99], lookOffset: [0, 1.4, 0], fov: 34,
  },
  ignis_closeup: {
    doc: 'Ignis, the strategist: glasses, gloves and the daggers',
    time: 16.2, weather: 'clear', follow: 'ignis',
    offset: [-0.08, 2.0, 2.9], lookOffset: [0, 1.38, 0], fov: 34,
  },
  prompto_closeup: {
    doc: 'Prompto, the gunner: the wristbands, the camera and the grin',
    time: 16.2, weather: 'clear', follow: 'prompto',
    offset: [-0.08, 1.95, 2.8], lookOffset: [0, 1.32, 0], fov: 34,
  },
  party_formation: {
    doc: 'The retinue read from the flank: four builds, four weapons, one road',
    time: 15.4, weather: 'clear', follow: 'player',
    offset: [5.02, 3.6, 5.16], lookOffset: [-0.5, 1.4, -1.0], fov: 42,
  },
  party_walk: {
    doc: 'The four-man party walking the road together',
    gait: 'walk',
    time: 16.2, weather: 'clear', follow: 'player',
    offset: [4.8, 2.75, 6.8], lookOffset: [0, 1.35, 0], fov: 42,
  },
  party_dawn: {
    doc: 'The party on the move at first light, long shadows off the four of them',
    time: 6.9, weather: 'clear', follow: 'player',
    offset: [-3.73, 3.2, 6.39], lookOffset: [-0.4, 1.3, -1.2], fov: 40,
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
    time: 17.0, weather: 'clear', follow: 'player', hud: true, menu: 'map_wide',
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

  // --- vista ------------------------------------------------------------
  vista_dawn: {
    doc: 'Dawn from the top of the West Scarp, the whole basin between here and the buttes',
    time: 6.4, weather: 'clear',
    pos: [-640, 143, 430], target: [743, 116, -162], fov: 44,
  },
  vista_noon: {
    doc: 'Harsh midday under the strata of Blackrock Mesa, the pan running out east',
    time: 12.5, weather: 'clear',
    pos: [-100, 43.4, -260], target: [-420, 200.3, -420], fov: 44,
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
    doc: 'A downpour over Hammerhead — the lit forecourt is the one readable thing in it',
    time: 15.0, weather: 'storm',
    pos: [640, 21.6, 60], target: [586, 21.7, 26], fov: 46,
  },
  vista_fog: {
    doc: 'Valley fog drowning the pan, Blackrock Mesa floating clear of it',
    time: 7.1, weather: 'fog',
    pos: [-100, 43.4, -260], target: [-420, 200.3, -420], fov: 44,
  },
  vista_overcast: {
    doc: 'Flat overcast light over the badlands — the same frame as vista_noon',
    time: 13.0, weather: 'overcast',
    pos: [-100, 43.4, -260], target: [-420, 200.3, -420], fov: 44,
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
  // --- zones ------------------------------------------------------------
  //
  // **A zone shot is named after the zone's DISPLAY NAME, not its `WorldMap`
  // id**, and the two frequently differ: `crown_verge` is "Ostium Gorge",
  // `kelbass` is "Vannath Coast", `balouve` is "The Callaegh Steps",
  // `cauthess` is "Mencemoor", `meldacio` is "Pallareth Pass" and
  // `weaverwilds` is "The Malacchi Hills". All nineteen zones have a shot.
  //
  // This is worth stating because grepping `zone_<id>` against `WorldMap`
  // makes seven of them look uncovered, and `project/STATUS.md` carried
  // exactly that false gap ("`zone_weaverwilds` has no shot to capture it
  // with") until someone checked. The name a player would read is the right
  // one for a shot; the trap is only that the check is not a grep.
  zone_longwythe: {
    doc: 'Longwythe: the 445 m horn off to the right, the tutorial pan running under it',
    time: 8.2, weather: 'clear',
    pos: [1250, 46.9, 240], target: [1080, 19.3, -140], fov: 44,
  },
  zone_three_valleys: {
    doc: 'The Three Valleys: hogback fins running away from the Insomnia skyline',
    time: 16.6, weather: 'clear',
    pos: [1180, 79.2, 1420], target: [1400, 54.9, 1020], fov: 44,
  },
  zone_ostium_gorge: {
    doc: 'Ostium Gorge: the Wall of Insomnia under the 320 m crown scarp',
    time: 9.4, weather: 'overcast',
    pos: [3480, 61.4, 340], target: [3300, 104.3, -160], fov: 46,
  },
  zone_vannath: {
    doc: 'Vannath Coast: the fast dry prairie the Galdin road crosses',
    time: 17.2, weather: 'clear',
    pos: [2400, 49.2, 1560], target: [2180, 30, 1300], fov: 46,
  },
  zone_galdin: {
    doc: 'Galdin Coast: Angelgard out of the shallows, the pier hotel on the right',
    time: 17.8, weather: 'clear',
    pos: [2380, 24.4, 2440], target: [2600, -38.2, 2680], fov: 42,
  },
  zone_keycatrich: {
    doc: 'Keycatrich: the dust-choked rim the ruined spa town shelters under',
    time: 15.2, weather: 'clear',
    pos: [520, 92.6, -1180], target: [240, 113.6, -1420], fov: 44,
  },
  zone_callaegh: {
    doc: 'The Callaegh Steps: mine spoil benches above the Balouve shaft heads',
    time: 10.4, weather: 'clear',
    pos: [3080, 190.4, 1320], target: [2860, 169.7, 1180], fov: 44,
  },

  // --- zones : Duscae ---------------------------------------------------
  zone_alstor: {
    doc: 'Alstor Slough: standing water under the green haze, the road on its bank',
    time: 8.8, weather: 'overcast',
    pos: [-940, 31.7, 480], target: [-1300, -11.3, 760], fov: 46,
  },
  zone_malacchi: {
    doc: 'The Malacchi Hills: open chocobo prairie broken by lone broadleaf stands',
    // Lifted out of the canopy. At y 44 the lens sat *inside* a broadleaf
    // stand and the whole frame was leaf card, which is the opposite of the
    // open prairie this shot is meant to establish.
    time: 16.0, weather: 'clear',
    pos: [-1640, 108.0, 690], target: [-2010, 28.0, 470], fov: 46,
  },
  zone_nebulawood: {
    // Re-framed 2026-08-24. The old pose descended INTO a canopy that has since
    // grown, and the frame was a wall of leaf cards — no trunks, no forest
    // floor, no dreadnought, none of the foreground/midground/background
    // separation `BRIEF.md` asks for. A blind judge and two lanes independently
    // called it unreadable, and it is one of `compare.mts`'s 30 judged shots.
    doc: 'The Nebulawood: wet forest floor with the Niflheim dreadnought over it',
    time: 11.5, weather: 'overcast',
    pos: [-1420, 132, -980], target: [-1600, 50, -1200], fov: 48,
  },
  zone_mencemoor: {
    // Reframed after the meteor moved to its own zone centre (-1020, -2160).
    // The old stand at (-1400, -1560) was 710 m out, well inside the 857 m
    // shard field, so the camera ended up *inside* a mountain-sized rock.
    // This one sits 1.7 km north-east on a rim spur, high enough to clear the
    // ridge and read the glowing fissure against the mass.
    doc: 'Mencemoor: the Disc of Cauthess seen from a spur of its rim',
    time: 16.5, weather: 'clear',
    pos: [400, 286.4, -1200], target: [-1020, 393, -2160], fov: 42,
  },
  zone_taelpar: {
    doc: 'Taelpar Crag: the 235 m gorge the highway crosses at its neck',
    time: 15.4, weather: 'clear',
    pos: [-2250, 127, -560], target: [-2300, 24, -1100], fov: 44,
  },
  zone_fallgrove: {
    doc: 'The Fallgrove: grazed downland running south-west to the meteor shards',
    time: 17.4, weather: 'clear',
    pos: [-500, 52.1, 1300], target: [-900, 38.4, 1620], fov: 44,
  },

  // --- zones : Cleigne --------------------------------------------------
  zone_lestallum: {
    doc: 'The Lestallum Shelf: a level basalt terrace 120 m above the plain',
    time: 18.0, weather: 'clear',
    pos: [-3320, 159.2, -980], target: [-3040, 141.5, -760], fov: 44,
  },
  zone_pallareth: {
    doc: 'Pallareth Pass: the canyon floor between a 320 m and a 250 m wall',
    time: 9.8, weather: 'clear',
    pos: [-1900, 104.1, -3000], target: [-1620, 152.7, -3260], fov: 46,
  },
  zone_vesperpool: {
    doc: 'The Vesperpool: black water under the causeway bench, the drowned wall behind it',
    time: 8.4, weather: 'overcast',
    pos: [-2700, 41.4, -2180], target: [-2980, 9.1, -2320], fov: 46,
  },
  zone_ravatogh: {
    doc: 'The Rock of Ravatogh: 594 m of ash cone, the highest point in Lucis',
    time: 17.2, weather: 'clear',
    pos: [-2450, 70.6, -2150], target: [-2700, 23.1, -2420], fov: 50,
  },
  zone_malmalam: {
    doc: 'Malmalam Thicket: the shallow bowl the canopy closes over',
    time: 12.8, weather: 'overcast',
    pos: [-2760, 75.9, 1240], target: [-3080, 56.7, 1420], fov: 44,
  },
  // Framed from as far off as the coast allows, because closer in the headland
  // resolves into flat untextured slabs that read as floating rock rather than
  // cliffs — eleven camera positions were tried on eight bearings and every one
  // inside ~700 m shows the same faceting. This is the landform, not the props:
  // owner is src/world/terrain/** (the `caemHeadland` landform stamp).
  zone_cape_caem: {
    doc: 'Cape Caem: the headland standing out of the sea, the road behind it',
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
    // Re-framed 2026-08-24 onto `longwythe_haven` (962, -712). The old pose sat
    // near the world origin, which is not any of the nineteen havens, and the
    // camera ended up inside a rock — a blind judge called it out as "40% of
    // frame is unlit interior surface, no subject, nothing composed".
    doc: 'A haven: the rune-marked camp rock and its fire on a raised flat',
    time: 18.4, weather: 'clear',
    // Re-framed AGAIN 2026-08-24: `88efe38` gave every disc landform an
    // anti-radial frame and the ground under this haven rose ~13 m, putting the
    // camera at y=40 underneath a surface at 40.72. Coordinates go stale — the
    // landmine says so, and this is the second time in one day.
    pos: [1002, 56, -672], target: [962, 45, -712], fov: 48,
  },
  poi_parking: {
    doc: 'A parking spot: the gravel lay-by and its bus shelter off Route 1',
    time: 16.4, weather: 'clear',
    pos: [-744, 27.3, -84], target: [-769.7, 32, -45.2], fov: 44,
  },
  poi_reststop: {
    doc: 'A rest stop: the Hammerhead caravan, where you cook and save',
    time: 19.0, weather: 'clear',
    pos: [572, 18.3, 44], target: [550.8, 18.6, 27.2], fov: 46,
  },
  poi_imperial: {
    doc: 'An imperial base: the roadblock straddling Route 1 north of Longwythe',
    time: 15.0, weather: 'overcast',
    pos: [1168, 20.5, 32], target: [1198.9, 21, 72], fov: 42,
  },
  poi_imperial_wreck: {
    doc: 'A crashed magitek dropship ploughed into the basin floor, still smoking',
    time: 17.6, weather: 'clear',
    pos: [-8, 15.9, -186], target: [-60, 19.6, -230], fov: 46,
  },
  poi_landmark: {
    doc: 'A landmark: the comms mast on its ridge, the badlands stacked behind it',
    time: 16.2, weather: 'clear',
    pos: [-70, 34.8, -300], target: [-158, 70.7, -325.3], fov: 42,
  },
  poi_dungeon_mouth: {
    doc: 'A dungeon entrance: the Keycatrich Trench blockhouse in the badlands',
    time: 16.8, weather: 'clear',
    pos: [-133, 30.7, -246], target: [-112.8, 21, -229.1], fov: 44,
  },
  poi_dungeon_mine: {
    doc: 'A dungeon entrance: the Balouve Mines headframe over its adit',
    time: 10.6, weather: 'clear',
    pos: [314, 20.4, -216], target: [293.6, 13.6, -232.2], fov: 46,
  },
  poi_dungeon_cave: {
    doc: 'A dungeon entrance: the Fociaugh Hollow cave mouth',
    time: 14.2, weather: 'overcast',
    pos: [92, 21.8, 372], target: [110.3, 15.9, 355.6], fov: 46,
  },
  poi_fishing: {
    doc: 'A fishing spot: Galdin Shoals, Angelgard offshore — no stage built yet',
    time: 7.4, weather: 'clear',
    pos: [2300, 30.5, 2400], target: [2560, -42.5, 2660], fov: 42,
  },
  poi_tomb: {
    doc: 'A royal tomb: the Tomb of the Wise site under the Keycatrich rim (pad only)',
    time: 8.6, weather: 'clear',
    pos: [330, 95.8, -1330], target: [90, 124.6, -1470], fov: 44,
  },
  poi_chocobo: {
    doc: 'A chocobo post: the Wiz paddock prairie in the Malacchi Hills (pad only)',
    time: 9.2, weather: 'clear',
    pos: [-1780, 35.4, 700], target: [-2000, 31.8, 520], fov: 46,
  },
  poi_menace: {
    doc: 'A menace lair: the Menace Beneath Keycatrich, under the rim (pad only)',
    time: 21.4, weather: 'clear',
    pos: [430, 109.7, -1400], target: [200, 164.3, -1490], fov: 44,
  },

  // --- the world is inhabited -------------------------------------------
  regalia_road: {
    doc: 'The Regalia parked on the highway, telegraph poles receding',
    time: 17.4, weather: 'clear',
    pos: [-34, 11.6, 28], target: [-19.3, 9.6, 14], fov: 42,
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
    doc: 'The haven at last light: the rune lamps lit and the pan going cold behind it',
    time: 18.9, weather: 'clear',
    pos: [-124, 11.9, -72], target: [-99.6, 9.7, -59.7], fov: 44,
  },
  mesa_landmark: {
    doc: 'The Blackrock scarp from the east, the mast on the skyline for scale',
    time: 9.4, weather: 'clear',
    pos: [-120, 42, -240], target: [-430, 210.5, -430], fov: 42,
  },
  obelisk_dusk: {
    doc: 'A ruined pylon against the last light — the shape you navigate by',
    time: 18.6, weather: 'clear',
    pos: [-72, 12.2, -100], target: [-104, 20, -138], fov: 44,
  },
  road_viaduct: {
    doc: 'The Solheim viaduct marching north out of the basin, road beneath it',
    time: 17.0, weather: 'clear',
    pos: [-700, 97.4, 180], target: [-880, 50.5, -120], fov: 44,
  },
  windpump_flats: {
    doc: 'Windpump and stock pens on the flats — the world is worked, not empty',
    time: 7.8, weather: 'clear',
    pos: [-200, 13.8, 140], target: [-252, 16.2, 78], fov: 46,
  },
  watertower_bench: {
    doc: 'Water tower on the East Buttes bench, buttes stacked behind it',
    time: 16.6, weather: 'clear',
    pos: [300, 15.4, -198], target: [255, 18, -233], fov: 44,
  },
  solheim_ruins: {
    doc: 'Solheim column ruins on the ridge under the Spire Ridge fangs',
    time: 18.6, weather: 'clear',
    pos: [-467, 69.4, 363], target: [-505, 102, 332], fov: 44,
  },
  roadside_wreck: {
    doc: 'A burnt-out car on the shoulder, telegraph line running past it',
    time: 15.6, weather: 'overcast',
    pos: [503, 16.8, 48], target: [483.3, 14.7, 48.5], fov: 40,
  },
  broken_truck: {
    doc: 'The broken-down haulier on the far shoulder, west of the Fallgrove turn',
    time: 8.4, weather: 'clear',
    pos: [-862, 26.8, -58], target: [-850.2, 27.5, -66.7], fov: 42,
  },
  abandoned_shack: {
    doc: 'An abandoned roadside outpost out on the Longwythe flats',
    time: 17.8, weather: 'clear',
    pos: [1412, 25, 62], target: [1390.3, 17.3, 81.1], fov: 42,
  },
  landmark_insomnia: {
    doc: 'The Crown City on the northern horizon, its towers over the red badlands',
    time: 18.4, weather: 'clear',
    pos: [2900, 135.8, -1500], target: [2700, 77.7, -2300], fov: 36,
  },
  landmark_meteor: {
    // Re-framed 2026-08-24. The old pose looked at z = +1620 while the Disc of
    // Cauthess is at z = -2160 — **3.8 km in the wrong direction**, at the
    // Fallgrove. The shot named for a 1.5 km hero landmark had not contained it
    // for a long time, which is why the Meteor's own 5/10 grade was given from
    // purpose-framed captures this shot could neither confirm nor refute.
    doc: 'The Meteor of the Disc backlit, its fissures still burning',
    time: 17.6, weather: 'clear',
    pos: [-1020, 150, -3560], target: [-1020, 340, -2160], fov: 50,
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
    pos: [668, 31.3, -30], target: [586, 19.7, 26], fov: 42,
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
    doc: 'The Hammerhead pylon and its wrench sign over the forecourt',
    time: 17.4, weather: 'clear',
    pos: [628, 18.8, 72], target: [600.6, 25, 38.4], fov: 44,
  },
  town_night: {
    doc: 'Hammerhead after dark under the floodlights, the one lit thing in Leide',
    time: 21.6, weather: 'clear',
    pos: [640, 29, 60], target: [578, 19, 31], fov: 46,
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
    offset: [5.6, 2.0, 1.4], lookOffset: [2.9, 0.9, -2.3], fov: 40,
  },
  combat_armiger: {
    doc: 'Armiger up: the phantom royal arms orbiting Noctis mid-swing',
    time: 15.5, weather: 'clear', scenario: 'combat', follow: 'player',
    offset: [3.4, 2.35, 4.6], lookOffset: [0, 1.55, -0.6], fov: 42,
  },
  combat_magic_fire: {
    doc: 'Elemancy in the middle of the fight — the blizzard bloom and a sabertusk in it',
    time: 15.5, weather: 'clear', scenario: 'combat', follow: 'player',
    offset: [3.0, 2.6, -1.0], lookOffset: [-2.0, 1.0, -6.0], fov: 44,
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
    offset: [-6.0, 3.2, 2.0], lookOffset: [-1.5, 2.2, -10.0], fov: 46,
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
  /**
   * The shot that looks at a set piece *running*.
   *
   * Every other boss shot here poses one: `Director._bossScenario` spawns the
   * mark, freezes it mid-telegraph and pins the VFX clock, which is right for a
   * portrait and is why `BossFight` had never executed in a capture. These
   * route through `startSetPiece` and leave the loop live, so what they show is
   * whatever the fight genuinely does N fixed steps in.
   *
   * It is therefore the only shot in the corpus whose subject is *time*, and
   * the only one that will notice if a set piece stops working.
   *
   * **It is also the only shot that is not deterministic to the capture floor,
   * and that is inherent rather than a defect.** Measured: alone versus third
   * in a batch it diffs at **0.789 mean/255 with a max of 255 over 0.42% of
   * pixels**, against the corpus floor of 0.302. A fight that is genuinely
   * running has state the harness does not pin — the posed scenarios buy their
   * byte-equality precisely by freezing the thing this shot exists to show.
   * Look at it; do not `imgdiff` it against a stored PNG and expect the floor.
   */
  // A `setpiece_titan` shot belongs here and is **still** deliberately absent,
  // because an unusable shot in the corpus is worse than a missing one. But the
  // reason recorded here was wrong, and the correction is the useful part.
  //
  // The five failed attempts came back as "a wall of cracked stone" and that was
  // read as the Disc of Cauthess filling the frame. **The camera had not
  // moved.** `boss_astral` is a `follow:` shot, so `applyShot` sets
  // `CameraRig.followShot` and the rig re-derives pos/target from the player
  // every frame — silently overwriting any `setShot` a probe makes afterwards.
  // Ten vantages at six azimuths and two radii came back byte-identical
  // (`tmp/water/titanframe.mts`, first run). Clear `rig.followShot = null`
  // first and the sweep works on the first try. **An offset that produces the
  // same frame from every direction is not a framing problem.**
  //
  // With the camera actually moving, at 95 m and fov 46 from six azimuths, two
  // defects are visible and both are outside this file:
  //
  // - **Titan renders as a flat black silhouette.** No albedo, no lighting, no
  //   material — a cut-out against the stone. Previously reported as "his hide
  //   tiles at a plainly visible scale with seams down it", which is a
  //   different and much milder complaint; what a moving camera shows is that
  //   he is not lit at all.
  // - **He floats on the flank of the Disc's cone** rather than standing in an
  //   arena. `EncounterDirector` puts the fight at (-1020, 166.8, -2216) and
  //   `Terrain.heightAt` there is 169.8, so he is set three metres *under* the
  //   ground the arena is measured against, on a slope, and the pose lifts him
  //   clear of it.
  // - Also still true: his magma vents render as flat unlit yellow quads.
  //
  // He is legible at azimuth 300 deg, radius 95 m, 34 m above his own base,
  // fov 46 — that vantage has a clear line and sky behind him. Add the shot
  // when he is lit and grounded; the framing is no longer the blocker.
  setpiece_deadeye: {
    doc: 'Deadeye and its voretooth pack, live, in the Nebulawood',
    time: 13.5, weather: 'overcast', scenario: 'setpiece_field', follow: 'player',
    offset: [5.5, 3.0, 9.5], lookOffset: [0, 2.2, -9], fov: 46,
  },

  daemon_night: {
    doc: 'A daemon pack after dark',
    time: 23.0, weather: 'clear', scenario: 'daemons', follow: 'player',
    offset: [4.5, 3.2, 8.5], lookOffset: [0, 1.5, -6], fov: 48,
  },
  daemon_storm: {
    doc: 'The same pack in a downpour — daemons are what the rain brings out',
    time: 18.4, weather: 'storm', scenario: 'daemons', follow: 'player',
    offset: [5.0, 2.8, -3.5], lookOffset: [-2.0, 1.4, -9.0], fov: 46,
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
    doc: 'Magitek trooper closing on the party — the imperial rank and file',
    time: 17.4, weather: 'clear', scenario: 'boss_imperial', follow: 'player',
    offset: [-4.0, 2.2, -7.0], lookOffset: [-7.5, 1.3, -12.0], fov: 40,
  },
  // Was KNOWN BAD: the Iron Giant's model rendered 8.4 m below its root while
  // frozen in `telegraph`, so it sat entirely underground whatever the camera
  // did. Fixed in `EnemyBase` — `_resetVisual()` was opt-in and the frozen-pose
  // path never called it, so relative pose offsets integrated once per settle
  // frame. `src/tools/creaturecheck.mts` now gates it at 0 drifting poses of 207.
  bestiary_irongiant: {
    doc: 'Iron Giant winding up: rusted plate and one huge blade',
    time: 15.5, weather: 'clear', scenario: 'combat', follow: 'player',
    offset: [-5.5, 3.2, -2.0], lookOffset: [-14.0, 3.0, -10.0], fov: 42,
  },
  bestiary_dualhorn: {
    doc: 'Dualhorn on the flank of the Bloodhorn fight',
    time: 16.2, weather: 'clear', scenario: 'boss_field', follow: 'player',
    offset: [12.5, 2.4, -4.0], lookOffset: [7.5, 1.6, -10.0], fov: 40,
  },
  bestiary_bloodhorn: {
    doc: 'Bloodhorn, the field mark: scarred hide and a broken horn',
    time: 16.2, weather: 'clear', scenario: 'boss_field', follow: 'player',
    offset: [-6.5, 1.4, -16.0], lookOffset: [-1.5, 1.0, -13.0], fov: 44,
  },
  bestiary_magitek_armour: {
    doc: 'MA-X Cuirass at close range, vents open',
    time: 17.4, weather: 'clear', scenario: 'boss_imperial', follow: 'player',
    offset: [5.5, 4.2, -9.0], lookOffset: [-1.5, 3.4, -17.0], fov: 44,
  },
  bestiary_axeman: {
    doc: 'Imperial axeman: the heavy variant of the magitek line',
    time: 17.4, weather: 'clear', scenario: 'boss_imperial', follow: 'player',
    offset: [13.5, 2.6, -15.5], lookOffset: [10.5, 1.6, -20.0], fov: 40,
  },
  bestiary_titan: {
    doc: 'Titan: the Archaean, filling frame from fifty metres away',
    // Camera lifted clear of the highway catenary. At 7 m it sat inside the
    // wire band and two power lines crossed the Archaean's chest through the
    // whole frame; the wires hang from ~8 m and sag to ~5 m at midspan.
    time: 15.0, weather: 'clear', scenario: 'boss_astral', follow: 'player',
    offset: [22, 13.0, 10.0], lookOffset: [4, 20, -46], fov: 46,
  },
  bestiary_hobgoblin: {
    doc: 'Hobgoblin: the daemon that grows out of a goblin',
    time: 23.0, weather: 'clear', scenario: 'daemons', follow: 'player',
    offset: [-2.5, 2.0, -4.0], lookOffset: [-6.4, 1.2, -8.0], fov: 40,
  },
  bestiary_bussemand: {
    doc: 'Bussemand mid-telegraph, night mist coming off it',
    time: 23.0, weather: 'clear', scenario: 'daemons', follow: 'player',
    offset: [10.4, 3.0, -5.2], lookOffset: [5.5, 2.0, -11.0], fov: 40,
  },
  bestiary_necromancer: {
    doc: 'Necromancer casting at the back of a daemon pack',
    time: 23.0, weather: 'clear', scenario: 'daemons', follow: 'player',
    offset: [-7.0, 2.4, -8.5], lookOffset: [-10.5, 1.6, -14.0], fov: 40,
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
} as const satisfies Record<string, Shot>;

/** Every shot name, as a literal union: `applyShot('vista_dsuk')` is a typo the compiler catches. */
export type ShotName = keyof typeof SHOT_TABLE;

/**
 * The harness's scratch slot.
 *
 * `framecam.mts` resolves a camera recipe against the live heightfield in the
 * page, writes the finished framing into `SHOTS.__probe`, and applies it by
 * name. That is how a framing that is *not* in the corpus gets rendered
 * without being added to it -- `corpus.mts`, `sheet.mts` and `shoot.mts` all
 * enumerate `SHOT_TABLE`, which never contains it.
 */
export const PROBE_SHOT = '__probe';

/**
 * The table, with every entry checked against `Shot` and read back as one.
 * `satisfies` on the literal is what keeps the key union exact while still
 * rejecting a shot that mixes the two framing modes.
 */
export const SHOTS: Record<ShotName, Shot> & { [PROBE_SHOT]?: Shot } = SHOT_TABLE;

/** A name `Game.applyShot` accepts: a corpus shot, or the scratch slot. */
export type ApplicableShot = ShotName | typeof PROBE_SHOT;

/**
 * Runtime check that a string names a shot. `Object.keys(SHOTS)` widens to
 * `string[]`, so this is how a name off the CLI or the dev console crosses
 * into `Game.applyShot`.
 */
export function isShotName(s: string): s is ShotName { return Object.hasOwn(SHOT_TABLE, s); }

/**
 * The same check, widened to include the harness's scratch slot. This is what
 * `Game.applyShot` uses, because every caller outside the game itself -- the
 * capture tools, the dev console -- has a name off a command line.
 */
export function isApplicableShot(s: string): s is ApplicableShot {
  return s === PROBE_SHOT || isShotName(s);
}
