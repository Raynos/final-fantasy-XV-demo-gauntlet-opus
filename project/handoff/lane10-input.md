# Lane 10 — Input truth

Plan: `docs/plans/2026-08-30-fable-to-nine.md`, items 29–32.
Owned: `src/ui/` (ControlsScreen, Prompts, Hints, ArmigerScreen, ui.css),
`src/world/vehicle/RegaliaSystem.ts` (rebinds only),
`src/tools/probes/regaliadrive.mts` (the sign gate). Also touched
`src/tools/uxcheck.mts` (its collision gate was the reason 30 shipped) and
added two `src/tools/_probe/` instruments.

**All four items landed.** Commits: `5be914f`, `a009d0e`, `b0da426`,
`b3dbbdc`, `45c89f3`, `a55d16c`.

## 29 · The controls card — LANDED, verified by eye

Five combat rows named keys the game does not read; the heavy attack was not on
the card at all. Every row is now checked against the `input.keyDown` call that
implements it in `CombatSystem._readInput`:

| card said | code |
|---|---|
| `R` Point Warp | `KeyE` |
| `X` Armiger | `KeyR` |
| `Y` Lock On | `KeyV` |
| `6`–`8` Cast Magic | `KeyZ` `KeyX` `KeyB` |
| (missing) | `KeyF` heavy attack |

**The pad column was wrong too.** 17 of 44 rows have no `gpButton`/`gpDown`
behind them — Point Warp, heavy, the firearm, Let Ignis Drive, the whole in-car
cluster, shop quantity, the card's own close key. They print a dimmed dash with
a footnote, not a button name (and not the words "Keyboard only" seventeen
times). Lock On was printed as R3; `gpEdge(5)` is R1 — R3 is button 10/11.

`Prompts.ts` repeated three of the wrong pairs (`Y` Lock-On, `R` Point-Warp,
`X` Armiger) and is fixed. `ArmigerScreen.ts:239` already said R and now agrees
with the card. `.ctrl-grid` stretches its plates so the four groups share a
baseline instead of ending at four heights over a 160 px void.

**Verified:** `tmp/shots/lane10-after2/menu_controls.png` — four equal-height
plates between the title rule and the footnote; Combat reads LMB / F / RMB /
Space / Q / E / R / V / 1–5 / Z X B / G J K; the Regalia column shows Y, U, O;
the pad column is quiet, only real bindings print a name.

## 30 · Key collisions — LANDED, measured

**Driving is not a mode.** `CombatSystem.update` gates `_readInput` on
`input.enabled` and its own `scenarioLock`; nothing sets either when the player
gets into the car, and `isDriving` has three readers in the tree, all UI.

`src/tools/_probe/inputcollide.mts` (new) drives on the highway and counts
combat **calls**, not outcomes — an outcome is conditional, and
`setLockOn(autoTarget())` with no enemy nearby changes nothing and would have
read as "no collision". Verbatim:

```
driving = true, input.enabled = true, scenarioLock = false
  KeyV  -> cam: chase -> cinematic      KeyT  -> offRoad: false -> true
  KeyB  -> station: 0 -> 1              KeyF  -> driving: true -> false
  Space -> state: idle -> dodge
combat verbs CALLED during those five presses, while driving:
  heavy 1 · dodge 1 · drawEnergy 1 · castSlot 1 · setLockOn 1
  tryArmiger 0 · warpToPoint 0     (controls — neither key was pressed)
```

Rebound on the Regalia side: **camera V→Y, Type-D T→O, radio B→U.**
`enter` (F) and `handbrake` (Space) deliberately left shared — F is the most
documented binding in the game (card, first-run hint, Hammerhead's interaction
prompt, `Prompts.ts`, `regaliadrive`) and Space is a handbrake. Their real fix
is one line in `CombatSystem.update`; that is lane 11's file, **filed not
taken** (see Residue).

