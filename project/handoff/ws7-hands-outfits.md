# Handoff — WS-7 hands and outfits

Phase 4's WS-7 row said the lane was "partial and **unjudged**", and that "what
is actually open: hands, and the fact that hair and eyes shipped unjudged". Five
commits, `626908b..347041c`. **Cost: +28.5 k triangles (+0.35%) and zero draw
calls**, measured on nine character shots and tabulated in §5.

The head is not in this lane and was not touched — `after-phase3` WS-1 owns it.

---

## 1. The instrument, and why the old one could not see the defect

**`src/tools/_probe/hands.mts` frames a hand at 0.30 m.** At that range anything
with four tubes on it looks like four tubes. The read that actually fails is a
hand at 30–60 px in `hero_full` and `party_formation`, and it is not in that
frame at all. **`src/tools/_probe/ws7.mts` (new)** shoots the same hand at
0.55 m and 1.60 m, and adds two framings nothing in this repo had ever taken:
**the lower leg**, and **the whole figure at `party_formation`'s range**.

Every judgement below is against `docs/reference/plates/party-three-field-02.jpg`,
which is almost exactly `party_formation`'s framing with the shipped field
outfits in it, cross-checked against `party-four-casual-01.jpg` (a hand at
200 px) and `character-prompto-daylight-01.jpg`. Cropped comparisons are in
`tmp/shots/plate-noctis.png`, `plate-gladio.png`, `plate-prompto.png`.

**Do this before anything else in `src/characters/`.** Four of the five defects
below are things the plate simply *has* and we simply did not, and none of them
would have been found by staring at our own frame.

## 2. Hands — three causes, none of them the geometry

The geometry was never the problem. `Body.ts buildHand` already had three
phalanges, joint swellings, nails, extensor tendons and interdigital occlusion.

1. **The bind pose was a half-fist.** 0.30 / 0.62 / 0.22 rad at MCP/PIP/DIP,
   plus the 0.26 `Anim` adds through the `fingers` bone at idle, is **1.40 rad
   (80°) of tip deflection**. The fingers curled far enough that a dorsal camera
   saw them end-on, so all that geometry rendered as four bumps on a pillow.
   The plates show hanging hands at roughly 25° MCP / 30° PIP with the digits
   long and separated. Bind is now 0.15–0.23 / 0.36–0.48 / 0.16–0.22, i.e. that
   pose **after** `Anim`'s curl lands on it.
2. **The hand carried translucency the arm it joins does not.**
   `Materials.skin` turns per-vertex thickness into a red fresnel lift. The palm
   was authored at 0.20–0.55 and the fingers at 0.85 against the body's flat
   **zero**, so the step landed exactly on the wrist and the hand read as a pale
   pink prosthetic on a matt forearm. 0.06–0.20 / 0.34 now.
3. **Everyone wore the same gloves or none.** FFXV's four are not symmetric:
   Noctis one fingerless glove (left), Gladiolus a short wrap (left), Prompto a
   pair, Ignis full leather. Only Ignis had any, so six of eight hands in
   `party_formation` were pale blobs where the plate has dark shapes.
   `GloveSpec` takes `sides` and a `fingerless` cut; the cut is a tone/material
   crossfade along the finger sweep plus a 1 mm hem ridge — **no second mesh, no
   extra draw call.**

A fourth, found only after the gloves went on: **the palm sweep and the forearm
have always interpenetrated.** The palm's first ring sat 14 mm proximal of the
wrist bone at `rx` 0.0248 against a forearm of `0.0254 + 0.0056·muscle`. It was
invisible while both were skin; a black glove turned it into a bright wedge of
forearm cutting into the leather. The ring now starts 34 mm proximal and 3.2 mm
clear of the forearm's own radius when gloved — which is both the fix and the
cuff a glove actually has.

