import type { HUD } from './HUD.ts';
import type { Game } from '../game/Game.ts';
import type { QuestUpdate } from '../game/rpg/Quests.ts';
import type { RestSummary } from '../game/rpg/DayCycle.ts';
import type { AscensionNode } from './GameData.ts';
/**
 * Every event in the game, plugged into the HUD.
 *
 * Two publishers exist and neither had a subscriber before this file:
 *
 *  - `CombatSystem` mirrors `damage`, `hit`, `lockon`, `warp`, `stagger`,
 *    `death`, `mp`, `combo`, `parry`, `link`, `armiger`, `spell` and
 *    `playerHit` onto `window` as `combat:<name>`;
 *  - `RpgSystem` emits `exp-gained`, `level-up`, `quest-updated`,
 *    `item-gained`, `node-unlocked`, `buff-applied`, `meal-cooked`, `rested`,
 *    `time-of-day-changed`, `daemons-rising` and friends through its emitter.
 *
 * Combat is read off the `window` events rather than `combat.on()` on purpose:
 * `CombatSystem.emit` runs its local listeners first and dispatches to `window`
 * afterwards, so by the time we see a `damage` event `CombatBridge` has already
 * re-resolved it through the real damage formula and rewritten `detail.damage`.
 */

/**
 * Every `RpgSystem` emitter event this file subscribes to, and its payload.
 *
 * A map rather than one all-optional bag: the payloads have nothing in common,
 * and an optional field would let `p.quest.name` compile on an event that
 * carries no quest. Keyed subscription makes each handler see exactly what its
 * own event publishes.
 */
export interface RpgEvents {
  'level-up': { member: string, name: string, to: number, from: number };
  'item-gained': { id: string, name: string, count: number, total: number, source: string };
  'ap-gained': { amount: number, reason: string, total: number };
  'node-unlocked': { id: string, node: AscensionNode, apRemaining: number };
  'gil-changed': { gil: number, delta: number, source: string };
  'buff-applied': { buff: { name: string }, source: string };
  'quest-updated': QuestUpdate;
  'time-of-day-changed': {
    /** Phase *id*, not its display name. */
    phase: string,
    name: string,
    hour: number,
    day: number,
    isNight: boolean,
    nightDepth: number,
    clock: string,
  };
  'daemons-rising': { hour: number };
  rested: RestSummary;
}

const CALLOUTS = {
  blindside: ['Blindside!', 'Attack from behind  ·  ×1.35 damage'],
  parry: ['Parry!', 'Perfect guard  ·  counter ready'],
  link: ['Link-Strike!', 'The retinue closes in'],
  warp: ['Warp-Strike!', 'Damage scales with distance covered'],
  stagger: ['Stagger!', 'Poise broken  ·  ×1.9 damage'],
  armiger: ['Armiger', 'The arsenal of the Lucian kings'],
};

export class HudBridge {
  _lastCall!: number;
  /** Unsubscribe functions, one per wired event. */
  _off!: Array<() => void>;
  game!: Game | null;
  hud!: HUD;
  constructor(hud: import('./HUD.ts').HUD) {
    this.hud = hud;
    this.game = null;
    this._off = [];
    this._lastCall = -99;
  }

  /** Subscribe to everything. Safe when a publisher is missing. */
  attach(game: Game) {
    this.game = game;
    this._wireCombat();
    this._wireRpg(game);
  }

  /** Drop every subscription. */
  detach() { for (const off of this._off) off(); this._off.length = 0; }

  /** A call-out banner, rate-limited so a flurry does not strobe. */
  _call(key: string, sub?: string) {
    const now = this.game?.time?.now ?? 0;
    if (now - this._lastCall < 1.1) return;
    this._lastCall = now;
    const [word, line] = CALLOUTS[key as keyof typeof CALLOUTS] || [key, sub || ''];
    this.hud.callOut(word, sub || line);
  }

  /* -- combat ------------------------------------------------------------ */

