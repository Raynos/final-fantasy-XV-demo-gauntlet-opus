# Harness plan — one trunk, one daemon, content-addressed builds

Status: PROPOSED (2026-08-23, opus) — **Decision 1 is LOCKED**; Decisions 2 and 3
and every phase below are proposals that assume it. **Decision 1 was tested
against a night of running roughly a dozen agents the other way on 2026-08-23
and it survives, but one of its three reasons was wrong and the phase order
should change — see the evidence section under it.**

**Nothing in this plan is built, and the defect it describes has got worse.**
Audited 2026-08-23 against the tree: **0 of 15** definition-of-done items are
met, and the tool count in "Cause one" below has been corrected upward from
20-of-34 to **30-of-48**. The one thing here that did ship is the sweepguard,
and it shipped as a Claude Code hook (`.claude/hooks/guard-git-add-all.sh`,
wired in `.claude/settings.json`), *not* in `.githooks/` — look there before
concluding it is missing.

Supersedes the unprefixed `2026-08-21-harness-daemon.md`, now merged into this
file.

## Context

`project/archive/RESCUE-2026-08-21.md` §C ("Harness") names the defect that killed three agents last
session:

> **The machine saturates.** 6+ concurrent headless Chromiums make every
> measurement worthless *and* stall agents outright. **Cap concurrency at ~4.**

That is a symptom, and the "~4" is a guess nobody measured. There are three
structural causes, and only the first is the one people notice.

**Cause one — thirty tools each own a browser.** **Thirty of forty-eight** tools
in `src/tools/` call `chromium.launch` themselves (re-counted 2026-08-23; it was
twenty of thirty-four when this was written, so the trend is the wrong way and
every new tool adds to it); seventeen spawn their own `vite` too. Each carries a copy-pasted `portOpen()` / `ensureServer()` /
`page.goto('?q=…&shoot=1')` / `waitForFunction('window.GAME.ready')` preamble —
`perf.mts:47-70`, `gameplay.mts:80-82`, `combatloop`, `integration`, `uxcheck`,
`driftcheck`, `heightcheck`, `mapshoot`, `ui-shoot`, `dresscam`, `bootprof`,
`chartshoot`, `detcheck`, `attrib`, `shrink`, `sheet`, `probe`, `mapview`. Every
one is an independent, unbudgeted claim on the machine.

**Cause two — the daemon serialises, so agents route around it.**
`src/tools/daemon.mts` already solves *boot cost* correctly: one vite, one
chromium, one warm page, a source fingerprint so a stale page is never reused
(`daemon.mts:36-69`), `--cold` for provable independence. But `queue()`
(`daemon.mts:249-254`) chains every request onto one promise — exactly one
browser doing exactly one thing — so only `shoot.mts` and `corpus.mts` use it.
**Agents bypass the daemon because it serialises them, and bypassing it is what
saturates the machine.**

**Cause three — the daemon is scoped to a checkout, and we run many checkouts.**
`ensureDaemon()` (`daemon.mts:104-121`) *refuses* a daemon serving a different
root, and `CLAUDE.md` says "one `PORT` per worktree". So today's design is one
daemon per worktree; with three agent worktrees live, a perfect per-daemon cap of
4 still puts twelve chromiums on one GPU. **A browser budget is a property of the
machine, so the process that owns it must be too** — and no per-worktree daemon
can ever see the whole machine.

### The measured facts this plan starts from

| fact | source |
|---|---|
| 18 cores, 128 GB RAM, **one** GPU | `sysctl hw.ncpu hw.memsize` |
| Cold capture ≈ 12 s, warm ≈ 1.5 s | `daemon.mts:27` |
| Boot is ~110 shader compiles + world build, not chromium launch | `daemon.mts:14-17` |
| Toggling one light's `visible` recompiled 43 programs — 9.5 s freeze | RESCUE §C |
| `?shoot=1` pages **do not run rAF** (`main.ts:27` gates `game.start()`) | `src/main.ts` |
| Uncapped rAF measured *worse*; deliberately absent | `chromium.mts:5-18` |
| Remote is now `git@github.com:Raynos/final-fantasy-XV-demo-gauntlet-opus.git` | `git remote -v` |
| Three agent worktrees live, all sharing one `.git` | `git worktree list` |

**The 18-core / 128 GB figure falsifies the obvious explanation.** Six chromiums
cannot saturate 18 cores or 128 GB. What they *can* saturate is the single Metal
GPU they all render through (`--use-angle=metal`, `chromium.mts:29`). If so, the
cap belongs on concurrently *rendering* pages, not on browsers, and
parked-but-resident browsers are nearly free. **We do not know yet. Phase 0
exists to find out before any number becomes a default.**

---

## Decision 1 (LOCKED) — drop worktrees; one trunk, many agents

