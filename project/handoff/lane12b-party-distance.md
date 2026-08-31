# Lane 12b — the party at playing distance

Plan: `docs/plans/2026-08-30-fable-to-nine.md` §4. Three tasks: the four blank
portraits, the head at 5–20 m, and Gladiolus' "hole in the shirt".

## Status

| # | task | state |
|---|------|-------|
| 1 | four blank portraits | **LANDED** `f1ccc84` + `1dd38d4` + `b068756`, **verified by eye** in the HUD at 5 m |
| 2 | head at playing distance | **DIAGNOSED + hair FIXED** `106d4c6`, **verified by eye** at 5 m |
| 3 | Gladiolus' shirt hole | **measured negative — it is his bare arm**, confirmed by ablation |

## The coordinator's Float16 question, answered

**Every capture in this lane was taken on `e848801` or later**, i.e. *after* the
`AttrPack` half-float fix. The player's description still holds exactly:
`tmp/shots/l12b-dist/d5.jpg` and `d10.jpg` (2026-08-31, HEAD = `e848801`) show
four heads with grey-to-white hair and a pale face carrying one dark band across
the eyes. **The blown-white vertex-colour bug was not what the player saw.**

## 1 — the portraits (landed)

Not a wiring gap and not a missing asset: `Icons.portrait` **is** the portrait.
It draws one procedural bust silhouette on a hue-tinted gradient, and
`GameData.MEMBER_UI` gives the four heroes hues 218/24/268/44 which the card
renders at **8–11% saturation** on purpose (the comment at `Icons.ts:154` says
why: at 26–30% the pause menu read as a colour-swatch strip). So the hue was
carrying the whole job of telling four people apart, at 38 px, at one tenth of
the saturation it needed. Four identical grey blanks is the correct output of
that code.

Replaced with a **render of the real head**, `src/ui/Portraits.ts`:

- bakes **in the live scene**, isolating one hero with camera layer 5, rather
  than in a private scene with its own lights — light *counts* are program
  parameters on `MeshPhysicalMaterial`, so a private key light recompiles every
  character program, and a private scene also loses the environment probe and
  the CSM cascades. **Three tests lights against the camera layer mask like any
  other object**: the lights must be `layers.enable`d too or the head renders
  unlit black. That was the one non-obvious part.
- `scene.background = null` and `shadowMap.autoUpdate = false` for the single
  render; `scene.fog`, the light count and `shadowMap.enabled` are untouched
  because each is a program parameter. The bake compiles nothing.
- runs from `HUD.lateUpdate`, one hero per frame, four frames in — it borrows
  the shadow maps and on frame 0 they hold nothing.
- a render target gets neither tone mapping nor an output transfer function, so
  the ACES fit is applied in JS over the clamped-linear readback, after a
  mean-luminance normalisation. **`maxGain` matters more than `targetLuma`** —
  uncapped, a hero in shade is pushed three stops and arrives as a white mask.
- `PortraitStore` is a registry rather than a getter because the four widgets
  that open plates (party stack, pause menu, Gear, camp) build at four unrelated
  moments and none can wait for a bake.

**Verified in three places by eye.** The HUD stack at 5 m
(`tmp/l12b/pf_zoom2.png`, a 4x crop of `tmp/shots/l12b-tint1/d5_hud.jpg`): four
distinct heads with the right hair colour where there were four identical dark
plates. The Main Menu's 112x132 cards (`tmp/l12b/menu_cards.png`, from
`tmp/shots/l12b-menu/menu_main.jpg`): four recognisable faces with eyes. The
Gear screen uses the same call and the same store.

**And measured, because the menu cards *look* blown at a 3x upscale and are
not.** Percent of covered pixels with any channel >= 230, over the sweep:
g30 puts 7.32% of Gladiolus and 4.85% of Noctis there; **g24 puts 0.00–0.05%**
of every hero there and nothing at all >= 250. The white on the cheeks in
`menu_cards.png` is JPEG plus a 3x resample of a 190 px card, not clipping. The
red is the skin's own colour — see the §12.1 note under task 3.

`tmp/l12b/pf_zoom.png` (a 4x crop of
`tmp/shots/l12b-p1/d5_hud.jpg`): four distinct heads in the bottom-left stack
where there were four identical dark plates. `tmp/l12b/pf_grade.png` is the
eight-variant sweep at 288 x 336 that chose the grade; `src/tools/_probe/pfbake.mts`
regenerates it in one boot.

## 2 — the head at playing distance: it is not a distance defect

Two measurements, both new:

**(a) A constant-head-size distance ladder.** `tmp/l12b/zoom.json` frames Noctis
and Prompto at 1.0 / 3 / 5 / 10 / 20 m with the fov narrowed so the head covers
the *same pixels* at every range — so anything that changes is mip selection,
LOD or alpha coverage, and nothing that changes is "fewer pixels".
`tmp/l12b/noct_ladder.png` and `prom_ladder.png`: **1 m and 5 m are the same
image.** No LOD swap, no mip collapse, no alpha-test dropout. (The 20 m rungs
missed — the lens ends up inside a hillside; re-derive with `camAt`/`aimAt` if
anyone wants them.)

