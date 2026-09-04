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

/**
 * The aspect every framing in `Shots.ts` was composed at.
 *
 * Not a preference — it is what the corpus IS. `shoot.mts` captures at
 * 1600x900 and `framecheck` judges all 166 there, so a shot's `fov` was chosen
 * by somebody looking at a 16:9 frame. @see letterbox
 */
const AUTHORED_ASPECT = 16 / 9;

/**
 * Fit a 16:9 framing into a viewport that is narrower than 16:9.
 *
 * ## The bug this exists for
 *
 * three.js's `PerspectiveCamera.fov` is the **vertical** angle. `stand()` used
 * to assign `s.fov` verbatim, which on a 16:9 screen is the composition and on
 * a portrait phone is a different picture entirely: the vertical angle is
 * held and the horizontal field collapses with the aspect. At 9:19.5 that is
 * about a third of the width the shot was framed for.
 *
 * Reported as "a bunch of the shots don't feel good", and `lest_market_day` is
 * the proof. Its `doc` promises "stalls, awnings and the city out shopping";
 * at 16:9 it delivers both awnings, a dozen NPCs and the festoon. On a portrait
 * phone every one of those is outside the frame and what is left is an empty
 * plaza with two lamps floating in it. The caption was never wrong — the crop
 * was.
 *
 * ## Why letterbox rather than widen
 *
 * Preserving the horizontal field by blowing the vertical one out is the other
 * obvious fix and it is worse here: at 9:19.5 it needs a vertical fov past
 * 110 degrees, and every frame becomes mostly sky and mostly ground with the
 * subject small in the middle. A gallery of framings should show the framing.
 * So the camera is widened to carry the full authored width, and the extra it
 * necessarily renders above and below is covered by two bars — the picture
 * inside them is exactly the one the nightly gate judges.
 *
 * Wider-than-16:9 viewports are left alone deliberately. There the authored
 * vertical angle already yields *more* horizontal context than the corpus
 * frame, which is extra rather than missing, and every desktop capture and
 * every gate that reads one keeps the framing it has always had.
 *
 * @returns the vertical fov to set, and the height in px of ONE bar (0 when
 * the viewport is 16:9 or wider, which is the no-op case).
 */
export function letterbox(fov: number, w: number, h: number): { fov: number, bar: number } {
  if (!(w > 0) || !(h > 0)) return { fov, bar: 0 };
  const aspect = w / h;
  if (aspect >= AUTHORED_ASPECT) return { fov, bar: 0 };
  const rad = (d: number) => (d * Math.PI) / 180;
  const deg = (r: number) => (r * 180) / Math.PI;
  // The authored horizontal half-angle, then the vertical fov that reproduces
  // it at this aspect. Widening vertically is what keeps the sides.
  const halfH = Math.atan(Math.tan(rad(fov) / 2) * AUTHORED_ASPECT);
  const fitted = deg(2 * Math.atan(Math.tan(halfH) / aspect));
  // The 16:9 window is as wide as the viewport, so its height follows, and
  // what is left over splits evenly above and below.
  const bar = Math.max(0, (h - w / AUTHORED_ASPECT) / 2);
  return { fov: fitted, bar };
}

export class ShotGallery {
  game: Game;
  cam: Freecam;
  /** The shot last stood in, for a shell to mark as current. */
  at: ShotName | null;
  /** The shot's own authored fov, before {@link letterbox} widened it. */
  _authoredFov: number;

  constructor(game: Game, cam: Freecam) {
    this.game = game;
    this.cam = cam;
    this.at = null;
    this._authoredFov = 0;
  }

  /**
   * Re-fit the standing shot to the viewport, and say how tall a bar is.
   *
   * Called on every frame the gallery is open rather than once at `stand()`:
   * a rotate changes the aspect without going near this class, and a framing
   * that is only correct until the phone turns is not correct. Two `atan`s a
   * frame next to a full scene render is not a cost worth caching around.
   */
  reframe(w: number, h: number): number {
    if (!this._authoredFov) return 0;
    const fit = letterbox(this._authoredFov, w, h);
    this.cam.fov = fit.fov;
    return fit.bar;
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
    this._authoredFov = s.fov;
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
