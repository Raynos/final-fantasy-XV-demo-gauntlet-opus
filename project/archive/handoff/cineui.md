# Handoff — `agent/cineui`

Owned: `src/game/cinematics/**`, `src/game/story/**`, `src/ui/**`.
Branch `agent/cineui`, based on `main` @ `0be851f`. One commit: `870a4f5`.

Wound down early on coordinator instruction. Everything below is either
*verified by eye* or explicitly flagged as not.

---

## 1. The black cutscene sky — SOLVED, root cause proven, fix verified

**None of my three hypotheses was right.** It is not cloud-buffer
reprojection, not a NaN in `uCamAlt`, not a double `setTimeOfDay`. It is a
**state leak out of `Dungeons`**, and it is triggered by *shot ordering in a
full-corpus run*, which is why `tmp/shots/r4` had it and a targeted re-shoot of the
same commit does not.

### How I found it

`tmp/shots/r4` reproduced the defect; my own cold capture of the same six `cine_*`
shots at `0be851f` did **not** — full cloudscape, correct sky, every one. The
difference is that `r4` shot all 139 shots in `Shots.js` declaration order, and
the twelve `dun_*` dungeon shots sit **immediately before** `menu_title` and the
six `cine_*` shots.

Reproduced deterministically in two shots:

```bash
PORT=5390 node src/tools/shoot.mjs --out tmp/shots/x dun_keycatrich_hall cine_opening
```

`cine_opening` comes back with a pure-black sky, an over-bright ground and a
glowing sword — pixel-for-pixel the `r4` defect. `menu_title` shot after a
dungeon is black too.

Then the runtime bisect through `src/tools/daemon.mjs`'s `/eval` route (which had no
callers; it works exactly as advertised — `{fn: "<source>", arg}` on `PORT+1`).
I read `Sky`/`Dungeons`/camera/post state for `cine_opening` before and after a
dungeon shot:

| field | `cine_opening` cold | after `dun_keycatrich_hall` |
|---|---|---|
| `sky.dome.visible` | `true` | **`false`** |
| `sky.hours` / `weather` | 18.25 / clear | 18.25 / clear |
| `sky.ambient.intensity` | 0.518 | 0.518 |
| `sky.sun.intensity` | 4.972 | 4.972 |
| `scene.environmentIntensity` | 0.536 | 0.536 |
| `dungeons.state` / `_saved` | outside / null | outside / null |
| `sky.clouds.__dungeonStub` | false | false |
| camera pos / fov / near / far | finite | identical, finite |

**Exactly one value fails to restore: `sky.dome.visible`.** Everything else —
including the cloud-render stub, the ambient, the grade and the camera — comes
back correctly. That is why the ground is lit and only the sky is gone.

### The mechanism

`src/world/dungeons/Dungeons.js`:

- `sky.dome` is a **direct child of `game.scene`** (verified via `/eval`:
  `dome.parent === game.scene` is `true`; it is `scene.children[0]`).
- `_doEnter()` runs `_hideExterior()` **before** `_saveWorldLighting()`.
- `_hideExterior()` walks `scene.children` and sets `visible = false` on
  everything not in its keep-set — the dome included — recording it in
  `_hidden` (41 objects).
- `_saveWorldLighting()` then snapshots `domeVisible: sky.dome.visible`, which
  is **already `false`**. The snapshot is poisoned.
- On leave, `_restoreExterior()` correctly sets the dome back to `true`, and
  then `_restoreWorldLighting()` overwrites it with the poisoned `false`.

The dome stays hidden for the rest of the session. Every shot after the first
dungeon shot renders with no sky.

### The fix — one line, in a file I do not own

`src/world/dungeons/Dungeons.js`, `_doEnter()`, lines 215-217. Move the save
above the hide:

```js
// was
this._hideExterior();
this._patchTerrain();
this._saveWorldLighting();

// should be
this._saveWorldLighting();
this._hideExterior();
this._patchTerrain();
```

`_saveWorldLighting()` then records the dome's *real* visibility and hides it
itself; `_hideExterior()` skips it (it already `continue`s on `!c.visible`) so
it never enters `_hidden`; `_restoreWorldLighting()` puts it back correctly.