Also fixed: the in-car HUD prompt printed `G` for "Let Ignis drive", which is
`KeyI` (G is Gladiolus' technique). It reads its glyphs off `KEY` now.

**And the gate that should have caught all of this**: `uxcheck.mts` section 8
carried `if (owners.has('regalia') && owners.size === 2 …) continue;` under the
comment "driving and on-foot combat are mutually exclusive states". It excused
exactly the population the defect lived in, and `Space` was not even in its
pattern. Replaced with `SHARED_ON_PURPOSE`, a per-key allowlist with a written
reason each. Replayed against `5be914f^`: old gate green, new gate flags KeyV,
KeyB, KeyT; on the tree as it is now, none.

## 31 · Steering sign gate — LANDED, falsified

`regaliadrive`'s steering assertion was `Math.abs(h1 - h0) > 0.3`, symmetric
under negation of `steer` by construction — there is no car it can tell from
its own mirror image, which is why the mirrored Regalia shipped past 19 gates
and 142 shots and was found by a human in a minute.

Section 2b is signed, two-sided (A must be positive, D negative), and measures
the **path** — direction of travel from world positions, accumulated group by
group so it cannot wrap, plus which side of its old course the car is on after
one second. The chassis heading is then checked to *agree* with the path,
which is a different question. Green: A rotates the course +52°, 3.9 m left;
D −43°, 4.0 m right; heading deltas +127 / −89.

Two false failures were designed out and are documented in the file: four
seconds of full lock at 159 km/h is more than a full circle (atan2 wrapped
+245° to −115°), and running on from the top-speed test leaves the car in a
ditch rotating 75° while its path moves 0.1 m. It now snaps to the carriageway
and accelerates to 55 km/h first, and `it is moving while it steers` fails
loudly if that ever breaks.

`src/tools/_probe/steerfalsify.mts` (new) wraps `_playerControls` to negate
`c.steer` — the shipped bug exactly — and runs the gate's own predicate:

```
as shipped      A   51 deg /  4.0 m   D  -38 deg /  -4.0 m  -> gate PASSES
steer negated   A  -41 deg / -4.0 m   D   55 deg /   4.0 m  -> gate FAILS
```

## 32 · Armiger caption — LANDED, verified by eye; the tail is answered

`.arm-gauge .d` is the only line telling a player how to use the Armiger and
was the least legible text in the menus: 8.5px `--ink-4` (0.34 alpha), no
text-shadow, over a live game frame, in a 250px box that broke the sentence so
its second line was the word "pad." Now `--ink-2` + `--sh-text`, 9.5px, 1.75
leading, .09em tracking, 300px box.
**Verified:** `tmp/shots/lane10-after2/menu_armiger.png` — one clean line under
the gauge bar, "Full gauge calls the royal arms. R, or L1 on a pad."

**"Two-column screens ~35% empty" is real and now names screens.** The obvious
suspect was wrong (the controls card is four columns), so
`src/tools/_probe/menufill.mts` measures every registered screen: how far down
the reading band (150–812 px, title rule to footer legend) its lowest **ink**
reaches. Ink only — the first version counted any painted box and reported
0–6% for all sixteen screens, because the Armiger divider and every `.plate`
run the full band height.

```
elemancy 54% · inventory 49% · system 40% · photo 38% · quests 35%
armiger 29% · archives 8% · main 8% · gear 6% · rest ≤2%
```

Not acted on — five screens' layout is not this lane — but the numbers exist
against a re-runnable instrument.

## Gates run

- `uxcheck.mts` **93/93 passed**, including the strengthened section 8.
- `regaliadrive` at HEAD: **full PASS**, all five sections.
- `pnpm run check`: running at the time of writing; pre-commit (build + both
  typechecks + 4 cheap gates) passed on every one of the six commits.
- No perf numbers taken — the tree was busy with seven other lanes all session.

## Residue

- **`CombatSystem.update` should skip `_readInput` while the Regalia is being
  driven.** One line. Fixes F/heavy and Space/dodge, and would let camera,
  Type-D and radio revert to V/T/B. Lane 11's file. When it lands, remove the
  two entries from `uxcheck.mts`'s `SHARED_ON_PURPOSE`.
- `CombatSystem._readInput`'s comment claims "gamepad face buttons mirror the
  keyboard verbs one for one". Point Warp, the heavy attack and the firearm
  have no pad binding at all. Bind them or soften the comment.
- `project/TASKS.md` line 16 ("No gate drives the car… a gate that holds a key
  and asserts the sign is the gap") is closed by `b0da426`.
- Five menu screens sit 29–54% empty below their last line, measured. If
  anyone takes them, `menufill.mts` is the before/after.

## Public surface kept stable

`ShopScreen.ts` and `HuntBoardScreen.ts` were **not touched** — lane 19 can
lean on them unchanged. `WorldMapScreen.ts` (lane 17's) untouched; its new
map→autodrive section 5 in `regaliadrive` passes alongside my section 2b.

## Open questions

None.
