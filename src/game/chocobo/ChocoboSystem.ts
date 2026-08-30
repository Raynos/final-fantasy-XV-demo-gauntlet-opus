import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { buildChocoboPrototype, chocoboColours, CHOCOBO_BONES } from '../../characters/chocobo/ChocoboRig.ts';
import { ChocoboAnim } from '../../characters/chocobo/ChocoboAnim.ts';
import type { PosableRig } from '../../characters/chocobo/ChocoboAnim.ts';
import { ChocoboBody, CHOCOBO_RUN, STAMINA_MAX } from './ChocoboBody.ts';
import { Saddle } from './Saddle.ts';
import type { Game } from '../Game.ts';
import type { InteractableHandle } from '../interaction/Interactables.ts';
import type { CollisionWorld } from '../../world/collision/CollisionWorld.ts';
import { WALKABLE_Y } from '../../world/collision/CollisionWorld.ts';

/**
 * Chocobos: summon, ride, dismount.
 *
 * **There is no unlock gate.** The whistle is in the starting bag and the bird
 * answers it in the first minute of play, because this is the fun/fast-movement
 * layer and gating it behind a chapter-three hunt was what made the item dead
 * content in the first place.
 *
 * The mount is a whole entity the player is *attached to* (`Saddle`), not a
 * second player controller. See `Saddle.ts` for why. What lives here is the
 * summon, the whistle key, the `Ride` verb, the legality rules and the flock.
 *
 * ### The flock
 * Noctis does not ride alone in FFXV and should not here: three more birds are
 * cloned off the same prototype for the retinue. They cost one draw each — the
 * cheapest three companions in the game, against ~34 draws apiece on foot — and
 * they are **not simulated**: no collision capsule, no controller, just a
 * follow spring on the terrain height. Full physics on four birds buys nothing
 * a player can see from the saddle of the first one.
 */

/**
 * The whistle key.
 *
 * **Not `KeyY`** — the cold-start brief called it free and it is not:
 * `RegaliaSystem.KEY.camera` has been `KeyY` since the drive-camera rebind
 * (see the long note at `RegaliaSystem.ts`:60, where four bindings were found
 * to be double-bound because driving is not a mode and the car and combat read
 * the same keyboard on the same frame). `Digit6` is genuinely unbound:
 * `CombatSystem` takes `Digit1`-`Digit4` for weapon slots and `Digit5` for the
 * firearm, and nothing in the tree reads `Digit6`-`Digit0`.
 *
 * Mounting itself is deliberately NOT a raw key. It goes through
 * `Interaction.register({verb: 'Ride'})` so it gets the standard contextual
 * prompt and so it never collides with `CombatSystem._interactClaimsE`.
 */
const KEY_WHISTLE = 'Digit6';

/** Where the bird appears when whistled, and how close it gets before stopping. */
const SUMMON_DIST = 22;
const ARRIVE_DIST = 3.2;

/** Slots the retinue's birds hold, in the player bird's frame: [side, back]. */
const FLOCK_SLOTS: number[][] = [[-3.1, -2.2], [3.2, -2.8], [-0.6, -5.2]];
const FLOCK_KEYS = ['gladio', 'ignis', 'prompto'];

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _dir = new THREE.Vector3();

/** One bird in the world: its scene node, its skeleton and its animator. */
interface Bird {
  root: THREE.Group;
  /** The node the bounce and the body pitch are written onto. */
  visual: THREE.Group;
  rig: PosableRig;
  anim: ChocoboAnim;
  /** Where a rider's hips go. Parented under `visual`, so it inherits the bounce. */
  seat: THREE.Object3D;
  heading: number;
  speed: number;
}

export type ChocoboState = 'away' | 'arriving' | 'waiting' | 'ridden';

export class ChocoboSystem {
  _apMetres!: number;
  _flock!: Bird[];
  _handle!: InteractableHandle | null;
  _mountCooldown!: number;
  _prototypes!: Map<string, ReturnType<typeof buildChocoboPrototype>>;
  bird!: Bird | null;
  body!: ChocoboBody | null;
  collision!: CollisionWorld | null;
  /** Which dye is on the player's bird. Wiz sells the rest. */
  colour!: string;
  enabled!: boolean;
  game!: Game;
  saddle!: Saddle;
  state!: ChocoboState;
  constructor() {
    this.enabled = true;
    this.state = 'away';
    this.bird = null;
    this.body = null;
    this.collision = null;
    this.colour = 'yellow';
    this.saddle = new Saddle();
    this._flock = [];
    this._handle = null;
    this._prototypes = new Map();
    this._apMetres = 0;
    this._mountCooldown = 0;
  }

