# Handoff — `agent/ui`

Owned: `src/ui/**`, `project/handoff/ui.md`.
Scope: `project/RESCUE.md` §B5 (combatloop 21/30) and §B10 (all UI work).

Every claim below is either **verified by eye at capture** or explicitly flagged as not.

---

## 0. Gate status

| gate | result |
|---|---|
| `npx vite build` | **pass** (every commit, via `.githooks/pre-commit`) |
| `node src/tools/combatloop.mjs` | **30/30** (was 21/30) |
| `node src/tools/uxcheck.mjs` | **89/89, 0 failures** — was 86/86. The three new checks are `Tab`/`Backspace`/`Escape` close on the newly registered `map_wide` screen; uxcheck audits every registered screen, so the count grows by three whenever one is added. No check regressed. |
| `node src/tools/integration.mjs` | **18 pass · 0 wired · 0 not integrated** |

`npm run check` / `src/tools/check.mjs` does not exist in this worktree — it landed
on `main` after this branch was cut. The four gates above were run individually.

---

## 1. ⚠️ THREE CROSS-BOUNDARY ITEMS — read this first

Each is **verified by applying it temporarily, capturing, looking, and reverting**.
The working tree is clean of all three.

### 1a. `src/game/cinematics/Cinematics.js` — the subtitle that burns into every later shot

**This is the one the coordinator flagged, and it is not in `src/ui`.**

The line is drawn by **`Letterbox`** (`#cine .cine-line`), which is deliberately
separate from the HUD's `Subtitles` because the HUD hides wholesale during a
cutscene (`Letterbox.js:10-14` says so). `Letterbox.clearLine()` exists at
`Letterbox.js:151`. `Cinematics.skip()` calls it. **`Cinematics.stop()` does
not** — it resets the bars and the fade and leaves the line up. So any scene
stopped by a new shot leaves its last line on screen for the rest of the page.

The fix is one line, in `Cinematics.stop()`, immediately before `this.box.setBars(0);`
(currently `Cinematics.js:161`):

```js
    this.box.clearLine();
    this.box.setBars(0);
    this.box.setFade(0, def && def.closeFadeOut ? def.closeFadeOut : 0.9);
```

**Verified on both reproductions:**

