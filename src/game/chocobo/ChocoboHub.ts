import * as THREE from 'three';
import { CHOCOBO_COLOURS } from '../../characters/chocobo/ChocoboRig.ts';
import { RACES } from './Races.ts';
import type { Game } from '../Game.ts';
import type { ChocoboSystem } from './ChocoboSystem.ts';
import type { InteractableHandle } from '../interaction/Interactables.ts';
import type { DialogueChoice, DialogueScript } from '../interaction/Dialogue.ts';
import { worldMap } from '../../world/map/WorldMap.ts';

/**
 * The chocobo posts, as places you can do something at.
 *
 * Task 70 gave the world a mount. This is the half that gives the mount a
 * *home*: two stables where a bird is dyed, fed and raced, and where the gil
 * a player has no other use for turns into something visible from the saddle.
 *
 * ### Why this is interactables and a dialogue script, not a shop screen
 * Every other economy in the game already has a screen — `shop`, `hunts`,
 * `ascension` — and each of those is a *list of rows with prices*, which is
 * exactly the wrong shape here. Three of the four things a stable does are one
 * decision each ("which colour", "feed it", "which race"), and a conversation
 * is the cheapest UI in the repo that can carry state-dependent rows: a
 * `DialogueChoice.when` reads live gil and the live feed tier at the moment
 * the row is drawn. `Interaction.say()` is one call and there is no new screen
 * to register, style, gamepad-map or teach the menu stack about.
 *
 * ### Why the state lives on `ChocoboSystem`
 * The colour you own, the tier you have fed to and the times you have raced
 * are all *the bird's*, and there is exactly one bird. Hanging them off the
 * hub would mean Wiz and the Alpine Stable each remembering a different
 * animal.
 */

/** One stable: where it is, and what it will do for you. */
export interface HubDef {
  key: string;
  /** Shown on the prompt and as the dialogue speaker's role. */
  name: string;
  /** POI id in `worldMap`, which is what places it in the world. */
  poi: string;
  /** Where the stable's own prompt sits, relative to the POI's centre. */
  dx: number;
  dz: number;
  /** Where the race board sits, relative to the POI's centre. */
  bdx: number;
  bdz: number;
  /**
   * Dyes are sold here.
   *
   * **Only at Wiz.** The plan is explicit that colour variants are "bought
   * with gil at Wiz", and it is the right call for a reason beyond fidelity:
   * an upgrade you can buy at every stable is a menu, and an upgrade you have
   * to ride back to Duscae for is a destination.
   */
  dyes: boolean;
}

export const CHOCOBO_HUBS: HubDef[] = [
  // Wiz stands at the POI + (26, 14) (`Npcs.ts` :254). The stable prompt sits
  // four metres short of him and the board four metres past, so the three
  // prompts never fight over one E press — `InteractionSystem` breaks ties on
  // distance and facing, and three verbs inside one radius is a coin toss.
  { key: 'wiz', name: 'Wiz Chocobo Post', poi: 'wiz_chocobo', dx: 21, dz: 11, bdx: 31, bdz: 17, dyes: true },
  { key: 'alpine', name: 'Alpine Stable', poi: 'meldacio_layby', dx: 9, dz: 5, bdx: 15, bdz: -3, dyes: false },
];

/**
 * What a dye costs, keyed off `CHOCOBO_COLOURS`.
 *
 * Yellow is free because it is the bird you already own. The rest are priced
 * against a starting purse of 42,180 gil (`Game.ts` :316) so that the first
 * dye is an easy yes, the black bird is a decision, and buying the set is a
 * genuine sink for the mid-game economy.
 */
export const DYE_PRICE: Record<string, number> = {
  yellow: 0, green: 2500, red: 3500, blue: 5000, white: 7000, black: 12000,
};

/**
 * The sylkis ladder.
 *
 * **Feeding raises the sprint ceiling and the tank; it does not touch cruise.**
 * That is deliberate and it is not a balance opinion: `WorldMap.travel()` has
 * priced chocobo travel at exactly `SPEED.chocobo` = 11.0 m/s since before
 * there was a chocobo, and task 70's whole claim to honesty is that a ridden
 * bird sustains 11.00 m/s so the map's ETA table tells the truth. An upgrade
 * that raised cruise would make the map a liar again the first time anybody
 * bought one. Sprint is free of that promise — the map never priced a burst —
 * and it is also the stat a race actually spends.
 */
export interface FeedTier {
  /** Sylkis greens to move *into* this tier. */
  cost: number;
  name: string;
  /** Multiplier on `CHOCOBO_SPRINT`. */
  sprint: number;
  /** Multiplier on the stamina tank, before Ascension's own. */
  stamina: number;
}

export const FEED_TIERS: FeedTier[] = [
  { cost: 0, name: 'Unfed', sprint: 1.00, stamina: 1.00 },
  { cost: 2, name: 'Conditioned', sprint: 1.09, stamina: 1.35 },
  { cost: 4, name: 'Race-fit', sprint: 1.18, stamina: 1.75 },
  { cost: 7, name: 'Sylkis-fed', sprint: 1.30, stamina: 2.40 },
];

