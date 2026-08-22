import { el, clamp, easeOut, easeOutQuint } from '../UIKit.ts';
import { icon } from '../Icons.ts';
import { ensureInteractCss } from '../../game/interaction/interact.css.ts';
import { Bar } from '../Bar.ts';
import type { Menus } from '../Menus.ts';
import type { Game } from '../../game/Game.ts';
import type { BusName } from '../../audio/Graph.ts';
import { QUALITY_TIERS } from '../../engine/Renderer.ts';

/**
 * One row of the settings table, discriminated by `kind`.
 *
 * Every row reads and writes live engine state through its own closures, so
 * the four kinds genuinely carry different verbs — a slider has `get`/`set`
 * over 0..1, a choice has `options`/`index`/`pick`, an action has `run`. The
 * union is what makes `nav()`'s `kind` tests narrow instead of guess.
 */
interface SettingRowBase {
  key: string;
  name: string;
  desc: string;
  /** The right-hand value column. */
  value: () => string;
  /** False greys the row out and blocks input. */
  enabled: () => boolean;
  /** Printed when a disabled row is accepted. */
  why?: string;
}
interface SliderRow extends SettingRowBase {
  kind: 'slider';
  /** 0..1. */
  get: () => number;
  set: (v: number) => void;
}
interface ToggleRow extends SettingRowBase {
  kind: 'toggle';
  get: () => boolean;
  set: (v: boolean) => void;
}
interface ChoiceRow extends SettingRowBase {
  kind: 'choice';
  options: readonly string[];
  index: () => number;
  pick: (n: number) => void;
}
interface ActionRow extends SettingRowBase {
  kind: 'action';
  run: () => void;
}
type SettingRow = SliderRow | ToggleRow | ChoiceRow | ActionRow;

/** One built row: its DOM, its definition and the last values drawn into it. */
interface SettingNode {
  node: HTMLElement;
  row: SettingRow;
  val: HTMLElement;
  bar: Bar | null;
  bg: HTMLElement;
  _on?: boolean;
  _ok?: boolean;
  _v?: string;
}

/** The label printed above the setting name in the detail column. */
const KIND_LABEL: Record<SettingRow['kind'], string> = {
  slider: 'Setting', toggle: 'Setting', choice: 'Setting', action: 'Action',
};

/**
 * System settings.
 *
 * Every row here changes something real the moment it moves: the audio bus
 * gains on `AudioSystem`, the renderer + post quality tier on `Renderer`, the
 * look inversion and sensitivity on `Input`, a save through `RpgSystem.save`,
 * and a return to the title screen through `StorySystem.showTitle`.
 *
 * Controls: ↑↓ pick a row, ←→ change it, Enter to fire an action row.
 * Everything animates from `game.time`; no CSS transitions.
 */
export class SystemScreen {
  /** The screen root. Created and assigned by whoever registers the screen
   *  (`Menus.init`, or `Hammerhead._registerScreens` for the two town
   *  counters), never by this constructor. */
  node!: HTMLElement;
  _age!: number;
  _cur!: string | null;
  _msg!: { text: string, ok: boolean } | null;
  _msgAge!: number;
  cols!: HTMLElement;
  dD!: HTMLElement;
  dI!: HTMLElement;
  dK!: HTMLElement;
  dN!: HTMLElement;
  dRule!: HTMLElement;
  detail!: HTMLElement;
  game!: Game;
  i!: number;
  list!: HTMLElement;
  menus!: Menus;
  msg!: HTMLElement;
  nodes!: SettingNode[];
  sub!: string;
  title!: string;
  constructor(menus: import('../Menus.ts').Menus) {
    ensureInteractCss();
    this.menus = menus;
    this.title = 'System';
    this.sub = 'Settings, save, and the long way home';
    this.i = 0;
    this._msg = null;
    this._msgAge = 9;
  }

  /* -------------------------------------------------------- the rows */

