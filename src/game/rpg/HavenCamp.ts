/**
 * Camping at a haven — FFXV's signature loop, and the last piece of it that
 * had no way in.
 *
 * Every number this needs already existed: `DayCycle.rest()` rolls the clock,
 * `ExpBank.redeem()` cashes the bank at the lodging's multiplier and levels the
 * party, `PartyState.cook()` turns ingredients into a meal buff, and
 * `Ascension` pays AP for a night under the stars. What was missing was the
 * door — all twelve registered interactables were inside Hammerhead, so
 * `rpg.camp()` was a method nothing in the game ever called.
 *
 * This registers one at every haven on the map. It lives in `src/game/rpg/` and
 * is driven from `RpgSystem`'s own tick rather than being a registered system,
 * because `Interaction` boots six systems *after* `Rpg`: the handles cannot be
 * taken during `init()`, so they are taken on the first frame instead.
 */

import { HAVENS } from './DayCycle.ts';
import type { Haven } from './DayCycle.ts';
import type { Recipe } from './PartyState.ts';
import type { RpgSystem, CampResult } from './RpgSystem.ts';
import type { Game } from '../Game.ts';
import type { InteractableHandle } from '../interaction/Interactables.ts';

/** Wake time after a night at a haven — FFXV puts you out at first light. */
const WAKE_HOUR = 6.5;
/** How many of Ignis' currently-cookable recipes the camp menu offers. */
const MENU_SIZE = 5;

export class HavenCamp {
  /** One per haven, from `Interaction.register`. Dropped by `dispose`. */
  _handles: InteractableHandle[] = [];
  _installed = false;
  rpg: RpgSystem;
  /** Set by `install`, so `open` can reach `Interaction` and the HUD. */
  game: Game | null = null;

  constructor(rpg: RpgSystem) { this.rpg = rpg; }

  /**
   * Take the interaction handles, once, on the first tick that finds an
   * `Interaction` system. Safe to call every frame.
   */
  install(game: Game) {
    if (this._installed) return false;
    const ix = game?.get?.('Interaction');
    if (!ix) return false;
    this.game = game;
    this._installed = true;
    for (const h of HAVENS) {
      this._handles.push(ix.register({
        id: `haven_${h.id}`,
        pos: [h.pos[0], h.pos[1] || 0, h.pos[2]],
        // Generous next to a shop counter, because a haven is a place you walk
        // onto rather than a face you stand in front of, and the rune ring is
        // several metres across. The wide cone is for the same reason.
        radius: 7,
        cone: 220,
        priority: 2,
        verb: 'Camp',
        label: h.name,
        hint: 'Rest, cook and bank your EXP',
        yOffset: 1.6,
        handler: () => this.open(h),
      }));
    }
    return true;
  }

  /** Drop every handle. For tests and for a world rebuild. */
  dispose() {
    for (const h of this._handles) if (h && h.dispose) h.dispose();
    this._handles.length = 0;
    this._installed = false;
  }

