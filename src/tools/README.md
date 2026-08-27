# The harness

Everything in `src/tools/` renders through **one capture daemon per repository**,
shared by every agent on the machine. Nobody starts a server. Nobody picks a
port. Nobody launches a browser.

```
node src/tools/shoot.mts hero_full --out tmp/shots/x --jpeg    # autostarts the daemon
node src/tools/daemon.mts --health                             # what it is doing
node src/tools/identity.mts                                    # which daemon, which port
node src/tools/cleanup.mts                                     # what is orphaned (its own are safe)
```

## Why it is shaped this way

Measured on this machine, in `project/journal/2026-08-23-harness-bench.md`:

| fact | number |
|---|---|
| boot to `GAME.ready` | **9.2 s** |
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
| no browser at all | `imgdiff` `crop` `bake` `orphans` `agentstats` `anycheck` `cleanup` `identity` |

`grep -ln 'chromium.launch(' src/tools/*.mts` returns **`chromium.mts`** and
nothing else. Keep it that way.