const _v = new THREE.Vector3();

export class ChocoboHub {
  _handles!: InteractableHandle[];
  _placed!: boolean;
  game!: Game;
  system!: ChocoboSystem;
  constructor(system: ChocoboSystem) {
    this.system = system;
    this._handles = [];
    this._placed = false;
  }

  init(game: Game) { this.game = game; }

  /**
   * Put the prompts in the world, once, as soon as something can answer for
   * the ground height.
   *
   * Registration is not range-gated. Two stables are four interactables, and
   * `InteractionSystem.update` is a distance test per item against the player
   * — four of those is not a budget line, whereas a register/dispose churn as
   * the player crosses a radius is four allocations a frame at the boundary.
   */
  update() {
    if (this._placed || !this.game) return;
    const interaction = this.game.get('Interaction');
    const terrain = this.game.get('Terrain');
    if (!interaction || !terrain) return;
    this._placed = true;
    for (const hub of CHOCOBO_HUBS) {
      const poi = worldMap.poiById(hub.poi);
      if (!poi) continue;
      const sx = poi.x + hub.dx, sz = poi.z + hub.dz;
      const bx = poi.x + hub.bdx, bz = poi.z + hub.bdz;
      this._handles.push(interaction.register({
        id: `chocobo-stable-${hub.key}`,
        pos: new THREE.Vector3(sx, terrain.heightAt(sx, sz) + 0.1, sz),
        radius: 3.2, verb: 'Tend', label: hub.name, priority: 2, yOffset: 1.5,
        handler: () => { interaction.say(this.stableScript(hub)); },
      }));
      this._handles.push(interaction.register({
        id: `chocobo-races-${hub.key}`,
        pos: new THREE.Vector3(bx, terrain.heightAt(bx, bz) + 0.1, bz),
        radius: 3.2, verb: 'Read', label: 'Race Board', priority: 2, yOffset: 1.6,
        // A race board is dead weight during a race, and an E press that
        // restarts the run you are three checkpoints into is the kind of
        // footgun you only find by doing it.
        enabled: () => !this.system.races.running,
        handler: () => { interaction.say(this.raceScript(hub)); },
      }));
    }
  }

  dispose() {
    for (const h of this._handles) h.dispose();
    this._handles.length = 0;
    this._placed = false;
  }

  /* ------------------------------------------------------------ the stable */

  _gil() { return this.game.get('Rpg')?.inventory?.gil ?? 0; }
  _questDone() { return this.game.get('Rpg')?.quests?.status?.('side_chocobo') === 'complete'; }
  _greens() { return this.game.get('Rpg')?.inventory?.count?.('sylkis_greens') ?? 0; }

