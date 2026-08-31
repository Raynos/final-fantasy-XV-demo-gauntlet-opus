import * as THREE from 'three';
import { worldMap } from '../../world/map/WorldMap.ts';
import { ITEMS } from './Inventory.ts';
import type { RpgSystem } from './RpgSystem.ts';
import type { Game } from '../Game.ts';
import type { InteractableHandle } from '../interaction/Interactables.ts';

/**
 * The ten royal tombs, as places you can actually claim something at.
 *
 * The situation this fixes is the same shape as `Deposits.ts`'s, and worse.
 * Eight weapons in `Inventory.ts` carry the `royal` tag, cost 0 gil, are sold
 * by nobody, dropped by nothing and granted by no quest: `sword_wise`,
 * `blade_mystic`, `sword_father`, `axe_conqueror`, `trident_oracle`,
 * `star_rogue`, `bow_clever`, `shield_just`. The Armiger constellation in
 * `Ascension.ts` spends AP on abilities that call them. The map has ten `tomb`
 * pins, and `PoiKits._tomb` builds a full peristyle temple with a sarcophagus
 * and a rune blade standing over it at every one. Every part of the loop was
 * built except the one that hands the weapon over, so all eight arms were
 * unobtainable and all ten temples were scenery. This is that part.
 *
 * **The tomb ids and the tomb display names are crossed, deliberately, and
 * this table pairs on the NAME.** `tomb_conqueror` is named "Tomb of the
 * Clever", `tomb_clever` is "Tomb of the Fierce", `tomb_fierce` is "Tomb of
 * the Wanderer" and `tomb_mystic` is "Tomb of the Pious" -- an id-based pairing
 * looks right, typechecks, and hands out four wrong weapons. `expect` below is
 * asserted against the live POI name at load so the crossing can never be
 * quietly re-introduced by an edit to either table.
 *
 * Two of the ten -- the Pious and the Wanderer -- grant no weapon. There are
 * ten tombs and eight royal arms, and the honest resolution is the one the
 * fiction already offers: those two were plundered centuries ago. They read as
 * lore and pay AP, so walking to them is never a dead end.
 *
 * Installed from `RpgSystem.update`'s first tick rather than from `init()`, for
 * the reason `Deposits` and `HavenCamp` are: `Interaction` boots six systems
 * after `Rpg`, so the handles cannot be taken during init.
 */

/** One tomb as authored. */
interface TombSite {
  /** POI id in `WorldMap`. */
  at: string;
  /** The POI's display name, asserted at load. See the crossing note above. */
  expect: string;
  /** Weapon id in `Inventory.WEAPONS`, or null for a plundered tomb. */
  arm: string | null;
  /** What the king was, in one line. Shown on the prompt and in the toast. */
  lore: string;
}

const TOMB_SITES: TombSite[] = [
  { at: 'tomb_wise', expect: 'Tomb of the Wise', arm: 'sword_wise',
    lore: 'The Wise King fought beside his own blade, and it fights beside you.' },
  { at: 'tomb_mystic2', expect: 'Tomb of the Mystic', arm: 'blade_mystic',
    lore: 'A sword as long as its bearer was patient.' },
  { at: 'tomb_clever', expect: 'Tomb of the Fierce', arm: 'sword_father',
    lore: 'Regis\' own greatsword. The last thing his father gave him.' },
  { at: 'tomb_conqueror2', expect: 'Tomb of the Conqueror', arm: 'axe_conqueror',
    lore: 'It takes a full second to land and it does not matter.' },
  { at: 'tomb_tall', expect: 'Tomb of the Tall', arm: 'trident_oracle',
    lore: 'The Oracle\'s trident, older than the Wall.' },
  { at: 'tomb_rogue', expect: 'Tomb of the Rogue', arm: 'star_rogue',
    lore: 'The Rogue never once fought fair.' },
  { at: 'tomb_conqueror', expect: 'Tomb of the Clever', arm: 'bow_clever',
    lore: 'The Clever King never needed to be close.' },
  { at: 'tomb_just', expect: 'Tomb of the Just', arm: 'shield_just',
    lore: 'The Just King never lost a man.' },
  { at: 'tomb_mystic', expect: 'Tomb of the Pious', arm: null,
    lore: 'The plinth is empty and the dust on it is not recent. Long since plundered.' },
  { at: 'tomb_fierce', expect: 'Tomb of the Wanderer', arm: null,
    lore: 'Someone got here first, and a long time ago. Long since plundered.' },
];

