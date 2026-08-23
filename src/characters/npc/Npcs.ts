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
  /** metres east of the pin. */
  dx?: number;
  /** metres south of the pin. */
  dz?: number;
  /** heading in radians they face at rest. */
  face?: number;
  posture?: PostureName;
  task?: NpcTask;
  talkRadius?: number;
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
  // On the boardwalk at Galdin, facing back up the causeway at whoever arrives.
  { castKey: 'dino', at: 'galdin_quay', dx: 18, dz: -26, face: 2.6, posture: 'lean', task: 'inspect' },
  // Outside the Leville, watching the market square.
  { castKey: 'iris', at: 'lestallum', dx: -34, dz: 22, face: 0.8, posture: 'pockets' },
  // At the paddock rail, arms folded, watching the birds.
  { castKey: 'wiz', at: 'wiz_chocobo', dx: 26, dz: 14, face: -1.9, posture: 'folded' },
  // On the plant apron with a clipboard.
  { castKey: 'holly', at: 'exineris', dx: 40, dz: -30, face: 1.4, posture: 'folded', task: 'inspect' },
  // At his anvil on the far side of the Lestallum market from Iris.
  { castKey: 'randolph', at: 'lestallum', dx: 44, dz: -18, face: -2.2, posture: 'counter', task: 'wrench' },
];

/** Metres at which a {@link REMOTE} placement is built. @see Npcs._place */
const REMOTE_RANGE = 420;

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
  /** {@link REMOTE} placements not yet built. @see _streamRemote */
  _pending!: RemoteNpc[];
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
    this._pending = REMOTE.slice();
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
    const pos = new THREE.Vector3(p.x + (r.dx || 0), 0, p.z + (r.dz || 0));
    const face = new THREE.Vector3(pos.x + Math.sin(r.face || 0) * 6, 0, pos.z + Math.cos(r.face || 0) * 6);
    const npc = this._spawn(r.castKey, { pos, face, posture: r.posture, task: r.task, talkRadius: r.talkRadius ?? 3.0 });
    if (!npc) return null;
    this._registerTalkFor(game, npc);
    return npc;
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

    for (const npc of this.list) {
      const d = this._camPos.distanceTo(npc.pos);
      // LOD before anything else: an NPC nobody can see does not need a
      // skeleton solve, and the skeleton solve is the whole per-NPC cost.
      const lod = d > 85 ? 2 : d > 38 ? 1 : 0;
      npc.body.setLod(lod);
      // The prompt anchor is not part of the LOD. It costs a vector copy, it
      // is what the interaction verb reads, and skipping it past 85 m is how a
      // `TALK / TAKKA` prompt came to hang over empty desert 594 m from Takka.
      this._anchor(npc);
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
      pend.splice(i, 1);
      this._place(game, r);
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
