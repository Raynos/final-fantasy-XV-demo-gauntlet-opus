# `e3897af` quoted a whole-frame mean for a terrain change. Most of it was sky.

Commit `e3897af` ("The 4-30 m hole") justified itself with paired PNG captures:

    vista_noon           mean 3.466/255   8.19% of pixels over 8/255   floor 0.39
    zone_three_valleys   mean 3.445       9.14%                        floor 0.74
    zone_vannath         mean 3.688       9.24%                        floor 2.00

Critic round 16 re-measured `vista_noon` and split the delta by band:

| band | mean/255 |
|---|---|
| sky | **4.412** |
| horizon | 2.907 |
| terrain | **1.447** |

**The commit changed the terrain and the sky moved three times as much.** The
large deltas in the heat map are edge-shaped rims tracing cloud silhouettes —
a re-jittered half-resolution cloud raymarch between two builds, not anything
the shader edit did.

## What survives, and what does not

**The change is still real.** 1.447 on the band it actually touched, against a
measured per-shot floor of 0.39, is 3.7x the noise. `zone_vannath` — the frame
the commit points at, and the one with the least sky — moved 3.688 against a
2.00 floor, and that shot's improvement is visible by eye. Nothing needs
reverting.

**The number quoted was the wrong instrument.** A whole-frame mean cannot
attribute a terrain change on any shot with sky in it, and the two other rows in
that table have the same contamination in unknown proportion. The honest form of
that evidence is per-band, or a shot with no sky, or a crop.

## The rule, since this is the third time a mean has misled somebody here

- **Diff the band you changed.** `imgdiff --heat` exists precisely so the
  *shape* of a delta can be read; an edge-shaped rim tracing a cloud is a
  re-jitter, and a broad low-amplitude wash over ground is a material change.
  They score similarly as a mean and mean opposite things.
- **`--raw` is for mesh ablations, not build comparisons.** Round 16 measured
  that `--raw` on both sides of this pair understates it **40x** (0.066/255) and
  changes LOD selection. `BRIEF.md` says to put `--raw` on both sides of a
  `--hide`; that instruction is about hiding an object in one page, and it does
  not transfer.

Two of round 15's own claims are corrected in round 16's journal for the same
reason: its "tiling and hatching" is not tiling (verified at 3x, no grid
exists), and the magenta smear it reported in `vista_dawn` does not exist — 25
pixels of 1.44 M pass a magenta test and every one is sky haze at the far
*right* edge, where the note said lower-left, which is a maroon tree trunk in
shade.
