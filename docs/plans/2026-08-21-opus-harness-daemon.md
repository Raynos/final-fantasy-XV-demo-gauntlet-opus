# Harness plan — one shared daemon, many worktrees, one machine budget

## Context

`project/RESCUE.md` §C ("Harness") names the defect that killed three agents in
the last session:

> **The machine saturates.** 6+ concurrent headless Chromiums make every
> measurement worthless *and* stall agents outright. **Cap concurrency at ~4.**

That is a symptom description, not a fix, and the "~4" is a guess nobody has
measured. There are two structural causes.

**Cause one: twenty tools each own a browser.**

```
$ cd src/tools && for f in *.mjs; do echo "$f $(grep -c chromium.launch $f)"; done
```

Twenty of the thirty-four tools call `chromium.launch` themselves, and seventeen
spawn their own `vite` too. Each has its own copy-pasted `portOpen()` /
`ensureServer()` / `page.goto('?q=…&shoot=1')` /
`waitForFunction('window.GAME.ready')` preamble — `perf.mjs:47-70`,
`gameplay.mjs:80-82`, `combatloop.mjs`, `integration.mjs`, `uxcheck.mjs`,
`driftcheck.mjs`, `heightcheck.mjs`, `mapshoot.mjs`, `ui-shoot.mjs`,
`dresscam.mjs`, `bootprof.mjs`, `chartshoot.mjs`, `detcheck.mjs`, `attrib.mjs`,
`shrink.mjs`, `sheet.mjs`, `probe.mjs`, `mapview.mjs`. Every one is an
independent, unbudgeted claim on the machine.

`src/tools/daemon.mjs` already exists and already solves the *boot cost* problem
correctly — one vite, one chromium, one warm page, a source fingerprint so a
stale page is never reused (`daemon.mjs:36-69`), `--cold` for provable
independence. But only `shoot.mjs` and `corpus.mjs` go through it, because
`queue()` (`daemon.mjs:249-254`) chains every request onto one promise: exactly
one browser doing exactly one thing. **Agents bypass the daemon because it
serialises them, and bypassing it is what saturates the machine.**

**Cause two, and the more important one: the daemon is scoped to a checkout.**

`ensureDaemon()` (`daemon.mjs:104-121`) *refuses* a daemon serving a different
root, and `CLAUDE.md` instructs "one `PORT` per worktree, and the capture daemon
takes `PORT+1`". So the current design is **one daemon per worktree** — and with
three agent worktrees checked out right now, a perfect per-daemon cap of 4 still
puts twelve chromiums on one GPU. That is the saturation RESCUE describes,
tripled, and no per-daemon budget can ever see it.

The daemon is scoped wrongly. **A browser budget is a property of the machine,
so the process that owns it must be too.** This plan makes the daemon
**one per repository identity, shared by every worktree of that repository**,
multiplexing over roots instead of refusing them.

### The measured facts this plan starts from

| fact | source |
|---|---|
| 18 cores, 128 GB RAM, **one** GPU | `sysctl hw.ncpu hw.memsize` |
| Cold capture ≈ 12 s, warm ≈ 1.5 s | `daemon.mjs:27` header |
| Boot is ~110 shader compiles + world build, not chromium launch | `daemon.mjs:14-17` |
| Toggling one light's `visible` recompiled 43 programs — 9.5 s freeze | RESCUE §C |
| `?shoot=1` pages **do not run rAF** (`main.js:27` gates `game.start()`) | `src/main.js` |
| Uncapped rAF was measured *worse*, not better, and is deliberately absent | `chromium.mjs:5-18` |
| **This repo has no git remote at all** | `git remote -v` is empty |
| All three worktrees share one `.git` | `git rev-parse --git-common-dir` |

**The 18-core / 128 GB figure falsifies the obvious explanation.** Six chromiums
cannot saturate 18 cores or 128 GB. What they can saturate is the single Metal
GPU they all render through (`--use-angle=metal`, `chromium.mjs:29`). If that is
right, the binding constraint is GPU queue depth, the cap belongs on
*concurrently rendering* pages rather than on browsers, and parked-but-resident
browsers are nearly free. If it is wrong, the cap belongs somewhere else. **We do
not know yet, and Phase 0 exists to find out before any number becomes a
default.**

---

## The core redesign — one daemon per repository

### Identity

The daemon keys on **repository identity, not checkout path**:

