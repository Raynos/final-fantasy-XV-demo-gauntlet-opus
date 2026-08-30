import * as THREE from 'three';
import { archetype, NpcBody } from './NpcRig.ts';
import { NPC_CAST } from './NpcCast.ts';
import { NPC_DIALOGUE } from './NpcDialogue.ts';
import { Rng } from '../../util/Rng.ts';
import { worldMap } from '../../world/map/WorldMap.ts';
import { updateSun } from '../rig/Materials.ts';
import type { GroundSampler } from '../rig/Anim.ts';
import type { Hammerhead } from '../../world/town/Hammerhead.ts';
import type { Ecology } from '../../world/veg/Ecology.ts';
import type { InteractionSystem } from '../../game/interaction/Interactables.ts';
import type { Game } from '../../game/Game.ts';

/**
 * The population of Lucis.
 *
 * Eleven people in Hammerhead, placed against the anchors the town system
 * publishes, plus the five of {@link REMOTE} who live at outposts across the
 * map and are built on approach. Each has a behaviour rather than a spot on
 * the floor:
 *
 * - **station** — stands somewhere for a reason, facing something, with a
 *   posture (Cindy leaning on the fender, Takka forward over his counter).
 * - **task** — works: a repeating motion layered on top of the idle, so the
 *   mechanic under the bonnet is visibly *doing* the thing.
 * - **route** — walks a loop between points of interest, pausing at each.
 * - **sit** — occupies a chair at the outdoor tables.
 *
 * All of them turn their heads to follow the player inside about eight metres,
 * which is the single cheapest thing that stops a crowd reading as furniture.
 *
 * The named four also register a `Talk` interactable, so `E` in front of Cindy
 * opens Cindy's conversation and not the fuel pump behind her — as do all five
 * of the outpost cast, every one of whom exists because a quest names them.
 */

const _v = new THREE.Vector3();
const _tgt = new THREE.Vector3();

/** Bones a posture may bias, applied after the animator has had its say. */
const POSE_BONES = [
  'hips', 'spine01', 'spine02', 'spine03', 'neck', 'head',
  'clavicleL', 'clavicleR', 'upperArmL', 'upperArmR', 'lowerArmL', 'lowerArmR',
  'handL', 'handR', 'thighL', 'thighR', 'shinL', 'shinR',
];

/**
 * A standing pose as an additive bias per bone: bone name -> XYZ Euler radians,
 * in the rig's anatomical frame. The same convention `Look.idle` uses.
 */
export type PostureBias = Record<string, number[]>;

/**
 * Extra postures. These are additive Euler biases in the rig's anatomical
 * frame — the same convention `look.idle` uses — layered on after
 * `Animator.update` so a station NPC can be doing something specific without
 * the gait system being told about it.
 */
const POSTURES = {
  /** Weight on a fender, one elbow back. */
  lean: {
    hips: [0.04, 0, -0.10], spine01: [-0.05, 0.06, 0.04], spine03: [-0.06, 0.10, 0.05],
    neck: [0.05, -0.04, 0], upperArmR: [-0.34, -0.22, -0.30], lowerArmR: [-0.55, 0, 0],
    thighR: [-0.10, 0, -0.08], shinR: [0.16, 0, 0],
  },
  /** Bent forward over an engine bay, both hands down and in. */
  wrench: {
    spine01: [0.24, 0, 0], spine02: [0.26, 0, 0], spine03: [0.22, 0.04, 0],
    neck: [0.30, 0, 0], head: [0.18, 0, 0],
    upperArmL: [-0.62, 0.20, 0.24], lowerArmL: [-0.95, 0.1, 0],
    upperArmR: [-0.60, -0.20, -0.24], lowerArmR: [-1.05, -0.1, 0],
    thighL: [0.14, 0, 0], thighR: [0.12, 0, 0], shinL: [-0.10, 0, 0], shinR: [-0.10, 0, 0],
  },
  /** Hands flat on a counter, leaning in. */
  counter: {
    spine01: [0.10, 0, 0], spine02: [0.12, 0, 0], spine03: [0.10, 0, 0], neck: [0.14, 0, 0],
    upperArmL: [-0.50, 0.24, 0.30], lowerArmL: [-0.55, 0.1, 0], handL: [0.5, 0, 0],
    upperArmR: [-0.50, -0.24, -0.30], lowerArmR: [-0.55, -0.1, 0], handR: [0.5, 0, 0],
  },
  /**
   * Arms folded. Z *adducts* — pulls the arm in toward the ribs — so the sign
   * has to be negative on the left and positive on the right; get it the other
   * way round and the pose reads as a shrug, which is what it did.
   */
  folded: {
    upperArmL: [-0.72, 0.30, -0.60], lowerArmL: [-1.62, 0.34, 0],
    upperArmR: [-0.68, -0.30, 0.58], lowerArmR: [-1.70, -0.34, 0],
    spine03: [-0.05, 0, 0], neck: [0.04, 0, 0],
  },
  /** Hands in pockets, slouched. */
  pockets: {
    spine01: [0.05, 0, 0], spine03: [0.06, 0, 0], neck: [0.06, 0, 0],
    upperArmL: [-0.16, 0.10, 0.22], lowerArmL: [-0.62, 0.2, 0],
    upperArmR: [-0.16, -0.10, -0.22], lowerArmR: [-0.62, -0.2, 0],
  },
  /** Seated at a table. */
  seated: {
    thighL: [-1.45, 0.06, 0.10], thighR: [-1.45, -0.06, -0.10],
    shinL: [1.45, 0, 0], shinR: [1.45, 0, 0],
    footL: [-0.2, 0, 0], footR: [-0.2, 0, 0],
    hips: [0.12, 0, 0], spine01: [0.04, 0, 0],
    upperArmL: [-0.34, 0.16, 0.26], lowerArmL: [-0.85, 0.1, 0],
    upperArmR: [-0.34, -0.16, -0.26], lowerArmR: [-0.85, -0.1, 0],
  },
} satisfies Record<string, PostureBias>;

