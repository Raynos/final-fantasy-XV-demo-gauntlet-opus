# Handoff — `heroart` (face, skin, and what the portrait shots finally showed)

Branch `worktree-agent-a10798c70cfed7420`, six commits on top of `main` (merged
current at the start of the session, 234 commits behind). `npm run check` is
**11/11**, `anycheck` 0, `creaturecheck` 207 poses.

This lane took the previous one's closing recommendation — *"I'd point them at
`Face.ts` and the skin material rather than more geometry"* — and ran it against
`hero_portrait` and `hero_profile`, which entered the corpus this session and are
the first shipped shots that have ever shown a head at close-up range.

**Read §1 first.** Four of the five findings are overturns, and two of them
overturn things this repo has believed across multiple handoffs. Three of the
five are not in `src/characters/` at all.

---

## 1. The findings, in order of how much they matter

### 1.1 The "jaw seam" is not the face map and is not in `Face.ts`

The previous handoff's §8.5 said: *"The face/neck seam. Every portrait shows a
hard rectangular boundary where the face map ends, on the neck under the jaw, in
a visibly different tone. It is on all four heroes and it is large. `Face.ts`."*

**That is wrong.** It is screen-space ambient occlusion stacking with the
contact-shadow pass. Measured in one frame, same rects, `hero_portrait`:

| | cheek Y p50 | neck Y p50 | neck as % of cheek |
|---|---|---|---|
| shipped | 208 | **87** | 42% |
| `--ablate nogtao` | — | 147 | 71% |
| `--ablate nocontact` | — | 138 | 66% |
| `--ablate nogtao,nocontact` | 209 | **187** | 89% |

The cheek does not move at all (208 → 209); the neck moves by 100 levels. Both
passes independently take roughly half of it, and together they darken skin 22 mm
from the jaw by **2.15x** before the sun's own shadow map is counted. §12.1's
whole point is that FFXV skin never falls below 2.0–3.2x of its lit value across
a *whole face*; ours loses more than that across one jawline.

I also ablated the candidate that is in my lane — `Body.ts` bakes a jaw shadow
into the neck vertices, `B.occlude(0, y(1.545), …, 0.44)` and a second at 0.30.
Setting both to zero moved the neck from Y 87 to Y **90**. Three levels. It is
not the cause, and deleting it would cost the 30 px read its comment defends for
nothing, so it is unchanged.

**Not my files.** `src/engine/postfx/GtaoPass` and `ContactShadowPass` should not
both be pricing the same cavity. Whoever owns them: the fix is that they compose,
not that either is individually wrong.

### 1.2 The contact-shadow pass leaves a 1-pixel screen door on the neck

At 12x the neck under the jaw is a literal checkerboard — alternating lit and
shadowed pixels, 50% duty, hard-edged, with a diagonal boundary across the
throat. `--ablate nocontact` removes it completely; nothing else does.

`ContactShadowPass` jitters its ray start with
`ign(gl_FragCoord.xy + mod(uFrame,8.0)*47.13)` and its own comment says *"Rotating
the dither every frame is what lets TAA average it away."* On static world
geometry it does. On a **character with an idle animation** the history is
reprojected and rejected every frame, so the dither never averages and the
occlusion term stays binary per pixel. That is why this appears on the neck and
essentially nowhere else in the corpus, and why no previous round caught it —
before `hero_portrait` existed, no shot put a character's neck at 1.15 m.

Also not my file. Same owner as §1.1.

### 1.3 The subsurface model was a measured no-op

`Materials.ts` has had a two-term subsurface model for a long time and the blind
judge has called the skin "plastic" for six rounds. Both were true at once:
ablated `sss` to 0 on both skin and face materials, recaptured, and `imgdiff`
puts the **entire block at 0.150/255 mean** over `hero_portrait`, with 0.194% of
pixels past 8/255. `imgdiff`'s noise floor is 1.5–1.9/255.

Cause: the terminator bleed was `exp(-ndl*ndl*11.0)` — a half-width of ~0.25 in
N·L, a band about 15 degrees wide, a few pixels on a face at 1.15 m. The only
term with amplitude could only ever paint a hairline.

