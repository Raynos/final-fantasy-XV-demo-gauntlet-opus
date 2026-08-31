import { el, clamp, easeOut, easeOutQuint } from '../UIKit.ts';
import { button, icon } from '../Icons.ts';
import type { Menus } from '../Menus.ts';
import type { Game } from '../../game/Game.ts';

/**
 * Every binding the game answers to, in the four groups a player thinks in.
 *
 * `[keys, pad, label, note]` — `keys` is the keyboard/mouse side (an array so a
 * row can print two glyphs), `pad` is the controller equivalent as plain text.
 *
 * **This table is a promise, and it was breaking it.** Five of the twelve
 * combat rows named keys the game does not answer to — R for Point Warp
 * (it is `KeyE`), X for Armiger (`KeyR`), Y for Lock On (`KeyV`), 6–8 for
 * magic (`KeyZ`/`KeyX`/`KeyB`) — and the heavy attack, the one verb a player
 * has to be told about because no other game binds it to `F`, was missing
 * altogether. A player who read this card could not fight. The authority is
 * the bound verb list in `CombatSystem._readInput` and its JSDoc table
 * directly above it; every row below was checked against the `input.keyDown`
 * call that implements it, not against the previous version of this file.
 *
 * The pad column is held to the same standard. A verb with no
 * `gpButton`/`gpDown` behind it leaves `pad` **empty**, and an empty `pad`
 * prints as a dash: Point Warp, the heavy attack, the firearm, Let Ignis
 * Drive, the whole in-car secondary cluster, the shop's quantity keys and
 * this card's own close key were all promising a controller that was never
 * wired. Seventeen of the forty-four rows are keyboard-only, which is why
 * they are a dash and a footnote rather than the words "Keyboard only"
 * printed seventeen times down a card that is already dense. Where a pad
 * button IS bound the index is the standard mapping, so `gpEdge(4)` is L1 and
 * `gpEdge(5)` is R1 — Lock On used to be printed as R3, which is `10`/`11`,
 * the stick clicks.
 */
const GROUPS = [
  {
    name: 'On Foot', icon: 'map',
    rows: [
      [['W', 'A', 'S', 'D'], 'Left Stick', 'Move', 'Arrow keys work too'],
      [['Shift'], 'L3', 'Sprint', 'Hold'],
      [['Mouse'], 'Right Stick', 'Camera', 'Invert Y & sensitivity in System'],
      [['E'], 'A / Cross', 'Interact', 'Talk, shop, rest, refuel, drive'],
      [['Tab'], 'Start', 'Menu', 'Closes from any screen'],
      [['H'], 'Start ▸ Controls', 'Controls', 'This card. Press again to close'],
      [['M'], '', 'World Map', 'Menu ▸ Map is the region chart'],
      [['C'], '', 'Photo Mode', 'Prompto takes the shot'],
      [['`'], '', 'Mute Audio', 'Volume sliders live in System'],
    ],
  },
  {
    name: 'Combat', icon: 'sword',
    rows: [
      [['LMB'], 'Square', 'Attack', 'Hold to keep the combo going'],
      [['F'], '', 'Heavy Attack', 'Opens on the finisher; heavy poise damage'],
      [['RMB'], 'Circle (hold)', 'Phase / Parry', 'Hold to evade; costs MP'],
      [['Space'], 'Circle', 'Dodge', 'Invulnerable for a third of a second'],
      [['Q'], 'Triangle', 'Warp-Strike', 'Counters when the parry window is open'],
      [['E'], '', 'Point Warp', 'Perch to recover MP; yields to a prompt'],
      [['R'], 'L1', 'Armiger', 'When the gauge is full'],
      [['V'], 'R1', 'Lock On', 'Toggles the nearest target'],
      [['1', '-', '5'], 'D-Pad (1–4)', 'Swap Weapon', 'Sword, greatsword, polearm, daggers; 5 is the firearm'],
      [['Z', 'X', 'B'], '', 'Cast Magic', 'Elemancy quick-slots one, two and three'],
      [['G'], '', 'Gladiolus Technique', 'Spends tech bars'],
      [['J'], '', 'Ignis Technique', ''],
      [['K'], '', 'Prompto Technique', ''],
    ],
  },
  {
    name: 'The Regalia', icon: 'machinery',
    rows: [
      [['F'], 'A / Cross', 'Get In / Get Out', 'Stand beside the car'],
      [['W'], 'RT', 'Accelerate', ''],
      [['S'], 'LT', 'Brake / Reverse', 'One pedal, like an automatic'],
      [['A', 'D'], 'Left Stick', 'Steer', ''],
      [['Space'], 'A / Cross', 'Handbrake', ''],
      [['I'], '', 'Let Ignis Drive', 'Auto-drives to the next stop'],
      [['V'], '', 'Change Camera', 'Chase, bonnet, cinematic'],
      [['B'], '', 'Next Radio Station', ''],
      [['N'], '', 'Radio On / Off', ''],
      [['L'], '', 'Headlights', 'Auto, on, off'],
      [['T'], '', 'Type-D Off-Road', 'Suspension for the dirt'],
    ],
  },
  {
    name: 'Chocobo', icon: 'chocobo',
    rows: [
      [['6'], '', 'Whistle', 'A bird runs to you. You start with the whistle'],
      [['E'], 'A / Cross', 'Ride', 'Stand beside her; the prompt says RIDE'],
      [['W', 'A', 'S', 'D'], 'Left Stick', 'Steer Her', 'Faster than running, and she climbs'],
      [['Shift'], 'L3', 'Sprint', 'Hold. Spends her stamina bar'],
      [['6'], '', 'Dismount', 'She waits where you left her'],
      [['6'], '', 'Send Away', 'Press again once you are off'],
    ],
  },
  {
    name: 'Menus', icon: 'system',
    rows: [
      [['Tab'], 'Start', 'Open / Close Menu', 'Works from every screen'],
      [['Bksp'], 'B / Circle', 'Back', 'Escape too, when the browser allows it'],
      [['Enter'], 'A / Cross', 'Confirm', ''],
      [['↑', '↓'], 'D-Pad', 'Select', 'WASD works too'],
      [['←', '→'], 'D-Pad', 'Change Tab', ''],
      [['Q', 'E'], '', 'Quantity', 'In a shop; hold Shift for ten'],
      [['H'], '', 'Close This Card', 'On a pad: Start ▸ Controls'],
    ],
  },
];

