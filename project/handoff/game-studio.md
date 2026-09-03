# Game Studio — live state

**Plan: `project/archive/plans/2026-09-02-fable-game-studio-v3.md`, DONE.** v2's
architecture stands verbatim — three boot profiles, no game in the studio — and
v3 was the audit's order of work. All three studio plans archived 2026-09-02;
read v3's status line for the three places the build differed from it.

## Where it is

**F1–F9 are landed.** `studiocheck` carries the instrument for each.

| lane | what | instrument |
|---|---|---|
| F1 | the mobile menu draws | `#studio .st-item` >= 5 under an iPhone descriptor, before any section |
| F2 | the front door is centred | bounding-box centre within 4 px, both descriptors |
| F3 | enemies face the reviewer | `enemy.heading` == `stage.subjectYaw()` ± 0.01 |
| F4 | towns, cities and dungeons are geometry | the world set is exactly `WORLD_SYSTEMS` (8), and Hammerhead's root holds > 20 meshes |
| F5 | portrait framing, model lighting | `fitFactor()` fits the binding half-angle; contrast probe > 1.3x |
| F6 | no placeholder over a viewport; mobile sections | drill in and back out, tapped through the DOM; every target >= 44 px; the gate fires on flight |
| F7 | `showWorld()` stops guessing | World -> Models leaves no `terrain*`/`veg*` visible |
| F8 | a ground under the menu; exit re-renders the door | `st-void` carries the door's gradient; `close()` calls `onExit` |
| F9 | list engine, palette, thumbnails, tiles | scroll survives a redraw by construction; `⌘K` over ~400 entries |

## The gotchas, and there are eight now

**Read 1, 2 and 6 before touching the Model Explorer.** Three of the eight were
each mistaken for a different bug first, and two of them cost a whole lane.



1. **`Freecam.apply` is a no-op while `enabled` is false, and the Model
   Explorer used to set it false.** `ModelStage.update` computed the turntable's
   camera pose every selection and it was thrown away every frame, so the
   audit's "the model sits in the bottom third" and "the lighting is flat" were
   *the same bug* and neither was a framing or a lighting bug — the lens was
   never moved. If a model ever looks wrongly placed again, check `fly()` first.

2. **Auto-exposure cancels any change to the backdrop.** Metering runs on the
   un-exposed HDR buffer and drives the frame toward `key`, so darkening the
   backdrop sphere just makes the integrator open up and put it back, taking
   the model with it — measured at 0.97x after a 0.42x albedo cut.
   `pinExposure(true)` in the model profile is what actually decides it, and the
   world sections turn it back on because there it is right.

3. **None of the eight world systems has a single root.** `Terrain` adds
   `clipmap.group`, `Water` four meshes at four points in its life, `Sky` a dome
   *and* a probe light, `Props` from three builders, `Dungeons` one group per
   entrance. So there is nothing to hand a `root: Object3D` getter to, and
   anything that tries to name the world by property is guessing. What the
   studio does instead is in gotcha 6 — and the reason it must re-check as the
   scene grows is here: `Props.mega`, `Hammerhead`'s build-on-approach and
   `Water`'s streaming all arrive long after the section was opened.

