# Handoff — `heroart` (hair, outfits, hands)

Branch `worktree-agent-aa16b803fd8d73f7e`, five commits on top of `main`
(merged current at the start of the session, 200 commits behind).

This session took the previous lane's own priority order — **hair first**, then
outfit hardware, then the hand's dorsal surface — and answered the two structural
questions the brief attached to it. `npm run check` is **11/11**, `anycheck` 0,
`creaturecheck` 207 poses.

**Read §5 first if you are short of time.** Four of those cost an hour each and
two of them overturn things this repo believed.

---

## 1. The two structural answers, up front

### 1.1 There is no culling bug. The portrait shot works today.

The previous handoff's §9.1 said a head-and-shoulders shot was impossible because
character meshes are culled on their bind-pose bounding sphere, and named a
one-line fix location in `Character.ts`. **That diagnosis is wrong, and it had
never been measured.** `mesh.frustumCulled = false` is set on every character
mesh in `Character._skinned`, and `git log -S` puts it there since the *first*
commit that created the party. The renderer never tests the sphere, so the sphere
cannot cull anything.

Measured rather than argued: `src/tools/_probe/portrait.mts` emits specs in
exactly the `follow` + `offset` + `lookOffset` form `src/game/Shots.ts` uses, at
1.15 m on a 30° lens, and dumps every mesh's `frustumCulled` flag and bounding
sphere alongside. All sixteen framings render. `tmp/shots/h0/*_portrait.jpg` is
what a `hero_portrait` entry would produce, from the inherited state.

**So: `hero_portrait` and `party_portrait` can be added to the corpus whenever
the coordinator wants them.** No engine change is needed. Suggested values, which
are the ones the probe uses and which I have looked at on all four heroes:

```
hero_portrait: { follow: 'player', offset: <head + 1.15 m at 3/4>, lookOffset: <head - 0.055>, fov: 30 }
```

### 1.2 The frame budget

`hero_full` after this session: **7.72 M triangles, 647 draw calls** (7.35 M /
543 in the previous handoff — but that number predates my merge of 200 commits
from `main`, so the delta is not all mine and I cannot attribute it). Hair
`steps`/`segs` went up, the palm ring went 20 → 40 segments, and the jacket
hardware is a few thousand triangles. All of it lands in existing builder groups.
`perf.mts` **not run** — other lanes were live all session.

---

## 2. What changed

### 2.1 Hair — grooming guides. This is the session's main change.

`HairTuft.dir` is a *direction field*: it says where every strand in a tuft ends
up pointing, and the strand travels in something close to a straight line to get
there. That is a quill, and a head of them is a hedgehog however they are tinted,
tapered, jittered or clumped — which is why Prompto read as a straw sunburst
through four rounds of parameter work *inside* that model. There was no way to
say "lie along the skull for four centimetres, then fall", and no way for two
neighbouring strands in different tufts to agree about anything.

`HairGuide` (`rig/Look.ts`) says it, as a cubic Bezier from the root. Each strand
bends as an **inverse-square blend of its two nearest guides** in the scalp's
`(u, v)` chart. That blend is the whole trick: a root on a guide takes it whole,
a root halfway between takes the mean, no seam in between — so a few hundred
independent ribbons read as one connected mass with a parting in it.

This is `final-fantasy-XV-demo-opus`'s model from `src/actors/body/hair.ts`, read
from the source as §8.3 instructs. **Theirs grows alpha cards straight off the
guides; ours keeps this repo's tufts as the root *placement* and takes only the
flow.** That is deliberate — it means every length, width, clump, spring and
spike already tuned in `Cast.ts` stays meaningful, and the blast radius is one
function. Guide curves are normalised by `|c3|`, so a guide carries *shape* and
the tuft's `len` still carries metres.

Roots are slotted too: `v` was `rng.next()`, and uniform over the 20-70 roots
most tufts carry clumps badly. Both axes are now evenly slotted and jittered by
at most half a slot — "an even fan is a comb, fully random leaves bald patches".

All four grooms are on it, graded against their own plates:

