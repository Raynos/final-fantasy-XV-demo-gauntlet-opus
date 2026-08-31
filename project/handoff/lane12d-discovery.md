# Lane 12d — discovery and the car

Playtest complaints **#5 (the map names three of 139 places)**, **#6 (the Regalia
has no material)**, **#8 (I could not find a chocobo)** and **#9 (I could not find
a shop)**. All four are "the world is full of content the player cannot find or
cannot see".

## Status: LANDED, all four. Gates green.

`uxcheck` **95/95** · `integration` **27/27** (was 26 pass · 1 not integrated —
my own anchor move went red first, see below) · `roadcheck` **0 failures, 0
warnings** · pre-commit build + both typechecks + 4 cheap gates green on every
commit. **`pnpm run check` not run — the coordinator owns the suite.**

## Commits

| sha | what |
|---|---|
| `140208c` | Controls card: the Chocobo group + a `chocobo` glyph in `Icons.ts` |
| `538c504` | The Regalia's env map was one black pixel; `_syncEnv` + a paint/satin/chrome pass |
| `4a6549c` | The chart gets a middle state; Enter refuses out loud; the footer names both axes |
| `2433512` | Far markers: things you can walk up to are visible past 2.6 m |
| `8ba721d` | The Crow's Nest counter was inside a sealed building; `integration` teleported in to test it |
| `e5f65cf` | A first-run hint says the whistle exists |
| `d966a44` | Five columns need a five-column layout |

## New instruments (all committed, all `--dirty`-safe)

- **`src/tools/probes/surveyreach.mts`** — how much of Lucis a road trip can
  ever find. Point-to-segment over the 5845 drivable route segments against
  each POI's own `r`.
- **`src/tools/probes/mapfeel.mts`** — drives the world map with real edge-set
  key presses and prints the card's four lines plus the footer after Enter.
- **`src/tools/probes/travelland.mts`** — **the gate the repo did not have**:
  fast-travels to every `travel: true` POI and reports whether the arrival is
  inside geometry and what is in reach when you land. Also shoots the arrival.
- **`src/tools/probes/carlook.mts`** — the Regalia at noon, three-quarters on
  at 6 m, which is the playtest's framing and which no shot in `Shots.ts`
  covers.

## The numbers, verbatim

    surveyreach (measured, --dirty)
      POIs 139 · known at boot 2 · listed at boot (fog > 0.5) 105
      discoverable by driving alone: 83/139
        chocobo 2/2  fishing 2/10  haven 7/21  tomb 1/10  menace 0/8
        dungeon 4/11  parking 23/25  outpost 8/8  reststop 4/4  town 3/3
        landmark 23/30  imperial 6/7
      r x 2 -> 102/139   r x 3 -> 115/139   r x 4 -> 121/139
      furthest out of reach: adamantoise_graveyard r=340 road 2184 m,
        crag_haven r=55 road 843 m, tomb_mystic2 r=62 road 774 m

    travelland (measured, --dirty)
      56 fast-travel destinations, 87 interactables
      arrivals inside geometry:        1/56   (meldacio_layby — NOT hammerhead)
      arrivals with NOTHING in reach: 35/56
      closest misses: hammerhead 7.0 m, lestallum 7.8 m, galdin_quay 7.8 m,
        lestallum_lookout 7.9 m, galdin_carpark 8.5 m, wiz_chocobo 10.0 m
      standing on the Hammerhead pin: prompt NONE; player y 13.45 / terrain 13.17
      every hammerhead fixture: huntboard 10.5 m/r2.9, diner 12.3 m/r2.8,
        garage_shop 7.0 m/r2.6, culless 30.1 m/r2.8, caravan 30.5 m/r2.8,
        pump 22.6 m/r2.6, rentabird 25.9 m/r2.6

    mapfeel (driven, --dirty)
      "UNSURVEYED REST STOP" / "Rest Stop · Longwythe, Leide"
      "…Get within 140 m of it and it names itself."
      "UNSURVEYED · WALK WITHIN 140 m · YOU ARE 1.12 km OFF"
      after Enter: screen stays open, footer "NOT SURVEYED — WALK WITHIN 140 m
        OF THIS REST STOP FIRST", class "wm-ft warn"
      ArrowDown: filter 0 -> 1, list 105 -> 15