  _wireCombat() {
    // `CombatSystem.emit` mirrors every event onto `window` as `combat:<name>`,
    // and the `WindowEventMap` augmentation in `src/globals.d.ts` maps those
    // names onto `CombatEvents`. Each name is written out literally rather than
    // built from a variable, because that is what lets the map resolve
    // `e.detail` to *this* event's payload with nothing asserted.
    const on = <T extends keyof WindowEventMap>(type: T, h: (e: WindowEventMap[T]) => void) => {
      window.addEventListener(type, h);
      this._off.push(() => window.removeEventListener(type, h));
    };

    on('combat:damage', (e) => {
      const d = e.detail;
      if (!d.position) return;
      this.hud.damage({
        world: d.position,
        amount: d.damage,
        crit: !!d.crit,
        kind: d.crit ? 'crit' : 'hit',
        element: d.element || null,
      });
    });

    on('combat:hit', (e) => { if (e.detail.blindside) this._call('blindside'); });
    on('combat:lockon', (e) => this.hud.setLockOn(e.detail.enemy || null));
    on('combat:warp', (e) => { if (e.detail.phase === 'impact' && e.detail.enemy) this._call('warp'); });
    on('combat:parry', () => this._call('parry'));
    on('combat:link', () => this._call('link'));
    on('combat:stagger', () => this._call('stagger'));
    on('combat:armiger', () => this._call('armiger'));
    on('combat:playerHit', (e) => {
      const max = this.game?.get?.('Player')?.stats?.maxHp || 1;
      this.hud.hit(Math.min(1, (e.detail.damage || 0) / Math.max(1, max * 0.22)));
    });
    on('combat:spell', (e) => {
      const el = e.detail.element;
      if (el) this._call('spell', `${el[0].toUpperCase()}${el.slice(1)} unleashed`);
    });
  }

  /* -- rpg --------------------------------------------------------------- */

  _wireRpg(game: Game) {
    const rpg = game?.get?.('Rpg');
    if (!rpg || typeof rpg.on !== 'function') return;
    const on = <K extends keyof RpgEvents>(n: K, fn: (p: RpgEvents[K]) => void) => this._off.push(rpg.on(n, fn));
    const toast = (label: string, value: string, ico?: string, tone?: string) =>
      this.hud.toasts.push(label, value, ico, tone);

    on('level-up', (p) => {
      if (p.member === 'noctis') this.hud.levelUp(p.to);
      toast('Level Up', `${p.name || p.member}  ·  Level ${p.to}`, 'ascension', 'gold');
    });

    on('item-gained', (p) => {
      if (p.source === 'start' || p.source === 'seed' || p.source === 'unequip') return;
      toast('Obtained', `${p.name}${p.count > 1 ? `  ×${p.count}` : ''}`, 'items');
    });

    on('ap-gained', (p) => {
      if (p.reason === 'seed') return;
      toast('Ability Points', `+${p.amount}  ·  ${p.reason.replace(/-/g, ' ')}`, 'ap', 'ice');
    });

    on('node-unlocked', (p) => toast('Ascension', p.node.name, 'ascension', 'ice'));

    on('gil-changed', (p) => {
      if (p.source === 'start' || p.source === 'seed' || !p.delta) return;
      toast('Gil', `${p.delta > 0 ? '+' : ''}${p.delta.toLocaleString()}`, 'ap', 'gold');
    });

    on('buff-applied', (p) => toast('Buff', p.buff.name, 'regen', 'gold'));

    on('quest-updated', (p) => {
      if (p.phase === 'complete') {
        this.hud.areaTitle('Quest Complete', p.quest.name, p.quest.type === 'hunt' ? 'Bounty' : p.quest.type === 'main' ? `Chapter ${p.quest.chapter}` : 'Side Quest');
      } else if (p.phase === 'objective' && p.objective) {
        // `QuestUpdate.objective` is documented as "`phase: 'objective'` only"
        // but declared optional, so the phase test alone does not narrow it.
        toast('Objective', p.objective.desc, 'quests', 'ice');
      } else if (p.phase === 'accepted') {
        toast('Quest Accepted', p.quest.name, 'quests');
      }
    });

    on('time-of-day-changed', (p) => {
      if (p.phase === 'dusk') this.hud.say('Ignis', 'The light is going. We should find a haven before dark.');
      else if (p.phase === 'dawn') this.hud.say('Prompto', 'Morning! See? Told you we\'d make it.');
    });

    on('daemons-rising', () => this.hud.say('Gladiolus', 'They\'re coming up. Stay sharp.'));

    on('rested', (p) => {
      if (!p.exp || !p.exp.total) return;
      this.hud.areaTitle(`Day ${p.day}`, `${p.exp.total.toLocaleString()} EXP redeemed`, `${p.lodging.name}  ·  ×${p.lodging.bonus.toFixed(1)}`);
    });
  }
}

export default HudBridge;
