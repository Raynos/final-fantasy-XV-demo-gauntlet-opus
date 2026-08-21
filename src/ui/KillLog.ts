/**
 * What the retinue has actually killed.
 *
 * `CombatSystem` mirrors every death onto `window` as `combat:death`, but
 * nothing was counting them, so the bestiary had nothing real to read. This is
 * the tally: species key -> `{ kills, lastLevel, name }`, populated from that
 * one event and from nothing else, so a species only appears once the party has
 * genuinely put one down.
 *
 * It is a module singleton on purpose — the listener has to outlive any screen
 * that draws it, and the counts must survive a menu being closed and reopened.
 */

const tally: Map<string, {key:string, name:string, kills:number, lastLevel:number}> = new Map();

let attached = false;

/** Fold one death into the tally. Exported so tests can drive it directly. */
export function recordKill(enemy) {
  if (!enemy) return null;
  const key = enemy.speciesId || enemy.type?.key || enemy.name || 'unknown';
  const rec = tally.get(key) || { key, name: enemy.name || key, kills: 0, lastLevel: 0 };
  rec.kills += 1;
  rec.name = enemy.name || rec.name;
  rec.lastLevel = enemy.level || rec.lastLevel;
  tally.set(key, rec);
  return rec;
}

/** Start listening. Idempotent; called from the archive screen's build. */
export function attachKillLog() {
  if (attached || typeof window === 'undefined') return;
  attached = true;
  window.addEventListener('combat:death', (e) => recordKill(e.detail && e.detail.enemy));
}

/** @param key species key @returns */
export function killsOf(key: string): number { return tally.get(key)?.kills || 0; }

/** @returns every kill recorded, all species */
export function totalKills(): number {
  let n = 0;
  for (const r of tally.values()) n += r.kills;
  return n;
}

/** @returns how many distinct species have been recorded */
export function speciesRecorded(): number { return tally.size; }

/** The whole tally, for a screen that wants to iterate it. */
export function killRecords() { return [...tally.values()]; }

/** Wipe the tally. Used by the capture harness so a shot is reproducible. */
export function resetKillLog() { tally.clear(); }