**(b) The portrait bakes at 0.6 m.** `tmp/l12b/pf_grade.png`. Ignis' hair is
**silver**. Prompto's is **grey-khaki, not blond**. Noctis' crown is charcoal
with a near-white fringe hanging over both eyes. Only Gladiolus reads brown.

So the player's "four grey-haired people" is **the shipped colour of the hair at
every range**, and the reason a portrait-range lane never caught it is that
`ART-DIRECTION` §12.3 — the only calibrated statement of what hair should be —
is a table of **luminance** percentiles. Lane 1 matched Y and matched it well.
Nothing ever measured chroma, and a distribution can match a plate's Y at every
percentile while having no colour in it at all. That is grey hair.

The authored albedos say the same thing without any rendering at all
(`src/characters/Cast.ts`): Ignis `color 0x8f8371` / `tipColor 0xdecbae`,
Prompto `0xa8977e` / `0xf4e2bd`. Those are warm greys — 21% and 25% saturation,
with tips at 80% and 96% value. §12.3's plates put Prompto's blond at
`#968567` (R−B **+47**) in the top decile and Ignis' ash at `#642402`
(R−B **+98**) at the *median*.

### The fix, landed in `106d4c6`

Ignis `0x8f8371`/`0xdecbae` -> `0x875f3e`/`0xd8b074`; Prompto
`0xa8977e`/`0xf4e2bd` -> `0xac9256`/`0xfad78c`. R-B, p10/p50/p90/p99, measured:

    ignis    before   6  19  29  33      after  21  42  62  76   plate  23  98 126 129
    prompto  before   8  23  34  39      after  23  46  68  79   plate -22  -9  47  55

Luminance moves only where it was already hot: Ignis 36/69/109/149 ->
30/57/92/131 against a plate 11/47/73/83; Prompto held at 39/71/114/159 against
26/82/130/169. **Verified by eye at 5 m**, `tmp/l12b/hair_ab.png`: Ignis goes
from silver to golden ash-brown, Prompto from grey to sandy blond, Noctis stays
near-black, Gladiolus brown. Four distinguishable heads.

Not done, and deliberately left to lane 1: **Noctis' near-white fringe**. His
numbers are the closest to the plate of the four (Y 37 against 36 at the median)
and his hue is a judged call recorded in `Cast.ts`; what reads pale on him is
the fringe and the hairline wisps, not the albedo.

### The other half of the player's sentence — "a beige smear with a dark smudge
where the eyes go"

Not fixed, mechanism identified, **not measured**: three dark painted decals
stack inside one horizontal band across the eyes — `browShadow`
(`rgba(...,0.58-0.62)`), `fringeShadow` (0.28-0.50) and `lashColor` — on top of
the eye sockets themselves. At portrait range they read as brow, lash and
fringe; at 30 px of head they merge into one band, which is exactly the phrase
the player used. That is lane 1's task 6 (the painted creases, half landed and
still gating `facecheck` VOID / plan task 47), and it should be **graded at 5 m
as well as at 0.55 m** when it is re-opened.

`src/tools/_probe/hairstat.mts` (new) is the instrument: it hides every mesh on
the hero except the hair, bakes through `Portraits.bake`, and takes the
percentiles over the **alpha mask** rather than a rectangle — so the region
cannot drift between runs, which is the failure `LANDMINES.md` records for a
fixed `regionstat` rect.

## 3 — Gladiolus' "large skin-coloured hole in the back of his shirt"

**Measured negative. Lane 2 was right and I initially repeated the same
mistake**, which is worth recording because it is now three people in a row:
`tmp/l12b/gladio_d5.png`, a 4x crop of him from behind at 5 m, shows a tan panel
that looks unmistakably like a hole in a garment, and it is his arm.

Settled by ablation at one fixed rear framing, `_probe/gladioback_{nobody,nooutfit,plain}.mts`
(they hide a mesh and hand `framecam` the specs, so all three runs are the same
two cameras):

- **body hidden** (`tmp/shots/gb-nobody/gb_rear.jpg`): the garment is a
  continuous black shell from shoulders to hips. **No gap anywhere on the back.**
- **outfit hidden** (`tmp/shots/gb-nooutfit/gb_rear34.jpg`): the tan mass is
  continuous from deltoid to wrist and ends in a hand, and the back behind it
  carries the eagle ink. The **tattoo renders correctly** — worth stating,
  because it was my first hypothesis that it did not.
- **neither hidden** (`tmp/shots/gb-plain/gb_rear34.jpg`): back covered, arm
  bare, no hole.

So the defect is a **read**, not geometry: a bare arm at Y≈150 hanging against a
torso at Y≈15, with no separating shadow and at 30 px of width, reads as a hole
in the shirt. Three observers have now called it one. It needs an art answer,
not a clearance number — the two obvious ones are extending `eagleInk` onto the
deltoid and upper arm (on-model: in FFXV the eagle wraps his right shoulder) and
a contact-shadow term where the arm meets the torso. Both are `src/characters/`
work and neither is started.

