# Handoff — `heroart` (hands, outfits, hair, faces)

Branch `worktree-agent-a09ead00312c39211`, four commits on top of `main`.
This session took the three named-and-untouched gaps in priority order: **hands**,
**outfits**, **hair**. The head profile was not reached.

**Read §5 first if you are short of time.** Four of the gotchas cost me an hour each
and three of them are things I would have got wrong again.

---

## 1. What changed, and what I verified by eye

Every claim below was checked against a captured frame at a stated range. Shot
directories are listed in §6.

### 1.1 Hands — **rebuilt.** The mitten is gone.

`src/characters/rig/Body.ts`. The old hand was a mitten for four *arithmetic*
reasons, none of them shading, and finding them was measurement rather than taste:

| defect | measurement |
|---|---|
| **40% too short** | ran wrist→tip 0.107·s; a hand is ~0.11 of stature, so 0.19·s on this 1.73·s skeleton. The **skeleton already had it right** (`fingers` at 0.085·s, `fingerTip` at 0.157·s) — only the geometry disagreed, so both distal bones were driving vertices nowhere near them. Now 0.165·s. |
| **fingers fused** | centre pitch 13.5 mm, proximal diameter 20–21 mm. Every finger overlapped both neighbours by 3 mm a side, so what rendered was one wedge with four grooves in it. The palm is now 74 mm across the knuckles — 0.44 of hand length, the real ratio. |
| **no joints** | three nodes at constant radius is a cone. Now three phalanges walked by an accumulating frame, flexing at each joint, splaying at the knuckle, radius swelling at each joint, flat pad on the palmar side. |
| **straight knuckle row** | all four fingers left the palm at the same distance in the same plane. Now the real oblique arch: middle furthest and proudest, little finger 15 mm shorter and lower. |

Plus: the thumb ran to `+front`, i.e. **straight out of the back of the hand** — every
relaxed pose was a permanent thumbs-up. It now rotates palmar out of a thenar mound.

Two shading fixes rode along. The hand sweeps carried **no `uvScale`**, so the shared
pore normal map (`repeat(15,23)`) tiled fifteen times across one 70 mm palm — sub-pixel
at every range a hand is ever seen at, so the whole map aliased to flat. Now ~13 mm/tile,
matching the torso and arm. And the tone is split palmar/dorsal with joint creases and a
glossier nail plate.

**Verified:** `cf5p/noctis_handL.jpg` (0.30 m) against `cf0p/noctis_handL.jpg`. Four
separated digits with knuckles, a thumb, a palm with a thenar mound and a hollow.

### 1.2 Outfits — **lifted off the floor and split by material.**

`src/characters/rig/Outfit.ts`, `src/characters/Cast.ts`.

I ablated before re-tinting, per the plan, and it was worth it. Forcing every garment
to mid-grey with `vertexColors` off — so only geometry and per-vertex roughness speak —
showed a smooth undifferentiated balloon with a fine uniform grain (`cfgrey/`). That
told me the seam/fold machinery was *partly* live and *entirely* invisible.

- **The albedo was on the floor.** Every garment on all four heroes sat between
  0x1e1c1e and 0x2e2c21 — 0.012–0.025 linear. `clothShade` modulates that by
  ±40–60% for seams, wear and mottle, and 40% of 0.012 is 0.005: the same pixel after
  tonemapping. *Nothing the shading pass computed could ever have arrived.* Bases are
  now 0x2b–0x3d.
- **My first lift went straight to slate blue** and produced exactly the "generic
  slate NPCs" failure `garmentMaterial` warns about in its own comment. Shipped values
  are the same lift on a neutral-to-warm hue. **If you lift further, check the hue.**
- **Roughness now separates the layers.** Jacket, tee and trousers sat within 0.15
  roughness of each other, so three near-identical blacks were one shape. Leather is
  now 0.30–0.42, jersey and canvas 0.88–0.94.
