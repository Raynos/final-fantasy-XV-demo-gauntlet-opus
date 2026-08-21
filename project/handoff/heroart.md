# Handoff — `agent/heroart` (hero faces, hair, hands, outfits)

Branch `agent/heroart`, worktree `agent-a643eb6a4f96d2893`, based on `main` @ `0be851f`.
One commit: `1a5fa03` — the eye rebuild.

**Read §5 first if you are short of time.** The gotchas are worth more than the code.

---

## 1. State

### Done and verified by eye

**The eye region, on all four heroes, at 0.4–0.6 m.** This was priority 1 and it is
the only thing that landed. Before: the aperture was a wall-eyed slot with a blank
white bead for the far eye, the eyeball's lower hemisphere hung out of the face as a
skin-coloured bucket, and the iris was a third too small. After: an open almond
aperture, iris filling it, sclera reading as sclera, lids meeting at both canthi, no
protruding shell. Compare `tmp/shots/ha0c/noctis_front.png` with `tmp/shots/ha6/noctis_front.png`
and `tmp/shots/ha0c/noctis_eyes.png` with `tmp/shots/ha6/noctis_eyes.png`.

It is **better, not good**. It would still lose a blind side-by-side against FFXV.

### Done but not verified

- Corpus shots (`hero_face`, `hero_closeup`, `hero_full`, the three companion
  closeups, `town_npcs`) were **not re-captured** after the final edit. The baseline
  is in `tmp/shots/ha0/`; re-shoot and compare before merging.
- The **caruncle** renders as a small dark bead that is visible at 0.4 m and sits at
  the wrong corner on at least one side (see `tmp/shots/diag/solid_frontside.png` — the
  black bead is temporal, not nasal, on the left eye). It is small enough to be
  invisible at gameplay range but it is wrong. Fix or delete it.
- NPCs (`NpcRig.js`) build from the same `buildHead`, so they inherit all of this
  for free — but `town_npcs` was not re-shot.

### Not started

Everything else in the approved plan: **the profile head collapse (priority 2), the
sea-urchin hair (priority 3), the faceted forearm (priority 4), hands, outfits, skin
chroma.** Section 6 has what I learned about each before I ran out of time.

---

## 2. Files changed

| file | why |
|---|---|
| `src/characters/rig/Face.js` | New `EYE` constants + `lidMargin()` + `skinSnap()`; lid band rebuilt (closes at both canthi, rides outside the cornea, welds to the skull, takes the real face UV); waterline and caruncle added; iris angle and corneal dome retuned; eye-socket sculpt retuned; painted lash line / crease / waterline / tear-trough re-derived from the lid geometry instead of two hand-tuned remap constants; painted socket AO halved. |
| `src/characters/rig/Materials.js` | Imports `EYE` from `Face.js` so the shader's iris angle can no longer disagree with the geometric limbus; sclera value, canthal self-shadowing, vessels; the sky ambient lift on the globe is now cut by `N·V`. |
| `tools/_probe/heads.mjs` | New. The probe that makes any of this judgeable — see §7. |

Nothing outside my ownership was touched. `Cast.js` was **not** edited (I never got
to the appearance-data work the coordinator authorised).

---

## 3. Gate status

| gate | result |
|---|---|
| `npx vite build` | **pass** (enforced by `.githooks/pre-commit`, ran on the commit) |
| `node tools/integration.mjs` | **pass** — 18 pass · 0 wired-but-unproven · 0 not integrated |
| `node tools/orphans.mjs` | **1 orphan: `src/world/map/MapRaster.js`** — pre-existing, not mine, `src/world/map/**` is the coordinator's |
| `node tools/perf.mjs` | **not run.** The machine was saturated with sibling agents the whole session and the numbers would have been meaningless. Baseline for comparison is in `tmp/shots/ha0/manifest.json`: hero shots 4.78–4.85 M tris / 485–525 calls, `town_npcs` 6.91 M / 841. |

The eye work **adds** geometry: lid `cols` 14→20, `rows` 4→5, lashes 11→17 per lid,
plus a waterline strip and a caruncle. Roughly +1.5 k triangles per head, ~+10 k across
a four-hero shot with NPCs. That is noise against 4.8 M, but measure it rather than
believing me.

---

## 4. Next steps, in priority order

1. **Re-shoot the corpus and compare against `tmp/shots/ha0/`.** `PORT=<vite> node
   tools/shoot.mjs hero_face hero_closeup hero_full gladio_closeup ignis_closeup
   prompto_closeup town_npcs --out tmp/shots/ha7 --cold`. Then `node tools/perf.mjs`.
   Nothing else should start until this is known good.
2. **Settle the socket depth properly** — see §5.1. It is parked at a working value,
   not a correct one, and it is the one thing in this commit that could regress if the
   head sculpt changes underneath it.
3. **Fix or delete the caruncle** (`Face.js`, in `buildLid`, the `!upper` block). It is
   placed at fissure fraction `cf = 0.05`, which is the *inner* canthus only if
   `EYE.arc[0]` is the nasal end — check the sign per side.
