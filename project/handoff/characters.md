# Handoff — `characters` (plan §8), overnight procedural-modeling push

Owns `src/characters/**`. Commits on `main`: `13b9a7a`, `16af21a`, `77a8635`,
`a267ab0`, `1567daf`. Probes added under `src/tools/probes/` (the only place
outside my tree I was authorised to write; the method lane owns the rest of
`src/tools/`).

**The headline: every eye in this game has been covered by a lit skin-coloured
lobe, and it is fixed.** That is the "doll eyes / painted-on features / no eye
geometry / mannequin mask" the blind judge has named in every round for months.
The eye assembly underneath — sclera, iris, pupil, limbal ring, catchlight, lash
line, lid crease — was built by two previous lanes and has never once been
visible in a shipped frame.

---

## 1. What is done and verified by eye

### 1.1 The tooling, first, as §8 orders

| probe | what it measures | state |
|---|---|---|
| `src/tools/probes/headprofile.mts` | §8.2's width-vs-height profile bench, on the finished mesh | **works, controls pass** |
| `src/tools/probes/facecam.mts` | face framings at 0.4–0.6 m, `follow` shots, five ablation toggles | **works** |
| `src/tools/probes/bodyprofile.mts` | §9.2-style silhouette separability of the four heroes | **works** |
| `src/tools/probes/headfold.mts` | back-facing head geometry near the globe | **built, and its numbers do not correspond to the defect — see §3** |
| `src/tools/probes/eyeoccluder.mts` | bisects the head's index buffer and photographs each stage | **works, and is what found the answer** |

`headprofile.mts` is the §8.2 port. Its statistic separates a real head from a
smooth ovoid by 5x and from **its own sculpt, ablated** by 2.6x:

| | sagittal relief | features | width-vs-ellipse err |
|---|---|---|---|
| slab | 0.000 | 0 | 0.213 |
| ellipsoid | 0.091 | 3 | 0.016 |
| sphere | 0.097 | 3 | 0.016 |
| noctis, sculpt ablated | 0.172 | 9 | 0.025 |
| noctis / gladio / ignis / prompto | **0.445 / 0.497 / 0.458 / 0.445** | 11 | 0.086–0.099 |

"Sculpt ablated" projects every vertex radially onto its own best-fit ellipsoid
— the ~40 brushes turned off, done on the finished mesh rather than in the
recipe. Its first statistic detrended the sagittal outline against a *line* and
scored a sphere at 0.617 against a head's 0.764, i.e. it was mostly measuring
the skull's arc; a least-squares cubic absorbs any smooth ovoid.

### 1.2 The eye (three commits)

- **`16af21a` — both lower eyelids were wound inside out.** `buildLid` switched
  quad winding on `upper === (sg > 0)`. Mirroring across x reverses handedness,
  so `sg` must switch it and `upper` must not. Measured by `headfold.mts`:
  below the eye centre, **48 of 48** covering triangles, all at 11–14 mm from the
  globe centre, which is the lid band's own radius. Now 13 of 48.
- **`77a8635` — the face material was `DoubleSide`, and that is the actual
  defect.** Setting it `FrontSide` opens every eye on all four heroes with no
  other change. Verified at 0.55 m through `facecam.mts` and again at 0.30 m
  through `eyeoccluder.mts`.
- **`a267ab0` — two backwards-wound parts `DoubleSide` had been hiding.**
  `ribbon()` in `Geo.ts` (ear helix/antihelix/tragus and the eyelash fans, plus
  every hair strand — hair's material is still `DoubleSide`, so nothing moves
  there) and `buildHead`'s chin cap. Both became holes under `FrontSide` and are
  now wound to match the surfaces they join.

**Shots.** `tmp/shots/ch-r1*` inherited, `ch-r3-nohair` after the lid fix,
`ch-r4` after `FrontSide`, `ch-r5` after the winding fixes. `tmp/shots/occ*` is
the index-buffer bisection, `occ3/c-0_all.png` against `occ3/c-1_no_lidband.png`
being the pair that matters. **These directories die with this worktree** —
what they showed is written down here instead.

---

## 2. `LANDMINES.md` is wrong about this defect, and the correction is worth lifting

The entry reads:

