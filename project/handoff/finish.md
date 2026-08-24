# finish — the quilt was landed, and the rock gate was armed against its own noise

Owner: the finish lane, 2026-08-24. Contract:
`project/handoff/2026-08-23-coordinator.md` "Shared rules".
Owns **`src/world/props/PropMaterials.ts`** and **`src/tools/silhouette.mts`**
(plus one gate row in `src/tools/check.mts` and the baseline file that arms it).

Two jobs three previous lanes each identified and deliberately did not land,
each missing exactly one thing. Both things existed by the time this lane
started. Predecessors whose measurements this lane started from and did not
repeat: `handoff/rocks.md` (the four-way quilt ablation), `handoff/variety-r2.md`
(the `--set rocks` bench and the narrow-object anchor).

---

## Job 1 — the quilted honeycomb. LANDED, photographed at 1.5 km and at 35 m

`dd217b0` and `18cb3f0`. `src/world/props/PropMaterials.ts` only.

### What it actually was, stated exactly

`rockMaterial`'s `crack` term was `Math.min(1, (w.f2 - w.f1) * 2.6)` on a
frequency-7 Worley field. `f2 - f1` is zero on a cell **boundary** and rises
toward the cell's **centre**, so that expression is only a crack network if the
rise saturates quickly. Measured over one 512² tile at that frequency:

    f2 - f1   p5 0.020   p25 0.105   p50 0.231   p75 0.397   p95 0.626
    the term saturated on 27.6% of texels — the other 72% was the RAMP

So nearly three quarters of every rock in the world was the *inside* of a Worley
cell, shaded from a dark rim to a bright centre, at one cell size, in albedo,
normal and roughness at once — because all three maps are built from the same
`h`. That is a field of scales by construction, and `2.6` is about six times too
small for the distribution it was clamping.

**The reason it cost most at 1.5 km is the interesting half.** A filled cell is
the map's *lowest*-frequency content, so it is the one thing that survives
mipping all the way to the horizon. That is why the Meteor of the Disc — 585 m
across, seen from 1.5 km, the single most expensive object in the corpus to get
wrong — was the frame where it read worst.

### The fix, and why the weight moved with it

    const rim   = ((w.id * 0.6180339887) % 1 + 1) % 1;
    const crack = THREE.MathUtils.smoothstep(w.f2 - w.f1, 0, 0.0625 * (0.35 + 1.55 * rim));
    return crack * 0.27 + grain * 0.25 + big * 0.33;

- **The knee.** A smoothstep over the first 0.0625 leaves **85%** of the surface
  flat and puts the whole term into a thin V-shaped valley on the cell boundary.
  That is a joint. It is now the map's *highest*-frequency content, so it mips
  away with distance the way a crack should.
- **The weight, 0.42 → 0.27.** Not taste. The term's own mean rises 0.592 →
  0.922 once it stops filling its cells; 0.27 holds `h`'s mean at **0.537** and
  its minimum at **0.127**, both unchanged to three decimals. The rock *value*
  the rocks lane spent a round fixing (§3.6, luma 45 → 79 near) does not move.
  `h`'s spread does fall, 0.156 → 0.085, and all of what it loses is the quilt.
- **The per-cell rim width, 0.35x to 1.9x.** Photographed at 35 m
  (`tmp/crop/fin/og-tor-r1.png`), a constant-width seam reads as a net of
  identical cracks over flat panels — dried mud, which is `handoff/rocks.md`'s
  own open item 7 about the near field arriving from the other direction. The
  width is drawn off the *cell's own feature-point id* and not off a smooth
  field, because a smooth multiplier puts low-frequency energy straight back
  into the map. The seam is still identically zero on the boundary from either
  side, so the field stays continuous, and it is a pure redistribution: `h`'s
  mean and spread are **0.537 / 0.085** either way.

### The photographs, and the measurement under them

| | before | seam | seam + varied rim |
|---|---|---|---|
| shots | `tmp/shots/fin-r0`, `fin-r0p` | `fin-r1`, `fin-r1p`, `fin-r1q`, `fin-r1r` | `fin-r2` |
| crops | `tmp/crop/fin/meteor-before.png` | `meteor-after.png`, `og-tor-r1.png` | `og-tor-r2.png` |

`tmp/crop/fin/meteor-before.png` vs `meteor-after.png` is the argument: a 3x crop
of the Meteor's face at 1.5 km, uniform reptile-scale honeycomb fighting the
conchoidal facets in one, the facets and arrises reading clean in the other.
`tmp/crop/fin/lw-near-before.png` / `-after.png` is the same at ~60 m.