Fixed (commit `a45e94f`): band widened to `3.0`, and a wrap-fill term added that
adds light only where `ndl < 0`, so it lifts the shadow side and the terminator
and is identically zero on lit skin.

### 1.4 The ear was inside the skull, on every character, always

`hero_profile` puts the ear on screen. Captured it with `--hide hair` — verifying
the framing showed the thing before judging the thing — and what renders is **two
painted lines and a flat brown oval from the face map, plus one bead of lobe**.
The auricular plate, helix, antihelix and tragus were all submerged.

The arithmetic: `FACE.ear[0]` is 0.0725 against a canonical half-width `HR[0]` of
0.0785. The plate is 0.0080 half-thick centred at 0.97 of the anchor, so its
lateral face sat at 0.0783 — two hundredths of a millimetre *inside* the surface
it stands off. None of it could ever have been visible at any distance.

Fixed (commit `42127a6`): the anchor is now `skinSnap`'s projection of the ear
point onto the sculpted skull plus 6 mm, so it is unconditional against head
width and against future sculpt work. The lobe needed one follow-on — it had been
level with the plate's bottom pole and hung clear as a detached bead once the ear
emerged.

This is the same failure mode the helix comment already recorded one level down
(*"at out=0.055 the rolled rim was inside the plate"*). It recurs because the ear
is placed against a **constant** while the surface under it is a sculpt that
thirty brushes and four `headWidth` values move.

### 1.5 The mouth line was pure black

Measured over a tight mouth rect at a matched noon, against
`character-noctis-face-01.jpg` at the same rect:

| | Y p5 | Y p50 |
|---|---|---|
| plate | **79** | 119 |
| ours (before) | **3** | 78 |
| ours (after) | 14 | 78 |

The shipped mouth never goes below Y 79 anywhere in that rect. Ours bottomed out
at 3 — darker than any pixel in any of §12.1's five face plates, whose deepest
skin is `#4d3a33` (Y 62). One stroke, `rgba(46,18,22,0.95)` at 4 mm wide with
blur 0.6 on a 74 mm face, was the only pure black on the head, so the eye read it
as a hole rather than as lips. Now `rgba(78,42,44,0.72)` at 3.4 mm, blur 1.8.

---

## 2. The measured negatives, recorded as first-class results

**These are the useful half of the session. Do not re-run them.**

- **Skin chroma is correct, and the golden-hour reading that says otherwise is a
  trap.** At `time: 16.2` our face measures R−B **+97**, against §12.1's neutral
  plates at +39…+54. That looks damning and is not: shot at a matched noon it is
  **+56** against the plate's +50, and the two *warm-key* plates in §12.1 sit at
  +118 (Gladiolus) and +173 (Ignis). This is exactly the trap the previous lane
  fell into with Prompto's hair. **Never quote a character colour statistic
  without a matched-hour control.**
- **The wrap fill did not move the lit:shadow ratio.** 3.82x → 3.96x at noon,
  and I am not claiming it did. The reason is worth keeping: p10 inside a
  portrait face rect is *not* N·L shadow — it is the fringe's cast shadow and the
  ambient-occlusion pit of §1.1, and a geometric wrap term cannot reach either.
  What did move is the look; the range problem is real and is §1.1's, not
  `Materials.ts`'s.
- **Baked vertex occlusion on the throat is innocent.** §1.1: three levels.
- **The mouth p50 did not move.** 78 → 78. Only the darkest tenth changed.

---

## 3. The blind round — and the first calibrated one this project has had

Thirteen pairs handed to a fresh judge in one shuffled set: **nine real pairs**
(all character-framed) and **four `--control` pairs** in which both panels are
shipped FFXV plates. Same judge, same session, `compare.mts`'s own canonical
question, no added instruction.

- **Real pairs: 9 identified, 0 fooled.** Every one HIGH confidence.
- **Controls: 4 refused, all LOW confidence.** The judge answered "Neither —
  both look shipped" on all four and *spontaneously flagged them as real-vs-real
  controls* in its notes.