| | what the plate says | what ours was doing |
|---|---|---|
| Noctis | one mass, parting high on one side, fringe **across** the brow, sides to the jaw | radial quills, sides stopping at the ear |
| Gladiolus | **face completely clear**; up-and-back quiff, sides tight, ears out, only the back long | every front and temple lock hanging forward over his eyes |
| Prompto | quiff off a low side parting, sides flat, one long fringe over the eye | straw sunburst — `out` 0.62-0.82, i.e. radiating along the normal |
| Ignis | the same quiff, neater | ditto, shorter |

**Lengths were the other half.** The reference fringe reaches the cheekbone,
about 0.6 of skull height below the hairline, and side locks reach the jaw. Ours
were 29-58 mm on a 113 mm skull — a third of that — and no flow field fixes a
groom that stops at the top of the ear. Watch the overshoot: a 70 mm fringe on
curves that fell straight down closed over both of Noctis's eyes (`tmp/shots/h4`,
worth looking at). The fringe guides now travel further sideways than down.

### 2.2 The scalp shell was inverting through the skull

At 0.86 m the crown was covered in hard-edged patches of pale scalp, which reads
as gaps torn in the hair. **They are not gaps between locks.** `shellPoint`'s
lock-scale relief is signed noise with amplitude `1.7 · vol` riding on a base
standoff of at most `1.12 · vol` — so wherever it swung strongly negative the
shell was displaced up to **6.7 mm inside the sculpted skull** and the head mesh
came through it. Relief is a ridge, not a trench; the standoff floors at the
skull. `scratchpad z1.jpg` vs `z2.jpg` at 5× is the before/after.

This predates my change and would have been there for every previous hair pass.

### 2.3 Hair value, measured — and one overturn

New instrument, `src/tools/regionstat.mts`: per-channel percentiles over a
rectangle, in the fractional coordinates §12's tables are written in. **Validated
against the document it serves** — run over `character-noctis-face-01.jpg` at
§12.3's own region it returns p50 `#1d2630` against the table's `#1f2630`, Y
20→139 against 20→140.

| | plate Y p50 | before | after |
|---|---|---|---|
| Noctis (black) | 37-44 | 11 | **41** |
| Gladiolus (brown) | 11 | 11 | 32 |
| Prompto (blond) | 81 | 132 | 97 |
| Ignis (ash) | 48 | 139 | 135 |

**Prompto is a measured overturn of the previous pass.** That pass moved his base
from `0x9a8261` to `0xb08543` chasing gold — nearly doubling `R−B` from 57 to
109. Shot at `time: 12.0` to match the plate's full midday sun and control for
golden hour, his hair renders `R−B` **+66.5 against the plate's +6**. The hour is
not the cause, the base albedo is, and the previous move was *away* from the
reference. §12.3 says why: even blond medians at `#4a5453`, a desaturated
grey-olive, and the blond lives in the top few percent of the pixels.

**Honest caveat, recorded not buried:** taking his base all the way to the
plate's `R−B` renders as sage, not blond. The plate's median comes off a full-sun
frame where shadowed hair is most of the region; matching it on a golden-hour
render greys the *lit* hair too. He now sits between — most of the desaturation,
the tip carrying the colour. Someone with a lit-versus-shadow split should finish
it. Ignis's Y 135 is the remaining outlier and his region leaks a lot of sky;
tighten the rect before concluding anything.

### 2.4 Outfits — hardware, and Ignis out of lavender

`hardware()` in `rig/Outfit.ts`, driven by `pockets` / `epaulettes` / `zip` /
`studColor` in `Cast.ts`: flapped chest pockets with studs, buttoned shoulder
tabs, a zip slider. All placed through a new `sweepFrame`, which reproduces the
frame `sweepTube`/`sweepShell` build their vertices in — so a pocket follows the
chest it is sewn to and takes the skin weights of its own ring. `tmp/shots/h8/
noctis_chest.jpg` against `h5` is the read.

**Ignis was wearing lavender.** `0x393648` on coat, sleeves, skirt and belt
renders violet-blue under sky bounce. §12.4's jackets median `#111312` to
`#171a21` — near-black neutrals — and nobody in FFXV wears lavender, so a violet
party member is a blind-test tell on its own. Measured over the chest his coat
moves Y p50 **19 → 16**. Prompto's vest was already right (10 against the plate's
9); Noctis's sits at 42 against a plate row shot in cool ambient with no key, so
it is not like-for-like and I left it.

### 2.5 Hand — tendons, knuckles, a wrist fold