**Settled, not proposed.** Everything below assumes a single shared checkout on
`main`; do not re-litigate it, and do not write a plan that keeps worktrees as a
fallback. What is still open is only *how* the guards and the daemon land.

`../../games/kami-kakushi` runs many concurrent agents in **one directory on one
branch** and has the working agreements to make it safe (`AGENTS.md`, "How to
work here"). That is the better substrate here, and not only for the daemon:

- **Worktrees were not buying isolation anyway.** RESCUE records the one merge
  conflict in 114 commits, and it came from *"two agents sitting on a large
  uncommitted change"* — a commit-cadence failure, which a worktree does not fix.
- **They actively cost.** Three checkouts of a repo whose `src/public/baked/`
  terrain cache is expensive to regenerate, three vite servers, three daemons,
  three ports to keep unique, and a coordinator merge step per agent.
- **They break every cross-agent optimisation.** Shared warm pages, cross-agent
  cache hits, request coalescing and machine-wide quiescing for `perf.mts` are
  all impossible across checkouts and free within one.

### Decision 1, tested against a night of running it the other way (2026-08-23)

Roughly a dozen agents ran tonight in worktrees on disjoint directories. That is
the substrate this decision proposes to replace, so it is worth saying what it
actually cost, bullet by bullet. **The conclusion survives; the reasons reorder,
and one of the three was wrong.**

**"Worktrees were not buying isolation anyway" — this one was wrong.** Not a
single conflict tonight came from a shared index, because there wasn't one. Every
conflict was *semantic*: a lane that branched before the zero-`any` pass merging
code written against the untyped shapes (`Geo.ts`, `Hair.ts`, `Outfit.ts`,
`DayCycle.ts`, `Elemancy.ts`, `Quests.ts`, `integration.mts`). Worktrees isolated
the index exactly as advertised. What they did not isolate is *time* — and the
sharpest example is `tsconfig.tools.json`, where **three lanes independently
found and fixed the same broken `baseUrl` within about two hours**, because each
branched from a base that still had it. A single trunk would have made that one
fix, once. That is a real argument for Decision 1, and it is not the argument the
bullet makes.

**"They actively cost" — confirmed, and worse than stated.** The plan names the
cost of re-baking `src/public/baked/` per checkout. The workaround we used —
symlinking it into every worktree — introduced a hazard the plan does not
anticipate: `texbake.mts --force` from any worktree rewrites the **shared**
artifacts from *that branch's* sources, so every other tree then boots on
textures its own code never generated. Self-healing on merge and completely
invisible before it. A shared mutable cache across isolated checkouts is the
worst of both models. Separately, a worktree can be created from a stale ref with
no warning at all: one agent opened **131 commits behind** and spent the top of
its session discovering that.

**"They break every cross-agent optimisation" — confirmed, and this turned out
to be the strongest reason of the three.** Machine-wide quiescing is the one that
bit hardest: **`perf.mts` could not be certified once all night.** The new ruler
voided every run it was asked for, correctly, because something else was always
capturing. Two perf gates therefore remain formally unmeasured after a session
that changed the renderer substantially. Port allocation is the same story in
miniature — five tools carried hand-picked default ports, one collided with a
co-agent, and `pnpm run check` reported a combat regression that did not exist.

**What this changes about the plan.** Nothing about the decision. It does argue
for reordering the phases: **Phase 3 (one client, every tool through the daemon)
is worth more than Phase 1 or 2**, because port ownership and quiescing were the
two things that actually cost measurements tonight, and both are Phase 3's.
Meanwhile Phase 1's guard is no longer hypothetical — the sweepguard shipped, and
it blocks whole-tree staging and bare commits today. The precondition that made
Decision 1 unsafe to act on is already half-built.

### What must come with it (from kami-kakushi, verbatim in spirit)

A shared tree without these is strictly worse than worktrees. All are proven in
that repo, several after being learned the hard way:

1. **Pathspec-only commits.** `git commit -m "…" -- path/a path/b`. Never
   `git add -A/-u/.`, never `git commit -a/-am`, never a bare `git commit` —
   each snapshots the **shared index** and sweeps a co-agent's in-flight staged
   work (*"bit us repeatedly: f84aff9, 0e10d96"*). `git add` is for **new files
   only**; edits commit directly. Never `stash`/`checkout`/`restore` a file you
   did not author. Port `.claude/hooks/guard-git-add-all.sh` — it blocks exactly
   these shapes, with a `SKIP_SWEEPGUARD=1` escape that **appends to a committed
   ledger**, so bypasses show up in diffs rather than being buried in a
   transcript.
2. **Many small commits straight to main; no branching for routine work.**
   Already `CLAUDE.md` policy here; the shared tree makes it load-bearing rather
   than advisory.
3. **Don't fight someone else's red.** If the tree is broken by another agent,
   leave your commit local — never `SKIP_VERIFY=1` a red tree onto main.
4. **A fast, laned verify gate.** Kami holds pre-commit to a **5 s soft / 8 s
   hard** budget by running the slow tests only at push (`// @slow`), because a
   gate slow enough to skip *gets* skipped. Our pre-commit runs `vite build`;
   RESCUE §B5 shows `combatloop` silently fell 30/30 → 21/30 with nobody
   noticing. Fast lane at commit, full gate roster at push, one source of truth
   for the roster.
5. **One shared dev server, reused, never a rival.** Kami pins vite to one pane
   on one port and ships **two** interlocks — a guard inside vite *and*
   `guard-dev-server.sh` as a `PreToolUse` hook that blocks both starting a
   second server and killing the holder. Our equivalent guards the daemon (Phase 6).
6. **Ephemeral lane claims validated by owner liveness, not TTL**
   (`src/scripts/tree-claim.ts`): a git-ignored `project/.claims/<lane>.json`,
   created `O_EXCL`, reaped when the owner's pid/pane is gone. Useful for
   cross-*session* mutexes (push, exit) that the daemon cannot see.
7. **The repo is the memory.** Journal every session; keep one replaced-in-place
   status snapshot. We have `project/journal/` and `project/STATUS.md`
   already — RESCUE §D notes the snapshot currently lies, claiming 7 running
   agents and listing fixed bugs as open.

### The cost the single tree introduces, and the honest answer

**Every agent's unsaved edit changes the source under every other agent's
capture.** `sourceStamp()` (`daemon.mts:36-69`) stats every file in `src/`, so
one save by anyone invalidates every cached frame and reboots every warm page
for everyone. In a worktree world that could not happen.

Kami-kakushi does not have to solve this — their gate is 3 s and their game is
2D. Ours boots in 12 s behind ~110 shader compiles. So this plan does not wave it
away; **Decision 2 is the answer to it**, and the two decisions only work
together.

## Decision 2 — build identity is a git tree sha, not the working tree

The daemon stops serving "the working directory" and starts serving a **build
identity**:

```
build := <git tree sha>        # content-addressed, immutable, shared by everyone
       | dirty:<abs root>      # the live working tree — exclusive, never cached
```

For a sha, the daemon materialises the tree once into
`~/.cache/ffxv-harness/<repo>/trees/<sha>/` (`git archive | tar -x`, or a
detached worktree it owns), runs one vite there, and keeps it until pruned.

What this buys:

- **An agent's uncommitted edit disturbs nobody.** Captures at `HEAD` are stable
  while five agents type.
- **The fingerprint becomes exact and free** — a tree sha, not an mtime walk over
  every file.
- **Cache keys become commit shas**: meaningful, quotable in a handoff, stable
  across sessions, comparable across machines. `imgdiff` of two shas is a real
  statement about the code rather than about when someone saved.
- **Cross-agent hits go to ~100%.** Five agents reviewing `HEAD` render each shot
  once, total.
- **"Commit early and often" stops being advice.** It is already `CLAUDE.md`
  policy, already enforced by a pre-commit `vite build`, and RESCUE §C ends with
  *"tell every agent to commit early and often, even unverified `WIP:` commits"*
  after three agents stalled with uncommitted work. Now you commit **to see your
  work**, which is the cheapest possible way to make the rule stick.

And the pressure valve for the tight edit loop:

- **`dirty:` builds serve the live tree**, with **one exclusive lease at a time**,
  never cached, and every response flagged `dirty: true` with the base sha and
  the list of modified paths. A dirty frame is for the builder's own eyes —
  never quoted as evidence, exactly as `../game-scaffold` treats `pose.mts`
  output. Tools print the flag; `sheet.mts` and `corpus.mts` refuse dirty frames
  outright.
- **Honest caveat:** on a shared tree a `dirty:` capture contains *every* agent's
  in-flight edits, not just yours. That is the real cost of Decision 1, it is not
  removable, and it is precisely why the sha path is the default for anything
  anyone will judge.

## Decision 3 — one daemon per repository, keyed off the remote

```js
// src/tools/identity.mts
export function repoKey() {
  const remote = git('config --get remote.origin.url');    // now: git@github.com:Raynos/…
  if (remote) return normaliseRemote(remote);              // host + path, no scheme/auth/.git
  return realpathSync(git('rev-parse --git-common-dir'));  // fallback for a remoteless clone
}
```

`DAEMON_PORT = 20000 + sha1(repoKey) mod 20000`, linear probe on collision. The
daemon writes `~/.cache/ffxv-harness/<keyhash>.json` (`{port, pid, key,
started}`); clients read it, fall back to the derived port, autostart on miss —
the existing `ensureDaemon()` flow, unchanged in shape.

**This deletes the `PORT`-per-worktree convention and the trap both `CLAUDE.md`
and RESCUE §C warn about** — aiming `framecam.mts` at the daemon port and hanging
for the full 300 s. Nobody picks a port; the daemon allocates vite ports from its
own block per build identity and returns them in the response.

The different-root refusal at `daemon.mts:110-118` — which exists because
*"silently reusing it captures the other repo's build, which has already produced
at least one false result"* — is **replaced, not weakened**. Cross-build
contamination is now prevented where it belongs, in page identity
`(build, viewport, query)`, and a daemon whose `repoKey` differs is still a hard
error.

**Migration:** during the transition the three existing worktrees simply appear as
three `dirty:` roots. Multi-root falls out of build-identity multiplexing rather
than being a separate mechanism, so nothing has to be ripped out on a flag day —
and when the worktrees go, that code path does not.

### The budget is in-process, and that is the argument

Because exactly one process wants browsers, the budget is a variable in that
process. No lock file, no lease ledger, no heartbeat, no stale-reclaim deadlock —
an earlier draft of this plan proposed all of that to coordinate N per-worktree
daemons, and one shared daemon deletes the entire mechanism. Beyond correctness
that is the main argument for this design: **the thing that cannot break is the
thing that isn't there.**

### Lifetime and ownership

- **The daemon outlives the session that started it.** It runs with cwd set to
  the common git dir and holds no handle to the checkout that launched it beyond
  that build's vite server, which it drops like any other when it goes idle.
  Retiring an agent — or removing the last surviving worktree during the Phase 1
  migration — must not kill the shared daemon.
- **`--stop` is global and says so.** A tool done with a build calls
  `/release-build`, which stops that build's server and recycles its pages. Only
  an explicit `daemon.mts --stop` kills the daemon itself.
- **Idle exit stays as-is**: browsers close after `BROWSER_IDLE_MIN`, the daemon
  after `DAEMON_IDLE_MIN`, taking every build server with it.

---

## What to take from `game-scaffold`

Read `../game-scaffold/tools/README.md` and `daemon.mts` before implementing.
Scaffold assumed a single checkout, so every mechanism needs `build` threaded
through it.

| mechanism | where | why it transfers |
|---|---|---|
| **Work-stealing scheduler** — priority queue per lane, N workers each owning a page, stealing when its own lane is empty | `daemon.mts:178-273` | Fixes the serial `queue()`. Scaffold measured 23.5 s → 12.0 s on 12 renders purely from not throwing away half the machine |
| **`BrowserPool`** — lease not own, LRU eviction of idle pages, wait-and-explain at capacity | `daemon.mts:353-478` | The one object that can enforce a cap, because it is the one thing that knows what every chromium is for |
| **Page parking** on `about:blank`, `loadedFp = ''` as the whole re-entry mechanism | `harness.mts:594-600` | The trick is the cheap part: every caller already reloads on fingerprint mismatch, so unpark needs no special case |
| **Soft reset to menu + spare pooling** — reset, return as `spare:N`, next lease adopts it | `daemon.mts:381-389, 908-945` | The "back to menu instead of a page refresh" that drains the queue fast |
| **Reset-drift check** — once per build, pose a shot on a reset page, byte-compare against the fresh-boot frame | `daemon.mts:947-975` | A drifting reset is a lying reset. See below |
| **Frame cache** keyed by (fingerprint, shot) **with a stats sidecar** | `daemon.mts:277-350` | The sidecar exists because a hit once silently returned `drawCalls: undefined` |
| **Request coalescing** on in-flight key | `daemon.mts:203` | Now cross-agent: five agents asking for `hero_full` at `HEAD` cost one render |
| **Deadline → `429 {busy}`** with EMA cost model and estimated wait | `daemon.mts:203-273` | Turns "your agent hangs for 300 s" into a number and a decision |
| **Exclusive profile lease** — quiesce every worker, close every page, refuse if anything is in flight | `daemon.mts:752-762` | Straight at RESCUE §B6, and only possible under a shared daemon |
| **`bench_test.sh`** — separates render / queue / spawn, takes a lock, small by default | `tools/bench_test.sh` | Phase 0 needs exactly this |

**Do not take:**

- **Scaffold's `WORKERS_PER_LANE = 4` and `MAX_CONCURRENT_BOOTS` defaults.**
  Measured on a 12-core box with a toy game whose boot is 7.7 s of
  mostly-single-threaded CPU. Ours is ~110 shader compiles against one GPU. The
  curve shape may hold; the knee does not. Phase 0 re-derives them, and the
  numbers go into a comment in the style of `chromium.mts:5-18`.
- **Scaffold's park rationale verbatim.** It parks because a posed `__READY__`
  page burns 0.6–1.8 cores of rAF. **Ours does not** — `main.ts:27` never starts
  the loop under `?shoot=1`. Our park case is RSS and the GPU context: strong for
  play-mode pages (`gameplay`, `combatloop`, `uxcheck` run the real loop),
  unproven for capture pages. Two measurements, two timers.
- **`vite build` + `preview` as the only path.** Under Decision 2 a sha build is
  immutable, so `vite build` once per sha and serve `preview` is now the *right*
  default — but keep a dev-server mode for `dirty:` builds, where a full build per
  keystroke is the thing we are avoiding.
- **Scaffold's `__POSE__`/`__STATE__`/`__START__` contract.** Ours exists and is
  better named for this game: `window.GAME`, `GAME.ready`, `applyShot`, `settle`,
  `resetClock`, `Menus.setScreen`. Rename nothing; add only `GAME.reset()`.
- **`.port-base` per checkout.** Superseded by Decision 3.

### Why the reset contract matters more here than in scaffold

RESCUE §B1 is the determinism hole: companions are still steering to wandering
formation slots when a shot settles, **formation state carries across shots**, and
*"all 47 `follow` shots are order-dependent"*. `Animator.rest()` exists at
`Anim.ts:279` with zero callers; `Party.snap()` was never written.

Page reuse is what makes that bug *matter* rather than merely exist — a warm
daemon is a machine for carrying state across shots, and a shared daemon carries
it across *agents*, where it is invisible and unattributable. So `Party.snap()`
is a **prerequisite** of Phase 4, and scaffold's reset-drift check automates the
acceptance test RESCUE already wrote: *"a capture applied after five other
captures renders the same frame as one applied first."*

---

## Phases

### Phase 0 — measure, before any default is chosen

Nothing else starts until this is done. RESCUE's "~4" and scaffold's "8" are both
unmeasured *for this game on this machine*; shipping either as a default repeats
the mistake this document is about.

Port `bench_test.sh` to `src/tools/bench.mts`. As scaffold's does: take a lock (a
previous run once survived its supervisor and ran concurrently with a new one —
every number was garbage and looked fine), default small enough to run
constantly, and **separate the three things a client's wall time actually is** —
`render` (daemon-reported ms), `queue` (waiting behind other jobs), `spawn` (node
startup, per request).

