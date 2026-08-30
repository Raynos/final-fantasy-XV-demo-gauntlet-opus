import * as THREE from 'three';
import type { Game } from '../../game/Game.ts';
import type { System } from '../../engine/System.ts';
import type { Player } from '../../characters/Player.ts';
import type { PartyMember } from '../../characters/Party.ts';
import type { Ground } from '../Terrain.ts';

/**
 * Swimming, and the state a swimmer is in.
 *
 * ### Why this is a system and not four lines in `Player`
 *
 * Entering water changes eight things at once, and seven of them live in files
 * this workstream may not edit: the foot IK has to stop looking for ground, the
 * two locomotion speeds change, the sword has to go away, combat has to stop
 * reading the keyboard, the retinue has to stay on the bank, the camera stops
 * being allowed to clip the surface, and the animator has to be told the
 * character is being held up by something other than the floor. `Occupants`
 * already solved exactly this shape for the Regalia — save every field it is
 * about to overwrite, overwrite them, run in `lateUpdate` so it has the last
 * word over `Player` and `Party`, and put them all back in one place — and
 * this is that pattern applied to water. No character file is touched.
 *
 * The one thing that *cannot* be done from outside is buoyancy, because `vy`
 * in `CharacterController` is the single vertical integrator and gravity is
 * subtracted from it unconditionally; see the `swim` field there. So the state
 * is decided here and carried out one frame later inside `move()`.
 *
 * ### Where the water is
 *
 * `WaterMask.levelAt` and nothing else. It covers the four flood-filled sea
 * basins, every tarn, **and the drawn river sheet**, which `Water.surfaceAt`
 * does not — and `water/WaterMask.ts` opens with the file-length essay on why
 * a fifth private copy of "is this wet?" is the bug this whole subsystem
 * exists to have exactly one of. Depth is measured against
 * `CollisionWorld.groundAt`, not `Terrain.heightAt`, so a swimmer over a
 * submerged jetty deck is in half a metre of water and not in five.
 */

/** Depth of water, in metres, at which a wader starts to swim. */
const ENTER_DEPTH = 1.2;
/**
 * ...and at which a swimmer's feet find the bottom again.
 *
 * Hysteresis, and it has to be wide: the entry test is taken at the feet, and
 * the feet of a swimmer are 1.30 m under the surface, so a single threshold
 * puts the state machine on a knife edge exactly where the player spends the
 * most time — the last two metres of a beach — and it flickers between wading
 * and swimming at frame rate.
 */
const EXIT_DEPTH = 0.85;
/** How far the feet float below the surface, m. Head and shoulders clear. */
const FLOAT = 1.30;
/** Surface stroke and sprint stroke, m/s. */
const SWIM_SPEED = 2.2;
const SWIM_SPRINT = 3.4;
/** Descent and ascent rates while diving, m/s. */
const DIVE_RATE = 1.5;
const RISE_RATE = 1.6;
/** Deepest a dive is allowed to go below the surface, m. */
const DIVE_MAX = 14;
/** Seconds of breath, and seconds to recover a full lungful at the surface. */
const BREATH_MAX = 26;
const BREATH_REFILL = 4.5;
/**
 * How far under the surface counts as submerged — the eye line, not the feet.
 *
 * The murk pass and the breath meter both key off this, and both are about
 * what the *camera* can see, so the threshold is the head going under and not
 * the body being in water.
 */
const SUBMERGE = 0.25;

/** The ground stub that stops the foot IK hunting for a floor. Occupants' one. */
const NO_GROUND: Ground = {
  heightAt: () => -1000,
  normalAt: (_x: number, _z: number, out?: THREE.Vector3) => (out || new THREE.Vector3()).set(0, 1, 0),
} as unknown as Ground;

interface Saved {
  terrain: Ground | undefined;
  walkSpeed: number;
  runSpeed: number;
  scenarioLock: boolean | undefined;
  speedMul: number[];
  anchors: THREE.Vector3[];
}

export class Swim implements System {
  game!: Game;
  /** In the water, feet off the bottom. */
  swimming!: boolean;
  /** Head under the surface — what the murk and the breath meter read. */
  submerged!: boolean;
  /** The surface height over the player, or -Infinity when not over water. */
  level!: number;
  /** Metres of water under the player's feet. 0 when not over water. */
  depth!: number;
  /** How far the eye is below the surface, m. 0 at or above it. */
  eyeDepth!: number;
  /** Breath remaining, 0..1. Refills at the surface. */
  breath!: number;
  /** True while the breath limit is driving the ascent and input is ignored. */
  forcedAscent!: boolean;
  /** Where the feet are being buoyed to, absolute world Y. */
  _targetY!: number;
  /** Commanded depth below the surface, m. 0 = floating. */
  _dive!: number;
  _saved!: Saved | null;
  _v!: THREE.Vector3;

  constructor() {
    this.swimming = false;
    this.submerged = false;
    this.level = -Infinity;
    this.depth = 0;
    this.eyeDepth = 0;
    this.breath = 1;
    this.forcedAscent = false;
    this._targetY = 0;
    this._dive = 0;
    this._saved = null;
    this._v = new THREE.Vector3();
  }

