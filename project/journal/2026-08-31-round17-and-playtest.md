# Round 17 and the first playtest — the numbers, whichever way they fall

Run 2026-08-31 at the end of the overnight build of
`docs/plans/2026-08-30-fable-to-nine.md`, against a tree at `pnpm run check`
**20/20** with all five bake artifacts fresh.

## R1 — judge round 17

**43 pairs: 35 main-arm, 8 control, shuffled into one undifferentiated pile**
and judged blind, round 16's method. The judge was asked which panel is the
*shipped* game, wrote a reason per pair before answering, and never saw the key.

    MAIN ARM    n=35   identified 35   fooled 0   hesitated 0   ->   0% hesitation
    CONTROL     n=8                                hesitated 5   ->  62%

**The bar is hesitation >= 30% with >= 2 fooled. This is 0% and 0.** Round 16 was
1 of 20 (5%); this is 0 of 35. With n=20 against n=35 those are the same place
statistically — **the gap did not close.**

**The instrument is sound.** 0% against a 62% control is a wider separation than
round 16 recorded (5% against 100%), and every one of the judge's five
hesitations landed on a plate-vs-plate pair. It is not a machine that always
says HIGH, and it is not saturated.

### The judge's ranked tells, which are now the fix wave

1. **Character models below mannequin tier** — no eye-socket geometry, mouths as
   flat albedo decals, hands as fused claw-stubs, sleeve and vest geometry
   intersecting arm and torso, hair as one coarse alpha shell with hard scissor
   edges. **Decided a third of the round.**
2. **Terrain as one texture instead of geometry** — no grass or shrub *geometry*,
   UVs smearing radially toward the horizon; and on mountains one rock albedo
   repeating in a diagonal weave with nothing breaking the silhouette. Shipped
   frames show **three scatter tiers** falling off with distance.
3. **Bloom and exposure blowouts that destroy the frame** — and this one caught a
   real bug the whole gate suite missed; see below.
4. **Stamped, tiling cloud sprites** — no internal density variation, no
   self-shadowing, an obvious repeat across the dome, and **casting no shadow on
   the terrain at all.**
5. **Emissives and props decoupled from the lighting solution** — rune circles
   that light nothing a metre away, lightning as unlit 2D zigzags, swords as flat
   grey planes, props with no contact shadow.

### What the judge caught that twenty gates did not

**Three city shots render as blown-white frames**, two of them judged PAIRING
rows. `lest_market_day` is 9 375 bytes and is a **pure white rectangle**;
`lest_street_night` 14 205; `lest_overlook_disc` 32 241, against ~220 000 for a
healthy frame. It is **not** a settle artifact — re-shot at `--settle 240` the
bytes are identical — and the geometry is drawing: `lest_overlook_disc` reports
7 853 662 tris and 463 calls and still comes back white.

**`nanscan` reads 0 of 166, `drawcheck` PASSes at worst 745/800, `perf`
certifies 166/166 shots, `check` is 20/20. A white frame passes every gate in
this repository.** The blind judge found it in one pass, unprompted, because it
was the only instrument in the building actually looking at the picture.

So round 17's 0% is honest but it measured a partly-broken build: at least three
of the 35 pairs were unwinnable.

## R2 — the first playtest, by proxy

A fresh agent played 30 minutes with no instructions, forbidden from reading the
source to find bugs, and asked to rank what felt broken by **how much it hurt**.

**Four things it would mention to a friend. The bar is fewer than three.**

Its own words: *"the faces are melted and everyone's got grey hair"*, *"half my
fights happened inside a hill"*, *"you run at a slope and just stop dead"*, and
*"the map has a hundred places on it and won't tell you what any of them are."*

The full ranked list is in the fix-wave briefs. Four things about it are worth
keeping:

- **Two of its top four were already filed and I had not prioritised them.** A
  lane had filed *"the encounter camera has no collision push-out — the frame
  where the fight starts is 90% the inside of a boulder"*, and the blown-white
  bug reached the player as *"bright scenes wash out and take the HUD with
  them"*. Two independent observers, one measurement each.
- **`longplay` has been printing the slope defect all night.** *"gave up on 6
  unreachable spot(s), turned away from being stuck 2 time(s)"* is its own
  output, and nobody read it as a defect until a player hit it and stalled 600 m
  short of a lake they could see on the map.