**That is the result that matters.** `--control`'s own doc comment says the
problem it was built for is that a verdict which never moves while the thing it
measures demonstrably improves is *either a real categorical gap or a saturated
instrument, and nothing here can currently tell those apart*. Interleaving the
controls into the same round tells them apart: the judge sits at chance and
hesitates when there is nothing to find, and calls every real pair HIGH. **The
"0 fooled" verdict is signal, not saturation.** Run every future round this way.

The tells, in the judge's own words — and the ordering has changed again:

- **"one shared body mesh reskinned across the party"**, "the same body
  repeated", "five characters sharing one body mesh" — in **five of nine**
  comments, and it is now the single most repeated tell in the round.
- "hair as an opaque low-poly shell with a visible gap at the scalp/neck",
  "a spiky opaque shell floating clear of the scalp"
- "faces with no subsurface", "doll eyes", "painted features"
- "the neck/jaw seam is exposed" (§1.1)
- "untextured flat weapons", "plastic shoulder armour with a stretched decal"
- environment: "grass tuft billboards", "box-geometry camp props", "a single
  glowing quad for the lamp"

Closing note from the judge, unprompted: *"Every correct call in this round was
made on the character panel alone."*

---

## 4. My honest grade against shipped FFXV

Against a 2016 PS4 frame, not against last round.

| | grade | why |
|---|---|---|
| **Skin / face shading** | **5/10** (from 4.5) | The subsurface model now measurably does something and the shadow half of the face is no longer a separate darker object joined to the lit half at a line. But the lit half of the face **clips**: 9.3% of the red channel is at 255 in the shipped `hero_portrait`, against 0% in every plate, and a face with a clipped highlight has no falloff to grade. That is auto-exposure metering on a frame two-thirds filled by a black jacket (`--ablate noexp` removes it entirely), so it is not fixable from `Materials.ts`. |
| **Ear** | **6/10** (from 1/10 — it was not rendering) | A plate standing off the head with a rolled rim over the crown, an inner Y, a concha and a joined lobe. It is still pale and flat-shaded, the concha reads as an oval rather than a bowl, and the tragus does not show. But it is an ear, and for the whole life of this project it has been a decal. |
| **Mouth** | **5/10** (from 4) | No longer a hole. The upper lip still carries almost no value separation from the skin above it, and the lower lip's vermilion is more chromatic than any plate's. |
| **Eyes** | **unchanged, ungraded** | I did not touch them and I will not grade what I did not move. See §5.2 — I could not get a frame that shows both of them. |
| **Party silhouette variation** | **4/10** | Untouched by me and now the loudest thing in the blind round (§3). |

---

## 5. Gotchas

### 5.1 A backtick inside a GLSL comment silently truncates the shader

`Materials.ts` builds its shader injections as template literals. I wrote
`` `imgdiff`'s `` in a comment inside one, which ended the literal — and the
symptom is not an error, it is **every capture hanging for its full timeout**
with `UND_ERR_HEADERS_TIMEOUT` and no useful message. Cost two 300 s timeouts and
a `cleanup --kill` before I ran `npm run typecheck`, which points at the exact
line in under a second. This is precisely the case `CLAUDE.md` says the typechecks
exist for. **Run them before you capture, not before you commit.**

### 5.2 The portrait framing catches Noctis with his head pitched down

In `hero_portrait` the head is pitched far enough forward that the fringe covers
**both** eyes and the frame is largely scalp. That is a pose/timing artefact of
the idle, not the groom — the same character at the probe's own profile framing
has a clear visible eye. Whoever owns `src/game/Shots.ts`: the shot would be
worth a `settle` or a look-target that lifts the chin. As it stands the one shot
in the corpus that exists to show a face cannot show either eye, which is why
this lane graded eyes as untouched rather than guessing.

### 5.3 Ablate the *pass* before you ablate the material

I lost a round of work re-reading `Face.ts` for a face-map seam that turned out
to be two post-process passes (§1.1). The order that would have been faster:
`--ablate` every post stage first, one at a time, and only open the material when
the frame stops changing. `shoot.mts`'s own header says this and it is right.

### 5.4 `regionstat` needs `--skin` for anything in §12.1

