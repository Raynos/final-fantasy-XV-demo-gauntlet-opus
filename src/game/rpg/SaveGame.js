/**
 * Save / load for the whole RPG state.
 *
 * One JSON blob in localStorage per slot, with a version field and a migration
 * chain so an old save from a previous build still loads. Node (and any
 * headless test) gets an in-memory shim so this module imports cleanly
 * anywhere.
 */

export const SAVE_VERSION = 3;
export const SAVE_PREFIX = 'ffxv-eos:save:';
export const AUTOSAVE_SLOT = 'auto';

/** localStorage, or a memory-backed stand-in when there isn't one. */
const storage = (() => {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('__probe', '1');
      localStorage.removeItem('__probe');
      return localStorage;
    }
  } catch { /* private mode, or no DOM */ }
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    key: (i) => [...mem.keys()][i] ?? null,
    get length() { return mem.size; },
    _memory: true,
  };
})();

/* ------------------------------------------------------------------------ */
/* Migrations                                                                */
/* ------------------------------------------------------------------------ */

/**
 * Each entry upgrades a save *from* that version to the next one. Add a new
 * function here whenever the shape changes; never edit an old one.
 * @type {Record<number, (data:object)=>object>}
 */
export const MIGRATIONS = {
  1: (data) => {
    // v1 kept a flat `exp` number instead of the EXP bank object.
    const out = { ...data, version: 2 };
    if (typeof data.exp === 'number') {
      out.expBank = { banked: data.exp, sources: {}, multiplier: 1, lifetime: data.exp };
      delete out.exp;
    }
    return out;
  },
  2: (data) => {
    // v2 stored day-cycle time at the top level; v3 nests it under `day`.
    const out = { ...data, version: 3 };
    if (data.hour != null && !data.day) {
      out.day = { hour: data.hour, day: data.dayNumber || 1, havens: {} };
      delete out.hour; delete out.dayNumber;
    }
    return out;
  },
};

/**
 * Bring a loaded blob up to the current version.
 * @param {object} data
 * @returns {{data:object, migrated:boolean, from:number}}
 */
export function migrate(data) {
  let v = data.version || 1;
  const from = v;
  let out = data;
  while (v < SAVE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) { out = { ...out, version: SAVE_VERSION }; break; }
    out = step(out);
    v = out.version || v + 1;
  }
  return { data: out, migrated: from !== SAVE_VERSION, from };
}

/* ------------------------------------------------------------------------ */
/* Save file API                                                             */
/* ------------------------------------------------------------------------ */

/**
 * Serialise every RPG subsystem into one plain object.
 * @param {import('./RpgSystem.js').RpgSystem} rpg
 */
export function serialize(rpg) {
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    meta: {
      chapter: rpg.chapter,
      level: rpg.party.averageLevel,
      day: rpg.day.day,
      clock: rpg.day.clockString,
      gil: rpg.inventory.gil,
      playTime: Math.round(rpg.playTime),
      questsComplete: rpg.quests.completed.length,
    },
    party: rpg.party.toJSON(),
    expBank: rpg.expBank.toJSON(),
    ascension: rpg.ascension.toJSON(),
    inventory: rpg.inventory.toJSON(),
    elemancy: rpg.elemancy.toJSON(),
    quests: rpg.quests.toJSON(),
    day: rpg.day.toJSON(),
    chapter: rpg.chapter,
    playTime: rpg.playTime,
  };
}

/**
 * Write a save.
 * @param {import('./RpgSystem.js').RpgSystem} rpg
 * @param {string} [slot='auto']
 */
export function save(rpg, slot = AUTOSAVE_SLOT) {
  const data = serialize(rpg);
  try {
    storage.setItem(SAVE_PREFIX + slot, JSON.stringify(data));
    return { ok: true, slot, meta: data.meta };
  } catch (err) {
    console.warn('[rpg] save failed', err);
    return { ok: false, reason: String(err) };
  }
}

/**
 * Read a save without applying it.
 * @param {string} [slot='auto']
 * @returns {{ok:boolean, data?:object, migrated?:boolean, reason?:string}}
 */
export function load(slot = AUTOSAVE_SLOT) {
  const raw = storage.getItem(SAVE_PREFIX + slot);
  if (!raw) return { ok: false, reason: 'no-save' };
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return { ok: false, reason: 'corrupt' }; }
  const { data, migrated, from } = migrate(parsed);
  return { ok: true, data, migrated, from };
}

/** Delete a save. */
export function erase(slot = AUTOSAVE_SLOT) {
  storage.removeItem(SAVE_PREFIX + slot);
  return true;
}

/** Slot names and their headline metadata, newest first. */
export function listSaves() {
  const out = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !key.startsWith(SAVE_PREFIX)) continue;
    try {
      const d = JSON.parse(storage.getItem(key));
      out.push({ slot: key.slice(SAVE_PREFIX.length), savedAt: d.savedAt, version: d.version, meta: d.meta || {} });
    } catch { /* skip unreadable slot */ }
  }
  return out.sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
}

/** True when the browser (or shim) has this slot. */
export function hasSave(slot = AUTOSAVE_SLOT) { return storage.getItem(SAVE_PREFIX + slot) != null; }

/** Exposed so tests can assert whether they are on the memory shim. */
export const usingMemoryStorage = !!storage._memory;

export default { save, load, erase, listSaves, hasSave, migrate, serialize, SAVE_VERSION };