/** One tomb, resolved: its POI, its arm and its live prompt. */
interface TombNode {
  site: TombSite;
  name: string;
  poiId: string;
  /** Live reference handed to `Interaction`; moved onto the kit's sarcophagus
   *  anchor the first time the streamer has actually built the temple. */
  pos: THREE.Vector3;
  anchored: boolean;
  handle: InteractableHandle | null;
  claimed: boolean;
}

/**
 * Metres the prompt appears within, measured from the sarcophagus.
 *
 * There is no second, wider reach for the not-yet-built case any more, and the
 * number is why. `PoiKits._tomb` puts the coffin at kit-local
 * `z = cD / 2 + 2.6` under a `1.4` world scale -- **7.19 m from the POI pin,
 * for every tomb**, only the bearing turning with the per-site yaw (measured
 * across all ten in `src/tools/probes/tombreach.mts`: `dPin=7.19` on every
 * row). A pin-anchored prompt with any reach under 7.19 m therefore *cannot*
 * still be reachable from the pin once it re-anchors, so the first version of
 * this file advertised a 15 m prompt on the pin and then moved it 7.19 m onto a
 * 6.5 m reach that no longer covered the place it had just been offered.
 */
const REACH_NEAR = 6.5;

export class Tombs {
  _installed = false;
  game: Game | null = null;
  nodes: TombNode[] = [];
  rpg: RpgSystem;
  /** Reused by `update`, so the per-frame anchor test allocates nothing. */
  _v = new THREE.Vector3();
  /** Throttles the anchor late-bind to a few times a second. */
  _t = 0;

  constructor(rpg: RpgSystem) { this.rpg = rpg; }

  /**
   * Resolve the ten tombs and take their prompts, once. Safe to call every
   * frame; returns true on the tick that actually did the work.
   */
  install(game: Game) {
    if (this._installed) return false;
    const ix = game?.get?.('Interaction');
    const terrain = game?.get?.('Terrain');
    if (!ix || !terrain) return false;
    this.game = game;
    this._installed = true;

    for (const site of TOMB_SITES) {
      const poi = worldMap.poiById(site.at);
      if (!poi) throw new Error(`Tombs: anchored to unknown POI ${site.at}`);
      // The crossing guard. Cheap, and it is the only thing standing between a
      // rename in `WorldMap.ts` and four kings handing out each other's arms.
      if (poi.name !== site.expect) {
        throw new Error(`Tombs: ${site.at} is named "${poi.name}", not "${site.expect}" `
          + '-- tomb ids and tomb names are crossed on purpose and this table pairs on the NAME. '
          + 'If the map was renamed deliberately, re-pair the arm here, do not just update `expect`.');
      }
      if (site.arm && !ITEMS[site.arm]) throw new Error(`Tombs: ${site.at} grants unknown weapon ${site.arm}`);
      this.nodes.push({
        site, name: poi.name, poiId: poi.id,
        pos: new THREE.Vector3(poi.x, terrain.heightAt(poi.x, poi.z), poi.z),
        anchored: false, handle: null,
        // The bag is the save state. A player who already carries the arm has
        // already been here, so there is nothing to remember separately.
        claimed: !!(site.arm && this.rpg.inventory.has(site.arm)),
      });
    }

    for (const n of this.nodes) {
      const armName = n.site.arm ? ITEMS[n.site.arm].name : null;
      n.handle = ix.register({
        id: `tomb_${n.poiId}`,
        pos: n.pos,
        radius: REACH_NEAR,
        // **Off until the coffin's position is known.** `pos` is a live
        // reference that `update` moves onto the kit's `sarcophagus` anchor the
        // first time the streamer builds the temple, and that move is 7.19 m --
        // so while it is pending, this prompt is a `Claim` verb standing over
        // seven metres of empty stylobate. `integration`'s own
        // "no prompt is offered where its subject is not" is the rule, and the
        // wide pin prompt broke it; it only escaped that row because the row
        // scans `npc_` ids and the world origin.
        //
        // It also breaks a rule the picker depends on. `Interaction._pick`
        // reads `pos` live, so a prompt that re-anchors while it is being
        // offered teleports out from under whoever walked to where it was:
        // `integration`'s "walking up to a thing selects that thing" caught
        // exactly that on `tomb_rogue` -- the bind landed inside its
        // eight-frame window, the coffin came to rest 6.05 m away and **107
        // degrees** off the approach, outside the 100-degree half-cone, and the
        // prompt vanished (`1/86 unreachable: tomb_tomb_rogue->nothing`).
        // Gating on `anchored` makes the position immutable for as long as the
        // prompt exists, which is the property the picker was written against.
        //
        // Nothing is lost in play: `PoiKits` builds a site when the camera
        // comes within `BUILD_R` = 1500 m, so the anchor lands a kilometre
        // before the player is inside 6.5 m of anything.
        enabled: () => n.anchored,
        // Wide cone for the same reason `Deposits` uses one: this is a thing
        // you walk up to and stand over, not a face you address.
        cone: 200,
        priority: 2,
        verb: n.site.arm ? 'Claim' : 'Read',
        label: n.name,
        hint: n.claimed ? 'Claimed' : armName || 'An empty plinth',
        yOffset: 2.2,
        handler: () => this.claim(n),
      });
    }
    return true;
  }

