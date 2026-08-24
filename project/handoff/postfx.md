# Handoff — `postfx` lane: the crosshatch on all skin

Owns `src/engine/postfx/**`. Started from a routed finding: a blind judge scored
the game **3/10** and said the skin *"is flat untextured diffuse with no normal
map, so arms read as plastic"*, and what is actually on the face at portrait
range is a hard one-pixel woven crosshatch that the `head` lane proved is not the
material and handed over named.

Commits on `main`: `6ee0516` (the fix, the four probes, the measurements),
`49857c8` (`LANDMINES.md` + `facecam.mts`'s stale diagnosis).

**Status: done and verified. `pnpm run check` 16/16 on the shared tree.**

---

## 1. The inherited diagnosis was two-thirds wrong

`project/handoff/head.md` §4 named the chain as **GTAO dither → TAA fails to
resolve it on skinned meshes → CAS sharpens it into a weave**, and it is the
first two links that do not survive being measured.

What *does* survive, and it is the best thing in that handoff: **it is not the
material.** `weavehunt.mts` renders a flat white face with every map, vertex
colour, sheen, specular and received shadow off and the identical weave comes
through. That negative is real, it is what routed this correctly, and it is
still the control this lane is graded on.

The inference drawn from it was not tested. `weavehunt2.mts` toggles one post
pass, settles **four** frames, on one continuously-running page with no history
reset. Three things move underneath that and none of them is the pass:

- the subject **animates** under `settle`, so every later stage is a different
  pose;
- TAA keeps **converging**, so a stage taken later is quieter for free — my own
  first cut re-ran the shipped configuration last and it came back reading like
  a fix (face alternation 0.325 at the start, 0.187 at the end, nothing changed);
- four frames after a toggle is a **transient**: the history still holds the
  previous configuration's image and the neighbourhood clamp is rejecting most
  of it.

And there is a fourth, which cost me a round: **`applyShot` re-applies the
quality tier, which sets `gtao.enabled`.** Ablating GTAO *before* posing
photographs a frame with GTAO switched back on, and that reads as innocence.

## 2. The protocol that replaced it

`src/tools/probes/weavebisect.mts`. Every stage re-poses the shot, applies its
one variable **after** `applyShot`, calls `resetHistory()`, runs the same 40
frames, and **reports the pass flags actually in force at the moment of
capture**. `b_null` repeats `a_base` and `z_restored` repeats it again at the
end; both come back within **0.01** on both statistics, which is the floor every
row below has to beat.

The statistic is not `imgdiff`'s mean, which cannot tell a weave from natural
detail. It is, over a fixed patch of cheek: the RMS of the residual after
subtracting a 7×7 box mean, and the **one-pixel alternation**
`-(acf(0,1) + acf(1,0)) / 2` of that residual. A checkerboard scores ≈ +0.3;
anything smooth scores ≈ −0.5. The script is in this session's scratchpad and is
three dozen lines — it is easier to rewrite than to find, and the numbers below
are what matter.

## 3. What it is

`hero_portrait`, face patch, rms /255 and alternation:

| stage | rms | alt |
|---|---|---|
| shipped | 10.93 | **0.308** |
| **GTAO off** | 14.59 | **0.379** — *worse* |
| TAA told to ignore the velocity buffer entirely | 11.08 | 0.317 — the shipped frame |
| TAA jitter off | 11.13 | 0.312 |
| TAA history unclipped (`clampScale` 40) | 14.35 | 0.378 |
| TAA feedback flat at 0.97 | 11.09 | 0.316 |
| TAA off | 33.93 | 0.314 |
| CAS sharpen off | 5.86 | 0.081 |
| **contact shadows off** | **4.84** | **−0.023** |

So: **GTAO is innocent, the skinned motion vectors are innocent, and CAS is the
amplifier rather than the author.** The author is `ContactShadowPass`.

Two of those rows are worth keeping for their own sake. **The velocity-buffer
row falsifies the whole "previous-frame skinning matrices" line of attack** — I
patched the TAA shader so `vel.a > 0.5` never takes, forcing camera reprojection
for every pixel including the skinned ones, and the frame is the shipped frame
to 0.001. It remains true that `VelocityPass`'s `VEL_VERT` computes `vPrev` from
the **current** frame's skinned position (`#include <skinning_vertex>` runs once
and both `vCurr` and `vPrev` read the same `transformed`), so skinned motion
vectors *are* wrong — it is simply not what anybody was looking at. See §6.

Then `weavecontact.mts`, same protocol, on the pass itself:

| stage | rms | alt |
|---|---|---|
| shipped | 10.93 | 0.308 |
| contact off | 4.84 | −0.023 |
| `CS_STEPS` 12 → 48 | 2.88 | −0.028 |
| `length` 0.50 m → 0.20 m | 2.87 | −0.027 |
| `length` → 0.08 m | 2.89 | −0.032 |
| jitter forced to a fixed 0.5 | 12.62 | **−0.570** — banding instead |
| `facing` forced to 1 (rules out the depth-derivative normal) | 10.93 | 0.308 — unchanged |
| intensity 0.85 → 0.40 | 5.91 | 0.104 — it just scales |
| **screen-space step cap, 6 px** | **2.97** | **−0.047** |