- **Every portrait in the game is the "no avatar" grey silhouette** — HUD, camp
  dialogue, Gear, Main Menu, four identical blanks. Nobody had noticed. The
  player noticed in ten seconds.
- **The chocobo is invisible.** It is summonable from minute one, rides at
  11.00 m/s and has three race courses; there is no chocobo row on the controls
  card, both chocobo map points read UNSURVEYED, and the player gave up without
  ever learning whether riding one was possible. That was the single most
  confusing moment of the session — **for a feature that works.**

### What it said was good, which is signal too

Driving ("the best five minutes"), night, the combat HUD when the fight is
visible ("I could read it exactly"), the map screen and Ascension grid as
interface, the writing, the camp loop end to end, and thirty minutes of
continuous play with nothing wedged or errored.

## The standing order

§4 is explicit: a round under the bar re-orders its ranked tells into the next
fix wave automatically, and the loop stops at the bar **or at a measured
plateau** — a full fix wave that moves the number by nothing. **One wave has
now run; this is the second.** Neither number is published as a pass, and
neither is hidden.

---

# Round 18 — the same number, on a repaired build

Run immediately after `e848801` fixed the Float16 bake bug, same method, same
control plates, so it is directly comparable to round 17.

    MAIN ARM    n=35   identified 35   fooled 0   hesitated 0   ->   0% hesitation
    CONTROL     n=8                                hesitated 4   ->  50%

**Identical to round 17 on the main arm.** Repairing a bug that rendered **11
shots as pure white and 30 of 166 at >= 45% clipped** moved the judged number by
**exactly nothing.**

That is worth stating plainly rather than explaining away. The blowout was
catastrophic, real, and worth fixing on its own terms — the corpus is a corpus
again — but **it was never what the judge was deciding on.** Its verdicts came
from material response and asset finish, and those did not change.

## Round 18's ranked tells, which are sharper than round 17's

1. **The sky is a single tiling cloud sheet, and it seams** — the same puff
   pattern at identical scale across the whole dome, with rectangular repeat
   boundaries visible where tiles abut, "most blatantly a hard edge cutting
   straight through the sun's glare". Its single most frequent and most fatal
   tell.
