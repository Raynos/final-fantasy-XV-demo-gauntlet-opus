# Lane 12f — the rest of the playtest list

*2026-08-31, from `f81719053bd5`. Playtest complaints **#7, #12, #14, #16** — the
four nobody else took. All four **landed and verified by eye**.*

## Status

| # | complaint | state |
|---|-----------|-------|
| A1 | haven camp: opaque yellow light cone into a black pot | **LANDED** `0a7d7ff`, verified |
| A2 | haven camp: logs in lurid orange tiger stripes | **LANDED** `0a7d7ff`, verified |
| A3 | haven camp: tent a black moiré checkerboard | **LANDED** `0a7d7ff`, verified |
| A4 | haven camp: the party isn't at the camp | **LANDED** `f2a5bb1` + `562fc3d`, verified |
| A5 | haven camp: meal options unreadable on sunlit sandstone | **LANDED** `f495553` + `562fc3d` + `b372efb`, verified |
| B1 | HUD "(2/3)" vs quest-log row "0/2" | **LANDED** `f495553` |
| B2 | quest log's own cache never sees an objective counter tick | **LANDED** `f495553` (found while fixing B1; the playtest could not have seen it) |
| B3 | "QUEST LOG 4 · 3 available · 2 finished" over 4 active | **LANDED** `f495553` |
| B4 | "0 gil, Hi-Potion ×2" | **LANDED** `f495553`, both copies of the line |
| C | night stars a snowstorm; moon a blown-out disc with a halo | **LANDED** `f95a5fd` + `7e55f4c`, verified |
| D | companions clipping the camera; no near-camera fade | **LANDED** `f2a5bb1`, mechanism verified; see "not verified" below |

## Gates

Run after everything landed, on a tree with other lanes live:

- `uxcheck` **95/95** — unchanged.
- `integration` **27 pass · 0 wired-but-unproven · 0 not integrated** — unchanged.
  Its "camp at a haven" row still passes (21 camps, slept at Redlyn Haven).
- `drawcheck` **PASS, worst 747 (`lest_street_night`), median 587, headroom 53.**
  Was worst 745 / headroom 55. +2 draws on a shot I did not touch, inside the
  gate's own reproducibility (LANDMINES: "drawcheck's tolerance is smaller than
  its own reproducibility"). I *removed* a flame card, so the direction is not
  from this lane.
- `pnpm run check` **not run** — the coordinator owns the suite (LANE_CONTRACT).

## What was actually wrong, per item

### A1–A3 — three defects, three causes, none of them what the words suggest

`src/world/props/Landmarks.ts:172-434` builds the haven the player stands in
(`PoiKits._haven` is the scattered POI variant and shares the two textures).

- **The cone is not a light volume.** No `ConeGeometry` exists anywhere near a
  haven. It is `flameTexture` (`PropMaterials.ts:667`): the profile
  `wid = 0.5 * t^0.55` is widest at the fuel and zero at the tip — a light
  shaft's shape, not a flame's — and `alpha = min(1, a * 1.35)` clipped a
  perfectly smooth `1 - d*d` falloff to 1 across the whole interior, leaving the
  gradient alive only in a thin rim. Three double-sided cards at 60° then summed
  **six** opaque layers.
  The pot: cards were 2.5 m on a pit of r=1.25, tip at `top+2.68` against a pot
  hung at `top+1.55`. It speared through and out the other side. Now
  `sin(PI * t^0.78)` pinched at the fuel, no alpha gain, 1.05 × 1.45 m, two
  cards at 90°, opacity 0.55 and a 0.34–0.62 flicker.
- **Tiger stripes were contrast**, the same defect `rustMaterial` already has a
  paragraph about one function away. `woodMaterial`'s `sin(v * 130)` is 20.7
  cycles/UV, and on the 1.8 m log cylinders v runs along the axis — twenty-one
  *rings* at 8.7 cm pitch — at `k = 0.62 + h * 0.62`, a 2:1 albedo swing under a
  `0xff7a26` point light. Now 6.7 cycles at 1.28:1, warp raised, normal 1.6→0.8.
- **The moiré is Nyquist, not filtering.** `bakedTexture` already mips at aniso
  16; there is nothing left to filter because the checker is in mip 0.
  `canvasClothMaterial`'s `sin(u * 420)` is 66.85 cycles/UV against a 256-texel
  bake that point-samples once per texel — **3.83 texels per cycle**. The product
  of a u-weave and a v-weave at that frequency *is* a checkerboard, and 66.85
  does not divide the repeat so the beat drifts under `RepeatWrapping`. Now 15
  cycles (17 texels/cycle) with fbm carrying the detail, 1.69:1 → 1.36:1, and the
  tint `0x36414c` → `0x6d6350` (weathered khaki) in both builders.

