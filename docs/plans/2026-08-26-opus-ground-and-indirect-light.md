# The ground, and the light that reaches it

Status: PROPOSED (2026-08-26, opus) — **four workstreams, one theme, none of
them staffed.** Nothing here is locked. WS-1 and WS-2 are the two with measured
evidence and a named next command; WS-3 is a WIP branch that has never rendered;
WS-4 is the smallest and the only one gated on another lane.

This plan exists because four items came out of
`project/archive/plans/2026-08-21-fable-sibling-ports.md` (DONE, 2026-08-25)
with **no live home**. An archived plan's table is in `archive/`, which is never
edited and is not somewhere work is picked up from; `project/README.md` is
explicit that work is picked up from `docs/plans/` or `TODO.md` and from
nowhere else. Three of the four had been left in an archived §10 table and one
in a *handoff*, which is a record rather than a queue. So they are re-stated
here as work, with the measurements that motivate them.

**They are one theme, and that is not a filing convenience.** Every item is
about the ground plane and the light arriving at it: what the ground reflects
(WS-1), what occludes the ground (WS-2), what shadows the light reaching it
(WS-3), and how things meet it (WS-4). Two of them have already been diagnosed
wrong once by being treated as separate problems — the shadow-warmth row was
blamed on the ambient probe for two sessions, and the grounding lane spent its
hour on a term whose own positive control moved nothing.

---

## WS-1 — Shadow warmth is a ground-albedo problem, not an ambient one

**The row.** The daylight slice reads `sh(R−B)` **−9.2** against the FFXV-field
reference's **+5.8**. It is the last failing check in the grade's nine and it
has been open since the grade work landed.

**It was filed against the wrong system for two sessions.** Two handoffs said
the cause was the ambient probe and that the fix was the sky. Ablated outright
with exposure pinned (`?post=noexp,noambient` against `?post=noexp`, because the
closed loop otherwise hands back whatever you remove), **deleting the entire
diffuse ambient moves the row from −4.9 to −2.3.** The whole lever is worth 2.6
points of a 15-point gap. No ambient, of any colour or strength, closes it —
which is why 3.8(a) built a correct SH probe and moved shadow warmth by 0.6.

**`imagestats.mts`'s own docstring says why, and has all along:** outdoors the
darkest quartile of a frame is mostly *ground*, so `sh(R−B)` is dominated by
terrain and vegetation albedo, not by the colour of the fill. The metric is not
measuring what its name suggests, and this is §6.5's "metrics have blind spots
by class" arriving for the third time in this project.

**So the work is in the albedo.** `Layers.ts`'s six layers have mean lumas
spanning only 0.35–0.47 and `STATUS.md` already calls that splat "one texture,
not a material system". Start by measuring what the darkest quartile of a
daylight frame actually *is* — which layers, which vegetation — before moving a
constant. **Do not re-tint the grade** (`BRIEF.md` §6.1, and the note already
in `src/shaders/post/grades.ts` recording that moving `day.shadowTint` most of
the way to neutral bought 0.9 of the 15 points).

*Difficulty: medium. Evidence: the ablation above; `docs/reference/` for the
targets. Owns `src/world/terrain/Layers.ts` and the veg albedo ramps.*

## WS-2 — Grass coverage economics, and tier-D's reach

Two halves, and **the second one is the one the code asks for first.**

**Coverage economics** (the OGL repo, the last unbuilt item of sibling-ports
§3.6): coverage is `1 − exp(−λa)`, so near the camera you buy ground occlusion
with blade *area*, not clump density — measured there at 46% → 88% occlusion for
**+112k triangles instead of +2M**. Our near ring is `spacing: 0.27, max:
240000` with `HALF_W = 0.046` of height; nothing buys width near the camera.

**Tier-D's reach, first.** `TerrainMaterial.ts:1231` already has the sward
*and* a separate dry-cover term for Leide, patchy at clump scale, wind-coupled
to the same uniform objects the blades sway on, with per-zone endpoints measured
over the pixels blades actually cover. Its own comment block records it as close
to a measured negative — **0.037 mean/255 over 0.006% of pixels**, against a
floor of 1.5–1.9 — and says why, and what to do:

> *"The reason is reach, not strength. […] Anyone extending this should widen
> its reach before touching its colour again."*

It is gated on the grass splat weight **and** a 100–185 m distance ramp **and**
`bioGreen` simultaneously, and the conjunction is a small fraction of any frame.
Widen the reach, re-measure, and only then argue about colour.

