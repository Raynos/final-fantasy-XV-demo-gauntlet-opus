import type { HUD } from './HUD.ts';
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
  _off!: any[];
  game!: any;
  hud!: HUD;
  constructor(hud: import('./HUD.ts').HUD) {
    this.hud = hud;
    this.game = null;
    this._off = [];
    this._lastCall = -99;
  }

  /** Subscribe to everything. Safe when a publisher is missing. */
  attach(game: any) {
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
    const on = (name: string, fn: any) => {
      const h = (e: any) => fn(e.detail || {});
      window.addEventListener(`combat:${name}`, h);
      this._off.push(() => window.removeEventListener(`combat:${name}`, h));
    };

    on('damage', (d: any) => {
      if (!d.position) return;
      this.hud.damage({
        world: d.position,
        amount: d.damage,
        crit: !!d.crit,
        kind: d.crit ? 'crit' : 'hit',
        element: d.element || null,
      });
    });

    on('hit', (d: any) => { if (d.blindside) this._call('blindside'); });
    on('lockon', (d: any) => this.hud.setLockOn(d.enemy || null));
    on('warp', (d: any) => { if (d.phase === 'impact' && d.enemy) this._call('warp'); });
    on('parry', () => this._call('parry'));
    on('link', () => this._call('link'));
    on('stagger', () => this._call('stagger'));
    on('armiger', () => this._call('armiger'));
    on('playerHit', (d: any) => {
      const max = this.game?.get?.('Player')?.stats?.maxHp || 1;
      this.hud.hit(Math.min(1, (d.damage || 0) / Math.max(1, max * 0.22)));
    });
    on('spell', (d: any) => {
      if (d.element) this._call('spell', `${d.element[0].toUpperCase()}${d.element.slice(1)} unleashed`);
    });
  }

  /* -- rpg --------------------------------------------------------------- */

  _wireRpg(game: any) {
    const rpg = game?.get?.('Rpg');
    if (!rpg || typeof rpg.on !== 'function') return;
    const on = (n: string, fn: any) => this._off.push(rpg.on(n, fn));
    const toast = (label: string, value: string, ico?: string, tone?: string) =>
      this.hud.toasts.push(label, value, ico, tone);

    on('level-up', (p: any) => {
      if (p.member === 'noctis') this.hud.levelUp(p.to);
      toast('Level Up', `${p.name || p.member}  ·  Level ${p.to}`, 'ascension', 'gold');
    });

    on('item-gained', (p: any) => {
      if (p.source === 'start' || p.source === 'seed' || p.source === 'unequip') return;
      toast('Obtained', `${p.name}${p.count > 1 ? `  ×${p.count}` : ''}`, 'items');
    });

    on('ap-gained', (p: any) => {
      if (p.reason === 'seed') return;
      toast('Ability Points', `+${p.amount}  ·  ${p.reason.replace(/-/g, ' ')}`, 'ap', 'ice');
    });

    on('node-unlocked', (p: any) => toast('Ascension', p.node.name, 'ascension', 'ice'));

    on('gil-changed', (p: any) => {
      if (p.source === 'start' || p.source === 'seed' || !p.delta) return;
      toast('Gil', `${p.delta > 0 ? '+' : ''}${p.delta.toLocaleString()}`, 'ap', 'gold');
    });

    on('buff-applied', (p: any) => toast('Buff', p.buff.name, 'regen', 'gold'));

    on('quest-updated', (p: any) => {
      if (p.phase === 'complete') {
        this.hud.areaTitle('Quest Complete', p.quest.name, p.quest.type === 'hunt' ? 'Bounty' : p.quest.type === 'main' ? `Chapter ${p.quest.chapter}` : 'Side Quest');
      } else if (p.phase === 'objective') {
        toast('Objective', p.objective.desc, 'quests', 'ice');
      } else if (p.phase === 'accepted') {
        toast('Quest Accepted', p.quest.name, 'quests');
      }
    });

    on('time-of-day-changed', (p: any) => {
      if (p.phase === 'dusk') this.hud.say('Ignis', 'The light is going. We should find a haven before dark.');
      else if (p.phase === 'dawn') this.hud.say('Prompto', 'Morning! See? Told you we\'d make it.');
    });

    on('daemons-rising', () => this.hud.say('Gladiolus', 'They\'re coming up. Stay sharp.'));

    on('rested', (p: any) => {
      if (!p.exp || !p.exp.total) return;
      this.hud.areaTitle(`Day ${p.day}`, `${p.exp.total.toLocaleString()} EXP redeemed`, `${p.lodging.name}  ·  ×${p.lodging.bonus.toFixed(1)}`);
    });
  }
}

export default HudBridge;
