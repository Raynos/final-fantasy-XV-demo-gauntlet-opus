/**
 * Where the buttons sit, what each one means in each mode, and how loud it is.
 *
 * ## The three families
 *
 * The first layout put nine identical grey discs on the screen, and the picture
 * showed why that fails: ATTACK, pressed constantly, looked exactly like MAP,
 * pressed twice a session. Position and size now carry meaning.
 *
 *  - **The fan** — the combat verbs, in one arc off the bottom-right corner,
 *    ordered by how often a thumb goes there. ATTACK is innermost and largest;
 *    LOCK and ARMIGER are outermost and quietest. It is a fan rather than a
 *    scatter so the hand learns a shape rather than six positions.
 *  - **The rail** — CHOCOBO and CAR, the two *world* verbs. They are pressed
 *    deliberately, while standing still, and they are not part of a fight, so
 *    they sit on their own row along the bottom edge in their own visual family
 *    (cut corners, warm stroke). They can never be mistaken for the fan.
 *  - **Utilities** — MAP and MENU, top-left, small and hairline-only. A
 *    deliberate reach for a deliberate action.
 *
 * ## The rules the geometry obeys
 *
 * **Nothing above the bottom band.** The old cluster spanned 73% of screen
 * height and put CHOCOBO and CAR over the horizon. Everything here lives in
 * the bottom 55%, so the picture is a picture.
 *
 * **The fan never moves between field / ride / swim / drive.** Only labels, pad
 * indices and enabled-ness change, so walking into the car does not relocate
 * the button the thumb was resting on. `drive` re-points the three the thumb
 * already knows.
 *
 * Offsets are px from the top-left of the slot's cluster, and the clusters are
 * anchored to the screen edges with the safe-area insets in `touch.css.ts`.
 * Nothing here scales with `uiScale()` — a thumb is a physical size.
 *
 * Every number was read off `ui-shoot` at 844x390, not reasoned about.
 */

/** Standard-mapping indices, named so the layout table reads as verbs. */
export const PAD = {
  a: 0, b: 1, x: 2, y: 3,
  lb: 4, rb: 5, lt: 6, rt: 7,
  select: 8, start: 9, l3: 10,
} as const;

/** Which control set is on screen. Chosen per frame from live game state. */
export type TouchMode = 'field' | 'ride' | 'swim' | 'drive' | 'ui' | 'cine';

/**
 * The stroke glyphs, drawn in a 24x24 box.
 *
 * A 9 px word in a 54 px circle is not readable in the half-second a dodge
 * gets, and the first pass had nothing but words. These are deliberately in
 * the HUD's own language — thin strokes, no fill, no colour of their own — so
 * the control layer reads as part of the same interface rather than as an
 * overlay bolted onto it.
 */