/** The postures an author may name in `_spawn`. */
export type PostureName = keyof typeof POSTURES;

/** The repeating work motions `_applyPosture` knows how to layer on. */
export type NpcTask = 'wrench' | 'chop' | 'inspect';

/**
 * A townsperson as **placed**: where they stand, what they do there, and the
 * running state of it. Distinct from `NpcCastDef`, which is who they *are* —
 * one cast entry can be placed several times (two mechanics, two travellers,
 * two truckers), and each placement is one of these.
 */
export interface Npc {
  /** unique per placement — `opts.key`, else the cast key. */
  id: string;
  /** which `NPC_CAST` entry they were built from; several may share one. */
  castKey: keyof typeof NPC_CAST;
  name: string;
  role: string;
  hue: number;
  body: NpcBody;
  rng: Rng;
  /** the standing bias, or null for someone with no station pose. */
  posture: PostureBias | null;
  postureName: PostureName | null;
  task: NpcTask | null;
  /** patrol nodes in world space, or null for someone who stands still. */
  route: THREE.Vector3[] | null;
  /** seconds to wait at each route node, indexed alongside `route`. */
  pause: number[] | null;
  /** walk speed in m/s while on a route. */
  speed: number;
  sit: boolean;
  /** metres at which `E` offers a conversation; 0 means they do not talk. */
  talkRadius: number;
  /** index of the route node currently being walked to. */
  leg: number;
  /** seconds left of the pause at the current node. */
  wait: number;
  heading: number;
  moveSpeed: number;
  pos: THREE.Vector3;
  /** what they face at rest, or null to keep whatever heading they have. */
  face: THREE.Vector3 | null;
  /** 0..1 blend of the head/eye track onto the player. */
  lookW: number;
  /** per-person phase offset so two of the same archetype are not in step. */
  phase: number;
  /** ground height under `pos`, sampled at spawn. */
  groundY: number;
  /** the interact prompt's world anchor; only the talking cast have one. */
  anchor?: THREE.Vector3;
  /** `game.time.now` at which they were last spoken to. */
  talkingUntil?: number;
}

/**
 * Someone who lives somewhere other than Hammerhead.
 *
 * Anchored to a **POI id** rather than a town-local `(u, v)`, because there is
 * no town system anywhere else in Lucis: `worldMap.poiById` is the same table
 * the compass, the minimap and every quest waypoint read, so a person cannot
 * drift away from the place they are named after.
 */
export interface RemoteNpc {
  castKey: keyof typeof NPC_CAST;
  /** POI id from `WorldMap`. */
  at: string;
  /**
   * A named anchor the POI's kit published, e.g. `stall0` or `edge3`.
   *
   * Without one a placement is measured off the POI **pin**, which for a
   * `town` is the centre of a merged 140 m volume — the reason every named
   * person outside Hammerhead stands in a car park. With one, the person
   * stands on the actual pavement the kit laid, and {@link off} moves them
   * around it in a frame that follows the town's yaw.
   *
   * A row with an anchor stays pending until `PoiKits` has *built* the site.
   */
  anchor?: string;
  /**
   * Offset from `anchor`, metres, in the frame **anchor -> plaza**:
   * `[along, side]`, `+along` toward the middle of the square and `+side` to
   * the left of that. Rotation-invariant, so it survives a re-seeded town.
   */
  off?: [number, number];
  /** metres east of the pin (or of the anchor, if there is one). */
  dx?: number;
  /** metres south of the pin. */
  dz?: number;
  /** heading in radians they face at rest. Anchored rows default to the plaza. */
  face?: number;
  posture?: PostureName;
  task?: NpcTask;
  talkRadius?: number;
  /** unique id, when one archetype is reused for several bodies. */
  key?: string;
  /** extra seed offset, so two copies of one archetype are not twins. */
  seed?: number;
  /**
   * A patrol, as `[along, side]` pairs in the same frame as {@link off}.
   * The body is spawned at the first node.
   */
  route?: [number, number][];
  pause?: number[];
  speed?: number;
  sit?: boolean;
}

/**
 * The cast outside Hammerhead, and where each of them stands.
 *
 * Every one of these five is **named by the quest table** and had never been
 * built — which is the whole reason the main story could not leave chapter 2.
 * `main_ch2_galdin` says "speak to Dino at the pier"; `main_ch4_lestallum`
 * wants Iris; `side_chocobo`, `side_power_play` and `side_gemstone_run` want
 * Wiz, Holly and Randolph. Twelve quests were unfinishable and five of the
 * twenty-one dead objectives were these people.
 *
 * The offsets keep them off the pin itself, which for a `landmark` or a `town`
 * POI is the *centre* of the place — Lestallum's pin is the middle of the town
 * footprint, not a spot to stand on.
 */
export const REMOTE: RemoteNpc[] = [
  // Every offset below was measured, not guessed. A town POI is a *merged*
  // volume — the whole of Lestallum is one 140 m box — so an offset chosen to
  // read as "in the market square" puts the person under the roofs, invisible,
  // and `CollisionWorld.blocked` calls it clear because the inside of a room is
  // clear standing room. `src/tools/probes/standingroom.mts` sweeps rings around
  // each POI against the actual scene graph and prints the open ground; these
  // are its answers, taking the spots closest to a wall so nobody is standing
  // in the middle of a field.
  //
  // The **parking** POI, not the town POI. Both towns are one merged volume
  // whose only open ground is 68 m out in a grass field, and a named NPC alone
  // in a field reads worse than no NPC at all. A `parking` POI is a graded,
  // paved apron by construction, it is where fast travel lands, and it is
  // where you would actually meet someone — which is where FFXV puts Iris.
  //
  // On the Galdin apron where the causeway starts, facing whoever parks.
  { castKey: 'dino', at: 'galdin_carpark', dx: 7, dz: 5, face: -1.0, posture: 'lean', task: 'inspect' },
  // ...and see CITY below: Dino also keeps a bench on the quay itself, which
  // is where his shop is. The car-park Dino is the one `main_ch2_galdin` sends
  // you to and is left exactly where it was.
  // Waiting at the Lestallum parking, which is exactly how the game meets her.
  { castKey: 'iris', at: 'lestallum_lookout', dx: -7, dz: 4, face: 1.2, posture: 'pockets' },
  // At the paddock rail, arms folded, watching the birds.
  { castKey: 'wiz', at: 'wiz_chocobo', dx: 26, dz: 14, face: -1.9, posture: 'folded' },
  // On the plant apron with a clipboard, beside the sheds.
  { castKey: 'holly', at: 'exineris', dx: -8, dz: 12, face: -2.2, posture: 'folded', task: 'inspect' },
  // **Randolph has moved into the city.** He was at the lestallum PARKING POI
  // because that was the only ground the placement pass could prove was open;
  // `PoiKits` publishes the market square's anchors now, so the weaponsmith
  // stands at his own forge on the square, which is where `side_gemstone_run`
  // has always said he is (`talk('smith', 'randolph', ..., at('lestallum'))`).
  // The row lives in CITY below.
];

