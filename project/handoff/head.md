# Handoff — `head` (round 14, pass 5): the shell was inside out

Owns `src/characters/**`. Inherited a lane that had built `facecheck.mts`, then
spent passes 3 and 4 turning "the mouth is missing" into measured negatives —
the paint, the mip chain, an occluding surface, the uv attribute, the head's
pitch, `SKIN_BASE`, the socket brushes. Pass 4's parting hypothesis was a UV
pole at the menton.

**It was none of those. `buildHead`'s skull grid was wound inside out, the face
material is `FrontSide`, and every front view ever captured of this game was
the inside of the back of the skull.** Fixed in `d866db7`.

---

## 1. The bug, and why five lanes could not see it

In `buildHead`, `u` increases with theta and so with `+x` at the front; `v`
increases with phi and so with `-y`. The quad was
`(a,b,c) = ((u,v), (u+1,v), (u+1,v+1))`, so

    (b - a) x (c - a) = x_hat x (x_hat - y_hat) = -z_hat

— every triangle on the shell pointed **into the head**. `FrontSide` culled the
near surface on every frame. What drew was the far surface's interior: a smooth
ovoid, with the lids, lashes, ears and hair — `blob`/`ribbon`/`buildLid`, all
correctly wound — floating in front of it.

Read the four rounds of judging against that and every sentence is literal:

- *"an egg with two eyes stuck in it"* — an inside-out occiput, plus the eye
  geometry, which is separate and was never culled.
- *"no mouth geometry or mouth texture on the mouth's location"* — the mouth is
  on the culled surface.
- *"the chin projects further forward than the nose"* — on the inside of the
  back of a skull, the lowest forward point is the chin.
- The **profile** always read better because a silhouette is the same surface
  whichever way it is wound.
- `head-r3.md` §5's *"8 mm of added lip relief moved the rendered mouth by 1 of
  255"* — every bench in this repo reads the **position** buffer, which was
  always correct, and the frame never contained the surface they measured.
- The hard vertical hairline down the midline of every front view, which three
  lanes named and none explained: it is the inside of the occiput's own crown
  line. It is gone.

### The instruments, and how to re-run the finding

- **`src/tools/probes/facewind.mts`** — the decisive one. Geometric normal
  `(b-a) x (c-a)` on the front-most triangles, plus **signed volume**
  `sum dot(a, b x c)/6` per mesh, which is positive for an outward-wound closed
  mesh with no convexity assumption. Before: **0.0%** of the head's 1 155
  front-most triangles had a `+z` geometric normal. After: **100.0%**.
- **`facenrm.mts`** — 91% of the shell's normals on the wrong side.
- `_det`-style readout (folded into `facewind`): the mesh's max-z vertex is the
  nose tip at `uv = (0.500, 0.372)` and carried `n = (0.01, 0.35, -0.94)`.
- The confirming picture was `faceMat.side = BackSide` on the *shipped* tree.

**Do not "fix" this with `material.side`.** The ears, lids and lashes share the
mesh and are wound correctly; `BackSide` breaks them. The chin cap is flipped
with the grid — it had already been "fixed" once *to match the inverted grid*,
which is how a hole under the jaw got closed by making the cap inside out too.

### What it did to the gate

`facecheck`, same tree, before and after the winding fix:

    char      mouthRange        mouthEdge         cheek range
    noctis     2.9 ->  101.3    -14.5 -> 107.3     29.9 -> 111.0
    ignis     21.9 ->  135.5     16.3 ->  91.3     22.8 ->  58.4
    prompto  -18.9 ->  189.0     -8.6 -> 101.6     38.5 ->  50.0

Limits are 14 and 3. Both "lit half clipped" VOIDs are gone. The **lit half
swapped sides on every head**, which is the same fact seen from the shading.