export const GLYPHS: Record<string, string> = {
  // A blade, point up-right: the one verb that had to be unmistakable.
  attack: 'M20 4 L10 14 M20 4 l-6 0 M20 4 l0 6 M10 14 l-4 4 M6 14 l4 4 M4 20 l3 -3',
  // Two chevrons stepping aside.
  dodge: 'M13 5 L6 12 L13 19 M20 5 L13 12 L20 19',
  // The warp arrow, thrown.
  warp: 'M4 20 L20 4 M13 4 h7 v7',
  // A reticle. Brackets rather than a full box: it reads at 20 px.
  lock: 'M5 9 V5 h4 M19 9 V5 h-4 M5 15 v4 h4 M19 15 v4 h-4 M12 10.5 a1.5 1.5 0 1 0 .01 0',
  // The armiger's ring of blades, abstracted to a star.
  armiger: 'M12 3 L14 10 L21 12 L14 14 L12 21 L10 14 L3 12 L10 10 Z',
  // The interaction diamond, the same mark the world prompt uses.
  interact: 'M12 4 L20 12 L12 20 L4 12 Z',
  // A feather.
  chocobo: 'M19 4 C10 5 5 11 5 20 M19 4 C19 13 14 18 6 19 M9 20 L5 20 L5 16',
  // The Regalia, in profile.
  car: 'M3 15 h18 M4 15 l2 -5 h12 l2 5 M4 15 v3 h3 v-3 M17 15 v3 h3 v-3',
  // The same car, with the call arcs the chocobo's whistle would have.
  summon: 'M5 16 h14 M6 16 l1.6 -4 h8.8 l1.6 4 M6 16 v2.4 h2.4 v-2.4 M15.6 16 v2.4 H18 v-2.4 M3 8 a7 7 0 0 1 3 -3 M21 8 a7 7 0 0 0 -3 -3',
  // Menu and map, quiet by design.
  menu: 'M4 7 h16 M4 12 h16 M4 17 h16',
  map: 'M4 6 l5 -2 l6 2 l5 -2 v14 l-5 2 l-6 -2 l-5 2 Z M9 4 v14 M15 6 v14',
  // Driving.
  gas: 'M12 20 V7 M12 7 l-5 5 M12 7 l5 5',
  brake: 'M12 4 v13 M12 17 l-5 -5 M12 17 l5 -5 M5 20 h14',
  handbrake: 'M8 20 V9 a4 4 0 0 1 8 0 v11 M5 20 h14',
  exit: 'M14 4 H5 v16 h9 M11 12 h9 M16 8 l4 4 l-4 4',
  skip: 'M5 5 L14 12 L5 19 Z M17 5 v14',
  // Swimming.
  surface: 'M12 20 V5 M12 5 l-5 5 M12 5 l5 5 M4 18 q4 -3 8 0 q4 3 8 0',
  dive: 'M12 4 v15 M12 19 l-5 -5 M12 19 l5 -5 M4 6 q4 -3 8 0 q4 3 8 0',
};

export interface SlotDef {
  id: string;
  cluster: 'fan' | 'rail' | 'top' | 'left';
  /** Diameter class. `tc-xl` is the primary; `tc-xs` is a utility. */
  cls: 'tc-xl' | 'tc-lg' | 'tc-md' | 'tc-sm' | 'tc-xs';
  left: number;
  top: number;
  /** Resting pad index; a mode may re-point it. */
  pad?: number;
  key?: string;
  label: string;
  /** Key into {@link GLYPHS}. */
  icon?: string;
  /** `world` is the rail's cut-corner family; `primary` is the gold one. */
  family?: 'primary' | 'world' | 'utility';
  /** Show the label under the glyph rather than instead of it. */
  showLabel?: boolean;
}

/**
 * The fan, as a fan.
 *
 * Distances from the corner pivot at the cluster's bottom-right, so the
 * ordering is legible as a table rather than only in a picture:
 *
 * | slot | dia | dist | why there |
 * |---|---|---|---|
 * | ATTACK   | 84 | 113 | innermost, the thumb's rest position |
 * | DODGE    | 66 | 177 | the other reflex, one step out |
 * | INTERACT | 70 | 192 | frequent but never urgent; up the arc |
 * | WARP     | 54 | 200 | mid-fight, less often than dodge |
 * | ARMIGER  | 54 | 257 | rare and gauge-gated; hidden until ready |
 * | LOCK     | 54 | 249 | set once per fight, not during a combo |
 */
export const SLOTS: SlotDef[] = [
  { id: 'attack', cluster: 'fan', cls: 'tc-xl', left: 166, top: 88, pad: PAD.x, label: 'ATTACK', icon: 'attack', family: 'primary', showLabel: true },
  { id: 'interact', cluster: 'fan', cls: 'tc-lg', left: 197, top: 9, pad: PAD.a, label: 'INTERACT', icon: 'interact', showLabel: true },
  { id: 'dodge', cluster: 'fan', cls: 'tc-md', left: 81, top: 115, pad: PAD.b, label: 'DODGE', icon: 'dodge', showLabel: true },
  { id: 'warp', cluster: 'fan', cls: 'tc-sm', left: 119, top: 35, pad: PAD.y, label: 'WARP', icon: 'warp' },
  { id: 'armiger', cluster: 'fan', cls: 'tc-sm', left: 31, top: 53, pad: PAD.lb, label: 'ARMIGER', icon: 'armiger' },
  { id: 'lock', cluster: 'fan', cls: 'tc-sm', left: 7, top: 145, pad: PAD.rb, label: 'LOCK', icon: 'lock' },
  // The rail. Their own family, their own row, and never inside the fan.
  // The rail lays itself out with flex, so these two carry no offsets: DOM
  // order is the only thing that decides which sits left.
  { id: 'car', cluster: 'rail', cls: 'tc-lg', left: 0, top: 0, key: 'KeyF', label: 'CAR', icon: 'car', family: 'world', showLabel: true },
  { id: 'chocobo', cluster: 'rail', cls: 'tc-lg', left: 0, top: 0, key: 'Digit6', label: 'CHOCOBO', icon: 'chocobo', family: 'world', showLabel: true },
  // Utilities, top-left, which is the one corner the HUD leaves empty.
  { id: 'map', cluster: 'top', cls: 'tc-xs', left: 0, top: 0, key: 'KeyM', label: 'MAP', icon: 'map', family: 'utility' },
  { id: 'menu', cluster: 'top', cls: 'tc-xs', left: 52, top: 0, pad: PAD.start, label: 'MENU', icon: 'menu', family: 'utility' },
];