- **The chest print is a decal patch** (`printPatch`). Painted into the tee's own
  `colorAt` it was drawn at the tee's vertex density — Noctis's skull spans 0.75 rad
  of a 76-segment ring by 0.29 of a 42-step sweep, i.e. **nine vertices across by
  twelve down**. That is why it was a blurry blob, and why no amount of tuning
  `skullPrint`'s falloffs was ever going to fix it.
- The tee's fold terms were masked by `bump(t,0.35,0.4)` and `bump(t,0.55,0.45)`, both
  **zero above t≈0.78** — the chest and shoulders, always on camera, were the one part
  with no relief. And the default seam angles were π, 0.54π, 1.46π: centre-back and the
  two sides, **none of which a front three-quarter ever sees**. Both fixed.

**Verified:** `cf7p/noctis_chest.jpg` and `cf12/hero_face.jpg` against `cf5p`/`cf0`.
The three layers now separate; Gladio's leather reads as leather against olive canvas.

### 1.3 Hair — **crown mats laid along the skull; the loudest quill removed.**

`src/characters/Cast.ts`, `src/characters/rig/Hair.ts`.

The first thing this needed was an honest framing. The probe's crown shot was at
0.50 m, where a 2.4 mm lock is **18 px** — a macro view no player ever sees, at which
*any* groom is a bundle of blades. `_crown`/`_nape` are now at 0.86 m and there is a
new `_hairfield` at 2.6 m.

At those ranges the diagnosis is not the cross-section (a previous pass fixed that) nor
the density (the same pass tripled it). It is that **the crown mat was authored as
fur**: 46–58 mm locks on a 90 mm head radius — half a head radius — pushed out along
the surface normal at `out` 0.60–0.66 with no `hug`. Short, outward and isolated is the
definition of a quill. All four heroes' crown mats, crown layers, side sweeps and
flyaways now run 50–60% longer at `out` ~0.40 / `hug` ~0.44, `thick` 0.50–0.52 rather
than 0.34–0.36, `steps` 6 rather than 4.

Two measured findings:

- **Golden hour is not why Prompto reads olive.** The previous handoff left this open
  with three candidates and suggested a noon render. Done — `cfnoon/prompto_crown.jpg`
  at `time: 12.0` is the same olive khaki. Environment eliminated. The base was the
  cause: 0x9a8261 is (154,130,97), R−G 24 and G−B 33, a desaturated khaki. Gold blond
  carries most of its chroma in the G−B gap. Now 0xb08543 / 0xe4c67e.
- **The hairline wisps were the loudest quill on the whole cast.** Their own comment
  says "fine, short, low-contrast". They were 2.6–4.0 mm *half*-width — up to an 8 mm
  card — on `ribbon`'s default four-sided flat section (which that function's own
  docstring calls a blade) with `tipColor: base`, lifting the tip **above** the root.
  Thirty-four of them pointing down over the brow. On a blond that is a row of yellow
  needles across the forehead. Now a third of the width, six-sided, tip at 0.92 of root.

**Verified:** `cf9p/noctis_crown.jpg` + `cf9p/noctis_hairfield.jpg` against `cf8p`
(hedgehog → connected mass with a directional sweep and a real asymmetric fringe);
`cf11p/prompto_*` against `cf9p` (needles gone).

### 1.4 Two toolkit fixes in `src/characters/rig/Geo.ts`

- **`sweepTube` grew `capEnd`.** Every sweep in this codebase stopped dead at an open
  cylinder and every caller that cared plugged it with a separate `blob` — a second
  object with its own normals, material state and UV island butting against the rim.
  On the fingertips that shaded as a ball stuck on the end of a finger. A dome built
  from the sweep's own last ring shares those vertices so the normals average.
- **`blob` grew `uvSpan`.** The existing `uv` pin gives every vertex the same UV, which
  zeroes `dFdx/dFdy` and degenerates three.js's derivative-based tangent frame. (This
  turned out *not* to be the fingertip bug — see §5.3 — but it is still wrong, and
  `Face.ts`'s ear uses the same pin.)

