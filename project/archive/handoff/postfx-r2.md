# Handoff — `postfx-r2`: the blob the crosshatch fix left behind

Owns `src/engine/postfx/**`. Inherited a fix that half-worked: the `postfx` lane
correctly named `ContactShadowPass` as the author of the skin crosshatch and
capped its march step in screen space, and the cap traded one artefact for
another — a lobed, stair-stepped dark blob over the whole mid-face and neck at
portrait range, which `head-r2` measured and called the loudest thing left in
`hero_portrait`, the frame a blind judge has called the worst in the game for
two rounds running.

Commits on `main`: `3f6cd05` (the fix), `7d64a48` (the two probes), `a5a9758`
(`LANDMINES.md`).

**Status: done and verified. `pnpm run check` 17/17. Perf: paired `--build` A/B
on a quiet machine, both runs `RULER_VALID: true`, 0 of 4 shots moved by more
than the floor.**

**A perf lane was live in `src/engine/**` for this whole session**
(`project/handoff/perf-r2.md`, still committing). I checked before the first
edit and stayed inside `ContactShadowPass.ts` and two new probes for exactly
that reason — no shared engine plumbing was touched.

---

## 1. It was not what the shape of it says it was

The blob is lobed and stair-stepped, which reads unmistakably as quantisation:
`occ = max(occ, 1.0 - float(i) / float(CS_STEPS) * 0.55)` over `CS_STEPS = 12`
can take thirteen values, and the brief's first two candidate fixes both follow
from that reading — decouple the step size from the reach, raise the step count,
put a screen-space floor under the reach.

**All three are measured negatives.** Hold the reach fixed at the shipped 72 px
and treble the step count from 12 to 36 and **the blob is entirely still
there** — 11.7 against 11.6 in one run, 11.5 against 13.1 in a repeat, on a
shipped-configuration signal of 11.2-11.8 and a floor of 0.15. Raise the
reach and it gets *worse*. The term was never a coarse ramp; the debug view of
the pass's own weight (`tmp/shots/pfx2-r1/b-wv_base.png`) shows `w = 1.0`,
saturated, across the entire mid-face, with a jagged boundary and nothing in
between. A jagged boundary is what a **hard threshold on a smooth field** looks
like, not what a coarse sampling of one looks like.

## 2. What it is: the cap invalidated a constant expressed as a ratio

`thickness = 0.45 m` is not an independent number. It was authored against
`length = 0.50 m` — 0.9x the march — which is what makes it mean *"an occluder
about as deep as the distance I am willing to walk"*. It is the term that
rejects a hit against something far behind the ray.

The screen-space cap cut the march to `pxWorld * 6 * 12` = **0.045 m** at
`hero_portrait`'s 0.6 m and left the window at 0.45, i.e. **ten times the
march**. So `if (diff > bias && diff < uParams.y)` stopped rejecting anything at
all: every ray that dipped behind the face reported a hit, and the occlusion
term went hard 0 -> 1 across the boundary where it stopped doing so.

The fix is three lines. `lenScale = len / lenW` is the ratio the cap applied;
the window is scaled by it. **It is exactly 1 wherever the cap does not bite
(past ~9.6 m), so it is a no-op there by construction rather than by
measurement.** `post.contact.thicknessTrack` = 0 reproduces the old behaviour,
which is what lets every A/B below run on one boot.

## 3. The measurements

`src/tools/probes/blobhunt.mts`, under `weavebisect.mts`'s protocol plus the two
corrections in §5. `hero_portrait`, hair hidden, mid-face rectangle
(700, 290, 160, 230), mean of the per-pixel max-channel delta **against the same
stage with the pass disabled**. The pass-off side repeats to **0.15** and the
shipped configuration repeats to **0.54** across three identical stages. Two
separate runs of the whole probe reproduced every row, and the pre-fix rows to
three decimals.

