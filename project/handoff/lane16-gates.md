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

**RESOLVED.** The coordinator ran `daemon.mts --stop` and the daemon came back
on pid 80709 carrying `3958370`. Confirmed before pulling the trigger: 9.13 GB
daemon RSS, 32.9 GB across all chromium/node. After: **uptime 65 s, both lane
queues at depth 0.** The transferable line the coordinator wrote into
`LANDMINES.md` from it is *a docstring describing behaviour the code does not
have is worse than no docstring*, because it stops anyone reading the code
beneath it.

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
  under every flag. `--build <ref>` adds the belongs-to arm. **Both verified**:
  `--allow-cold` turned the same tree from `FAIL (1/4 fresh)` to
  `PASS (3/4 fresh)` and exited 0.
- Registered in `check.mts` as `uncacheable` — a new `Gate` flag. The bake
  directory is git-ignored and shared between worktrees, so a verdict keyed on
  the tree sha would survive exactly the event the gate exists to catch. `keyOf`
  returns null and both `lookup` and `store` are skipped. **Verified**: two
  consecutive `check --only bakecheck` runs on an unchanged tree both re-derived
  (7 ms each) and neither reported `cached`.
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
> The coordinator started it; `paintedFaces` went `false -> true` and the gate
> went `1/4 fresh` -> `3/4 fresh` while it ran, with `geo.bin.gz` still
> outstanding at the time of writing. Re-run `node src/tools/bakecheck.mts`; it
> costs 5 ms.

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

### `driftcheck` — the red gate — `a8c4918`, `<this commit>`

**Verified, including the falsification arm.**

Reproduced the FAIL first at `sha:6f5a9e37d02d`: `worst -0.520 m` against a
`--tol-cpu` of 0.45 fitted to a single measured ~0.37 m observation, with
`SURFACE DRIFT mean 0.000 worst 0.000` over 36864 texels.

Three things say that is the tessellation floor, and the third is the one that
closes it:

1. **The boot arm and the after-travel arm were bit-identical** — `mean -0.001
   worst -0.520` both. Static; nothing to do with travel, the tour or the morph
   band.
2. **`mean -0.001` against `worst -0.520` over 12544 texels can only be a
   symmetric population.** The error is two-sided.
