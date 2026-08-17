/**
 * The UI's single read-side adapter over the RPG model.
 *
 * `src/game/rpg/**` owns every number the game actually simulates — levels,
 * HP/MP, gil, AP, the 137-item bag, the 106-node grid, the 30-quest log and the
 * clock. This module is the *only* place `src/ui` is allowed to reach into it,
 * so every screen and widget reads one shape and none of them care whether the
 * system is present.
 *
 * Every reader takes `game` and degrades gracefully: if `game.get('Rpg')` is
 * missing (the screenshot harness may boot a partial world, and other agents
 * run this file with their systems half-built) the fallback tables below keep
 * the HUD renderable and screenshot-able. The *live* path is always preferred.
 */

import { NODES, EDGES, CONSTELLATION_INFO } from '../game/rpg/Ascension.js';

/* ------------------------------------------------------------------------ */
/* Presentation metadata — colour and role, which the model has no opinion on */
/* ------------------------------------------------------------------------ */

/** Portrait hue + HUD role per roster id. Purely cosmetic. */
export const MEMBER_UI = {
  noctis:  { hue: 218, role: 'lead',      short: 'Noctis' },
  gladio:  { hue: 24,  role: 'guard',     short: 'Gladiolus' },
  ignis:   { hue: 268, role: 'tactician', short: 'Ignis' },
  prompto: { hue: 44,  role: 'marksman',  short: 'Prompto' },
};

/** RPG weapon class -> the icon key `Icons.js` draws. */
export const CLASS_ICON = {
  sword: 'sword', greatsword: 'greatsword', polearm: 'lance', dagger: 'daggers',
  firearm: 'firearm', shield: 'shield', machinery: 'machinery',
};

/** RPG weapon class -> the label FFXV prints under the weapon name. */
export const CLASS_LABEL = {
  sword: 'Sword', greatsword: 'Greatsword', polearm: 'Polearm', dagger: 'Daggers',
  firearm: 'Firearm', shield: 'Shield', machinery: 'Machinery',
};

/** Item category -> icon key, so 137 items need no per-item art. */
const CATEGORY_ICON = {
  curative: 'potion', catalyst: 'lightning', treasure: 'ap', ingredient: 'regen',
  key: 'items', weapon: 'sword', accessory: 'ap', spell: 'fire',
};

/** Item category -> the tag line printed above the item name. */
const CATEGORY_TAG = {
  curative: 'Consumable', catalyst: 'Catalyst', treasure: 'Treasure',
  ingredient: 'Ingredient', key: 'Key Item', weapon: 'Weapon', accessory: 'Accessory',
  spell: 'Magic',
};

/** Inventory screen tabs and the model categories each one gathers. */
export const ITEM_TABS = [
  { name: 'Consumables', cats: ['curative'] },
  { name: 'Materials', cats: ['catalyst', 'treasure'] },
  { name: 'Provisions', cats: ['ingredient'] },
  { name: 'Equipment', cats: ['weapon', 'accessory'] },
  { name: 'Key Items', cats: ['key'] },
];

/* ------------------------------------------------------------------------ */
/* Fallbacks — used only when no RpgSystem is registered                     */
/* ------------------------------------------------------------------------ */

