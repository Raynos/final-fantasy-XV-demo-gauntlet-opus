# The harness

Everything in `src/tools/` renders through **one capture daemon per repository**,
shared by every agent on the machine. Nobody starts a server. Nobody picks a
port. Nobody launches a browser.

```
node src/tools/shoot.mts hero_full --out tmp/shots/x --jpeg    # autostarts the daemon
node src/tools/daemon.mts --health                             # what it is doing
node src/tools/daemon.mts --wait quiet --for 600               # block until it is; never poll
node src/tools/identity.mts                                    # which daemon, which port
node src/tools/cleanup.mts                                     # what is orphaned (its own are safe)
node src/tools/harnessstats.mts --since 24h                    # where the wall-clock went
```

## Why it is shaped this way

Measured on this machine, in `project/journal/2026-08-23-harness-bench.md`:

| fact | number |
|---|---|
| boot to `GAME.ready`, one browser | **6.6–9 s** (see below) |
| render one shot on a warm page | **2.3 s** |
| four concurrent browsers, against one | **1.5×** throughput |
| at four browsers: CPU / RAM | **2.2 of 18 cores**, **10 of 137 GB** |
| soft reset + repose, against a reload | **1.97 s** against **11.1 s** |
| materialise a sha tree (archive + symlinks) | **≈ 0.2 s**, 115 MB |
| two fresh serial boots differ by | **1.493 / 255** |

Read those together and the design falls out. Neither CPU nor RAM binds — the
single Metal GPU does — so **more browsers buy almost nothing** and the cap is
real: `BROWSER_BUDGET = 4`, the largest concurrency that still boots within 2× of
serial. The win was never parallelism. It is **not booting the same page over and
over**, which is what a warm, shared, content-addressed daemon is.

The last row is the one people trip on: two captures of the same shot are *never*
byte-identical, because TAA history, the exposure integrator and the shader cache
do not start from the same place twice. Every threshold here traces to it.

**The boot number is a range because it is a range, and a constant here rots.**
This file said a flat 9.2 s for weeks after phase 3 had taken it to 6.6, and the
plan that noticed reasoned from the stale figure. The live one is
`bootMs` in `daemon.mts --health` — the last boot this daemon actually paid —
and it is legitimately three different numbers: **~6.6 s** alone with every cache
warm, **~9 s** with the painted-face cache missing (`--health` says
`paintedFaces: false`; the cure is `pnpm run build:full`), and **up to ~32 s**
when four boots race each other, which is what `drawcheck --par 4` does on
purpose. Quote which one you mean.

## Build identity

A request names a build, not a directory.

- **`sha:<tree>`** — content-addressed and immutable. Materialised once into
  `~/.cache/ffxv-harness/<keyhash>/trees/<sha>/` with `node_modules` and
  `src/public/baked` symlinked in, served by its own vite. Shared by everyone,
  cached, and **unaffected by anyone's uncommitted edits**.
- **`dirty:<root>`** — the live working tree. Never cached, always flagged. On a
  shared trunk it contains *every* agent's in-flight edits, not just yours.

Every tool takes `--build <ref>` and **defaults to `HEAD`**, so what you capture
is committed code. `--dirty` is the escape for the tight edit loop.

> **The one mistake this harness can still make.** Capture `HEAD` with
> uncommitted work and your edit is not in the frame. That has no symptom other
> than "nothing changed" — it reads as *my change did nothing* rather than *I
> photographed the wrong tree*. `announceBuild()` says so, loudly, every time.
> `imgdiff` refuses two captures of the same sha for the same reason.

The trees are pruned at 10 and the frames at "six newest plus the oldest" — the
oldest deliberately, because *how far has this moved since we began* is the
comparison everyone wants and nobody preserves.

## The page contract

The game exposes, on `window.GAME`:

| member | meaning |
|---|---|
| `ready` | boot finished; the harness waits on this |
| `applyShot(name)` | lock the world into a named state from `src/game/Shots.ts` |
| `settle(n)` | advance `n` fixed steps |
| `frame(dt)` | advance one step |
| `resetClock()` | zero `time.now`, so a capture depends only on step count |
| `reset()` | back to what a fresh load leaves — the page-reuse contract |
| `stop()` / `start()` | the render loop |