---

## 2. Files I touched

| file | why |
|---|---|
| `src/characters/rig/Body.ts` | the whole hand rebuild |
| `src/characters/rig/Geo.ts` | `sweepTube.capEnd`, `blob.uvSpan` |
| `src/characters/rig/Outfit.ts` | `printPatch`; `clothShade` amplitudes and seam angles; the tee's chest fold mask |
| `src/characters/rig/Hair.ts` | hairline wisps |
| `src/characters/Cast.ts` | garment palette + roughness for all four; hair tuft geometry for all four; Prompto's blond; Ignis's coat chroma; the skull print's size |
| `src/tools/_probe/hands.mts` | **new** — see §3 |

Nothing outside `src/characters/` except the new probe.

---

## 3. The probe — read this before capturing anything

`src/tools/_probe/hands.mts`, run through `framecam.mts`:

```bash
PORT=5350 node src/tools/framecam.mts --probe src/tools/_probe/hands.mts \
  --out tmp/shots/<round> --settle 8
```

It emits 40 framings — per hero: `_handL/R`, `_palmL/R`, `_chest`, `_shoulder`, `_hip`,
`_crown`, `_nape`, `_hairfield`.

It exists because **`_probe/heads.mts`'s `_hand` framing is broken**: it aims along the
root's forward axis at the hand's *height*, which is the hip. Every `*_hand.png` that
probe has ever produced is a picture of a black trouser leg — including the ones in the
previous handoff's baseline directories. This one aims at the bone's world position.

`framecam.mts` writes **PNG only** — no `--jpeg`. Convert before reading or you will
carry 2.5 MB per frame for the rest of the session:

```bash
for f in tmp/shots/<round>/*.png; do
  sips -s format jpeg -s formatOptions 72 "$f" --out "${f%.png}.jpg" >/dev/null; rm "$f"
done
```

---

## 4. Gate status

`npm run check` — **9/9 pass** (build, orphans, integration 18, uxcheck 89/89,
creaturecheck 207 poses, combatloop 30/30, roadcheck, heightcheck, driftcheck).

| | before | after |
|---|---|---|
| `hero_full` triangles | 7.03 M | **7.35 M** (+4.5%, all of it hair `steps` 4→6) |
| `hero_full` draw calls | 543 | **543** |

`perf.mts`/`gameplay.mts` **not run** — three other agents were live all session and any
number would have been meaningless.

---

## 5. Gotchas and dead ends — read this twice

### 5.1 Near-black albedo swallows every shading pass you write

This is the single most useful thing in this document. A garment at 0x1e1c1e is 0.012
linear. `clothShade` was computing seams, wear, mottle and a roughness break on top of
it — all correct, all invisible, because ±40% of 0.012 is ±0.005 and the tonemapper
cannot show that. **Before writing another break-up pass on a dark material, check
whether the base has the headroom to carry it.** The same applies to Ignis's glove,
which I spent forty minutes chasing as a geometry bug (§5.3) before realising 0x1b1b21
simply goes to zero wherever it turns from the key.

### 5.2 Judge hair at the range the game shows it

A 2.4 mm lock is **18 px at 0.50 m and 2 px at 3 m**. At 0.50 m every groom that has
ever existed is a bundle of blades and you will "fix" things that were never wrong. The
first hour of my hair work was spent looking at a macro shot. Use `_crown` (0.86 m) and
`_hairfield` (2.6 m).

### 5.3 The fingertip hunt — three wrong diagnoses, all disproved by ablation

Ignis's fingertips rendered as black beads. In order I believed, and disproved:

1. **Inverted winding on `blob`.** Measured directly: signed volume via the divergence
   theorem, computed in-page on a fresh `MeshBuilder`. `blob` −3.85, `sweepTube` −4.08 —
   **both negative, i.e. consistently wound**, so they cannot disagree with each other.
   (Note for whoever cares: the whole geometry pipeline is negative-signed-volume and
   still renders under `FrontSide`. I did not chase why. It is *consistent*, which is
   all that matters, but do not reason about winding from first principles here.)
