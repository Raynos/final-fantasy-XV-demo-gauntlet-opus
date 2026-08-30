# Lane 10 — Input truth

Plan: `docs/plans/2026-08-30-fable-to-nine.md`, items 29–32.
Owned: `src/ui/` (ControlsScreen, Prompts, Hints, ArmigerScreen, ui.css),
`src/world/vehicle/RegaliaSystem.ts` (keymap only),
`src/tools/probes/regaliadrive.mts` (the sign gate). Also touched
`src/tools/uxcheck.mts` (its collision gate was the reason 30 shipped) and
**`src/combat/CombatSystem.ts`, one line, as a coordinator-authorised
cross-lane one-liner** (`da4530c`, committed alone). Three new instruments in
`src/tools/_probe/`: `inputcollide.mts`, `steerfalsify.mts`, `menufill.mts`.

**Status: finished. Nothing is mid-flight; no next step is owed.** A fresh
agent picking this up would be starting new work, not continuing mine.

**All four items landed, and task 30 is closed at the root rather than worked
around.** Commits, in order:

| sha | what |
|---|---|
| `5be914f` | Regalia rebinds V/T/B → Y/O/U + `inputcollide.mts` |
| `a009d0e` | the card + `Prompts.ts` + `Hints.ts` |
| `b0da426` | signed steering gate + `steerfalsify.mts` |
| `b3dbbdc` | Armiger caption + `menufill.mts` |
| `45c89f3` | dash column + stretched plates |
| `a55d16c` | uxcheck's regalia exemption removed |
| `de565f8` | LANDMINES: two gates that excused their own population |
| **`da4530c`** | **the cross-lane one-liner: combat stops reading the keyboard while driving** |
| `b99c595` | V/T/B restored; uxcheck §7.5 *measures* the mode |
| `fb2a507` | regaliadrive: settle the car on the road before §3 |
| `f4ab3a5` | TASKS + LANDMINES ending |
| `1592ac2` | TASKS de-duplication |
| `38ba6e9`, `7c40a66`, (this) | handoff |