  init(game: Game) { this.game = game; return this; }

  /**
   * A reused page must not start a shot mid-stroke.
   *
   * `Game.reset()` is what lets the daemon capture a hundred shots on one boot,
   * and the bar it sets is that anything carried across shots is a frame that
   * is plausible and wrong. A swimmer left in the state would keep the party
   * pinned to a bank on the far side of the world.
   */
  reset() {
    if (this._saved) this._exit();
    this.breath = 1;
    this._dive = 0;
    this.forcedAscent = false;
    this.depth = 0;
    this.eyeDepth = 0;
    this.level = -Infinity;
  }

  /**
   * Runs in `lateUpdate` on purpose: `Party.update` teleports a companion who
   * has fallen 100 m behind straight to their formation slot, which while the
   * player is 150 m out into Alstor Slough is *in the lake*. Overwriting the
   * position afterwards is the only way to stop that without editing `Party`.
   */
  lateUpdate(dt: number, game: Game) {
    const player = game.get('Player');
    const water = game.get('Water');
    if (!player || !water || dt <= 0) return;

    // Inside a dungeon `heightAt` is redirected to the room floor and the
    // exterior water bodies mean nothing; in a car or on a chocobo the player's
    // root is written by somebody else's lateUpdate and this must not fight it.
    const dungeons = game.get('Dungeons');
    const regalia = game.get('Regalia');
    const chocobo = game.get('Chocobo');
    const busy = !!(dungeons && dungeons.isInside)
      || !!(regalia && regalia.isDriving)
      || !!(chocobo && chocobo.state === 'ridden');

    const pos = player.root.position;
    const level = busy ? -Infinity : this._levelAt(game, pos.x, pos.z);
    this.level = level;

    if (!Number.isFinite(level)) {
      this.depth = 0;
      this.eyeDepth = 0;
      if (this._saved) this._exit();
      this._recover(dt);
      return;
    }

    // Depth is measured from the ground the CHARACTER stands on, not from the
    // heightfield: `groundAt` prefers a prop surface within reach of the feet,
    // so a swimmer over a sunken deck is in the water above the deck.
    const g = player.collision.groundAt(pos.x, pos.z, pos.y, 0.45, 3.0);
    this.depth = Math.max(0, level - g.y);

    if (!this._saved) {
      if (this.depth > ENTER_DEPTH) this._enter(game, player);
      else { this._recover(dt); return; }
    } else if (this.depth < EXIT_DEPTH) {
      this._exit();
      this._recover(dt);
      return;
    }

    this._drive(dt, game, player, level, g.y);
    this._holdParty(game, player);
  }

  /**
   * Water surface over a point, rivers included, or -Infinity on dry land.
   *
   * Public because `Underwater` asks it about the **camera**, not the player:
   * an authored underwater framing has no swimmer in it at all, and the first
   * two ever taken came back as a dry daylight scene with a dark ceiling over
   * it because the murk was keyed off the swim state.
   */
  levelAt(x: number, z: number): number {
    return this._levelAt(this.game, x, z);
  }

  _levelAt(game: Game, x: number, z: number): number {
    const water = game.get('Water');
    if (!water) return -Infinity;
    if (water.mask) return water.mask.levelAt(x, z);
    const s = water.surfaceAt(x, z);
    return s == null ? -Infinity : s;
  }

  /** Breath comes back on dry land as well as at the surface. */
  _recover(dt: number) {
    this.swimming = false;
    this.submerged = false;
    this.forcedAscent = false;
    this.breath = Math.min(1, this.breath + dt / BREATH_REFILL);
  }

  /**
   * Take the world over: everything that has to change lands here, and the
   * previous value of every one of them is saved in the same object so `_exit`
   * cannot forget one.
   */
  _enter(game: Game, player: Player) {
    const party = game.get('Party');
    const combat = game.get('Combat');
    this._saved = {
      terrain: player.terrain,
      walkSpeed: player.walkSpeed,
      runSpeed: player.runSpeed,
      scenarioLock: combat ? combat.scenarioLock : undefined,
      speedMul: party ? party.members.map((m) => m.speedMul) : [],
      // The bank they were standing on when he went in. They wait there.
      anchors: party ? party.members.map((m) => m.root.position.clone()) : [],
    };
    // No ground for the foot IK: a swimmer's feet are 1.3 m under the surface
    // and the nearest floor is the lake bed, so without this the legs reach
    // for the bottom of Alstor Slough and the character does the splits.
    player.terrain = NO_GROUND;
    player.walkSpeed = SWIM_SPEED;
    player.runSpeed = SWIM_SPRINT;
    // No fighting in water. `scenarioLock` is the switch a cutscene uses and it
    // short-circuits CombatSystem.update before it reads a single key -- unlike
    // `input.enabled = false`, which also zeroes `input.move` and would leave a
    // swimmer unable to swim.
    if (combat) {
      combat.scenarioLock = true;
      if (combat.weapon) combat.weapon.setReveal(0);
    }
    this.swimming = true;
    this._dive = 0;
    this.forcedAscent = false;
    player.body.swim = true;
  }

