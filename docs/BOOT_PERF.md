# Boot and runtime vitals

**The numbers a person actually feels.** Measured, or explicitly marked as not.
Update the number, keep the date, delete a row that stops being true.

| vital | number | how | date |
|---|---|---|---|
| **Startup**, warm caches, quiet tree | **5.78 s** cold boot · `Game.init()` 5.61 s | `bootprof --n 3` | 08-28 |
| **Startup**, first visit, empty HTTP cache | **NOT MEASURED.** Expect worse: the 35.5 MB geometry artifact and the texture bake are a download, and a missing painted-face cache alone is ~2.5 s | — | — |
| **Startup**, screen responsive during it | **No.** The page is unresponsive while loading — human-observed, not instrumented | — | 08-28 |
| **RAM** | **1.5 GB** the tab (renderer) · **2.5 GB** whole process tree, prod play | `bootprof --mem --play --prod` | 08-28 |
| **CPU**, idle page | **~100% of a core, human-observed. NOT MEASURED by anything in this repo.** | — | 08-28 |
| **FPS** | mean **226–229**; 142/142 shots clear 60 by more than their own noise | `perf.mts`, `RULER_VALID: true` | 08-28 |
| **Worst frame** | **no frame over 33 ms**, 0 hitches; worst gameplay segment 133.3 fps | `gameplay.mts`, `RULER_VALID: true` | 08-28 |
| **Draw calls** | **786** of a budget of 800 | `drawcheck.mts` | 08-28 |

## Why three rows are blank

**`?shoot=1` is a determinism gate and also a blindfold.** `main.ts` does not call
`game.start()` under it, so **a posed page never free-runs**. The 142-shot corpus,
every `--cold` capture and both perf gates are posed — `perf.mts` steps frames by
hand, measuring the cost of a frame the harness asks for rather than the
behaviour of a loop nobody is driving. `grep -l 'play: true' src/tools/*.mts`
returns **`uxcheck.mts` and nothing else**, and it asserts on DOM and page errors,
not CPU.

So **a tab pinned at 100% while idle is invisible to all 19 gates, both perf
gates and all 142 shots, by construction.** `BRIEF.md` rule 3's "≥60 fps" and "no
frame over 33 ms" are *upper bounds on work per frame*; neither says anything
about a loop that never yields, or about a page that has not finished loading.

Same shape for startup: `bootprof` measures `Game.init()` on a **warm** cache, and
does not include navigation, transfer, parse or bundle compile.

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

## Why the screen is unresponsive while loading

Not measured, but the mechanism is visible in the code and worth writing down
before anyone re-derives it: **`Game.init()` awaits a chain of `bootPhase(...)`
calls on the main thread**, and the phases that dominate are synchronous
generation — vegetation, props, shader compile and warm-up. `await` yields to the
event loop between phases, but a single phase that builds geometry for 400 ms
blocks paint and input for 400 ms. There is no worker, no `requestIdleCallback`
chunking, and no frame budget inside a phase.

The three things that would change it, cheapest first: **yield within a phase**
(chunk the generator loops against a time budget so the loop returns to the
browser every ~8 ms), **draw the loading screen from outside the blocking
work** (it cannot animate while the thread is held, so it has to be CSS/SVG
animation rather than anything JS-driven, or it stalls exactly when it is meant
to reassure), and **move what can be moved off-thread** — the geometry bake is
already typed arrays, which is transferable to a worker without a copy.
