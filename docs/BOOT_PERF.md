# Boot and runtime vitals

**The numbers a person actually feels.** Measured, or explicitly marked as not.
Update the number, keep the date, delete a row that stops being true.

| vital | number | how | date |
|---|---|---|---|
| **Startup**, warm caches, quiet tree | **5.78 s** cold boot · `Game.init()` 5.61 s | `bootprof --n 3` | 08-28 |
| **Startup**, first visit, empty HTTP cache | **7.1 s** to `GAME.ready` on localhost · **85.5 MB on the wire** in 5 requests, 199.9 MB decoded. The wire is the number that travels: 0.3 s here, **~14 s on a 50 Mbit line** | `coldload --prod --n 2` | 08-28 |
| **Startup**, screen responsive during it | **No, and now measurably.** 77 frames in 7.3 s (**10.6 fps**; responsive is ~437), **92% of the load with no paint and no input**, worst single block **1.2 s**. Was **one unbroken 7961 ms task** before `Game.init()` learned to yield | `coldload --prod`, gate `bootblock` | 08-28 |
| **RAM** | **1.25 GB** the tab (renderer) · **2.23 GB** whole process tree, prod play. Was **1.61 / 2.60** this morning; −362 MB off the tab | `bootprof --mem --play --prod` | 08-28 |
| **CPU**, idle page | **~16.5 ms of CPU per rendered frame**, and the loop is now **capped at 60 fps** (`Game.maxFps`), so that is **~99–110% of one core on any display**. Was 189–203% of a core headless at 117 fps and **~200% on a 120 Hz panel**; **a 60 Hz panel is unchanged, because it was already drawing 60**. `stop()` still takes the page to **0.6–2.0%** | `idlecpu --q high --dpr 1.5` | 08-28 |
| **FPS** | mean **218.7**, worst shot 134; 142/142 clear 60 by more than their own noise. This is the cost of a frame the harness asks for, not a rate — the loop that free-runs is capped at 60, see the CPU row | `perf.mts`, `RULER_VALID: true` | 08-28 |
| **Worst frame** | **no frame over 33 ms**, **0 hitches**; worst gameplay segment 127.4 fps (`streaming-traverse`) | `gameplay.mts`, `RULER_VALID: true` | 08-28 |
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

That asymmetry is now load-bearing in the other direction too. Because `idlecpu`
is the only gate that ever runs the loop, it is **the only place the 60 fps cap
can be asserted at all** — a commit that deleted `Game.maxFps` would pass all
nineteen gates, both perf gates and all 142 shots. Its third check reads the cap
off the page and asserts the loop honours it.

## Idle CPU: it was the render loop, all of it, and now it is capped

`idlecpu --q high --dpr 1.5`, A/B/A, 15 s per arm, both runs back to back on the
same box. `rAF Hz` is what the host **offered** and `fps` what the loop **drew** —
before the cap those were the same number by construction:

| | arm | GPU | browser | network | renderer | **total** | rAF Hz | **fps** | CPU ms/frame |
|---|---|---|---|---|---|---|---|---|---|
| **before** | running | 83.6% | 17.9% | 2.9% | 84.8% | **189%** | — | 117.5 | 16.10 |
| | **stopped** | 0.1% | 0.4% | 0.0% | 1.6% | **2.2%** | — | 0 | — |
| | running2 | 95.0% | 17.5% | 2.7% | 87.8% | **203%** | — | 116.3 | 17.45 |
| | dpr 1.5 | 76.6% | 14.5% | 2.3% | 66.3% | **160%** | — | 77.8 | 20.51 |
| **after** | running | 43.4% | 9.6% | 1.6% | 48.0% | **103%** | 119.2 | **62.2** | 16.49 |
| | **stopped** | 0.0% | 0.6% | 0.0% | 1.4% | **2.0%** | 0 | 0 | — |
| | running2 | 50.7% | 9.5% | 1.5% | 50.9% | **113%** | 120.0 | **61.7** | 18.26 |
| | dpr 1.5 | 54.3% | 9.3% | 1.5% | 51.8% | **117%** | 120.0 | **60.0** | 19.48 |

**Read the `stopped` row first.** `Game.stop()` cancels the rAF loop and nothing
else — the page, the world, the GL context and every timer survive — and the
whole cost of an idle tab goes to 2%. There is **no timer, no microtask storm,
and no unconverged streaming loop**; `Vegetation.update` even falls from 0.37 to
0.23 ms between the two running arms, so the converge does finish. `grep` agrees:
outside the dev suite the game contains exactly one `requestAnimationFrame` and
no `setInterval`.

So the cause was named, and it was not a bug. **`Game.start()` ran `rAF` forever
and `Game.frame()` drew a full post-processed frame every tick, unconditionally,
whether or not anything in the world moved.** Idle CPU is `frame cost × frame
rate` and only the first factor had ever been bounded — by `perf` and `gameplay`,
which step frames by hand and cannot see the second at all.