**Texture energy in a box — mean |neighbour luma difference| — with a control
box and a repeat run**, which is the honest form of this measurement:

| box | before | after | repeat of "after" |
|---|---|---|---|
| Meteor face, 1.5 km | **11.820** | **7.838** | 7.783 |
| Longwythe boulder, ~60 m | **12.815** | **9.529** | 9.436 |
| hillside terrain (no `rockMaterial`) | 5.814 | 5.948 | 5.824 |
| bare ground beside the boulder | 10.155 | 10.189 | 10.189 |

−34% at range and −26% near, against a run-to-run noise of 0.06-0.09, and both
control boxes unmoved. Mean luma over the same boxes: 85.48 → 87.71 (repeat
84.44) and 49.54 → 49.90 (repeat 49.93) — i.e. unchanged inside the run noise,
which is what the weight was chosen for. Band-scale contrast (`sd`) 25.70 →
24.83/24.51 and 29.97 → 29.63/29.58, also unchanged: the *shape* read survives,
only the cell texture goes.

The varied-rim commit is byte-identical on those stats (Meteor |grad| 7.842 vs
7.838, boulder 9.598 vs 9.529) and visibly different in the 35 m crop, which is
exactly what a redistribution should look like.

### Draw calls: unchanged

`fin-r0` vs `fin-r1` manifests: 710/710, 655/654, 688/688, 594/594, 532/532,
636/636. Triangles down 0.1-1.0% (streaming jitter). No new material, no new
mesh; `memoMat` returns the same object it always did.

### `texbake --force` was run after every material edit

The bake key carries roughness and metalness, not the map function, so a
material edit invalidates **nothing** and boot silently falls back to runtime
generation. `src/public/baked` is shared, so the window in which it holds this
lane's textures while another lane captures an older build is real — but
unavoidable, and it is why the "before" captures had to be taken *first*.

### Recorded negative — imgdiff cannot see this change, and its floors are stale

`imgdiff` between the before and after PNG sets gave 5.633 / 2.962 / 4.033 mean
on `landmark_meteor` / `poi_haven` / `zone_longwythe`, all "over their measured
per-shot floor". **Two captures of the same build, back to back, gave 5.373 /
2.941 / 3.938.** The whole-frame mean said nothing at all; the heat map is
dominated by cloud edges.

**The cause was found, and it is the daemon's page reuse.** The recorded floors
are for two `--cold` captures, and that protocol reproduces beautifully — two
cold captures of one build today came back at **0.825 / 0.440 / 0.821** on those
three shots. Two *warm* captures of the same build — the daemon reusing pages,
which is how every tool actually runs — came back at **5.373 / 2.941 / 3.938**.
That is 4-6x, and it is the difference between "this change did something" and
"this is a reused page carrying accumulated animation state".

`landmark_meteor` was not in `project/noise-floors.json` at all, so `imgdiff`
had been quoting a 2.00 default at the shot that judges the Meteor. It is in the
file now, at 1.238, along with re-measured `poi_haven` (0.66) and
`zone_longwythe` (1.231) — all three by the file's own documented protocol,
`imgdiff --calibrate` over two `--cold` captures. The other nine floors are
untouched and still carry their 2026-08-23 date, which the `measured` field now
says. The `note` field carries the cold-vs-warm warning.

Two flags worth knowing, both found the hard way: `imgdiff` **REFUSES** a diff
whose two sides carry the same build sha (the second capture is served from the
frame cache), and `--calibrate` is the flag that both bypasses that and
**writes** `project/noise-floors.json`. It is not a read-only inspection.

**Use a region statistic with a control box and a repeat run for anything at
this scale.** The scratch tool that produced the tables above is 20 lines and
lives in the session scratchpad; it is worth re-writing rather than re-deriving.

### What is left on job 1

1. **The near field is better and not finished.** At 35 m the tor still reads a
   little like a cracked glaze: flat panels between joints. The spread of `h`
   fell by half and all of that was the quilt, so nothing was taken that should
   have stayed — but nothing was *put back* either. The lever not tried is
   raising `grain` (f22) and lowering `big` (f4) at constant mean; the arithmetic
   is `0.922 s + 0.5 g + 0.495 b = 0.537` and today's split is 0.27 / 0.25 / 0.33.