```js
// src/tools/identity.mjs
export function repoKey() {
  const remote = git('config --get remote.origin.url');   // preferred: survives clones
  if (remote) return normaliseRemote(remote);             // strip scheme/auth/.git, host+path
  return realpathSync(git('rev-parse --git-common-dir')); // fallback: this repo, today
}
```

Remote URL first, because the user's rule is one daemon per remote and because
it is the identity that survives re-cloning. **But this repo has no remote**, so
the fallback is the one that actually runs today — and it is exactly right:
`git rev-parse --git-common-dir` resolves to the same `.git` from the primary
checkout and from every `.claude/worktrees/agent-*`. Verified:

```
primary   /Users/…/final-fantasy-XV-demo-gauntlet-opus/.git
worktree  /Users/…/final-fantasy-XV-demo-gauntlet-opus/.git
```

One key, three worktrees, one daemon.

### Discovery and ports — derived, never conventional

`DAEMON_PORT = 20000 + (sha1(repoKey) mod 20000)`, plus linear probing on
collision. The daemon writes `~/.cache/ffxv-harness/<keyhash>.json` with
`{port, pid, key, started}`; clients read it, fall back to the derived port, and
autostart on miss (the existing `ensureDaemon()` flow, unchanged in shape).

**This deletes the `PORT`-per-worktree convention entirely**, along with the trap
`CLAUDE.md` and RESCUE §C both warn about — aiming `framecam.mjs` at the daemon
port and hanging for the full 300 s. Nobody picks a port any more; app ports are
allocated *by* the daemon from its own block and handed back in the response.

`ensureDaemon()`'s different-root refusal (`daemon.mjs:110-118`) — which exists
because *"silently reusing it captures the other repo's build, which has already
produced at least one false result"* — is replaced, not weakened. The daemon now
serves the other root correctly instead of refusing it. The check becomes a
*key* comparison: a daemon on the port whose `repoKey` differs is still a hard
error.

### Multiplexing over roots

The daemon holds:

- **One vite server per root**, spawned on first use, keyed by absolute worktree
  path, torn down after its own idle timeout. This is the only per-worktree
  resource, and it is cheap — a vite dev server is a node process, not a GPU
  client.
- **One browser pool**, machine-wide, shared by every root.
- **One scheduler**, machine-wide, with fair-share across roots (below).
- **One build fingerprint per root** — `sourceStamp()` (`daemon.mjs:36-69`)
  already walks `src/` from `ROOT`; it becomes `sourceStamp(root)`.

**Page identity becomes `(root, fingerprint, viewport, query)`.** A page booted
against worktree A is never handed to a request for worktree B — the same
guarantee the old refusal gave, now enforced at lease time where it belongs
rather than at daemon startup. A worktree switching branches simply changes its
fingerprint and its pages get recycled, which is machinery that already exists.

**The budget is back to being in-process**, because there is now exactly one
process that wants browsers. No lock file, no lease ledger, no heartbeat, no
stale-reclaim deadlock — an earlier draft of this plan proposed all of that to
coordinate N daemons, and a shared daemon deletes the entire mechanism. That is
the main argument for this design beyond correctness: **the thing that cannot
break is the thing that isn't there.**

### Fairness across roots

One shared queue means one agent's 139-shot corpus can starve four others. Lanes
alone do not fix this — they are priority classes within a root's work, not
between roots.

Dispatch is therefore **two-level**: round-robin over *roots* that have pending
work, then lane priority within the chosen root. A corpus sweep from worktree A
and a single `fix`-lane shot from worktree B interleave; A cannot monopolise the
pool no matter how deep its queue. `/health` reports queue depth **per root**, so
"why is my capture slow" has a one-line answer naming the other agent.

### Lifetime and ownership

- **The daemon must outlive the worktree that started it.** It runs with cwd set
  to the *common git dir*, holds no handle to the launching checkout beyond that
  checkout's vite server, and drops that server like any other when it goes idle.
  Removing an agent worktree must not kill the shared daemon.
- **`--stop` is global and says so.** A tool that is done with a worktree calls
  `/release-root`, which stops that root's vite and recycles its pages. Only an
  explicit `daemon.mjs --stop` kills the daemon.
