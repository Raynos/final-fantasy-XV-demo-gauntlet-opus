/**
 * WHO DRAWS ON TOP OF WHOM, AND WHO IS ALLOWED TO DRAW *THERE*.
 *
 * Four separate reports this session were the same defect wearing four hats:
 *
 *  - the first-run hint card parked across the column headers of all six
 *    full-screen screens and the camp meal menu — "it's the first thing I did
 *    (press H, as the game told me) and it was already broken";
 *  - a live `Claim` prompt **completely hidden** behind that same card in both
 *    tomb frames, with a `COEURL / VICTORY` banner landing there too;
 *  - nameplates, toasts and damage numbers overprinting at 5-8 enemies;
 *  - title cards reading as giant overlapping watermarks across the frame.
 *
 * Every one of them is two elements that were each positioned correctly on
 * their own. Nothing in this UI has ever been able to ask *is anything else
 * already there* — every overlay is a hand-placed constant in the same centre
 * column (`.hint` top 112px, `.callout` top 22%, `.areacard` and `.chapcard`
 * both top 40%, `.victory` top 33%, `.levelup` top 30%) with no arbitration
 * whatsoever. So this file is the arbitration, and it is deliberately two
 * small things rather than a layout engine:
 *
 * **1. `LAYER` — the ladder.** One list of who is above whom, with the reason
 * written down, so the next person to add an overlay picks a rung instead of a
 * number. `ui.css` reads these values; they are stated here because the ladder
 * is a design decision and a stylesheet is a bad place to keep one.
 *
 * **2. `bands` — occupancy.** A claim register for the few screen regions that
 * more than one system wants. It is not a solver: it will not lay anything
 * out. It answers exactly one question — *may I draw here* — and the loser
 * yields by its own rules, because what a losing element should do is specific
 * to that element (a hint suspends and comes back; a title card queues; a
 * banner is simply not shown).
 *
 * ### The rule the whole thing exists to state
 *
 * **A full-screen screen owns the reading band, and nothing above it may draw
 * inside that band.** The hint card broke this six times for one reason: it
 * lives above the menus on purpose (so a "how do I get out of here" card could
 * be read over a screen), and having won the z-fight it then had nothing to
 * stop it landing on the content. Being on top is permission to be *seen*, not
 * permission to be *anywhere*.
 */

/**
 * The stacking ladder for `src/ui`.
 *
 * The values here are the ones `ui.css` sets. Three roots outside `src/ui`
 * share the same `#ui` stacking context and are listed as facts, not as
 * settings — this file does not own them:
 *
 *   `#interact`, `#dialogue`  z 2   `src/game/interaction/interact.css.ts`
 *   `#fishing`               z 3   `src/game/fishing/fishing.css.ts`
 *   `#cine`                  z 4   `src/game/cinematics/cinematics.css`
 *   `#title`                 z 6   `src/game/cinematics/cinematics.css`
 *   dungeon portal fader     z 40  `src/world/dungeons/kit/Portal.ts`
 *
 * `#menus` used to be 2, which **tied** with `#interact`, so a full-screen
 * screen and a world-anchored prompt were separated by nothing but the order
 * `Game.ts` happened to append them in — and the prompt won. `InteractPrompt`
 * hides itself while a menu is open, so that never showed; it was one line
 * from showing. Everything from `menu` up moved a rung to break the tie.
 */
export const LAYER = {
  /** The field HUD: four corners, compass, party, prompt strip. */
  hud: 1,
  /** Full-screen screens. Above the world-anchored prompt at 2. */
  menu: 3,
  /** Vignette, flash, title card, level-up, victory. Above the menu, because a hit flash is about the whole frame. */
  screenFx: 4,
  /** First-run teaching cards. The top of this file's ladder, and see `bands`. */
  hint: 5,
} as const;

/**
 * The screen regions more than one system wants, at the 1600x900 authoring
 * size. These are documentation of what the CSS already does — they are not
 * applied to anything — so that a claim reads as a place rather than a word.
 */
