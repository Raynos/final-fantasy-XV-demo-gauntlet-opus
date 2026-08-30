# Lane 16 — Gates (`src/tools/`)

Plan tasks 46 and 48, plus the red `driftcheck` and `reliefstat --against`.
Task 47 (`facecheck` VOID) is lane 1's and was not touched.

Every claim below is marked **verified** or **not verified**.

## Landed

### The prewarm queue never superseded anything — `3958370` (the headline)

**Verified.** `daemon.mts`'s `prewarm()` docstring says "newest sha wins — a
second commit supersedes the first rather than queueing two boots". The code did
not: `prewarming` is set at submit and cleared in the job's `finally`, so it only
ever rejected a duplicate request for the **same** sha; a request for a new sha
queued a second boot behind the first, and nothing ever dropped a prewarm for a
sha that had stopped mattering.

Measured from `daemon --health` and `harnessstats` at ~01:0x on 2026-08-31:

    sweep queue depth 55, of which 54 were prewarm
    workers 4/4 busy,  rssMb 10282
    stats.queuedSec 86663  vs  stats.ranSec 16072    -> 84% queue

Both arms of the `driftcheck` A/B below died on a 300 s `preparePage` timeout
behind that queue; lane 1's `facecheck --hide` commit records the same timeout
twice on a different tool; three lanes reported a `check` that never returned.

Fixed by superseding at the **front** of the queue, which is the one moment the
question can be answered honestly: a prewarm whose build is no longer
`prewarmWanted` steps aside in microseconds and logs a running count.

> **THE RUNNING DAEMON STILL HAS THE OLD CODE.** This takes effect on the next
> daemon start. `node src/tools/daemon.mts --stop` installs it *and* discards the
> 54 stale prewarms, at the cost of closing every leased page — so it is the
> coordinator's call, not a lane's. Filed in `project/TASKS.md`. **This is the
> single highest-value action available in the repo right now.**

### Task 46 — the bake-artifact gate — `3734e4c`, `23c3d52`

**Verified** (run, and it found a real defect on its first run).

- `src/tools/bakesources.mts` — new leaf module (node builtins only) owning the
  four source lists, `hashSources`, `hashSourcesAt` (the same hash *at a git
  tree*, via one `git cat-file --batch`), `statusOf` and `bakeBelongsTo`. The
  lists moved out of `bake.mts`/`texbake.mts` because those import `harness.mts`
  which imports `daemon.mts`, so a gate could not ask about the cache without
  dragging playwright in or keeping a second copy of a source list — and a second
  copy of a source list *is* the stale-cache bug.
  **Hash arithmetic verified byte-identical** to the old code against the live
  stamp (`terrain 86d272106f72fc25` both ways) before it landed.
- `src/tools/bakecheck.mts` — the gate. 5–9 ms. FRESH / STALE / MISSING /
  TRUNCATED per artifact, with the boot cost and the remedy printed.
  `--allow-cold` downgrades *absent* `texc`/`geo` to a warning; STALE is red
  under every flag. `--build <ref>` adds the belongs-to arm.
- Registered in `check.mts` as `uncacheable` — a new `Gate` flag. The bake
  directory is git-ignored and shared between worktrees, so a verdict keyed on
  the tree sha would survive exactly the event the gate exists to catch. `keyOf`
  returns null and both `lookup` and `store` are skipped.
- `statusOf` **stats, never reads**: the first draft pulled 15 MiB of a 33 MB
  heightfield a co-agent's `vite build` was mid-write on. The stamp is now read
  on both sides of the stat and retried; `inFlight` is reported, never failed.
- `announceBuild` now warns on any `--build <ref>` whose bake is not that tree's
  (`23c3d52`). This is the second half of task 46 the coordinator asked for: the
  shared-cache-defeats-an-A/B problem, made honest rather than fixed. Verified
  both ways — `--build c898bb4e` names `tex.bin.gz` and correctly does *not*
  name `terrain.bin.gz`; the bare default prints nothing new. 98 ms, and only
  when a ref was actually typed.

**What it found immediately** (verified, `src/tools/_probe/bakeorigin.mts` names
the commit): `terrain.bin.gz` was stamped from `c898bb4e`'s sources and
`tex.bin.gz` from `3187d788`'s while HEAD was `4a6c840`. Each `--build <sha>`
build re-bakes the *shared* artifacts from that sha's sources, so what every lane
is capturing against is whichever sha was materialised last. Also: `texc.bin.gz`
and `geo.bin.gz` absent all night, ~3.7 s of cold boot per load.

> **`bakecheck` is RED until someone runs `pnpm run build:full`.** That is the
> gate working, and `build:full` is the documented post-merge step anyway. Do it
> before the final `check` and before quoting any boot or first-load number.

### Task 48 — the NaN sweep — `2718d53`

**Verified** (tool run; the seven findings triaged by reading each site).

`src/tools/nansweep.mts` parses the GLSL template literals with a depth-counting
argument splitter and reports every `pow` whose base is not provably
non-negative and every `normalize` whose argument is not provably non-zero.
**113 sites across 22 files, 9 HIGH.** Rows are in `project/TASKS.md` against
their owning lane; nothing was fixed here (rule 1).

The finding is one shape repeated six times: **a gaussian written
`exp(-pow(x, 2.0))` where `x` is a difference.** `pow(x, y)` is undefined for
`x < 0` for *every* exponent, integral or not; it reads as "squared" and is not.
`x * x` is defined everywhere and cheaper. Drivers usually return the right
answer, which is why `nanscan` is 0/142 and this is latent.

Sharpest single site: `SsrPass.ts:75`, `normalize(cross(dy, dx))` over
depth-reconstructed world deltas — and the two guards below it, `N.y < 0.0` and
`N.y < 0.86`, are both FALSE for a NaN, so the pass falls through and reflects
with a NaN normal in a post pass.