Sweep `WORKERS` ∈ {1, 2, 3, 4, 6, 8} over a fixed warm wave, cache bypassed,
recording wall, req/s, mean render ms, **core-seconds**, **peak RSS**, GPU load.
Then answer, with numbers:

1. **Where is the knee, and what is it made of?** Throughput plateauing while
   cores idle and RSS stays trivial against 128 GB ⇒ the GPU binds, and the cap
   belongs on concurrent *renders*. Cores or RSS binding first ⇒ it belongs
   there. This decides whether `BROWSER_BUDGET` and `WORKERS` are the same number.
2. **What does a park cost and save here?** Round trip vs the RSS and idle CPU of
   a resident `?shoot=1` page (rAF stopped) *and* a resident play page (rAF
   running). Two answers, two timers.
3. **What does a soft reset cost against a reload?** Measure on a
   **lighting-changing** shot (a `cine_*` or dungeon shot), not just `hero_full`:
   43 shader recompiles cost a measured 9.5 s, and a reset that triggers them is
   slower than the reload it replaces.
4. **What does materialising a sha tree cost?** `git archive` + `vite build` +
   first boot, and the steady-state disk of N cached trees. This sets the tree
   prune policy and tells us whether `HEAD`-by-default is affordable.
5. **Does capture quality degrade under concurrency?** Capture `hero_full` at
   W=1 and W=knee and `imgdiff` them. Anything above the documented 1.5–1.9/255
   noise floor means concurrent rendering is not frame-safe.

