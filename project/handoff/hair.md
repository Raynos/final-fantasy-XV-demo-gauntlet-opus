# Handoff — `hair` lane: cards, not quills

Owns `src/characters/**`. Started from `project/handoff/head.md` §5.1, which
rebuilt the head, declared the groom *"the loudest wrong thing in the frame"*,
and left the pixel arithmetic that decides the job. Plan §8.3, §8.5.

Commits on `main`: `dfad601` (cards), `0629fe6` (halo, wisps, the strand map),
`2d80a26` (brows), `519a1e4` (hands), `92e8373` (the cutout narrows and
wanders), `d799537` (Gladiolus' beard + the ablation that justifies it).

**Gates: 16/16 on `pnpm run check`, run after the card work and again at the
end.** `creaturecheck` 207 poses, `combatloop` 31/31, `silhouette` 42 meshes,
`geocheck`, `floatcheck` all PASS.

**Budget: zero new draw calls, 16% fewer triangles.** `hero_portrait` /
`hero_full` / `hero_face` / `poi_haven` = **595 / 692 / 594 / 638** calls against
a cap of 800 — identical to the pre-change numbers, because the cards are the
same mesh on the same material. Triangles 9.64 M → **8.06 M** at
`hero_portrait` and 9.75 M → **8.17 M** at `hero_full`
(`tmp/shots/head-r1p/manifest.json` against `tmp/shots/hair-r5/manifest.json`).
**The cards are cheaper than the tubes they replaced.**

---

## 1. The arithmetic, which is the whole design (§8.5)

Every number below was computed before the thing it describes was built. The
head lane's scales: **1.9 px/mm at `hero_portrait`**, **0.24 px/mm at
`hero_full`**.

| feature | mm | portrait | `hero_full` |
|---|---|---|---|
| **the old lock (opaque tube)** | **1.1–2.1** | **2–4 px** | **0.3–0.5 px** |
| card width | 12–18 | 23–34 px | 2.9–4.3 px |
| card depth (`CARD_ROUND` 0.28) | 3.4–5.0 | 6.5–9.6 px | 0.8–1.2 px |
| filament, in the alpha map | 1.3–2.5 | 2.5–4.7 px | 0.3–0.6 px |
| tip taper (last third of 85 mm) | 28 | 53 px | 6.8 px |
| root value ramp (first 35%) | 30 | 57 px | 7.2 px |
| halo flyaway, before → after | 1.7 → 6 | 3.2 → 11 px | 0.4 → 1.4 px |
| hairline wisp, before → after | 1.3–2.7 → 3.5 | 2.4–5 → 6.6 px | 0.3 → 0.8 px |
| brow "hair", before → after | 11–14 → 4.8 | 21–27 → 9 px | — |
| finger tip travel, new rest pose | 30 | — | 7.2 px |
| finger adduction, new rest pose | 16 | — | 3.8 px |

The first row is the entire reason this lane exists: **sub-pixel opaque geometry
can only shimmer; sub-pixel texture filters.** Nothing here is built under ~2 px
except the filaments, and those are in a mipmapped alpha map on purpose.

## 2. What was built

### 2.1 `emitCard` in `Hair.ts`, and why it is not `ribbon()`

`ribbon` samples its cross-section at uniform **angle**. On a section five times
wider than it is deep that bunches samples at the two edges and makes `u`
non-linear across the face — and `u` is exactly the coordinate a strand cutout
has to be uniform in. `emitCard` is parameterised across the **width**, its
section is rounded to `CARD_ROUND` = 0.28 of the half-width so the specular is a
band and not a plate, it tapers over the last third, and it carries
mean-preserving edge and root darkening in the vertex colours (`CREST_MEAN` and
`hMean` are the two means being preserved — §8.3 is specific that the sibling's
first build *lost the luminance variance*, so the spread is added and the mean
is subtracted back out).

Every card runs the method lane's **`assertCardOrientation`**, expected
handedness `+1`, on its own first triangle via a three-vertex stub. It is
transpose- and mirror-sensitive, which is the point — `ribbon()` in `Geo.ts` was
wound backwards for months behind `DoubleSide`. The assert **catches and
`console.error`s**: an assert inside `init()` hangs the boot rather than failing
it.

### 2.2 One material, therefore no new draw call — `hairCutTexture`

This is the part that took the design work. The scalp shell, the halo, the
wisps and the brows share `hairMaterial()` with the cards, and a second material
costs a draw plus three shadow cascades **per character**. So the cutout is
separated by **uv band**, using three.js's per-map uv transform
(`alphaMapTransform`, r152+):

| emitter | `v` | sampled row (`v * 0.5 + 1`, ClampToEdge) | alpha |
|---|---|---|---|
| cards | `-2 … -1` (tip … root) | 0.0 … 0.5 | the cutout |
| everything else | `0 … 3.2` | ≥ 1, clamped | 1 |

`map` (`hairStripe`) keeps `repeat = (1, 1)` and Repeat wrapping, so the shell
samples exactly what it sampled before and a card at `v = -2 … -1` wraps onto
the same `0 … 1` the old locks used. **Nothing outside `Materials.ts` had to
move.** Card `u` is `variant/4 + s/4`, which is also why `hairStripe`'s `fil`
term lands as one lit crest per card.

`alphaTest` 0.35, not `transparent`: alpha-blended hair needs per-lock sorting,
and `WebGLShadowMap.getDepthMaterial` copies `map`/`alphaMap`/`alphaTest` onto
the depth material, so **the cutout is in the shadow map too**. A solid card
shadow on the forehead would be worse than a solid card.

Measured body coverage **0.53** against `alphaTest` 0.35: the body of every card
survives to the coarsest mip (a lock reads as one solid 3–4 px filament at
`hero_full`, which is right) while the tips, where coverage ramps through 0.35,
shorten and soften with distance, which is also right. The opaque band is half
the texture, so even the 1×1 mip averages ~0.8 and the shell cannot punch a hole
in itself.

### 2.3 Card count, from coverage rather than taste

A scalp is roughly a 95 mm hemisphere, ~57 000 mm²; a 15 × 85 mm card is
1 275 mm². Two layers is ~150 cards, three is ~220. `cardDensity` is a *fraction
of the authored root count* (0.30) rather than a new number per tuft, so every
style's fringe/crown/nape distribution stays exactly as `Cast.ts` wrote it:

| | scalp roots | cards |
|---|---|---|
| Noctis | 872 | **262** |
| Gladiolus | 738 | 221 |
| Ignis | 620 | 186 |
| Prompto | 716 | 215 |

Replacing 2 200–2 600 tubes each.

### 2.4 The three rounds after the first, each measured off a frame

- **`hair-r1`: the halo flyaways became the loudest quills.** 1.7 mm opaque
  tubes, 380 of them. Invisible as a defect while the mass around them was also
  needles. Now 6 mm cards, 96 of them, standoff tail 3.6× → 1.9× the shell
  thickness. The hairline wisps had the same defect one scale down and are 3.5
  mm cards.
- **`hair-r1`: `hairStripe` was weaving.** `along` ran `simplex(u*8, v*26)` — 26
  cycles along the strand against 8 across. On a 2.5 mm tube neither was
  visible; on a 15 mm card it is a bar every 3.3 mm running *across* the lock,
  and it is why the crown read as wicker. Swapped to 22 across / 7 along.
  `fil`'s phase noise was 2.2 rad against a period of π/2, i.e. more than a whole
  period, so half the cards were dark down the middle and lit at the edges.
- **`hair-r3`: a lock is not its own bounding box.** `_p_hair.png` at 2× showed
  straight parallel sides and a dead-straight lengthwise grain — wood shavings.
  Filaments now wander (drift 0.035 → 0.070 plus a lateral wobble, clamped
  inside the card) and **end biased to the middle** — 0.36–0.52 at the card's
  edges against 0.69–0.99 down its centre — so the *cutout* narrows continuously
  and the silhouette is a lock rather than a rectangle with a chamfer.

### 2.5 The brows were nine chevrons

`ribbon`'s `width` is a **half**-width. `bw.width` 0.0055–0.0072 was emitting
nine blades **11–14 mm wide across a brow 12–13 mm long** — each a triangle
wider than it was long, four-sided and flat, overlapping its neighbours. 21–27
px of gold chevron, nine times over: that is what Prompto's brows were. Now
twelve 4.8 mm cards laid along the ridge. `BrowSpec.width` is kept so `Cast.ts`
typechecks and is documented as the trap it was; `cardW` replaces it.

### 2.6 The hands — the second job

The head lane's correction stands: geometry was never missing. What was wrong is
6–12° of knuckle flexion where a relaxed hand carries 20–30, 17–24° at the PIP
where it carries 40–50, and a 12° *divergence* across the four fingers where a
hanging hand converges. `Body.ts`'s `F` table now carries 0.30–0.41 / 0.62–0.80
/ 0.22–0.30 rad and splays of +0.030 → −0.045, and the distal thumb curls palmar
and back toward the index instead of running straight out of the web. These are
the **bind** pose; `Anim` adds 0.26 rad at idle and 0.35 in a combat stance on
top, which is why they stop short of a full relaxed curl.
`tmp/shots/hair-r4p/_handA.png` at 6× against `tmp/shots/head-r1p/_hand.png`.

## 3. Measured negatives — recorded because they are deliverables

- **Deleting Gladiolus' beard geometry is wrong, and §8.5 alone says to do it.**
  A beard strand is 1.26 mm: 2.4 px at portrait, 0.30 px at `hero_full`, and
  `paintFace` already draws a stubble field under it (`look.stubble` 0.88,
  24 000 grains). The obvious call is "delete the geometry, keep the paint".
  Ablated in `tmp/shots/hair-abl/gladio_3q.png`: **with the tufts off he has no
  beard at all** — the painted field is invisible at 0.55 m under this key and
  reads as a slightly warmer jaw. The geometry is load-bearing; the defect is
  *density*. Doubled and de-contrasted in `d799537`
  (`tmp/shots/hair-abl2/_beard.png` against `tmp/shots/hair-r4/_beard.png`).
  Better, not finished — see §5.
- **Kajiya-Kay was not touched**, per the brief: it was measured at 0.897/255,
  under the noise floor, and is shifted along the strand's own normal. Nothing
  here reaches for it.
- **A second material for the cards was designed and rejected on cost** before
  the uv-band scheme was found: one extra draw plus three shadow cascades per
  character, and `poi_haven` already runs 638/800 with four heroes and NPCs in
  frame.

## 4. Frames

| what | where |
|---|---|
| before, the straw broom | `tmp/shots/hair-r0/` |
| cards, first build | `tmp/shots/hair-r1/` |
| + halo/wisps/strand map | `tmp/shots/hair-r2/` |
| + brows, hands | `tmp/shots/hair-r3/`, `tmp/shots/hair-r3c/` |
| **current, the honest picture** | **`tmp/shots/hair-r4/`**, `_n_hair.png` / `_p_hair.png` at 2× |
| judged framings + budget | `tmp/shots/hair-r5/` |
| the hand, 6× | `tmp/shots/hair-r4p/_handA.png` |
| beard ablation pair | `tmp/shots/hair-abl/`, `tmp/shots/hair-abl2/` |

`hair-r4/noctis_3q.png` is the one to look at first: layered black hair with a
real fringe, visible strand structure and a visible ear, against `hair-r0`'s
identical framing.

## 5. What is left, in the order I would take it

1. **Pale hair still reads as straw at 0.55 m.** Prompto and Ignis
   (`hair-r4/_p_hair.png`, `prompto_crown.png`). The cards are coherent and the
   groom is right; the problem is *contrast* — a near-white filament against the
   dark gap behind it, where dark hair hides the same gap. Two candidates, both
   untested: more overlap (`cardDensity` past 0.30, which costs triangles the
   budget has), or lifting the shell's value under pale styles so a gap is not a
   hole. **Note the range**: this is 0.55 m, which is 2.9× closer than
   `hero_portrait`, where the same heads read fine. Do not spend a round on it
   before checking it is visible at a judged framing.
2. **Gladiolus' beard is still separated dashes**, not a field, at 0.55 m. The
   ablation in §3 says the answer is not deletion. The next thing to try is
   beard *cards* at a moustache scale (4–5 mm wide, 6–8 mm long) — the aspect is
   awkward, which is why it was not done here — or a much stronger painted field
   in `paintFace` so the geometry only has to carry the silhouette.
3. **The card variants repeat.** Four layouts cycled in order. At 0.55 m an
   attentive eye can find the repeat; at portrait it cannot. Six or eight
   variants is a one-line change to `CARD_VARIANTS`, but note that
   `hairStripe`'s `fil` term is tuned to four crests per unit of `u` so that one
   crest lands per card — raising the count without raising that breaks the
   alignment.
4. **The tips of cards seen edge-on** still show a thin bright line where the
   rounded section's crest catches the key. Not diagnosed; the first move is an
   ablation of `CARD_ROUND` (set it to 0.05 and see whether the line survives a
   flat card).

## 6. Cross-boundary — requested, not made

- **`src/tools/framecam.mts` (method lane): `--dirty` is still swallowed as the
  candidate-file argument.** Reported by `characters.md` §7 and `head.md` §6 and
  still true at `d799537`. The option loop's final `else opts.file = a` eats
  every harness flag, so `--dirty` and `--build <ref>` both die on
  `ENOENT: …/--dirty`. **Workaround, and it works**: pass an empty specs file
  *last* — `node src/tools/framecam.mts --probe P --out O --settle 8 --dirty
  tmp/hair/empty.json`, where `empty.json` is `[]`. The stray positional is
  overwritten by a path that parses. Both beard ablations above were taken that
  way.
- **`project/LANDMINES.md` "Characters and faces"** should gain: *`ribbon()`'s
  `width` is a half-width, and three separate call sites in `Hair.ts` were
  authored as though it were a full width — the brows were nine blades 11–14 mm
  across a 12 mm brow for that reason alone.*
- **`docs/plans/2026-08-21-fable-procedural-modeling.md` §8.3** can be marked
  DONE: guides, inverse-square blending, `a+b·cos` hairline, slotted roots with
  ≤0.55-slot jitter and tip taper were already built; cards, the round
  cross-section and mean-preserving edge/root darkening landed here.

## 7. Where the pixel rule bit, and where it did not

§8.5 held everywhere it was applied to *geometry*: the halo, the wisps, the
brows, the fingers. It was **wrong once**, on the beard, and the shape of the
error is worth keeping — the rule says what a feature will look like, not
whether something else is already carrying it. `paintFace` was carrying the
stubble on paper and not in the frame, and only the ablation showed that.