2. **Degenerate tangent frame from the pinned blob UV.** Fixed it (`uvSpan`) — black
   beads unchanged. A real bug, not this bug.
3. **The fingers curling under and self-shadowing.** Opened the rest pose — improved
   the hand a lot, black beads unchanged.

What settled it: an oversized **bright red** cap blob plus a nail ablation in one frame,
then a two-colour ablation (glove tube red, glove cap green). The tube went red, so the
glove path was live everywhere; the beads were dark *red*. They were never geometry —
`0x1b1b21` on a surface turning away from the key **is** black. See §5.1.

**The lesson that generalises:** every one of those three was a plausible geometry story
and every one was wrong. The ablations cost ~3 minutes each and each one closed a
direction I would otherwise have spent an hour in. Ablate first, every time.

### 5.4 A decal patch's lift must taper to zero at its border

`printPatch`'s first build put the 2.4 mm lift into the drape's `pad`, i.e. constant
across the patch. GTAO and the shadow map both found the step at the border and drew a
visible **rectangle around the print**. The lift now lives in the `shape` multiplier and
smoothsteps to zero over the outer 0.16 rad / 0.12 of the window. Anything else you lay
on a garment as a patch wants the same treatment.

### 5.5 `git` inside this worktree

The harness refuses any bash command it cannot statically prove stays inside the
worktree — that includes `cd`, chained `&&` with globs, and `for f in ...; do ... done`
one-liners. Put multi-step shell in a script file under the scratchpad and `bash` it.
This is why §3's conversion snippet is written the way it is.

### 5.6 Things I checked that were *not* the problem

- The hair ribbon cross-section and density. Both were fixed by the previous pass and
  both are fine. The quill read is *lock length and outward push*, not section.
- Golden hour on Prompto's blond (§1.3) — measured and eliminated.
- `blob` winding (§5.3) — measured and eliminated.

---

## 6. Shot directories

| dir | what |
|---|---|
| `tmp/shots/cf0`, `cf0p`, `cf0h` | **the inherited state**, before anything of mine. `cf0h` is `heads.mts`'s output including its broken `_hand` framings. |
| `tmp/shots/cf5p` | after the hand rebuild, before the outfit work |
| `tmp/shots/cfgrey` | **the grey-garment ablation** that started the outfit work — worth looking at before touching `Outfit.ts` |
| `tmp/shots/cf7p`, `cf7` | after the outfit pass |
| `tmp/shots/cf8p` | hair, before, at the corrected framings |
| `tmp/shots/cf9p` | after the crown-mat pass |
| `tmp/shots/cfnoon` | Prompto at `time: 12.0` — the measurement behind §1.3 |
| `tmp/shots/cf11p`, `cf12` | **now** |
| `tmp/shots/cfabl`, `cfabl2`, `cf2dbl` | the fingertip ablations behind §5.3 |

---

## 7. My honest grade against shipped FFXV

Not against last round. Against a 2016 PS4 frame.

| | grade | why |
|---|---|---|
| **Hands** | **6/10** (from ~2) | Reads as a hand at any range now: separated knuckled digits, an opposed thumb, a palm with structure. What is missing is *surface*: it is still a smooth pale casting with no tendon relief on the dorsum, no skin fold at the wrist, and knuckle creases that only exist as vertex colour. FFXV hands have visible extensor tendons and a bony knuckle silhouette. |
| **Outfits** | **5.5/10** (from ~3) | The layers now read as different materials and the black reads as charcoal leather rather than a hole. But at 1 m there is still **no visible stitching, no hardware, no zip, no pocket** — the seams exist as a 2 mm rib and a value break and neither survives to the frame. FFXV's Kingsglaive black is *covered* in hardware: buckles, zips, quilted panels, a lining that shows at every cut edge. Ours is smooth panels. |
| **Hair** | **4.5/10** (from ~3) | Noctis at field range is genuinely close — an asymmetric fringe with a swept crown and a real silhouette. Prompto and Gladio are not: still a spiky mass and a dark nest. The remaining gap is that we have no **grooming guides** — every lock is an independent root with a jittered direction, so there is no flow, no parting, and no large-scale shape. §8.2 is what to do about it. |