  /** Colours, feed and a word about the bird. */
  stableScript(hub: HubDef): DialogueScript {
    const sys = this.system;
    const menu: DialogueChoice[] = [];
    if (hub.dyes) menu.push({ label: 'The dye stall', next: 'dyes', note: 'Colours' });
    menu.push({ label: 'Sylkis greens', next: 'feed', note: 'Upgrade' });
    menu.push({ label: 'How is she doing?', next: 'status' });
    menu.push({ label: 'Nothing today', end: true });

    /**
     * Wiz pays for the stray with a dye on the house.
     *
     * `side_chocobo` used to hand over the whistle, and the whistle is now in
     * the starting bag, so its reward had to become something the stable
     * actually sells. This is the whole of that: one colour free, once, after
     * the quest is done — read from live quest state on the frame the row is
     * drawn, so nothing has to be granted, saved or invalidated.
     */
    const freeDye = this._questDone() && sys.ownedColours.size === 1;
    const dyeRows: DialogueChoice[] = CHOCOBO_COLOURS.map((c) => {
      const price = freeDye ? 0 : (DYE_PRICE[c.key] ?? 0);
      const owned = sys.ownedColours.has(c.key);
      return {
        label: c.name,
        note: owned ? (sys.colour === c.key ? 'Worn' : 'Owned') : (price === 0 ? 'On the house' : `${price.toLocaleString()} g`),
        when: () => sys.colour !== c.key,
        action: () => {
          if (!owned) {
            const inv = this.game.get('Rpg')?.inventory;
            if (!inv || !inv.spendGil(price)) return 'broke';
            sys.ownedColours.add(c.key);
          }
          sys.setColour(c.key);
          return 'dyed';
        },
      };
    });
    dyeRows.push({ label: 'Leave her as she is', next: 'menu' });

    return {
      speaker: hub.dyes ? 'Wiz' : 'Stablehand',
      role: hub.name, hue: 40, tone: 0.44,
      start: 'menu',
      nodes: {
        menu: { choices: menu },
        dyes: {
          lines: () => (this._questDone() && sys.ownedColours.size === 1
            ? ['Dye, not breeding — she is the same bird underneath and she knows it.',
              'And you brought my stray home, so the first one is on me. Pick a colour.']
            : ['Dye, not breeding — she is the same bird underneath and she knows it.',
              `You are carrying ${this._gil().toLocaleString()} gil.`]),
          next: 'dyelist',
        },
        dyelist: { choices: dyeRows },
        dyed: {
          lines: () => [`She comes out ${sys.colourName().toLowerCase()}. Give her an hour to stop admiring herself.`],
          next: 'menu',
        },
        broke: { lines: ['Come back when you have the gil. She will not have gone anywhere.'], next: 'menu' },
        feed: {
          lines: () => {
            const t = sys.feedTier, next = FEED_TIERS[t + 1];
            if (!next) return ['She is on full sylkis and there is nothing left to give her. Any more and she will burst.'];
            return [
              `She is ${FEED_TIERS[t].name.toLowerCase()}. Next step is ${next.name.toLowerCase()} — ${next.cost} bunches of sylkis.`,
              `You have ${this._greens()}.`,
            ];
          },
          next: 'feedmenu',
        },
        feedmenu: {
          choices: [
            {
              label: 'Feed her', note: 'Sylkis',
              when: () => sys.feedTier < FEED_TIERS.length - 1,
              action: () => {
                const next = FEED_TIERS[sys.feedTier + 1];
                const inv = this.game.get('Rpg')?.inventory;
                if (!inv || !inv.has('sylkis_greens', next.cost)) return 'nogreens';
                inv.remove('sylkis_greens', next.cost);
                sys.feedTier += 1;
                return 'fed';
              },
            },
            { label: 'Not now', next: 'menu' },
          ],
        },
        fed: {
          lines: () => {
            const t = FEED_TIERS[sys.feedTier];
            return [
              `She went through that like it owed her money. ${t.name} now.`,
              `Burst is up ${Math.round((t.sprint - 1) * 100)}% and she will hold it ${Math.round((t.stamina - 1) * 100)}% longer.`,
            ];
          },
          next: 'menu',
        },
        nogreens: {
          lines: ['Not enough greens. Any market that sells to a kitchen sells sylkis — they are just expensive.'],
          next: 'menu',
        },
        status: {
          lines: () => {
            const t = FEED_TIERS[sys.feedTier];
            const owned = sys.ownedColours.size;
            const best = sys.races.bestSummary();
            return [
              `${sys.colourName()}, ${t.name.toLowerCase()}. ${owned > 1 ? `${owned} colours in the book.` : 'One colour in the book.'}`,
              best || 'She has not raced yet. There is a board over there with three courses on it.',
            ];
          },
          next: 'menu',
        },
      },
    };
  }

  /* -------------------------------------------------------- the race board */

  /** The three authored courses, filtered to the ones posted at this stable. */
  raceScript(hub: HubDef): DialogueScript {
    const sys = this.system;
    const here = RACES.filter((r) => r.hub === hub.key);
    const rows: DialogueChoice[] = here.map((r) => ({
      label: r.name,
      note: `${r.entry.toLocaleString()} g`,
      action: () => {
        const inv = this.game.get('Rpg')?.inventory;
        if (!inv || inv.gil < r.entry) return 'broke';
        inv.spendGil(r.entry);
        sys.races.start(r.id);
        return null;
      },
      end: true,
    }));
    rows.push({ label: 'Another day', end: true });

    return {
      speaker: 'Race Board', role: hub.name, hue: 40, tone: 0.3,
      start: 'board',
      nodes: {
        board: {
          lines: () => {
            const out = [`${here.length === 1 ? 'One course' : `${here.length} courses`} posted. Gates are open, prize is cash and the clock does not care whose bird it is.`];
            for (const r of here) {
              const best = sys.races.best[r.id];
              out.push(`${r.name} — ${r.checkpoints.length} gates, par ${r.par.toFixed(0)}s, ${r.prizeGil.toLocaleString()} gil and ${r.prizeAp} AP${best ? `. Your best: ${best.toFixed(2)}s` : ''}`);
            }
            return out;
          },
          next: 'pick',
        },
        pick: { choices: rows },
        broke: { lines: ['Entry is up front. Come back with it.'], next: 'board' },
      },
    };
  }

  /** One hub by key, for `Races` to resolve a course's POI. */
  hubDef(key: string): HubDef | null { return CHOCOBO_HUBS.find((h) => h.key === key) || null; }

  /** Where the player's bird is put on the line, for `Races.start`. */
  startLine(hubKey: string): THREE.Vector3 | null {
    const hub = CHOCOBO_HUBS.find((h) => h.key === hubKey);
    if (!hub) return null;
    const poi = worldMap.poiById(hub.poi);
    if (!poi) return null;
    const terrain = this.game.get('Terrain');
    const x = poi.x + hub.bdx, z = poi.z + hub.bdz;
    return _v.set(x, terrain ? terrain.heightAt(x, z) : 0, z).clone();
  }
}
