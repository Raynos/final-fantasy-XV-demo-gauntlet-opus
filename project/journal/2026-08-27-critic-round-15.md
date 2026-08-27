# Critic round 15 — 8 pairs, 8 identified, 0 fooled

Run 2026-08-27 against `HEAD` = `1e5dc75`, on the eight landscape shots the
`compare.mts` PAIRING table covers. Blind: the composites were read before the
answer key was opened, the sides are randomised per pair, and the judge was
asked to name the panel it believed was the **shipped PS4 game**.

    n=8   identified 8   fooled 0   hesitated 0

Consistent with rounds 12/13/14, which identified 12 of 12 every time. The
score has not moved; what is new is a ranked list of *what gave it away*,
written down while the key was still sealed.

## The tells, in the order they were actually noticed

1. **The clouds.** The loudest tell in the set by a wide margin, and it decided
   pairs 2, 5 and 8 within a second of looking.

   > **The mechanism in this note was wrong and the correction matters more
   > than the observation.** Written blind, it said "separate cotton-wool
   > sprites on a flat blue gradient". They are not sprites: `Clouds.ts` is a
   > half-resolution screen-space raymarch of a real 3D density field with
   > anvils, a base-lift deck, worley shape and TAA jitter. Cropped at 2x the
   > *shapes* are good — soft billows, shaded undersides, wispy edges.
   >
   > What is actually wrong is **organisation and scale**: the field is many
   > similar-sized puffs spread evenly across the whole sky, with no streets,
   > no systems, no clear lanes and no large cell next to a small one. Real
   > cumulus gathers. That is a weather-map problem, not a shading one, and it
   > is a different piece of work from the one this note would have sent
   > somebody to do. Recorded because a wrong diagnosis costs more than a
   > stale row.

   `STATUS.md` ranks the cloud layer second behind the head; for **landscape**
   frames this round says it is first.
2. **The near-field ground is bare.** Pairs 5, 7 and 8. Every FFXV plate fills
   the bottom third of frame with continuous cover — grass reaching into the
   lens, leafy shrubs, saplings. Ours is dirt with sparse dots. This is the
   same defect the human described as "barren", one band closer than the one
   the far mass ring and the macro cover term just fixed: **the work so far
   moved 400 m to 2.6 km, and the frame is lost at 0-150 m.**
3. **One hue per frame.** `zone_three_valleys` is brown, entirely. FFXV frames
   carry green against grey stone against warm earth in the same shot. Value
   range and hue range are both short.
4. **Visible tiling and hatching on terrain slopes** — pairs 2, 3 and 6, worst
   under overcast where there is no sun to break it up.
5. **No foreground occluder, ever.** Nothing crosses the bottom or the side of
   any of our eight frames. Almost every FFXV plate has a trunk, a branch or a
   bush in the near field doing the composition. This is a *shot* problem as
   much as a world problem.
6. **A magenta smear** at lower-left of `vista_dawn`. A real artefact, not a
   judgement call.

## What this changes

Items 2 and 3 are phase 4's own subject and were acted on the same day. Laying
the terrain's cover octaves out against the distance each stops resolving at
found the gap arithmetically: 0.74 m and 1.9 m are gone by 300 m, 52 m and
165 m do not resolve below 800 m, and **nothing occupied 4-30 m** — the band
that carries a hillside at 150-400 m. Two octaves at 7 m and 22 m, with the
bare half taking a cooler bleached tint rather than only ever adding green to
brown, move `vista_noon` 3.466 mean/255 over 8.2% of pixels against a 0.39
floor. `e3897af`.

Item 1 is the standing backlog's cloud row, re-specified above as a
weather-map organisation problem, and is now the top-ranked landscape item
rather than the second. Item 5 is cheap and nobody owns it.

The composites are `tmp/ab/r15/` and are deliberately not kept: they are
regenerable from the shot corpus and the plates in one command.
