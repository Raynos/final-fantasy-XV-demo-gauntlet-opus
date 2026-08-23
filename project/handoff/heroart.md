# Handoff — `heroart` (four builds, and the portrait that can finally see an eye)

Branch `worktree-agent-ae95c94c3ff458e00`, four commits on top of `main` (merged
current at the start of the session, 248 commits behind). `pnpm run check` is
**11/11**, `anycheck` 0, `creaturecheck` 207 poses.

This lane took the previous one's closing recommendation — *"Party silhouette
variation. Five of nine blind comments this round said the four heroes are one
body reskinned, and nothing else in the round was named that often"* — and it is
done. **The tell is gone from the blind comments: 5 of 9 last round, 0 of 9 this
round.** Read §1 and §2; §5 has two harness findings that will otherwise silently
invert somebody's next round.

---

## 1. The defect, in a number, and what actually caused it

Nothing in the corpus could test "do these four read as four people?". A party
shot puts them at four different depths and lets them occlude each other, and a
per-character follow shot has the same problem the other way — **the first
attempt at this framed Noctis's back while claiming to shoot Gladiolus.**
(Same failure as the previous-previous lane's hand probe. Verify the framing
shows the thing.)

`src/tools/_probe/builds.mts` (new) is the instrument: it teleports the four onto
a line perpendicular to the camera, levels them onto the mean ground height,
faces them all at it, pins them, and takes one frame — same lighting, same lens,
same depth, adjacent pixels. It also reads the silhouette straight off the
**bind-space vertices** of the body and outfit meshes, bucketed by dominant skin
bone, so a claim about proportion is a number rather than an eyeball.

The first version of that measurement was also wrong, and worth recording: a
horizontal slab through a standing figure catches whatever limb is at that
height, so it measured Noctis's **upper arm** and called it his chest — 1.56x too
wide, and it reported the waist as wider than the chest on all four. Bucketing by
dominant bone before banding by height fixed it.

**Inherited state.** Every number is a fraction of that character's own standing
height, so a build that is only *scaled* is identical across the row:

| | noctis | gladio | ignis | prompto | spread |
|---|---|---|---|---|---|
| silhouette width / height | 0.3050 | 0.3204 | 0.3129 | 0.3030 | **5.7%** |
| biceps / waist | 1.728 | 1.732 | 1.775 | 1.704 | **4.2%** |
| chest / waist (V taper) | 1.175 | 1.312 | 1.238 | 1.163 | 12.8% |
| shoulder / hip | 0.847 | 0.897 | 0.857 | 0.851 | 5.9% |
| forearm width | 0.2846 | 0.2907 | 0.2945 | 0.2839 | **3.7%** |

Gladiolus at `muscle` 0.95 and Prompto at 0.42 — nearly the whole width of the
dial that is the entire mass axis — differed in **arm-to-waist ratio by four
percent**, and in forearm girth by under four. They were the same man at two
scales, which is exactly what a judge means by one mesh reskinned.

**Cause, in `Anatomy.ts`.** Every radius carried roughly the same muscle
coefficient — about a fifth of its base over the whole 0..1 range — so turning
the dial inflated the figure uniformly by about a tenth and moved no proportion
at all. It was a size knob wearing a build knob's name.

**Fix.** Mass on a human is not distributed uniformly: chest, deltoid, lat,
trapezius, arm and calf carry nearly all of it and waist, hip, wrist, knee and
ankle carry almost none, which is *why* a heavy man reads as a V and a slight one
as a stick. Every coefficient is now scaled by how much that landmark actually
responds to build — ×1.55–1.8 on chest, arm and the muscle bellies, ×1.8 on legs,
**×0.8 on the waist**, ×1.2–1.4 on the joints — and **every pair is rebased so its
value at the default `muscle` of 0.35 is unchanged to four decimals.** The NPC
cast spans 0.16 to 0.94 and none of them were the problem, so none of them move
for free.

Then the four profiles use the range that now exists. Prompto drops to 0.14 (he
was carrying *more* muscle than Noctis, which is backwards for the character
described as slight); Gladiolus goes to 0.90 with a 1.08 shoulder yoke and a
*narrower* hip than Noctis so the V has something to taper to.

**After:**

| | noctis | gladio | ignis | prompto | spread |
|---|---|---|---|---|---|
| silhouette width / height | 0.3109 | 0.3585 | 0.3200 | 0.2920 | **22.8%** |
| biceps / waist | 1.768 | 2.014 | 1.815 | 1.615 | **24.7%** |
| chest / waist (V taper) | 1.211 | 1.658 | 1.268 | 1.035 | **60.2%** |
| shoulder / hip | 0.897 | 1.168 | 0.974 | 0.800 | **46.0%** |
| shoulder width / height | 0.1834 | 0.2796 | 0.1943 | 0.1539 | **81.7%** |
| height (m) | 1.775 | 2.010 | 1.865 | 1.725 | 16.5% |
| heads tall | 7.12 | 7.75 | 7.29 | 6.95 | 11.5% |