**Verified**: `tmp/l12f/camp8/c-4-cook.jpg` (midday) and
`tmp/l12f/camp-night/c-1-approach.jpg` (22:18) — khaki tent with no pattern, a
compact orange flame under the pot rather than a wedge through it, logs that
read as wood.

### A4 — the party

Nothing in the game had ever asked the party to be anywhere except behind
Noctis, and `Party`'s three slots are `[-1.95,-0.95]`, `[1.85,-1.45]`,
`[0.85,-2.75]` — a wedge off his shoulder, held perfectly while the fire, the
chairs and Ignis's own stove sit empty two metres away.

`Party.stations` / `stationAt(x, z, radius, phase)` / `release()` override
`m._target` **after** `_slotTarget`, so they *walk* in through the existing
steering, separation, arrival damping and ground-following. Ring spreads 260°,
not 360°, with the open sector aimed back at the player. `HavenCamp.open` calls
it and releases from `onEnd` — `Dialogue.end` runs that on every exit including
Escape, and a release only three of four paths reach is a party frozen at a
campsite the player left an hour ago.

A stationed companion also gets `urge = 3.6` rather than 1.9 m/s: the player is
standing still at the fire, so there is no player speed to inherit and they
otherwise arrive after the conversation is over.

**Verified**: from 14 m out, Gladiolus and Ignis reach their marks (0.5/0.6 m,
speed ~0.04) inside 400 frames and stand at the camp in
`tmp/l12f/camp8/c-4-cook.jpg`.

### A5 — the menu had THREE causes, and the third is the big one

1. `.dlg-ch .dlg-t` was `--ink-3` = `rgba(210,224,246,.56)` — *pale*, not dark.
   Over sunlit sandstone at ~(200,175,140) that composites to (205,202,200):
   light grey on light sand. `.dlg-note` — the field that says what the meal is
   *worth*, the entire decision — was `--ink-4` at 0.34 with **no text-shadow**,
   the exact shape `b3dbbdc` found on the Armiger caption.
2. The scrim is an ellipse at `50% 60%` of a box whose choice list hangs *below*
   that centre, so it had fallen to zero by the time it reached the rows. That
   is why the speaker's line one inch above is legible in the same frame.
3. **`Dialogue.update` renders the whole choice list at `0.24` opacity until
   `choosing`** (`_lineDone && _lineIdx >= _lines.length - 1`). The cook node has
   two lines whenever a meal is already running — and the seeded save always has
   one — so a player reading Ignis's menu is looking at the preview state for
   both. 0.24 of 56%-alpha ink over rock in full sun is not greyed, it is gone.

Fixed: per-row dark plate `.84 → .46` across the **full** row (the first attempt
faded to `.06` exactly where `.dlg-note` lives, at `margin-left:auto`), `.dlg-t`
to the opaque `--ink`, `.dlg-note` to `--ink-2` + `--sh-text` at 9.5px, both
scrim layers ellipses (the first attempt's linear wash painted a visible
**rectangle** on a bright frame), and the preview dim `0.24 → 0.45`.

### B — three counting bugs, and every number was correct

Full diagnosis is in `f495553`'s message. Short version: the HUD prints *item
progress of the current objective*, the log row printed *objectives completed
over objective count*; both true, both rendered as a bare `x/y`. The row says
`Step 1/2` now. The header's `4` was the only term on the strip with no unit —
`k` is `Quests Active`. `0 gil` is suppressed in both copies of the reward line.
And a fourth, which the playtest could not have seen: the row list and detail
pane invalidate on `q.progress`, the fraction of objectives *done*, so picking up
the third Rusted Bit moves the objective counter and moves the cache key by
nothing — the log keeps saying `(2/3)` after the bag says 3 while the HUD
updates. `objSig` is in both keys now.

### C — stars are magnitudes, not sizes

Three causes, all in `src/shaders/sky.glsl.ts`:

- `radius = px * (1.15 + 2.4 * mag)` made a bright star three times **wider**, so
  every star was a disc 2.3–7.1 px across. Now `0.58 + 0.85 * mag`, near-constant
  at about a pixel; the postfx glare picks out the bright ones instead of
  smearing all of them.
