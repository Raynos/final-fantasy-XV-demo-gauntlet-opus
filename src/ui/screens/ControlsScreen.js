import { el, clamp, easeOut, easeOutQuint } from '../UIKit.js';
import { button, icon } from '../Icons.js';

/**
 * Every binding the game answers to, in the four groups a player thinks in.
 *
 * `[keys, pad, label, note]` — `keys` is the keyboard/mouse side (an array so a
 * row can print two glyphs), `pad` is the controller equivalent as plain text.
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
      [['M'], 'Keyboard only', 'World Map', 'Menu ▸ Map is the region chart'],
      [['C'], 'Keyboard only', 'Photo Mode', 'Prompto takes the shot'],
      [['`'], 'Keyboard only', 'Mute Audio', 'Volume sliders live in System'],
    ],
  },
  {
    name: 'Combat', icon: 'sword',
    rows: [
      [['LMB'], 'Square', 'Attack', 'Hold to keep the combo going'],
      [['RMB'], 'Circle (hold)', 'Phase / Parry', 'Hold to evade; costs MP'],
      [['Space'], 'Circle', 'Dodge', ''],
      [['Q'], 'Triangle', 'Warp-Strike', 'Counters when the window is open'],
      [['R'], 'Triangle (hold)', 'Point Warp', 'Warp out to recover MP'],
      [['X'], 'L1', 'Armiger', 'When the gauge is full'],
      [['Y'], 'R3', 'Lock On', 'Toggles the nearest target'],
      [['1', '-', '5'], 'D-Pad', 'Swap Weapon', 'Sword, greatsword, polearm, daggers, firearm'],
      [['6', '-', '8'], 'Keyboard only', 'Cast Magic', 'Fire, ice, lightning'],
      [['G'], 'Keyboard only', 'Gladiolus Technique', 'Spends tech bars'],
      [['J'], 'Keyboard only', 'Ignis Technique', ''],
      [['K'], 'Keyboard only', 'Prompto Technique', ''],
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
      [['I'], 'Y / Triangle', 'Let Ignis Drive', 'Auto-drives to the next stop'],
      [['V'], 'R3', 'Change Camera', 'Chase, bonnet, cinematic'],
      [['B'], 'D-Pad Right', 'Next Radio Station', ''],
      [['N'], 'D-Pad Left', 'Radio On / Off', ''],
      [['L'], 'D-Pad Up', 'Headlights', 'Auto, on, off'],
      [['T'], 'X / Square', 'Type-D Off-Road', ''],
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
      [['Q', 'E'], 'L1 / R1', 'Quantity', 'In a shop; hold Shift for ten'],
      [['H'], 'Y / Triangle', 'Close This Card', ''],
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
  /** @param {import('../Menus.js').Menus} menus */
  constructor(menus) {
    this.menus = menus;
    this.title = 'Controls';
    this.sub = 'Keyboard & mouse  ·  Gamepad';
    this.i = 0;
  }

  /** @param {HTMLElement} root */
  build(root) {
    this.grid = el('div.ctrl-grid');
    this.cols = GROUPS.map((g) => {
      const rows = g.rows.map(([keys, pad, label, note]) => {
        // '-' between two keys means "this range", not a key of its own
        const glyphs = el('div.cr-k', {}, keys.map((k) => (k === '-'
          ? el('span.cr-dash', { text: '–' })
          : button(k, { size: k.length > 2 ? 25 : 21 }))));
        const node = el('div.crow', {}, [
          el('div.mr-bg'),
          glyphs,
          el('div.cr-b', {}, [
            el('div.cr-t', { text: label }),
            note ? el('div.cr-n', { text: note }) : null,
          ]),
          el('div.cr-p', { text: pad }),
        ]);
        return { node, bg: node.firstChild };
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
      'Escape is claimed by the browser to release the mouse — the game hands the '
      + 'pointer back and opens this menu when that happens, so Tab, Backspace and '
      + 'Circle are the reliable way out of anything.' });
    root.appendChild(this.note);
  }

  /** Left/right walks the columns, up/down the rows inside one. */
  nav(dx, dy) {
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

  /** @param {number} dt @param {object} game @param {number} a */
  update(dt, game, a) {
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