| stage | mean /255 |
|---|---|
| shipped (three identical stages) | **11.77 / 11.23 / 11.73** |
| pass off, repeated (the floor) | 0.15 |
| `thickness` 0.45 -> 0.10 | 8.28 |
| `thickness` 0.45 -> 0.06 | 2.16 |
| `thickness` 0.45 -> 0.03 | 0.46 — nothing left at all |
| **window tracks the cap** | **1.19** |
| ...and the `bias` tracking too | 2.37 — *worse* |
| 72 px reach, 12 steps | 11.7, and 11.5 on a repeat |
| **72 px reach, 36 steps** | **11.6, and 13.1 on a repeat — the step count does not touch it** |
| 216 px reach, 36 steps, window proportional | 11.6, 11.8 — the reach itself matters |

A second run of the same probe **after** the fix landed, so the before and the
after are stages of one boot: shipped now reads **1.52 / 0.99 / 1.64** on those
three identical stages, `thicknessTrack = 0` reads **11.26**, and the pass-off
floor is **0.148**. `tmp/shots/pfx2-r4/`.

Two rows are worth keeping for their own sake. **`bias` is not the same defect
even though it is the same *kind* of number** — it is also a world metre
(0.032 m, about 51 px at 0.6 m) and scaling it with the cap makes the frame
worse, because `bias` is precisely what rejects the ray's hit against the
surface it started on. And **the reach matters independently of the window**: at
three times the capped reach the blob returns with the window kept proportional,
because 13 cm of march at 0.6 m genuinely reaches the rest of the face. A
screen-space floor on the reach — the brief's option 2 — would have made this
worse, not better.

## 4. Proof

### The bar head-r2 set: `--ablate nocontact` must stop making a difference

Same capture path they used — `shoot.mts hero_portrait --hide hair`, with and
without `--ablate nocontact` — over their face rectangle (620, 130, 340, 440).
Both numbers are the per-channel mean, so they are comparable with the 3.634
they quoted:

| | mean /255 | max | % over 8/255 |
|---|---|---|---|
| before (`sha:cfa3dfc`) | **6.79** | 123 | **21.6%** |
| **after (`HEAD`)** | **0.857** | 89 | **1.1%** |

Over the mid-face rectangle alone, 12.25 -> **1.54**. head-r2's stated floor for
that crop was 2.00; the whole ablation is now under it.
`tmp/shots/pfx2-c/` against `tmp/shots/pfx2-d/`.

### Frame-wide, three ways, on one boot

`src/tools/probes/blobproof.mts`. Both shipped behaviours are a parameter value
— `stepPx = 1e9` is the march before the crosshatch fix, `thicknessTrack = 0`
the march after it and before this one — so `uncapped` / `capped` / `tracked` /
`off` are one build, one boot and one pose. `tmp/shots/pfx2-p1/`.

| shot | uncapped -> capped (the previous lane) | capped -> tracked (this) | tracked vs off |
|---|---|---|---|
| `hero_portrait` | 3.13 | 2.65 | 1.44 |
| `hero_full` | 1.61 | 0.82 | 1.47 |
| `vista_noon` | 2.09 | 1.44 | 1.23 |
| `town_forecourt` | **6.51** | **0.66** | 1.74 |
| `zone_fallgrove` | 3.67 | 3.29 | 1.14 |

**The previous lane's wins survive and I looked at all three.**
`town_forecourt`'s 6.51 reproduces their 5.51 and this change moves that frame
by 0.66/255 — the sunlit canopy beams and the pumps are still crisp
(`p-town_forecourt_uncapped.png` is the washed one, `_tracked.png` the clean
one). `zone_fallgrove` moves further, and in the same direction they were
going: the near-field ground comes back with more colour and grain rather than
less (`p-zone_fallgrove_capped.png` against `_tracked.png`). `hero_full`'s
boot-to-ground contact is unchanged to the eye at 4x
(`feet-capped` / `feet-tracked`, crop 700 620 240 130), and `tracked vs off` is
1.47 there, so the pass is still doing its actual job.

