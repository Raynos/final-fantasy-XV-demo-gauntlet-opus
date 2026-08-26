import * as THREE from 'three';
import { TileStream } from './TileStream.ts';
import { itemDef } from '../../game/rpg/Inventory.ts';
import type { Ecology } from '../veg/Ecology.ts';
import type { Game } from '../../game/Game.ts';
import type { InteractableHandle } from '../../game/interaction/Interactables.ts';

/**
 * The things lying in the grass.
 *
 * `walkabout.mts` sprinted the player 3 km across Lucis and reported an E
 * prompt available on **0% of samples**. Thirteen `register()` calls exist in
 * the whole game and every one of them is inside Hammerhead, a dungeon, a haven
 * or a fishing spot — so once the player leaves a named place there is nothing
 * to walk toward and nothing to pick up. Meanwhile the HUD's own objective at
 * boot reads *"Collect Rusted Bits from the wastes (2/3)"*, and the wastes had
 * no Rusted Bits in them: the item existed only as an enemy drop and as chest
 * loot in Balouve.
 *
 * FFXV's open country is dotted with these — a blue glint at fifty metres that
 * turns out to be a Leiden pepper or a debased coin. They are what makes the
 * space between two landmarks worth crossing on foot instead of driving past,
 * and they are the cheapest content in an open-world game: no AI, no combat,
 * no authoring.
 *
 * Built the way everything else out here is built: a deterministic function of
 * the cell, streamed around the camera, so a spot is in the same place with the
 * same contents on the next visit. What it *contains* is chosen from the ground
 * it sits on — scrap by the road, peppers in the scrub, gemstones in the rock,
 * shells at the water line — which is the same rule the vegetation and the
 * boulders already follow.
 */

/** Cell pitch, metres. */
const CELL = 110;
/** Chance a cell holds a spot, before the ground gets a say. */
const OCCUPANCY = 0.55;
/** How far spots are streamed. Well past the 150 m the glint reads at. */
const RADIUS = 420;
/** Instance capacity — the disc holds ~55 after rejections; this is the roof. */
const CAP = 180;
/** Metres the player must be inside for the prompt. */
const REACH = 3.2;

/** One authored pool of things a spot can contain. */
interface Pool {
  /** Item ids, weighted by their order — earlier is commoner. */
  items: string[];
  /** How many come out of one spot. */
  count: [number, number];
}

/**
 * What is worth picking up, by where it is lying.
 *
 * Deliberately shallow: this is a *placement* file, and every id here is one
 * `Inventory` already defines. The categories are the ones the ground can
 * actually distinguish — the road corridor, the wet ground, the rock, the
 * scrub — because a pool that needs a hand-placed marker is not a pool this
 * system can serve.
 */
const POOLS: Record<string, Pool> = {
  // the verge, the wrecks, the blockades: machine scrap and old money
  road: {
    items: ['rusted_bit', 'rusted_bit', 'debased_coin', 'chrome_bit', 'debased_silver',
      'potion', 'antidote', 'imperial_relay'],
    count: [1, 2],
  },
  // open dry scrub — Leide's larder
  scrub: {
    items: ['leiden_pepper', 'wild_onion', 'leiden_potato', 'lucian_tomato',
      'lucian_carrot', 'potion', 'debased_coin', 'sweet_pepper'],
    count: [1, 3],
  },
  // rock, scree and the shedding faces above them
  rock: {
    items: ['earth_gemstone', 'rusted_bit', 'sky_gemstone', 'old_book',
      'debased_silver', 'mythril_shaft'],
    count: [1, 1],
  },
  // damp ground, riverbank, lake margin
  wet: {
    items: ['allural_shallot', 'duscaen_olives', 'aegir_root', 'cleigne_darkshell',
      'vesproom', 'beautiful_bottle', 'birdbeast_egg'],
    count: [1, 2],
  },
  // under a canopy
  wood: {
    items: ['malmashroom', 'vesproom', 'curiel_greens', 'duscaen_olives',
      'kettier_ginger', 'ulwaat_berries'],
    count: [1, 2],
  },
};