Before / after: `tmp/shots/ws7-p1/noctis_hand.png` against
`tmp/shots/ws7-p2/noctis_hand.png`, and `prompto_closeup` in `ws7-base` against
`ws7-final`.

## 3. Outfits — the party was four black wetsuits

Four things the plate has and we did not.

- **Sleeves.** Noctis's ran to the wrist; in the plate his forearms are bare
  from mid-bicep down, and that pair of skin verticals either side of a black
  torso is most of what makes him a figure rather than a silhouette. Prompto's
  vest gets a real armhole (`u1` 0.38 → 0.20). Gladiolus's was already short.
- **Gladiolus's trousers were olive.** The plate is plain black over glossy
  black shoes. Olive read as combat fatigues and put the only warm mass in the
  party on the one character whose whole silhouette is a black shirt over a bare
  chest — so his jacket `gap` widens 0.40 → 0.60, which is that chest column.
- **The boot did not exist as a thing you could see.** Shaft, trouser and foot
  were one near-black at one roughness and the leg was a stovepipe into the
  ground (`tmp/shots/ws7-p1/noctis_boot.png`). Every character in the plate has
  a hard terminator down there, legible at a range where nothing else below the
  knee is. Two new boot pieces: a **welt**, a proud rand one value off the upper
  between it and the sole, so a foot is three stacked values rather than a
  wedge; and a **band** at the top of the shaft with a 1.5 mm roll so it catches
  its own specular line instead of relying on albedo. Prompto's is the broad
  pale grey cuff the plate gives him — the brightest per-character marker in the
  whole party at that range, brighter than any face.
- **Prompto's chest panel was pale grey.** Every layer he wears is black in both
  plates; the only lighter values on him are a grey collar and the boot bands.
  The pale panel did differentiate him from the other three — into a character
  FFXV does not have. At `prompto_closeup` it read as moulded body armour.

And one bug found by looking at the lower leg: **the trouser creases were
aliasing, not blurring.** `sin(t*46)` windowed into 0.3 of the parameter over
`steps: 18` is six rings carrying 2.3 cycles — right at Nyquist — and rendered
as four hard horizontal stair-steps across the calf. 26 steps and 30/24 rad.

## 4. Measured negative — Gladiolus's shoulder, third attempt