> `Character.ts:73` sets `faceMat.side = THREE.DoubleSide`, and a back-facing
> surface renders in front of the eyeball and hides it completely. […] **A
> `FrontSide` test passes while the shipped material still fails**, so verify
> with `DoubleSide` specifically. The fix is to stop the sculpt folding: widen
> the socket brushes toward `[0.048, 0.032, 0.058]` and add `pow: 1.6`.

The first half is right and is what made this findable. **The prescription is
wrong and cost me most of a session.** Measured:

- Widening the socket brushes exactly as prescribed cut the covering area from
  831 mm² to 265 mm² and **changed the rendered frame by nothing.** Reverted.
- Widening them further, and reducing their depth to the ~25 mm the code
  comment claims, made it *worse* (250 mm²) and still changed nothing.
- Widening the brow ridge, the under-brow hollow and the nasion — the next
  steepest brushes, all of them running surface slopes over 0.5 — moved the
  number by 3% and changed nothing.
- `FrontSide` fixes it outright.

The honest replacement entry: *the face material is `DoubleSide`; make it
`FrontSide` and check the ear, the chin cap and the lashes, because
`DoubleSide` has been hiding backwards winding in all three.*

---

## 3. Four instruments that were wrong, so nobody re-derives them

All four are recorded in the probe headers as well. This is the §"Diagnoses that
were wrong" pattern happening live, and it happened four times in one evening on
one defect.

1. **Star-shapedness against the head centre** reported 82% of every head
   inverted. Two faults at once: the winding convention was assumed rather than
   measured, and a sculpted head is legitimately concave in the sockets, the
   occiput tuck and under the jaw, so "the normal points inward" is not "the
   surface has folded".
2. **The aperture-cone test** (`headfold.mts` as it stands) reports 15 skull
   triangles at 725 mm². **Deleting exactly its flagged set punches holes in the
   brow and leaves the eye covered.** Its numbers move when you edit brushes, so
   it looks like a working instrument; it is not measuring the defect. Do not
   quote it without re-checking it against a deletion frame.
3. **A gaze-axis cylinder over the pupil** flagged 5 triangles. Deleting them
   changed nothing.
4. **A camera-to-pupil ray cast returned zero hits** through a visibly blocked
   eye. `ch.head` is a `SkinnedMesh`: its geometry holds **bind-pose** vertices
   and the rendered surface is the bones' doing, so `head.matrixWorld` is the
   wrong frame. Fixing it to `headBone.matrixWorld · boneInverses[head]` still
   returned zero — that one is still unexplained and is a live lead if anyone
   wants the underlying fold rather than the material fix.

What *did* work was deleting triangles and taking a picture: `eyeoccluder.mts`
rebuilds the head's index buffer per stage. That is `--hide` at triangle
granularity, which the harness cannot express, and it is the tool I would reach
for first next time.

---

## 4. Measured negatives — plan premises that are stale

- **§8.2's "our profile collapse comes from sculpting a sphere with fixed-
  direction brushes (`Face.ts` — brush sums, no nasion, no mandible)" is out of
  date.** `Face.ts` has a nasion brush with a paragraph explaining exactly the
  wedge-profile failure it fixes, a mandible ramus, a mandible *body*, a gonial
  angle, mental tubercles and a jaw undercut. The bench agrees: sagittal relief
  0.445–0.497 against 0.172 for the same head with its brushes ablated. **Do not
  rebuild the head.** Neither the SDF/marching-cubes route nor the Catmull–Clark
  cage is justified by anything I measured, and §10 rejects a wholesale
  character-pipeline rebuild for exactly this reason. Read the profile frames in
  `ch-r1/noctis_prof.png`: brow, nasion notch, nose with a real tip and alar
  wings, philtrum, lips, mentolabial crease, chin, jawline. That frame is *fine*.
- **§8.3's "our diagnosed-but-never-built fix" is built.** `Hair.ts` already has
  Bezier grooming guides in skull-radius units, inverse-square blending of the
  two nearest guides, `a + b·cos(longitude)` hairline with a temple drop and an
  ear notch, golden-ratio root slotting with ≤0.55-slot jitter, per-root
  clumping, tip taper, and root/tip darkening. All four heroes carry 8–10 guides
  in `Cast.ts`. §8.3 as written is a description of the code that is there.
  **What is wrong with the hair is not the architecture; see §5.**

---