- **Version skew is a real hazard.** An agent editing `src/tools/daemon.mjs` in
  worktree A does not restart the daemon running from worktree B's copy. Add a
  `PROTOCOL` constant and a `/version` route; a client whose `PROTOCOL` differs
  from the running daemon's **fails loudly with the restart command**, and never
  silently talks to an older daemon. Harness edits are self-hosting and this is
  the one place that bites.
- **Idle exit** stays as-is: browsers close after `BROWSER_IDLE_MIN`, the daemon
  after `DAEMON_IDLE_MIN`, taking every vite with it.

---

## What to take from `game-scaffold`, and what not to

Read `../game-scaffold/tools/README.md` and `daemon.mts` before implementing.
The mapping is not one-to-one, and scaffold assumed a single checkout throughout
— every mechanism below needs a `root` threaded through it.

### Take

| scaffold mechanism | where | why it transfers |
|---|---|---|
| **Work-stealing scheduler** — one priority queue per lane, N workers each owning a page, stealing when its own lane is empty | `daemon.mts:178-273` | Directly fixes the serial `queue()`. Scaffold measured 23.5 s → 12.0 s on 12 renders purely from not throwing away half the machine |
| **`BrowserPool`** — lanes *lease* rather than own; LRU eviction of idle pages; wait-and-explain at capacity instead of silently exceeding budget | `daemon.mts:353-478` | The one object that can actually enforce a cap, because it is the one thing that knows what every chromium is for |
| **Page parking** on `about:blank`, with `loadedFp = ''` as the whole re-entry mechanism | `harness.mts:594-600` | The trick is the cheap part: every caller already reloads on fingerprint mismatch, so unpark needs no special case anywhere |
| **Soft reset to menu + spare pooling** — `__RESET__`, page returns to the pool as `spare:N`, next lease adopts it | `daemon.mts:381-389, 908-945` | The "back to menu instead of a page refresh" that drains the queue fast |
| **Reset-drift check** — once per fingerprint, pose the boot shot on a reset page and byte-compare against the fresh-boot frame | `daemon.mts:947-975` | A drifting reset is a lying reset. See "Why this matters more here" |
| **Frame cache** keyed by (fingerprint, shot), with a **stats sidecar** | `daemon.mts:277-350` | Fan-out of N agents over one build collapses to file copies. The sidecar exists because a hit once silently returned `drawCalls: undefined` |
| **Request coalescing** — identical in-flight key returns the same promise | `daemon.mts:203` | Now *cross-agent*: two worktrees on the same commit asking for `hero_full` cost one render. Only a shared daemon can do this |
| **Deadline → `429 {busy}`** with EMA cost model, estimated wait and a hint | `daemon.mts:203-273` | Turns "your agent hangs for 300 s" into a number and a decision |
| **Exclusive profile lease** — quiesce every worker and close every page before a perf run, refuse if anything is in flight | `daemon.mts:752-762` | Straight at RESCUE §B6, and *only correct under a shared daemon*: see Phase 6 |
| **`bench_test.sh`** — separates render / queue / spawn, takes a lock, small by default | `tools/bench_test.sh` | Phase 0 needs exactly this |

### Do not take

- **Scaffold's `WORKERS_PER_LANE = 4` (8 total) and `MAX_CONCURRENT_BOOTS`
  defaults.** Measured on a *12-core box with a toy game* whose boot is 7.7 s of
  mostly-single-threaded CPU. Our boot is ~110 shader compiles against one GPU.
  The curve shape may hold; the knee certainly does not. Phase 0 re-derives it,
  and the numbers go into a comment block in the style of `chromium.mjs:5-18`.
- **Scaffold's park rationale verbatim.** It parks because a posed `__READY__`
  page still burns 0.6–1.8 cores of rAF. **Ours does not** — `main.js:27` never
  starts the loop under `?shoot=1`. Our park case is RSS and the GPU context:
  *strong* for play-mode pages (`gameplay`, `combatloop`, `uxcheck` run the real
  loop), *unproven* for capture pages. Two measurements, two timers.
- **`vite build` + `preview` as the only path.** Scaffold has no dev-server path.
  We need dev — an agent tweaking `TerrainMaterial.js` must not pay a full build
  per shader edit — and `daemon.mjs` already carries a correct mtime `sourceStamp()`.
  Keep both; use the dist content hash as the fingerprint only under `--prod`.
- **Scaffold's `__POSE__` / `__STATE__` / `__START__` contract.** Ours already
  exists and is better named for this game: `window.GAME`, `GAME.ready`,
  `applyShot`, `settle`, `resetClock`, `Menus.setScreen`. Rename nothing; add
  only `GAME.reset()`.
