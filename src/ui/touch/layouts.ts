/**
 * Where the buttons sit, and what each one means in each mode.
 *
 * **The geometry never changes.** A slot keeps its position and its size in
 * every mode; only the label, the pad index behind it and whether it is
 * enabled change. That is deliberate — the thumb learns one arc, and walking
 * into the car does not move the button it was resting on.
 *
 * Positions are px from the top-left of the slot's cluster, and the clusters
 * are anchored to the screen corners with the safe-area insets in
 * `touch.css.ts`. Nothing here scales with `uiScale()`.
 */

/** Standard-mapping indices, named so the layout table reads as verbs. */
export const PAD = {
  a: 0, b: 1, x: 2, y: 3,
  lb: 4, rb: 5, lt: 6, rt: 7,
  select: 8, start: 9, l3: 10,
} as const;

/** Which control set is on screen. Chosen per frame from live game state. */
export type TouchMode = 'field' | 'ride' | 'swim' | 'drive' | 'ui' | 'cine';

export interface SlotDef {
  id: string;
  cluster: 'right' | 'left' | 'top';
  cls: 'tc-lg' | 'tc-md' | 'tc-sm';
  left: number;
  top: number;
  /** Resting pad index; a mode may re-point it. */
  pad?: number;
  key?: string;
  toggle?: boolean;
  label: string;
}

/**
 * The eleven buttons, in DOM order.
 *
 * `chocobo` and `car` are the two dedicated context buttons and both are `lg`:
 * the bird and the Regalia are the two things in this world worth a permanent
 * thumb of their own, and neither has a pad binding to borrow — both go
 * through a synthesised key (`Digit6`, `KeyF`).
 */
export const SLOTS: SlotDef[] = [
  // The two context buttons take the top row: they are the two things in this
  // world worth a permanent thumb of their own, and neither has a pad binding
  // to borrow -- both go through a synthesised key (`Digit6`, `KeyF`).
  { id: 'car', cluster: 'right', cls: 'tc-lg', left: 62, top: 0, key: 'KeyF', label: 'CAR' },
  { id: 'chocobo', cluster: 'right', cls: 'tc-lg', left: 166, top: 0, key: 'Digit6', label: 'CHOCOBO' },
  // Then the combat arc, INTERACT nearest the corner where the thumb rests.
  { id: 'armiger', cluster: 'right', cls: 'tc-sm', left: 0, top: 42, pad: PAD.lb, label: 'ARMIGER' },
  { id: 'warp', cluster: 'right', cls: 'tc-sm', left: 196, top: 122, pad: PAD.y, label: 'WARP' },
  { id: 'dodge', cluster: 'right', cls: 'tc-md', left: 100, top: 132, pad: PAD.b, label: 'DODGE' },
  { id: 'lock', cluster: 'right', cls: 'tc-sm', left: 14, top: 148, pad: PAD.rb, label: 'LOCK' },
  { id: 'attack', cluster: 'right', cls: 'tc-md', left: 82, top: 212, pad: PAD.x, label: 'ATTACK' },
  { id: 'interact', cluster: 'right', cls: 'tc-lg', left: 162, top: 206, pad: PAD.a, label: 'INTERACT' },
  // Left thumb: the stick zone is invisible and floating, so the only drawn
  // control on this side is the sprint latch -- clear of the party bars, which
  // own the bottom-left corner at every viewport.
  { id: 'sprint', cluster: 'left', cls: 'tc-md', left: 0, top: 8, pad: PAD.l3, toggle: true, label: 'SPRINT' },
  { id: 'map', cluster: 'top', cls: 'tc-sm', left: 0, top: 0, key: 'KeyM', label: 'MAP' },
  { id: 'menu', cluster: 'top', cls: 'tc-sm', left: 62, top: 0, pad: PAD.start, label: 'MENU' },
];

/** What a slot becomes in a given mode. `off` dims it and eats its presses. */
export interface SlotState {
  label?: string;
  pad?: number;
  off?: boolean;
}

/**
 * Per-mode overrides. Anything a mode does not mention keeps its `SLOTS` entry
 * and stays enabled.
 *
 * `drive` is the only re-point: the three right-hand buttons the thumb already
 * knows become throttle, brake and handbrake rather than growing a second arc.
 * Throttle and brake are the analogue triggers, so they get the ramp
 * `VirtualPad` applies to indices 6 and 7 — a car that snaps to full lock on
 * touch is not driveable.
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
    interact: { label: 'SURFACE' },
    dodge: { label: 'DIVE' },
    attack: { off: true },
    warp: { off: true },
    lock: { off: true },
    armiger: { off: true },
    sprint: { off: true },
    chocobo: { off: true },
    car: { off: true },
  },
  drive: {
    interact: { label: 'HANDBRAKE', pad: PAD.a },
    attack: { label: 'GAS', pad: PAD.rt },
    dodge: { label: 'BRAKE', pad: PAD.lt },
    warp: { off: true },
    lock: { off: true },
    armiger: { off: true },
    sprint: { off: true },
    chocobo: { off: true },
    car: { label: 'EXIT' },
  },
  /**
   * A cutscene owns the screen. One button, and it is the one the scene
   * already answers: `Cinematics.update` skips on `gp(1)`, which is the DODGE
   * slot. Without it a phone player watches every cutscene to the end.
   */
  cine: {
    dodge: { label: 'SKIP', pad: PAD.b },
    interact: { off: true },
    attack: { off: true },
    warp: { off: true },
    lock: { off: true },
    armiger: { off: true },
    sprint: { off: true },
    chocobo: { off: true },
    car: { off: true },
    menu: { off: true },
    map: { off: true },
  },
  ui: {
    // Sticks unmount and `Input.update` zeroes `move`/`look` anyway; what is
    // left is the d-pad path every menu screen already reads.
    interact: { label: 'SELECT' },
    attack: { off: true },
    dodge: { label: 'BACK', pad: PAD.b },
    warp: { off: true },
    lock: { off: true },
    armiger: { off: true },
    sprint: { off: true },
    chocobo: { off: true },
    car: { off: true },
    map: { off: true },
  },
};

/** D-pad indices, used only by the `ui` mode's arrow cluster. */
export const DPAD = { up: 12, down: 13, left: 14, right: 15 } as const;