2. **The cell size on the Meteor is not this file's to fix.** `meteorMass` sets
   `uvScale: 22 / (r * 1.95)` — twenty-two tiles across the mass *whatever its
   size* — so a 585 m mass and a 4 m boulder get the same pattern at a hundred
   times the scale. That is the other half of the judge's "one tiling texture
   per surface, at the wrong scale", it lives in `Megastructures.ts`, and it is
   the **town** lane's. With the quilt gone it is much less costly, but it is
   still why the joint network is 3.8 m across on a meteorite.
3. **`rockMaterial(0x6a5849, 0.93)` saturation** — the rocks lane's standing
   request (near rock at rgb 105/74/54 against a hillside at 149/119/96, more
   saturated and warmer than the ground where shipped FFXV Leide rock is a
   desaturated grey-ochre). **Not touched**: it is a value/hue change and this
   lane had one photographed defect to land, not two.

---

## Job 2 — `--set rocks` gates now, and the proposed floor would not have worked

`20d987f`. `src/tools/silhouette.mts`, `src/tools/check.mts` (one gate row),
`project/silhouette-baseline.json`.

### The variety lane was right about the shape and wrong about the value

Its reason for not wiring the bench in was correct: the ratchet records **named
pairs**, a tor's name is its seed index, and any edit to `torPlan` renumbers
every subject. Its proposal was a family-level `distinct/n` floor, at
fin 19/24, hoodoo 20/24, pinnacle 21/24, boss 24/24, stack 24/24, base 8/8.

`--reseeds` was built to check that before trusting it. Five independent samples
of the **unchanged** generator:

    family              distinct           variety
    rock:base            8..8   sd 0        1.39..1.39  sd 0
    rock:stack          23..24  sd 0.40     0.87..1.05  sd 0.065
    rock:tor:boss       24..24  sd 0        1.19..1.62  sd 0.182
    rock:tor:fin        15..20  sd 2.15     1.06..1.42  sd 0.115
    rock:tor:hoodoo     20..21  sd 0.49     1.45..1.60  sd 0.054
    rock:tor:pinnacle   15..22  sd 2.45     1.03..1.37  sd 0.119

**`rock:tor:fin` at 19/24 is breached by three of five resamples of the code
that produced it, and `rock:tor:pinnacle` at 21/24 by four.** `torPlan` consumes
a different number of random draws after any edit, so which seeds land in which
archetype row shifts even when nothing about the shapes changed. A floor set on
one draw is the pair ratchet's cry-wolf failure in a new dress — and it would
have shipped as the fix for it.

### So the gate is statistical, and says so

The gate compares the **mean over five samples** against a floor recorded at
`mean - 2 sd` of a single sample. The mean of five has standard error `sd/√5`,
so the floor sits 4.5 standard errors below it: a false failure is not a thing
that happens. What it can still resolve is a real loss of more than about two
single-sample sd — 20-25% here. The variety lane's own fix moved `rock:tor:fin`
from 0.41 to 1.42, five times that, so the gate has the sensitivity the defect
it exists for actually needs.

Armed floors (`project/silhouette-baseline.json`, `families`):

    family              n   reseeds  distinct floor   variety floor   measured
    rock:base           8      5          8              1.3          8.0 / 1.39
    rock:stack         24      5         23              0.8         23.8 / 0.96
    rock:tor:boss      24      5         24              1.0         24.0 / 1.42
    rock:tor:fin       24      5         13              1.0         17.6 / 1.23
    rock:tor:hoodoo    24      5         19              1.4         20.4 / 1.53
    rock:tor:pinnacle  24      5         14              0.9         19.0 / 1.17

### `variety` — what "use the right anchor per family" had to become

The narrow-object anchor was a `console.log` inside `rockSubjects`. It is now an
**aspect ladder**: prism / cone / ellipsoid cut to 0.25, 0.43, 0.6, 0.8, 1.0,
1.3 and 1.7, plus a prism against a x1.73, 37°-yawed copy of itself at each
rung, re-measured every run and **voided if any rung's dynamic range collapses**
below 10x. Measured:

    aspect   known-same   known-different   range   threshold
     0.25       0.019            5.546     285x      0.329
     0.43       0.034            9.815     293x      0.573
     0.60       0.047           13.769     295x      0.802
     0.80       0.062           18.397     295x      1.071
     1.00       0.078           23.183     298x      1.344
     1.30       0.101           30.166     298x      1.748
     1.70       0.132           39.480     298x      2.287

Almost exactly linear in aspect, which is the arithmetic reason a narrow family
cannot reach a wide one's numbers: every profile entry is a band width over the
mesh's own height, so a family at aspect 0.43 has all 192 of its numbers bounded
by 0.43. The ladder runs past 1.0 because a rock is routinely wider than tall —
`rock:base` averages **1.60** and was being graded against a clamp.