/** Deterministic hash of a cell and a salt -> [0,1). */
function hash(cx: number, cz: number, salt: number) {
  let h = (cx * 374761393 + cz * 668265263 + salt * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 2654435761);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/**
 * Weighted pick, front-loaded.
 *
 * `u^1.8` over the list makes the first entries several times likelier than
 * the last, so a pool can carry its own rare tail — `mythril_shaft` at the end
 * of `rock` comes up about one spot in thirty — without a second weights array
 * to keep in step with it.
 */
function pickItem(items: string[], u: number) {
  return items[Math.min(items.length - 1, Math.floor(Math.pow(u, 1.8) * items.length))];
}

/** One forage spot, as generated. */
interface Spot {
  x: number;
  y: number;
  z: number;
  /** Cell key, and the identity that survives being walked away from. */
  key: number;
  item: string;
  count: number;
  /** 0..1 phase, so a field of these does not pulse in unison. */
  phase: number;
}

/**
 * The glint: a floating shard and an additive halo behind it.
 *
 * Two instanced meshes for the whole world, so the layer costs two draw calls
 * however many spots are resident. The shard reads from about forty metres and
 * the halo from a hundred and fifty, which is what makes a spot something you
 * *choose to walk to* rather than something you find by standing on it.
 */
function shardGeometry() {
  const g = new THREE.OctahedronGeometry(0.22, 0);
  g.computeBoundingSphere();
  return g;
}

export class Foraging {
  eco!: Ecology;
  game!: Game;
  /** Cell keys already collected this session. */
  taken!: Set<number>;
  stream!: TileStream<Spot>;
  root!: THREE.Group;
  shard!: THREE.InstancedMesh;
  halo!: THREE.InstancedMesh;
  /** Resident spots this frame, nearest first — the prompt reads slot 0. */
  live!: Spot[];
  /** The registered prompt, re-pointed as the player walks between spots. */
  _handle!: InteractableHandle | null;
  /** The spot the prompt is currently offering. */
  _offered!: Spot | null;
  _camPos!: THREE.Vector3;
  _t!: number;

  constructor(eco: Ecology, scene: THREE.Scene) {
    this.eco = eco;
    this.taken = new Set();
    this.live = [];
    this._handle = null;
    this._offered = null;
    this._camPos = new THREE.Vector3();
    this._t = 0;

    this.root = new THREE.Group();
    this.root.name = 'foraging';
    this.root.matrixAutoUpdate = false;
    scene.add(this.root);

    const shardMat = new THREE.MeshStandardMaterial({
      color: 0x9fd8ff, emissive: 0x63b4ff, emissiveIntensity: 3.4,
      roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.92,
    });
    this.shard = new THREE.InstancedMesh(shardGeometry(), shardMat, CAP);
    this.shard.name = 'forage_shard';
    this.shard.castShadow = false;
    this.shard.receiveShadow = false;
    this.shard.count = 0;
    this.shard.frustumCulled = false;
    this.root.add(this.shard);

    // The halo is what carries the spot at distance. Additive and unlit, so
    // it survives the grade at the far end of a daylight frame; depth-write
    // off so two spots behind each other do not punch holes in one another.
    const haloMat = new THREE.MeshBasicMaterial({
      color: 0x7fc4ff, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.halo = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.5, 1.5), haloMat, CAP);
    this.halo.name = 'forage_halo';
    this.halo.count = 0;
    this.halo.frustumCulled = false;
    this.halo.renderOrder = 3;
    this.root.add(this.halo);

    this.stream = new TileStream<Spot>({
      cell: CELL, radius: RADIUS, budget: 6, budgetMs: 0.35,
      gen: (cx, cz, out) => this._gen(cx, cz, out),
    });
  }

  /** Which pool the ground at `(x, z)` belongs to. */
  _poolAt(x: number, z: number): string {
    const eco = this.eco;
    if (eco.roadDist(x, z) < 26) return 'road';
    if (eco.waterDepth(x, z) > -2.5) return 'wet';
    if (eco.wetness(x, z) > 0.62) return 'wet';
    const b = eco.veg(x, z);
    if (b.canopy > 0.4) return 'wood';
    if (eco.rockSuit(x, z) > 0.55 || eco.slope01(x, z) > 0.34) return 'rock';
    return 'scrub';
  }

  /** One cell's spots. Pure in `(cx, cz)` and the world seed. */
  _gen(cx: number, cz: number, out: Spot[]) {
    if (hash(cx, cz, 0x1f37) > OCCUPANCY) return;
    const jx = hash(cx, cz, 0x2b91), jz = hash(cx, cz, 0x3c05);
    const x = (cx + 0.15 + jx * 0.7) * CELL;
    const z = (cz + 0.15 + jz * 0.7) * CELL;
    const eco = this.eco;
    if (eco.waterDepth(x, z) > 0.1) return;      // not in a lake
    if (eco.slope01(x, z) > 0.5) return;         // not on a cliff
    if (eco.cleared(x, z) > 0.05) return;        // not on a town pad
    const key = ((cx & 0xffff) << 16) | (cz & 0xffff);
    if (this.taken.has(key)) return;

    const pool = POOLS[this._poolAt(x, z)] || POOLS.scrub;
    const item = pickItem(pool.items, hash(cx, cz, 0x4d13));
    const n = pool.count[0]
      + Math.floor(hash(cx, cz, 0x5e27) * (pool.count[1] - pool.count[0] + 1 - 1e-6));
    out.push({
      x, z, y: eco.height(x, z) + 0.55, key, item, count: n,
      phase: hash(cx, cz, 0x6f3b),
    });
  }

  /**
   * Rebuild the instance buffers and re-point the prompt.
   *
   * Runs every frame because the glint bobs and spins; the *placement* only
   * changes when the stream does. Both buffers are written in one pass over
   * the live cells, nearest first, so the prompt can read slot 0 without a
   * second sort.
   */
  update(dt: number, game: Game) {
    this._t += dt;
    const cam = this._camPos.setFromMatrixPosition(game.camera.matrixWorld);
    this.stream.update(cam);

    const live = this.live;
    live.length = 0;
    for (const [, arr] of this.stream.live) {
      for (const s of arr) {
        if (this.taken.has(s.key)) continue;
        live.push(s);
      }
    }
    const player = game.get('Player');
    const pp = (player && player.position) || cam;
    live.sort((a, b) => ((a.x - pp.x) ** 2 + (a.z - pp.z) ** 2)
      - ((b.x - pp.x) ** 2 + (b.z - pp.z) ** 2));

    const n = Math.min(live.length, CAP);
    const sm = this.shard.instanceMatrix.array;
    const hm = this.halo.instanceMatrix.array;
    const camQ = game.camera.quaternion;
    for (let i = 0; i < n; i++) {
      const s = live[i];
      const ph = this._t * 1.7 + s.phase * 6.283;
      const bob = Math.sin(ph) * 0.13;
      _e.set(0.42, this._t * 1.1 + s.phase * 6.283, 0);
      _q.setFromEuler(_e);
      _p.set(s.x, s.y + bob, s.z);
      _s.setScalar(1);
      _m.compose(_p, _q, _s);
      _m.toArray(sm, i * 16);

      // the halo faces the camera and breathes on the same phase
      const grow = 1.0 + 0.16 * Math.sin(ph * 0.8);
      _s.setScalar(grow);
      _m.compose(_p, camQ, _s);
      _m.toArray(hm, i * 16);
    }
    this.shard.count = n;
    this.halo.count = n;
    this.shard.visible = n > 0;
    this.halo.visible = n > 0;
    this.shard.instanceMatrix.needsUpdate = true;
    this.halo.instanceMatrix.needsUpdate = true;

    this._offer(game, live[0] || null, pp);
  }

  /**
   * Point the single registered prompt at the nearest spot.
   *
   * One `Interactable` for the whole layer rather than one per spot: the
   * registry is scanned per frame and scored by distance and facing, so fifty
   * live registrations would be fifty rows of work to answer a question this
   * system has already answered by sorting.
   */
  _offer(game: Game, spot: Spot | null, pp: THREE.Vector3) {
    const near = spot && Math.hypot(spot.x - pp.x, spot.z - pp.z) < REACH * 3 ? spot : null;
    const ix = game.get('Interaction');
    if (!ix) return;
    if (!near) {
      if (this._handle) { this._handle.dispose(); this._handle = null; this._offered = null; }
      return;
    }
    if (this._offered === near && this._handle) return;
    this._offered = near;
    const label = itemName(near.item);
    const spec = {
      id: 'forage',
      pos: new THREE.Vector3(near.x, near.y, near.z),
      radius: REACH,
      verb: 'Take',
      label,
      hint: near.count > 1 ? `${label} x${near.count}` : label,
      yOffset: 0.5,
      priority: 1,
      handler: () => this.collect(game, near),
    };
    if (this._handle) this._handle.set(spec as never);
    else this._handle = ix.register(spec);
  }

  /** Take it: into the bag, off the map, and tell the quest log. */
  collect(game: Game, spot: Spot) {
    this.taken.add(spot.key);
    const rpg = game.get('Rpg');
    if (rpg && rpg.inventory) rpg.inventory.add(spot.item, spot.count, 'forage');
    const vfx = game.get('VFX');
    if (vfx && vfx.moteBurst) {
      vfx.moteBurst({
        pos: new THREE.Vector3(spot.x, spot.y, spot.z),
        count: 14, speed: 2.2, color: 0x8fd0ff, life: 0.9, size: 0.16,
        gravity: -0.6, intensity: 2.4,
      });
    }
    window.dispatchEvent(new CustomEvent('forage:taken', {
      detail: { item: spot.item, count: spot.count },
    }));
    if (this._handle) { this._handle.dispose(); this._handle = null; }
    this._offered = null;
    // Drop the cell so the stream regenerates it empty rather than holding a
    // spot that `update` has to filter out for the rest of the session.
    this.stream.dirty = true;
  }

  /** Finish streaming where the camera is now — the posed-capture contract. */
  converge(camPos: THREE.Vector3) {
    this.stream.flush(camPos);
  }
}

/**
 * Display name for an item id, falling back to the id itself.
 *
 * Read off the item table directly rather than through `Rpg`: the prompt has
 * to name the thing whether or not an RPG system is registered, and a
 * bestiary or cutscene scenario runs without one.
 */
function itemName(id: string) {
  const def = itemDef(id);
  return (def && def.name) || id;
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
