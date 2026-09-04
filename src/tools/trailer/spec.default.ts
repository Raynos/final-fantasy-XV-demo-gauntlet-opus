import type { TrailerSpec } from './types.ts';

/**
 * The 30-second trailer, as takes.
 *
 * ## The cut is built on the score's own bar grid, not on a chosen BPM
 *
 * `Themes.ts` gives every music state its own tempo -- field 74, tension 66,
 * combat 152, boss 138, victory 132, all 4/4. `Score.nextBarTime` is writable,
 * so starting the render at **t0 = 0.5204** and running the plan
 * `field x1, tension x1, combat x8, boss x4, victory` lands the state changes
 * at **7.4000 / 20.0316 / 26.9881 s** -- the three act breaks, to a hundredth,
 * with no tempo override anywhere. Every `at` below is a half-bar of the state
 * it falls in, so a cut is always on a kick and usually on a brass stab too.
 *
 * Two positions in the grid are worth more than the others and are spent
 * deliberately: absolute bar 8 (**16.8737**) is the combat act's only crash
 * cymbal, and it carries the armiger; and the victory downbeat (**26.9881**)
 * lands on the tonic major, which is where the logo arrives.
 *
 * ## Why Act II is re-timed to dusk
 *
 * The combat shots are authored at `time: 15.5`, which is flat overhead light
 * -- and the party read as mannequins under it, because nothing is rimming
 * them. The same fight at 19.5-20.5 is a different game: the warp shards and
 * the dash streak become the only bright thing in frame and everything else
 * goes to silhouette. It also covers the build's judged weakness, asset finish,
 * which is a daylight problem.
 *
 * ## Two shots that look like they belong here and do not
 *
 * - **No Titan.** `Shots.ts` documents that a moving camera shows him unlit and
 *   three metres under the terrain, which is why no `setpiece_titan` exists.
 *   Act III is the authored Astral scene instead, which stages the awakening as
 *   effect on the world and never needs the model.
 * - **No `setpiece_deadeye`.** Despite the name it contains no boss; it is the
 *   Nebulawood area card.
 *
 * `dur` is the RECORDED length and is deliberately ~1 s longer than the cut
 * needs, so the edit can slide an in-point to land the action on the beat.
 */
/**
 * Late golden hour, not night.
 *
 * The corpus authors combat at 15.5 -- flat overhead light that makes the party
 * read as mannequins -- so the first pass moved it to 19.9, where the warp
 * shards were the only bright thing in frame and everything else fell to
 * silhouette. That looked superb, and it was an artefact: `Director` had PINNED
 * the VFX clock, so a big frozen cyan burst sat in the middle of every shot
 * lighting it.
 *
 * With the clock actually running there is no permanent burst, and 19.9 is just
 * dark -- an act of murky blue-black frames with the subject barely legible.
 * 18.2 keeps the raking warm key and the long shadows that make the silhouettes
 * read, and still lets the cyan VFX pop against it.
 */
const DUSK = 18.2;