export const PARTY = [
  { id: 'noctis', name: 'Noctis', role: 'lead', level: 27, hue: 218,
    hp: 3040, maxHp: 3200, mp: 74, maxMp: 100, status: ['haste'] },
  { id: 'gladio', name: 'Gladiolus', role: 'guard', level: 28, hue: 24, hp: 4180, maxHp: 4600, status: ['shieldUp'] },
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
  { id: 'potion', name: 'Potion', qty: 32, icon: 'potion', tag: 'Consumable', effect: 'Restore 1,000 HP', target: 'One ally', field: true,
    desc: 'Restores 1,000 HP to one ally. Standard field issue from the Crown City infirmary — Ignis buys them by the crate.' },
  { id: 'hi_potion', name: 'Hi-Potion', qty: 14, icon: 'potion', tag: 'Consumable', effect: 'Restore 3,000 HP', target: 'One ally', field: true,
    desc: 'A denser draught of the same. Worth holding back until someone is genuinely in trouble.' },
  { id: 'mega_potion', name: 'Mega-Potion', qty: 6, icon: 'potion', tag: 'Consumable', effect: 'Restore 5,000 HP', target: 'All allies', field: true,
    desc: 'Vapourises on contact with air, restoring the whole retinue at once.' },
  { id: 'elixir', name: 'Elixir', qty: 5, icon: 'potion', tag: 'Consumable', effect: 'Full HP / MP', target: 'One ally', field: true,
    desc: 'Fully restores HP and MP to one ally and clears every ailment. Rare enough to be worth the pocket space.' },
  { id: 'phoenix_down', name: 'Phoenix Down', qty: 3, icon: 'regen', tag: 'Consumable', effect: 'Revive · 50% HP', target: 'One ally', field: false,
    desc: 'A single feather that pulls a downed ally back to their feet with half their health restored.' },
  { id: 'antidote', name: 'Antidote', qty: 9, icon: 'poison', tag: 'Remedy', effect: 'Cure poison', target: 'One ally', field: true,
    desc: 'Neutralises venom from sabertusk and voretooth bites alike.' },
  { id: 'gold_needle', name: 'Gold Needle', qty: 4, icon: 'shieldUp', tag: 'Remedy', effect: 'Cure stone', target: 'One ally', field: true,
    desc: 'Breaks petrifaction. Unpleasant for everyone involved, including the person holding the needle.' },
  { id: 'smelling_salts', name: 'Smelling Salts', qty: 6, icon: 'haste', tag: 'Remedy', effect: 'Cure confusion', target: 'One ally', field: true,
    desc: 'Sharp enough to clear a daemon\'s influence out of a clouded head.' },
  { id: 'hunters_medal', name: 'Hunter\'s Medal', qty: 7, icon: 'ap', tag: 'Treasure', effect: 'Sells for 300 gil', target: '—', field: false,
    desc: 'Proof of a hunt completed. Traded at outposts for gil, or kept as a quiet boast.' },
  { id: 'rare_metal', name: 'Rare Metal', qty: 1, icon: 'machinery', tag: 'Key Item', effect: 'Quest item', target: '—', field: false,
    desc: 'A dense ingot Cid asked for. He was not specific about what he intends to do with it.' },
  { id: 'fire_flask', name: 'Fire Flask', qty: 2, icon: 'fire', tag: 'Magic', effect: 'Fire · 180 potency', target: 'Area', field: false,
    desc: 'A flask of unstable elemancy. Deals fire damage in a wide radius — mind the grass.' },
  { id: 'sky_gemstone', name: 'Sky Gemstone', qty: 1, icon: 'lightning', tag: 'Catalyst', effect: 'Spellcraft catalyst', target: '—', field: false,
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
  gladio: [
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
  { name: 'Leide', sub: 'Longwythe Region', x: 0.300, y: 0.625 },
  { name: 'Duscae', sub: 'Alstor Slough', x: 0.545, y: 0.265 },
  { name: 'Cleigne', sub: 'Vesperpool', x: 0.735, y: 0.375 },
  { name: 'Lucis Coast', sub: 'Galdin Quay', x: 0.395, y: 0.800 },
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

/* ------------------------------------------------------------------------ */
/* Live reads                                                                */
/* ------------------------------------------------------------------------ */

/** The RpgSystem, or null when the world was booted without it. */
export function rpg(game) {
  const r = game?.get?.('Rpg');
  return r && r.party ? r : null;
}

/**
 * `rpg.hudState()` for this frame, memoised.
 *
 * `hudState()` rebuilds four party records, the buff list and the waypoint list
 * every call, and half a dozen widgets want it in the same frame. The cache is
 * keyed on the frame counter and cleared by `Game.resetClock()`.
 * @param {object} game
 * @returns {object|null}
 */
export function hudState(game) {
  const r = rpg(game);
  if (!r) return null;
  const frame = game.time ? game.time.frame : -1;
  const c = game._hudCache;
  if (c && c.frame === frame) return c.state;
  const state = r.hudState();
  game._hudCache = { frame, state };
  return state;
}

/**
 * The four-member roster the HUD, the pause menu and the gear screen all draw.
 * Live values come from `hudState().party`; hue/role are cosmetic overlays.
 * @param {object} game
 * @returns {Array<object>}
 */
export function readParty(game) {
  const hs = hudState(game);
  if (!hs || !hs.party || !hs.party.length) return PARTY.map((p) => ({ ...p }));
  return hs.party.map((m, i) => {
    const ui = MEMBER_UI[m.id] || MEMBER_UI.noctis;
    return {
      id: m.id,
      name: ui.short,
      fullName: m.name,
      role: ui.role,
      hue: ui.hue,
      level: m.level,
      hp: m.hp, maxHp: m.maxHp,
      mp: m.mp, maxMp: m.maxMp,
      ko: m.ko,
      bond: m.bond,
      status: statusIcons(hs, m, i),
    };
  });
}

/**
 * Status icons for one member. Real state only: a KO badge, a critical-HP
 * warning, and one icon per active meal/spell buff mapped onto the icon set.
 */
function statusIcons(hs, m) {
  const out = [];
  if (m.ko) out.push('poison');
  for (const b of hs.buffs || []) {
    const e = (b.effects || []).join(' ');
    if (/Strength/.test(e)) out.push('swordUp');
    else if (/Vitality|Max HP/.test(e)) out.push('shieldUp');
    else if (/Magic|Spirit/.test(e)) out.push('haste');
    else out.push('regen');
  }
  if (!m.ko && m.maxHp && m.hp / m.maxHp < 0.25) out.push('poison');
  return [...new Set(out)].slice(0, 3);
}

/**
 * Noctis' phantom arsenal, laid out on the weapon wheel's diamond.
 * Reads the four real equipment slots from `Inventory`.
 * @param {object} game
 */
export function readWeapons(game) {
  const r = rpg(game);
  const slots = ['up', 'right', 'down', 'left'];
  if (!r) return WEAPONS.map((w) => ({ ...w }));
  const rack = r.inventory.equipped('noctis').weapon;
  return slots.map((slot, i) => {
    const def = rack[i];
    if (!def) return { slot, key: 'sword', name: 'Empty', kind: 'No armament', atk: 0, element: null, id: null };
    const el = (def.tags || []).find((t) => t.startsWith('element:'));
    return {
      slot, id: def.id,
      key: CLASS_ICON[def.class] || 'sword',
      name: def.name,
      kind: CLASS_LABEL[def.class] || 'Arm',
      atk: def.attack || 0,
      element: el ? el.slice(8) : null,
    };
  });
}

/**
 * The bag, in the shape the item screen draws.
 * @param {object} game
 * @param {number} [tab] index into `ITEM_TABS`; omit for everything
 * @returns {Array<object>}
 */
export function readItems(game, tab = -1) {
  const r = rpg(game);
  if (!r) {
    if (tab < 0) return ITEMS.map((i) => ({ ...i }));
    const want = ITEM_TABS[tab]?.name;
    const map = { Consumables: ['Consumable', 'Remedy'], Materials: ['Treasure', 'Catalyst'], Provisions: [], Equipment: [], 'Key Items': ['Key Item', 'Magic'] };
    const tags = map[want] || [];
    const out = ITEMS.filter((i) => tags.includes(i.tag)).map((i) => ({ ...i }));
    return out.length ? out : ITEMS.map((i) => ({ ...i }));
  }
  const cats = tab < 0 ? null : (ITEM_TABS[tab]?.cats || null);
  return r.inventory.list()
    .filter((e) => !cats || cats.includes(e.def.category))
    .map((e) => itemView(e.def, e.count, r));
}

/** One item stack, hydrated for the detail column. */
function itemView(def, count, r) {
  const use = def.use || null;
  let effect = '—';
  if (use) {
    if (use.type === 'heal') effect = `Restore ${use.amount.toLocaleString()} HP`;
    else if (use.type === 'mp') effect = `Restore ${use.amount} MP`;
    else if (use.type === 'full') effect = 'Full HP / MP';
    else if (use.type === 'revive') effect = `Revive · ${Math.round((use.percent || 0.5) * 100)}% HP`;
    else if (use.type === 'cure') effect = `Cure ${use.status.join(', ').replace('*', 'all ailments')}`;
  } else if (def.category === 'weapon') effect = `ATK +${def.attack}`;
  else if (def.category === 'accessory') effect = modLine(def.mods) || 'Passive';
  else if (def.catalyst) effect = `${def.catalyst.effect} · potency ${def.catalyst.potency}`;
  else if (def.sell > 0) effect = `Sells for ${r.inventory.sellPrice(def.id).toLocaleString()} gil`;

  return {
    id: def.id,
    name: def.name,
    qty: count,
    icon: itemIcon(def),
    tag: CATEGORY_TAG[def.category] || 'Item',
    effect,
    target: use ? (use.target === 'party' ? 'All allies' : use.target === 'downed' ? 'Downed ally' : 'One ally') : '—',
    field: !!use,
    desc: def.desc || '',
  };
}

/** Pick the icon that says the most about what an item actually does. */
function itemIcon(def) {
  const u = def.use;
  if (u) {
    if (u.type === 'revive') return 'regen';
    if (u.type === 'mp') return 'lightning';
    if (u.type === 'full') return 'haste';
    if (u.type === 'cure') return u.status?.includes('poison') ? 'poison' : 'shieldUp';
    return 'potion';
  }
  if (def.category === 'weapon') return CLASS_ICON[def.class] || 'sword';
  if (def.catalyst) {
    const t = def.catalyst.tags || [];
    if (t.includes('lightning')) return 'lightning';
    if (t.includes('heal')) return 'regen';
    if (t.includes('poison')) return 'poison';
    return 'ap';
  }
  return CATEGORY_ICON[def.category] || 'items';
}

/** "STR +40  ·  HP +300" from a modifier bucket. */
function modLine(mods) {
  if (!mods) return '';
  const K = { hp: 'HP', mp: 'MP', strength: 'STR', vitality: 'VIT', magic: 'MAG', spirit: 'SPR', attack: 'ATK', defense: 'DEF', magicAttack: 'M.ATK', magicDefense: 'M.DEF' };
  const bits = [];
  for (const k of Object.keys(K)) if (mods[k]) bits.push(`${K[k]} ${mods[k] > 0 ? '+' : ''}${mods[k]}`);
  if (mods.critRate) bits.push(`Crit +${Math.round(mods.critRate * 100)}%`);
  for (const e of Object.keys(mods.resist || {})) if (mods.resist[e]) bits.push(`${e} res +${mods.resist[e]}%`);
  return bits.slice(0, 3).join('  ·  ');
}

/**
 * One member's equipment slots, in the order the gear card lays them out.
 * @param {object} game
 * @param {string} id roster id
 */
export function readGear(game, id) {
  const r = rpg(game);
  if (!r) return (GEAR[id] || GEAR.noctis).map((g) => ({ ...g }));
  const eq = r.inventory.equipped(id);
  const out = [];
  eq.weapon.forEach((def) => out.push(slotView('Weapon', def)));
  eq.accessory.forEach((def) => out.push(slotView('Accessory', def)));
  return out;
}

function slotView(slot, def) {
  if (!def) return { slot, name: '— Empty —', stat: '', empty: true, id: null };
  return {
    slot, id: def.id, name: def.name,
    stat: slot === 'Weapon' ? `ATK +${def.attack}${modLine(def.mods) ? `  ·  ${modLine(def.mods)}` : ''}` : (modLine(def.mods) || def.special || ''),
  };
}

/**
 * The tracked quest, its current objective and the real distance to its
 * waypoint. Everything the compass strip and the pause menu print.
 * @param {object} game
 * @returns {{title:string, step:string, dist:number, region:string, type:string, waypoint:number[]|null}}
 */
export function readQuest(game) {
  const hs = hudState(game);
  const t = hs && hs.tracked;
  if (!t) return { ...QUEST, region: 'Leide', type: 'side', waypoint: null, live: false };
  const obj = (t.objectives || []).find((o) => !o.done) || t.objectives?.[t.objectives.length - 1];
  const wp = (hs.waypoints || []).find((w) => w.questId === t.id) || null;
  const p = game?.get?.('Player')?.position;
  let dist = 0;
  if (wp && p) dist = Math.round(Math.hypot(p.x - wp.pos[0], p.z - wp.pos[2]));
  return {
    id: t.id,
    title: t.name,
    step: obj ? obj.label : t.summary,
    dist,
    progress: obj ? obj.progress : 0,
    count: obj ? obj.count : 0,
    region: t.region || 'leide',
    type: t.type,
    waypoint: wp ? wp.pos : null,
    live: true,
  };
}

/**
 * Every marker the world map and the compass strip should show: active quest
 * waypoints plus discovered havens.
 * @param {object} game
 * @returns {Array<{kind:string, name:string, x:number, z:number}>}
 */
export function readMarkers(game) {
  const r = rpg(game);
  const hs = hudState(game);
  if (!r || !hs) return null;
  const out = [];
  for (const w of hs.waypoints || []) {
    out.push({ kind: w.type === 'hunt' ? 'hunt' : 'quest', name: w.name, x: w.pos[0], z: w.pos[2], tracked: w.tracked });
  }
  for (const h of r.day.havens()) {
    if (!h.discovered) continue;
    out.push({ kind: 'haven', name: h.name, x: h.pos[0], z: h.pos[2] });
  }
  for (const d of r.tables.deposits || []) {
    out.push({ kind: 'deposit', name: d.name || d.id, x: d.pos[0], z: d.pos[2] });
  }
  return out;
}

/**
 * Party techniques for the combat HUD's tech rack — one signature technique
 * per companion, with real bar costs and the real charge state.
 * @param {object} game
 */
export function readTechniques(game) {
  const r = rpg(game);
  if (!r) return TECHNIQUES.map((t) => ({ ...t }));
  const charge = r.party.techCharge;
  const out = [];
  for (const id of ['gladio', 'ignis', 'prompto']) {
    const t = r.party.signatureTechnique(id);
    if (!t) continue;
    out.push({
      name: t.name,
      owner: MEMBER_UI[id].short,
      cost: t.bars,
      icon: CLASS_ICON[r.party.members[id].weapon] || 'sword',
      ready: t.bars > 0 ? Math.min(1, charge / t.bars) : 1,
    });
  }
  return out.length ? out : TECHNIQUES.map((t) => ({ ...t }));
}

/**
 * The Ascension grid: the authored 106-node graph plus whatever live state
 * there is to overlay on it.
 *
 * The layout tables are pure data, so the star map draws correctly even without
 * a running `RpgSystem`; only the AP wallet and the unlocked set need one.
 * @param {object} game
 */
export function readAscension(game) {
  const r = rpg(game);
  const asc = r ? r.ascension : null;
  return {
    nodes: r ? r.tables.nodes : NODES,
    edges: r ? r.tables.edges : EDGES,
    constellations: r ? r.tables.constellations : CONSTELLATION_INFO,
    ap: asc ? asc.ap : 0,
    total: asc ? asc.totalApRequired : Object.values(NODES).reduce((a, n) => a + n.ap, 0),
    unlockedCount: asc ? asc.unlocked.size : 0,
    isUnlocked: (id) => !!asc && asc.isUnlocked(id),
    canUnlock: (id) => (asc ? asc.canUnlock(id) : { ok: false, reason: 'locked', missing: [], ap: 0 }),
    unlock: (id) => (r ? r.unlockNode(id) : false),
  };
}

/**
 * The Armiger gauge, 0..1, earned from damage dealt. Null with no RPG system.
 * @param {object} game
 */
export function readArmiger(game) {
  const r = rpg(game);
  return r && r.combatBridge ? r.combatBridge.armiger : null;
}

/**
 * Resolve a hit on a scene-graph enemy through the real damage formula.
 * Returns null when there is no RPG system to ask.
 * @param {object} game
 * @param {object} enemy
 * @param {object} [opts] see `CombatBridge.roll`
 */
export function rollDamage(game, enemy, opts) {
  const r = rpg(game);
  if (!r || !r.combatBridge || !enemy) return null;
  return r.combatBridge.roll(enemy, opts);
}

/**
 * World XZ -> the MapScreen's 1600x900 chart. North is -Z and up-screen; the
 * transform is anisotropic to match the chart's elliptical landmass.
 * @param {number} x world x
 * @param {number} z world z
 */
export function worldToChart(x, z) {
  return { x: 760 + (x / 430) * 396, y: 440 + (z / 430) * 248 };
}
