# Game Studio v3 — fix what the audit found, then finish the shells

Status: **LOCKED (2026-09-02, fable)** — builds on
`project/archive/plans/2026-09-02-opus-game-studio-v2.md` (archived 2026-09-02
as SUPERSEDED by this plan), whose architecture (three boot profiles, no game
in the studio) stands.

**F1 and F2 are landed** — see the mobile-UI commit of 2026-09-02. F2 took the
keyframe route rather than the inner wrapper this plan names: `fd-up-c` carries
the `translateX(-50%)` the centring needs, which is one rule instead of one
more node. Their instruments (`studiocheck` under the iPhone descriptor, the
bounding-box centre assertion) are **not** built and are still this plan's. This plan is the audit's order of work, made into
lanes with instruments. Audit: `project/audits/2026-09-02-studio-v2-audit.md`.

## 0. Where v2 left it

Measured on the live path with `studioshots.mts`: front door interactive in
**129 ms / 135 ms** (desktop / phone), **0** systems for the door and models,
**exactly 5** for the world, **56/56** models build, **0** characters in either
scene, suite **24/24**. The architecture claim holds. What is wrong is above it.

## 1. Lanes

Each lane is one concern, one commit, one instrument. Nothing here touches
`Game.ts` or `Shots.ts` (BRIEF rule 4).

### F1 · The mobile menu draws — *now*

`install()` ends with `show(null)` → `setSection(null)`, which early-returns
because a fresh shell's `section` is already `null`. The mobile shell builds
its menu inside the redraw that therefore never fires; desktop's status line is
empty at the menu for the same reason.

Fix: `install()` calls `draw(null)` directly in both shells. `setSection` keeps
its early return — it is correct for a *change*; the first paint is not one.

Instrument: `studiocheck` opens the studio under the iPhone descriptor too and
asserts `#studio .st-item` count ≥ 5 before any section is opened.

### F2 · The front door is centred — *now*

`.fd-menu` is centred by `transform: translateX(-50%)`; its `fd-up` keyframe
ends at `transform: none` and wins. Fix: the slide-in animates an inner wrapper,
the outer keeps the translate. (A parallel edit to `FrontDoor._scale` is already
in the tree, dropping `zoom` on touch — keep it; it is the other half of the
phone door.)

Instrument: `studioshots` frame `*-1-door.jpg`; and `studiocheck` asserts the
menu's bounding-box centre is within 4 px of the viewport centre on both
descriptors.

### F3 · Enemies face the reviewer again — *now*

`_enemy()` sets `heading = 0` and `pinFacing()` skips enemies. Fix: in
`select()`, after `stage.show()` and before `applyPose()`, set
`enemy.heading = stage.subjectYaw()` — the v1 behaviour, which `freeze` then
applies every pose. `rigforward.mts` measured the creature roster facing +Z;
no half-turn.

Instrument: `studiocheck` reads `enemy.heading` after selecting `bloodhorn` and
asserts it equals `stage.subjectYaw()` ± 0.01.

### F4 · Towns, cities and dungeons are geometry — *next, its own audit first*

"Just the geometry of the world" is currently five systems, and Hammerhead is
one shed because the settlement is the `Hammerhead` **system**; cities are
`CityHub`; dungeon interiors are `Dungeons`. Their `init`s read `Interaction`,
`Regalia`, `RpgSystem`, `Menus`, `HUD`, `Player`, `Party`, `Audio`.

Step 1 — audit every one of those reads the way v2 §3.3 did for the five, and
write the table down. Step 2 — where a read is unguarded, guard it in that
system's own file (allowed; they are not `Game.ts`). Step 3 — where geometry
and gameplay are built in one `init`, split so the geometry half can be called
alone. Step 4 — add the three to `WORLD_SYSTEMS` and to `showWorld()`'s root
toggle.

Instrument: `studiocheck` asserts the world set is exactly eight, still no
forbidden object in the scene, and that Hammerhead's arrival frame contains the
garage kit — checked by mesh-name census (`town_*` count > 20), not by eye.

### F5 · Portrait framing and model lighting

`ModelStage.show` fits from radius alone against an assumed landscape frustum.
Fit against `min(aspect, 1)` and lift the pivot on a tall viewport. Lighting:
auto-exposure keys off the mid-grey backdrop and the key never dominates —
either pin exposure in the `none` profile or drop the backdrop luminance until
the key's highlight side is measurably brighter than the backdrop.

Instrument: `studioshots` phone model frame; and a luminance probe — mean of
the subject's projected pixels vs mean of the backdrop, asserted > 1.3×.

### F6 · No placeholder over a live viewport; mobile sections

Mobile Model and World print "Not built yet" across a working frame. The
sections themselves are v2's V7: drill-down list → viewport with a bottom
sheet; one finger orbits, two pinch; the World list stays portrait and the JIT
landscape gate fires on *flight*, not on the list.

Instrument: `touchcheck` extended — drill to a model and back, every target
≥ 44 px, no `RotateGate` visible in portrait until flight.

### F7 · `showWorld()` stops guessing

It toggles `group|root|mesh|dome|sky` on each system. Replace with each of the
world systems exposing a `root: Object3D` (a one-line getter in each file where
absent). Instrument: `studiocheck` walks World → Models and asserts no mesh
named `terrain*`/`veg*` is visible.

### F8 · The studio menu has a backdrop; exit re-renders the door

The `none` profile's empty scene leaves the menu on black. Carry the front
door's gradient through as the studio's ground, and make `close()` re-render
the door instead of reloading. Instrument: `studioshots` menu frame is not
> 95 % black pixels; exit-to-door measured < 200 ms.

### F9 · v2's V4–V6, unchanged

List engine (reconcile by key, search with `-` exclusion, scroll retention,
windowing above 200 rows), the `Cmd+K` palette, thumbnails and tile view. As
planned in v2 §4.

## 2. Order

F1 F2 F3 in one sitting — they make the phone usable and the door look
finished. F4 next, audit before code. F5–F8 as one Model/shell pass. F9 last.

## 3. Definition of done

- `pnpm run check` green with `studiocheck` extended per lane above.
- `studioshots.mts` frames on both descriptors read: centred door, menu on a
  ground, a three-quarter creature, a town at Hammerhead, no placeholder text
  over a viewport.
- World profile is **eight** systems and still contains nobody.
- Deployed via `deploy.mts`, looked at on a real phone.