  async init(game: Game) {
    this.game = game;
    this.collision = game.get('Collision') ?? null;
    this.saddle.bind(game.get('Player') ?? null, game.get('Party') ?? null);
    // The geometry is NOT built here. A prototype costs real milliseconds and
    // every boot that never whistles would pay them; `LANDMINES` is explicit
    // that boot work whose output is discarded is still worth deleting when it
    // genuinely produces nothing else, and this one does.
  }

  get isRiding() { return this.state === 'ridden'; }

  /** The player's bird, or null when it is away. */
  get position(): THREE.Vector3 | null { return this.bird ? this.bird.root.position : null; }

  /* ------------------------------------------------------------- building */

  _prototype(colour: string) {
    let p = this._prototypes.get(colour);
    if (!p) { p = buildChocoboPrototype(chocoboColours(colour)); this._prototypes.set(colour, p); }
    return p;
  }

  /** Instantiate one bird off the shared prototype — the `attachVisual` path. */
  _makeBird(colour: string): Bird {
    const proto = this._prototype(colour);
    const visual = cloneSkinned(proto.group) as THREE.Group;
    const byName = new Map<string, THREE.Bone>();
    const rest = new Map<string, THREE.Quaternion>();
    visual.traverse((o) => {
      const b = o as THREE.Bone;
      if (b.isBone) { byName.set(b.name, b); rest.set(b.name, b.quaternion.clone()); }
      const m = o as THREE.SkinnedMesh;
      if (m.isSkinnedMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        // The bind-pose bounds are smaller than the posed mesh — a galloping
        // bird's tail plume reaches well outside them — and a creature that
        // culls itself mid-stride is the classic version of this bug.
        m.frustumCulled = false;
      }
    });
    const root = new THREE.Group();
    root.add(visual);
    const rig: PosableRig = { byName, rest };
    const seat = new THREE.Object3D();
    seat.position.copy(CHOCOBO_BONES.seat);
    visual.add(seat);
    this.game.scene.add(root);
    return { root, visual, rig, anim: new ChocoboAnim(rig, visual), seat, heading: 0, speed: 0 };
  }

  /* -------------------------------------------------------------- summon */

  /** Is this a spot a chocobo can stand on? No water, nothing over 50°. */
  canStandAt(x: number, z: number): boolean {
    const terrain = this.game.get('Terrain');
    if (!terrain) return true;
    const y = terrain.heightAt(x, z);
    const water = this.game.get('Water');
    if (water && y < water.level + 0.35) return false;
    terrain.normalAt(x, z, _n);
    return _n.y >= WALKABLE_Y;
  }

  /**
   * Whistle. The bird comes in from `SUMMON_DIST` metres away and runs to the
   * player rather than materialising under them — a mount that appears out of
   * nothing is a menu, and this one is supposed to be an animal.
   */
  summon() {
    if (!this.enabled) return false;
    if (this.state === 'ridden') return false;
    const player = this.game.get('Player');
    const terrain = this.game.get('Terrain');
    if (!player) return false;
    const p = player.position;

    // Pick the first legal bearing that is behind-ish the player, so the bird
    // runs into frame rather than out of it.
    let sx = p.x, sz = p.z + SUMMON_DIST, found = false;
    for (let i = 0; i < 12; i++) {
      const a = player.heading + Math.PI + (i % 2 ? 1 : -1) * Math.floor(i / 2) * 0.55;
      const x = p.x + Math.sin(a) * SUMMON_DIST;
      const z = p.z + Math.cos(a) * SUMMON_DIST;
      if (this.canStandAt(x, z)) { sx = x; sz = z; found = true; break; }
    }
    if (!found) return false;

    if (!this.bird) this.bird = this._makeBird(this.colour);
    this.bird.root.position.set(sx, terrain ? terrain.heightAt(sx, sz) : p.y, sz);
    this.bird.root.visible = true;
    if (!this.body) {
      const collision = this.collision || this.game.get('Collision') || null;
      if (collision) this.body = new ChocoboBody(collision);
    }
    if (this.body) {
      this.body.position.copy(this.bird.root.position);
      this.body.speed = 0;
      this.body.stamina = STAMINA_MAX;
    }
    this.state = 'arriving';
    this._ensureVerb();
    return true;
  }

  /** Send it away. Refused while anyone is on it. */
  dismiss() {
    if (this.state === 'ridden') return false;
    if (this.bird) this.bird.root.visible = false;
    for (const b of this._flock) b.root.visible = false;
    this.state = 'away';
    if (this._handle) { this._handle.dispose(); this._handle = null; }
    return true;
  }

  _ensureVerb() {
    if (this._handle || !this.bird) return;
    const interaction = this.game.get('Interaction');
    if (!interaction) return;
    this._handle = interaction.register({
      id: 'chocobo-ride',
      pos: this.bird.root.position,
      radius: 3.4,
      verb: 'Ride',
      label: 'Chocobo',
      priority: 3,
      yOffset: 1.9,
      enabled: () => this.state === 'waiting',
      handler: () => { this.mount(); },
    });
  }

