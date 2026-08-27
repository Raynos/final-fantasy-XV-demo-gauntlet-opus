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

1. **The clouds are separate cotton-wool sprites on a flat blue gradient.**
   The loudest tell in the set by a wide margin, and it decided pairs 2, 5 and
   8 within a second of looking. FFXV's daylight sky is a continuous field with
   internal structure and a horizon haze; ours is discrete blobs with visible
   edges and a swirl artefact, pasted on a smooth gradient. `STATUS.md` already
   ranks the cloud layer second behind the head; this round says it is first
   for **landscape** frames.
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

Items 2 and 3 are phase 4's own subject and are actionable now. Item 1 is the
standing backlog's cloud row and is now the top-ranked landscape item rather
than the second. Item 5 is cheap and nobody owns it.

The composites are `tmp/ab/r15/` and are deliberately not kept: they are
regenerable from the shot corpus and the plates in one command.