**`Game.maxFps` is now 60**, `BRIEF.md` rule 3's own target, and the third row of
each block is the proof: the host still offers 120 rAF callbacks a second and the
loop draws 60 of them. Headless does not vsync, so the offer itself moves with
the box — it has been seen at 90 Hz, where the cap correctly does *not* bite (see
below) — which is why the tool counts the offer as well as the draw.

**Read the last column before celebrating.** `CPU ms/frame` did not move: 16.5–19.5
either side. **The cap does not make a frame cheaper, it draws fewer of them**, so:

- **on a 60 Hz panel nothing changes at all.** It was already drawing 60 a second,
  and it still costs ~99–110% of a core. If the tab a person reported at 96–105%
  was on a 60 Hz display, **this change does not fix it** and `post.render` is the
  only remaining lever.
- **on a 120 Hz / ProMotion panel it halves**, ~200% → ~100%, and that is most of
  the Macs this would run on.
- **between 61 and 119 Hz it deliberately does nothing.** The cap is a vsync
  divisor and it *floors* rather than rounds: on a 100 Hz panel the only rates
  either side of 60 are 100 and 50, and picking 50 would put the game under rule
  3's floor to save power. See `Game.start()` for the table.

Inside the 6.2 ms of main thread, `post.render` is **74–77%** and every system put
together is under 1.5 ms. The `dpr 1.5` arm is why a headless percentage
*understates* all of this: headless reports `devicePixelRatio` 1 and draws
1600×900 = 1.44 Mpx, while a Retina panel reports 2 and `Renderer.ts` asks for
`min(dpr, 1.5)` at `q=high` — 2400×1350, **2.25× the pixels**. Uncapped that arm
could not reach 120 fps at all (77.8) and still cost 160% of a core; capped it
holds 60.0 at 117%, and the frame behind it costs 19.5 ms.

**Nothing else here is free to remove.** The world is never static — the day cycle,
the water, the wind and TAA all animate — so render-on-demand is not available
without changing how the game looks, and the cap is the whole of the other lever.

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

Prod play page, all four bake caches warm, 1 999 MB of "world" after Chromium's
~227 MB floor. The **was** column is the same measurement this morning:

| MB | was | bucket |
|---|---|---|
| 714 | 747 | GPU-side — textures 206, **render targets 181**, shadow maps 42, vertex+index 285 |
| 324 | 427 | CPU typed arrays outside V8 — 241 vertex, 39 texel, 44 index |
| 83–85 | 82–85 | live V8 heap |
| 0 | ~134 | **the two texture-bake containers**, held for the session by an index that could not empty |
| 0 | ~67 | **the painted faces' canvas mip pyramids**, which no instrument here counted |
| ~880 | ~1 130 | renderer + gpu-process remainder |

**`performance.memory` is frozen in this build** — 200 MB allocated moves it by
0.0 MB — so any heap figure taken from inside the page is a constant.

### What the remainder is, because it is no longer "unattributed"

Two mechanisms, both measured, and **neither of them is free memory**:

1. **A summed `ps` RSS counts the shared framework once per process.** The
   browser process reads 106 MB RSS against a **25 MB** physical footprint and
   the network utility 48 against **8** — about 120 MB of the total is one
   framework counted five times. `bootprof --mem` now prints footprint beside
   RSS. (It over-reads in the other direction on the gpu-process, which is why
   both are printed and neither is "the number".)
2. **The renderer process mirrors GPU allocations.** `?q=low` is the
   discriminator: it drops **88.4 MB** of GPU-side resource (render targets
   181.1 → 133.0, shadow maps 41.9 → 2.6) while changing not one byte of
   content — scene textures and geometry are identical to the megabyte — and
   the browser tree falls **112.7 MB**, of which **62 MB comes out of the
   renderer** and 52 out of the gpu-process. 0.70 MB of renderer per MB of GPU
   resource; over the whole 714 MB that is most of what was unnamed.

So the remaining lever on this number is **GPU resources**, and the largest
single one is the **181 MB of render targets across 33 of them**.

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

- **`post.render`, which is now the only lever left on idle CPU.** The cap
  (taken, see above) removed the refresh-rate multiplier and nothing else. At
  60 fps the tab still costs ~17–19 ms of whole-browser CPU per frame — about
  one core — and **74–77% of that one frame is `post.render`**; every system in
  the game put together is under 1.5 ms. So the next 30% has to come out of the
  post chain or out of the pixels it runs over, and both are look-and-feel
  decisions rather than optimisations. Dropping the cap to 30 is the other lever
  and it is one character (`Game.maxFps`).
- **The 85.5 MB first visit.** Invisible on localhost, ~14 s on a real line, and
  three files are all of it. Streaming the bake progressively, or shipping a
  lower-resolution first-paint tier, is real work and nobody should start it
  without knowing whether this is ever served over a network.