**`src/world/veg/` currently has no owner** — `2026-08-21-fable-procedural-modeling`
owned it and is archived. Taking WS-2 means taking that directory.

*Difficulty: medium. Owns `src/world/veg/` and the tier-D block in
`src/world/terrain/TerrainMaterial.ts`.*

## WS-3 — Grounding: the ramp that has never rendered

Inherited whole from `project/handoff/grounding.md`, whose lane was **retired
after ~1 h mid-experiment**, and from sibling-ports §2.6, which closed contact
shadows as "present and insufficient" — a close, not a pass.

**The diagnosis is the part worth having, and it is measured.** Every grounding
mechanism in this renderer is scaled to human/room dimensions and every scenery
object in a graded frame is past all of them: GTAO gathers at a fixed **0.62 m**
world radius and fades out from 220 m; `ContactShadowPass` marches **0.5 m** and
range-gates at **55 m**; the CSM's `maxFar` is 190 m — while the graded
establishing shots put their nearest visible ground at **61–80 m**. And the one
height-dependent ambient term that exists (`aoBoost` in
`VegMaterial.patchVeg`) is applied to grass and to nothing else, so trees and
bushes carry no base occlusion at all.

**A world-metre contact ramp is a measured dead end** and is recorded as one:
sub-pixel at the range the judge grades, and its own positive control
(`?post=gcmax`, all indirect killed inside the ramp) moved `zone_vannath` by
2.600 mean/255 with the 2× crop **visually identical**.

**Exact next step, already written and never run.** The switch to a
*fraction-of-object* ramp builds and typechecks on the lane's `WIP` commit but
has never rendered:

    node src/tools/shoot.mts zone_vannath zone_fallgrove --out tmp/shots/G2p

diff against `tmp/shots/G0p` (baseline PNGs, on disk), then ablate with
`?post=nogcontact` and price the ceiling with `?post=gcmax` before believing
anything. **`pnpm run check` has not been run on that commit.**

*Difficulty: medium. Owns `src/engine/postfx/ContactShadowPass.ts` and
`VegMaterial.patchVeg`'s `aoBoost`.*

## WS-4 — Occlude indirect diffuse, in-material

3.8(a) built the SH probe and fixed what it could: the *aimability* of the
diffuse ambient and the double-count between probe and env cube. **It did not
fix the occlusion, and does not claim to.** A `LightProbe` is no more shadowed
by geometry than the env cube was, because our GTAO is a post pass multiplying
the composited frame rather than AO bound in-material — so it darkens direct
light too, and cannot darken indirect specifically.

That is the remaining half of sibling-ports §3.8's original complaint: *"the env
cube is the entire diffuse ambient and **nothing shadows it**"*. The probe made
the flood aimable; nothing yet makes it occludable.

**Gated on WS-3's answer, deliberately.** Both are about occlusion at the
ground, both would touch GTAO's output, and doing them independently is how two
lanes ship two terms that cancel. Read WS-3's ceiling measurement (`?post=gcmax`)
before designing this one — it prices what *all* indirect occlusion inside the
ramp is worth, which is an upper bound on WS-4 as well.

*Difficulty: medium-hard; structural on a renderer at 17/17. Measure first.*

---

## Order and ownership

WS-1 and WS-2 are independent of everything and of each other — one agent each,
in parallel. WS-3 before WS-4, for the reason in WS-4. Nothing here collides
with `2026-08-25-opus-after-phase3` (heads, programs, geometry bake, one canopy
shader) or with phase4's WS-0b (perf), so all of it can run alongside them.

## Definition of done

- [ ] WS-1: the daylight slice's `sh(R−B)` moves toward +5.8 **from an albedo
      change**, with the darkest-quartile composition measured before and after
      — or the row is closed with a measured negative saying what it really is.
- [ ] WS-2: tier-D's reach widened and re-measured against its recorded 0.037
      mean/255; coverage economics landed or rejected with the occlusion
      fraction measured at both ends.
- [ ] WS-3: the fraction-of-object ramp **rendered**, diffed against `G0p`,
      ablated, and either shipped or recorded as a second measured negative.
      `pnpm run check` green on it either way.
- [ ] WS-4: indirect diffuse is occluded in-material, or the change is rejected
      against WS-3's `gcmax` ceiling.
- [ ] Every frame judged by eye, not only by statistic (`BRIEF.md`).