- **`.port-base` per checkout.** Scaffold needs it because its daemon is
  per-checkout. Ours derives its port from the repo key, which is strictly better:
  nothing to commit, nothing to keep unique, nothing to get wrong.

### Why the reset contract matters more here than in scaffold

RESCUE §B1 is the determinism hole: companions are still steering to wandering
formation slots when a shot settles, **formation state carries across shots**, and
*"all 47 `follow` shots are order-dependent"*. `Animator.rest()` exists at
`Anim.js:279` with zero callers; `Party.snap()` was never written.

Page reuse is what makes that bug *matter* rather than merely exist — a warm
daemon is a machine for carrying state across shots, and a **shared** daemon
carries it across *agents*, where it is invisible and unattributable. So:

- `Party.snap()` (RESCUE §B1) is a **prerequisite** of Phase 4, not parallel work.
- Scaffold's reset-drift check automates the acceptance test RESCUE already
  wrote: *"a capture applied after five other captures renders the same frame as
  one applied first."* Wire it and the class of bug cannot come back silently.

---

## Phases

### Phase 0 — measure, before any default is chosen

Nothing else starts until this is done. RESCUE's "~4" and scaffold's "8" are both
unmeasured *for this game on this machine*, and shipping either as a default
repeats the mistake this document is about.

Port `bench_test.sh` to `src/tools/bench.mjs`. As scaffold's does, it must take a
lock (a previous run once survived its supervisor and ran concurrently with a new
one — every number was garbage and looked fine), default small enough to run
constantly, and **separate the three things a client's wall time actually is**:
`render` (daemon-reported ms), `queue` (waiting behind other jobs), `spawn` (node
startup, per request).

Sweep `WORKERS` ∈ {1, 2, 3, 4, 6, 8} over a fixed warm wave, cache bypassed,
recording wall, req/s, mean render ms, **core-seconds**, **peak RSS** and GPU
load. Then answer, with numbers:

1. **Where is the knee, and what is it made of?** If throughput plateaus while
   cores idle and RSS is trivial against 128 GB, the constraint is the GPU and
   the cap belongs on concurrent *renders*. If cores or RSS bind first, it
   belongs there. This decides whether `BROWSER_BUDGET` and `WORKERS` are even
   the same number.
2. **What does a park cost and save here?** Round trip vs the RSS and idle CPU of
   a resident `?shoot=1` page (rAF stopped) *and* of a resident play page (rAF
   running). Two answers, two timers.
3. **What does a soft reset cost against a reload?** `GAME.reset()` +
   re-`applyShot` vs full `goto` + boot. Measure it on a **lighting-changing**
   shot (a `cine_*` or dungeon shot), not just `hero_full` — 43 shader
   recompiles cost a measured 9.5 s, and a reset that triggers them is slower
   than the reload it replaces.
4. **Does capture quality degrade under concurrency?** Capture `hero_full` at
   W=1 and W=knee and `imgdiff` them. Anything above the documented 1.5–1.9/255
   noise floor means concurrent rendering is not frame-safe.

**Question 4 is a gate. If concurrent renders are not byte-stable, stop and
redesign** — workers then parallelise boot and settle but serialise the
screenshot. Parallelism that quietly changes pixels is worse than the serial
queue we have.

Deliverable: `project/journal/2026-08-21-harness-bench.md` with the table, and
every default in `daemon.mjs` traceable to a row in it.

### Phase 1 — repo identity, shared daemon, multi-root

The foundational change; everything after it assumes a `root` parameter exists.

- `src/tools/identity.mjs` — `repoKey()`, `keyHash()`, `derivedPort()`.
- Registry at `~/.cache/ffxv-harness/<keyhash>.json`; `ensureDaemon()` reads it,
  autostarts on miss, and hard-errors on a key mismatch.
- `Harness` grows a `roots: Map<absPath, {vite, port, stamp, lastUsed}>`;
  `sourceStamp()` takes a root; `ensureServer()` becomes per-root with its own
  idle teardown.
- Every route takes `root` (the client sends `git rev-parse --show-toplevel`).
- `PROTOCOL` constant + `/version`; clients refuse a mismatched daemon with the
  restart command in the error.