## 5. What is left, in the order I would do it

### 5.1 The hair still reads as a straw broom, and it is the loudest thing left

Look at `ch-r5/prompto_face.png` and `ch-r1/prompto_crown.png`. The groom
machinery is right and the *output* is a porcupine: ~870 roots × 3 locks, each
1.3–2 mm wide and 80 mm long, individually resolvable at any range, with sky
between them, splaying past the silhouette. From above it is an even radial fan
from a crown point with no partition and no clumps — the thing §8.3 calls "a
comb", produced by machinery that was written specifically to avoid it.

The §8.3 items genuinely **not** present, in value order:

1. **Cards, not filaments.** Every lock is a tube of 4–5 sides. §8.3 and both
   siblings mean an alpha-textured *card* carrying many strands. Ours has no
   alpha at all, which is why the edges are hard.
2. **Do the pixel arithmetic first** (§8.5's universal pre-check, and the one
   piece of method I did not get to). A 1.5 mm lock at 4 m in a 1600 px 50°
   frame is **0.7 px**. Sub-pixel opaque geometry cannot be antialiased and can
   only shimmer. That number alone probably decides the whole design.
3. **Card cross-section slightly round so the specular is a band, not a plate**,
   and **mean-preserving** root/edge darkening. The previous lane found
   Kajiya-Kay measured as 0.897/255 — under the noise floor — and fixed the
   normal it was shifted along, but nobody has measured what it is worth now.
4. **The eyebrows and the stubble are the same generator and both are now
   over-scale**, because they were partly hidden before `FrontSide`. Gladiolus's
   stubble in `ch-r1/gladio_3q.png` is a scatter of individual black sticks
   lying on the cheek like flies; Prompto's eyebrows in `ch-r5/prompto_face.png`
   are gold caterpillars. Both are cheap parameter fixes and both are visible at
   corpus range.

### 5.2 The ear is a flat scoop standing off the head

`ch-r5/ignis_3q.png`. The ridges render now, but the whole assembly reads as a
hard-edged open loop rather than a solid organ. `Face.ts` has three separate
comments about the ear being *submerged* and being pushed back out; it is now
out too far. It is a silhouette element on every profile frame.

### 5.3 The coordinator's four corpus-scale items

Answered where I have a number:

1. **"Gladiolus does not read as Gladiolus."** `bodyprofile.mts`, 24
   height-normalised bands over body+outfit, pairwise mean absolute difference
   as a percentage of mean width:

   | pair | separation |
   |---|---|
   | gladio \| ignis | **26.1%** |
   | gladio \| prompto | **22.8%** |
   | noctis \| gladio | 14.8% |
   | noctis \| ignis | 13.0% |
   | ignis \| prompto | 12.2% |
   | noctis \| prompto | **8.3%** |

   So the hypothesis is half right. Gladiolus *is* separable from the two slight
   builds. He is **not** separable from Noctis — 14.8%, and his
   max-half-width-over-height is 0.206 against Noctis's 0.182, 13% wider
   normalised, for a character the brief calls "huge" next to one it calls
   "slim". And **Noctis and Prompto are one outline at 8.3%**, which is the
   tighter of the two problems and is not the one that was reported.
   Caveat: bind pose, not the posed silhouette, and the arms hang at the sides
   so they dominate the widest bands. `_probe/builds.mts` is the tool for
   landmark ratios; this one is deliberately outline-only.
2. **Hands as mittens** — not attempted. Do §8.5's pixel arithmetic first: at
   the range of `hero_full` a finger is a small number of pixels and the answer
   may be albedo and a cast shadow rather than geometry. `_probe/hands.mts` is
   noted in two previous handoffs as *still framing the wrong side of the hand*.
3. **Outfits plain and unlayered** — not attempted. §8.4's `zone`/`ang`/`rim`
   channels and the three-value-step collar are the plan's answer and nothing in
   them is started.
4. **Faces as dark smears at distance** — the contrast-preserving mip chain is
   still in `Face.ts` (`buildFaceMips`, the function directly under
   `buildLashes`) and I did not touch it. But **`FrontSide` changes what that
   chain is filtering**, because the lash line and the lid crease are now
   actually visible in the base level. Worth re-checking at corpus range; I did
   not.

### 5.4 The rest of §8, untouched