/**
 * The control sheet.
 *
 * The player's first question about this game was "how do you get in the car",
 * which is a UI failure rather than a design one: everything was bound, nothing
 * was written down. This screen writes it all down, keyboard and pad side by
 * side, and the field HUD points a first-run hint at it.
 *
 * Reached from the main menu's Help row, from System, and from the hint. Back
 * is Tab / Backspace / B, like everywhere else.
 */
export class ControlsScreen {
  /** The screen root. Created and assigned by whoever registers the screen
   *  (`Menus.init`, or `Hammerhead._registerScreens` for the two town
   *  counters), never by this constructor. */
  node!: HTMLElement;
  cols!: Array<{ col: HTMLElement, rows: Array<{ node: HTMLElement, bg: HTMLElement, _on?: boolean }> }>;
  grid!: HTMLElement;
  i!: number;
  j!: number;
  menus!: Menus;
  note!: HTMLElement;
  sub!: string;
  title!: string;
  constructor(menus: import('../Menus.ts').Menus) {
    this.menus = menus;
    this.title = 'Controls';
    this.sub = 'Keyboard & mouse  ·  Gamepad';
    this.i = 0;
  }

  build(root: HTMLElement) {
    this.grid = el('div.ctrl-grid');
    this.cols = GROUPS.map((g) => {
      const rows = (g.rows as [string[], string, string, string?][]).map(([keys, pad, label, note]) => {
        // '-' between two keys means "this range", not a key of its own
        const glyphs = el('div.cr-k', {}, keys.map((k: string) => (k === '-'
          ? el('span.cr-dash', { text: '–' })
          : button(k, { size: k.length > 2 ? 25 : 21 }))));
        const bg = el('div.mr-bg');
        const node = el('div.crow', {}, [
          bg,
          glyphs,
          el('div.cr-b', {}, [
            el('div.cr-t', { text: label }),
            note ? el('div.cr-n', { text: note }) : null,
          ]),
          // An empty `pad` means the verb has no controller binding, and it
          // prints as one dash rather than the words "Keyboard only" fifteen
          // times down a card that is already dense. The footnote says what
          // the dash means; the alternative was a column that read as a single
          // repeated phrase and stopped being read at all.
          el(pad ? 'div.cr-p' : 'div.cr-p.none', { text: pad || '—' }),
        ]);
        return { node, bg };
      });
      const col = el('div.ctrl-col.plate', {}, [
        el('div.cc-h', {}, [icon(g.icon, { size: 15, stroke: 1.2 }), el('div.cc-t', { text: g.name })]),
        el('div.rule', { style: 'margin:12px 0 6px' }),
        ...rows.map((r) => r.node),
      ]);
      this.grid.appendChild(col);
      return { col, rows };
    });
    root.appendChild(this.grid);

    this.note = el('div.ctrl-note', { text:
      'A dash in the right-hand column means that verb has no gamepad binding — it is '
      + 'keyboard and mouse only.   ·   Escape is claimed by the browser to release the '
      + 'mouse: the game hands the pointer back and opens this menu when that happens, '
      + 'so Tab, Backspace and Circle are the reliable way out of anything.' });
    root.appendChild(this.note);
  }

  /** Left/right walks the columns, up/down the rows inside one. */
  nav(dx: number, dy: number) {
    const n = this.cols.length;
    if (dx) { this.i = clamp(this.i + dx, 0, n - 1); this.j = 0; }
    if (dy) {
      const rows = this.cols[this.i].rows.length;
      this.j = ((this.j || 0) + dy + rows) % rows;
    }
  }

  /** Nothing to confirm — this is a reference sheet. */
  accept() {}

  enter() { this.i = 0; this.j = 0; }

  /** @param dt @param game @param a */
  update(dt: number, game: Game, a: number) {
    for (let c = 0; c < this.cols.length; c++) {
      const col = this.cols[c];
      const t = easeOut(clamp((a - 0.1 - c * 0.055) / 0.6, 0, 1));
      col.col.style.opacity = t.toFixed(3);
      col.col.style.transform = `translateY(${((1 - t) * 24).toFixed(2)}px)`;
      for (let r = 0; r < col.rows.length; r++) {
        const row = col.rows[r];
        const on = c === this.i && r === (this.j || 0);
        if (row._on !== on) { row.node.classList.toggle('on', on); row._on = on; }
        row.bg.style.opacity = on ? (0.55 + 0.25 * (0.5 + 0.5 * Math.sin(game.time.now * 2.6))).toFixed(3) : '0';
      }
    }
    this.note.style.opacity = easeOut(clamp((a - 0.42) / 0.5, 0, 1)).toFixed(3);
    this.note.style.transform = `translateY(${((1 - easeOutQuint(a)) * 10).toFixed(2)}px)`;
  }
}

export default ControlsScreen;