- `/health` reports per-root: vite port, fingerprint, pages, queue depth.
- Delete the `PORT`-per-worktree convention from `CLAUDE.md`.

Ship this **before** the scheduler. It is a strict improvement even while the
daemon is still serial — three agents sharing one serial daemon is three
chromiums instead of twelve, which is already the difference between the machine
working and not.

### Phase 2 — one client, every tool through the daemon

Extract the copy-pasted preamble into `src/tools/harness.mjs` (mirroring
scaffold's `harness.mts`):

```js
export { call, ensureDaemon, daemonPort }  // moved out of daemon.mjs
export async function withPage(opts, fn)   // lease → run → release, always
export async function shots(names, opts)   // → /shots
export async function evalIn(fn, arg, opts)// → /eval
export async function probe(file, opts)    // → /probe
export async function lease(opts)          // → /lease, returns a CDP endpoint
```

Every entry point resolves and sends its own `root`, so a tool run from any
worktree reaches the shared daemon and gets that worktree's build.

Two tiers of conversion:

- **Capture tools** — `mapshoot`, `ui-shoot`, `dresscam`, `chartshoot`, `sheet`,
  `shrink`, `detcheck`, `attrib`, `mapview`, `framecam`, `creaturecheck`. They
  want a posed page and frames: they become `/shots` and `/eval` callers and lose
  `chromium.launch` entirely.
- **Play tools** — `gameplay`, `combatloop`, `integration`, `uxcheck`,
  `driftcheck`, `heightcheck`, `roadcheck`, `bootprof`. They drive real input over
  a running loop and need the `Page`, not a frame. They take a **lease** and
  connect over CDP: the daemon still owns the chromium, the budget, the deadline
  and the teardown, but the tool keeps full Playwright control. This is scaffold's
  `/lease` verbatim and it is why that route exists.

`perf.mjs` and `bootprof.mjs` take the **exclusive profile lease** (Phase 6).
`bake.mjs`, `imgdiff.mjs`, `crop.mjs`, `orphans.mjs`, `agentstats.mjs` need no
browser and stay as they are.

**One tool per commit** — the pre-commit hook runs `vite build`, and per
`CLAUDE.md` small commits are what keep the coordinator's merges trivial. These
twenty conversions are on disjoint files and parallelise across agents almost
perfectly, which is what the harness is for.

### Phase 3 — the scheduler, with fair-share across roots

Replace `queue()` (`daemon.mjs:249-254`) with scaffold's `Scheduler`
(`daemon.mts:178-273`), extended for multi-root:

- **Two-level dispatch**: round-robin over roots with pending work, then lane
  priority within the root. This is the addition scaffold does not have and the
  shared daemon requires.
- **Lanes are priority classes, not execution units.** `fix` (a tight edit loop —
  one agent, one shot, wants latency) and `sweep` (corpus runs,
  `creaturecheck`'s 207 poses, contact sheets — throughput, must never starve
  `fix`).
- **Workers have a home lane and steal when their own queue is empty** — the
  property that makes two lanes cost nothing when only one is busy.
- **EMA cost per kind** (`warm` / `cold` / `probe`), so the busy answer carries a
  real estimate.
- **Coalescing on `(root-fingerprint, shot, viewport, query)`** — note the key is
  the *fingerprint*, not the root, so two worktrees on the same commit coalesce.

Worker count from Phase 0.

### Phase 4 — the reset contract and spare pooling

**Prerequisite: `Party.snap()` (RESCUE §B1) must land first**, called from
`Game.applyShot` (`Game.js:174`).

Add `Game.reset()` — one named, testable path back to a cold-equivalent menu:

```js
reset() {
  this.stop();
  this.resetClock();                     // Game.js:255, already correct
  this.get('Party')?.snap();             // RESCUE B1 — the determinism hole
  this.get('Menus')?.setScreen('main');  // Menus.js:156
  this.get('Story')?.applyShot(null);
  this.get('Dungeons')?.exit?.();        // exterior lighting restored — RESCUE §A
  this.get('HUD')?.toasts?.clear();
  for (const s of this.systems) s.reset?.();
  document.getElementById('boot')?.remove();
}
```

Then in the pool:

- A worker's page is **reset, not reloaded**, between jobs on the same root+fingerprint.
- A released lease resets and returns as `spare:N`; the next lease for **the same
  root and fingerprint** adopts it before booting (`daemon.mts:381-389`). Spares
  are per-root — this is the one place scaffold's adoption logic must not be
  copied blindly.
- **A failed reset recycles the browser.** A wedged page must never be pooled
  (`daemon.mts:930-943`).
- **Reset drift**, once per fingerprint per root: pose a reference shot on a
  reset page, byte-compare against the fresh-boot frame, report in `/health`, log
  loudly when it grows. Use a **`follow` shot** — those are the 47 RESCUE says
  are order-dependent, so they are the ones with something to say.
- **Parking** with the two timers Phase 0 measured.

### Phase 5 — the frame cache

Scaffold's `FrameCache` (`daemon.mts:277-350`), under
`~/.cache/ffxv-harness/<keyhash>/frames/`.

**Not `tmp/`.** An earlier draft put it there on the strength of `CLAUDE.md`'s
"deleting `tmp/` must cost nothing" — true, but `tmp/` is *per-worktree*, and a
per-worktree cache cannot serve the cross-agent hits that are the entire point of
a shared daemon. The cache lives beside the registry, keyed by fingerprint, and
remains free to delete. It must not go near `src/public/baked/`, which costs a
re-bake.

- Keyed **(fingerprint, shot, viewport, query)** — deliberately *not* root, so
  two worktrees on the same commit share hits. Never serve across fingerprints;
  `--cold` and `--skip-cache` bypass entirely.
- **Stats sidecar** next to every frame. Without it a hit returns
  `{ms: 0, cached: true}` and `triangles`/`calls` become `undefined` — numbers
  that blink in and out depending on whether another agent asked first are
  indistinguishable from geometry actually changing.
- **Prune N fingerprints at each end** (`CACHE_KEEP_PER_END`): the oldest as a
  record of where we started, the newest for the active loop. 1600×900 PNGs over
  a 139-shot corpus reach gigabytes in a session.
- **Interaction with `imgdiff.mjs`:** a cached frame is byte-identical by
  construction, so a diff against a hit reads 0.0 and proves nothing about the
  build. `imgdiff.mjs` must record each side's fingerprint and refuse — or loudly
  annotate — a comparison where both sides came from the same one.

### Phase 6 — deadlines, the quiet lane, health and docs

- **Every client passes a deadline**; `429 {busy}` carries `queueDepth`,
  `estimatedWaitMs`, `ownCostMs`, `why` (**naming the other worktrees ahead of
  you**) and a `hint`. Clients exit 4, not 1, so a saturated machine is
  distinguishable from a broken build.
- **The exclusive profile lease** for `perf.mjs`, `bootprof.mjs` and any future
  measurement tool: refuse unless every queue is idle and no lease is out, then
  `pool.closeAll()` before handing over, and block new work until released
  (`daemon.mts:752-762`).
  **This is the payoff of the shared daemon.** RESCUE §B6 threw away every perf
  number from the last session because they were taken under 6 concurrent
  chromiums. Under per-worktree daemons that is unfixable — a daemon cannot
  quiesce browsers it does not own. Under one shared daemon, "the machine is
  quiet" becomes a property the daemon can *enforce*, not merely hope for.
  Also stamp every perf report with the state it was taken under: pool size,
  roots active, load average.
- **`/health`** reports fingerprint and vite port **per root**, workers
  busy/total, queue depth per lane per root, pool size and park state, cache hit
  rate, reset drift, uptime, boots vs reuses. It must **never touch a page** — a
  slow capture would otherwise block the answer to "are you busy?".
- **`cleanup.mjs`** learns the registry: report the shared daemon, its roots, its
  browsers, and any chromium/vite *not* accounted for by it. `--kill` targets only
  processes the daemon disclaims. Never blanket-kill chromium on a shared box —
  scaffold ships a `browser-guard.sh` for exactly this.
- **`npm run` scripts for the gates that have none.** RESCUE §B14:
  `package.json` has only `dev`/`build`/`preview`/`shoot`, so `creaturecheck.mjs`'s
  207-pose grounding gate is wired to nothing. Add `check:gate` running
  `creaturecheck`, `combatloop`, `integration`, `gameplay`, `roadcheck` — also the
  "run the full gate suite at every merge" that RESCUE §B5 argues for after
  `combatloop` silently fell from 30/30 to 21/30.
- **Docs.** Rewrite `CLAUDE.md`'s "Running the harness" section — *especially*
  the now-false "one `PORT` per worktree" — and add `src/tools/README.md` as the
  contract in scaffold's format: tool table, page contract (`window.GAME`,
  `GAME.ready`, `applyShot`, `settle`, `resetClock`, `reset`), lanes, deadlines,
  budget, and how to find the shared daemon.

