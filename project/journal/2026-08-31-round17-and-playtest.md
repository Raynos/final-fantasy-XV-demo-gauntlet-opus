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