4. **The profile head collapse** — the worst remaining frame. Evidence:
   `tmp/shots/ha0c/ignis_profile.png`. The skull runs as one straight plane from forehead
   to chin point with no nasion, no mandible body and no ear. §6.1 has specifics.
5. **The hair.** Evidence: any `*_profile` or `*_front` in `tmp/shots/ha0c/`. §6.2.
6. **Everything else in `/Users/raynos/.claude/plans/logical-finding-flute-agent-a5330eb3b9d22cb42.md`**,
   which is still accurate apart from its eye diagnosis (which was wrong — see §5.1).

---

## 5. Gotchas and dead ends — read this twice

### 5.1 The DoubleSide occluder (the big one)

`Character.js:73` sets `this.faceMat.side = THREE.DoubleSide`. That file is not mine
and I did not change it, but it drives the single most confusing behaviour in this
system:

**With `DoubleSide`, a back-facing surface renders in front of the eyeball and hides
it completely.** I proved it: at an identical framing, `side = FrontSide` shows a
correct open eye and `side = DoubleSide` shows a smooth skin dome where the eye should
be. `side = BackSide` renders a complete face at the same apparent depth, which means
the head geometry contains inverted-winding triangles somewhere around the socket —
almost certainly the eye-socket sculpt **folding**: the socket brushes displace along
a fixed `[0,0,1]` with a cosine falloff, and past a certain amount the displacement
gradient exceeds the surface slope and the surface turns inside out at the rim.

The practical consequence, and this is the trap:

> **The socket depth controls whether the eye is visible at all, non-monotonically.**
> Too shallow and the skull covers the globe (obviously). Too shallow *by a little*
> and the *fold* covers the globe while the skull does not — which looks identical
> and sends you hunting for a shading bug that does not exist.

I burned most of the session on this. My CPU-side model of the sculpt
(`skullSampler` sampled on a grid) said there was 11–15 mm of clearance at the
aperture while the render showed the eye fully occluded. The model was right about
the skull and blind to the fold.

Depths tried, all measured by eye at 0.4 m:

| total socket depth | result |
|---|---|
| −0.046 (original `main`) | eye visible, but the lid band hangs off the cheek as a bucket |
| −0.016 | aperture sealed shut, character reads as asleep |
| −0.025 | aperture open in the CPU model, **fully occluded in the render** (the fold) |
| −0.047 (shipped) | eye visible and correct |

So the shipped value is roughly the original depth. What makes the commit worth
having is that the *bucket* is now fixed independently, by `skinSnap()` welding the
lid band's outer rows onto the sculpted skull — so the lid merges into the face at
any socket depth, and the depth is free to be chosen for aperture size alone.

**The right fix, which I did not do:** stop the sculpt folding. Widen the socket
brushes (`r` from `[0.036, 0.024, 0.046]` toward `[0.048, 0.032, 0.058]`) and add
`pow: 1.6` to soften the rim, so the same displacement is spread over a gentler
gradient. Then verify with `side = DoubleSide` **specifically** — a FrontSide test
will pass while the shipped material still fails. Then the socket can be reduced to
~25 mm, which is the anatomically right number, and the eye will sit *in* the head
rather than proud of it.

Do not "simplify" `skinSnap()` away. Without it, any socket change re-opens the
bucket.

### 5.2 The corpus closeups are not closeups

`hero_face` frames the whole party at ~4 m; Noctis's head is about 100 px tall. None
of the defects in this document are visible in it, and none of the fixes are either.
**Face work must be judged through `tools/framecam.mjs`.** Everything I found, I found
at 0.4–0.6 m and nowhere else.

### 5.3 `framecam.mjs` traps

- `PORT` must be the **vite** port. `daemon.mjs` uses `PORT+1`; aiming framecam at the
  daemon port makes it talk to the control server and hang for the full 300 s
  `waitForFunction` timeout. (Already in the plan; still true; still bit me once.)
- **Absolute `pos`/`target` framings drift.** framecam settles the sim between
  captures, so a framing measured once in the probe is further out of frame with
  every later shot in the list — by the 13th spec the subject was completely gone. Use
  `follow` shots instead; the camera rig re-anchors on the live root every frame.
  `tools/_probe/heads.mjs` emits follow shots for exactly this reason.
- `import 'three'` fails inside a probe (no bare-specifier resolution in
  `page.evaluate`) and `/node_modules/three/build/three.module.js` 404s under vite.
  Do the vector maths by hand, or read matrix elements directly:
  `o.updateWorldMatrix(true,false); const e = o.matrixWorld.elements;` gives position
  at `e[12..14]` and the object's +Z at `e[8..10]`.
- The tutorial hint card parks itself **exactly over the subject's forehead** in every
  face framing. Kill it with `g.get('HUD').hints.root.remove()`. It is not the HUD and
  `shot.hud` does not suppress it.

### 5.4 The lid, the lashes and the paint are one system

