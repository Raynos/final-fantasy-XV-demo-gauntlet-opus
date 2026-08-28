# Boot and runtime vitals

**The numbers a person actually feels.** Measured, or explicitly marked as not.
Update the number, keep the date, delete a row that stops being true.

| vital | number | how | date |
|---|---|---|---|
| **Startup**, warm caches, quiet tree | **5.78 s** cold boot · `Game.init()` 5.61 s | `bootprof --n 3` | 08-28 |
| **Startup**, first visit, empty HTTP cache | **7.1 s** to `GAME.ready` on localhost · **85.5 MB on the wire** in 5 requests, 199.9 MB decoded. The wire is the number that travels: 0.3 s here, **~14 s on a 50 Mbit line** | `coldload --prod --n 2` | 08-28 |
| **Startup**, screen responsive during it | **No, and now measurably.** 77 frames in 7.3 s (**10.6 fps**; responsive is ~437), **92% of the load with no paint and no input**, worst single block **1.2 s**. Was **one unbroken 7961 ms task** before `Game.init()` learned to yield | `coldload --prod`, gate `bootblock` | 08-28 |
| **RAM** | **1.5 GB** the tab (renderer) · **2.5 GB** whole process tree, prod play | `bootprof --mem --play --prod` | 08-28 |
| **CPU**, idle page | **~16.5 ms of CPU per rendered frame** = **96–105% of one core at 60 Hz**, ~200% at 120 Hz, **113% at Retina pixel scale**. It is the rAF render loop, all of it: `stop()` takes the page to **0.5–2.4%** | `idlecpu --q high --dpr 1.5` | 08-28 |
| **FPS** | mean **226–229**; 142/142 shots clear 60 by more than their own noise | `perf.mts`, `RULER_VALID: true` | 08-28 |
| **Worst frame** | **no frame over 33 ms**, 0 hitches; worst gameplay segment 133.3 fps | `gameplay.mts`, `RULER_VALID: true` | 08-28 |
| **Draw calls** | **786** of a budget of 800 | `drawcheck.mts` | 08-28 |

## Why those three rows were blank, and what filled them

**`?shoot=1` is a determinism gate and also a blindfold.** `main.ts` does not call
`game.start()` under it, so **a posed page never free-runs**. The 142-shot corpus,
every `--cold` capture and both perf gates are posed — `perf.mts` steps frames by
hand, measuring the cost of a frame the harness asks for rather than the
behaviour of a loop nobody is driving. `grep -l 'play: true' src/tools/*.mts`
returned **`uxcheck.mts` and nothing else**, and it asserts on DOM and page errors,
not CPU.

So **a tab pinned at 100% while idle was invisible to all 19 gates, both perf
gates and all 142 shots, by construction.** `BRIEF.md` rule 3's "≥60 fps" and "no
frame over 33 ms" are *upper bounds on work per frame*; neither says anything
about how many frames a second the page decides to take, or about a page that has
not finished loading. Idle CPU is `frame cost × frame rate` and the harness had
only ever measured the first factor.

Two tools now measure the other one. **`idlecpu.mts`** leases a `play: true` page,
holds the quiet lane, and reads three independent oracles over a window of real
idle. **`coldload.mts`** launches its own browser under the same lease (the
navigation *is* the measurement, so a page the daemon already booted answers the
question before it is asked) and watches the load from before the app's first
line runs. Its `--gate` mode is the **`bootblock`** gate in `check --perf`, which
is the only gate in the suite that watches the load rather than a frame.

## Idle CPU: it is the render loop, all of it

`idlecpu --q high --dpr 1.5`, A/B/A, 15 s per arm:

| arm | GPU | browser | network | renderer | **total** | fps | CPU ms/frame | at 60 Hz | at 120 Hz |
|---|---|---|---|---|---|---|---|---|---|
| running | 73.5% | 16.0% | 2.7% | 75.8% | **168%** | 102.0 | 16.47 | **98.8%** | 197.7% |
| **stopped** | 0.2% | 0.7% | 0.0% | 1.5% | **2.4%** | 0 | — | — | — |
| running2 | 85.1% | 16.0% | 2.7% | 77.2% | **181%** | 103.3 | 17.53 | **105.2%** | 210.3% |
| dpr 1.5 | 62.4% | 10.7% | 1.9% | 50.7% | **126%** | 66.9 | 18.80 | **112.8%** | 225.6% |

**Read the `stopped` row first.** `Game.stop()` cancels the rAF loop and nothing
else — the page, the world, the GL context and every timer survive — and the
whole cost of an idle tab goes to 2.4%. There is **no timer, no microtask storm,
and no unconverged streaming loop**; `Vegetation.update` even falls from 0.37 to
0.23 ms between the two running arms, so the converge does finish. `grep` agrees:
outside the dev suite the game contains exactly one `requestAnimationFrame` and
no `setInterval`.

So the cause is named, and it is not a bug. **`Game.start()` runs `rAF` forever
and `Game.frame()` draws a full post-processed frame every tick, unconditionally,
whether or not anything in the world moved.** There is no frame-rate cap and no
idle path. Headless does not vsync, which is why the raw percentage is 168–181%
at ~102 fps: that is what the loop costs when *nothing* caps it. A real tab's rAF
is locked to the display, so the honest figure is per-frame CPU × refresh — 96–105%
of a core at 60 Hz, which is exactly what the human saw.