Two harness papercuts met on the way, both filed in `TASKS.md`:
`ui-shoot.mts` has **no `--jpeg` flag** — it prints `unknown scene --jpeg` and
writes PNGs anyway, which several briefs' command lines suggest — and an
untracked `shots/` directory appeared at the repo root (not this lane's).

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

**Closed at the root, not worked around.** The keys were first rebound
Regalia-side (V→Y, T→O, B→U) as a lane-local workaround, because the real fix
was one line in lane 11's file. The coordinator then authorised that line as a
named cross-lane one-liner and it landed alone in **`da4530c`**:

    const driving = !!(game.get && game.get('Regalia')?.isDriving);
    if (input.enabled !== false && !this.scenarioLock && !driving) this._readInput(input, dt);

Same probe, same scene, before and after:

```
while driving   heavy  dodge  drawEnergy  castSlot  setLockOn
  before          1      1        1          1          1
  after           0      0        0          0          0
on foot           1      1        1          1          1
```

**That last row is the one that matters.** A mode guard is one `&&` away from
switching combat off altogether, and "no combat verb fired while driving" is
exactly what a one-sided check wants to see — the widest possible guard scores
a perfect green on it. So the probe grew a second arm: get out, stand in a
field, press the same five keys, and require all five back.

With the mode real, **V, T and B are back where every document in the game puts
them** (`b99c595`), and the card, strip and hint say so again.

Also fixed: the in-car HUD prompt printed `G` for "Let Ignis drive", which is
`KeyI` (G is Gladiolus' technique). It reads its glyphs off `KEY` now.

**And the gate that should have caught all of this**: `uxcheck.mts` §8 carried
`if (owners.has('regalia') && owners.size === 2 …) continue;` under the comment
"driving and on-foot combat are mutually exclusive states". It excused exactly
the population the defect lived in, and `Space` was not even in its pattern, so
the one collision a player could *see* could not be represented.

It went through two fixes and the second is the durable one. While the mode did
not exist, a per-key allowlist was right (`a55d16c`) — a category absorbs a new
defect silently, a named key cannot. Once `da4530c` made the mode real, the
allowlist became the same act of faith with more names on it, so the modal
exemption is back and is now **earned by a measurement inside the same gate**:
new §7.5 drives the car, presses the shared keys, asserts no combat verb
answers, then gets out and asserts every one does. §8's exemption is documented
as licensed by that pair — if 7.5 goes red the exemption is void.

`Space` stays in the pattern. Replayed against `5be914f^`: old gate green, the
intermediate gate flags KeyV/KeyB/KeyT; today, none.

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

Individual lane-owned gates only. **`pnpm run check` was NOT run** — the
coordinator took ownership of the full suite mid-session after eight lanes each
running nineteen gates jammed the box (25 concurrent `check.mts`, 36% of
harness time spent queueing); the run this lane had started was killed.
`pre-commit` (build + both typechecks + 4 cheap gates) passed on all fourteen
commits regardless.

`uxcheck.mts`, verbatim, at HEAD:

```
PASS  combat does not read the keyboard while driving
      — 0 combat verb calls from V/T/B/Space/F in the car
PASS  and every one of those verbs still fires on foot
      — 5/5 answered outside the car
PASS  no keyboard binding is claimed by two systems in the same mode
      — cross-mode pairs allowed only because 7.5 measured the mode
95/95 passed
```

`regaliadrive.mts` at HEAD — **full PASS**, all five sections:

```
ok  it is moving while it steers   A covered 40 m at 50 km/h, D 40 m at 30 km/h
ok  it steers at all               A 51 deg, D -45 deg over 2.5 s of lock
ok  A turns the car LEFT           +51 deg, 4.0 m left of its old course after 1 s
ok  D turns the car RIGHT          -45 deg, 4.0 m right
ok  and the two are opposite, not merely large
ok  the chassis heading agrees with the path it drove   A +103, D -127
```

One flake of my own making, found and fixed (`fb2a507`): both lock tests end
2.5 s into a full-lock turn, so §3 was handing Ignis a different patch of scrub
each run — 'rejoined after 5 s, 0% off' one run and a FAIL the next, on the
same commit. §2b now snaps the car back to the carriageway before handing over:
'handed over 2 m off it; rejoined after 0 s'.

**No perf numbers taken, and none should be quoted from this session** — the
tree was never quiet; seven other lanes were capturing throughout.

## Residue

Filed by the coordinator in `project/TASKS.md` under the lane-10 block; my own
duplicate lines were removed in `1592ac2`.

- `CombatSystem._readInput`'s comment claims "gamepad face buttons mirror the
  keyboard verbs one for one". Point Warp, the heavy attack and the firearm
  have **no** pad binding — which is why 17 of the card's 44 rows print a dash.
  Bind them or soften the comment.
- Five menu screens sit 29–54% empty below their last line (`menufill.mts`).
  **Lane 12 candidate**, deliberately not taken: plan rule 1 is "no section may
  grow".
- `ui-shoot.mts` has no `--jpeg` flag though briefs suggest one.
- An untracked `shots/` at the repo root; not this lane's.

**Nothing needs the human.** Nothing was left half-done.

## Public surface kept stable

`ShopScreen.ts` and `HuntBoardScreen.ts` were **not touched** — lane 19 can
lean on them unchanged. `WorldMapScreen.ts` (lane 17's) untouched; its new
map→autodrive section 5 in `regaliadrive` passes alongside my section 2b.

## Open questions

None. The one judgement call worth flagging to a future reader: `enter` (F) and
`handbrake` (Space) are still in both keymaps, and that is now correct rather
than tolerated — `CombatSystem` implements the mode, and `uxcheck` §7.5 proves
each run that nothing answers those keys from the driver's seat. Do not
"clean up" the overlap by rebinding either one; F is the most documented
binding in the game and a handbrake is Space.