2. **Placeholder props left in shot** — untextured pure-black **torus and box
   primitives**, receiving no light, casting no contact shadow. *"Wherever one
   appeared, the panel was decided in under a second."* **Three independent
   observers have now reported this object**: this judge, a lane measuring the
   party at playing distance, and the blind playtester ("a big untextured black
   tyre... the first object in the frame").
3. **Faces and hands fail before anything else** — face texture stretched off
   the UV, eyes at two different depths, a neck cylinder that does not meet the
   collar, paddle hands with fused fingers, skin reading as painted vinyl.
4. **Terrain is one high-frequency texture on a smooth heightfield** — no
   displacement, no material transitions, a visible blend seam where grass meets
   dirt, and in the worst cases **a literal visible checkerboard on the rock**.
5. **Water and vegetation modelled as flat planes rather than as media** — a
   mirror surface whose ripple never diminishes with distance and does not
   interact with the shoreline; leaf cards with hard alpha-test edges against
   bright sky and no light penetrating the canopy.

## What the judge said was close, which is the first time this has been asked

- **The stormy lake with the lightning strike** — "the strongest non-obvious
  frame in the round": layered fog banks with real depth separation, a reflection
  that grades correctly with distance and carries ripple distortion, stratified
  foreground rock with moss in the crevices, "a restrained green-grey storm grade
  that reads as art direction rather than a filter". Its only weakness is that
  the bolt casts no light.
- **The forest clearing** — "genuinely good bark: real normal detail with root
  flare, and a believable understory". *"It is let down by its rocks, not its
  trees."*
- **The HUD reconstructions** — "accurate enough in typography, layout and
  iconography that for a beat I read them as real captures. **The HUD is not the
  problem; the world behind it is.**"
- And the observation that matters most for where effort should go next:
  *"the composition and camera choices across the weaker panels are good —
  framing, horizon placement, where the character sits in the frame. **What
  fails is never the shot, it is material response and asset finish.**"*

## Honesty about what this round is and is not

It is **not** a measured plateau in §4's sense. §4 defines that as *a full fix
wave* moving the number by nothing; what ran between 17 and 18 was **one bug
fix**, and the six-lane fix wave was still in flight when round 18 was judged.
Two of its lanes have since landed. The next round is the one that tests the
wave.

---

# Round 19 — the fix wave lands, and the number does not move. This is the plateau.

Run on a **21/21** build with fresh bake caches, after an eleven-lane fix wave
built from round 18's ranked tells and the playtest's ranked list. Same method,
same control plates, directly comparable to 17 and 18.

    MAIN ARM    n=35   identified 35   fooled 0   hesitated 0   ->   0% hesitation
    CONTROL     n=8                                hesitated 7   ->  88%

           round 17    main 0%    control 62%
           round 18    main 0%    control 50%
           round 19    main 0%    control 88%

**§4 defines the stopping condition as "a full fix-wave moves the number by
nothing (a measured plateau)". That is what happened.** The wave was not
cosmetic: it closed the judge's own #2 tell (the black placeholder prop), the
cloud-shadow projection error (patches were a **tenth** the size of the clouds
casting them), the world-wide `runnel` weave (every massif wearing the same
tartan at 55 degrees), the Float16 bake bug (**30 of 166 shots** clipped, 11
pure white), and every top item on the playtest's list. **The judged number is
identical to three significant figures: zero.**

**The control arm rising to 88% strengthens the reading.** The judge became
*more* willing to answer "I cannot tell" than in either earlier round, and still
never once said it about one of our frames. This is not a saturated instrument
and it is not a judge that always says HIGH.

## What round 19 says the gap is

1. **Sky as discrete sprites** — hard-edged popcorn puffs, visible quad seams,
   aliased streaks, cloud layers at wrong depths intersecting terrain. *"Single
   most reliable tell in the round; no shipped frame ever showed a cloud edge."*
2. **The ground plane** — one stretched tiling texture, no detail meshes, no
   pebbles, no contact shadow where geometry meets it, characters visually sunk
   into it. Fourteen pairs.
3. **Faces and hands** — collapsed intersecting facial planes, uniform plastic
   skin with no subsurface, no eye wetness, repeated mask heads across a party,
   hands as dark mittens.
4. **Light that does not propagate** — emitters with no falloff onto adjacent
   geometry, wet surfaces reflecting nothing, night lifted to uniform grey,
   caustics as a pasted decal.
5. **Untextured or single-tile architecture** — whitebox facades, grid-decal
   paving, awnings as flat quads, crowds near T-pose. And the inverse tell:
   *"real signage text and thin anti-aliased power lines never appeared on a
   fake."*

## What it says is close, which is the useful half

- **The party overhead** was the hardest frame in the round and it lost on its
  *world*, not its cast: *"the only counterfeit whose characters I could not
  fault — correct silhouettes, correct costume layering, hands and boots that
  read as authored assets. I had to call it entirely on the world underneath
  them… **If the environment work ever catches up to that character work, I lose
  this pair.**"*
- **The Lestallum street** could not be separated from shipped work in **two
  separate pairings** and was answered `?` both times — the single best result
  any frame in this project has ever produced against a plate.
- **The pine forest** was cleared three times; its weak points are named
  precisely (soapy low-frequency boulder normals with no lichen variation, and a
  bark tile that visibly repeats up the trunk).
- **Prompto beside the Regalia in fog** — *"articulated glove, layered vest with
  buckles, hair with real rim translucency."*

## The verdict, stated the way §4 asks

**Polish: plateaued at 0% hesitation against a 30% bar, across three rounds and
one full fix wave.** The judge's closing sentence is the fair summary and it is
not softened here:

> *"Whitebox towns, popcorn skies and smeared dirt planes are not 'impressive
> for WebGL' against a 2016 console release — they are a different medium."*

The character work is now genuinely close in places. **The environment is the
gap, and it is a content-volume gap — authored architecture, ground-cover
geometry and cloud form — rather than a shading one.** That is a larger and
different kind of project than this plan was, and it is the honest thing to hand
back rather than a fourth round at the same number.