Waist width stays flat by design — **9.0% spread** — because the waist is the
reference the V is read against.

### 1.1 Two things that had to be walked back, both by looking

- **×2.1 on chest and arm and ×1.9 on the deltoid was a caricature.** Two hard
  spheres on the shoulders and a chest 0.70 m across on a 2.01 m man, against a
  plausible 0.39 m on Noctis. The committed factors are what survived the frame.
- **Amplifying the trapezius cut both ways.** Its comment already records why it
  exists — without it the neck is a bare cylinder meeting a flat plate at 90° and
  that step is most of why every neck used to read twice its real length. At
  ×1.55 Prompto's 0.14 muscle got 0.423 of it against 0.448 before, and at 3x his
  neck went straight back to reading as a pipe on a shelf. Trapezius is ×1.35 and
  the nape term ×1.2: still a much bigger Gladiolus yoke, without taking the floor
  out from under the light end.

---

## 2. The blocker: `hero_portrait` can show an eye now

It is not the camera and it is not the groom. `evalIdle` gives thoracic flexion
+0.040/+0.105/+0.125 across the three spine joints and handed the cervical spine
only −0.075/−0.050 back — **46% of it**. Noctis's 0.65 slouch therefore arrived
at the head as 10° of forward pitch before `headDown` contributed anything, and
`headDown` 0.10 added 4 more. Twelve and a half degrees, on a head whose fringe
was measured against the plate to reach the cheekbone.

A real slouch does not work that way: the cervical spine extends to keep the gaze
horizontal. The counter is now **90%** of the thoracic sum, which makes `headDown`
the only thing that decides where the chin points — which is what `Posture.ts`
already documents it as — and Noctis's `headDown` comes down to 0.030 to match.

Gladiolus and Ignis have `slouch: 0` and do not move at all; Prompto's 0.30 lifts
his chin about two degrees.

The portrait now shows his **right eye whole** — iris, lash line, lid crease and
brow — with the fringe across the left. `tmp/shots/m3png/z_eyes.png` is the 5x
crop. **The next lane can grade eyes.** For the record, having finally seen it: a
flat saturated blue disc, no catchlight, no limbal ring, no visible pupil, the
sclera barely present. That is the "doll eyes / painted features" the judge has
named every round, and it is now visible instead of hypothetical.

---

## 3. The blind round, with its control

Thirteen pairs to one fresh judge in one shuffled set: **nine real pairs** (all
character-framed — `party_formation`, `party_walk`, `hero_full`, `hero_closeup`,
`hero_portrait`, `hero_profile` and the three companion closeups) and **four
`--control` pairs** in which both panels are shipped plates, drawn from the
character PAIRING rows so the controls match the round's subject. `compare.mts`'s
own canonical question, no added instruction.

- **Real pairs: 9 identified, 0 fooled.** All HIGH.
- **Controls: 4 of 4 refused.** The judge answered "neither — control pair" on
  every one, spontaneously flagged them as controls, and gave LOW confidence on
  the forced picks. The instrument is not saturated; the verdict is signal.

**The body tell is gone.** Last round: *"one shared body mesh reskinned across
the party"*, *"the same body repeated"*, *"five characters sharing one body
mesh"* — in five of nine comments and the single most repeated tell in the round.
This round: **zero of nine.** Nothing in the judge's per-pair notes or in its
ranked summary of recurring tells mentions body, proportion, or repetition.

The judge's own ordering of what now gives us away, in its words:

1. **Hair** — *"an opaque cap or a single alpha-cut shell that visibly detaches
   from the scalp, with hard cutout edges and fringing"*. Present in **every**
   demo panel; it calls this the single strongest signal.
2. **Faces** — *"mannequin masks, features painted into the diffuse texture, no
   eye geometry, no subsurface, often a hard seam where the head meets the neck"*.
3. **Contact shadows / AO** — *"vegetation and props sit on the terrain rather
   than in it"*, character shadows as single soft blobs.
4. **Vegetation authoring** — spherical canopies with no branch structure, grass
   as identical cross-billboards that stop abruptly with no LOD blend.
5. **Material response** — *"a sword is a grey polygon, a jacket has no weave or
   seams, a boulder is one smeared stretched texture"*; and once, on the
   portrait, *"untextured plastic shoulder armour"* (§4).
6. **Ground texturing** — visible tiling and UV stretching on slopes.