Inside the 5.8 ms of main thread, `post.render` is **74–77%** and every system put
together is under 1.5 ms. The `dpr 1.5` arm is why a headless percentage
*understates* this: headless reports `devicePixelRatio` 1 and draws 1600×900 =
1.44 Mpx, while a Retina panel reports 2 and `Renderer.ts` asks for `min(dpr, 1.5)`
at `q=high` — 2400×1350, **2.25× the pixels**. That arm cannot reach 120 fps at
all (66.9), so on a ProMotion display the loop takes every frame it is offered and
still costs ~126% of a core.

**Nothing here is free to remove.** The world is never static — the day cycle, the
water, the wind and TAA all animate — so render-on-demand is not available without
changing how the game looks. What *is* available is a frame-rate cap, and it is a
product decision rather than a bug fix: see the note at the end of this file.

## The first visit: 85.5 MB, and localhost hides all of it

`coldload --prod --n 2`, prod bundle, empty HTTP cache:

| | on the wire | decoded |
|---|---|---|
| `/baked/terrain.bin.gz` | 33.1 MB | 57.7 MB |
| `/baked/tex.bin.gz` | 31.0 MB | 72.0 MB |
| `/baked/texc.bin.gz` | 20.5 MB | 67.1 MB |
| `/assets/index-*.js` | 1.0 MB | 3.0 MB |
| **total, 5 requests** | **85.5 MB** | **199.9 MB** |

`bootprof` could never see this: it measures `Game.init()` on a warm cache and
includes no navigation, transfer, parse or bundle compile. The whole 85.5 MB
arrives in **0.27 s** on localhost, which is why it has never hurt anyone here and
why the `bootblock` gate carries a transfer budget rather than a timing one. On a
50 Mbit connection it is **~14 s before `Game.init()` has done anything at all**.

## RAM, in named buckets

Prod play page, 2 281 MB of "world" after Chromium's ~250 MB floor:

| MB | bucket |
|---|---|
| 740 | GPU-side — textures 199, **render targets 181**, shadow maps 42, vertex+index 318 |
| 448 | CPU typed arrays outside V8 — 275 vertex, 103 texel, 44 index, 27 instance |
| 85–143 | live V8 heap (59 of it boot garbage a `gc()` returns) |
| ~880 | renderer remainder — **309 MB is bake containers**, ~570 MB still unattributed |

**`performance.memory` is frozen in this build** — 200 MB allocated moves it by
0.0 MB — so any heap figure taken from inside the page is a constant.

**~600–800 MB looks recoverable without changing how anything looks**; the
itemised list and the reason the biggest slice is not a one-line fix are in
`docs/plans/2026-08-26-opus-the-standing-backlog.md` §WS-13.

## Why the screen was unresponsive while loading

This section used to say *"`await` yields to the event loop between phases, but a
single phase that builds geometry for 400 ms blocks paint and input for 400 ms."*
**The second half was right and the first half was wrong.**

`Game.init()` does `await sys.init(this)` over twenty-six systems, and an `await`
on a promise that is already settled — which most of these are — schedules a
**microtask**. Microtasks drain at the end of the *current* task and never return
to the event loop, so there was no rendering opportunity between phases at all.
Measured: the `longtask` observer saw **two** entries for an entire 8.4 s first
visit and the worst was **7961 ms**. The browser got 43 frames in 8.5 s, and 96%
of the load had no paint and no input. Not a slow loading screen — a frozen tab.

That is also why the bar freezes exactly when it is meant to reassure: `#boot .bar
i` animates `right`, which is not a compositor property, so it repaints on the
same main thread the boot is holding. A CSS/SVG animation only helps if it uses a
compositor property; a `right` transition does not.

**The fix landed**: `yieldToBrowser()` in `src/game/Game.ts` posts a
`MessageChannel` message — a genuine task — after each progress label is set and
before that phase's work begins, so the phase a person is about to wait for is
the one they can read. Not `setTimeout(0)`: nested timeouts clamp to 4 ms after
five levels, ~100 ms of pure clamp across this boot.

| | before | after |
|---|---|---|
| long tasks over the whole load | **2** | **14** |
| worst single block | **7961 ms** | **1243 ms** |
| frames the browser got | 43 in 8.5 s (5.0 fps) | 77 in 7.3 s (10.6 fps) |
| boot wall clock, `bootprof --n 3` | 8.90 / 8.48 / 8.28 s | 8.84 / 8.39 / 8.42 s |

The last row is the point: **the yields cost nothing measurable.** Both arms were
taken back to back on the same contended box.

It makes no single phase shorter, and the remaining worst blocks are still
seconds of frozen tab: `Vegetation` 1.3 s, `Dungeons` 1.2 s, `Props` 1.2 s,
`Terrain` 0.6 s, `Minimap` 0.5 s. Chunking *inside* those loops against an ~8 ms
budget is the next step and needs the same `yieldToBrowser()` primitive, which is
exported for it. Moving work off-thread is the expensive option: the geometry
bake is already typed arrays, transferable to a worker without a copy.

## What is left, and what needs a person to decide

Neither of these is queued anywhere. They are decisions, not tasks.

- **A frame-rate cap.** 96–105% of a core while idle is the price of drawing an
  animated open world every vsync, and it will not come down without either
  capping the loop (say 30 or 60 fps regardless of display) or making the frame
  cheaper — `post.render` is three quarters of it. A cap is a look-and-feel
  decision the `BRIEF.md` FPS rule does not currently have an opinion about, and
  it is one small change in `Game.start()` once somebody decides.
- **The 85.5 MB first visit.** Invisible on localhost, ~14 s on a real line, and
  three files are all of it. Streaming the bake progressively, or shipping a
  lower-resolution first-paint tier, is real work and nobody should start it
  without knowing whether this is ever served over a network.