  /**
   * The camp conversation: cook, sleep, wait out the night, or leave. A
   * dialogue rather than a screen, because the interaction layer already owns
   * dialogue and because the content that matters here is the numbers — banked
   * EXP, the multiplier, who levelled — not a layout.
   *
   * `Dialogue` renders a choice's `label` and `note` as plain text, so the menu
   * is built from the bag as it stands when the camp opens. Nothing can spend
   * an ingredient while the conversation is up.
   */
  open(haven: Haven) {
    const rpg = this.rpg;
    const game = this.game;
    const ix = game?.get?.('Interaction');
    if (!ix) return;
    rpg.day.discoverHaven(haven.id);

    /**
     * What the night did, read back by the `slept` and `failed` lines.
     * `CampResult` is the refusal union too, which is why every read below
     * narrows on `ok` or on `exp` before it touches a field.
     */
    let result: CampResult | { ok: true, exp: null } | null = null;
    let cookedName: string | null = null;

    const recipes = rpg.party.cookableNow(rpg.inventory).slice(0, MENU_SIZE);
    const havenBonus = (rpg.tables.lodgings?.haven?.bonus ?? 1)
      + (rpg.ascension.value('havenExpBonus') || 0);

    const sleep = (recipeId: string | null) => {
      const r = recipes.find((x: Recipe) => x.id === recipeId);
      cookedName = r ? r.name : null;
      result = rpg.camp({
        lodging: 'haven',
        pos: { x: haven.pos[0], z: haven.pos[2] },
        recipe: recipeId || undefined,
        wakeHour: WAKE_HOUR,
      });
      if (!result || result.ok === false) { cookedName = null; return 'failed'; }
      const hud = game?.get?.('HUD');
      if (hud && hud.areaTitle) {
        hud.areaTitle(String(haven.name).toUpperCase(), 'Haven', `Dawn · Day ${rpg.day.day}`);
      }
      return 'slept';
    };

    const waitOut = () => {
      const hours = ((WAKE_HOUR - rpg.day.hour) + 24) % 24 || 24;
      rpg.day.wait(hours, { party: rpg.party });
      result = { ok: true, exp: null };
      return 'slept';
    };

    ix.say({
      speaker: haven.name,
      role: 'Haven',
      hue: 205,
      start: 'arrive',
      nodes: {
        arrive: {
          lines: () => {
            const b = Math.round(rpg.expBank.banked || 0);
            const first = 'The runes take the light and hold it. Nothing walks onto a haven '
              + 'that was not invited.';
            return b > 0
              ? [first, `${b.toLocaleString()} EXP nobody has slept on yet. A night here cashes it at ×${havenBonus.toFixed(1)}.`]
              : [first, 'Nothing banked to sleep on — but the sun will come up on better country than this.'];
          },
          next: 'menu',
        },

        menu: {
          lines: 'What is the plan?',
          choices: [
            {
              label: 'Ask Ignis to cook', note: `${recipes.length} recipes`,
              when: () => recipes.length > 0,
              next: 'cook',
            },
            {
              label: 'Nothing worth cooking', note: 'no ingredients',
              when: () => recipes.length === 0,
              next: 'nocook',
            },
            { label: 'Turn in for the night', note: 'wake at first light', action: () => sleep(null) },
            { label: 'Wait until morning', when: () => rpg.day.isNight, action: () => waitOut() },
            { label: 'Not yet', end: true },
          ],
        },

        nocook: {
          lines: 'Ignis turns the bag out and shakes his head. "We are short of everything '
            + 'worth cooking. The road will provide, eventually."',
          next: 'menu',
        },

        cook: {
          speaker: 'Ignis',
          role: 'Tactician',
          hue: 268,
          lines: () => {
            // Say what is already running, because `cook` replaces the active
            // meal outright: the seeded save wakes up on a Lucian Tomato Stew
            // (+600 HP, +25 Vitality) and Cup Noodles is a *downgrade* from it.
            // A menu that prints only a rank cannot tell you that.
            const cur = rpg.party.activeBuffs.find((b) => b.kind === 'meal');
            const head = `Cooking level ${rpg.party.cookingLevel}. "I've come up with a few things."`;
            return cur
              ? [head, `Currently running: ${cur.name} — ${(cur.recipe?.effects || []).join(', ') || 'no effect'}. A new meal replaces it.`]
              : [head];
          },
          choices: [
            ...recipes.map((r: Recipe) => ({
              label: r.name,
              // What the meal is worth, not what rank it is. This is the whole
              // decision the camp asks the player to make.
              note: r.effects.join(', ') || `rank ${r.rank}`,
              action: () => sleep(r.id),
            })),
            { label: 'On second thought', next: 'menu' },
          ],
        },

        slept: {
          lines: () => {
            const exp = result && 'exp' in result ? result.exp : null;
            const ups = exp
              ? exp.perMember.filter((m) => m.to > m.from).map((m) => `${m.name} ${m.from} → ${m.to}`)
              : [];
            const head = cookedName
              ? `${cookedName}, then sleep. Morning, day ${rpg.day.day}.`
              : `Morning, day ${rpg.day.day}.`;
            const banked = exp
              ? (exp.total > 0
                // `base` is the unmultiplied bank and is optional on
                // `ExpRedemption`; fall back to dividing the payout out again.
                ? `${Math.round(exp.base ?? exp.total / (exp.bonus || 1)).toLocaleString()} EXP at ×${exp.bonus.toFixed(1)} — ${exp.total.toLocaleString()} to each of you.`
                : 'Nothing banked to redeem.')
              : 'You sat out the dark. Nothing banked.';
            return [head, banked, ups.length ? ups.join(' · ') : 'Nobody levelled — the road is longer than that.'];
          },
          next: null,
        },

        failed: {
          lines: () => `Something is wrong with this campsite. (${(result && 'reason' in result && result.reason) || 'unknown'})`,
          next: null,
        },
      },
    });
  }
}

export default HavenCamp;