They were three independent sets of hand-tuned numbers describing the same curve, and
they had drifted apart: the painted lash line sat 4 mm above the geometric lid margin.
They now all read `lidMargin(f, upper, openU)` and `EYE`. If you change the aperture,
change it there and everything follows. Do not re-introduce a remap constant.

### 5.5 Things I checked that were *not* the problem

Saves you the trip:

- The eyeball geometry itself is good. Rendered on its own (head hidden) it is a
  clean sclera, a fibrous iris, a limbal ring and a decent glint. See
  `tmp/shots/diag/diag_nohead.png` — that is what is hiding behind the face.
- The globes are positioned correctly. Pupillary distance / head width = 0.43, which
  is the real ratio. `dims.eyeY`/`eyeZ` in `Skeleton.js` match `FACE.eye` exactly.
- `Anim.js:466`'s `+0.11` rad gaze pitch is small (6.3°) and not the cause of
  anything, though with the aperture now symmetric its justifying comment ("the lid
  aperture opens slightly below the globe's equator") is no longer true and it should
  probably go to 0. That is `agent/idles`' file.
- Blinking is not it. `Anim.js` blinks deterministically but transiently.

---

## 6. What I learned about the work I did not get to

### 6.1 Profile (priority 2) — `tmp/shots/ha0c/ignis_profile.png`

The worst frame in the game. Concretely: no nasion (the forehead and the nose bridge
are one straight plane), no mandible body between the gonial angle and the chin, the
chin is a point, and the ear is not visible at all because the hair swallows it. The
back of the skull is a large glossy dome. `profileW()` in `Face.js` handles the
below-equator taper; the missing mass is above it, in the brush list.

### 6.2 Hair (priority 3)

The plan says `out` defaults to 0.15 and everything shoots radially. **That is out of
date** — `Cast.js` already carries `out: 0.6–0.87` per tuft, i.e. the strands are
mostly following their styled direction, not the scalp normal. The sea-urchin read
therefore is *not* a direction-field problem and retuning `out` will not fix it. What
the pictures actually show is that each strand is a **straight, wide, flat, faceted
blade** — a quill because of its *cross-section and lack of curvature*, not its
direction. The fix is in `ribbon()` (`Geo.js:591`): give the strand a curved
cross-section and real bend along its length, and clump several locks per root.
Ignis's hair also reads khaki rather than ash-blond; the shell ramp
(`0.74 + 0.62·crown²`) and the Kajiya-Kay `sheenC` mix toward white together bleach
gold.

### 6.3 Skin

Over-saturated orange at closeup, and the **neck is a different colour from the face**
with a hard seam and a visible woven normal-map pattern (`tmp/shots/ha6/noctis_front.png`,
bottom). The body uses `skinMaterial()` with `c.pore` at `repeat(22,34)`; the face uses
`poreFine` at `repeat(9,13)`. Those are different scales on either side of the jaw
line, which is most of the seam.

---

## 7. How to judge this

```bash
PORT=<unique vite port> node tools/framecam.mjs \
  --probe tools/_probe/heads.mjs --out tmp/shots/<round> --settle 8
```

Emits 28 framings — for each of the four heroes: `_front`, `_eyes` (0.4 m, fov 13),
`_tq`, `_profile`, `_back`, `_torso`, `_hand`. It settles 90 frames, disables DOF
outright and removes the hint card first, then derives every framing from the live
rig (`dims.eyeY`, the head bone, the hand bone, the root's facing) and emits them as
`follow` shots.

The frames that matter, in order: `noctis_eyes` (is the eye an eye?),
`ignis_profile` (the head sculpt), `gladio_tq` (the far eye and the beard),
`prompto_front` (blond hair, freckles).

Baselines on disk: `tmp/shots/ha0/` (corpus), `tmp/shots/ha0c/` (probe, before any change),
`tmp/shots/ha6/` (probe, current). `tmp/shots/diag/` and `tmp/shots/diag2/` hold the
head-hidden / winding-mode diagnostics behind §5.1 — worth a look before you touch
the socket.

---

## 8. Cross-boundary items

1. **`src/characters/rig/Character.js:73** — `this.faceMat.side = THREE.DoubleSide`.
   Not mine to change, and it is the mechanism behind §5.1. If the socket sculpt is
   ever made fold-free, this can stay; until then it is load-bearing in a way nobody
   intended. At minimum it deserves a comment saying so.
2. **`src/characters/rig/Anim.js:466`** — `this.char.eyes.rotation.set((this.eyePitch
   || 0) + 0.11, ...)`. The `+0.11` was compensating for an aperture that no longer
   exists; its comment is now false. `agent/idles` owns this file. Suggest 0.
3. **`src/world/map/MapRaster.js`** — orphaned per `tools/orphans.mjs`, pre-existing,
   coordinator's directory.
4. The DOF finding from the earlier plan is **resolved on `main`**
   (`PostFX._headObject()` now racks focus onto the shot's `follow` subject). No action.
