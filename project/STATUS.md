# Status — 2026-08-31, after the overnight build

> **A snapshot, REPLACED in place, never appended to.** Dated bullets belong in
> `journal/`. Deleting a line that has stopped being true loses nothing.
> Capped at 150 lines by `.githooks/pre-commit`.

**`main`. `docs/plans/2026-08-30-fable-to-nine.md` is BUILT** — all 20 lanes
closed across 35 agent-lifetimes. It archives once the human rules on the five
decisions in `HUMAN_REVIEW.md`. Read `project/handoff/2026-08-30-coordinator.md`
first (the six decisions taken at dispatch, the endgame sequence) and
`project/journal/2026-08-31-round17-and-playtest.md` for every judged number.

## Where the gates stand

`pnpm run check` **21/21** — the suite gained two gates tonight, **`bakecheck`**
(nothing had ever looked at `src/public/baked/`) and **`framecheck`** (nothing
had ever asked whether a frame was a *picture*). `perf` and `gameplay` both
certify on a quiet tree, `RULER_VALID: true`, **166/166 shots** over 60 fps,
**0 hitches**. Draw peak **747/800**. `nanscan` **0 of 166**.

Content: `mainchain` ch1→ch5 with its self-grant shim deleted · **8/8 royal arms
claimable** · `combatloop` **35/35** with a dungeon round · median den **23.8 s**
at **25.2% HP** · `longplay` clean 30 min **day and night** · chocobo at
**11.00 m/s** with a race won end-to-end · Alstor swum at **0.06% floor-walk**
and dived with a working breath limit.

## The judged number, and what it means

**Three rounds, 0% hesitation, 0 fooled, 35 pairs each** — against a bar of ≥30%
with ≥2 fooled. Controls ran 62%, 50%, **88%**, so the instrument separates and
is not saturated. **Round 19 followed an eleven-lane fix wave built from round
18's own ranked tells and the number did not move at all**: that is §4's
measured plateau, and polish is closed on it.

The judge's own summary is the actionable part: *"what fails is never the shot,
it is material response and asset finish."* It rated composition, framing and
horizon placement good throughout, and **could not separate the Lestallum street
from shipped work in two separate pairings**. The remaining gap is whitebox
facades, cloud sprites with visible seams, and one stretched texture where a
ground plane wants detail meshes — **content volume, not shading.**

**Playable is NOT plateaued: 4 → 3 broken-feels** against a bar of fewer than
three. A third playtest was in flight when this session wound down.

## What the playtests were worth

Every top item a blind player reported was something twenty-one green gates
could not see, and several had been sitting in our own output unread:

- **Characters walked through boulders** — Noctis's chest inside a rock on
  **41.92%** of combat frames, now **0.00%**. That was the literal truth behind
  "fights happen inside a hill".
- **The camera's orbit point was inside the hillside.** The velocity look-ahead
  walks the focus 2.2 m; into a 40° slope that is 6 m of rise, so every arm
  sweep began underground and returned `minDistance` at *every* orientation.
  Three lanes had fixed real camera defects without touching the cause.
- **The clock never moved.** `Sky.hours` only advances inside `setTimeOfDay`, so
  every session ever played was 30 minutes of 14:00 — and **an entire tier of
  night-gated content had never been reachable.** Time now runs at one in-game
  day per real hour.
- **`longplay` had been printing the slope defect all night** — "gave up on 6
  unreachable spot(s)" — and nobody read it as a defect.

## The premises that were wrong

Roughly half of what closed was a corrected premise, not a landed feature:

- **The Disc's crater was 70–90 m underground** since it was built, so a funded
  art round's two engineering levers had returned honest measured negatives
  against a subject that was not there. Its judged shot also clears **0.09** of
  its own subject.
- **The faces were corrugated** — 26% of each visible face turns past 90° from
  the key. Two earlier notes blamed painted brow/lash shadows; the complaint
  survived *every* albedo, texture and shadow ablation.
- **§12.3 is a table of luminance percentiles**, so four passes matched it while
  the authored hair albedos were literally warm greys at 21% saturation.
- **A Float16 attribute did not survive the geo bake**, uploading as raw uint16:
  1.0 arriving as 15 360, 30 of 166 shots ≥45% clipped, 11 pure white — and a
  white frame passed `nanscan`, `drawcheck`, `perf` and a green suite.
- **`Harvest.collectRockProxies` returned `[]`**, and `CameraRig`'s prop sweep
  was a `||` chain over three properties `Props` has never had.

## Knowingly unfinished

- **The public-URL deploy** — descoped by the human; theirs, not a lane's.
- **Plan task 47**, held unlanded on purpose: `facecheck` may be measuring
  Noctis's art direction rather than a defect, and landing it would red the
  trunk on an unsettled question.
- **Ignis's glasses are 0.7 px wide at 5 m**, which is most of why a player
  could not tell him from Prompto; **Noctis's costume reads as a sleeveless
  bodice** rather than a layered jacket. Both filed with file:line.
- **`texc.bin.gz` cannot stay fresh while lanes commit** — any `pre-commit`
  `vite build` deletes it. `bakecheck` now catches it; rebake before any judged
  or certified number.