`?shoot=1` is a **determinism gate**: `main.ts` does not call `game.start()`
under it, so a posed page never free-runs. That is also why a posed page here
burns *zero* idle CPU, and why this pool — unlike `../game-scaffold`'s — does not
park pages.

`reset()` is checked, not trusted. `checkResetDrift` poses `party_walk` (a
`follow` shot: all 47 of those are order-dependent) on a page driven through a
dungeon interior and reset, and byte-compares it against the fresh-boot frame,
once per build, in the background on the sweep lane. It reports in `/health`.
Currently **0.974 / 255** — below the 1.493 two fresh boots differ by.

## Writing a tool

Three tiers in `src/tools/harness.mts`. Pick the narrowest that works.

```js
import { harnessArgs, announceBuild, shots, evalIn, withPage, withBlankPage } from './harness.mts';

const ha = harnessArgs(process.argv.slice(2));   // --build/--dirty/--lane/--agent/--deadline/--q/--w/--h
announceBuild(ha);                                // always, before the first capture
```

- **Frames** — `shots(names, {...pageOpts(ha), out})`. Never sees a browser, and
  the only tier the frame cache can serve.
- **A real page** — `withPage(pageOpts(ha), async (page) => …)`. A Playwright
  `Page` over CDP in a browser the daemon owns; for tools that drive real input
  over a running loop. Add `play: true` for a page with the loop actually
  running.
- **A browser with no game in it** — `withBlankPage({w, h}, async (page) => …)`,
  for contact sheets, canvas re-encodes and histograms. Still a slot, still
  counted.

And two specials:

- `buildServer()` returns a build's port with no page, for the three tools whose
  measurement *is* the navigation (`bootprof`, `texbake`, `detcheck`).
- `withExclusive(name, fn)` quiesces the whole machine — every worker drained,
  every page closed — for `perf` and `bootprof`. This is the payoff of one daemon
  owning one machine: RESCUE §B6 threw away a session of perf numbers taken under
  six concurrent chromiums, and under per-worktree daemons that was unfixable.

## The ledger, and never polling again

The daemon writes **one JSONL line per job** to
`~/.cache/ffxv-harness/<keyhash>/jobs.jsonl` (`ledger.mts`): tool, agent, lane,
build, how long it queued, how long it ran, the verdict, who was ahead, the pool's
boots/reuses and the chromium RSS. It rotates at 10 MB and is free to delete.
An autostarted daemon's stdout goes to `daemon.log` beside it — it used to go to
`stdio: 'ignore'`, so every queue decision the daemon logged was written to
nowhere.

That is what makes the rest possible:

- **Every response carries `queuedMs` / `ranMs` / `queueAhead`**, and `call()`
  prints one exit line when the answer is worth a line:
  `[harness] queued 12.3 s · ran 41.0 s (2 ahead: perf)`. A slow call now names
  its own reason **in the transcript**, which is what makes polling `/health`
  pointless rather than merely discouraged.
- **`harnessstats.mts`** reads it back — wait vs run by tool, agent, lane or day,
  p50/p90 queue, and the calls over a threshold named individually. The weekly
  audit went from two hours of transcript archaeology to one command.
- **`daemon.mts --wait quiet|exclusive-free|idle --for <s>`** blocks until the
  condition holds and prints *why* it is still waiting if it gives up. The poll
  is inside the daemon, against local state, costing one `setTimeout` instead of
  an HTTP round trip and a turn of context. `.claude/hooks/guard-poll.sh` blocks
  the loops this replaces.
- **`/health` carries cumulative totals** since the daemon started — jobs, queue
  seconds by lane, exclusive holds and held time, evictions, prewarms — plus live
  leases with their remaining TTL, chromium RSS, and `paintedFaces`.

## Prewarming, and the gate cache

Two caches beyond the frame cache, both keyed on the tree sha and both free to
delete:

- **`post-commit` fires `/prewarm <sha>`.** "You commit to see your work" means
  the first capture after every commit pays a cold boot — a 38.9 s average
  `shoot` against 2.3 s warm. The daemon boots one page on the sweep lane,
  refusing when the page is already warm, the build is dirty, the quiet lane is
  held, or a newer commit is racing it.
