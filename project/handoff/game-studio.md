# Game Studio — live state

**Plan: `docs/plans/2026-09-02-fable-game-studio-v3.md`.** v2's architecture
stands verbatim — three boot profiles, no game in the studio — and v3 is the
audit's order of work. v2 and v1 archived 2026-09-02.

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

## The five things that will bite

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
   entrance. `showWorld` hides every top-level scene child except the model
   stage, and re-applies when the scene grows — `Props.mega`, `Hammerhead`'s
   build-on-approach and `Water`'s streaming all arrive late.

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
node src/tools/studiocheck.mts            # the gate, 19 assertions
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
