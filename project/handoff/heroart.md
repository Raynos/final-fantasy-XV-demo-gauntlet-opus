# Handoff — `agent/heroart` (hero faces, hair, hands, outfits)

Branch `worktree-agent-a353f058db623fd8f`. Carries the four rescued commits from
`worktree-agent-ac20d4b7c74f55fa0` (the skull profile, the ear, the unified skin base,
the hair-on-the-head pass) plus five of mine on top.

**Read §5 first if you are short of time.** The gotchas are worth more than the code,
and §5.6 is new and cost me forty minutes.

---

## 1. State

### Verified by eye at 0.4–0.6 m, this session

Every claim below was checked in `tmp/shots/ha9` (the inherited state, before any
change of mine) against `tmp/shots/ha22` / `ha23` (now). Use those two directories for
any before/after.

**The four inherited commits are good and are now verified.** `ignis_profile` was the
priority: the skull has a real nasion, a mandible body between the gonial angle and
the chin, and a chin that is no longer a point. The eye work from the session before
that survives — `noctis_front` shows an open almond aperture with iris and sclera.
Nothing in the four commits needed reverting.

**Hair — the big one, and the reason nothing else got much time.** It was straw:
straight, wide, flat, faceted blades with sky between every one. Three separate causes,
all now fixed, and the third was the one that actually mattered:

1. *One ribbon per root.* `Hair.js` now emits `clump` locks per root (3 on all four
   heroes, 4 on the beard), sharing a direction and splaying toward the tips at a
   fraction of the width each. Total cross-section is held; the density inside the
   silhouette triples.
2. *Two aliasing bugs in the shading.* The Kajiya-Kay break-up mask ran on `vMapUv.x`
   — the coordinate **across** the ribbon — at 34 cycles over a 3 mm strand. That is
   sub-pixel at every range a head is ever seen at, so it aliased into the chrome
   speckle that made each lock read as a faceted blade. `hairStripe`'s 11 filament
   bands across the same 3 mm had the same problem. Both are now at frequencies that
   resolve.
3. **The specular tint was a brightness multiplier.** `sheenC` mixed toward
   `vColor.rgb * 3.2`. On near-black hair the 3.2 is what makes any colour show at
   all; on blond hair, already at 0.8 albedo, it multiplies to 2.7 and **clips to
   white on every lock facing the sun.** Prompto's and Ignis's hair was not badly
   shaped — it was over-exposed, and no amount of geometry work could ever have fixed
   it. The band, the backlit rim and the sky dome now all tint by a
   luminance-normalised hue and scale their energy explicitly.

Styling that followed from looking at the result: the hairline's front term was 0.049,
putting it 40 mm above the brow on a 108 mm brow-to-crown skull — a receding hairline,
now 0.038. The crown mat on all four heroes rooted only over the top half of the scalp
(`phi` 0..0.5), leaving the back of the head as bare shell; it now spans 0..0.92 at
1.5x the count with the direction jitter cut from 0.16 to 0.05, so the locks read as a
combed flow rather than scattered chips. Prompto's quiff was a picket fence of equal
spikes standing straight up off a thin ring; it now sweeps up **and back** off a much
wider root band.

One trap that came out of the lower hairline: **Noctis is the only character with a
long fringe**, so dropping the roots 11 mm put his locks straight over both eyes and
undid the eye rebuild from two sessions ago. He carries `hairline: 0.013` to get most
of it back. If you change the global hairline term again, re-check `noctis_front`
specifically — nobody else in the cast shows this.

**The scalp shell** was a 52x11 ellipsoid, and an ellipsoid under a directional key is a
moulded plastic cap however its albedo is textured — that is what showed through every
gap and read as a bald crown on Prompto and a black slab on Noctis. It is now 96x20
with a noise displacement stretched along the flow, and its `hairStripe` UV runs at 34
repeats around the skull (was 6, i.e. 2 cm "filaments") with a jittered phase so it
does not read as corduroy.