/** Metres at which a {@link REMOTE} placement is built. @see Npcs._place */
const REMOTE_RANGE = 420;

/**
 * The crowd budget, spent nearest-first. See the block in {@link Npcs.update}.
 *
 * `CROWD_DETAIL` bodies get LOD 0 — eyes, contact shadow, sun shadow and the
 * shadow proxy. Up to `CROWD_MAX` get LOD 1. Everyone else, and everyone past
 * `CROWD_FAR`, is not drawn.
 *
 * **The two numbers are measured, not derived.** The arithmetic says a LOD-0
 * body is seven colour draws and a LOD-1 body four, so 4 and 12 should have
 * come to sixty; `citydraws.mts` said **68**, because a LOD-0 body also makes
 * its shadow proxy visible and an outfit can split across material groups. 3
 * and 11 measure at the budget. Re-measure rather than re-derive if the rig
 * changes: the arithmetic was wrong by 13% the first time.
 */
const CROWD_DETAIL = 3;
/** @see CROWD_DETAIL */
const CROWD_MAX = 11;
/** Metres past which nobody is drawn at all. @see CROWD_DETAIL */
const CROWD_FAR = 60;

/**
 * The people of Lestallum and Galdin Quay.
 *
 * Twenty-nine bodies, and only five of them are new archetypes. That ratio is
 * the whole perf strategy: `archetype()` in `NpcRig.ts` caches geometry, the
 * painted 1024² face **and** the eye material per cast key, so the eighteen
 * ambient bodies below cost one skeleton and five draws each and nothing else.
 * It is also why the ambient crowd deliberately re-uses `trucker`, `traveller`,
 * `mechanic` and `kid` rather than getting a look apiece: twenty distinct
 * looks would be twenty painted faces and twenty iris programs
 * (`Materials.ts` bakes the iris hex as a GLSL literal), for people you see
 * from fifteen metres.
 *
 * Everything is placed against a **kit anchor**, so nobody is standing in a
 * field or inside a wall. Which anchors are usable was measured with
 * `src/tools/probes/cityanchors.mts`: a block of Lestallum's street grid leans
 * into its square and takes out `edge0`, `edge1`, `edge5` and `stall5`, and one
 * block at Galdin takes out `edge4`. None of those five is used here.
 *
 * `off` is `[toward the plaza, to the left of that]`, so a vendor sits at the
 * front of their own stall whatever yaw the town was seeded with.
 */