Two of the three `normalize(cross(..))` hits are false positives (the
anti-parallel ternary idiom, and a `dot(v,v) > 1e-4` guard one statement up);
both are recorded in the tool's own header so nobody re-triages them.

### `reliefstat --against` — `97c5d43`

**Verified.** The flag was never read; after `1f799ae` fixed the crash it was
*accepted and silently ignored*, which is worse than the crash. It now rejects,
and so does every other unknown flag. **No measurement in this repo rested on
it** — grepped: the only two occurrences are `docs/plans/…-fable-to-nine.md:1246`
and `project/handoff/lane5-terrain-light.md:137`, both proposed next steps under
an explicit "Not verified". Both lines now need the flag dropped; filed.

## In flight — `driftcheck`, the red gate

**Diagnosis verified, repair NOT yet verified.**

Reproduced the FAIL exactly at `sha:6f5a9e37d02d`:

    SURFACE DRIFT    mean 0.000 m  worst 0.000 m  over 36864 texels
    gpu vs heightAt  boot: mean -0.001 worst -0.520
                     after travel: mean -0.001 worst -0.520 at (-39.8, -68.2)
                     p99 |err| 0.229 m; 2937/12544 texels over 0.1 m
    FAIL

Two things the coordinator's brief did not have, both **verified** from that run:

1. **The boot arm and the after-travel arm are bit-identical** — `mean -0.001
   worst -0.520` on both. So it is not travel, not the tour, not the morph band;
   it is a static property of the tessellation.
2. **The error is two-sided, not "always negative".** `mean -0.001` against
   `worst -0.520` over 12544 texels can only be a roughly symmetric population.
   That is exactly right for chord error — a triangle lies *below* the field on
   convex ground and *above* it in a hollow — and it is the opposite of an offset
   bug, which moves the mean with the tail. This strengthens the diagnosis well
   past the "sign is always negative" argument, which is not what the data says.

### The repair, and why not the p99

Gating the p99 instead of the worst would work, but it swaps one unmeasured
constant for another. There is an **exact** floor available and it does not have
to be fitted: linear interpolation across a cell of width `h` is in error by at
most `(h²/8)·max|f''|`, and the central second difference of `heightAt` at
spacing `h` *is* `h²f''`. So `driftcheck` now computes, per texel:

    sag(x,z) = max(|D2x|, |D2z|) / 8      D2x = f(x-h,z) + f(x+h,z) - 2f(x,z)

with `h` read from `t.clipmap.rings[0].cell`, and a texel is a violation only
when it is past **both** the flat `--tol-cpu` and `--sag-k` (default 3) times its
own bound. Where the ground is smooth the bound is ~0 and the arm is as strict as
`heightcheck`; over a gully lip it is large, for a reason that is a theorem
rather than an excuse. `--tol-cpu` is unchanged at 0.45 and nothing was widened.

An exemption has to be falsified, so `--inject '<glsl>'` is now a first-class
flag: it appends GLSL after `TERRAIN_VERT_BEGIN` in the probe's vertex shader
(and folds into `customProgramCacheKey`, or three serves the un-injected program
back). The falsification arm is the tool's own historical control,
`--inject 'tfH += 3.0;'`: a three-metre offset has no curvature to hide behind,
so every texel must violate and the gate must be red.

### THE NEXT STEP, EXACTLY

**The predicate change is committed-pending and the falsification has not run.**
Four attempts died on the 300 s `preparePage` timeout caused by the prewarm
queue above. Do this, in this order:

1. `node src/tools/daemon.mts --stop` (coordinator's call — see the top of this
   file). This is what unblocks it.
2. `node src/tools/driftcheck.mts` — read `vs its own sag` and the
   `gpu-vs-cpu hist` rows. Expect the worst texel's ratio to be O(1); if the
   worst |err| is many times its own sag bound, **the diagnosis is wrong and
   there is a real offset** — do not land the predicate, go and find it.
3. `node src/tools/driftcheck.mts --inject 'tfH += 3.0;'` — this **must** print
   ~12544 violations and FAIL. If it does not, the exemption is unfalsifiable
   and must be reverted, not tuned.
4. Only then commit `src/tools/driftcheck.mts`.

If step 3 fails to fail, the fallback that needs no measurement is to gate the
`cpuP99` at 0.45 and *report* the worst with its coordinate — weaker, but it is
the repair `imgdiff` already made for the same disease and the control arm
(`mean 3.000 worst 3.369`) is on record as moving the p99 too.

## Files owned and touched

`src/tools/bakesources.mts` (new), `src/tools/bakecheck.mts` (new),
`src/tools/nansweep.mts` (new), `src/tools/_probe/bakeorigin.mts` (new),
`src/tools/driftcheck.mts` (**uncommitted**), `src/tools/check.mts`,
`src/tools/harness.mts`, `src/tools/daemon.mts`, `src/tools/bake.mts`,
`src/tools/texbake.mts`, `src/tools/reliefstat.mts`, `project/TASKS.md`.

Not touched, deliberately: `facecheck.mts` (lane 1),
`probes/regaliadrive.mts`, `_probe/steerfalsify.mts`, `_probe/inputcollide.mts`,
`_probe/menufill.mts` (lane 10), `probes/mainchain.mts` (lane 17).

## Open questions

- Should `bakecheck` be in the pre-push gate (`check:gate`)? It costs 9 ms. It is
  not there now because `pre-commit`'s own `vite build` prunes a stale artifact,
  and I did not want a hook whose own action can flip its own gate.
- Nothing here looked at a frame. This lane produced no captures: everything it
  changed is a predicate or a static analysis, and the one arm that needed a
  rendered frame (`driftcheck`) could not get a page.