**The ear.** The helix, antihelix, tragus and lobe were all built by my predecessor,
correctly shaped, and **completely invisible** — see §5.6. Three things were wrong and
all three are fixed: the ridges sat inside the plate they roll over, the hairline's ear
notch left the shell covering the top third of the helix, and a 24 mm red paint blob at
the ear's pin texel flooded the whole ear with one flat salmon colour *and* painted a
bruise across the temple. `noctis_profile` and `ignis_profile` in `tmp/shots/ha22` now
have a visible ear with a lobe and a rim. It is *present*, not *good*.

**Skin.** The face and the body carried two different near-pure subsurface reds
(0xe02c12 and 0xd8321a), so head and neck reddened by different amounts as they turned
from the sun — the half of the jaw seam that `SKIN_BASE` does not cover — and that term
is most of why the cast read as sunburnt at closeup. Both now use one dull brick and
the roughness / sheen / specular pairs are matched. The painted occlusion stack is
damped 20% and lifted toward neutral in one place: individually every socket, temple
and cheek-hollow value is right, but they multiply, and on Prompto's pale complexion
the overlaps went to a saturated grey-brown that read as bruising. Compare
`ha9/prompto_front.jpg` with `ha22/prompto_front.jpg` — this is the clearest
before/after in the set.

**Gladio's beard** was ~350 individual 15 mm thorns with bare skin between them. It is
now 6 mm, at 1.7x the roots, four locks each, in a value close to the painted stubble —
which is itself up from 0.55 to 0.88, so the skin under the beard is dark and the
geometry only adds fuzz at the edge.

### Not started

- **Hands.** Still mittens. Untouched.
- **Outfits.** Still flat black shapes with no layering or hardware. Untouched.
- **The childlike face proportions.** Visible in `ha22/noctis_front.jpg`: round soft
  cheeks, no cheekbone edge, small chin, cranium too wide for the face. The painted
  cheekbone hollow is doing what it can; this needs sculpt brushes, not paint.
- **The far eye in three-quarter views** still goes to a dark hole
  (`ha22/gladio_tq.jpg`).

---

## 2. Files changed by me

| file | why |
|---|---|
| `src/characters/rig/Hair.js` | clumping; shell density + noise relief + UV; hairline front term and ear notch; per-lock value spread; root value lift |
| `src/characters/rig/Materials.js` | the luminance-normalised hair specular tint (the big one); the mask/filament frequency fixes; `SSS_RED` shared by face and body; matched roughness/sheen/specular between the two skin materials |
| `src/characters/rig/Face.js` | `ao()` damped and lifted in one place; ear paint blob removed; ear ridges lifted clear of the plate; ear subsurface thickness halved and plate/concha given their own values |
| `src/characters/Cast.js` | appearance data only: `clump` on all four heroes; crown-mat coverage and flow; Prompto's quiff; Noctis's crown spikes; Ignis and Prompto hair colour; Gladio's beard and stubble |

Nothing outside my ownership was touched.

---

## 3. Gate status

| gate | result |
|---|---|
| `npx vite build` | **pass** (also enforced by `.githooks/pre-commit` on every commit) |
| `node src/tools/integration.mjs` | **pass** — 18 pass · 0 wired-but-unproven · 0 not integrated |
| `node src/tools/orphans.mjs` | **pass** — 272 modules, 272 reachable, no orphans |
| draw calls | **unchanged.** `hero_full` 543, `hero_face` 478, `town_npcs` 839 — identical to the baseline at the merge |
| triangles | **up 30%.** `hero_full` 5.27 M -> 6.87 M, `town_npcs` 7.88 M -> 9.63 M. That is the cost of tripling the strand count; I took 30% back by dropping clumped locks to 5 sides / 5 steps. See §4.2 if it needs to come down further. |
| `node src/tools/perf.mjs` | **FAIL — but it failed before my changes too, and worse.** At the merge commit `b40394a`: mean 60.7 fps, worst 22.1 (`zone_nebulawood`). After my changes: mean 72.1 fps, worst 34.7 (`menu_title`). Run-to-run variance on a machine shared with sibling agents dominates both numbers. The perf failure is **not** mine, but the triangle increase is, and someone should measure it on a quiet machine. |