Unprompted closing note: *"the composition and lighting of the demo panels are
often decent — colour grading, sun angle and camp layout read as plausible FFXV.
What gives it away is always asset-level fidelity."*

Round artefacts: `tmp/ab-real` (9 real, key sealed), `tmp/ab-ctrl` (30 control
pairs, 4 used), `tmp/ab-round` (the shuffled set the judge saw),
`tmp/ab-round-MAP.json` (maps back — **its shot *labels* for pairs 02, 07 and 11
are wrong**; the `pair → ab-NN` mapping is right and is what the reveal used).

---

## 4. The one named tell that was in my directory: leather

"Untextured plastic shoulder armour" on `hero_portrait`, and widening `muscle`
made the thing it names bigger. Two causes, both measured on `gladio_closeup`
over a leather-only rect, `0.4594 0.3667 0.5188 0.4667` — **verified by cropping
it and looking before trusting it; the first rect I picked was a third bare
forearm and its p99 was skin.**

| | p50 | p99 | Y p99.5 |
|---|---|---|---|
| plate, §12.4 Gladiolus leather, warm key | `#6f3b0f` Y 67 | `#fda050` Y 179 | — |
| ours, `rough` 0.40 | `#352f35` Y 49 | `#e9dbc8` Y 238 | **238** |
| ours, `rough` 0.62 | `#383236` Y 52 | `#a29388` Y 158 | **158** |

§12.4 is explicit that FFXV leather is high-roughness with a low specular
intensity — *"not a mirror hit, a broad dim sheen"* — and that black leather in
full sun tops out at Y 80 and Gladiolus's warm-key jacket at Y 179. Ours reached
238 in a small hard-edged near-white ellipse. At 0.62 the peak lands *inside* the
plate's instead of 59 levels past it.

And the shell had no creases **by construction**: `sleeve`'s wrinkle field ramps
in over `smooth(t)` of the sleeve's own parameter, and Gladiolus's sleeve stops at
`u1` 0.40 — so the entire garment lived in the flat part of the ramp. Full
amplitude by a third of the way down now, plus a gather at whatever hem the
sleeve actually has.

---

## 5. Measured negatives and harness findings — do not re-derive these

- **`compare.mts --reveal` takes the opposite convention to the one a judge
  reports.** The question the tool prints asks the judge to say *which is which*,
  and a judge naturally answers with the **demo** side; `--answers` is scored as
  the **shipped-game** side. Feeding it the judge's own words scored this round
  as **9 fooled, 0 identified** — a perfect win that was a perfect loss. Nothing
  in the printed hand-off line says which. Whoever owns `src/tools/compare.mts`:
  either state it in the hand-off line or accept both.
- **`--control` emits 30 pairs and some are byte-identical.** Different PAIRING
  rows share the same two plates (`hero_closeup` and `hero_portrait` both use
  `character-noctis-face-01` + `character-ignis-face-01`), so the composites
  collide. The judge caught two of my four controls as the same file by MD5 and
  said so. Dedupe by plate pair, not by row.
- **`dims.ankleY` is computed and never read by anything**, and `legScale`
  therefore moves the foot vertically with no grounding compensation:
  `ankY = s(0.925 − 0.837·legScale)`, so Ignis's inherited `legScale: 1.03` puts
  his ankle ~2.7 cm below where Noctis's sits relative to the root. The clean fix
  is `hipY = Y(0.925) + 0.837·s·(legScale − 1)`, which holds `ankY` constant and
  turns `legScale` into a real leg-length-versus-torso knob — **but the torso
  sweep is authored at fixed absolute `y()` values that do not follow `hipY`**, so
  raising the hip bone would move the thigh tops through an unmoved pelvis mesh.
  Not attempted. It is the §12.6 leg/torso-split axis and it is a real piece of
  work, not a one-liner.
- **The cast is 6.95–7.75 heads; §12.6 measures shipped FFXV at ~9** (true head,
  hair excluded). Untouched: closing that is a ~20% head reduction which would
  shrink the face in `hero_portrait` and undo a lot of graded face work. Worth
  doing deliberately, with the face lane, not as a side effect.
- **Gladiolus's leather is still 94 levels short on chroma** — p50 R−B +2 against
  the plate's +96. That is albedo, not roughness: his jacket is authored charcoal
  `0x312d2d` and the plate's is brown leather. Recorded, not chased.
- **Posture was already well differentiated and is not the problem.**
  `stanceW` spans 0.78 to 1.55, `fidget` 0.5 to 1.6, `slouch` 0 to 0.65. It reads
  in the lineup. The mass did not.

---

## 6. My honest grade against shipped FFXV

Against a 2016 PS4 frame, not against last round.

