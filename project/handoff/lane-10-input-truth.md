# Lane 10 — Input truth (cold-start brief)

Mission: plan tasks 29–32. Fix the controls CARD, not the code — the code is
correct and self-documented; the UI lies about it in three places.

Owns: `src/ui/` (ControlsScreen, Prompts, ArmigerScreen, ui.css), plus
`src/world/vehicle/RegaliaSystem.ts` for rebinds and
`src/tools/probes/regaliadrive.mts` for the sign gate.

## Anchors (all verified 2026-08-29/30)
- The CORRECT reference table is `src/combat/CombatSystem.ts:1458-1470`
  (JSDoc): E point-warp, V lock-on, R Armiger, Z/X/B spells, T deposit-draw,
  Q warp-strike, F heavy, Space dodge, 1–4/5 weapons.
- Wrong card rows, `src/ui/screens/ControlsScreen.ts`: :32 says R for
  Point Warp (code: KeyE, CombatSystem.ts:1511); :35 says X for Armiger
  (code: KeyR, :1513); :36 says Y for Lock On (code: KeyV, :1512); :38 says
  6–8 for magic (code: KeyZ/KeyX/KeyB, :1516-1518); heavy-attack F missing
  from the Combat group entirely (:1486).
- `src/ui/Prompts.ts:21` repeats two wrong pairs: `['R','Point-Warp'],
  ['X','Armiger']`.
- `src/ui/screens/ArmigerScreen.ts:239` says R (correct) — contradicts the
  card's X. After the card fix they agree.
- Collisions (combat vs Regalia driving): KeyT drawEnergy
  (CombatSystem.ts:1519) vs Type-D (RegaliaSystem.ts:60); KeyB castSlot(2)
  (:1518) vs radio (:61); KeyV lock-on (:1512) vs camera (:58); KeyF heavy
  (:1486) vs enter/exit (:57). RegaliaSystem.ts:50-55's own comment claims
  no on-foot collisions — it is wrong; fix the comment too. Check
  mode-exclusivity first: if combat input is dead while driving, document
  rather than rebind; rebind the REGALIA side only where genuinely live.
- Armiger caption: `src/ui/ui.css:914` — `.arm-gauge .d` is 8.5px,
  `--ink-4` = rgba(198,214,240,0.34) (ui.css:14), no text-shadow, in a
  250px right-aligned box (:911). Give it a readable ink + text-shadow like
  its `.k`/`.v` siblings (:912-913).
- Steering gate: `src/tools/probes/regaliadrive.mts` computes
  `dh = Math.abs(h1 - h0)` — sign discarded. Add an assertion that drives
  KeyA (`st += 1`, RegaliaSystem.ts:549) and asserts the SIGNED heading
  change direction. This is the gate the mirrored-steering bug demanded
  (commit 7043084).
- "Two-column screens ~35% empty" (task 32 tail): could not be identified —
  the controls grid is four columns (ControlsScreen.ts:12-70, ui.css:887).
  Capture the menu screens (`ui-shoot.mts`), look, and either name the real
  screen or close the item as a measured negative.

## Commands
- Captures: `node src/tools/ui-shoot.mts --jpeg` (menu shots);
  `node src/tools/shoot.mts combat_hud --jpeg` for the HUD strip.
- Gates: `node src/tools/uxcheck.mts`, `node src/tools/probe.mts
  src/tools/probes/regaliadrive.mts`, `pnpm run check`.

## First commits
1. ControlsScreen rows + Prompts.ts pairs + heavy-attack row (one commit —
   card truth).
2. Collision audit result: rebinds on the Regalia side where live + the
   RegaliaSystem.ts:50 comment correction + ControlsScreen rows for both
   modes.
3. regaliadrive signed-turn assertion.
4. Armiger caption restyle.

## Landmines
- Every instrument agreed while the steering was mirrored — a
  self-consistent frame fools all derived checks. The signed assertion must
  reference WORLD heading change under a known key, not any Regalia-internal
  quantity.
- `settings`/keybind hooks: none — bindings are hardcoded key strings at the
  sites above.

## Done-when
Every documented binding matches the code (uxcheck green, manual read of the
card vs CombatSystem JSDoc), regaliadrive asserts turn sign, the caption is
legible in a capture, collisions documented or rebound.