  /**
   * The setting table. Each row reads and writes live engine state; nothing is
   * mirrored into a settings object that could drift out of sync with it.
   */
  _rows(game: Game): SettingRow[] {
    // Resolved on every read, never captured: this screen is built during
    // `Menus.init`, and `Story` (among others) is constructed *after* Menus in
    // the boot order — capturing it here left Return to Title permanently and
    // wrongly disabled.
    const audio = () => this.game?.get?.('Audio');
    const input = () => this.game?.input;
    const rnd = () => this.game?.rnd;
    const rpg = () => this.game?.get?.('Rpg');
    const story = () => this.game?.get?.('Story');
    const pct = (v: number) => `${Math.round(v * 100)}%`;
    void game;

    const bus = (id: BusName, name: string, desc: string): SliderRow => ({
      key: id, name, kind: 'slider', desc,
      get: () => { const a = audio(); return a ? a.volumeOf(id) : 0; },
      set: (v: number) => { const a = audio(); if (a) a.setVolume(id, v); },
      value: () => { const a = audio(); return a ? pct(a.volumeOf(id)) : '—'; },
      enabled: () => !!audio(),
      why: 'The audio system is not running in this session.',
    });

    return [
      bus('master', 'Master Volume', 'Overall output. Everything the game makes noise with rides on this bus.'),
      bus('music', 'Music', 'The score, and the Regalia\'s radio.'),
      bus('sfx', 'Sound Effects', 'Blades, engines, weather and footfalls.'),
      {
        key: 'quality', name: 'Graphics Quality', kind: 'choice',
        desc: 'Shadow cascades, ambient occlusion, screen-space reflections and '
          + 'render scale, all in one tier. Drop it if the frame rate is fighting you.',
        options: QUALITY_TIERS,
        index: () => Math.max(0, QUALITY_TIERS.indexOf(rnd() ? rnd().quality : 'high')),
        pick: (n: number) => {
          const tier = QUALITY_TIERS[n];
          if (!tier) return;
          if (rnd()?.setQuality) rnd().setQuality(tier);
          if (this.game?.post?.setQuality) this.game.post.setQuality(tier);
        },
        value: () => (rnd() ? rnd().quality.toUpperCase() : 'HIGH'),
        enabled: () => !!rnd(),
        why: 'No renderer to configure.',
      },
      {
        key: 'invertY', name: 'Invert Camera (Y)', kind: 'toggle',
        desc: 'Push the stick or the mouse forward to look down instead of up.',
        get: () => !!input()?.invertY,
        set: (v: boolean) => { if (input()) input().invertY = v; },
        value: () => (input()?.invertY ? 'ON' : 'OFF'),
        enabled: () => !!input(),
        why: 'No input device bound.',
      },
      {
        key: 'sens', name: 'Look Sensitivity', kind: 'slider',
        desc: 'How far the camera swings for a given flick of the mouse or stick.',
        get: () => clamp(((input()?.lookScale ?? 1) - 0.25) / 2.75, 0, 1),
        set: (v: number) => { if (input()) input().lookScale = 0.25 + v * 2.75; },
        value: () => `${(input()?.lookScale ?? 1).toFixed(2)}×`,
        enabled: () => !!input(),
        why: 'No input device bound.',
      },
      {
        key: 'controls', name: 'Controls', kind: 'action',
        desc: 'The whole control sheet — on foot, in a fight, and behind the wheel of the Regalia.',
        value: () => 'Enter',
        run: () => { this.menus.push('controls'); },
        enabled: () => true,
      },
      {
        key: 'save', name: 'Save Journey', kind: 'action',
        desc: 'Write the party, the bag, the grid and the quest log to the autosave slot.',
        value: () => 'Enter',
        run: () => {
          let ok = false;
          try { const r = rpg(); ok = !!(r?.save && r.save('manual')); } catch { ok = false; }
          this._say(ok ? 'Journey saved.' : 'Could not write the save.', ok);
        },
        enabled: () => !!rpg()?.save,
        why: 'No RPG system is loaded, so there is nothing to write.',
      },
      {
        key: 'title', name: 'Return to Title', kind: 'action',
        desc: 'Leave the field and go back to the title screen. Unsaved progress in '
          + 'this session stays in memory until the page is reloaded.',
        value: () => 'Enter',
        run: () => {
          this.menus.setScreen(null);
          story()?.showTitle?.();
          this._say('Returning to the title.', true);
        },
        enabled: () => !!story()?.showTitle,
        why: 'The story system is not running, so there is no title to return to.',
      },
    ];
  }

  /** @param root @param game */
  build(root: HTMLElement, game: Game) {
    this.game = game;
    this.cols = el('div.cols');

    const l = el('div.col-l');
    this.list = el('div.syslist');
    l.appendChild(this.list);

    const r = el('div.col-r');
    this.detail = el('div.detail');
    this.dRule = el('div.rule.v');
    this.dK = el('div.dt-k');
    this.dN = el('div.dt-n');
    this.dD = el('div.t-body.dt-d');
    this.dI = el('div.dt-ico');
    this.detail.appendChild(this.dRule);
    this.detail.appendChild(this.dI);
    this.detail.appendChild(this.dK);
    this.detail.appendChild(this.dN);
    this.detail.appendChild(this.dD);
    this.msg = el('div.shop-msg');
    this.detail.appendChild(this.msg);
    r.appendChild(this.detail);

    this.cols.appendChild(l);
    this.cols.appendChild(r);
    root.appendChild(this.cols);

    this.nodes = this._rows(game).map((row): SettingNode => {
      const val = el('div.sy-v');
      const bar = row.kind === 'slider' ? new Bar({ cls: 'slim', chase: false }) : null;
      // Held rather than re-found through `firstChild`: the highlight is
      // repainted every frame and the lookup would have to be re-narrowed.
      const bg = el('div.mr-bg');
      const node = el('div.syrow', {}, [
        bg,
        icon(row.kind === 'action' ? 'system' : row.kind === 'toggle' ? 'shieldUp' : 'ap', { size: 15, stroke: 1.2 }),
        el('div.sy-n', { text: row.name }),
        val,
        bar ? bar.node : null,
      ]);
      this.list.appendChild(node);
      this.list.appendChild(el('div.rule', { style: 'opacity:.34' }));
      return { node, row, val, bar, bg };
    });
  }