## What landed, and what I saw

### #6 the Regalia — **verified by eye, biggest single win**

Root cause is one line in `RegaliaSystem.init`: it copied `scene.environment`
into six materials at boot. `Sky._updateEnv` **disposes** the previous PMREM
render target on every time-of-day change (`Sky.ts:1350`), and three.js
silently rebinds a disposed render-target texture to `emptyTextures` — a 1x1
RGBA(0,0,0,0) — because `setTexture2D`'s re-upload guard excludes render-target
textures. `setTimeOfDay` runs on the title screen, on every chapter start, in
all six story scenes and on every posed shot with a `time`. `chrome` is
`metalness 1.0`, so its *only* light is the env map: every mirror, bumper
blade, grille slat, rim and spoke was pure black, the clearcoat paint went with
it, and the shut lines had nothing to be a line against.

`_syncEnv` now re-points the pointer and scales the authored intensity by
`scene.environmentIntensity`. Then a material pass: `paint` `0x0a0b0e` @ 0.3 ->
`0x11141b` @ 0.8 with a full clear coat; a new `satin` for the chrome spear and
rocker sill, which at grazing angles were handing the camera a full-length
mirror of the sun; `chrome` 0.9 -> 0.95.

**Frames.** `regalia_cockpit` at HEAD-before: a solid black hood, two black
hooks for mirrors, one blown sun streak. After: chrome bezels, hood vents and
mirrors all read. `carlook front34_noon`: dark blue-black lacquer carrying the
sky gradient, chrome grille and rims, glass in the screen, panel lines on the
flank and boot.

*Not fixed, seen while looking:* the convertible's **interior is crude** — the
seats and dash are flat brown blocks and now that they are lit you can see it.
Pre-existing geometry (`Regalia.ts:426-480`), out of this lane's scope, filed
below.

### #5 the map — **verified by driving the screen**

The fog is deliberate and stays. What was wrong is that "unsurveyed" was doing
two jobs. The chart now has **three** states: unknown (outside surveyed
country, not drawn), **charted** (inside the boot road corridor: the TYPE is
drawn in the type's own hue at a third of the opacity, named in the card, with
the exact metres you must close — no name, no `does`, no fast travel), and
surveyed (unchanged). Plus: `accept()` refuses **in words** in an amber footer
for 2.5 s with `ui:cancel`, instead of a silent early return under a footer
that says `Enter — TRAVEL`; and the footer row splits `↑↓←→ Navigate` into
`←→ Place` and `↑↓ Filter`, which is the only place either is written down.

**Frame.** `menu_world` now reads as a map: faint fishing hooks by the lake,
faint havens on the ridge, two faint chocobo posts, one bright Hammerhead.

### #9 the shop — **diagnosed, then two fixes**

Not one bug, two.

1. **Nothing is ever in reach when you arrive.** 35/56. Reach is 2.6–3.8 m and
   a town is 60 m across, so the screen has nothing to say — and `E` with no
   prompt falls through to `CombatSystem.warpToPoint`, so each of the ten
   presses moved the player *further* from what they were hunting.
   Fix: a second prompt tier. `InteractionSystem.nearby` (≤8 items, ≤22 m,
   minus `current`) drawn by `InteractPrompt.updateMarkers` as small labelled
   diamonds that fade in from 22 m to the item's own reach. Follows the field
   HUD's visibility so it stays out of every posed and cinematic frame.