That is an undersampling signature and nothing else. The march length is a
**world** length — `0.5 m * (1 + dist*0.045)` over 12 steps — and says nothing
about how far a step travels across the screen. At `hero_portrait` the subject
is 0.6 m from the camera, where one step is about **69 pixels**. The per-pixel
`ign` jitter is meant to dither the start *within one step*; at 69 px per step
it starts neighbouring pixels' marches on completely different geometry, and the
binary hit/no-hit lands as a one-pixel checkerboard which CAS then sharpens.

**Skin was never special.** It is the nearest large surface in a portrait. The
same march over the rocks and terrain in the same frame steps a fraction of a
pixel and is clean, which is exactly why this read as a skin defect for three
rounds. The armour is near too and is nearly black, so the multiplicative
darkening has almost no amplitude there — which is the other half of why it
looked like *skin* rather than like *near*.

Note also that the pass's own comment (`ContactShadowPass.ts:118`) — *"Rotating
the dither every frame is what lets TAA average it away"* — is correct, was
already implemented, and rotates over eight phases. It is necessary and it is
not sufficient, and quoting it was part of what made GTAO look guilty.

## 4. The fix

`post.contact.stepPx`, default **6**. One extra `worldFromDepth` at the
neighbouring uv with **this pixel's own depth** — the projected world size of one
texel, a matrix multiply and no texture fetch — then
`len = min(len, pxWorld * stepPx * CS_STEPS)`. A step can never cross more of the
screen than the depth buffer can resolve. `CS_STEPS = 48` fixes it just as well
and costs four times the depth fetches.

The cap only bites within about 9.6 m; past that the world length is already
finer than 6 px per step and nothing changes.

## 5. Proof

**The inherited control passes.** `weavehunt.mts`'s flat white face comes back
clean — `tmp/shots/postfx-r8/w-5_flat_white.png`, cheek 4.20 rms and
alternation **−0.191** — and the rocks, terrain and armour in the same frame are
unchanged.

**Frame-wide before/after on one boot.** `weaveproof.mts`; the shipped behaviour
is exactly `stepPx = 1e9`, so both halves are one build, one pose and one boot,
which matters with three other lanes editing the tree. `tmp/shots/postfx-r7/`:

| shot | imgdiff | note |
|---|---|---|
| `hero_portrait` | 2.593/255 over 5.1% | face 10.37 → **3.66** rms, 0.313 → **−0.040** |
| `hero_full` | 1.105/255 over 2.4% | the boot-to-ground contact is intact — `hf-before.png`/`hf-after.png` |
| `vista_noon` | 1.388/255 over 2.0% | below the 2.00 floor |
| `town_forecourt` | 5.513/255 over 17.0% | see below |
| `zone_fallgrove` | 3.607/255 over 9.9% | see below |

**The two large ones are improvements, not trades**, and both are the same
defect as the face — which is what I expected to have to defend and did not.
In `town_forecourt` the uncapped march was washing a flat cool tint across whole
*sunlit* beam faces under the canopy (`t-before.png` against `t-after.png`); in
`zone_fallgrove` it was smearing the entire near-field grass into a dark green
haze. Both come back with their detail. The static geometry in `hero_portrait`
does not move: armour 5.12 → 5.18, mid terrain 16.60 → 17.47, near rock column
27.35 → 27.42.

**Read at portrait range through `facecam.mts`**, `PIN_HEAD` on, at 0.55 m:
`tmp/shots/postfx-face/noctis_face.png` and its three siblings. The skin is
clean and the pore map now reads as skin texture instead of being buried under a
weave. What is left in that frame is the `head` lane's: the groom is still a
black straw broom over both eyes, the ear is a flat scoop, the eyeballs sit
proud.

`pnpm run check`: **16/16**.

**Perf, taken last on a quiet machine** (`perf.mts`, 1600x900, ultra,
`RULER_VALID: true` both runs):

| shot | ms | fps | draws | tris |
|---|---|---|---|---|
| `hero_portrait` | 4.10 | 244 | 574 | 7.67 M |
| `town_forecourt` | 8.35 | **120** | 993 | 10.21 M |
| `zone_fallgrove` | 4.95 | 202 | 606 | 11.29 M |
| `hero_full` | 5.20 | 192 | 692 | 7.80 M |

PASS, mean 189.5 fps, worst 120 fps. A second run of the same build moved **0
of 4 shots** by more than the 1.23 ms floor, so that is the repeatability.

**I could not take a paired before/after and here is why**, because it is a tool
bug somebody should fix: `perf.mts`'s own `parseArgs` throws on any unrecognised
`--` flag and runs *before* `harnessArgs` sees the line, so both `--build` and
`--dirty` are rejected and it can only ever measure `HEAD`. An A/B would have
meant committing the pre-fix shader to the shared trunk. Instead
`weavecost.mts` times the pass itself, ABBA, on one boot with `stepPx = 1e9` as
the uncapped control: **capped and uncapped are both under the timer floor**
(median 0.000 ms, p90 0.000 vs 0.100). That floor is real and not specific to
this pass — `perfpasses.mts` reports every post pass in the chain at 0.0 ms calm
on the same page, so 0.1 ms is what `performance.now()` resolves here. The
change adds one matrix multiply and no texture fetch to one full-screen pass and
changes no draw call or triangle; the bound is *under 0.1 ms*, not *zero*.