export const CITY: RemoteNpc[] = [
  /* ---------------------------------------------------------- Lestallum -- */
  // The three counters, each with the person whose name is on the shop row.
  { castKey: 'verdough', at: 'lestallum', anchor: 'stall0', off: [1.7, 1.6], posture: 'folded', talkRadius: 3.0 },
  { castKey: 'surgate', at: 'lestallum', anchor: 'stall2', off: [1.6, -1.7], posture: 'folded', talkRadius: 3.0 },
  { castKey: 'randolph', at: 'lestallum', anchor: 'stall4', off: [1.8, 1.5], posture: 'folded', talkRadius: 3.2 },
  // Sania at last, on the square with a specimen jar and no interest in
  // anybody's schedule.
  { castKey: 'sania', at: 'lestallum', anchor: 'edge2', off: [2.4, -1.2], posture: 'pockets', task: 'inspect', talkRadius: 3.0 },
  // Two of the standing cast who already have scripts, so the square has
  // people to talk to that are not shopkeepers.
  { castKey: 'mechanic', at: 'lestallum', key: 'lest_mech', seed: 11, anchor: 'edge3', off: [1.8, 2.2], posture: 'wrench', task: 'wrench', talkRadius: 2.8 },
  { castKey: 'kid', at: 'lestallum', key: 'lest_kid', seed: 12, anchor: 'edge4', off: [2.6, 1.4], talkRadius: 2.6 },
  { castKey: 'traveller', at: 'lestallum', key: 'lest_trav', seed: 13, anchor: 'plaza', off: [0, 4.4], posture: 'pockets', talkRadius: 2.8 },

  // Eleven ambient. Spread deliberately: half on the square, half out on the
  // apron behind the stalls, so no single framing carries all of them.
  { castKey: 'trucker', at: 'lestallum', key: 'lest_a', seed: 21, anchor: 'stall1', off: [1.2, -2.0], posture: 'folded' },
  { castKey: 'traveller', at: 'lestallum', key: 'lest_b', seed: 22, anchor: 'stall3', off: [1.4, 1.9], posture: 'pockets' },
  { castKey: 'mechanic', at: 'lestallum', key: 'lest_c', seed: 23, anchor: 'stall0', off: [-0.4, -2.6], posture: 'pockets' },
  { castKey: 'kid', at: 'lestallum', key: 'lest_d', seed: 24, anchor: 'plaza', off: [-3.2, -2.6] },
  { castKey: 'trucker', at: 'lestallum', key: 'lest_e', seed: 25, anchor: 'edge2', off: [-2.0, 3.0], posture: 'folded' },
  // Four walkers. A square with nobody crossing it is a diorama.
  {
    castKey: 'traveller', at: 'lestallum', key: 'lest_w1', seed: 26, anchor: 'edge3',
    route: [[1.0, 0], [7.5, 2.0], [12.0, -3.0], [5.0, -4.0]], pause: [1.6, 0.9, 2.2, 1.1], speed: 1.15,
  },
  {
    castKey: 'trucker', at: 'lestallum', key: 'lest_w2', seed: 27, anchor: 'edge4',
    route: [[1.5, 1.0], [8.0, -2.5], [13.0, 1.5]], pause: [1.0, 2.4, 1.4], speed: 1.05,
  },
  {
    castKey: 'mechanic', at: 'lestallum', key: 'lest_w3', seed: 28, anchor: 'stall2',
    route: [[2.0, 0], [4.5, 5.5], [1.0, 9.0]], pause: [2.0, 1.2, 2.6], speed: 1.25,
  },
  {
    castKey: 'kid', at: 'lestallum', key: 'lest_w4', seed: 29, anchor: 'stall4',
    route: [[2.2, 1.0], [6.0, -3.5], [2.5, -7.0]], pause: [0.8, 0.6, 1.2], speed: 1.8,
  },
  // Two out on the apron, well back, so the town has depth from the road in.
  { castKey: 'trucker', at: 'lestallum', key: 'lest_f', seed: 30, anchor: 'edge2', off: [-14.0, -6.0], posture: 'folded' },
  { castKey: 'traveller', at: 'lestallum', key: 'lest_g', seed: 31, anchor: 'edge3', off: [-13.0, 5.0], posture: 'folded' },

  /* -------------------------------------------------------- Galdin Quay -- */
  { castKey: 'coctura', at: 'galdin_quay', anchor: 'stall0', off: [1.7, 1.6], posture: 'folded', talkRadius: 3.0 },
  {
    castKey: 'dino', at: 'galdin_quay', key: 'dino_bench', seed: 3, anchor: 'stall3',
    off: [1.8, -1.5], posture: 'lean', task: 'inspect', talkRadius: 3.0,
  },
  // Navyth on the rail, folded over it, watching water he has been watching
  // for eleven years. `side_legendary_fish` names him and he did not exist.
  { castKey: 'navyth', at: 'galdin_quay', anchor: 'edge0', off: [-1.6, 0], posture: 'folded', talkRadius: 3.2 },
  { castKey: 'traveller', at: 'galdin_quay', key: 'gald_trav', seed: 41, anchor: 'edge1', off: [2.2, -1.4], posture: 'pockets', talkRadius: 2.8 },

  { castKey: 'trucker', at: 'galdin_quay', key: 'gald_a', seed: 42, anchor: 'stall1', off: [1.3, 1.8], posture: 'folded' },
  { castKey: 'kid', at: 'galdin_quay', key: 'gald_b', seed: 43, anchor: 'stall2', off: [1.5, -1.6] },
  { castKey: 'mechanic', at: 'galdin_quay', key: 'gald_c', seed: 44, anchor: 'edge3', off: [2.0, 2.2], posture: 'pockets' },
  { castKey: 'traveller', at: 'galdin_quay', key: 'gald_d', seed: 45, anchor: 'edge5', off: [2.4, -2.0], posture: 'folded' },
  {
    castKey: 'trucker', at: 'galdin_quay', key: 'gald_w1', seed: 46, anchor: 'edge2',
    route: [[1.5, 0], [7.0, 3.0], [11.5, -2.0]], pause: [1.4, 2.0, 1.6], speed: 1.1,
  },
  {
    castKey: 'traveller', at: 'galdin_quay', key: 'gald_w2', seed: 47, anchor: 'stall5',
    route: [[2.0, 1.5], [6.5, -2.0], [2.0, -6.0]], pause: [1.8, 1.0, 2.2], speed: 1.2,
  },
  { castKey: 'kid', at: 'galdin_quay', key: 'gald_e', seed: 48, anchor: 'edge5', off: [-12.0, 4.0] },
];

/** Where and how one townsperson is placed. */
export interface NpcPlacement {
  /** unique id; defaults to the cast key. Needed when a cast entry is reused. */
  key?: string;
  /** extra seed offset, so two copies of one archetype differ. */
  seed?: number;
  pos?: THREE.Vector3;
  face?: THREE.Vector3;
  posture?: PostureName;
  task?: NpcTask;
  route?: THREE.Vector3[];
  pause?: number[];
  speed?: number;
  sit?: boolean;
  talkRadius?: number;
}

export class Npcs {
  _camPos!: THREE.Vector3;
  /** `InteractionSystem.register` handles, kept so they could be revoked. */
  _handles!: ReturnType<InteractionSystem['register']>[];
  /** {@link REMOTE} and {@link CITY} placements not yet built. @see _streamRemote */
  _pending!: RemoteNpc[];
  /** Scratch for the per-frame crowd ranking. Reused; never reallocated. */
  _rank!: { npc: Npc, d: number }[];
  /**
   * Raised, walkable decks the ground sampler has to know about.
   *
   * A `_town` plaza is a 0.35 m slab whose top sits 0.675 m over the graded
   * apron, and the rig's foot IK plants on `Ecology.height`. Without this every
   * person on a city square stands shin-deep in their own pavement. Filled by
   * `_place` the first time it resolves a city anchor, so it costs nothing at
   * all in a game that never goes to a city.
   */
  _pads!: { x: number, z: number, r: number, y: number }[];
  eco!: Ecology | undefined;
  game!: Game;
  /** The pad-aware ground the rig's foot IK plants on. See `_groundAt`. */
  ground!: GroundSampler;
  list!: Npc[];
  root!: THREE.Group;
  stats!: { count: number, draws: number };
  town!: Hammerhead;
  constructor() {
    this.list = [];
    this.root = new THREE.Group();
    this.root.name = 'npcs';
    this._camPos = new THREE.Vector3();
    this._handles = [];
    this._pending = REMOTE.concat(CITY);
    this._pads = [];
    this._rank = [];
  }