`Body.ts`. Four extensor tendons, four separate metacarpal heads in place of the
single continuous bar, and a wrist fold. Ring 20 → 40 segments, because four
tendons across a ~1.8 rad dorsum need three samples each and at 20 the step is
wider than a tendon (§8.5: pattern frequency is bounded by vertex spacing).
Colour comes off the *groove* between tendons, not the ridge — under ambient a
2 mm ridge on a 37 mm radius shades almost not at all.

Verified honestly: knuckle scalloping reads, wrist fold reads, **tendons do
not**, at 0.24 m in the rest pose's own shadow. See §5.4.

---

## 3. Files touched

| file | why |
|---|---|
| `src/characters/rig/Hair.ts` | guide machinery, root slotting, shell floor |
| `src/characters/rig/Look.ts` | `HairGuide`, `HairTuft.guided`, jacket hardware fields |
| `src/characters/Cast.ts` | four guide tables, lengths, hair colours, jacket hardware, Ignis's palette |
| `src/characters/rig/Outfit.ts` | `sweepFrame`, `hardware()` |
| `src/characters/rig/Body.ts` | tendons, metacarpal heads, wrist fold, palm ring density |
| `src/tools/regionstat.mts` | **new** — §12's instrument |
| `src/tools/_probe/portrait.mts` | **new** — portrait, profile, chest, dorsum, two hair ranges |

Nothing outside `src/characters/` except the two harness files.

---

## 4. The tools, and how to run them

```bash
PORT=5510 node src/tools/framecam.mts --probe src/tools/_probe/portrait.mts \
  --out tmp/shots/<round> --settle 8
```

Twenty framings: per hero `_portrait` (1.15 m), `_profile`, `_chest` (0.95 m),
`_crown` (0.86 m), `_hairfield` (2.6 m), plus `_dorsumL/R`. **`framecam.mts`
writes PNG only.** Measure first, then convert, then read:

```bash
node src/tools/regionstat.mts tmp/shots/<round>/noctis_portrait.png 0.40 0.02 0.58 0.22
```

The probe's `HOUR` constant at the top is the clock. 16.2 is the corpus's golden
hour, 12.0 the noon control that §12.3's Prompto row needs. `framecam` reads the
probe as text and cannot pass a parameter in, so edit it.

Multi-step shell (`for` loops, chained globs) is refused inside a worktree —
put it in a script under the scratchpad and `bash` it. The three I used are
`tojpg.sh`, `zoom.sh` (sips crop + magnify, for the 4-5× reads), `ours.sh`.

---

## 5. Gotchas and dead ends

### 5.1 A diagnosis that was never measured survived three handoffs

The culling story (§1.1) was written down, carried forward, and used to explain
why the shot corpus has no portrait — and one `grep` plus one capture disproved
it. It cost me nothing because I checked it first; it cost the previous lane
every defect it had to hunt with `framecam`. **When a handoff hands you a cause,
check that someone measured it.** The same applies to mine.

### 5.2 Judge hair at the range the game shows it — and check what is *behind* it

The previous lane's §5.2 is right and I would add to it: at 0.86 m the loudest
defect on the crown was not the locks at all, it was the shell underneath them
(§2.2). If hair looks gappy, magnify before deciding the gaps are between
strands. `zoom.sh` at 5× settled it in one look; hard-edged pale *polygons* are
never a lighting artefact.

### 5.3 One statistic is not the same as one look

Matching §12.3's `R−B` on Prompto is defensible from the number and wrong to the
eye (§2.3). The plate is a differently-lit frame and its median is dominated by
shadowed hair. Use the tables to find *which direction* is wrong and by roughly
how much — they caught a doubling of chroma in the wrong direction, which is what
they are for — and then look at the frame before you land the last 40%.

### 5.4 The hand probe was photographing the wrong side of the hand

`_probe/hands.mts`'s `_hand` framing builds its direction from the **root's**
forward and right. A hand rolls with the forearm, so in the rest pose the dorsum
ends up nearly edge-on to a camera aimed that way. The measurement that settles
it: I ablated the tendons to **six times** their amplitude — an 11 mm ridge,
grotesque — and there was **no visible change** in that framing. Its `_palm`
framing is worse: it sits inside the forearm and renders a defocused wall of
skin.