- `pow(h.w, 4.0)` over `0.12 + 3.6 * mag` spans 31:1 with a floor already at
  saturation against a ~0.01 night sky, so every star printed the same white —
  which is exactly the critic's "uniform-magnitude dots". Now `pow(h.w, 7.0)`
  over `0.028 + 4.2 * mag`, 150:1.
- **Count.** Star pixel size here is fov-independent; count is not — a scale-44
  cell is ~40 px at 46° and ~102 px at 18°, which is why it looked fine in a
  tight crop and like weather at gameplay fov. `0.34/0.14/0.06/0.30` put ~2800
  dots in a 1600×900 frame against ~150 naked-eye stars in the same solid angle.
  Now `0.29/0.095/0.022/0.14` — the two sub-pixel layers cut hardest, because
  those were printing as texture. (First cut was `0.24/0.075`; **I looked, it
  read as empty**, and `BRIEF.md` asks for "the Eos starfield", so the two
  legible layers went back up a fifth.)

Moon: `uMoonBright` 3.4 computed a lit face of ~4.0 linear, so the maria, crater
speckle and phase falloff the shader goes to real trouble to compute were all
clipped to white. 1.55. The wide halo term reached `angRadius * 6` — an
eleven-degree glow the glare then doubled — now inside three moon-radii. With the
disc no longer clipped, `uMoonAngRadius` 0.031 → 0.042 buys the brief's "huge
moon" in surface detail rather than glare.

**Verified**: `tmp/l12f/final2/daycycle_night.jpg` and `vista_night.jpg` — a
scatter of clearly different magnitudes with tight cores and visible colour,
against `tmp/l12f/before/*` which is a uniform white blizzard.

### D — companions in the lens

Not bad luck: the slots are behind Noctis and so is the arm, at 2.5–3.5 m and
shorter wherever `CameraOccluders` finds a rock. Prompto's slot is 2.75 m back.
The camera is now one more separation obstacle in the machinery that already
keeps them off Noctis and off each other — `CAM_CLEAR = 2.4` against the
player's 1.30, `CAM_PUSH = 3.6` against 2.6, because unlike a companion it is a
lens.

`cullNearCamera` (`Player.ts`, called by `Player` and by `Party` for all four) is
the backstop. **It hides, it does not fade, and that is measured, not lazy:**
three's program cache key includes `parameters.opaque`
(`transparent === false && blending === NormalBlending && alphaToCoverage === false`),
so animating `material.transparent` recompiles every program the character
touches — the shape of the 9.5 s freeze LANDMINES records for toggling a light's
`visible`. Permanently transparent instead would move four skinned meshes into
the back-to-front bucket and sort hair against face. At 0.85 m the mesh fills the
frame, so the pop happens inside an object occupying every pixel.

## Not verified

- **D has no photograph of the failure or of the fix.** The mechanism is right
  and both halves typecheck, build and pass `uxcheck`/`integration`/`drawcheck`,
  but no frame in this lane shows a companion actually crowding the lens — the
  playtest saw it in live play and my probes pin the player. The instrument to
  build is a `--turbo` walk through a rock field logging min(camera, companion)
  distance per frame; `probes/camlook.mts` and `probes/fightcam.mts` (lane 12a)
  are the right shape to copy.
- **`CAM_PUSH = 3.6` is not tuned against anything.** It is one number above the
  player's 2.6, chosen because the camera matters more. If companions start
  visibly shying away from the player when he spins, that is this.
- Prompto does not reach his mark in the probe (6.7 m out, still moving at
  3.78 m/s after 400 frames). He is steering round the haven's plinth wall,
  which is the existing `body.avoid` behaviour, not something this lane changed —
  but a camp where one of three never arrives is worth one more look.

## Files owned and touched

Owned and edited freely: `src/shaders/sky.glsl.ts`, `src/world/Sky.ts`,
`src/ui/screens/QuestScreen.ts`, `src/ui/screens/HuntBoardScreen.ts`,
`src/game/interaction/interact.css.ts`, `src/game/interaction/Dialogue.ts`,
`src/game/rpg/HavenCamp.ts`, `src/characters/Party.ts`, `src/characters/Player.ts`,
`src/tools/_probe/l12f-camp.mts` (new).

**Cross-boundary, reported to the coordinator:**
`src/world/props/PropMaterials.ts`, `src/world/props/Landmarks.ts` and one line
of tint in `src/world/props/PoiKits.ts` are in the placeholder-props lane's
directory. Nothing that lane has touched (`RoadFurniture.ts`, `Rocks.ts`,
terrain) is in the diff, and the three material functions are self-contained.