/** What a slot becomes in a given mode. */
export interface SlotState {
  label?: string;
  icon?: string;
  pad?: number;
  /**
   * `off` means gone, not greyed.
   *
   * Six ghost discs at 44% opacity floated over the middle of the first
   * layout's frames, and a control you cannot press is not worth a hole in the
   * picture. The one exception is INTERACT, which dims in place — the player
   * has to know where the contextual verb will appear before there is one.
   */
  off?: boolean;
  dim?: boolean;
}

/**
 * Per-mode overrides. Anything a mode does not mention keeps its `SLOTS` entry
 * and stays enabled.
 *
 * `drive` is the only re-point: the three the thumb already knows become
 * throttle, brake and handbrake rather than growing a second arc. Throttle and
 * brake are the analogue triggers, so they get the 0.25 s ramp `VirtualPad`
 * applies to indices 6 and 7 — a car that snaps to full lock on touch is not
 * driveable.
 */
export const MODES: Record<TouchMode, Record<string, SlotState>> = {
  field: {},
  ride: {
    attack: { off: true },
    dodge: { off: true },
    warp: { off: true },
    lock: { off: true },
    armiger: { off: true },
    car: { off: true },
  },
  swim: {
    // `Swim` reads pad 0 and 1 already — the same two buttons, relabelled.
    interact: { label: 'SURFACE', icon: 'surface' },
    dodge: { label: 'DIVE', icon: 'dive' },
    attack: { off: true },
    warp: { off: true },
    lock: { off: true },
    armiger: { off: true },
    chocobo: { off: true },
    car: { off: true },
  },
  drive: {
    attack: { label: 'GAS', icon: 'gas', pad: PAD.rt },
    dodge: { label: 'BRAKE', icon: 'brake', pad: PAD.lt },
    interact: { label: 'HANDBRAKE', icon: 'handbrake', pad: PAD.a },
    warp: { off: true },
    lock: { off: true },
    armiger: { off: true },
    chocobo: { off: true },
    car: { label: 'EXIT', icon: 'exit' },
  },
  cine: {
    // A cutscene owns the screen. One button, and it is the one the scene
    // already answers: `Cinematics.update` skips on `gp(1)`, the DODGE slot.
    dodge: { label: 'SKIP', icon: 'skip', pad: PAD.b },
    attack: { off: true },
    interact: { off: true },
    warp: { off: true },
    lock: { off: true },
    armiger: { off: true },
    chocobo: { off: true },
    car: { off: true },
    menu: { off: true },
    map: { off: true },
  },
  ui: {
    // Sticks unmount and `Input.update` zeroes move/look anyway; what is left
    // is the d-pad path every menu screen already reads.
    interact: { label: 'SELECT', icon: 'interact' },
    dodge: { label: 'BACK', icon: 'dodge', pad: PAD.b },
    attack: { off: true },
    warp: { off: true },
    lock: { off: true },
    armiger: { off: true },
    chocobo: { off: true },
    car: { off: true },
    map: { off: true },
  },
};

/** D-pad indices, used only by the `ui` mode's arrow cluster. */
export const DPAD = { up: 12, down: 13, left: 14, right: 15 } as const;
