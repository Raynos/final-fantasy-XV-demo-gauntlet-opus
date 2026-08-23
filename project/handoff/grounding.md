# Grounding — nothing sits on the ground (judge's round-11 #1)

Owner: the grounding agent (`PORT=5600`), 2026-08-23. **Retired after ~1 h by the
coordinator, mid-experiment.** One `WIP` commit; see its message for the full
diagnosis, which is the part worth having.

**What I found.** Every grounding mechanism in this renderer is scaled to
human/room dimensions and every scenery object in a graded frame is past all of
them: GTAO gathers at a fixed **0.62 m** world radius and is faded out from
220 m (`PostFX.ts`), `ContactShadowPass` marches **0.5 m** and range-gates at
**55 m**, and the CSM's `maxFar` is **190 m** — while the graded establishing
shots put their nearest visible ground at **61–80 m**. On top of that, the one
height-dependent ambient term that exists (`aoBoost` in `VegMaterial.patchVeg`)
is applied to **grass and to nothing else**: trees and bushes carry `aoBoost: 0`,
so they have no base occlusion of any kind. Measured negative, recorded because
it kills the obvious design: a *world-metre* contact ramp is **sub-pixel** at the
range the judge grades — 0.34 m of a 1.5 m shrub eight pixels tall is one pixel —
and its own positive control (`?post=gcmax`, all indirect killed inside the ramp)
moved `zone_vannath` by 2.600 mean/255 with the 2× crop **visually identical**.

**Exact next step.** The switch to a *fraction-of-object* ramp is written and now
**builds and typechecks** (two dangling parens in `patchVeg` were what broke the
capture; fixed in the same commit) but it has **never rendered**. Capture it —
`node src/tools/shoot.mts zone_vannath zone_fallgrove --out tmp/shots/G2p` —
diff against `tmp/shots/G0p` (baseline PNGs, already on disk), then ablate with
`?post=nogcontact` and price the ceiling with `?post=gcmax` before believing
anything. `pnpm run check` has **not** been run on this commit.