## 6. Left, and what I would do next

- **Skinned motion vectors are genuinely wrong and it is now a clean, separate
  item.** `VelocityPass.VEL_VERT` writes `vPrev = uPrevViewProj * (uPrevModel *
  objPos)` where `objPos` is the position **after** `#include <skinning_vertex>`,
  i.e. this frame's skinning. Every skinned vertex therefore reports
  camera-and-root motion only, and `vel.a` is 1 there, so TAA *prefers* that
  wrong vector over its depth reprojection. It is not the crosshatch (measured,
  §3) and it is not visible on a near-static portrait, but it is exactly what
  smears and ghosts a character in motion. The fix is a second bone texture
  holding the previous frame's skinning matrices and a `#include
  <skinning_vertex>` evaluated against it. Judge it on `party_walk` and in
  `combatloop`, not on `hero_portrait` — the shot that exposed nothing here.
- **`stepPx = 6` is measured, not derived.** 2 px and 6 px both clear the weave
  (−0.137 and −0.047); 6 preserves more of the contact, and past ~9.6 m the cap
  does not engage at all. If a future frame shows the contact shadow reading too
  short at gameplay range, 8–10 should still be clean, but re-measure with
  `weavecontact.mts` rather than assuming.
- **The pass is still undersampled everywhere, the cap just hides it.** At
  `hero_full`'s ~4 m the uncapped march was 12 px per step; the honest fix is an
  adaptive step count (keep the world length, raise `CS_STEPS` until the step is
  ≤ 2 px, bounded) rather than a cap. It costs depth fetches on near pixels and I
  did not take that trade without a perf number I could stand behind.
- **A hard vertical line runs down the forehead and nose bridge** in every close
  framing. Still there after this fix, so it is not post. `head.md` §5.3 has the
  `NO_FACEMAP` ablation that would name it.
- **Not touched, deliberately:** GTAO's `setGBuffer(depthTexture)` normal path.
  `LANDMINES.md` flags it and `patchGBufferMaterial` is still not fed; letting
  GTAO render its own normals costs a second scene render, measured at 10% of
  `gameplay`'s walk segment. I tested whether the branch inside three's
  `computeNormalFromDepth` (`dpdx = (dl < dr) ? backward : forward`, a per-pixel
  binary decision) was a carrier — it is not: forcing the branch and replacing it
  with central differences both reproduce the shipped frame to the floor. That
  is a measured negative on a plausible suspect and it is why the branch is still
  there.

## 6b. Cross-boundary — requested, not made

- **`src/tools/perf.mts` (method lane): `parseArgs` throws on `--build` and
  `--dirty`.** It runs before `harnessArgs` and rejects any unknown `--` flag,
  so `perf.mts` can only measure `HEAD` and a before/after across a shader
  change is impossible without committing the "before" to the shared trunk. Two
  `else if` arms in its option loop, or pass the flags through.
- **`src/tools/framecam.mts` (method lane): `--dirty` is still swallowed as the
  candidate-file argument.** Reported twice already (`characters.md` §7,
  `head.md` §6) and still true.

## 7. Files

- `src/engine/postfx/ContactShadowPass.ts` — the cap, and the measurement table
  in the shader comment beside it.
- `src/tools/probes/weavebisect.mts` — the post-chain bisect under a checked
  protocol. **This is the reusable one**; the protocol is the deliverable more
  than the result is.
- `src/tools/probes/weavecontact.mts` — which part of the contact pass.
- `src/tools/probes/weavenormal.mts` — the GTAO depth-normal branch, a negative.
- `src/tools/probes/weaveframe.mts` — the GTAO noise re-roll, a negative.
- `src/tools/probes/weaveproof.mts` — the frame-wide before/after A/B.
- `src/tools/probes/weavecost.mts` — the paired cost of the cap, ABBA on one
  boot, and the note on why `perf.mts` could not do it.
- `src/tools/probes/weavehunt2.mts` — its header recorded the wrong answer as
  fact; it now says so and points at `weavebisect.mts`. Kept, because its
  `all_off` stage is still the cleanest picture of the skin underneath.
- `src/tools/probes/facecam.mts` — `NO_HATCH`'s comment carried the old
  diagnosis as fact; corrected. (Not my lane's file; a one-comment correction.)
- `project/LANDMINES.md` — the wrong-diagnosis row, the screen-space-march rule,
  and the two protocol traps.

Frames: `tmp/shots/postfx-r5/` (the bisect), `tmp/shots/postfx-r6/` (the pass),
`tmp/shots/postfx-r7/` (the five-shot A/B), `tmp/shots/postfx-r8/` (the flat
white control), `tmp/shots/postfx-face/` (portrait range).