3. **The histogram, added by this work, shows it rather than infers it.** On a
   clean tree with fresh bakes:

        gpu-vs-cpu hist  -0.4:1  -0.3:38  -0.2:493  -0.1:2836  0.0:5838
                          0.1:2809  0.2:499  0.3:28  0.4:2

   Symmetric to within a couple of texels per bin at every magnitude. A triangle
   lies below the field on convex ground and above it in a hollow; **an offset
   cannot make that shape.** (This corrects the dispatch brief's "the sign is
   always negative", which was read off a single worst-texel value.)

#### The repair

Not a wider `--tol-cpu` (LANDMINES' `drawcheck` rule: that trades regression
sensitivity for false-red immunity 1:1) and not the p99 either, which swaps one
unmeasured constant for another. Instead, the floor the field computes for
itself: linear interpolation across a cell of width `h` errs by at most
`(h²/8)·max|f''|`, and the central second difference of `heightAt` at spacing `h`
**is** `h²f''`, so

    sag(x,z) = max(|D2x|, |D2z|) / 8

is that texel's own permitted deviation, from the very function the arm compares
against, with nothing fitted. `h` comes from `t.clipmap.rings[0].cell`. A texel
violates only when past **both** the unchanged flat `--tol-cpu` **and** `--sag-k`
(default 3) times its own bound.

**The AND is load-bearing and the bound is NOT strict.** A central second
difference vanishes at an inflection while the function still curves inside the
cell: measured, `|err| / sag` runs **p50 1.20, p99 8.51, worst 84.80** (a 0.114 m
error against a 0.001 bound). Gating on the ratio alone would cry wolf; gating on
the flat tolerance alone is what put this gate red on one gully lip. Each covers
the other's blind spot. **`--sag-k 0` restores the old flat predicate exactly**,
in one flag.

#### The falsification — the part that makes it a gate

`--inject '<glsl>'` is now a first-class flag: it appends GLSL after
`TERRAIN_VERT_BEGIN` in the probe's vertex shader and folds into
`customProgramCacheKey` (without that, three serves the un-injected program back
from cache and the control silently measures what it was meant to break). It
re-derives `transformed`/`vTW` only when there IS an injection, so an un-injected
probe compiles the shipped chunk unaltered.

Run at `a8c4918`, fresh caches, quiet daemon:

        baseline                      0 of 12544 texels violate   PASS
        --inject 'tfH += 3.0;'    12544 of 12544 texels violate   FAIL

Perfect separation — and the control's histogram is the baseline's shifted by
exactly +3.0 **with the same count in every bin**, `1 38 493 2836 5838 2809 499
28 2` both times. That says the injection was a pure offset, that the probe read
it, and that not one texel escaped through the curvature door.

#### The 0.520 → 0.397 move, which matters more than it looks

Same tool, same shot, same predicate arms, one difference: the second run had a
**fresh** terrain bake where the first had `c898bb4e`'s. The worst went
`-0.520 → -0.397` and the player's own y moved `3.57 → 3.77`. **The gate that
first reported the problem was itself reading a stale shared terrain bake** — so
`--build` pinning code and not content bit the very instrument that exposed it.

What that does **not** imply: it is not "revert, it was only the cache". At 0.397
the old flat predicate passes by 12%, i.e. the gate was one gully lip from red
either way. It is the argument *for* the repair, not against it.

### `SsrPass.ts:75` — the one NaN site this lane fixed — `e2722c7`

**Named cross-lane commit.** `src/engine/postfx/` was lane 15's; lane 15 finished
and the coordinator handed it over. Every other `nansweep` finding was filed, not
fixed (rule 1).

`dx`/`dy` are world deltas reconstructed from the depth texture, so on a depth
plateau or at any range where two adjacent texels resolve to one world point they
are parallel or zero and `normalize(cross(dy, dx))` is `0/0`. What made this the
worst-shaped of the seven: the two tests immediately below it,
`if (N.y < 0.0)` and `if (N.y < 0.86) return;`, are **both FALSE for a NaN**, so
the pass did not bail — it marched a 28-step reflection ray from a NaN normal, in
a post pass, where the NaN survives the composer and lands as a hole of pure
black.

The guard tests `sin²` of the angle between the deltas rather than `|cross|`,
because the deltas scale with distance: one texel is a millimetre of world at
arm's length and metres of it at the far plane, so an absolute floor would either
miss the degenerate case up close or delete the pass in the distance.
`dot(n,n) / (|dx|²|dy|²)` is exactly `sin²` and is scale-free. Bailing writes
`src` unchanged, which the pass already does for every non-qualifying pixel, so
the guard's own failure mode is *no* reflection, never a *wrong* one.

**`nansweep` then caught itself on this fix**, and the lesson is in the tool now:
the block comment explaining the defect sits above the code closing it, and the
sweep re-reported `normalize(cross(dy, dx))` out of that prose as a HIGH call
site one line below the fix. A tool that cannot tell a fix's rationale from the
defect keeps every fix it inspires permanently red, which trains people to write
the fix without the reason. It strips comments now. `SsrPass.ts` 0 HIGH; corpus
9 → 8.

**Frame verification: PENDING at the time of writing.** A guard like this can
silently delete the pass it protects, so `zone_vesperpool` and `zone_galdin` are
capturing at `4bbd5f6` (before) and `e2722c7` (after) with an `imgdiff` between
them. Neither shot has a measured noise floor in `project/noise-floors.json`
(23 of 142 are measured), so the comparison is against `imgdiff`'s unmeasured
`DEFAULT_LIMIT` of 2/255. **Expected ~0** — the guard only fires where
`sin θ < 1e-4`. A large delta means the threshold is wrong, and the response is
to revert rather than tune it.

## Standing procedure: the bake caches during a multi-lane wave

Written here because it is a harness fact, not a coordinator preference, and it
was learned the hard way twice in one night.

**MISSING is safe. STALE is the dangerous state. Do not read a `bakecheck` FAIL
without reading which.**

- **MISSING** — every path falls back to the generator, so the output is correct
  and only the boot is slower (`texc` ~2.5 s, `geo` ~1.2 s per load). This is the
  *designed* response to a source moving.
- **STALE** — the keys resolve, the page boots, every gate passes, and the world
  is served a previous generator's output. Faces one version behind their sculpt;
  a viaduct correctly wound and standing in the air. Red under every flag,
  `--allow-cold` included, on purpose.

**`texc.bin.gz` and `geo.bin.gz` cannot be kept fresh while lanes are
committing.** They need a browser to record and the vite plugin only has a
server, so all the plugin can do with a stale one is delete it — and it does, on
any co-agent's `pre-commit`. Measured tonight: both were deleted again **within
minutes** of a full `pnpm run build:full`. This is an operational constraint, not
a bug to fix.

So the sequence, immediately before a judged round or any boot / first-load
number:

    1. hold commits across the wave
    2. pnpm run build:full            (or texbake.mts --canvas --force, --geo)
    3. node src/tools/bakecheck.mts   -> must read 4/4 fresh, 5 ms
    4. capture / judge / measure
    5. release commits

Step 3 is not optional and costs nothing. `bakecheck` is registered
`uncacheable`, so it cannot replay a green recorded before a prune — that is the
one thing that makes step 3 trustworthy at the end of a long night.

## Commits, in order

    3734e4c  bakecheck + bakesources + the `uncacheable` Gate flag + _probe/bakeorigin
    23c3d52  announceBuild warns when --build <ref> is not taking the bake with it
    3958370  the prewarm supersede  (the one the daemon was restarted for)
    2718d53  nansweep + the task-48 rows in TASKS.md
    97c5d43  reliefstat rejects --against
    a8c4918  driftcheck instrument: --inject, --sag-k, per-texel sag, histogram
    2845b81  driftcheck: the falsification result
    e2722c7  SsrPass degenerate-normal guard; nansweep strips comments
    0bc3863  bakecheck: a bad --build prints a verdict, not a stack trace
    7c9d49f  bakecheck: drop an accepted-and-ignored --json; clean usage errors
    e312fc3, 1137bdd, 1bce4c9, ff690f9  this handoff

## Files owned and touched

`src/tools/bakesources.mts` (new), `src/tools/bakecheck.mts` (new),
`src/tools/nansweep.mts` (new), `src/tools/_probe/bakeorigin.mts` (new),
`src/tools/driftcheck.mts`, `src/tools/check.mts`, `src/tools/harness.mts`,
`src/tools/daemon.mts`, `src/tools/bake.mts`, `src/tools/texbake.mts`,
`src/tools/reliefstat.mts`, `project/TASKS.md`.

One named cross-lane commit: `src/engine/postfx/SsrPass.ts` (lane 15's, and lane
15 had finished; handed over by the coordinator).

Not touched, deliberately: `facecheck.mts` (lane 1), `probes/regaliadrive.mts`,
`_probe/steerfalsify.mts`, `_probe/inputcollide.mts`, `_probe/menufill.mts`
(lane 10), `probes/mainchain.mts` (lane 17).

`bakesources.mts` has since been extended by other lanes — `texd.bin.gz` added to
`ARTIFACTS`, and `FieldBake.ts` added to `GEO_SOURCES`, which was a real gap: a
change to how the heightfield is serialised did not invalidate the geometry bake.
That is the registry working as intended; it is the one place those lists live.

## Open questions

- Should `bakecheck` be in the pre-push gate (`check:gate`)? It costs 9 ms. It is
  not there now because `pre-commit`'s own `vite build` prunes a stale artifact,
  and I did not want a hook whose own action can flip its own gate.
- Nothing here looked at a frame. This lane produced no captures: everything it
  changed is a predicate or a static analysis, and the one arm that needed a
  rendered frame (`driftcheck`) could not get a page.