**Question 5 is a gate. If concurrent renders are not byte-stable, stop and
redesign** — workers then parallelise boot and settle but serialise the
screenshot. Parallelism that quietly changes pixels is worse than the serial
queue we have.

Deliverable: `project/journal/2026-08-21-harness-bench.md` with the table, and
every default in `daemon.mts` traceable to a row in it.

### Phase 1 — the single-trunk substrate

Independent of the daemon; land it first because it is cheap and it is what makes
Decision 2 tolerable.

- Port `guard-git-add-all.sh` from kami-kakushi, with the ledger escape.
- Port `guard-bash-safety.sh`'s tree-wide destructive-op rules (no escape).
- Rewrite `CLAUDE.md` "Committing": pathspec-only, `git add` for new files only,
  never touch a file you did not author, don't fight someone else's red.
- Split the pre-commit gate into a **fast commit lane** (build + the sub-10 s
  checks) and a **full push gate** (`creaturecheck`, `combatloop`, `integration`,
  `gameplay`, `roadcheck`) with one source of truth for the roster, and a
  `pnpm run check:gate` that runs it — RESCUE §B14 notes `creaturecheck.mts`'s
  207-pose grounding gate is wired to nothing, and §B5 argues for the full suite
  at every merge after `combatloop` silently fell to 21/30.