---

## Order

```
Phase 0  measure ──────────────────────────────────────┐  (gates everything)
                                                       │
Phase 1  repo identity + shared daemon + multi-root ◄───┘  ← ship first, alone
   │        (a strict win even while still serial)
   ▼
Phase 2  harness.mjs + convert 20 tools    ── parallelisable across agents
   │
   ▼
Phase 3  scheduler + fair-share across roots
   │
   ├──► Phase 4  reset + spares + park   (needs Party.snap first)
   ├──► Phase 5  frame cache
   └──► Phase 6  deadlines, quiet lane, health, docs
```

Phases 1, 3 and 4 all touch `daemon.mjs` and want **one owner, sequentially**.
Phase 2's twenty conversions are the bulk of the work and are almost perfectly
parallel.

## Risks and landmines

- **Concurrent renders may not be byte-stable.** Gate in Phase 0, question 4. A
  smaller win beats captures that quietly differ.
- **Version skew on the daemon itself.** An agent editing `daemon.mjs` in one
  worktree does not restart the daemon running from another's copy. `PROTOCOL` +
  `/version` + a loud client-side refusal, or this bites during exactly the work
  that implements it.
- **Cross-root contamination.** Serving worktree A's page to worktree B's request
  is the false-result failure the old refusal existed to prevent. `(root,
  fingerprint)` is part of page identity and spare adoption; it must be asserted,
  not assumed. Add a test that requests the same shot from two worktrees on
  different commits and checks the frames differ.
