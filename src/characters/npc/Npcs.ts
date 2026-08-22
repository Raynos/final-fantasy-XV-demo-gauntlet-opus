import * as THREE from 'three';
import { archetype, NpcBody } from './NpcRig.ts';
import { NPC_CAST } from './NpcCast.ts';
import { NPC_DIALOGUE } from './NpcDialogue.ts';
import { Rng } from '../../util/Rng.ts';
import { updateSun } from '../rig/Materials.ts';

/**
 * The population of Hammerhead.
 *
 * Eleven people, placed against the anchors the town system publishes, each
 * with a behaviour rather than a spot on the floor:
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
 * opens Cindy's conversation and not the fuel pump behind her.
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
};

export class Npcs {
  _camPos!: THREE.Vector3;
  _handles!: any[];
  eco!: any;
  game!: any;
  ground!: any;
  list!: any[];
  root!: THREE.Group;
  stats!: any;
  town!: any;
  constructor() {
    this.list = [];
    this.root = new THREE.Group();
    this.root.name = 'npcs';
    this._camPos = new THREE.Vector3();
  }

  async init(game: any) {
    this.game = game;
    const town = game.get('Town') || game.get('Hammerhead');
    if (!town || !town.anchors || !town.local) {
      console.warn('[Npcs] no town to populate');
      return this;
    }
    this.town = town;
    this.eco = town.eco;
    game.scene.add(this.root);

    // The rig's foot IK plants boots on `terrain.heightAt`, and the terrain
    // under Hammerhead is up to three metres below the graded pad — feed it the
    // pad instead or every townsperson stands knee-deep in their own tarmac.
    this.ground = {
      heightAt: (x: any, z: any) => this._groundAt(x, z),
      normalAt: (x: any, z: any, out: any) => (out ? out.set(0, 1, 0) : new THREE.Vector3(0, 1, 0)),
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
   * Place one townsperson.
   * @param castKey key in NPC_CAST
   * @param opts placement and behaviour
   */
  _spawn(castKey: string, opts: any = {}) {
    const def = NPC_CAST[castKey as keyof typeof NPC_CAST];
    if (!def) return null;
    const key = opts.key || castKey;
    const arch = archetype(castKey, def);
    const body = new NpcBody(arch, (def.look.seed || 1) + (opts.seed || 0) * 977);
    this.root.add(body.root);

    /** `groundY` is filled in below, once the terrain under the NPC is sampled. */
    const npc: Record<string, any> = {
      id: key,
      castKey,
      name: def.name,
      role: def.role,
      hue: def.hue,
      body,
      rng: new Rng(1000 + this.list.length * 31),
      posture: POSTURES[opts.posture as keyof typeof POSTURES] || null,
      postureName: opts.posture || null,
      task: opts.task || null,
      route: opts.route || null,
      pause: opts.pause || null,
      speed: opts.speed || 1.3,
      sit: !!opts.sit,
      talkRadius: opts.talkRadius || 0,
      leg: 0, wait: 0, heading: 0, moveSpeed: 0,
      pos: (opts.pos || (opts.route && opts.route[0]) || new THREE.Vector3()).clone(),
      face: opts.face ? opts.face.clone() : null,
      lookW: 0,
      phase: this.list.length * 0.618,
    };

    // Stand on the terrain, or on the town pad where that is higher. A seated
    // NPC drops by the difference between a standing hip and a bench seat, so
    // the backside lands on the plank rather than hovering over it.
    npc.groundY = this._groundAt(npc.pos.x, npc.pos.z);
    npc.pos.y = npc.groundY + (opts.sit ? -0.30 * (body.height / 1.7) : 0);
    body.root.position.copy(npc.pos);
    if (npc.face) npc.heading = Math.atan2(npc.face.x - npc.pos.x, npc.face.z - npc.pos.z);
    body.root.rotation.y = npc.heading;

    this.list.push(npc);
    return npc;
  }

  /** Terrain height, floored at the town pad so nobody sinks into the tarmac. */
  _groundAt(x: any, z: any) {
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
  _registerTalk(game: any) {
    const ix = game.get('Interaction');
    if (!ix) return;
    this._handles = [];
    for (const npc of this.list) {
      if (!npc.talkRadius) continue;
      const make = NPC_DIALOGUE[npc.castKey as keyof typeof NPC_DIALOGUE];
      if (!make) continue;
      const anchor = new THREE.Vector3();
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

  update(dt: any, game: any) {
    if (!this.list.length) return;
    const player = game.get('Player');
    const p = player ? player.position : null;
    this._camPos.setFromMatrixPosition(game.camera.matrixWorld);
    const t = game.time.now;
    const talking = game.get('Interaction')?.talking;

    for (const npc of this.list) {
      const d = this._camPos.distanceTo(npc.pos);
      // LOD before anything else: an NPC nobody can see does not need a
      // skeleton solve, and the skeleton solve is the whole per-NPC cost.
      const lod = d > 85 ? 2 : d > 38 ? 1 : 0;
      npc.body.setLod(lod);
      if (lod === 2) continue;

      if (npc.route) this._walk(npc, dt);
      else npc.moveSpeed = THREE.MathUtils.damp(npc.moveSpeed, 0, 8, dt);

      // Head/eye tracking. FFXV NPCs notice you well before you reach them,
      // which is most of why its outposts feel inhabited.
      let look: any = null;
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
      if (npc.anchor) {
        npc.anchor.copy(npc.pos);
        // stand the prompt anchor a little in front so it does not sit inside
        // the person's own head
        npc.anchor.x += Math.sin(npc.heading) * 0.25;
        npc.anchor.z += Math.cos(npc.heading) * 0.25;
      }
    }
  }

  /** Walk a route, pausing at each node. */
  _walk(npc: any, dt: any) {
    const route = npc.route;
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
  _applyPosture(npc: any, dt: any, t: any) {
    const b = npc.body.rig.byName;
    const w = 1 - Math.min(1, npc.moveSpeed / 0.4);
    const pose = npc.posture;
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

  lateUpdate(dt: any, game: any) {
    // The rig's materials carry their own sun uniform; keep it fed even when
    // the player system is not the one that pushed it this frame.
    const sky = game.get('Sky');
    if (sky && sky.sun) updateSun(sky.sun, game.camera);
  }
}

function dampAngle(a: any, b: number, lambda: number, dt: any) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-lambda * dt));
}

export default Npcs;