**8.1 geodesic auto-skinning**, **8.4 Fourier cross-sections** (the cheapest
remaining item in the whole section — `r(θ)` cosine terms at zero extra
vertices, which is the direct fix for the faceted forearms and needs no new
tooling), **8.5 creature finishing** and **8.6 detail-dial LOD** are all
untouched. Nothing about them is blocked.

---

## 5.5 Gate status — **NOT clean, and the reason matters**

`pnpm run check` at `a267ab0`: **9 of 16**. Every failure is the identical
`page.waitForFunction: Timeout 300000ms exceeded` or `ECONNRESET`, and every one
of them is a **leased-page** tool. Every tool that does not lease a page passed:

```
build PASS   anycheck PASS   orphans PASS   silhouette PASS   geocheck PASS
hydrocheck PASS   uxcheck PASS   roadcheck PASS   horizoncheck PASS
integration FAIL   creaturecheck FAIL   combatloop FAIL   reachcheck FAIL
floatcheck FAIL    heightcheck FAIL      driftcheck FAIL
```

`node src/tools/daemon.mts --health` reported `uptimeSec` of **6** and then
**13** on two calls a minute apart: the daemon was restarting continuously,
which is what `daemon.mts` does when its `PROTOCOL` changes — i.e. the method
lane was editing it. Eleven consecutive attempts at `combatloop`,
`creaturecheck` and a five-shot corpus capture all died the same way over about
forty minutes.

**So these gates are unverified, not failed, and the next agent must re-run them
before trusting anything here.** I am recording it this way rather than claiming
green because "verified by eye" over an unrun check is the exact failure mode
this project's landmines file is mostly made of.

Two things do argue the change is sound:

- **`geocheck` passed**, and its own summary line names *"DoubleSide material
  hides a flip"* — it is the gate closest to what I changed and it is green.
- **`silhouette` passed**: no new collapsed silhouettes across 42 meshes in 8
  families, which covers the enemy tree that shares `Character.ts`.

The specific risk to re-check is `creaturecheck`'s 207 poses, because
`EnemyBase`/`Sculpt` were not audited for `ribbon()` consumers, and — separately
— because the coordinator landed `src/world/terrain/**` (`BAKE_VERSION` 3 → 4,
drainage channels, talus skirts) tonight, so **grounding numbers taken before
`b93b41f` are against different ground and must be re-measured, not
reconciled.**

---

## 6. Open questions

- **Where is the fold?** `FrontSide` treats the symptom. Something in the head
  mesh near the orbit is wound inward and I did not find it in four attempts.
  The lead I would follow: the camera-to-pupil ray cast in §3.4, done correctly
  in skinned world space by reading `ch.head`'s posed vertices out of the GPU
  skinning path rather than reconstructing the bind transform by hand.
- **Is `FrontSide` safe on the NPC cast and the enemies?** `Character.ts` is
  shared with `NpcCast`; enemies use `EnemyBase`/`Sculpt`, which I did not
  audit for `ribbon()` consumers. `pnpm run check` was running when I stopped —
  **read its result before trusting this**.
- **The lower-lid winding fix (`16af21a`) is now partly redundant** under
  `FrontSide`, but it is still correct and still matters for shadow casting
  (`shadowSide = BackSide`). Leave it.

---

## 7. Cross-boundary — requested, not made

- **`src/tools/framecam.mts` (method lane): `--dirty` is swallowed as the
  candidate-file argument.** Its option loop has no case for it, so
  `framecam.mts --dirty file.json` works only because the later positional wins,
  and `framecam.mts file.json --dirty` sets `opts.file = '--dirty'` and dies on
  ENOENT. One `else if` fixes it.
- **`src/tools/probe.mts` cannot resolve a bare `import('three')`** from an
  eval'd probe body against the vite dev server. Borrowing constructors off live
  objects works and is what `eyeoccluder.mts` does; worth a line in
  `src/tools/README.md`.
- **`LANDMINES.md` "Characters and faces"**: the socket-brush prescription
  should be replaced per §2 above when this merges.
- The shared **dirty** tree was unusable for long stretches tonight — three
  separate `--dirty` runs died on another lane's in-flight `Terrain.lateUpdate`
  and one on an HMR reload mid-capture. Anything visual here was taken against a
  committed build for that reason.
