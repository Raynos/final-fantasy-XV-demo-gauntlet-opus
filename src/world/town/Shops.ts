/**
 * Hammerhead's three counters.
 *
 * FFXV's outposts are not one shop — a rest stop is a diner, a garage and,
 * where there is one, a Culless Munitions van in the car park. Each has its own
 * stock, its own owner and its own patter, and all three buy back.
 *
 * Stock is expressed as item ids resolved against `rpg.tables.items` at open
 * time, so nothing here duplicates the price or the description: if the RPG
 * layer changes a price, these shelves change with it. Where a list would be
 * long and arbitrary (every weapon, every accessory) it is expressed as a
 * filter over the real table instead of a hand-typed list.
 */

/** Categories each counter is willing to take off your hands. */
const ALL_SELLABLE = ['treasure', 'catalyst', 'ingredient', 'weapon', 'accessory', 'curative'];

/**
 * A shelf lists real items.
 *
 * This used to be a five-field local copy of the read side, written while the
 * RPG layer was untyped. `Inventory.ItemDef` is the real thing now, so the
 * copy is gone: a shelf and the bag it trades with are one type, and the shop
 * screen no longer has to reconcile two `ItemDef`s that were never the same.
 */
import type { ItemDef } from '../../game/rpg/Inventory.ts';
export type { ItemDef };

/**
 * One counter.
 *
 * A shop lists its shelves *either* as hand-written id lists (`stock`) or as a
 * filter over the whole item table (`filter`), never both: the diner's pantry
 * is a chosen list, the armoury's rack is "everything for sale that is a
 * weapon". {@link stockFor} takes whichever one the shop has.
 */
export interface ShopDef {
  id: string;
  name: string;
  sub: string;
  owner: string;
  ownerRole: string;
  /** Hue for the dialogue card, degrees. */
  hue: number;
  greeting: string;
  buyLine: string;
  brokeLine: string;
  emptyLine: string;
  /** Tab labels, in order. The last is always `Sell`. */
  tabs: string[];
  /** Per-tab item ids. */
  stock?: Record<string, string[]>;
  /** Per-tab predicate over the whole item table. */
  filter?: Record<string, (def: ItemDef) => boolean>;
  /** Item categories this counter buys back. */
  sellCategories: string[];
}