**And one repair of somebody else's file that I did not commit:**
`src/world/terrain/TerrainMaterial.ts:851` had a backtick pair inside a
`/* glsl */` template literal, which ends the string — the whole tree failed
`tsc` and no lane could commit. I removed the two backticks from that comment in
the working tree and left the file uncommitted for its author, because an
explicit pathspec commits the *file*, not my hunk (LANDMINES). If they have
already committed, the change is theirs to keep or drop; it is two characters in
a comment. **I hit the identical trap four times in my own files.** It is worth a
LANDMINES entry of its own.

## Residue for `project/TASKS.md`

- **`poi_haven` shows almost none of its own subject.** It is a judged corpus
  shot paired against real FFXV camp plates, and at `pos [1002,56,-672]` /
  `target [962,45,-712]` the camp is a 40-pixel speck in the middle of a
  landscape. Every defect this lane fixed is invisible in it — before and after
  are indistinguishable. LANDMINES already has "a judged shot can clear almost
  none of its own subject"; this is that. `Shots.ts` has one owner and it was
  not me.
- **`haven_dusk` does not point at a haven.** `pos [-124,11.9,-72]`,
  `target [-99.6,9.7,-59.7]`; the frame is a black boulder and the Hammerhead
  forecourt 200 m off. Its doc says "the haven at last light: the rune lamps lit
  and the pan going cold behind it". Same owner.
- **`Quests.rewardsFor` has a dead multiplier.** `gil: Math.round((r.gil || 0) *
  (q.type === 'hunt' ? 1 : 1))` — a no-op ternary, while `mult` (the rank's
  `gilMult`) is computed and used only for `ap`. The doc comment says "with hunt
  rank scaling applied". Either the comment is wrong or every hunt underpays.
  Left alone deliberately: applying it changes economy balance, which is not this
  lane's item, and the playtest's complaint was the *formatting* of `0 gil`.
- **"3 available" advertises Lv26 content two regions away in chapter 2.**
  `Quests.refresh` makes any row with empty `requires` available with no chapter,
  region or level gate. Correct arithmetic, wrong offer.
- **Characters walk through the haven's plinth** (see Prompto, above) — the same
  class as lane 12a's "characters walk through boulders", already filed.
- **The starfield's four densities are now the only tuned numbers in the sky and
  nothing measures them.** A `starcount` probe — project the field, count blobs
  above a luminance in a fixed rect — would make the next change to this an A/B
  instead of an opinion.

## For `HUMAN_REVIEW.md`

- **The tent is khaki now, not slate.** `0x6d6350`, chosen against FFXV camp
  plates from memory rather than measured against one, because the contract
  forbids judged rounds during the build. If the art direction wants the tent
  dark, the moiré fix stands on its own and only the two `canvasClothMaterial`
  call sites need changing back.
- **The moon is 35% wider** (`uMoonAngRadius` 0.031 → 0.042). `BRIEF.md` asks for
  "a huge moon" and it is now a 4.8° disc — about ten times life size. That is a
  deliberate style call and it is one number.
- `daemon --health` reports **`paintedFaces: false`** and has for this whole
  session. None of `CANVAS_SOURCES` is in my diff, so another live lane
  invalidated it; I deliberately did **not** run `texbake --canvas --force`,
  because that would bake whatever half-finished rig state is in the shared tree
  for everybody. Somebody should, once the rig lane lands. `bakedGeometry` I did
  rebuild (`texbake --geo`, 15 keys, 26.4 MB, 27.9 s) because my
  `PropMaterials.ts` / `PoiKits.ts` edits are in `GEO_SOURCES`.

## Instruments left behind

`src/tools/_probe/l12f-camp.mts` — stands the player at `havens()[0]`, snaps the
retinue to formation first (otherwise it measures the teleport, not the
stationing), sets the hour through `DayCycle.setHour` (assigning `rpg.day.hour`
alone is silently undone), opens the camp and photographs approach / arrival /
menu / cook, reporting each companion's distance from its own mark.

It carries one hard-won correction. It originally looped until `_lineDone`,
which is true at the end of line **one**, so every capture of the A5 fix
photographed the 0.24 preview and read as *the change did nothing*. **An
instrument that stops one state short of the one you are fixing reports a
measured negative for a fix that worked** — and in this case the wrong frame was
also the frame that revealed the third cause.

Run it with `--set __L12F_HOUR=<h>`; 12.4 is the sunlit-sandstone case the
contrast complaint is about, 22.3 the night camp.
