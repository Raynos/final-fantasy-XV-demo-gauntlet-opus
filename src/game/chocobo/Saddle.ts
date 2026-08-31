import * as THREE from 'three';
import type { Character } from '../../characters/rig/Character.ts';
import type { Ground } from '../../world/Terrain.ts';
import type { Player } from '../../characters/Player.ts';
import type { Party } from '../../characters/Party.ts';

/**
 * One rider on one bird — the `Occupants` pattern, for a saddle instead of a car.
 *
 * The design decision this file encodes is the whole architecture of the lane:
 * **the player is attached to the chocobo, not replaced by it.** `Player.update`
 * keeps running; what changes is that the ground beneath it is a kilometre down
 * (so the foot IK has nothing to plant on and stops fighting the saddle), its
 * speed is zero, and every `lateUpdate` this module writes the player's root
 * onto the saddle anchor. Nothing in `Player.ts`, `CameraRig.ts`, `Minimap.ts`
 * or the lock-on has to know a chocobo exists, because `player.position` stays
 * truthful the entire time.
 *
 * The alternative — a mount mode that takes over the player controller — was
 * rejected because every one of those consumers would have needed a branch.
 */

/** A `Ground` a kilometre down, so the walkers' foot IK finds nothing. */
const NO_GROUND: Ground = {
  heightAt: () => -1000,
  normalAt: (_x: number, _z: number, out?: THREE.Vector3) => (out || new THREE.Vector3()).set(0, 1, 0),
};

/**
 * Astride: knees forward over the shoulder of the barrel, shins outside the
 * flank and the boots in the irons, a real forward lean off the hips, and both
 * hands closed on the reins over the withers.
 *
 * **The old table put the whole leg inside the bird.** Measured, not guessed
 * (`probes/seatfit.mts` CPU-skins the live bird and reduces it to a half-width
 * per slab): the thigh was 0.362 m inside the barrel, the shin 0.056 m and the
 * boot 0.089 m — so the rider's leg simply did not exist in the frame, which is
 * the filed "a black blob over the fore-flank ending at mid-barrel, nothing in
 * the stirrup". The thigh's abduction has gone from 0.30 to 0.68 rad and the
 * shin is broken back and out, which puts the knee at 0.42 m of lateral, the
 * ankle at 0.43 and the toe at 0.49 against a barrel that is 0.37–0.45 m wide.
 * The boot lands within 0.02 m of the stirrup iron `ChocoboRig.ts` hangs at
 * (±0.435, 1.10, 0.05), so the leg ends where a leg is supposed to end.
 *
 * **And the arms were at full extension**, which is what "three crucifixes on
 * birds" was: the hands were 0.86 m apart and 0.43 m above the hips, and no
 * amount of shoulder roll fixes an arm whose elbow is straight. The upper arms
 * now hang (they read as +0.51 of X only because the torso beneath them is
 * pitched 0.33 rad forward) and the elbows carry 73 degrees of flex, which
 * brings the hands to 0.32 m apart just above the pommel — where the reins now
 * run to meet them (`ChocoboRig.ts`).
 *
 * Everything above the collarbones is deliberately absent so the animator keeps
 * the head — a rider whose skull is nailed to a pose table stops looking at the
 * world, and looking at the world is most of what makes a passenger read as
 * alive (`Occupants` learned this the same way).
 */
export const POSE_RIDE: Record<string, number[]> = {
  hips: [-0.24, 0, 0],
  spine01: [-0.14, 0, 0], spine02: [-0.12, 0, 0], spine03: [-0.07, 0, 0],
  thighL: [-0.81, 0.22, 0.68], thighR: [-0.81, -0.22, -0.68],
  shinL: [1.35, -0.08, 0.04], shinR: [1.35, 0.08, -0.04],
  footL: [-0.26, -0.28, -0.23], footR: [-0.26, 0.28, 0.23],
  toeL: [0.10, 0, 0], toeR: [0.10, 0, 0],
  clavicleL: [-0.12, 0, -0.06], clavicleR: [-0.12, 0, 0.06],
  upperArmL: [0.51, -0.01, -0.09], lowerArmL: [-1.28, -0.03, -0.07], handL: [0.10, 0, 0.24],
  upperArmR: [0.51, 0.01, 0.09], lowerArmR: [-1.28, 0.03, 0.07], handR: [0.10, 0, -0.24],
  // Both fists closed, and closed by the same amount. Nothing held the reins
  // before, and the two hand meshes differ (a closed glove against a bare open
  // hand), so an open finger chain rendered the asymmetry at full strength.
  fingersL: [-1.15, 0, 0], fingersR: [-1.15, 0, 0],
  fingerTipL: [-1.32, 0, 0], fingerTipR: [-1.32, 0, 0],
  thumbL: [-0.60, 0.45, 0], thumbR: [-0.60, -0.45, 0],
};

const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _up = new THREE.Vector3();

/** What the walkers were doing before anyone got on, so `exit` hands them back. */
interface SavedWalkers {
  playerTerrain: Ground | undefined;
  partyTerrain: Ground | undefined;
  speedMul: number[];
}