export const SPEC: TrailerSpec = {
  version: 1,
  clips: [
    /* ---- Act I: the world. 0.0 - 7.40, score `field` then `tension` ---- */
    {
      id: 'a1-dawn', dur: 4.4, shot: 'vista_dawn', settle: 2.0,
      doc: 'Cold open. Insomnia on the skyline behind the fog sea.',
      // A slow push toward the city, rising a little: the whole premise in one move.
      move: { from: [0, 0, 0], to: [-14, 2.5, 10], handheld: 0.06, breathe: 0.5, ease: 'inOutSine' },
    },
    {
      id: 'a2-road', dur: 3.2, shot: 'regalia_cruise', settle: 1.5,
      // NOT `live`. The Regalia is placed by the posed scenario, and handing the
      // world back to the live encounter loop drives it out of the framing --
      // the first take of this was three seconds of empty badlands.
      doc: 'The Regalia on Route 1, low and long.',
      move: { from: [0, 0, 0], to: [2.5, 0.4, -1.5], handheld: 0.25, breathe: 0.7 },
    },
    {
      id: 'a3-dusk', dur: 3.2, shot: 'galdin_pier_sunset', settle: 1.5,
      doc: 'Last calm frame before the turn.',
      move: { from: [0, 0, 0], to: [8, 1.2, 0], handheld: 0.1, breathe: 0.6, ease: 'outSine' },
    },

    /* ---- Act II: combat. 7.40 - 20.03, score `combat` at 152 bpm ----
     *
     * These are DRIVEN, not posed. Every clip carries `unpin` and real held
     * input, because `Director.setScenario` does not just build a tableau, it
     * holds one: it pins the VFX clock, sets `combat.scenarioLock` so
     * `CombatSystem.update` returns immediately, and copies the player's
     * position back out of `_frozenPlayer` every frame. Measured on the first
     * build of this trailer, a `warp_strike` take moved the VFX clock 0.00 s
     * and every one of 26 enemies 0.00 m over two seconds. It was a photograph
     * with a camera move on it -- and it is why six clips read as the same
     * cyan arc: it was the same arc, pinned.
     *
     * None of these set `move`, deliberately. A `follow:` shot leaves
     * `CameraRig.followShot` driving, which is the real gameplay chase camera
     * -- spring arm, velocity look-ahead, speed-reactive FOV, trauma shake. A
     * world-space dolly would freeze the camera in place while the fight ran
     * out from under it, which is the opposite of what this act is for.
     */
    {
      id: 'b1-warp', dur: 3.0, shot: 'warp_strike', time: DUSK,
      live: true, unpin: true, settle: 1.8,
      doc: 'Warp-strike, driven: run in, then strike.',
      input: [{ at: 0, keys: ['KeyW'] }, { at: 0.5, keys: ['KeyW', 'KeyQ'] }, { at: 1.0, keys: ['KeyQ'] }],
      timeScale: [{ t: 0, s: 1 }, { t: 0.9, s: 0.35 }, { t: 1.7, s: 0.35 }, { t: 2.3, s: 1 }],
    },
    {
      id: 'b2-warpwide', dur: 2.8, shot: 'warp_wide', time: DUSK,
      live: true, unpin: true, settle: 1.5,
      doc: 'The same verb, wider, with the fight running.',
      input: [{ at: 0, keys: ['KeyW', 'ShiftLeft'] }, { at: 1.2, keys: ['KeyQ'] }],
    },
    {
      id: 'b3-fire', dur: 2.0, shot: 'combat_magic_fire', time: DUSK,
      live: true, unpin: true, settle: 1.5,
      doc: 'Elemancy mid-fight.',
      input: [{ at: 0, keys: ['KeyW'] }, { at: 0.4, keys: ['Digit1'] }, { at: 0.9, keys: [] }],
    },
    {
      id: 'b4-ice', dur: 2.0, shot: 'combat_magic_ice', time: DUSK,
      live: true, unpin: true, settle: 1.5,
      doc: 'Blizzard on the flank, frost spreading over the dirt.',
      input: [{ at: 0, keys: ['Digit2'] }, { at: 0.5, keys: [] }],
    },
    {
      id: 'b5-stagger', dur: 2.0, shot: 'combat_stagger', time: DUSK,
      live: true, unpin: true, settle: 1.5,
      doc: 'A combo landing and something going off its feet.',
      input: [{ at: 0, keys: ['KeyW'] }, { at: 0.3, keys: ['Space'] }, { at: 1.4, keys: [] }],
    },
    {
      id: 'b6-imperial', dur: 2.8, shot: 'boss_imperial', time: DUSK,
      live: true, unpin: true, settle: 2.2,
      doc: 'MA-X Cuirass, live rather than posed mid-telegraph.',
      input: [{ at: 0, keys: ['KeyW'] }, { at: 1.0, keys: ['Space'] }, { at: 2.0, keys: [] }],
    },
    {
      id: 'b7-daemons', dur: 2.8, shot: 'daemon_night',
      live: true, unpin: true, settle: 1.8,
      doc: 'Night, and the things that come out in it.',
      input: [{ at: 0, keys: ['KeyW'] }, { at: 1.4, keys: ['Space'] }],
    },
    {
      id: 'b8-hud', dur: 2.0, shot: 'combat_hud', time: DUSK,
      live: true, unpin: true, hud: true, dom: true, settle: 1.5,
      doc: 'The one clip that keeps the HUD: this is a game you play.',
      input: [{ at: 0, keys: ['KeyW'] }, { at: 0.4, keys: ['Space'] }],
    },
    {
      id: 'b9-armiger', dur: 2.8, shot: 'combat_armiger', time: DUSK,
      live: true, unpin: true, settle: 1.8,
      doc: 'Armiger up. Lands on the act\u2019s only crash cymbal.',
      input: [{ at: 0, keys: ['KeyW'] }, { at: 0.5, keys: ['Space'] }, { at: 1.8, keys: [] }],
    },
    {
      id: 'b10-storm', dur: 2.0, shot: 'storm', settle: 1.5,
      doc: 'Lightning with its real scene relight. Weather, not a fight.',
      move: { from: [0, 0, 0], to: [5, 0.5, 2], handheld: 0.3, breathe: 0.7 },
    },
    {
      id: 'b11-wide', dur: 2.0, shot: 'combat_wide', time: DUSK,
      live: true, unpin: true, settle: 1.5,
      doc: 'Last look at the fight before the dip to black.',
      input: [{ at: 0, keys: ['KeyW', 'ShiftLeft'] }, { at: 1.0, keys: ['Space'] }],
    },

    /* ---- Act III: the Astral. 20.03 - 26.99, score `boss` ---- */
    {
      id: 'c1-disc', dur: 2.8, shot: 'lest_overlook_disc', settle: 2.0,
      doc: 'The Disc of Cauthess, 210 m rim, wide and held.',
      move: { from: [0, 0, 0], to: [-10, 1.5, 6], handheld: 0.12, breathe: 0.5, ease: 'inOutSine' },
    },
    {
      id: 'c2-astral', dur: 6.2, shot: 'cine_astral', settle: 2.0, dom: true,
      doc: 'The authored awakening. Camera is the cutscene’s -- no move of ours.',
    },

    /* ---- Act IV: the card. 26.99 - 30.0, score `victory` ---- */
    {
      id: 'd1-title', dur: 3.6, shot: 'menu_title', settle: 1.5, dom: true,
      doc: 'The crest draws itself, then the type arrives. The menu does not appear until 2.8 s.',
    },
  ],
};

export default SPEC;