- Fix `project/STATUS.md`, which RESCUE §D says still claims 7 running
  agents and lists fixed bugs as open.
- **Retire the worktrees** once Phase 3 lands: commit or land each one's work,
  `git worktree remove`, delete the per-worktree `PORT` guidance.

### Phase 2 — repo identity and build identity

- `src/tools/identity.mts` — `repoKey()`, `keyHash()`, `derivedPort()`.
- Registry at `~/.cache/ffxv-harness/<keyhash>.json`; `ensureDaemon()` reads it,
  autostarts on miss, hard-errors on key mismatch.
- `BuildStore`: `resolve(ref) → sha`, materialise to
  `~/.cache/ffxv-harness/<keyhash>/trees/<sha>/`, `vite build` once, serve
  `preview`; LRU-prune whole trees. `dirty:<root>` bypasses to a dev server on
  the live tree, exclusive.
- `Harness` holds `builds: Map<buildId, {port, server, lastUsed}>`; every route
  takes `build` (default `HEAD`).
- `PROTOCOL` constant + `/version`. **An agent editing `daemon.mts` does not
  restart the running daemon**, so a client with a mismatched `PROTOCOL` must
  fail loudly with the restart command rather than silently talk to an older
  daemon. Harness work is self-hosting; this is the one place it bites.