| repro | before | after |
|---|---|---|
| `shoot.mjs cine_opening menu_title` | "For the record, nobody was listening." across the title card (`tmp/shots/uisub2`, `uisub4`) | clean (`tmp/shots/uisub5/menu_title.jpg`) |
| `shoot.mjs cine_astral zone_malmalam` (the coordinator's) | "PROMPTO / The ground — the ground is moving, the ground is actually—" over the canopy (`tmp/shots/uisub6`) | clean (`tmp/shots/uisub7/zone_malmalam.jpg`) |

`cine_opening` itself still carries its own line with the fix applied
(`tmp/shots/uisub5/cine_opening.jpg`) — `stop()` runs when the scene ends, not
while it plays, so nothing is lost.

**No call-site wiring is needed for the HUD side.** I added `Subtitles.clear()`
anyway (see §5) and it is safe to call, but the HUD subtitle stack now retires
its own stale lines without help, so `StorySystem.applyShot` does not need to
call anything.

### 1b. `src/game/Shots.js:220` — the `map_wide` go-ahead

**`map_wide` now exists.** `menu_map_wide` may be repointed:

```js
  menu_map_wide: {
    doc: 'The atlas of Lucis fully surveyed, all 124 points shown',
-   time: 17.0, weather: 'clear', follow: 'player', hud: true, menu: 'map',
+   time: 17.0, weather: 'clear', follow: 'player', hud: true, menu: 'map_wide',
```

Captured with that edit applied and reverted: `tmp/shots/uimap5/menu_map_wide.png`.
`menu_world` is unaffected — the atlas is a second instance and **does not touch
the shared fog mask**, so there is no capture-order dependency between them (§3).

### 1c. `src/tools/combatloop.mjs` — landed, but outside my declared ownership

Commit **`e7f0ad7`** is a two-tap edit to `src/tools/combatloop.mjs`. It is
deliberately its own isolated commit so it can be reverted or cherry-picked
alone. Rationale in §2 — the game was never broken.

---

## 2. `combatloop.mjs` 21/30 → 30/30 · commit `e7f0ad7`

**Root cause: one stale line in the test. Nothing in `src/ui` needed to change.**

Commit `4693e3f` ("UX: kill the dead menu rows...") introduced a deliberately
collision-free keymap and moved the companion techniques from **G/H/J to G/J/K**
so that **H** could open the controls card. Three places agree on G/J/K:

- `src/characters/ai/PartyAI.js:437-439` — `KeyG` / `KeyJ` / `KeyK`
- `src/ui/screens/ControlsScreen.js:37-39` — the printed keymap says G / J / K
- `src/tools/uxcheck.mjs:243-250` — *positively asserts* that `KeyH` opens and
  closes the controls card

`combatloop.mjs:433-436` was never updated. Its technique check still tapped
`KeyH`, which opened the controls screen; nothing in the run ever closed it,
`Menus._pointerLock` (`Menus.js:238`) then set `input.enabled = false`, and
**every later check that needs a key press failed.** That is exactly the
`menuOpen=true menusA=1.00 menu=controls` diagnostic the nameplate check printed,
and it explains the shape of the failure list precisely: the first failure is
check 12, everything after it that needs input fails, everything after it that
calls a system method directly still passes.

Two taps repointed at the shipped bindings. **30/30.**

> There is a lesson here for the rescue ledger: `SESSION-STATE.md` recorded 30/30
> at an earlier point and this was read as a regression in the game. It was a
> regression in the *test*, introduced by a deliberate, documented, correct
> keymap change. The nine "failures" were one keystroke.

---

## 3. `map_wide` — the atlas of Lucis · commit `7f7b268`

`src/ui/screens/WorldMapScreen.js`, `src/ui/Menus.js`.

**A fit-all zoom step had to be invented.** `ZOOMS[0]` was `0.118` px/m and its
comment claimed it fitted the continent; it does not. `WORLD.size` is 8192 m and
the sheet is 1520×676, so fitting needs `676 / 8192 = 0.0825` px/m — **height**
binds, width would allow 0.1855. At 0.118 the field is 967 px tall in a 676 px
box. Added `0.0825` as step 0 and named the chart's home scale `HOME_ZOOM = 3`
so `menu_world` opens at exactly the scale it did before.

`map_wide` is the same class with `{ atlas: true }`:

- **Fully surveyed without touching the fog.** The mask is shared with the
  minimap and the ordinary chart, so `fog.revealAll()` would have made
  `menu_world` depend on whether `menu_map_wide` was captured first — the exact
  order-dependence `BRIEF.md` rule 2 forbids. The atlas *reads* the survey as
  complete through one `_known()` predicate and skips the haze blit. All 124
  points plot with their real glyph, name and type colour; the read-out says
  100.0 %.
- **A square sheet.** Lucis is square; 676×676 inside a 1520-wide frame leaves
  422 px of blank paper either side and reads as a printing error. `ATLAS_BOX`
  hugs the landmass, which also puts the filter rail, the sheet and the detail
  card on three even columns. The rail/card/scale/survey footprints are no
  longer reserved in the label placer for this variant, because on the atlas
  they sit outside the canvas entirely.
- **Region names finally appear.** They fade out above 0.205 px/m so they were
  never visible at the old home scale of 0.26. Three names over an 8192 m field
  also land within ~50 px of each other and each block is ~52 px tall, so the
  second printed through the first's sub-line: centroids are now area-weighted,
  the reservation covers the wider of name and sub, and a colliding name steps
  along the vertical before giving up (headline type wins a collision it cannot
  dodge).
- POI names the sheet edge would slice in half are dropped ("…ATOGH").

Shots: `tmp/shots/uimap5/menu_map_wide.png` (final), `uimap/` → `uimap4/` (the
iterations). See §1b for the `Shots.js` go-ahead.

---

## 4. BLINDSIDE doubling · commit `66563e1`

`src/ui/ui.css` `.callout`, `src/ui/CombatHUD.js:_updateCallout`.
All three compounding causes were present at once:

1. `.co-word` ran a fractional `transform: scale(1.14 → 1.0)` per frame, which
   promotes the glyph layer to its own raster and resamples it. **Removed** —
   the punch is letter-spacing plus opacity, still written per frame from the
   clip's own time. **No CSS transition or keyframe was added anywhere.**
2. `left:50%` + `translate(-50%,-50%)` on an odd-width box put the composited
   layer on a half pixel. The box is full-bleed and centred by `text-align`,
   `top` is a rounded integer, and the rule's animated width is snapped to an
   even number so `margin:auto` cannot land on a half pixel either.
3. `text-shadow: 0 2px 10px rgba(0,0,0,.85)` is an *offset* copy — over sand it
   reads as a second, darker set of glyphs 2 px low. Replaced with a tight
   symmetric halo.

The sub-line was 9px `--ice` over sunlit sand and effectively unreadable; it is
9.5px/500 at `#e9f3ff` on the same halo, and the word's left padding tracks the
animated letter-spacing so it stays optically centred instead of drifting.

Before/after at 3×: `tmp/shots/ui0p/callout.png` vs `tmp/shots/ui2p/callout.png`.

---

## 5. Subtitles own their shot · commit `a6d701e`

`src/ui/Subtitles.js`, `src/ui/HUD.js`.

Every line and banter bubble is stamped with `game.currentShot` when spoken;
anything whose stamp no longer matches the live shot is dropped on the next
update. Stamping at *say* time rather than clearing on the transition is what
keeps cutscenes working — `Game.applyShot` sets `currentShot` before it seeks the
timeline, so a beat that fires during the seek is already stamped with the new
shot. In ordinary play `currentShot` is always `null` and the whole mechanism is
inert.

**The API the coordinator asked for exists: `Subtitles.clear()`** — empties the
current line, sets `.subs` opacity to 0, and removes every banter bubble.
`HUD.resetDemo()` uses it. **It does not need wiring from `src/game/**`**; the
stamp check retires stale lines on its own. The frame the coordinator actually
saw is `Letterbox`, not this — see §1a.

---

## 6. One owner for the bottom-left corner · commit `9b75ded`

`src/ui/PartyPanel.js`, `src/ui/CombatHUD.js`, `src/ui/Toasts.js`, `src/ui/HUD.js`, `ui.css`.

Four things live down there: the Armiger gauge, the technique rail, the toast
column and the party stack. Three were parked at hand-measured `bottom:` offsets
(434 / 276 / 30 px) while the fourth grew inside the same bottom-anchored box —
so the toast column, the only one whose height is not known in advance, grew
straight up through the DAWNHAMMER / REGROUP / STARSHELL rail.

Measured at 1600×900 with five toasts alive:

| | before | after |
|---|---|---|
| `.techs` | 501–624 | 330–454 |
| `.toasts` | 488–646 | 488–646 |
| `.party` | 664–870 | 664–870 |
| verdict | **techs × toasts OVERLAP** (136 px) | all clear |

The party stack is on the same scanline in both (lead HP value at y 835–851), so
nothing moved that a shot depends on. `PartyPanel` now owns the corner and hands
out `combatSlot` and `noticeSlot`; flow keeps the four apart instead of
arithmetic. The rail collapses itself out of the flow when combat ends and
multiplies in the combat layer's own fade, since it is no longer a child of it.

The measurement harness is `tmp/uiprobe.mjs` (throwaway, tmp is disposable).

---

## 7. Type and panel pass · commits `61eadbd`, `d147f53`

**The offset drop shadow was a project-wide version of the BLINDSIDE bug.**
`--sh-text` was `0 1px 2px rgba(0,0,0,.72)`, and under 8–10 px pale type that is
a second darker copy of the glyph one pixel low — the coordinator independently
spotted the ability-rail labels ghosting in `combat_wide`. Both shadow tokens are
now centred rings, which fixes the whole class in one place and gains contrast
over bright Leide as a side effect.

- **Technique rail**: `.tk-ow` had *no shadow at all* (8px `--ink-3` over scrub,
  unreadable) → 8.5px `--ink-2` on the halo. The rail also narrows from 300 to
  232 px: five stacked white hairlines of the same length read as one panel,
  which is why the rail kept being mistaken for part of the party's HP block.
- **`menu_main`**: nav and info columns now sit on a soft directional wash off
  their screen edge — a scrim, not a panel. Every 8.5px key/caption (`.mr-d`,
  the stat keys, the tracking block, the card levels) was pale ink with no
  shadow; they are 9px on the halo, one step brighter, and no longer wrap.
- **Portrait cards** were 26–30 % saturation. At HUD size they are 38px chips,
  but the pause menu blows them to 112×132 and the four read as an
  orange/purple/olive swatch strip. FFXV's are almost grey with a breath of the
  character's colour in the shadow: **8–11 %** (`Icons.js portrait()`).
- **Menu scrim** centre 0.62 → 0.74 opaque. That is where every screen puts its
  type, and the terrain behind was bright enough to compete with a 9px label.

Shots: `tmp/shots/ui6p/menu_main.jpg`, `ui6p/combat_wide.jpg`,
`ui5p/leftcol.png` (2×), `ui8p/menu_inventory.jpg`.

---

## 7b. The corner is finished, and the atlas's type sits on top · `5b14954`, `6d1002f`

- **Banter joins the column.** The bubbles were the last thing in the bottom-left
  still pinned to a hand-measured `bottom: 268px`, which is 33 px above the party
  stack — exactly where the toast column grows. Measured at 1600×900 with three
  toasts and one banter line: before, **banter × toasts OVERLAP**; after, every
  pair in the corner clear. `PartyPanel` hands out a `banterSlot`; `Subtitles`
  takes it as an optional third argument and falls back to the stylesheet's
  absolute placement without it. Shot: `tmp/shots/ui9p/leftcol.png` at 2×.
  Also: the party panel's `/ max` HP figure went `--ink-3` → `--ink-2`.
- **Atlas region names paint over the glyphs.** The type pass runs before the
  glyph pass, so a settlement symbol landed in the middle of the word LEIDE. The
  names cannot simply move later — the zone and route labels need their boxes
  reserved *first*. `_regionLabels` is now a measure pass and a paint pass; the
  atlas reserves early and paints after `_pois`, the ordinary chart still does
  both in one call and is byte-identical. Shot: `tmp/shots/uimap7/regions.png`.

---

## 8. What is left

Ordered by value.

1. **Apply §1a and §1b.** Both are verified, both are one line, both are outside
   `src/ui`. §1a is poisoning every full-corpus run today.
2. **`MapScreen` (`menu_map`) is 22 lines** and was not looked at in this pass.
   `menu_map` and `menu_map_wide` now point at very different-quality screens.
3. **The remaining `menu_*` screens** got the type pass by inheritance (the two
   shadow tokens) but no layout attention: `menu_gear`, `menu_quests`,
   `menu_archives`, `menu_ascension`, `menu_shop`, `menu_hunts`. `menu_inventory`
   was spot-checked and reads correctly.
4. **`--ink-4` is probably still too faint** at 8–9 px in the HUD — the `L1+□`
   key column in the technique rail is legible but only just. Worth measuring
   against a bright frame rather than guessing.
5. **A couple of point glyphs still overprint the atlas's region names.** They
   are under semi-transparent headline type now rather than over it, so it reads
   as a survey sheet rather than as a bug; reserving the glyph footprints before
   the type pass would finish it.

## 9. Files touched

```
src/ui/CombatHUD.js          callout rewrite, corner slot, layer fade
src/ui/HUD.js                corner slots, Subtitles gets `game`
src/ui/Icons.js              portrait() desaturated
src/ui/Menus.js              map_wide registered + its footer set
src/ui/PartyPanel.js         owns the bottom-left corner
src/ui/Subtitles.js          shot stamping + clear()
src/ui/Toasts.js             lives in the corner's notice slot
src/ui/screens/MainScreen.js one hint shortened
src/ui/screens/WorldMapScreen.js  fit-all zoom, the atlas variant, label ordering
src/ui/ui.css                shadow tokens, corner column, callout, menu_main, scrim
src/tools/combatloop.mjs     keymap (OUT OF SCOPE — isolated commit e7f0ad7)
```

## 10. Where the images are

`tmp/shots/` is gitignored; these exist in this worktree only.

| dir | what |
|---|---|
| `ui0/`, `ui0p/` | baseline before any change (`ui0p/callout.png` = the doubling, 3×) |
| `ui2p/` | callout after the fix, 3× |
| `ui3p/`, `ui5p/`, `ui6p/`, `ui8p/`, `ui9p/` | corner rework, type pass, menu pass, banter in flow |
| `uimap/` … `uimap7/` | the atlas, first attempt through final (`uimap7/regions.png` = the label ordering) |
| `uisub2/`, `uisub4/` | the subtitle burn-in, reproduced |
| `uisub5/`, `uisub7/` | the same two pairs with §1a applied — clean |
| `uisub6/` | the coordinator's `cine_astral` → `zone_malmalam` repro |