The baseline numbers quoted in older docs (4.78-4.85 M tris) predate the four rescued
commits. Measured at `b40394a`, the real baseline is 5.27 M.

---

## 4. Next steps, in priority order

1. **Hands.** They are mittens and they appear in `*_hand` in every probe run and in
   every combat frame. Nothing has been done to them at all. This is the largest
   untouched thing I own.
2. **Outfits.** Flat black shapes, no layering, no hardware. Same: untouched.
3. **The face reads as a child.** `ha22/noctis_front.jpg`. Needs cheekbone, jaw-width
   and cranium-width brushes in `Face.js` `brushes()`, not more paint. Note
   `look.cheek` / `look.jaw` already exist as brush drivers — start there.
4. **The ear is present but flat.** Its ridges clear the plate now, but every vertex
   still pins to a single texel (deliberately — §5.6), so it has no albedo variation
   and reads as a smooth shape with faint rims. The right fix is probably a small
   dedicated UV island for the ear rather than a pin.
5. **Triangle budget**, if it needs to come down: the cheapest cut is the crown mat
   (`n: 260-300` x `clump: 3` per hero). Dropping `clump` to 2 there costs little
   visually and saves roughly a third of the hair. Do *not* reduce the clump on the
   fringe or the beard — that is where it is doing the most work.
6. **Prompto's hair still reads olive/straw rather than gold**, even after the
   exposure fix and a warmer base (`0xe0ae52`). I ran out of turns before finding out
   whether that is the albedo, the `hairStripe` multiply darkening it, or the
   environment. Start by rendering him under `Sky.setTimeOfDay(12)` to take the golden
   hour out of the equation.

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
**Face work must be judged through `src/tools/framecam.mjs`.** Everything I found, I found
at 0.4–0.6 m and nowhere else.

### 5.3 `framecam.mjs` traps

- `PORT` must be the **vite** port. `daemon.mjs` uses `PORT+1`; aiming framecam at the
  daemon port makes it talk to the control server and hang for the full 300 s
  `waitForFunction` timeout. (Already in the plan; still true; still bit me once.)
- **Absolute `pos`/`target` framings drift.** framecam settles the sim between
  captures, so a framing measured once in the probe is further out of frame with
  every later shot in the list — by the 13th spec the subject was completely gone. Use
  `follow` shots instead; the camera rig re-anchors on the live root every frame.
  `src/tools/_probe/heads.mjs` emits follow shots for exactly this reason.
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

### 5.6 A clean `vite build` does not mean the page runs

A bad `perl -0pi -e 's|...|...|'` — the pattern contained `\|\|` and the delimiter was
`|` — prepended seven lines of function-body code **above the imports** in `Hair.js`.
That is valid module syntax, so `vite build` was clean and the pre-commit hook was
happy. The page threw a `ReferenceError` on load, and the only symptom was a 300 s
`framecam` timeout with an **empty** console log (`log: []`) and a
`[vite] server connection lost` line under `VERBOSE=1`. I spent forty minutes on ports,
daemons and `cleanup.mjs` before reading the top of the file I had just edited.

If a capture hangs immediately after an edit: `head -5` the file you touched, then
`git diff` it, before touching the harness. And prefer the `Edit` tool over `perl` for
anything whose pattern contains a `|`.

### 5.7 The ear pins every vertex to one texel, and that has consequences

`buildHead` gives every ear vertex the UV of the ear's own centre. That is deliberate
and load-bearing: a blob whose UV spans 0..1 samples the *whole* face map, so the ear
used to wear the lips and the nostrils. But it means **anything painted at that texel
floods the entire ear with one flat colour**. There was a 24 mm `rgba(200,104,84,0.40)`
blob there "because ears are redder"; it turned the ear into a salmon lump *and*
painted a bruise across the temple on the skull. Ear colour belongs in vertex colour,
where the plate, the concha and the rims can differ. Same trap applies to anything else
you pin.