- **The shared daemon is a single point of failure.** Three agents now depend on
  one process. It must never wedge: every worker catches its own failures
  (`daemon.mts:246-252`), a failed reset recycles rather than pools, and
  `/health` must answer without touching a page.
- **Starvation.** Without two-level dispatch a 139-shot corpus starves everyone.
  Test it explicitly: run a corpus in one worktree and time a single shot in
  another.
- **The soft reset lies.** A reset leaving formation, dungeon lighting or weather
  behind produces frames that are *plausible and wrong* — the most expensive
  kind. Reset-drift detection is mandatory, on a `follow` shot.
- **Fingerprint granularity.** `sourceStamp()` stats every source file, so any
  edit invalidates every cached frame and re-boots every page for that root.
  Correct and conservative — do not "optimise" it to a subset. The cache and the
  reset path are what make it cheap; the stamp stays paranoid.
- **`constructor.name` is mangled in production builds** (RESCUE §C). Anything in
  the daemon identifying a system by class name breaks under `--prod`.

## Definition of done

- [ ] Phase 0 bench in `project/journal/`, with the knee, its cause (GPU / CPU /
      RSS), park and reset costs, and the concurrency byte-stability result. Every
      default in `daemon.mjs` traceable to a row.
- [ ] **One daemon serves all three worktrees.** Started from any of them, found
      by all of them, and it survives `git worktree remove` of the one that
      started it.
- [ ] `grep -l chromium.launch src/tools/*.mjs` returns **`daemon.mjs` and nothing
      else**.
- [ ] Four agents in four worktrees capture concurrently and the machine never
      exceeds the measured browser budget — verified by watching `/health` during
      a real fan-out.
- [ ] Two worktrees on **different** commits get demonstrably different frames for
      the same shot; two on the **same** commit get a cache hit and one render.
- [ ] A `fix`-lane single shot in worktree B is served while a 139-shot `sweep`
      corpus runs in worktree A, with latency dominated by its own render.
- [ ] Reset drift on a `follow` shot is byte-identical — RESCUE §B1's acceptance
      test, *"a capture applied after five other captures renders the same frame as
      one applied first"*, checked automatically once per fingerprint.
- [ ] `perf.mjs` refuses to run unless the **whole machine** is quiet, and stamps
      every report with the state it was taken under.
- [ ] A request that cannot meet its deadline returns `429` with a real estimate,
      names who is ahead of it, and exits 4. No tool hangs for 300 s.
- [ ] `npm run check:gate` runs the five gate tools and is documented as the merge gate.
- [ ] `src/tools/README.md` exists; `CLAUDE.md` no longer says "one `PORT` per worktree".
