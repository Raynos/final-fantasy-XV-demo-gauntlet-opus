import * as THREE from 'three';
import { worldMap } from '../../world/map/WorldMap.ts';
import type { Game } from '../Game.ts';
import type { InteractableHandle } from '../interaction/Interactables.ts';

/**
 * Lore plaques: the three places in Lucis that have something to say.
 *
 * `Tombs.ts` gave ten destinations a *reward*; this gives three of them a
 * *voice*, which is the cheaper half and the one the world was missing. A
 * landmark you can walk up to and read is the difference between scenery and a
 * place, and the plan's task 65 named exactly three: the ghost town at Saxham,
 * the bone country past Ravenscrag, and the milestones on the old pilgrim road.
 *
 * The shape is deliberately the smallest thing that works — an `ix.register`
 * with a `Read` verb whose handler is one `ix.say` — because a plaque that
 * needs a dialogue tree is an NPC, and an NPC is `NpcCast`'s problem. Every
 * line here is a *found object*: a notice, a hunter's scrawl, an inscription
 * nobody alive can finish reading. Nothing in this file addresses the player
 * directly, and that is the register the FFXV world signs are written in.
 *
 * Installed lazily off `RpgSystem.update`'s first tick, exactly like
 * {@link Tombs}: `Interaction` and `Terrain` do not exist at `init` and a
 * table read there would resolve every position against a heightfield that has
 * not been built.
 */

/** One plaque: where it stands, what it says. */
interface PlaqueSite {
  /** POI id in `WorldMap`; unknown throws at install. */
  at: string;
  /** Who is speaking, in the sense that a sign speaks. */
  speaker: string;
  role: string;
  /** Speech-bubble hue, degrees. */
  hue: number;
  /** Prompt label under the reticle. */
  label: string;
  hint: string;
  /** Metres out from the pin the prompt reaches. */
  radius: number;
  lines: string[];
}

const PLAQUE_SITES: PlaqueSite[] = [
  {
    at: 'saxham',
    speaker: 'Notice', role: 'Saxham Outpost', hue: 42,
    label: 'Evacuation Notice', hint: 'Saxham Outpost',
    radius: 9,
    lines: [
      'CROWN CITY ORDER 114 — SAXHAM OUTPOST IS CLOSED. All residents to '
      + 'assemble at the Longwythe Rest Area for transport. Livestock may not '
      + 'be brought aboard.',
      'The date has been scratched out and written over four times. Under the '
      + 'last one, in charcoal: "no transport came. gone north on foot. '
      + '— B."',
    ],
  },
  {
    at: 'adamantoise_graveyard',
    speaker: 'Marker', role: 'The Bone Country', hue: 36,
    label: "Hunter's Marker", hint: 'The Adamantoise Graveyard',
    radius: 14,
    lines: [
      'A steel stake driven into the pan, with a bounty slate wired to it. '
      + 'MELDACIO HUNTER HQ — ADAMANTOISE. NO RANK. DO NOT ENGAGE ALONE.',
      'Someone has added, in a hand that shook: "counted nine. nine of them '
      + 'came here to die and something still killed the tenth."',
      'The ribs above you throw a shadow across the whole slate.',
    ],
  },
  {
    at: 'threshold_stones',
    speaker: 'Inscription', role: 'Solheim', hue: 200,
    label: 'The Threshold Stones', hint: 'Solheim milestones',
    radius: 11,
    lines: [
      'The face of the gate stone is cut with a script that predates Lucian by '
      + 'two thousand years. Most of it has weathered off. Four glyphs have not.',
      'Ignis reads them aloud twice before he will translate: "TRAVELLER. THE '
      + 'ROAD ENDS. THE KING GOES ON."',
      'Gladio: "Cheerful lot."',
    ],
  },
];

export class Plaques {
  _installed = false;
  handles: InteractableHandle[] = [];

  /**
   * Resolve the three plaques and take their prompts, once. Safe to call every
   * frame; returns true on the tick that actually did the work.
   */
  install(game: Game) {
    if (this._installed) return false;
    const ix = game?.get?.('Interaction');
    const terrain = game?.get?.('Terrain');
    if (!ix || !terrain) return false;
    this._installed = true;

    for (const site of PLAQUE_SITES) {
      const poi = worldMap.poiById(site.at);
      if (!poi) throw new Error(`Plaques: anchored to unknown POI ${site.at}`);
      this.handles.push(ix.register({
        id: `plaque_${poi.id}`,
        pos: new THREE.Vector3(poi.x, terrain.heightAt(poi.x, poi.z), poi.z),
        // Wide, and a wide cone with it, for the same reason `Tombs` and
        // `Deposits` are wide: the pin is the centre of a thirty-metre
        // composition and the plaque is a thing you stand in front of, not a
        // face you address.
        radius: site.radius, cone: 200, priority: 1,
        verb: 'Read', label: site.label, hint: site.hint,
        yOffset: 1.8,
        handler: () => ix.say({
          speaker: site.speaker, role: site.role, hue: site.hue,
          start: 'a',
          nodes: { a: { lines: site.lines, next: null } },
        }),
      }));
    }
    return true;
  }

  /** Drop every handle. For tests and for a world rebuild. */
  dispose() {
    for (const h of this.handles) h.dispose();
    this.handles.length = 0;
    this._installed = false;
  }
}

export default Plaques;
