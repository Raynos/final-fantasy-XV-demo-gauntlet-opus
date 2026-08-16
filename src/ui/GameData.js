/**
 * Fallback game data for the UI.
 *
 * Every other system in the project is being written in parallel, so the UI
 * never assumes they exist. `readParty()` and friends prefer live data from
 * `Party` / `Player` / `Combat` and silently fall back to these tables, which
 * keeps the HUD renderable (and screenshot-able) at all times.
 */

export const PARTY = [
  {
    id: 'noctis', name: 'Noctis', role: 'lead', level: 27, hue: 218,
    hp: 3040, maxHp: 3200, mp: 74, maxMp: 100,
    status: ['haste'],
  },
  { id: 'gladiolus', name: 'Gladiolus', role: 'guard', level: 28, hue: 24, hp: 4180, maxHp: 4600, status: ['shieldUp'] },
  { id: 'ignis', name: 'Ignis', role: 'tactician', level: 27, hue: 268, hp: 2560, maxHp: 2900, status: [] },
  { id: 'prompto', name: 'Prompto', role: 'marksman', level: 26, hue: 44, hp: 1980, maxHp: 2650, status: ['swordUp', 'poison'] },
];

export const WEAPONS = [
  { slot: 'up', key: 'sword', name: 'Engine Blade', kind: 'Sword', atk: 168, element: null },
  { slot: 'right', key: 'greatsword', name: 'Rusted Bit', kind: 'Greatsword', atk: 214, element: 'ice' },
  { slot: 'down', key: 'daggers', name: 'Zwill Crossblades', kind: 'Daggers', atk: 142, element: 'lightning' },
  { slot: 'left', key: 'firearm', name: 'Auto Crossbow', kind: 'Machinery', atk: 96, element: 'fire' },
];

export const TECHNIQUES = [
  { name: 'Tempest', owner: 'Gladiolus', cost: 2, icon: 'greatsword', ready: 1 },
  { name: 'Enhancement', owner: 'Ignis', cost: 1, icon: 'lance', ready: 0.62 },
  { name: 'Starshell', owner: 'Prompto', cost: 3, icon: 'firearm', ready: 0.24 },
];

export const ENEMY_TEMPLATES = [
  { name: 'Sabertusk', level: 14, hp: 620, maxHp: 900, weak: 'fire', resist: null },
  { name: 'Voretooth', level: 12, hp: 410, maxHp: 640, weak: 'ice', resist: null },
  { name: 'Dualhorn', level: 22, hp: 3120, maxHp: 4400, weak: 'lightning', resist: 'fire' },
];

export const ITEMS = [
  { name: 'Potion', qty: 32, icon: 'potion', tag: 'Consumable', effect: 'Restore 1,000 HP', target: 'One ally', field: true,
    desc: 'Restores 1,000 HP to one ally. Standard field issue from the Crown City infirmary — Ignis buys them by the crate.' },
  { name: 'Hi-Potion', qty: 14, icon: 'potion', tag: 'Consumable', effect: 'Restore 3,000 HP', target: 'One ally', field: true,
    desc: 'A denser draught of the same. Worth holding back until someone is genuinely in trouble.' },
  { name: 'Mega-Potion', qty: 6, icon: 'potion', tag: 'Consumable', effect: 'Restore 5,000 HP', target: 'All allies', field: true,
    desc: 'Vapourises on contact with air, restoring the whole retinue at once.' },
  { name: 'Elixir', qty: 5, icon: 'potion', tag: 'Consumable', effect: 'Full HP / MP', target: 'One ally', field: true,
    desc: 'Fully restores HP and MP to one ally and clears every ailment. Rare enough to be worth the pocket space.' },
  { name: 'Phoenix Down', qty: 3, icon: 'regen', tag: 'Consumable', effect: 'Revive · 50% HP', target: 'One ally', field: false,
    desc: 'A single feather that pulls a downed ally back to their feet with half their health restored.' },
  { name: 'Antidote', qty: 9, icon: 'poison', tag: 'Remedy', effect: 'Cure poison', target: 'One ally', field: true,
    desc: 'Neutralises venom from sabertusk and voretooth bites alike.' },
  { name: 'Gold Needle', qty: 4, icon: 'shieldUp', tag: 'Remedy', effect: 'Cure stone', target: 'One ally', field: true,
    desc: 'Breaks petrifaction. Unpleasant for everyone involved, including the person holding the needle.' },
  { name: 'Smelling Salts', qty: 6, icon: 'haste', tag: 'Remedy', effect: 'Cure confusion', target: 'One ally', field: true,
    desc: 'Sharp enough to clear a daemon\'s influence out of a clouded head.' },
  { name: 'Hunter\'s Medal', qty: 7, icon: 'ap', tag: 'Treasure', effect: 'Sells for 300 gil', target: '—', field: false,
    desc: 'Proof of a hunt completed. Traded at outposts for gil, or kept as a quiet boast.' },
  { name: 'Rare Metal', qty: 1, icon: 'machinery', tag: 'Key Item', effect: 'Quest item', target: '—', field: false,
    desc: 'A dense ingot Cid asked for. He was not specific about what he intends to do with it.' },
  { name: 'Fire Flask', qty: 2, icon: 'fire', tag: 'Magic', effect: 'Fire · 180 potency', target: 'Area', field: false,
    desc: 'A flask of unstable elemancy. Deals fire damage in a wide radius — mind the grass.' },
  { name: 'Sky Gemstone', qty: 1, icon: 'lightning', tag: 'Catalyst', effect: 'Spellcraft catalyst', target: '—', field: false,
    desc: 'A shard humming with stored lightning. Folded into a spell it raises the potency considerably.' },
];

