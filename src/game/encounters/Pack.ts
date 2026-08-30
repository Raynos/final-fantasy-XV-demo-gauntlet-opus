import type { Enemy, EnemyPack, Threat } from '../../characters/enemies/EnemyBase.ts';
import type { EncounterDirector } from './EncounterDirector.ts';

/**
 * A pack: the coordination layer that makes a group of enemies read as a
 * hunting party rather than a queue.
 *
 * Two rules do almost all the work:
 *
 *  1. **Engage tokens.** Only `maxEngaged` members may close and attack at
 *     once. Everyone else circles at range on an assigned ring slot. The token
 *     rotates on a timer so nobody hangs back forever and the player is always
 *     being pressured from a new direction.
 *  2. **Ring slots.** Slots are evenly spread around the target and reassigned
 *     when the roster changes, so three sabertusks surround you instead of
 *     lining up behind each other.
 *
 * The pack also propagates aggro — one member noticing you wakes the rest,
 * which is what turns a "there is an enemy over there" into an encounter.
 */
/** How a pack is set up. */
export interface PackOpts {
  id?: string;
  /** How many members may hold the engage token at once. */
  maxEngaged?: number;
  /** Seconds a member holds the token before it may rotate away. */
  rotate?: number;
  /** The director that owns this pack, and gets the callbacks. */
  encounter?: EncounterDirector | null;
}

export class Pack implements EnemyPack {
  alerted!: boolean;
  _t!: number;
  encounter!: EncounterDirector | null;
  /** Members currently holding the engage token, oldest first. */
  engaged!: Enemy[];
  id!: string;
  maxEngaged!: number;
  members!: Enemy[];
  rotate!: number;
  target!: Threat | null;
  /**
   * @param [o] `{ maxEngaged, rotate, id }`
   */
  constructor(o: PackOpts = {}) {
    this.id = o.id || 'pack';
    this.members = [];
    // Three. Two was the default every `SpawnTables` territory that does not
    // override it inherited, and it is the reason a five-MT imperial patrol
    // opened 1.13 attacks per second: three of the five were always circling.
    // Beyond three the player is being mobbed rather than fought, which is why
    // this is 3 and the wild dens -- which draw twice as many bodies -- set 4
    // explicitly rather than moving this.
    this.maxEngaged = o.maxEngaged ?? 3;
    /** Seconds a member holds the engage token before it may rotate. */
    this.rotate = o.rotate ?? 3.0;
    this.engaged = [];
    this._t = 0;
    this.target = null;
    this.alerted = false;
    /** Encounter that owns this pack, if any. */
    this.encounter = o.encounter || null;
  }

  add(e: Enemy) {
    if (!this.members.includes(e)) {
      this.members.push(e);
      this._reslot();
    }
    return e;
  }

  remove(e: Enemy) {
    const i = this.members.indexOf(e);
    if (i >= 0) this.members.splice(i, 1);
    const j = this.engaged.indexOf(e);
    if (j >= 0) this.engaged.splice(j, 1);
    this._reslot();
  }

  /** Live members. */
  get alive() {
    let n = 0;
    for (const m of this.members) if (!m.dead) n++;
    return n;
  }

  /**
   * Spread ring slots evenly around whatever the pack is fighting.
   *
   * **Two rings, not one, and recomputed whenever the engage set changes.**
   *
   * `EnemyBase._chase` closes an attacker to `want * 0.7` and holds a flanker
   * at `want * 1.6`, both along `slotAngle` — so an attacker and a flanker on
   * the same bearing are on different circles and do not collide, but two
   * attackers on adjacent bearings are on the *same small* circle and do.
   * This used to spread every live member around one ring by its index in
   * `members`, which meant the four engaged animals of a six-animal den got
   * whatever four bearings their array positions happened to give them: with
   * six members that is 60 degrees apart on a circle about a metre and a half
   * across, and a sabertusk is a metre wide. A watched capture of a five-strong
   * den showed exactly that — bodies drawn inside other bodies, three animals
   * stacked in one screen quadrant, and nothing encircling the player. The
   * comment in `_chase` calls that "the whole difference between a pack and a
   * queue", and it was right; the slots simply were not being handed out that
   * way.
   *
   * So the attackers get the inner ring evenly to themselves, the flankers get
   * the outer ring evenly to themselves, and the outer ring is rotated half a
   * slot out of phase so a flanker never queues up directly behind an attacker
   * on the same bearing.
   */
  _reslot() {
    const inner: Enemy[] = [];
    const outer: Enemy[] = [];
    for (const m of this.members) {
      if (m.dead) continue;
      (this.engaged.includes(m) ? inner : outer).push(m);
    }
    for (let i = 0; i < inner.length; i++) {
      inner[i].slotAngle = (i / inner.length) * Math.PI * 2;
    }
    for (let i = 0; i < outer.length; i++) {
      outer[i].slotAngle = ((i + 0.5) / outer.length) * Math.PI * 2;
    }
  }

  /**
   * One member noticed something — bring the rest in. This is what makes a
   * pack feel like a pack: you are spotted by one and answered by five.
   */
  alert(by: Enemy, target: Threat) {
    this.target = target;
    if (this.alerted) return;
    this.alerted = true;
    for (const m of this.members) {
      if (m === by || m.dead) continue;
      m.target = target;
      m.awareness = Math.max(m.awareness, 0.7);
      if (!m.inCombat) m.setState('chase');
    }
    if (this.encounter) this.encounter.onAlerted(this, target);
  }

  /** A member died: free its token and re-spread the survivors. */
  onDeath(e: Enemy) {
    const j = this.engaged.indexOf(e);
    if (j >= 0) this.engaged.splice(j, 1);
    this._reslot();
    if (this.encounter) this.encounter.onMemberDied(this, e);
  }

  /**
   * Hand `e` a role for the next second or so.
   * Sets `e.packRole` to `'engage'` or `'flank'`.
   */
  assign(e: Enemy) {
    // prune the dead and the disengaged
    let dropped = false;
    for (let i = this.engaged.length - 1; i >= 0; i--) {
      const m = this.engaged[i];
      if (m.dead || !m.inCombat) { this.engaged.splice(i, 1); dropped = true; }
    }
    if (dropped) this._reslot();
    if (this.engaged.includes(e)) { e.packRole = 'engage'; return; }
    if (this.engaged.length < this.maxEngaged) {
      this.engaged.push(e);
      e.packRole = 'engage';
      this._reslot();
      return;
    }
    // rotate the longest-held token out if this one has been waiting
    e._waited = (e._waited || 0) + 0.9;
    if (e._waited > this.rotate) {
      const out = this.engaged.shift();
      if (out) { out.packRole = 'flank'; out._waited = 0; }
      this.engaged.push(e);
      e.packRole = 'engage';
      e._waited = 0;
      this._reslot();
      return;
    }
    e.packRole = 'flank';
  }

  /** Every member gives up and goes home. */
  disengage() {
    this.alerted = false;
    this.target = null;
    this.engaged.length = 0;
    for (const m of this.members) if (!m.dead) m._giveUp();
  }
}