**The inherited control passes.** `weavehunt.mts`'s flat white face —
every map, vertex colour, sheen, specular and received shadow off — comes back
clean at `HEAD`: `tmp/shots/pfx2-w/w-5_flat_white.png`, cheek 2.92 rms and
one-pixel alternation **-0.154**. Negative alternation is the whole point: a
checkerboard scores +0.3.

**Read at portrait range.** `tmp/shots/postfx-r2/hero_portrait.png` against
`tmp/shots/postfx-r2-before/hero_portrait.png` (`--build 135c2ad`, the commit
before this one; everything between them is markdown and probes). Frame-wide
`imgdiff` 1.384/255 against a measured floor of 0.18, all of it on the face.
The cheek at 6x — `cheek-before` / `cheek-after`, crop 695 355 100 70 — is the
clearest single picture: the flat dark wash lifts and skin grain appears
underneath it. That is also why the cheek's high-pass RMS goes *up*, 4.57 ->
7.43, while its alternation does not move (0.151 -> 0.159, against the 0.308
the crosshatch scored). Detail returning reads as more residual; a checkerboard
returning would have read as alternation, and it did not.

### Gates and cost

`pnpm run check`: **17/17** (`silrocks` is wired now).

Perf, **paired `--build` A/B** — which is possible at all because the method
lane granted the previous lane's request (`4bad7ff`, "the two perf gates could
only ever measure HEAD"). `135c2ad` against `3f6cd05`, the commit pair that
differs by nothing but this shader change. Both runs printed
`VERDICT: quiet — safe to measure` and `RULER_VALID: true`:

| shot | before | after | draws | tris |
|---|---|---|---|---|
| `hero_portrait` | 4.20 ms | 4.20 ms | 570 both | identical |
| `hero_full` | 5.00 | 4.95 | 688 both | identical |
| `town_forecourt` | 8.20 | 8.55 | 997 both | identical |
| `zone_fallgrove` | 5.15 | 5.20 | 606 both | identical |

**0 of 4 shots moved by more than the 0.82 ms floor.** The change is one
divide and one `mix()` per pixel in a full-screen pass, no texture fetch, no
draw call, no triangle — and unlike the previous lane I could measure that
rather than bound it, because `--build` works now.

## 5. Two protocol traps, and they cost a round each

Both are additions to the list the previous lane started, and both produced a
*plausible, deterministic, wrong* number rather than an obvious failure.

- **`--hide` hides after settling. Inside a settle-and-shoot probe that is
  wrong.** The daemon hides after `settle` so the sim is identical on both
  sides, which is right for a capture. In a probe that then takes the frame
  immediately, TAA feedback is ~0.9, so one frame after the hair disappears the
  image is still mostly the *hairy* history — and how big that transient is
  depends on what the previous stage left behind. The null control read
  **4.38 against `a_base`'s 5.29 and `z_restored`'s 8.32** on three identical
  configurations. Hide before the settle frames; visibility is constant across
  stages, so nothing is lost.
- **The measurement rectangle must contain only the subject.** With the sky,
  the mountains and the grass inside the face rectangle, the null control
  drifted *monotonically upward* through the run — every later stage read as a
  bigger difference — because the world moves between stages and the reference
  frame is frozen. Excluding the background: 11.77 / 11.23 / 11.73.
- And the negative that goes with it: **`resetClock()` fixed none of it.** I
  added it expecting the drift to be pose, and the numbers came back identical
  to three decimals. A clock reset does not rewind the clouds, the grass or the
  streamed vegetation. It is in `blobproof.mts` anyway because it is free and
  correct; it is simply not what was wrong.

## 6. Left, in the order I would take it

1. **The occlusion term is still a hard binary at its boundary.** `if (diff >
   bias && diff < thick)` with `occ = max(...)` gives no penumbra: what is left
   on the face is one small, hard-ish patch by the right nasolabial fold. A
   `smoothstep` across both edges of the window would ramp it, cost nothing, and
   is the honest version of "dither and filter properly". **Untested** — it was
   not needed to clear this defect and I would not take it without measuring
   `town_forecourt` and `hero_full` again.
