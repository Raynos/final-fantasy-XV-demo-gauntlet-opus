import { HUNT_TARGETS, SET_PIECES } from './SpawnTables.ts';
import type { EncounterDirector } from './EncounterDirector.ts';

/**
 * Hunts, made real.
 *
 * `Quests.ts` already holds twelve hunts with ranks, marks, levels, waypoints
 * and payouts, and a `notify('kill', …)` hook that ticks their objectives.
 * What was missing was the middle of the loop: accepting a job never put
 * anything in the world, and killing something never told the board.
 *
 * This closes both ends. Accept a hunt and its mark spawns at its waypoint;
 * kill the mark and `RpgSystem.enemyKilled` (already wired to the quest log)
 * completes it, which pays out gil, EXP, AP and hunter points through the
 * existing reward path. All this class adds is the spawn, the announcement
 * and the tidy-up.
 */
export class HuntRuntime {
  _off!: any;
  active!: Map<any, any>;
  dir!: EncounterDirector;
  rpg!: any;
  constructor(dir: import('./EncounterDirector.ts').EncounterDirector) {
    this.dir = dir;
    this.rpg = dir.rpg;
    this.active = new Map();      // quest id -> {spawned:boolean, waypoint}
    this._off = null;
  }

  /** Subscribe to the quest log. */
  init() {
    if (!this.rpg) return this;
    this._off = this.rpg.on('quest-updated', (p: any) => this._onQuest(p));
    // anything already accepted before we booted still deserves a mark
    for (const q of this.rpg.quests.active) {
      if (q.type === 'hunt') this.arm(q.id);
    }
    return this;
  }

  _onQuest(p: any) {
    if (!p || !p.quest || p.quest.type !== 'hunt') return;
    if (p.phase === 'accepted') this.arm(p.quest.id);
    else if (p.phase === 'complete') this.finish(p.quest.id, p.rewards);
    else if (p.phase === 'abandoned' || p.phase === 'failed') this.clear(p.quest.id);
  }

  /**
   * Put a hunt's mark in the world.
   * @param id quest id
   */
  arm(id: string) {
    if (this.active.has(id)) return null;
    const t = HUNT_TARGETS[id];
    if (!t) return null;
    const set = t.setPiece ? SET_PIECES[t.setPiece] : null;
    let spawned;
    if (set) spawned = this.dir.startSetPiece(set.id);
    else spawned = this.dir.spawnHunt(id);
    const q = this.rpg?.quests?.def(id);
    this.active.set(id, { spawned: !!spawned, quest: q });
    window.dispatchEvent(new CustomEvent('encounter:hunt-armed', {
      detail: {
        quest: id, name: q ? q.name : id, target: q ? q.target : t.key,
        rank: q ? q.rank : 1, level: t.level,
      },
    }));
    return spawned;
  }

  /**
   * The board hears about it. The payout itself has already happened inside
   * `RpgSystem`'s `quest-updated` handler; this is the report back.
   */
  finish(id: string, rewards: any) {
    const rec = this.active.get(id);
    this.active.delete(id);
    this.dir.hunts?.delete(id);
    const q = rec?.quest || this.rpg?.quests?.def(id);
    const rank = this.rpg?.quests;
    window.dispatchEvent(new CustomEvent('encounter:hunt-complete', {
      detail: {
        quest: id, name: q ? q.name : id,
        rewards: rewards || q?.rewards || null,
        hunterPoints: rank ? rank.hunterPoints : 0,
      },
    }));
    return true;
  }

  /** Despawn a hunt's remaining marks. */
  clear(id: any) {
    this.active.delete(id);
    const hunts = this.dir.hunts;
    const h = hunts && hunts.get(id);
    if (hunts && h) {
      for (const e of h.pack.members.slice()) {
        if (e.hunt === id && this.dir.enemies.list.includes(e)) this.dir.enemies.despawn(e);
      }
      hunts.delete(id);
    }
    return true;
  }

  /** Hunts with a mark currently in the world. */
  get armed() { return [...this.active.keys()]; }
}