export const GEAR_SLOTS = ['Weapon', 'Weapon', 'Accessory', 'Accessory'];

export const GEAR = {
  noctis: [
    { slot: 'Weapon', name: 'Engine Blade', stat: 'ATK +168' },
    { slot: 'Weapon', name: 'Zwill Crossblades', stat: 'ATK +142' },
    { slot: 'Accessory', name: 'Ribbon', stat: 'Resist all ailments' },
    { slot: 'Accessory', name: 'Moogle Charm', stat: 'AP gain +50%' },
  ],
  gladiolus: [
    { slot: 'Weapon', name: 'Ziedrich', stat: 'ATK +231' },
    { slot: 'Weapon', name: 'Bronze Shield', stat: 'DEF +64' },
    { slot: 'Accessory', name: 'Power Wristbands', stat: 'STR +80' },
    { slot: 'Accessory', name: 'Talisman', stat: 'HP +500' },
  ],
  ignis: [
    { slot: 'Weapon', name: 'Orichalcum', stat: 'ATK +186' },
    { slot: 'Weapon', name: 'Javelin', stat: 'ATK +154' },
    { slot: 'Accessory', name: 'Circlet', stat: 'MAG +72' },
    { slot: 'Accessory', name: 'Hypno Crown', stat: 'MP cost -20%' },
  ],
  prompto: [
    { slot: 'Weapon', name: 'Auto Crossbow', stat: 'ATK +96' },
    { slot: 'Weapon', name: 'Quicksilver', stat: 'ATK +128' },
    { slot: 'Accessory', name: 'Sniper\'s Sight', stat: 'Crit rate +18%' },
    { slot: 'Accessory', name: 'Bulletproof Vest', stat: 'DEF +44' },
  ],
};

// map-space coordinates are normalised to the 1600x900 chart and kept inside
// the generated coastline in MapScreen
export const REGIONS = [
  { name: 'Leide', sub: 'Longwythe Region', x: 0.288, y: 0.645 },
  { name: 'Duscae', sub: 'Alstor Slough', x: 0.495, y: 0.40 },
  { name: 'Cleigne', sub: 'Vesperpool', x: 0.655, y: 0.29 },
  { name: 'Lucis Coast', sub: 'Galdin Quay', x: 0.375, y: 0.735 },
];

export const MAP_PINS = [
  { kind: 'quest', name: 'A Better Engine Blade', x: 0.352, y: 0.545 },
  { kind: 'hunt', name: 'Sabertusk Pack', x: 0.434, y: 0.645 },
  { kind: 'haven', name: 'Prairie Outpost', x: 0.283, y: 0.470 },
  { kind: 'dungeon', name: 'Keycatrich Trench', x: 0.470, y: 0.310 },
  { kind: 'haven', name: 'Kelbass Grasslands', x: 0.598, y: 0.505 },
  { kind: 'quest', name: 'Party of Three', x: 0.652, y: 0.375 },
];

export const BANTER = [
  { who: 'Prompto', line: 'Whoa — that view! Hold up, gotta get a shot of this.' },
  { who: 'Gladiolus', line: 'Keep your head up, Noct. Something\'s moving out there.' },
  { who: 'Ignis', line: 'I\'ve come up with a new recipe. We\'ll try it at camp.' },
  { who: 'Prompto', line: 'Anyone else starvin\'? Just me? Cool. Cool cool cool.' },
];

export const SUBTITLES = [
  { who: 'Ignis', line: 'The road ahead narrows past the outpost. We should press on before dark.' },
  { who: 'Noctis', line: 'Yeah. Let\'s not give the daemons a head start.' },
];

export const QUEST = {
  title: 'A Better Engine Blade',
  step: 'Deliver the Rare Metal to Cid at Hammerhead',
  dist: 1240,
};

/**
 * Merge live party data (if the Party system exposes any) over the fallback
 * table. Never throws, whatever shape the other systems ended up with.
 * @param {object} game
 * @returns {Array<object>}
 */
export function readParty(game) {
  const out = PARTY.map((p) => ({ ...p }));
  const live = game?.get?.('Party')?.members;
  if (Array.isArray(live) && live.length) {
    live.slice(0, 4).forEach((m, i) => {
      const s = m?.stats || m || {};
      const dst = out[i];
      if (m?.name) dst.name = m.name;
      if (typeof s.hp === 'number') dst.hp = s.hp;
      if (typeof s.maxHp === 'number') dst.maxHp = s.maxHp;
      if (typeof s.mp === 'number') dst.mp = s.mp;
      if (typeof s.maxMp === 'number') dst.maxMp = s.maxMp;
      if (typeof s.level === 'number') dst.level = s.level;
      if (Array.isArray(m?.status)) dst.status = m.status;
    });
  }
  const ps = game?.get?.('Player')?.stats;
  if (ps) {
    const lead = out[0];
    if (typeof ps.hp === 'number') lead.hp = ps.hp;
    if (typeof ps.maxHp === 'number') lead.maxHp = ps.maxHp;
    if (typeof ps.mp === 'number') lead.mp = ps.mp;
    if (typeof ps.maxMp === 'number') lead.maxMp = ps.maxMp;
    if (typeof ps.level === 'number') lead.level = ps.level;
  }
  return out;
}

/** Weapon loadout, preferring `Combat.loadout` / `Player.weapons` if present. */
export function readWeapons(game) {
  const live = game?.get?.('Combat')?.loadout || game?.get?.('Player')?.weapons;
  if (Array.isArray(live) && live.length) {
    return WEAPONS.map((w, i) => ({ ...w, ...(live[i] || {}) }));
  }
  return WEAPONS.map((w) => ({ ...w }));
}
