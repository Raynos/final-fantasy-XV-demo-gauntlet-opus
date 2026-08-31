# Lane W3-C — the party's faces and identity

Playtest complaint #3, verbatim: *"The four heroes don't look like people, and
they don't look like each other's characters… front-on, Noctis's face is a
smear… at mid distance everyone gets a bright orange band across the eyes, like
they're all wearing blindfolds… Ignis and Prompto are the same blond model twice
and I genuinely could not tell them apart."*

Five lanes had already worked this area. This lane's contribution is that it
**judged at the distance the player judges from** — native fov 50 at 3 / 5 / 8 m,
which puts a head at 70 / 42 / 26 px — instead of at the 0.4–0.6 m every previous
lane used, and the cause turned out to be something none of the standing notes
named.

## The finding, and it replaces three standing diagnoses

**The four faces are corrugated. Roughly a quarter of each visible face has its
normal turned past 90 degrees from the key, so it receives no direct light at
all, and at 26–42 px of head those unlit bands merge into the playtest's
"smear", "orange blotch" and "band across the eyes".**

Measured, `src/tools/_probe/facerelief.mts` (new — see below), baseline at
`b1e5666`:

```
            keyDark  keyDeep      (fraction of front-facing head verts with
  noctis     0.2647   0.1247       N·L <= 0, and <= -0.3, against a canonical
  gladio     0.2454   0.1230       front-and-above key in the head's own frame)
  ignis      0.2548   0.1241
  prompto    0.2658   0.1227
```

A real head lit from front and above is near zero on both. The four numbers
agree to 2% because all four heroes share one sculpt — which is also why "they
don't look like each other's characters".

**In pixels**, at `tmp/shots/w3c-abl-base/prompto_h5.png` (fov 50, 5 m): lit skin
lands at Y 180–210 and the mid-face bands land at **Y 0–20**. That is a
lit:shadow ratio of 10–30x where `ART-DIRECTION` §12.1 measures FFXV at
**2.0–3.2x and never more**.

### What it is NOT — five ablations, all at the 5 m framing

Every one of these was run through `tmp/w3c/abl_*.mts` (a template with the arm
baked in; `framecam --probe` runs the ablation and then emits its own framings,
so one boot per arm). Deltas are `imgdiff` mean over a 120x90 crop of the face:

| arm | what it removes | mean delta |
|---|---|---|
| `flat` | painted face map -> flat `#b08a70` | **0.72/255** |
| `novcol` | vertex colours as well | **0.74/255** |
| `nonorm` | the normal map | **0.34/255** |
| `nosss` | `uSssAmt = 0` | **0.56/255** |
| `noselfshadow` | `castShadow = false` on the whole character | **nothing** |
| 2x supersample, box-filtered back to 1600x900 | undersampling | **the same image** |

So the painted `browShadow` / `fringeShadow` / `lashColor` stack that the
standing note blames for the "orange band" is **not** the orange band; the
shadow map is not it; and it is not aliasing.

`headflag` (the head mesh painted flat unlit magenta) comes back magenta over
every dark pixel, so the head mesh is what draws there. `dbg_ndl` (a debug pass
writing `clamp(dot(N, L))` into the frame) reads **exactly 0** on every dark
pixel, and read as an image (`tmp/w3c/pr_ndl.png`, 16x) it is a hard
black-and-white **zebra** across the whole mid-face. That is the whole
mechanism.

## Landed

| # | change | state |
|---|---|---|
| 1 | skin shadow-side fill died past the terminator | **LANDED** `b1e5666`, measured, small |
| 2 | face relief low-pass + the instrument | **LANDED** `4c24830`, measurement PENDING |

### 1 — `b1e5666`, `rig/Materials.ts`

`wrapN` in the subsurface block reaches zero at `ndl = -0.62`, so a surface that
turns 38 degrees past the terminator receives no fill at all. The floor is
`wrapN` evaluated at `ndl = 0`, so `max()` is a **no-op for every ndl >= 0** —
the lit half of every face and body in the game is bit-identical — and below the
terminator the fill holds instead of falling to zero.

**Measured and it is a small positive**: the darkest mid-face pixels went
Y 1–16 -> Y 3–20 (`tmp/shots/w3c-f1/prompto_h5.png` against
`tmp/shots/w3c-abl-base/`). **Not the fix**, and a calibration sweep says a fill
cannot be the fix: multiplying `uSssAmt` by 8 (0.16 -> 1.28, which would make
every face crimson) only takes the deepest pixels to Y ~30 against a §12.1
target of ~59. Keep it — it is right on its own terms — but the lever is the
sculpt.

### 2 — `4c24830`, `rig/Face.ts` `smoothRelief` + `FACE_RELIEF_SMOOTH = 40`

`buildHead` now separates the skull base from the brush displacement, low-passes
the **displacement** in the head's own (u, v) grid, and adds it back. λ = 0.5,
40 passes, i.e. a gaussian of about 3.2 columns; `u` wraps at the seam, `v`
clamps at the two poles. `FACE_RELIEF_SMOOTH` is exported so it can be swept, and
**0 restores the sculpt exactly**.

Why the displacement and not the positions: smoothing positions is curvature
flow and shrinks the whole head. Why not scale the brushes down: that costs
`facecheck`'s `noseLead` and `mouthRelief`, which four previous rounds fought to
get, whereas a low-pass costs a broad feature almost nothing (the nose spans ~40
columns of this grid) and destroys corrugation that is 5–8 columns wide.