  async init(game: Game) {
    this.game = game;
    const town = game.get('Town');
    if (!town || !town.anchors || !town.local) {
      console.warn('[Npcs] no town to populate');
      // The five outside Hammerhead do not need the town, and the main story
      // dead-ends without them. Keep the root in the scene for them.
      game.scene.add(this.root);
      this.stats = { count: 0, draws: 0 };
      return this;
    }
    this.town = town;
    this.eco = town.eco;
    game.scene.add(this.root);

    // The rig's foot IK plants boots on `terrain.heightAt`, and the terrain
    // under Hammerhead is up to three metres below the graded pad — feed it the
    // pad instead or every townsperson stands knee-deep in their own tarmac.
    this.ground = {
      heightAt: (x: number, z: number) => this._groundAt(x, z),
      // The pad is flat, so the only honest normal is straight up.
      normalAt: (_x: number, _z: number, out: THREE.Vector3) => out.set(0, 1, 0),
    };

    // Local (u, v) helper so placement below reads as a plan view of the town.
    const L = (u: number, v: number, y = 0) => town.local(u, y, v, new THREE.Vector3());

    /* -- the named four --------------------------------------------------- */

    this._spawn('cindy', {
      // in the mouth of the open bay, one hip against the wing of the car on
      // the lift, watching the road the way she always is
      pos: L(8.4, -4.4), face: L(6.0, -14.0),
      posture: 'lean', task: 'inspect', talkRadius: 3.0,
    });

    this._spawn('cid', {
      // inside the second bay, working on the bench
      pos: L(15.6, 6.2), face: L(15.6, 9.4),
      posture: 'wrench', task: 'wrench', talkRadius: 2.9,
    });

    this._spawn('takka', {
      // behind the counter, facing out across it
      pos: L(-17.4, 3.1), face: L(-17.4, -6.0),
      posture: 'counter', task: 'chop', talkRadius: 3.4,
    });

    this._spawn('dave', {
      // by the hunt board, arms folded, reading it
      pos: L(-8.6, -4.4), face: L(-9.9, -1.8),
      posture: 'folded', talkRadius: 2.9,
    });

    /* -- ambient life ----------------------------------------------------- */

    // a garage hand under the bonnet of the flatbed
    this._spawn('mechanic', {
      key: 'mechanic_a', pos: L(21.0, -4.6), face: L(22.5, -3.6),
      posture: 'wrench', task: 'wrench',
    });
    // a second one carrying parts between the yard and the bay
    this._spawn('mechanic', {
      key: 'mechanic_b', seed: 2,
      route: [L(10.0, 9.5), L(6.4, 12.6), L(9.0, 1.0), L(16.0, -1.5)],
      pause: [3.5, 6.0, 2.5, 4.5], speed: 1.35,
    });
    // the trucker doing a circuit of his rig and the diner
    this._spawn('trucker', {
      route: [L(-13.6, -6.6), L(-14.5, -12.0), L(-11.2, -5.2)],
      pause: [5.0, 3.0, 7.0], speed: 1.2,
    });
    // a traveller sitting at the outdoor tables with a coffee — on the bench of
    // the patio set at (-22.6, -6.8), facing the table
    this._spawn('traveller', {
      pos: L(-22.75, -7.75), face: L(-22.6, -6.8), posture: 'seated', sit: true,
    });
    // and another one waiting by the pumps, hands in pockets
    this._spawn('traveller', {
      key: 'traveller_b', seed: 4,
      pos: L(0.4, -15.6), face: L(-8.0, -17.0), posture: 'pockets',
    });
    // a kid orbiting the parked cars
    this._spawn('kid', {
      route: [L(-22.0, -7.4), L(-12.0, -8.2), L(-13.4, -1.6), L(-23.0, -2.0)],
      pause: [1.2, 2.4, 1.0, 2.0], speed: 1.9,
    });
    // a haulier at the far end of the lot, folded arms, watching the road
    this._spawn('trucker', {
      key: 'trucker_b', seed: 6,
      pos: L(23.0, -19.4), face: L(6.0, -29.0), posture: 'folded',
    });

    this._registerTalk(game);
    this.stats = { count: this.list.length, draws: this.list.length * 5 };
    return this;
  }

  /**
   * Place one of the {@link REMOTE} cast, now that the party is near enough.
   *
   * Nothing here differs from a Hammerhead placement except *when* it happens.
   * The archetype build is the expensive half — a skeleton, five geometries and
   * a painted 1024² face — and five of those at boot would put back most of the
   * 6.8 s cold boot the previous lane fought for. 420 m is roughly eleven
   * seconds at road speed and two minutes on foot, so the build has landed long
   * before anyone can read a prompt.
   */
  _place(game: Game, r: RemoteNpc) {
    const p = worldMap.poiById(r.at);
    if (!p) { console.warn(`[Npcs] ${r.castKey} anchored to unknown POI "${r.at}"`); return null; }
    const frame = r.anchor ? this._anchorFrame(game, r) : null;
    if (r.anchor && !frame) return null;      // kit has not built the site yet
    const origin = frame ? frame.o : new THREE.Vector3(p.x, 0, p.z);
    // `[along, side]` -> world, through the anchor->plaza frame, so the whole
    // arrangement rotates with the town instead of being re-measured per seed.
    const at = (a: number, sd: number) => new THREE.Vector3(
      origin.x + (frame ? frame.fx * a + frame.sx * sd : a),
      origin.y,
      origin.z + (frame ? frame.fz * a + frame.sz * sd : sd),
    );
    const off = r.off || [0, 0];
    const route = r.route ? r.route.map(([a, sd]) => at(a, sd)) : undefined;
    const pos = route ? route[0].clone() : at(off[0], off[1]);
    pos.x += r.dx || 0;
    pos.z += r.dz || 0;
    this._separate(pos);
    // An anchored body faces the middle of the square unless it says otherwise
    // — a market vendor with their back to the market is the single thing that
    // most makes a crowd read as scenery.
    const face = r.face !== undefined || !frame
      ? new THREE.Vector3(pos.x + Math.sin(r.face || 0) * 6, 0, pos.z + Math.cos(r.face || 0) * 6)
      : frame.plaza.clone();
    const npc = this._spawn(r.castKey, {
      key: r.key, seed: r.seed, pos, face, route, pause: r.pause, speed: r.speed, sit: r.sit,
      posture: r.posture, task: r.task, talkRadius: r.talkRadius ?? (r.key ? 0 : 3.0),
    });
    if (!npc) return null;
    this._registerTalkFor(game, npc);
    return npc;
  }

