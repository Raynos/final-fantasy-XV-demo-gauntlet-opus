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
 * The part of an `rpg.tables.items` entry a shelf reads.
 *
 * The RPG layer's item table is still untyped, so this is the *read* side
 * written down rather than a second copy of the table: a shelf never needs
 * more than an id, a name, a category, a price and the tags that keep the
 * royal arms off the rack.
 */
export interface ItemDef {
  id: string;
  name: string;
  category: string;
  price: number;
  tags: string[];
}

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
      Weapons: (def: ItemDef) => def.category === 'weapon' && def.price > 0 && !def.tags.includes('royal'),
      Accessories: (def: ItemDef) => def.category === 'accessory' && def.price > 0,
    },
    sellCategories: ['weapon', 'accessory', 'treasure', 'catalyst'],
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