**Verified.** I applied it temporarily, re-ran
`dun_keycatrich_hall cine_opening cine_hammerhead`, looked at all three PNGs:
full cloudscape restored on both cutscenes, dungeon interior completely
unaffected (no sky bleed, same lighting). **Then I reverted it**, because
`src/world/**` is not mine — the file is clean on my branch. Apply it as-is.

An equivalent fix is to delete `domeVisible` from the `_saved` snapshot and the
`sky.dome.visible = false` line, letting `_hideExterior`/`_restoreExterior` own
the dome outright. The reorder is smaller.

> `--settle` was **not** the answer; the sky never recovers with more frames.
> Anyone re-testing this must use a dungeon shot *first* in the same page, or it
> will not reproduce and they will conclude it is fixed. That is the trap `r4`
> set.

---

## 2. Cutscene re-staging — done, verified by eye

Commit `870a4f5`. All framings looked at as PNGs, several rounds each.

### Infrastructure (`SceneKit.js`, `CameraMove.js`)

- **`townAnchor(ctx, name)`** — resolves `Town.anchors` (`garageBay`, `pump`,
  `pylon`, `caravan`, `regaliaBay`, `huntBoard`, `dinerDoor`, …).
- **`poiPoint(ctx, id)`** — resolves a `WorldMap` POI, terrain-snapped. The only
  honest way to locate a POI written as `at: 'n_longwythe'`.
- **`frameAt(ctx, siteType, opts)`** now takes `opts.origin` (a `Vector3` from
  either helper) and `opts.floor`, with the Ecology-site → `fallback` chain
  intact behind it. `opts.facing` accepts a `Vector3` as well as `[x, z]`.
- **`Frame.setFloor(y)`** — see gotcha §6.2.
- **`takeCar` / `releaseCar` / `aimCar`** — see gotcha §6.3.
- **`ots()`** — a dirty single, camera derived from the two actors.
- **`lowAngle()`** — camera at ~0.6 m, target above eye line, for silhouettes.

### `cine_hammerhead` — was bare highway 600 m from the town

Now staged on the **garage apron at Hammerhead**, frame anchored
`origin: townAnchor('garageBay')`, `facing: townAnchor('pump')`,
`floor: garageBay.y`. The Regalia is towed onto the bay for the scene. Cut is
now wide → front-on medium → dirty single → two-shot → low angle, all shot from
the pump side so the party faces the lens and the SERVICE shed, the canopy, the
mesa and Insomnia's skyline are the background.
`tmp/shots/cut-hh3/` holds all five set-ups.

### `cine_longwythe` — was the same roadside site, 1.1 km from anything named Longwythe

Now anchored on `poiPoint('longwythe_rest')` with the scene axis pointing
**away** from `poiPoint('longwythe_peak')`, so the 430 m horn stands behind the
party in every set-up. Sight line measured through `/eval`: over the full
1261 m nothing rises within 3.3 m of the line to the summit — it is genuinely
unobstructed. `tmp/shots/cut-lw/cine_longwythe_t0004.png` is the best frame either
cutscene has produced.

### `cine_astral` — NOT STARTED

Still staged at the `layby` Ecology site, which the biomes merge has since
turned into **dark closed-canopy forest**, plus a black slab occluding the left
~22% of frame (camera clipping a trunk). Everything needed to fix it is
measured and in §5.

---

## 3. Map screens, BLINDSIDE, UI type pass — NOT STARTED

Zero work done on any of these. `src/ui/**` is **untouched** on this branch.

- `menu_map_wide` / `menu_world`: **no `map_wide` screen was registered.** The
  `Shots.js` edit the coordinator was going to make (`menu: 'map'` →
  `menu: 'map_wide'`) **must NOT be applied yet** — it would point at a screen
  that does not exist. Hold it until someone implements §5.3.
- BLINDSIDE doubling: **not fixed.** None of the three compounding causes
  addressed. Diagnosis stands and is written up in §5.4.

---

## 4. Gate status (run on the committed tree)

