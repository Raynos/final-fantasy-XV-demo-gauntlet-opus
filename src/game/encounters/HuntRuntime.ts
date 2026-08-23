import { HUNT_TARGETS, SET_PIECES } from './SpawnTables.ts';
import type { EncounterDirector } from './EncounterDirector.ts';
import type { RpgSystem } from '../rpg/RpgSystem.ts';
import type { Quest, QuestUpdate, GrantedRewards } from '../rpg/Quests.ts';

/** A hunt with a mark in the world: whether it spawned, and the job itself. */
interface ArmedHunt {
  spawned: boolean;
  quest: Quest | null;
}

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
  /** Unsubscribe for the `quest-updated` handler. */
  _off!: (() => void) | null;
  /** Quest id -> the mark it put in the world. */
  active!: Map<string, ArmedHunt>;
  dir!: EncounterDirector;
  rpg!: RpgSystem | undefined;
  constructor(dir: import('./EncounterDirector.ts').EncounterDirector) {
    this.dir = dir;
    this.rpg = dir.rpg;
    this.active = new Map();      // quest id -> {spawned:boolean, waypoint}
    this._off = null;
  }

  /** Subscribe to the quest log. */
  init() {
    if (!this.rpg) return this;
    this._off = this.rpg.on<QuestUpdate>('quest-updated', (p) => this._onQuest(p));
    // anything already accepted before we booted still deserves a mark
    for (const q of this.rpg.quests.active) {
      if (q.setPiece) this.armSetPiece(q.id);
      else if (q.type === 'hunt') this.arm(q.id);
    }
    return this;
  }

  _onQuest(p: QuestUpdate) {
    if (!p || !p.quest) return;
    // A set piece is not always a bounty: chapter 3 ends on Deadeye and
    // chapter 5 on the Archaean, and both are main quests.
    if (p.quest.setPiece) {
      if (p.phase === 'accepted' || p.phase === 'objective') this.armSetPiece(p.quest.id);
      else if (p.phase === 'abandoned' || p.phase === 'failed') this.clear(p.quest.id);
      if (p.quest.type !== 'hunt') return;
    }
    if (p.quest.type !== 'hunt') return;
    if (p.phase === 'accepted') this.arm(p.quest.id);
    else if (p.phase === 'complete') this.finish(p.quest.id, p.rewards);
    else if (p.phase === 'abandoned' || p.phase === 'failed') this.clear(p.quest.id);
  }

  /**
   * Stage a quest's set-piece fight, once the party is up to the kill.
   *
   * The timing is the whole point. `BossFight.begin` sets the boss chasing and
   * fires `encounter:boss` immediately, so arming on `accepted` would announce
   * the Archaean while the party is still in Hammerhead. It arms when the
   * objective *before* the kill lands — you follow the trail into the
   * Nebulawood and Deadeye is there — or on accept when the kill comes first.
   *
   * The anchor is the quest's own kill waypoint, which resolves through
   * `WorldMap`, rather than the `SET_PIECES` literal. A boss that is not where
   * the compass points is the same defect as a quest marker in empty desert.
   */
  armSetPiece(id: string) {
    if (this.active.has(id)) return null;
    const q = this.rpg?.quests?.def(id);
    const st = this.rpg?.quests?.state(id);
    const set = q?.setPiece ? SET_PIECES[q.setPiece] : null;
    if (!q || !st || !set || st.status !== 'active') return null;
    const k = q.objectives.findIndex((o) => o.type === 'kill');
    if (k < 0) return null;
    // every objective before the kill must be done, and the kill must not be
    if (st.objectives[k].done) return null;
    for (let i = 0; i < k; i++) if (!st.objectives[i].done) return null;
    const wp = q.objectives[k].waypoint || q.objectives[Math.max(0, k - 1)].waypoint;
    const spawned = this.dir.startSetPiece(set.id, wp ? { at: [wp[0], wp[2]] } : {});
    this.active.set(id, { spawned: !!spawned, quest: q });
    window.dispatchEvent(new CustomEvent('encounter:hunt-armed', {
      detail: { quest: id, name: q.name, target: q.target || set.name, rank: q.rank ?? 1, level: set.level },
    }));
    return spawned;
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
    this.active.set(id, { spawned: !!spawned, quest: q ?? null });
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
  finish(id: string, rewards: GrantedRewards | null | undefined) {
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
  clear(id: string) {
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