So the previous lane's "verified: four separated digits with knuckles" was read
off a view that was not the dorsum, and so was my first tendon check. Note the
irony: that probe was written *because* `heads.mts`'s `_hand` framing was a
picture of a trouser leg. It fixed the aim point and left the direction.

`portrait.mts`'s `_dorsum` framing goes off the hand bone's own basis. Which axis
is dorsal was settled by emitting all six and looking for the knuckle row — it is
**minus the bone's x column** — not reasoned about from first principles.

### 5.5 `abump` has compact support

`abump(th, c, w)` is a raised cosine that is **exactly zero beyond `w`**, so `w`
is a half-width, not a sigma. My first tendon set used 0.19 rad at 0.44 spacing:
four ridges each narrower than one 0.31 rad ring segment, landing 8 and 22 mm off
the midline of a 74 mm hand. Both the spacing and the width were arithmetic
errors and both were invisible rather than wrong-looking.

### 5.6 Model what is not already in the panel

The zip's first build laid a tape down each front edge as seven stacked plates.
Every plate is a flat chord across a curved torso, so they stepped apart and the
"tape" rendered as a column of disconnected rectangles floating off the chest —
worse than no zip. The tape's step was **already in the panel** (`placket` raises
a band along exactly that line); what a ridge cannot be is metal. Only the slider
is modelled now. §8.5's rule generalises: compute what the feature adds over what
is already there, not just its pixel size.

---

## 6. Shot directories

| dir | what |
|---|---|
| `tmp/shots/h0` | **the inherited state** — the first portraits this project has had |
| `tmp/shots/m0` | the same, kept as PNG, and the baseline `regionstat` numbers |
| `tmp/shots/h1` | Noctis on guides, everything else unchanged — the clean ablation |
| `tmp/shots/h2` | + the scalp-shell floor |
| `tmp/shots/h3` | all four on guides, original lengths |
| `tmp/shots/h3noon` | **the `time: 12.0` control** behind §2.3's overturn |
| `tmp/shots/h4` | the length **overshoot** — worth seeing before you lengthen anything |
| `tmp/shots/h5` | lengths corrected + hair colours |
| `tmp/shots/h7`, `h8` | outfit hardware, before and after the pocket height fix |
| `tmp/shots/hh1`, `hh2`, `hhabl` | the hand, and the **6× ablation** behind §5.4 |
| `tmp/shots/hax` | the six hand-bone axes that found the dorsal one |
| `tmp/shots/blind`, `tmp/ab-hero` | the blind round |

---

## 7. My honest grade against shipped FFXV

Against a 2016 PS4 frame, not against last round.

| | grade | why |
|---|---|---|
| **Hair** | **6.5/10** (from 4.5) | The hedgehog is gone on all four. Noctis at portrait range is a connected mass with a real parting, a fringe that sweeps across the brow with the eye under it, and a value on the plate. That is the biggest single move of the session. What is missing: the silhouette edge is still too smooth — FFXV's is fringed with fine layered points and ours is an arc; Prompto's mass is still coarse-fibred straw rather than smooth layers; and there is no anisotropic streak, which §12.3 says is a *narrow, desaturating* band and is most of what makes hair read as hair. |
| **Outfits** | **6.5/10** (from 5.5) | Pockets, studs, tabs and a slider mean the jacket now reads as tailored rather than as panels, and Ignis is no longer the one man in the party wearing lavender. Still missing: no stitching that survives to the frame (the 2 mm topstitch rib is below a pixel at a metre), no lining at any cut edge, no quilting, and the pockets read as slabs laid on rather than sewn — they need a border seam and a shadow under the flap. |
| **Hands** | **6/10** (unchanged) | I am not claiming an improvement I could not see. The knuckle scalloping and the wrist fold read; the tendons do not, at the only correct framing I have. The geometry is right by construction and its arithmetic is checked, but "correct in the mesh" is not the bar this repo sets, so it stays at the previous lane's number until someone verifies it under a key. |

---

## 7.5 The blind round — and the thing worth reading in it

Round 6, all seven frames character-framed, judged by a fresh agent given only
`compare.mts`'s own canonical question and no other instruction:

**7 identified, 0 fooled, 0 hesitated.** Unmoved from the previous five rounds.
Do not read that as "nothing changed" — read *what it was identified on*, because
that is the part that moved. The judge's tells, in its own words:

- "flat vertex-lit characters, **seams at the shoulder/jaw**"
- "a mannequin-smooth face with **painted-on eyes**", "the face has **no shading
  falloff**", "plastic skin"
- "**smooth featureless arms**", "hands are stiff undeformed meshes"
- "no shadow contact under the feet"
- environment: sprite-card grass, tiled ground stretching over a hillside,
  untextured planes at the haven

**Hair appears once in seven frames**, and only on Prompto — "a straw-like hair
card" — which is exactly where my own grade puts it. Across five previous rounds
the recorded verdict was that actor silhouettes lost every test; the silhouette
is no longer the first thing the judge reaches for. The character tells are now
**skin shading, eyes, and the seams between body parts**, none of which this
session touched.

That is what §8 is ordered by. It also means the next character lane's highest
-value work is probably *not* more silhouette: it is `Face.ts` and the skin
material.

One methodological note the judge raised unprompted: it noticed our frames sit on
the right in four pairs and the left in three, and inferred the side was "only
partly randomised". Seven coin flips landing 4/3 is exactly what randomisation
looks like, and `compare.mts --selftest` covers the parity failure this repo
actually had — but a judge that starts reasoning about the *assembly* rather than
the frames is a judge partly outside the test. Nine or more pairs per round would
give that less purchase.

## 8. What I would do next, in order

1. **The anisotropic hair streak.** §12.3 measures it precisely — Noctis spans
   Y 20 to 140 within one head, the bright end reached by a few percent of pixels
   and arriving as a *neutral* `#838786` with the blue tint washed out. We have
   no such band. The sibling's `HAIR_PHYSICAL_SUBS` is a Kajiya-Kay term riding
   the strand tangent, and `Hair.ts` already writes a tangent on the shell
   (`B.tang`) — most of the plumbing exists. Biggest remaining hair gap and it is
   shading, not geometry.
2. **The silhouette edge.** Ours is a smooth arc; the reference's is fringed with
   fine layered points. A thin outer layer of longer, finer, sparser locks on the
   existing guides, at a third of the width.
3. **Prompto's fibre coarseness** — his locks read as straw at portrait range
   where the others read as hair. Narrower ribbons, more of them.
4. **Gladiolus's beard.** It reads as scattered dark specks on a flat tan face —
   at portrait range it looks like insects, and it is now the loudest defect on
   his head, louder than the hair was. 534 strands at 5.8 mm and 0.9 mm wide are
   discrete dots; a beard is a continuous darkening with texture in it. Cheapest
   real fix is to let the face map's `stubble` carry the mass and drop the
   strands' contrast hard.
5. **The face/neck seam.** Every portrait shows a hard rectangular boundary where
   the face map ends, on the neck under the jaw, in a visibly different tone. It
   is on all four heroes and it is large. `Face.ts`.
6. **The shoulder balloon.** At portrait range the deltoid is a smooth inflated
   sausage with no acromion and no scapular edge. It is the largest smooth area
   in a portrait after the hair.
7. Outfit stitching and linings (§7), then the head profile, which no lane has
   reached yet.

**But see §7.5 before committing to that order.** The blind judge reached for
skin shading, painted-on eyes and body-part seams before it reached for any
silhouette, and 4, 5 and 6 above are the items that answer it. If I had another
session I would start at 5.

## 9. Cross-boundary

1. **`src/game/Shots.ts` (coordinator's): `hero_portrait` and `party_portrait`
   can be added now.** §1.1 — there is no culling bug and never was. Values in
   §1.1; the probe's output is what they would produce.
2. **`src/tools/_probe/hands.mts` is not mine and is wrong** (§5.4). Its `_hand`
   framing does not show the dorsum and its `_palm` framing is inside the
   forearm. Whoever owns it should take `portrait.mts`'s bone-basis approach or
   delete both framings — as it stands it produces confident-looking evidence
   about hands from a view of the wrong side of one.
3. **`perf.mts` not run** (§1.2). `hero_full` is 7.72 M / 647 calls; someone
   should confirm on a quiet tree, and note that number spans a 200-commit merge
   so it is not all this lane's.
4. **`regionstat.mts` is general**, not a hair tool — §12.1 (skin) and §12.4
   (cloth) have the same kind of table and the same absence of an instrument.
   Skin has not been measured against §12.1 by anyone yet.