**`facecheck`'s control window now needs recalibrating and this is the top item
for the next pass.** It scores every feature against "the same box slid 40 mm
sideways onto the cheek, which is skin and nothing else". On a face that has
form that is no longer true — Noctis' control carries 111.0 of range (a
cheekbone and a nasolabial fold), so he VOIDs for `CONTROL_CEILING` where he
used to VOID for clipping. The control was written against a face that had no
cheek. Candidates: move the control to the forehead, or raise
`CONTROL_CEILING`, or score the ratio rather than the difference.

---

## 2. Also landed this pass

### `7b2d4ce` — the nose was the right length and had nothing to be long against

Found before the winding, still correct, and independently worth having.
`src/tools/probes/facesect.mts` prints the surface as a **section** — `z(x)` at
each landmark height plus the median profile — instead of as one extremum, and
the shipped head read, at pronasale height:

    x mm      0     4     8    12    16    20    26    32    40
    z mm   67.3  66.0  62.8  59.6  59.8  59.0  53.5  52.2  50.6

4.5 mm of relief at 8 mm out, 16.7 mm at 40, where a head does 35-45. The
section at *eye* level fell away faster than the section at the nose.
`noseLeadMm` was right all along: pronasale minus subnasale on the midline is
20.5 mm against Farkas' 21. **The nose is the right length; it had no cheek to
be long against.** Two causes:

1. `FACE_FLAT = 1.30` was applied at every height. It was derived at the
   upper-lip line, where a maxilla is broad and flat; at the nose line it is a
   cheek at z = 89.3 mm instead of 78.7. Now ramped off between the nose tip and
   the mouth line by `faceFlat(yn)`, so the gate it was derived for is
   untouched.
2. The two dorsum brushes had `r_x` of 17.5 and 16.5 mm — a 34 mm bridge, wider
   than a real nose at the wings. Narrowed to 10-12, amounts raised, plus
   lateral nasal walls, a doubled alar crease and a deeper nostril.

Plus: `profileW`'s upper half was `sqrt(1 - yn^2)`, a hemisphere — 0.60 of full
depth at 0.8 of the way to the vertex where a braincase holds ~0.75. Bald, the
head came to a **point**. Same power family as the lower half now.

After: tip minus x=8 is 10.1 mm, tip minus x=40 is 27.2. Geometry rows:
noseLead 26.8 -> 29.8, mouthRelief 5.80 -> 6.56, jawWidthErr 0.0175 -> 0.0095,
transverseDrop 7.2 -> 8.8 against a limit of 12. All four heads still PASS.

### `3523898` — Gladiolus' beard, and pass 4's patch as a negative

Pass 4's `width 0.9 -> 1.5 mm` was applied, captured and judged: **negative**.
1 068 roots at 1.5 mm read as black birds on his jaw — a wider strand is a more
legible *object*, not a denser mass — and the control patch moved 221.3 ->
213.9 of 255. That is two measured negatives on the same defect (doubling the
count, pass 3; widening the strand, pass 4). Neither count nor size is the
lever.