  /* --------------------------------------------------------- mount / off */

  /**
   * Get on.
   *
   * The legality rules are the walker's own, not a second set: a chocobo will
   * not stand anywhere a character could not stand, which means the 50° refusal
   * is `WALKABLE_Y` (`CollisionWorld.ts`:26) and the water refusal is the water
   * body's own level. Reusing them is why a slope that refuses the bird is
   * always a slope the player can see is too steep.
   */
  mount() {
    if (this.state !== 'waiting' || !this.bird) return false;
    const b = this.bird;
    if (!this.canStandAt(b.root.position.x, b.root.position.z)) return false;

    // the retinue get theirs, and they arrive already alongside
    this._ensureFlock();
    const seats: Array<{ key: string, anchor: THREE.Object3D }> = [{ key: 'noctis', anchor: b.seat }];
    for (let i = 0; i < this._flock.length; i++) {
      const f = this._flock[i];
      f.root.visible = true;
      const [ox, oz] = FLOCK_SLOTS[i];
      const cos = Math.cos(b.heading), sin = Math.sin(b.heading);
      const x = b.root.position.x + ox * cos + oz * sin;
      const z = b.root.position.z - ox * sin + oz * cos;
      const terrain = this.game.get('Terrain');
      f.root.position.set(x, terrain ? terrain.heightAt(x, z) : b.root.position.y, z);
      f.heading = b.heading;
      seats.push({ key: FLOCK_KEYS[i], anchor: f.seat });
    }
    if (!this.saddle.enter(seats)) return false;
    this.state = 'ridden';
    this._mountCooldown = 0.35;
    if (this.body) this.body.heading = b.heading;
    return true;
  }

  /**
   * Get off. The bird stays where it is and waits, so a dismount to open a gate
   * does not cost a re-summon.
   */
  dismount() {
    if (this.state !== 'ridden' || !this.bird) return false;
    this.saddle.exit(this.bird.root.position, this.bird.heading);
    for (const f of this._flock) f.root.visible = false;
    this.state = 'waiting';
    this._mountCooldown = 0.35;
    return true;
  }

  _ensureFlock() {
    if (this._flock.length) return;
    const party = this.game.get('Party');
    if (!party) return;
    // The retinue ride ordinary yellow birds. Only Noctis' is dyeable, which is
    // also the only way a colour purchase is legible from the saddle.
    for (let i = 0; i < FLOCK_KEYS.length; i++) {
      if (!party.get(FLOCK_KEYS[i])) continue;
      const f = this._makeBird('yellow');
      f.root.visible = false;
      this._flock.push(f);
    }
  }

  /* ----------------------------------------------------------------- tick */

  update(dt: number, game: Game) {
    if (!this.enabled || !this.bird) {
      if (this.enabled && game.input.keyDown(KEY_WHISTLE) && !this._blocked()) this.summon();
      return;
    }
    if (this._mountCooldown > 0) this._mountCooldown -= dt;

    if (!this._blocked() && game.input.keyDown(KEY_WHISTLE) && this._mountCooldown <= 0) {
      if (this.state === 'ridden') this.dismount();
      else if (this.state === 'away') this.summon();
      else this.dismiss();
    }

    const b = this.bird;
    const player = game.get('Player');
    const terrain = game.get('Terrain');

    if (this.state === 'arriving' && player) {
      // Run in on a straight line and stop short. No pathfinding: the summon
      // already refused any spot the bird could not stand on, and a 22 m run to
      // a player who is standing still does not need more than that.
      _dir.subVectors(player.position, b.root.position);
      _dir.y = 0;
      const d = _dir.length();
      if (d < ARRIVE_DIST) {
        b.speed = THREE.MathUtils.damp(b.speed, 0, 5, dt);
        if (b.speed < 0.4) { this.state = 'waiting'; b.speed = 0; }
      } else {
        b.speed = THREE.MathUtils.damp(b.speed, Math.min(9.0, d * 0.9), 3.0, dt);
        _dir.normalize();
        b.heading = Math.atan2(_dir.x, _dir.z);
        b.root.position.addScaledVector(_dir, b.speed * dt);
      }
      if (terrain) b.root.position.y = terrain.heightAt(b.root.position.x, b.root.position.z);
    } else if (this.state === 'ridden' && this.body && player) {
      const inp = game.input;
      const sprint = inp.key('ShiftLeft') || inp.gpButton(10);
      game.camera.getWorldDirection(_v);
      const before = this.body.position.x, beforeZ = this.body.position.z;
      this.body.step(dt, inp.move, _v, sprint);
      b.root.position.copy(this.body.position);
      b.heading = this.body.heading;
      b.speed = this.body.speed;
      /**
       * The player's root follows the bird immediately, in `update`, so that
       * everything downstream that reads `player.position` this frame — the
       * camera rig, the minimap, streaming, the encounter director — sees the
       * truth. `Saddle.update` refines it onto the saddle anchor in
       * `lateUpdate`; this is the coarse write that keeps the frame coherent.
       */
      player.root.position.copy(this.body.position);
      player.heading = this.body.heading;
      player.velocity.copy(this.body.velocity);
      this._awardDistance(Math.hypot(this.body.position.x - before, this.body.position.z - beforeZ));
    } else if (this.state === 'waiting') {
      b.speed = THREE.MathUtils.damp(b.speed, 0, 6, dt);
      if (terrain) b.root.position.y = terrain.heightAt(b.root.position.x, b.root.position.z);
    }

    if (this.state !== 'away') {
      b.root.rotation.y = b.heading;
      if (this._handle) this._handle.set({ pos: b.root.position });
    }
    if (this.state === 'ridden') this._followFlock(dt);
  }