| | grade | why |
|---|---|---|
| **Party silhouette variation** | **6.5/10** (from 4/10) | Four builds that measure as four builds: width-over-height spread 5.7% → 22.8%, arm-to-waist 4.2% → 24.7%, V taper 12.8% → 60.2%, and the blind judge stopped saying it. Against the plate `party-four-casual-01.jpg` it is still short in two ways. Gladiolus's arms in that frame are thicker than Prompto's *torso* and his forearm alone matches Prompto's upper arm; mine is a strong build, not that. And all four of ours still share one shoulder *slope* — FFXV's four all have a sloped trapezius-to-deltoid line where ours steps out horizontally and then drops. |
| **Portrait framing** | **unblocked, not graded** | It shows an eye. That is the whole claim. |
| **Eyes** | **3/10**, first grade this project has been able to give | Now visible: a flat saturated blue disc, no catchlight, no limbal ring, no visible pupil, sclera barely present. The judge's "doll eyes" is accurate and it is the single cheapest remaining character win. |
| **Leather / cloth specular** | **5/10** (from 4) | The mirror hit is gone and the peak is inside §12.4's range. Diffuse chroma is still nearly neutral where the plate's is strongly warm, and the sleeve is still smoother than any garment in any plate. |
| **Hair** | **untouched, and now the loudest tell by the judge's own ordering** | Named in *every* demo panel this round. See §7. |

---

## 7. What I would do next, in order

1. **Hair.** The judge names it in every single panel and describes it precisely:
   *"an opaque cap or a single alpha-cut shell that visibly detaches from the
   scalp, with hard cutout edges and fringing"*. That is two checkable geometry
   claims — a detachment at the scalp and a hard alpha edge — and the previous
   lane found and floored one such inversion already (its §2.2). This is the
   biggest single item left in `src/characters/`.
2. **The eyes**, now that a frame exists that shows one. Catchlight, limbal ring,
   a real pupil, and some sclera. §3's ranked list puts faces second and eyes are
   the named component.
3. **The shoulder slope** (§6). All four step out horizontally at the yoke and
   then drop; FFXV slopes from C7 to the acromion on every character. It is one
   term in `torsoShape`'s trapezius and one in `jacket`'s `offset`.
4. **Gladiolus's arm mass against `party-four-casual-01.jpg`**, which is more than
   the current 0.90 `muscle` gives — but only after the shoulder slope, because
   more mass on a horizontal yoke is what produced the caricature the first time.
5. The §12.6 head-count and leg/torso split (§5), deliberately and with the face
   lane.

---

## 8. Shot directories

| dir | what |
|---|---|
| `tmp/shots/base0` | the inherited corpus shots, JPEG |
| `tmp/shots/b_before` | the lineup probe on the inherited cast |
| `tmp/shots/b_m1` | the ×2.1 caricature, kept as the negative |
| `tmp/shots/b_m2`, `b_m3`, `b_final` | the committed state, with `z_gladio` / `z_prompto` 3x crops |
| `tmp/shots/_BEFORE.png`, `_AFTER.png` | **the deliverable** — the four builds side by side at 2x, identical rect, before and after |
| `tmp/shots/m3`, `m3png` | the portrait after the head-pitch fix; `m3png/z_eyes.png` is the 5x eye crop |
| `tmp/shots/m4` | Gladiolus after the leather roughness change, with `z_sleeve` |
| `tmp/shots/round_after` | the nine character shots the blind round was built from |
| `tmp/ab-real`, `tmp/ab-ctrl`, `tmp/ab-round`, `tmp/ab-round-MAP.json` | §3's round |

## 9. Tools added

- **`src/tools/lineup.mts`** — glues the same crop rect out of several captures
  into one strip with a rule between panels. Exists because a contact sheet pages
  the four apart and a party shot puts them at four different depths: in both,
  the only honest comparison (same framing, same scale, adjacent pixels) is the
  one you cannot make.
- **`src/tools/_probe/builds.mts`** — the lineup framing plus the bind-space
  silhouette table of §1. Run it before and after any change to `Anatomy.ts`,
  `Skeleton.ts` or a `profile`; the spreads in §1 are the regression baseline.

## 10. Cross-boundary

1. **`src/tools/compare.mts`** — the `--reveal` answer convention (§5) and the
   duplicate `--control` composites (§5). The first one silently inverts a round.
2. Everything the previous lane recorded in its §8 is still open and still not in
   `src/characters/`: GTAO and contact shadow double-pricing the same cavity, the
   contact pass's dither not converging on an animated character, and
   auto-exposure clipping the face on the portrait framing.
3. **`src/tools/_probe/hands.mts` is still wrong** — carried forward from two
   lanes ago, its `_hand` framing still does not show the dorsum.