2. **`bias` is still a world metre and it is still large in pixels** — 0.032 m
   is ~51 px at 0.6 m, so the march *starts* half a face away. Tracking it with
   the cap is measured worse (§3), so if it is ever worth attacking it needs a
   different idea, not the same one.
3. **The pass is still undersampled everywhere**, unchanged from the previous
   lane's note. The cap and this fix both hide it rather than sample properly.
   An adaptive step count is still the honest fix and still costs depth fetches.
4. **Skinned motion vectors are still wrong** — `VelocityPass.VEL_VERT` computes
   `vPrev` from this frame's skinning. Untouched here, measured innocent of both
   artefacts, and judged on `party_walk` and `combatloop` rather than a portrait.
   `project/handoff/postfx.md` §6 has the whole thing.
5. **Not touched, deliberately:** GTAO's `setGBuffer(depthTexture)` normal path,
   for the same reason as last round.

## 7. Cross-boundary — requested, not made

- **`src/tools/framecam.mts` (method lane): `--dirty` is still swallowed** as the
  candidate-file argument. Five handoffs now. The empty-specs-file workaround
  still works.
- **`src/tools/cleanup.mts`**: reported `no capture daemon registered` and
  `clean — no orphaned servers or browsers` at a moment when `daemon.mts
  --health` answered on port 36646 with four workers. The stale-registry
  landmine is real and still bites; I did not act on the "clean".
- **`src/tools/imgdiff.mts` (method lane)**: no way to restrict a diff to a
  rectangle, so every lane that wants a per-region number writes its own
  decoder — this one did, `head-r2` did. A `--rect x y w h` would retire three
  copies. The floor logic would need to be per-rect or suppressed.
- **`src/characters/**` (head lane)**: `head-r2` §9's request is discharged. The
  facets and the lobed boundaries inside the face are gone; the jaw silhouette
  was already theirs and is smooth. What is left in `hero_portrait` is the
  groom, the flat malar and the proud eyeballs, all in their §8.

## 8. Files and frames

- `src/engine/postfx/ContactShadowPass.ts` — `lenScale`, `thick`,
  `thicknessTrack`, and the measurement table in the shader comment beside them.
- `src/tools/probes/blobhunt.mts` — which part of the pass, under the corrected
  protocol. The reusable piece is `reach(px, steps)`, which restates the cap as
  a reach *and* a step count so "more samples" can be tested without it also
  meaning "a longer march" — the conflation that made the step count look guilty.
- `src/tools/probes/blobproof.mts` — the frame-wide three-way on one boot.
- `project/LANDMINES.md` — the ratio rule, and the note on reading a shape.

| what | where |
|---|---|
| before, shipped, hair hidden | `tmp/shots/pfx2-a/` |
| before, `--ablate nocontact` | `tmp/shots/pfx2-b/` |
| **after, shipped, hair hidden** | **`tmp/shots/pfx2-c/`** |
| after, `--ablate nocontact` | `tmp/shots/pfx2-d/` |
| the bisect, incl. the debug view of the pass's own weight | `tmp/shots/pfx2-r1/`, `pfx2-r3/` |
| **the frame-wide three-way, five shots** | **`tmp/shots/pfx2-p1/`** |
| the flat-white control | `tmp/shots/pfx2-w/w-5_flat_white.png` |
| **shipped frames, after** | **`tmp/shots/postfx-r2/`** |
| shipped frames, before (`--build 135c2ad`) | `tmp/shots/postfx-r2-before/` |

`tmp/shots/postfx-r2-before/hero_portrait.png` against
`tmp/shots/postfx-r2/hero_portrait.png` is the before/after for the whole lane:
a face with a hard-edged dark mask painted across its middle, against a face
with skin on it.