  /**
   * The retinue's birds. A follow spring on the terrain height and nothing
   * else — see the class note on why they are not simulated.
   */
  _followFlock(dt: number) {
    const b = this.bird;
    if (!b) return;
    const terrain = this.game.get('Terrain');
    const cos = Math.cos(b.heading), sin = Math.sin(b.heading);
    for (let i = 0; i < this._flock.length; i++) {
      const f = this._flock[i];
      const [ox, oz] = FLOCK_SLOTS[i];
      const tx = b.root.position.x + ox * cos + oz * sin;
      const tz = b.root.position.z - ox * sin + oz * cos;
      const dx = tx - f.root.position.x, dz = tz - f.root.position.z;
      const dist = Math.hypot(dx, dz);
      // Chase harder the further behind they are, and never faster than the
      // sprint ceiling, so a companion never overtakes the player at 30 m/s
      // after a corner.
      const want = Math.min(16.0, dist * 2.4);
      f.speed = THREE.MathUtils.damp(f.speed, want, 4.0, dt);
      if (dist > 1e-3) {
        f.root.position.x += (dx / dist) * f.speed * dt;
        f.root.position.z += (dz / dist) * f.speed * dt;
        if (f.speed > 0.5) f.heading = Math.atan2(dx / dist, dz / dist);
        else f.heading = b.heading;
      }
      if (terrain) f.root.position.y = terrain.heightAt(f.root.position.x, f.root.position.z);
      f.root.rotation.y = f.heading;
    }
  }

  _awardDistance(metres: number) {
    if (!(metres > 0)) return;
    const rpg = this.game.get('Rpg');
    if (!rpg || !rpg.ascension) return;
    if (!rpg.ascension.has('ap-chocobo')) return;
    this._apMetres += metres;
    if (this._apMetres >= 1) {
      rpg.ascension.awardAp('chocobo-distance', this._apMetres);
      this._apMetres = 0;
    }
  }

  /** A screen, a cutscene or a dialogue owns the keyboard. */
  _blocked() {
    const g = this.game;
    const menus = g.get('Menus');
    const cine = g.get('Cinematics');
    const inter = g.get('Interaction');
    if (menus && menus.name) return true;
    if (cine && cine.playing) return true;
    if (inter && inter.blocked) return true;
    if (g.currentShot != null) return true;
    const regalia = g.get('Regalia');
    if (regalia && regalia.isDriving) return true;
    return false;
  }

  lateUpdate(dt: number, _game: Game) {
    if (!this.bird || this.state === 'away') return;
    const b = this.bird;
    const ridden = this.state === 'ridden';
    b.anim.update(dt, {
      speed: b.speed,
      turnRate: 0,
      effort: this.body && ridden ? this.body.effort : 0,
      ridden,
    });
    if (ridden) {
      for (const f of this._flock) {
        f.anim.update(dt, { speed: f.speed, turnRate: 0, effort: 0, ridden: true });
        f.visual.updateMatrixWorld(true);
      }
      b.visual.updateMatrixWorld(true);
      // bounce scales with the gait, so the party stop posting when the bird does
      const bounce = THREE.MathUtils.clamp(b.speed / CHOCOBO_RUN, 0, 1);
      this.saddle.update(dt, bounce, b.anim._lean);
    }
  }

  /**
   * Finish settling. `Game.settle()` calls this on every system that has it,
   * and it exists for the reason `Player.converge` does: an exponential damp
   * that has not arrived moves accessory meshes by more than `VelocityPass`'s
   * matrix-equality threshold, and that is a draw count which depends on how
   * long the page has run.
   */
  converge() {
    if (this.body) this.body.converge();
    if (this.bird) this.bird.anim.converge();
    for (const f of this._flock) f.anim.converge();
  }
}