Related: `B.mat(r, m, thickness)` — `thickness` is the subsurface term's input and 1.0
is its maximum. The ear was at 1.0, so it was back-lit to a uniform pink at every
angle, which hid what little ridge relief it had.

## 6. What is left, and what I know about it

### 6.1 Profile — **done**, verified in `tmp/shots/ha22/ignis_profile.jpg`

The nasion, the mandible body and a real chin all landed in the rescued commits and
they hold up at 0.4 m. The ear is visible in profile for the first time. What is still
weak: the jaw has no gonial angle worth the name from this angle, and there is a hard
flat facet where the head mesh meets the neck (visible bottom-left of
`ha22/noctis_profile.jpg`). That junction is `Body.js` + `Face.js` and it is mine, but I
did not get to it.

### 6.2 Hair — **substantially fixed**, see §1

The old diagnosis in this document ("straight, wide, flat, faceted blades; the fix is
in `ribbon()`") was *half* right. `ribbon()` already had the six-sided rolled section
before I started — my predecessor added it — and it was not enough, because the
faceted read was mostly the two aliasing bugs and the over-exposure described in §1.
The remaining geometry lever was density, not cross-section.

### 6.3 Skin — **improved, not solved**

The orange is gone and the neck/face seam is much reduced (`SKIN_BASE` unified the
value, `SSS_RED` unified the subsurface). What remains: the body's pore normal map
tiles at `repeat(15,23)` on the body UV and the face's at `repeat(9,13)` on the face
UV, which are different *texel densities* on either side of the jaw, and no amount of
matching the shading parameters fixes that. Someone should measure the two densities
properly and set the repeats so they agree.

There is now a mild opposite risk: with the occlusion stack damped 20% and the
subsurface pulled back, the skin is flatter and paler than it was. Judge it in
`ha22/noctis_profile.jpg`. If it needs warmth back, put it in the *tonal zones* (the
three portrait bands near the top of `paintFace`), not in the `ao()` stack.

## 7. How to judge this

```bash
PORT=<unique vite port> node src/tools/framecam.mjs \
  --probe src/tools/_probe/heads.mjs --out tmp/shots/<round> --settle 8
```

Emits 28 framings — for each of the four heroes: `_front`, `_eyes` (0.4 m, fov 13),
`_tq`, `_profile`, `_back`, `_torso`, `_hand`. It settles 90 frames, disables DOF
outright and removes the hint card first, then derives every framing from the live
rig (`dims.eyeY`, the head bone, the hand bone, the root's facing) and emits them as
`follow` shots.

The frames that matter, in order: `noctis_eyes` (is the eye an eye?),
`ignis_profile` (the head sculpt), `gladio_tq` (the far eye and the beard),
`prompto_front` (blond hair, freckles).

Baselines on disk for **this** session: `tmp/shots/ha9/` (the inherited state, before
any change of mine) and `tmp/shots/ha22/`, `ha23/` and `ha24/` (now; `ha24` is the final state). `ha10` through
`ha21` are the intermediate rounds if you want to attribute a particular change.
Older: `tmp/shots/ha0c/` (before the eye rebuild), `tmp/shots/ha6/` (after it). `tmp/shots/diag/` and `tmp/shots/diag2/` hold the
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
3. **`src/world/map/MapRaster.js`** — no longer orphaned; `orphans.mjs` reports 272
   modules, 272 reachable. Resolved by someone else. No action.
4. The DOF finding from the earlier plan is **resolved on `main`**
   (`PostFX._headObject()` now racks focus onto the shot's `follow` subject). No action.
5. **`src/tools/perf.mjs` fails on `main`, before any character work.** Measured at the
   merge commit `b40394a`: mean 60.7 fps, worst 22.1 fps on `zone_nebulawood`. That is
   nothing to do with characters and it is not in anyone's handoff that I can find.
   Whoever owns the world/vegetation systems should see it.
6. **Character triangle counts are up 30% from the hair clumping** (`hero_full`
   5.27 M -> 6.87 M). Draw calls are unchanged. If the coordinator needs that back,
   §4.5 says exactly where to take it from — but it should be a measured decision on a
   quiet machine, not a reflex.