### Skin value, coarse, for whoever picks that up

Prompto's lit cheek in full sun at 1 m (`tmp/shots/l12b-zoom/prom_1p036m.jpg`,
60 px block means) reads `#ae8560` / `#b7805b`. `ART-DIRECTION` 12.1 puts skin
in full midday sun at p65 `#80694a` and p90 `#a58d66` — **our mid-tone sits at
the plate's bright decile**, and R−B is 78 against the plate's 54 at p65. That
is the same shape of error as the hair (too bright, too warm) and it is what
makes the bare arm shout. **Coarse: JPEG, hand-placed blocks, a different plate
lighting. Re-measure with a mask before acting on it.**

## Gates run

`node src/tools/facecheck.mts` on `106d4c6`: **PASS**, 4 heads on the geometry
rows, 2 measurable on the pixel rows, `noctis` and `gladio` VOID on
`CONTROL_CEILING` — **the same two VOIDs lane 1 recorded**, unchanged by the
hair re-tint, which is the point of running it. Geometry rows unmoved
(noseLead 27.6–28.3, mouthRelief 6.53–6.82, jawWidthErr 0.0135–0.0450).

`pre-commit` (build + both typechecks + 4 cheap gates) passed on every commit.

**Not measured: the bake's frame cost.** Four extra 288x336 renders plus four
`readRenderTargetPixels` stalls, once per session, on the four frames after the
HUD's first `lateUpdate` — i.e. **after** `GAME.ready`, so no first-frame metric
sees them. Seven other lanes were capturing throughout, so any number I took
would have been worthless.

## Files touched

`src/ui/Portraits.ts` (new), `src/ui/PortraitStore.ts` (new), `src/ui/Icons.ts`,
`src/ui/HUD.ts`, `src/ui/PartyPanel.ts`, `src/ui/screens/MainScreen.ts`,
`src/ui/screens/GearScreen.ts`, `src/tools/_probe/pfbake.mts` (new),
`src/tools/_probe/hairstat.mts` (new), `src/characters/Cast.ts` (Ignis' and
Prompto's `hair.color` / `hair.tipColor` only),
`src/tools/_probe/gladioback_{nobody,nooutfit,plain}.mts` (new).

## Open, and the exact next step

1. **Noctis' hair still reads grey at 5–10 m** and I did not touch it — the
   `ART-DIRECTION` 12.3 / `Cast.ts` contradiction below is a decision, not a
   lane task. If the human rules for the plate, the change is one hex in
   `Cast.ts` (`0x2c2823` -> about `0x252a33`, R−B +9 -> −14, luminance held) and
   `_probe/hairstat.mts` re-run is the whole verification.
2. **Ignis is still 20 Y over the plate at the median** (57 against 47) after
   the re-tint. Darkening his `hair.color` toward Y 85 would close it; I stopped
   because the chroma was the complaint and I had a frame that showed it fixed.
3. **The eye band** — lane 1's task 6, and it should be graded at 5 m as well
   as at 0.55 m.
4. **Gladiolus' arm** — `eagleInk` onto the deltoid, or a contact-shadow term
   where the arm meets the torso.

## Also seen, not mine

- **Two large black tori lie on the ground beside the party spawn**, 1–2 m
  across, in every frame at playing distance —
  `tmp/shots/l12b-dist/d5.jpg`, `d10.jpg`, `d5_hud.jpg`. They read as giant
  inner tubes. **Not identified** — a scene walk listing every mesh within 12 m
  of the player comes back with everything at distance 0.0, because the props
  near spawn are instanced/merged and their object positions are all the origin.
  Identifying them needs a raycast from the camera into the torus, not a
  proximity list. Candidates by shape are `RoadFurniture.tyre`
  (`TorusGeometry(0.42, 0.16)`, `:152`) and `Outposts.ts:309`
  (`TorusGeometry(0.4, 0.15)`) at roughly 4x scale.
- **`ART-DIRECTION` 12.3 and `Cast.ts` contradict each other on Noctis' hair
  hue, and it needs the human.** The table says his hair is `B > G > R` at both
  p10 and p50 (`#101922`, `#1f2630`) — a blue-black. `Cast.ts:104-117` records
  lane 1 deliberately moving *away* from a blue (`0x252834`, R−B −15, which is
  within 2 of the plate) to `0x2c2823` (R−B +9) on the grounds that at that
  saturation blue reads as slate. Measured, his hair now sits at R−B +5 where
  the plate is −17, and at 8 m he still reads grey-haired
  (`tmp/shots/gb-nooutfit/gb_rear34.jpg`, Noctis at frame left). I did **not**
  re-tint it: it is a judged call with a written reason, against a measured
  table, and that is a decision, not a lane task.
- **`src/ui/` is not free** — lane 12c is live in it (`ui.css`, `Layers.ts`,
  `ui-shoot.mts`). No collision so far; `HUD.ts` is the file at risk.
