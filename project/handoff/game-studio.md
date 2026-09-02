# Game Studio — handoff

**Live: <https://ff15-xv-opus.vercel.app>** — the front door ships to everyone.
`pnpm run check` **23/23 in 208 s**. Plan:
`docs/plans/2026-09-02-opus-game-studio.md` (LOCKED, 12 decisions in §12).

Deploy with **`node src/tools/deploy.mts`**, never a bare `vercel deploy` — read
that file's header before you touch anything Vercel-shaped.

---

## What is built

| lane | state |
|---|---|
| L1 front door, shell, `?studio=1`, demo row removed | **done**, `caf105d` `61d782b` |
| L2a Model Explorer | **done**, `a8167f0` |
| L2b World Explorer | **done**, `94a7dc6` |
| L3 mobile shell | **skeleton only** — drill-down and chrome exist, sections render "not built yet" |
| L4 chocobo + Regalia families | not started |
| L5/L6 in-situ props, isolate toggle | not started |
| L7 prop kits on a synthetic site | not started |
| Shot Gallery, Look Lab, Notes, Device | **not started** — they route and render a placeholder |

Shot Gallery is a **must-have** (decision 9) and is the largest hole.

## The shape, in one paragraph

`TitleScreen` gained a `stage` field: `front` shows PLAY / GAME STUDIO, PLAY
swaps in the game's own menu behind the same crest and the same attract camera.
It is two *menus*, not two screens — a separate FrontDoor would have re-run the
whole 3.4 s title animation and needed its own copy of 84 lines of CSS scoped
under `#title`. `main.ts` injects `story.onStudio`, so `StorySystem` holds no
reference into `src/studio/`. `StudioShell` pauses the game, registers itself
last so its `lateUpdate` is the final word on the camera, and owns one `Freecam`
and one `Stage` for every section.

## Five things that will bite you

1. **`game.paused` stops the world LOADING, not just playing.** `Props.update`
   builds and packs POI sites, at most one per frame, and `paused` skips every
   `update()`. `StudioShell.pumpWorld` calls `Vegetation` and `Props` directly
   for world-facing sections. Before it: 12 arrivals, 12 ten-second holds,
   `settled=false` at every one. After: `held=0.0s`, `settled=true` at all 12.
   `Terrain.update()` is empty — nothing to pump.
2. **`Stage.exit` restores `#ui`, `#title` and `#hints`.** So leaving the Model
   Explorer hands the game's UI back on top of the studio.
   `StudioShell.hideGameUi()` re-hides every frame rather than fighting over who
   owns the saved `display`. Exit is a reload, so nothing needs restoring.
3. **A rotation written once does not stick.** A hero's held animation drives
   its root every frame, the same way `EnemyBase.freeze` rewrites rotation from
   `heading`. `ModelExplorer.pinFacing()` re-writes it every frame, after the
   stage has moved the camera.
4. **The party rig faces +Z.** Measured, not guessed:
   `_probe/rigforward.mts` reads Noctis's eye meshes at **local z = +0.073**.
   `Stage.subjectYaw()` was right; the half-turn that looked like the obvious
   fix is 180° wrong. Two visual attempts disagreed with each other before
   anybody measured.
5. **Never write a registry count down.** `AssetBrowser`'s header says "eight
   townspeople"; the plan hand-counted 17; the registry answers **18**. Counts
   are read at runtime everywhere, and `studiocheck` should assert them.

## Known gaps, in the order they hurt

- **Shot Gallery, Look Lab, Notes, Device are placeholders.** Routing, chrome,
  keyboard and the mobile stack are all in place; each needs its body.
- **The mobile shell renders no section.** L3 is the plan's only medium-risk
  lane that is not also its last, and the studio is unusable on a phone beyond
  the menu today. The JIT landscape gate (decision 8) is **not written**: it
  belongs at exactly two thresholds — committing to New Game/Continue, and
  entering world *flight* after a destination is picked. Not on opening the
  World Explorer's list.
- **The studio opens on whatever camera the page had.** Plan §12 leaves "does
  the studio get its own attract camera" open. It currently inherits the
  gameplay camera, so the party can be standing in the menu shot.
- **`studiocheck.mts` does not exist.** DoD §11.3. `_probe/studiodoor.mts`
  already contains most of it — it drives the four screens by **clicking**, and
  ends with a sweep asserting all 50 assets in all 4 families build with no
  error. Lift it into a gate.
- **The Signature twelve are a first draft picked off the map.** Decision 4 says
  they get chosen by flying there and looking. `_probe/studioworld.mts` writes
  the contact sheet; nobody has judged it yet.
- **Gladio is 289,294 triangles.** Not a studio bug — a finding the studio
  exists to surface, against BRIEF rule 3's ~2.5 M phone budget.

## The probes

- `_probe/studiodoor.mts` — front door, play menu, studio, model explorer, and
  the 50-asset build sweep. `--shot tmp/shots/x/s.jpg --dirty`.
- `_probe/studioworld.mts` — flies the Signature band, one frame each.
  `--ttl 25`.
- `_probe/rigforward.mts` — which local axis is a rig's front, by eye-mesh
  centroid. Re-run it before believing anything about facing.
- `_probe/herofacing.mts` — the four-rotation ablation that failed to settle the
  question, kept because it is the record of *why* measurement replaced looking.

`shoot.mts` cannot photograph any of this: it drives a `?shoot=1` page, and
`?shoot=1` is precisely the flag that suppresses the title and the studio. Use
`probe.mts`, which screenshots the page rather than the canvas.