4. **`game-ready` is dispatched by `bootStudio` now.** Three systems defer real
   work to it on the phone (`Props.mega` 624 ms of skyline, `Dungeons` 1061 ms
   of entrance mouths, `TexBake`'s container fetch) and only `Game.init` used to
   fire it. Invisible on a desktop, where `demoActive()` is false and all three
   build inline — so a phone-only "the world is missing things" report starts
   here.

5. **iOS Safari does not reliably fire `click` on a `<div>`.** The whole mobile
   chrome shipped unresponsive because of it. Everything on that screen is a
   `<button>`; `studiocheck`'s phone phase drives it through real taps rather
   than through `window.__STUDIO`, precisely so a test cannot pass on a build a
   thumb cannot use.

6. **`visible = false` does not take the world out of the scene, and two
   versions of `showWorld` learned that the hard way.** It is a rendering hint
   on an object that is still in the graph: three.js walks it every frame
   anyway, anything that re-shows a child re-shows it for good, and a subtree
   added later has never heard of the toggle. The world is `scene.remove`d and
   parked in `_parked` now — exact, and the reason the Model Explorer stopped
   being slow with a world behind it. If you ever iterate `scene.children`
   while removing from it, you will skip every second object; that is what
   "some of the world went and some stayed" looked like.

7. **The front door blocks any harness page that is not explicitly routed.**
   `uxcheck` and `touchcheck` were red for weeks with a 300 s
   `waitForFunction` timeout and no error, because a play lease sat on the door
   waiting for a click — `{"systems":0,"bootLabel":"Loading"}` with a clean
   console is what that looks like from outside, and it is indistinguishable
   from a hang. `?play=1` is the bypass and the daemon adds it to every play
   lease. **Any new entry screen in `main.ts` must extend that guard.**

8. **A backtick inside a GLSL comment ends the TypeScript template literal.**
   The shader strings in `ModelStage` carry prose comments; one backtick in one
   of them turns the rest of the file into a syntax error whose reported
   location is nowhere near the cause. The compiler catches it, but only after
   you have read the wrong twenty lines.

## The instrument that got weaker, and should be sharpened

`studiocheck`'s contrast probe read **2.50x over 20.8% of frame** against a bare
backdrop and reads **1.52x over 59.6%** now that the stage has a floor. That is
not a lighting regression — it is the probe losing its subject. It segments by
comparing each centre pixel to its own row's backdrop, and the floor is a lit
surface in the centre of frame, so it counts. Three times the coverage is the
tell.

It still guards what it was written for: a muddy model on a mid-grey ground
cannot reach 1.3x even with the floor helping. But it now measures *"the lit
half of the frame out-reads the wall"* rather than *"the model does"*.
Sharpening it needs the subject's projected bounds rather than a row
comparison. **Do that before anyone reads the number as a statement about a
model again.**

## What is not built

- **Notes** is dev-server only (`vite-plugin-review`), and correctly absent from
  a deployed build rather than shipping a dead button.
- **Thumbnails are captured, never rendered.** A tile appears the first time you
  open that asset; a fresh session starts with an empty grid and fills in as the
  pass goes. Rendering all 56 up front is seconds of frozen main thread to
  decorate a list.
- **The Shot Gallery offers the fixed shots only.** A `follow` shot is framed on
  a character and there are none by construction; those rows are listed, dimmed
  and say why. Standing in them would mean booting a party, which is the thing
  v2 exists to have stopped.

## Running it

```
node src/tools/studiocheck.mts            # the gate, 22 assertions
node src/tools/studioshots.mts --out tmp/shots/studio    # desktop + phone frames
node src/tools/phoneshots.mts  --out tmp/shots/phone     # door, title, play
```

`studiocheck`'s second half opens **its own browser on its own build server**,
the way `devicecheck` does. The daemon's lease is one warm page in one context,
and what decides every phone layout here is the context — `hasTouch`,
`deviceScaleFactor`, and the `hover: none` / `pointer: coarse` queries
`Device.ts` reads at module evaluation. None of that is changeable on a booted
page, and emulating it through CDP would leave the shared page emulated for
whatever leased it next.

## Next

`docs/plans/2026-09-02-opus-model-animations.md` — **View Animations**,
PROPOSED, nine instrumented lanes. Its §0 is worth reading before its §2: six of
its nine measured facts contradict the brief it was written from, and three are
bugs in what is already shipped. The first lane is **one call** —
`ModelExplorer.update` never invokes `character.update`, so no hero pose has
ever rendered and every hero stages in the bind A-pose.

`src/tools/phonecost.mts` decomposes a phone frame by ablation, for whenever the
14 fps report is picked up. At Hammerhead: **152 calls, 2.22M tris** — clipmap
0.42M (19%), Enemies 0.27M (12%), megastructures 0.25M (11%), shoreRibbon
0.20M (9%).
