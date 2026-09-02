import { SHOTS, isFollowShot, type ShotName, type Shot } from '../game/Shots.ts';
import type { Freecam } from '../dev/Freecam.ts';
import type { Game } from '../game/Game.ts';

/**
 * Shot Gallery: the framings the nightly gate judges, stood in rather than
 * rendered.
 *
 * ## What this can honestly show, and what it cannot
 *
 * `SHOTS` holds 166 framings and they are of two kinds. A **fixed** shot names
 * absolute world coordinates — a crest, a ruin, a road at dusk — and is a
 * statement about the world, which is exactly what this studio has booted. A
 * **follow** shot is framed relative to a character (`follow: 'player'`,
 * `offset`), and the studio has no characters by construction: that is the
 * whole architecture, and spawning a party to show a portrait would undo it.
 *
 * So the gallery offers the fixed shots as destinations and *lists* the follow
 * shots with the reason they are not standable. It says which it is rather than
 * quietly showing 166 rows of which a third do nothing — a gallery that lies
 * about what it can do is worse than a shorter one.
 *
 * This is also why it is not `Game.applyShot`. That method locks the world into
 * a reproducible state — scenario, dungeon, menu, story beat, HUD — through
 * systems this profile has not booted. Here a shot is a camera and an hour.
 */

/** One row, and whether it can be flown to. */
export interface GalleryShot {
  name: ShotName;
  doc: string;
  /** Band label a shell groups by: the shot name's own prefix. */
  group: string;
  /** Hour of day the shot is authored at. */
  time: number;
  fov: number;
  /** False for a `follow` shot; `why` says so. */
  standable: boolean;
  why?: string;
}

/**
 * The prefix a shot name is grouped under.
 *
 * From the name rather than a hand-written table: the corpus is organised by
 * these prefixes already (`hero_*`, `vista_*`, `landmark_*`, `hud_*`), and a
 * second list of them would be one more thing to keep in step with a file that
 * grows every week.
 */
function bandOf(name: string): string {
  const cut = name.indexOf('_');
  const head = cut > 0 ? name.slice(0, cut) : name;
  return head.charAt(0).toUpperCase() + head.slice(1);
}

export class ShotGallery {
  game: Game;
  cam: Freecam;
  /** The shot last stood in, for a shell to mark as current. */
  at: ShotName | null;

  constructor(game: Game, cam: Freecam) {
    this.game = game;
    this.cam = cam;
    this.at = null;
  }

  /** Every framing, standable ones first inside each band. */
  shots(): GalleryShot[] {
    const out: GalleryShot[] = [];
    for (const name of Object.keys(SHOTS) as ShotName[]) {
      const s: Shot = SHOTS[name];
      if (!s) continue;
      const follow = isFollowShot(s);
      out.push({
        name,
        doc: s.doc || '',
        group: bandOf(name),
        time: s.time,
        fov: s.fov,
        standable: !follow,
        why: follow ? `framed on ${s.follow} — no characters in the studio` : undefined,
      });
    }
    out.sort((a, b) => (a.group === b.group
      ? (Number(b.standable) - Number(a.standable)) || a.name.localeCompare(b.name)
      : a.group.localeCompare(b.group)));
    return out;
  }

  /**
   * Put the camera where the shot stands, at the hour it is authored at.
   *
   * `jump` rather than a position write, for the reason `WorldExplorer.arrive`
   * gives: TAA history and the DOF focus integrator both smear across a
   * teleport, exactly as `CameraRig._cut()` handles for an authored shot.
   */
  stand(row: GalleryShot): boolean {
    const s = SHOTS[row.name];
    if (!s || isFollowShot(s)) return false;
    const sky = this.game.get('Sky');
    if (sky && sky.setTimeOfDay) sky.setTimeOfDay(s.time);
    this.cam.setEnabled(true, this.game.camera);
    this.cam.fov = s.fov;
    this.cam.jump([s.pos[0], s.pos[1], s.pos[2]], this.game.post);
    this.cam.lookAt(s.target[0], s.target[1], s.target[2]);
    this.at = row.name;
    return true;
  }

  /** How many of the 166 this profile can actually stand in. */
  counts(): { total: number, standable: number } {
    const all = this.shots();
    return { total: all.length, standable: all.filter((s) => s.standable).length };
  }
}