| gate | result |
|---|---|
| `pnpm exec vite build` | **pass** (also passed via `.githooks/pre-commit`) |
| `node src/tools/integration.mjs` | **18 pass · 0 wired · 0 not integrated** |
| `node src/tools/orphans.mjs` | **260/261 reachable** — 1 orphan, `src/world/map/MapRaster.js`, **pre-existing** (introduced by `5fd2876` "Cartography"; nothing has ever imported it). Not caused by this branch. |
| `node src/tools/uxcheck.mjs` | **86/86**, 0 failures. Unchanged — no screen was registered. |
| `src/tools/shoot.mjs` on `cine_hammerhead cine_longwythe cine_opening` | 0 console errors, 891 / 485 / 579 draw calls |

---

## 5. Exact next steps, in priority order

1. **Apply the `Dungeons.js` line reorder in §1.** One line, verified, fixes a
   black sky in ~7 shots of every full-corpus run. Highest value in this
   document by a wide margin.
2. **Fix `cine_opening`'s invisible car** — see §6.3. `Opening.js` moves
   `Props.regalia`, which the vehicle sim hides at init, so the opening
   cutscene is four men pushing empty air with the real car parked 40 m up the
   road. `SceneKit.takeCar()` already exists and solves it; `Opening.js` just
   needs to call it in `stage()` and `releaseCar(ctx)` in `onEnd()` alongside
   its existing `restoreCar` (which can then be deleted). ~10 lines, mine, not
   done.
3. **`cine_astral`.** Re-anchor it out of the forest and onto the **Disc of
   Cauthess crater floor**, which I measured and which is spectacular. Profile
   from the crater centre outward along the `disc_overlook` bearing:

   | distance from centre (m) | 0 | 150 | 250 | 350 | 450 | 550 | 700 | 850 | 1000 |
   |---|---|---|---|---|---|---|---|---|---|
   | ground height (m) | 253 | 58.6 | 5.4 | 3.1 | 3.7 | 9.8 | 146 | 269 | 165 |

   The crater floor at 300-500 m out is **flat at 3-4 m** while the meteor mass
   rises to 253 m at the centre and the rim to 269 m at 850 m. Stage at
   `(-1122, -1752)` (420 m out on the overlook bearing, terrain 3.5 m): the Disc
   subtends ~31° of elevation 420 m away and the rim wall rings the horizon.
   Frame axis should point *at* the crater centre `(-1020, -2160)` for the awe
   beats and away from it for the faces. Use
   `poiPoint(ctx, 'disc_cauthess')` — do not hard-code.
   Also reconcile the weather: `Shots.js` says `storm`, the scene sets
   `overcast`, and the scene wins. Pick one (recommend `storm` in the scene).
4. **`map_wide` / `world` screens** — nothing started; the plan in
   `~/.claude/plans/logical-finding-flute-agent-a989bbdcd901fa36e.md` §3 is
   still the right design and the measurements in it were verified from source:
   `BOX` is 1520×676 css px, `WORLD.size` is 8192 m, so fitting the continent
   needs ≤ 0.0825 px/m and the coarsest `ZOOMS` step is 0.118 — a new fit-all
   step is required. `_regionLabels()` fades out above 0.205 px/m, which is why
   region names never appear.
5. **BLINDSIDE doubling** (`src/ui/ui.css:349` `.callout .co-word`,
   `src/ui/CombatHUD.js:476`). Three compounding causes, none addressed:
   fractional `transform: scale(1.14 → 1.0)` forces a rasterise-and-resample of
   the glyph layer; `translate(-50%,-50%)` on an odd-width box lands it off the
   pixel grid; and `text-shadow: 0 2px 10px rgba(0,0,0,.85)` reads as a second
   offset copy over bright desert. Drive the punch from `letter-spacing` +
   `opacity` only, snap the box to integer pixels, and make the shadow a tight
   symmetric halo. **Project rule: no CSS transitions or keyframes in
   `src/ui` — animate per frame from `game.time`, or deterministic captures
   break.**