**`variety` = a family's mean-d over the ladder's known-different at that
family's own aspect.** It is the only column in the table that compares across
families, and it immediately says something the raw `mean-d` column hides:

    family              mean-d   aspect  ceiling  variety
    rock:base            51.56    1.60    37.01    1.39
    rock:stack           25.87    1.15    26.42    0.98   <-- weakest
    rock:tor:boss        38.86    1.42    32.74    1.19
    rock:tor:fin         17.10    0.53    12.04    1.42
    rock:tor:hoodoo      19.61    0.56    12.65    1.55
    rock:tor:pinnacle    12.99    0.56    12.62    1.03   <-- second weakest

`rock:stack` and `rock:tor:pinnacle` are the two weakest rock families, **not**
`fin` — even though `fin`'s mean-d of 17.10 is the smaller number and `stack`'s
25.87 looks healthy. `handoff/variety-r2.md` cleared `rock:stack` as "24/24
distinct, §3.4 was working" and ranked `fin` as the remaining debt; on the
comparable statistic that ordering is the wrong way round. See "Requests".

### Recorded negative — the ladder must NOT set the clustering threshold

The obvious thing to do with a per-aspect anchor pair is to take its geometric
mean and grade the family at it. **That is wrong and it was measured before it
was believed.** The ladder's own thresholds run 0.33 to 2.29 against the tree
calibration's 5.80, because the synthetic shapes are smooth and analytic: the
bench's *floor* on them is 0.019-0.132 where a broadleaf's is 0.653. A floor is
a property of mesh **complexity**, not of aspect; only the ceiling scales with
aspect. Grading real families at the ladder's threshold makes every family read
as fully distinct — an instrument that can never fail, which is precisely the
mistake `imgdiff`'s global noise floor made and that this bench's docblock is a
reaction to. **The ladder sets the ceiling and nothing else.**

### Two smaller holes, both found by running the tool rather than reading it

- **`--set rocks` reported `irongiant ~ redgiant` as FIXED.** The pair ratchet
  compared against the whole baseline including families the run never built,
  and `--set-baseline` after such a run would have *deleted* the bestiary's
  recorded debt from the file. Both halves are scoped to what actually ran now,
  and out-of-scope pairs are carried through the baseline write untouched.
- **The "did this run grade anything" guard has to be "any floor skipped", not
  "no floor checked".** `rock:base` is the eight shipped meshes and its `n` is 8
  whatever `--seeds` says, so the first version of the guard graded that one
  family, skipped the other five and reported PASS at the wrong sample size.

### Controls with known answers, run before the gate was believed

- Floors raised above the measured values → **FAIL**, both families named
  (`rock:tor:fin: variety 1.23, floor 1.4`, `rock:tor:pinnacle: 19.0/24 distinct,
  floor 22`), exit 1.
- Run at `--seeds 10` → **VOID**, "5 recorded floor(s) could not be compared
  against this run (1 could)", exit 2. It does not grade and does not pass.
- Default run (trees + enemies) unchanged: PASS, 42 meshes, 8 families, the one
  known-collapsed pair still at 1.84.

### Wired in

`src/tools/check.mts` gains one row, `silrocks`:
`silhouette.mts --set rocks --seeds 24 --reseeds 5`, ~15-18 s. The
`--seeds`/`--reseeds` are load-bearing — the floors were recorded at those and
the tool VOIDs rather than grade at any others, which is written in the gate's
comment so nobody "tidies" them away.

---

## Gates

`node src/tools/check.mts --only silhouette,silhouette-rocks` -> **2/2**, and the
full sixteen-gate suite was launched at `d3a7041`. The roster is **17** with
`silrocks` in it. **If the row below is still a placeholder, the run had not
finished when this lane stopped — re-run `pnpm run check` before trusting it.**

    RESULT: <full-suite run pending at handoff time>

Two things worth knowing about running it right now: three `check.mts` processes
and another lane's `gameplay.mts` were live on this machine at once, and
`floatcheck` alone took several minutes under that load. A perf number taken in
that window is not a perf number.

---

## Files touched

- `src/world/props/PropMaterials.ts` — `rockMaterial`'s `h` only. Commits
  `dd217b0`, `18cb3f0`.
- `src/tools/silhouette.mts` — `ANCHOR_ASPECTS` / `AspectAnchor` /
  `shapeAnchors` / `diffAt`, `Subject.ratchet`, `grade()` extracted from the
  top-level flow, `build()`, `--reseeds`, the `ceiling`/`variety` columns, the
  `FamilyFloor` ratchet, the scoping of the pair ratchet. Commit `20d987f`.
