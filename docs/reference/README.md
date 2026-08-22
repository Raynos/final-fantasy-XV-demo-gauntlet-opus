# reference/

**What shipped FFXV actually measures.** Everything here is *external* reference —
imported evidence about the game we are being compared against, and about the
sibling repos that measured it. Nothing here describes our code.

That makes it a fourth genre alongside `docs/SCOPE.md` (what our game is),
`docs/plans/` (what we propose to do) and `project/` (how the work is going).
The distinction that matters: **`docs/` is durable, and this directory is
frozen** — these are measurements of someone else's shipped frames, so they do
not go stale when our code changes. Correct a number here only if you re-sample
the plate and get a different answer, and say so in the line you change.

| file | what |
|---|---|
| `ART-DIRECTION.md` | **The canonical art target.** 659 lines of pixel-sampled FFXV PS4 reference: grade split-tone direction, aerial-perspective falloff, sun elevation, bloom threshold, skin lit:shadow ratios, hair/cloth/fur value ranges, Nomura facial proportions as numbers, and a measured HUD layout table. |
| `plates/` | The 53 FFXV PS4 screenshots every number above was sampled from. Provenance in `PLATE-SOURCES.md`. |
| `PLATE-SOURCES.md` | Where each plate came from and how it was fetched. |
| `sibling-RENDER-INVENTORY.md` | The sibling's own present / absent / weak / traps inventory of *their* renderer. Kept for the **format** — an inventory whose stated purpose is "kill absence claims before they cost a round" — and because their ABSENT and WEAK lists are a checklist of what a three.js FFXV usually lacks. |
| `sibling-TRAPS.md` | 21 mechanisms with silent failure modes, and the five we have independently rediscovered. |

## The plates are not game assets

`BRIEF.md` hard rule 1 ("no binary assets") governs what the **build** reads.
Nothing under `docs/` is reachable from `src/index.html`, from vite's `root`, or
from any bundle. These 24 MB are read by agents and by `src/tools/imagestats.mts`
and `src/tools/compare.mts`, never by the game.

Copyright: Square Enix. Held here as reference for a comparison target, the way
a paint chip is held next to a wall.

## How to use them

Two tools make this directory executable rather than aspirational:

```bash
# grade statistics for the reference corpus, and for our own captures
node src/tools/imagestats.mts "docs/reference/plates/*.jpg" --label FFXV
node src/tools/imagestats.mts "tmp/shots/x/*.png" --label ours --against FFXV

# blind A/B: our frames vs reference plates, sides randomised, key sealed
node src/tools/compare.mts --shots tmp/shots/x --out tmp/ab
```

Hold character and creature art passes against §12 and §13 specifically. Every
dead sibling repo lost its blind test on **actor silhouettes, never
environment**, and those two sections are the only quantified actor targets
anyone in this gauntlet produced.