export interface SaddleRider {
  key: string;
  char: Character;
  root: THREE.Object3D;
  /** The bird's seat anchor this rider is written onto. */
  anchor: THREE.Object3D;
  /** This rig's own hip height, so a tall man does not sit on the cantle. */
  hipY: number;
}

export class Saddle {
  _saved!: SavedWalkers | null;
  /** Everything this module has hidden, so `exit` can put it all back. */
  _stowed!: Set<THREE.Object3D>;
  _t!: number;
  party!: Party | null;
  player!: Player | null;
  riders!: SaddleRider[];
  /** True while anyone is up. */
  seated!: boolean;
  /**
   * `CombatSystem.hand`, if there is one.
   *
   * **This is where "Noctis's sword floating horizontally through the bird's
   * neck" comes from, and it is not a socket.** `CombatSystem` parents all five
   * weapon classes to a plain `Group` pinned at `(-0.30, 1.12, 0.12)` on
   * `player.root` — an offset, not a bone — so it ignores the pose entirely. A
   * rider's root sits at the soles, 0.875 m under the saddle line, which puts
   * that group at bird-local `(-0.30, 2.0, 0.12)`: the base of the neck. The
   * sheathed blades are at reveal 0 and still draw as a pale blue ghost, so
   * what the player sees is a translucent sword lying through the bird.
   *
   * The real fix belongs in `CombatSystem` — the weapon should hang off
   * `attach.handR` like every other weapon in the game — so this only puts it
   * away while somebody is mounted, and reports the rest.
   */
  weaponHand!: THREE.Object3D | null;
  constructor() {
    this.riders = [];
    this.seated = false;
    this._saved = null;
    this._stowed = new Set();
    this.weaponHand = null;
    this._t = 0;
  }

  /**
   * Stowed weapons, out of sight while somebody is being carried.
   *
   * A companion's blade lives on `attach.back` or `attach.hip`, which are bones
   * on the spine and the pelvis, so it swings with whatever the seat does to the
   * torso. Measured on the mount (`probes/seatfit.mts`): Gladio's greatsword
   * hangs from `y 1.81` down to `y -0.03` — from his shoulder, through the whole
   * bird beneath him, and into the ground. That is the playtest's "sword
   * floating horizontally through the bird's neck", and there is no stow angle
   * that fixes it, because 2.05 m of steel does not fit beside a seated man on
   * an animal 2.3 m tall. It is put away instead, which is also what a party
   * that is riding rather than fighting would do with it.
   *
   * Hidden every frame rather than once, because `PartyAI._carry` can reparent a
   * weapon into a hand mid-ride; anything that leaves these two sockets becomes
   * visible again on its own. `_shown` is what makes the restore exact: a blade
   * that moved to a hand while it was hidden is still on the list, so it comes
   * back when everyone gets off.
   */
  _hideProps() {
    for (const r of this.riders) {
      const a = r.char.attach as Record<string, THREE.Object3D> | undefined;
      if (!a) continue;
      for (const key of ['back', 'hip']) {
        const sock = a[key];
        if (!sock) continue;
        for (const c of sock.children) {
          if (!c.visible) continue;
          c.visible = false;
          this._stowed.add(c);
        }
      }
    }
    const wh = this.weaponHand;
    if (wh && wh.visible) { wh.visible = false; this._stowed.add(wh); }
  }

  /** Give every hidden weapon back, wherever it has ended up. */
  _showProps() {
    for (const o of this._stowed) o.visible = true;
    this._stowed.clear();
  }

  /**
   * @param player @param party
   * @param weaponHand `CombatSystem.hand` — see `_hideProps`
   */
  bind(player: Player | null, party: Party | null, weaponHand?: THREE.Object3D | null) {
    this.player = player;
    this.party = party;
    this.weaponHand = weaponHand || null;
  }

  /**
   * Put the named people on the given anchors.
   * @param seats rider key -> the anchor on the bird carrying them
   */
  enter(seats: Array<{ key: string, anchor: THREE.Object3D }>) {
    const p = this.player, party = this.party;
    if (!p || !party) return false;
    this.riders.length = 0;

    for (const s of seats) {
      const isPlayer = s.key === 'noctis';
      const m = isPlayer ? null : party.get(s.key);
      const char = isPlayer ? p.character : (m && m.character);
      const root = isPlayer ? p.root : (m && m.root);
      if (!char || !root) continue;
      this.riders.push({
        key: s.key, char, root, anchor: s.anchor,
        hipY: char.rig && char.rig.P && char.rig.P.hips ? char.rig.P.hips.y : 0.98,
      });
    }
    if (!this.riders.length) return false;

    if (!this._saved) {
      this._saved = {
        playerTerrain: p.terrain,
        partyTerrain: party.terrain,
        speedMul: party.members.map((m) => m.speedMul),
      };
    }
    p.terrain = NO_GROUND;
    party.terrain = NO_GROUND;
    for (const m of party.members) m.speedMul = 0;
    for (const r of this.riders) if (r.char.groundShadow) r.char.groundShadow.visible = false;

    this.seated = true;
    return true;
  }