6. **Combat rail over the field party panel** in `combat_wide` — the ability
   rail (DAWNHAMMER / REGROUP / STARSHELL) draws straight over the party
   panel's HP numbers. One owner for that corner.
7. Type/panel pass across `menu_*` / `hud_*`. `menu_main` is the worst: nav and
   info column float on the terrain with no plate, 9 px sub-labels, and four
   saturated orange/purple/olive portrait cards where FFXV's are near-monochrome.

---

## 6. Gotchas and dead ends — read this section

### 6.1 The black sky does not reproduce unless a dungeon shot ran first
Covered in §1. A targeted re-shoot of the `cine_*` shots on a fresh page looks
perfect. I nearly filed "cannot reproduce, fixed upstream" on that basis. The
ordering dependency is the whole bug.

### 6.2 Hammerhead's apron is 3.2 m above `Terrain.heightAt`
Measured: `Town.base` is **16.15**; `Terrain.heightAt` at the town origin, the
regalia bay, the garage bay and the pumps returns **12.5-13.4**. The town grades
a pad and builds on it. Anything staged there and snapped to the heightfield —
actors, cameras, cars — ends up *under the tarmac*, invisible. That is why
`Frame.setFloor()` exists now. `arrange()` also stops passing `snap = true` to
`stage.place()` when the frame has a floor, for the same reason.

Corollary: `frameAt` sets `origin.y` to the floor too, not just `ground()`.
I lost a round to the car being placed with `F.at()` (origin-relative, terrain
height) while the actors used `F.ground()` (floor height) — the car was buried
and I thought `takeCar` had failed.

### 6.3 There are TWO Regalias and the one scenes move is invisible
`Props.regalia` (`src/world/Props.js:118`, named `regalia_root`) is the static
prop. `RegaliaSystem` (`src/world/vehicle/RegaliaSystem.js:152-155`) sets
`props.regalia.visible = false` **at init** and builds its own drivable
`this.root`, writing its transform from `body.pos` every frame in `update()`.

So: moving `Props.regalia` moves an invisible object, and setting
`RegaliaSystem.root.position` is overwritten on the next tick. Confirmed via
`/eval`: `propRegalia.visible === false`, `sysRegalia.visible === true`.

`SceneKit.takeCar()` handles it — shows the prop, hides the sim's root so there
is never a duplicate in shot, and `releaseCar()` restores both. `Opening.js`
still has the old broken pattern (see §5.2).

There is also `SHOT_STAGES` in `RegaliaSystem.js:663` — a per-shot staging table
keyed by shot name. That is the *world owner's* lever for parking the drivable
car for a named shot, and is probably the better long-term answer for the
`cine_*` shots than borrowing the prop.

### 6.4 `Cinematics.seek()` only walks forward
`src/game/cinematics/Cinematics.js:181` — `while (this.tl.t < t)`. It cannot
rewind. `Game.applyShot` parks a story shot at `spec.at`, so seeking to any
earlier beat silently does nothing and you get the same frame back believing
you sampled five different set-ups. I lost a round to this.

To review a whole cutscene you must `cine.stop()` → `cine.play(def)` →
`cine.seek(t)` for each time. The live scene def is `cine.scene`, **not**
`cine.def`.

### 6.5 A cutscene review harness, via `/eval`
There is no screenshot-after-eval daemon route, but
`renderer.domElement.toDataURL('image/png')` called synchronously after
`g.settle(n)` works fine (no `preserveDrawingBuffer` needed). Combined with 6.4
that gives a five-frames-of-a-cutscene contact sheet in one round trip, which is
how §2 was actually iterated. It captures the canvas only — DOM letterbox,
subtitles and HUD are absent, so use `shoot.mjs` for the final look. Worth
promoting into `src/tools/`.

### 6.6 An over-the-shoulder is not available on a line-up
All four face up-frame, so a camera placed on the near/far *axis* just ends up
in front of the near man's face — my first `ots()` produced a clean single of
the wrong actor. The version that works puts the camera up-frame of the near
man and laterally *past* him away from the subject, so the sightline clips his
shoulder. Also check the third actor is not sitting on that sightline: my first
Gladio→Ignis attempt put Noctis almost exactly on the line and he occluded the
subject entirely.