**NOT YET VERIFIED.** The `facerelief` re-measure and the 5 m capture were still
in the harness queue when this was written. The exact next step is below.

## The exact next step

1. `node src/tools/framecam.mts --probe src/tools/_probe/facerelief.mts --out tmp/shots/x`
   and compare `keyDark` / `keyDeep` against the baseline table above. **If
   `keyDark` does not fall below ~0.10, raise `FACE_RELIEF_SMOOTH`**; the
   constant is a single export in `Face.ts`.
2. `node src/tools/framecam.mts --probe src/tools/_probe/w3cdist.mts --out tmp/shots/y`
   then `node src/tools/crop.mts tmp/shots/y/prompto_h5.png out.png 740 400 120 90 8`
   and **look at it**. The before frame is `tmp/w3c/pr_base.png`: a pale dome with
   a black band across the brow and a black mass over the nose and mouth.
3. `node src/tools/facecheck.mts --only noctis,prompto` — the geometry rows must
   hold: noseLead 27.6–28.3, mouthRelief 6.53–6.82, jawWidthErr 0.0135–0.0450.
   **A low-pass is expected to cost some of noseLead**; if it falls out of band,
   drop `FACE_RELIEF_SMOOTH` until it comes back.
4. Watch the **cold-boot cost**: 40 passes over a 145x121 grid runs for every
   `buildHead` in the world, not only the four heroes. If `bootprof` regresses,
   restrict the loop to the face columns (`|u/segU - 0.5| < 0.28`) with the
   boundary held fixed — cheaper and it also stops the scalp moving under the
   hair roots, which `skullSampler` samples on the *unsmoothed* path.

## Also found at playing distance, not fixed

- **Noctis's silhouette really does read female**, and it is a costume-shape
  problem exactly as reported. `tmp/w3c/noctis_bodyx3.png` (2x crop of
  `tmp/shots/w3c-where/noctis_body.png`, front-on at 4.2 m, native lens): a
  fitted black **sleeveless bodice with a scoop neckline** and a light emblem on
  the chest, two **rounded puffed black shoulder caps** with bare skin-coloured
  arms below them, and a waist. `BRIEF.md` specifies "black layered jacket, slim
  silhouette". The shoulder caps are the `epaulettes` / sleeve head, and lane 1's
  `SKIN_CLEARANCE = 0.030` (30 mm added to every garment radius, filed in
  `HUMAN_REVIEW.md` as absorbing a drape bug) is a candidate for why they read as
  puffed. `rig/Outfit.ts` + `Cast.ts` — not this lane's file and not started.
- **Ignis's glasses are sub-pixel at playing distance.** `Outfit.ts:1060` builds
  the rim as a tube of `rx 0.0018 * s`, i.e. **3.6 mm of frame seen front-on**.
  At 5 m the frame is 193 px/m, so the rim is **0.7 px** and at 8 m it is 0.43 px.
  His one distinguishing feature does not survive to the distance the player
  judged at, which is most of "Ignis and Prompto are the same blond model twice".
  The fix is **area, not line**: a thicker rim (~5 mm) plus a lens with a real
  tint, so the read is two dark ovals rather than two hairlines. Comment at
  `Cast.ts:498` already says "the rim geometry is the whole silhouette read" —
  it is right, and the rim is 0.7 px.
- **All four heroes wear a black sleeveless top at playing distance.** Noctis a
  bodice, Prompto a vest, Gladiolus a harness over a bare back, Ignis a coat.
  Front-on at 4 m the four silhouettes differ mainly in hair colour.

## Files owned / touched

Owned this lane: `src/characters/rig/Face.ts`, `src/characters/rig/Materials.ts`,
`src/tools/_probe/facerelief.mts` (new), `src/tools/_probe/w3cdist.mts` (new).
Scratch, uncommitted, in `tmp/w3c/`: the ablation template `_abl_tpl.mts` and its
arms, `grid.mjs` (a hex/luminance grid printer for a face that is only 28 px
across), `box.mjs` (integer box-downsample, for the supersample control).

## Landmines this lane hit

- **The constant-head-size distance ladder cannot see a mip or an LOD defect.**
  `lane12b-party-distance.md` says its ladder "proved 1 m and 5 m are the same
  image, killing LOD, mips and alpha-test in one capture". Mip selection is a
  function of texels per **pixel**, and a ladder that holds the head at a
  constant pixel size holds that ratio constant by construction — so the ladder
  is silent on mips, not exculpatory. (Mips are still innocent here; a flat
  albedo ablation settles it.)
- **`framecam --probe` runs its ablation once, before every capture in the run.**
  There is no way to switch arms inside one boot, so an A/B is one boot per arm
  and the arm has to be baked into the probe text. `tmp/w3c/_abl_tpl.mts` +
  `sed` is the pattern.
- **A 6400x3600 `framecam` capture comes back black** (max channel value 1).
  3200x1800 works and is enough for a 2x supersample control.
- **A patched material's uniforms are reachable from a probe** as
  `g.renderer.properties.get(mat).uniforms.uSssAmt` — that is the only handle on
  the closure `patch()` keeps them in, and it is how the fill was swept without a
  rebuild. To force a *new program* for a debug output, set
  `mat.customProgramCacheKey = () => '<something>'` as well as `needsUpdate`.
- **A backtick inside a `//` comment in `Materials.ts` breaks the build**: the
  GLSL blocks are template literals, so a comment written in markdown style
  terminates the string. The typechecker reports `TS1005: ',' expected` fifteen
  lines away.