A blind judge has named "untextured plastic shoulder armour" three rounds
running. Roughness was fixed (0.40 → 0.62, inside §12.4's range) and the crease
*ramp* was fixed. This pass tried the last surface candidate, **amplitude**
(0.024 → 0.044, roughness → 0.72, deeper hem roll, epaulette tabs).

**`imgdiff gladio_closeup`: mean 1.089/255 against that shot's own floor of
2.00.** Under the noise. Keep `tmp/shots/ws7-gheat/gladio_closeup.png` — it is
an unusually clean heat map: the entire delta is one bright blob exactly on the
sleeve cap and everything else is at the floor, so the change landed on the
right object and the object did not change how it reads.

**Stop treating this as a surface problem.** `piece('sleeve')` sweeps the arm's
*own* cross-section damped by 0.94, so by construction it is a shrink-wrap of
the deltoid, and no amount of noise on a shrink-wrap becomes a garment. What the
plate has is a **cut**: a rolled short sleeve with a hard hem line and a seam at
the shoulder point, over a deltoid the sleeve does not follow.

## 5. Cost

Nine character shots, `62651ed` against `347041c`, same daemon, same session.

| shot | Δ triangles | draws before → after |
|---|---|---|
| `hero_closeup` | +29 160 | 643 → **643** |
| `hero_full` | +29 160 | 702 → **702** |
| `hero_face` | +27 768 | 605 → **605** |
| `hero_portrait` | +26 704 | 583 → **583** |
| `hero_profile` | +48 020 | 657 → 663 |
| `gladio_closeup` | +23 080 | 667 → **667** |
| `ignis_closeup` | +23 080 | 631 → **631** |
| `prompto_closeup` | +29 160 | 632 → **632** |
| `party_formation` | +29 160 | 677 → **677** |

**Zero draw calls on eight of nine** — every addition (welt, band, glove, cuff)
goes into the `MeshBuilder` the character already had. `hero_profile` reads
657 / 658 / 663 across three runs in this session and another lane landed
`Hammerhead casts one shadow, not twenty-five` in the same window; do not read
its +6 as mine without re-measuring. Mean triangle cost **+28.5 k, +0.35%**, and
BRIEF's ceiling is draw calls, not triangles.

Not run: `pnpm run check`, `perf`, `gameplay`. Another lane held the tree with
in-flight `src/world/town/Hammerhead.ts` edits for most of this session. Every
capture above exited zero, i.e. no page errors.

## 6. The judgement WS-7 was missing — hair and eyes

Both shipped unjudged. Frames: `tmp/shots/ws7-probe0/noctis_hairfield.png`
(2.6 m, the field camera), `ws7-final/hero_profile.jpg` (0.5 m),
`ws7-final/hero_portrait.jpg`.

**Hair: it helps, clearly, and it introduced a new tell.** The judge's ranked
#1 was *"an opaque cap or a single alpha-cut shell that visibly detaches from the
scalp, with hard cutout edges and fringing"*. That is **not** what is in the
frame now: at 2.6 m Noctis reads as a mass of separate locks with a broken
outline, real gaps, and a fringe that crosses the face; there is no cutout
rectangle anywhere and no shell edge. The scalp-normal Kajiya-Kay band and the
guided flyaways bought that. **6/10, from 3.** What replaced the old tell:

1. **It reads as feathers, not hair.** The locks are flat, wide shards that
   overlap in planes with pale lit edges. A plate lock is a *bundle* with soft
   internal breakup; ours is a blade.
2. **The specular band reads as white paint.** It is a narrow bright streak
   sitting on top of the mass rather than an anisotropic sheen running through
   it — visible as discrete white marks on the crown in `hero_profile`.
3. **The colour is slate blue.** `0x252834` with tip `0x5f6675` against a
   reference that is near-black with a warm-brown undertone in sun. This is one
   number and it is the cheapest hair win left.

**Eyes: better than the 3/10 they were given, and I cannot grade them past the
head.** Sclera, a blue iris and a lash line are all present and visible in
`hero_portrait` where before there was "a flat saturated blue disc… sclera
barely present". But at portrait scale they read as doll eyes for a reason the
eye lane already found and could not close: **a skin-coloured wedge still covers
the outer third of each aperture**, so the sclera is a hard bright crescent
rather than an eye. That wedge is `buildLid` / the socket, i.e. the head, i.e.
`after-phase3` WS-1. **Do not grade or re-tune the eyes until the head lands** —
this is the fourth lane to reach that conclusion and the first three each spent
a session on it.

## 7. Open, in order

1. **Ignis is untouched and is still one black column** — the only character
   whose read did not move. He is correct to the brief (long coat, formal) and
   wrong to the plate in one respect: no hem line, no lapel thickness, no
   collar break at party range.
2. **The sleeve cut** (§4). It is a real piece of work on `piece('sleeve')`, not
   a data change.
3. **Noctis's skull print is vertex-coloured on a 42×76 shirt sweep** and
   renders as a grey smear 25 cm across at 0.95 m (`ws7-probe0/noctis_chest.png`).
   `printWindow` / `printSteps` / `printSeg` exist to re-sweep it as its own
   dense decal patch and are not being used.
4. **A hole at Noctis's collar.** `ws7-probe0/noctis_chest.png` shows a
   triangular void between the jacket collar and the shoulder with skin visible
   through it.
5. **The `_palm*` framings in `_probe/hands.mts` are inside the geometry** — at
   0.30 m from below the camera is under the skin. `_probe/ws7.mts` does not
   take them; nothing has ever looked at a palm.
6. **Hair colour** (§6.3), one number.