What landed instead: **contrast against the beard shadow the map already
paints** (`paintFace`'s stubble block, `look.stubble` 0.88). Short enough not to
be objects (2.4-3.4 mm, down from 20 px to 9-12), thin again (0.9 mm), splayed
wider, and lifted to roughly the value of the painted mass (0x6d5942 /
0x8f7a5e). `n` unchanged, so no extra vertices. 221.3 -> 200.2 and he is still
VOID; on the lit half it now reads as stubble, on the shadow half the strands
are still silhouetted black. Better, not fixed.

`tmp/head-p4-beard.patch` is now applied-and-superseded, and `stash@{0}`
("head-p4: Gladiolus beard, unverified") is **stale — drop it or ignore it**.

---

## 3. State, and what I looked at

HEAD = `d866db7` (+ `pnpm run check` clean at the time of writing). `facecheck`
PASSes 4/4 on the geometry rows with two heads measurable on the pixel rows.

Frames, described because `tmp/` gets pruned:

- **`tmp/shots/p5-fixed/noctis_front.jpg`** — bald, 0.55 m, on the head's own
  axis, hour 14.5, after the winding fix. **It is a face.** Nose, nostrils,
  philtrum, lips with a vermilion border, a mental crease, a chin, brow ridges,
  eye sockets, cheekbones, a jaw line. The midline hairline is gone.
- `tmp/shots/p5-corpus/hero_portrait.jpg` — the judged frame. A face with a
  mouth and modelling where the handoff before this one had "a pale blown mask".
  The lit half is no longer clipped, because the face is no longer a flat plate.
- `tmp/shots/p5-corpus/hero_full.jpg` — no regression; four bodies read as
  bodies.
- `tmp/shots/p5-hours/`, `p5-s1/` — the before/after ladder at hours 9, 12, 14.5
  and 16.2, hair hidden.

**Say plainly which one this pass is: this is the fix, not another "better".**
The face items that follow are ordinary sculpt notes on a head that now has a
face, not another round of hunting a missing one.

---

## 4. Next, in order

1. **Recalibrate `facecheck`'s control window** (§1). Two heads VOID for the
   good reason now and the gate cannot see its own best result.
2. **`hero_portrait`'s fringe throws hard black stripes across the face** —
   they read as scratches, and at this range they are the loudest thing left on
   the judged frame. `Hair.ts` + whatever casts them.
3. **Re-judge every open head item against the fixed shell.** Most of the
   backlog was written about a frame that did not contain the face:
   - the **ear's 16 mm** — still a flat scoop standing off the head, visible in
     `p5-fixed`. `WIP` commits `10d8c42`, `6397de1`.
   - the **fringe length** `Shots.ts` asks for.
   - the cranium and the C7 -> acromion shoulder yoke.
   - the mouth reads a little "duck-lipped" now that it is visible; the lips
     were pushed up this pass and may now be one step too far.
4. **`Noctis_body`, `Noctis_hair`, `Noctis_outfit` and both eye meshes all have
   negative signed volume** (`facewind.mts`'s new block). Hair and outfit are
   `DoubleSide` so it cannot show; the **body is `FrontSide`** and its bare arms
   and hands look correct in `hero_full`, so this is most likely just an
   open-sweep artifact of the statistic. **It is not proven.** The cheap check
   is a `--hide outfit` capture of a bare torso, and it is worth 10 minutes
   given what the same statistic just found on the head.
5. §WS-11's untouched character list: Ignis is still one black column; the
   sleeve cut; Noctis's skull print at 0.95 m; the hole at the collar;
   `_probe/hands.mts`'s `_palm*` framings sitting inside the geometry.

## 5. Closed as measured negatives this pass

- **Widening Gladiolus' beard strands** (0.9 -> 1.5 mm): 221.3 -> 213.9 of 255,
  and it reads *worse*. §2.
- **`FACE_FLAT` as a whole-head constant**: it buries the nose. Ramped, not
  removed — 1.30 is right where it was derived.
- Everything the midline hairline was blamed on, each by its own capture and
  none of them the cause: **the hour** (9/12/14.5/16.2), **the painted map**
  (`facefront_flat.mts`; and `facemapscan.mts` shows the texels are smooth
  across u = 0.485..0.515 at every row), **the pore normal map**, **the mip
  chain and anisotropy**, **the shell's normals** (negated, and replaced with a
  radial field), and **the character's own shadow**. It was the winding.
- Inherited and still standing: `SKIN_BASE`, mip selection, an occluding
  surface, `patchSkin`'s uv, the head's pitch, the mouth line's blur and value,
  the face material's `sheen` and `specularIntensity`.

**Retired hypothesis:** pass 4's UV pole at the menton. The fan is real —
`uvOf`'s `atan2(x, z)` does converge under the jaw — but it is *below* the chin,
`v` is linear in `y` and registers, and the mouth's absence was the culling. Do
not spend a pass on it; if the lower-face paint ever needs a better chart, that
is a quality item, not a defect.