`focus: '<actorId>'` at f/2.2 is unreliable for this — the near shoulder ends up
sharp instead. `ots()` now defaults `focus` to the **computed metre distance**
to the subject.

### 6.7 Shoot from the sun side
`cine_hammerhead` at `camL: +8.8` was blown out and every face was in shadow; the
same set-up at `camL: -8.4` is correctly keyed. `Opening.js` already solves this
properly — it derives `side` from `sky.sun.position` at stage time
(`Opening.js:96-104`). The three re-staged scenes still pick a side by hand and
would break if the shot time changed. Worth generalising into `SceneKit`.

### 6.8 Dead ends, so nobody repeats them
- `--settle 200` on a black-sky frame: no change. Not temporal.
- Camera `pos/fov/near/far` for NaN on a black-sky frame: all finite and
  identical to the good frame. Not the `spec.at ?? 6` class of bug.
- `sky.clouds.__dungeonStub`, `hours`, `weather`, `exposure`, `autoGrade`,
  `ambient`, `environmentIntensity` after a dungeon: all restore correctly.
  Only the dome fails.

---

## 7. Cross-boundary items — file and line

1. **`src/world/dungeons/Dungeons.js:215-217`** — the one-line reorder in §1.
   Verified fix for the black cutscene sky. **Apply this.**
2. **`src/game/Shots.js:218-222`, `menu_map_wide`** — the planned
   `menu: 'map'` → `menu: 'map_wide'` edit **must not be applied yet**; the
   `map_wide` screen was never registered (§3). It would point at nothing.
3. **`pos` / `target` for the `cine_*` shots: no change needed.** All three
   re-staged scenes resolve their own frame from live world anchors and win the
   lens through `Cinematics`. `pos: [0,0,0]`, `target: [0,0,0]` keeps working
   for `cine_hammerhead`, `cine_longwythe`, `cine_astral`. Do not add
   coordinates to `Shots.js` for these.
4. **`src/world/map/WorldMap.js:249`** — the `hammerhead` POI is written
   `at: 'n_hammerhead'` and resolves to **(60, 18)**, but the town Hammerhead
   actually builds itself on the `reststop` Ecology site at **(576, 10)** —
   `Town.origin` is `(576.2, 16.2, 10.0)`. The map pin and the built town are
   **516 m apart**. Not verified as a *visible* defect, but the fast-travel
   target, the discovery radius and the minimap label are all on the wrong
   spot. Map is the coordinator's.
5. **`src/world/town/Hammerhead.js`** — a **blue pickup truck floats in mid-air**
   inside the garage bay, roughly 2 m off the deck. Clearly visible in
   `tmp/shots/cut-hh3/cine_hammerhead_t0014.png` and `_t0042.png`, and in
   `tmp/shots/cu-ref/town_regalia_bay.png` on `main`, so it predates this branch.
6. **`src/game/story/TitleScreen.js` / `src/ui/Subtitles.js`** (mine, not done)
   — `menu_title` captured after a `cine_*` shot still shows the previous
   scene's subtitle ("For the record, nobody was listening.") burned over the
   title card. Visible in `tmp/shots/cu-seq/menu_title.png`. Subtitles are not
   cleared when a scene is stopped by a new shot.

---

## 8. Where the images are

`tmp/shots/` is gitignored; these exist in the worktree only.

| dir | what |
|---|---|
| `tmp/shots/cu0/` | baseline at `0be851f`, 13 shots |
| `tmp/shots/cu-seq/` | **the black-sky reproduction** — dungeon, then cutscenes |
| `tmp/shots/cu-fix/` | the same sequence with the `Dungeons.js` fix applied — sky restored |
| `tmp/shots/cu-ref/` | town / zone backdrops used to choose the staging |
| `tmp/shots/cut-hh3/` | all five Hammerhead set-ups, final |
| `tmp/shots/cut-lw/` | all five Longwythe set-ups |
| `tmp/shots/cu-final/` | committed state through `shoot.mjs`, letterbox and subtitles included |