  /** Drop every handle. For tests and for a world rebuild. */
  dispose() {
    for (const n of this.nodes) if (n.handle) n.handle.dispose();
    this.nodes.length = 0;
    this._installed = false;
  }

  /** The tomb node for a POI id, or null. Used by `probes/tombclaim.mts`. */
  byPoi(poiId: string) { return this.nodes.find((n) => n.poiId === poiId) || null; }

  /**
   * Take the arm off the plinth.
   *
   * Everything here already existed and was reachable from nowhere:
   * `Inventory.add` with a `'quest'` source raises `item-gained` so the HUD and
   * the gear screen both see it, `Ascension.awardAp` pays the constellation
   * that spends it, and `Quests.notify` lets a side quest be about a tomb. The
   * `ffxv-area` card is the same one `StorySystem`'s world triggers dispatch,
   * so a tomb announces itself exactly the way arriving anywhere else does.
   */
  claim(node: TombNode) {
    const game = this.game, rpg = this.rpg;
    const hud = game?.get('HUD');
    const arm = node.site.arm;
    if (node.claimed) {
      hud?.toast?.(node.name, arm ? 'Already claimed' : 'Nothing left to take', '⚔', 'warn');
      return false;
    }
    node.claimed = true;

    if (arm) {
      const def = ITEMS[arm];
      rpg.inventory.add(arm, 1, 'quest');
      // A royal arm is worth more than finding a lay-by. `royal-arm` is its own
      // rule rather than a multiple of `discovery` so the ascension screen can
      // say what was paid for.
      rpg.ascension.awardAp('royal-arm');
      hud?.toast?.(def.name, 'Royal arm claimed', '⚔', 'quest');
    } else {
      rpg.ascension.awardAp('discovery');
      hud?.toast?.(node.name, 'Long since plundered', '⚔', 'info');
    }

    // Both verbs, because a quest may be written either way round: "reach the
    // tomb" and "bring back the arm" are the same act here.
    rpg.quests.notify('reach', { target: node.poiId });
    if (arm) rpg.quests.notify('fetch', { target: arm });

    window.dispatchEvent(new CustomEvent('ffxv-area', {
      detail: { name: node.name, sub: node.site.lore, meta: 'Royal Tomb' },
    }));

    node.handle?.set({
      verb: 'Read',
      hint: arm ? 'Claimed' : 'Empty',
    });
    return true;
  }

  /**
   * Move each prompt onto its temple's sarcophagus the first time the streamer
   * has built that temple.
   *
   * It has to be a late bind and not a table read at install: `PoiKits._make`
   * runs when the camera comes within `BUILD_R`, and the kit's yaw is random
   * per site, so at install time there is no answer to *where the coffin is* --
   * only to where the pin is. Until the anchor arrives the prompt is switched
   * off rather than parked on the pin: see `enabled` in {@link Tombs.install}
   * for the two rules the parked version broke.
   *
   * The bind is one-way and once only -- `anchored` is never cleared -- so from
   * the frame a tomb's prompt turns on, its position never moves again.
   */
  update(dt: number, game: Game) {
    if (!this._installed || !this.nodes.length) return;
    this._t += dt;
    if (this._t < 0.3) return;
    this._t = 0;
    const kits = game.get('Props')?.poiKits;
    if (!kits) return;
    for (const n of this.nodes) {
      if (n.anchored) continue;
      const a = kits.anchorAt(n.poiId, 'sarcophagus', this._v);
      if (!a) continue;
      n.pos.copy(a);
      // Last write to `pos`, and the write that turns the prompt on.
      n.anchored = true;
    }
  }
}

export default Tombs;