export const TOWN_SHOPS = {
  crowsnest: {
    id: 'crowsnest',
    name: "The Crow's Nest",
    sub: 'Hammerhead · Diner',
    owner: 'Takka',
    ownerRole: 'Cook',
    hue: 24,
    greeting: 'Grill\'s hot. Pantry\'s open. Take what you need.',
    buyLine: 'Good choice.',
    brokeLine: 'Come back when you\'ve got the gil, kid.',
    emptyLine: 'You got nothing I want. No offence.',
    tabs: ['Provisions', 'Ingredients', 'Sell'],
    // Takka runs the pantry: field curatives you can eat, and every ingredient
    // Ignis can actually cook with out here.
    stock: {
      Provisions: [
        'potion', 'hi_potion', 'antidote', 'gold_needle', 'smelling_salts',
        'phoenix_down', 'ether', 'remedy', 'cup_noodles', 'luncheon_meat',
      ],
      Ingredients: [
        'lucian_tomato', 'leiden_pepper', 'leiden_potato', 'lucian_carrot',
        'wild_onion', 'sweet_pepper', 'saxham_rice', 'cleigne_wheat',
        'birdbeast_egg', 'anak_meat', 'daggerquill_breast', 'chickatrice_breast',
        'dualhorn_steak', 'kettier_ginger', 'schier_turmeric', 'allural_shallot',
      ],
    },
    sellCategories: ['ingredient', 'treasure', 'curative'],
  },

  garage: {
    id: 'garage',
    name: 'Sophiar Auto Parts',
    sub: 'Hammerhead · Garage counter',
    owner: 'Cindy',
    ownerRole: 'Chief Mechanic',
    hue: 44,
    greeting: 'Anythin\' y\'all need for the road, we got it back here.',
    buyLine: 'Wrapped and ready.',
    brokeLine: 'That\'s more\'n you\'re carryin\', hon.',
    emptyLine: 'Nothin\' in that bag worth a thing to me.',
    tabs: ['Curatives', 'Catalysts', 'Sundries', 'Sell'],
    stock: {
      Curatives: ['potion', 'hi_potion', 'mega_potion', 'elixir', 'phoenix_down', 'remedy', 'ether', 'mega_ether'],
      // Elemancy catalysts are exactly the kind of junk a garage ends up with.
      Catalysts: ['debased_coin', 'debased_silver', 'debased_banknote', 'magitek_booster', 'chrome_bit', 'sturdy_helixhorn', 'venom_fang', 'rotten_splinterbone'],
      Sundries: ['bronze_bangle', 'silver_bangle', 'power_wristband', 'talisman', 'ruby_bracelet', 'topaz_bracelet'],
    },
    sellCategories: ALL_SELLABLE,
  },

  culless: {
    id: 'culless',
    name: 'Culless Munitions',
    sub: 'Hammerhead · Mobile armoury',
    owner: 'Arms Dealer',
    ownerRole: 'Culless Munitions',
    hue: 200,
    greeting: 'Everything on the rack is legal. Mostly.',
    buyLine: 'Try not to lose it.',
    brokeLine: 'No credit. Not to princes either.',
    emptyLine: 'I only take steel, and you are carrying none.',
    tabs: ['Weapons', 'Accessories', 'Sell'],
    // The van carries the whole catalogue that is actually for sale: royal arms
    // are never stock, and neither is anything with no price.
    filter: {
      // Capped at 2,500 gil. A mobile armoury in a Leide car park carrying the
      // Balmung (56,000) is why the 42,180-gil wallet had nowhere to go that
      // was not Hammerhead: everything in the game was already on this rack.
      // The top of the catalogue now lives at Forge & Filigree in Lestallum,
      // which is a two-minute drive and a thirty-level region away.
      Weapons: (def: ItemDef) => def.category === 'weapon' && def.price > 0 && def.price <= 2500 && !def.tags.includes('royal'),
      Accessories: (def: ItemDef) => def.category === 'accessory' && def.price > 0 && def.price <= 2500,
    },
    sellCategories: ['weapon', 'accessory', 'treasure', 'catalyst'],
  },

  /* -------------------------------------------------------- Lestallum -- */
  /*
   * Three counters on the market square, and they are deliberately not three
   * versions of the same shelf. Lestallum is where a party that has been
   * living out of a Regalia boot for twenty hours finally has somewhere to
   * spend: `RpgSystem` starts the player on **42,180 gil** and until now the
   * most expensive thing for sale in Lucis was a 2,400-gil Hardedge in a van.
   */
  partellum: {
    id: 'partellum',
    name: 'Partellum Market',
    sub: 'Lestallum · Market square',
    owner: 'Verdough',
    ownerRole: 'Grocer',
    hue: 96,
    greeting: 'Everything on this table came up the shelf road this morning.',
    buyLine: 'Eat it before Thursday.',
    brokeLine: 'I can do you a shallot. On credit. One shallot.',
    emptyLine: 'I sell food. You are carrying rocks and knives.',
    tabs: ['Produce', 'Curios & Stones', 'Sell'],
    stock: {
      // The good end of the pantry: what Duscae and Cleigne grow and Leide
      // cannot, which is the whole reason a party drives up here.
      Produce: [
        'ulwaat_berries', 'sylkis_greens', 'curiel_greens', 'fine_cleigne_wheat',
        'allural_shallot', 'duscaen_olives', 'kettier_ginger', 'schier_turmeric',
        'aegir_root', 'cleigne_darkshell', 'basilisk_ribs', 'garula_tenderloin',
        'vesproom', 'malmashroom',
      ],
      // Lestallum is where collectors are, which is why an Old Book is worth
      // carrying up here, and the gemstone trade runs through the market.
      'Curios & Stones': [
        'old_book', 'beautiful_bottle', 'rare_coin', 'sky_gemstone',
        'earth_gemstone', 'coeurl_whiskers', 'moogle_charm_frag',
      ],
    },
    sellCategories: ['ingredient', 'treasure', 'catalyst'],
  },

  forge: {
    id: 'forge',
    name: 'Forge & Filigree',
    sub: 'Lestallum · Smithy',
    owner: 'Randolph',
    ownerRole: 'Weaponsmith',
    hue: 12,
    greeting: 'Steel worth the name. Nothing on this rack is a van special.',
    buyLine: 'Carry it like you mean it.',
    brokeLine: 'Come back when the hunts have paid.',
    emptyLine: 'I take steel and stones. That bag has neither.',
    tabs: ['Weapons', 'Accessories', 'Sell'],
    // The complement of Culless' cap, exactly: everything for sale that the
    // van will no longer carry. Between the two shops the whole catalogue is
    // still buyable and there is now a reason to drive.
    filter: {
      Weapons: (def: ItemDef) => def.category === 'weapon' && def.price > 2500 && !def.tags.includes('royal'),
      Accessories: (def: ItemDef) => def.category === 'accessory' && def.price > 1500,
    },
    sellCategories: ['weapon', 'accessory', 'treasure', 'catalyst'],
  },

  beanmine: {
    id: 'beanmine',
    name: "Surgate's Beanmine",
    sub: 'Lestallum · Coffee house',
    owner: 'Surgate',
    ownerRole: 'Proprietor',
    hue: 30,
    greeting: 'Coffee, and whatever Tony has left on the board. In that order.',
    buyLine: 'Mind, it is hot.',
    brokeLine: 'The water is free. The coffee is not.',
    emptyLine: 'This is a coffee house, not a pawnbroker.',
    tabs: ['Counter', 'Larder', 'Sell'],
    stock: {
      Counter: ['potion', 'hi_potion', 'mega_potion', 'ether', 'mega_ether', 'remedy', 'elixir', 'phoenix_down'],
      Larder: ['saxham_rice', 'cleigne_wheat', 'birdbeast_egg', 'luncheon_meat', 'cup_noodles', 'sweet_pepper', 'wild_onion', 'lucian_tomato'],
    },
    sellCategories: ['ingredient', 'curative', 'treasure'],
  },

  /* ------------------------------------------------------ Galdin Quay -- */
  pearl: {
    id: 'pearl',
    name: 'Mother of Pearl',
    sub: 'Galdin Quay · Restaurant',
    owner: 'Coctura',
    ownerRole: 'Chef',
    hue: 194,
    greeting: 'Sit anywhere. If it came out of that water this morning I will cook it.',
    buyLine: 'Enjoy. Truly.',
    brokeLine: 'The view is free. Everything else is not.',
    emptyLine: 'Bring me a fish and we will talk.',
    tabs: ['Kitchen', 'Fishmonger', 'Sell'],
    stock: {
      // A restaurant priced like one: this is the most expensive shelf on Eos
      // and it is meant to be, because the wallet has to have somewhere to go.
      Kitchen: ['ulwaat_berries', 'basilisk_ribs', 'fine_cleigne_wheat', 'sylkis_greens', 'elixir', 'mega_ether', 'remedy'],
      // Sea fish, over the counter, for anyone who cannot be bothered to fish.
      Fishmonger: ['sea_bass', 'sea_bream', 'murk_grouper', 'barramundi', 'allural_sea_bass', 'aegir_root', 'cleigne_darkshell'],
    },
    // She buys the catch, and at a premium -- but the premium is NOT here.
    // `Inventory.sellPrice` is global and `ShopScreen` has no per-shop hook, so
    // a `sellMult` on this row would be a field nothing reads. Coctura's 1.4x
    // lives in her own dialogue instead ("Sell you today's catch"), which is
    // in this lane's files and works today. See `NpcDialogue.coctura`.
    sellCategories: ['ingredient', 'treasure'],
  },

  dinos_bench: {
    id: 'dinos_bench',
    name: "Dino's Bench",
    sub: 'Galdin Quay · Jeweller',
    owner: 'Dino Ghiranze',
    ownerRole: 'Jeweller · Reporter',
    hue: 310,
    greeting: 'You bring me stones, I make you something nobody else has. Deal?',
    buyLine: 'Wear it where people can see it.',
    brokeLine: 'Ah — cash flow. I have been there. I am there.',
    emptyLine: 'No stones, no bench. Go find me a rock.',
    tabs: ['Commissions', 'Sell'],
    // Three pieces you cannot buy anywhere else, hand-listed rather than
    // filtered, because "exclusive" and "a predicate over the whole table" are
    // opposite things.
    stock: {
      // Three pieces and nothing else. `moogle_charm` and `ribbon` are the
      // obvious "exclusive" picks and are deliberately NOT here: both are
      // priced 0 in the item table, and a 0-gil row on a shop shelf is a free
      // Ribbon, which is the best accessory in the game.
      Commissions: ['sages_stone', 'obsidian_torque', 'hypno_crown'],
    },
    sellCategories: ['treasure', 'catalyst'],
  },
};

/**
 * Resolve a shop's stock for one tab into hydrated item definitions.
 * @param shop entry from TOWN_SHOPS
 * @param items `rpg.tables.items`
 * @returns item definitions, cheapest first
 */
export function stockFor(shop: ShopDef, tab: string, items: Record<string, ItemDef> | null | undefined): ItemDef[] {
  if (!items) return [];
  const pick = shop.filter?.[tab];
  const list = pick
    ? Object.values(items).filter(pick)
    : (shop.stock?.[tab] ?? []).map((id) => items[id]).filter((d): d is ItemDef => !!d);
  return list.slice().sort((a, b) => (a.price - b.price) || a.name.localeCompare(b.name));
}