export const BAND_PX = {
  /** Title rule to footer legend: everything a full-screen screen may use. */
  reading: [150, 812],
  /** Top-centre teaching / announcement strip. `.hint` lives at 112..~215. */
  notice: [96, 260],
  /** The big centred beats: title card, victory, level-up. */
  feature: [260, 480],
} as const;

/** A region of the screen that only one thing may occupy at a time. */
export type BandName = keyof typeof BAND_PX;

/**
 * How badly each claimant needs its band. Higher wins; ties go to whoever
 * claimed first, which is the right tiebreak for a UI — the thing already on
 * screen is the thing the player is already reading.
 *
 * These are one table on purpose. A priority that lives next to the code that
 * claims it is a number nobody can compare against the others, and the whole
 * failure above is elements that could not see each other.
 */
export const PRIORITY = {
  /** Teaching. Always yields: it fires once, it can fire later. */
  hint: 10,
  /** Where you are. Yields to a fight, because a fight is happening to you. */
  areaCard: 30,
  /** BLINDSIDE / STAGGER. Transient and load-bearing. */
  callOut: 40,
  /** LEVEL 28. */
  levelUp: 50,
  /** The end of a fight. Nothing outranks it in its band. */
  victory: 60,
  /** A full-screen screen, or a conversation. It IS the screen. */
  screen: 100,
} as const;

/**
 * Who currently occupies which band.
 *
 * Deliberately not reactive and deliberately not a layout pass: a claimant
 * calls `claim` when it appears and `release` when it goes, and asks `free`
 * before it draws. Claims are idempotent, so calling `claim` every frame from
 * an `update` is fine and is the expected usage for anything whose visibility
 * is a per-frame decision.
 */
export class Bands {
  /** band -> key -> priority, in claim order. */
  _at: Map<BandName, Map<string, number>>;
  constructor() {
    this._at = new Map();
  }

  /** Take a band. Repeat calls with the same key are a no-op. @param key a stable name for the claimant */
  claim(band: BandName, key: string, priority: number) {
    let m = this._at.get(band);
    if (!m) { m = new Map(); this._at.set(band, m); }
    if (m.get(key) === priority) return;
    m.set(key, priority);
  }

  /** Give a band back. */
  release(band: BandName, key: string) {
    const m = this._at.get(band);
    if (m) m.delete(key);
  }

  /** The highest-priority claimant of a band, or null. */
  owner(band: BandName): string | null {
    const m = this._at.get(band);
    if (!m || !m.size) return null;
    let best: string | null = null, bestP = -Infinity;
    for (const [k, p] of m) if (p > bestP) { best = k; bestP = p; }
    return best;
  }

  /**
   * May `key` draw in `band`? True when it owns the band or nobody does.
   *
   * A claimant that has not claimed still gets an honest answer, so a
   * read-only consumer (`is anything up right now?`) does not have to
   * participate.
   */
  free(band: BandName, key: string): boolean {
    const o = this.owner(band);
    return o === null || o === key;
  }

  /** Forget everything — the harness resets the UI between captures. */
  reset() { this._at.clear(); }
}

/** The one register. UI is a singleton; pretending otherwise buys nothing. */
export const bands = new Bands();

/**
 * Do two screen rectangles overlap, with a margin?
 *
 * `DOMRect`s from different roots are comparable because every UI root is
 * positioned against the same viewport — `zoom` is already baked into what
 * `getBoundingClientRect` returns, which is exactly why this is the only
 * honest way to ask whether a zoomed HUD element and an unzoomed one collide.
 *
 * @param pad extra clearance in screen px
 */
export function hits(a: DOMRect, b: DOMRect, pad: number = 0): boolean {
  return a.left - pad < b.right && a.right + pad > b.left
    && a.top - pad < b.bottom && a.bottom + pad > b.top;
}