Without it a portrait face rect is about a third hair, collar and background, and
the low percentiles are dragged down by tens of levels. New this session, with
§12.1's filter verbatim; validated by reproducing the document's own row on the
plate it was derived from, four hexes within 3/255 and the ratio exact.

---

## 6. Shot directories

| dir | what |
|---|---|
| `tmp/shots/base`, `tmp/shots/m0` | **the inherited state**, JPEG and PNG, with the 5x crops `z_eyes`, `z_jaw`, `z_neck10` |
| `tmp/shots/abl_nocontact`, `abl_nogtao`, `abl_noao`, `abl_c`, `abl_g` | §1.1's attribution, one pass at a time |
| `tmp/shots/abl_noexp` | the auto-exposure ablation behind the clipping finding |
| `tmp/shots/abl_sssref`, `abl_withsss` | §1.3's `imgdiff` pair |
| `tmp/shots/abl_noocc` | §2's baked-occlusion negative |
| `tmp/shots/noon`, `noon1`, `noon2` | the `HOUR = 12.0` controls — before wrap, after wrap, after the mouth |
| `tmp/shots/ear_nohair`, `ear1`, `ear2` | §1.4, before / after / after-with-hair |
| `tmp/shots/blind2`, `tmp/ab-face`, `tmp/ab-ctrl`, `tmp/ab-round` | §3's round; `tmp/ab-round-MAP.json` maps shuffled pairs back |

`src/tools/_probe/portrait.mts`'s `HOUR` is left at 16.2, the corpus hour. Set it
to 12.0 for any §12 colour comparison and set it back.

---

## 7. What I would do next, in order

1. **Party silhouette variation.** Five of nine blind comments this round said
   the four heroes are one body reskinned, and nothing else in the round was
   named that often. This is bigger than any face detail and it is squarely in
   `src/characters/`. Start from §12.6's landmark table — it gives head-to-body,
   shoulder width as a fraction of height, and the leg/torso split, all of which
   should differ per hero and currently barely do.
2. **The eyes**, once §5.2 gives a frame that shows them. The judge has said
   "doll eyes" / "painted features" in every round including this one, and it is
   the one item on the previous lane's list that no lane has yet been able to
   *see*, let alone fix.
3. **Hair as a shell with a gap at the scalp** — the judge named it twice this
   round and it is a specific, checkable geometry claim. The previous lane's §2.2
   found and floored one inversion of that shell; this sounds like a second one at
   the nape rather than the crown.
4. The upper lip's value separation and the lower lip's chroma (§1.5's remainder).
5. The ear's concha as a bowl rather than an oval, and a visible tragus (§4).

---

## 8. Cross-boundary

1. **`src/engine/postfx/` — GTAO and contact shadow double-price the same
   cavity** (§1.1). Measured: each independently accounts for about half of a
   2.15x darkening of neck skin 22 mm from the jaw, in a frame where the cheek
   does not move at all. §12.1 says a *whole* FFXV face spans 2.0–3.2x.
2. **`src/engine/postfx/ContactShadowPass.ts` — its dither does not converge on
   an animated character** (§1.2). Its own comment assumes TAA averages it away;
   TAA rejects the history on a moving skinned mesh, so it renders as a 1-pixel
   screen door on the neck in both shipped portrait shots.
3. **Auto-exposure blows the face out on the new portrait framing.** 9.3% of the
   red channel clipped at 255 on skin in `hero_portrait` (0% in every §12.1
   plate); `--ablate noexp` removes it. The frame is two-thirds black jacket and
   dark hair, so the meter lifts. Worth a metering weight or a shot-level
   exposure clamp.
4. **`src/game/Shots.ts` — `hero_portrait` catches the head pitched down** and
   shows neither eye (§5.2).
5. **`src/tools/compare.mts`** — I added `hero_portrait` and `hero_profile`
   PAIRING rows so they judge against the close-up plates rather than
   `FALLBACK`'s landscape. And **run the controls interleaved into the real
   round from now on** (§3); it is the difference between a verdict and a number.
6. **`src/tools/_probe/hands.mts` is still wrong** — carried forward from the
   previous lane's §5.4, unaddressed, and its `_hand` framing still does not show
   the dorsum.