2. **The Crow's Nest counter is inside a sealed building.** No opening is cut
   anywhere in the diner and Hammerhead's merged meshes are collision, so the
   closest a 0.36 m capsule can get is 2.41 m against a 2.6 m reach — 19 cm of
   margin in a 1.9 m strip against the glass. `anchors.dinerDoor` had existed
   on the apron since the diner was built with nothing registered against it.

   **`integration` passed green over this**, because it stood the player at
   `dinerCounter.x - 1.3` — inside the building — by writing
   `player.root.position`, which bypasses `CollisionWorld`. It now stands 1.2 m
   out from the door anchor on the apron **and asserts `Collision.blocked` is
   false there** before it asserts anything about the prompt.

**Frame.** Standing on the Hammerhead fast-travel pin: two labelled diamonds,
SOPHIAR AUTO PARTS and CINDY AURUM, over a forecourt that a moment ago said
nothing at all.

*Measured negative:* the pad-height hypothesis (fast travel using raw
`terrain.heightAt` could drop the player under Hammerhead's graded pad) is
**false** — 1 of 56 arrivals is inside geometry and it is `meldacio_layby`.
Hammerhead lands at y 13.45 over terrain 13.17.

### #8 the chocobo — **landed**

A fifth column on the controls card (`Digit6` whistle/dismount/dismiss, `E`
ride through the standard prompt, WASD, `ShiftLeft` sprint — every row checked
against the `input.keyDown` call that implements it), a `chocobo` glyph in
`Icons.ts` because the set had none, and a first-run `Hints` card gated on
actually holding `chocobo_whistle`. The map change also surfaces both chocobo
posts as ghost pins reading CHOCOBO POST from boot.

## Files touched

Owned outright: `src/world/props/Regalia.ts`, `src/world/vehicle/RegaliaSystem.ts`,
`src/ui/screens/WorldMapScreen.ts`, `src/ui/screens/ControlsScreen.ts`,
`src/ui/Hints.ts`, `src/game/interaction/{Interactables,InteractPrompt,interact.css}.ts`,
four new probes.

**Shared, landed as their own explicit-pathspec commits and reported:**
`src/ui/Icons.ts` (one new glyph), `src/ui/Menus.ts` (one FOOT row),
`src/ui/ui.css` (the controls grid, forced by the fifth column),
`src/world/town/Hammerhead.ts` (one anchor), `src/tools/integration.mts`
(forced by that anchor — between the two commits the gate is red, so they land
together).

## Residue → `project/TASKS.md`

- **`tombreach.mts`, `reachall.mts` and `reaudit.mts` still teleport.** All
  three write `player.root.position` directly, so none can answer "is that a
  place a human can stand". `tombreach` says "Nothing is excluded" and it is
  right and it is still blind to the whole class. They owe the
  `Collision.blocked` assertion `integration` now carries.
- **`cityanchors.mts` has never been run over Hammerhead's hand-authored
  anchors** — it is the one probe that asks how many of the eight compass
  approaches to an anchor are clear, and it was written for the Lestallum and
  Galdin kits only.
- **35/56 fast-travel arrivals still have nothing in reach.** The far markers
  make that legible rather than silent, which is the fix I judged correct — a
  town you arrive in and walk across beats a teleport onto a counter. If
  someone disagrees, the fix is a per-POI arrival anchor in
  `WorldMapScreen.accept()` (`:379` teleports to the raw pin).
- **`meldacio_layby`'s fast-travel arrival is inside geometry** (1 of 56).
  Real, small, unfixed.
- **The Regalia's interior is flat brown blocks.** Seats, dash and bench are
  boxes (`Regalia.ts:426-480`); invisible while the car was black, visible now.
- **56 of 139 POIs cannot be discovered from any road at any speed** — tombs
  1/10, menaces 0/8, havens 7/21. Correct by design *given* the charted tier
  now gives the player a reason to walk there; worth a second look after the
  next playtest.
- **`E` with no prompt up fires a warp-strike** (`CombatSystem.ts:1529`). Inside
  a settlement that is a bad signal on its own; the far markers mean the player
  now has something to walk to first, but the fall-through is still there.

Nothing for `HUMAN_REVIEW.md`.