  enter(game: Game) { if (game) this.game = game; this._cur = null; this._msg = null; this._msgAge = 9; }

  _say(text: string, ok: boolean) { this._msg = { text, ok }; this._msgAge = 0; }

  /* ------------------------------------------------------------ input */

  nav(dx: number, dy: number) {
    const n = this.nodes.length;
    if (dy) this.i = (this.i + dy + n) % n;
    if (!dx) return;
    const r = this.nodes[this.i].row;
    if (!r.enabled()) return;
    if (r.kind === 'slider') r.set(clamp(r.get() + dx * 0.1, 0, 1));
    else if (r.kind === 'toggle') r.set(!r.get());
    else if (r.kind === 'choice') r.pick(clamp(r.index() + dx, 0, r.options.length - 1));
  }

  accept() {
    const r = this.nodes[this.i].row;
    if (!r.enabled()) { this._say(r.why || 'Not available.', false); return; }
    if (r.kind === 'action') r.run();
    else if (r.kind === 'toggle') r.set(!r.get());
    else if (r.kind === 'choice') r.pick((r.index() + 1) % r.options.length);
    else if (r.kind === 'slider') r.set(r.get() >= 0.999 ? 0 : clamp(r.get() + 0.1, 0, 1));
  }

  /* ----------------------------------------------------------- render */

  /** @param dt @param game @param a */
  update(dt: number, game: Game, a: number) {
    this.game = game;
    for (let i = 0; i < this.nodes.length; i++) {
      const n = this.nodes[i];
      const t = easeOut(clamp((a - 0.12 - i * 0.03) / 0.6, 0, 1));
      n.node.style.opacity = t.toFixed(3);
      n.node.style.transform = `translateX(${((1 - t) * -30).toFixed(2)}px)`;
      const on = i === this.i;
      if (n._on !== on) { n.node.classList.toggle('on', on); n._on = on; }
      const ok = n.row.enabled();
      if (n._ok !== ok) { n.node.classList.toggle('disabled', !ok); n._ok = ok; }
      n.bg.style.opacity = on ? (0.6 + 0.2 * (0.5 + 0.5 * Math.sin(game.time.now * 2.6))).toFixed(3) : '0';
      const v = ok ? n.row.value() : 'Unavailable';
      if (n._v !== v) { n.val.textContent = v; n._v = v; }
      if (n.bar && n.row.kind === 'slider') n.bar.set(ok ? clamp(n.row.get(), 0, 1) : 0, dt);
    }

    const cur = this.nodes[this.i];
    const key = `${cur.row.key}|${cur.row.enabled()}`;
    if (this._cur !== key) {
      this._cur = key;
      this._age = 0;
      this.dK.textContent = KIND_LABEL[cur.row.kind];
      this.dN.textContent = cur.row.name;
      this.dD.textContent = cur.row.enabled() ? cur.row.desc : `${cur.row.desc}\n\nUnavailable: ${cur.row.why}`;
      this.dI.textContent = '';
      this.dI.appendChild(icon('system', { size: 104, stroke: 0.46 }));
    }
    this._age = (this._age || 0) + dt;
    const de = easeOut(clamp(this._age / 0.22, 0, 1)) * easeOut(clamp((a - 0.24) / 0.55, 0, 1));
    this.detail.style.opacity = de.toFixed(3);
    this.detail.style.transform = `translateX(${((1 - de) * 16).toFixed(2)}px)`;
    this.dRule.style.height = `${(easeOutQuint(clamp((a - 0.2) / 0.7, 0, 1)) * 100).toFixed(0)}%`;

    this._msgAge += dt;
    this.msg.style.opacity = this._msg ? easeOut(clamp((2.6 - this._msgAge) / 0.7, 0, 1)).toFixed(3) : '0';
    if (this._msg) {
      this.msg.textContent = this._msg.text;
      this.msg.className = `shop-msg ${this._msg.ok ? 'ok' : 'bad'}`;
    }
  }
}

export default SystemScreen;