  /**
   * Put everyone back on their feet beside the bird.
   *
   * **The `_saved` guard is load-bearing.** `Occupants.exit` early-returns on a
   * null `_saved` and leaves `seated` set; here a dismount that never entered
   * would otherwise strand the player on `NO_GROUND` — feet at -1000, falling
   * forever, with no error anywhere. Clearing `seated` before the guard is what
   * makes a spurious dismount a no-op instead of a soft-lock.
   */
  exit(worldPos: THREE.Vector3, heading: number) {
    const p = this.player, party = this.party;
    this.seated = false;
    this._showProps();
    if (!p || !party || !this._saved) { this.riders.length = 0; return; }
    p.terrain = this._saved.playerTerrain;
    party.terrain = this._saved.partyTerrain;
    const saved = this._saved;
    party.members.forEach((m, i) => { m.speedMul = saved.speedMul[i] ?? 1; });
    this._saved = null;

    const terrain = p.terrain;
    // step off to the near side, spread so nobody lands inside anybody
    const spots = [[-1.55, 0.1], [-1.75, -1.3], [1.75, 0.2], [1.75, -1.4]];
    const cos = Math.cos(heading), sin = Math.sin(heading);
    for (let i = 0; i < this.riders.length; i++) {
      const r = this.riders[i];
      const [ox, oz] = spots[i % spots.length];
      const x = worldPos.x + ox * cos + oz * sin;
      const z = worldPos.z - ox * sin + oz * cos;
      r.root.position.set(x, terrain ? terrain.heightAt(x, z) : worldPos.y, z);
      r.root.rotation.set(0, heading + (ox > 0 ? -1.1 : 1.1), 0);
      r.root.quaternion.setFromEuler(r.root.rotation);
      if (r.char.groundShadow) r.char.groundShadow.visible = true;
      r.char.setLookTarget(null);
    }
    p.velocity.set(0, 0, 0);
    p.speed = 0;
    p.heading = heading;
    this.riders.length = 0;
  }

  /**
   * Write the seat transforms and the riding poses.
   *
   * **Runs in `lateUpdate`, after `CameraRig`.** `Player.update` keeps running
   * while mounted and will happily move the root; if this ran in `update` the
   * rider would be written a frame behind the bird and would visibly swim in
   * the saddle at 11 m/s.
   *
   * @param bounce 0..1 how hard the gait is throwing the rider about
   */
  update(dt: number, bounce: number, lean: number) {
    if (!this.seated) return;
    this._t += dt;
    for (let i = 0; i < this.riders.length; i++) {
      const r = this.riders[i];
      r.anchor.getWorldPosition(_v);
      r.anchor.getWorldQuaternion(_q);
      _up.set(0, 1, 0).applyQuaternion(_q);
      r.root.position.copy(_v).addScaledVector(_up, -r.hipY);
      r.root.quaternion.copy(_q);
      // the animator writes rotation.y directly; keep the Euler honest
      r.root.rotation.setFromQuaternion(_q, 'YXZ');
      this._applyPose(r, i, bounce, lean);
      r.root.updateMatrixWorld(true);
    }
    this._hideProps();
  }

  /** Overwrite the seated bones on top of whatever the animator produced. */
  _applyPose(r: SaddleRider, i: number, bounce: number, lean: number) {
    const bones = r.char.rig.byName;
    const t = this._t + i * 1.7;
    // Posting: a rider absorbs the bird's bounce in the hips and the spine
    // rather than being rigid on it. Without this the party read as four
    // crash-test dummies bolted to four birds.
    const post = Math.sin(this._t * 11.0 + i * 0.9) * 0.055 * bounce;
    const sway = Math.sin(t * 0.63 + i) * 0.014 + Math.sin(t * 1.9 + i * 2.1) * 0.004;
    for (const name in POSE_RIDE) {
      const b = bones[name];
      if (!b) continue;
      const e = POSE_RIDE[name];
      let x = e[0], y = e[1], z = e[2];
      if (name === 'hips') { x += post + sway; z += lean * 0.55; }
      else if (name === 'spine01' || name === 'spine02') { x += post * 0.55 + sway * 0.6; z += lean * 0.35; }
      else if (name === 'spine03') { x += post * 0.30; z += lean * 0.25; }
      else if (name === 'upperArmL' || name === 'upperArmR') { x += post * -0.35; }
      _e.set(x, y, z, 'YXZ');
      b.quaternion.setFromEuler(_e);
    }
    /**
     * The pelvis must sit where the saddle is, not where the walk cycle wants
     * it. `Anim` writes `hips.position` every frame for the stride bob, and
     * without this the rider slowly sinks into the bird's back over a long
     * ride — the same fix, for the same reason, as `Occupants._applyPose`.
     */
    const hips = bones.hips;
    if (hips) {
      const P = r.char.rig.P.hips;
      hips.position.set(P.x, P.y, P.z);
    }
  }
}