  /**
   * Push a new body clear of everyone already standing there.
   *
   * The offsets in {@link CITY} are authored per anchor and the anchors are
   * 7.8 m apart on a ring, so on paper nobody overlaps. In the frame two of
   * them did — `galdin_pier_sunset` had a pair standing about half a metre
   * apart and reading as one four-armed person — because two rows offset
   * toward the same plaza from adjacent anchors converge, and a walker's
   * first route node is a placement like any other. Two people inside each
   * other is the single fastest way to make a crowd read as a bug.
   *
   * Sixteen steps around a circle at a growing radius, first free spot wins:
   * deterministic, no search, and a no-op for anybody already clear.
   *
   * @param pos the intended spot, moved in place
   */
  _separate(pos: THREE.Vector3) {
    // 2.2 m, not the 1.55 that first shipped: at 1.55 nobody was overlapping
    // in world space and two pairs still read as one four-armed person in
    // `galdin_pier_sunset`, because a camera at eye level compresses depth and
    // 1.55 m apart along the view axis is 1.55 m of nothing. The number that
    // matters is separation in the FRAME, and 2.2 is what clears it.
    const MIN = 2.2;
    const clear = (x: number, z: number) => {
      for (const o of this.list) if (Math.hypot(o.pos.x - x, o.pos.z - z) < MIN) return false;
      return true;
    };
    if (clear(pos.x, pos.z)) return;
    for (let ring = 1; ring <= 4; ring++) {
      const rad = MIN * ring;
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const x = pos.x + Math.cos(a) * rad, z = pos.z + Math.sin(a) * rad;
        if (clear(x, z)) { pos.x = x; pos.z = z; return; }
      }
    }
  }

  /**
   * The local frame of a kit anchor: where it is, and which way the square is.
   *
   * `+f` points at the plaza, `+s` is to the left of that. Returns `null`
   * until `PoiKits` has built the site, which is the signal `_streamRemote`
   * uses to keep the row pending.
   *
   * It also registers the plaza as a raised pad the moment it first resolves —
   * see {@link _pads}. Doing it here rather than in a table is what keeps the
   * height honest: it is read off the anchor the geometry was built with.
   *
   * @param game the game
   * @param r the placement
   */
  _anchorFrame(game: Game, r: RemoteNpc) {
    const kits = game.get('Props')?.poiKits;
    if (!kits) return null;
    const o = kits.anchorAt(r.at, r.anchor as string);
    const plaza = kits.anchorAt(r.at, 'plaza');
    if (!o || !plaza) return null;
    if (!this._pads.some((q) => q.x === plaza.x && q.z === plaza.z)) {
      // The paved disc is 11 m; 11.4 covers the kerb the apron meets it at.
      this._pads.push({ x: plaza.x, z: plaza.z, r: 11.4, y: plaza.y });
    }
    let fx = plaza.x - o.x, fz = plaza.z - o.z;
    const d = Math.hypot(fx, fz) || 1;
    fx /= d; fz /= d;
    // left of `f` in this handedness
    return { o, plaza, fx, fz, sx: -fz, sz: fx };
  }

  /**
   * Place one townsperson.
   * @param castKey key in NPC_CAST
   * @param opts placement and behaviour
   */
  _spawn(castKey: keyof typeof NPC_CAST, opts: NpcPlacement = {}): Npc | null {
    const def = NPC_CAST[castKey];
    if (!def) return null;
    const key = opts.key || castKey;
    const arch = archetype(castKey, def);
    const body = new NpcBody(arch, (def.look.seed || 1) + (opts.seed || 0) * 977);
    this.root.add(body.root);

    const pos = (opts.pos || (opts.route && opts.route[0]) || new THREE.Vector3()).clone();
    const npc: Npc = {
      id: key,
      castKey,
      name: def.name,
      role: def.role,
      hue: def.hue,
      body,
      rng: new Rng(1000 + this.list.length * 31),
      posture: opts.posture ? POSTURES[opts.posture] : null,
      postureName: opts.posture || null,
      task: opts.task || null,
      route: opts.route || null,
      pause: opts.pause || null,
      speed: opts.speed || 1.3,
      sit: !!opts.sit,
      talkRadius: opts.talkRadius || 0,
      leg: 0, wait: 0, heading: 0, moveSpeed: 0,
      pos,
      face: opts.face ? opts.face.clone() : null,
      lookW: 0,
      phase: this.list.length * 0.618,
      // Stand on the terrain, or on the town pad where that is higher. A seated
      // NPC drops by the difference between a standing hip and a bench seat, so
      // the backside lands on the plank rather than hovering over it.
      groundY: this._groundAt(pos.x, pos.z),
    };
    npc.pos.y = npc.groundY + (opts.sit ? -0.30 * (body.height / 1.7) : 0);
    body.root.position.copy(npc.pos);
    if (npc.face) npc.heading = Math.atan2(npc.face.x - npc.pos.x, npc.face.z - npc.pos.z);
    body.root.rotation.y = npc.heading;

    this.list.push(npc);
    return npc;
  }

  /** Terrain height, floored at the town pad so nobody sinks into the tarmac. */
  _groundAt(x: number, z: number) {
    const t = this.town;
    const eco = this.eco;
    let y = eco ? eco.height(x, z) : 0;
    if (t && t.origin) {
      const d = Math.hypot(x - t.origin.x, z - t.origin.z);
      if (d < 42) y = Math.max(y, t.base + 0.02);
    }
    for (const pad of this._pads) {
      if (Math.hypot(x - pad.x, z - pad.z) < pad.r) y = Math.max(y, pad.y);
    }
    return y;
  }

  /** The named cast answer to E. */
  _registerTalk(game: Game) {
    const ix = game.get('Interaction');
    if (!ix) return;
    for (const npc of this.list) this._registerTalkFor(game, npc);
  }

  /** One person's `Talk` interactable. @see _registerTalk */
  _registerTalkFor(game: Game, npc: Npc) {
    const ix = game.get('Interaction');
    if (!ix) return;
    if (!npc.talkRadius) return;
    const make = NPC_DIALOGUE[npc.castKey as keyof typeof NPC_DIALOGUE];
    if (!make) return;
    // Seeded from where the person is standing, not left at the origin.
    // `update` refreshes it, but only for someone the camera is near — so an
    // unseeded anchor put a phantom `Talk` prompt at (0, 0, 0), which is 60 m
    // from where the game starts. Reading `npc_cid.pos` from a probe standing
    // at the car is how the last lane spent an afternoon on a picker bug that
    // was really this.
    const anchor = npc.pos.clone();
    {
      this._handles.push(ix.register({
        id: `npc_${npc.id}`,
        pos: anchor,
        radius: npc.talkRadius,
        priority: 3,               // people beat fixtures they are standing next to
        verb: 'Talk',
        label: npc.name,
        hint: npc.role,
        yOffset: npc.body.height * 0.62,
        handler: () => {
          npc.talkingUntil = game.time.now + 0.4;
          ix.say(make(game));
          const rpg = game.get('RpgSystem') || game.get('Rpg');
          rpg?.quests?.notify?.('talk', { target: npc.castKey });
        },
      }));
      npc.anchor = anchor;
    }
  }

  /* --------------------------------------------------------------- tick */

  update(dt: number, game: Game) {
    this._camPos.setFromMatrixPosition(game.camera.matrixWorld);
    this._streamRemote(game);
    if (!this.list.length) return;
    const player = game.get('Player');
    const p = player ? player.position : null;
    const t = game.time.now;
    const talking = game.get('Interaction')?.talking;

    // LOD before anything else: an NPC nobody can see does not need a skeleton
    // solve, and the skeleton solve is the whole per-NPC cost.
    //
    // **Distance alone is not enough any more, and the numbers say so.** With
    // eleven people at Hammerhead a pure distance ramp was fine. With
    // twenty-nine more in two cities, `citydraws.mts` measured a Lestallum
    // framing at **18 bodies and 159 colour draws** against a budget of twelve
    // and sixty — because a market square is 22 m across, so *every* body in it
    // is inside any distance threshold you would want for the people you are
    // actually looking at. A budget cannot be bought with a radius when the
    // whole crowd is inside the radius.
    //
    // So the crowd is **ranked** and the budget is spent nearest-first, which
    // is how a shipped game does it: the closest {@link CROWD_DETAIL} get eyes,
    // a contact shadow and a sun shadow, the next few get a body, and past
    // {@link CROWD_MAX} people are not drawn. It caps the cost by construction
    // instead of hoping a radius does, and at Hammerhead — eleven bodies,
    // under both caps — it changes nothing at all.
    // The ranking array is pooled rather than rebuilt: it is sorted every
    // frame, and thirty short-lived objects per frame in an update loop is the
    // kind of thing that does not show up in a profile and does show up in the
    // `>16 ms` column. Entries past `n` are parked at `Infinity` so the sort
    // pushes them off the end instead of the array having to be truncated.
    const R = this._rank;
    let n = 0;
    for (const npc of this.list) {
      const d = this._camPos.distanceTo(npc.pos);
      // The prompt anchor is not part of the LOD. It costs a vector copy, it
      // is what the interaction verb reads, and skipping it past 85 m is how a
      // `TALK / TAKKA` prompt came to hang over empty desert 594 m from Takka.
      this._anchor(npc);
      if (d > CROWD_FAR) { npc.body.setLod(2); continue; }
      if (!R[n]) R[n] = { npc, d };
      R[n].npc = npc;
      R[n].d = d;
      n++;
    }
    for (let i = n; i < R.length; i++) R[i].d = Infinity;
    R.sort((a, b) => a.d - b.d);

    for (let i = 0; i < n; i++) {
      const { npc, d } = R[i];
      const lod = i >= CROWD_MAX ? 2 : (i < CROWD_DETAIL && d <= 25) ? 0 : 1;
      npc.body.setLod(lod);
      if (lod === 2) continue;

      if (npc.route) this._walk(npc, dt);
      else npc.moveSpeed = THREE.MathUtils.damp(npc.moveSpeed, 0, 8, dt);

      // Head/eye tracking. FFXV NPCs notice you well before you reach them,
      // which is most of why its outposts feel inhabited.
      let look: THREE.Vector3 | null = null;
      if (p) {
        const dist = p.distanceTo(npc.pos);
        const want = dist < 9.5 && !npc.route ? 1 : dist < 5.0 ? 1 : 0;
        npc.lookW = THREE.MathUtils.damp(npc.lookW, want, 3.2, dt);
        if (npc.lookW > 0.02) {
          look = _tgt.copy(p);
          look.y += 1.5;
          // ease the target back toward their default facing as the weight drops
          if (npc.face && npc.lookW < 0.99) {
            _v.copy(npc.face); _v.y = npc.pos.y + 1.5;
            look.lerp(_v, 1 - npc.lookW);
          }
        }
      }
      npc.body.setLookTarget(look);

      // Talking NPCs square up to the player for the duration.
      if (talking && npc.talkingUntil && t < npc.talkingUntil + 600 && p) {
        const want = Math.atan2(p.x - npc.pos.x, p.z - npc.pos.z);
        npc.heading = dampAngle(npc.heading, want, 4, dt);
      }

      npc.body.root.position.copy(npc.pos);
      npc.body.root.rotation.y = npc.heading;

      npc.body.update(dt, {
        speed: npc.moveSpeed,
        velocity: _v.set(Math.sin(npc.heading), 0, Math.cos(npc.heading)).multiplyScalar(npc.moveSpeed),
        turnRate: 0,
        terrain: npc.sit ? null : this.ground,
        wind: 0.28,
      });

      // Posture and task ride on top of the finished pose.
      if (npc.posture && npc.moveSpeed < 0.4) this._applyPosture(npc, dt, t);
    }
  }

  /**
   * Put one person's prompt anchor where that person is.
   *
   * A quarter of a metre in front of them, so the prompt does not sit inside
   * their own head. Called for **every** NPC every frame, LOD or no LOD: this
   * is the position the interaction verb is judged against, and an anchor that
   * stops being updated is a prompt that keeps being offered somewhere its
   * subject has left.
   */
  _anchor(npc: Npc) {
    const a = npc.anchor;
    if (!a) return;
    a.copy(npc.pos);
    a.x += Math.sin(npc.heading) * 0.25;
    a.z += Math.cos(npc.heading) * 0.25;
  }

  /**
   * Build any {@link REMOTE} placement the camera has come within range of.
   *
   * One per call at most: two archetype builds in the same frame is a visible
   * hitch, and the range gives seconds of slack even at road speed. Checked
   * against the *camera* rather than the player because the camera is what
   * leads a drive, and because a capture or a freecam has no player near it.
   */
  _streamRemote(game: Game) {
    const pend = this._pending;
    if (!pend || !pend.length) return;
    for (let i = 0; i < pend.length; i++) {
      const r = pend[i];
      const p = worldMap.poiById(r.at);
      if (!p) { pend.splice(i, 1); return; }
      if (Math.hypot(p.x + (r.dx || 0) - this._camPos.x, p.z + (r.dz || 0) - this._camPos.z) > REMOTE_RANGE) continue;
      // An anchored row cannot be placed until the kit has built the site, and
      // `PoiKits` builds one POI per frame. `_place` returns null for exactly
      // that case, and the row stays pending rather than being lost — which is
      // what a `splice` before the call would have done, silently, for every
      // city body, because 420 m is well outside `BUILD_R`.
      const npc = this._place(game, r);
      if (!npc && r.anchor) continue;
      pend.splice(i, 1);
      this.stats = { count: this.list.length, draws: this.list.length * 5 };
      return;
    }
  }

  /** Walk a route, pausing at each node. */
  _walk(npc: Npc, dt: number) {
    const route = npc.route;
    if (!route) return;
    const target = route[npc.leg];
    if (npc.wait > 0) {
      npc.wait -= dt;
      npc.moveSpeed = THREE.MathUtils.damp(npc.moveSpeed, 0, 7, dt);
      return;
    }
    _v.copy(target).sub(npc.pos);
    _v.y = 0;
    const dist = _v.length();
    if (dist < 0.45) {
      npc.leg = (npc.leg + 1) % route.length;
      npc.wait = (npc.pause && npc.pause[npc.leg]) || 2.5;
      return;
    }
    _v.multiplyScalar(1 / dist);
    const want = Math.atan2(_v.x, _v.z);
    npc.heading = dampAngle(npc.heading, want, 5.5, dt);
    npc.moveSpeed = THREE.MathUtils.damp(npc.moveSpeed, npc.speed, 5, dt);
    npc.pos.x += Math.sin(npc.heading) * npc.moveSpeed * dt;
    npc.pos.z += Math.cos(npc.heading) * npc.moveSpeed * dt;
    npc.pos.y = this._groundAt(npc.pos.x, npc.pos.z);
  }

  /**
   * Layer the standing posture and the work motion on after the animator.
   * Written straight onto bone rotations, which is safe because nothing else
   * touches them between here and the render.
   */
  _applyPosture(npc: Npc, dt: number, t: number) {
    const b = npc.body.rig.byName;
    const w = 1 - Math.min(1, npc.moveSpeed / 0.4);
    const pose = npc.posture;
    if (!pose) return;
    for (const name of POSE_BONES) {
      const e = pose[name];
      if (!e || !b[name]) continue;
      b[name].rotation.x += e[0] * w;
      b[name].rotation.y += e[1] * w;
      b[name].rotation.z += e[2] * w;
    }
    if (pose.footL && b.footL) b.footL.rotation.x += pose.footL[0] * w;
    if (pose.footR && b.footR) b.footR.rotation.x += pose.footR[0] * w;

    // A repeating work motion so the pose is an activity, not a statue.
    const ph = t * 1.35 + npc.phase * 6.28;
    if (npc.task === 'wrench' && b.lowerArmR) {
      const s = Math.sin(ph * 1.6);
      b.lowerArmR.rotation.x += 0.30 * s * w;
      b.upperArmR.rotation.z += 0.10 * s * w;
      if (b.spine02) b.spine02.rotation.x += 0.035 * Math.sin(ph * 1.6 + 0.6) * w;
    } else if (npc.task === 'chop' && b.lowerArmR) {
      const s = Math.max(0, Math.sin(ph * 3.1));
      b.lowerArmR.rotation.x -= 0.42 * s * w;
      if (b.handR) b.handR.rotation.x += 0.22 * s * w;
    } else if (npc.task === 'inspect') {
      // Cindy glances down at the engine, then back up at the road
      const s = 0.5 + 0.5 * Math.sin(ph * 0.42);
      if (b.neck) b.neck.rotation.x += 0.22 * s * w;
      if (b.spine03) b.spine03.rotation.x += 0.06 * s * w;
    }
  }

  lateUpdate(dt: number, game: Game) {
    // The rig's materials carry their own sun uniform; keep it fed even when
    // the player system is not the one that pushed it this frame.
    const sky = game.get('Sky');
    if (sky && sky.sun) updateSun(sky.sun, game.camera);
  }
}

function dampAngle(a: number, b: number, lambda: number, dt: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-lambda * dt));
}

export default Npcs;