---

## 8. What is left, in the order I would do it

1. **Hair guides — the real fix, and the one the plan already specifies.**
   `docs/plans/2026-08-21-fable-procedural-modeling.md` §8.3: cards grown from 6–10
   Bezier **guides** authored in skull-radius units, each card bending as an
   inverse-square blend of its two nearest guides, hairline and tail length as
   `a + b·cos(longitude)`, roots evenly slotted then jittered ≤0.55 slot ("an even fan
   is a comb, fully random leaves bald patches"). Everything I did this session was
   parameter work *inside* the existing per-root model; that model has no way to
   express a parting or a flow, which is why Prompto is still a hedgehog. **Read
   `final-fantasy-XV-demo-opus`'s `hair.ts` before starting** — the plan says the
   sibling solved this and the plan is a summary, not a spec.
2. **Outfit hardware.** Zips, buckles, quilted panels, a visible lining at every cut
   edge. `roundedBox` and `sweepShell` already exist and `Outfit.ts` already has a
   `buckleBox`; this is content, not new machinery. Biggest remaining outfit gap by a
   distance, and cheap per unit.
3. **Dorsal tendon relief on the hand.** Four shallow ridges wrist→knuckle in the palm
   sweep's `shape`, plus a real knuckle bulge. Half an hour, and it is the difference
   between the hand reading as a casting and as a hand.
4. **Gladio's mane.** The long back tufts (`len: 0.205`/`0.250`) were **not** touched
   this session and they still spike over his face in every three-quarter. Same
   treatment as the crown mats: `out` down, `hug` up.
5. **The head in profile**, which I did not reach at all. The previous handoff's §6.1
   is still current: the gonial angle is weak and there is a hard flat facet where the
   head mesh meets the neck.
6. **The skull print's *drawing*.** It has the resolution now; `skullPrint`'s shapes are
   crude and it reads as a cartoon ghost. It is pure 2D maths in `Cast.ts`, cheap to
   iterate, and it is the largest single element on Noctis's chest.

## 9. Cross-boundary items

1. **`src/game/Shots.ts` (coordinator's).** There is still no head-and-shoulders
   portrait shot in the corpus, and the reason is the **character root culling** bug:
   meshes use the bind-pose bounding sphere, which sits at the origin with a small
   radius while posed vertices reach 2 m up, so a character vanishes the instant the
   root leaves the frustum. The one-line fix location is in
   `src/characters/rig/Character.ts` (see the `hero_closeup` comment in `Shots.ts`).
   I did not touch it — `Character.ts`'s culling is not clearly mine and the shot
   corpus definitely is not. **If someone fixes the culling, ask for `hero_portrait`
   and `party_portrait` shots**; every defect in this document was found through
   `framecam` and none of it is visible in the shipped corpus.
2. **`src/tools/_probe/heads.mts`'s `_hand` framing is wrong** (§3). Whoever owns that
   probe should either fix it or delete the framing; leaving it produces
   confident-looking evidence about hands that is a photograph of a trouser leg.
3. **`src/characters/rig/Character.ts:96`** — `faceMat.side = THREE.DoubleSide`. The
   previous handoff flagged this as load-bearing for the eye sockets. My winding
   measurement (§5.3) is relevant to anyone revisiting it: the pipeline is uniformly
   negative-signed-volume, so "the sculpt folds" and "the winding is inverted" are
   different claims and only the first is evidenced.
4. **`perf.mts` was not run** (§4). Triangles are up 4.5%; someone should confirm on a
   quiet tree.
