# Game Studio v2 — audit (2026-09-02, fable)

Method: read all 2,531 lines of `src/studio/` back, then photographed the real
`?studio=1` path on Desktop Chrome and an iPhone 15 Pro descriptor with the new
`src/tools/studioshots.mts` (`tmp/shots/audit/*.jpg`). Every finding below is
either a line of code or a frame; the ones that are only a hunch say so.

## What holds

- **The architecture claim is true and measured.** Front door interactive in
  **129 ms** (desktop) / **135 ms** (phone) with **0 systems booted**. Model
  Explorer: 0 systems, 56/56 assets build. World Explorer: exactly Sky, Terrain,
  Water, Vegetation, Props. No character object in either scene. `studiocheck`
  8/8, suite 24/24.
- The desktop Model and World frames read as a tool: list, viewport, numbers,
  controls, a truthful status line.

## Broken — fix before anything else

1. **The mobile studio menu is a black screen.** `phone-2-menu.jpg` shows a
   header, a footer strip, and nothing else. Cause: `install()` ends with
   `show(null)` → `setSection(null)`, whose first line is
   `if (this.section === id) return;` — and a fresh shell's `section` is
   already `null`, so `onSection` never fires and the mobile shell, which builds
   its menu inside `draw()`, never draws its first screen. Desktop only survives
   because its menu DOM is built statically in `install()`; its status line is
   empty at the menu for the same reason (`desk-2-menu.jpg`, bottom-left).
2. **The front-door menu is off-centre.** On desktop the PLAY plate spans
   x 800→1180 — its *left* edge is at the screen's centre. `.fd-menu` is
   centred with `transform: translateX(-50%)`, and the `fd-up` keyframe it also
   uses ends at `transform: none`, which wins. Same on the phone, where the
   rows hang off the right edge.
3. **"Geometry only" is missing the towns, cities and dungeons.** Hammerhead in
   `desk-4-world.jpg` is one red-roofed shed and a pole; in v1's full-game frame
   it was the garage complex. The settlement is built by the `Hammerhead`
   system, the cities by `CityHub`, dungeon interiors by `Dungeons` — none of
   which is in the five. And they are not trivially addable: `Hammerhead.init`
   reaches for `Interaction` ×3, `Regalia` ×3, `RpgSystem`, `Menus`; `CityHub`
   for `Interaction`, `HUD`, `Rpg`; `Dungeons` for `Player` ×6, `Audio` ×5,
   `Party` ×3. Whether those are guarded the way the five's dependencies were
   is unverified. This is the biggest content gap against "just the geometry
   of the world" and needs the same guarded-dependency audit §3.3 of the plan
   did for the five.
4. **Enemies no longer face the reviewer.** Bloodhorn is dead-on in both model
   frames. v1 set `enemy.heading = stage.subjectYaw()` at selection so `freeze`
   would apply it; v2's `_enemy()` sets `heading = 0` and `pinFacing()` skips
   enemies. Regression from the rewrite.
5. **Portrait framing is wrong.** On the phone the model sits in the bottom
   third (`phone-3-model.jpg`). `ModelStage.show` frames from radius alone and
   assumes a landscape frustum; in portrait the narrow axis is horizontal and
   the fit must use it.
6. **Placeholder text over a live viewport.** Mobile Model/World render "Not
   built yet — this lane is next." across a working model and a working world.
   Known gap (V7), but the text now contradicts the frame it sits on.

## Wrong-but-working

7. **Model lighting is flat.** The three-point rig is there, but the frame is
   dominated by the mid-grey backdrop sphere and auto-exposure keys off it; the
   model reads muddy with no rim. Either pin exposure in the model profile or
   drop the backdrop's luminance so the key can dominate.
8. **`showWorld()` guesses root property names** (`group`, `root`, `mesh`,
   `dome`, `sky`). If Terrain's root is called something else, going World →
   Models leaves terrain visible behind the turntable. Unverified; the gate does
   not test that path.
9. **The studio menu is drawn on a black void** (`desk-2-menu.jpg`). The `none`
   profile has an empty scene, so the menu floats on nothing. The front door's
   CSS backdrop should carry through, or the plan's open item (an attract
   backdrop) gets decided.
10. **Exit still reloads.** With nothing booted it could re-render the door.
11. **Terrain shows dark horizontal streaks** across the plain in both world
    frames. Both ran at `q=low`; likely a renderer artefact at that tier rather
    than a studio bug, and not investigated here.

## Still true from the v2 plan's own audit (§1)

Full DOM rebuild on every interaction and scroll loss; no search; no
thumbnails; no virtualization; list column overlays the viewport; mobile shell
has no sections. None started.

## Order

1 and 2 are one-line fixes and make the phone usable and the door look
finished. 4 is three lines. 3 is a lane of its own, with the dependency audit
first. 5 and 7 are the Model Explorer's next pass. Then V4–V6 as planned.