  /** Put everything back, in one place, whatever route got us here. */
  _exit() {
    const game = this.game;
    const s = this._saved;
    this._saved = null;
    this.swimming = false;
    this.submerged = false;
    this.forcedAscent = false;
    this._dive = 0;
    if (!s) return;
    const player = game && game.get('Player');
    if (player) {
      player.terrain = s.terrain;
      player.walkSpeed = s.walkSpeed;
      player.runSpeed = s.runSpeed;
      player.body.swim = false;
      // Hand the vertical back to gravity from rest. `vy` at exit is the
      // buoyancy rate, and a swimmer who steps onto a beach carrying +1.6 m/s
      // of it launches.
      player.body.vy = 0;
    }
    const combat = game && game.get('Combat');
    if (combat && s.scenarioLock !== undefined) combat.scenarioLock = s.scenarioLock;
    const party = game && game.get('Party');
    if (party) party.members.forEach((m, i) => { m.speedMul = s.speedMul[i] ?? 1; });
  }

  /**
   * The swim itself: where the feet are buoyed to, and what the breath does.
   *
   * @param level the water surface over the player
   * @param bedY the ground under them — the floor a dive stops at
   */
  _drive(dt: number, game: Game, player: Player, level: number, bedY: number) {
    const input = game.input;
    const eye = player.root.position.y + player.body.height * 0.94;
    this.eyeDepth = Math.max(0, level - eye);
    this.submerged = this.eyeDepth > SUBMERGE;

    // Breath. Only the head being under costs anything; a surface swimmer can
    // cross an ocean.
    if (this.submerged) {
      this.breath = Math.max(0, this.breath - dt / BREATH_MAX);
      if (this.breath <= 0) this.forcedAscent = true;
    } else {
      this.breath = Math.min(1, this.breath + dt / BREATH_REFILL);
      // Cleared only at the surface, so the ascent runs all the way up rather
      // than handing control back the instant one lungful ticks over.
      if (this.forcedAscent && this.breath > 0.18) this.forcedAscent = false;
    }

    const down = !this.forcedAscent
      && (input.key('ControlLeft') || input.key('ControlRight') || input.gpButton(1));
    const up = this.forcedAscent
      || input.key('Space') || input.key('KeyE') || input.gpButton(0);
    if (this.forcedAscent) {
      // Out of air: the ascent is not negotiable and the dive keys are ignored.
      this._dive = Math.max(0, this._dive - RISE_RATE * 1.35 * dt);
    } else if (down) {
      this._dive = Math.min(DIVE_MAX, this._dive + DIVE_RATE * dt);
    } else if (up) {
      this._dive = Math.max(0, this._dive - RISE_RATE * dt);
    } else if (this._dive > 0) {
      // Neutral buoyancy is a lie a swimmer cannot hold: let go and you rise.
      this._dive = Math.max(0, this._dive - 0.35 * dt);
    }

    // Never command a dive into the bed. The controller clamps as well, but
    // clamping there alone leaves `_dive` winding up to 14 m in half a metre
    // of water and then taking nine seconds to unwind on the way out.
    const room = Math.max(0, level - FLOAT - bedY - 0.05);
    if (this._dive > room) this._dive = room;

    this._targetY = level - FLOAT - this._dive;
    player.body.swim = true;
    player.body.swimY = this._targetY;
    // A dive is a deliberate act and wants to feel like effort; coming up is
    // buoyancy doing the work, and it is faster.
    player.body.swimRate = this._dive > 0.05 && !this.forcedAscent ? 2.2 : 3.0;
  }

  /**
   * The retinue waits on the bank.
   *
   * They cannot swim — they have no swim state, no stroke animation and no
   * breath — and three companions ploughing across a lake at chest height in a
   * walk cycle is the single most obviously broken thing this feature could
   * ship. So they are frozen at the position they held when Noctis went in.
   *
   * The write has to be here, after `Party.update`, because that method
   * teleports a companion more than 100 m adrift straight to their formation
   * slot in the player's frame — which, 150 m out into Alstor Slough, is open
   * water. There is no lever to switch that off from outside; there is a
   * lateUpdate that runs after it.
   */
  _holdParty(game: Game, player: Player) {
    const party = game.get('Party');
    const s = this._saved;
    if (!party || !s) return;
    for (let i = 0; i < party.members.length; i++) {
      const m: PartyMember = party.members[i];
      const a = s.anchors[i];
      if (!a) continue;
      m.speedMul = 0;
      m.speed = 0;
      m.root.position.copy(a);
      // Watching him swim, which is also what stops three heads snapping back
      // to a formation heading that is now behind them.
      if (m.character && m.character.setLookTarget) {
        m.character.setLookTarget(this._v.set(
          player.root.position.x,
          player.root.position.y + 1.5,
          player.root.position.z,
        ));
      }
    }
  }
}