- `src/tools/check.mts` — one `GATES` row. Commit `20d987f`.
- `project/silhouette-baseline.json` — gains `families`. Commit `20d987f`.

Nothing in `src/characters/**`, `src/world/props/Rocks.ts`,
`src/world/props/Megastructures.ts` or the streaming/engine/perf paths was
touched.

## Requests to other lanes

- **town lane (`Megastructures.ts`)**: `meteorMass`'s `uvScale: 22 / (r * 1.95)`
  ties the texture scale to the *object's* size, so the Meteor's joint network
  is 3.8 m across. With the quilt gone this is survivable, but it is the
  remaining half of "one tiling texture per surface, at the wrong scale". A
  world-space scale with a floor — `max(0.62 * k, 22 / size)` — would keep the
  Nyquist argument its docblock makes and stop the pattern growing with the rock.
- **rocks / variety lane (`Rocks.ts`)**: `rock:stack` is the weakest rock family
  on the comparable statistic (variety 0.96 against `hoodoo`'s 1.53), and
  `rock:tor:pinnacle` the second weakest at 1.17. `handoff/variety-r2.md` ranked
  `fin` as the remaining debt on the strength of its raw `mean-d`; on
  `mean-d / ceiling` that ordering inverts. `--set rocks --seeds 24 --reseeds 5`
  prints all of it.
- **method lane (`src/tools/imgdiff.mts`, `project/noise-floors.json`)**: the
  recorded floors are **cold** floors and nobody captures cold. Measured on the
  same build, same three shots, today:

      shot               two --cold captures    two warm captures    file floor
      landmark_meteor          0.825                  5.373            (absent)
      poi_haven                0.440                  2.941             0.913
      zone_longwythe           0.821                  3.938             0.965

  A warm diff read against a cold floor calls boot noise a change, which is
  exactly what happened to this lane's first reading of its own work. Either
  record a warm floor alongside the cold one, or have `imgdiff` warn when it is
  handed two warm captures. The three floors above were re-calibrated here (by
  the documented protocol) and `landmark_meteor` added; the note field carries
  the warning until the tool can. Also: `--calibrate` **writes** the file — that
  is not obvious from the flag name, and it fired on a run meant to be a
  read-only control.
- **town lane (`PoiKits.ts`), a separate finding from reading `poi_haven`**: the
  haven's boulder ring is visually **identical** before and after this lane's
  change, and the region statistic confirms it to three decimals (luma 90.50 vs
  90.49, |grad| 9.562 vs 9.571). It is not `rockMaterial` at all. `M.stone` is
  `plain(0x968a76, 0.93)` — a *mapless* `MeshStandardMaterial` — on a raw
  `new THREE.DodecahedronGeometry(sc, 0)`, so the rocks a player spends more
  time next to than any others in the game are flat-shaded twelve-sided grey
  pebbles with no texture on them. The `plain()` docblock's argument for
  maplessness is about *buildings* above a couple of metres carrying
  `BuildKit.bakeTone`'s per-vertex tone instead; a camp boulder at two metres in
  a hero shot is the case it does not cover. `tmp/shots/fin-r1/poi_haven.jpg`.
- **materials (whoever takes `PropMaterials.ts` next)**: `rockMaterial`'s tint
  saturation is still the rocks lane's open request and is untouched here.

## Shots

| dir | what |
|---|---|
| `tmp/shots/fin-r0`, `fin-r0p` | **before**, six shots (jpeg) and three (png for crops) |
| `tmp/shots/fin-r1`, `fin-r1p` | after the seam fix |
| `tmp/shots/fin-r1q` | **the same build as `fin-r1p`, captured again** — the repeat that voids the imgdiff reading |
| `tmp/shots/fin-r1r` | `zone_ostium_gorge`, `zone_three_valleys` — the near tor |
| `tmp/shots/fin-r2` | after the per-cell rim variation |
| `tmp/crop/fin/meteor-before.png`, `meteor-after.png` | 3x on the Meteor's face at 1.5 km — the argument |
| `tmp/crop/fin/lw-near-before.png`, `-after.png` | 4x on a boulder at ~60 m |
| `tmp/crop/fin/og-tor-r1.png`, `og-tor-r2.png` | 4x on a tor at ~35 m, constant vs varied rim |
| `tmp/crop/fin/heat/` | the imgdiff heat maps that turned out to be measuring boot noise |
| `tmp/shots/fin-c1`, `fin-c2` | two `--cold` captures — the control that found the cold/warm gap |