- `/health` reports per build: port, sha, dirty flag, pages, queue depth.

Ship before the scheduler — it is a strict win even while still serial. Three
agents sharing one serial daemon is three chromiums instead of twelve, which is
already the difference between the machine working and not.

### Phase 3 — one client, every tool through the daemon

Extract the copy-pasted preamble into `src/tools/harness.mts` (mirroring
scaffold's `harness.mts`):

```js
export { call, ensureDaemon, daemonPort }
export async function withPage(opts, fn)    // lease → run → release, always
export async function shots(names, opts)    // → /shots
export async function evalIn(fn, arg, opts) // → /eval
export async function probe(file, opts)     // → /probe
export async function lease(opts)           // → /lease, returns a CDP endpoint
```

Every entry point takes `--build <ref>` (default `HEAD`) and `--dirty`.

Two tiers:

- **Capture tools** — `mapshoot`, `ui-shoot`, `dresscam`, `chartshoot`, `sheet`,
  `shrink`, `detcheck`, `attrib`, `mapview`, `framecam`, `creaturecheck`. They
  want a posed page and frames: they become `/shots` and `/eval` callers and lose
  `chromium.launch` entirely.
- **Play tools** — `gameplay`, `combatloop`, `integration`, `uxcheck`,
  `driftcheck`, `heightcheck`, `roadcheck`, `bootprof`. They drive real input over
  a running loop and need the `Page`, not a frame. They take a **lease** and
  connect over CDP: the daemon owns the chromium, budget, deadline and teardown;
  the tool keeps full Playwright control. This is scaffold's `/lease` verbatim and
  why that route exists.

`perf.mts` and `bootprof.mts` take the **exclusive profile lease** (Phase 7).
`bake.mts`, `imgdiff.mts`, `crop.mts`, `orphans.mts`, `agentstats.mts` need no
browser and are untouched.

**One tool per commit.** These twenty conversions are on disjoint files and
parallelise across agents almost perfectly — which is what the harness is for.

### Phase 4 — the scheduler

Replace `queue()` with scaffold's `Scheduler` (`daemon.mts:178-273`):

- **Lanes as priority classes, not execution units**: `fix` (one agent, one shot,
  wants latency) and `sweep` (corpus runs, `creaturecheck`'s 207 poses, contact
  sheets — throughput, must never starve `fix`).
- **Home lane + work stealing** — what makes two lanes cost nothing when only one
  is busy.
- **Fair-share across agents**: round-robin over *requesting agent* before lane
  priority, so one agent's 139-shot corpus cannot monopolise the pool. `/health`
  reports depth per agent, so "why is my capture slow" has a one-line answer
  naming who is ahead.
- **EMA cost per kind** (`warm`/`cold`/`probe`) so the busy answer carries a real
  estimate.
- **Coalescing on `(build, shot, viewport, query)`.**

Worker count from Phase 0.

### Phase 5 — the reset contract and spare pooling

**Prerequisite: `Party.snap()` (RESCUE §B1)**, called from `Game.applyShot`
(`Game.ts:174`).

```js
reset() {
  this.stop();
  this.resetClock();                     // Game.ts:255, already correct
  this.get('Party')?.snap();             // RESCUE B1 — the determinism hole
  this.get('Menus')?.setScreen('main');  // Menus.ts:156
  this.get('Story')?.applyShot(null);
  this.get('Dungeons')?.exit?.();        // exterior lighting restored — RESCUE §A
  this.get('HUD')?.toasts?.clear();
  for (const s of this.systems) s.reset?.();
  document.getElementById('boot')?.remove();
}
```

- Pages are **reset, not reloaded**, between jobs on the same build.
- A released lease resets and returns as `spare:N`; the next lease **for the same
  build** adopts it before booting. Spares are per-build — the one place
  scaffold's adoption logic must not be copied blindly.
- **A failed reset recycles the browser.** A wedged page must never be pooled.
- **Reset drift**, once per build: pose a reference shot on a reset page,
  byte-compare against the fresh-boot frame, report in `/health`, log loudly when
  it grows. Use a **`follow` shot** — those are the 47 RESCUE says are
  order-dependent, so they are the ones with something to say.
- **Parking** with the two timers Phase 0 measured.

### Phase 6 — the frame cache

Scaffold's `FrameCache` under `~/.cache/ffxv-harness/<keyhash>/frames/<sha>/`.

Not `tmp/` — `CLAUDE.md`'s "deleting `tmp/` must cost nothing" is true but `tmp/`
is per-checkout, and a per-checkout cache cannot serve the cross-agent hits that
are the point. The cache lives beside the registry and remains free to delete. It
must not go near `src/public/baked/`, which costs a re-bake.

- Keyed **(sha, shot, viewport, query)**. `dirty:` builds are **never cached**.
  `--cold` and `--skip-cache` bypass.
- **Stats sidecar** next to every frame. Without it a hit returns
  `{ms: 0, cached: true}` and `triangles`/`calls` become `undefined` — numbers
  that blink in and out depending on whether another agent asked first are
  indistinguishable from geometry actually changing.
- **Prune whole shas**, N at each end: the oldest as a record of where we
  started, the newest for the active loop. 1600×900 PNGs over a 139-shot corpus
  reach gigabytes in a session.
- **`imgdiff.mts` records each side's sha** and refuses — or loudly annotates — a
  comparison where both sides came from the same one, since a cached frame is
  byte-identical by construction and such a diff proves nothing about the code.
  Conversely `imgdiff a1b2c3 d4e5f6 hero_full` becomes a first-class operation.

### Phase 7 — deadlines, the quiet lane, guards, health, docs

- **Every client passes a deadline**; `429 {busy}` carries `queueDepth`,
  `estimatedWaitMs`, `ownCostMs`, `why` (naming who is ahead) and a `hint`.
  Clients exit 4, not 1, so a saturated machine is distinguishable from a broken
  build.
- **The exclusive profile lease** for `perf.mts`/`bootprof.mts`: refuse unless
  every queue is idle and no lease is out, `pool.closeAll()` before handing over,
  block new work until released. **This is the payoff of Decisions 1 and 3.**
  RESCUE §B6 threw away every perf number from last session because they were
  taken under six concurrent chromiums; under per-worktree daemons that is
  unfixable, because a daemon cannot quiesce browsers it does not own. Under one
  daemon owning one machine, "the machine is quiet" becomes a property that can
  be *enforced*. Stamp every perf report with the state it was taken under: pool
  size, agents active, load average, and the sha.
- **`guard-harness.sh`** (`PreToolUse`, modelled on kami's `guard-dev-server.sh`,
  which ships the vite-level guard *and* the hook because one alone kept losing):
  block a bare `vite`/`pnpm run dev`, block `chromium.launch` outside the daemon,
  block killing the daemon or a pooled browser. Escapes named and ledgered. Never
  blanket-kill chromium on a shared box — scaffold ships `browser-guard.sh` for
  exactly this.
- **`cleanup.mts`** learns the registry: report the daemon, its builds, its
  browsers, and any chromium/vite it disclaims. `--kill` targets only the latter.
- **`/health`** reports, per build: sha or dirty flag, server port, pages, queue
  depth per lane; and machine-wide: workers busy/total, pool size and park state,
  cache hit rate, reset drift, uptime, boots vs reuses. It must **never touch a
  page** — a slow capture would otherwise block the answer to "are you busy?".
- **Docs.** `src/tools/README.md` as the contract in scaffold's format: tool
  table, page contract (`window.GAME`, `GAME.ready`, `applyShot`, `settle`,
  `resetClock`, `reset`), build identities, lanes, deadlines, budget, how to find
  the daemon. Rewrite `CLAUDE.md`'s harness section — especially the now-false
  "one `PORT` per worktree".

---

## Order

```
Phase 0  measure ─────────────────────────────────────────┐  (gates everything)
Phase 1  single-trunk substrate (guards, gates, docs) ────┤  (independent, cheap)
                                                          ▼
Phase 2  repo identity + build identity  ◄──── ship alone, still serial
   │
   ▼
Phase 3  harness.mts + convert 20 tools   ── parallelisable across agents
   │
   ▼
Phase 4  scheduler + fair share
   │
   ├──► Phase 5  reset + spares + park   (needs Party.snap first)
   ├──► Phase 6  frame cache
   └──► Phase 7  deadlines, quiet lane, guards, health, docs
```

Phases 2, 4 and 5 all touch `daemon.mts` and want **one owner, sequentially**.
Phase 3 is the bulk of the work and is almost perfectly parallel.

## Risks and landmines

- **Concurrent renders may not be byte-stable.** Gate in Phase 0, question 5. A
  smaller win beats captures that quietly differ.
- **The shared tree is only safe with the guards.** Decision 1 without Phase 1 is
  strictly worse than worktrees — one `git add -A` sweeps four agents' staged
  work. Phase 1 is not optional and should land first.
- **`dirty:` frames carry other agents' in-flight edits.** Unavoidable on a
  shared tree. Flag every dirty response, refuse dirty frames in `sheet`/`corpus`,
  and never quote one as evidence.
- **Disk growth from materialised trees.** Each sha tree is a full `src/` plus a
  `dist/`. Prune aggressively and measure it in Phase 0, question 4. The terrain
  cache must be shared or symlinked across trees, never re-baked per sha.
- **Version skew on the daemon itself.** Editing `daemon.mts` does not restart the
  running daemon. `PROTOCOL` + `/version` + a loud client refusal.
- **Cross-build contamination.** Serving one build's page to another build's
  request is the false-result failure the old different-root refusal existed to
  prevent. `build` is part of page identity *and* of spare adoption; it must be
  asserted, not assumed. Add a test that requests the same shot at two different
  shas and checks the frames differ.
- **Fingerprint granularity on `dirty:` builds.** `sourceStamp()` stats every
  source file, so any edit invalidates every warm page on that root. Correct and
  conservative — do not "optimise" it to a subset. Sha builds make it cheap by
  making it rare; the stamp stays paranoid.
- **The daemon is a single point of failure.** Every agent now depends on one
  process. It must never wedge: workers catch their own failures
  (`daemon.mts:246-252`), a failed reset recycles rather than pools, `/health`
  answers without touching a page.
- **Starvation.** Without fair-share, a 139-shot corpus starves everyone. Test it:
  run a corpus and time a single `fix`-lane shot beside it.
- **The soft reset lies.** A reset leaving formation, dungeon lighting or weather
  behind produces frames that are *plausible and wrong* — the most expensive kind.
  Reset-drift detection is mandatory, on a `follow` shot.
- **`constructor.name` is mangled in production builds** (RESCUE §C). Sha builds
  now default to `vite build` + `preview`, so anything identifying a system by
  class name breaks on the *default* path rather than a rare one. Audit before
  Phase 2 ships.

## Definition of done

- [ ] Phase 0 bench in `project/journal/`, with the knee and its cause (GPU / CPU
      / RSS), park and reset costs, sha-tree cost, and the concurrency
      byte-stability result. Every default in `daemon.mts` traceable to a row.
- [ ] `git worktree list` shows **one** entry; `CLAUDE.md` no longer mentions a
      per-worktree `PORT`; the sweep guard is installed and its ledger exists.
- [ ] **One daemon serves every agent**, found without anyone choosing a port, and
      it survives the session that started it.
- [ ] `grep -l chromium.launch src/tools/*.mts` returns **`daemon.mts` and nothing
      else**.
- [ ] Five agents capture concurrently and the machine never exceeds the measured
      browser budget — verified by watching `/health` during a real fan-out.
- [ ] Five agents asking for the same shot at the same sha produce **one render**;
      two different shas produce demonstrably different frames.
- [ ] A `fix`-lane single shot is served while a 139-shot `sweep` corpus runs,
      with latency dominated by its own render.
- [ ] An uncommitted edit by one agent does not invalidate another agent's warm
      page or cached frames.
- [ ] Reset drift on a `follow` shot is byte-identical — RESCUE §B1's acceptance
      test, checked automatically once per build.
- [ ] `perf.mts` refuses to run unless the whole machine is quiet, and stamps every
      report with the state and sha it was taken under.
- [ ] A request that cannot meet its deadline returns `429` with a real estimate,
      names who is ahead, and exits 4. No tool hangs for 300 s.
- [ ] `pnpm run check:gate` runs the five gate tools and is the documented push gate.
- [ ] `src/tools/README.md` exists and `CLAUDE.md` points at it.