- **`gatecache.mts` stores a gate's PASS** against the tree sha, so a second
  `pnpm run check` on an unchanged clean tree is under a second instead of
  minutes. Only a PASS, only on a clean tree, and never a perf verdict taken on a
  busy box. That file explains each of the three.

## Lanes, deadlines and being busy

`--lane fix` (default) is one agent wanting one shot now. `--lane sweep` is a
corpus, `creaturecheck`'s 207 poses, a contact sheet — throughput work that must
never starve a `fix` request. Within a lane the scheduler round-robins over the
*requesting agent*, so one agent's 142-shot corpus cannot monopolise the pool.

`--deadline <ms>` makes a request give up rather than queue. It comes back `429`
with the queue depth, how long you waited and **who is ahead of you**, and the
tool exits **4** — deliberately not 1, so a saturated machine and a broken build
do not look the same to an agent reading an exit code.

## Things that will bite you

- **Live reload is off, and a long probe is why.** `vite.config.js` sets
  `server.hmr = false` and ignores every watched path, and `pnpm dev` no longer
  exists. The `dirty:` build serves the shared working tree, so with HMR on, any
  agent saving any file navigated every open page and killed whatever was
  mid-`page.evaluate` with *"Execution context was destroyed, most likely
  because of a navigation"*. That reads like a crash, is not one, and it cost
  two lanes real time. A "dev server" here means source URLs and no bundling
  step — which `heightcheck`, `bootprof` and the probe rigs need, because they
  `import('/world/...')` inside the page — and nothing else.
- **Editing `daemon.mts` does not restart the running daemon.** `PROTOCOL` and
  `/version` catch it and restart; if you add a route, bump `PROTOCOL`.
- **`texbake --force` writes the shared bake cache.** Every materialised tree
  symlinks it, so a force from the wrong build re-textures everybody's game.
  `texbake` pins itself to the dirty build for exactly this reason.
- **`--hide` and `--raw` frames are never cached.** An ablation is only meaningful
  against its own control taken moments earlier.
- **A stepped frame is 95% draw submission, and probes need not pay it.**
  Measured A/B/A on one page (`probes/turbocost.mts`): 11.0 ms of an 11.66 ms
  frame, against 0.16 ms of drift; the simulation is 0.58 ms. `probe.mts --turbo
  <N>` submits one frame in N and leaves the sim untouched, which is what takes a
  thirty-game-minute `longplay` from ~21 wall-minutes to ~1. Validate any turbo
  run against a non-turbo one — this game is deterministic, so a differing
  distance or encounter count means the ablation changed the measurement.
- **The exclusive lease no longer closes a leased page.** `pool.closeAll()` was
  the top documented probe killer here (five dead `longplay` runs, warnings in
  three documents); `/exclusive` now queues behind live leases, bounded by their
  own TTLs, and refuses as `busy` — naming the probe and its remaining
  seconds — rather than destroying somebody's half-hour.
- **A play page is thrown away, not pooled.** Minutes of real input move combat
  state, quest flags, the day cycle and the broadphase, and `stop()` puts none of
  it back.
- **`prod` builds mangle class names.** `Game.add()` falls back to
  `constructor.name` when a system is registered without an explicit key; every
  call site passes one today, and that is the only reason `--prod` works.

## The tools

| tier | tools |
|---|---|
| frames | `shoot` `corpus` `mapshoot` `ui-shoot` `dresscam` `chartshoot` `sheet` `framecam` `creaturecheck` `attrib` `seatcheck` `heightcheck` `probe` |
| leased page | `gameplay` `combatloop` `integration` `uxcheck` `driftcheck` `reachcheck` `mapview` |
| blank browser | `sheet` `corpus` `compare` `imagestats` `reliefstat` `shrink` |
| owns a browser, under the quiet lane | `bench` `bootprof` — they *measure* browsers |
| no browser at all | `imgdiff` `crop` `bake` `orphans` `agentstats` `harnessstats` `anycheck` `cleanup` `identity` `gitlock` |

`grep -ln 'chromium.launch(' src/tools/*.mts` returns **`chromium.mts`** and
nothing else. Keep it that way.
